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
