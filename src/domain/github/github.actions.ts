'use server';

import { authorize } from '@/lib/authorize';
import { getDocumentVersionLanguage } from '@/domain/document-version/document-version.repository';
import { getGitHubCommitsByVersionId } from './github.repository';
import { deployToGitHub } from './github.service';

/**
 * Retrying a deploy publishes the same language's work, so it asks the same
 * question the status transition does: an administrator, or this language's
 * manager.
 */
export async function deployToGitHubAction(documentVersionId: string) {
  const version = await getDocumentVersionLanguage(documentVersionId);
  if (!version) {
    throw new Error('Document version not found');
  }

  await authorize({ language: version.languageId, role: 'manager' });

  return await deployToGitHub(documentVersionId);
}

export async function getGitHubCommitsForVersionAction(documentVersionId: string) {
  await authorize('authenticated');
  return await getGitHubCommitsByVersionId(documentVersionId);
}
