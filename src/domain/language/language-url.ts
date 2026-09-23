/**
 * Where a language opens. The index, the Users page's badges and the project
 * board's link out all send people to a language, and the bare /languages/hr
 * URL has to land somewhere too -- so the choice is made once here rather than
 * in each of them. The index deep-linked to /settings for a while after the
 * settings tab was the only one, which is how it ended up being the one
 * entry point that disagreed with the rest.
 */
export function languageHomePath(language: { code: string; isSource: boolean }): string {
  // Nothing is translated into the source language, so it has no team tab.
  return `/languages/${encodeURIComponent(language.code)}/${language.isSource ? 'settings' : 'team'}`;
}
