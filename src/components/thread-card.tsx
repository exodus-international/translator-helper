'use client';

import { UserAvatar } from '@/components/user-avatar';
import { SuggestionStatus, SuggestionType } from '@/generated/prisma/enums';
import { Check, MessageSquare, Pencil, PencilLine, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SuggestionWithUser } from '@/domain/suggestion/suggestion.types';
import { SuggestionForm } from './suggestion-form';
import { ThreadReplyInput } from './thread-reply-input';

const MONO_FONT = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

interface ThreadCardProps {
  suggestion: SuggestionWithUser;
  currentUserId: string;
  translationContent: string;
  isActive?: boolean;
  onReply?: (suggestionId: string, content: string) => void;
  onApply?: (suggestionId: string) => void;
  onDismiss?: (suggestionId: string) => void;
  onReopen?: (suggestionId: string) => void;
  onEdit?: (suggestionId: string, data: { comment: string; proposedText?: string }) => Promise<void> | void;
  onClick?: () => void;
  disableReopen?: boolean;
}

function formatTimeAgo(date: string) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

function getTextFromRange(suggestion: SuggestionWithUser, content: string): string {
  if (
    !content ||
    suggestion.startLine == null ||
    suggestion.endLine == null ||
    suggestion.startColumn == null ||
    suggestion.endColumn == null
  )
    return '';
  const lines = content.split('\n');
  const startLine = suggestion.startLine - 1;
  const endLine = suggestion.endLine - 1;
  const startColumn = suggestion.startColumn - 1;
  const endColumn = suggestion.endColumn - 1;

  if (startLine < 0 || endLine >= lines.length) return '';

  if (startLine === endLine) {
    return (lines[startLine] || '').substring(startColumn, endColumn);
  } else {
    const firstPart = (lines[startLine] || '').substring(startColumn);
    const lastPart = (lines[endLine] || '').substring(0, endColumn);
    const middleLines = lines.slice(startLine + 1, endLine);
    return [firstPart, ...middleLines, lastPart].join('\n');
  }
}

export function ThreadCard({
  suggestion,
  currentUserId,
  translationContent,
  isActive,
  onReply,
  onApply,
  onDismiss,
  onReopen,
  onEdit,
  onClick,
  disableReopen = false,
}: ThreadCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const isAnchored = suggestion.startLine != null;
  const canEdit = onEdit && suggestion.status === SuggestionStatus.OPEN && suggestion.user.id === currentUserId;
  const lineLabel = isAnchored ? `L${suggestion.startLine}` : 'General';
  const replies = suggestion.replies || [];

  const statusBadge =
    suggestion.status !== SuggestionStatus.OPEN ? (
      <span
        className={cn(
          'text-[10px] px-1.5 py-0.5 rounded border',
          suggestion.status === SuggestionStatus.APPLIED
            ? 'border-success/30 text-success bg-success/10'
            : 'border-border text-muted-foreground bg-muted',
        )}
      >
        {suggestion.status === SuggestionStatus.APPLIED ? 'Applied' : 'Dismissed'}
      </span>
    ) : null;

  return (
    <div
      className={cn(
        // A row in the feedback card, not a card: the list owns the dividers,
        // this owns hover and the highlight for the thread the editor is on.
        'cursor-pointer px-3 py-2.5 transition-colors hover:bg-muted/40',
        isActive && 'bg-info/5 ring-1 ring-info/30 ring-inset',
        suggestion.status !== SuggestionStatus.OPEN && 'opacity-70',
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 text-xs">
        {suggestion.type === SuggestionType.COMMENT ? (
          <MessageSquare className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <Pencil className="size-3 shrink-0 text-muted-foreground" />
        )}
        <UserAvatar name={suggestion.user.name} image={suggestion.user.image} email={suggestion.user.email} size="xs" />
        {/* min-w-0 is what lets the name give way first: without it the row
            refuses to shrink, and the timestamp wraps instead. */}
        <span className="min-w-0 truncate font-medium">{suggestion.user.name}</span>
        <span className="shrink-0 text-muted-foreground">·</span>
        <span
          className={cn(
            'shrink-0 rounded px-1 py-0.5 text-[10px]',
            isAnchored ? 'bg-info/15 text-info' : 'bg-muted text-muted-foreground',
          )}
        >
          {lineLabel}
        </span>
        <span className="shrink-0 text-muted-foreground">·</span>
        <span className="shrink-0 whitespace-nowrap text-muted-foreground">{formatTimeAgo(suggestion.createdAt)}</span>
        <span className="ml-auto shrink-0">{statusBadge}</span>
      </div>

      {/* Edit form or Comment text + diff */}
      {isEditing ? (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <SuggestionForm
            type={suggestion.type}
            initialComment={suggestion.comment ?? ''}
            initialProposedText={suggestion.proposedText ?? ''}
            isSubmitting={isEditSubmitting}
            onSubmit={async (data) => {
              setIsEditSubmitting(true);
              try {
                await onEdit!(suggestion.id, data);
                setIsEditing(false);
              } finally {
                setIsEditSubmitting(false);
              }
            }}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      ) : (
        <>
          {suggestion.comment?.trim() && (
            <p className="mt-1.5 text-sm text-foreground whitespace-pre-wrap break-words">{suggestion.comment}</p>
          )}

          {suggestion.type === SuggestionType.CHANGE && suggestion.proposedText && isAnchored && (
            <div
              className="mt-2 text-[11px] leading-5 rounded bg-muted/40 px-2 py-1.5 space-y-0.5"
              style={{ fontFamily: MONO_FONT }}
            >
              <div className="text-destructive/80 line-through whitespace-pre-wrap break-words">
                {(suggestion.status === SuggestionStatus.APPLIED && suggestion.originalText) ||
                  getTextFromRange(suggestion, translationContent) ||
                  '(text not available)'}
              </div>
              <div className="text-success whitespace-pre-wrap break-words">{suggestion.proposedText}</div>
            </div>
          )}
        </>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-border">
          {replies.map((reply) => (
            <div key={reply.id} className="text-xs">
              <div className="flex items-center gap-1.5">
                <UserAvatar name={reply.user.name} image={reply.user.image} email={reply.user.email} size="xs" />
                <span className="font-medium">{reply.user.name}</span>
                <span className="text-muted-foreground">{formatTimeAgo(reply.createdAt)}</span>
              </div>
              <p className="text-foreground whitespace-pre-wrap break-words mt-0.5">{reply.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      {suggestion.status === SuggestionStatus.OPEN && onReply && (
        <ThreadReplyInput onSubmit={(content) => onReply(suggestion.id, content)} />
      )}

      {/* Actions */}
      {suggestion.status === SuggestionStatus.OPEN && (onApply || onDismiss || canEdit) && !isEditing && (
        <div className="mt-2 flex gap-1.5">
          {suggestion.type === SuggestionType.CHANGE && isAnchored && onApply && (
            <Button
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                onApply(suggestion.id);
              }}
            >
              <Check />
              Apply
            </Button>
          )}
          {onDismiss && (
            <Button
              size="xs"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(suggestion.id);
              }}
            >
              <X />
              Dismiss
            </Button>
          )}
          {canEdit && (
            <Button
              size="xs"
              variant="outline"
              aria-label="Edit comment"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="ml-auto"
            >
              <PencilLine />
            </Button>
          )}
        </div>
      )}

      {/* Reopen action for resolved suggestions */}
      {suggestion.status !== SuggestionStatus.OPEN && onReopen && !disableReopen && (
        <div className="mt-2 flex gap-1.5">
          <Button
            size="xs"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onReopen(suggestion.id);
            }}
          >
            <RotateCcw />
            Reopen
          </Button>
        </div>
      )}
    </div>
  );
}
