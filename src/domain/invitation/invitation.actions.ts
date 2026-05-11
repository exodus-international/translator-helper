'use server';

import { auth } from '@/lib/auth';
import { findInvitationByToken, incrementUsedCount, rollbackInvitationUse } from './invitation.repository';
import { registerWithInviteSchema } from './invitation.types';
import { validateInvitationToken } from './invitation.validation';

export async function validateInvitationTokenAction(
  token: string,
): Promise<{ valid: true; inviterName: string } | { valid: false; reason: string }> {
  const invitation = await findInvitationByToken(token);
  const result = validateInvitationToken(invitation);

  if (!result.valid) {
    return result;
  }

  return {
    valid: true,
    inviterName: invitation!.createdBy.name,
  };
}

export async function registerWithInviteAction(input: unknown) {
  const parsed = registerWithInviteSchema.parse(input);

  // 1. Find and validate the invitation
  const invitation = await findInvitationByToken(parsed.token);
  const validation = validateInvitationToken(invitation);

  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  // 2. Consume atomically FIRST — fails fast if already used
  const consumed = await incrementUsedCount(invitation!.id);
  if (!consumed) {
    throw new Error('Invitation has already been used');
  }

  // 3. Create user — rollback invitation consumption on failure
  try {
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: parsed.email,
        password: parsed.password,
        name: parsed.name,
      },
    });

    if (!signUpResult?.user) {
      throw new Error('Failed to create account');
    }
  } catch (error) {
    await rollbackInvitationUse(invitation!.id);
    throw error;
  }

  return { success: true };
}
