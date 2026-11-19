/**
 * Bibles in the database: an import that lands, a re-import that replaces it in
 * one transaction, the admin's versification and default changes, and an AI
 * translation filled from the imported Bible. Uses the committed excerpt of
 * RSV-CE and Šarić, and removes what it imports.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/db';
import { prepareScripture } from '@/domain/scripture/scripture.service';
import { importDeclarations, importTranslation, parseDeclarationsFile, parseTranslationFile, resolveMeta } from './bible.import';
import { prepareTranslation } from './bible.prepare';
import {
  addMapping,
  BibleImportError,
  deleteMapping,
  deleteTranslation,
  listMappings,
  setBookDeclaration,
  setLanguageDefault,
  writeTranslation,
} from './bible.repository';
import {
  bibleForLanguage,
  getChapter,
  identifyPassage,
  invalidateBibleIndex,
  resolvePassages,
  searchBible,
} from './bible.service';

const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8');
const CODES = ['rsvce-en', 'sar-hr', 'test-hr'];

async function clear() {
  await prisma.bibleTranslation.deleteMany({ where: { code: { in: CODES } } });
  invalidateBibleIndex();
}

async function importFixtures() {
  await importTranslation({ translationText: fixture('rsvce-en.json'), userId: null });
  await importTranslation({
    translationText: fixture('sar-hr.json'),
    declarationsText: fixture('sar-hr.versification.json'),
    userId: null,
  });
}

/** The fixture's Šarić with John 3:16 reworded, to tell one import from the next. */
function rewordedSaric() {
  const file = JSON.parse(fixture('sar-hr.json')) as {
    books: { usfm: string; chapters: { number: number; verses: { number: number; text: string }[] }[] }[];
  };
  const verse = file.books.find((b) => b.usfm === 'JHN')!.chapters.find((c) => c.number === 3)!.verses.find((v) => v.number === 16)!;
  verse.text = 'Novi tekst ovog retka.';
  return JSON.stringify(file);
}

const resolve = async (ref: string, translation = 'hr') => {
  invalidateBibleIndex();
  return (await resolvePassages([ref], translation, { text: true, rendered: true })).results[0];
};

before(clear);
after(async () => {
  await clear();
  await prisma.$disconnect();
});

describe('importing a Bible', () => {
  before(async () => {
    await clear();
    await importFixtures();
  });

  it('makes the first Croatian Bible the language default, with its versification', async () => {
    const saric = await prisma.bibleTranslation.findUniqueOrThrow({
      where: { code: 'sar-hr' },
      include: { versification: true },
    });
    assert.equal(saric.isLanguageDefault, true);
    assert.equal(saric.role, 'TARGET');
    assert.deepEqual(saric.versification.map((b) => b.usfm).sort(), ['JHN', 'JOL', 'MAL', 'PSA']);

    const r = await resolve('John 3:16');
    assert.equal(r.status, 'ok');
    assert.equal(r.rendered, 'Iv 3,16');
    assert.match(r.text!, /^Jer je Bog tako ljubio svijet/);
  });

  it('re-imports the text in place, keeping the declarations and the default', async () => {
    await setBookDeclaration('sar-hr', 'JHN', true, true, 'checked');
    const result = await importTranslation({ translationText: rewordedSaric(), userId: null });
    assert.equal(result.replaced, true);

    const saric = await prisma.bibleTranslation.findUniqueOrThrow({
      where: { code: 'sar-hr' },
      include: { versification: true },
    });
    assert.equal(saric.isLanguageDefault, true);
    const john = saric.versification.find((b) => b.usfm === 'JHN')!;
    assert.equal(john.reviewed, true);
    assert.equal(john.note, 'checked');
    assert.equal(saric.versification.length, 4);
    assert.equal((await resolve('John 3:16')).text, 'Novi tekst ovog retka.');
    assert.equal(await prisma.bibleTranslation.count({ where: { code: 'sar-hr' } }), 1);
  });

  it('leaves the Bible as it was when a re-import fails half way', async () => {
    const prepared = prepareTranslation(
      parseTranslationFile(fixture('sar-hr.json')),
      resolveMeta('sar-hr', {}),
      parseDeclarationsFile(fixture('sar-hr.versification.json')),
    );
    const john = prepared.books.find((b) => b.usfm === 'JHN')!;
    john.verses.push({ ...john.verses[0] });

    await assert.rejects(writeTranslation(prepared, null));
    assert.equal((await resolve('John 3:16')).text, 'Novi tekst ovog retka.');
    const saric = await prisma.bibleTranslation.findUniqueOrThrow({ where: { code: 'sar-hr' } });
    assert.equal(saric.isLanguageDefault, true);
  });

  it('replaces only the declarations with a versification file alone', async () => {
    const result = await importDeclarations('sar-hr', fixture('sar-hr.versification.json'));
    assert.equal(result.declaredBooks, 4);
    const john = await prisma.bibleVersificationBook.findFirstOrThrow({ where: { usfm: 'JHN', translation: { code: 'sar-hr' } } });
    assert.equal(john.reviewed, false);
    assert.equal((await resolve('John 3:16')).text, 'Novi tekst ovog retka.');
    await assert.rejects(importDeclarations('rsvce-en', fixture('sar-hr.versification.json')), BibleImportError);
  });

  it('refuses a second source Bible', async () => {
    await assert.rejects(
      importTranslation({
        translationText: fixture('rsvce-en.json'),
        meta: { code: 'test-en', name: 'Test', languageCode: 'en', languageName: 'English', role: 'source' },
        userId: null,
      }),
      /already the source/,
    );
  });
});

describe('what an admin changes', () => {
  before(async () => {
    await clear();
    await importFixtures();
  });

  it('withholds a book until it is declared, and resolves it once it is', async () => {
    await setBookDeclaration('sar-hr', 'JHN', false);
    invalidateBibleIndex();
    assert.equal((await resolve('John 3:16')).status, 'versification_unmapped');
    await setBookDeclaration('sar-hr', 'JHN', true);
    assert.equal((await resolve('John 3:16')).status, 'ok');
  });

  it('resolves an unmapped chapter once a mapping row says where it lands, and refuses it again when the row goes', async () => {
    assert.equal((await resolve('Mal 4:5')).status, 'versification_unmapped');
    const row = await addMapping({
      code: 'sar-hr',
      usfm: 'MAL',
      srcChapter: 4,
      srcVerseFrom: 1,
      srcVerseTo: 6,
      dstChapter: 3,
      offset: 18,
      unmappable: false,
    });
    const mapped = await resolve('Mal 4:5');
    assert.equal(mapped.status, 'ok');
    assert.equal(mapped.rendered, 'Mal 3,23');
    assert.ok((await listMappings('sar-hr', 'MAL'))?.rows.some((m) => m.id === row.id));

    await deleteMapping('sar-hr', row.id);
    assert.equal((await resolve('Mal 4:5')).status, 'versification_unmapped');
    await assert.rejects(deleteMapping('sar-hr', row.id), /no longer exists/);
  });

  it('moves the language to another Bible, and back when that one is deleted', async () => {
    await importTranslation({
      translationText: fixture('sar-hr.json'),
      declarationsText: fixture('sar-hr.versification.json').replace('"sar-hr"', '"test-hr"'),
      meta: { code: 'test-hr', name: 'Test Šarić', languageCode: 'hr', languageName: 'Hrvatski', role: 'target' },
      userId: null,
    });
    invalidateBibleIndex();
    assert.equal((await bibleForLanguage('hr'))?.code, 'sar-hr', 'a second Bible does not take over');

    await setLanguageDefault('test-hr');
    invalidateBibleIndex();
    assert.equal((await bibleForLanguage('hr'))?.code, 'test-hr');
    assert.equal((await prisma.bibleTranslation.findUniqueOrThrow({ where: { code: 'sar-hr' } })).isLanguageDefault, false);

    await deleteTranslation('test-hr');
    await setLanguageDefault('sar-hr');
    invalidateBibleIndex();
    assert.equal((await bibleForLanguage('hr'))?.code, 'sar-hr');
    assert.equal(await prisma.bibleVerse.count({ where: { book: { translation: { code: 'test-hr' } } } }), 0);
  });

  it('reads a chapter and finds words, with or without diacritics', async () => {
    invalidateBibleIndex();
    const chapter = await getChapter('sar-hr', 'JHN', 3);
    assert.equal(chapter?.book.abbreviation, 'Iv');
    assert.match(chapter!.verses.find((v) => v.verse === 16)!.text, /^Jer je Bog tako ljubio svijet/);
    assert.deepEqual(chapter?.next, { book: 'JHN', chapter: 4 });
    const found = await searchBible('hr', 'ljubio svijet');
    const again = await searchBible('hr', 'LJUBIO SVIJET');
    assert.ok(found?.results.some((r) => r.id === 'JHN.3.16'));
    assert.deepEqual(again, found);
  });
});

describe('an AI translation into Croatian', () => {
  before(async () => {
    await clear();
    await importFixtures();
    invalidateBibleIndex();
  });

  it('takes the citation and the quotation from the imported Bible, not the model', async () => {
    const source = 'As Jesus said (John 3:16), we are loved.';
    const prepared = await prepareScripture(source, 'hr');
    assert.doesNotMatch(prepared.prompt, /John 3:16/, 'the model never sees the citation');
    const placeholder = prepared.content.match(/\{\{bible:\d+\}\}/)?.[0];
    assert.ok(placeholder, 'the citation is held back from the model');

    // What the model sends back: its own words around the placeholder it kept.
    const { content, notices } = prepared.restore(`Kako reče Isus (${placeholder}), ljubljeni smo.`);
    assert.equal(content, 'Kako reče Isus (Iv 3,16), ljubljeni smo.');
    assert.deepEqual(notices, []);
  });

  it('says so when the model drops a citation', async () => {
    const prepared = await prepareScripture('See John 3:16.', 'hr');
    const { notices } = prepared.restore('Vidi.');
    assert.ok(notices.some((n) => n.includes('The AI dropped')));
  });

  it('finds a reading with no verse_tag by its text, fills it and sets verse_tag', async () => {
    const day = [
      '---',
      'title: T',
      'verse_tag:',
      '---',
      '',
      '# A Reading from the Holy Gospel according to St. John',
      '',
      '*For God so loved the world that he gave his only Son, that whoever believes in him should not perish but have eternal life.',
      'For God sent the Son into the world, not to condemn the world, but that the world might be saved through him.*',
      '',
      '# Reflection',
      '',
    ].join('\n');
    const prepared = await prepareScripture(day, 'hr');
    assert.match(prepared.content, /# A Reading from the Holy Gospel according to St\. John\n\n\{\{bible:1\}\}\n/);
    const { content, notices } = prepared.restore(prepared.content);
    assert.match(content, /verse_tag: Iv 3,16-17\n/);
    assert.match(content, /\*Jer je Bog tako ljubio svijet/);
    assert.equal(notices.length, 1);
    assert.match(notices[0], /by its text the reading is John 3:16-17/);
  });

  it('finds a passage by its first and last sentence, and nothing for text the Bible does not have', async () => {
    assert.equal(await identifyPassage('For God so loved the world that he gave his only Son.'), 'John 3:16');
    assert.equal(
      await identifyPassage('And as Moses lifted up the serpent in the wilderness. He who believes in him is not condemned.'),
      'John 3:14-18',
    );
    assert.equal(await identifyPassage('Let all our people fix their minds not on death but rather on immortality.'), null);
    assert.equal(await identifyPassage('Amen.'), null);
  });

  it('leaves the Scripture to the model, with a warning, for a language with no Bible', async () => {
    const prepared = await prepareScripture('See John 3:16.', 'xx');
    assert.equal(prepared.content, 'See John 3:16.');
    assert.ok(prepared.restore('Vidi Iv 3,16.').notices.some((n) => n.includes('No Bible is imported')));
  });
});
