// Isi database dengan akun demo: node scripts/seed.js   (atau: npm run seed)
const { connectDB, disconnectDB } = require('../config/db');
const { seedDemo, DEMO } = require('./seedDemo');

(async () => {
  try {
    await connectDB();
    const { transactions } = await seedDemo();
    console.log(`✅ Data demo siap: ${transactions} transaksi.`);
    console.log(`   Login: ${DEMO.email} / ${DEMO.password}`);
  } catch (err) {
    console.error('❌ Seed gagal:', err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
})();
