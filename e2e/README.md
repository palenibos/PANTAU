# Uji browser (viewport HP)

Skrip Playwright yang menjalankan PANTAU seperti pengguna HP (emulasi iPhone, layar sentuh, zona waktu WIB).

## Persiapan

```bash
# terminal 1 — server dengan data demo (dari root repo)
npm run demo                      # http://localhost:3000

# terminal 2
cd e2e
npm install
npx playwright install chromium   # sekali saja
# atau pakai Chromium yang sudah ada:  export CHROMIUM_PATH=/path/ke/chrome
```

Server lain? `BASE=http://localhost:3100 npm run flow`.

## Skrip

| Perintah | Isi |
|---|---|
| `npm run flow` | **Alur lengkap** (±40 pengecekan): daftar → validasi form → catat pemasukan → quick-add sampai **alert budget tier 1/2/3** muncul → riwayat (cari, filter, edit, hapus) → **uji XSS** (nama kategori/catatan berisi HTML) → pengaturan (mode gelap, budget, ekspor CSV, reset) → keyboard layar sentuh → logout/login → auto-refresh token. Keluar dengan kode ≠ 0 bila ada yang gagal. Screenshot → `e2e/out/`. |
| `npm run budget` | **Regresi simpan budget di layar sentuh** (kasus iPhone Safari): mengetik tanpa Enter/blur lalu menyimpan lewat tombol, simpan banyak kolom, Batal, penjaga "Buang perubahan?", budget tidak kembali ke angka lama lewat sheet kategori, sheet tidak bertumpuk, komposisi IME, keyboard ditutup tanpa blur, layar 320px (±40 pengecekan). |
| `npm run smoke` | Buka semua layar dengan akun demo, tangkap `console.error`/request gagal, dan **deteksi overflow horizontal**. Atur ukuran: `W=320 H=568 THEME=dark npm run smoke`. |
| `npm run slow3g` | Ukur waktu muat dengan throttling **Slow 3G** (500 kbps, RTT 400 ms). |
| `npm run screenshots` | Regenerasi screenshot di `docs/screenshots/` (jalankan pada server demo yang baru dinyalakan agar datanya konsisten). |

`flow` dan `budget` membuat akun baru tiap dijalankan dan mengubah data di server yang dituju — pakai server demo/dev, jangan produksi.

**Kena `RATE_LIMITED`?** Endpoint login/daftar dibatasi 30 percobaan per 15 menit per IP (sengaja, melawan tebak password). Menjalankan skrip berkali-kali bisa menghabiskannya: restart server demo, atau jalankan servernya dengan `NODE_ENV=test` (limiter dimatikan).
