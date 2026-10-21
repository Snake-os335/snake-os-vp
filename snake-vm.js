/* Snake OS · Máquinas virtuales (2026.14, escritorio estilo Ubuntu 26.10)
   2026.14: vuelve el escritorio estilo Ubuntu; las máquinas que pasaron a «snkpro» vuelven a «ubuntu» con el mismo estado
   y los mismos archivos (aviso corto). Funciones Pro de la VM (instantánea y estilos de terminal) siguen en Configuración › Pro.
   La terminal usa UTF-8 (LANG=C.UTF-8) para que ls muestre bien las tildes y la ñ.
   «Linux con escritorio estilo Ubuntu»: un Linux ligero real (Buildroot 2024.05 + BusyBox 1.36, kernel 6.8) emulado con v86
   en TU navegador, con un escritorio propio de Snake OS hecho en HTML/CSS/JS que imita el aspecto de Ubuntu 26.10 (GNOME).
   No es Ubuntu: no lleva software ni logos de Canonical. Dibujos, iconos y fondos son originales de Snake OS.
   Las apps están conectadas a la máquina de verdad:
     · Terminal → shells reales por puertos serie (ttyS0, ttyS2, ttyS3) con xterm.js (MIT, servido desde /static/assets).
     · Archivos, Editor de texto y Monitor del sistema → un «agente» (sh de BusyBox en ttyS1) que ejecuta ls/cat/base64/ps/df.
   Nada se ejecuta en el servidor: solo sirve archivos fijos. Sin red dentro de la máquina.
   Estado y ajustes en IndexedDB del navegador, por perfil (base «snkVMv1», clave = correo del perfil); el estado se guarda
   comprimido (gzip). Una vez configurada, la máquina queda fija para ese perfil.
   Fuente Ubuntu / Ubuntu Mono: Ubuntu Font Licence 1.0 (assets/fonts/UFL-Ubuntu.txt). */
(function () {
  'use strict';
  if (window.renderSnakeVMApp) return;
  var BASE = '/static/assets/vm/', AS = '/static/assets/', VER = '202610220400';
  var DBN = 'snkVMv1', ST = 'machines', FMT = 2;
  /* Máquinas del escritorio «Snake OS! Pro» (21-oct) → otra vez estilo Ubuntu: mismo Linux, mismo estado y archivos */
  var WALL_FROM_PRO = { selva: 'ola', neon: 'noche', aurora: 'amanecer', escamas: 'pizarra' };
  var ACC_FROM_PRO = { '#22c55e': '#E95420', '#eab308': '#a35d3d', '#14b8a6': '#657b69', '#84cc16': '#657b69', '#3b82f6': '#3584e4', '#a855f7': '#7764d8', '#f43f5e': '#da3450' };
  function backToUbuntu(r) {
    if (!r || r.os !== 'snkpro') return false;
    r.os = 'ubuntu'; r.ui = r.ui || {};
    r.ui.wall = WALL_FROM_PRO[r.ui.wall] || (WALLS[r.ui.wall] ? r.ui.wall : 'ola');
    r.ui.acc = ACC_FROM_PRO[r.ui.acc] || '#E95420';
    if (!r.name || r.name === 'snake-pro') r.name = 'snake-ubuntu';
    delete r.renamedHost; delete r.proFrom; delete r.proAt;
    r.ubuntuBackAt = Date.now();
    return true;
  }
  var CMDLINE = 'tsc=reliable mitigations=off random.trust_cpu=on init_on_free=1';
  function en() { return !!(window.snakeI18n && window.snakeI18n.lang === 'en'); }
  function T(es, e) { if (en()) { (window.__SNK_EN_OUT = window.__SNK_EN_OUT || {})[e] = 1; return e; } return es; }
  function who() { var u = window.currentUser; var e = u && u.email ? String(u.email).trim().toLowerCase() : ''; return e || ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function q(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
  function fmtBytes(n) { n = +n || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1).replace('.0', '') + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; }
  function db() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('IndexedDB'));
      var r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(ST); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function get(k) { return db().then(function (d) { return new Promise(function (res, rej) { var x = d.transaction(ST).objectStore(ST).get(k); x.onsuccess = function () { res(x.result || null); }; x.onerror = function () { rej(x.error); }; }); }); }
  function put(k, v) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(ST, 'readwrite'); t.objectStore(ST).put(v, k); t.oncomplete = function () { res(true); }; t.onerror = function () { rej(t.error); }; }); }); }
  function gz(buf) {
    if (!window.CompressionStream) return Promise.resolve({ buf: buf, gz: false });
    return new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer().then(function (b) { return { buf: b, gz: true }; });
  }
  function gunzip(buf) { return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(); }
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error(src)); }; document.head.appendChild(s); }); }
  var libP = null, xtP = null;
  function loadLib() {
    if (window.V86) return Promise.resolve();
    if (!libP) libP = loadScript(BASE + 'libv86.js?v=' + VER).then(function () { if (!window.V86) throw new Error('v86'); }, function (e) { libP = null; throw e; });
    return libP;
  }
  function loadXterm() {
    if (xtP) return xtP;
    if (!document.getElementById('snkvm-xtcss')) { var l = document.createElement('link'); l.id = 'snkvm-xtcss'; l.rel = 'stylesheet'; l.href = AS + 'snkvm-xterm.css?v=' + VER; document.head.appendChild(l); }
    xtP = (window.Terminal ? Promise.resolve() : loadScript(AS + 'snkvm-xterm.js?v=' + VER))
      .then(function () { return window.FitAddon ? null : loadScript(AS + 'snkvm-xterm-fit.js?v=' + VER); })
      .then(function () { return document.fonts && document.fonts.load ? Promise.all([document.fonts.load('13px SnkVMUbuntuMono'), document.fonts.load('bold 13px SnkVMUbuntuMono')]).catch(function () {}) : null; })
      .catch(function (e) { xtP = null; throw e; });
    return xtP;
  }

  /* ---------- Dibujos originales (iconos estilo Yaru hechos para Snake OS) ---------- */
  var IC = {
    files: '<svg viewBox="0 0 64 64"><defs><linearGradient id="ubxf1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7a072"/><stop offset="1" stop-color="#e5652b"/></linearGradient></defs><path d="M6 14a5 5 0 0 1 5-5h14l5 5h23a5 5 0 0 1 5 5v4H6z" fill="#b8481a"/><rect x="6" y="19" width="52" height="37" rx="5" fill="url(#ubxf1)"/><rect x="6" y="19" width="52" height="3" fill="#fff" opacity=".35"/><rect x="24" y="33" width="16" height="3" rx="1.5" fill="#fff" opacity=".8"/></svg>',
    term: '<svg viewBox="0 0 64 64"><rect x="5" y="8" width="54" height="48" rx="9" fill="#2b2b2b"/><rect x="5" y="8" width="54" height="10" rx="9" fill="#3d3d3d"/><rect x="5" y="14" width="54" height="4" fill="#3d3d3d"/><path d="M15 28l9 6-9 6" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><rect x="28" y="40" width="16" height="3.6" rx="1.8" fill="#E95420"/></svg>',
    edit: '<svg viewBox="0 0 64 64"><path d="M14 6h26l12 12v36a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z" fill="#f6f5f4" stroke="#c0bfbc" stroke-width="1.5"/><path d="M40 6v9a3 3 0 0 0 3 3h9" fill="#deddda"/><g stroke="#9a9996" stroke-width="2.6" stroke-linecap="round"><path d="M18 26h22M18 33h26M18 40h18M18 47h12"/></g><path d="M50 30l6 6-16 16-8 2 2-8z" fill="#E95420"/><path d="M50 30l6 6-3 3-6-6z" fill="#77216F"/></svg>',
    mon: '<svg viewBox="0 0 64 64"><rect x="5" y="9" width="54" height="46" rx="9" fill="#323232"/><path d="M11 40h8l5-13 7 22 6-16 4 7h12" fill="none" stroke="#33d17a" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 22h42" stroke="#555" stroke-width="1.5"/><path d="M11 48h42" stroke="#555" stroke-width="1.5"/></svg>',
    set: '<svg viewBox="0 0 64 64"><g transform="translate(32 32)"><g fill="#77767b">' + (function () { var s = ''; for (var i = 0; i < 8; i++) s += '<rect x="-5" y="-27" width="10" height="12" rx="2.5" transform="rotate(' + (i * 45) + ')"/>'; return s; })() + '</g><circle r="19" fill="#9a9996"/><circle r="19" fill="none" stroke="#77767b" stroke-width="2"/><circle r="8" fill="#deddda"/></g></svg>',
    about: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#3584e4"/><circle cx="32" cy="20" r="4" fill="#fff"/><rect x="28" y="28" width="8" height="20" rx="3" fill="#fff"/></svg>',
    grid: '<svg viewBox="0 0 64 64"><g fill="#fff">' + (function () { var s = ''; for (var y = 0; y < 3; y++) for (var x = 0; x < 3; x++) s += '<circle cx="' + (18 + x * 14) + '" cy="' + (18 + y * 14) + '" r="4.2"/>'; return s; })() + '</g></svg>',
    folder: '<svg viewBox="0 0 64 64"><path d="M5 15a5 5 0 0 1 5-5h14l5 5h25a5 5 0 0 1 5 5v3H5z" fill="#c45a26"/><rect x="5" y="19" width="54" height="37" rx="4.5" fill="#ef7f44"/><rect x="5" y="19" width="54" height="3" fill="#fff" opacity=".3"/></svg>',
    home: '<svg viewBox="0 0 64 64"><path d="M5 15a5 5 0 0 1 5-5h14l5 5h25a5 5 0 0 1 5 5v3H5z" fill="#c45a26"/><rect x="5" y="19" width="54" height="37" rx="4.5" fill="#ef7f44"/><path d="M32 27l-10 9h3v9h5v-6h4v6h5v-9h3z" fill="#fff" opacity=".9"/></svg>',
    file: '<svg viewBox="0 0 64 64"><path d="M15 5h23l13 13v38a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="#fafafa" stroke="#c0bfbc" stroke-width="1.5"/><path d="M38 5v10a3 3 0 0 0 3 3h10" fill="#deddda"/></svg>',
    text: '<svg viewBox="0 0 64 64"><path d="M15 5h23l13 13v38a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="#fafafa" stroke="#c0bfbc" stroke-width="1.5"/><path d="M38 5v10a3 3 0 0 0 3 3h10" fill="#deddda"/><g stroke="#9a9996" stroke-width="2.4" stroke-linecap="round"><path d="M19 27h24M19 34h24M19 41h17M19 48h20"/></g></svg>',
    exec: '<svg viewBox="0 0 64 64"><path d="M15 5h23l13 13v38a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="#fafafa" stroke="#c0bfbc" stroke-width="1.5"/><path d="M38 5v10a3 3 0 0 0 3 3h10" fill="#deddda"/><rect x="18" y="28" width="28" height="20" rx="4" fill="#2b2b2b"/><path d="M23 34l4 3-4 3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><rect x="29" y="40" width="8" height="2" fill="#E95420"/></svg>',
    dev: '<svg viewBox="0 0 64 64"><rect x="10" y="14" width="44" height="36" rx="5" fill="#9a9996"/><rect x="16" y="20" width="32" height="24" rx="2" fill="#5e5c64"/><g fill="#deddda"><rect x="20" y="8" width="3" height="6"/><rect x="30" y="8" width="3" height="6"/><rect x="40" y="8" width="3" height="6"/><rect x="20" y="50" width="3" height="6"/><rect x="30" y="50" width="3" height="6"/><rect x="40" y="50" width="3" height="6"/></g></svg>',
    root: '<svg viewBox="0 0 64 64"><rect x="8" y="18" width="48" height="28" rx="5" fill="#77767b"/><rect x="8" y="18" width="48" height="14" rx="5" fill="#9a9996"/><circle cx="47" cy="39" r="3" fill="#33d17a"/><rect x="14" y="37" width="20" height="4" rx="2" fill="#5e5c64"/></svg>'
  };
  function mini(n) { return { home: '<svg viewBox="0 0 16 16"><path d="M8 2L1.5 7.5H3.5V14h3.5v-4h2v4h3.5V7.5h2z" fill="currentColor"/></svg>', root: '<svg viewBox="0 0 16 16"><rect x="1.5" y="4" width="13" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="11.5" cy="9" r="1" fill="currentColor"/></svg>', tmp: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>', share: '<svg viewBox="0 0 16 16"><path d="M2 4.5h4l1.5 1.5H14v7H2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>', etc: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.5v2.2M8 12.3v2.2M1.5 8h2.2M12.3 8h2.2M3.4 3.4l1.6 1.6M11 11l1.6 1.6M3.4 12.6L5 11M11 5l1.6-1.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' }[n] || ''; }
  var SYM = {
    min: '<svg viewBox="0 0 16 16"><path d="M3.5 11.5h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    max: '<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    close: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    back: '<svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fwd: '<svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    up: '<svg viewBox="0 0 16 16"><path d="M3 10l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    menu: '<svg viewBox="0 0 16 16"><path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    plus: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    search: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    refresh: '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    net: '<svg viewBox="0 0 16 16"><path d="M2 6.5a9 9 0 0 1 12 0M4.3 9a5.6 5.6 0 0 1 7.4 0M6.6 11.5a2.2 2.2 0 0 1 2.8 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".45"/><path d="M3 3l10 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    vol: '<svg viewBox="0 0 16 16"><path d="M2 6h2.5L8 3v10L4.5 10H2z" fill="currentColor"/><path d="M10.5 6l4 4M14.5 6l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    power: '<svg viewBox="0 0 16 16"><path d="M8 1.8v5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4.6 4.2a5.2 5.2 0 1 0 6.8 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    moon: '<svg viewBox="0 0 16 16"><path d="M13 10.2A5.6 5.6 0 0 1 5.8 3a5.6 5.6 0 1 0 7.2 7.2z" fill="currentColor"/></svg>',
    save: '<svg viewBox="0 0 16 16"><path d="M3 2.5h8l2.5 2.5v8.5h-11z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><rect x="5" y="9" width="6" height="4.5" fill="currentColor"/></svg>',
    gear: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    info: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 7.2v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="4.9" r="1" fill="currentColor"/></svg>',
    restart: '<svg viewBox="0 0 16 16"><path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v3h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    trash: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 9h5.6l.7-9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    edit: '<svg viewBox="0 0 16 16"><path d="M10.5 2.5l3 3-8 8H2.5v-3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    dl: '<svg viewBox="0 0 16 16"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 13.5h11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ul: '<svg viewBox="0 0 16 16"><path d="M8 11V3M4.5 6.5L8 3l3.5 3.5M2.5 13.5h11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  /* Logo propio de la máquina (no es el logotipo de Ubuntu ni de Canonical) */
  var MLOGO = '<svg viewBox="0 0 64 64"><defs><linearGradient id="ubxlg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E95420"/><stop offset="1" stop-color="#77216F"/></linearGradient></defs><rect x="4" y="4" width="56" height="56" rx="16" fill="url(#ubxlg)"/><path d="M20 40c0-8 6-10 12-10s12-2 12-10" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="44" cy="20" r="5" fill="#fff"/><circle cx="20" cy="44" r="3.5" fill="#fff" opacity=".8"/></svg>';

  /* Fondos de pantalla originales de Snake OS al estilo Ubuntu */
  function svgUrl(s) { return 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")'; }
  var WALLS = {
    ola: { es: 'Ola berenjena', en: 'Aubergine wave', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d0016"/><stop offset=".45" stop-color="#4b1240"/><stop offset=".8" stop-color="#9c2f3a"/><stop offset="1" stop-color="#E95420"/></linearGradient><radialGradient id="b" cx=".8" cy=".78" r=".55"><stop offset="0" stop-color="#ff9a52" stop-opacity=".85"/><stop offset="1" stop-color="#ff9a52" stop-opacity="0"/></radialGradient><linearGradient id="c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E95420" stop-opacity="0"/><stop offset=".6" stop-color="#ff7a3a" stop-opacity=".7"/><stop offset="1" stop-color="#ffb07a" stop-opacity=".9"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#a)"/><rect width="1600" height="1000" fill="url(#b)"/><path d="M-50 760C250 620 520 860 860 720S1350 470 1650 560V1050H-50Z" fill="#E95420" opacity=".28"/><path d="M-50 850C340 740 640 960 980 830S1420 700 1650 760V1050H-50Z" fill="#2c001e" opacity=".42"/><g fill="none" stroke="url(#c)" stroke-width="2.2"><path d="M-50 640C300 520 560 760 900 620S1400 380 1650 450"/><path d="M-50 668C300 548 560 788 900 648S1400 408 1650 478" opacity=".7"/><path d="M-50 696C300 576 560 816 900 676S1400 436 1650 506" opacity=".45"/><path d="M-50 724C300 604 560 844 900 704S1400 464 1650 534" opacity=".25"/></g></svg>' },
    noche: { es: 'Noche violeta', en: 'Violet night', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="a" cx=".3" cy=".35" r=".9"><stop offset="0" stop-color="#5a1f5c"/><stop offset=".6" stop-color="#22091f"/><stop offset="1" stop-color="#0e040c"/></radialGradient><radialGradient id="b" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#E95420" stop-opacity=".9"/><stop offset="1" stop-color="#E95420" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="1000" fill="url(#a)"/><circle cx="1150" cy="380" r="330" fill="url(#b)" opacity=".55"/><g fill="none" stroke="#f6a37a" stroke-opacity=".5"><circle cx="1150" cy="380" r="220" stroke-width="2"/><circle cx="1150" cy="380" r="270" stroke-width="1.2" stroke-opacity=".3"/><circle cx="1150" cy="380" r="330" stroke-width=".8" stroke-opacity=".2"/></g><path d="M0 820Q400 700 800 800T1600 760V1000H0Z" fill="#150510" opacity=".9"/></svg>' },
    amanecer: { es: 'Amanecer', en: 'Sunrise', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a2a6b"/><stop offset=".5" stop-color="#e2683c"/><stop offset="1" stop-color="#f7c08a"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#a)"/><circle cx="800" cy="640" r="190" fill="#ffd9a8" opacity=".85"/><path d="M0 700L260 560L480 660L760 500L1040 650L1300 540L1600 640V1000H0Z" fill="#9a3a4e" opacity=".75"/><path d="M0 800L300 690L620 790L900 680L1240 800L1600 720V1000H0Z" fill="#5c1c47" opacity=".9"/></svg>' },
    pizarra: { es: 'Pizarra', en: 'Slate', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2d33"/><stop offset="1" stop-color="#4a4f58"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#a)"/><g fill="none" stroke="#E95420" stroke-linecap="round"><path d="M-40 620C380 500 700 760 1100 600S1500 480 1660 520" stroke-width="3" stroke-opacity=".8"/><path d="M-40 650C380 530 700 790 1100 630S1500 510 1660 550" stroke-width="1.6" stroke-opacity=".45"/></g></svg>' }
  };
  var ACCENTS = [['#E95420', 'Naranja', 'Orange'], ['#a35d3d', 'Corteza', 'Bark'], ['#657b69', 'Salvia', 'Sage'], ['#3584e4', 'Azul', 'Blue'], ['#7764d8', 'Morado', 'Purple'], ['#b34cb3', 'Magenta', 'Magenta'], ['#da3450', 'Rojo', 'Red']];
  function css() {
    if (document.getElementById('snkvm-css')) return;
    var F = AS + 'fonts/';
    var st = document.createElement('style'); st.id = 'snkvm-css';
    st.textContent =
      "@font-face{font-family:'SnkVMUbuntu';font-weight:400;font-display:swap;src:url(" + F + "ubuntu-latin-400-normal.woff2) format('woff2')}" +
      "@font-face{font-family:'SnkVMUbuntu';font-weight:500;font-display:swap;src:url(" + F + "ubuntu-latin-500-normal.woff2) format('woff2')}" +
      "@font-face{font-family:'SnkVMUbuntu';font-weight:700;font-display:swap;src:url(" + F + "ubuntu-latin-700-normal.woff2) format('woff2')}" +
      "@font-face{font-family:'SnkVMUbuntuMono';font-weight:400;font-display:swap;src:url(" + F + "ubuntu-mono-latin-400-normal.woff2) format('woff2')}" +
      "@font-face{font-family:'SnkVMUbuntuMono';font-weight:700;font-display:swap;src:url(" + F + "ubuntu-mono-latin-700-normal.woff2) format('woff2')}" +
      '.snkvm{height:100%;position:relative}' +
      '.snkvm-pick{padding:18px;display:flex;flex-direction:column;gap:12px;font:14px var(--snake-font,Inter,system-ui,sans-serif)}.snkvm-card{display:flex;gap:14px;align-items:center;padding:14px;border-radius:16px;border:1px solid rgba(127,127,127,.3);background:rgba(233,84,32,.10);cursor:pointer;text-align:left;color:inherit;font:inherit}' +
      '.snkvm-card:hover{background:rgba(233,84,32,.18)}.snkvm-card svg{width:56px;height:56px;flex:0 0 auto}.snkvm-card b{font-size:17px}.snkvm-card small,.snkvm-note{opacity:.75;font-size:12px}' +
      /* raíz del escritorio */
      ".ubx{position:absolute;inset:0;overflow:hidden;font:14px/1.35 'SnkVMUbuntu','Ubuntu',Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none;--acc:#E95420;--acc-fg:#fff;" +
      '--win-bg:#fafafa;--win-fg:#2e2e2e;--hb-bg:#ebebeb;--view:#ffffff;--side:#f2f2f2;--line:rgba(0,0,0,.12);--hover:rgba(0,0,0,.07);--sel:color-mix(in srgb,var(--acc) 22%,transparent);--card:#fff;--muted:rgba(0,0,0,.55);--inp:#fff;--shadow:0 10px 30px rgba(0,0,0,.3),0 0 0 1px rgba(0,0,0,.09);background:#1d0016;color:#2e2e2e}' +
      '.ubx.dark{--win-bg:#2a2a2a;--win-fg:#f2f2f2;--hb-bg:#303030;--view:#1e1e1e;--side:#262626;--line:rgba(255,255,255,.1);--hover:rgba(255,255,255,.08);--card:#383838;--muted:rgba(255,255,255,.6);--inp:#3a3a3a;--shadow:0 10px 30px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08)}' +
      ':where(.ubx) svg{display:block}:where(.ubx) button{font:inherit;color:inherit}:where(.ubx) :is(input,textarea,select){font:inherit;user-select:text;-webkit-user-select:text}.ubx-pg>*,.ubx-res>*{flex-shrink:0}' +
      '.ubx-top{position:absolute;left:0;right:0;top:0;height:30px;background:#000;color:#fff;display:flex;align-items:center;gap:4px;padding:0 6px;z-index:9000;font-weight:500;font-size:13.5px}' +
      '.ubx-top>button{background:none;border:0;border-radius:99px;padding:0 12px;cursor:pointer;height:24px;display:flex;align-items:center;gap:9px;color:#fff;white-space:nowrap}' +
      '.ubx-top>button:hover,.ubx-top>button.on{background:rgba(255,255,255,.18)}.ubx-top>button svg{width:15px;height:15px}' +
      '.ubx-ws{display:flex;gap:4px;align-items:center}.ubx-ws i{width:6px;height:6px;border-radius:9px;background:rgba(255,255,255,.55)}.ubx-ws i.a{width:22px;background:#fff}' +
      '.ubx-clock{position:absolute;left:50%;transform:translateX(-50%)}.ubx-sp{flex:1}' +
      '.ubx-desk{position:absolute;left:0;right:0;top:30px;bottom:0;background-size:cover;background-position:center}' +
      '.ubx-dock{position:absolute;left:0;top:30px;bottom:0;width:64px;background:rgba(22,22,22,.84);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);display:flex;flex-direction:column;align-items:center;padding:8px 0;gap:5px;z-index:8000;box-shadow:1px 0 0 rgba(255,255,255,.06)}' +
      '.ubx-di{position:relative;width:52px;height:52px;border-radius:12px;border:0;background:none;padding:6px;cursor:pointer;flex:0 0 auto}' +
      '.ubx-di:hover{background:rgba(255,255,255,.13)}.ubx-di.on{background:rgba(255,255,255,.09)}.ubx-di svg{width:40px;height:40px}' +
      '.ubx-di .dots{position:absolute;left:1px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:3px}.ubx-di .dots i{width:4px;height:4px;border-radius:5px;background:var(--acc)}' +
      '.ubx-dsep{width:36px;height:1px;background:rgba(255,255,255,.2);margin:2px 0}.ubx-dsp{flex:1}' +
      '.ubx-area{position:absolute;left:64px;right:0;top:30px;bottom:0;overflow:hidden}' +
      '.ubx-dicon{position:absolute;width:84px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;border-radius:8px;border:0;background:none;cursor:pointer;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.8);font-size:12.5px}' +
      '.ubx-dicon:hover{background:rgba(255,255,255,.15)}.ubx-dicon svg{width:52px;height:52px}' +
      /* ventanas estilo libadwaita */
      '.ubx-win{position:absolute;display:flex;flex-direction:column;background:var(--win-bg);color:var(--win-fg);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;min-width:280px;min-height:180px}' +
      '.ubx-win.max{left:0!important;top:0!important;width:100%!important;height:100%!important;border-radius:0}.ubx-win.minz{display:none}' +
      '.ubx-win:not(.act){box-shadow:0 4px 14px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.1)}.ubx-win:not(.act) .ubx-hb{color:color-mix(in srgb,var(--win-fg) 60%,transparent)}' +
      '.ubx-hb{height:46px;flex:0 0 46px;display:flex;align-items:center;gap:6px;padding:0 8px;background:var(--hb-bg);touch-action:none;position:relative;box-shadow:inset 0 -1px var(--line)}' +
      '.ubx-hb .ttl{position:absolute;left:50%;transform:translateX(-50%);max-width:46%;text-align:center;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}' +
      '.ubx-hb .l,.ubx-hb .r{display:flex;gap:6px;align-items:center;min-width:0}.ubx-hb .r{margin-left:auto}' +
      '.ubx-btn{border:0;border-radius:6px;background:color-mix(in srgb,var(--win-fg) 10%,transparent);padding:0 10px;cursor:pointer;height:32px;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:700;white-space:nowrap}' +
      '.ubx-btn:hover{background:color-mix(in srgb,var(--win-fg) 16%,transparent)}.ubx-btn.flat{background:none}.ubx-btn.flat:hover{background:var(--hover)}.ubx-btn.ic{width:34px;padding:0}.ubx-btn svg{width:16px;height:16px}' +
      '.ubx-btn.sug{background:var(--acc);color:var(--acc-fg)}.ubx-btn.sug:hover{filter:brightness(1.08)}.ubx-btn.dest{background:#c01c28;color:#fff}.ubx-btn:disabled{opacity:.45;cursor:default}' +
      '.ubx-wc{width:24px;height:24px;border-radius:50%;border:0;background:color-mix(in srgb,var(--win-fg) 12%,transparent);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;margin-left:4px}' +
      '.ubx-wc:hover{background:color-mix(in srgb,var(--win-fg) 22%,transparent)}.ubx-wc.x:hover{background:var(--acc);color:#fff}.ubx-wc svg{width:11px;height:11px}' +
      '.ubx-wb{flex:1;min-height:0;position:relative;display:flex;flex-direction:column;background:var(--view)}' +
      '.ubx-rz{position:absolute;z-index:4}.ubx-rz.n{top:-3px;left:8px;right:8px;height:7px;cursor:ns-resize}.ubx-rz.s{bottom:-3px;left:8px;right:8px;height:7px;cursor:ns-resize}.ubx-rz.e{right:-3px;top:8px;bottom:8px;width:7px;cursor:ew-resize}.ubx-rz.w{left:-3px;top:8px;bottom:8px;width:7px;cursor:ew-resize}' +
      '.ubx-rz.ne{right:-3px;top:-3px;width:12px;height:12px;cursor:nesw-resize}.ubx-rz.nw{left:-3px;top:-3px;width:12px;height:12px;cursor:nwse-resize}.ubx-rz.se{right:-3px;bottom:-3px;width:14px;height:14px;cursor:nwse-resize}.ubx-rz.sw{left:-3px;bottom:-3px;width:12px;height:12px;cursor:nesw-resize}.ubx-win.max .ubx-rz{display:none}' +
      /* vista de actividades y cuadrícula */
      '.ubx-ov{position:absolute;inset:30px 0 0 64px;z-index:8500;background:rgba(10,10,10,.62);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);display:flex;flex-direction:column;align-items:center;padding:18px 18px;gap:18px;overflow:auto;color:#fff;animation:ubxfade .16s ease-out}' +
      '@keyframes ubxfade{from{opacity:0;transform:scale(1.02)}to{opacity:1;transform:none}}' +
      '.ubx-srch{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.14);border-radius:99px;padding:0 14px;height:38px;width:min(420px,90%)}.ubx-srch svg{width:16px;height:16px;opacity:.8}.ubx-srch input{flex:1;background:none;border:0;outline:none;color:#fff;font-size:15px}.ubx-srch input::placeholder{color:rgba(255,255,255,.65)}' +
      '.ubx-wins{display:flex;flex-wrap:wrap;gap:16px;justify-content:center}.ubx-wcard{width:190px;border-radius:12px;background:rgba(255,255,255,.1);border:2px solid transparent;cursor:pointer;padding:10px;display:flex;flex-direction:column;align-items:center;gap:8px;color:#fff}.ubx-wcard:hover{border-color:var(--acc)}.ubx-wcard svg{width:48px;height:48px}.ubx-wcard span{font-size:12.5px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.ubx-apps{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px;width:min(720px,100%)}.ubx-app{border:0;background:none;color:#fff;border-radius:16px;padding:12px 6px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;font-size:13px}.ubx-app:hover,.ubx-app.hl{background:rgba(255,255,255,.14)}.ubx-app svg{width:64px;height:64px}' +
      '.ubx-ovh{font-size:12.5px;opacity:.7;text-align:center}' +
      /* menús emergentes del panel (siempre oscuros, como GNOME Shell) */
      '.ubx-pop{position:absolute;top:36px;z-index:9500;background:#2b2b2b;color:#f2f2f2;border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.08);padding:12px;animation:ubxfade .12s ease-out}' +
      '.ubx-qs{right:6px;width:330px;display:flex;flex-direction:column;gap:10px}.ubx-qsr{display:flex;gap:8px;justify-content:flex-end}.ubx-qsr button{width:38px;height:38px;border-radius:50%;border:0;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}.ubx-qsr button:hover{background:rgba(255,255,255,.18)}.ubx-qsr svg{width:16px;height:16px}' +
      '.ubx-qsg{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ubx-tile{border:0;border-radius:99px;background:rgba(255,255,255,.1);color:#fff;display:flex;align-items:center;gap:10px;padding:0 14px;height:46px;cursor:pointer;text-align:left;font-size:13px}.ubx-tile svg{width:16px;height:16px;flex:0 0 auto}.ubx-tile.on{background:var(--acc);color:#fff}.ubx-tile:disabled{opacity:.55;cursor:default}.ubx-tile small{display:block;opacity:.75;font-size:11px}' +
      '.ubx-qsi{font-size:12px;opacity:.7;padding:0 4px}.ubx-cal{left:50%;transform:translateX(-50%);width:300px}.ubx-cal h4{margin:2px 4px 2px;font-size:13px;opacity:.75;font-weight:500}.ubx-cal h3{margin:0 4px 10px;font-size:20px}.ubx-calg{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;font-size:12.5px}.ubx-calg b{opacity:.55;font-weight:500;padding:4px 0}.ubx-calg span{padding:6px 0;border-radius:99px}.ubx-calg span.t{background:var(--acc);color:#fff;font-weight:700}.ubx-calg span.o{opacity:.35}' +
      /* diálogos, avisos y menús contextuales */
      '.ubx-back{position:absolute;inset:0;background:rgba(0,0,0,.4);z-index:9700;display:flex;align-items:center;justify-content:center;animation:ubxfade .12s}.ubx-dlg{background:var(--win-bg);color:var(--win-fg);border-radius:18px;box-shadow:var(--shadow);width:min(380px,92%);padding:22px 20px 18px;display:flex;flex-direction:column;gap:12px;text-align:center}.ubx-dlg h3{margin:0;font-size:18px}.ubx-dlg p{margin:0;color:var(--muted)}' +
      '.ubx-dlg .bt{display:flex;gap:10px;margin-top:6px}.ubx-dlg .bt .ubx-btn{flex:1;height:38px;border-radius:10px}' +
      '.ubx-in{height:36px;border-radius:8px;border:2px solid transparent;background:color-mix(in srgb,var(--win-fg) 9%,transparent);color:var(--win-fg);padding:0 10px;outline:none;min-width:0}.ubx-in:focus{border-color:color-mix(in srgb,var(--acc) 70%,transparent)}' +
      '.ubx-toast{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:9800;background:#383838;color:#fff;border-radius:99px;padding:10px 20px;box-shadow:0 6px 20px rgba(0,0,0,.4);font-size:13.5px;max-width:80%;animation:ubxfade .15s;pointer-events:none}' +
      '.ubx-menu{position:absolute;z-index:9600;background:var(--win-bg);color:var(--win-fg);border-radius:12px;box-shadow:var(--shadow);padding:6px;min-width:190px;display:flex;flex-direction:column}.ubx-menu button{border:0;background:none;text-align:left;padding:8px 12px;border-radius:7px;cursor:pointer;display:flex;gap:10px;align-items:center}.ubx-menu button:hover{background:var(--hover)}.ubx-menu button svg{width:15px;height:15px;opacity:.8}.ubx-menu hr{border:0;border-top:1px solid var(--line);margin:4px 6px}.ubx-menu button.dz{color:#e01b24}' +
      /* Archivos */
      '.ubx-fm{display:flex;flex:1;min-height:0}.ubx-side{width:176px;background:var(--side);padding:8px 6px;overflow:auto;flex:0 0 auto;display:flex;flex-direction:column;gap:2px;box-shadow:inset -1px 0 var(--line)}' +
      '.ubx-side button{display:flex;gap:11px;align-items:center;width:100%;border:0;background:none;padding:8px 10px;border-radius:7px;cursor:pointer;text-align:left}.ubx-side button svg{width:16px;height:16px;opacity:.85}.ubx-side button:hover{background:var(--hover)}.ubx-side button.on{background:var(--sel);font-weight:700}' +
      '.ubx-main{flex:1;min-width:0;display:flex;flex-direction:column}.ubx-grid{flex:1;overflow:auto;padding:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:4px;align-content:start}' +
      '.ubx-it{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:9px;cursor:pointer;text-align:center;word-break:break-word;font-size:12.5px;line-height:1.25}.ubx-it:hover{background:var(--hover)}.ubx-it.sel{background:var(--sel)}.ubx-it svg{width:54px;height:54px}.ubx-it.hid{opacity:.6}.ubx-it .lk{font-size:10px;opacity:.7}' +
      '.ubx-path{flex:1;min-width:0;display:flex;gap:1px;overflow:hidden;background:color-mix(in srgb,var(--win-fg) 8%,transparent);border-radius:8px;padding:0 4px;align-items:center;height:32px}.ubx-path button{border:0;background:none;padding:3px 7px;border-radius:6px;cursor:pointer;white-space:nowrap;font-weight:500}.ubx-path button:hover{background:var(--hover)}.ubx-path button.cur{font-weight:700}.ubx-path i{opacity:.45;font-style:normal}' +
      '.ubx-stat{padding:5px 12px;font-size:12px;color:var(--muted);box-shadow:inset 0 1px var(--line);display:flex;gap:10px}.ubx-empty{grid-column:1/-1;text-align:center;color:var(--muted);padding:40px 10px}' +
      /* Editor */
      ".ubx-ta{flex:1;border:0;resize:none;outline:none;background:var(--view);color:var(--win-fg);font:14px/1.5 'SnkVMUbuntuMono','Ubuntu Mono',monospace;padding:12px 14px;tab-size:4;white-space:pre;overflow:auto}" +
      /* Monitor */
      '.ubx-tabs{display:flex;gap:2px;background:color-mix(in srgb,var(--win-fg) 8%,transparent);border-radius:9px;padding:2px}.ubx-tabs button{border:0;background:none;padding:0 12px;height:28px;border-radius:7px;cursor:pointer;font-weight:700;font-size:13px}.ubx-tabs button.on{background:var(--view);box-shadow:0 1px 3px rgba(0,0,0,.15)}' +
      '.ubx-tbl{flex:1;overflow:auto}.ubx-tbl table{width:100%;border-collapse:collapse;font-size:13px}.ubx-tbl th{position:sticky;top:0;background:var(--view);text-align:left;padding:7px 10px;font-weight:700;box-shadow:inset 0 -1px var(--line);white-space:nowrap}.ubx-tbl td{padding:5px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px}.ubx-tbl tr.sel td{background:var(--sel)}.ubx-tbl tbody tr:hover td{background:var(--hover)}.ubx-tbl td.n{text-align:right;font-variant-numeric:tabular-nums}' +
      '.ubx-res{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:16px}.ubx-box{background:var(--card);border-radius:12px;padding:14px;box-shadow:0 0 0 1px var(--line)}.ubx-box h4{margin:0 0 8px;font-size:14px}.ubx-box canvas{width:100%;height:120px;display:block}.ubx-bar{height:10px;border-radius:9px;background:color-mix(in srgb,var(--win-fg) 12%,transparent);overflow:hidden;margin:6px 0}.ubx-bar i{display:block;height:100%;background:var(--acc);border-radius:9px}.ubx-kv{display:flex;justify-content:space-between;gap:10px;font-size:13px;color:var(--muted)}' +
      /* Configuración */
      '.ubx-set{display:flex;flex:1;min-height:0}.ubx-pg{flex:1;overflow:auto;padding:20px 22px;display:flex;flex-direction:column;gap:18px}.ubx-pg h3{margin:0;font-size:15px}.ubx-grp{background:var(--card);border-radius:12px;box-shadow:0 0 0 1px var(--line);overflow:hidden}.ubx-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;box-shadow:inset 0 -1px var(--line)}.ubx-row:last-child{box-shadow:none}.ubx-row span:last-child{color:var(--muted);text-align:right}' +
      '.ubx-styles{display:flex;gap:16px;flex-wrap:wrap}.ubx-sty{border:3px solid transparent;border-radius:14px;padding:0;cursor:pointer;background:none;display:flex;flex-direction:column;align-items:center;gap:6px;font-weight:500}.ubx-sty.on{border-color:var(--acc)}.ubx-sty i{display:block;width:150px;height:92px;border-radius:10px;background-size:cover;background-position:center;position:relative;overflow:hidden}' +
      '.ubx-sty i b{position:absolute;left:22%;top:24%;width:60%;height:58%;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.35)}.ubx-sty span{padding-bottom:6px}.ubx-acc{display:flex;gap:10px;flex-wrap:wrap}.ubx-acc button{width:30px;height:30px;border-radius:50%;border:3px solid transparent;cursor:pointer;padding:0}.ubx-acc button.on{border-color:var(--win-fg)}' +
      '.ubx-walls{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}.ubx-walls button{border:3px solid transparent;border-radius:12px;padding:0;cursor:pointer;height:92px;background-size:cover;background-position:center;position:relative}.ubx-walls button.on{border-color:var(--acc)}.ubx-walls button span{position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.55);color:#fff;border-radius:6px;padding:1px 7px;font-size:11.5px}' +
      '.ubx-about{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}.ubx-about svg{width:96px;height:96px}.ubx-about h2{margin:6px 0 0;font-size:22px}.ubx-about p{margin:0;color:var(--muted);max-width:440px;font-size:13px}' +
      /* Terminal */
      '.ubx-term{flex:1;min-height:0;background:#300a24;padding:4px 0 0 6px}.ubx-term .xterm{height:100%}.ubx-term .xterm-viewport{background:#300a24!important}' +
      /* Arranque y configuración inicial */
      '.ubx-boot{position:absolute;inset:0;z-index:9900;background:#000;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px}.ubx-boot svg{width:84px;height:84px}.ubx-spin{width:28px;height:28px;border-radius:50%;border:3px solid rgba(255,255,255,.2);border-top-color:#fff;animation:ubxsp .8s linear infinite}@keyframes ubxsp{to{transform:rotate(360deg)}}.ubx-boot small{opacity:.65;font-size:12px;max-width:80%;text-align:center}' +
      '.ubx-init{position:absolute;inset:0;z-index:9850;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}.ubx-initc{background:var(--win-bg);color:var(--win-fg);border-radius:16px;box-shadow:var(--shadow);width:min(520px,94%);max-height:94%;overflow:auto;padding:24px;display:flex;flex-direction:column;gap:14px}.ubx-initc h2{margin:0;font-size:22px}.ubx-initc p{margin:0;color:var(--muted);font-size:13px}' +
      '@media (max-width:640px){.ubx-dock{width:50px}.ubx-di{width:42px;height:42px;padding:4px}.ubx-di svg{width:34px;height:34px}.ubx-area,.ubx-ov{left:50px}.ubx-side{display:none}.ubx-clock{position:static;transform:none}.ubx-top .ubx-wsl{display:none}}';
    document.head.appendChild(st);
  }
  function enc(s) { return new TextEncoder().encode(s); }
  function b64enc(u8) { var s = '', CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
  function b64dec(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  var MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'], MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clockText(d) { return en() ? DAYS_EN[d.getDay()] + ' ' + MONTHS_EN[d.getMonth()] + ' ' + d.getDate() + '  ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : DAYS_ES[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_ES[d.getMonth()] + '  ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  var APPS = [
    { id: 'files', es: 'Archivos', en: 'Files', kw: 'archivos files carpetas folders nautilus explorador' },
    { id: 'term', es: 'Terminal', en: 'Terminal', kw: 'terminal consola shell bash comandos' },
    { id: 'edit', es: 'Editor de texto', en: 'Text Editor', kw: 'editor texto text notas gedit' },
    { id: 'mon', es: 'Monitor del sistema', en: 'System Monitor', kw: 'monitor procesos cpu memoria system' },
    { id: 'set', es: 'Configuración', en: 'Settings', kw: 'configuracion ajustes settings fondo tema oscuro' },
    { id: 'about', es: 'Acerca de', en: 'About', kw: 'acerca about sistema version ubuntu' }
  ];
  function appName(id) { for (var i = 0; i < APPS.length; i++) if (APPS[i].id === id) return T(APPS[i].es, APPS[i].en); return id; }

  window.renderSnakeVMApp = function (body) {
    css();
    var dead = false, emu = null, key = who(), rec = null, timers = [], ros = [];
    var root = document.createElement('div'); root.className = 'snkvm'; body.innerHTML = ''; body.appendChild(root);
    function msg(h) { root.innerHTML = '<div class="snkvm-pick">' + h + '</div>'; }
    function every(fn, ms) { var t = setInterval(fn, ms); timers.push(t); return t; }
    if (!key) { msg('<p>' + T('Inicia sesión en Snake OS para usar las máquinas virtuales.', 'Sign in to Snake OS to use virtual machines.') + '</p>'); return function () {}; }
    msg('<p>' + T('Cargando…', 'Loading…') + '</p>');
    get(key).then(function (r) {
      if (dead) return; rec = r;
      if (rec && backToUbuntu(rec)) { M.backUbuntu = true; if (rec.configured) put(key, rec).catch(function () {}); }
      if (rec && rec.os === 'ubuntu') start(); else pick();
    })
      .catch(function () { if (!dead) msg('<p>' + T('Este navegador no permite guardar la máquina (IndexedDB desactivado).', 'This browser cannot store the machine (IndexedDB is disabled).') + '</p>'); });

    function pick() {
      msg('<h3 style="margin:0">' + T('Máquinas virtuales', 'Virtual machines') + '</h3>' +
        '<button type="button" class="snkvm-card" data-os="ubuntu">' + MLOGO + '<span><b>' + T('Linux con escritorio estilo Ubuntu', 'Linux with an Ubuntu-style desktop') + '</b><br><small>' +
        T('Un Linux ligero de verdad (Buildroot + BusyBox) que funciona dentro de tu navegador, sin red, con un escritorio de Snake OS inspirado en Ubuntu 26.10: Terminal, Archivos, Editor de texto, Monitor del sistema y Configuración. No es Ubuntu.',
          'A real lightweight Linux (Buildroot + BusyBox) running inside your browser, offline, with a Snake OS desktop inspired by Ubuntu 26.10: Terminal, Files, Text Editor, System Monitor and Settings. It is not Ubuntu.') + '</small></span></button>' +
        '<p class="snkvm-note">' + T('Ábrela y ya está instalada, lista para configurar. Cuando la configures quedará fija en este perfil: no se podrá quitar ni cambiar.', 'Open it and it is already installed, ready to set up. Once you set it up it stays fixed on this profile: it cannot be removed or changed.') + '</p>');
      root.querySelector('[data-os]').onclick = function () { rec = { os: 'ubuntu', configured: false, created: Date.now() }; start(); };
    }

    /* ================= Escritorio ================= */
    var ui, top, desk, area, dock, bootEl, hostName = 'snake-ubuntu', sysInfo = {};
    function start() {
      rec.ui = rec.ui || { wall: 'ola', dark: false, acc: '#E95420' };
      if (rec.name) hostName = rec.name;
      root.innerHTML = '';
      ui = document.createElement('div'); ui.className = 'ubx'; ui.tabIndex = -1; root.appendChild(ui);
      ui.innerHTML = '<div class="ubx-desk"></div><div class="ubx-area"></div><div class="ubx-dock"></div>' +
        '<div class="ubx-top"><button type="button" data-t="act"><span class="ubx-ws"><i class="a"></i><i></i></span><span class="ubx-wsl">' + T('Actividades', 'Activities') + '</span></button>' +
        '<button type="button" class="ubx-clock" data-t="cal"></button><span class="ubx-sp"></span><button type="button" data-t="qs">' + SYM.net + SYM.vol + SYM.power + '</button></div>';
      top = ui.querySelector('.ubx-top'); desk = ui.querySelector('.ubx-desk'); area = ui.querySelector('.ubx-area'); dock = ui.querySelector('.ubx-dock');
      applyLook();
      buildDock();
      var hi = document.createElement('button'); hi.type = 'button'; hi.className = 'ubx-dicon'; hi.style.left = '14px'; hi.style.top = '12px';
      hi.innerHTML = IC.home + '<span>' + T('Carpeta personal', 'Home') + '</span>'; hi.ondblclick = function () { launch('files', { path: '/root' }); };
      hi.onkeydown = function (e) { if (e.key === 'Enter') launch('files', { path: '/root' }); };
      area.appendChild(hi);
      var tick = function () { var c = top.querySelector('.ubx-clock'); if (c) c.textContent = clockText(new Date()); };
      tick(); every(tick, 10000);
      top.querySelector('[data-t="act"]').onclick = function () { toggleOverview(false); };
      top.querySelector('[data-t="cal"]').onclick = function (e) { e.stopPropagation(); togglePop('cal'); };
      top.querySelector('[data-t="qs"]').onclick = function (e) { e.stopPropagation(); togglePop('qs'); };
      ui.addEventListener('pointerdown', function (e) {
        if (openPop && !e.target.closest('.ubx-pop') && !e.target.closest('.ubx-top>button')) closePop();
        if (ctxMenu && !e.target.closest('.ubx-menu')) closeMenu();
      }, true);
      ui.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { if (ctxMenu) closeMenu(); else if (openPop) closePop(); else if (ov) closeOverview(); }
      });
      if (window.ResizeObserver) { var ro = new ResizeObserver(function () { clampAll(); }); ro.observe(area); ros.push(ro); }
      bootEl = document.createElement('div'); bootEl.className = 'ubx-boot';
      bootEl.innerHTML = MLOGO + '<div class="ubx-spin"></div><span class="bt">' + T('Arrancando…', 'Starting…') + '</span><small>' + T('Linux ligero emulado en tu navegador · escritorio estilo Ubuntu de Snake OS', 'Lightweight Linux emulated in your browser · Snake OS Ubuntu-style desktop') + '</small>';
      ui.appendChild(bootEl);
      startMachine();
    }
    function bootText(t) { if (bootEl) bootEl.querySelector('.bt').textContent = t; }
    function hideBoot() { if (bootEl) { bootEl.remove(); bootEl = null; } }
    function applyLook() {
      if (!ui) return;
      var u = rec.ui; ui.classList.toggle('dark', !!u.dark);
      ui.style.setProperty('--acc', u.acc || '#E95420');
      desk.style.backgroundImage = svgUrl((WALLS[u.wall] || WALLS.ola).svg);
    }
    var lookT = null;
    function saveLook() { applyLook(); if (!rec.configured) return; clearTimeout(lookT); lookT = setTimeout(function () { put(key, rec).catch(function () {}); }, 600); }

    /* ---------- Dock ---------- */
    function buildDock() {
      dock.innerHTML = '';
      ['files', 'term', 'edit', 'mon', 'set'].forEach(function (id) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'ubx-di'; b.dataset.app = id; b.title = appName(id);
        b.innerHTML = IC[id] + '<span class="dots"></span>'; b.onclick = function () { dockClick(id); };
        dock.appendChild(b);
      });
      var sp = document.createElement('div'); sp.className = 'ubx-dsp'; dock.appendChild(sp);
      var g = document.createElement('button'); g.type = 'button'; g.className = 'ubx-di'; g.title = T('Mostrar aplicaciones', 'Show Apps'); g.innerHTML = IC.grid;
      g.onclick = function () { toggleOverview(true); }; dock.appendChild(g);
    }
    function updateDock() {
      if (!dock) return;
      dock.querySelectorAll('[data-app]').forEach(function (b) {
        var n = W.filter(function (w) { return w.app === b.dataset.app || (b.dataset.app === 'set' && w.app === 'about'); }).length;
        b.querySelector('.dots').innerHTML = n ? new Array(Math.min(n, 3) + 1).join('<i></i>') : '';
        b.classList.toggle('on', !!(active && (active.app === b.dataset.app)));
      });
    }
    function dockClick(id) {
      closeOverview();
      var ws = W.filter(function (w) { return w.app === id; });
      if (!ws.length) return launch(id);
      var vis = ws.filter(function (w) { return !w.min; });
      if (active && active.app === id && !active.min) {
        if (ws.length > 1) { var i = ws.indexOf(active); return focusWin(ws[(i + 1) % ws.length]); }
        return minimize(active);
      }
      focusWin(vis.length ? vis[vis.length - 1] : ws[ws.length - 1]);
    }
    function launch(id, opt) {
      closeOverview(); opt = opt || {};
      if (id === 'files') return openFiles(opt.path || '/root');
      if (id === 'term') return openTerm(opt.cwd, opt.run);
      if (id === 'edit') return openEditor(opt.path);
      if (id === 'mon') return single('mon') || openMon();
      if (id === 'set') return single('set', opt.page) || openSettings(opt.page);
      if (id === 'about') return single('set', 'about') || openSettings('about');
    }
    function single(app, page) { for (var i = 0; i < W.length; i++) if (W[i].app === app) { focusWin(W[i]); if (page && W[i].page) W[i].page(page); return W[i]; } return null; }

    /* ---------- Ventanas ---------- */
    var W = [], active = null, zTop = 10, cascade = 0;
    function createWin(app, o) {
      var aw = area.clientWidth || 800, ah = area.clientHeight || 520;
      var w = Math.min(o.w || 640, aw - 20), h = Math.min(o.h || 420, ah - 16);
      var x = Math.max(6, Math.round((aw - w) / 2) + (cascade % 5) * 26 - 40), y = Math.max(6, Math.round((ah - h) / 2.6) + (cascade % 5) * 22 - 30);
      cascade++;
      var el = document.createElement('div'); el.className = 'ubx-win'; el.dataset.app = app;
      el.style.cssText = 'left:' + Math.max(4, Math.min(x, aw - w - 4)) + 'px;top:' + Math.max(4, Math.min(y, ah - h - 4)) + 'px;width:' + w + 'px;height:' + h + 'px';
      el.innerHTML = '<div class="ubx-hb"><div class="l"></div><div class="ttl"></div><div class="r"><span class="rx" style="display:flex;gap:6px;align-items:center"></span>' +
        '<button type="button" class="ubx-wc" data-w="min" title="' + T('Minimizar', 'Minimize') + '">' + SYM.min + '</button>' +
        '<button type="button" class="ubx-wc" data-w="max" title="' + T('Maximizar', 'Maximize') + '">' + SYM.max + '</button>' +
        '<button type="button" class="ubx-wc x" data-w="close" title="' + T('Cerrar', 'Close') + '">' + SYM.close + '</button></div></div><div class="ubx-wb"></div>' +
        ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(function (d) { return '<div class="ubx-rz ' + d + '" data-rz="' + d + '"></div>'; }).join('');
      area.appendChild(el);
      var win = { app: app, el: el, body: el.querySelector('.ubx-wb'), hbL: el.querySelector('.ubx-hb .l'), hbR: el.querySelector('.ubx-hb .rx'), hb: el.querySelector('.ubx-hb'), min: false, onclose: null, onresize: null, onfocus: null,
        setTitle: function (t) { el.querySelector('.ttl').textContent = t; win.title = t; } };
      win.setTitle(o.title || appName(app));
      el.querySelector('[data-w="min"]').onclick = function () { minimize(win); };
      el.querySelector('[data-w="max"]').onclick = function () { toggleMax(win); };
      el.querySelector('[data-w="close"]').onclick = function () { closeWin(win); };
      el.addEventListener('pointerdown', function () { if (active !== win) focusWin(win); }, true);
      var hb = win.hb;
      hb.addEventListener('dblclick', function (e) { if (!e.target.closest('button,input,.ubx-path,.ubx-tabs')) toggleMax(win); });
      hb.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || e.target.closest('button,input,select,.ubx-path,.ubx-tabs')) return;
        e.preventDefault();
        var sx = e.clientX, sy = e.clientY, r0 = { l: el.offsetLeft, t: el.offsetTop }, moved = false;
        hb.setPointerCapture(e.pointerId);
        var mv = function (ev) {
          var dx = ev.clientX - sx, dy = ev.clientY - sy;
          if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
          if (!moved && el.classList.contains('max')) { el.classList.remove('max'); var ww = el.offsetWidth; r0.l = Math.round(sx - area.getBoundingClientRect().left - ww / 2); r0.t = 0; }
          moved = true;
          var aw2 = area.clientWidth, ah2 = area.clientHeight;
          el.style.left = Math.max(-el.offsetWidth + 90, Math.min(aw2 - 90, r0.l + dx)) + 'px';
          el.style.top = Math.max(0, Math.min(ah2 - 46, r0.t + dy)) + 'px';
        };
        var up = function () { hb.removeEventListener('pointermove', mv); hb.removeEventListener('pointerup', up); hb.removeEventListener('pointercancel', up); if (moved && el.offsetTop <= 0 && false) toggleMax(win); };
        hb.addEventListener('pointermove', mv); hb.addEventListener('pointerup', up); hb.addEventListener('pointercancel', up);
      });
      el.querySelectorAll('[data-rz]').forEach(function (h) {
        h.addEventListener('pointerdown', function (e) {
          if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
          var d = h.dataset.rz, sx = e.clientX, sy = e.clientY, r = { l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
          h.setPointerCapture(e.pointerId);
          var mw = 280, mh = 180;
          var mv = function (ev) {
            var dx = ev.clientX - sx, dy = ev.clientY - sy, l = r.l, t = r.t, w2 = r.w, h2 = r.h;
            if (d.indexOf('e') >= 0) w2 = Math.max(mw, r.w + dx);
            if (d.indexOf('s') >= 0) h2 = Math.max(mh, r.h + dy);
            if (d.indexOf('w') >= 0) { w2 = Math.max(mw, r.w - dx); l = r.l + (r.w - w2); }
            if (d.indexOf('n') >= 0) { h2 = Math.max(mh, r.h - dy); t = Math.max(0, r.t + (r.h - h2)); if (t === 0) h2 = r.t + r.h; }
            el.style.left = l + 'px'; el.style.top = t + 'px'; el.style.width = w2 + 'px'; el.style.height = h2 + 'px';
            if (win.onresize) win.onresize();
          };
          var up = function () { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); if (win.onresize) win.onresize(); };
          h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
        });
      });
      W.push(win); focusWin(win);
      return win;
    }
    function focusWin(win) {
      if (!win || dead) return;
      if (win.min) { win.min = false; win.el.classList.remove('minz'); }
      W.forEach(function (w) { w.el.classList.toggle('act', w === win); });
      win.el.style.zIndex = ++zTop; active = win; W.splice(W.indexOf(win), 1); W.push(win);
      updateDock(); if (win.onfocus) win.onfocus();
    }
    function minimize(win) {
      win.min = true; win.el.classList.add('minz'); win.el.classList.remove('act');
      var vis = W.filter(function (w) { return !w.min; }); active = null;
      if (vis.length) focusWin(vis[vis.length - 1]); else updateDock();
    }
    function toggleMax(win) { win.el.classList.toggle('max'); if (win.onresize) setTimeout(win.onresize, 30); }
    function closeWin(win, force) {
      if (!force && win.onclose && win.onclose() === false) return;
      var i = W.indexOf(win); if (i >= 0) W.splice(i, 1);
      win.el.remove(); if (win.ondestroy) try { win.ondestroy(); } catch (e) {}
      if (active === win) { active = null; var vis = W.filter(function (w) { return !w.min; }); if (vis.length) focusWin(vis[vis.length - 1]); }
      updateDock();
    }
    function clampAll() {
      var aw = area.clientWidth, ah = area.clientHeight; if (!aw) return;
      W.forEach(function (w) {
        var el = w.el;
        if (el.offsetWidth > aw) el.style.width = Math.max(280, aw - 8) + 'px';
        if (el.offsetHeight > ah) el.style.height = Math.max(180, ah - 8) + 'px';
        if (el.offsetLeft > aw - 90) el.style.left = Math.max(0, aw - el.offsetWidth - 4) + 'px';
        if (el.offsetTop > ah - 46) el.style.top = Math.max(0, ah - el.offsetHeight - 4) + 'px';
        if (w.onresize) w.onresize();
      });
    }

    /* ---------- Actividades / cuadrícula ---------- */
    var ov = null;
    function closeOverview() { if (ov) { ov.remove(); ov = null; top.querySelector('[data-t="act"]').classList.remove('on'); } }
    function toggleOverview(gridOnly) {
      if (ov) return closeOverview();
      closePop();
      ov = document.createElement('div'); ov.className = 'ubx-ov';
      ov.innerHTML = '<label class="ubx-srch">' + SYM.search + '<input type="text" placeholder="' + T('Escribe para buscar', 'Type to search') + '"></label><div class="ubx-wins"></div><div class="ubx-apps"></div><div class="ubx-ovh"></div>';
      ui.appendChild(ov); top.querySelector('[data-t="act"]').classList.add('on');
      var wins = ov.querySelector('.ubx-wins'), apps = ov.querySelector('.ubx-apps'), inp = ov.querySelector('input');
      if (!gridOnly) W.slice().reverse().forEach(function (w) {
        var c = document.createElement('button'); c.type = 'button'; c.className = 'ubx-wcard';
        c.innerHTML = (IC[w.app] || IC.set) + '<span>' + esc(w.title || appName(w.app)) + '</span>'; c.onclick = function () { closeOverview(); focusWin(w); };
        wins.appendChild(c);
      });
      var draw = function () {
        var s = inp.value.trim().toLowerCase(); apps.innerHTML = '';
        APPS.filter(function (a) { return !s || (a.es + ' ' + a.en + ' ' + a.kw).toLowerCase().indexOf(s) >= 0; }).forEach(function (a, i) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'ubx-app' + (s && i === 0 ? ' hl' : ''); b.dataset.app = a.id;
          b.innerHTML = (IC[a.id] || IC.about) + '<span>' + esc(T(a.es, a.en)) + '</span>'; b.onclick = function () { launch(a.id); };
          apps.appendChild(b);
        });
        wins.style.display = s ? 'none' : '';
      };
      draw(); inp.oninput = draw;
      inp.onkeydown = function (e) { if (e.key === 'Enter') { var f = apps.querySelector('.ubx-app'); if (f) f.click(); } };
      ov.querySelector('.ubx-ovh').textContent = T('Linux con escritorio estilo Ubuntu · no es Ubuntu', 'Linux with an Ubuntu-style desktop · not Ubuntu');
      ov.addEventListener('click', function (e) { if (e.target === ov || e.target.classList.contains('ubx-apps') || e.target.classList.contains('ubx-wins')) closeOverview(); });
      setTimeout(function () { try { inp.focus(); } catch (e) {} }, 30);
    }

    /* ---------- Menús del panel ---------- */
    var openPop = null, openPopKind = '';
    function closePop() { if (openPop) { openPop.remove(); openPop = null; top.querySelectorAll('.on').forEach(function (b) { if (b.dataset.t !== 'act' || !ov) b.classList.remove('on'); }); openPopKind = ''; } }
    function togglePop(kind) {
      var was = openPopKind; closePop(); if (was === kind) return;
      closeOverview();
      var p = document.createElement('div'); p.className = 'ubx-pop ' + (kind === 'qs' ? 'ubx-qs' : 'ubx-cal');
      if (kind === 'cal') {
        var d = new Date(), y = d.getFullYear(), m = d.getMonth(), first = new Date(y, m, 1), off = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
        var full = d.toLocaleDateString(en() ? 'en-GB' : 'es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        var h = '<h4>' + esc(full.charAt(0).toUpperCase() + full.slice(1)) + '</h4><h3>' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '</h3><div class="ubx-calg">';
        (en() ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['L', 'M', 'X', 'J', 'V', 'S', 'D']).forEach(function (x) { h += '<b>' + x + '</b>'; });
        var prevDays = new Date(y, m, 0).getDate();
        for (var i = 0; i < off; i++) h += '<span class="o">' + (prevDays - off + 1 + i) + '</span>';
        for (var k = 1; k <= days; k++) h += '<span' + (k === d.getDate() ? ' class="t"' : '') + '>' + k + '</span>';
        p.innerHTML = h + '</div>';
      } else {
        p.innerHTML = '<div class="ubx-qsr"><button type="button" data-q="save" title="' + T('Guardar estado ahora', 'Save state now') + '">' + SYM.save + '</button><button type="button" data-q="set" title="' + T('Configuración', 'Settings') + '">' + SYM.gear + '</button><button type="button" data-q="restart" title="' + T('Reiniciar la máquina', 'Restart the machine') + '">' + SYM.restart + '</button></div>' +
          '<div class="ubx-qsg"><button type="button" class="ubx-tile" disabled>' + SYM.net + '<span>' + T('Red', 'Network') + '<small>' + T('Sin conexión', 'Offline') + '</small></span></button>' +
          '<button type="button" class="ubx-tile' + (rec.ui.dark ? ' on' : '') + '" data-q="dark">' + SYM.moon + '<span>' + T('Estilo oscuro', 'Dark Style') + '</span></button>' +
          '<button type="button" class="ubx-tile" disabled>' + SYM.vol + '<span>' + T('Sonido', 'Sound') + '<small>' + T('Sin audio', 'No audio') + '</small></span></button>' +
          '<button type="button" class="ubx-tile" data-q="about">' + SYM.info + '<span>' + T('Acerca de', 'About') + '</span></button></div>' +
          '<div class="ubx-qsi">' + esc(hostName) + ' · ' + T('Linux ligero en tu navegador', 'Lightweight Linux in your browser') + (rec.savedAt ? ' · ' + T('guardado ', 'saved ') + new Date(rec.savedAt).toLocaleTimeString(en() ? 'en-GB' : 'es-ES', { hour: '2-digit', minute: '2-digit' }) : '') + '</div>';
        p.querySelector('[data-q="save"]').onclick = function () { closePop(); saveState(true); };
        p.querySelector('[data-q="set"]').onclick = function () { closePop(); launch('set'); };
        p.querySelector('[data-q="about"]').onclick = function () { closePop(); launch('about'); };
        p.querySelector('[data-q="restart"]').onclick = function () { closePop(); askRestart(); };
        p.querySelector('[data-q="dark"]').onclick = function () { rec.ui.dark = !rec.ui.dark; saveLook(); this.classList.toggle('on', rec.ui.dark); refreshSettings(); };
      }
      ui.appendChild(p); openPop = p; openPopKind = kind;
      top.querySelector('[data-t="' + kind + '"]').classList.add('on');
    }

    /* ---------- Diálogos, avisos, menús ---------- */
    var toastT = null;
    function toast(t) {
      if (!ui) return; var old = ui.querySelector('.ubx-toast'); if (old) old.remove();
      var d = document.createElement('div'); d.className = 'ubx-toast'; d.textContent = t; ui.appendChild(d);
      clearTimeout(toastT); toastT = setTimeout(function () { d.remove(); }, 3200);
    }
    function dialog(title, text, buttons, inputVal) {
      return new Promise(function (res) {
        var b = document.createElement('div'); b.className = 'ubx-back';
        b.innerHTML = '<div class="ubx-dlg"><h3></h3>' + (text ? '<p></p>' : '') + (inputVal != null ? '<input class="ubx-in" type="text">' : '') + '<div class="bt"></div></div>';
        b.querySelector('h3').textContent = title; if (text) b.querySelector('p').textContent = text;
        var inp = b.querySelector('input'); if (inp) inp.value = inputVal;
        var bt = b.querySelector('.bt');
        var done = function (v) { b.remove(); res(v); };
        buttons.forEach(function (x) {
          var e = document.createElement('button'); e.type = 'button'; e.className = 'ubx-btn ' + (x.cls || ''); e.textContent = x.label;
          e.onclick = function () { done(inp && x.value !== false && x.value !== null ? inp.value : x.value); }; bt.appendChild(e);
        });
        b.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); done(null); } if (e.key === 'Enter' && inp) { var s = buttons.filter(function (x) { return x.cls && x.cls.indexOf('sug') >= 0; })[0]; if (s) done(inp.value); } });
        ui.appendChild(b);
        setTimeout(function () { if (inp) { inp.focus(); var dot = inp.value.lastIndexOf('.'); inp.setSelectionRange(0, dot > 0 ? dot : inp.value.length); } else { var l = bt.lastElementChild; if (l) l.focus(); } }, 20);
      });
    }
    function confirmDlg(title, text, ok, danger) { return dialog(title, text, [{ label: T('Cancelar', 'Cancel'), value: false }, { label: ok, value: true, cls: danger ? 'dest' : 'sug' }]).then(function (v) { return v === true; }); }
    function promptDlg(title, val, ok) { return dialog(title, '', [{ label: T('Cancelar', 'Cancel'), value: null }, { label: ok || T('Aceptar', 'OK'), value: true, cls: 'sug' }], val).then(function (v) { return typeof v === 'string' ? v : null; }); }
    var ctxMenu = null;
    function closeMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
    function menu(x, y, items) {
      closeMenu();
      var m = document.createElement('div'); m.className = 'ubx-menu';
      items.forEach(function (it) {
        if (it === '-') { m.appendChild(document.createElement('hr')); return; }
        var b = document.createElement('button'); b.type = 'button'; if (it.danger) b.className = 'dz';
        b.innerHTML = (it.icon ? SYM[it.icon] : '<svg viewBox="0 0 16 16"></svg>') + '<span></span>'; b.querySelector('span').textContent = it.label;
        b.onclick = function () { closeMenu(); it.fn(); }; m.appendChild(b);
      });
      ui.appendChild(m); ctxMenu = m;
      var r = ui.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
      m.style.left = Math.max(4, Math.min(x - r.left, r.width - mw - 4)) + 'px'; m.style.top = Math.max(32, Math.min(y - r.top, r.height - mh - 4)) + 'px';
    }

    /* ================= Máquina (v86) ================= */
    var M = { ready: false, legacy: false, s0: '' };
    var SINK = {};
    [0, 2, 3].forEach(function (p) { SINK[p] = { buf: [], len: 0, term: null, pend: [], t: null, spawned: p === 0 }; });
    function sinkByte(p, b) {
      var s = SINK[p];
      if (s.term) { s.pend.push(b); if (!s.t) s.t = setTimeout(function () { s.t = null; var u = new Uint8Array(s.pend); s.pend = []; try { s.term.write(u); } catch (e) {} }, 16); }
      else { s.buf.push(b); if (s.buf.length > 65536) s.buf.splice(0, s.buf.length - 65536); }
    }
    function resetSinks() { [0, 2, 3].forEach(function (p) { SINK[p].buf = []; SINK[p].spawned = p === 0; }); }
    var AG = { buf: '', ls: 0, cur: null, q: [], n: 0 };
    function agByte(b) {
      AG.buf += String.fromCharCode(b);
      if (b !== 10) return;
      var st = AG.ls; AG.ls = AG.buf.length;
      if (!AG.cur || AG.buf.charCodeAt(st) !== 64) return;
      var line = AG.buf.slice(st, AG.ls - 1), mk = '@@END:' + AG.cur.id + ':';
      if (line.indexOf(mk) !== 0) return;
      var c = AG.cur, rc = parseInt(line.slice(mk.length), 10), pay = AG.buf.slice(0, st), lp = pay.lastIndexOf('@@END:');
      if (lp >= 0) pay = pay.slice(pay.indexOf('\n', lp) + 1);
      AG.buf = ''; AG.ls = 0; clearTimeout(c.t); AG.cur = null;
      var bytes; try { bytes = b64dec(pay.replace(/[^A-Za-z0-9+\/=]/g, '')); } catch (e) { bytes = new Uint8Array(0); }
      c.res({ rc: rc, bytes: bytes, out: new TextDecoder().decode(bytes) }); agNext();
    }
    function agNext() {
      if (AG.cur || !AG.q.length) return;
      if (!emu || dead) { var x; while ((x = AG.q.shift())) x.rej(new Error('off')); return; }
      var c = AG.q.shift(); AG.cur = c; AG.buf = ''; AG.ls = 0;
      c.t = setTimeout(function () { if (AG.cur === c) { AG.cur = null; c.rej(new Error('timeout')); agNext(); } }, c.to);
      emu.serial_send_bytes(1, enc('( ' + c.cmd + ' ) </dev/null >/tmp/.snko 2>&1; r=$?; base64 /tmp/.snko; echo "@@E""ND:' + c.id + ':$r"\n'));
    }
    function run(cmd, to) { if (/[\r\n]/.test(cmd)) return Promise.reject(new Error('multiline')); return new Promise(function (res, rej) { AG.q.push({ cmd: cmd, id: ++AG.n, to: to || 15000, res: res, rej: rej }); agNext(); }); }
    function agReset() { var c = AG.cur; AG.cur = null; if (c) { clearTimeout(c.t); c.rej(new Error('reset')); } var x; while ((x = AG.q.shift())) x.rej(new Error('reset')); AG.buf = ''; AG.ls = 0; }
    function writeFile(path, u8) {
      var b = b64enc(u8), CH = 3000, p = run(': > /tmp/.snkw');
      for (var i = 0; i < b.length; i += CH) (function (ch) { p = p.then(function () { return run("printf %s '" + ch + "' >> /tmp/.snkw"); }); })(b.slice(i, i + CH));
      return p.then(function () { return run('base64 -d /tmp/.snkw > ' + q(path) + '; r=$?; rm -f /tmp/.snkw; exit $r', 60000); })
        .then(function (r) { if (r.rc) throw new Error(r.out.trim() || ('error ' + r.rc)); return r; });
    }
    function readFile(path, max) {
      return run('f=' + q(path) + '; [ -f "$f" ] || { echo NOFILE; exit 3; }; s=$(wc -c < "$f"); [ "$s" -le ' + (max || 524288) + ' ] || { echo BIG $s; exit 4; }; cat "$f"', 60000)
        .then(function (r) { if (r.rc === 3) throw new Error(T('No es un archivo', 'Not a file')); if (r.rc === 4) throw new Error(T('El archivo es demasiado grande para abrirlo aquí', 'The file is too big to open here')); if (r.rc) throw new Error(r.out.trim()); return r; });
    }
    function ping() { return run('echo pong', 1500).then(function (r) { return r.out.indexOf('pong') >= 0; }, function () { return false; }); }
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function waitFor(fn, ms) {
      var t0 = Date.now();
      return new Promise(function (res, rej) { (function lp() { if (dead) return rej(new Error('dead')); if (fn()) return res(); if (Date.now() - t0 > ms) return rej(new Error('timeout')); setTimeout(lp, 150); })(); });
    }
    var AGENT_BOOT = "pkill -f 'IFS= read -r l' 2>/dev/null; stty -F /dev/ttyS1 raw -echo; setsid sh -c 'while IFS= read -r l; do eval \"$l\"; done' </dev/ttyS1 >/dev/ttyS1 2>&1 & clear\n";
    function bootAgent(tries) {
      try { emu.keyboard_send_text(AGENT_BOOT); } catch (e) {}
      var n = 0;
      return (function lp() { return wait(600).then(ping).then(function (ok) { if (ok) return true; if (++n >= (tries || 12)) return false; if (n === 6) { try { emu.keyboard_send_text('\n' + AGENT_BOOT); } catch (e) {} } return lp(); }); })();
    }
    function makeEmu(state, legacy) {
      var opt = { wasm_path: BASE + 'v86.wasm?v=' + VER, memory_size: 64 * 1024 * 1024, vga_memory_size: 2 * 1024 * 1024,
        bios: { url: BASE + 'seabios.bin?v=' + VER }, vga_bios: { url: BASE + 'vgabios.bin?v=' + VER },
        bzimage: { url: BASE + 'linux-bzimage.bin?v=' + VER }, cmdline: legacy ? 'tsc=reliable mitigations=off random.trust_cpu=on' : CMDLINE,
        autostart: true, disable_speaker: true, disable_mouse: true };
      if (!legacy) { opt.uart1 = true; opt.uart2 = true; opt.uart3 = true; opt.filesystem = {}; }
      if (state) opt.initial_state = { buffer: state };
      var e = new window.V86(opt);
      try { e.keyboard_set_enabled(false); } catch (x) {}
      M.s0 = '';
      e.add_listener('serial0-output-byte', function (b) { if (e !== emu) return; M.s0 += String.fromCharCode(b); if (M.s0.length > 4096) M.s0 = M.s0.slice(-2048); if (M.mig) M.mig.push(b); sinkByte(0, b); });
      if (!legacy) {
        e.add_listener('serial1-output-byte', function (b) { if (e === emu) agByte(b); });
        e.add_listener('serial2-output-byte', function (b) { if (e === emu) sinkByte(2, b); });
        e.add_listener('serial3-output-byte', function (b) { if (e === emu) sinkByte(3, b); });
      }
      return e;
    }
    function onReady(e) { return new Promise(function (res) { e.add_listener('emulator-ready', function () { res(); }); }); }
    var SNKLS = "# Snake OS: ls que muestra tildes y ñ (el ls de BusyBox las cambia por ??)\nfor a in \"$@\"; do case \"$a\" in -*) exec ls --color=always \"$@\";; esac; done\n[ $# -eq 0 ] && set -- .\nW=$(stty size 2>/dev/null | cut -d' ' -f2); [ -n \"$W\" ] || W=80\nn=$#; first=1\nfor d in \"$@\"; do\n  if [ -d \"$d\" ]; then\n    [ $n -gt 1 ] && { [ $first -eq 1 ] || echo; echo \"$d:\"; }\n    first=0\n    ( cd \"$d\" 2>/dev/null && for f in *; do\n        [ -e \"$f\" ] || [ -L \"$f\" ] || continue\n        if [ -L \"$f\" ]; then printf '\\033[1;36m%s\\033[0m\\n' \"$f\"\n        elif [ -d \"$f\" ]; then printf '\\033[1;34m%s\\033[0m\\n' \"$f\"\n        elif [ -x \"$f\" ]; then printf '\\033[1;32m%s\\033[0m\\n' \"$f\"\n        else printf '%s\\n' \"$f\"; fi\n      done ) | awk -v W=\"$W\" '{ a[NR] = $0; v = $0; gsub(/\\033\\[[0-9;]*m/, \"\", v); n = 0; for (i = 1; i <= length(v); i++) { c = substr(v, i, 1); if (c < \"\\200\" || c >= \"\\300\") n++ } l[NR] = n; if (n > m) m = n }\n        END { if (!NR) exit; c = int(W / (m + 2)); if (c < 1) c = 1; r = int((NR + c - 1) / c);\n          for (i = 1; i <= r; i++) { s = \"\"; for (j = 0; j < c; j++) { k = i + j * r; if (k > NR) break; s = s a[k]; if (k + r <= NR) for (p = l[k]; p < m + 2; p++) s = s \" \" } print s } }'\n  elif [ -e \"$d\" ] || [ -L \"$d\" ]; then printf '%s\\n' \"$d\"\n  else echo \"ls: $d: No such file or directory\" >&2; fi\ndone\n";
    var PROFILE = "export LANG=C.UTF-8 LC_ALL=C.UTF-8; export PS1='\\[\\e[01;32m\\]\\u@\\h\\[\\e[00m\\]:\\[\\e[01;34m\\]\\w\\[\\e[00m\\]\\$ '; unalias ls 2>/dev/null; : snkls3; ls() { if [ -t 1 ] && [ -r /root/.snk-ls ]; then sh /root/.snk-ls \"$@\"; else command ls \"$@\"; fi; }; alias ll='ls -alF'";
    /* Textos de bienvenida que dejó el escritorio «Snake OS! Pro»: si el usuario no los cambió, vuelven al texto de Ubuntu */
    var PRO_README = {
      'Leeme.txt': 'Te damos la bienvenida a Snake OS! Pro.\n\nSnake OS! Pro es un sistema operativo de la familia Snake OS: un Linux ligero de verdad\n(Buildroot + BusyBox) que funciona dentro de tu navegador, con escritorio de Snake OS.\n\n- No tiene conexión a internet.\n- Todo se guarda en este navegador, en tu perfil.\n- Prueba en la Terminal: ls, cat, vi, ps, top, df, uname -a\n',
      'ReadMe.txt': 'Welcome to Snake OS! Pro.\n\nSnake OS! Pro is an operating system from the Snake OS family: a real lightweight Linux\n(Buildroot + BusyBox) running inside your browser, with a Snake OS desktop.\n\n- It has no internet connection.\n- Everything is saved in this browser, on your profile.\n- Try in the Terminal: ls, cat, vi, ps, top, df, uname -a\n'
    };
    var UB_README = {
      'Leeme.txt': 'Te damos la bienvenida a tu máquina virtual de Snake OS.\n\nEs un Linux ligero de verdad (Buildroot + BusyBox) que funciona dentro de tu navegador,\ncon un escritorio de Snake OS al estilo de Ubuntu 26.10. No es Ubuntu.\n\n- No tiene conexión a internet.\n- Todo se guarda en este navegador, en tu perfil.\n- Prueba en la Terminal: ls, cat, vi, ps, top, df, uname -a\n',
      'ReadMe.txt': 'Welcome to your Snake OS virtual machine.\n\nIt is a real lightweight Linux (Buildroot + BusyBox) running inside your browser,\nwith a Snake OS desktop styled like Ubuntu 26.10. It is not Ubuntu.\n\n- It has no internet connection.\n- Everything is saved in this browser, on your profile.\n- Try in the Terminal: ls, cat, vi, ps, top, df, uname -a\n'
    };
    function refreshReadme() {
      var p = Promise.resolve(), changed = false;
      Object.keys(PRO_README).forEach(function (f) {
        p = p.then(function () { return readFile('/root/' + f).then(function (r) { if (r.out === PRO_README[f]) { changed = true; return writeFile('/root/' + f, enc(UB_README[f])); } }, function () {}); });
      });
      return p.then(function () { return changed; });
    }
    /* Máquinas guardadas antes de 2026.14: su .profile no tenía UTF-8 (ls mostraba «??» en las tildes). Se actualiza sin tocar nada más */
    function upgradeProfile() {
      return run("grep -q 'snkls3' /root/.profile 2>/dev/null && [ -r /root/.snk-ls ] && echo OK").then(function (r) {
        if (r.out.indexOf('OK') >= 0) return false;
        return writeFile('/root/.snk-ls', enc(SNKLS)).then(function () { return writeFile('/root/.profile', enc(PROFILE + '\n')); }).then(function () {
          try { emu.serial0_send(' . /root/.profile; clear\n'); } catch (e) {}
          return wait(700).then(function () { if (!SINK[0].term) SINK[0].buf = []; return true; });
        });
      }).catch(function () { return false; });
    }
    function initGuest() {
      var dirs = en() ? ['Desktop', 'Documents', 'Downloads', 'Music', 'Pictures', 'Videos'] : ['Escritorio', 'Documentos', 'Descargas', 'Musica', 'Imagenes', 'Videos'];
      var readme = T('Te damos la bienvenida a tu máquina virtual de Snake OS.\n\nEs un Linux ligero de verdad (Buildroot + BusyBox) que funciona dentro de tu navegador,\ncon un escritorio de Snake OS al estilo de Ubuntu 26.10. No es Ubuntu.\n\n- No tiene conexión a internet.\n- Todo se guarda en este navegador, en tu perfil.\n- Prueba en la Terminal: ls, cat, vi, ps, top, df, uname -a\n',
        'Welcome to your Snake OS virtual machine.\n\nIt is a real lightweight Linux (Buildroot + BusyBox) running inside your browser,\nwith a Snake OS desktop styled like Ubuntu 26.10. It is not Ubuntu.\n\n- It has no internet connection.\n- Everything is saved in this browser, on your profile.\n- Try in the Terminal: ls, cat, vi, ps, top, df, uname -a\n');
      var f = T('Leeme.txt', 'ReadMe.txt');
      return run('cd /root && mkdir -p ' + dirs.map(q).join(' ') + '; [ -e ' + q(f) + ' ] && echo HAVE')
        .then(function (r) { return writeFile('/root/.snk-ls', enc(SNKLS)).then(function () { return writeFile('/root/.profile', enc(PROFILE + '\n')); }).then(function () { return r.out.indexOf('HAVE') < 0 ? writeFile('/root/' + f, enc(readme)) : null; }); })
        .then(function () { return run('hostname ' + q(hostName)); });
    }
    function primeTty0() {
      try { emu.serial0_send(' . /root/.profile; clear\n'); } catch (e) {}
      return wait(700).then(function () { SINK[0].buf = []; });
    }
    function sysProbe() {
      return run("uname -r; . /etc/os-release 2>/dev/null; echo \"$NAME $VERSION\"; busybox 2>/dev/null | head -1 | cut -d' ' -f2; awk '/MemTotal/{print $2}' /proc/meminfo; hostname").then(function (r) {
        var l = r.out.split('\n'); sysInfo = { kernel: l[0], os: l[1], bb: l[2], mem: +l[3] || 0 };
        if (l[4] && l[4] !== hostName && rec.configured) run('hostname ' + q(hostName)).catch(function () {});
      }).catch(function () {});
    }
    function startMachine() {
      var st = rec.state, legacy = st && rec.fmt !== FMT;
      bootText(st && !legacy ? T('Restaurando tu máquina…', 'Restoring your machine…') : T('Arrancando Linux…', 'Booting Linux…'));
      var t0 = performance.now();
      Promise.all([loadLib(), st ? (rec.gz ? gunzip(st) : Promise.resolve(st)) : null]).then(function (a) {
        if (dead) return;
        if (legacy) return migrate(a[1]);
        if (a[1]) {
          emu = makeEmu(a[1], false);
          return onReady(emu).then(function () { return wait(300); }).then(ping).then(function (ok) { return ok || bootAgent(10); }).then(function (ok) {
            if (!ok) toast(T('La terminal funciona, pero Archivos y el Monitor no han podido conectar.', 'The terminal works, but Files and the Monitor could not connect.'));
            return ok ? run('hostname ' + q(hostName)).catch(function () {}) : null;
          });
        }
        return freshBoot();
      }).then(function () {
        if (dead) return;
        M.ready = true; M.bootMs = Math.round(performance.now() - t0); window.__snkvmBootMs = M.bootMs;
        hideBoot(); sysProbe();
        if (!rec.configured) showSetup();
        if (M.migrated) { if (rec.configured) saveState(false); toast(T('Tu máquina ya tiene el escritorio nuevo; tus archivos de /root se han conservado.', 'Your machine now has the new desktop; your /root files were kept.')); }
        else if (M.backUbuntu) {
          toast(T('Tu máquina vuelve al escritorio estilo Ubuntu 26.10: el mismo Linux con todos tus archivos.', 'Your machine is back on the Ubuntu 26.10-style desktop: the same Linux with all your files.'));
          refreshReadme().catch(function () {}).then(upgradeProfile).then(function () { if (rec.configured) saveState(false); });
        }
        else if (M.ready && emu) upgradeProfile().then(function (ch) { if (ch && rec.configured) saveState(false); });
        else if (rec.legacyState) toast(T('No se han podido copiar los archivos de la versión anterior; se guardan aparte sin borrar.', 'Files from the previous version could not be copied; they are kept aside, not deleted.'));
        every(function () { if (rec.configured && !document.hidden) saveState(false); }, 120000);
      }).catch(function (e) {
        if (dead) return;
        bootText(T('No se ha podido arrancar la máquina', 'Could not start the machine') + (e && e.message ? ' (' + e.message + ')' : ''));
        var sp = bootEl && bootEl.querySelector('.ubx-spin'); if (sp) sp.remove();
      });
    }
    function freshBoot(restoreTar) {
      if (!emu) emu = makeEmu(null, false);
      return onReady(emu).then(function () { return waitFor(function () { return /[%#] $/.test(M.s0); }, 90000); })
        .then(function () { return bootAgent(14); })
        .then(function (ok) { if (!ok) throw new Error('agent'); return initGuest(); })
        .then(function () { return restoreTar && restoreTar.length ? writeFile('/tmp/.snkr.tar', restoreTar).then(function () { return run('tar xf /tmp/.snkr.tar -C /root; rm -f /tmp/.snkr.tar', 60000); }) : null; })
        .then(primeTty0);
    }
    /* Máquinas guardadas con la primera versión (consola de texto): se copian sus archivos de /root a la máquina nueva */
    function migrate(oldState) {
      bootText(T('Pasando tu máquina al escritorio nuevo…', 'Moving your machine to the new desktop…'));
      var old = makeEmu(oldState, true); emu = old; var tarBytes = null;
      return onReady(old).then(function () { return wait(800); }).then(function () {
        M.mig = null; old.serial0_send('\n'); return wait(400);
      }).then(function () {
        M.mig = []; old.serial0_send(' cd /root && find . -mindepth 1 -maxdepth 1 ! -name tests ! -name test.lua ! -name .ash_history -exec tar cf - {} + 2>/dev/null | base64; echo "@@MIG""END"\n');
        return waitFor(function () { return M.s0.indexOf('@@MIGEND') >= 0; }, 120000);
      }).then(function () {
        var s = String.fromCharCode.apply(null, []), parts = [], arr = M.mig; M.mig = null;
        for (var i = 0; i < arr.length; i += 8192) parts.push(String.fromCharCode.apply(null, arr.slice(i, i + 8192)));
        s = parts.join('');
        var a = s.indexOf('"@@MIG""END"'), b = s.lastIndexOf('@@MIGEND');
        var body = s.slice(s.indexOf('\n', a) + 1, b).replace(/[^A-Za-z0-9+\/=]/g, '');
        tarBytes = body ? b64dec(body) : new Uint8Array(0);
      }).catch(function () { rec.legacyState = oldState; }).then(function () {
        try { old.destroy(); } catch (e) {}
        emu = null; M.s0 = ''; resetSinks(); agReset();
        return freshBoot(tarBytes);
      }).then(function () { if (tarBytes) delete rec.legacyState; rec.fmt = FMT; M.migrated = !!tarBytes; });
    }
    var saving = null;
    function saveState(show) {
      if (!emu || !rec || !rec.configured || !M.ready) { if (show) toast(T('Configura la máquina primero.', 'Set up the machine first.')); return Promise.resolve(); }
      if (saving) return saving;
      saving = emu.save_state().then(gz).then(function (r) {
        rec.state = r.buf; rec.gz = r.gz; rec.fmt = FMT; rec.stateBytes = r.buf.byteLength; rec.savedAt = Date.now(); return put(key, rec);
      }).then(function () { if (show) toast(T('Estado guardado', 'State saved') + ' (' + fmtBytes(rec.stateBytes) + ')'); refreshSettings(); })
        .catch(function () { if (show) toast(T('No se ha podido guardar el estado', 'Could not save the state')); })
        .then(function () { saving = null; });
      return saving;
    }
    function askRestart() {
      confirmDlg(T('¿Reiniciar la máquina?', 'Restart the machine?'), T('Se cierran las apps y Linux arranca de nuevo. Tus archivos de la carpeta personal se conservan.', 'Apps close and Linux boots again. Files in your home folder are kept.'), T('Reiniciar', 'Restart'), false).then(function (ok) {
        if (!ok || !emu) return;
        W.slice().forEach(function (w) { closeWin(w, true); });
        bootEl = document.createElement('div'); bootEl.className = 'ubx-boot'; bootEl.innerHTML = MLOGO + '<div class="ubx-spin"></div><span class="bt"></span>'; ui.appendChild(bootEl);
        bootText(T('Guardando tus archivos…', 'Saving your files…')); M.ready = false;
        run('cd /root && find . -mindepth 1 -maxdepth 1 ! -name tests ! -name test.lua -exec tar cf - {} +', 120000).then(function (r) { return r.rc === 0 ? r.bytes : null; }, function () { return null; }).then(function (tar) {
          bootText(T('Reiniciando…', 'Restarting…')); agReset(); resetSinks(); M.s0 = '';
          try { emu.destroy(); } catch (e) {}
          emu = null;
          return freshBoot(tar);
        }).then(function () { M.ready = true; hideBoot(); sysProbe(); saveState(false); }, function () { bootText(T('No se ha podido reiniciar', 'Could not restart')); });
      });
    }
    function showSetup() {
      var d = document.createElement('div'); d.className = 'ubx-init';
      d.innerHTML = '<div class="ubx-initc"><div style="width:72px">' + MLOGO + '</div><h2>' + T('Te damos la bienvenida', 'Welcome') + '</h2>' +
        '<p>' + T('Esta máquina es un Linux ligero de verdad que funciona dentro de tu navegador, con un escritorio de Snake OS al estilo de Ubuntu 26.10. No es Ubuntu y no tiene red.', 'This machine is a real lightweight Linux running inside your browser, with a Snake OS desktop styled like Ubuntu 26.10. It is not Ubuntu and has no network.') + '</p>' +
        '<label style="display:flex;flex-direction:column;gap:6px;font-weight:700">' + T('Nombre del equipo', 'Computer name') + '<input class="ubx-in nm" maxlength="24"></label>' +
        '<div style="font-weight:700">' + T('Estilo', 'Style') + '</div><div class="ubx-styles"></div>' +
        '<p>' + T('Al configurarla queda fija en este perfil: no se podrá quitar ni cambiar.', 'Once set up it stays fixed on this profile: it cannot be removed or changed.') + '</p>' +
        '<div style="display:flex;justify-content:flex-end"><button type="button" class="ubx-btn sug go" style="height:38px;padding:0 18px">' + T('Configurar y fijar', 'Set up and lock') + '</button></div></div>';
      ui.appendChild(d);
      d.querySelector('.nm').value = rec.name || 'snake-ubuntu';
      styleCards(d.querySelector('.ubx-styles'));
      d.querySelector('.go').onclick = function () {
        var nm = (d.querySelector('.nm').value || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 24) || 'snake-ubuntu';
        hostName = nm; rec.configured = true; rec.name = nm; rec.configuredAt = Date.now(); rec.fmt = FMT;
        run('hostname ' + q(nm)).catch(function () {}).then(function () { d.remove(); return saveState(false); })
          .then(function () { toast(T('Máquina configurada y fijada en este perfil', 'Machine set up and locked on this profile')); });
      };
    }
    function styleCards(box) {
      box.innerHTML = '';
      [[false, T('Claro', 'Light')], [true, T('Oscuro', 'Dark')]].forEach(function (s) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'ubx-sty' + (!!rec.ui.dark === s[0] ? ' on' : '');
        b.innerHTML = '<i style="background-image:' + esc(svgUrl((WALLS[rec.ui.wall] || WALLS.ola).svg)) + '"><b style="background:' + (s[0] ? '#2a2a2a' : '#fafafa') + '"></b></i><span>' + s[1] + '</span>';
        b.onclick = function () { rec.ui.dark = s[0]; saveLook(); styleCards(box); }; box.appendChild(b);
      });
    }

    /* ================= Apps ================= */
    /* ---------- Snake OS VP Pro (solo con Pro activo en el perfil; sin Pro no cambia nada) ---------- */
    function isPro() { return !!(window.snkPro && window.snkPro.active && window.snkPro.active()); }
    var TERM0 = null;
    function proTerm(base) { if (!TERM0) TERM0 = base; var t = isPro() && window.snkPro.termTheme ? window.snkPro.termTheme() : null; return t ? Object.assign({}, base, t) : base; }
    function termBox(tm) { try { var box = tm.element && tm.element.parentNode; if (!box) return; var bg = (TERM0 ? proTerm(TERM0) : {}).background || '#300a24'; box.style.background = bg; var vp = box.querySelector('.xterm-viewport'); if (vp) vp.style.setProperty('background', bg, 'important'); } catch (e) {} }
    function applyTermStyle() { [0, 2, 3].forEach(function (p) { var tm = SINK[p].term; if (tm && TERM0) try { tm.options.theme = proTerm(TERM0); termBox(tm); } catch (e) {} }); }
    var SNAPK = key + '#pro-snap';
    function snapTake() {
      if (!isPro() || !emu || !M.ready || !rec.configured) return Promise.resolve(false);
      return emu.save_state().then(gz).then(function (r) { return put(SNAPK, { state: r.buf, gz: r.gz, fmt: FMT, bytes: r.buf.byteLength, at: Date.now(), name: hostName }); })
        .then(function () { toast(T('Instantánea Pro guardada', 'Pro snapshot saved')); refreshSettings(); return true; }, function () { toast(T('No se ha podido guardar la instantánea', 'Could not save the snapshot')); return false; });
    }
    function snapRestore() {
      if (!isPro() || !emu) return Promise.resolve(false);
      return get(SNAPK).then(function (sn) {
        if (!sn || sn.fmt !== FMT) { toast(T('No hay instantánea guardada', 'No snapshot saved')); return false; }
        return confirmDlg(T('¿Volver a la instantánea?', 'Go back to the snapshot?'), T('La máquina vuelve exactamente al punto de la instantánea (', 'The machine goes back exactly to the snapshot point (') + new Date(sn.at).toLocaleString(en() ? 'en-GB' : 'es-ES') + T('). Lo que hayas hecho después se pierde.', '). Anything done after it is lost.'), T('Volver', 'Go back'), true).then(function (ok) {
          if (!ok || !emu) return false;
          W.slice().forEach(function (w) { closeWin(w, true); });
          bootEl = document.createElement('div'); bootEl.className = 'ubx-boot'; bootEl.innerHTML = MLOGO + '<div class="ubx-spin"></div><span class="bt"></span>'; ui.appendChild(bootEl);
          bootText(T('Volviendo a la instantánea…', 'Going back to the snapshot…')); M.ready = false;
          agReset(); resetSinks(); M.s0 = '';
          try { emu.destroy(); } catch (e) {}
          emu = null;
          return (sn.gz ? gunzip(sn.state) : Promise.resolve(sn.state)).then(function (buf) {
            if (dead) return false;
            emu = makeEmu(buf, false);
            return onReady(emu).then(function () { return wait(300); }).then(ping).then(function (ok2) { return ok2 || bootAgent(10); }).then(function () {
              if (sn.name) hostName = sn.name;
              M.ready = true; hideBoot(); sysProbe(); return saveState(false);
            }).then(function () { toast(T('Has vuelto a la instantánea', 'Back at the snapshot')); return true; });
          }).catch(function () { bootText(T('No se ha podido restaurar la instantánea', 'Could not restore the snapshot')); return false; });
        });
      });
    }
    function snapDelete() { return put(SNAPK, null).then(function () { toast(T('Instantánea borrada', 'Snapshot deleted')); refreshSettings(); }); }
    window.__snkvmPro = { take: snapTake, restore: snapRestore, del: snapDelete, info: function () { return get(SNAPK); }, applyTerm: applyTermStyle };

    /* ---------- Terminal ---------- */
    function openTerm(cwd, runCmd) {
      var port = [0, 2, 3].filter(function (p) { return !SINK[p].term && !SINK[p].claimed; })[0];
      if (port == null) { var tw = W.filter(function (w) { return w.app === 'term'; }); if (tw.length) focusWin(tw[tw.length - 1]); toast(T('Puedes tener hasta 3 terminales abiertas.', 'You can have up to 3 terminals open.')); return; }
      var s = SINK[port]; s.claimed = true;
      var w = createWin('term', { w: 660, h: 410, title: 'root@' + hostName + ': ~' });
      var nb = document.createElement('button'); nb.type = 'button'; nb.className = 'ubx-btn flat ic'; nb.title = T('Nueva ventana', 'New window'); nb.innerHTML = SYM.plus; nb.onclick = function () { openTerm(); }; w.hbL.appendChild(nb);
      var box = document.createElement('div'); box.className = 'ubx-term'; w.body.appendChild(box);
      var term = null, fit = null, rsT = null;
      w.ondestroy = function () { s.claimed = false; s.term = null; if (term) try { term.dispose(); } catch (e) {} };
      w.onfocus = function () { if (term) setTimeout(function () { try { term.focus(); } catch (e) {} }, 0); };
      w.onresize = function () {
        if (!fit) return; clearTimeout(rsT);
        rsT = setTimeout(function () { try { fit.fit(); run('stty -F /dev/ttyS' + port + ' rows ' + term.rows + ' cols ' + term.cols).catch(function () {}); } catch (e) {} }, 120);
      };
      var ensure = port === 0 || s.spawned ? Promise.resolve() : run("n=0; for p in /proc/[0-9]*; do [ \"$(readlink $p/fd/0 2>/dev/null)\" = /dev/ttyS" + port + " ] && n=1; done; [ $n = 1 ] || { stty -F /dev/ttyS" + port + " sane; setsid -c sh -l </dev/ttyS" + port + " >/dev/ttyS" + port + " 2>&1 & }").then(function () { s.spawned = true; return wait(400); });
      Promise.all([loadXterm(), ensure]).then(function () {
        if (dead || W.indexOf(w) < 0) return;
        term = new window.Terminal({ fontFamily: "'SnkVMUbuntuMono','Ubuntu Mono',monospace", fontSize: 15, cursorBlink: true, allowProposedApi: false, scrollback: 3000,
          theme: proTerm({ background: '#300a24', foreground: '#ffffff', cursor: '#ffffff', cursorAccent: '#300a24', selectionBackground: 'rgba(255,255,255,0.3)',
            black: '#2e3436', red: '#cc0000', green: '#4e9a06', yellow: '#c4a000', blue: '#3465a4', magenta: '#75507b', cyan: '#06989a', white: '#d3d7cf',
            brightBlack: '#555753', brightRed: '#ef2929', brightGreen: '#8ae234', brightYellow: '#fce94f', brightBlue: '#729fcf', brightMagenta: '#ad7fa8', brightCyan: '#34e2e2', brightWhite: '#eeeeec' }) });
        var FA = window.FitAddon && (window.FitAddon.FitAddon || window.FitAddon);
        if (FA) { fit = new FA(); term.loadAddon(fit); }
        term.open(box); if (fit) try { fit.fit(); } catch (e) {}
        if (isPro()) termBox(term);
        var had = s.buf.length; if (had) term.write(new Uint8Array(s.buf)); s.buf = []; s.term = term;
        term.onData(function (d) { if (emu) emu.serial_send_bytes(port, enc(d)); });
        if (fit) run('stty -F /dev/ttyS' + port + ' rows ' + term.rows + ' cols ' + term.cols).catch(function () {});
        var pre = (cwd ? ' cd ' + q(cwd) + (runCmd ? ' && ' + runCmd : '') + '\n' : '') ;
        setTimeout(function () { if (emu) emu.serial_send_bytes(port, enc(pre || (had ? '' : '\n'))); }, 120);
        term.focus();
      }).catch(function () { box.innerHTML = '<p style="color:#fff;padding:12px">' + T('No se ha podido cargar la terminal.', 'Could not load the terminal.') + '</p>'; s.claimed = false; });
      return w;
    }

    /* ---------- Archivos ---------- */
    function parseLs(out) {
      var items = [];
      out.split('\n').forEach(function (l) {
        var parts = l.split('\t'); if (parts.length < 3) return;
        var name = parts.slice(2).join('\t'), isDir = parts[1] === 'd';
        var m = parts[0].match(/^([\w-]{10}\S*)\s+\d+\s+\S+\s+\S+\s+(\d+(?:,\s*\d+)?)\s+(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) ([+-]\d{4}) (.*)$/);
        if (!m || !name) return;
        var perm = m[1], target = '';
        if (perm[0] === 'l') { var k = m[5].indexOf(' -> '); if (k >= 0) target = m[5].slice(k + 4); }
        var type = isDir ? 'dir' : (perm[0] === '-' || perm[0] === 'l') ? 'file' : 'dev';
        var iso = m[3].replace(' ', 'T') + m[4].slice(0, 3) + ':' + m[4].slice(3);
        items.push({ name: name, type: type, link: perm[0] === 'l', target: target, size: /,/.test(m[2]) ? 0 : +m[2], perm: perm, exec: type === 'file' && /x/.test(perm.slice(1)), mtime: new Date(iso) });
      });
      items.sort(function (a, b) { return (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }); });
      return items;
    }
    function joinP(d, n) { return (d === '/' ? '' : d) + '/' + n; }
    function parentP(d) { if (d === '/') return '/'; var i = d.lastIndexOf('/'); return i <= 0 ? '/' : d.slice(0, i); }
    function iconFor(it) { if (it.type === 'dir') return IC.folder; if (it.type === 'dev') return IC.dev; if (it.exec) return IC.exec; return /\.(txt|md|sh|conf|cfg|ini|json|log|lua|py|js|c|h|html|css|csv|xml|ya?ml)$/i.test(it.name) || it.size < 65536 ? IC.text : IC.file; }
    function openFiles(path) {
      var w = createWin('files', { w: 760, h: 470, title: '' });
      w.hb.querySelector('.ttl').style.display = 'none';
      var S = { path: path || '/root', back: [], fwd: [], sel: null, hidden: false, items: [] };
      w.hbL.innerHTML = '<button type="button" class="ubx-btn flat ic" data-f="back" title="' + T('Atrás', 'Back') + '">' + SYM.back + '</button><button type="button" class="ubx-btn flat ic" data-f="fwd" title="' + T('Adelante', 'Forward') + '">' + SYM.fwd + '</button>';
      var pathEl = document.createElement('div'); pathEl.className = 'ubx-path'; w.hbL.appendChild(pathEl); w.hbL.style.flex = '1'; w.hbL.style.marginRight = '6px';
      w.hbR.innerHTML = '<button type="button" class="ubx-btn flat ic" data-f="new" title="' + T('Nueva carpeta', 'New Folder') + '">' + SYM.plus + '</button><button type="button" class="ubx-btn flat ic" data-f="menu" title="' + T('Menú', 'Menu') + '">' + SYM.menu + '</button>';
      w.body.innerHTML = '<div class="ubx-fm"><div class="ubx-side"></div><div class="ubx-main"><div class="ubx-grid" tabindex="0"></div><div class="ubx-stat"></div></div></div><input type="file" multiple style="display:none">';
      var side = w.body.querySelector('.ubx-side'), grid = w.body.querySelector('.ubx-grid'), stat = w.body.querySelector('.ubx-stat'), fileIn = w.body.querySelector('input[type=file]');
      var places = [['/root', T('Carpeta personal', 'Home'), 'home'], ['/', T('Sistema de archivos', 'File System'), 'root'], ['/tmp', T('Temporal', 'Temporary'), 'tmp'], ['/mnt', T('Compartida (9p)', 'Shared (9p)'), 'share'], ['/etc', T('Configuración (/etc)', 'Configuration (/etc)'), 'etc']];
      places.forEach(function (p) { var b = document.createElement('button'); b.type = 'button'; b.dataset.p = p[0]; b.innerHTML = mini(p[2]) + '<span>' + esc(p[1]) + '</span>'; b.onclick = function () { go(p[0]); }; side.appendChild(b); });
      w.hbL.querySelector('[data-f="back"]').onclick = function () { if (S.back.length) { S.fwd.push(S.path); load(S.back.pop()); } };
      w.hbL.querySelector('[data-f="fwd"]').onclick = function () { if (S.fwd.length) { S.back.push(S.path); load(S.fwd.pop()); } };
      w.hbR.querySelector('[data-f="new"]').onclick = function () { newFolder(); };
      w.hbR.querySelector('[data-f="menu"]').onclick = function (e) { var r = this.getBoundingClientRect(); bgMenu(r.right - 200, r.bottom + 4); e.stopPropagation(); };
      function go(p) { if (p === S.path) return load(p); S.back.push(S.path); S.fwd = []; load(p); }
      function crumbs() {
        pathEl.innerHTML = '';
        var segs = S.path === '/' ? [''] : S.path.split('/'), acc = '';
        segs.forEach(function (sg, i) {
          acc = i === 0 ? '/' : joinP(acc, sg);
          var label = i === 0 ? (S.path.indexOf('/root') === 0 ? null : '/') : sg;
          if (S.path.indexOf('/root') === 0 && i <= 1) { if (i === 0) return; label = T('Carpeta personal', 'Home'); }
          if (pathEl.childNodes.length) { var sl = document.createElement('i'); sl.textContent = '/'; pathEl.appendChild(sl); }
          var b = document.createElement('button'); b.type = 'button'; b.textContent = label; var tgt = acc; b.onclick = function () { go(tgt); };
          if (i === segs.length - 1) b.className = 'cur'; pathEl.appendChild(b);
        });
        pathEl.scrollLeft = 99999;
        w.hbL.querySelector('[data-f="back"]').disabled = !S.back.length; w.hbL.querySelector('[data-f="fwd"]').disabled = !S.fwd.length;
        side.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.p === S.path); });
        var nm = S.path === '/root' ? T('Carpeta personal', 'Home') : S.path === '/' ? '/' : S.path.slice(S.path.lastIndexOf('/') + 1);
        w.title = nm; updateDock();
      }
      function load(p) {
        S.path = p; S.sel = null; crumbs(); stat.textContent = T('Cargando…', 'Loading…');
        return run('cd ' + q(p) + ' && for f in .[!.]* ..?* *; do { [ -e "$f" ] || [ -L "$f" ]; } || continue; d=; [ -d "$f" ] && d=d; printf \'%s\\t%s\\t%s\\n\' "$(ls -ldn --full-time --color=never -- "$f")" "$d" "$f"; done', 30000).then(function (r) {
          if (r.rc) { S.items = []; grid.innerHTML = '<div class="ubx-empty">' + esc(T('No se puede abrir esta carpeta', 'This folder cannot be opened')) + '<br><small>' + esc(r.out.trim().split('\n')[0] || '') + '</small></div>'; stat.textContent = ''; return; }
          S.items = parseLs(r.out); draw();
        }).catch(function () { grid.innerHTML = '<div class="ubx-empty">' + T('La máquina no responde', 'The machine is not responding') + '</div>'; stat.textContent = ''; });
      }
      function draw() {
        grid.innerHTML = '';
        var list = S.items.filter(function (it) { return S.hidden || it.name.charAt(0) !== '.'; });
        if (!list.length) grid.innerHTML = '<div class="ubx-empty">' + T('La carpeta está vacía', 'Folder is empty') + '</div>';
        list.forEach(function (it) {
          var d = document.createElement('div'); d.className = 'ubx-it' + (it.name.charAt(0) === '.' ? ' hid' : '') + (S.sel === it.name ? ' sel' : ''); d.tabIndex = -1;
          d.innerHTML = iconFor(it) + '<span></span>' + (it.link ? '<span class="lk">↪ ' + esc(it.target) + '</span>' : '');
          d.querySelector('span').textContent = it.name;
          d.title = it.name + (it.type === 'file' ? ' · ' + fmtBytes(it.size) : '') + ' · ' + (isNaN(it.mtime) ? '' : it.mtime.toLocaleString());
          d.onclick = function () { S.sel = it.name; grid.querySelectorAll('.sel').forEach(function (x) { x.classList.remove('sel'); }); d.classList.add('sel'); status(); };
          d.ondblclick = function () { openItem(it); };
          d.oncontextmenu = function (e) { e.preventDefault(); e.stopPropagation(); d.onclick(); itemMenu(it, e.clientX, e.clientY); };
          grid.appendChild(d);
        });
        status();
      }
      function status() {
        var n = S.items.filter(function (it) { return S.hidden || it.name.charAt(0) !== '.'; }).length;
        var sel = S.sel && S.items.filter(function (x) { return x.name === S.sel; })[0];
        stat.textContent = n + ' ' + T(n === 1 ? 'elemento' : 'elementos', n === 1 ? 'item' : 'items') + (sel ? ' · «' + sel.name + '» ' + (sel.type === 'dir' ? T('carpeta', 'folder') : fmtBytes(sel.size)) : '') + ' · ' + S.path;
      }
      function openItem(it) {
        var p = joinP(S.path, it.name);
        if (it.type === 'dir') return go(p);
        if (it.type === 'dev') return toast(T('Es un dispositivo; no se puede abrir.', 'It is a device; it cannot be opened.'));
        if (it.exec && !/\.(txt|md|conf)$/i.test(it.name)) return launch('term', { cwd: S.path, run: './' + q(it.name) });
        launch('edit', { path: p });
      }
      function itemMenu(it, x, y) {
        var p = joinP(S.path, it.name), items = [{ label: T('Abrir', 'Open'), fn: function () { openItem(it); } }];
        if (it.type === 'file') {
          items.push({ label: T('Abrir con Editor de texto', 'Open With Text Editor'), icon: 'edit', fn: function () { launch('edit', { path: p }); } });
          if (it.exec) items.push({ label: T('Ejecutar en la terminal', 'Run in Terminal'), fn: function () { launch('term', { cwd: S.path, run: './' + q(it.name) }); } });
          items.push({ label: T('Descargar a mi ordenador', 'Download to my computer'), icon: 'dl', fn: function () { download(p, it.name); } });
        }
        if (it.type === 'dir') items.push({ label: T('Abrir en la terminal', 'Open in Terminal'), fn: function () { launch('term', { cwd: p }); } });
        items.push('-', { label: T('Renombrar…', 'Rename…'), icon: 'edit', fn: function () { rename(it); } }, { label: T('Eliminar', 'Delete'), icon: 'trash', danger: true, fn: function () { del(it); } });
        menu(x, y, items);
      }
      function bgMenu(x, y) {
        menu(x, y, [
          { label: T('Nueva carpeta…', 'New Folder…'), icon: 'plus', fn: newFolder },
          { label: T('Nuevo documento de texto…', 'New Text Document…'), icon: 'edit', fn: newDoc },
          { label: T('Subir desde mi ordenador…', 'Upload from my computer…'), icon: 'ul', fn: function () { fileIn.click(); } },
          '-',
          { label: T('Abrir en la terminal', 'Open in Terminal'), fn: function () { launch('term', { cwd: S.path }); } },
          { label: (S.hidden ? T('Ocultar archivos ocultos', 'Hide Hidden Files') : T('Mostrar archivos ocultos', 'Show Hidden Files')), fn: function () { S.hidden = !S.hidden; draw(); } },
          { label: T('Actualizar', 'Reload'), icon: 'refresh', fn: function () { load(S.path); } }
        ]);
      }
      grid.oncontextmenu = function (e) { if (e.target.closest('.ubx-it')) return; e.preventDefault(); bgMenu(e.clientX, e.clientY); };
      grid.onclick = function (e) { if (!e.target.closest('.ubx-it')) { S.sel = null; grid.querySelectorAll('.sel').forEach(function (x) { x.classList.remove('sel'); }); status(); } };
      grid.onkeydown = function (e) {
        var it = S.sel && S.items.filter(function (x) { return x.name === S.sel; })[0];
        if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) { e.preventDefault(); w.hbL.querySelector('[data-f="back"]').click(); }
        else if (it && e.key === 'Enter') openItem(it);
        else if (it && e.key === 'Delete') del(it);
        else if (it && e.key === 'F2') rename(it);
      };
      function check(r) { if (r.rc) { toast((r.out.trim().split('\n')[0] || T('No se ha podido hacer', 'It could not be done'))); } return load(S.path); }
      function newFolder() { promptDlg(T('Nueva carpeta', 'New Folder'), T('Carpeta sin título', 'Untitled Folder'), T('Crear', 'Create')).then(function (n) { n = (n || '').trim(); if (!n || /\//.test(n)) return; run('mkdir -- ' + q(joinP(S.path, n))).then(check); }); }
      function newDoc() { promptDlg(T('Nuevo documento', 'New Document'), T('Documento sin título.txt', 'Untitled Document.txt'), T('Crear', 'Create')).then(function (n) { n = (n || '').trim(); if (!n || /\//.test(n)) return; var p = joinP(S.path, n); run('[ -e ' + q(p) + ' ] || : > ' + q(p)).then(function (r) { check(r); launch('edit', { path: p }); }); }); }
      function rename(it) { promptDlg(T('Renombrar', 'Rename'), it.name, T('Renombrar', 'Rename')).then(function (n) { n = (n || '').trim(); if (!n || n === it.name || /\//.test(n)) return; run('[ ! -e ' + q(joinP(S.path, n)) + ' ] && mv -- ' + q(joinP(S.path, it.name)) + ' ' + q(joinP(S.path, n)) + ' || { echo ' + q(T('Ya existe un elemento con ese nombre', 'An item with that name already exists')) + '; exit 1; }').then(check); }); }
      function del(it) {
        confirmDlg(T('¿Eliminar «', 'Delete “') + it.name + T('» para siempre?', '” permanently?'), T('No hay papelera: no se podrá recuperar.', 'There is no trash: it cannot be recovered.'), T('Eliminar', 'Delete'), true).then(function (ok) { if (ok) run('rm -rf -- ' + q(joinP(S.path, it.name)), 60000).then(check); });
      }
      function download(p, name) {
        readFile(p, 8 * 1048576).then(function (r) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.bytes])); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000); })
          .catch(function (e) { toast(e.message); });
      }
      fileIn.onchange = function () {
        var fl = Array.prototype.slice.call(fileIn.files || []); fileIn.value = '';
        var p = Promise.resolve();
        fl.forEach(function (f) {
          p = p.then(function () {
            if (f.size > 4 * 1048576) { toast(T('«' + f.name + '» pesa más de 4 MB', '“' + f.name + '” is bigger than 4 MB')); return; }
            stat.textContent = T('Subiendo ', 'Uploading ') + f.name + '…';
            return f.arrayBuffer().then(function (b) { return writeFile(joinP(S.path, f.name.replace(/\//g, '_')), new Uint8Array(b)); }).catch(function (e) { toast(e.message); });
          });
        });
        p.then(function () { load(S.path); });
      };
      w.onfocus = function () { try { grid.focus({ preventScroll: true }); } catch (e) {} };
      load(S.path);
      return w;
    }

    /* ---------- Editor de texto ---------- */
    function openEditor(path) {
      if (path) { for (var i = 0; i < W.length; i++) if (W[i].app === 'edit' && W[i].path === path) { focusWin(W[i]); return W[i]; } }
      var w = createWin('edit', { w: 640, h: 440 });
      var E = { path: path || '', dirty: false };
      w.hbL.innerHTML = '<button type="button" class="ubx-btn" data-e="open">' + T('Abrir', 'Open') + '</button><button type="button" class="ubx-btn flat ic" data-e="new" title="' + T('Nuevo documento', 'New Document') + '">' + SYM.plus + '</button>';
      w.hbR.innerHTML = '<button type="button" class="ubx-btn" data-e="save">' + T('Guardar', 'Save') + '</button><button type="button" class="ubx-btn flat ic" data-e="menu">' + SYM.menu + '</button>';
      w.body.innerHTML = '<textarea class="ubx-ta" spellcheck="false" wrap="off"></textarea><div class="ubx-stat"><span class="ps"></span><span class="sp" style="flex:1"></span><span>UTF-8</span></div>';
      var ta = w.body.querySelector('textarea'), ps = w.body.querySelector('.ps');
      function title() { var n = E.path ? E.path.slice(E.path.lastIndexOf('/') + 1) : T('Documento sin título', 'Untitled Document'); w.setTitle((E.dirty ? '• ' : '') + n); w.path = E.path; w.hbR.querySelector('[data-e="save"]').classList.toggle('sug', E.dirty); updateDock(); }
      function pos() { var v = ta.value.slice(0, ta.selectionStart), ln = v.split('\n').length, col = v.length - v.lastIndexOf('\n'); ps.textContent = T('Lín ', 'Ln ') + ln + ', ' + T('Col ', 'Col ') + col + (E.path ? ' · ' + E.path : ''); }
      function open(p) {
        ta.disabled = true; ps.textContent = T('Abriendo…', 'Opening…');
        return readFile(p).then(function (r) {
          if (r.bytes.slice(0, 4096).indexOf(0) >= 0) throw new Error(T('Es un archivo binario; no se puede editar como texto.', 'It is a binary file; it cannot be edited as text.'));
          ta.value = r.out; E.path = p; E.dirty = false; title(); pos();
        }).catch(function (e) { toast(e.message); if (!E.path) { E.path = ''; } title(); }).then(function () { ta.disabled = false; ta.focus(); ta.setSelectionRange(0, 0); ta.scrollTop = 0; pos(); });
      }
      function save(as) {
        var p = E.path;
        var pp = (!p || as) ? promptDlg(T('Guardar como', 'Save As'), p || '/root/' + T('Documentos', 'Documents') + '/' + T('sin-titulo.txt', 'untitled.txt'), T('Guardar', 'Save')) : Promise.resolve(p);
        return pp.then(function (np) {
          np = (np || '').trim(); if (!np) return false; if (np.charAt(0) !== '/') np = '/root/' + np;
          ps.textContent = T('Guardando…', 'Saving…');
          return writeFile(np, enc(ta.value)).then(function () { E.path = np; E.dirty = false; title(); pos(); toast(T('Guardado: ', 'Saved: ') + np); return true; })
            .catch(function (e) { toast(T('No se ha podido guardar: ', 'Could not save: ') + e.message); pos(); return false; });
        });
      }
      ta.addEventListener('input', function () { if (!E.dirty) { E.dirty = true; title(); } pos(); });
      ta.addEventListener('click', pos); ta.addEventListener('keyup', pos);
      ta.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(e.shiftKey); }
        else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); var a = ta.selectionStart, b = ta.selectionEnd; ta.value = ta.value.slice(0, a) + '\t' + ta.value.slice(b); ta.selectionStart = ta.selectionEnd = a + 1; ta.dispatchEvent(new Event('input')); }
      });
      w.hbL.querySelector('[data-e="open"]').onclick = function () { promptDlg(T('Abrir archivo', 'Open File'), E.path ? parentP(E.path) + '/' : '/root/', T('Abrir', 'Open')).then(function (p) { p = (p || '').trim(); if (p) launch('edit', { path: p.charAt(0) === '/' ? p : '/root/' + p }); }); };
      w.hbL.querySelector('[data-e="new"]').onclick = function () { openEditor(); };
      w.hbR.querySelector('[data-e="save"]').onclick = function () { save(false); };
      w.hbR.querySelector('[data-e="menu"]').onclick = function (e) {
        var r = this.getBoundingClientRect(); e.stopPropagation();
        menu(r.right - 200, r.bottom + 4, [{ label: T('Guardar como…', 'Save As…'), icon: 'save', fn: function () { save(true); } },
          { label: T('Abrir carpeta en Archivos', 'Open Folder in Files'), fn: function () { launch('files', { path: E.path ? parentP(E.path) : '/root' }); } },
          { label: T('Recargar desde el disco', 'Reload from disk'), icon: 'refresh', fn: function () { if (E.path) open(E.path); } }]);
      };
      w.onclose = function () {
        if (!E.dirty) return true;
        dialog(T('¿Guardar los cambios?', 'Save changes?'), T('Si no los guardas, se perderán.', 'If you don’t save, changes will be lost.'), [{ label: T('Cancelar', 'Cancel'), value: null }, { label: T('Descartar', 'Discard'), value: 'discard', cls: 'dest' }, { label: T('Guardar', 'Save'), value: 'save', cls: 'sug' }])
          .then(function (v) { if (v === 'discard') closeWin(w, true); else if (v === 'save') save(false).then(function (ok) { if (ok) closeWin(w, true); }); });
        return false;
      };
      w.onfocus = function () { setTimeout(function () { try { ta.focus({ preventScroll: true }); } catch (e) {} }, 0); };
      title(); pos();
      if (E.path) open(E.path); else ta.focus();
      return w;
    }

    /* ---------- Monitor del sistema ---------- */
    function openMon() {
      var w = createWin('mon', { w: 720, h: 460 });
      var tabs = document.createElement('div'); tabs.className = 'ubx-tabs';
      tabs.innerHTML = '<button type="button" data-m="proc" class="on">' + T('Procesos', 'Processes') + '</button><button type="button" data-m="res">' + T('Recursos', 'Resources') + '</button><button type="button" data-m="fs">' + T('Sistemas de archivos', 'File Systems') + '</button>';
      w.hb.querySelector('.ttl').style.display = 'none'; w.hbL.appendChild(tabs); w.hbL.style.position = 'absolute'; w.hbL.style.left = '50%'; w.hbL.style.transform = 'translateX(-50%)';
      w.title = appName('mon');
      w.body.innerHTML = '<div class="pg" data-p="proc" style="display:flex;flex-direction:column;flex:1;min-height:0"><div class="ubx-tbl"><table><thead><tr><th data-k="cmd">' + T('Nombre del proceso', 'Process Name') + '</th><th data-k="user">' + T('Usuario', 'User') + '</th><th data-k="pid">PID</th><th data-k="vsz">' + T('Memoria', 'Memory') + '</th><th data-k="stat">' + T('Estado', 'State') + '</th></tr></thead><tbody></tbody></table></div>' +
        '<div class="ubx-stat" style="align-items:center"><span class="cnt" style="flex:1"></span><button type="button" class="ubx-btn dest kill" disabled style="height:30px">' + T('Finalizar proceso', 'End Process') + '</button></div></div>' +
        '<div class="pg ubx-res" data-p="res" style="display:none"><div class="ubx-box"><h4>' + T('Historial de la CPU', 'CPU History') + ' <span class="cpu" style="font-weight:400;opacity:.7"></span></h4><canvas></canvas></div>' +
        '<div class="ubx-box"><h4>' + T('Memoria', 'Memory') + '</h4><div class="ubx-bar"><i class="mb" style="width:0"></i></div><div class="ubx-kv"><span class="mt"></span><span class="mf"></span></div></div>' +
        '<div class="ubx-box"><h4>' + T('Sistema', 'System') + '</h4><div class="ubx-kv"><span>' + T('Tiempo encendida', 'Uptime') + '</span><span class="up"></span></div><div class="ubx-kv"><span>' + T('Carga media', 'Load average') + '</span><span class="la"></span></div><div class="ubx-kv"><span>' + T('Procesador', 'Processor') + '</span><span>x86 ' + T('emulado (v86)', 'emulated (v86)') + '</span></div></div></div>' +
        '<div class="pg ubx-tbl" data-p="fs" style="display:none"><table><thead><tr><th>' + T('Dispositivo', 'Device') + '</th><th>' + T('Directorio', 'Directory') + '</th><th>' + T('Tamaño', 'Size') + '</th><th>' + T('Disponible', 'Available') + '</th><th>' + T('Usado', 'Used') + '</th><th style="width:30%"></th></tr></thead><tbody></tbody></table></div>';
      var cur = 'proc', sel = null, sortK = 'pid', sortD = 1, agentPid = 0, prev = null, hist = [], procs = [], tm = null, busy = false;
      tabs.querySelectorAll('button').forEach(function (b) { b.onclick = function () { cur = b.dataset.m; tabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); w.body.querySelectorAll('.pg').forEach(function (p) { p.style.display = p.dataset.p === cur ? 'flex' : 'none'; }); if (cur === 'res') drawChart(); }; });
      w.body.querySelectorAll('th[data-k]').forEach(function (th) { th.style.cursor = 'pointer'; th.onclick = function () { if (sortK === th.dataset.k) sortD = -sortD; else { sortK = th.dataset.k; sortD = 1; } drawProcs(); }; });
      var killB = w.body.querySelector('.kill');
      killB.onclick = function () {
        var p = procs.filter(function (x) { return x.pid === sel; })[0]; if (!p) return;
        confirmDlg(T('¿Finalizar «', 'End “') + p.cmd + T('»?', '”?'), T('Los datos sin guardar de ese proceso se perderán.', 'Unsaved data in that process will be lost.'), T('Finalizar proceso', 'End Process'), true)
          .then(function (ok) { if (ok) run('kill ' + p.pid).then(function (r) { if (r.rc) toast(r.out.trim()); refresh(); }); });
      };
      function drawProcs() {
        var tb = w.body.querySelector('[data-p="proc"] tbody'), arr = procs.slice();
        arr.sort(function (a, b) { var x = a[sortK], y = b[sortK]; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * sortD; });
        tb.innerHTML = arr.map(function (p) { return '<tr data-pid="' + p.pid + '"' + (p.pid === sel ? ' class="sel"' : '') + '><td>' + esc(p.cmd) + '</td><td>' + esc(p.user) + '</td><td class="n">' + p.pid + '</td><td class="n">' + (p.vsz ? fmtBytes(p.vsz * 1024) : '—') + '</td><td>' + esc(p.stat) + '</td></tr>'; }).join('');
        tb.querySelectorAll('tr').forEach(function (tr) { tr.onclick = function () { sel = +tr.dataset.pid; drawProcs(); }; });
        var sp = procs.filter(function (x) { return x.pid === sel; })[0];
        killB.disabled = !sp || sp.pid === 1 || sp.pid === agentPid || sp.kern;
        w.body.querySelector('.cnt').textContent = procs.length + ' ' + T('procesos', 'processes');
      }
      function drawChart() {
        var cv = w.body.querySelector('canvas'); if (!cv || !cv.clientWidth) return;
        var dpr = window.devicePixelRatio || 1, W2 = cv.clientWidth * dpr, H2 = cv.clientHeight * dpr; cv.width = W2; cv.height = H2;
        var c = cv.getContext('2d'), acc = getComputedStyle(ui).getPropertyValue('--acc').trim() || '#E95420';
        c.clearRect(0, 0, W2, H2); c.strokeStyle = 'rgba(127,127,127,.25)'; c.lineWidth = 1;
        for (var i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(0, H2 * i / 4); c.lineTo(W2, H2 * i / 4); c.stroke(); }
        if (hist.length < 2) return;
        c.beginPath(); hist.forEach(function (v, k) { var x = W2 - (hist.length - 1 - k) * (W2 / 59), y = H2 - v / 100 * (H2 - 4) - 2; if (k) c.lineTo(x, y); else c.moveTo(x, y); });
        c.strokeStyle = acc; c.lineWidth = 2 * dpr; c.stroke(); c.lineTo(W2, H2); c.lineTo(W2 - (hist.length - 1) * (W2 / 59), H2); c.closePath(); c.globalAlpha = .18; c.fillStyle = acc; c.fill(); c.globalAlpha = 1;
      }
      function refresh() {
        if (busy || dead || W.indexOf(w) < 0 || w.min || !M.ready) return; busy = true;
        run('head -1 /proc/stat; echo @@; cat /proc/meminfo; echo @@; cat /proc/uptime /proc/loadavg; echo @@; ps -o pid,user,vsz,stat,args; echo @@; df -k; echo @@; echo $$').then(function (r) {
          var P = r.out.split('@@\n');
          var cpu = (P[0] || '').trim().split(/\s+/).slice(1).map(Number), tot = cpu.reduce(function (a, b) { return a + b; }, 0), idle = (cpu[3] || 0) + (cpu[4] || 0);
          if (prev) { var dt = tot - prev[0], di = idle - prev[1]; var pc = dt > 0 ? Math.max(0, Math.min(100, 100 * (1 - di / dt))) : 0; hist.push(pc); if (hist.length > 60) hist.shift(); w.body.querySelector('.cpu').textContent = '· CPU ' + pc.toFixed(0) + ' %'; }
          prev = [tot, idle];
          var mi = {}; (P[1] || '').split('\n').forEach(function (l) { var m = l.match(/^(\w+):\s+(\d+)/); if (m) mi[m[1]] = +m[2]; });
          var used = (mi.MemTotal || 0) - (mi.MemAvailable || mi.MemFree || 0);
          w.body.querySelector('.mb').style.width = (mi.MemTotal ? 100 * used / mi.MemTotal : 0).toFixed(1) + '%';
          w.body.querySelector('.mt').textContent = fmtBytes(used * 1024) + ' ' + T('de', 'of') + ' ' + fmtBytes((mi.MemTotal || 0) * 1024) + ' ' + T('en uso', 'in use');
          w.body.querySelector('.mf').textContent = fmtBytes((mi.MemAvailable || 0) * 1024) + ' ' + T('disponible', 'available');
          var u = (P[2] || '').split('\n'), secs = Math.floor(parseFloat(u[0]) || 0);
          w.body.querySelector('.up').textContent = (secs >= 3600 ? Math.floor(secs / 3600) + ' h ' : '') + Math.floor(secs % 3600 / 60) + ' min ' + (secs % 60) + ' s';
          w.body.querySelector('.la').textContent = (u[1] || '').split(' ').slice(0, 3).join('  ');
          procs = [];
          (P[3] || '').split('\n').slice(1).forEach(function (l) { var m = l.match(/^\s*(\d+)\s+(\S+)\s+(\d+[mg]?)\s+(\S+)\s+(.*)$/); if (!m) return; var v = m[3], vk = /m$/.test(v) ? parseInt(v, 10) * 1024 : /g$/.test(v) ? parseInt(v, 10) * 1048576 : +v; procs.push({ pid: +m[1], user: m[2], vsz: vk, stat: m[4], cmd: m[5], kern: /^\[.*\]$/.test(m[5]) }); });
          agentPid = +(P[5] || '').trim() || agentPid;
          drawProcs();
          var fsb = w.body.querySelector('[data-p="fs"] tbody');
          fsb.innerHTML = (P[4] || '').split('\n').slice(1).map(function (l) { var m = l.trim().split(/\s+/); if (m.length < 6) return ''; var pc = parseInt(m[4], 10) || 0; return '<tr><td>' + esc(m[0]) + '</td><td>' + esc(m[5]) + '</td><td class="n">' + fmtBytes(+m[1] * 1024) + '</td><td class="n">' + fmtBytes(+m[3] * 1024) + '</td><td class="n">' + fmtBytes(+m[2] * 1024) + ' (' + pc + ' %)</td><td><div class="ubx-bar" style="margin:0"><i style="width:' + pc + '%"></i></div></td></tr>'; }).join('');
          if (cur === 'res') drawChart();
        }).catch(function () {}).then(function () { busy = false; });
      }
      refresh(); tm = setInterval(refresh, 2000); timers.push(tm);
      w.onresize = function () { if (cur === 'res') drawChart(); };
      w.ondestroy = function () { clearInterval(tm); };
      return w;
    }

    /* ---------- Configuración ---------- */
    var setWin = null;
    function refreshSettings() { if (setWin && setWin.render) setWin.render(); }
    function openSettings(page) {
      var w = createWin('set', { w: 760, h: 500 }); setWin = w;
      w.body.innerHTML = '<div class="ubx-set"><div class="ubx-side"></div><div class="ubx-pg"></div></div>';
      var side = w.body.querySelector('.ubx-side'), pg = w.body.querySelector('.ubx-pg'), curP = page || 'look';
      [['look', T('Apariencia', 'Appearance'), 'gear'], ['wall', T('Fondo', 'Background'), 'root'], ['about', T('Acerca de', 'About'), 'info']].concat(isPro() ? [['pro', 'Pro', 'pro']] : []).forEach(function (p) {
        var b = document.createElement('button'); b.type = 'button'; b.dataset.p = p[0]; b.innerHTML = (p[2] === 'pro' ? '<span style="width:16px;text-align:center">⭐</span>' : (SYM[p[2]] || mini(p[2]))) + '<span>' + p[1] + '</span>'; b.onclick = function () { curP = p[0]; render(); }; side.appendChild(b);
      });
      function row(a, b) { return '<div class="ubx-row"><span>' + esc(a) + '</span><span>' + esc(b) + '</span></div>'; }
      function render() {
        side.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.p === curP); });
        if (curP === 'pro' && !isPro()) curP = 'look';
        w.setTitle(curP === 'about' ? T('Acerca de', 'About') : curP === 'wall' ? T('Fondo', 'Background') : curP === 'pro' ? 'Snake OS VP Pro' : T('Apariencia', 'Appearance'));
        if (curP === 'pro') {
          pg.innerHTML = '<h3>' + T('Estilo de terminal Pro', 'Pro terminal style') + '</h3><div class="ubx-tsty" style="display:flex;flex-wrap:wrap;gap:10px"></div>' +
            '<h3>' + T('Instantánea Pro', 'Pro snapshot') + '</h3><div class="ubx-grp"><div class="ubx-row"><span>' + T('Instantánea guardada', 'Saved snapshot') + '</span><span class="sinfo">…</span></div></div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="ubx-btn sug stake">' + T('Guardar instantánea', 'Save snapshot') + '</button><button type="button" class="ubx-btn srest">' + T('Volver a la instantánea', 'Go back to snapshot') + '</button><button type="button" class="ubx-btn dest sdel">' + T('Borrar', 'Delete') + '</button></div>' +
            '<p class="snkvm-note" style="margin:0">' + T('Una ranura por perfil, guardada en este navegador. Volver a ella deja la máquina exactamente como estaba.', 'One slot per profile, saved in this browser. Going back leaves the machine exactly as it was.') + '</p>';
          var ts = pg.querySelector('.ubx-tsty'), curS = window.snkPro.termStyle();
          [{ id: '', name: T('Normal', 'Default'), bg: '#300a24', fg: '#ffffff' }].concat(window.snkPro.termStyles()).forEach(function (x) {
            var b = document.createElement('button'); b.type = 'button'; b.className = 'ubx-btn' + (curS === x.id ? ' sug' : ''); b.dataset.ts = x.id;
            b.innerHTML = '<span style="display:inline-block;width:38px;height:22px;border-radius:5px;background:' + x.bg + ';color:' + x.fg + ';font:700 11px ui-monospace,monospace;line-height:22px;text-align:center;margin-right:6px">$_</span>' + esc(x.name);
            b.onclick = function () { window.snkPro.setTermStyle(x.id); applyTermStyle(); render(); }; ts.appendChild(b);
          });
          get(SNAPK).then(function (sn) {
            var si = pg.querySelector('.sinfo'); if (!si) return;
            si.textContent = sn && sn.at ? new Date(sn.at).toLocaleString(en() ? 'en-GB' : 'es-ES') + ' · ' + fmtBytes(sn.bytes || 0) : T('Ninguna', 'None');
            pg.querySelector('.srest').disabled = !(sn && sn.at); pg.querySelector('.sdel').disabled = !(sn && sn.at);
          });
          pg.querySelector('.stake').onclick = function () { snapTake(); };
          pg.querySelector('.srest').onclick = function () { snapRestore(); };
          pg.querySelector('.sdel').onclick = function () { snapDelete(); };
        } else if (curP === 'look') {
          pg.innerHTML = '<h3>' + T('Estilo', 'Style') + '</h3><div class="ubx-styles"></div><h3>' + T('Color', 'Color') + '</h3><div class="ubx-acc"></div>';
          styleCards(pg.querySelector('.ubx-styles'));
          var ac = pg.querySelector('.ubx-acc');
          ACCENTS.forEach(function (a) { var b = document.createElement('button'); b.type = 'button'; b.title = T(a[1], a[2]); b.style.background = a[0]; if ((rec.ui.acc || '#E95420') === a[0]) b.className = 'on'; b.onclick = function () { rec.ui.acc = a[0]; saveLook(); render(); }; ac.appendChild(b); });
        } else if (curP === 'wall') {
          pg.innerHTML = '<h3>' + T('Fondo de escritorio', 'Desktop background') + '</h3><div class="ubx-walls"></div><p class="snkvm-note" style="margin:0">' + T('Fondos originales de Snake OS.', 'Original Snake OS backgrounds.') + '</p>';
          var wl = pg.querySelector('.ubx-walls');
          Object.keys(WALLS).forEach(function (k) { var b = document.createElement('button'); b.type = 'button'; b.style.backgroundImage = svgUrl(WALLS[k].svg); if (rec.ui.wall === k) b.className = 'on'; b.innerHTML = '<span>' + esc(T(WALLS[k].es, WALLS[k].en)) + '</span>'; b.onclick = function () { rec.ui.wall = k; saveLook(); render(); }; wl.appendChild(b); });
        } else {
          pg.innerHTML = '<div class="ubx-about">' + MLOGO + '<h2>' + esc(hostName) + '</h2><b>Ubuntu 26.10 (' + T('estilo', 'style') + ')</b><p>' +
            T('Es el aspecto del escritorio, hecho por Snake OS. Por debajo funciona un Linux ligero de verdad (Buildroot + BusyBox) emulado en tu navegador: no es Ubuntu ni software de Canonical.', 'This is the desktop look, made by Snake OS. Underneath runs a real lightweight Linux (Buildroot + BusyBox) emulated in your browser: it is not Ubuntu or Canonical software.') + '</p></div>' +
            '<div class="ubx-grp">' + row(T('Nombre del equipo', 'Device name'), hostName) + row(T('Aspecto', 'Look'), 'Ubuntu 26.10 (' + T('estilo', 'style') + ') · Snake OS') +
            row(T('Sistema real', 'Actual system'), (sysInfo.os || 'Buildroot') + (sysInfo.bb ? ' · BusyBox ' + sysInfo.bb : '')) + row(T('Núcleo', 'Kernel'), 'Linux ' + (sysInfo.kernel || '')) +
            row(T('Memoria', 'Memory'), sysInfo.mem ? fmtBytes(sysInfo.mem * 1024) + ' ' + T('utilizables (64 MB emulados)', 'usable (64 MB emulated)') : '64 MB') + row(T('Procesador', 'Processor'), 'x86 ' + T('emulado con v86', 'emulated with v86')) +
            row(T('Red', 'Network'), T('Sin red', 'No network')) +
            row(T('Estado guardado (este navegador)', 'Saved state (this browser)'), rec.stateBytes ? fmtBytes(rec.stateBytes) + (rec.savedAt ? ' · ' + new Date(rec.savedAt).toLocaleString(en() ? 'en-GB' : 'es-ES') : '') : T('Aún no guardado', 'Not saved yet')) +
            row(T('Configurada', 'Set up'), rec.configured ? T('Sí · fija en este perfil', 'Yes · locked on this profile') : T('No', 'No')) + '</div>' +
            '<div class="ubx-grp">' + row('v86', 'BSD-2') + row('xterm.js', 'MIT') + row(T('Fuentes Ubuntu y Ubuntu Mono', 'Ubuntu and Ubuntu Mono fonts'), 'Ubuntu Font Licence 1.0') + row('Linux, BusyBox', 'GPLv2') + row(T('Iconos y fondos', 'Icons and backgrounds'), T('Originales de Snake OS', 'Original Snake OS artwork')) + '</div>';
        }
      }
      w.render = render; w.page = function (p) { curP = p; render(); };
      w.ondestroy = function () { if (setWin === w) setWin = null; };
      render();
      return w;
    }

    /* ---------- Cierre de la app ---------- */
    return function () {
      dead = true; timers.forEach(clearInterval); ros.forEach(function (r) { try { r.disconnect(); } catch (e) {} });
      W.slice().forEach(function (w) { try { if (w.ondestroy) w.ondestroy(); } catch (e) {} });
      agReset();
      var e = emu; emu = null;
      if (e) {
        var fin = function () { try { e.destroy(); } catch (x) {} };
        if (rec && rec.configured && M.ready) {
          e.save_state().then(gz).then(function (r) { rec.state = r.buf; rec.gz = r.gz; rec.fmt = FMT; rec.stateBytes = r.buf.byteLength; rec.savedAt = Date.now(); return put(key, rec); }).then(fin, fin);
        } else fin();
      }
    };
  };
})();
