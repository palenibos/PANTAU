// Grafik (Chart.js, dimuat lazy hanya saat halaman Laporan dibuka supaya dashboard tetap ringan di 3G).
//
// Pilihan bentuk (lihat docs di README): 11+ kategori = bar horizontal satu hue dengan penekanan
// pada top 3 — bukan pie berwarna-warni yang sulit dibedakan (apalagi untuk buta warna).
// Perbandingan bulan = dua shade satu hue (muted = bulan lalu, solid = bulan ini).
import { rp, rpShort } from './utils.js';

let loading;
const registry = new Set();

export function loadChart() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/chart.umd.min.js';
      s.onload = () => resolve(window.Chart);
      s.onerror = () => {
        loading = null;
        reject(new Error('Gagal memuat library grafik'));
      };
      document.head.append(s);
    });
  }
  return loading;
}

// Label sumbu Y: potong nama panjang (nama lengkap tetap ada di tooltip & tabel).
const trunc = (name, max = 13) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);
const axisLabel = (i) => `${i.emoji} ${trunc(i.category)}`;
const fullTitle = (items) => (ctx) => {
  const item = items[ctx[0].dataIndex];
  return `${item.emoji} ${item.category}`;
};

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function theme() {
  return {
    ink: css('--fg-secondary'),
    inkStrong: css('--fg-primary'),
    grid: css('--card-border'),
    mark: css('--mark'),
    muted: css('--mark-muted'),
    surface: css('--bg-secondary'),
    font: getComputedStyle(document.body).fontFamily,
    reduce: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

// Plugin kecil: tulis nilai di ujung bar (direct label), tanpa library tambahan.
const valueLabels = (t, only) => ({
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = `700 12px ${t.font}`;
    ctx.fillStyle = t.inkStrong;
    ctx.textBaseline = 'middle';
    chart.data.datasets.forEach((ds, di) => {
      if (only != null && di !== only) return;
      chart.getDatasetMeta(di).data.forEach((bar, i) => {
        const v = ds.data[i];
        if (v > 0) ctx.fillText(rpShort(v), bar.x + 6, bar.y);
      });
    });
    ctx.restore();
  },
});

function mountChart(canvas, config) {
  const chart = new window.Chart(canvas, config);
  registry.add(chart);
  return chart;
}

export function destroyCharts() {
  registry.forEach((c) => c.destroy());
  registry.clear();
}

/** Bar horizontal: pengeluaran per kategori. Top `emphasis` bar solid, sisanya muted. */
export async function categoryBars(canvas, items, { emphasis = 3 } = {}) {
  await loadChart();
  const t = theme();
  return mountChart(canvas, {
    type: 'bar',
    data: {
      labels: items.map(axisLabel),
      datasets: [
        {
          data: items.map((i) => i.amount),
          backgroundColor: items.map((_, idx) => (idx < emphasis ? t.mark : t.muted)),
          borderRadius: 4,
          borderSkipped: 'start',
          barThickness: 16,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: t.reduce ? false : { duration: 700 },
      layout: { padding: { right: 62, left: 14 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: fullTitle(items), label: (c) => ` ${rp(c.parsed.x)}` } },
      },
      scales: {
        x: { display: false, beginAtZero: true },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: t.inkStrong, font: { family: t.font, size: 13 } } },
      },
    },
    plugins: [valueLabels(t)],
  });
}

/** Bar horizontal berkelompok: bulan lalu (muted) vs bulan ini (solid). */
export async function compareBars(canvas, items, { prevLabel = 'Bulan lalu', curLabel = 'Bulan ini' } = {}) {
  await loadChart();
  const t = theme();
  return mountChart(canvas, {
    type: 'bar',
    data: {
      labels: items.map(axisLabel),
      datasets: [
        { label: prevLabel, data: items.map((i) => i.prevAmount), backgroundColor: t.muted, borderRadius: 4, borderSkipped: 'start', barThickness: 11 },
        { label: curLabel, data: items.map((i) => i.amount), backgroundColor: t.mark, borderRadius: 4, borderSkipped: 'start', barThickness: 11 },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: t.reduce ? false : { duration: 700 },
      layout: { padding: { right: 62, left: 14 } },
      plugins: {
        legend: { position: 'bottom', labels: { color: t.ink, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, padding: 14, font: { family: t.font, size: 13 } } },
        tooltip: { callbacks: { title: fullTitle(items), label: (c) => ` ${c.dataset.label}: ${rp(c.parsed.x)}` } },
      },
      scales: {
        x: { display: false, beginAtZero: true },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: t.inkStrong, font: { family: t.font, size: 13 } } },
      },
    },
    plugins: [valueLabels(t, 1)],
  });
}
