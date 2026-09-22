import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getLanguageByCode, getLanguageProgress } from '@/domain/language/language.repository';
import { ProjectRole } from '@/generated/prisma/enums';
import { canAdministerLanguages, canViewLanguage, resolveLanguageViewer } from '@/domain/language/language-access';
import { getUserLanguages } from '@/domain/user-language/user-language.repository';
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

  const { lang } = await params;
  const language = await getLanguageByCode(lang);

  if (!language) {
    notFound();
  }

  const viewer = resolveLanguageViewer({
    isAdmin: user.role === 'ADMIN',
    memberships: user.role === 'ADMIN' ? [] : await getUserLanguages(user.id),
  });

  if (!canViewLanguage(viewer, language.id)) {
    redirect('/dashboard');
  }

  // Nothing is translated into the source language, so there is no progress to
  // roll up and no team to show.
  if (language.isSource) {
    redirect(`/languages/${encodeURIComponent(language.code)}/settings`);
  }

  // The roster carries each member's role and name, which is everything the
  // health pills need to know about managers -- no second read of the same rows.
  const [progress, roster] = await Promise.all([getLanguageProgress(language.id), listLanguageMembers(language.id)]);

  return (
    <LanguageOverviewClient
      language={{ code: language.code, name: language.name }}
      canAdminister={canAdministerLanguages(viewer)}
      progress={progress}
      lastDeployAt={progress.lastDeployAt?.toISOString() ?? null}
      pills={languageHealth({
        ...language,
        memberCount: roster.length,
        managerNames: roster
          .filter((member) => member.role === ProjectRole.PROJECT_MANAGER)
          .map((member) => member.user.name),
      })}
      memberCount={roster.length}
      roster={roster.slice(0, 5).map((member) => ({
        id: member.id,
        role: member.role,
        user: member.user,
      }))}
    />
  );
}
