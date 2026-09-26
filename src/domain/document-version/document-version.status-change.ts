import { DocumentStatus } from '@/generated/prisma/enums';
import type { AudioGenerationOutcome } from '../audio/audio.types';
import { DeploySkippedError } from '../github/github.errors';
import { validateTransition } from './document-version.transitions';

/**
 * What one status change does, apart from who may ask for it.
 *
 * The server action checks the caller and loads the version; this decides
 * whether the move is allowed, makes it, and runs what follows from it: the
 * activity log, the notifications, the GitHub deploy on entering DEPLOYED and
 * the audio generation on entering APPROVED. The two side effects never throw
 * back to the caller: a deploy or a recording that fails is reported in the
 * result, and the status change itself stands.
 *
 * Built with `createStatusChange(deps)` so a test can hand in fakes for every
 * write and every external call, the way audio.service and authorize are
 * built.
 */

export interface StatusChangeVersion {
  id: string;
  status: DocumentStatus;
}

export interface GitHubOutcome {
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  prUrl?: string;
}

export interface StatusChangeResult<Version> {
  version: Version;
  github?: GitHubOutcome;
  audio?: AudioGenerationOutcome;
}

export interface StatusChangeDeps<Version> {
  countOpenSuggestions: (versionId: string) => Promise<number>;
  updateStatus: (versionId: string, status: DocumentStatus) => Promise<Version>;
  log: (entry: {
    documentVersionId: string;
    userId: string;
    action: 'status_updated' | 'github_deployed' | 'github_deploy_failed';
    details: Record<string, unknown>;
  }) => Promise<unknown>;
  notify: (input: { versionId: string; actorId: string; from: DocumentStatus; to: DocumentStatus }) => Promise<void>;
  github: {
    isConfigured: () => boolean;
    deploy: (versionId: string) => Promise<{ prUrl: string } | undefined>;
  };
  startAudio: (versionId: string, userId: string) => Promise<AudioGenerationOutcome>;
  /** Drops the cached document page, once something the page shows has changed. */
  revalidateDocumentPage: () => void;
}

/** Whether moving to `to` from `from` touches DEPLOYED, in either direction. */
export function involvesDeployed(from: DocumentStatus, to: DocumentStatus): boolean {
  return from === DocumentStatus.DEPLOYED || to === DocumentStatus.DEPLOYED;
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
    if (to === DocumentStatus.DEPLOYED) {
      result.github = await deployAfterStatusChange(deps, existing.id, actorId);
    }
    if (to === DocumentStatus.APPROVED) {
      result.audio = await recordAfterStatusChange(deps, existing.id, actorId);
    }
    return result;
  };
}

async function deployAfterStatusChange<Version>(
  deps: StatusChangeDeps<Version>,
  versionId: string,
  actorId: string,
): Promise<GitHubOutcome> {
  if (!deps.github.isConfigured()) {
    return { status: 'skipped' };
  }
  try {
    const deployed = await deps.github.deploy(versionId);
    await deps.log({ documentVersionId: versionId, userId: actorId, action: 'github_deployed', details: {} });
    deps.revalidateDocumentPage();
    return { status: 'success', prUrl: deployed?.prUrl };
  } catch (error) {
    if (error instanceof DeploySkippedError) {
      return { status: 'skipped' };
    }
    const message = error instanceof Error ? error.message : String(error);
    await deps.log({ documentVersionId: versionId, userId: actorId, action: 'github_deploy_failed', details: { error: message } });
    deps.revalidateDocumentPage();
    return { status: 'failed', error: message };
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
