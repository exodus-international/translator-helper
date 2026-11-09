'use server';

import { authorize } from '@/lib/authorize';
import { getDocumentVersionLanguageAndStatus } from '@/domain/document-version/document-version.repository';
import { assertDeployableStatus } from './github.deployable';
import { getGitHubCommitsByVersionId } from './github.repository';
import { deployToGitHub } from './github.service';

/**
 * Retrying a deploy publishes the same language's work, so it asks the same
 * question the status transition does: an administrator, or this language's
 * manager. And like the transition, it publishes only reviewed text: the
 * version must be APPROVED or DEPLOYED.
 */
export async function deployToGitHubAction(documentVersionId: string) {
  const version = await getDocumentVersionLanguageAndStatus(documentVersionId);
  if (!version) {
    throw new Error('Document version not found');
  }

  await authorize({ language: version.languageId, role: 'manager' });
  assertDeployableStatus(version.status);

  return await deployToGitHub(documentVersionId);
}

export async function getGitHubCommitsForVersionAction(documentVersionId: string) {
  await authorize('authenticated');
  return await getGitHubCommitsByVersionId(documentVersionId);
}
