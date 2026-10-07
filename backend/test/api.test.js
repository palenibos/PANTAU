const { startDb, stopDb, newUser, request } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

let app;
test.before(async () => {
  app = await startDb();
});
test.after(stopDb);

const tx = (over = {}) => ({ type: 'expense', category: 'Makan', amount: 25_000, notes: 'Nasi padang', ...over });

// ---------------------------------------------------------------- auth

test('register: sukses, password tidak bocor, kategori default terisi', async () => {
  const u = await newUser(app, { name: 'Niki' });
  assert.equal(u.user.name, 'Niki');
  assert.equal(u.user.password, undefined);
  assert.ok(u.token && u.refreshToken);

  const res = await u.get('/api/categories');
  assert.equal(res.status, 200);
  const names = res.body.data.map((c) => c.name);
  for (const n of ['Rokok', 'Kopi', 'Nongkrong', 'Transportasi', 'Belanja', 'Nabung', 'Sedekah', 'Orang Tua', 'Membayar Hutang', 'Entertainment', 'Makan']) {
    assert.ok(names.includes(n), `kategori ${n} harus ada`);
  }
  assert.equal(res.body.data.find((c) => c.name === 'Rokok').budgetLimit, 500_000);
  assert.equal(res.body.data.find((c) => c.name === 'Makan').budgetLimit, 1_500_000);
});

test('register: validasi pesan Bahasa Indonesia, email unik', async () => {
  const bad = await request(app).post('/api/auth/register').send({ email: 'bukan-email', password: '123', name: '' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.success, false);
  assert.ok(bad.body.errors.length >= 2);
  assert.match(bad.body.errors.map((e) => e.message).join('|'), /Format email nggak valid/);
  assert.match(bad.body.errors.map((e) => e.message).join('|'), /Password minimal 8 karakter/);

  const u = await newUser(app);
  const dup = await request(app).post('/api/auth/register').send({ ...u.creds, email: u.creds.email.toUpperCase() });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.code, 'EMAIL_TAKEN');
});

test('login: sukses & gagal memakai pesan yang sama (tidak bocorkan email terdaftar)', async () => {
  const u = await newUser(app);
  const ok = await request(app).post('/api/auth/login').send({ email: u.creds.email, password: u.creds.password });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  assert.equal(ok.body.user.email, u.creds.email);

  const wrongPw = await request(app).post('/api/auth/login').send({ email: u.creds.email, password: 'salah-banget' });
  const noUser = await request(app).post('/api/auth/login').send({ email: 'gaada@test.com', password: 'password123' });
  assert.equal(wrongPw.status, 401);
  assert.equal(noUser.status, 401);
  assert.equal(wrongPw.body.message, noUser.body.message);
});

test('endpoint terproteksi: tanpa/dengan token rusak/kedaluwarsa', async () => {
  assert.equal((await request(app).get('/api/dashboard')).status, 401);
  assert.equal((await request(app).get('/api/dashboard').set('Authorization', 'Bearer abc.def.ghi')).body.code, 'INVALID_TOKEN');

  const u = await newUser(app);
  const expired = jwt.sign({ sub: u.user.id }, 'test-secret', { expiresIn: -10 });
  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
  assert.equal(res.status, 401);
  assert.equal(res.body.code, 'TOKEN_EXPIRED');

  // token "alg: none" ditolak
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: u.user.id })).toString('base64url')}.`;
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${none}`)).status, 401);
});

test('refresh: rotasi sekali pakai, logout mencabut refresh token', async () => {
  const u = await newUser(app);
  const r1 = await request(app).post('/api/auth/refresh').send({ refreshToken: u.refreshToken });
  assert.equal(r1.status, 200);
  assert.ok(r1.body.token);
  assert.notEqual(r1.body.refreshToken, u.refreshToken);

  const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: u.refreshToken });
  assert.equal(reuse.status, 401);
  assert.equal(reuse.body.code, 'INVALID_REFRESH');

  const out = await request(app).post('/api/auth/logout').send({ refreshToken: r1.body.refreshToken });
  assert.equal(out.status, 200);
  assert.equal((await request(app).post('/api/auth/refresh').send({ refreshToken: r1.body.refreshToken })).status, 401);
  assert.equal((await request(app).post('/api/auth/refresh').send({ refreshToken: 'ngawur' })).status, 401);
});

// ---------------------------------------------------------------- transaksi

test('transaksi: CRUD + timestamp otomatis + emoji kategori', async () => {
  const u = await newUser(app);
  const created = await u.post('/api/transactions', tx());
  assert.equal(created.status, 201);
  assert.equal(created.body.data.emoji, '🍔');
  assert.ok(created.body.data.createdAt);
  assert.ok(Math.abs(new Date(created.body.data.date) - Date.now()) < 5000, 'tanggal default = sekarang');
  const id = created.body.data._id;

  const upd = await u.put(`/api/transactions/${id}`, { amount: 30_000 });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.data.amount, 30_000);
  assert.equal(upd.body.data.notes, 'Nasi padang', 'field yang tidak dikirim tidak berubah');
  assert.equal(upd.body.data.category, 'Makan');

  const cleared = await u.put(`/api/transactions/${id}`, { notes: '' });
  assert.equal(cleared.body.data.notes, '');

  const one = await u.get(`/api/transactions/${id}`);
  assert.equal(one.status, 200);
  assert.equal(one.body.data.notes, '');
  assert.equal(one.body.data.emoji, '🍔');

  assert.equal((await u.del(`/api/transactions/${id}`)).status, 200);
  assert.equal((await u.del(`/api/transactions/${id}`)).status, 404);
  assert.equal((await u.get(`/api/transactions/${id}`)).status, 404);
  assert.equal((await u.get('/api/transactions')).body.total, 0);
});

test('transaksi: validasi nominal, kategori, tipe & tanggal', async () => {
  const u = await newUser(app);
  const cases = [
    [tx({ amount: 0 }), /minimal 1/],
    [tx({ amount: -5000 }), /minimal 1/],
    [tx({ amount: 1500.5 }), /bilangan bulat/],
    [tx({ amount: 'banyak' }), /harus berupa angka/],
    [tx({ amount: 1e12 }), /maksimal/],
    [tx({ type: 'transfer' }), /Tipe nggak valid/],
    [tx({ category: '' }), /Kategori nggak boleh kosong/],
    [tx({ category: 'GaAda' }), /nggak ditemukan/],
    [tx({ category: 'Gaji' }), /bukan kategori pengeluaran/],
    [tx({ type: 'income', category: 'Makan' }), /bukan kategori pemasukan/],
    [tx({ date: 'kemarin sore' }), /bukan tanggal yang valid/],
    [tx({ date: '2999-01-01T00:00:00Z' }), /terlalu jauh/],
    [tx({ notes: 'x'.repeat(201) }), /maksimal 200/],
  ];
  for (const [body, re] of cases) {
    const res = await u.post('/api/transactions', body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
    assert.match(res.body.message, re);
  }
  assert.equal((await u.get('/api/transactions')).body.total, 0);
});

test('keamanan: operator NoSQL & field asing tidak lolos', async () => {
  const u = await newUser(app);
  assert.equal((await u.post('/api/transactions', tx({ category: { $ne: '' } }))).status, 400);
  assert.equal((await u.post('/api/transactions', tx({ amount: { $gt: 0 } }))).status, 400);

  // userId dari body diabaikan (tidak bisa menulis data milik orang lain)
  const other = await newUser(app);
  const res = await u.post('/api/transactions', { ...tx(), userId: other.user.id, _id: '000000000000000000000000' });
  assert.equal(res.status, 201);
  assert.equal((await other.get('/api/transactions')).body.total, 0);

  // query berbentuk operator tidak mengubah filter / tidak bocor data user lain
  const q = await u.get('/api/transactions?category[$ne]=zzz&q[$regex]=.*');
  assert.equal(q.status, 200);
  assert.equal(q.body.total, 1);

  // catatan: karakter kontrol dibuang, spasi dirapikan. HTML disimpan apa adanya (di-escape saat render).
  const n = await u.post('/api/transactions', tx({ notes: '  <b>halo</b>\u0000\u0007  ' }));
  assert.equal(n.body.data.notes, '<b>halo</b>');
});

test('transaksi: user lain tidak bisa lihat / ubah / hapus', async () => {
  const a = await newUser(app);
  const b = await newUser(app);
  const { body } = await a.post('/api/transactions', tx());
  const id = body.data._id;
  assert.equal((await b.put(`/api/transactions/${id}`, { amount: 1 })).status, 404);
  assert.equal((await b.del(`/api/transactions/${id}`)).status, 404);
  assert.equal((await b.get('/api/transactions')).body.total, 0);
  assert.equal((await a.get('/api/transactions')).body.total, 1);
  assert.equal((await a.put('/api/transactions/bukan-id', { amount: 1 })).status, 400);
});

test('transaksi: filter bulan / kategori / tipe / pencarian / nominal + paginasi', async () => {
  const u = await newUser(app);
  const rows = [
    tx({ category: 'Kopi', amount: 20_000, notes: 'Kopi susu', date: '2026-03-10T05:00:00Z' }),
    tx({ category: 'Kopi', amount: 25_000, notes: 'Americano', date: '2026-03-11T05:00:00Z' }),
    tx({ category: 'Makan', amount: 40_000, notes: 'Bakso', date: '2026-03-12T05:00:00Z' }),
    tx({ category: 'Makan', amount: 60_000, notes: 'Sate (100% enak)', date: '2026-04-01T05:00:00Z' }),
    tx({ type: 'income', category: 'Gaji', amount: 5_000_000, notes: '', date: '2026-03-01T03:00:00Z' }),
    // 31 Mar 20:00 UTC = 1 Apr 03:00 WIB -> masuk April
    tx({ category: 'Kopi', amount: 10_000, notes: 'Lewat tengah malam', date: '2026-03-31T20:00:00Z' }),
  ];
  for (const r of rows) assert.equal((await u.post('/api/transactions', r)).status, 201);

  const count = async (qs) => (await u.get(`/api/transactions?${qs}`)).body.total;
  assert.equal(await count('month=2026-03'), 4);
  assert.equal(await count('month=2026-04'), 2);
  assert.equal(await count('month=2026-03&category=Kopi'), 2);
  assert.equal(await count('type=income'), 1);
  assert.equal(await count('q=bakso'), 1);
  assert.equal(await count('q=Kopi'), 3); // cocok catatan & kategori
  assert.equal(await count('q=' + encodeURIComponent('100%')), 1); // karakter regex di-escape
  assert.equal(await count('q=' + encodeURIComponent('.*')), 0);
  assert.equal(await count('minAmount=25000&maxAmount=60000&type=expense'), 3);
  assert.equal(await count('from=2026-03-11&to=2026-03-12'), 2);
  assert.equal((await u.get('/api/transactions?month=2026-13')).status, 400);

  const p1 = await u.get('/api/transactions?limit=4&page=1');
  assert.equal(p1.body.data.length, 4);
  assert.equal(p1.body.hasMore, true);
  const p2 = await u.get('/api/transactions?limit=4&page=2');
  assert.equal(p2.body.data.length, 2);
  assert.equal(p2.body.hasMore, false);
  // urut terbaru dulu
  const dates = p1.body.data.map((t) => +new Date(t.date));
  assert.deepEqual(dates, [...dates].sort((x, y) => y - x));
  assert.equal(p1.body.summary.income, 5_000_000);
});

// ---------------------------------------------------------------- kategori

test('kategori: tambah custom, duplikat, emoji valid, rename ikut ke transaksi, hapus', async () => {
  const u = await newUser(app);
  const add = await u.post('/api/categories', { name: 'Skincare', emoji: '🧴', budgetLimit: 200_000 });
  assert.equal(add.status, 201);
  assert.equal(add.body.data.isDefault, false);

  assert.equal((await u.post('/api/categories', { name: 'skincare', emoji: '🧴' })).status, 409);
  assert.equal((await u.post('/api/categories', { name: 'Teks', emoji: 'abc' })).status, 400);
  assert.equal((await u.post('/api/categories', { name: 'Dua', emoji: '😀😀' })).status, 400);
  assert.equal((await u.post('/api/categories', { name: 'Keluarga', emoji: '👨‍👩‍👧' })).status, 201); // emoji ZWJ = 1 grapheme

  await u.post('/api/transactions', tx({ category: 'Skincare', amount: 90_000 }));
  const id = add.body.data._id;
  const ren = await u.put(`/api/categories/${id}`, { name: 'Perawatan', emoji: '💆' });
  assert.equal(ren.status, 200);
  const list = await u.get('/api/transactions?category=Perawatan');
  assert.equal(list.body.total, 1);
  assert.equal(list.body.data[0].emoji, '💆');

  const del = await u.del(`/api/categories/${id}`);
  assert.equal(del.status, 409);
  assert.match(del.body.message, /Masih ada 1 transaksi/);

  const empty = await u.post('/api/categories', { name: 'Kosong', emoji: '🫙' });
  assert.equal((await u.del(`/api/categories/${empty.body.data._id}`)).status, 200);
});

test('kategori pemasukan & tabungan tidak punya budget', async () => {
  const u = await newUser(app);
  const inc = await u.post('/api/categories', { name: 'Dividen', emoji: '📈', type: 'income', budgetLimit: 100_000 });
  assert.equal(inc.body.data.budgetLimit, 0);
  const sav = await u.post('/api/categories', { name: 'Emas', emoji: '🪙', isSaving: true, budgetLimit: 100_000 });
  assert.equal(sav.body.data.isSaving, true);
  assert.equal(sav.body.data.budgetLimit, 0);
  const nabung = (await u.get('/api/categories')).body.data.find((c) => c.name === 'Nabung');
  assert.equal((await u.put(`/api/settings/budget/${nabung._id}`, { budgetLimit: 1000 })).status, 400);
});

// ---------------------------------------------------------------- pengaturan

test('settings: baca (budgetPerCategory), ubah, budget per kategori', async () => {
  const u = await newUser(app);
  const s = await u.get('/api/settings');
  assert.equal(s.body.data.monthlyBudget, 5_000_000);
  assert.equal(s.body.data.notificationEnabled, true);
  assert.equal(s.body.data.darkMode, false);
  assert.equal(s.body.data.budgetPerCategory.Rokok, 500_000);
  assert.equal(s.body.data.budgetPerCategory.Belanja, undefined);

  const up = await u.put('/api/settings', { darkMode: true, monthlyBudget: 7_000_000, currency: 'IDR' });
  assert.equal(up.status, 200);
  assert.equal(up.body.data.darkMode, true);
  assert.equal(up.body.data.monthlyBudget, 7_000_000);

  assert.equal((await u.put('/api/settings', {})).status, 400);
  assert.equal((await u.put('/api/settings', { currency: 'USD' })).status, 400);
  assert.equal((await u.put('/api/settings', { monthlyBudget: -1 })).status, 400);

  const belanja = (await u.get('/api/categories')).body.data.find((c) => c.name === 'Belanja');
  const b = await u.put(`/api/settings/budget/${belanja._id}`, { budgetLimit: 750_000 });
  assert.equal(b.status, 200);
  assert.equal((await u.get('/api/settings')).body.data.budgetPerCategory.Belanja, 750_000);
  await u.put(`/api/settings/budget/${belanja._id}`, { budgetLimit: 0 });
  assert.equal((await u.get('/api/settings')).body.data.budgetPerCategory.Belanja, undefined);
});

test('reset data: wajib konfirmasi, menghapus transaksi & mengembalikan kategori default', async () => {
  const u = await newUser(app);
  await u.post('/api/transactions', tx());
  await u.post('/api/categories', { name: 'Custom', emoji: '⭐' });

  assert.equal((await u.del('/api/settings/data', {})).status, 400);
  assert.equal((await u.del('/api/settings/data', { confirm: 'ya' })).status, 400);
  assert.equal((await u.del('/api/settings/data', { confirm: 'RESET' })).status, 200);

  assert.equal((await u.get('/api/transactions')).body.total, 0);
  const cats = (await u.get('/api/categories')).body.data;
  assert.equal(cats.some((c) => c.name === 'Custom'), false);
  assert.equal(cats.some((c) => c.name === 'Rokok'), true);
});

test('export: JSON & CSV (aman dari CSV injection)', async () => {
  const u = await newUser(app);
  await u.post('/api/transactions', tx({ notes: '=HYPERLINK("http://jahat")', amount: 12_000 }));
  await u.post('/api/transactions', tx({ notes: 'halo, "dunia"', amount: 13_000 }));

  const csv = await u.get('/api/settings/export?format=csv');
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.headers['content-disposition'], /attachment; filename="pantau-\d{4}-\d{2}-\d{2}\.csv"/);
  assert.ok(csv.text.startsWith('﻿Tanggal (WIB),Tipe,Kategori,Nominal (Rp),Catatan'));
  assert.ok(csv.text.includes(`"'=HYPERLINK(""http://jahat"")"`), 'rumus diberi awalan petik');
  assert.ok(csv.text.includes('"halo, ""dunia"""'));

  const json = await u.get('/api/settings/export');
  assert.equal(json.status, 200);
  assert.equal(json.body.transactions.length, 2);
  assert.equal(json.body.user.password, undefined);
  assert.equal((await u.get('/api/settings/export?format=xml')).status, 400);
});

// ---------------------------------------------------------------- dashboard & analisis

test('dashboard: saldo = aset, tabungan dipisah dari dompet; cache ter-invalidate', async () => {
  const u = await newUser(app);
  await u.post('/api/transactions', tx({ type: 'income', category: 'Gaji', amount: 1_000_000 }));
  await u.post('/api/transactions', tx({ amount: 200_000 }));
  await u.post('/api/transactions', tx({ category: 'Nabung', amount: 100_000 }));

  const d1 = (await u.get('/api/dashboard')).body.data;
  assert.equal(d1.income, 1_000_000);
  assert.equal(d1.expense, 200_000, 'tabungan bukan pengeluaran');
  assert.equal(d1.saved, 100_000);
  assert.equal(d1.netSaving, 800_000);
  assert.equal(d1.saveRate, 80);
  assert.equal(d1.currentBalance, 800_000);
  assert.equal(d1.walletBalance, 700_000);
  assert.equal(d1.totalSavings, 100_000);
  assert.equal(d1.topCategories[0].category, 'Makan');
  assert.equal(d1.recentTransactions.length, 3);
  assert.ok(d1.quickCategories.length >= 3);
  assert.equal(d1.unreadNotifications, 0);

  // setelah menambah transaksi, data baru langsung terlihat (tidak menunggu 5 menit)
  await u.post('/api/transactions', tx({ amount: 50_000 }));
  const d2 = (await u.get('/api/dashboard')).body.data;
  assert.equal(d2.expense, 250_000);
  await u.put('/api/settings', { monthlyBudget: 1_000_000 });
  assert.equal((await u.get('/api/dashboard')).body.data.monthlyBudget.percent, 25);
});

test('analysis: monthly & weekly + validasi parameter', async () => {
  const u = await newUser(app);
  await u.post('/api/transactions', tx({ type: 'income', category: 'Gaji', amount: 5_000_000, date: '2026-01-02T03:00:00Z' }));
  await u.post('/api/transactions', tx({ category: 'Rokok', amount: 900_000, date: '2026-01-10T05:00:00Z' }));

  const m = await u.get('/api/analysis/monthly/2026-01');
  assert.equal(m.status, 200);
  assert.equal(m.body.data.totalIncome, 5_000_000);
  assert.equal(m.body.data.saveRate, 82);
  assert.equal(m.body.data.categoryBreakdown[0].category, 'Rokok');
  assert.ok(Array.isArray(m.body.data.recommendations));

  assert.equal((await u.get('/api/analysis/monthly/2026-1')).status, 400);
  assert.equal((await u.get('/api/analysis/monthly/abcd')).status, 400);
  const empty = await u.get('/api/analysis/monthly/2020-05');
  assert.equal(empty.body.data.healthScore, null);

  const w = await u.get('/api/analysis/weekly?end=2026-01-11');
  assert.equal(w.status, 200);
  assert.equal(w.body.data.totalSpending, 900_000);
  assert.equal(w.body.data.range.start, '2026-01-05');
  assert.equal((await u.get('/api/analysis/weekly?end=kemarin')).status, 400);
});

test('analisis bulan berjalan dibandingkan dengan PERIODE YANG SAMA bulan lalu', async () => {
  const { getMonthlyAnalysis } = require('../services/analysisService');
  const { fromLocal } = require('../utils/time');
  const u = await newUser(app);
  const at = (y, m, d) => fromLocal(y, m, d, 10, 0).toISOString();
  const kopi = (amount, date) => u.post('/api/transactions', { type: 'expense', category: 'Kopi', amount, date });
  await kopi(100_000, at(2026, 2, 5)); // masuk pembanding (1-8 Feb)
  await kopi(400_000, at(2026, 2, 20)); // di luar 1-8 Feb -> TIDAK ikut dibandingkan
  await kopi(150_000, at(2026, 3, 6));

  // "Sekarang" = 8 Mar 2026 12:00 WIB
  const now = fromLocal(2026, 3, 8, 12, 0);
  const a = await getMonthlyAnalysis(u.user.id, '2026-03', { now });
  assert.equal(a.isCurrent, true);
  assert.equal(a.compare.mode, 'month-to-date');
  assert.equal(a.compare.prevLabel, '1–8 Feb');
  assert.equal(a.compare.curLabel, '1–8 Mar');
  assert.equal(a.previous.totalExpense, 100_000);
  assert.equal(a.categoryBreakdown[0].prevAmount, 100_000);
  assert.equal(a.categoryBreakdown[0].changePct, 50);
  assert.ok(a.recommendations.some((r) => /naik 50% dibanding periode yang sama bulan lalu/.test(r)), a.recommendations.join('\n'));

  // Bulan yang sudah selesai: dibandingkan dengan bulan penuh sebelumnya.
  const feb = await getMonthlyAnalysis(u.user.id, '2026-02', { now });
  assert.equal(feb.isCurrent, false);
  assert.equal(feb.compare.mode, 'full-month');
  assert.equal(feb.compare.prevLabel, 'Januari');
  assert.equal(feb.totalExpense, 500_000);
});

test('error handling: 404 API, JSON rusak, ID tidak valid, health', async () => {
  const u = await newUser(app);
  const nf = await u.get('/api/ngawur');
  assert.equal(nf.status, 404);
  assert.equal(nf.body.success, false);

  const bad = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'BAD_JSON');

  assert.equal((await request(app).get('/api/health')).body.status, 'ok');
  const headers = (await request(app).get('/api/health')).headers;
  assert.equal(headers['x-powered-by'], undefined);
  assert.match(headers['content-security-policy'], /default-src 'self'/);
});

test('frontend statis & fallback SPA dilayani server', async () => {
  const idx = await request(app).get('/');
  assert.equal(idx.status, 200);
  assert.match(idx.headers['content-type'], /html/);
  const deep = await request(app).get('/halaman-apa-saja');
  assert.equal(deep.status, 200);
  assert.match(deep.text, /PANTAU/);
});
