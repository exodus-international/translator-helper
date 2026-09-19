import { listTargetLanguages } from '@/domain/language/language.repository';
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

  // Nothing translates into the source language, so its instructions could
  // never reach a prompt. The flag says so now, where `code !== 'en'` used to.
  const languages = await listTargetLanguages();

  return <LanguageInstructionsClient languages={languages} />;
}
