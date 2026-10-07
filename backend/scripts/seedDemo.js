// Data demo: 2 bulan penuh + bulan berjalan, dengan "cerita" supaya analisis & rekomendasi
// kelihatan hidup (bulan lalu sengaja boros, nongkrong numpuk Jumat–Minggu, kopi jebol budget).
// Akun: email@test.com / password123
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const MonthlyAnalysis = require('../models/Analysis');
const Category = require('../models/Category');
const { seedDefaultCategories } = require('../services/categoryService');
const { monthKey, dayKey, addMonths, daysInMonth, fromLocal } = require('../utils/time');

const DEMO = { email: 'email@test.com', password: 'password123', name: 'Demo' };

// PRNG deterministik: seed yang sama => data yang sama.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOTES = {
  Rokok: ['Rokok sebungkus', 'Beli rokok di warung', 'Vape liquid', 'Rokok + korek'],
  Kopi: ['Kopi susu gula aren', 'Americano', 'Es kopi kenangan', 'Kopi sachet kantor', 'Matcha latte'],
  Nongkrong: ['Nongkrong di cafe', 'Ngopi bareng temen', 'Hangout weekend', 'Warkop malam', 'Bar rooftop'],
  Transportasi: ['Ojek online', 'Bensin motor', 'Commuter line', 'MRT', 'Parkir'],
  Belanja: ['Shopee checkout', 'Beli kaos', 'Skincare', 'Tokopedia', 'Sepatu'],
  Makan: ['Nasi padang', 'Ayam geprek', 'GoFood malam', 'Mie ayam', 'Makan siang kantor', 'Bakso'],
  Entertainment: ['Nonton bioskop', 'Top up game', 'Langganan Netflix', 'Spotify'],
  Sedekah: ['Infaq Jumat', 'Kotak amal', 'Donasi banjir'],
  'Orang Tua': ['Kirim ke ibu', 'Bantu bayar listrik rumah'],
  'Membayar Hutang': ['Cicilan HP', 'Bayar paylater'],
  Nabung: ['Nabung bulanan', 'Dana darurat'],
};

function buildTransactions(now, rand) {
  const cur = monthKey(now);
  const months = [addMonths(cur, -2), addMonths(cur, -1), cur];
  const txs = [];
  const r = (min, max) => min + rand() * (max - min);
  const rint = (min, max) => Math.floor(r(min, max + 1));
  const round = (n, step = 1000) => Math.max(step, Math.round(n / step) * step);
  const note = (cat) => NOTES[cat][rint(0, NOTES[cat].length - 1)];

  const add = (y, m, d, cat, type, amount, hMin = 8, hMax = 21) => {
    const date = fromLocal(y, m, d, rint(hMin, hMax), rint(0, 59));
    if (date > now) return;
    txs.push({ type, category: cat, amount, notes: type === 'income' ? '' : note(cat), date });
  };

  months.forEach((month, idx) => {
    const [y, m] = month.split('-').map(Number);
    const boros = idx === 1; // bulan lalu: sengaja boros
    const days = daysInMonth(month);

    // Pemasukan
    add(y, m, 1, 'Gaji', 'income', 5_500_000, 9, 10);
    if (idx === 0) add(y, m, 14, 'Freelance', 'income', 800_000, 13, 16);
    if (idx === 2) add(y, m, 2, 'Uang Saku', 'income', 250_000, 12, 15);

    // Rutinitas bulanan
    add(y, m, 2, 'Nabung', 'expense', idx === 0 ? 1_000_000 : boros ? 300_000 : 750_000, 10, 12);
    add(y, m, 3, 'Orang Tua', 'expense', boros ? 500_000 : 700_000, 10, 15);
    add(y, m, 5, 'Membayar Hutang', 'expense', boros ? 400_000 : 350_000, 10, 15);
    add(y, m, 12, 'Entertainment', 'expense', 54_000, 8, 20); // langganan (dilewati otomatis kalau belum tanggalnya)

    for (let d = 1; d <= days; d++) {
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const weekday = dow >= 1 && dow <= 5;
      const weekendish = dow === 5 || dow === 6 || dow === 0; // Jumat–Minggu

      // Kopi
      if (weekday && rand() < (boros ? 0.85 : 0.55)) {
        const n = boros && rand() < 0.3 ? 2 : 1;
        for (let i = 0; i < n; i++) add(y, m, d, 'Kopi', 'expense', round(r(18_000, 28_000), 1000), 8, 16);
      }
      // Makan
      const meals = rand() < (boros ? 0.6 : 0.45) ? 2 : 1;
      for (let i = 0; i < meals; i++) add(y, m, d, 'Makan', 'expense', round(r(boros ? 22_000 : 20_000, boros ? 42_000 : 38_000), 1000), 11, 20);
      // Rokok
      if (rand() < (boros ? 0.5 : 0.3)) add(y, m, d, 'Rokok', 'expense', round(r(29_000, 35_000), 1000), 9, 22);
      // Transportasi
      if (weekday && rand() < 0.7) add(y, m, d, 'Transportasi', 'expense', round(r(12_000, 28_000), 1000), 7, 18);
      if (dow === 1 && rand() < 0.8) add(y, m, d, 'Transportasi', 'expense', round(r(50_000, 80_000), 5000), 7, 9); // bensin
      // Nongkrong: numpuk Jumat–Minggu
      if ((weekendish ? rand() < (boros ? 0.6 : 0.35) : rand() < 0.04)) add(y, m, d, 'Nongkrong', 'expense', round(r(boros ? 85_000 : 60_000, boros ? 135_000 : 100_000), 5000), 17, 23);
      // Sedekah tiap Jumat
      if (dow === 5 && rand() < 0.6) add(y, m, d, 'Sedekah', 'expense', round(r(10_000, 20_000), 5000), 11, 13);
      // Belanja & hiburan acak
      if (rand() < (boros ? 0.1 : 0.07)) add(y, m, d, 'Belanja', 'expense', round(r(80_000, boros ? 380_000 : 250_000), 5000), 10, 21);
      if (rand() < 0.07) add(y, m, d, 'Entertainment', 'expense', round(r(40_000, 150_000), 5000), 14, 22);
    }
  });

  return txs;
}

/**
 * Buat/ulang akun demo beserta datanya.
 * @returns {Promise<{user: object, transactions: number}>}
 */
async function seedDemo({ now = new Date(), email = DEMO.email, password = DEMO.password, name = DEMO.name } = {}) {
  const existing = await User.findOne({ email }).select('_id');
  if (existing) {
    await Promise.all([
      Transaction.deleteMany({ userId: existing._id }),
      Notification.deleteMany({ userId: existing._id }),
      MonthlyAnalysis.deleteMany({ userId: existing._id }),
      Category.deleteMany({ userId: existing._id }),
      User.deleteOne({ _id: existing._id }),
    ]);
  }

  // Akun "sudah dipakai sejak 2 bulan lalu" supaya digest mingguan/bulanan ikut muncul.
  const [sy, sm] = addMonths(monthKey(now), -2).split('-').map(Number);
  const user = await User.create({
    email,
    name,
    password: await bcrypt.hash(password, 10),
    createdAt: fromLocal(sy, sm, 1, 8, 0),
  });
  await seedDefaultCategories(user._id);

  const txs = buildTransactions(now, mulberry32(20261007)).map((t) => ({ ...t, userId: user._id }));
  await Transaction.insertMany(txs);
  return { user, transactions: txs.length, today: dayKey(now) };
}

module.exports = { seedDemo, DEMO };
