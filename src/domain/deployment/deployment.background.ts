import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { DeploymentTrigger } from '@/generated/prisma/enums';
import { deployments } from './deployment.service';
import * as repository from './deployment.repository';
import type { DeployStarted } from './deployment.types';

/**
 * Starting deploys from server code. Kept out of deployment.actions.ts on
 * purpose: everything exported from a 'use server' file can be called from a
 * browser, and these take the actor on trust from their caller.
 */

/** Publishes a queued deployment after the response has gone out. */
export function startInBackground(started: DeployStarted): void {
  const { deploymentId } = started;
  if (!deploymentId) return;
  // Claiming is conditional, so scheduling a deployment that is already
  // running does nothing; scheduling it again picks up one whose first
  // request never ran.
  after(async () => {
    await deployments.runDeployment(deploymentId);
    try {
      revalidatePath('/documents/[project]/[slug]/[lang]', 'page');
    } catch {
      // Nothing cached to drop outside a request; the page refreshes itself.
    }
  });
}

/**
 * Starts a deploy for a version that was just approved, when its project in
 * that language deploys on approval. The status change has already checked
 * the approver. Returns the deployment to follow, or null.
 */
export async function startAutoDeploy(versionId: string, actorId: string): Promise<string | null> {
  const project = await repository.getTranslationProjectForVersion(versionId);
  if (!project?.autoDeploy) return null;

  const started = await deployments.queueDeployment({
    versionIds: [versionId],
    trigger: DeploymentTrigger.AUTO,
    requestedById: actorId,
    sourceProjectId: project.sourceProjectId,
    languageId: project.languageId,
  });
  startInBackground(started);
  return started.deploymentId;
}
