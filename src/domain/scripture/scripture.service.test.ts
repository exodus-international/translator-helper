import assert from 'node:assert/strict';
import test from 'node:test';
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

test('prepareScripture says when the language has no Bible', async () => {
  const scripture = await prepareScripture(day, 'lt', bible(() => null).lookup);
  assert.equal(scripture.content, day);
  assert.deepEqual(scripture.restore('draft').notices, ['No Bible is imported for "lt", so the AI translated the Scripture.']);
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

test('applyVerseTag sets verse_tag, keeping its quotes, and leaves the body alone', () => {
  assert.equal(applyVerseTag('---\nverse_tag: "Jakov 2:1-4"\n---\n', 'Jak 2,1-4'), '---\nverse_tag: "Jak 2,1-4"\n---\n');
  assert.equal(applyVerseTag('---\nverse_tag:\n---\n', 'Jak 2,1-4'), '---\nverse_tag: Jak 2,1-4\n---\n');
  const body = '---\ntitle: T\n---\n\nverse_tag: James 2:1-4';
  assert.equal(applyVerseTag(body, 'Jak 2,1-4'), body);
});
