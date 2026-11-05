/* Snake OS 2026.16 — ajustar la ventana de delante con el teclado y la bienvenida.
   El tamaño anterior se guarda en la propia ventana (esta sesión). No toca el diseño Pro. */
(function () {
  'use strict';
  if (window.__snk2616) return;
  window.__snk2616 = true;
  var VER = '2026.16';

  function EN() { return !!(window.snakeI18n && window.snakeI18n.lang === 'en'); }
  function T(es, en) { return EN() ? en : es; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function cu() { try { return (typeof currentUser !== 'undefined' && currentUser) || window.currentUser || null; } catch (e) { return window.currentUser || null; } }
  function em() { var u = cu(); return u && u.email ? String(u.email).toLowerCase() : ''; }
  function K(k) { return 'snk2616:' + k + ':' + em(); }
  function get(k, d) { try { var v = localStorage.getItem(K(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(K(k), JSON.stringify(v)); } catch (e) {} }
  function toast(msg, ms) { if (window.snkToast) window.snkToast(msg, ms); }
  function phone() { return !!(document.body && document.body.classList.contains('phone-mode')); }
  function inField(t) {
    t = t || document.activeElement;
    if (!t || !t.closest) return false;
    return !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .xterm, .cm-editor');
  }
  function css(txt) {
    var s = $('snk2616css');
    if (!s) { s = document.createElement('style'); s.id = 'snk2616css'; document.head.appendChild(s); }
    s.textContent += txt;
  }
  function openWins() {
    try { return (typeof openApps !== 'undefined' && openApps) || window.openApps || {}; } catch (e) { return window.openApps || {}; }
  }

  function front() {
    var O = openWins(), best = null, z = -1, id = null;
    Object.keys(O).forEach(function (k) {
      var r = O[k];
      if (!r || !r.win || r.minimized || r._closing) return;
      if (r.win.classList.contains('minimized') || r.win.classList.contains('win-closing') || r.win.classList.contains('snk-vd-off')) return;
      var zi = parseInt(r.win.style.zIndex, 10) || 0;
      if (zi >= z) { z = zi; best = r; id = k; }
    });
    return best ? { id: id, win: best.win } : null;
  }
  function layerBox() {
    var layer = $('windows');
    var w = layer ? (layer.clientWidth || layer.getBoundingClientRect().width) : window.innerWidth;
    var h = layer ? (layer.clientHeight || layer.getBoundingClientRect().height) : window.innerHeight;
    return { w: Math.max(240, Math.round(w)), h: Math.max(180, Math.round(h)) };
  }
  function saveGeom(win) {
    if (win.dataset.snkSnapGeom) return;
    var max = win.classList.contains('maximized');
    win.dataset.snkSnapGeom = JSON.stringify({
      l: max ? (win.dataset.prevLeft || win.style.left || '') : (win.style.left || ''),
      t: max ? (win.dataset.prevTop || win.style.top || '') : (win.style.top || ''),
      w: max ? (win.dataset.prevWidth || win.style.width || '') : (win.style.width || ''),
      h: max ? (win.dataset.prevHeight || win.style.height || '') : (win.style.height || '')
    });
  }
  function restoreGeom(win) {
    var raw = win.dataset.snkSnapGeom;
    if (!raw) return false;
    var g = {};
    try { g = JSON.parse(raw) || {}; } catch (e) { return false; }
    win.classList.remove('maximized');
    win.style.left = g.l || '';
    win.style.top = g.t || '';
    win.style.width = g.w || '';
    win.style.height = g.h || '';
    delete win.dataset.snkSnapGeom;
    delete win.dataset.snkSnap;
    return true;
  }
  function clickMax(win) {
    var b = win.querySelector('.win-btn.max');
    if (b) b.click();
  }
  function applyHalf(win, dir) {
    var box = layerBox();
    var half = Math.max(200, Math.round(box.w / 2));
    win.classList.remove('maximized');
    win.style.left = (dir === 'right' ? Math.max(0, box.w - half) : 0) + 'px';
    win.style.top = '0px';
    win.style.width = half + 'px';
    win.style.height = box.h + 'px';
    win.dataset.snkSnap = dir;
  }
  function snap(dir) {
    if (phone()) { toast(T('En el móvil las ventanas ya ocupan la pantalla', 'On a phone, windows already fill the screen')); return; }
    var f = front();
    if (!f) { toast(T('No hay ninguna ventana delante', 'There is no window in front')); return; }
    var win = f.win;
    if (dir === 'down') {
      if (win.classList.contains('maximized')) { clickMax(win); toast(T('Ventana en su sitio', 'Window back in place')); return; }
      if (restoreGeom(win)) { toast(T('Ventana en su sitio', 'Window back in place')); return; }
      toast(T('La ventana ya está en su sitio', 'The window is already in place'));
      return;
    }
    if (dir === 'up') {
      if (win.classList.contains('maximized')) { toast(T('Ya está a pantalla completa', 'Already full screen')); return; }
      saveGeom(win);
      clickMax(win);
      toast(T('Pantalla completa', 'Full screen'));
      return;
    }
    if (win.dataset.snkSnap === dir && !win.classList.contains('maximized')) {
      restoreGeom(win);
      toast(T('Ventana en su sitio', 'Window back in place'));
      return;
    }
    saveGeom(win);
    applyHalf(win, dir);
    toast(dir === 'left' ? T('Ajustada a la izquierda', 'Snapped left') : T('Ajustada a la derecha', 'Snapped right'));
  }
  window.snkSnapFront = snap;

  document.addEventListener('keydown', function (e) {
    if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || e.repeat) return;
    var dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
    if (!dir || inField(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    snap(dir);
  }, true);

  css(
    '.s16-wel{position:fixed;inset:0;z-index:11500;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:14px}' +
    '.s16-wel .card{width:min(520px,100%);max-height:min(86vh,680px);display:flex;flex-direction:column;border-radius:22px;overflow:hidden;color:#fff;background:linear-gradient(160deg,rgba(18,40,28,.94),rgba(10,18,30,.96));border:1px solid rgba(255,255,255,.18);box-shadow:0 24px 70px rgba(0,0,0,.5)}' +
    '.s16-wel .hero{padding:18px 18px 8px;text-align:center}.s16-wel h2{margin:4px 0;font-size:1.25rem}' +
    '.s16-wel .ver{display:inline-block;margin-top:4px;padding:2px 10px;border-radius:999px;background:rgba(52,209,122,.25);color:#7dffb3;font-weight:800;font-size:.78rem}' +
    '.s16-wel ul{margin:0;padding:8px 22px 12px 36px;overflow:auto;font-size:.82rem;line-height:1.45}' +
    '.s16-wel .ft{display:flex;justify-content:flex-end;padding:10px 16px 14px}' +
    '.s16-wel .s14-btn{margin:0;min-height:36px;padding:6px 14px;border-radius:10px;font-weight:800;cursor:pointer;border:0;background:linear-gradient(135deg,#34d17a,#1f9e57);color:#04170c}' +
    'body.phone-mode .s16-wel .s14-btn{min-height:44px}' +
    'body.light .s16-wel .card,body.theme-light .s16-wel .card{color:#0b1f14;background:linear-gradient(160deg,#f3fff7,#e8f1ff)}'
  );

  function showWelcome() {
    if (document.querySelector('.s16-wel') || document.querySelector('.s15-wel') || document.querySelector('.s14-wel')) return;
    var ch = (window.SNAKE_OS_CHANGES || []).filter(function (x) { return x.v === VER; })[0];
    var items = ch ? ((EN() ? ch.en : ch.es) || ch.es || []) : [];
    var w = document.createElement('div');
    w.className = 's16-wel'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true');
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
  window.snkShowWelcome2616 = showWelcome;
  function visible(n) { return !!(n && n.getClientRects().length && getComputedStyle(n).display !== 'none' && getComputedStyle(n).visibility !== 'hidden'); }
  function maybeWelcome() {
    if (!em() || get('welcome', '') === VER) return;
    var desk = $('desktop');
    if (!desk || desk.classList.contains('hidden')) return;
    if (visible($('osTutorialCard')) || visible($('setupWizard')) || visible($('lockScreen')) || document.querySelector('.s14-wel') || document.querySelector('.s15-wel')) return;
    try { if (window.snkOsx && window.snkOsx.isKids && window.snkOsx.isKids()) { set('welcome', VER); return; } } catch (e) {}
    try { if (localStorage.getItem('snk2615:welcome:' + em()) !== '2026.15') return; } catch (e2) {}
    showWelcome();
  }

  window.__snkSetRows = window.__snkSetRows || [];
  window.__snkSetRows.push(function (row) {
    row('escritorio', 'snap16', '↔️', T('Ajustar la ventana', 'Snap the window'), T('Alt+Mayús+← o → la pone a media pantalla, ↑ a pantalla completa y ↓ la devuelve a su sitio. Vale para la ventana de delante. Otra vez el mismo lado la restaura.', 'Alt+Shift+Left or Right puts it on half the screen, Up makes it full screen and Down puts it back. It applies to the front window. The same side again restores it.'), 'action', { btn: T('A la izquierda', 'Snap left'), run: function () { snap('left'); } });
    row('acerca', 'welcome16', '🎉', T('Novedades de la 2026.16', 'What is new in 2026.16'), T('Vuelve a ver la presentación de esta versión', 'See this version introduction again'), 'action', { btn: T('Ver', 'Show'), run: function () { showWelcome(); } });
  });

  setInterval(maybeWelcome, 2000);
  setTimeout(maybeWelcome, 1800);
})();
