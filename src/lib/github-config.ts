import { z } from 'zod';

const githubConfigSchema = z.object({
  appId: z.string().min(1, 'GITHUB_APP_ID is required'),
  privateKey: z.string().min(1, 'GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_PATH is required'),
  webhookSecret: z.string().min(1, 'GITHUB_WEBHOOK_SECRET is required'),
  repoOwner: z.string().min(1, 'GITHUB_REPO_OWNER is required'),
  repoName: z.string().min(1, 'GITHUB_REPO_NAME is required'),
  installationId: z.coerce.number().int().positive('GITHUB_INSTALLATION_ID must be a positive integer'),
});

export type GitHubConfig = z.infer<typeof githubConfigSchema>;

let cachedConfig: GitHubConfig | null = null;

export function getGitHubConfig(): GitHubConfig {
  if (cachedConfig) return cachedConfig;

  let privateKey = process.env.GITHUB_PRIVATE_KEY;

  if (!privateKey && process.env.GITHUB_PRIVATE_KEY_PATH) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    try {
      privateKey = fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to read GitHub private key from path: ${process.env.GITHUB_PRIVATE_KEY_PATH}`);
    }
  }

  const result = githubConfigSchema.safeParse({
    appId: process.env.GITHUB_APP_ID,
    privateKey,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    repoOwner: process.env.GITHUB_REPO_OWNER,
    repoName: process.env.GITHUB_REPO_NAME,
    installationId: process.env.GITHUB_INSTALLATION_ID,
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
