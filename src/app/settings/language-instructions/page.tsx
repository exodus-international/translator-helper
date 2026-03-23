import { listLanguages } from '@/domain/language/language.repository';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import LanguageInstructionsClient from './page.client';

export default async function LanguageInstructionsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const languages = await listLanguages();

  return <LanguageInstructionsClient languages={languages} />;
}
