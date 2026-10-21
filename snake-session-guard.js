/* Snake OS · Aviso de sesión cerrada en otra pestaña (2026-10-21)
   Cada carga de «/» cierra la sesión de Snake OS de este navegador (regla existente: siempre se pide iniciar
   sesión otra vez). Si había otra pestaña de Snake OS con la sesión abierta, esa pestaña seguía en el escritorio
   pero todas sus apps recibían «No autenticado». Ahora la pestaña nueva lo anuncia (BroadcastChannel, solo
   dentro de este navegador) y las pestañas abiertas muestran un aviso claro con «Iniciar sesión otra vez».
   También responde a /pro para que la página sepa si Snake OS ya está abierto y no lo vuelva a abrir. */
(function () {
  'use strict';
  if (window.__snkSessGuard) return;
  window.__snkSessGuard = true;
  if (typeof BroadcastChannel !== 'function') return;
  var bc;
  try { bc = new BroadcastChannel('snakeos-session'); } catch (e) { return; }
  var me = Math.random().toString(36).slice(2) + Date.now().toString(36);
  function signedIn() {
    try { if (typeof currentUser !== 'undefined' && currentUser) return true; } catch (e) {}
    return !!window.currentUser;
  }
  function en() { return String(document.documentElement.lang || '').slice(0, 2) === 'en'; }
  function show() {
    if (document.getElementById('snkSessGone')) return;
    var o = document.createElement('div');
    o.id = 'snkSessGone'; o.setAttribute('data-noi18n', ''); o.setAttribute('role', 'alertdialog'); o.setAttribute('aria-modal', 'true');
    o.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(4,10,8,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font-family:system-ui,sans-serif;padding:16px';
    var t = en()
      ? ['Your session was closed', 'Snake OS VP was opened in another tab or window of this browser, so the session in this tab was closed for security. Sign in again to keep using your apps.', 'Sign in again']
      : ['Se ha cerrado tu sesión', 'Snake OS VP se ha abierto en otra pestaña o ventana de este navegador y, por seguridad, la sesión de esta pestaña se ha cerrado. Inicia sesión otra vez para seguir usando tus apps.', 'Iniciar sesión otra vez'];
    o.innerHTML = '<div style="max-width:420px;width:100%;background:#0f1a14;color:#fff;border:1px solid rgba(52,209,122,.45);border-radius:16px;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.5);text-align:left">' +
      '<div style="font-weight:800;font-size:1.1rem;margin:0 0 8px">🔒 ' + t[0] + '</div>' +
      '<div style="opacity:.85;line-height:1.45;font-size:.93rem;margin:0 0 16px">' + t[1] + '</div>' +
      '<button type="button" style="all:unset;box-sizing:border-box;cursor:pointer;display:block;width:100%;text-align:center;padding:11px 14px;border-radius:10px;background:#34d17a;color:#05160c;font-weight:800">' + t[2] + '</button></div>';
    o.querySelector('button').onclick = function () { location.reload(); };
    (document.body || document.documentElement).appendChild(o);
    try { o.querySelector('button').focus(); } catch (e) {}
  }
  bc.onmessage = function (e) {
    var d = (e && e.data) || {};
    if (!d || d.from === me) return;
    if (d.t === 'load') { if (signedIn()) show(); }
    else if (d.t === 'ping') { try { bc.postMessage({ t: 'here', from: me, to: d.from, signed: signedIn() }); } catch (e2) {} }
  };
  try { bc.postMessage({ t: 'load', from: me }); } catch (e) {}
  window.snkSessionGuard = { show: show };
})();
