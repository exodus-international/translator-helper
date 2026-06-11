'use server';

import { authorize } from '@/lib/authorize';
import { setUserLanguages } from './user-language.repository';

export async function adminSetUserLanguagesAction(userId: string, languageIds: string[]) {
  await authorize('admin');
  return await setUserLanguages(userId, languageIds);
}
