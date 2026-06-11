'use server';

import { authorize } from '@/lib/authorize';
import { setUserLanguages } from './user-language.repository';
import { adminSetUserLanguagesSchema } from './user-language.types';

export async function adminSetUserLanguagesAction(input: unknown) {
  await authorize('admin');
  const validated = adminSetUserLanguagesSchema.parse(input);
  return await setUserLanguages(validated.userId, validated.languageIds);
}
