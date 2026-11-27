'use client';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Edit } from '@/domain/scripture/scripture-check';
import { buildStandardCheck, type StandardState } from '@/domain/standard-translation/standard-translation.check';
import { useEditorStore } from '@/lib/stores/editor-provider';
import { ArrowUpRight, ChevronDown, Replace } from 'lucide-react';
import type { EditorView } from '@codemirror/view';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { applyEdits, revealRange } from './cm-scripture';
import { applyToText, standardRowDetail, standardRowName, type StandardRowItem } from './standard-check-rows';
import type { StandardHost } from './standard-host';

/** How long a pause in typing comes before the check runs again, as for Scripture's card. */
const CHECK_DELAY_MS = 600;
/** How long a change from the panel waits for the translation editor it asked for. */
const EDITOR_WAIT_MS = 1_500;

/**
 * Runs `work` with the translation editor, asking for it first when it isn't
 * on screen and waiting up to EDITOR_WAIT_MS for it; `fallback` runs if it
 * never comes. `host` is read on every frame, as the editor registers itself.
 */
function waitForEditor(
  host: () => Pick<StandardHost, 'view' | 'requestEditor'>,
  work: (view: EditorView) => void,
  fallback?: () => void,
) {
  const current = host().view;
  if (current) return work(current);
  host().requestEditor?.();
  const started = Date.now();
  const poll = () => {
    const view = host().view;
    if (view) return work(view);
    if (Date.now() - started > EDITOR_WAIT_MS) return fallback?.();
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}

/**
 * Whether the source uses any entry the document can use: whether the panel
 * has a card to show. Read from the source alone, which typing doesn't change,
 * so the panel doesn't re-render on every keystroke.
 */
export function useSourceUsesStandards(host: StandardHost | null): boolean {
  const source = host?.sourceContent;
  const entries = host?.entries;
  return useMemo(
    () => source !== undefined && !!entries && buildStandardCheck({ source, translation: '', entries }).length > 0,
    [source, entries],
  );
}

/**
 * The standard translation check of the translation: every occurrence in the
 * source of an entry the document can use, against the same lines of the
 * translation. It runs after a pause in typing, as the editor's highlights and
 * Scripture's card do; typing must not wait on a check of the whole document.
 */
function useStandardCheck(host: StandardHost): { items: StandardRowItem[]; checkedText: string } {
  const content = useEditorStore((s) => s.content);
  const [settled, setSettled] = useState(content);
  useEffect(() => {
    if (settled === content) return;
    const timer = setTimeout(() => setSettled(content), CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [content, settled]);
  const { sourceContent: source, entries } = host;
  const items = useMemo(
    () => buildStandardCheck({ source, translation: settled, entries }),
    [source, entries, settled],
  );
  return { items, checkedText: settled };
}

/** The card with its check: kept apart so only this re-renders while the translator types. */
export function StandardCheckPanel({
  host,
  open,
  onOpenChange,
}: {
  host: StandardHost;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { items, checkedText } = useStandardCheck(host);
  return (
    <StandardCheckCard
      host={host}
      items={items}
      checkedText={checkedText}
      languageCode={host.language.code}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

const BADGE: Record<StandardState, { label: string; variant: 'success' | 'warning' }> = {
  used: { label: 'Used', variant: 'success' },
  changed: { label: 'Changed', variant: 'warning' },
  missing: { label: 'Missing', variant: 'warning' },
};

/**
 * The standard translations card in the document panel: each standard
 * translation the source uses, whether the translation has it (Used), has a
 * variant of it (Changed) or lacks it (Missing), with the standard text one
 * click away where it can be written in.
 *
 * Every change goes through the translation editor, so it is one undo step and
 * marks the document unsaved like typing does. Without the editor on screen
 * (the Preview tab) the text is changed in the store, which still marks it
 * unsaved. Read-only, as in a review that can no longer be edited, it lists
 * but changes nothing.
 */
export function StandardCheckCard({
  host,
  items,
  checkedText,
  languageCode,
  open,
  onOpenChange,
}: {
  host: Pick<StandardHost, 'view' | 'editable' | 'requestEditor'>;
  /** From `useStandardCheck`, on `checkedText`. */
  items: StandardRowItem[];
  /** The translation the items were checked in: their ranges are offsets into it. */
  checkedText: string;
  /** For the link to the language's dictionary; without it the page picks the language. */
  languageCode: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const content = useEditorStore((s) => s.content);
  const setContent = useEditorStore((s) => s.setContent);
  // Read by the wait for the editor, which outlives the render that started it.
  const hostRef = useRef(host);
  const contentRef = useRef(content);
  useLayoutEffect(() => {
    hostRef.current = host;
    contentRef.current = content;
  });

  /**
   * Runs with the translation editor, bringing it on screen first if need be
   * (the Preview tab, or a review not yet in edit mode), as Scripture's card
   * does. A change made around the editor would sit unsaved where the
   * reviewer can't see it; only if the editor never comes is the stored text
   * changed instead.
   */
  const withEditor = (work: (view: EditorView) => void, fallback?: () => void) =>
    waitForEditor(() => hostRef.current, work, fallback);

  const edit = (edits: Edit[], done?: (applied: number) => void) =>
    withEditor(
      (view) => {
        const applied = applyEdits(view, edits);
        view.focus();
        done?.(applied);
      },
      () => {
        const next = applyToText(contentRef.current, edits);
        if (next.applied) setContent(next.text);
        done?.(next.applied);
      },
    );

  const reveal = (item: StandardRowItem) => {
    const range = item.range;
    if (!range) return;
    // The ranges are offsets into the store's text, which the check read; the
    // text they held finds the place again if the editor has moved on since.
    const expected = checkedText.slice(range.from, range.to);
    withEditor((view) => revealRange(view, range.from, range.to, expected));
  };

  const toCheck = items.filter((item) => item.state !== 'used').length;
  const edits = items.flatMap((item) => (item.state === 'changed' && item.edit ? [item.edit] : []));
  const manageHref = languageCode
    ? `/standard-translations?lang=${encodeURIComponent(languageCode)}`
    : '/standard-translations';

  return (
    <Card className="gap-0 overflow-hidden rounded-lg py-0 shadow-none">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              className="group h-auto w-full justify-between rounded-none bg-muted/60 px-3 py-2 transition-colors focus-visible:ring-inset"
            />
          }
        >
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Standard translations
          </span>
          <span className="flex items-center gap-2">
            {toCheck > 0 && (
              <Badge variant="warning" className="tabular-nums">
                {toCheck} to check
              </Badge>
            )}
            <ChevronDown className="size-3.5 text-muted-foreground transition-transform duration-200 group-aria-expanded:rotate-180" />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t">
          <ul className="flex flex-col divide-y" aria-label="Standard translations">
            {items.map((item) => {
              const change = item.state === 'changed' ? item.edit : null;
              return (
                <StandardRow
                  key={`${item.entry.id}:${item.source.from}`}
                  item={item}
                  onReveal={item.range && (host.view || host.requestEditor) ? () => reveal(item) : undefined}
                  onUse={host.editable && change ? () => edit([change]) : undefined}
                />
              );
            })}
          </ul>
          <div className="flex items-center gap-1.5 border-t bg-muted/50 px-3 py-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!host.editable || edits.length === 0}
              onClick={() => {
                // One transaction for them all, so one undo takes them all back.
                edit(edits, (applied) => {
                  if (applied) toast.success(`Applied ${applied} standard ${applied === 1 ? 'text' : 'texts'}`);
                });
              }}
            >
              Apply all standard texts
            </Button>
            {/* A link, so it reads as one; in a tab of its own, so the
                translation stays open, unsaved changes and all. */}
            <a
              href={manageHref}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'ml-auto' })}
            >
              Manage
              <ArrowUpRight data-icon="inline-end" />
            </a>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function StandardRow({
  item,
  onReveal,
  onUse,
}: {
  item: StandardRowItem;
  /** Shows the item in the editor; absent when there is nothing there to show. */
  onReveal?: () => void;
  /** Writes the standard text over the translation's; absent when it can't be. */
  onUse?: () => void;
}) {
  const badge = BADGE[item.state];
  const name = standardRowName(item);
  const detail = standardRowDetail(item);
  const body = (
    <>
      <Badge variant={badge.variant} className="mt-0.5">
        {badge.label}
      </Badge>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] leading-snug font-medium text-foreground">{name}</span>
        <span className="text-[11px] text-muted-foreground">{detail}</span>
      </span>
    </>
  );

  return (
    <li className="flex items-start gap-2 px-3 py-2">
      {onReveal ? (
        <button
          type="button"
          onClick={onReveal}
          className="-mx-1 flex min-w-0 flex-1 items-start gap-2 rounded-md px-1 py-0.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${name}, ${badge.label}: ${detail}. Show in the editor`}
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-2 py-0.5">{body}</div>
      )}
      {onUse && (
        <Button size="xs" variant="outline" onClick={onUse}>
          <Replace />
          Use
        </Button>
      )}
    </li>
  );
}
