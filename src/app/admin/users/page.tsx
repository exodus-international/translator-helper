import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { listUsersAction } from '@/domain/user/user.actions';
import { listInvitationsAction } from '@/domain/invitation/invitation.actions';
import UsersClient from './page.client';

export default async function UsersPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const [users, invitations] = await Promise.all([
    listUsersAction(),
    listInvitationsAction(),
  ]);

  return <UsersClient users={users} invitations={invitations} />;
}
