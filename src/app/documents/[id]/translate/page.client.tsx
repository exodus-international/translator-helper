'use client';

import { SourceTranslationViewer, SourceTranslationViewerHandle } from '@/components/source-translation-viewer';
import { StatusDropdown } from '@/components/status-dropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  assignDocumentVersionAction,
  createDocumentVersionAction,
  deleteDocumentVersionAction,
  submitForReviewAction,
  updateDocumentVersionAction,
} from '@/domain/document-version/document-version.actions';
import { deleteDocumentAction } from '@/domain/document/document.actions';
import { translateDocumentAction } from '@/domain/translation/translation.actions';
import { getStatusStep, isStepCompleted } from '@/lib/document-status';
import { isDeployerClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { DocumentStatus } from '@prisma/client';
import matter from 'gray-matter';
import { AlertCircle, Calendar, Maximize2, Minimize2, Save, Send, Sparkles, Trash2, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

interface TranslateClientProps {
  document: any;
  sourceVersion: any;
  targetVersion: any | null;
  targetLanguageId: string;
  translationProject?: any | null;
  assignment?: any | null;
  user: SessionUser;
}

function getContentWithoutFrontmatter(text: string) {
  try {
    const { content: parsedContent } = matter(text);
    return parsedContent;
  } catch {
    return text;
  }
}

export default function TranslateClient({
  document,
  sourceVersion,
  targetVersion: initialTargetVersion,
  targetLanguageId,
  translationProject,
  assignment,
  user,
}: TranslateClientProps) {
  const router = useRouter();
  const [targetVersion, setTargetVersion] = useState(initialTargetVersion);
  const [content, setContent] = useState(initialTargetVersion?.content || '');
  const [loading, setLoading] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [sourceEditContent, setSourceEditContent] = useState(sourceVersion.content);
  const [sourceSaving, setSourceSaving] = useState(false);

  // Check if user can edit source (deployer only)
  const canEditSource = isDeployerClient(user);
  const statusSteps = DOCUMENT_STATUS_SEQUENCE.map((status, index) => ({
    status,
    step: index + 1,
    config: getDocumentStatusConfig(status),
  }));
  const viewerRef = useRef<SourceTranslationViewerHandle>(null);
  const sourceFormattedContent = useMemo(
    () => getContentWithoutFrontmatter(sourceVersion.content),
    [sourceVersion.content],
  );
  const translationFormattedContent = useMemo(
    () => (content ? getContentWithoutFrontmatter(content) : '*No content yet...*'),
    [content],
  );

  const handleStatusChange = (status: DocumentStatus) => {
    setTargetVersion((prev: any | null) => (prev ? { ...prev, status } : prev));
  };

  // Extract reviewer and deployer from activity logs
  const reviewer = useMemo(() => {
    if (!targetVersion?.activityLogs) return null;
    const reviewLog = targetVersion.activityLogs.find(
      (log: any) => log.action === 'approved' || log.action === 'requested_changes',
    );
    return reviewLog?.user || null;
  }, [targetVersion?.activityLogs]);

  const deployer = useMemo(() => {
    if (!targetVersion?.activityLogs) return null;
    const deployLog = targetVersion.activityLogs.find((log: any) => log.action === 'deployed');
    return deployLog?.user || null;
  }, [targetVersion?.activityLogs]);

  // Keyboard shortcut for Zen mode (F11 or Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        setZenMode(!zenMode);
      } else if (e.key === 'Escape' && zenMode) {
        setZenMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zenMode]);

  const handleSave = async () => {
    setLoading(true);
    try {
      if (targetVersion) {
        // Update existing version
        const updated = await updateDocumentVersionAction(targetVersion.id, {
          content,
        });
        setTargetVersion(updated);
      } else {
        // Create new version
        const created = await createDocumentVersionAction({
          documentId: document.id,
          languageId: targetLanguageId,
          content,
        });
        setTargetVersion(created);
      }
      alert('Translation saved successfully!');
    } catch (error: any) {
      console.error('Error saving translation:', error);
      alert(error.message || 'Failed to save translation');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!targetVersion) {
      await handleSave();
      return;
    }

    setLoading(true);
    try {
      await submitForReviewAction({ versionId: targetVersion.id });
      alert('Translation submitted for review!');
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Error submitting for review:', error);
      alert(error.message || 'Failed to submit for review');
    } finally {
      setLoading(false);
    }
  };

  const handleStartTranslation = async () => {
    if (!targetLanguageId) {
      alert('Please select a target language first');
      return;
    }

    setLoading(true);
    try {
      const version = await assignDocumentVersionAction({
        documentId: document.id,
        languageId: targetLanguageId,
        content: '',
      });
      setTargetVersion(version);
      setContent(version.content || '');
    } catch (error: any) {
      console.error('Error starting translation:', error);
      alert(error.message || 'Failed to start translation');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTranslation = async () => {
    if (!targetVersion) {
      return;
    }

    if (!confirm('Are you sure you want to delete this translation version? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      await deleteDocumentVersionAction(targetVersion.id);
      alert('Translation version deleted successfully!');
      // Reset state and redirect back to documents page
      setTargetVersion(null);
      setContent('');
      router.push('/documents');
    } catch (error: any) {
      console.error('Error deleting translation:', error);
      alert(error.message || 'Failed to delete translation');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoTranslate = async () => {
    if (!targetLanguageId) {
      alert('Select a target language before requesting an AI translation.');
      return;
    }

    if (content.trim().length > 0) {
      const confirmed = window.confirm(
        'This will overwrite the current translation with a new AI-generated version. Continue?',
      );
      if (!confirmed) {
        return;
      }
    }

    setTranslating(true);
    try {
      const result = await translateDocumentAction({
        documentTitle: document.title,
        sourceLanguageName: sourceVersion.language.name,
        targetLanguageId,
        sourceContent: sourceVersion.content,
        currentTranslation: content || undefined,
      });

      setContent(result.translatedContent);
      viewerRef.current?.enterTranslationEditMode();
    } catch (error: any) {
      console.error('AI translation failed:', error);
      alert(error.message || 'Failed to generate AI translation');
    } finally {
      setTranslating(false);
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
      alert('Source document saved successfully!');
      router.refresh();
    } catch (error: any) {
      console.error('Error saving source:', error);
      alert(error.message || 'Failed to save source document');
    } finally {
      setSourceSaving(false);
    }
  };

  const handleSourceDelete = async () => {
    if (
      !confirm(
        'Are you sure you want to delete this document? This will delete the source version and all translation versions. This action cannot be undone.',
      )
    ) {
      return;
    }
    try {
      // Delete the entire document, which will cascade delete all versions
      await deleteDocumentAction(document.id);
      alert('Document deleted successfully!');
      router.push('/documents');
    } catch (error: any) {
      console.error('Error deleting document:', error);
      alert(error.message || 'Failed to delete document');
    }
  };

  return (
    <div className={zenMode ? 'fixed inset-0 bg-white z-50' : 'min-h-screen bg-gray-50'}>
      {!zenMode && (
        <div className="border-b bg-white">
          <div className="container mx-auto px-4 py-4">
            <div className="flex flex-col gap-4">
              {/* Row 1: Title */}
              <h1 className="text-2xl font-bold">{document.title}</h1>

              {/* Row 2: Translation badges and buttons */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{sourceVersion.language.name}</Badge>
                  <span className="text-gray-400">→</span>
                  <Badge variant="secondary">{targetVersion?.language.name || 'New Translation'}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {targetVersion ? (
                    <>
                      {targetVersion.status !== 'PENDING_TRANSLATION' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAutoTranslate}
                            disabled={loading || translating || !targetLanguageId}
                          >
                            <Sparkles className="h-4 w-4 mr-2" />
                            {translating ? 'Translating...' : 'Translate with AI'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setZenMode(true)}>
                            <Maximize2 className="h-4 w-4 mr-2" />
                            Zen Mode (F11)
                          </Button>
                          <Button variant="outline" onClick={handleSave} disabled={loading || translating}>
                            <Save className="h-4 w-4 mr-2" />
                            Save Draft
                          </Button>
                        </>
                      )}
                      <StatusDropdown
                        currentStatus={targetVersion.status}
                        versionId={targetVersion.id}
                        user={user}
                        documentId={document.id}
                        languageId={targetLanguageId}
                        disabled={loading || translating}
                        onStatusChange={handleStatusChange}
                      />
                      {targetVersion.status === 'PENDING_TRANSLATION' && isDeployerClient(user) && (
                        <Button variant="outline" size="sm" onClick={handleDeleteTranslation} disabled={loading}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      )}
                    </>
                  ) : targetLanguageId ? (
                    <Button onClick={handleStartTranslation} disabled={loading}>
                      Start Translation
                    </Button>
                  ) : (
                    <span className="text-sm text-gray-500">
                      Please select a target language from the documents page to start translating.
                    </span>
                  )}
                </div>
              </div>

              {/* Row 3: Stepper */}
              <div className="w-full">
                <Stepper value={getStatusStep(targetVersion?.status || null)} orientation="horizontal">
                  <StepperNav>
                    {statusSteps.map(({ step, status, config }) => (
                      <StepperItem
                        key={status}
                        step={step}
                        completed={isStepCompleted(step, targetVersion?.status || null)}
                      >
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

              {/* Assignment Information */}
              {assignment && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex items-center gap-2 text-sm">
                    {assignment.user ? (
                      <>
                        <User className="h-4 w-4 text-blue-600" />
                        <span className="text-gray-700">
                          Assigned to: <span className="font-medium">{assignment.user.name}</span>
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-blue-600" />
                        <span className="text-blue-700 font-medium">Unassigned (visible to all project members)</span>
                      </>
                    )}
                    {assignment.deadline && (
                      <>
                        <span className="text-gray-400">•</span>
                        <Calendar className="h-4 w-4 text-blue-600" />
                        <span className="text-gray-700">
                          Deadline:{' '}
                          <span className="font-medium">{new Date(assignment.deadline).toLocaleDateString()}</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Version Information */}
              {targetVersion && (
                <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                  {targetVersion.user && (
                    <span>
                      Translator: <span className="font-medium">{targetVersion.user.name}</span>
                    </span>
                  )}
                  {reviewer && (
                    <span>
                      Reviewer: <span className="font-medium">{reviewer.name}</span>
                    </span>
                  )}
                  {deployer && (
                    <span>
                      Deployed by: <span className="font-medium">{deployer.name}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {zenMode && (
        <div className="border-b bg-white shadow-sm">
          <div className="px-4 py-2 flex items-center justify-between">
            <div className="text-sm text-gray-600">{document.title} • Zen Mode</div>
            <div className="flex flex-wrap items-center gap-2">
              {targetVersion ? (
                <>
                  <StatusDropdown
                    currentStatus={targetVersion.status}
                    versionId={targetVersion.id}
                    user={user}
                    documentId={document.id}
                    languageId={targetLanguageId}
                    disabled={loading || translating}
                    onStatusChange={handleStatusChange}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAutoTranslate}
                    disabled={loading || translating || !targetLanguageId}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {translating ? 'Translating...' : 'Translate'}
                  </Button>
                  {targetVersion.status !== 'PENDING_TRANSLATION' && (
                    <Button variant="outline" size="sm" onClick={handleSave} disabled={loading || translating}>
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                  )}
                  {targetVersion.status === 'IN_PROGRESS' && (
                    <Button size="sm" onClick={handleSubmitForReview} disabled={loading || translating}>
                      <Send className="h-4 w-4 mr-2" />
                      Submit
                    </Button>
                  )}
                  {targetVersion.status === 'PENDING_TRANSLATION' && isDeployerClient(user) && (
                    <Button variant="outline" size="sm" onClick={handleDeleteTranslation} disabled={loading}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  )}
                </>
              ) : targetLanguageId ? (
                <Button onClick={handleStartTranslation} disabled={loading} size="sm">
                  Start Translation
                </Button>
              ) : (
                <span className="text-sm text-gray-500">
                  Please select a target language from the documents page to start translating.
                </span>
              )}
              <Button variant="outline" size="sm" onClick={() => setZenMode(false)}>
                <Minimize2 className="h-4 w-4 mr-2" />
                Exit Zen (Esc)
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className={zenMode ? 'h-[calc(100vh-3.5rem)] p-4' : 'container mx-auto px-4 py-8'}>
        <SourceTranslationViewer
          ref={viewerRef}
          variant="translate"
          layout={zenMode ? 'zen' : 'default'}
          className={zenMode ? 'h-full' : undefined}
          sourceContent={sourceVersion.content}
          sourceFormattedContent={sourceFormattedContent}
          translationContent={content}
          translationFormattedContent={translationFormattedContent}
          translationPlaceholder="Enter your translation here..."
          translationPreviewEmptyText="*No content yet...*"
          onTranslationChange={setContent}
          sourceBadge={<Badge variant="secondary">{sourceVersion.language.name}</Badge>}
          translationBadge={<Badge variant="secondary">{targetVersion?.language.name || 'New Translation'}</Badge>}
          canEditSource={canEditSource}
          onSourceChange={handleSourceChange}
          onSourceSave={handleSourceSave}
          onSourceDelete={handleSourceDelete}
          sourceEditContent={sourceEditContent}
        />
        {/* Activity Log */}
        {!zenMode && targetVersion && targetVersion.activityLogs && (
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
