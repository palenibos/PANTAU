// Regresi: menyimpan budget di Pengaturan pada layar sentuh (kasus iPhone Safari).
// Masalah asli: budget hanya tersimpan saat event "change" (butuh blur/Enter). Keypad angka iPhone tidak punya
// Enter dan mengetuk area kosong tidak melepas fokus, jadi perubahan tidak pernah tersimpan.
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'id-ID', timezoneId: 'Asia/Jakarta' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[console.error] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

  // Akun baru lewat API (lewati UI login) lalu suntik token ke localStorage.
  const email = `budget${Date.now()}@test.com`;
  const reg = await (await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'rahasia123', name: 'Raka Tester' }) })).json();
  if (!reg.token) throw new Error(`register gagal: ${JSON.stringify(reg)}`);
  await ctx.addInitScript((a) => { if (!localStorage.getItem('pantau.auth')) localStorage.setItem('pantau.auth', JSON.stringify(a)); }, { token: reg.token, refreshToken: reg.refreshToken, user: reg.user });
  const server = async () => (await (await fetch(`${BASE}/api/settings`, { headers: { authorization: `Bearer ${reg.token}` } })).json()).data;

  const puts = [];
  page.on('request', (r) => { if (r.method() === 'PUT' && r.url().includes('/api/settings')) puts.push({ url: r.url().replace(BASE, ''), body: r.postData() }); });

  const input = (name) => page.locator(`[data-name="${name}"]`);
  const monthly = page.locator('[data-monthly]');
  // Mengetik seperti keypad HP: teks di-commit lewat IME, TANPA tombol Enter dan TANPA blur.
  const typeLikePhone = async (loc, digits) => {
    await loc.tap();
    await loc.evaluate((el) => el.select());
    await cdp.send('Input.insertText', { text: digits });
  };
  const toastText = async () => (await page.locator('.notyf__message').allTextContents()).join(' | ');
  const waitToast = async (re, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (re.test(await toastText())) return true; await page.waitForTimeout(120); } return false; };
  const clearToasts = () => page.evaluate(() => document.querySelectorAll('.notyf__toast').forEach((e) => e.remove()));
  const bar = page.locator('[data-save-bar]');
  // Ketuk elemen non-interaktif (judul) = "ketuk area kosong". Koordinat tetap tidak andal: halaman ter-scroll saat fokus.
  const tapBlank = async () => { await page.getByRole('heading', { name: 'Budget', exact: true }).tap(); await page.waitForTimeout(300); };
  const goSettings = async () => { await page.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' }); await page.waitForSelector('[data-budget-form]'); };

  // ---------- 1. kasus iPhone: ketik, TANPA blur/Enter, lalu ketuk Simpan ----------
  await goSettings();
  check('bar simpan tersembunyi saat belum ada perubahan', await bar.isHidden());
  await typeLikePhone(input('Kopi'), '450000');
  check('nilai diformat 450.000', (await input('Kopi').inputValue()) === '450.000');
  check('bar simpan muncul begitu ada perubahan', await bar.isVisible());
  check('tombol menyebut perubahan', (await page.locator('[data-save-btn]').textContent()).includes('Simpan'));
  check('kolom yang diubah diberi tanda', await input('Kopi').evaluate((el) => el.closest('.money-input').classList.contains('dirty')));
  check('belum ada request simpan sebelum tombol ditekan', puts.length === 0);
  check('fokus masih di kolom (persis seperti keypad iPhone)', await input('Kopi').evaluate((el) => document.activeElement === el));
  await page.waitForTimeout(500); // animasi masuk bar selesai
  const rect = await bar.boundingBox();
  const navRect = await page.locator('.bottom-nav').boundingBox().catch(() => null);
  check('bar berada di dalam layar & tidak menutupi tepi', rect && rect.x >= 0 && rect.x + rect.width <= 390 && rect.y >= 0 && rect.y + rect.height <= 844);
  await page.screenshot({ path: path.join(OUT, 'budget-1-dirty.png') });

  await page.locator('[data-save-btn]').tap();
  check('toast "Budget Kopi disimpan"', await waitToast(/Budget Kopi disimpan/));
  check('tepat satu PUT budget terkirim', puts.length === 1 && /"budgetLimit":450000/.test(puts[0].body), JSON.stringify(puts));
  check('server menyimpan 450000', (await server()).budgetPerCategory.Kopi === 450000);
  check('bar tersembunyi setelah tersimpan', await bar.isHidden());
  check('keyboard ditutup saat Simpan (fokus lepas)', await page.evaluate(() => !/INPUT/.test(document.activeElement.tagName)));
  await page.reload({ waitUntil: 'networkidle' });
  check('nilai bertahan setelah reload', (await input('Kopi').inputValue()) === '450.000');

  // ---------- 2. beberapa kolom sekaligus (+ total bulanan) ----------
  puts.length = 0; await clearToasts();
  await typeLikePhone(input('Rokok'), '250000');
  await typeLikePhone(input('Nongkrong'), '600000');
  await typeLikePhone(monthly, '7500000');
  check('tombol menyebut 3 perubahan', (await page.locator('[data-save-btn]').textContent()).includes('3 perubahan'));
  await page.locator('[data-save-btn]').tap();
  check('toast ringkasan 3 budget', await waitToast(/3 budget disimpan/));
  const s2 = await server();
  check('3 PUT terkirim', puts.length === 3, String(puts.length));
  check('Rokok & Nongkrong & total bulanan tersimpan', s2.budgetPerCategory.Rokok === 250000 && s2.budgetPerCategory.Nongkrong === 600000 && s2.monthlyBudget === 7500000);

  // ---------- 3. Enter (desktop) tetap menyimpan ----------
  puts.length = 0; await clearToasts();
  await input('Transportasi').tap();
  await input('Transportasi').evaluate((el) => el.select());
  await page.keyboard.type('350000');
  await page.keyboard.press('Enter');
  check('Enter menyimpan', await waitToast(/Budget Transportasi disimpan/));
  check('server: Transportasi = 350000', (await server()).budgetPerCategory.Transportasi === 350000);

  // ---------- 4. Batal mengembalikan ----------
  puts.length = 0;
  await typeLikePhone(input('Kopi'), '999000');
  await page.locator('[data-save-cancel]').tap();
  check('Batal mengembalikan nilai', (await input('Kopi').inputValue()) === '450.000');
  check('Batal menyembunyikan bar & tidak mengirim apa pun', (await bar.isHidden()) && puts.length === 0);

  // ---------- 5. ketuk area kosong melepas fokus (kebiasaan Safari iOS) ----------
  await input('Kopi').tap();
  check('fokus + kb-open aktif', await page.evaluate(() => document.activeElement.dataset.name === 'Kopi' && document.documentElement.classList.contains('kb-open')));
  await tapBlank();
  check('ketuk area kosong melepas fokus', await page.evaluate(() => document.activeElement === document.body || !/INPUT/.test(document.activeElement.tagName)));
  check('kb-open dilepas', await page.evaluate(() => !document.documentElement.classList.contains('kb-open')));

  // ---------- 6. bug yang ditemukan: budget "kembali ke angka lama" lewat sheet kategori ----------
  await page.locator('[data-edit-cat]').first().tap(); // Rokok = kategori pertama
  await page.waitForSelector('dialog.sheet[open] [data-cf]');
  const rokokInSheet = await page.locator('dialog.sheet[open] input[name=budgetLimit]').inputValue();
  check('sheet kategori menampilkan budget TERBARU (bukan angka lama 500.000)', rokokInSheet === '250.000', rokokInSheet);
  await page.locator('dialog.sheet[open] input[name=emoji]').fill('🚭');
  await page.locator('dialog.sheet[open] [type=submit]').tap();
  await waitToast(/Kategori diperbarui/);
  await page.waitForTimeout(800);
  check('menyimpan sheet TIDAK mengembalikan budget ke angka lama', (await server()).budgetPerCategory.Rokok === 250000);

  // ---------- 7. bug yang ditemukan: sheet bertumpuk setelah render ulang ----------
  await page.locator('[data-add-cat]').tap();
  await page.waitForTimeout(400);
  check('"+ Tambah" membuka tepat 1 sheet setelah render ulang', (await page.locator('dialog.sheet[open]').count()) === 1, String(await page.locator('dialog.sheet[open]').count()));
  await page.locator('dialog.sheet[open] [data-sheet-close]').first().tap();
  await page.waitForTimeout(300);

  // ---------- 8. perubahan belum tersimpan tidak hilang saat render ulang ----------
  await typeLikePhone(input('Kopi'), '123000');
  await page.locator('[data-edit-name]').tap();
  await page.waitForSelector('[data-nf]');
  await page.locator('[data-nf] input[name=name]').fill('Raka Baru');
  await page.locator('[data-nf] [type=submit]').tap();
  await page.waitForTimeout(1200);
  check('angka yang belum disimpan bertahan setelah render ulang', (await input('Kopi').inputValue()) === '123.000');
  check('bar simpan masih muncul', await bar.isVisible());

  // ---------- 9. penjaga: pindah halaman dengan perubahan belum disimpan ----------
  await tapBlank(); // keyboard terbuka menyembunyikan nav; lepaskan fokus dulu
  await page.locator('.bottom-nav a[href="#/"]').tap();
  await page.waitForSelector('dialog.sheet[open]');
  check('muncul konfirmasi "Buang perubahan?"', (await page.locator('dialog.sheet[open]').textContent()).includes('Buang perubahan'));
  await page.screenshot({ path: path.join(OUT, 'budget-2-guard.png') });
  await page.getByRole('button', { name: 'Tetap di sini' }).tap();
  await page.waitForTimeout(500);
  check('"Tetap di sini": masih di Pengaturan & angka utuh', page.url().endsWith('#/settings') && (await input('Kopi').inputValue()) === '123.000', page.url());
  await page.locator('.bottom-nav a[href="#/"]').tap();
  await page.waitForSelector('dialog.sheet[open]');
  await page.getByRole('button', { name: 'Buang & pindah' }).tap();
  await page.waitForSelector('.hero', { timeout: 8000 });
  check('"Buang & pindah": ke Beranda, perubahan tidak tersimpan', page.url().endsWith('#/') && (await server()).budgetPerCategory.Kopi === 450000);

  // ---------- 10. angka tidak rusak saat komposisi IME ----------
  await goSettings();
  await input('Kopi').tap();
  await input('Kopi').evaluate((el) => el.select());
  for (const t of ['4', '45', '450', '4500', '45000', '450000']) await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length });
  await cdp.send('Input.insertText', { text: '450000' });
  const composed = await input('Kopi').inputValue();
  check('komposisi IME tidak merusak angka (bukan 99.999.999.999 / 450.000.000)', /^450\.000$/.test(composed) || composed === '450.000', composed);

  // ---------- 11. keyboard ditutup tanpa blur (Android back) ----------
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-budget-form]');
  await input('Kopi').tap();
  check('kb-open aktif saat mengetik', await page.evaluate(() => document.documentElement.classList.contains('kb-open')));
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 390, height: 480 }); // keyboard muncul
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 390, height: 844 }); // keyboard ditutup, fokus tidak lepas
  await page.waitForTimeout(600);
  check('keyboard tertutup → fokus dilepas & kb-open dibersihkan', await page.evaluate(() => !document.documentElement.classList.contains('kb-open') && !/INPUT/.test(document.activeElement.tagName)));
  check('bottom nav kembali terlihat', await page.locator('.bottom-nav').isVisible());

  // ---------- 12. uji layar sempit ----------
  await page.setViewportSize({ width: 320, height: 568 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-budget-form]');
  await typeLikePhone(input('Kopi'), '111000');
  await typeLikePhone(input('Rokok'), '222000');
  const b320 = await bar.boundingBox();
  check('320px: bar muat di layar', b320 && b320.x >= 0 && b320.x + b320.width <= 320, JSON.stringify(b320));
  check('320px: tidak ada scroll horizontal', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(OUT, 'budget-3-320.png') });

  console.log(`\n${pass} lulus, ${fails.length} gagal`);
  if (fails.length) console.log('GAGAL:\n' + fails.join('\n'));
  console.log(problems.length ? 'MASALAH KONSOL:\n' + problems.join('\n') : 'tidak ada error konsol');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('SKRIP GAGAL:', e); process.exit(2); });
