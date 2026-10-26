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

test('a preview goes to the real-time endpoint with the SSML and the format for its quality', async () => {
  const { azureSpeechProvider } = await import('./azure-speech');
  let seen: { url: string; headers: Record<string, string>; body: string } | undefined;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    seen = { url, headers: init?.headers as Record<string, string>, body: String(init?.body) };
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
  }) as typeof fetch;

  const result = await azureSpeechProvider.preview!({ ssml: '<speak>Ahoj</speak>', quality: AudioQuality.HIGH });

  assert.equal(seen?.url, 'https://speech.example.test/tts/cognitiveservices/v1');
  assert.equal(seen?.headers['X-Microsoft-OutputFormat'], 'audio-48khz-192kbitrate-mono-mp3');
  assert.equal(seen?.headers['Content-Type'], 'application/ssml+xml');
  assert.equal(seen?.headers['Ocp-Apim-Subscription-Key'], 'test-key');
  assert.equal(seen?.body, '<speak>Ahoj</speak>');
  assert.deepEqual([...result.audio], [1, 2, 3]);
});

test('a refused preview carries the message Azure sent', async () => {
  const { azureSpeechProvider } = await import('./azure-speech');
  globalThis.fetch = (async () => new Response('Voice not found', { status: 400 })) as unknown as typeof fetch;

  await assert.rejects(
    azureSpeechProvider.preview!({ ssml: '<speak/>', quality: AudioQuality.STANDARD }),
    /Azure preview failed \(400\): Voice not found/,
  );
});
