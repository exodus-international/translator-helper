'use server';

import { requireUser } from '@/lib/session';
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
  return await createDocumentAssignment({
    documentId: validated.documentId,
    translationProjectId: validated.translationProjectId,
    userId: validated.userId ?? null,
    deadline: validated.deadline ?? null,
    assignedById: user.id,
  });
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

  return await updateDocumentAssignment(id, updateData);
}

export async function deleteDocumentAssignmentAction(id: string) {
  const user = await requireUser();
  // TODO: Add permission check - only PROJECT_MANAGER can delete assignments

  return await deleteDocumentAssignment(id);
}

export async function getUnassignedDocumentsAction(translationProjectId: string) {
  await requireUser();
  return await getUnassignedDocuments(translationProjectId);
}

export async function getAssignedDocumentsForUserAction(translationProjectId?: string) {
  const user = await requireUser();
  return await getAssignedDocumentsForUser(user.id, translationProjectId);
}
