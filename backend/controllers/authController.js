const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { seedDefaultCategories } = require('../services/categoryService');

const MAX_SESSIONS = 10;
const BCRYPT_ROUNDS = 10;
// Hash palsu supaya waktu respons login tidak membocorkan apakah emailnya terdaftar.
const DUMMY_HASH = bcrypt.hashSync('pantau-dummy-password', BCRYPT_ROUNDS);

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const signAccessToken = (userId) =>
  jwt.sign({ sub: String(userId) }, env.jwtSecret, { algorithm: 'HS256', expiresIn: env.accessTokenTtl });

/** Buat refresh token acak (disimpan sebagai hash di DB, satu per perangkat). */
async function createRefreshToken(userId) {
  const raw = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + env.refreshTokenDays * 24 * 60 * 60 * 1000);
  // $pull dan $push ke field yang sama tidak boleh dalam satu update, jadi dua langkah.
  await User.updateOne({ _id: userId }, { $pull: { sessions: { expiresAt: { $lt: new Date() } } } });
  await User.updateOne(
    { _id: userId },
    { $push: { sessions: { $each: [{ tokenHash: sha256(raw), expiresAt }], $slice: -MAX_SESSIONS } } },
  );
  return `${userId}.${raw}`;
}

async function issueTokens(userId) {
  return { token: signAccessToken(userId), refreshToken: await createRefreshToken(userId) };
}

async function register(req, res) {
  const { email, password, name } = req.valid.body;

  if (await User.exists({ email })) {
    throw new ApiError(409, 'Email ini sudah terdaftar. Coba login aja ya 🙌', 'EMAIL_TAKEN');
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  let user;
  try {
    user = await User.create({ email, password: hash, name });
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'Email ini sudah terdaftar. Coba login aja ya 🙌', 'EMAIL_TAKEN');
    throw err;
  }
  await seedDefaultCategories(user._id);

  const tokens = await issueTokens(user._id);
  res.status(201).json({ success: true, message: `Selamat datang di PANTAU, ${name}! 🎉`, ...tokens, user: user.toPublic() });
}

async function login(req, res) {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select('+password');

  const ok = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !ok) throw new ApiError(401, 'Email atau password salah', 'INVALID_CREDENTIALS');

  const tokens = await issueTokens(user._id);
  res.json({ success: true, message: `Hai lagi, ${user.name}! 👋`, ...tokens, user: user.toPublic() });
}

/** Tukar refresh token dengan access token baru (refresh token ikut dirotasi: sekali pakai). */
async function refresh(req, res) {
  const { refreshToken } = req.valid.body;
  const [userId, raw] = String(refreshToken).split('.');
  const invalid = () => new ApiError(401, 'Sesi kamu habis, login lagi ya', 'INVALID_REFRESH');
  if (!userId || !raw || !/^[a-f0-9]{24}$/.test(userId)) throw invalid();

  const tokenHash = sha256(raw);
  // Atomic: hanya satu request yang bisa "memakai" token ini.
  const user = await User.findOneAndUpdate(
    { _id: userId, sessions: { $elemMatch: { tokenHash, expiresAt: { $gt: new Date() } } } },
    { $pull: { sessions: { tokenHash } } },
  );
  if (!user) throw invalid();

  const tokens = await issueTokens(user._id);
  res.json({ success: true, message: 'Token diperbarui', ...tokens, user: user.toPublic() });
}

async function logout(req, res) {
  const refreshToken = req.valid.body.refreshToken;
  if (refreshToken) {
    const [userId, raw] = refreshToken.split('.');
    if (userId && raw && /^[a-f0-9]{24}$/.test(userId)) {
      await User.updateOne({ _id: userId }, { $pull: { sessions: { tokenHash: sha256(raw) } } });
    }
  }
  res.json({ success: true, message: 'Kamu udah keluar. Sampai ketemu lagi! 👋' });
}

async function me(req, res) {
  res.json({
    success: true,
    data: {
      id: req.user._id,
      email: req.user.email,
      name: req.user.name,
      createdAt: req.user.createdAt,
      preferences: req.user.preferences,
    },
  });
}

module.exports = { register, login, refresh, logout, me };
