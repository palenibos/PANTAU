// Entry point: state global, router hash, shell (bottom nav), tema, penanganan keyboard layar sentuh.
import { api, session } from './api.js';
import { renderAuth } from './auth.js';
import { toast } from './notifications.js';
import { icon, confirmDialog } from './ui.js';
import { html } from './utils.js';
import * as dashboard from './views/dashboard.js';
import * as add from './views/add.js';
import * as historyView from './views/history.js';
import * as report from './views/report.js';
import * as settings from './views/settings.js';
import * as inbox from './views/inbox.js';

const appEl = document.getElementById('app');

const ROUTES = {
  '/': dashboard,
  '/add': add,
  '/history': historyView,
  '/report': report,
  '/settings': settings,
  '/inbox': inbox,
};
const NAV_HIDDEN = new Set(['/add']); // form fokus: tanpa bottom nav

// ---------------------------------------------------------------- tema
const getLocalTheme = () => { try { return localStorage.getItem('pantau.theme'); } catch { return null; } };

function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  try { localStorage.setItem('pantau.theme', mode); } catch { /* abaikan */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#0f172a' : '#06b6d4');
}

// ---------------------------------------------------------------- state
const state = {
  categories: null,
  unread: 0,
  // Diisi view yang punya form kotor (mis. budget di Pengaturan): () => boolean.
  // Dipakai untuk menahan navigasi/penutupan tab agar perubahan tidak hilang diam-diam.
  unsaved: null,
  // Nilai input yang belum disimpan, dipertahankan saat view merender ulang dirinya.
  pendingEdits: null,
  async getCategories(force = false) {
    if (!this.categories || force) this.categories = (await api.get('/api/categories')).data;
    return this.categories;
  },
  invalidateCategories() { this.categories = null; },
  setUnread(n) { this.unread = n; },
  setTheme(mode) { applyTheme(mode); },
  toggleTheme(after) {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    api.put('/api/settings', { darkMode: next === 'dark' }).catch(() => {});
    if (after) after();
  },
  async logout() {
    await api.logout();
    this.categories = null;
    history.replaceState(null, '', '#/'); // tanpa memicu hashchange (hindari render dobel)
    showAuth();
  },
};

// ---------------------------------------------------------------- shell
let screenEl = null;
let navEl = null;
let cleanup = null;
let renderToken = 0;

function ensureNav() {
  if (navEl) return;
  navEl = document.createElement('nav');
  navEl.className = 'bottom-nav';
  navEl.setAttribute('aria-label', 'Navigasi utama');
  navEl.innerHTML = html`
    <a href="#/" data-route="/">${icon('home')}<span>Beranda</span></a>
    <a href="#/history" data-route="/history">${icon('list')}<span>Riwayat</span></a>
    <span class="fab-slot"><a class="fab" href="#/add" aria-label="Catat transaksi baru">${icon('plus')}</a></span>
    <a href="#/report" data-route="/report">${icon('chart')}<span>Laporan</span></a>
    <a href="#/settings" data-route="/settings">${icon('sliders')}<span>Pengaturan</span></a>`.s;
  appEl.append(navEl);
}

function removeNav() {
  if (navEl) navEl.remove();
  navEl = null;
}

function newScreen(extraClass = '') {
  if (cleanup) { try { cleanup(); } catch { /* abaikan */ } cleanup = null; }
  const el = document.createElement('main');
  el.className = `screen ${extraClass}`.trim();
  el.tabIndex = -1;
  if (screenEl) screenEl.replaceWith(el);
  else appEl.prepend(el);
  screenEl = el;
  return el;
}

function showAuth() {
  renderToken += 1;
  removeNav();
  const el = newScreen('no-nav');
  document.title = 'Masuk — PANTAU';
  renderAuth(el, {
    onSuccess: (data) => {
      // Preferensi gelap dari server hanya dipakai bila perangkat belum punya pilihan sendiri.
      if (data.user.preferences && data.user.preferences.darkMode && !getLocalTheme()) applyTheme('dark');
      state.categories = null;
      history.replaceState(null, '', '#/');
      route();
    },
  });
}

let currentHash = location.hash || '#/';

/** @param {{keepScroll?: boolean}} [opts] keepScroll: dipakai reload() agar posisi scroll tidak lompat ke atas. */
async function route(opts = {}) {
  if (!session.isLoggedIn()) return showAuth();
  const keepScroll = opts.keepScroll === true;
  const scrollY = keepScroll ? window.scrollY : 0;
  currentHash = location.hash || '#/';
  state.unsaved = null;

  const raw = location.hash.slice(1) || '/';
  const [path, qs = ''] = raw.split('?');
  const view = ROUTES[path] || ROUTES['/'];
  const active = ROUTES[path] ? path : '/';
  const token = ++renderToken;

  const hideNav = NAV_HIDDEN.has(active);
  if (hideNav) removeNav();
  else {
    ensureNav();
    navEl.querySelectorAll('[data-route]').forEach((a) => {
      if (a.dataset.route === active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  const el = newScreen(hideNav ? 'no-nav' : '');
  document.title = `${view.title} — PANTAU`;
  if (!keepScroll) window.scrollTo(0, 0);

  const ctx = {
    root: el,
    query: new URLSearchParams(qs),
    state,
    navigate: (hash) => {
      if (location.hash === hash) route();
      else location.hash = hash;
    },
    // Render ulang layar ini dengan elemen BARU. Jangan memanggil render(ctx) lagi pada root yang sama:
    // event listener lama ikut menumpuk (mis. satu ketukan membuka dua sheet).
    reload: () => route({ keepScroll: true }),
  };
  try {
    const result = await view.render(ctx);
    if (token === renderToken && typeof result === 'function') cleanup = result;
    else if (typeof result === 'function') result();
  } catch (err) {
    console.error(err);
    if (token === renderToken) {
      el.innerHTML = html`<div class="empty"><div class="big">🙈</div><h2>Ups, ada yang error</h2><p>${err.message || 'Coba muat ulang halamannya ya.'}</p>
        <a class="btn btn-primary" href="#/">Ke beranda</a></div>`.s;
    }
  }
  if (token === renderToken) {
    if (keepScroll) window.scrollTo(0, scrollY);
    el.focus({ preventScroll: true });
  }
}

// Pindah halaman saat ada perubahan yang belum disimpan: tanya dulu, jangan buang diam-diam.
window.addEventListener('hashchange', async () => {
  if (state.unsaved && state.unsaved()) {
    const leave = await confirmDialog({
      title: 'Buang perubahan?',
      message: 'Ada perubahan yang belum disimpan. Kalau pindah halaman sekarang, perubahannya hilang.',
      confirmText: 'Buang & pindah',
      cancelText: 'Tetap di sini',
      danger: true,
    });
    if (!leave) {
      history.replaceState(null, '', currentHash); // kembali tanpa memicu hashchange lagi
      return;
    }
  }
  route();
});
// Muat ulang / tutup tab dengan perubahan yang belum disimpan.
window.addEventListener('beforeunload', (e) => {
  if (state.unsaved && state.unsaved()) {
    e.preventDefault();
    e.returnValue = '';
  }
});
window.addEventListener('pantau:logout', () => {
  toast.info('Sesi kamu habis, login lagi ya 🔐');
  state.categories = null;
  showAuth();
});

// ------------------------------------------------- keyboard layar sentuh
// Saat mengetik di HP: sembunyikan bottom nav (supaya tidak menutupi/mendorong form) dan
// pastikan field yang difokus terlihat. Hanya untuk perangkat sentuh.
const coarse = window.matchMedia('(pointer: coarse)');
const isTextField = (el) => el && el.matches && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea, select');
const root$ = document.documentElement;
let kbTimer;
let kbBase = null; // tinggi visual viewport saat keyboard belum muncul
let kbSawOpen = false;

document.addEventListener('focusin', (e) => {
  if (!coarse.matches || !isTextField(e.target)) return;
  clearTimeout(kbTimer);
  if (!root$.classList.contains('kb-open') && window.visualViewport) {
    kbBase = window.visualViewport.height;
    kbSawOpen = false;
  }
  root$.classList.add('kb-open');
  setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
});
document.addEventListener('focusout', () => {
  clearTimeout(kbTimer);
  kbTimer = setTimeout(() => {
    root$.classList.remove('kb-open');
    kbBase = null;
    kbSawOpen = false;
  }, 120);
});

// iOS Safari: mengetuk area kosong TIDAK melepas fokus input, jadi keyboard nyangkut dan "change"
// tidak pernah terpicu. Ketukan (bukan geseran) di luar elemen interaktif kita anggap "selesai mengetik".
let tapStart = null;
document.addEventListener('pointerdown', (e) => {
  tapStart = { x: e.clientX, y: e.clientY };
}, { passive: true });
document.addEventListener('pointerup', (e) => {
  const active = document.activeElement;
  const start = tapStart;
  tapStart = null;
  if (!coarse.matches || !start || !isTextField(active)) return;
  if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) return; // geseran/scroll, bukan ketukan
  if (e.target.closest && e.target.closest('input, textarea, select, label, button, a, summary, [role=button], [role=radio], [role=switch]')) return;
  active.blur();
}, { passive: true });

// Android: menutup keyboard dengan tombol back TIDAK melepas fokus -> kb-open nyangkut & nav hilang.
// Deteksi lewat visual viewport: setelah terlihat mengecil (keyboard terbuka) lalu kembali ke tinggi semula
// (keyboard tertutup), lepas fokusnya. Ambang dua arah supaya ganti layout keyboard (mis. emoji) tidak memicu.
// Selain itu, sediakan --kb-offset agar bar melayang bisa duduk tepat di atas keyboard (iOS/Android modern
// tidak mengubah ukuran layout viewport, hanya visual viewport).
const vv = window.visualViewport;
if (vv) {
  const syncOffset = () => {
    const off = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    root$.style.setProperty('--kb-offset', `${off}px`);
  };
  vv.addEventListener('resize', () => {
    syncOffset();
    if (!coarse.matches || kbBase == null || !isTextField(document.activeElement) || vv.scale > 1.01) return;
    if (vv.height < kbBase - 100) kbSawOpen = true;
    else if (kbSawOpen && vv.height >= kbBase - 60) {
      kbSawOpen = false;
      document.activeElement.blur();
    }
  });
  vv.addEventListener('scroll', syncOffset);
}

// ---------------------------------------------------------------- start
route();
