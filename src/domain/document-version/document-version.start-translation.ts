import { DocumentStatus } from '@/generated/prisma/enums';

/**
 * Starting a translation: the "Start translation" control, apart from who
 * may press it.
 *
 * The server action checks the caller and finds or creates the translation
 * project; this decides what happens to the version. A version already
 * reserved by someone else is refused; one this person already holds in
 * progress is handed back unchanged; anything else is claimed and moved to
 * IN_PROGRESS on purpose without the workflow's transition rules, because
 * starting is allowed to re-claim a version from any status. A document with
 * no version in the language gets its first one.
 */

interface ExistingVersion {
  id: string;
  userId: string | null;
  status: DocumentStatus;
}

export interface StartTranslationDeps<Version extends { language: { name: string } }> {
  findVersion: (documentId: string, languageId: string) => Promise<(ExistingVersion & Version) | null>;
  /** Sets the translator and moves the version to IN_PROGRESS. */
  claimVersion: (versionId: string, userId: string) => Promise<Version & { id: string }>;
  createVersion: (data: {
    documentId: string;
    languageId: string;
    content: string;
    status: DocumentStatus;
    userId: string;
  }) => Promise<Version & { id: string }>;
  log: (entry: {
    documentVersionId: string;
    userId: string;
    action: 'started_translation' | 'assigned_translation';
    details: Record<string, unknown>;
  }) => Promise<unknown>;
}

export function createStartTranslation<Version extends { language: { name: string } }>(
  deps: StartTranslationDeps<Version>,
) {
  return async function startTranslation(input: {
    documentId: string;
    languageId: string;
    content: string;
    actorId: string;
  }): Promise<Version> {
    const { documentId, languageId, content, actorId } = input;
    const existing = await deps.findVersion(documentId, languageId);

    if (existing) {
      // The version carries the assignment: a translator set on it reserves
      // the document, an empty one leaves it open to the whole language team.
      if (existing.userId && existing.userId !== actorId) {
        throw new Error('This document is assigned to another user');
      }

      if (existing.status === DocumentStatus.IN_PROGRESS) {
        if (existing.userId === actorId) {
          return existing;
        }
        throw new Error('This translation is already assigned to another user');
      }

      const version = await deps.claimVersion(existing.id, actorId);
      await deps.log({
        documentVersionId: version.id,
        userId: actorId,
        action: 'started_translation',
        details: { language: version.language.name, progress: `${existing.status} -> IN_PROGRESS` },
      });
      return version;
    }

    const version = await deps.createVersion({
      documentId,
      languageId,
      content,
      status: DocumentStatus.IN_PROGRESS,
      userId: actorId,
    });
    await deps.log({
      documentVersionId: version.id,
      userId: actorId,
      action: 'assigned_translation',
      details: { language: version.language.name },
    });
    return version;
  };
}
