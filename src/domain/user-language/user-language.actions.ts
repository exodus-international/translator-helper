'use server';

import { authorize } from '@/lib/authorize';
import { languageTeam } from './language-team';
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

export async function setLanguageMemberRoleAction(input: unknown) {
  await authorize('can:manage-languages');
  return await languageTeam.setMemberRole(input);
}

export async function removeLanguageMemberAction(input: unknown) {
  await authorize('can:manage-languages');
  return await languageTeam.removeMember(input);
}
