'use client';

import { ActivityLog } from '@/components/activity-log';
import { DocumentInfoCard } from '@/components/document-info-card';
import { EditorDialogs } from '@/components/editor-dialogs';
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
import { DOCUMENT_STATUS_SEQUENCE, getDocumentStatusConfig } from '@/constants/document-status';
import {
  assignDocumentVersionAction,
  createDocumentVersionAction,
  deleteDocumentVersionAction,
} from '@/domain/document-version/document-version.actions';
import { translateDocumentAction } from '@/domain/translation/translation.actions';
import { getStatusStep, isStepCompleted } from '@/lib/document-status';
import { isDeployerClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { EditorProvider, useEditorStore } from '@/lib/stores/editor-provider';
import { useAutoSave } from '@/lib/stores/hooks';
import { DocumentStatus } from '@prisma/client';
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudOff,
  Loader2,
  Maximize2,
  Minimize2,
  Save,
  Send,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

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

function SaveStatusIndicator({
  status,
  lastSavedAt,
}: {
  status: 'saved' | 'unsaved' | 'saving' | 'error';
  lastSavedAt: Date | null;
}) {
  const timeStr = lastSavedAt ? lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

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

import matter from 'gray-matter';

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
  return (
    <EditorProvider
      documentId={document.id}
      targetVersion={initialTargetVersion}
      sourceContent={sourceVersion.content}
      initialSuggestions={initialSuggestions}
      translationProjectId={translationProject?.id ?? null}
      assignmentId={assignment?.id ?? null}
    >
      <TranslateInner
        document={document}
        sourceVersion={sourceVersion}
        targetLanguageId={targetLanguageId}
        translationProject={translationProject}
        assignment={assignment}
        user={user}
      />
    </EditorProvider>
  );
}

function TranslateInner({
  document,
  sourceVersion,
  targetLanguageId,
  translationProject,
  assignment,
  user,
}: Omit<TranslateClientProps, 'targetVersion' | 'initialSuggestions'>) {
  const router = useRouter();

  // ─── Store state (selectors for granular re-renders) ─────
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const content = useEditorStore((s) => s.content);
  const setContent = useEditorStore((s) => s.setContent);
  const suggestions = useEditorStore((s) => s.suggestions);
  const sourceEditContent = useEditorStore((s) => s.sourceEditContent);
  const setSourceEditContent = useEditorStore((s) => s.setSourceEditContent);
  const saveStatus = useEditorStore((s) => s.saveStatus());

  // Store actions
  const saveContent = useEditorStore((s) => s.saveContent);
  const saveSource = useEditorStore((s) => s.saveSource);
  const deleteSource = useEditorStore((s) => s.deleteSource);
  const handleStatusChange = useEditorStore((s) => s.handleStatusChange);
  const applySuggestion = useEditorStore((s) => s.applySuggestion);
  const dismissSuggestion = useEditorStore((s) => s.dismissSuggestion);
  const reopenSuggestion = useEditorStore((s) => s.reopenSuggestion);
  const createSuggestion = useEditorStore((s) => s.createSuggestion);
  const createGeneralThread = useEditorStore((s) => s.createGeneralThread);
  const replySuggestion = useEditorStore((s) => s.replySuggestion);
  const openReviewDialog = useEditorStore((s) => s.openReviewDialog);
  const openAssignTranslatorDialog = useEditorStore((s) => s.openAssignTranslatorDialog);
  const openAssignReviewerDialog = useEditorStore((s) => s.openAssignReviewerDialog);
  const unassignTranslator = useEditorStore((s) => s.unassignTranslator);
  const unassignReviewer = useEditorStore((s) => s.unassignReviewer);
  const isAnyLoading = useEditorStore((s) => s.isAnyLoading());
  const setTargetVersion = useEditorStore((s) => s.setTargetVersion);

  // ─── Auto-save ───────────────────────────────────────────
  useAutoSave({ delayMs: 3000 });

  // ─── Local state (translate-specific) ────────────────────
  const [zenMode, setZenMode] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const viewerRef = useRef<SourceTranslationViewerHandle>(null);

  const canEditSource = isDeployerClient(user);
  const statusSteps = DOCUMENT_STATUS_SEQUENCE.map((status, index) => ({
    status,
    step: index + 1,
    config: getDocumentStatusConfig(status),
  }));

  const sourceFormattedContent = useMemo(
    () => getContentWithoutFrontmatter(sourceVersion.content),
    [sourceVersion.content],
  );
  const translationFormattedContent = useMemo(
    () => (content ? getContentWithoutFrontmatter(content) : '*No content yet...*'),
    [content],
  );

  const reviewer = useMemo(() => {
    if (!targetVersion?.activityLogs) return null;
    const reviewLog = targetVersion.activityLogs.find(
      (log: any) => log.action === 'approved' || log.action === 'requested_changes',
    );
    return reviewLog?.user || null;
  }, [targetVersion?.activityLogs]);

  // Keyboard shortcut for Zen mode
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

  // ─── Translate-specific handlers ─────────────────────────

  const handleSave = async () => {
    setLoading(true);
    try {
      if (targetVersion) {
        await saveContent();
      } else {
        const created = await createDocumentVersionAction({
          documentId: document.id,
          languageId: targetLanguageId,
          content,
        });
        setTargetVersion(created);
      }
      setLastSavedAt(new Date());
    } catch (error: any) {
      // Error already toasted by store or caught here
      if (!targetVersion) {
        toast.error(error.message || 'Failed to save translation');
      }
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
      toast.error(error.message || 'Failed to start translation');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTranslation = async () => {
    if (!targetVersion) return;
    setLoading(true);
    try {
      await deleteDocumentVersionAction(targetVersion.id);
      toast.success('Translation version deleted successfully!');
      setTargetVersion(null);
      setContent('');
      router.push('/documents');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete translation');
    } finally {
      setLoading(false);
    }
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
      toast.error(error.message || 'Failed to generate AI translation');
    } finally {
      setTranslating(false);
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

  const handleOpenReviewDialog = async () => {
    if (!targetVersion) {
      await handleSave();
      return;
    }
    await openReviewDialog();
  };

  return (
    <div className={zenMode ? 'fixed inset-0 bg-white z-50' : 'min-h-screen bg-gray-50'}>
      {!zenMode && (
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
                {sourceVersion.language.name} → {targetVersion?.language.name || 'New Translation'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {targetVersion ? (
                <>
                  {targetVersion.status !== 'PENDING_TRANSLATION' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAutoTranslate}
                        disabled={loading || translating || isAnyLoading || !targetLanguageId}
                      >
                        <Sparkles className="h-4 w-4 mr-1" />
                        {translating ? 'Translating...' : 'AI Translate'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setZenMode(true)}>
                        <Maximize2 className="h-4 w-4" />
                      </Button>
                      <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSave}
                        disabled={loading || translating || isAnyLoading}
                      >
                        <Save className="h-4 w-4 mr-1" />
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
                    disabled={loading || translating || isAnyLoading}
                    onStatusChange={handleStatusChange}
                    onReviewRequested={handleOpenReviewDialog}
                  />
                  {targetVersion.status === 'PENDING_TRANSLATION' && isDeployerClient(user) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDeleteTranslation}
                      disabled={loading || isAnyLoading}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
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
                    disabled={loading || translating || isAnyLoading}
                    onStatusChange={handleStatusChange}
                    onReviewRequested={handleOpenReviewDialog}
                  />
                  {content.trim().length > 0 ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={loading || translating || isAnyLoading || !targetLanguageId}
                        >
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
                          <AlertDialogAction onClick={handleAutoTranslate}>Continue</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAutoTranslate}
                      disabled={loading || translating || isAnyLoading || !targetLanguageId}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {translating ? 'Translating...' : 'Translate'}
                    </Button>
                  )}
                  {targetVersion.status !== 'PENDING_TRANSLATION' && (
                    <>
                      <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSave}
                        disabled={loading || translating || isAnyLoading}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                    </>
                  )}
                  {targetVersion.status === 'IN_PROGRESS' && (
                    <Button
                      size="sm"
                      onClick={handleOpenReviewDialog}
                      disabled={loading || translating || isAnyLoading}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Submit
                    </Button>
                  )}
                  {targetVersion.status === 'PENDING_TRANSLATION' && isDeployerClient(user) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={loading || isAnyLoading}>
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
                          <AlertDialogAction onClick={handleDeleteTranslation}>Delete</AlertDialogAction>
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

      <div className={zenMode ? 'h-[calc(100vh-3.5rem)] p-4' : 'border-0'}>
        <div className={zenMode ? 'h-full' : 'h-[calc(100vh-7.5rem)]'}>
          <SourceTranslationViewer
            ref={viewerRef}
            variant="translate"
            layout={zenMode ? 'zen' : 'default'}
            className="h-full"
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
            onSourceChange={setSourceEditContent}
            onSourceSave={handleSourceSave}
            onSourceDelete={handleSourceDelete}
            sourceEditContent={sourceEditContent}
            suggestions={suggestions}
            currentUserId={user.id}
            onApplySuggestion={applySuggestion}
            onDismissSuggestion={dismissSuggestion}
            onReopenSuggestion={reopenSuggestion}
            onCreateSuggestion={createSuggestion}
            onReply={replySuggestion}
            onCreateGeneralThread={createGeneralThread}
            documentVersion={targetVersion?.version ?? 1}
            sidebarHeader={
              targetVersion && (
                <DocumentInfoCard
                  status={targetVersion.status}
                  translator={targetVersion.user}
                  reviewer={targetVersion.reviewer || reviewer}
                  language={targetVersion.language?.name}
                  onAssignTranslator={
                    isDeployerClient(user) &&
                    translationProject &&
                    (targetVersion.status === DocumentStatus.PENDING_TRANSLATION || !targetVersion.user)
                      ? openAssignTranslatorDialog
                      : undefined
                  }
                  onUnassignTranslator={
                    isDeployerClient(user) &&
                    assignment?.id &&
                    targetVersion.user &&
                    targetVersion.status === DocumentStatus.PENDING_TRANSLATION
                      ? unassignTranslator
                      : undefined
                  }
                  onAssignReviewer={
                    isDeployerClient(user) &&
                    translationProject &&
                    targetVersion.status === DocumentStatus.PENDING_TRANSLATION
                      ? openAssignReviewerDialog
                      : undefined
                  }
                  onUnassignReviewer={
                    isDeployerClient(user) &&
                    targetVersion.reviewer &&
                    targetVersion.status === DocumentStatus.PENDING_TRANSLATION
                      ? unassignReviewer
                      : undefined
                  }
                />
              )
            }
          />
        </div>

        {/* Collapsible details section */}
        {!zenMode && (
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

                {targetVersion && targetVersion.activityLogs && <ActivityLog entries={targetVersion.activityLogs} />}
              </div>
            )}
          </div>
        )}
      </div>

      <EditorDialogs />
    </div>
  );
}
