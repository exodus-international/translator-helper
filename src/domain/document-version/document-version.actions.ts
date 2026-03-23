'use server';

import prisma from '@/lib/db';
import { authorize } from '@/lib/authorize';
import { DocumentStatus, ProjectRole, Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { coalesceEditLog, createActivityLog } from '../activity-log/activity-log.repository';
import { createComment } from '../comment/comment.repository';
import { countOpenSuggestions } from '../suggestion/suggestion.repository';
import { validateTransition } from './document-version.transitions';
import { resolveTranslationProject } from './resolve-translation-project';
import { getDocumentAssignmentByDocumentAndProject } from '../document-assignment/document-assignment.repository';
import { getDocumentById } from '../document/document.repository';
import { getLanguageById } from '../language/language.repository';
import { createProjectMember } from '../project-member/project-member.repository';
import { getSourceProjectById } from '../source-project/source-project.repository';
import {
  createTranslationProject,
  getTranslationProjectBySourceAndLanguage,
} from '../translation-project/translation-project.repository';
import {
  createDocumentVersion,
  deleteDocumentVersion,
  getDocumentVersionByDocumentAndLanguage,
  getDocumentVersionById,
  updateDocumentVersion,
  updateDocumentVersionStatus,
} from './document-version.repository';
import {
  createDocumentVersionSchema,
  reviewVersionSchema,
  submitForReviewSchema,
  updateDocumentVersionSchema,
} from './document-version.types';

export async function getDocumentVersionAction(id: string) {
  await authorize('authenticated');
  return await getDocumentVersionById(id);
}

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

  revalidatePath(`/documents/${version.documentId}`, 'layout');
  return version;
}

export async function getDocumentVersionByDocumentAndLanguageAction(documentId: string, languageId: string) {
  await authorize('authenticated');
  return await getDocumentVersionByDocumentAndLanguage(documentId, languageId);
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

  // Get existing version to check permissions
  const existingVersion = await getDocumentVersionById(id);
  if (!existingVersion) {
    throw new Error('Document version not found');
  }

  // Check if this is a source (English) version
  const language = await getLanguageById(existingVersion.languageId);
  if (!language) {
    throw new Error('Language not found');
  }

  // If this is a source (English) version, only deployers can edit it
  if (language.code === 'en') {
    if (user.role !== Role.ADMIN) {
      throw new Error('Forbidden: Only deployers can edit source (English) document versions');
    }
  } else {
    // For translation versions, use existing permission logic
    // Get document to find source project
    const document = await getDocumentById(existingVersion.documentId);
    if (!document) {
      throw new Error('Document not found');
    }
    if (!document.sourceProject?.id) {
      throw new Error(
        'This document is not associated with a source project. Please assign a source project to the document before editing translations.',
      );
    }

    // Get translation project
    const translationProject = await getTranslationProjectBySourceAndLanguage(
      document.sourceProject.id,
      existingVersion.languageId,
    );

    if (translationProject) {
      // Only the owner of the version or users with higher permissions can edit
      if (existingVersion.userId !== user.id) {
        await authorize({ project: translationProject.id, role: 'translator' });
      }
    }
  }

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

export async function reviewVersionAction(input: unknown) {
  const { user } = await authorize('authenticated');
  const validated = reviewVersionSchema.parse(input);

  const { version: currentVersion, translationProject } = await resolveTranslationProject(validated.versionId);

  if (translationProject) {
    await authorize({ project: translationProject.id, role: 'reviewer' });
  } else {
    // No translation project — require admin to prevent unauthorized reviews
    await authorize('admin');
  }

  // Determine new status based on approval decision
  const newStatus = validated.approved
    ? DocumentStatus.APPROVED
    : DocumentStatus.IN_PROGRESS;

  if (validated.approved) {
    const openCount = await countOpenSuggestions(validated.versionId);
    validateTransition(currentVersion.status, newStatus, { openSuggestionsCount: openCount });
  } else {
    validateTransition(currentVersion.status, newStatus);
  }

  const version = await updateDocumentVersionStatus(validated.versionId, newStatus);

  // Add comment if provided
  if (validated.comment) {
    await createComment({
      documentVersionId: validated.versionId,
      userId: user.id,
      content: validated.comment,
    });
  }

  // Log the activity
  await createActivityLog({
    documentVersionId: version.id,
    userId: user.id,
    action: validated.approved ? 'approved' : 'requested_changes',
    details: { hasComment: !!validated.comment },
  });

  return version;
}

export async function deployVersionAction(versionId: string) {
  const { user } = await authorize('can:deploy');

  const currentVersion = await getDocumentVersionById(versionId);
  if (!currentVersion) {
    throw new Error('Document version not found');
  }

  const openCount = await countOpenSuggestions(versionId);
  validateTransition(currentVersion.status, DocumentStatus.DEPLOYED, { openSuggestionsCount: openCount });

  const version = await updateDocumentVersionStatus(versionId, DocumentStatus.DEPLOYED);

  // Log the activity
  await createActivityLog({
    documentVersionId: version.id,
    userId: user.id,
    action: 'deployed',
    details: {},
  });

  // Attempt GitHub deploy (non-blocking — deploy succeeds regardless of GitHub outcome)
  try {
    console.log('[GitHub] Checking if GitHub is configured...');
    const { isGitHubConfigured } = await import('@/lib/github-config');
    if (isGitHubConfigured()) {
      console.log('[GitHub] GitHub is configured, starting deploy for version:', versionId);
      const { deployToGitHub } = await import('../github/github.service');
      await deployToGitHub(versionId);

      console.log('[GitHub] Deploy succeeded, logging activity');
      await createActivityLog({
        documentVersionId: version.id,
        userId: user.id,
        action: 'github_deployed',
        details: {},
      });
      revalidatePath(`/documents/${version.documentId}/review`);
    } else {
      console.log('[GitHub] GitHub is not configured, skipping deploy');
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
    revalidatePath(`/documents/${version.documentId}/review`);
  }

  return version;
}

export async function deleteDocumentVersionAction(id: string) {
  const { user } = await authorize('authenticated');

  // Get existing version to check permissions
  const existingVersion = await getDocumentVersionById(id);
  if (!existingVersion) {
    throw new Error('Document version not found');
  }

  // Check if this is a source (English) version
  const language = await getLanguageById(existingVersion.languageId);
  if (!language) {
    throw new Error('Language not found');
  }

  // If this is a source (English) version, only deployers can delete it
  if (language.code === 'en') {
    if (user.role !== Role.ADMIN) {
      throw new Error('Forbidden: Only deployers can delete source (English) document versions');
    }
  }
  // For translation versions, allow deletion (or add appropriate checks if needed)

  return await deleteDocumentVersion(id);
}

export async function updateDocumentVersionStatusAction(
  versionId: string,
  status: DocumentStatus,
): Promise<{
  version: Awaited<ReturnType<typeof updateDocumentVersionStatus>>;
  github?: { status: 'success' | 'failed' | 'skipped'; error?: string; prUrl?: string };
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
        revalidatePath(`/documents/${version.documentId}/review`);
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
      revalidatePath(`/documents/${version.documentId}/review`);
      github = { status: 'failed', error: error.message };
    }
  }

  return { version, github };
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

    // If user is not an admin, add them as a member with TRANSLATOR role
    // (Deployers have access to all projects automatically)
    if (user.role !== Role.ADMIN) {
      // Fetch the created project to get its ID
      const createdProject = await getTranslationProjectBySourceAndLanguage(
        document.sourceProject.id,
        validated.languageId,
      );
      if (createdProject) {
        await createProjectMember({
          translationProjectId: createdProject.id,
          userId: user.id,
          role: ProjectRole.TRANSLATOR,
        });
      }
    }

    // Fetch the translation project again to get the full structure with members
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

  // Check document assignment
  const assignment = await getDocumentAssignmentByDocumentAndProject(validated.documentId, translationProject.id);

  if (assignment) {
    // If document is assigned to a specific user, only that user can translate
    if (assignment.userId && assignment.userId !== user.id) {
      throw new Error('This document is assigned to another user');
    }
    // If unassigned (userId is null), any project member can translate
  }

  // Check if version already exists
  const existingVersion = await getDocumentVersionByDocumentAndLanguage(validated.documentId, validated.languageId);

  if (existingVersion) {
    // If version is already IN_PROGRESS and assigned to current user, return it
    if (existingVersion.status === DocumentStatus.IN_PROGRESS && existingVersion.userId === user.id) {
      return existingVersion;
    }

    // If version is IN_PROGRESS but assigned to different user, don't reassign
    if (existingVersion.status === DocumentStatus.IN_PROGRESS && existingVersion.userId !== user.id) {
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

export async function getVersionsTranslatingByUserAction() {
  const { user } = await authorize('authenticated');

  return prisma.documentVersion.findMany({
    where: {
      userId: user.id,
      status: {
        in: [DocumentStatus.PENDING_TRANSLATION, DocumentStatus.IN_PROGRESS],
      },
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

export async function getVersionsForReviewByUserAction() {
  const { user } = await authorize('authenticated');

  return prisma.documentVersion.findMany({
    where: {
      reviewerId: user.id,
      status: DocumentStatus.PENDING_REVIEW,
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
