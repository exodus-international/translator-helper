'use server';

import { userBrief } from '@/domain/user/user.select';
import prisma from '@/lib/db';
import { authorize } from '@/lib/authorize';
import { type SessionUser } from '@/lib/session';
import { DocumentStatus, Role } from '@/generated/prisma/enums';
import { revalidatePath } from 'next/cache';
import { isGitHubConfigured } from '@/lib/github-config';
import { createStatusChange, involvesDeployed, type StatusChangeResult } from './document-version.status-change';
import {
  notifyReviewerAssignment,
  notifyStatusChange,
  notifyTranslatorAssignment,
} from '../notification/notification.service';

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
import { getUserLanguages, getUserRoleForLanguage } from '../user-language/user-language.repository';
import { resolveLanguageViewer } from '../language/language-access';
import { getSourceProjectById } from '../source-project/source-project.repository';
import {
  createTranslationProject,
  getTranslationProjectBySourceAndLanguage,
} from '../translation-project/translation-project.repository';
import {
  assignDocumentVersion,
  assignmentSelect,
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

/**
 * Sets or clears a version's reviewer. `reviewDeadline` is left as it is when
 * omitted; null clears it, and the review then answers to the version's own
 * deadline. Clearing the reviewer always clears the review deadline.
 */
export async function assignReviewerToVersionAction(
  versionId: string,
  reviewerId: string | null,
  reviewDeadline?: Date | null,
) {
  const { user } = await authorize('admin');

  const previous = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    select: { reviewerId: true, reviewDeadline: true },
  });

  const version = await prisma.documentVersion.update({
    where: { id: versionId },
    // A review deadline belongs to a review: removing the reviewer clears it, so
    // the next one assigned doesn't silently inherit a stale date.
    data: {
      reviewerId,
      ...(reviewerId === null ? { reviewDeadline: null } : reviewDeadline !== undefined ? { reviewDeadline } : {}),
    },
    include: {
      language: true,
      user: userBrief,
      reviewer: userBrief,
    },
  });

  if (previous) {
    await notifyReviewerAssignment({ versionId, actorId: user.id, previous });
  }

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

  const previous = await prisma.documentVersion.findUnique({
    where: {
      documentId_languageId: { documentId: validated.documentId, languageId: translationProject.languageId },
    },
    select: { userId: true, deadline: true },
  });

  const version = await assignDocumentVersion({
    documentId: validated.documentId,
    languageId: translationProject.languageId,
    userId: validated.userId ?? null,
    deadline: validated.deadline ?? null,
    assignedById: user.id,
  });

  await notifyTranslatorAssignment({ versionId: version.id, actorId: user.id, previous });

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

  await notifyStatusChange({
    versionId: version.id,
    actorId: user.id,
    from: existingVersion.status,
    to: DocumentStatus.PENDING_REVIEW,
  });

  return version;
}

export async function deleteDocumentVersionAction(id: string) {
  const { user } = await authorize('authenticated');
  await loadVersionAndGateSourceEdits(id, user);
  // For translation versions, allow deletion (or add appropriate checks if needed)
  return await deleteDocumentVersion(id);
}

/**
 * The status change as the app wires it: real repositories, the GitHub and
 * audio services loaded on demand so a page that never deploys never loads
 * octokit, and the document page revalidated when something it shows moved.
 */
const changeStatus = createStatusChange({
  countOpenSuggestions,
  updateStatus: updateDocumentVersionStatus,
  log: createActivityLog,
  notify: notifyStatusChange,
  github: {
    isConfigured: () => isGitHubConfigured(),
    deploy: async (versionId) => {
      const { deployToGitHub } = await import('../github/github.service');
      return deployToGitHub(versionId);
    },
  },
  startAudio: async (versionId, userId) => {
    const { startGeneration } = await import('../audio/audio.service');
    return startGeneration(versionId, userId);
  },
  revalidateDocumentPage: () => revalidatePath('/documents/[project]/[slug]/[lang]', 'page'),
});

export async function updateDocumentVersionStatusAction(
  versionId: string,
  status: DocumentStatus,
): Promise<StatusChangeResult<Awaited<ReturnType<typeof updateDocumentVersionStatus>>>> {
  const { user } = await authorize('authenticated');

  const existingVersion = await getDocumentVersionById(versionId);
  if (!existingVersion) {
    throw new Error('Document version not found');
  }

  // Deploying publishes this language's work to the content repository, so it
  // belongs to the people answerable for that language -- its manager and any
  // administrator. Leaving DEPLOYED is the same decision in reverse.
  if (involvesDeployed(existingVersion.status, status)) {
    await authorize({ language: existingVersion.languageId, role: 'manager' });
  }

  return changeStatus({ version: existingVersion, to: status, actorId: user.id });
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
          ...userBrief,
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

/**
 * The deploy queue: approved work waiting to be published, for the people who
 * can publish it. An administrator sees every language; a manager sees the
 * ones they manage, and nobody else has a queue at all.
 */
export async function getApprovedVersionsAction() {
  const { user } = await authorize('authenticated');

  const viewer = resolveLanguageViewer({
    isAdmin: user.role === Role.ADMIN,
    memberships: user.role === Role.ADMIN ? [] : await getUserLanguages(user.id),
  });

  if (viewer.kind === 'none') {
    return [];
  }

  return prisma.documentVersion.findMany({
    where: {
      status: DocumentStatus.APPROVED,
      language: {
        isSource: false,
        ...(viewer.kind === 'manager' ? { id: { in: viewer.languageIds } } : {}),
      },
    },
    select: assignmentSelect,
    orderBy: {
      updatedAt: 'desc',
    },
  });
}
