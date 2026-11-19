'use client';

import { Badge } from '@/components/ui/badge';
import type { PassageStatus } from '@/domain/bible/bible.types';
import type { DiffPart } from '@/domain/scripture/citations';
import { STATUS_LABEL, type CheckItem } from '@/domain/scripture/scripture-check';
import { cn } from '@/lib/utils';

/**
 * Pieces the hover card and the Scripture check draw alike: the official text,
 * set in the reader's serif so Scripture reads as it will be printed rather
 * than as editor chrome, the word diff, and the state of one citation.
 */

const READER_FONT = { fontFamily: 'var(--font-reader), ui-serif, Georgia, serif' } as const;

export function OfficialText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cn('text-[13px] leading-relaxed text-foreground', className)} style={READER_FONT}>
      {text}
    </p>
  );
}

/**
 * The translation's quotation against the official text: struck words go,
 * underlined words come in. Masked, as it shows the document's own words.
 */
export function WordDiff({ parts, className }: { parts: DiffPart[]; className?: string }) {
  return (
    <p className={cn('ph-mask text-[13px] leading-relaxed text-muted-foreground', className)} style={READER_FONT}>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {part.type === 'equal' ? (
            part.text
          ) : part.type === 'delete' ? (
            <del className="rounded-sm bg-destructive/10 text-destructive decoration-destructive/60">
              <span className="sr-only">Remove: </span>
              {part.text}
            </del>
          ) : (
            <ins className="rounded-sm bg-success/10 text-success no-underline">
              <span className="sr-only">Add: </span>
              {part.text}
            </ins>
          )}
        </span>
      ))}
    </p>
  );
}

const STATUS_VARIANT: Partial<Record<PassageStatus, 'success' | 'warning' | 'destructive'>> = {
  ok: 'success',
  partial: 'warning',
};

export function StatusBadge({ status }: { status: PassageStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'destructive'} className="shrink-0">
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/** One line on what, if anything, the citation needs. */
export function itemVerdict(item: CheckItem): { tone: 'ok' | 'warn' | 'bad'; text: string } {
  if (item.notation === 'unresolved') return { tone: 'bad', text: STATUS_LABEL[item.status] };
  if (item.notation === 'check-numbering') return { tone: 'warn', text: 'Check the numbering' };
  if (item.quote && !item.quote.matches) {
    return { tone: 'warn', text: `Quote differs (${Math.round(item.quote.similarity * 100)}% match)` };
  }
  if (item.notation === 'fixable') return { tone: 'warn', text: 'English notation' };
  if (item.quote?.matches) return { tone: 'ok', text: 'Official text' };
  return { tone: 'ok', text: item.status === 'partial' ? STATUS_LABEL.partial : 'Official notation' };
}

export const TONE_CLASS = {
  ok: 'text-success',
  warn: 'text-warning',
  bad: 'text-destructive',
} as const;

export const TONE_DOT = {
  ok: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-destructive',
} as const;

/** Why a target-notation citation is left alone. */
export function numberingNote(item: CheckItem, languageName: string | null) {
  return `This is written in ${languageName ?? 'the target'} notation. Read with RSV-CE numbering it is ${item.rendered}, so check which numbering it uses before changing it.`;
}
