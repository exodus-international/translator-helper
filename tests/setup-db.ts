/**
 * Points the `*.db.test.ts` files at the isolated test database.
 *
 * Wired in through `--import` in the `test:db` script, so it runs in every
 * test process before that process loads a test file. It loads `.env.test`
 * so that `@/lib/db`, when a test imports it, connects to the test database
 * and never to the development one, and refuses anything else.
 *
 * Seeding is not done here: node:test gives each file its own process, and a
 * seed per process would race itself. `seed-test-db.ts` seeds once, before
 * the runner starts.
 */
import { loadTestDatabaseUrl } from './test-database';

loadTestDatabaseUrl();

// A test that imports a server action drags better-auth in with it, which
// rejects an empty trusted origin. Nothing here signs anyone in.
process.env.NEXT_PUBLIC_APP_URL ||= 'http://localhost:3100';
