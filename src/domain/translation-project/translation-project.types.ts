import { z } from 'zod';

export const createTranslationProjectSchema = z.object({
  name: z.string().min(2),
  sourceProjectId: z.string().uuid(),
  languageId: z.string().uuid(),
});

