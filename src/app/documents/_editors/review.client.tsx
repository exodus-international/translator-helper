'use client';

import { ActivityLog } from '@/components/activity-log';
import { AudioStatus } from '@/components/audio-status';
import { GitHubStatus } from '@/components/github-status';
import { StatusDropdown } from '@/components/status-dropdown';
import { Button } from '@/components/ui/button';
import { DocumentEditor, DocumentEditorHeader } from '@/components/document-editor';
import { updateDocumentVersionAction } from '@/domain/document-version/document-version.actions';
import { toggleDocumentLabelAction } from '@/domain/document/document.actions';
import { editSuggestionAction } from '@/domain/suggestion/suggestion.actions';
import { capture } from '@/lib/analytics';
import { useActiveLanguage, useAnalyticsProjectGroup } from '@/components/analytics-project-group';
import { canReviewClient, isAdminClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { useEditorStore } from '@/lib/stores/editor-provider';
import { DocumentStatus, SuggestionStatus } from '@/generated/prisma/enums';
import { Download, FileCheck, FilePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ReviewClientProps {
  document: any;
  sourceVersion: any;
  targetVersion: any;
  targetLanguage?: { code: string; name: string } | null;
  translationProjectId?: string | null;
  user: SessionUser;
  initialSuggestions?: any[];
}

const isApprovedOrLater = (tv: any) =>
  tv?.status === DocumentStatus.APPROVED || tv?.status === DocumentStatus.DEPLOYED;

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
  initialSuggestions = [],
}: ReviewClientProps) {
  useAnalyticsProjectGroup(document?.sourceProject?.id, document?.sourceProject?.name);
  useActiveLanguage(targetLanguage?.code, targetLanguage?.name);

  return (
    <DocumentEditor
      document={document}
      sourceVersion={sourceVersion}
      targetVersion={initialTargetVersion}
      initialSuggestions={initialSuggestions}
      translationProjectId={translationProjectId}
      user={user}
      variant="review"
      header={<ReviewToolbar document={document} sourceVersion={sourceVersion} user={user} />}
      canEditSource={(tv) => isAdminClient(user) && !isApprovedOrLater(tv)}
      canCreateSuggestions={(tv) => canReviewClient(user) && !isApprovedOrLater(tv)}
      disableReopen={(tv) => isApprovedOrLater(tv)}
      reviewConfig={{
        canEdit: (tv) => tv?.status === DocumentStatus.PENDING_REVIEW,
        renderEditActions: ({ exitEditMode }) => <ReviewEditActions exitEditMode={exitEditMode} />,
      }}
      onEditSuggestion={async (suggestionId, data) => {
        try {
          await editSuggestionAction({ suggestionId, comment: data.comment, proposedText: data.proposedText });
          capture('suggestion_edited');
          toast.success('Suggestion updated!');
        } catch (error: any) {
          toast.error(error.message || 'Failed to edit suggestion');
        }
      }}
      hideDetails
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
  );
}

// ──────────────────────────────────────────────────────────────────────
// Toolbar — runs inside <EditorProvider>, drives store-aware buttons
// ──────────────────────────────────────────────────────────────────────

function ReviewToolbar({ document, sourceVersion, user }: { document: any; sourceVersion: any; user: SessionUser }) {
  const router = useRouter();
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const content = useEditorStore((s) => s.content);
  const suggestions = useEditorStore((s) => s.suggestions);
  const handleStatusChange = useEditorStore((s) => s.handleStatusChange);
  const openReviewDialog = useEditorStore((s) => s.openReviewDialog);
  const isAnyLoading = useEditorStore((s) => s.isAnyLoading());

  const [labelLoading, setLabelLoading] = useState(false);
  const [waitingForFinalLabel, setWaitingForFinalLabel] = useState(
    document.labels?.includes('Waiting for final label') || false,
  );

  const openSuggestionsCount = useMemo(
    () => suggestions.filter((s) => s.status === SuggestionStatus.OPEN).length,
    [suggestions],
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

  // Header actions, ordered by workflow: status → contextual actions → passive.
  const actions = (
    <>
      {targetVersion && (
        <StatusDropdown
          currentStatus={targetVersion.status}
          versionId={targetVersion.id}
          user={user}
          documentId={document.id}
          disabled={isAnyLoading}
          onStatusChange={handleStatusChange}
          onReviewRequested={openReviewDialog}
          openSuggestionsCount={openSuggestionsCount}
        />
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
          {waitingForFinalLabel ? <FileCheck /> : <FilePlus />}
          {waitingForFinalLabel ? 'Waiting for final approval' : 'Request final approval'}
        </Button>
      )}
      {(targetVersion?.status === DocumentStatus.APPROVED || targetVersion?.status === DocumentStatus.DEPLOYED) && (
        <Button variant="default" size="sm" onClick={handleDownload} disabled={isAnyLoading}>
          <Download />
          Download
        </Button>
      )}
    </>
  );

  return (
    <DocumentEditorHeader
      document={document}
      sourceLanguageName={sourceVersion.language.name}
      targetLanguageName={targetVersion?.language?.name ?? ''}
      actions={actions}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────
// Save/Cancel buttons rendered when in-place editing in PENDING_REVIEW
// ──────────────────────────────────────────────────────────────────────

function ReviewEditActions({ exitEditMode }: { exitEditMode: () => void }) {
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const content = useEditorStore((s) => s.content);
  const setContent = useEditorStore((s) => s.setContent);
  const setTargetVersion = useEditorStore((s) => s.setTargetVersion);
  const isAnyLoading = useEditorStore((s) => s.isAnyLoading());
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!targetVersion) return;
    setLoading(true);
    try {
      const updated = await updateDocumentVersionAction(targetVersion.id, { content });
      setTargetVersion(updated);
      capture('translation_saved', { context: 'review_edit' });
      toast.success('Changes saved successfully!');
      exitEditMode();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save changes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button onClick={handleSave} disabled={loading || isAnyLoading}>
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
}
