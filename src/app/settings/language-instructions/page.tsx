import { listLanguages } from '@/domain/language/language.repository';
import { canManageLanguages } from '@/lib/permissions';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import LanguageInstructionsClient from './page.client';

export default async function LanguageInstructionsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!canManageLanguages(user)) {
    redirect('/dashboard');
  }

  const languages = await listLanguages();

  return <LanguageInstructionsClient languages={languages} />;
}
