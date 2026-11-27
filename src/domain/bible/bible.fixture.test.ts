/**
 * The resolver and the importer's file handling against a small committed
 * excerpt of RSV-CE and Šarić (Psalms 3, 4, 51; Joel; Malachi; John 3-4), so
 * they are covered without the full bible-api data directory.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { memoryBible } from './bible.memory';
import { resolvePassage, validateReference } from './bible.passages';
import { prepareDeclarations, prepareTranslation, searchKey } from './bible.prepare';
import { decodeUpload, MAX_FILE_BYTES, parseDeclarationsFile, parseTranslationFile, resolveMeta } from './bible.import';
import { BibleImportError } from './bible.repository';
import { DEFAULT_INCLUDE } from './bible.types';

const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8');

const source = prepareTranslation(parseTranslationFile(fixture('rsvce-en.json')), resolveMeta('rsvce-en', {}));
const target = prepareTranslation(
  parseTranslationFile(fixture('sar-hr.json')),
  resolveMeta('sar-hr', {}),
  parseDeclarationsFile(fixture('sar-hr.versification.json')),
);
const bible = memoryBible([source, target]);
const hr = bible.findTranslation('hr')!;
const resolve = (ref: string) => resolvePassage(bible, ref, hr, { ...DEFAULT_INCLUDE, source: true });

describe('resolver on the fixture', () => {
  it('reads an English citation in Croatian notation', async () => {
    const r = await resolve('John 3:16');
    assert.equal(r.status, 'ok');
    assert.equal(r.translation, 'sar-hr');
    assert.equal(r.rendered, 'Iv 3,16');
    assert.match(r.text!, /^Jer je Bog tako ljubio svijet/);
    assert.match(r.source!.text!, /^For God so loved the world/);
  });

  it('reads a Croatian citation the same way', async () => {
    const r = await resolve('Iv 3,16-17');
    assert.equal(r.status, 'ok');
    assert.equal(r.rendered, 'Iv 3,16-17');
    assert.equal(r.verses!.length, 2);
  });

  it('applies the psalm superscription offset', async () => {
    const r = await resolve('Ps 51:1-3');
    assert.equal(r.status, 'ok');
    assert.equal(r.rendered, 'Ps 51,3-5');
  });

  it('refuses a chapter whose numbering is not mapped yet', async () => {
    const r = await resolve('Mal 4:5');
    assert.equal(r.status, 'versification_unmapped');
    assert.equal(r.text, undefined);
  });

  it('reports what it cannot read', async () => {
    assert.equal((await resolve('hello')).status, 'unparseable');
    assert.equal((await resolve('Xyz 1:1')).status, 'unknown_book');
    assert.equal((await resolve('John 3:99')).status, 'out_of_range');
    const partial = await resolve('Jn 3:16; 5:1');
    assert.equal(partial.status, 'partial');
    assert.equal(partial.rendered, 'Iv 3,16');
  });

  it('validates a reference without reading text', async () => {
    const check = await validateReference(bible, 'Joel 1:1');
    assert.equal(check.status, 'ok');
    assert.equal(check.book, 'JOL');
  });

  it('keeps chapter numbers when the file skips chapters', () => {
    const psalms = source.books.find((b) => b.usfm === 'PSA')!;
    assert.deepEqual([...new Set(psalms.verses.map((v) => v.chapter))], [3, 4, 51]);
    assert.equal(psalms.chapterCount, 51);
    assert.equal(psalms.chapterVerseCounts.length, 51);
    assert.equal(psalms.chapterVerseCounts[0], 0);
  });
});

describe('prepare', () => {
  it('folds diacritics and punctuation for search', () => {
    assert.equal(searchKey('Đakon: »Ljubav je strpljiva«!'), 'djakon ljubav je strpljiva');
  });

  it('turns unmappable chapters into rows before map rows', () => {
    const rows = prepareDeclarations({
      translation: 'x-hr',
      books: { PSA: { unmappable: [13], map: [{ chapter: 3, offset: 1 }] } },
    })[0]!.rows;
    assert.deepEqual(rows[0], { srcChapter: 13, srcVerseFrom: null, srcVerseTo: null, dstChapter: 13, offset: 0, unmappable: true });
    assert.deepEqual(rows[1], { srcChapter: 3, srcVerseFrom: null, srcVerseTo: null, dstChapter: 3, offset: 1, unmappable: false });
  });
});

describe('import files', () => {
  it('reads gzip and plain uploads alike', () => {
    const text = fixture('sar-hr.versification.json');
    assert.equal(decodeUpload(gzipSync(text)), text);
    assert.equal(decodeUpload(Buffer.from(text)), text);
  });

  it('refuses a gzip that inflates past the limit', () => {
    const bomb = gzipSync(Buffer.alloc(MAX_FILE_BYTES + 1, 32));
    assert.ok(bomb.byteLength < 100_000);
    assert.throws(() => decodeUpload(bomb), BibleImportError);
  });

  it('refuses files that are not bible-api JSON', () => {
    assert.throws(() => parseTranslationFile('not json'), /not JSON/);
    assert.throws(() => parseTranslationFile('{"code":"x-hr","books":"no"}'), /not in the bible-api format/);
    assert.throws(() => parseDeclarationsFile('{"books":{}}'), /versification file is not in the bible-api format/);
  });

  it('fills catalog metadata and takes overrides', () => {
    assert.equal(resolveMeta('sar-hr', {}).languageCode, 'hr');
    assert.equal(resolveMeta('sar-hr', { name: 'Šarić' }).name, 'Šarić');
    assert.throws(() => resolveMeta('new-hr', {}), /^Error: 'new-hr' isn't one of the built-in Bibles: fill in Name\.$/);
    // Outside the catalog, the language and role come from the code; only the name must be given.
    assert.deepEqual(resolveMeta('clp-cs', { name: 'Český liturgický překlad' }), {
      code: 'clp-cs',
      name: 'Český liturgický překlad',
      languageCode: 'cs',
      languageName: 'Čeština',
      role: 'target',
    });
    assert.equal(resolveMeta('clp-cs', { name: 'X', languageCode: 'sk' }).languageName, 'Slovenčina');
    assert.throws(() => resolveMeta('custom', {}), /fill in Name, Language code and Language name\./);
    assert.throws(() => resolveMeta('sar-hr', { languageCode: 'not a code' }), /^Error: Check Language code\.$/);
    const custom = resolveMeta('new-hr', { name: 'New', languageCode: 'HR', languageName: 'Hrvatski', role: 'target' });
    assert.equal(custom.languageCode, 'hr');
  });
});

describe('a Bible that lacks a book', () => {
  it('says the book is missing from that Bible, not that the reference is wrong', async () => {
    const file = parseTranslationFile(fixture('sar-hr.json'));
    const declarations = parseDeclarationsFile(fixture('sar-hr.versification.json'));
    const withoutJoel = prepareTranslation(
      { ...file, books: file.books.filter((b) => b.usfm !== 'JOL') },
      resolveMeta('sar-hr', {}),
      { ...declarations, books: Object.fromEntries(Object.entries(declarations.books).filter(([usfm]) => usfm !== 'JOL')) },
    );
    const partial = memoryBible([source, withoutJoel]);
    const r = await resolvePassage(partial, 'Joel 2:28', partial.findTranslation('hr')!, DEFAULT_INCLUDE);
    assert.equal(r.status, 'book_not_in_translation');
    assert.equal(r.text, undefined);
    assert.equal((await resolvePassage(partial, 'John 3:16', partial.findTranslation('hr')!, DEFAULT_INCLUDE)).status, 'ok');
  });
});

describe('a Bible whose book names are in Cyrillic', () => {
  const book = (usfm: string, name: string, abbreviation: string, testament: 'old' | 'new') => ({
    usfm,
    name,
    shortName: name,
    abbreviation,
    slug: usfm.toLowerCase(),
    testament,
    chapters: [{ number: 1, verses: [{ number: 1, text: 'Текст першого вірша.' }] }],
  });
  const ukrainian = prepareTranslation(
    parseTranslationFile(
      JSON.stringify({
        code: 'khm-uk',
        books: [
          book('1SA', 'Перша книга Самуїла', '1 Сам', 'old'),
          book('JHN', 'Євангелія від Івана', 'Ів', 'new'),
          book('1CO', 'Перше послання до Корінтян', '1 Кор', 'new'),
          book('2CO', 'Друге послання до Корінтян', '2 Кор', 'new'),
        ],
      }),
    ),
    resolveMeta('khm-uk', { name: 'Святе Письмо (Хоменко)' }),
  );
  const withUkrainian = memoryBible([source, target, ukrainian]);
  const uk = withUkrainian.findTranslation('uk')!;

  it('resolves each book by its own name', () => {
    assert.equal(withUkrainian.resolveBook('Ів', uk), 'JHN');
    assert.equal(withUkrainian.resolveBook('Ів.', uk), 'JHN');
    assert.equal(withUkrainian.resolveBook('Євангелія від Івана', uk), 'JHN');
  });

  it('tells the numbered books apart', () => {
    // All three were the key "1" or "2", so "1 Кор" resolved to 1 Samuel.
    assert.equal(withUkrainian.resolveBook('1 Сам', uk), '1SA');
    assert.equal(withUkrainian.resolveBook('1 Кор', uk), '1CO');
    assert.equal(withUkrainian.resolveBook('2 Кор.', uk), '2CO');
  });

  it('does not take a bare number or an unknown name for a book', () => {
    assert.equal(withUkrainian.resolveBook('1', uk), null);
    assert.equal(withUkrainian.resolveBook('Кор', uk), null);
  });

  it('still reads English and Croatian names', () => {
    assert.equal(withUkrainian.resolveBook('John', uk), 'JHN');
    assert.equal(withUkrainian.resolveBook('Iv', hr), 'JHN');
  });
});
