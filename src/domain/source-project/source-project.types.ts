import { z } from 'zod';

export const createSourceProjectSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  identifier: z.string().optional(),
});

export const updateSourceProjectSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  identifier: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'COMPLETE']).optional(),
});

