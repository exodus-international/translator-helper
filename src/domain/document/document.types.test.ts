import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentType } from '@/generated/prisma/enums';
import { createDocumentSchema, toggleDocumentLabelSchema, updateDocumentSchema } from './document.types';

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

test('toggleDocumentLabelSchema takes a uuid and a trimmed non-empty label', () => {
  const documentId = '11111111-1111-4111-8111-111111111111';
  const ok = toggleDocumentLabelSchema.safeParse({ documentId, label: '  Waiting for final label ' });
  assert.equal(ok.success, true);
  assert.equal(ok.success && ok.data.label, 'Waiting for final label');
  assert.equal(toggleDocumentLabelSchema.safeParse({ documentId: 'nope', label: 'x' }).success, false);
  assert.equal(toggleDocumentLabelSchema.safeParse({ documentId, label: '   ' }).success, false);
  assert.equal(toggleDocumentLabelSchema.safeParse({ documentId, label: 'x'.repeat(101) }).success, false);
  assert.equal(toggleDocumentLabelSchema.safeParse({ documentId, label: { $ne: 1 } }).success, false);
});
