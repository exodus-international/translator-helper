'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Bold, CornerDownLeft, Eraser, Italic } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type FormattingAction = 'bold' | 'italic' | 'clear' | 'lineBreak';

interface FormattingToolbarProps {
  onFormat: (action: FormattingAction) => void;
  position: { x: number; y: number };
  /** Ref to the container element for computing viewport-relative position. */
  containerRef?: React.RefObject<HTMLElement | null>;
}

/**
 * The formatting a selection can take, on the selection.
 *
 * These are the only four things the content library asks of its prose that
 * are not visible while you type them: bold and italic wrap the text, the
 * markers are invisible in Preview, and a line break inside a paragraph is
 * `<br>`, not an empty line. A translator who has to remember which is which
 * keeps a second document open; four buttons on the selection remove the
 * question.
 *
 * Chrome-free by design: it paints no background of its own, so it reads as
 * buttons floating over the text rather than another panel.
 */
export function FormattingToolbar({ onFormat, position, containerRef }: FormattingToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const viewportX = rect.left + position.x;
    const viewportY = rect.top + position.y;

    // Above the selection by default; below it when that would leave the view.
    let top = viewportY - 44;
    if (top < 8) top = viewportY + 28;

    const width = toolbarRef.current?.offsetWidth ?? 160;
    const left = Math.max(8, Math.min(viewportX, window.innerWidth - width - 8));

    setCoords({ left, top });
  }, [position.x, position.y, containerRef]);

  if (typeof document === 'undefined') return null;

  const actions: { action: FormattingAction; label: string; hint: string; icon: typeof Bold }[] = [
    { action: 'bold', label: 'Bold', hint: 'Wrap in ** **', icon: Bold },
    { action: 'italic', label: 'Italic', hint: 'Wrap in * *', icon: Italic },
    { action: 'lineBreak', label: 'Line break', hint: 'Insert <br>', icon: CornerDownLeft },
    { action: 'clear', label: 'Remove formatting', hint: 'Strip emphasis markers', icon: Eraser },
  ];

  return createPortal(
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Formatting"
      style={{ left: coords?.left ?? -9999, top: coords?.top ?? -9999, position: 'fixed' }}
      className={cn(
        'z-50 flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md transition-opacity',
        coords ? 'opacity-100' : 'opacity-0',
      )}
      // Keep the selection: a button that takes focus would collapse it.
      onMouseDown={(event) => event.preventDefault()}
    >
      {actions.map(({ action, label, hint, icon: Icon }) => (
        <Button
          key={action}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          title={`${label} — ${hint}`}
          onClick={() => onFormat(action)}
        >
          <Icon />
        </Button>
      ))}
    </div>,
    document.body,
  );
}
