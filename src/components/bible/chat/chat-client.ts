import type { ChatEvent, ChatMessage, ChatToolName } from '@/domain/bible/bible.chat';
import type { BibleTranslationDto } from '@/domain/bible/bible.service';
import type { PassageResult, PassageStatus } from '@/domain/bible/bible.types';

/** Client side of /api/bible/chat: the request, the NDJSON reader and the labels the chat shows. */

export type { ChatEvent, ChatMessage, ChatToolName, PassageResult };
export type ChatTranslation = BibleTranslationDto;

export class ChatRequestError extends Error {}

export async function* streamChat(
  body: { messages: ChatMessage[]; translation: string },
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const response = await fetch('/api/bible/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    if (response.status === 401) throw new ChatRequestError('Your session has ended. Sign in again to keep asking.');
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ChatRequestError(payload?.error ?? 'The assistant could not answer right now. Try again in a moment.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as ChatEvent;
    }
    if (done) {
      if (buffer.trim()) yield JSON.parse(buffer) as ChatEvent;
      return;
    }
  }
}

/**
 * A name short enough for a status line: "RSV-CE", "Ivan Ev. Šarić",
 * "Einheitsübersetzung 2016"; the code's first part when the name is long.
 */
export function shortTranslationName(t: Pick<ChatTranslation, 'code' | 'name'>): string {
  const parenthetical = t.name.match(/\(([^)]+)\)\s*$/)?.[1]?.trim();
  if (parenthetical && parenthetical.length <= 16 && /^\p{Lu}/u.test(parenthetical)) return parenthetical;
  const bare = t.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (bare.length <= 24) return bare;
  return t.code.split('-')[0]!.toUpperCase();
}

/** The translation a key ("hr" or "sar-hr") means, as the server picks it. */
export function findTranslation(translations: ChatTranslation[], key: string | undefined) {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    translations.find((t) => t.code === k) ??
    translations.find((t) => t.language === k && t.isLanguageDefault) ??
    translations.find((t) => t.language === k)
  );
}

export function activityLabel(name: ChatToolName, args: Record<string, unknown>, translations: ChatTranslation[]): string {
  const t = findTranslation(translations, typeof args.translation === 'string' ? args.translation : undefined);
  const bible = t ? shortTranslationName(t) : String(args.translation ?? 'the Bible');
  switch (name) {
    case 'resolve_passages': {
      const refs = Array.isArray(args.refs) ? args.refs.map(String) : [];
      const shown = refs.slice(0, 3).join(', ') + (refs.length > 3 ? ` and ${refs.length - 3} more` : '');
      return `Looking up ${shown || 'passages'} in ${bible}`;
    }
    case 'search_bible':
      return `Searching ${bible} for ‘${String(args.query ?? '')}’${args.book ? ` in ${String(args.book)}` : ''}`;
    case 'get_chapter':
      return `Reading ${String(args.book ?? '')} ${String(args.chapter ?? '')} in ${bible}`;
    case 'list_translations':
      return 'Checking which Bibles are imported';
  }
}

export const STATUS_LABELS: Record<PassageStatus, { label: string; tone: 'success' | 'warning' | 'destructive' }> = {
  ok: { label: 'Official text', tone: 'success' },
  partial: { label: 'Partly found', tone: 'warning' },
  versification_unmapped: { label: 'Numbering not mapped', tone: 'warning' },
  out_of_range: { label: 'No such verse', tone: 'destructive' },
  unparseable: { label: 'Not a reference', tone: 'destructive' },
  unknown_book: { label: 'Unknown book', tone: 'destructive' },
  unknown_language: { label: 'No Bible for language', tone: 'destructive' },
  book_not_in_translation: { label: 'Book not in this Bible', tone: 'destructive' },
};

/** What Copy and Insert put down: the official text, then its citation. */
export function quotation(p: PassageResult): string {
  return p.rendered ? `${p.text ?? ''} (${p.rendered})`.trim() : (p.text ?? '');
}
