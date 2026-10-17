/* Snake OS · barra de tareas «escamas» (2026-10-16, rehecha desde el parche de LinkBot 2): barra verde orgánica, iconos centrados,
   anclados (Buscar, Doganiero Chat, Explorador, Navegador) e indicador de app abierta.
   Solo reorganiza la barra existente: #startBtn, #taskItems, #tbTools, el reloj, la batería,
   las notificaciones, etc. siguen siendo los mismos elementos con su funcionalidad.
   En modo teléfono no cambia nada (#tb11Center usa display:contents y los anclados se ocultan).
   Iconos SVG originales de Snake OS. */
(function () {
  'use strict';
  // Botón de inicio: logo oficial elegido por Doganiero (assets/snake-os-logo-v2.svg)
  var LOGO = '<img src="/static/assets/snake-os-logo-v2.svg?v=1" alt="" draggable="false">';
  var SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.2" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.2 15.2l5.3 5.3" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
  // Anclados: apps REALES del registro window.APPS (título e icono propios). Las que no existan se omiten.
  var PIN_IDS = ['explorer', 'browser', 'book', 'doganiero-book', 'chat', 'phone', 'store'];
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function appIcon(a) {
    if (a.iconImg) return '<img src="' + esc(a.iconImg) + '" alt="" draggable="false">';
    if (a.iconHtml) return a.iconHtml;
    return '<span class="tb11-emo">' + esc(a.icon || '📦') + '</span>';
  }
  function pins() {
    var A = window.APPS || {}, out = [{ id: 'search', title: 'Buscar', svg: SEARCH, run: function () { var b = document.getElementById('tbSearchBtn'); if (b) b.click(); } }];
    PIN_IDS.forEach(function (id) { var a = A[id]; if (a && !out.some(function (o) { return o.title === a.title; })) out.push({ id: id, app: id, title: a.title || id, svg: appIcon(a) }); });
    return out;
  }
  var PINS;

  function init() {
    var bar = document.getElementById('taskbar'), start = document.getElementById('startBtn'), items = document.getElementById('taskItems');
    if (!bar || !start || !items || document.getElementById('tb11Center')) return;
    document.body.classList.add('tb11');
    // Botón de inicio: logo SVG + texto (el texto queda para lectores de pantalla y el modo teléfono)
    var ico = document.createElement('span'); ico.className = 'tb11-start-ico'; ico.innerHTML = LOGO;
    start.insertBefore(ico, start.firstChild);
    Array.prototype.slice.call(start.childNodes).forEach(function (n) {
      if (n.nodeType === 3 && n.nodeValue.trim()) { var s = document.createElement('span'); s.className = 'tb11-label'; s.textContent = n.nodeValue; start.replaceChild(s, n); }
    });
    if (!start.title) start.title = 'Inicio';
    PINS = pins();
    var center = document.createElement('div'); center.id = 'tb11Center';
    bar.insertBefore(center, start);
    center.appendChild(start);
    PINS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'tb11-pin'; b.id = 'tb11pin-' + p.id; b.title = p.title; b.setAttribute('aria-label', p.title);
      if (p.app) b.dataset.app = p.app;
      b.innerHTML = '<span class="tb11-ico">' + p.svg + '</span>';
      b.addEventListener('click', function () {
        if (p.run) return p.run();
        var t = document.getElementById('task-' + p.app);
        if (t) t.click(); else if (typeof window.openApp === 'function') window.openApp(p.app);
      });
      center.appendChild(b);
    });
    center.appendChild(items);
    var mo = new MutationObserver(sync);
    mo.observe(items, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    sync();
  }
  function sync() {
    var items = document.getElementById('taskItems'); if (!items) return;
    Array.prototype.forEach.call(items.querySelectorAll('.task-item'), function (t) {
      var appId = t.id.replace(/^task-/, '');
      var pin = document.querySelector('.tb11-pin[data-app="' + appId + '"]');
      t.classList.toggle('tb11-hide', !!pin);
      if (!t.dataset.tb11) {
        t.dataset.tb11 = '1';
        var img = t.querySelector('img'), txt = t.textContent.trim(), icon, label;
        if (img) { icon = img.outerHTML; label = txt; }
        else { var m = txt.match(/^(\S+)\s+([\s\S]*)$/); icon = m ? m[1] : '▫️'; label = m ? m[2] : txt; }
        if (!t.title) t.title = label;
        t.setAttribute('aria-label', label);
        t.innerHTML = '<span class="tb11-ico">' + icon + '</span><span class="tb11-lab"></span>';
        t.querySelector('.tb11-lab').textContent = label;
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tb11-pin[data-app]'), function (p) {
      var t = document.getElementById('task-' + p.dataset.app);
      p.classList.toggle('running', !!t);
      p.classList.toggle('active', !!(t && t.classList.contains('active')));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* ===== Ventana de inicio «cristal líquido» anclada sobre el logo (2026-10-16) =====
   Buscar · Fijadas (todas las apps reales de window.APPS) · Recientes (por perfil, máx. 6) ·
   avatar + nombre + Apagar / Cerrar sesión. Esc o clic fuera cierra. En móvil: hoja inferior.
   «Más opciones» abre el menú de inicio clásico (#startMenu) con todas sus funciones. */
(function () {
  'use strict';
  function T(es, en) { try { return window.snakeI18n && window.snakeI18n.lang === 'en' ? en : es; } catch (e) { return es; } }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tr(s) { try { return window.snakeI18n && window.snakeI18n.t ? window.snakeI18n.t(s) : s; } catch (e) { return s; } }
  var POWER_SVG = '<svg class="snk-pwr-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 3.2v8.3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M7.1 6.4a7.9 7.9 0 1 0 9.8 0" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
  window.snkPowerSvg = POWER_SVG;
  function key() { var u = window.currentUser; return 'snkRecentApps:' + ((u && u.email) || 'anon'); }
  function recent() { try { return JSON.parse(localStorage.getItem(key()) || '[]').filter(function (id) { return (window.APPS || {})[id]; }); } catch (e) { return []; } }
  function remember(id) {
    if (!id || !(window.APPS || {})[id] || id === 'about') return;
    var r = recent().filter(function (x) { return x !== id; }); r.unshift(id);
    try { localStorage.setItem(key(), JSON.stringify(r.slice(0, 6))); } catch (e) {}
  }
  function icon(a) {
    if (a.iconImg) return '<img src="' + esc(a.iconImg) + '" alt="" draggable="false">';
    return '<span class="sm11-emo">' + esc(a.icon || '📦') + '</span>';
  }
  var panel, open = false;
  function tile(id) { var a = window.APPS[id]; return '<button type="button" class="sm11-app" data-app="' + esc(id) + '" title="' + esc(tr(a.title || id)) + '"><span class="sm11-ico">' + icon(a) + '</span><span class="sm11-lab">' + esc(tr(a.title || id)) + '</span></button>'; }
  function render(q) {
    var A = window.APPS || {}, ids = Object.keys(A);
    q = String(q || '').trim().toLowerCase();
    var list = q ? ids.filter(function (id) { var t = String(A[id].title || id); return t.toLowerCase().indexOf(q) >= 0 || tr(t).toLowerCase().indexOf(q) >= 0 || id.indexOf(q) >= 0; }) : ids;
    panel.querySelector('[data-pinh]').textContent = q ? T('Resultados', 'Results') : T('Fijadas', 'Pinned');
    panel.querySelector('[data-grid]').innerHTML = list.map(tile).join('') || '<div class="sm11-none">' + esc(T('No hay apps con ese nombre', 'No apps match')) + '</div>';
    var r = recent(), rw = panel.querySelector('[data-recw]');
    rw.hidden = !!q || !r.length;
    panel.querySelector('[data-rec]').innerHTML = r.map(tile).join('');
    var u = window.currentUser || {};
    var avEl = panel.querySelector('[data-av]'), av = String(u.avatar || '');
    if (av && typeof window.avatarMarkup === 'function' && (av.indexOf('/api/avatars/') === 0 || av.indexOf('data:image/') === 0)) {
      if (avEl.dataset.src !== av) {
        avEl.dataset.src = av; avEl.innerHTML = window.avatarMarkup(av, 'sm11-av-img');
        var im = avEl.querySelector('img'); if (im) im.onerror = function () { avEl.dataset.src = ''; avEl.textContent = '🐍'; };
      }
    } else { avEl.dataset.src = ''; avEl.textContent = av || '🐍'; }
    panel.querySelector('[data-name]').textContent = u.name || u.email || '';
  }
  function build() {
    panel = document.createElement('div'); panel.id = 'sm11'; panel.setAttribute('role', 'dialog'); panel.hidden = true;
    panel.innerHTML =
      '<div class="sm11-search"><span>🔍</span><input type="search" data-q autocomplete="off"></div>' +
      '<div class="sm11-h"><b data-pinh></b><button type="button" class="sm11-more" data-more></button></div>' +
      '<div class="sm11-grid" data-grid></div>' +
      '<div data-recw><div class="sm11-h"><b data-rech></b></div><div class="sm11-grid sm11-rec" data-rec></div></div>' +
      '<div class="sm11-foot"><div class="sm11-user"><span class="sm11-av" data-av></span><span data-name></span></div>' +
      '<div class="sm11-pw"><button type="button" data-out></button><button type="button" class="sm11-pwr" data-power>' + POWER_SVG + '<span class="sm11-pwr-t"></span></button></div></div>';
    document.body.appendChild(panel);
    panel.addEventListener('click', function (e) {
      var b = e.target.closest('[data-app]');
      if (b) { close(); try { window.openApp(b.dataset.app); } catch (er) {} return; }
      if (e.target.closest('[data-more]')) { close(); setTimeout(function () { var m = document.getElementById('startMenu'); if (m) m.classList.add('open'); }, 0); return; }
      if (e.target.closest('[data-power]')) { close(); var p = document.querySelector('#startMenu .start-item.poweroff'); if (p) p.click(); return; }
      if (e.target.closest('[data-out]')) { close(); var o = document.querySelector('#startMenu .start-item.logout'); if (o) o.click(); }
    });
    panel.querySelector('[data-q]').addEventListener('input', function () { render(this.value); });
    panel.querySelector('[data-q]').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var f = panel.querySelector('[data-grid] [data-app]'); if (f) f.click(); }
    });
  }
  function place() {
    var s = document.getElementById('startBtn'); if (!s) return;
    var phone = document.body.classList.contains('phone-mode') || window.innerWidth < 640;
    panel.classList.toggle('sheet', phone);
    if (phone) { panel.style.left = panel.style.bottom = panel.style.top = ''; return; }
    var r = s.getBoundingClientRect(), w = panel.offsetWidth, bar = document.getElementById('taskbar').getBoundingClientRect();
    var left = Math.round(r.left + r.width / 2 - w / 2);
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    panel.style.left = left + 'px';
    panel.style.bottom = Math.round(window.innerHeight - bar.top + 14) + 'px';
    panel.style.setProperty('--sm11-arrow', Math.round(r.left + r.width / 2 - left) + 'px');
  }
  function show() {
    if (!panel) build();
    var q = panel.querySelector('[data-q]'); q.value = ''; q.placeholder = T('Buscar apps', 'Search apps');
    panel.querySelector('[data-more]').textContent = T('Más opciones ›', 'More options ›');
    panel.querySelector('[data-rech]').textContent = T('Recientes', 'Recent');
    panel.querySelector('[data-out]').textContent = T('Cerrar sesión', 'Sign out');
    var pw = panel.querySelector('[data-power]'); pw.title = T('Apagar', 'Power off'); pw.setAttribute('aria-label', T('Apagar Snake OS', 'Power off Snake OS')); pw.querySelector('.sm11-pwr-t').textContent = T('Apagar', 'Power off');
    render('');
    panel.hidden = false; open = true; place();
    requestAnimationFrame(function () { panel.classList.add('on'); });
    try { var m = document.getElementById('startMenu'); if (m) m.classList.remove('open'); } catch (e) {}
    setTimeout(function () { if (open && !document.body.classList.contains('phone-mode')) q.focus(); }, 60);
  }
  function close() { if (!panel || !open) return; open = false; panel.classList.remove('on'); panel.hidden = true; }
  window.snkStart11 = { open: show, close: close, isOpen: function () { return open; } };
  function hook() {
    var s = document.getElementById('startBtn'); if (!s || s.__sm11) return; s.__sm11 = 1;
    s.addEventListener('click', function (e) { e.stopImmediatePropagation(); e.preventDefault(); open ? close() : show(); }, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) close(); });
    document.addEventListener('pointerdown', function (e) { if (open && panel && !panel.contains(e.target) && !s.contains(e.target)) close(); }, true);
    window.addEventListener('resize', function () { if (open) place(); });
    var items = document.getElementById('taskItems');
    if (items) new MutationObserver(function (ms) { ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.id && /^task-/.test(n.id)) remember(n.id.slice(5)); }); }); }).observe(items, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();

/* ===== Apps abiertas a la izquierda de la barra de tareas (2026-10-17) =====
   Como el dock del modo trabajo: #taskItems (los botones de ventanas abiertas de siempre) se mueve a #tbOpen,
   junto al avatar. Icono + nombre si cabe (si no, solo icono; si aún no cabe, scroll con la rueda y difuminado).
   La ventana en primer plano se resalta (.tb-front), las minimizadas se atenúan. Clic: traer delante / restaurar /
   minimizar si ya está delante (index.html). Clic central o menú contextual: cerrar. En modo teléfono vuelve a su sitio.
   Sustituye a la barra lateral vertical (snake-sidebar.js), cuya preferencia guardada se borra. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function T(es, en) { try { return window.snakeI18n && window.snakeI18n.lang === 'en' ? en : es; } catch (e) { return es; } }
  function email() { var u = window.currentUser; return (u && u.email) || 'anon'; }
  function key() { return 'snkTbOpen:' + email(); }
  function prefs() { var p = {}; try { p = JSON.parse(localStorage.getItem(key()) || '{}') || {}; } catch (e) {} return { labels: p.labels !== false }; }
  try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('snkSidebar:') === 0) localStorage.removeItem(k); }); } catch (e) {}
  try { document.body && document.body.classList.remove('snk-side-on', 'snk-side-left', 'snk-side-right', 'snk-side-mini'); } catch (e) {}
  var box, raf = 0, menu = null;

  function phone() { return document.body.classList.contains('phone-mode'); }
  function place() {
    var bar = $('taskbar'), items = $('taskItems'), center = $('tb11Center');
    if (!bar || !items || !center) return false;
    if (!box) {
      box = document.createElement('div'); box.id = 'tbOpen';
      box.setAttribute('role', 'group'); box.setAttribute('aria-label', T('Apps abiertas', 'Open apps'));
      box.addEventListener('wheel', function (e) {
        if (box.scrollWidth <= box.clientWidth + 1) return;
        var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        box.scrollLeft += d; e.preventDefault(); paintFade();
      }, { passive: false });
      box.addEventListener('scroll', paintFade, { passive: true });
      box.addEventListener('contextmenu', onMenu);
    }
    if (phone()) {
      if (items.parentNode !== center) center.appendChild(items);
      if (box.parentNode) box.remove();
    } else {
      var ub = $('userBadge');
      if (box.parentNode !== bar) bar.insertBefore(box, ub && ub.parentNode === bar ? ub.nextSibling : bar.firstChild);
      if (items.parentNode !== box) box.appendChild(items);
      var vd = $('snkVd'); if (vd && vd.parentNode !== center) center.appendChild(vd);
    }
    return true;
  }
  function front() {
    var best = null, z = -1;
    document.querySelectorAll('#windows > .app-window').forEach(function (w) {
      if (w.classList.contains('minimized') || w.classList.contains('win-closing') || w.classList.contains('snk-vd-off')) return;
      var zi = parseInt(w.style.zIndex, 10) || 0; if (zi >= z) { z = zi; best = w; }
    });
    return best ? best.id.replace(/^win-/, '') : '';
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(paint); }
  function paint() {
    raf = 0;
    if (!place()) return;
    var f = front(), items = $('taskItems');
    Array.prototype.forEach.call(items.querySelectorAll('.task-item'), function (t) {
      var id = t.id.replace(/^task-/, ''), w = $('win-' + id);
      var on = id === f, min = !!(w && w.classList.contains('minimized'));
      if (t.classList.contains('tb-front') !== on) t.classList.toggle('tb-front', on);
      if (t.classList.contains('tb-min') !== min) t.classList.toggle('tb-min', min);
      t.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    fit();
  }
  /* nombres si caben; si no, solo iconos; si aún no, scroll */
  function fit() {
    if (!box || phone()) return;
    var bar = $('taskbar'), center = $('tb11Center'), body = document.body;
    var p = prefs();
    var absCenter = center && getComputedStyle(center).position === 'absolute';
    var lim, n = box.querySelectorAll('.task-item:not(.snk-vd-off)').length;
    var dock = $('osxWorkDock'), dockOn = dock && body.classList.contains('osx-work') && getComputedStyle(dock).display !== 'none';
    if (absCenter) {
      var startX = (dockOn ? dock : box).getBoundingClientRect().left;
      var avail = center.getBoundingClientRect().left - startX - 14;
      if (dockOn) {
        /* modo trabajo: el dock de trabajo y las apps abiertas se reparten el hueco */
        var need = n ? Math.min(n * 43 + 14, avail / 2) : 0;
        dock.style.maxWidth = '';
        var dw = Math.max(44, Math.min(dock.scrollWidth + 2, avail - need - 6));
        dock.style.maxWidth = Math.round(dw) + 'px';
        avail -= dw + 6;
      }
      lim = avail;
    } else {
      var bw = bar.getBoundingClientRect().width;
      lim = Math.round(bw * (dockOn ? 0.17 : 0.3));
      if (dockOn) dock.style.maxWidth = Math.round(bw * 0.15) + 'px';
    }
    lim = Math.max(46, Math.round(lim));
    box.style.maxWidth = lim + 'px';
    box.classList.toggle('empty', !n);
    var wantLabels = p.labels && window.innerWidth >= 900;
    /* ancho por botón con nombre: reparte el hueco; por debajo de 92 px, solo iconos */
    var per = n ? Math.floor((lim - 14 - (n - 1) * 3) / n) : 172;
    if (wantLabels && per >= 92) {
      body.classList.remove('tb-open-icons');
      box.style.setProperty('--tbo-w', Math.min(172, per) + 'px');
    } else { body.classList.add('tb-open-icons'); box.style.removeProperty('--tbo-w'); }
    paintFade();
  }
  function paintFade() {
    if (!box) return;
    var over = box.scrollWidth > box.clientWidth + 1;
    box.classList.toggle('fade-l', over && box.scrollLeft > 2);
    box.classList.toggle('fade-r', over && box.scrollLeft + box.clientWidth < box.scrollWidth - 2);
  }
  /* menú contextual: traer delante / minimizar / maximizar / cerrar */
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  function onMenu(e) {
    var t = e.target.closest('.task-item'); if (!t) return;
    e.preventDefault(); e.stopPropagation(); closeMenu();
    var id = t.id.replace(/^task-/, ''), W = window.snkWin || {}, w = $('win-' + id);
    var min = w && w.classList.contains('minimized'), max = w && w.classList.contains('maximized');
    menu = document.createElement('div'); menu.id = 'tbOpenMenu'; menu.setAttribute('role', 'menu');
    var name = (t.getAttribute('aria-label') || t.textContent || id).trim();
    menu.innerHTML = '<div class="h"></div>' +
      '<button type="button" role="menuitem" data-a="focus">' + (min ? T('Restaurar', 'Restore') : T('Traer delante', 'Bring to front')) + '</button>' +
      (min ? '' : '<button type="button" role="menuitem" data-a="min">' + T('Minimizar', 'Minimize') + '</button>') +
      (phone() ? '' : '<button type="button" role="menuitem" data-a="max">' + (max ? T('Restaurar tamaño', 'Restore size') : T('Maximizar', 'Maximize')) + '</button>') +
      '<button type="button" role="menuitem" data-a="close" class="x">✕ ' + T('Cerrar ventana', 'Close window') + '</button>';
    menu.querySelector('.h').textContent = name;
    document.body.appendChild(menu);
    var r = t.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.left)) + 'px';
    menu.style.top = Math.max(8, r.top - mh - 8) + 'px';
    menu.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-a]'); if (!b) return;
      var a = b.dataset.a; closeMenu();
      if (a === 'focus' && W.focus) W.focus(id);
      else if (a === 'min' && W.minimize) W.minimize(id);
      else if (a === 'max' && W.maximize) { if (min && W.focus) W.focus(id); W.maximize(id); }
      else if (a === 'close' && W.close) W.close(id);
      schedule();
    });
    setTimeout(function () { var fb = menu && menu.querySelector('button'); if (fb) fb.focus(); }, 0);
  }
  document.addEventListener('pointerdown', function (e) { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu) closeMenu(); });
  window.addEventListener('blur', closeMenu);

  window.snkTbOpen = {
    get: prefs,
    setLabels: function (v) { try { localStorage.setItem(key(), JSON.stringify({ labels: !!v })); } catch (e) {} schedule(); },
    refresh: schedule
  };
  function start() {
    if (!$('taskItems') || !$('tb11Center')) { setTimeout(start, 300); return; }
    paint();
    var wo = new MutationObserver(schedule);
    function watchWins() { document.querySelectorAll('#windows > .app-window').forEach(function (w) { if (!w._snkTbo) { w._snkTbo = 1; wo.observe(w, { attributes: true, attributeFilter: ['class', 'style'] }); } }); }
    var wl = $('windows');
    if (wl) { new MutationObserver(function () { watchWins(); schedule(); }).observe(wl, { childList: true }); watchWins(); }
    new MutationObserver(schedule).observe($('taskItems'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    var bodyCls = document.body.className;
    new MutationObserver(function () { if (document.body.className !== bodyCls) { bodyCls = document.body.className; schedule(); } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    var bar = $('taskbar'); if (bar) new MutationObserver(schedule).observe(bar, { childList: true });
    window.addEventListener('resize', schedule);
    var em = email(); setInterval(function () { if (email() !== em) { em = email(); schedule(); } }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 0); }); else setTimeout(start, 0);
})();
