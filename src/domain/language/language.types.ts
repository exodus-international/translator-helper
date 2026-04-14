import { z } from 'zod';

export const TRANSLATION_INSTRUCTIONS_MAX_LENGTH = 2000;

export const createLanguageSchema = z.object({
  code: z.string().min(2).max(5), // e.g., "en", "cs", "en-US"
  name: z.string().min(2),
  branchName: z.string().optional(),
});

export const updateLanguageSchema = z.object({
  name: z.string().min(2).optional(),
});

export const updateLanguageInstructionsSchema = z.object({
  translationInstructions: z.string().max(TRANSLATION_INSTRUCTIONS_MAX_LENGTH).optional(),
});

export const updateLanguageBranchNameSchema = z.object({
  branchName: z.string().nullable(),
});

export type CreateLanguageInput = z.infer<typeof createLanguageSchema>;
export type UpdateLanguageInput = z.infer<typeof updateLanguageSchema>;
export type UpdateLanguageInstructionsInput = z.infer<typeof updateLanguageInstructionsSchema>;
export type UpdateLanguageBranchNameInput = z.infer<typeof updateLanguageBranchNameSchema>;
