import { z } from 'zod';

export const translateDocumentSchema = z.object({
  documentTitle: z.string().min(1),
  sourceLanguageName: z.string().min(1),
  targetLanguageId: z.string().uuid(),
  sourceContent: z.string().min(1),
  currentTranslation: z.string().optional(),
  originalFilename: z.string().optional(),
});

