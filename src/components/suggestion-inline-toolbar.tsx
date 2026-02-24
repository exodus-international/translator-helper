'use client';

import { Button } from '@/components/ui/button';
import { MessageSquare, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface SuggestionInlineToolbarProps {
  onComment: () => void;
  onSuggestEdit: () => void;
  position: { x: number; y: number };
}

export function SuggestionInlineToolbar({ onComment, onSuggestEdit, position }: SuggestionInlineToolbarProps) {
  const [isVisible, setIsVisible] = useState(true);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [adjustedLeft, setAdjustedLeft] = useState(position.x);

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const toolbarWidth = el.offsetWidth;
    // Measure the nearest positioned ancestor (the "relative" container)
    const parent = el.offsetParent as HTMLElement | null;
    const parentWidth = parent?.clientWidth ?? Infinity;
    const maxLeft = parentWidth - toolbarWidth - 8;
    setAdjustedLeft(Math.max(8, Math.min(position.x, maxLeft)));
  }, [position.x]);

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

  console.log('adjustedLeft', adjustedLeft);
  console.log('position.x', position.x);
  // console.log('containerWidth', containerWidth);

  return (
    <div
      ref={toolbarRef}
      className="absolute z-50 flex gap-1 bg-white border border-gray-300 rounded-md shadow-lg p-1"
      style={{
        left: `${adjustedLeft}px`,
        top: `${position.y - 70}px`,
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
}
