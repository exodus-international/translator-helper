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

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseLeave = () => {
    // Set timeout to hide after 1 second
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 1000);
  };

  const handleMouseEnter = () => {
    // Cancel hide timeout if user moves mouse back
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className="absolute z-50 flex gap-1 bg-white border border-gray-300 rounded-md shadow-lg p-1"
      style={{
        left: `${position.x}px`,
        top: `${position.y - 40}px`,
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
