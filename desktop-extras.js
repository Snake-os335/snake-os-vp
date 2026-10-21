/* Snake OS desktop extras — tema, wallpaper, captura, atajos, buscador */
(function () {
  'use strict';

  var DESKTOP_PREFS_KEY = 'snakeos_desktop_prefs_v1';
  // Wallpaper + theme are per logged-in profile (email).
  // The public session has no user id. Never apply the old global wallpaper on boot.
  var WALLPAPER_KEY_PREFIX = 'snakeos_desktop_wallpaper_v1:';
  var CUSTOM_WALLPAPER_KEY_PREFIX = 'snakeos_desktop_wallpaper_custom_v1:';
  var CUSTOM_WP_MAX_BYTES = 10000000; /* imágenes/GIFs hasta 10 MB */
  var THEME_KEY_PREFIX = 'snakeos_desktop_theme_v1:';
  var QS_KEY_PREFIX = 'snakeos_qs_v1:';
  var WALLPAPER_LEGACY_FLAG = 'snakeos_desktop_wallpaper_legacy_consumed_v1';
  var WALLPAPERS = [
    { id: 'mint', label: 'Bosque', swatch: 'linear-gradient(135deg,#07150d,#34d17a)' },
    { id: 'ocean', label: 'Océano', swatch: 'linear-gradient(135deg,#041525,#3db8ff)' },
    { id: 'sunset', label: 'Atardecer', swatch: 'linear-gradient(135deg,#2a1020,#ff8a4c)' },
    { id: 'nebula', label: 'Nebulosa', swatch: 'linear-gradient(135deg,#12081f,#b388ff)' },
    { id: 'snake-pixel', label: 'Snake pixel', swatch: '#000 url(/static/assets/wallpaper-snake-pixel.png?v=2) center / contain no-repeat' },
    { id: 'snake-vivid', label: 'Snake neón', swatch: '#1a0a2e url(/static/assets/wallpaper-snake-vivid.png?v=4) center / cover no-repeat' },
    { id: 'snake-real-python-verde', label: 'Pitón verde', swatch: '#0a1e0e url(/static/assets/wallpaper-snake-real-python-verde.jpg?v=1) center / cover no-repeat' },
    { id: 'snake-real-vibora-desierto', label: 'Víbora del desierto', swatch: '#a07040 url(/static/assets/wallpaper-snake-real-vibora-desierto.jpg?v=1) center / cover no-repeat' },
    { id: 'snake-real-coralillo', label: 'Coralillo', swatch: '#101014 url(/static/assets/wallpaper-snake-real-coralillo.jpg?v=1) center / cover no-repeat' },
    { id: 'snake-real-piton-dorada', label: 'Pitón dorada', swatch: '#1a2a0c url(/static/assets/wallpaper-snake-real-piton-dorada.jpg?v=1) center / cover no-repeat' },
    { id: 'snake-selva', label: 'Selva', swatch: '#0c1f10 url(/static/assets/wallpaper-snake-selva.webp?v=1) center / cover no-repeat' },
    { id: 'snake-neon', label: 'Neón', swatch: '#05060f url(/static/assets/wallpaper-snake-neon.webp?v=1) center / cover no-repeat' },
    { id: 'snake-minimal', label: 'Minimal', swatch: '#0f2a18 url(/static/assets/wallpaper-snake-minimal.webp?v=1) center / cover no-repeat' },
    { id: 'snake-desierto', label: 'Desierto nocturno', swatch: '#120f22 url(/static/assets/wallpaper-snake-desierto.webp?v=1) center / cover no-repeat' }
  ];

  var desktopPrefs = { theme: 'auto', wallpaper: 'snake-vivid' };
  var qsPrefs = { dnd: false, focus: false, perf: false, compact: false };
  var autoThemeTimer = null;
  var wallpaperProfileKey = '';
  var themeProfileKey = '';
  var qsProfileKey = '';
  var legacyWallpaperId = '';
  try {
    var raw = localStorage.getItem(DESKTOP_PREFS_KEY);
    if (raw) {
      var p = JSON.parse(raw);
      if (p && typeof p === 'object') {
        // Legacy shared theme only used as fallback before login / first profile sync
        if (p.theme === 'light' || p.theme === 'dark' || p.theme === 'auto') desktopPrefs.theme = p.theme;
        if (typeof p.wallpaper === 'string' && WALLPAPERS.some(function (w) { return w.id === p.wallpaper; })) {
          legacyWallpaperId = p.wallpaper;
        }
      }
    }
  } catch (e) {}

  var alItems = [];
  var alIndex = 0;
  var toastTimer = null;

  function saveDesktopPrefs() {
    // Keep a tiny shared fallback for logged-out boot only (theme).
    try {
      var payload = { theme: desktopPrefs.theme };
      var consumed = false;
      try { consumed = localStorage.getItem(WALLPAPER_LEGACY_FLAG) === '1'; } catch (e2) {}
      if (!consumed && legacyWallpaperId) payload.wallpaper = legacyWallpaperId;
      localStorage.setItem(DESKTOP_PREFS_KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  function normalizeWallpaperId(id) {
    if (id === 'custom') {
      var k = profileWallpaperKey();
      if (k && (_customWpMem[k] || readCustomWallpaper(k))) return 'custom';
      try {
        if (k && localStorage.getItem(WALLPAPER_KEY_PREFIX + k) === 'custom') return 'custom';
      } catch (eN) {}
    }
    var ok = WALLPAPERS.some(function (w) { return w.id === id; });
    return ok ? id : 'snake-vivid';
  }

  var _customWpMem = Object.create(null); /* key -> Blob|string */
  var _customWpObjectUrl = '';
  var _customWpObjectBlob = null;

  function customWpIdb() {
    return new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open('snakeos_custom_wp_v1', 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('wp')) db.createObjectStore('wp');
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('IDB')); };
      } catch (e) { reject(e); }
    });
  }

  function readCustomWallpaper(key) {
    if (!key) return null;
    if (_customWpMem[key]) return _customWpMem[key];
    try {
      var v = localStorage.getItem(CUSTOM_WALLPAPER_KEY_PREFIX + key);
      if (v && /^data:image\/(gif|png|jpeg|jpg|webp);/i.test(v)) {
        _customWpMem[key] = v;
        return v;
      }
    } catch (e) {}
    return null;
  }

  function writeCustomWallpaper(key, blobOrDataUrl) {
    if (!key) return Promise.resolve(false);
    if (!blobOrDataUrl) {
      delete _customWpMem[key];
      try { localStorage.removeItem(CUSTOM_WALLPAPER_KEY_PREFIX + key); } catch (e0) {}
      return customWpIdb().then(function (db) {
        return new Promise(function (resolve) {
          try {
            var tx = db.transaction('wp', 'readwrite');
            tx.objectStore('wp').delete(key);
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { resolve(true); };
          } catch (e) { resolve(true); }
        });
      }).catch(function () { return true; });
    }
    _customWpMem[key] = blobOrDataUrl;
    return customWpIdb().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction('wp', 'readwrite');
          tx.objectStore('wp').put(blobOrDataUrl, key);
          tx.oncomplete = function () {
            try { localStorage.removeItem(CUSTOM_WALLPAPER_KEY_PREFIX + key); } catch (e1) {}
            resolve(true);
          };
          tx.onerror = function () {
            // Fallback: only small data URLs fit in localStorage
            if (typeof blobOrDataUrl === 'string' && blobOrDataUrl.length < 1200000) {
              try {
                localStorage.setItem(CUSTOM_WALLPAPER_KEY_PREFIX + key, blobOrDataUrl);
                resolve(true);
                return;
              } catch (e2) {}
            }
            resolve(false);
          };
        } catch (e) { resolve(false); }
      });
    }).catch(function () {
      if (typeof blobOrDataUrl === 'string' && blobOrDataUrl.length < 1200000) {
        try {
          localStorage.setItem(CUSTOM_WALLPAPER_KEY_PREFIX + key, blobOrDataUrl);
          return true;
        } catch (e4) { return false; }
      }
      return false;
    });
  }

  function loadCustomWallpaperFromIdb(key) {
    if (!key) return Promise.resolve(null);
    if (_customWpMem[key]) return Promise.resolve(_customWpMem[key]);
    return customWpIdb().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction('wp', 'readonly');
          var req = tx.objectStore('wp').get(key);
          req.onsuccess = function () {
            var v = req.result;
            if (!v) return resolve(null);
            if (typeof v === 'string' && /^data:image\//i.test(v)) {
              _customWpMem[key] = v;
              resolve(v);
            } else if (typeof Blob !== 'undefined' && v instanceof Blob) {
              _customWpMem[key] = v;
              resolve(v);
            } else resolve(null);
          };
          req.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    }).catch(function () { return null; });
  }

  function clearCustomInlineBg() {
    var img = document.getElementById('wpCustomImg');
    if (img) {
      img.removeAttribute('src');
      img.style.display = '';
    }
    if (_customWpObjectUrl) {
      try { URL.revokeObjectURL(_customWpObjectUrl); } catch (eR) {}
      _customWpObjectUrl = '';
    }
    _customWpObjectBlob = null;
    var b = document.body;
    if (b) b.style.removeProperty('--wp-custom');
  }

  function customWpToUrl(blobOrDataUrl) {
    if (!blobOrDataUrl) return '';
    if (typeof blobOrDataUrl === 'string') return blobOrDataUrl;
    if (typeof Blob !== 'undefined' && blobOrDataUrl instanceof Blob) {
      // Reusar la URL si es el mismo archivo: revocarla deja el <img> del fondo en negro
      if (_customWpObjectUrl && _customWpObjectBlob === blobOrDataUrl) return _customWpObjectUrl;
      _customWpObjectBlob = blobOrDataUrl;
      if (_customWpObjectUrl) {
        try { URL.revokeObjectURL(_customWpObjectUrl); } catch (eR) {}
      }
      _customWpObjectUrl = URL.createObjectURL(blobOrDataUrl);
      return _customWpObjectUrl;
    }
    return '';
  }

  function applyCustomInlineBg(blobOrDataUrl) {
    var url = customWpToUrl(blobOrDataUrl);
    var img = document.getElementById('wpCustomImg');
    if (img && url) {
      img.src = url;
      return;
    }
    // Fallback CSS var
    var b = document.body;
    if (!b || !url) return;
    b.style.setProperty('--wp-custom', 'url(' + JSON.stringify(url) + ')');
  }


  function profileWallpaperKey() {
    // Same profile scope as the store and the notification center: the logged-in email.
    // user id is not on the public session object, so email is the stable key.
    var u = window.currentUser;
    if (!u || !u.email) return '';
    var email = String(u.email).trim().toLowerCase();
    if (!email || email.indexOf('@') < 1) return '';
    return email;
  }

  function readProfileWallpaper(key) {
    if (!key) return '';
    try {
      var v = localStorage.getItem(WALLPAPER_KEY_PREFIX + key);
      if (v === 'custom' && readCustomWallpaper(key)) return 'custom';
      if (v && WALLPAPERS.some(function (w) { return w.id === v; })) return v;
    } catch (e) {}
    return '';
  }

  function writeProfileWallpaper(key, id) {
    if (!key) return;
    try { localStorage.setItem(WALLPAPER_KEY_PREFIX + key, id); } catch (e) {}
  }

  function readProfileTheme(key) {
    if (!key) return '';
    try {
      var v = localStorage.getItem(THEME_KEY_PREFIX + key);
      if (v === 'light' || v === 'dark' || v === 'auto') return v;
    } catch (e) {}
    return '';
  }


  function writeProfileTheme(key, theme) {
    if (!key) return;
    try { localStorage.setItem(THEME_KEY_PREFIX + key, theme); } catch (e) {}
  }

  var _wpServerPushTimer = null;
  var _wpServerPulling = false;
  var _serverCustomUrl = '';

  function schedulePushDesktopPrefs() {
    if (!profileWallpaperKey()) return;
    if (_wpServerPushTimer) clearTimeout(_wpServerPushTimer);
    _wpServerPushTimer = setTimeout(function () {
      _wpServerPushTimer = null;
      pushDesktopPrefsToServer();
    }, 280);
  }

  function pushDesktopPrefsToServer() {
    if (!profileWallpaperKey()) return Promise.resolve(null);
    var body = {
      wallpaper: desktopPrefs.wallpaper || 'snake-vivid',
      theme: desktopPrefs.theme || 'auto'
    };
    return apiJson('/api/desktop-prefs', { method: 'PUT', body: body }).then(function (data) {
      if (data && data.custom_url) _serverCustomUrl = data.custom_url;
      return data;
    }).catch(function () { return null; });
  }

  function uploadCustomWallpaperToServer(file) {
    if (!file || !profileWallpaperKey()) return Promise.resolve(null);
    var fd = new FormData();
    fd.append('file', file, file.name || 'wallpaper');
    return fetch('/api/me/wallpaper', { method: 'POST', credentials: 'include', body: fd }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var detail = (data && (data.detail || data.message)) || ('Error ' + res.status);
          throw new Error(typeof detail === 'string' ? detail : 'No se pudo subir el fondo');
        }
        if (data && data.custom_url) _serverCustomUrl = data.custom_url;
        return data;
      });
    });
  }

  function deleteCustomWallpaperOnServer() {
    if (!profileWallpaperKey()) return Promise.resolve(null);
    return apiJson('/api/me/wallpaper', { method: 'DELETE' }).then(function (data) {
      _serverCustomUrl = '';
      return data;
    }).catch(function () { return null; });
  }

  function applyServerCustomUrl(url) {
    if (!url) return;
    _serverCustomUrl = url;
    var bust = url.indexOf('?') >= 0 ? url : (url + '?t=' + Date.now());
    applyCustomInlineBg(bust);
    var key = profileWallpaperKey();
    if (!key) return;
    // Cache local para arranque rápido en este dispositivo
    fetch(bust, { credentials: 'include', cache: 'no-store' }).then(function (r) {
      if (!r.ok) return null;
      return r.blob();
    }).then(function (blob) {
      if (blob && blob.size) writeCustomWallpaper(key, blob);
    }).catch(function () {});
  }

  function pullDesktopPrefsFromServer() {
    if (!profileWallpaperKey()) return Promise.resolve(null);
    if (_wpServerPulling) return Promise.resolve(null);
    _wpServerPulling = true;
    return apiJson('/api/desktop-prefs').then(function (data) {
      if (!data || typeof data !== 'object') return null;
      var key = profileWallpaperKey();
      if (!key) return null;
      var wp = data.wallpaper;
      var theme = data.theme;
      if (theme === 'light' || theme === 'dark' || theme === 'auto') {
        writeProfileTheme(key, theme);
        applyTheme(theme, true);
      }
      if (wp === 'custom' && data.custom_url) {
        writeProfileWallpaper(key, 'custom');
        applyServerCustomUrl(data.custom_url);
        paintWallpaper('custom');
      } else if (typeof wp === 'string' && WALLPAPERS.some(function (w) { return w.id === wp; })) {
        writeProfileWallpaper(key, wp);
        paintWallpaper(wp);
      }
      try { syncCustomWpUi(); } catch (e) {}
      return data;
    }).catch(function () { return null; }).finally(function () {
      _wpServerPulling = false;
    });
  }


  function paintWallpaper(id) {
    var next = normalizeWallpaperId(id);
    desktopPrefs.wallpaper = next;
    var body = document.body;
    if (body) {
      body.setAttribute('data-wp', next);
      if (next === 'custom') {
        var keyWp = profileWallpaperKey();
        var asset = readCustomWallpaper(keyWp);
        if (asset) applyCustomInlineBg(asset);
        else if (_serverCustomUrl) applyCustomInlineBg(_serverCustomUrl);
        else {
          loadCustomWallpaperFromIdb(keyWp).then(function (u) {
            if (u && desktopPrefs.wallpaper === 'custom') applyCustomInlineBg(u);
            else if (_serverCustomUrl && desktopPrefs.wallpaper === 'custom') applyCustomInlineBg(_serverCustomUrl);
            else if (!u && desktopPrefs.wallpaper === 'custom') {
              clearCustomInlineBg();
              paintWallpaper('snake-vivid');
            }
            try { syncCustomWpUi(); } catch (e2) {}
          });
        }
      } else {
        clearCustomInlineBg();
      }
    }
    syncQsUi();
    try { syncCustomWpUi(); } catch (eSync) {}
  }

  function consumeLegacyWallpaper() {
    try {
      if (localStorage.getItem(WALLPAPER_LEGACY_FLAG) === '1') return '';
      localStorage.setItem(WALLPAPER_LEGACY_FLAG, '1');
      var raw = localStorage.getItem(DESKTOP_PREFS_KEY);
      if (raw) {
        var prefs = JSON.parse(raw);
        if (prefs && typeof prefs === 'object' && Object.prototype.hasOwnProperty.call(prefs, 'wallpaper')) {
          delete prefs.wallpaper;
          localStorage.setItem(DESKTOP_PREFS_KEY, JSON.stringify(prefs));
        }
      }
    } catch (e) { return ''; }
    return legacyWallpaperId || '';
  }

  // Logged out / perfiles nuevos: fondo por defecto Snake neón (pixel art vibrante).
  function syncWallpaperForProfile() {
    var key = profileWallpaperKey();
    if (key === wallpaperProfileKey && key === themeProfileKey) return;
    var prev = wallpaperProfileKey;
    wallpaperProfileKey = key;
    themeProfileKey = key;
    if (!key) {
      paintWallpaper('snake-vivid');
      // Keep last shared theme fallback for the lock screen only
      applyTheme(desktopPrefs.theme || 'auto', true);
      return;
    }
    var savedWp = readProfileWallpaper(key);
    if (!savedWp && !prev) {
      savedWp = consumeLegacyWallpaper() || '';
    }
    if (!savedWp) {
      savedWp = 'snake-vivid';
      writeProfileWallpaper(key, savedWp);
    }
    if (savedWp === 'custom') {
      loadCustomWallpaperFromIdb(key).then(function () { paintWallpaper('custom'); });
    } else {
      paintWallpaper(savedWp);
    }
    var savedTheme = readProfileTheme(key);
    if (!savedTheme) {
      // First time on this account: inherit current/legacy theme once, then own it
      savedTheme = desktopPrefs.theme || 'auto';
      writeProfileTheme(key, savedTheme);
    }
    applyTheme(savedTheme, true);
    // Servidor gana: mismo fondo/tema en todos los dispositivos del perfil
    pullDesktopPrefsFromServer();
  }

  function showShotToast(msg) {
    var t = document.getElementById('shotToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function syncQsUi() {
    document.querySelectorAll('#wpWallpapers .wp-swatch').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.wp === desktopPrefs.wallpaper);
    });
    var map = {
      qsDnd: !!qsPrefs.dnd,
      qsFocus: !!qsPrefs.focus,
      qsPerf: !!qsPrefs.perf,
      qsCompact: !!qsPrefs.compact
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('active', map[id]);
      el.setAttribute('aria-pressed', map[id] ? 'true' : 'false');
    });
  }

  function readQsPrefs(key) {
    if (!key) return { dnd: false, focus: false, perf: false, compact: false };
    try {
      var raw = localStorage.getItem(QS_KEY_PREFIX + key);
      if (!raw) return { dnd: false, focus: false, perf: false, compact: false };
      var p = JSON.parse(raw) || {};
      return {
        dnd: !!p.dnd,
        focus: !!p.focus,
        perf: !!p.perf,
        compact: !!p.compact
      };
    } catch (e) {
      return { dnd: false, focus: false, perf: false, compact: false };
    }
  }

  function writeQsPrefs(key, prefs) {
    if (!key) return;
    try { localStorage.setItem(QS_KEY_PREFIX + key, JSON.stringify(prefs)); } catch (e) {}
  }

  var lastDndSent = null;
  function syncDndToServer() {
    if (!window.currentUser) return;
    var on = !!qsPrefs.dnd; if (on === lastDndSent) return; lastDndSent = on;
    try { fetch('/api/push/dnd', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: on }) }).catch(function () { lastDndSent = null; }); } catch (e) {}
  }
  function applyQsEffects() {
    var b = document.body;
    if (!b) return;
    syncDndToServer();
    b.classList.toggle('qs-dnd', !!qsPrefs.dnd);
    b.classList.toggle('qs-focus', !!qsPrefs.focus);
    b.classList.toggle('qs-perf', !!qsPrefs.perf);
    b.classList.toggle('qs-compact', !!qsPrefs.compact);
    window.__snakeOsDnd = !!qsPrefs.dnd;
    syncQsUi();
  }

  function setQsPref(name, value) {
    var key = profileWallpaperKey();
    if (key && key !== qsProfileKey) qsPrefs = readQsPrefs(key);   /* no pisar los ajustes de este perfil con los de otro / los de por defecto */
    qsPrefs[name] = !!value;
    if (key) {
      qsProfileKey = key;
      writeQsPrefs(key, qsPrefs);
    }
    applyQsEffects();
  }

  function toggleQsPref(name) {
    setQsPref(name, !qsPrefs[name]);
    var labels = {
      dnd: qsPrefs.dnd ? 'No molestar activado' : 'No molestar desactivado',
      focus: qsPrefs.focus ? 'Modo foco: iconos ocultos' : 'Modo foco desactivado',
      perf: qsPrefs.perf ? 'Rendimiento: menos efectos' : 'Efectos visuales normales',
      compact: qsPrefs.compact ? 'Iconos compactos' : 'Iconos normales'
    };
    showShotToast(labels[name] || 'Ajuste guardado');
  }

  function syncQsForProfile() {
    var key = profileWallpaperKey();
    if (key === qsProfileKey && key) {
      applyQsEffects();
      return;
    }
    qsProfileKey = key;
    qsPrefs = readQsPrefs(key);
    applyQsEffects();
  }

  var ACCOUNT_LOCK_PREFIX = 'snakeos_acct_locked:';

  function currentAccountEmail() {
    var u = window.currentUser;
    return u && u.email ? String(u.email).trim().toLowerCase() : '';
  }

  function accountLockStorageKey(email) {
    return ACCOUNT_LOCK_PREFIX + String(email || '').trim().toLowerCase();
  }

  function isEmailAccountLockedLocal(email) {
    email = String(email || '').trim().toLowerCase();
    if (!email) return false;
    try { return localStorage.getItem(accountLockStorageKey(email)) === '1'; }
    catch (e) { return false; }
  }

  function setEmailAccountLockedLocal(email, locked) {
    email = String(email || '').trim().toLowerCase();
    if (!email) return;
    try {
      if (locked) localStorage.setItem(accountLockStorageKey(email), '1');
      else localStorage.removeItem(accountLockStorageKey(email));
    } catch (e) {}
  }

  function syncAccountLockFromUser(user) {
    if (!user || !user.email) return;
    var locked = !!user.accountLocked;
    setEmailAccountLockedLocal(user.email, locked);
    try {
      if (window.currentUser && window.currentUser.email === user.email) {
        window.currentUser.accountLocked = locked;
      }
    } catch (e) {}
  }

  function isAccountSoftLocked() {
    return window.__snkManualLock === true;
  }

  function apiJson(path, opts) {
    var apiFn = typeof window.api === 'function' ? window.api : null;
    if (apiFn) return apiFn(path, opts);
    opts = opts || {};
    return fetch(path, {
      method: opts.method || 'GET',
      credentials: 'include',
      headers: opts.body != null ? { 'Content-Type': 'application/json' } : {},
      body: opts.body != null ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (err) { data = { detail: text }; }
        if (!res.ok) {
          var detail = (data && (data.detail || data.message)) || ('Error ' + res.status);
          throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
        }
        return data;
      });
    });
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureSoftLockOverlay() {
    var el = document.getElementById('qsSoftLock');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'qsSoftLock';
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Cuenta bloqueada');
    el.innerHTML =
      '<div class="qsl-card">' +
        '<div class="qsl-av" data-qsl="av"></div>' +
        '<h2 class="qsl-title" data-qsl="title">Cuenta bloqueada</h2>' +
        '<p class="qsl-sub">Introduce la contraseña de tu cuenta para desbloquear</p>' +
        '<p class="qsl-email" data-qsl="email"></p>' +
        '<form class="qsl-form" data-qsl="form" autocomplete="off">' +
          '<input data-qsl="pass" type="password" name="password" autocomplete="current-password" placeholder="Contraseña de tu cuenta" required>' +
          '<button type="submit" data-qsl="btn">Desbloquear</button>' +
        '</form>' +
        '<p class="qsl-err" data-qsl="err" aria-live="polite"></p>' +
        '<p class="qsl-hint">Solo se bloquea tu cuenta. Otras cuentas no se ven afectadas.</p>' +
      '</div>';

    // No desbloquear al pulsar el fondo
    el.addEventListener('click', function (e) { e.stopPropagation(); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    var form = el.querySelector('[data-qsl="form"]');
    var passInp = el.querySelector('[data-qsl="pass"]');
    var btn = el.querySelector('[data-qsl="btn"]');
    var errEl = el.querySelector('[data-qsl="err"]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var pwd = String((passInp && passInp.value) || '');
      if (!pwd) {
        if (errEl) errEl.textContent = 'Escribe tu contraseña';
        return;
      }
      if (errEl) errEl.textContent = '';
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Comprobando…';
      }
      // Sonido de bienvenida al desbloquear (se prepara en el gesto para Safari/iOS)
      var unlockSound = typeof window.primeLoginSuccessSound === 'function' ? window.primeLoginSuccessSound() : null;
      Promise.resolve(apiJson('/api/me/verify-password', { method: 'POST', body: { password: pwd } })).then(function (data) {
        if (data && data.user) syncAccountLockFromUser(data.user);
        else {
          var email = currentAccountEmail();
          if (email) setEmailAccountLockedLocal(email, false);
          if (window.currentUser) window.currentUser.accountLocked = false;
        }
        unlockAccountSoftLock(true);
        if (unlockSound && typeof window.playLoginSuccessSound === 'function') window.playLoginSuccessSound(unlockSound);
      }).catch(function (err) {
        if (unlockSound && !unlockSound._dcWanted) { try { unlockSound.pause(); } catch (eS) {} }
        if (errEl) errEl.textContent = (err && err.message) ? err.message : 'Contraseña incorrecta';
        if (passInp) {
          passInp.value = '';
          try { passInp.focus(); } catch (e2) {}
        }
      }).finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Desbloquear';
        }
      });
    });

    document.body.appendChild(el);
    return el;
  }

  function paintSoftLockIdentity(el) {
    if (!el) return;
    var u = window.currentUser || {};
    var name = u.name || 'Tu cuenta';
    var email = u.email || '';
    var avEl = el.querySelector('[data-qsl="av"]');
    var titleEl = el.querySelector('[data-qsl="title"]');
    var emailEl = el.querySelector('[data-qsl="email"]');
    if (titleEl) titleEl.textContent = 'Cuenta de ' + name + ' bloqueada';
    if (emailEl) emailEl.textContent = email;
    if (avEl) {
      if (typeof window.avatarMarkup === 'function') {
        avEl.innerHTML = window.avatarMarkup(u.avatar, 'avatar-img');
      } else {
        avEl.textContent = '🔒';
      }
    }
  }

  function showAccountSoftLockOverlay() {
    var el = ensureSoftLockOverlay();
    paintSoftLockIdentity(el);
    var errEl = el.querySelector('[data-qsl="err"]');
    var passInp = el.querySelector('[data-qsl="pass"]');
    if (errEl) errEl.textContent = '';
    if (passInp) passInp.value = '';
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('account-soft-locked');
    setTimeout(function () {
      try { if (passInp) passInp.focus(); } catch (e) {}
    }, 60);
  }

  function hideAccountSoftLockOverlay() {
    var el = document.getElementById('qsSoftLock');
    if (el) {
      el.classList.remove('open');
      el.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('account-soft-locked');
  }

  function unlockAccountSoftLock(okToast) {
    window.__snkNeedReauth = false;
    window.__snkManualLock = false;
    var email = currentAccountEmail();
    if (email) setEmailAccountLockedLocal(email, false);
    if (window.currentUser) window.currentUser.accountLocked = false;
    hideAccountSoftLockOverlay();
    if (okToast) showShotToast('Cuenta desbloqueada');
  }

  function softLockDesktop() {
    var email = currentAccountEmail();
    if (!email) {
      showShotToast('Inicia sesión para bloquear tu cuenta');
      return;
    }
    closeQsPanel();
    closeWpPanel();
    closeAppLauncher();
    closeStartMenuSafe();
    setEmailAccountLockedLocal(email, true);
    if (window.currentUser) window.currentUser.accountLocked = true;
    window.__snkManualLock = true;
    showAccountSoftLockOverlay();
    showShotToast('Cuenta bloqueada en todos tus dispositivos');
    apiJson('/api/me/lock', { method: 'POST' }).then(function (user) {
      syncAccountLockFromUser(user || { email: email, accountLocked: true });
    }).catch(function (err) {
      showShotToast('No se pudo sincronizar el bloqueo: ' + ((err && err.message) || 'error'));
    });
  }

  function maybeRestoreAccountLock() {
    // El intervalo puede dispararse antes de que exista <body>: se reintenta en el siguiente ciclo (400 ms)
    if (!document.body) return;
    var u = window.currentUser;
    if (u && typeof u.accountLocked === 'boolean') {
      syncAccountLockFromUser(u);
    }
    if (!isAccountSoftLocked()) {
      if (document.body.classList.contains('account-soft-locked')) {
        hideAccountSoftLockOverlay();
      }
      return;
    }
    var elOpen = document.getElementById('qsSoftLock');
    if (elOpen && elOpen.classList.contains('open')) {
      paintSoftLockIdentity(elOpen);
      return;
    }
    showAccountSoftLockOverlay();
  }

  window.softLockDesktop = softLockDesktop;
  window.unlockAccountSoftLock = unlockAccountSoftLock;
  window.hideAccountSoftLockOverlay = hideAccountSoftLockOverlay;
  window.isAccountSoftLocked = isAccountSoftLocked;
  window.maybeRestoreAccountLock = maybeRestoreAccountLock;

  function qsCloseAllApps() {
    closeQsPanel();
    try {
      if (typeof window.closeAllApps === 'function') window.closeAllApps();
      else if (typeof closeAllApps === 'function') closeAllApps();
    } catch (e) {}
    showShotToast('Apps cerradas');
  }

  function qsToggleFullscreen() {
    closeQsPanel();
    try {
      if (!document.fullscreenElement) {
        var root = document.documentElement;
        var req = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
        if (req) req.call(root);
        showShotToast('Pantalla completa');
      } else {
        var exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
        if (exit) exit.call(document);
        showShotToast('Ventana normal');
      }
    } catch (e) {
      showShotToast('No se pudo cambiar pantalla completa');
    }
  }

  function qsCopyDeskCode() {
    closeQsPanel();
    function copyText(text) {
      if (!text) {
        showShotToast('Sin código Desk todavía');
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          showShotToast('Código Desk: ' + text);
        }).catch(function () {
          showShotToast(text);
        });
      } else {
        showShotToast(text);
      }
    }
    var info = typeof window.getDeskAgentInfo === 'function' ? window.getDeskAgentInfo() : null;
    if (info && (info.formatted || info.code)) {
      copyText(info.formatted || info.code);
      return;
    }
    try {
      if (typeof window.api === 'function') {
        window.api('/api/desk/me').then(function (data) {
          copyText((data && (data.formatted || data.code)) || '');
        }).catch(function () {
          showShotToast('No se pudo obtener el código Desk');
        });
        return;
      }
    } catch (e) {}
    showShotToast('Abre Doganiero Desk una vez para generar tu código');
  }

  function getMadridHour() {
    try {
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid',
        hour: 'numeric',
        hour12: false
      }).formatToParts(new Date());
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'hour') return parseInt(parts[i].value, 10);
      }
    } catch (e) {}
    return new Date().getHours();
  }

  function resolveAutoTheme() {
    try {
      var h = getMadridHour();
      // Madrid: claro ~07:00-20:00, oscuro el resto
      if (h >= 7 && h < 20) return 'light';
      return 'dark';
    } catch (e) {
      try {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
      } catch (e2) {}
      return 'dark';
    }
  }

  function effectiveTheme() {
    if (desktopPrefs.theme === 'auto') return resolveAutoTheme();
    return desktopPrefs.theme === 'light' ? 'light' : 'dark';
  }

  function applyVisualTheme(resolved) {
    var isLight = resolved === 'light';
    document.body.classList.toggle('theme-light', isLight);
    document.body.classList.toggle('light', isLight);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isLight ? '#c8ebd6' : '#1f9e57');
  }

  function refreshAutoTheme() {
    if (desktopPrefs.theme !== 'auto') return;
    applyVisualTheme(effectiveTheme());
  }

  function ensureAutoThemeWatcher() {
    if (desktopPrefs.theme === 'auto') {
      if (!autoThemeTimer) autoThemeTimer = setInterval(refreshAutoTheme, 60000);
      refreshAutoTheme();
    } else if (autoThemeTimer) {
      clearInterval(autoThemeTimer);
      autoThemeTimer = null;
    }
  }

  function applyTheme(theme, skipPersist) {
    if (theme === 'auto' || theme === 'light' || theme === 'dark') {
      desktopPrefs.theme = theme;
    } else {
      desktopPrefs.theme = 'auto';
    }
    applyVisualTheme(effectiveTheme());
    if (!skipPersist) {
      saveDesktopPrefs();
      var key = profileWallpaperKey();
      if (key) {
        themeProfileKey = key;
        writeProfileTheme(key, desktopPrefs.theme);
        schedulePushDesktopPrefs();
      }
    }
    syncQsUi();
    ensureAutoThemeWatcher();
  }

  function toggleTheme() {
    var next = desktopPrefs.theme === 'auto' ? 'light' : (desktopPrefs.theme === 'light' ? 'dark' : 'auto');
    applyTheme(next);
    var labels = { auto: 'Tema automático', light: 'Tema claro', dark: 'Tema oscuro' };
    showShotToast(labels[desktopPrefs.theme] || 'Tema');
  }

  function applyWallpaper(id) {
    if (window.snkOsxWallpaperLocked && window.snkOsxWallpaperLocked()) return;
    paintWallpaper(id);
    var key = profileWallpaperKey();
    if (!key) return;
    wallpaperProfileKey = key;
    writeProfileWallpaper(key, desktopPrefs.wallpaper);
    schedulePushDesktopPrefs();
  }

  function syncCustomWpUi() {
    var clearBtn = document.getElementById('wpClearCustomBtn');
    var key = profileWallpaperKey();
    var asset = key ? readCustomWallpaper(key) : null;
    var has = !!(asset || _serverCustomUrl);
    if (clearBtn) clearBtn.hidden = !has;
    var chip = document.querySelector('#wpWallpapers .wp-custom-swatch');
    if (chip) {
      var url = asset ? customWpToUrl(asset) : (_serverCustomUrl || '');
      chip.style.background = url
        ? ('#111 url(' + JSON.stringify(url) + ') center / cover no-repeat')
        : '#222';
      chip.hidden = !has;
      chip.classList.toggle('active', desktopPrefs.wallpaper === 'custom');
    }
  }

  function ensureCustomSwatch(row) {
    var chip = row.querySelector('.wp-custom-swatch');
    if (chip) return chip;
    chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'wp-swatch wp-custom-swatch';
    chip.dataset.wp = 'custom';
    chip.title = 'Fondo subido';
    chip.setAttribute('aria-label', 'Fondo subido');
    chip.hidden = true;
    chip.addEventListener('click', function () {
      if (!readCustomWallpaper(profileWallpaperKey()) && !_serverCustomUrl) {
        showShotToast('Sube primero una imagen o GIF');
        return;
      }
      applyWallpaper('custom');
      showShotToast('Fondo: el tuyo');
    });
    row.appendChild(chip);
    return chip;
  }

  function buildWallpaperChips() {
    var row = document.getElementById('wpWallpapers');
    if (!row) return;
    if (row.dataset.ready !== '1') {
      row.dataset.ready = '1';
      WALLPAPERS.forEach(function (w) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'wp-swatch';
        b.dataset.wp = w.id;
        b.title = w.label;
        b.style.background = w.swatch;
        b.setAttribute('aria-label', w.label);
        b.addEventListener('click', function () {
          applyWallpaper(w.id);
          showShotToast('Fondo: ' + w.label);
        });
        row.appendChild(b);
      });
      ensureCustomSwatch(row);
    } else {
      ensureCustomSwatch(row);
    }
    syncCustomWpUi();
  }

  function handleWallpaperUpload(file) {
    if (!file) return;
    if (window.snkOsxWallpaperLocked && window.snkOsxWallpaperLocked()) return;
    var key = profileWallpaperKey();
    if (!key) {
      showShotToast('Inicia sesión para subir un fondo');
      return;
    }
    var mime = String(file.type || '').toLowerCase();
    var name = String(file.name || '').toLowerCase();
    var okType = /^image\/(gif|png|jpeg|jpg|webp)$/.test(mime) || /\.(gif|png|jpe?g|webp)$/.test(name);
    if (!okType) {
      showShotToast('Usa PNG, JPG, WebP o GIF');
      return;
    }
    if (file.size > CUSTOM_WP_MAX_BYTES) {
      showShotToast('Archivo demasiado grande (máx. 10 MB)');
      return;
    }
    showShotToast('Aplicando fondo…');
    // Local + servidor: así el mismo perfil ve el fondo en otros dispositivos
    Promise.resolve(writeCustomWallpaper(key, file)).then(function (ok) {
      if (!ok) {
        showShotToast('No se pudo guardar el fondo. Prueba un archivo más pequeño.');
        return;
      }
      applyWallpaper('custom');
      buildWallpaperChips();
      var isGif = mime.indexOf('gif') >= 0 || name.indexOf('.gif') >= 0;
      showShotToast(isGif ? 'GIF de fondo aplicado' : 'Fondo subido');
      return uploadCustomWallpaperToServer(file).catch(function () {
        showShotToast('Fondo guardado aquí; no se pudo sincronizar aún');
      });
    }).catch(function () {
      showShotToast('Error al guardar el fondo');
    });
  }

  function bindWallpaperUpload() {
    if (bindWallpaperUpload._done) return;
    var input = document.getElementById('wpUploadInput');
    var btn = document.getElementById('wpUploadBtn');
    var clearBtn = document.getElementById('wpClearCustomBtn');
    // Este script se carga en <head>: si el panel aún no existe, se reintenta al abrirlo.
    if (!input || !btn) {
      if (!bindWallpaperUpload._wait) {
        bindWallpaperUpload._wait = true;
        document.addEventListener('DOMContentLoaded', function () { bindWallpaperUpload(); });
      }
      return;
    }
    bindWallpaperUpload._done = true;
    if (btn && input) {
      btn.addEventListener('click', function () {
        if (!profileWallpaperKey()) {
          showShotToast('Inicia sesión para subir un fondo');
          return;
        }
        input.click();
      });
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        input.value = '';
        handleWallpaperUpload(f);
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        var key = profileWallpaperKey();
        if (!key) return;
        Promise.resolve(writeCustomWallpaper(key, '')).then(function () {
          if (desktopPrefs.wallpaper === 'custom') applyWallpaper('snake-vivid');
          else {
            syncCustomWpUi();
            schedulePushDesktopPrefs();
          }
          deleteCustomWallpaperOnServer();
          showShotToast('Fondo subido eliminado');
        });
      });
    }
  }

  function closeWpPanel() {
    var p = document.getElementById('wpPanel');
    if (!p) return;
    p.classList.remove('open');
    p.setAttribute('aria-hidden', 'true');
  }

  function toggleWpPanel() {
    var p = document.getElementById('wpPanel');
    if (!p) return;
    bindWallpaperUpload();
    buildWallpaperChips();
    syncQsUi();
    var open = !p.classList.contains('open');
    p.classList.toggle('open', open);
    p.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      closeQsPanel();
      closeAppLauncher();
    }
  }

  function closeQsPanel() {
    var p = document.getElementById('qsPanel');
    if (!p) return;
    p.classList.remove('open');
    p.setAttribute('aria-hidden', 'true');
  }

  function toggleQsPanel() {
    var p = document.getElementById('qsPanel');
    if (!p) return;
    syncQsUi();
    var open = !p.classList.contains('open');
    p.classList.toggle('open', open);
    p.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      closeWpPanel();
      closeAppLauncher();
    }
  }

  function closeStartMenuSafe() {
    try {
      if (typeof closeStartMenu === 'function') closeStartMenu();
    } catch (e) {}
  }

  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (loadHtml2Canvas._p) return loadHtml2Canvas._p;
    loadHtml2Canvas._p = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.async = true;
      s.onload = function () { resolve(window.html2canvas); };
      s.onerror = function () {
        loadHtml2Canvas._p = null;
        reject(new Error('No se pudo cargar html2canvas'));
      };
      document.head.appendChild(s);
    });
    return loadHtml2Canvas._p;
  }

  // Capturas a resolución nativa. Antes: scale = Math.min(2, devicePixelRatio)
  // recortaba pantallas retina/3x y html2canvas redibujaba el DOM en baja.
  function screenshotScale(cssW, cssH) {
    var dpr = window.devicePixelRatio || 1;
    if (!(dpr > 0) || !isFinite(dpr)) dpr = 1;
    var scale = dpr;
    var longSide = Math.max(cssW, cssH, 1);
    var maxSide = 8192;
    var maxPixels = 18000000;
    if (longSide * scale > maxSide) scale = maxSide / longSide;
    var area = Math.max(1, cssW * cssH);
    if (area * scale * scale > maxPixels) scale = Math.sqrt(maxPixels / area);
    if (!(scale > 0) || !isFinite(scale)) scale = 1;
    if (scale > dpr) scale = dpr;
    return scale;
  }

  function screenshotViewport(desktop) {
    var rect = desktop.getBoundingClientRect();
    var cssW = Math.round(rect.width || desktop.clientWidth || 0);
    var cssH = Math.round(rect.height || desktop.clientHeight || 0);
    var vw = Math.round(window.innerWidth || cssW || 1);
    var vh = Math.round(window.innerHeight || cssH || 1);
    if (cssW < vw * 0.9) cssW = vw;
    if (cssH < vh * 0.9) cssH = vh;
    if (cssW < 1) cssW = 1;
    if (cssH < 1) cssH = 1;
    return { cssW: cssW, cssH: cssH };
  }

  function collectedPageCss() {
    var css = '';
    var sheets = document.styleSheets;
    var i, r, rules;
    for (i = 0; i < sheets.length; i++) {
      try { rules = sheets[i].cssRules; } catch (e) { rules = null; }
      if (!rules) continue;
      for (r = 0; r < rules.length; r++) {
        try { css += rules[r].cssText + '\n'; } catch (e2) {}
      }
    }
    return css;
  }

  function absolutizeUrl(url) {
    try { return new URL(url, window.location.href).href; } catch (e) { return url; }
  }

  function inlineLiveImage(src, dst) {
    var iw = src.naturalWidth || 0;
    var ih = src.naturalHeight || 0;
    if (src.complete && iw > 0 && ih > 0) {
      var ic = document.createElement('canvas');
      ic.width = iw;
      ic.height = ih;
      var ictx = ic.getContext('2d');
      ictx.imageSmoothingEnabled = true;
      ictx.imageSmoothingQuality = 'high';
      ictx.drawImage(src, 0, 0, iw, ih);
      dst.setAttribute('src', ic.toDataURL('image/png'));
      return;
    }
    var raw = dst.getAttribute('src') || '';
    if (raw && raw.indexOf('data:') !== 0) dst.setAttribute('src', absolutizeUrl(raw));
  }

  function prepareShotClone(desktop, cssW, cssH) {
    var clone = desktop.cloneNode(true);
    clone.classList.remove('hidden');
    clone.removeAttribute('hidden');
    var originals = [desktop].concat(Array.prototype.slice.call(desktop.querySelectorAll('*')));
    var clones = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll('*')));
    var n = Math.min(originals.length, clones.length);
    var i, src, dst, cs;
    for (i = 0; i < n; i++) {
      src = originals[i];
      dst = clones[i];
      if (!src || !dst || src.nodeType !== 1) continue;
      try { cs = window.getComputedStyle(src); } catch (eCs) { cs = null; }
      if (src.tagName === 'CANVAS' && dst.tagName === 'CANVAS' && src.width && src.height) {
        try {
          var snap = document.createElement('img');
          snap.alt = '';
          snap.setAttribute('src', src.toDataURL('image/png'));
          if (cs) {
            snap.style.width = cs.width;
            snap.style.height = cs.height;
            snap.style.display = cs.display || 'block';
            snap.style.objectFit = cs.objectFit || 'contain';
            if (cs.position === 'fixed') snap.style.position = 'absolute';
          }
          if (dst.parentNode) dst.parentNode.replaceChild(snap, dst);
        } catch (eCanvas) {}
        continue;
      }
      if (src.tagName === 'IMG' && dst.tagName === 'IMG') {
        try { inlineLiveImage(src, dst); } catch (eImg) {
          var rawSrc = dst.getAttribute('src') || '';
          if (rawSrc && rawSrc.indexOf('data:') !== 0) dst.setAttribute('src', absolutizeUrl(rawSrc));
        }
      }
      if (cs && cs.position === 'fixed') dst.style.position = 'absolute';
    }
    clone.style.position = 'relative';
    clone.style.inset = 'auto';
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.right = 'auto';
    clone.style.bottom = 'auto';
    clone.style.width = cssW + 'px';
    clone.style.height = cssH + 'px';
    clone.style.margin = '0';
    clone.style.transform = 'none';
    clone.style.overflow = 'hidden';

    var host = document.createElement('body');
    host.className = document.body.className || '';
    var wp = document.body.getAttribute('data-wp');
    if (wp) host.setAttribute('data-wp', wp);
    host.style.margin = '0';
    host.style.padding = '0';
    host.style.width = cssW + 'px';
    host.style.height = cssH + 'px';
    host.style.overflow = 'hidden';
    host.style.position = 'relative';
    try {
      var bcs = window.getComputedStyle(document.body);
      if (bcs.backgroundImage && bcs.backgroundImage !== 'none') host.style.backgroundImage = bcs.backgroundImage;
      if (bcs.backgroundColor) host.style.backgroundColor = bcs.backgroundColor;
      host.style.backgroundRepeat = 'no-repeat';
    } catch (eBg) {}
    var style = document.createElement('style');
    style.textContent = collectedPageCss();
    host.appendChild(style);
    host.appendChild(clone);
    return host;
  }

  function canvasLooksBlank(canvas) {
    try {
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return true;
      var w = canvas.width;
      var h = canvas.height;
      if (w < 2 || h < 2) return true;
      var pts = [
        [Math.floor(w * 0.5), Math.floor(h * 0.5)],
        [Math.floor(w * 0.12), Math.floor(h * 0.18)],
        [Math.floor(w * 0.88), Math.floor(h * 0.72)],
        [10, Math.max(0, h - 14)]
      ];
      var i, px;
      for (i = 0; i < pts.length; i++) {
        px = ctx.getImageData(pts[i][0], pts[i][1], 1, 1).data;
        if (px[3] > 12) return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function renderCloneSharp(host, cssW, cssH, scale) {
    return new Promise(function (resolve, reject) {
      var pxW = Math.max(1, Math.round(cssW * scale));
      var pxH = Math.max(1, Math.round(cssH * scale));
      var xmlns = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(xmlns, 'svg');
      svg.setAttribute('xmlns', xmlns);
      svg.setAttribute('width', String(pxW));
      svg.setAttribute('height', String(pxH));
      svg.setAttribute('viewBox', '0 0 ' + cssW + ' ' + cssH);
      var fo = document.createElementNS(xmlns, 'foreignObject');
      fo.setAttribute('x', '0');
      fo.setAttribute('y', '0');
      fo.setAttribute('width', String(cssW));
      fo.setAttribute('height', String(cssH));
      fo.appendChild(host);
      svg.appendChild(fo);
      var xml = new XMLSerializer().serializeToString(svg);
      var blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        try {
          if ((img.naturalWidth || 0) < pxW * 0.85 || (img.naturalHeight || 0) < pxH * 0.85) {
            URL.revokeObjectURL(url);
            reject(new Error('raster bajo'));
            return;
          }
          var canvas = document.createElement('canvas');
          canvas.width = pxW;
          canvas.height = pxH;
          var ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, pxW, pxH);
          URL.revokeObjectURL(url);
          resolve(canvas);
        } catch (eDraw) {
          URL.revokeObjectURL(url);
          reject(eDraw);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo rasterizar la captura'));
      };
      img.src = url;
    });
  }

  function exportShotCanvas(canvas) {
    var png = '';
    try { png = canvas.toDataURL('image/png'); } catch (ePng) { png = ''; }
    if (png && png.indexOf('data:image/png') === 0 && png.length <= 14000000) {
      return { dataUrl: png, type: 'image/png', ext: 'png' };
    }
    var jpeg = canvas.toDataURL('image/jpeg', 0.92);
    return { dataUrl: jpeg, type: 'image/jpeg', ext: 'jpg' };
  }

  function h2cShotOptions(desktop, cssW, cssH, scale) {
    return {
      backgroundColor: null,
      useCORS: true,
      allowTaint: false,
      scale: scale,
      width: cssW,
      height: cssH,
      windowWidth: cssW,
      windowHeight: cssH,
      scrollX: 0,
      scrollY: 0,
      logging: false,
      onclone: function (doc) {
        var el = doc.getElementById('desktop');
        if (!el) return;
        el.classList.remove('hidden');
        el.style.width = cssW + 'px';
        el.style.height = cssH + 'px';
        try {
          var bodyCs = window.getComputedStyle(document.body);
          if (bodyCs.backgroundImage && bodyCs.backgroundImage !== 'none') el.style.backgroundImage = bodyCs.backgroundImage;
          if (bodyCs.backgroundColor) el.style.backgroundColor = bodyCs.backgroundColor;
        } catch (eBg) {}
        try {
          var live = desktop.querySelectorAll('canvas');
          var cloned = el.querySelectorAll('canvas');
          var i, csrc, cdst, c2;
          for (i = 0; i < live.length && i < cloned.length; i++) {
            csrc = live[i];
            cdst = cloned[i];
            if (!csrc.width || !csrc.height) continue;
            cdst.width = csrc.width;
            cdst.height = csrc.height;
            c2 = cdst.getContext('2d');
            if (!c2) continue;
            c2.imageSmoothingEnabled = true;
            c2.imageSmoothingQuality = 'high';
            c2.drawImage(csrc, 0, 0);
          }
        } catch (eCopy) {}
      }
    };
  }

  function takeDesktopScreenshot() {
    var currentUser = window.currentUser;
    if (!currentUser) {
      showShotToast('Inicia sesión para guardar la captura');
      return;
    }
    var desktop = document.getElementById('desktop');
    if (!desktop || desktop.classList.contains('hidden')) {
      showShotToast('Escritorio no visible');
      return;
    }
    closeQsPanel();
    closeWpPanel();
    closeAppLauncher();
    closeStartMenuSafe();
    showShotToast('Capturando…');

    var hideIds = ['qsPanel', 'wpPanel', 'appLauncher', 'shotToast', 'startMenu', 'phoneRecentsOverlay'];
    var prev = {};
    function hideChrome() {
      hideIds.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        prev[id] = el.style.visibility;
        el.style.visibility = 'hidden';
      });
    }
    function showChrome() {
      hideIds.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.visibility = prev[id] || '';
      });
    }

    hideChrome();
    var box = screenshotViewport(desktop);
    var scale = screenshotScale(box.cssW, box.cssH);
    var expectedW = Math.max(1, Math.round(box.cssW * scale));
    try {
      console.info('captura', box.cssW + 'x' + box.cssH, 'dpr', window.devicePixelRatio || 1, 'scale', Math.round(scale * 1000) / 1000);
    } catch (eLog) {}

    function acceptCanvas(canvas) {
      if (!canvas || canvasLooksBlank(canvas) || canvas.width < expectedW * 0.8) {
        throw new Error('captura de baja resolución');
      }
      return exportShotCanvas(canvas);
    }

    var sharp;
    try {
      var host = prepareShotClone(desktop, box.cssW, box.cssH);
      sharp = renderCloneSharp(host, box.cssW, box.cssH, scale).then(acceptCanvas);
    } catch (ePrep) {
      sharp = Promise.reject(ePrep);
    }

    sharp.catch(function () {
      return loadHtml2Canvas().then(function (h2c) {
        return h2c(desktop, h2cShotOptions(desktop, box.cssW, box.cssH, scale)).then(acceptCanvas);
      });
    }).then(function (shot) {
      showChrome();
      var stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).replace(/[: ]/g, '-').slice(0, 19);
      var name = 'Captura-' + stamp + '.' + shot.ext;
      var entry = {
        id: Date.now(),
        name: name,
        type: shot.type,
        dataUrl: shot.dataUrl,
        size: shot.dataUrl.length
      };
      if (typeof window.__snakeOsSaveDesktopFile === 'function') {
        return window.__snakeOsSaveDesktopFile(entry).then(function () {
          showShotToast('📸 Guardada en el escritorio: ' + name);
        });
      }
      var a = document.createElement('a');
      a.href = shot.dataUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showShotToast('📸 Descargada: ' + name);
    }).catch(function (err) {
      showChrome();
      console.warn('screenshot', err);
      showShotToast('No se pudo capturar: ' + (err && err.message ? err.message : 'error'));
    });
  }

  function isTypingTarget(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    return !!(el.closest && el.closest('[contenteditable="true"]'));
  }

  function closeAppLauncher() {
    var box = document.getElementById('appLauncher');
    if (!box) return;
    box.classList.remove('open');
    box.setAttribute('aria-hidden', 'true');
    var inp = document.getElementById('alInput');
    if (inp) inp.value = '';
  }

  function getLauncherApps() {
    var apps = window.APPS || {};
    return Object.keys(apps).map(function (id) {
      var app = apps[id];
      return { id: id, title: (app && app.title) || id, icon: (app && app.icon) || '📦' };
    });
  }

  function renderLauncherList(filter) {
    var list = document.getElementById('alList');
    if (!list) return;
    var q = (filter || '').trim().toLowerCase();
    alItems = getLauncherApps().filter(function (a) {
      if (!q) return true;
      return a.title.toLowerCase().indexOf(q) !== -1 || a.id.toLowerCase().indexOf(q) !== -1;
    });
    alIndex = 0;
    if (!alItems.length) {
      list.innerHTML = '<div class="al-empty">Sin resultados</div>';
      return;
    }
    list.innerHTML = '';
    alItems.forEach(function (a, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'al-item' + (i === 0 ? ' active' : '');
      b.innerHTML = '<span class="al-ico">' + a.icon + '</span><span>' + a.title + '</span>';
      b.addEventListener('click', function () { launchFromLauncher(a.id); });
      list.appendChild(b);
    });
  }

  function highlightLauncher() {
    var list = document.getElementById('alList');
    if (!list) return;
    Array.prototype.forEach.call(list.querySelectorAll('.al-item'), function (el, i) {
      el.classList.toggle('active', i === alIndex);
    });
    var active = list.querySelector('.al-item.active');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }

  function launchFromLauncher(id) {
    closeAppLauncher();
    try {
      if (typeof window.openApp === 'function') window.openApp(id);
    } catch (e) { console.warn(e); }
  }

  function openAppLauncher() {
    if (!window.currentUser) return;
    var box = document.getElementById('appLauncher');
    if (!box) return;
    closeQsPanel();
    closeWpPanel();
    closeStartMenuSafe();
    box.classList.add('open');
    box.setAttribute('aria-hidden', 'false');
    renderLauncherList('');
    var inp = document.getElementById('alInput');
    if (inp) {
      inp.value = '';
      setTimeout(function () { inp.focus(); }, 30);
    }
  }

  function toggleAppLauncher() {
    var box = document.getElementById('appLauncher');
    if (box && box.classList.contains('open')) closeAppLauncher();
    else openAppLauncher();
  }

  function onDesktopKeydown(e) {
    if (document.body.classList.contains('account-soft-locked') || isAccountSoftLocked()) {
      // Solo la pantalla de bloqueo recibe teclado (input de contraseña)
      var lock = document.getElementById('qsSoftLock');
      if (lock && lock.contains(e.target)) return;
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    var desktop = document.getElementById('desktop');
    if (!desktop || desktop.classList.contains('hidden')) return;
    var launcherEl = document.getElementById('appLauncher');
    var launcherOpen = launcherEl && launcherEl.classList.contains('open');

    if (e.key === 'Escape') {
      if (launcherOpen) { e.preventDefault(); closeAppLauncher(); return; }
      closeQsPanel();
      closeWpPanel();
      return;
    }

    if (launcherOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (alItems.length) { alIndex = (alIndex + 1) % alItems.length; highlightLauncher(); }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (alItems.length) { alIndex = (alIndex - 1 + alItems.length) % alItems.length; highlightLauncher(); }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (alItems[alIndex]) launchFromLauncher(alItems[alIndex].id);
        return;
      }
      return;
    }

    var mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (isTypingTarget(e.target) && !(e.key === ' ' && mod)) return;

    var k = (e.key || '').toLowerCase();
    if (k === ' ' || k === 'k') { e.preventDefault(); toggleAppLauncher(); return; }
    if (k === 'e') {
      e.preventDefault();
      if (typeof window.openApp === 'function') window.openApp('explorer');
      return;
    }
    if (k === 'n') {
      e.preventDefault();
      if (typeof window.openApp === 'function') window.openApp('notes');
      return;
    }
    if (k === 't' && !e.shiftKey) { e.preventDefault(); toggleTheme(); return; }
    if (k === 's' && e.shiftKey) { e.preventDefault(); takeDesktopScreenshot(); return; }
  }

  function tickClockMadrid() {
    var el = document.getElementById('clock');
    if (!el) return;
    var now = new Date();
    var optsDate = { timeZone: 'Europe/Madrid', weekday: 'short', day: '2-digit', month: 'short' };
    var optsTime = { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    var optsShort = { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' };
    var en = !!(window.snakeI18n && window.snakeI18n.lang === 'en'); var loc = en ? 'en-GB' : 'es-ES';
    var dateStr = now.toLocaleDateString(loc, optsDate);
    var timeStr = now.toLocaleTimeString(loc, optsTime);
    var timeShort = now.toLocaleTimeString(loc, optsShort);
    if (dateStr) dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    var phone = false;
    try { phone = document.body.classList.contains('phone-mode'); } catch (e) {}
    var shown = phone ? timeShort : timeStr;
    var html = '<span class="clk-date">' + dateStr + ' · Madrid</span><span class="clk-time">' + shown + '</span>';
    if (el.__clk !== html) { el.__clk = html; el.innerHTML = html; }
    el.title = (en ? 'Quick settings · Madrid ' : 'Ajustes rápidos · Madrid ') + dateStr + ' ' + timeStr;
  }

  function patchTickClock() {
    // Override inline tickClock if present
    try {
      if (typeof window.tickClock === 'function' || true) {
        window.tickClock = tickClockMadrid;
      }
    } catch (e) {}
    tickClockMadrid();
    setInterval(tickClockMadrid, 1000);
  }

  function initDesktopExtras() {
    applyTheme(desktopPrefs.theme);
    syncWallpaperForProfile();
    syncQsForProfile();
    syncQsUi();
    maybeRestoreAccountLock();
    ensureAutoThemeWatcher();
    patchTickClock();

    var searchBtn = document.getElementById('tbSearchBtn');
    var shotBtn = document.getElementById('tbShotBtn');
    var wpBtn = document.getElementById('tbWpBtn');
    var qsBtn = document.getElementById('tbQsBtn');
    if (searchBtn) searchBtn.addEventListener('click', function () { toggleAppLauncher(); });
    if (shotBtn) shotBtn.addEventListener('click', function () { takeDesktopScreenshot(); });
    if (wpBtn) wpBtn.addEventListener('click', function (e) { e.stopPropagation(); if (window.snkOsxWallpaperLocked && window.snkOsxWallpaperLocked()) return; toggleWpPanel(); });
    if (qsBtn) qsBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleQsPanel(); });

    var clock = document.getElementById('clock');
    if (clock) {
      clock.style.cursor = 'pointer';
      clock.title = 'Ajustes rápidos (solo tu cuenta)';
      clock.setAttribute('role', 'button');
      clock.setAttribute('tabindex', '0');
      clock.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleQsPanel();
      });
      clock.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          toggleQsPanel();
        }
      });
    }

    var qsDnd = document.getElementById('qsDnd');
    var qsFocus = document.getElementById('qsFocus');
    var qsPerf = document.getElementById('qsPerf');
    var qsCompact = document.getElementById('qsCompact');
    if (qsDnd) qsDnd.addEventListener('click', function () { toggleQsPref('dnd'); });
    if (qsFocus) qsFocus.addEventListener('click', function () { toggleQsPref('focus'); });
    if (qsPerf) qsPerf.addEventListener('click', function () { toggleQsPref('perf'); });
    if (qsCompact) qsCompact.addEventListener('click', function () { toggleQsPref('compact'); });

    var qsCloseApps = document.getElementById('qsCloseApps');
    var qsFullscreen = document.getElementById('qsFullscreen');
    var qsLock = document.getElementById('qsLock');
    var qsDeskCode = document.getElementById('qsDeskCode');
    if (qsCloseApps) qsCloseApps.addEventListener('click', qsCloseAllApps);
    if (qsFullscreen) qsFullscreen.addEventListener('click', qsToggleFullscreen);
    if (qsLock) qsLock.addEventListener('click', softLockDesktop);
    if (qsDeskCode) qsDeskCode.addEventListener('click', qsCopyDeskCode);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refreshAutoTheme();
    });
    window.addEventListener('focus', refreshAutoTheme);

    var alInput = document.getElementById('alInput');
    if (alInput) {
      alInput.addEventListener('input', function () { renderLauncherList(alInput.value); });
    }

    document.addEventListener('keydown', onDesktopKeydown);
    document.addEventListener('click', function (e) {
      var t = e.target;
      var qs = document.getElementById('qsPanel');
      var wp = document.getElementById('wpPanel');
      if (qs && qs.classList.contains('open')) {
        if (!(qs.contains(t) || (t && (t.id === 'tbQsBtn' || t.id === 'clock' || (t.closest && t.closest('#clock')))))) {
          closeQsPanel();
        }
      }
      if (wp && wp.classList.contains('open')) {
        if (!(wp.contains(t) || (t && t.id === 'tbWpBtn'))) {
          closeWpPanel();
        }
      }
    });
    var launcher = document.getElementById('appLauncher');
    if (launcher) {
      launcher.addEventListener('click', function (e) {
        if (e.target === launcher) closeAppLauncher();
      });
    }
  }

  // Expose APPS for launcher once main script defines it
  function exposeAppsBridge() {
    // Poll briefly until APPS exists on window — main may assign late
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      try {
        // Access from parent scope is not possible; main should set window.APPS
        if (window.APPS) { clearInterval(iv); }
      } catch (e) {}
      if (tries > 50) clearInterval(iv);
    }, 100);
  }

  try { window.snkToast = showShotToast; } catch (eTo) {}
  try { applyTheme(desktopPrefs.theme); paintWallpaper(desktopPrefs.wallpaper || 'snake-vivid'); bindWallpaperUpload(); } catch (e) {}
  setInterval(function () {
    syncWallpaperForProfile();
    syncQsForProfile();
    maybeRestoreAccountLock();
  }, 30000);
  /* al entrar o cambiar de perfil: fondo, tema y ajustes rápidos de ESE perfil al instante */
  window.addEventListener('snk:profile', function () { try { syncWallpaperForProfile(); syncQsForProfile(); syncQsUi(); } catch (e) {} });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initDesktopExtras();
      exposeAppsBridge();
    });
  } else {
    initDesktopExtras();
    exposeAppsBridge();
  }

  window.__snakeOsDesktopExtras = {
    toggleTheme: toggleTheme,
    takeDesktopScreenshot: takeDesktopScreenshot,
    openAppLauncher: openAppLauncher,
    applyWallpaper: applyWallpaper,
    syncWallpaperForProfile: syncWallpaperForProfile,
    pullDesktopPrefsFromServer: pullDesktopPrefsFromServer
  };
})();

/* ===== Actualización 2026-10-09: transiciones de ventanas, menú Inicio y ajuste a los bordes ===== */
(function () {
  'use strict';
  if (window.__snkUpd20261009) return;
  window.__snkUpd20261009 = true;

  function reducedMotion() {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    } catch (e) {}
    return !!(document.body && (document.body.classList.contains('qs-perf') || document.body.classList.contains('snk-reduce-motion')));
  }
  function phoneMode() {
    return !!(document.body && document.body.classList.contains('phone-mode'));
  }

  function injectCss() {
    if (document.getElementById('snk-upd-20261009-css')) return;
    var st = document.createElement('style');
    st.id = 'snk-upd-20261009-css';
    st.textContent =
      /* Minimizar hacia el botón de la barra de tareas */
      '.app-window.minimized.snk-genie{transform:scale(0.16);}' +
      /* Maximizar / restaurar / ajustar con animación de tamaño */
      '.app-window.snk-geo{transition:left .26s cubic-bezier(0.22,1,0.36,1),top .26s cubic-bezier(0.22,1,0.36,1),' +
        'width .26s cubic-bezier(0.22,1,0.36,1),height .26s cubic-bezier(0.22,1,0.36,1),' +
        'opacity var(--dur) var(--ease-out),transform var(--dur) var(--ease-out),border-radius .2s ease,box-shadow var(--dur) ease !important;}' +
      /* Menú Inicio: elementos que entran en cascada */
      '@keyframes snkStartItemIn{from{opacity:0;transform:translateX(-10px);}to{opacity:1;transform:none;}}' +
      '#startMenu.open.snk-stagger > .start-item,#startMenu.open.snk-stagger > .start-sep{animation:snkStartItemIn .3s cubic-bezier(0.22,1,0.36,1) backwards;animation-delay:calc(var(--snk-i,0) * 14ms);}' +
      /* Vista previa al arrastrar una ventana al borde */
      '#snkSnapPreview{position:fixed;z-index:999;pointer-events:none;border-radius:18px;opacity:0;' +
        'background:rgba(52,209,122,0.16);border:2px solid rgba(157,255,194,0.75);box-shadow:0 0 0 1px rgba(0,0,0,0.15),0 10px 40px rgba(52,209,122,0.25);' +
        'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transform:scale(0.96);' +
        'transition:opacity .18s ease,transform .22s cubic-bezier(0.22,1,0.36,1),left .18s ease,width .18s ease;}' +
      '#snkSnapPreview.show{opacity:1;transform:scale(1);}' +
      '@media (prefers-reduced-motion: reduce){#startMenu.open.snk-stagger > *{animation:none !important;}.app-window.snk-geo{transition:none !important;}#snkSnapPreview{transition:none;}}';
    document.head.appendChild(st);
  }

  /* --- Minimizar / restaurar hacia el botón de la barra de tareas --- */
  function setGenieOrigin(win) {
    var appId = (win.id || '').replace(/^win-/, '');
    var task = document.getElementById('task-' + appId);
    var layer = document.getElementById('windows');
    if (!task || !layer) return false;
    var tr = task.getBoundingClientRect();
    if (!tr.width || !tr.height) return false;
    var lr = layer.getBoundingClientRect();
    var wl = lr.left + win.offsetLeft;
    var wt = lr.top + win.offsetTop;
    var ox = (tr.left + tr.width / 2) - wl;
    var oy = (tr.top + tr.height / 2) - wt;
    win.style.transformOrigin = Math.round(ox) + 'px ' + Math.round(oy) + 'px';
    return true;
  }
  function clearGenieLater(win) {
    clearTimeout(win._snkGenieT);
    win._snkGenieT = setTimeout(function () {
      if (win.classList.contains('minimized')) return;
      win.classList.remove('snk-genie');
      win.style.transformOrigin = '';
    }, 360);
  }

  /* --- Animación de tamaño (maximizar / restaurar / ajustar) --- */
  function geoAnimate(win) {
    if (reducedMotion() || phoneMode()) return;
    win.classList.add('snk-geo');
    clearTimeout(win._snkGeoT);
    win._snkGeoT = setTimeout(function () { win.classList.remove('snk-geo'); }, 330);
  }

  function watchWindows() {
    var layer = document.getElementById('windows');
    if (!layer || layer._snkWatched) return;
    layer._snkWatched = true;
    var mo = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        var win = m.target;
        if (!win.classList || !win.classList.contains('app-window')) return;
        var oldCls = ' ' + (m.oldValue || '') + ' ';
        var wasMin = oldCls.indexOf(' minimized ') !== -1;
        var isMin = win.classList.contains('minimized');
        var wasMax = oldCls.indexOf(' maximized ') !== -1;
        var isMax = win.classList.contains('maximized');
        if (isMin && !wasMin) {
          if (!reducedMotion() && setGenieOrigin(win)) {
            clearTimeout(win._snkGenieT);
            win.classList.add('snk-genie');
          }
        } else if (!isMin && wasMin) {
          if (win.classList.contains('snk-genie')) clearGenieLater(win);
        }
        if (isMax !== wasMax && !isMin && !wasMin && !win.classList.contains('win-appear')) {
          geoAnimate(win);
        }
      });
    });
    mo.observe(layer, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  }

  /* --- Menú Inicio en cascada --- */
  function watchStartMenu() {
    var sm = document.getElementById('startMenu');
    if (!sm || sm._snkWatched) return;
    sm._snkWatched = true;
    var wasOpen = sm.classList.contains('open');
    var mo = new MutationObserver(function () {
      var isOpen = sm.classList.contains('open');
      if (isOpen && !wasOpen) {
        sm.classList.remove('snk-stagger');
        if (!reducedMotion()) {
          var kids = sm.children;
          for (var i = 0; i < kids.length; i++) kids[i].style.setProperty('--snk-i', String(Math.min(i, 18)));
          void sm.offsetWidth;
          sm.classList.add('snk-stagger');
        }
      }
      wasOpen = isOpen;
    });
    mo.observe(sm, { attributes: true, attributeFilter: ['class'] });
  }

  /* --- Ajustar ventanas a la mitad de la pantalla arrastrándolas al borde --- */
  var snap = null;
  var EDGE = 8;
  function previewEl() {
    var el = document.getElementById('snkSnapPreview');
    if (!el) {
      el = document.createElement('div');
      el.id = 'snkSnapPreview';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    return el;
  }
  function zoneRect(zone) {
    var layer = document.getElementById('windows');
    var lr = layer.getBoundingClientRect();
    var half = Math.round(lr.width / 2);
    return {
      layerLeft: lr.left, layerTop: lr.top,
      left: zone === 'right' ? lr.width - half : 0,
      top: 0, width: zone === 'top' ? Math.round(lr.width) : half, height: Math.round(lr.height)
    };
  }
  function showPreview(zone) {
    var el = previewEl();
    if (!zone) { el.classList.remove('show'); return; }
    var r = zoneRect(zone);
    el.style.left = (r.layerLeft + r.left + 6) + 'px';
    el.style.top = (r.layerTop + r.top + 6) + 'px';
    el.style.width = Math.max(0, r.width - 12) + 'px';
    el.style.height = Math.max(0, r.height - 12) + 'px';
    el.classList.add('show');
  }
  function watchSnap() {
    var layer = document.getElementById('windows');
    if (!layer || layer._snkSnap) return;
    layer._snkSnap = true;
    layer.addEventListener('pointerdown', function (e) {
      snap = null;
      if (phoneMode() || (e.button != null && e.button !== 0)) return;
      var bar = e.target.closest && e.target.closest('.win-titlebar');
      if (!bar || e.target.closest('.win-btn')) return;
      var win = bar.closest('.app-window');
      if (!win || win.classList.contains('maximized')) return;
      snap = { win: win, x: e.clientX, y: e.clientY, moved: false, zone: null };
    });
    window.addEventListener('pointermove', function (e) {
      if (!snap) return;
      if (!snap.moved && Math.abs(e.clientX - snap.x) + Math.abs(e.clientY - snap.y) < 10) return;
      snap.moved = true;
      snap.lastX = e.clientX;
      snap.lastY = e.clientY;
      var zone = null;
      if (e.clientX <= EDGE) zone = 'left';
      else if (e.clientX >= window.innerWidth - EDGE) zone = 'right';
      else if (e.clientY <= EDGE) zone = 'top';
      if (zone !== snap.zone) { snap.zone = zone; showPreview(zone); }
    });
    function finish() {
      if (!snap) return;
      var s = snap;
      snap = null;
      showPreview(null);
      if (!s.moved || !s.zone || !s.win.isConnected || phoneMode()) return;
      if (s.win.classList.contains('maximized') || s.win.classList.contains('minimized')) return;
      if (s.zone === 'top') {
        if (Math.abs(s.lastX - s.x) + Math.abs(s.lastY - s.y) < 20) return;
        var maxBtn = s.win.querySelector('.win-btn.max');
        if (maxBtn) maxBtn.click();
        return;
      }
      var r = zoneRect(s.zone);
      geoAnimate(s.win);
      s.win.style.left = r.left + 'px';
      s.win.style.top = r.top + 'px';
      s.win.style.width = r.width + 'px';
      s.win.style.height = r.height + 'px';
    }
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', function () { snap = null; showPreview(null); });
  }

  function init() {
    injectCss();
    watchWindows();
    watchStartMenu();
    watchSnap();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ===== Estilos de la Terminal (2026-10-09) — se guardan por perfil ===== */
(function () {
  'use strict';
  if (window.SnakeTermStyles) return;

  var KEY_PREFIX = 'snakeos_term_style_v1:';
  var DEFAULT_ID = 'snake';
  var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  function pal(a) {
    return {
      black: a[0], red: a[1], green: a[2], yellow: a[3], blue: a[4], magenta: a[5], cyan: a[6], white: a[7],
      brightBlack: a[8], brightRed: a[9], brightGreen: a[10], brightYellow: a[11], brightBlue: a[12],
      brightMagenta: a[13], brightCyan: a[14], brightWhite: a[15]
    };
  }
  function mk(o, palette) {
    var t = pal(palette);
    t.background = o.screen; t.foreground = o.fgX || o.fg; t.cursor = o.caret; t.cursorAccent = o.screen;
    t.selectionBackground = o.sel;
    o.xterm = t;
    return o;
  }

  var STYLES = [
    mk({ id: 'snake', label: '🐍 Snake', bg: 'linear-gradient(165deg,#050a08 0%,#0a1610 55%,#0c1a12 100%)', screen: '#07140f',
      fg: '#9dffc2', fgX: '#eafff0', cmd: '#eafff0', ok: '#7CFC9A', err: '#ff8a7a', muted: 'rgba(157,255,194,0.55)', prompt: '#34d17a',
      caret: '#34d17a', border: 'rgba(157,255,194,0.15)', inBg: 'rgba(0,0,0,0.28)', sel: 'rgba(52,209,122,0.35)', font: MONO, glow: 'none', scheme: 'dark' },
      ['#0b1a12', '#ff6b6b', '#34d17a', '#e5d36b', '#4fa3ff', '#c38bff', '#4fe0d0', '#d8f5e2',
       '#3c5a48', '#ff8a7a', '#7CFC9A', '#fff08a', '#7cbcff', '#d9b0ff', '#8af5e8', '#ffffff']),
    mk({ id: 'clasico', label: '⬛ Clásico', bg: '#0c0c0c', screen: '#0c0c0c',
      fg: '#cccccc', cmd: '#f2f2f2', ok: '#cccccc', err: '#e74856', muted: '#767676', prompt: '#f2f2f2',
      caret: '#ffffff', border: 'rgba(255,255,255,0.12)', inBg: 'rgba(255,255,255,0.04)', sel: 'rgba(255,255,255,0.28)', font: 'Consolas, "Cascadia Mono", ' + MONO, glow: 'none', scheme: 'dark' },
      ['#0c0c0c', '#c50f1f', '#13a10e', '#c19c00', '#0037da', '#881798', '#3a96dd', '#cccccc',
       '#767676', '#e74856', '#16c60c', '#f9f1a5', '#3b78ff', '#b4009e', '#61d6d6', '#f2f2f2']),
    mk({ id: 'hacker', label: '💚 Hacker', bg: '#000000', screen: '#000000',
      fg: '#33ff66', cmd: '#b6ffc8', ok: '#33ff66', err: '#ff3355', muted: 'rgba(51,255,102,0.5)', prompt: '#00ff41',
      caret: '#00ff41', border: 'rgba(0,255,65,0.25)', inBg: 'rgba(0,255,65,0.05)', sel: 'rgba(0,255,65,0.3)', font: '"Courier New", ' + MONO,
      glow: '0 0 4px rgba(51,255,102,0.55)', scheme: 'dark' },
      ['#000000', '#ff3355', '#00ff41', '#c8ff00', '#00c8ff', '#ff00ff', '#00ffcc', '#b6ffc8',
       '#0f5f24', '#ff6680', '#5cff85', '#e1ff66', '#66dcff', '#ff66ff', '#66ffe0', '#eaffef']),
    mk({ id: 'ambar', label: '🟠 Retro ámbar', bg: 'radial-gradient(ellipse at center,#1a0f00 0%,#0d0700 100%)', screen: '#100900',
      fg: '#ffb000', cmd: '#ffd27a', ok: '#ffb000', err: '#ff5a36', muted: 'rgba(255,176,0,0.5)', prompt: '#ffcc33',
      caret: '#ffb000', border: 'rgba(255,176,0,0.22)', inBg: 'rgba(255,176,0,0.05)', sel: 'rgba(255,176,0,0.3)', font: '"Courier New", ' + MONO,
      glow: '0 0 3px rgba(255,176,0,0.45)', scheme: 'dark' },
      ['#100900', '#ff5a36', '#ffb000', '#ffcc33', '#d98c00', '#ff8c42', '#ffc266', '#ffd27a',
       '#5c3d00', '#ff7a5c', '#ffc233', '#ffe08a', '#ffa733', '#ffad7a', '#ffd699', '#fff0cc']),
    mk({ id: 'oceano', label: '🌊 Océano', bg: 'linear-gradient(165deg,#21222c 0%,#282a36 60%,#2d2540 100%)', screen: '#282a36',
      fg: '#f8f8f2', cmd: '#ffffff', ok: '#50fa7b', err: '#ff5555', muted: '#6272a4', prompt: '#bd93f9',
      caret: '#ff79c6', border: 'rgba(189,147,249,0.25)', inBg: 'rgba(0,0,0,0.2)', sel: 'rgba(68,71,90,0.85)', font: MONO, glow: 'none', scheme: 'dark' },
      ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2',
       '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff']),
    mk({ id: 'claro', label: '☀️ Claro', bg: '#fafafa', screen: '#ffffff',
      fg: '#383a42', cmd: '#1f2329', ok: '#2f8a3b', err: '#d33a2c', muted: '#8a8f98', prompt: '#1f9e57',
      caret: '#1f9e57', border: 'rgba(0,0,0,0.12)', inBg: 'rgba(0,0,0,0.04)', sel: 'rgba(31,158,87,0.22)', font: MONO, glow: 'none', scheme: 'light' },
      ['#383a42', '#e45649', '#50a14f', '#c18401', '#0184bc', '#a626a4', '#0997b3', '#e5e5e6',
       '#a0a1a7', '#e06c75', '#4fb35c', '#d19a2a', '#4078f2', '#c678dd', '#56b6c2', '#ffffff'])
  ];
  var BY_ID = {};
  STYLES.forEach(function (s) { BY_ID[s.id] = s; });

  function profileKey() {
    var u = window.currentUser;
    var email = u && u.email ? String(u.email).trim().toLowerCase() : '';
    return KEY_PREFIX + (email && email.indexOf('@') > 0 ? email : 'invitado');
  }
  function currentId() {
    try {
      var v = localStorage.getItem(profileKey());
      if (v && BY_ID[v]) return v;
    } catch (e) {}
    return DEFAULT_ID;
  }
  function saveId(id) {
    try { localStorage.setItem(profileKey(), id); } catch (e) {}
  }
  function get(id) { return BY_ID[id] || BY_ID[DEFAULT_ID]; }

  function injectCss() {
    if (document.getElementById('snk-term-styles-css')) return;
    var st = document.createElement('style');
    st.id = 'snk-term-styles-css';
    st.textContent =
      '.term-wrap.snk-ts{position:relative;background:var(--ts-bg);color:var(--ts-fg);font-family:var(--ts-font);color-scheme:var(--ts-scheme);transition:background .25s ease,color .25s ease;}' +
      '.term-wrap.snk-ts .term-out{text-shadow:var(--ts-glow);}' +
      '.term-wrap.snk-ts .term-out .term-cmd{color:var(--ts-cmd);}' +
      '.term-wrap.snk-ts .term-out .term-ok{color:var(--ts-ok);}' +
      '.term-wrap.snk-ts .term-out .term-err{color:var(--ts-err);}' +
      '.term-wrap.snk-ts .term-out .term-muted{color:var(--ts-muted);}' +
      '.term-wrap.snk-ts .term-in-row{border-top-color:var(--ts-border);background:var(--ts-in-bg);}' +
      '.term-wrap.snk-ts .term-prompt{color:var(--ts-prompt);text-shadow:var(--ts-glow);}' +
      '.term-wrap.snk-ts .term-input{color:var(--ts-cmd);caret-color:var(--ts-caret);text-shadow:var(--ts-glow);}' +
      '.term-wrap.snk-ts .term-input::placeholder{color:var(--ts-muted);opacity:.75;}' +
      '.term-wrap.snk-ts .term-ssh-bar{color:var(--ts-prompt);}' +
      '.term-wrap.snk-ts .term-ssh-screen{background:var(--ts-screen);border-color:var(--ts-border);}' +
      '.term-wrap.snk-ts .term-ssh-screen .xterm-rows{text-shadow:var(--ts-glow);}' +
      '.term-style-bar{flex-shrink:0;display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:6px 10px;' +
        'border-bottom:1px solid var(--ts-border,rgba(157,255,194,0.15));background:var(--ts-in-bg,rgba(0,0,0,0.28));font-size:0.72rem;font-weight:700;}' +
      '.term-style-bar label{display:flex;align-items:center;gap:6px;margin:0;color:var(--ts-prompt,#34d17a);cursor:pointer;white-space:nowrap;}' +
      '.app-window .win-body .term-style-bar select,.term-style-bar select{margin:0 !important;width:auto !important;min-width:0;max-width:170px;padding:3px 8px !important;' +
        'height:auto;border-radius:8px;font:inherit;font-weight:700;font-size:0.72rem;cursor:pointer;' +
        'background:var(--ts-screen,#07140f);color:var(--ts-fg,#9dffc2);border:1px solid var(--ts-border,rgba(157,255,194,0.3));}' +
      'body.phone-mode .term-style-bar{padding:6px 8px;}' +
      'body.phone-mode .term-style-bar select{font-size:0.8rem;padding:5px 8px !important;}';
    document.head.appendChild(st);
  }

  function applyToWrap(wrap, s) {
    if (!wrap) return;
    wrap.classList.add('snk-ts');
    wrap.setAttribute('data-term-style', s.id);
    var vars = {
      '--ts-bg': s.bg, '--ts-fg': s.fg, '--ts-cmd': s.cmd, '--ts-ok': s.ok, '--ts-err': s.err, '--ts-muted': s.muted,
      '--ts-prompt': s.prompt, '--ts-caret': s.caret, '--ts-border': s.border, '--ts-in-bg': s.inBg,
      '--ts-screen': s.screen, '--ts-font': s.font, '--ts-glow': s.glow, '--ts-scheme': s.scheme
    };
    Object.keys(vars).forEach(function (k) { wrap.style.setProperty(k, vars[k]); });
  }
  function applyToXterm(term, s) {
    if (!term || !term.options) return;
    try {
      term.options.theme = s.xterm;
      term.options.fontFamily = s.font;
    } catch (e) {}
  }

  function xtermOptions() {
    var s = get(currentId());
    return { theme: s.xterm, fontFamily: s.font };
  }

  function mount(wrap, getTerm) {
    if (!wrap) return null;
    injectCss();
    var s = get(currentId());
    applyToWrap(wrap, s);
    var bar = document.createElement('div');
    bar.className = 'term-style-bar';
    var label = document.createElement('label');
    label.textContent = '🎨 Estilo';
    label.title = 'Cambiar el estilo de la terminal (solo para tu perfil)';
    var sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Estilo de la terminal');
    STYLES.forEach(function (st) {
      var o = document.createElement('option');
      o.value = st.id; o.textContent = st.label;
      sel.appendChild(o);
    });
    sel.value = s.id;
    sel.addEventListener('change', function () {
      var ns = get(sel.value);
      saveId(ns.id);
      applyToWrap(wrap, ns);
      applyToXterm(typeof getTerm === 'function' ? getTerm() : null, ns);
      var t = typeof getTerm === 'function' ? getTerm() : null;
      if (t && typeof t.focus === 'function') { try { t.focus(); } catch (e) {} }
    });
    label.appendChild(sel);
    bar.appendChild(label);
    wrap.insertBefore(bar, wrap.firstChild);
    return { select: sel, refresh: function () { var cs = get(currentId()); sel.value = cs.id; applyToWrap(wrap, cs); applyToXterm(typeof getTerm === 'function' ? getTerm() : null, cs); } };
  }

  window.SnakeTermStyles = { styles: STYLES, mount: mount, xtermOptions: xtermOptions, currentId: currentId };
})();

/* ===== Gran actualización 1 (2026-10-09): escritorio, ventanas, menú Inicio, barra de tareas y ajustes ===== */
(function () {
  'use strict';
  if (window.__snkBigUpd1) return;
  window.__snkBigUpd1 = true;


  (function injectShellCss(){
    if (document.getElementById('snk-bigupd1-css')) return;
    var st = document.createElement('style');
    st.id = 'snk-bigupd1-css';
    st.textContent = "/* Ventanas: foco */\nbody:not(.phone-mode) .app-window.snk-focused{box-shadow:0 22px 60px rgba(0,0,0,0.42),0 0 0 1px rgba(255,255,255,0.22),var(--glass-shadow,0 0 0 transparent);}\nbody:not(.phone-mode) .app-window.snk-unfocused{box-shadow:0 10px 28px rgba(0,0,0,0.26);}\nbody:not(.phone-mode) .app-window.snk-unfocused .win-titlebar{background:rgba(255,255,255,0.07);}\nbody:not(.phone-mode) .app-window.snk-unfocused .win-title{opacity:0.62;}\nbody:not(.phone-mode) .app-window.snk-unfocused .win-controls{opacity:0.55;}\nbody:not(.phone-mode) .app-window.snk-unfocused:hover .win-controls{opacity:1;}\n.app-window .win-title,.app-window .win-controls{transition:opacity .18s ease;}\n.app-window .win-title{display:flex;align-items:center;gap:6px;min-width:0;}\n.app-window .win-title .app-icon-img{flex-shrink:0;}\n.win-titlebar{gap:10px;}\n/* Escritorio: iconos */\n.desktop-icon{border-radius:14px;}\n.desktop-icon:hover{background:rgba(255,255,255,0.13);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.22);}\n.desktop-icon:focus-visible{outline:2px solid #9dffc2;outline-offset:2px;}\n.desktop-icon:active{transform:scale(0.96);}\n.desktop-icon .lb{text-shadow:0 1px 4px rgba(0,0,0,0.55);}\nbody.theme-light .desktop-icon:hover{background:rgba(255,255,255,0.45);box-shadow:inset 0 0 0 1px rgba(0,0,0,0.08);}\n/* Menú contextual */\n#snkCtxMenu{position:fixed;z-index:200000;min-width:220px;width:max-content;max-width:calc(100vw - 16px);padding:6px;border-radius:16px;display:none;flex-direction:column;gap:1px;\n  background:rgba(18,32,24,0.82);border:1px solid rgba(255,255,255,0.28);color:#fff;\n  backdrop-filter:blur(26px) saturate(180%);-webkit-backdrop-filter:blur(26px) saturate(180%);box-shadow:0 18px 50px rgba(0,0,0,0.45);\n  transform-origin:top left;animation:snkPop .16s cubic-bezier(0.22,1,0.36,1);}\n#snkCtxMenu.open{display:flex;}\n@keyframes snkPop{from{opacity:0;transform:scale(0.95);}to{opacity:1;transform:none;}}\n.snk-ctx-item{margin:0 !important;width:100% !important;display:flex;align-items:center;gap:10px;text-align:left;padding:8px 10px !important;border:0 !important;border-radius:10px !important;\n  background:transparent !important;color:inherit !important;font-size:0.82rem;font-weight:600;cursor:pointer;box-shadow:none !important;min-height:0 !important;white-space:nowrap;}\n.snk-ctx-item:hover,.snk-ctx-item:focus-visible{background:rgba(52,209,122,0.28) !important;outline:none;}\n.snk-ctx-ico{width:20px;text-align:center;flex-shrink:0;}\n.snk-ctx-sep{height:1px;margin:4px 6px;background:rgba(255,255,255,0.18);}\nbody.theme-light #snkCtxMenu{background:rgba(255,255,255,0.86);color:#0d2818;border-color:rgba(0,0,0,0.12);}\nbody.theme-light .snk-ctx-sep{background:rgba(0,0,0,0.1);}\nbody.theme-light .snk-ctx-item:hover{background:rgba(52,209,122,0.22) !important;}\n/* Selector de apps */\n#snkSwitcher{position:fixed;inset:0;z-index:200001;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.28);}\n#snkSwitcher.open{display:flex;}\n.snk-sw-box{max-width:min(720px,92vw);padding:16px;border-radius:22px;background:rgba(14,26,20,0.86);border:1px solid rgba(255,255,255,0.28);color:#fff;\n  backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);box-shadow:0 24px 70px rgba(0,0,0,0.5);animation:snkPop .16s cubic-bezier(0.22,1,0.36,1);}\n.snk-sw-title{font-weight:800;font-size:0.85rem;margin-bottom:10px;}\n.snk-sw-list{display:flex;flex-wrap:wrap;gap:8px;}\n.snk-sw-item{margin:0 !important;width:auto !important;display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:10px 14px !important;min-width:130px;max-width:220px;\n  border-radius:14px !important;border:1px solid rgba(255,255,255,0.18) !important;background:rgba(255,255,255,0.08) !important;color:#fff !important;cursor:pointer;text-align:left;}\n.snk-sw-item.sel{border-color:#9dffc2 !important;background:rgba(52,209,122,0.3) !important;box-shadow:0 0 0 2px rgba(52,209,122,0.35);}\n.snk-sw-name{display:flex;align-items:center;gap:6px;font-weight:700;font-size:0.8rem;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}\n.snk-sw-name .app-icon-img{width:18px;height:18px;}\n.snk-sw-min{font-size:0.66rem;opacity:0.7;}\n.snk-sw-hint{margin-top:10px;font-size:0.68rem;opacity:0.7;}\n/* Menú Inicio */\n#startMenu .snk-sm-search{padding:2px 2px 6px;}\n#startMenu .snk-sm-search input{margin:0 !important;width:100% !important;box-sizing:border-box;padding:8px 12px !important;border-radius:12px !important;font-size:0.8rem;\n  background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.3);color:#fff;min-height:0;}\n#startMenu .snk-sm-search input::placeholder{color:rgba(255,255,255,0.6);}\nbody.theme-light #startMenu .snk-sm-search input{background:rgba(255,255,255,0.7);color:#0d2818;border-color:rgba(0,0,0,0.15);}\nbody.theme-light #startMenu .snk-sm-search input::placeholder{color:rgba(13,40,24,0.5);}\n.snk-sm-label{font-size:0.64rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;opacity:0.7;padding:6px 10px 3px;}\n.snk-sm-chips{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:0 2px 4px;}\n.snk-sm-chip{margin:0 !important;width:100% !important;display:flex;align-items:center;gap:6px;padding:7px 8px !important;border-radius:10px !important;font-size:0.74rem;font-weight:600;\n  background:rgba(255,255,255,0.1) !important;border:1px solid rgba(255,255,255,0.16) !important;color:inherit !important;box-shadow:none !important;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;cursor:pointer;}\n.snk-sm-chip:hover{background:rgba(52,209,122,0.25) !important;}\n.snk-sm-chip .app-icon-img{width:18px;height:18px;flex-shrink:0;}\nbody.theme-light .snk-sm-chip{background:rgba(255,255,255,0.5) !important;border-color:rgba(0,0,0,0.1) !important;}\n#startMenu .snk-hidden{display:none !important;}\n.snk-sm-none{display:none;padding:10px;font-size:0.75rem;opacity:0.75;text-align:center;}\n.snk-sm-none.show{display:block;}\n.snk-sm-foot{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:4px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.22);}\nbody.theme-light .snk-sm-foot{border-top-color:rgba(0,0,0,0.1);}\n.snk-sm-foot .start-item{width:auto !important;flex:1 1 0;min-width:0;text-align:center;padding:8px 6px !important;font-size:0.74rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}\n.snk-sm-foot .snk-sm-profile{flex:1 1 100%;}\nbody.theme-light #startMenu .start-item.poweroff{color:#9a5200;}\nbody.theme-light #startMenu .start-item.logout{color:#b3261e;}\nbody.theme-light .snk-sm-profile:hover{background:rgba(255,255,255,0.5) !important;}\n.snk-sm-profile{margin:0 !important;flex:1 1 auto;min-width:0;width:auto !important;display:flex;align-items:center;gap:7px;padding:6px 8px !important;border-radius:12px !important;\n  background:transparent !important;border:0 !important;box-shadow:none !important;color:inherit !important;font-size:0.76rem;font-weight:700;cursor:pointer;text-align:left;}\n.snk-sm-profile:hover{background:rgba(255,255,255,0.14) !important;}\n.snk-sm-av{width:24px;height:24px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:rgba(0,0,0,0.2);font-size:0.9rem;}\n.snk-sm-av img{width:100%;height:100%;object-fit:cover;}\n.snk-sm-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n/* Barra de tareas */\n.task-item{position:relative;}\n.task-item[data-badge]{padding-right:24px !important;}\n.task-item[data-badge]::after{content:attr(data-badge);position:absolute;top:50%;right:5px;margin-top:-7.5px;min-width:15px;height:15px;padding:0 4px;box-sizing:border-box;border-radius:999px;\n  background:#ff4d5e;color:#fff;font-size:0.58rem;font-weight:800;line-height:15px;text-align:center;box-shadow:0 0 0 2px rgba(0,0,0,0.25);pointer-events:none;}\nbody.qs-dnd .task-item[data-badge]::after{display:none;}\n#snkTip{position:fixed;z-index:200002;pointer-events:none;max-width:320px;padding:6px 10px;border-radius:10px;font-size:0.72rem;font-weight:600;line-height:1.3;\n  background:rgba(10,20,15,0.92);color:#fff;border:1px solid rgba(255,255,255,0.2);box-shadow:0 8px 24px rgba(0,0,0,0.35);opacity:0;transform:translateY(3px);\n  transition:opacity .14s ease,transform .14s ease;}\n#snkTip.show{opacity:1;transform:none;}\nbody.theme-light #snkTip{background:rgba(255,255,255,0.96);color:#0d2818;border-color:rgba(0,0,0,0.12);}\n#shotToast{max-width:calc(100vw - 32px);}\n/* Móviles estrechos: que el reloj quepa */\n@media (max-width:389px){\n  body.phone-mode #taskbar{padding:0 6px !important;gap:3px !important;}\n  body.phone-mode #taskbar .tb-tool{width:26px !important;height:26px !important;min-width:26px !important;max-width:26px !important;flex:0 0 26px !important;font-size:0.72rem !important;}\n  body.phone-mode #taskbar .notif-btn{width:28px !important;height:28px !important;min-width:28px !important;max-width:28px !important;flex:0 0 28px !important;}\n  body.phone-mode .tb-tools{gap:2px !important;}\n  body.phone-mode #startBtn{max-width:24vw;padding:6px 6px !important;font-size:0.66rem !important;}\n  body.phone-mode .task-item{max-width:72px;padding:5px 6px;}\n  body.phone-mode #clock{max-width:none !important;flex:0 0 auto;padding:2px 4px !important;}\n}\n@media (max-width:350px){\n  body.phone-mode #startBtn{font-size:0 !important;gap:0;padding:6px !important;}\n  body.phone-mode #startBtn .start-btn-logo{margin:0;}\n}\n/* Animaciones reducidas (ajuste por perfil) */\nbody.snk-reduce-motion *,body.snk-reduce-motion *::before,body.snk-reduce-motion *::after{animation-duration:0.001ms !important;animation-iteration-count:1 !important;transition-duration:0.001ms !important;transition-delay:0s !important;scroll-behavior:auto !important;}\n/* Centro de notificaciones */\n.notif-head-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;}\n.notif-dnd-btn{white-space:nowrap;}\n.notif-dnd-btn.on{color:#ffb4b4 !important;}\n.notif-group-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 4px 2px;font-size:0.66rem;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:#d7ffe6;opacity:0.9;}\n.notif-group-head:not(:first-child){margin-top:4px;}\n.notif-group-count{min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:999px;background:#ff4d5e;color:#fff;font-size:0.62rem;line-height:18px;text-align:center;letter-spacing:0;}\n.notif-card{position:relative;touch-action:pan-y;transition:transform .18s ease,opacity .18s ease;}\n.notif-card.dragging{transition:none;}\n.notif-card.leaving{opacity:0;transform:translateX(40px);}\n.notif-card .notif-item{width:100%;box-sizing:border-box;margin:0;padding-right:36px;}\n.notif-x{position:absolute;top:7px;right:7px;width:24px !important;height:24px !important;min-width:24px !important;margin:0 !important;padding:0 !important;border-radius:50% !important;\n  display:flex;align-items:center;justify-content:center;font-size:0.7rem;line-height:1;cursor:pointer;border:1px solid rgba(255,255,255,0.22) !important;\n  background:rgba(0,0,0,0.25) !important;color:#fff !important;opacity:0.7;box-shadow:none !important;}\n.notif-x:hover,.notif-x:focus-visible{opacity:1;background:rgba(255,77,94,0.6) !important;}\n.notif-empty-ico{font-size:2rem;margin-bottom:6px;opacity:0.85;}\n.notif-empty-title{font-weight:800;font-size:0.9rem;color:#eafff0;}\n.notif-empty-sub{font-size:0.76rem;margin-top:3px;}\nbody.theme-light .notif-group-head{color:#123024;}\nbody.theme-light .notif-empty-title{color:#0d2818;}\nbody.theme-light .notif-x{background:rgba(255,255,255,0.7) !important;color:#0d2818 !important;border-color:rgba(0,0,0,0.12) !important;}\n";
    (document.head || document.documentElement).appendChild(st);
  })();

  function $(id) { return document.getElementById(id); }
  function profileEmail() {
    var u = window.currentUser;
    var e = u && u.email ? String(u.email).trim().toLowerCase() : '';
    return e && e.indexOf('@') > 0 ? e : '';
  }
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function phoneMode() { return document.body.classList.contains('phone-mode'); }
  function desktopVisible() { var d = $('desktop'); return !!(d && !d.classList.contains('hidden')); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg) {
    var el = $('shotToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  /* ---------- Ajustes extra por perfil: tamaño de texto, sonidos, animaciones ---------- */
  var EXTRA_PREFIX = 'snakeos_qs_extra_v1:';
  var SOUND_LAST_KEY = 'snakeos_sounds_off_last_v1';
  var TEXT_SIZES = [
    { id: 'normal', label: 'Normal', px: '' },
    { id: 'grande', label: 'Grande', px: '17.5px' },
    { id: 'xl', label: 'Muy grande', px: '19px' }
  ];
  var extra = { text: 'normal', soundsOff: false, reduceMotion: false };
  var extraEmail = null;
  function loadExtra() {
    var e = profileEmail();
    var p = e ? lsGet(EXTRA_PREFIX + e, null) : null;
    extra = {
      text: p && TEXT_SIZES.some(function (t) { return t.id === p.text; }) ? p.text : 'normal',
      soundsOff: !!(p && p.soundsOff),
      reduceMotion: !!(p && p.reduceMotion)
    };
    extraEmail = e;
    applyExtra();
  }
  function saveExtra() {
    var e = profileEmail();
    if (e) lsSet(EXTRA_PREFIX + e, extra);
    lsSet(SOUND_LAST_KEY, !!extra.soundsOff);
  }
  function applyExtra() {
    var t = TEXT_SIZES.filter(function (x) { return x.id === extra.text; })[0] || TEXT_SIZES[0];
    document.documentElement.style.fontSize = t.px;
    document.body.classList.toggle('snk-reduce-motion', !!extra.reduceMotion);
    window.__snakeOsSoundsOff = !!extra.soundsOff;
    if (profileEmail()) lsSet(SOUND_LAST_KEY, !!extra.soundsOff);
    syncExtraTiles();
  }
  // Usado por la melodía de inicio de sesión (y otros sonidos del sistema)
  window.snakeOsSoundsMuted = function () {
    if (document.body && document.body.classList.contains('osx-work')) return true; // modo trabajo: sin sonidos del sistema
    if (profileEmail()) {
      var p = lsGet(EXTRA_PREFIX + profileEmail(), null);
      return !!(p && p.soundsOff);
    }
    return !!lsGet(SOUND_LAST_KEY, false);
  };

  function tileHtml(id, ico, lab) {
    return '<button type="button" class="qs-tile" id="' + id + '" aria-pressed="false"><span class="qs-tile-ico">' + ico + '</span><span class="qs-tile-lab">' + lab + '</span></button>';
  }
  function ensureExtraTiles() {
    var grid = $('qsGrid');
    if (!grid || $('qsTextSize')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML =
      tileHtml('qsTextSize', '🔠', 'Texto: Normal') +
      tileHtml('qsSounds', '🔊', 'Sonidos del sistema') +
      tileHtml('qsReduceMotion', '🐢', 'Animaciones reducidas');
    var first = grid.querySelector('.qs-tile-action');
    while (wrap.firstChild) grid.insertBefore(wrap.firstChild, first || null);
    $('qsTextSize').addEventListener('click', function (e) {
      e.stopPropagation();
      if (extraEmail !== profileEmail()) loadExtra();
      var i = TEXT_SIZES.map(function (t) { return t.id; }).indexOf(extra.text);
      extra.text = TEXT_SIZES[(i + 1) % TEXT_SIZES.length].id;
      saveExtra(); applyExtra();
      toast('Tamaño de texto: ' + (TEXT_SIZES.filter(function (t) { return t.id === extra.text; })[0] || TEXT_SIZES[0]).label);
    });
    $('qsSounds').addEventListener('click', function (e) {
      e.stopPropagation();
      if (extraEmail !== profileEmail()) loadExtra();
      extra.soundsOff = !extra.soundsOff;
      saveExtra(); applyExtra();
      toast(extra.soundsOff ? 'Sonidos del sistema desactivados' : 'Sonidos del sistema activados');
    });
    $('qsReduceMotion').addEventListener('click', function (e) {
      e.stopPropagation();
      if (extraEmail !== profileEmail()) loadExtra();
      extra.reduceMotion = !extra.reduceMotion;
      saveExtra(); applyExtra();
      toast(extra.reduceMotion ? 'Animaciones reducidas' : 'Animaciones normales');
    });
    syncExtraTiles();
  }
  function syncExtraTiles() {
    var ts = $('qsTextSize'), so = $('qsSounds'), rm = $('qsReduceMotion');
    if (ts) {
      var t = TEXT_SIZES.filter(function (x) { return x.id === extra.text; })[0] || TEXT_SIZES[0];
      ts.querySelector('.qs-tile-lab').textContent = 'Texto: ' + t.label;
      ts.classList.toggle('active', t.id !== 'normal');
      ts.setAttribute('aria-pressed', t.id !== 'normal' ? 'true' : 'false');
    }
    if (so) {
      so.querySelector('.qs-tile-ico').textContent = extra.soundsOff ? '🔇' : '🔊';
      so.querySelector('.qs-tile-lab').textContent = extra.soundsOff ? 'Sonidos: apagados' : 'Sonidos: activados';
      so.classList.toggle('active', !extra.soundsOff);
      so.setAttribute('aria-pressed', !extra.soundsOff ? 'true' : 'false');
    }
    if (rm) {
      rm.classList.toggle('active', !!extra.reduceMotion);
      rm.setAttribute('aria-pressed', extra.reduceMotion ? 'true' : 'false');
    }
  }

  /* ---------- Menú contextual del escritorio ---------- */
  function closeCtx() { var m = $('snkCtxMenu'); if (m) m.classList.remove('open'); }
  function ctxActions() {
    var list = [
      { ico: '🖼️', lab: 'Cambiar fondo', run: function () { var b = $('tbWpBtn'); if (b) b.click(); } },
      { ico: '🌗', lab: 'Cambiar tema claro/oscuro', run: function () { var x = window.__snakeOsDesktopExtras; if (x && x.toggleTheme) x.toggleTheme(); } }
    ];
    if (!phoneMode() && typeof window.snakeArrangeDesktopIcons === 'function') {
      list.push({ ico: '🔀', lab: 'Ordenar iconos', run: function () { if (window.snakeArrangeDesktopIcons()) toast('Iconos ordenados'); } });
    }
    list.push({ sep: true });
    list.push({ ico: '📁', lab: 'Nueva carpeta', run: function () { if (window.snkCreateFolder) window.snkCreateFolder(''); } });
    list.push({ ico: '📝', lab: 'Nueva nota', run: function () { if (window.openApp) window.openApp('notes'); } });
    list.push({ ico: '🗂️', lab: 'Abrir Explorador', run: function () { if (window.openApp) window.openApp('explorer'); } });
    list.push({ ico: '🔎', lab: 'Buscar apps', run: function () { var b = $('tbSearchBtn'); if (b) b.click(); } });
    list.push({ ico: '📸', lab: 'Captura de pantalla', run: function () { var b = $('tbShotBtn'); if (b) b.click(); } });
    list.push({ sep: true });
    list.push({ ico: '⚙️', lab: 'Ajustes rápidos', run: function () { var b = $('tbQsBtn'); if (b) b.click(); } });
    return list;
  }
  function openCtx(x, y) {
    var m = $('snkCtxMenu');
    if (!m) {
      m = document.createElement('div');
      m.id = 'snkCtxMenu';
      m.setAttribute('role', 'menu');
      document.body.appendChild(m);
      m.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
    m.innerHTML = '';
    ctxActions().forEach(function (a) {
      if (a.sep) { var s = document.createElement('div'); s.className = 'snk-ctx-sep'; m.appendChild(s); return; }
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'snk-ctx-item'; b.setAttribute('role', 'menuitem');
      b.innerHTML = '<span class="snk-ctx-ico">' + a.ico + '</span><span>' + esc(a.lab) + '</span>';
      b.addEventListener('click', function (e) {
        e.stopPropagation(); e.preventDefault();
        closeCtx();
        setTimeout(a.run, 0);
      });
      m.appendChild(b);
    });
    m.style.left = '0px'; m.style.top = '0px';
    m.classList.add('open');
    var mw = m.offsetWidth, mh = m.offsetHeight;
    var nx = Math.min(x, window.innerWidth - mw - 8);
    var ny = Math.min(y, window.innerHeight - mh - 8);
    m.style.left = Math.max(8, nx) + 'px';
    m.style.top = Math.max(8, ny) + 'px';
  }
  function watchContextMenu() {
    document.addEventListener('contextmenu', function (e) {
      if (!desktopVisible()) return;
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('#snkCtxMenu')) { e.preventDefault(); return; }
      if (t.closest('.app-window, #taskbar, #startMenu, #qsPanel, #wpPanel, #appLauncher, #phoneNav, .notif-panel, .desktop-icon, input, textarea, [contenteditable="true"]')) return;
      if (!t.closest('#desktop')) return;
      e.preventDefault();
      openCtx(e.clientX, e.clientY);
    });
    document.addEventListener('pointerdown', function (e) {
      var m = $('snkCtxMenu');
      if (m && m.classList.contains('open') && !m.contains(e.target)) closeCtx();
    }, true);
    window.addEventListener('resize', closeCtx);
    window.addEventListener('blur', closeCtx);
  }

  /* ---------- Ventanas: foco, tamaño/posición recordados ---------- */
  var GEO_PREFIX = 'snakeos_wingeo_v1:';
  function geoStore() { var e = profileEmail(); return e ? (lsGet(GEO_PREFIX + e, {}) || {}) : null; }
  function saveGeo(win) {
    if (!win || phoneMode() || !win.isConnected) return;
    if (win.classList.contains('maximized') || win.classList.contains('minimized') || win.classList.contains('win-appear')) return;
    var e = profileEmail(); if (!e) return;
    var id = (win.id || '').replace(/^win-/, '');
    if (!id) return;
    var w = win.offsetWidth, h = win.offsetHeight;
    if (w < 150 || h < 120) return;
    var all = geoStore() || {};
    all[id] = { l: win.offsetLeft, t: win.offsetTop, w: w, h: h };
    var keys = Object.keys(all);
    if (keys.length > 60) delete all[keys[0]];
    lsSet(GEO_PREFIX + e, all);
  }
  function applyGeo(win) {
    if (!win || phoneMode() || win.classList.contains('maximized')) return;
    var all = geoStore(); if (!all) return;
    var id = (win.id || '').replace(/^win-/, '');
    var g = all[id];
    if (!g || typeof g.w !== 'number') return;
    var layer = $('windows');
    var lw = layer ? layer.clientWidth : window.innerWidth;
    var lh = layer ? layer.clientHeight : window.innerHeight;
    var w = Math.max(230, Math.min(g.w, lw));
    var h = Math.max(180, Math.min(g.h, lh));
    var l = Math.max(0, Math.min(g.l, lw - Math.min(w, 120)));
    var t = Math.max(0, Math.min(g.t, lh - 60));
    win.style.width = w + 'px'; win.style.height = h + 'px';
    win.style.left = l + 'px'; win.style.top = t + 'px';
  }
  var focusRaf = 0;
  function updateFocus() {
    focusRaf = 0;
    var wins = document.querySelectorAll('#windows > .app-window');
    var top = null, topZ = -1;
    wins.forEach(function (w) {
      if (w.classList.contains('minimized') || w.classList.contains('win-closing')) return;
      var z = parseInt(w.style.zIndex, 10) || 0;
      if (z >= topZ) { topZ = z; top = w; }
    });
    wins.forEach(function (w) {
      w.classList.toggle('snk-focused', w === top);
      w.classList.toggle('snk-unfocused', w !== top);
    });
  }
  function scheduleFocus() { if (!focusRaf) focusRaf = requestAnimationFrame(updateFocus); }

  var RECENT_PREFIX = 'snakeos_recent_apps_v1:';
  function noteRecent(appId) {
    var e = profileEmail(); if (!e || !appId) return;
    var sm = $('startMenu');
    if (!sm || !sm.querySelector('.start-item[data-app="' + cssEsc(appId) + '"]')) return;
    var list = (lsGet(RECENT_PREFIX + e, []) || []).filter(function (x) { return x !== appId; });
    list.unshift(appId);
    lsSet(RECENT_PREFIX + e, list.slice(0, 8));
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  function watchWindowsShell() {
    var layer = $('windows');
    if (!layer || layer._snkShell) return;
    layer._snkShell = true;
    var mo = new MutationObserver(function (muts) {
      var refocus = false;
      muts.forEach(function (m) {
        if (m.type === 'childList') {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType === 1 && n.classList.contains('app-window')) {
              applyGeo(n);
              noteRecent((n.id || '').replace(/^win-/, ''));
            }
          });
          refocus = true;
        } else if (m.type === 'attributes') {
          var w = m.target;
          if (w.parentNode !== layer) return;
          if (m.attributeName === 'class') {
            var old = ' ' + (m.oldValue || '') + ' ';
            if (w.classList.contains('win-closing') && old.indexOf(' win-closing ') === -1) saveGeo(w);
            refocus = true;
          } else if (m.attributeName === 'style') {
            var oz = /z-index:\s*(\d+)/.exec(m.oldValue || '');
            if (!oz || String(oz[1]) !== String(w.style.zIndex)) refocus = true;
          }
        }
      });
      if (refocus) scheduleFocus();
    });
    mo.observe(layer, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'], attributeOldValue: true });
    // Guardar tamaño/posición al terminar de mover o redimensionar
    var downWin = null;
    layer.addEventListener('pointerdown', function (e) {
      downWin = e.target.closest ? e.target.closest('.app-window') : null;
      scheduleFocus();
    });
    window.addEventListener('pointerup', function () {
      var w = downWin; downWin = null;
      if (w) setTimeout(function () { saveGeo(w); }, 400);
    });
    if (window.ResizeObserver) {
      var t = null;
      var ro = new ResizeObserver(function (entries) {
        clearTimeout(t);
        t = setTimeout(function () { entries.forEach(function (en) { if (!en.target.classList.contains('snk-geo')) saveGeo(en.target); }); }, 600);
      });
      new MutationObserver(function (muts) {
        muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1 && n.classList.contains('app-window')) { setTimeout(function () { try { ro.observe(n); } catch (e) {} }, 800); } }); });
      }).observe(layer, { childList: true });
    }
  }

  /* ---------- Selector de apps (Alt+Q) ---------- */
  var sw = { open: false, idx: 0, list: [] };
  function openWindowsList() {
    var arr = [];
    document.querySelectorAll('#windows > .app-window').forEach(function (w) {
      if (w.classList.contains('win-closing')) return;
      var t = w.querySelector('.win-title');
      arr.push({ win: w, z: parseInt(w.style.zIndex, 10) || 0, html: t ? t.innerHTML : esc(w.id), min: w.classList.contains('minimized') });
    });
    arr.sort(function (a, b) { return b.z - a.z; });
    return arr;
  }
  function renderSwitcher() {
    var el = $('snkSwitcher');
    if (!el) {
      el = document.createElement('div');
      el.id = 'snkSwitcher';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Cambiar de aplicación');
      document.body.appendChild(el);
      el.addEventListener('click', function (e) { if (e.target === el) closeSwitcher(false); });
    }
    var box = '<div class="snk-sw-box"><div class="snk-sw-title">Cambiar de app</div><div class="snk-sw-list">';
    sw.list.forEach(function (it, i) {
      box += '<button type="button" class="snk-sw-item' + (i === sw.idx ? ' sel' : '') + '" data-i="' + i + '">' +
        '<span class="snk-sw-name">' + it.html + '</span>' + (it.min ? '<span class="snk-sw-min">minimizada</span>' : '') + '</button>';
    });
    box += '</div><div class="snk-sw-hint">Mantén Alt y pulsa Q para avanzar · suelta Alt para abrir · Esc cancela</div></div>';
    el.innerHTML = box;
    el.querySelectorAll('.snk-sw-item').forEach(function (b) {
      b.addEventListener('click', function () { sw.idx = parseInt(b.dataset.i, 10) || 0; closeSwitcher(true); });
    });
    el.classList.add('open');
  }
  function activateWindow(w) {
    if (!w) return;
    var id = (w.id || '').replace(/^win-/, '');
    if (w.classList.contains('minimized')) {
      var ti = $('task-' + id);
      if (ti) { ti.click(); return; }
    }
    try { w.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); } catch (e) {
      try { w.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); } catch (e2) {}
    }
    scheduleFocus();
  }
  function closeSwitcher(go) {
    var el = $('snkSwitcher');
    if (el) el.classList.remove('open');
    if (go && sw.open && sw.list[sw.idx]) activateWindow(sw.list[sw.idx].win);
    sw.open = false;
  }
  function onSwitcherKey(e) {
    if (!desktopVisible()) return;
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyQ') {
      e.preventDefault();
      if (!sw.open) {
        sw.list = openWindowsList();
        if (!sw.list.length) { toast('No hay apps abiertas'); return; }
        sw.open = true;
        sw.idx = sw.list.length > 1 ? 1 : 0;
      } else {
        sw.idx = (sw.idx + (e.shiftKey ? sw.list.length - 1 : 1)) % sw.list.length;
      }
      renderSwitcher();
      return;
    }
    if (sw.open && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) { e.preventDefault(); sw.idx = (sw.idx + 1) % sw.list.length; renderSwitcher(); return; }
    if (sw.open && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) { e.preventDefault(); sw.idx = (sw.idx + sw.list.length - 1) % sw.list.length; renderSwitcher(); return; }
    if (sw.open && e.key === 'Enter') { e.preventDefault(); closeSwitcher(true); return; }
    if (e.key === 'Escape') {
      var handled = false;
      if (sw.open) { closeSwitcher(false); handled = true; }
      var m = $('snkCtxMenu'); if (m && m.classList.contains('open')) { closeCtx(); handled = true; }
      var sm = $('startMenu'); if (sm && sm.classList.contains('open')) { sm.classList.remove('open'); handled = true; }
      var np = $('notifPanel'); var nb = $('notifBtn');
      if (np && np.classList.contains('open') && nb) { nb.click(); handled = true; }
      if (handled) e.preventDefault();
    }
  }
  function onSwitcherKeyUp(e) {
    if (sw.open && (e.key === 'Alt' || e.key === 'AltGraph')) closeSwitcher(true);
  }

  /* ---------- Menú Inicio: buscador, recientes y pie con perfil ---------- */
  function startItems(sm) { return Array.prototype.slice.call(sm.querySelectorAll(':scope > .start-item[data-app]')); }
  function filterStart(sm, q) {
    q = String(q || '').trim().toLowerCase();
    var any = false;
    startItems(sm).forEach(function (b) {
      var ok = !q || b.textContent.toLowerCase().indexOf(q) !== -1 || String(b.dataset.app).indexOf(q) !== -1;
      b.classList.toggle('snk-hidden', !ok);
      if (ok) any = true;
    });
    var rec = sm.querySelector('.snk-sm-recent');
    if (rec) rec.classList.toggle('snk-hidden', !!q);
    var none = sm.querySelector('.snk-sm-none');
    if (none) none.classList.toggle('show', !any);
  }
  function enhanceStartMenu() {
    var sm = $('startMenu');
    if (!sm) return;
    if (!sm.querySelector('.snk-sm-search')) {
      var s = document.createElement('div');
      s.className = 'snk-sm-search';
      s.innerHTML = '<input type="search" placeholder="Buscar apps…" aria-label="Buscar apps" autocomplete="off" spellcheck="false">';
      sm.insertBefore(s, sm.firstChild);
      var inp = s.querySelector('input');
      inp.addEventListener('input', function () { filterStart(sm, inp.value); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var first = startItems(sm).filter(function (b) { return !b.classList.contains('snk-hidden'); })[0];
          if (first) first.click();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          var f = startItems(sm).filter(function (b) { return !b.classList.contains('snk-hidden'); })[0];
          if (f) f.focus();
        }
      });
      var none = document.createElement('div');
      none.className = 'snk-sm-none';
      none.textContent = 'No hay apps con ese nombre';
      var sep = sm.querySelector(':scope > .start-sep');
      sm.insertBefore(none, sep || null);
    }
    // Recientes
    var old = sm.querySelector('.snk-sm-recent');
    if (old) old.remove();
    var e = profileEmail();
    var rec = e ? (lsGet(RECENT_PREFIX + e, []) || []) : [];
    var btns = [];
    rec.forEach(function (id) {
      if (btns.length >= 4) return;
      var src = sm.querySelector(':scope > .start-item[data-app="' + cssEsc(id) + '"]');
      if (!src) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'snk-sm-chip';
      b.innerHTML = src.innerHTML;
      b.title = src.textContent.trim();
      b.addEventListener('click', function () { src.click(); });
      btns.push(b);
    });
    if (btns.length) {
      var box = document.createElement('div');
      box.className = 'snk-sm-recent';
      box.innerHTML = '<div class="snk-sm-label">Recientes</div><div class="snk-sm-chips"></div>';
      var chips = box.querySelector('.snk-sm-chips');
      btns.forEach(function (b) { chips.appendChild(b); });
      var after = sm.querySelector('.snk-sm-search');
      sm.insertBefore(box, after ? after.nextSibling : sm.firstChild);
      if (!sm.querySelector('.snk-sm-all')) {
        var lab = document.createElement('div');
        lab.className = 'snk-sm-label snk-sm-all';
        lab.textContent = 'Todas las apps';
        sm.insertBefore(lab, box.nextSibling);
      }
    } else {
      var al = sm.querySelector('.snk-sm-all'); if (al) al.remove();
    }
    // Pie: perfil + apagar + cerrar sesión
    var foot = sm.querySelector('.snk-sm-foot');
    var power = sm.querySelector(':scope > .start-item.poweroff');
    var out = sm.querySelector(':scope > .start-item.logout');
    if (!foot && (power || out)) {
      foot = document.createElement('div');
      foot.className = 'snk-sm-foot';
      var prof = document.createElement('button');
      prof.type = 'button'; prof.className = 'snk-sm-profile';
      prof.title = 'Mi perfil';
      prof.addEventListener('click', function () { if (window.openApp) window.openApp('profile'); sm.classList.remove('open'); });
      foot.appendChild(prof);
      if (power) { power.title = 'Apagar Snake OS'; if (window.snkPowerSvg && !power.querySelector('svg')) power.innerHTML = window.snkPowerSvg + '<span>' + esc(power.textContent || 'Apagar') + '</span>'; foot.appendChild(power); }
      if (out) { out.title = 'Cerrar sesión'; foot.appendChild(out); }
      sm.appendChild(foot);
    }
    if (foot) {
      var pb = foot.querySelector('.snk-sm-profile');
      var u = window.currentUser || {};
      var av = document.querySelector('#phoneProfileChip .pp-av');
      var avHtml = (u.avatar && typeof window.avatarMarkup === 'function') ? window.avatarMarkup(u.avatar, 'avatar-img') : (av && av.innerHTML.trim() ? av.innerHTML : esc(u.avatar && String(u.avatar).length <= 4 ? u.avatar : '👤'));
      if (pb) pb.innerHTML = '<span class="snk-sm-av">' + avHtml + '</span><span class="snk-sm-name">' + esc(u.name || 'Mi perfil') + '</span>';
    }
    var inp2 = sm.querySelector('.snk-sm-search input');
    if (inp2) {
      inp2.value = '';
      filterStart(sm, '');
      if (!phoneMode() && window.matchMedia && window.matchMedia('(hover: hover)').matches) {
        setTimeout(function () { try { inp2.focus({ preventScroll: true }); } catch (e) {} }, 60);
      }
    }
  }
  function watchStartMenu2() {
    var sm = $('startMenu');
    if (!sm || sm._snkShell) return;
    sm._snkShell = true;
    var was = false;
    new MutationObserver(function () {
      var open = sm.classList.contains('open');
      if (open && !was) enhanceStartMenu();
      was = open;
    }).observe(sm, { attributes: true, attributeFilter: ['class'] });
  }

  /* ---------- Barra de tareas: tooltips, insignias por app, reloj ---------- */
  var tipEl = null;
  function showTip(target, text) {
    if (!text) return;
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.id = 'snkTip';
      tipEl.setAttribute('role', 'tooltip');
      document.body.appendChild(tipEl);
    }
    tipEl.textContent = text;
    tipEl.classList.add('show');
    var r = target.getBoundingClientRect();
    var tr = tipEl.getBoundingClientRect();
    var x = Math.max(6, Math.min(window.innerWidth - tr.width - 6, r.left + r.width / 2 - tr.width / 2));
    var y = r.top - tr.height - 8;
    if (y < 6) y = r.bottom + 8;
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
  }
  function hideTip() { if (tipEl) tipEl.classList.remove('show'); }
  function fullDate() {
    var now = new Date();
    try {
      var d = now.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      var t = now.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
      return d.charAt(0).toUpperCase() + d.slice(1) + ' · ' + t + ' (Madrid)';
    } catch (e) { return now.toString(); }
  }
  function tipFor(el) {
    if (el.id === 'clock') return fullDate() + ' — clic: ajustes rápidos';
    if (el.classList.contains('task-item')) {
      var id = (el.id || '').replace(/^task-/, '');
      var w = $('win-' + id);
      var name = el.textContent.trim();
      var st = w && w.classList.contains('minimized') ? ' (minimizada — clic para abrir)' : (el.classList.contains('tb-front') ? ' (clic para minimizar)' : ' (clic para traerla delante)');
      var n = parseInt(el.getAttribute('data-badge') || '0', 10);
      return name + (n ? ' · ' + n + ' sin leer' : '') + st;
    }
    return el.getAttribute('data-snk-tip') || '';
  }
  function watchTaskbar() {
    var tb = $('taskbar');
    if (!tb || tb._snkShell) return;
    tb._snkShell = true;
    var hoverOk = !window.matchMedia || window.matchMedia('(hover: hover)').matches;
    // Pasar los title de las herramientas al tooltip propio (evita el doble tooltip)
    ['tbSearchBtn', 'tbShotBtn', 'tbWpBtn', 'tbQsBtn', 'clock'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      if (el.title && id !== 'clock') el.setAttribute('data-snk-tip', el.title);
      if (hoverOk) el.removeAttribute('title');
      if (!el.getAttribute('aria-label') && id !== 'clock') el.setAttribute('aria-label', el.getAttribute('data-snk-tip') || '');
    });
    if (!hoverOk) return;
    tb.addEventListener('mouseover', function (e) {
      var el = e.target.closest && e.target.closest('.task-item, .tb-tool, #clock');
      if (!el || !tb.contains(el)) return;
      if (el.hasAttribute('title')) { el.setAttribute('data-snk-tip', el.title); el.removeAttribute('title'); }
      clearTimeout(watchTaskbar._t);
      watchTaskbar._t = setTimeout(function () { showTip(el, tipFor(el)); }, 350);
    });
    tb.addEventListener('mouseout', function (e) {
      var el = e.target.closest && e.target.closest('.task-item, .tb-tool, #clock');
      if (el && e.relatedTarget && el.contains(e.relatedTarget)) return;
      clearTimeout(watchTaskbar._t);
      hideTip();
    });
    tb.addEventListener('pointerdown', function () { clearTimeout(watchTaskbar._t); hideTip(); });
  }
  var perApp = {};
  function paintTaskBadges() {
    document.querySelectorAll('#taskItems .task-item').forEach(function (el) {
      var id = (el.id || '').replace(/^task-/, '');
      var n = perApp[id] || 0;
      if (n > 0) el.setAttribute('data-badge', n > 9 ? '9+' : String(n));
      else el.removeAttribute('data-badge');
    });
  }
  function watchTaskBadges() {
    window.addEventListener('snake-notifs', function (e) {
      perApp = (e.detail && e.detail.perApp) || {};
      paintTaskBadges();
    });
    var ti = $('taskItems');
    if (ti) new MutationObserver(paintTaskBadges).observe(ti, { childList: true });
  }

  /* ---------- Cambio de perfil: recargar ajustes ---------- */
  function profileWatch() {
    var e = profileEmail();
    if (e !== extraEmail) loadExtra();
    ensureExtraTiles();
  }

  function fixGlyphs() {
    // «🗙» no existe en muchas fuentes de emoji (salía un cuadrado): usar ✖️
    var ca = document.querySelector('#qsCloseApps .qs-tile-ico');
    if (ca && ca.textContent === '\uD83D\uDDD9') ca.textContent = '\u2716\uFE0F';
  }
  function init() {
    fixGlyphs();
    loadExtra();
    ensureExtraTiles();
    watchContextMenu();
    watchWindowsShell();
    watchStartMenu2();
    watchTaskbar();
    watchTaskBadges();
    document.addEventListener('keydown', onSwitcherKey, true);
    document.addEventListener('keyup', onSwitcherKeyUp, true);
    window.addEventListener('blur', function () { if (sw.open) closeSwitcher(false); });
    setInterval(profileWatch, 15000);
    window.addEventListener('snk:profile', function () { try { profileWatch(); } catch (e) {} });
    scheduleFocus();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ---- Doganiero Store extras 2026-10-09: valoraciones, instaladas, estados ---- */
(function __snkStoreExtras() {
  if (window.SnakeStoreExtras) return;
  var cache = { at: 0, apps: null, p: null };
  function ensureCss() {
    if (document.getElementById('snk-store-extras-css')) return;
    var st = document.createElement('style');
    st.id = 'snk-store-extras-css';
    st.textContent = [
      '.store-card{transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;position:relative;}',
      '.store-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.18);border-color:rgba(52,209,122,.45);}',
      'body.snk-reduce-motion .store-card,body.snk-reduce-motion .store-card:hover{transition:none;transform:none;}',
      '.store-card.is-installed::after{content:"Instalada";position:absolute;top:8px;right:8px;font-size:.6rem;font-weight:800;padding:2px 7px;border-radius:999px;background:rgba(52,209,122,.22);color:#1f9e57;border:1px solid rgba(52,209,122,.45);}',
      'body:not(.theme-light):not(.light) .store-card.is-installed::after{color:#7CFC9A;}',
      '.store-rating{display:flex;align-items:center;gap:4px;font-size:.7rem;color:var(--muted);min-height:1.2em;}',
      '.store-rating b{color:#f5b301;font-weight:800;letter-spacing:.02em;}',
      '.store-rate{display:flex;align-items:center;gap:2px;font-size:.68rem;color:var(--muted);}',
      '.store-card .store-rate button{width:auto !important;padding:0 1px !important;margin:0 !important;background:none !important;border:none !important;box-shadow:none !important;font-size:1rem !important;line-height:1;color:#f5b301;cursor:pointer;opacity:.9;}',
      '.store-card .store-rate button:hover,.store-card .store-rate button:focus-visible{transform:scale(1.18);opacity:1;}',
      '.store-card .store-rate button.off{color:rgba(150,150,150,.6);}',
      '.store-card button.installing{opacity:.7;pointer-events:none;}',
      '.store-card button.installing::after{content:"";display:inline-block;width:10px;height:10px;margin-left:6px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;vertical-align:-1px;animation:snkStoreSpin .7s linear infinite;}',
      '@keyframes snkStoreSpin{to{transform:rotate(360deg);}}',
      '.store-empty{grid-column:1/-1;text-align:center;padding:28px 10px;color:var(--muted);font-size:.85rem;}',
      '.store-empty b{display:block;font-size:1.6rem;margin-bottom:6px;}',
      '.store-cat.active{color:inherit;}',
      'body.theme-light .store-cat.active,body.light .store-cat.active{color:#0d5c32;}',
      '.store-grid{align-content:start;}',
      '.store-rating b,.store-card .store-rate button{font-family:"Segoe UI Symbol","DejaVu Sans","Noto Sans Symbols 2",sans-serif;font-variant-emoji:text;}',
      'body.theme-light .store-rating b,body.light .store-rating b,body.theme-light .store-card .store-rate button,body.light .store-card .store-rate button{color:#a86f00;}',
      'body.theme-light .store-card .store-rate button.off,body.light .store-card .store-rate button.off{color:rgba(60,60,60,.45);}',
      '.store-toolbar{flex-wrap:wrap;row-gap:6px;}',
      '.store-toolbar select.store-sort{width:auto !important;margin:0 !important;padding:6px 8px !important;border-radius:10px;font-size:.75rem;flex:0 0 auto;max-width:100%;cursor:pointer;}'
    ].join('\n');
    document.head.appendChild(st);
  }
  function api(path, opts) {
    opts = opts || {};
    return fetch(path, {
      method: opts.method || 'GET', credentials: 'same-origin',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error((d && d.detail) || ('Error ' + r.status)); e.status = r.status; throw e; }
        return d;
      });
    });
  }
  function loadRatings(force) {
    if (!force && cache.apps && Date.now() - cache.at < 60000) return Promise.resolve(cache.apps);
    if (cache.p) return cache.p;
    cache.p = api('/api/store/ratings').then(function (d) {
      cache.apps = (d && d.apps) || {}; cache.at = Date.now(); cache.p = null; return cache.apps;
    }).catch(function () { cache.p = null; return cache.apps || {}; });
    return cache.p;
  }
  function fmtAvg(n) { return (Math.round(n * 10) / 10).toFixed(1).replace('.', ','); }
  function paintRating(card, appId, installed) {
    var info = (cache.apps && cache.apps[appId]) || { avg: 0, count: 0, mine: 0 };
    var r = card.querySelector('.store-rating');
    if (!r) {
      r = document.createElement('div');
      r.className = 'store-rating';
      var desc = card.querySelector('.store-card-desc');
      card.insertBefore(r, desc ? desc.nextSibling : null);
    }
    r.innerHTML = '';
    if (info.count) {
      var b = document.createElement('b');
      b.textContent = '★ ' + fmtAvg(info.avg);
      r.appendChild(b);
      r.appendChild(document.createTextNode(' (' + info.count + (info.count === 1 ? ' valoración)' : ' valoraciones)')));
      r.title = 'Media de ' + info.count + ' perfil' + (info.count === 1 ? '' : 'es') + ' de Snake OS';
    } else {
      r.textContent = cache.apps ? 'Sin valoraciones todavía' : '';
    }
    var rate = card.querySelector('.store-rate');
    if (!installed) { if (rate) rate.remove(); return; }
    if (!rate) {
      rate = document.createElement('div');
      rate.className = 'store-rate';
      card.insertBefore(rate, r.nextSibling);
    }
    rate.innerHTML = '';
    rate.appendChild(document.createTextNode(info.mine ? 'Tu nota: ' : 'Valorar: '));
    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var s = document.createElement('button');
        s.type = 'button';
        s.className = n <= info.mine ? '' : 'off';
        s.textContent = n <= info.mine ? '★' : '☆';
        s.title = n + (n === 1 ? ' estrella' : ' estrellas') + (n === info.mine ? ' (pulsa otra vez para quitar)' : '');
        s.setAttribute('aria-label', s.title);
        s.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var val = n === info.mine ? 0 : n;
          rate.style.opacity = '.6';
          api('/api/store/ratings/' + encodeURIComponent(appId), { method: 'POST', body: { stars: val } }).then(function (d) {
            cache.apps = cache.apps || {};
            cache.apps[appId] = { avg: d.avg, count: d.count, mine: d.mine };
            rate.style.opacity = '';
            paintRating(card, appId, true);
          }).catch(function (e) {
            rate.style.opacity = '';
            rate.title = (e && e.message) || 'No se pudo guardar la valoración';
          });
        });
        rate.appendChild(s);
      })(i);
    }
  }
  // Orden de la cuadrícula: Destacadas (orden del catálogo) / Mejor valoradas / A–Z
  var SORT_KEY = 'snakeos_store_sort_v1';
  function getSort() { try { return localStorage.getItem(SORT_KEY) || 'feat'; } catch (e) { return 'feat'; } }
  function applySort(grid) {
    var mode = getSort();
    var cs = Array.prototype.slice.call(grid.querySelectorAll('.store-card[data-app-id]'));
    if (cs.length < 2) return;
    cs.sort(function (a, b) {
      var oa = Number(a.getAttribute('data-ord')) || 0, ob = Number(b.getAttribute('data-ord')) || 0;
      if (mode === 'top') {
        var ia = (cache.apps && cache.apps[a.getAttribute('data-app-id')]) || {}, ib = (cache.apps && cache.apps[b.getAttribute('data-app-id')]) || {};
        var d = (Number(ib.avg) || 0) - (Number(ia.avg) || 0);
        if (d) return d;
        d = (Number(ib.count) || 0) - (Number(ia.count) || 0);
        if (d) return d;
      } else if (mode === 'az') {
        var na = ((a.querySelector('.store-card-name') || {}).textContent || ''), nb = ((b.querySelector('.store-card-name') || {}).textContent || '');
        var c = na.localeCompare(nb, 'es', { sensitivity: 'base' });
        if (c) return c;
      }
      return oa - ob;
    });
    cs.forEach(function (c) { grid.appendChild(c); });
  }
  function ensureSortUi(grid) {
    var wrap = grid.closest ? grid.closest('.store-wrap') : null;
    var bar = wrap && wrap.querySelector('.store-toolbar');
    if (!bar || bar.querySelector('.store-sort')) return;
    var sel = document.createElement('select');
    sel.className = 'store-sort';
    sel.setAttribute('aria-label', 'Ordenar apps');
    sel.title = 'Ordenar apps';
    [['feat', 'Destacadas'], ['top', 'Mejor valoradas'], ['az', 'A–Z']].forEach(function (o) {
      var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
    });
    sel.value = getSort();
    sel.addEventListener('change', function () {
      try { localStorage.setItem(SORT_KEY, sel.value); } catch (e) {}
      applySort(grid);
    });
    var count = bar.querySelector('.store-count');
    bar.insertBefore(sel, count || null);
  }
  window.SnakeStoreExtras = {
    // Llamado por renderStoreApp tras pintar la cuadrícula
    afterPaint: function (grid, list, isInstalled) {
      ensureCss();
      try {
        var cards = grid.querySelectorAll('.store-card');
        if (!list.length && !grid.querySelector('.store-empty')) {
          var em = document.createElement('div');
          em.className = 'store-empty';
          em.innerHTML = '<b>🔎</b>';
          em.appendChild(document.createTextNode('No hay apps que coincidan. Prueba con otra búsqueda o categoría.'));
          grid.appendChild(em);
        }
        for (var i = 0; i < cards.length && i < list.length; i++) {
          var inst = !!isInstalled(list[i].id);
          cards[i].classList.toggle('is-installed', inst);
          cards[i].setAttribute('data-app-id', list[i].id);
          cards[i].setAttribute('data-ord', String(i));
          paintRating(cards[i], list[i].id, inst);
        }
        loadRatings(false).then(function () {
          var cs = grid.querySelectorAll('.store-card[data-app-id]');
          for (var j = 0; j < cs.length; j++) {
            var id = cs[j].getAttribute('data-app-id');
            paintRating(cs[j], id, !!isInstalled(id));
          }
          applySort(grid);
        });
        ensureSortUi(grid);
        applySort(grid);
      } catch (e) {}
    }
  };
})();

// Pequeños arreglos de interfaz en apps (lote 2)
(function __snkAppFixes() {
  if (document.getElementById('snk-app-fixes-css')) return;
  var st = document.createElement('style');
  st.id = 'snk-app-fixes-css';
  st.textContent = [
    // Doganiero AI: el texto de ayuda del cuadro de mensaje no se parte en dos líneas cortadas
    'textarea[id^="aiInput-"]::placeholder{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
  ].join('\n');
  (document.head || document.documentElement).appendChild(st);
})();
