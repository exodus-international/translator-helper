'use client';

import { Button } from '@/components/ui/button';
import { useToolbarPlacement, type SelectionBox } from '@/components/editor/toolbar-placement';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { MessageSquare, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface SuggestionInlineToolbarProps {
  onComment: () => void;
  onSuggestEdit: () => void;
  /** The selection it acts on, which it sits above -- or below, without room. */
  position: SelectionBox;
  /** The pane the editor is in, which the toolbar stays inside. */
  containerRef?: React.RefObject<HTMLElement | null>;
}

export function SuggestionInlineToolbar({
  onComment,
  onSuggestEdit,
  position,
  containerRef,
}: SuggestionInlineToolbarProps) {
  const [isVisible, setIsVisible] = useState(true);
  const isMobile = useIsMobile();
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Placed as the formatting toolbar is. It used to go 46px above a point just
  // under the selection's last line -- onto that line, over the words a
  // reviewer had picked out to comment on.
  const coords = useToolbarPlacement(toolbarRef, position, containerRef);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 1000);
  };

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  if (!isVisible) return null;

  // On a phone the OS draws its own menu over a touch selection, so a toolbar
  // placed above the selection would fight it for the same spot. The actions
  // dock to the bottom of the screen instead, sized for a thumb.
  if (isMobile) {
    return createPortal(
      <div
        role="toolbar"
        aria-label="Selection actions"
        className="fixed inset-x-0 bottom-0 z-50 flex gap-2 border-t bg-popover p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-lg"
      >
        <Button variant="outline" className="h-11 flex-1" onClick={() => { onComment(); setIsVisible(false); }}>
          <MessageSquare data-icon="inline-start" />
          Comment
        </Button>
        <Button className="h-11 flex-1" onClick={() => { onSuggestEdit(); setIsVisible(false); }}>
          <Pencil data-icon="inline-start" />
          Suggest edit
        </Button>
      </div>,
      document.body,
    );
  }

  const toolbar = (
    <div
      ref={toolbarRef}
      className={cn(
        'fixed z-[100] flex gap-1 bg-popover text-popover-foreground border rounded-md shadow-lg p-1 transition-opacity',
        coords ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      style={{ left: coords?.left ?? -9999, top: coords?.top ?? -9999 }}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          onComment();
          setIsVisible(false);
        }}
        className="h-8 px-2"
      >
        <MessageSquare />
        Comment
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          onSuggestEdit();
          setIsVisible(false);
        }}
        className="h-8 px-2"
      >
        <Pencil />
        Suggest edit
      </Button>
    </div>
  );

  return createPortal(toolbar, document.body);
}
