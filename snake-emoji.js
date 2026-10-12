/* Snake OS · Emojis Snake y app «Snakemoji» (2026-10-09)
   - Catálogo completo de snakemojis (assets/snk-emoji-<código>.svg + snake-emoji-data.js).
     Los 299 originales a mano se conservan; el resto sigue el mismo estilo Snake OS.
   - Sustituye los emojis del texto por su versión Snake SIN quitar el carácter: el emoji real sigue en el
     DOM (invisible) dentro de <span class="snk-e">, así copiar/pegar, textContent y la lógica de las apps
     no cambian. En inputs/textarea muestra un espejo con snakemojis al escribir (el valor real no cambia). No toca contenteditable, Code Lab, Terminal, SVG ni canvas.
   - ™ © ® ℠ se dejan como tipografía normal (no se sustituyen por SVG).
   - Ajuste por perfil: «Snake OS» (por defecto) o «Sistema».
   - Tecla S (sin modificadores, fuera de campos de texto, juegos, Code Lab, Terminal y Metaverse):
     abre Snakemoji, la galería de emojis Snake con búsqueda, categorías y clic para copiar. */
(function () {
  'use strict';
  if (window.__snkEmoji) return;
  window.__snkEmoji = true;

  var VER = '202610100849';
  var BASE = '/static/assets/snk-emoji-';
  /* [emoji, nombre, categoría, código] */
  var DATA_FALLBACK = []; /* catálogo en snake-emoji-data.js */
  var DATA = (Array.isArray(window.__SNK_EMOJI_DATA) && window.__SNK_EMOJI_DATA.length)
    ? window.__SNK_EMOJI_DATA.slice()
    : DATA_FALLBACK.slice();
  /* Tipográficos: fuera del catálogo y del reemplazo */
  (function () {
    var skip = { '2122':1, '00a9':1, 'a9':1, '00ae':1, 'ae':1, '2120':1 };
    DATA = DATA.filter(function (d) { return !(d && skip[d[3]]); });
  })();
  var CATS = [['caras', '😀', 'Caras'], ['corazones', '❤️', 'Corazones'], ['gestos', '👍', 'Gestos'], ['animales', '🐍', 'Animales'],
    ['comida', '🍎', 'Comida'], ['naturaleza', '🌸', 'Naturaleza'], ['objetos', '🎉', 'Objetos'], ['símbolos', '✅', 'Símbolos'], ['banderas', '🇪🇸', 'Banderas']];

  function url(code) { return BASE + code + '.svg?v=' + VER; }
  function norm(s) { return String(s).replace(/\uFE0F/g, ''); }
  function codeOf(s) { var o = []; for (var ch of norm(s)) o.push(ch.codePointAt(0).toString(16)); return o.join('-'); }
  var BY = Object.create(null);
  DATA.forEach(function (d) { BY[norm(d[0])] = d; });
  /* ™ © ® etc. se quedan como texto tipográfico (no SVG enorme) */
  (function () {
    var skipCodes = { '2122':1, '00a9':1, 'a9':1, '00ae':1, 'ae':1, '2120':1 };
    var skipChars = ['\u2122','\u00A9','\u00AE','\u2120'];
    skipChars.forEach(function (ch) { delete BY[norm(ch)]; });
    Object.keys(BY).forEach(function (k) {
      var d = BY[k];
      if (d && skipCodes[d[3]]) delete BY[k];
    });
  })();


  /* Expresión: secuencias más largas primero. Si el emoji se define con FE0F (presentación de texto por
     defecto) se exige FE0F, salvo ❤ que casi siempre se usa como emoji. No corta secuencias ZWJ ni tonos
     de piel que no tengan diseño propio (esas se quedan con el emoji del sistema). */
  /* Matcher genérico: captura secuencias emoji y busca en BY (evita regex de 5k alternativas). */
  var RE;
  try {
    RE = new RegExp(
      '(?:\\p{Regional_Indicator}{2})|' +
      '(?:[#*0-9]\\uFE0F?\\u20E3)|' +
      '(?:\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier}|[\\u{1F3FB}-\\u{1F3FF}])?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier}|[\\u{1F3FB}-\\u{1F3FF}])?)*)',
      'gu'
    );
  } catch (e1) {
    RE = /(?:[\uD83C][\uDDE6-\uDDFF]){2}|(?:[#*0-9]\uFE0F?\u20E3)|(?:(?:\u00A9|\u00AE|[\u203C-\u3299]|[\uD83C-\uD83E][\uDC00-\uDFFF])(?:\uFE0F|[\uD83C][\uDFFB-\uDFFF])?(?:\u200D(?:\u00A9|\u00AE|[\u203C-\u3299]|[\uD83C-\uD83E][\uDC00-\uDFFF]|\u2640|\u2642|\u2695|\u2696|\u2708|\u2764)(?:\uFE0F|[\uD83C][\uDFFB-\uDFFF])?)*)/g;
  }
  var PRE = /[\u00A9\u00AE\u203C-\u3299]|[\uD83C-\uD83E]|[#*0-9]\uFE0F?\u20E3/;

  /* ---- Preferencia por perfil ---- */
  function cu() { try { return (typeof currentUser !== 'undefined' && currentUser) || window.currentUser || null; } catch (e) { return window.currentUser || null; } }
  function email() { var u = cu(); return u && u.email ? String(u.email).toLowerCase() : ''; }
  function key() { return 'snkemoji:' + (email() || 'guest'); }
  function getPref() { try { return localStorage.getItem(key()) === 'system' ? 'system' : 'snake'; } catch (e) { return 'snake'; } }
  function setPref(v) { try { localStorage.setItem(key(), v === 'system' ? 'system' : 'snake'); } catch (e) {} apply(); }

  /* ---- Estilos ---- */
  var CSS =
    '.snk-ew{display:inline;}' +
    '.snk-e{display:inline-flex;align-items:center;justify-content:center;width:1.35em;height:1.35em;vertical-align:-0.3em;' +
      'overflow:visible;line-height:1;margin:0 0.04em;position:relative;}' +
    '.snk-e>.snk-e-img{width:1.35em;height:1.35em;object-fit:contain;display:block;pointer-events:none;' +
      'filter:drop-shadow(0 0 0.6px #14532d);}' +
    '.snk-e>.snk-et{position:absolute;opacity:0;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);}' +
    '.snk-e.bad{display:inline;width:auto;height:auto;margin:0;}' +
    '.snk-e.bad>.snk-e-img{display:none !important;}' +
    '.snk-e.bad>.snk-et{position:static;opacity:1;width:auto;height:auto;clip:auto;overflow:visible;}' +
    /* Espejo de input: la capa Snake VA ENCIMA con fondo opaco (los emoji nativos ignoran color:transparent) */
    '.snk-ei-wrap{position:relative;display:block;min-width:0;flex:1 1 auto;align-self:stretch;}' +
    '.snk-ei-layer{position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden;' +
      'box-sizing:border-box;color:inherit;white-space:pre;word-wrap:normal;word-break:normal;' +
      'backdrop-filter:none !important;-webkit-backdrop-filter:none !important;' +
      'border:0 !important;box-shadow:none !important;}' +
    '.snk-ei-layer.snk-ei-ta{white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;}' +
    '.snk-ei-layer .snk-e>.snk-e-img{filter:none;}' +
    '.snk-ei-caret{position:absolute;top:0;left:0;width:1.5px;background:var(--snk-ei-caret,#eafff0);border-radius:1px;' +
      'pointer-events:none;animation:snkEiBlink 1s step-end infinite;z-index:4;}' +
    '@keyframes snkEiBlink{50%{opacity:0;}}' +
    'html.snk-emoji-on .snk-ei-on{color:transparent !important;-webkit-text-fill-color:transparent !important;' +
      'caret-color:transparent !important;position:relative;z-index:1;' +
      'background:transparent !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}' +
    'html.snk-emoji-on .snk-ei-wrap{backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}' +
    'html.snk-emoji-on .snk-ei-on::placeholder{color:transparent !important;-webkit-text-fill-color:transparent !important;opacity:0 !important;}' +
    /* Móvil: el emoji nativo ignora color:transparent; ocultamos el input y mostramos solo la capa Snake */ +
    '#win-phone input,#win-phone textarea,#win-phone .dph-display,#win-phone .dph-search{color:#eafff0 !important;-webkit-text-fill-color:#eafff0 !important;opacity:1 !important;caret-color:#7CFC9A !important;}#win-phone .snk-ei-wrap,#win-phone .snk-ei-layer,#win-phone .snk-ei-caret{display:none !important;}html.snk-emoji-on #win-phone input.snk-ei-on,html.snk-emoji-on #win-phone textarea.snk-ei-on{color:#eafff0 !important;-webkit-text-fill-color:#eafff0 !important;opacity:1 !important;}html.snk-emoji-on body.phone-mode .snk-ei-on,html.snk-emoji-on.snk-ei-phone .snk-ei-on{opacity:0 !important;color:transparent !important;-webkit-text-fill-color:transparent !important;caret-color:transparent !important;background:transparent !important;}html.snk-emoji-on #win-phone input,html.snk-emoji-on #win-phone textarea,html.snk-emoji-on #win-phone .dph-display,html.snk-emoji-on #win-phone .dph-search,html.snk-emoji-on body.phone-mode #win-phone input,html.snk-emoji-on body.phone-mode #win-phone .dph-display{opacity:1 !important;color:#eafff0 !important;-webkit-text-fill-color:#eafff0 !important;caret-color:#7CFC9A !important;background:rgba(0,0,0,.35) !important;}' +
    'html.snk-emoji-on body.phone-mode .snk-ei-wrap,html.snk-emoji-on.snk-ei-phone .snk-ei-wrap{isolation:isolate;background:var(--snk-ei-solid,#10261a) !important;border-radius:inherit;}' +
    'html.snk-emoji-on body.phone-mode .snk-ei-layer,html.snk-emoji-on.snk-ei-phone .snk-ei-layer{z-index:5;background:var(--snk-ei-solid,#10261a) !important;-webkit-font-smoothing:antialiased;}' +
    'html.snk-emoji-on .snk-ei-layer .snk-et{display:none !important;}' +
    /* Snakemoji */
    '.smj{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--text,#fff);font-size:0.85rem;}' +
    '.smj *{box-sizing:border-box;}' +
    '.smj-top{display:flex;gap:8px;align-items:center;padding:10px 12px 6px;}' +
    '.smj-top img{width:30px;height:30px;flex:none;}' +
    '.smj .smj-top h3{margin:0;padding:0;font-size:1rem;font-weight:700;flex:none;color:var(--text,#fff);background:none;}' +
    '.smj-count{margin-left:auto;font-size:0.75rem;opacity:0.75;white-space:nowrap;}' +
    '.smj input.smj-search{all:unset;display:block;margin:0 12px 6px;min-height:34px;padding:6px 11px;border-radius:10px;font-size:0.85rem;box-sizing:border-box;width:calc(100% - 24px);' +
      'background:var(--input-bg,rgba(255,255,255,0.08));color:var(--text,#fff);border:1px solid var(--input-border,rgba(255,255,255,0.2));}' +
    '.smj input.smj-search:focus{border-color:var(--accent,#34d17a);}' +
    '.smj-cats{display:flex;gap:4px;padding:0 12px 6px;overflow-x:auto;scrollbar-width:thin;flex:none;}' +
    '.smj .smj-cats button{all:unset;box-sizing:border-box;flex:none;display:flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;font-size:0.75rem;cursor:pointer;white-space:nowrap;' +
      'background:var(--input-bg,rgba(255,255,255,0.08));color:var(--text,#fff);border:1px solid var(--input-border,rgba(255,255,255,0.2));}' +
    '.smj .smj-cats button img{width:16px;height:16px;}' +
    '.smj .smj-cats button.on{border-color:var(--accent,#34d17a);box-shadow:0 0 0 2px rgba(52,209,122,0.3);}' +
    '.smj .smj-cats button:focus-visible{outline:2px solid var(--accent,#34d17a);}' +
    '.smj-grid{flex:1;min-height:0;overflow-y:auto;padding:4px 10px 12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(54px,1fr));gap:4px;align-content:start;}' +
    '.smj .smj-grid h4{grid-column:1/-1;margin:8px 2px 2px;padding:0;font-size:0.75rem;opacity:0.75;font-weight:600;color:var(--text,#fff);}' +
    '.smj button.smj-item{all:unset;box-sizing:border-box;border-radius:10px;padding:5px 2px 3px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--text,#fff);min-width:0;}' +
    '.smj button.smj-item:hover,.smj button.smj-item:focus-visible{background:rgba(52,209,122,0.18);}' +
    '.smj button.smj-item:focus-visible{outline:2px solid var(--accent,#34d17a);}' +
    '.smj button.smj-item:active{transform:scale(0.92);}' +
    '.smj .smj-item img{width:38px;height:38px;pointer-events:none;}' +
    '.smj .smj-item span{font-size:0.6rem;opacity:0.75;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:inherit;}' +
    '.smj-empty{grid-column:1/-1;text-align:center;padding:24px 8px;opacity:0.75;}' +
    '.smj-foot{font-size:0.7rem;opacity:0.65;padding:4px 12px 8px;text-align:center;}' +
    '.smj-toast{position:fixed;left:50%;bottom:84px;transform:translateX(-50%) translateY(10px);z-index:2147483000;opacity:0;pointer-events:none;' +
      'display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:rgba(10,40,24,0.94);color:#eafff1;font-size:0.85rem;' +
      'border:1px solid rgba(52,209,122,0.6);box-shadow:0 6px 24px rgba(0,0,0,0.35);transition:opacity .18s ease,transform .18s ease;}' +
    '.smj-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}' +
    '.smj-toast img{width:22px;height:22px;}' +
    'body.light .smj,body.theme-light .smj{--text:#10301c;}' +
    'body.phone-mode .smj-item img{width:42px;height:42px;}' +
    'body.phone-mode .smj input.smj-search{min-height:42px;font-size:16px;}' +
    'body.light .smj-toast,body.theme-light .smj-toast{background:rgba(232,255,240,0.97);color:#0b3b1f;}';
  function ensureCss() {
    if (document.getElementById('snkEmojiCss')) return;
    var st = document.createElement('style');
    st.id = 'snkEmojiCss';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---- Carga de imágenes y respaldo al emoji del sistema ---- */
  var IMG = Object.create(null), BAD = Object.create(null);
  function preload(code) {
    if (IMG[code]) return IMG[code];
    var im = new Image();
    im.decoding = 'async';
    im.onerror = function () {
      BAD[code] = true;
      document.querySelectorAll('.snk-e[data-c="' + code + '"]').forEach(function (s) { s.classList.add('bad'); });
    };
    im.src = url(code);
    IMG[code] = im;
    return im;
  }

  /* ---- Sustitución en el DOM ---- */
  var SKIP_TAGS = { INPUT: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1, OPTGROUP: 1, SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, CANVAS: 1, IFRAME: 1, CODE: 1, PRE: 1, KBD: 1, SAMP: 1, TITLE: 1, HEAD: 1, VIDEO: 1, AUDIO: 1, OBJECT: 1 };
  var SKIP_SEL = '#clock,.snk-ew,.snk-noemoji,[contenteditable]:not([contenteditable="false"]),.xterm,svg,#win-code,#win-terminal,.CodeMirror,.cm-editor,.monaco-editor,.leaflet-container,.snk-maps-frame,.snk-maps,#win-phone,.dph';
  var MAX_LEN = 20000;
  var on = false;
  function skipEl(el) {
    if (!el || el.nodeType !== 1) return true;
    if (SKIP_TAGS[el.nodeName.toUpperCase()]) return true;
    if (el.isContentEditable) return true;
    try { return !!el.closest(SKIP_SEL); } catch (e) { return false; }
  }
  function makeSpan(m) {
    var d = BY[norm(m)];
    var code = d[3];
    preload(code);
    var s = document.createElement('span');
    s.className = 'snk-e' + (BAD[code] ? ' bad' : '');
    s.setAttribute('data-c', code);
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', d[1]);
    s.title = d[1];
    if (!BAD[code]) {
      var im = document.createElement('img');
      im.className = 'snk-e-img';
      im.alt = '';
      im.draggable = false;
      im.decoding = 'async';
      im.src = url(code);
      im.onerror = function () { BAD[code] = true; s.classList.add('bad'); try { im.remove(); } catch (e0) {} };
      s.appendChild(im);
    }
    var t = document.createElement('span');
    t.className = 'snk-et';
    t.textContent = m;
    s.appendChild(t);
    return s;
  }

  
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function htmlWithSnake(text) {
    if (!text) return '';
    var out = '', last = 0, m;
    RE.lastIndex = 0;
    while ((m = RE.exec(text))) {
      if (!m[0]) { if (RE.lastIndex === m.index) RE.lastIndex++; continue; }
      var raw = m[0];
      var d = BY[norm(raw)];
      if (!d) continue;
      out += escapeHtml(text.slice(last, m.index));
      if (BAD[d[3]]) out += escapeHtml(raw);
      else {
        preload(d[3]);
        out += '<span class="snk-e" data-c="' + d[3] + '"><img class="snk-e-img" alt="" draggable="false" src="' + url(d[3]) + '"><span class="snk-et">' + escapeHtml(raw) + '</span></span>';
      }
      last = m.index + raw.length;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }
  function hasSnakeEmoji(text) {
    if (!text || !PRE.test(text)) return false;
    RE.lastIndex = 0;
    var m;
    while ((m = RE.exec(text))) {
      if (!m[0]) { if (RE.lastIndex === m.index) RE.lastIndex++; continue; }
      if (BY[norm(m[0])]) return true;
    }
    return false;
  }
  function toHtml(text) {
    if (text == null) return '';
    text = String(text);
    if (!text) return '';
    if (!on || !hasSnakeEmoji(text)) return escapeHtml(text).replace(/\n/g, '<br>');
    return htmlWithSnake(text).replace(/\n/g, '<br>');
  }
  function fillEmojiEl(el, text) {
    if (!el) return;
    text = text == null ? '' : String(text);
    if (on && hasSnakeEmoji(text)) el.innerHTML = toHtml(text);
    else el.textContent = text;
  }
function processText(node) {
    var v = node.nodeValue;
    if (!v || v.length > MAX_LEN || !PRE.test(v)) return;
    var p = node.parentNode;
    if (!p || p.nodeType !== 1 || skipEl(p)) return;
    RE.lastIndex = 0;
    var m, last = 0, frag = null;
    while ((m = RE.exec(v))) {
      if (!m[0]) { if (RE.lastIndex === m.index) RE.lastIndex++; continue; }

      if (!BY[norm(m[0])]) continue;
      if (!frag) frag = document.createElement('span');
      if (m.index > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)));
      frag.appendChild(makeSpan(m[0]));
      last = m.index + m[0].length;
    }
    if (!frag) return;
    if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
    frag.className = 'snk-ew';
    p.replaceChild(frag, node);
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { processText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && skipEl(root)) return;
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return n.nodeValue && n.nodeValue.length <= MAX_LEN && PRE.test(n.nodeValue) ? 1 : 3; }
    });
    var list = [], n;
    while ((n = tw.nextNode())) list.push(n);
    for (var i = 0; i < list.length; i++) processText(list[i]);
  }
  var queue = new Set(), scheduled = false;
  function flush() {
    scheduled = false;
    if (!on) { queue.clear(); return; }
    var items = Array.from(queue);
    queue.clear();
    var t0 = performance.now();
    for (var i = 0; i < items.length; i++) {
      var n = items[i];
      if (!n.isConnected) continue;
      try { walk(n); } catch (e) {}
      if (performance.now() - t0 > 12 && i < items.length - 1) {
        for (var j = i + 1; j < items.length; j++) queue.add(items[j]);
        schedule();
        return;
      }
    }
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    (window.requestAnimationFrame || setTimeout)(flush, 16);
  }
  var mo = new MutationObserver(function (muts) {
    if (!on) return;
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'characterData') continue; /* caro y casi innecesario */
      for (var j = 0; j < m.addedNodes.length; j++) {
        var a = m.addedNodes[j];
        if (a.nodeType === 1) {
          if (a.classList && (a.classList.contains('snk-ew') || a.classList.contains('snk-e') || a.classList.contains('snk-ei-wrap') || a.classList.contains('snk-ei-layer') || a.classList.contains('snk-ei-caret'))) continue;
          try {
            if (a.closest && a.closest('.snk-ei-wrap,.snk-noemoji,#win-terminal,#win-code,.xterm,.leaflet-container,.snk-maps,#win-metaverse,#win-boing,#win-doganiero-tv,.mv-root,.prism-wrap,#win-phone,.dph')) continue;
          } catch (e0) {}
          queue.add(a);
        } else if (a.nodeType === 3) {
          var p = a.parentNode;
          if (p && p.nodeType === 1) {
            try {
              if (p.closest && p.closest('.snk-ew,.snk-e,.snk-ei-wrap,.snk-noemoji')) continue;
            } catch (e1) {}
            queue.add(a);
          }
        }
      }
    }
    if (queue.size) schedule();
  });
  function unwrapAll() {
    document.querySelectorAll('.snk-ew').forEach(function (w) {
      if (w.parentNode) w.parentNode.replaceChild(document.createTextNode(w.textContent), w);
    });
  }
  /* Lo editable que contenga un emoji ya convertido (p. ej. al activar contenteditable) vuelve a texto */
  function cleanEditable(el) {
    try { el.querySelectorAll('.snk-ew').forEach(function (w) { if (w.parentNode) w.parentNode.replaceChild(document.createTextNode(w.textContent), w); }); } catch (e) {}
  }
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (t && t.isContentEditable) {
      var host = t.closest('[contenteditable]') || t;
      cleanEditable(host);
    }
  }, true);



  /* ---- Espejo en inputs/textarea (ver snakemojis al escribir) ---- */
  var EI_SKIP_TYPE = { password:1, email:1, number:1, range:1, date:1, time:1, datetime:1, 'datetime-local':1, month:1, week:1, color:1, file:1, hidden:1, checkbox:1, radio:1, submit:1, button:1, reset:1, image:1 };
  var EI_SKIP_CLS = 'smj-search,snk-noemoji,.xterm,.CodeMirror,.cm-editor,.monaco-editor,#win-code,#win-terminal';
  function eiEligible(el) {
    if (!on || !el || el.nodeType !== 1) return false;
    var tag = el.nodeName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
    if (el.readOnly || el.disabled) return false;
    if (tag === 'INPUT') {
      var ty = String(el.type || 'text').toLowerCase();
      if (EI_SKIP_TYPE[ty]) return false;
      if (ty && ty !== 'text' && ty !== 'search' && ty !== 'url' && ty !== 'tel' && ty !== '') return false;
    }
    try {
      if (el.classList && el.classList.contains('smj-search')) return false;
      if (el.classList && el.classList.contains('snk-noemoji')) return false;
      if (el.closest && el.closest('.snk-noemoji,.snk-maps,#win-phone,.dph,#win-code,#win-terminal,.xterm,.CodeMirror,.cm-editor,.monaco-editor,[data-keyboard-game]')) return false;
    } catch (e0) { return false; }
    return true;
  }
  function eiThemeBaseRgb() {
    try {
      var b = document.body;
      if (b && (b.classList.contains('theme-light') || b.classList.contains('light'))) return [232, 255, 240];
    } catch (e0) {}
    return [16, 38, 26];
  }
  function eiParseCssColor(raw) {
    if (!raw) return null;
    raw = String(raw).trim().toLowerCase();
    if (raw === 'transparent') return null;
    var m = raw.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)$/);
    if (m) {
      return {
        r: +m[1], g: +m[2], b: +m[3],
        a: m[4] != null ? Math.max(0, Math.min(1, parseFloat(m[4]))) : 1
      };
    }
    m = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: 1 };
    }
    return null;
  }
  function eiBlendOpaque(fg) {
    var base = eiThemeBaseRgb();
    if (!fg) return 'rgb(' + base[0] + ',' + base[1] + ',' + base[2] + ')';
    var a = (typeof fg.a === 'number') ? fg.a : 1;
    if (a >= 0.97) return 'rgb(' + fg.r + ',' + fg.g + ',' + fg.b + ')';
    var r = Math.round(fg.r * a + base[0] * (1 - a));
    var g = Math.round(fg.g * a + base[1] * (1 - a));
    var b = Math.round(fg.b * a + base[2] * (1 - a));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function eiSolidBg(cs, el) {
    /* Siempre opaco: en móvil el emoji del sistema se ve a través de fondos glass */
    var bg = cs && cs.backgroundColor;
    var parsed = eiParseCssColor(bg);
    if (!parsed || parsed.a < 0.15) {
      try {
        var p = el && el.parentElement;
        while (p) {
          var pcs = window.getComputedStyle(p);
          var pb = eiParseCssColor(pcs.backgroundColor);
          if (pb && pb.a >= 0.15) { parsed = pb; break; }
          p = p.parentElement;
        }
      } catch (e0) {}
    }
    return eiBlendOpaque(parsed);
  }
  function eiIsPhoneUi() {
    try {
      if (document.body && document.body.classList.contains('phone-mode')) return true;
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
      if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) return true;
    } catch (e0) {}
    return false;
  }
  function eiCopyBox(src, dst) {
    var cs = window.getComputedStyle(src);
    var props = [
      'font','fontFamily','fontSize','fontWeight','fontStyle','fontVariant','fontStretch','letterSpacing',
      'lineHeight','textAlign','textIndent','textTransform','wordSpacing','direction','paddingTop','paddingRight',
      'paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth',
      'boxSizing','width','height','borderRadius'
    ];
    for (var i = 0; i < props.length; i++) {
      try { dst.style[props[i]] = cs[props[i]]; } catch (e1) {}
    }
    dst.style.margin = '0';
    dst.style.borderStyle = 'solid';
    dst.style.borderColor = 'transparent';
    var solid = eiSolidBg(cs, src);
    dst.style.background = solid;
    dst.style.backgroundColor = solid;
    try {
      if (src.__snkEi && src.__snkEi.wrap) {
        src.__snkEi.wrap.style.setProperty('--snk-ei-solid', solid);
        src.__snkEi.wrap.style.background = solid;
        src.__snkEi.wrap.style.backgroundColor = solid;
      }
    } catch (eBg) {}
    dst.style.color = cs.color || '#eafff0';
    var caret = '#eafff0';
    try {
      var raw = cs.color || '#eafff0';
      if (raw && raw !== 'transparent' && raw !== 'rgba(0, 0, 0, 0)') caret = raw;
    } catch (e2) {}
    try {
      src.style.setProperty('--snk-ei-caret', caret);
      if (src.__snkEi && src.__snkEi.wrap) src.__snkEi.wrap.style.setProperty('--snk-ei-caret', caret);
    } catch (e3) {}
    if (!src.__snkEiBgSaved) {
      src.__snkEiBgSaved = cs.background;
      src.__snkEiBgColorSaved = cs.backgroundColor;
    }
  }
  function eiEnsure(el) {
    if (el.__snkEi) return el.__snkEi;
    var parent = el.parentNode;
    if (!parent) return null;
    if (parent.classList && parent.classList.contains('snk-ei-wrap')) return el.__snkEi || null;
    var wrap = document.createElement('div');
    wrap.className = 'snk-ei-wrap snk-noemoji';
    try {
      var ecs = window.getComputedStyle(el);
      var pcs = window.getComputedStyle(parent);
      if (pcs.display === 'flex' || pcs.display === 'inline-flex') {
        wrap.style.flex = ecs.flex || '1 1 auto';
        wrap.style.flexGrow = ecs.flexGrow || '1';
        wrap.style.flexShrink = ecs.flexShrink || '1';
        wrap.style.flexBasis = ecs.flexBasis || 'auto';
        wrap.style.minWidth = '0';
        wrap.style.alignSelf = ecs.alignSelf || 'stretch';
      }
      if (ecs.width && ecs.width !== 'auto') wrap.style.width = ecs.width;
      el.style.flex = '1 1 auto';
      el.style.width = '100%';
      el.style.minWidth = '0';
      el.style.boxSizing = 'border-box';
    } catch (eFlex) {}
    parent.insertBefore(wrap, el);
    wrap.appendChild(el);
    var layer = document.createElement('div');
    layer.className = 'snk-ei-layer' + (el.nodeName === 'TEXTAREA' ? ' snk-ei-ta' : '');
    layer.setAttribute('aria-hidden', 'true');
    wrap.appendChild(layer); /* encima del input para tapar emoji nativo */
    var caret = document.createElement('div');
    caret.className = 'snk-ei-caret';
    caret.setAttribute('aria-hidden', 'true');
    wrap.appendChild(caret);
    el.classList.add('snk-ei-on');
    try {
      if (eiIsPhoneUi()) document.documentElement.classList.add('snk-ei-phone');
    } catch (ePh) {}
    el.__snkEi = { wrap: wrap, layer: layer, caret: caret, last: null, sel: -1 };
    eiCopyBox(el, layer);
    eiSyncCaret(el);
    return el.__snkEi;
  }
  function csWidth(el) {
    try {
      var r = el.getBoundingClientRect();
      return r.width ? (Math.round(r.width) + 'px') : '';
    } catch (e) { return ''; }
  }
  function eiTeardown(el) {
    if (!el || !el.__snkEi) return;
    var st = el.__snkEi;
    el.classList.remove('snk-ei-on');
    try {
      el.style.removeProperty('color');
      el.style.removeProperty('-webkit-text-fill-color');
      el.style.removeProperty('caret-color');
      el.style.removeProperty('--snk-ei-caret');
      el.style.removeProperty('background');
      el.style.removeProperty('background-color');
    } catch (e0) {}
    el.__snkEiBgSaved = null;
    el.__snkEiBgColorSaved = null;
    var wrap = st.wrap;
    var parent = wrap && wrap.parentNode;
    if (parent && wrap) {
      parent.insertBefore(el, wrap);
      wrap.remove();
    }
    el.__snkEi = null;
  }
  function eiSyncCaret(el) {
    var st = el && el.__snkEi;
    if (!st || !st.caret) return;
    try {
      var focused = document.activeElement === el;
      if (!focused) { st.caret.style.opacity = '0'; return; }
      st.caret.style.opacity = '1';
      var cs = window.getComputedStyle(el);
      var pos = el.selectionEnd != null ? el.selectionEnd : (el.value || '').length;
      var before = String(el.value || '').slice(0, pos);
      var probe = st.probe;
      if (!probe) {
        probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;white-space:pre;left:0;top:0;';
        st.wrap.appendChild(probe);
        st.probe = probe;
      }
      probe.style.font = cs.font;
      probe.style.fontSize = cs.fontSize;
      probe.style.fontFamily = cs.fontFamily;
      probe.style.fontWeight = cs.fontWeight;
      probe.style.letterSpacing = cs.letterSpacing;
      probe.style.lineHeight = cs.lineHeight;
      probe.style.padding = '0';
      probe.style.border = '0';
      probe.style.whiteSpace = el.nodeName === 'TEXTAREA' ? 'pre-wrap' : 'pre';
      probe.style.width = el.nodeName === 'TEXTAREA' ? (el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 'px') : 'auto';
      probe.textContent = before || '';
      var padL = parseFloat(cs.paddingLeft) || 0;
      var padT = parseFloat(cs.paddingTop) || 0;
      var caretW = 1.5;
      var x = padL + probe.offsetWidth - (el.scrollLeft || 0);
      var y = padT;
      if (el.nodeName === 'TEXTAREA') {
        /* última línea */
        var br = before.split('\n');
        var last = br[br.length - 1] || '';
        probe.textContent = last;
        x = padL + probe.offsetWidth - (el.scrollLeft || 0);
        var lh = parseFloat(cs.lineHeight);
        if (!lh || !isFinite(lh)) lh = parseFloat(cs.fontSize) * 1.2;
        y = padT + (br.length - 1) * lh - (el.scrollTop || 0);
      }
      var h = parseFloat(cs.lineHeight);
      if (!h || !isFinite(h)) h = parseFloat(cs.fontSize) * 1.2 || 16;
      st.caret.style.height = h + 'px';
      st.caret.style.transform = 'translate(' + Math.max(padL, Math.min(x, el.clientWidth - caretW - 2)) + 'px,' + Math.max(0, y) + 'px)';
      st.sel = pos;
    } catch (eC) {}
  }
  
  function htmlWithSnakeMirror(text) {
    /* Igual que htmlWithSnake pero NUNCA deja el glifo del sistema (en móvil se filtraría). */
    if (!text) return '';
    var out = '', last = 0, m;
    RE.lastIndex = 0;
    while ((m = RE.exec(text))) {
      if (!m[0]) { if (RE.lastIndex === m.index) RE.lastIndex++; continue; }
      var raw = m[0];
      var d = BY[norm(raw)];
      if (!d) continue;
      out += escapeHtml(text.slice(last, m.index));
      preload(d[3]);
      if (BAD[d[3]]) {
        out += '<span class="snk-e" aria-hidden="true" style="visibility:hidden">' + escapeHtml(raw) + '</span>';
      } else {
        out += '<span class="snk-e" data-c="' + d[3] + '"><img class="snk-e-img" alt="" draggable="false" src="' + url(d[3]) + '"></span>';
      }
      last = m.index + raw.length;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }
  function eiPaint(el) {
    if (!eiEligible(el)) {
      if (el && el.__snkEi) eiTeardown(el);
      return;
    }
    var val = el.value || '';
    var need = hasSnakeEmoji(val);
    if (!need) {
      if (el.__snkEi) eiTeardown(el);
      return;
    }
    var st = eiEnsure(el);
    if (!st) return;
    if (st.last !== val) {
      st.last = val;
      eiCopyBox(el, st.layer);
      var html = htmlWithSnakeMirror(val);
      if (el.nodeName === 'TEXTAREA') html = html.replace(/\n/g, '<br>');
      st.layer.innerHTML = html || '';
    }
    st.layer.scrollLeft = el.scrollLeft;
    st.layer.scrollTop = el.scrollTop;
    eiSyncCaret(el);
  }
  function eiTeardownAll() {
    document.querySelectorAll('input.snk-ei-on,textarea.snk-ei-on').forEach(function (el) { eiTeardown(el); });
  }
  function onEiEvent(e) {
    if (!on) return;
    var el = e.target;
    if (!el || (el.nodeName !== 'INPUT' && el.nodeName !== 'TEXTAREA')) return;
    eiPaint(el);
  }
  var _eiRaf = 0;
  var _eiEl = null;
  function onEiEventSoon(e) {
    var el = e && e.target;
    if (!el || (el.nodeName !== 'INPUT' && el.nodeName !== 'TEXTAREA')) return;
    _eiEl = el;
    if (_eiRaf) return;
    _eiRaf = requestAnimationFrame(function () {
      _eiRaf = 0;
      var t = _eiEl;
      _eiEl = null;
      if (t) eiPaint(t);
    });
  }
  document.addEventListener('input', onEiEventSoon, true);
  document.addEventListener('compositionend', onEiEventSoon, true);
  document.addEventListener('keyup', function (e) {
    /* solo teclas que mueven caret / borran sin input en algunos móviles */
    if (!e) return;
    var k = e.key || '';
    if (k === 'Backspace' || k === 'Delete' || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') onEiEventSoon(e);
  }, true);
  document.addEventListener('click', onEiEvent, true);
  document.addEventListener('select', onEiEvent, true);
  document.addEventListener('selectionchange', function () {
    if (!on) return;
    var el = document.activeElement;
    if (el && el.__snkEi) eiSyncCaret(el);
  });
  document.addEventListener('focusin', onEiEvent, true);
  document.addEventListener('focusout', function (e) {
    var el = e.target;
    if (el && el.__snkEi && el.__snkEi.caret) el.__snkEi.caret.style.opacity = '0';
  }, true);
  document.addEventListener('scroll', function (e) {
    var el = e.target;
    if (!el || !el.__snkEi) return;
    el.__snkEi.layer.scrollLeft = el.scrollLeft;
    el.__snkEi.layer.scrollTop = el.scrollTop;
  }, true);
  window.addEventListener('resize', function () {
    document.querySelectorAll('input.snk-ei-on,textarea.snk-ei-on').forEach(function (el) {
      if (el.__snkEi) { el.__snkEi.last = null; eiPaint(el); }
    });
  });

  function apply(force) {
    var want = getPref() === 'snake';
    if (want === on && !force) {
      return;
    }
    on = want;
    document.documentElement.classList.toggle('snk-emoji-on', on);
    if (on) {
      if (document.body) {
        mo.observe(document.body, { childList: true, subtree: true });
        queue.add(document.body);
        schedule();
        try {
          var ae = document.activeElement;
          if (ae) eiPaint(ae);
        } catch (eEi) {}
      }
    } else {
      mo.disconnect();
      queue.clear();
      unwrapAll();
      eiTeardownAll();
    }
    try { document.querySelectorAll('.smj').forEach(function (x) { if (x.__smjPaint) x.__smjPaint(); }); } catch (e) {}
  }

  /* ---- Canvas (avatares del Metaverse): dibuja el emoji Snake encima del nativo cuando exista ---- */
  function paintCanvas(ctx, emoji, size, done) {
    if (!on || !ctx) return false;
    var d = BY[norm(emoji || '')];
    if (!d || BAD[d[3]]) return false;
    var im = preload(d[3]);
    function draw() {
      if (BAD[d[3]] || !im.naturalWidth) return;
      try {
        var s = Math.round(size * 0.74);
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(im, (size - s) / 2, (size - s) / 2, s, s);
        if (done) done();
      } catch (e) {}
    }
    if (im.complete && im.naturalWidth) draw();
    else im.addEventListener('load', draw, { once: true });
    return true;
  }

  /* ---- Toast «Copiado» ---- */
  var toastT = null;
  function toastCopied(d) {
    var el = document.getElementById('smjToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'smjToast';
      el.className = 'smj-toast snk-noemoji';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.innerHTML = '';
    if (d) { var im = document.createElement('img'); im.src = url(d[3]); im.alt = ''; el.appendChild(im); }
    el.appendChild(document.createTextNode(d ? 'Copiado: ' + d[1] : 'Copiado'));
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.classList.remove('show'); }, 1400);
  }
  function copyText(txt) {
    var ok = false;
    try {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    } catch (e) {}
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).catch(function () {}); ok = true; } catch (e2) {}
    return ok;
  }

  /* ---- App Snakemoji ---- */
  var lastCat = 'todo';
  function renderSnakemoji(body) {
    ensureCss();
    var root = document.createElement('div');
    root.className = 'smj snk-noemoji';
    root.innerHTML =
      '<div class="smj-top"><img src="' + url('1f61c') + '" alt=""><h3>Snakemoji</h3><span class="smj-count"></span></div>' +
      '<input class="smj-search" type="search" placeholder="Buscar emoji (p. ej. corazón, perro, risa…)" aria-label="Buscar emoji" autocomplete="off">' +
      '<div class="smj-cats" role="tablist"></div><div class="smj-grid" role="list"></div>' +
      '<div class="smj-foot">Toca un emoji para copiarlo · tecla S para abrir Snakemoji</div>';
    body.appendChild(root);
    var search = root.querySelector('.smj-search'), cats = root.querySelector('.smj-cats'), grid = root.querySelector('.smj-grid');
    root.querySelector('.smj-count').textContent = DATA.length + ' snakemojis';
    var cat = lastCat;
    function btn(id, ico, name) {
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.cat = id; b.setAttribute('role', 'tab');
      if (ico) { var d = BY[norm(ico)]; var im = document.createElement('img'); im.src = url(d[3]); im.alt = ''; b.appendChild(im); }
      b.appendChild(document.createTextNode(name));
      b.addEventListener('click', function () { cat = id; lastCat = id; search.value = ''; paint(); });
      cats.appendChild(b);
    }
    btn('todo', '', 'Todos');
    CATS.forEach(function (c) { btn(c[0], c[1], c[2]); });
    function fold(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
    function item(d) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'smj-item'; b.setAttribute('role', 'listitem');
      b.title = d[1] + ' · clic para copiar';
      b.setAttribute('aria-label', d[1]);
      var im = document.createElement('img'); im.src = url(d[3]); im.alt = d[0]; im.loading = 'lazy'; im.draggable = false;
      var sp = document.createElement('span'); sp.textContent = d[1];
      b.appendChild(im); b.appendChild(sp);
      b.addEventListener('click', function () { copyText(d[0]); toastCopied(d); });
      return b;
    }
    function paint() {
      cats.querySelectorAll('button').forEach(function (b) { var s = !search.value.trim() && b.dataset.cat === cat; b.classList.toggle('on', s); b.setAttribute('aria-selected', s ? 'true' : 'false'); });
      grid.innerHTML = '';
      var q = fold(search.value.trim());
      var frag = document.createDocumentFragment();
      if (q) {
        var res = DATA.filter(function (d) { return fold(d[1] + ' ' + d[2]).indexOf(q) >= 0 || d[0] === search.value.trim(); });
        if (!res.length) { var e = document.createElement('div'); e.className = 'smj-empty'; e.textContent = 'No hay ningún emoji Snake con «' + search.value.trim() + '»'; frag.appendChild(e); }
        res.forEach(function (d) { frag.appendChild(item(d)); });
      } else {
        CATS.forEach(function (c) {
          if (cat !== 'todo' && cat !== c[0]) return;
          var list = DATA.filter(function (d) { return d[2] === c[0]; });
          var h = document.createElement('h4'); h.textContent = c[2] + ' · ' + list.length; frag.appendChild(h);
          list.forEach(function (d) { frag.appendChild(item(d)); });
        });
      }
      grid.appendChild(frag);
      grid.scrollTop = 0;
    }
    root.__smjPaint = paint;
    var st = null;
    search.addEventListener('input', function () { clearTimeout(st); st = setTimeout(paint, 80); });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var f = grid.querySelector('.smj-item'); if (f) f.click(); }
    });
    paint();
    setTimeout(function () { try { if (!document.body.classList.contains('phone-mode')) search.focus({ preventScroll: true }); } catch (e) {} }, 60);
    return function () { clearTimeout(st); };
  }

  var ICON = url('1f61c');
  function installApp() {
    var apps = window.APPS;
    if (!apps) return false;
    if (!apps.snakemoji) {
      apps.snakemoji = {
        title: 'Snakemoji', icon: '😜', iconImg: ICON, iconImgClass: 'snakemoji-logo',
        iconHtml: '<img class="app-icon-img snakemoji-logo" src="' + ICON + '" alt="">',
        width: 460, height: 540, render: renderSnakemoji
      };
      try {
        if (document.querySelector('#iconLayer .desktop-icon') && typeof buildIcons === 'function') buildIcons();
        if (typeof buildStartMenu === 'function' && document.querySelector('#startMenu .start-item')) buildStartMenu();
      } catch (eB) {}
    }
    try {
      if (typeof APP_OPEN_ALIASES !== 'undefined' && APP_OPEN_ALIASES && !APP_OPEN_ALIASES.snakemoji)
        APP_OPEN_ALIASES.snakemoji = ['snakemoji', 'emojis', 'emoji', 'emojis snake', 'galería de emojis', 'galeria de emojis'];
    } catch (eA) {}
    return true;
  }

  /* ---- Tecla S ---- */
  var BLOCK_APPS = /^win-(code|terminal|metaverse|snake|games|desk|prism|server-i8|store)(\b|-|$)/;
  function topWindow() {
    var best = null, bz = -1;
    document.querySelectorAll('.app-window').forEach(function (w) {
      if (w.classList.contains('minimized') || w.classList.contains('win-closing')) return;
      if (!w.getClientRects().length) return;
      var cs = getComputedStyle(w);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      var z = parseInt(w.style.zIndex || cs.zIndex, 10) || 0;
      if (z >= bz) { bz = z; best = w; }
    });
    return best;
  }
  function desktopReady() {
    if (!cu()) return false;
    var il = document.getElementById('iconLayer');
    if (il && !il.getClientRects().length && !document.body.classList.contains('phone-mode')) return false;
    var lock = document.querySelector('#lockScreen:not([hidden]), .lock-screen.show, #loginScreen:not([hidden])');
    if (lock && lock.getClientRects().length && getComputedStyle(lock).display !== 'none') return false;
    return true;
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 's' && e.key !== 'S') return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.repeat || e.isComposing || e.defaultPrevented) return;
    if (document.pointerLockElement) return;
    var t = e.target, a = document.activeElement;
    var els = [t, a];
    for (var i = 0; i < els.length; i++) {
      var x = els[i];
      if (!x || x.nodeType !== 1) continue;
      var tag = x.nodeName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'CANVAS' || tag === 'IFRAME' || tag === 'VIDEO' || x.isContentEditable) return;
      if (x.closest && x.closest('.xterm,[contenteditable]:not([contenteditable="false"]),.mv-root,#win-code,#win-terminal,#win-metaverse,.CodeMirror,.cm-editor,[data-keyboard-game]')) return;
    }
    var w = topWindow();
    if (w && BLOCK_APPS.test(w.id || '')) return;
    if (document.querySelector('.mv-root') && document.querySelector('.mv-root').getClientRects().length && w && /metaverse/.test(w.id)) return;
    if (!desktopReady() || !window.APPS || !window.APPS.snakemoji || typeof window.openApp !== 'function') return;
    e.preventDefault();
    window.openApp('snakemoji');
  });

  function boot() {
    ensureCss();
    function startEngine() {
      if (!document.body) { setTimeout(startEngine, 30); return; }
      apply(true);
      try {
        var bootRoots = [document.getElementById('desktop'), document.getElementById('taskbar'), document.getElementById('startMenu'), document.getElementById('lock')];
        bootRoots.forEach(function (r) { if (r) queue.add(r); });
        schedule();
      } catch (e0) {}
    }
    startEngine();
    if (!installApp()) {
      var tries = 0;
      var iv = setInterval(function () { if (installApp() || ++tries > 400) clearInterval(iv); }, 50);
    }
    var lastEmail = email();
    setInterval(function () {
      var em = email();
      if (em !== lastEmail) {
        lastEmail = em;
        apply(true);
        if (on) {
          var desk = document.getElementById('desktop') || document.getElementById('taskbar');
          if (desk) { queue.add(desk); schedule(); }
        }
      }
    }, 15000);
    // Re-parse when apps open windows / chat paints
    document.addEventListener('snk-app-open', function () { if (on) { queue.add(document.body); schedule(); } }, true);
    function wrapOpenApp() {
      var _oa = window.openApp;
      if (typeof _oa !== 'function' || _oa.__snkEmojiWrapped) return !!_oa;
      window.openApp = function () {
        var r = _oa.apply(this, arguments);
        try {
          if (on) setTimeout(function () {
            var wins = document.querySelectorAll('.app-window .win-body');
            var target = wins.length ? wins[wins.length - 1] : document.body;
            queue.add(target);
            schedule();
          }, 80);
        } catch (e) {}
        return r;
      };
      window.openApp.__snkEmojiWrapped = true;
      return true;
    }
    if (!wrapOpenApp()) {
      var ow = 0;
      var oiv = setInterval(function () {
        if (wrapOpenApp() || ++ow > 200) clearInterval(oiv);
      }, 100);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.snakeEmoji = {
    count: DATA.length,
    list: function () { return DATA.map(function (d) { return { emoji: d[0], name: d[1], cat: d[2], url: url(d[3]) }; }); },
    has: function (s) { return !!BY[norm(s)]; },
    url: function (s) { var d = BY[norm(s)]; return d ? url(d[3]) : null; },
    get: getPref,
    set: setPref,
    toggle: function () { setPref(getPref() === 'snake' ? 'system' : 'snake'); },
    label: function () { return getPref() === 'snake' ? 'Snake OS' : 'Sistema'; },
    active: function () { return on; },
    fill: fillEmojiEl,
    parse: function (el) { if (on) walk(el || document.body); },
    rescan: function () { if (on && document.body) { queue.add(document.body); schedule();  } },
    paintCanvas: paintCanvas,
    open: function () { if (window.openApp) window.openApp('snakemoji'); }
  };
})();
