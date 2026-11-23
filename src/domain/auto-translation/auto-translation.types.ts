import { z } from 'zod';

export const setAutoTranslateSchema = z.object({
  translationProjectId: z.string().uuid(),
  enabled: z.boolean(),
});

export const retryAutoTranslationSchema = z.object({
  translationProjectId: z.string().uuid(),
  /** One failed job; all of the project's failures when left out. */
  jobId: z.string().uuid().optional(),
});
