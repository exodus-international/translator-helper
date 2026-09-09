'use server';

import { userExistsById } from '@/domain/user/user.repository';
import { authorize } from '@/lib/authorize';
import {
  getLanguageIdForTranslationProject,
  getProjectReviewers,
  listTranslationProjectMembers,
  removeUserFromLanguage,
  setUserLanguageRole,
  setUserLanguages,
} from './user-language.repository';
import { setLanguageMemberRoleSchema } from './user-language.types';

export async function adminSetUserLanguagesAction(userId: string, languageIds: string[]) {
  await authorize('admin');
  return await setUserLanguages(userId, languageIds);
}

/**
 * Team membership is language-scoped: these actions are entered from a
 * translation project, but the role they grant applies to every project in
 * that project's language.
 */
export async function listTranslationProjectMembersAction(translationProjectId: string) {
  await authorize('authenticated');
  return await listTranslationProjectMembers(translationProjectId);
}

export async function setLanguageMemberRoleAction(input: unknown) {
  const validated = setLanguageMemberRoleSchema.parse(input);

  await authorize({ project: validated.translationProjectId, role: 'manager' });

  if (!(await userExistsById(validated.userId))) {
    throw new Error('User not found in database');
  }

  const languageId = await getLanguageIdForTranslationProject(validated.translationProjectId);
  if (!languageId) {
    throw new Error('Translation project not found');
  }

  return await setUserLanguageRole(validated.userId, languageId, validated.role);
}

export async function removeLanguageMemberAction(userId: string, translationProjectId: string) {
  await authorize({ project: translationProjectId, role: 'manager' });

  const languageId = await getLanguageIdForTranslationProject(translationProjectId);
  if (!languageId) {
    throw new Error('Translation project not found');
  }

  return await removeUserFromLanguage(userId, languageId);
}

export async function getProjectReviewersAction(translationProjectId: string) {
  await authorize('authenticated');
  return await getProjectReviewers(translationProjectId);
}
