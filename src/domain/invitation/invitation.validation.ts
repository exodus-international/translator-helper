import type { InvitationStatus } from '@prisma/client';

export interface InvitationForValidation {
  status: InvitationStatus;
  expiresAt: Date;
  usedCount: number;
  maxUses: number | null;
}

type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export function validateInvitationToken(
  invitation: InvitationForValidation | null,
): ValidationResult {
  if (!invitation) {
    return { valid: false, reason: 'Invitation not found' };
  }

  if (invitation.status !== 'ACTIVE') {
    return { valid: false, reason: 'Invitation has been revoked' };
  }

  if (invitation.expiresAt <= new Date()) {
    return { valid: false, reason: 'Invitation has expired' };
  }

  // null = unlimited uses, number = capped
  if (invitation.maxUses !== null && invitation.usedCount >= invitation.maxUses) {
    return { valid: false, reason: 'Invitation has already been used' };
  }

  return { valid: true };
}
