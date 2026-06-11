import { z } from 'zod';

export const setUserLanguagesSchema = z.object({
  languageIds: z.array(z.string().uuid()).min(1, 'At least one language must be selected'),
});

export const adminSetUserLanguagesSchema = z.object({
  userId: z.string().uuid(),
  languageIds: z.array(z.string().uuid()),
});

