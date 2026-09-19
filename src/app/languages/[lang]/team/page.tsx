import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getLanguageByCode } from '@/domain/language/language.repository';
import { countOpenWorkByMember } from '@/domain/document-version/document-version.repository';
import { listLanguageMembers } from '@/domain/user-language/user-language.repository';
import { listUsers } from '@/domain/user/user.repository';
import LanguageTeamClient from './page.client';

export default async function LanguageTeamPage({ params }: { params: Promise<{ lang: string }> }) {
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
