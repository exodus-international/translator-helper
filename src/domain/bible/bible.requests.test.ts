/**
 * What the Bible import and chat endpoints answer before any Bible is read:
 * who may call them, and what they refuse. The import that lands is in
 * bible.db.test.ts.
 */
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { describe, it } from 'node:test';
import { Role } from '@/generated/prisma/enums';
import type { SessionUser } from '@/lib/session';
import type { BibleBackend } from './bible.chat';
import { MAX_UPLOAD_BYTES } from './bible.import';
import { handleBibleChat, handleBibleImport } from './bible.requests';

const admin: SessionUser = { id: 'admin-1', email: 'admin@example.test', name: 'Admin', role: Role.ADMIN };
const translator: SessionUser = { ...admin, id: 'user-1', role: Role.USER };

function upload(files: Record<string, Blob | string>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(files)) form.set(key, value);
  return new Request('http://app.test/api/admin/bible/import', { method: 'POST', body: form });
}

const errorOf = async (response: Response) => ((await response.json()) as { error: string }).error;

describe('the import endpoint', () => {
  it('asks a signed-out caller to sign in', async () => {
    const response = await handleBibleImport(upload({ translation: new Blob(['{}']) }), null);
    assert.equal(response.status, 401);
  });

  it('refuses everyone but admins', async () => {
    const response = await handleBibleImport(upload({ translation: new Blob(['{}']) }), translator);
    assert.equal(response.status, 403);
    assert.equal(await errorOf(response), 'Only admins can import Bibles.');
  });

  it('takes only a form', async () => {
    const request = new Request('http://app.test/api/admin/bible/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal((await handleBibleImport(request, admin)).status, 415);
  });

  it('refuses an upload over the limit before reading it all', async () => {
    const big = new Blob([new Uint8Array(2 * MAX_UPLOAD_BYTES + 128 * 1024)]);
    const response = await handleBibleImport(upload({ translation: big }), admin);
    assert.equal(response.status, 413);
  });

  it('refuses one file over the per-file limit', async () => {
    const big = new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)]);
    const response = await handleBibleImport(upload({ translation: big }), admin);
    assert.equal(response.status, 413);
    assert.equal(await errorOf(response), 'A file is too large.');
  });

  it('asks for a file when none is sent', async () => {
    const response = await handleBibleImport(upload({ code: 'sar-hr' }), admin);
    assert.equal(response.status, 400);
    assert.equal(await errorOf(response), 'Choose a translation or versification file.');
  });

  it('asks which translation a versification file alone is for', async () => {
    const response = await handleBibleImport(upload({ versification: new Blob(['{}']) }), admin);
    assert.equal(response.status, 400);
    assert.equal(await errorOf(response), 'Say which translation the versification is for.');
  });

  it('explains a file that is not bible-api JSON, compressed or not', async () => {
    for (const body of [new Blob(['{"hello": 1}']), new Blob([gzipSync('{"hello": 1}')])]) {
      const response = await handleBibleImport(upload({ translation: body }), admin);
      assert.equal(response.status, 422);
      assert.match(await errorOf(response), /translation/i);
    }
  });
});

const bible: BibleBackend = {
  translations: async () => [
    { code: 'sar-hr', name: 'Šarić', language: 'hr', languageName: 'Hrvatski', role: 'target', isLanguageDefault: true },
  ],
  resolve: async () => ({ translation: 'sar-hr', results: [] }),
  search: async () => ({ translation: 'sar-hr', passages: [] }),
  chapter: async () => ({ error: 'none' }),
};

const model = (async () =>
  Response.json({
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Iv 3,16.' }] }],
  })) as unknown as typeof fetch;

const deps = { fetch: model, bible, env: { apiKey: 'test-key', endpoint: 'http://model.test', model: 'm' }, log: () => {} };

function question(body: unknown): Request {
  return new Request('http://app.test/api/bible/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const ask = { messages: [{ role: 'user', content: 'John 3:16' }], translation: 'hr' };

describe('the chat endpoint', () => {
  it('asks a signed-out caller to sign in', async () => {
    assert.equal((await handleBibleChat(question(ask), null, deps)).status, 401);
  });

  it('streams the answer as one event per line, ending with done', async () => {
    const response = await handleBibleChat(question(ask), { ...translator, id: 'stream-user' }, deps);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /ndjson/);
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { type: string });
    assert.equal(events.at(-1)?.type, 'done');
    assert.ok(events.some((e) => e.type === 'text'));
  });

  it('refuses a body that is not JSON, or not a question', async () => {
    const user = { ...translator, id: 'bad-body-user' };
    assert.equal((await handleBibleChat(question('not json'), user, deps)).status, 400);
    const last = await handleBibleChat(question({ ...ask, messages: [{ role: 'assistant', content: 'hi' }] }), user, deps);
    assert.equal(last.status, 400);
    assert.equal(await errorOf(last), 'The last message must be the question.');
  });

  it('refuses a conversation over the size limit', async () => {
    const long = { ...ask, messages: [{ role: 'user', content: 'x'.repeat(300 * 1024) }] };
    const response = await handleBibleChat(question(long), { ...translator, id: 'long-user' }, deps);
    assert.equal(response.status, 413);
  });

  it('takes a long earlier answer back with the next question', async () => {
    const answer = 'Iv 3,16 '.repeat(4000);
    const next = { ...ask, messages: [ask.messages[0], { role: 'assistant', content: answer }, ask.messages[0]] };
    const response = await handleBibleChat(question(next), { ...translator, id: 'long-answer-user' }, deps);
    assert.equal(response.status, 200);
  });

  it('slows down one user who asks too often, and only that user', async () => {
    const user = { ...translator, id: 'busy-user' };
    for (let i = 0; i < 20; i++) await (await handleBibleChat(question(ask), user, deps)).text();
    const limited = await handleBibleChat(question(ask), user, deps);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
    assert.equal((await handleBibleChat(question(ask), { ...translator, id: 'other-user' }, deps)).status, 200);
  });
});
