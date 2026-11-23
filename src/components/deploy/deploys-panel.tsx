'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitCommitHorizontal, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { listDeploymentsAction, setAutoDeployAction } from '@/domain/deployment/deployment.actions';
import type { DeployScope, DeploymentView, HistoryFilter } from '@/domain/deployment/deployment.types';
import { capture } from '@/lib/analytics';
import { DeployHistoryError, DeploymentHistory } from './deployment-history';
import { useDeploy, useRetryDeployment, type DeployVia } from './use-deploy';

/** How often the history is read again while one of its deploys is still running. */
const RUNNING_REFRESH_MS = 3000;

/**
 * Deploys for a project in one language, a whole language, or everything the
 * person may see: "Deploy approved" for that scope, deploy-on-approval where
 * it applies, and the history below. While a deploy in the list is running
 * the list reads itself again, so its row moves on without a reload.
 */
export function DeploysPanel({
  title = 'Deploys',
  description,
  filter,
  scope,
  via,
  canDeploy,
  autoDeploy,
  emptyText,
}: {
  title?: string;
  description: string;
  /** Which deploys the history lists. */
  filter: HistoryFilter;
  /** What "Deploy approved" sends. */
  scope: DeployScope;
  via: DeployVia;
  canDeploy: boolean;
  /** Deploy on approval for one language project; left out where there is none. */
  autoDeploy?: { translationProjectId: string; enabled: boolean; languageName: string } | null;
  emptyText?: string;
}) {
  const filterKey = JSON.stringify(filter);
  // The history is kept with the filter it was read for, so another filter shows the skeleton until its own arrives.
  const [loaded, setLoaded] = useState<{ key: string; deployments: DeploymentView[] | 'failed' } | null>(null);
  const current = loaded?.key === filterKey ? loaded.deployments : null;
  const loadFailed = current === 'failed';
  const history = current === 'failed' ? null : current;
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoaded({ key: filterKey, deployments: await listDeploymentsAction(JSON.parse(filterKey) as HistoryFilter) });
    } catch (error) {
      console.error('[DeploysPanel] Could not load deploy history:', error);
      setLoaded({ key: filterKey, deployments: 'failed' });
    }
  }, [filterKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const running = history?.some((deployment) => deployment.status === 'QUEUED' || deployment.status === 'PUBLISHING');
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => void load(), RUNNING_REFRESH_MS);
    return () => clearTimeout(timer);
  }, [running, history, load]);

  const { requestDeploy, dialog } = useDeploy({ onFinished: () => void load() });
  const retry = useRetryDeployment(() => void load());

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="text-pretty">{description}</CardDescription>
        {canDeploy && (
          <CardAction>
            <Button
              onClick={async () => {
                if (await requestDeploy({ scope, via })) void load();
              }}
            >
              <GitCommitHorizontal aria-hidden />
              Deploy approved
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {autoDeploy && <AutoDeployField key={autoDeploy.translationProjectId} {...autoDeploy} canChange={canDeploy} />}
        {loadFailed ? (
          <DeployHistoryError
            onRetry={() => {
              setLoaded(null);
              void load();
            }}
          />
        ) : history === null ? (
          <div role="status" className="space-y-3">
            <span className="sr-only">Loading deploys…</span>
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <DeploymentHistory
            deployments={history}
            canRetry={canDeploy}
            retryingId={retryingId}
            onRetry={(id, label) => {
              setRetryingId(id);
              void retry(id, label).finally(() => setRetryingId(null));
            }}
            emptyText={emptyText}
          />
        )}
      </CardContent>
      {dialog}
    </Card>
  );
}

function AutoDeployField({
  translationProjectId,
  enabled,
  languageName,
  canChange,
}: {
  translationProjectId: string;
  enabled: boolean;
  languageName: string;
  canChange: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const id = `auto-deploy-${translationProjectId}`;

  const change = async (next: boolean) => {
    setChecked(next);
    setSaving(true);
    try {
      const saved = await setAutoDeployAction({ translationProjectId, enabled: next });
      setChecked(saved.autoDeploy);
      capture('auto_deploy_toggled', { enabled: saved.autoDeploy, translationProjectId });
      toast.success(
        saved.autoDeploy
          ? `${languageName} documents in this project now deploy when they are approved`
          : `${languageName} documents in this project now wait for Deploy`,
      );
      router.refresh();
    } catch (error) {
      setChecked(!next);
      toast.error('Could not change deploy on approval', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Field orientation="horizontal" className="rounded-md border p-3">
      <FieldContent>
        <FieldLabel htmlFor={id}>
          Deploy on approval
          {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />}
        </FieldLabel>
        <FieldDescription>
          Approving a {languageName} document in this project publishes it to GitHub straight away.
          {!canChange && ` Only the ${languageName} team can change this.`}
        </FieldDescription>
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={(next) => void change(next)} disabled={!canChange || saving} />
    </Field>
  );
}
