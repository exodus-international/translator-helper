import { readFileSync } from 'node:fs';
import { z } from 'zod';

const githubConfigSchema = z.object({
  appId: z.string().min(1, 'GITHUB_APP_ID is required'),
  privateKey: z.string().min(1, 'GITHUB_APP_PRIVATE_KEY (or GITHUB_PRIVATE_KEY_BASE64, GITHUB_PRIVATE_KEY, GITHUB_PRIVATE_KEY_PATH) is required'),
  repoOwner: z.string().min(1, 'GITHUB_REPO_OWNER is required'),
  repoName: z.string().min(1, 'GITHUB_REPO_NAME is required'),
  installationId: z.coerce.number().int().positive('GITHUB_INSTALLATION_ID must be a positive integer'),
  /**
   * Where the GitHub API is. Unset means github.com; a GitHub Enterprise
   * host or a local stand-in sets it.
   */
  apiBaseUrl: z.string().url().optional(),
  /**
   * The branch a deploy commits to. The site reads the content repository
   * from it, so a deploy is live once its commit lands there.
   */
  deployBranch: z.string().min(1),
});

type GitHubConfig = z.infer<typeof githubConfigSchema>;

let cachedConfig: GitHubConfig | null = null;

/**
 * The GitHub App's private key, from the first of these that is set:
 * GITHUB_PRIVATE_KEY_BASE64, GITHUB_APP_PRIVATE_KEY, GITHUB_PRIVATE_KEY,
 * then the file GITHUB_PRIVATE_KEY_PATH names. Every name stays supported,
 * so an environment set up for an older version keeps working.
 */
export function privateKeyFromEnv(env: Record<string, string | undefined>): string | undefined {
  if (env.GITHUB_PRIVATE_KEY_BASE64) {
    return Buffer.from(env.GITHUB_PRIVATE_KEY_BASE64, 'base64').toString('utf-8');
  }
  const inline = env.GITHUB_APP_PRIVATE_KEY || env.GITHUB_PRIVATE_KEY;
  if (inline) return inline;
  if (!env.GITHUB_PRIVATE_KEY_PATH) return undefined;
  try {
    return readFileSync(env.GITHUB_PRIVATE_KEY_PATH, 'utf-8');
  } catch {
    throw new Error(`Failed to read GitHub private key from path: ${env.GITHUB_PRIVATE_KEY_PATH}`);
  }
}

export function getGitHubConfig(): GitHubConfig {
  if (cachedConfig) return cachedConfig;

  const privateKey = privateKeyFromEnv(process.env);

  const result = githubConfigSchema.safeParse({
    appId: process.env.GITHUB_APP_ID,
    privateKey,
    repoOwner: process.env.GITHUB_REPO_OWNER,
    repoName: process.env.GITHUB_REPO_NAME,
    installationId: process.env.GITHUB_INSTALLATION_ID,
    apiBaseUrl: process.env.GITHUB_API_BASE_URL || undefined,
    deployBranch: process.env.GITHUB_DEPLOY_BRANCH || 'main',
  });

  if (!result.success) {
    const errors = result.error.issues.map((i) => i.message).join(', ');
    throw new Error(`GitHub configuration is incomplete: ${errors}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

export function isGitHubConfigured(): boolean {
  try {
    getGitHubConfig();
    console.log('[GitHub] Config loaded successfully');
    return true;
  } catch (error: any) {
    console.log('[GitHub] Not configured:', error.message);
    return false;
  }
}
