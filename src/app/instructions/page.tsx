import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { listTargetLanguages } from '@/domain/language/language.repository';
import {
  resolveInstructionsAccess,
  resolveSelectedLanguage,
} from '@/domain/language/language-instructions';
import { getUserLanguages } from '@/domain/user-language/user-language.repository';
import InstructionsClient from './page.client';

/**
 * Instructions have their own place rather than a tab under /languages: that
 * area is administration — access control, branches, voices, deletion — and
 * this is editorial. The people who know how Croatian should read are the
 * Croatian team, so this is where they work, and /languages stays admin-only.
 */
export default async function InstructionsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const [targetLanguages, memberships] = await Promise.all([listTargetLanguages(), getUserLanguages(user.id)]);

  const { languages, editableIds } = resolveInstructionsAccess({
    isAdmin: user.role === 'ADMIN',
    targetLanguages,
    memberships: memberships.map((membership) => ({ languageId: membership.languageId, role: membership.role })),
  });

  const { lang } = await searchParams;
  const selected = resolveSelectedLanguage(languages, lang);

  return (
    <InstructionsClient
      languages={languages.map((language) => ({
        id: language.id,
        code: language.code,
        name: language.name,
        translationInstructions: language.translationInstructions,
        canEdit: editableIds.includes(language.id),
      }))}
      selectedCode={selected?.code ?? null}
    />
  );
}
