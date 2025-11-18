import { z } from "zod";

export const createLanguageSchema = z.object({
  code: z.string().min(2).max(5), // e.g., "en", "cs", "en-US"
  name: z.string().min(2),
});

export const updateLanguageSchema = z.object({
  name: z.string().min(2).optional(),
});

export const updateLanguageInstructionsSchema = z.object({
  translationInstructions: z.string().max(2000).optional(),
});

export type CreateLanguageInput = z.infer<typeof createLanguageSchema>;
export type UpdateLanguageInput = z.infer<typeof updateLanguageSchema>;
export type UpdateLanguageInstructionsInput = z.infer<
  typeof updateLanguageInstructionsSchema
>;
