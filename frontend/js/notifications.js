// Toast (Notyf). PENTING: Notyf merender pesan sebagai innerHTML, jadi SEMUA teks
// (yang bisa memuat nama kategori buatan user) di-escape dulu di sini.
import { esc } from './utils.js';

let notyf;
const bg = { success: '#047857', error: '#b91c1c', info: '#0e7490', warning: '#b45309', danger: '#b91c1c' };

function get() {
  if (!notyf && window.Notyf) {
    notyf = new window.Notyf({
      duration: 3200,
      ripple: false,
      dismissible: true,
      position: { x: 'center', y: 'top' },
      types: [
        { type: 'success', background: bg.success, icon: false },
        { type: 'error', background: bg.error, icon: false, duration: 5000 },
        { type: 'info', background: bg.info, icon: false, duration: 6000 },
        { type: 'warning', background: bg.warning, icon: false, duration: 7000 },
        { type: 'danger', background: bg.danger, icon: false, duration: 8000 },
      ],
    });
  }
  return notyf;
}

const show = (type, message) => {
  const n = get();
  if (!n) return;
  n.open({ type, message: esc(message) });
};

export const toast = {
  success: (m) => show('success', m),
  error: (m) => show('error', m),
  info: (m) => show('info', m),
  warning: (m) => show('warning', m),
  danger: (m) => show('danger', m),
};

/** Tampilkan alert budget dari server (level: info | warning | danger). */
export function budgetAlert(alert, delayMs = 0) {
  setTimeout(() => {
    toast[alert.level] ? toast[alert.level](alert.message) : toast.info(alert.message);
    if (navigator.vibrate) navigator.vibrate(alert.level === 'danger' ? [60, 40, 60] : 40);
  }, delayMs);
}
