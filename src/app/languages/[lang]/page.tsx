import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import {
  getLanguageByCode,
  getLanguageProgress,
  getLanguageMemberSummary,
} from '@/domain/language/language.repository';
import { languageHealth } from '@/domain/language/language-health';
import { listLanguageMembers } from '@/domain/user-language/user-language.repository';
import LanguageOverviewClient from './page.client';

/**
 * The overview: how far this language has got across every project it appears
 * in, which no screen answered before — progress was only ever shown for one
 * project and one language at a time.
 */
export default async function LanguageOverviewPage({ params }: { params: Promise<{ lang: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const { lang } = await params;
  const language = await getLanguageByCode(lang);

  if (!language) {
    notFound();
  }

  // Nothing is translated into the source language, so there is no progress to
  // roll up and no team to show.
  if (language.isSource) {
    redirect(`/languages/${encodeURIComponent(language.code)}/settings`);
  }

  const [progress, members, roster] = await Promise.all([
    getLanguageProgress(language.id),
    getLanguageMemberSummary(language.id),
    listLanguageMembers(language.id),
  ]);

  return (
    <LanguageOverviewClient
      language={{ code: language.code, name: language.name }}
      progress={progress}
      lastDeployAt={progress.lastDeployAt?.toISOString() ?? null}
      pills={languageHealth({ ...language, ...members })}
      memberCount={roster.length}
      roster={roster.slice(0, 5).map((member) => ({
        id: member.id,
        role: member.role,
        user: member.user,
      }))}
    />
  );
}
