import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentType } from '@/generated/prisma/enums';
import { resolveAudioFilename, resolveAudioObjectKey } from './audio.paths';

const base = { languageCode: 'cs', identifier: 'lent2026', slug: 'some-doc', audioFileId: 'abc-123' };

test('DAY audio key mirrors the repo path, nests the record id, ends in a readable filename', () => {
  const key = resolveAudioObjectKey({ ...base, documentType: DocumentType.DAY, originalFilename: '20.md' });
  assert.equal(key, 'audio/cs/exercises/lent2026/days/20/abc-123/lent2026-cs-day-20.mp3');
});

test('DAILY_CONTENT keeps the year/month folders and names by language and date', () => {
  const key = resolveAudioObjectKey({ ...base, documentType: DocumentType.DAILY_CONTENT, originalFilename: '20260201-5.md' });
  assert.equal(key, 'audio/cs/daily_content/2026/02/20260201-5/abc-123/cs-daily-content-20260201-5.mp3');
});

test('filenames per document type', () => {
  const p = (documentType: DocumentType, originalFilename: string) => resolveAudioFilename({ ...base, documentType, originalFilename });
  assert.equal(p(DocumentType.FIELD_GUIDE, 'guide.md'), 'lent2026-cs-field-guide-guide.mp3');
  assert.equal(p(DocumentType.MEETING, '1-6.md'), 'lent2026-cs-meeting-1-6.mp3');
  assert.equal(p(DocumentType.ROOT_FILE, 'description.md'), 'lent2026-cs-description.mp3');
});

test('filename falls back to the slug and is safe for any file system', () => {
  assert.equal(
    resolveAudioFilename({ ...base, documentType: DocumentType.DAY, originalFilename: null, slug: 'Třetí Neděle / Postní!' }),
    'lent2026-cs-day-treti-nedele-postni.mp3',
  );
});

test('a regeneration with a different record id produces a different key but the same filename', () => {
  const a = resolveAudioObjectKey({ ...base, documentType: DocumentType.DAY, originalFilename: '1.md' });
  const b = resolveAudioObjectKey({ ...base, documentType: DocumentType.DAY, originalFilename: '1.md', audioFileId: 'def' });
  assert.notEqual(a, b);
  assert.equal(a.split('/').pop(), b.split('/').pop());
});

test('errors from the repo path resolver propagate (no filename for MEETING)', () => {
  assert.throws(() => resolveAudioObjectKey({ ...base, documentType: DocumentType.MEETING, originalFilename: null }));
});
