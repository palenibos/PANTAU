// Riwayat: cari, filter (bulan / tipe / kategori / nominal / tanggal), dikelompokkan per hari, 50 per halaman.
import { api } from '../api.js';
import { html, rp, rpShort, mount, on, debounce, dayLabel, monthKey, addMonths, monthLabel, dayKey } from '../utils.js';
import { icon, openSheet, txRow, emptyState, errorState, skeleton } from '../ui.js';

const PAGE = 50;
// Filter dipertahankan selama sesi supaya balik dari layar edit tidak mereset pencarian.
const defaults = () => ({ q: '', month: monthKey(), type: '', category: '', minAmount: '', maxAmount: '', from: '', to: '' });
let filters = defaults();

const activeCount = () => {
  const f = filters;
  return [f.month !== monthKey(), f.type, f.category, f.minAmount, f.maxAmount, f.from, f.to].filter(Boolean).length;
};

const monthOptions = () => {
  const out = [];
  for (let i = 0; i < 12; i++) out.push(addMonths(monthKey(), -i));
  return out;
};

function group(items) {
  const map = new Map();
  for (const t of items) {
    const k = dayKey(new Date(t.date));
    if (!map.has(k)) map.set(k, { label: dayLabel(t.date), items: [], spend: 0 });
    const g = map.get(k);
    g.items.push(t);
    if (t.type === 'expense') g.spend += t.amount;
  }
  return [...map.values()];
}

export async function render(ctx) {
  const { root, state, query } = ctx;
  if (query.get('reset')) filters = defaults();
  if (query.get('category')) filters = { ...defaults(), category: query.get('category'), month: query.get('month') || monthKey() };

  let page = 1;
  let items = [];
  let total = 0;
  let summary = { income: 0, expense: 0 };
  let hasMore = false;
  let loading = false;
  const categories = await state.getCategories().catch(() => []);

  mount(
    root,
    html`
    <h1 style="margin-bottom:14px">Riwayat</h1>
    <div class="search-row">
      <label class="search"><span class="sr-only">Cari transaksi</span>${icon('search')}
        <input class="input" type="search" data-q enterkeyhint="search" autocomplete="off" placeholder="Cari catatan atau kategori…" value="${filters.q}"></label>
      <button class="filter-btn" type="button" data-filter aria-label="Filter transaksi">${icon('filter')}<span class="badge" data-badge hidden></span></button>
    </div>
    <div class="chip-row" data-tags style="margin-top:10px"></div>
    <div class="summary" data-summary></div>
    <div data-list>${skeleton(5, 64)}</div>
    <div data-more></div>
  `,
  );

  const listEl = root.querySelector('[data-list]');
  const moreEl = root.querySelector('[data-more]');
  const summaryEl = root.querySelector('[data-summary]');
  const tagsEl = root.querySelector('[data-tags]');
  const badgeEl = root.querySelector('[data-badge]');

  const params = () => ({
    q: filters.q.trim(),
    month: filters.from || filters.to ? '' : filters.month,
    type: filters.type,
    category: filters.category,
    minAmount: filters.minAmount,
    maxAmount: filters.maxAmount,
    from: filters.from,
    to: filters.to,
    page,
    limit: PAGE,
  });

  function drawTags() {
    const f = filters;
    const tags = [];
    if (f.month && !f.from && !f.to) tags.push(['month', f.month === monthKey() ? 'Bulan ini' : monthLabel(f.month)]);
    if (!f.month && !f.from && !f.to) tags.push(['month-all', 'Semua waktu']);
    if (f.type) tags.push(['type', f.type === 'income' ? 'Pemasukan' : 'Pengeluaran']);
    if (f.category) tags.push(['category', f.category]);
    if (f.minAmount) tags.push(['minAmount', `≥ ${rpShort(f.minAmount)}`]);
    if (f.maxAmount) tags.push(['maxAmount', `≤ ${rpShort(f.maxAmount)}`]);
    if (f.from || f.to) tags.push(['range', `${f.from || '…'} → ${f.to || '…'}`]);
    mount(
      tagsEl,
      html`${tags.map(
        ([k, label]) => html`<button class="chip" type="button" data-untag="${k}" aria-label="${k === 'month-all' ? 'Kembali ke bulan ini' : `Hapus filter ${label}`}">${label} ${icon(k === 'month-all' ? 'left' : 'x')}</button>`,
      )}`,
    );
    const n = activeCount();
    badgeEl.hidden = n === 0;
    badgeEl.textContent = n;
  }

  function drawList() {
    if (!items.length) {
      mount(
        listEl,
        emptyState({
          emoji: filters.q || activeCount() ? '🔍' : '📝',
          title: filters.q || activeCount() ? 'Nggak ada yang cocok' : 'Belum ada transaksi',
          text: filters.q || activeCount() ? 'Coba ubah kata kunci atau filter-nya ya.' : 'Yuk catat transaksi pertama kamu.',
          cta: filters.q || activeCount() ? '' : 'Catat sekarang',
          href: '#/add',
        }),
      );
    } else {
      mount(
        listEl,
        html`${group(items).map(
          (g) => html`<div class="day-head"><span>${g.label}</span>${g.spend ? html`<span class="num">−${rp(g.spend)}</span>` : ''}</div>
            <ul class="tx-list card" style="padding:4px 14px">${g.items.map(txRow)}</ul>`,
        )}`,
      );
    }
    mount(
      moreEl,
      hasMore
        ? html`<button class="btn btn-secondary btn-block load-more" type="button" data-more-btn>Muat lebih banyak (${total - items.length} lagi)</button>`
        : items.length > PAGE
          ? html`<p class="foot">Itu semua transaksinya ✨</p>`
          : '',
    );
    mount(
      summaryEl,
      html`<div class="in"><small>Pemasukan</small><b class="num">${rp(summary.income)}</b></div><div><small>Pengeluaran</small><b class="num">${rp(summary.expense)}</b></div>
        <p class="muted small" style="grid-column:1/-1;margin-top:-2px">${total} transaksi</p>`,
    );
  }

  async function load(reset) {
    if (loading) return;
    loading = true;
    if (reset) {
      page = 1;
      items = [];
      mount(listEl, skeleton(5, 64));
      moreEl.innerHTML = '';
    }
    try {
      const res = await api.get('/api/transactions', params());
      items = reset ? res.data : items.concat(res.data);
      total = res.total;
      summary = res.summary;
      hasMore = res.hasMore;
      drawTags();
      drawList();
    } catch (err) {
      mount(listEl, errorState(err.message));
    } finally {
      loading = false;
    }
  }

  const search = debounce(() => load(true), 350);
  root.querySelector('[data-q]').addEventListener('input', (e) => {
    filters.q = e.target.value;
    search();
  });
  on(root, 'click', '[data-retry]', () => load(true));
  on(root, 'click', '[data-more-btn]', async (e, btn) => {
    btn.classList.add('loading');
    page += 1;
    await load(false);
  });
  on(root, 'click', '[data-untag]', (e, btn) => {
    const k = btn.dataset.untag;
    if (k === 'month') filters.month = '';
    else if (k === 'month-all') filters.month = monthKey();
    else if (k === 'range') { filters.from = ''; filters.to = ''; }
    else filters[k] = '';
    load(true);
  });
  on(root, 'click', '[data-filter]', () => openFilters(categories, () => load(true)));

  load(true);
}

function openFilters(categories, apply) {
  const f = filters;
  const { el, close } = openSheet({
    title: 'Filter transaksi',
    body: html`
      <form data-ff novalidate>
        <label class="field"><span>Periode</span>
          <select class="input" name="month">
            <option value="" ${f.month === '' ? 'selected' : ''}>Semua waktu</option>
            ${monthOptions().map((m) => html`<option value="${m}" ${f.month === m ? 'selected' : ''}>${m === monthKey() ? `Bulan ini (${monthLabel(m)})` : monthLabel(m)}</option>`)}
          </select></label>
        <label class="field"><span>Tipe</span>
          <select class="input" name="type">
            <option value="" ${f.type === '' ? 'selected' : ''}>Semua</option>
            <option value="expense" ${f.type === 'expense' ? 'selected' : ''}>Pengeluaran</option>
            <option value="income" ${f.type === 'income' ? 'selected' : ''}>Pemasukan</option>
          </select></label>
        <label class="field"><span>Kategori</span>
          <select class="input" name="category">
            <option value="">Semua kategori</option>
            ${categories.map((c) => html`<option value="${c.name}" ${f.category === c.name ? 'selected' : ''}>${c.emoji} ${c.name}</option>`)}
          </select></label>
        <div class="grid-2">
          <label class="field"><span>Nominal min</span><input class="input" name="minAmount" inputmode="numeric" placeholder="0" value="${f.minAmount}"></label>
          <label class="field"><span>Nominal maks</span><input class="input" name="maxAmount" inputmode="numeric" placeholder="∞" value="${f.maxAmount}"></label>
        </div>
        <div class="grid-2">
          <label class="field"><span>Dari tanggal</span><input class="input" type="date" name="from" value="${f.from}"></label>
          <label class="field"><span>Sampai</span><input class="input" type="date" name="to" value="${f.to}"></label>
        </div>
        <p class="muted small" style="margin:8px 0 0">Kalau tanggal diisi, filter periode diabaikan.</p>
        <div class="sheet-actions">
          <button class="btn btn-secondary" type="button" data-reset>Reset</button>
          <button class="btn btn-primary" type="submit">Terapkan</button>
        </div>
      </form>`,
  });
  const form = el.querySelector('[data-ff]');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const num = (k) => String(d.get(k) || '').replace(/\D/g, '');
    filters = { ...filters, month: d.get('month'), type: d.get('type'), category: d.get('category'), minAmount: num('minAmount'), maxAmount: num('maxAmount'), from: d.get('from') || '', to: d.get('to') || '' };
    close();
    apply();
  });
  el.querySelector('[data-reset]').addEventListener('click', () => {
    filters = { ...defaults(), q: filters.q };
    close();
    apply();
  });
}

export const title = 'Riwayat';
