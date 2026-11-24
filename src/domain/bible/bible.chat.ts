import { z } from 'zod';
import type { PassageResult } from './bible.types';

/**
 * The Scripture chat: a tool loop over the chat completions endpoint the AI
 * translation already uses (CHATGPT_API, CHATGPT_API_BASE_URL, CHATGPT_MODEL).
 * The model never sees the database; it calls tools that run here, and every
 * passage a tool returns is handed to the UI as it came from the Bible, so the
 * cards show the official text whatever the model writes around them.
 */

export const CHAT_LIMITS = {
  /** Model turns that may call tools; one more turn without tools follows. */
  maxToolRounds: 6,
  maxHistory: 20,
  maxUserChars: 4000,
  maxAssistantChars: 8000,
  maxRefsPerCall: 12,
  searchLimit: 20,
  /** What one tool result may put in front of the model. */
  maxPassagesPerResult: 30,
  maxToolResultChars: 12_000,
  requestTimeoutMs: 45_000,
} as const;

const TOOL_NAMES = ['resolve_passages', 'search_bible', 'get_chapter', 'list_translations'] as const;
export type ChatToolName = (typeof TOOL_NAMES)[number];

export type ChatEvent =
  | { type: 'tool'; name: ChatToolName; args: Record<string, unknown> }
  | { type: 'passages'; tool: ChatToolName; passages: PassageResult[] }
  | { type: 'text'; text: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatTranslation {
  code: string;
  name: string;
  language: string;
  languageName: string;
  role: 'source' | 'target';
  isLanguageDefault: boolean;
}

/** What the tools read. The default goes to the in-app Bible; tests pass their own. */
export interface BibleBackend {
  translations(): Promise<ChatTranslation[]>;
  resolve(refs: string[], translation: string): Promise<{ translation: string | null; results: PassageResult[] }>;
  search(translation: string, query: string, book?: string): Promise<{ translation: string; passages: PassageResult[] } | { error: string }>;
  chapter(translation: string, book: string, chapter: number): Promise<{ translation: string; passage: PassageResult } | { error: string }>;
}

export interface ChatDeps {
  fetch?: typeof fetch;
  bible?: BibleBackend;
  /** Aborts the run when the client goes away. */
  signal?: AbortSignal;
  env?: { apiKey?: string; endpoint?: string; model?: string };
  log?: (message: string, detail?: unknown) => void;
  timeoutMs?: number;
}

/** A failure whose message is safe to show; the detail stays in the server log. */
class ChatFailure extends Error {
  constructor(
    readonly publicMessage: string,
    readonly detail?: unknown,
  ) {
    super(publicMessage);
  }
}

const UNAVAILABLE = 'The assistant could not answer right now. Try again in a moment.';

// ---------------------------------------------------------------------------
// Tools

const translationArg = z.string().trim().min(2).max(40).optional();

const toolArgs = {
  resolve_passages: z.object({
    refs: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
    translation: translationArg,
  }),
  search_bible: z.object({
    query: z.string().trim().min(2).max(200),
    translation: translationArg,
    book: z.string().trim().min(1).max(60).optional(),
  }),
  get_chapter: z.object({
    book: z.string().trim().min(1).max(60),
    chapter: z.coerce.number().int().min(1).max(200),
    translation: translationArg,
  }),
  list_translations: z.object({}).passthrough(),
} satisfies Record<ChatToolName, z.ZodType>;

const translationProperty = {
  type: 'string',
  description:
    'Translation code ("sar-hr") or language code ("hr", "en" for RSV-CE). Leave out to use the translator\'s chosen Bible.',
};

const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'resolve_passages',
      description:
        'Look up Bible passages by reference and return the official text in a translation. References are read in RSV-CE (English) numbering and mapped to the translation\'s versification. Each result has a status; only "ok" and "partial" carry text.',
      parameters: {
        type: 'object',
        properties: {
          refs: {
            type: 'array',
            items: { type: 'string' },
            maxItems: CHAT_LIMITS.maxRefsPerCall,
            description: 'References in English notation, e.g. "John 3:16", "1 Cor 13:4-7", "Ps 23", "Matt 5:3-12".',
          },
          translation: translationProperty,
        },
        required: ['refs'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_bible',
      description:
        'Find verses containing words, in the translation\'s own language. Every word matches as a word prefix; accents are ignored. Returns at most 20 verses with their citations.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words in the translation\'s language, e.g. "ljubav strpljiva".' },
          translation: translationProperty,
          book: { type: 'string', description: 'Optional book to search in, e.g. "JHN", "John" or "1CO".' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_chapter',
      description: 'Read one whole chapter of a translation, in that translation\'s own chapter numbering.',
      parameters: {
        type: 'object',
        properties: {
          book: { type: 'string', description: 'Book as a USFM code ("JHN", "PSA", "1CO") or a name.' },
          chapter: { type: 'integer', minimum: 1 },
          translation: translationProperty,
        },
        required: ['book', 'chapter'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_translations',
      description: 'List the Bible translations imported in this app, with their codes and languages.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
];

function buildSystemPrompt(chosen: ChatTranslation | undefined, key: string): string {
  const bible = chosen
    ? `The translator's chosen Bible is ${chosen.name} (code ${chosen.code}, ${chosen.languageName}). Tools use it unless you pass another translation.`
    : `The translator asked for the Bible "${key}", which is not imported. Tell them and offer the translations list_translations returns.`;
  return [
    'You help Catholic translators find and check Bible passages for the documents they translate.',
    bible,
    'Rules:',
    '- Never quote, paraphrase or reconstruct Scripture from memory. Quote only text that a tool returned in this conversation. If you have no tool result for a passage, look it up first, or say you could not.',
    '- The app shows every passage a tool returns as a card with the official text, so do not repeat long passages; name them by citation and quote at most a short phrase when it helps.',
    '- Cite passages in the notation of the translation they come from: use the "citation" field the tools return (for example "Iv 3,16" in Croatian), not English notation.',
    '- resolve_passages reads references in RSV-CE numbering; write them in English notation ("John 3:16"). The app maps them to the translation\'s own verse numbering.',
    '- When a result is not "ok", say so plainly and give the reason from its notes. "versification_unmapped" means the verse numbering of that place has not been mapped for this translation yet, so the app will not guess; never offer a nearby verse instead.',
    '- search_bible matches words in the translation\'s own language. To find a passage from an English phrase, search with translation "en" (RSV-CE), then resolve the references you found into the chosen translation.',
    '- Answer in the language the translator writes in. Be brief and practical.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// The model

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

type ApiMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

interface ModelReply {
  content: string;
  toolCalls: ToolCall[];
}

function modelConfig(deps: ChatDeps) {
  const env = deps.env ?? {};
  return {
    apiKey: env.apiKey ?? process.env.CHATGPT_API,
    endpoint:
      (env.endpoint ?? process.env.CHATGPT_API_BASE_URL)?.replace(/\/$/, '') || 'https://api.openai.com/v1/chat/completions',
    model: env.model ?? (process.env.CHATGPT_MODEL || 'gpt-4o-mini'),
  };
}

/** One model turn. Yields text as it streams and returns the whole reply. */
async function* callModel(
  messages: ApiMessage[],
  toolChoice: 'auto' | 'none',
  deps: ChatDeps,
): AsyncGenerator<ChatEvent, ModelReply> {
  const { apiKey, endpoint, model } = modelConfig(deps);
  if (!apiKey) throw new ChatFailure('The assistant is not set up on this server.', 'CHATGPT_API is not set');

  const timeout = AbortSignal.timeout(deps.timeoutMs ?? CHAT_LIMITS.requestTimeoutMs);
  const signal = deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout;
  const body = {
    model,
    messages,
    tools: CHAT_TOOLS,
    tool_choice: toolChoice,
    stream: true,
    ...(model.includes('gpt-5') ? { reasoning_effort: 'low' as const } : { temperature: 0.2 }),
  };

  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw abortFailure(error, deps, timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new ChatFailure(
      response.status === 429 ? 'The assistant is busy. Try again in a minute.' : UNAVAILABLE,
      `model request failed: ${response.status} ${detail.slice(0, 500)}`,
    );
  }

  try {
    if (response.headers.get('content-type')?.includes('text/event-stream') && response.body) {
      return yield* readStream(response.body);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
    };
    const message = payload.choices?.[0]?.message;
    if (!message) throw new ChatFailure(UNAVAILABLE, 'model reply had no message');
    const content = message.content ?? '';
    if (content) yield { type: 'text', text: content };
    return { content, toolCalls: message.tool_calls ?? [] };
  } catch (error) {
    throw abortFailure(error, deps, timeout);
  }
}

function abortFailure(error: unknown, deps: ChatDeps, timeout: AbortSignal): unknown {
  if (error instanceof ChatFailure) return error;
  if (deps.signal?.aborted) return error;
  if (timeout.aborted) return new ChatFailure('The assistant took too long. Try a narrower question.', error);
  return new ChatFailure(UNAVAILABLE, error);
}

/** Server-sent chat completion chunks: text deltas and tool calls assembled by index. */
async function* readStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent, ModelReply> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const calls: ToolCall[] = [];
  let content = '';
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = done ? '' : (lines.pop() ?? '');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let chunk: {
        choices?: Array<{
          delta?: {
            content?: string | null;
            tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>;
          };
        }>;
      };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) {
        content += delta.content;
        yield { type: 'text', text: delta.content };
      }
      for (const part of delta?.tool_calls ?? []) {
        const i = part.index ?? calls.length;
        const call = (calls[i] ??= { id: '', type: 'function', function: { name: '', arguments: '' } });
        if (part.id) call.id = part.id;
        if (part.function?.name) call.function.name += part.function.name;
        if (part.function?.arguments) call.function.arguments += part.function.arguments;
      }
    }
    if (done) break;
  }
  return { content, toolCalls: calls.filter(Boolean) };
}

// ---------------------------------------------------------------------------
// Tool results

/** What the model reads about a passage; the UI gets the full PassageResult. */
function passageForModel(p: PassageResult) {
  return {
    ref: p.ref,
    status: p.status,
    ...(p.translation && { translation: p.translation }),
    ...(p.rendered && { citation: p.rendered }),
    ...(p.text && { text: p.text }),
    ...(p.notes.length > 0 && { notes: p.notes }),
    ...(p.source?.rendered && { source_citation: p.source.rendered }),
    ...(p.source?.text && { source_text: p.source.text }),
  };
}

/** Keeps a tool result inside the item and character budget, saying what was left out. */
export function capItems<T>(items: T[], maxItems: number, maxChars: number): { items: T[]; omitted: number } {
  const out: T[] = [];
  let size = 0;
  for (const item of items.slice(0, maxItems)) {
    const length = JSON.stringify(item).length + 1;
    if (out.length > 0 && size + length > maxChars) break;
    out.push(item);
    size += length;
  }
  return { items: out, omitted: items.length - out.length };
}

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function encodeResult(value: Record<string, unknown>): string {
  const json = JSON.stringify(value);
  // A single passage longer than the budget (a long chapter) is cut, not dropped.
  return json.length > CHAT_LIMITS.maxToolResultChars ? clip(json, CHAT_LIMITS.maxToolResultChars) : json;
}

function passagesResult(translation: string | null, passages: PassageResult[], extra: Record<string, unknown> = {}) {
  const budget = CHAT_LIMITS.maxToolResultChars - 400;
  const shaped = passages.map((p) => {
    const m = passageForModel(p);
    if (m.text) m.text = clip(m.text, budget);
    if (m.source_text) m.source_text = clip(m.source_text, 1500);
    return m;
  });
  const { items, omitted } = capItems(shaped, CHAT_LIMITS.maxPassagesPerResult, budget);
  return encodeResult({
    translation,
    passages: items,
    ...extra,
    ...(omitted > 0 && { omitted, note: `${omitted} more results were left out; ask for fewer at a time.` }),
  });
}

interface ToolOutcome {
  content: string;
  passages: PassageResult[];
}

async function runTool(
  name: string,
  rawArgs: string,
  defaultTranslation: string,
  bible: BibleBackend,
): Promise<{ event?: ChatEvent; outcome: ToolOutcome }> {
  const fail = (error: string): { outcome: ToolOutcome } => ({
    outcome: { content: JSON.stringify({ error }), passages: [] },
  });
  if (!(TOOL_NAMES as readonly string[]).includes(name)) return fail(`There is no tool called "${name}".`);
  const tool = name as ChatToolName;

  let json: unknown;
  try {
    json = rawArgs.trim() ? JSON.parse(rawArgs) : {};
  } catch {
    return fail('The arguments were not valid JSON.');
  }
  const parsed = toolArgs[tool].safeParse(json);
  if (!parsed.success) return fail(`Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);

  switch (tool) {
    case 'resolve_passages': {
      const args = parsed.data as z.infer<typeof toolArgs.resolve_passages>;
      const translation = args.translation ?? defaultTranslation;
      const refs = args.refs.slice(0, CHAT_LIMITS.maxRefsPerCall);
      const event: ChatEvent = { type: 'tool', name: tool, args: { refs, translation } };
      const { translation: code, results } = await bible.resolve(refs, translation);
      const extra =
        args.refs.length > refs.length
          ? { note: `Only the first ${refs.length} references were looked up; ask for the rest separately.` }
          : {};
      return { event, outcome: { content: passagesResult(code, results, extra), passages: results } };
    }
    case 'search_bible': {
      const args = parsed.data as z.infer<typeof toolArgs.search_bible>;
      const translation = args.translation ?? defaultTranslation;
      const event: ChatEvent = {
        type: 'tool',
        name: tool,
        args: { query: args.query, translation, ...(args.book && { book: args.book }) },
      };
      const found = await bible.search(translation, args.query, args.book);
      if ('error' in found) return { event, outcome: { content: JSON.stringify({ error: found.error }), passages: [] } };
      const extra = found.passages.length === 0 ? { note: 'No verse contains all of these words.' } : {};
      return { event, outcome: { content: passagesResult(found.translation, found.passages, extra), passages: found.passages } };
    }
    case 'get_chapter': {
      const args = parsed.data as z.infer<typeof toolArgs.get_chapter>;
      const translation = args.translation ?? defaultTranslation;
      const event: ChatEvent = { type: 'tool', name: tool, args: { book: args.book, chapter: args.chapter, translation } };
      const found = await bible.chapter(translation, args.book, args.chapter);
      if ('error' in found) return { event, outcome: { content: JSON.stringify({ error: found.error }), passages: [] } };
      const p = found.passage;
      // The chapter goes to the model verse-numbered, so it can cite single verses.
      const text = p.verses?.map((v) => `[${v.verse}${v.verse_end ? `-${v.verse_end}` : ''}] ${v.text}`).join(' ');
      return {
        event,
        outcome: { content: passagesResult(found.translation, [{ ...p, text: text ?? p.text }]), passages: [p] },
      };
    }
    case 'list_translations': {
      const event: ChatEvent = { type: 'tool', name: tool, args: {} };
      const translations = await bible.translations();
      return {
        event,
        outcome: {
          content: JSON.stringify({
            translations: translations.map((t) => ({
              code: t.code,
              name: t.name,
              language: t.language,
              languageName: t.languageName,
              role: t.role === 'source' ? 'source (references are written against it)' : 'target',
              default_for_language: t.isLanguageDefault,
            })),
          }),
          passages: [],
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// The loop

/** The last messages, starting with the translator's and capped in length. */
export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages.slice(-CHAT_LIMITS.maxHistory);
  while (recent.length > 0 && recent[0]!.role !== 'user') recent.shift();
  return recent.map((m) => ({
    role: m.role,
    content: clip(m.content, m.role === 'user' ? CHAT_LIMITS.maxUserChars : CHAT_LIMITS.maxAssistantChars),
  }));
}

const passageKey = (p: PassageResult) => `${p.translation ?? ''}|${p.rendered ?? p.ref}|${p.status}`;

/**
 * Runs one assistant turn. Always ends with `done`; a failure comes as an
 * `error` event with a message fit for the translator, and the cause is logged.
 */
export async function* runBibleChat(
  input: { messages: ChatMessage[]; translation: string },
  deps: ChatDeps = {},
): AsyncGenerator<ChatEvent> {
  const log = deps.log ?? ((message: string, detail?: unknown) => console.error(`[Bible chat] ${message}`, detail ?? ''));
  try {
    const history = trimHistory(input.messages);
    if (history.length === 0 || history[history.length - 1]!.role !== 'user') {
      yield { type: 'error', message: 'Ask a question to start.' };
      return;
    }
    const bible = deps.bible ?? (await serviceBackend());
    const translations = await bible.translations();
    const key = input.translation.trim().toLowerCase();
    const chosen =
      translations.find((t) => t.code === key) ??
      translations.find((t) => t.language === key && t.isLanguageDefault) ??
      translations.find((t) => t.language === key);
    if (!chosen) {
      yield { type: 'error', message: `No Bible is imported for "${input.translation}".` };
      return;
    }

    const messages: ApiMessage[] = [{ role: 'system', content: buildSystemPrompt(chosen, key) }, ...history];
    const shown = new Set<string>();

    for (let round = 0; ; round++) {
      const last = round >= CHAT_LIMITS.maxToolRounds;
      const reply = yield* callModel(messages, last ? 'none' : 'auto', deps);
      if (reply.toolCalls.length === 0) return;
      if (last) {
        yield { type: 'error', message: 'The assistant stopped after too many lookups. Ask a narrower question.' };
        return;
      }
      // Text written before a lookup ("Let me check…") is its own paragraph.
      if (reply.content.trim()) yield { type: 'text', text: '\n\n' };
      messages.push({ role: 'assistant', content: reply.content || null, tool_calls: reply.toolCalls });
      for (const call of reply.toolCalls) {
        let result: Awaited<ReturnType<typeof runTool>>;
        try {
          result = await runTool(call.function.name, call.function.arguments, chosen.code, bible);
        } catch (error) {
          log(`tool ${call.function.name} failed`, error);
          result = { outcome: { content: JSON.stringify({ error: 'The lookup failed.' }), passages: [] } };
        }
        if (result.event) yield result.event;
        const fresh = result.outcome.passages.filter((p) => {
          const k = passageKey(p);
          if (shown.has(k)) return false;
          shown.add(k);
          return true;
        });
        if (fresh.length > 0 && result.event?.type === 'tool') {
          yield { type: 'passages', tool: result.event.name, passages: fresh.slice(0, CHAT_LIMITS.maxPassagesPerResult) };
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: result.outcome.content });
      }
    }
  } catch (error) {
    if (deps.signal?.aborted) return;
    if (error instanceof ChatFailure) {
      log(error.publicMessage, error.detail);
      yield { type: 'error', message: error.publicMessage };
    } else {
      log('unexpected failure', error);
      yield { type: 'error', message: UNAVAILABLE };
    }
  } finally {
    if (!deps.signal?.aborted) yield { type: 'done' };
  }
}

// ---------------------------------------------------------------------------
// The in-app Bible

/** Loaded lazily so the loop can be tested without a database. */
async function serviceBackend(): Promise<BibleBackend> {
  const service = await import('./bible.service');
  const { referenceFormat, renderReference } = await import('./lib/render');

  const target = async (key: string) => {
    const index = await service.getBibleIndex();
    const tr = index.findTranslation(key);
    return tr ? { index, tr } : null;
  };
  const notFound = (key: string) => ({ error: `No Bible is imported for "${key}". Call list_translations.` });

  return {
    async translations() {
      return (await service.listTranslations()).map((t) => ({
        code: t.code,
        name: t.name,
        language: t.language,
        languageName: t.languageName,
        role: t.role,
        isLanguageDefault: t.isLanguageDefault,
      }));
    },

    resolve: (refs, translation) => service.resolvePassages(refs, translation, { source: true }),

    async search(key, query, bookName) {
      const found = await target(key);
      if (!found) return notFound(key);
      const { index, tr } = found;
      const usfm = bookName ? index.resolveBook(bookName, tr) : undefined;
      if (bookName && !usfm) return { error: `Unknown book "${bookName}".` };
      const result = await service.searchBible(tr.code, query, { book: usfm ?? undefined, limit: CHAT_LIMITS.searchLimit });
      if (!result) return notFound(key);
      const format = referenceFormat(tr.language);
      return {
        translation: tr.code,
        passages: result.results.map((hit): PassageResult => {
          const single = index.findBook(tr, hit.book)?.chapterCount === 1;
          const rendered = renderReference(
            hit.abbreviation,
            [{ chapter: hit.chapter, ranges: [{ from: hit.verse, to: hit.verse_end ?? hit.verse }] }],
            format,
            single,
          );
          return {
            ref: rendered,
            status: 'ok',
            translation: tr.code,
            book: hit.book,
            rendered,
            text: hit.text,
            verses: [
              {
                id: hit.id,
                chapter: hit.chapter,
                verse: hit.verse,
                ...(hit.verse_end && { verse_end: hit.verse_end }),
                text: hit.text,
              },
            ],
            notes: [],
          };
        }),
      };
    },

    async chapter(key, bookName, chapter) {
      const found = await target(key);
      if (!found) return notFound(key);
      const { index, tr } = found;
      const usfm = index.resolveBook(bookName, tr);
      const book = usfm ? index.findBook(tr, usfm) : undefined;
      if (!book) return { error: `${tr.name} has no book "${bookName}".` };
      if (chapter > book.chapterCount) {
        return { error: `${book.name} has ${book.chapterCount} chapter${book.chapterCount === 1 ? '' : 's'} in ${tr.name}.` };
      }
      const data = await service.getChapter(tr.code, book.usfm, chapter);
      if (!data) return { error: `${book.name} ${chapter} has no text in ${tr.name}.` };
      const rendered = renderReference(book.abbreviation, [{ chapter, ranges: [] }], referenceFormat(tr.language), book.chapterCount === 1);
      return {
        translation: tr.code,
        passage: {
          ref: rendered,
          status: 'ok',
          translation: tr.code,
          book: book.usfm,
          rendered,
          text: data.verses.map((v) => v.text).join(' '),
          verses: data.verses.map((v) => ({ ...v, chapter })),
          notes: [],
        },
      };
    },
  };
}
