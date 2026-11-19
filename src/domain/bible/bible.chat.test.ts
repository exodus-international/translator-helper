import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHAT_LIMITS,
  capItems,
  runBibleChat,
  trimHistory,
  type BibleBackend,
  type ChatDeps,
  type ChatEvent,
} from './bible.chat';
import type { PassageResult } from './bible.types';

const OFFICIAL = 'Jer Bog je tako ljubio svijet da je dao svoga Sina jedinorođenoga.';

const john316: PassageResult = {
  ref: 'John 3:16',
  status: 'ok',
  translation: 'sar-hr',
  book: 'JHN',
  rendered: 'Iv 3,16',
  text: OFFICIAL,
  verses: [{ id: 'JHN.3.16', chapter: 3, verse: 16, text: OFFICIAL }],
  notes: [],
};

function backend(overrides: Partial<BibleBackend> = {}): BibleBackend & { resolved: Array<[string[], string]> } {
  const resolved: Array<[string[], string]> = [];
  return {
    resolved,
    translations: async () => [
      { code: 'rsvce-en', name: 'RSV-CE', language: 'en', languageName: 'English', role: 'source', isLanguageDefault: true },
      { code: 'sar-hr', name: 'Šarić', language: 'hr', languageName: 'Hrvatski', role: 'target', isLanguageDefault: true },
    ],
    resolve: async (refs, translation) => {
      resolved.push([refs, translation]);
      return { translation: 'sar-hr', results: refs.map((ref) => ({ ...john316, ref })) };
    },
    search: async () => ({ translation: 'sar-hr', passages: [] }),
    chapter: async () => ({ error: 'none' }),
    ...overrides,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const toolCall = (id: string, name: string, args: unknown) => ({
  choices: [
    {
      message: {
        content: null,
        tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
      },
    },
  ],
});

const answer = (content: string) => ({ choices: [{ message: { content } }] });

/** A fetch that answers from a script and records what it was sent. */
function scripted(replies: Array<(body: Record<string, unknown>) => Response>) {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    const reply = replies[Math.min(bodies.length - 1, replies.length - 1)]!;
    return reply(body);
  }) as typeof fetch;
  return { fetchFn, bodies };
}

async function collect(gen: AsyncGenerator<ChatEvent>) {
  const events: ChatEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const deps = (fetchFn: typeof fetch, bible: BibleBackend, logs: unknown[] = []): ChatDeps => ({
  fetch: fetchFn,
  bible,
  env: { apiKey: 'test-key', endpoint: 'http://model.test/v1/chat/completions', model: 'gpt-4o-mini' },
  log: (message, detail) => logs.push([message, detail]),
});

const ask = (content: string) => ({ messages: [{ role: 'user' as const, content }], translation: 'hr' });

test('a tool round trip sends the official passage to the UI and the tool result back to the model', async () => {
  const bible = backend();
  const { fetchFn, bodies } = scripted([
    () => json(toolCall('call_1', 'resolve_passages', { refs: ['John 3:16'] })),
    () => json(answer('Iv 3,16 je u Šarićevu prijevodu.')),
  ]);

  const events = await collect(runBibleChat(ask('Find John 3:16'), deps(fetchFn, bible)));

  assert.deepEqual(
    events.map((e) => e.type),
    ['tool', 'passages', 'text', 'done'],
  );
  // The UI's chosen language becomes the tool's translation.
  assert.deepEqual(events[0], { type: 'tool', name: 'resolve_passages', args: { refs: ['John 3:16'], translation: 'sar-hr' } });
  assert.deepEqual(bible.resolved, [[['John 3:16'], 'sar-hr']]);
  const passages = events[1] as Extract<ChatEvent, { type: 'passages' }>;
  assert.equal(passages.passages[0]!.text, OFFICIAL);

  assert.equal(bodies.length, 2);
  assert.ok(Array.isArray(bodies[0]!.tools));
  assert.equal(bodies[0]!.tool_choice, 'auto');
  const second = bodies[1]!.messages as Array<{ role: string; content: string | null; tool_call_id?: string }>;
  assert.equal(second[0]!.role, 'system');
  const tool = second.find((m) => m.role === 'tool')!;
  assert.equal(tool.tool_call_id, 'call_1');
  const content = JSON.parse(tool.content!);
  assert.equal(content.passages[0].citation, 'Iv 3,16');
  assert.equal(content.passages[0].text, OFFICIAL);
});

test('the loop stops calling tools after the round limit', async () => {
  const bible = backend();
  let n = 0;
  const { fetchFn, bodies } = scripted([() => json(toolCall(`call_${n++}`, 'resolve_passages', { refs: [`Ps ${n}`] }))]);

  const events = await collect(runBibleChat(ask('Keep looking'), deps(fetchFn, bible)));

  // Six rounds of tools, then one turn in which tools are refused.
  assert.equal(bodies.length, CHAT_LIMITS.maxToolRounds + 1);
  assert.equal(bible.resolved.length, CHAT_LIMITS.maxToolRounds);
  assert.equal(bodies[CHAT_LIMITS.maxToolRounds]!.tool_choice, 'none');
  assert.equal(events.filter((e) => e.type === 'tool').length, CHAT_LIMITS.maxToolRounds);
  assert.equal(events.at(-2)!.type, 'error');
  assert.deepEqual(events.at(-1), { type: 'done' });
});

test('a model error becomes a plain message; the upstream detail is only logged', async () => {
  const logs: unknown[] = [];
  const { fetchFn } = scripted([() => new Response('{"error":{"message":"Incorrect API key sk-live-123"}}', { status: 401 })]);

  const events = await collect(runBibleChat(ask('John 3:16'), deps(fetchFn, backend(), logs)));

  assert.deepEqual(
    events.map((e) => e.type),
    ['error', 'done'],
  );
  const error = events[0] as Extract<ChatEvent, { type: 'error' }>;
  assert.doesNotMatch(error.message, /sk-live|401|API key/);
  assert.match(JSON.stringify(logs), /sk-live-123/);
});

test('a network failure is reported the same way', async () => {
  const fetchFn = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  const events = await collect(runBibleChat(ask('John 3:16'), deps(fetchFn, backend(), [])));
  assert.deepEqual(
    events.map((e) => e.type),
    ['error', 'done'],
  );
});

test('streamed replies yield text as it arrives and assemble tool calls', async () => {
  const sse = (chunks: unknown[]) =>
    new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  const { fetchFn } = scripted([
    () =>
      sse([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'resolve_', arguments: '{"refs":' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'passages', arguments: '["John 3:16"]}' } }] } }] },
      ]),
    () => sse([{ choices: [{ delta: { content: 'Iv ' } }] }, { choices: [{ delta: { content: '3,16' } }] }]),
  ]);

  const events = await collect(runBibleChat(ask('John 3:16'), deps(fetchFn, backend())));

  assert.deepEqual(
    events.map((e) => (e.type === 'text' ? `text:${e.text}` : e.type)),
    ['tool', 'passages', 'text:Iv ', 'text:3,16', 'done'],
  );
});

test('invalid tool arguments go back to the model as an error, not to the UI', async () => {
  const { fetchFn, bodies } = scripted([
    () => json(toolCall('c1', 'get_chapter', { book: 'JHN', chapter: 'zero' })),
    () => json(answer('That chapter number is not valid.')),
  ]);
  const events = await collect(runBibleChat(ask('Read John'), deps(fetchFn, backend())));
  assert.deepEqual(
    events.map((e) => e.type),
    ['text', 'done'],
  );
  const tool = (bodies[1]!.messages as Array<{ role: string; content: string }>).find((m) => m.role === 'tool')!;
  assert.match(tool.content, /Invalid arguments/);
});

test('an unknown translation is refused before the model is called', async () => {
  const { fetchFn, bodies } = scripted([() => json(answer('never'))]);
  const events = await collect(runBibleChat({ ...ask('John 3:16'), translation: 'xx' }, deps(fetchFn, backend())));
  assert.equal(bodies.length, 0);
  assert.equal(events[0]!.type, 'error');
});

test('history keeps the last messages, starting with the translator', () => {
  const messages = Array.from({ length: 25 }, (_, i) => ({
    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: i === 24 ? 'x'.repeat(5000) : `m${i}`,
  }));
  const trimmed = trimHistory(messages);
  assert.ok(trimmed.length <= CHAT_LIMITS.maxHistory);
  assert.equal(trimmed[0]!.role, 'user');
  assert.equal(trimmed.at(-1)!.content.length, CHAT_LIMITS.maxUserChars + 1);
});

test('tool results are capped by count and size', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ text: `${i}`.padEnd(500, '.') }));
  const { items: kept, omitted } = capItems(items, 30, 4000);
  assert.ok(kept.length < 30);
  assert.equal(kept.length + omitted, 50);
  assert.ok(JSON.stringify(kept).length <= 4000 + kept.length);
});
