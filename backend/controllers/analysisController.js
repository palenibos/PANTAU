const { getMonthlyAnalysis, getWeeklyAnalysis } = require('../services/analysisService');
const { getDashboard } = require('../services/dashboardService');
const { ensureDigests } = require('../services/digests');
const { monthKey, dayKey } = require('../utils/time');

async function dashboard(req, res) {
  // Digest yang jatuh tempo dibuat dulu supaya badge notifikasi langsung akurat.
  await ensureDigests(req.user);
  res.json({ success: true, data: await getDashboard(req.user) });
}

async function monthly(req, res) {
  const { month } = req.valid.params;
  // Bulan yang sudah lewat disimpan sebagai snapshot di collection monthly_analysis.
  const persist = month < monthKey(new Date());
  res.json({ success: true, data: await getMonthlyAnalysis(req.user._id, month, { persist }) });
}

async function weekly(req, res) {
  const end = req.valid.query.end || dayKey(new Date());
  res.json({ success: true, data: await getWeeklyAnalysis(req.user._id, end) });
}

module.exports = { dashboard, monthly, weekly };
