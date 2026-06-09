'use server';

import { authorize } from '@/lib/authorize';
import {
  setUserLanguages,
  getUserLanguagesCount,
} from './user-language.repository';
import { setUserLanguagesSchema } from './user-language.types';

export async function setUserLanguagesAction(input: unknown) {
  const { user } = await authorize('authenticated');
  const validated = setUserLanguagesSchema.parse(input);

  return await setUserLanguages(user.id, validated.languageIds);
}

export async function getUserLanguagesCountAction(): Promise<number> {
  const { user } = await authorize('authenticated');
  return await getUserLanguagesCount(user.id);
}
