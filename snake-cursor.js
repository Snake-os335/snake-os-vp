/* Snake OS · Cursor propio (2026-10-09)
   Cursor Snake (flecha verde con ojo, cabeza de serpiente para enlaces, I-beam, serpiente enroscada
   para esperar, mover y redimensionar). Solo en el modo ordenador con ratón; nunca en el modo
   teléfono, con el puntero bloqueado ni en la vista en primera persona del Metaverse.
   Ajuste por perfil: «Snake» (por defecto) o «Sistema». Compatible con «Cursor grande» (48 px)
   y con «Alto contraste» (variante negra, blanca y amarilla).
   No toca las hojas de estilo existentes: genera una hoja aparte (#snkCursorGen) que copia cada regla
   con «cursor» con más prioridad, así se respetan :disabled, none, crosshair, etc. */
(function () {
  'use strict';
  if (window.__snkCursor) return;
  window.__snkCursor = true;

  var BASE = '/static/assets/snk-cur-';
  var VER = '202610100905';
  /* nombre → [hotspot x, hotspot y, fallback] en 32 px */
  var CUR = {
    arrow: [3, 2, 'default'], hand: [13, 1, 'pointer'], text: [16, 16, 'text'], wait: [16, 16, 'wait'],
    progress: [16, 16, 'wait'], move: [16, 16, 'move'], ew: [16, 16, 'ew-resize'], ns: [16, 16, 'ns-resize'],
    nwse: [16, 16, 'nwse-resize'], nesw: [16, 16, 'nesw-resize']
  };
  var MAP = {
    'default': 'arrow', auto: 'arrow', pointer: 'hand', grab: 'hand', grabbing: 'hand', text: 'text', 'vertical-text': 'text',
    wait: 'wait', progress: 'wait', move: 'move', 'all-scroll': 'move',
    'ew-resize': 'ew', 'e-resize': 'ew', 'w-resize': 'ew', 'col-resize': 'ew',
    'ns-resize': 'ns', 'n-resize': 'ns', 's-resize': 'ns', 'row-resize': 'ns',
    'nwse-resize': 'nwse', 'nw-resize': 'nwse', 'se-resize': 'nwse',
    'nesw-resize': 'nesw', 'ne-resize': 'nesw', 'sw-resize': 'nesw'
  };
  var KEEP = ['none', 'crosshair', 'not-allowed', 'no-drop', 'zoom-in', 'zoom-out', 'copy', 'alias', 'help', 'cell', 'context-menu'];

  function cu() { try { return (typeof currentUser !== 'undefined' && currentUser) || window.currentUser || null; } catch (e) { return window.currentUser || null; } }
  function email() { var u = cu(); return u && u.email ? String(u.email).toLowerCase() : ''; }
  function key() { return 'snkcur:' + (email() || 'guest'); }
  function getPref() { try { return localStorage.getItem(key()) === 'system' ? 'system' : 'snake'; } catch (e) { return 'snake'; } }
  function setPref(v) { try { localStorage.setItem(key(), v === 'system' ? 'system' : 'snake'); } catch (e) {} apply(); }

  function varsCss() {
    var out = '';
    [['', '', 1], ['.snk-cur-hc', '-hc', 1], ['.snk-cur-big', '-big', 1.5], ['.snk-cur-hc.snk-cur-big', '-hc-big', 1.5]].forEach(function (v) {
      var decl = Object.keys(CUR).map(function (n) {
        var c = CUR[n];
        return '--snkc-' + n + ':url("' + BASE + n + v[1] + '.svg?v=' + VER + '") ' + Math.round(c[0] * v[2]) + ' ' + Math.round(c[1] * v[2]) + ',' + c[2];
      }).join(';');
      out += 'html.snk-cur' + v[0] + '{' + decl + '}\n';
    });
    return out;
  }
  var TEXTSEL = 'input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=image]):not([type=hidden]),textarea,[contenteditable]:not([contenteditable=false]),.xterm';
  /* Navegador: dentro de su ventana se usa el cursor normal del sistema */
  var NOFP = ':not(.mv-root.mv-fp *):not(.mv-root.mv-fp):not(#win-browser .win-body *):not(#win-browser .win-body)';
  function staticCss() {
    var bigU = 'html.snk-cur.snk-cur-big body.snk-bigcursor';
    var s = varsCss();
    /* Base: hereda por todo el documento */
    s += ':where(html.snk-cur) body{cursor:var(--snkc-arrow);}\n';
    s += ':where(html.snk-cur) :where(a:any-link,summary,select,label[for],input[type=checkbox],input[type=radio],input[type=color],input[type=file],input[type=submit],input[type=button],input[type=reset]){cursor:var(--snkc-hand);}\n';
    s += ':where(html.snk-cur) :where(' + TEXTSEL + '){cursor:var(--snkc-text);}\n';
    s += 'html.snk-cur .xterm' + NOFP + '{cursor:var(--snkc-text);}\n';
    s += 'html.snk-cur .xterm.enable-mouse-events{cursor:var(--snkc-arrow);}\n';
    s += 'html.snk-cur .xterm .xterm-cursor-pointer,html.snk-cur .xterm.xterm-cursor-pointer{cursor:var(--snkc-hand);}\n';
    s += ':where(html.snk-cur) .mv-root.mv-fp{cursor:auto;}\n';
    s += 'html.snk-cur #win-browser .win-body{cursor:auto;}\n';
    s += 'html.snk-cur #win-browser .win-body :is(a:any-link,button,summary,select,label[for]){cursor:pointer;}html.snk-cur #win-browser .win-body :is(' + TEXTSEL + '){cursor:text;}\n';
    /* Cursor grande: sustituye la flecha negra de 40 px por la versión Snake de 48 px */
    s += bigU + '{cursor:var(--snkc-arrow) !important;}\n';
    s += bigU + ' *' + NOFP + ':not([data-snkc]){cursor:inherit !important;}\n';
    s += bigU + ' :is(' + TEXTSEL + ')' + NOFP + ':not([data-snkc]){cursor:var(--snkc-text) !important;}\n';
    s += bigU + ' :is(a:any-link,summary,select,input[type=checkbox],input[type=radio],input[type=submit],input[type=button])' + NOFP + ':not([data-snkc]){cursor:var(--snkc-hand) !important;}\n';
    /* Estilos en línea (style="cursor:…") detectados al pasar el ratón */
    Object.keys(MAP).forEach(function (k) {
      s += 'html.snk-cur body [data-snkc][data-snkc="' + k + '"]' + NOFP + '{cursor:var(--snkc-' + MAP[k] + ') !important;}\n';
    });
    KEEP.forEach(function (k) { s += 'html.snk-cur body [data-snkc][data-snkc="' + k + '"]{cursor:' + k + ' !important;}\n'; });
    /* Arrastrando una ventana */
    s += 'html.snk-cur.snk-cur-drag:not(#snkCurX),html.snk-cur.snk-cur-drag:not(#snkCurX) *{cursor:var(--snkc-move) !important;}\n';
    /* busy override vive en #snkCursorBusy (siempre al final) */
    return s;
  }

  /* ---- Copia de las reglas con cursor ---- */
  function splitSel(sel) {
    var out = [], depth = 0, cur = '', q = null;
    for (var i = 0; i < sel.length; i++) {
      var ch = sel[i];
      if (q) { cur += ch; if (ch === q && sel[i - 1] !== '\\') q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  function mapValue(v) {
    v = String(v || '').trim();
    if (!v || /var\(--snkc-/.test(v)) return null;
    if (/^(inherit|initial|unset|revert|revert-layer)$/i.test(v)) return v;
    if (/url\(/i.test(v)) return v;
    var k = v.toLowerCase();
    if (MAP[k]) return 'var(--snkc-' + MAP[k] + ')';
    return v;
  }
  function collect(rules, wrapOpen, out) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      try {
        if (r.type === 1 && r.style) {
          var val = r.style.getPropertyValue('cursor');
          if (!val) continue;
          var mv = mapValue(val);
          if (!mv) continue;
          var sels = splitSel(r.selectorText || '').filter(function (x) {
            return x && x.indexOf('::') < 0 && !/:(before|after|first-line|first-letter|selection|placeholder)\b/i.test(x) &&
              x.indexOf('snk-bigcursor') < 0 && x.indexOf('snk-cur') < 0 && !/^(html|:root)\b/i.test(x);
          });
          if (!sels.length) continue;
          var list = sels.join(',');
          var imp = r.style.getPropertyPriority('cursor') === 'important';
          out.push({ w: wrapOpen, sel: list, val: mv, imp: imp });
        } else if ((r.type === 4 || r.type === 12) && r.cssRules) {
          collect(r.cssRules, wrapOpen.concat([(r.type === 4 ? '@media ' + r.media.mediaText : '@supports ' + r.conditionText)]), out);
        }
      } catch (e) {}
    }
  }
  function genCss() {
    var found = [];
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i++) {
      var sh = sheets[i];
      try {
        if (sh.ownerNode && (sh.ownerNode.id === 'snkCursorGen' || sh.ownerNode.id === 'snkCursorBase' || sh.ownerNode.id === 'snkCursorBusy')) continue;
        if (sh.disabled) continue;
        collect(sh.cssRules || [], [], found);
      } catch (e) { /* hoja de otro dominio */ }
    }
    var out = [];
    found.forEach(function (f) {
      var n = 'html.snk-cur:not(.snk-cur-big) :is(' + f.sel + ')' + NOFP + '{cursor:' + f.val + (f.imp ? ' !important' : '') + ';}';
      var b = 'html.snk-cur.snk-cur-big body.snk-bigcursor :is(' + f.sel + ')' + NOFP + ':not([data-snkc]){cursor:' + f.val + ' !important;}';
      var txt = n + '\n' + b;
      f.w.slice().reverse().forEach(function (w) { txt = w + '{' + txt + '}'; });
      out.push(txt);
    });
    return out.join('\n');
  }

  var genEl = null, baseEl = null, busyEl = null, regenT = null, lastSig = '';
  function busyOverrideCss() {
    /* Debe ir DESPUÉS de #snkCursorGen o la flecha/mano regenerada gana al cursor de carga */
    return 'html.snk-cur.snk-cur-busy,html.snk-cur.snk-cur-busy body,html.snk-cur.snk-cur-busy body *{cursor:var(--snkc-wait) !important;}\n'
      + 'html.snk-cur.snk-cur-busy.snk-cur-big,html.snk-cur.snk-cur-busy.snk-cur-big body.snk-bigcursor,html.snk-cur.snk-cur-busy.snk-cur-big body.snk-bigcursor *{cursor:var(--snkc-wait) !important;}\n';
  }
  function ensureStyles() {
    var head = document.head || document.documentElement;
    if (!baseEl) { baseEl = document.createElement('style'); baseEl.id = 'snkCursorBase'; baseEl.textContent = staticCss(); }
    if (!genEl) { genEl = document.createElement('style'); genEl.id = 'snkCursorGen'; }
    if (!busyEl) { busyEl = document.createElement('style'); busyEl.id = 'snkCursorBusy'; busyEl.textContent = busyOverrideCss(); }
    /* base → gen → busy (busy siempre gana) */
    if (head.lastElementChild !== busyEl || genEl.nextElementSibling !== busyEl || baseEl.nextElementSibling !== genEl) {
      head.appendChild(baseEl);
      head.appendChild(genEl);
      head.appendChild(busyEl);
    }
  }
  function regen() {
    regenT = null;
    try {
      ensureStyles();
      var css = genCss();
      if (css !== lastSig) { lastSig = css; genEl.textContent = css; }
    } catch (e) {}
  }
  function scheduleRegen() { if (!regenT) regenT = setTimeout(regen, 250); }

  /* ---- Estado ---- */
  var fine = true;
  try { var mq = window.matchMedia('(any-pointer: fine)'); fine = mq.matches; if (mq.addEventListener) mq.addEventListener('change', function (e) { fine = e.matches; apply(); }); } catch (e) {}
  function isPhone() { return !!(document.body && document.body.classList.contains('phone-mode')); }
  function enabled() { return getPref() === 'snake' && fine && !isPhone() && !document.pointerLockElement; }
  var lastEmail = null;
  function apply() {
    var h = document.documentElement, b = document.body;
    var on = enabled();
    h.classList.toggle('snk-cur', on);
    h.classList.toggle('snk-cur-big', on && !!b && b.classList.contains('snk-bigcursor'));
    h.classList.toggle('snk-cur-hc', on && !!b && b.classList.contains('snk-hc'));
    if (!on) {
      h.classList.remove('snk-cur-drag');
      h.classList.remove('snk-cur-busy');
    }
    lastEmail = email();
    try { if (typeof syncBusyClass === 'function') syncBusyClass(); } catch (eB) {}
  }

  /* Estilos en línea: se marcan al pasar el ratón */
  document.addEventListener('pointerover', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    if (!document.documentElement.classList.contains('snk-cur')) return;
    var t = e.target;
    for (var i = 0; t && t.nodeType === 1 && i < 6; i++, t = t.parentElement) {
      var c = t.style && t.style.cursor ? t.style.cursor.trim().toLowerCase() : '';
      if (c && t.style.getPropertyPriority('cursor') !== 'important' && (MAP[c] || KEEP.indexOf(c) >= 0)) {
        if (t.getAttribute('data-snkc') !== c) t.setAttribute('data-snkc', c);
      } else if (t.hasAttribute('data-snkc')) t.removeAttribute('data-snkc');
    }
  }, { passive: true, capture: true });

  /* Cursor de mover al arrastrar una ventana por su barra */
  document.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || !document.documentElement.classList.contains('snk-cur')) return;
    var t = e.target;
    if (!t || !t.closest) return;
    var bar = t.closest('.win-titlebar');
    if (!bar || t.closest('.win-btn, button, input, select, a')) return;
    var w = bar.closest('.app-window');
    if (!w || w.classList.contains('maximized') || isPhone()) return;
    document.documentElement.classList.add('snk-cur-drag');
  }, true);
  function endDrag() { document.documentElement.classList.remove('snk-cur-drag'); }
  window.addEventListener('pointerup', endDrag, true);
  window.addEventListener('pointercancel', endDrag, true);
  window.addEventListener('blur', endDrag);

  document.addEventListener('pointerlockchange', apply);

  function boot() {
    ensureStyles();
    regen();
    apply();
    if (document.body) new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i], n = m.target;
        if (n === genEl || n === baseEl || (n.parentNode && (n.parentNode === genEl || n.parentNode === baseEl))) continue;
        var nodes = [n].concat(Array.prototype.slice.call(m.addedNodes || []), Array.prototype.slice.call(m.removedNodes || []));
        for (var j = 0; j < nodes.length; j++) {
          var x = nodes[j];
          if (x === genEl || x === baseEl) continue;
          var nm = x.nodeName;
          if (nm === 'STYLE' || nm === 'LINK' || (x.parentNode && x.parentNode.nodeName === 'STYLE')) { scheduleRegen(); return; }
        }
      }
    });
    mo.observe(document.head, { childList: true, subtree: true, characterData: true });
    if (document.body) mo.observe(document.body, { childList: true });
    window.addEventListener('load', function () { regen(); apply(); });
    setInterval(function () { if (email() !== lastEmail) apply(); }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();


  /* ---- Cursor de carga (progress) ---- */
  var busyCount = 0;
  var busyShowT = null;
  var busySafetyT = null;
  var BUSY_DELAY_MS = 600;
  var BUSY_MAX_MS = 20000; /* nunca dejar el cursor colgado más de 20s */

  function syncBusyClass() {
    var on = busyCount > 0 && enabled();
    document.documentElement.classList.toggle('snk-cur-busy', on);
  }

  function armBusySafety() {
    if (busySafetyT) clearTimeout(busySafetyT);
    busySafetyT = setTimeout(function () {
      busySafetyT = null;
      if (busyCount > 0) {
        busyCount = 0;
        scanDomBusy._on = false;
        if (busyShowT) { clearTimeout(busyShowT); busyShowT = null; }
        syncBusyClass();
      }
    }, BUSY_MAX_MS);
  }

  function beginBusy() {
    busyCount++;
    armBusySafety();
    if (busyCount === 1) {
      if (busyShowT) clearTimeout(busyShowT);
      busyShowT = setTimeout(function () {
        busyShowT = null;
        syncBusyClass();
      }, BUSY_DELAY_MS);
    }
    return busyCount;
  }

  function endBusy() {
    busyCount = Math.max(0, busyCount - 1);
    if (busyCount === 0) {
      if (busyShowT) { clearTimeout(busyShowT); busyShowT = null; }
      if (busySafetyT) { clearTimeout(busySafetyT); busySafetyT = null; }
      syncBusyClass();
    }
    return busyCount;
  }

  function resetBusy() {
    busyCount = 0;
    scanDomBusy._on = false;
    if (busyShowT) { clearTimeout(busyShowT); busyShowT = null; }
    if (busySafetyT) { clearTimeout(busySafetyT); busySafetyT = null; }
    syncBusyClass();
  }

  function isBusy() { return busyCount > 0; }

  var BUSY_SKIP = [
    '/api/notifications',
    '/api/desk/ws',
    '/api/chat/ws',
    '/api/metaverse',
    '/api/book/live',
    '/api/presence',
    '/api/ping',
    '/api/health',
    '/api/board',
    '/api/keypad',
    '/api/snake-os-lite/presence'
  ];

  function shouldBusyForUrl(url) {
    try {
      var u = String(url || '');
      var path = u;
      try {
        if (/^https?:/i.test(u)) path = new URL(u, location.href).pathname || u;
        else if (u.charAt(0) !== '/') {
          path = new URL(u, location.href).pathname || u;
        }
      } catch (e0) {}
      for (var i = 0; i < BUSY_SKIP.length; i++) {
        if (path.indexOf(BUSY_SKIP[i]) >= 0) return false;
      }
      if (path.indexOf('/static/') === 0) return false;
      return true;
    } catch (e) { return true; }
  }

  function wrapPromiseBusy(p) {
    beginBusy();
    var done = false;
    var finish = function () {
      if (done) return;
      done = true;
      endBusy();
    };
    try {
      return Promise.resolve(p).then(function (v) { finish(); return v; }, function (err) { finish(); throw err; });
    } catch (e) {
      finish();
      throw e;
    }
  }

  try {
    if (!window.__snkFetchBusy && typeof window.fetch === 'function') {
      window.__snkFetchBusy = true;
      var _fetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        var url = '';
        try {
          if (typeof input === 'string') url = input;
          else if (input && input.url) url = input.url;
        } catch (eU) {}
        if (!shouldBusyForUrl(url)) return _fetch(input, init);
        return wrapPromiseBusy(_fetch(input, init));
      };
    }
  } catch (eF) {}

  function elIsVisible(el) {
    if (!el) return false;
    try {
      if (el.hidden) return false;
      if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
      var st = window.getComputedStyle(el);
      if (!st || st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
      return true;
    } catch (e) { return true; }
  }

  function scanDomBusy() {
    try {
      var want = false;
      var hot = document.querySelector('#poweroffLoading:not(.hidden), [aria-busy="true"], .snk-loading');
      if (hot && elIsVisible(hot)) want = true;
      // Solo .dbook-loading visibles (no nodos huérfanos)
      if (!want) {
        var loads = document.querySelectorAll('.dbook-loading');
        for (var li = 0; li < loads.length; li++) {
          if (elIsVisible(loads[li])) { want = true; break; }
        }
      }
      // Solo estados CON .show (si no, el texto viejo de "Entrando..." dejaba el cursor colgado)
      if (!want) {
        var st = document.querySelectorAll('.status.show, #shotToast.show');
        for (var i = 0; i < st.length; i++) {
          var el = st[i];
          if (!elIsVisible(el)) continue;
          if (el.classList && el.classList.contains('err')) continue;
          var tx = (el.textContent || '').toLowerCase();
          if (/entrando|comprobando|cargando|subiendo|guardando|conectando|aplicando|preparando|ajustando|enviando/.test(tx)) {
            want = true;
            break;
          }
        }
      }
      if (want && !scanDomBusy._on) { scanDomBusy._on = true; beginBusy(); }
      else if (!want && scanDomBusy._on) { scanDomBusy._on = false; endBusy(); }
    } catch (e) {}
  }
  setInterval(scanDomBusy, 200);

  window.snakeCursor = {
    get: getPref,
    set: setPref,
    toggle: function () { setPref(getPref() === 'snake' ? 'system' : 'snake'); },
    label: function () { return getPref() === 'snake' ? 'Snake' : 'Sistema'; },
    active: function () { return document.documentElement.classList.contains('snk-cur'); },
    refresh: function () { regen(); apply(); },
    beginBusy: beginBusy,
    endBusy: endBusy,
    resetBusy: resetBusy,
    isBusy: isBusy,
    busy: function (on) { return on ? beginBusy() : endBusy(); }
  };
})();
