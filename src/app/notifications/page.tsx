import { getNotificationPageAction } from '@/domain/notification/notification.actions';
import { Role } from '@/generated/prisma/enums';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import NotificationsClient from './page.client';

export default async function NotificationsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?from=/notifications');
  }

  const initial = await getNotificationPageAction();

  return <NotificationsClient initial={initial} isAdmin={user.role === Role.ADMIN} />;
}
