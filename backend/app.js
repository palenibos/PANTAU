const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const env = require('./config/env');
const auth = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const analysisCtrl = require('./controllers/analysisController');

const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');

function createApp() {
  const app = express();
  app.set('trust proxy', env.trustProxy);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // style inline dipakai untuk lebar progress bar & warna kategori (bukan input user).
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          // Biar bisa dites dari HP lewat http://IP-LAN:3000 saat development.
          upgradeInsecureRequests: env.isProd ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors({ origin: env.corsOrigins.includes('*') ? '*' : env.corsOrigins, maxAge: 86400 }));
  app.use(compression());
  app.use(express.json({ limit: '50kb' }));

  // ---------- API ----------
  const api = express.Router();
  api.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 1000,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: () => env.isTest,
      message: { success: false, message: 'Terlalu banyak request. Pelan-pelan ya 🙏', code: 'RATE_LIMITED' },
    }),
  );
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  api.get('/health', (req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ success: up, status: up ? 'ok' : 'db-disconnected' });
  });

  // Konfigurasi publik untuk frontend (belum login).
  api.get('/config', (req, res) => res.json({ success: true, demo: env.demoEnabled }));

  api.use('/auth', require('./routes/auth'));

  // Semua di bawah ini butuh login.
  api.use('/transactions', auth, require('./routes/transactions'));
  api.use('/categories', auth, require('./routes/categories'));
  api.use('/settings', auth, require('./routes/settings'));
  api.use('/analysis', auth, require('./routes/analysis'));
  api.use('/notifications', auth, require('./routes/notifications'));
  api.get('/dashboard', auth, analysisCtrl.dashboard);

  api.use(notFound);
  app.use('/api', api);

  // ---------- Frontend statis (opsional: bisa juga di-deploy terpisah) ----------
  app.use(
    express.static(FRONTEND_DIR, {
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}vendor${path.sep}`)) res.set('Cache-Control', 'public, max-age=604800');
        else res.set('Cache-Control', 'no-cache'); // selalu revalidasi (ETag) agar update langsung terasa
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    return res.sendFile(path.join(FRONTEND_DIR, 'index.html'), (err) => err && next());
  });

  app.use(errorHandler);
  return app;
}

module.exports = createApp();
module.exports.createApp = createApp;
