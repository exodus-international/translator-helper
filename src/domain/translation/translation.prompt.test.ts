import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_PROMPTS, buildSystemPrompt, buildSystemPromptSegments, promptFormatFor } from './translation.prompt';

const CROATIAN = { targetLanguageName: 'Croatian', targetLanguageCode: 'hr' } as const;

describe('promptFormatFor', () => {
  it('sends .yml and .yaml root files down the YAML path', () => {
    assert.equal(promptFormatFor('disciplines.yml'), 'yaml');
    assert.equal(promptFormatFor('disciplines.yaml'), 'yaml');
    assert.equal(promptFormatFor('DISCIPLINES.YML'), 'yaml');
  });

  it('treats everything else as Markdown, including a missing filename', () => {
    assert.equal(promptFormatFor('day-1.md'), 'markdown');
    assert.equal(promptFormatFor('description.md'), 'markdown');
    assert.equal(promptFormatFor(null), 'markdown');
    assert.equal(promptFormatFor(undefined), 'markdown');
  });

  it('does not match a name that merely contains yml', () => {
    assert.equal(promptFormatFor('ymlnotes.md'), 'markdown');
  });
});

describe('buildSystemPromptSegments', () => {
  it('splits the prompt into the base, the language line and the custom part', () => {
    const segments = buildSystemPromptSegments({
      ...CROATIAN,
      languageInstructions: 'Use the Jeruzalemska Biblija.',
      format: 'markdown',
    });

    assert.equal(segments.base, BASE_PROMPTS.markdown);
    assert.equal(segments.targetLanguage, 'Target language: Croatian (hr).');
    assert.equal(segments.customInstructions, 'Custom instructions:\nUse the Jeruzalemska Biblija.');
  });

  it('appends nothing at all when a language has no instructions', () => {
    for (const instructions of [null, undefined, '', '   \n ']) {
      const segments = buildSystemPromptSegments({ ...CROATIAN, languageInstructions: instructions, format: 'markdown' });
      assert.equal(segments.customInstructions, null);
    }
  });

  it('carries the same custom instructions into the YAML prompt', () => {
    // The instructions are language-scoped, not format-scoped: a root file gets
    // them too, which is why the preview lets an admin see this case.
    const segments = buildSystemPromptSegments({
      ...CROATIAN,
      languageInstructions: 'Keep "brother" as brat.',
      format: 'yaml',
    });

    assert.equal(segments.base, BASE_PROMPTS.yaml);
    assert.equal(segments.customInstructions, 'Custom instructions:\nKeep "brother" as brat.');
  });
});

describe('buildSystemPrompt', () => {
  it('joins the segments with a blank line between them', () => {
    const prompt = buildSystemPrompt({ ...CROATIAN, languageInstructions: 'Formal register.', format: 'yaml' });

    assert.equal(prompt, `${BASE_PROMPTS.yaml}\n\nTarget language: Croatian (hr).\n\nCustom instructions:\nFormal register.`);
  });

  it('leaves no dangling separator when there are no instructions', () => {
    const prompt = buildSystemPrompt({ ...CROATIAN, languageInstructions: null, format: 'markdown' });

    assert.equal(prompt.endsWith('Target language: Croatian (hr).'), true);
    assert.equal(prompt.includes('Custom instructions'), false);
  });
});
