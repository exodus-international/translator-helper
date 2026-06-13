import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getUserProfileAction } from '@/domain/user/user.actions';
import ProfileClient from './page.client';

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const profile = await getUserProfileAction();

  return <ProfileClient profile={profile!} />;
}
