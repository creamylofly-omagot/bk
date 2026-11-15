/**
 * E-BK SMKN 1 KOTA BINJAI - Backend (Code.gs)
 * Mendukung mode:
 * 1. Native Google Apps Script Web App (google.script.run + HtmlService)
 * 2. REST/JSON API Endpoint via doPost(e) untuk frontend yang di-host di GitHub Pages
 *
 * Catatan: fungsi berakhiran "_" bersifat privat (tidak bisa dipanggil dari browser).
 */
const SHEET = { USERS: 'Users', CATATAN: 'Catatan_Poin', KONSELING: 'Konseling', CONFIG: 'Pengaturan_Sekolah', LAPORAN: 'Laporan_Guru' };
const TZ = 'Asia/Jakarta';
const SESSION_TTL = 21600; // 6 jam
const ROLES = ['Murid', 'Guru', 'Ortu', 'Guru_BK', 'Admin'];
const TOPIK = ['Pribadi & Sosial', 'Akademik & Belajar', 'Karir, PKL & Kuliah', 'Masalah Kedisiplinan'];

function doGet(e) {
  ensureDatabaseReady_();
  if (e && e.parameter && e.parameter.action === 'ping') {
    return jsonOut_({ success: true, mode: 'gas', message: 'Terhubung ke Google Apps Script & Google Sheets.' });
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('E-BK | SMKN 1 Kota Binjai')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function doPost(e) {
  try {
    ensureDatabaseReady_();
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const req = JSON.parse(raw);
    const action = String(req.action || '');
    const args = Array.isArray(req.args) ? req.args : [];

    const handlers = {
      ping: () => ({ success: true, mode: 'gas', message: 'Terhubung ke Google Apps Script & Google Sheets.' }),
      getLoginAccounts: () => getLoginAccounts(),
      loginUser: () => loginUser(args[0], args[1]),
      akhiriSesi: () => akhiriSesi(args[0]),
      ubahSandi: () => ubahSandi(args[0], args[1], args[2]),
      jalankanSetup: () => jalankanSetup(args[0]),
      getAllAppData: () => getAllAppData(args[0]),
      tambahCatatanPoin: () => tambahCatatanPoin(args[0], args[1]),
      ajukanLaporanGuru: () => ajukanLaporanGuru(args[0], args[1]),
      verifikasiLaporanGuru: () => verifikasiLaporanGuru(args[0], args[1], args[2], args[3], args[4]),
      updateTindakanSiswa: () => updateTindakanSiswa(args[0], args[1], args[2], args[3]),
      ajukanKonseling: () => ajukanKonseling(args[0], args[1]),
      setujuiKonseling: () => setujuiKonseling(args[0], args[1], args[2], args[3]),
      tolakKonseling: () => tolakKonseling(args[0], args[1], args[2]),
      selesaikanKonseling: () => selesaikanKonseling(args[0], args[1], args[2]),
      saveUserAccount: () => saveUserAccount(args[0], args[1]),
      deleteUserAccount: () => deleteUserAccount(args[0], args[1])
      ,
      deleteCatatanPoin: () => deleteCatatanPoin(args[0], args[1]),
      deleteKonseling: () => deleteKonseling(args[0], args[1]),
      deleteLaporanGuru: () => deleteLaporanGuru(args[0], args[1]),
      adminTambahKonseling: () => adminTambahKonseling(args[0], args[1]),
      saveSchoolConfig: () => saveSchoolConfig(args[0], args[1])
      ,
      importUsersCsv: () => importUsersCsv(args[0], args[1])
    };

    if (!Object.prototype.hasOwnProperty.call(handlers, action)) {
      return jsonOut_({ success: false, message: 'Aksi tidak dikenal.' });
    }
    return jsonOut_(handlers[action]());
  } catch (err) {
    return jsonOut_({ success: false, message: (err && err.message) ? err.message : String(err) });
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- Utilitas ----------
function ss_() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('DB_SPREADSHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  ss = SpreadsheetApp.create('Database E-BK SMKN 1 Kota Binjai');
  props.setProperty('DB_SPREADSHEET_ID', ss.getId());
  return ss;
}
function guard_(fn) {
  try { return fn(); }
  catch (e) { return { success: false, expired: !!(e && e.expired), message: (e && e.message) ? e.message : String(e) }; }
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function fmt_(v, withTime) {
  return v instanceof Date ? Utilities.formatDate(v, TZ, withTime ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd') : String(v);
}
function nextId_(sheet, prefix, start, pad) {
  const col = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues() : [];
  let max = start - 1;
  col.forEach(r => {
    const s = String(r[0]);
    if (s.indexOf(prefix) === 0) { const n = parseInt(s.slice(prefix.length), 10); if (n > max) max = n; }
  });
  const n = String(max + 1);
  return prefix + (pad ? ('0000' + n).slice(-Math.max(pad, n.length)) : n);
}
function hitungStatusSP(poin) {
  const p = Number(poin);
  if (p >= 85) return 'Aman';
  if (p >= 70) return 'SP 1';
  if (p >= 50) return 'SP 2';
  return 'SP 3';
}

// ---------- Sandi (hash SHA-256 + salt) ----------
function salt_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('PW_SALT');
  if (!s) { s = Utilities.getUuid(); p.setProperty('PW_SALT', s); }
  return s;
}
function hash_(pw) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt_() + String(pw), Utilities.Charset.UTF_8);
  return 'h$' + d.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function checkPw_(stored, input) {
  stored = String(stored);
  return stored.indexOf('h$') === 0 ? stored === hash_(input) : stored === String(input); // dukung sandi lama (teks biasa)
}

// ---------- Akses data ----------
function users_() {
  const v = ss_().getSheetByName(SHEET.USERS).getDataRange().getValues();
  return v.slice(1).map((r, i) => ({
    _row: i + 2, id: String(r[0]), role: r[1], nama: String(r[2]), password: r[3], kelasInfo: String(r[4]),
    poin: Number(r[5]), statusSP: r[6], skorsing: r[7], terkaitIdSiswa: String(r[8] || '')
  }));
}
function pub_(u) {
  return { id: u.id, role: u.role, nama: u.nama, kelasInfo: u.kelasInfo, poin: u.poin, statusSP: u.statusSP, skorsing: u.skorsing, terkaitIdSiswa: u.terkaitIdSiswa };
}
function catatan_() {
  return ss_().getSheetByName(SHEET.CATATAN).getDataRange().getValues().slice(1).map(r => ({
    id: String(r[0]), tanggal: fmt_(r[1]), idSiswa: String(r[2]), namaSiswa: r[3], kelas: r[4],
    jenis: r[5], keterangan: r[6], perubahanPoin: Number(r[7]), pelapor: r[8]
  }));
}
function konseling_() {
  return ss_().getSheetByName(SHEET.KONSELING).getDataRange().getValues().slice(1).map((r, i) => ({
    _row: i + 2, id: String(r[0]), tanggal: fmt_(r[1], true), idSiswa: String(r[2]), namaSiswa: r[3], kelas: r[4],
    topik: r[5], cerita: r[6], status: r[7], jadwal: fmt_(r[8], true), catatanBK: r[9]
  }));
}
function laporan_() {
  const sh = ss_().getSheetByName(SHEET.LAPORAN);
  if (!sh || sh.getLastRow() <= 1) return [];
  return sh.getDataRange().getValues().slice(1).map((r, i) => ({
    _row: i + 2, id: String(r[0]), tanggal: fmt_(r[1], true), idSiswa: String(r[2]), namaSiswa: r[3], kelas: r[4],
    jenis: r[5], bobotUsulan: Number(r[6]), keterangan: r[7], idPelapor: String(r[8]), pelapor: r[9],
    status: r[10], bobotDisetujui: Number(r[11] || 0), catatanBK: r[12], diprosesOleh: r[13], tanggalProses: fmt_(r[14], true)
  }));
}

// ---------- Sesi ----------
function requireSession_(token, roles) {
  const id = token && CacheService.getScriptCache().get('s_' + token);
  const u = id ? users_().filter(x => x.id === id)[0] : null;
  if (!u) { const e = new Error('Sesi berakhir. Silakan masuk kembali.'); e.expired = true; throw e; }
  if (roles && roles.indexOf(u.role) < 0) throw new Error('Anda tidak memiliki akses untuk tindakan ini.');
  return u;
}

// ---------- Setup database ----------
function setupDatabase() { setupDatabase_(); return { success: true, message: 'Database siap digunakan.' }; }
function ensureDatabaseReady_() {
  const ss = ss_();
  const lengkap = [SHEET.USERS, SHEET.CATATAN, SHEET.KONSELING, SHEET.CONFIG, SHEET.LAPORAN].every(n => ss.getSheetByName(n));
  if (!lengkap) setupDatabase_();
}
function sheet_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }
function header_(sheet, cols) {
  sheet.getRange(1, 1, 1, cols).setBackground('#0f4c81').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
}
function setupDatabase_() {
  const ss = ss_();
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');

  const cfg = sheet_(ss, SHEET.CONFIG);
  if (cfg.getLastRow() === 0) {
    cfg.appendRow(['Key', 'Value']);
    cfg.appendRow(['Nama_Sekolah', 'SMKN 1 Kota Binjai']);
    cfg.appendRow(['Alamat', 'Jl. Samanhudi No.20, Satria, Kec. Binjai Kota, Kota Binjai, Sumatera Utara 20741']);
    cfg.appendRow(['Tahun_Ajaran', '2026/2027']);
    header_(cfg, 2);
  }

  const us = sheet_(ss, SHEET.USERS);
  if (us.getLastRow() === 0) {
    const h = ['ID', 'Role', 'Nama', 'Password', 'Kelas_Info', 'Poin', 'Status_SP', 'Skorsing', 'Terkait_ID_Siswa'];
    us.appendRow(h); header_(us, h.length);
    const pw = hash_('123456');
    [
      ['BK01', 'Guru_BK', 'Dra. Hj. Nurhayati, M.Psi (Guru BK)', pw, 'Ruang BK Utama', 100, '-', 'Tidak', ''],
      ['GR01', 'Guru', 'Samsudin, M.Pd', pw, 'Wali Kelas XI RPL 1', 100, '-', 'Tidak', ''],
      ['GR02', 'Guru', 'Rina Marlina, S.Kom', pw, 'Wali Kelas XI TKJ 1', 100, '-', 'Tidak', ''],
      ['GR03', 'Guru', 'Budi Santoso, S.Pd', pw, 'Guru Produktif AKL', 100, '-', 'Tidak', ''],
      ['SW01', 'Murid', 'Aminah', pw, 'XI RPL 1', 100, 'Aman', 'Tidak', ''],
      ['SW02', 'Murid', 'Muhammad Rizky Pratama', pw, 'XI RPL 1', 80, 'SP 1', 'Tidak', ''],
      ['SW03', 'Murid', 'Siti Aisyah Putri', pw, 'XI RPL 1', 100, 'Aman', 'Tidak', ''],
      ['SW04', 'Murid', 'Dimas Anggara', pw, 'XI TKJ 1', 60, 'SP 2', 'Tidak', ''],
      ['SW05', 'Murid', 'Nabila Syakieb', pw, 'XI TKJ 1', 95, 'Aman', 'Tidak', ''],
      ['SW06', 'Murid', 'Fajar Nugroho', pw, 'XII AKL 2', 35, 'SP 3', 'Ya', ''],
      ['OT01', 'Ortu', 'Bpk. Ahmad (Wali dari Aminah)', pw, 'Ortu XI RPL 1', 100, '-', 'Tidak', 'SW01'],
      ['OT02', 'Ortu', 'Ibu Siti (Wali dari M. Rizky)', pw, 'Ortu XI RPL 1', 100, '-', 'Tidak', 'SW02'],
      ['OT03', 'Ortu', 'Bpk. Hendra (Wali dari Dimas)', pw, 'Ortu XI TKJ 1', 100, '-', 'Tidak', 'SW04']
    ].forEach(r => us.appendRow(r));
  }
  if (!users_().some(u => u.id === 'admin123')) {
    us.appendRow(['admin123', 'Admin', 'Administrator / Operator Sistem', hash_('123admin'), 'Operator Pusat', 100, '-', 'Tidak', '']);
  }

  const ct = sheet_(ss, SHEET.CATATAN);
  if (ct.getLastRow() === 0) {
    const h = ['ID_Catatan', 'Tanggal', 'ID_Siswa', 'Nama_Siswa', 'Kelas', 'Jenis', 'Kategori_Keterangan', 'Perubahan_Poin', 'Pelapor'];
    ct.appendRow(h); header_(ct, h.length);
    ct.getRange('B:B').setNumberFormat('@');
    [
      ['CT-1001', today, 'SW01', 'Aminah', 'XI RPL 1', 'Prestasi', 'Juara 1 LKS Web Technologies Tingkat Kota Binjai', 15, 'Samsudin, M.Pd'],
      ['CT-1002', today, 'SW01', 'Aminah', 'XI RPL 1', 'Pelanggaran', 'Terlambat mengikuti apel pagi (15 menit)', -15, 'Dra. Hj. Nurhayati, M.Psi (Guru BK)'],
      ['CT-1003', today, 'SW02', 'Muhammad Rizky Pratama', 'XI RPL 1', 'Pelanggaran', 'Tidak memakai atribut dasi dan topi saat upacara', -20, 'Samsudin, M.Pd'],
      ['CT-1004', today, 'SW04', 'Dimas Anggara', 'XI TKJ 1', 'Pelanggaran', 'Bolos pada jam pelajaran ke-5 dan ke-6', -40, 'Rina Marlina, S.Kom'],
      ['CT-1005', today, 'SW06', 'Fajar Nugroho', 'XII AKL 2', 'Pelanggaran', 'Terlibat perkelahian di area parkir sekolah', -65, 'Dra. Hj. Nurhayati, M.Psi (Guru BK)']
    ].forEach(r => ct.appendRow(r));
  }

  const ks = sheet_(ss, SHEET.KONSELING);
  if (ks.getLastRow() === 0) {
    const h = ['ID_Konseling', 'Tanggal_Pengajuan', 'ID_Siswa', 'Nama_Siswa', 'Kelas', 'Topik', 'Cerita_Singkat', 'Status', 'Jadwal_Konseling', 'Catatan_BK'];
    ks.appendRow(h); header_(ks, h.length);
    ks.getRange('B:B').setNumberFormat('@'); ks.getRange('I:I').setNumberFormat('@');
    ks.appendRow(['KS-2001', now, 'SW01', 'Aminah', 'XI RPL 1', 'Karir, PKL & Kuliah',
      'Ingin cerita sedikit mengenai kebingungan memilih tempat PKL dan persiapan kuliah.', 'Menunggu', '-', '-']);
  }
  const lp = sheet_(ss, SHEET.LAPORAN);
  if (lp.getLastRow() === 0) {
    const h = ['ID_Laporan', 'Tanggal', 'ID_Siswa', 'Nama_Siswa', 'Kelas', 'Jenis', 'Bobot_Usulan', 'Keterangan', 'ID_Pelapor', 'Pelapor', 'Status', 'Bobot_Disetujui', 'Catatan_BK', 'Diproses_Oleh', 'Tanggal_Proses'];
    lp.appendRow(h); header_(lp, h.length);
    lp.getRange('B:B').setNumberFormat('@'); lp.getRange('O:O').setNumberFormat('@');
  }

  const def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
}

// ---------- API: login & sesi ----------
function getLoginAccounts() {
  return guard_(() => ({ success: true, data: users_().filter(u => u.role !== 'Admin').map(u => ({ id: u.id, role: u.role, nama: u.nama, kelasInfo: u.kelasInfo })) }));
}
function loginUser(userId, password) {
  return guard_(() => {
    const cache = CacheService.getScriptCache();
    const failKey = 'f_' + userId;
    if (Number(cache.get(failKey) || 0) >= 5) return { success: false, message: 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.' };
    const u = users_().filter(x => x.id === String(userId))[0];
    if (!u) return { success: false, message: 'Akun tidak ditemukan!' };
    if (!checkPw_(u.password, password)) {
      cache.put(failKey, String(Number(cache.get(failKey) || 0) + 1), 600);
      return { success: false, message: 'Kata sandi yang Anda masukkan salah!' };
    }
    cache.remove(failKey);
    if (String(u.password).indexOf('h$') !== 0)
      ss_().getSheetByName(SHEET.USERS).getRange(u._row, 4).setValue(hash_(password));
    const token = Utilities.getUuid();
    cache.put('s_' + token, u.id, SESSION_TTL);
    return { success: true, token: token, user: pub_(u) };
  });
}
function akhiriSesi(token) {
  if (token) CacheService.getScriptCache().remove('s_' + token);
  return { success: true };
}
function ubahSandi(token, lama, baru) {
  return guard_(() => withLock_(() => {
    const me = requireSession_(token);
    if (!checkPw_(me.password, lama)) throw new Error('Sandi lama salah.');
    if (String(baru).length < 6) throw new Error('Sandi baru minimal 6 karakter.');
    ss_().getSheetByName(SHEET.USERS).getRange(me._row, 4).setValue(hash_(baru));
    return { success: true, message: 'Sandi berhasil diubah.' };
  }));
}
function jalankanSetup(token) {
  return guard_(() => { requireSession_(token, ['Admin']); setupDatabase_(); return { success: true, message: 'Struktur database sudah lengkap.' }; });
}

// ---------- API: data (disaring sesuai peran) ----------
function getAllAppData(token) {
  return guard_(() => {
    const me = requireSession_(token);
    const all = users_();
    let students = all.filter(u => u.role === 'Murid');
    let catatan = catatan_(), konseling = konseling_(), laporan = [], users = [];
    if (me.role === 'Guru_BK' || me.role === 'Admin') {
      users = me.role === 'Admin' ? all.map(pub_) : [];
      laporan = laporan_();
    } else if (me.role === 'Guru') {
      catatan = catatan.filter(c => c.pelapor === me.nama);
      konseling = [];
      laporan = laporan_().filter(l => l.idPelapor === me.id);
    } else {
      const sid = me.role === 'Murid' ? me.id : me.terkaitIdSiswa;
      students = students.filter(s => s.id === sid);
      catatan = catatan.filter(c => c.idSiswa === sid);
      konseling = konseling.filter(k => k.idSiswa === sid);
      if (me.role === 'Ortu') konseling = konseling.map(k => Object.assign({}, k, { cerita: '(Isi cerita bersifat rahasia)' }));
    }
    const cfgVals = ss_().getSheetByName(SHEET.CONFIG).getDataRange().getValues().slice(1);
    const cfgMap = {};
    cfgVals.forEach(r => { cfgMap[String(r[0])] = String(r[1] || ''); });
    const schoolConfig = { namaSekolah: cfgMap.Nama_Sekolah || 'SMKN 1 Kota Binjai', alamat: cfgMap.Alamat || '', tahunAjaran: cfgMap.Tahun_Ajaran || '' };
    return { success: true, me: pub_(me), users: users, students: students.map(pub_), catatan: catatan.reverse(), konseling: konseling.reverse(), laporan: laporan.reverse(), schoolConfig: schoolConfig };
  });
}

// ---------- API: poin ----------
function tambahCatatanPoin(token, p) {
  return guard_(() => {
    const me = requireSession_(token, ['Guru_BK', 'Admin']);
    return withLock_(() => {
      p = p || {};
      if (['Pelanggaran', 'Prestasi'].indexOf(p.jenis) < 0) throw new Error('Jenis catatan tidak valid.');
      const bobot = Math.round(Number(p.poin));
      if (!(bobot >= 1 && bobot <= 100)) throw new Error('Bobot poin harus 1 sampai 100.');
      const ket = String(p.keterangan || '').trim().slice(0, 300);
      if (!ket) throw new Error('Keterangan wajib diisi.');
      const s = users_().filter(u => u.id === String(p.idSiswa) && u.role === 'Murid')[0];
      if (!s) throw new Error('Data siswa tidak ditemukan!');

      const baru = Math.max(0, Math.min(100, s.poin + (p.jenis === 'Prestasi' ? bobot : -bobot)));
      const delta = baru - s.poin;
      const status = hitungStatusSP(baru);
      const sc = ss_().getSheetByName(SHEET.CATATAN);
      sc.appendRow([nextId_(sc, 'CT-', 1001), Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), s.id, s.nama, s.kelasInfo, p.jenis, ket, delta, me.nama]);
      const su = ss_().getSheetByName(SHEET.USERS);
      su.getRange(s._row, 6).setValue(baru);
      su.getRange(s._row, 7).setValue(status);
      let msg = 'Catatan ' + p.jenis + ' untuk ' + s.nama + ' disimpan. Poin kini ' + baru + '/100 (' + status + ').';
      if (status !== 'Aman' && status !== s.statusSP) msg += ' Status berubah dari ' + s.statusSP + '.';
      return { success: true, message: msg };
    });
  });
}
function ajukanLaporanGuru(token, p) {
  return guard_(() => {
    const me = requireSession_(token, ['Guru', 'Admin']);
    return withLock_(() => {
      p = p || {};
      if (['Pelanggaran', 'Prestasi'].indexOf(p.jenis) < 0) throw new Error('Jenis laporan tidak valid.');
      const bobot = Math.round(Number(p.poin));
      if (!(bobot >= 1 && bobot <= 100)) throw new Error('Usulan bobot poin harus 1 sampai 100.');
      const ket = String(p.keterangan || '').trim().slice(0, 300);
      if (!ket) throw new Error('Keterangan wajib diisi.');
      const s = users_().filter(u => u.id === String(p.idSiswa) && u.role === 'Murid')[0];
      if (!s) throw new Error('Data siswa tidak ditemukan!');
      ensureDatabaseReady_();
      const sl = ss_().getSheetByName(SHEET.LAPORAN);
      sl.appendRow([nextId_(sl, 'LP-', 3001), Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), s.id, s.nama, s.kelasInfo, p.jenis, bobot, ket, me.id, me.nama, 'Menunggu', 0, '-', '-', '-']);
      return { success: true, message: 'Laporan untuk ' + s.nama + ' dikirim. Poin akan berubah setelah diverifikasi Guru BK.' };
    });
  });
}
function verifikasiLaporanGuru(token, idLaporan, keputusan, bobotFinal, catatanBK) {
  return guard_(() => {
    const me = requireSession_(token, ['Guru_BK', 'Admin']);
    return withLock_(() => {
      if (['Setujui', 'Tolak'].indexOf(keputusan) < 0) throw new Error('Keputusan tidak valid.');
      const l = laporan_().filter(x => x.id === String(idLaporan))[0];
      if (!l) throw new Error('Laporan tidak ditemukan.');
      if (l.status !== 'Menunggu') throw new Error('Laporan ini sudah diproses.');
      const sl = ss_().getSheetByName(SHEET.LAPORAN);
      const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
      const ketBK = String(catatanBK || '').trim().slice(0, 200);
      if (keputusan === 'Tolak') {
        sl.getRange(l._row, 11).setValue('Ditolak');
        sl.getRange(l._row, 12).setValue(0);
        sl.getRange(l._row, 13).setValue(ketBK || 'Laporan tidak disetujui oleh Guru BK.');
        sl.getRange(l._row, 14).setValue(me.nama);
        sl.getRange(l._row, 15).setValue(now);
        return { success: true, message: 'Laporan ditolak. Poin siswa tidak berubah.' };
      }
      const bobot = Math.round(Number(bobotFinal || l.bobotUsulan));
      if (!(bobot >= 1 && bobot <= 100)) throw new Error('Bobot poin final harus 1 sampai 100.');
      const s = users_().filter(u => u.id === l.idSiswa && u.role === 'Murid')[0];
      if (!s) throw new Error('Siswa tidak ditemukan.');
      const baru = Math.max(0, Math.min(100, s.poin + (l.jenis === 'Prestasi' ? bobot : -bobot)));
      const delta = baru - s.poin;
      const status = hitungStatusSP(baru);
      const sc = ss_().getSheetByName(SHEET.CATATAN);
      sc.appendRow([nextId_(sc, 'CT-', 1001), Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), s.id, s.nama, s.kelasInfo, l.jenis, l.keterangan, delta, l.pelapor]);
      const su = ss_().getSheetByName(SHEET.USERS);
      su.getRange(s._row, 6).setValue(baru);
      su.getRange(s._row, 7).setValue(status);
      sl.getRange(l._row, 11).setValue('Disetujui');
      sl.getRange(l._row, 12).setValue(bobot);
      sl.getRange(l._row, 13).setValue(ketBK || 'Disetujui dan poin diperbarui.');
      sl.getRange(l._row, 14).setValue(me.nama);
      sl.getRange(l._row, 15).setValue(now);
      return { success: true, message: 'Laporan disetujui. Poin ' + s.nama + ' kini ' + baru + '/100 (' + status + ').' };
    });
  });
}
function updateTindakanSiswa(token, idSiswa, skorsing, resetPoin) {
  return guard_(() => {
    const me = requireSession_(token, ['Guru_BK', 'Admin']);
    return withLock_(() => {
      if (['Ya', 'Tidak'].indexOf(skorsing) < 0) throw new Error('Status skorsing tidak valid.');
      const s = users_().filter(u => u.id === String(idSiswa) && u.role === 'Murid')[0];
      if (!s) throw new Error('Siswa tidak ditemukan.');
      const su = ss_().getSheetByName(SHEET.USERS);
      su.getRange(s._row, 8).setValue(skorsing);
      if (resetPoin && s.poin < 100) {
        su.getRange(s._row, 6).setValue(100);
        su.getRange(s._row, 7).setValue('Aman');
        const sc = ss_().getSheetByName(SHEET.CATATAN);
        sc.appendRow([nextId_(sc, 'CT-', 1001), Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), s.id, s.nama, s.kelasInfo,
          'Pemulihan', 'Poin dipulihkan setelah pembinaan selesai', 100 - s.poin, me.nama]);
      }
      return { success: true, message: 'Status tindakan siswa berhasil diperbarui.' };
    });
  });
}

// ---------- API: konseling ----------
function ajukanKonseling(token, p) {
  return guard_(() => {
    const me = requireSession_(token, ['Murid']);
    return withLock_(() => {
      p = p || {};
      const cerita = String(p.cerita || '').trim().slice(0, 500);
      if (!cerita) throw new Error('Cerita singkat wajib diisi.');
      if (TOPIK.indexOf(p.topik) < 0) throw new Error('Topik tidak valid.');
      const menunggu = konseling_().filter(k => k.idSiswa === me.id && k.status === 'Menunggu').length;
      if (menunggu >= 3) throw new Error('Anda masih punya 3 pengajuan yang menunggu. Tunggu jawaban Guru BK dulu.');
      const sk = ss_().getSheetByName(SHEET.KONSELING);
      sk.appendRow([nextId_(sk, 'KS-', 2001), Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), me.id, me.nama, me.kelasInfo, p.topik, cerita, 'Menunggu', '-', '-']);
      return { success: true, message: 'Pengajuan konseling terkirim. Menunggu persetujuan Guru BK.' };
    });
  });
}
function setujuiKonseling(token, id, jadwal, catatanBK) {
  return guard_(() => {
    requireSession_(token, ['Guru_BK', 'Admin']);
    return withLock_(() => {
      jadwal = String(jadwal || '').trim().slice(0, 100);
      if (!jadwal) throw new Error('Jadwal wajib diisi.');
      const k = konseling_().filter(x => x.id === String(id))[0];
      if (!k) throw new Error('Pengajuan tidak ditemukan.');
      if (k.status !== 'Menunggu') throw new Error('Pengajuan ini sudah diproses.');
      const sk = ss_().getSheetByName(SHEET.KONSELING);
      sk.getRange(k._row, 8).setValue('Disetujui & Terjadwal');
      sk.getRange(k._row, 9).setValue(jadwal);
      sk.getRange(k._row, 10).setValue(String(catatanBK || '').trim().slice(0, 200) || 'Silakan hadir tepat waktu di Ruang BK.');
      return { success: true, message: 'Konseling disetujui dan jadwal sudah tampil di akun siswa.' };
    });
  });
}
function tolakKonseling(token, id, alasan) {
  return guard_(() => {
    requireSession_(token, ['Guru_BK', 'Admin']);
    return withLock_(() => {
      const k = konseling_().filter(x => x.id === String(id))[0];
      if (!k) throw new Error('Pengajuan tidak ditemukan.');
      if (k.status !== 'Menunggu') throw new Error('Pengajuan ini sudah diproses.');
      const sk = ss_().getSheetByName(SHEET.KONSELING);
      sk.getRange(k._row, 8).setValue('Ditolak');
      sk.getRange(k._row, 10).setValue(String(alasan || '').trim().slice(0, 200) || 'Silakan ajukan ulang atau temui Guru BK.');
      return { success: true, message: 'Pengajuan ditolak dan alasan sudah dikirim ke siswa.' };
    });
  });
}
function selesaikanKonseling(token, id, catatanBK) {
  return guard_(() => {
    requireSession_(token, ['Guru_BK', 'Admin']);
    return withLock_(() => {
      const k = konseling_().filter(x => x.id === String(id))[0];
      if (!k) throw new Error('Pengajuan tidak ditemukan.');
      if (k.status !== 'Disetujui & Terjadwal') throw new Error('Hanya konseling terjadwal yang bisa ditandai selesai.');
      const sk = ss_().getSheetByName(SHEET.KONSELING);
      sk.getRange(k._row, 8).setValue('Selesai');
      const ket = String(catatanBK || '').trim().slice(0, 200);
      if (ket) sk.getRange(k._row, 10).setValue(ket);
      else if (!k.catatanBK || k.catatanBK === '-') sk.getRange(k._row, 10).setValue('Sesi konseling telah selesai dilaksanakan.');
      return { success: true, message: 'Sesi konseling ditandai selesai.' };
    });
  });
}

// ---------- API: kelola akun (hanya Guru BK) ----------
function saveUserAccount(token, p) {
  return guard_(() => {
    const me = requireSession_(token, ['Admin']);
    return withLock_(() => {
      p = p || {};
      const nama = String(p.nama || '').trim().slice(0, 100);
      const kelasInfo = String(p.kelasInfo || '').trim().slice(0, 100);
      if (ROLES.indexOf(p.role) < 0) throw new Error('Peran tidak valid.');
      if (p.role === 'Admin' && me.role !== 'Admin') throw new Error('Hanya Administrator yang dapat mengelola akun Admin.');
      if (!nama || !kelasInfo) throw new Error('Nama dan kelas/info wajib diisi.');
      const all = users_();
      let terkait = '';
      if (p.role === 'Ortu') {
        terkait = String(p.terkaitIdSiswa || '');
        if (!all.some(u => u.id === terkait && u.role === 'Murid')) throw new Error('Akun orang tua harus dihubungkan ke siswa yang valid.');
      }
      const sh = ss_().getSheetByName(SHEET.USERS);
      if (p.mode === 'add') {
        if (String(p.password || '').length < 6) throw new Error('Sandi minimal 6 karakter.');
        const prefix = { Murid: 'SW', Guru: 'GR', Ortu: 'OT', Guru_BK: 'BK', Admin: 'AD' }[p.role];
        sh.appendRow([nextId_(sh, prefix, 1, 2), p.role, nama, hash_(p.password), kelasInfo, 100, p.role === 'Murid' ? 'Aman' : '-', 'Tidak', terkait]);
        return { success: true, message: 'Akun ' + nama + ' berhasil ditambahkan.' };
      }
      if (p.mode === 'edit') {
        const u = all.filter(x => x.id === String(p.id))[0];
        if (!u) throw new Error('Akun tidak ditemukan.');
        if (u.role === 'Admin' && me.role !== 'Admin') throw new Error('Hanya Administrator yang dapat mengubah akun Admin.');
        if (u.id === me.id && p.role !== u.role) throw new Error('Anda tidak bisa mengubah peran akun Anda sendiri.');
        if (u.role !== p.role) throw new Error('Peran akun tidak bisa diubah. Buat akun baru jika perlu.');
        sh.getRange(u._row, 3).setValue(nama);
        sh.getRange(u._row, 5).setValue(kelasInfo);
        sh.getRange(u._row, 9).setValue(terkait);
        if (p.password) {
          if (String(p.password).length < 6) throw new Error('Sandi minimal 6 karakter.');
          sh.getRange(u._row, 4).setValue(hash_(p.password));
        }
        return { success: true, message: 'Data akun ' + nama + ' diperbarui.' };
      }
      throw new Error('Mode tidak dikenal.');
    });
  });
}
function deleteUserAccount(token, userId) {
  return guard_(() => {
    const me = requireSession_(token, ['Admin']);
    return withLock_(() => {
      const all = users_();
      const u = all.filter(x => x.id === String(userId))[0];
      if (!u) throw new Error('Akun tidak ditemukan.');
      if (u.id === 'admin123') throw new Error('Akun operator utama admin123 tidak dapat dihapus.');
      if (u.role === 'Admin' && me.role !== 'Admin') throw new Error('Hanya Administrator yang dapat menghapus akun Admin.');
      if (u.id === me.id) throw new Error('Anda tidak bisa menghapus akun Anda sendiri.');
      if (u.role === 'Guru_BK' && me.role !== 'Admin' && all.filter(x => x.role === 'Guru_BK').length <= 1) throw new Error('Minimal harus ada satu akun Guru BK.');
      if (u.role === 'Murid') {
        if (me.role === 'Admin') {
          const su = ss_().getSheetByName(SHEET.USERS);
          all.forEach(x => { if (x.role === 'Ortu' && x.terkaitIdSiswa === u.id) su.getRange(x._row, 9).setValue(''); });
        } else if (all.some(x => x.role === 'Ortu' && x.terkaitIdSiswa === u.id)) {
          throw new Error('Hapus atau pindahkan akun orang tua yang terhubung ke siswa ini lebih dulu.');
        }
      }
      ss_().getSheetByName(SHEET.USERS).deleteRow(u._row);
      return { success: true, message: 'Akun ' + u.nama + ' dihapus. Riwayat catatan tetap tersimpan.' };
    });
  });
}
function deleteCatatanPoin(token, idCatatan) {
  return guard_(() => {
    requireSession_(token, ['Admin']);
    return withLock_(() => {
      const sc = ss_().getSheetByName(SHEET.CATATAN);
      const rows = sc.getDataRange().getValues();
      const idx = rows.findIndex((r, i) => i > 0 && String(r[0]) === String(idCatatan));
      if (idx < 0) throw new Error('Catatan poin tidak ditemukan.');
      const idSiswa = String(rows[idx][2]);
      const delta = Number(rows[idx][7]);
      const s = users_().filter(u => u.id === idSiswa && u.role === 'Murid')[0];
      if (s) {
        const baru = Math.max(0, Math.min(100, s.poin - delta));
        const su = ss_().getSheetByName(SHEET.USERS);
        su.getRange(s._row, 6).setValue(baru);
        su.getRange(s._row, 7).setValue(hitungStatusSP(baru));
      }
      sc.deleteRow(idx + 1);
      return { success: true, message: 'Catatan ' + idCatatan + ' dihapus dan poin siswa disesuaikan.' };
    });
  });
}
function deleteKonseling(token, idKonseling) {
  return guard_(() => {
    requireSession_(token, ['Admin']);
    return withLock_(() => {
      const k = konseling_().filter(x => x.id === String(idKonseling))[0];
      if (!k) throw new Error('Data konseling tidak ditemukan.');
      ss_().getSheetByName(SHEET.KONSELING).deleteRow(k._row);
      return { success: true, message: 'Data konseling ' + k.id + ' dihapus.' };
    });
  });
}
function deleteLaporanGuru(token, idLaporan) {
  return guard_(() => {
    requireSession_(token, ['Admin']);
    return withLock_(() => {
      const l = laporan_().filter(x => x.id === String(idLaporan))[0];
      if (!l) throw new Error('Laporan guru tidak ditemukan.');
      ss_().getSheetByName(SHEET.LAPORAN).deleteRow(l._row);
      return { success: true, message: 'Laporan ' + l.id + ' dihapus.' };
    });
  });
}
function adminTambahKonseling(token, p) {
  return guard_(() => {
    requireSession_(token, ['Admin']);
    return withLock_(() => {
      p = p || {};
      const s = users_().filter(u => u.id === String(p.idSiswa || '') && u.role === 'Murid')[0];
      if (!s) throw new Error('Siswa tidak ditemukan.');
      if (TOPIK.indexOf(p.topik) < 0) throw new Error('Topik tidak valid.');
      const cerita = String(p.cerita || '').trim().slice(0, 500);
      if (!cerita) throw new Error('Keterangan / topik ringkas wajib diisi.');
      const jadwal = String(p.jadwal || '').trim().slice(0, 100);
      const catatan = String(p.catatanBK || '').trim().slice(0, 200);
      const sk = ss_().getSheetByName(SHEET.KONSELING);
      sk.appendRow([nextId_(sk, 'KS-', 2001), Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), s.id, s.nama, s.kelasInfo, p.topik, cerita, jadwal ? 'Disetujui & Terjadwal' : 'Menunggu', jadwal || '-', catatan || '-']);
      return { success: true, message: 'Data konseling untuk ' + s.nama + ' ditambahkan.' };
    });
  });
}
function saveSchoolConfig(token, p) {
  return guard_(() => {
    requireSession_(token, ['Admin']);
    return withLock_(() => {
      p = p || {};
      const nama = String(p.namaSekolah || '').trim().slice(0, 150);
      if (!nama) throw new Error('Nama sekolah wajib diisi.');
      const cfg = ss_().getSheetByName(SHEET.CONFIG);
      cfg.clearContents();
      cfg.appendRow(['Key', 'Value']);
      cfg.appendRow(['Nama_Sekolah', nama]);
      cfg.appendRow(['Alamat', String(p.alamat || '').trim().slice(0, 250)]);
      cfg.appendRow(['Tahun_Ajaran', String(p.tahunAjaran || '').trim().slice(0, 30)]);
      header_(cfg, 2);
      return { success: true, message: 'Pengaturan sekolah berhasil disimpan.' };
    });
  });
}
function importUsersCsv(token, rows) {
  return guard_(() => {
    requireSession_(token, ['Admin']);
    return withLock_(() => {
      if (!Array.isArray(rows)) throw new Error('Format data CSV tidak valid.');
      if (rows.length === 0) throw new Error('Tidak ada baris akun untuk diimpor.');
      if (rows.length > 500) throw new Error('Maksimal 500 akun per sekali impor.');
      const allowed = ['Murid', 'Guru', 'Ortu', 'Guru_BK'];
      const sh = ss_().getSheetByName(SHEET.USERS);
      const existingStudents = users_().filter(u => u.role === 'Murid').map(u => u.id);
      const defaultPw = hash_('123456');
      let added = 0, skipped = 0;
      rows.forEach(row => {
        const role = String((row && row.role) || '').trim();
        const nama = String((row && row.nama) || '').trim().slice(0, 100);
        const kelasInfo = String((row && row.kelasInfo) || '').trim().slice(0, 100);
        const pw = String((row && row.password) || '');
        let terkait = String((row && row.terkaitIdSiswa) || '').trim();
        if (allowed.indexOf(role) < 0 || !nama || !kelasInfo || (pw !== '' && pw.length < 6)) { skipped++; return; }
        if (role === 'Ortu') {
          if (existingStudents.indexOf(terkait) < 0) { skipped++; return; }
        } else { terkait = ''; }
        const prefix = { Murid: 'SW', Guru: 'GR', Ortu: 'OT', Guru_BK: 'BK' }[role];
        const newId = nextId_(sh, prefix, 1, 2);
        sh.appendRow([newId, role, nama, pw === '' ? defaultPw : hash_(pw), kelasInfo, 100, role === 'Murid' ? 'Aman' : '-', 'Tidak', terkait]);
        if (role === 'Murid') existingStudents.push(newId);
        added++;
      });
      return { success: true, added: added, skipped: skipped, message: added + ' akun berhasil diimpor' + (skipped > 0 ? ' (' + skipped + ' baris dilewati).' : '.') };
    });
  });
}
