import { notFound, redirect } from 'next/navigation';
import { listBooks, listTranslations } from '@/domain/bible/bible.service';
import { TRANSLATION_CODE } from '@/domain/bible/bible.types';
import { getCurrentUser } from '@/lib/session';
import BibleTranslationClient, { type BibleTab } from './page.client';

const TABS: BibleTab[] = ['books', 'read', 'versification', 'try'];

export default async function BibleTranslationPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tab?: string; book?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const { code } = await params;
  // Only codes: listBooks also accepts a language, and /admin/bible/hr is not a page.
  if (!TRANSLATION_CODE.test(code) || code.length > 40) notFound();

  const [data, translations] = await Promise.all([listBooks(code), listTranslations()]);
  if (!data || data.translation.code !== code) notFound();

  const { tab, book } = await searchParams;
  const initialTab = TABS.find((t) => t === tab) ?? 'books';
  const usfm = book?.toUpperCase();

  return (
    <BibleTranslationClient
      translation={data.translation}
      books={data.books}
      sourceCode={translations.find((t) => t.role === 'source')?.code ?? null}
      initialTab={initialTab === 'versification' && data.translation.role === 'source' ? 'books' : initialTab}
      initialBook={data.books.some((b) => b.id === usfm) ? usfm : undefined}
    />
  );
}
