import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { announcementInputSchema } from './announcement.types';

// ─── Test fixtures ───────────────────────────────────────────

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    title: 'New feature released',
    body: 'We shipped **something great**.',
    type: 'BANNER',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe('announcementInputSchema', () => {
  it('accepts a minimal valid input and applies defaults', () => {
    const parsed = announcementInputSchema.parse(validInput());
    assert.strictEqual(parsed.title, 'New feature released');
    assert.strictEqual(parsed.type, 'BANNER');
    assert.strictEqual(parsed.ctaLabel, null);
    assert.strictEqual(parsed.ctaUrl, null);
    assert.strictEqual(parsed.isActive, false);
    assert.strictEqual(parsed.expiresAt, null);
  });

  it('accepts MODAL type with a body', () => {
    const parsed = announcementInputSchema.parse(validInput({ type: 'MODAL' }));
    assert.strictEqual(parsed.type, 'MODAL');
  });

  it('accepts a BANNER without a body (one-liner)', () => {
    const parsed = announcementInputSchema.parse(validInput({ body: null }));
    assert.strictEqual(parsed.body, null);
  });

  it('treats an empty-string body as absent', () => {
    const parsed = announcementInputSchema.parse(validInput({ body: '' }));
    assert.strictEqual(parsed.body, null);
  });

  it('rejects a MODAL without a body', () => {
    assert.throws(() => announcementInputSchema.parse(validInput({ type: 'MODAL', body: null })));
  });

  it('rejects a MODAL with an empty body', () => {
    assert.throws(() => announcementInputSchema.parse(validInput({ type: 'MODAL', body: '' })));
  });

  it('rejects an unknown type', () => {
    assert.throws(() => announcementInputSchema.parse(validInput({ type: 'TOAST' })));
  });

  it('rejects a missing title', () => {
    assert.throws(() =>
      announcementInputSchema.parse({ body: 'We shipped something.', type: 'BANNER' }),
    );
  });


  it('accepts CTA label and URL together', () => {
    const parsed = announcementInputSchema.parse(
      validInput({ ctaLabel: 'Fill out survey', ctaUrl: 'https://forms.example.com/abc' }),
    );
    assert.strictEqual(parsed.ctaLabel, 'Fill out survey');
    assert.strictEqual(parsed.ctaUrl, 'https://forms.example.com/abc');
  });

  it('rejects a CTA label without a URL', () => {
    assert.throws(() => announcementInputSchema.parse(validInput({ ctaLabel: 'Fill out survey' })));
  });

  it('rejects a CTA URL without a label', () => {
    assert.throws(() => announcementInputSchema.parse(validInput({ ctaUrl: 'https://forms.example.com/abc' })));
  });

  it('rejects an invalid CTA URL', () => {
    assert.throws(() =>
      announcementInputSchema.parse(validInput({ ctaLabel: 'Survey', ctaUrl: 'not-a-url' })),
    );
  });

  it('treats empty-string CTA fields as absent', () => {
    const parsed = announcementInputSchema.parse(validInput({ ctaLabel: '', ctaUrl: '' }));
    assert.strictEqual(parsed.ctaLabel, null);
    assert.strictEqual(parsed.ctaUrl, null);
  });

  it('coerces an ISO string expiry to a Date', () => {
    const parsed = announcementInputSchema.parse(validInput({ expiresAt: '2026-08-01T00:00:00.000Z' }));
    assert.ok(parsed.expiresAt instanceof Date);
    assert.strictEqual(parsed.expiresAt.toISOString(), '2026-08-01T00:00:00.000Z');
  });

  it('keeps a null expiry as null (not the epoch)', () => {
    const parsed = announcementInputSchema.parse(validInput({ expiresAt: null }));
    assert.strictEqual(parsed.expiresAt, null);
  });

  it('treats an empty-string expiry as null', () => {
    const parsed = announcementInputSchema.parse(validInput({ expiresAt: '' }));
    assert.strictEqual(parsed.expiresAt, null);
  });

  it('rejects an unparseable expiry', () => {
    assert.throws(() => announcementInputSchema.parse(validInput({ expiresAt: 'not-a-date' })));
  });

  it('accepts isActive true', () => {
    const parsed = announcementInputSchema.parse(validInput({ isActive: true }));
    assert.strictEqual(parsed.isActive, true);
  });
});
