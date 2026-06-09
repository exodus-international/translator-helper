import { ProjectRole } from '@prisma/client';
import { z } from 'zod';

export const createProjectMemberSchema = z.object({
  translationProjectId: z.string().uuid(),
  userId: z.string(),
  role: z.nativeEnum(ProjectRole),
});

