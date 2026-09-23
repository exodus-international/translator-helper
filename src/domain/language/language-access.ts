import { ProjectRole } from '@/generated/prisma/enums';

/**
 * Who may see a language's pages, and how much of them.
 *
 * Membership has been language-scoped since #150, and a manager was already
 * trusted to staff their language from the project board -- the consolidation
 * took that away by accident. This puts it back where the scope is legible:
 * the people responsible for a language manage its team and read its progress,
 * and the settings that decide what the app *does* with a language stay with
 * administrators.
 *
 * The split is by consequence, not by seniority. A branch name decides where
 * content is published, a voice decides what gets generated, a code is in every
 * URL, and a deletion cannot be undone. A manager who gets one of those wrong
 * breaks something outside their language; a manager who gets the team wrong
 * inconveniences their own.
 */

export type LanguageViewer =
  | { kind: 'admin' }
  | { kind: 'manager'; languageIds: string[] }
  | { kind: 'none' };

export interface LanguageMembership {
  languageId: string;
  role: ProjectRole;
}

/** What a signed-in person is, as far as the language pages are concerned. */
export function resolveLanguageViewer(params: { isAdmin: boolean; memberships: LanguageMembership[] }): LanguageViewer {
  if (params.isAdmin) {
    return { kind: 'admin' };
  }

  const languageIds = params.memberships
    .filter((membership) => membership.role === ProjectRole.PROJECT_MANAGER)
    .map((membership) => membership.languageId);

  return languageIds.length > 0 ? { kind: 'manager', languageIds } : { kind: 'none' };
}

/** The index lists every language for an admin, and a manager's own otherwise. */
export function visibleLanguages<T extends { id: string }>(viewer: LanguageViewer, languages: T[]): T[] {
  if (viewer.kind === 'admin') return languages;
  if (viewer.kind === 'none') return [];

  return languages.filter((language) => viewer.languageIds.includes(language.id));
}

export function canViewLanguage(viewer: LanguageViewer, languageId: string): boolean {
  if (viewer.kind === 'admin') return true;
  if (viewer.kind === 'none') return false;

  return viewer.languageIds.includes(languageId);
}

/**
 * Creating and deleting a language, and everything on its settings tab, is
 * administration. A manager sees the same configuration verdict on the
 * overview -- knowing the branch is missing is exactly what makes them ask.
 */
export function canAdministerLanguages(viewer: LanguageViewer): boolean {
  return viewer.kind === 'admin';
}

/**
 * Deploying publishes a language's approved work to the content repository.
 *
 * It is the same set of people as `canViewLanguage` and for a related reason:
 * the manager answers for that language's work, and deploying is the act of
 * finishing it rather than a change to how the app treats the language. The
 * settings that decide *where* it lands stay with administrators -- a manager
 * publishes through configuration they cannot alter.
 */
export function canDeployLanguage(viewer: LanguageViewer, languageId: string): boolean {
  return canViewLanguage(viewer, languageId);
}
