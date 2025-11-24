import { z } from 'zod';

export const createTranslationProjectSchema = z.object({
  name: z.string().min(2),
  sourceProjectId: z.string().uuid(),
  languageId: z.string().uuid(),
});

export const updateTranslationProjectSchema = z.object({
  name: z.string().min(2).optional(),
});

export type CreateTranslationProjectInput = z.infer<typeof createTranslationProjectSchema>;
export type UpdateTranslationProjectInput = z.infer<typeof updateTranslationProjectSchema>;
