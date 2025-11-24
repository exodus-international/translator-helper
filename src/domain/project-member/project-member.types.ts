import { ProjectRole } from '@prisma/client';
import { z } from 'zod';

export const createProjectMemberSchema = z.object({
  translationProjectId: z.string().uuid(),
  userId: z.string(),
  role: z.nativeEnum(ProjectRole),
});

export const updateProjectMemberSchema = z.object({
  role: z.nativeEnum(ProjectRole),
});

export type CreateProjectMemberInput = z.infer<typeof createProjectMemberSchema>;
export type UpdateProjectMemberInput = z.infer<typeof updateProjectMemberSchema>;
