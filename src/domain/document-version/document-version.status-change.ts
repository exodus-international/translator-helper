import * as Sentry from '@sentry/nextjs';
import { DocumentStatus } from '@/generated/prisma/enums';
import type { AudioGenerationOutcome } from '../audio/audio.types';
import { refuse, type Refusal } from '@/lib/action-refusal';
import { StatusTransitionRefusedError, validateTransition } from './document-version.transitions';

/**
 * What one status change does, apart from who may ask for it.
 *
 * The server action checks the caller and loads the version; this decides
 * whether the move is allowed, makes it, and runs what follows from it: the
 * activity log, the notifications, and on entering APPROVED the audio
 * generation and, where the project deploys on approval, a deploy. Neither
 * side effect throws back to the caller: a recording or a deploy that cannot
 * start is reported in the result, and the status change itself stands.
 *
 * DEPLOYED is not reached here. A version becomes DEPLOYED when a deploy
 * publishes it, so asking for that move is refused with a pointer to Deploy.
 *
 * Built with `createStatusChange(deps)` so a test can hand in fakes for every
 * write and every external call, the way audio.service and authorize are
 * built.
 */

interface StatusChangeVersion {
  id: string;
  status: DocumentStatus;
}

export interface StatusChangeResult<Version> {
  version: Version;
  audio?: AudioGenerationOutcome;
  /** The deploy that approval started, for the page to follow. */
  deploymentId?: string;
}

/** A move the server refused, with the status the version really has now. */
export type StatusChangeRefusal = Refusal<{ currentStatus: DocumentStatus }>;

/**
 * Turns a refused transition into what the action returns to the client.
 * Anything else is not a refusal, and the caller rethrows it.
 */
export function toStatusChangeRefusal(error: unknown, currentStatus: DocumentStatus): StatusChangeRefusal | null {
  if (!(error instanceof StatusTransitionRefusedError)) return null;
  const message =
    error.reason === 'not_allowed'
      ? "This document's status changed while you had it open. The page now shows its current status."
      : error.message;
  return refuse(message, { currentStatus });
}

export interface StatusChangeDeps<Version> {
  countOpenSuggestions: (versionId: string) => Promise<number>;
  updateStatus: (versionId: string, status: DocumentStatus) => Promise<Version>;
  log: (entry: {
    documentVersionId: string;
    userId: string;
    action: 'status_updated';
    details: Record<string, unknown>;
  }) => Promise<unknown>;
  notify: (input: { versionId: string; actorId: string; from: DocumentStatus; to: DocumentStatus }) => Promise<void>;
  /** Starts a deploy when the version's project deploys on approval; the deployment id, or null. */
  startAutoDeploy: (versionId: string, actorId: string) => Promise<string | null>;
  startAudio: (versionId: string, userId: string) => Promise<AudioGenerationOutcome>;
  /** Drops the cached document page, once something the page shows has changed. */
  revalidateDocumentPage: () => void;
}

const DEPLOY_THROUGH_DEPLOY =
  'A document becomes Deployed when it is published. Use Deploy to publish it.';

/** Whether this move is a deploy, which only Deploy makes. */
export function isDeployMove(to: DocumentStatus): boolean {
  return to === DocumentStatus.DEPLOYED;
}

/** Whether entering `to` is refused while a suggestion is still open. */
export function guardedByOpenSuggestions(to: DocumentStatus): boolean {
  return to === DocumentStatus.APPROVED || to === DocumentStatus.DEPLOYED;
}

export function createStatusChange<Version>(deps: StatusChangeDeps<Version>) {
  return async function changeStatus(input: {
    version: StatusChangeVersion;
    to: DocumentStatus;
    actorId: string;
  }): Promise<StatusChangeResult<Version>> {
    const { version: existing, to, actorId } = input;

    if (isDeployMove(to)) {
      throw new StatusTransitionRefusedError(DEPLOY_THROUGH_DEPLOY, 'use_deploy');
    }

    if (guardedByOpenSuggestions(to)) {
      const openSuggestionsCount = await deps.countOpenSuggestions(existing.id);
      validateTransition(existing.status, to, { openSuggestionsCount });
    } else {
      validateTransition(existing.status, to);
    }

    const version = await deps.updateStatus(existing.id, to);

    await deps.log({ documentVersionId: existing.id, userId: actorId, action: 'status_updated', details: { status: to } });
    await deps.notify({ versionId: existing.id, actorId, from: existing.status, to });

    const result: StatusChangeResult<Version> = { version };
    if (to === DocumentStatus.APPROVED) {
      result.audio = await recordAfterStatusChange(deps, existing.id, actorId);
      // Only an approval deploys. Taking a version back out of DEPLOYED also
      // lands here, and redeploying it at once would undo the revoke.
      if (existing.status === DocumentStatus.PENDING_REVIEW) {
        const deploymentId = await autoDeployAfterStatusChange(deps, existing.id, actorId);
        if (deploymentId) result.deploymentId = deploymentId;
      }
    }
    return result;
  };
}

async function autoDeployAfterStatusChange<Version>(
  deps: StatusChangeDeps<Version>,
  versionId: string,
  actorId: string,
): Promise<string | null> {
  try {
    return await deps.startAutoDeploy(versionId, actorId);
  } catch (error) {
    // The approval stands; the team can still deploy by hand.
    console.error('[StatusChange] Could not start the auto-deploy:', error);
    Sentry.captureException(error, { tags: { area: 'deploy', step: 'auto-deploy start' }, extra: { versionId } });
    return null;
  }
}

async function recordAfterStatusChange<Version>(
  deps: StatusChangeDeps<Version>,
  versionId: string,
  actorId: string,
): Promise<AudioGenerationOutcome> {
  try {
    const outcome = await deps.startAudio(versionId, actorId);
    deps.revalidateDocumentPage();
    return outcome;
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}
