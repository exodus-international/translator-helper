'use server';

import { authorize } from '@/lib/authorize';
import type { AudioFile } from '@prisma/client';
import { assertCanEditDocumentVersion } from '../document-version/document-version.permissions';
import { getLatestAudioFileForVersion } from './audio.repository';
import { advanceJob, getAudioReadiness, getTranscript, startGeneration } from './audio.service';
import type {
  AudioFileView,
  AudioGenerationOutcome,
  AudioReadiness,
  AudioTranscriptView,
} from './audio.types';

export async function getLatestAudioFileAction(documentVersionId: string): Promise<AudioFileView | null> {
  await authorize('authenticated');
  const audioFile = await getLatestAudioFileForVersion(documentVersionId);
  return audioFile ? toView(audioFile) : null;
}

/** Polled by the review page while a generation is pending. */
export async function advanceAudioJobAction(audioFileId: string): Promise<AudioFileView | null> {
  await authorize('authenticated');
  const audioFile = await advanceJob(audioFileId);
  return audioFile ? toView(audioFile) : null;
}

/** Used by the deploy guard to decide whether to warn before deploying. */
export async function getAudioReadinessAction(documentVersionId: string): Promise<AudioReadiness> {
  await authorize('authenticated');
  return getAudioReadiness(documentVersionId);
}

/**
 * Regenerate (or retry) audio for a version. Allowed for whoever may edit
 * the version; works from any status, and always creates a new record.
 */
export async function regenerateAudioAction(documentVersionId: string): Promise<AudioGenerationOutcome> {
  const { user } = await authorize('authenticated');
  await assertCanEditDocumentVersion(documentVersionId, user);
  return startGeneration(documentVersionId, user.id, { trigger: 'regeneration' });
}

/**
 * What the Audio text tab renders: the SSML that would be sent to Azure for
 * this version right now. Null when the document gets no audio at all, which
 * is also how the editor decides whether to offer the tab.
 */
export async function getAudioTranscriptAction(documentVersionId: string): Promise<AudioTranscriptView | null> {
  await authorize('authenticated');

  const transcript = await getTranscript(documentVersionId);
  if (!transcript) return null;

  return {
    ssml: transcript.ssml,
    state: transcript.source === 'override' ? 'edited' : 'generated',
    canEdit: false,
  };
}

function toView(audioFile: AudioFile): AudioFileView {
  return {
    id: audioFile.id,
    status: audioFile.status,
    provider: audioFile.provider,
    voice: audioFile.voice,
    sourceVersion: audioFile.sourceVersion,
    url: audioFile.url,
    durationMs: audioFile.durationMs,
    sizeBytes: audioFile.sizeBytes,
    errorMessage: audioFile.errorMessage,
    createdAt: audioFile.createdAt.toISOString(),
    updatedAt: audioFile.updatedAt.toISOString(),
  };
}
