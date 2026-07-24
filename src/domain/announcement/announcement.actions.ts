'use server';

import { z } from 'zod';
import { authorize } from '@/lib/authorize';
import {
  createAnnouncement,
  deleteAnnouncement,
  dismissAnnouncement,
  listActiveAnnouncements,
  listAnnouncementsWithDismissalCount,
  listDismissedAnnouncementIds,
  setAnnouncementActive,
  updateAnnouncement,
} from './announcement.repository';
import { announcementInputSchema } from './announcement.types';
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

export async function listAnnouncementsAction() {
  await authorize('admin');
  return listAnnouncementsWithDismissalCount();
}

export async function createAnnouncementAction(input: unknown) {
  await authorize('admin');
  const parsed = announcementInputSchema.parse(input);
  return createAnnouncement(parsed);
}

export async function updateAnnouncementAction(id: string, input: unknown) {
  await authorize('admin');
  const parsedId = z.string().uuid().parse(id);
  const parsed = announcementInputSchema.parse(input);
  return updateAnnouncement(parsedId, parsed);
}

export async function deleteAnnouncementAction(id: string) {
  await authorize('admin');
  const parsedId = z.string().uuid().parse(id);
  return deleteAnnouncement(parsedId);
}

export async function toggleAnnouncementActiveAction(id: string, isActive: boolean) {
  await authorize('admin');
  const parsedId = z.string().uuid().parse(id);
  const parsedActive = z.boolean().parse(isActive);
  return setAnnouncementActive(parsedId, parsedActive);
}
