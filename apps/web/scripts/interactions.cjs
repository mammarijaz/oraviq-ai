/* Exercises the interactive flows against the real API and screenshots each result.
 *   node scripts/interactions.cjs [--base http://localhost:5173] [--out /tmp/web-int] */
const { chromium } = require('playwright');
const fs = require('fs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('--base', 'http://localhost:5173');
const OUT = opt('--out', '/tmp/web-int');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const toasts = async () => (await p.locator('.ov-toast__msg').allInnerTexts()).join(' | ');
  const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
  await p.goto(`${BASE}/login`);
  await p.fill('input[type=email]', 'demo@oraviq.ai'); await p.fill('input[type=password]', 'demo1234'); await p.click('button[type=submit]');
  await p.waitForURL(/inbox/);

  console.log('• test call');
  await p.goto(`${BASE}/receptionist`);
  await p.getByRole('button', { name: /^Call / }).click();
  for (const t of ['I need a dumpster for a kitchen remodel', '20 yard please', "It's in 30319", 'About 10 days']) {
    await p.fill('#call-input', t); await p.press('#call-input', 'Enter');
    await p.waitForFunction(() => !document.querySelector('.call-lines .wmsg--system'), null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(400);
  }
  console.log('  lines:', (await p.locator('.call-lines .wmsg').allInnerTexts()).map((x) => x.slice(0, 70)).join('\n         '));
  await shot('1-call-live');
  await p.getByRole('button', { name: 'End call' }).click();
  await p.locator('.call-summary').waitFor({ timeout: 15000 });
  console.log('  summary:', await p.locator('.call-summary p').first().innerText());
  console.log('  toasts:', await toasts());
  await p.waitForTimeout(800);
  console.log('  first call in log:', (await p.locator('.call-row').first().innerText()).split('\n').slice(0, 3).join(' / '));
  await shot('2-call-ended');

  console.log('• reschedule with undo');
  await p.goto(`${BASE}/orders`);
  await p.locator('.ov-table tbody tr').first().waitFor();
  await p.locator('.ov-table tbody tr').nth(1).getByRole('button', { name: 'Change day' }).click();
  await p.locator('.ov-modal').waitFor();
  await shot('3-reschedule-modal');
  await p.getByRole('button', { name: 'Save change' }).click();
  await p.locator('.ov-toast', { hasText: 'Moved to' }).waitFor({ timeout: 10000 });
  console.log('  toast:', await toasts());
  await p.locator('.ov-toast', { hasText: 'Moved to' }).getByRole('button', { name: 'Undo' }).click();
  await p.locator('.ov-toast', { hasText: 'Change undone' }).waitFor({ timeout: 10000 });
  console.log('  after undo:', await toasts());

  console.log('• review reply');
  await p.goto(`${BASE}/reviews`);
  const card = p.locator('article.ov-card').filter({ has: p.getByRole('button', { name: 'Post reply' }) }).first();
  await card.waitFor({ timeout: 10000 });
  const who = (await card.locator('.review-name').innerText());
  await card.getByRole('button', { name: 'Try another draft' }).click();
  await p.waitForTimeout(800);
  await card.getByRole('button', { name: 'Post reply' }).click();
  await p.locator('.ov-toast', { hasText: 'Reply posted' }).waitFor({ timeout: 10000 });
  console.log(`  replied to ${who}:`, await toasts());
  await shot('4-reviews');

  console.log('• pricing validation');
  await p.goto(`${BASE}/pricing`);
  await p.getByLabel('10-yard base price').fill('');
  await p.getByRole('button', { name: 'Save pricing' }).click();
  await p.locator('.ov-alert', { hasText: 'Not saved' }).waitFor({ timeout: 5000 });
  console.log('  problems:', (await p.locator('.ov-alert .problems li').allInnerTexts()).join(' | '));
  await p.getByLabel('10-yard base price').fill('425');
  console.log('  preview total:', await p.locator('.ov-quote__total').innerText());
  await shot('5-pricing-problems');

  console.log('• setup test call');
  await p.goto(`${BASE}/setup`);
  const run = p.getByRole('button', { name: 'Run test call' });
  if (await run.count()) { await run.click(); await p.waitForTimeout(1200); console.log('  toast:', await toasts()); } else console.log('  (forwarding already done)');

  console.log('• take over and reply');
  await p.goto(`${BASE}/inbox`);
  await p.waitForURL(/inbox\/.+/);
  const take = p.getByRole('button', { name: 'Take over' });
  if (await take.count()) await take.click();
  await p.locator('#reply:not([disabled])').waitFor({ timeout: 8000 });
  await p.fill('#reply', 'Thanks, we will see you Thursday morning.');
  await p.press('#reply', 'Enter');
  await p.waitForTimeout(1200);
  console.log('  toasts:', await toasts());
  console.log('  last bubble:', (await p.locator('.thread-scroll .ov-msg, .thread-scroll [class*="ov-message"], .thread-scroll [class*="bubble"]').last().innerText().catch(() => '?')).slice(0, 80));
  await shot('6-inbox-reply');
  await p.getByRole('button', { name: 'Hand back' }).click();
  await p.waitForTimeout(800);

  await b.close();
  console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
