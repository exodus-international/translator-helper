import { getLanguageById } from '@/domain/language/language.repository';
import { prepareScripture } from '@/domain/scripture/scripture.service';
import { promptFormatFor } from './translation.prompt';
import { translateWithChatGPT, translationModel } from './translation.service';
import { translateDocumentSchema } from './translation.types';

/**
 * Translates one document with the model: the one path every AI translation
 * takes, whether a person pressed "Translate with AI" or the automatic
 * translation worker picked the version up. The prompt, Scripture handling and
 * model settings live behind it, so a change to any of them reaches both.
 *
 * It does not authorize: the server action asks first, and the worker runs
 * jobs a project manager queued.
 */
export async function translateDocument(input: unknown, options: { signal?: AbortSignal } = {}) {
  const validated = translateDocumentSchema.parse(input);
  const targetLanguage = await getLanguageById(validated.targetLanguageId);

  if (!targetLanguage) {
    throw new Error('Target language not found');
  }

  // Scripture comes from the in-app Bible, not the model: it is swapped for
  // placeholders here and filled in from the target language's Bible after.
  const scripture =
    promptFormatFor(validated.originalFilename) === 'markdown'
      ? await prepareScripture(validated.sourceContent, targetLanguage.code)
      : null;

  const draft = await translateWithChatGPT(
    {
      documentTitle: validated.documentTitle,
      sourceLanguageName: validated.sourceLanguageName,
      targetLanguageName: targetLanguage.name,
      targetLanguageCode: targetLanguage.code,
      sourceContent: scripture?.content ?? validated.sourceContent,
      languageInstructions: targetLanguage.translationInstructions ?? '',
      currentTranslation: validated.currentTranslation,
      originalFilename: validated.originalFilename,
      scripturePrompt: scripture?.prompt,
    },
    options,
  );

  const { content: translatedContent, notices } = scripture?.restore(draft) ?? { content: draft, notices: [] };
  return { translatedContent, notices, model: translationModel() };
}
