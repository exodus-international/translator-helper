import { z } from 'zod';

export const createDocumentSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9\-]+$/),
  title: z.string().min(1),
  content: z.string(),
  sourceProjectId: z.string().uuid('Source project is required'),
  folderId: z.string().optional(), // Deprecated - kept for backward compatibility
  labels: z.array(z.string()).default([]),
  deadline: z.coerce.date().optional(),
  originalFilename: z.string().optional(),
  type: z.enum(['DAY', 'FIELD_GUIDE', 'DAILY_CONTENT']).optional(),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1).optional(),
  sourceProjectId: z.string().nullable().optional(),
  folderId: z.string().nullable().optional(), // Deprecated - kept for backward compatibility
  labels: z.array(z.string()).optional(),
  deadline: z.coerce.date().nullable().optional(),
  type: z.enum(['DAY', 'FIELD_GUIDE', 'DAILY_CONTENT']).nullable().optional(),
  originalFilename: z.string().nullable().optional(),
});

