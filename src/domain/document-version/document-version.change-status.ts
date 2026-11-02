import { revalidatePath } from 'next/cache';
import { isGitHubConfigured } from '@/lib/github-config';
import { createActivityLog } from '../activity-log/activity-log.repository';
import { notifyStatusChange } from '../notification/notification.service';
import { countOpenSuggestions } from '../suggestion/suggestion.repository';
import { updateDocumentVersionStatus } from './document-version.repository';
import { createStatusChange } from './document-version.status-change';

/**
 * The status change as the app wires it: real repositories, the GitHub and
 * audio services loaded on demand so a page that never deploys never loads
 * octokit, and the document page revalidated when something it shows moved.
 *
 * Its own module, not the actions file, because the AI workflow moves
 * versions with it too, and a 'use server' file can export only actions.
 */
export const changeStatus = createStatusChange({
  countOpenSuggestions,
  updateStatus: updateDocumentVersionStatus,
  log: createActivityLog,
  notify: notifyStatusChange,
  github: {
    isConfigured: () => isGitHubConfigured(),
    deploy: async (versionId) => {
      const { deployToGitHub } = await import('../github/github.service');
      return deployToGitHub(versionId);
    },
  },
  startAudio: async (versionId, userId) => {
    const { startGeneration } = await import('../audio/audio.service');
    return startGeneration(versionId, userId);
  },
  revalidateDocumentPage: () => revalidatePath('/documents/[project]/[slug]/[lang]', 'page'),
});
