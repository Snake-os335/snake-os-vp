/* Snake OS · Matriz LED 8x8 — misma cola _board y puente snake-os-lite-local.py que llamadas (~c1) y ¿Dónde? (~g). */
(function () {
  'use strict';

  var LS_KEY = 'snake-matrix-doc-v1';
  var STATUS_MS = 500;
  var APPLY_TIMEOUT_MS = 8000;

  /* Fuente 5x7 local (5 columnas x 7 filas, bit0 = arriba). Solo mayusculas, digitos y signos basicos. */
  var FONT5X7 = {
    'A': [0x7E, 0x11, 0x11, 0x11, 0x7E], 'B': [0x7F, 0x49, 0x49, 0x49, 0x36],
    'C': [0x3E, 0x41, 0x41, 0x41, 0x22], 'D': [0x7F, 0x41, 0x41, 0x22, 0x1C],
    'E': [0x7F, 0x49, 0x49, 0x49, 0x41], 'F': [0x7F, 0x48, 0x48, 0x48, 0x40],
    'G': [0x3E, 0x41, 0x49, 0x49, 0x7A], 'H': [0x7F, 0x08, 0x08, 0x08, 0x7F],
    'I': [0x00, 0x41, 0x7F, 0x41, 0x00], 'J': [0x20, 0x40, 0x41, 0x3F, 0x01],
    'K': [0x7F, 0x08, 0x14, 0x22, 0x41], 'L': [0x7F, 0x01, 0x01, 0x01, 0x01],
    'M': [0x7F, 0x20, 0x10, 0x20, 0x7F], 'N': [0x7F, 0x10, 0x08, 0x04, 0x7F],
    'O': [0x3E, 0x41, 0x41, 0x41, 0x3E], 'P': [0x7F, 0x48, 0x48, 0x48, 0x30],
    'Q': [0x3E, 0x41, 0x51, 0x21, 0x5E], 'R': [0x7F, 0x48, 0x4C, 0x4A, 0x31],
    'S': [0x31, 0x49, 0x49, 0x49, 0x26], 'T': [0x40, 0x40, 0x7F, 0x40, 0x40],
    'U': [0x7F, 0x01, 0x01, 0x01, 0x7F], 'V': [0x7F, 0x02, 0x04, 0x02, 0x7F],
    'W': [0x7F, 0x02, 0x0C, 0x02, 0x7F], 'X': [0x63, 0x14, 0x08, 0x14, 0x63],
    'Y': [0x70, 0x08, 0x07, 0x08, 0x70], 'Z': [0x61, 0x51, 0x49, 0x45, 0x43],
    '0': [0x3E, 0x51, 0x49, 0x45, 0x3E], '1': [0x00, 0x42, 0x7F, 0x40, 0x00],
    '2': [0x42, 0x61, 0x51, 0x49, 0x46], '3': [0x21, 0x41, 0x45, 0x4B, 0x31],
    '4': [0x18, 0x14, 0x12, 0x7F, 0x10], '5': [0x27, 0x45, 0x45, 0x45, 0x39],
    '6': [0x3C, 0x4A, 0x49, 0x49, 0x30], '7': [0x01, 0x71, 0x09, 0x05, 0x03],
    '8': [0x36, 0x49, 0x49, 0x49, 0x36], '9': [0x06, 0x49, 0x49, 0x29, 0x1E],
    ' ': [0x00, 0x00, 0x00, 0x00, 0x00], '!': [0x00, 0x00, 0x5F, 0x00, 0x00],
    '?': [0x02, 0x01, 0x51, 0x09, 0x06], '.': [0x00, 0x60, 0x60, 0x00, 0x00],
    ',': [0x00, 0x50, 0x30, 0x00, 0x00], '-': [0x08, 0x08, 0x08, 0x08, 0x08],
    ':': [0x00, 0x36, 0x36, 0x00, 0x00], '+': [0x08, 0x08, 0x3E, 0x08, 0x08],
    '<': [0x08, 0x14, 0x22, 0x41, 0x00], '>': [0x00, 0x41, 0x22, 0x14, 0x08],
    '/': [0x20, 0x10, 0x08, 0x04, 0x02], '_': [0x01, 0x01, 0x01, 0x01, 0x01],
    'Ñ': [0x7F, 0x10, 0x0C, 0x10, 0x7F], '¿': [0x00, 0x06, 0x09, 0x51, 0x02],
    '¡': [0x00, 0x00, 0x5F, 0x00, 0x00]
  };

  function emptyRows() { return [0, 0, 0, 0, 0, 0, 0, 0]; }
  function cloneRows(r) {
    var out = emptyRows();
    if (!Array.isArray(r)) return out;
    for (var i = 0; i < 8; i++) out[i] = (r[i] != null ? r[i] : 0) & 0xFF;
    return out;
  }
  function clampMs(v) {
    v = parseInt(v, 10);
    if (isNaN(v)) return 300;
    return Math.max(50, Math.min(2550, v));
  }

  function defaultDoc() {
    return { kind: 'animation', loop: true, brightness: 8, ms: 300, frames: [{ rows: emptyRows(), ms: 300 }], text: '' };
  }

  function loadDoc() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaultDoc();
      var d = JSON.parse(raw);
      if (!d || !Array.isArray(d.frames) || !d.frames.length) return defaultDoc();
      d.frames = d.frames.slice(0, 64).map(function (f) {
        return { rows: cloneRows(Array.isArray(f.rows) ? f.rows : emptyRows()), ms: clampMs(f.ms != null ? f.ms : d.ms) };
      });
      d.loop = !!d.loop;
      d.ms = clampMs(d.ms);
      d.brightness = Math.max(0, Math.min(15, parseInt(d.brightness, 10) || 8));
      d.kind = (d.kind === 'text' || d.kind === 'bitmap') ? d.kind : 'animation';
      d.text = String(d.text || '');
      return d;
    } catch (e) { return defaultDoc(); }
  }

  function saveDoc(d) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch (e) {}
  }

  /* Texto -> frames con scroll horizontal. Fila r (0-7): usamos filas 0..6 de la fuente, fila 7 libre. */
  function textToFrames(text, stepMs) {
    var cols = [];
    var upper = String(text || '').toUpperCase().slice(0, 24) || 'HOLA';
    for (var i = 0; i < upper.length; i++) {
      var g = FONT5X7[upper[i]] || FONT5X7[' '];
      for (var c = 0; c < 5; c++) cols.push(g[c]);
      cols.push(0x00);
    }
    cols.push(0, 0, 0, 0, 0, 0, 0, 0);
    var frames = [];
    for (var off = 0; off + 8 <= cols.length && frames.length < 64; off++) {
      var rows = emptyRows();
      for (var col = 0; col < 8; col++) {
        var bits = cols[off + col] & 0x7F;
        for (var r = 0; r < 7; r++) {
          if (bits & (1 << r)) rows[r] |= (0x80 >> col);
        }
      }
      frames.push({ rows: rows, ms: clampMs(stepMs) });
    }
    if (!frames.length) frames.push({ rows: emptyRows(), ms: clampMs(stepMs) });
    return frames;
  }

  function testFrames() {
    /* F y flecha → */
    return [
      { rows: [0xF8, 0x48, 0x48, 0x48, 0x40, 0x00, 0x00, 0x00], ms: 500 },
      { rows: [0x10, 0x18, 0x7C, 0xFE, 0x7C, 0x18, 0x10, 0x00], ms: 500 }
    ];
  }

  function postJSON(url, body, timeoutMs) {
    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, timeoutMs || APPLY_TIMEOUT_MS);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: ctrl.signal,
      credentials: 'same-origin'
    }).then(function (res) {
      clearTimeout(to);
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { http: res.status, ok: res.ok, data: data };
      });
    }).catch(function (e) {
      clearTimeout(to);
      if (e && e.name === 'AbortError') { var t = new Error('timeout'); t.code = 'timeout'; throw t; }
      throw e;
    });
  }

  function renderMatrixApp(body) {
    var doc = loadDoc();
    var cur = 0;
    var alive = true;
    var painting = false; /* drag con valor fijo */
    var paintVal = 1;
    var previewOn = false;
    var previewTimer = null;
    var previewIdx = 0;
    var draft = null; /* borrador IA {kind, frames} */
    var lastReplyAt = 0;
    var bridgeOk = null;
    var matrixCaps = null;

    body.innerHTML =
      '<style>' +
      '.mx-app{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0;overflow:auto;padding:12px;background:#07140d;color:#e7fff1;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;}' +
      '.mx-lead{font-size:11px;line-height:1.45;color:rgba(159,232,189,.88);border:1px solid rgba(52,209,122,.28);border-radius:10px;padding:8px 10px;background:rgba(52,209,122,.06);}' +
      '.mx-flash{font-size:11px;line-height:1.45;color:#ffe8c8;border:1px solid rgba(255,180,80,.45);border-radius:10px;padding:8px 10px;background:rgba(255,140,40,.08);display:none;}' +
      '.mx-flash.show{display:block;}' +
      '.mx-flash pre{margin:8px 0 0;padding:8px 10px;background:#04140c;border-radius:8px;color:#7CFFB0;font-size:11px;line-height:1.45;white-space:pre-wrap;word-break:break-all;user-select:all;}' +
      '.mx-chips{display:flex;gap:8px;flex-wrap:wrap;}' +
      '.mx-chip{font-size:11px;padding:3px 10px;border-radius:999px;border:1px solid rgba(52,209,122,.4);color:#9fe8bd;background:rgba(52,209,122,.08);}' +
      '.mx-chip.bad{color:#ff9d8a;border-color:rgba(255,120,90,.5);background:rgba(255,90,60,.08);}' +
      '.mx-main{display:flex;gap:14px;flex-wrap:wrap;}' +
      '.mx-grid{display:grid;grid-template-columns:repeat(8,30px);grid-template-rows:repeat(8,30px);gap:4px;padding:10px;background:#020805;border:1px solid rgba(255,60,40,.35);border-radius:12px;touch-action:none;user-select:none;}' +
      '.mx-px{width:30px;height:30px;border-radius:50%;background:#2a2f2d;border:1px solid #111;cursor:pointer;}' +
      '.mx-px.on{background:#ff2d1a;box-shadow:0 0 8px 2px rgba(255,45,26,.85),0 0 18px 4px rgba(255,45,26,.35);border-color:#ff6a55;}' +
      '.mx-side{display:flex;flex-direction:column;gap:8px;min-width:230px;flex:1;}' +
      '.mx-btns{display:flex;gap:6px;flex-wrap:wrap;}' +
      '.mx-btns button,.mx-row button{background:#123626;border:1px solid rgba(52,209,122,.5);color:#e7fff1;border-radius:8px;padding:7px 10px;cursor:pointer;font:inherit;font-size:12px;}' +
      '.mx-btns button.primary{background:#34d17a;color:#042014;font-weight:700;border:0;}' +
      '.mx-btns button.danger{border-color:rgba(255,120,90,.6);color:#ffb3a3;}' +
      '.mx-btns button.armed{background:#7a1f12;color:#fff;border-color:#ff6a55;}' +
      '.mx-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}' +
      '.mx-row label{color:rgba(231,255,241,.7);font-size:12px;}' +
      '.mx-row input[type=number],.mx-row input[type=text],.mx-row select,.mx-row textarea{background:#10261a;border:1px solid rgba(52,209,122,.4);color:#f4fff8;border-radius:8px;padding:6px 8px;font:inherit;font-size:12px;}' +
      '.mx-row input[type=number]{width:70px;}' +
      '.mx-msg{min-height:18px;font-size:12px;color:#9fe8bd;}' +
      '.mx-msg.err{color:#ff9d8a;}' +
      '.mx-thumbs{display:flex;gap:6px;flex-wrap:wrap;}' +
      '.mx-th{width:40px;height:40px;display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);gap:0;padding:3px;background:#020805;border:2px solid transparent;border-radius:6px;cursor:pointer;}' +
      '.mx-th.sel{border-color:#34d17a;}' +
      '.mx-th i{display:block;width:100%;height:100%;background:#222;}' +
      '.mx-th i.on{background:#ff2d1a;}' +
      '.mx-sec{border-top:1px solid rgba(52,209,122,.25);padding-top:8px;display:flex;flex-direction:column;gap:8px;}' +
      '.mx-sec h4{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#7CFFB0;}' +
      '.mx-draft{border:1px dashed rgba(52,209,122,.5);border-radius:8px;padding:8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;}' +
      '</style>' +
      '<div class="mx-app">' +
        '<p class="mx-lead" data-mx="lead">Puente <code>snake-os-lite-local.py</code> + cola <code>/api/board/*</code>. Bitmaps (<strong>Aplicar</strong>, juego Snake) usan <code>~m</code> en la Mega. Llamadas/¿Dónde? usan <code>~c1</code>/<code>~g</code>; el firmware recomendado incluye <strong>ambos</strong>.</p>' +
        '<div class="mx-flash" data-mx="flashBox"><strong>Falta firmware ~m</strong> (badge «~m no»). En el <strong>Mac con USB</strong>, Terminal — copia y pega (una vez):' +
        '<pre data-mx="flashPre"></pre>Tras flashear: monitor 115200 → <code>~m ?</code> debe contestar <code>~m hi 1 8x8</code>. Vuelve aquí y pulsa <strong>Test F/→</strong>.</div>' +
        '<div class="mx-chips"><span class="mx-chip bad" data-mx="chipBridge">Puente Lite: sin señal</span>' +
        '<span class="mx-chip bad" data-mx="chipCaps">~m: sin comprobar</span>' +
        '<span class="mx-chip bad" data-mx="chipReply">Placa ~m: sin datos</span></div>' +
        '<div class="mx-main"><div class="mx-grid" data-mx="grid"></div>' +
        '<div class="mx-side">' +
          '<div class="mx-btns">' +
            '<button class="primary" data-mx="apply">Aplicar</button>' +
            '<button data-mx="clearSim">Limpiar</button>' +
            '<button class="danger" data-mx="powerOff">Apagar placa</button>' +
            '<button data-mx="invert">Invertir</button>' +
            '<button data-mx="test">Test F/→</button>' +
          '</div>' +
          '<div class="mx-row"><label>Brillo</label><input type="range" min="0" max="15" step="1" value="' + doc.brightness + '" data-mx="bright">' +
          '<label>Tipo</label><select data-mx="kind"><option value="bitmap">bitmap</option><option value="animation">animation</option><option value="text">text</option></select></div>' +
          '<div class="mx-row" data-mx="textRow" style="display:none"><label>Texto</label><input type="text" maxlength="24" placeholder="HOLA" data-mx="textInput" style="flex:1;min-width:120px"></div>' +
          '<div class="mx-row"><label>ms/frame</label><input type="number" min="50" max="2550" step="10" data-mx="ms">' +
          '<label><input type="checkbox" data-mx="loop"> loop</label>' +
          '<button data-mx="preview">▶ preview</button></div>' +
          '<div class="mx-msg" data-mx="msg"></div>' +
        '</div></div>' +
        '<div class="mx-sec"><h4>Animación (' + '<span data-mx="fcount"></span>)</h4>' +
          '<div class="mx-thumbs" data-mx="thumbs"></div>' +
          '<div class="mx-row"><button data-mx="addFrame">+ frame</button><button data-mx="dupFrame">Duplicar</button>' +
          '<button data-mx="delFrame">Borrar</button><button data-mx="prevFrame">◀</button><button data-mx="nextFrame">▶</button>' +
          '<button data-mx="moveL">← mover</button><button data-mx="moveR">mover →</button></div>' +
        '</div>' +
        '<div class="mx-sec"><h4>IA</h4>' +
          '<div class="mx-row"><input type="text" data-mx="aiPrompt" placeholder="ej: calavera pixelada" style="flex:1;min-width:160px">' +
          '<select data-mx="aiMode"><option value="auto">auto</option><option value="frame">frame</option><option value="animation">animation</option><option value="text">text</option></select>' +
          '<button data-mx="aiGen">Generar</button></div>' +
          '<div class="mx-draft" data-mx="aiDraft" style="display:none"></div>' +
        '</div>' +
      '</div>';

    var root = body.querySelector('.mx-app');
    var grid = body.querySelector('[data-mx="grid"]');
    var thumbs = body.querySelector('[data-mx="thumbs"]');
    var msg = body.querySelector('[data-mx="msg"]');
    var chipBridge = body.querySelector('[data-mx="chipBridge"]');
    var chipCaps = body.querySelector('[data-mx="chipCaps"]');
    var chipReply = body.querySelector('[data-mx="chipReply"]');
    var flashBox = body.querySelector('[data-mx="flashBox"]');
    var flashPre = body.querySelector('[data-mx="flashPre"]');
    var flashBase = (window.location.origin || 'http://127.0.0.1:8987').replace(/\/$/, '');
    if (flashPre) {
      flashPre.textContent =
        'mkdir -p "$HOME/snake-os-matrix" && cd "$HOME/snake-os-matrix"\n' +
        'curl -fL -o flash.sh "' + flashBase + '/descargas/snake-os-matrix-cargar.sh"\n' +
        'chmod +x flash.sh\n' +
        'export SNAKEOS_WEB_BASE=' + flashBase + '\n' +
        './flash.sh "' + flashBase + '"';
    }
    var msInput = body.querySelector('[data-mx="ms"]');
    var loopBox = body.querySelector('[data-mx="loop"]');
    var bright = body.querySelector('[data-mx="bright"]');
    var kindSel = body.querySelector('[data-mx="kind"]');
    var textRow = body.querySelector('[data-mx="textRow"]');
    var textInput = body.querySelector('[data-mx="textInput"]');
    var aiPrompt = body.querySelector('[data-mx="aiPrompt"]');
    var aiMode = body.querySelector('[data-mx="aiMode"]');
    var aiDraftBox = body.querySelector('[data-mx="aiDraft"]');
    var fcount = body.querySelector('[data-mx="fcount"]');
    var clearBtn = body.querySelector('[data-mx="clearSim"]');
    var previewBtn = body.querySelector('[data-mx="preview"]');

    kindSel.value = doc.kind;
    textInput.value = doc.text || '';
    loopBox.checked = doc.loop;

    function say(t, err) {
      msg.textContent = t || '';
      msg.className = 'mx-msg' + (err ? ' err' : '');
    }

    function curFrame() {
      if (cur < 0) cur = 0;
      if (cur >= doc.frames.length) cur = doc.frames.length - 1;
      return doc.frames[cur];
    }

    function persist() { saveDoc(doc); }

    /* --- simulador 8x8 --- */
    var cells = [];
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        (function (rr, cc) {
          var d = document.createElement('div');
          d.className = 'mx-px';
          d.setAttribute('data-r', rr);
          d.setAttribute('data-c', cc);
          grid.appendChild(d);
          cells.push(d);
        })(r, c);
      }
    }

    function paintGrid(rows) {
      for (var i = 0; i < 64; i++) {
        var rr = Math.floor(i / 8), cc = i % 8;
        var on = (rows[rr] & (0x80 >> cc)) !== 0;
        cells[i].className = 'mx-px' + (on ? ' on' : '');
      }
    }

    function toggleCell(rr, cc, val) {
      if (doc.kind === 'text') {
        doc.kind = 'bitmap';
        kindSel.value = 'bitmap';
        textRow.style.display = 'none';
      }
      var f = curFrame();
      var mask = 0x80 >> cc;
      if (val == null) f.rows[rr] ^= mask;
      else if (val) f.rows[rr] |= mask;
      else f.rows[rr] &= (~mask & 0xFF);
      paintGrid(f.rows);
      drawThumbs();
      persist();
    }

    function gridPos(ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return null;
      var r = t.getAttribute('data-r'), c = t.getAttribute('data-c');
      if (r == null) return null;
      return { r: +r, c: +c };
    }

    grid.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      var p = gridPos(ev);
      if (!p) return;
      stopPreview();
      var f = curFrame();
      paintVal = ((f.rows[p.r] & (0x80 >> p.c)) !== 0) ? 0 : 1;
      painting = true;
      try { grid.setPointerCapture(ev.pointerId); } catch (e) {}
      toggleCell(p.r, p.c, paintVal);
    });
    grid.addEventListener('pointerover', function (ev) {
      if (!painting) return;
      var p = gridPos(ev);
      if (!p) return;
      toggleCell(p.r, p.c, paintVal);
    });
    window.addEventListener('pointerup', function () { painting = false; });

    /* --- miniaturas --- */
    function drawThumbs() {
      thumbs.innerHTML = '';
      doc.frames.forEach(function (f, idx) {
        var t = document.createElement('div');
        t.className = 'mx-th' + (idx === cur ? ' sel' : '');
        t.title = 'frame ' + (idx + 1);
        for (var rr = 0; rr < 8; rr++) {
          for (var cc = 0; cc < 8; cc++) {
            var i = document.createElement('i');
            if (f.rows[rr] & (0x80 >> cc)) i.className = 'on';
            t.appendChild(i);
          }
        }
        (function (j) {
          t.addEventListener('click', function () { stopPreview(); cur = j; syncEditor(); });
        })(idx);
        thumbs.appendChild(t);
      });
      fcount.textContent = doc.frames.length + ' frames';
    }

    function syncEditor() {
      var f = curFrame();
      paintGrid(f.rows);
      msInput.value = f.ms;
      drawThumbs();
    }

    msInput.addEventListener('change', function () {
      curFrame().ms = clampMs(msInput.value);
      msInput.value = curFrame().ms;
      persist();
    });
    loopBox.addEventListener('change', function () { doc.loop = loopBox.checked; persist(); });
    bright.addEventListener('change', function () {
      doc.brightness = Math.max(0, Math.min(15, parseInt(bright.value, 10) || 0));
      persist();
    });
    kindSel.addEventListener('change', function () {
      doc.kind = kindSel.value;
      textRow.style.display = doc.kind === 'text' ? '' : 'none';
      persist();
    });
    textRow.style.display = doc.kind === 'text' ? '' : 'none';
    textInput.addEventListener('change', function () {
      doc.text = textInput.value.slice(0, 24);
      if (doc.kind === 'text') {
        doc.frames = textToFrames(doc.text || 'HOLA', curFrame().ms);
        cur = 0;
        syncEditor();
      }
      persist();
    });

    /* --- editor animacion --- */
    function stopPreview() {
      previewOn = false;
      previewBtn.textContent = '▶ preview';
      if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
    }
    function startPreview() {
      if (!doc.frames.length) return;
      previewOn = true;
      previewBtn.textContent = '⏹ parar';
      previewIdx = cur;
      (function step() {
        if (!previewOn || !alive) return;
        var f = doc.frames[previewIdx % doc.frames.length];
        paintGrid(f.rows);
        previewIdx++;
        if (previewIdx >= doc.frames.length && !doc.loop) { stopPreview(); syncEditor(); return; }
        previewIdx = previewIdx % doc.frames.length;
        previewTimer = setTimeout(step, clampMs(f.ms));
      })();
    }
    previewBtn.addEventListener('click', function () {
      if (previewOn) { stopPreview(); syncEditor(); } else startPreview();
    });

    body.querySelector('[data-mx="addFrame"]').addEventListener('click', function () {
      if (doc.frames.length >= 64) { say('Máximo 64 frames.', true); return; }
      stopPreview();
      doc.frames.splice(cur + 1, 0, { rows: emptyRows(), ms: clampMs(msInput.value) });
      cur++;
      syncEditor(); persist();
    });
    body.querySelector('[data-mx="dupFrame"]').addEventListener('click', function () {
      if (doc.frames.length >= 64) { say('Máximo 64 frames.', true); return; }
      stopPreview();
      var f = curFrame();
      doc.frames.splice(cur + 1, 0, { rows: cloneRows(f.rows), ms: f.ms });
      cur++;
      syncEditor(); persist();
    });
    body.querySelector('[data-mx="delFrame"]').addEventListener('click', function () {
      stopPreview();
      if (doc.frames.length <= 1) { doc.frames[0] = { rows: emptyRows(), ms: curFrame().ms }; }
      else { doc.frames.splice(cur, 1); if (cur >= doc.frames.length) cur = doc.frames.length - 1; }
      syncEditor(); persist();
    });
    body.querySelector('[data-mx="prevFrame"]').addEventListener('click', function () {
      stopPreview(); cur = (cur - 1 + doc.frames.length) % doc.frames.length; syncEditor();
    });
    body.querySelector('[data-mx="nextFrame"]').addEventListener('click', function () {
      stopPreview(); cur = (cur + 1) % doc.frames.length; syncEditor();
    });
    function moveFrame(dir) {
      stopPreview();
      var j = cur + dir;
      if (j < 0 || j >= doc.frames.length) return;
      var t = doc.frames[cur]; doc.frames[cur] = doc.frames[j]; doc.frames[j] = t;
      cur = j; syncEditor(); persist();
    }
    body.querySelector('[data-mx="moveL"]').addEventListener('click', function () { moveFrame(-1); });
    body.querySelector('[data-mx="moveR"]').addEventListener('click', function () { moveFrame(1); });

    /* --- botones principales --- */
    function payloadFromDoc() {
      var frames = doc.frames.map(function (f) { return { rows: cloneRows(f.rows), ms: clampMs(f.ms) }; });
      if (doc.kind === 'text') {
        var txt = (textInput.value || doc.text || '').trim();
        if (txt) frames = textToFrames(txt, curFrame().ms);
      }
      var kind = frames.length > 1 ? 'animation' : 'frame';
      if (frames.length === 1 && doc.kind === 'animation') kind = 'animation';
      return { kind: kind, frames: frames, loop: !!doc.loop, brightness: doc.brightness };
    }

    function apiErrorMessage(r) {
      var d = (r && r.data) || {};
      var detail = d.detail;
      if (typeof detail === 'string' && detail) return detail;
      if (Array.isArray(detail) && detail.length) {
        return detail.map(function (x) { return x.msg || x.message || JSON.stringify(x); }).join('; ');
      }
      if (r && r.http === 429) return 'Demasiadas peticiones seguidas; espera 1 s y reintenta.';
      if (r && r.http === 401) return 'Sesión caducada; vuelve a entrar en Snake OS.';
      return 'No se pudo encolar en la cola Lite (HTTP ' + (r ? r.http : '?') + ').';
    }

    function waitJobDone(jobId, attempt) {
      attempt = attempt || 0;
      if (attempt > 24) {
        say('Encolado en Lite, pero la Mega no respondió ~m (timeout). ¿Está snake-os-lite-local.py en el PC USB?', true);
        return;
      }
      fetch('/api/matrix/status?job=' + encodeURIComponent(jobId), { cache: 'no-store', credentials: 'same-origin' })
        .then(function (res) {
          if (res.status === 404) {
            say('Este envío fue sustituido por uno más reciente. Mira el mensaje del último Aplicar.', true);
            return null;
          }
          return res.ok ? res.json() : {};
        })
        .then(function (d) {
          if (d == null) return;
          d = d || {};
          var st = d.status || '';
          if (st === 'done') {
            lastReplyAt = Date.now();
            say('Aplicado en la placa (~m ok).');
            pollStatus();
            return;
          }
          if (st === 'error') {
            say('La placa rechazó el patrón' + (d.error ? ': ' + d.error : '.'), true);
            return;
          }
          if (st === 'sent_no_reply') {
            say('Líneas ~m enviadas; la Mega no contestó. Lite estándar solo anima ~c1/~g; bitmaps necesitan firmware con ~m.', true);
            return;
          }
          if (st === 'timeout') {
            say('Envío atascado en cola Lite (timeout). Revisa snake-os-lite-local.py y el USB.', true);
            return;
          }
          if (attempt === 0 || attempt === 4) {
            say('Encolado (job ' + jobId + '). Estado: ' + (st || '…') + ' — esperando ~m…');
          }
          setTimeout(function () { waitJobDone(jobId, attempt + 1); }, 400);
        })
        .catch(function () {
          setTimeout(function () { waitJobDone(jobId, attempt + 1); }, 400);
        });
    }

    function handleApplyResult(r) {
      var d = (r && r.data) || {};
      if (r && r.ok && d.id) {
        say('Patrón encolado (job ' + d.id + ', ' + (d.lines || 1) + ' línea(s) ~m).');
        waitJobDone(d.id, 0);
        return;
      }
      if (r && r.ok) {
        lastReplyAt = Date.now();
        say(d.message || 'Encolado para la placa.');
      } else {
        say(apiErrorMessage(r), true);
      }
    }

    body.querySelector('[data-mx="apply"]').addEventListener('click', function () {
      say('Enviando…');
      postJSON('/api/matrix/apply', payloadFromDoc()).then(handleApplyResult).catch(function (e) {
        if (e && e.code === 'timeout') say('Timeout enviando ~m. El puente Lite puede estar saturado; reintenta.', true);
        else say('Sin conexión con Snake OS / puente Lite.', true);
      });
    });

    /* Limpiar (simulacion): long-press o doble confirm borra TODOS los frames */
    var armTimer = null, armed = false, pressTimer = null;
    function disarm() {
      armed = false;
      clearBtn.classList.remove('armed');
      clearBtn.textContent = 'Limpiar';
      if (armTimer) { clearTimeout(armTimer); armTimer = null; }
    }
    function wipeSim() {
      stopPreview();
      var ms = curFrame().ms;
      doc.frames = [{ rows: emptyRows(), ms: ms }];
      cur = 0; draft = null; hideDraft();
      syncEditor(); persist();
      say('Simulación limpia.');
      disarm();
    }
    clearBtn.addEventListener('click', function () {
      if (armed) { wipeSim(); return; }
      armed = true;
      clearBtn.classList.add('armed');
      clearBtn.textContent = '¿Seguro? pulsa otra vez';
      say('Limpiar borra todos los frames del editor (no toca la placa). Pulsa otra vez para confirmar.');
      armTimer = setTimeout(disarm, 3000);
    });
    clearBtn.addEventListener('pointerdown', function () {
      pressTimer = setTimeout(function () { wipeSim(); }, 600);
    });
    clearBtn.addEventListener('pointerup', function () {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    });

    body.querySelector('[data-mx="powerOff"]').addEventListener('click', function () {
      say('Encolando ~m c (apagar matriz)…');
      postJSON('/api/matrix/clear', {}).then(function (r) {
        if (r && r.ok) {
          var t0 = Date.now();
          (function waitClear(n) {
            if (n > 20) {
              say('~m c encolado; Lite no confirmó apagado (¿Mega sin ~m?).', true);
              return;
            }
            fetch('/api/matrix/status', { cache: 'no-store', credentials: 'same-origin' })
              .then(function (res) { return res.ok ? res.json() : {}; })
              .then(function (d) {
                if (d && d.status === 'done') {
                  lastReplyAt = Date.now();
                  say('Matriz apagada (~m c vía Lite).');
                  pollStatus();
                  return;
                }
                if (Date.now() - t0 > 8000) {
                  say('~m c enviado; sin ~m ok c — en Lite stock solo hay patrones de llamada/mapa.', true);
                  return;
                }
                setTimeout(function () { waitClear(n + 1); }, 350);
              })
              .catch(function () { setTimeout(function () { waitClear(n + 1); }, 350); });
          })(0);
        } else say('No se pudo encolar ~m c.', true);
      }).catch(function (e) {
        if (e && e.code === 'timeout') say('Timeout encolando ~m c.', true);
        else say('Sin conexión con el puente Lite.', true);
      });
    });

    body.querySelector('[data-mx="invert"]').addEventListener('click', function () {
      stopPreview();
      var f = curFrame();
      f.rows = f.rows.map(function (v) { return (~v) & 0xFF; });
      syncEditor(); persist();
    });

    body.querySelector('[data-mx="test"]').addEventListener('click', function () {
      say('Enviando test F/→…');
      postJSON('/api/matrix/apply', { kind: 'animation', frames: testFrames(), loop: true, brightness: doc.brightness }).then(handleApplyResult).catch(function (e) {
        if (e && e.code === 'timeout') say('Timeout en el test. Revisa el puente.', true);
        else say('Sin conexión con el puente.', true);
      });
    });

    /* --- IA: solo borrador, nunca aplica solo --- */
    function hideDraft() { aiDraftBox.style.display = 'none'; aiDraftBox.innerHTML = ''; }
    function normAiFrames(d) {
      if (!d) return null;
      if (d.preview) return normAiFrames(d.preview);
      if (Array.isArray(d.frames) && d.frames.length) {
        return d.frames.slice(0, 64).map(function (f) {
          var rows = Array.isArray(f.rows) ? f.rows : (Array.isArray(f) ? f : null);
          if (!rows) return null;
          return { rows: cloneRows(rows), ms: clampMs(f.ms != null ? f.ms : 300) };
        }).filter(Boolean);
      }
      if (Array.isArray(d.rows) && d.rows.length === 8) return [{ rows: cloneRows(d.rows), ms: 300 }];
      if (d.draft) return normAiFrames(d.draft);
      if (d.result) return normAiFrames(d.result);
      return null;
    }
    function showDraft(frames, kind) {
      draft = { kind: kind || 'bitmap', frames: frames };
      aiDraftBox.style.display = '';
      aiDraftBox.innerHTML = '';
      var label = document.createElement('span');
      label.textContent = 'Borrador IA (' + frames.length + ' frame(s), ' + draft.kind + ') — sin aplicar:';
      var prev = document.createElement('div');
      prev.className = 'mx-th';
      prev.style.cursor = 'default';
      var f0 = frames[0];
      for (var rr = 0; rr < 8; rr++) {
        for (var cc = 0; cc < 8; cc++) {
          var i = document.createElement('i');
          if (f0.rows[rr] & (0x80 >> cc)) i.className = 'on';
          prev.appendChild(i);
        }
      }
      var use = document.createElement('button');
      use.textContent = 'Usar';
      var drop = document.createElement('button');
      drop.textContent = 'Descartar';
      use.addEventListener('click', function () {
        if (!draft) return;
        stopPreview();
        doc.frames = draft.frames.map(function (f) { return { rows: cloneRows(f.rows), ms: f.ms }; });
        doc.kind = draft.frames.length > 1 ? 'animation' : 'bitmap';
        kindSel.value = doc.kind;
        textRow.style.display = 'none';
        cur = 0; draft = null; hideDraft();
        syncEditor(); persist();
        say('Borrador cargado en el editor. Pulsa Aplicar para enviarlo a la placa.');
      });
      drop.addEventListener('click', function () { draft = null; hideDraft(); say('Borrador descartado.'); });
      aiDraftBox.appendChild(label);
      aiDraftBox.appendChild(prev);
      aiDraftBox.appendChild(use);
      aiDraftBox.appendChild(drop);
    }
    body.querySelector('[data-mx="aiGen"]').addEventListener('click', function () {
      var p = (aiPrompt.value || '').trim();
      if (!p) { say('Escribe un prompt para la IA.', true); return; }
      say('Generando con IA (borrador, no toca la placa)…');
      postJSON('/api/matrix/ai', { prompt: p, mode: aiMode.value || 'auto' }, 90000).then(function (r) {
        if (!r || !r.ok) {
          var msg = apiErrorMessage(r);
          if (msg && msg.indexOf('encolar en la cola Lite') >= 0) {
            msg = 'IA falló (HTTP ' + (r ? r.http : '?') + ').';
            var detail = r && r.data && r.data.detail;
            if (typeof detail === 'string' && detail) msg = detail;
          }
          say(msg, true);
          return;
        }
        var frames = normAiFrames(r && r.data);
        if (!frames || !frames.length) { say('La IA no devolvió frames válidos.', true); return; }
        var kind = (r.data && (r.data.kind || (r.data.draft && r.data.draft.kind) || (r.data.preview && r.data.preview.kind))) || (frames.length > 1 ? 'animation' : 'bitmap');
        showDraft(frames, kind);
        say('Borrador listo. Revísalo y pulsa Usar o Descartar.');
      }).catch(function (e) {
        if (e && e.code === 'timeout') say('La IA tardó demasiado (timeout 90s). Reintenta o usa un prompt más simple.', true);
        else say('No se pudo contactar con la IA.', true);
      });
    });

    /* --- chips: puente + ultima respuesta (poll 500ms) --- */
    function tickChips() {
      var age = lastReplyAt ? Math.round((Date.now() - lastReplyAt) / 1000) : null;
      if (age == null) {
        chipReply.textContent = 'Placa ~m: sin respuesta';
        chipReply.className = 'mx-chip bad';
      } else {
        chipReply.textContent = 'Placa ~m hace ' + age + 's';
        chipReply.className = 'mx-chip' + (age > 15 ? ' bad' : '');
      }
      if (matrixCaps && matrixCaps.supports_custom) {
        chipCaps.textContent = '~m OK ' + (matrixCaps.size || '8x8');
        chipCaps.className = 'mx-chip';
      } else if (matrixCaps && matrixCaps.checked) {
        chipCaps.textContent = '~m no — flashea firmware (abajo)';
        chipCaps.className = 'mx-chip bad';
      } else {
        chipCaps.textContent = '~m: comprobando…';
        chipCaps.className = 'mx-chip bad';
      }
      if (bridgeOk == null) {
        chipBridge.textContent = 'Puente Lite: sin señal';
        chipBridge.className = 'mx-chip bad';
      } else if (bridgeOk) {
        chipBridge.textContent = 'Puente Lite: activo';
        chipBridge.className = 'mx-chip';
      } else {
        chipBridge.textContent = 'Puente Lite: sin señal';
        chipBridge.className = 'mx-chip bad';
      }
      if (flashBox) {
        var needFlash = !!(matrixCaps && matrixCaps.checked && !matrixCaps.supports_custom);
        flashBox.classList.toggle('show', needFlash);
      }
    }
    function pollStatus() {
      if (!alive) return;
      fetch('/api/matrix/status', { cache: 'no-store', credentials: 'same-origin' }).then(function (res) {
        if (!res.ok) throw new Error('http');
        return res.json();
      }).then(function (d) {
        d = d || {};
        if (typeof d.bridge_age_s === 'number') {
          bridgeOk = d.bridge_age_s >= 0 && d.bridge_age_s < 8;
        } else {
          var b = d.bridge || d.puente || d.state || d.status;
          if (typeof b === 'string') bridgeOk = /conect|connect|ok|up|online/i.test(b);
          else if (typeof d.connected === 'boolean') bridgeOk = d.connected;
          else if (typeof d.ok === 'boolean') bridgeOk = d.ok;
          else bridgeOk = null;
        }
        if (d.device_matrix) {
          if (d.device_matrix.supports_custom) {
            matrixCaps = { supports_custom: true, size: d.device_matrix.size || '8x8', checked: true };
          } else if (bridgeOk === false) {
            matrixCaps = matrixCaps || { supports_custom: false, checked: false };
          }
        }
        if (typeof d.device_age_s === 'number' && d.device_age_s >= 0 && d.device_age_s < 86400) {
          lastReplyAt = Date.now() - Math.round(d.device_age_s * 1000);
          if (d.device_matrix && d.device_matrix.supports_custom) {
            matrixCaps = { supports_custom: true, size: d.device_matrix.size || '8x8', checked: true };
          }
        } else {
          var lr = d.last_reply_ms || d.lastReplyMs || d.last_reply_s || d.lastReplyS || d.age_ms || d.age;
          if (typeof lr === 'number') {
            var ageMs = (d.last_reply_ms != null || d.lastReplyMs != null || d.age_ms != null) ? lr : lr * 1000;
            if (ageMs >= 0 && ageMs < 3600000) lastReplyAt = Date.now() - ageMs;
          } else if (d.last_reply_at) {
            var t = Date.parse(d.last_reply_at);
            if (!isNaN(t)) lastReplyAt = t;
          }
        }
        tickChips();
      }).catch(function () {
        bridgeOk = false;
        tickChips();
      });
    }

    syncEditor();
    tickChips();
    pollStatus();
    postJSON('/api/matrix/probe', {}, 5000).catch(function () {});
    setTimeout(function () {
      if (!matrixCaps || !matrixCaps.supports_custom) {
        matrixCaps = matrixCaps || {};
        matrixCaps.checked = true;
        if (!matrixCaps.supports_custom) tickChips();
      }
    }, 12000);
    var statusTimer = setInterval(pollStatus, STATUS_MS);
    var chipTimer = setInterval(tickChips, 1000);

    return function cleanup() {
      alive = false;
      stopPreview();
      clearInterval(statusTimer);
      clearInterval(chipTimer);
    };
  }

  window.renderMatrixApp = renderMatrixApp;
})();
