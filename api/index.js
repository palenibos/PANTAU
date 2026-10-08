// Entry point Vercel (serverless): semua /api/* diarahkan ke sini lewat vercel.json.
// Koneksi MongoDB dibuat sekali per instance lalu dipakai ulang antar request.
const { connectDB, dbState } = require('../backend/config/db');
const models = require('../backend/models');
const app = require('../backend/app');

// Petunjuk singkat penyebab gagal konek. Sengaja tidak menyertakan pesan mentah (bisa memuat host/kredensial).
function diagnose(err) {
  const m = String((err && err.message) || '');
  if (!process.env.MONGODB_URI) return 'ENV: MONGODB_URI tidak terbaca di server. Cek nama variabel (huruf besar semua), lalu Redeploy.';
  if (/bad auth|authentication failed/i.test(m)) return 'AUTH: username atau password database salah (cek Database Access di Atlas, dan password di MONGODB_URI).';
  if (/invalid (scheme|connection string)|querySrv|ENOTFOUND|EBADNAME/i.test(m)) return 'URI: format atau alamat MONGODB_URI salah (harus diawali mongodb+srv:// dan tanpa tanda < >).';
  if (/selection timed out|ReplicaSetNoPrimary|not allowed|ECONNREFUSED|ETIMEDOUT/i.test(m)) return 'NETWORK: Atlas menolak/tidak terjangkau. Izinkan 0.0.0.0/0 di Network Access dan pastikan statusnya Active.';
  return 'LAINNYA: lihat Vercel → Logs, cari baris [db].';
}

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
  // Instance serverless yang sempat "dibekukan" bisa kehilangan koneksi: sambungkan ulang, jangan pakai promise lama.
  const state = dbState();
  if (ready && (state === 0 || state === 3)) ready = null;
  req.pantauEntry = 'api/index.js';
  try {
    await init();
  } catch (err) {
    console.error('[db]', err.message);
    return res.status(503).json({ success: false, message: 'Server belum bisa konek ke database. Coba lagi sebentar ya 🙏', code: 'DB_UNAVAILABLE', hint: diagnose(err) });
  }
  return app(req, res);
};
