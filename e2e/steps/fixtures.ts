import fs from 'node:fs';
import { test as base, createBdd } from 'playwright-bdd';
import { identityFromTags, sessionFile } from '../support/identities';

type SuiteFixtures = {
  /** Per-scenario scratch space for values one step hands to the next. */
  world: Record<string, string>;
};

export const test = base.extend<SuiteFixtures>({
  /**
   * Picks who a scenario runs as from its tags.
   *
   * An untagged scenario runs logged out, which is what the authentication and
   * guard scenarios need. Anything else reuses the session captured during
   * setup.
   */
  storageState: async ({ $tags }, use) => {
    const identity = identityFromTags($tags);
    if (!identity) {
      await use({ cookies: [], origins: [] });
      return;
    }

    const file = sessionFile(identity);
    if (!fs.existsSync(file)) {
      throw new Error(
        `No stored session for @${identity}. The setup project should have created ${file}.`,
      );
    }

    await use(file);
  },

  world: async ({}, use) => {
    await use({});
  },
});

export const { Given, When, Then } = createBdd(test);
