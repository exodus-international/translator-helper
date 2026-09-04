import prisma from '@/lib/db';
import { isAudioStorageConfigured } from '@/lib/audio-storage-config';
import { putObject } from '@/lib/object-storage';
import { AudioStatus, type AudioFile, type AudioProvider, type DocumentType } from '@prisma/client';
import { createActivityLog } from '../activity-log/activity-log.repository';
import { resolveAudioObjectKey } from './audio.paths';
import {
  claimAudioFileForProcessing,
  createAudioFile,
  findStalledAudioFiles,
  getAudioFileById,
  getLatestAudioFileForVersion,
  markAudioFileFailed,
  markAudioFileReady,
  releaseAudioFileToPending,
  setAudioFileJob,
} from './audio.repository';
import {
  audioSkipReason,
  formatAudioError,
  hasReadableText,
  isAudioStale,
  localeFromVoice,
  resolveAudioSsml,
  type AudioErrorKind,
} from './audio.rules';
import { AUDIO_CONTENT_TYPE, type AudioGenerationOutcome, type AudioReadiness } from './audio.types';
import { getSpeechProvider } from './providers/speech-provider';
import type { SynthesisResult } from './providers/speech-provider';

const LOG_PREFIX = '[Audio]';

/** Everything generation reads off a version. Named so a test can build one. */
export interface VersionForGeneration {
  id: string;
  content: string;
  audioSsml: string | null;
  version: number;
  language: { code: string; audioProvider: AudioProvider | null; audioVoice: string | null };
  document: {
    type: DocumentType | null;
    originalFilename: string | null;
    slug: string;
    sourceProject: { identifier: string | null; audioDocumentTypes: DocumentType[] } | null;
  };
}

/**
 * The service's reach into the database, the provider and object storage,
 * injectable so what the provider is actually sent can be asserted without
 * either. Same shape as `createAuthorize` in the authorization gateway.
 */
export interface GenerationDeps {
  loadVersion: (id: string) => Promise<VersionForGeneration | null>;
  storageConfigured: () => boolean;
  getProvider: typeof getSpeechProvider;
  createAudioFile: typeof createAudioFile;
  setAudioFileJob: typeof setAudioFileJob;
  claimForProcessing: typeof claimAudioFileForProcessing;
  markFailed: typeof markAudioFileFailed;
  log: typeof createActivityLog;
  /** Uploads the finished audio and marks the record ready. */
  finish: typeof complete;
}

const defaultGenerationDeps: GenerationDeps = {
  loadVersion: (id) =>
    prisma.documentVersion.findUnique({
      where: { id },
      include: { document: { include: { sourceProject: true } }, language: true },
    }),
  storageConfigured: isAudioStorageConfigured,
  getProvider: getSpeechProvider,
  createAudioFile,
  setAudioFileJob,
  claimForProcessing: claimAudioFileForProcessing,
  markFailed: markAudioFileFailed,
  log: createActivityLog,
  finish: (audioFile, result, ctx) => complete(audioFile, result, ctx),
};

/**
 * Creates an audio record for a document version and hands the synthesis to
 * the language's provider. Never throws: configuration gaps come back as
 * `skipped`, everything else as `failed`, so a status transition is never
 * blocked by audio.
 */
export function createStartGeneration(deps: GenerationDeps = defaultGenerationDeps) {
  return async function startGeneration(
  documentVersionId: string,
  userId: string,
  options: { trigger?: 'approval' | 'regeneration' } = {},
): Promise<AudioGenerationOutcome> {
  const version = await deps.loadVersion(documentVersionId);
  if (!version) return { status: 'failed', error: `Document version not found: ${documentVersionId}` };

  const skip = audioSkipReason({
    language: version.language,
    document: version.document,
    storageConfigured: deps.storageConfigured(),
    providerConfigured: (provider) => deps.getProvider(provider).isConfigured(),
  });
  if (skip) {
    console.log(`${LOG_PREFIX} skipping generation for ${documentVersionId}: ${skip}`);
    return { status: 'skipped', reason: skip };
  }

  const { language, document } = version;
  const provider = deps.getProvider(language.audioProvider!);
  const voice = language.audioVoice!;

  const audioFile = await deps.createAudioFile({
    documentVersionId,
    provider: provider.id,
    voice,
    sourceVersion: version.version,
    triggeredByUserId: userId,
  });
  await deps.log({
    documentVersionId,
    userId,
    action: options.trigger === 'regeneration' ? 'audio_regeneration_requested' : 'audio_generation_started',
    details: { audioFileId: audioFile.id, voice, ssmlSource: version.audioSsml ? 'override' : 'derived' },
  });

  // Anything thrown before the provider is asked is our problem (content or
  // setup), anything after is the provider's. The kind is stored with the
  // message so the card can word the two differently.
  let phase: AudioErrorKind = 'content';
  try {
    if (!version.audioSsml && !hasReadableText(version.content)) {
      throw new Error('The document has no readable text after stripping Markdown');
    }
    const { ssml } = resolveAudioSsml({
      content: version.content,
      override: version.audioSsml,
      voice,
      maxBreakMs: provider.maxBreakMs,
    });

    phase = 'provider';
    const outcome = await provider.submit({ jobId: jobIdFor(audioFile.id), ssml });
    if (outcome.kind === 'result') {
      // Synchronous provider: finish in the same call.
      await deps.claimForProcessing(audioFile.id);
      await deps.finish(audioFile, outcome.result, { document, languageCode: language.code });
    } else {
      await deps.setAudioFileJob(audioFile.id, outcome.jobId);
    }
    return { status: 'success', audioFileId: audioFile.id };
  } catch (error: unknown) {
    const message = errorMessage(error);
    console.error(`${LOG_PREFIX} generation failed for ${documentVersionId}:`, message);
    await failWith(deps, audioFile, formatAudioError(phase, message));
    return { status: 'failed', error: message };
  }
  };
}

/** Production instance. */
export const startGeneration = createStartGeneration();

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

/**
 * Whether a version's audio is fit to ship. `not_applicable` when the
 * language or project is not set up for audio, so deploys are not nagged
 * about audio nobody asked for.
 */
export async function getAudioReadiness(documentVersionId: string): Promise<AudioReadiness> {
  const version = await prisma.documentVersion.findUnique({
    where: { id: documentVersionId },
    include: { document: { include: { sourceProject: true } }, language: true },
  });
  if (!version) return { state: 'not_applicable' };

  const skip = audioSkipReason({
    language: version.language,
    document: version.document,
    storageConfigured: isAudioStorageConfigured(),
    providerConfigured: (provider) => getSpeechProvider(provider).isConfigured(),
  });
  if (skip) return { state: 'not_applicable' };

  const audio = await getLatestAudioFileForVersion(documentVersionId);
  if (!audio) return { state: 'missing' };
  if (audio.status === AudioStatus.PENDING || audio.status === AudioStatus.PROCESSING) return { state: 'pending' };
  if (audio.status === AudioStatus.FAILED) return { state: 'failed' };
  if (isAudioStale(audio, version)) return { state: 'stale', url: audio.url ?? undefined };
  return { state: 'ready', url: audio.url ?? undefined };
}

const SWEEP_MIN_AGE_MS = 60_000;
const STALLED_PROCESSING_MS = 15 * 60_000;

export interface SweepResult {
  checked: number;
  ready: number;
  failed: number;
  stillPending: number;
}

/**
 * Moves every in-flight record forward that nobody has looked at for a
 * minute. A record stuck in PROCESSING for a long time means a worker died
 * mid-upload; it is failed with a clear message rather than retried forever.
 * Safe to call from a cron at any frequency; a no-op when nothing is pending.
 */
export async function sweepPendingJobs(now = new Date()): Promise<SweepResult> {
  const candidates = await findStalledAudioFiles(new Date(now.getTime() - SWEEP_MIN_AGE_MS));
  const result: SweepResult = { checked: candidates.length, ready: 0, failed: 0, stillPending: 0 };

  for (const candidate of candidates) {
    try {
      let outcome: AudioFile | null;
      if (candidate.status === AudioStatus.PROCESSING && now.getTime() - candidate.updatedAt.getTime() > STALLED_PROCESSING_MS) {
        outcome = await fail(
          candidate,
          formatAudioError('provider', 'Generation stalled while processing and was abandoned by the scheduled sweep'),
        );
      } else {
        outcome = await advanceJob(candidate.id);
      }
      if (outcome?.status === AudioStatus.READY) result.ready += 1;
      else if (outcome?.status === AudioStatus.FAILED) result.failed += 1;
      else result.stillPending += 1;
    } catch (error: unknown) {
      console.error(`${LOG_PREFIX} sweep could not advance ${candidate.id}:`, errorMessage(error));
      result.stillPending += 1;
    }
  }

  if (result.checked > 0) console.log(`${LOG_PREFIX} sweep:`, result);
  return result;
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
  return failWith({ markFailed: markAudioFileFailed, log: createActivityLog }, audioFile, message);
}

/** Marks a record failed and logs it, through whichever pair of writers it is given. */
async function failWith(
  deps: Pick<GenerationDeps, 'markFailed' | 'log'>,
  audioFile: AudioFile,
  message: string,
): Promise<AudioFile> {
  const updated = await deps.markFailed(audioFile.id, message);
  if (audioFile.triggeredByUserId) {
    await deps.log({
      documentVersionId: audioFile.documentVersionId,
      userId: audioFile.triggeredByUserId,
      action: 'audio_generation_failed',
      details: { audioFileId: audioFile.id, error: message },
    });
  }
  return updated;
}

export { localeFromVoice };

/** Azure allows 3-64 chars of [A-Za-z0-9-_.]; a UUID with a prefix fits. */
function jobIdFor(audioFileId: string): string {
  return `th-${audioFileId}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The SSML for a version as the tab should show it: the stored override when
 * there is one, otherwise what generation would derive right now.
 *
 * Returns null when the document is not eligible for audio at all, which is
 * also what decides whether the Audio text tab exists.
 */
export async function getTranscript(documentVersionId: string): Promise<{ ssml: string; source: 'derived' | 'override' } | null> {
  const version = await prisma.documentVersion.findUnique({
    where: { id: documentVersionId },
    include: { document: { include: { sourceProject: true } }, language: true },
  });
  if (!version) return null;

  const skip = audioSkipReason({
    language: version.language,
    document: version.document,
    storageConfigured: isAudioStorageConfigured(),
    providerConfigured: (provider) => getSpeechProvider(provider).isConfigured(),
  });
  if (skip) return null;

  const provider = getSpeechProvider(version.language.audioProvider!);
  return resolveAudioSsml({
    content: version.content,
    override: version.audioSsml,
    voice: version.language.audioVoice!,
    maxBreakMs: provider.maxBreakMs,
  });
}

/**
 * Stores hand-edited SSML for a version, or clears it with null so the
 * transcript goes back to being derived. The caller is responsible for the
 * permission check; this only writes.
 */
export async function saveTranscript(documentVersionId: string, ssml: string | null): Promise<void> {
  await prisma.documentVersion.update({
    where: { id: documentVersionId },
    data: { audioSsml: ssml?.trim() ? ssml : null },
  });
}
