import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { listLanguagesForIndex } from '@/domain/language/language.repository';
import { canAdministerLanguages, resolveLanguageViewer, visibleLanguages } from '@/domain/language/language-access';
import { getUserLanguages } from '@/domain/user-language/user-language.repository';
import LanguagesIndexClient from './page.client';

export default async function LanguagesIndexPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const viewer = resolveLanguageViewer({
    isAdmin: user.role === 'ADMIN',
    memberships: user.role === 'ADMIN' ? [] : await getUserLanguages(user.id),
  });

  // Someone who manages nothing has nothing to see here: the index is a list of
  // languages you are answerable for.
  if (viewer.kind === 'none') {
    redirect('/dashboard');
  }

  return (
    <LanguagesIndexClient
      languages={visibleLanguages(viewer, await listLanguagesForIndex())}
      canAdminister={canAdministerLanguages(viewer)}
    />
  );
}
