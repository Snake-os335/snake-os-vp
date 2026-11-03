/* Snake OS 2026.15 — horas de silencio, papelera con plazo, reabrir ventana y bienvenida.
   Todo es local (localStorage por perfil). No borra archivos que ya estaban en la papelera
   hasta que pase el plazo contado desde la primera vez que esta versión los ve. */
(function () {
  'use strict';
  if (window.__snk2615) return;
  window.__snk2615 = true;
  var VER = '2026.15';

  function EN() { return !!(window.snakeI18n && window.snakeI18n.lang === 'en'); }
  function T(es, en) { return EN() ? en : es; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function cu() { try { return (typeof currentUser !== 'undefined' && currentUser) || window.currentUser || null; } catch (e) { return window.currentUser || null; } }
  function em() { var u = cu(); return u && u.email ? String(u.email).toLowerCase() : ''; }
  function K(k) { return 'snk2615:' + k + ':' + em(); }
  function get(k, d) { try { var v = localStorage.getItem(K(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(K(k), JSON.stringify(v)); } catch (e) {} }
  function toast(msg, ms) { if (window.snkToast) window.snkToast(msg, ms); }
  function inField(t) {
    t = t || document.activeElement;
    if (!t || !t.closest) return false;
    return !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .xterm, .cm-editor');
  }
  function css(txt) {
    var s = $('snk2615css');
    if (!s) { s = document.createElement('style'); s.id = 'snk2615css'; document.head.appendChild(s); }
    s.textContent += txt;
  }

  var DEF = { qOn: false, qFrom: '22:00', qTo: '07:00', trashDays: 0 };
  function P() { var p = get('prefs', {}) || {}; var o = {}; Object.keys(DEF).forEach(function (k) { o[k] = p[k] == null ? DEF[k] : p[k]; }); return o; }
  function setP(k, v) { var p = get('prefs', {}) || {}; p[k] = v; set('prefs', p); }
  window.snk2615 = { prefs: P, set: setP, version: VER };

  function mins(s) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); if (!m) return null; var h = +m[1], mm = +m[2]; if (h > 23 || mm > 59) return null; return h * 60 + mm; }
  function quietNow(p) {
    p = p || P();
    if (!p.qOn) return false;
    var a = mins(p.qFrom), b = mins(p.qTo);
    if (a == null || b == null) return false;
    var d = new Date(), m = d.getHours() * 60 + d.getMinutes();
    if (a === b) return true;
    if (a < b) return m >= a && m < b;
    return m >= a || m < b;
  }
  window.snkQuietNow = function () { try { return quietNow(); } catch (e) { return false; } };

  function askTime(cur, title) {
    var v = window.prompt(title, cur || '22:00');
    if (v == null) return null;
    v = String(v).trim();
    var m = /^(\d{1,2}):(\d{2})$/.exec(v);
    if (!m) { toast(T('Usa el formato HH:MM, por ejemplo 22:00', 'Use HH:MM, for example 22:00')); return null; }
    var h = ('0' + (+m[1])).slice(-2), mm = ('0' + m[2]).slice(-2);
    if (+h > 23 || +mm > 59) { toast(T('Esa hora no existe', 'That time does not exist')); return null; }
    return h + ':' + mm;
  }

  /* ---------- Papelera: el plazo empieza cuando esta versión ve el archivo ---------- */
  function trashList() { try { return (typeof trashFiles !== 'undefined' && Array.isArray(trashFiles)) ? trashFiles : []; } catch (e) { return []; } }
  function stampAndMaybePurge() {
    if (!em()) return;
    var arr = trashList();
    var map = get('trashSeen', {}) || {};
    var now = Date.now(), ids = {}, changed = false;
    arr.forEach(function (f) {
      if (!f || f.id == null) return;
      var id = String(f.id);
      ids[id] = 1;
      if (!map[id]) { map[id] = now; changed = true; }
    });
    Object.keys(map).forEach(function (id) { if (!ids[id]) { delete map[id]; changed = true; } });
    if (changed) set('trashSeen', map);
    var days = +P().trashDays || 0;
    if (!days) return;
    var limit = days * 86400000, doomed = {};
    var n = 0;
    arr.forEach(function (f) {
      if (!f || f.id == null) return;
      var t = +map[String(f.id)] || 0;
      if (t && now - t >= limit) { doomed[String(f.id)] = 1; n++; }
    });
    if (!n) return;
    for (var i = arr.length - 1; i >= 0; i--) if (arr[i] && doomed[String(arr[i].id)]) arr.splice(i, 1);
    try { if (typeof persistTrash === 'function') persistTrash(); } catch (e) {}
    try { if (typeof refreshFileUI === 'function') refreshFileUI(); } catch (e2) {}
    toast(T('Papelera: se eliminaron ' + n + ' archivo(s) con más de ' + days + ' días', 'Trash: ' + n + ' file(s) older than ' + days + ' days were removed'), 4000);
  }

  /* ---------- Reabrir la última ventana ---------- */
  var closed = [];
  window.__snkOnAppClose = function (id) {
    if (!id || String(id).indexOf('file-') === 0) return;
    var apps; try { apps = (typeof APPS !== 'undefined') ? APPS : window.APPS; } catch (e) { apps = window.APPS; }
    if (!apps || !apps[id]) return;
    closed = closed.filter(function (x) { return x !== id; });
    closed.unshift(id);
    if (closed.length > 12) closed.length = 12;
  };
  function reopenLast() {
    var apps; try { apps = (typeof APPS !== 'undefined') ? APPS : window.APPS; } catch (e) { apps = window.APPS; }
    var open; try { open = (typeof openApps !== 'undefined') ? openApps : {}; } catch (e2) { open = {}; }
    while (closed.length) {
      var id = closed.shift();
      if (!apps || !apps[id]) continue;
      if (open[id] && !open[id]._closing) { try { if (window.snkWin) window.snkWin.focus(id); } catch (e3) {} return; }
      if (window.openApp) { window.openApp(id); toast(T('Ventana reabierta', 'Window reopened')); return; }
    }
    toast(T('No hay una ventana reciente para reabrir', 'No recent window to reopen'));
  }
  window.snkReopenLast = reopenLast;
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'T' || e.key === 't')) {
      if (inField()) return;
      e.preventDefault();
      reopenLast();
    }
  }, true);

  window.__snkSetRows = window.__snkSetRows || [];
  window.__snkSetRows.push(function (row) {
    row('notificaciones', 'quiet15', '🌙', T('Horas de silencio', 'Quiet hours'), T('Silencia avisos y recordatorios en ese horario. «No molestar» sigue igual y puedes apagarlo a mano.', 'Silences alerts and reminders on that schedule. Do not disturb stays as it is and you can still turn it off by hand.'), 'toggle', { get: function () { return !!P().qOn; }, set: function (v) { setP('qOn', !!v); toast(v ? T('Horas de silencio activadas', 'Quiet hours on') : T('Horas de silencio desactivadas', 'Quiet hours off')); } });
    row('notificaciones', 'quietfrom15', '🕗', T('Silencio desde', 'Quiet from'), T('Hora de inicio (formato 22:00). Si es más tarde que la hora de fin, cruza la medianoche.', 'Start time (22:00 style). If it is later than the end time, it crosses midnight.'), 'action', { label: function () { return P().qFrom; }, btn: T('Cambiar', 'Change'), run: function () { var v = askTime(P().qFrom, T('¿Desde qué hora? (HH:MM)', 'From what time? (HH:MM)')); if (v) { setP('qFrom', v); if (!P().qOn) setP('qOn', true); } } });
    row('notificaciones', 'quietto15', '🕖', T('Silencio hasta', 'Quiet until'), T('Hora de fin (formato 07:00).', 'End time (07:00 style).'), 'action', { label: function () { return P().qTo; }, btn: T('Cambiar', 'Change'), run: function () { var v = askTime(P().qTo, T('¿Hasta qué hora? (HH:MM)', 'Until what time? (HH:MM)')); if (v) { setP('qTo', v); if (!P().qOn) setP('qOn', true); } } });
    row('almacenamiento', 'trashdays15', '🗑️', T('Vaciar la papelera sola', 'Empty the Trash on its own'), T('Nunca, a los 7 días o a los 30. Lo que ya estaba en la papelera empieza a contar desde ahora.', 'Never, after 7 days or after 30. What is already in the Trash starts counting from now.'), 'action', {
      label: function () { var d = +P().trashDays || 0; return T('Ahora: ', 'Now: ') + (d ? (d + T(' días', ' days')) : T('nunca', 'never')); },
      btn: T('Cambiar', 'Change'),
      run: function () {
        var d = +P().trashDays || 0;
        var n = d === 0 ? 7 : d === 7 ? 30 : 0;
        setP('trashDays', n);
        toast(n ? T('La papelera se vaciará a los ' + n + ' días', 'The Trash will empty after ' + n + ' days') : T('La papelera ya no se vacía sola', 'The Trash will no longer empty itself'));
      }
    });
    row('escritorio', 'reopen15', '↩️', T('Reabrir la última ventana', 'Reopen the last window'), T('Alt+Mayús+T trae de vuelta la última app que cerraste en esta sesión.', 'Alt+Shift+T brings back the last app you closed in this session.'), 'action', { btn: T('Reabrir', 'Reopen'), run: reopenLast });
    row('acerca', 'welcome15', '🎉', T('Novedades de la 2026.15', 'What is new in 2026.15'), T('Vuelve a ver la presentación de esta versión', 'See this version introduction again'), 'action', { btn: T('Ver', 'Show'), run: function () { showWelcome(); } });
  });

  css(
    '.s15-wel{position:fixed;inset:0;z-index:11500;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:14px}' +
    '.s15-wel .card{width:min(520px,100%);max-height:min(86vh,680px);display:flex;flex-direction:column;border-radius:22px;overflow:hidden;color:#fff;background:linear-gradient(160deg,rgba(18,40,28,.94),rgba(10,18,30,.96));border:1px solid rgba(255,255,255,.18);box-shadow:0 24px 70px rgba(0,0,0,.5)}' +
    '.s15-wel .hero{padding:18px 18px 8px;text-align:center}.s15-wel h2{margin:4px 0;font-size:1.25rem}' +
    '.s15-wel .ver{display:inline-block;margin-top:4px;padding:2px 10px;border-radius:999px;background:rgba(52,209,122,.25);color:#7dffb3;font-weight:800;font-size:.78rem}' +
    '.s15-wel ul{margin:0;padding:8px 22px 12px 36px;overflow:auto;font-size:.82rem;line-height:1.45}' +
    '.s15-wel .ft{display:flex;justify-content:flex-end;padding:10px 16px 14px}' +
    '.s15-wel .s14-btn{margin:0;min-height:36px;padding:6px 14px;border-radius:10px;font-weight:800;cursor:pointer;border:0;background:linear-gradient(135deg,#34d17a,#1f9e57);color:#04170c}' +
    'body.phone-mode .s15-wel .s14-btn{min-height:44px}' +
    'body.light .s15-wel .card,body.theme-light .s15-wel .card{color:#0b1f14;background:linear-gradient(160deg,#f3fff7,#e8f1ff)}'
  );
  function showWelcome() {
    if (document.querySelector('.s15-wel') || document.querySelector('.s14-wel')) return;
    var ch = (window.SNAKE_OS_CHANGES || []).filter(function (x) { return x.v === VER; })[0];
    var items = ch ? ((EN() ? ch.en : ch.es) || ch.es || []) : [];
    var w = document.createElement('div');
    w.className = 's15-wel'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true');
    w.setAttribute('data-noi18n', ''); w.setAttribute('translate', 'no');
    w.innerHTML = '<div class="card"><div class="hero"><div style="font-size:2.2rem">🐍</div><h2>' + esc(T('Snake OS ' + VER, 'Snake OS ' + VER)) + '</h2><div class="ver">' + esc(T('Qué hay de nuevo', 'What’s new')) + '</div></div><ul>' +
      items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul><div class="ft"><button type="button" class="s14-btn" data-a="ok">' + esc(T('Entendido', 'Got it')) + '</button></div></div>';
    function close() { set('welcome', VER); w.remove(); document.removeEventListener('keydown', onKey, true); }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    w.addEventListener('click', function (e) { if (e.target === w || (e.target.closest && e.target.closest('[data-a="ok"]'))) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(w);
    try { w.querySelector('[data-a="ok"]').focus(); } catch (e) {}
  }
  window.snkShowWelcome2615 = showWelcome;
  function visible(n) { return !!(n && n.getClientRects().length && getComputedStyle(n).display !== 'none' && getComputedStyle(n).visibility !== 'hidden'); }
  function maybeWelcome() {
    if (!em() || get('welcome', '') === VER) return;
    var desk = $('desktop');
    if (!desk || desk.classList.contains('hidden')) return;
    if (visible($('osTutorialCard')) || visible($('setupWizard')) || visible($('lockScreen')) || document.querySelector('.s14-wel')) return;
    try { if (window.snkOsx && window.snkOsx.isKids && window.snkOsx.isKids()) { set('welcome', VER); return; } } catch (e) {}
    try { if (localStorage.getItem('snk2614:welcome:' + em()) !== '2026.14') return; } catch (e2) {}
    showWelcome();
  }

  var booted = false;
  function boot() {
    if (booted || !em()) return;
    booted = true;
    setTimeout(stampAndMaybePurge, 4000);
    setInterval(function () { if (em()) stampAndMaybePurge(); }, 120000);
  }
  setInterval(function () { boot(); maybeWelcome(); }, 2000);
  setTimeout(function () { boot(); maybeWelcome(); }, 1500);
})();
