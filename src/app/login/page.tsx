import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import LoginClient from './page.client';

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect('/dashboard');
  }

  return <LoginClient />;
}
