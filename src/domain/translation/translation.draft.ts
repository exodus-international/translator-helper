import { prepareScripture } from '@/domain/scripture/scripture.service';
import { getDocumentSourceProjectId } from '@/domain/document/document.repository';
import { listEntriesForTranslation } from '@/domain/standard-translation/standard-translation.repository';
import { prepareStandardTranslations } from '@/domain/standard-translation/standard-translation.service';
import { promptFormatFor } from './translation.prompt';
import { translateWithChatGPT, type TranslateWithChatGPTParams } from './translation.service';
import type { z } from 'zod';
import type { translateDocumentSchema } from './translation.types';

export interface DraftDeps {
  prepareScripture: typeof prepareScripture;
  getDocumentSourceProjectId: (documentId: string) => Promise<string | null>;
  listEntriesForTranslation: typeof listEntriesForTranslation;
  translate: (params: TranslateWithChatGPTParams) => Promise<string>;
}

const defaultDeps: DraftDeps = {
  prepareScripture,
  getDocumentSourceProjectId,
  listEntriesForTranslation,
  translate: translateWithChatGPT,
};

/**
 * An AI draft of a document. Scripture comes from the in-app Bible, not the
 * model: it is swapped for placeholders before the call and filled in from the
 * target language's Bible after. Standard translations come from the team's
 * dictionary the same way, on Scripture's output, so a standard translation
 * never overrides Scripture, and are filled in first on the way back. Both are
 * for Markdown only; a YAML root file goes to the model as it is.
 */
export async function draftTranslation(
  request: z.output<typeof translateDocumentSchema>,
  language: { id: string; code: string; name: string; translationInstructions: string | null },
  deps: DraftDeps = defaultDeps,
): Promise<{ translatedContent: string; notices: string[] }> {
  const isMarkdown = promptFormatFor(request.originalFilename) === 'markdown';
  const scripture = isMarkdown ? await deps.prepareScripture(request.sourceContent, language.code) : null;
  const standard = scripture
    ? prepareStandardTranslations(
        scripture.content,
        await deps.listEntriesForTranslation(
          language.id,
          request.documentId ? await deps.getDocumentSourceProjectId(request.documentId) : null,
        ),
        { original: request.sourceContent },
      )
    : null;

  const draft = await deps.translate({
    documentTitle: request.documentTitle,
    sourceLanguageName: request.sourceLanguageName,
    targetLanguageName: language.name,
    targetLanguageCode: language.code,
    sourceContent: standard?.content ?? request.sourceContent,
    languageInstructions: language.translationInstructions ?? '',
    currentTranslation: request.currentTranslation,
    originalFilename: request.originalFilename,
    scripturePrompt: scripture?.prompt,
    standardPrompt: standard?.prompt,
  });

  if (!scripture || !standard) return { translatedContent: draft, notices: [] };
  // Filled in the reverse order they were taken out: standard translations, then Scripture.
  const filled = standard.restore(draft);
  const { content: translatedContent, notices } = scripture.restore(filled.content);
  return { translatedContent, notices: [...filled.notices, ...notices] };
}
