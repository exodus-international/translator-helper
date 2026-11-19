'use client';

import { ArrowUp, BookOpenText, Check, CircleAlert, LoaderCircle, RotateCcw, Square, SquarePen } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MarkdownPreview } from '@/components/markdown-preview';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { listBibleTranslationsAction } from '@/domain/bible/bible.actions';
import { cn } from '@/lib/utils';
import {
  activityLabel,
  ChatRequestError,
  findTranslation,
  shortTranslationName,
  streamChat,
  type ChatMessage,
  type ChatToolName,
  type ChatTranslation,
  type PassageResult,
} from './chat-client';
import { PassageCard } from './passage-card';

/** Matches the server's per-message cap (CHAT_LIMITS.maxUserChars). */
const MAX_QUESTION_CHARS = 4000;
/** Search can return twenty verses; the rest wait behind a button. */
const SEARCH_PREVIEW = 3;

const STARTERS = [
  'Find John 3:16 and 1 Cor 13:4-7',
  'Read Psalm 23',
  'Where does Jesus say “Do not be afraid”?',
  'Does Matthew 5:3-12 map cleanly into this translation?',
];

// Compact Markdown for answers; `.prose` spacing is sized for documents.
const ANSWER_CLASSES = [
  'text-sm leading-relaxed',
  '[&_p]:my-1.5 [&_p:first-child]:mt-0',
  '[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:my-0.5',
  '[&_a]:font-medium [&_a]:underline',
  '[&_strong]:font-semibold',
  '[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs',
].join(' ');

interface UserTurn {
  id: string;
  role: 'user';
  content: string;
}

interface AssistantTurn {
  id: string;
  role: 'assistant';
  text: string;
  activity: string[];
  /** A lookup is running: no text has come since the last tool call. */
  lookingUp: boolean;
  groups: Array<{ tool: ChatToolName; passages: PassageResult[] }>;
  status: 'streaming' | 'done' | 'stopped' | 'error';
  error?: string;
}

type Turn = UserTurn | AssistantTurn;

let nextId = 0;
const newId = () => `turn-${++nextId}`;

function history(turns: Turn[]): ChatMessage[] {
  return turns.flatMap((t): ChatMessage[] =>
    t.role === 'user' ? [{ role: 'user', content: t.content }] : t.text.trim() ? [{ role: 'assistant', content: t.text }] : [],
  );
}

function defaultTranslation(translations: ChatTranslation[]) {
  return (
    translations.find((t) => t.role === 'target' && t.isLanguageDefault) ??
    translations.find((t) => t.role === 'target') ??
    translations[0]
  );
}

function PassageGroup({
  group,
  chosen,
  translations,
  onInsert,
}: {
  group: AssistantTurn['groups'][number];
  chosen: string | undefined;
  translations: ChatTranslation[];
  onInsert?: (text: string) => void;
}) {
  const [all, setAll] = useState(false);
  const limit = group.tool === 'search_bible' && !all ? SEARCH_PREVIEW : group.passages.length;
  const hidden = group.passages.length - limit;
  const source = translations.find((t) => t.role === 'source');
  const sourceName = source ? shortTranslationName(source) : 'RSV-CE';
  return (
    <div className="space-y-2">
      {group.passages.slice(0, limit).map((p, i) => {
        const tr = p.translation ? findTranslation(translations, p.translation) : undefined;
        return (
          <PassageCard
            key={`${p.translation}|${p.rendered ?? p.ref}|${i}`}
            passage={p}
            sourceName={sourceName}
            translationName={tr && tr.code !== chosen ? shortTranslationName(tr) : undefined}
            onInsert={onInsert}
          />
        );
      })}
      {hidden > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setAll(true)} className="text-muted-foreground">
          Show {hidden} more {hidden === 1 ? 'match' : 'matches'}
        </Button>
      )}
    </div>
  );
}

function AssistantMessage({
  turn,
  chosen,
  translations,
  onInsert,
  onRetry,
}: {
  turn: AssistantTurn;
  chosen: string | undefined;
  translations: ChatTranslation[];
  onInsert?: (text: string) => void;
  onRetry?: () => void;
}) {
  const working = turn.status === 'streaming';
  const waiting = working && !turn.text && turn.activity.length === 0;
  return (
    <div className="space-y-3">
      {(turn.activity.length > 0 || waiting) && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {waiting && (
            <li className="flex items-center gap-1.5">
              <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              Thinking
            </li>
          )}
          {turn.activity.map((label, i) => {
            const current = working && turn.lookingUp && i === turn.activity.length - 1;
            return (
              <li key={i} className="flex items-center gap-1.5">
                {current ? (
                  <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <Check className="size-3.5" aria-hidden />
                )}
                <span className="min-w-0 truncate">
                  {label}
                  {current ? '…' : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {turn.text && <MarkdownPreview content={turn.text} className={ANSWER_CLASSES} />}

      {turn.groups.map((group, i) => (
        <PassageGroup key={i} group={group} chosen={chosen} translations={translations} onInsert={onInsert} />
      ))}

      {turn.status === 'stopped' && <p className="text-xs text-muted-foreground">Stopped.</p>}
      {turn.status === 'error' && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          <span>{turn.error}</span>
          {onRetry && (
            <Button variant="outline" size="xs" onClick={onRetry}>
              <RotateCcw />
              Try again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export interface BibleChatProps {
  /** Language code ("hr") or translation code ("sar-hr") to start with. */
  translation?: string;
  /** When given, passage cards offer Insert, which hands over the text and its citation. */
  onInsert?: (text: string) => void;
  /** Tighter spacing for a side panel. */
  compact?: boolean;
}

/**
 * Ask for passages or search Scripture in plain language. The answer streams
 * from /api/bible/chat; every passage the assistant looked up is shown as a
 * card with the official text from the in-app Bible.
 */
export function BibleChat({ translation, onInsert, compact = false }: BibleChatProps) {
  const [translations, setTranslations] = useState<ChatTranslation[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let live = true;
    listBibleTranslationsAction()
      .then((list) => live && setTranslations(list))
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const list = useMemo(() => translations ?? [], [translations]);
  const chosen = (picked && findTranslation(list, picked)) || findTranslation(list, translation) || defaultTranslation(list);
  const busy = turns.at(-1)?.role === 'assistant' && (turns.at(-1) as AssistantTurn).status === 'streaming';

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const send = useCallback(
    async (question: string, base: Turn[]) => {
      const q = question.trim().slice(0, MAX_QUESTION_CHARS);
      if (!q || !chosen) return;
      const assistantId = newId();
      setTurns([
        ...base,
        { id: newId(), role: 'user', content: q },
        {
          id: assistantId,
          role: 'assistant',
          text: '',
          activity: [],
          lookingUp: false,
          groups: [],
          status: 'streaming',
        },
      ]);
      setDraft('');
      stickRef.current = true;

      const update = (fn: (turn: AssistantTurn) => AssistantTurn) =>
        setTurns((current) => current.map((t) => (t.id === assistantId && t.role === 'assistant' ? fn(t) : t)));

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const events = streamChat(
          { messages: [...history(base), { role: 'user', content: q }], translation: chosen.code },
          controller.signal,
        );
        let finished = false;
        for await (const event of events) {
          switch (event.type) {
            case 'tool': {
              const label = activityLabel(event.name, event.args, list);
              setAnnouncement(label);
              update((t) => ({ ...t, activity: [...t.activity, label], lookingUp: true }));
              break;
            }
            case 'passages':
              update((t) => ({ ...t, groups: [...t.groups, { tool: event.tool, passages: event.passages }] }));
              break;
            case 'text':
              update((t) => ({ ...t, text: t.text + event.text, lookingUp: false }));
              break;
            case 'error':
              update((t) => ({ ...t, status: 'error', error: event.message }));
              break;
            case 'done':
              finished = true;
              break;
          }
        }
        if (!finished) throw new Error('The answer stream ended early.');
        update((t) => (t.status === 'streaming' ? { ...t, status: 'done' } : t));
        setAnnouncement('Answer ready');
      } catch (error) {
        if (controller.signal.aborted) {
          update((t) => ({ ...t, status: 'stopped' }));
        } else {
          const message =
            error instanceof ChatRequestError
              ? error.message
              : 'The connection dropped before the answer finished. Try again.';
          update((t) => ({ ...t, status: 'error', error: message }));
          setAnnouncement(message);
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [chosen, list],
  );

  const submit = () => {
    if (!busy) void send(draft, turns);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const retry = () => {
    const lastUser = turns.findLastIndex((t) => t.role === 'user');
    if (lastUser < 0 || busy) return;
    void send((turns[lastUser] as UserTurn).content, turns.slice(0, lastUser));
  };

  const reset = () => {
    abortRef.current?.abort();
    setTurns([]);
    setDraft('');
    inputRef.current?.focus();
  };

  const gutter = compact ? 'px-3' : 'px-4';
  const column = compact ? '' : 'mx-auto w-full max-w-3xl';

  const selector =
    translations === null ? (
      <Skeleton className="h-8 w-48" />
    ) : (
      <Select
        value={chosen?.code ?? null}
        onValueChange={(next) => {
          if (typeof next === 'string') setPicked(next);
        }}
        items={Object.fromEntries(list.map((t) => [t.code, `${shortTranslationName(t)} (${t.languageName})`]))}
      >
        <SelectTrigger size="sm" aria-label="Bible translation" className="max-w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectGroup>
            {list.map((t) => (
              <SelectItem key={t.code} value={t.code}>
                {shortTranslationName(t)} ({t.languageName})
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    );

  if (loadFailed || (translations !== null && list.length === 0)) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpenText />
          </EmptyMedia>
          <EmptyTitle>{loadFailed ? 'The Bibles could not be loaded' : 'No Bible is imported yet'}</EmptyTitle>
          <EmptyDescription>
            {loadFailed
              ? 'Reload the page to try again.'
              : 'An administrator imports Bible translations under Admin, Bible. The assistant works once one is there.'}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn('flex shrink-0 items-center gap-2 border-b py-2', gutter)}>
        <div className={cn('flex min-w-0 flex-1 items-center gap-2', column)}>
          {selector}
          {turns.length > 0 && (
            <Button variant="ghost" size="sm" onClick={reset} className="ml-auto">
              <SquarePen />
              New chat
            </Button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className={cn('space-y-6 py-4', gutter, column)}>
          {turns.length === 0 ? (
            <div className={cn('space-y-4', compact ? 'pt-2' : 'pt-8')}>
              <div className="space-y-1">
                <h2 className={cn('font-semibold text-balance', compact ? 'text-base' : 'text-lg')}>
                  Find and check passages{chosen ? ` in ${shortTranslationName(chosen)}` : ''}
                </h2>
                <p className="text-sm text-pretty text-muted-foreground">
                  Ask for a reference, a phrase you remember or a whole chapter. Passages come from the official text in
                  the app, cited the way {chosen?.languageName ?? 'the translation'} cites them.
                </p>
              </div>
              <div className={cn('grid gap-2', !compact && 'sm:grid-cols-2')}>
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    disabled={!chosen}
                    onClick={() => void send(starter, [])}
                    className="rounded-lg border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((turn, i) =>
              turn.role === 'user' ? (
                <div key={turn.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{turn.content}</p>
                </div>
              ) : (
                <AssistantMessage
                  key={turn.id}
                  turn={turn}
                  chosen={chosen?.code}
                  translations={list}
                  onInsert={onInsert}
                  onRetry={i === turns.length - 1 ? retry : undefined}
                />
              ),
            )
          )}
        </div>
      </div>

      <div className={cn('shrink-0 pt-2 pb-3', gutter)}>
        <form
          className={column}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <InputGroup>
            <InputGroupTextarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={MAX_QUESTION_CHARS}
              rows={1}
              placeholder={chosen ? `Ask about a passage in ${shortTranslationName(chosen)}` : 'Ask about a passage'}
              aria-label="Question about the Bible"
              className="max-h-48 min-h-11"
            />
            <InputGroupAddon align="block-end" className="gap-2">
              <span className="text-xs text-muted-foreground">
                {draft.length > MAX_QUESTION_CHARS - 400
                  ? `${MAX_QUESTION_CHARS - draft.length} characters left`
                  : 'Shift+Enter for a new line'}
              </span>
              {busy ? (
                <InputGroupButton
                  variant="outline"
                  size="icon-sm"
                  className="ml-auto"
                  onClick={() => abortRef.current?.abort()}
                  aria-label="Stop answering"
                >
                  <Square className="fill-current" />
                </InputGroupButton>
              ) : (
                <InputGroupButton
                  type="submit"
                  variant="default"
                  size="icon-sm"
                  className="ml-auto"
                  disabled={!draft.trim() || !chosen}
                  aria-label="Send"
                >
                  <ArrowUp />
                </InputGroupButton>
              )}
            </InputGroupAddon>
          </InputGroup>
        </form>
      </div>

      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
