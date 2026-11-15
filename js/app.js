/* ==========================================================================
   E-BK SMKN 1 Kota Binjai — Frontend Application Controller
   ========================================================================== */
(function (globalScope) {
  'use strict';

  let allAccounts = [];
  let selectedLoginRole = 'Murid';
  let currentUser = null;
  let appData = { users: [], students: [], catatan: [], konseling: [] };
  let isSettingsOpen = false;
  let isTabelBKExpanded = true;
  let bkStatusFilter = 'all'; // 'all' | 'sp' | 'skorsing'
  let guruOnlyBinaan = false;
  let sessionToken = null;
  let loadingTimer = null;

  const ROLE_LABELS = {
    Murid: 'Murid',
    Guru: 'Guru / Wali Kelas',
    Ortu: 'Orang Tua',
    Guru_BK: 'Guru BK'
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function $(id) {
    return document.getElementById(id);
  }

  function showLoading(text = 'Memproses data...') {
    $('loadingText').innerText = text;
    $('loadingOverlay').style.display = 'flex';
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(() => {
      hideLoading();
      showToast('Server tidak merespons. Silakan coba lagi.', 'error');
    }, 30000);
  }

  function hideLoading() {
    $('loadingOverlay').style.display = 'none';
    clearTimeout(loadingTimer);
  }

  function showToast(message, type = 'success') {
    if (/Sesi berakhir/.test(message) && sessionToken) {
      forceLogout();
    }
    const toastEl = $('appToast');
    const toastBody = $('toastMessage');
    const bgClass = type === 'error' ? 'bg-danger' : type === 'warning' ? 'bg-warning text-dark' : 'bg-success';
    toastEl.className = `toast align-items-center text-white border-0 shadow-lg ${bgClass}`;
    toastBody.innerText = message;
    new bootstrap.Toast(toastEl, { delay: 3800 }).show();
  }

  function getSPBadgeHtml(statusSP) {
    if (statusSP === 'Aman') {
      return '<span class="badge-sp badge-sp-aman"><i class="bi bi-check-circle-fill" aria-hidden="true"></i> Aman</span>';
    }
    if (statusSP === 'SP 1') {
      return '<span class="badge-sp badge-sp-1"><i class="bi bi-exclamation-circle-fill" aria-hidden="true"></i> SP 1</span>';
    }
    if (statusSP === 'SP 2') {
      return '<span class="badge-sp badge-sp-2"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i> SP 2</span>';
    }
    return `<span class="badge-sp badge-sp-3"><i class="bi bi-shield-exclamation" aria-hidden="true"></i> ${esc(statusSP)}</span>`;
  }

  function getPoinChipHtml(poin) {
    const val = Number(poin);
    const cls = val >= 85 ? 'poin-ok' : val >= 70 ? 'poin-warn' : 'poin-bad';
    return `<span class="poin-chip ${cls}">${esc(val)}/100</span>`;
  }

  function updateConnectionBadge() {
    const badge = $('connectionModeBadge');
    const btnConn = $('btnOpenConnModal');
    const btnSetConn = $('btnSettingsConnModal');
    const mode = BackendAPI.getMode();

    if (mode === 'gas-native') {
      badge.innerHTML = '<i class="bi bi-cloud-check-fill me-1 text-success" aria-hidden="true"></i> Google Apps Script';
      if (btnConn) btnConn.style.display = 'none';
      if (btnSetConn) btnSetConn.style.display = 'none';
    } else if (mode === 'supabase') {
      badge.innerHTML = '<i class="bi bi-database-fill-check me-1 text-success" aria-hidden="true"></i> Terhubung Supabase';
      if (btnConn) btnConn.style.display = '';
      if (btnSetConn) btnSetConn.style.display = '';
    } else if (mode === 'gas-remote') {
      badge.innerHTML = '<i class="bi bi-cloud-check-fill me-1 text-success" aria-hidden="true"></i> Terhubung Google Sheets';
      if (btnConn) btnConn.style.display = '';
      if (btnSetConn) btnSetConn.style.display = '';
    } else {
      badge.innerHTML = '<i class="bi bi-hdd-stack me-1 text-primary" aria-hidden="true"></i> Mode Lokal Browser';
      if (btnConn) btnConn.style.display = '';
      if (btnSetConn) btnSetConn.style.display = '';
    }
  }

  function labelCells(tbody) {
    const table = tbody.closest('table');
    if (!table) return;
    const heads = [...table.querySelectorAll('thead th')].map(t => t.textContent.trim());
    tbody.querySelectorAll('tr').forEach(tr => {
      [...tr.children].forEach((td, i) => {
        if (!td.colSpan || td.colSpan < 2) td.dataset.label = heads[i] || '';
      });
    });
  }

  function togglePw() {
    const input = $('loginPassword');
    const btn = $('btnTogglePw');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    btn.setAttribute('aria-label', show ? 'Sembunyikan sandi' : 'Tampilkan sandi');
    btn.querySelector('i').className = show ? 'bi bi-eye-slash' : 'bi bi-eye';
  }

  function forceLogout() {
    currentUser = null;
    sessionToken = null;
    isSettingsOpen = false;
    isTabelBKExpanded = true;
    bkStatusFilter = 'all';
    guruOnlyBinaan = false;
    $('mainAppSection').style.display = 'none';
    $('loginSection').style.display = 'flex';
    $('loginPassword').value = '';
    $('counselingRequestCard').style.display = '';
    hideLoading();
    loadLoginAccounts();
  }

  // =========================================================================
  // LOGIN & KONEKSI DATABASE
  // =========================================================================
  async function loadLoginAccounts() {
    showLoading('Menghubungkan ke Database SMKN 1 Kota Binjai...');
    try {
      const res = await BackendAPI.call('getLoginAccounts');
      hideLoading();
      if (res.success) {
        allAccounts = res.data;
        populateLoginDropdown();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      hideLoading();
      showToast('Gagal memuat daftar akun: ' + err.message, 'error');
    }
  }

  function selectLoginRole(role, btnEl) {
    selectedLoginRole = role;
    document.querySelectorAll('.role-tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    btnEl.classList.add('active');
    btnEl.setAttribute('aria-selected', 'true');
    $('selectedRoleLabel').innerText = ROLE_LABELS[role] || role;
    populateLoginDropdown();
  }

  function populateLoginDropdown() {
    const select = $('loginAccountSelect');
    const filtered = allAccounts.filter(acc => acc.role === selectedLoginRole);
    select.innerHTML = '';
    if (filtered.length === 0) {
      select.innerHTML = '<option value="">-- Tidak ada akun pada peran ini --</option>';
      return;
    }
    filtered.forEach(acc => {
      const opt = document.createElement('option');
      opt.value = acc.id;
      opt.textContent = `${acc.nama} (${acc.kelasInfo})`;
      select.appendChild(opt);
    });
  }

  async function handleLogin(e) {
    e.preventDefault();
    const userId = $('loginAccountSelect').value;
    const password = $('loginPassword').value;
    if (!userId) {
      showToast('Silakan pilih akun terlebih dahulu.', 'warning');
      return;
    }

    showLoading('Memverifikasi kredensial...');
    try {
      const res = await BackendAPI.call('loginUser', userId, password);
      if (res.success) {
        currentUser = res.user;
        sessionToken = res.token;
        showToast(`Selamat datang, ${currentUser.nama}!`);
        enterMainApplication();
      } else {
        hideLoading();
        showToast(res.message, 'error');
      }
    } catch (err) {
      hideLoading();
      showToast('Kesalahan login: ' + err.message, 'error');
    }
  }

  function enterMainApplication() {
    $('loginSection').style.display = 'none';
    $('mainAppSection').style.display = 'block';
    $('navUserName').innerText = currentUser.nama.split(',')[0];
    $('navRoleBadge').innerText = ROLE_LABELS[currentUser.role] || currentUser.role.replace('_', ' ');
    $('btnNavSettings').style.display = currentUser.role === 'Guru_BK' ? 'inline-flex' : 'none';
    refreshAllData();
  }

  function logoutUser() {
    if (sessionToken) {
      BackendAPI.call('akhiriSesi', sessionToken).catch(() => {});
    }
    currentUser = null;
    sessionToken = null;
    isSettingsOpen = false;
    isTabelBKExpanded = true;
    bkStatusFilter = 'all';
    guruOnlyBinaan = false;
    $('loginPassword').value = '';
    $('bkSearchKelasInput').value = '';
    $('guruSearchNama').value = '';
    $('counselingRequestCard').style.display = '';
    $('mainAppSection').style.display = 'none';
    $('loginSection').style.display = 'flex';
    loadLoginAccounts();
    showToast('Anda telah keluar dari sistem.');
  }

  function toggleConnFields() {
    const val = $('selectConnMode').value;
    $('connFieldsSupabase').style.display = val === 'supabase' ? 'block' : 'none';
    $('connFieldsGas').style.display = val === 'gas' ? 'block' : 'none';
  }

  function openConnectionModal() {
    const cfg = BackendAPI.getConfig();
    $('selectConnMode').value = cfg.mode === 'gas-remote' ? 'gas' : 'supabase';
    $('inputSupabaseUrl').value = cfg.sbUrl || '';
    $('inputSupabaseAnonKey').value = cfg.sbKey || '';
    $('inputGasApiUrl').value = cfg.gasUrl || '';
    toggleConnFields();
    bootstrap.Modal.getOrCreateInstance($('modalKoneksi')).show();
  }

  async function saveConnectionConfig() {
    const sel = $('selectConnMode').value;

    if (sel === 'local') {
      BackendAPI.setLocalMode();
      updateConnectionBadge();
      bootstrap.Modal.getInstance($('modalKoneksi')).hide();
      showToast('Beralih ke Mode Lokal Browser.');
      if (sessionToken) forceLogout();
      else loadLoginAccounts();
      return;
    }

    if (sel === 'supabase') {
      const sbUrl = $('inputSupabaseUrl').value.trim().replace(/\/+$/, '');
      const sbKey = $('inputSupabaseAnonKey').value.trim();
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(sbUrl) || !sbKey) {
        showToast('Isi Project URL (https://....supabase.co) dan Publishable/Anon Key dengan benar.', 'warning');
        return;
      }
      if (/^sb_secret_/i.test(sbKey)) {
        showToast('Jangan gunakan Secret key di browser! Gunakan Publishable key atau Legacy anon key.', 'error');
        return;
      }
      showLoading('Menguji koneksi ke Supabase...');
      try {
        const data = await BackendAPI.connectSupabase(sbUrl, sbKey);
        hideLoading();
        updateConnectionBadge();
        bootstrap.Modal.getInstance($('modalKoneksi')).hide();
        showToast(data.message || 'Berhasil terhubung ke Supabase!');
        if (sessionToken) forceLogout();
        else loadLoginAccounts();
      } catch (err) {
        hideLoading();
        showToast('Gagal terhubung ke Supabase: ' + err.message, 'error');
      }
      return;
    }

    const url = $('inputGasApiUrl').value.trim();
    if (!/^https:\/\/script\.google\.com\//i.test(url)) {
      showToast('URL harus berasal dari https://script.google.com/.../exec', 'warning');
      return;
    }
    showLoading('Menguji koneksi ke Google Apps Script...');
    try {
      const data = await BackendAPI.connectGas(url);
      hideLoading();
      updateConnectionBadge();
      bootstrap.Modal.getInstance($('modalKoneksi')).hide();
      showToast(data.message || 'Berhasil terhubung ke Google Sheets!');
      if (sessionToken) forceLogout();
      else loadLoginAccounts();
    } catch (err) {
      hideLoading();
      showToast('Gagal terhubung ke URL Apps Script: ' + err.message, 'error');
    }
  }

  async function resetLocalDemoData() {
    if (!confirm('Reset seluruh data lokal di browser ini kembali ke data awal?')) return;
    const res = await LocalBackend.reset();
    bootstrap.Modal.getInstance($('modalKoneksi')).hide();
    showToast(res.message);
    if (sessionToken) forceLogout();
    else loadLoginAccounts();
  }

  // =========================================================================
  // SINKRONISASI & ROUTING TAMPILAN
  // =========================================================================
  async function refreshAllData() {
    showLoading('Menyinkronkan data...');
    try {
      const res = await BackendAPI.call('getAllAppData', sessionToken);
      hideLoading();
      if (res.success) {
        appData = res;
        currentUser = res.me;
        populateStudentSelectOptions();
        renderActiveRoleView();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      hideLoading();
      showToast('Gagal menyinkronkan data: ' + err.message, 'error');
    }
  }

  function renderActiveRoleView() {
    ['viewGuruBK', 'viewMurid', 'viewGuru', 'viewOrtu', 'viewPengaturan'].forEach(id => {
      $(id).style.display = 'none';
    });

    const btnSettings = $('btnNavSettings');
    if (isSettingsOpen && currentUser.role === 'Guru_BK') {
      btnSettings.classList.replace('btn-outline-secondary', 'btn-primary');
      $('viewPengaturan').style.display = 'block';
      renderSettingsView();
      return;
    }
    if (btnSettings) btnSettings.classList.replace('btn-primary', 'btn-outline-secondary');

    if (currentUser.role === 'Guru_BK') {
      $('viewGuruBK').style.display = 'block';
      renderDashboardGuruBK();
    } else if (currentUser.role === 'Murid') {
      $('viewMurid').style.display = 'block';
      $('counselingRequestCard').style.display = '';
      renderDashboardMurid(currentUser.id);
    } else if (currentUser.role === 'Guru') {
      $('viewGuru').style.display = 'block';
      renderDashboardGuru();
    } else if (currentUser.role === 'Ortu') {
      $('viewOrtu').style.display = 'block';
      renderDashboardOrtu();
    }
  }

  // =========================================================================
  // DASHBOARD GURU BK
  // =========================================================================
  function renderDashboardGuruBK() {
    const students = appData.students;
    const uniqueClasses = [...new Set(students.map(s => s.kelasInfo))];
    $('statLokalSiswa').innerText = students.length;
    $('statJumlahKelas').innerText = `${uniqueClasses.length} Kelas Aktif`;

    const spCount = students.filter(s => s.statusSP !== 'Aman').length;
    $('statKasusSP').innerText = spCount;

    const pendingKonseling = appData.konseling.filter(k => k.status === 'Menunggu');
    $('statKonseling').innerText = pendingKonseling.length;
    $('bkHeaderKonselingCount').innerText = pendingKonseling.length;
    $('ovalKonselingCount').innerText = pendingKonseling.length;

    const skorsingCount = students.filter(s => s.skorsing === 'Ya').length;
    $('statSkorsing').innerText = skorsingCount;

    renderTabelSiswaBK();
  }

  function setBkStatusFilter(filter, btnEl) {
    bkStatusFilter = filter;
    document.querySelectorAll('#bkFilterPills .filter-pill').forEach(btn => {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    });
    btnEl.classList.add('active');
    btnEl.setAttribute('aria-pressed', 'true');
    renderTabelSiswaBK();
  }

  function renderTabelSiswaBK() {
    const keyword = $('bkSearchKelasInput').value.toLowerCase().trim();
    const tbody = $('bkTabelSiswaBody');

    const filtered = appData.students.filter(s => {
      const matchText = s.kelasInfo.toLowerCase().includes(keyword) || s.nama.toLowerCase().includes(keyword);
      if (!matchText) return false;
      if (bkStatusFilter === 'sp') return s.statusSP !== 'Aman';
      if (bkStatusFilter === 'skorsing') return s.skorsing === 'Ya';
      return true;
    });

    tbody.innerHTML = '';
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">Tidak ada siswa yang sesuai dengan filter saat ini.</td></tr>`;
    } else {
      filtered.forEach(s => {
        const ketText = s.skorsing === 'Ya'
          ? '<span class="badge rounded-pill bg-danger-subtle text-danger fw-semibold">Sedang Diskors</span>'
          : (s.statusSP === 'Aman'
            ? '<span class="text-muted">Aktif / Normal</span>'
            : '<span class="text-warning-emphasis fw-semibold">Dalam Pembinaan BK</span>');

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="fw-semibold text-dark">${esc(s.nama)}</td>
          <td><span class="badge bg-light text-dark border">${esc(s.kelasInfo)}</span></td>
          <td>${getPoinChipHtml(s.poin)}</td>
          <td>${getSPBadgeHtml(s.statusSP)}</td>
          <td class="small">${ketText}</td>
          <td class="text-end">
            <button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3" data-tindakan-id="${esc(s.id)}">
              Tindakan
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    $('bkTotalSummaryText').innerHTML = `Menampilkan <strong>${filtered.length}</strong> dari <strong>${appData.students.length}</strong> siswa`;
  }

  function toggleTabelBK() {
    const wrapper = $('bkTableWrapper');
    const btn = $('btnToggleTabelBK');
    isTabelBKExpanded = !isTabelBKExpanded;
    wrapper.style.display = isTabelBKExpanded ? 'block' : 'none';
    btn.setAttribute('aria-expanded', isTabelBKExpanded ? 'true' : 'false');
    btn.innerHTML = isTabelBKExpanded
      ? '<i class="bi bi-chevron-up me-1" aria-hidden="true"></i> Sembunyikan Daftar'
      : '<i class="bi bi-chevron-down me-1" aria-hidden="true"></i> Tampilkan Daftar';
  }

  function openKonselingListModal() {
    const container = $('daftarPengajuanKonselingContainer');
    container.innerHTML = '';

    if (appData.konseling.length === 0) {
      container.innerHTML = '<div class="text-center text-muted py-4">Belum ada pengajuan konseling dari siswa.</div>';
    } else {
      appData.konseling.forEach(item => {
        const isPending = item.status === 'Menunggu';
        const isRejected = item.status === 'Ditolak';
        const card = document.createElement('div');
        card.className = `p-3 rounded-4 border ${isPending ? 'bg-info-subtle border-info' : 'bg-light'}`;

        card.innerHTML = `
          <div class="d-flex justify-content-between align-items-start gap-2 mb-2 flex-wrap">
            <div>
              <h6 class="fw-bold mb-0 text-dark">${esc(item.namaSiswa)} <span class="badge bg-white text-dark border ms-1">${esc(item.kelas)}</span></h6>
              <small class="text-muted">Topik: <strong>${esc(item.topik)}</strong> • ${esc(item.tanggal)}</small>
            </div>
            <span class="badge ${isPending ? 'bg-warning text-dark' : isRejected ? 'bg-danger' : 'bg-success'} rounded-pill px-3">
              ${esc(item.status)}
            </span>
          </div>
          <p class="bg-white p-3 rounded-3 border mb-3 fst-italic text-dark">"${esc(item.cerita)}"</p>
          ${isPending ? `
            <div class="row g-2 align-items-end">
              <div class="col-12 col-md-5">
                <label class="form-label small fw-semibold mb-1" for="jadwalInput_${esc(item.id)}">Jadwal Konseling</label>
                <input type="text" id="jadwalInput_${esc(item.id)}" class="form-control form-control-sm"
                       placeholder="Mis: Besok, 10:00 WIB (Ruang BK)">
              </div>
              <div class="col-12 col-md-4">
                <label class="form-label small fw-semibold mb-1" for="catatanInput_${esc(item.id)}">Pesan / Alasan untuk Siswa</label>
                <input type="text" id="catatanInput_${esc(item.id)}" class="form-control form-control-sm"
                       value="Silakan datang ke Ruang BK">
              </div>
              <div class="col-12 col-md-3 d-grid gap-1">
                <button type="button" class="btn btn-primary btn-sm fw-semibold" data-approve-ks="${esc(item.id)}">
                  Setujui & Jadwalkan
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" data-reject-ks="${esc(item.id)}">
                  Tolak Pengajuan
                </button>
              </div>
            </div>
          ` : `
            <div class="small ${isRejected ? 'text-danger' : 'text-success'} fw-semibold">
              <i class="bi ${isRejected ? 'bi-x-circle' : 'bi-calendar-check'} me-1" aria-hidden="true"></i>
              ${isRejected ? 'Ditolak' : 'Jadwal: ' + esc(item.jadwal)} — (${esc(item.catatanBK)})
            </div>
          `}
        `;
        container.appendChild(card);
      });
    }

    bootstrap.Modal.getOrCreateInstance($('modalPengajuanKonseling')).show();
  }

  async function prosesSetujuiKonseling(idKonseling) {
    const jadwal = $('jadwalInput_' + idKonseling).value.trim();
    const catatan = $('catatanInput_' + idKonseling).value.trim();
    if (!jadwal) {
      showToast('Harap isi tanggal & jam jadwal konseling terlebih dahulu.', 'warning');
      return;
    }

    showLoading('Menyimpan jadwal konseling...');
    try {
      const res = await BackendAPI.call('setujuiKonseling', sessionToken, idKonseling, jadwal, catatan);
      hideLoading();
      if (res.success) {
        showToast(res.message);
        bootstrap.Modal.getInstance($('modalPengajuanKonseling')).hide();
        refreshAllData();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      hideLoading();
      showToast('Gagal: ' + err.message, 'error');
    }
  }

  async function prosesTolakKonseling(idKonseling) {
    const alasan = $('catatanInput_' + idKonseling).value.trim();
    showLoading('Menyimpan keputusan...');
    try {
      const res = await BackendAPI.call('tolakKonseling', sessionToken, idKonseling, alasan);
      hideLoading();
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) {
        bootstrap.Modal.getInstance($('modalPengajuanKonseling')).hide();
        refreshAllData();
      }
    } catch (err) {
      hideLoading();
      showToast('Gagal: ' + err.message, 'error');
    }
  }

  // =========================================================================
  // DASHBOARD MURID & ORANG TUA
  // =========================================================================
  function renderDashboardMurid(siswaId) {
    const siswa = appData.students.find(s => String(s.id) === String(siswaId));
    if (!siswa) return;

    $('muridSubHeader').innerText = `${siswa.nama} • Kelas ${siswa.kelasInfo}`;
    $('muridSkorsingAlert').style.display = siswa.skorsing === 'Ya' ? 'flex' : 'none';
    $('muridPoinVal').innerText = siswa.poin;

    const bar = $('muridPoinBar');
    bar.style.width = `${siswa.poin}%`;
    bar.setAttribute('aria-valuenow', String(siswa.poin));
    bar.className = `progress-bar ${siswa.poin >= 85 ? 'bg-success' : siswa.poin >= 70 ? 'bg-warning' : 'bg-danger'}`;

    const statusEl = $('muridStatusText');
    statusEl.innerHTML = getSPBadgeHtml(siswa.statusSP);
    $('muridJumlahSP').innerText = siswa.statusSP === 'Aman' ? '0 (Nihil)' : siswa.statusSP;

    const myKonseling = appData.konseling.filter(k => String(k.idSiswa) === String(siswa.id));
    const latestScheduled = myKonseling.find(k => String(k.status).indexOf('Disetujui') === 0);
    if (latestScheduled) {
      $('muridJadwalKonseling').innerText = latestScheduled.jadwal;
      $('muridStatusKonselingBadge').innerText = 'Disetujui Guru BK';
    } else if (myKonseling.some(k => k.status === 'Menunggu')) {
      $('muridJadwalKonseling').innerText = 'Menunggu persetujuan guru BK';
      $('muridStatusKonselingBadge').innerText = 'Dalam Antrean';
    } else if (myKonseling.length > 0) {
      $('muridJadwalKonseling').innerText = 'Pengajuan ditolak';
      $('muridStatusKonselingBadge').innerText = myKonseling[0].catatanBK || '-';
    } else {
      $('muridJadwalKonseling').innerText = 'Belum ada jadwal';
      $('muridStatusKonselingBadge').innerText = '-';
    }

    const listEl = $('muridListPengajuan');
    listEl.innerHTML = '';
    if (myKonseling.length === 0) {
      listEl.innerHTML = '<small class="text-muted">Belum ada riwayat pengajuan konseling.</small>';
    } else {
      myKonseling.forEach(k => {
        const isWait = k.status === 'Menunggu';
        const isRejected = k.status === 'Ditolak';
        listEl.innerHTML += `
          <div class="p-3 rounded-3 border bg-light small">
            <div class="d-flex justify-content-between align-items-center gap-2 fw-semibold flex-wrap">
              <span>${esc(k.topik)}</span>
              <span class="badge ${isWait ? 'bg-warning text-dark' : isRejected ? 'bg-danger' : 'bg-success'}">
                ${isWait ? 'Menunggu persetujuan guru BK' : isRejected ? 'Ditolak: ' + esc(k.catatanBK) : 'Terjadwal: ' + esc(k.jadwal)}
              </span>
            </div>
            <div class="text-muted mt-1">"${esc(k.cerita)}"</div>
          </div>
        `;
      });
    }

    const myCatatan = appData.catatan.filter(c => String(c.idSiswa) === String(siswa.id));
    const tbody = $('muridTabelRiwayat');
    tbody.innerHTML = '';
    if (myCatatan.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">Belum ada catatan pelanggaran maupun prestasi.</td></tr>';
    } else {
      myCatatan.forEach(c => {
        const isPositive = c.jenis !== 'Pelanggaran';
        const deltaStr = c.perubahanPoin > 0 ? '+' + c.perubahanPoin : String(c.perubahanPoin);
        tbody.innerHTML += `
          <tr>
            <td class="small text-muted text-nowrap">${esc(c.tanggal)}</td>
            <td class="fw-medium">${esc(c.keterangan)}</td>
            <td>
              <span class="badge ${isPositive ? 'bg-success-subtle text-success-emphasis' : 'bg-danger-subtle text-danger'}">
                ${esc(c.jenis)}
              </span>
            </td>
            <td class="text-end fw-bold tabular-nums ${isPositive ? 'text-success' : 'text-danger'}">
              ${esc(deltaStr)}
            </td>
          </tr>
        `;
      });
    }
  }

  async function handleAjukanKonseling(e) {
    e.preventDefault();
    const topik = $('konselingTopik').value;
    const cerita = $('konselingCerita').value.trim();
    if (!cerita) return;

    showLoading('Mengirim pengajuan konseling...');
    try {
      const res = await BackendAPI.call('ajukanKonseling', sessionToken, { topik, cerita });
      hideLoading();
      if (res.success) {
        $('konselingCerita').value = '';
        showToast(res.message);
        refreshAllData();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      hideLoading();
      showToast('Gagal mengirim pengajuan: ' + err.message, 'error');
    }
  }

  function renderDashboardOrtu() {
    const childId = currentUser.terkaitIdSiswa;
    const container = $('ortuChildContainer');
    container.innerHTML = '';

    if (!childId) {
      container.innerHTML = '<div class="alert alert-warning">Akun Orang Tua belum dihubungkan ke data siswa. Hubungi Guru BK di Halaman Pengaturan.</div>';
      return;
    }

    $('viewMurid').style.display = 'block';
    $('counselingRequestCard').style.display = 'none';
    renderDashboardMurid(childId);
  }

  // =========================================================================
  // DASHBOARD GURU / WALI KELAS
  // =========================================================================
  function getGuruBinaanKelas() {
    const isWali = /wali kelas/i.test(currentUser.kelasInfo);
    return isWali ? currentUser.kelasInfo.replace(/Wali Kelas/i, '').trim() : '';
  }

  function renderDashboardGuru() {
    $('guruSubHeader').innerText = `${currentUser.nama} • ${currentUser.kelasInfo}`;
    const kelasMatch = getGuruBinaanKelas();
    const binaan = kelasMatch
      ? appData.students.filter(s => s.kelasInfo.toLowerCase() === kelasMatch.toLowerCase())
      : [];
    const siswaTampil = binaan.length > 0 ? binaan : appData.students;

    $('guruStatBinaan').innerText = siswaTampil.length;
    $('guruLabelKelasBinaan').innerText = binaan.length > 0 ? `Kelas ${kelasMatch}` : 'Seluruh Siswa Sekolah';
    $('guruStatPerhatian').innerText = siswaTampil.filter(s => s.statusSP !== 'Aman').length;
    $('guruStatLaporan').innerText = appData.catatan.filter(c => c.pelapor === currentUser.nama).length;

    const btnBinaan = $('btnGuruToggleBinaan');
    if (binaan.length > 0) {
      btnBinaan.style.display = 'inline-flex';
      btnBinaan.setAttribute('aria-pressed', guruOnlyBinaan ? 'true' : 'false');
    } else {
      btnBinaan.style.display = 'none';
      guruOnlyBinaan = false;
    }

    const filterSelect = $('guruFilterKelas');
    const prevVal = filterSelect.value;
    const uniqueClasses = [...new Set(appData.students.map(s => s.kelasInfo))];
    filterSelect.innerHTML = '<option value="">Semua Kelas</option>';
    uniqueClasses.forEach(kls => {
      filterSelect.innerHTML += `<option value="${esc(kls)}">${esc(kls)}</option>`;
    });
    if (uniqueClasses.includes(prevVal)) filterSelect.value = prevVal;

    renderTabelGuru();
  }

  function toggleGuruBinaanOnly() {
    guruOnlyBinaan = !guruOnlyBinaan;
    const btn = $('btnGuruToggleBinaan');
    btn.classList.toggle('active', guruOnlyBinaan);
    btn.setAttribute('aria-pressed', guruOnlyBinaan ? 'true' : 'false');
    renderTabelGuru();
  }

  function renderTabelGuru() {
    const searchNama = $('guruSearchNama').value.toLowerCase().trim();
    const filterKelas = $('guruFilterKelas').value;
    const kelasMatch = getGuruBinaanKelas();
    const tbody = $('guruTabelSiswaBody');

    const filtered = appData.students.filter(s => {
      if (guruOnlyBinaan && kelasMatch && s.kelasInfo.toLowerCase() !== kelasMatch.toLowerCase()) return false;
      const matchNama = s.nama.toLowerCase().includes(searchNama);
      const matchKelas = filterKelas === '' || s.kelasInfo === filterKelas;
      return matchNama && matchKelas;
    });

    tbody.innerHTML = '';
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">Tidak ada siswa yang sesuai pencarian.</td></tr>';
      return;
    }
    filtered.forEach(s => {
      tbody.innerHTML += `
        <tr>
          <td class="fw-semibold">${esc(s.nama)}</td>
          <td><span class="badge bg-light text-dark border">${esc(s.kelasInfo)}</span></td>
          <td>${getPoinChipHtml(s.poin)}</td>
          <td>${getSPBadgeHtml(s.statusSP)}</td>
          <td>
            <span class="badge ${s.statusSP === 'Aman' ? 'bg-success-subtle text-success-emphasis' : 'bg-warning-subtle text-warning-emphasis'}">
              ${s.statusSP === 'Aman' ? 'Baik / Aman' : 'Perlu Perhatian'}
            </span>
          </td>
        </tr>
      `;
    });
  }

  // =========================================================================
  // MODAL CATAT POIN, TINDAKAN & PROFIL
  // =========================================================================
  function populateStudentSelectOptions() {
    const select = $('inputCatatanSiswa');
    select.innerHTML = '<option value="">-- Pilih Nama Siswa --</option>';
    appData.students.forEach(s => {
      select.innerHTML += `<option value="${esc(s.id)}">${esc(s.nama)} (${esc(s.kelasInfo)}) - Poin: ${esc(s.poin)}</option>`;
    });
  }

  function openCatatPoinModal() {
    $('inputCatatanKeterangan').value = '';
    bootstrap.Modal.getOrCreateInstance($('modalCatatPoin')).show();
  }

  function updateDefaultPoinInput() {
    const isPrestasi = $('radioPrestasi').checked;
    $('inputCatatanPoin').value = isPrestasi ? 15 : 10;
  }

  async function handleSimpanCatatanPoin(e) {
    e.preventDefault();
    const idSiswa = $('inputCatatanSiswa').value;
    const jenis = document.querySelector('input[name="jenisCatatan"]:checked').value;
    const poin = $('inputCatatanPoin').value;
    const keterangan = $('inputCatatanKeterangan').value.trim();

    showLoading('Menyimpan catatan & menghitung ulang poin...');
    try {
      const res = await BackendAPI.call('tambahCatatanPoin', sessionToken, { idSiswa, jenis, poin, keterangan });
      hideLoading();
      if (res.success) {
        bootstrap.Modal.getInstance($('modalCatatPoin')).hide();
        showToast(res.message);
        refreshAllData();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      hideLoading();
      showToast('Gagal menyimpan catatan: ' + err.message, 'error');
    }
  }

  function openTindakanModal(idSiswa) {
    const st = appData.students.find(x => x.id === idSiswa) || {};
    $('tindakanIdSiswa').value = idSiswa;
    $('tindakanNamaSiswa').innerText = st.nama || '-';
    $('tindakanStatusSkorsing').value = st.skorsing || 'Tidak';
    $('tindakanResetPoin').checked = false;
    bootstrap.Modal.getOrCreateInstance($('modalTindakanSiswa')).show();
  }

  async function handleSimpanTindakan(e) {
    e.preventDefault();
    const idSiswa = $('tindakanIdSiswa').value;
    const skorsing = $('tindakanStatusSkorsing').value;
    const resetPoin = $('tindakanResetPoin').checked;

    showLoading('Memperbarui status pembinaan...');
    try {
      const res = await BackendAPI.call('updateTindakanSiswa', sessionToken, idSiswa, skorsing, resetPoin);
      hideLoading();
      if (res.success) {
        bootstrap.Modal.getInstance($('modalTindakanSiswa')).hide();
        showToast(res.message);
        refreshAllData();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      hideLoading();
      showToast('Gagal memperbarui tindakan: ' + err.message, 'error');
    }
  }

  function openProfileModal() {
    $('profilModalNama').innerText = currentUser.nama;
    $('profilModalRole').innerText = ROLE_LABELS[currentUser.role] || currentUser.role.replace('_', ' ');
    $('profilModalInfo').innerText = currentUser.kelasInfo;
    $('formUbahSandi').reset();
    bootstrap.Modal.getOrCreateInstance($('modalProfil')).show();
  }

  async function handleUbahSandi(e) {
    e.preventDefault();
    showLoading('Menyimpan sandi baru...');
    try {
      const res = await BackendAPI.call('ubahSandi', sessionToken, $('sandiLama').value, $('sandiBaru').value);
      hideLoading();
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) e.target.reset();
    } catch (err) {
      hideLoading();
      showToast('Gagal: ' + err.message, 'error');
    }
  }

  // =========================================================================
  // PENGATURAN (CRUD AKUN & SETUP DATABASE)
  // =========================================================================
  function toggleSettingsView() {
    isSettingsOpen = !isSettingsOpen;
    renderActiveRoleView();
  }

  function renderSettingsView() {
    $('totalUsersBadge').innerText = `${appData.users.length} Akun`;

    const ortuSelect = $('crudUserTerkaitSiswa');
    ortuSelect.innerHTML = '<option value="">-- Pilih Putra/Putri --</option>';
    appData.students.forEach(s => {
      ortuSelect.innerHTML += `<option value="${esc(s.id)}">${esc(s.nama)} (${esc(s.kelasInfo)})</option>`;
    });

    const keyword = ($('settingsSearchUsers') ? $('settingsSearchUsers').value : '').toLowerCase().trim();
    const list = appData.users.filter(u =>
      !keyword || u.nama.toLowerCase().includes(keyword) || u.id.toLowerCase().includes(keyword) || u.kelasInfo.toLowerCase().includes(keyword)
    );

    const tbody = $('crudTabelUsersBody');
    tbody.innerHTML = '';
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">Tidak ada akun yang cocok.</td></tr>';
      return;
    }

    list.forEach(u => {
      tbody.innerHTML += `
        <tr>
          <td class="small text-muted fw-bold">${esc(u.id)}</td>
          <td><span class="badge bg-secondary-subtle text-dark">${esc(u.role)}</span></td>
          <td class="fw-semibold">${esc(u.nama)}</td>
          <td class="small">${esc(u.kelasInfo)}</td>
          <td class="text-end text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-primary me-1" data-edit-user="${esc(u.id)}" aria-label="Edit ${esc(u.nama)}">
              <i class="bi bi-pencil-square" aria-hidden="true"></i>
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-delete-user="${esc(u.id)}" aria-label="Hapus ${esc(u.nama)}">
              <i class="bi bi-trash" aria-hidden="true"></i>
            </button>
          </td>
        </tr>
      `;
    });
  }

  function toggleOrtuChildSelect() {
    $('ortuStudentLinkGroup').style.display = $('crudUserRole').value === 'Ortu' ? 'block' : 'none';
  }

  function editUserAccount(id) {
    const u = appData.users.find(x => x.id === id);
    if (!u) return;
    $('formUserTitle').innerText = 'Edit Data Akun';
    $('crudUserMode').value = 'edit';
    $('crudUserId').value = u.id;
    $('crudUserRole').value = u.role;
    $('crudUserRole').disabled = true;
    $('crudUserNama').value = u.nama;
    $('crudUserKelas').value = u.kelasInfo;
    $('crudUserPassword').value = '';
    $('crudUserTerkaitSiswa').value = u.terkaitIdSiswa || '';
    toggleOrtuChildSelect();
    $('crudUserNama').focus();
  }

  function resetFormCrudUser() {
    $('formUserTitle').innerText = 'Tambah Akun Baru';
    $('crudUserMode').value = 'add';
    $('crudUserId').value = '';
    $('crudUserRole').disabled = false;
    $('crudUserNama').value = '';
    $('crudUserKelas').value = '';
    $('crudUserPassword').value = '';
    $('crudUserTerkaitSiswa').value = '';
    toggleOrtuChildSelect();
  }

  async function handleSaveUser(e) {
    e.preventDefault();
    const payload = {
      mode: $('crudUserMode').value,
      id: $('crudUserId').value,
      role: $('crudUserRole').value,
      nama: $('crudUserNama').value.trim(),
      kelasInfo: $('crudUserKelas').value.trim(),
      password: $('crudUserPassword').value,
      terkaitIdSiswa: $('crudUserTerkaitSiswa').value
    };

    showLoading('Menyimpan data pengguna...');
    try {
      const res = await BackendAPI.call('saveUserAccount', sessionToken, payload);
      hideLoading();
      if (res.success) {
        resetFormCrudUser();
        showToast(res.message);
        refreshAllData();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      hideLoading();
      showToast('Gagal menyimpan akun: ' + err.message, 'error');
    }
  }

  async function confirmDeleteUser(id) {
    const target = appData.users.find(x => x.id === id);
    const nama = target ? target.nama : id;
    if (!confirm(`Hapus akun ${nama}? Tindakan ini tidak dapat dibatalkan.`)) return;

    showLoading(`Menghapus akun ${nama}...`);
    try {
      const res = await BackendAPI.call('deleteUserAccount', sessionToken, id);
      hideLoading();
      if (res.success) {
        showToast(res.message);
        refreshAllData();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      hideLoading();
      showToast('Gagal menghapus akun: ' + err.message, 'error');
    }
  }

  async function triggerAutoSetup() {
    showLoading('Memverifikasi struktur database...');
    try {
      const res = await BackendAPI.call('jalankanSetup', sessionToken);
      hideLoading();
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) refreshAllData();
    } catch (err) {
      hideLoading();
      showToast('Gagal setup database: ' + err.message, 'error');
    }
  }

  // =========================================================================
  // EVENT BINDINGS & INIT
  // =========================================================================
  document.addEventListener('DOMContentLoaded', async () => {
    ['bkTabelSiswaBody', 'muridTabelRiwayat', 'guruTabelSiswaBody', 'crudTabelUsersBody'].forEach(id => {
      const el = $(id);
      if (el) new MutationObserver(() => labelCells(el)).observe(el, { childList: true });
    });

    // Event delegation untuk tombol dinamis (hindari inline handler pada data dinamis)
    $('bkTabelSiswaBody').addEventListener('click', e => {
      const btn = e.target.closest('[data-tindakan-id]');
      if (btn) openTindakanModal(btn.getAttribute('data-tindakan-id'));
    });

    $('daftarPengajuanKonselingContainer').addEventListener('click', e => {
      const approveBtn = e.target.closest('[data-approve-ks]');
      if (approveBtn) {
        prosesSetujuiKonseling(approveBtn.getAttribute('data-approve-ks'));
        return;
      }
      const rejectBtn = e.target.closest('[data-reject-ks]');
      if (rejectBtn) {
        prosesTolakKonseling(rejectBtn.getAttribute('data-reject-ks'));
      }
    });

    $('crudTabelUsersBody').addEventListener('click', e => {
      const editBtn = e.target.closest('[data-edit-user]');
      if (editBtn) {
        editUserAccount(editBtn.getAttribute('data-edit-user'));
        return;
      }
      const delBtn = e.target.closest('[data-delete-user]');
      if (delBtn) {
        confirmDeleteUser(delBtn.getAttribute('data-delete-user'));
      }
    });

    await BackendAPI.init();
    updateConnectionBadge();
    loadLoginAccounts();
  });

  // Expose UI callbacks used by static HTML attributes
  Object.assign(globalScope, {
    selectLoginRole,
    handleLogin,
    togglePw,
    openConnectionModal,
    toggleConnFields,
    saveConnectionConfig,
    resetLocalDemoData,
    toggleSettingsView,
    openProfileModal,
    logoutUser,
    refreshAllData,
    openKonselingListModal,
    openCatatPoinModal,
    setBkStatusFilter,
    renderTabelSiswaBK,
    toggleTabelBK,
    handleAjukanKonseling,
    toggleGuruBinaanOnly,
    renderTabelGuru,
    renderSettingsView,
    handleSaveUser,
    resetFormCrudUser,
    toggleOrtuChildSelect,
    triggerAutoSetup,
    updateDefaultPoinInput,
    handleSimpanCatatanPoin,
    handleSimpanTindakan,
    handleUbahSandi
  });
})(window);
