/**
 * Where a floating window that can be picked up goes, and how far it may go.
 *
 * Kept apart from the component so the arithmetic can be tested without a DOM,
 * and next to the toolbar placement it shares its job with: keeping something
 * floating over the editor readable.
 */

/** Space between the window and the edge of what it may not leave. */
export const WINDOW_MARGIN = 8;
/** Space between the window and the pane it opens over. */
export const PANE_INSET = 16;

export interface FloatingPoint {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

interface Viewport {
  width: number;
  height: number;
}

/**
 * Keeps a floating window on screen.
 *
 * A window dragged too far, or one whose form grew after the viewport shrank,
 * is pulled back to the last place it can still be read. A window larger than
 * the viewport is pinned to its top-left corner rather than pushed off the
 * other side.
 */
export function clampToViewport(
  point: FloatingPoint,
  size: Size,
  viewport: Viewport,
  margin = WINDOW_MARGIN,
): FloatingPoint {
  return {
    x: Math.min(Math.max(point.x, margin), Math.max(margin, viewport.width - size.width - margin)),
    y: Math.min(Math.max(point.y, margin), Math.max(margin, viewport.height - size.height - margin)),
  };
}

/**
 * The first place a window goes: inside the top-right of its pane, as the
 * anchored form it replaces did, but never off screen.
 */
export function initialFloatingPoint(
  pane: Pick<DOMRect, 'left' | 'top' | 'right'>,
  size: Size,
  viewport: Viewport,
  inset = PANE_INSET,
): FloatingPoint {
  const x = Math.max(pane.right - inset - size.width, pane.left + inset);
  return clampToViewport({ x, y: pane.top + inset }, size, viewport);
}
