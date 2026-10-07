const Transaction = require('../models/Transaction');
const MonthlyAnalysis = require('../models/Analysis');
const { listCategories } = require('./categoryService');
const analysis = require('../utils/analysis');
const { monthRange, addMonths, weekWindow, monthKey, dayKey } = require('../utils/time');

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

/** Analisis satu bulan kalender (YYYY-MM), dibandingkan dengan bulan sebelumnya. */
async function getMonthlyAnalysis(userId, month, { persist = false, categories } = {}) {
  const cats = categories || (await listCategories(userId));
  const { start, end } = monthRange(month);
  const prevMonth = addMonths(month, -1);
  const historyStart = monthRange(addMonths(month, -6)).start;

  const [txs, past] = await Promise.all([fetchTxs(userId, start, end), fetchTxs(userId, historyStart, start)]);

  const prevRange = monthRange(prevMonth);
  const prevTxs = past.filter((t) => t.date >= prevRange.start && t.date < prevRange.end);

  // Total belanja per bulan sebelumnya (untuk deteksi "bulan paling boros").
  const index = analysis.indexCategories(cats);
  const byMonth = new Map();
  for (const t of past) {
    if (analysis.classify(t, index) !== 'spending') continue;
    const k = monthKey(t.date);
    byMonth.set(k, (byMonth.get(k) || 0) + t.amount);
  }
  const history = [...byMonth.entries()].map(([m, spending]) => ({ month: m, spending }));

  const result = analysis.buildMonthlyAnalysis({ month, txs, prevTxs, history, categories: cats });

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
