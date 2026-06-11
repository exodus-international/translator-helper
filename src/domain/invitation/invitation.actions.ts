'use server';

import crypto from 'node:crypto';
import { auth } from '@/lib/auth';
import { authorize } from '@/lib/authorize';
import prisma from '@/lib/db';
import {
  createInvitation,
  findInvitationByToken,
  incrementUsedCount,
  listInvitations,
  revokeInvitation,
  rollbackInvitationUse,
} from './invitation.repository';
import { setUserLanguages } from '@/domain/user-language/user-language.repository';
import { createInvitationSchema, registerWithInviteSchema } from './invitation.types';
import { validateInvitationToken } from './invitation.validation';

const DEFAULT_EXPIRY_DAYS = 30;

export async function createInvitationAction(input: unknown) {
  const { user } = await authorize('admin');
  const parsed = createInvitationSchema.parse(input);

  const token = crypto.randomUUID();
  const expiresAt = parsed.expiresAt ?? new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const invitation = await createInvitation(token, parsed.maxUses ?? null, expiresAt, user.id, parsed.languageIds);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const inviteUrl = `${baseUrl}/register/${invitation.token}`;

  return { ...invitation, inviteUrl };
}

export async function listInvitationsAction() {
  await authorize('admin');
  return listInvitations();
}

export async function revokeInvitationAction(id: string) {
  await authorize('admin');
  return revokeInvitation(id);
}

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

  const fullName = `${parsed.firstName} ${parsed.lastName}`.trim();

  // 3. Create user — rollback invitation consumption on failure
  try {
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: parsed.email,
        password: parsed.password,
        name: fullName,
      },
    });

    if (!signUpResult?.user) {
      throw new Error('Failed to create account');
    }

    // 4. Set firstName/lastName on user record
    await prisma.user.update({
      where: { id: signUpResult.user.id },
      data: { firstName: parsed.firstName, lastName: parsed.lastName },
    });

    // 5. Auto-assign languages from invitation
    const languageIds = invitation!.languages.map((il) => il.language.id);
    if (languageIds.length > 0) {
      await setUserLanguages(signUpResult.user.id, languageIds);
    }
  } catch (error) {
    await rollbackInvitationUse(invitation!.id);
    throw error;
  }

  return { success: true };
}
