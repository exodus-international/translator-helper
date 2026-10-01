import { getEmailPreferencesAction } from '@/domain/notification/notification.actions';
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

  const [profile, notificationPreferences] = await Promise.all([getUserProfileAction(), getEmailPreferencesAction()]);

  return (
    <ProfileClient
      profile={profile!}
      avatarUploadEnabled={isObjectStorageConfigured()}
      notificationPreferences={notificationPreferences}
    />
  );
}
