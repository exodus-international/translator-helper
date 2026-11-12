'use server';

import { getLanguageById } from '@/domain/language/language.repository';
import { prepareScripture } from '@/domain/scripture/scripture.service';
import { authorize } from '@/lib/authorize';
import { promptFormatFor } from './translation.prompt';
import { translateWithChatGPT } from './translation.service';
import { translateDocumentSchema } from './translation.types';

export async function translateDocumentAction(input: unknown) {
  await authorize('authenticated');

  const validated = translateDocumentSchema.parse(input);
  const targetLanguage = await getLanguageById(validated.targetLanguageId);

  if (!targetLanguage) {
    throw new Error('Target language not found');
  }

  // Scripture comes from the Bible API, not the model: it is swapped for
  // placeholders here and filled in from the target language's Bible after.
  const scripture =
    promptFormatFor(validated.originalFilename) === 'markdown'
      ? await prepareScripture(validated.sourceContent, targetLanguage.code)
      : null;

  const draft = await translateWithChatGPT({
    documentTitle: validated.documentTitle,
    sourceLanguageName: validated.sourceLanguageName,
    targetLanguageName: targetLanguage.name,
    targetLanguageCode: targetLanguage.code,
    sourceContent: scripture?.content ?? validated.sourceContent,
    languageInstructions: targetLanguage.translationInstructions ?? '',
    currentTranslation: validated.currentTranslation,
    originalFilename: validated.originalFilename,
    scripturePrompt: scripture?.prompt,
  });

  const { content: translatedContent, notices } = scripture?.restore(draft) ?? { content: draft, notices: [] };
  return { translatedContent, notices };
}
