/**
 * Project URLs are keyed by SourceProject.slug, the same segment that opens a
 * document:
 *
 *   /projects/advent2025
 *   /projects/advent2025/translations
 *
 * The old shape put the row id in that position. Those links are still in Slack
 * and mail, so the route accepts a UUID too and redirects to the readable path.
 * `slug` is NOT NULL and unique, so every project has exactly one — including
 * the ones with no content repository, which have no repositoryDirectory.
 */

export function buildProjectPath(slug: string): string {
  return `/projects/${encodeURIComponent(slug)}`;
}

export function buildProjectTranslationsPath(slug: string): string {
  return `${buildProjectPath(slug)}/translations`;
}

export function buildTranslationProjectPath(slug: string, translationProjectId: string): string {
  return `${buildProjectTranslationsPath(slug)}/${encodeURIComponent(translationProjectId)}`;
}
