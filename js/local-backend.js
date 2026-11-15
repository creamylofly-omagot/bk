/* E-BK SMKN 1 Kota Binjai: standalone browser LocalBackend (localStorage) */
(function (globalScope) {
  'use strict';

  const DB_KEY = 'ebk_smkn1_binjai_db_v1';
  const ROLES = ['Murid', 'Guru', 'Ortu', 'Guru_BK', 'Admin'];
  const TOPIK = ['Pribadi & Sosial', 'Akademik & Belajar', 'Karir, PKL & Kuliah', 'Masalah Kedisiplinan'];
  const SESSION_TTL_MS = 21600 * 1000; // 6 jam

  function formatJakarta(date, withTime) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
      .formatToParts(date)
      .reduce((acc, p) => {
        acc[p.type] = p.value;
        return acc;
      }, {});
    const d = `${parts.year}-${parts.month}-${parts.day}`;
    return withTime ? `${d} ${parts.hour}:${parts.minute}` : d;
  }

  function hitungStatusSP(poin) {
    const p = Number(poin);
    if (p >= 85) return 'Aman';
    if (p >= 70) return 'SP 1';
    if (p >= 50) return 'SP 2';
    return 'SP 3';
  }

  async function sha256Hex(text) {
    const cryptoObj = globalScope.crypto;
    if (cryptoObj && cryptoObj.subtle) {
      const buf = await cryptoObj.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  async function hashPw(salt, pw) {
    return 'h$' + (await sha256Hex(salt + String(pw)));
  }

  async function checkPw(salt, stored, input) {
    const s = String(stored);
    if (s.indexOf('h$') === 0) return s === (await hashPw(salt, input));
    return s === String(input);
  }

  function randomUuid() {
    const cryptoObj = globalScope.crypto;
    if (cryptoObj && cryptoObj.randomUUID) return cryptoObj.randomUUID();
    return 'tok-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
  }

  async function createInitialDb() {
    const salt = randomUuid();
    const pw = await hashPw(salt, '123456');
    const adminPw = await hashPw(salt, '123admin');
    const today = formatJakarta(new Date(), false);
    const now = formatJakarta(new Date(), true);

    return {
      salt,
      config: [
        { Key: 'Nama_Sekolah', Value: 'SMKN 1 Kota Binjai' },
        { Key: 'Alamat', Value: 'Jl. Samanhudi No.20, Satria, Kec. Binjai Kota, Kota Binjai, Sumatera Utara 20741' },
        { Key: 'Tahun_Ajaran', Value: '2026/2027' }
      ],
      users: [
        { id: 'BK01', role: 'Guru_BK', nama: 'Dra. Hj. Nurhayati, M.Psi (Guru BK)', password: pw, kelasInfo: 'Ruang BK Utama', poin: 100, statusSP: '-', skorsing: 'Tidak', terkaitIdSiswa: '' },
        { id: 'GR01', role: 'Guru', nama: 'Samsudin, M.Pd', password: pw, kelasInfo: 'Wali Kelas XI RPL 1', poin: 100, statusSP: '-', skorsing: 'Tidak', terkaitIdSiswa: '' },
        { id: 'GR02', role: 'Guru', nama: 'Rina Marlina, S.Kom', password: pw, kelasInfo: 'Wali Kelas XI TKJ 1', poin: 100, statusSP: '-', skorsing: 'Tidak', terkaitIdSiswa: '' },
        { id: 'GR03', role: 'Guru', nama: 'Budi Santoso, S.Pd', password: pw, kelasInfo: 'Guru Produktif AKL', poin: 100, statusSP: '-', skorsing: 'Tidak', terkaitIdSiswa: '' },
        { id: 'SW01', role: 'Murid', nama: 'Aminah', password: pw, kelasInfo: 'XI RPL 1', poin: 100, statusSP: 'Aman', skorsing: 'Tidak', terkaitIdSiswa: '' },
        { id: 'SW02', role: 'Murid', nama: 'Muhammad Rizky Pratama', password: pw, kelasInfo: 'XI RPL 1', poin: 80, statusSP: 'SP 1', skorsing: 'Tidak', terkaitIdSiswa: '' },
        { id: 'SW03', role: 'Murid', nama: 'Siti Aisyah Putri', password: pw, kelasInfo: 'XI RPL 1', poin: 100, statusSP: 'Aman', skorsing: 'Tidak', terkaitIdSiswa: '' },
        { id: 'SW04', role: 'Murid', nama: 'Dimas Anggara', password: pw, kelasInfo: 'XI TKJ 1', poin: 60, statusSP: 'SP 2', skorsing: 'Tidak', terkaitIdSiswa: '' },
        { id: 'SW05', role: 'Murid', nama: 'Nabila Syakieb', password: pw, kelasInfo: 'XI TKJ 1', poin: 95, statusSP: 'Aman', skorsing: 'Tidak', terkaitIdSiswa: '' },
        { id: 'SW06', role: 'Murid', nama: 'Fajar Nugroho', password: pw, kelasInfo: 'XII AKL 2', poin: 35, statusSP: 'SP 3', skorsing: 'Ya', terkaitIdSiswa: '' },
        { id: 'OT01', role: 'Ortu', nama: 'Bpk. Ahmad (Wali dari Aminah)', password: pw, kelasInfo: 'Ortu XI RPL 1', poin: 100, statusSP: '-', skorsing: 'Tidak', terkaitIdSiswa: 'SW01' },
        { id: 'OT02', role: 'Ortu', nama: 'Ibu Siti (Wali dari M. Rizky)', password: pw, kelasInfo: 'Ortu XI RPL 1', poin: 100, statusSP: '-', skorsing: 'Tidak', terkaitIdSiswa: 'SW02' },
        { id: 'OT03', role: 'Ortu', nama: 'Bpk. Hendra (Wali dari Dimas)', password: pw, kelasInfo: 'Ortu XI TKJ 1', poin: 100, statusSP: '-', skorsing: 'Tidak', terkaitIdSiswa: 'SW04' }
        , { id: 'admin123', role: 'Admin', nama: 'Administrator / Operator Sistem', password: adminPw, kelasInfo: 'Operator Pusat', poin: 100, statusSP: '-', skorsing: 'Tidak', terkaitIdSiswa: '' }
      ],
      catatan: [
        { id: 'CT-1001', tanggal: today, idSiswa: 'SW01', namaSiswa: 'Aminah', kelas: 'XI RPL 1', jenis: 'Prestasi', keterangan: 'Juara 1 LKS Web Technologies Tingkat Kota Binjai', perubahanPoin: 15, pelapor: 'Samsudin, M.Pd' },
        { id: 'CT-1002', tanggal: today, idSiswa: 'SW01', namaSiswa: 'Aminah', kelas: 'XI RPL 1', jenis: 'Pelanggaran', keterangan: 'Terlambat mengikuti apel pagi (15 menit)', perubahanPoin: -15, pelapor: 'Dra. Hj. Nurhayati, M.Psi (Guru BK)' },
        { id: 'CT-1003', tanggal: today, idSiswa: 'SW02', namaSiswa: 'Muhammad Rizky Pratama', kelas: 'XI RPL 1', jenis: 'Pelanggaran', keterangan: 'Tidak memakai atribut dasi dan topi saat upacara', perubahanPoin: -20, pelapor: 'Samsudin, M.Pd' },
        { id: 'CT-1004', tanggal: today, idSiswa: 'SW04', namaSiswa: 'Dimas Anggara', kelas: 'XI TKJ 1', jenis: 'Pelanggaran', keterangan: 'Bolos pada jam pelajaran ke-5 dan ke-6', perubahanPoin: -40, pelapor: 'Rina Marlina, S.Kom' },
        { id: 'CT-1005', tanggal: today, idSiswa: 'SW06', namaSiswa: 'Fajar Nugroho', kelas: 'XII AKL 2', jenis: 'Pelanggaran', keterangan: 'Terlibat perkelahian di area parkir sekolah', perubahanPoin: -65, pelapor: 'Dra. Hj. Nurhayati, M.Psi (Guru BK)' }
      ],
      konseling: [
        { id: 'KS-2001', tanggal: now, idSiswa: 'SW01', namaSiswa: 'Aminah', kelas: 'XI RPL 1', topik: 'Karir, PKL & Kuliah', cerita: 'Ingin cerita sedikit mengenai kebingungan memilih tempat PKL dan persiapan kuliah.', status: 'Menunggu', jadwal: '-', catatanBK: '-' }
      ],
      laporan: [],
      sessions: {},
      loginFails: {}
    };
  }

  async function loadDb() {
    const raw = globalScope.localStorage.getItem(DB_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.catatan) && Array.isArray(parsed.konseling)) {
          parsed.sessions = parsed.sessions || {};
          parsed.loginFails = parsed.loginFails || {};
          parsed.laporan = Array.isArray(parsed.laporan) ? parsed.laporan : [];
          if (!parsed.users.some(u => u.id === 'admin123')) {
            parsed.users.push({
              id: 'admin123',
              role: 'Admin',
              nama: 'Administrator / Operator Sistem',
              password: await hashPw(parsed.salt || '', '123admin'),
              kelasInfo: 'Operator Pusat',
              poin: 100,
              statusSP: '-',
              skorsing: 'Tidak',
              terkaitIdSiswa: ''
            });
            saveDb(parsed);
          }
          return parsed;
        }
      } catch (e) {}
    }
    const fresh = await createInitialDb();
    saveDb(fresh);
    return fresh;
  }

  function saveDb(db) {
    globalScope.localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  function pub(u) {
    return {
      id: u.id,
      role: u.role,
      nama: u.nama,
      kelasInfo: u.kelasInfo,
      poin: Number(u.poin),
      statusSP: u.statusSP,
      skorsing: u.skorsing,
      terkaitIdSiswa: u.terkaitIdSiswa || ''
    };
  }

  function nextId(items, prefix, start, pad) {
    let max = start - 1;
    items.forEach(item => {
      const s = String(item.id || '');
      if (s.indexOf(prefix) === 0) {
        const n = parseInt(s.slice(prefix.length), 10);
        if (n > max) max = n;
      }
    });
    const n = String(max + 1);
    return prefix + (pad ? ('0000' + n).slice(-Math.max(pad, n.length)) : n);
  }

  function requireSession(db, token, roles) {
    const now = Date.now();
    const sess = token && db.sessions[token];
    if (!sess || sess.exp <= now) {
      if (token && db.sessions[token]) {
        delete db.sessions[token];
        saveDb(db);
      }
      const err = new Error('Sesi berakhir. Silakan masuk kembali.');
      err.expired = true;
      throw err;
    }
    const u = db.users.find(x => x.id === sess.userId);
    if (!u) {
      const err = new Error('Sesi berakhir. Silakan masuk kembali.');
      err.expired = true;
      throw err;
    }
    if (roles && roles.indexOf(u.role) < 0) {
      throw new Error('Anda tidak memiliki akses untuk tindakan ini.');
    }
    return u;
  }

  async function reset() {
    const fresh = await createInitialDb();
    saveDb(fresh);
    return { success: true, message: 'Data lokal berhasil direset ke data contoh awal.' };
  }

  async function dispatch(action, args) {
    try {
      const db = await loadDb();

      if (action === 'getLoginAccounts') {
        return {
          success: true,
          data: db.users.filter(u => u.role !== 'Admin').map(u => ({ id: u.id, role: u.role, nama: u.nama, kelasInfo: u.kelasInfo }))
        };
      }

      if (action === 'loginUser') {
        const userId = String(args[0] || '');
        const password = String(args[1] || '');
        const now = Date.now();
        const failInfo = db.loginFails[userId];
        if (failInfo && failInfo.exp > now && failInfo.count >= 5) {
          return { success: false, message: 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.' };
        }
        const u = db.users.find(x => x.id === userId);
        if (!u) return { success: false, message: 'Akun tidak ditemukan!' };

        const ok = await checkPw(db.salt, u.password, password);
        if (!ok) {
          const count = failInfo && failInfo.exp > now ? failInfo.count + 1 : 1;
          db.loginFails[userId] = { count, exp: now + 600000 };
          saveDb(db);
          return { success: false, message: 'Kata sandi yang Anda masukkan salah!' };
        }

        delete db.loginFails[userId];
        if (String(u.password).indexOf('h$') !== 0) {
          u.password = await hashPw(db.salt, password);
        }
        const token = randomUuid();
        db.sessions[token] = { userId: u.id, exp: now + SESSION_TTL_MS };
        saveDb(db);
        return { success: true, token, user: pub(u) };
      }

      if (action === 'akhiriSesi') {
        const token = args[0];
        if (token && db.sessions[token]) {
          delete db.sessions[token];
          saveDb(db);
        }
        return { success: true };
      }

      if (action === 'ubahSandi') {
        const [token, lama, baru] = args;
        const me = requireSession(db, token);
        if (!(await checkPw(db.salt, me.password, lama))) throw new Error('Sandi lama salah.');
        if (String(baru || '').length < 6) throw new Error('Sandi baru minimal 6 karakter.');
        me.password = await hashPw(db.salt, baru);
        saveDb(db);
        return { success: true, message: 'Sandi berhasil diubah.' };
      }

      if (action === 'jalankanSetup') {
        requireSession(db, args[0], ['Admin']);
        saveDb(db);
        return { success: true, message: 'Struktur database lokal sudah lengkap.' };
      }

      if (action === 'getAllAppData') {
        const me = requireSession(db, args[0]);
        let students = db.users.filter(u => u.role === 'Murid');
        let catatan = db.catatan.slice();
        let konseling = db.konseling.slice();
        let laporan = [];
        let users = [];

        if (me.role === 'Guru_BK' || me.role === 'Admin') {
          users = me.role === 'Admin' ? db.users.map(pub) : [];
          laporan = db.laporan.slice();
        } else if (me.role === 'Guru') {
          catatan = catatan.filter(c => c.pelapor === me.nama);
          konseling = [];
          laporan = db.laporan.filter(l => l.idPelapor === me.id);
        } else {
          const sid = me.role === 'Murid' ? me.id : me.terkaitIdSiswa;
          students = students.filter(s => s.id === sid);
          catatan = catatan.filter(c => c.idSiswa === sid);
          konseling = konseling.filter(k => k.idSiswa === sid);
          if (me.role === 'Ortu') {
            konseling = konseling.map(k => Object.assign({}, k, { cerita: '(Isi cerita bersifat rahasia)' }));
          }
        }

        const getCfg = k => {
          const row = (db.config || []).find(x => x.Key === k);
          return row ? row.Value : '';
        };
        const schoolConfig = {
          namaSekolah: getCfg('Nama_Sekolah') || 'SMKN 1 Kota Binjai',
          alamat: getCfg('Alamat'),
          tahunAjaran: getCfg('Tahun_Ajaran')
        };

        return {
          success: true,
          me: pub(me),
          users,
          students: students.map(pub),
          catatan: catatan.reverse(),
          konseling: konseling.reverse(),
          laporan: laporan.reverse(),
          schoolConfig
        };
      }

      if (action === 'tambahCatatanPoin') {
        const me = requireSession(db, args[0], ['Guru_BK', 'Admin']);
        const p = args[1] || {};
        if (['Pelanggaran', 'Prestasi'].indexOf(p.jenis) < 0) throw new Error('Jenis catatan tidak valid.');
        const bobot = Math.round(Number(p.poin));
        if (!(bobot >= 1 && bobot <= 100)) throw new Error('Bobot poin harus 1 sampai 100.');
        const ket = String(p.keterangan || '').trim().slice(0, 300);
        if (!ket) throw new Error('Keterangan wajib diisi.');
        const s = db.users.find(u => u.id === String(p.idSiswa) && u.role === 'Murid');
        if (!s) throw new Error('Data siswa tidak ditemukan!');

        const baru = Math.max(0, Math.min(100, Number(s.poin) + (p.jenis === 'Prestasi' ? bobot : -bobot)));
        const delta = baru - Number(s.poin);
        const status = hitungStatusSP(baru);
        const prevStatus = s.statusSP;

        db.catatan.push({
          id: nextId(db.catatan, 'CT-', 1001),
          tanggal: formatJakarta(new Date(), false),
          idSiswa: s.id,
          namaSiswa: s.nama,
          kelas: s.kelasInfo,
          jenis: p.jenis,
          keterangan: ket,
          perubahanPoin: delta,
          pelapor: me.nama
        });
        s.poin = baru;
        s.statusSP = status;
        saveDb(db);

        let msg = `Catatan ${p.jenis} untuk ${s.nama} disimpan. Poin kini ${baru}/100 (${status}).`;
        if (status !== 'Aman' && status !== prevStatus) msg += ` Status berubah dari ${prevStatus}.`;
        return { success: true, message: msg };
      }

      if (action === 'ajukanLaporanGuru') {
        const me = requireSession(db, args[0], ['Guru', 'Admin']);
        const p = args[1] || {};
        if (['Pelanggaran', 'Prestasi'].indexOf(p.jenis) < 0) throw new Error('Jenis laporan tidak valid.');
        const bobot = Math.round(Number(p.poin));
        if (!(bobot >= 1 && bobot <= 100)) throw new Error('Usulan bobot poin harus 1 sampai 100.');
        const ket = String(p.keterangan || '').trim().slice(0, 300);
        if (!ket) throw new Error('Keterangan wajib diisi.');
        const s = db.users.find(u => u.id === String(p.idSiswa) && u.role === 'Murid');
        if (!s) throw new Error('Data siswa tidak ditemukan!');

        db.laporan.push({
          id: nextId(db.laporan, 'LP-', 3001),
          tanggal: formatJakarta(new Date(), true),
          idSiswa: s.id,
          namaSiswa: s.nama,
          kelas: s.kelasInfo,
          jenis: p.jenis,
          bobotUsulan: bobot,
          keterangan: ket,
          idPelapor: me.id,
          pelapor: me.nama,
          status: 'Menunggu',
          bobotDisetujui: 0,
          catatanBK: '-',
          diprosesOleh: '-',
          tanggalProses: '-'
        });
        saveDb(db);
        return {
          success: true,
          message: `Laporan untuk ${s.nama} dikirim. Poin akan berubah setelah diverifikasi Guru BK.`
        };
      }

      if (action === 'verifikasiLaporanGuru') {
        const me = requireSession(db, args[0], ['Guru_BK', 'Admin']);
        const [, idLaporan, keputusan, bobotFinal, catatanBK] = args;
        if (['Setujui', 'Tolak'].indexOf(keputusan) < 0) throw new Error('Keputusan tidak valid.');
        const l = db.laporan.find(x => x.id === String(idLaporan));
        if (!l) throw new Error('Laporan tidak ditemukan.');
        if (l.status !== 'Menunggu') throw new Error('Laporan ini sudah diproses.');
        const now = formatJakarta(new Date(), true);
        const ketBK = String(catatanBK || '').trim().slice(0, 200);

        if (keputusan === 'Tolak') {
          l.status = 'Ditolak';
          l.bobotDisetujui = 0;
          l.catatanBK = ketBK || 'Laporan tidak disetujui oleh Guru BK.';
          l.diprosesOleh = me.nama;
          l.tanggalProses = now;
          saveDb(db);
          return { success: true, message: 'Laporan ditolak. Poin siswa tidak berubah.' };
        }

        const bobot = Math.round(Number(bobotFinal || l.bobotUsulan));
        if (!(bobot >= 1 && bobot <= 100)) throw new Error('Bobot poin final harus 1 sampai 100.');
        const s = db.users.find(u => u.id === l.idSiswa && u.role === 'Murid');
        if (!s) throw new Error('Siswa tidak ditemukan.');

        const baru = Math.max(0, Math.min(100, Number(s.poin) + (l.jenis === 'Prestasi' ? bobot : -bobot)));
        const delta = baru - Number(s.poin);
        const status = hitungStatusSP(baru);

        db.catatan.push({
          id: nextId(db.catatan, 'CT-', 1001),
          tanggal: formatJakarta(new Date(), false),
          idSiswa: s.id,
          namaSiswa: s.nama,
          kelas: s.kelasInfo,
          jenis: l.jenis,
          keterangan: l.keterangan,
          perubahanPoin: delta,
          pelapor: l.pelapor
        });
        s.poin = baru;
        s.statusSP = status;
        l.status = 'Disetujui';
        l.bobotDisetujui = bobot;
        l.catatanBK = ketBK || 'Disetujui dan poin diperbarui.';
        l.diprosesOleh = me.nama;
        l.tanggalProses = now;
        saveDb(db);
        return { success: true, message: `Laporan disetujui. Poin ${s.nama} kini ${baru}/100 (${status}).` };
      }

      if (action === 'updateTindakanSiswa') {
        const me = requireSession(db, args[0], ['Guru_BK', 'Admin']);
        const [, idSiswa, skorsing, resetPoin] = args;
        if (['Ya', 'Tidak'].indexOf(skorsing) < 0) throw new Error('Status skorsing tidak valid.');
        const s = db.users.find(u => u.id === String(idSiswa) && u.role === 'Murid');
        if (!s) throw new Error('Siswa tidak ditemukan.');
        s.skorsing = skorsing;
        if (resetPoin && Number(s.poin) < 100) {
          const delta = 100 - Number(s.poin);
          s.poin = 100;
          s.statusSP = 'Aman';
          db.catatan.push({
            id: nextId(db.catatan, 'CT-', 1001),
            tanggal: formatJakarta(new Date(), false),
            idSiswa: s.id,
            namaSiswa: s.nama,
            kelas: s.kelasInfo,
            jenis: 'Pemulihan',
            keterangan: 'Poin dipulihkan setelah pembinaan selesai',
            perubahanPoin: delta,
            pelapor: me.nama
          });
        }
        saveDb(db);
        return { success: true, message: 'Status tindakan siswa berhasil diperbarui.' };
      }

      if (action === 'ajukanKonseling') {
        const me = requireSession(db, args[0], ['Murid']);
        const p = args[1] || {};
        const cerita = String(p.cerita || '').trim().slice(0, 500);
        if (!cerita) throw new Error('Cerita singkat wajib diisi.');
        if (TOPIK.indexOf(p.topik) < 0) throw new Error('Topik tidak valid.');
        const menunggu = db.konseling.filter(k => k.idSiswa === me.id && k.status === 'Menunggu').length;
        if (menunggu >= 3) throw new Error('Anda masih punya 3 pengajuan yang menunggu. Tunggu jawaban Guru BK dulu.');

        db.konseling.push({
          id: nextId(db.konseling, 'KS-', 2001),
          tanggal: formatJakarta(new Date(), true),
          idSiswa: me.id,
          namaSiswa: me.nama,
          kelas: me.kelasInfo,
          topik: p.topik,
          cerita,
          status: 'Menunggu',
          jadwal: '-',
          catatanBK: '-'
        });
        saveDb(db);
        return { success: true, message: 'Pengajuan konseling terkirim. Menunggu persetujuan Guru BK.' };
      }

      if (action === 'setujuiKonseling') {
        requireSession(db, args[0], ['Guru_BK', 'Admin']);
        const [, id, jadwalRaw, catatanBK] = args;
        const jadwal = String(jadwalRaw || '').trim().slice(0, 100);
        if (!jadwal) throw new Error('Jadwal wajib diisi.');
        const k = db.konseling.find(x => x.id === String(id));
        if (!k) throw new Error('Pengajuan tidak ditemukan.');
        if (k.status !== 'Menunggu') throw new Error('Pengajuan ini sudah diproses.');
        k.status = 'Disetujui & Terjadwal';
        k.jadwal = jadwal;
        k.catatanBK = String(catatanBK || '').trim().slice(0, 200) || 'Silakan hadir tepat waktu di Ruang BK.';
        saveDb(db);
        return { success: true, message: 'Konseling disetujui dan jadwal sudah tampil di akun siswa.' };
      }

      if (action === 'tolakKonseling') {
        requireSession(db, args[0], ['Guru_BK', 'Admin']);
        const [, id, alasan] = args;
        const k = db.konseling.find(x => x.id === String(id));
        if (!k) throw new Error('Pengajuan tidak ditemukan.');
        if (k.status !== 'Menunggu') throw new Error('Pengajuan ini sudah diproses.');
        k.status = 'Ditolak';
        k.catatanBK = String(alasan || '').trim().slice(0, 200) || 'Silakan ajukan ulang atau temui Guru BK.';
        saveDb(db);
        return { success: true, message: 'Pengajuan ditolak dan alasan sudah dikirim ke siswa.' };
      }

      if (action === 'selesaikanKonseling') {
        requireSession(db, args[0], ['Guru_BK', 'Admin']);
        const [, id, catatanBK] = args;
        const k = db.konseling.find(x => x.id === String(id));
        if (!k) throw new Error('Pengajuan tidak ditemukan.');
        if (k.status !== 'Disetujui & Terjadwal') throw new Error('Hanya konseling terjadwal yang bisa ditandai selesai.');
        k.status = 'Selesai';
        const ket = String(catatanBK || '').trim().slice(0, 200);
        if (ket) k.catatanBK = ket;
        else if (!k.catatanBK || k.catatanBK === '-') k.catatanBK = 'Sesi konseling telah selesai dilaksanakan.';
        saveDb(db);
        return { success: true, message: 'Sesi konseling ditandai selesai.' };
      }

      if (action === 'saveUserAccount') {
        const me = requireSession(db, args[0], ['Admin']);
        const p = args[1] || {};
        const nama = String(p.nama || '').trim().slice(0, 100);
        const kelasInfo = String(p.kelasInfo || '').trim().slice(0, 100);
        if (ROLES.indexOf(p.role) < 0) throw new Error('Peran tidak valid.');
        if (p.role === 'Admin' && me.role !== 'Admin') throw new Error('Hanya Administrator yang dapat mengelola akun Admin.');
        if (!nama || !kelasInfo) throw new Error('Nama dan kelas/info wajib diisi.');

        let terkait = '';
        if (p.role === 'Ortu') {
          terkait = String(p.terkaitIdSiswa || '');
          if (!db.users.some(u => u.id === terkait && u.role === 'Murid')) {
            throw new Error('Akun orang tua harus dihubungkan ke siswa yang valid.');
          }
        }

        if (p.mode === 'add') {
          if (String(p.password || '').length < 6) throw new Error('Sandi minimal 6 karakter.');
          const prefix = { Murid: 'SW', Guru: 'GR', Ortu: 'OT', Guru_BK: 'BK', Admin: 'AD' }[p.role];
          const newId = nextId(db.users, prefix, 1, 2);
          db.users.push({
            id: newId,
            role: p.role,
            nama,
            password: await hashPw(db.salt, p.password),
            kelasInfo,
            poin: 100,
            statusSP: p.role === 'Murid' ? 'Aman' : '-',
            skorsing: 'Tidak',
            terkaitIdSiswa: terkait
          });
          saveDb(db);
          return { success: true, message: `Akun ${nama} berhasil ditambahkan.` };
        }

        if (p.mode === 'edit') {
          const u = db.users.find(x => x.id === String(p.id));
          if (!u) throw new Error('Akun tidak ditemukan.');
          if (u.role === 'Admin' && me.role !== 'Admin') throw new Error('Hanya Administrator yang dapat mengubah akun Admin.');
          if (u.id === me.id && p.role !== u.role) throw new Error('Anda tidak bisa mengubah peran akun Anda sendiri.');
          if (u.role !== p.role) throw new Error('Peran akun tidak bisa diubah. Buat akun baru jika perlu.');
          if (p.password && String(p.password).length < 6) throw new Error('Sandi minimal 6 karakter.');
          u.nama = nama;
          u.kelasInfo = kelasInfo;
          u.terkaitIdSiswa = terkait;
          if (p.password) u.password = await hashPw(db.salt, p.password);
          saveDb(db);
          return { success: true, message: `Data akun ${nama} diperbarui.` };
        }

        throw new Error('Mode tidak dikenal.');
      }

      if (action === 'deleteUserAccount') {
        const me = requireSession(db, args[0], ['Admin']);
        const userId = String(args[1] || '');
        const idx = db.users.findIndex(x => x.id === userId);
        if (idx < 0) throw new Error('Akun tidak ditemukan.');
        const u = db.users[idx];
        if (u.id === 'admin123') throw new Error('Akun operator utama admin123 tidak dapat dihapus.');
        if (u.role === 'Admin' && me.role !== 'Admin') throw new Error('Hanya Administrator yang dapat menghapus akun Admin.');
        if (u.id === me.id) throw new Error('Anda tidak bisa menghapus akun Anda sendiri.');
        if (u.role === 'Guru_BK' && me.role !== 'Admin' && db.users.filter(x => x.role === 'Guru_BK').length <= 1) {
          throw new Error('Minimal harus ada satu akun Guru BK.');
        }
        if (u.role === 'Murid') {
          if (me.role === 'Admin') {
            db.users.forEach(x => {
              if (x.role === 'Ortu' && x.terkaitIdSiswa === u.id) x.terkaitIdSiswa = '';
            });
          } else if (db.users.some(x => x.role === 'Ortu' && x.terkaitIdSiswa === u.id)) {
            throw new Error('Hapus atau pindahkan akun orang tua yang terhubung ke siswa ini lebih dulu.');
          }
        }
        db.users.splice(idx, 1);
        saveDb(db);
        return { success: true, message: `Akun ${u.nama} dihapus. Riwayat catatan tetap tersimpan.` };
      }

      if (action === 'deleteCatatanPoin') {
        requireSession(db, args[0], ['Admin']);
        const idCatatan = String(args[1] || '');
        const idx = db.catatan.findIndex(x => x.id === idCatatan);
        if (idx < 0) throw new Error('Catatan poin tidak ditemukan.');
        const c = db.catatan[idx];
        const s = db.users.find(x => x.id === c.idSiswa && x.role === 'Murid');
        if (s) {
          const baru = Math.max(0, Math.min(100, Number(s.poin) - Number(c.perubahanPoin)));
          s.poin = baru;
          s.statusSP = hitungStatusSP(baru);
        }
        db.catatan.splice(idx, 1);
        saveDb(db);
        return { success: true, message: `Catatan ${c.id} dihapus dan poin siswa disesuaikan.` };
      }

      if (action === 'deleteKonseling') {
        requireSession(db, args[0], ['Admin']);
        const idKs = String(args[1] || '');
        const idx = db.konseling.findIndex(x => x.id === idKs);
        if (idx < 0) throw new Error('Data konseling tidak ditemukan.');
        const k = db.konseling[idx];
        db.konseling.splice(idx, 1);
        saveDb(db);
        return { success: true, message: `Data konseling ${k.id} dihapus.` };
      }

      if (action === 'deleteLaporanGuru') {
        requireSession(db, args[0], ['Admin']);
        const idLp = String(args[1] || '');
        const idx = db.laporan.findIndex(x => x.id === idLp);
        if (idx < 0) throw new Error('Laporan guru tidak ditemukan.');
        const l = db.laporan[idx];
        db.laporan.splice(idx, 1);
        saveDb(db);
        return { success: true, message: `Laporan ${l.id} dihapus.` };
      }

      if (action === 'adminTambahKonseling') {
        requireSession(db, args[0], ['Admin']);
        const p = args[1] || {};
        const s = db.users.find(x => x.id === String(p.idSiswa || '') && x.role === 'Murid');
        if (!s) throw new Error('Siswa tidak ditemukan.');
        if (TOPIK.indexOf(p.topik) < 0) throw new Error('Topik tidak valid.');
        const cerita = String(p.cerita || '').trim().slice(0, 500);
        if (!cerita) throw new Error('Keterangan / topik ringkas wajib diisi.');
        const jadwal = String(p.jadwal || '').trim().slice(0, 100);
        const catatan = String(p.catatanBK || '').trim().slice(0, 200);
        db.konseling.push({
          id: nextId(db.konseling, 'KS-', 2001),
          tanggal: formatJakarta(new Date(), true),
          idSiswa: s.id,
          namaSiswa: s.nama,
          kelas: s.kelasInfo,
          topik: p.topik,
          cerita,
          status: jadwal ? 'Disetujui & Terjadwal' : 'Menunggu',
          jadwal: jadwal || '-',
          catatanBK: catatan || '-'
        });
        saveDb(db);
        return { success: true, message: `Data konseling untuk ${s.nama} ditambahkan.` };
      }

      if (action === 'saveSchoolConfig') {
        requireSession(db, args[0], ['Admin']);
        const p = args[1] || {};
        const nama = String(p.namaSekolah || '').trim().slice(0, 150);
        const alamat = String(p.alamat || '').trim().slice(0, 250);
        const tahun = String(p.tahunAjaran || '').trim().slice(0, 30);
        if (!nama) throw new Error('Nama sekolah wajib diisi.');
        db.config = [
          { Key: 'Nama_Sekolah', Value: nama },
          { Key: 'Alamat', Value: alamat },
          { Key: 'Tahun_Ajaran', Value: tahun }
        ];
        saveDb(db);
        return { success: true, message: 'Pengaturan sekolah berhasil disimpan.' };
      }

      if (action === 'importUsersCsv') {
        requireSession(db, args[0], ['Admin']);
        const rows = args[1];
        if (!Array.isArray(rows)) throw new Error('Format data CSV tidak valid.');
        if (rows.length === 0) throw new Error('Tidak ada baris akun untuk diimpor.');
        if (rows.length > 500) throw new Error('Maksimal 500 akun per sekali impor.');
        const allowedRoles = ['Murid', 'Guru', 'Ortu', 'Guru_BK'];
        const defaultPw = await hashPw(db.salt, '123456');
        let added = 0;
        let skipped = 0;
        for (const row of rows) {
          const role = String((row && row.role) || '').trim();
          const nama = String((row && row.nama) || '').trim().slice(0, 100);
          const kelasInfo = String((row && row.kelasInfo) || '').trim().slice(0, 100);
          const pw = String((row && row.password) || '');
          let terkait = String((row && row.terkaitIdSiswa) || '').trim();
          if (allowedRoles.indexOf(role) < 0 || !nama || !kelasInfo) {
            skipped++;
            continue;
          }
          if (pw !== '' && pw.length < 6) {
            skipped++;
            continue;
          }
          if (role === 'Ortu') {
            if (!db.users.some(u => u.id === terkait && u.role === 'Murid')) {
              skipped++;
              continue;
            }
          } else {
            terkait = '';
          }
          const prefix = { Murid: 'SW', Guru: 'GR', Ortu: 'OT', Guru_BK: 'BK' }[role];
          const newId = nextId(db.users, prefix, 1, 2);
          db.users.push({
            id: newId,
            role,
            nama,
            password: pw === '' ? defaultPw : await hashPw(db.salt, pw),
            kelasInfo,
            poin: 100,
            statusSP: role === 'Murid' ? 'Aman' : '-',
            skorsing: 'Tidak',
            terkaitIdSiswa: terkait
          });
          added++;
        }
        saveDb(db);
        return {
          success: true,
          added,
          skipped,
          message: `${added} akun berhasil diimpor${skipped > 0 ? ` (${skipped} baris dilewati).` : '.'}`
        };
      }

      throw new Error('Aksi tidak dikenal.');
    } catch (e) {
      return { success: false, expired: !!(e && e.expired), message: e && e.message ? e.message : String(e) };
    }
  }

  const api = { dispatch, reset, hitungStatusSP };
  globalScope.LocalBackend = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
