import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// apps/api/.env wins over the repo-root .env; real env vars win over both.
loadEnv({ path: resolve(__dirname, '.env'), quiet: true });
loadEnv({ path: resolve(__dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --transpile-only prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://oraviq:oraviq@localhost:5432/oraviq?schema=public',
  },
});
