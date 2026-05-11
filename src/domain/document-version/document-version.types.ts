import { z } from 'zod';

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
