/* Snake OS VP Pro (oct 2026): funciones Pro, solo con Pro activo en el perfil (lo dice el servidor: /api/pro/status).
 * Todo es añadido: sin Pro este archivo no cambia nada de Snake OS (solo pinta el apartado de Ajustes).
 * Todo funciona en el navegador; sin servicios externos. Las preferencias Pro se guardan por perfil en el servidor.
 */
(function () {
  'use strict';
  var FEATS = window.SNK_PRO_FEATURES || [];
  var S = { email: '', active: false, since: 0, prefs: {}, loaded: false, loginAt: 0, pushT: null, ticks: [] };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cu() { return window.currentUser || null; }
  function api(p, o) { return window.api ? window.api(p, o) : Promise.reject(new Error('api')); }
  function toast(t) { try { if (typeof window.snkToast === 'function') return window.snkToast(t); } catch (e) {} var d = document.createElement('div'); d.className = 'snkp-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2600); }
  function phone() { return document.body.classList.contains('phone-mode'); }
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function lsKey() { return 'snkPro:' + S.email; }
  function EN() { return !!(window.snakeI18n && window.snakeI18n.lang === 'en'); }
  function T(es, en) { if (EN()) { (window.__SNK_EN_OUT = window.__SNK_EN_OUT || {})[en] = 1; return en; } return es; }
  /* 2026.14b: errores del servidor (en español) → inglés si Snake OS está en inglés */
  var SRV_EN = {"Página no válida": "Invalid page", "No has iniciado sesión": "You are not signed in", "Demasiados intentos. Espera unos minutos y vuelve a probar.": "Too many attempts. Wait a few minutes and try again.", "Correo o contraseña incorrectos": "Wrong email or password", "Se han creado muchas cuentas desde aquí. Vuelve a intentarlo más tarde.": "Many accounts have been created from here. Try again later.", "Correo no válido": "Invalid email", "No se pueden crear cuentas nuevas con Gmail. Usa otro correo, por ejemplo tu correo@dogaemail.com.": "New accounts cannot use Gmail. Use another email, for example your address@dogaemail.com.", "El nombre no puede estar vacío": "The name cannot be empty", "El nombre es demasiado largo (máx. 60 caracteres)": "The name is too long (max. 60 characters)", "La contraseña es demasiado larga": "The password is too long", "La contraseña debe tener al menos 4 caracteres": "The password must have at least 4 characters", "Ya existe una cuenta con ese correo": "An account with that email already exists", "Inicia sesión con tu cuenta Dogaemail para pedir el código.": "Sign in with your Dogaemail account to request the code.", "Tu cuenta ya tiene Snake OS VP Pro activado.": "Your account already has Snake OS VP Pro activated.", "Has pedido muchos códigos seguidos. Vuelve a intentarlo dentro de un rato.": "You have requested many codes in a row. Try again in a while.", "No se pudo generar el código": "The code could not be generated", "Este perfil ya tiene Snake OS VP Pro activado.": "This profile already has Snake OS VP Pro activated.", "Código no válido. Revisa que tenga la forma SNKPRO-XXXX-XXXX-XXXX.": "Invalid code. Check that it looks like SNKPRO-XXXX-XXXX-XXXX.", "Código no válido.": "Invalid code.", "Este código ya se ha usado.": "This code has already been used.", "Preferencias no válidas": "Invalid preferences", "Demasiados datos en las funciones Pro (máx. 48 KB)": "Too much data in the Pro features (max. 48 KB)", "Este perfil no tiene Snake OS VP Pro": "This profile does not have Snake OS VP Pro", "Demasiadas consultas. Espera un momento.": "Too many requests. Wait a moment.", "El servidor tarda demasiado. Vuelve a intentarlo.": "The server is taking too long. Try again.", "Sin conexión con el servidor. Vuelve a intentarlo.": "No connection to the server. Try again.", "Petición bloqueada: viene de otra web.": "Request blocked: it comes from another website.", "El envío es demasiado grande.": "The upload is too large.", "Demasiadas peticiones seguidas; espera un momento.": "Too many requests in a row; wait a moment.", "Error interno del servidor. Inténtalo de nuevo.": "Internal server error. Please try again."};
  function srvErr(m) {
    if (!m || !EN()) return m;
    if (SRV_EN[m]) return SRV_EN[m];
    var o = /^Este código es de la cuenta Dogaemail (.+)\. Entra en Snake OS VP con esa cuenta para activarlo\.$/.exec(m);
    return o ? 'This code belongs to the Dogaemail account ' + o[1] + '. Sign in to Snake OS VP with that account to activate it.' : m;
  }
  function P(k, d) { var v = S.prefs[k]; return v === undefined ? d : v; }
  function setPref(k, v) {
    if (!S.active) return;
    S.prefs[k] = v;
    var em = S.email, snap = JSON.stringify(S.prefs);
    try { localStorage.setItem(lsKey(), snap); } catch (e) {}
    clearTimeout(S.pushT);
    /* 2026.14: se envía la copia de ESTE perfil; si entretanto cambió el perfil (o se apagó Pro) no se envía nada,
       así nunca se pisan las notas/Kanban de otro perfil */
    S.pushT = setTimeout(function () {
      S.pushT = null;
      if (S.email !== em || !S.active) return;
      api('/api/pro/prefs', { method: 'PUT', body: { prefs: JSON.parse(snap) } }).catch(function (e) { if (e && e.status === 413) toast(T('Las funciones Pro tienen demasiados datos (máx. 48 KB)', 'Pro features have too much data (max. 48 KB)')); });
    }, 1200);
  }

  /* ---------------- estilos ---------------- */
  var GOLD = '#f5c542';
  function css() {
    if ($('#snkProCss')) return;
    var s = document.createElement('style'); s.id = 'snkProCss';
    s.textContent = [
      /* reinicio de los estilos globales de button/label/input de Snake OS, solo dentro de lo Pro (especificidad baja) */
      ':where(.snkp-w,#snkProCenter,.snkp-set) button{width:auto;margin-top:0;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none;font-size:inherit}',
      ':where(.snkp-w,#snkProCenter) label{display:flex;align-items:center;gap:5px;margin:0;font-size:inherit;font-weight:600;color:inherit}',
      ':where(.snkp-w,#snkProCenter) input:not([type=checkbox]):not([type=range]):not([type=color]),:where(.snkp-w,#snkProCenter) select,:where(.snkp-w) textarea{width:auto;border-radius:8px;padding:5px 7px;backdrop-filter:none;box-shadow:none;font-size:.8rem;min-height:0}',
      ':where(.snkp-w,#snkProCenter) input[type=checkbox]{width:16px;height:16px;padding:0;margin:0;box-shadow:none}',
      ':where(.snkp-w) input[type=range]{padding:0;box-shadow:none;width:auto}',
            '.snkp-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:2147483000;background:rgba(10,20,14,.92);color:#fff;padding:10px 16px;border-radius:12px;font:600 .85rem system-ui,sans-serif}',
      /* insignia */
      '.snkp-badge{display:inline-block;padding:1px 7px;border-radius:6px;font:800 .66rem/1.6 system-ui,sans-serif;letter-spacing:.06em;color:#2a1c00;background:linear-gradient(135deg,#ffe48a,#f5c542 55%,#c9931a)}',
      /* acentos */
      'html body.snkpro-acc-gold{--accent:#f5c542;--accent-strong:#c9931a}', 'html body.snkpro-acc-ruby{--accent:#ff4d6d;--accent-strong:#c9184a}',
      'html body.snkpro-acc-sapphire{--accent:#4c8dff;--accent-strong:#2557c9}', 'html body.snkpro-acc-amethyst{--accent:#b57cff;--accent-strong:#7e3fd1}',
      'html body.snkpro-acc-coral{--accent:#ff8a5c;--accent-strong:#e0582b}',
      /* ventanas y barra */
      'body.snkpro-win .app-window{border:1px solid rgba(245,197,66,.75)!important;box-shadow:0 18px 50px rgba(0,0,0,.45),0 0 0 1px rgba(245,197,66,.25),0 0 22px rgba(245,197,66,.18)!important}',
      'body.snkpro-win .app-window .win-titlebar{background:linear-gradient(180deg,rgba(255,228,138,.22),rgba(245,197,66,.06))!important;backdrop-filter:blur(14px) saturate(1.3);border-bottom:1px solid rgba(245,197,66,.35)!important}',
      'body.snkpro-tb #taskbar{background:linear-gradient(135deg,rgba(60,44,6,.62),rgba(20,16,4,.55))!important;border-color:rgba(245,197,66,.55)!important;box-shadow:0 10px 30px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,228,138,.35)!important}',
      'body.snkpro-tb #taskbar #clock,body.snkpro-tb #taskbar #userBadge,body.snkpro-tb #taskbar #startBtn,body.snkpro-tb #taskbar .tb-tool{color:#fff!important}',
      /* marcos */
      'body.snkpro-fr-gold #userBadge{border:2px solid ' + GOLD + '!important;box-shadow:0 0 10px rgba(245,197,66,.55)}',
      'body.snkpro-fr-neon #userBadge{border:2px solid #39ff9f!important;box-shadow:0 0 12px #39ff9f,inset 0 0 6px rgba(57,255,159,.5)}',
      'body.snkpro-fr-rainbow #userBadge{border:2px solid transparent!important;background:linear-gradient(rgba(20,20,20,.55),rgba(20,20,20,.55)) padding-box,linear-gradient(90deg,#ff4d6d,#ffb547,#f5e663,#4ade80,#4c8dff,#b57cff) border-box!important}',
      'body.snkpro-fr-scales #userBadge{border:2px dashed #34d17a!important;box-shadow:0 0 0 2px rgba(52,209,122,.25)}',
      /* fondo */
      '#snkProWall{position:absolute;inset:0;z-index:0;pointer-events:none;background-size:cover;background-position:center;display:none}',
      '#snkProWall.on{display:block}',
      '#snkProWall.aurora{background:linear-gradient(120deg,#06281a,#0b4d3a,#123a6b,#3b1a5c,#06281a);background-size:400% 400%;animation:snkpAur 18s ease-in-out infinite}',
      '@keyframes snkpAur{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}',
      '#snkProWall canvas{width:100%;height:100%;display:block}',
      /* widgets */
      '#snkProDesk{position:absolute;inset:0 0 76px 0;z-index:2;pointer-events:none}',
      /* modo teléfono: los widgets fijados van en una franja con scroll (antes se ocultaban) */
      'body.phone-mode #snkProDesk{position:absolute;left:0;right:0;top:auto;bottom:calc(84px + env(safe-area-inset-bottom,0px));inset-inline:0;max-height:38vh;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:10px;padding:8px 12px;box-sizing:border-box;pointer-events:auto}',
      'body.phone-mode #snkProDesk:empty{display:none}',
      'body.phone-mode #snkProDesk .snkp-w{position:relative!important;left:auto!important;top:auto!important;width:auto!important;height:auto!important;max-width:none;flex:0 0 auto}',
      'body.phone-mode #snkProDesk .snkp-w.free{resize:none;overflow:visible;max-height:none}',
      '.snkp-w{position:absolute;pointer-events:auto;min-width:150px;color:#fff;background:rgba(12,22,16,.72);backdrop-filter:blur(16px) saturate(1.3);border:1px solid rgba(245,197,66,.45);border-radius:16px;box-shadow:0 12px 30px rgba(0,0,0,.35);font:500 .82rem system-ui,sans-serif}',
      '.snkp-w.free{position:fixed;z-index:60;resize:both;overflow:auto;min-height:60px;max-width:calc(100vw - 8px);max-height:calc(100vh - 84px)}',
      '.snkp-w.pinned{position:absolute;overflow:hidden}', '.snkp-w.pinned .snkp-wh{cursor:default}',
      '.snkp-w.compact{transform:scale(.8);transform-origin:top left}', 'body.phone-mode #snkProDesk .snkp-w.compact{transform:none;font-size:.72rem}', '.snkp-w.mini{height:auto!important;resize:none;min-height:0}', '.snkp-w.mini .snkp-wb{display:none}',
      '.snkp-wh .sum{font:700 .74rem ui-monospace,monospace;opacity:.85;white-space:nowrap}', '.snkp-wh .sum:empty{display:none}',
      '.snkp-wh .wpin[aria-pressed="true"]{background:rgba(245,197,66,.55)}', '.snkp-wh button{flex:0 0 22px}',
      '#snkProPick{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:75;width:min(460px,calc(100vw - 20px));max-height:calc(100vh - 120px);overflow:auto;color:#fff;background:rgba(14,22,17,.94);backdrop-filter:blur(22px) saturate(1.4);border:1px solid rgba(245,197,66,.5);border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.5);padding:14px 16px;font:500 .82rem system-ui,sans-serif;box-sizing:border-box}',
      '#snkProPick .hd{display:flex;align-items:center;gap:8px;font-weight:800;font-size:1rem}', '#snkProPick .hd .x{margin-left:auto;flex:0 0 auto;width:auto;min-width:0;padding:4px 10px}', '#snkProPick .hd{white-space:nowrap}', '#snkProPick h3{margin:12px 0 6px;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;opacity:.7}',
      '.snkp-wh{display:flex;align-items:center;gap:6px;padding:7px 8px 6px 11px;cursor:grab;font-weight:800;font-size:.78rem;user-select:none;touch-action:none}',
      '.snkp-wh .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}', '.snkp-w.narrow .snkp-wh{gap:4px;padding-left:9px}', '.snkp-w.narrow:not(:hover):not(:focus-within) .snkp-wh .wmin,.snkp-w.narrow:not(:hover):not(:focus-within) .snkp-wh .wcmp{display:none}', '@media (hover:none){.snkp-w.narrow .snkp-wh .wcmp{display:none}}',
      '.snkp-wh button{border:0;background:rgba(255,255,255,.12);color:#fff;width:22px;height:22px;border-radius:7px;cursor:pointer;font-size:.75rem;line-height:1;padding:0;margin:0}',
      '.snkp-wb{padding:4px 11px 11px}',
      '.snkp-w input,.snkp-w select,.snkp-w textarea{font:inherit;color:#fff;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:5px 7px;margin:0;box-sizing:border-box}',
      '.snkp-btn{font:700 .76rem system-ui,sans-serif;border:1px solid rgba(245,197,66,.55);background:rgba(245,197,66,.16);color:#fff;border-radius:9px;padding:6px 10px;cursor:pointer;margin:0}',
      '.snkp-btn.pri{background:linear-gradient(135deg,#ffe48a,#f5c542);color:#2a1c00;border-color:transparent}',
      '.snkp-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}',
      /* centro pro */
      '#snkProBtn{font-size:1rem;flex:0 0 auto;margin-left:6px;width:auto!important;min-width:0;padding:0 8px!important;display:inline-flex;align-items:center;justify-content:center;gap:.3em;white-space:nowrap;line-height:1;overflow:visible;vertical-align:middle}', '#snkProBtn > span{flex:0 0 auto;line-height:1}', '#snkProBtn .snkp-badge{font-size:.6em;line-height:1;padding:.32em .55em;display:inline-flex;align-items:center;letter-spacing:.05em;white-space:nowrap}', 'body.tb11:not(.phone-mode) #taskbar > #snkProBtn{order:1}',
      '#snkProCenter{position:fixed;left:14px;bottom:86px;z-index:70;width:min(440px,calc(100vw - 20px));max-height:min(620px,calc(100vh - 110px));overflow:auto;color:#fff;background:rgba(14,22,17,.9);backdrop-filter:blur(22px) saturate(1.4);border:1px solid rgba(245,197,66,.5);border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.5);padding:14px 16px;font:500 .82rem system-ui,sans-serif}',
      '#snkProCenter h3{margin:12px 0 6px;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;opacity:.7}',
      '#snkProCenter .hd{display:flex;align-items:center;gap:8px;font-weight:800;font-size:1rem}',
      '#snkProCenter .hd button{margin-left:auto}',
      '.snkp-sw{display:flex;flex-wrap:wrap;gap:8px}',
      '.snkp-sw button{width:62px;height:44px;border-radius:10px;border:2px solid transparent;cursor:pointer;background-size:cover;background-position:center;padding:0;margin:0;position:relative}',
      '.snkp-sw button.on{border-color:' + GOLD + ';box-shadow:0 0 0 2px rgba(245,197,66,.35)}',
      '.snkp-sw button span{position:absolute;left:0;right:0;bottom:-15px;font-size:.6rem;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.snkp-sw.dots button{width:30px;height:30px;border-radius:50%}',
      '.snkp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(122px,1fr));gap:6px}',
      '.snkp-grid button{display:flex;align-items:center;gap:6px;text-align:left;font:700 .74rem system-ui,sans-serif;color:#fff;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px;cursor:pointer;margin:0}',
      '.snkp-grid button.on{border-color:' + GOLD + ';background:rgba(245,197,66,.16)}',
      '.snkp-tg{display:flex;align-items:center;justify-content:space-between;padding:6px 0}',
      '.snkp-tg input{width:18px;height:18px;accent-color:' + GOLD + '}',
      /* salvapantallas / intro */
      '#snkProSaver,#snkProIntro{position:fixed;inset:0;z-index:2147482000;background:#000;cursor:none}',
      '#snkProIntro{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;background:radial-gradient(circle at 50% 45%,#1d1704,#000 70%);color:#ffe48a;font:800 1.6rem system-ui,sans-serif;transition:opacity .5s;pointer-events:none}',
      '#snkProIntro path{stroke-dasharray:900;stroke-dashoffset:900;animation:snkpDraw 1.3s ease forwards}',
      '#snkProIntro .w{opacity:0;animation:snkpFade .6s .9s forwards}',
      '@keyframes snkpDraw{to{stroke-dashoffset:0}}@keyframes snkpFade{to{opacity:1}}',
      /* settings */
      '.snkp-set{display:flex;flex-direction:column;gap:8px}',
      '.snkp-set .card{padding:12px;border-radius:12px;background:var(--input-bg,rgba(255,255,255,.06));border:1px solid var(--input-border,rgba(255,255,255,.14))}',
      '.snkp-set .card.gold{border-color:rgba(245,197,66,.6);background:linear-gradient(135deg,rgba(245,197,66,.14),rgba(245,197,66,.03))}',
      '.snkp-set p{margin:4px 0;font-size:.78rem;line-height:1.45;opacity:.85}',
      '.snkp-set .msg{min-height:1.2em;font-size:.78rem;font-weight:700}.snkp-set .msg.err{color:#ff8a7a}.snkp-set .msg.ok{color:#4ade80}',
      '.snkp-set code{font-family:ui-monospace,monospace;letter-spacing:.08em}',
      '.snkp-fl{display:flex;flex-direction:column;gap:5px}',
      '.snkp-fl div{display:flex;gap:9px;align-items:flex-start;padding:7px 9px;border-radius:10px;background:var(--input-bg,rgba(255,255,255,.05))}',
      '.snkp-fl div.off{opacity:.6}.snkp-fl i{font-style:normal;flex:0 0 22px;text-align:center}.snkp-fl b{display:block;font-size:.8rem}.snkp-fl span{font-size:.72rem;opacity:.8}.snkp-fl em{margin-left:auto;font-style:normal}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------------- fondos ---------------- */
  function svgUrl(svg) { return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'; }
  var WALLS = {
    gold: { n: 'Oro negro', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><defs><radialGradient id="a" cx=".7" cy=".3" r=".9"><stop offset="0" stop-color="#3a2c06"/><stop offset=".6" stop-color="#0d0a02"/><stop offset="1" stop-color="#000"/></radialGradient><linearGradient id="b" x1="0" x2="1"><stop offset="0" stop-color="#ffe48a"/><stop offset=".5" stop-color="#f5c542"/><stop offset="1" stop-color="#8a5f08"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#a)"/><path d="M-50 760C250 560 420 900 720 700S1150 380 1650 520" fill="none" stroke="url(#b)" stroke-width="46" stroke-linecap="round" opacity=".9"/><path d="M-50 800C250 600 420 940 720 740S1150 420 1650 560" fill="none" stroke="#f5c542" stroke-width="3" opacity=".35"/><circle cx="1640" cy="520" r="34" fill="#f5c542"/></svg>' },
    scales: { n: 'Escamas esmeralda', svg: (function () { var p = ''; for (var y = 0; y < 11; y++) for (var x = 0; x < 17; x++) { var cx = x * 100 + (y % 2 ? 50 : 0), cy = y * 100; p += '<path d="M' + (cx - 50) + ' ' + cy + 'a50 50 0 0 0 100 0" fill="none" stroke="#34d17a" stroke-opacity="' + (0.15 + ((x * 7 + y * 3) % 10) / 30).toFixed(2) + '" stroke-width="4"/>'; } return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#03301c"/><stop offset="1" stop-color="#001208"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/>' + p + '</svg>'; })() },
    circuit: { n: 'Circuito serpiente', svg: (function () { var p = '', seed = 7; function r() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; } for (var i = 0; i < 40; i++) { var x = Math.round(r() * 16) * 100, y = Math.round(r() * 10) * 100, d = 'M' + x + ' ' + y; for (var k = 0; k < 4; k++) { if (r() > .5) x += (r() > .5 ? 1 : -1) * 100; else y += (r() > .5 ? 1 : -1) * 100; d += 'L' + x + ' ' + y; } p += '<path d="' + d + '" fill="none" stroke="#4ade80" stroke-opacity=".45" stroke-width="3"/><circle cx="' + x + '" cy="' + y + '" r="8" fill="#0b1a12" stroke="#4ade80" stroke-width="3"/>'; } return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="#07130d"/>' + p + '</svg>'; })() },
    midnight: { n: 'Medianoche', svg: (function () { var st = '', seed = 3; function r() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; } for (var i = 0; i < 160; i++) st += '<circle cx="' + (r() * 1600).toFixed(0) + '" cy="' + (r() * 650).toFixed(0) + '" r="' + (r() * 2 + .4).toFixed(1) + '" fill="#fff" opacity="' + (r() * .8 + .2).toFixed(2) + '"/>'; return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><defs><linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050a24"/><stop offset="1" stop-color="#10284a"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#n)"/>' + st + '<circle cx="1260" cy="210" r="70" fill="#fff6d0"/><circle cx="1290" cy="190" r="66" fill="#081236"/><path d="M0 1000V820C200 760 380 880 600 820S1000 700 1200 780 1500 760 1600 740V1000Z" fill="#04140c"/></svg>'; })() }
  };
  var DYN = [ // hora de inicio → colores
    [5, 'Amanecer', ['#ff9a8b', '#ffd3a5', '#6a82fb']], [9, 'Día', ['#7fd3ff', '#c9f0ff', '#34d17a']],
    [18, 'Atardecer', ['#ff7e5f', '#feb47b', '#5b247a']], [21, 'Noche', ['#0b1033', '#1d2b64', '#0b3d2b']]
  ];
  function dynPhase() { var h = new Date().getHours(), ph = DYN[3]; for (var i = 0; i < DYN.length; i++) if (h >= DYN[i][0]) ph = DYN[i]; if (h < 5) ph = DYN[3]; return ph; }
  function dynSvg() { var c = dynPhase()[2]; return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><defs><linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset=".65" stop-color="' + c[1] + '"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#d)"/><path d="M0 1000V760C260 690 520 830 800 760S1300 640 1600 720V1000Z" fill="' + c[2] + '" opacity=".85"/><path d="M0 1000V850C300 800 600 900 900 850S1400 780 1600 830V1000Z" fill="#05140c" opacity=".7"/></svg>'; }
  var neonRaf = 0;
  function stopNeon() { if (neonRaf) cancelAnimationFrame(neonRaf); neonRaf = 0; }
  function applyWall() {
    var dk = $('#desktop'); if (!dk) return;
    var el = $('#snkProWall');
    var w = S.active ? P('wall', '') : '';
    if (!w) { if (el) { el.className = ''; el.innerHTML = ''; el.style.backgroundImage = ''; } stopNeon(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'snkProWall'; el.setAttribute('aria-hidden', 'true'); dk.insertBefore(el, dk.firstChild); }
    if (el.dataset.w === w && el.classList.contains('on') && w !== 'dyn') return;
    el.dataset.w = w; stopNeon(); el.innerHTML = ''; el.style.backgroundImage = ''; el.className = 'on';
    if (WALLS[w]) el.style.backgroundImage = svgUrl(WALLS[w].svg);
    else if (w === 'dyn') { el.style.backgroundImage = svgUrl(dynSvg()); el.dataset.ph = dynPhase()[1]; }
    else if (w === 'aurora') el.classList.add('aurora');
    else if (w === 'neon') neon(el);
  }
  function neon(el) {
    var cv = document.createElement('canvas'); el.appendChild(cv); el.style.background = '#030a06';
    var c = cv.getContext('2d'), t = 0, last = 0;
    function fr(ts) {
      if (!cv.isConnected) return; neonRaf = requestAnimationFrame(fr);
      if (ts - last < 33) return; last = ts; // ~30 fps, barato
      var W = cv.width = el.clientWidth, H = cv.height = el.clientHeight; t += reduced() ? 0 : 0.02;
      c.fillStyle = '#030a06'; c.fillRect(0, 0, W, H);
      for (var k = 0; k < 3; k++) {
        c.beginPath();
        for (var x = 0; x <= W; x += 12) { var y = H * (0.35 + k * 0.18) + Math.sin(x / 140 + t * (1 + k * 0.4) + k) * H * 0.08; if (x) c.lineTo(x, y); else c.moveTo(x, y); }
        c.strokeStyle = ['#39ff9f', '#f5c542', '#4c8dff'][k]; c.lineWidth = 6; c.shadowColor = c.strokeStyle; c.shadowBlur = 24; c.globalAlpha = .75; c.stroke();
      }
      c.globalAlpha = 1; c.shadowBlur = 0;
    }
    neonRaf = requestAnimationFrame(fr);
  }

  /* ---------------- clases del body ---------------- */
  var LBL_EN = {"Oro": "Gold", "Rubí": "Ruby", "Zafiro": "Sapphire", "Amatista": "Amethyst", "Coral": "Coral", "Neón": "Neon", "Arcoíris": "Rainbow", "Escamas": "Scales", "◰ Arriba izq.": "◰ Top left", "◳ Arriba der.": "◳ Top right", "◱ Abajo izq.": "◱ Bottom left", "◲ Abajo der.": "◲ Bottom right", "▌ Dos tercios": "▌ Two thirds", "▐ Un tercio": "▐ One third", "▦ Mosaico": "▦ Tile", "Sin fondo Pro": "No Pro wallpaper", "Aurora (animado)": "Aurora (animated)", "Neón (animado)": "Neon (animated)", "Según la hora": "By time of day", "Circuito serpiente": "Snake circuit", "Escamas esmeralda": "Emerald scales", "Medianoche": "Midnight", "Océano": "Ocean", "Oro negro": "Black gold", "Ámbar retro": "Retro amber", "Matrix": "Matrix"};
  function L_(x) { return EN() ? (LBL_EN[x] || x) : x; }
  var ACC = { gold: ['Oro', '#f5c542'], ruby: ['Rubí', '#ff4d6d'], sapphire: ['Zafiro', '#4c8dff'], amethyst: ['Amatista', '#b57cff'], coral: ['Coral', '#ff8a5c'] };
  var FRAMES = { gold: 'Oro', neon: 'Neón', rainbow: 'Arcoíris', scales: 'Escamas' };
  function applyBody() {
    var b = document.body, on = S.active;
    b.classList.toggle('snk-pro', on);
    Object.keys(ACC).forEach(function (k) { b.classList.toggle('snkpro-acc-' + k, on && P('acc', '') === k); });
    Object.keys(FRAMES).forEach(function (k) { b.classList.toggle('snkpro-fr-' + k, on && P('frame', '') === k); });
    b.classList.toggle('snkpro-win', on && !!P('win', false));
    b.classList.toggle('snkpro-tb', on && !!P('tb', false));
  }

  /* ---------------- widgets: 📌 fijados (capa del escritorio, detrás de las ventanas, no se arrastran) o libres
     (flotan encima, se arrastran y redimensionan con imán a la rejilla y a los bordes). Todo se guarda por perfil
     en el servidor (prefs: open, pos, size, pin, min, cmp). En modo teléfono, los fijados van en una franja con scroll. */
  var W = {}; // id -> { el, tick, off, sum }
  var DEFS = {};
  var GRID = 16, EDGE = 20, TB = 76;
  function deskLayer() {
    var dk = $('#desktop'); if (!dk) return null;
    var l = $('#snkProDesk');
    if (!l) { l = document.createElement('div'); l.id = 'snkProDesk'; var ic = $('#iconLayer'); if (ic && ic.nextSibling) dk.insertBefore(l, ic.nextSibling); else dk.appendChild(l); }
    return l;
  }
  function prefObj(k) { var o = P(k, {}); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; }
  function setKey(k, id, v) { var o = Object.assign({}, prefObj(k)); if (v === undefined || v === null) delete o[id]; else o[id] = v; setPref(k, o); }
  function defOf(id) { return DEFS[id] || (String(id).indexOf('st_') === 0 ? DEFS.sticky_note : null); }
  function isPinned(id) { var p = prefObj('pin'); if (Object.prototype.hasOwnProperty.call(p, id)) return !!p[id]; var d = defOf(id); return !!(d && !d.tool); }
  function snapXY(el, x, y) {
    var w = el.offsetWidth || 200, h = el.offsetHeight || 120, maxX = innerWidth - w, maxY = innerHeight - TB - h;
    x = Math.round(x / GRID) * GRID; y = Math.round(y / GRID) * GRID;
    if (x < EDGE) x = 8; if (y < EDGE) y = 8;
    if (maxX - x < EDGE) x = maxX - 8; if (maxY - y < EDGE) y = maxY - 8;
    return [Math.max(0, Math.round(x)), Math.max(0, Math.round(y))];
  }
  function defaultXY(el, d) {
    var x, y, ww = el.offsetWidth || d.w || 220;
    if (d.tool) { var nt = Object.keys(W).filter(function (k) { return W[k].el.classList.contains('free'); }).length; return [Math.max(10, Math.round(innerWidth / 2 - ww / 2) + nt * 28), 70 + nt * 28]; }
    var col = Object.keys(W).filter(function (k) { return W[k].el.classList.contains('pinned'); }).map(function (k) { return W[k].el; });
    var right = innerWidth - 24;
    y = 16;
    for (var guard = 0; guard < 4; guard++) {
      var inCol = col.filter(function (e) { return Math.abs(e.offsetLeft + e.offsetWidth - right) < 4; });
      var bottom = inCol.reduce(function (m, e) { return Math.max(m, e.offsetTop + e.offsetHeight); }, 0);
      if (!inCol.length || bottom + 160 < innerHeight - 90) { y = inCol.length ? bottom + 10 : 16; break; }
      right -= 270;
    }
    x = Math.max(10, right - ww);
    return [x, y];
  }
  function openW(id, save) {
    var d = defOf(id);
    if (!S.active || !d || W[id]) { if (W[id]) bump(W[id].el); return; }
    var pinned = isPinned(id), host = pinned ? deskLayer() : document.body; if (!host) return;
    var el = document.createElement('div'); el.className = 'snkp-w ' + (pinned ? 'pinned' : 'free') + (d.tool ? ' tool' : ''); el.dataset.w = id;
    var sz = prefObj('size')[id];
    el.style.width = (Array.isArray(sz) && sz[0] ? sz[0] : (d.w || 220)) + 'px';
    if (Array.isArray(sz) && sz[1]) el.style.height = sz[1] + 'px';
    if (prefObj('cmp')[id]) el.classList.add('compact');
    if (prefObj('min')[id]) el.classList.add('mini');
    el.innerHTML = '<div class="snkp-wh"><span class="t">' + esc(typeof d.title === 'function' ? d.title(id) : d.title) + '</span><span class="sum" data-noi18n></span>' +
      '<button type="button" class="wpin" aria-pressed="' + pinned + '" title="' + esc(pinned ? T('Desfijar (se podrá mover y cambiar de tamaño)', 'Unpin (it can be moved and resized)') : T('Fijar en el escritorio (detrás de las ventanas, sin moverse)', 'Pin to the desktop (behind windows, fixed in place)')) + '">📌</button>' +
      '<button type="button" class="wmin" title="' + esc(el.classList.contains('mini') ? T('Mostrar', 'Show') : T('Minimizar', 'Minimise')) + '">' + (el.classList.contains('mini') ? '▢' : '▁') + '</button>' +
      '<button type="button" class="wcmp" title="' + esc(el.classList.contains('compact') ? T('Tamaño grande', 'Large size') : T('Tamaño compacto', 'Compact size')) + '">⤢</button>' +
      '<button type="button" class="x" title="' + esc(T('Quitar del escritorio', 'Remove from the desktop')) + '">✕</button></div><div class="snkp-wb"></div>';
    if ((parseInt(el.style.width, 10) || 220) < 250) el.classList.add('narrow');
    host.appendChild(el);
    var pos = prefObj('pos')[id], xy = Array.isArray(pos) ? [pos[0], pos[1]] : defaultXY(el, d);
    el.style.left = Math.max(0, Math.min(innerWidth - 80, xy[0])) + 'px'; el.style.top = Math.max(0, Math.min(innerHeight - 60, xy[1])) + 'px';
    var rec = { el: el, tick: null, off: null, sum: null };
    W[id] = rec;
    if (!pinned) { drag(el, el.querySelector('.snkp-wh'), id); resizable(el, id); el.addEventListener('pointerdown', function () { bump(el); }); }
    el.querySelector('.wpin').onclick = function () { setKey('pin', id, !pinned); setKey('pos', id, [el.offsetLeft, el.offsetTop]); closeW(id, false); openW(id, false); toast(!pinned ? T('📌 Widget fijado en el escritorio', '📌 Widget pinned to the desktop') : T('Widget libre: arrástralo o cambia su tamaño', 'Free widget: drag it or resize it')); };
    el.querySelector('.wmin').onclick = function () { var on = !el.classList.contains('mini'); el.classList.toggle('mini', on); setKey('min', id, on ? true : undefined); this.textContent = on ? '▢' : '▁'; this.title = on ? T('Mostrar', 'Show') : T('Minimizar', 'Minimise'); paintSum(rec); };
    el.querySelector('.wcmp').onclick = function () { var on = !el.classList.contains('compact'); el.classList.toggle('compact', on); setKey('cmp', id, on ? true : undefined); this.title = on ? T('Tamaño grande', 'Large size') : T('Tamaño compacto', 'Compact size'); };
    el.querySelector('.x').onclick = function () { if (d.onClose && d.onClose(id) === false) return; closeW(id, true); };
    try { rec.off = d.render(el.querySelector('.snkp-wb'), rec, id) || null; } catch (e) { console.warn('snkPro widget', id, e); }
    paintSum(rec);
    if (!pinned) bump(el);
    if (save !== false) setKey('open', id, true);
    if (phone()) phoneLayout();
  }
  /* teléfono: todos los widgets van a la franja con scroll (sin arrastrar); al volver al escritorio, cada uno a su sitio */
  function phoneLayout() {
    var l = $('#snkProDesk'), on = phone();
    Object.keys(W).forEach(function (id) {
      var el = W[id].el; if (!el.classList.contains('free')) return;
      if (on && el.parentNode !== l && deskLayer()) deskLayer().appendChild(el);
      else if (!on && el.parentNode !== document.body) document.body.appendChild(el);
    });
    l = $('#snkProDesk'); if (!l) return;
    if (on) { var tb = $('#taskbar'), r = tb ? tb.getBoundingClientRect() : null; l.style.bottom = (r && r.height ? Math.max(84, Math.round(innerHeight - r.top + 8)) : 150) + 'px'; }
    else l.style.bottom = '';
  }
  window.addEventListener('resize', function () { setTimeout(phoneLayout, 120); });
  try { new MutationObserver(function () { phoneLayout(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}
  function paintSum(r) { var s = r.el.querySelector('.sum'); if (!s) return; s.textContent = r.el.classList.contains('mini') && r.sum ? String(r.sum() || '') : ''; }
  var toolZ = 60;
  function bump(el) { if (el.classList.contains('free')) el.style.zIndex = String(++toolZ); }
  function closeW(id, save) {
    var r = W[id]; if (!r) return;
    try { if (r.off) r.off(); } catch (e) {}
    try { if (r.ro) r.ro.disconnect(); } catch (e) {}
    try { if (r.offResize) r.offResize(); } catch (e) {}
    r.el.remove(); delete W[id];
    if (save) setKey('open', id, undefined);
  }
  function closeAll() { Object.keys(W).forEach(function (id) { closeW(id, false); }); }
  function drag(el, bar, id) {
    var st = null;
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button') || phone()) return;
      st = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop };
      try { bar.setPointerCapture(e.pointerId); } catch (x) {}
      e.preventDefault();
    });
    bar.addEventListener('pointermove', function (e) {
      if (!st) return;
      el.style.left = Math.max(0, Math.min(innerWidth - 60, st.l + e.clientX - st.x)) + 'px';
      el.style.top = Math.max(0, Math.min(innerHeight - 40, st.t + e.clientY - st.y)) + 'px';
    });
    function end() { if (!st) return; st = null; var p = snapXY(el, el.offsetLeft, el.offsetTop); el.style.left = p[0] + 'px'; el.style.top = p[1] + 'px'; setKey('pos', id, p); }
    bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
  }
  /* 2026.14: el tamaño solo se guarda al soltar la esquina de redimensionar (antes un ResizeObserver fijaba la altura
     cada vez que cambiaba el contenido y mandaba un PUT) */
  function resizable(el, id) {
    var st = null;
    el.addEventListener('pointerdown', function (e) {
      if (phone() || el.classList.contains('mini') || e.target !== el) return;
      var r = el.getBoundingClientRect();
      if (e.clientX < r.right - 22 || e.clientY < r.bottom - 22) return;
      st = { w: el.offsetWidth, h: el.offsetHeight };
    });
    function up() {
      if (!st) return; var was = st; st = null;
      setTimeout(function () {
        if (!el.isConnected || (el.offsetWidth === was.w && el.offsetHeight === was.h)) return;
        var w = Math.max(150, Math.round(el.offsetWidth / GRID) * GRID), h = Math.max(80, Math.round(el.offsetHeight / GRID) * GRID);
        el.style.width = w + 'px'; el.style.height = h + 'px'; setKey('size', id, [w, h]);
      }, 30);
    }
    window.addEventListener('pointerup', up, true);
    if (W[id]) W[id].offResize = function () { window.removeEventListener('pointerup', up, true); };
  }
  /* «Añadir widget»: desde el menú del botón derecho del escritorio y desde el Centro Pro */
  var PICK = [['aclock', '🕰️', T('Reloj analógico', 'Analogue clock')], ['world', '🌍', T('Reloj mundial', 'World clock')], ['month', '📅', T('Calendario', 'Calendar')], ['monitor', '📈', 'Monitor'], ['kanban', '🗂️', 'Kanban'], ['focus', '🎯', T('Foco (Pomodoro)', 'Focus (Pomodoro)')], ['timers', '⏳', T('Temporizadores', 'Timers')], ['recorder', '🎥', T('Grabar pantalla', 'Screen recorder')], ['passgen', '🔑', T('Contraseñas', 'Passwords')], ['sketch', '✏️', T('Dibujo', 'Sketch')], ['textpack', '🐍', T('Pack de texto', 'Text pack')]];
  function picker() {
    if (!S.active) return;
    var old = $('#snkProPick'); if (old) old.remove();
    var c = $('#snkProCenter'); if (c) c.remove();
    var el = document.createElement('div'); el.id = 'snkProPick'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', T('Añadir widget', 'Add widget'));
    document.body.appendChild(el);
    function paint() {
      var hidden = notes().filter(function (n) { return !W[n.id]; });
      el.innerHTML = '<div class="hd">🧩 ' + T('Añadir widget', 'Add widget') + ' <span class="snkp-badge">PRO</span><button type="button" class="snkp-btn x">✕</button></div>' +
        '<p style="margin:2px 0 10px;opacity:.8;font-size:.75rem">📌 ' + T('Los widgets fijados se quedan en el escritorio, detrás de las ventanas. Los libres se arrastran y cambian de tamaño (se ajustan a la rejilla y a los bordes).', 'Pinned widgets stay on the desktop, behind the windows. Free ones can be dragged and resized (they snap to the grid and the edges).') + '</p>' +
        '<div class="snkp-grid">' + PICK.map(function (x) { return '<button type="button" data-add="' + x[0] + '" class="' + (W[x[0]] ? 'on' : '') + '"><span>' + x[1] + '</span><span>' + esc(x[2]) + (W[x[0]] ? ' ✓' : '') + '</span></button>'; }).join('') +
        '<button type="button" data-note="1"><span>🗒️</span><span>' + T('Nota nueva', 'New note') + '</span></button></div>' +
        (hidden.length ? '<h3>' + T('Notas guardadas', 'Saved notes') + '</h3><div class="snkp-grid">' + hidden.map(function (n) { return '<button type="button" data-show="' + esc(n.id) + '"><span>🗒️</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc((n.t || T('Nota vacía', 'Empty note')).slice(0, 24)) + '</span></button>'; }).join('') + '</div>' : '');
      el.querySelector('.x').onclick = function () { el.remove(); };
      el.querySelectorAll('[data-add]').forEach(function (b) { b.onclick = function () { var id = b.dataset.add; if (W[id]) closeW(id, true); else openW(id); paint(); }; });
      el.querySelector('[data-note]').onclick = function () { newNote(); paint(); };
      el.querySelectorAll('[data-show]').forEach(function (b) { b.onclick = function () { openW(b.dataset.show); paint(); }; });
    }
    paint();
  }
  document.addEventListener('pointerdown', function (e) { var c = $('#snkProPick'); if (c && !c.contains(e.target)) c.remove(); }, true);
  setInterval(function () { Object.keys(W).forEach(function (k) { var r = W[k]; if (r && r.tick) try { r.tick(); } catch (e) {} if (r) paintSum(r); }); }, 1000);
  function two(n) { return (n < 10 ? '0' : '') + n; }

  /* Reloj analógico */
  DEFS.aclock = { title: function () { return T('🕰️ Reloj Pro', '🕰️ Pro clock'); }, w: 200, render: function (b, r) {
    b.innerHTML = '<canvas width="316" height="316" style="width:158px;height:158px;display:block;margin:0 auto"></canvas><div class="d" style="text-align:center;font-weight:700;margin-top:4px"></div>';
    var cv = b.querySelector('canvas'), c = cv.getContext('2d'), dd = b.querySelector('.d');
    function draw() {
      var d = new Date(), R = 150; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 316, 316); c.translate(158, 158);
      c.beginPath(); c.arc(0, 0, R, 0, 7); c.fillStyle = 'rgba(0,0,0,.35)'; c.fill(); c.lineWidth = 6; c.strokeStyle = GOLD; c.stroke();
      for (var i = 0; i < 60; i++) { var a = i * Math.PI / 30, big = i % 5 === 0; c.beginPath(); c.moveTo(Math.sin(a) * (R - (big ? 22 : 12)), -Math.cos(a) * (R - (big ? 22 : 12))); c.lineTo(Math.sin(a) * (R - 6), -Math.cos(a) * (R - 6)); c.lineWidth = big ? 5 : 2; c.strokeStyle = big ? '#ffe48a' : 'rgba(255,255,255,.4)'; c.stroke(); }
      function hand(a, len, w, col) { c.beginPath(); c.moveTo(-Math.sin(a) * 14, Math.cos(a) * 14); c.lineTo(Math.sin(a) * len, -Math.cos(a) * len); c.lineWidth = w; c.lineCap = 'round'; c.strokeStyle = col; c.stroke(); }
      var s = d.getSeconds(), m = d.getMinutes() + s / 60, h = d.getHours() % 12 + m / 60;
      hand(h * Math.PI / 6, 78, 10, '#fff'); hand(m * Math.PI / 30, 112, 7, '#fff'); hand(s * Math.PI / 30, 124, 3, '#4ade80');
      c.beginPath(); c.arc(0, 0, 8, 0, 7); c.fillStyle = GOLD; c.fill();
      dd.textContent = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    draw(); r.tick = draw; r.sum = function () { var d = new Date(); return two(d.getHours()) + ':' + two(d.getMinutes()); };
  } };

  /* Reloj mundial */
  var ZONES = [['Europe/Madrid', 'Madrid'], ['Europe/London', 'Londres'], ['America/New_York', 'Nueva York'], ['America/Mexico_City', 'Ciudad de México'], ['America/Bogota', 'Bogotá'], ['America/Buenos_Aires', 'Buenos Aires'], ['America/Los_Angeles', 'Los Ángeles'], ['Asia/Tokyo', 'Tokio'], ['Asia/Shanghai', 'Pekín'], ['Asia/Dubai', 'Dubái'], ['Asia/Kolkata', 'Bombay'], ['Australia/Sydney', 'Sídney'], ['Atlantic/Canary', 'Canarias'], ['Pacific/Auckland', 'Auckland']];
  DEFS.world = { title: function () { return T('🌍 Reloj mundial', '🌍 World clock'); }, w: 250, render: function (b, r) {
    function zs() { var z = P('world', null); return Array.isArray(z) && z.length ? z.slice(0, 4) : ['Europe/Madrid', 'America/New_York', 'Asia/Tokyo']; }
    function paint() {
      var list = zs();
      b.innerHTML = list.map(function (z, i) { var nm = (ZONES.filter(function (x) { return x[0] === z; })[0] || [z, z])[1]; return '<div class="snkp-row" style="justify-content:space-between;padding:4px 0"><span>' + esc(nm) + ' <button type="button" class="snkp-btn" data-rm="' + i + '" style="padding:0 6px">−</button></span><b class="tz" data-z="' + esc(z) + '" style="font-size:1.05rem"></b></div>'; }).join('') +
        (list.length < 4 ? '<div class="snkp-row" style="margin-top:6px"><select>' + ZONES.filter(function (z) { return list.indexOf(z[0]) < 0; }).map(function (z) { return '<option value="' + z[0] + '">' + esc(z[1]) + '</option>'; }).join('') + '</select><button type="button" class="snkp-btn add">Añadir</button></div>' : '');
      b.querySelectorAll('[data-rm]').forEach(function (x) { x.onclick = function () { var l = zs(); l.splice(+x.dataset.rm, 1); setPref('world', l.length ? l : ['Europe/Madrid']); paint(); }; });
      var ad = b.querySelector('.add'); if (ad) ad.onclick = function () { var l = zs(); l.push(b.querySelector('select').value); setPref('world', l); paint(); };
      tick();
    }
    function tick() { b.querySelectorAll('.tz').forEach(function (e) { try { e.textContent = new Date().toLocaleTimeString('es-ES', { timeZone: e.dataset.z, hour: '2-digit', minute: '2-digit' }); } catch (x) { e.textContent = '—'; } }); }
    paint(); r.tick = tick; r.sum = function () { var z = zs()[0]; try { return new Date().toLocaleTimeString('es-ES', { timeZone: z, hour: '2-digit', minute: '2-digit' }) + ' ' + ((ZONES.filter(function (x) { return x[0] === z; })[0] || [z, ''])[1]).slice(0, 10); } catch (e) { return ''; } };
  } };

  /* Calendario mensual */
  var HOL = { '01-01': 'Año Nuevo', '01-06': 'Reyes', '05-01': 'Día del Trabajo', '08-15': 'Asunción', '10-12': 'Fiesta Nacional', '11-01': 'Todos los Santos', '12-06': 'Constitución', '12-08': 'Inmaculada', '12-25': 'Navidad' };
  var MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  DEFS.month = { title: function () { return T('📅 Calendario Pro', '📅 Pro calendar'); }, w: 250, render: function (b, r) {
    r.sum = function () { var t = new Date(); return t.getDate() + ' ' + MES[t.getMonth()].slice(0, 3); };
    var now = new Date(), y = now.getFullYear(), m = now.getMonth();
    function paint() {
      var first = new Date(y, m, 1), start = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), t = new Date();
      var h = '<div class="snkp-row" style="justify-content:space-between;margin-bottom:6px"><button type="button" class="snkp-btn p">‹</button><b style="text-transform:capitalize">' + MES[m] + ' ' + y + '</b><button type="button" class="snkp-btn n">›</button></div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;font-size:.72rem">';
      ['L', 'M', 'X', 'J', 'V', 'S', 'D'].forEach(function (d) { h += '<b style="opacity:.6">' + d + '</b>'; });
      for (var i = 0; i < start; i++) h += '<span></span>';
      for (var d = 1; d <= days; d++) {
        var k = two(m + 1) + '-' + two(d), hol = HOL[k], today = d === t.getDate() && m === t.getMonth() && y === t.getFullYear(), we = (start + d - 1) % 7 >= 5;
        h += '<span title="' + esc(hol || '') + '" style="padding:4px 0;border-radius:7px;' + (today ? 'background:' + GOLD + ';color:#2a1c00;font-weight:800;' : hol ? 'color:#ff8a7a;font-weight:800;' : we ? 'opacity:.7;' : '') + '">' + d + '</span>';
      }
      b.innerHTML = h + '</div>';
      b.querySelector('.p').onclick = function () { m--; if (m < 0) { m = 11; y--; } paint(); };
      b.querySelector('.n').onclick = function () { m++; if (m > 11) { m = 0; y++; } paint(); };
    }
    paint();
  } };

  /* Kanban */
  DEFS.kanban = { title: function () { return T('🗂️ Kanban Pro', '🗂️ Pro Kanban'); }, w: 460, tool: true, render: function (b) {
    var COLS = [['todo', 'Por hacer'], ['doing', 'En curso'], ['done', 'Hecho']];
    function data() { var k = P('kanban', null); k = k && typeof k === 'object' ? k : {}; COLS.forEach(function (c) { if (!Array.isArray(k[c[0]])) k[c[0]] = []; }); return k; }
    function paint() {
      var k = data();
      b.innerHTML = '<div class="snkp-row" style="margin-bottom:8px"><input class="nt" maxlength="120" placeholder="Nueva tarea…" style="flex:1"><button type="button" class="snkp-btn pri add">Añadir</button></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">' +
        COLS.map(function (c, ci) { return '<div style="background:rgba(255,255,255,.06);border-radius:10px;padding:6px;min-height:90px"><b style="font-size:.72rem;opacity:.75">' + c[1] + ' · ' + k[c[0]].length + '</b>' + k[c[0]].map(function (t, i) { return '<div style="margin-top:5px;padding:6px;border-radius:8px;background:rgba(0,0,0,.3);display:flex;gap:4px;align-items:flex-start"><span style="flex:1;word-break:break-word' + (ci === 2 ? ';text-decoration:line-through;opacity:.7' : '') + '">' + esc(t) + '</span>' + (ci > 0 ? '<button type="button" class="snkp-btn" data-mv="' + ci + ':' + i + ':-1" style="padding:0 5px">‹</button>' : '') + (ci < 2 ? '<button type="button" class="snkp-btn" data-mv="' + ci + ':' + i + ':1" style="padding:0 5px">›</button>' : '') + '<button type="button" class="snkp-btn" data-del="' + ci + ':' + i + '" style="padding:0 5px">✕</button></div>'; }).join('') + '</div>'; }).join('') + '</div>';
      var inp = b.querySelector('.nt');
      function add() { var v = inp.value.trim(); if (!v) return; var kk = data(); kk.todo.push(v.slice(0, 120)); if (kk.todo.length + kk.doing.length + kk.done.length > 200) { toast('Máximo 200 tareas'); return; } setPref('kanban', kk); paint(); b.querySelector('.nt').focus(); }
      b.querySelector('.add').onclick = add; inp.onkeydown = function (e) { if (e.key === 'Enter') add(); };
      b.querySelectorAll('[data-mv]').forEach(function (x) { x.onclick = function () { var p = x.dataset.mv.split(':').map(Number), kk = data(), from = COLS[p[0]][0], to = COLS[p[0] + p[2]][0]; var it = kk[from].splice(p[1], 1)[0]; kk[to].push(it); setPref('kanban', kk); paint(); }; });
      b.querySelectorAll('[data-del]').forEach(function (x) { x.onclick = function () { var p = x.dataset.del.split(':').map(Number), kk = data(); kk[COLS[p[0]][0]].splice(p[1], 1); setPref('kanban', kk); paint(); }; });
    }
    paint();
  } };

  /* Notas adhesivas: cada nota es un widget st_<n> */
  var NOTE_C = ['#fff3a3', '#ffc9de', '#c8f7d4', '#cfe3ff', '#ffd9b0'];
  function notes() { var a = P('sticky', null); return Array.isArray(a) ? a : []; }
  function newNote() { var a = notes().slice(); if (a.length >= 12) { toast('Máximo 12 notas'); return; } var id = 'st_' + Date.now().toString(36); a.push({ id: id, c: a.length % NOTE_C.length, t: '' }); setPref('sticky', a); openW(id); }
  DEFS.sticky_note = { title: '🗒️ Nota', w: 200, render: function (b, r, id) {
    var n = notes().filter(function (x) { return x.id === id; })[0]; if (!n) { setTimeout(function () { closeW(id, true); }, 0); return; }
    var el = r.el; el.style.background = NOTE_C[n.c % NOTE_C.length]; el.style.color = '#2b2b2b'; el.style.borderColor = 'rgba(0,0,0,.15)';
    el.querySelector('.snkp-wh').style.color = '#2b2b2b';
    el.querySelectorAll('.snkp-wh button').forEach(function (x) { x.style.background = 'rgba(0,0,0,.12)'; x.style.color = '#2b2b2b'; });
    b.innerHTML = '<textarea maxlength="1000" style="width:100%;height:120px;resize:vertical;background:transparent;border:0;color:#2b2b2b;outline:none" placeholder="Escribe aquí…"></textarea><div class="snkp-row">' + NOTE_C.map(function (c, i) { return '<button type="button" data-c="' + i + '" title="Color" style="width:16px;height:16px;border-radius:50%;border:1px solid rgba(0,0,0,.25);background:' + c + ';padding:0;margin:0;cursor:pointer"></button>'; }).join('') + '<button type="button" class="del" title="Borrar la nota" style="margin-left:auto;border:0;background:rgba(0,0,0,.1);border-radius:7px;padding:1px 6px;cursor:pointer;color:#2b2b2b;width:auto">🗑</button></div>';
    b.querySelector('.del').onclick = function () { var nn = notes().filter(function (x) { return x.id === id; })[0]; if (nn && nn.t && !confirm('¿Borrar esta nota?')) return; setPref('sticky', notes().filter(function (x) { return x.id !== id; })); ['pos', 'size', 'pin', 'min', 'cmp'].forEach(function (k) { setKey(k, id, undefined); }); closeW(id, true); };
    r.sum = function () { var nn = notes().filter(function (x) { return x.id === id; })[0]; return nn && nn.t ? nn.t.slice(0, 18) : ''; };
    var ta = b.querySelector('textarea'); ta.value = n.t || '';
    var t = null;
    ta.oninput = function () { clearTimeout(t); t = setTimeout(function () { var a = notes().map(function (x) { return x.id === id ? Object.assign({}, x, { t: ta.value.slice(0, 1000) }) : x; }); setPref('sticky', a); }, 400); };
    b.querySelectorAll('[data-c]').forEach(function (x) { x.onclick = function () { var a = notes().map(function (y) { return y.id === id ? Object.assign({}, y, { c: +x.dataset.c }) : y; }); setPref('sticky', a); el.style.background = NOTE_C[+x.dataset.c]; }; });
  } }; /* ✕ solo la quita del escritorio (sigue guardada en «Añadir widget»); 🗑 la borra */

  /* Monitor */
  DEFS.monitor = { title: function () { return T('📈 Monitor Pro', '📈 Pro monitor'); }, w: 230, render: function (b, r) {
    b.innerHTML = '<div class="m" style="display:grid;grid-template-columns:auto 1fr;gap:3px 10px"></div><canvas width="400" height="80" style="width:100%;height:40px;margin-top:6px"></canvas>';
    var frames = 0, fps = 0, hist = [], raf = 0, last = performance.now(), bat = null, t0 = S.loginAt || Date.now();
    function loop(ts) { frames++; if (ts - last >= 1000) { fps = Math.round(frames * 1000 / (ts - last)); frames = 0; last = ts; } raf = requestAnimationFrame(loop); }
    raf = requestAnimationFrame(loop);
    try { if (navigator.getBattery) navigator.getBattery().then(function (x) { bat = x; }); } catch (e) {}
    function tick() {
      var mem = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB' : 'n/d';
      r.sum = function () { return fps + ' FPS · ' + mem; };
      var cn = navigator.connection, net = navigator.onLine ? (cn && cn.effectiveType ? cn.effectiveType.toUpperCase() + (cn.downlink ? ' · ' + cn.downlink + ' Mb/s' : '') : 'En línea') : 'Sin conexión';
      var secs = Math.floor((Date.now() - t0) / 1000);
      var rows = [['FPS', fps], ['Memoria JS', mem], ['Batería', bat ? Math.round(bat.level * 100) + ' %' + (bat.charging ? ' ⚡' : '') : 'n/d'], ['Red', net], ['Ventanas', document.querySelectorAll('#windows .app-window').length], ['Núcleos', navigator.hardwareConcurrency || 'n/d'], ['Sesión', Math.floor(secs / 3600) + ' h ' + two(Math.floor(secs % 3600 / 60)) + ' min']];
      b.querySelector('.m').innerHTML = rows.map(function (x) { return '<span style="opacity:.7">' + x[0] + '</span><b style="text-align:right">' + esc(x[1]) + '</b>'; }).join('');
      hist.push(fps); if (hist.length > 40) hist.shift();
      var cv = b.querySelector('canvas'), c = cv.getContext('2d'); c.clearRect(0, 0, 400, 80); c.beginPath();
      hist.forEach(function (v, i) { var x = i * 400 / 39, y = 80 - Math.min(80, v / 75 * 80); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
      c.strokeStyle = GOLD; c.lineWidth = 3; c.stroke();
    }
    tick(); r.tick = tick;
    return function () { cancelAnimationFrame(raf); };
  } };

  /* Foco (Pomodoro con descanso largo) */
  var FOCUS = { phase: 'work', left: 25 * 60, run: false, n: 0, end: 0 };
  /* 2026.14: Foco y temporizadores siguen al recargar (se guardan en este navegador, por perfil) y van por la hora
     real (end = Date.now() + …), así no se retrasan con la pestaña en segundo plano */
  var TIMERS = [];
  function clockKey() { return 'snkProClocks:' + S.email; }
  function saveClocks() { if (!S.email) return; try { localStorage.setItem(clockKey(), JSON.stringify({ f: FOCUS, t: TIMERS, at: Date.now() })); } catch (e) {} }
  function loadClocks() {
    FOCUS = { phase: 'work', left: 25 * 60, run: false, n: 0, end: 0 }; TIMERS = [];
    if (!S.email) return;
    try {
      var d = JSON.parse(localStorage.getItem(clockKey()) || 'null'); if (!d) return;
      if (d.f && typeof d.f.left === 'number' && /^(work|short|long)$/.test(d.f.phase)) FOCUS = { phase: d.f.phase, left: Math.max(0, d.f.left | 0), run: !!d.f.run, n: d.f.n | 0, end: +d.f.end || 0 };
      if (Array.isArray(d.t)) TIMERS = d.t.slice(0, 8).filter(function (t) { return t && typeof t.total === 'number'; }).map(function (t) { return { name: String(t.name || '').slice(0, 30), total: +t.total || 0, left: +t.left || 0, end: +t.end || 0, run: !!t.run, done: !!t.done }; });
      if (FOCUS.run && !FOCUS.end) FOCUS.run = false;
    } catch (e) {}
  }
  function beep() { try { var a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.value = 0.06; o.connect(g); g.connect(a.destination); o.start(); setTimeout(function () { o.stop(); a.close(); }, 350); } catch (e) {} }
  window.addEventListener('pagehide', function () { if (S.active) saveClocks(); });
  function dayKey() { var d = new Date(); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); }
  DEFS.focus = { title: function () { return T('🎯 Foco Pro', '🎯 Pro Focus'); }, w: 240, tool: true, render: function (b, r) {
    var LEN = { work: 25 * 60, short: 5 * 60, long: 15 * 60 }, NAME = { work: T('Foco', 'Focus'), short: T('Descanso', 'Break'), long: T('Descanso largo', 'Long break') };
    b.innerHTML = '<div style="text-align:center"><div class="ph" style="font-weight:800;opacity:.8"></div><div class="tm" style="font:800 2.4rem ui-monospace,monospace;margin:4px 0"></div><div style="height:6px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden"><i class="bar" style="display:block;height:100%;background:' + GOLD + ';width:0"></i></div>' +
      '<div class="snkp-row" style="justify-content:center;margin-top:8px"><button type="button" class="snkp-btn pri go"></button><button type="button" class="snkp-btn sk">' + T('Saltar', 'Skip') + '</button><button type="button" class="snkp-btn rs">' + T('Reiniciar', 'Reset') + '</button></div><div class="st" style="margin-top:8px;font-size:.75rem;opacity:.8"></div></div>';
    function stats() { var f = P('focus', {}); return f && f.d === dayKey() ? f.n || 0 : 0; }
    function next() {
      if (FOCUS.phase === 'work') { var n = stats() + 1; setPref('focus', { d: dayKey(), n: n }); FOCUS.n++; FOCUS.phase = FOCUS.n % 4 === 0 ? 'long' : 'short'; toast(T('🎯 ¡Pomodoro completado! Toca descansar', '🎯 Pomodoro complete! Time for a break')); }
      else { FOCUS.phase = 'work'; toast(T('🎯 Vuelta al foco', '🎯 Back to focus')); }
      FOCUS.left = LEN[FOCUS.phase]; if (FOCUS.run) FOCUS.end = Date.now() + FOCUS.left * 1000; beep(); saveClocks();
    }
    function paint() {
      b.querySelector('.ph').textContent = NAME[FOCUS.phase] + ' · ' + T('ciclo', 'cycle') + ' ' + (FOCUS.n % 4 + 1) + '/4';
      b.querySelector('.tm').textContent = two(Math.floor(FOCUS.left / 60)) + ':' + two(FOCUS.left % 60);
      b.querySelector('.bar').style.width = (100 - FOCUS.left / LEN[FOCUS.phase] * 100).toFixed(1) + '%';
      b.querySelector('.go').textContent = FOCUS.run ? '⏸ Pausa' : '▶ Empezar';
      b.querySelector('.st').textContent = 'Pomodoros de hoy: ' + stats();
    }
    b.querySelector('.go').onclick = function () { if (FOCUS.run) { FOCUS.left = Math.max(0, Math.ceil((FOCUS.end - Date.now()) / 1000)); FOCUS.run = false; } else { FOCUS.run = true; FOCUS.end = Date.now() + FOCUS.left * 1000; } saveClocks(); paint(); };
    b.querySelector('.sk').onclick = function () { FOCUS.left = 0; FOCUS.end = Date.now(); next(); paint(); };
    b.querySelector('.rs').onclick = function () { FOCUS = { phase: 'work', left: LEN.work, run: false, n: 0, end: 0 }; saveClocks(); paint(); };
    r.tick = function () {
      if (FOCUS.run) {
        FOCUS.left = Math.max(0, Math.ceil((FOCUS.end - Date.now()) / 1000));
        var guard = 0; while (FOCUS.run && FOCUS.left <= 0 && guard++ < 8) { var over = Date.now() - FOCUS.end; next(); FOCUS.end -= Math.max(0, over); FOCUS.left = Math.max(0, Math.ceil((FOCUS.end - Date.now()) / 1000)); }
      }
      paint();
    };
    r.sum = function () { return (FOCUS.run ? '▶ ' : '⏸ ') + two(Math.floor(FOCUS.left / 60)) + ':' + two(FOCUS.left % 60); };
    paint();
  } };

  /* Temporizadores múltiples (2026.14: siguen al recargar) */
  setInterval(function () { if (!S.active) return; var now = Date.now(), ch = false; TIMERS.forEach(function (t) { if (t.run && !t.done && now >= t.end) { t.done = true; t.run = false; ch = true; beep(); toast('⏳ ' + t.name + T(': ¡tiempo!', ': time’s up!')); } }); if (ch) saveClocks(); }, 500);
  DEFS.timers = { title: function () { return T('⏳ Temporizadores Pro', '⏳ Pro timers'); }, w: 290, tool: true, render: function (b, r) {
    b.innerHTML = '<div class="snkp-row" style="margin-bottom:6px"><input class="nm" maxlength="30" placeholder="Nombre" style="flex:1;min-width:0"><input class="mn" type="number" min="0" max="999" value="5" style="width:56px" title="Minutos"><span>min</span><button type="button" class="snkp-btn pri add">＋</button></div><div class="ls"></div>';
    function fmt(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return (s >= 3600 ? Math.floor(s / 3600) + ':' : '') + two(Math.floor(s % 3600 / 60)) + ':' + two(s % 60); }
    var ls = b.querySelector('.ls'), shape = '';
    ls.addEventListener('click', function (ev) {
      var x = ev.target.closest('button'); if (!x || !ls.contains(x)) return;
      if (x.dataset.p != null) { var t = TIMERS[+x.dataset.p]; if (!t) return; if (t.done) { t.done = false; t.left = t.total; } if (t.run) { t.left = t.end - Date.now(); t.run = false; } else { t.end = Date.now() + t.left; t.run = true; } saveClocks(); paint(true); }
      else if (x.dataset.d != null) { TIMERS.splice(+x.dataset.d, 1); saveClocks(); paint(true); }
    });
    function paint(force) {
      var now = Date.now();
      var sh = TIMERS.map(function (t) { return t.name + '|' + t.run + '|' + t.done; }).join('/') + '#' + (EN() ? 'en' : 'es');
      if (!force && sh === shape) {
        ls.querySelectorAll('[data-tm]').forEach(function (el) { var t = TIMERS[+el.dataset.tm]; if (t) el.textContent = t.done ? T('¡Ya!', 'Done!') : fmt(t.run ? t.end - now : t.left); });
        return;
      }
      shape = sh;
      ls.innerHTML = TIMERS.length ? TIMERS.map(function (t, i) { var left = t.run ? t.end - now : t.left; return '<div class="snkp-row" style="justify-content:space-between;padding:5px 0;border-top:1px solid rgba(255,255,255,.1)"><span style="flex:1;overflow:hidden;text-overflow:ellipsis">' + esc(t.name) + '</span><b data-tm="' + i + '" data-noi18n style="font:800 1rem ui-monospace,monospace' + (t.done ? ';color:#ff8a7a' : '') + '">' + (t.done ? T('¡Ya!', 'Done!') : fmt(left)) + '</b><button type="button" class="snkp-btn" data-p="' + i + '">' + (t.run ? '⏸' : '▶') + '</button><button type="button" class="snkp-btn" data-d="' + i + '">✕</button></div>'; }).join('') : '<div style="opacity:.6">' + T('Sin temporizadores', 'No timers') + '</div>';
    }
    b.querySelector('.add').onclick = function () { var m = Math.max(0, Math.min(999, parseFloat(b.querySelector('.mn').value) || 0)); if (!m) return; if (TIMERS.length >= 8) { toast(T('Máximo 8 temporizadores', 'Maximum 8 timers')); return; } var ms = Math.round(m * 60000); TIMERS.push({ name: b.querySelector('.nm').value.trim() || (T('Temporizador ', 'Timer ') + (TIMERS.length + 1)), total: ms, left: ms, end: Date.now() + ms, run: true, done: false }); b.querySelector('.nm').value = ''; saveClocks(); paint(true); };
    r.tick = function () { paint(false); }; paint(true);
    r.sum = function () { var now = Date.now(), run = TIMERS.filter(function (t) { return t.run && !t.done; }).sort(function (a, b) { return a.end - b.end; }); return run.length ? '⏳ ' + fmt(run[0].end - now) + (run.length > 1 ? ' +' + (run.length - 1) : '') : (TIMERS.some(function (t) { return t.done; }) ? T('¡Ya!', 'Done!') : ''); };
  } };

  /* Grabador de pantalla (todo en el navegador) */
  var REC = null;
  DEFS.recorder = { title: function () { return T('🎥 Grabador Pro', '🎥 Pro recorder'); }, w: 250, tool: true, render: function (b, r) {
    function paint() {
      if (REC) { var s = Math.floor((Date.now() - REC.t0) / 1000); b.innerHTML = '<div style="text-align:center"><div class="rt" data-noi18n style="font:800 1.6rem ui-monospace,monospace;color:#ff6b6b">● ' + two(Math.floor(s / 60)) + ':' + two(s % 60) + '</div><button type="button" class="snkp-btn pri stop" style="margin-top:6px">⏹ ' + T('Parar y guardar', 'Stop and save') + '</button></div>'; b.querySelector('.stop').onclick = stop; }
      else b.innerHTML = '<p style="margin:0 0 8px;opacity:.8;font-size:.75rem">' + T('Elige pantalla, ventana o pestaña. El vídeo (WebM) se guarda en tu equipo; no se sube a ningún sitio.', 'Choose a screen, window or tab. The video (WebM) is saved on your device; it is never uploaded.') + '</p><label class="snkp-row" style="margin-bottom:8px"><input type="checkbox" class="au"> ' + T('Con sonido de la pestaña', 'With tab audio') + '</label><button type="button" class="snkp-btn pri go">● ' + T('Grabar', 'Record') + '</button><div class="er" style="color:#ff8a7a;margin-top:6px;font-size:.75rem"></div>';
      var go = b.querySelector('.go'); if (go) go.onclick = start;
    }
    function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || !window.MediaRecorder) { b.querySelector('.er').textContent = T('Este navegador no permite grabar la pantalla.', 'This browser cannot record the screen.'); return; }
      var au = !!b.querySelector('.au').checked;
      navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: au }).then(function (stream) {
        var mt = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0] || '';
        var mr = new MediaRecorder(stream, mt ? { mimeType: mt } : {}), chunks = [];
        mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        mr.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          var blob = new Blob(chunks, { type: 'video/webm' }), d = new Date();
          var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'snake-os-grabacion-' + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '-' + two(d.getHours()) + two(d.getMinutes()) + '.webm';
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
          toast(T('🎥 Grabación guardada (', '🎥 Recording saved (') + (blob.size / 1048576).toFixed(1) + ' MB)'); REC = null; window.__snkProLastRec = blob.size; if (W.recorder) paint();
        };
        stream.getVideoTracks()[0].addEventListener('ended', function () { if (REC && REC.mr.state !== 'inactive') REC.mr.stop(); });
        mr.start(1000); REC = { mr: mr, t0: Date.now(), stream: stream, em: S.email }; paint();
      }).catch(function (e) { var er = b.querySelector('.er'); if (er) er.textContent = e && e.name === 'NotAllowedError' ? 'Grabación cancelada.' : 'No se ha podido grabar.'; });
    }
    function stop() { if (REC && REC.mr.state !== 'inactive') REC.mr.stop(); }
    r.tick = function () { if (!REC) return; var rt = b.querySelector('.rt'); if (!rt) { paint(); return; } var s = Math.floor((Date.now() - REC.t0) / 1000); rt.textContent = '● ' + two(Math.floor(s / 60)) + ':' + two(s % 60); };
    paint();
    /* 2026.14: al cerrar sesión, cambiar de perfil o dejar Pro, la grabación se corta (sin guardar) y se sueltan cámara/pantalla.
       Fijar/desfijar el widget en el mismo perfil no la corta. */
    return function off() {
      if (!REC || (S.active && S.email === REC.em)) return;
      var R = REC; REC = null;
      try { R.mr.ondataavailable = null; R.mr.onstop = null; if (R.mr.state !== 'inactive') R.mr.stop(); } catch (e) {}
      try { R.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    };
  }, onClose: function () { if (REC) { toast('Para la grabación antes de cerrar'); return false; } } };

  /* Generador de contraseñas */
  DEFS.passgen = { title: function () { return T('🔑 Contraseñas Pro', '🔑 Pro passwords'); }, w: 300, tool: true, render: function (b) {
    b.innerHTML = '<input class="out" readonly data-noi18n translate="no" style="width:100%;font:700 .95rem ui-monospace,monospace;margin-bottom:8px"><div class="snkp-row"><span>Longitud</span><input class="ln" type="range" min="8" max="64" value="20" style="flex:1"><b class="lv">20</b></div>' +
      '<div class="snkp-row" style="margin:6px 0"><label><input type="checkbox" class="sy" checked> Símbolos</label><label><input type="checkbox" class="nu" checked> Números</label><label><input type="checkbox" class="am" checked> Sin ambiguos</label></div><div class="snkp-row"><button type="button" class="snkp-btn pri gen">Generar</button><button type="button" class="snkp-btn cp">Copiar</button><span class="en" style="font-size:.72rem;opacity:.75"></span></div>';
    function gen() {
      var L = 'abcdefghijkmnopqrstuvwxyz', U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', N = '23456789', Y = '!@#$%&*?-_=+.';
      if (!b.querySelector('.am').checked) { L += 'l'; U += 'IO'; N += '01'; }
      var set = L + U + (b.querySelector('.nu').checked ? N : '') + (b.querySelector('.sy').checked ? Y : ''), n = +b.querySelector('.ln').value, out = '', buf = new Uint32Array(n);
      crypto.getRandomValues(buf);
      for (var i = 0; i < n; i++) out += set[buf[i] % set.length];
      b.querySelector('.out').value = out; b.querySelector('.lv').textContent = n;
      b.querySelector('.en').textContent = '≈ ' + Math.round(n * Math.log2(set.length)) + ' bits';
    }
    b.querySelector('.gen').onclick = gen; b.querySelector('.ln').oninput = gen;
    ['.sy', '.nu', '.am'].forEach(function (s) { b.querySelector(s).onchange = gen; });
    b.querySelector('.cp').onclick = function () { copy(b.querySelector('.out').value, 'Contraseña copiada'); };
    gen();
  } };
  function copy(t, msg) { (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast(msg || 'Copiado'); }, function () { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(msg || 'Copiado'); } catch (e) {} ta.remove(); }); }

  /* Bloc de dibujo */
  DEFS.sketch = { title: function () { return T('✏️ Dibujo Pro', '✏️ Pro sketch'); }, w: 380, tool: true, render: function (b) {
    b.innerHTML = '<canvas width="712" height="440" style="width:356px;height:220px;background:#fff;border-radius:10px;touch-action:none;cursor:crosshair;display:block"></canvas><div class="snkp-row" style="margin-top:6px"><input type="color" class="co" value="#16a34a" style="width:34px;height:28px;padding:0"><input type="range" class="sz" min="1" max="30" value="4" style="width:90px"><button type="button" class="snkp-btn er">Goma</button><button type="button" class="snkp-btn cl">Borrar</button><button type="button" class="snkp-btn pri dl">⬇ PNG</button></div>';
    var cv = b.querySelector('canvas'), c = cv.getContext('2d'), down = false, eraser = false, lx = 0, ly = 0;
    c.fillStyle = '#fff'; c.fillRect(0, 0, 712, 440); c.lineCap = 'round'; c.lineJoin = 'round';
    function pt(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 712 / r.width, (e.clientY - r.top) * 440 / r.height]; }
    cv.addEventListener('pointerdown', function (e) { down = true; var p = pt(e); lx = p[0]; ly = p[1]; try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
    cv.addEventListener('pointermove', function (e) { if (!down) return; var p = pt(e); c.strokeStyle = eraser ? '#fff' : b.querySelector('.co').value; c.lineWidth = +b.querySelector('.sz').value * 2; c.beginPath(); c.moveTo(lx, ly); c.lineTo(p[0], p[1]); c.stroke(); lx = p[0]; ly = p[1]; });
    ['pointerup', 'pointercancel'].forEach(function (ev) { cv.addEventListener(ev, function () { down = false; }); });
    b.querySelector('.er').onclick = function () { eraser = !eraser; this.classList.toggle('pri', eraser); };
    b.querySelector('.cl').onclick = function () { c.fillStyle = '#fff'; c.fillRect(0, 0, 712, 440); };
    b.querySelector('.dl').onclick = function () { var a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = 'snake-os-dibujo.png'; document.body.appendChild(a); a.click(); a.remove(); };
  } };

  /* Pack de texto */
  var TEXTS = ['🐍', '(◕‿◕)🐍', '~~~~~~~~=o<', '__/~~\\__/~~\\__o<', '(｡♥‿♥｡)', '( •_•)>⌐■-■', '(⌐■_■)', '¯\\_(ツ)_/¯', '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', 'ʕ•ᴥ•ʔ', '(╯°□°)╯︵ ┻━┻', '┬─┬ノ( º _ ºノ)', '(づ｡◕‿‿◕｡)づ', '(☞ﾟヮﾟ)☞', '✧･ﾟ: *✧･ﾟ:*', 'ᕦ(ò_óˇ)ᕤ', '(¬‿¬)', '(ಥ﹏ಥ)', '٩(◕‿◕｡)۶', '(￣▽￣)ノ', '>°)))彡', '~~(__^·>', 'S N A K E   O S', '★ PRO ★'];
  var ART = ['    ____\n   / . .\\\n   \\  ---<\n    \\  /\n  __/ /\n-=:___/', '  /^\\/^\\\n_|__|  O|\n\\/     /~ \\_/ \\\n \\____|__________/  \\\n        \\_______      \\\n                `\\     \\'];
  DEFS.textpack = { title: function () { return T('🐍 Pack de texto Pro', '🐍 Pro text pack'); }, w: 320, tool: true, render: function (b) {
    b.innerHTML = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:5px">' + TEXTS.map(function (t, i) { return '<button type="button" class="snkp-btn" data-t="' + i + '" data-noi18n translate="no" style="font-family:ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t) + '</button>'; }).join('') + '</div>' +
      ART.map(function (a, i) { return '<pre data-a="' + i + '" data-noi18n translate="no" title="Copiar" style="cursor:pointer;margin:8px 0 0;padding:6px;border-radius:8px;background:rgba(0,0,0,.35);font-size:.62rem;line-height:1.15;color:#4ade80">' + esc(a) + '</pre>'; }).join('');
    b.querySelectorAll('[data-t]').forEach(function (x) { x.onclick = function () { copy(TEXTS[+x.dataset.t]); }; });
    b.querySelectorAll('[data-a]').forEach(function (x) { x.onclick = function () { copy(ART[+x.dataset.a], 'Arte ASCII copiado'); }; });
  } };

  /* ---------------- diseños de ventanas ---------------- */
  function visibleWins() { return Array.prototype.slice.call(document.querySelectorAll('#windows .app-window')).filter(function (w) { return !w.classList.contains('minimized') && w.offsetParent !== null && getComputedStyle(w).display !== 'none'; }); }
  function topWin() { var ws = visibleWins(); ws.sort(function (a, b) { return (+b.style.zIndex || 0) - (+a.style.zIndex || 0); }); return ws[0] || null; }
  function place(w, x, y, ww, hh) { w.classList.remove('maximized'); w.style.left = Math.round(x) + 'px'; w.style.top = Math.round(y) + 'px'; w.style.width = Math.round(ww) + 'px'; w.style.height = Math.round(hh) + 'px'; }
  function layout(n) {
    if (!S.active || phone()) return false;
    var L = $('#windows'); if (!L) return false;
    var Wd = L.clientWidth, H = L.clientHeight, g = 6;
    if (n === 7) {
      var ws = visibleWins(); if (!ws.length) { toast('No hay ventanas abiertas'); return false; }
      var cols = Math.ceil(Math.sqrt(ws.length)), rows = Math.ceil(ws.length / cols);
      ws.forEach(function (w, i) { var c = i % cols, r = Math.floor(i / cols), cw = Wd / cols, rh = H / rows; place(w, c * cw + g, r * rh + g, cw - 2 * g, rh - 2 * g); });
    } else {
      var w = topWin(); if (!w) { toast('No hay ventanas abiertas'); return false; }
      var R = { 1: [0, 0, .5, .5], 2: [.5, 0, .5, .5], 3: [0, .5, .5, .5], 4: [.5, .5, .5, .5], 5: [0, 0, 2 / 3, 1], 6: [2 / 3, 0, 1 / 3, 1] }[n];
      if (!R) return false;
      place(w, R[0] * Wd + g, R[1] * H + g, R[2] * Wd - 2 * g, R[3] * H - 2 * g);
    }
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    return true;
  }
  var LAYOUTS = [[1, '◰ Arriba izq.'], [2, '◳ Arriba der.'], [3, '◱ Abajo izq.'], [4, '◲ Abajo der.'], [5, '▌ Dos tercios'], [6, '▐ Un tercio'], [7, '▦ Mosaico']];

  /* ---------------- salvapantallas ---------------- */
  function saver(kind) {
    if (!S.active || $('#snkProSaver')) return;
    var el = document.createElement('div'); el.id = 'snkProSaver'; el.dataset.kind = kind;
    var cv = document.createElement('canvas'); cv.style.cssText = 'width:100%;height:100%;display:block'; el.appendChild(cv); document.body.appendChild(el);
    var c = cv.getContext('2d'), raf = 0, t0 = performance.now(), Wd = 0, H = 0, cols = [], stars = [];
    function size() { Wd = cv.width = innerWidth; H = cv.height = innerHeight; cols = []; for (var i = 0; i < Math.ceil(Wd / 18); i++) cols.push(Math.random() * H / 18); stars = []; for (var k = 0; k < 260; k++) stars.push([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random()]); }
    size();
    var CH = 'SNAKEOS🐍01アイウエオカキクケコ<>=~';
    function frame() {
      raf = requestAnimationFrame(frame);
      if (kind === 'rain') {
        c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(0, 0, Wd, H); c.font = '16px ui-monospace,monospace';
        for (var i = 0; i < cols.length; i++) { var ch = CH[Math.floor(Math.random() * CH.length)]; c.fillStyle = Math.random() < .03 ? GOLD : '#39ff6a'; c.fillText(ch, i * 18, cols[i] * 18); if (cols[i] * 18 > H && Math.random() > .975) cols[i] = 0; cols[i] += .5; }
      } else {
        c.fillStyle = '#000'; c.fillRect(0, 0, Wd, H);
        for (var k = 0; k < stars.length; k++) { var s = stars[k]; s[2] -= .006; if (s[2] <= .01) { s[0] = Math.random() * 2 - 1; s[1] = Math.random() * 2 - 1; s[2] = 1; } var x = Wd / 2 + s[0] / s[2] * Wd / 2, y = H / 2 + s[1] / s[2] * H / 2, r = (1 - s[2]) * 3; c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = 'rgba(255,' + (200 + Math.round(55 * s[2])) + ',' + Math.round(120 * s[2]) + ',' + (1 - s[2] * .6).toFixed(2) + ')'; c.fill(); }
        c.fillStyle = 'rgba(255,228,138,.8)'; c.font = '800 28px system-ui,sans-serif'; c.textAlign = 'center'; c.fillText(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), Wd / 2, H - 50);
      }
    }
    frame();
    function quit(e) { if (performance.now() - t0 < 700) return; cancelAnimationFrame(raf); el.remove(); ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) { removeEventListener(ev, quit, true); }); removeEventListener('resize', size); if (e && e.type === 'keydown') e.preventDefault(); }
    ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) { addEventListener(ev, quit, true); });
    addEventListener('resize', size);
  }
  var idleAt = Date.now();
  ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) { addEventListener(ev, function () { idleAt = Date.now(); }, { capture: true, passive: true }); });
  setInterval(function () { var m = +P('saverIdle', 0); if (S.active && m > 0 && !document.hidden && Date.now() - idleAt > m * 60000 && !$('#snkProSaver') && $('#desktop') && !$('#desktop').classList.contains('hidden')) saver(P('saverKind', 'rain')); }, 5000);

  /* ---------------- animación de entrada ---------------- */
  function intro() {
    if (!S.active || !P('intro', true) || reduced()) return;
    try { if (sessionStorage.getItem('snkProIntro:' + S.email)) return; sessionStorage.setItem('snkProIntro:' + S.email, '1'); } catch (e) {}
    var el = document.createElement('div'); el.id = 'snkProIntro';
    el.innerHTML = '<svg width="220" height="120" viewBox="0 0 220 120"><path d="M10 90C40 30 70 30 90 70S150 110 170 60 200 20 210 30" fill="none" stroke="#f5c542" stroke-width="12" stroke-linecap="round"/><circle cx="210" cy="30" r="0" fill="#f5c542"><animate attributeName="r" from="0" to="9" begin="1.2s" dur=".25s" fill="freeze"/></circle></svg><div class="w">Snake OS VP <span class="snkp-badge" style="font-size:.9rem">PRO</span></div>';
    document.body.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; }, 1900); setTimeout(function () { el.remove(); }, 2500);
  }
  function introWhenDesk(tries) { var d = $('#desktop'); if (d && !d.classList.contains('hidden')) return intro(); if (tries > 0) setTimeout(function () { introWhenDesk(tries - 1); }, 1000); }

  /* ---------------- estilos de terminal (Máquinas virtuales, escritorio estilo Ubuntu 26.10) ---------------- */
  var TERM = {
    gold: { n: 'Oro', t: { background: '#120d02', foreground: '#ffe9b0', cursor: '#f5c542', cursorAccent: '#120d02', selectionBackground: 'rgba(245,197,66,.3)' } },
    matrix: { n: 'Matrix', t: { background: '#000000', foreground: '#39ff6a', cursor: '#39ff6a', cursorAccent: '#000000', selectionBackground: 'rgba(57,255,106,.3)', green: '#39ff6a', brightGreen: '#8cff9f' } },
    ocean: { n: 'Océano', t: { background: '#04172b', foreground: '#cde8ff', cursor: '#4cc3ff', cursorAccent: '#04172b', selectionBackground: 'rgba(76,195,255,.3)', blue: '#4c8dff', brightBlue: '#8fc1ff' } },
    amber: { n: 'Ámbar retro', t: { background: '#140b00', foreground: '#ffb000', cursor: '#ffb000', cursorAccent: '#140b00', selectionBackground: 'rgba(255,176,0,.3)' } }
  };
  function termTheme() { if (!S.active) return null; var k = P('term', ''); return TERM[k] ? Object.assign({}, TERM[k].t) : null; }

  /* ---------------- Centro Pro ---------------- */
  var WALL_LIST = [['', 'Sin fondo Pro', 'linear-gradient(135deg,#333,#111)'], ['gold', WALLS.gold.n], ['scales', WALLS.scales.n], ['circuit', WALLS.circuit.n], ['midnight', WALLS.midnight.n], ['aurora', 'Aurora (animado)', 'linear-gradient(120deg,#06281a,#0b4d3a,#123a6b,#3b1a5c)'], ['neon', 'Neón (animado)', 'linear-gradient(180deg,#030a06,#0c2a1a)'], ['dyn', 'Según la hora', 'linear-gradient(180deg,#ff9a8b,#7fd3ff,#1d2b64)']];
  function center() {
    var ex = $('#snkProCenter'); if (ex) { ex.remove(); return; }
    if (!S.active) return;
    var el = document.createElement('div'); el.id = 'snkProCenter'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', T('Centro Pro', 'Pro Centre'));
    document.body.appendChild(el);
    function tg(k, label, def) { return '<label class="snkp-tg"><span>' + label + '</span><input type="checkbox" data-tg="' + k + '"' + (P(k, def) ? ' checked' : '') + '></label>'; }
    function paint() {
      var wall = P('wall', ''), acc = P('acc', ''), fr = P('frame', ''), open = P('open', {}) || {};
      el.innerHTML = '<div class="hd">⭐ ' + T('Centro Pro', 'Pro Centre') + ' <span class="snkp-badge">PRO</span><button type="button" class="snkp-btn x">✕</button></div>' +
        '<h3>' + T('Fondos Pro', 'Pro wallpapers') + '</h3><div class="snkp-sw walls" style="margin-bottom:14px">' + WALL_LIST.map(function (w) { var bg = w[2] || (WALLS[w[0]] ? svgUrl(WALLS[w[0]].svg) : ''); return '<button type="button" data-wall="' + w[0] + '" class="' + (wall === w[0] ? 'on' : '') + '" title="' + esc(L_(w[1])) + '" style="background-image:' + esc(bg).replace(/&quot;/g, "'") + '"><span>' + esc(L_(w[1])) + '</span></button>'; }).join('') + '</div>' +
        '<h3>' + T('Colores Pro', 'Pro colours') + '</h3><div class="snkp-sw dots"><button type="button" data-acc="" class="' + (!acc ? 'on' : '') + '" title="' + T('Color normal', 'Default colour') + '" style="background:#34d17a"></button>' + Object.keys(ACC).map(function (k) { return '<button type="button" data-acc="' + k + '" class="' + (acc === k ? 'on' : '') + '" title="' + L_(ACC[k][0]) + '" style="background:' + ACC[k][1] + '"></button>'; }).join('') + '</div>' +
        '<h3>' + T('Aspecto Pro', 'Pro look') + '</h3>' + tg('win', T('🪟 Tema de ventanas Pro', '🪟 Pro window theme'), false) + tg('tb', T('🧊 Barra de tareas Pro', '🧊 Pro taskbar'), false) + tg('intro', T('✨ Animación de entrada', '✨ Intro animation'), true) +
        '<div class="snkp-row" style="margin:4px 0"><span>🖼 ' + T('Marco de perfil', 'Profile frame') + '</span><select data-sel="frame"><option value="">' + T('Ninguno', 'None') + '</option>' + Object.keys(FRAMES).map(function (k) { return '<option value="' + k + '"' + (fr === k ? ' selected' : '') + '>' + L_(FRAMES[k]) + '</option>'; }).join('') + '</select></div>' +
        '<h3>' + T('Widgets de escritorio', 'Desktop widgets') + '</h3><div class="snkp-row" style="margin-bottom:8px"><button type="button" class="snkp-btn pri pick">🧩 ' + T('Añadir widget…', 'Add widget…') + '</button></div><div class="snkp-grid">' + [['aclock', T('🕰️ Reloj analógico', '🕰️ Analogue clock')], ['world', T('🌍 Reloj mundial', '🌍 World clock')], ['month', T('📅 Calendario', '📅 Calendar')], ['monitor', '📈 Monitor']].map(function (x) { return '<button type="button" data-w="' + x[0] + '" class="' + (W[x[0]] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '<button type="button" data-note="1">🗒️ ' + T('Nueva nota', 'New note') + '</button></div>' +
        '<h3>' + T('Herramientas Pro', 'Pro tools') + '</h3><div class="snkp-grid">' + [['kanban', '🗂️ Kanban'], ['focus', T('🎯 Foco', '🎯 Focus')], ['timers', T('⏳ Temporizadores', '⏳ Timers')], ['recorder', T('🎥 Grabar pantalla', '🎥 Screen recorder')], ['passgen', T('🔑 Contraseñas', '🔑 Passwords')], ['sketch', T('✏️ Dibujo', '✏️ Sketch')], ['textpack', T('🐍 Pack de texto', '🐍 Text pack')]].map(function (x) { return '<button type="button" data-w="' + x[0] + '" class="' + (W[x[0]] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' +
        '<h3>' + T('Diseños de ventanas', 'Window layouts') + ' <small style="text-transform:none;letter-spacing:0">(' + T('Alt+Mayús+1…7', 'Alt+Shift+1…7') + ')</small></h3><div class="snkp-grid">' + LAYOUTS.map(function (l) { return '<button type="button" data-lay="' + l[0] + '">' + L_(l[1]) + '</button>'; }).join('') + '</div>' +
        '<h3>Salvapantallas Pro <small style="text-transform:none;letter-spacing:0">(Ctrl+Alt+P)</small></h3><div class="snkp-row"><button type="button" class="snkp-btn" data-saver="rain">🐍 ' + T('Lluvia de serpientes', 'Snake rain') + '</button><button type="button" class="snkp-btn" data-saver="stars">🌠 ' + T('Estrellas doradas', 'Golden stars') + '</button></div>' +
        '<div class="snkp-row" style="margin-top:6px"><span>' + T('Usar', 'Use') + '</span><select data-sel="saverKind"><option value="rain">' + T('Lluvia de serpientes', 'Snake rain') + '</option><option value="stars"' + (P('saverKind', 'rain') === 'stars' ? ' selected' : '') + '>' + T('Estrellas doradas', 'Golden stars') + '</option></select><span>' + T('tras', 'after') + '</span><select data-sel="saverIdle">' + [[0, T('nunca', 'never')], [2, '2 min'], [5, '5 min'], [10, '10 min'], [15, '15 min']].map(function (o) { return '<option value="' + o[0] + '"' + (+P('saverIdle', 0) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
        '<h3>' + T('Máquinas virtuales', 'Virtual machines') + '</h3><p style="margin:0 0 6px;opacity:.8;font-size:.75rem">' + T('En la máquina (Ubuntu 26.10 (estilo)) abre Configuración › Pro: estilos de terminal e instantánea de la máquina.', 'In the machine (Ubuntu 26.10 (style)) open Settings › Pro: terminal styles and machine snapshot.') + '</p><button type="button" class="snkp-btn vm">🖥️ ' + T('Abrir Máquinas virtuales', 'Open Virtual machines') + '</button>';
      el.querySelector('.x').onclick = function () { el.remove(); };
      el.querySelectorAll('[data-wall]').forEach(function (b) { b.onclick = function () { setPref('wall', b.dataset.wall); applyWall(); paint(); }; });
      el.querySelectorAll('[data-acc]').forEach(function (b) { b.onclick = function () { setPref('acc', b.dataset.acc); applyBody(); paint(); }; });
      el.querySelectorAll('[data-tg]').forEach(function (b) { b.onchange = function () { setPref(b.dataset.tg, b.checked); applyBody(); }; });
      el.querySelectorAll('[data-sel]').forEach(function (b) { b.onchange = function () { var v = b.dataset.sel === 'saverIdle' ? +b.value : b.value; setPref(b.dataset.sel, v); applyBody(); }; });
      el.querySelectorAll('[data-w]').forEach(function (b) { b.onclick = function () { var id = b.dataset.w; if (W[id]) closeW(id, true); else openW(id); paint(); }; });
      el.querySelector('[data-note]').onclick = function () { newNote(); };
      el.querySelector('.pick').onclick = function () { picker(); };
      el.querySelectorAll('[data-lay]').forEach(function (b) { b.onclick = function () { el.remove(); layout(+b.dataset.lay); }; });
      el.querySelectorAll('[data-saver]').forEach(function (b) { b.onclick = function () { el.remove(); saver(b.dataset.saver); }; });
      el.querySelector('.vm').onclick = function () { el.remove(); if (window.openApp) window.openApp('maquinas-virtuales'); };
    }
    paint();
  }
  document.addEventListener('pointerdown', function (e) { var c = $('#snkProCenter'); if (c && !c.contains(e.target) && !(e.target.closest && e.target.closest('#snkProBtn'))) c.remove(); }, true);
  function ensureBtn() {
    var ub = $('#userBadge'), b = $('#snkProBtn');
    if (!S.active) { if (b) { b.remove(); try { if (window.snkTbOpen && window.snkTbOpen.refresh) window.snkTbOpen.refresh(); } catch (e) {} } return; }
    if (!ub || !ub.parentNode || b) return;
    b = document.createElement('button'); b.type = 'button'; b.className = 'tb-tool'; b.id = 'snkProBtn'; b.title = T('Centro Pro (Snake OS VP Pro)', 'Pro Centre (Snake OS VP Pro)'); b.setAttribute('aria-label', T('Centro Pro', 'Pro Centre')); b.innerHTML = '<span aria-hidden="true">⭐</span><span class="snkp-badge">PRO</span>';
    b.onclick = function (e) { e.stopPropagation(); center(); };
    ub.parentNode.insertBefore(b, ub.nextSibling); // a la izquierda, junto a tu nombre (no mueve los botones que ya existen)
    try { if (window.snkTbOpen && window.snkTbOpen.refresh) window.snkTbOpen.refresh(); } catch (e) {}
  }
  document.addEventListener('keydown', function (e) {
    if (!S.active) return;
    if (e.key === 'Escape' && $('#snkProCenter')) { $('#snkProCenter').remove(); return; }
    /* 2026.14: no robar teclas al escribir (AltGr = Ctrl+Alt en teclados españoles) */
    var tg = e.target; if (tg && tg.closest && tg.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],.xterm')) return;
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && /^Digit[1-7]$/.test(e.code)) { if (layout(+e.code.slice(5))) { e.preventDefault(); e.stopPropagation(); } }
    else if (e.ctrlKey && e.altKey && !e.shiftKey && (e.key === 'p' || e.key === 'P' || e.code === 'KeyP')) { e.preventDefault(); saver(P('saverKind', 'rain')); }
  }, true);

  /* ---------------- aplicar / estado ---------------- */
  function applyAll() {
    css(); applyBody(); applyWall(); ensureBtn();
    if (!S.active) { closeAll(); var c = $('#snkProCenter'); if (c) c.remove(); var sv = $('#snkProSaver'); if (sv) sv.remove(); return; }
    var open = P('open', {}) || {};
    Object.keys(open).forEach(function (id) { if (open[id] && !W[id]) openW(id, false); });
  }
  function setStatus(d) {
    var was = S.active;
    S.active = !!(d && d.active); S.since = d && d.since ? d.since : 0; S.loaded = true;
    if (S.active) {
      var local = null; try { local = JSON.parse(localStorage.getItem(lsKey()) || 'null'); } catch (e) {}
      S.prefs = d.prefs && Object.keys(d.prefs).length ? d.prefs : (local && typeof local === 'object' ? local : {});
      try { localStorage.setItem(lsKey(), JSON.stringify(S.prefs)); } catch (e) {}
    } else { S.prefs = {}; try { localStorage.removeItem(lsKey()); } catch (e) {} }
    applyAll();
    if (S.active && !was) introWhenDesk(20);
    try { window.dispatchEvent(new CustomEvent('snk:pro', { detail: { active: S.active } })); } catch (e) {}
  }
  function pull() {
    var em = S.email;
    return api('/api/pro/status').then(function (d) { if (S.email === em) setStatus(d); return d; }).catch(function () { return null; });
  }
  function onUser() {
    var u = cu(), em = u && u.email ? String(u.email).toLowerCase() : '';
    if (em === S.email) return;
    clearTimeout(S.pushT); S.pushT = null;
    S.email = em; S.active = false; S.prefs = {}; S.loaded = false; closeAll(); applyAll();
    loadClocks();
    if (em) { S.loginAt = Date.now(); pull(); }
  }
  setInterval(function () { onUser(); if (S.active) { ensureBtn(); var w = $('#snkProWall'); if (P('wall', '') === 'dyn' && w && w.dataset.ph !== dynPhase()[1]) { w.dataset.w = ''; applyWall(); } if (!w && P('wall', '')) applyWall(); } }, 1000);
  setInterval(function () { if (S.email && !document.hidden) pull(); }, 300000);
  window.addEventListener('snk:profile', function () { setTimeout(onUser, 0); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.email) pull(); });

  /* ---------------- Ajustes › Snake OS VP Pro ---------------- */
  function fmtDate(s) { try { return new Date(s * 1000).toLocaleDateString(EN() ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } }
  function settingsPanel(repaint) {
    css();
    var box = document.createElement('div'); box.className = 'snkp-set';
    function featList() {
      return '<div class="snkp-set-h" style="font-weight:800;margin:8px 0 2px">' + T('Funciones Pro', 'Pro features') + ' <small style="opacity:.6">' + FEATS.length + '</small></div><div class="snkp-fl" data-noi18n translate="no">' + FEATS.map(function (f) { var x = (EN() ? f.en : f.es) || f.es; return '<div class="' + (S.active ? '' : 'off') + '" data-feat="' + f.id + '"><i>' + f.ico + '</i><span style="flex:1"><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></span><em title="' + (S.active ? T('Disponible', 'Available') : T('Bloqueada: activa Pro', 'Locked: activate Pro')) + '">' + (S.active ? '✅' : '🔒') + '</em></div>'; }).join('') + '</div>';
    }
    function paint(msg, kind) {
      if (S.active) {
        box.innerHTML = '<div class="card gold"><div style="display:flex;align-items:center;gap:8px;font-weight:800">⭐ Snake OS VP Pro <span class="snkp-badge">PRO</span> <span style="margin-left:auto;color:#4ade80">Activo</span></div>' +
          '<p>Activo en este perfil' + (S.since ? ' desde el ' + esc(fmtDate(S.since)) : '') + '. Código: <code data-noi18n translate="no">••••-••••-••••</code> (no se vuelve a mostrar).</p>' +
          '<div class="snkp-row"><button type="button" class="snk4a-btn primary cen">⭐ Abrir Centro Pro</button><button type="button" class="snk4a-btn leave">Dejar Pro</button></div><div class="msg ' + (kind || '') + '">' + esc(msg || '') + '</div></div>' + featList();
        box.querySelector('.cen').onclick = function () { center(); };
        box.querySelector('.leave').onclick = function () {
          if (!confirm('¿Dejar Snake OS VP Pro en este perfil? Las funciones Pro se apagan y el código usado ya no sirve. Podrás pedir otro código gratis en /pro.')) return;
          api('/api/pro', { method: 'DELETE' }).then(function () { setStatus({ active: false }); paint('Pro desactivado en este perfil', 'ok'); if (repaint) setTimeout(repaint, 50); }, function (e) { paint((e && e.message) || 'No se pudo cambiar', 'err'); });
        };
        return;
      }
      box.innerHTML = '<div class="card"><div style="font-weight:800">⭐ Snake OS VP Pro <span style="opacity:.6;font-weight:600">· gratis</span></div>' +
        '<p>Más de 20 funciones nuevas para tu perfil. Todo lo que ya tiene Snake OS sigue igual y gratis. Pide tu código gratuito en <a href="/pro" target="_blank" rel="noopener" style="color:var(--accent,#34d17a)">snake-os-vp.softportweb.com/pro</a> con esta misma cuenta Dogaemail y pégalo aquí.</p>' +
        '<label for="snkProCode" style="font-weight:800;font-size:.8rem">Código de Snake OS VP Pro</label>' +
        '<input class="snk4a-input" id="snkProCode" data-noi18n translate="no" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" placeholder="SNKPRO-XXXX-XXXX-XXXX" style="font-family:ui-monospace,monospace;letter-spacing:.06em;margin:6px 0">' +
        '<div class="snkp-row"><button type="button" class="snk4a-btn primary go">Activar Pro</button></div><div class="msg ' + (kind || '') + '" role="status">' + esc(msg || '') + '</div></div>' + featList();
      var inp = box.querySelector('#snkProCode'), go = box.querySelector('.go');
      function submit() {
        var v = cleanCode(inp.value); if (!v) { paint('Pega primero tu código', 'err'); return; }
        go.disabled = true; go.textContent = 'Comprobando…';
        api('/api/pro/redeem', { method: 'POST', body: { code: v } }).then(function (d) {
          inp.value = ''; setStatus(d); paint(T('✅ ¡Snake OS VP Pro activado en este perfil!', '✅ Snake OS VP Pro activated on this profile!'), 'ok'); toast(T('⭐ Snake OS VP Pro activado', '⭐ Snake OS VP Pro activated')); if (repaint) setTimeout(repaint, 50);
        }, function (e) { var m = srvErr((e && e.message) || '') || T('No se pudo comprobar el código', 'The code could not be checked'); if (e && e.status === 401) { m = T('Tu sesión de Snake OS VP se ha cerrado (por ejemplo, al abrir Snake OS en otra pestaña). Inicia sesión otra vez y vuelve a pegar el código: sigue siendo válido.', 'Your Snake OS VP session has ended (for example, by opening Snake OS in another tab). Sign in again and paste the code again: it is still valid.'); try { if (window.snkSessionGuard) window.snkSessionGuard.show(); } catch (e3) {} } paint('❌ ' + m, 'err'); var i2 = box.querySelector('#snkProCode'); if (i2) { i2.value = v; i2.focus(); } });
      }
      go.onclick = submit; inp.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    }
    paint();
    if (!S.loaded && S.email) pull().then(function () { if (box.isConnected) paint(); });
    return box;
  }

  /* Mismo criterio que el servidor: sin espacios, saltos ni caracteres invisibles, mayúsculas, con o sin guiones */
  function cleanCode(raw) {
    var t = String(raw || ''); try { t = t.normalize('NFKC'); } catch (e) {}
    t = t.replace(/[\u200B-\u200F\u2060-\u2064\uFEFF\u00AD\s]/g, '').toUpperCase();
    var a = t.replace(/[^A-Z0-9]/g, ''); if (a.indexOf('SNKPRO') === 0) a = a.slice(6);
    return a.length === 12 ? 'SNKPRO-' + a.slice(0, 4) + '-' + a.slice(4, 8) + '-' + a.slice(8) : t;
  }
  /* 2026.14: al cambiar ES/EN se actualizan los títulos de los botones de los widgets ya abiertos */
  function relabelWidgets() {
    var ws = document.querySelectorAll('.snkp-w');
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i], q = function (c) { return w.querySelector('.snkp-wh .' + c); }, b;
      if ((b = q('wpin'))) b.title = b.getAttribute('aria-pressed') === 'true' ? T('Desfijar (se podrá mover y cambiar de tamaño)', 'Unpin (it can be moved and resized)') : T('Fijar en el escritorio (detrás de las ventanas, sin moverse)', 'Pin to the desktop (behind windows, fixed in place)');
      if ((b = q('wmin'))) b.title = w.classList.contains('mini') ? T('Mostrar', 'Show') : T('Minimizar', 'Minimise');
      if ((b = q('wcmp'))) b.title = w.classList.contains('compact') ? T('Tamaño grande', 'Large size') : T('Tamaño compacto', 'Compact size');
      if ((b = q('x'))) b.title = T('Quitar del escritorio', 'Remove from the desktop');
    }
  }
  window.addEventListener('snk-lang', function () { try { relabelWidgets(); } catch (e) {} });
  window.snkPro = {
    active: function () { return !!S.active; },
    since: function () { return S.since; },
    features: FEATS,
    settingsPanel: settingsPanel,
    openCenter: center,
    termTheme: termTheme,
    termStyles: function () { return Object.keys(TERM).map(function (k) { return { id: k, name: TERM[k].n, bg: TERM[k].t.background, fg: TERM[k].t.foreground }; }); },
    termStyle: function () { return S.active ? P('term', '') : ''; },
    setTermStyle: function (k) { if (!S.active) return false; setPref('term', TERM[k] ? k : ''); return true; },
    layout: layout, saver: saver, open: function (id) { openW(id); }, close: function (id) { closeW(id, true); }, newNote: newNote, picker: picker, pin: function (id, on) { setKey('pin', id, !!on); if (W[id]) { closeW(id, false); openW(id, false); } },
    _state: function () { return { active: S.active, email: S.email, widgets: Object.keys(W), prefs: JSON.parse(JSON.stringify(S.prefs)) }; },
    refresh: pull
  };
  css();
  onUser();
})();
