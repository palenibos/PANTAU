const User = require('../models/User');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const MonthlyAnalysis = require('../models/Analysis');
const ApiError = require('../utils/ApiError');
const cache = require('../services/cache');
const { listCategories, seedDefaultCategories } = require('../services/categoryService');
const { dayKey, parts } = require('../utils/time');

const SORT_BY = { date: -1, _id: -1 };

// Sumber kebenaran budget per kategori = Category.budgetLimit. Peta { nama: limit } di bawah
// hanyalah tampilan turunan supaya kontrak API (preferences.budgetPerCategory) tetap terpenuhi.
async function settingsPayload(user) {
  const categories = await listCategories(user._id);
  const budgetPerCategory = {};
  for (const c of categories) if (c.type !== 'income' && !c.isSaving && c.budgetLimit > 0) budgetPerCategory[c.name] = c.budgetLimit;
  return { name: user.name, email: user.email, ...user.preferences, budgetPerCategory };
}

async function get(req, res) {
  res.json({ success: true, data: await settingsPayload(req.user) });
}

async function update(req, res) {
  const body = req.valid.body;
  const $set = {};
  if (body.name != null) $set.name = body.name;
  for (const k of ['currency', 'monthlyBudget', 'notificationEnabled', 'weeklyDigest', 'darkMode']) {
    if (body[k] != null) $set[`preferences.${k}`] = body[k];
  }
  const user = await User.findByIdAndUpdate(req.user._id, { $set }, { returnDocument: 'after', runValidators: true }).lean();
  cache.invalidateUser(req.user._id);
  res.json({ success: true, message: 'Pengaturan disimpan ✅', data: await settingsPayload(user) });
}

async function updateBudget(req, res) {
  const cat = await Category.findOne({ _id: req.valid.params.categoryId, userId: req.user._id });
  if (!cat) throw new ApiError(404, 'Kategori nggak ditemukan', 'NOT_FOUND');
  if (cat.type === 'income' || cat.isSaving) {
    throw new ApiError(400, 'Kategori ini nggak bisa dikasih budget', 'BAD_REQUEST');
  }
  cat.budgetLimit = req.valid.body.budgetLimit;
  await cat.save();
  cache.invalidateUser(req.user._id);
  res.json({ success: true, message: `Budget ${cat.name} disimpan ✅`, data: cat });
}

async function resetData(req, res) {
  const userId = req.user._id;
  await Promise.all([
    Transaction.deleteMany({ userId }),
    Notification.deleteMany({ userId }),
    MonthlyAnalysis.deleteMany({ userId }),
    Category.deleteMany({ userId }),
  ]);
  await seedDefaultCategories(userId);
  await User.updateOne({ _id: userId }, { $set: { 'lastDigest.weekly': null, 'lastDigest.monthly': null } });
  cache.invalidateUser(userId);
  res.json({ success: true, message: 'Semua data direset. Mulai lembaran baru! 🌱' });
}

// ---------- ekspor ----------

// Cegah CSV injection: sel yang diawali = + - @ dianggap rumus oleh Excel/Sheets.
function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const localStamp = (date) => {
  const p = parts(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dayKey(date)} ${pad(p.h)}:${pad(p.min)}`;
};

async function exportData(req, res) {
  const { format } = req.valid.query;
  const [txs, categories] = await Promise.all([
    Transaction.find({ userId: req.user._id }).sort(SORT_BY).lean(),
    listCategories(req.user._id),
  ]);
  const stamp = dayKey(new Date());

  res.set('Cache-Control', 'no-store');
  if (format === 'csv') {
    const rows = [['Tanggal (WIB)', 'Tipe', 'Kategori', 'Nominal (Rp)', 'Catatan']];
    for (const t of txs) rows.push([localStamp(t.date), t.type === 'income' ? 'Pemasukan' : 'Pengeluaran', t.category, t.amount, t.notes || '']);
    const csv = `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="pantau-${stamp}.csv"`);
    return res.send(csv);
  }

  res.set('Content-Disposition', `attachment; filename="pantau-${stamp}.json"`);
  return res.json({
    app: 'PANTAU',
    exportedAt: new Date().toISOString(),
    user: { name: req.user.name, email: req.user.email },
    categories: categories.map(({ name, emoji, type, isSaving, budgetLimit }) => ({ name, emoji, type, isSaving, budgetLimit })),
    transactions: txs.map(({ type, category, amount, notes, date }) => ({ type, category, amount, notes: notes || '', date })),
  });
}

module.exports = { get, update, updateBudget, resetData, exportData };
