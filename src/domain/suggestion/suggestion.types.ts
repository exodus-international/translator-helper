import { z } from 'zod';
import { SuggestionStatus, SuggestionType } from '@prisma/client';

export const createSuggestionSchema = z.object({
  documentVersionId: z.string(),
  startLine: z.number().int().min(1).nullable().optional(),
  startColumn: z.number().int().min(1).nullable().optional(),
  endLine: z.number().int().min(1).nullable().optional(),
  endColumn: z.number().int().min(1).nullable().optional(),
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

export const createSuggestionReplySchema = z.object({
  suggestionId: z.string(),
  content: z.string().min(1),
});

export type CreateSuggestionReplyInput = z.infer<typeof createSuggestionReplySchema>;

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
