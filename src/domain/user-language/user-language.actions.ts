'use server';

import { authorize } from '@/lib/authorize';
import {
  getUserLanguages,
  getUserLanguageIds,
  setUserLanguages,
  userHasLanguage,
  getUserLanguagesCount,
} from './user-language.repository';
import { setUserLanguagesSchema } from './user-language.types';

export async function getUserLanguagesAction() {
  const { user } = await authorize('authenticated');
  return await getUserLanguages(user.id);
}

export async function getUserLanguageIdsAction(): Promise<string[]> {
  const { user } = await authorize('authenticated');
  return await getUserLanguageIds(user.id);
}

export async function setUserLanguagesAction(input: unknown) {
  const { user } = await authorize('authenticated');
  const validated = setUserLanguagesSchema.parse(input);

  return await setUserLanguages(user.id, validated.languageIds);
}

export async function userHasLanguageAction(languageId: string): Promise<boolean> {
  const { user } = await authorize('authenticated');
  return await userHasLanguage(user.id, languageId);
}

export async function getUserLanguagesCountAction(): Promise<number> {
  const { user } = await authorize('authenticated');
  return await getUserLanguagesCount(user.id);
}
