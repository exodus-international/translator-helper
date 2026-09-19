import { notFound, redirect } from 'next/navigation';
import { getLanguageByCode } from '@/domain/language/language.repository';

/**
 * Team is where a language is usually opened for, so the root lands there. The
 * source language has no team and lands on its settings instead. Overview takes
 * this route over in phase 4, at which point neither redirect is needed.
 */
export default async function LanguagePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const language = await getLanguageByCode(lang);

  if (!language) {
    notFound();
  }

  redirect(`/languages/${encodeURIComponent(language.code)}/${language.isSource ? 'settings' : 'team'}`);
}
