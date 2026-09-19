import { notFound, redirect } from 'next/navigation';
import { getLanguageByCode } from '@/domain/language/language.repository';
import { languageHomePath } from '@/domain/language/language-url';

/**
 * Team is where a language is usually opened for, so the root lands there --
 * the same tab `languageHomePath` sends every other entry point to. Overview
 * takes this route over in phase 4, at which point both follow it.
 */
export default async function LanguagePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const language = await getLanguageByCode(lang);

  if (!language) {
    notFound();
  }

  redirect(languageHomePath(language));
}
