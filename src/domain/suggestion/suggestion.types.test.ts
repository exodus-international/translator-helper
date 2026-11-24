import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SuggestionStatus, SuggestionType } from '@/generated/prisma/enums';
import { getSuggestionsSchema } from './suggestion.types';

const id = '11111111-1111-4111-8111-111111111111';

describe('getSuggestionsSchema', () => {
  it('accepts a uuid with no filters', () => {
    assert.equal(getSuggestionsSchema.safeParse({ documentVersionId: id }).success, true);
  });

  it('accepts the enumerated filters, including ALL', () => {
    const result = getSuggestionsSchema.safeParse({
      documentVersionId: id,
      filters: { status: SuggestionStatus.OPEN, type: 'ALL', userId: 'user-1' },
    });
    assert.equal(result.success, true);
  });

  it('rejects an id that is not a uuid, or an operator object in its place', () => {
    assert.equal(getSuggestionsSchema.safeParse({ documentVersionId: 'abc' }).success, false);
    assert.equal(getSuggestionsSchema.safeParse({ documentVersionId: { not: '' } }).success, false);
  });

  it('rejects operator objects and unknown filter fields', () => {
    const parse = (filters: unknown) => getSuggestionsSchema.safeParse({ documentVersionId: id, filters }).success;
    assert.equal(parse({ userId: { not: 'x' } }), false);
    assert.equal(parse({ status: { in: ['OPEN'] } }), false);
    assert.equal(parse({ type: 'NOPE' }), false);
    assert.equal(parse({ documentVersionId: { not: id } }), false);
    assert.equal(parse({ type: SuggestionType.COMMENT, extra: 1 }), false);
  });
});
