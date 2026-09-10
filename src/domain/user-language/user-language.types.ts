import { ProjectRole } from '@/generated/prisma/enums';
import { z } from 'zod';

export const setLanguageMemberRoleSchema = z.object({
  translationProjectId: z.string().uuid(),
  userId: z.string(),
  role: z.nativeEnum(ProjectRole),
});
