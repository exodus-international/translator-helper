import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AutoTranslationFailure } from '@/generated/prisma/enums';
import { TranslationApiError } from '../translation/translation.service';
import { failureMessage, failureReasonOf } from './auto-translation.failure';

const apiError = (status: number, retryAfterMs: number | null = null) =>
  new TranslationApiError(`ChatGPT API request failed: ${status} - {"error":{"message":"raw detail"}}`, status, retryAfterMs);

describe('failureReasonOf', () => {
  it('reads the HTTP status of an API error', () => {
    assert.equal(failureReasonOf(apiError(400)), AutoTranslationFailure.REJECTED);
    assert.equal(failureReasonOf(apiError(404)), AutoTranslationFailure.REJECTED);
    assert.equal(failureReasonOf(apiError(422)), AutoTranslationFailure.REJECTED);
    assert.equal(failureReasonOf(apiError(401)), AutoTranslationFailure.SETUP);
    assert.equal(failureReasonOf(apiError(403)), AutoTranslationFailure.SETUP);
    assert.equal(failureReasonOf(apiError(429, 20_000)), AutoTranslationFailure.RATE_LIMITED);
    assert.equal(failureReasonOf(apiError(408)), AutoTranslationFailure.UNAVAILABLE);
    assert.equal(failureReasonOf(apiError(500)), AutoTranslationFailure.UNAVAILABLE);
    assert.equal(failureReasonOf(apiError(503, 5_000)), AutoTranslationFailure.UNAVAILABLE);
    assert.equal(failureReasonOf(apiError(409)), AutoTranslationFailure.UNKNOWN);
  });

  it('counts a timeout or an unreachable server as the service being unavailable', () => {
    assert.equal(failureReasonOf(new DOMException('timed out', 'TimeoutError')), AutoTranslationFailure.UNAVAILABLE);
    assert.equal(failureReasonOf(new DOMException('aborted', 'AbortError')), AutoTranslationFailure.UNAVAILABLE);
    assert.equal(failureReasonOf(new TypeError('fetch failed')), AutoTranslationFailure.UNAVAILABLE);
  });

  it('calls anything else unknown', () => {
    assert.equal(failureReasonOf(new Error('ChatGPT API returned an empty translation.')), AutoTranslationFailure.UNKNOWN);
    assert.equal(failureReasonOf(new TypeError('x is not a function')), AutoTranslationFailure.UNKNOWN);
    assert.equal(failureReasonOf('boom'), AutoTranslationFailure.UNKNOWN);
    assert.equal(failureReasonOf(null), AutoTranslationFailure.UNKNOWN);
  });
});

describe('failureMessage', () => {
  it('gives every reason a plain message that says what to do', () => {
    for (const reason of Object.values(AutoTranslationFailure)) {
      const message = failureMessage(reason);
      assert.match(message, /retr|admin/i, reason);
      assert.doesNotMatch(message, /ChatGPT|API|\d{3}|\{/, reason);
    }
  });

  it('points a refused key at an admin and a busy service at the automatic retry', () => {
    assert.match(failureMessage(AutoTranslationFailure.SETUP), /Contact an admin/);
    assert.match(failureMessage(AutoTranslationFailure.RATE_LIMITED), /retried automatically/);
  });

  it('falls back to the unknown message for a row without a reason', () => {
    assert.equal(failureMessage(null), failureMessage(AutoTranslationFailure.UNKNOWN));
  });
});
