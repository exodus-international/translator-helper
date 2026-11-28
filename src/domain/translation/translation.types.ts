import { z } from 'zod';

/**
 * The largest document AI translation takes, in characters. The longest real
 * one is about 225,000; the cap keeps one request from holding the server on
 * the matching and Scripture work that runs before the model is called.
 */
export const MAX_TRANSLATION_SOURCE = 300_000;

/**
 * The draft sent along only goes into the prompt, and a translation runs
 * longer than its source (German and Croatian by up to a third): a cap at the
 * source's size would turn AI translation off on the longest documents.
 */
export const MAX_CURRENT_TRANSLATION = 2 * MAX_TRANSLATION_SOURCE;

export const translateDocumentSchema = z.object({
  documentTitle: z.string().min(1),
  sourceLanguageName: z.string().min(1),
  targetLanguageId: z.string().uuid(),
  sourceContent: z.string().min(1).max(MAX_TRANSLATION_SOURCE),
  currentTranslation: z.string().max(MAX_CURRENT_TRANSLATION).optional(),
  originalFilename: z.string().optional(),
  /** The document being translated: its project's standard translations are used too. */
  documentId: z.string().uuid().optional(),
});

