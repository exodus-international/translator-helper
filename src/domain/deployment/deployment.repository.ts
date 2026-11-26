import prisma from '@/lib/db';
import {
  DeploymentItemOutcome,
  DeploymentStatus,
  DeploymentTrigger,
  DocumentStatus,
} from '@/generated/prisma/enums';
import type { Prisma } from '@/generated/prisma/client';
import { ACTIVE_DEPLOYMENT_STATUSES, INTERRUPTED_MESSAGE, STALE_DEPLOYMENT_MS } from './deployment.plan';

/**
 * Deployments and their items. A deployment is one request to publish, made
 * by one person (or by approval, for auto-deploy); each item is one document
 * version in it, with what happened to that version.
 */

/** The version facts a deploy and its confirmation read. */
const versionForDeploy = {
  id: true,
  status: true,
  content: true,
  languageId: true,
  document: {
    select: {
      id: true,
      title: true,
      slug: true,
      type: true,
      originalFilename: true,
      sourceProject: { select: { id: true, name: true, slug: true, repositoryDirectory: true } },
    },
  },
  language: { select: { id: true, name: true, code: true } },
} satisfies Prisma.DocumentVersionSelect;

export type VersionForDeploy = Prisma.DocumentVersionGetPayload<{ select: typeof versionForDeploy }>;

/** Everything a history row shows, without the documents' text. */
const deploymentSummarySelect = {
  id: true,
  status: true,
  trigger: true,
  branch: true,
  commitSha: true,
  commitUrl: true,
  error: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  retryOfId: true,
  // No email: history is read by the whole team, not only people who know each other.
  requestedBy: { select: { id: true, name: true, image: true } },
  sourceProject: { select: { id: true, name: true, slug: true } },
  language: { select: { id: true, name: true, code: true } },
  items: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      outcome: true,
      filePath: true,
      error: true,
      documentVersion: {
        select: {
          id: true,
          languageId: true,
          status: true,
          document: { select: { id: true, title: true, slug: true, sourceProject: { select: { slug: true } } } },
          language: { select: { name: true, code: true } },
        },
      },
    },
  },
} satisfies Prisma.DeploymentSelect;

export type DeploymentRecord = Prisma.DeploymentGetPayload<{ select: typeof deploymentSummarySelect }>;

export async function getVersionsForDeploy(versionIds: string[]): Promise<VersionForDeploy[]> {
  return prisma.documentVersion.findMany({ where: { id: { in: versionIds } }, select: versionForDeploy });
}

/**
 * The approved versions in a scope, for "Deploy approved". `languageIds` limits
 * the scope to the languages the person is on; undefined means every
 * language (an administrator).
 */
export async function listApprovedVersionsForDeploy(scope: {
  sourceProjectId?: string;
  languageId?: string;
  languageIds?: string[];
}): Promise<VersionForDeploy[]> {
  return prisma.documentVersion.findMany({
    where: {
      status: DocumentStatus.APPROVED,
      ...(scope.sourceProjectId && { document: { sourceProjectId: scope.sourceProjectId } }),
      ...languageWhere(scope),
    },
    select: versionForDeploy,
    orderBy: [{ language: { name: 'asc' } }, { document: { title: 'asc' } }],
  });
}

/**
 * Of these versions, the ones already in a deployment that is queued or
 * publishing, with that deployment. Asking again while one runs joins it
 * rather than starting a second.
 */
export async function findActiveItems(versionIds: string[]): Promise<{ documentVersionId: string; deploymentId: string }[]> {
  return prisma.deploymentItem.findMany({
    where: {
      documentVersionId: { in: versionIds },
      deployment: {
        status: { in: ACTIVE_DEPLOYMENT_STATUSES },
        createdAt: { gt: new Date(Date.now() - STALE_DEPLOYMENT_MS) },
      },
    },
    select: { documentVersionId: true, deploymentId: true },
  });
}

export async function createDeployment(input: {
  trigger: DeploymentTrigger;
  requestedById: string | null;
  sourceProjectId: string | null;
  languageId: string | null;
  retryOfId?: string | null;
  versionIds: string[];
}): Promise<{ id: string }> {
  return prisma.deployment.create({
    data: {
      trigger: input.trigger,
      requestedById: input.requestedById,
      sourceProjectId: input.sourceProjectId,
      languageId: input.languageId,
      retryOfId: input.retryOfId ?? null,
      items: { create: input.versionIds.map((documentVersionId) => ({ documentVersionId })) },
    },
    select: { id: true },
  });
}

/**
 * Moves a queued deployment to publishing. Only one caller wins, so a
 * deployment is never published twice even if it is started twice.
 */
export async function claimDeployment(id: string, branch: string | null): Promise<boolean> {
  const { count } = await prisma.deployment.updateMany({
    where: { id, status: DeploymentStatus.QUEUED },
    data: { status: DeploymentStatus.PUBLISHING, startedAt: new Date(), branch },
  });
  return count === 1;
}

/** A deployment's items with what publishing them needs. */
export async function getDeploymentForRun(id: string) {
  return prisma.deployment.findUnique({
    where: { id },
    select: {
      id: true,
      requestedById: true,
      requestedBy: { select: { name: true } },
      items: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, outcome: true, documentVersion: { select: versionForDeploy } },
      },
    },
  });
}

export async function setItemOutcome(
  itemId: string,
  outcome: DeploymentItemOutcome,
  facts: { filePath?: string | null; error?: string | null } = {},
): Promise<void> {
  await prisma.deploymentItem.update({
    where: { id: itemId },
    data: { outcome, ...(facts.filePath !== undefined && { filePath: facts.filePath }), error: facts.error ?? null },
  });
}

export async function finishDeployment(
  id: string,
  result: { status: DeploymentStatus; commitSha?: string | null; commitUrl?: string | null; error?: string | null },
): Promise<void> {
  await prisma.deployment.update({
    where: { id },
    data: {
      status: result.status,
      commitSha: result.commitSha ?? null,
      commitUrl: result.commitUrl ?? null,
      error: result.error ?? null,
      finishedAt: new Date(),
    },
  });
}

/**
 * Moves an approved version to DEPLOYED, unless it moved meanwhile or its text
 * is no longer the text that was deployed (an administrator may edit approved
 * text while the deploy runs). Returns whether it did, so the activity log and
 * notification follow only a real move.
 */
export async function markVersionDeployed(versionId: string, deployedContent: string): Promise<boolean> {
  const { count } = await prisma.documentVersion.updateMany({
    where: { id: versionId, status: DocumentStatus.APPROVED, content: deployedContent },
    data: { status: DocumentStatus.DEPLOYED },
  });
  return count === 1;
}

/**
 * Fails deployments whose process went away before they finished: a server
 * restart, a timeout on the host. Run before history is read, so nobody waits
 * on a deploy that will never end.
 */
export async function failStaleDeployments(now = new Date()): Promise<number> {
  const { count } = await prisma.deployment.updateMany({
    where: {
      status: { in: ACTIVE_DEPLOYMENT_STATUSES },
      createdAt: { lt: new Date(now.getTime() - STALE_DEPLOYMENT_MS) },
    },
    data: { status: DeploymentStatus.FAILED, error: INTERRUPTED_MESSAGE, finishedAt: now },
  });
  return count;
}

export async function getDeployment(id: string): Promise<DeploymentRecord | null> {
  return prisma.deployment.findUnique({ where: { id }, select: deploymentSummarySelect });
}

export async function getRetryableItems(deploymentId: string) {
  return prisma.deploymentItem.findMany({
    where: { deploymentId, outcome: { in: [DeploymentItemOutcome.FAILED, DeploymentItemOutcome.PENDING] } },
    select: { documentVersionId: true, documentVersion: { select: { languageId: true } } },
  });
}

export async function getDeploymentScope(id: string) {
  return prisma.deployment.findUnique({
    where: { id },
    select: { id: true, status: true, sourceProjectId: true, languageId: true },
  });
}

const HISTORY_PAGE_SIZE = 20;

/**
 * Deployment history, newest first. A deployment shows in a scope when any of
 * its items is in it, so a batch across languages appears in each language's
 * history.
 */
export async function listDeployments(filter: {
  documentVersionId?: string;
  sourceProjectId?: string;
  languageId?: string;
  languageIds?: string[];
  take?: number;
}): Promise<DeploymentRecord[]> {
  const item: Prisma.DeploymentItemWhereInput = {
    ...(filter.documentVersionId && { documentVersionId: filter.documentVersionId }),
    documentVersion: {
      ...(filter.sourceProjectId && { document: { sourceProjectId: filter.sourceProjectId } }),
      ...languageWhere(filter),
    },
  };
  return prisma.deployment.findMany({
    where: { items: { some: item } },
    select: deploymentSummarySelect,
    orderBy: { createdAt: 'desc' },
    take: filter.take ?? HISTORY_PAGE_SIZE,
  });
}

export async function getTranslationProjectForVersion(versionId: string) {
  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    select: {
      languageId: true,
      document: { select: { sourceProjectId: true } },
    },
  });
  if (!version?.document.sourceProjectId) return null;
  return prisma.translationProject.findUnique({
    where: {
      sourceProjectId_languageId: { sourceProjectId: version.document.sourceProjectId, languageId: version.languageId },
    },
    select: { id: true, autoDeploy: true, sourceProjectId: true, languageId: true },
  });
}

export async function setTranslationProjectAutoDeploy(id: string, autoDeploy: boolean) {
  return prisma.translationProject.update({
    where: { id },
    data: { autoDeploy },
    select: { id: true, autoDeploy: true, languageId: true },
  });
}

function languageWhere(scope: { languageId?: string; languageIds?: string[] }): Prisma.DocumentVersionWhereInput {
  if (scope.languageId && scope.languageIds && !scope.languageIds.includes(scope.languageId)) {
    // Asked for a language outside the allowed set: nothing matches.
    return { languageId: { in: [] } };
  }
  if (scope.languageId) return { languageId: scope.languageId };
  if (scope.languageIds) return { languageId: { in: scope.languageIds } };
  return {};
}
