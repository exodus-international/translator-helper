import assert from 'node:assert/strict';
import test from 'node:test';
import {
  citationKey,
  diffWords,
  findCitations,
  findQuotedText,
  formatInlineQuote,
  formatReading,
  readingLayout,
  plainText,
  untaggedReading,
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

test('books of one chapter are cited by verse alone', () => {
  assert.deepEqual(texts('Jd 5-13, Jude 5, 7 i Flm 4-7. 10'), ['Jd 5-13', 'Jude 5, 7', 'Flm 4-7. 10']);
  assert.deepEqual(texts('3 Iv 2, 2Jn 5 and Ob 1.'), ['3 Iv 2', '2Jn 5', 'Ob 1']);
  // Every other book still needs a chapter and a verse.
  assert.deepEqual(texts('Iv 5 i Mt 5, Day 9'), []);
});

test('verse lists spaced after the full stop, up to the next citation or sentence', () => {
  assert.deepEqual(texts('Dn 13,1-9. 15-18'), ['Dn 13,1-9. 15-18']);
  assert.deepEqual(texts('Iv 3,16. 2 Kor 5,17'), ['Iv 3,16', '2 Kor 5,17']);
  assert.deepEqual(texts('Mt 5,3. 6,1'), ['Mt 5,3']);
  assert.deepEqual(texts('Rim 8,28. Znamo'), ['Rim 8,28']);
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
  assert.equal(formatReading(['A *b*.', 'C  d.'], readingLayout(['*x', 'y*'])), '*A \\*b\\*.\nC d.*');
  assert.equal(formatReading(['A.', 'B.'], readingLayout(['*x y*'])), '*A. B.*');
  assert.equal(formatReading(['A.', 'B.'], []), '*A. B.*');
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

test('untaggedReading is the one "A Reading" text of a day whose verse_tag is empty', () => {
  const body = '# A Reading from the Letter of St. Paul to the Romans\n \n*Who shall separate us? No, in **all** these things.*\n\n# Reflection\n\nText.\n';
  assert.deepEqual(untaggedReading(`---\ntitle: T\nverse_tag:\nday: 29\n---\n\n${body}`), {
    heading: 'A Reading from the Letter of St. Paul to the Romans',
    text: 'Who shall separate us? No, in all these things.',
  });
  assert.ok(untaggedReading(`---\nverse_tag: ""\n---\n${body}`));
  assert.ok(untaggedReading(body));
  assert.equal(untaggedReading(`---\nverse_tag: Romans 8:35-39\n---\n${body}`), null);
  assert.equal(untaggedReading(`${body}\n# A Reading from Exodus\n\n*More*\n`), null);
  assert.equal(untaggedReading('# A Reading from Romans\n\nNot italic.\n'), null);
});

test('a reading keeps the paragraphs of the document', () => {
  const layout = readingLayout(['*One two three four. Five six.*', '', '*Seven eight nine ten.*']);
  const english = ['One two three four.', 'Five six.', 'Seven eight nine ten.'];
  assert.equal(formatReading(['Jedna.', 'Dva.', 'Tři.'], layout, english), '*Jedna. Dva.*\n\n*Tři.*');
});

test('a reading keeps the stanzas and <br> line breaks of the document', () => {
  const layout = readingLayout([
    '*Praise the Lord! <br>',
    'For it is good to sing. <br>',
    'The Lord builds up Jerusalem.*',
    '',
    '*He heals the brokenhearted, <br>',
    'he gives them names.*',
  ]);
  const english = ['Praise the Lord! For it is good to sing.', 'The Lord builds up Jerusalem.', 'He heals the brokenhearted,', 'he gives them names.'];
  assert.equal(
    formatReading(['A.', 'B.', 'C.', 'D.'], layout, english),
    '*A. <br>\nB.*\n\n*C. <br>\nD.*',
  );
});

test('a paragraph break inside a verse moves to the nearest verse boundary', () => {
  const layout = readingLayout(['*One two three four five.*', '', '*Six. Seven eight nine ten.*']);
  assert.equal(formatReading(['A.', 'B.'], layout, ['One two three four five six.', 'Seven eight nine ten.']), '*A.*\n\n*B.*');
});

test('a reading whose Bibles count the verses differently still fills every paragraph once', () => {
  const layout = readingLayout(['*One two.*', '', '*Three four.*']);
  assert.equal(formatReading(['A.', 'B.', 'C.', 'D.'], layout, ['One two.', 'Three four.']), '*A. B.*\n\n*C. D.*');
  assert.equal(formatReading(['A.'], layout, ['One two.', 'Three four.']), '*A.*');
});
