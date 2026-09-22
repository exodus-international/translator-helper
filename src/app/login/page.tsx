import { safeRedirectPath } from '@/lib/safe-redirect';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import LoginClient from './page.client';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const user = await getCurrentUser();
  // Where the visitor was headed, e.g. a document linked from a notification email.
  const next = safeRedirectPath((await searchParams).from);

  if (user) {
    redirect(next);
  }

  return <LoginClient next={next} />;
}
