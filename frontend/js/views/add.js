// Tambah / ubah transaksi.
import { api } from '../api.js';
import { html, rp, mount, on, parseAmount, bindMoneyInput, formatAmount, toLocalInput } from '../utils.js';
import { icon, confirmDialog, withBusy, errorState, skeleton } from '../ui.js';
import { toast, budgetAlert } from '../notifications.js';

const PRESETS = [
  [10_000, '+10rb'],
  [20_000, '+20rb'],
  [50_000, '+50rb'],
  [100_000, '+100rb'],
];

export async function render(ctx) {
  const { root, query, state, navigate } = ctx;
  const editId = query.get('edit');
  mount(root, html`<span class="sk" style="height:40px;width:60%;margin-bottom:20px"></span>${skeleton(4, 64)}`);

  let tx = null;
  let categories;
  try {
    categories = await state.getCategories();
    if (editId) tx = (await api.get(`/api/transactions/${editId}`)).data;
  } catch (err) {
    mount(root, errorState(err.status === 404 ? 'Transaksi ini udah nggak ada.' : err.message));
    on(root, 'click', '[data-retry]', () => ctx.reload());
    return;
  }

  let type = tx ? tx.type : query.get('type') === 'income' ? 'income' : 'expense';
  let category = tx ? tx.category : query.get('cat') || '';
  let amount = tx ? tx.amount : 0;
  let dateTouched = false;

  const catsFor = (t) => categories.filter((c) => (t === 'income' ? c.type === 'income' : c.type !== 'income'));
  if (category && !catsFor(type).some((c) => c.name === category)) category = '';

  mount(
    root,
    html`
    <header class="screen-head">
      <button class="icon-btn" type="button" data-back aria-label="Kembali">${icon('left')}</button>
      <h1>${tx ? 'Ubah transaksi' : 'Catat transaksi'}</h1>
    </header>

    <form novalidate data-form>
      <div class="segmented" role="group" aria-label="Jenis transaksi">
        <button type="button" data-type="expense" aria-pressed="${type === 'expense'}">Pengeluaran</button>
        <button type="button" data-type="income" aria-pressed="${type === 'income'}">Pemasukan</button>
      </div>

      <label class="amount-field" for="amount">
        <span class="prefix" aria-hidden="true">Rp</span>
        <input id="amount" name="amount" inputmode="numeric" pattern="[0-9.]*" autocomplete="off" placeholder="0" aria-label="Nominal dalam Rupiah" aria-describedby="amount-err" value="${formatAmount(amount)}" maxlength="15">
        <button class="clear" type="button" data-clear aria-label="Kosongkan nominal" ${amount ? '' : 'hidden'}>${icon('x')}</button>
      </label>
      <div class="presets" role="group" aria-label="Tambah nominal cepat">
        ${PRESETS.map(([v, label]) => html`<button class="chip" type="button" data-add="${v}">${label}</button>`)}
      </div>
      <p class="err" id="amount-err" role="alert" data-err="amount"></p>

      <fieldset class="cat-grid" role="radiogroup" aria-label="Kategori" data-cats></fieldset>
      <p class="err" role="alert" data-err="category"></p>

      <label class="field"><span>Catatan (opsional)</span>
        <input class="input" id="notes" name="notes" maxlength="200" autocomplete="off" placeholder="mis. kopi susu gula aren" value="${tx ? tx.notes : ''}"></label>
      <label class="field"><span>Waktu</span>
        <input class="input" id="date" name="date" type="datetime-local" max="${toLocalInput(new Date(Date.now() + 86_400_000))}" value="${toLocalInput(tx ? new Date(tx.date) : new Date())}"></label>

      <div class="form-error" role="alert" data-form-error hidden></div>
      <div class="form-actions">
        <button class="btn btn-primary btn-lg btn-block" type="submit" data-submit>${tx ? 'Simpan perubahan' : 'Simpan transaksi'}</button>
        ${tx ? html`<button class="btn btn-danger-ghost btn-block" type="button" data-delete>${icon('trash')} Hapus transaksi</button>` : ''}
      </div>
    </form>
  `,
  );

  const amountEl = root.querySelector('#amount');
  const catsEl = root.querySelector('[data-cats]');
  const formErr = root.querySelector('[data-form-error]');
  const fieldErr = (name, msg = '') => {
    root.querySelector(`[data-err="${name}"]`).textContent = msg;
    if (name === 'amount') amountEl.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };

  const drawCats = () => {
    mount(
      catsEl,
      html`<legend>Kategori</legend>${catsFor(type).map(
        (c) => html`<button class="cat" type="button" role="radio" aria-checked="${c.name === category}" data-cat="${c.name}">
          <span class="e" aria-hidden="true">${c.emoji}</span><span class="n">${c.name}</span></button>`,
      )}`,
    );
  };
  drawCats();

  const clearBtn = root.querySelector('[data-clear]');
  const syncClear = () => { clearBtn.hidden = !amount; };
  bindMoneyInput(amountEl, (n) => {
    amount = n;
    if (n > 0) fieldErr('amount');
    syncClear();
  });

  on(root, 'click', '[data-back]', () => (history.length > 1 ? history.back() : navigate('#/')));
  on(root, 'click', '[data-type]', (e, btn) => {
    type = btn.dataset.type;
    root.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    if (!catsFor(type).some((c) => c.name === category)) category = '';
    drawCats();
  });
  on(root, 'click', '[data-cat]', (e, btn) => {
    category = btn.dataset.cat;
    fieldErr('category');
    drawCats();
    catsEl.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
  });
  on(root, 'click', '[data-add]', (e, btn) => {
    amount = Math.min(99_999_999_999, amount + Number(btn.dataset.add));
    amountEl.value = formatAmount(amount);
    fieldErr('amount');
    syncClear();
  });
  on(root, 'click', '[data-clear]', () => {
    amount = 0;
    amountEl.value = '';
    syncClear();
    amountEl.focus();
  });
  root.querySelector('#date').addEventListener('input', () => { dateTouched = true; });

  root.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    formErr.hidden = true;
    amount = parseAmount(amountEl.value);
    let ok = true;
    if (!(amount > 0)) { fieldErr('amount', 'Isi nominalnya dulu ya 💸'); amountEl.focus(); ok = false; }
    if (!category) { fieldErr('category', 'Pilih kategorinya dulu ya'); if (ok) catsEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); ok = false; }
    if (!ok) return;

    const body = { type, category, amount, notes: root.querySelector('#notes').value.trim() };
    const dateVal = root.querySelector('#date').value;
    // Edit: kirim tanggal hanya bila diubah. Baru: kosongkan agar server memakai waktu saat submit.
    if (dateVal && dateTouched) body.date = new Date(dateVal).toISOString();

    await withBusy(e.submitter || root.querySelector('[data-submit]'), async () => {
      try {
        const res = tx ? await api.put(`/api/transactions/${tx._id}`, body) : await api.post('/api/transactions', body);
        toast.success(`${res.data.emoji} ${type === 'income' ? '+' : '−'}${rp(amount)} · ${res.message}`);
        (res.alerts || []).forEach((a, i) => budgetAlert(a, 600 + i * 400));
        navigate(tx ? '#/history' : '#/');
      } catch (err) {
        formErr.textContent = err.message;
        formErr.hidden = false;
      }
    });
  });

  if (tx) {
    on(root, 'click', '[data-delete]', async (e, btn) => {
      const yes = await confirmDialog({
        title: 'Hapus transaksi ini?',
        message: `${tx.emoji} ${tx.category} · ${rp(tx.amount)}${tx.notes ? ` · ${tx.notes}` : ''}. Yang udah dihapus nggak bisa dibalikin ya.`,
        confirmText: 'Ya, hapus',
        danger: true,
      });
      if (!yes) return;
      await withBusy(btn, async () => {
        try {
          await api.del(`/api/transactions/${tx._id}`);
          toast.success('Transaksi dihapus 🗑️');
          navigate('#/history');
        } catch (err) {
          toast.error(err.message);
        }
      });
    });
  } else if (!amount) {
    // Form baru: langsung siap ngetik nominal (keyboard angka muncul).
    setTimeout(() => amountEl.focus({ preventScroll: true }), 150);
  }
}

export const title = 'Catat transaksi';
