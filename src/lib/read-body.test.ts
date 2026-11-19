import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBody } from './read-body';

const chunked = (parts: string[]) =>
  new Request('http://x/', {
    method: 'POST',
    body: new ReadableStream({
      start(c) {
        for (const p of parts) c.enqueue(new TextEncoder().encode(p));
        c.close();
      },
    }),
    duplex: 'half',
  } as RequestInit);

test('reads a chunked body under the limit', async () => {
  const body = await readBody(chunked(['{"a":', '1}']), 100);
  assert.equal(new TextDecoder().decode(body!), '{"a":1}');
});

test('stops a chunked body over the limit even without Content-Length', async () => {
  assert.equal(await readBody(chunked(['x'.repeat(60), 'y'.repeat(60)]), 100), null);
});

test('refuses an announced length over the limit before reading', async () => {
  const req = new Request('http://x/', { method: 'POST', body: 'x', headers: { 'content-length': '500' } });
  assert.equal(await readBody(req, 100), null);
});
