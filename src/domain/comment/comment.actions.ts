'use server';

import { requireUser } from '@/lib/session';
import { createCommentSchema, updateCommentSchema } from './comment.types';
import {
  getCommentsByDocumentVersion,
  getCommentById,
  createComment,
  updateComment,
  deleteComment,
} from './comment.repository';

export async function getCommentsByDocumentVersionAction(documentVersionId: string) {
  await requireUser();
  return await getCommentsByDocumentVersion(documentVersionId);
}

export async function getCommentAction(id: string) {
  await requireUser();
  return await getCommentById(id);
}

export async function createCommentAction(input: unknown) {
  const user = await requireUser();
  const validated = createCommentSchema.parse(input);

  return await createComment({
    documentVersionId: validated.documentVersionId,
    userId: user.id,
    content: validated.content,
  });
}

export async function updateCommentAction(id: string, input: unknown) {
  const user = await requireUser();
  const validated = updateCommentSchema.parse(input);

  // Check if user owns the comment
  const comment = await getCommentById(id);
  if (!comment || comment.userId !== user.id) {
    throw new Error('Forbidden: You can only edit your own comments');
  }

  return await updateComment(id, validated.content);
}

export async function deleteCommentAction(id: string) {
  const user = await requireUser();

  // Check if user owns the comment
  const comment = await getCommentById(id);
  if (!comment || comment.userId !== user.id) {
    throw new Error('Forbidden: You can only delete your own comments');
  }

  return await deleteComment(id);
}
