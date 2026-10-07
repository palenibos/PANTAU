// Laporan: analisis bulanan (skor kesehatan, grafik, tren, rekomendasi) dan mingguan.
import { api } from '../api.js';
import { html, rp, rpShort, mount, on, monthKey, addMonths, monthLabel, dayKey, addDays, shortDate, tierClass, pctText, clamp } from '../utils.js';
import { icon, meter, tierPill, emptyState, errorState, skeleton } from '../ui.js';
import { categoryBars, compareBars, destroyCharts } from '../charts.js';

const CIRC = 2 * Math.PI * 45;
const scoreColor = (s) => (s >= 60 ? 'var(--mark)' : s >= 40 ? 'var(--warning)' : 'var(--danger)');
const MEDALS = ['🥇', '🥈', '🥉'];

/** Gabungkan ekor panjang kategori jadi "Lainnya" (maks `max` batang). */
function foldTail(items, max) {
  if (items.length <= max) return items;
  const head = items.slice(0, max - 1);
  const tail = items.slice(max - 1);
  return [...head, { category: 'Lainnya', emoji: '📦', amount: tail.reduce((s, i) => s + i.amount, 0), prevAmount: tail.reduce((s, i) => s + i.prevAmount, 0) }];
}

function ring(score) {
  const has = score != null;
  const len = has ? (clamp(score, 0, 100) / 100) * CIRC : 0;
  return html`<div class="ring" role="img" aria-label="${has ? `Skor kesehatan keuangan ${score} dari 100` : 'Belum ada skor'}">
    <svg viewBox="0 0 100 100" aria-hidden="true"><circle class="track" cx="50" cy="50" r="45"/>${has ? html`<circle class="val" cx="50" cy="50" r="45" style="--len:${len.toFixed(1)};--c:${scoreColor(score)}"/>` : ''}</svg>
    <div class="score"><b class="num">${has ? score : '–'}</b><small>dari 100</small></div>
  </div>`;
}

function healthCard(a, isCurrent) {
  const rate = a.hasIncome ? `${Math.round(a.saveRate)}%` : '–';
  const ratePill = !a.hasIncome ? html`<span class="pill">belum ada pemasukan</span>` : a.saveRate >= 20 ? html`<span class="pill good">${icon('check')}Save rate ${rate}</span>` : a.saveRate >= 0 ? html`<span class="pill warn">Save rate ${rate}</span>` : html`<span class="pill bad">${icon('down')}Defisit ${rate}</span>`;
  return html`<section class="card" aria-labelledby="hs-h">
    <div class="ring-wrap">
      ${ring(a.healthScore)}
      <div class="ring-info"><h2 id="hs-h">Skor kesehatan keuangan</h2><p class="muted" style="margin:2px 0 8px">${a.healthLabel}</p>${ratePill}</div>
    </div>
    <div class="stat3">
      <div><small>Pemasukan</small><b class="num">${rpShort(a.totalIncome)}</b></div>
      <div><small>Pengeluaran</small><b class="num">${rpShort(a.totalExpense)}</b></div>
      <div><small>Sisa uang</small><b class="num" style="${a.netSaving < 0 ? 'color:var(--danger-text)' : ''}">${rpShort(a.netSaving)}</b></div>
    </div>
    ${a.totalSaved > 0 ? html`<p class="muted small" style="margin-top:10px">🐖 Ditabung bulan ini: <b>${rp(a.totalSaved)}</b></p>` : ''}
    ${isCurrent ? html`<p class="provisional">Bulan ini belum selesai, jadi angka & rekomendasinya masih sementara. Perbandingannya pakai periode yang sama bulan lalu (${a.compare.prevLabel}) ⏳</p>` : ''}
  </section>`;
}

function categoryTable(a) {
  return html`<details class="table-view" data-details><summary>Lihat sebagai tabel</summary>
    <table class="tbl"><thead><tr><th scope="col">Kategori</th><th scope="col">Jumlah</th><th scope="col">%</th><th scope="col">vs lalu</th></tr></thead>
    <tbody>${a.categoryBreakdown.map((c) => html`<tr><td>${c.emoji} ${c.category}</td><td class="num">${rp(c.amount)}</td><td class="num">${Math.round(c.percentage)}%</td><td class="num">${pctText(c.changePct)}</td></tr>`)}</tbody></table>
  </details>`;
}

function trends(a) {
  const rows = [
    ...a.trends.rising.map((c) => ({ c, kind: 'up' })),
    ...a.trends.controlled.map((c) => ({ c, kind: 'down' })),
  ];
  if (!rows.length) return '';
  return html`<div class="sec-head"><h2>Tren kategori</h2><span class="muted small">vs ${a.compare.prevLabel}</span></div>
    <section class="card">${rows.map(({ c, kind }) => html`<div class="trend">
      <span class="emoji" aria-hidden="true">${c.emoji}</span>
      <div class="t-main"><b>${c.category}</b><small class="num">${rpShort(c.prevAmount)} → ${rpShort(c.amount)}</small></div>
      <span class="pill ${kind === 'up' ? 'warn' : 'good'}">${icon(kind)}${Math.abs(c.changePct)}%${kind === 'up' ? ' naik' : ' turun'}</span>
    </div>`)}</section>`;
}

/** 5 kategori terbesar (bulan ini atau bulan lalu) untuk grafik perbandingan. */
const cmpItems = (a) =>
  a.previous
    ? a.categoryBreakdown
        .filter((c) => c.amount > 0 || c.prevAmount > 0)
        .sort((x, y) => Math.max(y.amount, y.prevAmount) - Math.max(x.amount, x.prevAmount))
        .slice(0, 5)
    : [];

function monthlyHtml(a, isCurrent) {
  if (!a.txCount) {
    return html`<section class="card" style="margin-top:12px">${emptyState({ emoji: '🗓️', title: 'Belum ada data', text: `Belum ada transaksi di ${a.label}.`, cta: isCurrent ? 'Catat sekarang' : '', href: '#/add' })}</section>`;
  }
  const catItems = foldTail(a.categoryBreakdown, 8);
  const cmp = cmpItems(a);
  return html`
    <div style="margin-top:12px">${healthCard(a, isCurrent)}</div>

    ${a.categoryBreakdown.length ? html`
    <div class="sec-head"><h2>Pengeluaran per kategori</h2><span class="muted small num">${rp(a.totalExpense)}</span></div>
    <section class="card">
      <div class="chart-box" style="height:${catItems.length * 34 + 12}px"><canvas data-cat-chart role="img" aria-label="Grafik batang pengeluaran per kategori, terbesar: ${a.categoryBreakdown[0].category} ${rp(a.categoryBreakdown[0].amount)}"></canvas></div>
      <p class="muted small" style="margin-top:6px">3 teratas diberi warna penuh.</p>
      ${categoryTable(a)}
    </section>

    <div class="sec-head"><h2>3 pengeluaran terbesar</h2></div>
    <section class="card"><div class="podium">${a.topSpenders.map((s, i) => html`<div class="p"><span class="medal" aria-hidden="true">${MEDALS[i]}</span><span class="emoji" aria-hidden="true">${s.emoji}</span><div><b>${s.category}</b><small>${Math.round((s.amount / a.totalExpense) * 100)}% dari total</small></div><b class="num">${rp(s.amount)}</b></div>`)}</div></section>` : ''}

    ${cmp.length >= 2 ? html`<div class="sec-head"><h2>Dibanding bulan lalu</h2><span class="muted small">${a.compare.mode === 'month-to-date' ? 'periode yang sama' : 'sebulan penuh'}</span></div>
      <section class="card"><div class="chart-box" style="height:${cmp.length * 52 + 56}px"><canvas data-cmp-chart role="img" aria-label="Perbandingan pengeluaran bulan ini dan bulan lalu per kategori"></canvas></div></section>` : ''}

    ${trends(a)}

    ${a.budgetStatus.length ? html`<div class="sec-head"><h2>Status budget</h2></div>
      <section class="card">${a.budgetStatus.map((b, i) => html`<div class="budget-row">
        <span class="emoji" aria-hidden="true">${b.emoji}</span>
        <div class="b-main">
          <div class="b-top"><span class="b-name">${b.category}</span><span class="b-amt num">${rpShort(b.spent)} / ${rpShort(b.limit)}</span></div>
          ${meter(b.percent, tierClass(b.percent), i * 0.05)}
          <div class="b-foot"><span>${Math.round(b.percent)}%${b.over ? ` · lewat ${rpShort(b.over)}` : ''}</span>${tierPill(tierClass(b.percent))}</div>
        </div></div>`)}</section>` : ''}

    <div class="sec-head"><h2>Rekomendasi buat kamu</h2></div>
    ${a.recommendations.map((r) => html`<div class="rec"><span class="r-i" aria-hidden="true">💡</span><p>${r}</p></div>`)}`;
}

function weeklyHtml(w, isCurrent) {
  if (!w.txCount) {
    return html`<section class="card" style="margin-top:12px">${emptyState({ emoji: '🗓️', title: 'Minggu ini sepi', text: 'Belum ada transaksi di rentang ini.', cta: isCurrent ? 'Catat sekarang' : '', href: '#/add' })}</section>`;
  }
  const max = Math.max(...w.dailyTotals.map((d) => d.amount), 1);
  const up = w.changePct != null && w.changePct > 0;
  return html`
    <section class="card" style="margin-top:12px" aria-labelledby="wk-t">
      <h2 id="wk-t">Pengeluaran ${isCurrent ? '7 hari terakhir' : 'minggu itu'}</h2>
      <p class="num" style="font-size:30px;font-weight:800;margin:2px 0 8px">${rp(w.totalSpending)}</p>
      ${w.changePct == null ? html`<span class="pill">minggu sebelumnya belum ada data</span>` : html`<span class="pill ${up ? 'warn' : 'good'}">${icon(up ? 'up' : 'down')}${Math.abs(w.changePct)}% ${up ? 'lebih banyak' : 'lebih hemat'} dari minggu sebelumnya (${rpShort(w.previousSpending)})</span>`}
      <div class="spark" style="height:96px;margin-top:16px" role="img" aria-label="Pengeluaran per hari">
        ${w.dailyTotals.map((d, i) => html`<div title="${d.day}: ${rp(d.amount)}"><i class="${w.busiestDay && d.day === w.busiestDay.day ? 'peak' : ''}" style="--h:${Math.max(4, (d.amount / max) * 100)}%;--d:${i * 0.05}s"></i><span>${d.label}</span></div>`)}
      </div>
      ${w.busiestDay ? html`<p class="muted small" style="margin-top:10px">Paling boros: <b>${w.busiestDay.label}</b> (${rp(w.busiestDay.amount)})</p>` : ''}
      ${w.totalIncome || w.totalSaved ? html`<p class="muted small" style="margin-top:4px">Pemasukan ${rp(w.totalIncome)}${w.totalSaved ? ` · Ditabung ${rp(w.totalSaved)}` : ''}</p>` : ''}
    </section>

    <div class="sec-head"><h2>Top 3 kategori</h2></div>
    <section class="card">${w.topCategories.map((c, i) => html`<div class="trend">
      <span class="medal" style="font-size:22px;width:30px;text-align:center" aria-hidden="true">${MEDALS[i]}</span>
      <span class="emoji" aria-hidden="true">${c.emoji}</span>
      <div class="t-main"><b>${c.category}</b><small class="num">${c.prevAmount ? `minggu lalu ${rpShort(c.prevAmount)}` : 'minggu lalu: belum ada'}</small></div>
      <div style="text-align:right"><b class="num">${rpShort(c.amount)}</b>${c.changePct != null ? html`<br><span class="small muted">${pctText(c.changePct)}</span>` : ''}</div>
    </div>`)}</section>

    <div class="sec-head"><h2>Catatan minggu ini</h2></div>
    <div class="rec"><span class="r-i" aria-hidden="true">💡</span><p>${w.recommendation}</p></div>`;
}

export async function render(ctx) {
  const { root, query } = ctx;
  let tab = query.get('tab') === 'weekly' ? 'weekly' : 'monthly';
  let month = /^\d{4}-\d{2}$/.test(query.get('month') || '') ? query.get('month') : monthKey();
  let end = dayKey();
  let seq = 0; // abaikan respons lama kalau user cepat ganti periode

  mount(
    root,
    html`
    <h1 style="margin-bottom:14px">Laporan</h1>
    <div class="segmented" role="tablist" aria-label="Jenis laporan">
      <button type="button" role="tab" data-tab="monthly" aria-selected="${tab === 'monthly'}">Bulanan</button>
      <button type="button" role="tab" data-tab="weekly" aria-selected="${tab === 'weekly'}">Mingguan</button>
    </div>
    <div data-nav></div>
    <div data-body></div>`,
  );
  const navEl = root.querySelector('[data-nav]');
  const bodyEl = root.querySelector('[data-body]');

  const drawNav = () => {
    const isCurrent = tab === 'monthly' ? month >= monthKey() : end >= dayKey();
    const label = tab === 'monthly' ? monthLabel(month) : `${shortDate(addDays(end, -6))} – ${shortDate(end)}`;
    mount(navEl, html`<div class="month-nav">
      <button class="icon-btn" type="button" data-prev aria-label="${tab === 'monthly' ? 'Bulan sebelumnya' : 'Minggu sebelumnya'}">${icon('left')}</button>
      <strong aria-live="polite">${label}</strong>
      <button class="icon-btn" type="button" data-next aria-label="${tab === 'monthly' ? 'Bulan berikutnya' : 'Minggu berikutnya'}" ${isCurrent ? 'disabled' : ''}>${icon('right')}</button>
    </div>`);
  };

  async function load() {
    const my = ++seq;
    destroyCharts();
    drawNav();
    mount(bodyEl, html`<span class="sk" style="height:200px;margin-top:12px"></span>${skeleton(2, 120)}`);
    try {
      if (tab === 'monthly') {
        const { data: a } = await api.get(`/api/analysis/monthly/${month}`);
        if (my !== seq) return;
        mount(bodyEl, monthlyHtml(a, month === monthKey()));
        const catEl = bodyEl.querySelector('[data-cat-chart]');
        if (catEl) {
          try {
            await categoryBars(catEl, foldTail(a.categoryBreakdown, 8));
            const cmpEl = bodyEl.querySelector('[data-cmp-chart]');
            if (cmpEl) {
              await compareBars(cmpEl, cmpItems(a), { prevLabel: a.compare.prevLabel, curLabel: a.compare.curLabel });
            }
          } catch {
            // Grafik gagal dimuat (offline / diblokir): tabel tetap ada sebagai cadangan.
            catEl.closest('.chart-box').replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Grafik belum bisa dimuat. Datanya ada di tabel di bawah ya 👇' }));
            bodyEl.querySelector('[data-details]')?.setAttribute('open', '');
          }
        }
      } else {
        const { data: w } = await api.get('/api/analysis/weekly', { end });
        if (my !== seq) return;
        mount(bodyEl, weeklyHtml(w, end >= dayKey()));
      }
    } catch (err) {
      if (my !== seq) return;
      mount(bodyEl, errorState(err.message));
    }
  }

  on(root, 'click', '[data-tab]', (e, btn) => {
    if (btn.dataset.tab === tab) return;
    tab = btn.dataset.tab;
    root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    load();
  });
  on(root, 'click', '[data-prev]', () => {
    if (tab === 'monthly') month = addMonths(month, -1);
    else end = addDays(end, -7);
    load();
  });
  on(root, 'click', '[data-next]', () => {
    if (tab === 'monthly') month = month >= monthKey() ? month : addMonths(month, 1);
    else end = addDays(end, 7) > dayKey() ? dayKey() : addDays(end, 7);
    load();
  });
  on(root, 'click', '[data-retry]', load);

  load();
  return destroyCharts; // dibersihkan saat pindah halaman
}

export const title = 'Laporan';
