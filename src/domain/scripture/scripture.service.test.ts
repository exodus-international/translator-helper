import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { findCitations } from './citations';
import {
  applyVerseTag,
  findReadings,
  prepareScripture,
  similarity,
  type PassageLookup,
  type PassageResult,
} from './scripture.service';

const JAMES_EN = [
  'My brethren, show no partiality as you hold the faith of our Lord Jesus Christ, the Lord of glory.',
  'For if a man with gold rings and in fine clothing comes into your assembly, and a poor man in shabby clothing also comes in,',
  'and you pay attention to the one who wears the fine clothing and say, “Have a seat here, please,” while you say to the poor man, “Stand there,” or, “Sit at my feet,”',
  'have you not made distinctions among yourselves, and become judges with evil thoughts?',
];
const JAMES_HR = ['Braćo moja, vjeru u Gospodina našega Isusa Krista', 'Jer ako uđe u vaš zbor čovjek', 'i vi pogledate na onoga', 'niste li sami u sebi napravili razliku'];

const day = `---
title: Recalling God’s Presence
day: 9
verse_tag: James 2:1-4
---

Brothers, welcome back. "Be still, and know that I am God." — Psalm 46:10

# A Reading from the Letter of St. James

*${JAMES_EN.join('\n')}*

# Reflection

Compare Psalm 13:1 and Psalm 46:10. We meet at 5:30 and At 5:30 we pray.
`;

const daily = `---
title: "Day 3"
---

<span style="display:block;color:#CC0000;">**READING 1**</span><br>
<span style="display:block;color:#CC0000;">James 5:11-13</span>

*Behold, we call those happy who were steadfast. Is any one among you suffering? Let him pray.*

<span style="display:block;color:#CC0000;">**READING 2**</span><br>
<span style="display:block;color:#CC0000;">From a sermon by Saint Charles, bishop</span>

*My brothers, you must realise that for us churchmen nothing is more necessary than meditation.*
`;

const API: Record<string, PassageResult> = {
  'James 2:1-4': {
    ref: 'James 2:1-4',
    status: 'ok',
    rendered: 'Jak 2,1-4',
    verses: JAMES_HR.map((text) => ({ text })),
    source: { text: JAMES_EN.join(' ') },
  },
  'Psalm 46:10': {
    ref: 'Psalm 46:10',
    status: 'ok',
    rendered: 'Ps 46,11',
    verses: [{ text: 'Prestanite i spoznajte da sam ja Bog!' }],
  },
  'Psalm 13:1': { ref: 'Psalm 13:1', status: 'versification_unmapped', notes: ['PSA 13 has no mapping yet.'] },
  'At 5:30': { ref: 'At 5:30', status: 'unknown_book', notes: [] },
  'James 5:11-13': {
    ref: 'James 5:11-13',
    status: 'ok',
    rendered: 'Jak 5,11-13',
    verses: [{ text: 'Evo, blaženima zovemo postojane.' }, { text: 'Trpi li tko među vama?' }, { text: 'Neka moli *.' }],
    source: { text: 'Behold, we call those happy who were steadfast. Is any one among you suffering? Let him pray.' },
  },
};

function bible(respond: (refs: string[], lang: string) => PassageResult[] | null) {
  const calls: Array<{ refs: string[]; lang: string }> = [];
  const lookup: PassageLookup = async (refs, lang) => {
    calls.push({ refs, lang });
    const results = respond(refs, lang);
    return results && new Map(results.map((r) => [r.ref, r]));
  };
  return { lookup, calls };
}

const fromTable = (table: Record<string, PassageResult>) =>
  bible((refs) => refs.map((ref) => table[ref] ?? { ref, status: 'unparseable', notes: [] }));

/** A stand-in for the model: "translates" by keeping the placeholders and the structure. */
const model = (content: string) => content.replace('Brothers, welcome back.', 'Braćo, dobro došli natrag.');

test('findReadings pairs the one "A Reading" heading with verse_tag', () => {
  const body = day.slice(day.indexOf('---\n\n') + 5);
  const [reading] = findReadings(body, 'James 2:1-4');
  assert.equal(reading.citation, 'James 2:1-4');
  assert.equal(reading.linePerVerse, true);
  assert.equal(body.split('\n').slice(reading.start, reading.end).join('\n'), `*${JAMES_EN.join('\n')}*`);
  assert.deepEqual(findReadings(body, null), []);
  assert.deepEqual(findReadings(`${body}\n# A Reading from Exodus\n\n*More*\n`, 'James 2:1-4'), []);
  assert.deepEqual(findReadings('# A Reading from the Letter of St. James\n\nNot italic.\n', 'James 2:1-4'), []);
});

test('findReadings finds a citation line followed by italic text, and skips other spans', () => {
  const readings = findReadings(daily, null);
  assert.deepEqual(
    readings.map((r) => [r.citation, r.linePerVerse]),
    [['James 5:11-13', false]],
  );
});

test('similarity is 1 for the same words and falls with what is missing', () => {
  assert.equal(similarity('The Lord is my shepherd', 'the lord, is my Shepherd!'), 1);
  assert.ok(similarity(JAMES_EN.slice(0, 2).join(' '), JAMES_EN.join(' ')) < 0.9);
});

test('prepareScripture swaps Scripture for placeholders and restores it from the Bible', async () => {
  const { lookup, calls } = fromTable(API);
  const scripture = await prepareScripture(day, 'hr', lookup);

  assert.deepEqual(calls, [{ lang: 'hr', refs: ['James 2:1-4', 'Psalm 46:10', 'Psalm 13:1', 'At 5:30'] }]);

  // The model never sees the reading or a resolved citation.
  assert.ok(!scripture.content.includes('My brethren'));
  assert.ok(scripture.content.includes('# A Reading from the Letter of St. James\n\n{{bible:1}}\n\n# Reflection'));
  assert.ok(scripture.content.includes('I am God." — {{bible:2}}'));
  assert.ok(scripture.content.includes('Compare Psalm 13:1 and {{bible:2}}. We meet at 5:30 and At 5:30 we pray.'));
  assert.ok(scripture.content.startsWith('---\ntitle: Recalling God’s Presence\nday: 9\nverse_tag: James 2:1-4\n---\n'));
  assert.ok(scripture.prompt.includes('Keep every placeholder exactly as written'));
  assert.ok(scripture.prompt.includes('- {{bible:2}} (Ps 46,11): Prestanite i spoznajte da sam ja Bog!'));

  const { content, notices } = scripture.restore(model(scripture.content).replace('verse_tag: James 2:1-4', 'verse_tag: Jakov 2:1-4'));
  assert.ok(content.includes('verse_tag: Jak 2,1-4\n'));
  assert.ok(content.includes(`# A Reading from the Letter of St. James\n\n*${JAMES_HR.join('\n')}*\n\n# Reflection`));
  assert.ok(content.includes('Braćo, dobro došli natrag. "Be still, and know that I am God." — Ps 46,11'));
  assert.ok(content.includes('Compare Psalm 13:1 and Ps 46,11.'));
  // Only the real reference that could not be mapped is worth a notice.
  assert.deepEqual(notices, [
    'Psalm 13:1: not in the Bible (PSA 13 has no mapping yet.) -- the AI translated the citation; check it against the official text.',
  ]);
});

test('prepareScripture keeps a one-paragraph reading as one paragraph and escapes Markdown', async () => {
  const { lookup } = fromTable(API);
  const scripture = await prepareScripture(daily, 'hr', lookup);
  const { content, notices } = scripture.restore(scripture.content);
  assert.ok(content.includes('<span style="display:block;color:#CC0000;">Jak 5,11-13</span>\n\n*Evo, blaženima zovemo postojane. Trpi li tko među vama? Neka moli \\*.*\n'));
  assert.ok(content.includes('*My brothers, you must realise'));
  assert.deepEqual(notices, []);
});

test('prepareScripture replaces a reading whole, elisions and plain paragraphs included', async () => {
  const elided = day.replace(`\n${JAMES_EN[1]}`, '*\n\n. . .\n\nAnd then:\n\n*' + JAMES_EN[1]);
  const { lookup } = fromTable(API);
  const scripture = await prepareScripture(elided, 'hr', lookup);
  assert.ok(scripture.content.includes('# A Reading from the Letter of St. James\n\n{{bible:1}}\n\n# Reflection'));
  assert.ok(!scripture.content.includes('. . .'));
});

test('prepareScripture inserts the whole passage for a shortened reading and says so', async () => {
  const shortened = day.replace(`\n${JAMES_EN[2]}`, '');
  const { lookup } = fromTable(API);
  const scripture = await prepareScripture(shortened, 'hr', lookup);
  const { content, notices } = scripture.restore(scripture.content);
  assert.ok(content.includes(JAMES_HR.join('\n')));
  assert.ok(notices[0].startsWith('James 2:1-4: the English reading is shortened or from another translation.'));
});

test('prepareScripture leaves a reading that is not the cited passage to the model', async () => {
  const other = day.replace(JAMES_EN.slice(1).join('\n'), 'Behold, how good and pleasant it is when brothers dwell in unity!');
  const { lookup } = fromTable(API);
  const scripture = await prepareScripture(other, 'hr', lookup);
  assert.ok(scripture.content.includes('My brethren, show no partiality'));
  const { content, notices } = scripture.restore(scripture.content);
  assert.ok(content.includes('verse_tag: Jak 2,1-4'));
  assert.ok(notices[0].startsWith('James 2:1-4: the English reading does not match this passage in RSV-CE'));
});

test('restore reports placeholders the model dropped and removes ones it made up', async () => {
  const { lookup } = fromTable(API);
  const scripture = await prepareScripture(day, 'hr', lookup);
  const output = scripture.content.replace('— {{bible:2}}', '— Psalam 46,10').replace('# Reflection', '# Reflection {{bible:9}}');
  const { content, notices } = scripture.restore(output);
  assert.ok(!content.includes('{{bible:'));
  assert.ok(notices.includes('The AI dropped Ps 46,11; add it where it belongs.'));
  assert.ok(notices.includes('The AI added Scripture placeholders that were not in the source; they were removed.'));
});

test('prepareScripture leaves Scripture to the model, with a notice, when the Bible cannot be read', async () => {
  const scripture = await prepareScripture(day, 'hr', async () => {
    throw new Error('connection refused');
  });
  assert.equal(scripture.content, day);
  assert.equal(scripture.prompt, '');
  assert.deepEqual(scripture.restore('draft'), {
    content: 'draft',
    notices: ['The Bible could not be read, so the AI translated the Scripture. Check it against the official text.'],
  });
});

test('prepareScripture leaves a language with no Bible to the model, without a notice', async () => {
  const scripture = await prepareScripture(day, 'lt', bible(() => null).lookup);
  assert.equal(scripture.content, day);
  assert.deepEqual(scripture.restore('draft').notices, []);
});

test('prepareScripture does nothing when the source has its own placeholders or no Scripture', async () => {
  const { lookup, calls } = fromTable(API);
  const result = await prepareScripture(`${day}\n{{bible:1}}`, 'hr', lookup);
  assert.equal(result.prompt, '');
  assert.deepEqual((await prepareScripture('---\ntitle: T\n---\n\nNo Scripture here.\n', 'hr', lookup)).restore('draft'), {
    content: 'draft',
    notices: [],
  });
  assert.equal(calls.length, 0);
});

test('prepareScripture finds citations of one-chapter books', async () => {
  const { lookup, calls } = fromTable({
    'Jude 5': { ref: 'Jude 5', status: 'ok', rendered: 'Jd 5', verses: [{ text: 'Podsjetiti vas hoću.' }] },
    'Philemon 4-7, 10': { ref: 'Philemon 4-7, 10', status: 'ok', rendered: 'Flm 4-7.10', verses: [{ text: 'Zahvaljujem.' }] },
  });
  const scripture = await prepareScripture('As Jude 5 and Philemon 4-7, 10 say. Day 9 at 5:30.\n', 'hr', lookup);
  assert.deepEqual(calls[0].refs, ['Jude 5', 'Philemon 4-7, 10']);
  assert.equal(scripture.restore(scripture.content).content, 'As Jd 5 and Flm 4-7.10 say. Day 9 at 5:30.\n');
});

test('prepareScripture finds the citations the editor check finds: en dashes, non-ASCII book names', async () => {
  const source = [
    'See Hebrews 2:14 – 15, Žid 4:12 and Jude 5–7. Day 9 at 5:30.',
    '',
    '<span style="display:block;color:#CC0000;">Ézéchiel 36:26</span>',
    '',
    '*A new heart I will give you.*',
    '',
  ].join('\n');
  const { lookup, calls } = fromTable({
    'Hebrews 2:14 – 15': { ref: 'Hebrews 2:14 – 15', status: 'ok', rendered: 'Heb 2,14-15', verses: [{ text: 'Budući da djeca.' }] },
    'Žid 4:12': { ref: 'Žid 4:12', status: 'ok', rendered: 'Heb 4,12', verses: [{ text: 'Živa je riječ Božja.' }] },
    'Jude 5–7': { ref: 'Jude 5–7', status: 'ok', rendered: 'Jd 5-7', verses: [{ text: 'Podsjetiti vas hoću.' }] },
    'Ézéchiel 36:26': { ref: 'Ézéchiel 36:26', status: 'ok', rendered: 'Ez 36,26', verses: [{ text: 'Dat ću vam novo srce.' }] },
  });
  const scripture = await prepareScripture(source, 'hr', lookup);

  // The reading's citation comes first, then the inline ones in order: the same set the check resolves.
  assert.deepEqual(new Set(calls[0].refs), new Set(findCitations(source).map((c) => c.text)));
  assert.deepEqual(calls[0].refs, ['Ézéchiel 36:26', 'Hebrews 2:14 – 15', 'Žid 4:12', 'Jude 5–7']);
  assert.equal(
    scripture.restore(scripture.content).content,
    [
      'See Heb 2,14-15, Heb 4,12 and Jd 5-7. Day 9 at 5:30.',
      '',
      '<span style="display:block;color:#CC0000;">Ez 36,26</span>',
      '',
      '*Dat ću vam novo srce.*',
      '',
    ].join('\n'),
  );
});

test('prepareScripture swaps a quotation of the whole passage for the official text', async () => {
  const { lookup } = fromTable({
    'John 3:16': {
      ref: 'John 3:16',
      status: 'ok',
      rendered: 'Iv 3,16',
      verses: [{ text: 'Bog je tako ljubio svijet.' }],
      source: { text: 'For God so loved the world.' },
    },
    'Psalm 46:10': {
      ref: 'Psalm 46:10',
      status: 'ok',
      rendered: 'Ps 46,11',
      verses: [{ text: 'Prestanite i spoznajte da sam ja Bog!' }],
      source: { text: 'Be still, and know that I am God. I am exalted among the nations, I am exalted in the earth!' },
    },
  });
  const source = '"For God so loved the world." (John 3:16) and "Be still, and know that I am God." — Psalm 46:10\n';
  const scripture = await prepareScripture(source, 'hr', lookup);
  assert.ok(!scripture.content.includes('loved the world'));
  // Half the verse is quoted: left to the model, with the official wording as a guide.
  assert.ok(scripture.content.includes('"Be still, and know that I am God."'));
  const { content, notices } = scripture.restore(scripture.content);
  assert.equal(content, '"Bog je tako ljubio svijet." (Iv 3,16) and "Be still, and know that I am God." — Ps 46,11\n');
  assert.deepEqual(notices, [
    'Psalm 46:10: the quotation beside it is shortened or from another translation, so the AI translated it -- check it against Ps 46,11.',
  ]);
});

test('prepareScripture leaves a quotation that drops a clause to the model', async () => {
  const { lookup } = fromTable({
    'Matthew 11:28': {
      ref: 'Matthew 11:28',
      status: 'ok',
      rendered: 'Mt 11,28',
      verses: [{ text: 'Dođite k meni svi koji ste umorni i opterećeni i ja ću vas odmoriti.' }],
      source: { text: 'Come to me, all who labor and are heavy laden, and I will give you rest.' },
    },
  });
  const source = '"Come to me, all who labor and are heavy laden, and I will give rest." (Matthew 11:28)\n';
  const scripture = await prepareScripture(source, 'hr', lookup);
  assert.ok(scripture.content.includes('"Come to me, all who labor and are heavy laden, and I will give rest."'));
  assert.deepEqual(scripture.restore(scripture.content).notices, [
    'Matthew 11:28: the quotation beside it is shortened or from another translation, so the AI translated it -- check it against Mt 11,28.',
  ]);
});

test('applyVerseTag sets verse_tag, keeping its quotes, and leaves the body alone', () => {
  assert.equal(applyVerseTag('---\nverse_tag: "Jakov 2:1-4"\n---\n', 'Jak 2,1-4'), '---\nverse_tag: "Jak 2,1-4"\n---\n');
  assert.equal(applyVerseTag('---\nverse_tag:\n---\n', 'Jak 2,1-4'), '---\nverse_tag: Jak 2,1-4\n---\n');
  const body = '---\ntitle: T\n---\n\nverse_tag: James 2:1-4';
  assert.equal(applyVerseTag(body, 'Jak 2,1-4'), body);
});

// ─── A day with no verse_tag ──────────────────────────────

const VICTORIOUS = readFileSync(path.join(import.meta.dirname, 'fixtures', 'the-victorious-life.md'), 'utf8');
const ROMANS_EN =
  'Who shall separate us from the love of Christ? Shall tribulation, or distress, or persecution, or famine, or nakedness, or peril, or sword? As it is written, "For thy sake we are being killed all the day long; we are regarded as sheep to be slaughtered." No, in all these things we are more than conquerors through him who loved us. For I am sure that neither death, nor life, nor angels, nor principalities, nor things present, nor things to come, nor powers, nor height, nor depth, nor anything else in all creation, will be able to separate us from the love of God in Christ Jesus our Lord.';
const HEBREWS_EN =
  'Since therefore the children share in flesh and blood, he himself likewise partook of the same nature, that through death he might destroy him who has the power of death, that is, the devil, and deliver all those who through fear of death were subject to lifelong bondage.';
const UNTAGGED: Record<string, PassageResult> = {
  'Romans 8:35-39': {
    ref: 'Romans 8:35-39',
    status: 'ok',
    rendered: 'Rim 8,35-39',
    verses: [{ text: 'Tko će nas rastaviti od Božje ljubavi?' }, { text: 'Kao što je pisano.' }, { text: 'Ali u svemu tome pobjeđujemo.' }],
    source: { text: ROMANS_EN },
  },
  'Hebrews 2:14–15': {
    ref: 'Hebrews 2:14–15',
    status: 'ok',
    rendered: 'Heb 2,14-15',
    verses: [{ text: 'Budući da djeca zajednički imaju tijelo i krv.' }, { text: 'Tako izbavi one.' }],
    source: { text: HEBREWS_EN },
  },
};

test('a reading with no verse_tag is found by its text, filled from the Bible, and verse_tag set', async () => {
  const { lookup, calls } = fromTable(UNTAGGED);
  const searched: string[] = [];
  const scripture = await prepareScripture(VICTORIOUS, 'hr', lookup, async (text) => {
    searched.push(text);
    return 'Romans 8:35-39';
  });

  assert.equal(searched.length, 1);
  assert.ok(searched[0].startsWith('Who shall separate us from the love of Christ?'));
  assert.ok(searched[0].endsWith('in Christ Jesus our Lord.'));
  assert.deepEqual(calls, [
    { lang: 'hr', refs: [] },
    { lang: 'hr', refs: ['Romans 8:35-39', 'Hebrews 2:14–15'] },
  ]);

  // Neither the reading nor the quotation of Hebrews reaches the model; the prayers do.
  assert.ok(!scripture.content.includes('Who shall separate us'));
  assert.ok(scripture.content.includes('# A Reading from the Letter of St. Paul to the Romans\n \n{{bible:1}}\n\n# Reflection'));
  assert.ok(scripture.content.includes('The Letter to the Hebrews states: “{{bible:2}}” ({{bible:3}}).'));
  assert.ok(scripture.content.includes('*O God, great and omnipotent judge'));
  assert.ok(scripture.content.includes('“O Death! Where is your victory?”'));
  // The frontmatter goes to the model as written.
  assert.ok(scripture.content.startsWith('---\ntitle: The Victorious Life\nsubtitle: November 28, 2026\nday: 29\nverse_tag:\n'));

  const { content, notices } = scripture.restore(scripture.content);
  assert.ok(content.includes('\nverse_tag: Rim 8,35-39\nhero: hero-november_2026\n\ndisciplines:\n  office_of_the_dead:\n    behavior: disable\n---\n'));
  assert.ok(content.includes('\n*Tko će nas rastaviti od Božje ljubavi? Kao što je pisano. Ali u svemu tome pobjeđujemo.*\n'));
  assert.ok(content.includes('states: “Budući da djeca zajednički imaju tijelo i krv. Tako izbavi one.” (Heb 2,14-15).'));
  assert.deepEqual(notices, [
    '"A Reading from the Letter of St. Paul to the Romans" had no verse_tag; by its text the reading is Romans 8:35-39, so it was filled from Rim 8,35-39 and verse_tag set to it. Check that it is the right passage.',
  ]);
});

test('a reading with no verse_tag whose text is not found is left to the model, with a notice', async () => {
  const { lookup } = fromTable(UNTAGGED);
  const scripture = await prepareScripture(VICTORIOUS, 'hr', lookup, async () => null);
  assert.ok(scripture.content.includes('*Who shall separate us from the love of Christ?'));
  const { content, notices } = scripture.restore(scripture.content);
  assert.ok(content.includes('\nverse_tag:\nhero:'));
  assert.deepEqual(notices, [
    '"A Reading from the Letter of St. Paul to the Romans" has no verse_tag and its text was not found in RSV-CE, so the AI translated the reading; check it against the official text and add the verse_tag.',
  ]);
});

test('a passage found by its text that is not the reading sets no verse_tag', async () => {
  const { lookup } = fromTable({ ...UNTAGGED, 'Romans 8:35-39': { ...UNTAGGED['Romans 8:35-39'], source: { text: HEBREWS_EN } } });
  const scripture = await prepareScripture(VICTORIOUS, 'hr', lookup, async () => 'Romans 8:35-39');
  const { content, notices } = scripture.restore(scripture.content);
  assert.ok(content.includes('*Who shall separate us from the love of Christ?'));
  assert.ok(content.includes('\nverse_tag:\nhero:'));
  assert.ok(notices[0].startsWith('Romans 8:35-39: the English reading does not match this passage in RSV-CE'));
});

test('a failed search for the reading still translates the rest', async () => {
  const { lookup } = fromTable(UNTAGGED);
  const scripture = await prepareScripture(VICTORIOUS, 'hr', lookup, async () => {
    throw new Error('connection refused');
  });
  assert.ok(scripture.content.includes('({{bible:2}})'));
  assert.ok(scripture.restore(scripture.content).notices[0].includes('its text was not found in RSV-CE'));
});

test('a day with a verse_tag is never searched by its text', async () => {
  const { lookup } = fromTable(API);
  await prepareScripture(day, 'hr', lookup, async () => assert.fail('searched'));
});

test('prepareScripture does not look for a reading by its text when the language has no Bible', async () => {
  let searched = 0;
  const scripture = await prepareScripture(VICTORIOUS, 'lt', bible(() => null).lookup, async () => {
    searched++;
    return 'Romans 8:35-39';
  });
  assert.equal(searched, 0);
  assert.deepEqual(scripture.restore('draft'), { content: 'draft', notices: [] });
});
