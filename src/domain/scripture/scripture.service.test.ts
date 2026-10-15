import assert from 'node:assert/strict';
import test from 'node:test';
import { applyVerseTag, findReadings, prepareScripture, similarity, type PassageResult } from './scripture.service';

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

async function withBibleApi<T>(respond: (body: { lang: string; refs: string[] }) => Response, run: () => Promise<T>) {
  const originalFetch = global.fetch;
  const env = { url: process.env.BIBLE_API_URL, token: process.env.BIBLE_API_TOKEN };
  process.env.BIBLE_API_URL = 'http://bible-api:3000/';
  process.env.BIBLE_API_TOKEN = 'secret';
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = (async (input: RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return respond(JSON.parse(String(init?.body)));
  }) as typeof fetch;
  try {
    return { result: await run(), calls };
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of [
      ['BIBLE_API_URL', env.url],
      ['BIBLE_API_TOKEN', env.token],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const fromTable = (table: Record<string, PassageResult>) => (body: { refs: string[] }) =>
  Response.json({ data: body.refs.map((ref) => table[ref] ?? { ref, status: 'unparseable', notes: [] }) });

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

test('prepareScripture swaps Scripture for placeholders and restores it from the Bible API', async () => {
  const { result: scripture, calls } = await withBibleApi(fromTable(API), () => prepareScripture(day, 'hr'));

  assert.equal(calls[0].url, 'http://bible-api:3000/v1/passages');
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, 'Bearer secret');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    lang: 'hr',
    refs: ['James 2:1-4', 'Psalm 46:10', 'Psalm 13:1', 'At 5:30'],
    include: { rendered: true, text: true, verses: true, source: true },
  });

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
    'Psalm 13:1: not in the Bible API (PSA 13 has no mapping yet.) -- the AI translated the citation; check it against the official text.',
  ]);
});

test('prepareScripture keeps a one-paragraph reading as one paragraph and escapes Markdown', async () => {
  const { result: scripture } = await withBibleApi(fromTable(API), () => prepareScripture(daily, 'hr'));
  const { content, notices } = scripture.restore(scripture.content);
  assert.ok(content.includes('<span style="display:block;color:#CC0000;">Jak 5,11-13</span>\n\n*Evo, blaženima zovemo postojane. Trpi li tko među vama? Neka moli \\*.*\n'));
  assert.ok(content.includes('*My brothers, you must realise'));
  assert.deepEqual(notices, []);
});

test('prepareScripture replaces a reading whole, elisions and plain paragraphs included', async () => {
  const elided = day.replace(`\n${JAMES_EN[1]}`, '*\n\n. . .\n\nAnd then:\n\n*' + JAMES_EN[1]);
  const { result: scripture } = await withBibleApi(fromTable(API), () => prepareScripture(elided, 'hr'));
  assert.ok(scripture.content.includes('# A Reading from the Letter of St. James\n\n{{bible:1}}\n\n# Reflection'));
  assert.ok(!scripture.content.includes('. . .'));
});

test('prepareScripture inserts the whole passage for a shortened reading and says so', async () => {
  const shortened = day.replace(`\n${JAMES_EN[2]}`, '');
  const { result: scripture } = await withBibleApi(fromTable(API), () => prepareScripture(shortened, 'hr'));
  const { content, notices } = scripture.restore(scripture.content);
  assert.ok(content.includes(JAMES_HR.join('\n')));
  assert.ok(notices[0].startsWith('James 2:1-4: the English reading is shortened or from another translation.'));
});

test('prepareScripture leaves a reading that is not the cited passage to the model', async () => {
  const other = day.replace(JAMES_EN.slice(1).join('\n'), 'Behold, how good and pleasant it is when brothers dwell in unity!');
  const { result: scripture } = await withBibleApi(fromTable(API), () => prepareScripture(other, 'hr'));
  assert.ok(scripture.content.includes('My brethren, show no partiality'));
  const { content, notices } = scripture.restore(scripture.content);
  assert.ok(content.includes('verse_tag: Jak 2,1-4'));
  assert.ok(notices[0].startsWith('James 2:1-4: the English reading does not match this passage in RSV-CE'));
});

test('restore reports placeholders the model dropped and removes ones it made up', async () => {
  const { result: scripture } = await withBibleApi(fromTable(API), () => prepareScripture(day, 'hr'));
  const output = scripture.content.replace('— {{bible:2}}', '— Psalam 46,10').replace('# Reflection', '# Reflection {{bible:9}}');
  const { content, notices } = scripture.restore(output);
  assert.ok(!content.includes('{{bible:'));
  assert.ok(notices.includes('The AI dropped Ps 46,11; add it where it belongs.'));
  assert.ok(notices.includes('The AI added Scripture placeholders that were not in the source; they were removed.'));
});

test('prepareScripture leaves Scripture to the model, with a notice, when the API fails', async () => {
  const { result: scripture } = await withBibleApi(
    () => new Response('{"error":{"code":"unauthorized"}}', { status: 401 }),
    () => prepareScripture(day, 'hr'),
  );
  assert.equal(scripture.content, day);
  assert.equal(scripture.prompt, '');
  assert.deepEqual(scripture.restore('draft'), {
    content: 'draft',
    notices: ['The Bible API could not be reached, so the AI translated the Scripture. Check it against the official text.'],
  });
});

test('prepareScripture says when the API has no Bible for the language', async () => {
  const { result: scripture } = await withBibleApi(
    (body) => Response.json({ data: body.refs.map((ref) => ({ ref, status: 'unknown_language', notes: [] })) }),
    () => prepareScripture(day, 'lt'),
  );
  assert.equal(scripture.content, day);
  assert.deepEqual(scripture.restore('draft').notices, ['The Bible API has no Bible for "lt", so the AI translated the Scripture.']);
});

test('prepareScripture does nothing when the API is not configured or the source has its own placeholders', async () => {
  delete process.env.BIBLE_API_URL;
  assert.deepEqual((await prepareScripture(day, 'hr')).restore('draft'), { content: 'draft', notices: [] });
  const { result, calls } = await withBibleApi(fromTable(API), () => prepareScripture(`${day}\n{{bible:1}}`, 'hr'));
  assert.equal(result.prompt, '');
  assert.equal(calls.length, 0);
});

test('applyVerseTag sets verse_tag, keeping its quotes, and leaves the body alone', () => {
  assert.equal(applyVerseTag('---\nverse_tag: "Jakov 2:1-4"\n---\n', 'Jak 2,1-4'), '---\nverse_tag: "Jak 2,1-4"\n---\n');
  assert.equal(applyVerseTag('---\nverse_tag:\n---\n', 'Jak 2,1-4'), '---\nverse_tag: Jak 2,1-4\n---\n');
  const body = '---\ntitle: T\n---\n\nverse_tag: James 2:1-4';
  assert.equal(applyVerseTag(body, 'Jak 2,1-4'), body);
});
