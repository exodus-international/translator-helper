'use client';

import { ActivityLog } from '@/components/activity-log';
import { AudioStatus } from '@/components/audio-status';
import { DocumentEditor, DocumentEditorHeader } from '@/components/document-editor';
import { GitHubStatus } from '@/components/github-status';
import { SidebarSection } from '@/components/sidebar-section';
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
import { capture } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { useActiveLanguage, useAnalyticsProjectGroup } from '@/components/analytics-project-group';
import { isAdminClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { DocumentStatus } from '@prisma/client';
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
  targetLanguage?: { code: string; name: string } | null;
  translationProject?: any | null;
  user: SessionUser;
  initialSuggestions?: any[];
}

export default function TranslateClient({
  document,
  sourceVersion,
  targetVersion: initialTargetVersion,
  targetLanguageId,
  targetLanguage,
  translationProject,
  user,
  initialSuggestions = [],
}: TranslateClientProps) {
  const [zenMode, setZenMode] = useState(false);
  const viewerRef = useRef<SourceTranslationViewerHandle>(null);

  useAnalyticsProjectGroup(document?.sourceProject?.id, document?.sourceProject?.name);
  useActiveLanguage(targetLanguage?.code, targetLanguage?.name);

  // Keyboard shortcut for zen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        setZenMode((z) => {
          const next = !z;
          capture('zen_mode_toggled', { enabled: next });
          return next;
        });
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
      hideDetails
      autoSaveDelayMs={3000}
      sidebarSummary={
        initialTargetVersion ? (
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
        ) : undefined
      }
      sidebarDetails={
        initialTargetVersion ? (
          <>
            <SidebarSection title="Assignment">
              <AssignmentInfoBlock version={initialTargetVersion} />
            </SidebarSection>
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
        ) : undefined
      }
      sidebarDetailsDefaultOpen={initialTargetVersion?.status === DocumentStatus.DEPLOYED}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────
// Toolbar (covers both regular and zen variants)
// ──────────────────────────────────────────────────────────────────────

const SAVE_STATUS_META: Record<
  'saved' | 'unsaved' | 'saving' | 'error',
  { icon: LucideIcon; textClass: string; label: string; spin?: boolean }
> = {
  saving: { icon: Loader2, textClass: 'text-muted-foreground', label: 'Saving...', spin: true },
  saved: { icon: Cloud, textClass: 'text-green-600', label: 'Saved' },
  unsaved: { icon: CloudOff, textClass: 'text-amber-600', label: 'Unsaved changes' },
  error: { icon: CloudOff, textClass: 'text-red-600', label: 'Save failed' },
};

function SaveStatusIndicator({
  status,
  lastSavedAt,
}: {
  status: 'saved' | 'unsaved' | 'saving' | 'error';
  lastSavedAt: Date | null;
}) {
  const meta = SAVE_STATUS_META[status];
  const Icon = meta.icon;
  const timeStr = lastSavedAt ? lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  const label = status === 'saved' && timeStr ? `Saved at ${timeStr}` : meta.label;

  return (
    <div className={cn('flex items-center gap-1.5 text-xs', meta.textClass)} title={label}>
      <Icon className={cn('size-3.5', meta.spin && 'animate-spin')} />
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
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
        capture('translation_saved');
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
      capture('translation_started');
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
      capture('translation_deleted');
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
    const overwrite = content.trim().length > 0;
    setTranslating(true);
    try {
      const result = await translateDocumentAction({
        documentTitle: document.title,
        sourceLanguageName: sourceVersion.language.name,
        targetLanguageId,
        sourceContent: sourceVersion.content,
        currentTranslation: content || undefined,
        originalFilename: document.originalFilename ?? undefined,
      });
      capture('ai_translate_triggered', { overwrite });
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
  const canDelete = targetVersion?.status === DocumentStatus.PENDING_TRANSLATION && isAdminClient(user);

  // ─── Zen mode header ──────────────────────────────────────────
  if (zenMode) {
    return (
      <div className="border-b bg-background shadow-sm">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="min-w-0 truncate text-sm text-muted-foreground">{document.title} • Zen Mode</div>
          <div className="flex flex-wrap items-center gap-2">
            {targetVersion ? (
              <>
                <StatusDropdown
                  currentStatus={targetVersion.status}
                  versionId={targetVersion.id}
                  user={user}
                  documentId={document.id}
                  disabled={busy}
                  onStatusChange={handleStatusChange}
                  onReviewRequested={handleOpenReviewDialog}
                />
                {targetVersion.status === DocumentStatus.IN_PROGRESS && (
                  <Button size="sm" onClick={handleOpenReviewDialog} disabled={busy}>
                    <Send />
                    Submit
                  </Button>
                )}
                {targetVersion.status !== DocumentStatus.PENDING_TRANSLATION && (
                  <>
                    <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
                    <Button variant="outline" size="sm" onClick={handleSave} disabled={busy}>
                      <Save />
                      Save
                    </Button>
                  </>
                )}
                {content.trim().length > 0 ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={busy || !targetLanguageId}>
                        <Sparkles />
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
                    <Sparkles />
                    {translating ? 'Translating...' : 'Translate'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    capture('zen_mode_toggled', { enabled: false });
                    setZenMode(false);
                  }}
                >
                  <Minimize2 />
                  Exit Zen (Esc)
                </Button>
                {canDelete && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={loading || isAnyLoading}>
                        <Trash2 />
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
              <span className="text-sm text-muted-foreground">
                Please select a target language from the documents page to start translating.
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Default header ──────────────────────────────────────────
  // Header actions, ordered by workflow: status/submit → save → AI assist → view → destructive.
  const actions = targetVersion ? (
    <>
      <StatusDropdown
        currentStatus={targetVersion.status}
        versionId={targetVersion.id}
        user={user}
        documentId={document.id}
        disabled={busy}
        onStatusChange={handleStatusChange}
        onReviewRequested={handleOpenReviewDialog}
      />
      {targetVersion.status !== DocumentStatus.PENDING_TRANSLATION && (
        <>
          <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
          <Button variant="outline" size="sm" onClick={handleSave} disabled={busy}>
            <Save />
            Save
          </Button>
          <Button variant="outline" size="sm" onClick={handleAutoTranslate} disabled={busy || !targetLanguageId}>
            <Sparkles />
            {translating ? 'Translating...' : 'AI Translate'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              capture('zen_mode_toggled', { enabled: true });
              setZenMode(true);
            }}
          >
            <Maximize2 />
          </Button>
        </>
      )}
      {canDelete && (
        <Button variant="outline" size="sm" onClick={handleDeleteTranslation} disabled={loading || isAnyLoading}>
          <Trash2 />
          Delete
        </Button>
      )}
    </>
  ) : targetLanguageId ? (
    <Button onClick={handleStartTranslation} disabled={loading} size="sm">
      Start Translation
    </Button>
  ) : (
    <span className="text-sm text-muted-foreground">
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

function AssignmentInfoBlock({ version }: { version: any }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm">
        {version.user ? (
          <>
            <User className="h-4 w-4 text-blue-600" />
            <span className="text-gray-700">
              Assigned to: <span className="font-medium">{version.user.name}</span>
            </span>
          </>
        ) : (
          <>
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <span className="text-blue-700 font-medium">Unassigned (visible to all project members)</span>
          </>
        )}
        {version.deadline && (
          <>
            <span className="text-gray-400">•</span>
            <Calendar className="h-4 w-4 text-blue-600" />
            <span className="text-gray-700">
              Deadline: <span className="font-medium">{new Date(version.deadline).toLocaleDateString()}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
