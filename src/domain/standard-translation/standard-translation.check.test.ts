import assert from 'node:assert/strict';
import test from 'node:test';
import { GLORY_BE_HR, SIGN_OF_THE_CROSS_HR } from './fixtures/croatian';
import { sourceKeyOf } from './match-form';
import { buildStandardCheck } from './standard-translation.check';
import type { StandardTranslationMatch } from './standard-translation.repository';

let ids = 0;
function entry(
  sourceText: string,
  targetText: string,
  { project = null as string | null, fixedForm = false } = {},
): StandardTranslationMatch {
  return {
    id: `entry-${++ids}`,
    name: null,
    sourceText,
    sourceKey: sourceKeyOf(sourceText),
    targetText,
    fixedForm,
    sourceProjectId: project,
  };
}

const check = (source: string, translation: string, entries: StandardTranslationMatch[]) =>
  buildStandardCheck({ source, translation, entries });

/** The translation's text an item points at. */
const at = (translation: string, range: { from: number; to: number } | null) =>
  range && translation.slice(range.from, range.to);

const SIGN_OF_THE_CROSS_EN = 'In the name of the Father, and of the Son, and of the Holy Spirit. Amen.';
const GLORY_BE_EN =
  'Glory be to the Father, and to the Son, and to the Holy Spirit,\nas it was in the beginning, is now, and ever shall be, world without end. Amen.';

// The mockup's document (design 4): the Glory Be on lines 7–8, in a blockquote,
// each line in italics, the second with a pause marker.
const MORNING_EN = [
  '## Morning prayer',
  '',
  `*${SIGN_OF_THE_CROSS_EN}*`,
  '',
  'Begin with the Sign of the Cross.',
  '',
  '> *Glory be to the Father, and to the Son, and to the Holy Spirit,*',
  '> *as it was in the beginning, is now, and ever shall be, world without end. Amen.* <!-- pause-duration="10s" -->',
].join('\n');
const MORNING_HR = [
  '## Jutarnja molitva',
  '',
  `*${SIGN_OF_THE_CROSS_HR}*`,
  '',
  'Započni znakom križa.',
  '',
  '> *Slava Ocu i Sinu i Duhu Svetomu.*',
  '> *Kako je bilo na početku, tako i sada i vazda i u vijeke vjekova. Amen.* <!-- pause-duration="10s" -->',
].join('\n');

const gloryBe = () => entry(GLORY_BE_EN, GLORY_BE_HR);

// ─── Used ─────────────────────────────────────────────────

test('a verbatim entry the translation writes in another layout is used, its wording the range', () => {
  const source = `Begin.\n\n*${SIGN_OF_THE_CROSS_EN}*`;
  const translation = `Započni.\n\n> **„u ime Oca i Sina i Duha Svetoga. Amen.”**`;

  const [item] = check(source, translation, [entry(SIGN_OF_THE_CROSS_EN, SIGN_OF_THE_CROSS_HR)]);

  assert.equal(item.kind, 'verbatim');
  assert.equal(item.state, 'used');
  assert.equal(at(translation, item.range), 'u ime Oca i Sina i Duha Svetoga. Amen.');
  assert.deepEqual(item.source, { from: 9, to: 9 + SIGN_OF_THE_CROSS_EN.length, firstLine: 3, lastLine: 3 });
  assert.deepEqual([item.diff, item.changedWords, item.edit], [null, 0, null]);
});

test('a term the translation writes in another grammatical form is used', () => {
  const translation = 'Započni znakom križa.';

  const [item] = check('Begin with the Sign of the Cross.', translation, [entry('Sign of the Cross', 'znak križa')]);

  assert.equal(item.kind, 'term');
  assert.equal(item.state, 'used');
  assert.equal(at(translation, item.range), 'znakom križa');
});

// ─── Changed ──────────────────────────────────────────────

test('lines like the standard text are changed, with a word diff and how many words differ', () => {
  const items = check(MORNING_EN, MORNING_HR, [entry(SIGN_OF_THE_CROSS_EN, SIGN_OF_THE_CROSS_HR), gloryBe()]);

  const glory = items[1];
  assert.equal(glory.state, 'changed');
  assert.deepEqual([glory.source.firstLine, glory.source.lastLine], [7, 8]);
  assert.equal(
    at(MORNING_HR, glory.range),
    'Slava Ocu i Sinu i Duhu Svetomu.*\n> *Kako je bilo na početku, tako i sada i vazda i u vijeke vjekova. Amen.',
  );
  assert.deepEqual(glory.diff, [
    { type: 'equal', text: 'Slava Ocu i Sinu i Duhu Svetomu. Kako' },
    { type: 'delete', text: 'je bilo' },
    { type: 'insert', text: 'bijaše' },
    { type: 'equal', text: 'na početku, tako i sada i vazda i u vijeke vjekova. Amen.' },
  ]);
  // A word replaced counts once: "je bilo" for "bijaše" is two.
  assert.equal(glory.changedWords, 2);
});

test('the edit of a changed entry writes the standard text in, keeping each line’s layout', () => {
  const [, glory] = check(MORNING_EN, MORNING_HR, [entry(SIGN_OF_THE_CROSS_EN, SIGN_OF_THE_CROSS_HR), gloryBe()]);
  const { from, to, insert, expected } = glory.edit!;

  assert.equal(expected, MORNING_HR.split('\n').slice(6).join('\n'));
  assert.equal(
    insert,
    [
      '> *Slava Ocu i Sinu i Duhu Svetomu.*',
      '> *Kako bijaše na početku, tako i sada i vazda i u vijeke vjekova. Amen.* <!-- pause-duration="10s" -->',
    ].join('\n'),
  );
  const fixed = MORNING_HR.slice(0, from) + insert + MORNING_HR.slice(to);
  assert.equal(check(MORNING_EN, fixed, [gloryBe()])[0].state, 'used');
});

test('an entry edited after the translation used it is changed', () => {
  const source = `*${SIGN_OF_THE_CROSS_EN}*`;
  const translation = `*${SIGN_OF_THE_CROSS_HR}*`;
  const before = entry(SIGN_OF_THE_CROSS_EN, SIGN_OF_THE_CROSS_HR);
  const edited = { ...before, targetText: 'U ime Oca, Sina i Duha Svetoga. Amen.' };

  assert.equal(check(source, translation, [before])[0].state, 'used');
  const [item] = check(source, translation, [edited]);
  assert.equal(item.state, 'changed');
  assert.equal(item.changedWords, 2);
  assert.equal(item.edit?.insert, '*U ime Oca, Sina i Duha Svetoga. Amen.*');
});

test('a changed entry inside a sentence has no edit', () => {
  const source = 'Pray: "Jesus, I trust in you."';
  const translation = 'Moli: „Isuse, ja se uzdam u tebe.”';

  const [item] = check(source, translation, [entry('Jesus, I trust in you.', 'Isuse, uzdam se u tebe.')]);

  assert.equal(item.state, 'changed');
  assert.equal(item.edit, null);
});

test('a term is never changed: a line without it is missing, however like it', () => {
  // Its words, but not together: no form of the term, and similar enough for a verbatim entry to be changed.
  const [item] = check('Begin with the Sign of the Cross.', 'Znak i križa.', [
    entry('Sign of the Cross', 'znak križa'),
  ]);

  assert.equal(item.state, 'missing');
});

// ─── Missing ──────────────────────────────────────────────

test('lines with other text are missing', () => {
  const [item] = check(MORNING_EN, MORNING_HR.replace('Slava Ocu', 'Hvala Bogu').replace(/Kako.*Amen\./, 'Amen.'), [
    gloryBe(),
  ]);

  assert.equal(item.state, 'missing');
  assert.deepEqual([item.range, item.diff, item.changedWords, item.edit], [null, null, 0, null]);
});

test('the standard wording inside a longer word is not the entry', () => {
  const [item] = check('Amen.', 'Amenovanje.', [entry('Amen.', 'Amen')]);

  assert.equal(item.state, 'missing');
});

test('a translation shorter than the source is checked on what is left of the lines', () => {
  const source = 'Glory be to the Father,\nand to the Son.\n\nAmen.';
  const entries = [entry('Glory be to the Father,\nand to the Son.', 'Slava Ocu\ni Sinu.'), entry('Amen.', 'Amen.')];

  const [joined, amen] = check(source, 'Slava Ocu i Sinu.', entries);

  assert.equal(joined.state, 'used');
  assert.equal(amen.state, 'missing');
});

// ─── Occurrences ──────────────────────────────────────────

test('each occurrence is an item of its own, in source order, matched to its own place', () => {
  const source = 'Say "Hail Mary" and "Hail Mary".\n\nAmen.\n\nPray.\n\nAmen.';
  const translation = 'Reci „Zdravo Marijo” i „Zdravo Marijo”.\n\nAmen.\n\nMoli.\n\nMoli opet.';

  const items = check(source, translation, [entry('Amen.', 'Amen.'), entry('Hail Mary', 'Zdravo Marijo')]);

  assert.deepEqual(
    items.map((item) => [item.source.firstLine, item.state, item.range?.from ?? null]),
    [
      [1, 'used', 6],
      [1, 'used', 24],
      [3, 'used', 41],
      [7, 'missing', null],
    ],
  );
});

test('the frontmatter of neither text is looked at, and line numbers count it', () => {
  const source = '---\ntitle: Glory Be\n---\nGlory Be';
  const translation = '---\ntitle: Slava\n---\nHvala';

  const items = check(source, translation, [entry('Glory Be', 'Slava')]);

  assert.equal(items.length, 1);
  assert.deepEqual([items[0].source.firstLine, items[0].state], [4, 'missing']);
  // The source's line 2 is in the translation's frontmatter.
  assert.equal(check('Intro.\nGlory Be', translation, [entry('Glory Be', 'Slava')])[0].state, 'missing');
});

test('a project’s entry is checked over the general one with the same source', () => {
  const general = entry('Glory Be', 'Slava');
  const own = entry('Glory Be', 'Slava Ocu', { project: 'exodus-90' });

  const items = check('Glory Be', 'Slava Ocu', [general, own]);

  assert.deepEqual(items.map((item) => [item.entry.id, item.state]), [[own.id, 'used']]);
});

// ─── Performance ──────────────────────────────────────────

// The editor checks documents of up to 300,000 characters against dictionaries
// of 2,000 entries. Re-reading the lines, re-searching them or comparing their
// words for every occurrence would be quadratic on a long line full of
// occurrences; the budgets are far above the linear work and far below that.
const words = Array.from({ length: 300 }, (_, i) => `word${i}`);
const dictionary = Array.from({ length: 2_000 }, (_, i) => {
  const text = Array.from({ length: 4 + (i % 8) }, (_, k) => words[(i * 3 + k * 7) % 300]).join(' ');
  return entry(`${text}.`, `${text.toUpperCase()}.`);
});
/** Each entry as a line of its own; the translation has every third one changed and every fifth one dropped. */
const lines = Array.from({ length: 6_000 }, (_, i) => dictionary[i % 2_000].sourceText);
const LARGE: Array<[string, string, string, StandardTranslationMatch[], number]> = [
  [
    '2,000 entries on lines of their own',
    lines.join('\n\n'),
    lines
      .map((line, i) =>
        i % 5 === 0 ? 'Molite.' : i % 3 === 0 ? line.toUpperCase().replace(/ \S+/, ' OTHER') : line.toUpperCase(),
      )
      .join('\n\n'),
    dictionary,
    3_000,
  ],
  [
    'one long line full of terms',
    'say Amen and '.repeat(23_000),
    'reci Amen i '.repeat(25_000),
    [entry('Amen', 'Amen')],
    1_000,
  ],
  [
    // Each term entry once read the whole line again: about 8 s.
    'one long line using 2,000 different terms',
    Array.from({ length: 6_000 }, (_, i) => `with word${i % 2_000} more${i % 2_000} and`).join(' '),
    Array.from({ length: 20_000 }, (_, i) => `s nečim ${i} i`).join(' '),
    Array.from({ length: 2_000 }, (_, i) => entry(`word${i} more${i}`, `cilj${i} riječ${i}`)),
    1_000,
  ],
  [
    'one long line full of fixed forms the translation lacks',
    'say Amen and '.repeat(23_000),
    'reci nešto i '.repeat(23_000),
    [entry('Amen', 'Amen', { fixedForm: true })],
    1_000,
  ],
];

for (const [name, source, translation, entries, budget] of LARGE) {
  test(`checks ${name} in time`, () => {
    const started = performance.now();
    const items = check(source, translation, entries);
    const took = performance.now() - started;

    assert.ok(items.length > 1_000, `${items.length} items`);
    assert.ok(took < budget, `took ${Math.round(took)} ms`);
  });
}
