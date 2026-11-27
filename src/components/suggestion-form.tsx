'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SuggestionType } from '@/generated/prisma/enums';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

interface SuggestionFormProps {
  type: SuggestionType;
  initialComment?: string;
  initialProposedText?: string;
  /** The text a change would replace. A replacement equal to it changes nothing and cannot be saved. */
  currentText?: string;
  onSubmit: (data: { comment: string; proposedText?: string }) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function SuggestionForm({
  type,
  initialComment = '',
  initialProposedText = '',
  currentText,
  onSubmit,
  onCancel,
  isSubmitting = false,
  onDirtyChange,
}: SuggestionFormProps) {
  const [comment, setComment] = useState(initialComment);
  const [proposedText, setProposedText] = useState(initialProposedText);
  const proposedTextRef = useRef<HTMLTextAreaElement>(null);
  // Two of these forms can be on screen at once (the sidebar's edit form and
  // the floating one), so the ids labels point at must not be hardcoded.
  const fieldId = useId();
  const commentId = `${fieldId}-comment`;
  const proposedTextId = `${fieldId}-proposed-text`;

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

  const isChange = type === SuggestionType.CHANGE;
  const changesNothing = isChange && currentText !== undefined && proposedText === currentText;
  const cannotSave = isChange && (!proposedText.trim() || changesNothing);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cannotSave) {
      return;
    }

    onSubmit({
      comment: comment.trim(),
      proposedText: isChange ? proposedText : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isChange && (
        <div>
          <Label htmlFor={proposedTextId}>Proposed replacement</Label>
          <Textarea
            ref={proposedTextRef}
            id={proposedTextId}
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
          {changesNothing ? (
            <p className="text-[11px] text-warning mt-1">This is the text as it is now. Write the new wording here.</p>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-1">Whitespace and spaces are preserved as-is.</p>
          )}
        </div>
      )}

      <div>
        <Label htmlFor={commentId}>{isChange ? 'Comment (optional)' : 'Comment'}</Label>
        <Textarea
          id={commentId}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment..."
          rows={1}
          className="mt-1 min-h-10"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="max-md:h-11">
          Cancel
        </Button>
        <Button type="submit" className="max-md:h-11" disabled={isSubmitting || cannotSave}>
          {isSubmitting ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
