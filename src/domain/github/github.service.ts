import { buildDocumentPath } from '@/domain/document/document-url';
import prisma from '@/lib/db';
import { getGitHubConfig } from '@/lib/github-config';
import { GitHubPRStatus } from '@/generated/prisma/enums';
import { App, Octokit } from 'octokit';
import { resolveFilePath } from './github.paths';
import { createGitHubCommit, markPullRequestMerged } from './github.repository';
import { DeploySkippedError } from './github.errors';
import { mergePullRequest, type MergeOutcome } from './github.merge';

const LOG_PREFIX = '[GitHub]';

let appInstance: App | null = null;

function getApp(): App {
  if (appInstance) return appInstance;
  const config = getGitHubConfig();
  console.log(`${LOG_PREFIX} Creating GitHub App instance (appId: ${config.appId})`);
  appInstance = new App({
    appId: config.appId,
    privateKey: config.privateKey,
    // Every client the app hands out, including the installation one that
    // fetches its own token, inherits this base URL.
    ...(config.apiBaseUrl && { Octokit: Octokit.defaults({ baseUrl: config.apiBaseUrl }) }),
  });
  return appInstance;
}

async function getOctokit() {
  const config = getGitHubConfig();
  const app = getApp();
  console.log(`${LOG_PREFIX} Getting installation octokit (installationId: ${config.installationId})`);
  return app.getInstallationOctokit(config.installationId);
}

async function verifyBranchExists(branch: string): Promise<boolean> {
  const config = getGitHubConfig();
  const octokit = await getOctokit();

  console.log(`${LOG_PREFIX} Checking if branch exists: ${branch} (${config.repoOwner}/${config.repoName})`);
  try {
    await octokit.rest.repos.getBranch({
      owner: config.repoOwner,
      repo: config.repoName,
      branch,
    });
    console.log(`${LOG_PREFIX} Branch "${branch}" exists`);
    return true;
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`${LOG_PREFIX} Branch "${branch}" does NOT exist (404)`);
      return false;
    }
    console.error(`${LOG_PREFIX} Error checking branch "${branch}":`, error.message);
    throw error;
  }
}

/**
 * Makes the language branch again from main.
 *
 * Only a deploy that merges calls this: if the content repository deletes
 * head branches on merge, the first merge takes the language branch with it,
 * and every deploy after it would fail on a branch that no longer exists.
 * Main already holds everything the old branch carried, so a branch cut from
 * it loses nothing.
 */
async function createBranchFromMain(branch: string): Promise<void> {
  const config = getGitHubConfig();
  const octokit = await getOctokit();

  const { data: main } = await octokit.rest.repos.getBranch({
    owner: config.repoOwner,
    repo: config.repoName,
    branch: 'main',
  });
  console.log(`${LOG_PREFIX} Creating branch "${branch}" from main (sha: ${main.commit.sha.substring(0, 7)})`);
  await octokit.rest.git.createRef({
    owner: config.repoOwner,
    repo: config.repoName,
    ref: `refs/heads/${branch}`,
    sha: main.commit.sha,
  });
}

/**
 * Merges the deploy's pull request into main with a merge commit.
 *
 * Never a squash or a rebase: the language branch outlives the merge, and
 * either would put new commits on main that the branch does not have, so the
 * next pull request would carry this deploy's commits again.
 */
async function mergeDeployPullRequest(params: {
  prNumber: number;
  headSha: string;
  title: string;
}): Promise<MergeOutcome> {
  const config = getGitHubConfig();
  const octokit = await getOctokit();

  console.log(`${LOG_PREFIX} Merging PR #${params.prNumber} at ${params.headSha.substring(0, 7)}`);
  const outcome = await mergePullRequest(
    {
      merge: async (sha) => {
        const { data } = await octokit.rest.pulls.merge({
          owner: config.repoOwner,
          repo: config.repoName,
          pull_number: params.prNumber,
          sha,
          merge_method: 'merge',
          commit_title: `${params.title} (#${params.prNumber})`,
        });
        return { sha: data.sha };
      },
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
    params.headSha,
  );

  if (outcome.merged) {
    console.log(`${LOG_PREFIX} PR #${params.prNumber} merged (sha: ${outcome.sha.substring(0, 7)})`);
  } else {
    console.warn(`${LOG_PREFIX} PR #${params.prNumber} left open: ${outcome.reason}`);
  }
  return outcome;
}

async function commitFileToRepo(params: {
  branch: string;
  filePath: string;
  content: string;
  commitMessage: string;
}): Promise<string> {
  const config = getGitHubConfig();
  const octokit = await getOctokit();

  console.log(`${LOG_PREFIX} Committing file: ${params.filePath} to branch: ${params.branch}`);

  // Check if file already exists to get its SHA
  let existingSha: string | undefined;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: config.repoOwner,
      repo: config.repoName,
      path: params.filePath,
      ref: params.branch,
    });
    if (!Array.isArray(data) && data.type === 'file') {
      existingSha = data.sha;
      console.log(`${LOG_PREFIX} File already exists, will update (sha: ${existingSha.substring(0, 7)})`);
    }
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`${LOG_PREFIX} File does not exist yet, will create new`);
    } else {
      console.error(`${LOG_PREFIX} Error checking existing file:`, error.message);
      throw error;
    }
  }

  const { data } = await octokit.rest.repos.createOrUpdateFileContents({
    owner: config.repoOwner,
    repo: config.repoName,
    path: params.filePath,
    message: params.commitMessage,
    content: Buffer.from(params.content).toString('base64'),
    branch: params.branch,
    ...(existingSha && { sha: existingSha }),
  });

  const commitSha = data.commit.sha!;
  console.log(`${LOG_PREFIX} File committed successfully (sha: ${commitSha.substring(0, 7)})`);
  return commitSha;
}

async function findOrCreatePullRequest(
  branch: string,
  title: string,
  body: string,
): Promise<{ number: number; url: string }> {
  const config = getGitHubConfig();
  const octokit = await getOctokit();

  // Check if an open PR already exists for this branch
  console.log(`${LOG_PREFIX} Checking for existing PR from ${branch} → main`);
  const { data: existingPRs } = await octokit.rest.pulls.list({
    owner: config.repoOwner,
    repo: config.repoName,
    head: `${config.repoOwner}:${branch}`,
    base: 'main',
    state: 'open',
  });

  if (existingPRs.length > 0) {
    const existing = existingPRs[0];
    console.log(`${LOG_PREFIX} Found existing open PR: #${existing.number} — ${existing.html_url}, updating body`);
    // The body carries per-deploy facts (file, audio link), so a redeploy to
    // the same branch must refresh it rather than keep the first deploy's.
    await octokit.rest.pulls.update({
      owner: config.repoOwner,
      repo: config.repoName,
      pull_number: existing.number,
      title,
      body,
    });
    return { number: existing.number, url: existing.html_url };
  }

  // No existing PR, create a new one
  console.log(`${LOG_PREFIX} Creating PR: "${title}" (${branch} → main)`);
  const { data } = await octokit.rest.pulls.create({
    owner: config.repoOwner,
    repo: config.repoName,
    title,
    body,
    head: branch,
    base: 'main',
  });

  console.log(`${LOG_PREFIX} PR created: #${data.number} — ${data.html_url}`);
  return { number: data.number, url: data.html_url };
}

export interface DeployResult {
  prUrl: string;
  /** Only when merging on deploy is on; absent means the pull request was left open by design. */
  merge?: MergeOutcome;
}

export async function deployToGitHub(documentVersionId: string): Promise<DeployResult> {
  console.log(`${LOG_PREFIX} ========== Starting GitHub deploy ==========`);
  console.log(`${LOG_PREFIX} Document version ID: ${documentVersionId}`);

  const version = await prisma.documentVersion.findUnique({
    where: { id: documentVersionId },
    include: {
      document: {
        include: {
          sourceProject: true,
        },
      },
      language: true,
      user: true,
    },
  });

  if (!version) {
    throw new Error(`Document version not found: ${documentVersionId}`);
  }

  const { document, language } = version;
  console.log(`${LOG_PREFIX} Document: "${document.title}" (slug: ${document.slug})`);
  console.log(`${LOG_PREFIX} Language: ${language.name} (${language.code})`);
  console.log(`${LOG_PREFIX} Document type: ${document.type || 'NOT SET'}`);
  console.log(`${LOG_PREFIX} Original filename: ${document.originalFilename || 'NOT SET'}`);
  console.log(`${LOG_PREFIX} Branch name: ${language.branchName || 'NOT SET'}`);
  console.log(`${LOG_PREFIX} Source project: ${document.sourceProject?.name || 'NOT SET'}`);
  console.log(`${LOG_PREFIX} Repository directory: ${document.sourceProject?.repositoryDirectory || 'NOT SET'}`);

  // Validate required fields
  if (!language.branchName) {
    throw new Error(`Language "${language.name}" does not have a branchName configured`);
  }

  if (!document.sourceProject) {
    throw new Error(`Document "${document.title}" is not associated with a source project`);
  }

  if (!document.sourceProject.repositoryDirectory) {
    throw new DeploySkippedError(
      `Source project "${document.sourceProject.name}" has no repository directory, so it is not deployed to GitHub`,
    );
  }

  if (!document.type) {
    throw new Error(`Document "${document.title}" does not have a type set`);
  }

  const { mergeOnDeploy } = getGitHubConfig();

  // Verify branch exists
  const branchExists = await verifyBranchExists(language.branchName);
  if (!branchExists) {
    if (!mergeOnDeploy) {
      throw new Error(`Branch "${language.branchName}" does not exist in the repository`);
    }
    await createBranchFromMain(language.branchName);
  }

  // Resolve file path
  const filePath = resolveFilePath({
    documentType: document.type,
    languageCode: language.code,
    repositoryDirectory: document.sourceProject.repositoryDirectory,
    originalFilename: document.originalFilename,
    slug: document.slug,
  });

  // Commit the file
  const commitMessage = `chore: deploy ${language.name} translation for "${document.title}"`;
  console.log(`${LOG_PREFIX} Commit message: ${commitMessage}`);
  const commitSha = await commitFileToRepo({
    branch: language.branchName,
    filePath,
    content: version.content,
    commitMessage,
  });

  // Create PR
  const { getAudioReadiness } = await import('../audio/audio.service');
  const audio = await getAudioReadiness(documentVersionId);
  const prTitle = `[${language.name}] [${document.sourceProject.name}] ${document.originalFilename} - ${document.title}`;
  const prBody = [
    `## Translation Deploy`,
    '',
    `- **Document**: ${document.title}`,
    `- **Language**: ${language.name} (${language.code})`,
    `- **File**: \`${filePath}\``,
    `- **Source Project**: ${document.sourceProject.name}`,
    `- **Translator**: ${version.user?.name ?? 'Unassigned'}`,
    `- **Link to document**: ${process.env.NEXT_PUBLIC_APP_URL}${buildDocumentPath({ projectSlug: document.sourceProject?.slug, slug: document.slug, languageCode: version.language.code, documentId: document.id })}`,
    ...(audio.state === 'ready' && audio.url ? [`- **Audio**: ${audio.url}`] : []),
  ].join('\n');

  const pr = await findOrCreatePullRequest(language.branchName, prTitle, prBody);

  const merge = mergeOnDeploy
    ? await mergeDeployPullRequest({ prNumber: pr.number, headSha: commitSha, title: prTitle })
    : undefined;

  // Save to database
  console.log(`${LOG_PREFIX} Saving GitHubCommit record to database`);
  await createGitHubCommit({
    documentVersionId,
    commitSha,
    branchName: language.branchName,
    filePath,
    prNumber: pr.number,
    prUrl: pr.url,
    prStatus: merge?.merged ? GitHubPRStatus.MERGED : GitHubPRStatus.OPEN,
  });

  // The merge took every earlier deploy still waiting in this pull request
  // with it. The webhook says so too, but it can land before the row above
  // exists, or not at all where no webhook is set up.
  if (merge?.merged) {
    await markPullRequestMerged(pr.number);
  }

  console.log(`${LOG_PREFIX} ========== GitHub deploy complete ==========`);
  return { prUrl: pr.url, merge };
}
