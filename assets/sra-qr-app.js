/* Snake OS · Códigos QR — interfaz propia sobre qrcode-generator (MIT, Kazuhiko Arase) y jsQR (Apache-2.0, cozmo). Todo en el navegador. */
(function () {
  'use strict';
  if (SRA.theme === 'dark') document.documentElement.classList.add('dark');
  var T = SRA.T, $ = function (s) { return document.querySelector(s); };
  var st = { mode: 'text', ecc: 'M', size: 8, fg: '#111111', bg: '#ffffff', hist: [] };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function wifiEsc(s) { return String(s).replace(/([\\;,:"])/g, '\\$1'); }
  function payload() {
    var m = st.mode;
    if (m === 'text') return $('#q-text').value;
    if (m === 'url') { var u = $('#q-url').value.trim(); return u && !/^[a-z][a-z0-9+.-]*:/i.test(u) ? 'https://' + u : u; }
    if (m === 'wifi') { var s = $('#q-ssid').value; if (!s) return ''; return 'WIFI:T:' + $('#q-sec').value + ';S:' + wifiEsc(s) + ';P:' + wifiEsc($('#q-pass').value) + ';' + ($('#q-hidden').checked ? 'H:true;' : '') + ';'; }
    if (m === 'vcard') { var n = $('#q-name').value; if (!n) return ''; return 'BEGIN:VCARD\nVERSION:3.0\nFN:' + n + '\n' + ($('#q-tel').value ? 'TEL:' + $('#q-tel').value + '\n' : '') + ($('#q-mail').value ? 'EMAIL:' + $('#q-mail').value + '\n' : '') + ($('#q-org').value ? 'ORG:' + $('#q-org').value + '\n' : '') + 'END:VCARD'; }
    return '';
  }
  var cur = null;
  function make() {
    var data = payload(), cv = $('#q-canvas'), ctx = cv.getContext('2d'), info = $('#q-info');
    cur = null;
    if (!data) { cv.width = cv.height = 260; ctx.fillStyle = '#f1f3f6'; ctx.fillRect(0, 0, 260, 260); ctx.fillStyle = '#8a94a6'; ctx.font = '15px system-ui'; ctx.textAlign = 'center'; ctx.fillText(T('Escribe algo para crear el QR', 'Type something to create a QR'), 130, 134); info.textContent = ''; return; }
    try {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      var q = qrcode(0, st.ecc); q.addData(data, 'Byte'); q.make();
      var n = q.getModuleCount(), cell = st.size, m = 4, px = (n + m * 2) * cell;
      cv.width = cv.height = px; ctx.fillStyle = st.bg; ctx.fillRect(0, 0, px, px); ctx.fillStyle = st.fg;
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect((c + m) * cell, (r + m) * cell, cell, cell);
      cur = { q: q, n: n, data: data };
      info.textContent = T(n + '×' + n + ' módulos · ' + data.length + ' caracteres', n + '×' + n + ' modules · ' + data.length + ' characters');
    } catch (e) { cv.width = cv.height = 260; ctx.fillStyle = '#fff1f1'; ctx.fillRect(0, 0, 260, 260); info.textContent = T('Demasiado texto para un QR. Acórtalo o baja la corrección de errores.', 'Too much text for a QR. Shorten it or lower error correction.'); }
    SRA.save('gen', { mode: st.mode, ecc: st.ecc, size: st.size, fg: st.fg, bg: st.bg, fields: fields() });
  }
  function fields() { var o = {}; document.querySelectorAll('[data-f]').forEach(function (el) { o[el.id] = el.type === 'checkbox' ? el.checked : el.value; }); return o; }
  function svg() {
    if (!cur) return null; var n = cur.n, m = 4, d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (cur.q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 2 * m) + ' ' + (n + 2 * m) + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="' + st.bg + '"/><path d="' + d + '" fill="' + st.fg + '"/></svg>';
  }
  function setMode(m) {
    st.mode = m;
    document.querySelectorAll('.q-mode').forEach(function (b) { b.classList.toggle('on', b.dataset.m === m); });
    document.querySelectorAll('.q-form').forEach(function (f) { f.hidden = f.dataset.m !== m; });
    make();
  }
  // --- Lector ---
  var stream = null, raf = 0, vid, scv, sctx;
  function result(txt) {
    var box = $('#r-out'); box.hidden = false;
    $('#r-text').textContent = txt;
    var isUrl = /^https?:\/\//i.test(txt); $('#r-open').hidden = !isUrl; $('#r-open').dataset.u = isUrl ? txt : '';
    if (st.hist[0] !== txt) { st.hist.unshift(txt); st.hist = st.hist.slice(0, 20); SRA.save('hist', st.hist); drawHist(); }
  }
  function drawHist() {
    $('#r-hist').innerHTML = st.hist.length ? st.hist.map(function (h, i) { return '<li><button data-h="' + i + '" title="' + T('Copiar', 'Copy') + '">' + esc(h.length > 90 ? h.slice(0, 90) + '…' : h) + '</button></li>'; }).join('') : '<li class="muted">' + T('Aún no has leído ningún código.', 'No codes read yet.') + '</li>';
  }
  function decodeFrom(src, w, h) {
    scv.width = w; scv.height = h; sctx.drawImage(src, 0, 0, w, h);
    var img = sctx.getImageData(0, 0, w, h);
    return jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
  }
  function tick() {
    if (!stream) return;
    if (vid.readyState >= 2) {
      var w = vid.videoWidth, h = vid.videoHeight, k = Math.min(1, 640 / Math.max(w, h));
      var c = decodeFrom(vid, Math.round(w * k), Math.round(h * k));
      if (c && c.data) { result(c.data); stopCam(); $('#r-msg').textContent = T('¡Código leído!', 'Code read!'); return; }
    }
    raf = requestAnimationFrame(tick);
  }
  function startCam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('#r-msg').textContent = T('Este navegador no permite usar la cámara aquí. Abre una imagen.', 'This browser cannot use the camera here. Open an image instead.'); return; }
    $('#r-msg').textContent = T('Pidiendo permiso para la cámara…', 'Asking for camera permission…');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (s) {
      stream = s; vid.srcObject = s; vid.hidden = false; vid.play(); $('#r-cam').textContent = T('Parar cámara', 'Stop camera');
      $('#r-msg').textContent = T('Apunta la cámara al código QR…', 'Point the camera at the QR code…'); raf = requestAnimationFrame(tick);
    }).catch(function () { $('#r-msg').textContent = T('No se pudo usar la cámara (permiso denegado o sin cámara). Puedes abrir una imagen.', 'Could not use the camera (permission denied or no camera). You can open an image.'); });
  }
  function stopCam() { if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); } stream = null; cancelAnimationFrame(raf); if (vid) { vid.srcObject = null; vid.hidden = true; } $('#r-cam').textContent = T('Usar cámara', 'Use camera'); }
  function readFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () {
      var k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = decodeFrom(im, Math.round(im.width * k), Math.round(im.height * k));
      URL.revokeObjectURL(url);
      if (c && c.data) { result(c.data); $('#r-msg').textContent = T('¡Código leído!', 'Code read!'); }
      else $('#r-msg').textContent = T('No se encontró ningún código QR en la imagen.', 'No QR code found in the image.');
    };
    im.src = url;
  }
  function copy(t, el) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { flash(el, T('Copiado', 'Copied')); }, function () { flash(el, T('No se pudo copiar', 'Could not copy')); }); }
  function flash(el, t) { var o = el.textContent; el.textContent = t; setTimeout(function () { el.textContent = o; }, 1200); }
  function tab(t) {
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); });
    $('#p-gen').hidden = t !== 'gen'; $('#p-read').hidden = t !== 'read'; if (t !== 'read') stopCam();
  }
  // --- montaje ---
  document.addEventListener('DOMContentLoaded', function () {
    document.documentElement.lang = SRA.lang;
    document.querySelectorAll('[data-es]').forEach(function (el) { el.textContent = T(el.dataset.es, el.dataset.en); });
    document.querySelectorAll('[data-ph-es]').forEach(function (el) { el.placeholder = T(el.dataset.phEs, el.dataset.phEn); });
    vid = $('#r-video'); scv = document.createElement('canvas'); sctx = scv.getContext('2d', { willReadFrequently: true });
    document.querySelectorAll('.tab').forEach(function (b) { b.onclick = function () { tab(b.dataset.t); }; });
    document.querySelectorAll('.q-mode').forEach(function (b) { b.onclick = function () { setMode(b.dataset.m); }; });
    document.querySelectorAll('[data-f]').forEach(function (el) { el.addEventListener('input', make); el.addEventListener('change', make); });
    $('#q-ecc').onchange = function () { st.ecc = this.value; make(); };
    $('#q-size').oninput = function () { st.size = +this.value; make(); };
    $('#q-fg').oninput = function () { st.fg = this.value; make(); };
    $('#q-bg').oninput = function () { st.bg = this.value; make(); };
    $('#q-png').onclick = function () { if (cur) $('#q-canvas').toBlob(function (b) { SRA.download(b, 'codigo-qr.png'); }); };
    $('#q-svg').onclick = function () { var s = svg(); if (s) SRA.download(new Blob([s], { type: 'image/svg+xml' }), 'codigo-qr.svg'); };
    $('#q-copy').onclick = function () { var el = this; if (cur && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) $('#q-canvas').toBlob(function (b) { navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(function () { flash(el, T('Copiado', 'Copied')); }, function () { flash(el, T('No se pudo copiar', 'Could not copy')); }); }); };
    $('#r-cam').onclick = function () { stream ? stopCam() : startCam(); };
    $('#r-file').onchange = function () { readFile(this.files[0]); this.value = ''; };
    $('#r-pick').onclick = function () { $('#r-file').click(); };
    $('#r-copy').onclick = function () { copy($('#r-text').textContent, this); };
    $('#r-open').onclick = function () { var u = this.dataset.u; if (/^https?:\/\//i.test(u)) window.open(u, '_blank', 'noopener'); };
    $('#r-hist').onclick = function (e) { var b = e.target.closest('[data-h]'); if (b) { var t = st.hist[+b.dataset.h]; result(t); copy(t, b); } };
    $('#r-clear').onclick = function () { st.hist = []; SRA.save('hist', []); drawHist(); };
    document.addEventListener('paste', function (e) { var it = [].slice.call((e.clipboardData || {}).items || []).find(function (i) { return /^image\//.test(i.type); }); if (it) { tab('read'); readFile(it.getAsFile()); } });
    var drop = $('#p-read'); drop.addEventListener('dragover', function (e) { e.preventDefault(); }); drop.addEventListener('drop', function (e) { e.preventDefault(); readFile(e.dataTransfer.files[0]); });
    SRA.onClose(stopCam);
    Promise.all([SRA.load('gen'), SRA.load('hist')]).then(function (r) {
      var g = r[0]; if (r[1] && r[1].length) st.hist = r[1];
      if (g) { st.ecc = g.ecc || 'M'; st.size = g.size || 8; st.fg = g.fg || st.fg; st.bg = g.bg || st.bg; Object.keys(g.fields || {}).forEach(function (id) { var el = document.getElementById(id); if (el) { if (el.type === 'checkbox') el.checked = !!g.fields[id]; else el.value = g.fields[id]; } }); }
      $('#q-ecc').value = st.ecc; $('#q-size').value = st.size; $('#q-fg').value = st.fg; $('#q-bg').value = st.bg;
      if (!g) $('#q-text').value = T('¡Hola desde Snake OS!', 'Hello from Snake OS!');
      drawHist(); setMode(g && g.mode || 'text');
    });
  });
})();
