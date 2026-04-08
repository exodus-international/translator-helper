'use client';

import { ActivityLog } from '@/components/activity-log';
import { DocumentInfoCard } from '@/components/document-info-card';
import { EditorDialogs } from '@/components/editor-dialogs';
import { GitHubStatus } from '@/components/github-status';
import { SourceTranslationViewer } from '@/components/source-translation-viewer';
import { StatusDropdown } from '@/components/status-dropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { deployVersionAction, updateDocumentVersionAction } from '@/domain/document-version/document-version.actions';
import { toggleDocumentLabelAction } from '@/domain/document/document.actions';
import { editSuggestionAction } from '@/domain/suggestion/suggestion.actions';
import { getStatusStep, isStepCompleted } from '@/lib/document-status';
import { canReviewClient, isAdminClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { EditorProvider, useEditorStore } from '@/lib/stores/editor-provider';
import { DocumentStatus, SuggestionStatus } from '@prisma/client';
import matter from 'gray-matter';
import { ChevronDown, ChevronRight, Download, FileCheck, FilePlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ReviewClientProps {
  document: any;
  sourceVersion: any;
  targetVersion: any;
  user: SessionUser;
  initialSuggestions?: any[];
}

function getContentWithoutFrontmatter(text: string) {
  try {
    const { content: parsedContent } = matter(text);
    return parsedContent;
  } catch {
    return text;
  }
}

function getDownloadFilename(document: any): string {
  if (document.originalFilename) {
    return document.originalFilename;
  }
  return `${document.slug}.md`;
}

export default function ReviewClient({
  document,
  sourceVersion,
  targetVersion: initialTargetVersion,
  user,
  initialSuggestions = [],
}: ReviewClientProps) {
  // Find assignment and translation project from document
  const assignmentForLanguage = document.assignments?.find(
    (a: any) => a.translationProject?.language?.id === initialTargetVersion.languageId,
  );

  return (
    <EditorProvider
      documentId={document.id}
      targetVersion={initialTargetVersion}
      sourceContent={sourceVersion.content}
      initialSuggestions={initialSuggestions}
      translationProjectId={assignmentForLanguage?.translationProject?.id ?? null}
      assignmentId={assignmentForLanguage?.id ?? null}
    >
      <ReviewInner
        document={document}
        sourceVersion={sourceVersion}
        user={user}
        initialActivityLogs={initialTargetVersion.activityLogs ?? []}
      />
    </EditorProvider>
  );
}

function ReviewInner({
  document,
  sourceVersion,
  user,
  initialActivityLogs,
}: {
  document: any;
  sourceVersion: any;
  user: SessionUser;
  initialActivityLogs: any[];
}) {
  const router = useRouter();

  // ─── Store state ─────────────────────────────────────────
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const content = useEditorStore((s) => s.content);
  const setContent = useEditorStore((s) => s.setContent);
  const suggestions = useEditorStore((s) => s.suggestions);
  const sourceEditContent = useEditorStore((s) => s.sourceEditContent);
  const setSourceEditContent = useEditorStore((s) => s.setSourceEditContent);

  // Store actions
  const saveSource = useEditorStore((s) => s.saveSource);
  const deleteSource = useEditorStore((s) => s.deleteSource);
  const handleStatusChange = useEditorStore((s) => s.handleStatusChange);
  const applySuggestion = useEditorStore((s) => s.applySuggestion);
  const dismissSuggestion = useEditorStore((s) => s.dismissSuggestion);
  const reopenSuggestion = useEditorStore((s) => s.reopenSuggestion);
  const createSuggestion = useEditorStore((s) => s.createSuggestion);
  const createGeneralThread = useEditorStore((s) => s.createGeneralThread);
  const replySuggestion = useEditorStore((s) => s.replySuggestion);
  const reloadSuggestions = useEditorStore((s) => s.reloadSuggestions);
  const openReviewDialog = useEditorStore((s) => s.openReviewDialog);
  const openAssignTranslatorDialog = useEditorStore((s) => s.openAssignTranslatorDialog);
  const openAssignReviewerDialog = useEditorStore((s) => s.openAssignReviewerDialog);
  const unassignTranslator = useEditorStore((s) => s.unassignTranslator);
  const unassignReviewer = useEditorStore((s) => s.unassignReviewer);
  const isAnyLoading = useEditorStore((s) => s.isAnyLoading());
  const translationProjectId = useEditorStore((s) => s.translationProjectId);
  const setTargetVersion = useEditorStore((s) => s.setTargetVersion);
  const isApplyingSuggestion = useEditorStore((s) => s.loading.has('applySuggestion'));
  const isDismissingSuggestion = useEditorStore((s) => s.loading.has('dismissSuggestion'));

  // ─── Local state (review-specific) ──────────────────────
  const [loading, setLoading] = useState(false);
  const [activityLogs, setActivityLogs] = useState(initialActivityLogs);
  const [waitingForFinalLabel, setWaitingForFinalLabel] = useState(
    document.labels?.includes('Waiting for final label') || false,
  );
  const [labelLoading, setLabelLoading] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  // Sync activity logs when server re-renders
  useEffect(() => {
    if (initialActivityLogs) {
      setActivityLogs(initialActivityLogs);
    }
  }, [initialActivityLogs]);

  // Refresh suggestions when the version changes (not on every content change,
  // which would cause focus loss in reply inputs due to list re-rendering)
  useEffect(() => {
    reloadSuggestions();
  }, [targetVersion?.id, reloadSuggestions]);

  // ─── Derived values ─────────────────────────────────────
  const canEditSourceBase = isAdminClient(user);
  const canCreateSuggestionsBase = canReviewClient(user);
  const isApprovedOrLater =
    targetVersion?.status === DocumentStatus.APPROVED || targetVersion?.status === DocumentStatus.DEPLOYED;
  const canEditSource = canEditSourceBase && !isApprovedOrLater;
  const canCreateSuggestions = canCreateSuggestionsBase && !isApprovedOrLater;
  const isPendingReview = targetVersion?.status === 'PENDING_REVIEW';

  const openSuggestionsCount = useMemo(
    () => suggestions.filter((s) => s.status === SuggestionStatus.OPEN).length,
    [suggestions],
  );
  const statusSteps = DOCUMENT_STATUS_SEQUENCE.map((status, index) => ({
    status,
    step: index + 1,
    config: getDocumentStatusConfig(status),
  }));
  const sourceFormattedContent = useMemo(
    () => getContentWithoutFrontmatter(sourceVersion.content),
    [sourceVersion.content],
  );
  const translationFormattedContent = useMemo(() => getContentWithoutFrontmatter(content), [content]);

  // ─── Review-specific handlers ───────────────────────────

  const handleSaveEdit = async () => {
    if (!targetVersion) return false;
    setLoading(true);
    try {
      const updated = await updateDocumentVersionAction(targetVersion.id, { content });
      setTargetVersion(updated);
      toast.success('Changes saved successfully!');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to save changes');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = async () => {
    if (!targetVersion) return;
    setLoading(true);
    try {
      await deployVersionAction(targetVersion.id);
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = getDownloadFilename(document);
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Document deployed and downloaded!');
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Failed to deploy');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    try {
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = getDownloadFilename(document);
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Document downloaded as ' + getDownloadFilename(document));
    } catch (error: any) {
      toast.error('Failed to download document');
    }
  };

  const handleSourceSave = async () => {
    await saveSource(sourceVersion.id);
    sourceVersion.content = sourceEditContent;
    router.refresh();
  };

  const handleSourceDelete = async () => {
    await deleteSource();
    router.push('/documents');
  };

  const handleToggleWaitingForFinalLabel = async () => {
    setLabelLoading(true);
    try {
      const updated = await toggleDocumentLabelAction(document.id, 'Waiting for final label');
      setWaitingForFinalLabel(updated.labels.includes('Waiting for final label'));
      toast.success(
        updated.labels.includes('Waiting for final label')
          ? 'Waiting for final approve label added'
          : 'Waiting for final approve label removed',
      );
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || 'Failed to toggle label');
    } finally {
      setLabelLoading(false);
    }
  };

  const handleEditSuggestion = async (suggestionId: string, data: { comment: string; proposedText?: string }) => {
    try {
      await editSuggestionAction({ suggestionId, comment: data.comment, proposedText: data.proposedText });
      toast.success('Suggestion updated!');
      await reloadSuggestions();
    } catch (error: any) {
      toast.error(error.message || 'Failed to edit suggestion');
    }
  };

  const handleSubmitForReview = async () => {
    await openReviewDialog();
  };

  const reviewEditActions = ({ exitEditMode }: { exitEditMode: () => void }) => (
    <div className="flex gap-2">
      <Button
        onClick={async () => {
          const success = await handleSaveEdit();
          if (success) exitEditMode();
        }}
        disabled={loading || isAnyLoading}
      >
        Save Changes
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          setContent(targetVersion?.content || '');
          exitEditMode();
        }}
      >
        Cancel
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
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
              {sourceVersion.language.name} → {targetVersion?.language.name}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(targetVersion?.status === DocumentStatus.APPROVED ||
              targetVersion?.status === DocumentStatus.DEPLOYED) && (
              <Button variant="default" size="sm" onClick={handleDownload} disabled={loading || isAnyLoading}>
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            )}
            {targetVersion?.status === DocumentStatus.PENDING_REVIEW && (
              <Button
                variant={waitingForFinalLabel ? 'outline' : 'default'}
                size="sm"
                onClick={handleToggleWaitingForFinalLabel}
                disabled={labelLoading}
                className={
                  waitingForFinalLabel
                    ? 'bg-green-700 text-white border-green-200 hover:bg-green-700/80 hover:text-white'
                    : ''
                }
              >
                {waitingForFinalLabel ? <FileCheck className="h-4 w-4" /> : <FilePlus className="h-4 w-4" />}
                {waitingForFinalLabel ? 'Waiting for final approval' : 'Request final approval'}
              </Button>
            )}
            {targetVersion && (
              <StatusDropdown
                currentStatus={targetVersion.status}
                versionId={targetVersion.id}
                user={user}
                documentId={document.id}
                languageId={targetVersion.languageId}
                disabled={loading || isAnyLoading}
                onStatusChange={handleStatusChange}
                onReviewRequested={handleSubmitForReview}
                openSuggestionsCount={openSuggestionsCount}
              />
            )}
          </div>
        </div>
      </div>

      <div className="">
        <div className="h-[calc(100vh-7.5rem)]">
          <SourceTranslationViewer
            variant="review"
            className="h-full"
            sourceContent={sourceVersion.content}
            sourceFormattedContent={sourceFormattedContent}
            translationContent={content}
            translationFormattedContent={translationFormattedContent}
            onTranslationChange={setContent}
            sourceBadge={<Badge variant="secondary">{sourceVersion.language.name}</Badge>}
            translationBadge={<Badge variant="secondary">{targetVersion?.language.name}</Badge>}
            canEditSource={canEditSource}
            onSourceChange={setSourceEditContent}
            onSourceSave={handleSourceSave}
            onSourceDelete={handleSourceDelete}
            sourceEditContent={sourceEditContent}
            reviewConfig={{
              canEdit: isPendingReview,
              renderEditActions: reviewEditActions,
            }}
            suggestions={suggestions}
            canCreateSuggestions={canCreateSuggestions}
            currentUserId={user.id}
            onSuggestionClick={() => {}}
            onApplySuggestion={applySuggestion}
            onDismissSuggestion={dismissSuggestion}
            onReopenSuggestion={reopenSuggestion}
            onEditSuggestion={handleEditSuggestion}
            onCreateSuggestion={createSuggestion}
            documentVersion={targetVersion?.version}
            isApplyingSuggestion={isApplyingSuggestion}
            isDismissingSuggestion={isDismissingSuggestion}
            onReply={replySuggestion}
            onCreateGeneralThread={createGeneralThread}
            disableReopen={isApprovedOrLater}
            sidebarHeader={
              <DocumentInfoCard
                status={targetVersion?.status}
                translator={targetVersion?.user}
                reviewer={targetVersion?.reviewer}
                language={targetVersion?.language?.name}
                onAssignTranslator={
                  isAdminClient(user) && translationProjectId ? openAssignTranslatorDialog : undefined
                }
                onUnassignTranslator={
                  isAdminClient(user) && targetVersion?.user ? unassignTranslator : undefined
                }
                onAssignReviewer={
                  isAdminClient(user) && translationProjectId ? openAssignReviewerDialog : undefined
                }
                onUnassignReviewer={
                  isAdminClient(user) && targetVersion?.reviewer ? unassignReviewer : undefined
                }
              />
            }
          />
        </div>

        {/* Collapsible details section */}
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
              <Stepper value={getStatusStep(targetVersion?.status)} orientation="horizontal">
                <StepperNav>
                  {statusSteps.map(({ step, status, config }) => (
                    <StepperItem key={status} step={step} completed={isStepCompleted(step, targetVersion?.status)}>
                      <StepperTrigger disabled>
                        <StepperStatusIndicator status={status} />
                        <StepperTitle className={config.color.textClass}>{config.name}</StepperTitle>
                      </StepperTrigger>
                      {step < statusSteps.length && <StepperSeparator />}
                    </StepperItem>
                  ))}
                </StepperNav>
              </Stepper>

              {targetVersion && (
                <GitHubStatus
                  documentVersionId={targetVersion.id}
                  isDeployed={targetVersion.status === DocumentStatus.DEPLOYED}
                />
              )}

              {activityLogs && activityLogs.length > 0 && <ActivityLog entries={activityLogs} />}
            </div>
          )}
        </div>
      </div>

      <EditorDialogs />
    </div>
  );
}
