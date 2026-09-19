import { redirect } from 'next/navigation';

/**
 * Settings is the only tab in phase 1, so the language root lands on it. Team,
 * AI instructions and Overview join it as sibling routes, at which point this
 * becomes the overview rather than a redirect.
 */
export default async function LanguagePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  redirect(`/languages/${encodeURIComponent(lang)}/settings`);
}
