import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDigestDue, lastDigestTime, renderDigestEmail } from './notification.email';

describe('lastDigestTime', () => {
  it('is today at noon CET once noon has passed', () => {
    // Winter: CET is UTC+1, so noon is 11:00 UTC.
    assert.equal(lastDigestTime(new Date('2026-01-15T13:00:00Z')).toISOString(), '2026-01-15T11:00:00.000Z');
  });

  it('is yesterday at noon while it is still morning', () => {
    assert.equal(lastDigestTime(new Date('2026-01-15T10:59:00Z')).toISOString(), '2026-01-14T11:00:00.000Z');
  });

  it('follows summer time', () => {
    // Summer: CEST is UTC+2, so noon is 10:00 UTC.
    assert.equal(lastDigestTime(new Date('2026-07-01T10:00:00Z')).toISOString(), '2026-07-01T10:00:00.000Z');
  });

  it('crosses a clock change', () => {
    // Clocks go forward early on 29 March 2026; noon the day before was still CET.
    assert.equal(lastDigestTime(new Date('2026-03-29T09:00:00Z')).toISOString(), '2026-03-28T11:00:00.000Z');
    assert.equal(lastDigestTime(new Date('2026-03-29T10:00:00Z')).toISOString(), '2026-03-29T10:00:00.000Z');
  });
});

describe('isDigestDue', () => {
  const noon = new Date('2026-01-15T11:00:00Z');

  it('waits for noon', () => {
    assert.equal(isDigestDue([new Date('2026-01-15T08:00:00Z')], new Date('2026-01-15T10:59:00Z')), false);
  });

  it('sends what was waiting at noon', () => {
    assert.equal(isDigestDue([new Date('2026-01-15T08:00:00Z')], new Date('2026-01-15T11:05:00Z')), true);
  });

  it('holds what arrived after noon until the next day', () => {
    const afternoon = new Date('2026-01-15T14:00:00Z');
    assert.equal(isDigestDue([afternoon], new Date('2026-01-15T18:00:00Z')), false);
    assert.equal(isDigestDue([afternoon], new Date('2026-01-16T11:00:00Z')), true);
  });

  it('is never due with nothing pending', () => {
    assert.equal(isDigestDue([], noon), false);
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
