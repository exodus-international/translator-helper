'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, GitCommitHorizontal, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  deployScopeAction,
  deployVersionsAction,
  getDeploymentAction,
  previewDeployAction,
  retryDeploymentAction,
} from '@/domain/deployment/deployment.actions';
import type { DeployPreview, DeployScope, DeploymentView, DeployStarted } from '@/domain/deployment/deployment.types';
import { isRefusal, type Refusal } from '@/lib/action-refusal';
import { capture } from '@/lib/analytics';
import { defaultDeployFeedbackDeps, followDeployment, retryAndFollow } from './deploy-feedback';

/**
 * One way to deploy, from anywhere: the document, the board, a project, a
 * language. `requestDeploy` asks the server what would go out, shows that in
 * a confirmation, and on "Deploy" queues it and follows it in a toast.
 *
 * Resolves true once the deploy is queued, false when the person cancels or
 * the server refuses, so a caller that moved something optimistically (the
 * board) knows to put it back.
 */

type DeployRequest =
  | { versionIds: string[]; redeploy?: boolean; via: DeployVia }
  | { scope: DeployScope; via: DeployVia };

export type DeployVia = 'document' | 'status_menu' | 'kanban_dnd' | 'project' | 'language' | 'deploys_page';

interface DialogState {
  request: DeployRequest;
  preview: DeployPreview | null;
  starting: boolean;
}

/** The server actions a deploy calls; a test hands in fakes. */
export interface DeployActions {
  preview: typeof previewDeployAction;
  deployVersions: typeof deployVersionsAction;
  deployScope: typeof deployScopeAction;
  getDeployment: typeof getDeploymentAction;
  retry: typeof retryDeploymentAction;
}

export const DEPLOY_ACTIONS: DeployActions = {
  preview: previewDeployAction,
  deployVersions: deployVersionsAction,
  deployScope: deployScopeAction,
  getDeployment: getDeploymentAction,
  retry: retryDeploymentAction,
};

const defaultFeedbackDeps = defaultDeployFeedbackDeps(DEPLOY_ACTIONS);

function useFeedbackDeps(actions: DeployActions) {
  return useMemo(
    () => (actions === DEPLOY_ACTIONS ? defaultFeedbackDeps : defaultDeployFeedbackDeps(actions)),
    [actions],
  );
}

/** Follows a deploy something else started, such as approval with auto-deploy on. */
export function useFollowDeployment(actions: DeployActions = DEPLOY_ACTIONS) {
  const router = useRouter();
  const deps = useFeedbackDeps(actions);
  return useCallback(
    (deploymentId: string, label: string) =>
      followDeployment({ deploymentId, joined: false }, { label, onFinished: () => router.refresh() }, deps),
    [router, deps],
  );
}

/** Sends a failed deploy's documents again, and follows the new one. */
export function useRetryDeployment(
  onFinished?: (view: DeploymentView | null) => void,
  actions: DeployActions = DEPLOY_ACTIONS,
) {
  const router = useRouter();
  const deps = useFeedbackDeps(actions);
  return useCallback(
    (deploymentId: string) => {
      capture('deploy_retried', { deploymentId });
      return retryAndFollow(
        deploymentId,
        {
          label: 'the documents again',
          onFinished: (view) => {
            router.refresh();
            onFinished?.(view);
          },
        },
        deps,
      );
    },
    [router, onFinished, deps],
  );
}

export function useDeploy(
  options: { onFinished?: (view: DeploymentView | null) => void; actions?: DeployActions } = {},
) {
  const router = useRouter();
  const actions = options.actions ?? DEPLOY_ACTIONS;
  const deps = useFeedbackDeps(actions);
  const [state, setState] = useState<DialogState | null>(null);
  const resolver = useRef<((started: boolean) => void) | null>(null);
  const onFinished = useRef(options.onFinished);
  useEffect(() => {
    onFinished.current = options.onFinished;
  });

  const settle = useCallback((started: boolean) => {
    resolver.current?.(started);
    resolver.current = null;
    setState(null);
  }, []);

  const requestDeploy = useCallback(
    async (request: DeployRequest): Promise<boolean> => {
      resolver.current?.(false);
      setState({ request, preview: null, starting: false });
      const settled = new Promise<boolean>((resolve) => {
        resolver.current = resolve;
      });

      let preview: DeployPreview | Refusal;
      try {
        preview = await actions.preview('versionIds' in request ? { versionIds: request.versionIds } : { scope: request.scope });
      } catch (error) {
        toast.error('Could not prepare this deploy', { description: error instanceof Error ? error.message : undefined });
        settle(false);
        return settled;
      }
      if (isRefusal(preview)) {
        toast.error(preview.refused.message);
        settle(false);
        return settled;
      }
      const ready = preview;
      setState((current) => (current?.request === request ? { ...current, preview: ready } : current));
      return settled;
    },
    [settle, actions],
  );

  const confirm = async () => {
    if (!state?.preview) return;
    const { request, preview } = state;
    setState({ ...state, starting: true });

    let started: DeployStarted | Refusal;
    try {
      started =
        'versionIds' in request
          ? await actions.deployVersions({ versionIds: request.versionIds, redeploy: request.redeploy })
          : await actions.deployScope(request.scope);
    } catch (error) {
      toast.error('Could not start the deploy', { description: error instanceof Error ? error.message : undefined });
      setState((current) => (current ? { ...current, starting: false } : current));
      return;
    }
    if (isRefusal(started)) {
      toast.error(started.refused.message);
      settle(false);
      return;
    }

    capture('deploy_started', { via: request.via, documents: preview.documents.length });
    settle(true);
    void followDeployment(
      started,
      {
        label: deployLabel(preview),
        onFinished: (view) => {
          router.refresh();
          onFinished.current?.(view);
        },
      },
      deps,
    );
  };

  const dialog = (
    <AlertDialog open={state !== null} onOpenChange={(open) => !open && !state?.starting && settle(false)}>
      <AlertDialogContent>
        {state && <DeployDialogBody state={state} onConfirm={confirm} />}
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestDeploy, dialog };
}

/** "Day 1" for one document, "3 documents" for a batch. */
function deployLabel(preview: DeployPreview): string {
  const [first] = preview.documents;
  return preview.documents.length === 1 && first ? `"${first.title}"` : `${preview.documents.length} documents`;
}

function DeployDialogBody({ state, onConfirm }: { state: DialogState; onConfirm: () => void }) {
  const { preview, starting, request } = state;

  if (!preview) {
    return (
      <>
        <AlertDialogHeader>
          <AlertDialogTitle>Preparing the deploy</AlertDialogTitle>
          <AlertDialogDescription>Checking what would go out.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button disabled>Deploy</Button>
        </AlertDialogFooter>
      </>
    );
  }

  const count = preview.documents.length;
  if (count === 0) {
    return (
      <>
        <AlertDialogHeader>
          <AlertDialogTitle>Nothing to deploy</AlertDialogTitle>
          <AlertDialogDescription>
            No approved documents are waiting here. A document can be deployed once it is approved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </>
    );
  }

  const redeploy =
    ('versionIds' in request && request.redeploy) || preview.documents.every((document) => document.status === 'DEPLOYED');
  const verb = redeploy ? 'Redeploy' : 'Deploy';
  const [only] = preview.documents;
  const title = count === 1 ? `${verb} "${only.title}"?` : `${verb} ${count} documents?`;
  const publishing = preview.target ? count - preview.notPublished : 0;

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>
          {preview.target ? (
            <>
              {publishing > 0 ? (
                <>
                  Publishes to <span className="font-medium text-foreground">{preview.target.repository}</span> on{' '}
                  <span className="font-medium text-foreground">{preview.target.branch}</span> in one commit. Files that
                  have not changed are left as they are.
                </>
              ) : (
                <>Nothing here publishes to GitHub. The documents are marked Deployed.</>
              )}
            </>
          ) : (
            <>GitHub is not set up for this app, so the documents are marked Deployed without publishing.</>
          )}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {count > 1 && (
        <ScrollArea className="max-h-48 rounded-md border">
          <ul className="divide-y text-sm">
            {preview.documents.map((document) => (
              <li key={document.id} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                <span className="min-w-0 truncate" title={document.title}>
                  {document.title}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{document.languageName}</span>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}

      <DeployNotes preview={preview} />

      <AlertDialogFooter>
        <AlertDialogCancel disabled={starting}>Cancel</AlertDialogCancel>
        <Button onClick={onConfirm} disabled={starting}>
          {starting ? <Loader2 className="animate-spin" aria-hidden /> : <GitCommitHorizontal aria-hidden />}
          {starting ? 'Starting…' : count === 1 ? verb : `${verb} ${count}`}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

/** What the person should know before sending: each note says what happens, not only what is wrong. */
function DeployNotes({ preview }: { preview: DeployPreview }) {
  const notes: { key: string; warn: boolean; text: string }[] = [];
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

  if (preview.audioNotReady > 0) {
    notes.push({
      key: 'audio',
      warn: true,
      text: `${preview.audioNotReady} ${plural(preview.audioNotReady, 'document has', 'documents have')} no up-to-date audio. ${plural(preview.audioNotReady, 'It goes', 'They go')} out without an audio link, and the audio can be generated later.`,
    });
  }
  if (preview.audioUnchecked > 0) {
    notes.push({
      key: 'audio-unchecked',
      warn: true,
      text: `${preview.audioUnchecked} more ${plural(preview.audioUnchecked, 'was', 'were')} not checked for audio. ${plural(preview.audioUnchecked, 'If it has', 'Any that have')} no up-to-date audio ${plural(preview.audioUnchecked, 'goes', 'go')} out without an audio link.`,
    });
  }
  if (preview.target && preview.notPublished > 0 && preview.notPublished < preview.documents.length) {
    notes.push({
      key: 'not-published',
      warn: false,
      text: `${preview.notPublished} ${plural(preview.notPublished, 'is', 'are')} in a project with no repository directory: marked Deployed, not published.`,
    });
  }
  if (preview.alreadyRunning > 0) {
    notes.push({
      key: 'running',
      warn: false,
      text: `${preview.alreadyRunning} ${plural(preview.alreadyRunning, 'is', 'are')} already deploying and ${plural(preview.alreadyRunning, 'stays', 'stay')} with that deploy.`,
    });
  }
  if (notes.length === 0) return null;

  return (
    <ul className="space-y-2 text-sm">
      {notes.map((note) => (
        <li key={note.key} className="flex gap-2">
          {note.warn ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="text-pretty">{note.text}</span>
        </li>
      ))}
    </ul>
  );
}
