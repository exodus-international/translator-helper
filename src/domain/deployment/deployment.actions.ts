'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { DeploymentStatus, DeploymentTrigger, DocumentStatus, Role } from '@/generated/prisma/enums';
import { authorize } from '@/lib/authorize';
import { refuse, type Refusal } from '@/lib/action-refusal';
import type { SessionUser } from '@/lib/session';
import { isGitHubConfigured } from '@/lib/github-config';
import { getUserLanguages } from '../user-language/user-language.repository';
import { isDeployableStatus } from '../github/github.deployable';
import { deployments, toDeploymentView } from './deployment.service';
import { startInBackground } from './deployment.background';
import * as repository from './deployment.repository';
import type { VersionForDeploy } from './deployment.repository';
import {
  deployScopeSchema,
  deployTargetSchema,
  historyFilterSchema,
  versionIdsSchema,
  type DeployPreview,
  type DeployScope,
  type DeployStarted,
  type DeploymentView,
} from './deployment.types';

/**
 * Deploying from the app. Anyone on a language's team, in any role, and any
 * administrator may deploy that language's approved work; the server checks
 * every language a deploy touches, whatever the page offered.
 *
 * A deploy returns as soon as it is queued. Publishing runs after the
 * response, and the page follows it with `getDeploymentAction`.
 */

const AUDIO_NOT_READY = new Set(['missing', 'pending', 'failed', 'stale']);
const AUDIO_CHECK_LIMIT = 50;

/** Refuses unless the caller is on the team of every one of these languages, or an administrator. */
async function authorizeLanguages(languageIds: Iterable<string>): Promise<SessionUser> {
  const { user } = await authorize('authenticated');
  for (const language of new Set(languageIds)) {
    await authorize({ language, role: 'member' });
  }
  return user;
}

/** The languages a person may deploy and see deploys of; undefined for an administrator (all of them). */
async function deployableLanguageIds(user: SessionUser): Promise<string[] | undefined> {
  if (user.role === Role.ADMIN) return undefined;
  const memberships = await getUserLanguages(user.id);
  return memberships.map((membership) => membership.languageId);
}

/** The approved versions in a scope that this person may deploy. */
async function versionsInScope(user: SessionUser, scope: DeployScope): Promise<VersionForDeploy[]> {
  if (scope.languageId) await authorize({ language: scope.languageId, role: 'member' });
  const languageIds = await deployableLanguageIds(user);
  return repository.listApprovedVersionsForDeploy({ ...scope, languageIds });
}

/** Explicitly chosen versions: each must exist, be deployable, and be in a language the caller is on. */
async function chosenVersions(versionIds: string[]): Promise<VersionForDeploy[] | Refusal> {
  const versions = await repository.getVersionsForDeploy(versionIds);
  if (versions.length !== new Set(versionIds).size) {
    return refuse('Some of these documents no longer exist. Reload the page and try again.');
  }
  await authorizeLanguages(versions.map((version) => version.languageId));
  const notReady = versions.filter((version) => !isDeployableStatus(version.status));
  if (notReady.length > 0) {
    const [first] = notReady;
    return refuse(
      notReady.length === 1
        ? `"${first.document.title}" is not approved, so it cannot be deployed.`
        : `${notReady.length} of these documents are not approved, so they cannot be deployed.`,
    );
  }
  return versions;
}

/** The one language and project a set of versions shares, for labelling the deployment. */
function sharedScope(versions: VersionForDeploy[]): { languageId: string | null; sourceProjectId: string | null } {
  const languages = new Set(versions.map((version) => version.languageId));
  const projects = new Set(versions.map((version) => version.document.sourceProject?.id ?? null));
  return {
    languageId: languages.size === 1 ? [...languages][0] : null,
    sourceProjectId: projects.size === 1 ? [...projects][0] : null,
  };
}

/** What a deploy would send, for the confirmation. Nothing is written. */
export async function previewDeployAction(input: unknown): Promise<DeployPreview | Refusal> {
  const { user } = await authorize('authenticated');
  const target = deployTargetSchema.parse(input);

  let versions: VersionForDeploy[];
  if ('versionIds' in target) {
    const chosen = await chosenVersions(target.versionIds);
    if ('refused' in chosen) return chosen;
    versions = chosen;
  } else {
    versions = await versionsInScope(user, target.scope);
  }

  const ids = versions.map((version) => version.id);
  const [active, audioNotReady] = await Promise.all([repository.findActiveItems(ids), countAudioNotReady(ids)]);

  let deployTarget: DeployPreview['target'] = null;
  if (isGitHubConfigured()) {
    const { describeDeployTarget } = await import('../github/github.client');
    deployTarget = describeDeployTarget();
  }

  return {
    documents: versions.map((version) => ({
      id: version.id,
      title: version.document.title,
      languageName: version.language.name,
      status: version.status,
    })),
    target: deployTarget,
    audioNotReady,
    notPublished: deployTarget
      ? versions.filter((version) => !version.document.sourceProject?.repositoryDirectory).length
      : versions.length,
    alreadyRunning: new Set(active.map((item) => item.documentVersionId)).size,
  };
}

/**
 * The audio check reads each version's recording; past a few dozen versions
 * the confirmation would wait on it, so a large batch checks the first ones.
 */
async function countAudioNotReady(versionIds: string[]): Promise<number> {
  if (versionIds.length === 0) return 0;
  const { getAudioReadiness } = await import('../audio/audio.service');
  let count = 0;
  for (const id of versionIds.slice(0, AUDIO_CHECK_LIMIT)) {
    try {
      const readiness = await getAudioReadiness(id);
      if (AUDIO_NOT_READY.has(readiness.state)) count += 1;
    } catch {
      // A speech outage never blocks a deploy, and never blocks its confirmation.
    }
  }
  return count;
}

/** Deploys chosen versions: one document from its editor or the board, or several. */
export async function deployVersionsAction(input: unknown): Promise<DeployStarted | Refusal> {
  const { versionIds, redeploy } = z
    .object({ versionIds: versionIdsSchema, redeploy: z.boolean().optional() })
    .strict()
    .parse(input);
  const { user } = await authorize('authenticated');

  const versions = await chosenVersions(versionIds);
  if ('refused' in versions) return versions;

  const allDeployed = versions.every((version) => version.status === DocumentStatus.DEPLOYED);
  const started = await deployments.queueDeployment({
    versionIds: versions.map((version) => version.id),
    trigger: redeploy || allDeployed ? DeploymentTrigger.REDEPLOY : DeploymentTrigger.MANUAL,
    requestedById: user.id,
    ...sharedScope(versions),
  });
  startInBackground(started);
  return started;
}

/** "Deploy approved": every approved version in a project and language, a language, or everywhere the caller may deploy. */
export async function deployScopeAction(input: unknown): Promise<DeployStarted> {
  const scope = deployScopeSchema.parse(input);
  const { user } = await authorize('authenticated');
  const versions = await versionsInScope(user, scope);

  const started = await deployments.queueDeployment({
    versionIds: versions.map((version) => version.id),
    trigger: DeploymentTrigger.MANUAL,
    requestedById: user.id,
    sourceProjectId: scope.sourceProjectId ?? null,
    languageId: scope.languageId ?? sharedScope(versions).languageId,
  });
  startInBackground(started);
  return started;
}

/** Sends the documents of a failed deployment that did not go out again, as a new deployment. */
export async function retryDeploymentAction(deploymentId: string): Promise<DeployStarted | Refusal> {
  z.string().min(1).parse(deploymentId);
  const { user } = await authorize('authenticated');
  await repository.failStaleDeployments();

  const deployment = await repository.getDeploymentScope(deploymentId);
  if (!deployment) return refuse('This deploy no longer exists.');
  if (deployment.status !== DeploymentStatus.FAILED) {
    return refuse('Only a failed deploy can be retried.');
  }

  const items = await repository.getRetryableItems(deploymentId);
  await authorizeLanguages(items.map((item) => item.documentVersion.languageId));
  if (items.length === 0) return refuse('Every document in this deploy already went out.');

  const started = await deployments.queueDeployment({
    versionIds: items.map((item) => item.documentVersionId),
    trigger: DeploymentTrigger.RETRY,
    requestedById: user.id,
    sourceProjectId: deployment.sourceProjectId,
    languageId: deployment.languageId,
    retryOfId: deployment.id,
  });
  startInBackground(started);
  return started;
}

/** One deployment, for following it live. */
export async function getDeploymentAction(deploymentId: string): Promise<DeploymentView | null> {
  z.string().min(1).parse(deploymentId);
  const { user } = await authorize('authenticated');
  await repository.failStaleDeployments();

  const record = await repository.getDeployment(deploymentId);
  if (!record) return null;
  if (user.role !== Role.ADMIN && record.requestedBy?.id !== user.id) {
    const mine = new Set(await deployableLanguageIds(user));
    const visible = record.items.some((item) => mine.has(item.documentVersion.languageId));
    if (!visible) throw new Error('Forbidden: this deploy is outside your languages');
  }
  return toDeploymentView(record);
}

/**
 * Deploy history, newest first: one document's, one project's in one
 * language, one language's, or everything the caller may see.
 */
export async function listDeploymentsAction(input: unknown = {}): Promise<DeploymentView[]> {
  const filter = historyFilterSchema.parse(input);
  const { user } = await authorize('authenticated');
  if (filter.languageId) await authorize({ language: filter.languageId, role: 'member' });
  await repository.failStaleDeployments();

  const languageIds = await deployableLanguageIds(user);
  const records = await repository.listDeployments({ ...filter, languageIds });
  return records.map(toDeploymentView);
}

/** Turns deploy-on-approval on or off for one project in one language. */
export async function setAutoDeployAction(input: unknown): Promise<{ id: string; autoDeploy: boolean }> {
  const { translationProjectId, enabled } = z
    .object({ translationProjectId: z.string().min(1), enabled: z.boolean() })
    .strict()
    .parse(input);
  await authorize({ project: translationProjectId, role: 'member' });

  const project = await repository.setTranslationProjectAutoDeploy(translationProjectId, enabled);
  revalidatePath('/projects/[project]', 'page');
  return { id: project.id, autoDeploy: project.autoDeploy };
}
