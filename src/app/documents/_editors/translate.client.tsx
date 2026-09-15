'use client';

import { ActivityLog } from '@/components/activity-log';
import { AudioStatus } from '@/components/audio-status';
import { DocumentEditor, DocumentEditorHeader } from '@/components/document-editor';
import { MarkdownGuide } from '@/components/markdown-guide';
import { GitHubStatus } from '@/components/github-status';
import { SidebarSection } from '@/components/sidebar-section';
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
import { deleteDocumentVersionAction } from '@/domain/document-version/document-version.actions';
import { capture } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { useActiveLanguage, useAnalyticsProjectGroup } from '@/components/analytics-project-group';
import { isAdminClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { DocumentStatus } from '@/generated/prisma/enums';
import { useEditorStore } from '@/lib/stores/editor-provider';
import {
  AlertCircle,
  Calendar,
  CloudCheck,
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
      targetLanguageId={targetLanguageId}
      user={user}
      variant="translate"
      layout={zenMode ? 'zen' : 'default'}
      fullscreen={zenMode}
      viewerRef={viewerRef}
      header={
        <TranslateToolbar
          document={document}
          targetLanguageId={targetLanguageId}
          zenMode={zenMode}
          setZenMode={setZenMode}
        />
      }
      canEditSource={isAdminClient(user)}
      translationPlaceholder="Enter your translation here..."
      translationPreviewEmptyText="*No content yet...*"
      hideDetails
      autoSaveDelayMs={3000}
      sidebarActions={<TranslateWorkflowActions user={user} />}
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

const SAVE_STATUS_META: Record<'unsaved' | 'saving' | 'error', { icon: LucideIcon; label: string; spin?: boolean }> = {
  saving: { icon: Loader2, label: 'Saving...', spin: true },
  unsaved: { icon: Save, label: 'Save' },
  error: { icon: CloudOff, label: 'Save failed' },
};

/**
 * The save button and the saved state, in one slot.
 *
 * They used to be two controls — a "Saved" badge that never said when, next to
 * a button that was often a no-op. Autosave flips this pair several times a
 * minute while someone types, so the slot holds its width and the change is
 * instant colour and text, no motion: a toolbar that twitches on every autosave
 * is worse than one that says less.
 */
function SaveControl({
  status,
  lastSavedAt,
  onSave,
  disabled,
}: {
  status: 'saved' | 'unsaved' | 'saving' | 'error';
  lastSavedAt: Date | null;
  onSave: () => void;
  disabled?: boolean;
}) {
  // The two states swap on every autosave, so they must measure the same: the
  // button and the chip below carry the same label length and padding for that
  // reason, not by accident.
  const slot = 'h-8 min-w-20 px-3';

  if (status === 'saved') {
    const time = lastSavedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return (
      <span
        className={cn(slot, 'inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground')}
        title={time ? `All changes saved at ${time}` : 'All changes saved'}
      >
        <CloudCheck className="size-3.5 text-success" />
        <span className="tabular-nums">Saved</span>
      </span>
    );
  }

  const meta = SAVE_STATUS_META[status];
  const Icon = meta.icon;
  const isError = status === 'error';

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onSave}
      disabled={disabled || status === 'saving'}
      className={cn(slot, 'gap-1.5', isError && 'border-destructive/40 text-destructive')}
      title={isError ? 'The last save failed — save again' : 'Save now'}
    >
      <Icon className={cn(meta.spin && 'animate-spin')} />
      {meta.label}
    </Button>
  );
}

function TranslateToolbar({
  document,
  targetLanguageId,
  zenMode,
  setZenMode,
}: {
  document: any;
  targetLanguageId: string;
  zenMode: boolean;
  setZenMode: (zen: boolean) => void;
}) {
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const saveContent = useEditorStore((s) => s.saveContent);
  const isAnyLoading = useEditorStore((s) => s.isAnyLoading());
  const saveStatus = useEditorStore((s) => s.saveStatus());
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);

  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await saveContent();
    } catch {
      // The store has already toasted it; the control shows the failed state.
    } finally {
      setLoading(false);
    }
  };

  const busy = loading || isAnyLoading;

  // ─── Header actions ───────────────────────────────────────────
  // Both headers render this same node: the only thing that differs between
  // zen and the default view is the toggle that leaves it, which is why the two
  // rows no longer drift apart. Status, submit and delete live in the Document
  // info panel — they act on the document, not on the view.
  const headerActions = targetVersion ? (
    targetVersion.status !== DocumentStatus.PENDING_TRANSLATION ? (
      <>
        <SaveControl status={saveStatus} lastSavedAt={lastSavedAt} onSave={handleSave} disabled={busy} />
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => {
            capture('zen_mode_toggled', { enabled: !zenMode });
            setZenMode(!zenMode);
          }}
          aria-label={zenMode ? 'Exit zen mode' : 'Zen mode'}
          title={zenMode ? 'Exit zen mode (Esc)' : 'Zen mode (F11)'}
        >
          {zenMode ? <Minimize2 /> : <Maximize2 />}
        </Button>
      </>
    ) : null
  ) : targetLanguageId ? null : (
    <span className="text-sm text-muted-foreground">
      Please select a target language from the documents page to start translating.
    </span>
  );

  if (zenMode) {
    return (
      <div className="flex items-center justify-between gap-3 border-b bg-background px-3 py-2">
        <div className="min-w-0 truncate text-sm">
          {document.title} <span className="text-muted-foreground">· Zen mode</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
      </div>
    );
  }

  return <DocumentEditorHeader document={document} actions={headerActions} />;
}

// ──────────────────────────────────────────────────────────────────────
// Workflow actions — rendered by the editor inside the Document info panel,
// beside the fields they move: submit to review, delete the version.
// ──────────────────────────────────────────────────────────────────────

function TranslateWorkflowActions({ user }: { user: SessionUser }) {
  const router = useRouter();
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const setTargetVersion = useEditorStore((s) => s.setTargetVersion);
  const setContent = useEditorStore((s) => s.setContent);
  const isAnyLoading = useEditorStore((s) => s.isAnyLoading());
  const openReviewDialog = useEditorStore((s) => s.openReviewDialog);
  const translateWithAi = useEditorStore((s) => s.translateWithAi);
  const aiTranslating = useEditorStore((s) => s.isLoading('aiTranslate'));
  const [deleting, setDeleting] = useState(false);

  const handleDeleteTranslation = async () => {
    if (!targetVersion) return;
    setDeleting(true);
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
      setDeleting(false);
    }
  };

  if (!targetVersion) return null;

  const busy = deleting || isAnyLoading;
  const canDelete = targetVersion.status === DocumentStatus.PENDING_TRANSLATION && isAdminClient(user);

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      {targetVersion.status === DocumentStatus.IN_PROGRESS && (
        <Button size="sm" className="w-full" onClick={openReviewDialog} disabled={busy}>
          <Send />
          Submit for review
        </Button>
      )}
      <Button variant="outline" size="sm" className="w-full justify-start" onClick={translateWithAi} disabled={busy}>
        {aiTranslating ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {aiTranslating ? 'Translating…' : 'AI translate'}
      </Button>
      <MarkdownGuide variant="button" />
      {canDelete && (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" size="sm" className="w-full" disabled={busy} />}>
            <Trash2 />
            Delete translation
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
    </div>
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
            <User className="h-4 w-4 text-info" />
            <span className="text-foreground">
              Assigned to: <span className="font-medium">{version.user.name}</span>
            </span>
          </>
        ) : (
          <>
            <AlertCircle className="h-4 w-4 text-info" />
            <span className="text-info font-medium">Unassigned (visible to all project members)</span>
          </>
        )}
        {version.deadline && (
          <>
            <span className="text-muted-foreground">•</span>
            <Calendar className="h-4 w-4 text-info" />
            <span className="text-foreground">
              Deadline: <span className="font-medium">{new Date(version.deadline).toLocaleDateString()}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
