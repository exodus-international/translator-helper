'use server';

import prisma from '@/lib/db';
import { authorize } from '@/lib/authorize';
import { type SessionUser } from '@/lib/session';
import { DocumentStatus, Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import type { AudioGenerationOutcome } from '../audio/audio.types';

/**
 * Load a version + its language and assert the caller may edit/delete a source
 * (English) version. For non-source versions returns successfully — caller is
 * responsible for any further project-scoped permission check.
 */
async function loadVersionAndGateSourceEdits(id: string, user: SessionUser) {
  const version = await getDocumentVersionById(id);
  if (!version) {
    throw new Error('Document version not found');
  }

  const language = await getLanguageById(version.languageId);
  if (!language) {
    throw new Error('Language not found');
  }

  if (language.code === 'en' && user.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only deployers can edit source (English) document versions');
  }

  return { version, language, isSourceEnglish: language.code === 'en' };
}
import { coalesceEditLog, createActivityLog } from '../activity-log/activity-log.repository';
import { countOpenSuggestions } from '../suggestion/suggestion.repository';
import { assertCanEditDocumentVersion } from './document-version.permissions';
import { validateTransition } from './document-version.transitions';
import { getDocumentById } from '../document/document.repository';
import { getLanguageById } from '../language/language.repository';
import { getUserRoleForLanguage } from '../user-language/user-language.repository';
import { getSourceProjectById } from '../source-project/source-project.repository';
import {
  createTranslationProject,
  getTranslationProjectBySourceAndLanguage,
} from '../translation-project/translation-project.repository';
import {
  assignDocumentVersion,
  createDocumentVersion,
  deleteDocumentVersion,
  getWorkVersionsForUser,
  getDocumentVersionByDocumentAndLanguage,
  getDocumentVersionById,
  listVersionsForTranslationProject,
  updateDocumentVersion,
  updateDocumentVersionStatus,
} from './document-version.repository';
import {
  assignTranslatorToVersionSchema,
  createDocumentVersionSchema,
  submitForReviewSchema,
  updateDocumentVersionSchema,
} from './document-version.types';

export async function assignReviewerToVersionAction(versionId: string, reviewerId: string | null) {
  await authorize('admin');

  const version = await prisma.documentVersion.update({
    where: { id: versionId },
    data: { reviewerId },
    include: {
      language: true,
      user: { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true, email: true } },
    },
  });

  revalidatePath('/documents/[project]/[slug]/[lang]', 'page');
  return version;
}

/**
 * Assigns a translator and deadline for a document in a translation project's
 * language, creating the version if the document has none yet. Replaces the
 * former create/update DocumentAssignment actions.
 */
export async function assignTranslatorToVersionAction(input: unknown) {
  const validated = assignTranslatorToVersionSchema.parse(input);

  const { user } = await authorize({ project: validated.translationProjectId, role: 'manager' });

  const translationProject = await prisma.translationProject.findUnique({
    where: { id: validated.translationProjectId },
    select: { languageId: true },
  });
  if (!translationProject) {
    throw new Error('Translation project not found');
  }

  const version = await assignDocumentVersion({
    documentId: validated.documentId,
    languageId: translationProject.languageId,
    userId: validated.userId ?? null,
    deadline: validated.deadline ?? null,
    assignedById: user.id,
  });

  revalidatePath('/dashboard');
  revalidatePath('/documents/[project]/[slug]/[lang]', 'page');
  return version;
}

/** Everything the signed-in user is assigned to translate. */
/**
 * The current user's active work — versions they translate or review, minus
 * terminal statuses. The dashboard splits these into "needs you" and "waiting
 * on others" from each row's role and status.
 */
export async function getWorkVersionsForUserAction() {
  const { user } = await authorize('authenticated');
  return await getWorkVersionsForUser(user.id);
}

/** The versions that make up a translation project — one per document. */
export async function listVersionsForTranslationProjectAction(translationProjectId: string) {
  await authorize({ project: translationProjectId, role: 'member' });

  const translationProject = await prisma.translationProject.findUnique({
    where: { id: translationProjectId },
    select: { sourceProjectId: true, languageId: true },
  });
  if (!translationProject) {
    throw new Error('Translation project not found');
  }

  return await listVersionsForTranslationProject(translationProject.sourceProjectId, translationProject.languageId);
}

export async function createDocumentVersionAction(input: unknown) {
  const { user } = await authorize('authenticated');
  const validated = createDocumentVersionSchema.parse(input);

  const version = await createDocumentVersion({
    documentId: validated.documentId,
    languageId: validated.languageId,
    content: validated.content,
    userId: user.id,
  });

  // Log the activity
  await createActivityLog({
    documentVersionId: version.id,
    userId: user.id,
    action: 'created_translation',
    details: { language: version.language.name },
  });

  return version;
}

export async function updateDocumentVersionAction(id: string, input: unknown) {
  const { user } = await authorize('authenticated');
  const validated = updateDocumentVersionSchema.parse(input);

  await assertCanEditDocumentVersion(id, user);

  const version = await updateDocumentVersion(id, validated.content, user.id);

  // Log the activity (coalesce rapid edits within 5 minutes)
  await coalesceEditLog({
    documentVersionId: version.id,
    userId: user.id,
    details: { version: version.version },
  });

  return version;
}

export async function submitForReviewAction(input: unknown) {
  const { user } = await authorize('authenticated');
  const validated = submitForReviewSchema.parse(input);

  // Get existing version to check permissions
  const existingVersion = await getDocumentVersionById(validated.versionId);
  if (!existingVersion) {
    throw new Error('Document version not found');
  }

  // Only the owner can submit for review
  if (existingVersion.userId !== user.id) {
    throw new Error('Only the translator can submit this version for review');
  }

  // Get document to find source project
  const document = await getDocumentById(existingVersion.documentId);
  if (!document || !document.sourceProject?.id) {
    throw new Error('Document not found or not associated with a source project');
  }

  // Get translation project
  const translationProject = await getTranslationProjectBySourceAndLanguage(
    document.sourceProject.id,
    existingVersion.languageId,
  );

  if (translationProject) {
    await authorize({ project: translationProject.id, role: 'member' });
  } else {
    await authorize('admin');
  }

  validateTransition(existingVersion.status, DocumentStatus.PENDING_REVIEW);

  const version = await updateDocumentVersionStatus(
    validated.versionId,
    DocumentStatus.PENDING_REVIEW,
    validated.reviewerId,
  );

  // Log the activity
  await createActivityLog({
    documentVersionId: version.id,
    userId: user.id,
    action: 'submitted_for_review',
    details: { reviewerId: validated.reviewerId },
  });

  return version;
}

export async function deleteDocumentVersionAction(id: string) {
  const { user } = await authorize('authenticated');
  await loadVersionAndGateSourceEdits(id, user);
  // For translation versions, allow deletion (or add appropriate checks if needed)
  return await deleteDocumentVersion(id);
}

export async function updateDocumentVersionStatusAction(
  versionId: string,
  status: DocumentStatus,
): Promise<{
  version: Awaited<ReturnType<typeof updateDocumentVersionStatus>>;
  github?: { status: 'success' | 'failed' | 'skipped'; error?: string; prUrl?: string };
  audio?: AudioGenerationOutcome;
}> {
  const { user } = await authorize('authenticated');

  // Check permission for DEPLOYED status
  if (status === DocumentStatus.DEPLOYED && user.role !== Role.ADMIN) {
    throw new Error('Forbidden: Only deployers can deploy documents');
  }

  // Get existing version to validate transition
  const existingVersion = await getDocumentVersionById(versionId);
  if (!existingVersion) {
    throw new Error('Document version not found');
  }

  if (status === DocumentStatus.APPROVED || status === DocumentStatus.DEPLOYED) {
    const openCount = await countOpenSuggestions(versionId);
    validateTransition(existingVersion.status, status, { openSuggestionsCount: openCount });
  } else {
    validateTransition(existingVersion.status, status);
  }

  const version = await updateDocumentVersionStatus(versionId, status);

  // Log the activity
  await createActivityLog({
    documentVersionId: version.id,
    userId: user.id,
    action: 'status_updated',
    details: { status: status },
  });

  // If transitioning to DEPLOYED, attempt GitHub deploy
  let github: { status: 'success' | 'failed' | 'skipped'; error?: string; prUrl?: string } | undefined;
  if (status === DocumentStatus.DEPLOYED) {
    try {
      console.log('[GitHub] Checking if GitHub is configured...');
      const { isGitHubConfigured } = await import('@/lib/github-config');
      if (isGitHubConfigured()) {
        console.log('[GitHub] GitHub is configured, starting deploy for version:', versionId);
        const { deployToGitHub } = await import('../github/github.service');
        const result = await deployToGitHub(versionId);

        console.log('[GitHub] Deploy succeeded, logging activity');
        await createActivityLog({
          documentVersionId: version.id,
          userId: user.id,
          action: 'github_deployed',
          details: {},
        });
        revalidatePath('/documents/[project]/[slug]/[lang]', 'page');
        github = { status: 'success', prUrl: result?.prUrl };
      } else {
        console.log('[GitHub] GitHub is not configured, skipping deploy');
        github = { status: 'skipped' };
      }
    } catch (error: any) {
      console.error('[GitHub] Deploy failed:', error.message);
      console.error('[GitHub] Full error:', error);
      await createActivityLog({
        documentVersionId: version.id,
        userId: user.id,
        action: 'github_deploy_failed',
        details: { error: error.message },
      });
      revalidatePath('/documents/[project]/[slug]/[lang]', 'page');
      github = { status: 'failed', error: error.message };
    }
  }

  // If transitioning to APPROVED, start audio generation. Same shape as the
  // GitHub deploy above: never throws, the outcome is reported to the caller.
  let audio: AudioGenerationOutcome | undefined;
  if (status === DocumentStatus.APPROVED) {
    try {
      const { startGeneration } = await import('../audio/audio.service');
      audio = await startGeneration(version.id, user.id);
      revalidatePath('/documents/[project]/[slug]/[lang]', 'page');
    } catch (error: unknown) {
      console.error('[Audio] Generation failed:', error);
      audio = { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  }

  return { version, github, audio };
}

export async function assignDocumentVersionAction(input: unknown) {
  const { user } = await authorize('authenticated');
  const validated = createDocumentVersionSchema.parse(input);

  // Get document to find source project
  const document = await getDocumentById(validated.documentId);
  if (!document) {
    throw new Error('Document not found');
  }
  if (!document.sourceProject?.id) {
    throw new Error(
      'This document is not associated with a source project. Please assign a source project to the document before translating it.',
    );
  }

  // Get translation project, or create it if it doesn't exist
  let translationProject = await getTranslationProjectBySourceAndLanguage(
    document.sourceProject.id,
    validated.languageId,
  );

  if (!translationProject) {
    // Creating the project must not become a way to gain access to the language:
    // check the caller's language assignment before anything is written.
    if (user.role !== Role.ADMIN && !(await getUserRoleForLanguage(user.id, validated.languageId))) {
      throw new Error('You are not assigned to this language');
    }

    // Auto-create the translation project if it doesn't exist
    const sourceProject = await getSourceProjectById(document.sourceProject.id);
    if (!sourceProject) {
      throw new Error('Source project not found');
    }

    const language = await getLanguageById(validated.languageId);
    if (!language) {
      throw new Error('Language not found');
    }

    // Create translation project with a name like "{SourceProjectName} - {LanguageName}"
    await createTranslationProject({
      name: `${sourceProject.name} - ${language.name}`,
      sourceProjectId: document.sourceProject.id,
      languageId: validated.languageId,
    });

    // No membership is granted here: the caller's language assignment, checked
    // above, already carries their role on every project in this language.

    // Fetch the translation project again to get the full structure
    translationProject = await getTranslationProjectBySourceAndLanguage(
      document.sourceProject.id,
      validated.languageId,
    );
  }

  // At this point, translationProject should never be null
  if (!translationProject) {
    throw new Error('Failed to create or retrieve translation project');
  }

  await authorize({ project: translationProject.id, role: 'translator' });

  // Check if version already exists
  const existingVersion = await getDocumentVersionByDocumentAndLanguage(validated.documentId, validated.languageId);

  if (existingVersion) {
    // The version carries the assignment now: a translator set on it reserves the
    // document, an empty one leaves it open to the whole language team.
    if (existingVersion.userId && existingVersion.userId !== user.id) {
      throw new Error('This document is assigned to another user');
    }

    if (existingVersion.status === DocumentStatus.IN_PROGRESS) {
      // Already claimed by this user — hand back the same version.
      if (existingVersion.userId === user.id) {
        return existingVersion;
      }
      throw new Error('This translation is already assigned to another user');
    }

    // Assign to current user and set to IN_PROGRESS (bypasses validateTransition
    // intentionally — this is the "Start Translation" flow which can re-claim
    // a version from PENDING_TRANSLATION or reassign from other statuses)
    const version = await prisma.documentVersion.update({
      where: { id: existingVersion.id },
      data: {
        userId: user.id,
        status: DocumentStatus.IN_PROGRESS,
      },
      include: {
        document: true,
        language: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Log the activity
    await createActivityLog({
      documentVersionId: version.id,
      userId: user.id,
      action: 'started_translation',
      details: { language: version.language.name, progress: `${existingVersion.status} -> IN_PROGRESS` },
    });

    return version;
  }

  // Create new version with IN_PROGRESS status and assign to user
  const version = await createDocumentVersion({
    documentId: validated.documentId,
    languageId: validated.languageId,
    content: validated.content || '',
    status: DocumentStatus.IN_PROGRESS,
    userId: user.id,
  });

  // Log the activity
  await createActivityLog({
    documentVersionId: version.id,
    userId: user.id,
    action: 'assigned_translation',
    details: { language: version.language.name },
  });

  return version;
}

export async function getApprovedVersionsAction() {
  const { user } = await authorize('authenticated');
  if (user.role !== Role.ADMIN) {
    return [];
  }

  return prisma.documentVersion.findMany({
    where: {
      status: DocumentStatus.APPROVED,
      language: { code: { not: 'en' } },
    },
    include: {
      document: {
        include: {
          sourceProject: true,
        },
      },
      language: true,
      user: {
        select: { id: true, name: true, email: true },
      },
      reviewer: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });
}
