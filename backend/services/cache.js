// Cache in-memory sederhana (satu proses). Dipakai untuk dashboard (TTL 5 menit).
// Setiap perubahan data user (transaksi/kategori/pengaturan) memanggil invalidateUser(),
// jadi cache tidak pernah menampilkan data basi setelah user mengubah sesuatu.
const store = new Map();

function get(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

function set(key, value, ttlMs) {
  store.set(key, { value, expires: Date.now() + ttlMs });
  // Jaga ukuran tetap kecil: buang entri kedaluwarsa kalau sudah banyak.
  if (store.size > 2000) {
    const now = Date.now();
    for (const [k, v] of store) if (v.expires < now) store.delete(k);
  }
}

async function remember(key, ttlMs, producer) {
  const hit = get(key);
  if (hit !== undefined) return hit;
  const value = await producer();
  set(key, value, ttlMs);
  return value;
}

function invalidateUser(userId) {
  const prefix = `${userId}:`;
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}

function clear() {
  store.clear();
}

module.exports = { get, set, remember, invalidateUser, clear };
