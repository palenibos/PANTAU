let pw;
try { pw = require('playwright'); } catch { pw = require('playwright-core'); }
const { chromium } = pw;
const BASE = process.env.BASE || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  // Profil "Slow 3G" DevTools: 500 Kbps down / 500 Kbps up / 400 ms RTT
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: (500 * 1024) / 8, uploadThroughput: (500 * 1024) / 8 });
  let bytes = 0; const reqs = [];
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
  cdp.on('Network.requestWillBeSent', (e) => reqs.push(e.request.url.replace(BASE, '')));
  const t0 = Date.now();
  await page.goto(BASE + '/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-demo]');
  const tAuth = Date.now() - t0;
  const bytesAuth = bytes;
  await page.getByRole('button', { name: 'Coba akun demo' }).click();
  await page.waitForSelector('.hero');
  const tDash = Date.now() - t0;
  console.log(`layar login tampil : ${(tAuth / 1000).toFixed(1)} s, ${(bytesAuth / 1024).toFixed(0)} KB`);
  console.log(`dashboard tampil   : ${(tDash / 1000).toFixed(1)} s total, ${(bytes / 1024).toFixed(0)} KB total, ${reqs.length} request`);
  console.log(reqs.filter((u) => !u.startsWith('data:')).join('\n'));
  await browser.close();
})();
