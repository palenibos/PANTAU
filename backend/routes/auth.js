const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const { schemas } = require('../utils/validation');
const ctrl = require('../controllers/authController');

// Batasi tebak-tebakan password: 30 percobaan / 15 menit per IP (dimatikan saat test).
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { success: false, message: 'Kebanyakan percobaan. Coba lagi 15 menit lagi ya 🙏', code: 'RATE_LIMITED' },
});

router.post('/register', limiter, validate(schemas.register), ctrl.register);
router.post('/login', limiter, validate(schemas.login), ctrl.login);
router.post('/refresh', limiter, validate(schemas.refresh), ctrl.refresh);
router.post('/logout', validate(schemas.logout), ctrl.logout);
router.get('/me', auth, ctrl.me);

module.exports = router;
