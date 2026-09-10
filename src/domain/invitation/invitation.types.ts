import { z } from 'zod';

export const createInvitationSchema = z.object({
  maxUses: z.number().int().min(1).nullable().optional().default(null),
  expiresAt: z.coerce.date().optional(),
  languageIds: z.array(z.string().uuid()).optional(),
});

export const registerWithInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});
