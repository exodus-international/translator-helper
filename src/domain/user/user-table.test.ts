import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareByLanguageThenName,
  matchesSearch,
  resolveSelectedLanguages,
  type UserTableRow,
  type UserSearchRow,
} from './user-table';

function lang(id: string, name: string): { language: { id: string; name: string } } {
  return { language: { id, name } };
}

function user(name: string, languages: Array<[string, string]> = []): UserTableRow {
  return { name, languages: languages.map(([id, n]) => lang(id, n)) };
}

function searchUser(name: string, email: string, languages: Array<[string, string]> = []): UserSearchRow {
  return { name, email, languages: languages.map(([id, n]) => lang(id, n)) };
}

describe('compareByLanguageThenName', () => {
  it('orders by first language alphabetically', () => {
    const result = [user('Klaus', [['de', 'German']]), user('Anna', [['cs', 'Czech']])].sort(compareByLanguageThenName);
    assert.deepEqual(
      result.map((u) => u.name),
      ['Anna', 'Klaus'],
    );
  });

  it('orders by name within the same language', () => {
    const result = [user('Petr', [['cs', 'Czech']]), user('Anna', [['cs', 'Czech']])].sort(compareByLanguageThenName);
    assert.deepEqual(
      result.map((u) => u.name),
      ['Anna', 'Petr'],
    );
  });

  it('uses the alphabetically-first language for multi-language users', () => {
    // Boris has German+Czech; his first language is Czech, so he sorts before a
    // German-only user despite the German membership.
    const result = [
      user('Klaus', [['de', 'German']]),
      user('Boris', [
        ['de', 'German'],
        ['cs', 'Czech'],
      ]),
    ].sort(compareByLanguageThenName);
    assert.deepEqual(
      result.map((u) => u.name),
      ['Boris', 'Klaus'],
    );
  });

  it('sorts users with no language after everyone else', () => {
    const result = [user('NoLang'), user('Anna', [['cs', 'Czech']])].sort(compareByLanguageThenName);
    assert.deepEqual(
      result.map((u) => u.name),
      ['Anna', 'NoLang'],
    );
  });

  it('orders two no-language users by name', () => {
    const result = [user('Zoe'), user('Adam')].sort(compareByLanguageThenName);
    assert.deepEqual(
      result.map((u) => u.name),
      ['Adam', 'Zoe'],
    );
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

describe('resolveSelectedLanguages', () => {
  const ENGLISH = { id: 'en-id', name: 'English' };
  const CZECH = { id: 'cs-id', name: 'Czech' };
  const SLOVAK = { id: 'sk-id', name: 'Slovak' };

  // The admin dialog only offers target languages, so English is never in it.
  const assignable = [CZECH, SLOVAK];

  it('resolves ids to their language objects, preserving selection order', () => {
    assert.deepEqual(resolveSelectedLanguages([SLOVAK.id, CZECH.id], assignable), [
      { language: SLOVAK },
      { language: CZECH },
    ]);
  });

  it('resolves an already-assigned English when it is among the known languages', () => {
    assert.deepEqual(resolveSelectedLanguages([ENGLISH.id, CZECH.id], [...assignable, ENGLISH]), [
      { language: ENGLISH },
      { language: CZECH },
    ]);
  });

  it('never yields an entry with an undefined language', () => {
    const resolved = resolveSelectedLanguages([ENGLISH.id, CZECH.id], assignable);

    assert.deepEqual(resolved, [{ language: CZECH }]);
    assert.ok(resolved.every((entry) => entry.language !== undefined));
  });

  it('keeps the result usable by the table consumers that crashed', () => {
    const resolved = resolveSelectedLanguages([ENGLISH.id, CZECH.id], assignable);

    // These are the exact reads that threw: the languages accessorFn and the sorter.
    assert.deepEqual(
      resolved.map((ul) => ul.language.id),
      [CZECH.id],
    );
    assert.doesNotThrow(() =>
      compareByLanguageThenName({ name: 'Anna', languages: resolved }, { name: 'Bob', languages: [] }),
    );
  });

  it('returns an empty list when nothing is selected', () => {
    assert.deepEqual(resolveSelectedLanguages([], assignable), []);
  });

  it('returns an empty list when nothing resolves', () => {
    assert.deepEqual(resolveSelectedLanguages([ENGLISH.id], assignable), []);
  });
});
