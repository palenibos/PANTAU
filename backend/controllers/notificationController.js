const Notification = require('../models/Notification');
const { ensureDigests } = require('../services/digests');

async function list(req, res) {
  await ensureDigests(req.user);
  const { limit } = req.valid.query;
  const [data, unread] = await Promise.all([
    Notification.find({ userId: req.user._id }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean(),
    Notification.countDocuments({ userId: req.user._id, read: false }),
  ]);
  res.json({ success: true, data, unread });
}

async function markAllRead(req, res) {
  await Notification.updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
  res.json({ success: true, message: 'Semua notifikasi ditandai sudah dibaca' });
}

module.exports = { list, markAllRead };
