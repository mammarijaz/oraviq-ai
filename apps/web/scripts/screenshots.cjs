/*
 * Screenshots of every route at 1440 and 390 wide, plus console errors.
 *   node scripts/screenshots.cjs [--mock] [--out /tmp/web-shots] [--base http://localhost:5173] [--only inbox,orders]
 * Without --mock it signs in to the real API as demo@oraviq.ai / demo1234 (set VITE_API_URL when starting Vite).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MOCK = args.includes('--mock');
const BASE = opt('--base', 'http://localhost:5173');
const OUT = opt('--out', '/tmp/web-shots');
const ONLY = opt('--only', '');
const ROUTES = ['login', 'register', 'inbox', 'receptionist', 'try', 'orders', 'reviews', 'website', 'website#widgets', 'pricing', 'report', 'setup', 'settings'].filter((r) => !ONLY || ONLY.split(',').includes(r));
const WIDTHS = (opt('--widths', '1440,390')).split(',').map(Number);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const problems = [];
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    if (args.includes('--no-sites')) await page.route(/localhost:4321/, (r) => r.abort());
    if (MOCK) await page.route(/localhost:3000\/api\/v1\//, require('./mock-api.cjs').mockApi);
    page.on('console', (m) => { if (m.type() === 'error' && !/socket\.io|WebSocket|ERR_CONNECTION_REFUSED|net::ERR/.test(m.text())) problems.push(`[${width}] console: ${m.text()} ${m.location()?.url ?? ''}`); });
    page.on('pageerror', (e) => problems.push(`[${width}] pageerror: ${e.message}`));
    // sign in once (stores tokens in localStorage)
    await page.goto(`${BASE}/login`);
    if (ROUTES.includes('login')) { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/login-${width}.png`, fullPage: true }); }
    if (ROUTES.includes('register')) { await page.goto(`${BASE}/register`); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/register-${width}.png`, fullPage: true }); await page.goto(`${BASE}/login`); }
    await page.fill('input[type=email]', 'demo@oraviq.ai');
    await page.fill('input[type=password]', 'demo1234');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/inbox/, { timeout: 15000 });
    for (const r of ROUTES.filter((x) => x !== 'login' && x !== 'register')) {
      const [path, tab] = r.split('#');
      await page.goto(`${BASE}/${path}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(900);
      if (tab === 'widgets') { await page.getByRole('tab', { name: /Widgets/ }).click(); await page.waitForTimeout(1200); }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) problems.push(`[${width}] ${r}: page is ${overflow}px wider than the viewport`);
      await page.screenshot({ path: `${OUT}/${r.replace('#', '-')}-${width}.png`, fullPage: true });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(problems.length ? problems.join('\n') : 'no console errors, no horizontal overflow');
})().catch((e) => { console.error(e); process.exit(1); });
