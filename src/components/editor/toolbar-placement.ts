'use client';

/**
 * Where a toolbar that acts on a selection goes: next to the selected text,
 * never on it.
 *
 * Both of them -- formatting in an editable pane, Comment and Suggest edit in
 * a reviewed one -- sit over text somebody has just picked out, so both are
 * placed the same way from here.
 */

import type { EditorView } from '@codemirror/view';
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import type { CodeEditorHandle } from './code-editor';

/**
 * Where a selection is on screen, in viewport pixels: the left edge of its
 * first character, the top of its first line and the bottom of its last. A
 * selection that runs past the top or bottom of what the editor has drawn
 * reaches -Infinity or Infinity on that side.
 */
export interface SelectionBox {
  left: number;
  top: number;
  bottom: number;
  /**
   * The band the editor shows its text in. The pane around it also holds a
   * header and a status bar, and text scrolled under those is out of sight.
   */
  viewTop: number;
  viewBottom: number;
}

/**
 * The box around the selection's text on screen, for the toolbar to keep
 * clear of: its first character gives the top and left, its last the bottom.
 *
 * The editor only draws the text in and near view, and has no coordinates for
 * the rest, so a selection that runs off one end -- select-all in a long
 * document -- is open on that side, and the toolbar goes to the other.
 */
export function selectionBox(view: EditorView): SelectionBox {
  const { from, to } = view.state.selection.main;
  const first = view.coordsAtPos(from, 1);
  const last = view.coordsAtPos(to, -1);
  const scroller = view.scrollDOM.getBoundingClientRect();
  return {
    left: (first ?? last ?? view.contentDOM.getBoundingClientRect()).left,
    top: first ? first.top : -Infinity,
    bottom: last ? last.bottom : Infinity,
    viewTop: scroller.top,
    viewBottom: scroller.bottom,
  };
}

/** Between the toolbar and the selection, and the toolbar and the pane's edge. */
const GAP = 6;
const INSET = 8;

/**
 * Where the toolbar goes, in viewport pixels, and whether that is below the
 * selection; null while the selection is scrolled out of sight.
 *
 * Placed from the toolbar's own measured size, before paint, so it never shows
 * a frame in the wrong place. Both toolbars used to be placed from the bottom
 * of the selection's last line, less a guess at their height that was shorter
 * than they are -- so they sat on the words they were about to act on.
 */
export function useToolbarPlacement(
  toolbarRef: RefObject<HTMLElement | null>,
  position: SelectionBox,
  containerRef?: RefObject<HTMLElement | null>,
) {
  const [coords, setCoords] = useState<{ left: number; top: number; below: boolean } | null>(null);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const pane = containerRef?.current?.getBoundingClientRect();
    const visibleTop = Math.max(pane?.top ?? 0, position.viewTop, 0);
    const visibleBottom = Math.min(pane?.bottom ?? Infinity, position.viewBottom, window.innerHeight);
    // Scrolled out of sight: there is nothing on screen to act on.
    if (position.bottom <= visibleTop || position.top >= visibleBottom) {
      setCoords(null);
      return;
    }
    const bounds = {
      left: Math.max(pane?.left ?? 0, 0) + INSET,
      top: visibleTop + INSET,
      right: Math.min(pane?.right ?? Infinity, window.innerWidth) - INSET,
      bottom: visibleBottom - INSET,
    };
    const width = toolbar.offsetWidth;
    const height = toolbar.offsetHeight;

    // Above the selection, clear of its first line. Without the room for that
    // -- a selection on the pane's first lines -- below its last line instead,
    // and only onto the selection when it fills the pane and there is nowhere
    // else to go.
    const above = position.top - GAP - height;
    const below = above < bounds.top;
    const top = below ? Math.max(bounds.top, Math.min(position.bottom + GAP, bounds.bottom - height)) : above;
    const left = Math.max(bounds.left, Math.min(position.left, bounds.right - width));

    setCoords({ left, top, below });
  }, [toolbarRef, position.left, position.top, position.bottom, position.viewTop, position.viewBottom, containerRef]);

  return coords;
}

/**
 * Measures the selection again while the pane scrolls under an open toolbar.
 *
 * The box is in screen pixels, so without this the toolbar stays put and the
 * selection slides out from under it. Scrolls do not bubble, so it listens on
 * the way down instead.
 */
export function useFollowSelection(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  editorRef: RefObject<CodeEditorHandle | null>,
  onMove: (box: SelectionBox) => void,
) {
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;
    const follow = () => {
      const view = editorRef.current?.view;
      if (view && !view.state.selection.main.empty) onMove(selectionBox(view));
    };
    container.addEventListener('scroll', follow, true);
    return () => container.removeEventListener('scroll', follow, true);
  }, [open, containerRef, editorRef, onMove]);
}
