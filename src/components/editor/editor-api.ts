'use client';

/**
 * A line/column handle over a CodeMirror view.
 *
 * The viewer and the suggestion tables think in 1-based lines and columns —
 * that is what `Suggestion.startLine` / `startColumn` store — while CodeMirror
 * works in absolute document offsets. This module is the single place that
 * translation happens, so no call site does offset arithmetic of its own.
 */

import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/** 1-based line, 1-based column — the shape a stored suggestion range has. */
export interface LineColumnRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface LineColumnPosition {
  line: number;
  column: number;
}

const clampLine = (view: EditorView, line: number) => Math.min(Math.max(line, 1), view.state.doc.lines);

export function positionToOffset(view: EditorView, line: number, column: number): number {
  const target = view.state.doc.line(clampLine(view, line));
  return Math.min(target.from + Math.max(column - 1, 0), target.to);
}

export function offsetToPosition(view: EditorView, offset: number): LineColumnPosition {
  const line = view.state.doc.lineAt(Math.min(Math.max(offset, 0), view.state.doc.length));
  return { line: line.number, column: offset - line.from + 1 };
}

function rangeToOffsets(view: EditorView, range: LineColumnRange) {
  const from = positionToOffset(view, range.startLine, range.startColumn);
  const to = positionToOffset(view, range.endLine, range.endColumn);
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

function reveal(view: EditorView, offset: number) {
  view.dispatch({ effects: EditorView.scrollIntoView(offset, { y: 'center' }) });
}

export interface EditorApi {
  getValue(): string;
  getTextInRange(range: LineColumnRange): string;
  setSelection(range: LineColumnRange): void;
  setPosition(position: LineColumnPosition): void;
  revealLine(line: number): void;
  /** Scrolls only when the line is off screen, so it never yanks the view. */
  revealLineIfOutsideViewport(line: number): void;
  revealRange(range: LineColumnRange): void;
  /** Where a position sits in the editor's own box, for positioning a toolbar. */
  coordsAt(position: LineColumnPosition): { left: number; top: number; height: number } | null;
  focus(): void;
  /** The underlying view, for code that wants real CodeMirror APIs. */
  view: EditorView;
}

export function createEditorApi(view: EditorView): EditorApi {
  return {
    view,
    getValue: () => view.state.doc.toString(),
    getTextInRange(range) {
      const { from, to } = rangeToOffsets(view, range);
      return view.state.sliceDoc(from, to);
    },
    setSelection(range) {
      const { from, to } = rangeToOffsets(view, range);
      view.dispatch({ selection: EditorSelection.range(from, to), scrollIntoView: true });
    },
    setPosition({ line, column }) {
      view.dispatch({ selection: EditorSelection.cursor(positionToOffset(view, line, column)), scrollIntoView: true });
    },
    revealLine(line) {
      reveal(view, positionToOffset(view, line, 1));
    },
    revealLineIfOutsideViewport(line) {
      const offset = positionToOffset(view, line, 1);
      const block = view.lineBlockAt(offset);
      const { top, bottom } = view.scrollDOM.getBoundingClientRect();
      const visible =
        block.top >= view.scrollDOM.scrollTop && block.bottom <= view.scrollDOM.scrollTop + (bottom - top);
      if (!visible) reveal(view, offset);
    },
    revealRange(range) {
      reveal(view, rangeToOffsets(view, range).from);
    },
    coordsAt({ line, column }) {
      const coords = view.coordsAtPos(positionToOffset(view, line, column));
      if (!coords) return null;
      const editorRect = view.dom.getBoundingClientRect();
      return {
        left: coords.left - editorRect.left,
        top: coords.top - editorRect.top,
        height: coords.bottom - coords.top,
      };
    },
    focus: () => view.focus(),
  };
}
