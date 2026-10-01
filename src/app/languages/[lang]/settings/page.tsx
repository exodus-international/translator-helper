import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import {
  countLanguageDependents,
  getLanguageByCode,
  getLanguageMemberSummary,
} from '@/domain/language/language.repository';
import { planLanguageDeletion } from '@/domain/language/language-delete';
import LanguageSettingsClient from './page.client';

/**
 * The {lang} segment is Language.code — the same key /documents/exodus90/day-1/cs
 * already uses. It is immutable (see updateLanguageSettingsSchema), so there is
 * no stale-URL case to redirect for.
 */
export default async function LanguageSettingsPage({ params }: { params: Promise<{ lang: string }> }) {
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

  const [members, dependents] = await Promise.all([
    getLanguageMemberSummary(language.id),
    countLanguageDependents(language.id),
  ]);

  return (
    <LanguageSettingsClient
      language={{
        id: language.id,
        code: language.code,
        name: language.name,
        isSource: language.isSource,
        branchName: language.branchName,
        audioProvider: language.audioProvider,
        audioVoice: language.audioVoice,
        translationInstructions: language.translationInstructions,
      }}
      members={members}
      deletionPlan={planLanguageDeletion(language, dependents)}
    />
  );
}
