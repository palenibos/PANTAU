// Pengaturan: profil, tampilan & notifikasi, budget, kategori, ekspor, reset, keluar.
import { api, session } from '../api.js';
import { html, mount, on, parseAmount, bindMoneyInput, formatAmount, initial, dayKey } from '../utils.js';
import { icon, openSheet, confirmDialog, withBusy, errorState, skeleton } from '../ui.js';
import { toast } from '../notifications.js';

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
    on(root, 'click', '[data-retry]', () => render(ctx));
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
      <p class="muted small" style="margin-top:10px">Kosongkan atau isi 0 kalau nggak mau pakai budget di kategori itu. Tersimpan otomatis.</p>
    </section>

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

  // ---- budget (tersimpan saat selesai mengetik) ----
  const monthly = root.querySelector('[data-monthly]');
  bindMoneyInput(monthly);
  monthly.addEventListener('change', () => patch({ monthlyBudget: parseAmount(monthly.value) }, 'Budget bulanan disimpan ✅'));
  root.querySelectorAll('[data-budget]').forEach((input) => {
    bindMoneyInput(input);
    input.addEventListener('change', async () => {
      try {
        await api.put(`/api/settings/budget/${input.dataset.budget}`, { budgetLimit: parseAmount(input.value) });
        state.invalidateCategories();
        toast.success(`Budget ${input.dataset.name} disimpan ✅`);
      } catch (err) {
        toast.error(err.message);
      }
    });
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.money-input input')) e.target.blur();
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
          render(ctx);
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
          render(ctx);
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
          render(ctx);
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
