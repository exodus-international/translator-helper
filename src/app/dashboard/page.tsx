import { listTargetLanguages } from '@/domain/language/language.repository';
import { getTranslationProjectsByUserAction } from '@/domain/translation-project/translation-project.actions';
import { getUserLanguagesCountAction } from '@/domain/user-language/user-language.actions';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import DashboardClient from './page.client';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    language?: string;
    status?: string;
    translationProject?: string;
    search?: string;
  }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  // Check if user has selected languages, redirect to onboarding if not
  const languagesCount = await getUserLanguagesCountAction();
  if (languagesCount === 0) {
    redirect('/onboarding/languages');
  }

  const params = await searchParams;

  // Fetch target languages (excluding English) and user's translation projects for filters
  const languages = await listTargetLanguages();
  const translationProjects = await getTranslationProjectsByUserAction();

  // Set default language to first non-English language if not specified
  const defaultLanguage = params.language || languages[0]?.id || '';

  return (
    <DashboardClient
      user={user}
      languages={languages}
      translationProjects={translationProjects}
      initialFilters={{
        language: defaultLanguage,
        status: params.status || 'needs-translation',
        translationProject: params.translationProject,
        search: params.search,
      }}
    />
  );
}
