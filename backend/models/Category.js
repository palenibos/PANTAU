const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 30 },
    // Huruf kecil, dipakai untuk cek duplikat tanpa peduli kapitalisasi.
    nameKey: { type: String, required: true },
    emoji: { type: String, required: true, maxlength: 24 },
    // "expense" muncul di form pengeluaran, "income" di form pemasukan.
    type: { type: String, enum: ['expense', 'income'], default: 'expense' },
    // Pengeluaran yang sebenarnya menabung (mis. Nabung): tidak dihitung sebagai belanja
    // di save rate & tidak kena notifikasi budget.
    isSaving: { type: Boolean, default: false },
    // Budget per bulan kalender. 0 = tanpa budget.
    budgetLimit: { type: Number, min: 0, default: 0 },
    isDefault: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

categorySchema.index({ userId: 1, nameKey: 1 }, { unique: true });

categorySchema.pre('validate', function setNameKey() {
  if (this.name) this.nameKey = this.name.trim().toLowerCase();
});

module.exports = mongoose.model('Category', categorySchema);

/** Kategori bawaan untuk user baru. budget dalam Rupiah per bulan (0 = tanpa budget). */
module.exports.DEFAULT_CATEGORIES = [
  { name: 'Rokok', emoji: '🚬', budgetLimit: 500_000 },
  { name: 'Kopi', emoji: '☕', budgetLimit: 300_000 },
  { name: 'Nongkrong', emoji: '🎉', budgetLimit: 400_000 },
  { name: 'Transportasi', emoji: '💸', budgetLimit: 500_000 },
  { name: 'Belanja', emoji: '🛍️' },
  { name: 'Nabung', emoji: '💰', isSaving: true },
  { name: 'Sedekah', emoji: '🤲' },
  { name: 'Orang Tua', emoji: '👨‍👩‍👧' },
  { name: 'Membayar Hutang', emoji: '💳' },
  { name: 'Entertainment', emoji: '🎮' },
  { name: 'Makan', emoji: '🍔', budgetLimit: 1_500_000 },
  { name: 'Lainnya', emoji: '📦' },
  // Kategori pemasukan
  { name: 'Gaji', emoji: '💼', type: 'income' },
  { name: 'Uang Saku', emoji: '🪙', type: 'income' },
  { name: 'Freelance', emoji: '💻', type: 'income' },
  { name: 'Bonus', emoji: '🎁', type: 'income' },
  { name: 'Pemasukan Lain', emoji: '💵', type: 'income' },
];
