'use server';

import { authorize } from '@/lib/authorize';
import { parseInput } from '@/lib/validation';
import { languageTeam } from './language-team';
import { languageScopeSchema } from './user-language.types';
import { getProjectReviewers, listTranslationProjectMembers } from './user-language.repository';

/**
 * Team membership is language-scoped: a UserLanguage row grants its role on
 * every project in that language. These actions are keyed by language to say
 * so; the reads below are still entered from a project, because a project board
 * wants to show who is on the language it belongs to.
 */

export async function listTranslationProjectMembersAction(translationProjectId: string) {
  await authorize('authenticated');
  return await listTranslationProjectMembers(translationProjectId);
}

export async function getProjectReviewersAction(translationProjectId: string) {
  await authorize('authenticated');
  return await getProjectReviewers(translationProjectId);
}

/**
 * A language's manager staffs it, as they could from the project board before
 * the pages were consolidated -- `authorize` asks the question one step earlier
 * now, against the language the row actually grants a role on. Administrators
 * pass the same check.
 */
export async function setLanguageMemberRoleAction(input: unknown) {
  const { languageId } = parseInput(languageScopeSchema, input);
  await authorize({ language: languageId, role: 'manager' });

  return await languageTeam.setMemberRole(input);
}

export async function removeLanguageMemberAction(input: unknown) {
  const { languageId } = parseInput(languageScopeSchema, input);
  await authorize({ language: languageId, role: 'manager' });

  return await languageTeam.removeMember(input);
}
