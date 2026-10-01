import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signWebhookPayload, verifyWebhookSignature } from './github.webhook';

const SECRET = 'webhook-secret';
const payload = JSON.stringify({ action: 'closed', pull_request: { number: 7, merged: true } });

describe('verifyWebhookSignature', () => {
  it('accepts the signature GitHub would send', () => {
    assert.equal(verifyWebhookSignature(payload, signWebhookPayload(payload, SECRET), SECRET), true);
  });

  it('refuses a signature made with another secret', () => {
    assert.equal(verifyWebhookSignature(payload, signWebhookPayload(payload, 'other'), SECRET), false);
  });

  it('refuses a signature for a different payload', () => {
    const signature = signWebhookPayload(payload.replace('true', 'false'), SECRET);
    assert.equal(verifyWebhookSignature(payload, signature, SECRET), false);
  });

  it('refuses a malformed header without throwing', () => {
    assert.equal(verifyWebhookSignature(payload, 'sha256=nope', SECRET), false);
    assert.equal(verifyWebhookSignature(payload, '', SECRET), false);
  });

  it('refuses a digest that lacks the sha256 prefix', () => {
    const bare = signWebhookPayload(payload, SECRET).replace('sha256=', '');
    assert.equal(verifyWebhookSignature(payload, bare, SECRET), false);
  });
});
