'use server';

import { authorize } from '@/lib/authorize';
import { isEmailConfigured } from '@/lib/email';
import { NotificationType } from '@/generated/prisma/enums';
import { z } from 'zod';
import { NOTIFICATION_TYPES, wantsEmail } from './notification.catalog';
import {
  countUnreadNotifications,
  getEmailPreferences,
  listNotificationPage,
  listNotifications,
  markNotificationsRead,
  setEmailPreference,
} from './notification.repository';

/** What the bell shows: the latest notifications and how many are unread. */
export async function getInboxAction() {
  const { user } = await authorize('authenticated');
  const [notifications, unread] = await Promise.all([listNotifications(user.id), countUnreadNotifications(user.id)]);
  return { notifications, unread };
}

/** A page of the notifications page, optionally only the unread ones. */
export async function getNotificationPageAction(options: { cursor?: string; unreadOnly?: boolean } = {}) {
  const { user } = await authorize('authenticated');
  const { cursor, unreadOnly } = z
    .object({ cursor: z.string().uuid().optional(), unreadOnly: z.boolean().optional() })
    .parse(options);
  const [page, unread] = await Promise.all([
    listNotificationPage(user.id, { cursor, unreadOnly }),
    countUnreadNotifications(user.id),
  ]);
  return { ...page, unread };
}

/** The badge alone, for the bell's polling between opens. */
export async function getUnreadCountAction() {
  const { user } = await authorize('authenticated');
  return countUnreadNotifications(user.id);
}

/** Marks the given notifications read, or all of them when no ids are given. */
export async function markNotificationsReadAction(ids?: string[]) {
  const { user } = await authorize('authenticated');
  await markNotificationsRead(user.id, ids ? z.array(z.string().uuid()).parse(ids) : undefined);
}

/** Every type with the user's effective email choice, for the preferences card. */
export async function getEmailPreferencesAction() {
  const { user } = await authorize('authenticated');
  const preferences = await getEmailPreferences(user.id);
  return {
    emailConfigured: isEmailConfigured(),
    preferences: NOTIFICATION_TYPES.map((type) => ({ type, email: wantsEmail(type, preferences) })),
  };
}

export async function setEmailPreferenceAction(type: NotificationType, email: boolean) {
  const { user } = await authorize('authenticated');
  await setEmailPreference(user.id, z.enum(NotificationType).parse(type), z.boolean().parse(email));
}
