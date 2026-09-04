'use server';

import { authorize } from '@/lib/authorize';
import prisma from '@/lib/db';
import { type SessionUser } from '@/lib/session';
import { Role, type AudioFile } from '@prisma/client';
import { createActivityLog } from '../activity-log/activity-log.repository';
import { assertCanEditDocumentVersion } from '../document-version/document-version.permissions';
import { getUserRoleForLanguage } from '../user-language/user-language.repository';
import { getLatestAudioFileForVersion } from './audio.repository';
import {
  advanceJob,
  getAudioReadiness,
  getTranscript,
  keepTranscript,
  saveTranscript,
  startGeneration,
} from './audio.service';
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
  const { user } = await authorize('authenticated');

  const transcript = await getTranscript(documentVersionId);
  if (!transcript) return null;

  const permission = await transcriptPermission(documentVersionId, user);
  return {
    ssml: transcript.ssml,
    state: transcript.state,
    canEdit: permission.canEdit,
    readOnlyReason: permission.reason,
  };
}

/** Stores hand-edited SSML. The next generation sends exactly this. */
export async function saveAudioTranscriptAction(documentVersionId: string, ssml: string): Promise<void> {
  const { user } = await authorize('authenticated');
  await assertCanEditDocumentVersion(documentVersionId, user);

  await saveTranscript(documentVersionId, ssml);
  await createActivityLog({
    documentVersionId,
    userId: user.id,
    action: 'audio_transcript_edited',
    details: { characters: ssml.length },
  });
}

/**
 * Answers the conflict prompt with "keep mine": the hand-edited SSML stays and
 * the tab stops saying the document moved on. Rebuilding from the document is
 * the other answer, and it is just a reset.
 */
export async function keepAudioTranscriptAction(documentVersionId: string): Promise<void> {
  const { user } = await authorize('authenticated');
  await assertCanEditDocumentVersion(documentVersionId, user);

  await keepTranscript(documentVersionId);
  await createActivityLog({
    documentVersionId,
    userId: user.id,
    action: 'audio_transcript_kept',
  });
}

/** Drops the override so the transcript goes back to being derived from the document. */
export async function resetAudioTranscriptAction(documentVersionId: string): Promise<void> {
  const { user } = await authorize('authenticated');
  await assertCanEditDocumentVersion(documentVersionId, user);

  await saveTranscript(documentVersionId, null);
  await createActivityLog({
    documentVersionId,
    userId: user.id,
    action: 'audio_transcript_reset',
  });
}

/**
 * Whether this reader may change the transcript, and if not, why not, in words
 * meant for them. Editing a transcript is the same right as editing the
 * version, so the throwing check is the authority; this only turns its refusal
 * into something worth reading.
 */
async function transcriptPermission(
  documentVersionId: string,
  user: SessionUser,
): Promise<{ canEdit: boolean; reason?: string }> {
  try {
    await assertCanEditDocumentVersion(documentVersionId, user);
    return { canEdit: true };
  } catch {
    if (user.role === Role.ADMIN) return { canEdit: false, reason: 'This document cannot be edited.' };

    const version = await prisma.documentVersion.findUnique({
      where: { id: documentVersionId },
      select: { language: { select: { id: true, name: true } } },
    });
    if (!version) return { canEdit: false, reason: 'This document cannot be edited.' };

    const assigned = (await getUserRoleForLanguage(user.id, version.language.id)) !== null;
    return {
      canEdit: false,
      reason: assigned
        ? 'You cannot edit this document, so its audio text is read-only.'
        : `You are not assigned to ${version.language.name}. Ask an admin to add the language to your profile.`,
    };
  }
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
