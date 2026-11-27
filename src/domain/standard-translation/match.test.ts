import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { findOccurrences, type MatchableEntry, type OccurrenceKind } from './match';
import { sourceKeyOf } from './match-form';

interface Entry extends MatchableEntry {
  name: string;
}

const entry = (source: string, { fixedForm = false, project = null as string | null } = {}): Entry => ({
  name: source,
  sourceKey: sourceKeyOf(source),
  fixedForm,
  sourceProjectId: project,
});

/** The kind of the only occurrence of `source` in `text`. */
function kindOf(text: string, source: string, fixedForm = false): OccurrenceKind {
  const found = findOccurrences(text, [entry(source, { fixedForm })]);
  assert.equal(found.length, 1, `"${source}" occurs ${found.length} times in ${JSON.stringify(text)}`);
  return found[0].kind;
}

const GLORY_BE = 'Glory be to the Father, and to the Son, and to the Holy Spirit';

// ─── The issue's decision table ───────────────────────────

const DECISIONS: [text: string, source: string, kind: OccurrenceKind][] = [
  [`Begin.\n\n*${GLORY_BE}.*\n\nThen pray.`, `${GLORY_BE}.`, 'verbatim'],
  ['# Our Father', 'Our Father', 'verbatim'],
  ['Repeat: "Jesus, I trust in you."', 'Jesus, I trust in you.', 'verbatim'],
  ['Pray the "Hail Mary" ten times.', 'Hail Mary', 'verbatim'],
  ['Begin with the Sign of the Cross.', 'Sign of the Cross', 'term'],
  ['Pray the Liturgy of the Hours daily.', 'Liturgy of the Hours', 'term'],
];

for (const [text, source, kind] of DECISIONS) {
  test(`"${source}" in ${JSON.stringify(text)} is ${kind}`, () => {
    assert.equal(kindOf(text, source), kind);
  });
}

// ─── Where a verbatim occurrence may start ────────────────
// Each pairs the start under test with an end at the end of the line.

const STARTS: [start: string, text: string][] = [
  ['the start of the text', 'Glory Be'],
  ['the start of a line inside a paragraph', 'Now pray\nGlory Be'],
  ['opening emphasis at the start of a line', '***Glory Be***'],
  ['a heading', '## Glory Be'],
  ['a dash list item', '- Glory Be'],
  ['an asterisk list item', '* Glory Be'],
  ['a numbered list item', '12) Glory Be'],
  ['an indented list item in a nested blockquote', '> >   1. Glory Be'],
  ['a comment at the start of a line', '<!-- pause --> Glory Be'],
  ['a new sentence after a full stop', 'Now pray. Glory Be'],
  ['a new sentence after an exclamation mark', 'Rejoice! Glory Be'],
  ['a new sentence after a question mark', 'Shall we pray? Glory Be'],
  ['a new sentence after an ellipsis', 'And then… Glory Be'],
  ['a new sentence after closing emphasis and quotes', 'He said *"pray."* Glory Be'],
  ['a colon', 'Pray: Glory Be'],
  ['a colon and an opening quote', 'Pray: “Glory Be'],
];

for (const [start, text] of STARTS) {
  test(`a match may start at ${start}`, () => {
    assert.equal(kindOf(text, 'Glory Be'), 'verbatim');
  });
}

const NOT_STARTS: [start: string, text: string][] = [
  ['a word', 'Now pray Glory Be'],
  ['a comma', 'Now pray, Glory Be'],
  ['italics inside a sentence', 'Now pray *Glory Be*'],
  ['a quote that opens before other words', 'Now pray "the Glory Be'],
  ['a "#" with no space after it', '#Glory Be'],
];

for (const [start, text] of NOT_STARTS) {
  test(`a match after ${start} is a term`, () => {
    assert.equal(kindOf(text, 'Glory Be'), 'term');
  });
}

// ─── Where a verbatim occurrence may end ──────────────────
// Each pairs the end under test with a start at the start of the line.

const ENDS: [end: string, text: string][] = [
  ['the end of the text', 'Glory Be'],
  ['the end of a line inside a paragraph', 'Glory Be\nNow pray.'],
  ['closing emphasis at the end of a line', '**Glory Be**\nNow pray.'],
  ['a pause comment at the end of a line', 'Glory Be <!-- ⁠pause-duration="10s" -->\nNow pray.'],
  ['a backslash hard break', 'Glory Be\\\nNow pray.'],
  ['a two-space hard break', 'Glory Be  \nNow pray.'],
  ['a full stop', 'Glory Be. Now pray.'],
  ['a full stop inside the match', 'Glory Be. Now pray.'],
  ['an exclamation mark', 'Glory Be! Now pray.'],
  ['a question mark and a closing quote', 'Glory Be?" he asked.'],
  ['an ellipsis after closing emphasis', '*Glory Be*… and so on.'],
  ['repeated punctuation', 'Glory Be?! Now pray.'],
  ['a full stop and a comment', 'Glory Be.<!-- pause --> Now pray.'],
];

for (const [end, text] of ENDS) {
  test(`a match may end at ${end}`, () => {
    const source = end === 'a full stop inside the match' ? 'Glory Be.' : 'Glory Be';
    assert.equal(kindOf(text, source), 'verbatim');
  });
}

const NOT_ENDS: [end: string, text: string][] = [
  ['a word', 'Glory Be now.'],
  ['a comma', 'Glory Be, now.'],
  ['closing italics inside a sentence', '*Glory Be* now.'],
  ['a dot followed by a digit', 'Glory Be.5 now'],
  ['a colon', 'Glory Be: now pray.'],
];

for (const [end, text] of NOT_ENDS) {
  test(`a match before ${end} is a term`, () => {
    assert.equal(kindOf(text, 'Glory Be'), 'term');
  });
}

// ─── Abbreviations ────────────────────────────────────────

const ABBREVIATIONS = [
  ...['St.', 'Sts.', 'Fr.', 'Br.', 'Sr.', 'Mr.', 'Mrs.', 'Dr.', 'Rev.', 'Msgr.'],
  ...['cf.', 'e.g.', 'i.e.', 'vs.'],
];

for (const abbreviation of ABBREVIATIONS) {
  test(`"${abbreviation}" does not end a sentence`, () => {
    assert.equal(kindOf(`Pray with ${abbreviation} Glory Be`, 'Glory Be'), 'term');
  });
}

test('an abbreviation is recognised whatever its case', () => {
  assert.equal(kindOf('Pray with ST. Glory Be', 'Glory Be'), 'term');
});

test('a word ending like an abbreviation still ends a sentence', () => {
  assert.equal(kindOf('We fast. Glory Be', 'Glory Be'), 'verbatim');
});

test('an abbreviation dot right after the match does not end its sentence', () => {
  assert.equal(kindOf('Pray to St. Joseph today.', 'Pray to St'), 'term');
});

// ─── Quotation marks ──────────────────────────────────────

const QUOTE_PAIRS = ['“”', '„“', '„”', '«»', '»«', '""', '‘’', "''", '‚‘', '‹›'];

for (const [open, close] of QUOTE_PAIRS) {
  test(`${open}…${close} wrapping exactly the match makes it verbatim`, () => {
    assert.equal(kindOf(`Pray the ${open}Hail Mary${close} ten times.`, 'Hail Mary'), 'verbatim');
  });
}

test('a quote wrapping exactly the match makes it verbatim with emphasis between', () => {
  assert.equal(kindOf('Pray the "*Hail Mary*" ten times.', 'Hail Mary'), 'verbatim');
});

test('quotation marks that do not pair leave the match a term', () => {
  assert.equal(kindOf('Pray the «Hail Mary” ten times.', 'Hail Mary'), 'term');
});

test('a quote that wraps more than the match leaves it a term', () => {
  assert.equal(kindOf('Pray the "Hail Mary prayer" ten times.', 'Hail Mary'), 'term');
});

// ─── Fixed form ───────────────────────────────────────────

test('a Fixed form entry is verbatim inside a sentence', () => {
  assert.equal(kindOf('We end with Amen and leave.', 'Amen', true), 'verbatim');
});

// ─── Matching ─────────────────────────────────────────────

test('a match needs a word boundary on both sides', () => {
  assert.deepEqual(findOccurrences('Amens and reAmen and Amen1', [entry('Amen')]), []);
});

test('a match ignores case, curly quotes and dash styles', () => {
  const text = 'THE LORD’S “PRAYER” — AGAIN';

  const [found] = findOccurrences(text, [entry('the Lord\'s "Prayer" - again')]);

  assert.deepEqual([found.from, found.to], [0, text.length]);
});

test('a match runs across lines, prefixes and emphasis', () => {
  const text = '> *Glory be to the Father,*\n> *and to the Son.*';

  const [found] = findOccurrences(text, [entry('Glory be to the Father, and to the Son.')]);

  assert.equal(text.slice(found.from, found.to), 'Glory be to the Father,*\n> *and to the Son.');
});

test('the longest match wins over a shorter entry inside it', () => {
  const long = entry('Our Father, who art in heaven');

  const found = findOccurrences('Our Father, who art in heaven, hallowed be thy name.', [entry('Our Father'), long]);

  assert.deepEqual(
    found.map((o) => o.entry),
    [long],
  );
});

test('a project entry wins over a general one with the same source, in either order', () => {
  const general = entry('Glory Be');
  const project = entry('GLORY be', { project: 'p1' });

  assert.equal(findOccurrences('Glory Be', [general, project])[0].entry, project);
  assert.equal(findOccurrences('Glory Be', [project, general])[0].entry, project);
});

test('matches never overlap', () => {
  const first = entry('Glory be to the Father');
  const second = entry('the Father and the Son');

  const found = findOccurrences('Glory be to the Father and the Son', [first, second]);

  assert.deepEqual(
    found.map((o) => o.entry),
    [first],
  );
});

test('every occurrence is found, in text order', () => {
  const amen = entry('Amen', { fixedForm: true });
  const glory = entry('Glory Be');

  const found = findOccurrences('Glory Be. Amen. Glory Be. Amen.', [amen, glory]);

  assert.deepEqual(
    found.map((o) => [o.entry.name, o.from]),
    [
      ['Glory Be', 0],
      ['Amen', 10],
      ['Glory Be', 16],
      ['Amen', 26],
    ],
  );
});

test('nothing matches inside or across a Scripture placeholder', () => {
  const text = 'Read {{bible:1}} and pray.';

  assert.deepEqual(findOccurrences(text, [entry('bible'), entry('Read {{bible:1}} and pray.')]), []);
});

test('a match may sit right next to a Scripture placeholder', () => {
  assert.equal(findOccurrences('{{bible:1}} Amen.', [entry('Amen')]).length, 1);
});

test('an entry with an empty source never matches', () => {
  assert.deepEqual(findOccurrences('Amen. <!-- note --> Amen.', [entry('<!-- note -->')]), []);
});

// ─── Raw offsets and lines ────────────────────────────────

test('raw offsets cover the wording only, not the prefix or emphasis around it', () => {
  const text = '> 1. **Glory Be.** <!-- pause -->';

  const [found] = findOccurrences(text, [entry('Glory Be.')]);

  assert.equal(text.slice(found.from, found.to), 'Glory Be.');
});

test('a whole-line occurrence spans the full line, prefixes and trailing comment included', () => {
  const text = 'Pray.\n> *Glory Be.* <!-- pause-duration="10s" -->\nAmen.';

  const [found] = findOccurrences(text, [entry('Glory Be.')]);

  assert.equal(text.slice(found.lines!.from, found.lines!.to), '> *Glory Be.* <!-- pause-duration="10s" -->');
});

test('an occurrence over several whole lines spans all of them', () => {
  const text = 'Pray.\n> *Glory be to the Father,*\n> *and to the Son.*\nAmen.';

  const [found] = findOccurrences(text, [entry('Glory be to the Father, and to the Son.')]);

  assert.equal(text.slice(found.lines!.from, found.lines!.to), '> *Glory be to the Father,*\n> *and to the Son.*');
});

test('a whole line ending in a hard break spans the full line', () => {
  const text = 'Glory Be\\\nAmen.';

  const [found] = findOccurrences(text, [entry('Glory Be')]);

  assert.deepEqual(found.lines, { from: 0, to: 9 });
});

const INLINE: [where: string, text: string][] = [
  ['a verbatim sentence that shares its line', 'Now pray. Glory Be.'],
  ['a quoted match', '"Glory Be."'],
  ['a term', 'Pray the Glory Be daily.'],
  ['a match that starts a line and ends inside the next', 'Pray now.\nGlory\nBe with us.'],
];

for (const [where, text] of INLINE) {
  test(`${where} has no lines`, () => {
    assert.equal(findOccurrences(text, [entry('Glory Be')])[0].lines, null);
  });
}

// ─── Real text ────────────────────────────────────────────

const VICTORIOUS = readFileSync(
  path.join(import.meta.dirname, '..', 'scripture', 'fixtures', 'the-victorious-life.md'),
  'utf8',
);
const fixtureLines = VICTORIOUS.split('\n');

/** The raw span of the fixture's lines `first` to `last`, numbered from 1 as an editor shows them. */
function linesOf(first: number, last: number) {
  const from = fixtureLines.slice(0, first - 1).join('\n').length + 1;
  return { from, to: from + fixtureLines.slice(first - 1, last).join('\n').length };
}

test('the fixture’s prayers are verbatim occurrences of whole lines', () => {
  const signOfTheCross = entry('In the name of the Father, and of the Son, and of the Holy Spirit. Amen.');
  const presence = entry(fixtureLines.slice(27, 30).join('\n'));
  const closing = entry(fixtureLines.slice(59, 67).join('\n'));
  const amen = entry('Amen', { fixedForm: true });

  const found = findOccurrences(VICTORIOUS, [amen, signOfTheCross, presence, closing]).filter(
    (o) => o.entry !== amen,
  );

  assert.deepEqual(
    found.map((o) => ({ entry: o.entry.name, kind: o.kind, lines: o.lines })),
    [
      { entry: signOfTheCross.name, kind: 'verbatim', lines: linesOf(26, 26) },
      { entry: presence.name, kind: 'verbatim', lines: linesOf(28, 30) },
      { entry: closing.name, kind: 'verbatim', lines: linesOf(60, 67) },
      { entry: signOfTheCross.name, kind: 'verbatim', lines: linesOf(69, 69) },
    ],
  );
  assert.ok(VICTORIOUS.slice(found[1].lines!.from, found[1].lines!.to).endsWith('<!-- ⁠pause-duration="60s" -->'));
});

test('a prayer line opening or closing an italic paragraph stays inline, keeping the paragraph’s emphasis', () => {
  // Fixture line 28 opens the italic paragraph that line 30 closes.
  const opening = entry('Let us remember that we are in the holy presence of God.');
  const [found] = findOccurrences(VICTORIOUS, [opening]);
  assert.equal(found.kind, 'verbatim');
  assert.equal(found.lines, null);

  const text = '*Let us pray:\nGlory be to the Father. Amen.*';
  const [closing] = findOccurrences(text, [entry('Glory be to the Father. Amen.')]);
  assert.equal(closing.kind, 'verbatim');
  assert.equal(closing.lines, null);
});

test('a line wrapped in its own emphasis is still a whole line', () => {
  const [found] = findOccurrences('Intro.\n**Glory be to the Father.** <!-- pause -->', [entry('Glory be to the Father.')]);
  assert.notEqual(found.lines, null);
});

// ─── Performance ──────────────────────────────────────────

// A dictionary can hold 2,000 entries and a document 20,000 characters.
// Matching is a native substring search per entry; the budget is far above
// what that takes and far below a scan that is quadratic in the text.
const BUDGET_MS = 1000;

test('finds 2,000 entries in a 20,000-character document in time', () => {
  const words = Array.from({ length: 60 }, (_, i) => `word${String.fromCharCode(97 + (i % 26))}${i}`);
  // The document runs through the words seven apart, with italic lines and blockquotes between.
  const wordAt = (i: number) => words[(i * 7) % 60];
  let text = '';
  for (let i = 0; text.length < 20_000; i++) text += i % 11 === 0 ? `*${wordAt(i)}.*\n> ` : `${wordAt(i)} `;
  // Runs of one to four of those words, and, to make 2,000, runs that end in a word the document lacks.
  const entries = Array.from({ length: 2000 }, (_, i) => {
    const run = Array.from({ length: 1 + (i % 4) }, (_, k) => wordAt(i + k));
    return entry(i < 240 ? run.join(' ') : `${run.join(' ')} missing${i}`);
  });

  const started = performance.now();
  const found = findOccurrences(text, entries);
  const took = performance.now() - started;

  assert.ok(found.length > 100, `found ${found.length}`);
  assert.ok(took < BUDGET_MS, `took ${Math.round(took)} ms`);
});
