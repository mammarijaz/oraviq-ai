/*
 * End-to-end flow against the real API (Vite on :5173 started with VITE_API_URL pointing at the API):
 * login → Try it out text → $720 quote → address/day → order in the inbox → Orders → Confirm → toast.
 *   node scripts/e2e-flow.cjs [--base http://localhost:5173] [--out /tmp/web-e2e] [--headed]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('--base', 'http://localhost:5173');
const OUT = opt('--out', '/tmp/web-e2e');

function step(name) { console.log(`• ${name}`); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: !args.includes('--headed') });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

  step('sign in');
  await page.goto(`${BASE}/login`);
  await page.fill('input[type=email]', 'demo@oraviq.ai');
  await page.fill('input[type=password]', 'demo1234');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/inbox/);

  step('Try it out: ask for a 20-yard');
  await page.goto(`${BASE}/try`);
  await page.getByRole('button', { name: 'Start over' }).click();
  await page.fill('#tinput', 'need a 20 yard in 30319 for 10 days, kitchen remodel');
  await page.press('#tinput', 'Enter');
  const quote = page.locator('.ov-quote');
  await quote.waitFor({ timeout: 20000 });
  const total = (await quote.locator('.ov-quote__total').innerText()).replace(/^Total\s*/, '').trim();
  if (!total.includes('$720')) throw new Error(`expected $720, got ${total}`);
  console.log(`  quote ${total}`);
  await shot('1-quote');

  step('send address and day');
  await page.fill('#tinput', '2215 Briarwood Rd, Thursday');
  await page.press('#tinput', 'Enter');
  await page.locator('.ov-alert', { hasText: 'New order:' }).first().waitFor({ timeout: 20000 });
  await shot('2-order-alert');

  step('open the conversation in the inbox');
  await page.getByRole('link', { name: 'Open in inbox' }).click();
  await page.waitForURL(/\/inbox\/.+/);
  await page.getByText('Order request').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Confirm order' }).waitFor();
  const needs = await page.locator('.ov-conv[aria-current="true"]').innerText();
  if (!/Order to confirm|Needs you/i.test(needs)) console.log(`  note: list status reads "${needs.split('\n').slice(-2).join(' ')}"`);
  await shot('3-inbox-order');

  step('Orders → Confirm the newest request');
  await page.goto(`${BASE}/orders`);
  const row = page.locator('.ov-table tbody tr').first();
  await row.waitFor({ timeout: 15000 });
  const rowText = await row.innerText();
  if (!/20-yard, 10 days/.test(rowText) || !/\$720/.test(rowText)) throw new Error(`newest order row is not ours: ${rowText}`);
  await row.getByRole('button', { name: 'Confirm' }).click();
  const toast = page.locator('.ov-toast', { hasText: 'Order confirmed' });
  await toast.waitFor({ timeout: 15000 });
  console.log(`  toast: ${(await toast.innerText()).split('\n')[0]}`);
  await page.waitForTimeout(300);
  await shot('4-confirmed');
  const status = await page.locator('.ov-table tbody tr').first().innerText();
  if (!/Confirmed/.test(status)) throw new Error('row did not change to Confirmed');

  await browser.close();
  if (errors.length) console.log(`console errors:\n${errors.join('\n')}`);
  console.log('flow passed');
})().catch(async (e) => {
  console.error('flow failed:', e.message);
  process.exit(1);
});
