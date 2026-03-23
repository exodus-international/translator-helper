'use client';

import { Button } from '@/components/ui/button';
import { MessageSquare, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface SuggestionInlineToolbarProps {
  onComment: () => void;
  onSuggestEdit: () => void;
  position: { x: number; y: number };
  /** Ref to the container element for computing viewport-relative position */
  containerRef?: React.RefObject<HTMLElement | null>;
}

export function SuggestionInlineToolbar({ onComment, onSuggestEdit, position, containerRef }: SuggestionInlineToolbarProps) {
  const [isVisible, setIsVisible] = useState(true);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const viewportX = rect.left + position.x;
    const viewportY = rect.top + position.y;

    // Position above the selection by default
    let top = viewportY - 46;
    // If that would go off-screen, position below instead
    if (top < 8) {
      top = viewportY + 28;
    }

    // Clamp left to stay within viewport
    const el = toolbarRef.current;
    const toolbarWidth = el?.offsetWidth ?? 200;
    const left = Math.max(8, Math.min(viewportX, window.innerWidth - toolbarWidth - 8));

    setCoords({ left, top });
  }, [position.x, position.y, containerRef]);

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

  const toolbar = (
    <div
      ref={toolbarRef}
      className="fixed z-[100] flex gap-1 bg-white border border-gray-300 rounded-md shadow-lg p-1"
      style={{
        left: `${coords.left}px`,
        top: `${coords.top}px`,
      }}
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
        <MessageSquare className="h-4 w-4 mr-1" />
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
        <Pencil className="h-4 w-4 mr-1" />
        Suggest edit
      </Button>
    </div>
  );

  return createPortal(toolbar, document.body);
}
