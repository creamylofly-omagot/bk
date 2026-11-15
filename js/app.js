/* ==========================================================================
   E-BK SMKN 1 Kota Binjai — Frontend Application Controller
   ========================================================================== */
(function (globalScope) {
  'use strict';

  let allAccounts = [];
  let selectedLoginRole = 'Murid';
  let currentUser = null;
  let appData = { users: [], students: [], catatan: [], konseling: [], laporan: [] };
  let isSettingsOpen = false;
  let isTabelBKExpanded = true;
  let bkStatusFilter = 'all'; // 'all' | 'sp' | 'skorsing'
  let guruOnlyBinaan = false;
  let comboboxActiveIndex = -1;
  let comboboxMatches = [];
  let adminActiveView = 'bk';
  let sessionToken = null;
  let loadingTimer = null;

  const ROLE_LABELS = {
    Murid: 'Murid',
    Guru: 'Guru / Wali Kelas',
    Ortu: 'Orang Tua',
    Guru_BK: 'Guru BK',
    Admin: 'Administrator'
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

  function clearLoginSelection() {
    $('loginAccountInput').value = '';
    $('loginSelectedUserId').value = '';
    closeLoginListbox();
  }

  function getRoleAccounts() {
    return allAccounts.filter(acc => acc.role === selectedLoginRole);
  }

  function renderLoginListbox(queryText) {
    const listbox = $('loginAccountListbox');
    const q = String(queryText == null ? $('loginAccountInput').value : queryText).toLowerCase().trim();
    const roleAccounts = getRoleAccounts();

    comboboxMatches = q
      ? roleAccounts.filter(acc =>
          acc.nama.toLowerCase().includes(q) ||
          acc.kelasInfo.toLowerCase().includes(q) ||
          acc.id.toLowerCase().includes(q)
        )
      : roleAccounts;
    comboboxActiveIndex = -1;
    $('loginAccountInput').removeAttribute('aria-activedescendant');

    listbox.innerHTML = '';
    if (comboboxMatches.length === 0) {
      if (q) {
        listbox.style.display = 'none';
        $('loginAccountInput').setAttribute('aria-expanded', 'false');
        $('btnToggleAccountList').setAttribute('aria-expanded', 'false');
        return false;
      }
      listbox.innerHTML = '<li class="combobox-option text-muted" aria-disabled="true">Tidak ada akun pada peran ini</li>';
      return true;
    }

    comboboxMatches.forEach((acc, idx) => {
      const li = document.createElement('li');
      li.id = 'loginOpt_' + idx;
      li.className = 'combobox-option';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', $('loginSelectedUserId').value === acc.id ? 'true' : 'false');
      li.dataset.accId = acc.id;
      li.innerHTML = `<span class="fw-semibold">${esc(acc.nama)}</span><span class="combobox-option-meta">${esc(acc.kelasInfo)}</span>`;
      listbox.appendChild(li);
    });
    return true;
  }

  function openLoginListbox(showAll) {
    const hasContent = renderLoginListbox(showAll ? '' : $('loginAccountInput').value);
    if (!hasContent) return;
    $('loginAccountListbox').style.display = 'block';
    $('loginAccountInput').setAttribute('aria-expanded', 'true');
    $('btnToggleAccountList').setAttribute('aria-expanded', 'true');
  }

  function closeLoginListbox() {
    const listbox = $('loginAccountListbox');
    if (!listbox) return;
    listbox.style.display = 'none';
    comboboxActiveIndex = -1;
    $('loginAccountInput').setAttribute('aria-expanded', 'false');
    $('loginAccountInput').removeAttribute('aria-activedescendant');
    $('btnToggleAccountList').setAttribute('aria-expanded', 'false');
  }

  function toggleLoginDropdown() {
    const isOpen = $('loginAccountListbox').style.display === 'block';
    if (isOpen) {
      closeLoginListbox();
    } else {
      openLoginListbox(true);
      $('loginAccountInput').focus();
    }
  }

  function selectComboboxAccount(accId) {
    const acc = allAccounts.find(x => x.id === accId);
    if (!acc) return;
    $('loginAccountInput').value = `${acc.nama} (${acc.kelasInfo})`;
    $('loginSelectedUserId').value = acc.id;
    closeLoginListbox();
    $('loginPassword').focus();
  }

  function updateComboboxHighlight(newIdx) {
    const listbox = $('loginAccountListbox');
    const options = [...listbox.querySelectorAll('.combobox-option[data-acc-id]')];
    if (options.length === 0) return;
    if (newIdx < 0) newIdx = options.length - 1;
    if (newIdx >= options.length) newIdx = 0;
    options.forEach((el, i) => el.classList.toggle('is-active', i === newIdx));
    comboboxActiveIndex = newIdx;
    const activeEl = options[newIdx];
    $('loginAccountInput').setAttribute('aria-activedescendant', activeEl.id);
    activeEl.scrollIntoView({ block: 'nearest' });
  }

  function resolveLoginUserId() {
    const pickedId = $('loginSelectedUserId').value.trim();
    if (pickedId) return pickedId;
    const raw = $('loginAccountInput').value.trim();
    if (!raw) return '';
    const byId = allAccounts.find(acc => acc.id === raw);
    if (byId) return byId.id;
    const roleMatches = getRoleAccounts().filter(
      acc => acc.nama.toLowerCase() === raw.toLowerCase() || `${acc.nama} (${acc.kelasInfo})`.toLowerCase() === raw.toLowerCase()
    );
    if (roleMatches.length === 1) return roleMatches[0].id;
    return raw;
  }

  function forceLogout() {
    currentUser = null;
    sessionToken = null;
    isSettingsOpen = false;
    isTabelBKExpanded = true;
    bkStatusFilter = 'all';
    guruOnlyBinaan = false;
    adminActiveView = 'bk';
    $('mainAppSection').style.display = 'none';
    $('loginSection').style.display = 'flex';
    $('loginPassword').value = '';
    $('counselingRequestCard').style.display = '';
    $('adminControlBar').style.display = 'none';
    clearLoginSelection();
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
        renderLoginListbox('');
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
    clearLoginSelection();
  }

  async function handleLogin(e) {
    e.preventDefault();
    const userId = resolveLoginUserId();
    const password = $('loginPassword').value;
    if (!userId) {
      showToast('Silakan pilih akun atau ketik username terlebih dahulu.', 'warning');
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
    $('btnNavSettings').style.display = currentUser.role === 'Admin' ? 'inline-flex' : 'none';
    $('adminControlBar').style.display = currentUser.role === 'Admin' ? 'block' : 'none';
    adminActiveView = 'bk';
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
    adminActiveView = 'bk';
    $('loginPassword').value = '';
    $('bkSearchKelasInput').value = '';
    $('guruSearchNama').value = '';
    $('counselingRequestCard').style.display = '';
    $('adminControlBar').style.display = 'none';
    $('mainAppSection').style.display = 'none';
    $('loginSection').style.display = 'flex';
    clearLoginSelection();
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
        appData = Object.assign({ users: [], students: [], catatan: [], konseling: [], laporan: [], schoolConfig: {} }, res);
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

  function setAdminView(mode, btnEl) {
    adminActiveView = mode;
    isSettingsOpen = false;
    document.querySelectorAll('#adminViewTabs .filter-pill').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    $('adminPreviewStudentSelect').style.display = mode === 'murid' ? 'inline-block' : 'none';
    renderActiveRoleView();
  }

  function populateAdminPreviewStudents() {
    const sel = $('adminPreviewStudentSelect');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '';
    appData.students.forEach(s => {
      sel.innerHTML += `<option value="${esc(s.id)}">${esc(s.nama)} (${esc(s.kelasInfo)})</option>`;
    });
    if (prev && appData.students.some(s => s.id === prev)) sel.value = prev;
  }

  function renderAdminPreviewStudent() {
    const sid = $('adminPreviewStudentSelect').value || (appData.students[0] && appData.students[0].id);
    if (sid) renderDashboardMurid(sid);
  }

  function renderActiveRoleView() {
    ['viewGuruBK', 'viewMurid', 'viewGuru', 'viewOrtu', 'viewPengaturan', 'viewAdminData'].forEach(id => {
      $(id).style.display = 'none';
    });

    const isOperator = currentUser.role === 'Admin';
    const btnSettings = $('btnNavSettings');
    if (isSettingsOpen && isOperator) {
      btnSettings.classList.replace('btn-outline-secondary', 'btn-primary');
      $('viewPengaturan').style.display = 'block';
      renderSettingsView();
      return;
    }
    if (btnSettings) btnSettings.classList.replace('btn-primary', 'btn-outline-secondary');

    if (currentUser.role === 'Admin') {
      populateAdminPreviewStudents();
      $('adminPreviewStudentSelect').style.display = adminActiveView === 'murid' ? 'inline-block' : 'none';
      if (adminActiveView === 'guru') {
        $('viewGuru').style.display = 'block';
        renderDashboardGuru();
      } else if (adminActiveView === 'murid') {
        $('viewMurid').style.display = 'block';
        $('counselingRequestCard').style.display = 'none';
        renderAdminPreviewStudent();
      } else if (adminActiveView === 'data') {
        $('viewAdminData').style.display = 'block';
        renderAdminDataView();
      } else {
        $('viewGuruBK').style.display = 'block';
        renderDashboardGuruBK();
      }
      return;
    }

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
    const pendingLaporan = (appData.laporan || []).filter(l => l.status === 'Menunggu');
    $('bkHeaderLaporanCount').innerText = pendingLaporan.length;

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
          <td class="text-end text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill px-3 me-1" data-riwayat-id="${esc(s.id)}">
              Riwayat
            </button>
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

  function getFilteredStudentsBK() {
    const keyword = $('bkSearchKelasInput').value.toLowerCase().trim();
    return appData.students.filter(s => {
      const matchText = s.kelasInfo.toLowerCase().includes(keyword) || s.nama.toLowerCase().includes(keyword);
      if (!matchText) return false;
      if (bkStatusFilter === 'sp') return s.statusSP !== 'Aman';
      if (bkStatusFilter === 'skorsing') return s.skorsing === 'Ya';
      return true;
    });
  }

  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function exportStudentsCsv() {
    const rows = getFilteredStudentsBK();
    if (rows.length === 0) {
      showToast('Tidak ada data siswa untuk diunduh.', 'warning');
      return;
    }
    const header = ['ID', 'Nama Siswa', 'Kelas', 'Poin', 'Status SP', 'Skorsing'];
    const lines = [header.map(csvCell).join(',')];
    rows.forEach(s => {
      lines.push([s.id, s.nama, s.kelasInfo, s.poin, s.statusSP, s.skorsing].map(csvCell).join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data-poin-siswa-bk.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Mengunduh ${rows.length} data siswa (CSV).`);
  }

  function openRiwayatSiswaModal(idSiswa) {
    const s = appData.students.find(x => x.id === idSiswa);
    if (!s) return;
    $('riwayatSiswaSummary').innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <h3 class="h6 fw-bold text-dark mb-1">${esc(s.nama)}</h3>
          <span class="badge bg-white text-dark border">${esc(s.kelasInfo)}</span>
          <span class="badge ${s.skorsing === 'Ya' ? 'bg-danger' : 'bg-secondary-subtle text-dark'} ms-1">
            Skorsing: ${esc(s.skorsing)}
          </span>
        </div>
        <div class="d-flex align-items-center gap-2">
          ${getPoinChipHtml(s.poin)}
          ${getSPBadgeHtml(s.statusSP)}
        </div>
      </div>
    `;

    const catatanRows = appData.catatan.filter(c => String(c.idSiswa) === String(s.id));
    const tbody = $('riwayatSiswaCatatanBody');
    tbody.innerHTML = '';
    if (catatanRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-muted">Belum ada catatan poin untuk siswa ini.</td></tr>';
    } else {
      catatanRows.forEach(c => {
        const isPositive = c.jenis !== 'Pelanggaran';
        const deltaStr = c.perubahanPoin > 0 ? '+' + c.perubahanPoin : String(c.perubahanPoin);
        tbody.innerHTML += `
          <tr>
            <td class="small text-muted text-nowrap">${esc(c.tanggal)}</td>
            <td><span class="badge ${isPositive ? 'bg-success-subtle text-success-emphasis' : 'bg-danger-subtle text-danger'}">${esc(c.jenis)}</span></td>
            <td class="small">${esc(c.keterangan)}</td>
            <td class="small text-muted">${esc(c.pelapor)}</td>
            <td class="text-end fw-bold tabular-nums ${isPositive ? 'text-success' : 'text-danger'}">${esc(deltaStr)}</td>
          </tr>
        `;
      });
    }

    const ksList = $('riwayatSiswaKonselingList');
    const myKs = appData.konseling.filter(k => String(k.idSiswa) === String(s.id));
    ksList.innerHTML = '';
    if (myKs.length === 0) {
      ksList.innerHTML = '<small class="text-muted">Belum ada riwayat pengajuan konseling.</small>';
    } else {
      myKs.forEach(k => {
        ksList.innerHTML += `
          <div class="p-2 px-3 rounded-3 border bg-light small">
            <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap fw-semibold">
              <span>${esc(k.topik)} • <span class="text-muted fw-normal">${esc(k.tanggal)}</span></span>
              <span class="badge bg-secondary">${esc(k.status)}</span>
            </div>
            <div class="mt-1 fst-italic">"${esc(k.cerita)}"</div>
            <div class="text-muted mt-1">Jadwal: ${esc(k.jadwal)} | Catatan BK: ${esc(k.catatanBK)}</div>
          </div>
        `;
      });
    }

    bootstrap.Modal.getOrCreateInstance($('modalRiwayatSiswa')).show();
  }

  function openVerifikasiLaporanModal() {
    const container = $('daftarLaporanGuruContainer');
    const list = appData.laporan || [];
    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = '<div class="text-center text-muted py-4">Belum ada laporan masuk dari Guru / Wali Kelas.</div>';
    } else {
      list.forEach(item => {
        const isPending = item.status === 'Menunggu';
        const isRejected = item.status === 'Ditolak';
        const card = document.createElement('div');
        card.className = `p-3 rounded-4 border ${isPending ? 'bg-warning-subtle border-warning' : 'bg-light'}`;

        card.innerHTML = `
          <div class="d-flex justify-content-between align-items-start gap-2 mb-2 flex-wrap">
            <div>
              <h6 class="fw-bold mb-0 text-dark">${esc(item.namaSiswa)} <span class="badge bg-white text-dark border ms-1">${esc(item.kelas)}</span></h6>
              <small class="text-muted">Pelapor: <strong>${esc(item.pelapor)}</strong> • ${esc(item.tanggal)}</small>
            </div>
            <span class="badge ${isPending ? 'bg-warning text-dark' : isRejected ? 'bg-danger' : 'bg-success'} rounded-pill px-3">
              ${esc(item.status)}
            </span>
          </div>
          <div class="bg-white p-3 rounded-3 border mb-3">
            <span class="badge ${item.jenis === 'Prestasi' ? 'bg-success-subtle text-success-emphasis' : 'bg-danger-subtle text-danger'} me-2">
              ${esc(item.jenis)} (${item.jenis === 'Prestasi' ? '+' : '-'}${esc(item.bobotUsulan)} usulan)
            </span>
            <span class="text-dark">${esc(item.keterangan)}</span>
          </div>
          ${isPending ? `
            <div class="row g-2 align-items-end">
              <div class="col-12 col-md-3">
                <label class="form-label small fw-semibold mb-1" for="bobotFinal_${esc(item.id)}">Bobot Final (1–100)</label>
                <input type="number" id="bobotFinal_${esc(item.id)}" class="form-control form-control-sm" min="1" max="100" value="${esc(item.bobotUsulan)}">
              </div>
              <div class="col-12 col-md-5">
                <label class="form-label small fw-semibold mb-1" for="catatanLap_${esc(item.id)}">Catatan / Alasan BK</label>
                <input type="text" id="catatanLap_${esc(item.id)}" class="form-control form-control-sm" placeholder="Opsional (alasan bila ditolak)">
              </div>
              <div class="col-12 col-md-4 d-grid gap-1">
                <button type="button" class="btn btn-primary btn-sm fw-semibold" data-approve-lp="${esc(item.id)}">
                  Setujui &amp; Terapkan Poin
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" data-reject-lp="${esc(item.id)}">
                  Tolak Laporan
                </button>
              </div>
            </div>
          ` : `
            <div class="small ${isRejected ? 'text-danger' : 'text-success'} fw-semibold">
              ${isRejected ? 'Ditolak' : 'Disetujui (' + esc(item.bobotDisetujui) + ' poin)'} oleh ${esc(item.diprosesOleh)} (${esc(item.tanggalProses)}) — ${esc(item.catatanBK)}
            </div>
          `}
        `;
        container.appendChild(card);
      });
    }

    bootstrap.Modal.getOrCreateInstance($('modalVerifikasiLaporan')).show();
  }

  async function prosesVerifikasiLaporan(idLaporan, keputusan) {
    const bobotEl = $('bobotFinal_' + idLaporan);
    const catEl = $('catatanLap_' + idLaporan);
    const bobotFinal = bobotEl ? Number(bobotEl.value) : 10;
    const catatanBK = catEl ? catEl.value.trim() : '';

    showLoading(keputusan === 'Setujui' ? 'Menyetujui laporan & memperbarui poin...' : 'Menolak laporan...');
    try {
      const res = await BackendAPI.call('verifikasiLaporanGuru', sessionToken, idLaporan, keputusan, bobotFinal, catatanBK);
      hideLoading();
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) {
        bootstrap.Modal.getInstance($('modalVerifikasiLaporan')).hide();
        refreshAllData();
      }
    } catch (err) {
      hideLoading();
      showToast('Gagal memproses laporan: ' + err.message, 'error');
    }
  }

  function openKonselingListModal() {
    const container = $('daftarPengajuanKonselingContainer');
    container.innerHTML = '';

    if (appData.konseling.length === 0) {
      container.innerHTML = '<div class="text-center text-muted py-4">Belum ada pengajuan konseling dari siswa.</div>';
    } else {
      appData.konseling.forEach(item => {
        const isPending = item.status === 'Menunggu';
        const isScheduled = item.status === 'Disetujui & Terjadwal';
        const isRejected = item.status === 'Ditolak';
        const isDone = item.status === 'Selesai';
        const card = document.createElement('div');
        card.className = `p-3 rounded-4 border ${isPending ? 'bg-info-subtle border-info' : isScheduled ? 'bg-success-subtle border-success' : 'bg-light'}`;

        card.innerHTML = `
          <div class="d-flex justify-content-between align-items-start gap-2 mb-2 flex-wrap">
            <div>
              <h6 class="fw-bold mb-0 text-dark">${esc(item.namaSiswa)} <span class="badge bg-white text-dark border ms-1">${esc(item.kelas)}</span></h6>
              <small class="text-muted">Topik: <strong>${esc(item.topik)}</strong> • ${esc(item.tanggal)}</small>
            </div>
            <span class="badge ${isPending ? 'bg-warning text-dark' : isRejected ? 'bg-danger' : isDone ? 'bg-secondary' : 'bg-success'} rounded-pill px-3">
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
                  Setujui &amp; Jadwalkan
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" data-reject-ks="${esc(item.id)}">
                  Tolak Pengajuan
                </button>
              </div>
            </div>
          ` : isScheduled ? `
            <div class="row g-2 align-items-end">
              <div class="col-12 col-md-8 small text-success fw-semibold">
                <i class="bi bi-calendar-check me-1" aria-hidden="true"></i>
                Jadwal: ${esc(item.jadwal)} — (${esc(item.catatanBK)})
                <input type="text" id="hasilKsInput_${esc(item.id)}" class="form-control form-control-sm mt-2"
                       placeholder="Catatan hasil konseling (opsional) sebelum ditandai selesai...">
              </div>
              <div class="col-12 col-md-4 d-grid">
                <button type="button" class="btn btn-success btn-sm fw-semibold" data-finish-ks="${esc(item.id)}">
                  <i class="bi bi-check2-all me-1" aria-hidden="true"></i> Tandai Selesai
                </button>
              </div>
            </div>
          ` : `
            <div class="small ${isRejected ? 'text-danger' : 'text-secondary'} fw-semibold">
              <i class="bi ${isRejected ? 'bi-x-circle' : 'bi-check-circle-fill'} me-1" aria-hidden="true"></i>
              ${isRejected ? 'Ditolak' : 'Selesai (' + esc(item.jadwal) + ')'} — (${esc(item.catatanBK)})
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

  async function prosesSelesaikanKonseling(idKonseling) {
    const input = $('hasilKsInput_' + idKonseling);
    const hasil = input ? input.value.trim() : '';
    showLoading('Menyelesaikan sesi konseling...');
    try {
      const res = await BackendAPI.call('selesaikanKonseling', sessionToken, idKonseling, hasil);
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
    const latestScheduled = myKonseling.find(k => k.status === 'Disetujui & Terjadwal');
    if (latestScheduled) {
      $('muridJadwalKonseling').innerText = latestScheduled.jadwal;
      $('muridStatusKonselingBadge').innerText = 'Disetujui Guru BK';
    } else if (myKonseling.some(k => k.status === 'Menunggu')) {
      $('muridJadwalKonseling').innerText = 'Menunggu persetujuan guru BK';
      $('muridStatusKonselingBadge').innerText = 'Dalam Antrean';
    } else if (myKonseling.some(k => k.status === 'Selesai')) {
      $('muridJadwalKonseling').innerText = 'Sesi terakhir selesai';
      $('muridStatusKonselingBadge').innerText = myKonseling[0].catatanBK || 'Selesai';
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
        const isDone = k.status === 'Selesai';
        listEl.innerHTML += `
          <div class="p-3 rounded-3 border bg-light small">
            <div class="d-flex justify-content-between align-items-center gap-2 fw-semibold flex-wrap">
              <span>${esc(k.topik)}</span>
              <span class="badge ${isWait ? 'bg-warning text-dark' : isRejected ? 'bg-danger' : isDone ? 'bg-secondary' : 'bg-success'}">
                ${isWait ? 'Menunggu persetujuan guru BK' : isRejected ? 'Ditolak: ' + esc(k.catatanBK) : isDone ? 'Selesai: ' + esc(k.catatanBK) : 'Terjadwal: ' + esc(k.jadwal)}
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
    const myLaporan = appData.laporan || [];
    const pendingCount = myLaporan.filter(l => l.status === 'Menunggu').length;
    $('guruStatLaporan').innerText = myLaporan.length;
    $('guruStatLaporanDetail').innerText = `${pendingCount} menunggu verifikasi BK`;

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
    renderTabelLaporanGuru();
  }

  function renderTabelLaporanGuru() {
    const tbody = $('guruTabelLaporanBody');
    if (!tbody) return;
    const list = appData.laporan || [];
    tbody.innerHTML = '';
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">Belum ada laporan yang diajukan ke Guru BK.</td></tr>';
      return;
    }
    list.forEach(l => {
      const isWait = l.status === 'Menunggu';
      const isRejected = l.status === 'Ditolak';
      const badgeCls = isWait ? 'bg-warning text-dark' : isRejected ? 'bg-danger' : 'bg-success';
      const statusText = isWait
        ? 'Menunggu Verifikasi BK'
        : isRejected
          ? `Ditolak (${l.catatanBK})`
          : `Disetujui (${l.bobotDisetujui} poin)`;
      tbody.innerHTML += `
        <tr>
          <td class="small text-muted text-nowrap">${esc(l.tanggal)}</td>
          <td><span class="fw-semibold">${esc(l.namaSiswa)}</span> <span class="badge bg-light text-dark border">${esc(l.kelas)}</span></td>
          <td>
            <span class="badge ${l.jenis === 'Prestasi' ? 'bg-success-subtle text-success-emphasis' : 'bg-danger-subtle text-danger'}">
              ${esc(l.jenis)} (${l.jenis === 'Prestasi' ? '+' : '-'}${esc(l.bobotUsulan)})
            </span>
          </td>
          <td class="small">${esc(l.keterangan)}</td>
          <td><span class="badge ${badgeCls}">${esc(statusText)}</span></td>
        </tr>
      `;
    });
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
    const isGuru = currentUser && (currentUser.role === 'Guru' || (currentUser.role === 'Admin' && adminActiveView === 'guru'));
    $('modalCatatPoinTitle').innerHTML = isGuru
      ? '<i class="bi bi-send-plus text-primary me-2" aria-hidden="true"></i>Ajukan Laporan Siswa ke BK'
      : '<i class="bi bi-journal-plus text-primary me-2" aria-hidden="true"></i>Catat Pelanggaran / Prestasi';
    $('catatPoinRoleHint').style.display = isGuru ? 'block' : 'none';
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
    const isGuru = currentUser && (currentUser.role === 'Guru' || (currentUser.role === 'Admin' && adminActiveView === 'guru'));
    const actionName = isGuru ? 'ajukanLaporanGuru' : 'tambahCatatanPoin';

    showLoading(isGuru ? 'Mengirim laporan ke Guru BK...' : 'Menyimpan catatan & menghitung ulang poin...');
    try {
      const res = await BackendAPI.call(actionName, sessionToken, { idSiswa, jenis, poin, keterangan });
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
    if (!currentUser || currentUser.role !== 'Admin') return;
    isSettingsOpen = !isSettingsOpen;
    renderActiveRoleView();
  }


  function ensureAdminRoleOption(showAdminOption) {
    const roleSel = $('crudUserRole');
    let adminOpt = roleSel.querySelector('option[value="Admin"]');
    if (showAdminOption) {
      if (!adminOpt) {
        adminOpt = document.createElement('option');
        adminOpt.value = 'Admin';
        adminOpt.textContent = 'Administrator (Operator)';
        roleSel.appendChild(adminOpt);
      }
    } else if (adminOpt) {
      adminOpt.remove();
    }
  }
  function renderSettingsView() {
    $('totalUsersBadge').innerText = `${appData.users.length} Akun`;
    ensureAdminRoleOption(currentUser && currentUser.role === 'Admin');

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
            ${(u.id === 'admin123' || u.id === currentUser.id) ? '' : `<button type="button" class="btn btn-sm btn-outline-danger" data-delete-user="${esc(u.id)}" aria-label="Hapus ${esc(u.nama)}"><i class="bi bi-trash" aria-hidden="true"></i></button>`}
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
    const roleSel = $('crudUserRole');
    ensureAdminRoleOption(u.role === 'Admin' || (currentUser && currentUser.role === 'Admin'));
    roleSel.value = u.role;
    roleSel.disabled = true;
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
    const roleSel = $('crudUserRole');
    ensureAdminRoleOption(currentUser && currentUser.role === 'Admin');
    roleSel.disabled = false;
    roleSel.value = 'Murid';
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


  function renderAdminDataView() {
    const cfg = appData.schoolConfig || {};
    $('cfgNamaSekolah').value = cfg.namaSekolah || 'SMKN 1 Kota Binjai';
    $('cfgAlamat').value = cfg.alamat || '';
    $('cfgTahunAjaran').value = cfg.tahunAjaran || '';

    const ksSiswaSel = $('admKsSiswa');
    ksSiswaSel.innerHTML = '';
    if (appData.students.length === 0) {
      ksSiswaSel.innerHTML = '<option value="">-- Belum ada siswa --</option>';
    } else {
      appData.students.forEach(s => {
        ksSiswaSel.innerHTML += `<option value="${esc(s.id)}">${esc(s.nama)} (${esc(s.kelasInfo)})</option>`;
      });
    }

    $('adminTotalCatatanBadge').innerText = `${appData.catatan.length} Catatan`;
    const ctBody = $('adminTabelCatatanBody');
    ctBody.innerHTML = '';
    if (appData.catatan.length === 0) {
      ctBody.innerHTML = '<tr><td colspan="7" class="text-center py-3 text-muted">Belum ada catatan poin.</td></tr>';
    } else {
      appData.catatan.forEach(c => {
        const isPositive = c.jenis !== 'Pelanggaran';
        const deltaStr = c.perubahanPoin > 0 ? '+' + c.perubahanPoin : String(c.perubahanPoin);
        ctBody.innerHTML += `
          <tr>
            <td class="small fw-bold text-muted">${esc(c.id)}</td>
            <td class="small text-nowrap">${esc(c.tanggal)}</td>
            <td><span class="fw-semibold">${esc(c.namaSiswa)}</span> <span class="badge bg-light text-dark border">${esc(c.kelas)}</span></td>
            <td><span class="badge ${isPositive ? 'bg-success-subtle text-success-emphasis' : 'bg-danger-subtle text-danger'}">${esc(c.jenis)} (${esc(deltaStr)})</span></td>
            <td class="small">${esc(c.keterangan)}</td>
            <td class="small text-muted">${esc(c.pelapor)}</td>
            <td class="text-end">
              <button type="button" class="btn btn-sm btn-outline-danger" data-del-catatan="${esc(c.id)}" aria-label="Hapus catatan ${esc(c.id)}">
                <i class="bi bi-trash" aria-hidden="true"></i>
              </button>
            </td>
          </tr>
        `;
      });
    }

    $('adminTotalKonselingBadge').innerText = String(appData.konseling.length);
    const ksBody = $('adminTabelKonselingBody');
    ksBody.innerHTML = '';
    if (appData.konseling.length === 0) {
      ksBody.innerHTML = '<tr><td colspan="4" class="text-center py-3 text-muted">Belum ada data konseling.</td></tr>';
    } else {
      appData.konseling.forEach(k => {
        ksBody.innerHTML += `
          <tr>
            <td class="small fw-bold text-muted">${esc(k.id)}</td>
            <td><span class="fw-semibold">${esc(k.namaSiswa)}</span> <small class="text-muted">(${esc(k.kelas)})</small></td>
            <td class="small">${esc(k.topik)} • <span class="badge bg-secondary">${esc(k.status)}</span></td>
            <td class="text-end">
              <button type="button" class="btn btn-sm btn-outline-danger" data-del-konseling="${esc(k.id)}" aria-label="Hapus konseling ${esc(k.id)}">
                <i class="bi bi-trash" aria-hidden="true"></i>
              </button>
            </td>
          </tr>
        `;
      });
    }

    const lpList = appData.laporan || [];
    $('adminTotalLaporanBadge').innerText = String(lpList.length);
    const lpBody = $('adminTabelLaporanBody');
    lpBody.innerHTML = '';
    if (lpList.length === 0) {
      lpBody.innerHTML = '<tr><td colspan="4" class="text-center py-3 text-muted">Belum ada laporan guru.</td></tr>';
    } else {
      lpList.forEach(l => {
        lpBody.innerHTML += `
          <tr>
            <td class="small fw-bold text-muted">${esc(l.id)}</td>
            <td class="small"><strong>${esc(l.namaSiswa)}</strong> <span class="text-muted">(${esc(l.pelapor)})</span></td>
            <td><span class="badge bg-secondary">${esc(l.status)}</span></td>
            <td class="text-end">
              <button type="button" class="btn btn-sm btn-outline-danger" data-del-laporan="${esc(l.id)}" aria-label="Hapus laporan ${esc(l.id)}">
                <i class="bi bi-trash" aria-hidden="true"></i>
              </button>
            </td>
          </tr>
        `;
      });
    }
  }

  async function handleSaveSchoolConfig(e) {
    e.preventDefault();
    showLoading('Menyimpan pengaturan sekolah...');
    try {
      const res = await BackendAPI.call('saveSchoolConfig', sessionToken, {
        namaSekolah: $('cfgNamaSekolah').value.trim(),
        alamat: $('cfgAlamat').value.trim(),
        tahunAjaran: $('cfgTahunAjaran').value.trim()
      });
      hideLoading();
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) refreshAllData();
    } catch (err) {
      hideLoading();
      showToast('Gagal menyimpan pengaturan: ' + err.message, 'error');
    }
  }

  async function handleAdminTambahKonseling(e) {
    e.preventDefault();
    showLoading('Menambahkan data konseling...');
    try {
      const res = await BackendAPI.call('adminTambahKonseling', sessionToken, {
        idSiswa: $('admKsSiswa').value,
        topik: $('admKsTopik').value,
        cerita: $('admKsCerita').value.trim(),
        jadwal: $('admKsJadwal').value.trim(),
        catatanBK: $('admKsCatatan').value.trim()
      });
      hideLoading();
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) {
        e.target.reset();
        refreshAllData();
      }
    } catch (err) {
      hideLoading();
      showToast('Gagal menambah konseling: ' + err.message, 'error');
    }
  }

  async function confirmDeleteRecord(action, id, label) {
    if (!confirm(`Hapus ${label} (${id})? Tindakan ini tidak dapat dibatalkan.`)) return;
    showLoading(`Menghapus ${label}...`);
    try {
      const res = await BackendAPI.call(action, sessionToken, id);
      hideLoading();
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) refreshAllData();
    } catch (err) {
      hideLoading();
      showToast('Gagal menghapus data: ' + err.message, 'error');
    }
  }
  // =========================================================================
  // EVENT BINDINGS & INIT
  // =========================================================================
  document.addEventListener('DOMContentLoaded', async () => {
    ['bkTabelSiswaBody', 'muridTabelRiwayat', 'guruTabelSiswaBody', 'guruTabelLaporanBody', 'crudTabelUsersBody', 'riwayatSiswaCatatanBody', 'adminTabelCatatanBody', 'adminTabelKonselingBody', 'adminTabelLaporanBody'].forEach(id => {
      const el = $(id);
      if (el) new MutationObserver(() => labelCells(el)).observe(el, { childList: true });
    });

    // Event delegation untuk tombol dinamis (hindari inline handler pada data dinamis)
    $('bkTabelSiswaBody').addEventListener('click', e => {
      const riwayatBtn = e.target.closest('[data-riwayat-id]');
      if (riwayatBtn) {
        openRiwayatSiswaModal(riwayatBtn.getAttribute('data-riwayat-id'));
        return;
      }
      const btn = e.target.closest('[data-tindakan-id]');
      if (btn) openTindakanModal(btn.getAttribute('data-tindakan-id'));
    });

    $('daftarLaporanGuruContainer').addEventListener('click', e => {
      const appBtn = e.target.closest('[data-approve-lp]');
      if (appBtn) {
        prosesVerifikasiLaporan(appBtn.getAttribute('data-approve-lp'), 'Setujui');
        return;
      }
      const rejBtn = e.target.closest('[data-reject-lp]');
      if (rejBtn) {
        prosesVerifikasiLaporan(rejBtn.getAttribute('data-reject-lp'), 'Tolak');
      }
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
        return;
      }
      const finishBtn = e.target.closest('[data-finish-ks]');
      if (finishBtn) {
        prosesSelesaikanKonseling(finishBtn.getAttribute('data-finish-ks'));
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

    $('viewAdminData').addEventListener('click', e => {
      const delCt = e.target.closest('[data-del-catatan]');
      if (delCt) {
        confirmDeleteRecord('deleteCatatanPoin', delCt.getAttribute('data-del-catatan'), 'catatan poin');
        return;
      }
      const delKs = e.target.closest('[data-del-konseling]');
      if (delKs) {
        confirmDeleteRecord('deleteKonseling', delKs.getAttribute('data-del-konseling'), 'data konseling');
        return;
      }
      const delLp = e.target.closest('[data-del-laporan]');
      if (delLp) {
        confirmDeleteRecord('deleteLaporanGuru', delLp.getAttribute('data-del-laporan'), 'laporan guru');
      }
    });

    const comboInput = $('loginAccountInput');
    const comboList = $('loginAccountListbox');
    comboInput.addEventListener('focus', () => openLoginListbox(false));
    comboInput.addEventListener('input', () => {
      $('loginSelectedUserId').value = '';
      openLoginListbox(false);
    });
    comboInput.addEventListener('keydown', e => {
      const isOpen = comboList.style.display === 'block';
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen) openLoginListbox(false);
        updateComboboxHighlight(comboboxActiveIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen) openLoginListbox(false);
        updateComboboxHighlight(comboboxActiveIndex - 1);
      } else if (e.key === 'Enter' && isOpen && comboboxActiveIndex >= 0) {
        e.preventDefault();
        const activeOpt = comboList.querySelectorAll('.combobox-option[data-acc-id]')[comboboxActiveIndex];
        if (activeOpt) selectComboboxAccount(activeOpt.dataset.accId);
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        closeLoginListbox();
      }
    });
    comboList.addEventListener('mousedown', e => {
      const opt = e.target.closest('.combobox-option[data-acc-id]');
      if (opt) {
        e.preventDefault();
        selectComboboxAccount(opt.dataset.accId);
      }
    });
    document.addEventListener('click', e => {
      const wrapper = $('loginComboboxWrapper');
      if (wrapper && !wrapper.contains(e.target)) {
        closeLoginListbox();
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
    toggleLoginDropdown,
    setAdminView,
    renderAdminPreviewStudent,
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
    openVerifikasiLaporanModal,
    exportStudentsCsv,
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
    ,
    handleSaveSchoolConfig,
    handleAdminTambahKonseling
  });
})(window);
