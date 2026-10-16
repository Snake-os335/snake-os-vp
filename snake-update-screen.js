/* Snake OS · pantalla «se está actualizando».
   Pregunta a /api/status de vez en cuando; si updating=true muestra la pantalla completa
   y, cuando termina, recarga para cargar la versión nueva. */
(function () {
  var shown = false, timer = 0;
  function en() { try { return window.snakeI18n && window.snakeI18n.lang === 'en'; } catch (e) { return false; } }
  var SVG = '<svg viewBox="0 0 220 170" width="220" height="170" aria-hidden="true">' +
    '<g fill="#eafff0" stroke="#14532d" stroke-width="3"><path d="M60 70a28 28 0 0 1 52-14 24 24 0 0 1 44 10 20 20 0 0 1 4 40H62a22 22 0 0 1-2-36z"/></g>' +
    '<g class="su-arrow"><path d="M110 58v34" stroke="#2fae5f" stroke-width="7" stroke-linecap="round"/><path d="M96 80l14 14 14-14" fill="none" stroke="#2fae5f" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g>' +
    '<path d="M24 150c20-22 44 8 66-8s40-26 62-6 30 8 40-6" fill="none" stroke="#14532d" stroke-width="15" stroke-linecap="round"/>' +
    '<path d="M24 150c20-22 44 8 66-8s40-26 62-6 30 8 40-6" fill="none" stroke="#34d17a" stroke-width="10" stroke-linecap="round"/>' +
    '<ellipse cx="196" cy="128" rx="13" ry="10" fill="#34d17a" stroke="#14532d" stroke-width="3"/><circle cx="200" cy="125" r="2.4" fill="#14532d"/>' +
    '<path d="M208 131l9 2-9 2" fill="none" stroke="#e5484d" stroke-width="2" stroke-linecap="round"/></svg>';
  function show() {
    if (shown) return; shown = true;
    var d = document.createElement('div'); d.id = 'snkUpdating'; d.setAttribute('translate', 'no'); d.setAttribute('data-noi18n', '');
    d.innerHTML = '<style>#snkUpdating{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(circle at 50% 35%,#1b6b3c,#06180d 70%);color:#eafff0;font-family:system-ui,sans-serif;text-align:center}' +
      '#snkUpdating .su-arrow{animation:suDown 1.2s ease-in-out infinite}@keyframes suDown{0%,100%{transform:translateY(-4px)}50%{transform:translateY(6px)}}' +
      '#snkUpdating h1{margin:0;font-size:1.6rem}#snkUpdating p{margin:0;opacity:.8;font-size:.9rem}</style>' + SVG +
      '<h1>' + (en() ? 'Snake OS! is updating...' : 'Snake OS! se está actualizando...') + '</h1>' +
      '<p>' + (en() ? 'It will be back in a moment. This page reloads by itself.' : 'Vuelve en un momento. Esta página se recargará sola.') + '</p>';
    document.body.appendChild(d);
  }
  function check() {
    fetch('/api/status', { cache: 'no-store', credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.updating) show();
      else if (j && shown) { location.reload(); return; }
      schedule();
    }).catch(function () { schedule(); });
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(check, shown ? 4000 : (document.hidden ? 60000 : 20000)); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check); else check();
})();
