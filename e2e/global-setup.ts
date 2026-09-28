import { execSync } from 'node:child_process';
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
 */
const REQUIRED_DATABASE = 'translation_helper_test';

function assertTestDatabase(databaseUrl: string | undefined): string {
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
        'The end-to-end suite resets the database it is given, so it only ever runs against ' +
        'its own. Check .env.test.',
    );
  }

  return databaseUrl;
}

async function globalSetup() {
  dotenv.config({ path: path.resolve(__dirname, '..', '.env.test'), override: true });

  const databaseUrl = assertTestDatabase(process.env.DATABASE_URL);

  const env = { ...process.env, DATABASE_URL: databaseUrl };

  // The client is generated into the repository, and the repository ignores
  // it, so it survives branch switches. Checking out a branch whose schema
  // differs therefore leaves a client that disagrees with the database, and
  // the seed fails on a column the schema does not have. Regenerating first
  // costs a moment and removes a confusing class of failure.
  execSync('pnpm prisma generate', { stdio: 'inherit', env });

  // Drops the database and re-applies every migration. Prisma 7's reset takes
  // only --force, --schema and --config: the --skip-seed and --skip-generate
  // flags that older guides mention no longer exist.
  execSync('pnpm prisma migrate reset --force', { stdio: 'inherit', env });

  // Seeding is run separately and explicitly, because that reset does not
  // invoke the seed from prisma.config.ts. A reset that silently leaves an
  // empty database fails later as "Invalid email or password", which points
  // nowhere near the real cause. Calling the repository's own seed script also
  // keeps test fixtures and development fixtures identical.
  execSync('pnpm db:seed', { stdio: 'inherit', env });
}

export default globalSetup;
