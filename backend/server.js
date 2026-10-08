const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');
const app = require('./app');

const models = [
  require('./models/User'),
  require('./models/Transaction'),
  require('./models/Category'),
  require('./models/Analysis'),
  require('./models/Notification'),
];

async function start() {
  try {
    await connectDB();
    // Pastikan index (termasuk unique) sudah ada sebelum menerima request pertama.
    await Promise.all(models.map((m) => m.init()));
  } catch (err) {
    console.error('\n❌ Gagal konek ke MongoDB:', err.message);
    console.error('   Cek MONGODB_URI di backend/.env (lihat .env.example), atau jalankan `npm run demo` untuk mode demo.\n');
    process.exit(1);
  }

  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`✅ PANTAU jalan di http://localhost:${env.port}  (${env.nodeEnv}, db: ${env.dbName})`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} diterima, mematikan server...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

if (require.main === module) start();

module.exports = { start };
