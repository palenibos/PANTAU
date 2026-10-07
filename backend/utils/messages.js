// Teks notifikasi budget 3-tier. Tone: ngobrol sama temen, ada humor, nggak menghakimi,
// dan selalu menyebut angka yang spesifik.
const { rpShort } = require('./money');

const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];

const firstName = (name) => {
  const w = String(name || '').trim().split(/\s+/)[0];
  return w ? w[0].toUpperCase() + w.slice(1) : 'Bestie';
};

const TIER_LEVEL = { 1: 'info', 2: 'warning', 3: 'danger' };

/**
 * @param {object} c
 * @param {1|2|3} c.tier
 * @param {string} c.category   nama kategori (apa adanya)
 * @param {string} c.emoji
 * @param {string} c.userName
 * @param {number} c.percent    persen terpakai (boleh > 100)
 * @param {number} c.spent
 * @param {number} c.limit
 * @param {number} c.daysLeft   sisa hari di bulan ini
 * @param {number} c.todayCount jumlah transaksi kategori ini hari ini
 */
function budgetMessage(c, rng = Math.random) {
  const cat = c.category;
  const lower = cat.toLowerCase();
  const pct = Math.round(c.percent);
  const left = Math.max(0, 100 - pct);
  const remaining = rpShort(Math.max(0, c.limit - c.spent));
  const over = Math.max(0, c.spent - c.limit);
  const overText = rpShort(over);
  const name = firstName(c.userName);
  const e = c.emoji;
  const daysText = c.daysLeft > 0 ? `masih ada ${c.daysLeft} hari lagi` : 'ini hari terakhir bulan ini';

  let title;
  let pool;

  if (c.tier === 1) {
    title = `${cat}: ${pct}% budget kepake`;
    const specific = {
      rokok: [`Rokok budget kamu tinggal ${left}% 👀 Masih banyak koq!`],
      nongkrong: [`Nongkrong budget ${pct}% kepake. Semoga worth it! 🎉`],
      kopi: [`Kopi udah ${pct}% dari budget ☕ Masih aman, nikmatin aja!`],
      makan: [`Budget makan ${pct}% kepake 🍔 Masih ada ${remaining}, enjoy!`],
      transportasi: [`Transportasi ${pct}% dari budget 💸 Masih ada ${remaining} buat mobilitas bulan ini.`],
      belanja: [`Belanja udah ${pct}% dari budget 🛍️ Masih ada ${remaining}, checkout-nya pelan-pelan ya.`],
      entertainment: [`Entertainment ${pct}% kepake 🎮 Seru-seruan boleh, sisa ${remaining} ya!`],
    }[lower];
    pool = specific || [
      `Budget ${lower} udah ${pct}% kepake nih ${e} Sisa ${remaining}, masih aman kok!`,
      `Heads up: ${lower} baru kepake ${pct}% ${e} Santai, masih ada ${remaining}.`,
    ];
  } else if (c.tier === 2) {
    title = `Budget ${lower} hampir habis`;
    const generic = [
      `${name}, budget ${lower} tinggal ${remaining} nih ${e} ${daysText[0].toUpperCase() + daysText.slice(1)}, pelan-pelan ya 😅`,
    ];
    const specific = {
      rokok: [`Rokok budget tinggal ${remaining}. Kurangin dikit yuk? 🚬`],
      kopi:
        c.todayCount >= 3
          ? [`${name}, budget kopi hari ini udah ${c.todayCount}x keluar 😅 Next round besok aja?`]
          : [`Budget kopi tinggal ${remaining} ☕ Bikin sendiri di rumah sekali-sekali?`],
      nongkrong: [`Nongkrong budget tinggal ${remaining}, ${daysText}. Mending save buat weekend? 🎉`],
      makan: [`Budget makan tinggal ${remaining} 🍔 ${daysText[0].toUpperCase() + daysText.slice(1)}. Bekal dari rumah bisa jadi opsi 💡`],
    }[lower];
    pool = specific || generic;
  } else {
    title = over > 0 ? `Budget ${lower} terlewat` : `Budget ${lower} habis`;
    pool =
      over > 0
        ? [
            `Overspend ${overText} dari budget ${lower}. Bisa adjust di kategori lain ga? 🔄`,
            `${cat} udah lewat budget ${overText} ${e} Gapapa, yang penting sadar. Yuk atur ulang sisa bulan ini 💪`,
          ]
        : [`Budget ${lower} selesai! Semangat kontrol sampai akhir bulan! 💪`];
  }

  return {
    title,
    message: pick(pool, rng),
    level: TIER_LEVEL[c.tier],
  };
}

module.exports = { budgetMessage, firstName, pick, TIER_LEVEL };
