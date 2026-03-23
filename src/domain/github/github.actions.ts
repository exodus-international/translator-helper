'use server';

import { authorize } from '@/lib/authorize';
import { getGitHubCommitsByVersionId } from './github.repository';
import { deployToGitHub } from './github.service';

export async function deployToGitHubAction(documentVersionId: string) {
  await authorize('can:deploy');

  return await deployToGitHub(documentVersionId);
}

export async function getGitHubCommitsForVersionAction(documentVersionId: string) {
  await authorize('authenticated');
  return await getGitHubCommitsByVersionId(documentVersionId);
}
