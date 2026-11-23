import { generateKeyPairSync } from 'node:crypto';

/**
 * What the application is told about GitHub while the suite runs, and the
 * handles a step uses to steer the stand-in.
 *
 * All of it points at `github-mock.mjs`. Its values are repeated here rather
 * than imported, because importing that file would start the server in
 * whichever process did the importing.
 */
export const GITHUB_STUB = {
  port: Number(process.env.GITHUB_MOCK_PORT || 3198),
  repository: 'stub/content',
  branch: 'main',
  /** What the stand-in answers a branch update it was told to refuse. */
  refusedMessage: 'Resource not accessible by integration',
} as const;

const mockUrl = (path: string) => `http://localhost:${GITHUB_STUB.port}${path}`;

async function post(path: string): Promise<void> {
  const response = await fetch(mockUrl(path), { method: 'POST' });
  if (!response.ok) throw new Error(`github mock: ${path} answered ${response.status}`);
}

/** GitHub refuses the next deploy's branch update, once, as it does an App with no push rights. */
export const refuseNextGitHubPush = () => post('/__mock/fail-next');

/** An empty content repository again, with nothing set to fail. */
export const resetGitHubMock = () => post('/__mock/reset');

/** How many commits the deploy branch has had since the last reset. */
export async function gitHubMockState(): Promise<{ head: string; commits: number; files: string[] }> {
  const response = await fetch(mockUrl('/__mock/state'));
  return response.json();
}

/**
 * The environment the Next server needs to believe GitHub is configured.
 *
 * The private key is a real RSA key made fresh for the run: the app signs a
 * JWT with it before asking for an installation token, and that signature is
 * checked by nobody, but the signing itself needs a key that parses. PKCS#8
 * is the format the JWT library takes without conversion.
 */
export function githubStubEnv(): Record<string, string> {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return {
    GITHUB_API_BASE_URL: `http://localhost:${GITHUB_STUB.port}`,
    GITHUB_APP_ID: '1',
    GITHUB_INSTALLATION_ID: '1',
    GITHUB_REPO_OWNER: 'stub',
    GITHUB_REPO_NAME: 'content',
    GITHUB_APP_PRIVATE_KEY: privateKey,
    GITHUB_DEPLOY_BRANCH: GITHUB_STUB.branch,
  };
}
