import prisma from '@/lib/db';

export async function findInvitationByToken(token: string) {
  return prisma.invitation.findUnique({
    where: { token },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
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
