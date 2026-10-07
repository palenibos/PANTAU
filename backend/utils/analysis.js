// Mesin analisis & rekomendasi. Semua fungsi di sini MURNI (tanpa akses DB) supaya
// gampang dites: terima array transaksi + kategori, kembalikan angka & teks.
//
// Definisi uang yang dipakai di seluruh app:
//   income   = transaksi bertipe "income"
//   spending = transaksi "expense" di kategori BUKAN tabungan   (ini yang disebut pengeluaran)
//   saving   = transaksi "expense" di kategori tabungan (mis. Nabung)
//   netSaving = income - spending     (uang yang tidak dihabiskan: tabungan + sisa dompet)
//   saveRate  = netSaving / income * 100
const { parts, dayKey, addDays, monthLabel } = require('./time');
const { rpShort, roundNice, round1 } = require('./money');

const FALLBACK_EMOJI = '📌';
const NON_DISCRETIONARY = new Set(['transportasi', 'orang tua', 'membayar hutang', 'sedekah']);

const WEEKDAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

// ---------- dasar ----------

const indexCategories = (categories) => new Map(categories.map((c) => [c.name.toLowerCase(), c]));

function classify(tx, index) {
  if (tx.type === 'income') return 'income';
  const c = index.get(String(tx.category).toLowerCase());
  return c && c.isSaving ? 'saving' : 'spending';
}

function summarize(txs, index) {
  const out = { income: 0, spending: 0, saving: 0, count: txs.length };
  const cats = new Map();
  for (const tx of txs) {
    const kind = classify(tx, index);
    if (kind === 'income') out.income += tx.amount;
    else if (kind === 'saving') out.saving += tx.amount;
    else {
      out.spending += tx.amount;
      const c = index.get(String(tx.category).toLowerCase());
      const name = c ? c.name : tx.category;
      const cur = cats.get(name) || { category: name, emoji: c ? c.emoji : FALLBACK_EMOJI, amount: 0, count: 0, txs: [] };
      cur.amount += tx.amount;
      cur.count += 1;
      cur.txs.push(tx);
      cats.set(name, cur);
    }
  }
  out.netSaving = out.income - out.spending;
  out.hasIncome = out.income > 0;
  out.saveRate = out.income > 0 ? round1((out.netSaving / out.income) * 100) : 0;
  out.categories = [...cats.values()].sort((a, b) => b.amount - a.amount);
  return out;
}

const changePct = (prev, cur) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

const isDiscretionary = (name) => !NON_DISCRETIONARY.has(name.toLowerCase());

// ---------- budget ----------

/** 0 = aman, 1 = >=60%, 2 = >=80%, 3 = >=100% */
function tierFor(percent) {
  if (percent >= 100) return 3;
  if (percent >= 80) return 2;
  if (percent >= 60) return 1;
  return 0;
}

/**
 * Apakah penambahan pengeluaran dari `before` ke `after` perlu memicu notifikasi?
 * Tier 1/2 hanya saat ambang baru terlewati; tier 3 juga saat sudah lewat dan nambah lagi.
 */
function evaluateBudget({ limit, before, after }) {
  if (!(limit > 0) || after <= before) return null;
  const percent = (after / limit) * 100;
  const tierAfter = tierFor(percent);
  const tierBefore = tierFor((before / limit) * 100);
  if (tierAfter === 0) return null;
  if (tierAfter > tierBefore) return { tier: tierAfter, percent, repeat: false };
  if (tierAfter === 3 && tierBefore === 3) return { tier: 3, percent, repeat: true };
  return null;
}

/** Status budget per kategori (hanya kategori pengeluaran non-tabungan yang punya budget). */
function budgetStatus(categories, spendByCategory) {
  return categories
    .filter((c) => c.type !== 'income' && !c.isSaving && c.budgetLimit > 0)
    .map((c) => {
      const spent = spendByCategory.get(c.name) || 0;
      const percent = (spent / c.budgetLimit) * 100;
      return {
        category: c.name,
        emoji: c.emoji,
        limit: c.budgetLimit,
        spent,
        percent: round1(percent),
        tier: tierFor(percent),
        over: Math.max(0, spent - c.budgetLimit),
      };
    })
    .sort((a, b) => b.percent - a.percent);
}

// ---------- skor kesehatan keuangan ----------

/**
 * 0-100. 70 poin dari save rate (30%+ = penuh), 30 poin dari disiplin budget
 * (porsi kategori ber-budget yang tidak jebol). Tanpa budget → netral 15 poin.
 */
function healthScore({ saveRate, hasIncome, budgets }) {
  const saveComponent = hasIncome ? (Math.min(Math.max(saveRate, 0), 30) / 30) * 70 : 0;
  const budgetComponent = budgets.length
    ? (budgets.filter((b) => b.over === 0).length / budgets.length) * 30
    : 15;
  return Math.round(saveComponent + budgetComponent);
}

function healthLabel(score) {
  if (score == null) return 'Belum ada data';
  if (score >= 80) return 'Sehat banget 💪';
  if (score >= 60) return 'Lumayan sehat 👍';
  if (score >= 40) return 'Cukup, masih bisa naik 📈';
  return 'Yuk benahin pelan-pelan 🌱';
}

// ---------- analisis mingguan ----------

/**
 * @param {object} p
 * @param {object[]} p.txs       transaksi dalam jendela 7 hari
 * @param {object[]} p.prevTxs   transaksi 7 hari sebelumnya
 * @param {object[]} p.categories
 * @param {{startKey:string,endKey:string}} p.window
 */
function buildWeeklyAnalysis({ txs, prevTxs, categories, window }) {
  const index = indexCategories(categories);
  const cur = summarize(txs, index);
  const prev = summarize(prevTxs, index);
  const prevByCat = new Map(prev.categories.map((c) => [c.category, c.amount]));

  const topCategories = cur.categories.slice(0, 3).map((c) => ({
    category: c.category,
    emoji: c.emoji,
    amount: c.amount,
    percentage: round1((c.amount / cur.spending) * 100),
    prevAmount: prevByCat.get(c.category) || 0,
    changePct: changePct(prevByCat.get(c.category) || 0, c.amount),
  }));

  // Kenaikan terbesar (butuh pembanding), minimal +25% dan +Rp 20rb.
  const rises = cur.categories
    .map((c) => ({ ...c, prevAmount: prevByCat.get(c.category) || 0 }))
    .filter((c) => c.prevAmount > 0 && c.amount - c.prevAmount >= 20_000 && c.amount / c.prevAmount >= 1.25)
    .sort((a, b) => b.amount - b.prevAmount - (a.amount - a.prevAmount));
  const biggestRise = rises[0]
    ? {
        category: rises[0].category,
        emoji: rises[0].emoji,
        amount: rises[0].amount,
        prevAmount: rises[0].prevAmount,
        changePct: changePct(rises[0].prevAmount, rises[0].amount),
      }
    : null;

  const dailyTotals = [];
  for (let i = 0; i < 7; i++) {
    const key = addDays(window.startKey, i);
    const [y, m, d] = key.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    dailyTotals.push({ day: key, label: WEEKDAY_SHORT[dow], amount: 0 });
  }
  for (const tx of txs) {
    if (classify(tx, index) !== 'spending') continue;
    const slot = dailyTotals.find((d) => d.day === dayKey(tx.date));
    if (slot) slot.amount += tx.amount;
  }
  const busiest = dailyTotals.reduce((a, b) => (b.amount > a.amount ? b : a), dailyTotals[0]);

  const spendChange = changePct(prev.spending, cur.spending);

  let recommendation;
  if (cur.count === 0) {
    recommendation = 'Minggu ini belum ada catatan. Yuk mulai catat biar bisa dianalisis 📝';
  } else if (biggestRise) {
    recommendation = `Minggu ini ${biggestRise.category.toLowerCase()} kamu +${biggestRise.changePct}% (${rpShort(biggestRise.prevAmount)} → ${rpShort(biggestRise.amount)}). Semoga ada alasannya ya 😅`;
  } else if (spendChange != null && spendChange <= -10) {
    recommendation = `Pengeluaran turun ${Math.abs(spendChange)}% dari minggu lalu. Mantap, pertahankan! 🔥`;
  } else if (spendChange != null && spendChange >= 10) {
    recommendation = `Pengeluaran naik ${spendChange}% dari minggu lalu. Cek lagi yuk, mungkin ada yang bisa ditunda 💡`;
  } else if (topCategories[0]) {
    recommendation = `${topCategories[0].category} jadi pengeluaran terbesar minggu ini (${rpShort(topCategories[0].amount)}). Masih wajar, tetap pantau ya 👀`;
  } else {
    recommendation = 'Minggu ini aman terkendali 👌';
  }

  return {
    range: { start: window.startKey, end: window.endKey },
    txCount: cur.count,
    totalIncome: cur.income,
    totalSpending: cur.spending,
    totalSaved: cur.saving,
    previousSpending: prev.spending,
    changePct: spendChange,
    topCategories,
    biggestRise,
    busiestDay: busiest && busiest.amount > 0 ? { day: busiest.day, label: busiest.label, amount: busiest.amount } : null,
    dailyTotals,
    recommendation,
  };
}

function weeklyNotification(weekly) {
  const change =
    weekly.changePct == null
      ? 'minggu lalu belum ada pembanding'
      : weekly.changePct === 0
        ? 'sama kayak minggu lalu'
        : `${weekly.changePct > 0 ? 'naik' : 'turun'} ${Math.abs(weekly.changePct)}% dari minggu lalu`;
  const top = weekly.topCategories.map((c) => `${c.emoji} ${c.category} ${rpShort(c.amount)}`).join(', ');
  return {
    title: '📅 Ringkasan mingguan kamu udah siap',
    message: `Minggu ini keluar ${rpShort(weekly.totalSpending)} (${change}). Top 3: ${top}. ${weekly.recommendation}`,
  };
}

// ---------- analisis bulanan ----------

function weekendShare(txs) {
  const total = txs.reduce((s, t) => s + t.amount, 0);
  if (!total) return 0;
  const weekend = txs.filter((t) => [5, 6, 0].includes(parts(t.date).dow)).reduce((s, t) => s + t.amount, 0);
  return weekend / total;
}

/**
 * @param {object} p
 * @param {string} p.month YYYY-MM
 * @param {object[]} p.txs transaksi bulan itu
 * @param {object[]} p.prevTxs transaksi bulan sebelumnya
 * @param {{month:string,spending:number}[]} p.history bulan-bulan sebelumnya (untuk "bulan paling boros")
 * @param {object[]} p.categories
 */
function buildMonthlyAnalysis({ month, txs, prevTxs = [], history = [], categories }) {
  const index = indexCategories(categories);
  const cur = summarize(txs, index);
  const prev = summarize(prevTxs, index);
  const prevByCat = new Map(prev.categories.map((c) => [c.category, c.amount]));
  const catByName = new Map(categories.map((c) => [c.name, c]));
  const spendByCat = new Map(cur.categories.map((c) => [c.category, c.amount]));

  const categoryBreakdown = cur.categories.map((c) => {
    const meta = catByName.get(c.category);
    const prevAmount = prevByCat.get(c.category) || 0;
    return {
      category: c.category,
      emoji: c.emoji,
      amount: c.amount,
      count: c.count,
      percentage: round1((c.amount / cur.spending) * 100),
      budgetLimit: meta ? meta.budgetLimit || 0 : 0,
      prevAmount,
      changePct: changePct(prevAmount, c.amount),
    };
  });

  const topSpenders = categoryBreakdown.slice(0, 3).map(({ category, emoji, amount }) => ({ category, emoji, amount }));
  const budgets = budgetStatus(categories, spendByCat);

  const rising = categoryBreakdown
    .filter((c) => c.prevAmount > 0 && c.changePct >= 30 && c.amount - c.prevAmount >= 50_000)
    .sort((a, b) => b.amount - b.prevAmount - (a.amount - a.prevAmount))
    .slice(0, 3);
  const controlled = categoryBreakdown
    .filter((c) => c.prevAmount > 0 && c.changePct <= -20 && c.prevAmount - c.amount >= 50_000)
    .sort((a, b) => b.prevAmount - b.amount - (a.prevAmount - a.amount))
    .slice(0, 3);

  const hasData = cur.count > 0;
  const score = hasData ? healthScore({ saveRate: cur.saveRate, hasIncome: cur.hasIncome, budgets }) : null;

  const recommendations = hasData
    ? buildRecommendations({ cur, prev, categoryBreakdown, budgets, rising, controlled, history, catByName })
    : ['Belum ada transaksi bulan ini. Catat dulu ya, nanti kita bedah bareng 📝'];

  return {
    month,
    label: monthLabel(month),
    txCount: cur.count,
    totalIncome: cur.income,
    totalExpense: cur.spending,
    totalSaved: cur.saving,
    netSaving: cur.netSaving,
    saveRate: cur.saveRate,
    hasIncome: cur.hasIncome,
    categoryBreakdown,
    topSpenders,
    trends: { rising, controlled },
    budgetStatus: budgets,
    healthScore: score,
    healthLabel: healthLabel(score),
    previous: prevTxs.length
      ? { totalIncome: prev.income, totalExpense: prev.spending, saveRate: prev.saveRate }
      : null,
    recommendations,
  };
}

function buildRecommendations({ cur, prev, categoryBreakdown, budgets, rising, controlled, history, catByName }) {
  const recs = [];

  // 1) Cerita utama: defisit atau save rate
  if (!cur.hasIncome) {
    recs.push('Belum ada pemasukan tercatat bulan ini. Catat gaji/uang saku juga biar analisisnya akurat 📝');
  } else if (cur.netSaving < 0) {
    const deficit = Math.abs(cur.netSaving);
    const priorMax = history.length >= 2 ? Math.max(...history.map((h) => h.spending)) : Infinity;
    const stable = prev.income > 0 && Math.abs(cur.income - prev.income) / prev.income <= 0.15;
    const biggest = cur.spending > priorMax;
    recs.push(
      `${stable ? 'Income stabil, tapi pengeluaran melebihi. ' : ''}Pengeluaran bulan ini ${rpShort(deficit)} lebih besar dari pemasukan. ${
        biggest ? 'Ini bulan paling boros sejauh ini — apa ada yang berubah? 📊' : 'Coba cek kategori terbesar dan potong dikit-dikit 💡'
      }`,
    );
  } else if (cur.saveRate >= 50) {
    recs.push(
      `Luar biasa, kamu nyisihin ${Math.round(cur.saveRate)}% dari income! Coba alokasikan sebagian ke dana darurat atau investasi 📈`,
    );
  } else if (cur.saveRate >= 10) {
    // Target berikutnya = kelipatan 5 persen di atas save rate sekarang (30% -> 35%).
    const next = Math.min(60, (Math.floor(cur.saveRate / 5) + 1) * 5);
    recs.push(
      `Bulan ini kamu nyisihin ${Math.round(cur.saveRate)}% dari income. ${cur.saveRate >= 30 ? 'Bagus!' : 'Lumayan!'} Bulan depan target ${next}%? 🎯`,
    );
  } else {
    recs.push(
      `Sisa uang bulan ini baru ${Math.round(cur.saveRate)}% dari income. Yuk coba target 10% dulu — mulai kecil juga gapapa 🌱`,
    );
  }

  // 2) Budget yang jebol
  const broke = budgets.filter((b) => b.over > 0).sort((a, b) => b.over - a.over);
  if (broke.length === 1) {
    recs.push(`Budget ${broke[0].category.toLowerCase()} lewat ${rpShort(broke[0].over)} bulan ini. Naikin budget biar realistis, atau tahan dikit bulan depan? 🎯`);
  } else if (broke.length > 1) {
    recs.push(
      `${broke.length} kategori melewati budget (terbesar: ${broke[0].category.toLowerCase()} +${rpShort(broke[0].over)}). Review budget kamu, mungkin ada yang perlu disesuaikan 🔧`,
    );
  }

  // 3) Kategori naik drastis
  if (rising[0]) {
    const r = rising[0];
    recs.push(`${r.category} naik ${r.changePct}% dibanding bulan lalu (${rpShort(r.prevAmount)} → ${rpShort(r.amount)}). Lagi ada momen spesial, atau mulai jadi kebiasaan? 👀`);
  }

  // 4) Potong 20% di kategori boros-able terbesar
  const topDisc = categoryBreakdown.find((c) => isDiscretionary(c.category) && c.amount >= 100_000);
  if (topDisc) {
    recs.push(
      `${topDisc.category} kamu ${rpShort(topDisc.amount)}/bulan. Kalau dikurangin 20%, bisa kumpul ${rpShort(roundNice(topDisc.amount * 0.2))}/bulan untuk nabung. Worth it? 🤔`,
    );
  }

  // 5) Pola hari (Jumat–Minggu)
  const patternCat =
    categoryBreakdown.find((c) => c.category.toLowerCase() === 'nongkrong' && c.count >= 3 && c.amount >= 150_000) ||
    categoryBreakdown.find((c) => isDiscretionary(c.category) && c.count >= 4 && c.amount >= 150_000);
  if (patternCat) {
    const metaCat = cur.categories.find((c) => c.category === patternCat.category);
    const share = weekendShare(metaCat.txs);
    if (share >= 0.6) {
      const saving = rpShort(roundNice(patternCat.amount * 0.15));
      recs.push(
        patternCat.category.toLowerCase() === 'nongkrong'
          ? `Nongkrong kamu mostly Jumat–Minggu (${Math.round(share * 100)}% dari total). Coba rotate ke tempat yang lebih murah? Bisa save sekitar ${saving}/bulan 💡`
          : `${patternCat.category} kamu mostly Jumat–Minggu (${Math.round(share * 100)}% dari total). Coba tentuin batas per akhir pekan biar ga kebablasan — bisa save sekitar ${saving}/bulan 💡`,
      );
    }
  }

  // 5b) Pujian untuk yang terkontrol
  if (controlled[0]) {
    const c = controlled[0];
    recs.push(`${c.category} turun ${Math.abs(c.changePct)}% dibanding bulan lalu (${rpShort(c.prevAmount)} → ${rpShort(c.amount)}). Kontrol kamu keren, pertahankan! 🔥`);
  }

  // 6) Kebaikan kecil
  const sedekah = cur.categories.find((c) => c.category.toLowerCase() === 'sedekah');
  if (sedekah) recs.push(`Kamu sedekah ${rpShort(sedekah.amount)} bulan ini 🤲 Semoga berkah ya!`);

  return recs.slice(0, 5);
}

function monthlyNotification(analysis) {
  const score = analysis.healthScore;
  return {
    title: `📊 Laporan ${analysis.label} udah siap`,
    message: `Pemasukan ${rpShort(analysis.totalIncome)}, pengeluaran ${rpShort(analysis.totalExpense)}, sisa ${rpShort(analysis.netSaving)} (${Math.round(analysis.saveRate)}%). Skor kesehatan: ${score}/100 — ${analysis.healthLabel}. ${analysis.recommendations[0] || ''}`.trim(),
  };
}

module.exports = {
  FALLBACK_EMOJI,
  indexCategories,
  classify,
  summarize,
  changePct,
  tierFor,
  evaluateBudget,
  budgetStatus,
  healthScore,
  healthLabel,
  buildWeeklyAnalysis,
  weeklyNotification,
  buildMonthlyAnalysis,
  monthlyNotification,
};
