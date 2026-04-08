import { RawEditorPane } from '@/components/raw-editor-panel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { SuggestionStatus } from '@prisma/client';
import { Edit, Eye, FileEdit, PanelRightOpen, Save, X } from 'lucide-react';
import { ReactNode, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { SuggestionWithUser } from './monaco-suggestion-decorations';
import { SuggestionDiffViewer } from './suggestion-diff-viewer';
import { SuggestionForm } from './suggestion-form';
import { SuggestionInlineToolbar } from './suggestion-inline-toolbar';
import { ThreadSidebar } from './thread-sidebar';
// SuggestionType enum values
const SuggestionType = {
  COMMENT: 'COMMENT' as const,
  CHANGE: 'CHANGE' as const,
};
type SuggestionType = 'COMMENT' | 'CHANGE';

type ViewerVariant = 'translate' | 'review';

export interface SourceTranslationViewerHandle {
  enterTranslationEditMode: () => void;
  exitTranslationEditMode: () => void;
}

interface SourceTranslationViewerProps {
  variant: ViewerVariant;
  className?: string;
  layout?: 'default' | 'zen';
  sourceContent: string;
  sourceFormattedContent: string;
  translationContent: string;
  translationFormattedContent?: string;
  translationPlaceholder?: string;
  translationPreviewEmptyText?: string;
  onTranslationChange?: (value: string) => void;
  sourceBadge?: ReactNode;
  translationBadge?: ReactNode;
  sourceHeaderExtra?: ReactNode;
  translationHeaderExtra?: ReactNode;
  // Source editing props
  canEditSource?: boolean;
  onSourceChange?: (value: string) => void;
  onSourceSave?: () => void | Promise<void>;
  onSourceDelete?: () => void | Promise<void>;
  sourceEditContent?: string;
  reviewConfig?: {
    canEdit?: boolean;
    editButtonLabel?: string;
    renderEditActions?: (ctx: { exitEditMode: () => void }) => ReactNode;
    editingDefault?: boolean;
    headerExtra?: ReactNode;
  };
  // Suggestion props
  suggestions?: SuggestionWithUser[];
  canCreateSuggestions?: boolean;
  currentUserId?: string;
  onSuggestionClick?: (suggestion: SuggestionWithUser) => void;
  onApplySuggestion?: (suggestionId: string) => void;
  onDismissSuggestion?: (suggestionId: string, reason?: string) => void;
  onReopenSuggestion?: (suggestionId: string) => void;
  onEditSuggestion?: (suggestionId: string, data: { comment: string; proposedText?: string }) => Promise<void> | void;
  onCreateSuggestion?: (data: {
    comment: string;
    proposedText?: string;
    type: SuggestionType;
    range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
    version: number;
  }) => void;
  documentVersion?: number;
  isApplyingSuggestion?: boolean;
  isDismissingSuggestion?: boolean;
  editorRef?: React.RefObject<any>; // Ref to the Monaco editor to get cursor position
  onReply?: (suggestionId: string, content: string) => void;
  onCreateGeneralThread?: (comment: string) => void;
  disableReopen?: boolean;
  sidebarHeader?: ReactNode;
}

const mapLineNumber = (_lineNumber: number, _fromTotal: number, toTotal: number) => {
  return Math.min(Math.max(_lineNumber, 1), Math.max(toTotal, 1));
};

export const SourceTranslationViewer = forwardRef<SourceTranslationViewerHandle, SourceTranslationViewerProps>(
  function SourceTranslationViewer(
    {
      variant,
      className,
      layout = 'default',
      sourceContent,
      sourceFormattedContent,
      translationContent,
      translationFormattedContent,
      translationPlaceholder = 'Enter your translation here...',
      translationPreviewEmptyText = '*No content yet...*',
      onTranslationChange,
      sourceBadge,
      translationBadge,
      sourceHeaderExtra,
      translationHeaderExtra,
      canEditSource = false,
      onSourceChange,
      onSourceSave,
      onSourceDelete,
      sourceEditContent,
      reviewConfig,
      suggestions = [],
      canCreateSuggestions = false,
      currentUserId,
      onSuggestionClick,
      onApplySuggestion,
      onDismissSuggestion,
      onReopenSuggestion,
      onEditSuggestion,
      onCreateSuggestion,
      documentVersion = 1,
      isApplyingSuggestion = false,
      isDismissingSuggestion = false,
      editorRef: externalEditorRef,
      onReply,
      onCreateGeneralThread,
      disableReopen = false,
      sidebarHeader,
    },
    ref,
  ) {
    const isZen = layout === 'zen';
    const [mounted, setMounted] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
    const [sourceViewMode, setSourceViewMode] = useState<'formatted' | 'raw'>('raw');
    const [translateTab, setTranslateTab] = useState<'edit' | 'preview'>('edit');
    const [reviewViewMode, setReviewViewMode] = useState<'formatted' | 'review'>('review');
    const [isReviewEditing, setIsReviewEditing] = useState(reviewConfig?.editingDefault ?? false);
    const [showSuggestionForm, setShowSuggestionForm] = useState(false);
    const [suggestionFormType, setSuggestionFormType] = useState<SuggestionType>(SuggestionType.COMMENT);
    const [selectedRange, setSelectedRange] = useState<{
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    } | null>(null);
    const [selectedText, setSelectedText] = useState<string>(''); // Store selected text for pre-filling
    const suggestionFormDirtyRef = useRef(false);
    const [showDiscardDialog, setShowDiscardDialog] = useState(false);
    const pendingDiscardActionRef = useRef<(() => void) | null>(null);
    const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number } | null>(null);
    const translationEditorRef = useRef<any>(null);
    const translationContainerRef = useRef<HTMLDivElement>(null);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null); // Filter by user for diff view
    const [isSourceEditing, setIsSourceEditing] = useState(false);
    const [sourceEditValue, setSourceEditValue] = useState(sourceEditContent ?? sourceContent);
    const [sourceSaving, setSourceSaving] = useState(false);
    const [sourceLine, setSourceLine] = useState(1);
    const [translationLine, setTranslationLine] = useState(1);
    const [syncedSourceLine, setSyncedSourceLine] = useState<number | undefined>(undefined);
    const [syncedTranslationLine, setSyncedTranslationLine] = useState<number | undefined>(undefined);

    useEffect(() => {
      setMounted(true);
    }, []);

    // Count open suggestions
    const openSuggestionsCount = useMemo(() => {
      return suggestions.filter((s) => s.status === SuggestionStatus.OPEN).length;
    }, [suggestions]);

    const translationPreview = translationFormattedContent ?? translationContent;
    const translationRawVisible =
      variant === 'translate' ? translateTab === 'edit' : isReviewEditing || reviewViewMode === 'review';
    const isReviewMode = variant === 'review' && reviewViewMode === 'review';

    // Update source edit value when sourceEditContent prop changes
    useEffect(() => {
      if (sourceEditContent !== undefined) {
        setSourceEditValue(sourceEditContent);
      }
    }, [sourceEditContent]);

    const handleSourceEditChange = (value: string) => {
      setSourceEditValue(value);
      onSourceChange?.(value);
    };

    const handleSourceSave = async () => {
      if (!onSourceSave) return;
      setSourceSaving(true);
      try {
        await onSourceSave();
        setIsSourceEditing(false);
      } catch (error) {
        console.error('Error saving source:', error);
      } finally {
        setSourceSaving(false);
      }
    };

    const handleSourceCancel = () => {
      setSourceEditValue(sourceEditContent ?? sourceContent);
      setIsSourceEditing(false);
    };

    const handleSourceDelete = async () => {
      if (!onSourceDelete) return;
      try {
        await onSourceDelete();
      } catch (error) {
        console.error('Error deleting source:', error);
      }
    };

    const enterSourceEditMode = () => {
      if (!canEditSource) return;
      setSourceEditValue(sourceEditContent ?? sourceContent);
      setIsSourceEditing(true);
      setSourceViewMode('raw');
    };

    const handleSourceCursorChange = (lineNumber: number) => {
      setSourceLine(lineNumber);
      // Clear stale decoration on the source pane (user is now active here)
      setSyncedSourceLine(undefined);
      if (!translationRawVisible) {
        setSyncedTranslationLine(undefined);
        return;
      }

      const sourceTotalLines = sourceContent.split('\n').length;
      const translationTotalLines = translationContent.split('\n').length;
      const translationTargetLine = mapLineNumber(lineNumber, sourceTotalLines, translationTotalLines);
      setSyncedTranslationLine(translationTargetLine);
      // Update the translation pane's displayed line to match the synced target
      setTranslationLine(translationTargetLine);
    };

    const handleTranslationCursorChange = (lineNumber: number) => {
      setTranslationLine(lineNumber);
      // Clear stale decoration on the translation pane (user is now active here)
      setSyncedTranslationLine(undefined);
      if (sourceViewMode !== 'raw') {
        setSyncedSourceLine(undefined);
        return;
      }

      const sourceTotalLines = sourceContent.split('\n').length;
      const translationTotalLines = translationContent.split('\n').length;
      const sourceTargetLine = mapLineNumber(lineNumber, translationTotalLines, sourceTotalLines);
      setSyncedSourceLine(sourceTargetLine);
      // Update the source pane's displayed line to match the synced target
      setSourceLine(sourceTargetLine);
    };

    const handleSuggestionClickInternal = (suggestion: SuggestionWithUser) => {
      setActiveThreadId(suggestion.id);
      try {
        // Only scroll editor for anchored suggestions
        if (
          suggestion.startLine != null &&
          suggestion.startColumn != null &&
          suggestion.endLine != null &&
          suggestion.endColumn != null
        ) {
          const editorWrapper = translationEditorRef.current || externalEditorRef?.current;
          const editor = editorWrapper?.editor;
          const monaco = editorWrapper?.monaco;
          if (editor && monaco) {
            const range = new monaco.Range(
              suggestion.startLine,
              suggestion.startColumn,
              suggestion.endLine,
              suggestion.endColumn,
            );
            editor.revealRangeInCenter(range);
            editor.setSelection(range);
          }

          // Always sync both panes for context
          setTranslationLine(suggestion.startLine);
          setSyncedTranslationLine(suggestion.startLine);

          // Sync source pane — switch to raw view if needed so the line highlight is visible
          const sourceTotalLines = sourceContent.split('\n').length;
          const translationTotalLines = translationContent.split('\n').length;
          const sourceTargetLine = mapLineNumber(suggestion.startLine, translationTotalLines, sourceTotalLines);

          if (sourceViewMode !== 'raw') {
            setSourceViewMode('raw');
          }
          setSyncedSourceLine(sourceTargetLine);
        }
      } catch (error) {
        console.error('Error selecting suggestion in editor:', error);
      } finally {
        onSuggestionClick?.(suggestion);
      }
    };

    const cardClassName = isZen
      ? 'p-3 h-full flex flex-col min-w-0 min-h-0'
      : 'p-0 gap-0 shadow-none h-full flex flex-col min-w-0 min-h-0';
    const bodyClassName = isZen ? 'flex-1 min-h-0 overflow-hidden relative' : 'flex-1 min-h-0 overflow-hidden';

    const exitReviewEditMode = () => {
      setIsReviewEditing(false);
      setReviewViewMode('review');
      setSyncedTranslationLine(undefined);
    };

    const enterReviewEditMode = () => {
      if (!reviewConfig?.canEdit) return;
      setIsReviewEditing(true);
      setTranslateTab('edit');
    };

    const translationEditActions = useMemo(() => {
      if (variant !== 'review' || !isReviewEditing) return null;
      return reviewConfig?.renderEditActions?.({ exitEditMode: exitReviewEditMode });
    }, [variant, isReviewEditing, reviewConfig]);

    useImperativeHandle(
      ref,
      () => ({
        enterTranslationEditMode: () => {
          if (variant === 'translate') {
            setTranslateTab('edit');
          } else {
            enterReviewEditMode();
          }
        },
        exitTranslationEditMode: () => {
          if (variant === 'translate') {
            setTranslateTab('preview');
          } else {
            exitReviewEditMode();
          }
        },
      }),
      [variant, enterReviewEditMode, exitReviewEditMode],
    );

    const doCloseSuggestionForm = useCallback(() => {
      setShowSuggestionForm(false);
      setSelectedRange(null);
      setSelectedText('');
      suggestionFormDirtyRef.current = false;
    }, []);

    const requestCloseSuggestionForm = useCallback(
      (onConfirmed?: () => void) => {
        if (!suggestionFormDirtyRef.current) {
          doCloseSuggestionForm();
          onConfirmed?.();
          return;
        }
        pendingDiscardActionRef.current = onConfirmed ?? null;
        setShowDiscardDialog(true);
      },
      [doCloseSuggestionForm],
    );

    const handleDiscardConfirm = useCallback(() => {
      doCloseSuggestionForm();
      setShowDiscardDialog(false);
      pendingDiscardActionRef.current?.();
      pendingDiscardActionRef.current = null;
    }, [doCloseSuggestionForm]);

    const handleDiscardCancel = useCallback(() => {
      setShowDiscardDialog(false);
      pendingDiscardActionRef.current = null;
    }, []);

    const handleSelectionChange = (
      range: {
        startLine: number;
        startColumn: number;
        endLine: number;
        endColumn: number;
      } | null,
    ) => {
      // Close suggestion form if open when selection changes
      if (showSuggestionForm) {
        requestCloseSuggestionForm();
        return;
      }

      setSelectedRange(range);
      // Get selected text from editor
      if (range) {
        const editorWrapper = translationEditorRef.current || externalEditorRef?.current;
        const editor = editorWrapper?.editor;
        const monaco = editorWrapper?.monaco;

        if (editor && monaco && typeof editor.getModel === 'function') {
          try {
            const model = editor.getModel();
            if (model) {
              const monacoRange = new monaco.Range(range.startLine, range.startColumn, range.endLine, range.endColumn);
              const text = model.getValueInRange(monacoRange);
              setSelectedText(text);
            }
          } catch (error) {
            console.error('Error getting selected text from Monaco:', error);
            // Fallback to content extraction
            extractTextFromContent(range);
          }
        } else {
          // Fallback: extract text from content
          extractTextFromContent(range);
        }
      } else {
        setSelectedText('');
      }

      function extractTextFromContent(range: {
        startLine: number;
        startColumn: number;
        endLine: number;
        endColumn: number;
      }) {
        const lines = translationContent.split('\n');
        if (range.startLine === range.endLine) {
          const line = lines[range.startLine - 1] || '';
          const text = line.substring(range.startColumn - 1, range.endColumn - 1);
          setSelectedText(text);
        } else {
          // Multi-line selection
          const firstLine = lines[range.startLine - 1] || '';
          const lastLine = lines[range.endLine - 1] || '';
          const firstPart = firstLine.substring(range.startColumn - 1);
          const lastPart = lastLine.substring(0, range.endColumn - 1);
          const middleLines = lines.slice(range.startLine, range.endLine - 1);
          setSelectedText([firstPart, ...middleLines, lastPart].join('\n'));
        }
      }

      const showToolbar = range && canCreateSuggestions && (isReviewMode || suggestions.length > 0);
      if (showToolbar) {
        // Try to get actual position from editor
        const editorWrapper = translationEditorRef.current || externalEditorRef?.current;
        const editor = editorWrapper?.editor;
        if (editor && typeof editor.getScrolledVisiblePosition === 'function') {
          try {
            const pos = editor.getScrolledVisiblePosition({ lineNumber: range.endLine, column: range.endColumn });
            if (pos) {
              setToolbarPosition({ x: pos.left + 20, y: pos.top + pos.height + 4 });
            } else {
              setToolbarPosition({ x: 180, y: 20 });
            }
          } catch {
            setToolbarPosition({ x: 180, y: 20 });
          }
        } else {
          setToolbarPosition({ x: 180, y: 20 });
        }
      } else {
        setToolbarPosition(null);
      }
    };

    const handleCreateSuggestion = (type: SuggestionType) => {
      if (!selectedRange) return;
      setSuggestionFormType(type);
      setShowSuggestionForm(true);
      setToolbarPosition(null);
    };

    const handleSuggestionFormSubmit = (data: { comment: string; proposedText?: string }) => {
      if (!selectedRange || !onCreateSuggestion) return;
      onCreateSuggestion({
        ...data,
        type: suggestionFormType,
        range: selectedRange,
        version: documentVersion,
      });
      suggestionFormDirtyRef.current = false;
      setShowSuggestionForm(false);
      setSelectedRange(null);
      setSelectedText('');
    };

    const handleAddSuggestionClick = () => {
      // Try to get cursor position from editor
      const editorWrapper = translationEditorRef.current || externalEditorRef?.current;
      const editor = editorWrapper?.editor;
      if (editor && typeof editor.getPosition === 'function') {
        try {
          const position = editor.getPosition();
          if (position) {
            // Create a range at the current cursor position (single character)
            const range = {
              startLine: position.lineNumber,
              startColumn: position.column,
              endLine: position.lineNumber,
              endColumn: position.column,
            };
            setSelectedRange(range);
            setSuggestionFormType(SuggestionType.COMMENT);
            setShowSuggestionForm(true);
            return;
          }
        } catch (error) {
          console.error('Error getting editor position:', error);
        }
      }
      // If no editor or position, use current translation line
      if (translationLine > 0) {
        const range = {
          startLine: translationLine,
          startColumn: 1,
          endLine: translationLine,
          endColumn: 1,
        };
        setSelectedRange(range);
        setSuggestionFormType('COMMENT');
        setShowSuggestionForm(true);
        return;
      }
      // If no line info, show instructions
      toast.info('Please select text in the translation editor, or click on a line to add a comment');
    };

    const hasSidebar = suggestions.length > 0 || canCreateSuggestions;
    const sidebarHidden = isZen && sidebarCollapsed;

    // Show suggestions decorations and selection toolbar in review mode OR when suggestions exist in translate mode
    const showSuggestionDecorations = suggestions.length > 0;
    const showSelectionToolbar = canCreateSuggestions && (isReviewMode || showSuggestionDecorations);

    return (
      <div
        className={cn(
          'grid border-0',
          hasSidebar || sidebarHeader ? (sidebarHidden ? 'grid-cols-2' : 'grid-cols-[1fr_1fr_340px]') : 'grid-cols-2',
          className,
          isZen && 'h-full',
        )}
      >
        <Card className={cn(cardClassName, 'rounded-none border-t-0 border-r-0 pt-1')}>
          <div className="flex items-center justify-between py-1.5 px-2">
            <h2 className="text-sm font-semibold">Source (English)</h2>
            <div className="flex items-center gap-2">
              {!isSourceEditing &&
                (mounted ? (
                  <Tabs
                    value={sourceViewMode}
                    onValueChange={(value) => setSourceViewMode(value as 'formatted' | 'raw')}
                  >
                    <TabsList>
                      <TabsTrigger value="formatted">Formatted</TabsTrigger>
                      <TabsTrigger value="raw">Raw</TabsTrigger>
                    </TabsList>
                  </Tabs>
                ) : (
                  <div className="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
                    <button
                      type="button"
                      disabled
                      className={cn(
                        'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                        sourceViewMode === 'formatted' && 'bg-background shadow-sm',
                      )}
                    >
                      Formatted
                    </button>
                    <button
                      type="button"
                      disabled
                      className={cn(
                        'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                        sourceViewMode === 'raw' && 'bg-background shadow-sm',
                      )}
                    >
                      Raw
                    </button>
                  </div>
                ))}
              {sourceBadge}
              {canEditSource && !isSourceEditing && (
                <>
                  <Button variant="outline" size="sm" onClick={enterSourceEditMode}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  {/* <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Source Version</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this source version? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleSourceDelete}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog> */}
                </>
              )}
              {isSourceEditing && (
                <>
                  <Button variant="outline" size="sm" onClick={handleSourceSave} disabled={sourceSaving}>
                    <Save className="h-4 w-4 mr-2" />
                    {sourceSaving ? 'Saving...' : 'Save'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleSourceCancel} disabled={sourceSaving}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </>
              )}
              {sourceHeaderExtra}
            </div>
          </div>
          <div className={bodyClassName}>
            {isSourceEditing ? (
              <RawEditorPane
                value={sourceEditValue}
                onChange={handleSourceEditChange}
                currentLine={sourceLine}
                highlightLine={syncedSourceLine}
                onCursorChange={handleSourceCursorChange}
                fullHeight
                lineInfo={{
                  primaryLabel: 'Source Line',
                  primaryValue: sourceLine,
                  secondaryLabel: translationRawVisible ? 'Translation Line' : undefined,
                  secondaryValue: translationRawVisible ? (syncedTranslationLine ?? translationLine) : undefined,
                  direction: 'to',
                }}
              />
            ) : sourceViewMode === 'formatted' ? (
              <div className="prose max-w-none h-full overflow-y-auto p-3">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{sourceFormattedContent}</ReactMarkdown>
              </div>
            ) : (
              <RawEditorPane
                value={sourceContent}
                readOnly
                currentLine={sourceLine}
                highlightLine={syncedSourceLine}
                onCursorChange={handleSourceCursorChange}
                fullHeight
                lineInfo={{
                  primaryLabel: 'Source Line',
                  primaryValue: sourceLine,
                  secondaryLabel: translationRawVisible ? 'Translation Line' : undefined,
                  secondaryValue: translationRawVisible ? (syncedTranslationLine ?? translationLine) : undefined,
                  direction: 'to',
                }}
              />
            )}
          </div>
        </Card>

        <Card className={cn(cardClassName, 'rounded-none border-t-0 border-r-0 pt-1')}>
          <div className="flex items-center justify-between py-1.5 px-2">
            <h2 className="text-sm font-semibold">Translation</h2>
            <div className="flex items-center gap-2">
              {variant === 'translate' ? (
                mounted ? (
                  <Tabs value={translateTab} onValueChange={(value) => setTranslateTab(value as 'edit' | 'preview')}>
                    <TabsList>
                      <TabsTrigger value="edit">
                        <FileEdit className="h-4 w-4 mr-2" />
                        Edit
                      </TabsTrigger>
                      <TabsTrigger value="preview">
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                ) : (
                  <div className="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
                    <button
                      type="button"
                      disabled
                      className={cn(
                        'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                        translateTab === 'edit' && 'bg-background shadow-sm',
                      )}
                    >
                      <FileEdit className="h-4 w-4 mr-2" />
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled
                      className={cn(
                        'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                        translateTab === 'preview' && 'bg-background shadow-sm',
                      )}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </button>
                  </div>
                )
              ) : !isReviewEditing ? (
                mounted ? (
                  <Tabs
                    value={reviewViewMode}
                    onValueChange={(value) => setReviewViewMode(value as 'formatted' | 'review')}
                  >
                    <TabsList>
                      <TabsTrigger value="formatted">Formatted</TabsTrigger>
                      <TabsTrigger value="review" className="relative">
                        Review
                        {openSuggestionsCount > 0 && (
                          <Badge
                            variant="primary"
                            className="absolute -top-3 -right-3 h-5 min-w-5 px-1.5 text-xs flex items-center justify-center"
                          >
                            {openSuggestionsCount}
                          </Badge>
                        )}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                ) : (
                  <div className="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
                    <button
                      type="button"
                      disabled
                      className={cn(
                        'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                        reviewViewMode === 'formatted' && 'bg-background shadow-sm',
                      )}
                    >
                      Formatted
                    </button>
                    <button
                      type="button"
                      disabled
                      className={cn(
                        'relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                        reviewViewMode === 'review' && 'bg-background shadow-sm',
                      )}
                    >
                      Review
                      {openSuggestionsCount > 0 && (
                        <Badge
                          variant="primary"
                          className="absolute -top-1 -left-1 h-5 min-w-5 px-1.5 text-xs flex items-center justify-center"
                        >
                          {openSuggestionsCount}
                        </Badge>
                      )}
                    </button>
                  </div>
                )
              ) : null}
              {translationBadge}
              {translationHeaderExtra}
              {variant === 'review' && reviewConfig?.headerExtra}
              {isZen && hasSidebar && sidebarCollapsed && (
                <Button variant="outline" size="sm" onClick={() => setSidebarCollapsed(false)} className="h-7 text-xs">
                  <PanelRightOpen className="h-3.5 w-3.5 mr-1" />
                  Feedback
                  {openSuggestionsCount > 0 && (
                    <Badge variant="primary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                      {openSuggestionsCount}
                    </Badge>
                  )}
                </Button>
              )}
            </div>
          </div>

          <div className={bodyClassName}>
            {variant === 'translate' ? (
              translateTab === 'edit' ? (
                <div ref={translationContainerRef} className="relative h-full">
                  <RawEditorPane
                    ref={translationEditorRef}
                    value={translationContent}
                    onChange={onTranslationChange}
                    onCursorChange={handleTranslationCursorChange}
                    placeholder={translationPlaceholder}
                    currentLine={translationLine}
                    highlightLine={syncedTranslationLine}
                    fullHeight
                    suggestions={showSuggestionDecorations ? suggestions : undefined}
                    onSuggestionClick={showSuggestionDecorations ? handleSuggestionClickInternal : undefined}
                    onSelectionChange={showSelectionToolbar ? handleSelectionChange : undefined}
                    lineInfo={{
                      primaryLabel: 'Translation Line',
                      primaryValue: translationLine,
                      secondaryLabel: sourceViewMode === 'raw' ? 'Source Line' : undefined,
                      secondaryValue: sourceViewMode === 'raw' ? (syncedSourceLine ?? sourceLine) : undefined,
                      direction: 'from',
                    }}
                  />
                  {toolbarPosition && canCreateSuggestions && (
                    <SuggestionInlineToolbar
                      position={toolbarPosition}
                      containerRef={translationContainerRef}
                      onComment={() => handleCreateSuggestion(SuggestionType.COMMENT)}
                      onSuggestEdit={() => handleCreateSuggestion(SuggestionType.CHANGE)}
                    />
                  )}
                  {showSuggestionForm && selectedRange && (
                    <div className="absolute right-4 w-96 bg-green-400 border rounded-lg shadow-lg p-4 z-50">
                      <SuggestionForm
                        type={suggestionFormType}
                        initialProposedText={suggestionFormType === SuggestionType.CHANGE ? selectedText : undefined}
                        onSubmit={handleSuggestionFormSubmit}
                        onCancel={() => requestCloseSuggestionForm()}
                        onDirtyChange={(dirty) => {
                          suggestionFormDirtyRef.current = dirty;
                        }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="prose max-w-none h-full overflow-y-auto p-3">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {translationPreview || translationPreviewEmptyText}
                  </ReactMarkdown>
                </div>
              )
            ) : isReviewEditing ? (
              <div className="h-full flex flex-col space-y-2">
                <RawEditorPane
                  value={translationContent}
                  onChange={onTranslationChange}
                  onCursorChange={handleTranslationCursorChange}
                  currentLine={translationLine}
                  highlightLine={syncedTranslationLine}
                  fullHeight
                  lineInfo={
                    sourceViewMode === 'raw'
                      ? {
                          primaryLabel: 'Translation Line',
                          primaryValue: translationLine,
                          secondaryLabel: 'Source Line',
                          secondaryValue: sourceLine,
                          direction: 'from',
                        }
                      : undefined
                  }
                />
                {translationEditActions}
              </div>
            ) : reviewViewMode === 'formatted' ? (
              <div className="prose max-w-none h-full overflow-y-auto p-3">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{translationPreview}</ReactMarkdown>
              </div>
            ) : (
              <div ref={translationContainerRef} className="relative h-full">
                {selectedUserId ? (
                  // Show diff view when user filter is active
                  <SuggestionDiffViewer
                    originalContent={translationContent}
                    suggestions={suggestions}
                    selectedUserId={selectedUserId}
                    className="h-full"
                    onSuggestionClick={handleSuggestionClickInternal}
                  />
                ) : (
                  // Show normal editor with suggestions
                  <>
                    <RawEditorPane
                      ref={translationEditorRef}
                      value={translationContent}
                      readOnly
                      currentLine={translationLine}
                      highlightLine={syncedTranslationLine}
                      onCursorChange={handleTranslationCursorChange}
                      suggestions={suggestions}
                      onSuggestionClick={handleSuggestionClickInternal}
                      onSelectionChange={handleSelectionChange}
                      lineInfo={{
                        primaryLabel: 'Translation Line',
                        primaryValue: translationLine,
                        secondaryLabel: sourceViewMode === 'raw' ? 'Source Line' : undefined,
                        secondaryValue: sourceViewMode === 'raw' ? (syncedSourceLine ?? sourceLine) : undefined,
                        direction: 'from',
                      }}
                    />
                    {toolbarPosition && canCreateSuggestions && (
                      <SuggestionInlineToolbar
                        position={toolbarPosition}
                        containerRef={translationContainerRef}
                        onComment={() => handleCreateSuggestion(SuggestionType.COMMENT)}
                        onSuggestEdit={() => handleCreateSuggestion(SuggestionType.CHANGE)}
                      />
                    )}
                    {showSuggestionForm && selectedRange && (
                      <div className="absolute top-4 right-4 w-[75%] bg-white border rounded-lg shadow-lg p-4 z-50">
                        <SuggestionForm
                          type={suggestionFormType}
                          initialProposedText={suggestionFormType === SuggestionType.CHANGE ? selectedText : undefined}
                          onSubmit={handleSuggestionFormSubmit}
                          onCancel={() => requestCloseSuggestionForm()}
                          onDirtyChange={(dirty) => {
                            suggestionFormDirtyRef.current = dirty;
                          }}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </Card>

        {(hasSidebar || sidebarHeader) && !sidebarHidden && (
          <div className="flex flex-col overflow-hidden">
            {sidebarHeader}
            {hasSidebar && (
              <ThreadSidebar
                suggestions={suggestions}
                currentUserId={currentUserId || ''}
                translationContent={translationContent}
                canCreateSuggestions={canCreateSuggestions}
                onReply={onReply}
                onApply={onApplySuggestion}
                onDismiss={(id) => onDismissSuggestion?.(id)}
                onReopen={(id) => onReopenSuggestion?.(id)}
                onEdit={onEditSuggestion}
                onSuggestionClick={handleSuggestionClickInternal}
                onCreateGeneralThread={onCreateGeneralThread}
                activeThreadId={activeThreadId}
                onCollapse={isZen ? () => setSidebarCollapsed(true) : undefined}
                disableReopen={disableReopen}
              />
            )}
          </div>
        )}

        <AlertDialog
          open={showDiscardDialog}
          onOpenChange={(open) => {
            if (!open) handleDiscardCancel();
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard unsaved suggestion?</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved changes in your suggestion. Are you sure you want to discard them?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleDiscardCancel}>Keep editing</AlertDialogCancel>
              <AlertDialogAction onClick={handleDiscardConfirm}>Discard</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  },
);
