// End-to-end: hauler site (Astro, :4321) + widgets (:5175) + API (:3000). Books through the iframe and chats on desktop and mobile.
// Run: node e2e/widgets-and-sites.cjs [site URL] (with api, sites and widgets running; default http://localhost:4321/).
// Against the one-origin test deployment: node e2e/widgets-and-sites.cjs http://localhost:8080/site/
const { chromium } = require('playwright');
const SITE = process.argv[2] || 'http://localhost:4321/';
(async () => {
  const b = await chromium.launch(); const errors = [];
  for (const [w, h, tag] of [[1280, 900, 'd'], [390, 844, 'm']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(tag + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(tag + ' console ' + m.text()); });
    await p.goto(SITE); await p.waitForTimeout(1500);
    const fr = p.frameLocator('iframe[title="Get an instant price"]');
    await fr.locator('#bw-zip').fill('30319'); await fr.locator('#bw-days').fill('10'); await p.waitForTimeout(600);
    console.log(tag, 'quote:', (await fr.locator('#bw-quote').innerText()).replace(/\n/g, ' | '));
    await fr.locator('#bw-size-btn').click(); await p.waitForTimeout(200); await p.keyboard.press('ArrowUp'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    console.log(tag, 'quote 15:', (await fr.locator('#bw-quote').innerText()).replace(/\n/g, ' | '));
    await p.screenshot({ path: `/tmp/e2e_w_${tag}_book.png`, fullPage: true });
    await fr.locator('#bw-address').fill('12 Pine St'); await fr.locator('#bw-name').fill('Grace Lee'); await fr.locator('#bw-phone').fill('4045550188');
    await fr.locator('#bw-date-btn').click(); await p.waitForTimeout(300); await p.keyboard.press('ArrowRight'); await p.keyboard.press('Enter'); await p.waitForTimeout(200); console.log(tag, 'date:', await fr.locator('#bw-date-v').innerText());
    await fr.locator('button.btn-site').click(); await p.waitForTimeout(200);
    console.log(tag, 'err:', await fr.locator('#bw-err').innerText());
    await fr.locator('[data-f="consent"]').check(); await fr.locator('button.btn-site').click(); await p.waitForTimeout(600);
    console.log(tag, 'done:', (await fr.locator('.bw-done').innerText()).replace(/\n/g, ' | '));
    const fh = await p.$eval('iframe[title="Get an instant price"]', e => e.style.height); console.log(tag, 'iframe height', fh);
    // chat
    await p.click('.site-btn--ghost'); await p.waitForTimeout(1200);
    const cf = p.frameLocator('iframe[title="Chat"]');
    await cf.locator('#input').fill('need a 20 yard in 30319'); await cf.locator('#input').press('Enter'); await p.waitForTimeout(900);
    console.log(tag, 'chat:', (await cf.locator('#thread').innerText()).replace(/\n/g, ' | ').slice(0, 300));
    await p.screenshot({ path: `/tmp/e2e_w_${tag}_chat.png` });
    await p.keyboard.press('Escape'); await ctx.close();
  }
  console.log('ERRORS', errors); await b.close();
})();
