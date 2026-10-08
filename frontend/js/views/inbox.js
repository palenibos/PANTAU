// Kotak notifikasi: alert budget, ringkasan mingguan, laporan bulanan.
import { api } from '../api.js';
import { html, mount, on, relativeTime } from '../utils.js';
import { icon, emptyState, errorState, skeleton } from '../ui.js';

const kindClass = (n) => (n.kind === 'budget' ? `k-t${n.tier}` : `k-${n.kind}`);

function target(n) {
  if (n.kind === 'weekly') return '#/report?tab=weekly';
  if (n.kind === 'monthly') return `#/report?month=${n.data && n.data.month ? n.data.month : ''}`;
  if (n.kind === 'budget' && n.data && n.data.category) return `#/history?category=${encodeURIComponent(n.data.category)}&month=${n.data.month || ''}`;
  return '#/';
}

export async function render(ctx) {
  const { root, state } = ctx;
  mount(
    root,
    html`<header class="screen-head"><button class="icon-btn" type="button" data-back aria-label="Kembali">${icon('left')}</button><h1>Notifikasi</h1></header>${skeleton(4, 88)}`,
  );
  on(root, 'click', '[data-back]', () => (history.length > 1 ? history.back() : (location.hash = '#/')));

  let res;
  try {
    res = await api.get('/api/notifications', { limit: 50 });
  } catch (err) {
    mount(root, html`<header class="screen-head"><h1>Notifikasi</h1></header>${errorState(err.message)}`);
    on(root, 'click', '[data-retry]', () => (ctx.reload ? ctx.reload() : location.reload()));
    return;
  }

  mount(
    root,
    html`
    <header class="screen-head"><button class="icon-btn" type="button" data-back aria-label="Kembali">${icon('left')}</button><h1>Notifikasi</h1></header>
    ${res.data.length
      ? res.data.map((n) => html`<a class="notif ${kindClass(n)} ${n.read ? '' : 'unread'}" href="${target(n)}" style="color:inherit">
          <span class="n-e" aria-hidden="true">${n.emoji}</span>
          <div class="n-main"><b>${n.title}</b><p>${n.message}</p><small>${relativeTime(n.createdAt)}${n.read ? '' : ' · baru'}</small></div>
        </a>`)
      : emptyState({ emoji: '🔕', title: 'Belum ada notifikasi', text: 'Pengingat budget, ringkasan mingguan, dan laporan bulanan bakal muncul di sini.' })}
  `,
  );

  // Tampilan menyimpan penanda "baru" selama dibuka; di server langsung ditandai terbaca.
  if (res.unread > 0) {
    api.put('/api/notifications/read').then(() => state.setUnread(0)).catch(() => {});
  }
}

export const title = 'Notifikasi';
