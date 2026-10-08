// Entry point Vercel (serverless): semua /api/* diarahkan ke sini lewat vercel.json.
// Koneksi MongoDB dibuat sekali per instance lalu dipakai ulang antar request.
const { connectDB } = require('../backend/config/db');
const models = require('../backend/models');
const app = require('../backend/app');

let ready = null;
function init() {
  if (!ready) {
    ready = connectDB()
      .then(() => Promise.all(models.map((m) => m.init())))
      .catch((err) => {
        ready = null; // coba lagi di request berikutnya
        throw err;
      });
  }
  return ready;
}

module.exports = async (req, res) => {
  try {
    await init();
  } catch (err) {
    console.error('[db]', err.message);
    return res.status(503).json({ success: false, message: 'Server belum bisa konek ke database. Coba lagi sebentar ya 🙏', code: 'DB_UNAVAILABLE' });
  }
  return app(req, res);
};
