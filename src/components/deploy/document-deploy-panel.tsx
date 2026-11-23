'use client';

import { useCallback, useEffect, useState } from 'react';
import { GitCommitHorizontal, Loader2 } from 'lucide-react';
import { SidebarSection } from '@/components/sidebar-section';
import { Button } from '@/components/ui/button';
import { DocumentStatus } from '@/generated/prisma/enums';
import { listDeploymentsAction } from '@/domain/deployment/deployment.actions';
import type { DeploymentView } from '@/domain/deployment/deployment.types';
import { formatRelativeTime } from '@/lib/relative-time';
import { DeploymentHistory } from './deployment-history';
import { useDeploy, useRetryDeployment } from './use-deploy';

/**
 * Deploying one document from its editor: Deploy once it is approved,
 * Redeploy once it is out, and every deploy it was part of below.
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
  const deployable = status === DocumentStatus.APPROVED || status === DocumentStatus.DEPLOYED;
  const [history, setHistory] = useState<DeploymentView[] | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setHistory(await listDeploymentsAction({ documentVersionId }));
    } catch (error) {
      console.error('[DocumentDeployPanel] Could not load deploy history:', error);
      setHistory([]);
    }
  }, [documentVersionId]);

  useEffect(() => {
    if (deployable) void load();
  }, [deployable, load]);

  const { requestDeploy, dialog } = useDeploy({ onFinished: () => void load() });
  const retry = useRetryDeployment(() => void load());

  if (!deployable) return null;

  const latest = history?.[0] ?? null;
  const running = latest?.status === 'QUEUED' || latest?.status === 'PUBLISHING';
  const redeploy = status === DocumentStatus.DEPLOYED;

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
          documentScope
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
