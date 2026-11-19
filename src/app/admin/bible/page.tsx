import { redirect } from 'next/navigation';
import { listTranslations } from '@/domain/bible/bible.service';
import { getCurrentUser } from '@/lib/session';
import BibleAdminClient from './page.client';

export default async function BibleAdminPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const translations = await listTranslations();

  return <BibleAdminClient translations={translations} />;
}
