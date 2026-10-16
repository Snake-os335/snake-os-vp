/* cache-bust 202610031910 — mapa de ubicación en el chat */
/* Doganiero Chat + Centro de notificaciones — Snake OS */
(function (global) {
  'use strict';

  var pendingChatPeer = null;
  var notifState = {
    open: false,
    unread: 0,
    items: [],
    ws: null,
    pollTimer: null,
    pingTimer: null,
    listeners: [],
    swReady: false,
    swReg: null,
    swError: null,
    nativePermAsked: false
  };
  var NATIVE_PERM_KEY = 'snakeos_native_notif_perm';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function avHtml(av) {
    var a = av || '🐶';
    if (String(a).indexOf('/api/avatars/') === 0 || String(a).indexOf('data:image/') === 0) {
      return '<img class="avatar-img" src="' + esc(a) + '" alt="">';
    }
    return esc(a);
  }

  function fmtTime(ts) {
    try {
      return new Date((ts || 0) * 1000).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return '';
    }
  }

  function apiFn() {
    if (typeof global.api === 'function') return global.api;
    // Fallback: misma auth por cookie session_id que Metaverso/correo (credentials include)
    return async function apiFallback(path, options) {
      var opts = Object.assign({ credentials: 'include' }, options || {});
      if (opts.body && typeof opts.body !== 'string') {
        opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
        opts.body = JSON.stringify(opts.body);
      }
      var res = await fetch(path, opts);
      var data = null;
      var text = await res.text();
      if (text) {
        try { data = JSON.parse(text); } catch (e) { data = { detail: text }; }
      }
      if (!res.ok) {
        var detail = (data && (data.detail || data.message)) || ('Error ' + res.status);
        var err = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
        err.status = res.status;
        throw err;
      }
      return data;
    };
  }

  function currentUser() {
    // Misma fuente que el escritorio Snake OS / Metaverso (window.currentUser)
    return global.currentUser || null;
  }

  async function resolveUser(opts) {
    opts = opts || {};
    var me = opts.currentUser || currentUser();
    if (me && me.email) return me;
    try {
      var data = await apiFn()('/api/me');
      if (data && data.email) {
        global.currentUser = data;
        return data;
      }
      // /api/me puede devolver {user: ...} o el user plano
      if (data && data.user && data.user.email) {
        global.currentUser = data.user;
        return data.user;
      }
    } catch (e) {}
    return null;
  }

  function setPendingPeer(email) {
    pendingChatPeer = email ? String(email).toLowerCase() : null;
  }

  function takePendingPeer() {
    var p = pendingChatPeer;
    pendingChatPeer = null;
    return p;
  }

  function emitNotif(evt, data) {
    notifState.listeners.forEach(function (fn) {
      try { fn(evt, data); } catch (e) {}
    });
  }

  function onNotifEvent(fn) {
    notifState.listeners.push(fn);
    return function () {
      notifState.listeners = notifState.listeners.filter(function (x) { return x !== fn; });
    };
  }

  function updateBadge(n) {
    var prevUnread = notifState.unread || 0;
    notifState.unread = Math.max(0, parseInt(n, 10) || 0);
    if (notifState.unread > prevUnread && notifState._soundReady) { try { if (window.snakeNotifSound) window.snakeNotifSound(); } catch (eS) {} }
    notifState._soundReady = true;
    var badge = document.getElementById('notifBadge');
    var btn = document.getElementById('notifBtn');
    if (badge) {
      if (notifState.unread > 0) {
        badge.textContent = notifState.unread > 99 ? '99+' : String(notifState.unread);
        badge.classList.add('show');
      } else {
        badge.textContent = '';
        badge.classList.remove('show');
      }
    }
    if (btn) btn.setAttribute('aria-label', notifState.unread
      ? ('Notificaciones (' + notifState.unread + ' sin leer)')
      : 'Notificaciones');
    emitNotif('badge', notifState.unread);
    try { emitNotifSummary(); } catch (eSum) {}
  }

  /* Centro de notificaciones (2026-10-09): agrupado por app, ✕ / deslizar para quitar, No molestar */
  var NOTIF_APP_LABELS = {
    chat: '💬 Doganiero Chat', 'doganiero-book': '📗 Doganiero Book', metaverse: '🌐 Doganiero Metaverse',
    phone: '📞 Teléfono', 'doganiero-tv': '📺 Doganiero TV', desk: '🖥️ Doganiero Desk', store: '🛍️ Doganiero Store',
    cloud: '☁️ Doganiero Cloud',
    'account-request': 'Solicitud de cuenta'
  };
  function notifAppKey(n) {
    var a = n && n.data && n.data.app ? String(n.data.app) : '';
    if (!a && n && n.kind) a = String(n.kind) === 'book' ? 'doganiero-book' : String(n.kind);
    return a || 'snake-os';
  }
  function notifHiddenKey() {
    var me = currentUser();
    var email = me && me.email ? String(me.email).toLowerCase() : '';
    return email ? 'snakeos_notif_hidden_v1:' + email : '';
  }
  function notifHiddenIds() {
    var k = notifHiddenKey();
    if (!k) return [];
    try { var v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function visibleNotifs() {
    var hidden = notifHiddenIds();
    return (notifState.items || []).filter(function (n) { return n && hidden.indexOf(String(n.id)) === -1; });
  }
  function emitNotifSummary() {
    var perApp = {};
    visibleNotifs().forEach(function (n) {
      if (n.read) return;
      var k = notifAppKey(n);
      perApp[k] = (perApp[k] || 0) + 1;
    });
    try { global.dispatchEvent(new CustomEvent('snake-notifs', { detail: { perApp: perApp, unread: notifState.unread } })); } catch (e) {}
  }
  async function dismissNotification(n) {
    if (!n || n.id == null) return;
    var k = notifHiddenKey();
    if (k) {
      var ids = notifHiddenIds().filter(function (x) { return x !== String(n.id); });
      ids.push(String(n.id));
      try { localStorage.setItem(k, JSON.stringify(ids.slice(-300))); } catch (e) {}
    }
    if (!n.read) {
      n.read = true;
      updateBadge(Math.max(0, (notifState.unread || 0) - 1));
      if (!(n.data && n.data.local)) {
        try {
          var data = await apiFn()('/api/notifications/' + n.id + '/read', { method: 'POST' });
          if (data && typeof data.unread === 'number') updateBadge(data.unread);
        } catch (e) {}
      }
    }
    if (n.data && n.data.local) {
      notifState.items = (notifState.items || []).filter(function (x) { return x.id !== n.id; });
    }
    renderNotifPanel();
    emitNotifSummary();
  }
  function syncNotifDndBtn() {
    var b = document.getElementById('notifDndBtn');
    if (!b) return;
    var on = document.body.classList.contains('qs-dnd');
    b.textContent = on ? '🔕 No molestar: sí' : '🔔 No molestar: no';
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function ensureNotifExtrasUi() {
    var head = document.querySelector('#notifPanel .notif-panel-head');
    if (head && !document.getElementById('notifDndBtn')) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'link-btn notif-dnd-btn';
      b.id = 'notifDndBtn';
      b.title = 'Silenciar los avisos (se guarda en tu perfil)';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var tile = document.getElementById('qsDnd');
        // Sin burbujear: si no, el clic «fuera» cerraría el panel de notificaciones
        if (tile) tile.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: true }));
        setTimeout(syncNotifDndBtn, 30);
      });
      var mark = document.getElementById('notifMarkAll');
      var actions = document.createElement('div');
      actions.className = 'notif-head-actions';
      head.appendChild(actions);
      actions.appendChild(b);
      if (mark) actions.appendChild(mark);
    }
    var empty = document.getElementById('notifEmpty');
    if (empty && !empty.querySelector('.notif-empty-ico')) {
      empty.innerHTML = '<div class="notif-empty-ico">🔔</div><div class="notif-empty-title">Todo al día</div><div class="notif-empty-sub">No tienes notificaciones nuevas.</div>';
    }
    syncNotifDndBtn();
  }
  function attachNotifSwipe(card, n) {
    var sx = 0, sy = 0, dx = 0, active = false, moved = false;
    card.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest && e.target.closest('.notif-x')) return;
      active = true; moved = false; sx = e.clientX; sy = e.clientY; dx = 0;
    });
    card.addEventListener('pointermove', function (e) {
      if (!active) return;
      dx = e.clientX - sx;
      var dy = e.clientY - sy;
      if (!moved) {
        if (Math.abs(dx) < 10) return;
        if (Math.abs(dy) > Math.abs(dx)) { active = false; return; }
        moved = true;
        try { card.setPointerCapture(e.pointerId); } catch (er) {}
        card.classList.add('dragging');
      }
      card.style.transform = 'translateX(' + dx + 'px)';
      card.style.opacity = String(Math.max(0.25, 1 - Math.abs(dx) / 220));
    });
    function end() {
      if (!active) return;
      active = false;
      card.classList.remove('dragging');
      if (moved && Math.abs(dx) > 90) {
        card._snkSwiped = true;
        card.style.transform = 'translateX(' + (dx > 0 ? 120 : -120) + '%)';
        card.style.opacity = '0';
        setTimeout(function () { dismissNotification(n); }, 180);
      } else {
        if (moved) card._snkSwiped = true;
        card.style.transform = '';
        card.style.opacity = '';
        setTimeout(function () { card._snkSwiped = false; }, 50);
      }
    }
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }

  function renderNotifPanel() {
    var list = document.getElementById('notifList');
    var empty = document.getElementById('notifEmpty');
    ensureNotifExtrasUi();
    if (!list) return;
    list.innerHTML = '';
    var items = visibleNotifs();
    if (!items.length) {
      if (empty) empty.classList.add('show');
      return;
    }
    if (empty) empty.classList.remove('show');
    var groups = [];
    var byKey = {};
    items.forEach(function (n) {
      var k = notifAppKey(n);
      if (!byKey[k]) { byKey[k] = { key: k, items: [] }; groups.push(byKey[k]); }
      byKey[k].items.push(n);
    });
    groups.forEach(function (g) {
      var head = document.createElement('div');
      head.className = 'notif-group-head';
      var unread = g.items.filter(function (n) { return !n.read; }).length;
      head.innerHTML = '<span>' + esc(NOTIF_APP_LABELS[g.key] || '🔔 Snake OS') + '</span>' +
        (unread ? '<span class="notif-group-count">' + unread + '</span>' : '');
      list.appendChild(head);
      g.items.forEach(function (n) {
        var card = document.createElement('div');
        card.className = 'notif-card';
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'notif-item' + (n.read ? '' : ' unread');
        var photo = '';
        var photoSrc = n.data && n.data.image ? String(n.data.image) : '';
        if (photoSrc.indexOf('/static/') === 0 && photoSrc.indexOf('..') < 0 && photoSrc.indexOf('"') < 0) {
          photo = '<img alt="Arduino Mega" src="' + esc(photoSrc) + '" style="display:block;width:100%;max-width:220px;height:auto;margin:6px 0 2px;border-radius:8px;background:#04120c">';
        }
        row.innerHTML =
          '<div class="notif-item-title">' + esc(n.title || 'Aviso') + '</div>' +
          '<div class="notif-item-body">' + esc(n.body || '') + '</div>' +
          photo +
          '<div class="notif-item-meta">' + esc(fmtTime(n.ts)) + '</div>';
        row.addEventListener('click', function (e) {
          if (card._snkSwiped) { e.preventDefault(); return; }
          openNotification(n);
        });
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'notif-x';
        x.title = 'Quitar esta notificación';
        x.setAttribute('aria-label', 'Quitar esta notificación');
        x.textContent = '✕';
        x.addEventListener('click', function (e) {
          e.stopPropagation();
          card.classList.add('leaving');
          setTimeout(function () { dismissNotification(n); }, 160);
        });
        card.appendChild(row);
        card.appendChild(x);
        attachNotifSwipe(card, n);
        list.appendChild(card);
      });
    });
  }

  async function refreshNotifications() {
    if (!currentUser()) return;
    try {
      var data = await apiFn()('/api/notifications');
      notifState.items = (data.notifications || []).map(dcNormalizeCallNotice);
      updateBadge(data.unread || 0);
      if (notifState.open) renderNotifPanel();
    } catch (e) {}
  }

  async function openNotification(n) {
    if (!n || !n.id) return;
    if (n.data && n.data.local) {
      var peerEmail = n.data.peerEmail;
      notifState.items = (notifState.items || []).filter(function (x) { return x.id !== n.id; });
      updateBadge(Math.max(0, (notifState.unread || 0) - (n.read ? 0 : 1)));
      if (notifState.open && typeof renderNotifPanel === 'function') renderNotifPanel();
      closeNotifPanel();
      if (peerEmail) openChatWithPeer(peerEmail);
      return;
    }
    try {
      var data = await apiFn()('/api/notifications/' + n.id + '/open', { method: 'POST' });
      updateBadge(data.unread || 0);
      var action = data.action || {};
      closeNotifPanel();
      if (action.openApp === 'account-request') {
        if (typeof global.openApp === 'function') global.openApp('chat');
      } else if (action.openApp === 'chat' && action.peerEmail) {
        openChatWithPeer(action.peerEmail);
      } else if (action.openApp === 'metaverse') {
        var roomId = action.roomId || action.eventId || null;
        var worldId = action.world || null;
        if (typeof global.openMetaverseRoom === 'function') {
          global.openMetaverseRoom(roomId, worldId);
        } else if (typeof global.setMetaversePendingRoom === 'function') {
          global.setMetaversePendingRoom(roomId, worldId);
          if (typeof global.openApp === 'function') global.openApp('metaverse');
        } else if (typeof global.openApp === 'function') {
          global.openApp('metaverse');
        }
      } else if (action.openApp === 'doganiero-book') {
        openBookLive(action.liveId);
      } else if (action.openApp && typeof global.openApp === 'function') {
        global.openApp(action.openApp);
      }
      await refreshNotifications();
    } catch (e) {
      try {
        await apiFn()('/api/notifications/' + n.id + '/read', { method: 'POST' });
        await refreshNotifications();
      } catch (e2) {}
    }
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  function subscribeWebPush() {
    if (!currentUser()) return Promise.resolve(false);
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return Promise.resolve(false);
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return Promise.resolve(false);
    return navigator.serviceWorker.ready.then(function (reg) {
      return apiFn()('/api/push/vapid-public').then(function (key) {
        if (!key || !key.publicKey) return false;
        return reg.pushManager.getSubscription().then(function (existing) {
          var next = existing
            ? Promise.resolve(existing)
            : reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(key.publicKey)
              });
          return next.then(function (sub) {
            if (!sub) return false;
            var json = sub.toJSON ? sub.toJSON() : {};
            return apiFn()('/api/push/subscribe', { method: 'POST', body: json }).then(function () { return true; });
          });
        });
      });
    }).catch(function () { return false; });
  }

  /** Una vez por perfil: ofrece activar avisos para recibir llamadas con Snake OS cerrado. */
  function dcMaybeOfferCallPush(email) {
    try {
      var me = currentUser();
      var em = String(email || '').toLowerCase();
      if (!em || !me || String(me.email || '').toLowerCase() !== em) return;
      if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (Notification.permission !== 'default') return;
      var key = 'snakeos_callpush_offer_v1:' + em;
      try {
        var seen = parseInt(localStorage.getItem(key) || '0', 10) || 0;
        if (seen && Date.now() - seen < 30 * 24 * 3600 * 1000) return;
      } catch (eLs) { return; }
      if (document.getElementById('dcPushOffer')) return;
      var box = document.createElement('div');
      box.id = 'dcPushOffer';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', 'Avisos de llamadas');
      box.style.cssText = 'position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:12000;' +
        'width:min(380px,calc(100vw - 24px));box-sizing:border-box;padding:14px 16px;border-radius:18px;' +
        'background:rgba(10,26,18,0.95);color:#eafff0;border:1px solid rgba(52,209,122,0.55);' +
        'box-shadow:0 14px 40px rgba(0,0,0,0.45);font-size:0.85rem;line-height:1.35;';
      box.innerHTML =
        '<div style="font-weight:800;margin-bottom:4px">📞 Recibir llamadas con Snake OS cerrado</div>' +
        '<div style="opacity:.85;margin-bottom:10px">Activa los avisos y te saldrá una notificación con el tono de llamada cuando te llamen, aunque no tengas Snake OS abierto. En iPhone, primero añade Snake OS a la pantalla de inicio.</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button type="button" data-po="no" style="margin:0;width:auto">Ahora no</button>' +
          '<button type="button" data-po="yes" style="margin:0;width:auto;background:#34d17a;color:#053018;font-weight:800">Activar</button>' +
        '</div>';
      var done = function () {
        try { localStorage.setItem(key, String(Date.now())); } catch (e1) {}
        if (box.parentNode) box.parentNode.removeChild(box);
      };
      box.querySelector('[data-po="yes"]').addEventListener('click', function () {
        done();
        ensureNativeNotifPermission(true);
      });
      box.querySelector('[data-po="no"]').addEventListener('click', done);
      document.body.appendChild(box);
    } catch (e) {}
  }

  /** Ajustes → Notificaciones: activar avisos con Snake OS! cerrado (gesto del usuario). */
  window.snkEnablePush = function () {
    return Promise.resolve(ensureNativeNotifPermission(true)).then(function (perm) {
      if (perm !== 'granted') return perm || 'default';
      return navigator.serviceWorker.ready.then(function () { return subscribeWebPush(); }).then(function (ok) { return ok ? 'on' : 'nopush'; });
    }).catch(function () { return 'error'; });
  };
  window.snkPushState = function () {
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return Promise.resolve('unsupported');
    if (Notification.permission === 'denied') return Promise.resolve('denied');
    if (Notification.permission !== 'granted') return Promise.resolve('off');
    return navigator.serviceWorker.getRegistration().then(function (reg) { return reg ? reg.pushManager.getSubscription() : null; })
      .then(function (s) { return s ? 'on' : 'off'; }).catch(function () { return 'off'; });
  };

  function unsubscribePushForLogout() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return Promise.resolve();
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription().then(function (sub) {
        var endpoint = sub && sub.endpoint ? sub.endpoint : '';
        if (!endpoint) return;
        return apiFn()('/api/push/unsubscribe', { method: 'POST', body: { endpoint: endpoint } });
      });
    }).catch(function () {});
  }

  async function markAllRead() {
    var me = currentUser();
    var email = me && me.email ? String(me.email).toLowerCase() : '';
    if (!email) return;
    try {
      var data = await apiFn()('/api/notifications/read-all', {
        method: 'POST',
        body: { email: email }
      });
      var confirmed = data && data.email ? String(data.email).toLowerCase() : '';
      if (confirmed && confirmed !== email) return;
      var uid = data && data.userId;
      notifState.items = (notifState.items || []).filter(function (n) {
        if (!n || !n.userId || !uid) return false;
        return Number(n.userId) !== Number(uid);
      });
      updateBadge(0);
      if (typeof renderNotifPanel === 'function') renderNotifPanel();
      await refreshNotifications();
    } catch (e) {}
  }

  function closeNotifPanel() {
    var panel = document.getElementById('notifPanel');
    var btn = document.getElementById('notifBtn');
    if (panel) {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
    }
    if (btn) btn.setAttribute('aria-expanded', 'false');
    notifState.open = false;
  }

  function toggleNotifPanel() {
    var panel = document.getElementById('notifPanel');
    var btn = document.getElementById('notifBtn');
    if (!panel) return;
    if (notifState.open) {
      closeNotifPanel();
      return;
    }
    notifState.open = true;
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    renderNotifPanel();
    refreshNotifications();
  }


  function pageIsBackground() {
    try {
      if (typeof document.hidden === 'boolean' && document.hidden) return true;
      if (document.visibilityState && document.visibilityState !== 'visible') return true;
      if (typeof document.hasFocus === 'function' && !document.hasFocus()) return true;
    } catch (e) {}
    return false;
  }

  function nativeNotifSupport() {
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      return { ok: false, code: 'insecure', msg: 'Los avisos del teléfono requieren HTTPS. Abre Snake OS por el enlace Cloudflare (https://…), no por IP http://.' };
    }
    if (!('Notification' in window) || typeof Notification === 'undefined') {
      return { ok: false, code: 'unsupported', msg: 'Este navegador no soporta notificaciones nativas.' };
    }
    if (!('serviceWorker' in navigator)) {
      return { ok: false, code: 'no-sw', msg: 'Este navegador no permite Service Worker (necesario para avisos en segundo plano).' };
    }
    return { ok: true, code: 'ok', msg: '' };
  }

  function setNativeHint(msg, kind) {
    var hint = document.getElementById('notifNativeHint');
    var btn = document.getElementById('notifEnableNative');
    if (!hint) return;
    if (!msg) {
      hint.style.display = 'none';
      hint.textContent = '';
      hint.removeAttribute('data-kind');
      hint.style.color = '';
      return;
    }
    hint.style.display = 'block';
    hint.textContent = msg;
    hint.setAttribute('data-kind', kind || 'info');
    if (kind === 'ok') hint.style.color = '#34d17a';
    else if (kind === 'err') hint.style.color = '#ff6b6b';
    else hint.style.color = '';
    if (btn && kind === 'ok') btn.style.display = 'none';
  }

  function registerSnakeServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      notifState.swReady = false;
      notifState.swError = 'no-sw';
      return Promise.resolve(null);
    }
    // Cache-bust: CF a veces cachea el SW; la query no cambia el scope (/)
    var swUrl = '/snake-os-sw.js?v=202610161925';
    return navigator.serviceWorker.register(swUrl, { scope: '/' })
      .then(function (reg) {
        notifState.swReady = true;
        notifState.swError = null;
        notifState.swReg = reg;
        try { if (reg.update) reg.update(); } catch (e) {}
        return reg;
      })
      .catch(function (err) {
        notifState.swReady = false;
        notifState.swError = (err && err.message) ? err.message : 'register-failed';
        notifState.swReg = null;
        return null;
      });
  }

  function wireServiceWorkerMessages() {
    if (!('serviceWorker' in navigator) || notifState._swMsgWired) return;
    notifState._swMsgWired = true;
    navigator.serviceWorker.addEventListener('message', function (ev) {
      var data = ev.data || {};
      if (data.type === 'snakeos-push-ring') { try { dcPushRing(data); } catch (ePr) {} return; }
      if (data.type === 'snakeos-push-stop') { try { dcPushRingStop(data.callId || ''); } catch (ePs) {} return; }
      if (data.type !== 'snakeos-notif-click') return;
      var action = data.action || '';
      // Body tap has no action. Incoming calls answer; Rechazar stays decline.
      if ((!action || action === 'default') && data.callKind === 'incoming') action = 'answer';
      if (action === 'answer' || action === 'decline') {
        dcQueueNotifCallAction(action, data.callId);
      }
      if (data.peerEmail) {
        openChatWithPeer(data.peerEmail);
      } else if (data.openApp === 'doganiero-book') {
        openBookLive(data.liveId);
      } else if (data.openApp === 'metaverse' || data.roomId) {
        if (typeof global.openMetaverseRoom === 'function') {
          global.openMetaverseRoom(data.roomId || data.eventId, data.world);
        } else if (typeof global.openApp === 'function') {
          global.openApp('metaverse');
        }
      } else if (typeof global.openApp === 'function') {
        global.openApp(data.openApp || 'chat');
      }
    });
  }

  function updateNativePermUi() {
    var btn = document.getElementById('notifEnableNative');
    var hint = document.getElementById('notifNativeHint');
    if (!btn && !hint) return;

    var support = nativeNotifSupport();
    if (!support.ok) {
      if (btn) btn.style.display = '';
      setNativeHint(support.msg, 'err');
      return;
    }

    var perm = Notification.permission;
    if (perm === 'granted') {
      if (btn) btn.style.display = 'none';
      if (hint && hint.getAttribute('data-kind') !== 'ok') {
        setNativeHint('Avisos del teléfono activados.', 'ok');
      }
      return;
    }
    if (perm === 'denied') {
      if (btn) btn.style.display = '';
      setNativeHint(
        'Avisos bloqueados en Chrome. Toca el candado de la barra → Permisos → Notificaciones → Permitir, y vuelve a pulsar aquí.',
        'err'
      );
      return;
    }
    if (btn) btn.style.display = '';
  }

  function showTestOsNotification() {
    var opts = {
      body: 'Avisos del teléfono activados. Te avisaremos de mensajes nuevos.',
      tag: 'dc-perm-ok',
      renotify: true,
      data: { openApp: 'chat', url: '/' }
    };
    var title = 'Snake OS';
    function viaCtor() {
      try {
        var n = new Notification(title, opts);
        n.onclick = function () {
          try { window.focus(); } catch (e) {}
          n.close();
        };
        return true;
      } catch (e) {
        return false;
      }
    }
    var reg = notifState.swReg;
    if (reg && reg.showNotification) {
      return reg.showNotification(title, opts).then(function () { return true; }).catch(function () {
        return viaCtor();
      });
    }
    if ('serviceWorker' in navigator) {
      return Promise.race([
        navigator.serviceWorker.ready.then(function (r) {
          notifState.swReg = r;
          return r.showNotification(title, opts).then(function () { return true; });
        }),
        new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 2000); })
      ]).then(function (ok) {
        if (ok) return true;
        return viaCtor();
      }).catch(function () { return viaCtor(); });
    }
    return Promise.resolve(viaCtor());
  }

  /**
   * Chrome/Android: requestPermission DEBE ir en el mismo gesto de usuario.
   * No await de register(SW) antes — pierde user activation y el diálogo no aparece.
   */
  async function ensureNativeNotifPermission(fromGesture) {
    wireServiceWorkerMessages();
    var support = nativeNotifSupport();
    if (!support.ok) {
      updateNativePermUi();
      setNativeHint(support.msg, 'err');
      return support.code;
    }

    var perm = Notification.permission;

    if (perm === 'granted') {
      registerSnakeServiceWorker();
      updateNativePermUi();
      return 'granted';
    }

    if (perm === 'denied') {
      updateNativePermUi();
      return 'denied';
    }

    if (!fromGesture) {
      updateNativePermUi();
      return perm;
    }

    setNativeHint('Pidiendo permiso al navegador…', 'info');

    // 1) Pedir permiso YA (gesto intacto). No await SW antes.
    try {
      if (typeof Notification.requestPermission === 'function') {
        var maybePromise = Notification.requestPermission();
        if (maybePromise && typeof maybePromise.then === 'function') {
          perm = await maybePromise;
        } else {
          perm = await new Promise(function (resolve) {
            Notification.requestPermission(function (p) { resolve(p || Notification.permission); });
          });
        }
      } else {
        perm = Notification.permission;
      }
    } catch (e) {
      perm = Notification.permission;
      setNativeHint('No se pudo pedir permiso: ' + ((e && e.message) || 'error'), 'err');
    }

    try { localStorage.setItem(NATIVE_PERM_KEY, perm); } catch (e2) {}
    notifState.nativePermAsked = true;

    // 2) Registrar SW después del gesto
    var reg = await registerSnakeServiceWorker();

    if (perm === 'granted') {
      setNativeHint(
        reg
          ? 'Avisos activados. Deberías ver una prueba en la barra de notificaciones.'
          : 'Permiso concedido, pero el Service Worker no se registró (' + (notifState.swError || 'error') + '). Recarga e inténtalo otra vez.',
        reg ? 'ok' : 'err'
      );
      try { await showTestOsNotification(); } catch (e3) {}
      try { await subscribeWebPush(); } catch (e4) {}
      updateNativePermUi();
      return 'granted';
    }

    if (perm === 'denied') {
      setNativeHint(
        'Has denegado los avisos. En Chrome Android: candado → Permisos → Notificaciones → Permitir.',
        'err'
      );
      updateNativePermUi();
      return 'denied';
    }

    setNativeHint('No se concedió el permiso. Vuelve a pulsar «Activar avisos del teléfono» y elige Permitir.', 'err');
    updateNativePermUi();
    return perm;
  }

  async function showOsNotification(title, body, data) {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    data = data || {};
    var callKind = data.callKind || '';
    var callAlert = callKind === 'incoming' || callKind === 'missed';
    // No molestar (ajustes rápidos): silencia avisos salvo llamadas entrantes.
    if (window.__snakeOsDnd && callKind !== 'incoming') return;
    if (!callAlert && !pageIsBackground()) return;
    var callTag = (callKind === 'incoming' || callKind === 'missed') && data.callId
      ? ('call-' + String(data.callId))
      : null;
    var opts = {
      body: body || '',
      tag: callTag || ((data.app === 'metaverse' ? 'mv-' : 'dc-') + String(data.messageId || data.roomId || data.eventId || data.peerEmail || title || 'chat')),
      renotify: callKind !== 'incoming',
      silent: false,
      requireInteraction: callKind === 'incoming',
      sound: '/static/ringtone.mp3?v=202610141730',
      data: {
        peerEmail: data.peerEmail || null,
        openApp: data.app || 'chat',
        messageId: data.messageId || null,
        roomId: data.roomId || data.eventId || null,
        eventId: data.eventId || data.roomId || null,
        world: data.world || null,
        liveId: data.liveId || null,
        callId: data.callId || null,
        callKind: callKind || null,
        tag: callTag,
        url: '/'
      }
    };
    if (callKind === 'incoming') {
      opts.vibrate = [280, 120, 280];
      opts.actions = [
        { action: 'answer', title: 'Contestar' },
        { action: 'decline', title: 'Rechazar' }
      ];
    } else if (callAlert) {
      opts.vibrate = [180, 80, 180];
    }
    if (data.image && String(data.image).indexOf('/static/') === 0) {
      opts.icon = data.image;
      opts.image = data.image;
    }
    try {
      var reg = notifState.swReg;
      if (!reg && 'serviceWorker' in navigator) {
        reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 1500); })
        ]);
        if (reg) notifState.swReg = reg;
      }
      if (reg && reg.showNotification) {
        try {
          await reg.showNotification(title || 'Doganiero Chat', opts);
        } catch (eSound) {
          try { delete opts.sound; delete opts.vibrate; delete opts.actions; } catch (eDel) {}
          await reg.showNotification(title || 'Doganiero Chat', opts);
        }
        return;
      }
    } catch (e) {}
    try {
      var n = new Notification(title || 'Doganiero Chat', opts);
      n.onclick = function () {
        try { window.focus(); } catch (e3) {}
        if (callKind === 'incoming') dcQueueNotifCallAction('answer', data.callId || '');
        if (data.peerEmail) openChatWithPeer(data.peerEmail);
        else if (data.app === 'doganiero-book') openBookLive(data.liveId);
        n.close();
      };
    } catch (e2) {}
  }


  var dcLoc = {
    gen: 0,
    active: false,
    pendingEmail: '',
    peerEmail: '',
    self: null,
    timer: null,
    err: '',
    errPeer: '',
    incoming: {}
  };

  function dcLocFix(n) {
    var x = Number(n);
    if (!isFinite(x)) return NaN;
    return Math.round(x * 1e6) / 1e6;
  }
  function dcLocStop() {
    dcLoc.gen += 1;
    var to = dcLoc.peerEmail;
    dcLoc.active = false;
    dcLoc.pendingEmail = '';
    dcLoc.peerEmail = '';
    dcLoc.self = null;
    dcLoc.err = '';
    dcLoc.errPeer = '';
    if (dcLoc.timer) {
      clearInterval(dcLoc.timer);
      dcLoc.timer = null;
    }
    if (to) {
      try { dcSend({ type: 'loc_share', to: to, on: false }); } catch (eStop) {}
    }
    dcLocPaint();
  }
  function dcLocFail(email, text) {
    dcLoc.err = text || 'No se pudo obtener la ubicación.';
    dcLoc.errPeer = email || '';
    dcLoc.pendingEmail = '';
    dcLocPaint();
  }
  function dcLocPush(pos) {
    if (!dcLoc.active || !dcLoc.peerEmail || !pos || !pos.coords) return;
    var lat = dcLocFix(pos.coords.latitude);
    var lng = dcLocFix(pos.coords.longitude);
    if (!isFinite(lat) || !isFinite(lng)) return;
    dcLoc.self = { lat: lat, lng: lng };
    try {
      dcSend({ type: 'loc_share', to: dcLoc.peerEmail, on: true, lat: lat, lng: lng });
    } catch (ePush) {}
    dcLocPaint();
  }
  function dcLocStart(peerObj) {
    if (!peerObj || !peerObj.email) return;
    var email = String(peerObj.email).toLowerCase();
    var me = currentUser();
    if (me && me.email && String(me.email).toLowerCase() === email) return;
    if ((dcLoc.active || dcLoc.pendingEmail) && dcLoc.peerEmail && dcLoc.peerEmail !== email) dcLocStop();
    dcLoc.gen += 1;
    var gen = dcLoc.gen;
    dcLoc.pendingEmail = email;
    dcLoc.err = '';
    dcLoc.errPeer = '';
    dcLocPaint();
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      dcLocFail(email, 'Este dispositivo no puede compartir la ubicación.');
      return;
    }
    var opts = { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 };
    try {
      navigator.geolocation.getCurrentPosition(function (pos) {
        if (dcLoc.gen !== gen) return;
        dcLoc.pendingEmail = '';
        dcLoc.active = true;
        dcLoc.peerEmail = email;
        dcLoc.err = '';
        dcLocPush(pos);
        if (dcLoc.timer) clearInterval(dcLoc.timer);
        dcLoc.timer = setInterval(function () {
          if (!dcLoc.active || dcLoc.peerEmail !== email || dcLoc.gen !== gen) return;
          try {
            navigator.geolocation.getCurrentPosition(function (p) {
              if (dcLoc.active && dcLoc.peerEmail === email && dcLoc.gen === gen) dcLocPush(p);
            }, function (err) {
              if (dcLoc.gen !== gen) return;
              if (err && err.code === 1) {
                dcLocStop();
                dcLocFail(email, 'Permiso de ubicación denegado.');
              }
            }, opts);
          } catch (eTick) {}
        }, 2000);
      }, function (err) {
        if (dcLoc.gen !== gen) return;
        dcLoc.active = false;
        dcLoc.peerEmail = '';
        var denied = err && err.code === 1;
        dcLocFail(email, denied ? 'Permiso de ubicación denegado.' : 'No se pudo obtener la ubicación.');
      }, opts);
    } catch (eStart) {
      dcLocFail(email, 'No se pudo obtener la ubicación.');
    }
  }
  function dcLocToggle(peerObj) {
    if (!peerObj || !peerObj.email) return;
    var email = String(peerObj.email).toLowerCase();
    if ((dcLoc.active && dcLoc.peerEmail === email) || dcLoc.pendingEmail === email) {
      dcLocStop();
      return;
    }
    dcLocStart(peerObj);
  }
  var dcLocMap = {
    host: null,
    watched: null,
    ro: null,
    tiles: {},
    ptsKey: '',
    sizeKey: ''
  };

  function dcLocMapTeardown() {
    if (dcLocMap.ro && dcLocMap.watched) {
      try { dcLocMap.ro.unobserve(dcLocMap.watched); } catch (eUn) {}
    }
    dcLocMap.watched = null;
    dcLocMap.host = null;
    dcLocMap.tiles = {};
    dcLocMap.ptsKey = '';
    dcLocMap.sizeKey = '';
  }

  function dcLocProject(lat, lng, z) {
    var n = Math.pow(2, z);
    var x = (lng + 180) / 360 * n;
    var s = Math.sin(lat * Math.PI / 180);
    if (s > 0.9999) s = 0.9999;
    if (s < -0.9999) s = -0.9999;
    var y = (1 - Math.log((1 + s) / (1 - s)) / (2 * Math.PI)) / 2 * n;
    return { x: x, y: y };
  }

  function dcLocShort(name) {
    var s = String(name || 'Contacto').replace(/\s+/g, ' ').trim() || 'Contacto';
    if (s.length > 22) s = s.slice(0, 21) + '\u2026';
    return s;
  }

  function dcLocPoints(email) {
    var pts = [];
    if (dcLoc.active && dcLoc.self && dcLoc.peerEmail === email) {
      pts.push({ id: 'self', lat: dcLoc.self.lat, lng: dcLoc.self.lng, label: 'T\u00fa', mine: true });
    }
    var inc = email ? dcLoc.incoming[email] : null;
    if (inc && inc.on && inc.lat != null && inc.lng != null && isFinite(inc.lat) && isFinite(inc.lng)) {
      pts.push({
        id: 'peer',
        lat: inc.lat,
        lng: inc.lng,
        label: dcLocShort(inc.name),
        mine: false
      });
    }
    return pts;
  }

  function dcLocChooseView(pts, w, h) {
    var padX = 48;
    var padY = 56;
    var only = pts.length < 2;
    if (!only) {
      only = Math.abs(pts[0].lat - pts[1].lat) < 0.00001 && Math.abs(pts[0].lng - pts[1].lng) < 0.00001;
    }
    if (only) {
      var one = dcLocProject(pts[0].lat, pts[0].lng, 15);
      return { z: 15, cx: one.x, cy: one.y };
    }
    var best = 3;
    var z;
    var i;
    for (z = 17; z >= 3; z--) {
      var minX = Infinity;
      var maxX = -Infinity;
      var minY = Infinity;
      var maxY = -Infinity;
      for (i = 0; i < pts.length; i++) {
        var pr = dcLocProject(pts[i].lat, pts[i].lng, z);
        if (pr.x < minX) minX = pr.x;
        if (pr.x > maxX) maxX = pr.x;
        if (pr.y < minY) minY = pr.y;
        if (pr.y > maxY) maxY = pr.y;
      }
      if ((maxX - minX) * 256 <= (w - padX * 2) && (maxY - minY) * 256 <= (h - padY * 2)) {
        best = z;
        break;
      }
    }
    var sx = 0;
    var sy = 0;
    for (i = 0; i < pts.length; i++) {
      var pr2 = dcLocProject(pts[i].lat, pts[i].lng, best);
      sx += pr2.x;
      sy += pr2.y;
    }
    return { z: best, cx: sx / pts.length, cy: sy / pts.length };
  }

  function dcLocWatch(host) {
    if (dcLocMap.host !== host) {
      if (dcLocMap.ro && dcLocMap.watched) {
        try { dcLocMap.ro.unobserve(dcLocMap.watched); } catch (eUn2) {}
      }
      dcLocMap.watched = null;
      dcLocMap.host = null;
      dcLocMap.tiles = {};
      dcLocMap.ptsKey = '';
      dcLocMap.sizeKey = '';
      dcLocMap.host = host;
    }
    if (!dcLocMap.ro && typeof ResizeObserver === 'function') {
      dcLocMap.ro = new ResizeObserver(function () {
        var h = dcLocMap.host;
        if (!h || !h.isConnected || h.hidden) return;
        var line = h.closest ? h.closest('[data-dc="loc-line"]') : null;
        if (!line) return;
        dcLocRenderOsm(h, dcLocPoints(String(line.getAttribute('data-peer') || '').toLowerCase()));
      });
    }
    if (dcLocMap.ro && dcLocMap.watched !== host) {
      try { dcLocMap.ro.observe(host); } catch (eOb) {}
      dcLocMap.watched = host;
    }
  }

  function dcLocRenderOsm(host, pts) {
    if (!host || !pts || !pts.length) return;
    host.hidden = false;
    dcLocWatch(host);
    var w = host.clientWidth;
    var h = host.clientHeight;
    if (w < 40 || h < 40) return;
    var ptsKey = pts.map(function (p) {
      return p.id + '@' + Number(p.lat).toFixed(5) + ',' + Number(p.lng).toFixed(5) + ':' + p.label;
    }).join('|');
    var sizeKey = w + 'x' + h;
    if (dcLocMap.ptsKey === ptsKey && dcLocMap.sizeKey === sizeKey) return;
    var root = host.querySelector('[data-dc="loc-osm"]');
    if (!root) {
      host.textContent = '';
      root = document.createElement('div');
      root.className = 'dc-loc-osm';
      root.setAttribute('data-dc', 'loc-osm');
      var tilesEl0 = document.createElement('div');
      tilesEl0.className = 'dc-loc-tiles';
      var pinsEl0 = document.createElement('div');
      pinsEl0.className = 'dc-loc-pins';
      var attr = document.createElement('a');
      attr.className = 'dc-loc-attr';
      attr.href = 'https://www.openstreetmap.org/copyright';
      attr.target = '_blank';
      attr.rel = 'noopener noreferrer';
      attr.textContent = '\u00a9 OpenStreetMap';
      root.appendChild(tilesEl0);
      root.appendChild(pinsEl0);
      root.appendChild(attr);
      host.appendChild(root);
    }
    var view = dcLocChooseView(pts, w, h);
    var left = view.cx - (w / 2) / 256;
    var top = view.cy - (h / 2) / 256;
    var n = Math.pow(2, view.z);
    var x0 = Math.floor(left);
    var x1 = Math.floor(left + w / 256);
    var y0 = Math.floor(top);
    var y1 = Math.floor(top + h / 256);
    var tilesEl = root.querySelector('.dc-loc-tiles');
    var want = {};
    var x;
    var y;
    for (x = x0; x <= x1; x++) {
      for (y = y0; y <= y1; y++) {
        if (y < 0 || y >= n) continue;
        var xx = ((x % n) + n) % n;
        var key = view.z + '/' + xx + '/' + y;
        want[key] = true;
        var img = dcLocMap.tiles[key];
        if (!img) {
          img = document.createElement('img');
          img.alt = '';
          img.draggable = false;
          img.src = 'https://tile.openstreetmap.org/' + key + '.png';
          tilesEl.appendChild(img);
          dcLocMap.tiles[key] = img;
        } else if (img.parentNode !== tilesEl) {
          tilesEl.appendChild(img);
        }
        img.style.left = ((x - left) * 256) + 'px';
        img.style.top = ((y - top) * 256) + 'px';
      }
    }
    Object.keys(dcLocMap.tiles).forEach(function (key) {
      if (!want[key]) {
        var gone = dcLocMap.tiles[key];
        if (gone && gone.parentNode) gone.parentNode.removeChild(gone);
        delete dcLocMap.tiles[key];
      }
    });
    var pinsEl = root.querySelector('.dc-loc-pins');
    var seen = {};
    pts.forEach(function (p) {
      seen[p.id] = true;
      var pr = dcLocProject(p.lat, p.lng, view.z);
      var pin = pinsEl.querySelector('[data-pin="' + p.id + '"]');
      if (!pin) {
        pin = document.createElement('div');
        pin.setAttribute('data-pin', p.id);
        pinsEl.appendChild(pin);
      }
      pin.className = 'dc-loc-pin' + (p.mine ? '' : ' peer');
      pin.textContent = p.label;
      pin.style.left = ((pr.x - left) * 256) + 'px';
      pin.style.top = ((pr.y - top) * 256) + 'px';
    });
    var oldPins = pinsEl.querySelectorAll('[data-pin]');
    var pi;
    for (pi = 0; pi < oldPins.length; pi++) {
      if (!seen[oldPins[pi].getAttribute('data-pin')]) pinsEl.removeChild(oldPins[pi]);
    }
    var both = pts.length > 1;
    host.setAttribute('aria-label', both ? 'Mapa con tu ubicaci\u00f3n y la de la otra persona' : 'Mapa de ubicaci\u00f3n');
    dcLocMap.ptsKey = ptsKey;
    dcLocMap.sizeKey = sizeKey;
  }

  function dcOnLocUpdate(msg) {
    var email = String((msg && msg.from) || '').toLowerCase();
    if (!email) return;
    var lat = Number(msg.lat);
    var lng = Number(msg.lng);
    var on = !!msg.on && isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    dcLoc.incoming[email] = {
      name: String((msg && msg.name) || email),
      on: on,
      lat: on ? lat : null,
      lng: on ? lng : null,
      ended: !on
    };
    dcLocPaint();
  }
  function dcLocPaint() {
    var line = document.querySelector('[data-dc="loc-line"]');
    var btn = document.querySelector('[data-dc="loc"]');
    var email = line ? String(line.getAttribute('data-peer') || '').toLowerCase() : '';
    if (btn) {
      var sharing = !!(email && dcLoc.active && dcLoc.peerEmail === email);
      btn.classList.toggle('danger', sharing);
      btn.setAttribute('aria-pressed', sharing ? 'true' : 'false');
    }
    if (!line) {
      dcLocMapTeardown();
      return;
    }
    var status = line.querySelector('[data-dc="loc-status"]');
    var host = line.querySelector('[data-dc="loc-map"]');
    var note = line.querySelector('[data-dc="loc-note"]');
    if (!status || !host || !note) {
      dcLocMapTeardown();
      line.innerHTML = '<div data-dc="loc-status"></div><div data-dc="loc-map" class="dc-loc-map" hidden></div><div data-dc="loc-note"></div>';
      status = line.querySelector('[data-dc="loc-status"]');
      host = line.querySelector('[data-dc="loc-map"]');
      note = line.querySelector('[data-dc="loc-note"]');
    }
    var bits = [];
    if (dcLoc.err && dcLoc.errPeer && email && dcLoc.errPeer === email) bits.push(dcLoc.err);
    var inc = email ? dcLoc.incoming[email] : null;
    if (inc && inc.ended && !inc.on) {
      bits.push((inc.name || 'Contacto') + ' dej\u00f3 de compartir su ubicaci\u00f3n');
    }
    status.textContent = bits.join('\n');
    var pts = dcLocPoints(email);
    if (!pts.length) {
      host.hidden = true;
      note.textContent = '';
      return;
    }
    var peerName = line.getAttribute('data-name') || 'La otra persona';
    var missing = '';
    if (pts.length === 1 && pts[0].id === 'self') {
      if (!(inc && inc.ended)) missing = peerName + ' todav\u00eda no ha compartido su ubicaci\u00f3n.';
    } else if (pts.length === 1) {
      missing = 'T\u00fa todav\u00eda no has compartido tu ubicaci\u00f3n.';
    }
    note.textContent = missing;
    if (pts.some(function (p) { return p.id === 'peer'; })) {
      pts.forEach(function (p) {
        if (p.id === 'peer') p.label = dcLocShort((inc && inc.name) || peerName);
      });
    }
    dcLocRenderOsm(host, pts);
  }


function handleRealtimePayload(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'loc_update') {
      dcOnLocUpdate(msg);
      return;
    }
    if (msg.type === 'account_request') {
      try { global.dispatchEvent(new CustomEvent('snake-account-request')); } catch (eAr) {}
      return;
    }
    if (handleDcCallPayload(msg)) return;
    if (msg.type === 'hello' || msg.type === 'notification') {
      if (typeof msg.unread === 'number') updateBadge(msg.unread);
      if (msg.notification) {
        var n = msg.notification;
        dcNormalizeCallNotice(n);
        var nd = n.data || {};
        notifState.items = [n].concat(
          (notifState.items || []).filter(function (x) {
            if (!x || x.id === n.id) return false;
            var d = x.data || {};
            if (d.local && nd.callKind && d.callKind === nd.callKind && String(d.callId || '') === String(nd.callId || '')) return false;
            return true;
          })
        );
        if (notifState.open) renderNotifPanel();
        if (nd.callKind === 'incoming' || nd.callKind === 'missed') {
          var who = {
            name: nd.peerName || '',
            email: nd.peerEmail || ''
          };
          dcNoteCall(nd.callKind, who, nd.callId || n.id);
        } else if (n.kind === 'account_request' || nd.app === 'account-request') {
          showOsNotification(n.title || 'Solicitud de cuenta', n.body || '', { app: 'account-request', messageId: 'req-' + String((nd && nd.requestId) || n.id || '') });
          try { global.dispatchEvent(new CustomEvent('snake-account-request')); } catch (eArN) {}
        } else if (n.kind === 'chat' || nd.app === 'chat') {
          showOsNotification(n.title || 'Doganiero Chat', n.body || '', nd);
        } else if (n.kind === 'book' || nd.app === 'doganiero-book') {
          showOsNotification(n.title || 'Doganiero Book', n.body || '', {
            app: 'doganiero-book',
            liveId: nd.liveId || '',
            messageId: 'live-' + String(nd.liveId || n.id || '')
          });
          showBookLiveToast(n);
        } else if (n.kind === 'metaverse' || nd.app === 'metaverse') {
          showOsNotification(n.title || 'server i9', n.body || '', {
            app: 'metaverse',
            roomId: nd.roomId || nd.eventId,
            eventId: nd.eventId || nd.roomId,
            world: nd.world,
            image: nd.image || '',
            messageId: 'mv-' + String(nd.eventId || nd.roomId || n.id || '')
          });
        }
      }
      emitNotif('notification', msg);
    } else if (msg.type === 'chat_reaction') {
      emitNotif('chat_reaction', msg);
    } else if (msg.type === 'chat_typing') {
      emitNotif('chat_typing', msg.from);
    } else if (msg.type === 'chat_read') {
      emitNotif('chat_read', msg.by);
    } else if (msg.type === 'chat_message') {
      emitNotif('chat_message', msg.message);
      // OS notif only from type=notification (same push to peer) to avoid double banners
    }
  }

  function connectChatWs() {
    if (!currentUser()) return;
    if (notifState.ws && (notifState.ws.readyState === 0 || notifState.ws.readyState === 1)) return;
    try {
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      var ws = new WebSocket(proto + '//' + location.host + '/api/chat/ws');
      notifState.ws = ws;
      ws.onmessage = function (ev) {
        try {
          handleRealtimePayload(JSON.parse(ev.data));
        } catch (e) {}
      };
      ws.onclose = function () {
        notifState.ws = null;
        // Socket dropped mid-call: error cue once. Callee still ringing is left so the invite can return.
        if (dcCall.phase === 'active' || (dcCall.phase === 'ringing' && dcCall.role === 'caller')) {
          try { dcDropForError('ws'); } catch (eDrop) {}
        }
        if (currentUser()) {
          setTimeout(connectChatWs, 2500);
        }
      };
      ws.onerror = function () {
        try { ws.close(); } catch (e) {}
      };
      if (notifState.pingTimer) clearInterval(notifState.pingTimer);
      notifState.pingTimer = setInterval(function () {
        if (notifState.ws && notifState.ws.readyState === 1) {
          try { notifState.ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {}
        }
      }, 25000);
    } catch (e) {}
  }

  async function syncMetaverseEventNotifications() {
    if (!currentUser()) return;
    try {
      await apiFn()('/api/notifications/sync-metaverse-events', { method: 'POST' });
    } catch (e) {}
  }

  function startNotificationCenter() {
    var me = currentUser();
    var email = me && me.email ? String(me.email).toLowerCase() : '';
    if (notifState.boundEmail && email && notifState.boundEmail !== email) {
      if (notifState.ws) {
        try { notifState.ws.onclose = null; notifState.ws.close(); } catch (eW) {}
        notifState.ws = null;
      }
      notifState.items = [];
      updateBadge(0);
    }
    notifState.boundEmail = email;
    wireServiceWorkerMessages();
    try {
      var earlyParams = new URLSearchParams(location.search || '');
      var earlyAction = earlyParams.get('callAction') || '';
      if (earlyAction === 'answer' || earlyAction === 'decline') {
        dcQueueNotifCallAction(earlyAction, earlyParams.get('callId') || '');
      }
    } catch (eEarly) {}
    registerSnakeServiceWorker();
    subscribeWebPush();
    // Si ya había permiso, no pedimos de nuevo; si no, el usuario lo activa con la campana
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      ensureNativeNotifPermission(false);
      // Permiso dado pero sin suscripción (p. ej. caducada): volver a suscribir en silencio.
      setTimeout(function () { subscribeWebPush(); }, 6000);
    }
    setTimeout(function () { dcMaybeOfferCallPush(email); }, 4000);
    connectChatWs();
    syncMetaverseEventNotifications().then(function () { return refreshNotifications(); });
    if (notifState.pollTimer) clearInterval(notifState.pollTimer);
    notifState._mvSyncTick = 0;
    notifState.pollTimer = setInterval(function () {
      if (!currentUser()) return;
      notifState._mvSyncTick = (notifState._mvSyncTick || 0) + 1;
      // Every ~60s (3rd tick) re-sync active Metaverse events; always refresh list
      var p = Promise.resolve();
      if (notifState._mvSyncTick % 6 === 0) {
        p = syncMetaverseEventNotifications();
      }
      p.then(function () { refreshNotifications(); });
    }, 45000);
    try {
      var params = new URLSearchParams(location.search || '');
      var openChat = params.get('openChat');
      if (openChat) {
        setTimeout(function () { openChatWithPeer(openChat); }, 400);
      }
      var openLiveParam = params.get('openLive');
      if (openLiveParam !== null) {
        setTimeout(function () { openBookLive(openLiveParam); }, 600);
      }
    } catch (e) {}
  }

  function stopNotificationCenter() {
    try { dcLocStop(); } catch (eLoc) {}
    closeNotifPanel();
    if (notifState.pollTimer) {
      clearInterval(notifState.pollTimer);
      notifState.pollTimer = null;
    }
    if (notifState.pingTimer) {
      clearInterval(notifState.pingTimer);
      notifState.pingTimer = null;
    }
    if (notifState.ws) {
      try { notifState.ws.close(); } catch (e) {}
      notifState.ws = null;
    }
    notifState.items = [];
    updateBadge(0);
  }

  function openBookLive() {
    return;
  }

  function showBookLiveToast(n) {
    return;
    if (!n || window.__snakeOsDnd) return;
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    var old = document.getElementById('dbLiveToast');
    if (old) { try { old.remove(); } catch (e0) {} }
    var t = document.createElement('button');
    t.type = 'button';
    t.id = 'dbLiveToast';
    t.setAttribute('role', 'status');
    t.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483000;' +
      'max-width:min(92vw,420px);display:flex;flex-direction:column;align-items:flex-start;gap:2px;' +
      'padding:10px 16px;border-radius:14px;border:1px solid rgba(255,80,80,.55);cursor:pointer;' +
      'background:rgba(20,12,14,.94);color:#fff;font:inherit;text-align:left;' +
      'box-shadow:0 8px 28px rgba(0,0,0,.45);opacity:0;transition:opacity .25s;';
    var a = document.createElement('strong');
    a.style.cssText = 'display:flex;align-items:center;gap:6px;';
    var lg = document.createElement('img');
    lg.src = '/static/assets/direct-tm-logo.png?v=1';
    lg.alt = '';
    lg.style.cssText = 'width:24px;height:24px;object-fit:contain;flex-shrink:0;';
    lg.onerror = function () { try { lg.remove(); } catch (eL) {} };
    a.appendChild(lg);
    a.appendChild(document.createTextNode(String(n.title || 'Direct™').replace(/^🔴\s*/, '')));
    var b = document.createElement('span');
    b.style.cssText = 'font-size:.85em;opacity:.85;';
    b.textContent = (n.body || 'Doganiero Book') + ' · Toca para verlo';
    t.appendChild(a);
    t.appendChild(b);
    var hide = function () {
      t.style.opacity = '0';
      setTimeout(function () { try { t.remove(); } catch (e1) {} }, 300);
    };
    t.addEventListener('click', function () { hide(); openNotification(n); });
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    setTimeout(hide, 8000);
  }

  function openChatWithPeer(email) {
    setPendingPeer(email);
    emitNotif('open_peer', String(email || '').toLowerCase());
    if (typeof global.openApp === 'function') global.openApp('chat');
  }

  function ensureNotifUi() {

    if (document.getElementById('notifBtn')) return;
    var taskbar = document.getElementById('taskbar');
    var clock = document.getElementById('clock');
    if (!taskbar || !clock) return;

    var wrap = document.createElement('div');
    wrap.id = 'notifWrap';
    wrap.className = 'notif-wrap';
    wrap.innerHTML =
      '<button type="button" id="notifBtn" class="notif-btn" aria-expanded="false" aria-controls="notifPanel" title="Notificaciones">' +
        '<span class="notif-bell">🔔</span>' +
        '<span id="notifBadge" class="notif-badge"></span>' +
      '</button>' +
      '<div id="notifPanel" class="notif-panel" aria-hidden="true" role="dialog" aria-label="Centro de notificaciones">' +
        '<div class="notif-panel-head">' +
          '<strong>Notificaciones</strong>' +
          '<button type="button" class="link-btn" id="notifMarkAll">Marcar leídas</button>' +
        '</div>' +
        '<div class="notif-native-row">' +
          '<button type="button" class="link-btn" id="notifEnableNative">Activar avisos del teléfono</button>' +
          '<div id="notifNativeHint" class="notif-native-hint" style="display:none"></div>' +
        '</div>' +
        '<div id="notifEmpty" class="notif-empty">No hay notificaciones</div>' +
        '<div id="notifList" class="notif-list"></div>' +
      '</div>';
    taskbar.insertBefore(wrap, clock);

    document.getElementById('notifBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      toggleNotifPanel();
      updateNativePermUi();
    });
    document.getElementById('notifMarkAll').addEventListener('click', function (e) {
      e.stopPropagation();
      markAllRead();
    });
    document.getElementById('notifEnableNative').addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      var btn = e.currentTarget;
      if (btn) btn.disabled = true;
      setNativeHint('Activando avisos…', 'info');
      // requestPermission en este gesto (ensureNative… lo hace antes de await SW)
      ensureNativeNotifPermission(true).then(function (perm) {
        if (btn) btn.disabled = false;
        if (perm === 'granted') {
          setNativeHint('Listo: avisos del teléfono activados.', 'ok');
        } else if (perm === 'denied') {
          setNativeHint(
            'Avisos bloqueados. Candado → Permisos → Notificaciones → Permitir, luego pulsa otra vez.',
            'err'
          );
        } else if (perm === 'insecure') {
          setNativeHint('Necesitas HTTPS (enlace Cloudflare), no http:// por IP.', 'err');
        } else if (perm === 'unsupported' || perm === 'no-sw') {
          updateNativePermUi();
        } else {
          setNativeHint('Permiso no concedido (' + perm + '). Pulsa otra vez y elige Permitir.', 'err');
        }
      }).catch(function (err) {
        if (btn) btn.disabled = false;
        setNativeHint('Error al activar avisos: ' + ((err && err.message) || String(err)), 'err');
      });
    });
    updateNativePermUi();
    document.addEventListener('click', function (e) {
      if (!notifState.open) return;
      var panel = document.getElementById('notifPanel');
      var btn = document.getElementById('notifBtn');
      if (panel && (panel.contains(e.target) || (btn && btn.contains(e.target)))) return;
      closeNotifPanel();
    });
  }



  /* 1:1 voice calls — same engine as Metaverse: WebRTC + 16 kHz PCM over the chat websocket. */
  var DC_ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
  var dcCall = {
    phase: 'idle',
    role: '',
    callId: '',
    peer: null,
    localStream: null,
    pc: null,
    audioCtx: null,
    pcmProc: null,
    pcmSrc: null,
    pcmSink: null,
    pcmGain: null,
    pcmPlayAt: 0,
    pcmNodes: [],
    remoteAudio: null,
    pendingIce: [],
    listeners: [],
    ringTimer: null,
    gen: 0,
    media: 'audio',
    cameraNote: '',
    localPreview: null,
    remoteVideo: null,
    fallbackImg: null,
    videoTimer: null,
    videoMinimized: false,
    labelHidden: false
  };

  function dcSnapshot() {
    return {
      phase: dcCall.phase,
      role: dcCall.role,
      callId: dcCall.callId,
      peerEmail: dcCall.peer && dcCall.peer.email ? String(dcCall.peer.email).toLowerCase() : '',
      peerName: dcCall.peer && dcCall.peer.name ? dcCall.peer.name : '',
      peerNumber: dcCall.peer && dcCall.peer.number ? String(dcCall.peer.number) : '',
      peerAvatar: dcCall.peer && dcCall.peer.avatar ? String(dcCall.peer.avatar) : '',
      media: dcCall.media === 'video' ? 'video' : 'audio'
    };
  }
  function onDcCallChange(fn) {
    dcCall.listeners.push(fn);
    return function () {
      dcCall.listeners = dcCall.listeners.filter(function (x) { return x !== fn; });
    };
  }
  var DC_RING_SRC = '/static/ringtone.mp3?v=202610141730';
  var DC_CALL_END_SRC = '/static/call-end.mp3?v=202610031746';
  var DC_CALL_ERROR_SRC = '/static/call-error.mp3?v=202610031750';
  var DC_CALL_NO_ANSWER_SRC = '/static/call-no-answer.mp3?v=202610082006';
  function dcPlayCallCue(callId, src) {
    // Once per call, not looped. Page-level audio: works with the chat window closed.
    var id = String(callId || '');
    if (id && dcCall.callEndPlayed === id) return;
    if (id) dcCall.callEndPlayed = id;
    try {
      var prev = dcCall.callEndAudio;
      if (prev) { try { prev.pause(); } catch (e0) {} }
      var a = new Audio(src);
      a.loop = false;
      a.preload = 'auto';
      try { a.setAttribute('playsinline', 'true'); } catch (eA) {}
      dcCall.callEndAudio = a;
      var pr = a.play();
      if (pr && typeof pr.catch === 'function') pr.catch(function () {});
    } catch (e) {}
  }
  function dcPlayCallEnd(callId) {
    dcPlayCallCue(callId, DC_CALL_END_SRC);
  }
  function dcPlayCallError(callId) {
    dcPlayCallCue(callId, DC_CALL_ERROR_SRC);
  }
  // «Si nadie responde»: solo para quien llama, cuando vence el tiempo de timbre (45 s en el servidor)
  function dcPlayNoAnswer(callId) {
    dcPlayCallCue(callId, DC_CALL_NO_ANSWER_SRC);
  }
  function dcStopNoAnswerCue() {
    var a = dcCall.callEndAudio;
    if (a && String(a.src || '').indexOf('call-no-answer.mp3') !== -1) {
      try { a.pause(); } catch (e) {}
      dcCall.callEndAudio = null;
    }
  }
  function dcStopRingtone() {
    if (dcCall.ringUnlock) {
      try { document.removeEventListener('pointerdown', dcCall.ringUnlock, true); } catch (e0) {}
      try { document.removeEventListener('keydown', dcCall.ringUnlock, true); } catch (e1) {}
      dcCall.ringUnlock = null;
    }
    var a = dcCall.ringAudio;
    if (!a) return;
    try { a.pause(); } catch (e2) {}
    try { a.currentTime = 0; } catch (e3) {}
  }
  function dcArmRingUnlock() {
    if (dcCall.ringUnlock) return;
    function once() {
      try { document.removeEventListener('pointerdown', once, true); } catch (e0) {}
      try { document.removeEventListener('keydown', once, true); } catch (e1) {}
      if (dcCall.ringUnlock === once) dcCall.ringUnlock = null;
      if (dcCall.phase === 'ringing' && dcCall.role === 'callee' && !dcCall.answering) dcStartRingtone();
    }
    dcCall.ringUnlock = once;
    document.addEventListener('pointerdown', once, true);
    document.addEventListener('keydown', once, true);
  }
  function dcStartRingtone() {
    if (dcCall.pushRing) dcPushRingStop('');
    if (!(dcCall.phase === 'ringing' && dcCall.role === 'callee' && !dcCall.answering)) return;
    var a = dcCall.ringAudio;
    if (!a) {
      a = new Audio(DC_RING_SRC);
      a.loop = true;
      a.preload = 'auto';
      try { a.setAttribute('playsinline', 'true'); } catch (eA) {}
      dcCall.ringAudio = a;
    }
    if (!a.paused) return;
    try {
      var pr = a.play();
      if (pr && typeof pr.catch === 'function') pr.catch(function () { dcArmRingUnlock(); });
    } catch (eP) {
      dcArmRingUnlock();
    }
  }
  // Web Push con Snake OS en segundo plano: el SW avisa a esta pestaña y suena el
  // mismo ringtone.mp3 que con Snake OS abierto, aunque el WebSocket esté dormido.
  function dcPushRingStop(callId) {
    var pr = dcCall.pushRing;
    if (!pr) return;
    if (callId && pr.callId && String(callId) !== String(pr.callId)) return;
    dcCall.pushRing = null;
    if (pr.timer) clearTimeout(pr.timer);
    try { pr.audio.pause(); } catch (e0) {}
  }
  function dcPushRing(data) {
    var callId = String((data && data.callId) || '');
    if (dcCall.phase === 'ringing' && dcCall.role === 'callee') {
      if (!callId || dcCall.callId === callId) dcStartRingtone();
      return;
    }
    if (dcCall.phase !== 'idle') return;
    if (dcCall.pushRing && dcCall.pushRing.callId === callId) return;
    dcPushRingStop('');
    var a = new Audio(DC_RING_SRC);
    a.loop = true;
    a.preload = 'auto';
    try { a.setAttribute('playsinline', 'true'); } catch (eA) {}
    var pr = { callId: callId, audio: a, timer: setTimeout(function () { dcPushRingStop(callId); }, 45000) };
    dcCall.pushRing = pr;
    try {
      var pp = a.play();
      if (pp && typeof pp.catch === 'function') pp.catch(function () {});
    } catch (eP) {}
    // Despertar el WebSocket: al reconectar llega call_invite y la llamada sigue normal.
    try {
      var ws = notifState.ws;
      if (!ws || ws.readyState > 1) connectChatWs();
    } catch (eW) {}
  }
  function dcSyncRingtone() {
    // Incoming only. Outgoing ("Llamando a…") stays silent. Lives outside the chat window.
    if (dcCall.phase === 'ringing' && dcCall.role === 'callee' && !dcCall.answering) dcStartRingtone();
    else dcStopRingtone();
  }
  function dcNormalizeCallNotice(n) {
    if (!n || !n.data) return n;
    var d = n.data;
    var name = d.peerName || d.peerEmail || 'Alguien';
    var videoNotice = d.media === 'video';
    if (d.callKind === 'incoming') {
      n.title = videoNotice ? (name + ' te está haciendo una videollamada') : (name + ' te está llamando');
      n.body = videoNotice ? ('Videollamada de ' + name) : ('Llamada de voz de ' + name);
      if (d.peerNumber) n.body += ' · ' + d.peerNumber;
    } else if (d.callKind === 'missed') {
      n.title = videoNotice ? ('Videollamada perdida de ' + name) : ('Llamada perdida de ' + name);
      n.body = videoNotice ? ('No contestaste la videollamada de ' + name) : ('No contestaste la llamada de ' + name);
    }
    return n;
  }
  function dcNoteCall(kind, peer, callId) {
    if (!callId || (kind !== 'incoming' && kind !== 'missed')) return;
    if (!dcCall.noticeKeys) dcCall.noticeKeys = Object.create(null);
    var key = kind + ':' + callId;
    if (dcCall.noticeKeys[key]) return;
    dcCall.noticeKeys[key] = true;
    var name = (peer && (peer.name || peer.email)) || 'Alguien';
    var videoNote = dcCall.media === 'video';
    var title = kind === 'incoming'
      ? (videoNote ? (name + ' te está haciendo una videollamada') : (name + ' te está llamando'))
      : (videoNote ? ('Videollamada perdida de ' + name) : ('Llamada perdida de ' + name));
    var body = kind === 'incoming'
      ? (videoNote ? ('Videollamada de ' + name) : ('Llamada de voz de ' + name))
      : (videoNote ? ('No contestaste la videollamada de ' + name) : ('No contestaste la llamada de ' + name));
    var email = peer && peer.email ? String(peer.email).toLowerCase() : '';
    var items = notifState.items || [];
    var already = items.some(function (n) {
      var d = (n && n.data) || {};
      return d.callKind === kind && String(d.callId || '') === String(callId);
    });
    if (!already) {
      notifState.items = [{
        id: 'local-call-' + kind + '-' + callId,
        kind: 'chat',
        title: title,
        body: body,
        read: false,
        ts: Date.now() / 1000,
        data: {
          app: 'chat',
          peerEmail: email || null,
          peerName: name,
          callId: callId,
          callKind: kind,
          media: dcCall.media === 'video' ? 'video' : 'audio',
          local: true
        }
      }].concat(items);
      updateBadge((notifState.unread || 0) + 1);
      if (notifState.open && typeof renderNotifPanel === 'function') renderNotifPanel();
    }
    showOsNotification(title, body, {
      app: 'chat',
      peerEmail: email || null,
      peerName: name,
      callId: callId,
      callKind: kind,
      media: dcCall.media === 'video' ? 'video' : 'audio',
      messageId: 'call-' + kind + '-' + callId
    });
  }
  function emitDcCall() {
    var snap = dcSnapshot();
    dcCall.listeners.slice().forEach(function (fn) { try { fn(snap); } catch (e) {} });
    syncDcOsBar();
    dcSyncRingtone();
    dcSyncVideoStage();
  }
  function syncDcOsBar() {
    var host = document.getElementById('taskbar');
    var el = document.getElementById('dcCallDock');
    if (!host || dcCall.phase === 'idle') {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'dcCallDock';
      el.className = 'dc-call-dock';
      el.setAttribute('role', 'status');
      var clock = document.getElementById('clock');
      if (clock && clock.parentNode === host) host.insertBefore(el, clock);
      else host.appendChild(el);
    }
    var name = dcPeerName();
    var videoBar = dcCall.media === 'video';
    var textLabel = dcCall.phase === 'active'
      ? ((videoBar ? 'En videollamada · ' : 'En llamada · ') + name)
      : (dcCall.role === 'callee'
          ? (videoBar ? (name + ' te videollama') : (name + ' te llama'))
          : (videoBar ? ('Videollamando · ' + name) : ('Llamando · ' + name)));
    el.innerHTML = '';
    var span = document.createElement('span');
    span.className = 'dc-call-dock-text';
    span.textContent = textLabel;
    el.appendChild(span);
    function addBtn(label, cls, fn) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = cls;
      btn.textContent = label;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (fn) fn();
      });
      el.appendChild(btn);
    }
    if (dcCall.phase === 'ringing' && dcCall.role === 'callee') {
      addBtn('Contestar', 'ok', dcAnswer);
      addBtn('Rechazar', 'no', dcDecline);
    } else {
      addBtn('Colgar', 'no', dcHangup);
    }
    var lab = document.createElement('button');
    lab.type = 'button';
    lab.setAttribute('data-dc', 'label-toggle');
    lab.textContent = dcCall.labelHidden ? 'Mostrar' : 'Ocultar';
    lab.style.background = 'rgba(255,255,255,0.18)';
    lab.style.color = '#eafff0';
    lab.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      dcToggleCallLabel();
    });
    el.appendChild(lab);
    var dockText0 = el.querySelector('.dc-call-dock-text');
    if (dockText0 && dcCall.labelHidden) dockText0.hidden = true;
    dcSyncCallLabelUi();
  }
  function dcRepaintCallChrome() {
    if (dcCall.phase === 'active') {
      dcActiveBanner();
    } else if (dcCall.phase === 'ringing' && dcCall.role === 'callee') {
      showDcBanner(dcIncomingText(), [
        { label: 'Contestar', cls: 'ok', fn: dcAnswer },
        { label: 'Rechazar', cls: 'no', fn: dcDecline }
      ]);
    } else if (dcCall.phase === 'ringing') {
      showDcBanner(dcOutgoingText(), [{ label: 'Colgar', cls: 'no', fn: dcHangup }]);
    }
    syncDcOsBar();
  }
  function dcSend(obj) {
    var ws = notifState.ws;
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }
  function dcB64FromBytes(bytes) {
    var out = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(out);
  }
  function dcBytesFromB64(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 255;
    return bytes;
  }
  function dcIcePlain(cand) {
    if (!cand) return null;
    if (typeof cand.toJSON === 'function') return cand.toJSON();
    return { candidate: cand.candidate, sdpMid: cand.sdpMid, sdpMLineIndex: cand.sdpMLineIndex };
  }
  function dcSdpPlain(desc) {
    if (!desc) return null;
    return { type: desc.type, sdp: desc.sdp };
  }
  function dcToggleCallLabel() {
    if (dcCall.phase === 'idle') return;
    dcCall.labelHidden = !dcCall.labelHidden;
    dcSyncCallLabelUi();
  }
  function dcSyncCallLabelUi() {
    var hidden = !!dcCall.labelHidden && dcCall.phase !== 'idle';
    var banner = document.getElementById('dcCallBanner');
    if (banner) banner.hidden = hidden;
    var dock = document.getElementById('dcCallDock');
    if (dock) {
      var dockText = dock.querySelector('.dc-call-dock-text');
      if (dockText) dockText.hidden = hidden;
    }
    var toggles = document.querySelectorAll('[data-dc="label-toggle"]');
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].textContent = hidden ? 'Mostrar' : 'Ocultar';
      toggles[i].setAttribute('aria-pressed', hidden ? 'true' : 'false');
    }
    try { syncDcCallMini(); } catch (eMini) {}
  }
  function hideDcBanner() {
    var el = document.getElementById('dcCallBanner');
    if (el) el.remove();
    var mini = document.getElementById('dcCallMini');
    if (mini) mini.remove();
  }
  function ensureDcCallMini() {
    var el = document.getElementById('dcCallMini');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'dcCallMini';
    el.className = 'dc-call-mini';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
    return el;
  }
  function syncDcCallMini() {
    var hidden = !!dcCall.labelHidden && dcCall.phase !== 'idle';
    var mini = document.getElementById('dcCallMini');
    if (!hidden) {
      if (mini) mini.classList.remove('show');
      return;
    }
    mini = ensureDcCallMini();
    var name = dcPeerName();
    var label = dcCall.phase === 'active'
      ? ((dcIsVideo() ? 'Videollamada · ' : 'Llamada · ') + name)
      : (dcCall.role === 'callee' ? ('Te llama · ' + name) : ('Llamando · ' + name));
    mini.innerHTML = '';
    var span = document.createElement('span');
    span.className = 'dc-call-mini-text';
    span.textContent = label;
    mini.appendChild(span);
    var showBtn = document.createElement('button');
    showBtn.type = 'button';
    showBtn.className = 'show-again';
    showBtn.textContent = 'Mostrar';
    showBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (dcCall.labelHidden) dcToggleCallLabel();
    });
    mini.appendChild(showBtn);
    if (dcCall.phase === 'ringing' && dcCall.role === 'callee') {
      var ans = document.createElement('button');
      ans.type = 'button';
      ans.className = 'ok';
      ans.textContent = 'Contestar';
      ans.style.background = '#34d17a';
      ans.style.color = '#053018';
      ans.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        dcAnswer();
      });
      mini.appendChild(ans);
      var dec = document.createElement('button');
      dec.type = 'button';
      dec.className = 'no';
      dec.textContent = 'Rechazar';
      dec.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        dcDecline();
      });
      mini.appendChild(dec);
    } else {
      var hang = document.createElement('button');
      hang.type = 'button';
      hang.className = 'no';
      hang.textContent = 'Colgar';
      hang.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        dcHangup();
      });
      mini.appendChild(hang);
    }
    mini.classList.add('show');
  }
  function showDcBanner(text, buttons) {
    var el = document.getElementById('dcCallBanner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dcCallBanner';
      el.className = 'dc-call-banner';
      el.setAttribute('role', 'dialog');
      document.body.appendChild(el);
    }
    el.innerHTML = '';
    // Foto/emoji del contacto (Chat y Teléfono)
    var avSrc = dcCall.phase !== 'idle' && dcCall.peer ? String(dcCall.peer.avatar || '') : '';
    if (avSrc) {
      var av = document.createElement('span');
      av.className = 'dc-call-av';
      av.style.cssText = 'width:30px;height:30px;flex:0 0 30px;border-radius:50%;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;font-size:1.2rem;background:rgba(255,255,255,0.16)';
      if (avSrc.indexOf('/api/avatars/') === 0 || avSrc.indexOf('data:image/') === 0) {
        var avImg = document.createElement('img');
        avImg.alt = '';
        avImg.src = avSrc;
        avImg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
        av.appendChild(avImg);
      } else {
        av.textContent = avSrc;
      }
      el.appendChild(av);
    }
    var span = document.createElement('span');
    span.className = 'dc-call-text';
    span.textContent = text || '';
    el.appendChild(span);
    (buttons || []).forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = b.cls || '';
      btn.textContent = b.label;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (b.fn) b.fn();
      });
      el.appendChild(btn);
    });
    if (dcCall.phase !== 'idle') {
      var hideBtn = document.createElement('button');
      hideBtn.type = 'button';
      hideBtn.className = 'dc-call-hide';
      hideBtn.setAttribute('data-dc', 'label-toggle');
      hideBtn.textContent = dcCall.labelHidden ? 'Mostrar' : 'Ocultar';
      hideBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        dcToggleCallLabel();
      });
      el.appendChild(hideBtn);
    }
    dcSyncCallLabelUi();
  }
  function dcPeerName() {
    return (dcCall.peer && (dcCall.peer.name || dcCall.peer.email)) || 'contacto';
  }
  function dcPeerNumberSuffix() {
    var n = dcCall.peer && dcCall.peer.number ? String(dcCall.peer.number) : '';
    return n ? (' · ' + n) : '';
  }
  function dcArmRingTimer() {
    if (dcCall.ringTimer) clearTimeout(dcCall.ringTimer);
    var id = dcCall.callId;
    var gen = dcCall.gen;
    dcCall.ringTimer = setTimeout(function () {
      if (dcCall.gen !== gen) return;
      if (dcCall.phase === 'ringing' && dcCall.callId === id && dcCall.role === 'caller') dcHangup();
    }, 50000);
  }
  function dcStopPcmSend() {
    try { if (dcCall.pcmProc) dcCall.pcmProc.onaudioprocess = null; } catch (e0) {}
    try { if (dcCall.pcmProc) dcCall.pcmProc.disconnect(); } catch (e1) {}
    try { if (dcCall.pcmSrc) dcCall.pcmSrc.disconnect(); } catch (e2) {}
    try { if (dcCall.pcmSink) dcCall.pcmSink.disconnect(); } catch (e3) {}
    dcCall.pcmProc = null;
    dcCall.pcmSrc = null;
    dcCall.pcmSink = null;
  }
  function dcDropPcmPlay() {
    (dcCall.pcmNodes || []).forEach(function (src) {
      try { src.onended = null; src.stop(0); } catch (e) {}
      try { src.disconnect(); } catch (e2) {}
    });
    dcCall.pcmNodes = [];
    dcCall.pcmPlayAt = 0;
    if (dcCall.pcmGain) {
      try { dcCall.pcmGain.gain.value = 0; dcCall.pcmGain.disconnect(); } catch (e3) {}
      dcCall.pcmGain = null;
    }
  }
  function dcEnsureCtx() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!dcCall.audioCtx || dcCall.audioCtx.state === 'closed') {
      dcCall.audioCtx = new Ctx();
      dcStopPcmSend();
    }
    if (dcCall.audioCtx.state === 'suspended' || dcCall.audioCtx.state === 'interrupted') {
      dcCall.audioCtx.resume().catch(function () {});
    }
    return dcCall.audioCtx;
  }
  function dcEnsureGain() {
    var ctx = dcEnsureCtx();
    if (!ctx) return null;
    if (!dcCall.pcmGain || dcCall.pcmGain.context !== ctx) {
      try { if (dcCall.pcmGain) dcCall.pcmGain.disconnect(); } catch (e) {}
      dcCall.pcmGain = ctx.createGain();
      dcCall.pcmGain.gain.value = 1;
      dcCall.pcmGain.connect(ctx.destination);
    }
    return dcCall.pcmGain;
  }
  function dcEnsureMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('nomedia'));
    }
    var wantVideo = dcCall.media === 'video';
    var gen = dcCall.gen;
    function stopStream(stream) {
      if (!stream || !stream.getTracks) return;
      stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
    }
    function liveTrack(stream, kind) {
      var found = null;
      if (!stream || !stream.getTracks) return null;
      stream.getTracks().forEach(function (t) {
        if (t && t.kind === kind && t.readyState === 'live') found = t;
      });
      return found;
    }
    function adopt(stream) {
      if (dcCall.gen !== gen || dcCall.phase === 'idle') {
        stopStream(stream);
        throw new Error('cancel');
      }
      var prev = dcCall.localStream;
      dcCall.localStream = stream;
      if (prev && prev !== stream) {
        prev.getTracks().forEach(function (t) {
          var keep = false;
          stream.getTracks().forEach(function (n) { if (n === t) keep = true; });
          if (!keep) { try { t.stop(); } catch (e) {} }
        });
      }
      try { dcEnsureCtx(); } catch (e2) {}
      dcSyncVideoStage();
      return stream;
    }
    if (dcCall.localStream) {
      var audioLive = !!liveTrack(dcCall.localStream, 'audio');
      var videoLive = !!liveTrack(dcCall.localStream, 'video');
      if (videoLive) dcCall.cameraNote = '';
      if (audioLive && (!wantVideo || videoLive)) return Promise.resolve(dcCall.localStream);
    }
    var audioC = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    function audioOnly() {
      return navigator.mediaDevices.getUserMedia({ audio: audioC, video: false }).then(adopt).then(undefined, function (err) {
        if (!err || err.message === 'cancel' || err.name !== 'OverconstrainedError') throw err;
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(adopt);
      });
    }
    if (!wantVideo) return audioOnly();

    function deniedName(err) {
      var name = (err && err.name) || '';
      return name === 'NotAllowedError' || name === 'PermissionDeniedError';
    }
    function cameraGranted() {
      try {
        if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve(false);
      } catch (e0) {
        return Promise.resolve(false);
      }
      return navigator.permissions.query({ name: 'camera' }).then(function (st) {
        return !!(st && st.state === 'granted');
      }, function () { return false; });
    }
    function withoutCamera(denial) {
      var note = denial
        ? 'No se permitió la cámara. La videollamada sigue solo con voz.'
        : 'No se pudo abrir la cámara. La videollamada sigue solo con voz.';
      var held = liveTrack(dcCall.localStream, 'audio');
      if (held) {
        dcCall.localStream.getVideoTracks().forEach(function (t) {
          if (!t || t.readyState !== 'live') { try { t.stop(); } catch (e) {} }
        });
        dcCall.cameraNote = note;
        try {
          var kept = adopt(dcCall.localStream);
          dcSyncVideoStage();
          return Promise.resolve(kept);
        } catch (eA) {
          return Promise.reject(eA);
        }
      }
      return audioOnly().then(function (stream) {
        dcCall.cameraNote = note;
        dcSyncVideoStage();
        return stream;
      });
    }
    function withMic(vStream) {
      if (!liveTrack(vStream, 'video')) {
        stopStream(vStream);
        return withoutCamera(false);
      }
      var held = liveTrack(dcCall.localStream, 'audio');
      if (held) {
        var mergedHeld = new MediaStream();
        mergedHeld.addTrack(held);
        vStream.getVideoTracks().forEach(function (t) {
          if (t && t.readyState === 'live') mergedHeld.addTrack(t);
        });
        vStream.getAudioTracks().forEach(function (t) {
          if (t && t !== held) { try { t.stop(); } catch (e) {} }
        });
        dcCall.cameraNote = '';
        try { return Promise.resolve(adopt(mergedHeld)); }
        catch (eM) { return Promise.reject(eM); }
      }
      function mix(aStream) {
        var merged = new MediaStream();
        aStream.getAudioTracks().forEach(function (t) { merged.addTrack(t); });
        vStream.getVideoTracks().forEach(function (t) {
          if (t && t.readyState === 'live') merged.addTrack(t);
        });
        dcCall.cameraNote = '';
        return adopt(merged);
      }
      return navigator.mediaDevices.getUserMedia({ audio: audioC, video: false }).then(mix, function (err) {
        if (err && err.message === 'cancel') {
          stopStream(vStream);
          throw err;
        }
        if (err && err.name === 'OverconstrainedError') {
          return navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(mix, function (err2) {
            stopStream(vStream);
            throw err2;
          });
        }
        stopStream(vStream);
        throw err;
      });
    }
    // facingMode exacto y width/height max lanzan OverconstrainedError después
    // de pulsar Permitir. El catch anterior lo pintaba como cámara denegada.
    var videos = [
      { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } },
      { facingMode: { ideal: 'user' } },
      true
    ];
    function openVideo(i) {
      if (i >= videos.length) {
        if (liveTrack(dcCall.localStream, 'audio')) return withoutCamera(false);
        return navigator.mediaDevices.getUserMedia({ audio: false, video: true }).then(function (vStream) {
          return withMic(vStream);
        }, function (err) {
          if (err && err.message === 'cancel') throw err;
          if (!deniedName(err)) return withoutCamera(false);
          return cameraGranted().then(function (ok) {
            return withoutCamera(!ok);
          });
        });
      }
      var heldAudio = !!liveTrack(dcCall.localStream, 'audio');
      var constraints = heldAudio
        ? { audio: false, video: videos[i] }
        : { audio: audioC, video: videos[i] };
      return navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
        if (liveTrack(stream, 'video')) {
          if (heldAudio) return withMic(stream);
          dcCall.cameraNote = '';
          return adopt(stream);
        }
        if (liveTrack(stream, 'audio') && !liveTrack(dcCall.localStream, 'audio')) dcCall.localStream = stream;
        else {
          stream.getTracks().forEach(function (t) {
            if (!t) return;
            var shared = false;
            if (dcCall.localStream) {
              dcCall.localStream.getTracks().forEach(function (n) { if (n === t) shared = true; });
            }
            if (!shared) { try { t.stop(); } catch (e) {} }
          });
        }
        return openVideo(i + 1);
      }, function (err) {
        if (err && err.message === 'cancel') throw err;
        if (!deniedName(err)) return openVideo(i + 1);
        // Audio+vídeo juntos a veces rechaza con NotAllowedError aunque la
        // cámara ya esté concedida. Solo es denegación si el vídeo solo también lo es.
        if (constraints.audio) {
          return navigator.mediaDevices.getUserMedia({ audio: false, video: videos[i] }).then(function (vStream) {
            return withMic(vStream);
          }, function (errV) {
            if (errV && errV.message === 'cancel') throw errV;
            if (!deniedName(errV)) return openVideo(i + 1);
            return cameraGranted().then(function (ok) {
              if (ok) return openVideo(i + 1);
              return withoutCamera(true);
            });
          });
        }
        return withoutCamera(true);
      });
    }
    return openVideo(0);
  }
  function dcStartPcmSend() {
    dcStopPcmSend();
    if (dcCall.phase !== 'active' || !dcCall.localStream) return;
    try {
      var ctx = dcEnsureCtx();
      if (!ctx) return;
      var callId = dcCall.callId;
      dcCall.pcmSrc = ctx.createMediaStreamSource(dcCall.localStream);
      dcCall.pcmProc = ctx.createScriptProcessor(2048, 1, 1);
      dcCall.pcmSink = ctx.createGain();
      dcCall.pcmSink.gain.value = 0;
      dcCall.pcmSrc.connect(dcCall.pcmProc);
      dcCall.pcmProc.connect(dcCall.pcmSink);
      dcCall.pcmSink.connect(ctx.destination);
      dcCall.pcmProc.onaudioprocess = function (ev) {
        if (dcCall.phase !== 'active' || dcCall.callId !== callId) return;
        var input = ev.inputBuffer.getChannelData(0);
        var rateIn = ctx.sampleRate || 48000;
        var step = rateIn / 16000;
        var n = Math.floor(input.length / step);
        if (n < 16) return;
        var bytes = new Uint8Array(n * 2);
        for (var i = 0; i < n; i++) {
          var s = input[Math.floor(i * step)] || 0;
          if (s > 1) s = 1; else if (s < -1) s = -1;
          var v = (s < 0 ? s * 0x8000 : s * 0x7fff) | 0;
          bytes[i * 2] = v & 255;
          bytes[i * 2 + 1] = (v >> 8) & 255;
        }
        dcSend({ type: 'voice_pcm', callId: callId, rate: 16000, pcm: dcB64FromBytes(bytes) });
      };
    } catch (e) {}
  }
  function dcWebrtcHears() {
    var pc = dcCall.pc;
    if (!pc) return false;
    var live = pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed';
    if (!live) return false;
    var a = dcCall.remoteAudio;
    if (!a || !a.srcObject || a.muted || a.paused) return false;
    if (typeof a.volume === 'number' && a.volume <= 0) return false;
    return true;
  }
  function dcPlayPcm(b64, rate) {
    if (dcCall.phase !== 'active' || !b64 || dcWebrtcHears()) return;
    try {
      var ctx = dcEnsureCtx();
      if (!ctx) return;
      var bytes = dcBytesFromB64(b64);
      var n = Math.floor(bytes.length / 2);
      if (n < 8) return;
      var f32 = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        var v = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
        if (v & 0x8000) v = v - 0x10000;
        f32[i] = v / 0x8000;
      }
      var buf = ctx.createBuffer(1, n, rate || 16000);
      buf.copyToChannel(f32, 0);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var gain = dcEnsureGain();
      if (!gain) return;
      gain.gain.value = 1;
      src.connect(gain);
      dcCall.pcmNodes.push(src);
      src.onended = function () {
        var ix = dcCall.pcmNodes.indexOf(src);
        if (ix >= 0) dcCall.pcmNodes.splice(ix, 1);
      };
      var now = ctx.currentTime + 0.02;
      var when = Math.max(now, dcCall.pcmPlayAt || 0);
      if (when - now > 0.35) when = now;
      src.start(when);
      dcCall.pcmPlayAt = when + buf.duration;
    } catch (e) {}
  }
  function dcEnsureAudio() {
    if (dcCall.remoteAudio && dcCall.remoteAudio.isConnected) return dcCall.remoteAudio;
    try { if (dcCall.remoteAudio) { dcCall.remoteAudio.pause(); dcCall.remoteAudio.srcObject = null; dcCall.remoteAudio.remove(); } } catch (e0) {}
    var a = document.createElement('audio');
    a.autoplay = true;
    a.playsInline = true;
    a.setAttribute('playsinline', '');
    a.setAttribute('data-dc-voice', '1');
    a.volume = 1;
    a.muted = false;
    a.style.display = 'none';
    document.body.appendChild(a);
    dcCall.remoteAudio = a;
    return a;
  }
  function dcQueueIce(pc, cand) {
    if (!cand) return;
    if (pc.remoteDescription && pc.remoteDescription.type) pc.addIceCandidate(cand).catch(function () {});
    else {
      dcCall.pendingIce = dcCall.pendingIce || [];
      dcCall.pendingIce.push(cand);
    }
  }
  function dcFlushIce(pc) {
    var list = dcCall.pendingIce || [];
    dcCall.pendingIce = [];
    list.forEach(function (cand) { pc.addIceCandidate(cand).catch(function () {}); });
  }
  function dcEnsurePc() {
    if (dcCall.pc) return dcCall.pc;
    var pc = new RTCPeerConnection({ iceServers: DC_ICE });
    dcCall.pc = pc;
    dcCall.pendingIce = [];
    if (dcCall.localStream) {
      dcCall.localStream.getTracks().forEach(function (track) {
        try { pc.addTrack(track, dcCall.localStream); } catch (e) {}
      });
    }
    pc.onicecandidate = function (ev) {
      if (!ev.candidate || dcCall.phase !== 'active') return;
      dcSend({ type: 'voice_signal', callId: dcCall.callId, signal: { kind: 'ice', candidate: dcIcePlain(ev.candidate) } });
    };
    pc.ontrack = function (ev) {
      var track = ev.track;
      if (track && track.kind === 'video') {
        dcSyncVideoStage();
        var vid = dcCall.remoteVideo;
        if (vid) {
          var vs = new MediaStream([track]);
          if (vid.srcObject !== vs) vid.srcObject = vs;
          vid.muted = true;
          vid.style.visibility = '';
          var prv = vid.play();
          if (prv && typeof prv.catch === 'function') prv.catch(function () {});
        }
        return;
      }
      var stream = (ev.streams && ev.streams[0]) ? ev.streams[0] : new MediaStream(track ? [track] : []);
      var audioTracks = stream.getAudioTracks();
      var audioStream = audioTracks.length ? new MediaStream(audioTracks) : stream;
      var audio = dcEnsureAudio();
      if (audio.srcObject !== audioStream) audio.srcObject = audioStream;
      audio.muted = false;
      try { audio.volume = 1; } catch (eV) {}
      var pr = audio.play();
      if (pr && typeof pr.catch === 'function') pr.catch(function () {});
    };
    pc.onconnectionstatechange = function () {
      if (dcCall.pc !== pc) return;
      if (pc.connectionState === 'failed') dcOnPcFailed();
    };
    pc.oniceconnectionstatechange = function () {
      if (dcCall.pc !== pc) return;
      if (pc.iceConnectionState === 'failed') dcOnPcFailed();
    };
    return pc;
  }
  async function dcMakeOffer() {
    if (dcCall.phase !== 'active' || dcCall.role !== 'caller' || !dcCall.localStream) return;
    var pc = dcEnsurePc();
    if (!pc || pc._makingOffer) return;
    try {
      pc._makingOffer = true;
      var offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: dcCall.media === 'video' });
      if (dcCall.phase !== 'active') return;
      await pc.setLocalDescription(offer);
      dcSend({ type: 'voice_signal', callId: dcCall.callId, signal: { kind: 'offer', sdp: dcSdpPlain(pc.localDescription) } });
    } catch (e) {
      console.warn('dc offer', e);
    } finally {
      if (pc) pc._makingOffer = false;
    }
  }
  async function dcHandleSignal(from, signal) {
    if (!signal || dcCall.phase !== 'active') return;
    if (from && dcCall.peer && String(from).toLowerCase() !== String(dcCall.peer.email || '').toLowerCase()) return;
    var pc = dcEnsurePc();
    try {
      if (signal.kind === 'offer' && signal.sdp) {
        if (dcCall.role !== 'callee') return;
        await pc.setRemoteDescription(signal.sdp);
        dcFlushIce(pc);
        var answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        dcSend({ type: 'voice_signal', callId: dcCall.callId, signal: { kind: 'answer', sdp: dcSdpPlain(pc.localDescription) } });
      } else if (signal.kind === 'answer' && signal.sdp) {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(signal.sdp);
          dcFlushIce(pc);
        }
      } else if (signal.kind === 'ice' && signal.candidate) {
        dcQueueIce(pc, signal.candidate);
      }
    } catch (e) {
      console.warn('dc signal', e);
    }
  }
  function dcBeginMedia() {
    if (dcCall.phase !== 'active') return;
    try { dcEnsureCtx(); } catch (e) {}
    dcStartPcmSend();
    dcSyncVideoStage();
    dcStartVideoFallback();
    if (dcCall.role === 'caller') dcMakeOffer();
  }
  function dcReset(reason) {
    dcPushRingStop('');
    dcCall.gen += 1;
    dcCall.phase = 'idle';
    var stream = dcCall.localStream;
    var pc = dcCall.pc;
    var ctx = dcCall.audioCtx;
    var audio = dcCall.remoteAudio;
    if (dcCall.ringTimer) clearTimeout(dcCall.ringTimer);
    dcStopVideoFallback();
    dcCleanupVideoExtras();
    dcStopPcmSend();
    dcDropPcmPlay();
    dcCall.media = 'audio';
    dcCall.cameraNote = '';
    dcCall.role = '';
    dcCall.callId = '';
    dcCall.peer = null;
    dcCall.localStream = null;
    dcCall.pc = null;
    dcCall.audioCtx = null;
    dcCall.remoteAudio = null;
    dcCall.pendingIce = [];
    dcCall.ringTimer = null;
    dcCall.pcmPlayAt = 0;
    dcCall.answering = false;
    dcCall.labelHidden = false;
    if (pc) {
      try { pc.onicecandidate = null; pc.ontrack = null; pc.close(); } catch (ePc) {}
    }
    if (stream) {
      stream.getTracks().forEach(function (t) { try { t.stop(); } catch (eT) {} });
    }
    if (audio) {
      try { audio.pause(); audio.srcObject = null; audio.remove(); } catch (eA) {}
    }
    try {
      document.querySelectorAll('audio[data-dc-voice]').forEach(function (a) {
        try { a.pause(); a.srcObject = null; a.remove(); } catch (eR) {}
      });
    } catch (eQ) {}
    if (ctx) {
      try { ctx.close(); } catch (eC) {}
    }
    dcHideVideoStage();
    emitDcCall();
    return reason || '';
  }
  function dcDropForError(why) {
    if (dcCall.phase === 'idle' || dcCall._dropping) return;
    dcCall._dropping = true;
    var id = dcCall.callId;
    var phase = dcCall.phase;
    dcStopRingtone();
    dcPlayCallError(id);
    // WebRTC still has a socket: tell the peer this was an error, not Colgar.
    // A dead socket is closed by the server (active -> disconnect, caller ring -> missed).
    if (id && phase === 'active' && why !== 'ws') {
      dcSend({ type: 'call_hangup', callId: id, reason: 'error' });
    }
    dcReset('error');
    dcCall._dropping = false;
    if (phase === 'active') dcBoardCallFinish(id);
    else {
      showDcBanner('Llamada interrumpida', []);
      setTimeout(hideDcBanner, 2600);
    }
  }

  var dcBoardCounting = false;

  function dcBoardSay(text) {
    try {
      fetch('/api/board/say', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text })
      });
    } catch (e) {}
  }

  function dcBoardCallStart() {
    if (dcBoardCounting) return;
    dcBoardCounting = true;
    dcBoardSay('~c1');
  }

  var dcDurationSeen = {};
  var dcDurWaitGen = 0;

  function dcFormatMinutes(m, s) {
    m = parseInt(m, 10);
    s = parseInt(s, 10);
    if (!(m >= 0) || !(s >= 0) || s > 59) return '';
    return (m * 60 + s) + ' segundos';
  }

  function dcFormatBoardDur(line) {
    var parts = String(line || '').split(' ');
    if (parts[0] !== '~d') return null;
    var m = parseInt(parts[1], 10);
    var s = parseInt(parts[2], 10);
    var label = dcFormatMinutes(m, s);
    if (!label) return null;
    return { minutes: m, seconds: s, label: label };
  }

  function dcShowHangupDuration(label) {
    if (!label) return;
    showDcBanner('Llamada terminada · ' + label, []);
    setTimeout(hideDcBanner, 8000);
    try {
      if (typeof global.snakeOsShowCallDuration === 'function') global.snakeOsShowCallDuration(label);
    } catch (e) {}
  }

  function dcPublishDuration(callId, minutes, seconds) {
    var label = dcFormatMinutes(minutes, seconds);
    if (!label) return;
    if (callId) dcDurationSeen[callId] = label;
    dcShowHangupDuration(label);
    if (callId) dcSend({ type: 'call_duration', callId: callId, minutes: minutes, seconds: seconds });
  }

  function dcAcceptRemoteDuration(callId, minutes, seconds) {
    var label = dcFormatMinutes(minutes, seconds);
    if (!label) return;
    dcDurWaitGen += 1;
    dcDurationSeen[callId] = label;
    dcShowHangupDuration(label);
  }

  function dcAwaitRemoteDuration(callId) {
    if (callId && dcDurationSeen[callId]) {
      dcShowHangupDuration(dcDurationSeen[callId]);
      return;
    }
    var gen = ++dcDurWaitGen;
    setTimeout(function () {
      if (gen !== dcDurWaitGen) return;
      if (callId && dcDurationSeen[callId]) return;
      dcBoardCallFinish(callId);
    }, 2800);
  }

  function dcBoardCallFinish(callId) {
    if (!dcBoardCounting) return;
    dcBoardCounting = false;
    dcBoardSay('~c?');
  }

  function dcHangup() {
    if (dcCall.phase === 'idle') return;
    var id = dcCall.callId;
    var wasPhase = dcCall.phase;
    dcStopRingtone();
    dcPlayCallEnd(id);
    if (id) dcSend({ type: 'call_hangup', callId: id });
    dcReset('hangup');
    hideDcBanner();
    if (wasPhase === 'active') dcBoardCallFinish(id);
  }
  function dcDecline() {
    if (dcCall.phase !== 'ringing') { dcHangup(); return; }
    var id = dcCall.callId;
    dcStopRingtone();
    dcPlayCallEnd(id);
    if (id) dcSend({ type: 'call_decline', callId: id });
    dcReset('decline');
    hideDcBanner();
  }
  async function dcStartCall(peer, asVideo, via) {
    // peer.email (Chat) o peer.number (Teléfono, número DOG-XXXXXX que resuelve el servidor)
    if (!peer || (!peer.email && !peer.number)) return;
    if (dcCall.phase !== 'idle') return;
    dcStopNoAnswerCue();
    var email = String(peer.email || '').trim().toLowerCase();
    var me = currentUser();
    if (email && me && me.email && String(me.email).toLowerCase() === email) return;
    var dcAllowed = false;
    try {
      if (email) {
        var addedData = await apiFn()('/api/added-accounts');
        dcAllowed = ((addedData && addedData.accounts) || []).some(function (a) {
          return String((a && a.email) || '').toLowerCase() === email;
        });
      } else if (peer.number) {
        var lookedUp = await apiFn()('/api/phone/lookup?number=' + encodeURIComponent(String(peer.number)));
        dcAllowed = !!(lookedUp && lookedUp.id && !lookedUp.self);
      }
    } catch (eAllow) { dcAllowed = false; }
    if (!dcAllowed) {
      showDcBanner('Solo puedes llamar a cuentas que has añadido', []);
      setTimeout(hideDcBanner, 2600);
      return;
    }
    dcCall.phase = 'ringing';
    dcCall.role = 'caller';
    dcCall.media = asVideo ? 'video' : 'audio';
    dcCall.cameraNote = '';
    dcCall.callId = ('c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    if (dcCall.callEndPlayed && dcCall.callEndPlayed !== dcCall.callId) dcCall.callEndPlayed = '';
    dcCall.peer = {
      email: email,
      name: peer.name || email || String(peer.number || ''),
      avatar: peer.avatar || '🐶',
      id: peer.id,
      number: peer.number ? String(peer.number) : ''
    };
    emitDcCall();
    showDcBanner(dcOutgoingText(), [{ label: 'Colgar', cls: 'no', fn: dcHangup }]);
    try {
      await dcEnsureMic();
    } catch (e) {
      if (dcCall.phase === 'idle') return;
      dcReset('mic');
      showDcBanner(dcMicFailText(), []);
      setTimeout(hideDcBanner, 2600);
      return;
    }
    if (dcCall.phase !== 'ringing') return;
    if (dcCall.cameraNote) showDcBanner(dcCall.cameraNote, [{ label: 'Colgar', cls: 'no', fn: dcHangup }]);
    else showDcBanner(dcOutgoingText(), [{ label: 'Colgar', cls: 'no', fn: dcHangup }]);
    var inviteMsg = {
      type: 'call_invite',
      callId: dcCall.callId,
      media: dcCall.media === 'video' ? 'video' : 'audio'
    };
    if (via === 'i9') inviteMsg.via = 'i9';
    if (email) inviteMsg.to = email;
    else if (peer.number) inviteMsg.toNumber = String(peer.number);
    else {
      dcReset('error');
      showDcBanner('No hay destino para la llamada', []);
      setTimeout(hideDcBanner, 2600);
      return;
    }
    if (!dcSend(inviteMsg)) {
      dcReset('offline');
      showDcBanner('Sin conexión con el chat', []);
      setTimeout(hideDcBanner, 2600);
      return;
    }
    dcArmRingTimer();
  }
  async function dcAnswer() {
    if (dcCall.phase !== 'ringing' || dcCall.role !== 'callee' || dcCall.answering) return;
    dcCall.answering = true;
    dcStopNoAnswerCue();
    dcSyncRingtone();
    showDcBanner('Conectando con ' + dcPeerName() + '…', [{ label: 'Colgar', cls: 'no', fn: dcHangup }]);
    try {
      await dcEnsureMic();
    } catch (e) {
      showDcBanner(dcMicFailText(), []);
      setTimeout(function () { dcDecline(); }, 500);
      return;
    }
    if (dcCall.cameraNote) showDcBanner(dcCall.cameraNote, [{ label: 'Colgar', cls: 'no', fn: dcHangup }]);
    if (dcCall.phase !== 'ringing' || dcCall.role !== 'callee') return;
    if (!dcSend({ type: 'call_answer', callId: dcCall.callId })) {
      dcReset('offline');
      showDcBanner('Sin conexión con el chat', []);
      setTimeout(hideDcBanner, 2600);
      return;
    }
    try {
      // Si el Teléfono está abierto, no saltar al Chat al contestar
      if (!document.getElementById('win-phone') && dcCall.peer && dcCall.peer.email && typeof openChatWithPeer === 'function') openChatWithPeer(dcCall.peer.email);
    } catch (eOpen) {}
  }
  function dcActiveBanner() {
    showDcBanner(dcActiveText(), [{ label: 'Colgar', cls: 'no', fn: dcHangup }]);
  }
  function dcQueueNotifCallAction(action, callId) {
    if (action !== 'answer' && action !== 'decline') return;
    var id = callId ? String(callId) : '';
    if (dcCall.phase === 'ringing' && dcCall.role === 'callee' && (!id || dcCall.callId === id)) {
      if (action === 'answer') dcAnswer();
      else dcDecline();
      return;
    }
    dcCall.pendingNotifAction = { action: action, callId: id, at: Date.now() };
  }
  function dcTakePendingCallAction(callId) {
    var pending = dcCall.pendingNotifAction;
    if (!pending) return false;
    if (pending.at && Date.now() - pending.at > 60000) {
      dcCall.pendingNotifAction = null;
      return false;
    }
    if (pending.callId && callId && String(pending.callId) !== String(callId)) return false;
    dcCall.pendingNotifAction = null;
    if (pending.action === 'decline') dcDecline();
    else if (pending.action === 'answer') dcAnswer();
    else return false;
    return true;
  }

  function dcIsVideo() {
    return dcCall.media === 'video';
  }
  function dcMicFailText() {
    if (dcIsVideo()) return 'Permite el micrófono. Sin micrófono no se puede hacer la videollamada.';
    return 'No se pudo usar el micrófono';
  }
  function dcIncomingText() {
    return dcIsVideo()
      ? (dcPeerName() + ' te está haciendo una videollamada' + dcPeerNumberSuffix())
      : (dcPeerName() + ' te está llamando' + dcPeerNumberSuffix());
  }
  function dcOutgoingText() {
    return dcIsVideo()
      ? ('Videollamando a ' + dcPeerName() + '…' + dcPeerNumberSuffix())
      : ('Llamando a ' + dcPeerName() + '…' + dcPeerNumberSuffix());
  }
  function dcActiveText() {
    return (dcIsVideo() ? 'En videollamada con ' : 'En llamada con ') + dcPeerName();
  }
  function dcSetVideoMinimized(minimized) {
    dcCall.videoMinimized = !!minimized;
    dcSyncVideoStage();
  }
  function dcHideVideoStage() {
    dcStopVideoFallback();
    var el = document.getElementById('dcVideoStage');
    if (el) {
      try {
        el.querySelectorAll('video').forEach(function (v) {
          try { v.pause(); v.srcObject = null; } catch (e0) {}
        });
      } catch (e1) {}
      el.remove();
    }
    dcCall.localPreview = null;
    dcCall.remoteVideo = null;
    dcCall.fallbackImg = null;
    dcCall.videoMinimized = false;
  }
  function dcSyncVideoStage() {
    if (!dcIsVideo() || dcCall.phase === 'idle') {
      dcHideVideoStage();
      return;
    }
    var stage = document.getElementById('dcVideoStage');
    if (!stage) {
      stage = document.createElement('div');
      stage.id = 'dcVideoStage';
      stage.className = 'dc-video-stage';
      stage.setAttribute('role', 'region');
      stage.setAttribute('aria-label', 'Videollamada');
      var remote = document.createElement('video');
      remote.className = 'dc-remote-video';
      remote.autoplay = true;
      remote.playsInline = true;
      remote.muted = true;
      remote.setAttribute('playsinline', '');
      var img = document.createElement('img');
      img.className = 'dc-fallback-video';
      img.alt = 'Vídeo del contacto';
      var local = document.createElement('video');
      local.className = 'dc-local-video';
      local.autoplay = true;
      local.muted = true;
      local.playsInline = true;
      local.setAttribute('playsinline', '');
      var note = document.createElement('div');
      note.className = 'dc-video-note';
      var toggle = document.createElement('button');
      toggle.className = 'dc-video-toggle';
      toggle.type = 'button';
      toggle.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        dcSetVideoMinimized(!dcCall.videoMinimized);
      });
      stage.tabIndex = 0;
      stage.addEventListener('click', function (ev) {
        if (dcCall.videoMinimized && ev.target !== toggle) dcSetVideoMinimized(false);
      });
      stage.addEventListener('keydown', function (ev) {
        if (dcCall.videoMinimized && (ev.key === 'Enter' || ev.key === ' ')) {
          ev.preventDefault();
          dcSetVideoMinimized(false);
        }
      });
      stage.appendChild(remote);
      stage.appendChild(img);
      stage.appendChild(local);
      stage.appendChild(note);
      stage.appendChild(toggle);
      var ctr = document.createElement('div');
      ctr.className = 'dc-video-ctrls';
      [['cam', '📷', 'Apagar cámara'], ['flip', '🔄', 'Girar cámara'], ['screen', '🖥️', 'Compartir pantalla']].forEach(function (b) {
        var cb = document.createElement('button');
        cb.type = 'button';
        cb.className = 'dc-vc-btn';
        cb.setAttribute('data-vc', b[0]);
        cb.textContent = b[1];
        cb.title = b[2];
        cb.setAttribute('aria-label', b[2]);
        cb.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          dcVideoCtrl(b[0]);
        });
        ctr.appendChild(cb);
      });
      stage.appendChild(ctr);
      document.body.appendChild(stage);
      dcCall.remoteVideo = remote;
      dcCall.fallbackImg = img;
      dcCall.localPreview = local;
    }
    var minimized = !!dcCall.videoMinimized;
    stage.classList.toggle('is-minimized', minimized);
    var toggleEl = stage.querySelector('.dc-video-toggle');
    if (toggleEl) {
      toggleEl.textContent = minimized ? 'Ampliar' : 'Minimizar';
      toggleEl.setAttribute('aria-label', minimized ? 'Ampliar vídeo' : 'Minimizar vídeo');
      toggleEl.title = minimized ? 'Ampliar' : 'Minimizar';
    }
    dcPaintVideoCtrls(stage);
    var noteEl = stage.querySelector('.dc-video-note');
    if (noteEl) {
      var t = dcCall.cameraNote || '';
      if (!t && dcCall.phase === 'ringing') t = dcCall.role === 'callee' ? 'Videollamada entrante' : 'Videollamando…';
      else if (!t && dcCall.phase === 'active' && !dcWebrtcVideoLive()) t = 'Vídeo por el chat';
      noteEl.textContent = t;
    }
    var local = dcCall.localPreview;
    var stream = dcCall.localStream;
    if (local) {
      var vtracks = [];
      if (stream) {
        stream.getVideoTracks().forEach(function (tr) {
          if (tr && tr.readyState === 'live') vtracks.push(tr);
        });
      }
      if (vtracks.length) {
        if (local.srcObject !== stream) local.srcObject = stream;
        local.style.display = '';
        var pr = local.play();
        if (pr && typeof pr.catch === 'function') pr.catch(function () {});
      } else {
        local.style.display = 'none';
      }
    }
  }
  function dcIsMobileUa() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  }
  function dcCanScreenShare() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !dcIsMobileUa();
  }
  function dcLiveVideoTrack() {
    var s = dcCall.localStream;
    if (!s) return null;
    var v = s.getVideoTracks();
    for (var i = 0; i < v.length; i++) if (v[i] && v[i].readyState === 'live') return v[i];
    return null;
  }
  function dcVideoSender() {
    var pc = dcCall.pc;
    if (!pc || !pc.getSenders) return null;
    var ss = pc.getSenders();
    for (var i = 0; i < ss.length; i++) if (ss[i].track && ss[i].track.kind === 'video') return ss[i];
    if (pc.getTransceivers) {
      var ts = pc.getTransceivers();
      for (var j = 0; j < ts.length; j++) {
        var t = ts[j];
        if (t && t.sender && t.receiver && t.receiver.track && t.receiver.track.kind === 'video') return t.sender;
      }
    }
    return null;
  }
  /** Cambia la pista de vídeo local (cámara ↔ pantalla) sin renegociar. */
  function dcSwapLocalVideo(newTrack, stopOld) {
    var s = dcCall.localStream;
    if (s) {
      s.getVideoTracks().forEach(function (t) {
        try { s.removeTrack(t); } catch (e0) {}
        if (stopOld) { try { t.stop(); } catch (e1) {} }
      });
      try { s.addTrack(newTrack); } catch (e2) {}
    }
    var snd = dcVideoSender();
    var p = snd && snd.replaceTrack ? snd.replaceTrack(newTrack) : Promise.resolve();
    var lp = dcCall.localPreview;
    if (lp && s) {
      try { lp.srcObject = null; lp.srcObject = s; } catch (e3) {}
    }
    dcSyncVideoStage();
    return Promise.resolve(p).catch(function (e) { console.warn('dc replaceTrack', e); });
  }
  function dcStopScreenShare() {
    var scr = dcCall.screenTrack;
    var cam = dcCall.camSaved;
    dcCall.screenTrack = null;
    dcCall.camSaved = null;
    if (scr) { try { scr.onended = null; scr.stop(); } catch (e0) {} }
    if (cam && cam.readyState === 'live' && dcCall.phase !== 'idle') {
      cam.enabled = !dcCall.camOff;
      dcSwapLocalVideo(cam, true);
    } else if (cam) {
      try { cam.stop(); } catch (e1) {}
      dcSyncVideoStage();
    }
  }
  function dcCleanupVideoExtras() {
    if (dcCall.screenTrack) { try { dcCall.screenTrack.onended = null; dcCall.screenTrack.stop(); } catch (e0) {} }
    if (dcCall.camSaved) { try { dcCall.camSaved.stop(); } catch (e1) {} }
    dcCall.screenTrack = null;
    dcCall.camSaved = null;
    dcCall.camOff = false;
    dcCall.flipping = false;
    dcCall.facing = 'user';
  }
  function dcVideoNote(t) {
    dcCall.cameraNote = t || '';
    dcSyncVideoStage();
    if (t) setTimeout(function () { if (dcCall.cameraNote === t) { dcCall.cameraNote = ''; dcSyncVideoStage(); } }, 3500);
  }
  function dcVideoCtrl(what) {
    if (!dcIsVideo() || dcCall.phase === 'idle') return;
    if (what === 'cam') {
      dcCall.camOff = !dcCall.camOff;
      var cam = dcCall.screenTrack ? dcCall.camSaved : dcLiveVideoTrack();
      if (cam) cam.enabled = !dcCall.camOff;
      dcVideoNote(dcCall.camOff ? 'Cámara apagada' : '');
      return;
    }
    if (what === 'flip') {
      if (dcCall.screenTrack) { dcVideoNote('Deja de compartir pantalla para girar la cámara'); return; }
      if (dcCall.flipping) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
      var prevFacing = dcCall.facing === 'environment' ? 'environment' : 'user';
      var next = prevFacing === 'environment' ? 'user' : 'environment';
      var old = dcLiveVideoTrack();
      var gumCam = function (facing) {
        return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing } } }).then(function (st) {
          var t = st.getVideoTracks()[0];
          if (!t) throw new Error('sin vídeo');
          return t;
        });
      };
      var adoptCam = function (t, facing) {
        if (dcCall.phase === 'idle') { try { t.stop(); } catch (e1) {} return; }
        dcCall.facing = facing;
        t.enabled = !dcCall.camOff;
        return dcSwapLocalVideo(t, true);
      };
      dcCall.flipping = true;
      // En muchos móviles hay que soltar la cámara actual antes de abrir la otra.
      var released = false;
      if (old && dcIsMobileUa()) { try { old.stop(); released = true; } catch (e0) {} }
      gumCam(next).then(function (t) {
        return adoptCam(t, next);
      }).catch(function () {
        dcVideoNote('No se pudo cambiar de cámara');
        // Si soltamos la cámara anterior, la volvemos a abrir para no quedarnos sin vídeo.
        if (released && dcCall.phase !== 'idle') {
          return gumCam(prevFacing).then(function (t) { return adoptCam(t, prevFacing); }).catch(function () {
            dcVideoNote('Se ha perdido la cámara. Pulsa 🔄 para reintentar');
          });
        }
      }).then(function () { dcCall.flipping = false; }, function () { dcCall.flipping = false; });
      return;
    }
    if (what === 'screen') {
      if (dcCall.screenTrack) { dcStopScreenShare(); return; }
      if (!dcCanScreenShare()) { dcVideoNote('Compartir pantalla solo funciona en el ordenador'); return; }
      if (dcCall.phase !== 'active') { dcVideoNote('Espera a que contesten para compartir pantalla'); return; }
      if (!dcVideoSender()) {
        dcVideoNote('No se puede compartir pantalla: la llamada no tiene vídeo. Cuelga y haz una videollamada.');
        return;
      }
      navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }).then(function (ds) {
        var t = ds.getVideoTracks()[0];
        if (!t) return;
        if (dcCall.phase !== 'active') { try { t.stop(); } catch (e1) {} return; }
        dcCall.camSaved = dcLiveVideoTrack();
        dcCall.screenTrack = t;
        t.onended = function () { if (dcCall.screenTrack === t) dcStopScreenShare(); };
        dcSwapLocalVideo(t, false);
        dcVideoNote('Compartiendo pantalla');
      }).catch(function () {});
    }
  }
  function dcPaintVideoCtrls(stage) {
    if (!stage) return;
    stage.classList.toggle('is-sharing', !!dcCall.screenTrack);
    var cam = stage.querySelector('[data-vc="cam"]');
    var flip = stage.querySelector('[data-vc="flip"]');
    var scr = stage.querySelector('[data-vc="screen"]');
    if (cam) {
      cam.classList.toggle('on', !!dcCall.camOff);
      cam.textContent = dcCall.camOff ? '🚫' : '📷';
      var ct = dcCall.camOff ? 'Encender cámara' : 'Apagar cámara';
      cam.title = ct;
      cam.setAttribute('aria-label', ct);
    }
    if (flip) flip.hidden = !dcIsMobileUa() || !!dcCall.screenTrack;
    if (scr) {
      scr.hidden = !dcCanScreenShare() || dcCall.phase !== 'active';
      scr.classList.toggle('share-on', !!dcCall.screenTrack);
      var st = dcCall.screenTrack ? 'Dejar de compartir pantalla' : 'Compartir pantalla';
      scr.title = st;
      scr.setAttribute('aria-label', st);
    }
  }
  function dcStopVideoFallback() {
    if (dcCall.videoTimer) {
      clearTimeout(dcCall.videoTimer);
      dcCall.videoTimer = null;
    }
  }
  function dcWebrtcConnected() {
    var pc = dcCall.pc;
    if (!pc) return false;
    return pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed';
  }
  function dcWebrtcVideoLive() {
    if (!dcWebrtcConnected()) return false;
    var v = dcCall.remoteVideo;
    if (!v || !v.srcObject) return false;
    if (v.readyState < 2) return false;
    return v.videoWidth > 0;
  }
  function dcHideFallbackFrame() {
    var img = dcCall.fallbackImg;
    if (img) img.style.display = 'none';
    if (dcCall.remoteVideo) dcCall.remoteVideo.style.visibility = '';
  }
  function dcShowFallbackFrame(b64) {
    if (dcCall.phase !== 'active' || !dcIsVideo() || !b64) return;
    if (dcWebrtcVideoLive()) {
      dcHideFallbackFrame();
      return;
    }
    dcSyncVideoStage();
    var img = dcCall.fallbackImg;
    if (!img) return;
    img.style.display = 'block';
    if (dcCall.remoteVideo) dcCall.remoteVideo.style.visibility = 'hidden';
    img.src = 'data:image/jpeg;base64,' + b64;
  }
  function dcStartVideoFallback() {
    dcStopVideoFallback();
    if (dcCall.phase !== 'active' || !dcIsVideo()) return;
    var callId = dcCall.callId;
    var canvas = document.createElement('canvas');
    function tick() {
      if (dcCall.phase !== 'active' || dcCall.callId !== callId || !dcIsVideo()) return;
      dcCall.videoTimer = setTimeout(tick, 160);
      if (dcWebrtcVideoLive()) {
        dcHideFallbackFrame();
        return;
      }
      var preview = dcCall.localPreview;
      if (!preview || !preview.videoWidth) return;
      var w = 320;
      var h = Math.max(1, Math.round(preview.videoHeight * (w / preview.videoWidth)));
      if (h > 240) {
        h = 240;
        w = Math.max(1, Math.round(preview.videoWidth * (240 / preview.videoHeight)));
      }
      canvas.width = w;
      canvas.height = h;
      try {
        var ctx = canvas.getContext('2d');
        ctx.drawImage(preview, 0, 0, w, h);
        var data = canvas.toDataURL('image/jpeg', 0.45);
        var comma = data.indexOf(',');
        var b64 = comma >= 0 ? data.slice(comma + 1) : '';
        if (!b64 || b64.length > 70000) return;
        dcSend({ type: 'video_frame', callId: callId, jpeg: b64 });
      } catch (eF) {}
    }
    tick();
  }
  function dcOnPcFailed() {
    if (dcCall.media === 'video') {
      dcSyncVideoStage();
      return;
    }
    dcDropForError('webrtc');
  }
  function dcCompressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('Eso no es una imagen')); return; }
      var type = String(file.type || '');
      if (type && type.indexOf('image/') !== 0) {
        reject(new Error('Eso no es una imagen'));
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try { URL.revokeObjectURL(url); } catch (e0) {}
        var w = img.naturalWidth || img.width || 0;
        var h = img.naturalHeight || img.height || 0;
        if (!w || !h) { reject(new Error('No se pudo leer la foto')); return; }
        var edge = 1600;
        var data = '';
        for (var attempt = 0; attempt < 6; attempt++) {
          var scale = Math.min(1, edge / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, cw, ch);
          var q = Math.max(0.42, 0.82 - attempt * 0.08);
          try { data = canvas.toDataURL('image/jpeg', q); } catch (eC) {
            reject(new Error('No se pudo leer la foto. Usa JPG o PNG.'));
            return;
          }
          if (data.length <= 1500000) { resolve(data); return; }
          edge = Math.round(edge * 0.72);
        }
        reject(new Error('La foto es demasiado grande'));
      };
      img.onerror = function () {
        try { URL.revokeObjectURL(url); } catch (e1) {}
        reject(new Error('No se pudo leer la foto. Usa JPG o PNG.'));
      };
      img.src = url;
    });
  }

  function handleDcCallPayload(msg) {
    if (!msg || !msg.type) return false;
    var t = msg.type;
    if (t === 'board_place_call' && msg.peer) {
      try { placeBoardCall(msg.peer); } catch (eBoardCall) {}
      return true;
    }
    if (t === 'call_duration') {
      dcAcceptRemoteDuration(String(msg.callId || ''), msg.minutes, msg.seconds);
      return true;
    }
    if (t === 'call_invite') {
      if (!msg.callId || !msg.from) return true;
      if (dcCall.phase !== 'idle') {
        dcSend({ type: 'call_decline', callId: msg.callId });
        return true;
      }
      dcCall.phase = 'ringing';
      dcCall.role = 'callee';
      dcCall.callId = String(msg.callId);
      dcCall.media = msg.media === 'video' ? 'video' : 'audio';
      dcCall.cameraNote = '';
      if (dcCall.callEndPlayed && dcCall.callEndPlayed !== dcCall.callId) dcCall.callEndPlayed = '';
      dcCall.peer = {
        email: String(msg.from.email || '').toLowerCase(),
        name: msg.from.name || msg.from.email || 'Alguien',
        avatar: msg.from.avatar || '🐶',
        id: msg.from.id,
        number: msg.from.number ? String(msg.from.number) : ''
      };
      dcPushRingStop('');
      if (dcTakePendingCallAction(msg.callId)) return true;
      emitDcCall();
      dcNoteCall('incoming', dcCall.peer, dcCall.callId);
      showDcBanner(dcIncomingText(), [
        { label: 'Contestar', cls: 'ok', fn: dcAnswer },
        { label: 'Rechazar', cls: 'no', fn: dcDecline }
      ]);
      return true;
    }
    if (t === 'call_ringing') {
      if (msg.callId && msg.callId === dcCall.callId && dcCall.role === 'caller') {
        if (msg.to) {
          dcCall.peer = dcCall.peer || {};
          dcCall.peer.email = String(msg.to.email || dcCall.peer.email || '').toLowerCase();
          dcCall.peer.name = msg.to.name || dcCall.peer.name;
          dcCall.peer.avatar = msg.to.avatar || dcCall.peer.avatar;
          dcCall.peer.id = msg.to.id || dcCall.peer.id;
          if (msg.to.number) dcCall.peer.number = String(msg.to.number);
        }
        if (msg.media === 'video' || msg.media === 'audio') dcCall.media = msg.media;
        emitDcCall();
      }
      return true;
    }
    if (t === 'call_answered') {
      if (!msg.callId || msg.callId !== dcCall.callId) return true;
      if (dcCall.phase !== 'ringing' && dcCall.phase !== 'active') return true;
      var wasPhase = dcCall.phase;
      if (msg.media === 'video' || msg.media === 'audio') dcCall.media = msg.media;
      dcCall.phase = 'active';
      if (dcCall.ringTimer) { clearTimeout(dcCall.ringTimer); dcCall.ringTimer = null; }
      if (msg.peer) {
        dcCall.peer = dcCall.peer || {};
        if (msg.peer.email) dcCall.peer.email = String(msg.peer.email).toLowerCase();
        if (msg.peer.name) dcCall.peer.name = msg.peer.name;
      }
      emitDcCall();
      dcActiveBanner();
      if (wasPhase !== 'active') {
        dcBoardCallStart();
        dcBeginMedia();
      }
      return true;
    }
    if (t === 'call_declined' || t === 'call_missed' || t === 'call_ended' || t === 'call_error') {
      var mine = !msg.callId || msg.callId === dcCall.callId || dcCall.phase !== 'idle';
      if (msg.callId && dcCall.callId && msg.callId !== dcCall.callId) return true;
      if (!mine && dcCall.phase === 'idle') return true;
      var was = dcCall.phase;
      var wasRole = dcCall.role;
      var wasPeer = dcCall.peer;
      var wasId = dcCall.callId;
      var wasMedia = (msg.media === 'video' || dcCall.media === 'video') ? 'video' : 'audio';
      if (t === 'call_missed' && wasRole === 'callee' && was === 'ringing') {
        dcNoteCall('missed', wasPeer || (msg.from || null), wasId || msg.callId);
      }
      if (was !== 'idle' && (t === 'call_declined' || t === 'call_missed' || t === 'call_ended' || (t === 'call_error' && was === 'active'))) {
        dcStopRingtone();
        var endReason = t === 'call_ended' ? String(msg.reason || '') : '';
        // call_missed con este cliente aún llamando = nadie contestó (si cuelga quien llama, ya está en idle)
        if (t === 'call_missed' && wasRole === 'caller' && was === 'ringing') dcPlayNoAnswer(wasId || msg.callId);
        else if (t === 'call_error' || endReason === 'disconnect' || endReason === 'error') dcPlayCallError(wasId || msg.callId);
        else dcPlayCallEnd(wasId || msg.callId);
      }
      dcReset(t);
      if (was === 'active') {
        dcBoardCallFinish(wasId);
        return true;
      }
      var note = '';
      var callWord = wasMedia === 'video' ? 'Videollamada' : 'Llamada';
      if (was === 'idle') note = '';
      else if (t === 'call_declined') note = callWord + ' rechazada';
      else if (t === 'call_missed') note = callWord + ' perdida';
      else if (t === 'call_ended') {
        var endedHow = String(msg.reason || '');
        if (was !== 'active') note = '';
        else if (endedHow === 'disconnect' || endedHow === 'error') note = callWord + ' interrumpida';
        else note = callWord + ' finalizada';
      }
      else if (t === 'call_error') note = msg.detail || 'No se pudo llamar';
      if (note) {
        showDcBanner(note, []);
        setTimeout(hideDcBanner, 2600);
      } else {
        hideDcBanner();
      }
      return true;
    }
    if (t === 'voice_signal') {
      if (!msg.callId || msg.callId !== dcCall.callId) return true;
      dcHandleSignal(msg.from, msg.signal);
      return true;
    }
    if (t === 'voice_pcm') {
      if (!msg.callId || msg.callId !== dcCall.callId) return true;
      if (msg.from && dcCall.peer && String(msg.from).toLowerCase() === String(dcCall.peer.email || '').toLowerCase()) {
        dcPlayPcm(msg.pcm, msg.rate);
      }
      return true;
    }
    if (t === 'video_frame') {
      if (!msg.callId || msg.callId !== dcCall.callId || dcCall.media !== 'video') return true;
      if (msg.from && dcCall.peer && String(msg.from).toLowerCase() === String(dcCall.peer.email || '').toLowerCase()) {
        dcShowFallbackFrame(msg.jpeg);
      }
      return true;
    }
    return false;
  }


  function ensureDcExtraCss() {
    if (document.getElementById('dc-extra-css-20261009')) return;
    var st = document.createElement('style');
    st.id = 'dc-extra-css-20261011b';
    st.textContent = ".dc-msg{position:relative;}\n.dc-msg-actions{position:absolute;top:-12px;right:8px;display:none;gap:2px;padding:2px;border-radius:999px;background:rgba(10,24,16,0.9);border:1px solid rgba(255,255,255,0.22);box-shadow:0 4px 14px rgba(0,0,0,0.3);z-index:2;}\n.dc-msg.mine .dc-msg-actions{right:auto;left:8px;}\n.dc-msg:hover .dc-msg-actions,.dc-msg:focus-within .dc-msg-actions{display:flex;}\n.dc-msg-actions button{margin:0 !important;width:26px !important;height:26px !important;min-width:26px !important;padding:0 !important;border-radius:50% !important;border:0 !important;background:transparent !important;color:#fff !important;font-size:0.8rem;cursor:pointer;box-shadow:none !important;}\n.dc-msg-actions button:hover{background:rgba(52,209,122,0.35) !important;}\n@media (hover:none){.dc-msg-actions{display:flex;position:static;margin-top:4px;width:max-content;background:rgba(0,0,0,0.18);}}\n.dc-react-picker{position:absolute;bottom:calc(100% + 4px);left:0;display:flex;gap:2px;padding:4px;border-radius:999px;background:rgba(10,24,16,0.95);border:1px solid rgba(255,255,255,0.25);box-shadow:0 8px 24px rgba(0,0,0,0.35);z-index:5;animation:dcPop .14s ease-out;}\n.dc-msg.mine .dc-react-picker{left:auto;right:0;}\n.dc-react-picker button{margin:0 !important;width:32px !important;height:32px !important;min-width:32px !important;padding:0 !important;border:0 !important;border-radius:50% !important;background:transparent !important;font-size:1.1rem;cursor:pointer;box-shadow:none !important;transition:transform .12s ease;}\n.dc-react-picker button:hover{transform:scale(1.25);}\n@keyframes dcPop{from{opacity:0;transform:translateY(4px) scale(0.95);}to{opacity:1;transform:none;}}\n.dc-reacts{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;}\n.dc-react-chip{margin:0 !important;width:auto !important;padding:1px 7px !important;min-height:0 !important;border-radius:999px !important;font-size:0.76rem;line-height:1.5;cursor:pointer;\n  background:rgba(0,0,0,0.2) !important;border:1px solid rgba(255,255,255,0.22) !important;color:inherit !important;box-shadow:none !important;}\n.dc-react-chip.mine{border-color:#9dffc2 !important;background:rgba(52,209,122,0.3) !important;}\n.dc-ticks{margin-left:4px;font-weight:800;letter-spacing:-2px;opacity:0.75;}\n.dc-ticks.read{color:#4fc3ff;opacity:1;}\n.dc-quote{margin:2px 0 5px !important;width:100% !important;display:flex;flex-direction:column;align-items:flex-start;gap:1px;text-align:left;padding:5px 8px !important;min-height:0 !important;border-radius:8px !important;\n  border:0 !important;border-left:3px solid #34d17a !important;background:rgba(0,0,0,0.18) !important;color:inherit !important;font-size:0.74rem;cursor:pointer;box-shadow:none !important;}\n.dc-quote b{font-size:0.7rem;color:#9dffc2;}\n.dc-quote span{opacity:0.85;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n.dc-reply-bar{display:flex;align-items:center;gap:8px;padding:6px 10px;margin:0 8px;border-radius:10px 10px 0 0;border-left:3px solid #34d17a;background:rgba(0,0,0,0.2);font-size:0.76rem;}\n.dc-reply-bar[hidden]{display:none;}\n.dc-reply-bar-text{flex:1;min-width:0;display:flex;flex-direction:column;}\n.dc-reply-bar-text span{opacity:0.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n.dc-reply-cancel{margin:0 !important;width:24px !important;height:24px !important;min-width:24px !important;padding:0 !important;border-radius:50% !important;font-size:0.7rem;cursor:pointer;}\n.dc-msearch{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.12);}\n.dc-msearch[hidden]{display:none;}\n.dc-msearch input{margin:0 !important;flex:1;min-width:0;padding:6px 10px !important;border-radius:10px !important;font-size:0.8rem;}\n.dc-msearch-info{font-size:0.7rem;opacity:0.75;white-space:nowrap;}\n.dc-msg.dc-search-hide{display:none;}\n.dc-msg.dc-search-hit{box-shadow:0 0 0 2px rgba(255,214,102,0.75);}\n.dc-msg.dc-flash{animation:dcFlash 1.2s ease;}\n@keyframes dcFlash{0%,100%{box-shadow:none;}30%{box-shadow:0 0 0 3px rgba(52,209,122,0.8);}}\n.dc-typing{color:#34d17a;font-weight:700;font-style:italic;}\n.dc-typing.on::after{content:'';}\n.dc-msg-photo{cursor:zoom-in;}\n.dc-lightbox{position:fixed;inset:0;z-index:300100;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;cursor:zoom-out;animation:dcPop .15s ease-out;}\n.dc-lightbox img{max-width:94vw;max-height:90vh;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.6);}\n.dc-lightbox-close{position:absolute;top:14px;right:14px;width:40px !important;height:40px !important;border-radius:50% !important;font-size:1rem;cursor:pointer;}\n.dc-user{position:relative;}\n.dc-pin{margin-left:auto;flex-shrink:0;align-self:center;font-size:0.8rem;padding:2px 4px;border-radius:8px;opacity:0;filter:grayscale(1);cursor:pointer;transition:opacity .15s ease;}\n.dc-user:hover .dc-pin,.dc-pin:focus-visible{opacity:0.6;}\n.dc-pin.on{opacity:1 !important;filter:none;}\n@media (hover:none){.dc-pin{opacity:0.45;}}\nbody.theme-light .dc-msg-actions,body.theme-light .dc-react-picker{background:rgba(255,255,255,0.96);border-color:rgba(0,0,0,0.12);}\nbody.theme-light .dc-msg-actions button{color:#0d2818 !important;}\nbody.theme-light .dc-quote{background:rgba(0,0,0,0.06) !important;}\nbody.theme-light .dc-quote b{color:#147a42;}\nbody.theme-light .dc-reply-bar{background:rgba(0,0,0,0.06);}\nbody.theme-light .dc-react-chip{background:rgba(255,255,255,0.7) !important;border-color:rgba(0,0,0,0.12) !important;}\nbody.theme-light .dc-ticks.read{color:#0a84d6;}\nbody.theme-light .dc-typing{color:#147a42;}\n.dc-msg.dc-acts-on .dc-msg-actions{display:flex;}\n.dc-msg-actions button,.dc-react-picker button,.dc-react-chip,.dc-reply-cancel,.dc-lightbox-close{width:auto !important;margin-top:0 !important;}\n.dc-head-actions{flex:0 1 auto !important;min-width:0;}\n.dc-head-actions .dc-call-btn{width:auto !important;margin-top:0 !important;padding:6px 12px;white-space:nowrap;}\n.dc-head-actions .dc-call-btn[data-dc=msearch]{padding:6px 10px;}\n@media (max-width:520px){.dc-head-actions{gap:4px;}.dc-head-actions .dc-call-btn{padding:5px 9px;font-size:0.72rem;}}\n.dc-msearch input{width:100% !important;margin-top:0 !important;}\n.dc-photo-confirm{display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.18);}\n.dc-photo-confirm img{width:56px;height:56px;object-fit:cover;border-radius:10px;flex:0 0 auto;border:1px solid rgba(255,255,255,0.25);}\n.dc-photo-confirm-info{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;font-size:0.8rem;}\n.dc-photo-confirm-info span{opacity:0.75;font-size:0.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}\n.dc-photo-confirm button{width:auto !important;margin:0 !important;padding:7px 12px !important;border-radius:999px !important;font-weight:700;font-size:0.78rem;cursor:pointer;flex:0 0 auto;}\n.dc-photo-confirm .dc-photo-ok{background:linear-gradient(135deg,#34d17a,#1fa85a) !important;color:#053018 !important;border:none !important;}\n.dc-photo-confirm .dc-photo-no{background:transparent !important;border:1px solid rgba(255,255,255,0.3) !important;color:inherit !important;}\nbody.theme-light .dc-photo-confirm{background:rgba(0,0,0,0.05);border-top-color:rgba(0,0,0,0.1);}\nbody.theme-light .dc-photo-confirm .dc-photo-no{border-color:rgba(0,0,0,0.2) !important;}\n@media (max-width:420px){.dc-photo-confirm{flex-wrap:wrap;}.dc-photo-confirm-info{flex-basis:calc(100% - 70px);}}\n.dc-main.dc-drop-on{outline:2px dashed #34d17a;outline-offset:-6px;background-color:rgba(52,209,122,0.10);}\n.dc-back{display:none;width:auto !important;margin:0 4px 0 0 !important;padding:2px 10px !important;border-radius:999px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.08);color:inherit;font-weight:800;font-size:1rem;line-height:1.4;cursor:pointer;}\nbody.phone-mode .dc-back{display:inline-block;}\nbody.phone-mode .dc-root.dc-peer-open .dc-side{display:none;}\nbody.phone-mode .dc-root:not(.dc-peer-open) .dc-side{max-height:none;flex:1 1 auto;border-bottom:none;}\nbody.phone-mode .dc-root:not(.dc-peer-open) .dc-main{display:none;}\nbody.theme-light .dc-back{border-color:rgba(0,0,0,0.15);background:rgba(0,0,0,0.04);}\nbody.phone-mode .dc-head-row{flex-wrap:wrap;row-gap:6px;}\nbody.phone-mode .dc-head-who{flex:1 1 160px;}\nbody.phone-mode .dc-head-actions{flex:1 1 100% !important;justify-content:flex-start;}\n.dc-day{display:flex;justify-content:center;margin:10px 0 6px;pointer-events:none;}\n.dc-day span{font-size:0.7rem;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(0,0,0,0.28);color:#e9fff1;letter-spacing:0.02em;}\nbody.theme-light .dc-day span{background:rgba(255,255,255,0.75);color:#0d2818;box-shadow:0 1px 3px rgba(0,0,0,0.08);}\n.dc-searching .dc-day{display:none;}\n.dc-add{display:flex;gap:6px;margin:8px 0 0;}\n.dc-add input{flex:1;min-width:0;margin:0 !important;}\n.dc-add button{width:auto !important;margin:0 !important;padding:6px 12px !important;border-radius:999px !important;font-weight:800;}\n.dc-remove{margin-left:auto;flex:0 0 auto;padding:3px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.28);font-size:.72rem;font-weight:800;cursor:pointer;}\n.dc-req{cursor:default;}\n.dc-req-actions{margin-left:auto;display:flex;gap:4px;flex:0 0 auto;}\n.dc-req-actions button{width:auto !important;margin:0 !important;padding:4px 8px !important;border-radius:999px !important;font-size:.72rem;font-weight:800;}\n.dc-req-ok{background:#34d17a !important;color:#053018 !important;border:0 !important;}\n.dc-req-no{background:transparent !important;color:inherit !important;border:1px solid rgba(255,255,255,.3) !important;}\n";
    document.head.appendChild(st);
  }

  function renderDoganieroChatApp(container, opts) {
    if (!container) return function () {};
    opts = opts || {};
    // Sync path with Metaverso: opts.currentUser || window.currentUser || /api/me (cookie session_id)
    var me = opts.currentUser || currentUser();
    if (!me || !me.email) {
      container.innerHTML = '<p class="note">Comprobando sesión…</p>';
      var cancelled = false;
      resolveUser(opts).then(function (user) {
        if (cancelled) return;
        if (!user || !user.email) {
          container.innerHTML = '<div class="note" style="text-align:center;padding:18px 12px;">' +
            '<p style="margin:0 0 10px;">Inicia sesión para usar Doganiero Chat.</p>' +
            '<p style="margin:0 0 12px;opacity:.75;font-size:.85em;">Si ya has iniciado sesión, puede que la conexión haya fallado.</p>' +
            '<button type="button" class="dc-retry-session" style="width:auto;margin:0 auto;padding:8px 16px;border-radius:999px;cursor:pointer;">🔄 Reintentar</button></div>';
          var rb = container.querySelector('.dc-retry-session');
          if (rb) rb.addEventListener('click', function () {
            if (cancelled) return;
            container._dcCleanup = renderDoganieroChatApp(container, opts);
          });
          return;
        }
        // Re-render with resolved session user
        var cleanupInner = renderDoganieroChatApp(container, { currentUser: user });
        container._dcCleanup = cleanupInner;
      });
      return function () {
        cancelled = true;
        if (typeof container._dcCleanup === 'function') {
          try { container._dcCleanup(); } catch (e) {}
          container._dcCleanup = null;
        }
      };
    }

    ensureDcExtraCss();
    container.innerHTML =
      '<div class="dc-root">' +
        '<aside class="dc-side">' +
          '<div class="dc-side-head">' +
            '<div class="dc-title">💬 Doganiero Chat</div>' +
            '<form class=\"dc-add\" data-dc=\"add-form\">' +
              '<input type=\"text\" class=\"dc-search\" placeholder=\"correo@dogaemail.com o DOG-123456\" data-dc=\"add-input\" autocomplete=\"off\" maxlength=\"120\" aria-label=\"Añadir cuenta\">' +
              '<button type=\"submit\">Añadir</button>' +
            '</form>' +
            '<input type=\"search\" class=\"dc-search\" placeholder=\"Buscar cuentas añadidas…\" data-dc=\"search\" autocomplete=\"off\">' +
          '</div>' +
          '<div class="dc-tabs">' +
            '<button type="button" class="dc-tab active" data-dc-tab="users">Cuentas</button>' +
            '<button type="button" class="dc-tab" data-dc-tab="threads">Chats</button>' +
          '</div>' +
          '<div class="dc-list" data-dc="list"></div>' +
        '</aside>' +
        '<section class="dc-main">' +
          '<div class="dc-chat-head" data-dc="head">Selecciona una cuenta añadida para chatear</div>' +
          '<div class="dc-msearch" data-dc="msearchbar" hidden><input type="search" placeholder="Buscar en esta conversación…" data-dc="msearch-input" autocomplete="off" aria-label="Buscar en esta conversación"><span class="dc-msearch-info" data-dc="msearch-info"></span></div>' +
          '<div class="dc-messages" data-dc="messages"></div>' +
          '<div class="dc-reply-bar" data-dc="replybar" hidden></div>' +
          '<form class="dc-compose" data-dc="form">' +
            '<input type="file" accept="image/*" data-dc="photo-file" hidden aria-hidden="true">' +
            '<button type="button" class="dc-photo-btn" data-dc="photo" disabled>Foto</button>' +
            '<input type="text" class="dc-input" maxlength="2000" placeholder="Escribe un mensaje…" data-dc="input" autocomplete="off" disabled aria-label="Mensaje">' +
            '<button type="submit" class="dc-send" disabled>Enviar</button>' +
          '</form>' +
        '</section>' +
      '</div>';

    var listEl = container.querySelector('[data-dc="list"]');
    var headEl = container.querySelector('[data-dc="head"]');
    headEl.addEventListener('click', function (e) {
      var bk = e.target && e.target.closest ? e.target.closest('[data-dc="back"]') : null;
      if (!bk) return;
      e.preventDefault();
      var r0 = container.querySelector('.dc-root');
      if (r0) r0.classList.remove('dc-peer-open');
    });
    var messagesEl = container.querySelector('[data-dc="messages"]');

    function snkParseEmojis(el) {
      try {
        if (window.snakeEmoji && typeof window.snakeEmoji.parse === 'function') window.snakeEmoji.parse(el || document.body);
      } catch (eSnk) {}
    }
    var formEl = container.querySelector('[data-dc="form"]');
    var inputEl = container.querySelector('[data-dc="input"]');
    var searchEl = container.querySelector('[data-dc="search"]');
    var sendBtn = formEl.querySelector('.dc-send');
    var photoBtn = formEl.querySelector('[data-dc="photo"]');
    var photoFile = formEl.querySelector('[data-dc="photo-file"]');
    var tabUsers = container.querySelector('[data-dc-tab="users"]');
    var tabThreads = container.querySelector('[data-dc-tab="threads"]');

    var users = [];
    var incomingReqs = [];
    var outgoingReqs = [];
    var threads = [];
    var peer = null;
    var mode = 'users';
    var filter = '';
    var seenMsgIds = Object.create(null);
    var sending = false;
    var sendCooldownUntil = 0;
    var offCall = null;
    var unsub = onNotifEvent(function (evt, data) {
      if (evt === 'open_peer' && data) {
        takePendingPeer();
        var em = String(data).toLowerCase();
        var found = users.filter(function (u) { return u.email === em; })[0];
        if (found) openPeer(found);
        return;
      }
      if (evt === 'chat_reaction' && data) {
        applyReactionUpdate(data.messageId, data.reactions);
        return;
      }
      if (evt === 'chat_typing' && data) {
        try { dcListTyping(String(data).toLowerCase()); } catch (eLt) {}
        if (!peer) return;
        if (String(data).toLowerCase() === String(peer.email || '').toLowerCase()) {
          var tl = container.querySelector('[data-dc="typing"]');
          if (tl) {
            tl.textContent = 'escribiendo…';
            tl.classList.add('on');
            clearTimeout(typingTimer);
            typingTimer = setTimeout(function () { tl.textContent = ''; tl.classList.remove('on'); }, 4000);
          }
        }
        return;
      }
      if (evt === 'chat_read' && data && peer) {
        if (String(data).toLowerCase() === String(peer.email || '').toLowerCase()) {
          Object.keys(msgCache).forEach(function (k) {
            var m = msgCache[k];
            if (m && isMineMsg(m) && m.readAt == null) {
              m.readAt = Date.now() / 1000;
              var t = messagesEl.querySelector('[data-msg-id="' + k + '"] .dc-ticks');
              if (t) { t.textContent = '✓✓'; t.classList.add('read'); t.title = 'Leído'; }
            }
          });
        }
        return;
      }
      if (evt === 'chat_message' && data && peer) {
        // Own messages are painted from POST; ignore WS echo (belt + suspenders vs server skip)
        var callNotice = data && typeof data.text === 'string' && data.text.indexOf('📞') === 0;
        if (!callNotice && data.from && data.from.email && me && me.email && data.from.email === me.email) {
          return;
        }
        var fromId = data.fromUserId;
        var toId = data.toUserId;
        var peerId = peer.id;
        var peerEmail = String(peer.email || '').toLowerCase();
        var fromEmail = data.from && data.from.email ? String(data.from.email).toLowerCase() : '';
        var toEmail = data.to && data.to.email ? String(data.to.email).toLowerCase() : '';
        var meEmail = me && me.email ? String(me.email).toLowerCase() : '';
        var involves =
          (fromEmail && toEmail && ((fromEmail === peerEmail && toEmail === meEmail) || (fromEmail === meEmail && toEmail === peerEmail))) ||
          (fromId && toId && peerId && (String(fromId) === String(peerId) || String(toId) === String(peerId)));
        if (involves) {
          if (messagesEl && messagesEl.querySelector('.dc-empty')) messagesEl.innerHTML = '';
          appendMsg(data);
          if (!callNotice && fromEmail === peerEmail && document.visibilityState !== 'hidden') wsSend({ type: 'chat_seen', to: peer.email });
          var tl2 = container.querySelector('[data-dc="typing"]');
          if (tl2 && fromEmail === peerEmail) { tl2.textContent = ''; tl2.classList.remove('on'); }
          if (callNotice) loadThreads();
        }
      }
    });
    offCall = onDcCallChange(function () { syncCallButton(); });

    function setComposeEnabled(on) {
      inputEl.disabled = !on;
      sendBtn.disabled = !on;
      if (photoBtn) photoBtn.disabled = !on;
    }

    var DC_REACTS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏'];
    var replyTo = null;
    var msgCache = Object.create(null);
    var typingTimer = null;
    var lastTypingSent = 0;
    var msgSearchQ = '';
    function wsSend(obj) {
      try {
        if (notifState.ws && notifState.ws.readyState === 1) notifState.ws.send(JSON.stringify(obj));
      } catch (e) {}
    }
    function myId() {
      if (me && me.id != null) return Number(me.id);
      for (var k in msgCache) {
        var m = msgCache[k];
        if (m && isMineMsg(m) && m.fromUserId != null) return Number(m.fromUserId);
      }
      return null;
    }
    function isMineMsg(msg) {
      return !!(msg && msg.from && me && msg.from.email === me.email);
    }
    function tickHtml(msg) {
      if (!isMineMsg(msg) || String(msg.text || '').indexOf('📞') === 0) return '';
      var read = msg.readAt != null;
      return '<span class="dc-ticks' + (read ? ' read' : '') + '" title="' + (read ? 'Leído' : 'Enviado') + '">' + (read ? '✓✓' : '✓') + '</span>';
    }
    function paintReactions(div, msg) {
      var box = div.querySelector('.dc-reacts');
      var list = (msg && msg.reactions) || [];
      if (!list.length) { if (box) box.remove(); return; }
      if (!box) {
        box = document.createElement('div');
        box.className = 'dc-reacts';
        div.appendChild(box);
      }
      box.innerHTML = '';
      var mine = myId();
      list.forEach(function (r) {
        var b = document.createElement('button');
        b.type = 'button';
        var ids = r.userIds || [];
        var isMe = mine != null && ids.some(function (x) { return Number(x) === mine; });
        b.className = 'dc-react-chip' + (isMe ? ' mine' : '');
        if (window.snakeEmoji && window.snakeEmoji.fill) window.snakeEmoji.fill(b, r.emoji + (ids.length > 1 ? ' ' + ids.length : ''));
        else { b.textContent = r.emoji + (ids.length > 1 ? ' ' + ids.length : ''); snkParseEmojis(b); }
        b.title = isMe ? 'Quitar tu reacción' : 'Reaccionar con ' + r.emoji;
        b.addEventListener('click', function (e) { e.stopPropagation(); sendReaction(msg.id, r.emoji); });
        box.appendChild(b);
      });
    }
    async function sendReaction(mid, emoji) {
      if (mid == null) return;
      try {
        var data = await apiFn()('/api/chat/messages/' + encodeURIComponent(mid) + '/react', { method: 'POST', body: { emoji: emoji } });
        applyReactionUpdate(data.messageId, data.reactions);
      } catch (e) {
        alert((e && e.message) || 'No se pudo reaccionar');
      }
    }
    function applyReactionUpdate(mid, reactions) {
      var m = msgCache[String(mid)];
      if (m) m.reactions = reactions || [];
      var div = messagesEl && messagesEl.querySelector('[data-msg-id="' + String(mid) + '"]');
      if (div) paintReactions(div, m || { id: mid, reactions: reactions || [] });
    }
    function closeReactPicker() {
      var p = container.querySelector('.dc-react-picker');
      if (p) p.remove();
    }
    function openReactPicker(div, msg) {
      closeReactPicker();
      var p = document.createElement('div');
      p.className = 'dc-react-picker';
      DC_REACTS.forEach(function (em) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = em;
        b.title = 'Reaccionar con ' + em;
        b.addEventListener('click', function (e) { e.stopPropagation(); closeReactPicker(); sendReaction(msg.id, em); });
        p.appendChild(b);
      });
      div.appendChild(p);
    }
    function setReplyTo(msg) {
      replyTo = msg ? { id: msg.id, text: String(msg.text || ''), hasImage: !!msg.image, fromName: isMineMsg(msg) ? 'Tú' : ((msg.from && msg.from.name) || 'Usuario') } : null;
      var bar = container.querySelector('[data-dc="replybar"]');
      if (!bar) return;
      if (!replyTo) { bar.hidden = true; bar.innerHTML = ''; return; }
      var t = replyTo.hasImage && replyTo.text === '📷 Foto' ? '📷 Foto' : replyTo.text;
      bar.innerHTML = '<div class="dc-reply-bar-text"><b>↩ Respondiendo a ' + esc(replyTo.fromName) + '</b><span>' + esc(t.length > 120 ? t.slice(0, 117) + '…' : t) + '</span></div>' +
        '<button type="button" class="dc-reply-cancel" title="Cancelar respuesta" aria-label="Cancelar respuesta">✕</button>';
      bar.hidden = false;
      bar.querySelector('.dc-reply-cancel').addEventListener('click', function () { setReplyTo(null); try { inputEl.focus(); } catch (e) {} });
      try { inputEl.focus(); } catch (e2) {}
    }
    function openLightbox(src) {
      var ov = document.createElement('div');
      ov.className = 'dc-lightbox';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-label', 'Foto');
      ov.innerHTML = '<img alt="Foto"><button type="button" class="dc-lightbox-close" aria-label="Cerrar">✕</button>';
      ov.querySelector('img').src = src;
      function close() { ov.remove(); document.removeEventListener('keydown', onKey, true); }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
      ov.addEventListener('click', close);
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(ov);
    }
    function applyMsgSearch() {
      if (!messagesEl) return;
      var q = msgSearchQ.trim().toLowerCase();
      var hits = 0;
      messagesEl.classList.toggle('dc-searching', !!q);
      messagesEl.querySelectorAll('.dc-msg').forEach(function (d) {
        var txt = (d.querySelector('.dc-msg-text') || d).textContent.toLowerCase();
        var ok = !q || txt.indexOf(q) !== -1;
        d.classList.toggle('dc-search-hide', !ok);
        d.classList.toggle('dc-search-hit', !!q && ok);
        if (q && ok) hits++;
      });
      var info = container.querySelector('[data-dc="msearch-info"]');
      if (info) info.textContent = q ? (hits === 1 ? '1 mensaje' : hits + ' mensajes') : '';
      if (q) {
        var first = messagesEl.querySelector('.dc-search-hit');
        if (first) first.scrollIntoView({ block: 'nearest' });
      }
    }

    // Separadores de día: «Hoy», «Ayer», «lunes, 5 de octubre»
    function dcDayKey(ts) {
      var n = Number(ts) || 0;
      if (!n) return '';
      var d = new Date(n * 1000);
      return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }
    function dcDayLabel(ts) {
      var d = new Date((Number(ts) || 0) * 1000);
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var that = new Date(d.getTime()); that.setHours(0, 0, 0, 0);
      var diff = Math.round((today - that) / 86400000);
      if (diff === 0) return 'Hoy';
      if (diff === 1) return 'Ayer';
      try {
        var opts = { weekday: 'long', day: 'numeric', month: 'long' };
        if (d.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
        var t = d.toLocaleDateString('es-ES', opts);
        return t.charAt(0).toUpperCase() + t.slice(1);
      } catch (eL) { return ''; }
    }
    function dcMaybeDaySep(msg, div) {
      var key = dcDayKey(msg.ts);
      if (!key) return;
      div.setAttribute('data-day', key);
      var all = messagesEl.querySelectorAll('.dc-msg');
      var last = all.length ? all[all.length - 1] : null;
      if (last && last.getAttribute('data-day') === key) return;
      var label = dcDayLabel(msg.ts);
      if (!label) return;
      var sep = document.createElement('div');
      sep.className = 'dc-day';
      sep.setAttribute('role', 'separator');
      sep.innerHTML = '<span></span>';
      sep.firstChild.textContent = label;
      messagesEl.appendChild(sep);
    }

    function appendMsg(msg) {
      if (!messagesEl || !msg) return;
      var mid = msg.id != null ? String(msg.id) : '';
      var fp = ((msg.from && msg.from.email) || '') + '|' + String(msg.text || '') + '|' + String(Math.round(Number(msg.ts) || 0));
      if (mid) {
        if (seenMsgIds['id:' + mid]) return;
        if (messagesEl.querySelector('[data-msg-id="' + mid + '"]')) {
          seenMsgIds['id:' + mid] = true;
          return;
        }
        seenMsgIds['id:' + mid] = true;
        msgCache[mid] = msg;
      } else if (fp && seenMsgIds['fp:' + fp]) {
        return;
      }
      if (fp) seenMsgIds['fp:' + fp] = true;
      var rawText = String(msg.text || '');
      var system = rawText.indexOf('📞') === 0;
      var mine = !system && msg.from && msg.from.email === me.email;
      var div = document.createElement('div');
      div.className = 'dc-msg' + (system ? ' system' : (mine ? ' mine' : ''));
      if (mid) div.setAttribute('data-msg-id', mid);
      var name = system ? 'Aviso' : (mine ? 'Tú' : ((msg.from && msg.from.name) || 'Usuario'));
      var av = (msg.from && msg.from.avatar) || '🐶';
      var meta = document.createElement('div');
      meta.className = 'dc-msg-meta';
      meta.innerHTML = '<span class="dc-av-inline">' + avHtml(av) + '</span> ' + esc(name) + ' · ' + esc(fmtTime(msg.ts)) + ' ' + tickHtml(msg);
      if (msg.replyTo) {
        var q = document.createElement('button');
        q.type = 'button';
        q.className = 'dc-quote';
        var qt = msg.replyTo.hasImage && msg.replyTo.text === '📷 Foto' ? '📷 Foto' : String(msg.replyTo.text || '');
        var qn = me && msg.replyTo.fromUserId && myId() === Number(msg.replyTo.fromUserId) ? 'Tú' : (msg.replyTo.fromName || '');
        q.innerHTML = '<b>' + esc(qn) + '</b><span>' + esc(qt) + '</span>';
        q.title = 'Ir al mensaje citado';
        q.addEventListener('click', function () {
          var target = messagesEl.querySelector('[data-msg-id="' + String(msg.replyTo.id) + '"]');
          if (target) {
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
            target.classList.remove('dc-flash'); void target.offsetWidth; target.classList.add('dc-flash');
          }
        });
        div.appendChild(meta);
        div.appendChild(q);
      } else {
        div.appendChild(meta);
      }
      var textEl = document.createElement('div');
      textEl.className = 'dc-msg-text';
      var imgSrc = typeof msg.image === 'string' ? msg.image : '';
      var photoOk = /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imgSrc) && imgSrc.length < 1800000;
      if (photoOk) {
        var im = document.createElement('img');
        im.className = 'dc-msg-photo';
        im.alt = 'Foto';
        im.src = imgSrc;
        im.title = 'Ver en grande';
        im.addEventListener('click', function () { openLightbox(imgSrc); });
        textEl.appendChild(im);
      }
      if (!(photoOk && rawText === '📷 Foto')) {
        var cap = document.createElement('div');
        if (window.snakeEmoji && typeof window.snakeEmoji.fill === 'function') window.snakeEmoji.fill(cap, rawText);
        else cap.textContent = rawText;
        textEl.appendChild(cap);
      }
      div.appendChild(textEl);
      if (!system && mid) {
        var acts = document.createElement('div');
        acts.className = 'dc-msg-actions';
        acts.innerHTML = '<button type="button" data-act="reply" title="Responder" aria-label="Responder">↩</button>' +
          '<button type="button" data-act="react" title="Reaccionar" aria-label="Reaccionar">😊</button>';
        acts.querySelector('[data-act="reply"]').addEventListener('click', function (e) { e.stopPropagation(); setReplyTo(msg); });
        acts.querySelector('[data-act="react"]').addEventListener('click', function (e) { e.stopPropagation(); openReactPicker(div, msg); });
        div.appendChild(acts);
        div.addEventListener('dblclick', function (e) {
          if (e.target.closest && e.target.closest('button, img')) return;
          sendReaction(msg.id, '❤️');
        });
        div.addEventListener('click', function (e) {
          if (e.target.closest && e.target.closest('button, img, a, .dc-quote, input')) return;
          var on = !div.classList.contains('dc-acts-on');
          var olds = messagesEl.querySelectorAll('.dc-acts-on');
          for (var oi = 0; oi < olds.length; oi++) olds[oi].classList.remove('dc-acts-on');
          if (on) div.classList.add('dc-acts-on');
        });
      }
      paintReactions(div, msg);
      if (msgSearchQ) {
        var txt = textEl.textContent.toLowerCase();
        var ok = txt.indexOf(msgSearchQ.trim().toLowerCase()) !== -1;
        div.classList.toggle('dc-search-hide', !ok);
        div.classList.toggle('dc-search-hit', ok);
      }
      dcMaybeDaySep(msg, div);
      messagesEl.appendChild(div);
      snkParseEmojis(div);
      if (!msgSearchQ) messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    var PIN_KEY = 'snakeos_dc_pins_v1:' + String((me && me.email) || '').toLowerCase();
    function readPins() {
      try { var v = JSON.parse(localStorage.getItem(PIN_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    function togglePin(email) {
      email = String(email || '').toLowerCase();
      var pins = readPins();
      var i = pins.indexOf(email);
      if (i >= 0) pins.splice(i, 1); else pins.unshift(email);
      try { localStorage.setItem(PIN_KEY, JSON.stringify(pins.slice(0, 20))); } catch (e) {}
      renderList();
    }
    function pinBtn(email) {
      var pinned = readPins().indexOf(String(email || '').toLowerCase()) >= 0;
      var b = document.createElement('span');
      b.className = 'dc-pin' + (pinned ? ' on' : '');
      b.setAttribute('role', 'button');
      b.setAttribute('tabindex', '0');
      b.title = pinned ? 'Desfijar chat' : 'Fijar chat arriba';
      b.setAttribute('aria-label', b.title);
      b.textContent = '📌';
      function act(e) { e.preventDefault(); e.stopPropagation(); togglePin(email); }
      b.addEventListener('click', act);
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') act(e); });
      return b;
    }

    function reqButton(label, cls, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        fn();
      });
      return b;
    }
    function paintAccountRequests() {
      function addRow(entry, kind) {
        var u = (entry && entry.user) || {};
        var box = document.createElement('div');
        box.className = 'dc-user dc-req';
        box.innerHTML =
          '<span class="dc-av">' + avHtml(u.avatar || '🐶') + '</span>' +
          '<span class="dc-user-meta">' +
            '<span class="dc-user-name">' + esc(u.name || u.email || 'Cuenta') + '</span>' +
            '<span class="dc-user-email">' + (kind === 'in' ? 'Quiere añadirte' : 'Esperando que acepte') + '</span>' +
          '</span>';
        var actions = document.createElement('span');
        actions.className = 'dc-req-actions';
        if (kind === 'in') {
          actions.appendChild(reqButton('Aceptar', 'dc-req-ok', function () { decideRequest(entry.id, 'accept'); }));
          actions.appendChild(reqButton('Rechazar', 'dc-req-no', function () { decideRequest(entry.id, 'reject'); }));
        } else {
          actions.appendChild(reqButton('Cancelar', 'dc-req-no', function () { decideRequest(entry.id, 'cancel'); }));
        }
        box.appendChild(actions);
        listEl.appendChild(box);
      }
      incomingReqs.forEach(function (entry) { addRow(entry, 'in'); });
      outgoingReqs.forEach(function (entry) { addRow(entry, 'out'); });
    }
    async function decideRequest(id, action) {
      var path = '/api/added-accounts/requests/' + encodeURIComponent(id);
      try {
        if (action === 'cancel') await apiFn()(path, { method: 'DELETE' });
        else await apiFn()(path + (action === 'accept' ? '/accept' : '/reject'), { method: 'POST', body: {} });
        await loadUsers();
        await loadThreads();
      } catch (err) {
        alert((err && err.message) || 'No se pudo actualizar la solicitud');
      }
    }
    async function removeAddedAccount(u) {
      if (!u || !u.id) return;
      var name = u.name || u.email || 'esta cuenta';
      if (!window.confirm('Quitar a ' + name + ' de Chat y Teléfono? También se quita para esa persona.')) return;
      try {
        await apiFn()('/api/added-accounts/' + encodeURIComponent(u.id), { method: 'DELETE' });
        if (peer && String(peer.email || '').toLowerCase() === String(u.email || '').toLowerCase()) {
          peer = null;
          setComposeEnabled(false);
          headEl.textContent = 'Selecciona una cuenta añadida para chatear';
          if (messagesEl) messagesEl.innerHTML = '<div class="dc-empty">Cuenta quitada.</div>';
        }
        await loadUsers();
        await loadThreads();
      } catch (err) {
        alert((err && err.message) || 'No se pudo quitar la cuenta');
      }
    }
    function removeBtn(u) {
      var b = document.createElement('span');
      b.className = 'dc-remove';
      b.setAttribute('role', 'button');
      b.setAttribute('tabindex', '0');
      b.title = 'Quitar de Chat y Teléfono';
      b.textContent = 'Quitar';
      function act(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        removeAddedAccount(u);
      }
      b.addEventListener('click', act);
      b.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') act(ev);
      });
      return b;
    }
    function renderList() {
      listEl.innerHTML = '';
      var q = filter.toLowerCase();
      var pins = readPins();
      function pinRank(email) { var i = pins.indexOf(String(email || '').toLowerCase()); return i < 0 ? 999 : i; }
      if (mode === 'users') {
        var shown = users.filter(function (u) {
          if (!q) return true;
          return (u.name || '').toLowerCase().indexOf(q) >= 0 ||
            (u.email || '').toLowerCase().indexOf(q) >= 0;
        });
        if (!shown.length && !incomingReqs.length && !outgoingReqs.length) {
          listEl.innerHTML = '<div class="dc-empty">' + (q ? 'Ninguna cuenta coincide con «' + esc(filter) + '»' : 'Aún no has añadido cuentas. La otra persona tiene que aceptar la solicitud.') + '</div>';
          return;
        }
        paintAccountRequests();
        shown.forEach(function (u) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'dc-user' + (peer && peer.email === u.email ? ' active' : '');
          btn.innerHTML =
            '<span class="dc-av">' + avHtml(u.avatar || '🐶') + '</span>' +
            '<span class="dc-user-meta">' +
              '<span class="dc-user-name">' + esc(u.name || u.email) + '</span>' +
              '<span class="dc-user-email">' + esc(u.email) + '</span>' +
            '</span>';
          btn.appendChild(removeBtn(u));
          btn.addEventListener('click', function () { openPeer(u); });
          listEl.appendChild(btn);
        });
      } else {
        var th = threads.filter(function (t) {
          var u = t.peer || {};
          if (!q) return true;
          return (u.name || '').toLowerCase().indexOf(q) >= 0 ||
            (u.email || '').toLowerCase().indexOf(q) >= 0;
        });
        if (!th.length) {
          listEl.innerHTML = '<div class="dc-empty">' + (q ? 'Ningún chat coincide con «' + esc(filter) + '»' : 'Aún no hay conversaciones') + '</div>';
          return;
        }
        th = th.map(function (t, i) { return { t: t, i: i }; }).sort(function (a, b) {
          var pa = pinRank((a.t.peer || {}).email), pb = pinRank((b.t.peer || {}).email);
          return pa !== pb ? pa - pb : a.i - b.i;
        }).map(function (x) { return x.t; });
        th.forEach(function (t) {
          var u = t.peer || {};
          var last = t.lastMessage || {};
          var btn = document.createElement('button');
          btn.type = 'button';
          var pinned = pinRank(u.email) < 999;
          btn.className = 'dc-user' + (peer && peer.email === u.email ? ' active' : '') + (pinned ? ' pinned' : '');
          var badge = t.unread ? ('<span class="dc-unread">' + t.unread + '</span>') : '';
          btn.innerHTML =
            '<span class="dc-av">' + avHtml(u.avatar || '🐶') + '</span>' +
            '<span class="dc-user-meta">' +
              '<span class="dc-user-name">' + esc(u.name || u.email) + badge + '</span>' +
              '<span class="dc-user-email">' + esc(last.image ? '📷 Foto' : (last.text || '')) + '</span>' +
            '</span>';
          btn.setAttribute('data-peer', String(u.email || '').toLowerCase());
          btn.appendChild(pinBtn(u.email));
          btn.appendChild(removeBtn(u));
          btn.addEventListener('click', function () { openPeer(u); });
          listEl.appendChild(btn);
        });
      }
    }

    snkParseEmojis(listEl);

    // «escribiendo…» también en la lista de chats
    function dcListTyping(em) {
      if (!listEl || !em) return;
      var rows = listEl.querySelectorAll('.dc-user[data-peer]');
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('data-peer') !== em) continue;
        var sub = rows[i].querySelector('.dc-user-email');
        if (!sub) return;
        if (sub._orig == null) sub._orig = sub.textContent;
        sub.textContent = 'escribiendo…';
        sub.classList.add('dc-typing');
        clearTimeout(sub._tt);
        sub._tt = setTimeout(function () {
          if (sub._orig != null) sub.textContent = sub._orig;
          sub._orig = null;
          sub.classList.remove('dc-typing');
        }, 4000);
        return;
      }
    }

    async function loadUsers() {
      try {
        var data = await apiFn()('/api/chat/users');
        users = data.users || [];
        try {
          var reqs = await apiFn()('/api/added-accounts/requests');
          incomingReqs = (reqs && reqs.incoming) || [];
          outgoingReqs = (reqs && reqs.outgoing) || [];
        } catch (eReq) {}
        if (mode === 'users') renderList();
      } catch (e) {
        listEl.innerHTML = '<div class="dc-empty">Error al cargar perfiles</div>';
      }
    }

    async function loadThreads() {
      try {
        var data = await apiFn()('/api/chat/threads');
        threads = data.threads || [];
        if (mode === 'threads') renderList();
      } catch (e) {}
    }

    function paintCallBtn(btn, isVideo) {
      if (!btn) return;
      var label = isVideo ? 'Videollamada' : 'Llamar';
      var st = dcSnapshot();
      var email = peer && peer.email ? String(peer.email).toLowerCase() : '';
      var same = !!(st.peerEmail && email && st.peerEmail === email);
      var busyOther = st.phase !== 'idle' && !same;
      var otherMedia = same && st.phase !== 'idle' && st.media && st.media !== (isVideo ? 'video' : 'audio');
      if (!peer || busyOther || otherMedia) {
        btn.disabled = true;
        btn.textContent = busyOther ? 'Ocupado' : label;
        btn.classList.remove('danger');
        return;
      }
      btn.disabled = false;
      if (same && st.phase === 'active') {
        btn.textContent = 'Colgar';
        btn.classList.add('danger');
      } else if (same && st.phase === 'ringing' && st.role === 'caller') {
        btn.textContent = 'Colgar';
        btn.classList.add('danger');
      } else if (same && st.phase === 'ringing' && st.role === 'callee') {
        btn.textContent = 'Contestar';
        btn.classList.remove('danger');
      } else {
        btn.textContent = label;
        btn.classList.remove('danger');
      }
    }
    function syncCallButton() {
      paintCallBtn(container.querySelector('[data-dc="call"]'), false);
      paintCallBtn(container.querySelector('[data-dc="video"]'), true);
    }
    async function openPeer(u) {
      if (!u || !u.email) return;
      var nextEmail = String(u.email || '').toLowerCase();
      var addedOk = users.some(function (x) { return String(x.email || '').toLowerCase() === nextEmail; }) || threads.some(function (item) { return String(((item && item.peer) || {}).email || '').toLowerCase() === nextEmail; });
      if (!addedOk) {
        peer = null;
        setComposeEnabled(false);
        headEl.textContent = 'Selecciona una cuenta añadida';
        if (messagesEl) messagesEl.innerHTML = '<div class=\"dc-empty\">Solo puedes chatear con cuentas que has añadido.</div>';
        var blockedRoot = container.querySelector('.dc-root');
        if (blockedRoot) blockedRoot.classList.remove('dc-peer-open');
        return;
      }
      var prevEmail = peer && peer.email ? String(peer.email).toLowerCase() : '';
      if (prevEmail && prevEmail !== nextEmail && (dcLoc.peerEmail === prevEmail || dcLoc.pendingEmail === prevEmail)) dcLocStop();
      peer = u;
      try { var dcRootEl = container.querySelector('.dc-root'); if (dcRootEl) dcRootEl.classList.add('dc-peer-open'); } catch (eRoot) {}
      try { dcLocMapTeardown(); } catch (eLocMap) {}
      headEl.innerHTML =
        '<div class="dc-head-row">' +
          '<div class="dc-head-who">' +
            '<div class="dc-head-name-row"><button type="button" class="dc-back" data-dc="back" title="Volver a la lista" aria-label="Volver a la lista">←</button><span class="dc-head-av">' + avHtml(u.avatar || '🐶') + '</span><span>' + esc(u.name || u.email) + '</span></div>' +
            '<span class="dc-head-email">' + esc(u.email) + ' <span class="dc-typing" data-dc="typing" aria-live="polite"></span></span></div>' +
          '<div class="dc-head-actions">' +
            '<button type="button" class="dc-call-btn" data-dc="msearch" title="Buscar en esta conversación" aria-label="Buscar en esta conversación">🔎</button>' +
            '<button type="button" class="dc-call-btn" data-dc="loc" aria-pressed="false">Ubicación</button>' +
            '<button type="button" class="dc-call-btn" data-dc="call">Llamar</button>' +
            '<button type="button" class="dc-call-btn video" data-dc="video">Videollamada</button>' +
          '</div>' +
        '</div>' +
        '<div data-dc="loc-line" data-peer="' + esc(nextEmail) + '" data-name="' + esc(u.name || u.email || '') + '" class="dc-loc-line">' +
          '<div data-dc="loc-status"></div>' +
          '<div data-dc="loc-map" class="dc-loc-map" hidden></div>' +
          '<div data-dc="loc-note"></div>' +
        '</div>';
      syncCallButton();
      dcLocPaint();
      setComposeEnabled(true);
      seenMsgIds = Object.create(null);
      msgCache = Object.create(null);
      setReplyTo(null);
      msgSearchQ = '';
      var msb = container.querySelector('[data-dc="msearchbar"]');
      if (msb) { msb.hidden = true; var msi = msb.querySelector('input'); if (msi) msi.value = ''; }
      sending = false;
      sendCooldownUntil = 0;
      messagesEl.innerHTML = '<div class="dc-empty">Cargando…</div>';
      renderList();
      try {
        var data = await apiFn()('/api/chat/messages?with=' + encodeURIComponent(u.email));
        peer = data.peer || u;
        seenMsgIds = Object.create(null);
        messagesEl.innerHTML = '';
        (data.messages || []).forEach(appendMsg); snkParseEmojis(messagesEl);
        snkParseEmojis(messagesEl);
        if (!(data.messages || []).length) {
          messagesEl.innerHTML = '<div class="dc-empty">Sin mensajes todavía. ¡Saluda!</div>';
        }
        wsSend({ type: 'chat_seen', to: peer.email });
        await loadThreads();
        refreshNotifications();
      } catch (e) {
        messagesEl.innerHTML = '<div class="dc-empty">No se pudo cargar el chat</div>';
      }
      inputEl.focus();
    }

    formEl.addEventListener('submit', async function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!peer || sending) return;
      if (Date.now() < sendCooldownUntil) return;
      var text = (inputEl.value || '').trim();
      if (!text) return;
      sending = true;
      sendBtn.disabled = true;
      inputEl.disabled = true;
      try {
        var data = await apiFn()('/api/chat/messages', {
          method: 'POST',
          body: replyTo ? { to: peer.email, text: text, replyTo: replyTo.id } : { to: peer.email, text: text }
        });
        inputEl.value = '';
        setReplyTo(null);
        if (messagesEl.querySelector('.dc-empty')) messagesEl.innerHTML = '';
        // Paint once from REST; server no longer echoes WS to sender
        if (data && data.message) appendMsg(data.message);
        await loadThreads();
        // Keep lock through ghost-click window after fast POST
        sendCooldownUntil = Date.now() + 1000;
      } catch (err) {
        alert(err.message || 'No se pudo enviar');
      } finally {
        var unlockIn = Math.max(0, sendCooldownUntil - Date.now());
        setTimeout(function () {
          sending = false;
          setComposeEnabled(!!peer);
          try { inputEl.focus(); } catch (e2) {}
        }, unlockIn || 0);
      }
    });

    // Block synthetic click / double-tap while locked or in cooldown
    sendBtn.addEventListener('click', function (e) {
      if (sending || Date.now() < sendCooldownUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
    sendBtn.addEventListener('touchend', function (e) {
      if (sending || Date.now() < sendCooldownUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, { capture: true, passive: false });

    searchEl.addEventListener('input', function () {
      filter = searchEl.value || '';
      renderList();
    });
    var addForm = container.querySelector('[data-dc=\"add-form\"]');
    if (addForm) {
      addForm.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var addInp = container.querySelector('[data-dc=\"add-input\"]');
        var query = ((addInp && addInp.value) || '').trim();
        if (!query) return;
        var addBtn = addForm.querySelector('button');
        if (addBtn) addBtn.disabled = true;
        try {
          var addedRes = await apiFn()('/api/added-accounts', { method: 'POST', body: { query: query } });
          if (addInp) addInp.value = '';
          await loadUsers();
          await loadThreads();
          renderList();
          if (addedRes && addedRes.status === 'pending') alert('Solicitud enviada. No se añade hasta que la otra persona acepte.');
        } catch (err) {
          alert((err && err.message) || 'No se pudo añadir la cuenta');
        }
        if (addBtn) addBtn.disabled = false;
      });
    }
    inputEl.addEventListener('input', function () {
      if (!peer || !inputEl.value) return;
      var now = Date.now();
      if (now - lastTypingSent < 2500) return;
      lastTypingSent = now;
      wsSend({ type: 'chat_typing', to: peer.email });
    });
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && replyTo) { e.preventDefault(); e.stopPropagation(); setReplyTo(null); }
    });
    var msInput = container.querySelector('[data-dc="msearch-input"]');
    if (msInput) {
      msInput.addEventListener('input', function () { msgSearchQ = msInput.value || ''; applyMsgSearch(); });
      msInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation();
          msInput.value = ''; msgSearchQ = ''; applyMsgSearch();
          container.querySelector('[data-dc="msearchbar"]').hidden = true;
        }
      });
    }
    container.addEventListener('click', function (ev) {
      var sb = ev.target && ev.target.closest ? ev.target.closest('[data-dc="msearch"]') : null;
      if (sb) {
        ev.preventDefault();
        var bar = container.querySelector('[data-dc="msearchbar"]');
        if (!bar) return;
        bar.hidden = !bar.hidden;
        if (bar.hidden) { msgSearchQ = ''; if (msInput) msInput.value = ''; applyMsgSearch(); }
        else if (msInput) { try { msInput.focus(); } catch (e) {} }
        return;
      }
      if (!(ev.target && ev.target.closest && ev.target.closest('.dc-react-picker, [data-act="react"]'))) closeReactPicker();
    });

    function setTab(next) {
      mode = next;
      tabUsers.classList.toggle('active', mode === 'users');
      tabThreads.classList.toggle('active', mode === 'threads');
      renderList();
      if (mode === 'threads') loadThreads();
      else loadUsers();
    }
    tabUsers.addEventListener('click', function () { setTab('users'); });
    tabThreads.addEventListener('click', function () { setTab('threads'); });

    async function sendPhotoFile(file) {
      if (!peer || sending) return;
      if (Date.now() < sendCooldownUntil) return;
      sending = true;
      sendBtn.disabled = true;
      inputEl.disabled = true;
      if (photoBtn) photoBtn.disabled = true;
      try {
        var dataUrl = await dcCompressImage(file);
        var data = await apiFn()('/api/chat/messages', {
          method: 'POST',
          body: { to: peer.email, text: '', image: dataUrl }
        });
        if (messagesEl.querySelector('.dc-empty')) messagesEl.innerHTML = '';
        if (data && data.message) appendMsg(data.message);
        await loadThreads();
        sendCooldownUntil = Date.now() + 1000;
      } catch (err) {
        alert((err && err.message) || 'No se pudo enviar la foto');
      } finally {
        var unlockIn = Math.max(0, sendCooldownUntil - Date.now());
        setTimeout(function () {
          sending = false;
          setComposeEnabled(!!peer);
        }, unlockIn || 0);
      }
    }
    if (photoBtn && photoFile) {
      photoBtn.addEventListener('click', function () {
        if (!peer || sending || photoBtn.disabled) return;
        photoFile.click();
      });
      photoFile.addEventListener('change', function () {
        var file = photoFile.files && photoFile.files[0];
        photoFile.value = '';
        if (file) showPhotoConfirm(file);
      });
    }

    // Vista previa antes de enviar una foto
    function closePhotoConfirm() {
      var old = container.querySelector('.dc-photo-confirm');
      if (!old) return;
      var oldUrl = old._url;
      if (oldUrl) setTimeout(function () { try { URL.revokeObjectURL(oldUrl); } catch (eU) {} }, 1500);
      old.remove();
    }
    function showPhotoConfirm(file) {
      closePhotoConfirm();
      if (!/^image\//.test(file.type || '')) { sendPhotoFile(file); return; }
      var box = document.createElement('div');
      box.className = 'dc-photo-confirm';
      var url = '';
      try { url = URL.createObjectURL(file); } catch (eO) { url = ''; }
      box._url = url;
      var img = document.createElement('img');
      img.alt = 'Vista previa';
      if (url) img.src = url;
      var info = document.createElement('div');
      info.className = 'dc-photo-confirm-info';
      var t1 = document.createElement('b');
      t1.textContent = '¿Enviar esta foto' + (peer ? ' a ' + (peer.name || peer.email) : '') + '?';
      var t2 = document.createElement('span');
      t2.textContent = (file.name || 'foto') + ' · ' + Math.max(1, Math.round((file.size || 0) / 1024)) + ' KB';
      info.appendChild(t1); info.appendChild(t2);
      var ok = document.createElement('button');
      ok.type = 'button'; ok.className = 'dc-photo-ok'; ok.textContent = 'Enviar foto';
      var no = document.createElement('button');
      no.type = 'button'; no.className = 'dc-photo-no'; no.textContent = 'Cancelar';
      ok.addEventListener('click', function () { closePhotoConfirm(); if (peer) sendPhotoFile(file); });
      no.addEventListener('click', function () { closePhotoConfirm(); try { inputEl.focus(); } catch (eF) {} });
      box.appendChild(img); box.appendChild(info); box.appendChild(ok); box.appendChild(no);
      formEl.parentNode.insertBefore(box, formEl);
      try { ok.focus(); } catch (eF2) {}
    }
    container.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && container.querySelector('.dc-photo-confirm')) { ev.stopPropagation(); closePhotoConfirm(); }
    });

    // Pegar o arrastrar una foto al chat abre la misma vista previa
    function dcFirstImage(list) {
      if (!list) return null;
      for (var i = 0; i < list.length; i++) { var f = list[i]; if (f && /^image\//.test(f.type || '')) return f; }
      return null;
    }
    function dcHasFiles(ev) {
      var t = ev.dataTransfer && ev.dataTransfer.types;
      if (!t) return false;
      for (var i = 0; i < t.length; i++) if (t[i] === 'Files') return true;
      return false;
    }
    inputEl.addEventListener('paste', function (ev) {
      if (!peer) return;
      var f = dcFirstImage(ev.clipboardData && ev.clipboardData.files);
      if (f) { ev.preventDefault(); showPhotoConfirm(f); }
    });
    (function () {
      var dropZone = container.querySelector('.dc-main');
      if (!dropZone) return;
      var depth = 0;
      dropZone.addEventListener('dragenter', function (ev) { if (!peer || !dcHasFiles(ev)) return; ev.preventDefault(); depth++; dropZone.classList.add('dc-drop-on'); });
      dropZone.addEventListener('dragover', function (ev) { if (!peer || !dcHasFiles(ev)) return; ev.preventDefault(); try { ev.dataTransfer.dropEffect = 'copy'; } catch (eD) {} });
      dropZone.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) dropZone.classList.remove('dc-drop-on'); });
      dropZone.addEventListener('drop', function (ev) {
        depth = 0; dropZone.classList.remove('dc-drop-on');
        if (!peer || !dcHasFiles(ev)) return;
        ev.preventDefault();
        var f = dcFirstImage(ev.dataTransfer.files);
        if (f) showPhotoConfirm(f);
      });
    })();

    container.addEventListener('click', function (ev) {
      var lbtn = ev.target && ev.target.closest ? ev.target.closest('[data-dc="loc"]') : null;
      if (lbtn) {
        ev.preventDefault();
        if (peer && !lbtn.disabled) dcLocToggle(peer);
        return;
      }
      var vbtn = ev.target && ev.target.closest ? ev.target.closest('[data-dc="video"]') : null;
      var cbtn = ev.target && ev.target.closest ? ev.target.closest('[data-dc="call"]') : null;
      var btn = vbtn || cbtn;
      if (!btn || !peer || btn.disabled) return;
      ev.preventDefault();
      var st = dcSnapshot();
      var email = String(peer.email || '').toLowerCase();
      var same = st.peerEmail && st.peerEmail === email;
      if (same && (st.phase === 'active' || (st.phase === 'ringing' && st.role === 'caller'))) {
        dcHangup();
        return;
      }
      if (same && st.phase === 'ringing' && st.role === 'callee') {
        dcAnswer();
        return;
      }
      if (st.phase !== 'idle') return;
      dcStartCall(peer, !!vbtn);
    });

    function onAccountReq() {
      if (mode !== 'users') setTab('users');
      else loadUsers();
    }
    global.addEventListener('snake-account-request', onAccountReq);
    var reqPoll = setInterval(function () { loadUsers(); }, 15000);
    loadUsers();
    loadThreads();

    function restoreLiveCall() {
      var st = dcSnapshot();
      if (!st.peerEmail || st.phase === 'idle') return;
      var found = users.filter(function (u) {
        return String(u.email || '').toLowerCase() === st.peerEmail;
      })[0];
      var avatar = (dcCall.peer && dcCall.peer.avatar) || '🐶';
      if (found) openPeer(found);
    }

    var want = takePendingPeer();
    if (want) {
      // resolve from users list after load
      loadUsers().then(function () {
        var found = users.filter(function (u) { return u.email === want; })[0];
        if (found) openPeer(found);
      });
    } else if (dcCall.phase !== 'idle' && dcCall.peer && dcCall.peer.email) {
      loadUsers().then(function () { restoreLiveCall(); });
    }
    if (dcCall.phase !== 'idle') dcRepaintCallChrome();

    return function cleanup() {
      try { global.removeEventListener('snake-account-request', onAccountReq); } catch (eReqOff) {}
      try { clearInterval(reqPoll); } catch (ePoll) {}
      unsub();
      if (offCall) offCall();
      // Cerrar la ventana, minimizar u ocultar el chat NO cuelga.
      // La llamada sigue (WebRTC + PCM + websocket) hasta Colgar, rechazar o que cuelgue la otra parte.
      var email = peer && peer.email ? String(peer.email).toLowerCase() : '';
      if (email && (dcLoc.peerEmail === email || dcLoc.pendingEmail === email)) dcLocStop();
      peer = null;
    };
  }

  global.renderDoganieroChatApp = renderDoganieroChatApp;
  global.ensureNotifUi = ensureNotifUi;
  global.startNotificationCenter = startNotificationCenter;
  global.stopNotificationCenter = stopNotificationCenter;
  global.unsubscribePushForLogout = unsubscribePushForLogout;
  global.setDoganieroChatPeer = setPendingPeer;
  global.openDoganieroChatWith = openChatWithPeer;
  global.refreshSnakeNotifications = refreshNotifications;
  global.ensureNativeNotifPermission = ensureNativeNotifPermission;
  // Doganiero Phone usa el mismo sistema de llamadas
  global.startDoganieroCall = function (peer, asVideo) { return dcStartCall(peer, !!asVideo); };
  var boardCallAt = 0;
  var boardCallTo = '';
  function placeBoardCall(peer) {
    var email = String((peer && (peer.email || peer.number)) || '').toLowerCase();
    var now = Date.now();
    if (email && email === boardCallTo && now - boardCallAt < 5000) return;
    boardCallTo = email;
    boardCallAt = now;
    return dcStartCall(peer, false, 'i9');
  }
  global.startDoganieroBoardCall = placeBoardCall;
  global.isDoganieroChatConnected = function () {
    try { return !!(notifState.ws && notifState.ws.readyState === 1); } catch (e) { return false; }
  };
  global.ensureDoganieroChatWs = function () {
    try {
      if (notifState.ws && notifState.ws.readyState === 1) return Promise.resolve(true);
      if (typeof connectChatWs === 'function') connectChatWs();
    } catch (e0) {}
    return new Promise(function (resolve) {
      var n = 0;
      var iv = setInterval(function () {
        n++;
        if (notifState.ws && notifState.ws.readyState === 1) { clearInterval(iv); resolve(true); }
        else if (n > 25) { clearInterval(iv); resolve(false); }
      }, 120);
    });
  };
  global.hangupDoganieroCall = function () { dcHangup(); };
  global.answerDoganieroCall = function () { dcAnswer(); };
  global.declineDoganieroCall = function () { dcDecline(); };
  global.onDoganieroCallChange = onDcCallChange;
  global.getDoganieroCallState = dcSnapshot;
})(typeof window !== 'undefined' ? window : globalThis);
