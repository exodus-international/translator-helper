'use client';

import { Button } from '@/components/ui/button';
import type { PassageResult } from '@/domain/bible/bible.types';
import { formatInlineQuote, formatReading, type Citation } from '@/domain/scripture/citations';
import { buildCheckItems, notationEdit, quoteEdit, type Edit } from '@/domain/scripture/scripture-check';
import { Check, Copy, Loader2, Quote, Replace, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ScriptureHost } from './scripture-context';
import { resolvePassage } from './scripture-client';
import { numberingNote, OfficialText, StatusBadge, WordDiff } from './scripture-parts';

// How each language opens and closes a quotation, for text written in beside an inline citation.
const QUOTE_MARKS: Record<string, [string, string]> = {
  hr: ['„', '“'],
  de: ['„', '“'],
  cs: ['„', '“'],
  sk: ['„', '“'],
  hu: ['„', '”'],
  sl: ['»', '«'],
};

/** Where "Insert official text" writes, when the document quotes nothing yet. */
function insertEdit(doc: string, citation: Citation, verses: string[], language: string): Edit {
  const lineStart = doc.lastIndexOf('\n', citation.from - 1) + 1;
  const newline = doc.indexOf('\n', citation.to);
  const lineEnd = newline === -1 ? doc.length : newline;
  const line = doc.slice(lineStart, lineEnd);
  const alone = !/[\p{L}\p{N}]/u.test(line.replace(citation.raw, ' ').replace(/<[^>]*>/g, ' '));
  if (alone) return { from: lineEnd, to: lineEnd, insert: `\n\n${formatReading(verses, [])}`, expected: '' };
  const [open, close] = QUOTE_MARKS[language] ?? ['“', '”'];
  return { from: citation.to, to: citation.to, insert: ` ${open}${formatInlineQuote(verses)}${close}`, expected: '' };
}

export interface ScriptureCardProps {
  citation: Citation;
  /** The document when the card opened. */
  doc: string;
  host: ScriptureHost | null;
  readOnly: boolean;
  /** Opened by a click, so it stays until closed. */
  pinned: boolean;
  onEdit: (edit: Edit) => void;
  onClose: () => void;
}

/**
 * The card over a citation in the translation: the citation and text as the
 * target Bible has them, and the one-click changes that write them in.
 */
export function ScriptureCard({ citation, doc, host, readOnly, pinned, onEdit, onClose }: ScriptureCardProps) {
  const translation = host?.translation;
  const [result, setResult] = useState<{ key: string; value: PassageResult | null }>();
  const key = `${translation}\u0000${citation.text}`;

  useEffect(() => {
    if (!translation || host?.bible === null) return;
    let cancelled = false;
    resolvePassage(citation.text, translation).then((value) => {
      if (!cancelled) setResult({ key: `${translation}\u0000${citation.text}`, value: value ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [citation.text, translation, host?.bible]);

  const passage = result?.key === key ? result.value : undefined;
  const item = useMemo(() => {
    if (!passage || !host) return null;
    return (
      buildCheckItems({
        text: doc,
        citations: [citation],
        results: new Map([[citation.text, passage]]),
        sourceRendered: host.sourceRendered,
      })[0] ?? null
    );
  }, [passage, host, doc, citation]);

  if (!host) return null;

  const close = pinned && (
    <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close" className="-mr-1 shrink-0">
      <X />
    </Button>
  );

  if (host.bible === null) {
    return (
      <Frame>
        <div className="flex items-start gap-2 p-3 text-xs text-muted-foreground">
          <p className="min-w-0 flex-1">
            {host.bibleError
              ? 'The Bible could not be read. Try again in a moment.'
              : `No Bible is imported for ${host.languageName ?? host.language}, so this citation cannot be checked.`}
          </p>
          {close}
        </div>
      </Frame>
    );
  }

  if (passage === undefined) {
    return (
      <Frame>
        <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground" aria-live="polite">
          <Loader2 className="size-3.5 animate-spin" />
          Looking up {citation.text}…
        </div>
      </Frame>
    );
  }

  if (!passage || !item) {
    return (
      <Frame>
        <div className="flex items-start gap-2 p-3 text-xs text-muted-foreground">
          <p className="min-w-0 flex-1">
            {passage ? `${citation.text} is not a Bible reference.` : 'The Bible could not be read. Try again in a moment.'}
          </p>
          {close}
        </div>
      </Frame>
    );
  }

  const fixNotation = readOnly ? null : notationEdit(item);
  const fixQuote = readOnly ? null : quoteEdit(item);
  const insert =
    !readOnly && !item.quote && item.verses.length && item.notation !== 'check-numbering'
      ? insertEdit(doc, citation, item.verses, host.language)
      : null;
  const source = passage.source;

  return (
    <Frame label={`Scripture: ${item.rendered ?? citation.text}`}>
      <div className="flex items-start gap-2 border-b px-3 pt-2.5 pb-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">{item.rendered ?? citation.text}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {item.rendered && item.notation !== 'official' ? `Written as ${citation.text}. ` : ''}
            {host.bible?.name}
          </div>
        </div>
        {item.status !== 'ok' && <StatusBadge status={item.status} />}
        {close}
      </div>

      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto px-3 py-2.5">
        {item.notation === 'check-numbering' && (
          <p className="text-xs text-warning">{numberingNote(item, host.languageName)}</p>
        )}
        {item.officialText ? (
          <OfficialText text={item.officialText} />
        ) : (
          <p className="text-xs text-muted-foreground">The Bible has no text for this citation.</p>
        )}
        {item.notes.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
            {item.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        {item.quote && !item.quote.matches && (
          <div className="flex flex-col gap-1 rounded-md bg-muted/50 p-2">
            <span className="text-[11px] font-medium text-muted-foreground">Your quotation against the official text</span>
            <WordDiff parts={item.quote.diff} />
          </div>
        )}
        {item.quote?.matches && (
          <p className="flex items-center gap-1 text-[11px] text-success">
            <Check className="size-3" /> The quotation is the official text.
          </p>
        )}
        {source?.text && (
          <details className="group text-[11px] text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">
              RSV-CE{source.rendered ? ` ${source.rendered}` : ''}
            </summary>
            <p className="mt-1 leading-relaxed">{source.text}</p>
          </details>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t bg-muted/40 px-3 py-2">
        {fixNotation && (
          <Button size="xs" variant={item.notation === 'fixable' ? 'default' : 'outline'} onClick={() => onEdit(fixNotation)}>
            <Replace />
            Use {item.rendered}
          </Button>
        )}
        {fixQuote && (
          <Button size="xs" variant="outline" onClick={() => onEdit(fixQuote)}>
            <Quote />
            Replace quoted text
          </Button>
        )}
        {insert && (
          <Button size="xs" variant="outline" onClick={() => onEdit(insert)}>
            <Quote />
            Insert official text
          </Button>
        )}
        {item.officialText && (
          <Button
            size="xs"
            variant="ghost"
            className="ml-auto"
            onClick={() =>
              navigator.clipboard.writeText(item.officialText!).then(
                () => toast.success('Copied the official text'),
                () => toast.error('Could not copy to the clipboard'),
              )
            }
          >
            <Copy />
            Copy
          </Button>
        )}
      </div>
    </Frame>
  );
}

function Frame({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div role="group" aria-label={label} className="w-[22rem] max-w-[calc(100vw-2rem)] font-sans text-popover-foreground">
      {children}
    </div>
  );
}
