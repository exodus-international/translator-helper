'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  getAutoTranslationAction,
  retryAutoTranslationAction,
  setAutoTranslateAction,
  type AutoTranslationState,
} from '@/domain/auto-translation/auto-translation.actions';
import { buildDocumentPath } from '@/domain/document/document-url';
import { isRefusal } from '@/lib/action-refusal';
import { capture } from '@/lib/analytics';

/** How often the card asks for progress: while drafting, and while on with nothing queued. */
const POLL_MS = { busy: 3000, idle: 15_000 };

export interface ProjectAutoTranslationLoaders {
  load: typeof getAutoTranslationAction;
  setEnabled: typeof setAutoTranslateAction;
  retry: typeof retryAutoTranslationAction;
}

const serverLoaders: ProjectAutoTranslationLoaders = {
  load: getAutoTranslationAction,
  setEnabled: setAutoTranslateAction,
  retry: retryAutoTranslationAction,
};

interface ProjectAutoTranslationProps {
  translationProjectId: string;
  languageName: string;
  languageCode: string;
  projectSlug: string;
  /** The language's project manager, or an administrator: may turn it on or off and retry. */
  canManage: boolean;
  /** Called when more drafts have landed, so the board below can reload. */
  onDraftsWritten?: () => void;
  loaders?: ProjectAutoTranslationLoaders;
  pollMs?: { busy: number; idle: number };
}

function documents(count: number) {
  return `${count} ${count === 1 ? 'document' : 'documents'}`;
}

/**
 * The AI translation setting of one language's translation project, on the
 * project page: the switch for its manager, and while drafts are being written,
 * how far along they are and which documents failed.
 */
export default function ProjectAutoTranslation({
  translationProjectId,
  languageName,
  languageCode,
  projectSlug,
  canManage,
  onDraftsWritten,
  loaders = serverLoaders,
  pollMs = POLL_MS,
}: ProjectAutoTranslationProps) {
  const [state, setState] = useState<AutoTranslationState | null>(null);
  const [confirming, setConfirming] = useState<'on' | 'off' | null>(null);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const succeeded = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await loaders.load(translationProjectId);
      if (!next || next.translationProjectId !== translationProjectId) return;
      setState(next);
      if (succeeded.current !== null && next.progress.succeeded > succeeded.current) onDraftsWritten?.();
      succeeded.current = next.progress.succeeded;
    } catch (error) {
      console.error('[AutoTranslation] Could not load progress:', error);
    }
  }, [loaders, translationProjectId, onDraftsWritten]);

  useEffect(() => {
    setState(null);
    succeeded.current = null;
    void refresh();
  }, [refresh]);

  const open = state ? state.progress.queued + state.progress.running : 0;
  const watching = state?.enabled ?? false;

  // Quick while drafts are being written; slower while the setting is on and
  // the queue is empty, so a document added later shows up without a reload.
  useEffect(() => {
    const every = open > 0 ? pollMs.busy : watching ? pollMs.idle : null;
    if (every === null) return;
    const timer = setInterval(() => void refresh(), every);
    return () => clearInterval(timer);
  }, [open, watching, refresh, pollMs.busy, pollMs.idle]);

  if (!state) return null;

  const { enabled, candidates, progress } = state;
  const total = progress.succeeded + progress.queued + progress.running + progress.failed;
  const hasRun = total > 0;

  // Someone who cannot change the setting has nothing to see while it is off
  // and nothing was ever drafted.
  if (!canManage && !enabled && !hasRun) return null;

  async function setEnabled(next: boolean) {
    setSaving(true);
    try {
      const result = await loaders.setEnabled({ translationProjectId, enabled: next });
      capture('auto_translation_toggled', { enabled: next, language: languageCode, queued: result.queued });
      if (next) {
        toast.success(
          result.queued > 0
            ? `Drafting ${documents(result.queued)} in ${languageName}`
            : `AI translation is on for ${languageName}`,
        );
      } else {
        toast.success(`AI translation is off for ${languageName}`);
      }
      await refresh();
    } catch (error) {
      console.error('[AutoTranslation] Could not change the setting:', error);
      toast.error('Could not change the AI translation setting. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function retry(jobId?: string) {
    setRetrying(jobId ?? 'all');
    try {
      const result = await loaders.retry({ translationProjectId, jobId });
      if (isRefusal(result)) {
        toast.error(result.refused.message);
      } else {
        capture('auto_translation_retried', { language: languageCode, queued: result.queued, all: !jobId });
      }
      await refresh();
    } catch (error) {
      console.error('[AutoTranslation] Could not retry:', error);
      toast.error('Could not retry. Try again.');
    } finally {
      setRetrying(null);
    }
  }

  const description = enabled
    ? `The model drafts every ${languageName} document nobody has started, including ones added later, and sends each draft to review.`
    : `Let the model draft every ${languageName} document nobody has started, so your team reviews instead of translating from scratch.`;

  return (
    <Card data-testid="auto-translation-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-info" aria-hidden />
          <span id="auto-translation-title">AI translation</span>
        </CardTitle>
        <CardDescription className="text-pretty">{description}</CardDescription>
        <CardAction className="flex items-center gap-2">
          {canManage ? (
            <Switch
              checked={enabled}
              disabled={saving}
              aria-labelledby="auto-translation-title"
              onCheckedChange={(next) => setConfirming(next ? 'on' : 'off')}
            />
          ) : (
            <Badge variant={enabled ? 'success' : 'secondary'}>{enabled ? 'On' : 'Off'}</Badge>
          )}
        </CardAction>
      </CardHeader>

      {hasRun && (
        <CardContent className="space-y-4">
          <Progress value={total === 0 ? null : (progress.succeeded / total) * 100} className="gap-2">
            <ProgressLabel className="flex items-center gap-2 font-normal tabular-nums">
              {open > 0 && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />}
              <span>
                {progress.succeeded} of {total} translated
              </span>
            </ProgressLabel>
            <span className="ms-auto text-sm text-muted-foreground tabular-nums">
              {open > 0 ? `${open} in the queue` : progress.failed > 0 ? `${progress.failed} failed` : 'Done'}
            </span>
          </Progress>

          {progress.failures.length > 0 && (
            <div className="space-y-2" role="region" aria-label="Failed documents">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {progress.failed === 1 ? '1 document failed' : `${progress.failed} documents failed`}
                </p>
                {canManage && enabled && progress.failures.length > 1 && (
                  <Button size="sm" variant="outline" disabled={retrying !== null} onClick={() => retry()}>
                    <RotateCcw aria-hidden />
                    Retry all
                  </Button>
                )}
              </div>
              <ul className="divide-y rounded-md border">
                {progress.failures.map((failure) => (
                  <li key={failure.id} className="flex items-start gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={buildDocumentPath({
                          projectSlug,
                          slug: failure.document.slug,
                          languageCode,
                          documentId: failure.document.id,
                        })}
                        className="block truncate text-sm font-medium hover:underline"
                        title={failure.document.title}
                      >
                        {failure.document.title}
                      </Link>
                      {failure.error && (
                        <p className="text-xs text-muted-foreground break-words line-clamp-2" title={failure.error}>
                          {failure.error}
                        </p>
                      )}
                    </div>
                    {canManage && enabled && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={retrying !== null}
                        onClick={() => retry(failure.id)}
                        aria-label={`Retry ${failure.document.title}`}
                      >
                        <RotateCcw aria-hidden />
                        Retry
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {!enabled && (
                <p className="text-xs text-muted-foreground">Turn AI translation on to retry these documents.</p>
              )}
            </div>
          )}
        </CardContent>
      )}

      <AlertDialog open={confirming !== null} onOpenChange={(isOpen) => !isOpen && setConfirming(null)}>
        <AlertDialogContent>
          {confirming === 'on' ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Turn on AI translation for {languageName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  {candidates > 0
                    ? `The model will draft ${documents(candidates)} that nobody has started and send each one straight to review.`
                    : 'Nothing is waiting to be translated right now.'}{' '}
                  Documents added to this project later are drafted too. Work someone has already started is left
                  alone. Reviewers, editors and project managers can edit the drafts directly in review.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className={buttonVariants({ variant: 'default' })}
                  onClick={() => void setEnabled(true)}
                >
                  {candidates > 0 ? `Translate ${documents(candidates)}` : 'Turn on'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Turn off AI translation for {languageName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  {open > 0
                    ? `${documents(open)} still in the queue will not be drafted and stay with your team to translate. `
                    : ''}
                  Drafts already in review keep their text, but reviewers go back to leaving suggestions instead of
                  editing directly. You can turn it on again at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void setEnabled(false)}>Turn off</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
