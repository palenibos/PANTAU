// Helper umum: templating aman, format rupiah, tanggal, dll.

// ---------- templating yang aman dari XSS ----------
// html`...` meng-escape SEMUA nilai yang disisipkan (${...}). Hanya hasil html`` lain
// atau raw() yang disisipkan apa adanya. Jadi nama kategori / catatan dari user aman.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);

class Safe {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}
export const raw = (s) => new Safe(s);
const part = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
  return new Safe(out);
}
export const mount = (el, safe) => {
  el.innerHTML = safe instanceof Safe ? safe.s : esc(safe);
};

// ---------- uang ----------
const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
/** 1234567 -> "Rp 1.234.567" */
export function rp(n) {
  const v = Math.round(Math.abs(Number(n) || 0));
  return `${n < 0 ? '-' : ''}Rp ${group(v)}`;
}
const dec = (x) => x.toFixed(1).replace(/\.0$/, '').replace('.', ',');
/** 50000 -> "Rp 50k", 1250000 -> "Rp 1,3jt" */
export function rpShort(n) {
  const v = Math.round(Math.abs(Number(n) || 0));
  const s = v >= 1_000_000 ? `${dec(v / 1_000_000)}jt` : v >= 1_000 ? `${dec(v / 1_000)}k` : String(v);
  return `${n < 0 ? '-' : ''}Rp ${s}`;
}
export const parseAmount = (str) => Number(String(str ?? '').replace(/\D/g, '')) || 0;
export const formatAmount = (n) => (n > 0 ? group(n) : '');
/**
 * Format angka dengan titik ribuan saat mengetik; caret dijaga di posisi digit yang sama.
 * Selama komposisi IME (keyboard HP yang sedang menyusun teks) isi kolom TIDAK ditulis ulang —
 * menulis ulang saat komposisi aktif membuat sebagian keyboard menempelkan teksnya dua kali
 * (mis. 450000 jadi 99.999.999.999). Format dijalankan saat komposisi selesai.
 */
export function bindMoneyInput(input, onChange) {
  const MAX = 99_999_999_999;
  const format = () => {
    const digitsBefore = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, '').length;
    const n = Math.min(parseAmount(input.value), MAX);
    input.value = formatAmount(n);
    let pos = 0;
    let seen = 0;
    while (pos < input.value.length && seen < digitsBefore) if (/\d/.test(input.value[pos++])) seen++;
    try { input.setSelectionRange(pos, pos); } catch { /* beberapa tipe input tidak mendukung */ }
    if (onChange) onChange(n);
  };
  input.addEventListener('input', (e) => {
    if (e.isComposing) {
      if (onChange) onChange(Math.min(parseAmount(input.value), MAX));
      return;
    }
    format();
  });
  input.addEventListener('compositionend', format);
}

// ---------- tanggal (zona waktu perangkat) ----------
export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const pad = (n) => String(n).padStart(2, '0');

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}
export const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
export const shortDate = (key) => {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
};
export const timeLabel = (iso) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** "Hari ini" / "Kemarin" / "Rabu, 7 Okt" */
export function dayLabel(iso) {
  const d = new Date(iso);
  const k = dayKey(d);
  const today = dayKey();
  if (k === today) return 'Hari ini';
  if (k === addDays(today, -1)) return 'Kemarin';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}
export function longToday() {
  const d = new Date();
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function greeting() {
  const h = new Date().getHours();
  if (h < 4) return 'Selamat malam';
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}
export function relativeTime(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 172800) return 'kemarin';
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} hari lalu`;
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
/** Date -> nilai <input type="datetime-local"> (waktu lokal) */
export const toLocalInput = (d) => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// ---------- lain-lain ----------
export function debounce(fn, ms = 300) {
  let t;
  const wrapped = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const tierClass = (percent) => (percent >= 100 ? 3 : percent >= 80 ? 2 : percent >= 60 ? 1 : 0);
export const pctText = (changePct) => (changePct == null ? '—' : `${changePct > 0 ? '+' : ''}${changePct}%`);
export const initial = (name) => (String(name || '?').trim()[0] || '?').toUpperCase();

/** Event delegation: on(root, 'click', '[data-x]', (e, el) => ...) */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (e) => {
    const el = e.target.closest(selector);
    if (el && root.contains(el)) handler(e, el);
  });
}
