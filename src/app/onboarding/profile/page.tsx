import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { isUserOnboardedAction } from '@/domain/user/user.actions';
import OnboardingProfileClient from './page.client';

export default async function OnboardingProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const onboarded = await isUserOnboardedAction();
  if (onboarded) {
    redirect('/dashboard');
  }

  return <OnboardingProfileClient userFirstName={user.name.split(' ')[0]} userLastName={user.name.split(' ').slice(1).join(' ')} />;
}
