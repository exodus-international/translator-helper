import assert from 'node:assert/strict';
import test from 'node:test';
import { diffWords } from '@/domain/scripture/citations';
import { diffLines, wordingSpans } from './standard-lines';

const GLORY_BE = [
  '> *Slava Ocu i Sinu i Duhu Svetomu.*',
  '> *Kako je bilo na početku, tako i sada i vazda i u vijeke vjekova. Amen.* <!-- pause-duration="10s" -->',
].join('\n');
const GLORY_BE_HR =
  'Slava Ocu i Sinu i Duhu Svetomu.\nKako bijaše na početku, tako i sada i vazda i u vijeke vjekova. Amen.';

const DOC = `## Jutarnja molitva\n\n${GLORY_BE}\n`;
const FROM = DOC.indexOf('Slava');
const TO = DOC.indexOf('Amen.') + 'Amen.'.length;

test('a standard text across lines is marked on its wording only, line by line', () => {
  const spans = wordingSpans(DOC, FROM, TO);

  assert.deepEqual(
    spans.map((s) => DOC.slice(s.from, s.to)),
    ['Slava Ocu i Sinu i Duhu Svetomu.', 'Kako je bilo na početku, tako i sada i vazda i u vijeke vjekova. Amen.'],
  );
});

test('a standard text on one line is marked as found', () => {
  const doc = 'Započni *znakom križa* sada.';
  const from = doc.indexOf('znakom');
  const to = doc.indexOf('sada') - 1;

  assert.deepEqual(wordingSpans(doc, from, to), [{ from, to }]);
});

test('a diff against the standard breaks where the standard text breaks its lines', () => {
  const translation = 'Slava Ocu i Sinu i Duhu Svetomu. Kako je bilo na početku, tako i sada i vazda i u vijeke vjekova. Amen.';

  const lines = diffLines(diffWords(translation, GLORY_BE_HR), GLORY_BE_HR);

  assert.deepEqual(lines, [
    [{ type: 'equal', text: 'Slava Ocu i Sinu i Duhu Svetomu.' }],
    [
      { type: 'equal', text: 'Kako' },
      { type: 'delete', text: 'je bilo' },
      { type: 'insert', text: 'bijaše' },
      { type: 'equal', text: 'na početku, tako i sada i vazda i u vijeke vjekova. Amen.' },
    ],
  ]);
});
