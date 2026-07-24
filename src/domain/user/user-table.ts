// Pure logic for the admin users data table: global search and the
// "language-then-name" ordering. Kept free of React/Prisma so it can be unit
// tested in isolation (see user-table.test.ts).

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

// localeCompare constructs a collator per call; sorting runs O(n log n)
// comparisons, so share one collator and cache each row's first-language key.
const collator = new Intl.Collator();
const firstLanguageCache = new WeakMap<object, string>();

/**
 * The alphabetically-first language name of a user, or '' when they have none.
 */
function firstLanguageName(user: Pick<UserTableRow, 'languages'>): string {
  const cached = firstLanguageCache.get(user);
  if (cached !== undefined) return cached;

  let first = '';
  for (const { language } of user.languages) {
    if (first === '' || collator.compare(language.name, first) < 0) {
      first = language.name;
    }
  }
  firstLanguageCache.set(user, first);
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
    return collator.compare(aLang, bLang);
  }

  return collator.compare(a.name, b.name);
}
