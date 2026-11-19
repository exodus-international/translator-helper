'use client';

import { Button } from '@/components/ui/button';
import {
  needsAttention,
  notationEdit,
  quoteEdit,
  type CheckItem,
  type SourceOnly,
} from '@/domain/scripture/scripture-check';
import { cn } from '@/lib/utils';
import { Loader2, Quote, Replace, RotateCw } from 'lucide-react';
import { itemVerdict, numberingNote, TONE_CLASS, TONE_DOT, WordDiff } from './scripture-parts';

export type ScriptureCheckState =
  | { kind: 'loading' }
  | { kind: 'no-bible'; languageName: string }
  | { kind: 'error' }
  | { kind: 'ready'; bibleName: string };

export interface ScriptureCheckProps {
  state: ScriptureCheckState;
  items: CheckItem[];
  sourceOnly: SourceOnly[];
  /** A check of the current text is still under way. */
  checking: boolean;
  /** Citations the Bible did not answer for: they are missing from the list. */
  unchecked?: number;
  onRetry?: () => void;
  readOnly?: boolean;
  languageName: string | null;
  onReveal: (item: CheckItem) => void;
  onFixNotation: (item: CheckItem) => void;
  onUseOfficialText: (item: CheckItem) => void;
  onFixAllNotations: () => void;
}

/**
 * Every citation in the translation against the target Bible: whether it is
 * written the way that Bible writes it, and whether the text quoted with it is
 * that Bible's text. The list is the document's order, so working down it is
 * working down the document.
 */
export function ScriptureCheck({
  state,
  items,
  sourceOnly,
  checking,
  unchecked = 0,
  onRetry,
  readOnly = false,
  languageName,
  onReveal,
  onFixNotation,
  onUseOfficialText,
  onFixAllNotations,
}: ScriptureCheckProps) {
  if (state.kind === 'loading') return <Note busy>Loading the Bible…</Note>;
  if (state.kind === 'error') return <Note>The Bible could not be read. Reload the page to try again.</Note>;
  if (state.kind === 'no-bible') {
    return (
      <Note>
        No Bible is imported for {state.languageName}, so citations cannot be checked. An admin can import one from the
        Bible admin page.
      </Note>
    );
  }

  const fixable = items.filter((item) => item.notation === 'fixable').length;
  const attention = items.filter(needsAttention).length;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1" aria-live="polite">
          {checking && items.length === 0 ? (
            'Checking citations…'
          ) : unchecked > 0 && items.length === 0 ? (
            'Citations not checked'
          ) : items.length === 0 ? (
            'No citations yet'
          ) : (
            <>
              {items.length} {items.length === 1 ? 'citation' : 'citations'}
              {attention > 0 ? `, ${attention} to check` : unchecked > 0 ? '' : ', all official'}
            </>
          )}
        </span>
        {checking && items.length > 0 && <Loader2 className="size-3 animate-spin" aria-label="Checking" />}
        {!readOnly && fixable > 1 && (
          <Button size="xs" variant="outline" onClick={onFixAllNotations}>
            <Replace />
            Fix all notations ({fixable})
          </Button>
        )}
      </div>

      {unchecked > 0 && !checking && (
        <div role="alert" className="flex items-center gap-2 border-t px-3 py-2 text-xs text-warning">
          <span className="min-w-0 flex-1">
            {unchecked} {unchecked === 1 ? 'citation' : 'citations'} could not be checked: the Bible did not answer.
          </span>
          {onRetry && (
            <Button size="xs" variant="outline" onClick={onRetry}>
              <RotateCw />
              Try again
            </Button>
          )}
        </div>
      )}

      {items.length === 0 && unchecked === 0 && !checking && (
        <p className="border-t px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          Citations such as John 3:16 or Iv 3,16 are checked against the {state.bibleName} as you write.
        </p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y border-t" aria-label="Citations">
          {items.map((item) => (
            <CheckRow
              key={item.id}
              item={item}
              readOnly={readOnly}
              languageName={languageName}
              onReveal={onReveal}
              onFixNotation={onFixNotation}
              onUseOfficialText={onUseOfficialText}
            />
          ))}
        </ul>
      )}

      {sourceOnly.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t px-3 py-2.5">
          <span className="text-[11px] font-medium text-muted-foreground">Cited in the source, not in the translation</span>
          <ul className="flex flex-wrap gap-1" aria-label="Cited in the source only">
            {sourceOnly.map((entry) => (
              <li
                key={entry.ref}
                title={`${entry.ref} in the source`}
                className="rounded-md border bg-muted/40 px-1.5 py-0.5 text-[11px] text-foreground"
              >
                {entry.rendered}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CheckRow({
  item,
  readOnly,
  languageName,
  onReveal,
  onFixNotation,
  onUseOfficialText,
}: {
  item: CheckItem;
  readOnly: boolean;
  languageName: string | null;
  onReveal: (item: CheckItem) => void;
  onFixNotation: (item: CheckItem) => void;
  onUseOfficialText: (item: CheckItem) => void;
}) {
  const verdict = itemVerdict(item);
  const canFixNotation = !readOnly && notationEdit(item) !== null;
  const canUseText = !readOnly && quoteEdit(item) !== null;
  const changed = item.rendered && item.rendered !== item.citation.text;

  return (
    <li className="flex flex-col gap-1.5 px-3 py-2">
      <button
        type="button"
        onClick={() => onReveal(item)}
        className="-mx-1 flex items-start gap-2 rounded-md px-1 py-0.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${item.citation.text}, line ${item.line}: ${verdict.text}. Show in the editor`}
      >
        <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', TONE_DOT[verdict.tone])} aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] leading-snug text-foreground">
            {item.citation.text}
            {changed && item.notation !== 'official' && (
              <span className="text-muted-foreground">
                {' '}
                <span aria-hidden>→</span> {item.rendered}
              </span>
            )}
          </span>
          <span className={cn('text-[11px]', TONE_CLASS[verdict.tone])}>{verdict.text}</span>
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">L{item.line}</span>
      </button>

      {item.notation === 'check-numbering' && (
        <p className="pl-3.5 text-[11px] leading-relaxed text-muted-foreground">{numberingNote(item, languageName)}</p>
      )}

      {item.quote && !item.quote.matches && (
        <WordDiff parts={item.quote.diff} className="ml-3.5 max-h-40 overflow-y-auto rounded-md bg-muted/50 p-2 text-[12px]" />
      )}

      {(canFixNotation || canUseText) && (
        <div className="flex flex-wrap gap-1.5 pl-3.5">
          {canFixNotation && (
            <Button size="xs" variant="outline" onClick={() => onFixNotation(item)}>
              <Replace />
              Fix notation
            </Button>
          )}
          {canUseText && (
            <Button size="xs" variant="outline" onClick={() => onUseOfficialText(item)}>
              <Quote />
              Use official text
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function Note({ children, busy }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <p className="flex items-start gap-2 px-3 py-3 text-xs leading-relaxed text-muted-foreground" aria-live="polite">
      {busy && <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin" />}
      <span>{children}</span>
    </p>
  );
}
