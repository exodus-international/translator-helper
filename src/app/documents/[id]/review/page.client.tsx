'use client';

import { SuggestionWithUser } from '@/components/monaco-suggestion-decorations';
import { SourceTranslationViewer } from '@/components/source-translation-viewer';
import { StatusDropdown } from '@/components/status-dropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Stepper,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperStatusIndicator,
  StepperTitle,
  StepperTrigger,
} from '@/components/ui/stepper';
import { Textarea } from '@/components/ui/textarea';
import { DOCUMENT_STATUS_SEQUENCE, getDocumentStatusConfig } from '@/constants/document-status';
import { createCommentAction } from '@/domain/comment/comment.actions';
import {
  deployVersionAction,
  reviewVersionAction,
  updateDocumentVersionAction,
} from '@/domain/document-version/document-version.actions';
import { deleteDocumentAction, toggleDocumentLabelAction } from '@/domain/document/document.actions';
import {
  applySuggestionAction,
  createSuggestionAction,
  dismissSuggestionAction,
  getSuggestionsByDocumentVersionAction,
} from '@/domain/suggestion/suggestion.actions';
import { getStatusStep, isStepCompleted } from '@/lib/document-status';
import { canReviewClient, isDeployerClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { cn } from '@/lib/utils';
import { DocumentStatus, SuggestionType } from '@prisma/client';
import matter from 'gray-matter';
import { Download, FileCheck, FilePlus, MessageCircle, MessageSquare } from 'lucide-react';
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
  const [comment, setComment] = useState('');
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

  // Refresh suggestions when content changes
  useEffect(() => {
    const loadSuggestions = async () => {
      try {
        const updatedSuggestions = await getSuggestionsByDocumentVersionAction(targetVersion.id);
        // Convert Date to string for createdAt
        const formattedSuggestions = updatedSuggestions.map((s: any) => ({
          ...s,
          createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
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
  const currentStatusConfig = getDocumentStatusConfig(targetVersion.status);
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

  const handleAddComment = async () => {
    if (!comment.trim()) return;

    setLoading(true);
    try {
      await createCommentAction({
        documentVersionId: targetVersion.id,
        content: comment,
      });
      setComment('');
      toast.success('Comment added!');
      // Reload to show new comment
      window.location.reload();
    } catch (error: any) {
      console.error('Error adding comment:', error);
      toast.error(error.message || 'Failed to add comment');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setLoading(true);
    try {
      await reviewVersionAction({
        versionId: targetVersion.id,
        approved: true,
        comment: comment || undefined,
      });
      toast.success('Translation approved!');
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Error approving:', error);
      toast.error(error.message || 'Failed to approve');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!comment.trim()) {
      toast.warning('Please add a comment explaining the changes needed');
      return;
    }

    setLoading(true);
    try {
      await reviewVersionAction({
        versionId: targetVersion.id,
        approved: false,
        comment,
      });
      toast.success('Changes requested!');
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Error requesting changes:', error);
      toast.error(error.message || 'Failed to request changes');
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = async () => {
    setLoading(true);
    try {
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

  const handleDeployConfirm = async () => {
    await handleDeploy();
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

  const handleSuggestionClick = (suggestion: SuggestionWithUser) => {
    // Scroll to suggestion range - this would be handled by the Monaco editor
    // The decoration hook should handle this
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{document.title}</h1>
              <div className="flex items-center flex-col gap-2">
                <div className="flex justify-between w-full">
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary">{sourceVersion.language.name}</Badge>
                    <span className="text-gray-400">→</span>
                    <Badge variant="secondary">{targetVersion.language.name}</Badge>
                    <Badge variant="secondary" className={cn('gap-1', currentStatusConfig.color.badgeClass)}>
                      <currentStatusConfig.icon className={cn('h-3.5 w-3.5', currentStatusConfig.color.textClass)} />
                      {currentStatusConfig.name}
                    </Badge>
                  </div>
                  <div className="flex gap-2 ml-4">
                    {(targetVersion.status === DocumentStatus.APPROVED ||
                      targetVersion.status === DocumentStatus.DEPLOYED) && (
                      <Button variant="default" size="sm" onClick={handleDownload} disabled={loading}>
                        <Download className="h-4 w-4 mr-2" />
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
                <div className="mt-4 w-full">
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
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <SourceTranslationViewer
          variant="review"
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
          onSuggestionClick={handleSuggestionClick}
          onApplySuggestion={handleApplySuggestion}
          onDismissSuggestion={handleDismissSuggestion}
          onCreateSuggestion={handleCreateSuggestion}
          documentVersion={targetVersion.version}
          isApplyingSuggestion={isApplyingSuggestion}
          isDismissingSuggestion={isDismissingSuggestion}
        />

        {/* Comments Section */}
        <Card className="mt-6 p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Comments
          </h3>

          {targetVersion.comments && targetVersion.comments.length > 0 && (
            <div className="space-y-4 mb-6">
              {targetVersion.comments.map((c: any) => (
                <div key={c.id} className="border-l-2 border-gray-300 pl-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{c.user.name}</span>
                    <span className="text-xs text-gray-500">{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-gray-700">{c.content}</p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="comment">Add Comment</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Leave a comment..."
              rows={3}
            />
            <Button onClick={handleAddComment} disabled={loading || !comment.trim()}>
              <MessageCircle />
              Add Comment
            </Button>
          </div>
        </Card>

        {/* Activity Log */}
        {targetVersion.activityLogs && targetVersion.activityLogs.length > 0 && (
          <Card className="mt-6 p-6">
            <h3 className="text-lg font-semibold mb-4">Activity Log</h3>
            <div className="space-y-3">
              {targetVersion.activityLogs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 text-sm">
                  <div className="flex-1">
                    <span className="font-medium">{log.user.name}</span>
                    <span className="text-gray-600 ml-2">{log.action}</span>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <span className="text-gray-500 ml-2">{JSON.stringify(log.details)}</span>
                    )}
                  </div>
                  <span className="text-gray-500">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
