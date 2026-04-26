import { z } from 'zod';
import { Role } from '@prisma/client';

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.nativeEnum(Role).optional(),
});
