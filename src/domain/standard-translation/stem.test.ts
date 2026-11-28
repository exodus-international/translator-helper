import assert from 'node:assert/strict';
import test from 'node:test';
import { findTermOccurrences } from './stem';

const found = (text: string, term: string) =>
  findTermOccurrences(text, term).map(({ from, to }) => text.slice(from, to));

test('finds a one-word term in each of its grammatical forms', () => {
  assert.deepEqual(found('Moli Očenaš, Očenaša se sjeti, k Očenašu se vrati.', 'Očenaš'), [
    'Očenaš',
    'Očenaša',
    'Očenašu',
  ]);
});

test('finds a term of several words with their endings changed', () => {
  assert.deepEqual(found('Započni znakom križa i moli Liturgiju časova.', 'znak križa'), ['znakom križa']);
  assert.deepEqual(found('Započni znakom križa i moli Liturgiju časova.', 'Liturgija časova'), [
    'Liturgiju časova',
  ]);
});

test('ignores case and the formatting around the words', () => {
  assert.deepEqual(found('*Liturgiju* **časova** svaki dan', 'liturgija časova'), ['Liturgiju* **časova']);
});

test('keeps at least four letters of a short word', () => {
  assert.deepEqual(found('znamen znakom', 'znak'), ['znakom']);
});

test('needs the words in order, next to each other and on one line', () => {
  assert.deepEqual(found('križa znakom', 'znak križa'), []);
  assert.deepEqual(found('znakom svetoga križa', 'znak križa'), []);
  assert.deepEqual(found('znakom\nkriža', 'znak križa'), []);
});

test('does not find a word whose stem differs', () => {
  assert.deepEqual(found('Litanija časova', 'Liturgija časova'), []);
  assert.deepEqual(found('Oče naš', 'Očenaš'), []);
});

test('takes a longer word with the same stem for the term, erring towards finding it', () => {
  // A prefix is not a stemmer: the cost is a missed "may not have used the
  // term" warning, never a wrong edit.
  assert.deepEqual(found('Liturgijski časopis', 'Liturgija časova'), ['Liturgijski časopis']);
});

test('finds nothing for a term without words', () => {
  assert.deepEqual(found('Amen.', '—'), []);
});

test('reports raw offsets, for the editor to underline', () => {
  const text = 'Moli Očenaša.';
  assert.deepEqual(findTermOccurrences(text, 'Očenaš'), [{ from: 5, to: 12 }]);
});

test('reads a long text in linear time', () => {
  const text = 'znakom '.repeat(20_000);
  const started = performance.now();
  findTermOccurrences(text, 'znak znak znak znak znak križa');
  assert.ok(performance.now() - started < 500);
});
