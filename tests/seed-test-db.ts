/**
 * Reseeds the isolated test database, once, before the `*.db.test.ts` files
 * run.
 *
 * It goes through the repository's own seed so these fixtures cannot drift
 * from the ones the browser suite and `pnpm dev` see. The seed takes about ten
 * seconds; while iterating on one test file, skip it with SKIP_DB_SEED=1 and
 * work against whatever the last run left behind.
 */
import { execSync } from 'node:child_process';
import { loadTestDatabaseUrl } from './test-database';

const databaseUrl = loadTestDatabaseUrl();

if (process.env.SKIP_DB_SEED) {
  console.log('SKIP_DB_SEED is set: using the test database as the last run left it.');
} else {
  execSync('pnpm db:seed', {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
