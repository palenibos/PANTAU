const group = (v) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** 1234567 -> "Rp 1.234.567" */
function rp(n) {
  const v = Math.round(Math.abs(Number(n) || 0));
  return `${n < 0 ? '-' : ''}Rp ${group(v)}`;
}

const oneDecimal = (x) => x.toFixed(1).replace(/\.0$/, '').replace('.', ',');

/** 50000 -> "Rp 50k", 1250000 -> "Rp 1,3jt" — gaya bahasa notifikasi. */
function rpShort(n) {
  const v = Math.round(Math.abs(Number(n) || 0));
  let s;
  if (v >= 1_000_000) s = `${oneDecimal(v / 1_000_000)}jt`;
  else if (v >= 1_000) s = `${oneDecimal(v / 1_000)}k`;
  else s = String(v);
  return `${n < 0 ? '-' : ''}Rp ${s}`;
}

/** Bulatkan ke angka "enak dibaca": <100k ke 5k, sisanya ke 10k. */
function roundNice(n) {
  const step = n < 100_000 ? 5_000 : 10_000;
  return Math.max(step, Math.round(n / step) * step);
}

const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
const round1 = (x) => Math.round(x * 10) / 10;

module.exports = { rp, rpShort, roundNice, pct, round1 };
