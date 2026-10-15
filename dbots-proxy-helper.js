/* Ayudante inyectado en las páginas del navegador del bot (iframe aislado, origen opaco).
   Mantiene la navegación dentro del proxy y acepta órdenes del bot por postMessage. */
(function () {
  var C = window.__DBP || {};
  var P = window.parent;
  function send(m) { try { m.__dbp = 1; P.postMessage(m, '*'); } catch (e) {} }
  function prox(u) { return C.p + '?u=' + encodeURIComponent(u) + '&t=' + encodeURIComponent(C.t || ''); }
  function abs(u) { try { return new URL(u, C.u || location.href).href; } catch (e) { return ''; } }
  function info() {
    var links = [];
    var as = document.querySelectorAll('a[href]');
    for (var i = 0; i < as.length && links.length < 40; i++) { var t = (as[i].innerText || '').trim().replace(/\s+/g, ' '); if (t && /^https?:/.test(as[i].href)) links.push({ text: t.slice(0, 80), url: as[i].href }); }
    return { type: 'loaded', url: C.u, title: document.title || '', links: links, error: C.error || '' };
  }
  if (C.error) { send({ type: 'loaded', url: C.u, title: '', links: [], error: C.error }); return; }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || e.defaultPrevented) return;
    var h = a.getAttribute('href') || '';
    if (/^(javascript:|#)/i.test(h)) return;
    var u = abs(h); if (!/^https?:/i.test(u)) return;
    e.preventDefault(); send({ type: 'nav', url: u }); location.href = prox(u);
  }, true);
  document.addEventListener('submit', function (e) {
    var f = e.target; if (!f || !f.action) return;
    e.preventDefault();
    if ((f.method || 'get').toLowerCase() !== 'get') { send({ type: 'note', text: 'El bot no envía formularios con datos (POST) por seguridad.' }); return; }
    var u = new URL(abs(f.getAttribute('action') || C.u));
    new FormData(f).forEach(function (v, k) { if (typeof v === 'string') u.searchParams.set(k, v); });
    send({ type: 'nav', url: u.href }); location.href = prox(u.href);
  }, true);
  function rect(el) { var r = el.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 60), y: r.top + r.height / 2 }; }
  function hl(el) { el.style.outline = '3px solid #fbbc05'; el.style.background = 'rgba(255,243,160,.85)'; el.style.borderRadius = '4px'; setTimeout(function () { el.style.outline = ''; el.style.background = ''; }, 1600); }
  function findLink(text, url) {
    var as = document.querySelectorAll('a[href]'), want = String(text || '').toLowerCase().trim();
    for (var i = 0; i < as.length; i++) if (url && as[i].href === url) return as[i];
    for (var j = 0; j < as.length; j++) { var t = (as[j].innerText || '').toLowerCase(); if (want && t.indexOf(want) >= 0) return as[j]; }
    return null;
  }
  function searchInput() { return document.querySelector('input[type=search],textarea[name=q],input[name=q],input[name=search],input[type=text]'); }
  window.addEventListener('message', function (e) {
    if (e.source !== P) return;
    var m = e.data || {}; var id = m.id;
    function reply(o) { o.id = id; o.type = o.type || 'reply'; send(o); }
    if (m.cmd === 'info') return reply(info());
    if (m.cmd === 'scroll') { window.scrollBy({ top: (m.dy || innerHeight * 0.8), behavior: 'smooth' }); return reply({ ok: true }); }
    if (m.cmd === 'locate') { var a = findLink(m.text, m.url); if (!a) return reply({ ok: false }); a.scrollIntoView({ block: 'center' }); hl(a); return setTimeout(function () { reply({ ok: true, rect: rect(a), url: a.href }); }, 350); }
    if (m.cmd === 'click') { var b = findLink(m.text, m.url); if (!b) return reply({ ok: false }); reply({ ok: true, url: b.href }); setTimeout(function () { location.href = prox(b.href); }, 150); return; }
    if (m.cmd === 'type') {
      var inp = searchInput(); if (!inp) return reply({ ok: false });
      inp.scrollIntoView({ block: 'center' }); hl(inp); inp.focus(); inp.value = '';
      var s = String(m.text || ''), i = 0;
      (function step() { if (i < s.length) { inp.value += s[i++]; return setTimeout(step, 40); } reply({ ok: true, rect: rect(inp) }); if (m.submit) { var f = inp.form; if (f) { if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit', { cancelable: true })); } } })();
      return;
    }
    if (m.cmd === 'read') {
      var ps = Array.prototype.filter.call(document.querySelectorAll('p,li,h2,h3'), function (x) { var r = x.getBoundingClientRect(); return (x.innerText || '').trim().length > 40 && r.top >= 0 && r.top < innerHeight; }).slice(0, 4);
      ps.forEach(function (x, k) { setTimeout(function () { hl(x); }, k * 450); });
      return setTimeout(function () { reply({ ok: true, n: ps.length }); }, ps.length * 450 + 200);
    }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { send(info()); }); else send(info());
})();
