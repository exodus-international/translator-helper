import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import {
  alignVerses,
  bookStatus,
  codeFromFileName,
  compareChapters,
  describeMapping,
  gzipFile,
  splitReferences,
  summarizeCoverage,
  unhandledChapters,
} from './bible-admin';

test('coverage counts declared and reviewed books against the books present', () => {
  const s = summarizeCoverage({ declaredBooks: 60, presentBooks: 73, reviewedBooks: 12, unmappableChapters: 2 });
  assert.equal(s.declaredPercent, 82);
  assert.equal(s.reviewedPercent, 16);
  assert.equal(s.undeclaredBooks, 13);
  assert.equal(s.complete, false);
  assert.equal(s.label, '60 of 73 books declared, 12 reviewed, 2 unmappable chapters');
});

test('the source is complete coverage, and an empty translation is not', () => {
  assert.equal(
    summarizeCoverage({ declaredBooks: 73, presentBooks: 73, reviewedBooks: 73, unmappableChapters: 0 }).complete,
    true,
  );
  const empty = summarizeCoverage({ declaredBooks: 0, presentBooks: 0, reviewedBooks: 0, unmappableChapters: 0 });
  assert.equal(empty.complete, false);
  assert.equal(empty.declaredPercent, 0);
});

test('chapters whose verse counts differ are flagged, and missing chapters count as different', () => {
  const rows = compareChapters({
    sourceChapterVerseCounts: [31, 25, 24],
    chapterVerseCounts: [31, 27, 24, 10],
    unmappableChapters: [],
    mappedChapters: [],
  });
  assert.deepEqual(
    rows.map((r) => [r.chapter, r.source, r.target, r.delta, r.differs]),
    [
      [1, 31, 31, 0, false],
      [2, 25, 27, 2, true],
      [3, 24, 24, 0, false],
      [4, null, 10, null, true],
    ],
  );
});

test('a differing chapter that is mapped or unmappable is no longer unhandled', () => {
  const rows = compareChapters({
    sourceChapterVerseCounts: [10, 12, 14],
    chapterVerseCounts: [11, 13, 15],
    unmappableChapters: [3],
    mappedChapters: [1],
  });
  assert.deepEqual(
    unhandledChapters(rows).map((r) => r.chapter),
    [2],
  );
  assert.equal(rows[2]!.unmappable, true);
  assert.equal(rows[0]!.mapped, true);
});

test('a mapping row reads as one line', () => {
  const base = { srcChapter: 51, srcVerseFrom: null, srcVerseTo: null, dstChapter: 51, offset: 0, unmappable: false };
  assert.equal(
    describeMapping({ ...base, srcVerseFrom: 1, srcVerseTo: 19, offset: 2 }),
    'Source 51:1–19 → target 51, verse +2',
  );
  assert.equal(describeMapping({ ...base, dstChapter: 52, offset: -1 }), 'Source chapter 51 → target 52, verse −1');
  assert.equal(describeMapping({ ...base, srcVerseFrom: 3 }), 'Source 51:3–end → target 51, same verse numbers');
  assert.equal(
    describeMapping({ ...base, unmappable: true }),
    'Source chapter 51 is unmappable: references to it are not resolved',
  );
});

test('book status: undeclared books cannot resolve; unmappable chapters outrank reviewed', () => {
  assert.deepEqual(bookStatus({ declared: false, reviewed: false, unmappableChapters: [] }, 'target'), {
    label: 'Not declared',
    variant: 'destructive',
    resolvable: false,
  });
  assert.equal(
    bookStatus({ declared: true, reviewed: true, unmappableChapters: [3, 4] }, 'target').label,
    '2 unmappable chapters',
  );
  assert.equal(bookStatus({ declared: true, reviewed: true, unmappableChapters: [] }, 'target').label, 'Reviewed');
  assert.equal(bookStatus({ declared: true, reviewed: false, unmappableChapters: [] }, 'target').label, 'Declared');
  assert.equal(bookStatus({ declared: false, reviewed: false, unmappableChapters: [] }, 'source').label, 'Source');
});

test('references split per line and at a semicolon that starts a new book', () => {
  assert.deepEqual(splitReferences('John 3:16\n\n  1 Cor 13:4-7 \nRom 8:28; 30; 1 Cor 1:1;Ps 23'), [
    'John 3:16',
    '1 Cor 13:4-7',
    'Rom 8:28; 30',
    '1 Cor 1:1',
    'Ps 23',
  ]);
  assert.deepEqual(splitReferences('Iv 3,16; Mt 5,3'), ['Iv 3,16', 'Mt 5,3']);
  assert.deepEqual(splitReferences(' ; \n'), []);
});

test('a translation code is read from the file name', () => {
  assert.equal(codeFromFileName('sar-hr.json'), 'sar-hr');
  assert.equal(codeFromFileName('SAR-HR.json.gz'), 'sar-hr');
  assert.equal(codeFromFileName('sar-hr.versification.json'), 'sar-hr');
  assert.equal(codeFromFileName('my bible (1).json'), null);
});

test('files are gzipped on the way up, and an already gzipped file is sent as it is', async () => {
  const text = JSON.stringify({ code: 'sar-hr', books: [] });
  const zipped = await gzipFile(new Blob([text]), 'sar-hr.json');
  assert.equal(zipped.name, 'sar-hr.json.gz');
  assert.equal(zipped.compressed, true);
  assert.equal(gunzipSync(Buffer.from(await zipped.blob.arrayBuffer())).toString('utf8'), text);

  const already = await gzipFile(zipped.blob, 'sar-hr.json.gz');
  assert.equal(already.compressed, false);
  assert.equal(already.blob, zipped.blob);
});

test('two chapters line up by verse number, merged verses spanning their rows', () => {
  const rows = alignVerses(
    [
      { verse: 1, text: 'a' },
      { verse: 2, text: 'b' },
      { verse: 3, text: 'c' },
    ],
    [
      { verse: 0, text: 'title' },
      { verse: 1, verse_end: 2, text: 'ab' },
      { verse: 3, text: 'c' },
    ],
  );
  assert.deepEqual(
    rows.map((r) => [r.verse, r.source?.label ?? null, r.target?.label ?? null, r.target?.continued ?? null]),
    [
      [0, null, '0', false],
      [1, '1', '1–2', false],
      [2, '2', '1–2', true],
      [3, '3', '3', false],
    ],
  );
});
