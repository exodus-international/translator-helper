import prisma from '@/lib/db';
import type { AnnouncementInput } from './announcement.types';

export async function listAnnouncementsWithDismissalCount() {
  return prisma.announcement.findMany({
    include: { _count: { select: { dismissals: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createAnnouncement(data: AnnouncementInput) {
  return prisma.announcement.create({ data });
}

export async function updateAnnouncement(id: string, data: AnnouncementInput) {
  return prisma.announcement.update({ where: { id }, data });
}

export async function deleteAnnouncement(id: string) {
  return prisma.announcement.delete({ where: { id }, select: { id: true } });
}

export async function setAnnouncementActive(id: string, isActive: boolean) {
  return prisma.announcement.update({ where: { id }, data: { isActive } });
}

export async function listActiveAnnouncements() {
  return prisma.announcement.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function dismissAnnouncement(userId: string, announcementId: string) {
  return prisma.announcementDismissal.upsert({
    where: { announcementId_userId: { announcementId, userId } },
    create: { announcementId, userId },
    update: {},
    select: { id: true },
  });
}

export async function listDismissedAnnouncementIds(userId: string): Promise<string[]> {
  const dismissals = await prisma.announcementDismissal.findMany({
    where: { userId },
    select: { announcementId: true },
  });
  return dismissals.map((d) => d.announcementId);
}
