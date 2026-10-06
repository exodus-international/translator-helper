import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

const ORIGIN = 'https://translations.example';

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, ORIGIN), init);
}

describe('proxy', () => {
  it('sends a signed-out page visit to the login page, remembering where it was headed', async () => {
    const response = await proxy(request('/documents/sml/day-3/hr?thread=abc'));
    assert.equal(response.status, 307);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.pathname, '/login');
    assert.equal(location.searchParams.get('from'), '/documents/sml/day-3/hr?thread=abc');
  });

  it('lets a signed-in page visit through', async () => {
    const response = await proxy(
      request('/documents/sml/day-3/hr', { headers: { cookie: 'better-auth.session_token=token' } }),
    );
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('x-middleware-next'), '1');
  });

  // A 307 keeps the method and the `Next-Action` header, so redirecting here
  // replayed the action against /login, where it threw "Unauthorized".
  it('lets a signed-out server action through to the page it was posted to', async () => {
    const response = await proxy(
      request('/documents/sml/day-3/hr', { method: 'POST', headers: { 'next-action': 'abc123' } }),
    );
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('x-middleware-next'), '1');
  });
});
