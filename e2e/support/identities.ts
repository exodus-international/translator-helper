import path from 'node:path';

/**
 * The seeded people the suite signs in as.
 *
 * These mirror `prisma/seed-data/datasets.ts`. A scenario picks one by tag
 * (`@translator`), never by email, so a scenario reads as "a translator does
 * X" rather than naming a fixture row.
 *
 * `translator2` is absent because nothing needs it. Onboarding is covered by
 * the registration scenarios instead: the seed marks every seeded person as
 * onboarded, so only a freshly registered account still meets that form.
 */
export const IDENTITIES = {
  admin: 'admin@example.org',
  admin2: 'admin2@example.org',
  translator: 'translator@example.org',
  reviewer: 'reviewer@example.org',
} as const;

export type IdentityName = keyof typeof IDENTITIES;

/** Every seeded account shares this password. */
export const SEED_PASSWORD = 'Hello123456';

/**
 * Checked in this order so `@admin2` is not swallowed by the `@admin` prefix.
 */
export const IDENTITY_PRECEDENCE: IdentityName[] = ['admin2', 'admin', 'reviewer', 'translator'];

export function sessionFile(identity: IdentityName): string {
  return path.resolve(__dirname, '..', '.auth', `${identity}.json`);
}

/** The identity a scenario's tags select, or undefined when it runs logged out. */
export function identityFromTags(tags: string[]): IdentityName | undefined {
  return IDENTITY_PRECEDENCE.find((name) => tags.includes(`@${name}`));
}

/**
 * Token of the open invitation the seed creates.
 *
 * Kept in step with `INVITE_TOKEN` in `prisma/seed-data/datasets.ts`. It is
 * repeated rather than imported because pulling the seed module into the test
 * process drags the Prisma client in with it. A mismatch is not subtle: the
 * registration page 404s immediately.
 */
export const INVITE_TOKEN = 'seed-invite-open-sk';
