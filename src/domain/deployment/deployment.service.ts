import { DeploymentItemOutcome, DeploymentStatus, DeploymentTrigger, DocumentStatus } from '@/generated/prisma/enums';
import { getGitHubConfig, isGitHubConfigured } from '@/lib/github-config';
import { buildDocumentPath } from '../document/document-url';
import { createActivityLog } from '../activity-log/activity-log.repository';
import { notifyStatusChange } from '../notification/notification.service';
import type { PublishFile, PublishResult } from '../github/github.publish';
import {
  buildCommitMessage,
  countsAsDeployed,
  finalStatus,
  findPathClashes,
  planItem,
  type ItemPlan,
} from './deployment.plan';
import * as repository from './deployment.repository';
import type { DeploymentRecord, VersionForDeploy } from './deployment.repository';
import type { DeploymentView, DeployStarted } from './deployment.types';

/**
 * Running a deploy: queue it, publish it in the background, and record what
 * happened to every version.
 *
 * Built with `createDeployments(deps)` so a database test can run a real
 * deployment against a fake GitHub, the way `createStatusChange` is built.
 */

export interface DeploymentDeps {
  githubConfigured: () => boolean;
  /** The branch deploys land on, recorded on the deployment. Null when GitHub is not set up. */
  deployBranch: () => string | null;
  publish: (files: PublishFile[], message: string) => Promise<PublishResult>;
  log: (entry: {
    documentVersionId: string;
    userId: string;
    action: 'status_updated' | 'github_deployed' | 'github_deploy_failed';
    details: Record<string, unknown>;
  }) => Promise<unknown>;
  notify: (input: { versionId: string; actorId: string; from: DocumentStatus; to: DocumentStatus }) => Promise<void>;
}

export function createDeployments(deps: DeploymentDeps) {
  /**
   * Creates a deployment for these versions, or joins the one already running
   * for them. Versions already in a running deployment are left to it; when
   * that is all of them, the caller gets that deployment to follow.
   */
  async function queueDeployment(input: {
    versionIds: string[];
    trigger: DeploymentTrigger;
    requestedById: string | null;
    sourceProjectId?: string | null;
    languageId?: string | null;
    retryOfId?: string | null;
  }): Promise<DeployStarted> {
    const versionIds = [...new Set(input.versionIds)];
    if (versionIds.length === 0) return { deploymentId: null, joined: false };

    const active = await repository.findActiveItems(versionIds);
    const running = new Set(active.map((item) => item.documentVersionId));
    const fresh = versionIds.filter((id) => !running.has(id));
    if (fresh.length === 0) {
      return { deploymentId: active[0].deploymentId, joined: true };
    }

    const deployment = await repository.createDeployment({
      trigger: input.trigger,
      requestedById: input.requestedById,
      sourceProjectId: input.sourceProjectId ?? null,
      languageId: input.languageId ?? null,
      retryOfId: input.retryOfId ?? null,
      versionIds: fresh,
    });
    return { deploymentId: deployment.id, joined: false };
  }

  /**
   * Publishes a queued deployment. Never throws: whatever goes wrong is
   * recorded on the deployment, which is what the person is watching.
   */
  async function runDeployment(id: string): Promise<void> {
    if (!(await repository.claimDeployment(id, deps.githubConfigured() ? deps.deployBranch() : null))) return;

    // The commit, once made, is kept even when recording what followed fails:
    // it is on the branch whatever the database says.
    const progress: { commit: PublishResult['commit'] } = { commit: null };
    try {
      await publishDeployment(id, progress);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Deploy] Deployment ${id} failed:`, error);
      await repository
        .finishDeployment(id, {
          status: DeploymentStatus.FAILED,
          commitSha: progress.commit?.sha ?? null,
          commitUrl: progress.commit?.url ?? null,
          error: message,
        })
        .catch(() => {});
    }
  }

  async function publishDeployment(id: string, progress: { commit: PublishResult['commit'] }): Promise<void> {
    const deployment = await repository.getDeploymentForRun(id);
    if (!deployment) return;

    const actorId = deployment.requestedById;
    const githubConfigured = deps.githubConfigured();
    const plans = deployment.items.map((item) => ({
      item,
      plan: planItem(toPlannedVersion(item.documentVersion), { githubConfigured }),
    }));

    const clashes = findPathClashes(
      plans.flatMap(({ item, plan }) => (plan.kind === 'publish' ? [{ itemId: item.id, path: plan.path }] : [])),
    );
    const outcomes = new Map<string, { outcome: DeploymentItemOutcome; filePath?: string; error?: string }>();
    const toPublish: { itemId: string; plan: Extract<ItemPlan, { kind: 'publish' }>; version: VersionForDeploy }[] = [];

    for (const { item, plan } of plans) {
      const clash = clashes.get(item.id);
      if (clash) {
        outcomes.set(item.id, { outcome: DeploymentItemOutcome.FAILED, error: clash });
      } else if (plan.kind === 'skip') {
        outcomes.set(item.id, { outcome: DeploymentItemOutcome.SKIPPED, error: plan.reason });
      } else if (plan.kind === 'not_published') {
        outcomes.set(item.id, { outcome: DeploymentItemOutcome.NOT_PUBLISHED, error: plan.reason });
      } else if (plan.kind === 'failed') {
        outcomes.set(item.id, { outcome: DeploymentItemOutcome.FAILED, error: plan.error });
      } else {
        toPublish.push({ itemId: item.id, plan, version: item.documentVersion });
      }
    }

    let commit: PublishResult['commit'] = null;
    let publishError: string | null = null;
    if (toPublish.length > 0) {
      const message = buildCommitMessage({
        documents: toPublish.map(({ version }) => ({ title: version.document.title, languageName: version.language.name })),
        requesterName: deployment.requestedBy?.name ?? null,
      });
      try {
        const result = await deps.publish(
          toPublish.map(({ plan }) => ({ path: plan.path, content: plan.content })),
          message,
        );
        commit = result.commit;
        progress.commit = commit;
        const changed = new Set(result.changedPaths);
        for (const { itemId, plan } of toPublish) {
          outcomes.set(itemId, {
            outcome: changed.has(plan.path) ? DeploymentItemOutcome.PUBLISHED : DeploymentItemOutcome.UNCHANGED,
            filePath: plan.path,
          });
        }
      } catch (error) {
        publishError = error instanceof Error ? error.message : String(error);
        for (const { itemId, plan } of toPublish) {
          outcomes.set(itemId, { outcome: DeploymentItemOutcome.FAILED, filePath: plan.path, error: publishError });
        }
      }
    }

    // What the deploy did is saved first: the outcomes, the versions that are
    // now out, and the deployment with its commit.
    const moved = new Set<string>();
    for (const { item } of plans) {
      const result = outcomes.get(item.id)!;
      await repository.setItemOutcome(item.id, result.outcome, { filePath: result.filePath, error: result.error });
      if (
        countsAsDeployed(result.outcome) &&
        (await repository.markVersionDeployed(item.documentVersion.id, item.documentVersion.content))
      ) {
        moved.add(item.documentVersion.id);
      }
    }

    const status = finalStatus([...outcomes.values()].map((result) => result.outcome));
    const failures = [...outcomes.values()].filter((result) => result.outcome === DeploymentItemOutcome.FAILED);
    await repository.finishDeployment(id, {
      status,
      commitSha: commit?.sha ?? null,
      commitUrl: commit?.url ?? null,
      error:
        status === DeploymentStatus.FAILED
          ? (publishError ?? (failures.length === 1 ? failures[0].error : `${failures.length} documents could not be deployed.`))
          : null,
    });

    // Then the activity log and notifications, which a deploy does not depend
    // on: one that cannot be written is reported and the rest still go out.
    // The requester's account may be gone; then there is nobody to attribute them to.
    if (!actorId) return;
    for (const { item } of plans) {
      const version = item.documentVersion;
      try {
        await recordVersion(version, outcomes.get(item.id)!, {
          actorId,
          deploymentId: id,
          commit,
          moved: moved.has(version.id),
        });
      } catch (error) {
        console.error(`[Deploy] Could not record deployment ${id} for version ${version.id}:`, error);
      }
    }
  }

  /** Writes a version's activity log lines and, when it moved, its notification. */
  async function recordVersion(
    version: VersionForDeploy,
    result: { outcome: DeploymentItemOutcome; error?: string },
    context: { actorId: string; deploymentId: string; commit: PublishResult['commit']; moved: boolean },
  ): Promise<void> {
    const { actorId, deploymentId, commit, moved } = context;
    if (result.outcome === DeploymentItemOutcome.SKIPPED) return;

    if (result.outcome === DeploymentItemOutcome.FAILED) {
      await deps.log({
        documentVersionId: version.id,
        userId: actorId,
        action: 'github_deploy_failed',
        details: { deploymentId, error: result.error },
      });
      return;
    }

    if (moved) {
      await deps.log({ documentVersionId: version.id, userId: actorId, action: 'status_updated', details: { status: DocumentStatus.DEPLOYED } });
      await deps.notify({ versionId: version.id, actorId, from: DocumentStatus.APPROVED, to: DocumentStatus.DEPLOYED });
    }
    if (result.outcome === DeploymentItemOutcome.PUBLISHED) {
      await deps.log({
        documentVersionId: version.id,
        userId: actorId,
        action: 'github_deployed',
        details: { deploymentId, commitSha: commit?.sha, commitUrl: commit?.url },
      });
    } else if (result.outcome === DeploymentItemOutcome.UNCHANGED) {
      await deps.log({
        documentVersionId: version.id,
        userId: actorId,
        action: 'github_deployed',
        details: { deploymentId, unchanged: true },
      });
    }
  }

  return { queueDeployment, runDeployment };
}

function toPlannedVersion(version: VersionForDeploy) {
  return {
    status: version.status,
    content: version.content,
    title: version.document.title,
    slug: version.document.slug,
    documentType: version.document.type,
    originalFilename: version.document.originalFilename,
    languageCode: version.language.code,
    languageName: version.language.name,
    sourceProjectName: version.document.sourceProject?.name ?? null,
    repositoryDirectory: version.document.sourceProject?.repositoryDirectory ?? null,
  };
}

/** Deployments as the app wires them: GitHub loaded only when a deploy publishes. */
export const deployments = createDeployments({
  githubConfigured: () => isGitHubConfigured(),
  deployBranch: () => getGitHubConfig().deployBranch,
  publish: async (files, message) => {
    const { createGitHubPublishDeps } = await import('../github/github.client');
    const { publishFiles } = await import('../github/github.publish');
    return publishFiles(await createGitHubPublishDeps(), files, message);
  },
  log: createActivityLog,
  notify: notifyStatusChange,
});

const NO_COUNTS: Record<DeploymentItemOutcome, number> = {
  PENDING: 0,
  PUBLISHED: 0,
  UNCHANGED: 0,
  NOT_PUBLISHED: 0,
  SKIPPED: 0,
  FAILED: 0,
};

/** Shown in place of a deploy error that belongs to a document the viewer cannot see. */
const HIDDEN_ITEM_ERROR = 'A document in another language could not be deployed.';

/**
 * A deployment as the client sees it. With `languageIds`, only the items in
 * those languages are shown and counted: a batch can span languages, and a
 * team member sees their own language's part of it, not the other teams'
 * titles and errors.
 */
export function toDeploymentView(record: DeploymentRecord, languageIds?: ReadonlySet<string>): DeploymentView {
  const items = languageIds
    ? record.items.filter((item) => languageIds.has(item.documentVersion.languageId))
    : record.items;
  const hidden = record.items.filter((item) => !items.includes(item));
  const counts = { ...NO_COUNTS };
  for (const item of items) counts[item.outcome] += 1;
  return {
    id: record.id,
    status: record.status,
    trigger: record.trigger,
    requestedBy: record.requestedBy,
    sourceProject: record.sourceProject ? { name: record.sourceProject.name, slug: record.sourceProject.slug } : null,
    language: record.language ? { name: record.language.name, code: record.language.code } : null,
    branch: record.branch,
    commitSha: record.commitSha,
    commitUrl: record.commitUrl,
    // A deploy's error can be one hidden item's own; then it is not repeated.
    error: record.error !== null && hidden.some((item) => item.error === record.error) ? HIDDEN_ITEM_ERROR : record.error,
    createdAt: record.createdAt.toISOString(),
    finishedAt: record.finishedAt?.toISOString() ?? null,
    retryOfId: record.retryOfId,
    counts,
    items: items.map((item) => {
      const { document, language } = item.documentVersion;
      return {
        id: item.id,
        documentVersionId: item.documentVersion.id,
        title: document.title,
        languageName: language.name,
        languageCode: language.code,
        href: buildDocumentPath({
          projectSlug: document.sourceProject?.slug ?? null,
          slug: document.slug,
          languageCode: language.code,
          documentId: document.id,
        }),
        outcome: item.outcome,
        versionDeployed: item.documentVersion.status === DocumentStatus.DEPLOYED,
        filePath: item.filePath,
        error: item.error,
      };
    }),
  };
}
