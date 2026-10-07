const mongoose = require('mongoose');

// Snapshot analisis bulanan (collection: monthly_analysis).
const analysisSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true }, // YYYY-MM
    totalIncome: { type: Number, default: 0 },
    totalExpense: { type: Number, default: 0 }, // belanja, tidak termasuk tabungan
    totalSaved: { type: Number, default: 0 }, // transaksi di kategori tabungan
    netSaving: { type: Number, default: 0 }, // income - belanja
    saveRate: { type: Number, default: 0 }, // persen
    categoryBreakdown: [
      {
        _id: false,
        category: String,
        emoji: String,
        amount: Number,
        percentage: Number,
      },
    ],
    topSpenders: [{ _id: false, category: String, emoji: String, amount: Number }],
    recommendations: [String],
    healthScore: { type: Number, min: 0, max: 100, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

analysisSchema.index({ userId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('MonthlyAnalysis', analysisSchema, 'monthly_analysis');
