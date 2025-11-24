import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTranslationMessages, translateWithChatGPT, TranslateWithChatGPTParams } from './translation.service';

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

  global.fetch = originalFetch;
  process.env.CHATGPT_API = originalApiKey;
});
