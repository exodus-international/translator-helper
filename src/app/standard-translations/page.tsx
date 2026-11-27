import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { listTargetLanguages } from '@/domain/language/language.repository';
import { resolveInstructionsAccess, resolveSelectedLanguage } from '@/domain/language/language-instructions';
import { getUserLanguages } from '@/domain/user-language/user-language.repository';
import { listStandardTranslations } from '@/domain/standard-translation/standard-translation.repository';
import { parseScope } from '@/domain/standard-translation/standard-translation.types';
import {
  buildListSearchParams,
  DEFAULT_PAGE_SIZE,
  getTotalPages,
  parseListParams,
  toURLSearchParams,
} from '@/lib/list-params';
import StandardTranslationsClient from './page.client';

const PAGE_PATH = '/standard-translations';

/**
 * A language team's dictionary of standard translations. It sits next to AI
 * instructions for the same reason: it is the team's editorial work, read by
 * the same people. Only languages the viewer can read are listed, and only
 * the selected one is read from the database.
 */
export default async function StandardTranslationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const [targetLanguages, memberships] = await Promise.all([listTargetLanguages(), getUserLanguages(user.id)]);

  // Read by the same people as AI instructions (the language's team, and
  // admins), and written by all of them: `authorize({ language, role: 'member' })`
  // asks that for every change, so whoever sees a language may edit it.
  const { languages } = resolveInstructionsAccess({
    isAdmin: user.role === 'ADMIN',
    targetLanguages,
    memberships: memberships.map((membership) => ({ languageId: membership.languageId, role: membership.role })),
  });

  const params = await searchParams;
  const lang = Array.isArray(params.lang) ? params.lang[0] : params.lang;
  const selected = resolveSelectedLanguage(languages, lang);
  // No sorting: the list has one order. The page size is fixed, so only `page` and `q` are read.
  const { page, q } = parseListParams(params, { allowedSorts: [], defaultSort: '' });

  const list = selected
    ? await listStandardTranslations({ languageId: selected.id, q, page, selection: parseScope(params.scope) })
    : null;

  // A bookmarked page past the end would show an empty table under a range
  // line that contradicts it: send it to the last page instead.
  if (list) {
    const totalPages = getTotalPages(list.total, DEFAULT_PAGE_SIZE);
    if (page > totalPages && list.total > 0) {
      redirect(
        `${PAGE_PATH}${buildListSearchParams(toURLSearchParams(params), { page: totalPages === 1 ? null : totalPages })}`,
      );
    }
  }

  return (
    <StandardTranslationsClient
      languages={languages.map((language) => ({
        id: language.id,
        code: language.code,
        name: language.name,
      }))}
      selectedCode={selected?.code ?? null}
      list={list}
      q={q}
      page={page}
    />
  );
}
