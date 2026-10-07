// Helper test API: Mongo in-memory + akun uji.
// Di mesin biasa mongodb-memory-server mengunduh mongod otomatis. Kalau jaringan memblokir
// download, arahkan ke binary lokal: MONGOMS_SYSTEM_BINARY=/path/ke/mongod npm test
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const { connectDB, disconnectDB } = require('../config/db');

let mongod;

async function startDb() {
  mongod = await MongoMemoryServer.create();
  await connectDB(mongod.getUri());
  const models = ['User', 'Transaction', 'Category', 'Analysis', 'Notification'].map((m) => require(`../models/${m}`));
  await Promise.all(models.map((m) => m.init()));
  return require('../app');
}

async function stopDb() {
  await disconnectDB();
  if (mongod) await mongod.stop();
}

let counter = 0;

/** Daftar user baru dan kembalikan helper request ber-token. */
async function newUser(app, overrides = {}) {
  counter += 1;
  const creds = { email: `user${counter}-${Date.now()}@test.com`, password: 'password123', name: 'Tester', ...overrides };
  const res = await request(app).post('/api/auth/register').send(creds);
  if (res.status !== 201) throw new Error(`register gagal: ${res.status} ${JSON.stringify(res.body)}`);
  const auth = (r) => r.set('Authorization', `Bearer ${res.body.token}`);
  return {
    creds,
    token: res.body.token,
    refreshToken: res.body.refreshToken,
    user: res.body.user,
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
    put: (url, body) => auth(request(app).put(url)).send(body),
    del: (url, body) => auth(request(app).delete(url)).send(body),
  };
}

module.exports = { startDb, stopDb, newUser, request };
