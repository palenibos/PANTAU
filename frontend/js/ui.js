// Komponen UI bersama. Semua template memakai html`` (auto-escape).
import { html, raw, rp, timeLabel, tierClass } from './utils.js';

export const icon = (name, cls = '') =>
  raw(`<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`);

// ---------- bottom sheet (pakai <dialog>: fokus, ESC & backdrop gratis) ----------
/**
 * @returns {{el: HTMLDialogElement, close: () => void}}
 */
export function openSheet({ title, body, onClose }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.setAttribute('aria-label', title);
  dlg.innerHTML = html`
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2>${title}</h2>
      <button class="icon-btn" type="button" data-sheet-close aria-label="Tutup">${icon('x')}</button>
    </div>
    <div class="sheet-body">${body}</div>
  `.s;
  document.body.append(dlg);
  const close = () => dlg.open && dlg.close();
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-sheet-close]')) close();
  });
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (onClose) onClose();
  });
  dlg.showModal();
  return { el: dlg, close };
}

/** Dialog konfirmasi. Resolve true bila user menekan tombol konfirmasi. */
export function confirmDialog({ title, message, confirmText = 'Ya', cancelText = 'Batal', danger = false, requireText }) {
  return new Promise((resolve) => {
    let result = false;
    const { el, close } = openSheet({
      title,
      onClose: () => resolve(result),
      body: html`
        <p>${message}</p>
        ${requireText
          ? html`<label class="field"><span>Ketik <b>${requireText}</b> untuk lanjut</span>
              <input class="input" data-confirm-text autocomplete="off" autocapitalize="characters" spellcheck="false"></label>`
          : ''}
        <div class="sheet-actions">
          <button class="btn btn-secondary" type="button" data-sheet-close>${cancelText}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-confirm ${requireText ? 'disabled' : ''}>${confirmText}</button>
        </div>`,
    });
    const ok = el.querySelector('[data-confirm]');
    const field = el.querySelector('[data-confirm-text]');
    if (field) field.addEventListener('input', () => { ok.disabled = field.value.trim() !== requireText; });
    ok.addEventListener('click', () => {
      result = true;
      close();
    });
  });
}

/** Tombol sibuk: nonaktifkan + spinner selama fn berjalan. */
export async function withBusy(btn, fn) {
  if (!btn || btn.classList.contains('loading')) return undefined;
  btn.classList.add('loading');
  try {
    return await fn();
  } finally {
    btn.classList.remove('loading');
  }
}

// ---------- potongan tampilan ----------
export const meter = (percent, tier = tierClass(percent), delay = 0) =>
  html`<div class="meter tier-${tier}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.round(percent))}"><i style="--w:${Math.min(100, percent)}%;--d:${delay}s"></i></div>`;

export const TIER_PILL = {
  0: { cls: 'good', icon: 'check', text: 'Aman' },
  1: { cls: 'warn', icon: 'up', text: 'Hati-hati' },
  2: { cls: 'warn', icon: 'up', text: 'Hampir habis' },
  3: { cls: 'bad', icon: 'up', text: 'Lewat budget' },
};
export const tierPill = (tier) => {
  const t = TIER_PILL[tier];
  return html`<span class="pill ${t.cls}">${icon(t.icon)}${t.text}</span>`;
};

export function txRow(t) {
  const income = t.type === 'income';
  const meta = [t.notes, timeLabel(t.date)].filter(Boolean).join(' · ');
  return html`<li><a class="tx" href="#/add?edit=${t._id}" aria-label="${t.category}, ${income ? 'pemasukan' : 'pengeluaran'} ${rp(t.amount)}. Ketuk untuk ubah">
    <span class="emoji" aria-hidden="true">${t.emoji}</span>
    <span class="t-main"><b>${t.category}</b><small>${meta}</small></span>
    <span class="t-amt num ${income ? 'in' : ''}">${income ? '+' : '−'}${rp(t.amount)}</span>
  </a></li>`;
}

export const emptyState = ({ emoji, title, text, cta, href }) => html`
  <div class="empty">
    <div class="big" aria-hidden="true">${emoji}</div>
    <h2>${title}</h2>
    <p>${text}</p>
    ${cta ? html`<a class="btn btn-primary" href="${href}">${cta}</a>` : ''}
  </div>`;

export const skeleton = (rows = 3, h = 56) =>
  raw(Array.from({ length: rows }, () => `<span class="sk" style="height:${h}px;margin-bottom:12px"></span>`).join(''));

export const errorState = (message, retryLabel = 'Coba lagi') => html`
  <div class="empty">
    <div class="big" aria-hidden="true">📡</div>
    <h2>Yah, gagal muat</h2>
    <p>${message}</p>
    <button class="btn btn-primary" type="button" data-retry>${retryLabel}</button>
  </div>`;

