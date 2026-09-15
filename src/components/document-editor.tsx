'use client';

import { ReactNode, Ref, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { parseFrontmatter } from '@/lib/frontmatter';
import { useState, useMemo } from 'react';
import { ActivityLog } from '@/components/activity-log';
import { DocumentInfoCard } from '@/components/document-info-card';
import { getEditorLanguage } from '@/components/document-form/content-format';
import { EditorDialogs } from '@/components/editor-dialogs';
import { StatusDropdown } from '@/components/status-dropdown';
import { SourceTranslationViewer, SourceTranslationViewerHandle } from '@/components/source-translation-viewer';
import { Badge } from '@/components/ui/badge';
import {
  Stepper,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperStatusIndicator,
  StepperTitle,
  StepperTrigger,
} from '@/components/ui/stepper';
import { DOCUMENT_STATUS_SEQUENCE, getDocumentStatusConfig } from '@/constants/document-status';
import { SuggestionStatus } from '@/generated/prisma/enums';
import { getStatusStep, isDraftPhase, isStepCompleted } from '@/lib/document-status';
import { isAdminClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { EditorProvider, useEditorStore } from '@/lib/stores/editor-provider';
import { useAutoSave } from '@/lib/stores/hooks';
import { buildProjectPath } from '@/domain/source-project/source-project-url';

function getContentWithoutFrontmatter(text: string) {
  try {
    const { content } = parseFrontmatter(text);
    return content;
  } catch {
    return text;
  }
}

// ──────────────────────────────────────────────────────────────
// Header helper — shared breadcrumb + title + lang pair on the left,
// caller-supplied actions on the right
// ──────────────────────────────────────────────────────────────

export function DocumentEditorHeader({
  document,
  actions,
}: {
  document: any;
  actions: ReactNode;
  /** Retired with the panel move; the pane badges carry the language now. */
  sourceLanguageName?: string;
  targetLanguageName?: string;
}) {
  return (
    <div className="border-b bg-background">
      <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {document.sourceProject && (
            <>
              <Link
                href={buildProjectPath(document.sourceProject.identifier)}
                className="shrink-0 truncate text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {document.sourceProject.name}
              </Link>
              <span className="shrink-0 text-muted-foreground/60">/</span>
            </>
          )}
          <h1 className="truncate text-sm font-semibold">{document.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Internal: renders <SourceTranslationViewer> wired to the store
// ──────────────────────────────────────────────────────────────

type CapFn<T = boolean> = T | ((targetVersion: any) => T);

interface ViewerConfig {
  variant: 'review' | 'translate';
  layout?: 'default' | 'zen';
  viewerRef?: Ref<SourceTranslationViewerHandle>;
  sourceVersion: any;
  user: SessionUser;
  canEditSource: CapFn;
  canCreateSuggestions?: CapFn;
  disableReopen?: CapFn;
  reviewConfig?: {
    canEdit: CapFn;
    renderEditActions: (args: { exitEditMode: () => void }) => ReactNode;
  };
  translationPlaceholder?: string;
  translationPreviewEmptyText?: string;
  /** Version id when this document is eligible for audio; enables the Audio text tab. */
  audioTextVersionId?: string | null;
  onEditSuggestion?: (id: string, data: { comment: string; proposedText?: string }) => Promise<void>;
  /** Workflow buttons, shown above the summary rows in the panel. */
  sidebarActions?: ReactNode;
  sidebarSummary?: ReactNode;
  sidebarDetails?: ReactNode;
  sidebarDetailsDefaultOpen?: boolean;
  contentLanguage?: 'markdown' | 'yaml';
}

/** "Just now" / "5m ago" / "2d ago" — as much resolution as a tile can carry. */
function shortAgo(value: unknown): string | null {
  const then = value ? new Date(value as string).getTime() : NaN;
  if (Number.isNaN(then)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  if (minutes < 60 * 24 * 30) return `${Math.round(minutes / (60 * 24))}d ago`;
  return new Date(then).toLocaleDateString();
}

function evalCap<T>(cap: T | ((tv: any) => T), tv: any): T {
  return typeof cap === 'function' ? (cap as (tv: any) => T)(tv) : cap;
}

function EditorViewer({
  variant,
  layout = 'default',
  viewerRef,
  sourceVersion,
  user,
  canEditSource,
  canCreateSuggestions,
  disableReopen,
  reviewConfig,
  translationPlaceholder,
  translationPreviewEmptyText,
  audioTextVersionId,
  onEditSuggestion,
  sidebarActions,
  sidebarSummary,
  sidebarDetails,
  sidebarDetailsDefaultOpen,
  contentLanguage,
}: ViewerConfig) {
  const router = useRouter();
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const content = useEditorStore((s) => s.content);
  const setContent = useEditorStore((s) => s.setContent);
  const suggestions = useEditorStore((s) => s.suggestions);
  const isAnyLoading = useEditorStore((s) => s.isAnyLoading());
  const openSuggestionsCount = useMemo(
    () => suggestions.filter((s) => s.status === SuggestionStatus.OPEN).length,
    [suggestions],
  );
  const wordCount = useMemo(() => (content.trim() ? content.trim().split(/\s+/).length : 0), [content]);
  const sourceEditContent = useEditorStore((s) => s.sourceEditContent);
  const setSourceEditContent = useEditorStore((s) => s.setSourceEditContent);
  const saveSource = useEditorStore((s) => s.saveSource);
  const deleteSource = useEditorStore((s) => s.deleteSource);
  const applySuggestion = useEditorStore((s) => s.applySuggestion);
  const dismissSuggestion = useEditorStore((s) => s.dismissSuggestion);
  const reopenSuggestion = useEditorStore((s) => s.reopenSuggestion);
  const createSuggestion = useEditorStore((s) => s.createSuggestion);
  const createGeneralThread = useEditorStore((s) => s.createGeneralThread);
  const replySuggestion = useEditorStore((s) => s.replySuggestion);
  const isApplyingSuggestion = useEditorStore((s) => s.loading.has('applySuggestion'));
  const isDismissingSuggestion = useEditorStore((s) => s.loading.has('dismissSuggestion'));
  const translationProjectId = useEditorStore((s) => s.translationProjectId);
  const startTranslation = useEditorStore((s) => s.startTranslation);
  const isStartingTranslation = useEditorStore((s) => s.isLoading('startTranslation'));
  const setMarkdownGuideOpen = useEditorStore((s) => s.setMarkdownGuideOpen);
  const handleStatusChange = useEditorStore((s) => s.handleStatusChange);
  const openReviewDialog = useEditorStore((s) => s.openReviewDialog);
  const documentId = useEditorStore((s) => s.documentId);

  const requestedTranslationView = useEditorStore((s) => s.requestedTranslationView);
  const requestTranslationView = useEditorStore((s) => s.requestTranslationView);
  const setAudioTranscriptState = useEditorStore((s) => s.setAudioTranscriptState);
  const openAssignTranslatorDialog = useEditorStore((s) => s.openAssignTranslatorDialog);
  const openAssignReviewerDialog = useEditorStore((s) => s.openAssignReviewerDialog);
  const unassignTranslator = useEditorStore((s) => s.unassignTranslator);
  const unassignReviewer = useEditorStore((s) => s.unassignReviewer);

  const sourceFormattedContent = useMemo(
    () => getContentWithoutFrontmatter(sourceVersion.content),
    [sourceVersion.content],
  );
  const translationFormattedContent = useMemo(() => {
    if (!content) return translationPreviewEmptyText ?? '';
    return getContentWithoutFrontmatter(content);
  }, [content, translationPreviewEmptyText]);

  const resolvedCanEditSource = evalCap(canEditSource, targetVersion);
  const resolvedCanCreateSuggestions =
    canCreateSuggestions !== undefined ? evalCap(canCreateSuggestions, targetVersion) : undefined;
  const resolvedDisableReopen = disableReopen !== undefined ? evalCap(disableReopen, targetVersion) : undefined;
  const resolvedReviewConfig = reviewConfig
    ? { canEdit: evalCap(reviewConfig.canEdit, targetVersion), renderEditActions: reviewConfig.renderEditActions }
    : undefined;

  const handleSourceSave = async () => {
    await saveSource(sourceVersion.id);
    sourceVersion.content = sourceEditContent;
    router.refresh();
  };

  const handleSourceDelete = async () => {
    await deleteSource();
    router.push('/documents');
  };

  return (
    <SourceTranslationViewer
      ref={viewerRef}
      variant={variant}
      layout={layout}
      className="h-full"
      contentLanguage={contentLanguage}
      sourceContent={sourceVersion.content}
      sourceFormattedContent={sourceFormattedContent}
      translationContent={content}
      translationFormattedContent={translationFormattedContent}
      translationPlaceholder={translationPlaceholder}
      translationPreviewEmptyText={translationPreviewEmptyText}
      audioTextVersionId={audioTextVersionId}
      requestedView={requestedTranslationView}
      onRequestedViewShown={() => requestTranslationView(null)}
      onAudioTranscriptStateChange={setAudioTranscriptState}
      onTranslationChange={setContent}
      sourceBadge={<Badge variant="outline">{sourceVersion.language.name}</Badge>}
      translationBadge={<Badge variant="outline">{targetVersion?.language?.name || 'New Translation'}</Badge>}
      translationStarted={!!targetVersion}
      onStartTranslation={startTranslation}
      startingTranslation={isStartingTranslation}
      onOpenGuide={() => setMarkdownGuideOpen(true)}
      canEditSource={resolvedCanEditSource}
      onSourceChange={setSourceEditContent}
      onSourceSave={handleSourceSave}
      onSourceDelete={handleSourceDelete}
      sourceEditContent={sourceEditContent}
      reviewConfig={resolvedReviewConfig}
      suggestions={suggestions}
      canCreateSuggestions={resolvedCanCreateSuggestions}
      currentUserId={user.id}
      onSuggestionClick={() => {}}
      onApplySuggestion={applySuggestion}
      onDismissSuggestion={dismissSuggestion}
      onReopenSuggestion={reopenSuggestion}
      onEditSuggestion={onEditSuggestion}
      onCreateSuggestion={createSuggestion}
      documentVersion={targetVersion?.version ?? 1}
      isApplyingSuggestion={isApplyingSuggestion}
      isDismissingSuggestion={isDismissingSuggestion}
      onReply={replySuggestion}
      onCreateGeneralThread={createGeneralThread}
      disableReopen={resolvedDisableReopen}
      sidebarSummary={
        <>
          {sidebarActions}
          {sidebarSummary}
        </>
      }
      sidebarDetails={sidebarDetails}
      sidebarDetailsDefaultOpen={sidebarDetailsDefaultOpen}
      status={targetVersion?.status}
      sidebarHeader={
        <DocumentInfoCard
          stats={[
            { label: 'Words', value: wordCount.toLocaleString(), hint: 'translated' },
            {
              label: 'Open comments',
              value: openSuggestionsCount,
              hint: openSuggestionsCount === 1 ? 'thread' : 'threads',
            },
            { label: 'Version', value: `v${targetVersion?.version ?? 1}` },
            { label: 'Updated', value: shortAgo(targetVersion?.updatedAt) ?? '—' },
          ]}
          statusControl={
            targetVersion ? (
              // The status is a field of the document, so it lives in the panel
              // beside language, translator and reviewer — not in the toolbar.
              <StatusDropdown
                currentStatus={targetVersion.status}
                versionId={targetVersion.id}
                user={user}
                documentId={documentId}
                disabled={isAnyLoading}
                onStatusChange={handleStatusChange}
                onReviewRequested={openReviewDialog}
                openSuggestionsCount={openSuggestionsCount}
              />
            ) : undefined
          }
          status={targetVersion?.status}
          translator={targetVersion?.user ?? null}
          reviewer={targetVersion?.reviewer}
          language={targetVersion?.language?.name}
          onAssignTranslator={
            isAdminClient(user) && translationProjectId && targetVersion ? openAssignTranslatorDialog : undefined
          }
          onUnassignTranslator={isAdminClient(user) && targetVersion?.user ? unassignTranslator : undefined}
          onAssignReviewer={
            isAdminClient(user) && translationProjectId && targetVersion ? openAssignReviewerDialog : undefined
          }
          onUnassignReviewer={isAdminClient(user) && targetVersion?.reviewer ? unassignReviewer : undefined}
        />
      }
    />
  );
}

// ──────────────────────────────────────────────────────────────
// Internal: collapsible details (stepper + extras + activity log)
// ──────────────────────────────────────────────────────────────

const STATUS_STEPS = DOCUMENT_STATUS_SEQUENCE.map((status, index) => ({
  status,
  step: index + 1,
  config: getDocumentStatusConfig(status),
}));

function EditorDetails({ extraDetails, activityLogs }: { extraDetails?: ReactNode; activityLogs?: any[] }) {
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const logs = activityLogs ?? targetVersion?.activityLogs ?? [];

  return (
    <div className="mt-1 p-4">
      <button
        onClick={() => setDetailsExpanded(!detailsExpanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        {detailsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {detailsExpanded ? 'Hide details' : 'Show details'}
      </button>
      {detailsExpanded && (
        <div className="space-y-4 py-2">
          <Stepper value={getStatusStep(targetVersion?.status ?? null)} orientation="horizontal">
            <StepperNav>
              {STATUS_STEPS.map(({ step, status, config }) => (
                <StepperItem key={status} step={step} completed={isStepCompleted(step, targetVersion?.status ?? null)}>
                  <StepperTrigger disabled>
                    <StepperStatusIndicator status={status} />
                    <StepperTitle className={config.color.textClass}>{config.name}</StepperTitle>
                  </StepperTrigger>
                  {step < STATUS_STEPS.length && <StepperSeparator />}
                </StepperItem>
              ))}
            </StepperNav>
          </Stepper>

          {extraDetails}

          {logs.length > 0 && <ActivityLog entries={logs} />}
        </div>
      )}
    </div>
  );
}

// Tiny helper: enable autosave from inside the provider context
function AutoSaveTrigger({ delayMs }: { delayMs: number }) {
  useAutoSave({ delayMs });
  return null;
}

// Reload suggestions whenever the version id changes (handles new versions
// being created in translate, and ensures review re-syncs across navigations)
function ReloadSuggestionsOnVersionChange() {
  const versionId = useEditorStore((s) => s.targetVersion?.id);
  const reloadSuggestions = useEditorStore((s) => s.reloadSuggestions);
  useEffect(() => {
    reloadSuggestions();
  }, [versionId, reloadSuggestions]);
  return null;
}

// The canonical URL carries no editor verb, so a status change never invalidates
// the address — it invalidates what the server renders at it. Refresh and let the
// page pick the other editor.
function RouteGuardOnStatusChange({ variant }: { variant: 'review' | 'translate' }) {
  const router = useRouter();
  const status = useEditorStore((s) => s.targetVersion?.status);

  useEffect(() => {
    if (!status) return;
    const belongsHere = isDraftPhase(status) ? variant === 'translate' : variant === 'review';
    if (!belongsHere) {
      router.refresh();
    }
  }, [router, variant, status]);

  return null;
}

// ──────────────────────────────────────────────────────────────
// Public component
// ──────────────────────────────────────────────────────────────

interface DocumentEditorProps {
  // Provider data
  document: any;
  sourceVersion: any;
  targetVersion: any | null;
  initialSuggestions?: any[];
  translationProjectId: string | null;
  /** The language this page translates into; used to create the first version. */
  targetLanguageId?: string;

  // User
  user: SessionUser;

  // Header — page-supplied (built with <DocumentEditorHeader /> or fully custom)
  header: ReactNode;

  // Outer container
  fullscreen?: boolean;
  outerClassName?: string;

  // Viewer
  variant: 'review' | 'translate';
  layout?: 'default' | 'zen';
  viewerRef?: Ref<SourceTranslationViewerHandle>;
  translationPlaceholder?: string;
  translationPreviewEmptyText?: string;
  /** Version id when this document is eligible for audio; enables the Audio text tab. */
  audioTextVersionId?: string | null;

  // Capabilities (value or function of live targetVersion from store)
  canEditSource: CapFn;
  canCreateSuggestions?: CapFn;
  disableReopen?: CapFn;
  reviewConfig?: {
    canEdit: CapFn;
    renderEditActions: (args: { exitEditMode: () => void }) => ReactNode;
  };

  // Suggestion handler (review-only edit)
  onEditSuggestion?: (id: string, data: { comment: string; proposedText?: string }) => Promise<void>;

  // Sidebar summary + details (audio, deploy, workflow actions)
  sidebarActions?: ReactNode;
  sidebarSummary?: ReactNode;
  sidebarDetails?: ReactNode;
  sidebarDetailsDefaultOpen?: boolean;

  // Details panel
  extraDetails?: ReactNode;
  activityLogs?: any[];
  hideDetails?: boolean;

  // Translate-only autosave
  autoSaveDelayMs?: number;
}

export function DocumentEditor({
  document,
  sourceVersion,
  targetVersion,
  initialSuggestions = [],
  translationProjectId,
  targetLanguageId,
  user,
  header,
  fullscreen,
  outerClassName,
  variant,
  layout = 'default',
  viewerRef,
  translationPlaceholder,
  translationPreviewEmptyText,
  audioTextVersionId,
  canEditSource,
  canCreateSuggestions,
  disableReopen,
  reviewConfig,
  onEditSuggestion,
  sidebarActions,
  sidebarSummary,
  sidebarDetails,
  sidebarDetailsDefaultOpen,
  extraDetails,
  activityLogs,
  hideDetails,
  autoSaveDelayMs,
}: DocumentEditorProps) {
  // The editor wants to be exactly one viewport tall: header row, then panes
  // filling what is left. Subtracting the shell's own topbar (--header-height)
  // from the viewport is the whole calculation, and it keeps the panes from
  // leaving a dead strip at the bottom the way the hardcoded rem value did.
  const outer =
    outerClassName ??
    (fullscreen
      ? 'fixed inset-0 z-50 flex flex-col bg-workspace'
      : 'flex h-[calc(100svh-var(--header-height,3rem))] min-h-0 flex-col bg-workspace');
  const viewerWrapper = 'flex min-h-0 flex-1 flex-col';
  const contentLanguage = getEditorLanguage(document.originalFilename ?? '');
  // The Audio text tab lives in the tab strip a YAML document does not get, so
  // on one it would be a pane with no way back out. Deciding it once here keeps
  // the tab, the sidebar card's link to it, and the panel itself answering the
  // same question.
  const audioTextTarget = contentLanguage === 'yaml' ? null : (audioTextVersionId ?? null);

  return (
    <EditorProvider
      documentId={document.id}
      documentTitle={document.title}
      sourceLanguageName={sourceVersion.language.name}
      originalFilename={document.originalFilename ?? null}
      targetLanguageId={targetLanguageId ?? ''}
      targetVersion={targetVersion}
      sourceContent={sourceVersion.content}
      initialSuggestions={initialSuggestions}
      translationProjectId={translationProjectId}
      audioTextVersionId={audioTextTarget}
    >
      {autoSaveDelayMs ? <AutoSaveTrigger delayMs={autoSaveDelayMs} /> : null}
      <ReloadSuggestionsOnVersionChange />
      <RouteGuardOnStatusChange variant={variant} />

      <div className={outer}>
        {header}

        <div className={viewerWrapper}>
          <div className="min-h-0 flex-1">
            <EditorViewer
              variant={variant}
              layout={layout}
              viewerRef={viewerRef}
              sourceVersion={sourceVersion}
              user={user}
              canEditSource={canEditSource}
              canCreateSuggestions={canCreateSuggestions}
              disableReopen={disableReopen}
              reviewConfig={reviewConfig}
              translationPlaceholder={translationPlaceholder}
              translationPreviewEmptyText={translationPreviewEmptyText}
              audioTextVersionId={audioTextTarget}
              onEditSuggestion={onEditSuggestion}
              sidebarActions={sidebarActions}
              sidebarSummary={sidebarSummary}
              sidebarDetails={sidebarDetails}
              sidebarDetailsDefaultOpen={sidebarDetailsDefaultOpen}
              contentLanguage={contentLanguage}
            />
          </div>

          {!hideDetails && <EditorDetails extraDetails={extraDetails} activityLogs={activityLogs} />}
        </div>

        <EditorDialogs />
      </div>
    </EditorProvider>
  );
}
