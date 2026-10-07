const mongoose = require('mongoose');

// Inbox notifikasi in-app: alert budget (real-time), ringkasan mingguan, laporan bulanan.
const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['budget', 'weekly', 'monthly'], required: true },
    tier: { type: Number, min: 0, max: 3, default: 0 }, // 1 info, 2 warning, 3 alert (khusus budget)
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 600 },
    emoji: { type: String, default: '🔔' },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Kunci idempoten: sekali per (user, kind, periodKey). Dipakai agar alert tier 1/2
    // untuk kategori & bulan yang sama, serta digest mingguan/bulanan, tidak dobel.
    periodKey: { type: String },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index(
  { userId: 1, kind: 1, periodKey: 1 },
  { unique: true, partialFilterExpression: { periodKey: { $type: 'string' } } },
);

module.exports = mongoose.model('Notification', notificationSchema);
