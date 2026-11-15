# DESIGN.md: E-BK SMKN 1 Kota Binjai

Dial: ENERGY 2 / RHYTHM 2 / MOTION 2

## Identity & Purpose
- **Product:** Portal Layanan Bimbingan Konseling (E-BK) SMKN 1 Kota Binjai.
- **Audience:** Murid, Orang Tua/Wali, Guru/Wali Kelas, Guru BK, dan Operator Sistem di lingkungan SMK negeri.
- **Tone:** Tenang, terstruktur, jelas, dan mudah dibaca di layar HP maupun desktop sekolah.

## Color Palette (Core + 1 Accent)
- **Ground:** `#f1f5f9` (permukaan latar kerja di dalam aplikasi agar tabel dan riwayat poin nyaman dibaca lama).
- **Surface:** `#ffffff` dengan border `#cbd5e1` (kartu duduk rata di atas ground tanpa bayangan berlebih).
- **Primary Core:** `#0f4c81` (biru navy institusi sekolah, kontras `8.86:1` terhadap teks putih).
- **Accent:** `#0f766e` (teal layanan konseling, dipakai terbatas pada garis aksen kartu login, gradasi latar login, dan identitas ikon portal).
- **Semantic Status Colors (selalu disertai teks & ikon, kontras >= 4.5:1):**
  - Aman: `#14532d` pada `#dcfce7` (`8.30:1`)
  - SP 1 / Peringatan: `#78350f` pada `#fef3c7` (`8.15:1`)
  - SP 2: `#7c2d12` pada `#ffedd5` (`8.18:1`)
  - SP 3 / Skorsing: `#7f1d1d` pada `#fee2e2` (`8.20:1`)

## Typography (`R-06`)
- **Typeface:** `Plus Jakarta Sans` (dengan fallback `system-ui, sans-serif`) dipilih karena keterbacaan huruf Latin dan angka tabular (`tabular-nums`) pada kolom poin `0-100`, nama Indonesia panjang, dan tabel responsif di layar HP.
- **Headers:** Sentence case (bukan huruf kapital penuh dengan *letter-spacing* lebar).

## Elevation & Radius (`R-11`, `R-12`)
- **Ground-plane cards (`.stat-card`, `.content-card`):** Datar (`box-shadow: none`) dengan border `#cbd5e1` untuk menjaga hierarki.
- **Elevated overlays only:** `.login-card`, `.combobox-listbox`, `.modal-content`, dan `.toast` memakai bayangan agar jelas mengambang di atas konten.
- **Radius scale:** `10px` untuk tombol & input, `14px` untuk kartu & modal, `999px` hanya untuk lencana status (`badge-sp`) dan filter toggle.

## Motion & Background (`R-01`, `R-19`, `R-39`)
- **Login backdrop:** Gradasi bergerak dinamis (`#172554` -> `#1d4ed8` -> `#0f4c81` -> `#0d9488`, siklus 5-6.5 detik GPU `transform`-only) dipakai khusus pada halaman login untuk memisahkan gerbang masuk dari ruang kerja datar di dalam aplikasi, dan menghormati `prefers-reduced-motion: reduce` (tombol jeda dihilangkan atas permintaan eksplisit pemilik).
- **In-app transitions:** Hanya pada pembukaan kartu login, combobox, dan modal; kartu stat tidak diberi animasi stagger massal.
