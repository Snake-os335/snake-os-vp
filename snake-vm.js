/* Snake OS · Máquinas virtuales → «Snake OS! Pro» (2026.13)
   Snake OS! Pro es un sistema operativo propio de la familia Snake OS: un Linux ligero real (Buildroot 2024.05 + BusyBox 1.36,
   kernel 6.8) emulado con v86 en TU navegador, con un escritorio de Snake OS hecho en HTML/CSS/JS (barra de tareas de cristal,
   menú Inicio, ventanas). Dibujos, logotipo, iconos y fondos son originales de Snake OS.
   Las apps están conectadas a la máquina de verdad:
     · Terminal → shells reales por puertos serie (ttyS0, ttyS2, ttyS3) con xterm.js (MIT, servido desde /static/assets).
     · Archivos, Editor de texto y Monitor del sistema → un «agente» (sh de BusyBox en ttyS1) que ejecuta ls/cat/base64/ps/df.
   Nada se ejecuta en el servidor: solo sirve archivos fijos. Sin red dentro de la máquina.
   Dentro de Snake OS: estado y ajustes en IndexedDB del navegador, por perfil (base «snkVMv1», clave = correo del perfil),
   comprimido (gzip); las máquinas del escritorio anterior (rec.os «ubuntu») pasan a «snkpro» conservando estado y archivos.
   Página propia (/pro, sin iniciar sesión): renderSnakeVMApp(el, { standalone: true }) usa otra base («snkProWebV1»).
   Letra: Inter y Outfit (SIL OFL 1.1, assets/fonts); terminal y editor con la letra monoespaciada del sistema. */
(function () {
  'use strict';
  if (window.renderSnakeVMApp) return;
  var BASE = '/static/assets/vm/', AS = '/static/assets/', VER = '202610211900';
  var DBN = 'snkVMv1', ST = 'machines', FMT = 2, OSID = 'snkpro', PRO = 'Snake OS! Pro', DEFHOST = 'snake-pro';
  var CMDLINE = 'tsc=reliable mitigations=off random.trust_cpu=on init_on_free=1';
  function en() { return !!(window.snakeI18n && window.snakeI18n.lang === 'en'); }
  function T(es, e) { return en() ? e : es; }
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
      .catch(function (e) { xtP = null; throw e; });
    return xtP;
  }

  /* ---------- Dibujos originales de Snake OS! Pro ---------- */
  var IC = {
    files: '<svg viewBox="0 0 64 64"><path d="M6 15a5 5 0 0 1 5-5h14l5 5h23a5 5 0 0 1 5 5v4H6z" fill="#15803d"/><rect x="6" y="20" width="52" height="36" rx="6" fill="#22c55e"/><rect x="6" y="20" width="52" height="16" rx="6" fill="#4ade80" opacity=".55"/><path d="M20 44c4-6 8 2 12-3s8 3 12-2" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity=".9"/><circle cx="45" cy="38.6" r="2.6" fill="#fff" opacity=".9"/></svg>',
    term: '<svg viewBox="0 0 64 64"><rect x="5" y="8" width="54" height="48" rx="12" fill="#07150d"/><rect x="5.8" y="8.8" width="52.4" height="46.4" rx="11.2" fill="none" stroke="#22c55e" stroke-width="1.6"/><path d="M16 26l9 6.5-9 6.5" fill="none" stroke="#4ade80" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="29" y="38" width="17" height="3.8" rx="1.9" fill="#e2fbe8"/></svg>',
    edit: '<svg viewBox="0 0 64 64"><path d="M14 6h26l12 12v36a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z" fill="#f4fbf6" stroke="#b7d3c0" stroke-width="1.5"/><path d="M40 6v9a3 3 0 0 0 3 3h9" fill="#d6eadc"/><g stroke="#8fb09a" stroke-width="2.6" stroke-linecap="round"><path d="M18 26h22M18 33h26M18 40h18M18 47h12"/></g><path d="M50 30l6 6-16 16-8 2 2-8z" fill="#22c55e"/><path d="M50 30l6 6-3 3-6-6z" fill="#15803d"/></svg>',
    mon: '<svg viewBox="0 0 64 64"><rect x="5" y="9" width="54" height="46" rx="12" fill="#0b2015"/><path d="M11 22h42M11 48h42" stroke="#1f3d2b" stroke-width="1.5"/><path d="M11 40h8l5-13 7 22 6-16 4 7h12" fill="none" stroke="#4ade80" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    set: '<svg viewBox="0 0 64 64"><g transform="translate(32 32)"><g fill="#3f6b52">' + (function () { var s = ''; for (var i = 0; i < 8; i++) s += '<rect x="-5" y="-27" width="10" height="12" rx="2.5" transform="rotate(' + (i * 45) + ')"/>'; return s; })() + '</g><circle r="19" fill="#5c8a6f"/><circle r="8.5" fill="#22c55e"/><circle r="4" fill="#0b2015"/></g></svg>',
    about: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#16a34a"/><circle cx="32" cy="32" r="26" fill="none" stroke="#4ade80" stroke-width="2"/><circle cx="32" cy="20" r="4" fill="#fff"/><rect x="28" y="28" width="8" height="20" rx="3" fill="#fff"/></svg>',
    folder: '<svg viewBox="0 0 64 64"><path d="M5 15a5 5 0 0 1 5-5h14l5 5h25a5 5 0 0 1 5 5v3H5z" fill="#15803d"/><rect x="5" y="19" width="54" height="37" rx="5" fill="#22c55e"/><rect x="5" y="19" width="54" height="3" fill="#fff" opacity=".3"/></svg>',
    home: '<svg viewBox="0 0 64 64"><path d="M5 15a5 5 0 0 1 5-5h14l5 5h25a5 5 0 0 1 5 5v3H5z" fill="#15803d"/><rect x="5" y="19" width="54" height="37" rx="5" fill="#22c55e"/><path d="M32 27l-10 9h3v9h5v-6h4v6h5v-9h3z" fill="#fff" opacity=".92"/></svg>',
    file: '<svg viewBox="0 0 64 64"><path d="M15 5h23l13 13v38a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="#f7fcf8" stroke="#b7d3c0" stroke-width="1.5"/><path d="M38 5v10a3 3 0 0 0 3 3h10" fill="#d6eadc"/></svg>',
    text: '<svg viewBox="0 0 64 64"><path d="M15 5h23l13 13v38a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="#f7fcf8" stroke="#b7d3c0" stroke-width="1.5"/><path d="M38 5v10a3 3 0 0 0 3 3h10" fill="#d6eadc"/><g stroke="#8fb09a" stroke-width="2.4" stroke-linecap="round"><path d="M19 27h24M19 34h24M19 41h17M19 48h20"/></g></svg>',
    exec: '<svg viewBox="0 0 64 64"><path d="M15 5h23l13 13v38a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="#f7fcf8" stroke="#b7d3c0" stroke-width="1.5"/><path d="M38 5v10a3 3 0 0 0 3 3h10" fill="#d6eadc"/><rect x="18" y="28" width="28" height="20" rx="4" fill="#07150d"/><path d="M23 34l4 3-4 3" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round"/><rect x="29" y="40" width="8" height="2" fill="#fff"/></svg>',
    dev: '<svg viewBox="0 0 64 64"><rect x="10" y="14" width="44" height="36" rx="5" fill="#5c8a6f"/><rect x="16" y="20" width="32" height="24" rx="2" fill="#244a34"/><g fill="#cfe6d6"><rect x="20" y="8" width="3" height="6"/><rect x="30" y="8" width="3" height="6"/><rect x="40" y="8" width="3" height="6"/><rect x="20" y="50" width="3" height="6"/><rect x="30" y="50" width="3" height="6"/><rect x="40" y="50" width="3" height="6"/></g></svg>',
    root: '<svg viewBox="0 0 64 64"><rect x="8" y="18" width="48" height="28" rx="6" fill="#3f6b52"/><rect x="8" y="18" width="48" height="14" rx="6" fill="#5c8a6f"/><circle cx="47" cy="39" r="3" fill="#4ade80"/><rect x="14" y="37" width="20" height="4" rx="2" fill="#244a34"/></svg>'
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
  SYM.exit = '<svg viewBox="0 0 16 16"><path d="M6.5 2.5h-3v11h3M10 5l3 3-3 3M13 8H6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  SYM.full = '<svg viewBox="0 0 16 16"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  /* Logotipo de Snake OS! Pro: serpiente verde enroscada + sello «PRO». Cada copia con ids propios (los degradados no se cruzan) */
  var LGN = 0;
  function LOGO() {
    var i = 'spxl' + (++LGN);
    return '<svg viewBox="0 0 64 64" class="spx-logo" role="img" aria-label="' + PRO + '"><defs><linearGradient id="' + i + 'a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ee7a0"/><stop offset="1" stop-color="#0b7a3b"/></linearGradient>' +
      '<linearGradient id="' + i + 'b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>' +
      '<radialGradient id="' + i + 'c" cx=".3" cy=".25" r=".9"><stop offset="0" stop-color="#14532d"/><stop offset="1" stop-color="#04130a"/></radialGradient></defs>' +
      '<rect x="3" y="3" width="58" height="58" rx="17" fill="url(#' + i + 'c)"/><rect x="3.8" y="3.8" width="56.4" height="56.4" rx="16.2" fill="none" stroke="url(#' + i + 'a)" stroke-width="1.8"/>' +
      '<path d="M15 46c0-9 7-11 16-11s16-3 16-10-6-10-12-10c-5 0-8 2-10 5" fill="none" stroke="url(#' + i + 'a)" stroke-width="7.2" stroke-linecap="round"/>' +
      '<path d="M15 46c0-9 7-11 16-11s16-3 16-10" fill="none" stroke="#d9fbe5" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="1.5 4.5" opacity=".55"/>' +
      '<ellipse cx="24.5" cy="20.5" rx="6.4" ry="5.2" fill="#4ade80"/><circle cx="23" cy="18.6" r="1.9" fill="#fff"/><circle cx="22.6" cy="18.6" r="1" fill="#04130a"/>' +
      '<path d="M18.4 22.4h-4.2m1.7 0l-2-1.7m2 1.7l-2 1.7" stroke="#f43f5e" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
      '<rect x="32" y="44.5" width="26" height="12" rx="6" fill="url(#' + i + 'b)"/><text x="45" y="53.4" text-anchor="middle" font-family="Outfit,Inter,Arial,sans-serif" font-weight="800" font-size="8.6" letter-spacing=".6" fill="#2a1a03">PRO</text></svg>';
  }
  /* Fondos de pantalla originales de Snake OS! Pro */
  function svgUrl(s) { return 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")'; }
  var SCALES = '<pattern id="p" width="56" height="48" patternUnits="userSpaceOnUse"><path d="M0 24a28 24 0 0 1 56 0M-28 48a28 24 0 0 1 56 0M28 48a28 24 0 0 1 56 0" fill="none" stroke="#4ade80" stroke-width="2"/></pattern>';
  var WALLS = {
    selva: { es: 'Selva Pro', en: 'Pro jungle', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="a" cx=".28" cy=".25" r="1.05"><stop offset="0" stop-color="#166534"/><stop offset=".5" stop-color="#062a16"/><stop offset="1" stop-color="#020c06"/></radialGradient><linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#15803d" stop-opacity="0"/><stop offset=".35" stop-color="#22c55e"/><stop offset=".8" stop-color="#4ade80"/><stop offset="1" stop-color="#bbf7d0"/></linearGradient>' + SCALES + '</defs><rect width="1600" height="1000" fill="url(#a)"/><rect width="1600" height="1000" fill="url(#p)" opacity=".07"/><path d="M-100 800C180 600 420 930 730 720S1150 400 1380 520" fill="none" stroke="#052e16" stroke-width="96" stroke-linecap="round" opacity=".55"/><path d="M-100 780C180 580 420 910 730 700S1150 380 1380 500" fill="none" stroke="url(#s)" stroke-width="64" stroke-linecap="round"/><path d="M-100 780C180 580 420 910 730 700S1150 380 1380 500" fill="none" stroke="#dcfce7" stroke-width="5" stroke-dasharray="4 26" stroke-linecap="round" opacity=".35"/><ellipse cx="1410" cy="490" rx="62" ry="46" fill="#bbf7d0"/><circle cx="1428" cy="470" r="11" fill="#fff"/><circle cx="1431" cy="470" r="5.5" fill="#052e16"/><path d="M1470 505h46m-14 0l16-12m-16 12l16 12" stroke="#f43f5e" stroke-width="7" fill="none" stroke-linecap="round"/></svg>' },
    escamas: { es: 'Escamas', en: 'Scales', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#022c1a"/><stop offset=".6" stop-color="#065f3b"/><stop offset="1" stop-color="#10b981"/></linearGradient><radialGradient id="v" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></radialGradient>' + SCALES + '</defs><rect width="1600" height="1000" fill="url(#a)"/><rect width="1600" height="1000" fill="url(#p)" opacity=".22"/><rect width="1600" height="1000" fill="url(#v)"/></svg>' },
    neon: { es: 'Neón', en: 'Neon', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><pattern id="g" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#22c55e" stroke-width="1"/></pattern></defs><rect width="1600" height="1000" fill="#020604"/><rect width="1600" height="1000" fill="url(#g)" opacity=".12"/><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M120 820H520V560H880V300H1220V560H1480" stroke="#22c55e" stroke-width="70" opacity=".12"/><path d="M120 820H520V560H880V300H1220V560H1480" stroke="#4ade80" stroke-width="26" opacity=".35"/><path d="M120 820H520V560H880V300H1220V560H1480" stroke="#bbf7d0" stroke-width="8"/></g><rect x="1462" y="530" width="56" height="56" rx="14" fill="#bbf7d0"/><circle cx="1500" cy="550" r="7" fill="#020604"/><rect x="280" y="430" width="40" height="40" rx="10" fill="#f43f5e"/><rect x="280" y="430" width="40" height="40" rx="10" fill="none" stroke="#f43f5e" stroke-width="18" opacity=".25"/></svg>' },
    aurora: { es: 'Aurora', en: 'Aurora', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#031a12"/><stop offset=".55" stop-color="#064e3b"/><stop offset="1" stop-color="#0f766e"/></linearGradient><linearGradient id="w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#34d399" stop-opacity="0"/><stop offset=".5" stop-color="#6ee7b7" stop-opacity=".7"/><stop offset="1" stop-color="#a7f3d0" stop-opacity="0"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#a)"/><g fill="none" stroke="url(#w)"><path d="M-50 380C300 220 600 520 950 360S1450 160 1650 260" stroke-width="90" opacity=".35"/><path d="M-50 470C300 310 600 610 950 450S1450 250 1650 350" stroke-width="30" opacity=".5"/><path d="M-50 540C300 380 600 680 950 520S1450 320 1650 420" stroke-width="8" opacity=".7"/></g><path d="M0 860Q400 760 800 840T1600 800V1000H0Z" fill="#021510" opacity=".85"/></svg>' }
  };
  var WALL_FROM_OLD = { ola: 'selva', noche: 'neon', amanecer: 'aurora', pizarra: 'escamas' };
  var ACC0 = '#22c55e';
  var ACCENTS = [['#22c55e', 'Verde serpiente', 'Snake green'], ['#14b8a6', 'Turquesa', 'Teal'], ['#84cc16', 'Lima', 'Lime'], ['#eab308', 'Oro', 'Gold'], ['#3b82f6', 'Azul', 'Blue'], ['#a855f7', 'Morado', 'Purple'], ['#f43f5e', 'Coral', 'Coral']];
  var ACC_FROM_OLD = { '#E95420': '#22c55e', '#a35d3d': '#eab308', '#657b69': '#14b8a6', '#3584e4': '#3b82f6', '#7764d8': '#a855f7', '#b34cb3': '#a855f7', '#da3450': '#f43f5e' };
  /* Máquina del escritorio anterior → Snake OS! Pro: mismo Linux, mismo estado y mismos archivos; solo cambia el aspecto */
  function upgradeRec(r) {
    if (!r || r.os !== 'ubuntu') return false;
    r.os = OSID; r.ui = r.ui || {};
    r.ui.wall = WALLS[r.ui.wall] ? r.ui.wall : (WALL_FROM_OLD[r.ui.wall] || 'selva');
    if (ACC_FROM_OLD[r.ui.acc]) r.ui.acc = ACC_FROM_OLD[r.ui.acc];
    if (!r.name || r.name === 'snake-ubuntu') { r.name = DEFHOST; r.renamedHost = true; }
    r.proFrom = 'ubuntu'; r.proAt = Date.now();
    return true;
  }
  function css() {
    if (document.getElementById('snkvm-css')) return;
    var F = AS + 'fonts/';
    var st = document.createElement('style'); st.id = 'snkvm-css';
    st.textContent =
      "@font-face{font-family:'SnkProUI';font-weight:100 900;font-display:swap;src:url(" + F + "inter-latin-wght-normal.woff2) format('woff2')}" +
      "@font-face{font-family:'SnkProHead';font-weight:100 900;font-display:swap;src:url(" + F + "outfit-latin-wght-normal.woff2) format('woff2')}" +
      '.snkvm{height:100%;position:relative}' +
      ".snkvm-pick{padding:18px;display:flex;flex-direction:column;gap:12px;font:14px 'SnkProUI',var(--snake-font,Inter,system-ui,sans-serif)}.snkvm-card{display:flex;gap:14px;align-items:center;padding:14px;border-radius:16px;border:1px solid rgba(34,197,94,.35);background:rgba(34,197,94,.10);cursor:pointer;text-align:left;color:inherit;font:inherit}" +
      '.snkvm-card:hover{background:rgba(34,197,94,.18)}.snkvm-card svg{width:60px;height:60px;flex:0 0 auto}.snkvm-card b{font-size:17px}.snkvm-card small,.snkvm-note{opacity:.75;font-size:12px}' +
      /* raíz del escritorio */
      ".spx{position:absolute;inset:0;overflow:hidden;font:14px/1.35 'SnkProUI',Inter,system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none;--acc:#22c55e;--acc-fg:#04140a;--tb-h:54px;" +
      '--win-bg:#f5faf6;--win-fg:#14231a;--hb-bg:#e7f1ea;--view:#ffffff;--side:#eef6f0;--line:rgba(10,40,20,.12);--hover:rgba(10,60,30,.07);--sel:color-mix(in srgb,var(--acc) 24%,transparent);--card:#fff;--muted:rgba(10,30,18,.58);--inp:#fff;--shadow:0 16px 40px rgba(0,20,10,.32),0 0 0 1px rgba(10,40,20,.10);' +
      '--glass:rgba(240,250,244,.70);--glass-b:rgba(255,255,255,.72);--glass-fg:#11221a;--glass-hover:rgba(255,255,255,.6);background:#020c06;color:#14231a}' +
      '.spx.dark{--win-bg:#14201a;--win-fg:#eaf5ee;--hb-bg:#1a2a21;--view:#0f1813;--side:#16241c;--line:rgba(160,255,200,.10);--hover:rgba(160,255,200,.08);--card:#1b2a22;--muted:rgba(230,245,235,.62);--inp:#1e2d25;--shadow:0 16px 40px rgba(0,0,0,.6),0 0 0 1px rgba(160,255,200,.09);' +
      '--glass:rgba(10,26,17,.58);--glass-b:rgba(160,255,200,.16);--glass-fg:#ecfdf3;--glass-hover:rgba(160,255,200,.13)}' +
      ':where(.spx) svg{display:block}:where(.spx) button{font:inherit;color:inherit}:where(.spx) :is(input,textarea,select){font:inherit;user-select:text;-webkit-user-select:text}.spx-pg>*,.spx-res>*{flex-shrink:0}' +
      ".spx h2,.spx h3,.spx-sm-h b,.spx-hb .ttl{font-family:'SnkProHead','SnkProUI',Inter,sans-serif}" +
      '.spx-desk{position:absolute;inset:0;background-size:cover;background-position:center}' +
      '.spx-area{position:absolute;left:0;right:0;top:0;bottom:calc(var(--tb-h) + 16px);overflow:hidden}' +
      '.spx-dicon{position:absolute;width:88px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:7px 2px;border-radius:12px;border:0;background:none;cursor:pointer;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.85);font-size:12.5px}' +
      '.spx-dicon:hover,.spx-dicon:focus-visible{background:rgba(160,255,200,.16);outline:none}.spx-dicon svg{width:52px;height:52px;filter:drop-shadow(0 3px 6px rgba(0,0,0,.35))}' +
      /* barra de tareas de cristal (liquid glass) */
      '.spx-glass{background:var(--glass);backdrop-filter:blur(28px) saturate(180%);-webkit-backdrop-filter:blur(28px) saturate(180%);border:1px solid var(--glass-b);color:var(--glass-fg);box-shadow:0 12px 34px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.22)}' +
      '.spx-task{position:absolute;left:10px;right:10px;bottom:8px;height:var(--tb-h);border-radius:18px;display:flex;align-items:center;gap:4px;padding:0 8px;z-index:9000;overflow:hidden}' +
      '.spx-task::before{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,0) 55%);pointer-events:none}' +
      '.spx-tb{position:relative;height:44px;min-width:44px;border:0;border-radius:12px;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 8px;flex:0 0 auto;transition:background .15s,transform .15s}' +
      '.spx-tb:hover{background:var(--glass-hover)}.spx-tb:active{transform:scale(.95)}.spx-tb svg{width:30px;height:30px}.spx-tb.on{background:var(--glass-hover);box-shadow:inset 0 0 0 1px var(--glass-b)}' +
      '.spx-tb .dot{position:absolute;left:50%;bottom:2px;transform:translateX(-50%);height:3px;border-radius:3px;background:var(--acc);width:0;transition:width .15s}.spx-tb.run .dot{width:7px}.spx-tb.on .dot{width:18px}.spx-tb.mz{opacity:.62}' +
      '.spx-tb .nm{font-size:12.5px;max-width:110px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.spx-start-b{padding:0 12px 0 6px}.spx-start-b svg{width:34px;height:34px}.spx-start-b b{font:800 14px/1 \'SnkProHead\',\'SnkProUI\',sans-serif;letter-spacing:.2px;white-space:nowrap}.spx-start-b b i{font-style:normal;color:var(--acc)}' +
      '.spx-tsep{width:1px;height:28px;background:var(--glass-b);margin:0 4px;flex:0 0 auto}.spx-apps-tb{display:flex;gap:2px;align-items:center;min-width:0;overflow:hidden;flex:1}' +
      '.spx-tray{display:flex;align-items:center;gap:2px;flex:0 0 auto}.spx-tray .spx-tb{min-width:36px;padding:0 8px;gap:7px}.spx-tray .spx-tb svg{width:16px;height:16px}' +
      '.spx-clk{display:flex;flex-direction:column;align-items:flex-end;line-height:1.15;font-size:12px;font-variant-numeric:tabular-nums}.spx-clk b{font-size:13px}' +
      /* menú Inicio */
      '.spx-start{position:absolute;left:10px;bottom:calc(var(--tb-h) + 16px);width:min(460px,calc(100% - 20px));max-height:calc(100% - var(--tb-h) - 30px);z-index:9400;border-radius:22px;display:flex;flex-direction:column;overflow:hidden;animation:spxup .18s cubic-bezier(.2,.8,.2,1)}' +
      '@keyframes spxup{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}' +
      '.spx-sm-h{display:flex;align-items:center;gap:12px;padding:16px 18px 6px}.spx-sm-h svg{width:46px;height:46px}.spx-sm-h b{font-size:20px;font-weight:800;display:block}.spx-sm-h b i{font-style:normal;color:var(--acc)}.spx-sm-h small{opacity:.72;font-size:12px}' +
      '.spx-srch{display:flex;align-items:center;gap:8px;margin:10px 16px 4px;background:rgba(127,127,127,.16);border:1px solid var(--glass-b);border-radius:12px;padding:0 12px;height:38px}.spx-srch svg{width:16px;height:16px;opacity:.8}.spx-srch input{flex:1;background:none;border:0;outline:none;color:inherit;font-size:14px;min-width:0}.spx-srch input::placeholder{color:inherit;opacity:.6}' +
      '.spx-sm-t{font-size:12px;font-weight:700;opacity:.7;margin:12px 20px 4px;text-transform:uppercase;letter-spacing:.6px}' +
      '.spx-sm-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:4px;padding:0 12px;overflow:auto}.spx-app{border:0;background:none;border-radius:14px;padding:10px 4px;display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;font-size:12.5px;text-align:center}.spx-app:hover,.spx-app.hl{background:var(--glass-hover)}.spx-app svg{width:44px;height:44px}' +
      '.spx-sm-w{display:flex;flex-direction:column;gap:2px;padding:0 12px;overflow:auto;max-height:150px}.spx-sm-w button{display:flex;align-items:center;gap:10px;border:0;background:none;border-radius:10px;padding:6px 10px;cursor:pointer;text-align:left}.spx-sm-w button:hover{background:var(--glass-hover)}.spx-sm-w svg{width:22px;height:22px}.spx-sm-w span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.spx-sm-f{display:flex;align-items:center;gap:6px;padding:10px 14px;margin-top:12px;border-top:1px solid var(--glass-b);background:rgba(127,127,127,.08)}.spx-sm-f .who{flex:1;min-width:0;display:flex;align-items:center;gap:10px;font-size:13px}.spx-sm-f .who i{width:30px;height:30px;border-radius:50%;background:var(--acc);color:var(--acc-fg);display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:800}.spx-sm-f .who span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.spx-sm-f button{width:36px;height:36px;border-radius:10px;border:0;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center}.spx-sm-f button:hover{background:var(--glass-hover)}.spx-sm-f button svg{width:17px;height:17px}' +
      '.spx-sm-n{font-size:11.5px;opacity:.65;padding:6px 20px 0}' +
      /* ventanas */
      '.spx-win{position:absolute;display:flex;flex-direction:column;background:var(--win-bg);color:var(--win-fg);border-radius:14px;box-shadow:var(--shadow);overflow:hidden;min-width:280px;min-height:180px;animation:spxwin .16s ease-out}' +
      '@keyframes spxwin{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}@keyframes spxfade{from{opacity:0}to{opacity:1}}' +
      '.spx-win.max{left:0!important;top:0!important;width:100%!important;height:100%!important;border-radius:0}.spx-win.minz{display:none}' +
      '.spx-win.act{box-shadow:var(--shadow),0 0 0 1px color-mix(in srgb,var(--acc) 45%,transparent)}.spx-win:not(.act){box-shadow:0 6px 18px rgba(0,0,0,.25),0 0 0 1px var(--line)}.spx-win:not(.act) .spx-hb{color:color-mix(in srgb,var(--win-fg) 60%,transparent)}' +
      '.spx-hb{height:46px;flex:0 0 46px;display:flex;align-items:center;gap:6px;padding:0 8px 0 10px;background:var(--hb-bg);touch-action:none;position:relative;box-shadow:inset 0 -1px var(--line)}' +
      '.spx-wico{width:22px;height:22px;flex:0 0 auto}.spx-wico svg{width:22px;height:22px}' +
      '.spx-hb .ttl{position:absolute;left:50%;transform:translateX(-50%);max-width:46%;text-align:center;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}' +
      '.spx-hb .l,.spx-hb .r{display:flex;gap:6px;align-items:center;min-width:0}.spx-hb .r{margin-left:auto}' +
      '.spx-btn{border:0;border-radius:9px;background:color-mix(in srgb,var(--win-fg) 9%,transparent);padding:0 11px;cursor:pointer;height:32px;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:600;white-space:nowrap}' +
      '.spx-btn:hover{background:color-mix(in srgb,var(--win-fg) 15%,transparent)}.spx-btn.flat{background:none}.spx-btn.flat:hover{background:var(--hover)}.spx-btn.ic{width:34px;padding:0}.spx-btn svg{width:16px;height:16px}' +
      '.spx-btn.sug{background:var(--acc);color:var(--acc-fg)}.spx-btn.sug:hover{filter:brightness(1.08)}.spx-btn.dest{background:#dc2626;color:#fff}.spx-btn:disabled{opacity:.45;cursor:default}' +
      '.spx-wc{width:26px;height:26px;border-radius:9px;border:0;background:none;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;margin-left:2px}' +
      '.spx-wc:hover{background:color-mix(in srgb,var(--win-fg) 13%,transparent)}.spx-wc.x:hover{background:#e5484d;color:#fff}.spx-wc svg{width:12px;height:12px}' +
      '.spx-wb{flex:1;min-height:0;position:relative;display:flex;flex-direction:column;background:var(--view)}' +
      '.spx-rz{position:absolute;z-index:4}.spx-rz.n{top:-3px;left:8px;right:8px;height:7px;cursor:ns-resize}.spx-rz.s{bottom:-3px;left:8px;right:8px;height:7px;cursor:ns-resize}.spx-rz.e{right:-3px;top:8px;bottom:8px;width:7px;cursor:ew-resize}.spx-rz.w{left:-3px;top:8px;bottom:8px;width:7px;cursor:ew-resize}' +
      '.spx-rz.ne{right:-3px;top:-3px;width:12px;height:12px;cursor:nesw-resize}.spx-rz.nw{left:-3px;top:-3px;width:12px;height:12px;cursor:nwse-resize}.spx-rz.se{right:-3px;bottom:-3px;width:14px;height:14px;cursor:nwse-resize}.spx-rz.sw{left:-3px;bottom:-3px;width:12px;height:12px;cursor:nesw-resize}.spx-win.max .spx-rz{display:none}' +
      /* paneles de la bandeja (cristal) */
      '.spx-pop{position:absolute;bottom:calc(var(--tb-h) + 16px);z-index:9500;border-radius:20px;padding:14px;animation:spxup .16s ease-out}' +
      '.spx-qs{right:10px;width:min(340px,calc(100% - 20px));display:flex;flex-direction:column;gap:10px}.spx-qsr{display:flex;gap:8px;justify-content:flex-end}.spx-qsr button{width:38px;height:38px;border-radius:12px;border:0;background:rgba(127,127,127,.16);cursor:pointer;display:flex;align-items:center;justify-content:center}.spx-qsr button:hover{background:var(--glass-hover)}.spx-qsr svg{width:16px;height:16px}' +
      '.spx-qsg{display:grid;grid-template-columns:1fr 1fr;gap:8px}.spx-tile{border:0;border-radius:14px;background:rgba(127,127,127,.16);display:flex;align-items:center;gap:10px;padding:0 14px;height:50px;cursor:pointer;text-align:left;font-size:13px}.spx-tile svg{width:16px;height:16px;flex:0 0 auto}.spx-tile.on{background:var(--acc);color:var(--acc-fg)}.spx-tile:disabled{opacity:.55;cursor:default}.spx-tile small{display:block;opacity:.75;font-size:11px}' +
      '.spx-qsi{font-size:12px;opacity:.72;padding:0 4px}.spx-cal{right:10px;width:300px}.spx-cal h4{margin:2px 4px 2px;font-size:13px;opacity:.75;font-weight:500}.spx-cal h3{margin:0 4px 10px;font-size:22px}.spx-calg{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;font-size:12.5px}.spx-calg b{opacity:.55;font-weight:500;padding:4px 0}.spx-calg span{padding:6px 0;border-radius:99px}.spx-calg span.t{background:var(--acc);color:var(--acc-fg);font-weight:700}.spx-calg span.o{opacity:.35}' +
      /* diálogos, avisos y menús contextuales */
      '.spx-back{position:absolute;inset:0;background:rgba(0,10,4,.45);z-index:9700;display:flex;align-items:center;justify-content:center;animation:spxfade .12s}.spx-dlg{background:var(--win-bg);color:var(--win-fg);border-radius:20px;box-shadow:var(--shadow);width:min(380px,92%);padding:22px 20px 18px;display:flex;flex-direction:column;gap:12px;text-align:center}.spx-dlg h3{margin:0;font-size:18px}.spx-dlg p{margin:0;color:var(--muted)}' +
      '.spx-dlg .bt{display:flex;gap:10px;margin-top:6px}.spx-dlg .bt .spx-btn{flex:1;height:38px;border-radius:11px}' +
      '.spx-in{height:36px;border-radius:9px;border:2px solid transparent;background:color-mix(in srgb,var(--win-fg) 8%,transparent);color:var(--win-fg);padding:0 10px;outline:none;min-width:0}.spx-in:focus{border-color:color-mix(in srgb,var(--acc) 75%,transparent)}' +
      '.spx-toast{position:absolute;left:50%;bottom:calc(var(--tb-h) + 26px);transform:translateX(-50%);z-index:9800;background:rgba(8,22,14,.88);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#ecfdf3;border:1px solid rgba(160,255,200,.18);border-radius:14px;padding:10px 18px;box-shadow:0 8px 24px rgba(0,0,0,.4);font-size:13.5px;max-width:80%;animation:spxfade .15s;pointer-events:none}' +
      '.spx-menu{position:absolute;z-index:9600;background:var(--win-bg);color:var(--win-fg);border-radius:14px;box-shadow:var(--shadow);padding:6px;min-width:190px;display:flex;flex-direction:column}.spx-menu button{border:0;background:none;text-align:left;padding:8px 12px;border-radius:8px;cursor:pointer;display:flex;gap:10px;align-items:center}.spx-menu button:hover{background:var(--hover)}.spx-menu button svg{width:15px;height:15px;opacity:.8}.spx-menu hr{border:0;border-top:1px solid var(--line);margin:4px 6px}.spx-menu button.dz{color:#e5484d}' +
      /* Archivos */
      '.spx-fm{display:flex;flex:1;min-height:0}.spx-side{width:176px;background:var(--side);padding:8px 6px;overflow:auto;flex:0 0 auto;display:flex;flex-direction:column;gap:2px;box-shadow:inset -1px 0 var(--line)}' +
      '.spx-side button{display:flex;gap:11px;align-items:center;width:100%;border:0;background:none;padding:8px 10px;border-radius:9px;cursor:pointer;text-align:left}.spx-side button svg{width:16px;height:16px;opacity:.85}.spx-side button:hover{background:var(--hover)}.spx-side button.on{background:var(--sel);font-weight:700}' +
      '.spx-main{flex:1;min-width:0;display:flex;flex-direction:column}.spx-grid{flex:1;overflow:auto;padding:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:4px;align-content:start}' +
      '.spx-it{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:10px;cursor:pointer;text-align:center;word-break:break-word;font-size:12.5px;line-height:1.25}.spx-it:hover{background:var(--hover)}.spx-it.sel{background:var(--sel)}.spx-it svg{width:54px;height:54px}.spx-it.hid{opacity:.6}.spx-it .lk{font-size:10px;opacity:.7}' +
      '.spx-path{flex:1;min-width:0;display:flex;gap:1px;overflow:hidden;background:color-mix(in srgb,var(--win-fg) 7%,transparent);border-radius:9px;padding:0 4px;align-items:center;height:32px}.spx-path button{border:0;background:none;padding:3px 7px;border-radius:6px;cursor:pointer;white-space:nowrap;font-weight:500}.spx-path button:hover{background:var(--hover)}.spx-path button.cur{font-weight:700}.spx-path i{opacity:.45;font-style:normal}' +
      '.spx-stat{padding:5px 12px;font-size:12px;color:var(--muted);box-shadow:inset 0 1px var(--line);display:flex;gap:10px}.spx-empty{grid-column:1/-1;text-align:center;color:var(--muted);padding:40px 10px}' +
      /* Editor */
      ".spx-ta{flex:1;border:0;resize:none;outline:none;background:var(--view);color:var(--win-fg);font:14px/1.5 ui-monospace,'SF Mono',Menlo,Consolas,'DejaVu Sans Mono','Liberation Mono',monospace;padding:12px 14px;tab-size:4;white-space:pre;overflow:auto}" +
      /* Monitor */
      '.spx-tabs{display:flex;gap:2px;background:color-mix(in srgb,var(--win-fg) 7%,transparent);border-radius:10px;padding:2px}.spx-tabs button{border:0;background:none;padding:0 12px;height:28px;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px}.spx-tabs button.on{background:var(--view);box-shadow:0 1px 3px rgba(0,0,0,.15)}' +
      '.spx-tbl{flex:1;overflow:auto}.spx-tbl table{width:100%;border-collapse:collapse;font-size:13px}.spx-tbl th{position:sticky;top:0;background:var(--view);text-align:left;padding:7px 10px;font-weight:700;box-shadow:inset 0 -1px var(--line);white-space:nowrap}.spx-tbl td{padding:5px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px}.spx-tbl tr.sel td{background:var(--sel)}.spx-tbl tbody tr:hover td{background:var(--hover)}.spx-tbl td.n{text-align:right;font-variant-numeric:tabular-nums}' +
      '.spx-res{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:16px}.spx-box{background:var(--card);border-radius:14px;padding:14px;box-shadow:0 0 0 1px var(--line)}.spx-box h4{margin:0 0 8px;font-size:14px}.spx-box canvas{width:100%;height:120px;display:block}.spx-bar{height:10px;border-radius:9px;background:color-mix(in srgb,var(--win-fg) 12%,transparent);overflow:hidden;margin:6px 0}.spx-bar i{display:block;height:100%;background:var(--acc);border-radius:9px}.spx-kv{display:flex;justify-content:space-between;gap:10px;font-size:13px;color:var(--muted)}' +
      /* Configuración */
      '.spx-set{display:flex;flex:1;min-height:0}.spx-pg{flex:1;overflow:auto;padding:20px 22px;display:flex;flex-direction:column;gap:18px}.spx-pg h3{margin:0;font-size:15px}.spx-grp{background:var(--card);border-radius:14px;box-shadow:0 0 0 1px var(--line);overflow:hidden}.spx-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;box-shadow:inset 0 -1px var(--line)}.spx-row:last-child{box-shadow:none}.spx-row span:last-child{color:var(--muted);text-align:right}' +
      '.spx-styles{display:flex;gap:16px;flex-wrap:wrap}.spx-sty{border:3px solid transparent;border-radius:16px;padding:0;cursor:pointer;background:none;display:flex;flex-direction:column;align-items:center;gap:6px;font-weight:500}.spx-sty.on{border-color:var(--acc)}.spx-sty i{display:block;width:150px;height:92px;border-radius:12px;background-size:cover;background-position:center;position:relative;overflow:hidden}' +
      '.spx-sty i b{position:absolute;left:22%;top:16%;width:60%;height:52%;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.35)}.spx-sty i em{position:absolute;left:8%;right:8%;bottom:7%;height:12%;border-radius:5px}.spx-sty span{padding-bottom:6px}.spx-acc{display:flex;gap:10px;flex-wrap:wrap}.spx-acc button{width:30px;height:30px;border-radius:50%;border:3px solid transparent;cursor:pointer;padding:0}.spx-acc button.on{border-color:var(--win-fg)}' +
      '.spx-walls{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}.spx-walls button{border:3px solid transparent;border-radius:14px;padding:0;cursor:pointer;height:92px;background-size:cover;background-position:center;position:relative}.spx-walls button.on{border-color:var(--acc)}.spx-walls button span{position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.55);color:#fff;border-radius:6px;padding:1px 7px;font-size:11.5px}' +
      '.spx-about{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}.spx-about svg{width:104px;height:104px}.spx-about h2{margin:6px 0 0;font-size:26px;font-weight:800}.spx-about h2 i{font-style:normal;color:var(--acc)}.spx-about b{font-weight:600;color:var(--muted)}.spx-about p{margin:4px 0 0;color:var(--muted);max-width:460px;font-size:13px}' +
      /* Terminal */
      '.spx-term{flex:1;min-height:0;background:#06120b;padding:4px 0 0 6px}.spx-term .xterm{height:100%}.spx-term .xterm-viewport{background:#06120b!important}' +
      /* Arranque y configuración inicial */
      '.spx-boot{position:absolute;inset:0;z-index:9900;background:radial-gradient(circle at 50% 40%,#0b3a20,#020c06 70%);color:#ecfdf3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}.spx-boot svg{width:96px;height:96px;filter:drop-shadow(0 8px 30px rgba(34,197,94,.35))}' +
      ".spx-boot .nm{font:800 26px/1 'SnkProHead','SnkProUI',sans-serif;letter-spacing:.3px}.spx-boot .nm i{font-style:normal;color:#4ade80}" +
      '.spx-spin{width:30px;height:30px;border-radius:50%;border:3px solid rgba(74,222,128,.22);border-top-color:#4ade80;animation:spxsp .8s linear infinite}@keyframes spxsp{to{transform:rotate(360deg)}}.spx-boot small{opacity:.65;font-size:12px;max-width:80%;text-align:center}' +
      '.spx-init{position:absolute;inset:0;z-index:9850;display:flex;align-items:center;justify-content:center;background:rgba(0,10,4,.4)}.spx-initc{background:var(--win-bg);color:var(--win-fg);border-radius:20px;box-shadow:var(--shadow);width:min(520px,94%);max-height:94%;overflow:auto;padding:24px;display:flex;flex-direction:column;gap:14px}.spx-initc h2{margin:0;font-size:24px}.spx-initc h2 i{font-style:normal;color:var(--acc)}.spx-initc p{margin:0;color:var(--muted);font-size:13px}' +
      '@media (max-width:640px){.spx{--tb-h:50px}.spx-task{left:6px;right:6px;bottom:6px;padding:0 4px;gap:2px}.spx-tb{min-width:40px;padding:0 5px}.spx-tb .nm,.spx-start-b b,.spx-tray .spx-clk small{display:none}.spx-tb svg{width:27px;height:27px}.spx-start-b{padding:0 5px}.spx-tsep{margin:0 2px}.spx-side{display:none}.spx-start{left:6px;width:calc(100% - 12px)}.spx-sm-g{grid-template-columns:repeat(3,1fr)}.spx-qs,.spx-cal{right:6px}.spx-hb .ttl{max-width:34%}}';
    document.head.appendChild(st);
  }
  function enc(s) { return new TextEncoder().encode(s); }
  function b64enc(u8) { var s = '', CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
  function b64dec(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  var MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'], MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clockHM(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function clockDate(d) { return en() ? DAYS_EN[d.getDay()] + ' ' + MONTHS_EN[d.getMonth()] + ' ' + d.getDate() : DAYS_ES[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_ES[d.getMonth()]; }
  var APPS = [
    { id: 'files', es: 'Archivos', en: 'Files', kw: 'archivos files carpetas folders explorador' },
    { id: 'term', es: 'Terminal', en: 'Terminal', kw: 'terminal consola shell sh comandos linux' },
    { id: 'edit', es: 'Editor de texto', en: 'Text Editor', kw: 'editor texto text notas' },
    { id: 'mon', es: 'Monitor del sistema', en: 'System Monitor', kw: 'monitor procesos cpu memoria system' },
    { id: 'set', es: 'Configuración', en: 'Settings', kw: 'configuracion ajustes settings fondo tema oscuro color' },
    { id: 'about', es: 'Acerca de Snake OS! Pro', en: 'About Snake OS! Pro', kw: 'acerca about sistema version pro snake' }
  ];
  function appName(id) { for (var i = 0; i < APPS.length; i++) if (APPS[i].id === id) return T(APPS[i].es, APPS[i].en); return id; }
  function brand() { return '<span translate="no" data-noi18n>Snake OS<i>!</i> Pro</span>'; }

  window.snakeOSProLogo = LOGO;
  window.renderSnakeVMApp = function (body, opts) {
    opts = opts || {};
    var SA = !!opts.standalone;
    if (SA) DBN = 'snkProWebV1';
    css();
    var dead = false, emu = null, key = SA ? 'snake-os-pro-web' : who(), rec = null, timers = [], ros = [], offs = [];
    var root = document.createElement('div'); root.className = 'snkvm'; body.innerHTML = ''; body.appendChild(root);
    function msg(h) { root.innerHTML = '<div class="snkvm-pick">' + h + '</div>'; }
    function every(fn, ms) { var t = setInterval(fn, ms); timers.push(t); return t; }
    if (!key) { msg('<p>' + T('Inicia sesión en Snake OS para usar las máquinas virtuales.', 'Sign in to Snake OS to use virtual machines.') + '</p>'); return function () {}; }
    msg('<p>' + T('Cargando…', 'Loading…') + '</p>');
    get(key).then(function (r) {
      if (dead) return; rec = r;
      if (rec && upgradeRec(rec)) { M.upgraded = true; if (rec.configured) put(key, rec).catch(function () {}); }
      if (rec && rec.os === OSID) start();
      else if (SA) { rec = { os: OSID, configured: false, created: Date.now() }; start(); }
      else pick();
    }).catch(function () { if (!dead) msg('<p>' + T('Este navegador no permite guardar la máquina (IndexedDB desactivado).', 'This browser cannot store the machine (IndexedDB is disabled).') + '</p>'); });

    function pick() {
      msg('<h3 style="margin:0">' + T('Máquinas virtuales', 'Virtual machines') + '</h3>' +
        '<button type="button" class="snkvm-card" data-os="' + OSID + '">' + LOGO() + '<span><b translate="no" data-noi18n>Snake OS! Pro</b><br><small>' +
        T('Otro sistema operativo de la familia Snake OS: un Linux ligero de verdad (Buildroot + BusyBox) que funciona dentro de tu navegador, sin red, con escritorio de Snake OS: Terminal, Archivos, Editor de texto, Monitor del sistema y Configuración.',
          'Another operating system from the Snake OS family: a real lightweight Linux (Buildroot + BusyBox) running inside your browser, offline, with a Snake OS desktop: Terminal, Files, Text Editor, System Monitor and Settings.') + '</small></span></button>' +
        '<p class="snkvm-note">' + T('Ábrela y ya está instalada, lista para configurar. Cuando la configures quedará fija en este perfil: no se podrá quitar ni cambiar.', 'Open it and it is already installed, ready to set up. Once you set it up it stays fixed on this profile: it cannot be removed or changed.') + '</p>');
      root.querySelector('[data-os]').onclick = function () { rec = { os: OSID, configured: false, created: Date.now() }; start(); };
    }

    /* ================= Escritorio ================= */
    var ui, desk, area, task, appsTb, bootEl, hostName = DEFHOST, sysInfo = {};
    var PINNED = ['files', 'term', 'edit', 'mon', 'set'];
    function bootHTML(sub) { return LOGO() + '<div class="nm">Snake OS<i>!</i> Pro</div><div class="spx-spin"></div><span class="bt"></span>' + (sub ? '<small>' + sub + '</small>' : ''); }
    function start() {
      rec.ui = rec.ui || { wall: 'selva', dark: true, acc: ACC0 };
      if (rec.name) hostName = rec.name;
      root.innerHTML = '';
      ui = document.createElement('div'); ui.className = 'spx'; ui.tabIndex = -1; ui.setAttribute('translate', 'no'); root.appendChild(ui);
      ui.innerHTML = '<div class="spx-desk"></div><div class="spx-area"></div>' +
        '<div class="spx-task spx-glass"><button type="button" class="spx-tb spx-start-b" data-t="start" title="' + T('Inicio', 'Start') + '">' + LOGO() + '<b>Snake OS<i>!</i> Pro</b></button><span class="spx-tsep"></span><div class="spx-apps-tb"></div>' +
        '<div class="spx-tray">' + (SA ? '<button type="button" class="spx-tb" data-t="full" title="' + T('Pantalla completa', 'Full screen') + '">' + SYM.full + '</button>' : '') +
        '<button type="button" class="spx-tb" data-t="qs" title="' + T('Ajustes rápidos', 'Quick settings') + '">' + SYM.net + SYM.vol + '</button>' +
        '<button type="button" class="spx-tb" data-t="cal"><span class="spx-clk"><b></b><small></small></span></button></div></div>';
      desk = ui.querySelector('.spx-desk'); area = ui.querySelector('.spx-area'); task = ui.querySelector('.spx-task'); appsTb = ui.querySelector('.spx-apps-tb');
      applyLook();
      buildBar();
      [['files', IC.home, T('Carpeta personal', 'Home'), 14, function () { launch('files', { path: '/root' }); }],
       ['term', IC.term, T('Terminal', 'Terminal'), 112, function () { launch('term'); }],
       ['about', LOGO(), 'Snake OS! Pro', 210, function () { launch('about'); }]].forEach(function (d) {
        var hi = document.createElement('button'); hi.type = 'button'; hi.className = 'spx-dicon'; hi.dataset.d = d[0]; hi.style.left = '14px'; hi.style.top = d[3] + 'px';
        hi.innerHTML = d[1] + '<span></span>'; hi.querySelector('span').textContent = d[2]; hi.ondblclick = d[4];
        hi.onkeydown = function (e) { if (e.key === 'Enter') d[4](); };
        area.appendChild(hi);
      });
      var tick = function () { var c = ui.querySelector('.spx-clk'), d = new Date(); if (c) { c.querySelector('b').textContent = clockHM(d); c.querySelector('small').textContent = clockDate(d); } };
      tick(); every(tick, 10000);
      ui.querySelector('[data-t="start"]').onclick = function (e) { e.stopPropagation(); toggleStart(); };
      ui.querySelector('[data-t="cal"]').onclick = function (e) { e.stopPropagation(); togglePop('cal'); };
      ui.querySelector('[data-t="qs"]').onclick = function (e) { e.stopPropagation(); togglePop('qs'); };
      var fb = ui.querySelector('[data-t="full"]');
      if (fb) fb.onclick = function () {
        var el = opts.fullEl || document.documentElement;
        try { if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(function () {}); } catch (e) {}
      };
      ui.addEventListener('pointerdown', function (e) {
        if (openPop && !e.target.closest('.spx-pop') && !e.target.closest('.spx-tray .spx-tb')) closePop();
        if (sm && !e.target.closest('.spx-start') && !e.target.closest('[data-t="start"]')) closeStart();
        if (ctxMenu && !e.target.closest('.spx-menu')) closeMenu();
      }, true);
      ui.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { if (ctxMenu) closeMenu(); else if (openPop) closePop(); else if (sm) closeStart(); }
      });
      if (window.ResizeObserver) { var ro = new ResizeObserver(function () { clampAll(); }); ro.observe(area); ros.push(ro); }
      bootEl = document.createElement('div'); bootEl.className = 'spx-boot';
      bootEl.innerHTML = bootHTML(T('Linux ligero emulado en tu navegador', 'Lightweight Linux emulated in your browser'));
      bootText(T('Arrancando…', 'Starting…'));
      ui.appendChild(bootEl);
      startMachine();
    }
    function bootText(t) { if (bootEl) bootEl.querySelector('.bt').textContent = t; }
    function hideBoot() { if (bootEl) { bootEl.remove(); bootEl = null; } }
    var DARK_FG = { '#22c55e': 1, '#14b8a6': 1, '#84cc16': 1, '#eab308': 1 };
    function applyLook() {
      if (!ui) return;
      var u = rec.ui; ui.classList.toggle('dark', !!u.dark);
      var a = u.acc || ACC0;
      ui.style.setProperty('--acc', a); ui.style.setProperty('--acc-fg', DARK_FG[a] ? '#04140a' : '#fff');
      desk.style.backgroundImage = svgUrl((WALLS[u.wall] || WALLS.selva).svg);
    }
    var lookT = null;
    function saveLook() { applyLook(); if (!rec.configured) return; clearTimeout(lookT); lookT = setTimeout(function () { put(key, rec).catch(function () {}); }, 600); }

    /* ---------- Barra de tareas ---------- */
    function buildBar() {
      appsTb.innerHTML = '';
      PINNED.forEach(function (id) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'spx-tb'; b.dataset.app = id; b.title = appName(id);
        b.innerHTML = IC[id] + '<span class="dot"></span>'; b.onclick = function () { taskClick(id); };
        b.onauxclick = function (e) { if (e.button === 1) { e.preventDefault(); var ws = winsOf(id); if (ws.length) closeWin(ws[ws.length - 1]); } };
        b.oncontextmenu = function (e) {
          e.preventDefault(); var ws = winsOf(id), r = b.getBoundingClientRect();
          var items = [{ label: id === 'term' || id === 'files' || id === 'edit' ? T('Nueva ventana', 'New window') : T('Abrir', 'Open'), icon: 'plus', fn: function () { launch(id); } }];
          if (ws.length) items.push('-', { label: ws.length > 1 ? T('Cerrar todas', 'Close all') : T('Cerrar', 'Close'), icon: 'trash', danger: true, fn: function () { ws.forEach(function (w) { closeWin(w); }); } });
          menu(r.left, r.top - 8 - (ws.length ? 96 : 50), items);
        };
        appsTb.appendChild(b);
      });
    }
    function winsOf(id) { return W.filter(function (w) { return w.app === id || (id === 'set' && w.app === 'about'); }); }
    function updateBar() {
      if (!appsTb) return;
      appsTb.querySelectorAll('[data-app]').forEach(function (b) {
        var ws = winsOf(b.dataset.app);
        b.classList.toggle('run', ws.length > 0);
        b.classList.toggle('mz', ws.length > 0 && ws.every(function (w) { return w.min; }));
        b.classList.toggle('on', !!(active && !active.min && (active.app === b.dataset.app)));
        b.title = appName(b.dataset.app) + (ws.length > 1 ? ' (' + ws.length + ')' : '');
      });
    }
    function taskClick(id) {
      closeStart();
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
      closeStart(); opt = opt || {};
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
      var el = document.createElement('div'); el.className = 'spx-win'; el.dataset.app = app;
      el.style.cssText = 'left:' + Math.max(4, Math.min(x, aw - w - 4)) + 'px;top:' + Math.max(4, Math.min(y, ah - h - 4)) + 'px;width:' + w + 'px;height:' + h + 'px';
      el.innerHTML = '<div class="spx-hb"><span class="spx-wico">' + (IC[app] || '') + '</span><div class="l"></div><div class="ttl"></div><div class="r"><span class="rx" style="display:flex;gap:6px;align-items:center"></span>' +
        '<button type="button" class="spx-wc" data-w="min" title="' + T('Minimizar', 'Minimize') + '">' + SYM.min + '</button>' +
        '<button type="button" class="spx-wc" data-w="max" title="' + T('Maximizar', 'Maximize') + '">' + SYM.max + '</button>' +
        '<button type="button" class="spx-wc x" data-w="close" title="' + T('Cerrar', 'Close') + '">' + SYM.close + '</button></div></div><div class="spx-wb"></div>' +
        ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(function (d) { return '<div class="spx-rz ' + d + '" data-rz="' + d + '"></div>'; }).join('');
      area.appendChild(el);
      if (aw < 600) el.classList.add('max'); /* móvil: ventanas a pantalla completa */
      var win = { app: app, el: el, body: el.querySelector('.spx-wb'), hbL: el.querySelector('.spx-hb .l'), hbR: el.querySelector('.spx-hb .rx'), hb: el.querySelector('.spx-hb'), min: false, onclose: null, onresize: null, onfocus: null,
        setTitle: function (t) { el.querySelector('.ttl').textContent = t; win.title = t; } };
      win.setTitle(o.title || appName(app));
      el.querySelector('[data-w="min"]').onclick = function () { minimize(win); };
      el.querySelector('[data-w="max"]').onclick = function () { toggleMax(win); };
      el.querySelector('[data-w="close"]').onclick = function () { closeWin(win); };
      el.addEventListener('pointerdown', function () { if (active !== win) focusWin(win); }, true);
      var hb = win.hb;
      hb.addEventListener('dblclick', function (e) { if (!e.target.closest('button,input,.spx-path,.spx-tabs')) toggleMax(win); });
      hb.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || e.target.closest('button,input,select,.spx-path,.spx-tabs')) return;
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
      updateBar(); if (win.onfocus) win.onfocus();
    }
    function minimize(win) {
      win.min = true; win.el.classList.add('minz'); win.el.classList.remove('act');
      var vis = W.filter(function (w) { return !w.min; }); active = null;
      if (vis.length) focusWin(vis[vis.length - 1]); else updateBar();
    }
    function toggleMax(win) { win.el.classList.toggle('max'); if (win.onresize) setTimeout(win.onresize, 30); }
    function closeWin(win, force) {
      if (!force && win.onclose && win.onclose() === false) return;
      var i = W.indexOf(win); if (i >= 0) W.splice(i, 1);
      win.el.remove(); if (win.ondestroy) try { win.ondestroy(); } catch (e) {}
      if (active === win) { active = null; var vis = W.filter(function (w) { return !w.min; }); if (vis.length) focusWin(vis[vis.length - 1]); }
      updateBar();
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

    /* ---------- Menú Inicio ---------- */
    var sm = null;
    function closeStart() { if (sm) { sm.remove(); sm = null; var b = ui && ui.querySelector('[data-t="start"]'); if (b) b.classList.remove('on'); } }
    function toggleStart() {
      if (sm) return closeStart();
      closePop(); closeMenu();
      sm = document.createElement('div'); sm.className = 'spx-start spx-glass';
      sm.innerHTML = '<div class="spx-sm-h">' + LOGO() + '<div><b translate="no">Snake OS<i>!</i> Pro</b><small>' + T('Linux ligero dentro de tu navegador · sin red', 'Lightweight Linux inside your browser · offline') + '</small></div></div>' +
        '<label class="spx-srch">' + SYM.search + '<input type="text" placeholder="' + T('Buscar apps', 'Search apps') + '"></label>' +
        '<div class="spx-sm-t">' + T('Apps', 'Apps') + '</div><div class="spx-sm-g"></div><div class="spx-sm-ws"></div>' +
        '<div class="spx-sm-f"><div class="who"><i></i><span></span></div>' +
        '<button type="button" data-q="save" title="' + T('Guardar estado ahora', 'Save state now') + '">' + SYM.save + '</button>' +
        '<button type="button" data-q="about" title="' + T('Acerca de Snake OS! Pro', 'About Snake OS! Pro') + '">' + SYM.info + '</button>' +
        '<button type="button" data-q="restart" title="' + T('Reiniciar la máquina', 'Restart the machine') + '">' + SYM.restart + '</button>' +
        (SA && opts.onExit ? '<button type="button" data-q="exit" title="' + T('Guardar y salir', 'Save and exit') + '">' + SYM.exit + '</button>' : '') + '</div>';
      sm.querySelector('.who i').textContent = (hostName.charAt(0) || 'S').toUpperCase();
      sm.querySelector('.who span').textContent = 'root@' + hostName;
      ui.appendChild(sm); ui.querySelector('[data-t="start"]').classList.add('on');
      var g = sm.querySelector('.spx-sm-g'), ws = sm.querySelector('.spx-sm-ws'), inp = sm.querySelector('input');
      var draw = function () {
        var s = inp.value.trim().toLowerCase(); g.innerHTML = '';
        APPS.filter(function (a) { return !s || (a.es + ' ' + a.en + ' ' + a.kw).toLowerCase().indexOf(s) >= 0; }).forEach(function (a, i) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'spx-app' + (s && i === 0 ? ' hl' : ''); b.dataset.app = a.id;
          b.innerHTML = (a.id === 'about' ? LOGO() : IC[a.id]) + '<span></span>'; b.querySelector('span').textContent = a.id === 'about' ? T('Acerca de', 'About') : T(a.es, a.en);
          b.onclick = function () { launch(a.id); }; g.appendChild(b);
        });
        if (!g.childNodes.length) g.innerHTML = '<div class="spx-sm-n">' + T('No hay ninguna app con ese nombre', 'No app matches') + '</div>';
        ws.innerHTML = '';
        if (!s && W.length) {
          ws.innerHTML = '<div class="spx-sm-t">' + T('Ventanas abiertas', 'Open windows') + '</div><div class="spx-sm-w"></div>';
          var lst = ws.querySelector('.spx-sm-w');
          W.slice().reverse().forEach(function (w) {
            var c = document.createElement('button'); c.type = 'button'; c.innerHTML = (IC[w.app] || IC.set) + '<span></span>'; c.querySelector('span').textContent = w.title || appName(w.app);
            c.onclick = function () { closeStart(); focusWin(w); }; lst.appendChild(c);
          });
        }
      };
      draw(); inp.oninput = draw;
      inp.onkeydown = function (e) { if (e.key === 'Enter') { var f = g.querySelector('.spx-app'); if (f) f.click(); } };
      sm.querySelector('[data-q="save"]').onclick = function () { closeStart(); saveState(true); };
      sm.querySelector('[data-q="about"]').onclick = function () { launch('about'); };
      sm.querySelector('[data-q="restart"]').onclick = function () { closeStart(); askRestart(); };
      var ex = sm.querySelector('[data-q="exit"]'); if (ex) ex.onclick = function () { closeStart(); opts.onExit(); };
      if (window.matchMedia && window.matchMedia('(pointer:fine)').matches) setTimeout(function () { try { inp.focus(); } catch (e) {} }, 30);
    }

    /* ---------- Paneles de la bandeja ---------- */
    var openPop = null, openPopKind = '';
    function closePop() { if (openPop) { openPop.remove(); openPop = null; ui.querySelectorAll('.spx-tray .on').forEach(function (b) { b.classList.remove('on'); }); openPopKind = ''; } }
    function togglePop(kind) {
      var was = openPopKind; closePop(); if (was === kind) return;
      closeStart();
      var p = document.createElement('div'); p.className = 'spx-pop spx-glass ' + (kind === 'qs' ? 'spx-qs' : 'spx-cal');
      if (kind === 'cal') {
        var d = new Date(), y = d.getFullYear(), m = d.getMonth(), first = new Date(y, m, 1), off = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
        var full = d.toLocaleDateString(en() ? 'en-GB' : 'es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        var h = '<h4>' + esc(full.charAt(0).toUpperCase() + full.slice(1)) + '</h4><h3>' + clockHM(d) + '</h3><div class="spx-calg">';
        (en() ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['L', 'M', 'X', 'J', 'V', 'S', 'D']).forEach(function (x) { h += '<b>' + x + '</b>'; });
        var prevDays = new Date(y, m, 0).getDate();
        for (var i = 0; i < off; i++) h += '<span class="o">' + (prevDays - off + 1 + i) + '</span>';
        for (var k = 1; k <= days; k++) h += '<span' + (k === d.getDate() ? ' class="t"' : '') + '>' + k + '</span>';
        p.innerHTML = h + '</div>';
      } else {
        p.innerHTML = '<div class="spx-qsr"><button type="button" data-q="save" title="' + T('Guardar estado ahora', 'Save state now') + '">' + SYM.save + '</button><button type="button" data-q="set" title="' + T('Configuración', 'Settings') + '">' + SYM.gear + '</button><button type="button" data-q="restart" title="' + T('Reiniciar la máquina', 'Restart the machine') + '">' + SYM.restart + '</button></div>' +
          '<div class="spx-qsg"><button type="button" class="spx-tile" disabled>' + SYM.net + '<span>' + T('Red', 'Network') + '<small>' + T('Sin conexión', 'Offline') + '</small></span></button>' +
          '<button type="button" class="spx-tile' + (rec.ui.dark ? ' on' : '') + '" data-q="dark">' + SYM.moon + '<span>' + T('Modo oscuro', 'Dark mode') + '</span></button>' +
          '<button type="button" class="spx-tile" disabled>' + SYM.vol + '<span>' + T('Sonido', 'Sound') + '<small>' + T('Sin audio', 'No audio') + '</small></span></button>' +
          '<button type="button" class="spx-tile" data-q="about">' + SYM.info + '<span>' + T('Acerca de', 'About') + '</span></button></div>' +
          '<div class="spx-qsi"></div>';
        p.querySelector('.spx-qsi').textContent = hostName + ' · Snake OS! Pro · ' + T('Linux ligero en tu navegador', 'Lightweight Linux in your browser') + (rec.savedAt ? ' · ' + T('guardado ', 'saved ') + new Date(rec.savedAt).toLocaleTimeString(en() ? 'en-GB' : 'es-ES', { hour: '2-digit', minute: '2-digit' }) : '');
        p.querySelector('[data-q="save"]').onclick = function () { closePop(); saveState(true); };
        p.querySelector('[data-q="set"]').onclick = function () { closePop(); launch('set'); };
        p.querySelector('[data-q="about"]').onclick = function () { closePop(); launch('about'); };
        p.querySelector('[data-q="restart"]').onclick = function () { closePop(); askRestart(); };
        p.querySelector('[data-q="dark"]').onclick = function () { rec.ui.dark = !rec.ui.dark; saveLook(); this.classList.toggle('on', rec.ui.dark); refreshSettings(); };
      }
      ui.appendChild(p); openPop = p; openPopKind = kind;
      ui.querySelector('[data-t="' + kind + '"]').classList.add('on');
    }

    /* ---------- Diálogos, avisos, menús ---------- */
    var toastT = null;
    function toast(t) {
      if (!ui) return; var old = ui.querySelector('.spx-toast'); if (old) old.remove();
      var d = document.createElement('div'); d.className = 'spx-toast'; d.textContent = t; ui.appendChild(d);
      clearTimeout(toastT); toastT = setTimeout(function () { d.remove(); }, 3200);
    }
    function dialog(title, text, buttons, inputVal) {
      return new Promise(function (res) {
        var b = document.createElement('div'); b.className = 'spx-back';
        b.innerHTML = '<div class="spx-dlg"><h3></h3>' + (text ? '<p></p>' : '') + (inputVal != null ? '<input class="spx-in" type="text">' : '') + '<div class="bt"></div></div>';
        b.querySelector('h3').textContent = title; if (text) b.querySelector('p').textContent = text;
        var inp = b.querySelector('input'); if (inp) inp.value = inputVal;
        var bt = b.querySelector('.bt');
        var done = function (v) { b.remove(); res(v); };
        buttons.forEach(function (x) {
          var e = document.createElement('button'); e.type = 'button'; e.className = 'spx-btn ' + (x.cls || ''); e.textContent = x.label;
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
      var m = document.createElement('div'); m.className = 'spx-menu';
      items.forEach(function (it) {
        if (it === '-') { m.appendChild(document.createElement('hr')); return; }
        var b = document.createElement('button'); b.type = 'button'; if (it.danger) b.className = 'dz';
        b.innerHTML = (it.icon ? SYM[it.icon] : '<svg viewBox="0 0 16 16"></svg>') + '<span></span>'; b.querySelector('span').textContent = it.label;
        b.onclick = function () { closeMenu(); it.fn(); }; m.appendChild(b);
      });
      ui.appendChild(m); ctxMenu = m;
      var r = ui.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
      m.style.left = Math.max(4, Math.min(x - r.left, r.width - mw - 4)) + 'px'; m.style.top = Math.max(4, Math.min(y - r.top, r.height - mh - 4)) + 'px';
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
    var PROFILE = "export PS1='\\[\\e[01;32m\\]\\u@\\h\\[\\e[00m\\]:\\[\\e[01;34m\\]\\w\\[\\e[00m\\]\\$ '; alias ls='ls --color=auto'; alias ll='ls -alF'";
    function readmeText(e) {
      var E = arguments.length ? e : en();
      return (function (es, enT) { return E ? enT : es; })('Te damos la bienvenida a Snake OS! Pro.\n\nSnake OS! Pro es un sistema operativo de la familia Snake OS: un Linux ligero de verdad\n(Buildroot + BusyBox) que funciona dentro de tu navegador, con escritorio de Snake OS.\n\n- No tiene conexión a internet.\n- Todo se guarda en este navegador' + (SA ? '.' : ', en tu perfil.') + '\n- Prueba en la Terminal: ls, cat, vi, ps, top, df, uname -a\n',
        'Welcome to Snake OS! Pro.\n\nSnake OS! Pro is an operating system from the Snake OS family: a real lightweight Linux\n(Buildroot + BusyBox) running inside your browser, with a Snake OS desktop.\n\n- It has no internet connection.\n- Everything is saved in this browser' + (SA ? '.' : ', on your profile.') + '\n- Try in the Terminal: ls, cat, vi, ps, top, df, uname -a\n');
    }
    /* Texto de bienvenida que dejaba el escritorio anterior: si el usuario no lo ha cambiado, se pone el nuevo */
    var OLD_README = {
      'Leeme.txt': 'Te damos la bienvenida a tu máquina virtual de Snake OS.\n\nEs un Linux ligero de verdad (Buildroot + BusyBox) que funciona dentro de tu navegador,\ncon un escritorio de Snake OS al estilo de Ubuntu 26.10. No es Ubuntu.\n\n- No tiene conexión a internet.\n- Todo se guarda en este navegador, en tu perfil.\n- Prueba en la Terminal: ls, cat, vi, ps, top, df, uname -a\n',
      'ReadMe.txt': 'Welcome to your Snake OS virtual machine.\n\nIt is a real lightweight Linux (Buildroot + BusyBox) running inside your browser,\nwith a Snake OS desktop styled like Ubuntu 26.10. It is not Ubuntu.\n\n- It has no internet connection.\n- Everything is saved in this browser, on your profile.\n- Try in the Terminal: ls, cat, vi, ps, top, df, uname -a\n'
    };
    function refreshReadme() {
      var p = Promise.resolve(), changed = false;
      Object.keys(OLD_README).forEach(function (f) {
        p = p.then(function () { return readFile('/root/' + f).then(function (r) { if (r.out === OLD_README[f]) { changed = true; return writeFile('/root/' + f, enc(readmeText(f !== 'Leeme.txt'))); } }, function () {}); });
      });
      return p.then(function () { return changed; });
    }
    function initGuest() {
      var dirs = en() ? ['Desktop', 'Documents', 'Downloads', 'Music', 'Pictures', 'Videos'] : ['Escritorio', 'Documentos', 'Descargas', 'Musica', 'Imagenes', 'Videos'];
      var readme = readmeText();
      var f = T('Leeme.txt', 'ReadMe.txt');
      return run('cd /root && mkdir -p ' + dirs.map(q).join(' ') + '; [ -e ' + q(f) + ' ] && echo HAVE')
        .then(function (r) { return writeFile('/root/.profile', enc(PROFILE + '\n')).then(function () { return r.out.indexOf('HAVE') < 0 ? writeFile('/root/' + f, enc(readme)) : null; }); })
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
        if (M.migrated) { if (rec.configured) saveState(false); toast(T('Tu máquina ya es Snake OS! Pro; tus archivos de /root se han conservado.', 'Your machine is now Snake OS! Pro; your /root files were kept.')); }
        else if (M.upgraded) {
          SINK[0].buf = []; try { emu.serial0_send(' clear\n'); } catch (e) {}
          toast(T('Tu máquina ahora es Snake OS! Pro: el mismo Linux con tus mismos archivos.', 'Your machine is now Snake OS! Pro: the same Linux with the same files.'));
          refreshReadme().catch(function () {}).then(function () { if (rec.configured) saveState(false); });
        }
        else if (rec.legacyState) toast(T('No se han podido copiar los archivos de la versión anterior; se guardan aparte sin borrar.', 'Files from the previous version could not be copied; they are kept aside, not deleted.'));
        every(function () { if (rec.configured && !document.hidden) saveState(false); }, 120000);
        if (SA) {
          /* Página propia: al ocultar la pestaña se guarda (no hay Snake OS que cierre la ventana por nosotros) */
          var onVis = function () { if (document.hidden && rec.configured) saveState(false); };
          document.addEventListener('visibilitychange', onVis); offs.push(function () { document.removeEventListener('visibilitychange', onVis); });
        }
      }).catch(function (e) {
        if (dead) return;
        bootText(T('No se ha podido arrancar la máquina', 'Could not start the machine') + (e && e.message ? ' (' + e.message + ')' : ''));
        var sp = bootEl && bootEl.querySelector('.spx-spin'); if (sp) sp.remove();
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
        bootEl = document.createElement('div'); bootEl.className = 'spx-boot'; bootEl.innerHTML = bootHTML(''); ui.appendChild(bootEl);
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
      var d = document.createElement('div'); d.className = 'spx-init';
      d.innerHTML = '<div class="spx-initc"><div style="width:76px">' + LOGO() + '</div><h2>' + T('Te damos la bienvenida a ', 'Welcome to ') + '<span translate="no">Snake OS<i>!</i> Pro</span></h2>' +
        '<p>' + T('Snake OS! Pro es otro sistema operativo de la familia Snake OS. Por dentro es un Linux ligero de verdad que funciona en tu navegador: no se instala nada y no tiene red.', 'Snake OS! Pro is another operating system from the Snake OS family. Inside it is a real lightweight Linux running in your browser: nothing gets installed and it has no network.') + '</p>' +
        '<label style="display:flex;flex-direction:column;gap:6px;font-weight:700">' + T('Nombre del equipo', 'Computer name') + '<input class="spx-in nm" maxlength="24"></label>' +
        '<div style="font-weight:700">' + T('Estilo', 'Style') + '</div><div class="spx-styles"></div>' +
        '<p>' + (SA ? T('Se guarda solo en este navegador (no necesita cuenta de Snake OS).', 'It is saved only in this browser (no Snake OS account needed).') : T('Al configurarla queda fija en este perfil: no se podrá quitar ni cambiar.', 'Once set up it stays fixed on this profile: it cannot be removed or changed.')) + '</p>' +
        '<div style="display:flex;justify-content:flex-end"><button type="button" class="spx-btn sug go" style="height:40px;padding:0 20px">' + (SA ? T('Empezar', 'Start') : T('Configurar y fijar', 'Set up and lock')) + '</button></div></div>';
      ui.appendChild(d);
      d.querySelector('.nm').value = rec.name || DEFHOST;
      styleCards(d.querySelector('.spx-styles'));
      d.querySelector('.go').onclick = function () {
        var nm = (d.querySelector('.nm').value || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 24) || DEFHOST;
        hostName = nm; rec.configured = true; rec.name = nm; rec.configuredAt = Date.now(); rec.fmt = FMT;
        run('hostname ' + q(nm)).catch(function () {}).then(function () { d.remove(); return saveState(false); })
          .then(function () { toast(SA ? T('Listo: Snake OS! Pro se guarda en este navegador', 'Done: Snake OS! Pro is saved in this browser') : T('Máquina configurada y fijada en este perfil', 'Machine set up and locked on this profile')); });
      };
    }
    function styleCards(box) {
      box.innerHTML = '';
      [[false, T('Claro', 'Light')], [true, T('Oscuro', 'Dark')]].forEach(function (s) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'spx-sty' + (!!rec.ui.dark === s[0] ? ' on' : '');
        b.innerHTML = '<i style="background-image:' + esc(svgUrl((WALLS[rec.ui.wall] || WALLS.selva).svg)) + '"><b style="background:' + (s[0] ? '#14201a' : '#f5faf6') + '"></b><em style="background:' + (s[0] ? 'rgba(10,26,17,.75)' : 'rgba(240,250,244,.8)') + '"></em></i><span>' + s[1] + '</span>';
        b.onclick = function () { rec.ui.dark = s[0]; saveLook(); styleCards(box); }; box.appendChild(b);
      });
    }

    /* ================= Apps ================= */
    /* ---------- Snake OS VP Pro (solo con Pro activo en el perfil; sin Pro no cambia nada) ---------- */
    function isPro() { return !SA && !!(window.snkPro && window.snkPro.active && window.snkPro.active()); }
    var TERM0 = null;
    function proTerm(base) { if (!TERM0) TERM0 = base; var t = isPro() && window.snkPro.termTheme ? window.snkPro.termTheme() : null; return t ? Object.assign({}, base, t) : base; }
    function termBox(tm) { try { var box = tm.element && tm.element.parentNode; if (!box) return; var bg = (TERM0 ? proTerm(TERM0) : {}).background || '#06120b'; box.style.background = bg; var vp = box.querySelector('.xterm-viewport'); if (vp) vp.style.setProperty('background', bg, 'important'); } catch (e) {} }
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
          bootEl = document.createElement('div'); bootEl.className = 'spx-boot'; bootEl.innerHTML = bootHTML(''); ui.appendChild(bootEl);
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
      var nb = document.createElement('button'); nb.type = 'button'; nb.className = 'spx-btn flat ic'; nb.title = T('Nueva ventana', 'New window'); nb.innerHTML = SYM.plus; nb.onclick = function () { openTerm(); }; w.hbL.appendChild(nb);
      var box = document.createElement('div'); box.className = 'spx-term'; w.body.appendChild(box);
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
        term = new window.Terminal({ fontFamily: "ui-monospace,'SF Mono',Menlo,Consolas,'DejaVu Sans Mono','Liberation Mono',monospace", fontSize: 14, cursorBlink: true, allowProposedApi: false, scrollback: 3000,
          theme: proTerm({ background: '#06120b', foreground: '#e6f7ec', cursor: '#4ade80', cursorAccent: '#06120b', selectionBackground: 'rgba(74,222,128,0.3)',
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
      w.hbL.innerHTML = '<button type="button" class="spx-btn flat ic" data-f="back" title="' + T('Atrás', 'Back') + '">' + SYM.back + '</button><button type="button" class="spx-btn flat ic" data-f="fwd" title="' + T('Adelante', 'Forward') + '">' + SYM.fwd + '</button>';
      var pathEl = document.createElement('div'); pathEl.className = 'spx-path'; w.hbL.appendChild(pathEl); w.hbL.style.flex = '1'; w.hbL.style.marginRight = '6px';
      w.hbR.innerHTML = '<button type="button" class="spx-btn flat ic" data-f="new" title="' + T('Nueva carpeta', 'New Folder') + '">' + SYM.plus + '</button><button type="button" class="spx-btn flat ic" data-f="menu" title="' + T('Menú', 'Menu') + '">' + SYM.menu + '</button>';
      w.body.innerHTML = '<div class="spx-fm"><div class="spx-side"></div><div class="spx-main"><div class="spx-grid" tabindex="0"></div><div class="spx-stat"></div></div></div><input type="file" multiple style="display:none">';
      var side = w.body.querySelector('.spx-side'), grid = w.body.querySelector('.spx-grid'), stat = w.body.querySelector('.spx-stat'), fileIn = w.body.querySelector('input[type=file]');
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
        w.title = nm; updateBar();
      }
      function load(p) {
        S.path = p; S.sel = null; crumbs(); stat.textContent = T('Cargando…', 'Loading…');
        return run('cd ' + q(p) + ' && for f in .[!.]* ..?* *; do { [ -e "$f" ] || [ -L "$f" ]; } || continue; d=; [ -d "$f" ] && d=d; printf \'%s\\t%s\\t%s\\n\' "$(ls -ldn --full-time --color=never -- "$f")" "$d" "$f"; done', 30000).then(function (r) {
          if (r.rc) { S.items = []; grid.innerHTML = '<div class="spx-empty">' + esc(T('No se puede abrir esta carpeta', 'This folder cannot be opened')) + '<br><small>' + esc(r.out.trim().split('\n')[0] || '') + '</small></div>'; stat.textContent = ''; return; }
          S.items = parseLs(r.out); draw();
        }).catch(function () { grid.innerHTML = '<div class="spx-empty">' + T('La máquina no responde', 'The machine is not responding') + '</div>'; stat.textContent = ''; });
      }
      function draw() {
        grid.innerHTML = '';
        var list = S.items.filter(function (it) { return S.hidden || it.name.charAt(0) !== '.'; });
        if (!list.length) grid.innerHTML = '<div class="spx-empty">' + T('La carpeta está vacía', 'Folder is empty') + '</div>';
        list.forEach(function (it) {
          var d = document.createElement('div'); d.className = 'spx-it' + (it.name.charAt(0) === '.' ? ' hid' : '') + (S.sel === it.name ? ' sel' : ''); d.tabIndex = -1;
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
      grid.oncontextmenu = function (e) { if (e.target.closest('.spx-it')) return; e.preventDefault(); bgMenu(e.clientX, e.clientY); };
      grid.onclick = function (e) { if (!e.target.closest('.spx-it')) { S.sel = null; grid.querySelectorAll('.sel').forEach(function (x) { x.classList.remove('sel'); }); status(); } };
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
      w.hbL.innerHTML = '<button type="button" class="spx-btn" data-e="open">' + T('Abrir', 'Open') + '</button><button type="button" class="spx-btn flat ic" data-e="new" title="' + T('Nuevo documento', 'New Document') + '">' + SYM.plus + '</button>';
      w.hbR.innerHTML = '<button type="button" class="spx-btn" data-e="save">' + T('Guardar', 'Save') + '</button><button type="button" class="spx-btn flat ic" data-e="menu">' + SYM.menu + '</button>';
      w.body.innerHTML = '<textarea class="spx-ta" spellcheck="false" wrap="off"></textarea><div class="spx-stat"><span class="ps"></span><span class="sp" style="flex:1"></span><span>UTF-8</span></div>';
      var ta = w.body.querySelector('textarea'), ps = w.body.querySelector('.ps');
      function title() { var n = E.path ? E.path.slice(E.path.lastIndexOf('/') + 1) : T('Documento sin título', 'Untitled Document'); w.setTitle((E.dirty ? '• ' : '') + n); w.path = E.path; w.hbR.querySelector('[data-e="save"]').classList.toggle('sug', E.dirty); updateBar(); }
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
      var tabs = document.createElement('div'); tabs.className = 'spx-tabs';
      tabs.innerHTML = '<button type="button" data-m="proc" class="on">' + T('Procesos', 'Processes') + '</button><button type="button" data-m="res">' + T('Recursos', 'Resources') + '</button><button type="button" data-m="fs">' + T('Sistemas de archivos', 'File Systems') + '</button>';
      w.hb.querySelector('.ttl').style.display = 'none'; w.hbL.appendChild(tabs); w.hbL.style.position = 'absolute'; w.hbL.style.left = '50%'; w.hbL.style.transform = 'translateX(-50%)';
      w.title = appName('mon');
      w.body.innerHTML = '<div class="pg" data-p="proc" style="display:flex;flex-direction:column;flex:1;min-height:0"><div class="spx-tbl"><table><thead><tr><th data-k="cmd">' + T('Nombre del proceso', 'Process Name') + '</th><th data-k="user">' + T('Usuario', 'User') + '</th><th data-k="pid">PID</th><th data-k="vsz">' + T('Memoria', 'Memory') + '</th><th data-k="stat">' + T('Estado', 'State') + '</th></tr></thead><tbody></tbody></table></div>' +
        '<div class="spx-stat" style="align-items:center"><span class="cnt" style="flex:1"></span><button type="button" class="spx-btn dest kill" disabled style="height:30px">' + T('Finalizar proceso', 'End Process') + '</button></div></div>' +
        '<div class="pg spx-res" data-p="res" style="display:none"><div class="spx-box"><h4>' + T('Historial de la CPU', 'CPU History') + ' <span class="cpu" style="font-weight:400;opacity:.7"></span></h4><canvas></canvas></div>' +
        '<div class="spx-box"><h4>' + T('Memoria', 'Memory') + '</h4><div class="spx-bar"><i class="mb" style="width:0"></i></div><div class="spx-kv"><span class="mt"></span><span class="mf"></span></div></div>' +
        '<div class="spx-box"><h4>' + T('Sistema', 'System') + '</h4><div class="spx-kv"><span>' + T('Tiempo encendida', 'Uptime') + '</span><span class="up"></span></div><div class="spx-kv"><span>' + T('Carga media', 'Load average') + '</span><span class="la"></span></div><div class="spx-kv"><span>' + T('Procesador', 'Processor') + '</span><span>x86 ' + T('emulado (v86)', 'emulated (v86)') + '</span></div></div></div>' +
        '<div class="pg spx-tbl" data-p="fs" style="display:none"><table><thead><tr><th>' + T('Dispositivo', 'Device') + '</th><th>' + T('Directorio', 'Directory') + '</th><th>' + T('Tamaño', 'Size') + '</th><th>' + T('Disponible', 'Available') + '</th><th>' + T('Usado', 'Used') + '</th><th style="width:30%"></th></tr></thead><tbody></tbody></table></div>';
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
        var c = cv.getContext('2d'), acc = getComputedStyle(ui).getPropertyValue('--acc').trim() || ACC0;
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
          fsb.innerHTML = (P[4] || '').split('\n').slice(1).map(function (l) { var m = l.trim().split(/\s+/); if (m.length < 6) return ''; var pc = parseInt(m[4], 10) || 0; return '<tr><td>' + esc(m[0]) + '</td><td>' + esc(m[5]) + '</td><td class="n">' + fmtBytes(+m[1] * 1024) + '</td><td class="n">' + fmtBytes(+m[3] * 1024) + '</td><td class="n">' + fmtBytes(+m[2] * 1024) + ' (' + pc + ' %)</td><td><div class="spx-bar" style="margin:0"><i style="width:' + pc + '%"></i></div></td></tr>'; }).join('');
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
      w.body.innerHTML = '<div class="spx-set"><div class="spx-side"></div><div class="spx-pg"></div></div>';
      var side = w.body.querySelector('.spx-side'), pg = w.body.querySelector('.spx-pg'), curP = page || 'look';
      [['look', T('Apariencia', 'Appearance'), 'gear'], ['wall', T('Fondo', 'Background'), 'root'], ['about', T('Acerca de', 'About'), 'info']].concat(isPro() ? [['pro', 'Pro', 'pro']] : []).forEach(function (p) {
        var b = document.createElement('button'); b.type = 'button'; b.dataset.p = p[0]; b.innerHTML = (p[2] === 'pro' ? '<span style="width:16px;text-align:center">⭐</span>' : (SYM[p[2]] || mini(p[2]))) + '<span>' + p[1] + '</span>'; b.onclick = function () { curP = p[0]; render(); }; side.appendChild(b);
      });
      function row(a, b) { return '<div class="spx-row"><span>' + esc(a) + '</span><span>' + esc(b) + '</span></div>'; }
      function render() {
        side.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.p === curP); });
        if (curP === 'pro' && !isPro()) curP = 'look';
        w.setTitle(curP === 'about' ? T('Acerca de Snake OS! Pro', 'About Snake OS! Pro') : curP === 'wall' ? T('Fondo', 'Background') : curP === 'pro' ? 'Snake OS VP Pro' : T('Apariencia', 'Appearance'));
        if (curP === 'pro') {
          pg.innerHTML = '<h3>' + T('Estilo de terminal Pro', 'Pro terminal style') + '</h3><div class="spx-tsty" style="display:flex;flex-wrap:wrap;gap:10px"></div>' +
            '<h3>' + T('Instantánea Pro', 'Pro snapshot') + '</h3><div class="spx-grp"><div class="spx-row"><span>' + T('Instantánea guardada', 'Saved snapshot') + '</span><span class="sinfo">…</span></div></div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="spx-btn sug stake">' + T('Guardar instantánea', 'Save snapshot') + '</button><button type="button" class="spx-btn srest">' + T('Volver a la instantánea', 'Go back to snapshot') + '</button><button type="button" class="spx-btn dest sdel">' + T('Borrar', 'Delete') + '</button></div>' +
            '<p class="snkvm-note" style="margin:0">' + T('Una ranura por perfil, guardada en este navegador. Volver a ella deja la máquina exactamente como estaba.', 'One slot per profile, saved in this browser. Going back leaves the machine exactly as it was.') + '</p>';
          var ts = pg.querySelector('.spx-tsty'), curS = window.snkPro.termStyle();
          [{ id: '', name: T('Normal', 'Default'), bg: '#06120b', fg: '#e6f7ec' }].concat(window.snkPro.termStyles()).forEach(function (x) {
            var b = document.createElement('button'); b.type = 'button'; b.className = 'spx-btn' + (curS === x.id ? ' sug' : ''); b.dataset.ts = x.id;
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
          pg.innerHTML = '<h3>' + T('Estilo', 'Style') + '</h3><div class="spx-styles"></div><h3>' + T('Color', 'Color') + '</h3><div class="spx-acc"></div>';
          styleCards(pg.querySelector('.spx-styles'));
          var ac = pg.querySelector('.spx-acc');
          ACCENTS.forEach(function (a) { var b = document.createElement('button'); b.type = 'button'; b.title = T(a[1], a[2]); b.style.background = a[0]; if ((rec.ui.acc || ACC0) === a[0]) b.className = 'on'; b.onclick = function () { rec.ui.acc = a[0]; saveLook(); render(); }; ac.appendChild(b); });
        } else if (curP === 'wall') {
          pg.innerHTML = '<h3>' + T('Fondo de escritorio', 'Desktop background') + '</h3><div class="spx-walls"></div><p class="snkvm-note" style="margin:0">' + T('Fondos originales de Snake OS.', 'Original Snake OS backgrounds.') + '</p>';
          var wl = pg.querySelector('.spx-walls');
          Object.keys(WALLS).forEach(function (k) { var b = document.createElement('button'); b.type = 'button'; b.style.backgroundImage = svgUrl(WALLS[k].svg); if (rec.ui.wall === k) b.className = 'on'; b.innerHTML = '<span>' + esc(T(WALLS[k].es, WALLS[k].en)) + '</span>'; b.onclick = function () { rec.ui.wall = k; saveLook(); render(); }; wl.appendChild(b); });
        } else {
          pg.innerHTML = '<div class="spx-about">' + LOGO() + '<h2 translate="no">Snake OS<i>!</i> Pro</h2><b>' + T('Versión 1.0 · familia Snake OS', 'Version 1.0 · Snake OS family') + '</b><p>' +
            T('Snake OS! Pro es un sistema operativo de Snake OS con su propio escritorio. Por dentro funciona un Linux ligero de verdad (Buildroot + BusyBox) emulado en tu navegador con v86: no se instala nada en tu ordenador ni en el servidor, y no tiene conexión a internet.', 'Snake OS! Pro is a Snake OS operating system with its own desktop. Inside, a real lightweight Linux (Buildroot + BusyBox) runs emulated in your browser with v86: nothing is installed on your computer or on the server, and it has no internet connection.') + '</p></div>' +
            '<div class="spx-grp">' + row(T('Nombre del equipo', 'Device name'), hostName) + row(T('Sistema', 'System'), 'Snake OS! Pro 1.0') +
            row(T('Base', 'Base'), (sysInfo.os || 'Buildroot') + (sysInfo.bb ? ' · BusyBox ' + sysInfo.bb : '')) + row(T('Núcleo', 'Kernel'), 'Linux ' + (sysInfo.kernel || '')) +
            row(T('Memoria', 'Memory'), sysInfo.mem ? fmtBytes(sysInfo.mem * 1024) + ' ' + T('utilizables (64 MB emulados)', 'usable (64 MB emulated)') : '64 MB') + row(T('Procesador', 'Processor'), 'x86 ' + T('emulado con v86', 'emulated with v86')) +
            row(T('Red', 'Network'), T('Sin red', 'No network')) +
            row(T('Estado guardado (este navegador)', 'Saved state (this browser)'), rec.stateBytes ? fmtBytes(rec.stateBytes) + (rec.savedAt ? ' · ' + new Date(rec.savedAt).toLocaleString(en() ? 'en-GB' : 'es-ES') : '') : T('Aún no guardado', 'Not saved yet')) +
            row(T('Configurada', 'Set up'), rec.configured ? (SA ? T('Sí · guardada en este navegador', 'Yes · saved in this browser') : T('Sí · fija en este perfil', 'Yes · locked on this profile')) : T('No', 'No')) + '</div>' +
            '<div class="spx-grp">' + row('v86', 'BSD-2') + row('xterm.js', 'MIT') + row('Linux, BusyBox', 'GPLv2') + row(T('Fuentes Inter y Outfit', 'Inter and Outfit fonts'), 'SIL OFL 1.1') + row(T('Logotipo, iconos y fondos', 'Logo, icons and backgrounds'), T('Originales de Snake OS', 'Original Snake OS artwork')) + '</div>';
        }
      }
      w.render = render; w.page = function (p) { curP = p; render(); };
      w.ondestroy = function () { if (setWin === w) setWin = null; };
      render();
      return w;
    }

    /* ---------- Cierre de la app ---------- */
    return function () {
      dead = true; timers.forEach(clearInterval); ros.forEach(function (r) { try { r.disconnect(); } catch (e) {} }); offs.forEach(function (f) { try { f(); } catch (e) {} });
      W.slice().forEach(function (w) { try { if (w.ondestroy) w.ondestroy(); } catch (e) {} });
      agReset();
      var e = emu; emu = null;
      if (e) {
        var fin = function () { try { e.destroy(); } catch (x) {} };
        if (rec && rec.configured && M.ready) {
          return e.save_state().then(gz).then(function (r) { rec.state = r.buf; rec.gz = r.gz; rec.fmt = FMT; rec.stateBytes = r.buf.byteLength; rec.savedAt = Date.now(); return put(key, rec); }).then(fin, fin);
        }
        fin();
      }
      return Promise.resolve();
    };
  };
})();
