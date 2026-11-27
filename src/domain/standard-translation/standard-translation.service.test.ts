import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CLOSING_PRAYER_HR, GLORY_BE_HR, PRESENCE_HR, SIGN_OF_THE_CROSS_HR } from './fixtures/croatian';
import { sourceKeyOf, stripLayout } from './match-form';
import type { StandardTranslationMatch } from './standard-translation.repository';
import { prepareStandardTranslations } from './standard-translation.service';

let ids = 0;
function entry(
  sourceText: string,
  targetText: string,
  { name = null as string | null, project = null as string | null, fixedForm = false } = {},
): StandardTranslationMatch {
  return {
    id: `entry-${++ids}`,
    name,
    sourceText,
    sourceKey: sourceKeyOf(sourceText),
    targetText,
    fixedForm,
    sourceProjectId: project,
  };
}

/** Prepared from a source no Scripture was taken out of. */
const prepare = (source: string, entries: StandardTranslationMatch[]) =>
  prepareStandardTranslations(source, entries, { original: source });

const GLORY_BE_EN =
  'Glory be to the Father, and to the Son, and to the Holy Spirit,\nas it was in the beginning, is now, and ever shall be, world without end. Amen.';
const gloryBe = () => entry(GLORY_BE_EN, GLORY_BE_HR, { name: 'Glory Be' });

// ─── The fixture's prayers ────────────────────────────────

const VICTORIOUS = readFileSync(
  path.join(import.meta.dirname, '..', 'scripture', 'fixtures', 'the-victorious-life.md'),
  'utf8',
);
/** The fixture's lines `first` to `last`, numbered from 1 as an editor shows them. */
const fixtureLines = (first: number, last: number) => VICTORIOUS.split('\n').slice(first - 1, last).join('\n');

const fixtureEntries = () => [
  entry('In the name of the Father, and of the Son, and of the Holy Spirit. Amen.', SIGN_OF_THE_CROSS_HR, {
    name: 'Sign of the Cross',
  }),
  entry(stripLayout(fixtureLines(28, 30)).text, PRESENCE_HR, { name: 'Holy presence' }),
  entry(stripLayout(fixtureLines(60, 67)).text, CLOSING_PRAYER_HR, { name: 'Closing prayer' }),
];

test('the fixture’s prayers become one placeholder line each, the frontmatter and the rest untouched', () => {
  const { content } = prepare(VICTORIOUS, fixtureEntries());

  const lines = content.split('\n');
  assert.equal(lines.slice(0, 25).join('\n'), fixtureLines(1, 25));
  assert.deepEqual([lines[25], lines[27], lines[29]], ['{{std:1}}', '{{std:2}}', fixtureLines(32, 32)]);
  // Lines after the presence paragraph move up 2, after the closing prayer 9.
  assert.deepEqual([lines[57], lines[58], lines[59]], ['{{std:3}}', fixtureLines(68, 68), '{{std:4}}']);
  assert.equal(lines.slice(60).join('\n'), fixtureLines(70, 70));
});

test('the fixture’s prayers come back in Croatian in their layout, the pause marker on its line', () => {
  const prepared = prepare(VICTORIOUS, fixtureEntries());

  const { content, notices } = prepared.restore(prepared.content);

  const signOfTheCross = `*${SIGN_OF_THE_CROSS_HR}*`;
  const presence = [
    '*Sjetimo se da smo u svetoj Božjoj prisutnosti. ',
    'Živi kao slobodan i hrabar muž koji danas i uvijek hodi u Isusovoj pobjedi.',
    'Odvoji sada jednu minutu tišine, moleći za Božji blagoslov za sebe, svoju obitelj, bratstvo i sve muževe Exodusa.* <!-- ⁠pause-duration="60s" -->',
  ].join('\n');
  assert.deepEqual(notices, []);
  assert.equal(
    content,
    [
      fixtureLines(1, 25),
      signOfTheCross,
      fixtureLines(27, 27),
      presence,
      fixtureLines(31, 59),
      `*${CLOSING_PRAYER_HR}*`,
      fixtureLines(68, 68),
      signOfTheCross,
      fixtureLines(70, 70),
    ].join('\n'),
  );
});

test('the issue’s Glory Be maps line for line, keeping the blockquote, italics and pause marker', () => {
  const prepared = prepare(
    `Pray:\n\n> *Glory be to the Father, and to the Son, and to the Holy Spirit,*\n> *as it was in the beginning, is now, and ever shall be, world without end. Amen.* <!-- pause-duration="10s" -->`,
    [gloryBe()],
  );
  assert.equal(prepared.content, 'Pray:\n\n{{std:1}}');

  assert.deepEqual(prepared.restore('Molite:\n\n{{std:1}}'), {
    content: `Molite:\n\n> *Slava Ocu i Sinu i Duhu Svetomu.*\n> *Kako bijaše na početku, tako i sada i vazda i u vijeke vjekova. Amen.* <!-- pause-duration="10s" -->`,
    notices: [],
  });
});

test('the same entry twice gets a placeholder each, each in its own layout', () => {
  const source = `*${GLORY_BE_EN.replace('\n', ' ')}*\n\n> ${GLORY_BE_EN.replace('\n', '\n> ')}`;
  const prepared = prepare(source, [gloryBe()]);
  assert.equal(prepared.content, '{{std:1}}\n\n{{std:2}}');

  assert.equal(
    prepared.restore('{{std:1}}\n\n{{std:2}}').content,
    `*${GLORY_BE_HR}*\n\n> ${GLORY_BE_HR.replace('\n', '\n> ')}`,
  );
});

// ─── Inline placeholders ──────────────────────────────────

test('a verbatim occurrence inside a line becomes a placeholder for just its words, filled as written', () => {
  const prepared = prepare('Pray the "Hail Mary" ten times.', [entry('Hail Mary', 'Zdravo Marijo')]);
  assert.equal(prepared.content, 'Pray the "{{std:1}}" ten times.');

  assert.deepEqual(prepared.restore('Molite „{{std:1}}” deset puta.'), {
    content: 'Molite „Zdravo Marijo” deset puta.',
    notices: [],
  });
});

const CAPITALISED: [where: string, draft: string, expected: string][] = [
  ['at the start of the text', '{{std:1}} danas.', 'Hvala Bogu danas.'],
  ['after a blockquote and emphasis', 'Uvod.\n> *{{std:1}}*', 'Uvod.\n> *Hvala Bogu*'],
  ['after a list marker', '1. {{std:1}}', '1. Hvala Bogu'],
  ['after a full stop and a space', 'Radujte se. {{std:1}}!', 'Radujte se. Hvala Bogu!'],
  ['after an ellipsis, a closing quote and a space', 'Rekao je „dosta…” {{std:1}}!', 'Rekao je „dosta…” Hvala Bogu!'],
  ['after a question mark and an opening quote', 'Zašto? „{{std:1}}”', 'Zašto? „Hvala Bogu”'],
  ['inside a sentence', 'Recite „{{std:1}}” glasno.', 'Recite „hvala Bogu” glasno.'],
  ['after a colon', 'Odgovorite: {{std:1}}!', 'Odgovorite: hvala Bogu!'],
  ['after a full stop with no space', 'Kraj.{{std:1}}', 'Kraj.hvala Bogu'],
];

for (const [where, draft, expected] of CAPITALISED) {
  test(`an inline placeholder ${where} is filled ${expected.includes('Hvala') ? 'capitalised' : 'as written'}`, () => {
    const prepared = prepare('Respond: "Thanks be to God" aloud.', [entry('Thanks be to God', 'hvala Bogu')]);
    assert.equal(prepared.content, 'Respond: "{{std:1}}" aloud.');

    assert.equal(prepared.restore(draft).content, expected);
  });
}

// ─── Terms ────────────────────────────────────────────────

const signOfTheCrossTerm = () => entry('Sign of the Cross', 'znak križa');

test('a term stays in the source and goes into the glossary', () => {
  const prepared = prepare('Begin with the Sign of the Cross.', [signOfTheCrossTerm()]);

  assert.equal(prepared.content, 'Begin with the Sign of the Cross.');
  assert.ok(
    prepared.prompt.endsWith(
      '\n- "Sign of the Cross" → "znak križa" (base form): keep this wording and change its form as the grammar needs',
    ),
  );
  assert.doesNotMatch(prepared.prompt, /\{\{std:/);
});

test('a term the draft uses in another form brings no warning', () => {
  const prepared = prepare('Begin with the Sign of the Cross.', [signOfTheCrossTerm()]);

  assert.deepEqual(prepared.restore('Započni znakom križa.'), { content: 'Započni znakom križa.', notices: [] });
});

test('a term the draft lacks is a warning', () => {
  const prepared = prepare('Begin with the Sign of the Cross.', [signOfTheCrossTerm()]);

  assert.deepEqual(prepared.restore('Započni križem.').notices, [
    'The AI may not have used the standard term "Sign of the Cross".',
  ]);
});

// ─── The prompt ───────────────────────────────────────────

test('the prompt keeps every placeholder, hints only those inside a sentence, and lists the document’s terms', () => {
  const prepared = prepare(
    `# Glory Be\n\n${GLORY_BE_EN}\n\nBegin with the Sign of the Cross. Then pray the "Hail Mary" ten times.`,
    [gloryBe(), signOfTheCrossTerm(), entry('Hail Mary', 'Zdravo Marijo'), entry('Our Father', 'Oče naš')],
  );

  assert.equal(
    prepared.content,
    '# Glory Be\n\n{{std:1}}\n\nBegin with the Sign of the Cross. Then pray the "{{std:2}}" ten times.',
  );
  assert.equal(
    prepared.prompt,
    [
      'Standard translations: the language team has fixed translations for some texts in this document. Use them as given here, never a translation of your own.',
      'The placeholders {{std:1}}, {{std:2}}, … stand for those texts. After translation each is replaced with its fixed translation. Keep every placeholder exactly as written, where it appears in the source. Do not translate or write out the text it stands for.',
      'Where a placeholder sits inside a sentence, its fixed translation is given so the words around it can fit it:',
      '- {{std:2}}: Zdravo Marijo',
      'Terms, each in its base form:',
      '- "Sign of the Cross" → "znak križa" (base form): keep this wording and change its form as the grammar needs',
    ].join('\n'),
  );
});

test('a project’s entry is used over the general one with the same source', () => {
  const general = entry('Hail Mary', 'Zdravo Marijo');
  const project = entry('Hail Mary', 'Zdravo, Marijo', { project: 'project-1' });
  const prepared = prepare('Pray the "Hail Mary".', [general, project]);

  assert.equal(prepared.restore('Molite „{{std:1}}”.').content, 'Molite „Zdravo, Marijo”.');
});

// ─── Scripture first ──────────────────────────────────────

test('an entry Scripture took part of is not matched across the Bible placeholder, and says so', () => {
  const original = 'Remember: The Lord is my shepherd (Psalm 23:1), I shall not want.';
  const prepared = prepareStandardTranslations(
    'Remember: The Lord is my shepherd ({{bible:1}}), I shall not want.',
    [entry('The Lord is my shepherd (Psalm 23:1), I shall not want.', 'Gospodin je pastir moj', { name: 'Psalm 23' })],
    { original },
  );

  assert.equal(prepared.content, 'Remember: The Lord is my shepherd ({{bible:1}}), I shall not want.');
  assert.equal(prepared.prompt, '');
  assert.deepEqual(prepared.restore('Sjeti se: {{bible:1}}').notices, [
    '"Psalm 23" contains a Scripture citation, so the Bible was used for it; the standard translation wasn\'t applied.',
  ]);
});

test('an entry inside a longer one is not blamed on Scripture in a document that has some', () => {
  const original = 'Read John 3:16.\n\nGlory be to the Father. Amen.';
  const prepared = prepareStandardTranslations(
    'Read {{bible:1}}.\n\nGlory be to the Father. Amen.',
    [
      entry('Glory be to the Father. Amen.', 'Slava Ocu. Amen.', { name: 'Glory Be' }),
      entry('Amen.', 'Amen.', { fixedForm: true }),
    ],
    { original },
  );

  assert.deepEqual(prepared.restore('Pročitaj {{bible:1}}.\n\n{{std:1}}').notices, []);
});

// ─── Warnings ─────────────────────────────────────────────

test('a line that differs from an entry by a word is a near miss, counted', () => {
  const prepared = prepare('*In the name of the Father, and of the Son, and the Holy Spirit. Amen.*', [
    fixtureEntries()[0],
  ]);

  assert.equal(prepared.prompt, '');
  assert.deepEqual(prepared.restore('*U ime Oca i Sina i Duha Svetoga. Amen.*').notices, [
    '"Sign of the Cross" looks like a standard translation but differs (1 word); the AI translated it.',
  ]);
});

test('a paragraph that differs from an entry by a few words is a near miss, the words counted', () => {
  const source = stripLayout(fixtureLines(28, 30)).text.replace('free and courageous', 'brave and courageous');
  const prepared = prepare(source.replace('holy presence', 'presence'), [fixtureEntries()[1]]);

  assert.deepEqual(prepared.restore('Nacrt.').notices, [
    '"Holy presence" looks like a standard translation but differs (2 words); the AI translated it.',
  ]);
});

test('an entry of fewer than four words is never a near miss', () => {
  const prepared = prepare('Have mercy, Lord.', [entry('Lord, have mercy.', 'Gospodine, smiluj se.')]);

  assert.deepEqual(prepared.restore('Smiluj se, Gospodine.').notices, []);
});

test('a pause marker moved to the end of a reflowed entry is a warning', () => {
  const prepared = prepare(
    '> *Glory be to the Father, and to the Son, and to the Holy Spirit,* <!-- pause-duration="5s" -->\n> *as it was in the beginning, is now, and ever shall be, world without end. Amen.*',
    [entry(GLORY_BE_EN, GLORY_BE_HR.replace('\n', ' '), { name: 'Glory Be' })],
  );

  assert.deepEqual(prepared.restore('{{std:1}}'), {
    content: `> *${GLORY_BE_HR.replace('\n', ' ')}* <!-- pause-duration="5s" -->`,
    notices: ['A pause marker inside "Glory Be" was moved to its end; check where it belongs.'],
  });
});

test('formatting inside the wording that differs from the entry is a warning', () => {
  const prepared = prepare(GLORY_BE_EN.replace('the Father', 'the **Father**'), [gloryBe()]);

  assert.deepEqual(prepared.restore('{{std:1}}').notices, [
    'The formatting inside "Glory Be" differs from the standard; check it.',
  ]);
});

test('a placeholder the AI dropped is a warning naming the entry, or the start of its source', () => {
  const prepared = prepare(`# Glory Be\n\n${GLORY_BE_EN}\n\nPray the "Hail Mary".`, [
    gloryBe(),
    entry('Hail Mary', 'Zdravo Marijo'),
  ]);
  assert.equal(prepared.content, '# Glory Be\n\n{{std:1}}\n\nPray the "{{std:2}}".');

  assert.deepEqual(prepared.restore('# Slava\n\nMolite.'), {
    content: '# Slava\n\nMolite.',
    notices: [
      'The AI dropped the standard translation of "Glory Be"; add it where it belongs.',
      'The AI dropped the standard translation of "Hail Mary"; add it where it belongs.',
    ],
  });
});

test('placeholders the AI invented are removed, with a warning', () => {
  const prepared = prepare('Pray the "Hail Mary".', [entry('Hail Mary', 'Zdravo Marijo')]);

  assert.deepEqual(prepared.restore('Molite „{{std:1}}” {{std:2}}.'), {
    content: 'Molite „Zdravo Marijo” .',
    notices: ['The AI added standard translation placeholders that were not in the source; they were removed.'],
  });
});

// ─── Nothing to do ────────────────────────────────────────

const UNCHANGED: [what: string, source: string, entries: () => StandardTranslationMatch[]][] = [
  ['no entries', 'Pray the "Hail Mary".', () => []],
  ['no entry occurs', 'Pray the "Hail Mary".', () => [entry('Our Father', 'Oče naš')]],
  [
    'the source already holds a std placeholder',
    'Pray the "Hail Mary" {{std:1}}.',
    () => [entry('Hail Mary', 'Zdravo Marijo')],
  ],
];

for (const [what, source, entries] of UNCHANGED) {
  test(`with ${what}, the source and the draft are left as they are`, () => {
    const prepared = prepare(source, entries());

    assert.equal(prepared.content, source);
    assert.equal(prepared.prompt, '');
    assert.deepEqual(prepared.restore('Molite {{std:1}}.'), { content: 'Molite {{std:1}}.', notices: [] });
  });
}

test('the frontmatter is left alone, even where it holds an entry', () => {
  const source = '---\ntitle: Glory Be\n---\n\n# Glory Be';
  const prepared = prepare(source, [entry('Glory Be', 'Slava Ocu')]);

  assert.equal(prepared.content, '---\ntitle: Glory Be\n---\n\n{{std:1}}');
  assert.equal(
    prepared.restore('---\ntitle: Slava\n---\n\n{{std:1}}').content,
    '---\ntitle: Slava\n---\n\n# Slava Ocu',
  );
});

test('a prayer line opening an italic paragraph keeps the paragraph’s emphasis', () => {
  const source = fixtureLines(28, 30);
  const presence = entry('Let us remember that we are in the holy presence of God.', 'Sjetimo se da smo u svetoj Božjoj prisutnosti.');
  const prepared = prepare(source, [presence]);

  // The fixture's line ends in a space, which stays where it was.
  assert.ok(prepared.content.startsWith('*{{std:1}} \nLive as a free'), prepared.content);
  const { content, notices } = prepared.restore(prepared.content);
  assert.ok(content.startsWith('*Sjetimo se da smo u svetoj Božjoj prisutnosti. \nLive as a free'), content);
  assert.ok(content.endsWith('Exodus men.* <!-- ⁠pause-duration="60s" -->'), content);
  assert.deepEqual(notices, []);
});

test('a term the AI left out is reported even when a filled-in standard text contains it', () => {
  const term = entry('Sign of the Cross', 'znak križa');
  const prayer = entry('In the name of the Father. Make the Sign of the Cross.', 'U ime Oca. Učini znak križa.', {
    name: 'Short prayer',
  });
  const prepared = prepare('Begin with the Sign of the Cross today.\n\nIn the name of the Father. Make the Sign of the Cross.', [
    term,
    prayer,
  ]);

  const { content, notices } = prepared.restore('Započni danas molitvom.\n\n{{std:1}}');
  assert.equal(content, 'Započni danas molitvom.\n\nU ime Oca. Učini znak križa.');
  assert.deepEqual(notices, ['The AI may not have used the standard term "Sign of the Cross".']);
});

test('a term warning names the entry as the other warnings do', () => {
  const term = entry('Liturgy of the\nHours', 'Liturgija časova', { name: 'Hours' });
  const prepared = prepare('Pray the Liturgy of the Hours daily.', [term]);
  assert.deepEqual(prepared.restore('Moli svaki dan.').notices, ['The AI may not have used the standard term "Hours".']);
});

test('a pause marker inside an inline standard text goes after it, with a warning', () => {
  const glory = entry('Glory be to the Father,\nand to the Son. Amen.', 'Slava Ocu,\ni Sinu. Amen.', { name: 'Glory Be' });
  const prepared = prepare('Pray: Glory be to the Father, <!-- pause-duration="5s" --> and to the Son. Amen.', [glory]);

  assert.equal(prepared.content, 'Pray: {{std:1}}');
  const { content, notices } = prepared.restore('Moli: {{std:1}}');
  assert.equal(content, 'Moli: Slava Ocu,\ni Sinu. Amen. <!-- pause-duration="5s" -->');
  assert.deepEqual(notices, ['A pause marker inside "Glory Be" was moved to its end; check where it belongs.']);
});

// ─── Performance ──────────────────────────────────────────

// The largest source AI translation takes is 300,000 characters; a dictionary
// can hold 2,000 entries. Comparing every entry with every line, rescanning a
// line for each match on it, and searching the draft for each placeholder
// took seconds to tens of seconds on the last three shapes; the work now takes
// tens to hundreds of milliseconds. The first is a ceiling for the near-miss
// search over lines that share the entries' words.
const words = Array.from({ length: 300 }, (_, i) => `word${i}`);
const dictionary = Array.from({ length: 2_000 }, (_, i) => {
  const text = Array.from({ length: 4 + (i % 8) }, (_, k) => words[(i * 3 + k * 7) % 300]).join(' ');
  return entry(text, text);
});
const LARGE: Array<[string, string, StandardTranslationMatch[], number]> = [
  [
    'short lines sharing words with 2,000 entries',
    Array.from({ length: 40_000 }, (_, i) => ((i % 9 === 0 ? '\n' : ' ') + words[(i * 7) % 300])).join(''),
    dictionary,
    3_000,
  ],
  [
    'thousands of short lines against 2,000 entries of the same length',
    Array.from({ length: 14_000 }, (_, i) => `foo n${i} bar baz qux`).join('\n'),
    Array.from({ length: 2_000 }, (_, i) => entry(`pray word${i} alpha beta gamma`, 'x')),
    1_500,
  ],
  ['one long line full of matches', 'say Amen and '.repeat(23_000), [entry('Amen', 'Amen')], 500],
  ['standard lines between other lines', 'Amen.\nalpha beta gamma delta\n'.repeat(11_000), [entry('Amen.', 'Amen.')], 500],
];

for (const [name, source, entries, budget] of LARGE) {
  test(`prepares and restores ${name} in time`, () => {
    const started = performance.now();
    const prepared = prepare(source, entries);
    prepared.restore(prepared.content);
    const took = performance.now() - started;
    assert.ok(took < budget, `took ${Math.round(took)} ms`);
  });
}
