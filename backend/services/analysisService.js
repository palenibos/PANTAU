const Transaction = require('../models/Transaction');
const MonthlyAnalysis = require('../models/Analysis');
const { listCategories } = require('./categoryService');
const analysis = require('../utils/analysis');
const { monthRange, addMonths, weekWindow, monthKey, dayKey, parts, daysInMonth, MONTHS_ID } = require('../utils/time');

const PROJECTION = 'type category amount date';

const fetchTxs = (userId, start, end) =>
  Transaction.find({ userId, date: { $gte: start, $lt: end } })
    .select(PROJECTION)
    .lean();

/** Analisis 7 hari yang berakhir di hari `endKey` (default: hari ini). */
async function getWeeklyAnalysis(userId, endKey = dayKey(new Date()), categories) {
  const cats = categories || (await listCategories(userId));
  const w = weekWindow(endKey);
  const [txs, prevTxs] = await Promise.all([fetchTxs(userId, w.start, w.end), fetchTxs(userId, w.prevStart, w.prevEnd)]);
  return analysis.buildWeeklyAnalysis({ txs, prevTxs, categories: cats, window: w });
}

/**
 * Analisis satu bulan kalender (YYYY-MM), dibandingkan dengan bulan sebelumnya.
 * Untuk bulan yang masih berjalan, pembandingnya hanya periode yang sama di bulan lalu
 * (mis. 1-8 Okt vs 1-8 Sep) — membandingkan 8 hari dengan sebulan penuh akan menyesatkan.
 */
async function getMonthlyAnalysis(userId, month, { persist = false, categories, now = new Date() } = {}) {
  const cats = categories || (await listCategories(userId));
  const { start, end } = monthRange(month);
  const prevMonth = addMonths(month, -1);
  const historyStart = monthRange(addMonths(month, -6)).start;

  const [txs, past] = await Promise.all([fetchTxs(userId, start, end), fetchTxs(userId, historyStart, start)]);

  const prevRange = monthRange(prevMonth);
  const isCurrent = month === monthKey(now);
  // Bulan berjalan: potong bulan lalu di titik waktu yang sama (dibatasi panjang bulan lalu).
  const cutoff = isCurrent ? Math.min(prevRange.start.getTime() + (now.getTime() - start.getTime()), prevRange.end.getTime()) : prevRange.end.getTime();
  const prevTxs = past.filter((t) => t.date >= prevRange.start && t.date.getTime() < cutoff);

  // Total belanja per bulan sebelumnya (untuk deteksi "bulan paling boros").
  const index = analysis.indexCategories(cats);
  const byMonth = new Map();
  for (const t of past) {
    if (analysis.classify(t, index) !== 'spending') continue;
    const k = monthKey(t.date);
    byMonth.set(k, (byMonth.get(k) || 0) + t.amount);
  }
  const history = [...byMonth.entries()].map(([m, spending]) => ({ month: m, spending }));

  const comparison = isCurrent ? 'month-to-date' : 'full-month';
  const result = analysis.buildMonthlyAnalysis({ month, txs, prevTxs, history, categories: cats, comparison });

  // Label pembanding untuk UI: "1–8 Sep" vs "1–8 Okt" (month-to-date) atau "September" vs "Oktober".
  const monthName = (key) => MONTHS_ID[Number(key.split('-')[1]) - 1];
  if (isCurrent) {
    const day = Math.min(parts(now).d, daysInMonth(prevMonth));
    const short = (key) => monthName(key).slice(0, 3);
    result.compare = { mode: comparison, prevLabel: `1–${day} ${short(prevMonth)}`, curLabel: `1–${parts(now).d} ${short(month)}` };
  } else {
    result.compare = { mode: comparison, prevLabel: monthName(prevMonth), curLabel: monthName(month) };
  }
  result.isCurrent = isCurrent;

  if (persist && result.txCount > 0) {
    await MonthlyAnalysis.updateOne(
      { userId, month },
      {
        $set: {
          totalIncome: result.totalIncome,
          totalExpense: result.totalExpense,
          totalSaved: result.totalSaved,
          netSaving: result.netSaving,
          saveRate: result.saveRate,
          categoryBreakdown: result.categoryBreakdown.map(({ category, emoji, amount, percentage }) => ({
            category,
            emoji,
            amount,
            percentage,
          })),
          topSpenders: result.topSpenders,
          recommendations: result.recommendations,
          healthScore: result.healthScore,
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
  }
  return result;
}

module.exports = { getWeeklyAnalysis, getMonthlyAnalysis };
