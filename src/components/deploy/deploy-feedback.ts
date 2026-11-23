import { DeploymentStatus } from '@/generated/prisma/enums';
import type { DeploymentView, DeployStarted } from '@/domain/deployment/deployment.types';
import type { Refusal } from '@/lib/action-refusal';
import { isRefusal } from '@/lib/action-refusal';
import { toast } from 'sonner';

/**
 * What the person sees while a deploy runs and once it ends.
 *
 * A deploy returns as soon as it is queued and publishes after the response,
 * so the page follows it: one toast that reads "Deploying…" until the
 * deployment finishes, then says what happened, with the commit to open or a
 * retry to press. Every place that deploys (the document, the board, a
 * project, a language, auto-deploy after approval) follows through here, so
 * they all say the same thing.
 */

const POLL_INTERVAL_MS = 1500;
/** Past this the toast stops waiting; the deploy still finishes and its history says how. */
export const FOLLOW_LIMIT_MS = 5 * 60 * 1000;

type ToastId = string | number;
type ToastOptions = { id?: ToastId; duration?: number; description?: string; action?: { label: string; onClick: () => void } };

export interface DeployFeedbackDeps {
  toast: {
    loading: (message: string, options?: ToastOptions) => ToastId;
    success: (message: string, options?: ToastOptions) => ToastId;
    error: (message: string, options?: ToastOptions) => ToastId;
    message: (message: string, options?: ToastOptions) => ToastId;
  };
  getDeployment: (id: string) => Promise<DeploymentView | null>;
  retry: (id: string) => Promise<DeployStarted | Refusal>;
  wait: (ms: number) => Promise<void>;
  now: () => number;
  open: (url: string) => void;
}

/** What a finished deployment did, in one sentence. */
export function describeOutcome(view: DeploymentView): { title: string; description?: string } {
  const { counts } = view;
  const total = view.items.length;
  const only = total === 1 ? view.items[0] : null;
  const subject = only ? `"${only.title}"` : `${total} documents`;

  if (view.status === DeploymentStatus.FAILED) {
    const sent = counts.PUBLISHED + counts.UNCHANGED + counts.NOT_PUBLISHED;
    return {
      title: only ? `Could not deploy "${only.title}"` : `${counts.FAILED + counts.PENDING} of ${total} documents were not deployed`,
      description: [view.error, sent > 0 && !only ? `${sent} went out.` : null].filter(Boolean).join(' ') || undefined,
    };
  }

  const notes: string[] = [];
  if (counts.UNCHANGED > 0 && counts.PUBLISHED > 0) notes.push(`${counts.UNCHANGED} already up to date.`);
  if (counts.NOT_PUBLISHED > 0 && counts.NOT_PUBLISHED < total) {
    notes.push(`${counts.NOT_PUBLISHED} marked deployed without publishing: no repository directory.`);
  }
  if (counts.SKIPPED > 0) notes.push(`${counts.SKIPPED} skipped: no longer approved.`);
  const description = notes.join(' ') || undefined;

  if (counts.PUBLISHED > 0) {
    const published = only ? subject : `${counts.PUBLISHED} ${counts.PUBLISHED === 1 ? 'document' : 'documents'}`;
    return { title: `Deployed ${published} to GitHub`, description };
  }
  if (counts.UNCHANGED > 0) {
    return { title: only ? `${subject} is already up to date on GitHub` : `${subject} already up to date on GitHub`, description };
  }
  if (counts.NOT_PUBLISHED > 0) {
    const reason = only?.error ?? view.items.find((item) => item.error)?.error;
    return { title: `Marked ${subject} deployed`, description: reason ?? description };
  }
  return { title: 'Nothing was deployed', description };
}

/**
 * Follows one deployment in a toast until it finishes. Resolves with the
 * finished deployment, or null when it could not be read or ran past the
 * limit; the caller refreshes the page either way.
 */
export async function followDeployment(
  started: DeployStarted,
  options: { label: string; onFinished?: (view: DeploymentView | null) => void },
  deps: DeployFeedbackDeps,
): Promise<DeploymentView | null> {
  if (!started.deploymentId) {
    deps.toast.message('Nothing to deploy', { description: 'No approved documents are waiting here.' });
    options.onFinished?.(null);
    return null;
  }

  const id = deps.toast.loading(started.joined ? `Already deploying ${options.label}…` : `Deploying ${options.label}…`);
  const deadline = deps.now() + FOLLOW_LIMIT_MS;
  let view: DeploymentView | null = null;

  for (;;) {
    try {
      view = await deps.getDeployment(started.deploymentId);
    } catch {
      view = null;
    }
    if (!view) {
      deps.toast.error('Could not follow this deploy', { id, description: 'Open Deploys to see how it ended.' });
      options.onFinished?.(null);
      return null;
    }
    if (view.status === DeploymentStatus.SUCCEEDED || view.status === DeploymentStatus.FAILED) break;
    if (deps.now() > deadline) {
      deps.toast.message('Still deploying', { id, description: 'It carries on without this page. Deploys shows how it ends.' });
      options.onFinished?.(null);
      return null;
    }
    await deps.wait(POLL_INTERVAL_MS);
  }

  const { title, description } = describeOutcome(view);
  if (view.status === DeploymentStatus.SUCCEEDED) {
    const commitUrl = view.commitUrl;
    deps.toast.success(title, {
      id,
      description,
      duration: 8000,
      action: commitUrl ? { label: 'View commit', onClick: () => deps.open(commitUrl) } : undefined,
    });
  } else {
    const failed = view;
    deps.toast.error(title, {
      id,
      description,
      duration: 15000,
      action: {
        label: 'Retry',
        onClick: () => {
          void retryAndFollow(failed.id, options, deps);
        },
      },
    });
  }
  options.onFinished?.(view);
  return view;
}

/** Sends a failed deployment's documents again and follows the new deployment. */
export async function retryAndFollow(
  deploymentId: string,
  options: { label: string; onFinished?: (view: DeploymentView | null) => void },
  deps: DeployFeedbackDeps,
): Promise<DeploymentView | null> {
  let started: DeployStarted | Refusal;
  try {
    started = await deps.retry(deploymentId);
  } catch (error) {
    deps.toast.error('Could not retry this deploy', { description: error instanceof Error ? error.message : undefined });
    return null;
  }
  if (isRefusal(started)) {
    deps.toast.error(started.refused.message);
    return null;
  }
  return followDeployment(started, options, deps);
}

export function defaultDeployFeedbackDeps(actions: {
  getDeployment: DeployFeedbackDeps['getDeployment'];
  retry: DeployFeedbackDeps['retry'];
}): DeployFeedbackDeps {
  return {
    toast,
    ...actions,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    open: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
  };
}
