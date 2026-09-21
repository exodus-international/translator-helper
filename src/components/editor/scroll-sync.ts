'use client';

/**
 * Keeps the source and translation editors in step.
 *
 * A translation is written line for line against its source -- line 12 of one
 * is line 12 of the other -- but the two wrap differently, so the same line
 * sits at a different height in each. Clicking a line used to centre its
 * counterpart, wherever the clicked one was, and scrolling one pane left the
 * other where it was. Now the pane being worked in leads and the other
 * follows: the line with the cursor, while it is in sight, sits at the same
 * height in both, and otherwise the line at the top of the pane does.
 *
 * "Being worked in" is whichever pane was last clicked, scrolled or typed in,
 * and only its scrolling is followed. The follower's own scroll events are the
 * ones this sets off, and following those back would have each pane chase the
 * other -- visibly, wherever one cannot scroll as far as the other. The cursor
 * anchors only in the pane it last moved in: the other pane's cursor is
 * wherever it was left.
 */

import type { EditorView } from '@codemirror/view';
import { useEffect, useRef, type RefObject } from 'react';
import type { CodeEditorHandle } from './code-editor';

export type SyncedPane = 'source' | 'translation';

const other = (pane: SyncedPane): SyncedPane => (pane === 'source' ? 'translation' : 'source');

/** A point in a line, and where the leading pane shows it. */
interface Anchor {
  line: number;
  /** How far down the line the point is, as a share of the line's height. */
  fraction: number;
  /** Pixels between the top of the scroller and the point. */
  offset: number;
}

function scrollerTop(view: EditorView) {
  return view.scrollDOM.getBoundingClientRect().top;
}

function anchorOf(view: EditorView, onCursor: boolean): Anchor {
  const top = scrollerTop(view);
  const documentTop = view.documentTop;
  const cursor = view.lineBlockAt(view.state.selection.main.head);
  const cursorTop = documentTop + cursor.top;
  if (onCursor && cursorTop >= top && cursorTop + cursor.height <= top + view.scrollDOM.clientHeight) {
    return { line: view.state.doc.lineAt(cursor.from).number, fraction: 0, offset: cursorTop - top };
  }
  // Scrolled to the top, the first line starts below the editor's padding
  // rather than at the edge: the point is that line's top, not above it.
  const height = top - documentTop;
  const block = view.lineBlockAtHeight(height);
  const into = Math.min(Math.max(height - block.top, 0), block.height);
  return {
    line: view.state.doc.lineAt(block.from).number,
    fraction: block.height > 0 ? into / block.height : 0,
    offset: documentTop + block.top + into - top,
  };
}

/** How far `view` has to scroll to show the anchor where the leader does. */
function misalignment(view: EditorView, anchor: Anchor) {
  const { doc } = view.state;
  const block = view.lineBlockAt(doc.line(Math.min(Math.max(anchor.line, 1), doc.lines)).from);
  const at = view.documentTop + block.top + anchor.fraction * block.height;
  return at - (scrollerTop(view) + anchor.offset);
}

function scrollBy(view: EditorView, delta: number) {
  // Under a pixel is rounding, and chasing it would jitter.
  if (Math.abs(delta) >= 1) view.scrollDOM.scrollTop += delta;
}

const SETTLE = {};

/**
 * Places `to` again, once both editors have measured what they now show.
 *
 * The heights of lines an editor has not drawn are estimates, and a long jump
 * lands among them -- in both panes -- so the first placement comes to rest
 * lines away from where it aimed, and nothing scrolls to say so. This runs
 * after each editor's next measure, once its own heights are real, and reads
 * the leader afresh rather than trusting where it was estimated to be.
 */
function settle(from: EditorView, to: EditorView, onCursor: boolean) {
  const place = () => scrollBy(to, misalignment(to, anchorOf(from, onCursor)));
  for (const view of [from, to]) {
    view.requestMeasure({
      key: SETTLE,
      read: () => null,
      // After the measure, not in it: an editor whose heights changed puts
      // its scroll position back once the writes have run, over theirs.
      write: () => queueMicrotask(place),
    });
  }
}

function follow(from: EditorView, to: EditorView, onCursor: boolean) {
  // A pane that is not on screen -- the other tab on a phone -- has no height
  // to line anything up in.
  if (!to.scrollDOM.clientHeight) return;
  scrollBy(to, misalignment(to, anchorOf(from, onCursor)));
  settle(from, to, onCursor);
}

type Editors = Record<SyncedPane, RefObject<CodeEditorHandle | null>>;

const viewsOf = (editors: Editors): Record<SyncedPane, EditorView | null> => ({
  source: editors.source.current?.view ?? null,
  translation: editors.translation.current?.view ?? null,
});

/**
 * Scroll-locks the two editors while `enabled`. Returns the call for a cursor
 * that has moved in one of them, which lines the other up with it.
 */
export function useScrollSync(
  source: RefObject<CodeEditorHandle | null>,
  translation: RefObject<CodeEditorHandle | null>,
  enabled: boolean,
) {
  const leader = useRef<SyncedPane | null>(null);
  const cursor = useRef<SyncedPane | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const editors = { source, translation };
    // Anything outside both editors -- the suggestion list, a toolbar --
    // leaves neither leading, so what it scrolls stays where it puts it.
    const claim = (event: Event) => {
      const panes = viewsOf(editors);
      const target = event.target as Node;
      leader.current = panes.source?.dom.contains(target)
        ? 'source'
        : panes.translation?.dom.contains(target)
          ? 'translation'
          : null;
    };
    // Scroll events do not bubble, but they can be caught on the way down.
    const onScroll = (event: Event) => {
      const pane = leader.current;
      if (!pane) return;
      const panes = viewsOf(editors);
      const from = panes[pane];
      const to = panes[other(pane)];
      if (!from || !to) return;
      const onCursor = cursor.current === pane;
      if (event.target === from.scrollDOM) follow(from, to, onCursor);
      // The follower moving is this moving it, or it drawing lines it had
      // only estimated: check it against the leader once it has measured,
      // but never lead from it.
      else if (event.target === to.scrollDOM) settle(from, to, onCursor);
    };
    const options = { capture: true, passive: true };
    const claims = ['pointerdown', 'wheel', 'touchstart', 'keydown'];
    for (const type of claims) document.addEventListener(type, claim, options);
    document.addEventListener('scroll', onScroll, options);
    return () => {
      for (const type of claims) document.removeEventListener(type, claim, options);
      document.removeEventListener('scroll', onScroll, options);
      leader.current = null;
      cursor.current = null;
    };
  }, [enabled, source, translation]);

  return (pane: SyncedPane) => {
    if (!enabled) return;
    cursor.current = pane;
    const panes = viewsOf({ source, translation });
    const from = panes[pane];
    const to = panes[other(pane)];
    if (from && to) follow(from, to, true);
  };
}
