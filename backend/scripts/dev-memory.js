// Mode demo tanpa Atlas/MongoDB: nyalakan MongoDB sementara (in-memory), isi data demo,
// lalu jalankan server. Data hilang saat dimatikan.   npm run demo
//
// Butuh devDependency `mongodb-memory-server` (download binary mongod otomatis saat pertama kali).
// Kalau sudah punya mongod sendiri: MONGOMS_SYSTEM_BINARY=/path/ke/mongod npm run demo
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  console.log('⏳ Menyiapkan MongoDB sementara (pertama kali bisa agak lama karena download)...');
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const { connectDB } = require('../config/db');
  const { seedDemo, DEMO } = require('./seedDemo');
  await connectDB();
  const { transactions } = await seedDemo();
  console.log(`🌱 Data demo: ${transactions} transaksi → login ${DEMO.email} / ${DEMO.password}`);

  await require('../server').start();

  const stop = async () => {
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((err) => {
  console.error('❌ Gagal menjalankan mode demo:', err.message);
  process.exit(1);
});
