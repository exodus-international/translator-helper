import { z } from 'zod';

export const createCommentSchema = z.object({
  documentVersionId: z.string(),
  content: z.string().min(1),
});

export const updateCommentSchema = z.object({
  content: z.string().min(1),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
