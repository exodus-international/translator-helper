'use client';

import { Check, Copy, TextCursorInput } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { VerseDto } from '@/domain/bible/bible.types';
import { cn } from '@/lib/utils';
import { quotation, STATUS_LABELS, type PassageResult } from './chat-client';

const COLLAPSED_VERSES = 8;

function Verses({ verses, text, collapsed }: { verses?: VerseDto[]; text?: string; collapsed: boolean }) {
  if (!verses || verses.length === 0) return text ? <p>{text}</p> : null;
  const shown = collapsed ? verses.slice(0, COLLAPSED_VERSES) : verses;
  return (
    <p>
      {shown.map((v, i) => {
        // A passage that crosses a chapter says so where it turns.
        const turns = i > 0 && v.chapter !== shown[i - 1]!.chapter;
        return (
          <span key={v.id}>
            {i > 0 && ' '}
            <sup className="mr-0.5 font-sans text-[0.65em] font-medium text-muted-foreground tabular-nums">
              {turns ? `${v.chapter},` : ''}
              {v.verse}
              {v.verse_end ? `–${v.verse_end}` : ''}
            </sup>
            {v.text}
          </span>
        );
      })}
    </p>
  );
}

/**
 * One passage as the Bible holds it: the citation in the translation's
 * notation, the verse-numbered official text, its status and notes. The text
 * comes from the tool result, never from the model's answer.
 */
export function PassageCard({
  passage,
  sourceName,
  translationName,
  onInsert,
}: {
  passage: PassageResult;
  /** Short name of the source Bible, for the comparison toggle. */
  sourceName: string;
  /** Shown when the passage is not in the chat's chosen translation. */
  translationName?: string;
  onInsert?: (text: string) => void;
}) {
  const [showSource, setShowSource] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const status = STATUS_LABELS[passage.status];
  const hasText = Boolean(passage.text);
  const verseCount = passage.verses?.length ?? 0;
  const collapsible = verseCount > COLLAPSED_VERSES + 2;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(quotation(passage));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy. Select the text and copy it instead.');
    }
  };

  return (
    <article className="rounded-lg border bg-card text-card-foreground">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-2.5">
        <h3 className="text-sm font-semibold">{passage.rendered ?? passage.ref}</h3>
        {passage.rendered && passage.rendered !== passage.ref && (
          <span className="text-xs text-muted-foreground">{passage.ref}</span>
        )}
        {translationName && <span className="text-xs text-muted-foreground">{translationName}</span>}
        <Badge variant={status.tone} className="ml-auto">
          {status.label}
        </Badge>
      </header>

      {hasText && (
        <div className="px-3 pt-2 font-[family-name:var(--font-reader)] text-[0.95rem] leading-relaxed text-pretty whitespace-pre-line">
          <Verses verses={passage.verses} text={passage.text} collapsed={collapsible && !expanded} />
          {collapsible && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 font-sans text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              {expanded ? 'Show fewer verses' : `Show all ${verseCount} verses`}
            </button>
          )}
        </div>
      )}

      {showSource && passage.source?.text && (
        <div className="mx-3 mt-2 border-l-2 pl-3 text-muted-foreground">
          <div className="text-xs font-medium">
            {sourceName}
            {passage.source.rendered ? `, ${passage.source.rendered}` : ''}
          </div>
          <div className="font-[family-name:var(--font-reader)] text-[0.9rem] leading-relaxed whitespace-pre-line">
            <Verses verses={passage.source.verses} text={passage.source.text} collapsed={false} />
          </div>
        </div>
      )}

      {passage.notes.length > 0 && (
        <ul className={cn('space-y-0.5 px-3 pt-2 text-xs text-muted-foreground', !hasText && 'pt-1')}>
          {passage.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      {!hasText && !passage.source?.text ? (
        <div className="h-2.5" />
      ) : (
        <footer className="flex flex-wrap items-center gap-1 px-2 pt-2 pb-2">
          {passage.source?.text && (
            <Button variant="ghost" size="xs" aria-pressed={showSource} onClick={() => setShowSource((v) => !v)}>
              {showSource ? `Hide ${sourceName}` : `Compare with ${sourceName}`}
            </Button>
          )}
          {hasText && (
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="xs"
                onClick={copy}
                aria-label={`Copy ${passage.rendered ?? passage.ref} with its citation`}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              {onInsert && (
                <Button variant="outline" size="xs" onClick={() => onInsert(quotation(passage))}>
                  <TextCursorInput />
                  Insert
                </Button>
              )}
            </div>
          )}
        </footer>
      )}
    </article>
  );
}
