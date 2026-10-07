// E2E interaktif: alur pengguna nyata di viewport HP.
let pw;
try { pw = require('playwright'); } catch { pw = require('playwright-core'); }
const { chromium } = pw;
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
const fails = [];
const check = (name, cond, extra = '') => {
  if (cond) pass += 1;
  else fails.push(`${name} ${extra}`);
  console.log(`${cond ? '✔' : '✖'} ${name}${cond ? '' : ' ' + extra}`);
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'id-ID', timezoneId: 'Asia/Jakarta', acceptDownloads: true });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[console.error] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('dialog', (d) => d.dismiss());

  const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); };
  const toastText = async () => (await page.locator('.notyf__message').allTextContents()).join(' | ');
  const waitToast = async (re, timeout = 5000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const t = await toastText();
      if (re.test(t)) return t;
      await page.waitForTimeout(150);
    }
    return await toastText();
  };
  const clearToasts = async () => { await page.evaluate(() => document.querySelectorAll('.notyf__toast').forEach((e) => e.remove())); };
  const addTx = async ({ type = 'expense', cat, amount, notes = '' }) => {
    await page.evaluate((h) => { location.hash = h; }, '#/add');
    await page.waitForSelector('.amount-field');
    if (type === 'income') await page.locator('[data-type=income]').click();
    await page.locator('#amount').fill('');
    await page.locator('#amount').pressSequentially(String(amount));
    await page.locator('[data-cat]').filter({ hasText: cat }).first().click();
    if (notes) await page.locator('#notes').fill(notes);
    await page.locator('[data-submit]').click();
    await page.waitForSelector('.hero', { timeout: 8000 });
  };

  // ---------- 1. daftar akun baru ----------
  const email = `e2e${Date.now()}@test.com`;
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Daftar' }).click();
  await page.locator('input[name=name]').fill('Raka Tester');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill('rahasia123');
  await page.getByRole('button', { name: 'Daftar & mulai' }).click();
  await page.waitForSelector('.hero', { timeout: 8000 });
  check('daftar → masuk dashboard', (await page.locator('h1').first().textContent()).includes('Raka'));
  check('dashboard kosong menampilkan ajakan mulai', await page.getByText('Mulai catat yuk!').isVisible());
  await shot('01-empty-dashboard');

  // validasi form
  await page.evaluate(() => { location.hash = '#/add'; });
  await page.waitForSelector('.amount-field');
  await page.locator('[data-submit]').click();
  check('submit kosong → pesan nominal', (await page.locator('[data-err=amount]').textContent()).includes('nominal'));
  check('autofokus ke kolom nominal', await page.evaluate(() => document.activeElement && document.activeElement.id === 'amount'));
  await page.locator('#amount').pressSequentially('1234567');
  check('nominal diformat Rp 1.234.567', (await page.locator('#amount').inputValue()) === '1.234.567');
  await page.locator('[data-add="50000"]').click();
  check('chip +50rb menambah nominal', (await page.locator('#amount').inputValue()) === '1.284.567');
  await page.locator('[data-clear]').click();
  check('tombol × mengosongkan nominal', (await page.locator('#amount').inputValue()) === '');
  await shot('02-add-form');

  // ---------- 2. pemasukan ----------
  await addTx({ type: 'income', cat: 'Gaji', amount: 5000000, notes: 'Gaji bulan ini' });
  await page.waitForSelector('.tx');
  check('saldo = Rp 5.000.000 setelah gaji', (await page.locator('.hero-amount').textContent()).includes('5.000.000') || (await page.waitForTimeout(900), (await page.locator('.hero-amount').textContent()).includes('5.000.000')));

  // ---------- 3. alert budget 3-tier (budget Kopi Rp 300.000) ----------
  const steps = [
    [150000, null, 'Kopi susu'],
    [40000, /63% budget kepake|63% dari budget|63%|Kopi udah|60%/i, 'tier 1'],
    [60000, /Bikin sendiri|tinggal Rp|4x|keluar/i, 'tier 2'],
    [50000, /Overspend|lewat budget|selesai/i, 'tier 3'],
  ];
  for (const [amount, re, label] of steps) {
    await clearToasts();
    await page.goto(`${BASE}/#/add?cat=Kopi`);
    await page.waitForSelector('.amount-field');
    check(`quick-add memilih Kopi (${label})`, (await page.locator('[data-cat="Kopi"]').getAttribute('aria-checked')) === 'true');
    await page.locator('#amount').pressSequentially(String(amount));
    await page.locator('#notes').fill(label);
    await page.locator('[data-submit]').click();
    await page.waitForSelector('.hero', { timeout: 8000 });
    if (re) {
      const t = await waitToast(re, 6000);
      check(`alert muncul: ${label}`, re.test(t), `toast="${t}"`);
      if (label === 'tier 2') await shot('03-toast-tier2');
      if (label === 'tier 3') await shot('04-toast-tier3');
    } else {
      await page.waitForTimeout(1500);
      check('50% tidak memicu alert', !/budget/i.test(await toastText().then((t) => t.replace(/Transaksi berhasil/g, ''))), await toastText());
    }
  }
  await clearToasts();
  await page.waitForTimeout(500);
  check('banner alert tampil di dashboard', await page.locator('.banner.t3').isVisible());
  check('badge notifikasi tampil', await page.locator('.icon-btn .badge').isVisible());
  await shot('05-dashboard-with-alert');

  // ---------- 4. riwayat: cari, filter, edit, hapus ----------
  await page.locator('.bottom-nav a[href="#/history"]').click();
  await page.waitForSelector('.day-head');
  check('riwayat memuat 5 transaksi', (await page.locator('.tx').count()) === 5);
  await page.locator('[data-q]').fill('tier 2');
  await page.waitForTimeout(900);
  check('pencarian memfilter', (await page.locator('.tx').count()) === 1);
  await page.locator('[data-q]').fill('');
  await page.waitForTimeout(700);
  await page.locator('[data-filter]').click();
  await page.waitForSelector('dialog.sheet[open]');
  await shot('06-filter-sheet');
  await page.locator('select[name=type]').selectOption('income');
  await page.getByRole('button', { name: 'Terapkan' }).click();
  await page.waitForTimeout(900);
  check('filter pemasukan → 1 transaksi', (await page.locator('.tx').count()) === 1);
  await page.locator('[data-untag="type"]').click();
  await page.waitForTimeout(900);
  check('hapus tag filter → semua kembali', (await page.locator('.tx').count()) === 5);

  await page.locator('.tx', { hasText: 'tier 3' }).click();
  await page.waitForSelector('[data-delete]');
  await page.locator('#amount').fill('');
  await page.locator('#amount').pressSequentially('45000');
  await page.locator('[data-submit]').click();
  await page.waitForSelector('.day-head');
  check('edit transaksi tersimpan', (await page.locator('.tx', { hasText: 'tier 3' }).textContent()).includes('45.000'));

  await page.locator('.tx', { hasText: 'Kopi susu' }).click();
  await page.waitForSelector('[data-delete]');
  await page.locator('[data-delete]').click();
  await page.waitForSelector('dialog.sheet[open]');
  await shot('07-confirm-delete');
  await page.getByRole('button', { name: 'Ya, hapus' }).click();
  await page.waitForSelector('.day-head');
  await page.waitForTimeout(600);
  check('hapus transaksi berhasil', (await page.locator('.tx').count()) === 4);

  // ---------- 5. XSS: nama kategori & catatan berisi HTML ----------
  await page.locator('.bottom-nav a[href="#/settings"]').click();
  await page.waitForSelector('[data-add-cat]');
  await page.locator('[data-add-cat]').click();
  await page.waitForSelector('[data-cf]');
  await page.locator('[data-cf] input[name=emoji]').fill('🧪');
  await page.locator('[data-cf] input[name=name]').fill('<img src=x onerror=__xss=1>');
  await page.locator('[data-cf] [type=submit]').click();
  await page.waitForTimeout(900);
  check('kategori dengan HTML disimpan sebagai teks', await page.getByText('<img src=x onerror=__xss=1>').first().isVisible());
  await addTx({ cat: '<img src=x onerror=__xss=1>', amount: 10000, notes: '<script>window.__xss=2</script>' });
  await page.locator('.bottom-nav a[href="#/history"]').click();
  await page.waitForSelector('.day-head');
  await page.waitForTimeout(500);
  check('HTML di catatan/kategori tidak dieksekusi (XSS)', (await page.evaluate(() => window.__xss)) === undefined);
  check('catatan HTML tampil sebagai teks', (await page.locator('.tx').first().textContent()).includes('<script>'));
  await shot('08-xss-safe');

  // ---------- 6. pengaturan ----------
  await page.locator('.bottom-nav a[href="#/settings"]').click();
  await page.waitForSelector('#t-dark');
  await page.locator('#t-dark').evaluate((el) => el.click());
  await page.waitForTimeout(400);
  check('mode gelap aktif', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await page.reload({ waitUntil: 'networkidle' });
  check('mode gelap bertahan setelah reload', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await shot('09-settings-dark');
  await page.locator('#t-dark').evaluate((el) => el.click());

  const kopiInput = page.locator('[data-name="Kopi"]');
  await kopiInput.fill('');
  await kopiInput.pressSequentially('450000');
  await kopiInput.blur();
  await waitToast(/Budget Kopi disimpan/);
  check('budget Kopi tersimpan', /Budget Kopi disimpan/.test(await toastText()));
  await page.reload({ waitUntil: 'networkidle' });
  check('budget Kopi bertahan setelah reload', (await page.locator('[data-name="Kopi"]').inputValue()) === '450.000');

  const dl = page.waitForEvent('download');
  await page.locator('[data-export="csv"]').click();
  const download = await dl;
  const file = path.join(OUT, 'export.csv');
  await download.saveAs(file);
  const csv = fs.readFileSync(file, 'utf8');
  check('ekspor CSV berisi transaksi', csv.includes('Tanggal (WIB)') && csv.includes('Gaji'));

  await page.locator('[data-reset]').click();
  await page.waitForSelector('[data-confirm-text]');
  check('tombol reset nonaktif sampai ketik RESET', await page.locator('[data-confirm]').isDisabled());
  await page.locator('[data-confirm-text]').fill('RESET');
  check('tombol reset aktif setelah ketik RESET', await page.locator('[data-confirm]').isEnabled());
  await shot('10-reset-confirm');
  await page.getByRole('button', { name: 'Batal' }).click();

  // ---------- 7. keyboard layar sentuh ----------
  await page.locator('.bottom-nav a[href="#/history"]').click();
  await page.waitForSelector('[data-q]');
  await page.locator('[data-q]').tap();
  check('bottom nav disembunyikan saat mengetik (kb-open)', await page.evaluate(() => document.documentElement.classList.contains('kb-open')));
  await page.locator('h1').first().tap();
  await page.locator('body').tap({ position: { x: 5, y: 400 } });
  await page.waitForTimeout(300);

  // ---------- 8. logout & login ulang ----------
  await page.locator('.bottom-nav a[href="#/settings"]').click();
  await page.waitForSelector('[data-logout]');
  await page.locator('[data-logout]').click();
  await page.getByRole('button', { name: 'Keluar' }).last().click();
  await page.waitForSelector('[data-form]');
  check('logout → layar login', await page.getByText('Masuk dulu yuk').isVisible());
  check('token dihapus dari localStorage', (await page.evaluate(() => localStorage.getItem('pantau.auth'))) === null);
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill('salah-password');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForSelector('[data-error]:not([hidden])');
  check('password salah → pesan error', (await page.locator('[data-error]').textContent()).includes('salah'));
  await page.locator('input[name=password]').fill('rahasia123');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForSelector('.hero');
  check('login ulang berhasil', true);

  // ---------- 9. sesi kedaluwarsa → auto-refresh token ----------
  await page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem('pantau.auth'));
    a.token = 'token.rusak.sekali';
    localStorage.setItem('pantau.auth', JSON.stringify(a));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const stillIn = await page.locator('.hero').isVisible().catch(() => false);
  check('token rusak → auto-refresh, tetap login', stillIn);

  console.log(`\n${pass} lulus, ${fails.length} gagal`);
  if (fails.length) console.log('GAGAL:\n' + fails.join('\n'));
  console.log(problems.length ? 'MASALAH KONSOL:\n' + problems.join('\n') : 'tidak ada error konsol');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('SKRIP GAGAL:', e); process.exit(2); });
