'use client';

import { GripHorizontal } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
  PANE_INSET,
  WINDOW_MARGIN,
  clampToViewport,
  initialFloatingPoint,
  type FloatingPoint,
} from './floating-window-placement';

interface FloatingSuggestionWindowProps {
  /** Names the window, for sighted users and for a screen reader. */
  title: string;
  /** The pane it opens over: where it starts, and the space it belongs to. */
  containerRef: RefObject<HTMLElement | null>;
  /** The form. */
  children: ReactNode;
  /** How much of its pane the window may take, up to `maxWidth`. */
  widthRatio?: number;
  maxWidth?: number;
  className?: string;
}

const MOVE_STEP = 10;
const MOVE_STEP_LARGE = 40;
const MIN_WIDTH = 240;

/**
 * The box a comment or suggestion is written in, while the text it is about
 * stays readable underneath.
 *
 * It used to be pinned to a corner of the editor, which put it on top of the
 * passage somebody had just selected -- and asking them to comment on words
 * they could no longer see. There was no way to move it. Now the title bar is
 * a handle: drag it anywhere on screen, or focus it and use the arrow keys. It
 * is drawn in a portal so it can leave the pane without being clipped by it,
 * and every move is kept inside the viewport.
 */
export function FloatingSuggestionWindow({
  title,
  containerRef,
  children,
  widthRatio = 0.75,
  maxWidth = Number.POSITIVE_INFINITY,
  className,
}: FloatingSuggestionWindowProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState<FloatingPoint | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: FloatingPoint } | null>(null);

  // The viewport, less any classic scrollbar. Fixed positioning is measured
  // from the same edge, so this is what "on screen" means here.
  const viewport = () => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  });

  /**
   * Measures the panel and puts it in the pane, or pulls it back on screen.
   * The width follows the pane rather than the window, so a comment on a half
   * of the screen does not cover the other half. On a narrow screen the form
   * takes the room it has, as it did when it was anchored with inset-x.
   */
  const place = useCallback(() => {
    const panel = panelRef.current;
    const pane = containerRef.current?.getBoundingClientRect();
    const viewportSize = viewport();
    const available = viewportSize.width - 2 * WINDOW_MARGIN;
    const paneWidth = pane?.width ?? available;
    const paneTarget = Math.min(maxWidth, paneWidth * widthRatio, Math.max(0, paneWidth - 2 * PANE_INSET));
    const nextWidth =
      viewportSize.width < 640 ? available : Math.min(available, Math.max(MIN_WIDTH, paneTarget));
    const measured = { width: panel?.offsetWidth ?? nextWidth, height: panel?.offsetHeight ?? 0 };

    setWidth(nextWidth);
    setPoint((current) => {
      if (current) {
        const clamped = clampToViewport(current, measured, viewportSize);
        return clamped.x === current.x && clamped.y === current.y ? current : clamped;
      }
      return initialFloatingPoint(
        pane ?? { left: 0, top: 0, right: viewportSize.width },
        { width: nextWidth, height: measured.height },
        viewportSize,
      );
    });
  }, [containerRef, maxWidth, widthRatio]);

  // Before paint, so the window never appears at the top-left and jumps across.
  // Runs once more after the first measuring pass, now at its final width.
  useLayoutEffect(() => {
    place();
  }, [place, width]);

  // A window may hang off the bottom after the browser is resized, or after
  // the form has grown. Pull it back rather than leave it half out of reach.
  // The pane is watched too: a rail folding away changes its width without
  // changing the window's.
  useEffect(() => {
    const onResize = () => place();
    window.addEventListener('resize', onResize);

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
    if (panelRef.current) observer?.observe(panelRef.current);
    if (containerRef.current) observer?.observe(containerRef.current);

    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [place, containerRef]);

  // Focus after the window is on screen. `autoFocus` on the field cannot do
  // it: the first commit is still hidden, and a hidden subtree refuses focus.
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!point || focusedRef.current) return;
    const field = panelRef.current?.querySelector<HTMLTextAreaElement>('textarea');
    if (!field) return;
    field.focus();
    focusedRef.current = true;
  }, [point]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || !point) return;
    // Dragging must not start a text selection, and must not take the caret
    // out of the form's fields any more than picking the window up should.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: point,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !panel) return;
    setPoint(
      clampToViewport(
        {
          x: drag.origin.x + event.clientX - drag.startX,
          y: drag.origin.y + event.clientY - drag.startY,
        },
        { width: panel.offsetWidth, height: panel.offsetHeight },
        viewport(),
      ),
    );
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!point) return;
    const step = event.shiftKey ? MOVE_STEP_LARGE : MOVE_STEP;
    const movement: Record<string, FloatingPoint> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const delta = movement[event.key];
    const panel = panelRef.current;
    if (!delta || !panel) return;
    event.preventDefault();
    setPoint((current) =>
      current
        ? clampToViewport(
            { x: current.x + delta.x, y: current.y + delta.y },
            { width: panel.offsetWidth, height: panel.offsetHeight },
            viewport(),
          )
        : current,
    );
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      style={{
        left: point?.x ?? 0,
        top: point?.y ?? 0,
        width: width ?? undefined,
        position: 'fixed',
        visibility: point ? 'visible' : 'hidden',
      }}
      className={cn(
        'z-50 flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-lg border bg-background shadow-lg',
        className,
      )}
    >
      <div
        role="group"
        tabIndex={0}
        aria-label={`Move ${title.toLowerCase()} window`}
        aria-roledescription="draggable window"
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
        title="Drag to move"
        className="flex shrink-0 cursor-grab touch-none select-none items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm font-medium active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => {
          dragRef.current = null;
        }}
        onKeyDown={onKeyDown}
      >
        <GripHorizontal className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>{title}</span>
      </div>
      <div className="overflow-y-auto p-4">{children}</div>
    </div>,
    document.body,
  );
}
