const { startDb, stopDb, newUser, request } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

let app;
test.before(async () => {
  app = await startDb();
});
test.after(stopDb);

const kopi = (amount, extra = {}) => ({ type: 'expense', category: 'Kopi', amount, notes: 'kopi', ...extra });

// Budget Kopi default = Rp 300.000 / bulan.
test('alert budget 3-tier: 60% info, 80% warning, 100% danger (+ ulang saat sudah jebol)', async () => {
  const u = await newUser(app, { name: 'Niki Jaya' });

  const steps = [
    // [nominal, tier yang diharapkan (null = tanpa alert), total setelahnya]
    [150_000, null], //  50%
    [40_000, 1], //  63%  -> info
    [10_000, null], //  67%  masih tier 1, tidak diulang
    [60_000, 2], //  87%  -> warning
    [10_000, null], //  90%  masih tier 2
    [40_000, 3], // 100%+ -> danger
    [10_000, 3], // sudah jebol & nambah lagi -> danger lagi
  ];
  const seen = [];
  for (const [amount, expected] of steps) {
    const res = await u.post('/api/transactions', kopi(amount));
    assert.equal(res.status, 201);
    const alert = res.body.alerts[0] || null;
    assert.equal(alert ? alert.tier : null, expected, `nominal ${amount}`);
    if (alert) seen.push(alert);
  }

  assert.deepEqual(seen.map((a) => a.level), ['info', 'warning', 'danger', 'danger']);
  assert.equal(seen[0].category, 'Kopi');
  assert.equal(seen[0].emoji, '☕');
  assert.equal(seen[0].limit, 300_000);
  assert.equal(seen[0].spent, 190_000); // 150k + 40k, total bulan ini
  assert.equal(seen[0].percent, 63.3);
  assert.match(seen[1].message, /4x keluar/, 'tier 2 kopi menyebut berapa kali hari ini');
  assert.match(seen[2].message, /Rp \d+k|selesai/);
  assert.match(seen[3].message, /Overspend Rp 20k|lewat budget Rp 20k/);

  // semua tersimpan di inbox (1 + 1 + 2)
  const inbox = await u.get('/api/notifications');
  assert.equal(inbox.status, 200);
  assert.equal(inbox.body.data.filter((n) => n.kind === 'budget').length, 4);
  assert.equal(inbox.body.unread, 4);

  const dash = (await u.get('/api/dashboard')).body.data;
  assert.equal(dash.unreadNotifications, 4);
  assert.equal(dash.latestAlert.tier, 3);
  assert.equal(dash.budgetAlerts[0].category, 'Kopi');

  assert.equal((await u.put('/api/notifications/read')).status, 200);
  assert.equal((await u.get('/api/notifications')).body.unread, 0);
});

test('alert: tier 1 & 2 hanya sekali per kategori per bulan (hapus & tambah lagi tidak spam)', async () => {
  const u = await newUser(app);
  const a = await u.post('/api/transactions', kopi(200_000)); // 67% -> tier 1
  assert.equal(a.body.alerts[0].tier, 1);
  await u.del(`/api/transactions/${a.body.data._id}`);
  const again = await u.post('/api/transactions', kopi(200_000));
  assert.deepEqual(again.body.alerts, []);
});

test('alert: kopi tier 2 menyebut jumlah transaksi hari ini', async () => {
  const u = await newUser(app, { name: 'Raka' });
  await u.post('/api/transactions', kopi(100_000));
  await u.post('/api/transactions', kopi(50_000));
  await u.post('/api/transactions', kopi(10_000));
  const res = await u.post('/api/transactions', kopi(90_000)); // 250k = 83%, 4 transaksi hari ini
  assert.equal(res.body.alerts[0].tier, 2);
  assert.match(res.body.alerts[0].message, /Raka, budget kopi hari ini udah 4x keluar/);
});

test('alert: tidak muncul untuk pemasukan, tabungan, tanpa budget, bulan lain, atau saat dimatikan', async () => {
  const u = await newUser(app);

  const inc = await u.post('/api/transactions', { type: 'income', category: 'Gaji', amount: 9_000_000 });
  assert.deepEqual(inc.body.alerts, []);
  const sav = await u.post('/api/transactions', { type: 'expense', category: 'Nabung', amount: 9_000_000 });
  assert.deepEqual(sav.body.alerts, []);
  const noBudget = await u.post('/api/transactions', { type: 'expense', category: 'Belanja', amount: 9_000_000 });
  assert.deepEqual(noBudget.body.alerts, []);

  // transaksi bulan lalu (input mundur) bukan "real-time"
  const old = new Date();
  old.setUTCMonth(old.getUTCMonth() - 2);
  const back = await u.post('/api/transactions', kopi(900_000, { date: old.toISOString() }));
  assert.equal(back.status, 201);
  assert.deepEqual(back.body.alerts, []);

  // notifikasi dimatikan
  await u.put('/api/settings', { notificationEnabled: false });
  const off = await u.post('/api/transactions', kopi(900_000));
  assert.deepEqual(off.body.alerts, []);
});

test('alert juga berlaku saat edit nominal naik, dan kalau pindah kategori', async () => {
  const u = await newUser(app);
  const t = await u.post('/api/transactions', kopi(100_000)); // 33%
  assert.deepEqual(t.body.alerts, []);

  const up = await u.put(`/api/transactions/${t.body.data._id}`, { amount: 270_000 }); // 90%
  assert.equal(up.body.alerts[0].tier, 2);
  assert.equal(up.body.alerts[0].spent, 270_000);

  // edit tanpa menambah pengeluaran tidak memicu apa pun
  const same = await u.put(`/api/transactions/${t.body.data._id}`, { notes: 'ganti catatan' });
  assert.deepEqual(same.body.alerts, []);

  // pindah transaksi 'Makan' kecil ke 'Rokok' (budget 500k) sampai 100%
  const m = await u.post('/api/transactions', { type: 'expense', category: 'Makan', amount: 500_000 });
  const moved = await u.put(`/api/transactions/${m.body.data._id}`, { category: 'Rokok' });
  assert.equal(moved.body.alerts[0].tier, 3);
  assert.equal(moved.body.alerts[0].category, 'Rokok');
});

test('alert: tier 3 pas 100% = "selesai", lewat = overspend', async () => {
  const u = await newUser(app);
  const exact = await u.post('/api/transactions', kopi(300_000));
  assert.equal(exact.body.alerts[0].tier, 3);
  assert.match(exact.body.alerts[0].message, /selesai/);
  const over = await u.post('/api/transactions', kopi(50_000));
  assert.match(over.body.alerts[0].message, /Rp 50k/);
});

// ---------------------------------------------------------------- digest

const User = require('../models/User');
const Notification = require('../models/Notification');
const MonthlyAnalysis = require('../models/Analysis');
const { lastWeeklyDigest, lastMonthlyDigest, addDays, fromLocal } = require('../utils/time');

test('digest mingguan & bulanan muncul di inbox, hanya sekali, dan bisa dimatikan', async () => {
  const u = await newUser(app);
  const now = new Date();
  const wk = lastWeeklyDigest(now);
  const mo = lastMonthlyDigest(now);

  // User "sudah lama": mundurkan createdAt, lalu catat transaksi di dalam jendela digest.
  await User.updateOne({ _id: u.user.id }, { $set: { createdAt: new Date(now.getTime() - 120 * 86400000) } }, { overwriteImmutable: true });
  const [wy, wm, wd] = addDays(wk.key, -2).split('-').map(Number); // Jumat sebelum Minggu digest
  const [my, mm] = mo.key.split('-').map(Number);
  const fri = fromLocal(wy, wm, wd, 12).toISOString();
  const midMonth = fromLocal(my, mm, 10, 12).toISOString();

  await u.post('/api/transactions', { type: 'income', category: 'Gaji', amount: 5_000_000, date: midMonth });
  await u.post('/api/transactions', { type: 'expense', category: 'Makan', amount: 400_000, date: midMonth });
  await u.post('/api/transactions', { type: 'expense', category: 'Kopi', amount: 60_000, date: fri });

  const res = await u.get('/api/notifications');
  const kinds = res.body.data.map((n) => n.kind).sort();
  assert.ok(kinds.includes('weekly'), `weekly ada: ${kinds}`);
  assert.ok(kinds.includes('monthly'), `monthly ada: ${kinds}`);
  const weekly = res.body.data.find((n) => n.kind === 'weekly');
  assert.match(weekly.title, /Ringkasan mingguan/);
  assert.match(weekly.message, /Top 3/);
  const monthly = res.body.data.find((n) => n.kind === 'monthly');
  assert.match(monthly.message, /Skor kesehatan: \d+\/100/);

  // idempoten
  const before = await Notification.countDocuments({ userId: u.user.id });
  await u.get('/api/notifications');
  await u.get('/api/dashboard');
  assert.equal(await Notification.countDocuments({ userId: u.user.id }), before);

  // snapshot bulanan tersimpan di collection monthly_analysis
  const snap = await MonthlyAnalysis.findOne({ userId: u.user.id, month: mo.key }).lean();
  assert.ok(snap, 'snapshot analisis bulanan tersimpan');
  assert.equal(snap.totalIncome, 5_000_000);

  // user baru (createdAt = sekarang) tidak dibanjiri digest periode sebelum dia daftar
  const fresh = await newUser(app);
  await fresh.post('/api/transactions', { type: 'expense', category: 'Kopi', amount: 20_000, date: fri });
  assert.equal((await fresh.get('/api/notifications')).body.data.length, 0);

  // notifikasi dimatikan -> tidak ada digest
  const quiet = await newUser(app);
  await User.updateOne({ _id: quiet.user.id }, { $set: { createdAt: new Date(now.getTime() - 120 * 86400000) } }, { overwriteImmutable: true });
  await quiet.post('/api/transactions', { type: 'expense', category: 'Makan', amount: 20_000, date: midMonth });
  await quiet.put('/api/settings', { notificationEnabled: false });
  assert.equal((await quiet.get('/api/notifications')).body.data.length, 0);
});

// ---------------------------------------------------------------- seed demo

test('seed demo: akun email@test.com / password123 dengan 3 bulan data', async () => {
  const { seedDemo } = require('../scripts/seedDemo');
  const { transactions } = await seedDemo();
  assert.ok(transactions > 150);

  const login = await request(app).post('/api/auth/login').send({ email: 'email@test.com', password: 'password123' });
  assert.equal(login.status, 200);
  const token = login.body.token;
  const get = (url) => request(app).get(url).set('Authorization', `Bearer ${token}`);

  const dash = (await get('/api/dashboard')).body.data;
  assert.ok(dash.income > 0 && dash.expense > 0);
  assert.ok(dash.recentTransactions.length === 5);

  const months = new Set();
  let page = 1;
  for (;;) {
    const r = (await get(`/api/transactions?limit=100&page=${page}`)).body;
    r.data.forEach((t) => months.add(t.date.slice(0, 7)));
    if (!r.hasMore) break;
    page += 1;
  }
  assert.ok(months.size >= 3, `data mencakup >= 3 bulan, dapat: ${[...months]}`);

  // seed ulang tidak menggandakan data
  const again = await seedDemo();
  assert.equal(again.transactions, transactions);
  assert.equal((await get('/api/auth/me')).status, 401, 'token lama milik user yang dihapus tidak berlaku');
});
