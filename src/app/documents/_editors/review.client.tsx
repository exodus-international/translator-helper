'use client';

import { ActivityLog } from '@/components/activity-log';
import { AiWorkflowPanel } from '@/components/ai-workflow-panel';
import { cn } from '@/lib/utils';
import { AudioStatus } from '@/components/audio-status';
import { GitHubStatus } from '@/components/github-status';
import { Button } from '@/components/ui/button';
import { DocumentEditor } from '@/components/document-editor';
import { MarkdownGuide } from '@/components/markdown-guide';
import { SaveControl } from '@/components/save-control';
import { toggleDocumentLabelAction } from '@/domain/document/document.actions';
import { editSuggestionAction } from '@/domain/suggestion/suggestion.actions';
import { canEditAiText } from '@/domain/ai-workflow/ai-workflow.rules';
import { capture } from '@/lib/analytics';
import { isRefusal } from '@/lib/action-refusal';
import { useActiveLanguage, useAnalyticsProjectGroup } from '@/components/analytics-project-group';
import { ScriptureProvider } from '@/components/editor/scripture-context';
import type { SourceTranslationViewerHandle } from '@/components/source-translation-viewer';
import { canReviewClient, isAdminClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { useEditorStore } from '@/lib/stores/editor-provider';
import { useAutoSave } from '@/lib/stores/hooks';
import { DocumentStatus, TranslationWorkflow } from '@/generated/prisma/enums';
import { Download, Eye, FileCheck, FilePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

interface ReviewClientProps {
  document: any;
  sourceVersion: any;
  targetVersion: any;
  targetLanguage?: { code: string; name: string } | null;
  translationProjectId?: string | null;
  user: SessionUser;
  /** Resolved on the server against this version's language. */
  canDeploy: boolean;
  /** On this language's team, or an administrator. */
  canChangeStatus: boolean;
  /** Set when this document gets audio; enables the Audio text tab. */
  audioTextVersionId?: string | null;
  initialSuggestions?: any[];
}

const isApprovedOrLater = (tv: any) => tv?.status === DocumentStatus.APPROVED || tv?.status === DocumentStatus.DEPLOYED;

function getDownloadFilename(document: any): string {
  return document.originalFilename || `${document.slug}.md`;
}

export default function ReviewClient({
  document,
  sourceVersion,
  targetVersion: initialTargetVersion,
  targetLanguage,
  translationProjectId = null,
  user,
  canDeploy,
  canChangeStatus,
  audioTextVersionId = null,
  initialSuggestions = [],
}: ReviewClientProps) {
  useAnalyticsProjectGroup(document?.sourceProject?.id, document?.sourceProject?.name);
  useActiveLanguage(targetLanguage?.code, targetLanguage?.name);
  const viewerRef = useRef<SourceTranslationViewerHandle>(null);
  const showTranslationEditor = useCallback(() => viewerRef.current?.enterTranslationEditMode(), []);

  // Reviewers check Scripture too; only a review they can edit lets the panel change the text.
  // This is the status the page opened with; the editor keeps it current as the status changes.
  return (
    <ScriptureProvider
      languageCode={targetLanguage?.code}
      languageName={targetLanguage?.name}
      sourceContent={sourceVersion?.content ?? ''}
      editable={initialTargetVersion.status === DocumentStatus.PENDING_REVIEW}
      requestEditor={showTranslationEditor}
    >
      <DocumentEditor
        viewerRef={viewerRef}
        document={document}
        sourceVersion={sourceVersion}
        targetVersion={initialTargetVersion}
        initialSuggestions={initialSuggestions}
        translationProjectId={translationProjectId}
        targetLanguageId={initialTargetVersion.languageId ?? ''}
        user={user}
        canDeploy={canDeploy}
        canChangeStatus={canChangeStatus}
        audioTextVersionId={audioTextVersionId}
        variant="review"
        targetLanguageName={targetLanguage?.name ?? null}
        canEditSource={(tv) => isAdminClient(user) && !isApprovedOrLater(tv)}
        canCreateSuggestions={(tv) => canReviewClient(user) && !isApprovedOrLater(tv)}
        disableReopen={(tv) => isApprovedOrLater(tv)}
        reviewConfig={{
          // A manual version belongs to its translator: reviewers change it
          // through suggestions, and its text only through the Scripture check.
          // An AI version has no translator: anyone on the team may edit it
          // while it is in review, and the activity log keeps each edit's diff.
          canEdit: (tv) =>
            tv?.workflow === TranslationWorkflow.AI
              ? canChangeStatus && canEditAiText(tv.status)
              : tv?.status === DocumentStatus.PENDING_REVIEW,
          showEditButton: (tv) => tv?.workflow === TranslationWorkflow.AI,
          renderEditActions: ({ exitEditMode }) => <ReviewEditActions exitEditMode={exitEditMode} />,
        }}
        onEditSuggestion={async (suggestionId, data) => {
          try {
            const result = await editSuggestionAction({ suggestionId, comment: data.comment, proposedText: data.proposedText });
            if (isRefusal(result)) {
              toast.error(result.refused.message);
              return;
            }
            capture('suggestion_edited');
            toast.success('Suggestion updated!');
          } catch (error: any) {
            toast.error(error.message || 'Failed to edit suggestion');
          }
        }}
        hideDetails
        sidebarActions={
          <>
            <AiWorkflowPanel
              user={user}
              canManage={canDeploy}
              canReview={canChangeStatus}
              hasAudio={Boolean(audioTextVersionId)}
            />
            <ReviewWorkflowActions document={document} />
          </>
        }
        sidebarSummary={
          <>
            <AudioStatus
              documentVersionId={initialTargetVersion.id}
              currentVersion={initialTargetVersion.version}
              status={initialTargetVersion.status}
              compact
            />
            <GitHubStatus
              documentVersionId={initialTargetVersion.id}
              isDeployed={initialTargetVersion.status === DocumentStatus.DEPLOYED}
              compact
            />
          </>
        }
        sidebarDetails={
          <>
            <AudioStatus
              documentVersionId={initialTargetVersion.id}
              currentVersion={initialTargetVersion.version}
              status={initialTargetVersion.status}
              frame="section"
            />
            <GitHubStatus
              documentVersionId={initialTargetVersion.id}
              isDeployed={initialTargetVersion.status === DocumentStatus.DEPLOYED}
              frame="section"
            />
            {(initialTargetVersion.activityLogs?.length ?? 0) > 0 && (
              <ActivityLog entries={initialTargetVersion.activityLogs} frame="section" />
            )}
          </>
        }
        sidebarDetailsDefaultOpen={initialTargetVersion.status === DocumentStatus.DEPLOYED}
      />
    </ScriptureProvider>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Review workflow — rendered by the editor inside the Document info panel,
// under the status field it moves.
// ──────────────────────────────────────────────────────────────────────

function ReviewWorkflowActions({ document }: { document: any }) {
  const router = useRouter();
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const content = useEditorStore((s) => s.content);
  const isAnyLoading = useEditorStore((s) => s.isAnyLoading());

  const [labelLoading, setLabelLoading] = useState(false);
  const [waitingForFinalLabel, setWaitingForFinalLabel] = useState(
    document.labels?.includes('Waiting for final label') || false,
  );

  const handleDownload = () => {
    try {
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = getDownloadFilename(document);
      a.click();
      URL.revokeObjectURL(url);
      capture('document_downloaded', { status: targetVersion?.status });
      toast.success('Document downloaded as ' + getDownloadFilename(document));
    } catch {
      toast.error('Failed to download document');
    }
  };

  const handleToggleWaitingForFinalLabel = async () => {
    setLabelLoading(true);
    try {
      const updated = await toggleDocumentLabelAction(document.id, 'Waiting for final label');
      const isOn = updated.labels.includes('Waiting for final label');
      setWaitingForFinalLabel(isOn);
      capture('document_label_toggled', { label: 'waiting_for_final' });
      toast.success(isOn ? 'Waiting for final approve label added' : 'Waiting for final approve label removed');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || 'Failed to toggle label');
    } finally {
      setLabelLoading(false);
    }
  };

  return (
    // A row of the panel's summary card, which draws the border and the padding.
    <div className="flex flex-col gap-2">
      {targetVersion?.status === DocumentStatus.PENDING_REVIEW && targetVersion?.workflow !== TranslationWorkflow.AI && (
        <Button
          size="sm"
          onClick={handleToggleWaitingForFinalLabel}
          disabled={labelLoading}
          // Not the outline variant: its dark:bg-input and dark:border-input
          // outrank an unprefixed bg-success, which left dark text on a dark
          // button in the dark theme.
          className={cn('max-md:h-11', waitingForFinalLabel && 'bg-success text-background hover:bg-success/90')}
        >
          {waitingForFinalLabel ? <FileCheck /> : <FilePlus />}
          {waitingForFinalLabel ? 'Waiting for final approval' : 'Request final approval'}
        </Button>
      )}
      {(targetVersion?.status === DocumentStatus.APPROVED || targetVersion?.status === DocumentStatus.DEPLOYED) && (
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start max-md:h-11"
          onClick={handleDownload}
          disabled={isAnyLoading}
        >
          <Download />
          Download
        </Button>
      )}
      <MarkdownGuide variant="button" />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Editing an AI draft in review: autosave, like the translate editor, and a
// way back to the review view
// ──────────────────────────────────────────────────────────────────────

function ReviewEditActions({ exitEditMode }: { exitEditMode: () => void }) {
  const router = useRouter();
  const saveContent = useEditorStore((s) => s.saveContent);
  const saveStatus = useEditorStore((s) => s.saveStatus());
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const isAnyLoading = useEditorStore((s) => s.isAnyLoading());
  const [loading, setLoading] = useState(false);
  useAutoSave({ delayMs: 3000 });

  const save = async () => {
    setLoading(true);
    try {
      await saveContent();
      return true;
    } catch {
      // The store has already toasted it; the control shows the failed state.
      return false;
    } finally {
      setLoading(false);
    }
  };

  const backToReview = async () => {
    // Write what autosave has not reached yet, so leaving the editor never
    // drops an edit. A failed save keeps the editor open.
    if (!(await save())) return;
    exitEditMode();
    // Brings in the activity log entry the saves wrote.
    router.refresh();
  };

  return (
    <>
      <SaveControl status={saveStatus} lastSavedAt={lastSavedAt} onSave={save} disabled={loading || isAnyLoading} />
      <Button variant="outline" size="sm" onClick={backToReview} disabled={loading || isAnyLoading}>
        <Eye />
        Back to review
      </Button>
    </>
  );
}
