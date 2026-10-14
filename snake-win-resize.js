/* Snake OS — Ajustar ventanas con el ratón (2026-10-14)
 * Arrastra bordes y esquinas para cambiar el tamaño. Solo escritorio (no modo teléfono). */
(function () {
  'use strict';
  if (window.__snkWinResize) return;
  window.__snkWinResize = true;

  var M = 7, M_TOUCH = 16, MINW = 300, MINH = 200;
  var lastPtr = 'mouse';
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
      'body.snk-win-resizing,body.snk-win-resizing *{touch-action:none !important;}\n' +
      'body:not(.phone-mode) .app-window{touch-action:pan-x pan-y;}\n' +
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
  function dirFor(win, x, y, ptr) {
    var m = (ptr || lastPtr) === 'mouse' ? M : M_TOUCH;
    if (!win || phone()) return '';
    if (win.classList.contains('maximized') || win.classList.contains('minimized')) return '';
    var r = win.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return '';
    var d = '';
    if (y - r.top < m) d += 'n'; else if (r.bottom - y < m) d += 's';
    if (x - r.left < m) d += 'w'; else if (r.right - x < m) d += 'e';
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
    lastPtr = e.pointerType || 'mouse';
    var d = dirFor(win, e.clientX, e.clientY, lastPtr);
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
      l: 0, t: 0, w: 0, h: 0
    };
    // Coordenadas de pantalla (no offsetLeft) para que los límites cuadren con el viewport.
    var r0 = win.getBoundingClientRect();
    var par = win.offsetParent ? win.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
    st.l = r0.left; st.t = r0.top; st.w = r0.width; st.h = r0.height;
    st.pl = par.left; st.pt = par.top;
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
      if (st.dir.indexOf('e') >= 0) w = st.w + dx;
      if (st.dir.indexOf('s') >= 0) h = st.h + dy;
      if (st.dir.indexOf('w') >= 0) {
        w = Math.max(MINW, st.w - dx);
        l = Math.max(0, st.l + (st.w - w));
        w = st.l + st.w - l;
      }
      if (st.dir.indexOf('n') >= 0) {
        h = Math.max(MINH, st.h - dy);
        t = Math.max(0, st.t + (st.h - h));
        h = st.t + st.h - t;
      }
      w = Math.max(MINW, Math.min(w, maxW - Math.max(0, l)));
      h = Math.max(MINH, Math.min(h, maxH - Math.max(0, t)));
      st.win.style.left = (l - st.pl) + 'px';
      st.win.style.top = (t - st.pt) + 'px';
      st.win.style.width = w + 'px';
      st.win.style.height = h + 'px';
      return;
    }
    if (e.buttons) return;
    if (document.body.classList.contains('snk-win-dragging')) return;
    var win = e.target && e.target.closest ? e.target.closest('.app-window') : null;
    if (e.pointerType && e.pointerType !== 'mouse') return;
    setDir(dirFor(win, e.clientX, e.clientY, 'mouse'));
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
