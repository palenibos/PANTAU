// Helper tanggal berbasis zona waktu app (default WIB / UTC+7).
// Semua batas hari, minggu, dan bulan dihitung di zona ini supaya
// transaksi jam 23:30 WIB tidak "loncat" ke hari/bulan berikutnya (UTC).
const { tzOffsetMinutes } = require('../config/env');

const OFFSET_MS = tzOffsetMinutes * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const pad = (n) => String(n).padStart(2, '0');

/** Pecah Date menjadi bagian-bagian kalender di zona app. */
function parts(date) {
  const s = new Date(new Date(date).getTime() + OFFSET_MS);
  return {
    y: s.getUTCFullYear(),
    m: s.getUTCMonth() + 1,
    d: s.getUTCDate(),
    h: s.getUTCHours(),
    min: s.getUTCMinutes(),
    dow: s.getUTCDay(), // 0 = Minggu
  };
}

/** Date UTC untuk waktu dinding (y-m-d h:min) di zona app. */
function fromLocal(y, m, d, h = 0, min = 0) {
  return new Date(Date.UTC(y, m - 1, d, h, min) - OFFSET_MS);
}

const monthKey = (date) => {
  const p = parts(date);
  return `${p.y}-${pad(p.m)}`;
};

const dayKey = (date) => {
  const p = parts(date);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
};

const isMonthKey = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const isDayKey = (s) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s);

/** [start, end) satu bulan kalender. */
function monthRange(key) {
  const [y, m] = key.split('-').map(Number);
  return {
    start: fromLocal(y, m, 1),
    end: m === 12 ? fromLocal(y + 1, 1, 1) : fromLocal(y, m + 1, 1),
  };
}

function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

function daysInMonth(key) {
  const { start, end } = monthRange(key);
  return Math.round((end - start) / DAY_MS);
}

/** [start, end) satu hari kalender. */
function dayRange(key) {
  const [y, m, d] = key.split('-').map(Number);
  const start = fromLocal(y, m, d);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

function addDays(key, n) {
  return dayKey(new Date(dayRange(key).start.getTime() + n * DAY_MS));
}

function daysLeftInMonth(now = new Date()) {
  return daysInMonth(monthKey(now)) - parts(now).d;
}

/**
 * Jendela 7 hari yang berakhir di akhir hari `endKey` (inklusif),
 * plus 7 hari sebelumnya untuk perbandingan.
 */
function weekWindow(endKey) {
  const end = dayRange(endKey).end;
  const start = new Date(end.getTime() - 7 * DAY_MS);
  const prevStart = new Date(start.getTime() - 7 * DAY_MS);
  return {
    start,
    end,
    prevStart,
    prevEnd: start,
    startKey: dayKey(start),
    endKey,
  };
}

/** Minggu 19:00 terakhir yang sudah lewat. */
function lastWeeklyDigest(now = new Date()) {
  const p = parts(now);
  let key = addDays(dayKey(now), -p.dow); // hari Minggu terdekat (<= hari ini)
  const at = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return fromLocal(y, m, d, 19, 0);
  };
  if (at(key) > now) key = addDays(key, -7);
  return { key, at: at(key) };
}

/** Hari terakhir bulan pukul 20:00 yang sudah lewat. */
function lastMonthlyDigest(now = new Date()) {
  const at = (k) => {
    const [y, m] = k.split('-').map(Number);
    return fromLocal(y, m, daysInMonth(k), 20, 0);
  };
  let key = monthKey(now);
  if (at(key) > now) key = addMonths(key, -1);
  return { key, at: at(key) };
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_ID[m - 1]} ${y}`;
}

module.exports = {
  MONTHS_ID,
  DAYS_ID,
  DAY_MS,
  parts,
  fromLocal,
  monthKey,
  dayKey,
  isMonthKey,
  isDayKey,
  monthRange,
  addMonths,
  daysInMonth,
  dayRange,
  addDays,
  daysLeftInMonth,
  weekWindow,
  lastWeeklyDigest,
  lastMonthlyDigest,
  monthLabel,
};
