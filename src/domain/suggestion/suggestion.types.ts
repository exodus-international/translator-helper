import { z } from 'zod';
import { SuggestionStatus, SuggestionType } from '@prisma/client';

export const createSuggestionSchema = z.object({
  documentVersionId: z.string(),
  startLine: z.number().int().min(1),
  startColumn: z.number().int().min(1),
  endLine: z.number().int().min(1),
  endColumn: z.number().int().min(1),
  type: z.nativeEnum(SuggestionType),
  comment: z
    .string()
    .optional()
    .transform((value) => (value ?? '').trim()),
  proposedText: z.string().optional(),
  version: z.number().int().min(1),
});

export const updateSuggestionStatusSchema = z.object({
  status: z.nativeEnum(SuggestionStatus),
  dismissedReason: z.string().optional(),
});

export const applySuggestionSchema = z.object({
  suggestionId: z.string(),
});

export const dismissSuggestionSchema = z.object({
  suggestionId: z.string(),
  dismissedReason: z.string().optional(),
});

export type CreateSuggestionInput = z.infer<typeof createSuggestionSchema>;
export type UpdateSuggestionStatusInput = z.infer<typeof updateSuggestionStatusSchema>;
export type ApplySuggestionInput = z.infer<typeof applySuggestionSchema>;
export type DismissSuggestionInput = z.infer<typeof dismissSuggestionSchema>;

export interface SuggestionFilters {
  status?: SuggestionStatus | 'ALL';
  type?: SuggestionType | 'ALL';
  userId?: string;
}

export interface MonacoRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}
