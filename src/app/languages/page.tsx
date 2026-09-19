import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { listLanguagesForIndex } from '@/domain/language/language.repository';
import LanguagesIndexClient from './page.client';

export default async function LanguagesIndexPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  return <LanguagesIndexClient languages={await listLanguagesForIndex()} />;
}
