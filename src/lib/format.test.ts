import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatLastActive, formatUnambiguousDate, getInitials } from './format';

describe('formatLastActive', () => {
  const now = new Date('2026-07-21T12:00:00Z');

  it('returns an em dash for missing values', () => {
    assert.equal(formatLastActive(null, now), '—');
    assert.equal(formatLastActive(undefined, now), '—');
  });

  it('formats the recent past relatively', () => {
    assert.equal(formatLastActive(new Date('2026-07-21T08:00:00Z'), now), 'today');
    assert.equal(formatLastActive(new Date('2026-07-20T09:00:00Z'), now), 'yesterday');
    assert.equal(formatLastActive(new Date('2026-07-16T09:00:00Z'), now), '5 days ago');
    assert.equal(formatLastActive(new Date('2026-06-21T09:00:00Z'), now), '30 days ago');
  });

  it('falls back to an unambiguous month-name date beyond 30 days', () => {
    const old = new Date('2026-06-01T09:00:00Z');
    assert.equal(formatLastActive(old, now), formatUnambiguousDate(old));
  });

  it('accepts ISO strings', () => {
    assert.equal(formatLastActive('2026-07-20T10:00:00Z', now), 'yesterday');
  });
});

describe('getInitials', () => {
  it('takes the first and last word', () => {
    assert.equal(getInitials('Marie Dubois'), 'MD');
    assert.equal(getInitials('Marie Anne Dubois'), 'MD');
  });

  it('uses a single letter for one-word names', () => {
    assert.equal(getInitials('Prince'), 'P');
  });

  it('ignores stray whitespace', () => {
    assert.equal(getInitials('  Jan   Novák  '), 'JN');
  });

  it('uppercases and falls back for missing names', () => {
    assert.equal(getInitials('ana kovač'), 'AK');
    assert.equal(getInitials(''), '?');
    assert.equal(getInitials(null), '?');
    assert.equal(getInitials(undefined), '?');
  });
});
