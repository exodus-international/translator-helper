import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { missingVersionPairs } from './document-version.repository';

// Eager version creation is what keeps a document from rendering as a gap: every
// document in a source project must have a version in every language being
// translated. These pin the rule that decides which rows to create.

describe('missingVersionPairs', () => {
  it('creates the full grid when nothing exists yet', () => {
    const pairs = missingVersionPairs(['d1', 'd2'], ['cs', 'de'], []);
    assert.deepStrictEqual(pairs, [
      { documentId: 'd1', languageId: 'cs' },
      { documentId: 'd1', languageId: 'de' },
      { documentId: 'd2', languageId: 'cs' },
      { documentId: 'd2', languageId: 'de' },
    ]);
  });

  it('skips the pairs that already have a version', () => {
    const pairs = missingVersionPairs(
      ['d1', 'd2'],
      ['cs', 'de'],
      [
        { documentId: 'd1', languageId: 'cs' },
        { documentId: 'd2', languageId: 'de' },
      ],
    );
    assert.deepStrictEqual(pairs, [
      { documentId: 'd1', languageId: 'de' },
      { documentId: 'd2', languageId: 'cs' },
    ]);
  });

  it('is idempotent — nothing is missing once every pair exists', () => {
    const existing = [
      { documentId: 'd1', languageId: 'cs' },
      { documentId: 'd1', languageId: 'de' },
    ];
    assert.deepStrictEqual(missingVersionPairs(['d1'], ['cs', 'de'], existing), []);
  });

  it('ignores versions in languages the project does not translate', () => {
    const pairs = missingVersionPairs(['d1'], ['cs'], [{ documentId: 'd1', languageId: 'en' }]);
    assert.deepStrictEqual(pairs, [{ documentId: 'd1', languageId: 'cs' }]);
  });

  it('returns nothing when there are no documents or no languages', () => {
    assert.deepStrictEqual(missingVersionPairs([], ['cs'], []), []);
    assert.deepStrictEqual(missingVersionPairs(['d1'], [], []), []);
  });
});
