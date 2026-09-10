import { ProjectRole } from '@/generated/prisma/enums';
import { z } from 'zod';

export const setUserLanguagesSchema = z.object({
  languageIds: z.array(z.string().uuid()).min(1, 'At least one language must be selected'),
});

export const setLanguageMemberRoleSchema = z.object({
  translationProjectId: z.string().uuid(),
  userId: z.string(),
  role: z.nativeEnum(ProjectRole),
});
