'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { type FormattingAction } from './formatting';
import { useToolbarPlacement, type SelectionBox } from './toolbar-placement';

interface FormattingToolbarProps {
  onFormat: (action: FormattingAction) => void;
  /** The selection it acts on, which it sits above -- or below, without room. */
  position: SelectionBox;
  /** What the selection already carries; those buttons show as on. */
  active?: readonly FormattingAction[];
  /**
   * The pane the editor is in. The toolbar stays inside it, so it covers
   * neither the pane's header nor the pane beside it.
   */
  containerRef?: React.RefObject<HTMLElement | null>;
}

/** Commands rather than states: they act on the text and have nothing to be "on". */
const COMMANDS: readonly FormattingAction[] = ['lineBreak', 'clear'];

interface Tool {
  action: FormattingAction;
  label: string;
  /** What it writes, shown as code -- or, with `plain`, what it does. */
  hint: string;
  plain?: boolean;
  icon: typeof Bold;
}

const GROUPS: Tool[][] = [
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
    {
      action: 'clear',
      label: 'Remove formatting',
      hint: 'Strips bold, italic and strikethrough',
      plain: true,
      icon: Eraser,
    },
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
 *
 * A button whose formatting the selection already has is shown pressed, since
 * clicking it takes that formatting off. Selecting a bold word and seeing Bold
 * lit is the difference between reading the click as "undo" and guessing.
 *
 * Each button's tooltip names it and shows the Markdown it writes, which is
 * also how a translator learns to type it without the toolbar. They open on
 * the toolbar's far side from the selection, so they never cover it either.
 */
export function FormattingToolbar({ onFormat, position, active = [], containerRef }: FormattingToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Above the selection, or below it without the room, and never on it.
  const coords = useToolbarPlacement(toolbarRef, position, containerRef);

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
      {/* A short wait before the first, so crossing the bar to a button does
          not flash each one on the way; after that they follow the pointer. */}
      <TooltipProvider delay={300}>
        {GROUPS.map((group, index) => (
          <span
            key={index}
            className="flex items-center gap-0.5 [&:not(:first-child)]:ml-0.5 [&:not(:first-child)]:border-l [&:not(:first-child)]:pl-1.5"
          >
            {group.map(({ action, label, hint, plain, icon: Icon }) => {
              const toggle = !COMMANDS.includes(action);
              const pressed = toggle && active.includes(action);
              return (
                <Tooltip key={action}>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={label}
                        // Only the toggles report a state: a command has none to report.
                        aria-pressed={toggle ? pressed : undefined}
                        className={cn(
                          pressed && 'bg-info/15 text-info hover:bg-info/20 hover:text-info dark:hover:bg-info/25',
                        )}
                        onClick={() => onFormat(action)}
                      />
                    }
                  >
                    <Icon />
                  </TooltipTrigger>
                  <TooltipContent side={coords?.below ? 'bottom' : 'top'} sideOffset={8}>
                    <span className="font-medium">{label}</span>
                    <span className={cn('ml-2 opacity-70', !plain && 'font-mono')}>{hint}</span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </span>
        ))}
      </TooltipProvider>
    </div>,
    document.body,
  );
}
