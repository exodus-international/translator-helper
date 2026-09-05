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
import { Sidebar, SidebarContent, SidebarHeader, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { SuggestionStatus } from '@/generated/prisma/enums';
import { ChevronDown, ChevronRight, Edit, Eye, FileEdit, PanelRightClose, PanelRightOpen, Save, X } from 'lucide-react';
import { ReactNode, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  /** Compact one-line rows shown under the header (audio, deploy). */
  sidebarSummary?: ReactNode;
  /** Full panels shown in place of the feedback list when the user opens details. */
  sidebarDetails?: ReactNode;
  /** Start with the details panels open instead of the feedback list. */
  sidebarDetailsDefaultOpen?: boolean;
  /** Monaco language for the code panes. When 'yaml', the Markdown-rendered views are hidden. */
  contentLanguage?: 'markdown' | 'yaml';
}

const mapLineNumber = (_lineNumber: number, _fromTotal: number, toTotal: number) => {
  return Math.min(Math.max(_lineNumber, 1), Math.max(toTotal, 1));
};

export const SourceTranslationViewer = forwardRef<SourceTranslationViewerHandle, SourceTranslationViewerProps>(
  function SourceTranslationViewerOuter(props, ref) {
    const hasSidebar = (props.suggestions?.length ?? 0) > 0 || props.canCreateSuggestions;
    return (
      <SidebarProvider
        defaultOpen={hasSidebar || !!props.sidebarHeader}
        className={cn(props.className, props.layout === 'zen' && 'h-full')}
      >
        <SourceTranslationViewerInner ref={ref} {...props} />
      </SidebarProvider>
    );
  },
);

const SourceTranslationViewerInner = forwardRef<SourceTranslationViewerHandle, SourceTranslationViewerProps>(
  function SourceTranslationViewerInner(
    {
      variant,
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
      editorRef: externalEditorRef,
      onReply,
      onCreateGeneralThread,
      disableReopen = false,
      sidebarHeader,
      sidebarSummary,
      sidebarDetails,
      sidebarDetailsDefaultOpen = false,
      contentLanguage = 'markdown',
    },
    ref,
  ) {
    const [sidebarView, setSidebarView] = useState<'threads' | 'details'>(
      sidebarDetailsDefaultOpen ? 'details' : 'threads',
    );
    const isZen = layout === 'zen';
    const isYaml = contentLanguage === 'yaml';
    const { open: sidebarOpen, openMobile, setOpenMobile, toggleSidebar } = useSidebar();
    const isMobile = useIsMobile();
    // Mobile shows one pane at a time; translation is the working pane, so start there.
    const [mobilePane, setMobilePane] = useState<'source' | 'translation'>('translation');
    const [mounted, setMounted] = useState(false);
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
    const [selectedUserId] = useState<string | null>(null); // Filter by user for diff view
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

    const sourceLineCount = useMemo(() => sourceContent.split('\n').length, [sourceContent]);
    const translationLineCount = useMemo(() => translationContent.split('\n').length, [translationContent]);

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

      const sourceTotalLines = sourceLineCount;
      const translationTotalLines = translationLineCount;
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

      const sourceTotalLines = sourceLineCount;
      const translationTotalLines = translationLineCount;
      const sourceTargetLine = mapLineNumber(lineNumber, translationTotalLines, sourceTotalLines);
      setSyncedSourceLine(sourceTargetLine);
      // Update the source pane's displayed line to match the synced target
      setSourceLine(sourceTargetLine);
    };

    const handleSuggestionClickInternal = (suggestion: SuggestionWithUser) => {
      setActiveThreadId(suggestion.id);
      if (isMobile) {
        // The thread list lives in the mobile Sheet; jump back to the
        // translation pane so the selected suggestion is actually visible.
        setOpenMobile(false);
        setMobilePane('translation');
      }
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
      ? 'p-3 flex flex-1 flex-col min-w-0 min-h-0'
      : 'p-0 gap-0 shadow-none flex flex-1 flex-col min-w-0 min-h-0';
    const bodyClassName = isZen ? 'flex-1 min-h-0 overflow-hidden relative' : 'flex-1 min-h-0 overflow-hidden';
    // Mobile: only the active pane is displayed; desktop keeps both side by side.
    const paneVisibility = (visible: boolean) => (visible ? 'flex' : 'hidden md:flex');
    const sourcePaneVisible = !isMobile || mobilePane === 'source';
    const translationPaneVisible = !isMobile || mobilePane === 'translation';

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

    const hasSidebar = suggestions.length > 0 || canCreateSuggestions;
    // On mobile the panel is the offcanvas Sheet (openMobile); on desktop it's
    // the docked sidebar (open). "Show panel" must appear whenever it's closed,
    // otherwise mobile users with a pre-opened desktop state can't reach it.
    const panelHidden = isMobile ? !openMobile : !sidebarOpen;

    // Show suggestions decorations and selection toolbar in review mode OR when suggestions exist in translate mode
    const showSuggestionDecorations = suggestions.length > 0;
    const showSelectionToolbar = canCreateSuggestions && (isReviewMode || showSuggestionDecorations);

    return (
      <>
        <div className={cn('flex min-w-0 flex-1 flex-col border-0 md:grid md:grid-cols-2', isZen && 'h-full')}>
          {/* Mobile: one pane at a time, toggled by this switcher. Desktop: both panes side by side. */}
          <Tabs
            value={mobilePane}
            onValueChange={(value) => setMobilePane(value as 'source' | 'translation')}
            className="shrink-0 px-2 pt-2 md:hidden"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="source">Source</TabsTrigger>
              <TabsTrigger value="translation">Translation</TabsTrigger>
            </TabsList>
          </Tabs>

          <Card
            className={cn(
              cardClassName,
              'rounded-none border-t-0 border-r-0 pt-1',
              paneVisibility(sourcePaneVisible),
            )}
          >
            <div className="flex h-12 items-center justify-between px-2">
              {/* The mobile switcher above already names this pane; the language
                  badge below still travels with the header. */}
              <h2 className="hidden min-w-0 truncate text-sm font-semibold md:block">Source (English)</h2>
              <div className="flex flex-1 items-center gap-2 md:flex-none md:justify-end">
                {!isSourceEditing &&
                  !isYaml &&
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
                      <Edit />
                      Edit
                    </Button>
                    {/* <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Trash2 />
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
                      <Save />
                      {sourceSaving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleSourceCancel} disabled={sourceSaving}>
                      <X />
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
                  language={contentLanguage}
                  lineInfo={{
                    primaryLabel: 'Source Line',
                    primaryValue: sourceLine,
                    secondaryLabel: translationRawVisible ? 'Translation Line' : undefined,
                    secondaryValue: translationRawVisible ? (syncedTranslationLine ?? translationLine) : undefined,
                    direction: 'to',
                  }}
                />
              ) : !isYaml && sourceViewMode === 'formatted' ? (
                <div className="prose max-w-none h-full overflow-y-auto p-3">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{sourceFormattedContent}</ReactMarkdown>
                </div>
              ) : (
                <RawEditorPane
                  value={sourceContent}
                  readOnly
                  language={contentLanguage}
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

          <Card
            className={cn(
              cardClassName,
              'rounded-none border-t-0 border-r-0 pt-1',
              paneVisibility(translationPaneVisible),
            )}
          >
            <div className="flex h-12 items-center justify-between px-2">
              <h2 className="hidden min-w-0 truncate text-sm font-semibold md:block">Translation</h2>
              <div className="flex flex-1 items-center gap-2 md:flex-none md:justify-end">
                {variant === 'translate' ? (
                  isYaml ? null : mounted ? (
                    <Tabs value={translateTab} onValueChange={(value) => setTranslateTab(value as 'edit' | 'preview')}>
                      <TabsList>
                        <TabsTrigger value="edit">
                          <FileEdit />
                          Edit
                        </TabsTrigger>
                        <TabsTrigger value="preview">
                          <Eye />
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
                        <FileEdit />
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
                        <Eye />
                        Preview
                      </button>
                    </div>
                  )
                ) : !isReviewEditing && !isYaml ? (
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
                {hasSidebar && panelHidden && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSidebar}
                    className="h-7 text-xs"
                    aria-label="Show panel"
                  >
                    <PanelRightOpen />
                    <span className="hidden sm:inline">Show panel</span>
                    {openSuggestionsCount > 0 && (
                      <Badge variant="primary" className="h-4 min-w-4 px-1 text-[10px]">
                        {openSuggestionsCount}
                      </Badge>
                    )}
                  </Button>
                )}
              </div>
            </div>

            <div className={bodyClassName}>
              {variant === 'translate' ? (
                isYaml || translateTab === 'edit' ? (
                  <div ref={translationContainerRef} className="relative h-full">
                    <RawEditorPane
                      ref={translationEditorRef}
                      value={translationContent}
                      onChange={onTranslationChange}
                      onCursorChange={handleTranslationCursorChange}
                      language={contentLanguage}
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
                      <div className="absolute inset-x-2 z-50 rounded-lg border bg-background p-4 shadow-lg sm:inset-x-auto sm:right-4 sm:w-96">
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
                    language={contentLanguage}
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
              ) : !isYaml && reviewViewMode === 'formatted' ? (
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
                        language={contentLanguage}
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
                        <div className="absolute inset-x-2 top-2 z-50 rounded-lg border bg-background p-4 shadow-lg sm:inset-x-auto sm:top-4 sm:right-4 sm:w-[75%]">
                          <SuggestionForm
                            type={suggestionFormType}
                            initialProposedText={
                              suggestionFormType === SuggestionType.CHANGE ? selectedText : undefined
                            }
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

        {(hasSidebar || sidebarHeader || sidebarSummary) && (
          <Sidebar side="right" collapsible="offcanvas">
            <SidebarHeader className="p-0 gap-0">
              <div className="px-3 py-2 flex items-center justify-between border-b">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Document info
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleSidebar}
                  className="h-7 w-7 p-0"
                  aria-label="Close panel"
                >
                  <PanelRightClose />
                </Button>
              </div>
              {sidebarHeader}
              {sidebarSummary && (
                <div className="border-b border-l-0 px-3 py-2 space-y-1.5 bg-white">
                  {sidebarSummary}
                  {sidebarDetails && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-full justify-start px-1 text-xs text-muted-foreground"
                      onClick={() => setSidebarView(sidebarView === 'details' ? 'threads' : 'details')}
                    >
                      {sidebarView === 'details' ? (
                        <>
                          <ChevronDown />
                          Hide details
                        </>
                      ) : (
                        <>
                          <ChevronRight />
                          Open details
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </SidebarHeader>
            <SidebarContent className="p-0 gap-0">
              {sidebarView === 'details' && sidebarDetails && <div className="shrink-0">{sidebarDetails}</div>}
              {hasSidebar && (
                <div className="flex-1 min-h-[16rem] flex flex-col">
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
                  disableReopen={disableReopen}
                />
                </div>
              )}
            </SidebarContent>
          </Sidebar>
        )}
      </>
    );
  },
);
