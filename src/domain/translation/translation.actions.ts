'use server';

import { getLanguageById } from '@/domain/language/language.repository';
import { authorize } from '@/lib/authorize';
import { draftTranslation } from './translation.draft';
import { translateDocumentSchema } from './translation.types';

export async function translateDocumentAction(input: unknown) {
  await authorize('authenticated');

  const validated = translateDocumentSchema.parse(input);
  const targetLanguage = await getLanguageById(validated.targetLanguageId);

  if (!targetLanguage) {
    throw new Error('Target language not found');
  }

  return draftTranslation(validated, targetLanguage);
}
