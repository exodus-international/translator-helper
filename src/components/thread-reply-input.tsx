'use client';

import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { useRef, useState } from 'react';

interface ThreadReplyInputProps {
  onSubmit: (content: string) => void;
  disabled?: boolean;
}

export function ThreadReplyInput({ onSubmit, disabled }: ThreadReplyInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <div className="flex items-start gap-1.5 mt-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Reply..."
        disabled={disabled}
        rows={1}
        className="flex-1 text-xs px-2 py-1.5 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none overflow-hidden"
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
