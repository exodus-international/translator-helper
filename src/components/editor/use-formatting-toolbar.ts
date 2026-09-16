'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CodeEditorHandle } from './code-editor';
import { applyFormattingAction, type FormattingAction } from './formatting';

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
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  // A pane keeps its selection when the other pane takes the cursor, so the
  // toolbar has to go when its pane does -- otherwise both panes' toolbars sit
  // on screen, one of them acting on a selection nobody can see any more.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const clear = () => setPosition(null);
    container.addEventListener('focusout', clear);
    return () => container.removeEventListener('focusout', clear);
  }, [containerRef]);

  const onSelectionChange = useCallback(
    (range: SelectionRange | null) => {
      if (!enabled || !range) {
        setPosition(null);
        return;
      }
      const editor = editorRef.current?.editor;
      if (!editor) return;
      try {
        const pos = editor.coordsAt({ line: range.endLine, column: range.endColumn });
        setPosition(pos ? { x: pos.left + 20, y: pos.top + pos.height + 4 } : null);
      } catch {
        setPosition(null);
      }
    },
    [enabled, editorRef],
  );

  const onFormat = useCallback(
    (action: FormattingAction) => {
      const view = editorRef.current?.view;
      if (!view) return;
      const outcome = applyFormattingAction(
        view.state.doc.toString(),
        { from: view.state.selection.main.from, to: view.state.selection.main.to },
        action,
      );
      if (!outcome) return;
      view.dispatch({ changes: outcome.changes, selection: outcome.selection });
      view.focus();
    },
    [editorRef],
  );

  return { position, onSelectionChange, onFormat, containerRef };
}
