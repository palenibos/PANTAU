// Layar login / daftar.
import { api } from './api.js';
import { html, on } from './utils.js';
import { withBusy } from './ui.js';
import { toast } from './notifications.js';

const DEMO = { email: 'email@test.com', password: 'password123' };

export function renderAuth(root, { onSuccess, mode: initialMode = 'login' }) {
  let mode = initialMode;

  const view = () => {
    const reg = mode === 'register';
    root.innerHTML = html`
      <main class="auth">
        <img class="logo" src="/icons/icon.svg" alt="" width="72" height="72">
        <h1>PANTAU</h1>
        <p class="tagline"><b>P</b>antau <b>A</b>set <b>N</b>abung <b>T</b>erus <b>A</b>tur <b>U</b>ang — biar nggak kalap lagi 😎</p>

        <form class="card" novalidate data-form>
          <h2>${reg ? 'Bikin akun baru' : 'Masuk dulu yuk'}</h2>
          ${reg ? html`<label class="field"><span>Nama panggilan</span>
            <input class="input" name="name" autocomplete="name" maxlength="60" placeholder="mis. Raka" required></label>` : ''}
          <label class="field"><span>Email</span>
            <input class="input" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="kamu@email.com" required></label>
          <label class="field"><span>Password</span>
            <input class="input" name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" minlength="8" maxlength="72" placeholder="${reg ? 'Minimal 8 karakter' : 'Password kamu'}" required></label>
          <div class="form-error" role="alert" data-error hidden></div>
          <button class="btn btn-primary btn-lg btn-block" type="submit" style="margin-top:18px">${reg ? 'Daftar & mulai' : 'Masuk'}</button>
          <p class="auth-switch">${reg ? 'Udah punya akun?' : 'Belum punya akun?'}
            <button type="button" data-switch>${reg ? 'Masuk' : 'Daftar'}</button></p>
        </form>

        ${reg ? '' : html`<div data-demo-slot></div>`}
      </main>`.s;
    drawDemo();
  };

  // Kotak "Coba akun demo" hanya tampil bila server mengizinkan (development/demo). Diisi tanpa merender ulang
  // formulir supaya ketikan user tidak hilang.
  let demoEnabled = false;
  const drawDemo = () => {
    const slot = root.querySelector('[data-demo-slot]');
    if (!slot) return;
    slot.innerHTML = demoEnabled
      ? html`<div class="demo-box">
          <b>Mau lihat dulu?</b> Coba akun demo (sudah ada data 3 bulan).
          <button class="btn btn-secondary btn-block" type="button" data-demo>Coba akun demo</button>
        </div>`.s
      : '';
  };
  api.config().then((c) => { demoEnabled = Boolean(c && c.demo); drawDemo(); }).catch(() => {});

  const showError = (msg) => {
    const box = root.querySelector('[data-error]');
    box.textContent = msg;
    box.hidden = !msg;
  };

  async function submit(btn, creds) {
    showError('');
    await withBusy(btn, async () => {
      try {
        const d = mode === 'register' ? await api.register(creds.name, creds.email, creds.password) : await api.login(creds.email, creds.password);
        toast.success(d.message);
        onSuccess(d);
      } catch (err) {
        showError(err.message);
      }
    });
  }

  root.onsubmit = (e) => {
    if (!e.target.matches('[data-form]')) return;
    e.preventDefault();
    const f = new FormData(e.target);
    const creds = { name: (f.get('name') || '').trim(), email: (f.get('email') || '').trim(), password: f.get('password') || '' };
    if (mode === 'register' && !creds.name) return showError('Nama panggilannya diisi dulu ya');
    if (!creds.email || !creds.password) return showError('Email & password wajib diisi');
    return submit(e.target.querySelector('[type=submit]'), creds);
  };
  on(root, 'click', '[data-switch]', () => {
    mode = mode === 'login' ? 'register' : 'login';
    view();
    root.querySelector('input').focus();
  });
  on(root, 'click', '[data-demo]', (e, btn) => {
    mode = 'login';
    submit(btn, DEMO);
  });

  view();
}
