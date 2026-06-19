// Pure logic for the admin users data table: language filtering and the
// "language-then-name" ordering. Kept free of React/Prisma so it can be unit
// tested in isolation (see user-table.test.ts).

export interface UserLanguageRef {
  language: { id: string; name: string };
}

export interface UserTableRow {
  name: string;
  languages: UserLanguageRef[];
}

/**
 * Has-language semantics: a user matches when their language set intersects the
 * selected ids. An empty selection matches everyone (no filter applied), so a
 * multi-language user surfaces under each of their languages.
 */
export function matchesLanguageFilter(
  user: Pick<UserTableRow, 'languages'>,
  selectedLanguageIds: string[],
): boolean {
  if (selectedLanguageIds.length === 0) return true;
  const userLanguageIds = new Set(user.languages.map((ul) => ul.language.id));
  return selectedLanguageIds.some((id) => userLanguageIds.has(id));
}

/**
 * The alphabetically-first language name of a user, or '' when they have none.
 */
function firstLanguageName(user: Pick<UserTableRow, 'languages'>): string {
  let first = '';
  for (const { language } of user.languages) {
    if (first === '' || language.name.localeCompare(first) < 0) {
      first = language.name;
    }
  }
  return first;
}

/**
 * Orders users by their first language (alphabetical), then by name. Users with
 * no language sort after everyone else.
 */
export function compareByLanguageThenName(a: UserTableRow, b: UserTableRow): number {
  const aLang = firstLanguageName(a);
  const bLang = firstLanguageName(b);

  if (aLang !== bLang) {
    if (aLang === '') return 1;
    if (bLang === '') return -1;
    return aLang.localeCompare(bLang);
  }

  return a.name.localeCompare(b.name);
}
