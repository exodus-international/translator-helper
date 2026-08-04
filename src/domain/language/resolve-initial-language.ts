export interface ProjectLanguage {
  id: string;
  name: string;
}

export interface ResolveInitialLanguageParams {
  /** Language ids assigned to the current user (UserLanguage). */
  userLanguageIds: string[];
  /** Languages that actually have a translation project on this source project. */
  projectLanguages: ProjectLanguage[];
}

/**
 * Picks the language a project should open in for a given user.
 *
 * Preference order:
 *  1. A language the user is assigned to that exists on this project.
 *  2. Any language that exists on this project.
 *  3. Nothing, when the project has no translation projects yet.
 *
 * Ties are broken alphabetically by language name, matching the `name: 'asc'`
 * ordering used by the language and translation-project repositories.
 *
 * Deliberately never falls back to "the first language in the system" — doing so
 * made every project open in the globally alphabetically-first language.
 */
export function resolveInitialLanguage({ userLanguageIds, projectLanguages }: ResolveInitialLanguageParams): string {
  const available = [...projectLanguages].sort((a, b) => a.name.localeCompare(b.name));
  const assigned = new Set(userLanguageIds);

  const preferred = available.find((language) => assigned.has(language.id));

  return preferred?.id ?? available[0]?.id ?? '';
}
