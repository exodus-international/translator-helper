import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentType } from '@prisma/client';
import {
  DocumentTypeFilterValue,
  NO_TYPE,
  matchesDocumentTypeFilter,
  parseDocumentTypeFilter,
  serializeDocumentTypeFilter,
  toggleDocumentTypeFilter,
} from './document-type-filter';

test('an empty selection matches every document', () => {
  assert.equal(matchesDocumentTypeFilter(DocumentType.DAY, []), true);
  assert.equal(matchesDocumentTypeFilter(null, []), true);
});

test('a selection matches only the picked types', () => {
  const selected = [DocumentType.DAY, DocumentType.MEETING];
  assert.equal(matchesDocumentTypeFilter(DocumentType.DAY, selected), true);
  assert.equal(matchesDocumentTypeFilter(DocumentType.MEETING, selected), true);
  assert.equal(matchesDocumentTypeFilter(DocumentType.FIELD_GUIDE, selected), false);
});

test('untyped documents are hidden unless NO_TYPE is picked', () => {
  assert.equal(matchesDocumentTypeFilter(null, [DocumentType.DAY]), false);
  assert.equal(matchesDocumentTypeFilter(null, [NO_TYPE]), true);
  assert.equal(matchesDocumentTypeFilter(undefined, [NO_TYPE]), true);
  assert.equal(matchesDocumentTypeFilter(DocumentType.DAY, [NO_TYPE]), false);
});

test('toggle adds then removes a value without touching the rest', () => {
  const once = toggleDocumentTypeFilter([DocumentType.DAY], DocumentType.MEETING);
  assert.deepEqual(once, [DocumentType.DAY, DocumentType.MEETING]);

  const twice = toggleDocumentTypeFilter(once, DocumentType.MEETING);
  assert.deepEqual(twice, [DocumentType.DAY]);
});

test('a persisted selection round-trips', () => {
  const selected: DocumentTypeFilterValue[] = [DocumentType.DAY, NO_TYPE];
  assert.deepEqual(parseDocumentTypeFilter(serializeDocumentTypeFilter(selected)), selected);
});

test('unparseable or unknown persisted values are dropped', () => {
  assert.deepEqual(parseDocumentTypeFilter(null), []);
  assert.deepEqual(parseDocumentTypeFilter(''), []);
  assert.deepEqual(parseDocumentTypeFilter('not json'), []);
  assert.deepEqual(parseDocumentTypeFilter('"DAY"'), []);
  assert.deepEqual(parseDocumentTypeFilter('["DAY","RETIRED_TYPE",42]'), [DocumentType.DAY]);
});

test('duplicate persisted values collapse to one', () => {
  assert.deepEqual(parseDocumentTypeFilter('["DAY","DAY"]'), [DocumentType.DAY]);
});
