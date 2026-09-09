import { getUserProfileAction } from '@/domain/user/user.actions';
import { isObjectStorageConfigured } from '@/lib/object-storage';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import ProfileClient from './page.client';

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const profile = await getUserProfileAction();

  return <ProfileClient profile={profile!} avatarUploadEnabled={isObjectStorageConfigured()} />;
}
