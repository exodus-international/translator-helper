'use server';

import { authorize } from '@/lib/authorize';
import { listActiveAnnouncements, listDismissedAnnouncementIds } from './announcement.repository';
import { selectVisibleAnnouncements } from './announcement.visibility';

export async function getVisibleAnnouncementsAction() {
  const { user } = await authorize('authenticated');

  const [announcements, dismissedIds] = await Promise.all([
    listActiveAnnouncements(),
    listDismissedAnnouncementIds(user.id),
  ]);

  return selectVisibleAnnouncements(announcements, new Set(dismissedIds), new Date());
}
