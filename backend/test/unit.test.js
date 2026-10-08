process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');

const time = require('../utils/time');
const { rp, rpShort, roundNice } = require('../utils/money');
const a = require('../utils/analysis');
const { budgetMessage } = require('../utils/messages');

// ---------- uang ----------
test('rp memformat rupiah dengan titik ribuan', () => {
  assert.equal(rp(1234567), 'Rp 1.234.567');
  assert.equal(rp(0), 'Rp 0');
  assert.equal(rp(-50000), '-Rp 50.000');
});

test('rpShort memakai gaya k / jt', () => {
  assert.equal(rpShort(50000), 'Rp 50k');
  assert.equal(rpShort(900000), 'Rp 900k');
  assert.equal(rpShort(1250000), 'Rp 1,3jt');
  assert.equal(rpShort(1000000), 'Rp 1jt');
  assert.equal(rpShort(750), 'Rp 750');
});

test('roundNice membulatkan ke angka enak dibaca', () => {
  assert.equal(roundNice(42_000), 40_000);
  assert.equal(roundNice(183_000), 180_000);
  assert.equal(roundNice(1_000), 5_000);
});

// ---------- waktu (WIB) ----------
test('batas bulan memakai WIB, bukan UTC', () => {
  // 31 Okt 2026 20:00 UTC = 1 Nov 2026 03:00 WIB -> sudah masuk November
  assert.equal(time.monthKey(new Date('2026-10-31T20:00:00Z')), '2026-11');
  assert.equal(time.monthKey(new Date('2026-10-31T16:59:00Z')), '2026-10');
  const { start, end } = time.monthRange('2026-10');
  assert.equal(start.toISOString(), '2026-09-30T17:00:00.000Z');
  assert.equal(end.toISOString(), '2026-10-31T17:00:00.000Z');
});

test('addMonths & daysInMonth', () => {
  assert.equal(time.addMonths('2026-01', -1), '2025-12');
  assert.equal(time.addMonths('2026-12', 1), '2027-01');
  assert.equal(time.daysInMonth('2028-02'), 29);
  assert.equal(time.daysInMonth('2026-02'), 28);
});

test('digest mingguan = Minggu 19:00 WIB terakhir yang sudah lewat', () => {
  // Rabu 7 Okt 2026 -> Minggu 4 Okt
  assert.equal(time.lastWeeklyDigest(new Date('2026-10-07T05:00:00Z')).key, '2026-10-04');
  // Minggu 4 Okt 18:00 WIB (belum 19:00) -> Minggu sebelumnya
  assert.equal(time.lastWeeklyDigest(new Date('2026-10-04T11:00:00Z')).key, '2026-09-27');
  // Minggu 4 Okt 19:30 WIB -> hari itu
  assert.equal(time.lastWeeklyDigest(new Date('2026-10-04T12:30:00Z')).key, '2026-10-04');
});

test('digest bulanan = hari terakhir bulan 20:00 WIB', () => {
  assert.equal(time.lastMonthlyDigest(new Date('2026-10-15T05:00:00Z')).key, '2026-09');
  assert.equal(time.lastMonthlyDigest(new Date('2026-10-31T12:59:00Z')).key, '2026-09'); // 19:59 WIB
  assert.equal(time.lastMonthlyDigest(new Date('2026-10-31T13:00:00Z')).key, '2026-10'); // 20:00 WIB
});

test('weekWindow mencakup 7 hari penuh dan 7 hari pembanding', () => {
  const w = time.weekWindow('2026-10-04');
  assert.equal(w.startKey, '2026-09-28');
  assert.equal((w.end - w.start) / time.DAY_MS, 7);
  assert.equal(w.prevEnd.getTime(), w.start.getTime());
});

// ---------- tier budget ----------
test('tierFor: 60 / 80 / 100', () => {
  assert.deepEqual([0, 59.9, 60, 79.9, 80, 99.9, 100, 140].map(a.tierFor), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('evaluateBudget hanya memicu saat ambang baru terlewati', () => {
  const L = 100_000;
  assert.equal(a.evaluateBudget({ limit: L, before: 0, after: 50_000 }), null);
  assert.equal(a.evaluateBudget({ limit: L, before: 50_000, after: 60_000 }).tier, 1);
  assert.equal(a.evaluateBudget({ limit: L, before: 60_000, after: 70_000 }), null); // masih tier 1
  assert.equal(a.evaluateBudget({ limit: L, before: 70_000, after: 85_000 }).tier, 2);
  assert.equal(a.evaluateBudget({ limit: L, before: 10_000, after: 90_000 }).tier, 2); // loncat tier
  const t3 = a.evaluateBudget({ limit: L, before: 90_000, after: 100_000 });
  assert.equal(t3.tier, 3);
  assert.equal(t3.repeat, false);
  const again = a.evaluateBudget({ limit: L, before: 100_000, after: 120_000 });
  assert.equal(again.tier, 3);
  assert.equal(again.repeat, true);
  assert.equal(a.evaluateBudget({ limit: 0, before: 0, after: 1_000_000 }), null); // tanpa budget
  assert.equal(a.evaluateBudget({ limit: L, before: 80_000, after: 70_000 }), null); // berkurang
});

// ---------- teks notifikasi ----------
const ctx = { category: 'Rokok', emoji: '🚬', userName: 'niki jaya', percent: 62, spent: 310_000, limit: 500_000, daysLeft: 12, todayCount: 0 };

test('pesan tier 1 menyebut sisa persen & tidak kosong', () => {
  const m = budgetMessage({ ...ctx, tier: 1 });
  assert.equal(m.level, 'info');
  assert.match(m.message, /tinggal 38%/);
});

test('pesan tier 2 menyebut sisa rupiah', () => {
  const m = budgetMessage({ ...ctx, tier: 2, percent: 90, spent: 450_000 }, () => 0);
  assert.equal(m.level, 'warning');
  assert.match(m.message, /Rp 50k/);
});

test('pesan tier 2 kopi: hitung berapa kali hari ini', () => {
  const m = budgetMessage({ ...ctx, category: 'Kopi', emoji: '☕', tier: 2, todayCount: 4 });
  assert.match(m.message, /4x keluar/);
  assert.match(m.message, /Niki,/); // nama depan, kapital
});

test('pesan tier 3: overspend menyebut selisih, pas = selesai', () => {
  const over = budgetMessage({ ...ctx, tier: 3, percent: 110, spent: 550_000 }, () => 0);
  assert.equal(over.level, 'danger');
  assert.match(over.message, /Rp 50k/);
  const exact = budgetMessage({ ...ctx, tier: 3, percent: 100, spent: 500_000 });
  assert.match(exact.message, /selesai/);
});

test('nama user kosong -> sapaan netral', () => {
  const m = budgetMessage({ ...ctx, category: 'Kopi', tier: 2, userName: '', todayCount: 3 });
  assert.match(m.message, /^Bestie,/);
});

// ---------- analisis ----------
const D = (iso) => new Date(iso);
const cats = [
  { name: 'Gaji', emoji: '💼', type: 'income' },
  { name: 'Makan', emoji: '🍔', type: 'expense', budgetLimit: 1_000_000 },
  { name: 'Rokok', emoji: '🚬', type: 'expense', budgetLimit: 500_000 },
  { name: 'Nongkrong', emoji: '🎉', type: 'expense', budgetLimit: 0 },
  { name: 'Nabung', emoji: '💰', type: 'expense', isSaving: true },
  { name: 'Orang Tua', emoji: '👨‍👩‍👧', type: 'expense' },
];
const tx = (type, category, amount, date) => ({ type, category, amount, date: D(date) });

test('summarize: tabungan bukan belanja; net saving = income - belanja', () => {
  const s = a.summarize(
    [tx('income', 'Gaji', 5_000_000, '2026-09-01T03:00:00Z'), tx('expense', 'Makan', 1_000_000, '2026-09-02T03:00:00Z'), tx('expense', 'Nabung', 500_000, '2026-09-03T03:00:00Z')],
    a.indexCategories(cats),
  );
  assert.equal(s.spending, 1_000_000);
  assert.equal(s.saving, 500_000);
  assert.equal(s.netSaving, 4_000_000);
  assert.equal(s.saveRate, 80);
});

test('healthScore: 70 poin save rate + 30 poin disiplin budget', () => {
  assert.equal(a.healthScore({ saveRate: 30, hasIncome: true, budgets: [{ over: 0 }, { over: 0 }] }), 100);
  assert.equal(a.healthScore({ saveRate: 15, hasIncome: true, budgets: [{ over: 0 }, { over: 10 }] }), 50); // 35 + 15
  assert.equal(a.healthScore({ saveRate: -20, hasIncome: true, budgets: [] }), 15);
  assert.equal(a.healthScore({ saveRate: 0, hasIncome: false, budgets: [{ over: 5 }] }), 0);
  assert.equal(a.healthScore({ saveRate: 80, hasIncome: true, budgets: [{ over: 0 }] }), 100); // dibatasi
});

function monthly(txs, prevTxs = [], history = []) {
  return a.buildMonthlyAnalysis({ month: '2026-09', txs, prevTxs, history, categories: cats });
}

test('bulanan: ringkasan, top 3, dan save rate', () => {
  const r = monthly([
    tx('income', 'Gaji', 5_000_000, '2026-09-01T03:00:00Z'),
    tx('expense', 'Makan', 1_200_000, '2026-09-05T05:00:00Z'),
    tx('expense', 'Rokok', 900_000, '2026-09-06T05:00:00Z'),
    tx('expense', 'Orang Tua', 700_000, '2026-09-07T05:00:00Z'),
    tx('expense', 'Nongkrong', 200_000, '2026-09-08T05:00:00Z'),
  ]);
  assert.equal(r.totalIncome, 5_000_000);
  assert.equal(r.totalExpense, 3_000_000);
  assert.equal(r.netSaving, 2_000_000);
  assert.equal(r.saveRate, 40);
  assert.deepEqual(r.topSpenders.map((t) => t.category), ['Makan', 'Rokok', 'Orang Tua']);
  assert.equal(r.categoryBreakdown[0].percentage, 40);
  // Makan 1,2jt dari budget 1jt & Rokok 900k dari 500k => dua-duanya jebol, skor budget 0
  assert.equal(r.budgetStatus.filter((b) => b.over > 0).length, 2);
  assert.equal(r.healthScore, 70);
});

test('bulanan: rekomendasi potong 20% menyebut angka (gaya spec)', () => {
  const r = monthly([tx('income', 'Gaji', 5_000_000, '2026-09-01T03:00:00Z'), tx('expense', 'Rokok', 900_000, '2026-09-06T05:00:00Z')]);
  assert.ok(r.recommendations.some((t) => /Rokok kamu Rp 900k\/bulan\. Kalau dikurangin 20%, bisa kumpul Rp 180k\/bulan/.test(t)), r.recommendations.join('\n'));
});

test('bulanan: save rate 30% -> "target 35%"', () => {
  const r = monthly([tx('income', 'Gaji', 10_000_000, '2026-09-01T03:00:00Z'), tx('expense', 'Orang Tua', 7_000_000, '2026-09-05T05:00:00Z')]);
  assert.equal(r.saveRate, 30);
  assert.match(r.recommendations[0], /30% dari income\. Bagus! Bulan depan target 35%/);
});

test('bulanan: defisit + bulan paling boros + income stabil', () => {
  const r = monthly(
    [tx('income', 'Gaji', 5_000_000, '2026-09-01T03:00:00Z'), tx('expense', 'Orang Tua', 6_000_000, '2026-09-05T05:00:00Z')],
    [tx('income', 'Gaji', 5_000_000, '2026-08-01T03:00:00Z'), tx('expense', 'Orang Tua', 3_000_000, '2026-08-05T05:00:00Z')],
    [{ month: '2026-08', spending: 3_000_000 }, { month: '2026-07', spending: 3_500_000 }],
  );
  assert.equal(r.netSaving, -1_000_000);
  assert.match(r.recommendations[0], /^Income stabil, tapi pengeluaran melebihi\./);
  assert.match(r.recommendations[0], /bulan paling boros/);
  assert.equal(r.healthScore, 30); // save rate negatif = 0 poin; 2 kategori ber-budget tidak jebol = 30 poin
});

test('bulanan: kategori naik drastis & turun terkontrol vs bulan lalu', () => {
  const r = monthly(
    [
      tx('income', 'Gaji', 8_000_000, '2026-09-01T03:00:00Z'),
      tx('expense', 'Nongkrong', 600_000, '2026-09-05T05:00:00Z'),
      tx('expense', 'Rokok', 300_000, '2026-09-06T05:00:00Z'),
    ],
    [tx('expense', 'Nongkrong', 300_000, '2026-08-05T05:00:00Z'), tx('expense', 'Rokok', 500_000, '2026-08-06T05:00:00Z')],
  );
  assert.equal(r.trends.rising[0].category, 'Nongkrong');
  assert.equal(r.trends.rising[0].changePct, 100);
  assert.equal(r.trends.controlled[0].category, 'Rokok');
  assert.ok(r.recommendations.some((t) => /Nongkrong naik 100%/.test(t)));
  assert.ok(r.recommendations.some((t) => /Rokok turun 40%/.test(t)));
});

test('bulanan: pola Jumat-Minggu untuk Nongkrong', () => {
  // 2026-09-04 Jumat, 05 Sabtu, 06 Minggu (WIB)
  const r = monthly([
    tx('income', 'Gaji', 8_000_000, '2026-09-01T03:00:00Z'),
    tx('expense', 'Nongkrong', 100_000, '2026-09-04T12:00:00Z'),
    tx('expense', 'Nongkrong', 100_000, '2026-09-05T12:00:00Z'),
    tx('expense', 'Nongkrong', 100_000, '2026-09-06T12:00:00Z'),
  ]);
  assert.ok(r.recommendations.some((t) => /Nongkrong kamu mostly Jumat–Minggu \(100% dari total\)/.test(t)), r.recommendations.join('\n'));
});

test('bulanan: tanpa transaksi -> skor null & ajakan mencatat', () => {
  const r = monthly([]);
  assert.equal(r.healthScore, null);
  assert.match(r.recommendations[0], /Belum ada transaksi/);
});

test('bulanan: tanpa pemasukan -> minta catat pemasukan, skor tidak naik dari save rate', () => {
  const r = monthly([tx('expense', 'Makan', 100_000, '2026-09-02T05:00:00Z')]);
  assert.equal(r.hasIncome, false);
  assert.match(r.recommendations[0], /Belum ada pemasukan/);
  assert.equal(r.healthScore, 30); // budget Makan aman (30) + save 0
});

test('mingguan: top 3, perbandingan %, dan kenaikan terbesar', () => {
  const w = time.weekWindow('2026-10-04'); // Sen 28 Sep - Min 4 Okt
  const r = a.buildWeeklyAnalysis({
    txs: [
      tx('expense', 'Makan', 100_000, '2026-09-29T05:00:00Z'),
      tx('expense', 'Rokok', 90_000, '2026-09-30T05:00:00Z'),
      tx('expense', 'Nongkrong', 60_000, '2026-10-02T12:00:00Z'),
      tx('expense', 'Orang Tua', 10_000, '2026-10-03T05:00:00Z'),
    ],
    prevTxs: [tx('expense', 'Makan', 100_000, '2026-09-22T05:00:00Z'), tx('expense', 'Rokok', 30_000, '2026-09-23T05:00:00Z')],
    categories: cats,
    window: w,
  });
  assert.equal(r.totalSpending, 260_000);
  assert.equal(r.previousSpending, 130_000);
  assert.equal(r.changePct, 100);
  assert.deepEqual(r.topCategories.map((c) => c.category), ['Makan', 'Rokok', 'Nongkrong']);
  assert.equal(r.biggestRise.category, 'Rokok');
  assert.equal(r.biggestRise.changePct, 200);
  assert.match(r.recommendation, /rokok kamu \+200%/);
  assert.equal(r.dailyTotals.length, 7);
  assert.equal(r.dailyTotals.reduce((s, d) => s + d.amount, 0), 260_000);
});

test('mingguan: minggu lalu kosong -> changePct null (bukan Infinity)', () => {
  const w = time.weekWindow('2026-10-04');
  const r = a.buildWeeklyAnalysis({ txs: [tx('expense', 'Makan', 50_000, '2026-09-29T05:00:00Z')], prevTxs: [], categories: cats, window: w });
  assert.equal(r.changePct, null);
});
