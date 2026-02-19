'use client';

import { ActivityLog } from '@/components/activity-log';
import { SuggestionWithUser } from '@/components/monaco-suggestion-decorations';
import { SourceTranslationViewer, SourceTranslationViewerHandle } from '@/components/source-translation-viewer';
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
  assignDocumentVersionAction,
  createDocumentVersionAction,
  deleteDocumentVersionAction,
  submitForReviewAction,
  updateDocumentVersionAction,
} from '@/domain/document-version/document-version.actions';
import { deleteDocumentAction } from '@/domain/document/document.actions';
import {
  applySuggestionAction,
  createSuggestionAction,
  createSuggestionReplyAction,
  dismissSuggestionAction,
  getSuggestionsByDocumentVersionAction,
} from '@/domain/suggestion/suggestion.actions';
import { translateDocumentAction } from '@/domain/translation/translation.actions';
import { getStatusStep, isStepCompleted } from '@/lib/document-status';
import { isDeployerClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { DocumentStatus, SuggestionType } from '@prisma/client';
import matter from 'gray-matter';
import { AlertCircle, Calendar, Check, Cloud, CloudOff, Loader2, Maximize2, Minimize2, Save, Send, Sparkles, Trash2, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface TranslateClientProps {
  document: any;
  sourceVersion: any;
  targetVersion: any | null;
  targetLanguageId: string;
  translationProject?: any | null;
  assignment?: any | null;
  user: SessionUser;
  initialSuggestions?: any[];
}

function SaveStatusIndicator({ status, lastSavedAt }: { status: 'saved' | 'unsaved' | 'saving' | 'error'; lastSavedAt: Date | null }) {
  const timeStr = lastSavedAt
    ? lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  switch (status) {
    case 'saving':
      return (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Saving...</span>
        </div>
      );
    case 'saved':
      return (
        <div className="flex items-center gap-1.5 text-xs text-green-600">
          <Cloud className="h-3.5 w-3.5" />
          <span>Saved{timeStr ? ` at ${timeStr}` : ''}</span>
        </div>
      );
    case 'unsaved':
      return (
        <div className="flex items-center gap-1.5 text-xs text-amber-600">
          <CloudOff className="h-3.5 w-3.5" />
          <span>Unsaved changes</span>
        </div>
      );
    case 'error':
      return (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <CloudOff className="h-3.5 w-3.5" />
          <span>Save failed</span>
        </div>
      );
  }
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
  initialSuggestions = [],
}: TranslateClientProps) {
  const router = useRouter();
  const [targetVersion, setTargetVersion] = useState(initialTargetVersion);
  const [content, setContent] = useState(initialTargetVersion?.content || '');
  const [loading, setLoading] = useState(false);
  const [zenMode, setZenMode] = useState(false);
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
  const [translating, setTranslating] = useState(false);
  const [sourceEditContent, setSourceEditContent] = useState(sourceVersion.content);
  const [sourceSaving, setSourceSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const savedContentRef = useRef(initialTargetVersion?.content || '');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const contentRef = useRef(content);
  const targetVersionRef = useRef(targetVersion);
  const autoSavingRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { targetVersionRef.current = targetVersion; }, [targetVersion]);

  // Track unsaved changes
  useEffect(() => {
    if (content !== savedContentRef.current) {
      setSaveStatus('unsaved');
    }
  }, [content]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // Stable auto-save function that reads from refs (no state dependencies)
  const performAutoSave = useCallback(async () => {
    const tv = targetVersionRef.current;
    const currentContent = contentRef.current;
    if (!tv || tv.status === 'PENDING_TRANSLATION') return;
    if (currentContent === savedContentRef.current) return;
    if (autoSavingRef.current) return;

    autoSavingRef.current = true;
    setSaveStatus('saving');
    try {
      await updateDocumentVersionAction(tv.id, { content: currentContent });
      if (!isMountedRef.current) return;
      savedContentRef.current = currentContent;
      setSaveStatus('saved');
      setLastSavedAt(new Date());
    } catch (error: any) {
      if (!isMountedRef.current) return;
      console.error('Auto-save failed:', error);
      setSaveStatus('error');
    } finally {
      autoSavingRef.current = false;
    }
  }, []);

  // Debounced auto-save: triggers 3 seconds after last edit, only depends on content
  useEffect(() => {
    if (!targetVersion || targetVersion.status === 'PENDING_TRANSLATION') return;
    if (content === savedContentRef.current) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, 3000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [content, performAutoSave]); // no targetVersion dependency — read from ref inside performAutoSave

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
    // Cancel any pending auto-save
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    setLoading(true);
    setSaveStatus('saving');
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
      savedContentRef.current = content;
      setSaveStatus('saved');
      setLastSavedAt(new Date());
      toast.success('Translation saved successfully!');
    } catch (error: any) {
      console.error('Error saving translation:', error);
      setSaveStatus('error');
      toast.error(error.message || 'Failed to save translation');
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
      toast.success('Translation submitted for review!');
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Error submitting for review:', error);
      toast.error(error.message || 'Failed to submit for review');
    } finally {
      setLoading(false);
    }
  };

  const handleStartTranslation = async () => {
    if (!targetLanguageId) {
      toast.warning('Please select a target language first');
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
      toast.error(error.message || 'Failed to start translation');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTranslation = async () => {
    if (!targetVersion) {
      return;
    }

    setLoading(true);
    try {
      await deleteDocumentVersionAction(targetVersion.id);
      toast.success('Translation version deleted successfully!');
      // Reset state and redirect back to documents page
      setTargetVersion(null);
      setContent('');
      router.push('/documents');
    } catch (error: any) {
      console.error('Error deleting translation:', error);
      toast.error(error.message || 'Failed to delete translation');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTranslationConfirm = async () => {
    await handleDeleteTranslation();
  };

  const handleAutoTranslate = async () => {
    if (!targetLanguageId) {
      toast.warning('Select a target language before requesting an AI translation.');
      return;
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
      toast.success('AI translation generated successfully!');
    } catch (error: any) {
      console.error('AI translation failed:', error);
      toast.error(error.message || 'Failed to generate AI translation');
    } finally {
      setTranslating(false);
    }
  };

  const handleAutoTranslateConfirm = async () => {
    await handleAutoTranslate();
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

  const reloadSuggestions = async () => {
    if (!targetVersion) return;
    try {
      const updated = await getSuggestionsByDocumentVersionAction(targetVersion.id);
      const formatted = updated.map((s: any) => ({
        ...s,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
        replies: (s.replies || []).map((r: any) => ({
          ...r,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        })),
      }));
      setSuggestions(formatted as SuggestionWithUser[]);
    } catch (error) {
      console.error('Error loading suggestions:', error);
    }
  };

  const handleApplySuggestion = async (suggestionId: string) => {
    try {
      const updatedVersion = await applySuggestionAction({ suggestionId });
      setTargetVersion(updatedVersion);
      setContent(updatedVersion.content);
      savedContentRef.current = updatedVersion.content;
      setSaveStatus('saved');
      toast.success('Suggestion applied!');
      await reloadSuggestions();
    } catch (error: any) {
      console.error('Error applying suggestion:', error);
      toast.error(error.message || 'Failed to apply suggestion');
    }
  };

  const handleDismissSuggestion = async (suggestionId: string, reason?: string) => {
    try {
      await dismissSuggestionAction({ suggestionId, dismissedReason: reason });
      toast.success('Suggestion dismissed!');
      await reloadSuggestions();
    } catch (error: any) {
      console.error('Error dismissing suggestion:', error);
      toast.error(error.message || 'Failed to dismiss suggestion');
    }
  };

  const handleCreateSuggestion = async (data: {
    comment: string;
    proposedText?: string;
    type: SuggestionType;
    range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
    version: number;
  }) => {
    if (!targetVersion) return;
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
      await reloadSuggestions();
    } catch (error: any) {
      console.error('Error creating suggestion:', error);
      toast.error(error.message || 'Failed to create suggestion');
    }
  };

  const handleReply = async (suggestionId: string, content: string) => {
    try {
      await createSuggestionReplyAction({ suggestionId, content });
      await reloadSuggestions();
    } catch (error: any) {
      console.error('Error replying:', error);
      toast.error(error.message || 'Failed to post reply');
    }
  };

  const handleCreateGeneralThread = async (comment: string) => {
    if (!targetVersion) return;
    try {
      await createSuggestionAction({
        documentVersionId: targetVersion.id,
        startLine: null,
        startColumn: null,
        endLine: null,
        endColumn: null,
        type: 'COMMENT' as SuggestionType,
        comment,
        version: targetVersion.version ?? 1,
      });
      toast.success('Comment added!');
      await reloadSuggestions();
    } catch (error: any) {
      console.error('Error creating general thread:', error);
      toast.error(error.message || 'Failed to create comment');
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
                          <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
                          <Button variant="outline" size="sm" onClick={handleSave} disabled={loading || translating}>
                            <Save className="h-4 w-4 mr-2" />
                            Save
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
                  {content.trim().length > 0 ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={loading || translating || !targetLanguageId}>
                          <Sparkles className="h-4 w-4 mr-2" />
                          {translating ? 'Translating...' : 'Translate'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Overwrite Translation?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will overwrite the current translation with a new AI-generated version. Continue?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleAutoTranslateConfirm}>Continue</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAutoTranslate}
                      disabled={loading || translating || !targetLanguageId}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {translating ? 'Translating...' : 'Translate'}
                    </Button>
                  )}
                  {targetVersion.status !== 'PENDING_TRANSLATION' && (
                    <>
                      <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
                      <Button variant="outline" size="sm" onClick={handleSave} disabled={loading || translating}>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                    </>
                  )}
                  {targetVersion.status === 'IN_PROGRESS' && (
                    <Button size="sm" onClick={handleSubmitForReview} disabled={loading || translating}>
                      <Send className="h-4 w-4 mr-2" />
                      Submit
                    </Button>
                  )}
                  {targetVersion.status === 'PENDING_TRANSLATION' && isDeployerClient(user) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={loading}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Translation Version</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this translation version? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDeleteTranslationConfirm}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
          suggestions={suggestions}
          currentUserId={user.id}
          onApplySuggestion={handleApplySuggestion}
          onDismissSuggestion={handleDismissSuggestion}
          onCreateSuggestion={handleCreateSuggestion}
          onReply={handleReply}
          onCreateGeneralThread={handleCreateGeneralThread}
          documentVersion={targetVersion?.version ?? 1}
        />
        {/* Activity Log */}
        {!zenMode && targetVersion && targetVersion.activityLogs && (
          <ActivityLog entries={targetVersion.activityLogs} />
        )}
      </div>
    </div>
  );
}
