const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const { evaluateBudget } = require('../utils/analysis');
const { budgetMessage } = require('../utils/messages');
const { monthKey, monthRange, dayKey, dayRange, daysLeftInMonth } = require('../utils/time');
const { round1 } = require('../utils/money');

/** Total pengeluaran kategori pada satu bulan kalender, opsional tanpa satu transaksi tertentu. */
async function categoryMonthSpend(userId, categoryName, month, excludeId) {
  const { start, end } = monthRange(month);
  const match = { userId, type: 'expense', category: categoryName, date: { $gte: start, $lt: end } };
  if (excludeId) match._id = { $ne: excludeId };
  const [row] = await Transaction.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
  return row ? row.total : 0;
}

/**
 * Cek apakah perubahan pengeluaran kategori melewati ambang 60/80/100% budget.
 * Hanya untuk transaksi di bulan berjalan (input mundur/maju tidak memicu alert "real-time").
 * Mengembalikan alert yang siap ditampilkan (dan menyimpannya ke inbox) atau null.
 */
async function checkBudgetAlert({ user, category, txDate, before, after, now = new Date() }) {
  if (!user.preferences.notificationEnabled) return null;
  if (category.type === 'income' || category.isSaving || !(category.budgetLimit > 0)) return null;
  if (monthKey(txDate) !== monthKey(now)) return null;

  const ev = evaluateBudget({ limit: category.budgetLimit, before, after });
  if (!ev) return null;

  let todayCount = 0;
  if (ev.tier === 2) {
    const today = dayRange(dayKey(now));
    todayCount = await Transaction.countDocuments({
      userId: user._id,
      type: 'expense',
      category: category.name,
      date: { $gte: today.start, $lt: today.end },
    });
  }

  const { title, message, level } = budgetMessage({
    tier: ev.tier,
    category: category.name,
    emoji: category.emoji,
    userName: user.name,
    percent: ev.percent,
    spent: after,
    limit: category.budgetLimit,
    daysLeft: daysLeftInMonth(now),
    todayCount,
  });

  const month = monthKey(now);
  const data = {
    category: category.name,
    emoji: category.emoji,
    percent: round1(ev.percent),
    spent: after,
    limit: category.budgetLimit,
    month,
  };

  // Tier 1 & 2: sekali per kategori per bulan. Tier 3: tiap kali nambah saat sudah jebol.
  const periodKey = ev.tier < 3 ? `${month}:${category.nameKey}:${ev.tier}` : undefined;
  let doc;
  try {
    doc = await Notification.create({
      userId: user._id,
      kind: 'budget',
      tier: ev.tier,
      title,
      message,
      emoji: category.emoji,
      data,
      periodKey,
    });
  } catch (err) {
    if (err.code === 11000) return null; // tier ini sudah pernah dikirim bulan ini
    throw err;
  }

  return { id: doc._id, tier: ev.tier, level, title, message, ...data };
}

module.exports = { categoryMonthSpend, checkBudgetAlert };
