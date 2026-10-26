import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_AUDIO_VOICES } from '@/domain/language/language.types';
import { DEFAULT_PREVIEW_TEXTS, defaultPreviewText, PREVIEW_TEXT_MAX_LENGTH, previewText, storedPreviewText } from './audio.preview';

test('every team language has its own sample', () => {
  for (const code of Object.keys(DEFAULT_AUDIO_VOICES)) {
    assert.ok(DEFAULT_PREVIEW_TEXTS[code], `no sample for ${code}`);
  }
});

test('every sample fits the preview limit and has a comma, a sentence end and a question', () => {
  for (const [code, sample] of Object.entries(DEFAULT_PREVIEW_TEXTS)) {
    assert.ok(sample.length <= PREVIEW_TEXT_MAX_LENGTH, code);
    assert.match(sample, /,/, code);
    assert.match(sample, /\.\s/, code);
    assert.match(sample, /\?$/, code);
  }
});

test('a language nobody wrote a sample for gets the English one', () => {
  assert.equal(defaultPreviewText('xx'), DEFAULT_PREVIEW_TEXTS.en);
});

test('the preview box starts with the saved sample, or the default', () => {
  assert.equal(previewText({ code: 'sk', audioPreviewText: null }), DEFAULT_PREVIEW_TEXTS.sk);
  assert.equal(previewText({ code: 'sk', audioPreviewText: '  ' }), DEFAULT_PREVIEW_TEXTS.sk);
  assert.equal(previewText({ code: 'sk', audioPreviewText: 'Vlastný text.' }), 'Vlastný text.');
});

test('the default and a blank are stored as no sample, so a corrected default reaches them', () => {
  assert.equal(storedPreviewText('sk', DEFAULT_PREVIEW_TEXTS.sk), null);
  assert.equal(storedPreviewText('sk', `  ${DEFAULT_PREVIEW_TEXTS.sk}\n`), null);
  assert.equal(storedPreviewText('sk', ''), null);
  assert.equal(storedPreviewText('sk', 'Vlastný text.'), 'Vlastný text.');
});
