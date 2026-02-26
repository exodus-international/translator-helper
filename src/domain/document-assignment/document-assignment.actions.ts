'use server';

import prisma from '@/lib/db';
import { requireUser } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { createDocumentAssignmentSchema, updateDocumentAssignmentSchema } from './document-assignment.types';
import {
  listDocumentAssignments,
  getDocumentAssignmentById,
  getDocumentAssignmentByDocumentAndProject,
  createDocumentAssignment,
  updateDocumentAssignment,
  deleteDocumentAssignment,
  getUnassignedDocuments,
  getAssignedDocumentsForUser,
} from './document-assignment.repository';

/**
 * When a translator is assigned via DocumentAssignment, also sync the
 * userId on the matching DocumentVersion (if one exists) so both records
 * stay consistent.
 */
async function syncVersionTranslator(documentId: string, translationProjectId: string, userId: string | null) {
  // Only sync when assigning (not unassigning) — DocumentVersion.userId is required
  if (!userId) return;

  const translationProject = await prisma.translationProject.findUnique({
    where: { id: translationProjectId },
    select: { languageId: true },
  });
  if (!translationProject) return;

  await prisma.documentVersion.updateMany({
    where: {
      documentId,
      languageId: translationProject.languageId,
    },
    data: { userId },
  });
}

export async function listDocumentAssignmentsAction(filters?: {
  translationProjectId?: string;
  userId?: string;
  documentId?: string;
}) {
  await requireUser();
  return await listDocumentAssignments(filters);
}

export async function getDocumentAssignmentAction(id: string) {
  await requireUser();
  return await getDocumentAssignmentById(id);
}

export async function getDocumentAssignmentByDocumentAndProjectAction(
  documentId: string,
  translationProjectId: string,
) {
  await requireUser();
  return await getDocumentAssignmentByDocumentAndProject(documentId, translationProjectId);
}

export async function createDocumentAssignmentAction(input: unknown) {
  const user = await requireUser();
  // TODO: Add permission check - only PROJECT_MANAGER can assign documents
  // This will be implemented after permissions system is updated

  const validated = createDocumentAssignmentSchema.parse(input);
  const result = await createDocumentAssignment({
    documentId: validated.documentId,
    translationProjectId: validated.translationProjectId,
    userId: validated.userId ?? null,
    deadline: validated.deadline ?? null,
    assignedById: user.id,
  });

  await syncVersionTranslator(validated.documentId, validated.translationProjectId, validated.userId ?? null);

  revalidatePath('/dashboard');
  revalidatePath(`/documents/${validated.documentId}`, 'layout');
  return result;
}

export async function updateDocumentAssignmentAction(id: string, input: unknown) {
  const user = await requireUser();
  // TODO: Add permission check - only PROJECT_MANAGER can update assignments

  const validated = updateDocumentAssignmentSchema.parse(input);
  const updateData: { userId?: string | null; deadline?: Date | null } = {};

  if (validated.userId !== undefined) {
    updateData.userId = validated.userId ?? null;
  }
  if (validated.deadline !== undefined) {
    updateData.deadline = validated.deadline ?? null;
  }

  const result = await updateDocumentAssignment(id, updateData);

  if (updateData.userId !== undefined) {
    await syncVersionTranslator(result.documentId, result.translationProjectId, updateData.userId ?? null);
  }

  revalidatePath('/dashboard');
  revalidatePath(`/documents/${result.documentId}`, 'layout');
  return result;
}

export async function deleteDocumentAssignmentAction(id: string) {
  const user = await requireUser();
  // TODO: Add permission check - only PROJECT_MANAGER can delete assignments

  const result = await deleteDocumentAssignment(id);
  revalidatePath('/dashboard');
  revalidatePath('/documents', 'layout');
  return result;
}

export async function getUnassignedDocumentsAction(translationProjectId: string) {
  await requireUser();
  return await getUnassignedDocuments(translationProjectId);
}

export async function getAssignedDocumentsForUserAction(translationProjectId?: string) {
  const user = await requireUser();
  return await getAssignedDocumentsForUser(user.id, translationProjectId);
}
