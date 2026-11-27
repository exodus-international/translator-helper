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

// Replies in the shape of the Responses API: a list of output items.
const toolCall = (id: string, name: string, args: unknown) => ({
  output: [{ type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) }],
});

const answer = (content: string) => ({
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: content }] }],
});

type InputItem = { role?: string; type?: string; content?: string; call_id?: string; name?: string; output?: string };
const inputOf = (body: Record<string, unknown>) => body.input as InputItem[];
const toolOutput = (body: Record<string, unknown>) => inputOf(body).find((i) => i.type === 'function_call_output')!;

/** A fetch that answers from a script and records what it was sent. */
function scripted(replies: Array<(body: Record<string, unknown>) => Response>) {
  const bodies: Array<Record<string, unknown>> = [];
  const urls: string[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    urls.push(String(url));
    bodies.push(body);
    const reply = replies[Math.min(bodies.length - 1, replies.length - 1)]!;
    return reply(body);
  }) as typeof fetch;
  return { fetchFn, bodies, urls };
}

async function collect(gen: AsyncGenerator<ChatEvent>) {
  const events: ChatEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const deps = (fetchFn: typeof fetch, bible: BibleBackend, logs: unknown[] = [], model = 'gpt-4o-mini'): ChatDeps => ({
  fetch: fetchFn,
  bible,
  // The endpoint AI Translate is configured with; the chat derives its own from it.
  env: { apiKey: 'test-key', endpoint: 'http://model.test/v1/chat/completions', model },
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
  const second = inputOf(bodies[1]!);
  assert.equal(second[0]!.role, 'system');
  // The model's own call goes back ahead of its result, or the result has nothing to answer.
  const call = second.find((i) => i.type === 'function_call')!;
  assert.deepEqual(call, { type: 'function_call', call_id: 'call_1', name: 'resolve_passages', arguments: '{"refs":["John 3:16"]}' });
  const tool = toolOutput(bodies[1]!);
  assert.equal(tool.call_id, 'call_1');
  assert.ok(second.indexOf(call) < second.indexOf(tool));
  const content = JSON.parse(tool.output!);
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

const sse = (events: unknown[]) =>
  new Response(events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  });

test('the request goes to the Responses endpoint, the only one where a reasoning model takes tools', async () => {
  const { fetchFn, bodies, urls } = scripted([() => json(answer('ok'))]);
  await collect(runBibleChat(ask('John 3:16'), deps(fetchFn, backend(), [], 'gpt-6.1-sol')));

  assert.deepEqual(urls, ['http://model.test/v1/responses']);
  const body = bodies[0]!;
  assert.deepEqual(body.reasoning, { effort: 'low' });
  // gpt-6 answers 400 to either of these.
  assert.equal('temperature' in body, false);
  assert.equal('reasoning_effort' in body, false);
  assert.equal('messages' in body, false);
  assert.equal(body.store, false);
  const tools = body.tools as Array<Record<string, unknown>>;
  assert.deepEqual(
    tools.map((t) => [t.type, t.name]),
    [
      ['function', 'resolve_passages'],
      ['function', 'search_bible'],
      ['function', 'get_chapter'],
      ['function', 'list_translations'],
    ],
  );
  assert.ok(tools.every((t) => typeof t.description === 'string' && typeof t.parameters === 'object' && !('function' in t)));
});

test('a gpt-4 model gets a temperature and no reasoning', async () => {
  const { fetchFn, bodies } = scripted([() => json(answer('ok'))]);
  await collect(runBibleChat(ask('John 3:16'), deps(fetchFn, backend())));
  assert.equal(bodies[0]!.temperature, 0.2);
  assert.equal('reasoning' in bodies[0]!, false);
});

test('a stream the model fails half way is an error, and the detail is only logged', async () => {
  const logs: unknown[] = [];
  const { fetchFn } = scripted([
    () =>
      sse([
        { type: 'response.output_text.delta', delta: 'Iv ' },
        { type: 'response.failed', response: { error: { code: 'server_error', message: 'upstream blew up' } } },
      ]),
  ]);
  const events = await collect(runBibleChat(ask('John 3:16'), deps(fetchFn, backend(), logs)));
  assert.deepEqual(
    events.map((e) => e.type),
    ['text', 'error', 'done'],
  );
  assert.doesNotMatch((events[1] as Extract<ChatEvent, { type: 'error' }>).message, /upstream/);
  assert.match(JSON.stringify(logs), /upstream blew up/);
});

test('streamed replies yield text as it arrives and assemble tool calls', async () => {
  const { fetchFn } = scripted([
    () =>
      sse([
        { type: 'response.created' },
        { type: 'response.function_call_arguments.delta', delta: '{"refs":' },
        { type: 'response.function_call_arguments.delta', delta: '["John 3:16"]}' },
        {
          type: 'response.output_item.done',
          item: { type: 'function_call', id: 'fc_1', call_id: 'c1', name: 'resolve_passages', arguments: '{"refs":["John 3:16"]}' },
        },
        { type: 'response.completed' },
      ]),
    () =>
      sse([
        { type: 'response.output_text.delta', delta: 'Iv ' },
        { type: 'response.output_text.delta', delta: '3,16' },
        { type: 'response.output_item.done', item: { type: 'message', content: [{ type: 'output_text', text: 'Iv 3,16' }] } },
        { type: 'response.completed' },
      ]),
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
  assert.match(toolOutput(bodies[1]!).output!, /Invalid arguments/);
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

test('a search shows the verses it found and sends them to the model', async () => {
  const searched: unknown[] = [];
  const bible = backend({
    search: async (translation, query, book) => {
      searched.push([translation, query, book]);
      return { translation: 'sar-hr', passages: [john316] };
    },
  });
  const { fetchFn, bodies } = scripted([
    () => json(toolCall('s1', 'search_bible', { query: 'ljubio svijet', book: 'JHN' })),
    () => json(answer('To je Iv 3,16.')),
  ]);

  const events = await collect(runBibleChat(ask('Where does it say God so loved the world?'), deps(fetchFn, bible)));

  assert.deepEqual(searched, [['sar-hr', 'ljubio svijet', 'JHN']]);
  assert.deepEqual(events[0], { type: 'tool', name: 'search_bible', args: { query: 'ljubio svijet', translation: 'sar-hr', book: 'JHN' } });
  const passages = events.find((e) => e.type === 'passages') as Extract<ChatEvent, { type: 'passages' }>;
  assert.equal(passages.passages[0]!.text, OFFICIAL);
  const tool = { content: toolOutput(bodies[1]!).output! };
  assert.equal(JSON.parse(tool.content).passages[0].citation, 'Iv 3,16');
});

test('a search that finds nothing tells the model so', async () => {
  const { fetchFn, bodies } = scripted([
    () => json(toolCall('s1', 'search_bible', { query: 'nepostojeća riječ' })),
    () => json(answer('Nema takvog retka.')),
  ]);

  const events = await collect(runBibleChat(ask('Find nepostojeća riječ'), deps(fetchFn, backend())));

  assert.equal(events.some((e) => e.type === 'passages' && e.passages.length > 0), false);
  const tool = { content: toolOutput(bodies[1]!).output! };
  assert.equal(JSON.parse(tool.content).note, 'No verse contains all of these words.');
});

test('a chapter goes to the model with verse numbers and to the UI as one passage', async () => {
  const chapter: PassageResult = {
    ...john316,
    ref: 'JHN 3',
    rendered: 'Iv 3',
    text: 'Prvi redak. Drugi redak.',
    verses: [
      { id: 'JHN.3.1', chapter: 3, verse: 1, text: 'Prvi redak.' },
      { id: 'JHN.3.2', chapter: 3, verse: 2, text: 'Drugi redak.' },
    ],
  };
  const asked: unknown[] = [];
  const bible = backend({
    chapter: async (translation, book, n) => {
      asked.push([translation, book, n]);
      return { translation: 'sar-hr', passage: chapter };
    },
  });
  const { fetchFn, bodies } = scripted([
    () => json(toolCall('c1', 'get_chapter', { book: 'JHN', chapter: 3 })),
    () => json(answer('Evo Ivana 3.')),
  ]);

  const events = await collect(runBibleChat(ask('Read John 3'), deps(fetchFn, bible)));

  assert.deepEqual(asked, [['sar-hr', 'JHN', 3]]);
  const passages = events.find((e) => e.type === 'passages') as Extract<ChatEvent, { type: 'passages' }>;
  assert.equal(passages.passages[0]!.text, 'Prvi redak. Drugi redak.');
  const tool = { content: toolOutput(bodies[1]!).output! };
  assert.equal(JSON.parse(tool.content).passages[0].text, '[1] Prvi redak. [2] Drugi redak.');
});
