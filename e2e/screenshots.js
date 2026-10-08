// Screenshot resmi untuk README: viewport iPhone 12 (390x844) portrait, akun demo.
let pw;
try { pw = require('playwright'); } catch { pw = require('playwright-core'); }
const { chromium } = pw;
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'id-ID', timezoneId: 'Asia/Jakarta' });
  const page = await ctx.newPage();
  const shot = async (name, wait = 1700) => { await page.waitForTimeout(wait); await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 86 }); console.log('ok', name); };
  const go = async (hash, sel) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForSelector(sel); };
  const clearToasts = () => page.evaluate(() => document.querySelectorAll('.notyf__toast').forEach((e) => e.remove()));

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await shot('01-login', 800);
  await page.getByRole('button', { name: 'Coba akun demo' }).click();
  await page.waitForSelector('.hero');
  await clearToasts();
  await shot('02-dashboard');
  await page.evaluate(() => window.scrollTo(0, 620));
  await shot('03-dashboard-budget', 600);
  await page.evaluate(() => window.scrollTo(0, 0));

  await go('#/add?cat=Kopi', '.amount-field');
  await page.locator('#amount').fill('');
  await page.locator('#amount').pressSequentially('25000');
  await page.locator('#notes').fill('Es kopi susu');
  await page.locator('.cat-grid').scrollIntoViewIfNeeded();
  await shot('04-add-transaction', 600);

  // pancing alert budget Kopi (Rp 300rb): 25rb -> 85% -> peringatan tier 2
  await page.locator('#amount').fill('');
  await page.locator('#amount').pressSequentially('200000');
  await page.locator('[data-submit]').click();
  await page.waitForSelector('.hero');
  await page.waitForTimeout(1500);
  await page.locator('[data-add]').count();
  await go('#/add?cat=Kopi', '.amount-field');
  await page.locator('#amount').pressSequentially('60000');
  await page.locator('[data-submit]').click();
  await page.waitForSelector('.hero');
  await page.waitForTimeout(1900);
  await shot('05-budget-alert', 100);
  await clearToasts();
  await page.waitForTimeout(600);
  await shot('06-dashboard-alert', 900);

  await go('#/history', '.day-head');
  await shot('07-history', 900);
  await go('#/report', '.ring');
  await shot('08-report-monthly');
  await page.evaluate(() => window.scrollTo(0, 560));
  await shot('09-report-chart', 900);
  await go('#/report?tab=weekly', '.spark');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('10-report-weekly');
  await go('#/inbox', '.notif');
  await shot('11-inbox', 900);
  await go('#/settings', '.profile');
  await page.evaluate(() => window.scrollTo(0, 380));
  await shot('12-settings', 700);

  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  await go('#/', '.hero');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('13-dashboard-dark');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
