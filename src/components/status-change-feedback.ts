import { DocumentStatus } from '@/generated/prisma/enums';
import type { updateDocumentVersionStatusAction } from '@/domain/document-version/document-version.actions';
import type { StatusChangeRefusal } from '@/domain/document-version/document-version.status-change';
import { isRefusal } from '@/lib/action-refusal';
import { capture, type AnalyticsEvent, type AnalyticsProperties } from '@/lib/analytics';
import { toast } from 'sonner';

/**
 * What the person is told, and what analytics is told, after a status change.
 *
 * The status control and the kanban board both move a version and both used
 * to carry their own copy of this. One copy had the loading toast and the
 * audio events, the other did not, and a fix to one never reached the other.
 */

type StatusChangeResponse = Awaited<ReturnType<typeof updateDocumentVersionStatusAction>>;

/** A move the server made. */
export type StatusChangeOutcome = Exclude<StatusChangeResponse, StatusChangeRefusal>;

/** Where the move was made from, for analytics. */
export type StatusChangeVia = 'dropdown' | 'kanban_dnd';

export interface StatusChangeFeedbackDeps {
  toast: Pick<typeof toast, 'loading' | 'dismiss' | 'success' | 'error'>;
  capture: (event: AnalyticsEvent, properties?: AnalyticsProperties) => void;
  /** Opens the pull request; the browser's window.open in the app. */
  open: (url: string) => void;
}

const defaultDeps: StatusChangeFeedbackDeps = {
  toast,
  capture,
  open: (url) => window.open(url, '_blank'),
};

/**
 * Wraps one status change: a loading toast while a deploy is out, then the
 * GitHub and audio results as toasts and the analytics events for the move.
 *
 * When the server refuses the move, usually because the page is stale, the
 * refusal is shown as an error toast and returned, and no analytics is sent.
 * The caller reloads what it shows.
 *
 * `change` is the call itself. When it throws, the loading toast is cleared
 * and the error is rethrown for the caller, which decides what the control
 * does next; the error message is the caller's to show, because the two
 * controls word it differently.
 */
export async function withStatusChangeFeedback(
  input: {
    from: DocumentStatus | null;
    to: DocumentStatus;
    via: StatusChangeVia;
    documentId: string | null;
    versionId: string;
  },
  change: () => Promise<StatusChangeResponse>,
  deps: StatusChangeFeedbackDeps = defaultDeps,
): Promise<StatusChangeResponse> {
  const { from, to, via, documentId, versionId } = input;

  // GitHub takes a few seconds, and the control would otherwise look stuck.
  const deployToastId = to === DocumentStatus.DEPLOYED ? deps.toast.loading('Deploying to GitHub...') : undefined;

  let result: StatusChangeResponse;
  try {
    result = await change();
  } catch (error) {
    if (deployToastId !== undefined) deps.toast.dismiss(deployToastId);
    throw error;
  }

  if (deployToastId !== undefined) deps.toast.dismiss(deployToastId);

  if (isRefusal(result)) {
    deps.toast.error(result.refused.message);
    return result;
  }

  if (result.github?.status === 'success') {
    const prUrl = result.github.prUrl;
    deps.toast.success(prUrl ? 'GitHub PR created successfully' : 'Deployed to GitHub successfully', {
      action: prUrl ? { label: 'Open PR', onClick: () => deps.open(prUrl) } : undefined,
      duration: 8000,
    });
  } else if (result.github?.status === 'failed') {
    deps.toast.error(`GitHub deploy failed: ${result.github.error}`, { duration: 10000 });
  }

  if (result.audio?.status === 'success') {
    deps.capture('audio_generation_triggered', { documentVersionId: versionId });
  } else if (result.audio?.status === 'failed') {
    deps.capture('audio_generation_failed', { documentVersionId: versionId, kind: 'unknown' });
    deps.toast.error(`Audio generation failed: ${result.audio.error}`, { duration: 10000 });
  }

  const ids = { documentId, documentVersionId: versionId };
  deps.capture('document_status_changed', { from, to, via, ...ids });
  if (to === DocumentStatus.DEPLOYED) {
    deps.capture('document_deployed', { via, ...ids });
  }

  return result;
}
