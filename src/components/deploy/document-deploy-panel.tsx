'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { GitCommitHorizontal, Loader2 } from 'lucide-react';
import { SidebarSection } from '@/components/sidebar-section';
import { Button } from '@/components/ui/button';
import { DocumentStatus } from '@/generated/prisma/enums';
import { listDeploymentsAction } from '@/domain/deployment/deployment.actions';
import type { DeploymentView } from '@/domain/deployment/deployment.types';
import { formatRelativeTime } from '@/lib/relative-time';
import { useEditorStoreApi } from '@/lib/stores/editor-provider';
import { DeploymentHistory } from './deployment-history';
import { useDeploy, useRetryDeployment } from './use-deploy';

/** How often the history is read again while one of its deploys is still running. */
const RUNNING_REFRESH_MS = 3000;

const isRunning = (deployment: DeploymentView | undefined) =>
  deployment?.status === 'QUEUED' || deployment?.status === 'PUBLISHING';

/** Whether a deploy put this version out: it succeeded, or failed only on other documents. */
function deployedHere(view: DeploymentView | null, versionId: string): boolean {
  const item = view?.items.find((candidate) => candidate.documentVersionId === versionId);
  return item?.outcome === 'PUBLISHED' || item?.outcome === 'UNCHANGED' || item?.outcome === 'NOT_PUBLISHED';
}

const noSubscription = () => () => {};

/**
 * Deploying one document from its editor: Deploy once it is approved,
 * Redeploy once it is out, and every deploy it was part of below.
 *
 * Inside the editor the status comes from the editor's store, so the panel
 * follows an approval made on the page, and a deploy that finishes, from here,
 * from a retry or on approval, moves the editor's status to Deployed. While a
 * deploy is running the history is read again until it ends.
 *
 * `compact` is the one-line row in the sidebar summary; the full section sits
 * with the audio and the activity log.
 */
export function DocumentDeployPanel({
  documentVersionId,
  status,
  canDeploy,
  compact = false,
}: {
  documentVersionId: string;
  status: DocumentStatus;
  canDeploy: boolean;
  compact?: boolean;
}) {
  const editor = useEditorStoreApi();
  const editorStatus = useSyncExternalStore(
    editor?.subscribe ?? noSubscription,
    () => {
      const version = editor?.getState().targetVersion;
      return version?.id === documentVersionId ? (version.status as DocumentStatus) : undefined;
    },
    () => undefined,
  );
  const currentStatus = editorStatus ?? status;
  const deployable = currentStatus === DocumentStatus.APPROVED || currentStatus === DocumentStatus.DEPLOYED;
  const [history, setHistory] = useState<DeploymentView[] | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  /** Tells the editor once a deploy has put this version out. */
  const markDeployed = useCallback(
    (view: DeploymentView | null) => {
      if (!editor || !deployedHere(view, documentVersionId)) return;
      const version = editor.getState().targetVersion;
      if (version?.id === documentVersionId && version.status === DocumentStatus.APPROVED) {
        editor.getState().handleStatusChange(DocumentStatus.DEPLOYED);
      }
    },
    [editor, documentVersionId],
  );

  // Deploys seen running, so the one that ends while the page is open moves the
  // status; an old deploy in the history never does (the version may have been
  // taken back to Approved since).
  const seenRunning = useRef(new Set<string>());
  const load = useCallback(async () => {
    let deployments: DeploymentView[];
    try {
      deployments = await listDeploymentsAction({ documentVersionId });
    } catch (error) {
      console.error('[DocumentDeployPanel] Could not load deploy history:', error);
      deployments = [];
    }
    for (const deployment of deployments) {
      if (isRunning(deployment)) seenRunning.current.add(deployment.id);
      else if (seenRunning.current.delete(deployment.id)) markDeployed(deployment);
    }
    setHistory(deployments);
  }, [documentVersionId, markDeployed]);

  useEffect(() => {
    if (deployable) void load();
  }, [deployable, load]);

  const latest = history?.[0] ?? null;
  const running = isRunning(latest ?? undefined);
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => void load(), RUNNING_REFRESH_MS);
    return () => clearTimeout(timer);
  }, [running, history, load]);

  const onFinished = (view: DeploymentView | null) => {
    markDeployed(view);
    void load();
  };
  const { requestDeploy, dialog } = useDeploy({ onFinished });
  const retry = useRetryDeployment(onFinished);

  if (!deployable) return null;

  const redeploy = currentStatus === DocumentStatus.DEPLOYED;

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GitCommitHorizontal className="size-3.5" aria-hidden />
          Deploy
        </span>
        <span className="text-xs font-medium">
          {history === null ? (
            <Loader2 className="size-3 animate-spin text-muted-foreground" aria-label="Loading" />
          ) : !latest ? (
            <span className="text-muted-foreground">Not deployed yet</span>
          ) : running ? (
            <span>Deploying…</span>
          ) : latest.status === 'FAILED' ? (
            <span className="text-destructive">Last deploy failed</span>
          ) : (
            <span>Deployed {formatRelativeTime(new Date(latest.createdAt))}</span>
          )}
        </span>
      </div>
    );
  }

  return (
    <SidebarSection
      title="Deploy"
      action={
        canDeploy ? (
          <Button
            size="xs"
            variant={redeploy ? 'outline' : 'default'}
            disabled={running}
            onClick={async () => {
              // Show the queued deploy at once; the toast follows it from there.
              if (await requestDeploy({ versionIds: [documentVersionId], redeploy, via: 'document' })) void load();
            }}
          >
            {running ? <Loader2 className="animate-spin" aria-hidden /> : <GitCommitHorizontal aria-hidden />}
            {running ? 'Deploying…' : redeploy ? 'Redeploy' : 'Deploy'}
          </Button>
        ) : undefined
      }
    >
      {history === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading deploys…
        </p>
      ) : (
        <DeploymentHistory
          deployments={history}
          documentVersionId={documentVersionId}
          canRetry={canDeploy}
          retryingId={retryingId}
          onRetry={(id) => {
            setRetryingId(id);
            void retry(id).finally(() => setRetryingId(null));
          }}
          emptyText={
            canDeploy
              ? 'Approved and not deployed yet. Deploy publishes it to GitHub.'
              : 'Approved and not deployed yet. Anyone on this language team can deploy it.'
          }
        />
      )}
      {dialog}
    </SidebarSection>
  );
}
