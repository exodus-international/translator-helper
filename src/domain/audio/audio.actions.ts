'use server';

import { authorize } from '@/lib/authorize';
import type { AudioFile } from '@prisma/client';
import { getLatestAudioFileForVersion } from './audio.repository';
import { advanceJob } from './audio.service';
import type { AudioFileView } from './audio.types';

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
