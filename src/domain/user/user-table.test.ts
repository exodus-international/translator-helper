import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesLanguageFilter,
  compareByLanguageThenName,
  matchesSearch,
  formatLastActive,
  type UserTableRow,
  type UserSearchRow,
} from './user-table';

function lang(id: string, name: string): { language: { id: string; name: string } } {
  return { language: { id, name } };
}

function user(name: string, languages: Array<[string, string]> = []): UserTableRow {
  return { name, languages: languages.map(([id, n]) => lang(id, n)) };
}

function searchUser(
  name: string,
  email: string,
  languages: Array<[string, string]> = [],
): UserSearchRow {
  return { name, email, languages: languages.map(([id, n]) => lang(id, n)) };
}

describe('matchesLanguageFilter', () => {
  it('matches everyone when no language is selected', () => {
    assert.equal(matchesLanguageFilter(user('Anna', [['cs', 'Czech']]), []), true);
    assert.equal(matchesLanguageFilter(user('NoLang'), []), true);
  });

  it('matches a single-language user when their language is selected', () => {
    assert.equal(matchesLanguageFilter(user('Anna', [['cs', 'Czech']]), ['cs']), true);
  });

  it('does not match when the user lacks every selected language', () => {
    assert.equal(matchesLanguageFilter(user('Anna', [['cs', 'Czech']]), ['de']), false);
  });

  it('matches a multi-language user under each of their languages', () => {
    const petr = user('Petr', [['cs', 'Czech'], ['de', 'German']]);
    assert.equal(matchesLanguageFilter(petr, ['cs']), true);
    assert.equal(matchesLanguageFilter(petr, ['de']), true);
  });

  it('matches when at least one selected language intersects', () => {
    const petr = user('Petr', [['cs', 'Czech']]);
    assert.equal(matchesLanguageFilter(petr, ['de', 'cs']), true);
  });

  it('never matches a user with no languages once a filter is active', () => {
    assert.equal(matchesLanguageFilter(user('NoLang'), ['cs']), false);
  });
});

describe('compareByLanguageThenName', () => {
  it('orders by first language alphabetically', () => {
    const result = [user('Klaus', [['de', 'German']]), user('Anna', [['cs', 'Czech']])].sort(
      compareByLanguageThenName,
    );
    assert.deepEqual(result.map((u) => u.name), ['Anna', 'Klaus']);
  });

  it('orders by name within the same language', () => {
    const result = [
      user('Petr', [['cs', 'Czech']]),
      user('Anna', [['cs', 'Czech']]),
    ].sort(compareByLanguageThenName);
    assert.deepEqual(result.map((u) => u.name), ['Anna', 'Petr']);
  });

  it('uses the alphabetically-first language for multi-language users', () => {
    // Boris has German+Czech; his first language is Czech, so he sorts before a
    // German-only user despite the German membership.
    const result = [
      user('Klaus', [['de', 'German']]),
      user('Boris', [['de', 'German'], ['cs', 'Czech']]),
    ].sort(compareByLanguageThenName);
    assert.deepEqual(result.map((u) => u.name), ['Boris', 'Klaus']);
  });

  it('sorts users with no language after everyone else', () => {
    const result = [
      user('NoLang'),
      user('Anna', [['cs', 'Czech']]),
    ].sort(compareByLanguageThenName);
    assert.deepEqual(result.map((u) => u.name), ['Anna', 'NoLang']);
  });

  it('orders two no-language users by name', () => {
    const result = [user('Zoe'), user('Adam')].sort(compareByLanguageThenName);
    assert.deepEqual(result.map((u) => u.name), ['Adam', 'Zoe']);
  });
});

describe('matchesSearch', () => {
  const anna = searchUser('Anna Horak', 'anna@example.org', [['cs', 'Czech']]);

  it('matches everyone for a blank or whitespace-only query', () => {
    assert.equal(matchesSearch(anna, ''), true);
    assert.equal(matchesSearch(anna, '   '), true);
  });

  it('matches on a name substring', () => {
    assert.equal(matchesSearch(anna, 'hor'), true);
  });

  it('matches on an email substring', () => {
    assert.equal(matchesSearch(anna, '@example'), true);
  });

  it('matches on a language name substring', () => {
    assert.equal(matchesSearch(anna, 'czech'), true);
  });

  it('is case-insensitive', () => {
    assert.equal(matchesSearch(anna, 'ANNA'), true);
    assert.equal(matchesSearch(anna, 'CZECH'), true);
  });

  it('does not match an unrelated query', () => {
    assert.equal(matchesSearch(anna, 'german'), false);
    assert.equal(matchesSearch(anna, 'zzz'), false);
  });
});

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

  it('falls back to a locale date beyond 30 days', () => {
    const old = new Date('2026-06-01T09:00:00Z');
    assert.equal(formatLastActive(old, now), old.toLocaleDateString());
  });

  it('accepts ISO strings', () => {
    assert.equal(formatLastActive('2026-07-20T10:00:00Z', now), 'yesterday');
  });
});
