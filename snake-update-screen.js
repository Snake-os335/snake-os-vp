/* Snake OS · actualizaciones sin interrumpir.
   - Al ABRIR Snake OS: si la versión del servidor (/api/status) es distinta de la última vista
     (localStorage snkSeenVersion), se muestra 10,5 s la pantalla «se está actualizando...» mientras
     se refrescan cachés y luego se entra en la versión nueva. La primera visita no la muestra.
   - Sesiones ya abiertas: NUNCA se recargan; solo un aviso pequeño de que hay actualización.
   - Durante el despliegue, las cargas nuevas reciben la página 503 (maintenance.html) del servidor. */
(function () {
  var KEY = 'snkSeenVersion', SHOW_MS = 10500, loaded = null, noticed = false;
  function en() { try { return window.snakeI18n && window.snakeI18n.lang === 'en'; } catch (e) { return false; } }
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function put(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  var SVG = '<svg viewBox="0 0 220 170" width="220" height="170" aria-hidden="true">' +
    '<g fill="#eafff0" stroke="#14532d" stroke-width="3"><path d="M60 70a28 28 0 0 1 52-14 24 24 0 0 1 44 10 20 20 0 0 1 4 40H62a22 22 0 0 1-2-36z"/></g>' +
    '<g class="su-arrow"><path d="M110 58v34" stroke="#2fae5f" stroke-width="7" stroke-linecap="round"/><path d="M96 80l14 14 14-14" fill="none" stroke="#2fae5f" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g>' +
    '<path d="M24 150c20-22 44 8 66-8s40-26 62-6 30 8 40-6" fill="none" stroke="#14532d" stroke-width="15" stroke-linecap="round"/>' +
    '<path d="M24 150c20-22 44 8 66-8s40-26 62-6 30 8 40-6" fill="none" stroke="#34d17a" stroke-width="10" stroke-linecap="round"/>' +
    '<ellipse cx="196" cy="128" rx="13" ry="10" fill="#34d17a" stroke="#14532d" stroke-width="3"/><circle cx="200" cy="125" r="2.4" fill="#14532d"/>' +
    '<path d="M208 131l9 2-9 2" fill="none" stroke="#e5484d" stroke-width="2" stroke-linecap="round"/></svg>';
  function screen() {
    var d = document.createElement('div'); d.id = 'snkUpdating'; d.setAttribute('translate', 'no'); d.setAttribute('data-noi18n', '');
    d.innerHTML = '<style>#snkUpdating{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(circle at 50% 35%,#1b6b3c,#06180d 70%);color:#eafff0;font-family:var(--snake-font,system-ui,sans-serif);text-align:center;transition:opacity .4s}' +
      '#snkUpdating .su-arrow{animation:suDown 1.2s ease-in-out infinite}@keyframes suDown{0%,100%{transform:translateY(-4px)}50%{transform:translateY(6px)}}' +
      '#snkUpdating h1{margin:0;font-size:1.6rem}#snkUpdating p{margin:0;opacity:.8;font-size:.9rem}</style>' + SVG +
      '<h1>' + (en() ? 'Snake OS! is updating...' : 'Snake OS! se está actualizando...') + '</h1>' +
      '<p>' + (en() ? 'Getting the new version ready…' : 'Preparando la versión nueva…') + '</p>';
    document.body.appendChild(d);
    return d;
  }
  function refreshCaches() {
    try { if (window.caches && caches.keys) caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); }); } catch (e) {}
    try { if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { try { r.update(); } catch (e) {} }); }); } catch (e) {}
  }
  function onOpen(v) {
    var seen = get(); put(v);
    if (!seen || seen === v) return; // primera visita o misma versión: nada
    var d = screen(); refreshCaches();
    setTimeout(function () { d.style.opacity = '0'; setTimeout(function () { d.remove(); }, 400); }, SHOW_MS);
  }
  function notice() {
    if (noticed) return; noticed = true;
    // Shadow DOM: los estilos globales de Snake OS (botones, divs fijos) no pueden deformar el aviso.
    var host = document.createElement('div'); host.id = 'snkUpdNotice'; host.setAttribute('translate', 'no'); host.setAttribute('data-noi18n', '');
    host.style.cssText = 'all:initial;position:fixed;left:0;right:0;bottom:calc(72px + env(safe-area-inset-bottom,0px));z-index:2147482000;display:flex;justify-content:center;pointer-events:none';
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var msg = en() ? '🐍 There is a Snake OS! update — it will be installed the next time you open it.' : '🐍 Hay una actualización de Snake OS! — se instalará la próxima vez que lo abras.';
    root.innerHTML = '<style>.t{pointer-events:auto;box-sizing:border-box;display:flex;align-items:flex-start;gap:10px;max-width:min(440px,calc(100vw - 24px));margin:0 12px;padding:10px 10px 10px 14px;background:rgba(10,30,18,.96);color:#eafff0;border:1px solid #2fae5f;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.35);font:14px/1.35 Inter,system-ui,-apple-system,Segoe UI,sans-serif;text-align:left}' +
      '.m{flex:1 1 auto;min-width:0;white-space:normal;overflow-wrap:anywhere}' +
      '.x{flex:0 0 auto;width:26px;height:26px;margin:-2px 0 0;padding:0;border:0;border-radius:8px;background:transparent;color:#eafff0;font:16px/26px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:none;backdrop-filter:none}' +
      '.x:hover{background:rgba(255,255,255,.12)}</style>' +
      '<div class="t" role="status"><span class="m"></span><button class="x" type="button">✕</button></div>';
    root.querySelector('.m').textContent = msg;
    var x = root.querySelector('.x'); x.title = en() ? 'Close' : 'Cerrar'; x.setAttribute('aria-label', x.title);
    x.onclick = function () { host.remove(); };
    document.body.appendChild(host);
  }
  function check() {
    fetch('/api/status', { cache: 'no-store', credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.version) return;
      if (loaded === null) { loaded = j.version; onOpen(j.version); }
      else if (j.version !== loaded) notice(); // sesión abierta: solo aviso, sin recargar
    }).catch(function () {});
  }
  function start() { check(); setInterval(function () { if (!document.hidden) check(); }, 60000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
