import {
  DeploymentItemOutcome,
  DeploymentStatus,
  DocumentStatus,
  type DocumentType,
} from '@/generated/prisma/enums';
import { isDeployableStatus } from '../github/github.deployable';
import { resolveFilePath } from '../github/github.paths';

/**
 * The decisions a deploy makes, apart from the database and GitHub: what
 * happens to each version, what the commit says, and how the deployment ends.
 * Pure, so every rule is tested without either.
 */

/** A deployment still queued or publishing this long after it was created has stopped: its process went away. */
export const STALE_DEPLOYMENT_MS = 10 * 60 * 1000;

export const INTERRUPTED_MESSAGE = 'This deploy stopped before it finished, so nothing more will happen. Retry it.';

export const ACTIVE_DEPLOYMENT_STATUSES: DeploymentStatus[] = [DeploymentStatus.QUEUED, DeploymentStatus.PUBLISHING];

/** The facts about one version that decide what its deploy does. */
export interface PlannedVersion {
  status: DocumentStatus;
  content: string;
  title: string;
  slug: string;
  documentType: DocumentType | null;
  originalFilename: string | null;
  languageCode: string;
  languageName: string;
  sourceProjectName: string | null;
  repositoryDirectory: string | null;
}

export type ItemPlan =
  | { kind: 'skip'; reason: string }
  | { kind: 'not_published'; reason: string }
  | { kind: 'failed'; error: string }
  | { kind: 'publish'; path: string; content: string };

/**
 * What a deploy does with one version, decided when it runs rather than when
 * it was asked for: the version may have moved on in between.
 */
export function planItem(version: PlannedVersion, options: { githubConfigured: boolean }): ItemPlan {
  if (!isDeployableStatus(version.status)) {
    return {
      kind: 'skip',
      reason: `It is ${statusLabel(version.status)} now, and only approved or deployed documents go out.`,
    };
  }
  if (!options.githubConfigured) {
    return { kind: 'not_published', reason: 'GitHub is not set up for this app, so the file was not published.' };
  }
  if (!version.repositoryDirectory) {
    const project = version.sourceProjectName ? `"${version.sourceProjectName}"` : 'Its project';
    return {
      kind: 'not_published',
      reason: `${project} has no repository directory, so it is not published to GitHub.`,
    };
  }
  if (!version.documentType) {
    return { kind: 'failed', error: `"${version.title}" has no document type, so its place in the repository is unknown.` };
  }
  try {
    const path = resolveFilePath({
      documentType: version.documentType,
      languageCode: version.languageCode,
      repositoryDirectory: version.repositoryDirectory,
      originalFilename: version.originalFilename,
      slug: version.slug,
    });
    return { kind: 'publish', path, content: version.content };
  } catch (error) {
    return { kind: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Two versions can never share a file, but if they did, the commit would
 * carry only one of them. The later one is failed with the reason rather than
 * silently lost.
 */
export function findPathClashes(paths: { itemId: string; path: string }[]): Map<string, string> {
  const seen = new Map<string, string>();
  const clashes = new Map<string, string>();
  for (const { itemId, path } of paths) {
    if (seen.has(path)) {
      clashes.set(itemId, `Another document in this deploy writes the same file, ${path}.`);
    } else {
      seen.set(path, itemId);
    }
  }
  return clashes;
}

const MESSAGE_TITLE_LIMIT = 10;

/**
 * The commit message: what went out, in which languages, and who sent it.
 * One document reads as a sentence; a batch lists its documents.
 */
export function buildCommitMessage(params: {
  documents: { title: string; languageName: string }[];
  requesterName: string | null;
}): string {
  const { documents } = params;
  const languages = [...new Set(documents.map((document) => document.languageName))].sort();
  const by = params.requesterName ? `Deployed by ${params.requesterName} from Translator Helper.` : 'Deployed from Translator Helper.';

  if (documents.length === 1) {
    const [only] = documents;
    return `Deploy ${only.languageName}: ${only.title}\n\n${by}`;
  }

  const subject = `Deploy ${documents.length} documents (${languages.join(', ')})`;
  const listed = documents.slice(0, MESSAGE_TITLE_LIMIT).map((document) => `- ${document.title} (${document.languageName})`);
  const more = documents.length > MESSAGE_TITLE_LIMIT ? [`- and ${documents.length - MESSAGE_TITLE_LIMIT} more`] : [];
  return [subject, '', ...listed, ...more, '', by].join('\n');
}

/** A deployment fails when any of its items did; skipped items do not count against it. */
export function finalStatus(outcomes: DeploymentItemOutcome[]): DeploymentStatus {
  return outcomes.some((outcome) => outcome === DeploymentItemOutcome.FAILED || outcome === DeploymentItemOutcome.PENDING)
    ? DeploymentStatus.FAILED
    : DeploymentStatus.SUCCEEDED;
}

/** The items a retry sends again: the ones that failed or never ran. */
export function retryableOutcome(outcome: DeploymentItemOutcome): boolean {
  return outcome === DeploymentItemOutcome.FAILED || outcome === DeploymentItemOutcome.PENDING;
}

/** Outcomes after which the version counts as deployed. */
export function countsAsDeployed(outcome: DeploymentItemOutcome): boolean {
  return (
    outcome === DeploymentItemOutcome.PUBLISHED ||
    outcome === DeploymentItemOutcome.UNCHANGED ||
    outcome === DeploymentItemOutcome.NOT_PUBLISHED
  );
}

export function isActive(status: DeploymentStatus): boolean {
  return ACTIVE_DEPLOYMENT_STATUSES.includes(status);
}

/** Whether an active deployment has been running long enough that it must have died. */
export function isStale(deployment: { status: DeploymentStatus; createdAt: Date }, now: Date): boolean {
  return isActive(deployment.status) && now.getTime() - deployment.createdAt.getTime() > STALE_DEPLOYMENT_MS;
}

function statusLabel(status: DocumentStatus): string {
  return status.toLowerCase().replace(/_/g, ' ');
}
