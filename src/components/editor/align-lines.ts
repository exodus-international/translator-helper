/**
 * Lines the other editor up with the line being worked on.
 *
 * A translation is written line for line against its source -- line 12 of one
 * is line 12 of the other -- but the two wrap differently, so the same line
 * sits at a different height in each. Moving to a line in one pane used to
 * centre its counterpart, wherever the line moved to was; now the counterpart
 * comes level with it.
 *
 * Only on that move. Scrolling either pane moves that pane alone: translations
 * drift from their source -- a paragraph split in two, a section not written
 * yet -- and a translator reading one part of the source while writing another
 * has to be able to leave the two apart.
 */

import type { EditorView } from '@codemirror/view';

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

/**
 * The top of the cursor's line, or -- while the cursor is out of sight, as it
 * is for a moment after a key takes it past the edge -- the line at the top of
 * the pane.
 */
function anchorOf(view: EditorView): Anchor {
  const top = scrollerTop(view);
  const documentTop = view.documentTop;
  const cursor = view.lineBlockAt(view.state.selection.main.head);
  const cursorTop = documentTop + cursor.top;
  if (cursorTop >= top && cursorTop + cursor.height <= top + view.scrollDOM.clientHeight) {
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

const SETTLE = {};
/**
 * Placings after the first. Each one lands closer, and a pane that cannot
 * scroll as far as the line needs -- near the end of a shorter document --
 * would otherwise be pushed at forever.
 */
const PASSES = 3;

/**
 * Places `to` again, once both editors have measured what they now show.
 *
 * The heights of lines an editor has not drawn are estimates, and a long jump
 * lands among them, so the first placing comes to rest lines away from where it
 * aimed. This runs after each editor's next measure, once its own heights are
 * real, and reads the leader afresh rather than trusting where it was estimated
 * to be.
 */
function settle(from: EditorView, to: EditorView, passes: number) {
  const place = () => {
    const delta = misalignment(to, anchorOf(from));
    // Under a pixel is rounding, and chasing it would jitter.
    if (Math.abs(delta) < 1) return;
    to.scrollDOM.scrollTop += delta;
    if (passes > 1) settle(from, to, passes - 1);
  };
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

/** Scrolls `to` so the line with `from`'s cursor sits at the same height in both. */
export function alignLines(from: EditorView, to: EditorView) {
  // A pane that is not on screen -- the other tab on a phone -- has no height
  // to line anything up in.
  if (!to.scrollDOM.clientHeight) return;
  const delta = misalignment(to, anchorOf(from));
  if (Math.abs(delta) >= 1) to.scrollDOM.scrollTop += delta;
  settle(from, to, PASSES);
}
