import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { validateInvitationTokenAction } from '@/domain/invitation/invitation.actions';
import RegisterClient from './page.client';

interface RegisterPageProps {
  params: Promise<{ token: string }>;
}

export default async function RegisterPage({ params }: RegisterPageProps) {
  const user = await getCurrentUser();
  if (user) {
    redirect('/dashboard');
  }

  const { token } = await params;
  const validation = await validateInvitationTokenAction(token);

  return <RegisterClient token={token} validation={validation} />;
}
