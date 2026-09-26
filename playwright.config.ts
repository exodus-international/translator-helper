import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import dotenv from 'dotenv';
import { GITHUB_STUB, githubStubEnv } from './e2e/support/github-stub';

// The isolated end-to-end environment: its own database and its own port, so a
// test run can never reach development data or collide with `pnpm dev`.
dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true });

const testDir = defineBddConfig({
  features: 'e2e/features/**/*.feature',
  steps: 'e2e/steps/**/*.ts',
});

const PORT = process.env.PORT || '3100';
const OPENAI_MOCK_PORT = process.env.OPENAI_MOCK_PORT || '3199';
const baseURL = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${PORT}`;

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  // Every scenario shares one seeded database, so they run in order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Signs in each seeded role once and stores the session for reuse.
    { name: 'setup', testDir: './e2e', testMatch: /auth\.setup\.ts/ },
    {
      name: 'e2e',
      testDir,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      // Stands in for the chat completions endpoint. AI translation runs in a
      // server action, so the request never passes through the browser and
      // page.route cannot reach it.
      command: 'node e2e/support/openai-mock.mjs',
      url: `http://localhost:${OPENAI_MOCK_PORT}`,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Stands in for the GitHub API, for the same reason: deploying runs in
      // a server action. Nothing leaves the machine and no pull request is
      // opened.
      command: 'node e2e/support/github-mock.mjs',
      url: `http://localhost:${GITHUB_STUB.port}`,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    },
    {
    // CI serves a production build, which is what actually ships: dev and
    // production differ in caching, error handling and route behaviour, and a
    // suite that only ever saw dev would miss that. Locally it stays on dev,
    // where a rebuild between runs would cost more than it finds.
    //
    // Either way this bypasses the repo's own `dev` script on purpose: that
    // script sources `.env`, which carries the development database URL.
    command: process.env.CI
      ? `pnpm exec next start --port ${PORT}`
      : `pnpm exec next dev --port ${PORT}`,
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    // Next does not override variables already present in the environment, so
    // passing these explicitly is what stops `.env.local` winning.
    //
    // NEXT_PUBLIC_POSTHOG_KEY is deliberately absent: without it the analytics
    // provider no-ops, and test runs stay out of production analytics.
    env: {
      DATABASE_URL: process.env.DATABASE_URL!,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET!,
      NEXT_PUBLIC_APP_URL: baseURL,
      CHATGPT_API: process.env.CHATGPT_API || 'sk-test-not-used',
      CHATGPT_API_BASE_URL: `http://localhost:${OPENAI_MOCK_PORT}`,
      // Points the app at the GitHub stand-in, with a key made for this run.
      // Set here rather than in .env.test or CI so a real GITHUB_* value in
      // .env.local can never reach a test run.
      ...githubStubEnv(),
      PORT,
    },
    },
  ],
});
