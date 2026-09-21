import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DIGEST_MAX_WAIT, DIGEST_QUIET_PERIOD, isDigestDue, renderDigestEmail } from './notification.email';

const now = new Date('2026-09-21T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('isDigestDue', () => {
  it('waits while nothing is pending', () => {
    assert.equal(isDigestDue([], now), false);
  });

  it('waits while the burst is still going', () => {
    assert.equal(isDigestDue([ago(DIGEST_QUIET_PERIOD - 1), ago(60_000)], now), false);
  });

  it('sends once the newest notification has gone quiet', () => {
    assert.equal(isDigestDue([ago(DIGEST_QUIET_PERIOD), ago(DIGEST_QUIET_PERIOD + 60_000)], now), true);
  });

  it('sends a burst that never goes quiet after the maximum wait', () => {
    assert.equal(isDigestDue([ago(DIGEST_MAX_WAIT), ago(1_000)], now), true);
  });
});

describe('renderDigestEmail', () => {
  const appUrl = 'https://translate.example.org';

  it('uses a lone notification as the subject and links it absolutely', () => {
    const email = renderDigestEmail(
      'Ana Horvat',
      [
        {
          type: 'ASSIGNED_TRANSLATOR',
          title: 'Translate "Day 3" (Croatian)',
          body: 'Due Fri 25 Sept',
          url: '/documents/sml/day-3/hr',
        },
      ],
      appUrl,
    );
    assert.equal(email.subject, 'Translate "Day 3" (Croatian)');
    assert.match(email.html, /href="https:\/\/translate\.example\.org\/documents\/sml\/day-3\/hr"/);
    assert.match(email.text, /^Hi Ana,/);
    assert.match(email.html, /src="https:\/\/translate\.example\.org\/email\/exodus90-white-orange\.png"/);
    assert.match(email.text, /https:\/\/translate\.example\.org\/profile#notifications/);
  });

  it('counts several notifications in the subject', () => {
    const items = [
      { type: 'UNASSIGNED' as const, title: 'One', body: null, url: null },
      { type: 'UNASSIGNED' as const, title: 'Two', body: null, url: null },
    ];
    assert.equal(renderDigestEmail('Ana', items, appUrl).subject, '2 updates in Translation Helper');
  });

  it('escapes what users typed', () => {
    const email = renderDigestEmail(
      'Ana',
      [{ type: 'SUGGESTION_ADDED', title: '<script>x</script>', body: 'a & b', url: null }],
      appUrl,
    );
    assert.doesNotMatch(email.html, /<script>/);
    assert.match(email.html, /&lt;script&gt;/);
    assert.match(email.html, /a &amp; b/);
  });

  it('puts late work first and says so in the subject', () => {
    const email = renderDigestEmail(
      'Ana',
      [
        { type: 'ASSIGNED_TRANSLATOR', title: 'Assigned', body: null, url: null },
        { type: 'DEADLINE_APPROACHING', title: 'Due soon', body: null, url: null },
        { type: 'DEADLINE_PASSED', title: 'Late', body: null, url: '/documents/sml/day-3/hr' },
      ],
      appUrl,
    );
    assert.equal(email.subject, '3 updates in Translation Helper (1 overdue, 1 due soon)');
    assert.match(email.text, /\[OVERDUE\] Late[\s\S]*\[DUE SOON\] Due soon[\s\S]*\[NEW ASSIGNMENT\] Assigned/);
    assert.match(email.html, /Open now/);
  });

  it('leads with the deadline when that is all there is', () => {
    const email = renderDigestEmail('Ana', [{ type: 'DEADLINE_PASSED', title: 'Late', body: null, url: null }], appUrl);
    assert.match(email.text, /A deadline has passed\./);
  });
});
