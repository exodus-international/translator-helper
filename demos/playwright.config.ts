import { defineConfig } from '@playwright/test';

/**
 * Product demos: scripted walkthroughs recorded as video, then turned into the
 * GIFs the release notes embed. Not tests -- nothing here asserts behaviour
 * beyond what a scene needs in order to continue. See demos/README.md.
 *
 * Runs against a server you start yourself (the `demo` launch configuration,
 * or the command in the README), backed by `translation_helper_demo`.
 */
export const DEMO_VIEWPORT = { width: 1440, height: 900 };

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.demo\.ts/,
  outputDir: './output/.playwright',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.DEMO_URL || 'http://localhost:3300',
    viewport: DEMO_VIEWPORT,
    // Recording is set up per scene (see support/stage.ts), so each video
    // starts and ends where the scene does.
    video: 'off',
  },
});
