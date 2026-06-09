import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentType } from '@prisma/client';
import { resolveFilePath } from './github.paths';

const base = {
  languageCode: 'cs',
  identifier: 'summer_2025',
  slug: 'some-doc',
};

test('DAY routes into the days subfolder', () => {
  const path = resolveFilePath({ ...base, documentType: DocumentType.DAY, originalFilename: '1.md' });
  assert.equal(path, 'translations/cs/exercises/summer_2025/days/1.md');
});

test('FIELD_GUIDE routes into the field_guide subfolder', () => {
  const path = resolveFilePath({ ...base, documentType: DocumentType.FIELD_GUIDE, originalFilename: 'guide.md' });
  assert.equal(path, 'translations/cs/exercises/summer_2025/field_guide/guide.md');
});

test('DAILY_CONTENT routes into daily_content/year/month', () => {
  const path = resolveFilePath({ ...base, documentType: DocumentType.DAILY_CONTENT, originalFilename: '20260201-5.md' });
  assert.equal(path, 'translations/cs/daily_content/2026/02/20260201-5.md');
});

test('MEETING routes into the meetings subfolder', () => {
  const path = resolveFilePath({ ...base, documentType: DocumentType.MEETING, originalFilename: '1-6.md' });
  assert.equal(path, 'translations/cs/exercises/summer_2025/meetings/1-6.md');
});

test('ROOT_FILE routes to the program root (no subfolder)', () => {
  const md = resolveFilePath({ ...base, documentType: DocumentType.ROOT_FILE, originalFilename: 'description.md' });
  assert.equal(md, 'translations/cs/exercises/summer_2025/description.md');

  const yml = resolveFilePath({ ...base, documentType: DocumentType.ROOT_FILE, originalFilename: 'disciplines.yml' });
  assert.equal(yml, 'translations/cs/exercises/summer_2025/disciplines.yml');
});

test('falls back to {slug}.md when no original filename is provided', () => {
  const path = resolveFilePath({ ...base, documentType: DocumentType.DAY, originalFilename: null });
  assert.equal(path, 'translations/cs/exercises/summer_2025/days/some-doc.md');
});

test('throws when MEETING is missing an original filename (no slug fallback)', () => {
  assert.throws(() => resolveFilePath({ ...base, documentType: DocumentType.MEETING, originalFilename: null }));
});

test('throws when ROOT_FILE is missing an original filename (no slug fallback)', () => {
  assert.throws(() => resolveFilePath({ ...base, documentType: DocumentType.ROOT_FILE, originalFilename: null }));
});

test('throws for an unknown document type', () => {
  assert.throws(() =>
    resolveFilePath({ ...base, documentType: 'NONSENSE' as DocumentType, originalFilename: 'x.md' }),
  );
});
