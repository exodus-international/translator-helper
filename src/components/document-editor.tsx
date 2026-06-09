'use client';

import { ReactNode, Ref, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import matter from 'gray-matter';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import { ActivityLog } from '@/components/activity-log';
import { DocumentInfoCard } from '@/components/document-info-card';
import { getEditorLanguage } from '@/components/document-form/content-format';
import { EditorDialogs } from '@/components/editor-dialogs';
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
import { getCanonicalEditorPath, getStatusStep, isStepCompleted } from '@/lib/document-status';
import { isAdminClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { EditorProvider, useEditorStore } from '@/lib/stores/editor-provider';
import { useAutoSave } from '@/lib/stores/hooks';

function getContentWithoutFrontmatter(text: string) {
  try {
    const { content } = matter(text);
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
  sourceLanguageName,
  targetLanguageName,
  actions,
}: {
  document: any;
  sourceLanguageName: string;
  targetLanguageName: string;
  actions: ReactNode;
}) {
  return (
    <div className="border-b bg-white">
      <div className="px-3 py-1.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {document.sourceProject && (
            <>
              <Link
                href={`/projects/${document.sourceProject.id}`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate shrink-0"
              >
                {document.sourceProject.name}
              </Link>
              <span className="text-muted-foreground">/</span>
            </>
          )}
          <h1 className="text-sm font-semibold truncate">{document.title}</h1>
          <span className="text-xs text-gray-500 shrink-0">
            {sourceLanguageName} → {targetLanguageName}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
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
  onEditSuggestion?: (id: string, data: { comment: string; proposedText?: string }) => Promise<void>;
  contentLanguage?: 'markdown' | 'yaml';
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
  onEditSuggestion,
  contentLanguage,
}: ViewerConfig) {
  const router = useRouter();
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const content = useEditorStore((s) => s.content);
  const setContent = useEditorStore((s) => s.setContent);
  const suggestions = useEditorStore((s) => s.suggestions);
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
  const resolvedCanCreateSuggestions = canCreateSuggestions !== undefined
    ? evalCap(canCreateSuggestions, targetVersion)
    : undefined;
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
      onTranslationChange={setContent}
      sourceBadge={<Badge variant="secondary">{sourceVersion.language.name}</Badge>}
      translationBadge={<Badge variant="secondary">{targetVersion?.language?.name || 'New Translation'}</Badge>}
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
      sidebarHeader={
        <DocumentInfoCard
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

// Route guard: when the live status drifts out of the current page's responsibility,
// replace the URL to the canonical editor path. Server-side guards in page.tsx prevent
// the wrong-page-on-load flash; this handles in-page status transitions.
function RouteGuardOnStatusChange({
  documentId,
  variant,
}: {
  documentId: string;
  variant: 'review' | 'translate';
}) {
  const router = useRouter();
  const status = useEditorStore((s) => s.targetVersion?.status);
  const versionId = useEditorStore((s) => s.targetVersion?.id);
  const languageId = useEditorStore((s) => s.targetVersion?.languageId);

  useEffect(() => {
    if (!status) return;
    const canonical = getCanonicalEditorPath(documentId, status, { versionId, lang: languageId });
    if (!canonical.startsWith(`/documents/${documentId}/${variant}`)) {
      router.replace(canonical);
    }
  }, [router, documentId, variant, status, versionId, languageId]);

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
  assignmentId: string | null;

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
  assignmentId,
  user,
  header,
  fullscreen,
  outerClassName,
  variant,
  layout = 'default',
  viewerRef,
  translationPlaceholder,
  translationPreviewEmptyText,
  canEditSource,
  canCreateSuggestions,
  disableReopen,
  reviewConfig,
  onEditSuggestion,
  extraDetails,
  activityLogs,
  hideDetails,
  autoSaveDelayMs,
}: DocumentEditorProps) {
  const outer = outerClassName ?? (fullscreen ? 'fixed inset-0 bg-white z-50' : 'min-h-screen bg-gray-50');
  const viewerHeight = fullscreen ? 'h-full' : 'h-[calc(100vh-7.5rem)]';
  const viewerWrapper = fullscreen ? 'h-[calc(100vh-3.5rem)] p-4' : 'border-0';
  const contentLanguage = getEditorLanguage(document.originalFilename ?? '');

  return (
    <EditorProvider
      documentId={document.id}
      targetVersion={targetVersion}
      sourceContent={sourceVersion.content}
      initialSuggestions={initialSuggestions}
      translationProjectId={translationProjectId}
      assignmentId={assignmentId}
    >
      {autoSaveDelayMs ? <AutoSaveTrigger delayMs={autoSaveDelayMs} /> : null}
      <ReloadSuggestionsOnVersionChange />
      <RouteGuardOnStatusChange documentId={document.id} variant={variant} />

      <div className={outer}>
        {header}

        <div className={viewerWrapper}>
          <div className={viewerHeight}>
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
              onEditSuggestion={onEditSuggestion}
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
