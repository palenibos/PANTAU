const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');

/** Verifikasi access token (Bearer) lalu pasang user (lean) di req.user. */
async function auth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'Silakan login dulu ya', 'UNAUTHENTICATED');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Sesi kamu habis, login lagi ya', 'TOKEN_EXPIRED');
    }
    throw new ApiError(401, 'Token nggak valid, coba login lagi', 'INVALID_TOKEN');
  }

  const user = await User.findById(payload.sub).lean();
  if (!user) throw new ApiError(401, 'Akun nggak ditemukan, coba login lagi', 'INVALID_TOKEN');

  req.user = user;
  return next();
}

module.exports = auth;
