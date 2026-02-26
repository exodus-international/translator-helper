import { z } from 'zod';
import { DocumentStatus } from '@prisma/client';

export const createDocumentVersionSchema = z.object({
  documentId: z.string(),
  languageId: z.string(),
  content: z.string(),
});

export const updateDocumentVersionSchema = z.object({
  content: z.string(),
});

export const submitForReviewSchema = z.object({
  versionId: z.string(),
  reviewerId: z.string().optional(),
});

export const reviewVersionSchema = z.object({
  versionId: z.string(),
  approved: z.boolean(),
  comment: z.string().optional(),
});

export type CreateDocumentVersionInput = z.infer<typeof createDocumentVersionSchema>;
export type UpdateDocumentVersionInput = z.infer<typeof updateDocumentVersionSchema>;
export type SubmitForReviewInput = z.infer<typeof submitForReviewSchema>;
export type ReviewVersionInput = z.infer<typeof reviewVersionSchema>;
