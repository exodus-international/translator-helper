import fs from 'node:fs';
import path from 'node:path';
import { test as setup } from '@playwright/test';
import { IDENTITIES, sessionFile, type IdentityName } from './support/identities';
import { signInAndSettle } from './support/sign-in';

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
    await signInAndSettle(page, email);

    const file = sessionFile(name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.context().storageState({ path: file });
  });
}
