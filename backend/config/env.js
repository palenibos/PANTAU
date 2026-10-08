require('dotenv').config({ quiet: true });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

const env = {
  nodeEnv,
  isProd,
  isTest,
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  dbName: process.env.DB_NAME || 'pantau_db',
  jwtSecret: process.env.JWT_SECRET || (isProd ? null : 'pantau-dev-secret-jangan-dipakai-di-production'),
  accessTokenTtl: process.env.JWT_EXPIRES_IN || '15m',
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS) || 30,
  // Kosong = izinkan semua origin (aman karena auth pakai header Bearer, bukan cookie).
  corsOrigins: (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // WIB = UTC+7. Dipakai untuk batas hari/bulan/minggu. Indonesia tidak pakai DST.
  tzOffsetMinutes: Number(process.env.APP_TZ_OFFSET_MINUTES ?? 420),
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : isProd ? 1 : 0,
  dashboardCacheMs: 5 * 60 * 1000,
  // Tombol "Coba akun demo" di layar login. Default: nyala di development, MATI di production
  // (akun demo hanya ada kalau database di-seed). Paksa dengan DEMO_ENABLED=true/false.
  demoEnabled: process.env.DEMO_ENABLED ? process.env.DEMO_ENABLED === 'true' : !isProd,
};

if (!env.jwtSecret) {
  throw new Error('JWT_SECRET wajib diisi saat NODE_ENV=production (lihat backend/.env.example).');
}

if (!process.env.JWT_SECRET && !isTest) {
  console.warn('⚠️  JWT_SECRET belum diisi — memakai secret bawaan khusus development. Jangan deploy begini!');
}

module.exports = env;
