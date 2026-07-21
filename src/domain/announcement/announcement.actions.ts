'use server';

import { z } from 'zod';
import { authorize } from '@/lib/authorize';
import {
  dismissAnnouncement,
  listActiveAnnouncements,
  listDismissedAnnouncementIds,
} from './announcement.repository';
import { selectVisibleAnnouncements } from './announcement.visibility';

export async function getVisibleAnnouncementsAction() {
  const { user } = await authorize('authenticated');

  const [announcements, dismissedIds] = await Promise.all([
    listActiveAnnouncements(),
    listDismissedAnnouncementIds(user.id),
  ]);

  return selectVisibleAnnouncements(announcements, new Set(dismissedIds), new Date());
}

export async function dismissAnnouncementAction(announcementId: unknown) {
  const { user } = await authorize('authenticated');
  const parsed = z.string().uuid().parse(announcementId);
  await dismissAnnouncement(user.id, parsed);
  return { success: true };
}
