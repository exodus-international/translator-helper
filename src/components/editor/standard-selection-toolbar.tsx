'use client';

import { BookPlus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CodeEditorHandle } from './code-editor';
import { standardPrefill } from './standard-selection-prefill';
import { useStandardHost } from './standard-host';
import { selectionBox, useFollowSelection, useToolbarPlacement, type SelectionBox } from './toolbar-placement';

/**
 * Adding a standard translation from text selected in the source pane.
 *
 * The source is read-only there, so a selection in it has nothing else to
 * offer; this gives it one action, placed as the other selection toolbars
 * are. It is offered only to the language's team -- `useStandardHost` is null
 * for anyone else -- and only while `enabled`. The translation's same lines
 * are read at the click, from the translation editor when there is one, so
 * what was typed a moment ago is what the dialog starts from.
 */
export function useStandardSelectionToolbar({
  editorRef,
  containerRef,
  translationContent,
  enabled,
}: {
  editorRef: React.RefObject<CodeEditorHandle | null>;
  containerRef: React.RefObject<HTMLElement | null>;
  /** The translation, for when its editor is not on screen. */
  translationContent: string;
  enabled: boolean;
}) {
  const host = useStandardHost();
  const offered = enabled && host !== null;
  const [rawPosition, setPosition] = useState<SelectionBox | null>(null);
  const position = offered ? rawPosition : null;

  // Gone when the pane loses focus, as the formatting toolbar is: the click
  // that opens the dialog moves focus into it, and takes the toolbar away.
  const open = position !== null;
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;
    const clear = () => setPosition(null);
    container.addEventListener('focusout', clear);
    return () => container.removeEventListener('focusout', clear);
  }, [open, containerRef]);
  useFollowSelection(open, containerRef, editorRef, setPosition);

  const onSelectionChange = useCallback(
    (range: object | null) => {
      const view = editorRef.current?.view;
      setPosition(offered && range && view ? selectionBox(view) : null);
    },
    [offered, editorRef],
  );

  const onAdd = useCallback(() => {
    const view = editorRef.current?.view;
    if (!host || !view) return;
    const { from, to } = view.state.selection.main;
    host.addEntry(
      standardPrefill({
        source: view.state.doc.toString(),
        from,
        to,
        translation: host.view?.state.doc.toString() ?? translationContent,
      }),
    );
    setPosition(null);
  }, [host, editorRef, translationContent]);

  return { position, onSelectionChange, onAdd };
}

/** The source pane's selection action: one button over the selected text. */
export function StandardSelectionToolbar({
  position,
  containerRef,
  onAdd,
}: {
  position: SelectionBox;
  /** The pane the editor is in, which the toolbar stays inside. */
  containerRef: React.RefObject<HTMLElement | null>;
  onAdd: () => void;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const coords = useToolbarPlacement(toolbarRef, position, containerRef);

  return createPortal(
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Selection actions"
      style={{ left: coords?.left ?? -9999, top: coords?.top ?? -9999, position: 'fixed' }}
      className={cn(
        'z-50 flex items-center rounded-lg border bg-popover p-1 shadow-md transition-opacity',
        coords ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      // Keep the selection: a button that takes focus would collapse it.
      onMouseDown={(event) => event.preventDefault()}
    >
      <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
        <BookPlus data-icon="inline-start" />
        Add standard translation
      </Button>
    </div>,
    document.body,
  );
}
