import { z } from 'zod';

export const createInvitationSchema = z.object({
  maxUses: z.number().int().min(1).nullable().optional().default(null),
  expiresAt: z.coerce.date().optional(),
});

export const registerWithInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type RegisterWithInviteInput = z.infer<typeof registerWithInviteSchema>;
