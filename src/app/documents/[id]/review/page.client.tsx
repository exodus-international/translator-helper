'use client';

import { ActivityLog } from '@/components/activity-log';
import { GitHubStatus } from '@/components/github-status';
import { SuggestionWithUser } from '@/components/monaco-suggestion-decorations';
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
import {
  deployVersionAction,
  reviewVersionAction,
  updateDocumentVersionAction,
} from '@/domain/document-version/document-version.actions';
import { deleteDocumentAction, toggleDocumentLabelAction } from '@/domain/document/document.actions';
import {
  applySuggestionAction,
  createSuggestionAction,
  createSuggestionReplyAction,
  dismissSuggestionAction,
  editSuggestionAction,
  getSuggestionsByDocumentVersionAction,
  reopenSuggestionAction,
} from '@/domain/suggestion/suggestion.actions';
import { getStatusStep, isStepCompleted } from '@/lib/document-status';
import { canReviewClient, isDeployerClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { DocumentStatus, SuggestionType } from '@prisma/client';
import matter from 'gray-matter';
import { ChevronDown, ChevronRight, Download, FileCheck, FilePlus } from 'lucide-react';
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
  // If originalFilename exists, use it as-is for all languages
  if (document.originalFilename) {
    return document.originalFilename;
  }
  // Fallback to current format if no originalFilename
  return `${document.slug}.md`;
}

export default function ReviewClient({
  document,
  sourceVersion,
  targetVersion: initialTargetVersion,
  user,
  initialSuggestions = [],
}: ReviewClientProps) {
  const router = useRouter();
  const [targetVersion, setTargetVersion] = useState(initialTargetVersion);
  const [content, setContent] = useState(initialTargetVersion.content);
  const [activityLogs, setActivityLogs] = useState(initialTargetVersion.activityLogs ?? []);
  const [loading, setLoading] = useState(false);
  const [sourceEditContent, setSourceEditContent] = useState(sourceVersion.content);
  const [sourceSaving, setSourceSaving] = useState(false);
  const [waitingForFinalLabel, setWaitingForFinalLabel] = useState(
    document.labels?.includes('Waiting for final label') || false,
  );
  const [labelLoading, setLabelLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionWithUser[]>(
    initialSuggestions.map((s: any) => ({
      ...s,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      replies: (s.replies || []).map((r: any) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      })),
    })) as SuggestionWithUser[],
  );
  const [isApplyingSuggestion, setIsApplyingSuggestion] = useState(false);
  const [isDismissingSuggestion, setIsDismissingSuggestion] = useState(false);

  // Check if user can edit source (deployer only)
  const canEditSource = isDeployerClient(user);
  // Check if user can create suggestions (reviewers)
  const canCreateSuggestions = canReviewClient(user);
  const sourceFormattedContent = useMemo(
    () => getContentWithoutFrontmatter(sourceVersion.content),
    [sourceVersion.content],
  );
  const translationFormattedContent = useMemo(() => getContentWithoutFrontmatter(content), [content]);

  // Sync activity logs when server re-renders with new data
  useEffect(() => {
    if (initialTargetVersion.activityLogs) {
      setActivityLogs(initialTargetVersion.activityLogs);
    }
  }, [initialTargetVersion.activityLogs]);

  // Refresh suggestions when content changes
  useEffect(() => {
    const loadSuggestions = async () => {
      try {
        const updatedSuggestions = await getSuggestionsByDocumentVersionAction(targetVersion.id);
        // Convert Date to string for createdAt
        const formattedSuggestions = updatedSuggestions.map((s: any) => ({
          ...s,
          createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
          replies: (s.replies || []).map((r: any) => ({
            ...r,
            createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
          })),
        }));
        setSuggestions(formattedSuggestions as SuggestionWithUser[]);
      } catch (error) {
        console.error('Error loading suggestions:', error);
      }
    };
    loadSuggestions();
  }, [targetVersion.id, content]);

  const canDeploy = targetVersion.status === 'APPROVED';
  const isPendingReview = targetVersion.status === 'PENDING_REVIEW';
  const statusSteps = DOCUMENT_STATUS_SEQUENCE.map((status, index) => ({
    status,
    step: index + 1,
    config: getDocumentStatusConfig(status),
  }));

  const handleStatusChange = (status: DocumentStatus) => {
    setTargetVersion((prev: any) => (prev ? { ...prev, status } : prev));
  };

  const handleSaveEdit = async () => {
    setLoading(true);
    try {
      const updated = await updateDocumentVersionAction(targetVersion.id, {
        content,
      });
      setTargetVersion(updated);
      toast.success('Changes saved successfully!');
      return true;
    } catch (error: any) {
      console.error('Error saving changes:', error);
      toast.error(error.message || 'Failed to save changes');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = async () => {
    setLoading(true);
    try {
      console.log('[Deploy] handleDeploy called with targetVersion.id:', targetVersion.id);
      await deployVersionAction(targetVersion.id);

      // Trigger download
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
      console.error('Error deploying:', error);
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
      console.error('Error downloading:', error);
      toast.error('Failed to download document');
    }
  };

  const handleSourceChange = (value: string) => {
    setSourceEditContent(value);
  };

  const handleSourceSave = async () => {
    setSourceSaving(true);
    try {
      const updated = await updateDocumentVersionAction(sourceVersion.id, {
        content: sourceEditContent,
      });
      // Update the source version in the component
      sourceVersion.content = updated.content;
      sourceVersion.status = updated.status;
      toast.success('Source document saved successfully!');
      router.refresh();
    } catch (error: any) {
      console.error('Error saving source:', error);
      toast.error(error.message || 'Failed to save source document');
    } finally {
      setSourceSaving(false);
    }
  };

  const handleSourceDelete = async () => {
    try {
      // Delete the entire document, which will cascade delete all versions
      await deleteDocumentAction(document.id);
      toast.success('Document deleted successfully!');
      router.push('/documents');
    } catch (error: any) {
      console.error('Error deleting document:', error);
      toast.error(error.message || 'Failed to delete document');
    }
  };

  const handleSourceDeleteConfirm = async () => {
    await handleSourceDelete();
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
      console.error('Error toggling label:', error);
      toast.error(error.message || 'Failed to toggle label');
    } finally {
      setLabelLoading(false);
    }
  };

  const handleCreateSuggestion = async (data: {
    comment: string;
    proposedText?: string;
    type: SuggestionType;
    range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
    version: number;
  }) => {
    setLoading(true);
    try {
      await createSuggestionAction({
        documentVersionId: targetVersion.id,
        startLine: data.range.startLine,
        startColumn: data.range.startColumn,
        endLine: data.range.endLine,
        endColumn: data.range.endColumn,
        type: data.type,
        comment: data.comment,
        proposedText: data.proposedText,
        version: data.version,
      });
      toast.success('Suggestion created!');
      // Reload suggestions
      const updatedSuggestions = await getSuggestionsByDocumentVersionAction(targetVersion.id);
      const formattedSuggestions = updatedSuggestions.map((s: any) => ({
        ...s,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      }));
      setSuggestions(formattedSuggestions as SuggestionWithUser[]);
    } catch (error: any) {
      console.error('Error creating suggestion:', error);
      toast.error(error.message || 'Failed to create suggestion');
    } finally {
      setLoading(false);
    }
  };

  const handleApplySuggestion = async (suggestionId: string) => {
    setIsApplyingSuggestion(true);
    try {
      const updatedVersion = await applySuggestionAction({ suggestionId });
      setTargetVersion(updatedVersion);
      setContent(updatedVersion.content);
      toast.success('Suggestion applied!');
      // Reload suggestions
      const updatedSuggestions = await getSuggestionsByDocumentVersionAction(targetVersion.id);
      const formattedSuggestions = updatedSuggestions.map((s: any) => ({
        ...s,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      }));
      setSuggestions(formattedSuggestions as SuggestionWithUser[]);
    } catch (error: any) {
      console.error('Error applying suggestion:', error);
      toast.error(error.message || 'Failed to apply suggestion');
    } finally {
      setIsApplyingSuggestion(false);
    }
  };

  const handleDismissSuggestion = async (suggestionId: string, reason?: string) => {
    setIsDismissingSuggestion(true);
    try {
      await dismissSuggestionAction({ suggestionId, dismissedReason: reason });
      toast.success('Suggestion dismissed!');
      // Reload suggestions
      const updatedSuggestions = await getSuggestionsByDocumentVersionAction(targetVersion.id);
      const formattedSuggestions = updatedSuggestions.map((s: any) => ({
        ...s,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      }));
      setSuggestions(formattedSuggestions as SuggestionWithUser[]);
    } catch (error: any) {
      console.error('Error dismissing suggestion:', error);
      toast.error(error.message || 'Failed to dismiss suggestion');
    } finally {
      setIsDismissingSuggestion(false);
    }
  };

  const handleReopenSuggestion = async (suggestionId: string) => {
    try {
      const result = await reopenSuggestionAction({ suggestionId });
      if (result.updatedVersion) {
        setContent(result.updatedVersion.content);
        setTargetVersion(result.updatedVersion);
      }
      toast.success('Suggestion reopened!');
      // Reload suggestions
      const updatedSuggestions = await getSuggestionsByDocumentVersionAction(targetVersion.id);
      const formattedSuggestions = updatedSuggestions.map((s: any) => ({
        ...s,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
        replies: (s.replies || []).map((r: any) => ({
          ...r,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        })),
      }));
      setSuggestions(formattedSuggestions as SuggestionWithUser[]);
    } catch (error: any) {
      console.error('Error reopening suggestion:', error);
      toast.error(error.message || 'Failed to reopen suggestion');
    }
  };

  const handleEditSuggestion = async (suggestionId: string, data: { comment: string; proposedText?: string }) => {
    try {
      await editSuggestionAction({ suggestionId, comment: data.comment, proposedText: data.proposedText });
      toast.success('Suggestion updated!');
      const updatedSuggestions = await getSuggestionsByDocumentVersionAction(targetVersion.id);
      const formattedSuggestions = updatedSuggestions.map((s: any) => ({
        ...s,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
        replies: (s.replies || []).map((r: any) => ({
          ...r,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        })),
      }));
      setSuggestions(formattedSuggestions as SuggestionWithUser[]);
    } catch (error: any) {
      console.error('Error editing suggestion:', error);
      toast.error(error.message || 'Failed to edit suggestion');
    }
  };

  const handleReply = async (suggestionId: string, replyContent: string) => {
    try {
      await createSuggestionReplyAction({ suggestionId, content: replyContent });
      // Reload suggestions
      const updatedSuggestions = await getSuggestionsByDocumentVersionAction(targetVersion.id);
      const formattedSuggestions = updatedSuggestions.map((s: any) => ({
        ...s,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
        replies: (s.replies || []).map((r: any) => ({
          ...r,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        })),
      }));
      setSuggestions(formattedSuggestions as SuggestionWithUser[]);
    } catch (error: any) {
      console.error('Error replying:', error);
      toast.error(error.message || 'Failed to post reply');
    }
  };

  const handleCreateGeneralThread = async (generalComment: string) => {
    try {
      await createSuggestionAction({
        documentVersionId: targetVersion.id,
        startLine: null,
        startColumn: null,
        endLine: null,
        endColumn: null,
        type: 'COMMENT' as SuggestionType,
        comment: generalComment,
        version: targetVersion.version ?? 1,
      });
      toast.success('Comment added!');
      // Reload suggestions
      const updatedSuggestions = await getSuggestionsByDocumentVersionAction(targetVersion.id);
      const formattedSuggestions = updatedSuggestions.map((s: any) => ({
        ...s,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
        replies: (s.replies || []).map((r: any) => ({
          ...r,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        })),
      }));
      setSuggestions(formattedSuggestions as SuggestionWithUser[]);
    } catch (error: any) {
      console.error('Error creating general thread:', error);
      toast.error(error.message || 'Failed to create comment');
    }
  };

  const reviewEditActions = ({ exitEditMode }: { exitEditMode: () => void }) => (
    <div className="flex gap-2">
      <Button
        onClick={async () => {
          const success = await handleSaveEdit();
          if (success) {
            exitEditMode();
          }
        }}
        disabled={loading}
      >
        Save Changes
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          setContent(targetVersion.content);
          exitEditMode();
        }}
      >
        Cancel
      </Button>
    </div>
  );

  const [detailsExpanded, setDetailsExpanded] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="px-3 py-1.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm font-semibold truncate">{document.title}</h1>
            <span className="text-xs text-gray-500 shrink-0">
              {sourceVersion.language.name} → {targetVersion.language.name}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(targetVersion.status === DocumentStatus.APPROVED ||
              targetVersion.status === DocumentStatus.DEPLOYED) && (
              <Button variant="default" size="sm" onClick={handleDownload} disabled={loading}>
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            )}
            {targetVersion.status === DocumentStatus.PENDING_REVIEW && (
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
            <StatusDropdown
              currentStatus={targetVersion.status}
              versionId={targetVersion.id}
              user={user}
              documentId={document.id}
              languageId={targetVersion.languageId}
              disabled={loading}
              onStatusChange={handleStatusChange}
            />
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
            translationBadge={<Badge variant="secondary">{targetVersion.language.name}</Badge>}
            canEditSource={canEditSource}
            onSourceChange={handleSourceChange}
            onSourceSave={handleSourceSave}
            onSourceDelete={handleSourceDeleteConfirm}
            sourceEditContent={sourceEditContent}
            reviewConfig={{
              canEdit: isPendingReview,
              renderEditActions: reviewEditActions,
            }}
            suggestions={suggestions}
            canCreateSuggestions={canCreateSuggestions}
            currentUserId={user.id}
            onSuggestionClick={() => {}}
            onApplySuggestion={handleApplySuggestion}
            onDismissSuggestion={handleDismissSuggestion}
            onReopenSuggestion={handleReopenSuggestion}
            onEditSuggestion={handleEditSuggestion}
            onCreateSuggestion={handleCreateSuggestion}
            documentVersion={targetVersion.version}
            isApplyingSuggestion={isApplyingSuggestion}
            isDismissingSuggestion={isDismissingSuggestion}
            onReply={handleReply}
            onCreateGeneralThread={handleCreateGeneralThread}
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
              <Stepper value={getStatusStep(targetVersion.status)} orientation="horizontal">
                <StepperNav>
                  {statusSteps.map(({ step, status, config }) => (
                    <StepperItem key={status} step={step} completed={isStepCompleted(step, targetVersion.status)}>
                      <StepperTrigger disabled>
                        <StepperStatusIndicator status={status} />
                        <StepperTitle className={config.color.textClass}>{config.name}</StepperTitle>
                      </StepperTrigger>
                      {step < statusSteps.length && <StepperSeparator />}
                    </StepperItem>
                  ))}
                </StepperNav>
              </Stepper>

              <GitHubStatus
                documentVersionId={targetVersion.id}
                isDeployed={targetVersion.status === DocumentStatus.DEPLOYED}
              />

              {activityLogs && activityLogs.length > 0 && (
                <ActivityLog entries={activityLogs} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
