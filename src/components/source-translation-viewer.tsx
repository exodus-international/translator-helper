import { RawEditorPane } from '@/components/raw-editor-panel';
import { DocumentPanel } from '@/components/editor/document-panel';
import { PaneTabs } from '@/components/editor/pane-tabs';
import type { CodeEditorHandle } from '@/components/editor/code-editor';
import { useCursorSync } from '@/components/editor/use-cursor-sync';
import { useSourceEditing } from '@/components/editor/use-source-editing';
import { selectionBox, useFollowSelection, type SelectionBox } from '@/components/editor/toolbar-placement';
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { getDocumentStatusConfig } from '@/constants/document-status';
import { EDITOR_SIDEBAR_COOKIE_NAME } from '@/lib/sidebar-cookie';
import { DocumentStatus, SuggestionStatus } from '@/generated/prisma/enums';
import {
  Edit,
  Eye,
  FileCode,
  FileEdit,
  Loader2,
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
import { CopyAllButton } from './editor/copy-all-button';
import { FormattingToolbar } from './editor/formatting-toolbar';
import { useFormattingToolbar } from './editor/use-formatting-toolbar';
import { SuggestionInlineToolbar } from './suggestion-inline-toolbar';
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
  /**
   * True when this document has no target language yet, so there is nothing to
   * translate into. The panel says so in full; the folded rail has to say it
   * too, since the panel's folded state persists across documents and would
   * otherwise leave the next one silently empty.
   */
  targetLanguageMissing?: boolean;
  /** Opens the Markdown guide from a lint finding. */
  onOpenGuide?: () => void;
  /** Passed through to the Audio text tab so the sidebar card's badge follows what happens in it. */
  onAudioTranscriptStateChange?: (state: AudioTranscriptState) => void;
}

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
      targetLanguageMissing = false,
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
    const [toolbarPosition, setToolbarPosition] = useState<SelectionBox | null>(null);
    const translationEditorRef = useRef<CodeEditorHandle | null>(null);
    const [translationDiagnostics, setTranslationDiagnostics] = useState<LintDiagnostic[]>([]);
    const sourceEditorRef = useRef<CodeEditorHandle | null>(null);
    const sourceContainerRef = useRef<HTMLDivElement>(null);
    const translationContainerRef = useRef<HTMLDivElement>(null);
    const [selectedUserId] = useState<string | null>(null); // Filter by user for diff view

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
    // The cursor chip only means something when both panes are showing editors:
    // it names this pane's line and the line the other pane is parked on. It is
    // also when a line moved to in one comes level in the other -- side by
    // side, not a tab apart.
    const showCursorSync = sourceViewMode === 'raw' && translationRawVisible;
    const {
      sourceLine,
      translationLine,
      syncedSourceLine,
      syncedTranslationLine,
      handleSourceCursorChange,
      handleTranslationCursorChange,
      jumpToTranslationLine,
      clearTranslationSync,
    } = useCursorSync({
      sourceContent,
      translationContent,
      sourceEditorRef,
      translationEditorRef,
      active: showCursorSync && !isMobile,
      translationRawVisible,
      sourceRawVisible: sourceViewMode === 'raw',
    });
    const {
      isSourceEditing,
      sourceEditValue,
      sourceSaving,
      sourcePaneDiagnostics,
      setSourceDiagnostics,
      handleSourceEditChange,
      handleSourceSave,
      handleSourceCancel,
      enterSourceEditMode,
    } = useSourceEditing({
      canEditSource,
      sourceContent,
      sourceEditContent,
      onSourceChange,
      onSourceSave,
      // `!isYaml` for the same reason the editor gates itself on the language:
      // these are Markdown rules.
      inPreview: !isYaml && sourceViewMode === 'formatted',
      onEnter: () => setSourceViewMode('raw'),
    });
    // The suggestion toolbar is placed where the selection is on screen, so it
    // moves with the selection as the pane scrolls.
    useFollowSelection(toolbarPosition !== null, translationContainerRef, translationEditorRef, setToolbarPosition);

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

          // Both panes mark the lines for context; the source shows its
          // editor if it was on the preview, so the mark is visible.
          jumpToTranslationLine(suggestion.startLine);
          if (sourceViewMode !== 'raw') {
            setSourceViewMode('raw');
          }
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
    const translationHasContent = translationContent.trim().length > 0;

    const exitReviewEditMode = () => {
      setIsReviewEditing(false);
      setReviewViewMode('review');
      clearTranslationSync();
    };

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

    // Everything below is read off a selection, and the editor that reported it
    // is unmounted when the view changes. A freshly mounted one says nothing
    // until someone moves the cursor, so this state used to outlive the pane it
    // came from: the suggestion toolbar reappeared at its old coordinates with
    // nothing highlighted, and Comment or Suggest edit filed against a range
    // out of a tab the reviewer had already left. The form goes too -- it
    // remounts empty while its dirty flag stayed set, so cancelling a form
    // nobody had touched asked whether to discard the work in it.
    useEffect(() => {
      setToolbarPosition(null);
      doCloseSuggestionForm();
    }, [reviewViewMode, translateTab, isReviewEditing, doCloseSuggestionForm]);

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

      const showToolbar =
        !!range && ((canCreateSuggestions && (isReviewMode || suggestions.length > 0)) || formattingEnabled);
      const view = showToolbar ? (translationEditorRef.current || externalEditorRef?.current)?.view : null;
      setToolbarPosition(view ? selectionBox(view) : null);
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

    // A notification about a suggestion links here with ?thread=<id>. Once that
    // thread has loaded, open the panel on it and bring its lines into view,
    // the same as clicking it. Only once: after that the panel is the user's.
    const threadLinkHandled = useRef(false);
    useEffect(() => {
      if (!mounted || threadLinkHandled.current) return;
      const threadId = new URLSearchParams(window.location.search).get('thread');
      if (!threadId) {
        threadLinkHandled.current = true;
        return;
      }
      const suggestion = suggestions.find((s) => s.id === threadId);
      if (!suggestion) return;
      threadLinkHandled.current = true;
      setSidebarView('threads');
      if (isMobile) {
        // On a phone the thread list is a sheet; show the thread there.
        setActiveThreadId(suggestion.id);
        setOpenMobile(true);
        return;
      }
      if (!sidebarOpen) toggleSidebar();
      // The editor mounts after the page; give it a moment before scrolling it.
      setTimeout(() => handleSuggestionClickInternal(suggestion), 300);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when the linked thread first appears
    }, [mounted, suggestions]);
    // On mobile the panel is the offcanvas Sheet (openMobile); on desktop it's
    // the docked sidebar (open). "Show panel" must appear whenever it's closed,
    // otherwise mobile users with a pre-opened desktop state can't reach it.
    const panelHidden = isMobile ? !openMobile : !sidebarOpen;
    // The panel exists whenever it has anything to show; Document info alone is
    // enough. `hasSidebar` is narrower -- it gates the thread list -- so using
    // it for the reopen button made the panel a trapdoor on documents without
    // suggestions, and hid it outright on mobile, where it starts closed.
    const hasPanel = hasSidebar || !!sidebarHeader || !!sidebarSummary;
    // There is a translation to copy once one has been started, and the Audio
    // text tab shows a different text -- the transcript, with its own editor
    // -- so a button there reading "copy translation" would not copy what is
    // on screen.
    const showingAudioText =
      variant === 'review' && !isReviewEditing && !!audioTabVersionId && reviewViewMode === 'audio';
    const showTranslationCopy = (variant === 'review' || translationStarted) && !showingAudioText;

    // Show suggestions decorations and selection toolbar in review mode OR when suggestions exist in translate mode
    const showSuggestionDecorations = suggestions.length > 0;
    const showSelectionToolbar = canCreateSuggestions && (isReviewMode || showSuggestionDecorations);
    // Formatting is offered wherever the translation pane is the thing being
    // typed into. Where the suggestion toolbar owns the selection (review, or a
    // document with feedback), that toolbar keeps the spot.
    const formattingEnabled = variant === 'translate' && translateTab === 'edit' && !showSelectionToolbar;
    // The same toolbar for both panes: one hook each, pointed at the editor of
    // the pane and the box it floats over.
    const sourceFormatting = useFormattingToolbar({
      editorRef: sourceEditorRef,
      containerRef: sourceContainerRef,
      enabled: isSourceEditing,
    });
    const translationFormatting = useFormattingToolbar({
      editorRef: translationEditorRef,
      containerRef: translationContainerRef,
      enabled: formattingEnabled,
    });

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
                {!isSourceEditing && !isYaml && (
                  <PaneTabs
                    mounted={mounted}
                    value={sourceViewMode}
                    onValueChange={setSourceViewMode}
                    tabs={[
                      { value: 'raw', label: 'Markdown', icon: <FileCode /> },
                      { value: 'formatted', label: 'Preview', icon: <Eye /> },
                    ]}
                  />
                )}
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
                {/* Last in the row, so it keeps its place while Edit turns
                    into Save and Cancel. What is being edited is what gets
                    copied. */}
                <CopyAllButton pane="source" text={isSourceEditing ? sourceEditValue : sourceContent} />
                {sourceHeaderExtra}
              </div>
            </div>
            <div ref={sourceContainerRef} className={bodyClassName}>
              {sourceFormatting.position && (
                <FormattingToolbar
                  position={sourceFormatting.position}
                  active={sourceFormatting.active}
                  containerRef={sourceContainerRef}
                  onFormat={sourceFormatting.onFormat}
                />
              )}
              {isSourceEditing ? (
                <RawEditorPane
                  ariaLabel="Source text"
                  ref={sourceEditorRef}
                  value={sourceEditValue}
                  onChange={handleSourceEditChange}
                  onSelectionChange={sourceFormatting.onSelectionChange}
                  currentLine={sourceLine}
                  highlightLine={syncedSourceLine}
                  onCursorChange={handleSourceCursorChange}
                  fullHeight
                  language={contentLanguage}
                  isSource
                  onDiagnosticsChange={setSourceDiagnostics}
                  onOpenGuide={onOpenGuide}
                  footer={
                    <LintStatusBar
                      diagnostics={sourcePaneDiagnostics}
                      onFixAll={() => sourceEditorRef.current?.fixAll()}
                    />
                  }
                />
              ) : !isYaml && sourceViewMode === 'formatted' ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <ReaderPreview content={sourceFormattedContent} />
                  </div>
                  <LintStatusBar diagnostics={sourcePaneDiagnostics} />
                </div>
              ) : (
                <RawEditorPane
                  ariaLabel="Source text"
                  ref={sourceEditorRef}
                  value={sourceContent}
                  readOnly
                  language={contentLanguage}
                  currentLine={sourceLine}
                  highlightLine={syncedSourceLine}
                  onCursorChange={handleSourceCursorChange}
                  fullHeight
                  isSource
                  onDiagnosticsChange={setSourceDiagnostics}
                  onOpenGuide={onOpenGuide}
                  footer={
                    <LintStatusBar
                      diagnostics={sourcePaneDiagnostics}
                      onFixAll={() => sourceEditorRef.current?.fixAll()}
                    />
                  }
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
                  isYaml ? null : (
                    <PaneTabs
                      mounted={mounted}
                      value={translateTab}
                      onValueChange={setTranslateTab}
                      tabs={[
                        { value: 'edit', label: 'Edit', icon: <FileEdit /> },
                        { value: 'preview', label: 'Preview', icon: <Eye /> },
                      ]}
                    />
                  )
                ) : !isReviewEditing && !isYaml ? (
                  <PaneTabs
                    mounted={mounted}
                    value={reviewViewMode}
                    onValueChange={(next) => {
                      if (reviewViewMode === 'audio' && next !== 'audio') {
                        requestLeaveAudioText(() => setReviewViewMode(next));
                        return;
                      }
                      setReviewViewMode(next);
                    }}
                    tabs={[
                      { value: 'formatted', label: 'Live' },
                      {
                        value: 'review',
                        label: (
                          <>
                            Review
                            {openSuggestionsCount > 0 && (
                              <Badge variant="default" className="h-4 min-w-4 px-1 text-[10px]">
                                {openSuggestionsCount}
                              </Badge>
                            )}
                          </>
                        ),
                      },
                      ...(audioTabVersionId ? [{ value: 'audio' as const, label: 'Audio text' }] : []),
                    ]}
                  />
                ) : null}
                {showTranslationCopy && <CopyAllButton pane="translation" text={translationContent} />}
                {translationHeaderExtra}
                {variant === 'review' && reviewConfig?.headerExtra}
                {/* On desktop the panel folds to its own rail, so it needs no
                    button here. On mobile it is a sheet with no rail to reach
                    for, and this icon is the only way in. */}
                {hasPanel && !isZen && panelHidden && (
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
                      ariaLabel="Translation"
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
                      onSelectionChange={(range) => {
                        if (showSelectionToolbar || formattingEnabled) handleSelectionChange(range);
                        translationFormatting.onSelectionChange(range);
                      }}
                      onOpenGuide={onOpenGuide}
                    />
                    {translationFormatting.position && (
                      <FormattingToolbar
                        position={translationFormatting.position}
                        active={translationFormatting.active}
                        containerRef={translationContainerRef}
                        onFormat={translationFormatting.onFormat}
                      />
                    )}
                    {/*
                      `showSelectionToolbar`, not `canCreateSuggestions`: the
                      two toolbars share a position, and `formattingEnabled` is
                      already its negation, so this is what keeps them apart.
                      Until this pane offered formatting, a selection was only
                      ever reported when the suggestion toolbar was the one
                      that wanted it, and the wider gate never showed.
                    */}
                    {toolbarPosition && showSelectionToolbar && (
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
                  {/* The one translation editor on screen while editing, so it
                      is the one the source lines up with (align-lines). */}
                  <RawEditorPane
                    ref={translationEditorRef}
                    ariaLabel="Translation"
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
                        ariaLabel="Translation"
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

        {/* Zen mode is the writing surface, so it carries neither sidebar: the
            shell's own nav is hidden by the overlay, and this panel is simply
            not rendered. Its header row goes with it, which is why zen mode's
            bar shows the save state. */}
        {hasPanel && !isZen && (
          <DocumentPanel
            isZen={isZen}
            targetLanguageMissing={targetLanguageMissing}
            status={panelStatus}
            openSuggestionsCount={openSuggestionsCount}
            onOpenGuide={onOpenGuide}
            onToggleZen={onToggleZen}
            panelActions={panelActions}
            header={sidebarHeader}
            actions={sidebarActions}
            summary={sidebarSummary}
            details={sidebarDetails}
            view={sidebarView}
            onViewChange={setSidebarView}
            threads={{
              show: hasSidebar,
              suggestions,
              currentUserId: currentUserId || '',
              translationContent,
              canCreateSuggestions,
              activeThreadId,
              disableReopen,
              onReply,
              onApply: onApplySuggestion,
              onDismiss: (id) => onDismissSuggestion?.(id),
              onReopen: (id) => onReopenSuggestion?.(id),
              onEdit: onEditSuggestion,
              onSuggestionClick: handleSuggestionClickInternal,
              onCreateGeneralThread,
            }}
          />
        )}

        {/* Mounted once for the whole editor: the lint cards and the panel
            button both open this one dialog. */}
        <MarkdownGuideDialog />
      </>
    );
  },
);
