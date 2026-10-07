// Pengaturan: profil, tampilan & notifikasi, budget, kategori, ekspor, reset, keluar.
import { api, session } from '../api.js';
import { html, mount, on, parseAmount, bindMoneyInput, formatAmount, initial, dayKey } from '../utils.js';
import { icon, openSheet, confirmDialog, withBusy, errorState, skeleton } from '../ui.js';
import { toast } from '../notifications.js';

const isTextFieldFocused = () => document.activeElement && document.activeElement.matches && document.activeElement.matches('input, textarea, select');

const EMOJI_PICKS = ['🍜', '🧋', '🍕', '🥗', '🛒', '👕', '💄', '📱', '🏠', '💡', '🚗', '⛽', '✈️', '🏋️', '🎁', '💊', '📚', '🐱', '🎬', '🎧', '💼', '💻', '📈', '🪙'];

const toggleRow = (id, label, hint, checked, disabled = false) => html`
  <div class="row">
    <label class="r-main" for="${id}"><b>${label}</b><small>${hint}</small></label>
    <span class="switch"><input type="checkbox" role="switch" id="${id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="track"></span></span>
  </div>`;

export async function render(ctx) {
  const { root, state, navigate } = ctx;
  mount(root, html`<h1 style="margin-bottom:14px">Pengaturan</h1>${skeleton(4, 120)}`);

  let settings;
  let categories;
  try {
    [{ data: settings }, categories] = await Promise.all([api.get('/api/settings'), state.getCategories(true)]);
  } catch (err) {
    mount(root, errorState(err.message));
    on(root, 'click', '[data-retry]', () => ctx.reload());
    return;
  }

  const expense = categories.filter((c) => c.type !== 'income');
  const budgeted = expense.filter((c) => !c.isSaving);
  const income = categories.filter((c) => c.type === 'income');
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';

  const catRow = (c) => html`<div class="cat-edit">
    <span class="emoji" aria-hidden="true">${c.emoji}</span>
    <div class="cn"><b>${c.name}</b><small>${c.type === 'income' ? 'Pemasukan' : c.isSaving ? 'Tabungan' : 'Pengeluaran'}${c.isDefault ? ' · bawaan' : ''}</small></div>
    <button class="icon-btn" type="button" data-edit-cat="${c._id}" aria-label="Ubah kategori ${c.name}">${icon('edit')}</button>
  </div>`;

  mount(
    root,
    html`
    <h1 style="margin-bottom:14px">Pengaturan</h1>

    <section class="card profile">
      <span class="avatar" aria-hidden="true">${initial(settings.name)}</span>
      <div style="flex:1"><b>${settings.name}</b><small class="muted">${settings.email}</small></div>
      <button class="icon-btn" type="button" data-edit-name aria-label="Ubah nama">${icon('edit')}</button>
    </section>

    <div class="sec-head"><h2>Tampilan & notifikasi</h2></div>
    <section class="card" style="padding-top:6px;padding-bottom:6px">
      ${toggleRow('t-dark', 'Mode gelap', 'Lebih nyaman di mata pas malam', dark)}
      ${toggleRow('t-notif', 'Pengingat budget', 'Notifikasi saat budget kategori 60%, 80%, dan 100%', settings.notificationEnabled)}
      ${toggleRow('t-weekly', 'Ringkasan & laporan', 'Ringkasan tiap Minggu 19:00 dan laporan akhir bulan 20:00', settings.weeklyDigest, !settings.notificationEnabled)}
    </section>

    <div class="sec-head"><h2>Budget</h2></div>
    <form id="budget-form" novalidate data-budget-form>
    <section class="card">
      <div class="bud">
        <div class="bn">Budget bulanan total<small>Batas semua pengeluaran per bulan</small></div>
        <label class="money-input"><span>Rp</span><input inputmode="numeric" data-monthly aria-label="Budget bulanan total" enterkeyhint="done" value="${formatAmount(settings.monthlyBudget)}" placeholder="0"></label>
      </div>
      ${budgeted.map((c) => html`<div class="bud">
        <span class="emoji" aria-hidden="true">${c.emoji}</span>
        <div class="bn">${c.name}<small>per bulan</small></div>
        <label class="money-input"><span>Rp</span><input inputmode="numeric" data-budget="${c._id}" data-name="${c.name}" aria-label="Budget ${c.name}" enterkeyhint="done" value="${formatAmount(c.budgetLimit)}" placeholder="tanpa"></label>
      </div>`)}
      <p class="muted small" style="margin-top:10px">Kosongkan atau isi 0 kalau nggak mau pakai budget di kategori itu. Setelah selesai mengubah, ketuk <b>Simpan</b>.</p>
    </section>
    </form>

    <div class="sec-head"><h2>Kategori</h2><button class="link" type="button" data-add-cat>+ Tambah</button></div>
    <section class="card" style="padding-top:6px;padding-bottom:6px">
      ${expense.map(catRow)}${income.map(catRow)}
    </section>

    <div class="sec-head"><h2>Data</h2></div>
    <section class="card">
      <div class="row"><div class="r-main"><b>Ekspor data</b><small>Unduh semua transaksi kamu</small></div>
        <div class="chip-row"><button class="chip" type="button" data-export="csv">${icon('download')}CSV</button><button class="chip" type="button" data-export="json">${icon('download')}JSON</button></div></div>
    </section>
    <section class="card danger-zone">
      <div class="row"><div class="r-main"><b>Reset data</b><small>Hapus semua transaksi & kembalikan kategori ke bawaan</small></div>
        <button class="btn btn-danger-ghost" type="button" data-reset>Reset</button></div>
    </section>

    <button class="btn btn-secondary btn-block" type="button" data-logout style="margin-top:16px">${icon('logout')} Keluar</button>
    <p class="foot">PANTAU v1.0 · dibuat biar kamu nggak kalap 💸</p>

    <div class="save-bar" data-save-bar hidden role="region" aria-label="Perubahan budget belum disimpan">
      <button class="btn btn-secondary" type="button" data-save-cancel>Batal</button>
      <button class="btn btn-primary" type="submit" form="budget-form" data-save-btn>Simpan perubahan</button>
    </div>
  `,
  );

  // ---- toggle ----
  const patch = async (body, okMsg) => {
    try {
      const res = await api.put('/api/settings', body);
      if (okMsg) toast.success(okMsg);
      return res.data;
    } catch (err) {
      toast.error(err.message);
      return null;
    }
  };
  root.querySelector('#t-dark').addEventListener('change', (e) => {
    state.setTheme(e.target.checked ? 'dark' : 'light');
    patch({ darkMode: e.target.checked });
  });
  root.querySelector('#t-notif').addEventListener('change', async (e) => {
    const d = await patch({ notificationEnabled: e.target.checked }, e.target.checked ? 'Pengingat budget nyala 🔔' : 'Pengingat budget dimatikan 🔕');
    if (!d) e.target.checked = !e.target.checked;
    else root.querySelector('#t-weekly').disabled = !d.notificationEnabled;
  });
  root.querySelector('#t-weekly').addEventListener('change', async (e) => {
    const d = await patch({ weeklyDigest: e.target.checked }, e.target.checked ? 'Ringkasan mingguan nyala 📅' : 'Ringkasan mingguan dimatikan');
    if (!d) e.target.checked = !e.target.checked;
  });

  // ---- budget: simpan EKSPLISIT lewat tombol (bukan lewat blur) ----
  // Di iPhone, keypad angka tidak punya tombol Enter dan mengetuk area kosong tidak melepas fokus, jadi
  // event "change" (yang butuh blur) tidak pernah terpicu. Tombol Simpan tidak bergantung pada itu.
  const fields = [...root.querySelectorAll('[data-monthly], [data-budget]')];
  const keyOf = (f) => (f.hasAttribute('data-monthly') ? 'monthly' : f.dataset.budget);
  const initialOf = new Map(fields.map((f) => [f, parseAmount(f.value)]));
  const isDirty = (f) => parseAmount(f.value) !== initialOf.get(f);
  const saveBar = root.querySelector('[data-save-bar]');
  const saveBtn = root.querySelector('[data-save-btn]');

  const refresh = () => {
    const n = fields.filter(isDirty).length;
    fields.forEach((f) => f.closest('.money-input').classList.toggle('dirty', isDirty(f)));
    saveBar.hidden = n === 0;
    root.classList.toggle('has-save-bar', n > 0);
    if (!saveBtn.classList.contains('loading')) saveBtn.textContent = n > 1 ? `Simpan ${n} perubahan` : 'Simpan perubahan';
  };
  state.unsaved = () => fields.some(isDirty); // dibaca app.js untuk menahan navigasi

  // Render ulang (mis. setelah ubah kategori) tidak boleh membuang angka yang sedang diketik.
  const reload = () => {
    const pending = {};
    fields.forEach((f) => { if (isDirty(f)) pending[keyOf(f)] = f.value; });
    state.pendingEdits = Object.keys(pending).length ? pending : null;
    return ctx.reload();
  };
  if (state.pendingEdits) {
    fields.forEach((f) => { const k = keyOf(f); if (k in state.pendingEdits) f.value = state.pendingEdits[k]; });
    state.pendingEdits = null;
  }

  fields.forEach((f) => bindMoneyInput(f, refresh));
  refresh();

  root.querySelector('[data-save-cancel]').addEventListener('click', () => {
    fields.forEach((f) => { f.value = formatAmount(initialOf.get(f)); });
    refresh();
  });

  root.querySelector('[data-budget-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const changed = fields.filter(isDirty);
    if (!changed.length) return;
    if (isTextFieldFocused()) document.activeElement.blur(); // tutup keyboard
    await withBusy(saveBtn, async () => {
      const results = await Promise.allSettled(
        changed.map(async (f) => {
          const value = parseAmount(f.value);
          if (f.hasAttribute('data-monthly')) {
            await api.put('/api/settings', { monthlyBudget: value });
            settings.monthlyBudget = value;
          } else {
            await api.put(`/api/settings/budget/${f.dataset.budget}`, { budgetLimit: value });
            // `categories` dipakai lagi oleh sheet "Ubah kategori": harus ikut diperbarui,
            // kalau tidak, menyimpan sheet itu mengembalikan budget ke angka lama.
            const cat = categories.find((c) => c._id === f.dataset.budget);
            if (cat) cat.budgetLimit = value;
          }
          initialOf.set(f, value);
        }),
      );
      const failed = results.map((r, i) => ({ r, f: changed[i] })).filter(({ r }) => r.status === 'rejected');
      const savedCount = changed.length - failed.length;
      if (savedCount) {
        state.invalidateCategories();
        const only = changed.find((f) => initialOf.get(f) === parseAmount(f.value));
        toast.success(savedCount === 1 && only ? `Budget ${only.dataset.name || 'bulanan'} disimpan ✅` : `${savedCount} budget disimpan ✅`);
      }
      if (failed.length) toast.error(`${failed.length} budget gagal disimpan: ${failed[0].r.reason.message}`);
      refresh();
    });
    refresh();
  });

  // ---- profil ----
  on(root, 'click', '[data-edit-name]', () => {
    const { el, close } = openSheet({
      title: 'Ubah nama',
      body: html`<form data-nf novalidate><label class="field"><span>Nama panggilan</span><input class="input" name="name" maxlength="60" value="${settings.name}" autocomplete="name"></label>
        <div class="form-error" role="alert" data-ferr hidden></div>
        <div class="sheet-actions"><button class="btn btn-secondary" type="button" data-sheet-close>Batal</button><button class="btn btn-primary" type="submit">Simpan</button></div></form>`,
    });
    el.querySelector('[data-nf]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = new FormData(e.target).get('name').trim();
      if (!name) return;
      await withBusy(e.submitter, async () => {
        const d = await patch({ name }, 'Nama diperbarui ✅');
        if (d) {
          session.setUser({ ...session.user, name: d.name });
          close();
          reload();
        }
      });
    });
  });

  // ---- kategori ----
  const categorySheet = (cat) => {
    const editing = Boolean(cat);
    let type = cat ? cat.type : 'expense';
    const { el, close } = openSheet({
      title: editing ? 'Ubah kategori' : 'Kategori baru',
      body: html`<form data-cf novalidate>
        ${editing ? '' : html`<div class="segmented" role="group" aria-label="Jenis kategori">
          <button type="button" data-ctype="expense" aria-pressed="true">Pengeluaran</button>
          <button type="button" data-ctype="income" aria-pressed="false">Pemasukan</button></div>`}
        <label class="field"><span>Emoji</span><input class="input" name="emoji" maxlength="16" value="${cat ? cat.emoji : '📌'}" aria-describedby="emoji-help" autocomplete="off"></label>
        <p class="muted small" id="emoji-help" style="margin-top:6px">Pilih di bawah atau ketik pakai keyboard emoji.</p>
        <div class="emoji-picks" role="group" aria-label="Pilihan emoji">${EMOJI_PICKS.map((e) => html`<button type="button" data-pick="${e}" aria-label="Emoji ${e}">${e}</button>`)}</div>
        <label class="field"><span>Nama kategori</span><input class="input" name="name" maxlength="30" value="${cat ? cat.name : ''}" placeholder="mis. Skincare" autocomplete="off"></label>
        <div data-expense-only ${type === 'income' ? 'hidden' : ''}>
          <div class="row" style="margin-top:6px"><label class="r-main" for="c-saving"><b>Hitung sebagai tabungan</b><small>Bukan pengeluaran & nggak kena budget</small></label>
            <span class="switch"><input type="checkbox" role="switch" id="c-saving" name="isSaving" ${cat && cat.isSaving ? 'checked' : ''}><span class="track"></span></span></div>
          <label class="field" data-budget-field><span>Budget per bulan (opsional)</span>
            <span class="money-input" style="width:100%"><span>Rp</span><input name="budgetLimit" inputmode="numeric" value="${cat ? formatAmount(cat.budgetLimit) : ''}" placeholder="tanpa budget"></span></label>
        </div>
        <div class="form-error" role="alert" data-ferr hidden></div>
        <div class="sheet-actions ${editing ? '' : 'one'}">
          ${editing ? html`<button class="btn btn-danger-ghost" type="button" data-del-cat>${icon('trash')} Hapus</button>` : ''}
          <button class="btn btn-primary" type="submit">${editing ? 'Simpan' : 'Tambah kategori'}</button>
        </div></form>`,
    });
    const form = el.querySelector('[data-cf]');
    const err = el.querySelector('[data-ferr]');
    const expenseOnly = el.querySelector('[data-expense-only]');
    const budgetField = el.querySelector('[data-budget-field]');
    bindMoneyInput(form.elements.budgetLimit);
    const syncSaving = () => { budgetField.hidden = form.elements.isSaving.checked; };
    form.elements.isSaving.addEventListener('change', syncSaving);
    syncSaving();
    on(el, 'click', '[data-pick]', (e, btn) => { form.elements.emoji.value = btn.dataset.pick; });
    on(el, 'click', '[data-ctype]', (e, btn) => {
      type = btn.dataset.ctype;
      el.querySelectorAll('[data-ctype]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      expenseOnly.hidden = type === 'income';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      const f = form.elements;
      const body = { name: f.name.value.trim(), emoji: f.emoji.value.trim() };
      if (!body.name) { err.textContent = 'Nama kategorinya diisi dulu ya'; err.hidden = false; return; }
      if (type === 'expense') {
        body.isSaving = f.isSaving.checked;
        body.budgetLimit = body.isSaving ? 0 : parseAmount(f.budgetLimit.value);
      }
      if (!editing) body.type = type;
      await withBusy(e.submitter, async () => {
        try {
          if (editing) await api.put(`/api/categories/${cat._id}`, body);
          else await api.post('/api/categories', body);
          state.invalidateCategories();
          toast.success(editing ? 'Kategori diperbarui ✅' : 'Kategori ditambahkan ✨');
          close();
          reload();
        } catch (e2) {
          err.textContent = e2.message;
          err.hidden = false;
        }
      });
    });

    if (editing) {
      el.querySelector('[data-del-cat]').addEventListener('click', async (e) => {
        const yes = await confirmDialog({ title: `Hapus "${cat.name}"?`, message: 'Kategori yang sudah dipakai di transaksi nggak bisa dihapus.', confirmText: 'Hapus', danger: true });
        if (!yes) return;
        try {
          await api.del(`/api/categories/${cat._id}`);
          state.invalidateCategories();
          toast.success('Kategori dihapus 🗑️');
          close();
          reload();
        } catch (e2) {
          toast.error(e2.message);
        }
      });
    }
  };
  on(root, 'click', '[data-add-cat]', () => categorySheet(null));
  on(root, 'click', '[data-edit-cat]', (e, btn) => categorySheet(categories.find((c) => c._id === btn.dataset.editCat)));

  // ---- data ----
  on(root, 'click', '[data-export]', (e, btn) =>
    withBusy(btn, async () => {
      const fmt = btn.dataset.export;
      try {
        await api.download(`/api/settings/export?format=${fmt}`, `pantau-${dayKey()}.${fmt}`);
        toast.success(`Ekspor ${fmt.toUpperCase()} selesai 📥`);
      } catch (err) {
        toast.error(err.message);
      }
    }));
  on(root, 'click', '[data-reset]', async () => {
    const yes = await confirmDialog({
      title: 'Reset semua data?',
      message: 'Semua transaksi, notifikasi, dan analisis akan dihapus permanen, dan kategori dikembalikan ke bawaan. Ini nggak bisa dibatalkan.',
      confirmText: 'Reset sekarang',
      danger: true,
      requireText: 'RESET',
    });
    if (!yes) return;
    try {
      await api.del('/api/settings/data', { confirm: 'RESET' });
      state.invalidateCategories();
      toast.success('Data direset. Lembaran baru! 🌱');
      navigate('#/');
    } catch (err) {
      toast.error(err.message);
    }
  });

  on(root, 'click', '[data-logout]', async () => {
    const yes = await confirmDialog({ title: 'Keluar dari PANTAU?', message: 'Kamu bisa login lagi kapan aja.', confirmText: 'Keluar' });
    if (yes) state.logout();
  });
}

export const title = 'Pengaturan';
