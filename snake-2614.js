/* Snake OS 2026.14 — novedades: bienvenida, luz nocturna, accesibilidad, bienestar,
   mostrar escritorio, ventanas siempre encima, juegos nuevos, marcadores, respuestas rápidas…
   Todo es local (localStorage por perfil); no llama a la API salvo lo que ya existía. */
(function () {
  'use strict';
  if (window.__snk2614) return;
  window.__snk2614 = true;
  var VER = '2026.14';

  /* ---------- utilidades ---------- */
  function EN() { return !!(window.snakeI18n && window.snakeI18n.lang === 'en'); }
  function T(es, en) { if (EN()) { (window.__SNK_EN_OUT = window.__SNK_EN_OUT || {})[en] = 1; return en; } return es; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function cu() { try { return (typeof currentUser !== 'undefined' && currentUser) || window.currentUser || null; } catch (e) { return window.currentUser || null; } }
  function em() { var u = cu(); return u && u.email ? String(u.email).toLowerCase() : ''; }
  function K(k) { return 'snk2614:' + k + ':' + em(); }
  function get(k, d) { try { var v = localStorage.getItem(K(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(K(k), JSON.stringify(v)); } catch (e) {} }
  function isPhone() { return !!(document.body && document.body.classList.contains('phone-mode')); }
  function inField(t) {
    t = t || document.activeElement;
    if (!t || !t.closest) return false;
    return !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .xterm, .cm-editor, canvas');
  }
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('reduce-motion'); } catch (e) { return false; } }
  function toast(msg, ms) {
    var el = $('snk4aToast');
    if (!el) { el = document.createElement('div'); el.id = 'snk4aToast'; el.className = 'snk4a-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('show'); }, ms || 2200);
  }
  window.snkToast = toast;
  function css(txt) {
    var s = $('snk2614css');
    if (!s) { s = document.createElement('style'); s.id = 'snk2614css'; document.head.appendChild(s); }
    s.textContent += txt;
  }
  function apps() { try { return typeof APPS !== 'undefined' ? APPS : null; } catch (e) { return null; } }
  function openWins() { try { return typeof openApps !== 'undefined' ? openApps : {}; } catch (e) { return {}; } }
  function download(name, text, type) {
    var b = new Blob([text], { type: type || 'application/octet-stream' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  css(
    '.s14-btn{margin:0;width:auto;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:32px;padding:5px 11px;border-radius:10px;font-size:.8rem;font-weight:700;cursor:pointer;background:var(--input-bg,rgba(255,255,255,.08));color:var(--text,#fff);border:1px solid var(--input-border,rgba(255,255,255,.2));box-shadow:none}' +
    '.s14-btn:hover{border-color:var(--accent,#34d17a)}.s14-btn.pri{background:linear-gradient(135deg,var(--accent,#34d17a),var(--accent-strong,#1f9e57));color:#04170c;border-color:transparent}' +
    '.s14-btn:disabled{opacity:.5;cursor:default}' +
    'body.phone-mode .s14-btn{min-height:40px}'
  );

  /* ---------- preferencias por perfil ---------- */
  var DEF = { night: false, nightLvl: 0.3, nightAuto: false, cvd: 'none', ul: false, space: false, solid: false, locate: true, breaks: false, edge: true };
  function P() { var p = get('prefs', {}) || {}; var o = {}; Object.keys(DEF).forEach(function (k) { o[k] = p[k] == null ? DEF[k] : p[k]; }); return o; }
  function setP(k, v) { var p = get('prefs', {}) || {}; p[k] = v; set('prefs', p); apply(); }
  window.snk2614 = { prefs: P, set: setP, version: VER };

  /* ---------- 1. Luz nocturna ---------- */
  css('#snkNight{position:fixed;inset:0;pointer-events:none;z-index:2147482000;background:#ff8a1e;mix-blend-mode:multiply;opacity:0;transition:opacity .8s ease}');
  function nightOn(p) {
    if (!p.night) return false;
    if (!p.nightAuto) return true;
    var h = new Date().getHours();
    return h >= 21 || h < 7;
  }
  function applyNight(p) {
    var on = nightOn(p), o = $('snkNight');
    if (!o && on) { o = el('div'); o.id = 'snkNight'; o.setAttribute('aria-hidden', 'true'); document.body.appendChild(o); }
    if (o) o.style.opacity = on ? String(Math.max(0.1, Math.min(0.6, +p.nightLvl || 0.3))) : '0';
    var tile = $('qsNight14'); if (tile) { tile.setAttribute('aria-pressed', on ? 'true' : 'false'); tile.classList.toggle('active', on); }
  }

  /* ---------- 2. Filtros de color (daltonismo) ---------- */
  var SIM = {
    p: [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
    d: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]],
    t: [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]]
  };
  var ERR = [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]];
  function daltonize(S) {
    // D = I + E·(I − S): lleva la información que no se distingue a canales que sí.
    var I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], D = [], r, c, k;
    for (r = 0; r < 3; r++) { D[r] = []; for (c = 0; c < 3; c++) { var s = 0; for (k = 0; k < 3; k++) s += ERR[r][k] * (I[k][c] - S[k][c]); D[r][c] = I[r][c] + s; } }
    return D;
  }
  function fm(D) { return D.map(function (r) { return r.map(function (x) { return x.toFixed(4); }).join(' ') + ' 0 0'; }).join(' ') + ' 0 0 0 1 0'; }
  window.__snkDaltonize = daltonize;
  function ensureFilters() {
    if ($('snkCvdSvg')) return;
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.id = 'snkCvdSvg'; svg.setAttribute('aria-hidden', 'true'); svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    ['p', 'd', 't'].forEach(function (k) {
      var f = document.createElementNS(ns, 'filter'); f.id = 'snkCvd' + k; f.setAttribute('color-interpolation-filters', 'linearRGB');
      var m = document.createElementNS(ns, 'feColorMatrix'); m.setAttribute('type', 'matrix'); m.setAttribute('values', fm(daltonize(SIM[k])));
      f.appendChild(m); svg.appendChild(f);
    });
    document.body.appendChild(svg);
  }
  css('html.snk-cvd-p{filter:url(#snkCvdp)}html.snk-cvd-d{filter:url(#snkCvdd)}html.snk-cvd-t{filter:url(#snkCvdt)}html.snk-cvd-g{filter:grayscale(1)}');
  var CVD = ['none', 'p', 'd', 't', 'g'];
  function cvdName(k) { return ({ none: T('Ninguno', 'None'), p: T('Protanopía (rojo)', 'Protanopia (red)'), d: T('Deuteranopía (verde)', 'Deuteranopia (green)'), t: T('Tritanopía (azul)', 'Tritanopia (blue)'), g: T('Escala de grises', 'Greyscale') })[k] || k; }

  /* ---------- 3. Subrayar enlaces, lectura cómoda, menos transparencia ---------- */
  css('html.snk-ul a,html.snk-ul .link-btn{text-decoration:underline !important;text-underline-offset:2px}' +
      'html.snk-space .win-body,html.snk-space .win-body *{letter-spacing:.045em !important;word-spacing:.14em !important}' +
      'html.snk-space .win-body :is(p,li,label,.sub,.snk4a-set-txt span){line-height:1.7 !important}' +
      'html.snk-solid *{-webkit-backdrop-filter:none !important;backdrop-filter:none !important}' +
      'html.snk-solid .app-window{background:#0f1a14 !important}html.snk-solid body.light .app-window,html.snk-solid body.theme-light .app-window{background:#f3f6f4 !important}' +
      'html.snk-solid #taskbar,html.snk-solid #startMenu,html.snk-solid #qsPanel{background:#0b130f !important}' +
      'html.snk-solid body.light #taskbar,html.snk-solid body.light #startMenu,html.snk-solid body.light #qsPanel{background:#eef2ef !important}');

  function apply() {
    var p = P(), h = document.documentElement;
    try {
      applyNight(p);
      if (p.cvd !== 'none') ensureFilters();
      CVD.forEach(function (k) { h.classList.toggle('snk-cvd-' + k, p.cvd === k && k !== 'none'); });
      h.classList.toggle('snk-ul', !!p.ul);
      h.classList.toggle('snk-space', !!p.space);
      h.classList.toggle('snk-solid', !!p.solid);
    } catch (e) {}
  }

  /* ---------- 4. Localizar el puntero (pulsa Ctrl) ---------- */
  css('.snk-locate{position:fixed;z-index:2147482500;pointer-events:none;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;border:4px solid var(--accent,#34d17a);box-shadow:0 0 0 4px rgba(0,0,0,.35);animation:snkLoc .7s ease-out forwards}' +
      '@keyframes snkLoc{from{transform:scale(1.6);opacity:0}30%{opacity:1}to{transform:scale(.15);opacity:0}}');
  var mx = -1, my = -1, ctrlClean = false;
  document.addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
  document.addEventListener('keydown', function (e) { ctrlClean = (e.key === 'Control' && !e.repeat) ? true : (e.key === 'Control' ? ctrlClean : false); }, true);
  document.addEventListener('mousedown', function () { ctrlClean = false; }, true);
  document.addEventListener('keyup', function (e) {
    if (e.key !== 'Control' || !ctrlClean) return;
    ctrlClean = false;
    if (!P().locate || mx < 0 || !em()) return;
    var r = el('div', 'snk-locate'); r.style.left = mx + 'px'; r.style.top = my + 'px'; document.body.appendChild(r);
    setTimeout(function () { r.remove(); }, 800);
  }, true);

  /* ---------- 5. Leer la selección en voz alta (Alt+R) ---------- */
  function readSelection() {
    var ss = window.speechSynthesis;
    if (!ss || typeof SpeechSynthesisUtterance === 'undefined') { toast(T('Este navegador no puede leer en voz alta', 'This browser cannot read aloud')); return; }
    if (ss.speaking) { ss.cancel(); toast(T('Lectura detenida', 'Reading stopped')); return; }
    var t = String(window.getSelection ? window.getSelection() : '').trim();
    if (!t) { var a = document.activeElement; if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT') && a.selectionEnd > a.selectionStart) t = a.value.slice(a.selectionStart, a.selectionEnd).trim(); }
    if (!t) { toast(T('Selecciona un texto y pulsa Alt+R para oírlo', 'Select some text and press Alt+R to hear it')); return; }
    var u = new SpeechSynthesisUtterance(t.slice(0, 4000)); u.lang = EN() ? 'en-US' : 'es-ES'; u.rate = 1;
    ss.speak(u); toast(T('🔊 Leyendo… (Alt+R para parar)', '🔊 Reading… (Alt+R to stop)'));
  }
  window.snkReadSelection = readSelection;

  /* ---------- 6. Mostrar escritorio + siempre encima ---------- */
  var hiddenByDesk = null;
  function showDesktop() {
    var O = openWins();
    if (hiddenByDesk && hiddenByDesk.length) {
      var back = hiddenByDesk; hiddenByDesk = null;
      back.forEach(function (id) { try { if (O[id] && O[id].minimized) restoreApp(id); } catch (e) {} });
      return;
    }
    var list = Object.keys(O).filter(function (id) { return O[id] && !O[id].minimized; });
    if (!list.length) { toast(T('No hay ventanas abiertas', 'No open windows')); return; }
    list.forEach(function (id) { try { minimizeApp(id); } catch (e) {} });
    hiddenByDesk = list;
  }
  window.snkShowDesktop = showDesktop;
  css('#snkShowDesk{flex:0 0 auto;align-self:stretch;width:10px;min-width:10px;margin:0 0 0 6px;padding:0;border:0;border-left:1px solid rgba(255,255,255,.22);background:transparent;cursor:pointer;border-radius:0;box-shadow:none}' +
      '#snkShowDesk:hover{background:rgba(255,255,255,.14)}body.phone-mode #snkShowDesk{display:none}' +
      '.app-window.snk-ontop{z-index:900000 !important}' +
      '.win-btn.snk-pinbtn{font-size:.78rem;opacity:.75}.win-btn.snk-pinbtn[aria-pressed="true"]{opacity:1;background:rgba(52,209,122,.35) !important}' +
      'body.phone-mode .win-btn.snk-pinbtn{display:none !important}');
  function decorateWin(w) {
    if (!w || w.__s14 || !w.classList || !w.classList.contains('app-window')) return;
    w.__s14 = true;
    var ctr = w.querySelector('.win-controls'); if (!ctr) return;
    var b = el('button', 'win-btn snk-pinbtn', '📌'); b.type = 'button';
    b.title = T('Siempre encima', 'Always on top'); b.setAttribute('aria-label', b.title); b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var on = !w.classList.contains('snk-ontop'); w.classList.toggle('snk-ontop', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      toast(on ? T('📌 Ventana siempre encima', '📌 Window always on top') : T('Ventana normal', 'Normal window'));
    });
    b.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    ctr.insertBefore(b, ctr.firstChild);
  }
  function initWindows() {
    var W = $('windows'); if (!W || W.__s14obs) return;
    W.__s14obs = true;
    Array.prototype.forEach.call(W.querySelectorAll('.app-window'), decorateWin);
    new MutationObserver(function (ms) { ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, decorateWin); }); }).observe(W, { childList: true });
    var clock = $('clock');
    if (clock && !$('snkShowDesk')) {
      var sd = el('button'); sd.id = 'snkShowDesk'; sd.type = 'button'; sd.title = T('Mostrar escritorio (Ctrl+Alt+D)', 'Show desktop (Ctrl+Alt+D)'); sd.setAttribute('aria-label', sd.title);
      sd.addEventListener('click', showDesktop);
      clock.parentNode.insertBefore(sd, clock.nextSibling);
    }
    var grid = $('qsGrid');
    if (grid && !$('qsNight14')) {
      var t = el('button', 'qs-tile', '<span class="qs-tile-ico">🌙</span><span class="qs-tile-lab">' + esc(T('Luz nocturna', 'Night light')) + '</span>');
      t.type = 'button'; t.id = 'qsNight14'; t.setAttribute('aria-pressed', 'false');
      t.addEventListener('click', function () { var p = P(); var on = !nightOn(p); if (on && p.nightAuto) setP('nightAuto', false); setP('night', on); toast(on ? T('🌙 Luz nocturna activada', '🌙 Night light on') : T('Luz nocturna desactivada', 'Night light off')); });
      grid.insertBefore(t, grid.firstChild);
      applyNight(P());
    }
  }

  /* ---------- 7. Atajos globales ---------- */
  var KON = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'], kpos = 0;
  document.addEventListener('keydown', function (e) {
    if (!em()) return;
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyR') {
      if (e.target && e.target.closest && e.target.closest('.xterm')) return;
      e.preventDefault(); readSelection(); return;
    }
    if (e.ctrlKey && e.altKey && e.code === 'KeyD') { e.preventDefault(); showDesktop(); return; }
    if (inField(e.target)) { kpos = 0; return; }
    var k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === KON[kpos]) { kpos++; if (kpos === KON.length) { kpos = 0; konami(); } } else kpos = (k === KON[0]) ? 1 : 0;
  });

  /* ---------- 8. Confeti / lluvia de serpientes ---------- */
  function rain(chars, ms) {
    if (reduced()) return;
    var cv = el('canvas'); cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147481000';
    document.body.appendChild(cv);
    var W = cv.width = innerWidth, H = cv.height = innerHeight, g = cv.getContext('2d'), N = Math.min(140, Math.round(W / 9)), P2 = [], t0 = performance.now();
    var COLORS = ['#34d17a', '#ffd166', '#ef476f', '#118ab2', '#a78bfa', '#ff9f1c'];
    for (var i = 0; i < N; i++) P2.push({ x: Math.random() * W, y: -Math.random() * H * 0.6, vy: 2 + Math.random() * 3.5, vx: -1 + Math.random() * 2, r: Math.random() * 6.28, vr: -0.1 + Math.random() * 0.2, c: COLORS[i % COLORS.length], ch: chars ? chars[i % chars.length] : null, s: 14 + Math.random() * 14 });
    (function fr(ts) {
      var dt = ts - t0; g.clearRect(0, 0, W, H);
      P2.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = Math.max(0, 1 - Math.max(0, dt - ms + 900) / 900);
        if (p.ch) { g.font = p.s + 'px serif'; g.fillText(p.ch, -p.s / 2, p.s / 2); } else { g.fillStyle = p.c; g.fillRect(-5, -3, 10, 6); }
        g.restore();
      });
      if (dt < ms) requestAnimationFrame(fr); else cv.remove();
    })(t0);
  }
  window.snkConfetti = function () { rain(null, 3200); };
  function konami() { rain(['🐍', '🐍', '🍎', '🦴', '✨'], 4200); toast(T('🐍 ¡Código secreto! Eres un Snake de verdad', '🐍 Secret code! You are a true Snake'), 3500); }

  /* ---------- 9. Bienestar digital: tiempo de uso y descansos ---------- */
  var lastInput = Date.now(), activeRun = 0;
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { lastInput = Date.now(); }, { passive: true, capture: true }); });
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function topApp() {
    var O = openWins(), best = null, bz = -1;
    Object.keys(O).forEach(function (id) { var r = O[id]; if (!r || r.minimized || !r.win) return; var z = parseInt(r.win.style.zIndex || '0', 10) || 0; if (z > bz) { bz = z; best = id; } });
    return best || '_desk';
  }
  var STEP = 15;
  function usageTick() {
    if (!em() || document.hidden) return;
    var idle = Date.now() - lastInput;
    if (idle > 120000) { if (idle > 300000) activeRun = 0; return; }
    var U = get('usage', {}) || {}, dk = dayKey(), day = U[dk] || (U[dk] = {}), id = topApp();
    day[id] = (day[id] || 0) + STEP;
    if (id !== '_desk') { var rec = openWins()[id], A = apps(); if (rec && rec.title && !(A && A[id])) { U._t = U._t || {}; U._t[id] = String(rec.title).replace(/<[^>]*>/g, '').trim().slice(0, 60); } }
    var keys = Object.keys(U).filter(function (k) { return k !== '_t'; }).sort(); while (keys.length > 8) delete U[keys.shift()];
    set('usage', U);
    activeRun += STEP;
    if (P().breaks && activeRun >= 20 * 60) {
      activeRun = 0;
      toast(T('👀 Descanso visual: mira algo lejano durante 20 segundos', '👀 Eye break: look at something far away for 20 seconds'), 8000);
    }
  }
  setInterval(usageTick, STEP * 1000);
  window.__snkUsageTick = usageTick;
  function fmtDur(s) { s = Math.round(s); var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? h + ' h ' + m + ' min' : (m ? m + ' min' : (s ? '<1 min' : '0 min')); }
  function appTitle(id, U) { if (id === '_desk') return T('Escritorio', 'Desktop'); var A = apps(); var a = A && A[id]; var t = (a && a.title) || (U && U._t && U._t[id]) || id.replace(/^storeapp-(oss-)?/, ''); if (EN() && window.snakeI18n && window.snakeI18n.t) t = window.snakeI18n.t(t); return t; }
  function appIco(id) { if (id === '_desk') return '🖥️'; var A = apps(); var i = (A && A[id] && A[id].icon) || '🪟'; return String(i).length <= 4 ? i : '🪟'; }
  css('.s14-well{padding:6px 4px 12px;color:var(--text,#fff)}.s14-well h3{margin:2px 0 2px;font-size:1.05rem}.s14-well .big{font-size:2rem;font-weight:900;margin:4px 0 10px;color:var(--accent,#34d17a)}' +
      '.s14-bar{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:.82rem}.s14-bar .n{flex:0 0 40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.s14-bar .b{flex:1;height:10px;border-radius:6px;background:rgba(127,127,127,.25);overflow:hidden}.s14-bar .b i{display:block;height:100%;background:linear-gradient(90deg,var(--accent,#34d17a),#22c1c3);border-radius:6px}.s14-bar .v{flex:0 0 64px;text-align:right;opacity:.8}' +
      '.s14-week{display:flex;align-items:flex-end;gap:8px;height:120px;margin:10px 0 4px;padding:8px;border-radius:12px;background:var(--input-bg,rgba(255,255,255,.06))}.s14-week div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;font-size:.68rem;gap:3px}.s14-week i{display:block;width:100%;max-width:26px;border-radius:6px 6px 2px 2px;background:var(--accent,#34d17a);min-height:2px}.s14-week .today i{background:#ffd166}' +
      '.s14-row{display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px;border-radius:12px;background:var(--input-bg,rgba(255,255,255,.06));font-size:.82rem}.s14-row span{flex:1}');
  function renderWellbeing(body) {
    var wrap = el('div', 's14-well'); wrap.setAttribute('data-noi18n', ''); body.appendChild(wrap);
    var timer;
    function paint() {
      var U = get('usage', {}) || {}, today = U[dayKey()] || {}, ids = Object.keys(today).sort(function (a, b) { return today[b] - today[a]; });
      var total = ids.reduce(function (s, k) { return s + today[k]; }, 0), max = ids.length ? today[ids[0]] : 1;
      var days = []; for (var i = 6; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate() - i); var dk = dayKey(d), tot = 0, x = U[dk] || {}; Object.keys(x).forEach(function (k) { tot += x[k]; }); days.push({ d: d, t: tot, today: i === 0 }); }
      var wmax = Math.max.apply(null, days.map(function (x) { return x.t; }).concat([60]));
      var loc = EN() ? 'en-GB' : 'es-ES';
      wrap.innerHTML = '<h3>🌿 ' + esc(T('Tiempo de uso hoy', 'Screen time today')) + '</h3><div class="big">' + esc(fmtDur(total)) + '</div>' +
        (ids.length ? ids.slice(0, 8).map(function (id) { return '<div class="s14-bar"><span class="n">' + esc(appIco(id)) + ' ' + esc(appTitle(id, U)) + '</span><span class="b"><i style="width:' + Math.max(3, Math.round(today[id] / max * 100)) + '%"></i></span><span class="v">' + esc(fmtDur(today[id])) + '</span></div>'; }).join('') : '<p style="opacity:.75;font-size:.82rem">' + esc(T('Aún no hay datos de hoy. Se cuenta solo el tiempo en que usas Snake OS (no cuando está en segundo plano).', 'No data for today yet. Only the time you actively use Snake OS is counted (not when it is in the background).')) + '</p>') +
        '<h3 style="margin-top:14px">📅 ' + esc(T('Últimos 7 días', 'Last 7 days')) + '</h3><div class="s14-week">' + days.map(function (x) { return '<div class="' + (x.today ? 'today' : '') + '" title="' + esc(fmtDur(x.t)) + '"><i style="height:' + Math.round(x.t / wmax * 90) + '%"></i>' + esc(x.d.toLocaleDateString(loc, { weekday: 'short' })) + '</div>'; }).join('') + '</div>' +
        '<div class="s14-row"><span>👀 ' + esc(T('Descanso visual cada 20 minutos de uso (regla 20-20-20)', 'Eye break every 20 minutes of use (20-20-20 rule)')) + '</span><button type="button" class="s14-btn" data-a="breaks">' + esc(P().breaks ? T('Desactivar', 'Turn off') : T('Activar', 'Turn on')) + '</button></div>' +
        '<div class="s14-row"><span>🧹 ' + esc(T('Los datos solo se guardan en este navegador (8 días).', 'Data is only stored in this browser (8 days).')) + '</span><button type="button" class="s14-btn" data-a="clear">' + esc(T('Borrar', 'Clear')) + '</button></div>';
    }
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'breaks') { setP('breaks', !P().breaks); activeRun = 0; toast(P().breaks ? T('Te avisaré para descansar la vista', 'I will remind you to rest your eyes') : T('Recordatorio desactivado', 'Reminder off')); }
      if (b.dataset.a === 'clear' && confirm(T('¿Borrar el historial de tiempo de uso?', 'Clear the screen time history?'))) set('usage', {});
      paint();
    });
    paint(); timer = setInterval(paint, 30000);
    var onLang = function () { paint(); }; window.addEventListener('snk-lang', onLang);
    return function () { clearInterval(timer); window.removeEventListener('snk-lang', onLang); };
  }

  /* ---------- 10. Exportar / importar preferencias, diagnóstico ---------- */
  var SECRETISH = /token|secret|passw|contrase|session|cookie|apikey|api_key|auth/i;
  function exportPrefs() {
    var e = em(); if (!e) return;
    var out = {}, n = 0;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i); if (!k || k.indexOf(e) < 0 || SECRETISH.test(k)) continue;
      var v = localStorage.getItem(k); if (v == null || v.length > 200000) continue;
      out[k] = v; n++;
    }
    download('snake-os-preferencias-' + dayKey() + '.json', JSON.stringify({ app: 'Snake OS', v: VER, email: e, at: new Date().toISOString(), data: out }, null, 1), 'application/json');
    toast(T('Exportadas ' + n + ' preferencias', n + ' preferences exported'));
  }
  function importText(txt) {
    var e = em(); if (!e) return -1;
    var j = JSON.parse(txt);
    if (!j || j.app !== 'Snake OS' || !j.data || typeof j.data !== 'object') throw new Error('bad');
    var src = String(j.email || '').toLowerCase(), n = 0;
    if (!src) throw new Error('bad');
    Object.keys(j.data).forEach(function (k) {
      var v = j.data[k]; if (typeof v !== 'string' || v.length > 200000 || SECRETISH.test(k) || k.indexOf(src) < 0) return;
      try { localStorage.setItem(k.split(src).join(e), v); n++; } catch (e2) {}
    });
    apply();
    return n;
  }
  window.__snkImportPrefs = importText;
  function importPrefs() {
    if (!em()) return;
    var inp = el('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      if (f.size > 3 * 1024 * 1024) { toast(T('El archivo es demasiado grande', 'The file is too big')); return; }
      f.text().then(function (txt) {
        var n = importText(txt);
        toast(T('Importadas ' + n + ' preferencias. Algunas se aplicarán la próxima vez que abras Snake OS.', n + ' preferences imported. Some will apply next time you open Snake OS.'), 5000);
      }).catch(function () { toast(T('Ese archivo no es una copia de preferencias de Snake OS', 'That file is not a Snake OS preferences backup')); });
    };
    inp.click();
  }
  function diagText() {
    var errs = (window.__snkErrors || []).slice(-10).map(function (x) { return '- ' + String(x && (x.msg || x.message || x.m) || x || '').slice(0, 200); });
    return ['Snake OS ' + (window.SNAKE_OS_VERSION || VER), 'Fecha: ' + new Date().toString(), 'Navegador: ' + navigator.userAgent, 'Pantalla: ' + screen.width + 'x' + screen.height + ' @' + (window.devicePixelRatio || 1) + ' · ventana ' + innerWidth + 'x' + innerHeight,
      'Idioma: ' + (EN() ? 'en' : 'es') + ' · modo teléfono: ' + (isPhone() ? 'sí' : 'no') + ' · en línea: ' + (navigator.onLine ? 'sí' : 'no'), 'Apps abiertas: ' + Object.keys(openWins()).join(', '), 'Errores recientes: ' + (errs.length ? '' : 'ninguno')].concat(errs).join('\n');
  }
  window.__snkDiagText = diagText;
  function diagnostics() {
    var txt = diagText();
    var done = function () { toast(T('Informe copiado: pégalo donde te pidan ayuda', 'Report copied: paste it wherever you ask for help'), 3500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { download('snake-os-diagnostico.txt', txt, 'text/plain'); });
    else download('snake-os-diagnostico.txt', txt, 'text/plain');
  }

  /* ---------- 11. Filas nuevas en Ajustes ---------- */
  window.__snkSetRows = window.__snkSetRows || [];
  window.__snkSetRows.push(function (row) {
    function tg(sec, id, ico, es, en, des, den, key) { row(sec, id, ico, T(es, en), T(des, den), 'toggle', { get: function () { return !!P()[key]; }, set: function (v) { setP(key, !!v); } }); }
    tg('pantalla', 'night14', '🌙', 'Luz nocturna', 'Night light', 'Tonos cálidos para cansar menos la vista por la noche (también en Ajustes rápidos)', 'Warmer colours that are easier on your eyes at night (also in Quick settings)', 'night');
    tg('pantalla', 'nightauto14', '⏰', 'Luz nocturna automática', 'Automatic night light', 'Si la luz nocturna está activada, solo se enciende de 21:00 a 7:00', 'When night light is on, it only turns on from 21:00 to 7:00', 'nightAuto');
    row('pantalla', 'nightlvl14', '🔆', T('Intensidad de la luz nocturna', 'Night light strength'), T('Suave, media o fuerte', 'Soft, medium or strong'), 'action', { label: function () { var v = +P().nightLvl; return T('Ahora: ', 'Now: ') + (v < 0.25 ? T('suave', 'soft') : v < 0.4 ? T('media', 'medium') : T('fuerte', 'strong')); }, btn: T('Cambiar', 'Change'), run: function () { var v = +P().nightLvl, nv = v < 0.25 ? 0.3 : v < 0.4 ? 0.45 : 0.18; setP('nightLvl', nv); if (!P().night) setP('night', true); toast(T('Intensidad cambiada', 'Strength changed')); } });
    row('accesibilidad', 'cvd14', '🎨', T('Filtros de color', 'Colour filters'), T('Ayuda a distinguir colores con daltonismo (protanopía, deuteranopía, tritanopía) o usa escala de grises', 'Helps tell colours apart with colour blindness (protanopia, deuteranopia, tritanopia) or use greyscale'), 'action', { label: function () { return T('Ahora: ', 'Now: ') + cvdName(P().cvd); }, btn: T('Cambiar filtro', 'Change filter'), run: function () { var i = CVD.indexOf(P().cvd); var nk = CVD[(i + 1) % CVD.length]; setP('cvd', nk); toast(T('Filtro: ', 'Filter: ') + cvdName(nk)); } });
    row('accesibilidad', 'read14', '🔊', T('Leer en voz alta', 'Read aloud'), T('Selecciona cualquier texto y pulsa Alt+R para oírlo (otra vez Alt+R para parar)', 'Select any text and press Alt+R to hear it (Alt+R again to stop)'), 'action', { btn: T('Probar', 'Try it'), run: function () { var ss = window.speechSynthesis; if (!ss) { toast(T('Este navegador no puede leer en voz alta', 'This browser cannot read aloud')); return; } if (ss.speaking) { ss.cancel(); return; } var u = new SpeechSynthesisUtterance(T('Hola, soy Snake OS. Selecciona un texto y pulsa Alt más R.', 'Hi, I am Snake OS. Select some text and press Alt plus R.')); u.lang = EN() ? 'en-US' : 'es-ES'; ss.speak(u); } });
    tg('accesibilidad', 'ul14', '🔗', 'Subrayar enlaces', 'Underline links', 'Los enlaces se ven subrayados en todas las apps', 'Links are underlined in every app', 'ul');
    tg('accesibilidad', 'space14', '📖', 'Lectura cómoda', 'Comfortable reading', 'Más espacio entre letras, palabras y líneas dentro de las ventanas', 'More space between letters, words and lines inside windows', 'space');
    tg('accesibilidad', 'solid14', '🧱', 'Reducir transparencia', 'Reduce transparency', 'Ventanas y barra opacas, sin desenfoque (más legible y más ligero)', 'Solid windows and taskbar, no blur (easier to read and lighter)', 'solid');
    tg('accesibilidad', 'locate14', '🎯', 'Localizar el puntero', 'Locate the pointer', 'Pulsa y suelta Ctrl para ver un círculo donde está el ratón', 'Press and release Ctrl to see a circle around the mouse pointer', 'locate');
    tg('accesibilidad', 'edge14', '👈', 'Gesto del borde (móvil)', 'Edge gesture (phone)', 'En el móvil, desliza desde el borde izquierdo para volver al escritorio', 'On phones, swipe in from the left edge to go back to the desktop', 'edge');
    row('bienestar', 'usage14', '🌿', T('Bienestar digital', 'Digital wellbeing'), T('Tiempo de uso de hoy y de la semana por app', 'Screen time today and this week, per app'), 'action', { btn: T('Abrir', 'Open'), run: function () { if (window.openApp) window.openApp('bienestar'); } });
    tg('bienestar', 'breaks14', '👀', 'Descanso visual', 'Eye breaks', 'Un aviso cada 20 minutos de uso para mirar a lo lejos 20 segundos', 'A reminder every 20 minutes of use to look far away for 20 seconds', 'breaks');
    row('escritorio', 'showdesk14', '🖥️', T('Mostrar escritorio', 'Show desktop'), T('Minimiza todas las ventanas y vuelve a mostrarlas: Ctrl+Alt+D o la franja a la derecha del reloj', 'Minimise every window and bring them back: Ctrl+Alt+D or the strip to the right of the clock'), 'action', { btn: T('Mostrar', 'Show'), run: showDesktop });
    row('escritorio', 'ontop14', '📌', T('Ventanas siempre encima', 'Always-on-top windows'), T('Pulsa 📌 en la barra de título de una ventana para que quede delante de las demás', 'Press 📌 in a window title bar to keep it in front of the others'), 'info');
    row('almacenamiento', 'export14', '📤', T('Exportar mis preferencias', 'Export my preferences'), T('Guarda en un archivo los ajustes de este navegador (tema, widgets, apps…) para llevarlos a otro', 'Save this browser settings (theme, widgets, apps…) to a file to take them elsewhere'), 'action', { btn: T('Exportar', 'Export'), run: exportPrefs });
    row('almacenamiento', 'import14', '📥', T('Importar preferencias', 'Import preferences'), T('Carga un archivo exportado antes (no toca archivos, notas ni saldo)', 'Load a previously exported file (does not touch files, notes or balance)'), 'action', { btn: T('Importar', 'Import'), run: importPrefs });
    row('acerca', 'diag14', '🩺', T('Informe de diagnóstico', 'Diagnostic report'), T('Copia la versión, el navegador y los últimos errores para pedir ayuda (sin datos personales)', 'Copies the version, browser and latest errors to ask for help (no personal data)'), 'action', { btn: T('Copiar', 'Copy'), run: diagnostics });
    row('acerca', 'welcome14', '🎉', T('Novedades de la 2026.14', 'What is new in 2026.14'), T('Vuelve a ver la presentación de esta versión', 'See this version introduction again'), 'action', { btn: T('Ver', 'Show'), run: function () { showWelcome(); } });
  });

  /* ---------- 12. Bienvenida a la 2026.14 ---------- */
  css('.s14-wel{position:fixed;inset:0;z-index:11500;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:14px;animation:s14f .25s ease}' +
      '@keyframes s14f{from{opacity:0}to{opacity:1}}' +
      '.s14-wel .card{width:min(580px,100%);max-height:min(88vh,740px);display:flex;flex-direction:column;border-radius:24px;overflow:hidden;color:#fff;background:linear-gradient(160deg,rgba(18,40,28,.93),rgba(10,18,30,.95));border:1px solid rgba(255,255,255,.18);box-shadow:0 30px 80px rgba(0,0,0,.55);-webkit-backdrop-filter:blur(18px) saturate(1.4);backdrop-filter:blur(18px) saturate(1.4)}' +
      '.s14-wel .hero{padding:22px 22px 12px;text-align:center;background:radial-gradient(120% 140% at 50% 0%,rgba(52,209,122,.45),transparent 60%)}' +
      '.s14-wel .hero .logo{font-size:2.8rem;animation:s14b 1.6s ease-in-out infinite}@keyframes s14b{50%{transform:translateY(-6px) rotate(-4deg)}}' +
      '.s14-wel h2{margin:6px 0 2px;font-size:1.45rem}.s14-wel .ver{display:inline-block;margin-top:6px;padding:3px 12px;border-radius:999px;background:rgba(52,209,122,.25);color:#7dffb3;font-weight:800;font-size:.8rem}' +
      '.s14-wel .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:12px 18px;overflow:auto}' +
      '.s14-wel .it{padding:12px;border-radius:16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-size:.8rem;line-height:1.4}.s14-wel .it b{display:block;font-size:.9rem;margin:4px 0 2px}.s14-wel .it .e{font-size:1.5rem}' +
      '.s14-wel .all{display:none;padding:0 18px 8px;overflow:auto;font-size:.78rem;line-height:1.5}.s14-wel.show-all .all{display:block}.s14-wel.show-all .grid{display:none}' +
      '.s14-wel .ft{display:flex;gap:8px;justify-content:flex-end;padding:12px 18px 16px;border-top:1px solid rgba(255,255,255,.1);flex-wrap:wrap}' +
      '@media (max-width:480px){.s14-wel .grid{grid-template-columns:1fr}}' +
      'body.light .s14-wel .card,body.theme-light .s14-wel .card{color:#0b1f14;background:linear-gradient(160deg,rgba(240,255,246,.97),rgba(232,240,255,.97))}body.light .s14-wel .it,body.theme-light .s14-wel .it{background:rgba(0,0,0,.04);border-color:rgba(0,0,0,.08)}body.light .s14-wel .ver,body.theme-light .s14-wel .ver{color:#0b6b3a}');
  var HL = [
    ['🐧', 'Ubuntu 26.10 (estilo) vuelve', 'Ubuntu 26.10 (style) is back', 'Máquinas virtuales recupera el escritorio Ubuntu con Actividades, dock y sus apps. Tus archivos siguen ahí.', 'Virtual machines brings back the Ubuntu desktop with Activities, dock and its apps. Your files are still there.'],
    ['🎮', '4 juegos nuevos', '4 new games', 'Buscaminas, Sudoku, Palabra del día y Tres en raya contra la CPU, en Juegos.', 'Minesweeper, Sudoku, Word of the day and Tic-tac-toe vs the CPU, in Games.'],
    ['🌙', 'Luz nocturna', 'Night light', 'Colores cálidos por la noche, con horario automático y mosaico en Ajustes rápidos.', 'Warm colours at night, with an automatic schedule and a Quick settings tile.'],
    ['♿', 'Más accesibilidad', 'More accessibility', 'Filtros para daltonismo, leer en voz alta (Alt+R), lectura cómoda, subrayar enlaces y menos transparencia.', 'Colour-blind filters, read aloud (Alt+R), comfortable reading, underlined links and less transparency.'],
    ['🌿', 'Bienestar digital', 'Digital wellbeing', 'Mira cuánto usas cada app hoy y esta semana, y activa descansos para la vista.', 'See how long you use each app today and this week, and turn on eye breaks.'],
    ['🖥️', 'Escritorio más potente', 'A more powerful desktop', 'Mostrar escritorio (Ctrl+Alt+D), ventanas siempre encima 📌 y gesto del borde en el móvil.', 'Show desktop (Ctrl+Alt+D), always-on-top windows 📌 and an edge gesture on phones.'],
    ['⌨️', '11 comandos en la Terminal', '11 Terminal commands', 'snakesay, calc, cal, todo, matrix, timer, banner, base64, sha256, uuid y fortune.', 'snakesay, calc, cal, todo, matrix, timer, banner, base64, sha256, uuid and fortune.'],
    ['⭐', 'Mejoras en las apps', 'App upgrades', 'Marcadores en el Navegador, respuestas rápidas en Chat, plantillas en Code Lab, tarjeta en Teléfono y más.', 'Bookmarks in the Browser, quick replies in Chat, templates in Code Lab, a contact card in Phone and more.']
  ];
  function showWelcome() {
    if (!em() || document.querySelector('.s14-wel')) return;
    var ch = (window.SNAKE_OS_CHANGES || []).filter(function (x) { return x.v === VER; })[0];
    var items = ch ? ((EN() ? ch.en : ch.es) || ch.es || []) : [];
    var w = el('div', 's14-wel'); w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-label', 'Snake OS ' + VER); w.setAttribute('data-noi18n', ''); w.setAttribute('translate', 'no');
    w.innerHTML = '<div class="card"><div class="hero"><div class="logo">🐍✨</div><h2>' + esc(T('¡Bienvenido a Snake OS ' + VER + '!', 'Welcome to Snake OS ' + VER + '!')) + '</h2><div style="opacity:.85;font-size:.85rem">' + esc(T('La actualización más grande hasta ahora', 'The biggest update so far')) + '</div><span class="ver">' + esc(T('Versión ', 'Version ') + VER) + '</span></div>' +
      '<div class="grid">' + HL.map(function (h) { return '<div class="it"><span class="e">' + h[0] + '</span><b>' + esc(T(h[1], h[2])) + '</b>' + esc(T(h[3], h[4])) + '</div>'; }).join('') + '</div>' +
      '<div class="all"><ul>' + items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="ft"><button type="button" class="s14-btn" data-a="all">' + esc(T('Ver todas las novedades', 'See everything new')) + '</button><button type="button" class="s14-btn pri" data-a="ok">' + esc(T('¡A disfrutar! 🎉', 'Let\'s go! 🎉')) + '</button></div></div>';
    function close() { set('welcome', VER); w.remove(); document.removeEventListener('keydown', onKey, true); }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    w.addEventListener('click', function (e) {
      if (e.target === w) return close();
      var b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'ok') close();
      if (b.dataset.a === 'all') { var on = w.classList.toggle('show-all'); b.textContent = on ? T('Ver lo más destacado', 'See the highlights') : T('Ver todas las novedades', 'See everything new'); }
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(w);
    try { w.querySelector('[data-a="ok"]').focus(); } catch (e) {}
    rain(null, 3000);
  }
  window.snkShowWelcome2614 = showWelcome;
  var welT = 0;
  function visible(n) { return !!(n && n.getClientRects().length && getComputedStyle(n).display !== 'none' && getComputedStyle(n).visibility !== 'hidden'); }
  function maybeWelcome() {
    if (!em() || get('welcome', '') === VER) return;
    var desk = $('desktop');
    if (!desk || desk.classList.contains('hidden')) return;
    if (visible($('osTutorialCard')) || visible($('setupWizard')) || visible($('lockScreen'))) return;
    if (window.snkOsx && window.snkOsx.isKids && window.snkOsx.isKids()) { set('welcome', VER); return; }
    showWelcome();
  }

  /* ---------- 13. Gesto del borde en modo teléfono ---------- */
  var tx0 = null, ty0 = 0;
  document.addEventListener('touchstart', function (e) {
    tx0 = null;
    if (!isPhone() || !P().edge || !e.touches || e.touches.length !== 1) return;
    var t = e.touches[0]; if (t.clientX > 18) return;
    tx0 = t.clientX; ty0 = t.clientY;
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (tx0 == null) return;
    var t = e.changedTouches && e.changedTouches[0]; var x0 = tx0; tx0 = null; if (!t) return;
    var dx = t.clientX - x0, dy = Math.abs(t.clientY - ty0);
    if (dx > 70 && dy < 60) { var id = topApp(); if (id && id !== '_desk') { try { minimizeApp(id); } catch (e2) {} try { if (navigator.vibrate) navigator.vibrate(12); } catch (e3) {} } }
  }, { passive: true });

  /* ---------- 14. Juegos nuevos (dentro de la app Juegos) ---------- */
  css('.s14-g{padding:4px 2px;color:var(--text,#fff);user-select:none;-webkit-user-select:none}.s14-g .hd{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:4px 0 8px;font-size:.82rem;flex-wrap:wrap}.s14-g select{margin:0;width:auto;min-height:30px;padding:3px 6px;border-radius:8px;font-size:.78rem}' +
      '.s14-ms{display:grid;gap:2px;margin:0 auto;touch-action:manipulation}.s14-ms button{margin:0;padding:0;width:100%;aspect-ratio:1;min-height:0;border-radius:4px;border:0;font-size:.78rem;font-weight:900;background:rgba(255,255,255,.18);color:#fff;box-shadow:none;cursor:pointer;line-height:1}.s14-ms button.o{background:rgba(0,0,0,.25);cursor:default}.s14-ms button.boom{background:#ef476f}' +
      '.s14-ms .n1{color:#5ab0ff}.s14-ms .n2{color:#4ade80}.s14-ms .n3{color:#ff7b7b}.s14-ms .n4{color:#c39bff}.s14-ms .n5{color:#ffb347}.s14-ms .n6{color:#40e0d0}.s14-ms .n7,.s14-ms .n8{color:#fff}' +
      '.s14-sd{display:grid;grid-template-columns:repeat(9,1fr);width:min(100%,324px);margin:0 auto;border:2px solid var(--accent,#34d17a);border-radius:8px;overflow:hidden}.s14-sd button{margin:0;padding:0;aspect-ratio:1;min-height:0;border-radius:0;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#fff;font-size:1rem;font-weight:700;box-shadow:none;cursor:pointer}' +
      '.s14-sd button.g{color:#9fe8bf;font-weight:900;cursor:default}.s14-sd button.sel{background:rgba(52,209,122,.35)}.s14-sd button.hl{background:rgba(52,209,122,.12)}.s14-sd button.bad{color:#ff7b7b}.s14-sd button.bx{border-right:2px solid var(--accent,#34d17a)}.s14-sd button.by{border-bottom:2px solid var(--accent,#34d17a)}' +
      '.s14-pad{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;width:min(100%,324px);margin:8px auto 0}.s14-pad button{margin:0;min-height:34px;padding:0;border-radius:8px;font-weight:800}' +
      '.s14-wd{display:grid;grid-template-rows:repeat(6,1fr);gap:5px;width:min(100%,250px);margin:0 auto}.s14-wd .r{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}.s14-wd .c{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:6px;border:2px solid rgba(255,255,255,.22);font-weight:900;font-size:1.15rem;text-transform:uppercase}' +
      '.s14-wd .c.ok{background:#2e9e5b;border-color:#2e9e5b}.s14-wd .c.mid{background:#c9a227;border-color:#c9a227}.s14-wd .c.no{background:rgba(127,127,127,.45);border-color:transparent}' +
      '.s14-kb{display:flex;flex-direction:column;gap:4px;margin-top:8px}.s14-kb div{display:flex;gap:3px;justify-content:center}.s14-kb button{margin:0;flex:1;max-width:30px;min-width:0;min-height:36px;padding:0;border-radius:6px;font-weight:800;font-size:.8rem;box-shadow:none}.s14-kb button.w{max-width:52px;font-size:.68rem}.s14-kb button.ok{background:#2e9e5b}.s14-kb button.mid{background:#c9a227}.s14-kb button.no{opacity:.4}' +
      '.s14-t3{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;width:min(100%,240px);margin:6px auto}.s14-t3 button{margin:0;aspect-ratio:1;min-height:0;font-size:2rem;font-weight:900;border-radius:12px}.s14-t3 button.win{background:rgba(52,209,122,.4)}' +
      '.s14-g .st{text-align:center;min-height:1.3em;font-weight:800;margin:6px 0;font-size:.88rem}' +
      'body.light .s14-g,body.theme-light .s14-g{color:#0b1f14}body.light .s14-ms button,body.theme-light .s14-ms button{background:rgba(0,0,0,.14);color:#0b1f14}body.light .s14-ms button.o,body.theme-light .s14-ms button.o{background:rgba(0,0,0,.04)}body.light .s14-sd button,body.theme-light .s14-sd button{color:#0b1f14;border-color:rgba(0,0,0,.1)}body.light .s14-sd button.g,body.theme-light .s14-sd button.g{color:#0b6b3a}body.light .s14-wd .c,body.theme-light .s14-wd .c{border-color:rgba(0,0,0,.2)}' +
      '.game-tab-btn.s14tab{font-size:.78rem}');
  /* — Buscaminas — */
  function mineGame(root) {
    var LV = { f: [9, 9, 10], m: [12, 12, 24], d: [16, 16, 40] }, lv = 'f', W, H, N, cells, open, flag, mines, over, first, t0, tick, flagMode = false;
    root.innerHTML = '<div class="hd"><select data-a="lv"><option value="f">' + esc(T('Fácil 9×9', 'Easy 9×9')) + '</option><option value="m">' + esc(T('Medio 12×12', 'Medium 12×12')) + '</option><option value="d">' + esc(T('Difícil 16×16', 'Hard 16×16')) + '</option></select><span data-a="info"></span><button type="button" class="s14-btn" data-a="flag">🚩 ' + esc(T('Bandera', 'Flag')) + '</button><button type="button" class="s14-btn" data-a="new" title="' + esc(T('Nueva partida', 'New game')) + '">↻</button></div><div class="s14-ms"></div><div class="st"></div><div style="text-align:center;font-size:.72rem;opacity:.7">' + esc(T('Clic derecho o mantener pulsado: bandera', 'Right-click or long-press: flag')) + '</div>';
    var grid = root.querySelector('.s14-ms'), st = root.querySelector('.st'), info = root.querySelector('[data-a="info"]');
    function best() { return (get('mines', {}) || {})[lv]; }
    function start() {
      var c = LV[lv]; W = c[0]; H = c[1]; N = c[2]; cells = []; open = []; flag = []; mines = {}; over = false; first = true; clearInterval(tick); t0 = 0;
      grid.style.gridTemplateColumns = 'repeat(' + W + ',1fr)'; grid.style.width = Math.min(W * (W > 12 ? 20 : 28), 330) + 'px';
      grid.innerHTML = '';
      for (var i = 0; i < W * H; i++) { var b = document.createElement('button'); b.type = 'button'; b.dataset.i = i; grid.appendChild(b); cells.push(b); open.push(false); flag.push(false); }
      st.textContent = best() ? T('Récord: ', 'Best: ') + best() + ' s' : ''; paintInfo();
    }
    function paintInfo() { var f = flag.filter(Boolean).length; info.textContent = '💣 ' + (N - f) + '  ⏱ ' + (t0 ? Math.floor((Date.now() - t0) / 1000) : 0); }
    function nb(i) { var x = i % W, y = Math.floor(i / W), o = []; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; var nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) o.push(ny * W + nx); } return o; }
    function place(safe) { var ban = {}; ban[safe] = 1; nb(safe).forEach(function (j) { ban[j] = 1; }); var n = 0; while (n < N) { var r = Math.floor(Math.random() * W * H); if (!mines[r] && !ban[r]) { mines[r] = 1; n++; } } }
    function count(i) { return nb(i).filter(function (j) { return mines[j]; }).length; }
    function reveal(i) {
      var stack = [i];
      while (stack.length) {
        var k = stack.pop(); if (open[k] || flag[k]) continue; open[k] = true;
        var b = cells[k], n = count(k); b.className = 'o' + (n ? ' n' + n : ''); b.textContent = n || '';
        if (!n) nb(k).forEach(function (j) { if (!open[j]) stack.push(j); });
      }
    }
    function check() {
      var left = 0; for (var i = 0; i < W * H; i++) if (!open[i] && !mines[i]) left++;
      if (!left) {
        over = true; clearInterval(tick); var s = Math.floor((Date.now() - t0) / 1000), B = get('mines', {}) || {};
        var rec = !B[lv] || s < B[lv]; if (rec) { B[lv] = s; set('mines', B); }
        st.textContent = T('¡Ganaste en ', 'You won in ') + s + ' s! ' + (rec ? T('🏆 Nuevo récord', '🏆 New record') : '🎉');
        Object.keys(mines).forEach(function (k) { cells[k].textContent = '🚩'; }); rain(null, 2000);
      }
    }
    function boom(i) { over = true; clearInterval(tick); Object.keys(mines).forEach(function (k) { cells[k].textContent = '💣'; }); cells[i].classList.add('boom'); st.textContent = T('💥 ¡Boom! Prueba otra vez', '💥 Boom! Try again'); }
    function hit(i) {
      if (over || flag[i]) return;
      if (first) { first = false; place(i); t0 = Date.now(); tick = setInterval(paintInfo, 1000); }
      if (open[i]) {
        var n = count(i), f = nb(i).filter(function (j) { return flag[j]; }).length;
        if (n && n === f) nb(i).forEach(function (j) { if (!over && !open[j] && !flag[j]) { if (mines[j]) boom(j); else reveal(j); } });
      } else if (mines[i]) return boom(i);
      else reveal(i);
      if (!over) check();
    }
    function tog(i) { if (over || open[i]) return; flag[i] = !flag[i]; cells[i].textContent = flag[i] ? '🚩' : ''; paintInfo(); }
    var lp = null, lpFired = false;
    grid.addEventListener('contextmenu', function (e) { var b = e.target.closest('button'); if (!b) return; e.preventDefault(); tog(+b.dataset.i); });
    grid.addEventListener('pointerdown', function (e) { var b = e.target.closest('button'); if (!b || e.button || e.pointerType === 'mouse') return; lpFired = false; clearTimeout(lp); lp = setTimeout(function () { lpFired = true; tog(+b.dataset.i); try { navigator.vibrate && navigator.vibrate(15); } catch (e2) {} }, 450); });
    grid.addEventListener('pointerup', function () { clearTimeout(lp); });
    grid.addEventListener('pointerleave', function () { clearTimeout(lp); });
    grid.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; if (lpFired) { lpFired = false; return; } var i = +b.dataset.i; if (flagMode) tog(i); else hit(i); });
    root.querySelector('[data-a="lv"]').addEventListener('change', function (e) { lv = e.target.value; start(); });
    root.querySelector('[data-a="new"]').addEventListener('click', start);
    var fb = root.querySelector('[data-a="flag"]'); fb.addEventListener('click', function () { flagMode = !flagMode; fb.classList.toggle('pri', flagMode); });
    start();
    root.__api = { hit: hit, tog: tog, state: function () { return { W: W, H: H, N: N, mines: mines, over: over, open: open }; } };
    return function () { clearInterval(tick); clearTimeout(lp); };
  }
  /* — Sudoku — */
  function sudokuGame(root) {
    var LV = { f: 36, m: 46, d: 52 }, lv = 'f', sol, puz, cur, sel = -1;
    root.innerHTML = '<div class="hd"><select data-a="lv"><option value="f">' + esc(T('Fácil', 'Easy')) + '</option><option value="m">' + esc(T('Medio', 'Medium')) + '</option><option value="d">' + esc(T('Difícil', 'Hard')) + '</option></select><button type="button" class="s14-btn" data-a="hint">💡 ' + esc(T('Pista', 'Hint')) + '</button><button type="button" class="s14-btn" data-a="new">↻ ' + esc(T('Nuevo', 'New')) + '</button></div><div class="s14-sd"></div><div class="s14-pad"></div><div class="st"></div>';
    var grid = root.querySelector('.s14-sd'), pad = root.querySelector('.s14-pad'), st = root.querySelector('.st'), cells = [];
    for (var i = 0; i < 81; i++) { var b = document.createElement('button'); b.type = 'button'; b.dataset.i = i; var x = i % 9, y = Math.floor(i / 9); if (x === 2 || x === 5) b.classList.add('bx'); if (y === 2 || y === 5) b.classList.add('by'); grid.appendChild(b); cells.push(b); }
    pad.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button type="button" class="s14-btn" data-n="' + n + '">' + n + '</button>'; }).join('') + '<button type="button" class="s14-btn" data-n="0" aria-label="' + esc(T('Borrar', 'Erase')) + '">⌫</button>';
    function ok(g, i, n) { var x = i % 9, y = Math.floor(i / 9), bx = x - x % 3, by = y - y % 3; for (var k = 0; k < 9; k++) { if (g[y * 9 + k] === n || g[k * 9 + x] === n) return false; var j = (by + Math.floor(k / 3)) * 9 + bx + k % 3; if (g[j] === n) return false; } return true; }
    function fill(g) { var i = g.indexOf(0); if (i < 0) return true; var ns = [1, 2, 3, 4, 5, 6, 7, 8, 9]; for (var k = 8; k > 0; k--) { var r = Math.floor(Math.random() * (k + 1)); var t = ns[k]; ns[k] = ns[r]; ns[r] = t; } for (var a = 0; a < 9; a++) { if (ok(g, i, ns[a])) { g[i] = ns[a]; if (fill(g)) return true; g[i] = 0; } } return false; }
    function countSol(g, lim) { var i = g.indexOf(0); if (i < 0) return 1; var c = 0; for (var n = 1; n <= 9 && c < lim; n++) { if (ok(g, i, n)) { g[i] = n; c += countSol(g, lim - c); g[i] = 0; } } return c; }
    function gen() {
      var g = new Array(81).fill(0); fill(g); sol = g.slice();
      var p = sol.slice(), order = []; for (var i = 0; i < 81; i++) order.push(i);
      for (var k = 80; k > 0; k--) { var r = Math.floor(Math.random() * (k + 1)); var t = order[k]; order[k] = order[r]; order[r] = t; }
      var removed = 0, target = LV[lv], t0 = Date.now();
      for (k = 0; k < 81 && removed < target && Date.now() - t0 < 1500; k++) { var j = order[k], v = p[j]; p[j] = 0; if (countSol(p.slice(), 2) !== 1) p[j] = v; else removed++; }
      puz = p; cur = p.slice(); sel = -1; paint(); st.textContent = '';
    }
    function paint() {
      cells.forEach(function (b, i) {
        b.textContent = cur[i] || ''; b.classList.toggle('g', !!puz[i]); b.classList.toggle('sel', i === sel);
        var hl = sel >= 0 && (i % 9 === sel % 9 || Math.floor(i / 9) === Math.floor(sel / 9) || (cur[sel] && cur[i] === cur[sel]));
        b.classList.toggle('hl', !!hl && i !== sel);
        var bad = false; if (cur[i] && !puz[i]) { var v = cur[i]; cur[i] = 0; bad = !ok(cur, i, v); cur[i] = v; } b.classList.toggle('bad', bad);
      });
    }
    function put(n) {
      if (sel < 0 || puz[sel]) return; cur[sel] = n; paint();
      if (cur.indexOf(0) < 0 && cur.every(function (v, i) { return v === sol[i]; })) { st.textContent = T('🎉 ¡Sudoku resuelto!', '🎉 Sudoku solved!'); rain(null, 2200); set('sudoku', (get('sudoku', 0) || 0) + 1); }
    }
    grid.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; sel = +b.dataset.i; paint(); });
    pad.addEventListener('click', function (e) { var b = e.target.closest('[data-n]'); if (b) put(+b.dataset.n); });
    root.querySelector('[data-a="new"]').addEventListener('click', gen);
    root.querySelector('[data-a="lv"]').addEventListener('change', function (e) { lv = e.target.value; gen(); });
    root.querySelector('[data-a="hint"]').addEventListener('click', function () { var empty = []; cur.forEach(function (v, i) { if (v !== sol[i]) empty.push(i); }); if (!empty.length) return; sel = empty[Math.floor(Math.random() * empty.length)]; put(sol[sel]); });
    var onKey = function (e) { if (!root.offsetParent || inField(e.target) || e.ctrlKey || e.metaKey || e.altKey) return; if (/^[1-9]$/.test(e.key)) { put(+e.key); e.preventDefault(); } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { put(0); e.preventDefault(); } else if (sel >= 0 && /^Arrow/.test(e.key)) { var d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[e.key]; sel = (sel + d + 81) % 81; paint(); e.preventDefault(); } };
    document.addEventListener('keydown', onKey);
    gen();
    root.__api = { sol: function () { return sol; }, puz: function () { return puz; }, select: function (i) { sel = i; }, put: put, countSol: countSol };
    return function () { document.removeEventListener('keydown', onKey); };
  }
  /* — Palabra del día — */
  var WES = 'abeja,acero,actor,aguja,ajeno,alamo,album,aldea,altar,amigo,ancho,angel,animo,apoyo,arbol,arena,arroz,asado,atomo,avion,ayuda,bahia,baile,balon,banco,barco,barro,beber,bicho,bolsa,bravo,brazo,breve,brisa,broma,bueno,burro,cable,cabra,cacao,caldo,calle,calma,campo,canal,canto,carne,carta,casco,causa,cebra,cerdo,cesta,chico,cielo,cifra,cinco,circo,clave,clima,cobre,coche,color,comer,conde,copia,coral,corte,costa,crema,cruce,cuero,curva,dardo,dedos,deseo,diana,dicha,disco,dolor,ducha,dulce,duque,etapa,falda,fiera,firma,flaco,flora,fondo,forma,freno,fresa,fruta,fuego,gafas,gallo,ganso,garra,gente,globo,gorra,grano,grito,grupo,guapo,gusto,hielo,higos,hongo,horno,hotel,huevo,humor,igual,joven,joyas,juego,jugar,junto,labio,lapiz,largo,latas,leche,lejos,lenta,letra,libro,lider,limon,lindo,listo,llama,llave,lleno,lobos,lucha,lugar,lunes,madre,magia,mango,manta,marea,menta,metal,miedo,mismo,mitad,monte,mosca,motor,mundo,musgo,nariz,naves,negro,nieve,noble,noche,norte,nubes,nuevo,ocaso,oliva,ondas,opera,orden,oveja,padre,pagar,palma,panda,papel,pasta,patio,pausa,pecho,perla,perro,piano,pieza,pinta,pista,plata,playa,plaza,plomo,poeta,polvo,poner,prado,prisa,pulpo,punto,queso,radio,rampa,rayos,regla,reina,reloj,ritmo,robot,rocas,ronda,rosas,rueda,ruido,sabio,salsa,salto,santo,selva,serie,siete,silla,sobre,solar,sonar,sueño,suelo,tabla,tallo,tarde,tarta,techo,tecla,tenis,tigre,tinta,tirar,tocar,torre,trago,trama,trigo,truco,tubos,turno,union,vacas,valle,vapor,vasos,veloz,venta,verde,viaje,vidas,video,viejo,vinos,virus,vista,vivir,volar,yogur,zorro'.split(',').filter(function (w) { return w.length === 5 && /^[a-zñ]+$/.test(w); });
  var WEN = 'about,above,actor,adult,after,agent,alarm,album,alien,alive,apple,arena,arrow,audio,award,badge,beach,bench,berry,birth,black,blade,blank,block,bloom,board,brain,brave,bread,brick,bride,brush,cabin,cable,camel,candy,chair,chalk,charm,chess,chief,child,cider,civic,clean,clock,cloud,coach,coast,coral,couch,crane,cream,crown,curve,dance,delta,diary,dream,drink,eagle,earth,eight,elbow,ember,emoji,enjoy,entry,fable,faith,feast,field,flame,flash,float,flute,focus,frame,fresh,fruit,giant,glass,globe,glove,grape,grass,green,habit,happy,heart,honey,horse,hotel,house,human,image,ivory,jelly,jewel,juice,karma,kayak,knife,koala,laser,lemon,light,lunar,magic,mango,maple,march,medal,melon,metal,model,money,motor,mouse,music,night,noble,north,novel,ocean,olive,onion,opera,orbit,paint,panda,paper,party,peach,pearl,phone,piano,pilot,pixel,pizza,plant,plaza,point,power,prize,queen,quiet,radio,raven,river,robot,rocky,royal,salad,scale,scarf,score,shark,sheep,shell,shine,skate,smile,snake,space,spark,spice,spoon,sport,stack,stage,steam,stone,storm,sugar,sunny,swing,table,tiger,toast,token,tower,train,tulip,urban,vapor,video,vivid,voice,watch,water,whale,wheat,world,yacht,young,zebra'.split(',').filter(function (w) { return w.length === 5; });
  window.__snkWordLists = { es: WES, en: WEN };
  function wordGame(root) {
    var en = EN(), list = en ? WEN : WES, d0 = new Date(2026, 0, 1), idx = Math.round((new Date().setHours(0, 0, 0, 0) - d0.getTime()) / 86400000);
    var ans = list[((idx * 7919) % list.length + list.length) % list.length], rows = [], curr = '', over = false, KEY = 'word' + (en ? 'en' : 'es');
    var saved = get(KEY, null); if (saved && saved.d === dayKey() && Array.isArray(saved.rows)) { rows = saved.rows.filter(function (r) { return typeof r === 'string' && r.length === 5; }).slice(0, 6); }
    root.innerHTML = '<div class="hd"><span>' + esc(T('Adivina la palabra de 5 letras en 6 intentos', 'Guess the 5-letter word in 6 tries')) + '</span><span data-a="streak" title="' + esc(T('Racha', 'Streak')) + '"></span></div><div class="s14-wd"></div><div class="st"></div><div class="s14-kb"></div>';
    var board = root.querySelector('.s14-wd'), st = root.querySelector('.st'), kb = root.querySelector('.s14-kb');
    var KR = en ? ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] : ['qwertyuiop', 'asdfghjklñ', 'zxcvbnm'];
    kb.innerHTML = KR.map(function (r, i) { return '<div>' + (i === 2 ? '<button type="button" class="s14-btn w" data-k="Enter">' + esc(T('ENVIAR', 'ENTER')) + '</button>' : '') + r.split('').map(function (c) { return '<button type="button" class="s14-btn" data-k="' + c + '">' + c.toUpperCase() + '</button>'; }).join('') + (i === 2 ? '<button type="button" class="s14-btn w" data-k="Backspace" aria-label="' + esc(T('Borrar', 'Delete')) + '">⌫</button>' : '') + '</div>'; }).join('');
    function score(g) { var res = ['no', 'no', 'no', 'no', 'no'], a = ans.split(''), used = [false, false, false, false, false]; for (var i = 0; i < 5; i++) if (g[i] === a[i]) { res[i] = 'ok'; used[i] = true; } for (i = 0; i < 5; i++) { if (res[i] === 'ok') continue; for (var j = 0; j < 5; j++) if (!used[j] && g[i] === a[j]) { res[i] = 'mid'; used[j] = true; break; } } return res; }
    window.__snkWordScore = function (g, a) { var o = ans; ans = a; var r = score(g); ans = o; return r; };
    var RANK = { no: 1, mid: 2, ok: 3 };
    function paint() {
      var html = '', keyState = {};
      for (var r = 0; r < 6; r++) {
        html += '<div class="r">';
        var g = rows[r] || (r === rows.length ? curr : ''), sc = rows[r] ? score(rows[r]) : null;
        for (var c = 0; c < 5; c++) { var ch = g[c] || ''; html += '<div class="c ' + (sc ? sc[c] : '') + '">' + esc(ch) + '</div>'; if (sc && ch && (!keyState[ch] || RANK[sc[c]] > RANK[keyState[ch]])) keyState[ch] = sc[c]; }
        html += '</div>';
      }
      board.innerHTML = html;
      kb.querySelectorAll('[data-k]').forEach(function (b) { b.classList.remove('ok', 'mid', 'no'); var s = keyState[b.dataset.k]; if (s) b.classList.add(s); });
      var S = get('wordstats', { streak: 0 }) || { streak: 0 }; root.querySelector('[data-a="streak"]').textContent = '🔥 ' + (S.streak || 0);
    }
    function finish(win) {
      over = true;
      st.textContent = win ? T('🎉 ¡Acertaste! Vuelve mañana para otra palabra', '🎉 You got it! Come back tomorrow for another word') : T('La palabra era: ', 'The word was: ') + ans.toUpperCase();
      var S = get('wordstats', { streak: 0, last: '' }) || {}; if (S.last !== dayKey()) { S.streak = win ? (S.streak || 0) + 1 : 0; S.last = dayKey(); set('wordstats', S); }
      paint(); if (win) rain(null, 2000);
    }
    function key(k) {
      if (over) return;
      if (k === 'Enter') {
        if (curr.length < 5) { st.textContent = T('Faltan letras', 'Not enough letters'); return; }
        rows.push(curr); curr = ''; set(KEY, { d: dayKey(), rows: rows }); st.textContent = '';
        paint(); if (rows[rows.length - 1] === ans) finish(true); else if (rows.length >= 6) finish(false);
        return;
      }
      if (k === 'Backspace') { curr = curr.slice(0, -1); paint(); return; }
      if (/^[a-zñ]$/.test(k) && (en ? k !== 'ñ' : true) && curr.length < 5) { curr += k; paint(); }
    }
    kb.addEventListener('click', function (e) { var b = e.target.closest('[data-k]'); if (b) key(b.dataset.k); });
    var onKey = function (e) { if (!root.offsetParent || inField(e.target) || e.ctrlKey || e.metaKey || e.altKey) return; var k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (k === 'Enter' || k === 'Backspace' || /^[a-zñ]$/.test(k)) { e.preventDefault(); key(k); } };
    document.addEventListener('keydown', onKey);
    paint();
    if (rows.length && (rows[rows.length - 1] === ans || rows.length >= 6)) { over = true; st.textContent = rows[rows.length - 1] === ans ? T('✅ Ya acertaste la palabra de hoy', '✅ You already solved today\'s word') : T('La palabra era: ', 'The word was: ') + ans.toUpperCase(); }
    root.__api = { ans: function () { return ans; }, key: key, rows: function () { return rows; } };
    return function () { document.removeEventListener('keydown', onKey); };
  }
  /* — Tres en raya contra la CPU (minimax) — */
  function tttCpu(root) {
    var b, over, lvl = 'd', you = 0, cpu = 0, ties = 0, L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    root.innerHTML = '<div class="hd"><select data-a="lv"><option value="d">' + esc(T('CPU imbatible', 'Unbeatable CPU')) + '</option><option value="f">' + esc(T('CPU fácil', 'Easy CPU')) + '</option></select><span data-a="sc"></span><button type="button" class="s14-btn" data-a="new" title="' + esc(T('Nueva partida', 'New game')) + '">↻</button></div><div class="s14-t3"></div><div class="st"></div>';
    var g = root.querySelector('.s14-t3'), st = root.querySelector('.st'), sc = root.querySelector('[data-a="sc"]');
    function win(x) { for (var i = 0; i < 8; i++) { var l = L[i]; if (x[l[0]] && x[l[0]] === x[l[1]] && x[l[0]] === x[l[2]]) return { p: x[l[0]], l: l }; } return null; }
    function mm(x, p, depth) { var w = win(x); if (w) return { s: w.p === 'O' ? 10 - depth : depth - 10 }; if (x.every(Boolean)) return { s: 0 }; var best = { s: p === 'O' ? -99 : 99, m: -1 }; for (var i = 0; i < 9; i++) { if (x[i]) continue; x[i] = p; var r = mm(x, p === 'O' ? 'X' : 'O', depth + 1); x[i] = null; if (p === 'O' ? r.s > best.s : r.s < best.s) best = { s: r.s, m: i }; } return best; }
    window.__snkTttBest = function (x) { return mm(x.slice(), 'O', 0).m; };
    function paint(w) { g.innerHTML = b.map(function (v, i) { return '<button type="button" data-i="' + i + '" class="s14-btn' + (w && w.l.indexOf(i) >= 0 ? ' win' : '') + '"' + (v || over ? ' disabled' : '') + '>' + (v === 'X' ? '❌' : v === 'O' ? '🐍' : '') + '</button>'; }).join(''); sc.textContent = T('Tú ', 'You ') + you + ' · CPU ' + cpu + ' · = ' + ties; }
    function end() { var w = win(b); if (w) { over = true; if (w.p === 'X') { you++; st.textContent = T('🎉 ¡Has ganado!', '🎉 You won!'); rain(null, 1800); } else { cpu++; st.textContent = T('🐍 Gana la CPU', '🐍 The CPU wins'); } paint(w); return true; } if (b.every(Boolean)) { over = true; ties++; st.textContent = T('🤝 Empate', '🤝 Draw'); paint(); return true; } return false; }
    function cpuMove() { var free = []; b.forEach(function (v, i) { if (!v) free.push(i); }); if (!free.length) return; var m = (lvl === 'f' && Math.random() < 0.6) ? free[Math.floor(Math.random() * free.length)] : mm(b.slice(), 'O', 0).m; if (m < 0 || b[m]) m = free[0]; b[m] = 'O'; }
    function play(i) { if (over || b[i]) return; b[i] = 'X'; if (end()) return; cpuMove(); if (!end()) { st.textContent = T('Tu turno (❌)', 'Your turn (❌)'); paint(); } }
    function start() { b = Array(9).fill(null); over = false; st.textContent = T('Tu turno (❌)', 'Your turn (❌)'); paint(); }
    g.addEventListener('click', function (e) { var x = e.target.closest('[data-i]'); if (x) play(+x.dataset.i); });
    root.querySelector('[data-a="new"]').addEventListener('click', start);
    root.querySelector('[data-a="lv"]').addEventListener('change', function (e) { lvl = e.target.value; start(); });
    start();
    root.__api = { play: play, board: function () { return b; }, over: function () { return over; }, score: function () { return [you, cpu, ties]; } };
    return function () {};
  }
  var GAMES = [['s14mines', '💣', 'Buscaminas', 'Minesweeper', mineGame], ['s14sudoku', '🔢', 'Sudoku', 'Sudoku', sudokuGame], ['s14word', '🔤', 'Palabra', 'Word', wordGame], ['s14ttt', '🤖', 'vs CPU', 'vs CPU', tttCpu]];
  function wrapGames(A) {
    var app = A.games; if (!app || app.__s14) return;
    var orig = app.render; if (typeof orig !== 'function') return;
    app.__s14 = true; app.width = Math.max(app.width || 0, 390); app.height = Math.max(app.height || 0, 640);
    app.render = function (body) {
      var c0 = orig(body), cleanups = [];
      try {
        var tabs = body.querySelector('.tabs'); if (!tabs) return c0;
        tabs.style.flexWrap = 'wrap'; tabs.style.gap = '4px';
        GAMES.forEach(function (gm) {
          var btn = el('button', 'game-tab-btn s14tab', gm[1] + ' ' + esc(T(gm[2], gm[3]))); btn.type = 'button'; btn.dataset.game = gm[0] + '-x'; btn.setAttribute('data-noi18n', '');
          var panel = el('div', 'game-panel hidden s14-g'); panel.id = gm[0] + '-x'; panel.setAttribute('data-noi18n', '');
          body.appendChild(panel); tabs.appendChild(btn);
          var started = false;
          btn.addEventListener('click', function () {
            body.querySelectorAll('.game-tab-btn').forEach(function (x) { x.classList.remove('active'); });
            btn.classList.add('active');
            body.querySelectorAll('.game-panel').forEach(function (p) { p.classList.add('hidden'); });
            panel.classList.remove('hidden');
            if (!started) { started = true; try { var c = gm[4](panel); if (typeof c === 'function') cleanups.push(c); } catch (e) { panel.textContent = T('No se pudo abrir el juego', 'The game could not be opened'); try { console.warn('[snk2614] juego', gm[0], e); } catch (e2) {} } }
          });
        });
      } catch (e) { try { console.warn('[snk2614] juegos', e); } catch (e2) {} }
      return function () { cleanups.forEach(function (f) { try { f(); } catch (e) {} }); if (typeof c0 === 'function') c0(); };
    };
  }

  /* ---------- 15. Navegador: marcadores ---------- */
  css('.s14-bm{display:flex;gap:5px;flex-wrap:nowrap;overflow-x:auto;padding:4px 6px;scrollbar-width:thin;align-items:center;font-size:.75rem}.s14-bm:empty{display:none}' +
      '.s14-bm .chip{flex:0 0 auto;display:inline-flex;align-items:center;gap:4px;max-width:170px;margin:0;padding:3px 9px;min-height:26px;border-radius:999px;font-size:.74rem;font-weight:700;background:var(--input-bg,rgba(255,255,255,.08));color:var(--text,#fff);border:1px solid var(--input-border,rgba(255,255,255,.18));cursor:pointer;box-shadow:none;width:auto}' +
      '.s14-bm .chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.s14-bm .chip i{font-style:normal;opacity:.55;padding-left:2px}.s14-bm .chip i:hover{opacity:1}' +
      '.s14-star{margin:0 0 0 4px !important;width:auto !important;min-width:34px;padding:4px 8px !important;flex:0 0 auto}');
  function bmLabel(u) { try { var x = new URL(u, location.href); if (x.origin === location.origin && /\/api\/dbots\/serp/.test(x.pathname)) return '🔎 ' + (x.searchParams.get('q') || 'Doganiero Search'); return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? x.pathname.slice(0, 18) : ''); } catch (e) { return String(u).slice(0, 28); } }
  function wrapBrowser(A) {
    var app = A.browser; if (!app || app.__s14) return;
    var orig = app.render; if (typeof orig !== 'function') return; app.__s14 = true;
    app.render = function (body) {
      var c0 = orig(body);
      try {
        var form = body.querySelector('#browserForm-x'), q = body.querySelector('#browserQuery-x'); if (!form || !q) return c0;
        var star = el('button', 's14-btn s14-star', '☆'); star.type = 'button'; star.title = T('Guardar en marcadores', 'Bookmark this page'); star.setAttribute('aria-label', star.title); star.setAttribute('data-noi18n', '');
        var bar = el('div', 's14-bm'); bar.setAttribute('data-noi18n', ''); bar.setAttribute('aria-label', T('Marcadores', 'Bookmarks'));
        form.appendChild(star);
        form.parentNode.insertBefore(bar, form.nextSibling);
        function L() { var v = get('bookmarks', []); return Array.isArray(v) ? v.filter(function (x) { return x && typeof x.u === 'string'; }) : []; }
        function cur() { return String(q.value || '').trim(); }
        function paint() {
          var list = L(), c = cur(); star.textContent = list.some(function (x) { return x.u === c; }) ? '★' : '☆';
          bar.innerHTML = list.map(function (x, i) { return '<button type="button" class="chip" data-i="' + i + '" title="' + esc(x.u) + '"><span>' + esc(x.t || bmLabel(x.u)) + '</span><i data-del="' + i + '" title="' + esc(T('Quitar', 'Remove')) + '">✕</i></button>'; }).join('');
        }
        star.addEventListener('click', function () {
          var c = cur(); if (!c) { toast(T('Escribe o abre una dirección primero', 'Type or open an address first')); return; }
          var list = L(), i = -1; list.forEach(function (x, k) { if (x.u === c) i = k; });
          if (i >= 0) { list.splice(i, 1); toast(T('Marcador quitado', 'Bookmark removed')); } else { if (list.length >= 16) list.shift(); list.push({ u: c.slice(0, 2000), t: bmLabel(c) }); toast(T('⭐ Guardado en marcadores', '⭐ Bookmarked')); }
          set('bookmarks', list); paint();
        });
        bar.addEventListener('click', function (e) {
          var d = e.target.closest('[data-del]'); var list = L();
          if (d) { e.stopPropagation(); list.splice(+d.dataset.del, 1); set('bookmarks', list); paint(); return; }
          var c = e.target.closest('.chip'); if (!c) return; var x = list[+c.dataset.i]; if (!x) return;
          q.value = x.u; if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        });
        q.addEventListener('input', paint);
        var last = null, iv = setInterval(function () { if (!body.isConnected) return clearInterval(iv); var s = cur(); if (s !== last) { last = s; paint(); } }, 1000);
        paint();
        return function () { clearInterval(iv); if (typeof c0 === 'function') c0(); };
      } catch (e) { return c0; }
    };
  }

  /* ---------- 16. Code Lab: plantillas, comentar y duplicar líneas ---------- */
  var TPL = {
    html: ['html', '<!doctype html>\n<html lang="es">\n<head>\n  <meta charset="utf-8">\n  <title>Mi página</title>\n  <style>\n    body { font-family: system-ui; background: #0f1a14; color: #e8fff1; display: grid; place-items: center; min-height: 100vh; margin: 0; }\n    button { padding: 10px 18px; border-radius: 12px; border: 0; background: #34d17a; font-weight: 800; cursor: pointer; }\n  </style>\n</head>\n<body>\n  <main>\n    <h1>¡Hola, Snake OS! 🐍</h1>\n    <button id="b">Púlsame</button>\n  </main>\n  <script>\n    let n = 0;\n    document.getElementById(\'b\').onclick = e => e.target.textContent = \'Clics: \' + (++n);\n  </script>\n</body>\n</html>\n'],
    game: ['html', '<!doctype html>\n<html><body style="margin:0;background:#081008">\n<canvas id="c" width="320" height="320" style="display:block;margin:20px auto;background:#0b2a14;border-radius:12px"></canvas>\n<script>\n// Mini Snake: flechas para moverte\nconst c = document.getElementById(\'c\').getContext(\'2d\');\nlet s = [{x: 8, y: 8}], d = {x: 1, y: 0}, f = {x: 4, y: 4};\naddEventListener(\'keydown\', e => {\n  const k = {ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0]}[e.key];\n  if (k) d = {x: k[0], y: k[1]};\n});\nsetInterval(() => {\n  const h = {x: (s[0].x + d.x + 16) % 16, y: (s[0].y + d.y + 16) % 16};\n  if (s.some(p => p.x === h.x && p.y === h.y)) s = [s[0]];\n  s.unshift(h);\n  if (h.x === f.x && h.y === f.y) f = {x: Math.random() * 16 | 0, y: Math.random() * 16 | 0}; else s.pop();\n  c.fillStyle = \'#0b2a14\'; c.fillRect(0, 0, 320, 320);\n  c.fillStyle = \'#ff4d6d\'; c.fillRect(f.x * 20, f.y * 20, 18, 18);\n  c.fillStyle = \'#34d17a\'; s.forEach(p => c.fillRect(p.x * 20, p.y * 20, 18, 18));\n}, 120);\n</script>\n</body></html>\n'],
    css: ['html', '<!doctype html>\n<html><head><style>\nbody { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0d1117; }\n.ball { width: 80px; height: 80px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #7dffb3, #1f9e57); animation: bote 1s ease-in-out infinite alternate; }\n@keyframes bote { to { transform: translateY(-120px) scale(1.05); } }\n</style></head>\n<body><div class="ball"></div></body></html>\n'],
    js: ['js', '// Ejemplo de JavaScript: pulsa «Vista previa» para ver la salida\nconst frutas = [\'manzana\', \'pera\', \'uva\'];\nfrutas.forEach((f, i) => console.log(i + 1, f));\n\nfunction factorial(n) { return n <= 1 ? 1 : n * factorial(n - 1); }\nconsole.log(\'10! =\', factorial(10));\n'],
    py: ['py', '# Ejemplo de Python\nnombres = ["Ana", "Leo", "Sara"]\nfor i, n in enumerate(nombres, 1):\n    print(i, "Hola,", n)\n\nprint("Suma de 1 a 100:", sum(range(1, 101)))\n']
  };
  function toggleComment(text, ls, le, lg) {
    var pre = lg === 'py' ? '# ' : lg === 'html' ? '<!-- ' : lg === 'css' ? '/* ' : '// ', post = lg === 'html' ? ' -->' : lg === 'css' ? ' */' : '';
    var p0 = pre.trim(), q0 = post.trim();
    var block = text.slice(ls, le).split('\n'), all = block.every(function (l) { return !l.trim() || l.trim().indexOf(p0) === 0; });
    return block.map(function (l) {
      if (!l.trim()) return l;
      if (all) { var i = l.indexOf(p0); var r = l.slice(0, i) + l.slice(i + p0.length).replace(/^ /, ''); if (q0) { var j = r.lastIndexOf(q0); if (j >= 0) r = r.slice(0, j).replace(/ $/, '') + r.slice(j + q0.length); } return r; }
      var ind = l.match(/^\s*/)[0]; return ind + pre + l.slice(ind.length) + post;
    }).join('\n');
  }
  window.__snkToggleComment = toggleComment;
  function wrapCode(A) {
    var app = A.code; if (!app || app.__s14) return;
    var orig = app.render; if (typeof orig !== 'function') return; app.__s14 = true;
    app.render = function (body) {
      var c0 = orig(body);
      try {
        var ed = body.querySelector('#codeEditor-x'), lang = body.querySelector('#codeLang-x'), bar = body.querySelector('.code-lab-toolbar'); if (!ed || !bar) return c0;
        var sel = el('select'); sel.className = 's14-tpl'; sel.title = T('Plantillas', 'Templates'); sel.setAttribute('aria-label', sel.title); sel.setAttribute('data-noi18n', '');
        sel.innerHTML = '<option value="">📋 ' + esc(T('Plantillas', 'Templates')) + '</option><option value="html">' + esc(T('Página web', 'Web page')) + '</option><option value="game">' + esc(T('Juego Snake (canvas)', 'Snake game (canvas)')) + '</option><option value="css">' + esc(T('Animación CSS', 'CSS animation')) + '</option><option value="js">JavaScript</option><option value="py">Python</option>';
        bar.appendChild(sel);
        sel.addEventListener('change', function () {
          var t = TPL[sel.value]; sel.value = ''; if (!t) return;
          if (ed.value.trim() && !confirm(T('¿Sustituir el código actual por la plantilla?', 'Replace the current code with the template?'))) return;
          if (lang) { lang.value = t[0]; lang.dispatchEvent(new Event('change', { bubbles: true })); }
          ed.value = t[1]; ed.dispatchEvent(new Event('input', { bubbles: true })); ed.focus();
          toast(T('Plantilla cargada: pulsa «Vista previa»', 'Template loaded: press «Preview»'));
        });
        ed.addEventListener('keydown', function (e) {
          if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
          var v = ed.value, s = ed.selectionStart, en = ed.selectionEnd, ls = v.lastIndexOf('\n', s - 1) + 1, endAt = (en > s && v[en - 1] === '\n') ? en - 1 : en, le = v.indexOf('\n', endAt); if (le < 0) le = v.length;
          if (e.key === '/' || e.code === 'Slash') {
            e.preventDefault();
            ed.setRangeText(toggleComment(v, ls, le, lang ? lang.value : 'js'), ls, le, 'select'); ed.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            var line = v.slice(ls, le); ed.setRangeText('\n' + line, le, le, 'end'); var np = le + 1 + (s - ls); ed.setSelectionRange(np, np); ed.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
      } catch (e) {}
      return c0;
    };
  }

  /* ---------- 17. Explorador: espacio por tipo ---------- */
  function fileKind(f) {
    var t = String(f.type || f.mime || ''), n = String(f.name || '').toLowerCase();
    if (/^image\//.test(t) || /\.(png|jpe?g|gif|webp|svg|bmp|heic)$/.test(n)) return 'img';
    if (/^video\//.test(t) || /\.(mp4|webm|mov|mkv|avi)$/.test(n)) return 'vid';
    if (/^audio\//.test(t) || /\.(mp3|wav|ogg|m4a|flac)$/.test(n)) return 'aud';
    if (/zip|compressed|tar|rar/.test(t) || /\.(zip|rar|7z|tar|gz)$/.test(n)) return 'zip';
    if (/pdf|word|document|text|sheet|presentation|json/.test(t) || /\.(pdf|docx?|txt|md|odt|xlsx?|csv|pptx?|rtf|json|html?|css|js|py)$/.test(n)) return 'doc';
    return 'other';
  }
  function storageReport(F) {
    if (!F) { var B = window.SnakeTermBridge; try { F = (B && B.files && B.files()) || []; } catch (e) { F = []; } }
    var G = { img: [0, 0], vid: [0, 0], aud: [0, 0], doc: [0, 0], zip: [0, 0], other: [0, 0] };
    F.forEach(function (f) { if (!f || /(^|\/)\.keep$/.test(f.name || '')) return; var k = fileKind(f), sz = typeof f.size === 'number' && f.size > 0 ? f.size : (f.dataUrl ? Math.round(f.dataUrl.length * 0.75) : 0); G[k][0]++; G[k][1] += sz; });
    return G;
  }
  window.__snkStorageReport = storageReport;
  function fmtB(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB'; }
  function wrapExplorer(A) {
    var app = A.explorer; if (!app || app.__s14) return;
    var orig = app.render; if (typeof orig !== 'function') return; app.__s14 = true;
    app.render = function (body) {
      var c0 = orig(body), tries = 0;
      (function attach() {
        var bar = body.querySelector('.snk4a-fx-bar');
        if (!bar) { if (++tries < 20 && body.isConnected !== false) setTimeout(attach, 50); return; }
        if (bar.querySelector('.s14-fxstat')) return;
        decorateFx(bar);
      })();
      return c0;
    };
  }
  function decorateFx(bar) {
      try {
        var b = el('button', 's14-btn', '📊'); b.type = 'button'; b.className += ' s14-fxstat'; b.title = T('Espacio por tipo de archivo', 'Space by file type'); b.setAttribute('aria-label', b.title);
        bar.appendChild(b);
        var panel = el('div', 's14-fxpanel'); panel.setAttribute('data-noi18n', ''); panel.style.cssText = 'display:none;margin:6px 0;padding:10px;border-radius:12px;background:var(--input-bg,rgba(255,255,255,.06));border:1px solid var(--input-border,rgba(255,255,255,.14))';
        bar.parentNode.insertBefore(panel, bar.nextSibling);
        b.addEventListener('click', function () {
          if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
          var G = storageReport(), NM = { img: ['🖼️', T('Imágenes', 'Images')], vid: ['🎬', T('Vídeos', 'Videos')], aud: ['🎵', T('Audio', 'Audio')], doc: ['📄', T('Documentos', 'Documents')], zip: ['🗜️', T('Comprimidos', 'Archives')], other: ['📦', T('Otros', 'Other')] };
          var tot = 0; Object.keys(G).forEach(function (k) { tot += G[k][1]; });
          var keys = Object.keys(G).filter(function (k) { return G[k][0]; }).sort(function (a, c) { return G[c][1] - G[a][1]; });
          panel.innerHTML = '<b style="font-size:.85rem">📊 ' + esc(T('Espacio por tipo', 'Space by type')) + ' · ' + esc(fmtB(tot)) + '</b>' + (keys.length ? keys.map(function (k) { return '<div class="s14-bar"><span class="n">' + NM[k][0] + ' ' + esc(NM[k][1]) + ' (' + G[k][0] + ')</span><span class="b"><i style="width:' + Math.max(3, Math.round(G[k][1] / Math.max(1, tot) * 100)) + '%"></i></span><span class="v">' + esc(fmtB(G[k][1])) + '</span></div>'; }).join('') : '<div style="font-size:.8rem;opacity:.75;margin-top:6px">' + esc(T('Todavía no tienes archivos.', 'You have no files yet.')) + '</div>');
          panel.style.display = 'block';
        });
      } catch (e) {}
  }

  /* ---------- 18. Chat: respuestas rápidas y atajos /shrug ---------- */
  var QR_DEF = ['¡Hola! 👋', 'Ahora te llamo 📞', 'Estoy ocupado, te escribo luego', '¡Gracias! 🙏', 'Jajaja 😂', 'Vale 👍'];
  var QR_DEF_EN = ['Hi! 👋', 'I will call you now 📞', 'Busy right now, talk later', 'Thanks! 🙏', 'Hahaha 😂', 'OK 👍'];
  var SLASH = { shrug: '¯\\_(ツ)_/¯', flip: '(╯°□°)╯︵ ┻━┻', unflip: '┬─┬ノ( º _ ºノ)', lenny: '( ͡° ͜ʖ ͡°)', snake: '🐍🐍🐍', corazon: '❤️', heart: '❤️', ok: '👌', fiesta: '🎉🥳🎉', party: '🎉🥳🎉' };
  function slash(v) { return String(v).replace(/(^|\s)\/([a-z]+)$/i, function (m, sp, w) { var r = SLASH[w.toLowerCase()]; return r ? sp + r : m; }); }
  window.__snkSlash = slash;
  css('.s14-qr{position:relative;flex:0 0 auto;display:flex;align-items:center}.s14-qr>button{margin:0 4px 0 0;width:auto;min-width:36px;min-height:36px;padding:4px 8px;border-radius:10px;box-shadow:none}' +
      '.s14-qr .m{position:absolute;bottom:calc(100% + 6px);right:0;z-index:50;min-width:220px;max-width:280px;max-height:300px;overflow:auto;padding:6px;border-radius:14px;background:rgba(16,28,22,.97);border:1px solid rgba(255,255,255,.18);box-shadow:0 12px 30px rgba(0,0,0,.45)}' +
      '.s14-qr .m button{display:flex;justify-content:space-between;width:100%;margin:0 0 3px;padding:7px 9px;border-radius:9px;text-align:left;font-size:.8rem;background:transparent;border:0;color:#fff;box-shadow:none;cursor:pointer;min-height:0}.s14-qr .m button:hover{background:rgba(52,209,122,.2)}.s14-qr .m button i{font-style:normal;opacity:.5;padding-left:8px}' +
      'body.light .s14-qr .m,body.theme-light .s14-qr .m{background:#fff;border-color:rgba(0,0,0,.12)}body.light .s14-qr .m button,body.theme-light .s14-qr .m button{color:#122}');
  function decorateChat(root) {
    var inp = root.querySelector('[data-dc="input"]'); if (!inp || inp.__s14) return; inp.__s14 = true;
    var host = inp.parentNode, send = host.querySelector('.dc-send');
    var w = el('div', 's14-qr'); w.setAttribute('data-noi18n', '');
    var b = el('button', 's14-btn', '⚡'); b.type = 'button'; b.title = T('Respuestas rápidas', 'Quick replies'); b.setAttribute('aria-label', b.title);
    var m = el('div', 'm'); m.hidden = true; w.appendChild(m); w.appendChild(b);
    host.insertBefore(w, inp);
    function L() { var v = get('qreplies', null); return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : (EN() ? QR_DEF_EN : QR_DEF).slice(); }
    function paint() { m.innerHTML = L().map(function (t, i) { return '<button type="button" data-i="' + i + '"><span>' + esc(t) + '</span><i data-del="' + i + '" title="' + esc(T('Quitar', 'Remove')) + '">✕</i></button>'; }).join('') + '<button type="button" data-add="1">➕ ' + esc(T('Añadir respuesta…', 'Add reply…')) + '</button>'; }
    b.addEventListener('click', function (e) { e.stopPropagation(); if (inp.disabled) { toast(T('Abre una conversación primero', 'Open a conversation first')); return; } paint(); m.hidden = !m.hidden; });
    m.addEventListener('click', function (e) {
      e.stopPropagation(); var list = L();
      var d = e.target.closest('[data-del]'); if (d) { list.splice(+d.dataset.del, 1); set('qreplies', list); paint(); return; }
      if (e.target.closest('[data-add]')) { var t = prompt(T('Escribe la respuesta rápida:', 'Type the quick reply:')); if (t && t.trim()) { list.push(t.trim().slice(0, 300)); if (list.length > 12) list.shift(); set('qreplies', list); } paint(); return; }
      var x = e.target.closest('[data-i]'); if (!x) return;
      inp.value = (inp.value ? inp.value.replace(/\s*$/, ' ') : '') + list[+x.dataset.i]; inp.dispatchEvent(new Event('input', { bubbles: true })); m.hidden = true; inp.focus();
    });
    var docClick = function () { if (!root.isConnected) { document.removeEventListener('click', docClick); return; } m.hidden = true; };
    document.addEventListener('click', docClick);
    host.addEventListener('keydown', function (e) {
      if (e.target !== inp || (e.key !== ' ' && e.key !== 'Enter')) return;
      var nv = slash(inp.value); if (nv === inp.value) return;
      inp.value = nv + (e.key === ' ' ? ' ' : ''); if (e.key === ' ') e.preventDefault();
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }, true);
  }

  /* ---------- 19. Teléfono: mi tarjeta de contacto (vCard) ---------- */
  function vcard(name, num) { name = String(name || 'Snake OS').replace(/[\r\n;,\\]/g, ' ').trim(); return ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + name, 'N:' + name + ';;;;', 'TEL;TYPE=CELL:' + String(num).replace(/[^\w\-+ ]/g, ''), 'NOTE:Snake OS · Doganiero', 'END:VCARD'].join('\r\n'); }
  window.__snkVcard = vcard;
  function decoratePhone(root) {
    var head = root.querySelector('.dph-head'), mine = root.querySelector('.dph-mine'); if (!head || !mine || head.__s14) return; head.__s14 = true;
    var b = el('button', 's14-btn s14-vcf', '📇 ' + esc(T('Mi tarjeta', 'My card'))); b.type = 'button'; b.setAttribute('data-noi18n', ''); b.style.marginTop = '6px';
    b.title = T('Descarga tu tarjeta de contacto (.vcf) con tu número Doganiero', 'Download your contact card (.vcf) with your Doganiero number');
    b.addEventListener('click', function () {
      var num = String(mine.textContent || '').trim(); if (!/\d/.test(num)) { toast(T('Tu número aún se está cargando', 'Your number is still loading')); return; }
      var u = cu() || {}, name = String(u.name || 'Snake OS');
      download((name.replace(/[^\w\- ]+/g, '').trim() || 'contacto') + '.vcf', vcard(name, num), 'text/vcard');
      toast(T('📇 Tarjeta descargada', '📇 Card downloaded'));
    });
    head.appendChild(b);
  }

  /* ---------- 21. Fotos: Los Snakes y Metaverse ---------- */
  function stamp() { var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()); }
  function savePng(name, url) { var a = document.createElement('a'); a.href = url; a.download = name; a.style.display = 'none'; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 0); }
  function watermark(src, label) {
    var w = src.width, h = src.height; if (!w || !h) return null;
    var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    var fs = Math.max(12, Math.round(Math.min(w, h) / 32)); x.font = '700 ' + fs + 'px system-ui, sans-serif'; x.textAlign = 'right'; x.textBaseline = 'bottom';
    var t = '🐍 ' + label + ' · ' + new Date().toLocaleDateString(EN() ? 'en-GB' : 'es-ES');
    x.fillStyle = 'rgba(0,0,0,.45)'; var tw = x.measureText(t).width; x.fillRect(w - tw - fs * 1.4, h - fs * 2, tw + fs * 1.4, fs * 2);
    x.fillStyle = '#fff'; x.fillText(t, w - fs * 0.7, h - fs * 0.45);
    return c.toDataURL('image/png');
  }
  window.__snkWatermark = watermark;
  function decorateSnakes(root) {
    var top = root.querySelector('.lsx-top'), opt = top && top.querySelector('.lsx-opt'); if (!top || !opt || top.querySelector('.s14-lsshot')) return;
    var b = el('button', 'lsx-tb s14-lsshot', '📸'); b.type = 'button'; b.title = T('Foto de la casa (PNG)', 'Photo of the house (PNG)'); b.setAttribute('aria-label', b.title);
    b.style.cssText = 'background:rgba(255,255,255,.18);color:#fff;box-shadow:none';
    b.addEventListener('click', function () {
      var cv = root.querySelector('.lsx-stage canvas.main'); var url = null;
      try { url = cv && watermark(cv, 'Los Snakes'); } catch (e) { url = null; }
      if (!url) { toast(T('No se pudo hacer la foto', 'Could not take the photo')); return; }
      savePng('los-snakes-' + stamp() + '.png', url); toast(T('📸 Foto guardada en Descargas', '📸 Photo saved to Downloads'));
    });
    top.insertBefore(b, opt);
  }
  function decorateMeta(root) {
    var cvs = root.querySelectorAll('canvas'), cv = null, best = 0;
    for (var i = 0; i < cvs.length; i++) { var a = cvs[i].clientWidth * cvs[i].clientHeight; if (a > best) { best = a; cv = cvs[i]; } }
    if (!cv || best < 40000) return; var host = cv.parentElement; if (!host || host.querySelector('.s14-mvshot')) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var b = el('button', 's14-btn s14-mvshot', '📸'); b.type = 'button'; b.title = T('Foto del Metaverse (PNG)', 'Metaverse photo (PNG)'); b.setAttribute('aria-label', b.title);
    b.style.cssText = 'position:absolute;right:10px;bottom:10px;z-index:30;width:38px;height:38px;border-radius:50%;font-size:18px;padding:0;background:rgba(0,0,0,.45);color:#fff;border:1px solid rgba(255,255,255,.35);cursor:pointer';
    b.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var done = false, to = setTimeout(function () { if (done) return; done = true; window.__mvxShotReq = null; toast(T('No se pudo hacer la foto', 'Could not take the photo')); }, 2000);
      window.__mvxShotReq = function (url) {
        if (done) return; done = true; clearTimeout(to);
        var img = new Image(); img.onload = function () { var out = null; try { out = watermark(img, 'Doganiero Metaverse'); } catch (e) {} out = out || url; savePng('metaverse-' + stamp() + '.png', out); toast(T('📸 Foto guardada en Descargas', '📸 Photo saved to Downloads')); };
        img.onerror = function () { toast(T('No se pudo hacer la foto', 'Could not take the photo')); };
        if (url) img.src = url; else img.onerror();
      };
    });
    host.appendChild(b);
  }

  /* ---------- 20. App nueva: Bienestar + envoltorios ---------- */
  function install() {
    var A = apps(); if (!A) return false;
    if (!A.bienestar) {
      A.bienestar = { title: 'Bienestar digital', icon: '🌿', width: 420, height: 560, render: renderWellbeing };
      try { if (typeof APP_OPEN_ALIASES !== 'undefined' && APP_OPEN_ALIASES && !APP_OPEN_ALIASES.bienestar) APP_OPEN_ALIASES.bienestar = ['bienestar', 'bienestar digital', 'tiempo de uso', 'screen time', 'wellbeing']; } catch (e) {}
      try { if (document.querySelector('#iconLayer .desktop-icon') && typeof buildIcons === 'function') buildIcons(); if (typeof buildStartMenu === 'function' && document.querySelector('#startMenu .start-item')) buildStartMenu(); } catch (e) {}
    }
    wrapGames(A); wrapBrowser(A); wrapCode(A); wrapExplorer(A);
    return true;
  }

  /* ---------- arranque ---------- */
  var lastEm = null;
  function loop() {
    try {
      install(); initWindows();
      var e = em(); if (e !== lastEm) { lastEm = e; apply(); }
      if (!welT && e && get('welcome', '') !== VER) welT = setTimeout(function () { welT = 0; try { maybeWelcome(); } catch (er) {} }, 2500);
      var ch = $('win-chat'); if (ch) decorateChat(ch);
      var ph = $('win-phone'); if (ph) decoratePhone(ph);
      var ls = $('win-los-snakes'); if (ls) decorateSnakes(ls);
      var mv = $('win-metaverse'); if (mv) decorateMeta(mv);
      var p = P(); if (p.night && p.nightAuto) applyNight(p);
    } catch (err) { try { console.warn('[snk2614]', err); } catch (e2) {} }
  }
  window.addEventListener('snk:profile', function () { lastEm = null; loop(); });
  window.addEventListener('snk-lang', function () { var t = $('qsNight14'); if (t) { var l = t.querySelector('.qs-tile-lab'); if (l) l.textContent = T('Luz nocturna', 'Night light'); } var s = $('snkShowDesk'); if (s) { s.title = T('Mostrar escritorio (Ctrl+Alt+D)', 'Show desktop (Ctrl+Alt+D)'); s.setAttribute('aria-label', s.title); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loop); else loop();
  setInterval(loop, 2000);
})();
