// Pure logic for the admin users data table: language filtering, global search,
// and the "language-then-name" ordering. Kept free of React/Prisma so it can be
// unit tested in isolation (see user-table.test.ts).

export interface UserLanguageRef {
  language: { id: string; name: string };
}

export interface UserTableRow {
  name: string;
  languages: UserLanguageRef[];
}

export interface UserSearchRow {
  name: string;
  email: string;
  languages: UserLanguageRef[];
}

/**
 * Global search: case-insensitive substring over the user's name, email, and
 * language names. A blank query matches everyone (no search applied).
 */
export function matchesSearch(user: UserSearchRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  if (user.name.toLowerCase().includes(q)) return true;
  if (user.email.toLowerCase().includes(q)) return true;
  return user.languages.some((ul) => ul.language.name.toLowerCase().includes(q));
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

/**
 * Formats a "last activity" timestamp for the users table: relative for the
 * recent past ("today", "yesterday", "N days ago"), a plain locale date beyond
 * 30 days, and an em dash when there is no activity at all.
 */
export function formatLastActive(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return '—';
  const date = new Date(value);
  const days = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) /
      86_400_000,
  );
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days <= 30) return `${days} days ago`;
  return date.toLocaleDateString();
}
