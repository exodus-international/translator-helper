'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SuggestionStatus, SuggestionType } from '@prisma/client';
import { Check, Eye, MessageSquare, Pencil, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SuggestionWithUser } from './monaco-suggestion-decorations';

const MONACO_FONT_STACK = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

interface SuggestionPanelProps {
  suggestions: SuggestionWithUser[];
  currentUserId: string;
  canCreate: boolean;
  content?: string; // Document content to extract "Before" text from range
  onSuggestionClick?: (suggestion: SuggestionWithUser) => void;
  onApply?: (suggestionId: string) => void;
  onDismiss?: (suggestionId: string, reason?: string) => void;
  onCreate?: (data: {
    comment: string;
    proposedText?: string;
    type: SuggestionType;
    range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
    version: number;
  }) => void;
  onAddClick?: () => void; // Callback when "+ Add" button is clicked
  onUserFilterChange?: (userId: string | null) => void; // Callback when user filter changes
  isApplying?: boolean;
  isDismissing?: boolean;
}

export function SuggestionPanel({
  suggestions,
  currentUserId,
  canCreate,
  content = '',
  onSuggestionClick,
  onApply,
  onDismiss,
  onCreate,
  onAddClick,
  onUserFilterChange,
  isApplying = false,
  isDismissing = false,
}: SuggestionPanelProps) {
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<SuggestionType | 'ALL'>('ALL');
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<SuggestionWithUser | null>(null);

  // Get unique users from suggestions
  const uniqueUsers = useMemo(() => {
    const usersMap = new Map<string, { id: string; name: string }>();
    suggestions.forEach((s) => {
      if (!usersMap.has(s.user.id)) {
        usersMap.set(s.user.id, { id: s.user.id, name: s.user.name });
      }
    });
    return Array.from(usersMap.values());
  }, [suggestions]);

  const filteredSuggestions = useMemo(() => {
    const statusRank: Record<SuggestionStatus, number> = {
      OPEN: 0,
      APPLIED: 1,
      DISMISSED: 1,
    };

    return suggestions
      .filter((s) => {
        if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
        if (typeFilter !== 'ALL' && s.type !== typeFilter) return false;
        if (userFilter && s.user.id !== userFilter) return false;
        return true;
      })
      .slice()
      .sort((a, b) => {
        const rankDiff = statusRank[a.status] - statusRank[b.status];
        if (rankDiff !== 0) return rankDiff;
        // Newest first within each group
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [suggestions, statusFilter, typeFilter, userFilter]);

  const handleUserFilterChange = (userId: string | 'ALL') => {
    const newFilter = userId === 'ALL' ? null : userId;
    setUserFilter(newFilter);
    onUserFilterChange?.(newFilter);
  };

  const handleSuggestionClick = (suggestion: SuggestionWithUser) => {
    setSelectedSuggestion(suggestion);
    onSuggestionClick?.(suggestion);
  };

  const handleCreate = (type: SuggestionType) => {
    setShowCreateForm(true);
    // The actual range will be passed from the parent when text is selected
  };

  const formatTimeAgo = (date: string) => {
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
  };

  const getContextPreview = (suggestion: SuggestionWithUser, content: string) => {
    const lines = content.split('\n');
    const startLine = Math.max(0, suggestion.startLine - 2);
    const endLine = Math.min(lines.length - 1, suggestion.endLine);
    return (
      lines
        .slice(startLine, endLine + 1)
        .join('\n')
        .substring(0, 100) + '...'
    );
  };

  const getTextFromRange = (suggestion: SuggestionWithUser, docContent: string): string => {
    if (!docContent) return '';
    const lines = docContent.split('\n');
    const startLine = suggestion.startLine - 1; // Convert to 0-based
    const endLine = suggestion.endLine - 1;
    const startColumn = suggestion.startColumn - 1;
    const endColumn = suggestion.endColumn - 1;

    if (startLine < 0 || endLine >= lines.length) return '';

    if (startLine === endLine) {
      // Single line
      const line = lines[startLine] || '';
      return line.substring(startColumn, endColumn);
    } else {
      // Multi-line
      const firstLine = lines[startLine] || '';
      const lastLine = lines[endLine] || '';
      const firstPart = firstLine.substring(startColumn);
      const lastPart = lastLine.substring(0, endColumn);
      const middleLines = lines.slice(startLine + 1, endLine);
      return [firstPart, ...middleLines, lastPart].join('\n');
    }
  };

  const statusLabel: Record<SuggestionStatus, string> = {
    OPEN: 'Open',
    APPLIED: 'Applied',
    DISMISSED: 'Dismissed',
  };

  return (
    <Card className="w-full h-full flex flex-col border-l">
      <div className="p-4 border-b sticky top-0 bg-white z-10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Suggestions ({filteredSuggestions.length})</h3>
          {canCreate && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (onAddClick) {
                  onAddClick();
                } else {
                  setShowCreateForm(!showCreateForm);
                }
              }}
              className="h-8"
            >
              + Add
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as SuggestionStatus | 'ALL')}>
            <SelectTrigger size="sm" className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value={SuggestionStatus.OPEN}>Open</SelectItem>
              <SelectItem value={SuggestionStatus.APPLIED}>Applied</SelectItem>
              <SelectItem value={SuggestionStatus.DISMISSED}>Dismissed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as SuggestionType | 'ALL')}>
            <SelectTrigger size="sm" className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value={SuggestionType.COMMENT}>Comments</SelectItem>
              <SelectItem value={SuggestionType.CHANGE}>Changes</SelectItem>
            </SelectContent>
          </Select>

          <Select value={userFilter || 'ALL'} onValueChange={handleUserFilterChange}>
            <SelectTrigger size="sm" className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Users</SelectItem>
              {uniqueUsers.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {showCreateForm && (
          <Card className="p-3 mb-3 bg-blue-50 border-blue-200">
            <p className="text-sm text-gray-700 mb-2">To add a suggestion:</p>
            <ol className="text-xs text-gray-600 list-decimal list-inside space-y-1">
              <li>Select text in the translation editor</li>
              <li>Click "Comment" or "Suggest edit" from the toolbar</li>
            </ol>
          </Card>
        )}

        {/* User filter buttons - "Changes finished" buttons */}
        {uniqueUsers.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-xs font-medium text-gray-600">View changes by user:</p>
            <div className="flex flex-wrap gap-2">
              {uniqueUsers.map((user) => {
                const userAppliedChanges = suggestions.filter(
                  (s) =>
                    s.user.id === user.id && s.status === SuggestionStatus.APPLIED && s.type === SuggestionType.CHANGE,
                );
                if (userAppliedChanges.length === 0) return null;

                return (
                  <Button
                    key={user.id}
                    size="sm"
                    variant={userFilter === user.id ? 'default' : 'outline'}
                    onClick={() => handleUserFilterChange(userFilter === user.id ? 'ALL' : user.id)}
                    className="h-7 text-xs"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    {user.name} ({userAppliedChanges.length})
                  </Button>
                );
              })}
              {userFilter && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleUserFilterChange('ALL')}
                  className="h-7 text-xs"
                >
                  Show all
                </Button>
              )}
            </div>
          </div>
        )}

        {filteredSuggestions.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">No suggestions found</div>
        ) : (
          filteredSuggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className={[
                'rounded-md border bg-white px-2 py-2 cursor-pointer transition-colors',
                'hover:bg-muted/40',
                selectedSuggestion?.id === suggestion.id ? 'border-blue-300 bg-blue-50/50' : 'border-border',
              ].join(' ')}
              onClick={() => handleSuggestionClick(suggestion)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {suggestion.type === SuggestionType.COMMENT ? (
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-sm font-medium truncate">{suggestion.user.name}</span>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        v{suggestion.version} • L{suggestion.startLine}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-muted-foreground">{formatTimeAgo(suggestion.createdAt)}</span>
                  <span
                    className={[
                      'text-[11px] px-1.5 py-0.5 rounded border',
                      suggestion.status === SuggestionStatus.OPEN
                        ? 'border-gray-200 text-gray-700 bg-white'
                        : suggestion.status === SuggestionStatus.APPLIED
                          ? 'border-green-200 text-green-700 bg-green-50'
                          : 'border-gray-200 text-gray-600 bg-gray-50',
                    ].join(' ')}
                  >
                    {statusLabel[suggestion.status]}
                  </span>
                </div>
              </div>

              {suggestion.type === SuggestionType.CHANGE && suggestion.proposedText && (
                <div
                  className="mt-2 text-[12px] leading-5 rounded bg-muted/40 px-2 py-1.5 space-y-1"
                  style={{ fontFamily: MONACO_FONT_STACK }}
                >
                  <div className="text-red-700/80 line-through whitespace-pre-wrap wrap-break-word">
                    {(() => {
                      const beforeText = getTextFromRange(suggestion, content);
                      if (!beforeText) return '(text not available)';
                      return beforeText.length > 160 ? beforeText.substring(0, 160) + '…' : beforeText;
                    })()}
                  </div>
                  <div className="text-green-800 whitespace-pre-wrap wrap-break-word">
                    {suggestion.proposedText.length > 160 ? suggestion.proposedText.substring(0, 160) + '…' : suggestion.proposedText}
                  </div>
                </div>
              )}

              {suggestion.comment?.trim() && (
                <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap wrap-break-word">
                  {suggestion.comment}
                </div>
              )}

              {suggestion.status === SuggestionStatus.OPEN && (
                <div className="flex gap-2 mt-2">
                  {suggestion.type === SuggestionType.CHANGE && onApply && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={(e) => {
                        e.stopPropagation();
                        onApply(suggestion.id);
                      }}
                      disabled={isApplying}
                      className="h-7 text-xs"
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
                      disabled={isDismissing}
                      className="h-7 text-xs"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Dismiss
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
