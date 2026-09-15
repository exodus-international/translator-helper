import { RawEditorPane } from '@/components/raw-editor-panel';
import type { CodeEditorHandle } from '@/components/editor/code-editor';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { getDocumentStatusConfig } from '@/constants/document-status';
import { EDITOR_SIDEBAR_COOKIE_NAME } from '@/lib/sidebar-cookie';
import { DocumentStatus, SuggestionStatus } from '@/generated/prisma/enums';
import {
  BookOpen,
  ChevronDown,
  Edit,
  Eye,
  FileEdit,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Save,
  X,
} from 'lucide-react';
import { ReactNode, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ReaderPreview } from '@/components/reader-preview';
import { SuggestionWithUser } from '@/domain/suggestion/suggestion.types';
import type { LintDiagnostic } from '@/lib/lint';
import { LintStatusBar } from '@/components/editor/lint-status-bar';
import { MarkdownGuideDialog } from '@/components/markdown-guide';
import { SuggestionDiffViewer } from './suggestion-diff-viewer';
import { SuggestionForm } from './suggestion-form';
import { SuggestionInlineToolbar } from './suggestion-inline-toolbar';
import { ThreadSidebar } from './thread-sidebar';
import { AudioTextPanel } from '@/components/audio-text-panel';
import type { AudioTranscriptState } from '@/domain/audio/audio.types';
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

/** Formatted and Review are the old pair; Audio text is offered only where audio applies. */
type TranslationViewMode = 'formatted' | 'review' | 'audio';

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
  /**
   * Offers the Audio text tab. Resolved on the server from the same eligibility
   * check that decides whether audio is generated at all, so the tab never
   * appears on a document that will never have any.
   */
  audioTextVersionId?: string | null;
  /** Set by something outside the viewer (the audio card) asking for a tab. */
  requestedView?: 'audio' | null;
  onRequestedViewShown?: () => void;
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
  editorRef?: React.RefObject<CodeEditorHandle | null>; // Ref to the editor, to read cursor position
  onReply?: (suggestionId: string, content: string) => void;
  onCreateGeneralThread?: (comment: string) => void;
  disableReopen?: boolean;
  sidebarHeader?: ReactNode;
  /** Workflow buttons, shown under the info card in the panel. */
  sidebarActions?: ReactNode;
  /** Compact one-line rows shown under the header (audio, deploy). */
  sidebarSummary?: ReactNode;
  /** Full panels shown in place of the feedback list when the user opens details. */
  sidebarDetails?: ReactNode;
  /** Start with the details panels open instead of the feedback list. */
  sidebarDetailsDefaultOpen?: boolean;
  /**
   * The state the version is in. The panel's collapsed rail shows it as one
   * coloured dot, so a folded panel still says where the document stands.
   */
  status?: DocumentStatus | null;
  /**
   * The editor's own controls -- the save state, the zen toggle -- drawn in the
   * panel's header row. They are chrome about the document, which is what the
   * panel is; the row above the panes had them only because it came first.
   */
  panelActions?: ReactNode;
  /**
   * Toggles zen mode. Present only on the editor that has one; the folded rail
   * then keeps its button, because zen is a change of view and the rail is
   * still on screen.
   */
  onToggleZen?: () => void;
  /** Language id for the code panes. When 'yaml', the Markdown-rendered views are hidden. */
  contentLanguage?: 'markdown' | 'yaml';
  /**
   * False until this language has a version. The translation pane then offers
   * the call to action instead of an editor — there is nothing to type into yet,
   * and linting an empty document only reports everything as missing.
   */
  translationStarted?: boolean;
  onStartTranslation?: () => void;
  startingTranslation?: boolean;
  /** Opens the Markdown guide from a lint finding. */
  onOpenGuide?: () => void;
  /** Passed through to the Audio text tab so the sidebar card's badge follows what happens in it. */
  onAudioTranscriptStateChange?: (state: AudioTranscriptState) => void;
}

const mapLineNumber = (_lineNumber: number, _fromTotal: number, toTotal: number) => {
  return Math.min(Math.max(_lineNumber, 1), Math.max(toTotal, 1));
};

/**
 * Where the cursor sits in this pane and where its counterpart sits in the
 * other, kept in step by the cursor handlers above. It lives in the pane header
 * because it is chrome: as a strip above the editor it bought its own line of
 * the document it only describes.
 */
function CursorSync({ line, otherLine, title }: { line: number; otherLine: number; title: string }) {
  return (
    <span
      className="hidden shrink-0 items-center gap-1 font-mono text-[11px] tabular-nums text-muted-foreground sm:inline-flex"
      title={title}
    >
      L{line}
      <span className="text-muted-foreground/50" aria-hidden>
        ↔
      </span>
      <span className="text-muted-foreground/60">L{otherLine}</span>
    </span>
  );
}

export const SourceTranslationViewer = forwardRef<SourceTranslationViewerHandle, SourceTranslationViewerProps>(
  function SourceTranslationViewerOuter(props, ref) {
    const hasSidebar = (props.suggestions?.length ?? 0) > 0 || props.canCreateSuggestions;
    // Same condition the inner component renders the panel on -- keep the two
    // in step, or a document with only a summary renders a panel that starts
    // closed.
    const hasPanel = hasSidebar || !!props.sidebarHeader || !!props.sidebarSummary;
    return (
      <SidebarProvider
        defaultOpen={hasPanel}
        // Nested inside the app shell's own provider: keep this one from
        // stealing ⌘B (which would toggle both sidebars at once) and from
        // overwriting the shell's persisted state cookie.
        keyboardShortcut={false}
        cookieName={EDITOR_SIDEBAR_COOKIE_NAME}
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
      audioTextVersionId = null,
      requestedView = null,
      onRequestedViewShown,
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
      sidebarActions,
      sidebarSummary,
      sidebarDetails,
      sidebarDetailsDefaultOpen = false,
      status,
      panelActions,
      onToggleZen,
      contentLanguage = 'markdown',
      translationStarted = true,
      onStartTranslation,
      startingTranslation = false,
      onOpenGuide,
      onAudioTranscriptStateChange,
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
    const [reviewViewMode, setReviewViewMode] = useState<TranslationViewMode>('review');

    // The tab strip is not rendered for a YAML document, so an Audio text pane
    // there would be one with no way back out. Everything that opens the tab
    // and everything that renders it reads this, not the prop.
    const audioTabVersionId = isYaml ? null : audioTextVersionId;

    // A request is consumed, not mirrored: the tab strip stays the one place
    // that knows which tab is open.
    useEffect(() => {
      if (requestedView === 'audio' && audioTabVersionId) {
        setReviewViewMode('audio');
        onRequestedViewShown?.();
      }
    }, [requestedView, audioTabVersionId, onRequestedViewShown]);
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
    // The Audio text tab is unmounted the moment another tab is chosen, taking
    // an unsaved draft with it. Same guard the suggestion form gets.
    const audioDraftDirtyRef = useRef(false);
    const [showDiscardDialog, setShowDiscardDialog] = useState(false);
    const [discardKind, setDiscardKind] = useState<'suggestion' | 'audioText'>('suggestion');
    const pendingDiscardActionRef = useRef<(() => void) | null>(null);
    const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number } | null>(null);
    const translationEditorRef = useRef<CodeEditorHandle | null>(null);
    const [translationDiagnostics, setTranslationDiagnostics] = useState<LintDiagnostic[]>([]);
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
          const editor = (translationEditorRef.current || externalEditorRef?.current)?.editor;
          if (editor) {
            const range = {
              startLine: suggestion.startLine,
              startColumn: suggestion.startColumn,
              endLine: suggestion.endLine,
              endColumn: suggestion.endColumn,
            };
            editor.revealRange(range);
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

    // One pane object, shared by both sides: a sheet on the workspace ground,
    // with room for a header and nothing else of its own.
    const paneClassName = 'min-h-0 min-w-0 flex-1 gap-0 overflow-hidden rounded-lg border bg-editor p-0 shadow-none';
    const panelStatus = status ? getDocumentStatusConfig(status) : null;
    const bodyClassName = 'relative min-h-0 flex-1 overflow-hidden';
    // Mobile: only the active pane is displayed; desktop keeps both side by side.
    const paneVisibility = (visible: boolean) => (visible ? 'flex' : 'hidden md:flex');
    const sourcePaneVisible = !isMobile || mobilePane === 'source';
    const translationPaneVisible = !isMobile || mobilePane === 'translation';
    // Report only once there is text to report on. A version that has just
    // been started is empty, and checking it against the source calls every
    // heading, key and link missing — an error the translator has not made.
    // (The rules themselves already stay quiet on an empty document; this keeps
    // the bar from saying anything at all until there is work to judge.)
    const translationHasContent = translationContent.trim().length > 0;
    // The cursor chip only means something when both panes are showing editors:
    // it names this pane's line and the line the other pane is parked on.
    const showCursorSync = sourceViewMode === 'raw' && translationRawVisible;

    const exitReviewEditMode = () => {
      setIsReviewEditing(false);
      setReviewViewMode('review');
      setSyncedTranslationLine(undefined);
    };

    const enterReviewEditMode = () => {
      if (!reviewConfig?.canEdit) return;
      // Editing the translation replaces the Audio text pane with the editor,
      // so ask before it takes an unsaved draft with it.
      requestLeaveAudioText(() => {
        setIsReviewEditing(true);
        setTranslateTab('edit');
      });
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
        setDiscardKind('suggestion');
        setShowDiscardDialog(true);
      },
      [doCloseSuggestionForm],
    );

    /** Leaving the Audio text tab, once whoever is in it has agreed to lose the draft. */
    const requestLeaveAudioText = useCallback((proceed: () => void) => {
      if (!audioDraftDirtyRef.current) {
        proceed();
        return;
      }
      pendingDiscardActionRef.current = () => {
        audioDraftDirtyRef.current = false;
        proceed();
      };
      setDiscardKind('audioText');
      setShowDiscardDialog(true);
    }, []);

    const handleDiscardConfirm = useCallback(() => {
      if (discardKind === 'suggestion') doCloseSuggestionForm();
      setShowDiscardDialog(false);
      pendingDiscardActionRef.current?.();
      pendingDiscardActionRef.current = null;
    }, [doCloseSuggestionForm, discardKind]);

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
        const editor = (translationEditorRef.current || externalEditorRef?.current)?.editor;

        if (editor) {
          try {
            setSelectedText(editor.getTextInRange(range));
          } catch (error) {
            console.error('Error getting selected text from the editor:', error);
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
        const editor = (translationEditorRef.current || externalEditorRef?.current)?.editor;
        if (editor) {
          try {
            const pos = editor.coordsAt({ line: range.endLine, column: range.endColumn });
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
    // The panel exists whenever it has anything to show; Document info alone is
    // enough. `hasSidebar` is narrower -- it gates the thread list -- so using
    // it for the reopen button made the panel a trapdoor on documents without
    // suggestions, and hid it outright on mobile, where it starts closed.
    const hasPanel = hasSidebar || !!sidebarHeader || !!sidebarSummary;

    // Show suggestions decorations and selection toolbar in review mode OR when suggestions exist in translate mode
    const showSuggestionDecorations = suggestions.length > 0;
    const showSelectionToolbar = canCreateSuggestions && (isReviewMode || showSuggestionDecorations);

    return (
      <>
        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col gap-2 bg-workspace p-2 md:grid md:grid-cols-2',
            isZen && 'h-full',
          )}
        >
          {/* Mobile: one pane at a time, toggled by this switcher. Desktop: both panes side by side. */}
          <Tabs
            value={mobilePane}
            onValueChange={(value) => setMobilePane(value as 'source' | 'translation')}
            className="shrink-0 md:hidden"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="source">Source</TabsTrigger>
              <TabsTrigger value="translation">Translation</TabsTrigger>
            </TabsList>
          </Tabs>

          <Card className={cn(paneClassName, paneVisibility(sourcePaneVisible))}>
            <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
              {/* The mobile switcher above already names this pane; the language
                  badge below still travels with the header. */}
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="hidden min-w-0 truncate text-sm font-medium md:block">Source</h2>
                {sourceBadge}
                {showCursorSync && (
                  <CursorSync
                    line={sourceLine}
                    otherLine={syncedTranslationLine ?? translationLine}
                    title={`Source line ${sourceLine} ↔ translation line ${syncedTranslationLine ?? translationLine}`}
                  />
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!isSourceEditing &&
                  !isYaml &&
                  (mounted ? (
                    <Tabs
                      value={sourceViewMode}
                      onValueChange={(value) => setSourceViewMode(value as 'formatted' | 'raw')}
                    >
                      <TabsList className="h-8">
                        <TabsTrigger value="formatted">Live</TabsTrigger>
                        <TabsTrigger value="raw">Markdown</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  ) : (
                    <div className="inline-flex h-8 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
                      <button
                        type="button"
                        disabled
                        className={cn(
                          'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                          sourceViewMode === 'formatted' && 'bg-background shadow-sm',
                        )}
                      >
                        Live
                      </button>
                      <button
                        type="button"
                        disabled
                        className={cn(
                          'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                          sourceViewMode === 'raw' && 'bg-background shadow-sm',
                        )}
                      >
                        Markdown
                      </button>
                    </div>
                  ))}
                {canEditSource && !isSourceEditing && (
                  <>
                    <Button variant="outline" size="sm" onClick={enterSourceEditMode}>
                      <Edit />
                      Edit
                    </Button>
                    {/* <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline">
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
                  onOpenGuide={onOpenGuide}
                />
              ) : !isYaml && sourceViewMode === 'formatted' ? (
                <ReaderPreview content={sourceFormattedContent} />
              ) : (
                <RawEditorPane
                  value={sourceContent}
                  readOnly
                  lint={false}
                  language={contentLanguage}
                  currentLine={sourceLine}
                  highlightLine={syncedSourceLine}
                  onCursorChange={handleSourceCursorChange}
                  fullHeight
                  onOpenGuide={onOpenGuide}
                />
              )}
            </div>
          </Card>

          <Card className={cn(paneClassName, paneVisibility(translationPaneVisible))}>
            <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="hidden min-w-0 truncate text-sm font-medium md:block">Translation</h2>
                {translationBadge}
                {showCursorSync && (
                  <CursorSync
                    line={translationLine}
                    otherLine={syncedSourceLine ?? sourceLine}
                    title={`Translation line ${translationLine} ↔ source line ${syncedSourceLine ?? sourceLine}`}
                  />
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {variant === 'translate' ? (
                  isYaml ? null : mounted ? (
                    <Tabs value={translateTab} onValueChange={(value) => setTranslateTab(value as 'edit' | 'preview')}>
                      <TabsList className="h-8">
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
                    <div className="inline-flex h-8 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
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
                      onValueChange={(value) => {
                        const next = value as TranslationViewMode;
                        if (reviewViewMode === 'audio' && next !== 'audio') {
                          requestLeaveAudioText(() => setReviewViewMode(next));
                          return;
                        }
                        setReviewViewMode(next);
                      }}
                    >
                      <TabsList className="h-8">
                        <TabsTrigger value="formatted">Live</TabsTrigger>
                        <TabsTrigger value="review">
                          Review
                          {openSuggestionsCount > 0 && (
                            <Badge variant="default" className="h-4 min-w-4 px-1 text-[10px]">
                              {openSuggestionsCount}
                            </Badge>
                          )}
                        </TabsTrigger>
                        {audioTabVersionId && <TabsTrigger value="audio">Audio text</TabsTrigger>}
                      </TabsList>
                    </Tabs>
                  ) : (
                    <div className="inline-flex h-8 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
                      <button
                        type="button"
                        disabled
                        className={cn(
                          'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                          reviewViewMode === 'formatted' && 'bg-background shadow-sm',
                        )}
                      >
                        Live
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
                          <Badge variant="default" className="h-4 min-w-4 px-1 text-[10px]">
                            {openSuggestionsCount}
                          </Badge>
                        )}
                      </button>
                    </div>
                  )
                ) : null}
                {translationHeaderExtra}
                {variant === 'review' && reviewConfig?.headerExtra}
                {/* On desktop the panel folds to its own rail, so it needs no
                    button here. On mobile it is a sheet with no rail to reach
                    for, and this icon is the only way in. */}
                {hasPanel && panelHidden && (
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={toggleSidebar}
                    className="md:hidden"
                    aria-label="Open document panel"
                    title="Open document panel"
                  >
                    <PanelRightOpen />
                  </Button>
                )}
              </div>
            </div>

            <div className={bodyClassName}>
              {variant === 'translate' ? (
                !translationStarted ? (
                  <Empty className="h-full border-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <FileEdit />
                      </EmptyMedia>
                      <EmptyTitle>No translation yet</EmptyTitle>
                      <EmptyDescription>
                        Start the translation for this document and write it here, next to the source.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button onClick={onStartTranslation} disabled={startingTranslation}>
                        {startingTranslation ? <Loader2 className="animate-spin" /> : <Plus />}
                        Start translation
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : isYaml || translateTab === 'edit' ? (
                  <div ref={translationContainerRef} className="relative h-full">
                    <RawEditorPane
                      ref={translationEditorRef}
                      value={translationContent}
                      onChange={onTranslationChange}
                      onCursorChange={handleTranslationCursorChange}
                      language={contentLanguage}
                      sourceContent={sourceContent}
                      onDiagnosticsChange={setTranslationDiagnostics}
                      footer={
                        translationHasContent ? (
                          <LintStatusBar
                            diagnostics={translationDiagnostics}
                            onFixAll={() => translationEditorRef.current?.fixAll()}
                          />
                        ) : undefined
                      }
                      placeholder={translationPlaceholder}
                      currentLine={translationLine}
                      highlightLine={syncedTranslationLine}
                      fullHeight
                      suggestions={showSuggestionDecorations ? suggestions : undefined}
                      onSuggestionClick={showSuggestionDecorations ? handleSuggestionClickInternal : undefined}
                      onSelectionChange={showSelectionToolbar ? handleSelectionChange : undefined}
                      onOpenGuide={onOpenGuide}
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
                  <ReaderPreview content={translationPreview || translationPreviewEmptyText} />
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
                    sourceContent={sourceContent}
                    fullHeight
                    onOpenGuide={onOpenGuide}
                  />
                  {translationEditActions}
                </div>
              ) : audioTabVersionId && reviewViewMode === 'audio' ? (
                <AudioTextPanel
                  documentVersionId={audioTabVersionId}
                  onStateChange={onAudioTranscriptStateChange}
                  onDirtyChange={(dirty) => {
                    audioDraftDirtyRef.current = dirty;
                  }}
                />
              ) : !isYaml && reviewViewMode === 'formatted' ? (
                <ReaderPreview content={translationPreview} />
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
                        sourceContent={sourceContent}
                        currentLine={translationLine}
                        highlightLine={syncedTranslationLine}
                        onCursorChange={handleTranslationCursorChange}
                        suggestions={suggestions}
                        onSuggestionClick={handleSuggestionClickInternal}
                        onSelectionChange={handleSelectionChange}
                        onOpenGuide={onOpenGuide}
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
                <AlertDialogTitle>
                  {discardKind === 'audioText' ? 'Discard unsaved audio text?' : 'Discard unsaved suggestion?'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {discardKind === 'audioText'
                    ? 'The audio text has changes that have not been saved. Leaving this tab loses them.'
                    : 'You have unsaved changes in your suggestion. Are you sure you want to discard them?'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={handleDiscardCancel}>Keep editing</AlertDialogCancel>
                <AlertDialogAction onClick={handleDiscardConfirm}>Discard</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {hasPanel && (
          <Sidebar
            side="right"
            variant="floating"
            collapsible="icon"
            // The panel is a sidebar painted with the editor's own tokens, so
            // the third column reads as another sheet on the workspace rather
            // than a second kind of surface. Collapsed it keeps a rail — the
            // document's state at a glance, and the way back in — which is what
            // replaces the "Show panel" button the pane header used to carry.
            style={{ '--sidebar': 'var(--editor)', '--sidebar-border': 'var(--border)' } as React.CSSProperties}
          >
            {/* Folded: the rail. Same affordance as the app nav's, so folding
                this panel and folding the shell's behave the same way. */}
            <SidebarContent className="hidden gap-1 p-2 group-data-[collapsible=icon]:flex">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Open document panel" onClick={toggleSidebar}>
                    <PanelRightOpen />
                    <span>Open</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {panelStatus && (
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip={`Status: ${panelStatus.name}`} onClick={toggleSidebar}>
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: panelStatus.color.hex }}
                      />
                      <span>{panelStatus.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={`${openSuggestionsCount} open ${openSuggestionsCount === 1 ? 'comment' : 'comments'}`}
                    onClick={() => {
                      setSidebarView('threads');
                      toggleSidebar();
                    }}
                  >
                    <MessageSquare />
                    <span>Comments</span>
                    {openSuggestionsCount > 0 && (
                      <span className="absolute top-0 right-0 rounded-full bg-primary px-1 text-[10px] leading-4 tabular-nums text-primary-foreground">
                        {openSuggestionsCount}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Markdown guide" onClick={onOpenGuide}>
                    <BookOpen />
                    <span>Guide</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {onToggleZen && (
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip={isZen ? 'Exit zen mode' : 'Zen mode'} onClick={onToggleZen}>
                      {isZen ? <Minimize2 /> : <Maximize2 />}
                      <span>{isZen ? 'Exit zen' : 'Zen mode'}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarContent>

            {/* The panel's own header, the height of the panes': one control,
                so folding is a button as well as the seam between columns. */}
            <SidebarHeader className="gap-0 p-0 group-data-[collapsible=icon]:hidden">
              <div className="flex h-11 shrink-0 items-center justify-end gap-1 border-b px-2">
                {panelActions && <div className="mr-auto flex items-center gap-1">{panelActions}</div>}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={toggleSidebar}
                  aria-label="Fold document panel"
                  title="Fold document panel"
                >
                  <PanelRightClose />
                </Button>
              </div>
            </SidebarHeader>

            {/* Unfolded: the facts, the actions and the status rows scroll
                together, so a tall panel never clips the button someone came to
                press. */}
            <SidebarContent className="gap-0 p-0 group-data-[collapsible=icon]:hidden">
              <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
                {sidebarHeader}
                {sidebarActions}
                {sidebarSummary && (
                  <div className="flex flex-col divide-y overflow-hidden rounded-lg border bg-card [&>*]:px-3 [&>*]:py-2.5">
                    {sidebarSummary}
                  </div>
                )}
                {/* The details are their own card: as a row inside the card
                    above they read as one more button, and open they read as a
                    second, unstyled list bolted onto the panel.

                    The header is the trigger, which is why the label is a span
                    rather than CardTitle: a control that is a whole row cannot
                    hold a div, and the alternative -- a title nobody can click
                    plus a chevron to hit -- splits one target into two. The
                    chevron turns off the trigger's own state, so the motion is
                    CSS and the row says expanded to a screen reader either way. */}
                {sidebarDetails && (
                  <Card className="gap-0 overflow-hidden rounded-lg py-0 shadow-none">
                    <Collapsible
                      open={sidebarView === 'details'}
                      onOpenChange={(open) => setSidebarView(open ? 'details' : 'threads')}
                    >
                      <CollapsibleTrigger
                        render={
                          <Button
                            variant="ghost"
                            // ring-inset: the card clips what it contains, and a
                            // focus ring on the header's edge would be half cut.
                            className="group h-auto w-full justify-between rounded-none bg-muted/60 px-3 py-2 transition-colors focus-visible:ring-inset"
                          />
                        }
                      >
                        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          Details
                        </span>
                        <ChevronDown className="size-3.5 text-muted-foreground transition-transform duration-200 group-aria-expanded:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="border-t [&>section:last-child]:border-b-0">
                        {sidebarDetails}
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                )}

                {hasSidebar && (
                  <div className="flex min-h-[16rem] flex-1 flex-col">
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
              </div>
            </SidebarContent>

            {/* Folding happens at the panel's own edge, the way the app nav's
                does. The rail is only reachable on desktop, where the collapsed
                panel is still on screen. */}
            <SidebarRail />
          </Sidebar>
        )}

        {/* Mounted once for the whole editor: the lint cards and the panel
            button both open this one dialog. */}
        <MarkdownGuideDialog />
      </>
    );
  },
);
