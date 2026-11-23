'use client';

import type { ComponentProps } from 'react';
import Link from 'next/link';
import { ChevronRight, ExternalLink, Loader2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { DeploymentItemView, DeploymentView } from '@/domain/deployment/deployment.types';
import { formatRelativeTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';

/**
 * Deploy history: who deployed what, when, how it went, and the commit. Used
 * on a document, a project, a language and the Deploys page, so every one
 * reads the same. A failed deploy offers Retry to people who may deploy it.
 */

type BadgeProps = ComponentProps<typeof Badge>;

const STATUS_BADGE: Record<DeploymentView['status'], { label: string; variant: BadgeProps['variant'] }> = {
  QUEUED: { label: 'Queued', variant: 'secondary' },
  PUBLISHING: { label: 'Deploying', variant: 'secondary' },
  SUCCEEDED: { label: 'Deployed', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'destructive' },
};

const TRIGGER_LABEL: Record<DeploymentView['trigger'], string | null> = {
  MANUAL: null,
  REDEPLOY: 'Redeploy',
  RETRY: 'Retry',
  AUTO: 'On approval',
};

export const OUTCOME_LABEL: Record<DeploymentItemView['outcome'], string> = {
  PENDING: 'Not sent',
  PUBLISHED: 'Published',
  UNCHANGED: 'Up to date',
  NOT_PUBLISHED: 'Not published',
  SKIPPED: 'Skipped',
  FAILED: 'Failed',
};

const OUTCOME_CLASS: Record<DeploymentItemView['outcome'], string> = {
  PENDING: 'text-muted-foreground',
  PUBLISHED: 'text-success',
  UNCHANGED: 'text-muted-foreground',
  NOT_PUBLISHED: 'text-muted-foreground',
  SKIPPED: 'text-muted-foreground',
  FAILED: 'text-destructive',
};

/** "2 published, 1 up to date": the outcomes a batch had, largest first. */
export function summarizeOutcomes(view: DeploymentView): string {
  return (Object.entries(view.counts) as [DeploymentItemView['outcome'], number][])
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([outcome, count]) => `${count} ${OUTCOME_LABEL[outcome].toLowerCase()}`)
    .join(', ');
}

export function DeploymentHistory({
  deployments,
  canRetry,
  onRetry,
  retryingId,
  documentScope = false,
  emptyText = 'Nothing has been deployed yet.',
  className,
}: {
  deployments: DeploymentView[];
  /** Whether the viewer may deploy these documents, and so retry a failure. */
  canRetry: boolean;
  onRetry: (deploymentId: string) => void;
  retryingId?: string | null;
  /** On one document's page the rows describe that document, so the document list is left out. */
  documentScope?: boolean;
  emptyText?: string;
  className?: string;
}) {
  if (deployments.length === 0) {
    return <p className={cn('text-sm text-muted-foreground', className)}>{emptyText}</p>;
  }

  // A failure that a later deploy already retried is history, not something to act on.
  const retried = new Set(deployments.map((deployment) => deployment.retryOfId).filter(Boolean));

  return (
    <ol className={cn('divide-y', className)} aria-label="Deploy history">
      {deployments.map((deployment) => (
        <DeploymentRow
          key={deployment.id}
          deployment={deployment}
          documentScope={documentScope}
          retry={
            canRetry && deployment.status === 'FAILED' && !retried.has(deployment.id)
              ? { onRetry, busy: retryingId === deployment.id }
              : null
          }
        />
      ))}
    </ol>
  );
}

function DeploymentRow({
  deployment,
  documentScope,
  retry,
}: {
  deployment: DeploymentView;
  documentScope: boolean;
  retry: { onRetry: (id: string) => void; busy: boolean } | null;
}) {
  const badge = STATUS_BADGE[deployment.status];
  const trigger = TRIGGER_LABEL[deployment.trigger];
  const running = deployment.status === 'QUEUED' || deployment.status === 'PUBLISHING';
  const createdAt = new Date(deployment.createdAt);
  const who = deployment.requestedBy?.name ?? 'A former member';
  const only = documentScope ? deployment.items[0] : null;
  const what = only ? OUTCOME_LABEL[only.outcome] : summarizeOutcomes(deployment);
  const scope = [deployment.sourceProject?.name, deployment.language?.name].filter(Boolean).join(' · ');

  return (
    <li className="space-y-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Badge variant={badge.variant}>
            {running && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />}
            {badge.label}
          </Badge>
          {trigger && <span className="text-xs text-muted-foreground">{trigger}</span>}
        </div>
        <time
          dateTime={deployment.createdAt}
          title={createdAt.toLocaleString()}
          className="shrink-0 text-xs text-muted-foreground tabular-nums"
        >
          {formatRelativeTime(createdAt)}
        </time>
      </div>

      <p className="text-sm text-pretty">
        <span className="font-medium">{who}</span>
        {!documentScope && scope && <span className="text-muted-foreground"> · {scope}</span>}
        {what && <span className="text-muted-foreground"> · {what}</span>}
      </p>

      {(deployment.commitSha || deployment.error || (only?.error && only.outcome !== 'PUBLISHED')) && (
        <div className="space-y-1 text-xs">
          {deployment.commitSha && (
            <CommitLink sha={deployment.commitSha} url={deployment.commitUrl} branch={deployment.branch} />
          )}
          {deployment.error && <p className="text-destructive text-pretty">{deployment.error}</p>}
          {!deployment.error && only?.error && <p className="text-muted-foreground text-pretty">{only.error}</p>}
        </div>
      )}

      {!documentScope && deployment.items.length > 0 && <DeploymentItems items={deployment.items} />}

      {retry && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => retry.onRetry(deployment.id)}
          disabled={retry.busy}
          aria-label={`Retry the deploy from ${formatRelativeTime(createdAt)}`}
        >
          {retry.busy ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
          {retry.busy ? 'Retrying…' : 'Retry'}
        </Button>
      )}
    </li>
  );
}

function CommitLink({ sha, url, branch }: { sha: string; url: string | null; branch: string | null }) {
  const short = <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{sha.slice(0, 7)}</code>;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
      <span>Commit</span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
        >
          {short}
          <ExternalLink className="size-3" aria-hidden />
          <span className="sr-only">(opens GitHub)</span>
        </a>
      ) : (
        short
      )}
      {branch && <span>on {branch}</span>}
    </p>
  );
}

function DeploymentItems({ items }: { items: DeploymentItemView[] }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
        <ChevronRight
          className="size-3.5 transition-[rotate] duration-150 group-data-[panel-open]:rotate-90 motion-reduce:transition-none"
          aria-hidden
        />
        {items.length === 1 ? '1 document' : `${items.length} documents`}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1.5 space-y-1 border-s ps-3">
          {items.map((item) => (
            <li key={item.id} className="text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <Link href={item.href} className="min-w-0 truncate underline-offset-4 hover:underline" title={item.title}>
                  {item.title}
                  <span className="text-muted-foreground"> · {item.languageName}</span>
                </Link>
                <span className={cn('shrink-0', OUTCOME_CLASS[item.outcome])}>{OUTCOME_LABEL[item.outcome]}</span>
              </div>
              {item.error && item.outcome !== 'PUBLISHED' && (
                <p className="mt-0.5 text-muted-foreground text-pretty">{item.error}</p>
              )}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
