'use server';

import prisma from '@/lib/db';
import { authorize } from '@/lib/authorize';
import { DocumentStatus, DocumentType } from '@/generated/prisma/enums';
import { revalidatePath } from 'next/cache';
import { createActivityLog } from '../activity-log/activity-log.repository';
import {
  createDocumentVersion,
  createMissingDocumentVersions,
  deleteDocumentVersionsByDocumentId,
} from '../document-version/document-version.repository';
import {
  countDocumentsOverview,
  createDocument,
  deleteDocument,
  getDashboardDocuments,
  getDocumentById,
  listDocuments,
  listDocumentsOverviewPaginated,
  updateDocument,
  type DocumentOverviewSort,
} from './document.repository';
import { canAccessSourceProject } from '@/lib/permissions';
import { createDocumentSchema, toggleDocumentLabelSchema, updateDocumentSchema } from './document.types';

export async function listDocumentsAction(filters?: {
  sourceProjectId?: string;
  folderId?: string; // Deprecated - kept for backward compatibility
  labels?: string[];
  search?: string;
}) {
  await authorize('authenticated');
  return await listDocuments(filters);
}

export async function createDocumentAction(input: unknown) {
  // Source documents are admin-managed, like updating and deleting them below.
  const { user } = await authorize('admin');
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

  // Give every language already being translated a version to render, so the
  // document shows up on their boards instead of appearing as a gap.
  const translationProjects = await prisma.translationProject.findMany({
    where: { sourceProjectId: validated.sourceProjectId },
    select: { languageId: true },
  });
  await createMissingDocumentVersions(
    [document.id],
    translationProjects.map((tp) => tp.languageId),
  );

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
  await authorize('admin');

  const validated = updateDocumentSchema.parse(input);

  const document = await updateDocument(id, validated);

  return document;
}

export async function deleteDocumentAction(id: string) {
  await authorize('admin');

  return await deleteDocument(id);
}

// Wrapper that returns void for client component compatibility
export async function deleteDocumentActionVoid(id: string): Promise<void> {
  await authorize('admin');

  await deleteDocumentAction(id);
  await deleteDocumentVersionsByDocumentId(id);
  revalidatePath('/documents');
}

/**
 * Server-side pagination, search, and sorting for the Documents Overview
 * (issue #51). Returns the page plus the total so the caller can render
 * "Showing 1–25 of 142".
 *
 * The count and the page are two independent queries, so a concurrent
 * insert can make the total disagree with the page by one row. Fine at
 * this scale; the pagination range clamps defensively regardless.
 */
export async function listDocumentsOverviewAction(filters: {
  search?: string;
  sourceProjectId?: string;
  types?: DocumentType[];
  sort?: DocumentOverviewSort;
  order?: 'asc' | 'desc';
  skip?: number;
  take?: number;
}) {
  // Feeds the admin-only /documents overview; the per-language boards read
  // through listDocumentsAction and getDashboardDocumentsAction instead.
  await authorize('admin');
  const [documents, total] = await Promise.all([
    listDocumentsOverviewPaginated(filters),
    countDocumentsOverview(filters),
  ]);
  return { documents, total };
}

export async function getDashboardDocumentsAction(languageId: string, sourceProjectId?: string) {
  await authorize('authenticated');
  return await getDashboardDocuments(languageId, sourceProjectId);
}

export async function toggleDocumentLabelAction(documentId: unknown, label: unknown) {
  const { user } = await authorize('authenticated');
  const validated = toggleDocumentLabelSchema.parse({ documentId, label });

  const document = await getDocumentById(validated.documentId);
  if (!document) {
    throw new Error('Document not found');
  }

  // Labels live on the document, shared by every language, so the gate is the
  // source project: an admin, or someone on a language team translating it.
  if (!document.sourceProjectId || !(await canAccessSourceProject(user, document.sourceProjectId))) {
    throw new Error('Forbidden: requires membership of a team working on this document');
  }

  const currentLabels = document.labels || [];
  const hasLabel = currentLabels.includes(validated.label);
  const newLabels = hasLabel ? currentLabels.filter((l) => l !== validated.label) : [...currentLabels, validated.label];

  // Written directly (no deployer check) so reviewers can toggle labels while a
  // document is in PENDING_REVIEW. Only the labels go back to the caller.
  const updated = await prisma.document.update({
    where: { id: validated.documentId },
    data: { labels: newLabels },
    select: { id: true, labels: true },
  });

  revalidatePath('/dashboard');
  revalidatePath('/documents/[project]/[slug]/[lang]', 'page');

  return updated;
}
