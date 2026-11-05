import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Environment loading. apps/api/.env wins over the repo-root .env; variables
 * already set in the process (CI, tests, Render) win over both.
 */
let loaded = false;
export function loadDotenv(): void {
  if (loaded) return;
  loaded = true;
  const apiRoot = resolve(__dirname, '..', '..');
  const candidates = [resolve(apiRoot, '.env'), resolve(apiRoot, '..', '..', '.env')];
  // dist/ builds sit one level deeper (dist/src/config) when compiled with seed; cover both.
  candidates.push(resolve(apiRoot, '..', '.env'), resolve(apiRoot, '..', '..', '..', '.env'));
  for (const path of candidates) loadEnv({ path, quiet: true });
}

const bool = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => (typeof v === 'boolean' ? v : v === undefined || v === '' ? undefined : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().default('postgresql://oraviq:oraviq@localhost:5432/oraviq?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  INLINE_JOBS: bool,
  PROVISION_NUMBER_ON_SIGNUP: bool,
  ENABLE_SWAGGER: bool,
  TRUST_CLOUDFLARE: bool,
  /** Test deployments only: turns on the demo tools (mock checkout, run jobs now) in production, for mock adapters only. */
  DEMO_MODE: bool,
  JOB_POLLERS: bool,
  JWT_SECRET: z.string().default('dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().default('dev-refresh-secret-change-me'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  PUBLIC_API_URL: z.string().default('http://localhost:3000'),
  WEB_URL: z.string().default('http://localhost:5173'),
  WIDGETS_URL: z.string().default('http://localhost:5175'),
  SITES_BASE_DOMAIN: z.string().default('oraviq.site'),
  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: z.string().default('claude-haiku-4-5'),
  ZERNIO_API_KEY: optional,
  ZERNIO_WEBHOOK_SECRET: optional,
  ZERNIO_API_URL: optional,
  RETELL_API_KEY: optional,
  RETELL_WEBHOOK_SECRET: optional,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_CONNECT_CLIENT_ID: optional,
  CLOUDFLARE_API_TOKEN: optional,
  CLOUDFLARE_ZONE_ID: optional,
  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: z.string().default('mailto:support@oraviq.ai'),
  LOG_LEVEL: z.string().optional(),
});

export type Env = z.infer<typeof schema> & {
  inlineJobs: boolean;
  pollers: boolean;
  isProduction: boolean;
  isTest: boolean;
  /** Dev routes (mock checkout, run jobs now) are on: always outside production, and with DEMO_MODE in production. */
  demoTools: boolean;
};

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  loadDotenv();
  const parsed = schema.parse(process.env);
  const isTest = parsed.NODE_ENV === 'test';
  const isProduction = parsed.NODE_ENV === 'production';
  const inlineJobs = parsed.INLINE_JOBS ?? (isTest || !isProduction);
  cached = {
    ...parsed,
    inlineJobs,
    // Pollers run in the worker, or in the API when jobs are inline. Tests drive them by hand.
    pollers: parsed.JOB_POLLERS ?? !isTest,
    isProduction,
    isTest,
    demoTools: !isProduction || parsed.DEMO_MODE === true,
  };
  // Refuse the built-in defaults, the .env.example placeholders, short secrets and a shared secret.
  const weak = (s: string) => s.startsWith('dev-') || s.startsWith('change-me') || s.length < 32;
  if (isProduction && (weak(parsed.JWT_SECRET) || weak(parsed.JWT_REFRESH_SECRET) || parsed.JWT_SECRET === parsed.JWT_REFRESH_SECRET)) {
    cached = null;
    throw new Error('Set JWT_SECRET and JWT_REFRESH_SECRET in production (32+ random characters each, different from each other).');
  }
  return cached;
}

/** Test helper: forget the cached env so a test can change process.env first. */
export function resetEnvCache(): void {
  cached = null;
}

/** Which adapters run against real providers (keys present) vs mocks. */
export function adapterModes() {
  const e = env();
  return {
    llm: e.ANTHROPIC_API_KEY ? 'anthropic' : 'mock',
    messaging: e.ZERNIO_API_KEY ? 'zernio' : 'mock',
    telephony: e.ZERNIO_API_KEY ? 'zernio' : 'mock',
    reviews: e.ZERNIO_API_KEY ? 'zernio' : 'mock',
    voice: e.RETELL_API_KEY ? 'retell' : 'mock',
    payments: e.STRIPE_SECRET_KEY ? 'stripe' : 'mock',
    domains: e.CLOUDFLARE_API_TOKEN && e.CLOUDFLARE_ZONE_ID ? 'cloudflare' : 'mock',
  } as const;
}
