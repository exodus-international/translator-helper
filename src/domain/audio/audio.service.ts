import prisma from '@/lib/db';
import { isAudioStorageConfigured } from '@/lib/audio-storage-config';
import { putObject } from '@/lib/object-storage';
import { AudioStatus, type AudioFile } from '@prisma/client';
import { createActivityLog } from '../activity-log/activity-log.repository';
import { resolveAudioObjectKey } from './audio.paths';
import {
  claimAudioFileForProcessing,
  createAudioFile,
  getAudioFileById,
  markAudioFileFailed,
  markAudioFileReady,
  releaseAudioFileToPending,
  setAudioFileJob,
} from './audio.repository';
import { audioSkipReason, formatAudioError, type AudioErrorKind } from './audio.rules';
import { markdownToSpeechScript } from './audio.script';
import { DEFAULT_PROSODY, speechScriptToSsml } from './audio.ssml';
import { AUDIO_CONTENT_TYPE, type AudioGenerationOutcome } from './audio.types';
import { getSpeechProvider } from './providers/speech-provider';
import type { SynthesisResult } from './providers/speech-provider';

const LOG_PREFIX = '[Audio]';

/**
 * Creates an audio record for a document version and hands the synthesis to
 * the language's provider. Never throws: configuration gaps come back as
 * `skipped`, everything else as `failed`, so a status transition is never
 * blocked by audio.
 */
export async function startGeneration(
  documentVersionId: string,
  userId: string,
  options: { trigger?: 'approval' | 'regeneration' } = {},
): Promise<AudioGenerationOutcome> {
  const version = await prisma.documentVersion.findUnique({
    where: { id: documentVersionId },
    include: { document: { include: { sourceProject: true } }, language: true },
  });
  if (!version) return { status: 'failed', error: `Document version not found: ${documentVersionId}` };

  const skip = audioSkipReason({
    language: version.language,
    document: version.document,
    storageConfigured: isAudioStorageConfigured(),
    providerConfigured: (provider) => getSpeechProvider(provider).isConfigured(),
  });
  if (skip) {
    console.log(`${LOG_PREFIX} skipping generation for ${documentVersionId}: ${skip}`);
    return { status: 'skipped', reason: skip };
  }

  const { language, document } = version;
  const provider = getSpeechProvider(language.audioProvider!);
  const voice = language.audioVoice!;

  const audioFile = await createAudioFile({
    documentVersionId,
    provider: provider.id,
    voice,
    sourceVersion: version.version,
    triggeredByUserId: userId,
  });
  await createActivityLog({
    documentVersionId,
    userId,
    action: options.trigger === 'regeneration' ? 'audio_regeneration_requested' : 'audio_generation_started',
    details: { audioFileId: audioFile.id, voice },
  });

  // Anything thrown before the provider is asked is our problem (content or
  // setup), anything after is the provider's. The kind is stored with the
  // message so the card can word the two differently.
  let phase: AudioErrorKind = 'content';
  try {
    const script = markdownToSpeechScript(version.content);
    if (!script.segments.some((s) => s.kind === 'text')) {
      throw new Error('The document has no readable text after stripping Markdown');
    }
    const ssml = speechScriptToSsml(script, {
      voice,
      locale: localeFromVoice(voice),
      maxBreakMs: provider.maxBreakMs,
      ...DEFAULT_PROSODY,
    });

    phase = 'provider';
    const outcome = await provider.submit({ jobId: jobIdFor(audioFile.id), ssml });
    if (outcome.kind === 'result') {
      // Synchronous provider: finish in the same call.
      await claimAudioFileForProcessing(audioFile.id);
      await complete(audioFile, outcome.result, { document, languageCode: language.code });
    } else {
      await setAudioFileJob(audioFile.id, outcome.jobId);
    }
    return { status: 'success', audioFileId: audioFile.id };
  } catch (error: unknown) {
    const message = errorMessage(error);
    console.error(`${LOG_PREFIX} generation failed for ${documentVersionId}:`, message);
    await fail(audioFile, formatAudioError(phase, message));
    return { status: 'failed', error: message };
  }
}

/**
 * Moves one record forward: polls the provider, and on success uploads the
 * audio and marks the record READY. Idempotent and safe to call from several
 * places at once; only the caller that claims the PENDING row does the work.
 */
export async function advanceJob(audioFileId: string): Promise<AudioFile | null> {
  const audioFile = await getAudioFileById(audioFileId);
  if (!audioFile) return null;
  if (audioFile.status === AudioStatus.READY || audioFile.status === AudioStatus.FAILED) return audioFile;
  if (!audioFile.providerJobId) {
    return fail(audioFile, formatAudioError('configuration', 'No provider job was recorded for this generation'));
  }

  const claimed = await claimAudioFileForProcessing(audioFileId);
  if (!claimed) return audioFile; // someone else is on it

  try {
    const outcome = await getSpeechProvider(audioFile.provider).poll(audioFile.providerJobId);
    if (outcome.kind === 'running') {
      await releaseAudioFileToPending(audioFileId);
      return getAudioFileById(audioFileId);
    }
    if (outcome.kind === 'failed') {
      return fail(audioFile, formatAudioError('provider', outcome.message));
    }

    const version = await prisma.documentVersion.findUnique({
      where: { id: audioFile.documentVersionId },
      include: { document: { include: { sourceProject: true } }, language: true },
    });
    if (!version) throw new Error('Document version disappeared while audio was generating');
    try {
      return await complete(audioFile, outcome.result, { document: version.document, languageCode: version.language.code });
    } catch (error: unknown) {
      const message = errorMessage(error);
      console.error(`${LOG_PREFIX} storing ${audioFileId} failed:`, message);
      return fail(audioFile, formatAudioError('configuration', message));
    }
  } catch (error: unknown) {
    const message = errorMessage(error);
    console.error(`${LOG_PREFIX} advancing ${audioFileId} failed:`, message);
    return fail(audioFile, formatAudioError('provider', message));
  }
}

async function complete(
  audioFile: AudioFile,
  result: SynthesisResult,
  ctx: {
    document: { type: import('@prisma/client').DocumentType | null; originalFilename: string | null; slug: string; sourceProject: { identifier: string | null } | null };
    languageCode: string;
  },
): Promise<AudioFile> {
  const relativeKey = resolveAudioObjectKey({
    documentType: ctx.document.type!,
    languageCode: ctx.languageCode,
    identifier: ctx.document.sourceProject?.identifier ?? 'unknown',
    originalFilename: ctx.document.originalFilename,
    slug: ctx.document.slug,
    audioFileId: audioFile.id,
  });
  const { key: objectKey, url } = await putObject({
    key: relativeKey,
    body: result.audio,
    contentType: AUDIO_CONTENT_TYPE,
  });

  const updated = await markAudioFileReady(audioFile.id, {
    objectKey,
    url,
    durationMs: result.durationMs,
    sizeBytes: result.sizeBytes,
    billedCharacters: result.billedCharacters,
  });
  if (audioFile.triggeredByUserId) {
    await createActivityLog({
      documentVersionId: audioFile.documentVersionId,
      userId: audioFile.triggeredByUserId,
      action: 'audio_generated',
      details: { audioFileId: audioFile.id, durationMs: result.durationMs ?? null },
    });
  }
  console.log(`${LOG_PREFIX} ${audioFile.id} ready at ${url}`);
  return updated;
}

async function fail(audioFile: AudioFile, message: string): Promise<AudioFile> {
  const updated = await markAudioFileFailed(audioFile.id, message);
  if (audioFile.triggeredByUserId) {
    await createActivityLog({
      documentVersionId: audioFile.documentVersionId,
      userId: audioFile.triggeredByUserId,
      action: 'audio_generation_failed',
      details: { audioFileId: audioFile.id, error: message },
    });
  }
  return updated;
}

/** `cs-CZ-AntoninNeural` -> `cs-CZ`. Provider voice ids lead with their locale. */
export function localeFromVoice(voice: string): string {
  return voice.split('-').slice(0, 2).join('-');
}

/** Azure allows 3-64 chars of [A-Za-z0-9-_.]; a UUID with a prefix fits. */
function jobIdFor(audioFileId: string): string {
  return `th-${audioFileId}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
