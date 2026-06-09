import { z } from 'zod';

export const createDocumentAssignmentSchema = z.object({
  documentId: z.string().uuid(),
  translationProjectId: z.string().uuid(),
  userId: z.string().min(1).optional().nullable(),
  deadline: z.coerce.date().optional().nullable(),
});

export const updateDocumentAssignmentSchema = z.object({
  userId: z.string().min(1).optional().nullable(),
  deadline: z.coerce.date().optional().nullable(),
});

