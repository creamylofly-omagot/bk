import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Polyfill browser globals for LocalBackend & BackendAPI
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const LocalBackend = require(path.join(root, 'js/local-backend.js'));
globalThis.LocalBackend = LocalBackend;
const BackendAPI = require(path.join(root, 'js/api.js'));

function runStaticHtmlAndContractChecks() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const sql = fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8');

  // 1. Verify every $('id') in app.js exists in index.html
  const usedIds = [...new Set([...appJs.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map(m => m[1]))];
  for (const id of usedIds) {
    assert.ok(
      html.includes(`id="${id}"`),
      `HTML missing id="${id}" referenced in js/app.js`
    );
  }

  // 2. Verify all JS files parse cleanly
  for (const rel of ['js/local-backend.js', 'js/api.js', 'js/app.js']) {
    const code = fs.readFileSync(path.join(root, rel), 'utf8');
    new vm.Script(code, { filename: rel });
  }

  // 3. Verify all 14 Supabase RPC mappings match schema.sql parameter names & grants
  const sqlRpcs = {};
  for (const m of sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(ebk_[a-z0-9_]+)\(([\s\S]*?)\)\s*RETURNS/g)) {
    const fn = m[1];
    const raw = m[2].trim();
    const params = raw ? raw.split(',').map(p => p.trim().split(/\s+/)[0]) : [];
    sqlRpcs[fn] = params;
  }

  const actions = [
    ['ping', []],
    ['getLoginAccounts', []],
    ['loginUser', ['SW01', '123456']],
    ['akhiriSesi', ['tok']],
    ['ubahSandi', ['tok', 'old', 'newpass']],
    ['jalankanSetup', ['tok']],
    ['getAllAppData', ['tok']],
    ['tambahCatatanPoin', ['tok', { idSiswa: 'SW01', jenis: 'Prestasi', poin: 10, keterangan: 'ok' }]],
    ['ajukanLaporanGuru', ['tok', { idSiswa: 'SW01', jenis: 'Pelanggaran', poin: 10, keterangan: 'ok' }]],
    ['verifikasiLaporanGuru', ['tok', 'LP-3001', 'Setujui', 10, 'ok']],
    ['updateTindakanSiswa', ['tok', 'SW01', 'Tidak', false]],
    ['ajukanKonseling', ['tok', { topik: 'Pribadi & Sosial', cerita: 'halo' }]],
    ['setujuiKonseling', ['tok', 'KS-2001', 'Besok', 'OK']],
    ['tolakKonseling', ['tok', 'KS-2001', 'Maaf']],
    ['selesaikanKonseling', ['tok', 'KS-2001', 'Selesai']],
    ['saveUserAccount', ['tok', { mode: 'add', id: '', role: 'Murid', nama: 'A', kelasInfo: 'B', password: '123456', terkaitIdSiswa: '' }]],
    ['deleteUserAccount', ['tok', 'SW07']]
    ,
    ['deleteCatatanPoin', ['tok', 'CT-1001']],
    ['deleteKonseling', ['tok', 'KS-2001']],
    ['deleteLaporanGuru', ['tok', 'LP-3001']],
    ['adminTambahKonseling', ['tok', { idSiswa: 'SW01', topik: 'Pribadi & Sosial', cerita: 'c', jadwal: 'j', catatanBK: 'k' }]],
    ['saveSchoolConfig', ['tok', { namaSekolah: 'SMK', alamat: 'Jl', tahunAjaran: '2026/2027' }]]
  ];

  for (const [action, args] of actions) {
    const [rpcName, params] = BackendAPI.mapActionToSupabase(action, args);
    assert.ok(sqlRpcs[rpcName], `Missing SQL RPC ${rpcName}`);
    assert.deepEqual(Object.keys(params).sort(), [...sqlRpcs[rpcName]].sort(), `Param mismatch on ${rpcName}`);
    assert.ok(sql.includes(`GRANT EXECUTE ON FUNCTION public.${rpcName}(`), `Missing GRANT for ${rpcName}`);
  }

  // 4. Verify Supabase headers handle sb_publishable_ vs JWT anon keys
  const pubHeaders = BackendAPI.buildSupabaseHeaders('sb_publishable_testkey');
  assert.equal(pubHeaders.apikey, 'sb_publishable_testkey');
  assert.equal(pubHeaders.Authorization, undefined);

  const jwtHeaders = BackendAPI.buildSupabaseHeaders('eyJhbGciOiJIUzI1NiJ9.payload.sig');
  assert.equal(jwtHeaders.apikey, 'eyJhbGciOiJIUzI1NiJ9.payload.sig');
  assert.equal(jwtHeaders.Authorization, 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig');

  // 5. Verify accessible labels exist for static inputs/selects/textareas
  for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const attrs = m[2];
    if (/type="hidden"/.test(attrs)) continue;
    const idMatch = attrs.match(/id="([^"]+)"/);
    assert.ok(idMatch, `Form control missing id: ${m[0]}`);
    const id = idMatch[1];
    assert.ok(
      html.includes(`for="${id}"`) || /aria-label=/.test(attrs),
      `Form control #${id} missing <label for="${id}"> or aria-label`
    );
  }
}

async function runBackendBehaviorTests() {
  store.clear();

  // 1. hitungStatusSP boundaries
  assert.equal(LocalBackend.hitungStatusSP(100), 'Aman');
  assert.equal(LocalBackend.hitungStatusSP(85), 'Aman');
  assert.equal(LocalBackend.hitungStatusSP(84), 'SP 1');
  assert.equal(LocalBackend.hitungStatusSP(70), 'SP 1');
  assert.equal(LocalBackend.hitungStatusSP(69), 'SP 2');
  assert.equal(LocalBackend.hitungStatusSP(50), 'SP 2');
  assert.equal(LocalBackend.hitungStatusSP(49), 'SP 3');
  assert.equal(LocalBackend.hitungStatusSP(0), 'SP 3');

  // 2. Login accounts leak no passwords
  const accs = await LocalBackend.dispatch('getLoginAccounts', []);
  assert.equal(accs.success, true);
  assert.equal(accs.data.length, 13);
  assert.ok(accs.data.every(a => !('password' in a)));
  assert.ok(accs.data.every(a => a.id !== 'admin123' && a.role !== 'Admin'));

  // 3. Rate limiting (5 fails lock out 6th valid attempt)
  for (let i = 0; i < 5; i++) {
    const fail = await LocalBackend.dispatch('loginUser', ['SW02', 'salah']);
    assert.equal(fail.success, false);
  }
  const blocked = await LocalBackend.dispatch('loginUser', ['SW02', '123456']);
  assert.equal(blocked.success, false);
  assert.match(blocked.message, /Terlalu banyak percobaan/);

  // 4. Guru BK login + CRUD + sequential ID + protections
  const bk = await LocalBackend.dispatch('loginUser', ['BK01', '123456']);
  assert.equal(bk.success, true);

  const addRes = await LocalBackend.dispatch('saveUserAccount', [
    bk.token,
    { mode: 'add', role: 'Murid', nama: 'Siswa Uji', kelasInfo: 'XI RPL 10', password: 'password123' }
  ]);
  assert.equal(addRes.success, true);

  const bkData = await LocalBackend.dispatch('getAllAppData', [bk.token]);
  assert.ok(bkData.users.some(u => u.id === 'SW07' && u.kelasInfo === 'XI RPL 10'));

  const delSelf = await LocalBackend.dispatch('deleteUserAccount', [bk.token, 'BK01']);
  assert.equal(delSelf.success, false);

  const delLinked = await LocalBackend.dispatch('deleteUserAccount', [bk.token, 'SW01']);
  assert.equal(delLinked.success, false);

  // 5. Points clamping & real delta + Pemulihan
  const clampUp = await LocalBackend.dispatch('tambahCatatanPoin', [
    bk.token,
    { idSiswa: 'SW01', jenis: 'Prestasi', poin: 15, keterangan: 'Juara lagi' }
  ]);
  assert.equal(clampUp.success, true);
  let afterUp = await LocalBackend.dispatch('getAllAppData', [bk.token]);
  assert.equal(afterUp.catatan[0].perubahanPoin, 0);

  const dropToZero = await LocalBackend.dispatch('tambahCatatanPoin', [
    bk.token,
    { idSiswa: 'SW06', jenis: 'Pelanggaran', poin: 60, keterangan: 'Pelanggaran berat' }
  ]);
  assert.equal(dropToZero.success, true);
  let afterDrop = await LocalBackend.dispatch('getAllAppData', [bk.token]);
  assert.equal(afterDrop.catatan[0].perubahanPoin, -35);
  assert.equal(afterDrop.students.find(s => s.id === 'SW06').poin, 0);

  const restore = await LocalBackend.dispatch('updateTindakanSiswa', [bk.token, 'SW06', 'Tidak', true]);
  assert.equal(restore.success, true);
  let afterRestore = await LocalBackend.dispatch('getAllAppData', [bk.token]);
  const sw06 = afterRestore.students.find(s => s.id === 'SW06');
  assert.equal(sw06.poin, 100);
  assert.equal(sw06.statusSP, 'Aman');
  assert.equal(afterRestore.catatan[0].jenis, 'Pemulihan');
  assert.equal(afterRestore.catatan[0].perubahanPoin, 100);

  // 6. Counseling workflow: max 3 pending + approve/reject + no double-process
  const sw01 = await LocalBackend.dispatch('loginUser', ['SW01', '123456']);
  assert.equal(sw01.success, true);
  assert.equal((await LocalBackend.dispatch('ajukanKonseling', [sw01.token, { topik: 'Akademik & Belajar', cerita: 'Cerita 2' }])).success, true);
  assert.equal((await LocalBackend.dispatch('ajukanKonseling', [sw01.token, { topik: 'Akademik & Belajar', cerita: 'Cerita 3' }])).success, true);
  const fourth = await LocalBackend.dispatch('ajukanKonseling', [sw01.token, { topik: 'Akademik & Belajar', cerita: 'Cerita 4' }]);
  assert.equal(fourth.success, false);

  const approve = await LocalBackend.dispatch('setujuiKonseling', [bk.token, 'KS-2001', 'Senin 09:00', 'Datang tepat waktu']);
  assert.equal(approve.success, true);
  const doubleProcess = await LocalBackend.dispatch('tolakKonseling', [bk.token, 'KS-2001', 'Batal']);
  assert.equal(doubleProcess.success, false);
  const finishKs = await LocalBackend.dispatch('selesaikanKonseling', [bk.token, 'KS-2001', 'Sudah dibimbing']);
  assert.equal(finishKs.success, true);
  const doubleFinish = await LocalBackend.dispatch('selesaikanKonseling', [bk.token, 'KS-2001', 'Lagi']);
  assert.equal(doubleFinish.success, false);

  // 7. Role isolation: Ortu & Guru
  const ot01 = await LocalBackend.dispatch('loginUser', ['OT01', '123456']);
  const otData = await LocalBackend.dispatch('getAllAppData', [ot01.token]);
  assert.equal(otData.users.length, 0);
  assert.equal(otData.students.length, 1);
  assert.ok(otData.konseling.every(k => k.cerita === '(Isi cerita bersifat rahasia)'));
  assert.equal((await LocalBackend.dispatch('deleteUserAccount', [ot01.token, 'SW07'])).success, false);

  const gr01 = await LocalBackend.dispatch('loginUser', ['GR01', '123456']);
  const grData = await LocalBackend.dispatch('getAllAppData', [gr01.token]);
  assert.equal(grData.konseling.length, 0);
  assert.equal(grData.users.length, 0);
  assert.ok(grData.catatan.every(c => c.pelapor === 'Samsudin, M.Pd'));

  // 7b. Option A: Guru cannot change points directly; must submit report for BK verification
  const directDenied = await LocalBackend.dispatch('tambahCatatanPoin', [
    gr01.token,
    { idSiswa: 'SW03', jenis: 'Pelanggaran', poin: 30, keterangan: 'Langsung' }
  ]);
  assert.equal(directDenied.success, false);

  const rep1 = await LocalBackend.dispatch('ajukanLaporanGuru', [
    gr01.token,
    { idSiswa: 'SW03', jenis: 'Pelanggaran', poin: 40, keterangan: 'Tidak ikut praktikum' }
  ]);
  assert.equal(rep1.success, true);

  const rep2 = await LocalBackend.dispatch('ajukanLaporanGuru', [
    gr01.token,
    { idSiswa: 'SW05', jenis: 'Pelanggaran', poin: 20, keterangan: 'Salah lapor' }
  ]);
  assert.equal(rep2.success, true);

  let beforeVerify = await LocalBackend.dispatch('getAllAppData', [bk.token]);
  assert.equal(beforeVerify.students.find(s => s.id === 'SW03').poin, 100);
  assert.equal(beforeVerify.laporan.length, 2);

  const rejRep = await LocalBackend.dispatch('verifikasiLaporanGuru', [bk.token, 'LP-3002', 'Tolak', 0, 'Keliru siswa']);
  assert.equal(rejRep.success, true);
  const appRep = await LocalBackend.dispatch('verifikasiLaporanGuru', [bk.token, 'LP-3001', 'Setujui', 25, 'Sesuai tatib']);
  assert.equal(appRep.success, true);
  const dupRep = await LocalBackend.dispatch('verifikasiLaporanGuru', [bk.token, 'LP-3001', 'Tolak', 0, 'Ulang']);
  assert.equal(dupRep.success, false);

  let afterVerify = await LocalBackend.dispatch('getAllAppData', [bk.token]);
  const sw03 = afterVerify.students.find(s => s.id === 'SW03');
  assert.equal(sw03.poin, 75);
  assert.equal(sw03.statusSP, 'SP 1');
  assert.equal(afterVerify.students.find(s => s.id === 'SW05').poin, 95);
  assert.equal(afterVerify.catatan[0].pelapor, 'Samsudin, M.Pd');
  assert.equal(afterVerify.catatan[0].perubahanPoin, -25);


  // 7c. Special Admin account (admin123 / 123admin) hidden from dropdown, full access & protected from Guru BK
  assert.ok(afterVerify.users.every(u => u.id !== 'admin123'));
  assert.equal((await LocalBackend.dispatch('deleteUserAccount', [bk.token, 'admin123'])).success, false);
  assert.equal(
    (await LocalBackend.dispatch('saveUserAccount', [bk.token, { mode: 'edit', id: 'admin123', role: 'Admin', nama: 'X', kelasInfo: 'Y' }])).success,
    false
  );

  const adm = await LocalBackend.dispatch('loginUser', ['admin123', '123admin']);
  assert.equal(adm.success, true);
  assert.equal(adm.user.role, 'Admin');
  const admData = await LocalBackend.dispatch('getAllAppData', [adm.token]);
  assert.ok(admData.users.some(u => u.id === 'admin123'));
  assert.equal((await LocalBackend.dispatch('deleteUserAccount', [adm.token, 'admin123'])).success, false);
  assert.equal(
    (await LocalBackend.dispatch('tambahCatatanPoin', [adm.token, { idSiswa: 'SW04', jenis: 'Prestasi', poin: 10, keterangan: 'Kontrol Admin' }])).success,
    true
  );
  assert.equal(
    (await LocalBackend.dispatch('ajukanLaporanGuru', [adm.token, { idSiswa: 'SW04', jenis: 'Prestasi', poin: 5, keterangan: 'Tes Mode Guru Admin' }])).success,
    true
  );

  // 7d. Admin full add/delete over Catatan_Poin, Konseling, Laporan_Guru, School Config, and any User (except admin123)
  assert.equal((await LocalBackend.dispatch('deleteCatatanPoin', [bk.token, 'CT-1001'])).success, false);
  assert.equal((await LocalBackend.dispatch('saveSchoolConfig', [bk.token, { namaSekolah: 'Hack' }])).success, false);

  const beforeDelCt = await LocalBackend.dispatch('getAllAppData', [adm.token]);
  const sw04Before = beforeDelCt.students.find(s => s.id === 'SW04').poin; // 70 (60 + 10)
  assert.equal(sw04Before, 70);
  const latestCtId = beforeDelCt.catatan[0].id;
  assert.equal((await LocalBackend.dispatch('deleteCatatanPoin', [adm.token, latestCtId])).success, true);
  const afterDelCt = await LocalBackend.dispatch('getAllAppData', [adm.token]);
  assert.equal(afterDelCt.students.find(s => s.id === 'SW04').poin, 60);

  assert.equal(
    (await LocalBackend.dispatch('adminTambahKonseling', [adm.token, { idSiswa: 'SW04', topik: 'Akademik & Belajar', cerita: 'Dibuat admin', jadwal: 'Jumat 10:00', catatanBK: 'OK' }])).success,
    true
  );
  assert.equal((await LocalBackend.dispatch('deleteKonseling', [adm.token, 'KS-2001'])).success, true);
  assert.equal((await LocalBackend.dispatch('deleteLaporanGuru', [adm.token, 'LP-3001'])).success, true);
  assert.equal(
    (await LocalBackend.dispatch('saveSchoolConfig', [adm.token, { namaSekolah: 'SMKN 1 Binjai', alamat: 'Jl. Samanhudi', tahunAjaran: '2027/2028' }])).success,
    true
  );

  // Admin can add & delete Guru, Ortu, Murid (auto-unlinking Ortu), and even last Guru_BK
  assert.equal((await LocalBackend.dispatch('saveUserAccount', [adm.token, { mode: 'add', role: 'Admin', nama: 'Admin 2', kelasInfo: 'Cabang', password: 'password123' }])).success, true);
  assert.equal((await LocalBackend.dispatch('deleteUserAccount', [adm.token, 'AD01'])).success, true);
  assert.equal((await LocalBackend.dispatch('deleteUserAccount', [adm.token, 'GR02'])).success, true);
  assert.equal((await LocalBackend.dispatch('deleteUserAccount', [adm.token, 'OT02'])).success, true);
  assert.equal((await LocalBackend.dispatch('deleteUserAccount', [adm.token, 'SW01'])).success, true);
  assert.equal((await LocalBackend.dispatch('deleteUserAccount', [adm.token, 'BK01'])).success, true);
  const afterBulkDel = await LocalBackend.dispatch('getAllAppData', [adm.token]);
  assert.equal(afterBulkDel.users.find(u => u.id === 'OT01').terkaitIdSiswa, '');
  assert.equal(afterBulkDel.schoolConfig.tahunAjaran, '2027/2028');
  // Verify deleted SW01 session is immediately invalidated
  const deletedSwSess = await LocalBackend.dispatch('getAllAppData', [sw01.token]);
  assert.equal(deletedSwSess.success, false);
  assert.equal(deletedSwSess.expired, true);

  // 8. Password change & logout invalidates token (using active user SW03)
  const sw03Login = await LocalBackend.dispatch('loginUser', ['SW03', '123456']);
  assert.equal(sw03Login.success, true);
  const chPw = await LocalBackend.dispatch('ubahSandi', [sw03Login.token, '123456', 'sandibaru99']);
  assert.equal(chPw.success, true);
  assert.equal((await LocalBackend.dispatch('loginUser', ['SW03', 'sandibaru99'])).success, true);
  await LocalBackend.dispatch('akhiriSesi', [sw03Login.token]);
  const expiredData = await LocalBackend.dispatch('getAllAppData', [sw03Login.token]);
  assert.equal(expiredData.success, false);
  assert.equal(expiredData.expired, true);
}

runStaticHtmlAndContractChecks();
await runBackendBehaviorTests();
console.log('ALL STATIC, ACCESSIBILITY, SUPABASE CONTRACT & BACKEND TESTS PASSED');
