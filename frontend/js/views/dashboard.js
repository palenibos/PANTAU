// Beranda: saldo, ringkasan bulan ini, alert budget, quick-add, progress budget, mingguan, transaksi terbaru.
import { api, session } from '../api.js';
import { html, rp, rpShort, mount, on, greeting, longToday, tierClass } from '../utils.js';
import { icon, meter, tierPill, txRow, emptyState, errorState } from '../ui.js';

const DISMISS_KEY = 'pantau.dismissedAlert';
const getDismissed = () => { try { return sessionStorage.getItem(DISMISS_KEY); } catch { return null; } };
const setDismissed = (id) => { try { sessionStorage.setItem(DISMISS_KEY, id); } catch { /* abaikan */ } };

function skeletonView() {
  return html`
    <span class="sk" style="height:28px;width:55%;margin-bottom:16px"></span>
    <span class="sk" style="height:196px;border-radius:24px;margin-bottom:16px"></span>
    <span class="sk" style="height:84px;margin-bottom:12px"></span>
    <span class="sk" style="height:150px;margin-bottom:12px"></span>
    <span class="sk" style="height:150px"></span>`;
}

function countUp(el, to) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !to) return;
  el.textContent = rp(0); // mulai dari 0 sebelum paint pertama (tidak ada kilatan angka akhir)
  const start = performance.now();
  const dur = 700;
  const tick = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - (1 - p) ** 3;
    el.textContent = rp(Math.round(to * eased));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function budgetRows(list) {
  return list.map((c, i) => {
    const hasBudget = c.budgetLimit > 0;
    const tier = hasBudget ? tierClass(c.budgetPercent) : 0;
    return html`<div class="budget-row">
      <span class="emoji" aria-hidden="true">${c.emoji}</span>
      <div class="b-main">
        <div class="b-top"><span class="b-name">${c.category}</span><span class="b-amt num">${hasBudget ? `${rpShort(c.amount)} / ${rpShort(c.budgetLimit)}` : rpShort(c.amount)}</span></div>
        ${hasBudget ? meter(c.budgetPercent, tier, i * 0.06) : meter(c.percentage, 0, i * 0.06)}
        <div class="b-foot">
          ${hasBudget
            ? html`<span>${Math.round(c.budgetPercent)}% · ${c.budgetPercent < 100 ? `sisa ${rpShort(c.budgetLimit - c.amount)}` : `lewat ${rpShort(c.amount - c.budgetLimit)}`}</span>${tierPill(tier)}`
            : html`<span>${Math.round(c.percentage)}% dari total</span><span>tanpa budget</span>`}
        </div>
      </div>
    </div>`;
  });
}

function weeklyCard(w) {
  const max = Math.max(...w.dailyTotals.map((d) => d.amount), 1);
  const peak = w.dailyTotals.reduce((a, b) => (b.amount > a.amount ? b : a), w.dailyTotals[0]);
  const up = w.changePct != null && w.changePct > 0;
  const chip = w.changePct == null
    ? html`<span class="pill">belum ada pembanding</span>`
    : html`<span class="pill ${up ? 'warn' : 'good'}">${icon(up ? 'up' : 'down')}${Math.abs(w.changePct)}% vs minggu lalu</span>`;
  return html`<section class="card" aria-labelledby="wk-h">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
      <div><h2 id="wk-h">7 hari terakhir</h2><p class="num" style="font-size:22px;font-weight:800;margin-top:2px">${rp(w.totalSpending)}</p></div>
      ${chip}
    </div>
    <div class="spark" role="img" aria-label="Pengeluaran per hari 7 hari terakhir">
      ${w.dailyTotals.map((d, i) => html`<div><i class="${d === peak && d.amount > 0 ? 'peak' : ''}" style="--h:${Math.max(4, (d.amount / max) * 100)}%;--d:${i * 0.05}s"></i><span>${d.label}</span></div>`)}
    </div>
    <p class="muted" style="margin-top:12px;font-size:15px">${w.recommendation}</p>
  </section>`;
}

export async function render(ctx) {
  const { root, state } = ctx;
  mount(root, skeletonView());

  let d;
  try {
    ({ data: d } = await api.get('/api/dashboard'));
  } catch (err) {
    mount(root, errorState(err.message));
    on(root, 'click', '[data-retry]', () => (ctx.reload ? ctx.reload() : location.reload()));
    return;
  }
  state.setUnread(d.unreadNotifications);

  const user = session.user;
  const hasData = d.recentTransactions.length > 0;
  const alert = d.latestAlert && getDismissed() !== d.latestAlert.id ? d.latestAlert : null;
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';

  mount(
    root,
    html`
    <div class="top-bar">
      <div class="hello"><p>${longToday()}</p><h1>${greeting()}, ${user ? user.name.split(' ')[0] : ''} 👋</h1></div>
      <div class="top-actions">
        <button class="icon-btn" type="button" data-theme-toggle aria-label="${dark ? 'Pakai mode terang' : 'Pakai mode gelap'}">${icon(dark ? 'sun' : 'moon')}</button>
        <a class="icon-btn" href="#/inbox" aria-label="Notifikasi${d.unreadNotifications ? `, ${d.unreadNotifications} belum dibaca` : ''}">${icon('bell')}${d.unreadNotifications ? html`<span class="badge">${d.unreadNotifications > 9 ? '9+' : d.unreadNotifications}</span>` : ''}</a>
      </div>
    </div>

    <section class="hero" aria-label="Ringkasan saldo">
      <p class="hero-label">Total aset kamu</p>
      <p class="hero-amount num" data-count="${d.currentBalance}">${rp(d.currentBalance)}</p>
      <div class="hero-sub"><span>👛 Dompet ${rp(d.walletBalance)}</span><span>🐖 Tabungan ${rp(d.totalSavings)}</span></div>
      <div class="hero-grid">
        <div><small>${icon('down')}Pemasukan</small><b class="num">${rp(d.income)}</b></div>
        <div><small>${icon('up')}Pengeluaran</small><b class="num">${rp(d.expense)}</b></div>
      </div>
      <p class="hero-month">${d.monthLabel} · ${d.income > 0 ? `sisa ${rp(d.netSaving)} (${Math.round(d.saveRate)}% dari income)` : 'belum ada pemasukan tercatat'}</p>
    </section>

    ${alert ? html`<div class="banner t${alert.tier}" role="status" data-banner="${alert.id}">
      <span class="b-emoji" aria-hidden="true">${alert.emoji}</span>
      <p><b>${alert.title}</b>${alert.message}</p>
      <button class="icon-btn" type="button" data-dismiss aria-label="Tutup peringatan">${icon('x')}</button>
    </div>` : ''}

    <div class="sec-head"><h2>Catat cepat</h2><a href="#/add?type=income">+ Pemasukan</a></div>
    <nav class="quick" aria-label="Catat pengeluaran cepat">
      ${d.quickCategories.map((c) => html`<a href="#/add?cat=${encodeURIComponent(c.name)}"><span aria-hidden="true">${c.emoji}</span><span>${c.name}</span></a>`)}
    </nav>

    ${d.monthlyBudget ? html`<section class="card" style="margin-top:16px" aria-labelledby="mb-h">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h2 id="mb-h">Budget bulanan</h2><span class="muted small num">${d.daysLeft} hari lagi</span></div>
      <p class="num" style="margin:4px 0 10px"><b style="font-size:20px">${rp(d.monthlyBudget.spent)}</b> <span class="muted">dari ${rp(d.monthlyBudget.limit)}</span></p>
      ${meter(d.monthlyBudget.percent, d.monthlyBudget.tier)}
      <div class="b-foot" style="display:flex;justify-content:space-between;margin-top:8px;font-size:13px;color:var(--fg-secondary)"><span>${Math.round(d.monthlyBudget.percent)}% terpakai</span>${tierPill(d.monthlyBudget.tier)}</div>
    </section>` : ''}

    ${hasData ? html`
      <div class="sec-head"><h2>Budget per kategori</h2><a href="#/settings">Atur</a></div>
      <section class="card">${d.topCategories.length ? budgetRows(d.topCategories) : html`<p class="muted">Belum ada pengeluaran bulan ini 🎉</p>`}</section>

      <div class="sec-head"><h2>Minggu ini</h2><a href="#/report?tab=weekly">Detail</a></div>
      ${weeklyCard(d.weekly)}

      <div class="sec-head"><h2>Transaksi terbaru</h2><a href="#/history">Lihat semua</a></div>
      <section class="card"><ul class="tx-list">${d.recentTransactions.map(txRow)}</ul></section>`
    : html`<section class="card" style="margin-top:16px">${emptyState({ emoji: '🌱', title: 'Mulai catat yuk!', text: 'Belum ada transaksi. Catat pengeluaran pertama kamu, nanti PANTAU bantu ngingetin biar nggak kalap.', cta: 'Catat sekarang', href: '#/add' })}</section>`}
  `,
  );

  const heroEl = root.querySelector('[data-count]');
  countUp(heroEl, d.currentBalance);

  on(root, 'click', '[data-dismiss]', (e, btn) => {
    const banner = btn.closest('[data-banner]');
    setDismissed(banner.dataset.banner);
    banner.remove();
  });
  on(root, 'click', '[data-theme-toggle]', () => state.toggleTheme(() => (ctx.reload ? ctx.reload() : location.reload())));
}

export const title = 'Beranda';
