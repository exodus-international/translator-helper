'use client';

import { SourceTranslationViewer } from '@/components/source-translation-viewer';
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
import { getStatusStep, isStepCompleted } from '@/lib/document-status';
import { cn } from '@/lib/utils';
import matter from 'gray-matter';
import { CheckCircle, Download, MessageSquare, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

interface ReviewClientProps {
  document: any;
  sourceVersion: any;
  targetVersion: any;
}

function getContentWithoutFrontmatter(text: string) {
  try {
    const { content: parsedContent } = matter(text);
    return parsedContent;
  } catch {
    return text;
  }
}

export default function ReviewClient({
  document,
  sourceVersion,
  targetVersion: initialTargetVersion,
}: ReviewClientProps) {
  const router = useRouter();
  const [targetVersion, setTargetVersion] = useState(initialTargetVersion);
  const [content, setContent] = useState(initialTargetVersion.content);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const sourceFormattedContent = useMemo(
    () => getContentWithoutFrontmatter(sourceVersion.content),
    [sourceVersion.content],
  );
  const translationFormattedContent = useMemo(() => getContentWithoutFrontmatter(content), [content]);

  const canDeploy = targetVersion.status === 'APPROVED';
  const isPendingReview = targetVersion.status === 'PENDING_REVIEW';
  const currentStatusConfig = getDocumentStatusConfig(targetVersion.status);
  const statusSteps = DOCUMENT_STATUS_SEQUENCE.map((status, index) => ({
    status,
    step: index + 1,
    config: getDocumentStatusConfig(status),
  }));

  const handleSaveEdit = async () => {
    setLoading(true);
    try {
      const updated = await updateDocumentVersionAction(targetVersion.id, {
        content,
      });
      setTargetVersion(updated);
      alert('Changes saved successfully!');
      return true;
    } catch (error: any) {
      console.error('Error saving changes:', error);
      alert(error.message || 'Failed to save changes');
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
      alert('Comment added!');
      // Reload to show new comment
      window.location.reload();
    } catch (error: any) {
      console.error('Error adding comment:', error);
      alert(error.message || 'Failed to add comment');
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
      alert('Translation approved!');
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Error approving:', error);
      alert(error.message || 'Failed to approve');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!comment.trim()) {
      alert('Please add a comment explaining the changes needed');
      return;
    }

    setLoading(true);
    try {
      await reviewVersionAction({
        versionId: targetVersion.id,
        approved: false,
        comment,
      });
      alert('Changes requested!');
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Error requesting changes:', error);
      alert(error.message || 'Failed to request changes');
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = async () => {
    if (!confirm('Are you sure you want to deploy this document?')) {
      return;
    }

    setLoading(true);
    try {
      await deployVersionAction(targetVersion.id);

      // Trigger download
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${document.slug}-${targetVersion.language.code}.md`;
      a.click();
      URL.revokeObjectURL(url);

      alert('Document deployed and downloaded!');
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Error deploying:', error);
      alert(error.message || 'Failed to deploy');
    } finally {
      setLoading(false);
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{document.title}</h1>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary">{sourceVersion.language.name}</Badge>
                  <span className="text-gray-400">→</span>
                  <Badge variant="secondary">{targetVersion.language.name}</Badge>
                  <Badge variant="secondary" className={cn('gap-1', currentStatusConfig.color.badgeClass)}>
                    <currentStatusConfig.icon className={cn('h-3.5 w-3.5', currentStatusConfig.color.textClass)} />
                    {currentStatusConfig.name}
                  </Badge>
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
            <div className="flex gap-2 ml-4">
              {canDeploy && (
                <Button onClick={handleDeploy} disabled={loading}>
                  <Download className="h-4 w-4 mr-2" />
                  Deploy
                </Button>
              )}
              {isPendingReview && (
                <>
                  <Button variant="outline" onClick={handleRequestChanges} disabled={loading}>
                    <XCircle className="h-4 w-4 mr-2" />
                    Request Changes
                  </Button>
                  <Button onClick={handleApprove} disabled={loading}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                </>
              )}
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
          reviewConfig={{
            canEdit: isPendingReview,
            renderEditActions: reviewEditActions,
          }}
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
