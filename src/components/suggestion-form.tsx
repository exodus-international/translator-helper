'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SuggestionType } from '@prisma/client';
import { useCallback, useEffect, useRef, useState } from 'react';

interface SuggestionFormProps {
  type: SuggestionType;
  initialComment?: string;
  initialProposedText?: string;
  onSubmit: (data: { comment: string; proposedText?: string }) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function SuggestionForm({
  type,
  initialComment = '',
  initialProposedText = '',
  onSubmit,
  onCancel,
  isSubmitting = false,
  onDirtyChange,
}: SuggestionFormProps) {
  const [comment, setComment] = useState(initialComment);
  const [proposedText, setProposedText] = useState(initialProposedText);
  const proposedTextRef = useRef<HTMLTextAreaElement>(null);

  // Track dirty state
  const isDirty = comment !== initialComment || proposedText !== initialProposedText;
  const prevDirtyRef = useRef(false);
  useEffect(() => {
    if (isDirty !== prevDirtyRef.current) {
      prevDirtyRef.current = isDirty;
      onDirtyChange?.(isDirty);
    }
  }, [isDirty, onDirtyChange]);

  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Update proposedText when initialProposedText changes (e.g., when selection changes)
  useEffect(() => {
    if (type === SuggestionType.CHANGE && initialProposedText) {
      setProposedText(initialProposedText);
      requestAnimationFrame(() => autoResize(proposedTextRef.current));
    }
  }, [initialProposedText, type, autoResize]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === SuggestionType.CHANGE && !proposedText.trim()) {
      return;
    }

    onSubmit({
      comment: comment.trim(),
      proposedText: type === SuggestionType.CHANGE ? proposedText : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="comment">Comment</Label>
        <Textarea
          id="comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment..."
          rows={1}
          className="mt-1 min-h-10"
        />
      </div>

      {type === SuggestionType.CHANGE && (
        <div>
          <Label htmlFor="proposedText">Proposed replacement</Label>
          <Textarea
            ref={proposedTextRef}
            id="proposedText"
            value={proposedText}
            onChange={(e) => {
              setProposedText(e.target.value);
              autoResize(e.target);
            }}
            placeholder="Enter the suggested text..."
            rows={1}
            required
            className="mt-1 font-mono overflow-hidden"
          />
          <p className="text-[11px] text-muted-foreground mt-1">Whitespace and spaces are preserved as-is.</p>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || (type === SuggestionType.CHANGE && !proposedText.trim())}>
          {isSubmitting ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
