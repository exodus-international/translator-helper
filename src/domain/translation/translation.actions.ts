'use server';

import { authorize } from '@/lib/authorize';
import { translateDocument } from './translation.document';

export async function translateDocumentAction(input: unknown) {
  await authorize('authenticated');

  const { translatedContent, notices } = await translateDocument(input);
  return { translatedContent, notices };
}
