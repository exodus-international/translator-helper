import { ProjectRole } from '@/generated/prisma/enums';
import { z } from 'zod';

/**
 * Keyed by language, not by translation project. The old schema took a
 * `translationProjectId` and resolved the language from it, which encoded the
 * wrong scope: the row being written grants a role on every project in the
 * language, and the caller had to know that to read the call.
 *
 * `languageId` is here even though v1 is admin-only, so a future PM-facing
 * version needs no signature change.
 */
export const setLanguageMemberRoleSchema = z.object({
  languageId: z.string().uuid(),
  userId: z.string(),
  role: z.nativeEnum(ProjectRole),
});

export const removeLanguageMemberSchema = z.object({
  languageId: z.string().uuid(),
  userId: z.string(),
});
