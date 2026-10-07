// Dijalankan sebelum render pertama supaya tidak ada kilatan terang saat dark mode.
(function () {
  var theme = null;
  try { theme = localStorage.getItem('pantau.theme'); } catch (e) { /* storage diblokir: abaikan */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f172a' : '#06b6d4');
})();
