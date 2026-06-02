import prisma from '@/lib/db';
import { getGitHubConfig } from '@/lib/github-config';
import { GitHubPRStatus } from '@prisma/client';
import crypto from 'crypto';
import { App } from 'octokit';
import { resolveFilePath } from './github.paths';
import { createGitHubCommit } from './github.repository';

const LOG_PREFIX = '[GitHub]';

let appInstance: App | null = null;

function getApp(): App {
  if (appInstance) return appInstance;
  const config = getGitHubConfig();
  console.log(`${LOG_PREFIX} Creating GitHub App instance (appId: ${config.appId})`);
  appInstance = new App({
    appId: config.appId,
    privateKey: config.privateKey,
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
    console.log(`${LOG_PREFIX} Found existing open PR: #${existing.number} — ${existing.html_url}`);
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

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const config = getGitHubConfig();
  const expected = 'sha256=' + crypto.createHmac('sha256', config.webhookSecret).update(payload).digest('hex');

  const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  console.log(`${LOG_PREFIX} Webhook signature verification: ${valid ? 'VALID' : 'INVALID'}`);
  return valid;
}

export async function deployToGitHub(documentVersionId: string): Promise<{ prUrl: string }> {
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
  console.log(`${LOG_PREFIX} Source project identifier: ${document.sourceProject?.identifier || 'NOT SET'}`);

  // Validate required fields
  if (!language.branchName) {
    throw new Error(`Language "${language.name}" does not have a branchName configured`);
  }

  if (!document.sourceProject) {
    throw new Error(`Document "${document.title}" is not associated with a source project`);
  }

  if (!document.sourceProject.identifier) {
    throw new Error(`Source project "${document.sourceProject.name}" does not have an identifier configured`);
  }

  if (!document.type) {
    throw new Error(`Document "${document.title}" does not have a type set`);
  }

  // Verify branch exists
  const branchExists = await verifyBranchExists(language.branchName);
  if (!branchExists) {
    throw new Error(`Branch "${language.branchName}" does not exist in the repository`);
  }

  // Resolve file path
  const filePath = resolveFilePath({
    documentType: document.type,
    languageCode: language.code,
    identifier: document.sourceProject.identifier,
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
  const prTitle = `[${language.name}] [${document.sourceProject.name}] ${document.originalFilename} - ${document.title}`;
  const prBody = [
    `## Translation Deploy`,
    '',
    `- **Document**: ${document.title}`,
    `- **Language**: ${language.name} (${language.code})`,
    `- **File**: \`${filePath}\``,
    `- **Source Project**: ${document.sourceProject.name}`,
    `- **Translator**: ${version.user?.name ?? 'Unassigned'}`,
    `- **Link to document**: ${process.env.NEXT_PUBLIC_APP_URL}/documents/${document.id}/review?version=${version.id}`,
  ].join('\n');

  const pr = await findOrCreatePullRequest(language.branchName, prTitle, prBody);

  // Save to database
  console.log(`${LOG_PREFIX} Saving GitHubCommit record to database`);
  await createGitHubCommit({
    documentVersionId,
    commitSha,
    branchName: language.branchName,
    filePath,
    prNumber: pr.number,
    prUrl: pr.url,
    prStatus: GitHubPRStatus.OPEN,
  });

  console.log(`${LOG_PREFIX} ========== GitHub deploy complete ==========`);
  return { prUrl: pr.url };
}
