import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getLanguageByCode } from '@/domain/language/language.repository';
import { countOpenWorkByMember } from '@/domain/document-version/document-version.repository';
import { listLanguageMembers } from '@/domain/user-language/user-language.repository';
import { listUsers } from '@/domain/user/user.repository';
import { canAdministerLanguages, canViewLanguage, resolveLanguageViewer } from '@/domain/language/language-access';
import { getUserLanguages } from '@/domain/user-language/user-language.repository';
import LanguageTeamClient from './page.client';

export default async function LanguageTeamPage({ params }: { params: Promise<{ lang: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const { lang } = await params;
  const language = await getLanguageByCode(lang);

  if (!language) {
    notFound();
  }

  // Staffing a language is the manager's job: they answer for the work, and
  // they were already trusted with it from the project board before the pages
  // were consolidated.
  const viewer = resolveLanguageViewer({
    isAdmin: user.role === 'ADMIN',
    memberships: user.role === 'ADMIN' ? [] : await getUserLanguages(user.id),
  });

  if (!canViewLanguage(viewer, language.id)) {
    redirect('/dashboard');
  }

  // Nothing is translated into the source language, so it has no team to show.
  if (language.isSource) {
    redirect(`/languages/${encodeURIComponent(language.code)}/settings`);
  }

  const [members, openWork, users] = await Promise.all([
    listLanguageMembers(language.id),
    countOpenWorkByMember(language.id),
    listUsers(),
  ]);

  return (
    <LanguageTeamClient
      language={{ id: language.id, code: language.code, name: language.name }}
      canAdminister={canAdministerLanguages(viewer)}
      members={members.map((member) => ({
        id: member.id,
        userId: member.userId,
        role: member.role,
        user: member.user,
        openWork: openWork.get(member.userId) ?? 0,
      }))}
      users={users.map((candidate) => ({ id: candidate.id, name: candidate.name, email: candidate.email }))}
    />
  );
}
