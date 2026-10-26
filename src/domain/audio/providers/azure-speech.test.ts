import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { AudioQuality } from '@/generated/prisma/enums';

/**
 * What the batch synthesis request asks Azure for, with fetch stubbed. The
 * format string is the whole contract for quality: Azure answers whatever
 * format it was asked for, and a typo here fails the job at Azure's end.
 */

process.env.AZURE_SPEECH_ENDPOINT = 'https://speech.example.test';
process.env.AZURE_SPEECH_KEY = 'test-key';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function submittedFormat(quality: AudioQuality): Promise<string> {
  const { azureSpeechProvider } = await import('./azure-speech');
  let body: { properties?: { outputFormat?: string } } = {};
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: 'job-1', status: 'NotStarted' }), { status: 201 });
  }) as typeof fetch;

  await azureSpeechProvider.submit({ jobId: 'job-1', ssml: '<speak/>', quality });
  return body.properties?.outputFormat ?? '';
}

test('standard quality asks Azure for 24 kHz MP3', async () => {
  assert.equal(await submittedFormat(AudioQuality.STANDARD), 'audio-24khz-96kbitrate-mono-mp3');
});

test('high quality asks Azure for 48 kHz MP3', async () => {
  assert.equal(await submittedFormat(AudioQuality.HIGH), 'audio-48khz-192kbitrate-mono-mp3');
});
