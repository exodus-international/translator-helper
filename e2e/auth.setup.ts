import fs from 'node:fs';
import path from 'node:path';
import { test as setup } from '@playwright/test';
import { IDENTITIES, sessionFile, type IdentityName } from './support/identities';
import { completeOnboardingIfShown, signIn } from './support/sign-in';

/**
 * better-auth allows three sign-in attempts per ten seconds, and enables that
 * limit in production only. Signing four people in one after another therefore
 * works against a dev server and refuses the fourth against a real build,
 * which is what CI serves.
 *
 * Waiting the window out is the honest answer: the limit is doing its job and
 * the suite is the unusual caller. The wait only happens when an attempt is
 * actually refused.
 */
const RATE_LIMIT_WINDOW_MS = 11_000;
const ATTEMPTS = 3;

// Room for two waited-out windows plus the work itself.
setup.setTimeout(90_000);

/**
 * Signs in each seeded identity once and stores its session.
 *
 * Scenarios then start already signed in, which keeps them about the thing
 * they are testing rather than about logging in. The cost is that a session is
 * shared: a scenario that signs out revokes it for every later scenario using
 * the same identity, so the sign-out scenario signs in fresh and stays
 * untagged.
 */
for (const [name, email] of Object.entries(IDENTITIES) as [IdentityName, string][]) {
  setup(`authenticate as ${name}`, async ({ page }) => {
    for (let attempt = 1; ; attempt++) {
      await signIn(page, email);
      try {
        // Short on purpose: a refusal has to be noticed while there is still
        // time to wait out the window and try again.
        await page.waitForURL(/\/(dashboard|onboarding\/profile)/, { timeout: 10_000 });
        break;
      } catch (error) {
        if (attempt === ATTEMPTS) throw error;
        await page.waitForTimeout(RATE_LIMIT_WINDOW_MS);
      }
    }

    await completeOnboardingIfShown(page);
    await page.waitForURL('**/dashboard');

    const file = sessionFile(name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.context().storageState({ path: file });
  });
}
