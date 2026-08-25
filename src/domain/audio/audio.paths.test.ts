import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentType } from '@prisma/client';
import { resolveAudioObjectKey } from './audio.paths';

const base = { languageCode: 'cs', identifier: 'summer_2025', slug: 'some-doc', audioFileId: 'abc-123' };

test('DAY audio key mirrors the repo path under audio/ with the record id as filename', () => {
  const key = resolveAudioObjectKey({ ...base, documentType: DocumentType.DAY, originalFilename: '1.md' });
  assert.equal(key, 'audio/cs/exercises/summer_2025/days/1/abc-123.mp3');
});

test('DAILY_CONTENT audio key keeps the year/month folders', () => {
  const key = resolveAudioObjectKey({
    ...base,
    documentType: DocumentType.DAILY_CONTENT,
    originalFilename: '20260201-5.md',
  });
  assert.equal(key, 'audio/cs/daily_content/2026/02/20260201-5/abc-123.mp3');
});

test('a regeneration with a different record id produces a different key', () => {
  const a = resolveAudioObjectKey({ ...base, documentType: DocumentType.DAY, originalFilename: '1.md' });
  const b = resolveAudioObjectKey({ ...base, documentType: DocumentType.DAY, originalFilename: '1.md', audioFileId: 'def' });
  assert.notEqual(a, b);
});

test('errors from the repo path resolver propagate (no filename for MEETING)', () => {
  assert.throws(() => resolveAudioObjectKey({ ...base, documentType: DocumentType.MEETING, originalFilename: null }));
});
