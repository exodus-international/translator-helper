'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, RotateCcw, Sparkles, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import {
  approveTextAction,
  getTextApprovalsAction,
  retryAiStepAction,
  withdrawTextApprovalAction,
} from '@/domain/ai-workflow/ai-workflow.actions';
import { DocumentStatus, SuggestionStatus, TranslationWorkflow } from '@/generated/prisma/enums';
import { isRefusal } from '@/lib/action-refusal';
import { capture } from '@/lib/analytics';
import { SessionUser } from '@/lib/session';
import { useEditorStore } from '@/lib/stores/editor-provider';

interface Approvals {
  required: number;
  approvals: { user: { id: string; name: string; email: string; image: string | null }; createdAt: Date | string }[];
}

/** Steps the app is running on its own; the page reloads itself while one runs. */
const RUNNING: Partial<Record<DocumentStatus, string>> = {
  [DocumentStatus.AI_TRANSLATING]: 'The AI is translating this document.',
  [DocumentStatus.AI_PREPARING_AUDIO]: 'The AI is preparing the audio text.',
  [DocumentStatus.APPROVED]: 'Approved. The document deploys on its own once the recording is ready.',
};

const POLL_MS = 10_000;

/**
 * Where an AI-workflow version stands and what the person looking at it can
 * do about it: approve the text, see who already has, retry a failed step.
 * Renders nothing on a manual-workflow version.
 */
export function AiWorkflowPanel({ user, canManage }: { user: SessionUser; canManage: boolean }) {
  const router = useRouter();
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const suggestions = useEditorStore((s) => s.suggestions);
  const openCount = useMemo(() => suggestions.filter((s) => s.status === SuggestionStatus.OPEN).length, [suggestions]);
  const [approvals, setApprovals] = useState<Approvals | null>(null);
  const [busy, setBusy] = useState(false);

  const isAi = targetVersion?.workflow === TranslationWorkflow.AI;
  const status: DocumentStatus | undefined = targetVersion?.status;
  const versionId: string | undefined = targetVersion?.id;
  const aiError: string | null = targetVersion?.aiError ?? null;
  const inTextReview = isAi && status === DocumentStatus.PENDING_REVIEW;
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

  return (
    <section aria-label="AI workflow" className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <Sparkles className="size-4 text-hue-blue" aria-hidden />
        AI workflow
      </div>

      {running && !aiError && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {running}
        </p>
      )}

      {aiError && (
        <div role="alert" className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2">
          <p className="flex items-start gap-2 text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{aiError}</span>
          </p>
          {canManage && (
            <Button size="sm" variant="outline" onClick={handleRetry} disabled={busy}>
              <RotateCcw />
              Retry
            </Button>
          )}
          {!canManage && <p className="text-xs text-muted-foreground">The language&apos;s manager can retry it.</p>}
        </div>
      )}

      {inTextReview && (
        <>
          <p className="text-muted-foreground">
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
            disabled={busy || (!approvedByMe && openCount > 0)}
          >
            <ThumbsUp />
            {approvedByMe ? 'Withdraw my approval' : 'Approve text'}
          </Button>
          {!approvedByMe && openCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Resolve the {openCount} open comment{openCount === 1 ? '' : 's'} first, including the AI&apos;s.
            </p>
          )}
        </>
      )}

      {isAi && status === DocumentStatus.AUDIO_REVIEW && (
        <p className="text-muted-foreground">
          Check the Audio text tab. When it reads well, choose Approve audio text in the status menu.
        </p>
      )}
    </section>
  );
}
