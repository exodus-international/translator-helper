import { generateKeyPairSync } from 'node:crypto';

/**
 * What the application is told about GitHub while the suite runs.
 *
 * All of it points at `github-mock.mjs`. The pull request number is repeated
 * from that file rather than imported, because importing it would start the
 * server in whichever process did the importing.
 */
export const GITHUB_STUB = {
  port: Number(process.env.GITHUB_MOCK_PORT || 3198),
  prNumber: 42,
} as const;

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
    GITHUB_WEBHOOK_SECRET: 'stub-webhook-secret',
    GITHUB_PRIVATE_KEY: privateKey,
  };
}
