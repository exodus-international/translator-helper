import assert from 'node:assert/strict';
import test, { describe, it } from 'node:test';
import { standardPrefill } from './standard-selection-prefill';

/**
 * What the add dialog starts from when source text is selected: the selection's
 * wording, the translation's same lines, and where those lines came from.
 */

const SOURCE = [
  '## Morning Prayer',
  '',
  'Begin with the sign of the cross and pray the Liturgy of the Hours.',
  '',
  '> *Glory be to the Father, and to the Son, and to the Holy Spirit,*',
  '> *as it was in the beginning, is now, and ever shall be, world without end. Amen.* <!-- pause-duration="10s" -->',
  '',
  'Close by reading Psalm 46:10 slowly.',
].join('\n');

const TRANSLATION = [
  '## Jutarnja molitva',
  '',
  'Započni znakom križa i moli Liturgiju časova.',
  '',
  '> *Slava Ocu i Sinu i Duhu Svetomu.*',
  '> *Kako bijaše na početku, tako i sada i vazda i u vijeke vjekova. Amen.* <!-- pause-duration="10s" -->',
  '',
  'Završi polaganim čitanjem Ps 46,11.',
].join('\n');

/** The offsets of `text` in SOURCE, as a selection of it. */
function select(text: string) {
  const from = SOURCE.indexOf(text);
  assert.notEqual(from, -1, `${text} is not in the source`);
  return { from, to: from + text.length };
}

describe('standardPrefill', () => {
  it('takes the wording of a selection inside the markers, and the same lines of the translation', () => {
    const prefill = standardPrefill({
      source: SOURCE,
      ...select(
        'Glory be to the Father, and to the Son, and to the Holy Spirit,*\n> *as it was in the beginning, is now, and ever shall be, world without end. Amen.',
      ),
      translation: TRANSLATION,
    });

    assert.deepEqual(prefill, {
      sourceText:
        'Glory be to the Father, and to the Son, and to the Holy Spirit,\nas it was in the beginning, is now, and ever shall be, world without end. Amen.',
      targetText:
        'Slava Ocu i Sinu i Duhu Svetomu.\nKako bijaše na početku, tako i sada i vazda i u vijeke vjekova. Amen.',
      removed: ['blockquote', 'emphasis', 'comment'],
      hint: 'Taken from lines 5–6 of the translation. Check it before saving.',
    });
  });

  it('keeps a phrase picked out of a line to itself, and names the one line it is on', () => {
    const prefill = standardPrefill({ source: SOURCE, ...select('Liturgy of the Hours'), translation: TRANSLATION });

    assert.equal(prefill.sourceText, 'Liturgy of the Hours');
    assert.equal(prefill.targetText, 'Započni znakom križa i moli Liturgiju časova.');
    assert.deepEqual(prefill.removed, []);
    assert.equal(prefill.hint, 'Taken from line 3 of the translation. Check it before saving.');
  });

  it('leaves out the line a drag over whole lines ends at the start of', () => {
    const prefill = standardPrefill({ source: SOURCE, ...select('## Morning Prayer\n'), translation: TRANSLATION });

    assert.equal(prefill.sourceText, 'Morning Prayer');
    assert.equal(prefill.targetText, 'Jutarnja molitva');
    assert.deepEqual(prefill.removed, ['heading']);
    assert.equal(prefill.hint, 'Taken from line 1 of the translation. Check it before saving.');
  });

  it('takes what there is of a translation that stops inside the selection, and names only those lines', () => {
    const prefill = standardPrefill({
      source: SOURCE,
      ...select('Glory be to the Father, and to the Son, and to the Holy Spirit,*\n> *as it was'),
      translation: TRANSLATION.split('\n').slice(0, 5).join('\n'),
    });

    assert.equal(prefill.targetText, 'Slava Ocu i Sinu i Duhu Svetomu.');
    assert.equal(prefill.hint, 'Taken from line 5 of the translation. Check it before saving.');
  });

  it('starts the translation empty, with no hint, when the translation has not reached the selection', () => {
    const prefill = standardPrefill({
      source: SOURCE,
      ...select('Close by reading'),
      translation: '## Jutarnja molitva',
    });

    assert.equal(prefill.sourceText, 'Close by reading');
    assert.equal(prefill.targetText, '');
    assert.equal(prefill.hint, null);
  });
});

// A repeated group around a run of `*` or `_` once backtracked exponentially
// on a fill-in blank: seconds at 28 underscores, doubling with each more.
test('a fill-in blank next to the selection is read in linear time', () => {
  const blank = '_'.repeat(50_000);
  const source = `Name: ${blank} Date:\n${blank}x Name:`;
  const started = performance.now();
  standardPrefill({ source, from: 0, to: 5, translation: 'Ime:' });
  const line2 = source.indexOf('Name:', 10);
  standardPrefill({ source, from: line2, to: line2 + 5, translation: 'Ime:\nIme:' });
  assert.ok(performance.now() - started < 500);
});

test('layout around the selection still widens it, and anything else does not', () => {
  const source = '> *Glory be.* <!-- pause -->\nSay: Glory be. Now.';
  const quoted = standardPrefill({ source, from: 3, to: 12, translation: '> *Slava.* <!-- pause -->' });
  assert.equal(quoted.sourceText, 'Glory be.');
  // Widened to the whole line, the selection's layout is what the dialog says it left out.
  assert.deepEqual(quoted.removed, ['blockquote', 'emphasis', 'comment']);
  const inline = standardPrefill({ source, from: 34, to: 43, translation: 'x\nReci: Slava. Sad.' });
  assert.equal(inline.sourceText, 'Glory be.');
  assert.deepEqual(inline.removed, []);
});
