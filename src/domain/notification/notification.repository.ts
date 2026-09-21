import prisma from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { NotificationEmailStatus, NotificationType } from '@/generated/prisma/enums';

export const INBOX_PAGE_SIZE = 30;

const inboxSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  url: true,
  readAt: true,
  createdAt: true,
  actor: { select: { id: true, name: true, email: true, image: true } },
} satisfies Prisma.NotificationSelect;

export type InboxNotification = Prisma.NotificationGetPayload<{ select: typeof inboxSelect }>;

export async function listNotifications(userId: string, take = INBOX_PAGE_SIZE): Promise<InboxNotification[]> {
  return prisma.notification.findMany({
    where: { userId },
    select: inboxSelect,
    orderBy: { createdAt: 'desc' },
    take,
  });
}

/**
 * One page of the notifications page, newest first, continuing after `cursor`
 * (the id of the last notification already shown).
 */
export async function listNotificationPage(
  userId: string,
  options: { cursor?: string; unreadOnly?: boolean; take?: number } = {},
): Promise<{ notifications: InboxNotification[]; nextCursor: string | null }> {
  const take = options.take ?? INBOX_PAGE_SIZE;
  const rows = await prisma.notification.findMany({
    where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
    select: inboxSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const notifications = hasMore ? rows.slice(0, take) : rows;
  return { notifications, nextCursor: hasMore ? notifications[notifications.length - 1].id : null };
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/**
 * Marks the user's own notifications read. Reading one in the app also takes it
 * out of the next email digest: there is no point emailing what was just seen.
 */
export async function markNotificationsRead(userId: string, ids?: string[]) {
  const where: Prisma.NotificationWhereInput = { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) };
  await prisma.$transaction([
    prisma.notification.updateMany({
      where: { ...where, emailStatus: NotificationEmailStatus.PENDING },
      data: { emailStatus: NotificationEmailStatus.SKIPPED, emailError: 'Read in the app first' },
    }),
    prisma.notification.updateMany({ where, data: { readAt: new Date() } }),
  ]);
}

export async function getEmailPreferences(userId: string): Promise<Map<NotificationType, boolean>> {
  const rows = await prisma.notificationPreference.findMany({ where: { userId }, select: { type: true, email: true } });
  return new Map(rows.map((row) => [row.type, row.email]));
}

/** Email preferences for several users in one query, for fan-out. */
export async function getEmailPreferencesFor(userIds: string[]): Promise<Map<string, Map<NotificationType, boolean>>> {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, type: true, email: true },
  });
  const byUser = new Map<string, Map<NotificationType, boolean>>();
  for (const row of rows) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, new Map());
    byUser.get(row.userId)!.set(row.type, row.email);
  }
  return byUser;
}

export async function setEmailPreference(userId: string, type: NotificationType, email: boolean) {
  await prisma.notificationPreference.upsert({
    where: { userId_type: { userId, type } },
    create: { userId, type, email },
    update: { email },
  });
}

/**
 * Inserts notifications, skipping any whose dedupeKey already exists — that is
 * what makes the reminder sweep safe to run as often as it likes.
 */
export async function insertNotifications(rows: Prisma.NotificationCreateManyInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await prisma.notification.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}
