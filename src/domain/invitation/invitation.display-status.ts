import type { InvitationStatus } from '@prisma/client';

export type InvitationDisplayStatus = 'active' | 'revoked' | 'expired' | 'exhausted';

export interface InvitationForDisplayStatus {
  status: InvitationStatus;
  expiresAt: Date;
  usedCount: number;
  maxUses: number | null;
}

export function getInvitationDisplayStatus(inv: InvitationForDisplayStatus): InvitationDisplayStatus {
  if (inv.status === 'REVOKED') return 'revoked';
  if (new Date(inv.expiresAt) < new Date()) return 'expired';
  if (inv.maxUses !== null && inv.usedCount >= inv.maxUses) return 'exhausted';
  return 'active';
}
