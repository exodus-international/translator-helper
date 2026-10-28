import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRefreshTimestamp, SESSION_REFRESH_INTERVAL_MS, shouldRefreshSession } from './session-refresh';

describe('shouldRefreshSession', () => {
  const now = 1_800_000_000_000;

  it('refreshes when the tab has never asked', () => {
    assert.equal(shouldRefreshSession(null, now), true);
  });

  it('waits until the interval has passed', () => {
    assert.equal(shouldRefreshSession(now - 1000, now), false);
    assert.equal(shouldRefreshSession(now - SESSION_REFRESH_INTERVAL_MS + 1, now), false);
  });

  it('refreshes once the interval has passed', () => {
    assert.equal(shouldRefreshSession(now - SESSION_REFRESH_INTERVAL_MS, now), true);
    assert.equal(shouldRefreshSession(now - 2 * SESSION_REFRESH_INTERVAL_MS, now), true);
  });

  it('refreshes when the stored time is in the future', () => {
    assert.equal(shouldRefreshSession(now + 60_000, now), true);
  });

  it('refreshes when the stored time is not a number', () => {
    assert.equal(shouldRefreshSession(Number.NaN, now), true);
  });

  it('honours a custom interval', () => {
    assert.equal(shouldRefreshSession(now - 500, now, 1000), false);
    assert.equal(shouldRefreshSession(now - 1000, now, 1000), true);
  });
});

describe('parseRefreshTimestamp', () => {
  it('reads a stored number', () => {
    assert.equal(parseRefreshTimestamp('1800000000000'), 1_800_000_000_000);
  });

  it('treats missing or junk values as absent', () => {
    assert.equal(parseRefreshTimestamp(null), null);
    assert.equal(parseRefreshTimestamp(''), null);
    assert.equal(parseRefreshTimestamp('soon'), null);
  });
});
