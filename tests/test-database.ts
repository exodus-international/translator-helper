import path from 'node:path';
import dotenv from 'dotenv';

/**
 * The name the test database must have.
 *
 * This is checked rather than assumed because `prisma.config.ts` calls
 * `import 'dotenv/config'`, which reads `.env` -- and `.env` holds the
 * development `DATABASE_URL`. A Prisma command spawned without an explicit
 * override would therefore reset the real development database. The guard
 * below is the thing standing between a mistyped env file and a day of lost
 * work, so it compares the database name exactly instead of loosely matching
 * a substring.
 *
 * Shared by the end-to-end suite, which resets this database, and the
 * database-backed tests, which reseed it.
 */
export const REQUIRED_DATABASE = 'translation_helper_test';

export function assertTestDatabase(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Create .env.test -- see e2e/README.md.');
  }

  let name: string;
  try {
    name = new URL(databaseUrl).pathname.replace(/^\//, '');
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }

  if (name !== REQUIRED_DATABASE) {
    throw new Error(
      `Refusing to run: DATABASE_URL points at "${name}", not "${REQUIRED_DATABASE}". ` +
        'Tests that touch a database reset or reseed the one they are given, so they only ever ' +
        'run against their own. Check .env.test.',
    );
  }

  return databaseUrl;
}

/**
 * Loads `.env.test` over whatever is already set, and returns the database URL
 * once it has passed the guard.
 */
export function loadTestDatabaseUrl(): string {
  dotenv.config({ path: path.resolve(__dirname, '..', '.env.test'), override: true });
  return assertTestDatabase(process.env.DATABASE_URL);
}
