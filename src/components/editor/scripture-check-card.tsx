'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BibleChat } from '@/components/bible/chat/bible-chat';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { PassageResult } from '@/domain/bible/bible.types';
import { findCitations } from '@/domain/scripture/citations';
import {
  buildCheckItems,
  fixAllNotationEdits,
  needsAttention,
  notationEdit,
  quoteEdit,
  sourceOnlyCitations,
  type CheckItem,
  type Edit,
} from '@/domain/scripture/scripture-check';
import { useEditorStore } from '@/lib/stores/editor-provider';
import type { EditorView } from '@codemirror/view';
import { ChevronDown, MessageSquareText } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { applyEdits, revealRange } from './cm-scripture';
import { ScriptureCheck, type ScriptureCheckState } from './scripture-check';
import { useScriptureHost, type ScriptureHost } from './scripture-context';
import { resolvePassages } from './scripture-client';

const CHECK_DELAY_MS = 600;
const EDITOR_WAIT_MS = 1_500;

/** Applies edits to a string, back to front so earlier offsets hold. */
function applyToText(text: string, edits: Edit[]): { text: string; applied: number } {
  let out = text;
  let applied = 0;
  for (const edit of [...edits].sort((a, b) => b.from - a.from)) {
    if (out.slice(edit.from, edit.to) !== edit.expected) continue;
    out = out.slice(0, edit.from) + edit.insert + out.slice(edit.to);
    applied++;
  }
  return { text: out, applied };
}

/**
 * A passage as it should sit where it goes: a paragraph of its own at the
 * start or end of a line, so it is never glued to a heading; set off by
 * spaces in the middle of one.
 */
function fitPassage(view: EditorView, from: number, to: number, text: string): string {
  const doc = view.state.doc;
  const atStart = from === doc.lineAt(from).from;
  const atEnd = to === doc.lineAt(to).to;
  if (atStart && atEnd) return text;
  if (atStart) return `${text}\n\n`;
  if (atEnd) return `\n\n${text}`;
  const before = /\s/.test(doc.sliceString(from - 1, from)) ? '' : ' ';
  const after = /\s/.test(doc.sliceString(to, to + 1)) ? '' : ' ';
  return `${before}${text}${after}`;
}

/**
 * The Scripture check in the document panel: the translation's citations,
 * checked against the target Bible as the translator writes.
 *
 * Every change goes through the translation editor, so it is one undo step and
 * marks the document unsaved like typing does. When the editor is not on
 * screen (the Preview tab) it is brought up first; only if it never appears is
 * the text changed in the store directly, which still marks it unsaved.
 */
export function ScriptureCheckCard({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const host = useScriptureHost();
  const content = useEditorStore((s) => s.content);
  const setContent = useEditorStore((s) => s.setContent);
  const [chatOpen, setChatOpen] = useState(false);
  const [analysis, setAnalysis] = useState<{ key: string; items: CheckItem[] }>();

  // Read by the wait for the editor, which outlives the render that started it.
  const hostRef = useRef<ScriptureHost | null>(host);
  useLayoutEffect(() => {
    hostRef.current = host;
  });

  const bible = host?.bible;
  const translation = host?.translation;
  const sourceRendered = host?.sourceRendered;
  const key = `${translation}\u0000${content}`;

  useEffect(() => {
    if (!bible || !translation || !sourceRendered) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const citations = findCitations(content);
      const refs = [...new Set(citations.map((c) => c.text))];
      let results = new Map<string, PassageResult>();
      try {
        results = await resolvePassages(refs, translation);
      } catch {
        // The cache has already reported it; the list shows what it has.
      }
      if (cancelled) return;
      setAnalysis({
        key: `${translation}\u0000${content}`,
        items: buildCheckItems({ text: content, citations, results, sourceRendered }),
      });
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bible, translation, content, sourceRendered]);

  const items = useMemo(() => analysis?.items ?? [], [analysis]);
  const checking = !!bible && analysis?.key !== key;
  const sourceOnly = useMemo(
    () => (host && analysis ? sourceOnlyCitations(host.sourcePassages, items) : []),
    [host, analysis, items],
  );

  if (!host) return null;

  const state: ScriptureCheckState =
    host.bible === undefined
      ? { kind: 'loading' }
      : host.bible === null
        ? host.bibleError
          ? { kind: 'error' }
          : { kind: 'no-bible', languageName: host.languageName ?? host.language }
        : { kind: 'ready', bibleName: host.bible.name };

  /** Runs with the translation editor, bringing it on screen first if need be. */
  const withEditor = (work: (view: EditorView) => void, fallback?: () => void) => {
    const current = hostRef.current?.view;
    if (current) return work(current);
    hostRef.current?.requestEditor?.();
    const started = Date.now();
    const poll = () => {
      const view = hostRef.current?.view;
      if (view) return work(view);
      if (Date.now() - started > EDITOR_WAIT_MS) return fallback?.();
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  };

  const edit = (edits: Edit[], done?: (applied: number) => void) =>
    withEditor(
      (view) => {
        const applied = applyEdits(view, edits);
        view.focus();
        done?.(applied);
      },
      () => {
        const { text, applied } = applyToText(content, edits);
        if (applied) setContent(text);
        done?.(applied);
      },
    );

  /** A passage from the chat, at the cursor (or over the selection), as one undo step. */
  const insertPassage = (text: string) =>
    withEditor(
      (view) => {
        const { from, to } = view.state.selection.main;
        const insert = fitPassage(view, from, to, text);
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length },
          userEvent: 'input.scripture',
          scrollIntoView: true,
        });
        setChatOpen(false);
        view.focus();
      },
      () => toast.error('Open the Edit tab to insert the passage.'),
    );

  const attention = items.filter(needsAttention).length;

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
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Scripture</span>
          <span className="flex items-center gap-2">
            {attention > 0 && (
              <span className="rounded-full bg-warning/15 px-1.5 text-[10px] leading-4 font-medium tabular-nums text-warning">
                {attention} to check
              </span>
            )}
            <ChevronDown className="size-3.5 text-muted-foreground transition-transform duration-200 group-aria-expanded:rotate-180" />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t">
          <ScriptureCheck
            state={state}
            items={items}
            sourceOnly={sourceOnly}
            checking={checking}
            languageName={host.languageName}
            readOnly={!host.editable}
            onReveal={(item) => withEditor((view) => revealRange(view, item.citation.from, item.citation.to, item.citation.raw))}
            onFixNotation={(item) => {
              const change = notationEdit(item);
              if (change) edit([change]);
            }}
            onUseOfficialText={(item) => {
              const change = quoteEdit(item);
              if (change) edit([change]);
            }}
            onFixAllNotations={() =>
              edit(fixAllNotationEdits(items), (applied) => {
                if (applied) toast.success(`Fixed ${applied} ${applied === 1 ? 'citation' : 'citations'}`);
              })
            }
          />
          <div className="border-t px-3 py-2">
            <Button variant="outline" size="sm" className="w-full" onClick={() => setChatOpen(true)}>
              <MessageSquareText />
              Ask the Bible
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Ask the Bible</SheetTitle>
            <SheetDescription>
              Passages come from {host.bible?.name ?? 'the official Bible'}.
              {host.editable && ' Insert puts one at the cursor.'}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <BibleChat translation={host.translation} onInsert={host.editable ? insertPassage : undefined} compact />
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
