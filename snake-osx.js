/* Snake OS · extras de octubre 2026 (snake-osx.js)
   - Brillo: F5 baja / F6 sube (capa oscura + indicador OSD), por perfil.
   - Salvapantallas configurable por perfil (tiempo y tipo) → snake-screensaver.js.
   - Modo trabajo: fondo negro/grises bloqueado, menos efectos, sin ocio en segundo plano y dock de apps de trabajo.
   - Snake OS Kids: control parental con PIN (onboarding, apps por edad, tiempo de pantalla, chat, bots, web,
     juegos online, tienda, archivos, cámara/micrófono e informe semanal).
   Todo se guarda en el perfil con /api/osx/* (osx_extras.py). */
(function () {
  'use strict';
  var LOGO = '/static/assets/snake-os-kids-logo.svg?v=1';
  var LOGO_WIDE = '/static/assets/snake-os-kids-logo-wide.svg?v=1';
  var PERF_NOTE = 'Medido en nuestras pruebas (CPU ×4 más lenta): arrastrar ventanas pasa de ~5 a ~60 fps y las apps se abren 2-3 veces más rápido.';
  var S = { perfNote: PERF_NOTE, email: '', prefs: null, token: '', tokenExp: 0, pushT: null, kidsTimer: null, unsent: {}, lastTick: 0,
            warned: {}, bedOverride: 0 };
  var LEISURE = ['snake', 'snake-racing', 'games', 'metaverse', 'doganiero-tv', 'los-snakes', 'snakemoji'];
  var HARD_BLOCK = { terminal: 1, 'server-i8': 1, desk: 1 };
  var RATING = { snake: 0, 'los-snakes': 0, calc: 0, notes: 0, calendario: 0, capturas: 0, games: 0, explorer: 0, trash: 0, about: 0,
    profile: 0, ajustes: 0, snakemoji: 0, maps: 7, 'snake-racing': 7, 'doganiero-tv': 7, browser: 7, dbots: 7, chat: 7, cloud: 7,
    code: 10, prism: 10, ai: 10, bluetooth: 13, phone: 13, metaverse: 13, store: 13 };
  var AGE_MAX = { '<7': 6, '7-12': 12, '13-16': 16 };
  var AGE_LABEL = { '<7': 'Menos de 7 años', '7-12': 'De 7 a 12 años', '13-16': 'De 13 a 16 años' };
  var AGE_DEFAULT_APPS = {
    '<7': ['snake', 'los-snakes', 'calc', 'notes', 'calendario', 'snakemoji', 'games'],
    '7-12': ['snake', 'los-snakes', 'calc', 'notes', 'calendario', 'snakemoji', 'games', 'snake-racing', 'maps', 'explorer', 'capturas', 'browser', 'dbots'],
    '13-16': ['snake', 'los-snakes', 'calc', 'notes', 'calendario', 'snakemoji', 'games', 'snake-racing', 'maps', 'explorer', 'capturas', 'browser', 'dbots', 'chat', 'code', 'doganiero-tv', 'cloud', 'ai']
  };
  var WORK_PRESETS = [
    { name: 'Gmail', url: 'https://mail.google.com/', icon: '📧' }, { name: 'Slack', url: 'https://app.slack.com/', icon: '💬' },
    { name: 'Notion', url: 'https://www.notion.so/', icon: '📓' }, { name: 'Google Calendar', url: 'https://calendar.google.com/', icon: '📆' },
    { name: 'Google Drive', url: 'https://drive.google.com/', icon: '🗂️' }, { name: 'Outlook', url: 'https://outlook.office.com/', icon: '📨' },
    { name: 'Teams', url: 'https://teams.microsoft.com/', icon: '👥' }, { name: 'GitHub', url: 'https://github.com/', icon: '🐙' }
  ];
  var SAVERS = [
    { id: 'window', name: 'Ventana con serpientes', desc: 'El logo de Snake OS con sus serpientes moviéndose (predeterminado)' },
    { id: 'clock', name: 'Reloj grande', desc: 'Hora y fecha en grande, se mueve un poco para cuidar la pantalla' },
    { id: 'bubbles', name: 'Burbujas', desc: 'Burbujas de colores que suben despacio' },
    { id: 'family', name: 'Serpientes de colores', desc: 'La familia de Los Snakes cruzando la pantalla' },
    { id: 'gradient', name: 'Degradado', desc: 'Colores suaves que cambian poco a poco' }
  ];
  var TIMEOUTS = [[1, '1 min'], [2, '2 min'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [0, 'Nunca']];

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cu() { return window.currentUser || null; }
  function api(p, o) { return window.api ? window.api(p, o) : Promise.reject(new Error('api')); }
  function papi(p, o) { o = o || {}; o.headers = Object.assign({}, o.headers || {}, { 'X-Osx-Parent': S.token || '' }); return api(p, o); }
  function errMsg(e) { return (e && (e.message || e.detail)) || 'Error'; }
  function toast(t) {
    var el = $('#osxToast'); if (!el) { el = document.createElement('div'); el.id = 'osxToast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('on'); }, 3200);
  }
  function lsKey() { return 'snkosx_v1:' + S.email; }
  function kids() { return S.prefs && S.prefs.kids && S.prefs.kids.on ? S.prefs.kids : null; }
  function work() { return !!(S.prefs && S.prefs.work && S.prefs.work.on && !kids()); }
  function appTitle(id) { var a = (window.APPS || {})[id]; return a ? a.title : (id === 'escritorio' ? 'Escritorio' : id); }
  function appIcon(id) {
    var a = (window.APPS || {})[id]; if (!a) return id === 'escritorio' ? '🖥️' : '🔹';
    return a.iconImg ? '<img src="' + esc(a.iconImg) + '" alt="" class="osx-ai">' : '<span class="osx-ae">' + esc(a.icon || '🔹') + '</span>';
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function fmtMin(sec) { var m = Math.round(sec / 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; }

  /* ---------------- CSS ---------------- */
  function css() {
    if ($('#osxCss')) return;
    var s = document.createElement('style'); s.id = 'osxCss';
    s.textContent = [
      '#osxDim{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:2147483600;transition:opacity .18s ease}',
      '#osxOsd{position:fixed;left:50%;bottom:96px;transform:translateX(-50%) translateY(10px);z-index:2147483640;display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:18px;background:rgba(14,20,18,.82);color:#fff;font:700 15px system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease}',
      '#osxOsd.on{opacity:1;transform:translateX(-50%)}#osxOsd .bar{width:180px;height:8px;border-radius:99px;background:rgba(255,255,255,.2);overflow:hidden}#osxOsd .bar i{display:block;height:100%;background:linear-gradient(90deg,#ffd32a,#fff);border-radius:99px}',
      '#osxOsd .k{font-size:12px;opacity:.7;font-weight:600}',
      '#osxToast{position:fixed;left:50%;top:18px;transform:translate(-50%,-12px);z-index:2147483645;max-width:min(92vw,520px);padding:10px 16px;border-radius:14px;background:rgba(15,22,19,.92);color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 8px 26px rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;text-align:center}',
      '#osxToast.on{opacity:1;transform:translate(-50%,0)}',
      'html body.osx-work,html body.osx-work[data-wp]{background:radial-gradient(1200px 700px at 78% 12%,rgba(255,255,255,.07),transparent 60%),repeating-linear-gradient(135deg,#0d0d0f 0 22px,#111113 22px 44px) #0a0a0b !important;background-attachment:fixed !important}',
      'body.osx-work #wpCustomImg{display:none !important}',
      'body.osx-work *,body.osx-work *::before,body.osx-work *::after{animation-duration:0s !important;animation-delay:0s !important;animation-iteration-count:1 !important;transition:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important}',
      'body.osx-work .app-window{box-shadow:0 2px 10px rgba(0,0,0,.45) !important}',
      'body.osx-work .app-window.minimized{content-visibility:hidden}',
      'body.osx-work .app-window{background:#ececee !important;background-image:none !important}',
      'body.osx-work:not(.theme-light) .app-window{background:#1e1f23 !important}',
      'body.osx-work .desktop-icon .lb,body.osx-work .desktop-icon span{text-shadow:0 1px 2px #000 !important;color:#e8e8ea !important}',
      'body.osx-work .desktop-icon[data-app="snake"],body.osx-work .desktop-icon[data-app="snake-racing"],body.osx-work .desktop-icon[data-app="games"],body.osx-work .desktop-icon[data-app="metaverse"],body.osx-work .desktop-icon[data-app="doganiero-tv"],body.osx-work .desktop-icon[data-app="los-snakes"]{opacity:.35;filter:grayscale(1)}',
      '#osxWorkDock{display:none;align-items:center;gap:4px;padding:0 6px;margin:0 auto 0 6px;border-left:1px solid rgba(127,127,127,.35);border-right:1px solid rgba(127,127,127,.35);max-width:24vw;overflow-x:auto;scrollbar-width:none;flex:0 1 auto;color:inherit}',
      'body.osx-work #osxWorkDock{display:flex}',
      'body.osx-work:not(.phone-mode) #userBadge,body.osx-kids:not(.phone-mode) #userBadge{margin-right:4px !important}',
      '#osxWorkDock button{margin:0;width:34px;height:34px;min-height:0;padding:0;border-radius:10px;border:0;background:transparent;box-shadow:none;color:inherit;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto}',
      '#osxWorkDock button:hover{background:rgba(127,127,127,.22)}#osxWorkDock .osx-ai{width:22px;height:22px;object-fit:contain}#osxWorkDock .lab{font-size:14px;padding:0 2px}',
      'body.phone-mode.osx-work #osxWorkDock{position:fixed;left:8px;right:8px;bottom:calc(64px + env(safe-area-inset-bottom));max-width:none !important;justify-content:flex-start;background:#1e1f23;color:#eee;border:1px solid #2a2b30;border-radius:16px;padding:6px;z-index:60;margin:0}',
      '#tbWorkBtn.on{background:rgba(255,255,255,.22) !important;border-radius:10px}',
      'body.osx-kids #taskbar{background:linear-gradient(90deg,#ff9a9e,#fecf6a,#7ee8a2,#74c0fc,#c3a6ff) !important;border-color:#fff !important}',
      'body.osx-kids .desktop-icon .ic{transform:scale(1.22);transform-origin:50% 60%}',
      'body.osx-kids .desktop-icon .lb{font-weight:800 !important;font-size:.82rem !important;text-shadow:0 1px 0 #fff,0 0 6px rgba(255,255,255,.8) !important;color:#26214a !important}',
      'body.osx-kids .start-item,body.osx-kids .desktop-icon{font-family:"Fredoka","Baloo 2","Comic Sans MS",system-ui,sans-serif}',
      '#osxKidsBadge{display:none;margin:0 auto 0 4px;padding:0 8px;height:34px;min-height:0;border:0;border-radius:12px;background:rgba(255,255,255,.8);box-shadow:none;cursor:pointer;align-items:center;gap:6px;font:800 12px system-ui;color:#3b2a7a;flex:0 0 auto;width:auto}',
      '#osxKidsBadge img{height:24px;display:block}#osxKidsBadge .t{white-space:nowrap}',
      'body.osx-kids #osxKidsBadge{display:flex}',
      'body.phone-mode #osxKidsBadge{display:none !important}',
      'body.phone-mode.osx-work #iconLayer{padding-bottom:72px;box-sizing:border-box}',
      '.osx-modal{position:fixed;inset:0;z-index:2147483500;background:rgba(10,12,30,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}',
      '.osx-modal .box{width:min(720px,100%);max-height:min(92vh,860px);overflow:auto;border-radius:24px;background:#fffdf7;color:#2b2550;box-shadow:0 24px 70px rgba(0,0,0,.45);padding:22px 24px;box-sizing:border-box;font:15px/1.45 system-ui,sans-serif}',
      '.osx-modal.kidsbg{background:radial-gradient(circle at 20% 20%,#ffd6e0,transparent 40%),radial-gradient(circle at 80% 30%,#c9f2ff,transparent 40%),radial-gradient(circle at 50% 90%,#e3ffd1,transparent 45%),rgba(40,30,90,.65)}',
      '.osx-modal h2{margin:4px 0 10px;font-size:1.35rem;color:#3b2a7a}.osx-modal h3{margin:14px 0 6px;font-size:1.02rem;color:#3b2a7a}.osx-modal p{margin:6px 0}',
      '.osx-modal .logo{display:block;margin:0 auto 6px;width:min(320px,70%)}',
      '.osx-modal .row{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-top:16px}',
      '.osx-modal .osx-b{margin:0;width:auto;min-height:0;padding:11px 18px;border-radius:14px;border:2px solid #d9d2ff;background:#fff;color:#3b2a7a;font:800 15px system-ui;cursor:pointer;box-shadow:none}',
      '.osx-modal .osx-b.pri{background:linear-gradient(135deg,#8b5cf6,#ec4899);border-color:transparent;color:#fff}',
      '.osx-modal .osx-b.ok{background:linear-gradient(135deg,#22c55e,#0ea5e9);border-color:transparent;color:#fff}',
      '.osx-modal .feat{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin:8px 0}',
      '.osx-modal .feat div{background:#f5f1ff;border-radius:14px;padding:10px 12px;font-size:.88rem}.osx-modal .feat b{display:block;font-size:.95rem}',
      '.osx-modal .steps{display:flex;gap:6px;justify-content:center;margin:2px 0 10px}.osx-modal .steps i{width:26px;height:6px;border-radius:9px;background:#e5e0ff}.osx-modal .steps i.on{background:#8b5cf6}',
      '.osx-chips{display:flex;flex-wrap:wrap;gap:8px}.osx-chip{margin:0;width:auto;min-height:0;display:flex;align-items:center;gap:6px;padding:7px 11px;border-radius:12px;border:2px solid #e5e0ff;background:#fff;color:#2b2550;font:700 13px system-ui;cursor:pointer;box-shadow:none}',
      '.osx-chip.on{border-color:#8b5cf6;background:#f1ebff}.osx-chip .osx-ai{width:20px;height:20px;object-fit:contain}',
      '.osx-field{display:flex;flex-direction:column;gap:4px;margin:8px 0}.osx-field>label{font-weight:700;font-size:.88rem}',
      '.osx-in{margin:0;padding:9px 11px;border-radius:12px;border:2px solid #e5e0ff;background:#fff;color:#2b2550;font:600 14px system-ui;box-sizing:border-box;width:100%}',
      'textarea.osx-in{min-height:70px;resize:vertical}',
      '.osx-seg{display:flex;flex-wrap:wrap;gap:6px}.osx-seg button{margin:0;width:auto;min-height:0;padding:8px 12px;border-radius:12px;border:2px solid #e5e0ff;background:#fff;color:#2b2550;font:700 13px system-ui;cursor:pointer;box-shadow:none}.osx-seg button.on{border-color:#8b5cf6;background:#8b5cf6;color:#fff}',
      '.osx-modal input[type=checkbox],.osx-panel input[type=checkbox]{width:18px !important;height:18px;min-height:0;margin:0 8px 0 0 !important;padding:0;display:inline-block;vertical-align:-3px;flex:0 0 auto;accent-color:#8b5cf6}',
      '.osx-field>label:has(input[type=checkbox]){display:flex;align-items:center;font-weight:700}',
      '.osx-note{font-size:.82rem;opacity:.75}.osx-err{color:#c0262d;font-weight:700;min-height:1.2em;margin-top:6px}',
      '.osx-pin{font:800 28px/1 ui-monospace,monospace;letter-spacing:10px;text-align:center}',
      '#osxStop{position:fixed;inset:0;z-index:2147483400;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:20px;background:radial-gradient(circle at 30% 20%,#ff9ac1,transparent 45%),radial-gradient(circle at 75% 70%,#62c8ff,transparent 45%),#2a1f5c;color:#fff;font:600 18px system-ui}',
      '#osxStop img{width:min(360px,70vw)}#osxStop h1{margin:0;font-size:clamp(1.6rem,4vw,2.4rem)}#osxStop p{margin:0;max-width:520px;opacity:.92}',
      '#osxStop button{margin:0;width:auto;min-height:0;padding:12px 20px;border-radius:16px;border:0;background:#fff;color:#3b2a7a;font:800 15px system-ui;cursor:pointer}',
      '#osxWarn{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483300;padding:10px 16px;border-radius:16px;background:#fff7d6;color:#5b4300;font:800 14px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center;max-width:92vw}',
      '#osxWarn button{margin:0;width:auto;min-height:0;padding:4px 10px;border-radius:10px;border:0;background:#5b4300;color:#fff;cursor:pointer}',
      '.osx-panel{display:flex;flex-direction:column;gap:10px}',
      '.osx-card{padding:12px;border-radius:14px;background:var(--input-bg,rgba(255,255,255,.06));border:1px solid var(--input-border,rgba(255,255,255,.14))}',
      '.osx-card h3,.osx-card h4{margin:0 0 6px;font-size:.92rem}.osx-card p{margin:0 0 8px;font-size:.78rem;opacity:.8}',
      '.osx-panel .osx-seg button,.osx-panel .osx-chip{border-color:var(--input-border,rgba(127,127,127,.35));background:transparent;color:var(--text,#fff)}',
      '.osx-panel .osx-seg button.on{background:var(--accent,#34d17a);border-color:var(--accent,#34d17a);color:#04170c}',
      '.osx-panel .osx-chip.on{border-color:var(--accent,#34d17a);background:rgba(52,209,122,.18)}',
      '.osx-panel .osx-in{background:var(--input-bg,rgba(255,255,255,.06));color:var(--text,#fff);border-color:var(--input-border,rgba(255,255,255,.2))}',
      '.osx-range{width:100%;accent-color:var(--accent,#34d17a)}',
      '.osx-savers{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}',
      '.osx-saver{margin:0;padding:0;width:auto;min-height:0;border-radius:14px;overflow:hidden;border:2px solid transparent;background:#000;cursor:pointer;text-align:left;box-shadow:none;color:#fff}',
      '.osx-saver.on{border-color:var(--accent,#34d17a)}.osx-saver .pv{position:relative;height:84px;overflow:hidden}.osx-saver .nm{display:block;padding:6px 8px;font:700 12px system-ui;background:rgba(0,0,0,.6)}',
      '.osx-bigpv{position:relative;height:180px;border-radius:14px;overflow:hidden;background:#000}',
      '.osx-bars{display:flex;align-items:flex-end;gap:6px;height:120px;padding-top:6px}.osx-bars div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;font-size:.68rem;height:100%}.osx-bars i{display:block;width:100%;max-width:34px;border-radius:6px 6px 2px 2px;background:linear-gradient(#a78bfa,#ec4899);min-height:2px}',
      '.osx-list{margin:0;padding:0;list-style:none;font-size:.8rem}.osx-list li{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;border-bottom:1px dashed rgba(127,127,127,.25)}.osx-list .osx-ai{width:16px;height:16px;vertical-align:-3px}',
      '.osx-kidslogo{display:block;width:min(300px,80%);margin:2px auto 8px}',
      '.osx-modal .box{--text:#2b2550;--muted:#4f4875;--input-bg:#fff;--input-border:#cfc6f5;--accent:#6d28d9;color:#2b2550}',
      '.osx-modal .box label,.osx-modal .box p,.osx-modal .box li,.osx-modal .box small,.osx-modal .box h4,.osx-modal .osx-field>label,.osx-modal .feat div{color:#2b2550 !important;opacity:1}',
      '.osx-modal .box h2,.osx-modal .box h3{color:#3b2a7a !important}',
      '.osx-modal .osx-note{color:#4f4875 !important;opacity:1}.osx-modal .osx-err{color:#b91c1c !important}',
      '.osx-modal .osx-in{background:#fff !important;color:#2b2550 !important;border-color:#cfc6f5 !important}',
      '.osx-modal .osx-in::placeholder{color:#6b6490 !important;opacity:1}.osx-modal option{background:#fff;color:#2b2550}',
      '.osx-modal .osx-seg button,.osx-modal .osx-chip{background:#fff !important;color:#2b2550 !important;border-color:#d9d2ff !important}',
      '.osx-modal .osx-seg button.on{background:#6d28d9 !important;border-color:#6d28d9 !important;color:#fff !important}',
      '.osx-modal .osx-chip.on{background:#efe8ff !important;border-color:#6d28d9 !important}',
      '.osx-modal .osx-b{background:#fff;color:#3b2a7a !important}',
      '.osx-modal .osx-b.pri{background:linear-gradient(135deg,#6d28d9,#be185d) !important;color:#fff !important}',
      '.osx-modal .osx-b.ok{background:linear-gradient(135deg,#15803d,#0369a1) !important;color:#fff !important}',
      '.osx-modal .osx-b:focus-visible,.osx-modal .osx-seg button:focus-visible,.osx-modal .osx-chip:focus-visible,.osx-modal .osx-in:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}',
      '.osx-panel .osx-card{background:rgba(22,24,32,.9);border-color:rgba(255,255,255,.16);color:#f2f2f6}',
      '.osx-panel .osx-card p,.osx-panel .osx-note{opacity:1;color:#d0d2dc !important}',
      '.osx-panel .osx-card label,.osx-panel .osx-card h3,.osx-panel .osx-card h4,.osx-panel .osx-list li,.osx-panel .osx-bars div,.osx-panel .osx-card b{color:#f2f2f6 !important}',
      '.osx-panel .osx-in{background:rgba(255,255,255,.08) !important;color:#f2f2f6 !important;border-color:rgba(255,255,255,.3) !important}',
      '.osx-panel .osx-in::placeholder{color:#b9bbc8;opacity:1}.osx-panel option{background:#1d1f27;color:#f2f2f6}',
      '.osx-panel .osx-seg button,.osx-panel .osx-chip{color:#f2f2f6 !important;border-color:rgba(255,255,255,.32) !important;background:rgba(255,255,255,.04) !important}',
      '.osx-panel .osx-seg button.on{background:#34d17a !important;border-color:#34d17a !important;color:#04170c !important}',
      '.osx-panel .osx-chip.on{background:rgba(52,209,122,.22) !important;border-color:#34d17a !important}',
      '.osx-panel .osx-err{color:#ff8a8a !important}',
      'body.theme-light .osx-panel .osx-card{background:rgba(255,255,255,.95);border-color:rgba(20,40,30,.16);color:#14261d}',
      'body.theme-light .osx-panel .osx-card p,body.theme-light .osx-panel .osx-note{color:#3a4b42 !important}',
      'body.theme-light .osx-panel .osx-card label,body.theme-light .osx-panel .osx-card h3,body.theme-light .osx-panel .osx-card h4,body.theme-light .osx-panel .osx-list li,body.theme-light .osx-panel .osx-bars div,body.theme-light .osx-panel .osx-card b{color:#14261d !important}',
      'body.theme-light .osx-panel .osx-in{background:#fff !important;color:#14261d !important;border-color:rgba(20,40,30,.3) !important}',
      'body.theme-light .osx-panel .osx-in::placeholder{color:#5a6a62}body.theme-light .osx-panel option{background:#fff;color:#14261d}',
      'body.theme-light .osx-panel .osx-seg button,body.theme-light .osx-panel .osx-chip{color:#14261d !important;border-color:rgba(20,40,30,.32) !important;background:#fff !important}',
      'body.theme-light .osx-panel .osx-seg button.on{background:#15803d !important;border-color:#15803d !important;color:#fff !important}',
      'body.theme-light .osx-panel .osx-chip.on{background:#dcfce7 !important;border-color:#15803d !important}',
      'body.theme-light .osx-panel .osx-err{color:#b91c1c !important}',
      '.osx-panel select.osx-in{appearance:auto}',
      '.osx-chip.na{text-decoration:line-through;border-style:dashed !important;cursor:not-allowed}.osx-chip.na .osx-ai{opacity:.45}',
      '.osx-modal .osx-chip.na{color:#5b5578 !important;background:#f4f2fa !important}.osx-panel .osx-chip.na{color:#b9bbc8 !important}body.theme-light .osx-panel .osx-chip.na{color:#4d5b54 !important;background:#f3f5f4 !important}',
      '@media (max-width:600px){.osx-modal .box{padding:16px;border-radius:18px}#osxOsd{bottom:120px}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------------- preferencias ---------------- */
  function defaults() {
    return { brightness: 100, screensaver: { id: 'window', timeout: 1 }, work: { on: false, apps: ['notes', 'calendario', 'code', 'terminal', 'explorer', 'desk', 'browser', 'cloud'], links: [] }, kids: { on: false, asked: true, has_pin: false } };
  }
  function readLocal() { try { var v = JSON.parse(localStorage.getItem(lsKey()) || 'null'); return v && typeof v === 'object' && v.work && v.kids ? v : null; } catch (e) { return null; } }
  function writeLocal() { try { localStorage.setItem(lsKey(), JSON.stringify(S.prefs)); } catch (e) {} }
  function setPrefs(p) { if (!p || !p.kids) return; S.prefs = p; writeLocal(); applyAll(); }
  function pull() {
    var who = S.email;
    return api('/api/osx/prefs').then(function (p) { if (S.email === who && !S.pushT) setPrefs(p); return p; }).catch(function () { return null; });
  }
  function push(part) {
    clearTimeout(S.pushT);
    var pd = S._pending = S._pending || {};
    Object.keys(part).forEach(function (k) { pd[k] = (part[k] && typeof part[k] === 'object' && !Array.isArray(part[k]) && pd[k] && typeof pd[k] === 'object') ? Object.assign({}, pd[k], part[k]) : part[k]; });
    S.pushT = setTimeout(function () {
      var body = S._pending; S._pending = null; S.pushT = null;
      api('/api/osx/prefs', { method: 'PUT', body: body }).then(function (p) { setPrefs(p); }).catch(function (e) { toast(errMsg(e)); pull(); });
    }, 350);
  }

  /* ---------------- brillo (F5 / F6) ---------------- */
  function applyBrightness() {
    var b = S.prefs ? S.prefs.brightness : 100;
    var el = $('#osxDim'); if (!el) { el = document.createElement('div'); el.id = 'osxDim'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); }
    el.style.opacity = String(Math.max(0, Math.min(0.8, (100 - b) / 100)));
  }
  function osd(b) {
    var el = $('#osxOsd'); if (!el) { el = document.createElement('div'); el.id = 'osxOsd'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = '<span>' + (b <= 40 ? '🔅' : '🔆') + '</span><span class="bar"><i style="width:' + b + '%"></i></span><span>' + b + '%</span><span class="k">F5 − · F6 +</span>';
    el.classList.add('on'); clearTimeout(osd._t);
    osd._t = setTimeout(function () { if (!osd.hold) el.classList.remove('on'); }, 1400);
  }
  function setBrightness(b, show) {
    if (!S.prefs) S.prefs = defaults();
    b = Math.max(20, Math.min(100, Math.round(b / 10) * 10));
    S.prefs.brightness = b; writeLocal(); applyBrightness(); if (show !== false) osd(b);
    if (S.email) push({ brightness: b });
    try { if (window.snkOsTutNote) window.snkOsTutNote('brightness'); } catch (e) {}
  }
  window.addEventListener('keydown', function (e) {
    if ((e.key === 'F5' || e.key === 'F6') && !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); e.stopPropagation();
      var b = S.prefs ? S.prefs.brightness : 100;
      setBrightness(b + (e.key === 'F6' ? 10 : -10));
    }
  }, true);

  /* ---------------- salvapantallas ---------------- */
  function applySaver() {
    var ss = window.snkScreensaver; if (!ss || !ss.configure) return;
    var p = S.prefs || defaults();
    ss.configure({ id: p.screensaver.id, timeout: p.screensaver.timeout, light: work() });
  }

  /* ---------------- modo trabajo ---------------- */
  function closeAppSafe(id) { try { if (typeof window.closeApp === 'function') window.closeApp(id, true); else if (typeof closeApp === 'function') closeApp(id, true); } catch (e) {} }
  function ensureTaskbarBits() {
    var tb = $('#taskbar'); if (!tb) return;
    var tools = $('#tbTools');
    var ub = $('#userBadge'), after = ub && ub.parentNode === tb ? ub.nextSibling : (tools && tools.parentNode === tb ? tools : null);
    if (!$('#osxWorkDock')) { var d = document.createElement('div'); d.id = 'osxWorkDock'; d.setAttribute('aria-label', 'Apps de trabajo'); tb.insertBefore(d, after); paintDock(); after = d.nextSibling; }
    if (!$('#osxKidsBadge')) {
      var k = document.createElement('button'); k.type = 'button'; k.id = 'osxKidsBadge'; k.title = 'Snake OS Kids · control parental (PIN)';
      k.innerHTML = '<img src="' + LOGO_WIDE + '" alt="Snake OS Kids"><span class="t" data-left></span>';
      k.addEventListener('click', function () { openSettings('kids'); });
      tb.insertBefore(k, after);
    }
    if (tools && !$('#tbWorkBtn')) {
      var w = document.createElement('button'); w.type = 'button'; w.className = 'tb-tool'; w.id = 'tbWorkBtn'; w.title = 'Modo trabajo'; w.textContent = '💼';
      w.addEventListener('click', function () { if (kids()) { toast('El modo trabajo no está disponible en Snake OS Kids'); return; } setWork(!work()); });
      tools.insertBefore(w, tools.firstChild);
    }
    var qs = $('#qsGrid');
    if (qs && !$('#qsWork')) {
      var t = document.createElement('button'); t.type = 'button'; t.className = 'qs-tile'; t.id = 'qsWork'; t.setAttribute('aria-pressed', 'false');
      t.innerHTML = '<span class="qs-tile-ico">💼</span><span class="qs-tile-lab">Modo trabajo</span>';
      t.addEventListener('click', function () { if (kids()) { toast('El modo trabajo no está disponible en Snake OS Kids'); return; } setWork(!work()); });
      qs.insertBefore(t, qs.firstChild);
    }
  }
  function paintDock() {
    var d = $('#osxWorkDock'); if (!d || !S.prefs) return;
    var w = S.prefs.work, h = '<span class="lab" title="Dock de trabajo">💼</span>';
    (w.apps || []).forEach(function (id) { if ((window.APPS || {})[id]) h += '<button type="button" data-wapp="' + esc(id) + '" title="' + esc(appTitle(id)) + '">' + appIcon(id) + '</button>'; });
    (w.links || []).forEach(function (l, i) { h += '<button type="button" data-link="' + i + '" title="' + esc(l.name + ' · ' + l.url) + '">' + esc(l.icon || '🔗') + '</button>'; });
    h += '<button type="button" data-cfg title="Conectar apps para el trabajo">＋</button>';
    d.innerHTML = h;
    d.querySelectorAll('[data-wapp]').forEach(function (b) { b.onclick = function () { if (window.openApp) window.openApp(b.dataset.wapp); }; });
    d.querySelectorAll('[data-link]').forEach(function (b) { b.onclick = function () { var l = w.links[+b.dataset.link]; if (l) window.open(l.url, '_blank', 'noopener'); }; });
    d.querySelector('[data-cfg]').onclick = function () { openSettings('trabajo'); };
    setTimeout(fitDock, 0);
  }
  function fitDock() {
    var d = $('#osxWorkDock'), c = $('#tb11Center'); if (!d) return;
    if (!work() || !c || document.body.classList.contains('phone-mode')) { d.style.maxWidth = ''; return; }
    var avail = c.getBoundingClientRect().left - d.getBoundingClientRect().left - 14;
    d.style.maxWidth = Math.max(44, Math.round(avail)) + 'px';
  }
  function setWork(on) {
    if (!S.email) return;
    if (!S.prefs) S.prefs = defaults();
    S.prefs.work.on = !!on; writeLocal(); applyAll();
    if (on) { LEISURE.forEach(closeAppSafe); toast('💼 Modo trabajo activado: fondo bloqueado, sin efectos ni juegos en segundo plano'); }
    else toast('Modo trabajo desactivado');
    push({ work: { on: !!on } });
  }
  function applyWork() {
    var on = work();
    document.body.classList.toggle('osx-work', on);
    var b = $('#tbWorkBtn'); if (b) b.classList.toggle('on', on);
    var q = $('#qsWork'); if (q) { q.setAttribute('aria-pressed', on ? 'true' : 'false'); q.classList.toggle('on', on); }
    window.__snakeOsWorkMode = on;
    paintDock();
    if (S.lastWork !== on) { S.lastWork = on; document.querySelectorAll('.osx-panel[data-osx]').forEach(function (p) { if (p._draw) p._draw(); }); }
  }
  window.snkOsxWallpaperLocked = function () { if (work()) { toast('🔒 El fondo está bloqueado en modo trabajo. Desactívalo para cambiarlo.'); return true; } return false; };

  /* ---------------- Snake OS Kids: reglas ---------------- */
  function kidAllowed(id) {
    var k = kids(); if (!k) return true;
    if (HARD_BLOCK[id]) return false;
    var r = RATING.hasOwnProperty(id) ? RATING[id] : 13;
    if (r > (AGE_MAX[k.age] || 12)) return false;
    if (id === 'ajustes') return true;
    if (id === 'store') return k.store === 'pin';
    if (id === 'dbots' && k.bots === 'off') return false;
    if (id === 'chat' && k.chat === 'off') return false;
    if (id === 'metaverse' && k.online !== 'allow') return false;
    if (id === 'trash' && k.files.no_delete) return false;
    return (k.apps || []).indexOf(id) >= 0;
  }
  function logBlocked(what, detail) { if (!kids()) return; api('/api/osx/kids/blocked', { method: 'POST', body: { what: what, detail: String(detail || '').slice(0, 150) } }).catch(function () {}); }
  function kidsHideStyle() {
    var st = $('#osxKidsHide'); if (!st) { st = document.createElement('style'); st.id = 'osxKidsHide'; document.head.appendChild(st); }
    if (!kids()) { if (st.textContent) st.textContent = ''; return; }
    var rules = Object.keys(window.APPS || {}).filter(function (id) { return !kidAllowed(id); }).map(function (id) { return 'body.osx-kids [data-app="' + id.replace(/"/g, '') + '"]'; });
    var txt = rules.length ? rules.join(',') + '{display:none !important}' : '';
    if (st.textContent !== txt) st.textContent = txt;
  }
  window.snkOsxCanOpen = function (id) {
    var k = kids(); if (!k) return true;
    if ($('#osxStop')) return false;
    if (!kidAllowed(id)) { toast('🧸 Esta app no está permitida en Snake OS Kids'); logBlocked('app', appTitle(id)); return false; }
    if (id === 'store' && !(S.storeOk && Date.now() - S.storeOk < 600000)) {
      askPin('Para entrar en la tienda hace falta el PIN de un adulto', 'store').then(function (ok) { if (ok) { S.storeOk = Date.now(); window.openApp('store'); } else logBlocked('tienda', 'abrir sin PIN'); });
      return false;
    }
    var lim = (k.limits.per_app || {})[id];
    if (lim && usedApp(id) >= lim * 60) { toast('⏰ Hoy ya has usado ' + appTitle(id) + ' todo el tiempo permitido'); logBlocked('tiempo', appTitle(id)); return false; }
    return true;
  };
  window.snkOsxUrlAllowed = function (url) {
    var k = kids(); if (!k) return true;
    var host = '';
    try { var u = new URL(url, location.origin); if (u.origin === location.origin) { toast('🧸 Los buscadores están bloqueados: abre una de las webs permitidas'); logBlocked('web', 'búsqueda'); return false; } host = u.hostname.replace(/^www\./, ''); } catch (e) { return false; }
    var ok = (k.sites || []).some(function (s) { return host === s || host.slice(-(s.length + 1)) === '.' + s; });
    if (!ok) { toast('🧸 Esa web no está permitida'); logBlocked('web', host || url); }
    return ok;
  };
  window.snkOsxBlockedPage = function () {
    var k = kids() || { sites: [] };
    var links = (k.sites || []).map(function (s) { return '<a href="https://' + esc(s) + '/" style="display:block;margin:8px 0;padding:12px 16px;border-radius:14px;background:#f1ebff;color:#3b2a7a;font-weight:800;text-decoration:none">🌐 ' + esc(s) + '</a>'; }).join('');
    return 'data:text/html;charset=utf-8,' + encodeURIComponent('<html><body style="font:16px system-ui;padding:24px;background:#fffdf7;color:#2b2550;text-align:center"><img src="' + location.origin + LOGO_WIDE + '" style="width:260px;max-width:80%"><h2>Esa web no está permitida</h2><p>Puedes visitar estas webs:</p><div style="max-width:420px;margin:0 auto;text-align:left">' + (links || '<p>(ninguna)</p>') + '</div></body></html>');
  };
  /* cámara y micrófono (también llamadas) */
  (function () {
    var md = navigator.mediaDevices; if (!md || !md.getUserMedia) return;
    var orig = md.getUserMedia.bind(md);
    md.getUserMedia = function (c) {
      var k = kids(); if (!k) return orig(c);
      var what = (c && c.video ? 'cámara' : '') + (c && c.audio ? (c.video ? ' y el micrófono' : 'micrófono') : '');
      if (k.media === 'block') { toast('🧸 La ' + what + ' está bloqueada en Snake OS Kids'); logBlocked('cámara/micro', what); return Promise.reject(new DOMException('Bloqueado por el control parental', 'NotAllowedError')); }
      return askPin('Para usar el ' + what + ' hace falta el permiso de un adulto', 'perm').then(function (ok) {
        if (!ok) { logBlocked('cámara/micro', what + ' (sin permiso)'); throw new DOMException('Sin permiso del adulto', 'NotAllowedError'); }
        return orig(c);
      });
    };
  })();
  /* archivos: no subir / no borrar */
  document.addEventListener('click', function (e) {
    var k = kids(); if (!k) return;
    var t = e.target;
    if (k.files.no_upload && t && t.closest && t.closest('input[type=file]')) { e.preventDefault(); e.stopPropagation(); toast('🧸 Subir archivos está bloqueado'); logBlocked('archivos', 'subir'); return; }
    if (k.files.no_delete && t && t.closest && !t.closest('.osx-modal,.osx-panel')) {
      var b = t.closest('button,[role=button],[role=menuitem],.ctx-item,li');
      var txt = b ? ((b.textContent || '').slice(0, 60) + ' ' + (b.title || '') + ' ' + (b.getAttribute('aria-label') || '')) : '';
      if (b && /(eliminar|borrar|papelera|vaciar|delete|trash|🗑)/i.test(txt)) { e.preventDefault(); e.stopPropagation(); toast('🧸 Borrar archivos está bloqueado'); logBlocked('archivos', 'borrar'); }
    }
  }, true);
  ['drop', 'paste'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var k = kids(); if (!k || !k.files.no_upload) return;
      var dt = e.dataTransfer || e.clipboardData; if (dt && dt.files && dt.files.length) { e.preventDefault(); e.stopPropagation(); toast('🧸 Subir archivos está bloqueado'); logBlocked('archivos', 'subir'); }
    }, true);
  });
  document.addEventListener('keydown', function (e) {
    var k = kids(); if (!k || !k.files.no_delete || e.key !== 'Delete') return;
    var t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault(); e.stopPropagation(); toast('🧸 Borrar archivos está bloqueado');
  }, true);

  /* ---------------- tiempo de pantalla (solo Kids) ---------------- */
  function usedToday() { var k = kids(); if (!k) return 0; var u = k.usage_today || {}, t = 0; Object.keys(u).forEach(function (a) { t += u[a]; }); Object.keys(S.unsent).forEach(function (a) { t += S.unsent[a]; }); return t; }
  function usedApp(id) { var k = kids(); if (!k) return 0; return ((k.usage_today || {})[id] || 0) + (S.unsent[id] || 0); }
  function dailyLimitSec() { var k = kids(); if (!k || !k.limits.daily_min) return 0; var ex = (k.extra && k.extra.date === today()) ? k.extra.min : 0; return (k.limits.daily_min + ex) * 60; }
  function inBedtime() {
    var k = kids(); if (!k || !k.limits.bedtime.on) return false;
    if (S.bedOverride > Date.now()) return false;
    var n = new Date(), m = n.getHours() * 60 + n.getMinutes();
    var f = k.limits.bedtime.from.split(':'), t = k.limits.bedtime.to.split(':');
    var a = +f[0] * 60 + +f[1], b = +t[0] * 60 + +t[1];
    return a <= b ? (m >= a && m < b) : (m >= a || m < b);
  }
  function activeApp() {
    var best = null, z = -1;
    document.querySelectorAll('.app-window').forEach(function (w) {
      if (w.classList.contains('minimized') || w.style.display === 'none') return;
      var zi = parseInt(w.style.zIndex || getComputedStyle(w).zIndex, 10) || 0;
      if (zi > z) { z = zi; best = w; }
    });
    return best ? best.id.replace(/^win-/, '') : 'escritorio';
  }
  function flushUsage(beacon) {
    var apps = S.unsent; if (!Object.keys(apps).length || !kids()) return;
    S.unsent = {};
    var body = { apps: apps };
    if (beacon && navigator.sendBeacon) {
      try { navigator.sendBeacon('/api/osx/kids/usage', new Blob([JSON.stringify(body)], { type: 'application/json' })); } catch (e) {}
      return;
    }
    api('/api/osx/kids/usage', { method: 'POST', body: body }).then(function (r) {
      if (r && r.usage_today && kids()) { S.prefs.kids.usage_today = r.usage_today; writeLocal(); }
    }).catch(function () { Object.keys(apps).forEach(function (a) { S.unsent[a] = (S.unsent[a] || 0) + apps[a]; }); });
  }
  function kidsTick() {
    var k = kids(); if (!k) return;
    var now = Date.now(), dt = S.lastTick ? Math.min(30, Math.round((now - S.lastTick) / 1000)) : 0; S.lastTick = now;
    var idle = window.snkScreensaver && window.snkScreensaver.isOn && window.snkScreensaver.isOn();
    if (dt && !document.hidden && !idle && !$('#osxStop')) { var a = activeApp(); S.unsent[a] = (S.unsent[a] || 0) + dt; }
    if (now - (S.lastFlush || 0) > 60000) { S.lastFlush = now; flushUsage(); }
    var badge = $('#osxKidsBadge [data-left]');
    var lim = dailyLimitSec(), used = usedToday();
    if (badge) badge.textContent = lim ? '⏳ ' + Math.max(0, Math.ceil((lim - used) / 60)) + ' min' : '';
    if (inBedtime()) { stopScreen('bed'); return; }
    if (lim) {
      var left = lim - used;
      if (left <= 0) { stopScreen('time'); return; }
      if (left <= 300 && !S.warned['d' + lim]) { S.warned['d' + lim] = 1; warn('⏰ Te quedan 5 minutos de pantalla por hoy'); }
    }
    var cur = activeApp(), al = (k.limits.per_app || {})[cur];
    if (al) {
      var l2 = al * 60 - usedApp(cur);
      if (l2 <= 0) { closeAppSafe(cur); toast('⏰ Se acabó el tiempo de ' + appTitle(cur) + ' por hoy'); logBlocked('tiempo', appTitle(cur) + ' (límite)'); }
      else if (l2 <= 300 && !S.warned[cur + today()]) { S.warned[cur + today()] = 1; warn('⏰ Te quedan 5 minutos de ' + appTitle(cur)); }
    }
  }
  function warn(t) {
    var el = $('#osxWarn'); if (el) el.remove();
    el = document.createElement('div'); el.id = 'osxWarn'; el.setAttribute('role', 'alert');
    el.innerHTML = '<span>' + esc(t) + '</span><button type="button">Vale</button>';
    el.querySelector('button').onclick = function () { el.remove(); };
    document.body.appendChild(el); setTimeout(function () { if (el.parentNode) el.remove(); }, 20000);
  }
  function stopScreen(kind) {
    if ($('#osxStop')) return;
    flushUsage();
    var el = document.createElement('div'); el.id = 'osxStop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<img src="' + LOGO + '" alt="Snake OS Kids">' +
      (kind === 'bed' ? '<h1>🌙 Hora de descansar</h1><p>Ahora es el horario de descanso. ¡Hasta luego!</p>' :
        '<h1>⏰ Se acabó el tiempo por hoy</h1><p>Has usado todo tu tiempo de pantalla. Mañana podrás volver a jugar.</p>') +
      '<button type="button" data-ext>🔑 Un adulto puede dar más tiempo</button>';
    document.body.appendChild(el);
    el.querySelector('[data-ext]').onclick = function () {
      askPin('PIN del adulto para dar más tiempo', 'extend').then(function (ok) {
        if (!ok) return;
        if (kind === 'bed') { chooseExtra(function (m) { S.bedOverride = Date.now() + m * 60000; el.remove(); }); return; }
        chooseExtra(function (m) {
          papi('/api/osx/kids/extend', { method: 'POST', body: { minutes: m, token: S.otok || S.token } }).then(function (p) { setPrefs(p); el.remove(); toast('✅ +' + m + ' min'); }).catch(function (e) { toast(errMsg(e)); });
        });
      });
    };
  }
  function chooseExtra(cb) {
    var m = modal('<h2>¿Cuánto tiempo más?</h2><div class="osx-seg" style="justify-content:center"><button type="button" data-m="15">+15 min</button><button type="button" data-m="30">+30 min</button><button type="button" data-m="60">+1 hora</button></div><div class="row"><button type="button" class="osx-b" data-x>Cancelar</button></div>');
    m.box.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { m.close(); cb(+b.dataset.m); }; });
    m.box.querySelector('[data-x]').onclick = m.close;
  }
  window.addEventListener('pagehide', function () { flushUsage(true); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) flushUsage(true); S.lastTick = Date.now(); });

  /* ---------------- modales y PIN ---------------- */
  function modal(html, opts) {
    opts = opts || {};
    var old = $('.osx-modal'); if (old && !opts.stack) old.remove();
    var m = document.createElement('div'); m.id = 'osxModal'; m.className = 'osx-modal' + (opts.kids ? ' kidsbg' : '');
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="box">' + html + '</div>';
    document.body.appendChild(m);
    var box = m.querySelector('.box');
    return { el: m, box: box, close: function () { if (m.parentNode) m.remove(); } };
  }
  function tokenValid() { return S.token && S.tokenExp > Date.now(); }
  function askPin(msg, purpose, raw) {
    purpose = purpose || 'parent';
    // Solo la sesión parental (5 min) evita volver a pedir el PIN, y nunca para desactivar (raw).
    if (!raw && purpose === 'parent' && tokenValid()) return Promise.resolve(true);
    return new Promise(function (res) {
      var prev = $('.osx-modal'); if (prev) prev.style.display = 'none';
      var m = document.createElement('div'); m.id = 'osxPinModal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
      m.style.zIndex = '2147483550';
      m.className = 'osx-modal'; m.innerHTML = '<div class="box" style="width:min(400px,100%);text-align:center">' +
        '<img class="logo" src="' + LOGO + '" alt="Snake OS Kids" style="width:150px"><h2>🔑 PIN del adulto</h2><p>' + esc(msg || 'Introduce el PIN') + '</p>' +
        '<input class="osx-in osx-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" aria-label="PIN">' +
        '<div class="osx-err" aria-live="polite"></div><div class="row" style="justify-content:center"><button type="button" class="osx-b" data-x>Cancelar</button><button type="button" class="osx-b pri" data-ok>Aceptar</button></div></div>';
      document.body.appendChild(m);
      var inp = m.querySelector('input'), err = m.querySelector('.osx-err');
      function done(v) { m.remove(); if (prev) prev.style.display = ''; res(v); }
      function go() {
        var pin = inp.value.trim(); if (!pin) { err.textContent = 'Escribe el PIN'; return; }
        if (raw) { done(pin); return; }
        api('/api/osx/kids/verify', { method: 'POST', body: { pin: pin, purpose: purpose || '' } }).then(function (r) {
          if ((r.scope || 'parent') === 'parent') { S.token = r.token; S.tokenExp = Date.now() + (r.ttl || 300) * 1000 - 3000; } else { S.otok = r.token; }
          done(true);
        }).catch(function (e) { err.textContent = errMsg(e); inp.value = ''; inp.focus(); });
      }
      m.querySelector('[data-ok]').onclick = go; m.querySelector('[data-x]').onclick = function () { done(false); };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); if (e.key === 'Escape') done(false); });
      setTimeout(function () { inp.focus(); }, 30);
    });
  }

  /* ---------------- editores de la configuración Kids (asistente y ajustes) ---------------- */
  function seg(name, opts, val) {
    return '<div class="osx-seg" data-seg="' + name + '">' + opts.map(function (o) { return '<button type="button" data-v="' + esc(o[0]) + '" class="' + (String(val) === String(o[0]) ? 'on' : '') + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>';
  }
  function bindSeg(root, name, cb) {
    var s = root.querySelector('[data-seg="' + name + '"]'); if (!s) return;
    s.querySelectorAll('button').forEach(function (b) { b.onclick = function () { s.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); cb(b.dataset.v); }; });
  }
  function listToText(a) { return (a || []).join('\n'); }
  function textToList(t) { return String(t || '').split(/[\s,;]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean); }
  function candidateApps() {
    return Object.keys(window.APPS || {}).filter(function (id) { return !HARD_BLOCK[id] && id !== 'ajustes' && id !== 'about' && id !== 'profile'; })
      .sort(function (a, b) { return (RATING[a] || 13) - (RATING[b] || 13) || appTitle(a).localeCompare(appTitle(b)); });
  }
  var EDITORS = {
    age: { title: '🎂 Edad', render: function (c) {
      return '<p>Las apps y juegos se filtran según la edad. Al cambiarla se proponen las apps adecuadas.</p>' + seg('age', [['<7', AGE_LABEL['<7']], ['7-12', AGE_LABEL['7-12']], ['13-16', AGE_LABEL['13-16']]], c.age);
    }, bind: function (r, c, redraw) { bindSeg(r, 'age', function (v) { c.age = v; c.apps = AGE_DEFAULT_APPS[v].slice(); if (redraw) redraw(); }); } },
    apps: { title: '🧩 Apps permitidas', render: function (c) {
      var max = AGE_MAX[c.age] || 12;
      return '<p>Toca para permitir o quitar. Las que no son para su edad aparecen tachadas. La terminal, el servidor y el escritorio remoto nunca están disponibles.</p><div class="osx-chips">' +
        candidateApps().map(function (id) {
          var r = RATING.hasOwnProperty(id) ? RATING[id] : 13, ok = r <= max;
          return '<button type="button" class="osx-chip ' + (ok ? (c.apps.indexOf(id) >= 0 ? 'on' : '') : 'na') + '" data-app-chip="' + esc(id) + '" ' + (ok ? '' : 'disabled aria-disabled="true" title="No es adecuada para esta edad"') + '>' + appIcon(id) + esc(appTitle(id)) + '</button>';
        }).join('') + '</div>';
    }, bind: function (r, c) {
      r.querySelectorAll('[data-app-chip]').forEach(function (b) { b.onclick = function () { var id = b.dataset.appChip, i = c.apps.indexOf(id); if (i >= 0) c.apps.splice(i, 1); else c.apps.push(id); b.classList.toggle('on', i < 0); }; });
    } },
    time: { title: '⏳ Tiempo de pantalla', render: function (c) {
      var L = c.limits, pa = L.per_app || {};
      return '<div class="osx-field"><label>Límite diario total</label>' + seg('daily', [[30, '30 min'], [60, '1 h'], [90, '1 h 30'], [120, '2 h'], [180, '3 h'], [0, 'Sin límite']], L.daily_min) + '</div>' +
        '<div class="osx-field"><label>Límites por app (minutos al día, vacío = sin límite)</label><div class="osx-chips">' +
        c.apps.filter(function (id) { return (window.APPS || {})[id]; }).map(function (id) { return '<label class="osx-chip" style="cursor:default">' + appIcon(id) + esc(appTitle(id)) + ' <input class="osx-in" style="width:64px;padding:4px 6px" type="number" min="0" max="720" data-pa="' + esc(id) + '" value="' + (pa[id] || '') + '"></label>'; }).join('') + '</div></div>' +
        '<div class="osx-field"><label><input type="checkbox" data-bed ' + (L.bedtime.on ? 'checked' : '') + '> Horario de descanso (no se puede usar)</label>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">de <input class="osx-in" style="width:auto" type="time" data-bf value="' + esc(L.bedtime.from) + '"> a <input class="osx-in" style="width:auto" type="time" data-bt value="' + esc(L.bedtime.to) + '"></div></div>' +
        '<p class="osx-note">5 minutos antes del final se avisa. Cuando se acaba, solo un adulto con el PIN puede dar más tiempo.</p>';
    }, bind: function (r, c) {
      bindSeg(r, 'daily', function (v) { c.limits.daily_min = +v; });
      r.querySelectorAll('[data-pa]').forEach(function (i) { i.oninput = function () { var n = parseInt(i.value, 10); if (n > 0) c.limits.per_app[i.dataset.pa] = Math.min(720, n); else delete c.limits.per_app[i.dataset.pa]; }; });
      var b = r.querySelector('[data-bed]'); b.onchange = function () { c.limits.bedtime.on = b.checked; };
      r.querySelector('[data-bf]').onchange = function (e) { c.limits.bedtime.from = e.target.value || '21:30'; };
      r.querySelector('[data-bt]').onchange = function (e) { c.limits.bedtime.to = e.target.value || '08:00'; };
    } },
    comm: { title: '💬 Chat, bots y juegos online', render: function (c) {
      return '<div class="osx-field"><label>Chat</label>' + seg('chat', [['contacts', 'Solo contactos aprobados'], ['off', 'Sin chat']], c.chat) + '</div>' +
        '<div class="osx-field"><label>Contactos aprobados (correos, uno por línea)</label><textarea class="osx-in" data-contacts placeholder="mama@ejemplo.com">' + esc(listToText(c.contacts)) + '</textarea></div>' +
        '<div class="osx-field"><label>Doganiero Bots</label>' + seg('bots', [['filter', 'Con filtro infantil'], ['off', 'Desactivado']], c.bots) + '</div>' +
        '<div class="osx-field"><label>Juegos online y multijugador</label>' + seg('online', [['block', 'Bloqueados'], ['friends', 'Solo con amigos aprobados'], ['allow', 'Permitidos']], c.online) + '</div>' +
        '<div class="osx-field"><label>Amigos aprobados para jugar (correos)</label><textarea class="osx-in" data-friends>' + esc(listToText(c.friends)) + '</textarea></div>';
    }, bind: function (r, c) {
      bindSeg(r, 'chat', function (v) { c.chat = v; }); bindSeg(r, 'bots', function (v) { c.bots = v; }); bindSeg(r, 'online', function (v) { c.online = v; });
      r.querySelector('[data-contacts]').oninput = function (e) { c.contacts = textToList(e.target.value).filter(function (x) { return x.indexOf('@') > 0; }); };
      r.querySelector('[data-friends]').oninput = function (e) { c.friends = textToList(e.target.value).filter(function (x) { return x.indexOf('@') > 0; }); };
    } },
    web: { title: '🌐 Webs permitidas', render: function (c) {
      return '<p>El navegador solo abre estas webs (y sus subdominios). Los buscadores quedan bloqueados.</p><div class="osx-field"><label>Webs (una por línea, sin https://)</label><textarea class="osx-in" data-sites style="min-height:110px">' + esc(listToText(c.sites)) + '</textarea></div>';
    }, bind: function (r, c) { r.querySelector('[data-sites]').oninput = function (e) { c.sites = textToList(e.target.value).map(function (h) { return h.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split('/')[0]; }).filter(function (h) { return /\./.test(h); }); }; } },
    other: { title: '🛡️ Tienda, archivos y cámara', render: function (c) {
      return '<div class="osx-field"><label>Tienda y compras</label>' + seg('store', [['block', 'Bloqueada'], ['pin', 'Pedir PIN del adulto']], c.store) + '</div>' +
        '<div class="osx-field"><label><input type="checkbox" data-nd ' + (c.files.no_delete ? 'checked' : '') + '> Impedir borrar archivos</label><label><input type="checkbox" data-nu ' + (c.files.no_upload ? 'checked' : '') + '> Impedir subir archivos</label></div>' +
        '<div class="osx-field"><label>Cámara, micrófono y llamadas</label>' + seg('media', [['block', 'Bloqueados'], ['ask', 'Con permiso del adulto (PIN)']], c.media) + '</div>';
    }, bind: function (r, c) {
      bindSeg(r, 'store', function (v) { c.store = v; }); bindSeg(r, 'media', function (v) { c.media = v; });
      r.querySelector('[data-nd]').onchange = function (e) { c.files.no_delete = e.target.checked; };
      r.querySelector('[data-nu]').onchange = function (e) { c.files.no_upload = e.target.checked; };
    } }
  };
  function cfgFrom(k) {
    k = k || {};
    var lim = k.limits || {};
    return {
      age: k.age || '7-12', apps: (k.apps || AGE_DEFAULT_APPS[k.age || '7-12']).slice(),
      limits: { daily_min: lim.daily_min == null ? 120 : lim.daily_min, per_app: Object.assign({}, lim.per_app || {}), bedtime: Object.assign({ on: false, from: '21:30', to: '08:00' }, lim.bedtime || {}) },
      chat: k.chat || 'contacts', contacts: (k.contacts || []).slice(), bots: k.bots || 'filter', sites: (k.sites || ['wikipedia.org', 'vikidia.org', 'rtve.es', 'nationalgeographic.com']).slice(),
      online: k.online || 'block', friends: (k.friends || []).slice(), store: k.store || 'block',
      files: Object.assign({ no_delete: true, no_upload: true }, k.files || {}), media: k.media || 'ask'
    };
  }

  /* ---------------- onboarding Kids ---------------- */
  function kidsAsk() {
    var m = modal('<img class="logo" src="' + LOGO + '" alt="Snake OS Kids"><h2 style="text-align:center">¿Activar Snake OS Kids en este perfil?</h2>' +
      '<p style="text-align:center">Es un modo para niños y niñas: interfaz más grande y de colores, solo apps adecuadas y control parental con PIN.</p>' +
      '<div class="row" style="justify-content:center"><button type="button" class="osx-b" data-no>No, gracias</button><button type="button" class="osx-b pri" data-yes>Sí, activar</button></div>' +
      '<p class="osx-note" style="text-align:center">Si dices que no, no volveremos a preguntar. Puedes activarlo cuando quieras en Ajustes → Snake OS Kids.</p>', { kids: true });
    m.box.querySelector('[data-no]').onclick = function () {
      m.close(); api('/api/osx/kids/decline', { method: 'POST', body: {} }).then(setPrefs).catch(function () {});
      try { sessionStorage.removeItem('snkosx_new:' + S.email); } catch (e) {}
    };
    m.box.querySelector('[data-yes]').onclick = function () { kidsExplain(); };
  }
  function kidsExplain() {
    var F = [['🧩', 'Apps por edad', 'Solo las apps y juegos que elijas, filtrados por edad (<7, 7-12, 13-16).'],
      ['🎨', 'Interfaz grande y de colores', 'Iconos más grandes, letras redondas y barra de colores.'],
      ['⏳', 'Tiempo de pantalla', 'Límite diario total y por app, aviso 5 min antes y pantalla de fin que solo el adulto amplía.'],
      ['🌙', 'Horario de descanso', 'Opcional: horas en las que no se puede usar.'],
      ['💬', 'Chat seguro', 'Solo con contactos aprobados, o sin chat.'],
      ['🤖', 'Doganiero Bots', 'Con filtro infantil o desactivado.'],
      ['🌐', 'Navegador con lista blanca', 'Solo las webs que apruebes; sin buscadores.'],
      ['🎮', 'Juegos online', 'Bloqueados o solo con amigos aprobados.'],
      ['🛒', 'Tienda y compras', 'Bloqueadas o con PIN del adulto.'],
      ['📁', 'Archivos', 'Sin borrar ni subir archivos.'],
      ['📷', 'Cámara, micro y llamadas', 'Bloqueados o con permiso del adulto.'],
      ['📊', 'Informe semanal', 'Uso por app e intentos bloqueados, con PIN.'],
      ['🔑', 'PIN del adulto', 'Para desactivar Kids o cambiar ajustes. Tras 5 fallos se bloquea un rato.']];
    var m = modal('<img class="logo" src="' + LOGO + '" alt="Snake OS Kids"><h2 style="text-align:center">Así funciona Snake OS Kids</h2><div class="feat">' +
      F.map(function (f) { return '<div><b>' + f[0] + ' ' + esc(f[1]) + '</b>' + esc(f[2]) + '</div>'; }).join('') + '</div>' +
      '<p><b>Ahora un adulto tiene que configurarlo</b> (son 7 pasos cortos) y crear el PIN.</p>' +
      '<div class="row"><button type="button" class="osx-b" data-back>Atrás</button><button type="button" class="osx-b pri" data-go>Empezar la configuración</button></div>', { kids: true });
    m.box.querySelector('[data-back]').onclick = kidsAsk;
    m.box.querySelector('[data-go]').onclick = function () { kidsWizard(cfgFrom(null), 0); };
  }
  var WIZ = ['age', 'apps', 'time', 'comm', 'web', 'other', 'pin'];
  function kidsWizard(c, step) {
    var key = WIZ[step], last = step === WIZ.length - 1;
    var body = key === 'pin' ?
      '<h2>🔑 PIN del adulto</h2><p>Con este PIN se desactiva Snake OS Kids y se cambian los ajustes parentales. Que no lo vea el niño o la niña.</p>' +
      '<div class="osx-field"><label>PIN (4 a 8 números)</label><input class="osx-in osx-pin" type="password" inputmode="numeric" maxlength="8" data-p1 autocomplete="new-password"></div>' +
      '<div class="osx-field"><label>Repite el PIN</label><input class="osx-in osx-pin" type="password" inputmode="numeric" maxlength="8" data-p2 autocomplete="new-password"></div>'
      : '<h2>' + EDITORS[key].title + '</h2>' + EDITORS[key].render(c);
    var m = modal('<img class="logo" src="' + LOGO_WIDE + '" alt="Snake OS Kids" style="width:min(260px,70%)"><div class="steps">' + WIZ.map(function (_, i) { return '<i class="' + (i <= step ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
      '<p class="osx-note" style="text-align:center">Configuración del adulto · paso ' + (step + 1) + ' de ' + WIZ.length + '</p>' + body +
      '<div class="osx-err" aria-live="polite"></div><div class="row">' + (step ? '<button type="button" class="osx-b" data-back>Atrás</button>' : '<button type="button" class="osx-b" data-back>Volver</button>') +
      '<button type="button" class="osx-b ' + (last ? 'ok' : 'pri') + '" data-next>' + (last ? '✅ Activar Snake OS Kids' : 'Siguiente') + '</button></div>', { kids: true });
    if (key !== 'pin') EDITORS[key].bind(m.box, c, function () { kidsWizard(c, step); });
    m.box.querySelector('[data-back]').onclick = function () { if (step) kidsWizard(c, step - 1); else kidsExplain(); };
    var err = m.box.querySelector('.osx-err');
    m.box.querySelector('[data-next]').onclick = function () {
      if (key === 'apps' && !c.apps.length) { err.textContent = 'Elige al menos una app'; return; }
      if (!last) { kidsWizard(c, step + 1); return; }
      var p1 = m.box.querySelector('[data-p1]').value.trim(), p2 = m.box.querySelector('[data-p2]').value.trim();
      if (!/^\d{4,8}$/.test(p1)) { err.textContent = 'El PIN tiene que tener entre 4 y 8 números'; return; }
      if (p1 !== p2) { err.textContent = 'Los dos PIN no coinciden'; return; }
      var btn = this; btn.disabled = true;
      api('/api/osx/kids/setup', { method: 'POST', body: { pin: p1, pin2: p2, config: c, on: true } }).then(function (r) {
        S.token = ''; S.tokenExp = 0; setPrefs(r.prefs); m.close();
        try { sessionStorage.removeItem('snkosx_new:' + S.email); } catch (e) {}
        kidsDone();
      }).catch(function (e) { btn.disabled = false; err.textContent = errMsg(e); });
    };
  }
  function kidsDone() {
    var m = modal('<img class="logo" src="' + LOGO + '" alt="Snake OS Kids"><h2 style="text-align:center">¡Snake OS Kids está activado! 🎉</h2><p style="text-align:center">Los ajustes parentales están en <b>Ajustes → Snake OS Kids</b> (con el PIN). También puedes tocar el logo de Kids en la barra de tareas.</p><div class="row" style="justify-content:center"><button type="button" class="osx-b pri" data-ok>¡A jugar!</button></div>', { kids: true });
    m.box.querySelector('[data-ok]').onclick = m.close;
  }
  function maybeAskKids() {
    if (!S.prefs || !S.email || S.prefs.kids.asked || S.prefs.kids.on || $('.osx-modal')) return;
    var isNew = false; try { isNew = sessionStorage.getItem('snkosx_new:' + S.email) === '1'; } catch (e) {}
    if (!isNew) return;
    var u = cu(); if (!u || u.setupDone === false || u.tutorialDone === false) return;
    if ($('#osTutorial,#lock:not(.hidden),#snkSaver')) return;
    var pl = document.getElementById('poweroffLoading'); if (pl && pl.getAttribute('aria-hidden') === 'false') return;
    kidsAsk();
  }
  window.snkOsxProfileReady = function () { try { if (S.email) sessionStorage.setItem('snkosx_new:' + S.email, '1'); } catch (e) {} setTimeout(maybeAskKids, 600); };

  /* ---------------- paneles de Ajustes ---------------- */
  function openSettings(sec) {
    if (window.snakeOpenSettings) window.snakeOpenSettings(sec); else if (window.openApp) window.openApp('ajustes');
  }
  function card(title, desc, inner) { return '<div class="osx-card"><h4>' + title + '</h4>' + (desc ? '<p>' + desc + '</p>' : '') + inner + '</div>'; }
  function panelScreen(el) {
    var b = S.prefs.brightness;
    el.innerHTML = card('🔆 Brillo de la pantalla', 'También con las teclas <b>F5</b> (bajar) y <b>F6</b> (subir), de 10 en 10. Se guarda en tu perfil.',
      '<input type="range" class="osx-range" min="20" max="100" step="10" value="' + b + '" aria-label="Brillo"><div class="osx-note" data-v>' + b + '%</div>');
    var r = el.querySelector('input'); r.oninput = function () { setBrightness(+r.value); el.querySelector('[data-v]').textContent = r.value + '%'; };
  }
  function panelSaver(el) {
    var p = S.prefs.screensaver, stops = [];
    function cleanup() { stops.forEach(function (f) { try { f(); } catch (e) {} }); stops = []; }
    function draw() {
      cleanup();
      el.innerHTML = card('⏱️ Activar tras', 'Tiempo sin usar el ordenador antes de que salga el salvapantallas.', seg('sst', TIMEOUTS, p.timeout)) +
        card('🖼️ Salvapantallas', work() ? 'En modo trabajo se usa siempre un reloj estático y ligero.' : 'Toca uno para elegirlo. Debajo tienes la vista previa.',
          '<div class="osx-savers">' + SAVERS.map(function (s) { return '<button type="button" class="osx-saver ' + (s.id === p.id ? 'on' : '') + '" data-sid="' + s.id + '" title="' + esc(s.desc) + '"><div class="pv"></div><span class="nm">' + esc(s.name) + '</span></button>'; }).join('') + '</div>') +
        card('👀 Vista previa', esc((SAVERS.filter(function (s) { return s.id === p.id; })[0] || SAVERS[0]).desc), '<div class="osx-bigpv"></div><div style="margin-top:8px"><button type="button" class="snk4a-btn" data-test>Probar ahora</button></div>');
      bindSeg(el, 'sst', function (v) { p.timeout = +v; writeLocal(); applySaver(); push({ screensaver: { timeout: +v } }); });
      var ss = window.snkScreensaver;
      el.querySelectorAll('[data-sid]').forEach(function (b) {
        if (ss && ss.preview) stops.push(ss.preview(b.querySelector('.pv'), b.dataset.sid, true));
        b.onclick = function () { p.id = b.dataset.sid; writeLocal(); applySaver(); push({ screensaver: { id: p.id } }); draw(); };
      });
      if (ss && ss.preview) stops.push(ss.preview(el.querySelector('.osx-bigpv'), work() ? 'static' : p.id, false));
      el.querySelector('[data-test]').onclick = function () { if (ss) ss.show(true); };
    }
    el._draw = draw;
    draw();
    var mo = new MutationObserver(function () { if (!document.body.contains(el)) { cleanup(); mo.disconnect(); } });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  function panelWork(el) {
    var w = S.prefs.work;
    function draw() {
      var on = work();
      el.innerHTML = (kids() ? card('💼 Modo trabajo', 'No está disponible mientras Snake OS Kids esté activado.', '') :
        card('💼 Modo trabajo', 'Fondo negro con grises (bloqueado mientras esté activo), sin animaciones, desenfoques ni sonidos, salvapantallas estático y se cierran los juegos. También desde el botón 💼 de la barra de tareas.',
          '<button type="button" class="snk4a-btn" data-tog>' + (on ? 'Desactivar modo trabajo' : 'Activar modo trabajo') + '</button>' + (S.perfNote ? '<p class="osx-note" style="margin-top:8px">' + esc(S.perfNote) + '</p>' : '')) +
        card('🧰 Apps del dock de trabajo', 'Aparecen en la barra de tareas con el modo trabajo.', '<div class="osx-chips">' +
          Object.keys(window.APPS || {}).filter(function (id) { return LEISURE.indexOf(id) < 0; }).map(function (id) { return '<button type="button" class="osx-chip ' + (w.apps.indexOf(id) >= 0 ? 'on' : '') + '" data-wa="' + esc(id) + '">' + appIcon(id) + esc(appTitle(id)) + '</button>'; }).join('') + '</div>') +
        card('🔌 Conectar apps para el trabajo', 'Añade accesos a tus herramientas. Se abren en una pestaña nueva con tu sesión.', '<div class="osx-chips">' +
          WORK_PRESETS.map(function (pr, i) { var has = w.links.some(function (l) { return l.url === pr.url; }); return '<button type="button" class="osx-chip ' + (has ? 'on' : '') + '" data-pre="' + i + '">' + pr.icon + ' ' + esc(pr.name) + '</button>'; }).join('') + '</div>') +
        card('🔗 Enlaces web personalizados', '', '<ul class="osx-list">' + (w.links.length ? w.links.map(function (l, i) { return '<li><span>' + esc(l.icon || '🔗') + ' <b>' + esc(l.name) + '</b> <span class="osx-note">' + esc(l.url) + '</span></span><button type="button" class="snk4a-btn" data-del="' + i + '">Quitar</button></li>'; }).join('') : '<li><span class="osx-note">Todavía no hay enlaces</span></li>') + '</ul>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><input class="osx-in" style="flex:1 1 120px" data-ln placeholder="Nombre"><input class="osx-in" style="flex:2 1 180px" data-lu placeholder="https://..."><button type="button" class="snk4a-btn" data-add>Añadir</button></div><div class="osx-err" data-lerr></div>'));
      var t = el.querySelector('[data-tog]'); if (t) t.onclick = function () { setWork(!work()); draw(); };
      el.querySelectorAll('[data-wa]').forEach(function (b) { b.onclick = function () { var id = b.dataset.wa, i = w.apps.indexOf(id); if (i >= 0) w.apps.splice(i, 1); else w.apps.push(id); b.classList.toggle('on', i < 0); writeLocal(); paintDock(); push({ work: { apps: w.apps } }); }; });
      el.querySelectorAll('[data-pre]').forEach(function (b) { b.onclick = function () { var pr = WORK_PRESETS[+b.dataset.pre], i = w.links.findIndex(function (l) { return l.url === pr.url; }); if (i >= 0) w.links.splice(i, 1); else w.links.push({ name: pr.name, url: pr.url, icon: pr.icon }); saveLinks(); draw(); }; });
      el.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { w.links.splice(+b.dataset.del, 1); saveLinks(); draw(); }; });
      var add = el.querySelector('[data-add]'); if (add) add.onclick = function () {
        var n = el.querySelector('[data-ln]').value.trim(), u = el.querySelector('[data-lu]').value.trim();
        if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
        try { var pu = new URL(u); if (!/^https?:$/.test(pu.protocol)) throw 0; } catch (e) { el.querySelector('[data-lerr]').textContent = 'La dirección no es válida'; return; }
        w.links.push({ name: n || new URL(u).hostname, url: u, icon: '🔗' }); saveLinks(); draw();
      };
    }
    function saveLinks() { writeLocal(); paintDock(); push({ work: { links: w.links } }); }
    el._draw = draw;
    draw();
  }
  function relockParent() { var had = !!S.token; S.token = ''; S.tokenExp = 0; if (had) api('/api/osx/kids/lock', { method: 'POST' }).catch(function () {}); }
  function mailCard(box) {
    if (!box) return;
    function draw(t) {
      var r = (S.prefs.kids && S.prefs.kids.report) || {};
      var opts = [t.profile_email].concat(S._acc || []).concat(r.to ? [r.to] : []).map(function (x) { return String(x || '').toLowerCase(); }).filter(function (x, i, a) { return x && !/@(gmail|googlemail)\.com$/.test(x) && a.indexOf(x) === i; });
      box.innerHTML =
        (r.to ? '<p style="margin:0 0 8px"><b>Destino:</b> ' + esc(r.to) + ' · ' + (r.verified ? '✅ verificado' : (r.pending ? '⏳ falta el código' : '⚠️ sin verificar')) + (r.last_sent ? ' · último envío ' + new Date(r.last_sent * 1000).toLocaleDateString('es-ES') : '') + '</p>' : '') +
        '<div class="osx-field"><label for="osxMailSel">Cuenta Dogaemail del adulto</label>' +
        '<select class="osx-in" id="osxMailSel" data-msel>' + opts.map(function (e) { return '<option value="' + esc(e) + '"' + (e === r.to ? ' selected' : '') + '>' + esc(e) + '</option>'; }).join('') + '<option value="">Otra cuenta…</option></select>' +
        '<input class="osx-in" data-mother type="email" placeholder="adulto@dogaemail.com" style="margin-top:6px;display:none" aria-label="Otra cuenta Dogaemail"></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="snk4a-btn" data-msend>' + (r.to ? 'Enviar código otra vez' : 'Enviar código de verificación') + '</button></div>' +
        (r.pending ? '<div class="osx-field"><label for="osxMailCode">Código de 6 cifras (llega a las notificaciones de esa cuenta)</label><div style="display:flex;gap:8px;flex-wrap:wrap"><input class="osx-in" id="osxMailCode" data-mcode inputmode="numeric" maxlength="6" placeholder="123456" style="max-width:160px"><button type="button" class="snk4a-btn" data-mver>Verificar</button></div></div>' : '') +
        (r.verified ? '<label style="display:flex;align-items:center;margin-top:10px"><input type="checkbox" data-mweek ' + (r.weekly ? 'checked' : '') + '>Enviar el resumen cada domingo</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button type="button" class="snk4a-btn" data-mtest>Enviar resumen de prueba</button><button type="button" class="snk4a-btn" data-mrm>Quitar correo</button></div>' : '') +
        '<p class="osx-note" style="margin-top:8px">Gmail no está disponible: ' + esc(t.gmail_reason || 'Snake OS no puede enviar a Gmail.') + '</p><div class="osx-err" data-merr aria-live="polite"></div>';
      var sel = box.querySelector('[data-msel]'), oth = box.querySelector('[data-mother]'), err = box.querySelector('[data-merr]');
      function pick() { return (sel.value || oth.value || '').trim(); }
      sel.onchange = function () { oth.style.display = sel.value ? 'none' : ''; if (!sel.value) oth.focus(); };
      if (!opts.length) { sel.value = ''; oth.style.display = ''; }
      function call(p, body, okMsg) {
        err.textContent = '';
        if (!tokenValid()) { err.textContent = 'La sesión parental ha caducado: vuelve a escribir el PIN.'; return; }
        return papi(p, { method: 'POST', body: Object.assign({ token: S.token }, body || {}) }).then(function (res) {
          var pr = res && res.prefs ? res.prefs : (res && res.kids ? res : null); if (pr) setPrefs(pr); if (okMsg) toast(okMsg); draw(t); return res;
        }).catch(function (e) { err.textContent = errMsg(e); });
      }
      box.querySelector('[data-msend]').onclick = function () { var e = pick(); if (!e) { err.textContent = 'Elige o escribe la cuenta Dogaemail del adulto'; return; } call('/api/osx/kids/report-to', { email: e }, '📨 Código enviado a las notificaciones de ' + e); };
      var v = box.querySelector('[data-mver]'); if (v) v.onclick = function () { call('/api/osx/kids/report-verify', { code: box.querySelector('[data-mcode]').value.trim() }, '✅ Correo verificado'); };
      var wk = box.querySelector('[data-mweek]'); if (wk) wk.onchange = function () { call('/api/osx/kids/report-settings', { weekly: wk.checked }); };
      var ts = box.querySelector('[data-mtest]'); if (ts) ts.onclick = function () { call('/api/osx/kids/report-test', {}, '📊 Resumen de prueba enviado'); };
      var rm = box.querySelector('[data-mrm]'); if (rm) rm.onclick = function () { call('/api/osx/kids/report-settings', { remove: true }, 'Correo quitado'); };
    }
    Promise.all([papi('/api/osx/kids/report-targets'), api('/api/added-accounts').catch(function () { return { accounts: [] }; })]).then(function (a) {
      S._acc = ((a[1] && a[1].accounts) || []).map(function (x) { return String((x && x.email) || ''); });
      draw(a[0] || {});
    }).catch(function (e) { box.textContent = errMsg(e); });
  }
  function panelKids(el) {
    var k = S.prefs.kids;
    if (!k.on) {
      el.innerHTML = '<div class="osx-panel">' + card('<img class="osx-kidslogo" src="' + LOGO + '" alt="Snake OS Kids">', 'Modo para niños y niñas con control parental: apps por edad, tiempo de pantalla, chat seguro, webs permitidas, juegos online, tienda, archivos, cámara e informe semanal. Todo protegido con un PIN de adulto.',
        '<button type="button" class="snk4a-btn" data-on>' + (k.has_pin ? 'Activar Snake OS Kids (PIN)' : 'Activar y configurar Snake OS Kids') + '</button>') + '</div>';
      el.querySelector('[data-on]').onclick = function () {
        if (!k.has_pin) { kidsExplain(); return; }
        askPin('PIN del adulto para activar Snake OS Kids').then(function (ok) { if (!ok) return; papi('/api/osx/kids/enable', { method: 'POST', body: { token: S.token } }).then(function (p) { setPrefs(p); panelKids(el); toast('🧸 Snake OS Kids activado'); }).catch(function (e) { toast(errMsg(e)); }); });
      };
      return;
    }
    if (!tokenValid()) {
      el.innerHTML = '<div class="osx-panel">' + card('<img class="osx-kidslogo" src="' + LOGO + '" alt="Snake OS Kids">', 'Control parental. Para ver el informe o cambiar los ajustes hace falta el PIN del adulto.',
        '<button type="button" class="snk4a-btn" data-unl>🔑 Introducir PIN del adulto</button>') + '</div>';
      el.querySelector('[data-unl]').onclick = function () { askPin('PIN del adulto para el control parental').then(function (ok) { if (ok) panelKids(el); }); };
      return;
    }
    var c = cfgFrom(k);
    el.innerHTML = '<div class="osx-panel"><img class="osx-kidslogo" src="' + LOGO_WIDE + '" alt="Snake OS Kids">' +
      card('📊 Informe de la semana', 'Uso de los últimos 7 días e intentos bloqueados.', '<div data-rep class="osx-note">Cargando…</div>') +
      Object.keys(EDITORS).map(function (key) { return card(EDITORS[key].title, '', '<div data-ed="' + key + '"></div>'); }).join('') +
      card('💾 Guardar', 'Solo se guardan con la sesión parental activa (5 minutos tras escribir el PIN).', '<button type="button" class="snk4a-btn" data-save>Guardar ajustes parentales</button><p class="osx-note" data-sess style="margin-top:8px"></p><div class="osx-err" data-serr></div>') +
      card('📧 Resumen semanal por correo', 'Cada domingo por la tarde se envía el uso por app y los intentos bloqueados a la cuenta Dogaemail del adulto (llega a sus notificaciones de Snake OS).', '<div data-mail>Cargando…</div>') +
      card('🔑 PIN y modo Kids', '', '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="snk4a-btn" data-chpin>Cambiar PIN</button><button type="button" class="snk4a-btn" data-off>Desactivar Snake OS Kids</button><button type="button" class="snk4a-btn" data-lock>Bloquear el panel</button></div>') + '</div>';
    function drawEd(key) { var box = el.querySelector('[data-ed="' + key + '"]'); box.innerHTML = EDITORS[key].render(c); EDITORS[key].bind(box, c, function () { drawEd('age'); drawEd('apps'); drawEd('time'); }); }
    Object.keys(EDITORS).forEach(drawEd);
    // Sesión parental: cuenta atrás visible; se cierra sola al caducar, al salir del panel o al cerrar Ajustes.
    clearInterval(el._sessT);
    el._sessT = setInterval(function () {
      if (!document.body.contains(el) || !el.querySelector('[data-save]')) { clearInterval(el._sessT); relockParent(); return; }
      var left = Math.max(0, Math.round((S.tokenExp - Date.now()) / 1000)), sn = el.querySelector('[data-sess]');
      if (sn) sn.textContent = '🔓 Sesión parental activa · se bloquea sola en ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
      if (!left) { clearInterval(el._sessT); relockParent(); panelKids(el); }
    }, 1000);
    mailCard(el.querySelector('[data-mail]'));
    papi('/api/osx/kids/report').then(function (r) {
      var max = Math.max.apply(null, r.days.map(function (d) { return d.seconds; }).concat([60]));
      var dn = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
      el.querySelector('[data-rep]').innerHTML = '<b>Total: ' + fmtMin(r.total_seconds) + '</b> · ' + r.blocked_total + ' intentos bloqueados' +
        '<div class="osx-bars">' + r.days.map(function (d) { var dt = new Date(d.day + 'T12:00:00'); return '<div title="' + d.day + ': ' + fmtMin(d.seconds) + '"><span>' + Math.round(d.seconds / 60) + '′</span><i style="height:' + Math.max(2, Math.round(d.seconds / max * 90)) + 'px"></i><span>' + dn[dt.getDay()] + '</span></div>'; }).join('') + '</div>' +
        '<h4 style="margin:10px 0 4px">Por app</h4><ul class="osx-list">' + (r.apps.length ? r.apps.slice(0, 10).map(function (a) { return '<li><span>' + appIcon(a.app) + ' ' + esc(appTitle(a.app)) + '</span><b>' + fmtMin(a.seconds) + '</b></li>'; }).join('') : '<li>Sin uso todavía</li>') + '</ul>' +
        '<h4 style="margin:10px 0 4px">Intentos bloqueados</h4><ul class="osx-list">' + (r.blocked_recent.length ? r.blocked_recent.slice(0, 12).map(function (b) { var d = new Date(b.at * 1000); return '<li><span>🚫 <b>' + esc(b.what) + '</b> ' + esc(b.detail) + '</span><span class="osx-note">' + d.toLocaleDateString('es-ES', { weekday: 'short' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) + '</span></li>'; }).join('') : '<li>Ninguno</li>') + '</ul>';
    }).catch(function (e) { el.querySelector('[data-rep]').textContent = errMsg(e); });
    function saveNow() {
      papi('/api/osx/prefs', { method: 'PUT', body: { kids: c, token: S.token } }).then(function (p) { setPrefs(p); el.querySelector('[data-serr]').textContent = ''; toast('✅ Ajustes parentales guardados'); })
        .catch(function (e) { el.querySelector('[data-serr]').textContent = errMsg(e); if (/PIN/.test(errMsg(e))) { S.token = ''; S.tokenExp = 0; } });
    }
    el.querySelector('[data-save]').onclick = function () {
      if (tokenValid()) { saveNow(); return; }
      askPin('La sesión parental ha caducado. PIN del adulto para guardar', 'parent').then(function (ok) { if (ok) saveNow(); });
    };
    el.querySelector('[data-lock]').onclick = function () { relockParent(); panelKids(el); };
    el.querySelector('[data-off]').onclick = function () {
      askPin('Confirma con el PIN para desactivar Snake OS Kids', 'parent', true).then(function (pin) {
        if (!pin) return; papi('/api/osx/kids/disable', { method: 'POST', body: { token: S.token, pin: pin } }).then(function (p) { setPrefs(p); panelKids(el); toast('Snake OS Kids desactivado'); }).catch(function (e) { toast(errMsg(e)); });
      });
    };
    el.querySelector('[data-chpin]').onclick = function () {
      var m = modal('<h2>🔑 Cambiar PIN</h2><div class="osx-field"><label>Nuevo PIN (4 a 8 números)</label><input class="osx-in osx-pin" type="password" inputmode="numeric" maxlength="8" data-p1></div><div class="osx-field"><label>Repite el PIN</label><input class="osx-in osx-pin" type="password" inputmode="numeric" maxlength="8" data-p2></div><div class="osx-err"></div><div class="row"><button type="button" class="osx-b" data-x>Cancelar</button><button type="button" class="osx-b pri" data-ok>Guardar</button></div>');
      m.box.querySelector('[data-x]').onclick = m.close;
      m.box.querySelector('[data-ok]').onclick = function () {
        var p1 = m.box.querySelector('[data-p1]').value.trim(), p2 = m.box.querySelector('[data-p2]').value.trim();
        papi('/api/osx/kids/setup', { method: 'POST', body: { pin: p1, pin2: p2, config: c, on: true, token: S.token } }).then(function (r) { S.token = r.token; S.tokenExp = Date.now() + (r.ttl || 300) * 1000 - 3000; setPrefs(r.prefs); m.close(); toast('✅ PIN cambiado'); })
          .catch(function (e) { m.box.querySelector('.osx-err').textContent = errMsg(e); });
      };
    };
  }
  function panel(id) {
    var el = document.createElement('div'); el.className = 'osx-panel'; el.dataset.osx = id;
    if (!S.prefs) { el.textContent = 'Inicia sesión para ver estos ajustes.'; return el; }
    ({ 'osx-screen': panelScreen, 'osx-saver': panelSaver, 'osx-work': panelWork, 'osx-kids': panelKids }[id] || function () {})(el);
    return el;
  }
  function settingsVisible(secId) {
    if (!kids()) return true;
    return ['apariencia', 'pantalla', 'salvapantallas', 'sonido', 'accesibilidad', 'kids', 'acerca'].indexOf(secId) >= 0;
  }

  /* ---------------- aplicar todo y ciclo de vida ---------------- */
  function applyAll() {
    css(); ensureTaskbarBits();
    applyBrightness(); applyWork(); applySaver();
    var kOn = !!kids();
    document.body.classList.toggle('osx-kids', kOn);
    window.__snakeOsKids = kOn;
    kidsHideStyle();
    if (kOn) { var ws = document.querySelectorAll('.app-window'); ws.forEach(function (w) { var id = w.id.replace(/^win-/, ''); if (!kidAllowed(id)) closeAppSafe(id); }); }
    if (kOn && !S.kidsTimer) { S.lastTick = Date.now(); S.kidsTimer = setInterval(kidsTick, 5000); }
    if (!kOn && S.kidsTimer) { clearInterval(S.kidsTimer); S.kidsTimer = null; var st = $('#osxStop'); if (st) st.remove(); }
  }
  function onUser(u) {
    var email = u && u.email ? String(u.email).toLowerCase() : '';
    if (email === S.email) return;
    if (S.email) flushUsage(true);
    S.email = email; S.token = ''; S.tokenExp = 0; S.unsent = {}; S.warned = {}; S.storeOk = 0; S.bedOverride = 0;
    if (!email) { S.prefs = null; document.body.classList.remove('osx-work', 'osx-kids'); applyBrightnessReset(); kidsHideStyle(); return; }
    try { if (u.tutorialDone === false || u.setupDone === false || u.tutorial_done === false || u.setup_done === false) sessionStorage.setItem('snkosx_new:' + email, '1'); } catch (e) {}
    S.prefs = readLocal() || defaults(); applyAll();
    pull().then(function () { setTimeout(maybeAskKids, 1200); });
  }
  function applyBrightnessReset() { var el = $('#osxDim'); if (el) el.style.opacity = '0'; }
  function start() {
    css();
    setInterval(function () {
      onUser(cu());
      if (S.email) {
        if (!$('#osxWorkDock') || !$('#tbWorkBtn') || !$('#qsWork')) ensureTaskbarBits();
        if (work()) fitDock();
        if (kids()) kidsHideStyle();
        maybeAskKids();
      }
    }, 1000);
    setInterval(function () { if (S.email && !document.hidden && !S.pushT) pull(); }, 120000);
  }
  window.snkOsx = {
    panel: panel, settingsVisible: settingsVisible, setWork: setWork, isWork: work, isKids: function () { return !!kids(); },
    setBrightness: setBrightness, prefs: function () { return S.prefs; }, askKids: kidsAsk,
    showBrightnessOsd: function (hold) { osd.hold = !!hold; osd(S.prefs ? S.prefs.brightness : 100); },
    hideBrightnessOsd: function () { osd.hold = false; var e = $('#osxOsd'); if (e) e.classList.remove('on'); },
    setPerfNote: function (t) { S.perfNote = t; },
    refresh: function () { return pull(); },
    lockParent: function () { relockParent(); S.otok = ''; },
    logos: { square: LOGO, wide: LOGO_WIDE }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
