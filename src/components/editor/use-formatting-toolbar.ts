'use client';

import { useCallback, useEffect, useState } from 'react';
import { inlineSpansAround } from './cm-inline-spans';
import type { CodeEditorHandle } from './code-editor';
import { activeFormattingActions, applyFormattingAction, type FormattingAction } from './formatting';
import { selectionBox, useFollowSelection, type SelectionBox } from './toolbar-placement';

interface SelectionRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * Formatting for one editor pane.
 *
 * Both panes edit the same kind of prose, so both get the same toolbar, the
 * same actions and the same positioning from here -- the source pane and the
 * translation pane differ only in which editor they point at. The hook returns
 * the selection handler the editor needs and the props the toolbar needs, so a
 * pane is wired with two lines instead of its own copy of the positioning and
 * wrapping logic.
 */
export function useFormattingToolbar({
  editorRef,
  containerRef,
  enabled,
}: {
  editorRef: React.RefObject<CodeEditorHandle | null>;
  containerRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
}) {
  const [rawPosition, setPosition] = useState<SelectionBox | null>(null);
  // What the selection already carries, so the toolbar can show those buttons
  // as on. Read on every selection change, which includes the one a click
  // leaves behind -- so a button goes off the moment it takes its mark away.
  const [active, setActive] = useState<FormattingAction[]>([]);

  // A toolbar is only ever offered for a pane that can be typed into. Both
  // render sites used to test the position alone, so a toolbar opened in Edit
  // stayed on screen after a switch to Preview -- and `onFormat` dispatches
  // straight through the view, which `EditorState.readOnly` does not stop.
  // Reporting it from here means neither caller can forget.
  const position = enabled ? rawPosition : null;

  // A pane keeps its selection when the other pane takes the cursor, so the
  // toolbar has to go when its pane does -- otherwise both panes' toolbars sit
  // on screen, one of them acting on a selection nobody can see any more.
  //
  // Bound while the toolbar is up rather than once at mount: a pane's box is
  // conditionally rendered -- Edit and Preview are different elements, and a
  // language with no version yet renders neither -- so a ref read at mount
  // gives an element that is about to leave the document, or nothing at all.
  // A ref object's identity never changes, so the effect would not run again
  // to notice.
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
    (range: SelectionRange | null) => {
      if (!enabled || !range) {
        setPosition(null);
        return;
      }
      const editor = editorRef.current?.editor;
      if (!editor) return;
      const { state } = editor.view;
      const { from, to } = state.selection.main;
      const next = activeFormattingActions(state.doc.toString(), { from, to }, inlineSpansAround(state, from, to));
      // A drag reports every step, and nearly every step leaves the same set:
      // keep the old array so the pane does not re-render for nothing.
      setActive((previous) =>
        previous.length === next.length && previous.every((action, index) => action === next[index]) ? previous : next,
      );
      setPosition(selectionBox(editor.view));
    },
    [enabled, editorRef],
  );

  const onFormat = useCallback(
    (action: FormattingAction) => {
      if (!enabled) return;
      const view = editorRef.current?.view;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      const outcome = applyFormattingAction(
        view.state.doc.toString(),
        { from, to },
        action,
        inlineSpansAround(view.state, from, to),
      );
      if (!outcome) return;
      view.dispatch({ changes: outcome.changes, selection: outcome.selection });
      view.focus();
    },
    [enabled, editorRef],
  );

  return { position, active, onSelectionChange, onFormat, containerRef };
}
