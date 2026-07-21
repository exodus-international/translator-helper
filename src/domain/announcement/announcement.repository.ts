import prisma from '@/lib/db';

export async function listActiveAnnouncements() {
  return prisma.announcement.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listDismissedAnnouncementIds(userId: string): Promise<string[]> {
  const dismissals = await prisma.announcementDismissal.findMany({
    where: { userId },
    select: { announcementId: true },
  });
  return dismissals.map((d) => d.announcementId);
}
