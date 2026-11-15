/* ==========================================================================
   E-BK SMKN 1 Kota Binjai — Backend Transport Adapter
   Urutan prioritas: GAS Native -> Supabase RPC -> GAS Web App -> Mode Lokal
   ========================================================================== */
(function (globalScope) {
  'use strict';

  const STORAGE_KEYS = {
    gasUrl: 'ebk_gas_api_url',
    sbUrl: 'ebk_supabase_url',
    sbKey: 'ebk_supabase_key'
  };

  let state = {
    gasUrl: '',
    sbUrl: '',
    sbKey: ''
  };

  function isNativeGas() {
    return typeof globalScope.google !== 'undefined' && globalScope.google.script && globalScope.google.script.run;
  }

  function getMode() {
    if (isNativeGas()) return 'gas-native';
    if (state.sbUrl && state.sbKey) return 'supabase';
    if (state.gasUrl) return 'gas-remote';
    return 'local';
  }

  function getConfig() {
    return { ...state, mode: getMode() };
  }

  function buildSupabaseHeaders(key) {
    const headers = {
      apikey: key,
      'Content-Type': 'application/json'
    };
    if (/^eyJ/.test(key)) {
      headers.Authorization = 'Bearer ' + key;
    }
    return headers;
  }

  async function callSupabaseRpc(url, key, fnName, params) {
    const base = String(url || '').replace(/\/+$/, '');
    const res = await fetch(`${base}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: buildSupabaseHeaders(key),
      body: JSON.stringify(params || {})
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data && (data.message || data.hint || data.details)) || `HTTP ${res.status} dari Supabase.`;
      throw new Error(msg);
    }
    return data;
  }

  function mapActionToSupabase(action, args) {
    switch (action) {
      case 'ping':
        return ['ebk_ping', {}];
      case 'getLoginAccounts':
        return ['ebk_get_login_accounts', {}];
      case 'loginUser':
        return ['ebk_login_user', { p_user_id: args[0], p_password: args[1] }];
      case 'akhiriSesi':
        return ['ebk_akhiri_sesi', { p_token: args[0] || '' }];
      case 'ubahSandi':
        return ['ebk_ubah_sandi', { p_token: args[0], p_lama: args[1], p_baru: args[2] }];
      case 'jalankanSetup':
        return ['ebk_jalankan_setup', { p_token: args[0] }];
      case 'getAllAppData':
        return ['ebk_get_all_app_data', { p_token: args[0] }];
      case 'tambahCatatanPoin': {
        const p = args[1] || {};
        return [
          'ebk_tambah_catatan_poin',
          {
            p_token: args[0],
            p_id_siswa: p.idSiswa,
            p_jenis: p.jenis,
            p_poin: Number(p.poin),
            p_keterangan: p.keterangan
          }
        ];
      }
      case 'ajukanLaporanGuru': {
        const p = args[1] || {};
        return [
          'ebk_ajukan_laporan_guru',
          {
            p_token: args[0],
            p_id_siswa: p.idSiswa,
            p_jenis: p.jenis,
            p_poin: Number(p.poin),
            p_keterangan: p.keterangan
          }
        ];
      }
      case 'verifikasiLaporanGuru':
        return [
          'ebk_verifikasi_laporan_guru',
          {
            p_token: args[0],
            p_id_laporan: args[1],
            p_keputusan: args[2],
            p_bobot_final: Number(args[3]),
            p_catatan_bk: args[4] || ''
          }
        ];
      case 'updateTindakanSiswa':
        return [
          'ebk_update_tindakan_siswa',
          {
            p_token: args[0],
            p_id_siswa: args[1],
            p_skorsing: args[2],
            p_reset_poin: !!args[3]
          }
        ];
      case 'ajukanKonseling': {
        const p = args[1] || {};
        return ['ebk_ajukan_konseling', { p_token: args[0], p_topik: p.topik, p_cerita: p.cerita }];
      }
      case 'setujuiKonseling':
        return [
          'ebk_setujui_konseling',
          { p_token: args[0], p_id: args[1], p_jadwal: args[2], p_catatan_bk: args[3] || '' }
        ];
      case 'tolakKonseling':
        return ['ebk_tolak_konseling', { p_token: args[0], p_id: args[1], p_alasan: args[2] || '' }];
      case 'selesaikanKonseling':
        return ['ebk_selesaikan_konseling', { p_token: args[0], p_id: args[1], p_catatan_bk: args[2] || '' }];
      case 'saveUserAccount': {
        const p = args[1] || {};
        return [
          'ebk_save_user_account',
          {
            p_token: args[0],
            p_mode: p.mode,
            p_id: p.id || '',
            p_role: p.role,
            p_nama: p.nama,
            p_kelas_info: p.kelasInfo,
            p_password: p.password || '',
            p_terkait_id_siswa: p.terkaitIdSiswa || ''
          }
        ];
      }
      case 'deleteUserAccount':
        return ['ebk_delete_user_account', { p_token: args[0], p_user_id: args[1] }];
      default:
        throw new Error('Aksi tidak dikenal: ' + action);
    }
  }

  async function init() {
    if (isNativeGas()) return getConfig();

    const params = new URLSearchParams(globalScope.location ? globalScope.location.search : '');
    const apiParam = params.get('api');
    if (apiParam) {
      state.gasUrl = apiParam.trim();
      globalScope.localStorage.setItem(STORAGE_KEYS.gasUrl, state.gasUrl);
    } else {
      state.gasUrl = (globalScope.localStorage.getItem(STORAGE_KEYS.gasUrl) || '').trim();
    }

    state.sbUrl = (globalScope.localStorage.getItem(STORAGE_KEYS.sbUrl) || '').trim();
    state.sbKey = (globalScope.localStorage.getItem(STORAGE_KEYS.sbKey) || '').trim();

    if (!(state.sbUrl && state.sbKey) && !state.gasUrl) {
      try {
        const cfgRes = await fetch('./config.json', { cache: 'no-store' });
        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          if (cfg && cfg.supabaseUrl && cfg.supabaseAnonKey) {
            state.sbUrl = String(cfg.supabaseUrl).trim().replace(/\/+$/, '');
            state.sbKey = String(cfg.supabaseAnonKey).trim();
          } else if (cfg && cfg.gasApiUrl) {
            state.gasUrl = String(cfg.gasApiUrl).trim();
          }
        }
      } catch (e) {}
    }

    return getConfig();
  }

  function setLocalMode() {
    state.sbUrl = '';
    state.sbKey = '';
    state.gasUrl = '';
    globalScope.localStorage.removeItem(STORAGE_KEYS.sbUrl);
    globalScope.localStorage.removeItem(STORAGE_KEYS.sbKey);
    globalScope.localStorage.removeItem(STORAGE_KEYS.gasUrl);
  }

  async function connectSupabase(sbUrl, sbKey) {
    const cleanUrl = String(sbUrl || '').trim().replace(/\/+$/, '');
    const cleanKey = String(sbKey || '').trim();
    const data = await callSupabaseRpc(cleanUrl, cleanKey, 'ebk_ping', {});
    if (!data || !data.success) {
      throw new Error((data && data.message) || 'Respon Supabase tidak valid.');
    }
    state.sbUrl = cleanUrl;
    state.sbKey = cleanKey;
    state.gasUrl = '';
    globalScope.localStorage.setItem(STORAGE_KEYS.sbUrl, cleanUrl);
    globalScope.localStorage.setItem(STORAGE_KEYS.sbKey, cleanKey);
    globalScope.localStorage.removeItem(STORAGE_KEYS.gasUrl);
    return data;
  }

  async function connectGas(url) {
    const cleanUrl = String(url || '').trim();
    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'ping', args: [] })
    });
    const data = await res.json();
    if (!data || !data.success) {
      throw new Error((data && data.message) || 'Respon server tidak valid.');
    }
    state.gasUrl = cleanUrl;
    state.sbUrl = '';
    state.sbKey = '';
    globalScope.localStorage.setItem(STORAGE_KEYS.gasUrl, cleanUrl);
    globalScope.localStorage.removeItem(STORAGE_KEYS.sbUrl);
    globalScope.localStorage.removeItem(STORAGE_KEYS.sbKey);
    return data;
  }

  async function call(action, ...args) {
    const mode = getMode();
    if (mode === 'gas-native') {
      return new Promise((resolve, reject) => {
        const runner = globalScope.google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(err => reject(new Error(err && err.message ? err.message : String(err))));
        runner[action](...args);
      });
    }
    if (mode === 'supabase') {
      const [rpcName, params] = mapActionToSupabase(action, args);
      return await callSupabaseRpc(state.sbUrl, state.sbKey, rpcName, params);
    }
    if (mode === 'gas-remote') {
      const res = await fetch(state.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, args })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} dari server Google Apps Script.`);
      return await res.json();
    }
    return await globalScope.LocalBackend.dispatch(action, args);
  }

  const api = {
    init,
    getMode,
    getConfig,
    isNativeGas,
    buildSupabaseHeaders,
    mapActionToSupabase,
    setLocalMode,
    connectSupabase,
    connectGas,
    call
  };

  globalScope.BackendAPI = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
