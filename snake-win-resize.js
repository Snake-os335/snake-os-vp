/* Snake OS — Ajustar ventanas con el ratón (2026-10-14)
 * Arrastra bordes y esquinas para cambiar el tamaño. Solo escritorio (no modo teléfono). */
(function () {
  'use strict';
  if (window.__snkWinResize) return;
  window.__snkWinResize = true;

  var M = 7, MINW = 300, MINH = 200;
  var st = null, hoverDir = '';
  var DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
  var CUR = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };

  function phone() { return !!(document.body && document.body.classList.contains('phone-mode')); }
  function css() {
    if (document.getElementById('snkWinResizeCss')) return;
    var s = document.createElement('style');
    s.id = 'snkWinResizeCss';
    var t = '';
    DIRS.forEach(function (d) {
      t += 'body.snk-rz-' + d + ',body.snk-rz-' + d + ' *{cursor:' + CUR[d] + ' !important;}\n';
    });
    t += 'body.snk-win-resizing{user-select:none;-webkit-user-select:none;}\n' +
      'body.snk-win-resizing .app-window{transition:none !important;}\n' +
      'body.snk-win-resizing iframe,body.snk-win-resizing video,body.snk-win-resizing canvas{pointer-events:none !important;}\n';
    s.textContent = t;
    document.head.appendChild(s);
  }
  function setDir(d) {
    if (d === hoverDir) return;
    var b = document.body;
    if (hoverDir) b.classList.remove('snk-rz-' + hoverDir);
    hoverDir = d;
    if (d) b.classList.add('snk-rz-' + d);
  }
  function dirFor(win, x, y) {
    if (!win || phone()) return '';
    if (win.classList.contains('maximized') || win.classList.contains('minimized')) return '';
    var r = win.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return '';
    var d = '';
    if (y - r.top < M) d += 'n'; else if (r.bottom - y < M) d += 's';
    if (x - r.left < M) d += 'w'; else if (r.right - x < M) d += 'e';
    return d;
  }
  function topZ(win) {
    var max = 0;
    document.querySelectorAll('.app-window').forEach(function (w) {
      var z = parseInt(w.style.zIndex, 10) || 0;
      if (w !== win && z > max) max = z;
    });
    if ((parseInt(win.style.zIndex, 10) || 0) <= max) win.style.zIndex = String(max + 1);
  }

  document.addEventListener('pointerdown', function (e) {
    if (e.button != null && e.button !== 0) return;
    var win = e.target && e.target.closest ? e.target.closest('.app-window') : null;
    var d = dirFor(win, e.clientX, e.clientY);
    if (!d) return;
    if (e.target.closest('.win-btn')) return;
    e.preventDefault();
    // En la barra de título evitamos que empiece a mover la ventana.
    if (e.target.closest('.win-titlebar')) { e.stopPropagation(); topZ(win); }
    win.classList.remove('win-appear');
    win.style.opacity = '';
    win.style.transform = '';
    st = {
      win: win, dir: d, id: e.pointerId, x: e.clientX, y: e.clientY,
      l: win.offsetLeft, t: win.offsetTop, w: win.offsetWidth, h: win.offsetHeight
    };
    setDir(d);
    document.body.classList.add('snk-win-resizing');
    try { win.setPointerCapture(e.pointerId); } catch (err) {}
  }, true);

  window.addEventListener('pointermove', function (e) {
    if (st) {
      if (st.id != null && e.pointerId !== st.id) return;
      var dx = e.clientX - st.x, dy = e.clientY - st.y;
      var l = st.l, t = st.t, w = st.w, h = st.h;
      var maxW = window.innerWidth, maxH = window.innerHeight;
      if (st.dir.indexOf('e') >= 0) w = Math.min(Math.max(MINW, st.w + dx), maxW - st.l);
      if (st.dir.indexOf('s') >= 0) h = Math.min(Math.max(MINH, st.h + dy), maxH - st.t);
      if (st.dir.indexOf('w') >= 0) {
        w = Math.max(MINW, st.w - dx);
        l = st.l + (st.w - w);
        if (l < 0) { w += l; l = 0; }
      }
      if (st.dir.indexOf('n') >= 0) {
        h = Math.max(MINH, st.h - dy);
        t = st.t + (st.h - h);
        if (t < 0) { h += t; t = 0; }
      }
      st.win.style.left = l + 'px';
      st.win.style.top = t + 'px';
      st.win.style.width = w + 'px';
      st.win.style.height = h + 'px';
      return;
    }
    if (e.buttons) return;
    if (document.body.classList.contains('snk-win-dragging')) return;
    var win = e.target && e.target.closest ? e.target.closest('.app-window') : null;
    setDir(dirFor(win, e.clientX, e.clientY));
  }, { passive: true });

  function end() {
    if (!st) return;
    var win = st.win;
    try { win.releasePointerCapture(st.id); } catch (err) {}
    st = null;
    document.body.classList.remove('snk-win-resizing');
    setDir('');
    try { win.dispatchEvent(new CustomEvent('snk-win-resized', { bubbles: true })); } catch (e1) {}
    try { window.dispatchEvent(new Event('resize')); } catch (e2) {}
  }
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  window.addEventListener('blur', end);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', css);
  else css();
})();
