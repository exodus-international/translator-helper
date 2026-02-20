'use server';

import { canDeploy } from '@/lib/permissions';
import { requireUser } from '@/lib/session';
import { getGitHubCommitsByVersionId } from './github.repository';
import { deployToGitHub } from './github.service';

export async function deployToGitHubAction(documentVersionId: string) {
  const user = await requireUser();

  if (!canDeploy(user)) {
    throw new Error('Forbidden: Only deployers can deploy to GitHub');
  }

  return await deployToGitHub(documentVersionId);
}

export async function getGitHubCommitsForVersionAction(documentVersionId: string) {
  await requireUser();
  return await getGitHubCommitsByVersionId(documentVersionId);
}
