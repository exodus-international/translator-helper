import { ProjectRole } from '@/generated/prisma/enums';

/**
 * Which languages a person may read instructions for, and which of those they
 * may write. Admins get every target language; everyone else gets the ones they
 * are on, and may edit only where they are the Project Manager.
 *
 * Pure, so the rule is tested without a session or a database -- it decides
 * what a page renders and what a save is allowed to touch.
 */
export interface InstructionsLanguage {
  id: string;
  code: string;
  name: string;
}

export interface InstructionsAccess<T extends InstructionsLanguage> {
  languages: T[];
  /** Language ids the viewer may write. */
  editableIds: string[];
}

export function resolveInstructionsAccess<T extends InstructionsLanguage>(params: {
  isAdmin: boolean;
  /** Every target language, source language already excluded. */
  targetLanguages: T[];
  /** The viewer's own memberships. */
  memberships: { languageId: string; role: ProjectRole }[];
}): InstructionsAccess<T> {
  const { isAdmin, targetLanguages, memberships } = params;

  if (isAdmin) {
    return { languages: targetLanguages, editableIds: targetLanguages.map((language) => language.id) };
  }

  const roleByLanguage = new Map(memberships.map((membership) => [membership.languageId, membership.role]));
  const languages = targetLanguages.filter((language) => roleByLanguage.has(language.id));

  return {
    languages,
    editableIds: languages
      .filter((language) => roleByLanguage.get(language.id) === ProjectRole.PROJECT_MANAGER)
      .map((language) => language.id),
  };
}

/**
 * The language the page opens on: the one asked for when the viewer has it,
 * otherwise the first they can see.
 */
export function resolveSelectedLanguage<T extends InstructionsLanguage>(
  languages: T[],
  requestedCode?: string | null,
): T | null {
  if (languages.length === 0) {
    return null;
  }

  return languages.find((language) => language.code === requestedCode) ?? languages[0];
}
