'use client';

import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { useState } from 'react';

interface ThreadReplyInputProps {
  onSubmit: (content: string) => void;
  disabled?: boolean;
}

export function ThreadReplyInput({ onSubmit, disabled }: ThreadReplyInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex items-center gap-1.5 mt-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Reply..."
        disabled={disabled}
        className="flex-1 text-xs px-2 py-1.5 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className="h-7 w-7 p-0 shrink-0"
      >
        <Send className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
