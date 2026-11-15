# E-BK | SMKN 1 Kota Binjai

Aplikasi web Bimbingan Konseling (E-BK) untuk **SMKN 1 Kota Binjai**.

## Mode Operasi Website

1. **Mode Lokal Browser (Aktif Otomatis di GitHub Pages)**
   Website langsung berjalan di browser dengan `localStorage` dan Web Crypto SHA-256 (termasuk seluruh aturan poin, status SP, sesi 6 jam, pembatasan akses per peran, pengajuan konseling, dan manajemen akun).
   - Sandi awal seluruh akun contoh: `123456` (segera ubah lewat menu **Profil** setelah masuk).

2. **Terhubung ke Google Sheets (via Google Apps Script Web App)**
   Agar data tersimpan terpusat di Google Sheets:
   - Buat proyek baru di [script.google.com](https://script.google.com) (atau buka *Extensions > Apps Script* dari Google Sheets).
   - Salin isi `Code.gs` ke editor Apps Script.
   - Deploy sebagai **Web App** (*Execute as: Me*, *Who has access: Anyone*).
   - Salin URL `/exec`, lalu:
     - Tempel di tombol **Koneksi Database** pada halaman login / halaman Pengaturan, **atau**
     - Isi `gasApiUrl` di `config.json` agar semua pengguna langsung terhubung ke Google Sheets.

3. **Mode Native Google Apps Script**
   Salin `Code.gs` dan `index.html` (beri nama `Index` di Apps Script) lalu deploy sebagai Web App Apps Script.
