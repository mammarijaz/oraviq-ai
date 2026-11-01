import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Client } from 'pg';

/** Applies migrations to oraviq_test and empties every table once per run. */
export default async function globalSetup(): Promise<void> {
  require('./env');
  const url = process.env.DATABASE_URL!;
  execSync('npx prisma migrate deploy', { cwd: resolve(__dirname, '..'), env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`);
  if (rows.length) await client.query(`TRUNCATE TABLE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await client.end();
}
