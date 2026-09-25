'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import { SuggestionStatus } from '@/generated/prisma/enums';
import { ChevronDown, MessageSquare, MessageSquarePlus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SuggestionWithUser } from '@/domain/suggestion/suggestion.types';
import { ThreadCard } from './thread-card';

interface ThreadSidebarProps {
  suggestions: SuggestionWithUser[];
  currentUserId: string;
  translationContent: string;
  canCreateSuggestions?: boolean;
  onReply?: (suggestionId: string, content: string) => void;
  onApply?: (suggestionId: string) => void;
  onDismiss?: (suggestionId: string) => void;
  onReopen?: (suggestionId: string) => void;
  onEdit?: (suggestionId: string, data: { comment: string; proposedText?: string }) => Promise<void> | void;
  onSuggestionClick?: (suggestion: SuggestionWithUser) => void;
  onCreateGeneralThread?: (comment: string) => void;
  activeThreadId?: string | null;
  disableReopen?: boolean;
}

export function ThreadSidebar({
  suggestions,
  currentUserId,
  translationContent,
  canCreateSuggestions,
  onReply,
  onApply,
  onDismiss,
  onReopen,
  onEdit,
  onSuggestionClick,
  onCreateGeneralThread,
  activeThreadId,
  disableReopen = false,
}: ThreadSidebarProps) {
  const [showGeneralInput, setShowGeneralInput] = useState(false);
  const [generalComment, setGeneralComment] = useState('');
  const [resolvedCollapsed, setResolvedCollapsed] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeCardRef = useRef<HTMLDivElement>(null);

  const openThreads = useMemo(
    () =>
      suggestions
        .filter((s) => s.status === SuggestionStatus.OPEN)
        .sort((a, b) => (a.startLine ?? -Infinity) - (b.startLine ?? -Infinity)),
    [suggestions],
  );

  const resolvedThreads = useMemo(
    () =>
      suggestions
        .filter((s) => s.status !== SuggestionStatus.OPEN)
        .sort((a, b) => (a.startLine ?? -Infinity) - (b.startLine ?? -Infinity)),
    [suggestions],
  );

  // Auto-scroll to active thread (and expand resolved section if needed)
  useEffect(() => {
    if (!activeThreadId) return;

    // If the active thread is in the resolved section, expand it
    const isResolved = resolvedThreads.some((s) => s.id === activeThreadId);
    if (isResolved && resolvedCollapsed) {
      setResolvedCollapsed(false);
    }

    // Scroll after a tick to let the DOM update
    requestAnimationFrame(() => {
      activeCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [activeThreadId]);

  const handleSubmitGeneralThread = () => {
    const trimmed = generalComment.trim();
    if (!trimmed || !onCreateGeneralThread) return;
    onCreateGeneralThread(trimmed);
    setGeneralComment('');
    setShowGeneralInput(false);
  };

  const renderCard = (suggestion: SuggestionWithUser) => (
    // An article, not a bare div: a feedback thread is a self-contained piece
    // of authored content, which is what lets a screen reader move between
    // threads instead of through one undifferentiated run of text. A list
    // would be the other option, but this container also holds the empty
    // state and the resolved toggle, which are not list items.
    <article
      key={suggestion.id}
      aria-label={`Feedback from ${suggestion.user?.name ?? 'a reviewer'}`}
      ref={activeThreadId === suggestion.id ? activeCardRef : undefined}
    >
      <ThreadCard
        suggestion={suggestion}
        currentUserId={currentUserId}
        translationContent={translationContent}
        isActive={activeThreadId === suggestion.id}
        onReply={onReply}
        onApply={onApply}
        onDismiss={onDismiss}
        onReopen={onReopen}
        onEdit={onEdit}
        onClick={() => onSuggestionClick?.(suggestion)}
        disableReopen={disableReopen}
      />
    </article>
  );

  return (
    <Card
      role="region"
      aria-label="Feedback"
      className="flex h-full flex-col gap-0 overflow-hidden rounded-lg py-0 shadow-none"
    >
      {/* Header: the panel's banded label row, the same one the details card
          and every section in it wear, so feedback reads as one more card in
          the stack rather than a region bolted to the panel's edge. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/60 px-3 py-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Feedback{openThreads.length > 0 ? ` (${openThreads.length} open)` : ''}
        </h3>
        {canCreateSuggestions && onCreateGeneralThread && (
          <Button size="xs" variant="outline" onClick={() => setShowGeneralInput(!showGeneralInput)}>
            <MessageSquarePlus />
            General
          </Button>
        )}
      </div>

      {/* General thread input */}
      {showGeneralInput && (
        <div className="shrink-0 border-b bg-info/50 px-3 py-2">
          <textarea
            value={generalComment}
            onChange={(e) => setGeneralComment(e.target.value)}
            placeholder="Add a general comment..."
            rows={2}
            className="w-full resize-none rounded border border-border bg-background px-2 py-1.5 text-xs focus:ring-1 focus:ring-ring focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmitGeneralThread();
              }
            }}
          />
          <div className="mt-1.5 flex gap-1.5">
            <Button size="xs" onClick={handleSubmitGeneralThread} disabled={!generalComment.trim()}>
              Submit
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                setShowGeneralInput(false);
                setGeneralComment('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Thread list: the rows inside the card are flat and divided, the way
          the sections above it are, so a thread never nests a card in a card.
          It scrolls with the panel rather than inside it -- one scrollbar for
          the whole panel, which is what the QA asked after opening the
          activity log and finding the feedback trapped in a shorter box. */}
      <div ref={scrollContainerRef} className="flex-1 divide-y">
        {suggestions.length === 0 ? (
          <Empty className="gap-3 p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquare />
              </EmptyMedia>
              <EmptyTitle className="text-sm">No feedback yet</EmptyTitle>
              <EmptyDescription className="text-xs">
                Comments and suggestions on this translation appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {/* Open threads */}
            {openThreads.map(renderCard)}

            {openThreads.length === 0 && (
              <div className="py-4 text-center text-xs text-muted-foreground">No open threads</div>
            )}

            {/* Resolved threads — one row that opens the list, the same shape
                the details card's header uses. */}
            {resolvedThreads.length > 0 && (
              <>
                <button
                  type="button"
                  aria-expanded={!resolvedCollapsed}
                  onClick={() => setResolvedCollapsed(!resolvedCollapsed)}
                  className="flex w-full items-center gap-1 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      'size-3.5 shrink-0 transition-transform duration-200',
                      resolvedCollapsed && '-rotate-90',
                    )}
                  />
                  <span>Resolved ({resolvedThreads.length})</span>
                </button>

                {!resolvedCollapsed && resolvedThreads.map(renderCard)}
              </>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
