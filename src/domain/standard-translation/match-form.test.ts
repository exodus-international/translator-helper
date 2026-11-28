import assert from 'node:assert/strict';
import test from 'node:test';
import { readLines, sourceKeyOf, stripLayout, toMatchForm, type LayoutPart, type LineLayout } from './match-form';

const keyOf = (raw: string) => toMatchForm(raw).key;

/** The raw text behind the first place `needle` occurs in the key, by the documented convention. */
function rawSpanOf(raw: string, needle: string): string {
  const { key, map } = toMatchForm(raw);
  const from = key.indexOf(needle);
  assert.notEqual(from, -1, `"${needle}" is not in "${key}"`);
  const to = from + needle.length;
  return raw.slice(map[from], map[to - 1] + 1);
}

// ─── What the key drops ───────────────────────────────────

const DROPPED: [element: string, raw: string, key: string][] = [
  ['italics', 'the *Holy* Spirit', 'the holy spirit'],
  ['bold', 'the **Holy** Spirit', 'the holy spirit'],
  ['underscore italics', 'the _Holy_ Spirit', 'the holy spirit'],
  ['underscore bold', 'the __Holy__ Spirit', 'the holy spirit'],
  ['emphasis inside a word', 'un*common* freedom', 'uncommon freedom'],
  ['a blockquote marker', '> Amen.', 'amen.'],
  ['nested blockquote markers', '> > Amen.', 'amen.'],
  ['a dash list marker', '- Amen.', 'amen.'],
  ['an asterisk list marker', '* Amen.', 'amen.'],
  ['a plus list marker', '+ Amen.', 'amen.'],
  ['a numbered list marker', '1. Amen.', 'amen.'],
  ['a parenthesis list marker', '12) Amen.', 'amen.'],
  ['heading markers', '## Glory Be', 'glory be'],
  ['indentation before a list marker', '  - Amen.', 'amen.'],
  ['a list marker inside a blockquote', '> 1. Amen.', 'amen.'],
  ['a comment and its content', 'Amen. <!-- pause-duration="10s" -->', 'amen.'],
  ['a comment between words', 'Glory<!-- x --> be', 'glory be'],
  ['a comment over several lines', 'Glory <!-- one\ntwo --> be', 'glory be'],
  ['a hard-break backslash', 'Glory be\\\nto the Father', 'glory be to the father'],
];

for (const [element, raw, key] of DROPPED) {
  test(`the key drops ${element}`, () => {
    assert.equal(keyOf(raw), key);
  });
}

test('an underscore inside a word is wording, not emphasis', () => {
  assert.equal(keyOf('snake_case and a_b_c'), 'snake_case and a_b_c');
});

test('an asterisk with spaces on both sides is wording, not emphasis', () => {
  assert.equal(keyOf('5 * 3'), '5 * 3');
});

test('a list or heading marker counts only at the start of a line, before a space', () => {
  assert.equal(keyOf('Glory - be #1'), 'glory - be #1');
  assert.equal(keyOf('#hashtag'), '#hashtag');
});

// ─── What the key unifies ─────────────────────────────────

test('every double quotation mark reads as a straight one', () => {
  assert.equal(keyOf('“a” „b‟ «c» "d" ″e″'), '"a" "b" "c" "d" "e"');
});

test('every single quotation mark and apostrophe reads as a straight one', () => {
  assert.equal(keyOf('‘a’ ‚b‛ \'c\' ′d′'), "'a' 'b' 'c' 'd'");
});

test('every dash reads as a hyphen', () => {
  assert.equal(keyOf('a‐b‑c‒d–e—f―g−h-i'), 'a-b-c-d-e-f-g-h-i');
});

test('whitespace of any kind, newlines included, collapses to one space and is trimmed', () => {
  assert.equal(keyOf('  Glory be\t\tto\n\nthe\r\nFather  '), 'glory be to the father');
});

test('zero-width and format characters read as whitespace', () => {
  assert.equal(keyOf('Glory​be‌to‍the⁠Father﻿'), 'glory be to the father');
});

test('the pause marker of the fixture, with its word joiner, is dropped whole', () => {
  assert.equal(keyOf('all Exodus men.* <!-- ⁠ pause-duration="60s" -->'), 'all exodus men.');
});

test('case is ignored', () => {
  assert.equal(keyOf('GLORY Be'), 'glory be');
});

// ─── The offset map ───────────────────────────────────────

test('a match across a blockquote prefix on the next line maps back to its exact raw span', () => {
  const raw = '> *Glory be to the Father,*\n> *and to the Son*';

  assert.equal(rawSpanOf(raw, 'father, and to'), 'Father,*\n> *and to');
  assert.equal(rawSpanOf(raw, 'and to the son'), 'and to the Son');
});

test('a match next to a removed comment maps back to its exact raw span', () => {
  const raw = 'Amen. <!-- pause-duration="10s" -->Glory be';

  assert.equal(rawSpanOf(raw, 'amen.'), 'Amen.');
  assert.equal(rawSpanOf(raw, 'glory be'), 'Glory be');
  assert.equal(rawSpanOf(raw, 'amen. glory'), 'Amen. <!-- pause-duration="10s" -->Glory');
});

test('a character whose lowercase is longer maps every key character to it', () => {
  const raw = 'Sveti İvan';
  const { key, map } = toMatchForm(raw);

  assert.equal(key, 'sveti i̇van');
  assert.deepEqual(map.slice(6, 8), [6, 6]);
  assert.equal(rawSpanOf(raw, 'i̇van'), 'İvan');
  assert.equal(rawSpanOf(raw, 'van'), 'van');
});

test('a character outside the basic plane maps back whole', () => {
  const raw = 'Amen 𝔸 men';

  assert.equal(rawSpanOf(raw, '𝔸'), '𝔸');
  assert.equal(rawSpanOf(raw, '𝔸 men'), '𝔸 men');
});

test('the last map entry is the raw index just after the last kept character', () => {
  const raw = '*Amen.* <!-- x -->';
  const { key, map } = toMatchForm(raw);

  assert.equal(key, 'amen.');
  assert.equal(map.length, key.length + 1);
  assert.equal(map[key.length], 6);
});

test('an empty key has a single map entry', () => {
  assert.deepEqual(toMatchForm(' <!-- x --> '), { key: '', map: [0] });
});

// ─── sourceKeyOf ──────────────────────────────────────────

test('the same wording in any layout has the same source key', () => {
  const key = sourceKeyOf('Glory be to the Father, and to the Son');

  assert.equal(sourceKeyOf('> *Glory be to the Father,*\n> *and to the Son*'), key);
  assert.equal(sourceKeyOf('*Glory be to the Father, and to the Son*'), key);
  assert.equal(sourceKeyOf('1. Glory be to the Father,  \n   and to the Son <!-- pause-duration="10s" -->'), key);
  assert.equal(sourceKeyOf('  GLORY be to the Father,\n\nand to the Son\n'), key);
});

// ─── stripLayout ──────────────────────────────────────────

const GLORY_BE = `> *Glory be to the Father, and to the Son, and to the Holy Spirit,*
> *as it was in the beginning, is now, and ever shall be, world without end. Amen.* <!-- pause-duration="10s" -->`;

test('the Glory Be loses its blockquote, the italics around each line and its pause marker', () => {
  const expected: LayoutPart[] = ['blockquote', 'emphasis', 'comment'];

  assert.deepEqual(stripLayout(GLORY_BE), {
    text: `Glory be to the Father, and to the Son, and to the Holy Spirit,
as it was in the beginning, is now, and ever shall be, world without end. Amen.`,
    removed: expected,
  });
});

test('bold inside a line is kept as the wording', () => {
  assert.deepEqual(stripLayout('> *Pray for us, **Holy Mother of God**, now and always.*'), {
    text: 'Pray for us, **Holy Mother of God**, now and always.',
    removed: ['blockquote', 'emphasis'] satisfies LayoutPart[],
  });
});

test('emphasis that only starts and ends the line around plain words is kept', () => {
  assert.deepEqual(stripLayout('*Glory* be to the *Father*'), { text: '*Glory* be to the *Father*', removed: [] });
});

test('a single italic line loses its italics', () => {
  assert.deepEqual(stripLayout('*In the name of the Father, and of the Son. Amen.*'), {
    text: 'In the name of the Father, and of the Son. Amen.',
    removed: ['emphasis'] satisfies LayoutPart[],
  });
});

test('italics around a whole paragraph of several lines are removed once, per paragraph', () => {
  const raw = '*Let us remember\nthat we are in His presence.*\n\n**Amen.**';

  assert.deepEqual(stripLayout(raw), {
    text: 'Let us remember\nthat we are in His presence.\n\nAmen.',
    removed: ['emphasis'] satisfies LayoutPart[],
  });
});

test('a numbered list item loses its marker and indentation', () => {
  assert.deepEqual(stripLayout('1. Our Father, who art in heaven,\n   hallowed be thy name.'), {
    text: 'Our Father, who art in heaven,\nhallowed be thy name.',
    removed: ['list', 'indentation'] satisfies LayoutPart[],
  });
});

test('a heading loses its markers', () => {
  assert.deepEqual(stripLayout('## Glory Be'), { text: 'Glory Be', removed: ['heading'] satisfies LayoutPart[] });
});

test('hard line breaks are removed and the line breaks kept', () => {
  assert.deepEqual(stripLayout('Glory be\\\nto the Father,  \nand to the Son'), {
    text: 'Glory be\nto the Father,\nand to the Son',
    removed: ['hard-break'] satisfies LayoutPart[],
  });
});

test('stanza breaks are kept, a blank quoted line included, and a comment-only line goes', () => {
  const raw = '> Glory be\n>\n> to the Father\n<!-- pause -->\n> and to the Son';

  assert.deepEqual(stripLayout(raw), {
    text: 'Glory be\n\nto the Father\nand to the Son',
    removed: ['blockquote', 'comment'] satisfies LayoutPart[],
  });
});

test('text with no layout comes back unchanged', () => {
  const raw = 'Glory be to the Father,\nand to the Son.\n\nAmen.';

  assert.deepEqual(stripLayout(raw), { text: raw, removed: [] });
});

// ─── readLines ────────────────────────────────────────────

const LINE: LineLayout = { blank: false, prefix: '', marker: '', lead: '', open: '', text: '', close: '', tail: '' };

test('readLines cuts the Glory Be into blockquote, italics around each line, wording and pause marker', () => {
  assert.deepEqual(readLines(GLORY_BE), [
    {
      ...LINE,
      prefix: '> ',
      open: '*',
      text: 'Glory be to the Father, and to the Son, and to the Holy Spirit,',
      close: '*',
    },
    {
      ...LINE,
      prefix: '> ',
      open: '*',
      text: 'as it was in the beginning, is now, and ever shall be, world without end. Amen.',
      close: '*',
      tail: ' <!-- pause-duration="10s" -->',
    },
  ]);
});

test('readLines opens italics around a paragraph on its first line and closes them on its last', () => {
  assert.deepEqual(readLines('*Let us remember  \nthat we are in His presence.* <!-- pause -->'), [
    { ...LINE, open: '*', text: 'Let us remember', tail: '  ' },
    { ...LINE, text: 'that we are in His presence.', close: '*', tail: ' <!-- pause -->' },
  ]);
});

test('readLines reads a list marker, a blank quoted line and a comment-only line', () => {
  assert.deepEqual(readLines('> 1. Our Father,\n>\n>    hallowed be thy name.\n> <!-- pause -->'), [
    { ...LINE, prefix: '> ', marker: '1. ', text: 'Our Father,' },
    { ...LINE, blank: true, prefix: '>' },
    { ...LINE, prefix: '>    ', text: 'hallowed be thy name.' },
    { ...LINE, prefix: '> ', tail: '<!-- pause -->' },
  ]);
});

test('readLines reads nested wrappers as one opening and one closing', () => {
  assert.deepEqual(readLines('**_Amen._**'), [{ ...LINE, open: '**_', text: 'Amen.', close: '_**' }]);
});

// A quadratic scan took seconds on these (a regex backtracking over a long
// run of spaces, a lazy comment regex rescanning from every `<!--`). Linear
// work takes milliseconds, so the budget is far above it and far below that.
const BUDGET_MS = 500;
const cases = {
  'a long run of spaces before a line break': `a${' '.repeat(99_997)}b\nc`,
  'many unclosed comments': '<!--'.repeat(50_000),
  'many closed comments': 'a <!-- x --> '.repeat(8_000),
};

for (const [name, text] of Object.entries(cases)) {
  test(`reads ${name} in linear time`, () => {
    const started = performance.now();
    sourceKeyOf(text);
    stripLayout(text);
    const took = performance.now() - started;
    assert.ok(took < BUDGET_MS, `took ${Math.round(took)} ms`);
  });
}
