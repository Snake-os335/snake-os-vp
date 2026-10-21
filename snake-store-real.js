/* Snake OS · Doganiero Store: apps reales de código abierto (2026-10-21)
   Apps web libres y conocidas (Excalidraw, miniPaint, PDF.js, Ace…) alojadas en el propio servidor de Snake OS
   (/static/assets/sra-*), sin cuentas, sin claves y sin rastreadores. Cada app se abre en una ventana de Snake OS
   dentro de un <iframe srcdoc> del mismo origen con una política CSP que solo deja cargar archivos de Snake OS:
   ninguna app puede conectarse a internet ni a otro servidor.
   · Instalar / desinstalar por perfil con la Store de siempre (lista store_apps del perfil, kind «realapp»).
   · Datos de cada app por perfil: localStorage con prefijo «sra:<correo>:<app>:» y una base IndexedDB propia
     («snkRealAppsV1», clave «<correo>|<app>|<nombre>»). Desinstalar NO borra los datos (al reinstalar vuelven).
   · Idioma ES/EN de Snake OS en las apps que lo permiten.
   Licencias y autores: Store › tarjeta › «Licencia», y third_party/store-real-apps/ en el repositorio. */
(function () {
  'use strict';
  if (window.SnakeRealApps) return;
  var VER = '202610212000', AS = '/static/assets/';
  function en() { try { return !!(window.snakeI18n && window.snakeI18n.lang === 'en'); } catch (e) { return false; } }
  function T(es, e) { return en() ? e : es; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function who() { var u = window.currentUser; return (u && u.email ? String(u.email).trim().toLowerCase() : '') || 'guest'; }
  function theme() { var b = document.body; return b && (b.classList.contains('theme-light') || b.classList.contains('light')) ? 'light' : 'dark'; }

  /* ---------- Catálogo ---------- */
  var LIST = [
    { id: 'oss-excalidraw', title: 'Excalidraw', cat: 'Creatividad', w: 1080, h: 700,
      es: 'Pizarra para dibujar diagramas y bocetos a mano alzada, con formas, flechas, texto e imágenes. Exporta a PNG y SVG.',
      en: 'Whiteboard for hand-drawn diagrams and sketches with shapes, arrows, text and images. Exports to PNG and SVG.',
      lic: 'MIT', author: 'Excalidraw (excalidraw.com)', ver: '0.17.6', size: '4,3 MB', home: 'github.com/excalidraw/excalidraw' },
    { id: 'oss-minipaint', title: 'miniPaint', cat: 'Creatividad', w: 1100, h: 720,
      es: 'Editor de fotos con capas, pinceles, recorte, texto, efectos y filtros. Abre y guarda PNG, JPG y WebP.',
      en: 'Photo editor with layers, brushes, crop, text, effects and filters. Opens and saves PNG, JPG and WebP.',
      lic: 'MIT', author: 'Vilius L. (viliusle)', ver: '4.14.3', size: '1,4 MB', home: 'github.com/viliusle/miniPaint' },
    { id: 'oss-sheet', title: 'x-spreadsheet', cat: 'Productividad', w: 1040, h: 660,
      es: 'Hoja de cálculo con fórmulas (SUMA, MEDIA, SI…), formato de celdas, combinar celdas y varias hojas. Importa y exporta CSV.',
      en: 'Spreadsheet with formulas (SUM, AVERAGE, IF…), cell formatting, merged cells and several sheets. Imports and exports CSV.',
      lic: 'MIT', author: 'myliang', ver: '1.1.9', size: '270 KB', home: 'github.com/myliang/x-spreadsheet' },
    { id: 'oss-pdf', title: 'PDF.js', cat: 'Productividad', w: 900, h: 700,
      es: 'Visor de PDF de Mozilla (el de Firefox): abre tus PDF, busca texto, zoom, miniaturas y modo presentación.',
      en: 'Mozilla’s PDF viewer (the one in Firefox): open your PDFs, search text, zoom, thumbnails and presentation mode.',
      lic: 'Apache-2.0', author: 'Mozilla', ver: '4.10.38', size: '4,2 MB', home: 'github.com/mozilla/pdf.js' },
    { id: 'oss-markdown', title: 'Toast UI Editor', cat: 'Productividad', w: 980, h: 660,
      es: 'Editor de Markdown con vista previa al momento y modo visual: tablas, listas, enlaces y código. Exporta .md y HTML.',
      en: 'Markdown editor with live preview and WYSIWYG mode: tables, lists, links and code. Exports .md and HTML.',
      lic: 'MIT', author: 'NHN Cloud', ver: '3.2.2', size: '705 KB', home: 'github.com/nhn/tui.editor' },
    { id: 'oss-ace', title: 'Ace', cat: 'Productividad', w: 1000, h: 660,
      es: 'Editor de código con colores para más de 20 lenguajes, autocompletado, buscar y reemplazar, varias pestañas y avisos de errores.',
      en: 'Code editor with highlighting for 20+ languages, autocompletion, find and replace, tabs and error hints.',
      lic: 'BSD-3-Clause', author: 'Ajax.org B.V.', ver: '1.36.5', size: '2,7 MB', home: 'github.com/ajaxorg/ace' },
    { id: 'oss-chess', title: 'Ajedrez Stockfish', titleEn: 'Stockfish Chess', cat: 'Juegos', w: 820, h: 660,
      es: 'Ajedrez contra Stockfish, uno de los motores más fuertes del mundo, con 10 niveles. Tablero chessboard.js y reglas chess.js.',
      en: 'Chess against Stockfish, one of the strongest engines in the world, with 10 levels. chessboard.js board and chess.js rules.',
      lic: 'GPL-3.0 · MIT · BSD-2', author: 'Stockfish, Chris Oakman, Jeff Hlywa', ver: '10 · 1.0.0 · 0.10.3', size: '1,1 MB', home: 'github.com/official-stockfish/Stockfish' },
    { id: 'oss-2048', title: '2048', cat: 'Juegos', w: 520, h: 720,
      es: 'El 2048 original: junta los números iguales hasta llegar a la ficha 2048. Con flechas o deslizando el dedo.',
      en: 'The original 2048: join equal numbers to reach the 2048 tile. With the arrow keys or by swiping.',
      lic: 'MIT', author: 'Gabriele Cirulli', ver: '2014', size: '130 KB', home: 'github.com/gabrielecirulli/2048' },
    { id: 'oss-hextris', title: 'Hextris', cat: 'Juegos', w: 640, h: 700,
      es: 'Puzle rápido inspirado en Tetris: gira el hexágono y junta tres bloques del mismo color antes de que se llene.',
      en: 'Fast puzzle inspired by Tetris: rotate the hexagon and match three blocks of the same colour before it fills up.',
      lic: 'GPL-3.0', author: 'Logan Engstrom, Garrett Finucane, Noah Moroze, Michael Yang', ver: '2014', size: '308 KB', home: 'github.com/Hextris/hextris' },
    { id: 'oss-adarkroom', title: 'A Dark Room', cat: 'Juegos', w: 900, h: 660,
      es: 'Aventura de texto famosa: empieza en una habitación oscura con un fuego y descubre el mundo poco a poco. En español.',
      en: 'Famous text adventure: start in a dark room with a fire and slowly discover the world.',
      lic: 'MPL-2.0', author: 'Doublespeak Games (Michael Townsend)', ver: '1.4', size: '2,9 MB', home: 'github.com/doublespeakgames/adarkroom' },
    { id: 'oss-qr', title: 'Códigos QR', titleEn: 'QR Codes', cat: 'Utilidades', w: 860, h: 640,
      es: 'Crea códigos QR (texto, enlaces, wifi, contactos) en PNG o SVG y lee QR con la cámara o desde una imagen. Todo en tu dispositivo.',
      en: 'Create QR codes (text, links, wifi, contacts) as PNG or SVG and read QR codes with the camera or from an image. All on your device.',
      lic: 'MIT · Apache-2.0', author: 'Kazuhiko Arase (qrcode-generator), Cosmo Wolfe (jsQR)', ver: '1.4.4 · 1.4.0', size: '326 KB', home: 'github.com/cozmo/jsQR' }
  ];
  var BY = {};
  LIST.forEach(function (a) { BY[a.id] = a; });
  function iconUrl(a) { return AS + 'sra-ic-' + a.id.replace(/^oss-/, '') + '.svg?v=' + VER; }
  function iconHtml(a) { return '<img class="app-icon-img sra-ic" src="' + iconUrl(a) + '" alt="" draggable="false">'; }
  function credit(a) { return T('App de código abierto', 'Open-source app') + ' · ' + T('licencia', 'licence') + ' ' + a.lic + ' · ' + a.author; }

  // Textos de la Store en inglés para el traductor de Snake OS (mismo objeto que usa snake-i18n.js)
  try {
    var D = window.__SNK_I18N_EN = window.__SNK_I18N_EN || {};
    LIST.forEach(function (a) { D[a.es] = a.en; if (a.titleEn) D[a.title] = a.titleEn; });
  } catch (e) {}

  function catalogEntry(a) { return { id: a.id, title: a.title, icon: iconHtml(a), cat: a.cat, desc: a.es, kind: 'realapp', w: a.w, h: a.h, oss: 1 }; }
  function addToCatalog() {
    try {
      if (typeof DOGANIERO_STORE_CATALOG === 'undefined' || !Array.isArray(DOGANIERO_STORE_CATALOG)) return false;
      if (DOGANIERO_STORE_CATALOG.some(function (x) { return x && x.kind === 'realapp'; })) return true;
      // Primero en la Store (orden «Destacadas»); las apps de siempre siguen igual detrás.
      DOGANIERO_STORE_CATALOG.unshift.apply(DOGANIERO_STORE_CATALOG, LIST.map(catalogEntry));
      return true;
    } catch (e) { return false; }
  }

  /* ---------- Datos por perfil (IndexedDB del padre: sobrevive al cierre del iframe) ---------- */
  var dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise(function (res, rej) {
      var r = indexedDB.open('snkRealAppsV1', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { dbP = null; rej(r.error); };
    });
    return dbP;
  }
  function dbGet(k) { return db().then(function (d) { return new Promise(function (res, rej) { var q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { res(q.result == null ? null : q.result); }; q.onerror = function () { rej(q.error); }; }); }); }
  function dbPut(k, v) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = function () { res(true); }; t.onerror = function () { rej(t.error); }; }); }); }

  /* ---------- Páginas de las apps (assets/sra-<app>-page.js) ---------- */
  var pages = {}, pageWait = {};
  window.__sraPage = function (id, page) { pages[id] = page; (pageWait[id] || []).forEach(function (f) { f(page); }); delete pageWait[id]; };
  function loadPage(id) {
    if (pages[id]) return Promise.resolve(pages[id]);
    return new Promise(function (res, rej) {
      var first = !pageWait[id];
      (pageWait[id] = pageWait[id] || []).push(res);
      if (!first) return;
      var s = document.createElement('script');
      s.src = AS + 'sra-' + id.replace(/^oss-/, '') + '-page.js?v=' + VER;
      s.onerror = function () { delete pageWait[id]; rej(new Error('page')); };
      document.head.appendChild(s);
    });
  }
  var CSP = "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline' blob: data:; img-src 'self' blob: data:; font-src 'self' blob: data:; connect-src 'self' blob: data:; media-src 'self' blob: data: mediastream:; worker-src 'self' blob:; frame-src 'self' blob: data:; object-src 'none'; form-action 'none'";
  // Arranque dentro del iframe: localStorage con prefijo por perfil y app + ayudante SRA (guardar/cargar en IndexedDB).
  function shim(cfg) {
    return '(' + function (c) {
      var P = window.parent, K = 'sra:' + c.p + ':' + c.a + ':', real = null, mem = {};
      try { real = P.localStorage; } catch (e) {}
      function keys() { var o = []; try { if (real) { for (var i = 0; i < real.length; i++) { var k = real.key(i); if (k && k.indexOf(K) === 0) o.push(k.slice(K.length)); } } else o = Object.keys(mem); } catch (e) {} return o; }
      var api = {
        getItem: function (k) { k = String(k); try { return real ? real.getItem(K + k) : (k in mem ? mem[k] : null); } catch (e) { return null; } },
        setItem: function (k, v) { k = String(k); v = String(v); try { if (real) real.setItem(K + k, v); else mem[k] = v; } catch (e) { if (!real) mem[k] = v; } },
        removeItem: function (k) { k = String(k); try { if (real) real.removeItem(K + k); else delete mem[k]; } catch (e) {} },
        clear: function () { keys().forEach(function (k) { api.removeItem(k); }); },
        key: function (i) { return keys()[i] == null ? null : keys()[i]; }
      };
      var ls = new Proxy(api, {
        get: function (t, p) { if (p === 'length') return keys().length; if (typeof p === 'symbol' || Object.prototype.hasOwnProperty.call(t, p)) return t[p]; var v = t.getItem(p); return v === null ? undefined : v; },
        set: function (t, p, v) { if (Object.prototype.hasOwnProperty.call(t, p)) return true; t.setItem(p, v); return true; },
        has: function (t, p) { return Object.prototype.hasOwnProperty.call(t, p) || p === 'length' || t.getItem(p) !== null; },
        deleteProperty: function (t, p) { t.removeItem(p); return true; },
        ownKeys: function (t) { return Reflect.ownKeys(t).concat(keys().filter(function (k) { return !Object.prototype.hasOwnProperty.call(t, k); })); },
        getOwnPropertyDescriptor: function (t, p) { if (Object.prototype.hasOwnProperty.call(t, p)) return Reflect.getOwnPropertyDescriptor(t, p); var v = t.getItem(p); return v === null ? undefined : { value: v, enumerable: true, configurable: true, writable: true }; }
      });
      try { Object.defineProperty(window, 'localStorage', { configurable: true, enumerable: true, get: function () { return ls; } }); } catch (e) {}
      var S = P.SnakeRealApps, pre = c.p + '|' + c.a + '|';
      // Cookies propias de cada app y perfil (nunca tocan las cookies de Snake OS).
      try {
        var jar = {}; try { jar = JSON.parse(api.getItem('__cookies') || '{}') || {}; } catch (e) {}
        Object.defineProperty(document, 'cookie', { configurable: true,
          get: function () { return Object.keys(jar).map(function (k) { return k + '=' + jar[k]; }).join('; '); },
          set: function (v) {
            var parts = String(v).split(';'), kv = parts.shift(), i = kv.indexOf('='); if (i < 1) return;
            var k = kv.slice(0, i).trim(), val = kv.slice(i + 1).trim(), del = false;
            parts.forEach(function (p) { var q = p.trim().toLowerCase(); if (q.indexOf('max-age=') === 0 && parseInt(q.slice(8), 10) <= 0) del = true; if (q.indexOf('expires=') === 0) { var t = Date.parse(p.trim().slice(8)); if (t && t < Date.now()) del = true; } });
            if (del) delete jar[k]; else jar[k] = val;
            api.setItem('__cookies', JSON.stringify(jar));
          } });
      } catch (e) {}
      window.SRA = {
        app: c.a, profile: c.p, lang: c.l, en: c.l === 'en', theme: c.t, ver: c.v,
        T: function (es, e) { return c.l === 'en' ? e : es; },
        load: function (k) { return S.dbGet(pre + k); },
        save: function (k, v) { return S.dbPut(pre + k, v); },
        closing: [], onClose: function (f) { this.closing.push(f); },
        download: function (blob, name) { var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 4000); }
      };
    }.toString() + ')(' + JSON.stringify(cfg).replace(/</g, '\\u003c') + ');';
  }
  function buildDoc(a, page) {
    var cfg = { a: a.id, p: who(), l: en() ? 'en' : 'es', t: theme(), v: VER };
    var head = page.head || '', body = page.body || '';
    if (page.i18n && cfg.l === 'en' && page.i18n.en) { head = page.i18n.en.head || head; body = page.i18n.en.body || body; }
    head = head.replace(/@@V@@/g, VER); body = body.replace(/@@V@@/g, VER);
    return '<!DOCTYPE html><html lang="' + cfg.l + '"' + (page.htmlAttr ? ' ' + page.htmlAttr : '') + '><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<base href="' + AS + '"><script>' + shim(cfg) + '<\/script>' + head + '</head><body' + (page.bodyAttr ? ' ' + page.bodyAttr : '') + '>' + body + '</body></html>';
  }

  /* ---------- Ventana de la app ---------- */
  function ensureCss() {
    if (document.getElementById('sra-css')) return;
    var st = document.createElement('style'); st.id = 'sra-css';
    st.textContent = [
      '[id^="win-storeapp-oss-"] .win-body{padding:0 !important;overflow:hidden !important;display:flex;flex-direction:column;}',
      '.sra-wrap{position:relative;flex:1 1 auto;min-height:0;width:100%;height:100%;background:#fff;}',
      '.sra-wrap.dark{background:#121212;}',
      '.sra-frame{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:transparent;}',
      '.sra-load{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font:600 14px/1.3 Inter,system-ui,sans-serif;color:#cfe;background:linear-gradient(160deg,#0f2a1c,#0b1a12);z-index:2;transition:opacity .25s;}',
      '.sra-load img{width:64px;height:64px;border-radius:16px;box-shadow:0 6px 20px rgba(0,0,0,.35);}',
      '.sra-load i{width:26px;height:26px;border-radius:50%;border:3px solid rgba(255,255,255,.25);border-top-color:#34d17a;animation:sraSpin .8s linear infinite;}',
      '.sra-load.err i{display:none;}',
      '.sra-load.gone{opacity:0;pointer-events:none;}',
      '@keyframes sraSpin{to{transform:rotate(360deg)}}',
      'body.sra-dragging iframe.sra-frame{pointer-events:none !important;}',
      'img.app-icon-img.sra-ic{object-fit:contain !important;background:transparent !important;}',
      '.desktop-icon .ic img.app-icon-img.sra-ic{width:44px;height:44px;border-radius:11px;}',
      '.start-item img.app-icon-img.sra-ic{width:1.35em;height:1.35em;vertical-align:-0.2em;margin-right:4px;border-radius:4px;}',
      '.store-card-ic img.sra-ic{width:40px;height:40px;border-radius:10px;display:block;box-shadow:0 2px 8px rgba(0,0,0,.25);}',
      '.store-card .sra-credit{font-size:.66rem;line-height:1.3;color:var(--muted);opacity:.95;}',
      '.store-card .sra-credit b{font-weight:800;color:#34d17a;}',
      'body.theme-light .store-card .sra-credit b,body.light .store-card .sra-credit b{color:#1f7a45;}',
      '.store-card .sra-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}',
      '.store-card .sra-row button.sra-mini{width:auto !important;padding:4px 9px !important;font-size:.68rem !important;border-radius:8px !important;font-weight:700;opacity:.9;}',
      '.store-card.sra-card .store-card-cat::after{content:" · " attr(data-sra-badge);font-weight:800;color:#34d17a;}',
      '.sra-lic{height:100%;overflow:auto;padding:14px 16px;box-sizing:border-box;font:13px/1.45 Inter,system-ui,sans-serif;}',
      '.sra-lic h3{margin:0 0 4px;font-size:1rem;}',
      '.sra-lic p{margin:0 0 10px;color:var(--muted);}',
      '.sra-lic pre{white-space:pre-wrap;word-break:break-word;font:11.5px/1.4 ui-monospace,Menlo,Consolas,monospace;background:rgba(0,0,0,.18);padding:10px 12px;border-radius:10px;margin:0 0 12px;}'
    ].join('\n');
    document.head.appendChild(st);
  }
  // Mientras se arrastra o se cambia el tamaño de una ventana, los iframes no se quedan los eventos del ratón.
  document.addEventListener('pointerdown', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('.win-titlebar, .snk-rz, [class*="resize"]')) document.body.classList.add('sra-dragging');
  }, true);
  function endDrag() { if (document.body) document.body.classList.remove('sra-dragging'); }
  document.addEventListener('pointerup', endDrag, true);
  document.addEventListener('pointercancel', endDrag, true);
  window.addEventListener('blur', function () { setTimeout(endDrag, 0); });

  function render(container, meta) {
    ensureCss();
    var a = BY[meta && meta.id];
    container.innerHTML = '';
    if (!a) { container.textContent = T('App no disponible.', 'App not available.'); return function () {}; }
    var win = container.closest ? container.closest('.app-window') : null;
    var phone = document.body.classList.contains('phone-mode');
    if (win && !phone && !win.classList.contains('maximized')) {
      // Que quepa en la pantalla aunque la app pida una ventana grande
      var W = Math.min(a.w, window.innerWidth - 16), H = Math.min(a.h, window.innerHeight - 64);
      win.style.width = W + 'px'; win.style.height = H + 'px';
      var L = parseInt(win.style.left, 10) || 0, Tp = parseInt(win.style.top, 10) || 0;
      if (L + W > window.innerWidth - 6) win.style.left = Math.max(6, window.innerWidth - W - 8) + 'px';
      if (Tp + H > window.innerHeight - 56) win.style.top = Math.max(6, window.innerHeight - H - 60) + 'px';
    }
    var wrap = document.createElement('div');
    wrap.className = 'sra-wrap' + (theme() === 'dark' ? ' dark' : '');
    wrap.innerHTML = '<div class="sra-load"><img src="' + iconUrl(a) + '" alt=""><span></span><i></i></div>';
    wrap.querySelector('.sra-load span').textContent = T('Abriendo ', 'Opening ') + T(a.title, a.title === 'Ajedrez Stockfish' ? 'Stockfish Chess' : a.title) + '…';
    container.appendChild(wrap);
    var frame = null, dead = false;
    loadPage(a.id).then(function (page) {
      if (dead) return;
      frame = document.createElement('iframe');
      frame.className = 'sra-frame';
      frame.title = a.title;
      frame.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen; camera; microphone');
      frame.addEventListener('load', function () {
        if (dead) return;
        var ld = wrap.querySelector('.sra-load');
        setTimeout(function () { if (ld) ld.classList.add('gone'); }, page.readyDelay || 120);
        try {
          var cw = frame.contentWindow;
          cw.addEventListener('pointerdown', function () { try { if (win && typeof focusWindow === 'function') focusWindow(win); } catch (e) {} }, true);
          if (!phone) setTimeout(function () { try { cw.focus(); } catch (e) {} }, 60);
        } catch (e) {}
      });
      frame.srcdoc = buildDoc(a, page);
      wrap.appendChild(frame);
    }).catch(function () {
      var ld = wrap.querySelector('.sra-load');
      if (ld) { ld.classList.add('err'); ld.querySelector('span').textContent = T('No se pudo abrir la app. Comprueba la conexión y vuelve a intentarlo.', 'The app could not be opened. Check your connection and try again.'); }
    });
    return function () {
      dead = true;
      try { var S = frame && frame.contentWindow && frame.contentWindow.SRA; if (S) S.closing.forEach(function (f) { try { f(); } catch (e) {} }); } catch (e) {}
      try { if (frame) { frame.srcdoc = ''; frame.remove(); } } catch (e) {}
    };
  }

  /* ---------- Store: tarjetas, licencia, desinstalar ---------- */
  var licP = null;
  function loadLic() {
    if (window.__sraLic) return Promise.resolve(window.__sraLic);
    if (licP) return licP;
    licP = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = AS + 'sra-licenses.js?v=' + VER;
      s.onload = function () { res(window.__sraLic || {}); }; s.onerror = function () { licP = null; rej(new Error('lic')); };
      document.head.appendChild(s);
    });
    return licP;
  }
  function openLicense(id) {
    var a = BY[id]; if (!a || typeof openWindowGeneric !== 'function') return;
    openWindowGeneric('sra-lic-' + id, T('Licencia', 'Licence') + ' · ' + a.title, iconHtml(a), 600, 560, function (body) {
      ensureCss();
      body.innerHTML = '<div class="sra-lic"><h3></h3><p></p><div class="sra-lic-t">' + esc(T('Cargando…', 'Loading…')) + '</div></div>';
      body.querySelector('h3').textContent = a.title + ' ' + a.ver;
      body.querySelector('p').textContent = credit(a) + ' · ' + a.home + ' · ' + T('Alojada en el servidor de Snake OS, sin conexión a otros servidores.', 'Hosted on the Snake OS server, with no connection to other servers.');
      loadLic().then(function (L) {
        var parts = (L[id] || []), box = body.querySelector('.sra-lic-t'); box.innerHTML = '';
        parts.forEach(function (p) { var h = document.createElement('b'); h.textContent = p[0]; var pre = document.createElement('pre'); pre.textContent = p[1]; box.appendChild(h); box.appendChild(pre); });
      }).catch(function () { body.querySelector('.sra-lic-t').textContent = T('No se pudo cargar la licencia.', 'The licence could not be loaded.'); });
      return function () {};
    });
  }
  function enhanceCards(grid) {
    ensureCss();
    var cards = grid.querySelectorAll('.store-card[data-app-id^="oss-"]');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        var id = card.getAttribute('data-app-id'), a = BY[id]; if (!a) return;
        card.classList.add('sra-card');
        var ic = card.querySelector('.store-card-ic'); if (ic && !ic.querySelector('img')) ic.innerHTML = iconHtml(a);
        var nm = card.querySelector('.store-card-name'); if (nm) nm.setAttribute('translate', 'no');
        var ct = card.querySelector('.store-card-cat'); if (ct) ct.setAttribute('data-sra-badge', T('Código abierto', 'Open source'));
        var installed = typeof isStoreAppInstalled === 'function' && isStoreAppInstalled(id);
        var cr = card.querySelector('.sra-credit');
        if (!cr) { cr = document.createElement('div'); cr.className = 'sra-credit'; var d = card.querySelector('.store-card-desc'); card.insertBefore(cr, d ? d.nextSibling : null); }
        cr.innerHTML = '<b></b> · <span></span>';
        cr.querySelector('b').textContent = T('App de código abierto', 'Open-source app');
        cr.querySelector('span').textContent = T('licencia', 'licence') + ' ' + a.lic + ' · ' + a.author + ' · ' + T(a.size, a.size.replace(',', '.'));
        cr.setAttribute('translate', 'no');
        var row = card.querySelector('.sra-row');
        if (!row) { row = document.createElement('div'); row.className = 'sra-row'; card.insertBefore(row, cr.nextSibling); }
        row.innerHTML = '';
        var lb = document.createElement('button'); lb.type = 'button'; lb.className = 'sra-mini'; lb.textContent = T('Licencia', 'Licence');
        lb.addEventListener('click', function (e) { e.stopPropagation(); openLicense(id); });
        row.appendChild(lb);
        if (installed) {
          var ub = document.createElement('button'); ub.type = 'button'; ub.className = 'sra-mini sra-uninstall'; ub.textContent = T('Desinstalar', 'Uninstall');
          ub.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!confirm(T('¿Desinstalar ' + a.title + ' de este perfil? Lo que hayas guardado en la app se conserva por si la vuelves a instalar.', 'Uninstall ' + a.title + ' from this profile? What you saved in the app is kept in case you install it again.'))) return;
            try { uninstallStoreApp(id); } catch (er) {}
          });
          row.appendChild(ub);
        }
      })(cards[i]);
    }
  }
  function hookStoreExtras() {
    var X = window.SnakeStoreExtras;
    if (!X || X.__sra) return !!X;
    var orig = X.afterPaint;
    X.afterPaint = function (grid, list, isInstalled) {
      var r;
      try { r = orig.apply(this, arguments); } catch (e) {}
      try { enhanceCards(grid); } catch (e2) {}
      return r;
    };
    X.__sra = 1;
    return true;
  }

  /* ---------- Abrir y listar (menú Inicio, buscador) ---------- */
  function installed() {
    try { return (typeof getInstalledStoreApps === 'function' ? getInstalledStoreApps() : []).filter(function (x) { return x && BY[x.id]; }).map(function (x) { return BY[x.id]; }); } catch (e) { return []; }
  }
  function open(id) { if (BY[id] && typeof openStoreInstalledApp === 'function') openStoreInstalledApp(id); }
  function launchables() {
    return installed().map(function (a) { return { id: a.id, title: a.titleEn ? T(a.title, a.titleEn) : a.title, iconHtml: iconHtml(a), iconUrl: iconUrl(a), run: function () { open(a.id); } }; });
  }
  function hookGlobals() {
    if (typeof window.renderStoreMiniApp === 'function' && !window.renderStoreMiniApp.__sra) {
      var origR = window.renderStoreMiniApp;
      var wrapped = function (container, meta) {
        if (meta && meta.kind === 'realapp' && BY[meta.id]) return render(container, meta);
        return origR.apply(this, arguments);
      };
      wrapped.__sra = 1;
      window.renderStoreMiniApp = wrapped;
    }
    if (typeof window.buildStartMenu === 'function' && !window.buildStartMenu.__sra) {
      var origB = window.buildStartMenu;
      var wb = function () {
        var r = origB.apply(this, arguments);
        try {
          var m = document.getElementById('startMenu'), sep = m && m.querySelector('.start-sep');
          if (m && sep && m.querySelector('.start-item[data-app]')) {
            launchables().forEach(function (x) {
              var b = document.createElement('button'); b.type = 'button'; b.className = 'start-item sra-start'; b.dataset.sra = x.id;
              b.innerHTML = x.iconHtml + ' '; b.appendChild(document.createTextNode(x.title)); b.setAttribute('translate', 'no');
              b.addEventListener('click', function () { try { if (typeof closeStartMenu === 'function') closeStartMenu(); } catch (e) {} x.run(); });
              m.insertBefore(b, sep);
            });
          }
        } catch (e) {}
        return r;
      };
      wb.__sra = 1;
      window.buildStartMenu = wb;
    }
  }

  /* ---------- Inicio estilo 11 (#sm11) y buscador de apps (#appLauncher): se añaden las apps instaladas sin tocar esos archivos ---------- */
  function match(x, q) { return !q || x.title.toLowerCase().indexOf(q) >= 0 || x.id.indexOf(q) >= 0 || (BY[x.id].titleEn || '').toLowerCase().indexOf(q) >= 0 || BY[x.id].title.toLowerCase().indexOf(q) >= 0; }
  function sm11Fill() {
    var p = document.getElementById('sm11'), g = p && p.querySelector('[data-grid]'); if (!g || g.querySelector('.sra-tile')) return;
    var qi = p.querySelector('[data-q]'), q = String(qi && qi.value || '').trim().toLowerCase();
    var L = launchables().filter(function (x) { return match(x, q); }); if (!L.length) return;
    var none = g.querySelector('.sm11-none'); if (none) none.remove();
    L.forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sm11-app sra-tile'; b.dataset.sra = x.id; b.title = x.title; b.setAttribute('translate', 'no');
      b.innerHTML = '<span class="sm11-ico"><img src="' + x.iconUrl + '" alt="" draggable="false"></span><span class="sm11-lab"></span>';
      b.querySelector('.sm11-lab').textContent = x.title;
      b.addEventListener('click', function (e) { e.stopPropagation(); try { window.snkStart11 && window.snkStart11.close(); } catch (er) {} x.run(); });
      g.appendChild(b);
    });
  }
  function alFill() {
    var l = document.getElementById('alList'); if (!l || l.querySelector('.sra-al')) return;
    var qi = document.getElementById('alInput'), q = String(qi && qi.value || '').trim().toLowerCase();
    var L = launchables().filter(function (x) { return match(x, q); }); if (!L.length) return;
    var none = l.querySelector('.al-empty'); if (none) none.remove();
    L.forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'al-item sra-al'; b.setAttribute('translate', 'no');
      b.innerHTML = '<span class="al-ico">' + x.iconHtml + '</span><span></span>'; b.lastChild.textContent = x.title;
      b.addEventListener('click', function () { var box = document.getElementById('appLauncher'); if (box) box.dispatchEvent(new MouseEvent('click', { bubbles: true })); x.run(); });
      l.appendChild(b);
    });
  }
  function hookLists() {
    var p = document.getElementById('sm11'), g = p && p.querySelector('[data-grid]');
    if (g && !g.__sra) { g.__sra = 1; new MutationObserver(sm11Fill).observe(g, { childList: true }); sm11Fill(); }
    var l = document.getElementById('alList');
    if (l && !l.__sra) { l.__sra = 1; new MutationObserver(alFill).observe(l, { childList: true }); alFill(); }
    return !!(g && l);
  }
  // Intro en el buscador cuando solo aparecen apps de código abierto
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var t = e.target;
    if (t && t.id === 'alInput') { var l = document.getElementById('alList'); if (l && !l.querySelector('.al-item:not(.sra-al)')) { var f = l.querySelector('.sra-al'); if (f) { e.preventDefault(); e.stopImmediatePropagation(); f.click(); } } }
    else if (t && t.matches && t.matches('#sm11 [data-q]')) { var g = document.querySelector('#sm11 [data-grid]'); if (g && !g.querySelector('[data-app]')) { var f2 = g.querySelector('.sra-tile'); if (f2) { e.preventDefault(); e.stopImmediatePropagation(); f2.click(); } } }
  }, true);

  window.SnakeRealApps = { list: LIST, byId: BY, render: render, open: open, launchables: launchables, openLicense: openLicense, dbGet: dbGet, dbPut: dbPut, iconHtml: function (id) { return BY[id] ? iconHtml(BY[id]) : ''; }, ver: VER };

  function init() {
    addToCatalog();
    hookGlobals();
    if (!hookStoreExtras()) setTimeout(hookStoreExtras, 1500);
    try { if (document.querySelector('#startMenu .start-item') && typeof buildStartMenu === 'function') buildStartMenu(); } catch (e) {}
    if (!hookLists()) { var n = 0, iv = setInterval(function () { if (hookLists() || ++n > 40) clearInterval(iv); }, 1500); }
  }
  init();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
})();
