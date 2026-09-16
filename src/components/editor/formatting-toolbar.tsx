'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Bold,
  CornerDownLeft,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type FormattingAction } from './formatting';

interface FormattingToolbarProps {
  onFormat: (action: FormattingAction) => void;
  position: { x: number; y: number };
  /** Ref to the container element for computing viewport-relative position. */
  containerRef?: React.RefObject<HTMLElement | null>;
}

const GROUPS: { action: FormattingAction; label: string; hint: string; icon: typeof Bold }[][] = [
  [
    { action: 'bold', label: 'Bold', hint: '**text**', icon: Bold },
    { action: 'italic', label: 'Italic', hint: '*text*', icon: Italic },
    { action: 'strikethrough', label: 'Strikethrough', hint: '~~text~~', icon: Strikethrough },
    { action: 'link', label: 'Link', hint: '[text](url)', icon: Link },
  ],
  [
    { action: 'heading1', label: 'Heading 1', hint: '# text', icon: Heading1 },
    { action: 'heading2', label: 'Heading 2', hint: '## text', icon: Heading2 },
    { action: 'heading3', label: 'Heading 3', hint: '### text', icon: Heading3 },
  ],
  [
    { action: 'bulletList', label: 'Bulleted list', hint: '* item', icon: List },
    { action: 'numberedList', label: 'Numbered list', hint: '1. item', icon: ListOrdered },
    { action: 'quote', label: 'Quote', hint: '> text', icon: Quote },
  ],
  [
    { action: 'lineBreak', label: 'Line break', hint: '<br>', icon: CornerDownLeft },
    { action: 'clear', label: 'Remove formatting', hint: 'Strip emphasis markers', icon: Eraser },
  ],
];

/**
 * The formatting a selection can take, on the selection.
 *
 * These are the things the content library asks of its prose that are not
 * visible while you type them: bold, italic and strikethrough are invisible in
 * Preview, a heading level is two or three characters you have to count, a line
 * break inside a paragraph is `<br>` rather than an empty line, and text pasted
 * from elsewhere arrives with markers that need stripping.
 *
 * It is deliberately chrome-free -- a strip of buttons floating over the text,
 * painted from the popover tokens -- and it does not take focus, so the
 * selection it acts on survives the click. There is no comment button: that
 * belongs to the suggestion flow, which owns the selection elsewhere.
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

    const width = toolbarRef.current?.offsetWidth ?? 320;
    const left = Math.max(8, Math.min(viewportX, window.innerWidth - width - 8));

    setCoords({ left, top });
  }, [position.x, position.y, containerRef]);

  if (typeof document === 'undefined') return null;

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
      {GROUPS.map((group, index) => (
        <span
          key={index}
          className="flex items-center gap-0.5 [&:not(:first-child)]:ml-0.5 [&:not(:first-child)]:border-l [&:not(:first-child)]:pl-1.5"
        >
          {group.map(({ action, label, hint, icon: Icon }) => (
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
        </span>
      ))}
    </div>,
    document.body,
  );
}
