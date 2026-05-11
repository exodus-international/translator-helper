'use client';

import { DocumentEditor, DocumentEditorHeader } from '@/components/document-editor';
import { StatusDropdown } from '@/components/status-dropdown';
import { Button } from '@/components/ui/button';
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
import { SourceTranslationViewerHandle } from '@/components/source-translation-viewer';
import {
  assignDocumentVersionAction,
  createDocumentVersionAction,
  deleteDocumentVersionAction,
} from '@/domain/document-version/document-version.actions';
import { translateDocumentAction } from '@/domain/translation/translation.actions';
import { isAdminClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { useEditorStore } from '@/lib/stores/editor-provider';
import {
  AlertCircle,
  Calendar,
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
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
  const [zenMode, setZenMode] = useState(false);
  const viewerRef = useRef<SourceTranslationViewerHandle>(null);

  // Keyboard shortcut for zen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        setZenMode((z) => !z);
      } else if (e.key === 'Escape') {
        setZenMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <DocumentEditor
      document={document}
      sourceVersion={sourceVersion}
      targetVersion={initialTargetVersion}
      initialSuggestions={initialSuggestions}
      translationProjectId={translationProject?.id ?? null}
      assignmentId={assignment?.id ?? null}
      user={user}
      variant="translate"
      layout={zenMode ? 'zen' : 'default'}
      fullscreen={zenMode}
      viewerRef={viewerRef}
      header={
        <TranslateToolbar
          document={document}
          sourceVersion={sourceVersion}
          targetLanguageId={targetLanguageId}
          user={user}
          zenMode={zenMode}
          setZenMode={setZenMode}
          viewerRef={viewerRef}
        />
      }
      canEditSource={isAdminClient(user)}
      translationPlaceholder="Enter your translation here..."
      translationPreviewEmptyText="*No content yet...*"
      hideDetails={zenMode}
      autoSaveDelayMs={3000}
      extraDetails={assignment ? <AssignmentInfoBlock assignment={assignment} /> : undefined}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────
// Toolbar (covers both regular and zen variants)
// ──────────────────────────────────────────────────────────────────────

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

function TranslateToolbar({
  document,
  sourceVersion,
  targetLanguageId,
  user,
  zenMode,
  setZenMode,
  viewerRef,
}: {
  document: any;
  sourceVersion: any;
  targetLanguageId: string;
  user: SessionUser;
  zenMode: boolean;
  setZenMode: (zen: boolean) => void;
  viewerRef: React.RefObject<SourceTranslationViewerHandle | null>;
}) {
  const router = useRouter();
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const content = useEditorStore((s) => s.content);
  const setContent = useEditorStore((s) => s.setContent);
  const setTargetVersion = useEditorStore((s) => s.setTargetVersion);
  const saveContent = useEditorStore((s) => s.saveContent);
  const handleStatusChange = useEditorStore((s) => s.handleStatusChange);
  const openReviewDialog = useEditorStore((s) => s.openReviewDialog);
  const isAnyLoading = useEditorStore((s) => s.isAnyLoading());
  const saveStatus = useEditorStore((s) => s.saveStatus());

  const [translating, setTranslating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

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

  const handleOpenReviewDialog = async () => {
    if (!targetVersion) {
      await handleSave();
      return;
    }
    await openReviewDialog();
  };

  const busy = loading || translating || isAnyLoading;
  const canDelete = targetVersion?.status === 'PENDING_TRANSLATION' && isAdminClient(user);

  // ─── Zen mode header ──────────────────────────────────────────
  if (zenMode) {
    return (
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
                  disabled={busy}
                  onStatusChange={handleStatusChange}
                  onReviewRequested={handleOpenReviewDialog}
                />
                {content.trim().length > 0 ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={busy || !targetLanguageId}>
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
                  <Button variant="outline" size="sm" onClick={handleAutoTranslate} disabled={busy || !targetLanguageId}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {translating ? 'Translating...' : 'Translate'}
                  </Button>
                )}
                {targetVersion.status !== 'PENDING_TRANSLATION' && (
                  <>
                    <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
                    <Button variant="outline" size="sm" onClick={handleSave} disabled={busy}>
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                  </>
                )}
                {targetVersion.status === 'IN_PROGRESS' && (
                  <Button size="sm" onClick={handleOpenReviewDialog} disabled={busy}>
                    <Send className="h-4 w-4 mr-2" />
                    Submit
                  </Button>
                )}
                {canDelete && (
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
    );
  }

  // ─── Default header ──────────────────────────────────────────
  const actions = targetVersion ? (
    <>
      {targetVersion.status !== 'PENDING_TRANSLATION' && (
        <>
          <Button variant="outline" size="sm" onClick={handleAutoTranslate} disabled={busy || !targetLanguageId}>
            <Sparkles className="h-4 w-4 mr-1" />
            {translating ? 'Translating...' : 'AI Translate'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setZenMode(true)}>
            <Maximize2 className="h-4 w-4" />
          </Button>
          <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
          <Button variant="outline" size="sm" onClick={handleSave} disabled={busy}>
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
        disabled={busy}
        onStatusChange={handleStatusChange}
        onReviewRequested={handleOpenReviewDialog}
      />
      {canDelete && (
        <Button variant="outline" size="sm" onClick={handleDeleteTranslation} disabled={loading || isAnyLoading}>
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
  );

  return (
    <DocumentEditorHeader
      document={document}
      sourceLanguageName={sourceVersion.language.name}
      targetLanguageName={targetVersion?.language?.name ?? 'New Translation'}
      actions={actions}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────
// Translate-only details extra: assignment block in collapsible
// ──────────────────────────────────────────────────────────────────────

function AssignmentInfoBlock({ assignment }: { assignment: any }) {
  return (
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
              Deadline: <span className="font-medium">{new Date(assignment.deadline).toLocaleDateString()}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
