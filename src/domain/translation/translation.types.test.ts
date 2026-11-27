import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_CURRENT_TRANSLATION, MAX_TRANSLATION_SOURCE, translateDocumentSchema } from './translation.types';

const request = (fields: Record<string, unknown>) => ({
  documentTitle: 'Day 1',
  sourceLanguageName: 'English',
  targetLanguageId: '6f1c2d3e-0000-4000-8000-000000000001',
  sourceContent: '# Day 1',
  ...fields,
});

test('takes a document as long as the longest real one, with room to spare', () => {
  assert.ok(translateDocumentSchema.safeParse(request({ sourceContent: 'a'.repeat(MAX_TRANSLATION_SOURCE) })).success);
});

test('refuses a source over the cap', () => {
  const over = 'a'.repeat(MAX_TRANSLATION_SOURCE + 1);
  assert.equal(translateDocumentSchema.safeParse(request({ sourceContent: over })).success, false);
});

test('takes a current translation longer than the longest source, up to its own cap', () => {
  const longer = 'a'.repeat(MAX_TRANSLATION_SOURCE + 1);
  assert.ok(translateDocumentSchema.safeParse(request({ currentTranslation: longer })).success);
  const over = 'a'.repeat(MAX_CURRENT_TRANSLATION + 1);
  assert.equal(translateDocumentSchema.safeParse(request({ currentTranslation: over })).success, false);
});
