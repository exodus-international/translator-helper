import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { listAnnouncementsWithDismissalCount } from '@/domain/announcement/announcement.repository';
import AnnouncementsClient from './page.client';

export default async function AnnouncementsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const announcements = await listAnnouncementsWithDismissalCount();

  return <AnnouncementsClient announcements={announcements} />;
}
