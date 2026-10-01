import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // prisma generate (no DB needed) runs in CI and on hosts without .env,
    // where Prisma's env() helper would throw. The URL is only consumed by
    // migrate/seed commands, which fail on their own if it is empty.
    url: process.env.DATABASE_URL ?? '',
  },
});
