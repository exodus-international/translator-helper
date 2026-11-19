import assert from 'node:assert/strict';
import test from 'node:test';
import {
  citationKey,
  diffWords,
  findCitations,
  findQuotedText,
  formatInlineQuote,
  formatReading,
  plainText,
  type Citation,
} from './citations';

const texts = (text: string) => findCitations(text).map((c) => c.text);

test('English citations, with ranges, lists and continuations', () => {
  assert.deepEqual(texts('As John 3:16 says, and 1 Cor 13:4-7 too.'), ['John 3:16', '1 Cor 13:4-7']);
  assert.deepEqual(texts('Read Matthew 6:1-6, 16-18 and Rom 8:28; 12:1-2.'), ['Matthew 6:1-6, 16-18', 'Rom 8:28; 12:1-2']);
  assert.deepEqual(texts('Song of Songs 2:10 and John 3:16-4:2'), ['Song of Songs 2:10', 'John 3:16-4:2']);
  assert.deepEqual(texts('I John 4:8 and Ps. 23:1'), ['I John 4:8', 'Ps. 23:1']);
  assert.deepEqual(texts('verse 18a: Luke 1:18a'), ['Luke 1:18a']);
});

test('a continuation that starts the next book is left to it', () => {
  assert.deepEqual(texts('Rom 8:28; 2 Peter 1:3'), ['Rom 8:28', '2 Peter 1:3']);
});

test('continental citations, diacritics and verse lists', () => {
  assert.deepEqual(texts('Usp. Iv 3,16 i Ps 51,3-5.'), ['Iv 3,16', 'Ps 51,3-5']);
  assert.deepEqual(texts('Mt 5,3-12; 6,1 i 1 Kor 13,4-7.13'), ['Mt 5,3-12; 6,1', '1 Kor 13,4-7.13']);
  assert.deepEqual(texts('Žid 4,12 a Jób 1,21'), ['Žid 4,12', 'Jób 1,21']);
  assert.deepEqual(texts('1Kor 13,4 i 2. Kor 5,17'), ['1Kor 13,4', '2. Kor 5,17']);
});

test('the notation says which numbering a citation is likely in', () => {
  const [en, eu] = findCitations('John 3:16 = Iv 3,16');
  assert.equal(en.notation, 'english');
  assert.equal(eu.notation, 'target');
});

test('offsets point at the citation as written', () => {
  const text = 'See  Iv 3,16 now';
  const [c] = findCitations(text);
  assert.equal(text.slice(c.from, c.to), 'Iv 3,16');
});

test('what is not a citation', () => {
  assert.deepEqual(texts('Exodus 90 lasts 90 days. Day 9 begins.'), []);
  assert.deepEqual(texts('In 1990, 5 people came; at 5:30 we pray.'), []);
  // A book at the end of one line is not cited by a number on the next.
  assert.deepEqual(texts('John\n3:16'), []);
  assert.deepEqual(texts('mid-word xJohn 3:16'), []);
});

test('a sentence-ending full stop is not part of the citation', () => {
  assert.deepEqual(texts('Kao što piše Iv 3,16. Zatim'), ['Iv 3,16']);
});

test('citation keys ignore spacing, case and dashes', () => {
  assert.equal(citationKey('Iv 3, 16–18'), citationKey('iv 3,16-18'));
  assert.notEqual(citationKey('Iv 3,16'), citationKey('Iv 3,17'));
});

const at = (text: string, written: string): Citation => {
  const from = text.indexOf(written);
  return { text: written, raw: written, from, to: from + written.length, notation: written.includes(':') ? 'english' : 'target' };
};

test('the reading under a citation line', () => {
  const text = [
    '<span style="display:block;color:#CC0000;">Jak 5,11-13</span>',
    '',
    '*Evo, blaženima zovemo postojane.*',
    '*Trpi li tko među vama?*',
    '',
    '# Razmatranje',
  ].join('\n');
  const quote = findQuotedText(text, at(text, 'Jak 5,11-13'));
  assert.ok(quote);
  assert.equal(quote.kind, 'reading');
  assert.equal(quote.linePerVerse, true);
  assert.equal(text.slice(quote.from, quote.to), '*Evo, blaženima zovemo postojane.*\n*Trpi li tko među vama?*');
  assert.equal(quote.plain, 'Evo, blaženima zovemo postojane. Trpi li tko među vama?');
});

test('a citation line with no italic reading under it quotes nothing', () => {
  const text = 'Jak 5,11\n\nObičan odlomak.';
  assert.equal(findQuotedText(text, at(text, 'Jak 5,11')), null);
});

test('a quotation before the citation', () => {
  const text = 'Braćo. „Prestanite i spoznajte da sam ja Bog.“ — Ps 46,11';
  const quote = findQuotedText(text, at(text, 'Ps 46,11'));
  assert.equal(quote?.kind, 'quote');
  assert.equal(quote?.raw, 'Prestanite i spoznajte da sam ja Bog.');
});

test('a quotation in straight quotes, with the citation in parentheses', () => {
  const text = 'He said "Be still, and know that I am God." (Psalm 46:10) and left.';
  assert.equal(findQuotedText(text, at(text, 'Psalm 46:10'))?.raw, 'Be still, and know that I am God.');
});

test('a quotation after the citation', () => {
  const text = 'Iv 3,16: »Bog je tako ljubio svijet« kaže Ivan.';
  assert.equal(findQuotedText(text, at(text, 'Iv 3,16'))?.raw, 'Bog je tako ljubio svijet');
});

test('a quotation too far from the citation is not its text', () => {
  const text = '“Words” said someone long before we came to John 3:16 today.';
  assert.equal(findQuotedText(text, at(text, 'John 3:16')), null);
});

test('readings and quotations are written as Markdown', () => {
  assert.equal(formatReading(['A *b*.', 'C  d.'], true), '*A \\*b\\*.\nC d.*');
  assert.equal(formatReading(['A.', 'B.'], false), '*A. B.*');
  assert.equal(formatInlineQuote(['A_b', 'c.']), 'A\\_b c.');
  assert.equal(plainText('*A \\*b\\* <br> c*'), 'A *b* c');
});

test('a word diff marks what to drop and what to add', () => {
  assert.deepEqual(diffWords('Bog je tako ljubio svijet', 'Bog je tako ljubio svijet'), [
    { type: 'equal', text: 'Bog je tako ljubio svijet' },
  ]);
  assert.deepEqual(diffWords('Jer Bog je toliko ljubio svijet', 'Bog je tako ljubio svijet da'), [
    { type: 'delete', text: 'Jer' },
    { type: 'equal', text: 'Bog je' },
    { type: 'delete', text: 'toliko' },
    { type: 'insert', text: 'tako' },
    { type: 'equal', text: 'ljubio svijet' },
    { type: 'insert', text: 'da' },
  ]);
});

test('a word diff counts punctuation', () => {
  assert.deepEqual(diffWords('svijet.', 'svijet,'), [
    { type: 'delete', text: 'svijet.' },
    { type: 'insert', text: 'svijet,' },
  ]);
});

test('an empty side diffs to one insertion or deletion', () => {
  assert.deepEqual(diffWords('', 'a b'), [{ type: 'insert', text: 'a b' }]);
  assert.deepEqual(diffWords('a b', ''), [{ type: 'delete', text: 'a b' }]);
});
