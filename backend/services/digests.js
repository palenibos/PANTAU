// Ringkasan mingguan (Minggu 19:00) dan laporan bulanan (akhir bulan 20:00).
//
// Dibuat "malas" (lazy) saat user membuka app, bukan lewat cron: hosting free tier
// sering tidur, dan cron di proses yang tidur tidak akan jalan. Hasilnya sama —
// begitu waktunya lewat, digest muncul di inbox begitu user membuka app — dan
// idempoten (kunci unik per periode) sehingga aman dipanggil berkali-kali.
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getWeeklyAnalysis, getMonthlyAnalysis } = require('./analysisService');
const { weeklyNotification, monthlyNotification } = require('../utils/analysis');
const { lastWeeklyDigest, lastMonthlyDigest } = require('../utils/time');

async function createOnce(doc) {
  try {
    await Notification.create(doc);
    return true;
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

/** @returns {Promise<boolean>} true bila ada notifikasi baru yang dibuat */
async function ensureDigests(user, now = new Date()) {
  const prefs = user.preferences || {};
  if (prefs.notificationEnabled === false) return false;

  const set = {};
  let created = false;

  if (prefs.weeklyDigest !== false) {
    const w = lastWeeklyDigest(now);
    if (user.lastDigest?.weekly !== w.key && w.at >= user.createdAt) {
      const weekly = await getWeeklyAnalysis(user._id, w.key);
      if (weekly.txCount > 0) {
        const { title, message } = weeklyNotification(weekly);
        created =
          (await createOnce({
            userId: user._id,
            kind: 'weekly',
            title,
            message,
            emoji: '📅',
            data: { end: w.key, totalSpending: weekly.totalSpending, changePct: weekly.changePct },
            periodKey: `weekly:${w.key}`,
          })) || created;
      }
      set['lastDigest.weekly'] = w.key;
    }
  }

  const m = lastMonthlyDigest(now);
  if (user.lastDigest?.monthly !== m.key && m.at >= user.createdAt) {
    const monthly = await getMonthlyAnalysis(user._id, m.key, { persist: true });
    if (monthly.txCount > 0) {
      const { title, message } = monthlyNotification(monthly);
      created =
        (await createOnce({
          userId: user._id,
          kind: 'monthly',
          title,
          message,
          emoji: '📊',
          data: { month: m.key, healthScore: monthly.healthScore, saveRate: monthly.saveRate },
          periodKey: `monthly:${m.key}`,
        })) || created;
    }
    set['lastDigest.monthly'] = m.key;
  }

  if (Object.keys(set).length) await User.updateOne({ _id: user._id }, { $set: set });
  return created;
}

module.exports = { ensureDigests };
