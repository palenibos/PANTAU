const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    password: { type: String, required: true, select: false }, // hash bcrypt
    name: { type: String, required: true, trim: true, maxlength: 60 },
    preferences: {
      currency: { type: String, enum: ['IDR'], default: 'IDR' },
      monthlyBudget: { type: Number, default: 5_000_000, min: 0 },
      notificationEnabled: { type: Boolean, default: true },
      weeklyDigest: { type: Boolean, default: true },
      darkMode: { type: Boolean, default: false },
    },
    // Penanda digest terakhir yang sudah diproses, supaya tidak dihitung ulang tiap request.
    lastDigest: {
      weekly: { type: String, default: null }, // YYYY-MM-DD (hari Minggu)
      monthly: { type: String, default: null }, // YYYY-MM
    },
    // Refresh token (hash) per perangkat. Dibuang saat logout / rotasi.
    sessions: { type: [sessionSchema], select: false, default: [] },
  },
  { timestamps: true },
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    email: this.email,
    name: this.name,
    createdAt: this.createdAt,
    preferences: this.preferences,
  };
};

module.exports = mongoose.model('User', userSchema);
