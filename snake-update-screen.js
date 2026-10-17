/* Snake OS · actualizaciones (la «update» de Snake OS).
   Cómo se publica: scripts/update-start.sh → desplegar → scripts/update-end.sh (lo hace solo el auto-deploy
   de la VM al hacer push a main; ver README «Actualizar Snake OS»).
   - /api/status → { updating, version }. version = commit + firma de los archivos estáticos: cambia en CADA
     despliegue (git pull, merge o copia de archivos), aunque no se reinicie el contenedor.
   - Pestañas abiertas (se comprueba cada 20 s, cada 3 s durante una actualización, y al volver a la pestaña):
       · updating=true → pantalla completa «Snake OS! se está actualizando...»; cuando termina se recarga
         y entra en la versión nueva.
       · versión distinta (despliegue sin flag o flag demasiado corto para verlo) → la misma pantalla.
       · Sin sesión iniciada se recarga en seguida. Con sesión, la pantalla cuenta 10 s antes de recargar y
         ofrece «Ahora no» (queda un aviso con «Actualizar ahora»; se vuelve a lanzar a los 10 min).
   - Al ABRIR Snake OS con una versión distinta de la última vista (localStorage snkSeenVersion) se muestra
     10,5 s la pantalla mientras se refrescan cachés. La primera visita no la muestra.
   - Cargas nuevas durante el despliegue: página 503 maintenance.html (se recarga sola).
   - window.snakeUpdate = { check, apply, version, pending } para depurar. */
(function () {
  var KEY = 'snkSeenVersion', SHOW_MS = 10500, POLL_MS = 20000, FAST_MS = 3000, COUNT_S = 10, SNOOZE_MS = 600000;
  var loaded = null, pending = null, shownEl = null, inDeploy = false, applying = false, snoozeUntil = 0, timer = 0, cdTimer = 0;
  function en() { try { return window.snakeI18n && window.snakeI18n.lang === 'en'; } catch (e) { return false; } }
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function put(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function loggedIn() { try { return !!window.currentUser; } catch (e) { return false; } }
  var SVG = '<svg viewBox="0 0 220 170" width="220" height="170" aria-hidden="true">' +
    '<g fill="#eafff0" stroke="#14532d" stroke-width="3"><path d="M60 70a28 28 0 0 1 52-14 24 24 0 0 1 44 10 20 20 0 0 1 4 40H62a22 22 0 0 1-2-36z"/></g>' +
    '<g class="su-arrow"><path d="M110 58v34" stroke="#2fae5f" stroke-width="7" stroke-linecap="round"/><path d="M96 80l14 14 14-14" fill="none" stroke="#2fae5f" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g>' +
    '<path d="M24 150c20-22 44 8 66-8s40-26 62-6 30 8 40-6" fill="none" stroke="#14532d" stroke-width="15" stroke-linecap="round"/>' +
    '<path d="M24 150c20-22 44 8 66-8s40-26 62-6 30 8 40-6" fill="none" stroke="#34d17a" stroke-width="10" stroke-linecap="round"/>' +
    '<ellipse cx="196" cy="128" rx="13" ry="10" fill="#34d17a" stroke="#14532d" stroke-width="3"/><circle cx="200" cy="125" r="2.4" fill="#14532d"/>' +
    '<path d="M208 131l9 2-9 2" fill="none" stroke="#e5484d" stroke-width="2" stroke-linecap="round"/></svg>';
  function screen() {
    if (shownEl && document.body.contains(shownEl)) return shownEl;
    var d = document.createElement('div'); d.id = 'snkUpdating'; d.setAttribute('translate', 'no'); d.setAttribute('data-noi18n', '');
    d.innerHTML = '<style>#snkUpdating{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(circle at 50% 35%,#1b6b3c,#06180d 70%);color:#eafff0;font-family:var(--snake-font,system-ui,sans-serif);text-align:center;transition:opacity .4s}' +
      '#snkUpdating .su-arrow{animation:suDown 1.2s ease-in-out infinite}@keyframes suDown{0%,100%{transform:translateY(-4px)}50%{transform:translateY(6px)}}' +
      '#snkUpdating h1{margin:0;font-size:1.6rem}#snkUpdating p{margin:0;opacity:.8;font-size:.9rem}' +
      '#snkUpdating .su-row{display:none;gap:10px;margin-top:6px}#snkUpdating .su-row.on{display:flex}' +
      '#snkUpdating .su-row button{all:unset;cursor:pointer;padding:8px 14px;border-radius:10px;font:600 14px/1.2 var(--snake-font,system-ui,sans-serif)}' +
      '#snkUpdating .su-now{background:#2fae5f;color:#04140a}#snkUpdating .su-later{border:1px solid rgba(234,255,240,.5);color:#eafff0}</style>' + SVG +
      '<h1>' + (en() ? 'Snake OS! is updating...' : 'Snake OS! se está actualizando...') + '</h1>' +
      '<p class="su-msg">' + (en() ? 'Getting the new version ready…' : 'Preparando la versión nueva…') + '</p>' +
      '<div class="su-row"><button type="button" class="su-now"></button><button type="button" class="su-later"></button></div>';
    d.querySelector('.su-now').textContent = en() ? 'Update now' : 'Actualizar ahora';
    d.querySelector('.su-later').textContent = en() ? 'Not now' : 'Ahora no';
    var B = 'cursor:pointer !important;padding:9px 16px !important;border-radius:10px !important;font:600 14px/1.2 Inter,system-ui,sans-serif !important;box-shadow:none !important;text-shadow:none !important;min-width:0 !important;width:auto !important;height:auto !important;';
    d.querySelector('.su-now').setAttribute('style', B + 'background:#2fae5f !important;color:#04140a !important;border:0 !important;');
    d.querySelector('.su-later').setAttribute('style', B + 'background:transparent !important;color:#eafff0 !important;border:1px solid rgba(234,255,240,.55) !important;');
    d.querySelector('.su-now').onclick = function () { reloadNow(); };
    d.querySelector('.su-later').onclick = function () { snooze(); };
    document.body.appendChild(d);
    shownEl = d;
    return d;
  }
  function msg(t) { var d = screen(); d.querySelector('.su-msg').textContent = t; }
  function hideScreen() {
    clearInterval(cdTimer);
    if (shownEl) { var d = shownEl; shownEl = null; d.style.opacity = '0'; setTimeout(function () { d.remove(); }, 400); }
  }
  function refreshCaches() {
    try { if (window.caches && caches.keys) caches.keys().then(function (ks) { ks.forEach(function (k) { if (k.indexOf('fonts') < 0) caches.delete(k); }); }); } catch (e) {}
    try { if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { try { r.update(); } catch (e) {} }); }); } catch (e) {}
  }
  function onOpen(v) {
    var seen = get(); put(v);
    if (!seen || seen === v) return; // primera visita o misma versión: nada
    screen(); refreshCaches();
    setTimeout(hideScreen, SHOW_MS);
  }
  function reloadNow() {
    if (applying) return; applying = true; clearInterval(cdTimer);
    if (pending) put(pending); // ya se ha visto la pantalla: al recargar no se repite la de 10,5 s
    var n = document.getElementById('snkUpdNotice'); if (n) n.remove();
    screen().querySelector('.su-row').classList.remove('on');
    msg(en() ? 'Installing the new version…' : 'Instalando la versión nueva…');
    refreshCaches();
    setTimeout(function () { try { location.reload(); } catch (e) { location.href = '/'; } }, 1500);
  }
  // Fin de la actualización (o versión nueva detectada): recargar ya, o cuenta atrás si hay sesión.
  function finish() {
    if (applying) return;
    if (!loggedIn()) { reloadNow(); return; }
    if (Date.now() < snoozeUntil) { notice(); return; }
    var d = screen(), left = COUNT_S;
    d.querySelector('.su-row').classList.add('on');
    function upd() { msg(en() ? 'Restarting in ' + left + ' s to load the new version.' : 'Se reiniciará en ' + left + ' s para cargar la versión nueva. Guarda lo que estés haciendo.'); }
    upd(); clearInterval(cdTimer);
    cdTimer = setInterval(function () { left--; if (left <= 0) { clearInterval(cdTimer); reloadNow(); } else upd(); }, 1000);
  }
  function snooze() { snoozeUntil = Date.now() + SNOOZE_MS; hideScreen(); notice(); }
  function notice() {
    if (document.getElementById('snkUpdNotice')) return;
    var host = document.createElement('div'); host.id = 'snkUpdNotice'; host.setAttribute('translate', 'no'); host.setAttribute('data-noi18n', '');
    host.style.cssText = 'all:initial;position:fixed;left:0;right:0;bottom:calc(72px + env(safe-area-inset-bottom,0px));z-index:2147482000;display:flex;justify-content:center;pointer-events:none';
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML = '<style>.t{pointer-events:auto;box-sizing:border-box;display:flex;align-items:center;gap:10px;max-width:min(520px,calc(100vw - 24px));margin:0 12px;padding:10px 10px 10px 14px;background:rgba(10,30,18,.97);color:#eafff0;border:1px solid #2fae5f;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.35);font:14px/1.35 Inter,system-ui,-apple-system,Segoe UI,sans-serif;text-align:left}' +
      '.m{flex:1 1 auto;min-width:0;white-space:normal;overflow-wrap:anywhere}' +
      '.u{flex:0 0 auto;padding:7px 12px;border:0;border-radius:9px;background:#2fae5f;color:#04140a;font:600 13px/1.2 Inter,system-ui,sans-serif;cursor:pointer;box-shadow:none}.u:hover{background:#3fcf74}' +
      '.x{flex:0 0 auto;width:26px;height:26px;padding:0;border:0;border-radius:8px;background:transparent;color:#eafff0;font:16px/26px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:none}.x:hover{background:rgba(255,255,255,.12)}</style>' +
      '<div class="t" role="status"><span class="m"></span><button class="u" type="button"></button><button class="x" type="button">✕</button></div>';
    root.querySelector('.m').textContent = en() ? '🐍 A Snake OS! update is ready.' : '🐍 Hay una actualización de Snake OS! lista para instalar.';
    var u = root.querySelector('.u'); u.textContent = en() ? 'Update now' : 'Actualizar ahora'; u.onclick = function () { reloadNow(); };
    var x = root.querySelector('.x'); x.title = en() ? 'Later' : 'Más tarde'; x.setAttribute('aria-label', x.title); x.onclick = function () { host.remove(); };
    document.body.appendChild(host);
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(check, (inDeploy || (pending && !applying)) ? FAST_MS : POLL_MS); }
  function check() {
    return fetch('/api/status?t=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) { if (inDeploy) msg(en() ? 'Restarting Snake OS…' : 'Reiniciando Snake OS…'); return null; }
      if (loaded === null && !j.updating && j.version) { loaded = j.version; onOpen(j.version); return j; }
      if (j.updating) { // empieza la update: pantalla en todas las pestañas abiertas
        if (!inDeploy) { inDeploy = true; clearInterval(cdTimer); var d = screen(); d.querySelector('.su-row').classList.remove('on'); d.style.opacity = '1';
          msg(en() ? 'Getting the new version ready… this page will reload by itself.' : 'Preparando la versión nueva… esta página se recargará sola.'); }
        return j;
      }
      if (j.version && loaded && j.version !== loaded) {
        if (pending !== j.version) { pending = j.version; inDeploy = false; finish(); }
        else if (!loggedIn() && !applying) reloadNow(); // al cerrar sesión se instala sola
      } else if (inDeploy) { inDeploy = false; pending = loaded; finish(); } // update sin cambios: recarga igual
      return j;
    }).catch(function () { if (inDeploy) msg(en() ? 'Restarting Snake OS…' : 'Reiniciando Snake OS…'); return null; })
      .then(function (j) { schedule(); return j; });
  }
  function wake() { if (!document.hidden) check(); }
  function start() {
    check();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
  }
  window.snakeUpdate = { check: check, apply: function () { reloadNow(); }, version: function () { return loaded; }, pending: function () { return pending; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
