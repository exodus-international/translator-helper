import { z } from 'zod';

export const createDocumentAssignmentSchema = z.object({
  documentId: z.string().uuid(),
  translationProjectId: z.string().uuid(),
  userId: z.string().uuid().optional().nullable(),
  deadline: z.date().optional().nullable(),
});

export const updateDocumentAssignmentSchema = z.object({
  userId: z.string().uuid().optional().nullable(),
  deadline: z.date().optional().nullable(),
});

export type CreateDocumentAssignmentInput = z.infer<typeof createDocumentAssignmentSchema>;
export type UpdateDocumentAssignmentInput = z.infer<typeof updateDocumentAssignmentSchema>;
