import type { DocumentStatus } from '@/generated/prisma/enums';
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
  toast: Pick<typeof toast, 'error'>;
  capture: (event: AnalyticsEvent, properties?: AnalyticsProperties) => void;
}

const defaultDeps: StatusChangeFeedbackDeps = { toast, capture };

/**
 * Wraps one status change: the audio result as a toast, the deploy that
 * approval started (where the project deploys on approval) handed to
 * `onDeployStarted` to follow, and the analytics events for the move.
 *
 * Moving a version into DEPLOYED is not a status change: Deploy does it, and
 * the controls call Deploy for it instead of coming here.
 *
 * When the server refuses the move, usually because the page is stale, the
 * refusal is shown as an error toast and returned, and no analytics is sent.
 * The caller reloads what it shows.
 *
 * `change` is the call itself. When it throws, the error is rethrown for the
 * caller, which decides what the control does next; the error message is the
 * caller's to show, because the two controls word it differently.
 */
export async function withStatusChangeFeedback(
  input: {
    from: DocumentStatus | null;
    to: DocumentStatus;
    via: StatusChangeVia;
    documentId: string | null;
    versionId: string;
    /** Follows a deploy the move started; approval in a project that deploys on approval. */
    onDeployStarted?: (deploymentId: string) => void;
  },
  change: () => Promise<StatusChangeResponse>,
  deps: StatusChangeFeedbackDeps = defaultDeps,
): Promise<StatusChangeResponse> {
  const { from, to, via, documentId, versionId } = input;

  const result = await change();

  if (isRefusal(result)) {
    deps.toast.error(result.refused.message);
    return result;
  }

  if (result.audio?.status === 'success') {
    deps.capture('audio_generation_triggered', { documentVersionId: versionId });
  } else if (result.audio?.status === 'failed') {
    deps.capture('audio_generation_failed', { documentVersionId: versionId, kind: 'unknown' });
    deps.toast.error(`Audio generation failed: ${result.audio.error}`, { duration: 10000 });
  }

  if (result.deploymentId) input.onDeployStarted?.(result.deploymentId);

  const ids = { documentId, documentVersionId: versionId };
  deps.capture('document_status_changed', { from, to, via, ...ids });

  return result;
}
