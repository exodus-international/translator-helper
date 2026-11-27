'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AudioLines,
  CheckCircle2,
  Circle,
  CircleDot,
  Loader2,
  MessageSquare,
  RotateCcw,
  Sparkles,
  ThumbsUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import {
  approveTextAction,
  getTextApprovalsAction,
  retryAiStepAction,
  withdrawTextApprovalAction,
} from '@/domain/ai-workflow/ai-workflow.actions';
import { AI_USER_ID } from '@/domain/ai-workflow/ai-workflow.rules';
import {
  AI_ACTOR_LABEL,
  aiWorkflowSteps,
  type AiStepActor,
  type AiStepId,
  type AiStepState,
} from '@/domain/ai-workflow/ai-workflow.steps';
import { updateDocumentVersionStatusAction } from '@/domain/document-version/document-version.actions';
import { withStatusChangeFeedback } from '@/components/status-change-feedback';
import { DocumentStatus, SuggestionStatus, TranslationWorkflow } from '@/generated/prisma/enums';
import { isRefusal } from '@/lib/action-refusal';
import { capture } from '@/lib/analytics';
import { SessionUser } from '@/lib/session';
import { useEditorStore } from '@/lib/stores/editor-provider';
import { cn } from '@/lib/utils';

interface Approvals {
  required: number;
  approvals: { user: { id: string; name: string; email: string; image: string | null }; createdAt: Date | string }[];
}

/** Steps the app is running on its own; the page reloads itself while one runs. */
const RUNNING: Partial<Record<DocumentStatus, string>> = {
  [DocumentStatus.AI_TRANSLATING]: 'The AI is translating. This page updates when the draft is ready.',
  [DocumentStatus.AI_PREPARING_AUDIO]: 'The AI is taking out what a narrator should not read.',
  [DocumentStatus.APPROVED]: 'The app waits for the recording, checks the file, then deploys and merges it.',
};

const POLL_MS = 10_000;

/**
 * The AI workflow as a list of steps, each tagged with who does it (the AI,
 * the team, the app), and under the step the version stands on, what the
 * person looking at it can do: approve the text, approve the audio text,
 * retry a failed step. Renders nothing on a manual-workflow version.
 */
export function AiWorkflowPanel({
  user,
  canManage,
  canReview,
  hasAudio,
}: {
  user: SessionUser;
  /** The language's manager or an administrator: may retry a failed step. */
  canManage: boolean;
  /** On the language's team: may approve the audio text. */
  canReview: boolean;
  /** Whether this document gets audio, and so has the two audio steps. */
  hasAudio: boolean;
}) {
  const router = useRouter();
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const suggestions = useEditorStore((s) => s.suggestions);
  const requestTranslationView = useEditorStore((s) => s.requestTranslationView);
  const setStatus = useEditorStore((s) => s.handleStatusChange);
  const documentId = useEditorStore((s) => s.documentId);
  const openCount = useMemo(() => suggestions.filter((s) => s.status === SuggestionStatus.OPEN).length, [suggestions]);
  const [approvals, setApprovals] = useState<Approvals | null>(null);
  const [busy, setBusy] = useState(false);

  const isAi = targetVersion?.workflow === TranslationWorkflow.AI;
  const status: DocumentStatus | undefined = targetVersion?.status;
  const versionId: string | undefined = targetVersion?.id;
  const aiError: string | null = targetVersion?.aiError ?? null;
  const running = isAi && status ? RUNNING[status] : undefined;

  const loadApprovals = useCallback(async () => {
    if (!versionId) return;
    try {
      setApprovals((await getTextApprovalsAction(versionId)) as Approvals);
    } catch {
      setApprovals(null);
    }
  }, [versionId]);

  useEffect(() => {
    if (isAi) void loadApprovals();
  }, [isAi, status, loadApprovals]);

  // A step the app runs ends with a status change only the server sees.
  // Reload until it lands, unless it failed and waits for a person.
  useEffect(() => {
    if (!running || aiError) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, aiError, router]);

  if (!isAi || !versionId || !status) return null;

  const approverIds = approvals?.approvals.map((approval) => approval.user.id) ?? [];
  const approvedByMe = approverIds.includes(user.id);
  const required = approvals?.required ?? 2;

  const handleApprove = async () => {
    setBusy(true);
    try {
      const result = approvedByMe ? await withdrawTextApprovalAction(versionId) : await approveTextAction(versionId);
      if (isRefusal(result)) {
        toast.warning(result.refused.message);
      } else if (approvedByMe) {
        capture('ai_text_approval_withdrawn', { documentVersionId: versionId });
      } else {
        const advanced = 'advancedTo' in result && !!result.advancedTo;
        capture('ai_text_approved', { documentVersionId: versionId, advanced });
        toast.success(advanced ? 'Approved. The text moves on to the next step.' : 'Approved.');
      }
      await loadApprovals();
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save the approval');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveAudio = async () => {
    setBusy(true);
    try {
      const result = await withStatusChangeFeedback(
        {
          from: status,
          to: DocumentStatus.APPROVED,
          via: 'ai_panel',
          documentId,
          versionId,
        },
        () => updateDocumentVersionStatusAction(versionId, DocumentStatus.APPROVED),
      );
      // A refusal means the page was stale; show the status the server has.
      setStatus(isRefusal(result) ? result.refused.currentStatus : DocumentStatus.APPROVED);
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || 'Failed to approve the audio text');
    } finally {
      setBusy(false);
    }
  };

  /** Brings the feedback list, further down the same sidebar, into view. */
  const showComments = () => {
    document.getElementById('document-panel-threads')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleRetry = async () => {
    setBusy(true);
    try {
      const result = await retryAiStepAction(versionId);
      if (isRefusal(result)) {
        toast.warning(result.refused.message);
      } else {
        capture('ai_step_retried', { documentVersionId: versionId, status });
        toast.success('Retrying. This page updates when the step finishes.');
      }
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || 'Failed to retry');
    } finally {
      setBusy(false);
    }
  };

  const steps = aiWorkflowSteps({ status, hasAudio, aiError });
  const aiNoteCount = suggestions.filter((s) => s.user?.id === AI_USER_ID).length;
  const approverNames = approvals?.approvals.map(({ user: approver }) => approver.name || approver.email) ?? [];

  /** What a step that is over left behind: the AI's notes, the people who approved. */
  const doneNote = (id: AiStepId): string | null => {
    if (id === 'draft' && aiNoteCount > 0) {
      return `Left ${aiNoteCount} note${aiNoteCount === 1 ? '' : 's'} for the reviewers.`;
    }
    if (id === 'text-review' && approverNames.length > 0) return `Approved by ${approverNames.join(' and ')}.`;
    return null;
  };

  const currentBody = (id: AiStepId) => {
    if (id === 'text-review') {
      const resolved = openCount === 0;
      return (
        // The two things a reviewer does, in the order they have to happen:
        // the approval is refused while a comment is open, so the comments
        // come first rather than as a note under a button that will not press.
        <ol className="flex flex-col gap-3" aria-label="Review the text">
          <li className="flex flex-col gap-1.5" aria-current={resolved ? undefined : 'step'}>
            <SubStepTitle number={1} done={resolved}>
              Resolve the comments
            </SubStepTitle>
            <p className="text-xs text-muted-foreground">
              {resolved
                ? 'No open comments.'
                : `${openCount} open comment${openCount === 1 ? '' : 's'}, including the AI's. Apply or dismiss each one.`}
            </p>
            {!resolved && (
              <Button size="sm" variant="outline" onClick={showComments}>
                <MessageSquare />
                Show the comments
              </Button>
            )}
          </li>
          <li className="flex flex-col gap-1.5" aria-current={resolved ? 'step' : undefined}>
            <SubStepTitle number={2} done={false} waiting={!resolved}>
              Approve the text
            </SubStepTitle>
            <p className="text-xs text-muted-foreground">
              {approverIds.length} of {required} approvals. The text moves on when {required} people approve it.
            </p>
            {approvals && approvals.approvals.length > 0 && (
              <ul className="flex flex-col gap-1" aria-label="Approved by">
                {approvals.approvals.map(({ user: approver }) => (
                  <li key={approver.id} className="flex items-center gap-2">
                    <UserAvatar name={approver.name} email={approver.email} image={approver.image} size="xs" />
                    {approver.name}
                  </li>
                ))}
              </ul>
            )}
            <Button
              size="sm"
              variant={approvedByMe ? 'outline' : 'default'}
              onClick={handleApprove}
              disabled={busy || (!approvedByMe && !resolved)}
            >
              <ThumbsUp />
              {approvedByMe ? 'Withdraw my approval' : 'Approve text'}
            </Button>
          </li>
        </ol>
      );
    }
    if (id === 'audio-review') {
      return (
        <>
          <p className="text-muted-foreground">
            The AI took out what a narrator should not read. One person reads the audio text and approves it.
          </p>
          <Button size="sm" variant="outline" onClick={() => requestTranslationView('audio')}>
            <AudioLines />
            Open the audio text
          </Button>
          {canReview && (
            <Button size="sm" onClick={handleApproveAudio} disabled={busy || openCount > 0}>
              <ThumbsUp />
              Approve audio text
            </Button>
          )}
          {canReview && openCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Resolve the {openCount} open comment{openCount === 1 ? '' : 's'} first.
            </p>
          )}
        </>
      );
    }
    return running ? <p className="text-muted-foreground">{running}</p> : null;
  };

  return (
    // A row of the panel's summary card, which draws the border and the padding.
    <section aria-label="AI workflow" className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <Sparkles className="size-4 text-hue-blue" aria-hidden />
        AI workflow
      </div>

      <ol className="flex flex-col" aria-label="Steps">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const active = step.state === 'current' || step.state === 'failed';
          const note = step.state === 'done' ? doneNote(step.id) : null;
          return (
            <li
              key={step.id}
              aria-current={active ? 'step' : undefined}
              className="grid grid-cols-[1.25rem_1fr] gap-x-2"
            >
              <div className="flex flex-col items-center">
                <StepMark state={step.state} working={step.actor !== 'team'} />
                {!isLast && <span className="my-1 w-px flex-1 bg-border" aria-hidden />}
              </div>
              <div className={cn('flex min-w-0 flex-col gap-2', !isLast && 'pb-3')}>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 leading-5">
                  <span
                    className={cn(
                      'rounded-sm px-1.5 text-[11px] font-medium leading-5',
                      ACTOR_CLASS[step.actor],
                      step.state === 'upcoming' && 'opacity-60',
                    )}
                  >
                    {AI_ACTOR_LABEL[step.actor]}
                  </span>
                  <span className={cn(active && 'font-medium', step.state === 'upcoming' && 'text-muted-foreground')}>
                    {step.title}
                  </span>
                  <span className="sr-only">({STATE_LABEL[step.state]})</span>
                </p>

                {note && <p className="text-xs text-muted-foreground">{note}</p>}

                {step.state === 'current' && currentBody(step.id)}

                {step.state === 'failed' && (
                  <div
                    role="alert"
                    className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2"
                  >
                    <p className="text-destructive">{aiError}</p>
                    {canManage && (
                      <Button size="sm" variant="outline" onClick={handleRetry} disabled={busy}>
                        <RotateCcw />
                        Retry
                      </Button>
                    )}
                    {!canManage && (
                      <p className="text-xs text-muted-foreground">The language&apos;s manager can retry it.</p>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const ACTOR_CLASS: Record<AiStepActor, string> = {
  ai: 'bg-hue-blue/10 text-hue-blue',
  team: 'bg-hue-amber/10 text-hue-amber',
  app: 'bg-muted text-muted-foreground',
};

const STATE_LABEL: Record<AiStepState, string> = {
  done: 'done',
  current: 'in progress',
  failed: 'failed',
  upcoming: 'not started',
};

/** The heading of one of the two things to do inside the text review: its number, or a check once it is done. */
function SubStepTitle({
  number,
  done,
  waiting = false,
  children,
}: {
  number: number;
  done: boolean;
  /** Not possible yet, because the one before it is still open. */
  waiting?: boolean;
  children: React.ReactNode;
}) {
  return (
    <p className={cn('flex items-center gap-1.5', waiting && 'text-muted-foreground')}>
      {done ? (
        <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
      ) : (
        <span
          className="flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none"
          aria-hidden
        >
          {number}
        </span>
      )}
      <span className={cn(!done && !waiting && 'font-medium')}>{children}</span>
      <span className="sr-only">({done ? 'done' : waiting ? 'waits for the step before it' : 'to do'})</span>
    </p>
  );
}

/** The mark on the step's rail. A step the AI or the app is running spins; one that waits on people does not. */
function StepMark({ state, working }: { state: AiStepState; working: boolean }) {
  const className = 'mt-0.5 size-4 shrink-0';
  if (state === 'done') return <CheckCircle2 className={cn(className, 'text-success')} aria-hidden />;
  if (state === 'failed') return <AlertCircle className={cn(className, 'text-destructive')} aria-hidden />;
  if (state === 'upcoming') return <Circle className={cn(className, 'text-muted-foreground/50')} aria-hidden />;
  return working ? (
    <Loader2 className={cn(className, 'animate-spin text-hue-blue')} aria-hidden />
  ) : (
    <CircleDot className={cn(className, 'text-hue-amber')} aria-hidden />
  );
}
