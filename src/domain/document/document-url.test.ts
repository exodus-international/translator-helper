import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDocumentEditPath, buildDocumentPath, isReservedSlug } from './document-url';

const ref = {
  projectSlug: 'exodus90',
  slug: 'day-1',
  languageCode: 'cs',
  documentId: 'aa5eec1f-e70b-4877-aefd-bf837587ae31',
};

test('a document path carries no ids', () => {
  assert.equal(buildDocumentPath(ref), '/documents/exodus90/day-1/cs');
});

test('the edit path drops the language', () => {
  assert.equal(buildDocumentEditPath(ref), '/documents/exodus90/day-1/edit');
});

test('a document with no project falls back to the id-based path', () => {
  assert.equal(
    buildDocumentPath({ ...ref, projectSlug: null }),
    '/documents/aa5eec1f-e70b-4877-aefd-bf837587ae31/translate?lang=cs',
  );
  assert.equal(
    buildDocumentEditPath({ ...ref, projectSlug: undefined }),
    '/documents/aa5eec1f-e70b-4877-aefd-bf837587ae31/edit',
  );
});

test('segments are escaped', () => {
  assert.equal(buildDocumentPath({ ...ref, slug: 'a b/c' }), '/documents/exodus90/a%20b%2Fc/cs');
});



test('slugs that a static route would shadow are reserved', () => {
  assert.equal(isReservedSlug('edit'), true);
  assert.equal(isReservedSlug('new'), true);
  assert.equal(isReservedSlug('translate'), true);
  assert.equal(isReservedSlug('review'), true);
  assert.equal(isReservedSlug('day-1'), false);
});
