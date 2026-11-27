import assert from 'node:assert/strict';
import test from 'node:test';
import type { PreparedScripture } from '@/domain/scripture/scripture.service';
import { sourceKeyOf } from '@/domain/standard-translation/match-form';
import type { StandardTranslationMatch } from '@/domain/standard-translation/standard-translation.repository';
import { draftTranslation, type DraftDeps } from './translation.draft';
import type { TranslateWithChatGPTParams } from './translation.service';

const LANGUAGE = { id: 'lang-hr', code: 'hr', name: 'Croatian', translationInstructions: null };
const REQUEST = {
  documentTitle: 'Day 1',
  sourceLanguageName: 'English',
  targetLanguageId: '6f1c2d3e-0000-4000-8000-000000000001',
  documentId: '6f1c2d3e-0000-4000-8000-0000000000d1',
  sourceContent: '# Our Father\n\nRead John 3:16.',
};

const ourFather: StandardTranslationMatch = {
  id: 'entry-1',
  name: 'Our Father',
  sourceText: 'Our Father',
  sourceKey: sourceKeyOf('Our Father'),
  targetText: 'Očenaš',
  fixedForm: false,
  sourceProjectId: 'project-1',
};

/** A Bible that swaps the one citation for a placeholder and fills it as `Iv 3,16`. */
const scripture: DraftDeps['prepareScripture'] = async (source) =>
  ({
    content: source.replace('John 3:16', '{{bible:1}}'),
    prompt: 'SCRIPTURE PROMPT',
    restore: (translation: string) => ({
      content: translation.replace('{{bible:1}}', 'Iv 3,16'),
      notices: ['a Scripture notice'],
    }),
  }) satisfies PreparedScripture;

function deps(reply: (params: TranslateWithChatGPTParams) => string) {
  const asked: { entriesFor?: [string, string | null]; sent?: TranslateWithChatGPTParams } = {};
  const fake: DraftDeps = {
    prepareScripture: scripture,
    getDocumentSourceProjectId: async (documentId) => (documentId === REQUEST.documentId ? 'project-1' : null),
    listEntriesForTranslation: async (languageId, projectId) => {
      asked.entriesFor = [languageId, projectId];
      return projectId === 'project-1' ? [ourFather] : [];
    },
    translate: async (params) => {
      asked.sent = params;
      return reply(params);
    },
  };
  return { fake, asked };
}

test("uses the document's project's entries, and fills standard text before Scripture", async () => {
  const { fake, asked } = deps(() => '{{std:1}}\n\nPročitaj {{bible:1}}.');
  const result = await draftTranslation(REQUEST, LANGUAGE, fake);

  assert.deepEqual(asked.entriesFor, ['lang-hr', 'project-1']);
  assert.equal(asked.sent?.sourceContent, '{{std:1}}\n\nRead {{bible:1}}.');
  assert.equal(asked.sent?.scripturePrompt, 'SCRIPTURE PROMPT');
  assert.match(asked.sent?.standardPrompt ?? '', /\{\{std:1\}\}/);
  assert.deepEqual(result, { translatedContent: '# Očenaš\n\nPročitaj Iv 3,16.', notices: ['a Scripture notice'] });
});

test('uses general entries only for a request that names no document', async () => {
  const { fake, asked } = deps(() => 'draft');
  await draftTranslation({ ...REQUEST, documentId: undefined }, LANGUAGE, fake);
  assert.deepEqual(asked.entriesFor, ['lang-hr', null]);
});

test('sends a YAML root file to the model as it is, without Scripture or standard translations', async () => {
  const { fake, asked } = deps(() => 'key: vrijednost');
  const result = await draftTranslation({ ...REQUEST, originalFilename: 'disciplines.yml' }, LANGUAGE, fake);

  assert.equal(asked.entriesFor, undefined);
  assert.equal(asked.sent?.sourceContent, REQUEST.sourceContent);
  assert.equal(asked.sent?.standardPrompt, undefined);
  assert.deepEqual(result, { translatedContent: 'key: vrijednost', notices: [] });
});

test("lists the standard translations' notices before Scripture's", async () => {
  const { fake } = deps(() => 'Pročitaj {{bible:1}}.');
  const { notices } = await draftTranslation(REQUEST, LANGUAGE, fake);
  assert.deepEqual(notices, [
    'The AI dropped the standard translation of "Our Father"; add it where it belongs.',
    'a Scripture notice',
  ]);
});
