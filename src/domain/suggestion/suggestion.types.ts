import { z } from 'zod';
import { SuggestionStatus, SuggestionType } from '@/generated/prisma/enums';

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

export const applySuggestionSchema = z.object({
  suggestionId: z.string(),
});

export const dismissSuggestionSchema = z.object({
  suggestionId: z.string(),
  dismissedReason: z.string().optional(),
});

export const reopenSuggestionSchema = z.object({
  suggestionId: z.string(),
});

export const editSuggestionSchema = z.object({
  suggestionId: z.string(),
  comment: z
    .string()
    .optional()
    .transform((value) => (value ?? '').trim()),
  proposedText: z.string().optional(),
});

export const createSuggestionReplySchema = z.object({
  suggestionId: z.string(),
  content: z.string().min(1),
});

export interface SuggestionFilters {
  status?: SuggestionStatus | 'ALL';
  type?: SuggestionType | 'ALL';
  userId?: string;
}

export interface SuggestionReplyWithUser {
  id: string;
  suggestionId: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
}

/** A suggestion joined with its author, as the editor and sidebar render it. */
export interface SuggestionWithUser {
  id: string;
  startLine?: number | null;
  startColumn?: number | null;
  endLine?: number | null;
  endColumn?: number | null;
  type: SuggestionType;
  status: SuggestionStatus;
  comment: string;
  proposedText: string | null;
  originalText: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  createdAt: string;
  version: number;
  replies?: SuggestionReplyWithUser[];
}
