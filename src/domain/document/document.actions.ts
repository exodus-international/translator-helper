'use server';

import prisma from '@/lib/db';
import { isAdmin } from '@/lib/permissions';
import { requireUser } from '@/lib/session';
import { DocumentStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { createActivityLog } from '../activity-log/activity-log.repository';
import {
  createDocumentVersion,
  deleteDocumentVersionsByDocumentId,
} from '../document-version/document-version.repository';
import {
  createDocument,
  deleteDocument,
  getDashboardDocuments,
  getDocumentById,
  getDocumentBySlug,
  getDocumentsByUser,
  getDocumentsNeedingTranslation,
  getDocumentsPendingReview,
  getDocumentsReadyToDeploy,
  getDocumentsWithAllVersions,
  listDocuments,
  updateDocument,
} from './document.repository';
import { createDocumentSchema, updateDocumentSchema } from './document.types';

export async function listDocumentsAction(filters?: {
  sourceProjectId?: string;
  folderId?: string; // Deprecated - kept for backward compatibility
  labels?: string[];
  search?: string;
}) {
  await requireUser();
  return await listDocuments(filters);
}

export async function getDocumentAction(id: string) {
  await requireUser();
  return await getDocumentById(id);
}

export async function getDocumentBySlugAction(slug: string) {
  await requireUser();
  return await getDocumentBySlug(slug);
}

export async function createDocumentAction(input: unknown) {
  const user = await requireUser();
  const validated = createDocumentSchema.parse(input);

  // Create the document
  const document = await createDocument({
    slug: validated.slug,
    title: validated.title,
    sourceProjectId: validated.sourceProjectId,
    folderId: validated.folderId, // Deprecated - kept for backward compatibility
    labels: validated.labels,
    deadline: validated.deadline,
    originalFilename: validated.originalFilename,
    type: validated.type,
  });

  // Create the English (source) version with APPROVED status
  // First, get the English language ID
  const englishLang = await prisma.language.findUnique({
    where: { code: 'en' },
  });

  if (!englishLang) {
    throw new Error('English language not found in database');
  }

  const version = await createDocumentVersion({
    documentId: document.id,
    languageId: englishLang.id,
    content: validated.content,
    status: DocumentStatus.APPROVED,
    userId: user.id,
  });

  // Log the activity
  await createActivityLog({
    documentVersionId: version.id,
    userId: user.id,
    action: 'created',
    details: { title: document.title, slug: document.slug },
  });

  return document;
}

export async function updateDocumentAction(id: string, input: unknown) {
  const user = await requireUser();

  // Only deployers can update documents (since documents contain source versions)
  if (!isAdmin(user)) {
    throw new Error('Forbidden: Only deployers can edit documents');
  }

  const validated = updateDocumentSchema.parse(input);

  const document = await updateDocument(id, validated);

  return document;
}

export async function deleteDocumentAction(id: string) {
  const user = await requireUser();

  // Only deployers can delete documents
  if (!isAdmin(user)) {
    throw new Error('Forbidden: Only deployers can delete documents');
  }

  return await deleteDocument(id);
}

// Wrapper that returns void for client component compatibility
export async function deleteDocumentActionVoid(id: string): Promise<void> {
  const user = await requireUser();

  // Only deployers can delete documents
  if (!isAdmin(user)) {
    throw new Error('Forbidden: Only deployers can delete documents');
  }

  await deleteDocumentAction(id);
  await deleteDocumentVersionsByDocumentId(id);
  revalidatePath('/documents');
}

export async function getDocumentsNeedingTranslationAction(languageId: string, translationProjectId?: string) {
  await requireUser();
  return await getDocumentsNeedingTranslation(languageId, translationProjectId);
}

export async function getDocumentsPendingReviewAction(languageId?: string, translationProjectId?: string) {
  await requireUser();
  return await getDocumentsPendingReview(languageId, translationProjectId);
}

export async function getDocumentsReadyToDeployAction(languageId?: string, translationProjectId?: string) {
  await requireUser();
  return await getDocumentsReadyToDeploy(languageId, translationProjectId);
}

export async function getDocumentsByUserAction(languageId?: string, translationProjectId?: string) {
  const user = await requireUser();
  return await getDocumentsByUser(user.id, languageId, translationProjectId);
}

export async function getDocumentsWithAllVersionsAction() {
  await requireUser();
  return await getDocumentsWithAllVersions();
}

export async function getDashboardDocumentsAction(languageId: string, sourceProjectId?: string) {
  await requireUser();
  return await getDashboardDocuments(languageId, sourceProjectId);
}

export async function toggleDocumentLabelAction(documentId: string, label: string) {
  const user = await requireUser();

  // Get the document to check its current labels
  const document = await getDocumentById(documentId);
  if (!document) {
    throw new Error('Document not found');
  }

  // Check if label exists
  const currentLabels = document.labels || [];
  const hasLabel = currentLabels.includes(label);

  // Toggle the label
  const newLabels = hasLabel ? currentLabels.filter((l) => l !== label) : [...currentLabels, label];

  // Update the document directly (bypassing deployer check for label toggling)
  // This allows reviewers to toggle labels when documents are in PENDING_REVIEW
  const updated = await prisma.document.update({
    where: { id: documentId },
    data: { labels: newLabels },
    include: {
      folder: true,
      sourceProject: true,
      versions: true,
    },
  });

  // Revalidate paths
  revalidatePath('/dashboard');
  revalidatePath(`/documents/${documentId}`);

  return updated;
}
