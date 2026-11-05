#!/usr/bin/env node
/**
 * Start command for the one-origin test deployment (render.preview.yaml).
 *
 * One web service, one public address:
 *   /           owner app (static, served by the API)
 *   /api/v1     API + Socket.IO
 *   /widgets    chat + booking widgets (static, served by the API)
 *   /site       the demo hauler's website (Astro, a second process the API proxies to)
 *
 *   node scripts/preview-start.mjs --setup   apply migrations, load the demo company if it isn't there, exit
 *                                            (Render runs this in the build, so waking from sleep stays fast)
 *   node scripts/preview-start.mjs           start the hauler site on a private port, then the API in front
 *   PREVIEW_SETUP=1 node scripts/preview-start.mjs   both (handy locally)
 *
 * Mock adapters only: never put real provider keys on this deployment; production is render.yaml.
 */
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(root, 'apps', 'api');
const bin = (name) => join(api, 'node_modules', '.bin', name);

const port = process.env.PORT || '10000';
const sitesPort = process.env.SITES_PORT || '4321';
// Render sets RENDER_EXTERNAL_URL (https://<service>.onrender.com) on every web service.
const base = (process.env.RENDER_EXTERNAL_URL || process.env.PREVIEW_URL || `http://localhost:${port}`).replace(/\/+$/, '');

const shared = { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' };
const apiEnv = {
  ...shared,
  PORT: port,
  PUBLIC_API_URL: base,
  WEB_URL: base,
  WIDGETS_URL: `${base}/widgets`,
  INLINE_JOBS: process.env.INLINE_JOBS || 'true',
  DEMO_MODE: process.env.DEMO_MODE || 'true',
  ENABLE_SWAGGER: process.env.ENABLE_SWAGGER || 'true',
  SERVE_WEB_DIR: join(root, 'apps', 'web', 'dist'),
  SERVE_WIDGETS_DIR: join(root, 'apps', 'widgets', 'dist'),
  SITES_UPSTREAM: `http://127.0.0.1:${sitesPort}`,
};
const sitesEnv = {
  ...shared,
  PORT: sitesPort,
  HOST: '127.0.0.1',
  // Server-side calls stay inside the container; the browser gets the public address.
  PUBLIC_API_URL: `http://127.0.0.1:${port}`,
  BROWSER_API_URL: base,
  WIDGETS_URL: `${base}/widgets`,
  SITES_FALLBACK_KEY: process.env.SITES_FALLBACK_KEY || 'pk_demo_rolloff',
};

function run(label, cmd, args, opts) {
  console.log(`[preview] ${label}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`[preview] ${label} failed (exit ${r.status ?? r.signal}).`);
    process.exit(r.status ?? 1);
  }
}

const setupOnly = process.argv.includes('--setup');
if (setupOnly || process.env.PREVIEW_SETUP === '1') {
  run('Applying database migrations', bin('prisma'), ['migrate', 'deploy'], { cwd: api, env: apiEnv });
  // Kept across deploys: people's changes to the demo company survive; delete the tenant to reset it.
  run('Loading the demo company (only if missing)', bin('ts-node'), ['--transpile-only', 'prisma/seed.ts', '--if-missing'], { cwd: api, env: apiEnv });
  if (setupOnly) process.exit(0);
}

let stopping = false;
let sites;
function startSites() {
  sites = spawn(process.execPath, [join(root, 'apps', 'sites', 'dist', 'server', 'entry.mjs')], { stdio: 'inherit', env: sitesEnv });
  sites.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(`[preview] hauler site exited (${code ?? signal}); restarting in 2s`);
    setTimeout(startSites, 2000);
  });
}
startSites();

const server = spawn(process.execPath, [join(api, 'dist', 'main.js')], { stdio: 'inherit', cwd: api, env: apiEnv });
server.on('exit', (code, signal) => {
  stopping = true;
  sites?.kill('SIGTERM');
  process.exit(code ?? (signal ? 1 : 0));
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    stopping = true;
    sites?.kill(sig);
    server.kill(sig);
  });
}

console.log(`[preview] ${base}  ·  owner app /  ·  hauler site /site  ·  widgets /widgets  ·  API /api/docs`);
