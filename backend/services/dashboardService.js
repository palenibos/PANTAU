const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const cache = require('./cache');
const env = require('../config/env');
const { listCategories } = require('./categoryService');
const { getWeeklyAnalysis } = require('./analysisService');
const { indexCategories, classify, summarize, budgetStatus, tierFor, FALLBACK_EMOJI } = require('../utils/analysis');
const { monthKey, monthRange, monthLabel, daysLeftInMonth, DAY_MS, dayKey } = require('../utils/time');
const { round1 } = require('../utils/money');

const toDto = (tx, byName) => {
  const c = byName.get(String(tx.category).toLowerCase());
  return {
    _id: tx._id,
    type: tx.type,
    category: c ? c.name : tx.category,
    emoji: c ? c.emoji : FALLBACK_EMOJI,
    amount: tx.amount,
    notes: tx.notes || '',
    date: tx.date,
    createdAt: tx.createdAt,
  };
};

/** Saldo sepanjang waktu: aset = pemasukan - belanja; tabungan dipisah dari "dompet". */
async function allTimeTotals(userId, index) {
  const rows = await Transaction.aggregate([
    { $match: { userId } },
    { $group: { _id: { type: '$type', category: '$category' }, total: { $sum: '$amount' } } },
  ]);
  let income = 0;
  let spending = 0;
  let saving = 0;
  for (const r of rows) {
    const kind = classify({ type: r._id.type, category: r._id.category }, index);
    if (kind === 'income') income += r.total;
    else if (kind === 'saving') saving += r.total;
    else spending += r.total;
  }
  return { income, spending, saving };
}

/** Kategori pengeluaran yang paling sering dipakai 30 hari terakhir (untuk tombol quick-add). */
async function quickCategories(userId, categories, now) {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const rows = await Transaction.aggregate([
    { $match: { userId, type: 'expense', date: { $gte: since } } },
    { $group: { _id: '$category', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 6 },
  ]);
  const expense = categories.filter((c) => c.type !== 'income');
  const byName = new Map(expense.map((c) => [c.name, c]));
  const picked = rows.map((r) => byName.get(r._id)).filter(Boolean);
  for (const c of expense) {
    if (picked.length >= 6) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked.map((c) => ({ name: c.name, emoji: c.emoji }));
}

async function buildDashboard(user, now) {
  const userId = user._id;
  const categories = await listCategories(userId);
  const index = indexCategories(categories);
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const month = monthKey(now);
  const { start, end } = monthRange(month);

  const [totals, monthTxs, recent, quick, weekly] = await Promise.all([
    allTimeTotals(userId, index),
    Transaction.find({ userId, date: { $gte: start, $lt: end } }).select('type category amount date').lean(),
    Transaction.find({ userId }).sort({ date: -1, _id: -1 }).limit(5).lean(),
    quickCategories(userId, categories, now),
    getWeeklyAnalysis(userId, dayKey(now), categories),
  ]);

  const cur = summarize(monthTxs, index);
  const spendByCat = new Map(cur.categories.map((c) => [c.category, c.amount]));
  const budgets = budgetStatus(categories, spendByCat);
  const budgetFor = new Map(budgets.map((b) => [b.category, b]));

  const topCategories = cur.categories.slice(0, 5).map((c) => {
    const b = budgetFor.get(c.category);
    return {
      category: c.category,
      emoji: c.emoji,
      amount: c.amount,
      percentage: round1((c.amount / cur.spending) * 100),
      budgetLimit: b ? b.limit : 0,
      budgetPercent: b ? b.percent : null,
      tier: b ? b.tier : 0,
    };
  });

  const monthlyBudget = user.preferences.monthlyBudget;
  const walletBalance = totals.income - totals.spending - totals.saving;

  return {
    month,
    monthLabel: monthLabel(month),
    daysLeft: daysLeftInMonth(now),
    currentBalance: totals.income - totals.spending, // total aset (dompet + tabungan)
    walletBalance,
    totalSavings: totals.saving,
    income: cur.income,
    expense: cur.spending,
    saved: cur.saving,
    netSaving: cur.netSaving,
    saveRate: cur.saveRate,
    monthlyBudget: monthlyBudget > 0
      ? {
          limit: monthlyBudget,
          spent: cur.spending,
          percent: round1((cur.spending / monthlyBudget) * 100),
          tier: tierFor((cur.spending / monthlyBudget) * 100),
        }
      : null,
    topCategories,
    budgetAlerts: budgets.filter((b) => b.tier >= 1),
    recentTransactions: recent.map((t) => toDto(t, byName)),
    quickCategories: quick,
    weekly: {
      totalSpending: weekly.totalSpending,
      previousSpending: weekly.previousSpending,
      changePct: weekly.changePct,
      recommendation: weekly.recommendation,
      dailyTotals: weekly.dailyTotals,
    },
  };
}

/** Data dashboard (di-cache 5 menit per user per bulan) + info notifikasi yang selalu segar. */
async function getDashboard(user, now = new Date()) {
  const key = `${user._id}:dashboard:${monthKey(now)}`;
  const data = await cache.remember(key, env.dashboardCacheMs, () => buildDashboard(user, now));

  const [unread, latest] = await Promise.all([
    Notification.countDocuments({ userId: user._id, read: false }),
    Notification.findOne({ userId: user._id, kind: 'budget', read: false }).sort({ createdAt: -1 }).lean(),
  ]);

  return {
    ...data,
    unreadNotifications: unread,
    latestAlert: latest
      ? { id: latest._id, tier: latest.tier, title: latest.title, message: latest.message, emoji: latest.emoji, createdAt: latest.createdAt }
      : null,
  };
}

module.exports = { getDashboard, toDto };
