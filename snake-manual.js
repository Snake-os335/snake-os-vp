/* Snake OS · Manual de instrucciones en PDF (2026-10-21).
   - El PDF (ES o EN, según el idioma de Snake OS) viaja en base64 dentro de /static/assets/snake-manual-es.pdf.js y
     snake-manual-en.pdf.js (la lista blanca de /static no sirve .pdf); aquí se descarga como archivo .pdf de verdad.
   - Al terminar la instalación de una cuenta NUEVA (finishOsInstall → window.snkManualNewAccount) se pregunta UNA vez,
     cuando no hay otra ventana delante (p. ej. la pregunta de Snake OS Kids): «¿Quieres descargar el manual…?» Sí / No.
     Solo se descarga si dices que sí; la respuesta se guarda por perfil y no se vuelve a preguntar.
   - Descarga en cualquier momento: Ajustes › Acerca de (snake-apps-extras.js), menú Inicio (ventana de Inicio y
     «Más opciones») y la pantalla de inicio de sesión.
   - Textos en español; el traductor de Snake OS los pasa a inglés (snake-i18n-dict.js).
   - El generador del PDF está en tools/manual/ (README.md). */
(function () {
  'use strict';
  if (window.snkManual) return;
  var VER = '202610212130';
  var FILES = { es: '/static/assets/snake-manual-es.pdf.js', en: '/static/assets/snake-manual-en.pdf.js' };
  var NAMES = { es: 'Manual-de-instrucciones-Snake-OS.pdf', en: 'Snake-OS-User-Manual.pdf' };
  var ASK = 'snkManualAsk:';
  var LOGO = '/static/assets/snake-os-logo-v2.svg?v=202610161925';

  function $(s) { return document.querySelector(s); }
  function lang() { try { return window.snakeI18n && window.snakeI18n.lang === 'en' ? 'en' : 'es'; } catch (e) { return 'es'; } }
  function cu() { try { return (typeof currentUser !== 'undefined' && currentUser) || window.currentUser || null; } catch (e) { return window.currentUser || null; } }
  function email() { var u = cu(); return u && u.email ? String(u.email).toLowerCase() : ''; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var css = document.createElement('style');
  css.id = 'snkManualCss';
  css.textContent = [
    '#snkManualAsk{position:fixed;inset:0;z-index:2147483400;display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;',
    'background:radial-gradient(1200px 600px at 50% -10%,rgba(52,209,122,.28),transparent 55%),radial-gradient(800px 500px at 100% 100%,rgba(20,80,50,.45),transparent 50%),rgba(4,14,10,.72);',
    'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}',
    '#snkManualAsk .snkman-card{width:min(460px,100%);text-align:center;color:#eef8f0;background:linear-gradient(165deg,rgba(18,42,28,.94),rgba(8,22,14,.97));',
    'border:1px solid rgba(124,252,154,.28);border-radius:28px;padding:30px 26px 24px;box-sizing:border-box;box-shadow:0 28px 80px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.12);',
    'font-family:var(--snake-font,Inter,system-ui,sans-serif);animation:snkManIn .45s cubic-bezier(.22,1,.36,1) both}',
    '@keyframes snkManIn{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}',
    '#snkManualAsk .snkman-mark{position:relative;width:96px;height:96px;margin:0 auto 14px;border-radius:24px;display:grid;place-items:center;background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.12);box-shadow:0 12px 32px rgba(0,0,0,.35)}',
    '#snkManualAsk .snkman-mark img{width:70px;height:70px;display:block}',
    '#snkManualAsk .snkman-mark span{position:absolute;right:-10px;bottom:-8px;padding:3px 8px;border-radius:999px;background:linear-gradient(135deg,#3adf87,#1f9e57);color:#062214;font:900 .72rem/1.2 var(--snake-font,Inter,system-ui,sans-serif);letter-spacing:.06em;box-shadow:0 4px 12px rgba(0,0,0,.35)}',
    '#snkManualAsk h2{margin:0 0 10px;font-size:1.35rem;line-height:1.25;font-weight:800;letter-spacing:-.01em;color:#f3fff6}',
    '#snkManualAsk p{margin:0 0 20px;font-size:.92rem;line-height:1.5;color:rgba(220,245,228,.85)}',
    '#snkManualAsk .snkman-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}',
    '#snkManualAsk button{margin:0;width:auto;min-width:130px;min-height:44px;padding:11px 22px;border-radius:999px;font:800 .95rem var(--snake-font,Inter,system-ui,sans-serif);cursor:pointer;box-shadow:none}',
    '#snkManualAsk button[data-no]{background:rgba(255,255,255,.08);color:#eafff1;border:1px solid rgba(157,255,194,.35)}',
    '#snkManualAsk button[data-yes]{background:linear-gradient(135deg,#3adf87,#1f9e57);color:#062214;border:none;box-shadow:0 10px 28px rgba(52,209,122,.32)}',
    '#snkManualAsk button:hover{filter:brightness(1.07)}',
    '#snkManualAsk .snkman-note{margin:14px 0 0;font-size:.74rem;opacity:.75}',
    '#snkManualToast{position:fixed;left:50%;bottom:84px;transform:translate(-50%,10px);z-index:2147483450;padding:9px 16px;border-radius:999px;background:rgba(10,20,14,.92);color:#eafff1;',
    'font:600 .82rem var(--snake-font,Inter,system-ui,sans-serif);border:1px solid rgba(157,255,194,.35);box-shadow:0 8px 24px rgba(0,0,0,.4);opacity:0;pointer-events:none;transition:opacity .2s,transform .25s;max-width:90vw;text-align:center}',
    '#snkManualToast.show{opacity:1;transform:translate(-50%,0)}',
    '#snkManualLoginBtn{display:flex;align-items:center;justify-content:center;gap:6px;margin:10px auto 0}',
    '#sm11 .sm11-manual{display:flex;align-items:center;gap:8px;width:100%;margin:2px 0 8px;padding:8px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);',
    'background:rgba(255,255,255,.08);color:inherit;font:700 .8rem var(--snake-font,Inter,system-ui,sans-serif);cursor:pointer;text-align:left;box-shadow:none;min-height:0}',
    '#sm11 .sm11-manual:hover{background:rgba(52,209,122,.25)}',
    'body.theme-light #sm11 .sm11-manual{background:rgba(255,255,255,.5);border-color:rgba(0,0,0,.1)}'
  ].join('');
  (document.head || document.documentElement).appendChild(css);

  function toast(msg, ms) {
    var el = document.getElementById('snkManualToast');
    if (!el) { el = document.createElement('div'); el.id = 'snkManualToast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, ms || 2600);
  }

  /* ---------- descarga ---------- */
  var cache = {}, busy = null;
  function load(l) {
    if (cache[l]) return Promise.resolve(cache[l]);
    return fetch(FILES[l] + '?v=' + VER, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (txt) {
      var a = txt.indexOf('="JVBER'), b = txt.lastIndexOf('"');
      if (a < 0 || b <= a + 2) throw new Error('datos');
      var bin = atob(txt.slice(a + 2, b));
      var n = bin.length, bytes = new Uint8Array(n);
      for (var i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
      cache[l] = new Blob([bytes], { type: 'application/pdf' });
      return cache[l];
    });
  }
  function save(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { try { a.remove(); URL.revokeObjectURL(url); } catch (e) {} }, 60000);
  }
  function download(l) {
    l = l === 'en' || l === 'es' ? l : lang();
    if (busy) return busy;
    toast('Preparando el manual…', 8000);
    busy = load(l).then(function (blob) {
      save(blob, NAMES[l]);
      toast('Manual descargado');
      return true;
    }).catch(function () {
      toast('No se pudo descargar el manual. Inténtalo otra vez.', 4000);
      return false;
    }).then(function (ok) { busy = null; return ok; });
    return busy;
  }

  /* ---------- pregunta al terminar la instalación (cuenta nueva, una sola vez) ---------- */
  function askKey() { var e = email(); return e ? ASK + e : ''; }
  function blocked() {
    var u = cu();
    if (!u || u.setupDone === false || u.tutorialDone === false) return true;
    if ($('#snkManualAsk') || $('.osx-modal') || $('#osxPinModal') || $('#osTutorial') || $('#snkSaver')) return true;
    var lock = document.getElementById('lock'); if (lock && !lock.classList.contains('hidden')) return true;
    var w = document.getElementById('osWelcome'); if (w && !w.classList.contains('hidden')) return true;
    var pl = document.getElementById('poweroffLoading'); if (pl && pl.getAttribute('aria-hidden') === 'false') return true;
    var ps = document.getElementById('poweroffScreen'); if (ps && !ps.classList.contains('hidden')) return true;
    var up = document.getElementById('snkUpdating'); if (up && up.offsetParent) return true;
    return false;
  }
  var calm = 0;
  function tick() {
    var k = askKey();
    if (!k || lsGet(k) !== 'pending') { calm = 0; return; }
    if (blocked()) { calm = 0; return; }
    calm += 1;
    if (calm < 3) return; /* nada delante durante tres vueltas seguidas (~3-4,5 s) */
    calm = 0;
    showAsk(k);
  }
  function showAsk(k) {
    if ($('#snkManualAsk')) return;
    var m = document.createElement('div');
    m.id = 'snkManualAsk';
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'snkManualAskT');
    m.innerHTML = '<div class="snkman-card">' +
      '<div class="snkman-mark" aria-hidden="true"><img src="' + LOGO + '" alt=""><span>PDF</span></div>' +
      '<h2 id="snkManualAskT">¿Quieres descargar el manual de instrucciones de Snake OS?</h2>' +
      '<p>Es un PDF para aprender a usar Snake OS: el escritorio, los ajustes y todas las apps, con capturas.</p>' +
      '<div class="snkman-row"><button type="button" data-no>No</button><button type="button" data-yes>Sí</button></div>' +
      '<p class="snkman-note">Podrás descargarlo cuando quieras en Ajustes › Acerca de, en el menú Inicio o en la pantalla de inicio de sesión.</p>' +
      '</div>';
    document.body.appendChild(m);
    function done(yes) {
      lsSet(k, yes ? 'yes' : 'no');
      if (m.parentNode) m.remove();
      if (yes) download();
    }
    m.querySelector('[data-no]').addEventListener('click', function () { done(false); });
    m.querySelector('[data-yes]').addEventListener('click', function () { done(true); });
    setTimeout(function () { try { m.querySelector('[data-yes]').focus(); } catch (e) {} }, 60);
  }
  /* index.html (finishOsInstall) lo llama una sola vez, cuando la cuenta nueva termina de instalar Snake OS */
  function newAccount() {
    var k = askKey();
    if (!k) return;
    var v = lsGet(k);
    if (v && v !== 'pending') return; /* ya contestó: nunca otra vez */
    lsSet(k, 'pending');
    calm = 0;
  }
  setInterval(tick, 1500);

  /* ---------- accesos: menú Inicio y pantalla de inicio de sesión ---------- */
  function iconLabel(tag, cls) {
    var b = document.createElement(tag);
    b.type = 'button';
    if (cls) b.className = cls;
    b.innerHTML = '<span aria-hidden="true">📘</span> <span>Manual de instrucciones</span>';
    b.title = 'Descargar el manual de instrucciones (PDF)';
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); closeMenus(); download(); });
    return b;
  }
  function closeMenus() {
    try { if (window.snkStart11 && window.snkStart11.isOpen()) window.snkStart11.close(); } catch (e) {}
    try { var sm = document.getElementById('startMenu'); if (sm) sm.classList.remove('open'); } catch (e2) {}
  }
  function ensureClassic() {
    var sm = document.getElementById('startMenu');
    if (!sm || sm.querySelector(':scope > .snk-manual-item')) return;
    var sep = sm.querySelector(':scope > .start-sep');
    if (!sep) return;
    var b = iconLabel('button', 'start-item snk-manual-item');
    sm.insertBefore(b, sep);
  }
  function ensureSm11() {
    var p = document.getElementById('sm11');
    if (!p || p.querySelector('.sm11-manual')) return;
    var foot = p.querySelector('.sm11-foot');
    if (!foot) return;
    p.insertBefore(iconLabel('button', 'sm11-manual'), foot);
  }
  function ensureLogin() {
    var f = document.getElementById('loginForm');
    if (!f || document.getElementById('snkManualLoginBtn')) return;
    var b = iconLabel('button', 'link-btn');
    b.id = 'snkManualLoginBtn';
    var after = document.getElementById('goToSignup');
    if (after && after.parentNode === f) f.insertBefore(b, after.nextSibling); else f.appendChild(b);
  }
  function watch() {
    ensureLogin();
    var sm = document.getElementById('startMenu');
    if (sm) { ensureClassic(); new MutationObserver(ensureClassic).observe(sm, { childList: true }); }
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var a = ms[i].addedNodes;
        for (var j = 0; j < a.length; j++) if (a[j].id === 'sm11') { ensureSm11(); return; }
      }
    }).observe(document.body, { childList: true });
    ensureSm11();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

  window.snkManual = { download: download, newAccount: newAccount, files: FILES };
  window.snkManualNewAccount = newAccount;
})();
