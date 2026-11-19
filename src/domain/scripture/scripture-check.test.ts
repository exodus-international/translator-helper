import assert from 'node:assert/strict';
import test from 'node:test';
import type { PassageResult } from '@/domain/bible/bible.types';
import { citationKey, findCitations } from './citations';
import {
  buildCheckItems,
  fixAllNotationEdits,
  needsAttention,
  notationEdit,
  quoteEdit,
  sourceOnlyCitations,
} from './scripture-check';

const ok = (ref: string, rendered: string, verses: string[]): PassageResult => ({
  ref,
  status: 'ok',
  rendered,
  verses: verses.map((text, i) => ({ id: `X.1.${i + 1}`, chapter: 1, verse: i + 1, text })),
  text: verses.join(' '),
  notes: [],
});

const RESULTS = new Map<string, PassageResult>([
  ['John 3:16', ok('John 3:16', 'Iv 3,16', ['Bog je tako ljubio svijet.'])],
  ['Iv 3,16', ok('Iv 3,16', 'Iv 3,16', ['Bog je tako ljubio svijet.'])],
  ['Ps 51,3-5', ok('Ps 51,3-5', 'Ps 51,5-7', ['wrong verses'])],
  ['Matej 4,19', ok('Matej 4,19', 'Mt 4,19', ['Hajdete za mnom.'])],
  ['Ps 13,1', { ref: 'Ps 13,1', status: 'versification_unmapped', notes: ['PSA 13 has no mapping yet.'] }],
  ['At 5:30', { ref: 'At 5:30', status: 'unknown_book', notes: [] }],
]);

function check(text: string, sourceRendered?: Map<string, PassageResult>) {
  return buildCheckItems({ text, citations: findCitations(text), results: RESULTS, sourceRendered });
}

test('an English citation is offered its target notation', () => {
  const [item] = check('Tekst.\nKako kaže John 3:16.');
  assert.equal(item.notation, 'fixable');
  assert.equal(item.line, 2);
  assert.deepEqual(notationEdit(item), { from: 17, to: 26, insert: 'Iv 3,16', expected: 'John 3:16' });
});

test('a citation already written as the target writes it is official', () => {
  const [item] = check('Kako kaže Iv 3,16.');
  assert.equal(item.notation, 'official');
  assert.equal(notationEdit(item), null);
  assert.equal(needsAttention(item), false);
});

test('a target citation that renumbers is flagged, not fixed, and offers no text', () => {
  const [item] = check('Ps 51,3-5: „nešto“');
  assert.equal(item.notation, 'check-numbering');
  assert.equal(item.quote, null);
  assert.deepEqual(fixAllNotationEdits([item]), []);
  assert.ok(notationEdit(item));
});

test('a target citation whose numbers hold is a notation fix, even in Fix all', () => {
  const [item] = check('— Matej 4,19');
  assert.equal(item.notation, 'fixable');
  assert.deepEqual(fixAllNotationEdits([item]), [{ from: 2, to: 12, insert: 'Mt 4,19', expected: 'Matej 4,19' }]);
});

test('the source vouches for a target citation it renders the same way', () => {
  const source = new Map([[citationKey('Ps 51,3-5'), ok('Psalm 51:1-3', 'Ps 51,3-5', ['Smiluj mi se, Bože.'])]]);
  const [item] = check('Ps 51,3-5', source);
  assert.equal(item.notation, 'official');
  assert.equal(item.officialText, 'Smiluj mi se, Bože.');
});

test('what the Bible cannot supply is listed with its reason; what is not a reference is dropped', () => {
  const items = check('Usp. Ps 13,1. At 5:30 molimo.');
  assert.equal(items.length, 1);
  assert.equal(items[0].notation, 'unresolved');
  assert.equal(items[0].status, 'versification_unmapped');
  assert.deepEqual(items[0].notes, ['PSA 13 has no mapping yet.']);
});

test('a quotation is compared with the official text', () => {
  const text = 'Iv 3,16: „Bog je toliko ljubio svijet.“';
  const [item] = check(text);
  assert.ok(item.quote);
  assert.equal(item.quote.matches, false);
  assert.ok(item.quote.similarity > 0.7 && item.quote.similarity < 1);
  assert.deepEqual(
    item.quote.diff.filter((p) => p.type !== 'equal'),
    [
      { type: 'delete', text: 'toliko' },
      { type: 'insert', text: 'tako' },
    ],
  );
  const edit = quoteEdit(item)!;
  assert.equal(text.slice(0, edit.from) + edit.insert + text.slice(edit.to), 'Iv 3,16: „Bog je tako ljubio svijet.“');
  assert.equal(needsAttention(item), true);
});

test('a matching quotation needs nothing', () => {
  const [item] = check('„Bog je tako ljubio   svijet.“ (Iv 3,16)');
  assert.equal(item.quote?.matches, true);
  assert.equal(quoteEdit(item), null);
  assert.equal(needsAttention(item), false);
});

test('fix all touches English citations only', () => {
  const items = check('John 3:16 i Iv 3,16 i John 3:16');
  assert.deepEqual(
    fixAllNotationEdits(items).map((e) => [e.from, e.insert]),
    [
      [0, 'Iv 3,16'],
      [22, 'Iv 3,16'],
    ],
  );
});

test('the source passages the translation never cites', () => {
  const source = new Map<string, PassageResult>([
    ['John 3:16', ok('John 3:16', 'Iv 3,16', ['x'])],
    ['Psalm 46:10', ok('Psalm 46:10', 'Ps 46,11', ['y'])],
    ['Psalm 13:1', { ref: 'Psalm 13:1', status: 'versification_unmapped', notes: [] }],
  ]);
  assert.deepEqual(sourceOnlyCitations(source, check('Iv 3,16')), [{ ref: 'Psalm 46:10', rendered: 'Ps 46,11' }]);
});
