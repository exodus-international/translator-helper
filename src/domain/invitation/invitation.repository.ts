import type { InvitationStatus } from '@prisma/client';
import prisma from '@/lib/db';

export async function createInvitation(
  token: string,
  maxUses: number | null,
  expiresAt: Date,
  createdById: string,
  languageIds?: string[],
) {
  return prisma.invitation.create({
    data: {
      token,
      maxUses,
      expiresAt,
      createdById,
      languages:
        languageIds && languageIds.length > 0
          ? { create: languageIds.map((languageId) => ({ languageId })) }
          : undefined,
    },
    select: {
      id: true,
      token: true,
      maxUses: true,
      expiresAt: true,
      createdAt: true,
      languages: {
        include: { language: { select: { id: true, name: true, code: true } } },
      },
    },
  });
}

export async function listInvitations() {
  return prisma.invitation.findMany({
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      languages: {
        include: { language: { select: { id: true, name: true, code: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeInvitation(id: string) {
  return prisma.invitation.update({
    where: { id },
    data: { status: 'REVOKED' as InvitationStatus },
    select: { id: true, status: true },
  });
}

export async function findInvitationByToken(token: string) {
  return prisma.invitation.findUnique({
    where: { token },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      languages: {
        include: { language: { select: { id: true, name: true, code: true } } },
      },
    },
  });
}

/**
 * Atomically consume one use of an invitation.
 * Checks status, expiry, AND usedCount < maxUses in a single UPDATE.
 * null maxUses = unlimited uses.
 */
export async function incrementUsedCount(id: string): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE invitation
    SET "usedCount" = "usedCount" + 1, "updatedAt" = NOW()
    WHERE id = ${id}
      AND status = 'ACTIVE'
      AND "expiresAt" > NOW()
      AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
  `;
  return result > 0;
}

/**
 * Rollback a consumed invitation use (e.g. if user creation fails after consumption).
 */
export async function rollbackInvitationUse(id: string): Promise<void> {
  await prisma.invitation.updateMany({
    where: { id, usedCount: { gt: 0 } },
    data: { usedCount: { decrement: 1 } },
  });
}
