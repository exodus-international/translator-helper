import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentType } from '@prisma/client';
import { createDocumentSchema, updateDocumentSchema } from './document.types';

const validCreate = {
  slug: 'some-doc',
  title: 'Some Doc',
  content: '',
  sourceProjectId: '11111111-1111-4111-8111-111111111111',
};

test('createDocumentSchema rejects MEETING without a filename', () => {
  const result = createDocumentSchema.safeParse({ ...validCreate, type: DocumentType.MEETING });
  assert.equal(result.success, false);
});

test('createDocumentSchema rejects ROOT_FILE with a path separator', () => {
  const result = createDocumentSchema.safeParse({
    ...validCreate,
    type: DocumentType.ROOT_FILE,
    originalFilename: 'meetings/1-6.md',
  });
  assert.equal(result.success, false);
});

test('createDocumentSchema accepts a valid MEETING filename', () => {
  const result = createDocumentSchema.safeParse({
    ...validCreate,
    type: DocumentType.MEETING,
    originalFilename: '1-6.md',
  });
  assert.equal(result.success, true);
});

test('createDocumentSchema imposes no filename rule for unconstrained types', () => {
  const result = createDocumentSchema.safeParse({ ...validCreate, type: DocumentType.DAY });
  assert.equal(result.success, true);
});

test('updateDocumentSchema rejects setting ROOT_FILE without a filename', () => {
  const result = updateDocumentSchema.safeParse({ type: DocumentType.ROOT_FILE, originalFilename: null });
  assert.equal(result.success, false);
});

test('updateDocumentSchema ignores filename rules when type is absent', () => {
  const result = updateDocumentSchema.safeParse({ title: 'Renamed' });
  assert.equal(result.success, true);
});
