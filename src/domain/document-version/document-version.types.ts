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

export const assignTranslatorToVersionSchema = z.object({
  documentId: z.string().uuid(),
  translationProjectId: z.string().uuid(),
  /** null leaves the document unassigned — open to the whole language team. */
  userId: z.string().min(1).optional().nullable(),
  deadline: z.coerce.date().optional().nullable(),
});
