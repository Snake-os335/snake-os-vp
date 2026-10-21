/* Snake OS VP Pro · insignia PRO pública (2026-10-21)
   Las APIs que devuelven datos públicos de otras cuentas incluyen solo un booleano «pro». Esta pieza pinta la
   insignia dorada ⭐ PRO (mismo estilo que .snkp-badge de snake-pro.js) junto al nombre. Sin Pro no cambia nada:
   el HTML del nombre se devuelve tal cual. Uso:
     snkProBadge.name(user, nombreHtmlYaEscapado)  → nombre (+ insignia si user.pro)
     snkProBadge.html(user) → '' o la insignia · snkProBadge.el(user) → elemento o null
     snkProBadge.lookup([ids]) → Promise<{id: bool}> (lote, /api/pro/badges, caché 30 s)  */
(function () {
  'use strict';
  if (window.snkProBadge) return;
  var known = {}; /* 'i:<id>' / 'e:<email>' → bool (lo último que dijo el servidor) */
  var cache = {}, CACHE_MS = 30000;
  function css() {
    if (document.getElementById('snkProBadgeCss')) return;
    var st = document.createElement('style'); st.id = 'snkProBadgeCss';
    st.textContent =
      '.snkpb{display:inline-flex;align-items:center;gap:2px;flex:0 0 auto;white-space:nowrap;vertical-align:middle;margin:0 0 0 5px;padding:0 5px;border-radius:5px;' +
      'font:800 9.5px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.05em;text-transform:none;font-style:normal;' +
      'color:#2a1c00;background:linear-gradient(135deg,#ffe48a,#f5c542 55%,#c9931a);box-shadow:0 0 0 1px rgba(201,147,26,.35);max-width:none;overflow:visible;text-overflow:clip;pointer-events:none;user-select:none}' +
      '.snkpb .snk-e,.snkpb .snk-e>.snk-e-img{width:1.15em;height:1.15em;vertical-align:-0.15em}' +
      '.snkpb-row{display:inline-flex;align-items:center;max-width:100%;min-width:0;vertical-align:bottom}' +
      '.snkpb-nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}' +
      '@media (max-width:420px){.snkpb{font-size:8.5px;padding:0 4px;margin-left:4px}}';
    (document.head || document.documentElement).appendChild(st);
  }
  function key(u) {
    var out = [];
    if (u && u.id != null && u.id !== '') out.push('i:' + u.id);
    if (u && u.email) out.push('e:' + String(u.email).toLowerCase());
    return out;
  }
  function isPro(u) {
    if (!u || typeof u !== 'object') return false;
    var ks = key(u);
    if (typeof u.pro === 'boolean') { ks.forEach(function (k) { known[k] = u.pro; }); return u.pro; }
    for (var i = 0; i < ks.length; i++) if (typeof known[ks[i]] === 'boolean') return known[ks[i]];
    return false;
  }
  function title() { return String(document.documentElement.lang || '').slice(0, 2) === 'en' ? 'Snake OS VP Pro member' : 'Tiene Snake OS VP Pro'; }
  function html(u) {
    if (!isPro(u)) return '';
    css();
    return '<span class="snkpb" translate="no" data-noi18n title="' + title() + '" aria-label="' + title() + '">⭐ PRO</span>';
  }
  function name(u, nameHtml) {
    var b = html(u);
    if (!b) return nameHtml;
    return '<span class="snkpb-row"><span class="snkpb-nm">' + nameHtml + '</span>' + b + '</span>';
  }
  function el(u) {
    var h = html(u); if (!h) return null;
    var d = document.createElement('span'); d.innerHTML = h; return d.firstChild;
  }
  function lookup(ids) {
    var now = Date.now(), need = [], res = {};
    (ids || []).forEach(function (id) {
      id = String(id || '').replace(/\D/g, ''); if (!id) return;
      var c = cache[id]; if (c && now - c.t < CACHE_MS) res[id] = c.v; else if (need.indexOf(id) < 0) need.push(id);
    });
    if (!need.length) return Promise.resolve(res);
    return fetch('/api/pro/badges?ids=' + need.slice(0, 100).join(','), { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : { pro: {} }; }).then(function (j) {
      var p = (j && j.pro) || {};
      Object.keys(p).forEach(function (id) { cache[id] = { v: !!p[id], t: Date.now() }; known['i:' + id] = !!p[id]; res[id] = !!p[id]; });
      return res;
    }, function () { return res; });
  }
  window.snkProBadge = { isPro: isPro, html: html, name: name, el: el, lookup: lookup, css: css };
})();
