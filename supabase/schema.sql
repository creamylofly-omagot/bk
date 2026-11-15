-- =============================================================================
-- E-BK SMKN 1 KOTA BINJAI - Schema & RPC API untuk Supabase (PostgreSQL)
-- Jalankan seluruh skrip ini di Supabase Dashboard -> SQL Editor -> Run.
-- Aman dijalankan ulang (idempoten).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. TABEL DATABASE (Setara 4 Sheet + Sesi & Rate Limit)
CREATE TABLE IF NOT EXISTS public.ebk_pengaturan_sekolah (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ebk_users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('Murid', 'Guru', 'Ortu', 'Guru_BK', 'Admin')),
  nama TEXT NOT NULL,
  password TEXT NOT NULL,
  kelas_info TEXT NOT NULL,
  poin INTEGER NOT NULL DEFAULT 100,
  status_sp TEXT NOT NULL DEFAULT 'Aman',
  skorsing TEXT NOT NULL DEFAULT 'Tidak' CHECK (skorsing IN ('Ya', 'Tidak')),
  terkait_id_siswa TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ebk_users DROP CONSTRAINT IF EXISTS ebk_users_role_check;
ALTER TABLE public.ebk_users ADD CONSTRAINT ebk_users_role_check CHECK (role IN ('Murid', 'Guru', 'Ortu', 'Guru_BK', 'Admin'));


CREATE TABLE IF NOT EXISTS public.ebk_catatan_poin (
  seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id TEXT UNIQUE NOT NULL,
  tanggal TEXT NOT NULL,
  id_siswa TEXT NOT NULL,
  nama_siswa TEXT NOT NULL,
  kelas TEXT NOT NULL,
  jenis TEXT NOT NULL,
  keterangan TEXT NOT NULL,
  perubahan_poin INTEGER NOT NULL,
  pelapor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ebk_konseling (
  seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id TEXT UNIQUE NOT NULL,
  tanggal TEXT NOT NULL,
  id_siswa TEXT NOT NULL,
  nama_siswa TEXT NOT NULL,
  kelas TEXT NOT NULL,
  topik TEXT NOT NULL,
  cerita TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Menunggu',
  jadwal TEXT NOT NULL DEFAULT '-',
  catatan_bk TEXT NOT NULL DEFAULT '-'
);

CREATE TABLE IF NOT EXISTS public.ebk_laporan_guru (
  seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id TEXT UNIQUE NOT NULL,
  tanggal TEXT NOT NULL,
  id_siswa TEXT NOT NULL,
  nama_siswa TEXT NOT NULL,
  kelas TEXT NOT NULL,
  jenis TEXT NOT NULL,
  bobot_usulan INTEGER NOT NULL,
  keterangan TEXT NOT NULL,
  id_pelapor TEXT NOT NULL,
  pelapor TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Menunggu',
  bobot_disetujui INTEGER NOT NULL DEFAULT 0,
  catatan_bk TEXT NOT NULL DEFAULT '-',
  diproses_oleh TEXT NOT NULL DEFAULT '-',
  tanggal_proses TEXT NOT NULL DEFAULT '-'
);

CREATE TABLE IF NOT EXISTS public.ebk_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.ebk_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ebk_login_fails (
  user_id TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL
);

-- 2. KUNCI AKSES LANGSUNG KE TABEL (Hanya lewat RPC SECURITY DEFINER)
ALTER TABLE public.ebk_pengaturan_sekolah ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebk_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebk_catatan_poin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebk_konseling ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebk_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebk_login_fails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebk_laporan_guru ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ebk_pengaturan_sekolah FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ebk_users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ebk_catatan_poin FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ebk_konseling FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ebk_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ebk_login_fails FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ebk_laporan_guru FROM PUBLIC, anon, authenticated;

-- 3. FUNGSI UTILITAS INTERNAL
CREATE OR REPLACE FUNCTION public.ebk_hitung_status_sp(p_poin INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
BEGIN
  IF p_poin >= 85 THEN RETURN 'Aman'; END IF;
  IF p_poin >= 70 THEN RETURN 'SP 1'; END IF;
  IF p_poin >= 50 THEN RETURN 'SP 2'; END IF;
  RETURN 'SP 3';
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_get_salt()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_salt TEXT;
BEGIN
  SELECT value INTO v_salt FROM public.ebk_pengaturan_sekolah WHERE key = 'PW_SALT';
  IF v_salt IS NULL THEN
    v_salt := gen_random_uuid()::TEXT;
    INSERT INTO public.ebk_pengaturan_sekolah (key, value)
    VALUES ('PW_SALT', v_salt)
    ON CONFLICT (key) DO NOTHING;
    SELECT value INTO v_salt FROM public.ebk_pengaturan_sekolah WHERE key = 'PW_SALT';
  END IF;
  RETURN v_salt;
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_hash_pw(p_pw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN 'h$' || encode(digest(public.ebk_get_salt() || COALESCE(p_pw, ''), 'sha256'), 'hex');
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_check_pw(p_stored TEXT, p_input TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF left(COALESCE(p_stored, ''), 2) = 'h$' THEN
    RETURN p_stored = public.ebk_hash_pw(p_input);
  END IF;
  RETURN COALESCE(p_stored, '') = COALESCE(p_input, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_pub_user(u public.ebk_users)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT jsonb_build_object(
    'id', u.id,
    'role', u.role,
    'nama', u.nama,
    'kelasInfo', u.kelas_info,
    'poin', u.poin,
    'statusSP', u.status_sp,
    'skorsing', u.skorsing,
    'terkaitIdSiswa', u.terkait_id_siswa
  );
$$;

CREATE OR REPLACE FUNCTION public.ebk_next_id(p_table TEXT, p_prefix TEXT, p_start INTEGER, p_pad INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_max INTEGER := p_start - 1;
  v_num INTEGER;
  v_id TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_table || ':' || p_prefix));

  IF p_table = 'users' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(id FROM length(p_prefix) + 1), '[^0-9]', '', 'g'), '')::INTEGER), p_start - 1)
    INTO v_max
    FROM public.ebk_users
    WHERE left(id, length(p_prefix)) = p_prefix;
  ELSIF p_table = 'catatan' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(id FROM length(p_prefix) + 1), '[^0-9]', '', 'g'), '')::INTEGER), p_start - 1)
    INTO v_max
    FROM public.ebk_catatan_poin
    WHERE left(id, length(p_prefix)) = p_prefix;
  ELSIF p_table = 'konseling' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(id FROM length(p_prefix) + 1), '[^0-9]', '', 'g'), '')::INTEGER), p_start - 1)
    INTO v_max
    FROM public.ebk_konseling
    WHERE left(id, length(p_prefix)) = p_prefix;
  ELSIF p_table = 'laporan' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(id FROM length(p_prefix) + 1), '[^0-9]', '', 'g'), '')::INTEGER), p_start - 1)
    INTO v_max
    FROM public.ebk_laporan_guru
    WHERE left(id, length(p_prefix)) = p_prefix;
  END IF;

  IF v_max < p_start - 1 THEN
    v_max := p_start - 1;
  END IF;

  v_num := v_max + 1;
  IF p_pad > 0 THEN
    v_id := p_prefix || lpad(v_num::TEXT, GREATEST(p_pad, length(v_num::TEXT)), '0');
  ELSE
    v_id := p_prefix || v_num::TEXT;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_require_session(p_token TEXT, p_roles TEXT[] DEFAULT NULL)
RETURNS public.ebk_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id TEXT;
  v_user public.ebk_users;
BEGIN
  DELETE FROM public.ebk_sessions WHERE expires_at <= now();

  IF p_token IS NULL OR p_token = '' THEN
    RAISE EXCEPTION 'EXPIRED:Sesi berakhir. Silakan masuk kembali.';
  END IF;

  SELECT user_id INTO v_user_id
  FROM public.ebk_sessions
  WHERE token = p_token AND expires_at > now();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'EXPIRED:Sesi berakhir. Silakan masuk kembali.';
  END IF;

  SELECT * INTO v_user FROM public.ebk_users WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXPIRED:Sesi berakhir. Silakan masuk kembali.';
  END IF;

  IF p_roles IS NOT NULL AND NOT (v_user.role = ANY(p_roles)) THEN
    RAISE EXCEPTION 'ERR:Anda tidak memiliki akses untuk tindakan ini.';
  END IF;

  RETURN v_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_seed_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_pw TEXT;
  v_today TEXT := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD');
  v_now TEXT := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI');
BEGIN
  INSERT INTO public.ebk_pengaturan_sekolah (key, value) VALUES
    ('Nama_Sekolah', 'SMKN 1 Kota Binjai'),
    ('Alamat', 'Jl. Samanhudi No.20, Satria, Kec. Binjai Kota, Kota Binjai, Sumatera Utara 20741'),
    ('Tahun_Ajaran', '2026/2027')
  ON CONFLICT (key) DO NOTHING;

  PERFORM public.ebk_get_salt();

  IF NOT EXISTS (SELECT 1 FROM public.ebk_users) THEN
    v_pw := public.ebk_hash_pw('123456');
    INSERT INTO public.ebk_users (id, role, nama, password, kelas_info, poin, status_sp, skorsing, terkait_id_siswa) VALUES
      ('BK01', 'Guru_BK', 'Dra. Hj. Nurhayati, M.Psi (Guru BK)', v_pw, 'Ruang BK Utama', 100, '-', 'Tidak', ''),
      ('GR01', 'Guru', 'Samsudin, M.Pd', v_pw, 'Wali Kelas XI RPL 1', 100, '-', 'Tidak', ''),
      ('GR02', 'Guru', 'Rina Marlina, S.Kom', v_pw, 'Wali Kelas XI TKJ 1', 100, '-', 'Tidak', ''),
      ('GR03', 'Guru', 'Budi Santoso, S.Pd', v_pw, 'Guru Produktif AKL', 100, '-', 'Tidak', ''),
      ('SW01', 'Murid', 'Aminah', v_pw, 'XI RPL 1', 100, 'Aman', 'Tidak', ''),
      ('SW02', 'Murid', 'Muhammad Rizky Pratama', v_pw, 'XI RPL 1', 80, 'SP 1', 'Tidak', ''),
      ('SW03', 'Murid', 'Siti Aisyah Putri', v_pw, 'XI RPL 1', 100, 'Aman', 'Tidak', ''),
      ('SW04', 'Murid', 'Dimas Anggara', v_pw, 'XI TKJ 1', 60, 'SP 2', 'Tidak', ''),
      ('SW05', 'Murid', 'Nabila Syakieb', v_pw, 'XI TKJ 1', 95, 'Aman', 'Tidak', ''),
      ('SW06', 'Murid', 'Fajar Nugroho', v_pw, 'XII AKL 2', 35, 'SP 3', 'Ya', ''),
      ('OT01', 'Ortu', 'Bpk. Ahmad (Wali dari Aminah)', v_pw, 'Ortu XI RPL 1', 100, '-', 'Tidak', 'SW01'),
      ('OT02', 'Ortu', 'Ibu Siti (Wali dari M. Rizky)', v_pw, 'Ortu XI RPL 1', 100, '-', 'Tidak', 'SW02'),
      ('OT03', 'Ortu', 'Bpk. Hendra (Wali dari Dimas)', v_pw, 'Ortu XI TKJ 1', 100, '-', 'Tidak', 'SW04');
  END IF;

  INSERT INTO public.ebk_users (id, role, nama, password, kelas_info, poin, status_sp, skorsing, terkait_id_siswa)
  VALUES ('admin123', 'Admin', 'Administrator / Operator Sistem', public.ebk_hash_pw('123admin'), 'Operator Pusat', 100, '-', 'Tidak', '')
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.ebk_catatan_poin) THEN
    INSERT INTO public.ebk_catatan_poin (id, tanggal, id_siswa, nama_siswa, kelas, jenis, keterangan, perubahan_poin, pelapor) VALUES
      ('CT-1001', v_today, 'SW01', 'Aminah', 'XI RPL 1', 'Prestasi', 'Juara 1 LKS Web Technologies Tingkat Kota Binjai', 15, 'Samsudin, M.Pd'),
      ('CT-1002', v_today, 'SW01', 'Aminah', 'XI RPL 1', 'Pelanggaran', 'Terlambat mengikuti apel pagi (15 menit)', -15, 'Dra. Hj. Nurhayati, M.Psi (Guru BK)'),
      ('CT-1003', v_today, 'SW02', 'Muhammad Rizky Pratama', 'XI RPL 1', 'Pelanggaran', 'Tidak memakai atribut dasi dan topi saat upacara', -20, 'Samsudin, M.Pd'),
      ('CT-1004', v_today, 'SW04', 'Dimas Anggara', 'XI TKJ 1', 'Pelanggaran', 'Bolos pada jam pelajaran ke-5 dan ke-6', -40, 'Rina Marlina, S.Kom'),
      ('CT-1005', v_today, 'SW06', 'Fajar Nugroho', 'XII AKL 2', 'Pelanggaran', 'Terlibat perkelahian di area parkir sekolah', -65, 'Dra. Hj. Nurhayati, M.Psi (Guru BK)');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ebk_konseling) THEN
    INSERT INTO public.ebk_konseling (id, tanggal, id_siswa, nama_siswa, kelas, topik, cerita, status, jadwal, catatan_bk) VALUES
      ('KS-2001', v_now, 'SW01', 'Aminah', 'XI RPL 1', 'Karir, PKL & Kuliah', 'Ingin cerita sedikit mengenai kebingungan memilih tempat PKL dan persiapan kuliah.', 'Menunggu', '-', '-');
  END IF;
END;
$$;

-- Jalankan seed awal saat skrip dieksekusi
SELECT public.ebk_seed_data();

-- 4. RPC API PUBLIK (Dipanggil dari index.html via /rest/v1/rpc/...)
CREATE OR REPLACE FUNCTION public.ebk_ping()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.ebk_seed_data();
  RETURN jsonb_build_object('success', true, 'mode', 'supabase', 'message', 'Terhubung ke database Supabase.');
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_get_login_accounts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_data JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'role', role,
    'nama', nama,
    'kelasInfo', kelas_info
  ) ORDER BY created_at, id), '[]'::JSONB)
  INTO v_data
  FROM public.ebk_users
  WHERE role <> 'Admin';

  RETURN jsonb_build_object('success', true, 'data', v_data);
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_login_user(p_user_id TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid TEXT := COALESCE(p_user_id, '');
  v_fail RECORD;
  v_user public.ebk_users;
  v_token TEXT;
  v_new_count INTEGER;
BEGIN
  DELETE FROM public.ebk_login_fails WHERE expires_at <= now();

  SELECT * INTO v_fail FROM public.ebk_login_fails WHERE user_id = v_uid;
  IF FOUND AND v_fail.expires_at > now() AND v_fail.fail_count >= 5 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.');
  END IF;

  SELECT * INTO v_user FROM public.ebk_users WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Akun tidak ditemukan!');
  END IF;

  IF NOT public.ebk_check_pw(v_user.password, COALESCE(p_password, '')) THEN
    v_new_count := CASE WHEN v_fail.expires_at IS NOT NULL AND v_fail.expires_at > now() THEN COALESCE(v_fail.fail_count, 0) + 1 ELSE 1 END;
    INSERT INTO public.ebk_login_fails (user_id, fail_count, expires_at)
    VALUES (v_uid, v_new_count, now() + interval '10 minutes')
    ON CONFLICT (user_id) DO UPDATE
      SET fail_count = CASE WHEN public.ebk_login_fails.expires_at > now() THEN public.ebk_login_fails.fail_count + 1 ELSE 1 END,
          expires_at = now() + interval '10 minutes';
    RETURN jsonb_build_object('success', false, 'message', 'Kata sandi yang Anda masukkan salah!');
  END IF;

  DELETE FROM public.ebk_login_fails WHERE user_id = v_uid;

  IF left(v_user.password, 2) <> 'h$' THEN
    UPDATE public.ebk_users SET password = public.ebk_hash_pw(p_password) WHERE id = v_user.id;
  END IF;

  v_token := gen_random_uuid()::TEXT;
  INSERT INTO public.ebk_sessions (token, user_id, expires_at)
  VALUES (v_token, v_user.id, now() + interval '6 hours');

  RETURN jsonb_build_object('success', true, 'token', v_token, 'user', public.ebk_pub_user(v_user));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_akhiri_sesi(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_token IS NOT NULL AND p_token <> '' THEN
    DELETE FROM public.ebk_sessions WHERE token = p_token;
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_ubah_sandi(p_token TEXT, p_lama TEXT, p_baru TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_me public.ebk_users;
BEGIN
  v_me := public.ebk_require_session(p_token);
  IF NOT public.ebk_check_pw(v_me.password, COALESCE(p_lama, '')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sandi lama salah.');
  END IF;
  IF length(COALESCE(p_baru, '')) < 6 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sandi baru minimal 6 karakter.');
  END IF;

  UPDATE public.ebk_users SET password = public.ebk_hash_pw(p_baru) WHERE id = v_me.id;
  RETURN jsonb_build_object('success', true, 'message', 'Sandi berhasil diubah.');
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_jalankan_setup(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.ebk_require_session(p_token, ARRAY['Admin']);
  PERFORM public.ebk_seed_data();
  RETURN jsonb_build_object('success', true, 'message', 'Struktur database Supabase sudah lengkap.');
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_get_all_app_data(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_me public.ebk_users;
  v_users JSONB := '[]'::JSONB;
  v_students JSONB := '[]'::JSONB;
  v_catatan JSONB := '[]'::JSONB;
  v_konseling JSONB := '[]'::JSONB;
  v_laporan JSONB := '[]'::JSONB;
  v_school JSONB := '{}'::JSONB;
  v_sid TEXT;
  v_me := public.ebk_require_session(p_token);

  IF v_me.role IN ('Guru_BK', 'Admin') THEN
    IF v_me.role = 'Admin' THEN
      SELECT COALESCE(jsonb_agg(public.ebk_pub_user(u) ORDER BY u.created_at, u.id), '[]'::JSONB)
      INTO v_users FROM public.ebk_users u;
    END IF;

    SELECT COALESCE(jsonb_agg(public.ebk_pub_user(u) ORDER BY u.created_at, u.id), '[]'::JSONB)
    INTO v_students FROM public.ebk_users u WHERE u.role = 'Murid';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'tanggal', c.tanggal, 'idSiswa', c.id_siswa, 'namaSiswa', c.nama_siswa,
      'kelas', c.kelas, 'jenis', c.jenis, 'keterangan', c.keterangan, 'perubahanPoin', c.perubahan_poin, 'pelapor', c.pelapor
    ) ORDER BY c.seq DESC), '[]'::JSONB)
    INTO v_catatan FROM public.ebk_catatan_poin c;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', k.id, 'tanggal', k.tanggal, 'idSiswa', k.id_siswa, 'namaSiswa', k.nama_siswa,
      'kelas', k.kelas, 'topik', k.topik, 'cerita', k.cerita, 'status', k.status, 'jadwal', k.jadwal, 'catatanBK', k.catatan_bk
    ) ORDER BY k.seq DESC), '[]'::JSONB)
    INTO v_konseling FROM public.ebk_konseling k;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id, 'tanggal', l.tanggal, 'idSiswa', l.id_siswa, 'namaSiswa', l.nama_siswa,
      'kelas', l.kelas, 'jenis', l.jenis, 'bobotUsulan', l.bobot_usulan, 'keterangan', l.keterangan,
      'idPelapor', l.id_pelapor, 'pelapor', l.pelapor, 'status', l.status,
      'bobotDisetujui', l.bobot_disetujui, 'catatanBK', l.catatan_bk,
      'diprosesOleh', l.diproses_oleh, 'tanggalProses', l.tanggal_proses
    ) ORDER BY l.seq DESC), '[]'::JSONB)
    INTO v_laporan FROM public.ebk_laporan_guru l;

  ELSIF v_me.role = 'Guru' THEN
    SELECT COALESCE(jsonb_agg(public.ebk_pub_user(u) ORDER BY u.created_at, u.id), '[]'::JSONB)
    INTO v_students FROM public.ebk_users u WHERE u.role = 'Murid';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'tanggal', c.tanggal, 'idSiswa', c.id_siswa, 'namaSiswa', c.nama_siswa,
      'kelas', c.kelas, 'jenis', c.jenis, 'keterangan', c.keterangan, 'perubahanPoin', c.perubahan_poin, 'pelapor', c.pelapor
    ) ORDER BY c.seq DESC), '[]'::JSONB)
    INTO v_catatan FROM public.ebk_catatan_poin c WHERE c.pelapor = v_me.nama;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id, 'tanggal', l.tanggal, 'idSiswa', l.id_siswa, 'namaSiswa', l.nama_siswa,
      'kelas', l.kelas, 'jenis', l.jenis, 'bobotUsulan', l.bobot_usulan, 'keterangan', l.keterangan,
      'idPelapor', l.id_pelapor, 'pelapor', l.pelapor, 'status', l.status,
      'bobotDisetujui', l.bobot_disetujui, 'catatanBK', l.catatan_bk,
      'diprosesOleh', l.diproses_oleh, 'tanggalProses', l.tanggal_proses
    ) ORDER BY l.seq DESC), '[]'::JSONB)
    INTO v_laporan FROM public.ebk_laporan_guru l WHERE l.id_pelapor = v_me.id;

  ELSE
    v_sid := CASE WHEN v_me.role = 'Murid' THEN v_me.id ELSE v_me.terkait_id_siswa END;

    SELECT COALESCE(jsonb_agg(public.ebk_pub_user(u) ORDER BY u.created_at, u.id), '[]'::JSONB)
    INTO v_students FROM public.ebk_users u WHERE u.role = 'Murid' AND u.id = v_sid;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'tanggal', c.tanggal, 'idSiswa', c.id_siswa, 'namaSiswa', c.nama_siswa,
      'kelas', c.kelas, 'jenis', c.jenis, 'keterangan', c.keterangan, 'perubahanPoin', c.perubahan_poin, 'pelapor', c.pelapor
    ) ORDER BY c.seq DESC), '[]'::JSONB)
    INTO v_catatan FROM public.ebk_catatan_poin c WHERE c.id_siswa = v_sid;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', k.id, 'tanggal', k.tanggal, 'idSiswa', k.id_siswa, 'namaSiswa', k.nama_siswa,
      'kelas', k.kelas, 'topik', k.topik,
      'cerita', CASE WHEN v_me.role = 'Ortu' THEN '(Isi cerita bersifat rahasia)' ELSE k.cerita END,
      'status', k.status, 'jadwal', k.jadwal, 'catatanBK', k.catatan_bk
    ) ORDER BY k.seq DESC), '[]'::JSONB)
    INTO v_konseling FROM public.ebk_konseling k WHERE k.id_siswa = v_sid;
  END IF;

  IF v_me.role = 'Admin' THEN
    SELECT jsonb_build_object(
      'namaSekolah', COALESCE((SELECT value FROM public.ebk_pengaturan_sekolah WHERE key = 'Nama_Sekolah'), 'SMKN 1 Kota Binjai'),
      'alamat', COALESCE((SELECT value FROM public.ebk_pengaturan_sekolah WHERE key = 'Alamat'), ''),
      'tahunAjaran', COALESCE((SELECT value FROM public.ebk_pengaturan_sekolah WHERE key = 'Tahun_Ajaran'), '')
    ) INTO v_school;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'me', public.ebk_pub_user(v_me),
    'users', v_users,
    'students', v_students,
    'catatan', v_catatan,
    'konseling', v_konseling,
    'laporan', v_laporan,
    'schoolConfig', v_school
  );
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_tambah_catatan_poin(
  p_token TEXT,
  p_id_siswa TEXT,
  p_jenis TEXT,
  p_poin NUMERIC,
  p_keterangan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_me public.ebk_users;
  v_s public.ebk_users;
  v_bobot INTEGER := round(COALESCE(p_poin, 0))::INTEGER;
  v_ket TEXT := left(btrim(COALESCE(p_keterangan, '')), 300);
  v_baru INTEGER;
  v_delta INTEGER;
  v_status TEXT;
  v_msg TEXT;
  v_id TEXT;
BEGIN
  v_me := public.ebk_require_session(p_token, ARRAY['Guru_BK', 'Admin']);

  IF p_jenis NOT IN ('Pelanggaran', 'Prestasi') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Jenis catatan tidak valid.');
  END IF;
  IF NOT (v_bobot >= 1 AND v_bobot <= 100) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Bobot poin harus 1 sampai 100.');
  END IF;
  IF v_ket = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Keterangan wajib diisi.');
  END IF;

  SELECT * INTO v_s FROM public.ebk_users WHERE id = COALESCE(p_id_siswa, '') AND role = 'Murid' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Data siswa tidak ditemukan!');
  END IF;

  v_baru := GREATEST(0, LEAST(100, v_s.poin + CASE WHEN p_jenis = 'Prestasi' THEN v_bobot ELSE -v_bobot END));
  v_delta := v_baru - v_s.poin;
  v_status := public.ebk_hitung_status_sp(v_baru);
  v_id := public.ebk_next_id('catatan', 'CT-', 1001, 0);

  INSERT INTO public.ebk_catatan_poin (id, tanggal, id_siswa, nama_siswa, kelas, jenis, keterangan, perubahan_poin, pelapor)
  VALUES (
    v_id,
    to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD'),
    v_s.id, v_s.nama, v_s.kelas_info, p_jenis, v_ket, v_delta, v_me.nama
  );

  UPDATE public.ebk_users SET poin = v_baru, status_sp = v_status WHERE id = v_s.id;

  v_msg := 'Catatan ' || p_jenis || ' untuk ' || v_s.nama || ' disimpan. Poin kini ' || v_baru || '/100 (' || v_status || ').';
  IF v_status <> 'Aman' AND v_status <> v_s.status_sp THEN
    v_msg := v_msg || ' Status berubah dari ' || v_s.status_sp || '.';
  END IF;
  RETURN jsonb_build_object('success', true, 'message', v_msg);
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_ajukan_laporan_guru(
  p_token TEXT,
  p_id_siswa TEXT,
  p_jenis TEXT,
  p_poin NUMERIC,
  p_keterangan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_me public.ebk_users;
  v_s public.ebk_users;
  v_bobot INTEGER := round(COALESCE(p_poin, 0))::INTEGER;
  v_ket TEXT := left(btrim(COALESCE(p_keterangan, '')), 300);
  v_id TEXT;
BEGIN
  v_me := public.ebk_require_session(p_token, ARRAY['Guru', 'Admin']);

  IF p_jenis NOT IN ('Pelanggaran', 'Prestasi') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Jenis laporan tidak valid.');
  END IF;
  IF NOT (v_bobot >= 1 AND v_bobot <= 100) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usulan bobot poin harus 1 sampai 100.');
  END IF;
  IF v_ket = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Keterangan wajib diisi.');
  END IF;

  SELECT * INTO v_s FROM public.ebk_users WHERE id = COALESCE(p_id_siswa, '') AND role = 'Murid';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Data siswa tidak ditemukan!');
  END IF;

  v_id := public.ebk_next_id('laporan', 'LP-', 3001, 0);
  INSERT INTO public.ebk_laporan_guru (
    id, tanggal, id_siswa, nama_siswa, kelas, jenis, bobot_usulan, keterangan, id_pelapor, pelapor, status
  ) VALUES (
    v_id,
    to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
    v_s.id, v_s.nama, v_s.kelas_info, p_jenis, v_bobot, v_ket, v_me.id, v_me.nama, 'Menunggu'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Laporan untuk ' || v_s.nama || ' dikirim. Poin akan berubah setelah diverifikasi Guru BK.'
  );
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_verifikasi_laporan_guru(
  p_token TEXT,
  p_id_laporan TEXT,
  p_keputusan TEXT,
  p_bobot_final NUMERIC,
  p_catatan_bk TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_me public.ebk_users;
  v_l public.ebk_laporan_guru;
  v_s public.ebk_users;
  v_bobot INTEGER;
  v_catatan TEXT := left(btrim(COALESCE(p_catatan_bk, '')), 200);
  v_baru INTEGER;
  v_delta INTEGER;
  v_status TEXT;
  v_ct_id TEXT;
  v_now TEXT := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI');
BEGIN
  v_me := public.ebk_require_session(p_token, ARRAY['Guru_BK', 'Admin']);

  IF p_keputusan NOT IN ('Setujui', 'Tolak') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Keputusan tidak valid.');
  END IF;

  SELECT * INTO v_l FROM public.ebk_laporan_guru WHERE id = COALESCE(p_id_laporan, '') FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Laporan tidak ditemukan.');
  END IF;
  IF v_l.status <> 'Menunggu' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Laporan ini sudah diproses.');
  END IF;

  IF p_keputusan = 'Tolak' THEN
    UPDATE public.ebk_laporan_guru
    SET status = 'Ditolak',
        bobot_disetujui = 0,
        catatan_bk = CASE WHEN v_catatan = '' THEN 'Laporan tidak disetujui oleh Guru BK.' ELSE v_catatan END,
        diproses_oleh = v_me.nama,
        tanggal_proses = v_now
    WHERE id = v_l.id;

    RETURN jsonb_build_object('success', true, 'message', 'Laporan ditolak. Poin siswa tidak berubah.');
  END IF;

  v_bobot := round(COALESCE(p_bobot_final, v_l.bobot_usulan))::INTEGER;
  IF NOT (v_bobot >= 1 AND v_bobot <= 100) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Bobot poin final harus 1 sampai 100.');
  END IF;

  SELECT * INTO v_s FROM public.ebk_users WHERE id = v_l.id_siswa AND role = 'Murid' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Siswa tidak ditemukan.');
  END IF;

  v_baru := GREATEST(0, LEAST(100, v_s.poin + CASE WHEN v_l.jenis = 'Prestasi' THEN v_bobot ELSE -v_bobot END));
  v_delta := v_baru - v_s.poin;
  v_status := public.ebk_hitung_status_sp(v_baru);
  v_ct_id := public.ebk_next_id('catatan', 'CT-', 1001, 0);

  INSERT INTO public.ebk_catatan_poin (id, tanggal, id_siswa, nama_siswa, kelas, jenis, keterangan, perubahan_poin, pelapor)
  VALUES (
    v_ct_id,
    to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD'),
    v_s.id, v_s.nama, v_s.kelas_info, v_l.jenis, v_l.keterangan, v_delta, v_l.pelapor
  );

  UPDATE public.ebk_users SET poin = v_baru, status_sp = v_status WHERE id = v_s.id;
  UPDATE public.ebk_laporan_guru
  SET status = 'Disetujui',
      bobot_disetujui = v_bobot,
      catatan_bk = CASE WHEN v_catatan = '' THEN 'Disetujui dan poin diperbarui.' ELSE v_catatan END,
      diproses_oleh = v_me.nama,
      tanggal_proses = v_now
  WHERE id = v_l.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Laporan disetujui. Poin ' || v_s.nama || ' kini ' || v_baru || '/100 (' || v_status || ').'
  );
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;
CREATE OR REPLACE FUNCTION public.ebk_selesaikan_konseling(
  p_token TEXT,
  p_id TEXT,
  p_catatan_bk TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_catatan TEXT := left(btrim(COALESCE(p_catatan_bk, '')), 200);
  v_k public.ebk_konseling;
BEGIN
  PERFORM public.ebk_require_session(p_token, ARRAY['Guru_BK', 'Admin']);

  SELECT * INTO v_k FROM public.ebk_konseling WHERE id = COALESCE(p_id, '') FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pengajuan tidak ditemukan.');
  END IF;
  IF v_k.status <> 'Disetujui & Terjadwal' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Hanya konseling terjadwal yang bisa ditandai selesai.');
  END IF;

  UPDATE public.ebk_konseling
  SET status = 'Selesai',
      catatan_bk = CASE WHEN v_catatan = '' THEN 'Sesi konseling telah selesai dilaksanakan.' ELSE v_catatan END
  WHERE id = v_k.id;

  RETURN jsonb_build_object('success', true, 'message', 'Sesi konseling ditandai selesai.');
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_update_tindakan_siswa(
  p_token TEXT,
  p_id_siswa TEXT,
  p_skorsing TEXT,
  p_reset_poin BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_me public.ebk_users;
  v_s public.ebk_users;
  v_id TEXT;
BEGIN
  v_me := public.ebk_require_session(p_token, ARRAY['Guru_BK', 'Admin']);

  IF p_skorsing NOT IN ('Ya', 'Tidak') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Status skorsing tidak valid.');
  END IF;

  SELECT * INTO v_s FROM public.ebk_users WHERE id = COALESCE(p_id_siswa, '') AND role = 'Murid' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Siswa tidak ditemukan.');
  END IF;

  UPDATE public.ebk_users SET skorsing = p_skorsing WHERE id = v_s.id;

  IF COALESCE(p_reset_poin, false) AND v_s.poin < 100 THEN
    UPDATE public.ebk_users SET poin = 100, status_sp = 'Aman' WHERE id = v_s.id;
    v_id := public.ebk_next_id('catatan', 'CT-', 1001, 0);
    INSERT INTO public.ebk_catatan_poin (id, tanggal, id_siswa, nama_siswa, kelas, jenis, keterangan, perubahan_poin, pelapor)
    VALUES (
      v_id,
      to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD'),
      v_s.id, v_s.nama, v_s.kelas_info, 'Pemulihan',
      'Poin dipulihkan setelah pembinaan selesai', 100 - v_s.poin, v_me.nama
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Status tindakan siswa berhasil diperbarui.');
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_ajukan_konseling(
  p_token TEXT,
  p_topik TEXT,
  p_cerita TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_me public.ebk_users;
  v_cerita TEXT := left(btrim(COALESCE(p_cerita, '')), 500);
  v_menunggu INTEGER;
  v_id TEXT;
BEGIN
  v_me := public.ebk_require_session(p_token, ARRAY['Murid']);

  IF v_cerita = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cerita singkat wajib diisi.');
  END IF;
  IF p_topik NOT IN ('Pribadi & Sosial', 'Akademik & Belajar', 'Karir, PKL & Kuliah', 'Masalah Kedisiplinan') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Topik tidak valid.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('konseling:' || v_me.id));
  SELECT COUNT(*) INTO v_menunggu FROM public.ebk_konseling WHERE id_siswa = v_me.id AND status = 'Menunggu';
  IF v_menunggu >= 3 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Anda masih punya 3 pengajuan yang menunggu. Tunggu jawaban Guru BK dulu.');
  END IF;

  v_id := public.ebk_next_id('konseling', 'KS-', 2001, 0);
  INSERT INTO public.ebk_konseling (id, tanggal, id_siswa, nama_siswa, kelas, topik, cerita, status, jadwal, catatan_bk)
  VALUES (
    v_id,
    to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
    v_me.id, v_me.nama, v_me.kelas_info, p_topik, v_cerita, 'Menunggu', '-', '-'
  );

  RETURN jsonb_build_object('success', true, 'message', 'Pengajuan konseling terkirim. Menunggu persetujuan Guru BK.');
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_setujui_konseling(
  p_token TEXT,
  p_id TEXT,
  p_jadwal TEXT,
  p_catatan_bk TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_jadwal TEXT := left(btrim(COALESCE(p_jadwal, '')), 100);
  v_catatan TEXT := left(btrim(COALESCE(p_catatan_bk, '')), 200);
  v_k public.ebk_konseling;
BEGIN
  PERFORM public.ebk_require_session(p_token, ARRAY['Guru_BK', 'Admin']);

  IF v_jadwal = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Jadwal wajib diisi.');
  END IF;

  SELECT * INTO v_k FROM public.ebk_konseling WHERE id = COALESCE(p_id, '') FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pengajuan tidak ditemukan.');
  END IF;
  IF v_k.status <> 'Menunggu' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pengajuan ini sudah diproses.');
  END IF;

  UPDATE public.ebk_konseling
  SET status = 'Disetujui & Terjadwal',
      jadwal = v_jadwal,
      catatan_bk = CASE WHEN v_catatan = '' THEN 'Silakan hadir tepat waktu di Ruang BK.' ELSE v_catatan END
  WHERE id = v_k.id;

  RETURN jsonb_build_object('success', true, 'message', 'Konseling disetujui dan jadwal sudah tampil di akun siswa.');
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_tolak_konseling(
  p_token TEXT,
  p_id TEXT,
  p_alasan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_alasan TEXT := left(btrim(COALESCE(p_alasan, '')), 200);
  v_k public.ebk_konseling;
BEGIN
  PERFORM public.ebk_require_session(p_token, ARRAY['Guru_BK', 'Admin']);

  SELECT * INTO v_k FROM public.ebk_konseling WHERE id = COALESCE(p_id, '') FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pengajuan tidak ditemukan.');
  END IF;
  IF v_k.status <> 'Menunggu' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pengajuan ini sudah diproses.');
  END IF;

  UPDATE public.ebk_konseling
  SET status = 'Ditolak',
      catatan_bk = CASE WHEN v_alasan = '' THEN 'Silakan ajukan ulang atau temui Guru BK.' ELSE v_alasan END
  WHERE id = v_k.id;

  RETURN jsonb_build_object('success', true, 'message', 'Pengajuan ditolak dan alasan sudah dikirim ke siswa.');
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_save_user_account(
  p_token TEXT,
  p_mode TEXT,
  p_id TEXT,
  p_role TEXT,
  p_nama TEXT,
  p_kelas_info TEXT,
  p_password TEXT,
  p_terkait_id_siswa TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_me public.ebk_users;
  v_nama TEXT := left(btrim(COALESCE(p_nama, '')), 100);
  v_kelas TEXT := left(btrim(COALESCE(p_kelas_info, '')), 100);
  v_terkait TEXT := '';
  v_prefix TEXT;
  v_new_id TEXT;
  v_u public.ebk_users;
BEGIN
  v_me := public.ebk_require_session(p_token, ARRAY['Admin']);

  IF p_role NOT IN ('Murid', 'Guru', 'Ortu', 'Guru_BK', 'Admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Peran tidak valid.');
  END IF;
  IF p_role = 'Admin' AND v_me.role <> 'Admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Hanya Administrator yang dapat mengelola akun Admin.');
  END IF;
  IF v_nama = '' OR v_kelas = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Nama dan kelas/info wajib diisi.');
  END IF;

  IF p_role = 'Ortu' THEN
    v_terkait := COALESCE(p_terkait_id_siswa, '');
    IF NOT EXISTS (SELECT 1 FROM public.ebk_users WHERE id = v_terkait AND role = 'Murid') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Akun orang tua harus dihubungkan ke siswa yang valid.');
    END IF;
  END IF;

  IF p_mode = 'add' THEN
    IF length(COALESCE(p_password, '')) < 6 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Sandi minimal 6 karakter.');
    END IF;
    v_prefix := CASE p_role
      WHEN 'Murid' THEN 'SW'
      WHEN 'Guru' THEN 'GR'
      WHEN 'Ortu' THEN 'OT'
      WHEN 'Guru_BK' THEN 'BK'
      ELSE 'AD'
    END;
    v_new_id := public.ebk_next_id('users', v_prefix, 1, 2);
    INSERT INTO public.ebk_users (id, role, nama, password, kelas_info, poin, status_sp, skorsing, terkait_id_siswa)
    VALUES (
      v_new_id, p_role, v_nama, public.ebk_hash_pw(p_password), v_kelas, 100,
      CASE WHEN p_role = 'Murid' THEN 'Aman' ELSE '-' END, 'Tidak', v_terkait
    );
    RETURN jsonb_build_object('success', true, 'message', 'Akun ' || v_nama || ' berhasil ditambahkan.');
  END IF;

  IF p_mode = 'edit' THEN
    SELECT * INTO v_u FROM public.ebk_users WHERE id = COALESCE(p_id, '') FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'Akun tidak ditemukan.');
    END IF;
    IF v_u.role = 'Admin' AND v_me.role <> 'Admin' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Hanya Administrator yang dapat mengubah akun Admin.');
    END IF;
    IF v_u.id = v_me.id AND p_role <> v_u.role THEN
      RETURN jsonb_build_object('success', false, 'message', 'Anda tidak bisa mengubah peran akun Anda sendiri.');
    END IF;
    IF v_u.role <> p_role THEN
      RETURN jsonb_build_object('success', false, 'message', 'Peran akun tidak bisa diubah. Buat akun baru jika perlu.');
    END IF;

    IF COALESCE(p_password, '') <> '' AND length(p_password) < 6 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Sandi minimal 6 karakter.');
    END IF;

    UPDATE public.ebk_users
    SET nama = v_nama,
        kelas_info = v_kelas,
        terkait_id_siswa = v_terkait,
        password = CASE
          WHEN COALESCE(p_password, '') <> '' THEN public.ebk_hash_pw(p_password)
          ELSE password
        END
    WHERE id = v_u.id;

    RETURN jsonb_build_object('success', true, 'message', 'Data akun ' || v_nama || ' diperbarui.');
  END IF;

  RETURN jsonb_build_object('success', false, 'message', 'Mode tidak dikenal.');
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_delete_user_account(p_token TEXT, p_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_me public.ebk_users;
  v_u public.ebk_users;
  v_bk_count INTEGER;
BEGIN
  v_me := public.ebk_require_session(p_token, ARRAY['Admin']);

  SELECT * INTO v_u FROM public.ebk_users WHERE id = COALESCE(p_user_id, '') FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Akun tidak ditemukan.');
  END IF;
  IF v_u.id = 'admin123' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Akun operator utama admin123 tidak dapat dihapus.');
  END IF;
  IF v_u.role = 'Admin' AND v_me.role <> 'Admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Hanya Administrator yang dapat menghapus akun Admin.');
  END IF;
  IF v_u.id = v_me.id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Anda tidak bisa menghapus akun Anda sendiri.');
  END IF;
  IF v_u.role = 'Guru_BK' AND v_me.role <> 'Admin' THEN
    SELECT COUNT(*) INTO v_bk_count FROM public.ebk_users WHERE role = 'Guru_BK';
    IF v_bk_count <= 1 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Minimal harus ada satu akun Guru BK.');
    END IF;
  END IF;
  IF v_u.role = 'Murid' THEN
    IF v_me.role = 'Admin' THEN
      UPDATE public.ebk_users SET terkait_id_siswa = '' WHERE role = 'Ortu' AND terkait_id_siswa = v_u.id;
    ELSIF EXISTS (SELECT 1 FROM public.ebk_users WHERE role = 'Ortu' AND terkait_id_siswa = v_u.id) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Hapus atau pindahkan akun orang tua yang terhubung ke siswa ini lebih dulu.');
    END IF;
  END IF;

  DELETE FROM public.ebk_users WHERE id = v_u.id;
  RETURN jsonb_build_object('success', true, 'message', 'Akun ' || v_u.nama || ' dihapus. Riwayat catatan tetap tersimpan.');
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_delete_catatan_poin(p_token TEXT, p_id_catatan TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_c public.ebk_catatan_poin;
  v_s public.ebk_users;
  v_baru INTEGER;
BEGIN
  PERFORM public.ebk_require_session(p_token, ARRAY['Admin']);

  SELECT * INTO v_c FROM public.ebk_catatan_poin WHERE id = COALESCE(p_id_catatan, '') FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Catatan poin tidak ditemukan.');
  END IF;

  SELECT * INTO v_s FROM public.ebk_users WHERE id = v_c.id_siswa AND role = 'Murid' FOR UPDATE;
  IF FOUND THEN
    v_baru := GREATEST(0, LEAST(100, v_s.poin - v_c.perubahan_poin));
    UPDATE public.ebk_users
    SET poin = v_baru,
        status_sp = public.ebk_hitung_status_sp(v_baru)
    WHERE id = v_s.id;
  END IF;

  DELETE FROM public.ebk_catatan_poin WHERE id = v_c.id;
  RETURN jsonb_build_object('success', true, 'message', 'Catatan ' || v_c.id || ' dihapus dan poin siswa disesuaikan.');
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_delete_konseling(p_token TEXT, p_id_konseling TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_k public.ebk_konseling;
BEGIN
  PERFORM public.ebk_require_session(p_token, ARRAY['Admin']);

  SELECT * INTO v_k FROM public.ebk_konseling WHERE id = COALESCE(p_id_konseling, '') FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Data konseling tidak ditemukan.');
  END IF;

  DELETE FROM public.ebk_konseling WHERE id = v_k.id;
  RETURN jsonb_build_object('success', true, 'message', 'Data konseling ' || v_k.id || ' dihapus.');
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_delete_laporan_guru(p_token TEXT, p_id_laporan TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_l public.ebk_laporan_guru;
BEGIN
  PERFORM public.ebk_require_session(p_token, ARRAY['Admin']);

  SELECT * INTO v_l FROM public.ebk_laporan_guru WHERE id = COALESCE(p_id_laporan, '') FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Laporan guru tidak ditemukan.');
  END IF;

  DELETE FROM public.ebk_laporan_guru WHERE id = v_l.id;
  RETURN jsonb_build_object('success', true, 'message', 'Laporan ' || v_l.id || ' dihapus.');
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_admin_tambah_konseling(
  p_token TEXT,
  p_id_siswa TEXT,
  p_topik TEXT,
  p_cerita TEXT,
  p_jadwal TEXT,
  p_catatan_bk TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_s public.ebk_users;
  v_cerita TEXT := left(btrim(COALESCE(p_cerita, '')), 500);
  v_jadwal TEXT := left(btrim(COALESCE(p_jadwal, '')), 100);
  v_catatan TEXT := left(btrim(COALESCE(p_catatan_bk, '')), 200);
  v_id TEXT;
  v_status TEXT;
BEGIN
  PERFORM public.ebk_require_session(p_token, ARRAY['Admin']);

  SELECT * INTO v_s FROM public.ebk_users WHERE id = COALESCE(p_id_siswa, '') AND role = 'Murid';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Siswa tidak ditemukan.');
  END IF;
  IF p_topik NOT IN ('Pribadi & Sosial', 'Akademik & Belajar', 'Karir, PKL & Kuliah', 'Masalah Kedisiplinan') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Topik tidak valid.');
  END IF;
  IF v_cerita = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Keterangan / topik ringkas wajib diisi.');
  END IF;

  v_status := CASE WHEN v_jadwal <> '' THEN 'Disetujui & Terjadwal' ELSE 'Menunggu' END;
  v_id := public.ebk_next_id('konseling', 'KS-', 2001, 0);

  INSERT INTO public.ebk_konseling (id, tanggal, id_siswa, nama_siswa, kelas, topik, cerita, status, jadwal, catatan_bk)
  VALUES (
    v_id,
    to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
    v_s.id, v_s.nama, v_s.kelas_info, p_topik, v_cerita, v_status,
    CASE WHEN v_jadwal <> '' THEN v_jadwal ELSE '-' END,
    CASE WHEN v_catatan <> '' THEN v_catatan ELSE '-' END
  );

  RETURN jsonb_build_object('success', true, 'message', 'Data konseling untuk ' || v_s.nama || ' ditambahkan.');
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ebk_save_school_config(
  p_token TEXT,
  p_nama_sekolah TEXT,
  p_alamat TEXT,
  p_tahun_ajaran TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_nama TEXT := left(btrim(COALESCE(p_nama_sekolah, '')), 150);
  v_alamat TEXT := left(btrim(COALESCE(p_alamat, '')), 250);
  v_tahun TEXT := left(btrim(COALESCE(p_tahun_ajaran, '')), 30);
BEGIN
  PERFORM public.ebk_require_session(p_token, ARRAY['Admin']);
  IF v_nama = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Nama sekolah wajib diisi.');
  END IF;

  INSERT INTO public.ebk_pengaturan_sekolah (key, value) VALUES
    ('Nama_Sekolah', v_nama),
    ('Alamat', v_alamat),
    ('Tahun_Ajaran', v_tahun)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  RETURN jsonb_build_object('success', true, 'message', 'Pengaturan sekolah berhasil disimpan.');
EXCEPTION WHEN OTHERS THEN
  IF left(SQLERRM, 8) = 'EXPIRED:' THEN
    RETURN jsonb_build_object('success', false, 'expired', true, 'message', substr(SQLERRM, 9));
  END IF;
  RETURN jsonb_build_object('success', false, 'message', regexp_replace(SQLERRM, '^ERR:', ''));
END;
$$;

-- 5. IZINKAN EKSEKUSI RPC UNTUK KLIEN WEBSITE (ANON)
REVOKE ALL ON FUNCTION public.ebk_get_salt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ebk_hash_pw(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ebk_check_pw(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ebk_next_id(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ebk_require_session(TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ebk_seed_data() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ebk_ping() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_get_login_accounts() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_login_user(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_akhiri_sesi(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_ubah_sandi(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_jalankan_setup(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_get_all_app_data(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_tambah_catatan_poin(TEXT, TEXT, TEXT, NUMERIC, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_update_tindakan_siswa(TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_ajukan_konseling(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_setujui_konseling(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_tolak_konseling(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_save_user_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_delete_user_account(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_ajukan_laporan_guru(TEXT, TEXT, TEXT, NUMERIC, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_verifikasi_laporan_guru(TEXT, TEXT, TEXT, NUMERIC, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_selesaikan_konseling(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_delete_catatan_poin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_delete_konseling(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_delete_laporan_guru(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_admin_tambah_konseling(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ebk_save_school_config(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
