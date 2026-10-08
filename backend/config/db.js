const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);

async function connectDB(uri = env.mongoUri) {
  await mongoose.connect(uri, {
    dbName: env.dbName,
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
  });
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
