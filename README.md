# E-BK | SMKN 1 Kota Binjai

Portal layanan Bimbingan Konseling (E-BK) untuk **SMKN 1 Kota Binjai**, berjalan di GitHub Pages dengan backend Supabase (PostgreSQL + RPC `SECURITY DEFINER`).

Website aktif: **https://creamylofly-omagot.github.io/bk/**

## Struktur Proyek

- `index.html` — Markup HTML5 semantik & aksesibel
- `css/styles.css` — Design system, kontras WCAG AA, dan tampilan responsif kartu mobile
- `js/app.js` — Controller UI, event delegation, dan sanitasi XSS
- `js/api.js` — Adapter koneksi (`Supabase RPC` / `Google Apps Script` / `Mode Lokal`)
- `js/local-backend.js` — Backend browser lokal (`localStorage` + Web Crypto SHA-256)
- `supabase/schema.sql` — Skema tabel terkunci RLS & 14 fungsi RPC PostgreSQL
- `config.json` — Konfigurasi URL & Publishable Key
- `Code.gs` — Backend opsional Google Apps Script (Google Sheets)
- `tests/run-tests.mjs` — Pengujian otomatis (`node tests/run-tests.mjs`)

## Menjalankan Pengujian

```bash
node tests/run-tests.mjs
```
