# E-BK | SMKN 1 Kota Binjai

Aplikasi web Bimbingan Konseling (E-BK) untuk **SMKN 1 Kota Binjai**.

Website aktif: **https://creamylofly-omagot.github.io/bk/**

## Mode Operasi Website

1. **GitHub Pages + Supabase (PostgreSQL Cloud — Disarankan)**
   Menyimpan seluruh data terpusat (sinkron antar semua HP/laptop Guru BK, Guru, Murid, dan Orang Tua) tanpa Google Spreadsheet:
   - Buat proyek gratis di [supabase.com](https://supabase.com).
   - Buka **SQL Editor**, salin seluruh isi file `supabase/schema.sql`, lalu klik **Run**.
   - Buka **Project Settings → API**, salin **Project URL** dan **anon / publishable key**.
   - Masukkan keduanya ke `config.json` (`supabaseUrl` & `supabaseAnonKey`) di repo agar semua pengguna langsung terhubung, **atau** uji dulu lewat tombol **Koneksi Database** di halaman login website.
   - Seluruh tabel dikunci dengan **RLS** (tidak bisa diakses langsung dari browser); seluruh logika keamanan (hash sandi SHA-256 + salt, token sesi 6 jam, batas 5 salah sandi, filter per peran, pelapor dari sesi, penguncian baris transaksi) berjalan di fungsi RPC PostgreSQL (`SECURITY DEFINER`).

2. **Mode Lokal Browser (Aktif Otomatis Saat Belum Terhubung ke Cloud)**
   Berjalan langsung di `localStorage` browser dengan Web Crypto SHA-256. Sandi awal akun contoh: `123456`.

3. **Opsional: Google Apps Script + Google Sheets**
   Salin `Code.gs` ke [script.google.com](https://script.google.com), deploy sebagai Web App (`/exec`), lalu isi `gasApiUrl` di `config.json` atau di modal **Koneksi Database**.
