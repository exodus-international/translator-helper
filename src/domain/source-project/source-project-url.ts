/**
 * Project URLs are keyed by SourceProject.identifier, the same segment that
 * opens a document:
 *
 *   /projects/advent2025
 *   /projects/advent2025/translations
 *
 * The old shape put the row id in that position. Those links are still in Slack
 * and mail, so the route accepts a UUID too and redirects to the readable path.
 * `identifier` is NOT NULL and unique, so every project has exactly one.
 */

export function buildProjectPath(identifier: string): string {
  return `/projects/${encodeURIComponent(identifier)}`;
}

export function buildProjectTranslationsPath(identifier: string): string {
  return `${buildProjectPath(identifier)}/translations`;
}

export function buildTranslationProjectPath(identifier: string, translationProjectId: string): string {
  return `${buildProjectTranslationsPath(identifier)}/${encodeURIComponent(translationProjectId)}`;
}
