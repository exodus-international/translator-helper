'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SuggestionStatus } from '@prisma/client';
import { ChevronDown, ChevronRight, MessageSquarePlus, PanelRightClose } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SuggestionWithUser } from './monaco-suggestion-decorations';
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
  onSuggestionClick?: (suggestion: SuggestionWithUser) => void;
  onCreateGeneralThread?: (comment: string) => void;
  activeThreadId?: string | null;
  onCollapse?: () => void;
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
  onSuggestionClick,
  onCreateGeneralThread,
  activeThreadId,
  onCollapse,
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
    <div
      key={suggestion.id}
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
        onClick={() => onSuggestionClick?.(suggestion)}
      />
    </div>
  );

  return (
    <div className="flex flex-col h-full border-l rounded-none bg-white overflow-hidden border-b">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-white shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Feedback{openThreads.length > 0 ? ` (${openThreads.length} open)` : ''}
          </h3>
          <div className="flex items-center gap-1">
            {canCreateSuggestions && onCreateGeneralThread && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowGeneralInput(!showGeneralInput)}
                className="h-7 text-xs"
              >
                <MessageSquarePlus className="h-3.5 w-3.5 mr-1" />
                General
              </Button>
            )}
            {onCollapse && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onCollapse}
                className="h-7 w-7 p-0"
                title="Collapse feedback panel"
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* General thread input */}
      {showGeneralInput && (
        <div className="px-3 py-2 border-b bg-blue-50/50 shrink-0">
          <textarea
            value={generalComment}
            onChange={(e) => setGeneralComment(e.target.value)}
            placeholder="Add a general comment..."
            rows={2}
            className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmitGeneralThread();
              }
            }}
          />
          <div className="flex gap-1.5 mt-1.5">
            <Button size="sm" onClick={handleSubmitGeneralThread} disabled={!generalComment.trim()} className="h-6 text-xs">
              Submit
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowGeneralInput(false); setGeneralComment(''); }} className="h-6 text-xs">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Thread list */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-2">
        {suggestions.length === 0 ? (
          <div className="text-center text-muted-foreground text-xs py-8">
            No feedback yet
          </div>
        ) : (
          <>
            {/* Open threads */}
            {openThreads.length > 0 && (
              <div className="space-y-2">
                {openThreads.map(renderCard)}
              </div>
            )}

            {openThreads.length === 0 && (
              <div className="text-center text-muted-foreground text-xs py-4">
                No open threads
              </div>
            )}

            {/* Resolved threads — collapsible */}
            {resolvedThreads.length > 0 && (
              <div className={cn(openThreads.length > 0 && 'mt-3')}>
                <button
                  onClick={() => setResolvedCollapsed(!resolvedCollapsed)}
                  className="flex items-center gap-1 w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 px-1"
                >
                  {resolvedCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>Resolved ({resolvedThreads.length})</span>
                </button>

                {!resolvedCollapsed && (
                  <div className="space-y-2 mt-1">
                    {resolvedThreads.map(renderCard)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
