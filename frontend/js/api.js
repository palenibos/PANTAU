// Klien API: header Authorization, auto-refresh token (single-flight), timeout, pesan error ramah.
import { API_BASE } from './config.js';

const KEY = 'pantau.auth';
let memory = null; // cadangan bila localStorage diblokir (mode privat, dll.)

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || memory;
  } catch {
    return memory;
  }
}
let auth = load();

function save(next) {
  auth = next;
  memory = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch { /* abaikan */ }
}

export const session = {
  get user() { return auth && auth.user; },
  get token() { return auth && auth.token; },
  isLoggedIn: () => Boolean(auth && auth.token && auth.refreshToken),
  set: (data) => save({ token: data.token, refreshToken: data.refreshToken, user: data.user }),
  setUser: (user) => auth && save({ ...auth, user }),
  clear: () => save(null),
};

export class ApiError extends Error {
  constructor(message, status, code, errors) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

// Timeout 45 dtk: server free tier yang baru bangun dari tidur bisa butuh 30+ dtk untuk request pertama.
async function send(path, { method = 'GET', body, token, timeout = 45000, raw = false } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new ApiError(
      err.name === 'AbortError' ? 'Koneksi lagi lambat nih. Coba lagi ya 🐢' : 'Nggak bisa konek ke server. Cek internet kamu ya 📡',
      0,
      'NETWORK',
    );
  } finally {
    clearTimeout(timer);
  }

  if (raw && res.ok) return res;
  let data = null;
  try {
    data = await res.json();
  } catch { /* respons non-JSON */ }

  if (!res.ok || (data && data.success === false)) {
    throw new ApiError((data && data.message) || 'Ada yang salah. Coba lagi ya 🙏', res.status, data && data.code, data && data.errors);
  }
  return data;
}

let refreshing = null;
async function refreshTokens() {
  if (!auth || !auth.refreshToken) throw new ApiError('Sesi habis', 401, 'NO_SESSION');
  if (!refreshing) {
    refreshing = send('/api/auth/refresh', { method: 'POST', body: { refreshToken: auth.refreshToken } })
      .then((d) => session.set(d))
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

function logoutEvent() {
  session.clear();
  window.dispatchEvent(new CustomEvent('pantau:logout'));
}

async function request(path, opts = {}) {
  try {
    return await send(path, { ...opts, token: session.token });
  } catch (err) {
    const retryable = err.status === 401 && ['TOKEN_EXPIRED', 'INVALID_TOKEN'].includes(err.code) && auth && auth.refreshToken;
    if (!retryable) {
      if (err.status === 401 && !path.startsWith('/api/auth/')) logoutEvent();
      throw err;
    }
    try {
      await refreshTokens();
    } catch (refreshErr) {
      if (refreshErr.status === 401) logoutEvent();
      throw refreshErr;
    }
    return send(path, { ...opts, token: session.token });
  }
}

const qs = (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== '' && v != null && sp.set(k, v));
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export const api = {
  get: (path, params) => request(path + qs(params)),
  post: (path, body) => request(path, { method: 'POST', body: body ?? {} }),
  put: (path, body) => request(path, { method: 'PUT', body: body ?? {} }),
  del: (path, body) => request(path, { method: 'DELETE', body }),

  // auth (publik, tanpa auto-refresh)
  async login(email, password) {
    const d = await send('/api/auth/login', { method: 'POST', body: { email, password } });
    session.set(d);
    return d;
  },
  async register(name, email, password) {
    const d = await send('/api/auth/register', { method: 'POST', body: { name, email, password } });
    session.set(d);
    return d;
  },
  async logout() {
    const rt = auth && auth.refreshToken;
    session.clear();
    if (rt) { try { await send('/api/auth/logout', { method: 'POST', body: { refreshToken: rt }, timeout: 5000 }); } catch { /* sudah keluar di sisi klien */ } }
  },

  /** Unduh file (ekspor) lewat fetch ber-token lalu simpan sebagai blob. */
  async download(path, filename) {
    const res = await request(path, { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};
