/**
 * The "Waiting for Deploy" filter is remembered in localStorage, and the
 * languages it can name are only those with a document waiting right now. Once
 * a language's last document is deployed, the stored id points at nothing: the
 * table filters down to no rows and the select, which has no label for that
 * id, shows the id itself. A stored language that is no longer on offer means
 * "all".
 */
export function resolveDeployLanguageFilter(stored: string, languages: readonly { id: string }[]): string {
  return languages.some((language) => language.id === stored) ? stored : 'all';
}
