/* Snake OS: ayudas de seguridad comunes (oct 2026). Se carga pronto en index.html.
   - window.snkEscape(texto): escapa texto para meterlo en innerHTML / atributos.
   - Registro discreto de errores: window.onerror y promesas sin capturar van a la consola
     (sin avisos al usuario, sin repetir el mismo error) y se guardan en window.__snkErrors. */
(function () {
  'use strict';
  if (typeof window.snkEscape !== 'function') {
    window.snkEscape = function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };
  }
  if (window.__snkErrLog) return;
  window.__snkErrLog = 1;
  var seen = {};
  var count = 0;
  var list = window.__snkErrors = [];
  function note(kind, msg, where) {
    try {
      var key = kind + '|' + String(msg || '').slice(0, 200) + '|' + String(where || '');
      if (seen[key]) { seen[key]++; return; }
      seen[key] = 1;
      if (++count > 200) return;
      list.push({ t: Date.now(), kind: kind, msg: String(msg || '').slice(0, 500), where: String(where || '') });
      if (list.length > 50) list.shift();
      if (window.console && console.warn) console.warn('[Snake OS] ' + kind + ':', msg, where || '');
    } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    if (!e) return;
    var t = e.target;
    if (t && t !== window && t.tagName) return; /* fallos de carga de <script>/<img>: ya los gestiona el arranque */
    note('error', e.message || (e.error && e.error.message) || 'error', (e.filename || '') + (e.lineno ? ':' + e.lineno : ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    note('promesa', (r && (r.message || r.detail)) || String(r), r && r.status ? 'HTTP ' + r.status : '');
  });
})();
