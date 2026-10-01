import { execSync } from 'node:child_process';
import { loadTestDatabaseUrl } from '../tests/test-database';

async function globalSetup() {
  // Refuses anything but the suite's own database; see tests/test-database.ts
  // for why that guard is exact.
  const databaseUrl = loadTestDatabaseUrl();

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
