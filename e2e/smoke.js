// Smoke test visual: semua layar di viewport HP, tangkap error konsol & overflow horizontal.
let pw;
try { pw = require('playwright'); } catch { pw = require('playwright-core'); }
const { chromium } = pw;
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.OUT || path.join(__dirname, 'out');
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const THEME = process.env.THEME || 'light';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: THEME,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
  });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`[console.${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/api/auth/')) problems.push(`[http ${r.status()}] ${r.url()}`); });

  const overflow = async (label) => {
    const o = await page.evaluate(() => {
      const de = document.documentElement;
      const wide = [];
      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > window.innerWidth + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed') wide.push(`${el.tagName.toLowerCase()}.${(el.className && el.className.baseVal === undefined ? el.className : '').toString().split(' ')[0]} (${Math.round(r.left)}→${Math.round(r.right)})`);
      });
      return { sw: de.scrollWidth, iw: window.innerWidth, wide: wide.slice(0, 6) };
    });
    if (o.sw > o.iw || o.wide.length) problems.push(`[overflow ${label}] scrollWidth=${o.sw} innerWidth=${o.iw} ${o.wide.join(' | ')}`);
  };
  const shot = async (name, full = true) => {
    await page.waitForTimeout(500);
    if (full) {
      // Perbesar viewport ke tinggi konten (bottom nav tetap di dasar), tunggu animasi/chart selesai, lalu foto.
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: W, height: Math.max(H, h) });
    }
    await page.waitForTimeout(1600);
    await page.screenshot({ path: path.join(OUT, `${THEME}-${W}-${name}.png`) });
    if (full) await page.setViewportSize({ width: W, height: H });
  };

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await shot('01-auth');
  await overflow('auth');

  await page.getByRole('button', { name: 'Coba akun demo' }).click();
  await page.waitForSelector('.hero', { timeout: 10000 });
  await shot('02-dashboard');
  await overflow('dashboard');

  for (const [hash, sel, name] of [
    ['#/history', '.day-head', '03-history'],
    ['#/report', '.ring', '04-report-monthly'],
    ['#/report?tab=weekly', '.spark', '05-report-weekly'],
    ['#/settings', '.profile', '06-settings'],
    ['#/inbox', '.notif', '07-inbox'],
    ['#/add', '.amount-field', '08-add'],
  ]) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForSelector(sel, { timeout: 10000 });
    await shot(name);
    await overflow(name);
  }

  console.log(problems.length ? problems.join('\n') : 'tidak ada masalah');
  await browser.close();
})().catch((e) => { console.error('GAGAL:', e); process.exit(1); });
