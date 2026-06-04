import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTranslationMessages,
  stripWrappingCodeFence,
  translateWithChatGPT,
  TranslateWithChatGPTParams,
} from './translation.service';

test('stripWrappingCodeFence removes a fence wrapping the whole content', () => {
  assert.equal(stripWrappingCodeFence('```yaml\ntitle: Ahoj\n```'), 'title: Ahoj');
  assert.equal(stripWrappingCodeFence('```\nplain\n```'), 'plain');
  // tolerant of surrounding whitespace
  assert.equal(stripWrappingCodeFence('\n```yaml\ntitle: Ahoj\n```\n'), 'title: Ahoj');
});

test('stripWrappingCodeFence leaves unwrapped content and inline blocks intact', () => {
  assert.equal(stripWrappingCodeFence('title: Ahoj'), 'title: Ahoj');
  const md = '# Heading\n\n```js\ncode\n```\n\nmore text';
  assert.equal(stripWrappingCodeFence(md), md);
});

test('buildTranslationMessages includes system and user context', () => {
  const messages = buildTranslationMessages({
    documentTitle: 'Sample Doc',
    sourceLanguageName: 'English',
    targetLanguageName: 'French',
    targetLanguageCode: 'fr',
    sourceContent: 'Hello **world**',
    languageInstructions: 'Keep tone formal.',
  });

  assert.equal(messages.length, 2);
  assert.ok(messages[0].content.includes('Target language: French'));
  assert.ok(messages[0].content.includes('Keep tone formal'));
  assert.ok(messages[1].content.includes('Sample Doc'));
  assert.ok(messages[1].content.includes('Hello **world**'));
});

const promptBase = {
  documentTitle: 'Sample Doc',
  sourceLanguageName: 'English',
  targetLanguageName: 'French',
  targetLanguageCode: 'fr',
  sourceContent: 'title: Hello',
};

test('buildTranslationMessages uses the Markdown prompt by default', () => {
  const messages = buildTranslationMessages({ ...promptBase, originalFilename: 'description.md' });
  assert.ok(messages[0].content.includes('Markdown'));
  assert.ok(messages[1].content.includes('Return only the translated Markdown'));
});

test('Markdown system prompt carries the Catholic spiritual formation guidance', () => {
  const [system] = buildTranslationMessages({ ...promptBase, originalFilename: 'reflection.md' });
  const content = system.content;

  // Role: specialized Catholic spiritual / formational translator
  assert.ok(/Catholic spiritual and formational texts/.test(content), 'role description');
  // Fidelity rules
  assert.ok(content.includes('Do not summarize.'), 'no summarizing');
  assert.ok(content.includes('Do not paraphrase.'), 'no paraphrasing');
  assert.ok(content.includes('Do not add interpretations.'), 'no adding');
  assert.ok(content.includes('Do not omit parts.'), 'no omitting');
  assert.ok(content.includes('Do not embellish the content.'), 'no embellishing');
  // Formatting preservation
  assert.ok(content.includes('Preserve formatting 1:1'), 'formatting preservation');
  assert.ok(content.includes('block quotes'), 'block quotes');
  assert.ok(content.includes('Markdown must remain equivalent to the source.'), 'markdown equivalence');
  // Theological fidelity
  assert.ok(/official or standard Catholic terminology in the target language/.test(content), 'catholic terminology');
  assert.ok(/biblical quotations.*Catholic biblical tradition/s.test(content), 'biblical quotations');
  // Forbidden actions
  assert.ok(content.includes('Strictly forbidden:'), 'forbidden section');
  assert.ok(content.includes('emojis'), 'no emojis');
  assert.ok(/adding comments, explanations, or summaries/.test(content), 'no comments/explanations');
  // Generic target-language phrasing (no leftover [target language] placeholders)
  assert.ok(!content.includes('[target language]'), 'no unresolved placeholders');
  // Target language injection still present
  assert.ok(content.includes('Target language: French (fr).'), 'target language name and code');
});

test('Markdown system prompt appends custom language instructions when provided', () => {
  const [system] = buildTranslationMessages({
    ...promptBase,
    originalFilename: 'reflection.md',
    languageInstructions: 'Prefer the liturgical register.',
  });
  assert.ok(system.content.includes('Custom instructions:'), 'custom instructions section');
  assert.ok(system.content.includes('Prefer the liturgical register.'), 'custom instructions content');
});

test('Markdown system prompt omits the custom instructions section when none provided', () => {
  const [system] = buildTranslationMessages({ ...promptBase, originalFilename: 'reflection.md' });
  assert.ok(!system.content.includes('Custom instructions:'), 'no empty custom instructions section');
});

test('buildTranslationMessages uses the Markdown prompt when no filename is given', () => {
  const messages = buildTranslationMessages(promptBase);
  assert.ok(messages[0].content.includes('Markdown'));
});

test('buildTranslationMessages switches to a YAML-aware prompt for .yml/.yaml files', () => {
  for (const originalFilename of ['disciplines.yml', 'metadata.yaml', 'CONFIG.YML']) {
    const messages = buildTranslationMessages({ ...promptBase, originalFilename });
    assert.ok(messages[0].content.includes('YAML'), `system prompt for ${originalFilename}`);
    assert.ok(messages[0].content.includes('Translate only the human-readable string values'));
    assert.ok(messages[1].content.includes('Return only the raw translated YAML'));
    assert.ok(messages[1].content.includes('Do not wrap it in Markdown code fences'));
    assert.ok(!messages[1].content.includes('Return only the translated Markdown'));
  }
});

test('translateWithChatGPT returns API content and forwards instructions', async () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.CHATGPT_API;
  process.env.CHATGPT_API = 'test-key';
  let capturedBody: any = null;

  global.fetch = (async (_input: RequestInfo, init?: RequestInit) => {
    capturedBody = JSON.parse((init?.body as string) || '{}');
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'Bonjour le monde' } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  const params: TranslateWithChatGPTParams = {
    documentTitle: 'Sample Doc',
    sourceLanguageName: 'English',
    targetLanguageName: 'French',
    targetLanguageCode: 'fr',
    sourceContent: 'Hello world',
    languageInstructions: 'Use friendly tone.',
  };

  const output = await translateWithChatGPT(params);
  assert.equal(output, 'Bonjour le monde');

  assert.ok(capturedBody);
  assert.equal(capturedBody.model, process.env.CHATGPT_MODEL || 'gpt-4o-mini');
  assert.equal(Array.isArray(capturedBody.messages), true);
  assert.ok(
    capturedBody.messages[0].content.includes('Use friendly tone'),
    'custom instructions forwarded to system prompt',
  );
  assert.ok(
    capturedBody.messages[0].content.includes('Catholic spiritual and formational texts'),
    'Catholic spiritual formation guidance forwarded to the API',
  );

  global.fetch = originalFetch;
  process.env.CHATGPT_API = originalApiKey;
});

async function translateReturning(content: string, originalFilename?: string): Promise<string> {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.CHATGPT_API;
  process.env.CHATGPT_API = 'test-key';

  global.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

  try {
    return await translateWithChatGPT({
      documentTitle: 'Sample Doc',
      sourceLanguageName: 'English',
      targetLanguageName: 'French',
      targetLanguageCode: 'fr',
      sourceContent: 'irrelevant',
      originalFilename,
    });
  } finally {
    global.fetch = originalFetch;
    process.env.CHATGPT_API = originalApiKey;
  }
}

test('translateWithChatGPT strips a wrapping fence for YAML output', async () => {
  const output = await translateReturning('```yaml\ntitle: Ahoj\n```', 'disciplines.yml');
  assert.equal(output, 'title: Ahoj');
});

test('translateWithChatGPT leaves a fully-fenced Markdown response intact', async () => {
  const fenced = '```js\nconst x = 1;\n```';
  assert.equal(await translateReturning(fenced, 'snippet.md'), fenced);
  // also when no filename is provided (defaults to Markdown handling)
  assert.equal(await translateReturning(fenced), fenced);
});
