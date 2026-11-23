import { App, Octokit } from 'octokit';
import { getGitHubConfig } from '@/lib/github-config';
import type { PublishDeps } from './github.publish';

/**
 * The octokit side of publishing: the GitHub App's installation client, and
 * the five Git data calls `publishFiles` makes through it. Everything that
 * decides anything lives in github.publish.ts.
 */

const LOG_PREFIX = '[GitHub]';

let appInstance: App | null = null;

function getApp(): App {
  if (appInstance) return appInstance;
  const config = getGitHubConfig();
  appInstance = new App({
    appId: config.appId,
    privateKey: config.privateKey,
    // Every client the app hands out, including the installation one that
    // fetches its own token, inherits this base URL.
    ...(config.apiBaseUrl && { Octokit: Octokit.defaults({ baseUrl: config.apiBaseUrl }) }),
  });
  return appInstance;
}

/** Where a deploy lands, for the confirmation to name. */
export function describeDeployTarget(): { repository: string; branch: string } {
  const config = getGitHubConfig();
  return { repository: `${config.repoOwner}/${config.repoName}`, branch: config.deployBranch };
}

/** The publisher's dependencies, bound to the configured repository and deploy branch. */
// Loaded with a dynamic import by the deployment service, which the dead-code check does not follow.
// fallow-ignore-next-line unused-export
export async function createGitHubPublishDeps(): Promise<PublishDeps & { branch: string }> {
  const config = getGitHubConfig();
  const octokit = await getApp().getInstallationOctokit(config.installationId);
  const repo = { owner: config.repoOwner, repo: config.repoName };
  const branch = config.deployBranch;

  return {
    branch,
    getHead: async () => {
      const { data: ref } = await octokit.rest.git.getRef({ ...repo, ref: `heads/${branch}` });
      const { data: commit } = await octokit.rest.git.getCommit({ ...repo, commit_sha: ref.object.sha });
      return { commitSha: commit.sha, treeSha: commit.tree.sha };
    },
    getBlobSha: async (path, ref) => {
      try {
        const { data } = await octokit.rest.repos.getContent({ ...repo, path, ref });
        return !Array.isArray(data) && data.type === 'file' ? data.sha : null;
      } catch (error) {
        if ((error as { status?: unknown }).status === 404) return null;
        throw error;
      }
    },
    createTree: async (baseTree, files) => {
      const { data } = await octokit.rest.git.createTree({
        ...repo,
        base_tree: baseTree,
        tree: files.map((file) => ({ path: file.path, mode: '100644', type: 'blob', content: file.content })),
      });
      return data.sha;
    },
    createCommit: async (message, tree, parent) => {
      const { data } = await octokit.rest.git.createCommit({ ...repo, message, tree, parents: [parent] });
      console.log(`${LOG_PREFIX} Created commit ${data.sha.substring(0, 7)} on ${branch}`);
      return { sha: data.sha, url: data.html_url };
    },
    updateBranch: async (sha) => {
      await octokit.rest.git.updateRef({ ...repo, ref: `heads/${branch}`, sha, force: false });
    },
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
