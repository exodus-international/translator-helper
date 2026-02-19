'use client';

import { SuggestionStatus, SuggestionType } from '@prisma/client';
import { Check, MessageSquare, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SuggestionWithUser } from './monaco-suggestion-decorations';
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
  onClick?: () => void;
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
  if (!content || suggestion.startLine == null || suggestion.endLine == null || suggestion.startColumn == null || suggestion.endColumn == null) return '';
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
  onClick,
}: ThreadCardProps) {
  const isAnchored = suggestion.startLine != null;
  const lineLabel = isAnchored ? `L${suggestion.startLine}` : 'General';
  const replies = suggestion.replies || [];

  const statusBadge = suggestion.status !== SuggestionStatus.OPEN ? (
    <span
      className={cn(
        'text-[10px] px-1.5 py-0.5 rounded border',
        suggestion.status === SuggestionStatus.APPLIED
          ? 'border-green-200 text-green-700 bg-green-50'
          : 'border-gray-200 text-gray-500 bg-gray-50',
      )}
    >
      {suggestion.status === SuggestionStatus.APPLIED ? 'Applied' : 'Dismissed'}
    </span>
  ) : null;

  return (
    <div
      className={cn(
        'rounded-md border bg-white px-3 py-2.5 cursor-pointer transition-colors',
        'hover:bg-muted/40',
        isActive ? 'border-blue-400 bg-blue-50/50 ring-1 ring-blue-200' : 'border-border',
        suggestion.status !== SuggestionStatus.OPEN && 'opacity-70',
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 text-xs">
        {suggestion.type === SuggestionType.COMMENT ? (
          <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <Pencil className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium truncate">{suggestion.user.name}</span>
        <span className="text-muted-foreground">·</span>
        <span className={cn(
          'text-[10px] px-1 py-0.5 rounded',
          isAnchored ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600',
        )}>
          {lineLabel}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{formatTimeAgo(suggestion.createdAt)}</span>
        <span className="ml-auto">{statusBadge}</span>
      </div>

      {/* Comment text */}
      {suggestion.comment?.trim() && (
        <p className="mt-1.5 text-sm text-gray-700 whitespace-pre-wrap break-words">
          {suggestion.comment}
        </p>
      )}

      {/* Diff preview for CHANGE suggestions */}
      {suggestion.type === SuggestionType.CHANGE && suggestion.proposedText && isAnchored && (
        <div
          className="mt-2 text-[11px] leading-5 rounded bg-muted/40 px-2 py-1.5 space-y-0.5"
          style={{ fontFamily: MONO_FONT }}
        >
          <div className="text-red-700/80 line-through whitespace-pre-wrap break-words">
            {getTextFromRange(suggestion, translationContent) || '(text not available)'}
          </div>
          <div className="text-green-800 whitespace-pre-wrap break-words">
            {suggestion.proposedText}
          </div>
        </div>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-gray-200">
          {replies.map((reply) => (
            <div key={reply.id} className="text-xs">
              <div className="flex items-baseline gap-1.5">
                <span className="font-medium">{reply.user.name}</span>
                <span className="text-muted-foreground">{formatTimeAgo(reply.createdAt)}</span>
              </div>
              <p className="text-gray-700 whitespace-pre-wrap break-words mt-0.5">{reply.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      {suggestion.status === SuggestionStatus.OPEN && onReply && (
        <ThreadReplyInput onSubmit={(content) => onReply(suggestion.id, content)} />
      )}

      {/* Actions */}
      {suggestion.status === SuggestionStatus.OPEN && (onApply || onDismiss) && (
        <div className="flex gap-1.5 mt-2">
          {suggestion.type === SuggestionType.CHANGE && isAnchored && onApply && (
            <Button
              size="sm"
              variant="default"
              onClick={(e) => {
                e.stopPropagation();
                onApply(suggestion.id);
              }}
              className="h-6 text-xs px-2"
            >
              <Check className="h-3 w-3 mr-1" />
              Apply
            </Button>
          )}
          {onDismiss && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(suggestion.id);
              }}
              className="h-6 text-xs px-2"
            >
              <X className="h-3 w-3 mr-1" />
              Dismiss
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
