/* Snake OS · Gran actualización · tanda 4a (2026-10-09): Ajustes, Calendario y mejoras en Notas,
   Explorador, Code Lab, Doganiero AI, Calculadora, Perfil y pantalla de bloqueo.
   Archivo independiente: solo añade cosas encima de las apps existentes; si algo falla, cada app
   vuelve a su versión original. */
(function () {
  'use strict';
  if (window.__snk4a) return;
  window.__snk4a = true;

  // Única fuente: window.SNAKE_OS_VERSION (index.html, que nunca se cachea).
  var SNK_VERSION = 'Snake OS ' + (window.SNAKE_OS_VERSION || '2026.12');

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function cu() { try { return (typeof currentUser !== 'undefined' && currentUser) || window.currentUser || null; } catch (e) { return window.currentUser || null; } }
  function email() { var u = cu(); return u && u.email ? String(u.email).toLowerCase() : ''; }
  function lsKey(k) { return 'snk4a:' + k + ':' + email(); }
  function lsGet(k, d) { try { var v = localStorage.getItem(lsKey(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(lsKey(k), JSON.stringify(v)); } catch (e) {} }
  function isPhone() { return !!(document.body && document.body.classList.contains('phone-mode')); }
  function toast(msg, ms) {
    try { if (window.snakeNotifSound) window.snakeNotifSound(); } catch (eS) {}
    var el = $('snk4aToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'snk4aToast';
      el.className = 'snk4a-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    var call = document.querySelector('.dc-call-banner:not([hidden]), .dc-call-mini');
    el.classList.toggle('above-call', !!(call && call.getClientRects().length && getComputedStyle(call).display !== 'none'));
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, ms || 1900);
  }
  function apiCall(path, opts) {
    if (typeof window.api === 'function') return window.api(path, opts);
    return Promise.reject(new Error('api no disponible'));
  }
  function fmtBytes(b) {
    b = +b || 0;
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1).replace('.', ',') + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
    return (b / 1073741824).toFixed(2).replace('.', ',') + ' GB';
  }
  function madridNow() { return new Date(); }
  function downloadText(name, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name || 'archivo.txt';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { try { a.remove(); URL.revokeObjectURL(url); } catch (e) {} }, 400);
      return true;
    } catch (e) { return false; }
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        ta.remove();
        if (ok) res(); else rej(new Error('copy'));
      } catch (e) { rej(e); }
    });
  }

  var CSS = [];
  function addCss(s) { CSS.push(s); }
  function flushCss() {
    var st = $('snk4a-css');
    if (!st) { st = document.createElement('style'); st.id = 'snk4a-css'; document.head.appendChild(st); }
    st.textContent = CSS.join('\n');
  }
  addCss(
    '.snk4a-toast{position:fixed;left:50%;bottom:84px;transform:translate(-50%,10px);z-index:11790;padding:9px 16px;border-radius:999px;background:rgba(10,20,14,0.92);color:#eafff1;' +
      'font-size:0.82rem;font-weight:600;border:1px solid rgba(157,255,194,0.35);box-shadow:0 8px 24px rgba(0,0,0,0.4);opacity:0;pointer-events:none;transition:opacity .2s ease,transform .25s ease;max-width:90vw;}' +
    '.snk4a-toast.show{opacity:1;transform:translate(-50%,0);}' +
    '.snk4a-toast.above-call{bottom:150px;}' +
    /* Capas: menú contextual, selector y tooltip por debajo de llamadas (12000) y vídeo (11950) */
    '#snkCtxMenu{z-index:11800 !important;}#snkSwitcher{z-index:11810 !important;}#snkTip{z-index:11820 !important;}' +
    /* Revisión final: etiquetas del escritorio legibles en tema claro */
    'body.theme-light .desktop-icon .lb{color:#0d2818;text-shadow:0 1px 2px rgba(255,255,255,0.85),0 0 6px rgba(255,255,255,0.6);}' +
    /* Móvil 351-379 px: el botón Inicio solo con logo para que quepa el reloj */
    '@media (max-width:379px){body.phone-mode #startBtn{font-size:0 !important;gap:0;padding:6px !important;}body.phone-mode #startBtn .start-btn-logo{margin:0;}}' +
    /* Teléfono: pestañas desplazables en pantallas estrechas */
    '.dph-tabs{overflow-x:auto;scrollbar-width:none;}.dph-tabs::-webkit-scrollbar{display:none;}@media (max-width:380px){.dph-tabs{gap:4px !important;padding:8px 6px !important;}.dph-tabs>.dph-tab{flex:1 0 auto !important;padding:6px 5px !important;font-size:.72rem !important;}}@media (max-width:350px){.dph-tabs>.dph-tab{font-size:.66rem !important;padding:6px 3px !important;}}' +
    '.snk4a-btn{margin:0;width:auto;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:34px;padding:6px 12px;border-radius:10px;font-size:0.8rem;font-weight:700;cursor:pointer;' +
      'background:var(--input-bg,rgba(255,255,255,0.08));color:var(--text,#fff);border:1px solid var(--input-border,rgba(255,255,255,0.2));transition:background .15s ease,transform .1s ease;}' +
    '.snk4a-btn:hover{border-color:var(--accent,#34d17a);}' +
    '.snk4a-btn:active{transform:scale(0.96);}' +
    '.snk4a-btn.primary{background:linear-gradient(135deg,var(--accent,#34d17a),var(--accent-strong,#1f9e57));color:#04170c;border-color:transparent;}' +
    '.snk4a-btn.danger{color:#ff8a7a;}' +
    'body.light .snk4a-btn.danger,body.theme-light .snk4a-btn.danger{color:#c0392b;}' +
    '.snk4a-btn.on{border-color:var(--accent,#34d17a);box-shadow:0 0 0 2px rgba(52,209,122,0.3);}' +
    '.snk4a-input{margin:0;width:100%;box-sizing:border-box;min-height:36px;padding:7px 11px;border-radius:10px;font-size:0.85rem;background:var(--input-bg,rgba(255,255,255,0.08));' +
      'color:var(--text,#fff);border:1px solid var(--input-border,rgba(255,255,255,0.2));}' +
    '.snk4a-empty{padding:22px 10px;text-align:center;font-size:0.85rem;opacity:0.75;line-height:1.5;}' +
    '.snk4a-empty .big{display:block;font-size:2rem;margin-bottom:6px;}' +
    'body.phone-mode .snk4a-btn{min-height:40px;}' +
    'body.phone-mode .snk4a-input{min-height:44px;font-size:16px;}'
  );

  /* Registro de apps nuevas y envoltorios seguros de las existentes */
  var NEW_APPS = [];
  function registerApp(id, def) { NEW_APPS.push({ id: id, def: def }); }
  var WRAPS = [];
  function wrapApp(id, fn) { WRAPS.push({ id: id, fn: fn }); }
  var AFTER = [];
  function afterInstall(fn) { AFTER.push(fn); }

  function getApps() {
    try { if (typeof APPS !== 'undefined' && APPS) return APPS; } catch (e) {}
    return window.APPS || null;
  }

  function installAll() {
    var apps = getApps();
    if (!apps) return false;
    flushCss();
    var added = false;
    NEW_APPS.forEach(function (a) {
      if (!apps[a.id]) { apps[a.id] = a.def; added = true; }
    });
    WRAPS.forEach(function (w) {
      var app = apps[w.id];
      if (!app || app.__snk4a) return;
      var orig = app.render;
      if (typeof orig !== 'function') return;
      app.__snk4a = true;
      app.render = function (body) {
        try {
          var r = w.fn(body, orig);
          return typeof r === 'function' ? r : function () {};
        } catch (err) {
          try { console.warn('[snk4a] ' + w.id + ' vuelve a la versión original', err); } catch (e1) {}
          try { body.innerHTML = ''; } catch (e2) {}
          return orig(body);
        }
      };
    });
    /* Si el escritorio ya estaba montado, añadir los iconos nuevos */
    if (added) {
      try {
        if (document.querySelector('#iconLayer .desktop-icon') && typeof buildIcons === 'function') buildIcons();
        if (typeof buildStartMenu === 'function' && document.querySelector('#startMenu .start-item')) buildStartMenu();
      } catch (eB) {}
    }
    try {
      if (typeof APP_OPEN_ALIASES !== 'undefined' && APP_OPEN_ALIASES) {
        if (!APP_OPEN_ALIASES.ajustes) APP_OPEN_ALIASES.ajustes = ['ajustes', 'configuración', 'configuracion', 'settings', 'preferencias'];
        if (!APP_OPEN_ALIASES.calendario) APP_OPEN_ALIASES.calendario = ['calendario', 'agenda', 'calendar', 'eventos del calendario'];
        if (!APP_OPEN_ALIASES.capturas) APP_OPEN_ALIASES.capturas = ['capturas', 'capturas de pantalla', 'screenshots', 'galería de capturas', 'galeria de capturas'];
      }
    } catch (eA) {}
    AFTER.forEach(function (fn) { try { fn(apps); } catch (eF) {} });
    return true;
  }

  /* =================== App nueva: Ajustes =================== */
  function currentChanges() {
    // Fuente única: window.SNAKE_OS_CHANGES (index.html). Ya traducido: no pasa por snake-i18n.
    try {
      var list = window.SNAKE_OS_CHANGES || [], cur = (window.SNAKE_OS_VERSION || '');
      var e = list.filter(function (x) { return x.v === cur; })[0] || list[0];
      if (!e) return '';
      var en = !!(window.snakeI18n && window.snakeI18n.lang === 'en');
      var items = (en ? e.en : e.es) || e.es || [];
      return '<div data-noi18n translate="no"><h4>✨ ' + (en ? 'What\'s new in this version' : 'Novedades de esta versión') + ' (' + esc(e.v) + ')</h4><ul>' +
        items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>';
    } catch (err) { return ''; }
  }
  var CHANGELOG = [
    { t: 'Metaverse', items: ['Rueda de gestos (saludar, bailar, saltar, corazón…) que ven todos', 'Bocadillos de chat encima de las cabezas', 'Minimapa, ficha de jugador con «Llamar» y «Ver canal»', 'Ciclo de día y noche con estrellas, sol, luna y farolas', 'Panel de ajustes (música, sensibilidad y gráficos) y selector de mundos con vista previa'] },
    { t: 'Escritorio y sistema', items: ['Menú con clic derecho en el escritorio y selector de apps con Alt+Q', 'Notificaciones agrupadas, «No molestar» y «Todo al día»', 'Ajustes rápidos: tamaño del texto, sonidos y animaciones reducidas', 'Ventanas que recuerdan su tamaño y sitio, y ajuste a media pantalla'] },
    { t: 'Apps', items: ['Mejoras en Chat, Book, Teléfono, Store y TV', 'Nuevas apps: Ajustes (con buscador), Calendario (con recordatorios) y Capturas', 'Notas con buscador, fijadas, colores, listas con casillas, exportar y guardado automático', 'Explorador con vista de lista, orden, renombrar, detalles y arrastrar para subir', 'Code Lab con temas, tamaño de letra, números de línea, abrir y descargar archivos', 'Doganiero AI: copiar respuestas y exportar la conversación', 'Calculadora con teclado, historial y porcentajes', 'Mi perfil con tarjeta de cuenta y ayuda para la contraseña', 'Pantalla de acceso con saludo y próximo festivo', 'Doganiero Desk con temporizador de sesión y estado de conexión'] },
    { t: 'Correcciones y retoques finales', items: ['El Calendario se guarda en tu cuenta y aparece en todos tus dispositivos (con copia local sin conexión)', 'Arreglado un fallo que podía borrar archivos al moverlos a la Papelera o restaurarlos', 'Ventanas con tamaño cómodo: si el guardado era demasiado pequeño se usa el nuevo tamaño', 'Las llamadas ya no quedan tapadas por el menú, el selector de apps ni los avisos', 'Nombres de los iconos legibles en tema claro', 'En móviles pequeños el reloj de la barra y las pestañas del Teléfono caben enteros', 'Menos consumo: los temporizadores se paran al cerrar las ventanas'] },
    { t: 'Novedades del sistema', items: ['Búsqueda global con Ctrl+K o Ctrl+Espacio: apps, notas, archivos, eventos, contactos de Chat y ajustes', 'Widgets de escritorio: reloj, próximos eventos, notas fijadas y saldo de huesitos y monedas (se activan en Ajustes y se pueden mover)', 'Historial del portapapeles con Alt+V para volver a pegar lo copiado en Snake OS', 'Accesibilidad: alto contraste, cursor grande y foco visible con el teclado', 'Centro de control en el móvil: desliza hacia abajo desde la barra superior', 'Escritorios virtuales (1 a 4) en la barra de tareas: Ctrl+Alt+← / → para cambiar y Ctrl+Alt+Mayús+← / → para mover la ventana', 'Arreglado un error al arrancar que podía aparecer con conexiones lentas'] },
    { t: 'Emojis Snake OS', items: ['299 emojis con diseño propio de Snake OS: caras de serpiente, corazones, gestos, animales, comida, naturaleza, objetos, símbolos y banderas', 'Se ven en Chat, Book, Metaverse, Notas, títulos y todo el sistema; los emojis sin diseño Snake se ven como los del sistema', 'Nueva app Snakemoji: búsqueda, categorías y clic para copiar · se abre con la tecla S', 'Ajustes → Apariencia → Emojis: Snake OS o Sistema (se guarda por perfil)'] }
  ];

  function tileState(id) {
    var t = $(id);
    if (!t) return null;
    return t.getAttribute('aria-pressed') === 'true' || t.classList.contains('active');
  }
  function clickTile(id) { var t = $(id); if (t) { t.click(); return true; } return false; }
  function themeName() {
    return document.body.classList.contains('light') || document.body.classList.contains('theme-light') ? 'Claro' : 'Oscuro';
  }

  function settingsRows() {
    var rows = [];
    function row(sec, id, ico, title, desc, kind, extra) { rows.push(Object.assign({ sec: sec, id: id, ico: ico, title: title, desc: desc, kind: kind }, extra || {})); }
    row('cuenta', 'locshare', '📡', 'Compartir ubicación con contactos', 'Tus contactos pueden verte en Mapas mientras tienes Snake OS abierto', 'action', { label: function () { var l = window.snkLocShare; return l ? (l.isOn() ? 'Ahora: activado' : 'Ahora: desactivado') : ''; }, btn: (window.snkLocShare && window.snkLocShare.isOn()) ? 'Desactivar' : 'Activar', run: function () { var l = window.snkLocShare; if (!l) return; var want = !l.isOn(); if (want && !window.confirm('¿Compartir tu ubicación con tus contactos? Solo la verán tus contactos, y solo mientras Snake OS esté abierto.')) return; l.set(want).then(function (v) { toast(v ? 'Compartiendo tu ubicación 📡' : 'Ya no compartes tu ubicación'); }).catch(function () { toast('No se pudo cambiar'); }); } });
    row('apariencia', 'theme', '🌗', 'Tema', 'Cambia entre automático, claro y oscuro', 'action', { label: function () { return 'Ahora: ' + themeName(); }, btn: 'Cambiar tema', run: function () { var x = window.__snakeOsDesktopExtras; if (x && x.toggleTheme) x.toggleTheme(); } });
    row('apariencia', 'wallpaper', '🖼️', 'Fondo de pantalla', 'Elige el fondo de tu escritorio', 'action', { btn: 'Elegir fondo', run: function () { var b = $('tbWpBtn'); if (b) b.click(); else toast('Abre el escritorio para cambiar el fondo'); } });
    row('apariencia', 'text', '🔠', 'Tamaño del texto', 'Normal, grande o muy grande', 'action', { label: function () { var t = $('qsTextSize'); return t ? t.textContent.replace(/^\s*🔠\s*/, '').trim() : ''; }, btn: 'Cambiar tamaño', run: function () { if (!clickTile('qsTextSize')) toast('Abre los Ajustes rápidos una vez y vuelve a intentarlo'); } });
    row('apariencia', 'motion', '🐢', 'Animaciones reducidas', 'Menos movimiento en ventanas y menús', 'toggle', { tile: 'qsReduceMotion' });
    row('apariencia', 'emojistyle', '😜', 'Emojis', 'Snake OS (emojis dibujados para Snake OS; los que no tienen diseño Snake se ven como los del sistema) o los del sistema', 'action', { label: function () { var e = window.snakeEmoji; return e ? 'Ahora: ' + e.label() : ''; }, btn: (window.snakeEmoji && window.snakeEmoji.get() === 'system') ? 'Usar Snake OS' : 'Usar los del sistema', run: function () { var e = window.snakeEmoji; if (e) { e.toggle(); toast('Emojis: ' + e.label()); } } });
    row('apariencia', 'snakemoji', '🐍', 'Snakemoji', 'Galería de los emojis Snake: busca, filtra por categoría y toca uno para copiarlo · tecla S', 'action', { btn: 'Abrir', run: function () { if (window.openApp) window.openApp('snakemoji'); } });
    row('apariencia', 'compact', '🧩', 'Modo compacto', 'Ventanas y barra más compactas', 'toggle', { tile: 'qsCompact' });
    row('sonido', 'sounds', '🔊', 'Sonidos del sistema', 'Melodía de bienvenida, avisos y llamadas', 'toggle', { tile: 'qsSounds', invert: false });
    row('notificaciones', 'webpush', '📲', 'Avisos con Snake OS! cerrado', 'Puedes recibir notificaciones aunque Snake OS! esté cerrado, siempre que el navegador siga abierto.', 'action', {
      label: function () { var st = window.__snkPushSt || ''; return st === 'on' ? 'Activados' : st === 'denied' ? 'Bloqueados en el navegador' : st === 'unsupported' ? 'No disponible en este navegador' : 'Desactivados'; },
      btn: 'Activar avisos',
      run: function () {
        if (!window.snkEnablePush) { toast('Inicia sesión para activar los avisos'); return; }
        window.snkEnablePush().then(function (r) {
          window.__snkPushSt = r;
          toast(r === 'on' ? 'Avisos activados ✅' : r === 'denied' ? 'El navegador bloqueó los avisos: permítelos en el candado de la barra de direcciones' : r === 'unsupported' ? 'Este navegador no admite avisos push (en iPhone, añade Snake OS! a la pantalla de inicio)' : 'No se pudieron activar los avisos');
          try { var a = document.querySelector('.snk4a-set-nav button.on'); if (a) a.click(); } catch (e) {}
        });
      }
    });
    if (window.snkPushState && !window.__snkPushChk) { window.__snkPushChk = 1; window.snkPushState().then(function (st) { window.__snkPushSt = st; window.__snkPushChk = 0; }); }
    row('notificaciones', 'dnd', '🔕', 'No molestar', 'Silencia los avisos mientras trabajas', 'toggle', { tile: 'qsDnd' });
    row('notificaciones', 'focus', '🎯', 'Modo foco', 'Oculta distracciones del escritorio', 'toggle', { tile: 'qsFocus' });
    row('rendimiento', 'perf', '⚡', 'Modo rendimiento', 'Menos efectos para equipos lentos', 'toggle', { tile: 'qsPerf' });
    row('escritorio', 'arrange', '🔀', 'Ordenar iconos', 'Coloca los iconos del escritorio en su cuadrícula', 'action', { btn: 'Ordenar', run: function () { if (typeof window.snakeArrangeDesktopIcons === 'function' && window.snakeArrangeDesktopIcons()) toast('Iconos ordenados'); else toast('Solo en el modo ordenador'); } });
    row('escritorio', 'widgets', '🧩', 'Widgets de escritorio', 'Reloj, próximos eventos, notas fijadas y saldo (modo ordenador). Arrástralos para moverlos', 'toggle', { get: function () { return b5Get('widgets'); }, set: function (v) { b5Set('widgets', v); } });
    row('escritorio', 'search', '🔎', 'Búsqueda global', 'Apps, notas, archivos, eventos, contactos y ajustes · Ctrl+K o Ctrl+Espacio', 'action', { btn: 'Buscar', run: function () { setTimeout(openSearch, 50); } });
    row('escritorio', 'clip', '📋', 'Historial del portapapeles', 'Lo que copias dentro de Snake OS · Alt+V', 'action', { btn: 'Abrir', run: function () { setTimeout(openClipboard, 50); } });
    row('accesibilidad', 'hc', '◐', 'Alto contraste', 'Fondos negros, texto blanco y bordes marcados', 'toggle', { get: function () { return b5Get('hc'); }, set: function (v) { b5Set('hc', v); } });
    row('accesibilidad', 'cursor', '🖱️', 'Cursor grande', 'Puntero más grande y fácil de ver', 'toggle', { get: function () { return b5Get('bigCursor'); }, set: function (v) { b5Set('bigCursor', v); } });
    row('accesibilidad', 'focus', '⌨️', 'Foco visible', 'Marca en amarillo dónde estás al moverte con el teclado (Tab)', 'toggle', { get: function () { return b5Get('focusRing'); }, set: function (v) { b5Set('focusRing', v); } });
    row('escritorio', 'shot', '📸', 'Captura de pantalla', 'También con Ctrl+Shift+S', 'action', { btn: 'Capturar', run: function () { var b = $('tbShotBtn'); if (b) b.click(); } });
    row('escritorio', 'fullscreen', '⛶', 'Pantalla completa', 'Usa Snake OS a pantalla completa', 'action', { btn: 'Activar', run: function () { clickTile('qsFullscreen'); } });
    row('pantalla', 'osx-screen', '🔆', 'Brillo', 'Brillo de la pantalla · teclas F5 y F6', 'osx');
    row('salvapantallas', 'osx-saver', '🌌', 'Salvapantallas', 'Tiempo de espera, estilo y vista previa', 'osx');
    row('trabajo', 'osx-work', '💼', 'Modo trabajo', 'Fondo negro bloqueado, menos efectos y dock con apps de trabajo y enlaces', 'osx');
    row('kids', 'osx-kids', '🧸', 'Snake OS Kids · control parental', 'Modo infantil con PIN: apps por edad, tiempo de pantalla, chat, web, juegos online, tienda, archivos, cámara e informe semanal', 'osx');
    row('ia', 'keys', '✨', 'Key de AskBox', 'Clave de AskBox de tu cuenta. Vacío usa la clave del sistema', 'aiform');
    row('cuenta', 'who', '🪪', 'Sesión iniciada', 'Tus ajustes se guardan por perfil', 'info', { label: function () { var u = cu(); return u ? (u.name || '') + ' · ' + (u.email || '') : ''; } });
    row('cuenta', 'profile', '👤', 'Mi perfil', 'Nombre, foto o emoji y contraseña', 'action', { btn: 'Abrir', run: function () { if (window.openApp) window.openApp('profile'); } });
    row('cuenta', 'lock', '🔒', 'Bloquear cuenta', 'Bloquea tu sesión sin cerrarla', 'action', { btn: 'Bloquear', run: function () { clickTile('qsLock'); } });
    row('almacenamiento', 'storage', '💾', 'Espacio usado', 'Archivos guardados en tu cuenta', 'info', { label: function () {
      var n = 0, used = 0;
      try { n = (typeof uploadedFiles !== 'undefined' && uploadedFiles) ? uploadedFiles.length : 0; } catch (e) {}
      try { used = typeof getUsedBytes === 'function' ? getUsedBytes() : 0; } catch (e2) {}
      var notes = 0;
      try { notes = (typeof userNotes !== 'undefined' && userNotes) ? userNotes.length : 0; } catch (e3) {}
      return n + ' archivo(s) · ' + fmtBytes(used) + ' · ' + notes + ' nota(s)';
    } });
    row('almacenamiento', 'resetprefs', '🧹', 'Restablecer preferencias de apps', 'Tema y letra de Code Lab, vista del Explorador e historial de la Calculadora (no borra notas, archivos ni eventos)', 'action', { btn: 'Restablecer', run: function () {
      ['code', 'fx', 'calc'].forEach(function (k) { try { localStorage.removeItem(lsKey(k)); } catch (e) {} });
      toast('Preferencias restablecidas');
    } });
    row('atajos', 'keys', '⌨️', 'Atajos de teclado', 'Ctrl+K o Ctrl+Espacio buscar · Alt+V portapapeles · Ctrl+Alt+← / → escritorios · Ctrl+Shift+S captura · Alt+Q cambiar de app · S abrir Snakemoji (fuera de campos de texto, Code Lab, Terminal, juegos y Metaverse) · Esc cerrar menús · Clic derecho: menú del escritorio · Móvil: desliza hacia abajo desde la barra superior', 'info');
    row('acerca', 'about', 'ℹ️', 'Acerca de Snake OS', SNK_VERSION + ' · powered by Doganiero OS! 3', 'about');
    return rows;
  }

  var SETTINGS_SECTIONS = [
    { id: 'apariencia', ico: '🎨', name: 'Apariencia' },
    { id: 'pantalla', ico: '🔆', name: 'Pantalla' },
    { id: 'salvapantallas', ico: '🌌', name: 'Salvapantallas' },
    { id: 'trabajo', ico: '💼', name: 'Modo trabajo' },
    { id: 'kids', ico: '🧸', name: 'Snake OS Kids' },
    { id: 'sonido', ico: '🔊', name: 'Sonido' },
    { id: 'notificaciones', ico: '🔔', name: 'Notificaciones' },
    { id: 'rendimiento', ico: '⚡', name: 'Rendimiento' },
    { id: 'escritorio', ico: '🖥️', name: 'Escritorio' },
    { id: 'accesibilidad', ico: '♿', name: 'Accesibilidad' },
    { id: 'ia', ico: '✨', name: 'IA' },
    { id: 'cuenta', ico: '👤', name: 'Cuenta' },
    { id: 'almacenamiento', ico: '💾', name: 'Almacenamiento' },
    { id: 'atajos', ico: '⌨️', name: 'Atajos' },
    { id: 'acerca', ico: 'ℹ️', name: 'Acerca de' }
  ];

  addCss(
    '.snk4a-set{display:flex;height:100%;min-height:0;gap:0;color:var(--text,#fff);}' +
    '.snk4a-set-nav{flex:0 0 172px;display:flex;flex-direction:column;gap:3px;padding:2px 10px 2px 0;border-right:1px solid var(--input-border,rgba(255,255,255,0.14));overflow:auto;}' +
    '.snk4a-set-nav button{margin:0;width:100%;display:flex;align-items:center;gap:8px;text-align:left;padding:8px 10px;border-radius:10px;font-size:0.82rem;font-weight:600;cursor:pointer;' +
      'background:transparent;color:var(--text,#fff);border:1px solid transparent;box-shadow:none;}' +
    '.snk4a-set-nav button:hover{background:var(--input-bg,rgba(255,255,255,0.06));}' +
    '.snk4a-set-nav button.on{background:rgba(52,209,122,0.18);border-color:rgba(52,209,122,0.45);}' +
    '.snk4a-set-main{flex:1;min-width:0;display:flex;flex-direction:column;padding-left:12px;min-height:0;}' +
    '.snk4a-set-main .snk4a-input{margin-bottom:10px;}' +
    '.snk4a-set-list{flex:1;min-height:0;overflow:auto;padding-right:2px;}' +
    '.snk4a-set-h{font-size:0.95rem;font-weight:800;margin:4px 0 8px;}' +
    '.snk4a-set-h small{font-weight:600;opacity:0.6;font-size:0.72rem;margin-left:6px;}' +
    '.snk4a-set-row{display:flex;align-items:center;gap:10px;padding:10px 11px;margin-bottom:7px;border-radius:12px;background:var(--input-bg,rgba(255,255,255,0.06));border:1px solid var(--input-border,rgba(255,255,255,0.14));}' +
    '.snk4a-set-ico{font-size:1.25rem;flex:0 0 28px;text-align:center;}' +
    '.snk4a-set-txt{flex:1;min-width:0;}' +
    '.snk4a-set-txt b{display:block;font-size:0.85rem;}' +
    '.snk4a-set-txt span{display:block;font-size:0.72rem;opacity:0.72;line-height:1.35;}' +
    '.snk4a-set-txt em{display:block;font-style:normal;font-size:0.72rem;color:var(--accent,#34d17a);margin-top:2px;font-weight:700;}' +
    '.snk4a-switch{position:relative;flex:0 0 44px;width:44px;height:26px;margin:0;padding:0;border-radius:999px;cursor:pointer;background:rgba(127,127,127,0.35);border:1px solid var(--input-border,rgba(255,255,255,0.2));transition:background .18s ease;box-shadow:none;}' +
    '.snk4a-switch::after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);transition:transform .18s ease;}' +
    '.snk4a-switch[aria-checked="true"]{background:var(--accent,#34d17a);}' +
    '.snk4a-switch[aria-checked="true"]::after{transform:translateX(18px);}' +
    '.snk4a-about{text-align:center;padding:8px 4px 4px;}' +
    '.snk4a-about-logo{font-size:2.6rem;line-height:1;}' +
    '.snk4a-about h2{margin:6px 0 2px;font-size:1.2rem;}' +
    '.snk4a-about .ver{display:inline-block;margin:4px 0 10px;padding:3px 10px;border-radius:999px;background:rgba(52,209,122,0.2);color:var(--accent,#34d17a);font-weight:800;font-size:0.78rem;}' +
    '.snk4a-log{text-align:left;margin-top:8px;}' +
    '.snk4a-log h4{margin:10px 0 4px;font-size:0.82rem;}' +
    '.snk4a-log ul{margin:0;padding-left:18px;font-size:0.76rem;line-height:1.5;opacity:0.9;}' +
    'body.light .snk4a-about .ver,body.theme-light .snk4a-about .ver{color:#0b6b3a;background:rgba(11,107,58,0.14);}' +
    '.snk4a-about-meta{font-size:0.72rem;opacity:0.7;margin-top:10px;line-height:1.5;}' +
    '.snk4a-ai{display:flex;flex-direction:column;gap:8px;padding:2px 2px 10px;}' +
    '.snk4a-ai p{margin:0 0 4px;font-size:0.76rem;line-height:1.45;opacity:0.82;}' +
    '.snk4a-ai label{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:0.82rem;font-weight:800;}' +
    '.snk4a-ai label em{font-style:normal;font-weight:700;font-size:0.72rem;color:var(--accent,#34d17a);}' +
    '.snk4a-ai-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;}' +
    '.snk4a-ai-msg{min-height:1.2em;font-size:0.75rem;font-weight:700;}' +
    '.snk4a-ai-msg.err{color:#ff8a7a;}' +
    '.snk4a-ai-msg.ok{color:var(--accent,#34d17a);}' +
    '@media (max-width:560px){.snk4a-set{flex-direction:column;}.snk4a-set-nav{flex:0 0 auto;flex-direction:row;overflow-x:auto;border-right:none;border-bottom:1px solid var(--input-border,rgba(255,255,255,0.14));padding:0 0 8px;margin-bottom:8px;}' +
      '.snk4a-set-nav button{width:auto;white-space:nowrap;flex:0 0 auto;}.snk4a-set-main{padding-left:0;}}' +
    'body.phone-mode .snk4a-set{flex-direction:column;}' +
    'body.phone-mode .snk4a-set-nav{flex:0 0 auto;flex-direction:row;overflow-x:auto;border-right:none;border-bottom:1px solid var(--input-border,rgba(255,255,255,0.14));padding:0 0 8px;margin-bottom:8px;}' +
    'body.phone-mode .snk4a-set-nav button{width:auto;white-space:nowrap;flex:0 0 auto;min-height:40px;}' +
    'body.phone-mode .snk4a-set-main{padding-left:0;}'
  );

  function aiKeyStatus(custom) { return custom ? 'Tu clave' : 'Clave del sistema'; }
  function buildAiKeysPanel() {
    var box = document.createElement('div');
    box.className = 'snk4a-ai';
    var api = window.snakeAiKeys;
    var snap = (api && api.snapshot) ? api.snapshot() : { askbox: '', askboxCustom: false };
    box.innerHTML =
      '<p>Esta clave es solo de tu cuenta y se usa en Doganiero AI y en Code Lab. Si la dejas vacía, Snake OS usa la clave del sistema (AskBox).</p>' +
      '<label>Key de AskBox <em data-for="askbox">' + esc(aiKeyStatus(snap.askboxCustom)) + '</em></label>' +
      '<input class="snk4a-input" type="password" data-key="askbox" autocomplete="off" spellcheck="false" placeholder="Vacío = clave del sistema">' +
      '<div class="snk4a-ai-actions">' +
        '<button type="button" class="snk4a-btn" data-act="toggle">Mostrar</button>' +
        '<button type="button" class="snk4a-btn primary" data-act="save">Guardar</button>' +
        '<button type="button" class="snk4a-btn" data-act="reset">Usar la del sistema</button>' +
        '<button type="button" class="snk4a-btn" data-act="check">Comprobar</button>' +
      '</div>' +
      '<div class="snk4a-ai-msg" data-msg></div>';
    var askInput = box.querySelector('[data-key="askbox"]');
    var msg = box.querySelector('[data-msg]');
    function fill(data) {
      data = data || ((api && api.snapshot) ? api.snapshot() : snap);
      askInput.value = data.askbox || '';
      var st = box.querySelector('[data-for="askbox"]');
      if (st) st.textContent = aiKeyStatus(!!(data.askboxCustom || data.askbox));
      dirty = false;
    }
    var dirty = false;
    askInput.addEventListener('input', function () { dirty = true; });
    fill(snap);
    if (api && api.load) {
      api.load().then(function (data) {
        if (!box.isConnected || !data || dirty) return;
        fill(data);
      }).catch(function () {});
    }
    function say(text, kind) {
      msg.textContent = text || '';
      msg.className = 'snk4a-ai-msg' + (kind ? ' ' + kind : '');
    }
    box.querySelector('[data-act="toggle"]').addEventListener('click', function () {
      var show = askInput.type === 'password';
      askInput.type = show ? 'text' : 'password';
      this.textContent = show ? 'Ocultar' : 'Mostrar';
    });
    box.querySelector('[data-act="save"]').addEventListener('click', function () {
      if (!api || !api.save) { say('No se puede guardar la clave ahora', 'err'); return; }
      say('Guardando…', '');
      api.save(askInput.value).then(function (data) {
        fill(data);
        say('Clave guardada', 'ok');
        toast('Key de AskBox guardada');
      }).catch(function (err) {
        say((err && err.message) ? err.message : 'No se pudo guardar', 'err');
      });
    });
    box.querySelector('[data-act="reset"]').addEventListener('click', function () {
      if (!api || !api.save) { say('No se puede guardar la clave ahora', 'err'); return; }
      say('Restaurando…', '');
      api.save('').then(function (data) {
        fill(data);
        say('Otra vez la clave del sistema', 'ok');
        toast('Clave del sistema');
      }).catch(function (err) {
        say((err && err.message) ? err.message : 'No se pudo restaurar', 'err');
      });
    });
    box.querySelector('[data-act="check"]').addEventListener('click', function () {
      var key = String(askInput.value || '').trim();
      if (!key) { say('Escribe una clave para comprobar', 'err'); return; }
      say('Comprobando…', '');
      apiCall('/api/ai/validate-key', { method: 'POST', body: { askbox: key } }).then(function (data) {
        var ok = data && (data.valid === true || data.ok === true);
        if (ok) say('La clave es válida', 'ok');
        else say((data && data.message) ? String(data.message) : 'La clave no es válida', 'err');
      }).catch(function (err) {
        if (err && err.status === 404) say('Comprobar no disponible en este servidor', '');
        else say((err && err.message) ? err.message : 'No se pudo comprobar', 'err');
      });
    });
    return box;
  }

  function renderSettingsApp(body, startSec) {
    var sec = startSec || 'apariencia';
    if (window.snkOsx && !window.snkOsx.settingsVisible(sec)) sec = 'kids';
    var query = '';
    body.innerHTML =
      '<div class="snk4a-set">' +
      '<nav class="snk4a-set-nav" aria-label="Secciones"></nav>' +
      '<div class="snk4a-set-main">' +
      '<input type="search" class="snk4a-input" placeholder="🔎 Buscar ajustes…" aria-label="Buscar ajustes">' +
      '<div class="snk4a-set-list"></div>' +
      '</div></div>';
    var nav = body.querySelector('.snk4a-set-nav');
    var search = body.querySelector('input[type=search]');
    var list = body.querySelector('.snk4a-set-list');
    SETTINGS_SECTIONS.forEach(function (s) {
      if (window.snkOsx && !window.snkOsx.settingsVisible(s.id)) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.sec = s.id;
      b.innerHTML = '<span>' + s.ico + '</span><span>' + esc(s.name) + '</span>';
      b.addEventListener('click', function () { sec = s.id; query = ''; search.value = ''; paint(); });
      nav.appendChild(b);
    });
    function aboutHtml() {
      var u = cu();
      var html = '<div class="snk4a-about"><div class="snk4a-about-logo"><img src="/static/assets/snake-os-logo-v2.svg?v=202610161925" alt="" width="72" height="72" style="display:block;margin:0 auto 6px"></div><h2>Snake OS!</h2>' +
        '<div class="ver">' + esc(SNK_VERSION) + '</div>' +
        '<div style="font-size:0.78rem;opacity:0.8">powered by Doganiero OS! 3</div>' +
        '<div class="snk4a-log">' + currentChanges() + '<h4>🆕 Novedades</h4>';
      CHANGELOG.forEach(function (g) {
        html += '<h4>' + esc(g.t) + '</h4><ul>' + g.items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
      });
      html += '</div><div class="snk4a-about-meta">Sesión iniciada como <b>' + esc(u ? u.name : '') + '</b>' +
        '<br>Navegador: ' + esc((navigator.userAgent || '').replace(/^.*?(Chrome|Firefox|Safari|Edg)\/([\d.]+).*$/, '$1 $2').slice(0, 40)) +
        ' · Pantalla ' + (window.screen ? screen.width + '×' + screen.height : '') + '</div></div>';
      return html;
    }
    function paint() {
      nav.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', !query && b.dataset.sec === sec); });
      var rows = settingsRows();
      var q = query.trim().toLowerCase();
      var shown = q ? rows.filter(function (r) {
        var s = SETTINGS_SECTIONS.filter(function (x) { return x.id === r.sec; })[0];
        return (r.title + ' ' + r.desc + ' ' + (s ? s.name : '')).toLowerCase().indexOf(q) >= 0;
      }) : rows.filter(function (r) { return r.sec === sec; });
      if (window.snkOsx) shown = shown.filter(function (r) { return window.snkOsx.settingsVisible(r.sec); });
      list.innerHTML = '';
      if (!q) {
        var sd = SETTINGS_SECTIONS.filter(function (x) { return x.id === sec; })[0];
        var h = document.createElement('div');
        h.className = 'snk4a-set-h';
        h.textContent = sd ? sd.ico + ' ' + sd.name : '';
        list.appendChild(h);
      } else {
        var hq = document.createElement('div');
        hq.className = 'snk4a-set-h';
        hq.innerHTML = 'Resultados <small>' + shown.length + '</small>';
        list.appendChild(hq);
      }
      if (!shown.length) {
        var em = document.createElement('div');
        em.className = 'snk4a-empty';
        em.innerHTML = '<span class="big">🔎</span>No hay ajustes que coincidan con «' + esc(query) + '».';
        list.appendChild(em);
        return;
      }
      shown.forEach(function (r) {
        if (r.kind === 'aiform') {
          if (q) {
            var jump = document.createElement('div');
            jump.className = 'snk4a-set-row';
            jump.innerHTML = '<span class="snk4a-set-ico">' + r.ico + '</span><span class="snk4a-set-txt"><b>' + esc(r.title) + '</b><span>' + esc(r.desc) + '</span></span>';
            var openAi = document.createElement('button');
            openAi.type = 'button';
            openAi.className = 'snk4a-btn';
            openAi.textContent = 'Abrir';
            openAi.addEventListener('click', function () { sec = 'ia'; query = ''; search.value = ''; paint(); });
            jump.appendChild(openAi);
            list.appendChild(jump);
          } else {
            list.appendChild(buildAiKeysPanel());
          }
          return;
        }
        if (r.kind === 'osx') {
          if (q || !window.snkOsx) {
            var jo = document.createElement('div');
            jo.className = 'snk4a-set-row';
            jo.innerHTML = '<span class="snk4a-set-ico">' + r.ico + '</span><span class="snk4a-set-txt"><b>' + esc(r.title) + '</b><span>' + esc(r.desc) + '</span></span>';
            var bj = document.createElement('button'); bj.type = 'button'; bj.className = 'snk4a-btn'; bj.textContent = 'Abrir';
            bj.addEventListener('click', function () { sec = r.sec; query = ''; search.value = ''; paint(); });
            jo.appendChild(bj);
            list.appendChild(jo);
          } else {
            list.appendChild(window.snkOsx.panel(r.id));
          }
          return;
        }
        if (r.kind === 'about') {
          if (q) {
            var ra = document.createElement('div');
            ra.className = 'snk4a-set-row';
            ra.innerHTML = '<span class="snk4a-set-ico">' + r.ico + '</span><span class="snk4a-set-txt"><b>' + esc(r.title) + '</b><span>' + esc(r.desc) + '</span></span>';
            var bo = document.createElement('button'); bo.type = 'button'; bo.className = 'snk4a-btn'; bo.textContent = 'Ver';
            bo.addEventListener('click', function () { sec = 'acerca'; query = ''; search.value = ''; paint(); });
            ra.appendChild(bo);
            list.appendChild(ra);
          } else {
            var wrap = document.createElement('div');
            wrap.innerHTML = aboutHtml();
            list.appendChild(wrap);
          }
          return;
        }
        var el = document.createElement('div');
        el.className = 'snk4a-set-row';
        var label = typeof r.label === 'function' ? r.label() : '';
        el.innerHTML = '<span class="snk4a-set-ico">' + r.ico + '</span><span class="snk4a-set-txt"><b>' + esc(r.title) + '</b><span>' + esc(r.desc) + '</span>' +
          (label ? '<em>' + esc(label) + '</em>' : '') + '</span>';
        if (r.kind === 'toggle') {
          var st = r.get ? !!r.get() : tileState(r.tile);
          var sw = document.createElement('button');
          sw.type = 'button';
          sw.className = 'snk4a-switch';
          sw.setAttribute('role', 'switch');
          sw.setAttribute('aria-label', r.title);
          if (st === null) { sw.disabled = true; sw.title = 'No disponible ahora'; sw.style.opacity = '0.5'; }
          sw.setAttribute('aria-checked', st ? 'true' : 'false');
          sw.addEventListener('click', function () {
            if (r.set) r.set(!st); else clickTile(r.tile);
            setTimeout(paint, 60);
          });
          el.appendChild(sw);
        } else if (r.kind === 'action') {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'snk4a-btn';
          b.textContent = r.btn || 'Abrir';
          b.addEventListener('click', function () { try { r.run(); } catch (e) {} setTimeout(paint, 120); });
          el.appendChild(b);
        }
        list.appendChild(el);
      });
    }
    search.addEventListener('input', function () { query = search.value; paint(); });
    paint();
    var iv = setInterval(function () { if (!body.isConnected) { clearInterval(iv); return; } if (!query && sec === 'almacenamiento') paint(); }, 4000);
    return function () { clearInterval(iv); };
  }
  var pendingSec = null;
  window.snakeOpenSettings = function (secId) {
    pendingSec = secId || null;
    try { if (typeof closeApp === 'function' && pendingSec) closeApp('ajustes', true); } catch (e) {}
    if (window.openApp) window.openApp('ajustes');
    pendingSec = null;
  };
  registerApp('ajustes', { title: 'Ajustes', icon: '⚙️', width: 620, height: 520, render: function (body) {
    var s = SETTINGS_SECTIONS.some(function (x) { return x.id === pendingSec; }) ? pendingSec : null;
    return renderSettingsApp(body, s);
  } });

  /* =================== App nueva: Calendario =================== */
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var WD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  var HOLIDAYS = { '01-01': 'Año Nuevo', '01-06': 'Reyes', '05-01': 'Día del Trabajo', '08-15': 'Asunción', '10-12': 'Fiesta Nacional', '11-01': 'Todos los Santos', '12-06': 'Constitución', '12-08': 'Inmaculada', '12-25': 'Navidad' };
  var EV_COLORS = ['#34d17a', '#4aa3ff', '#ffb547', '#ff6b8a', '#b07cff'];
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function calEvents() { var e = lsGet('cal', {}); return e && typeof e === 'object' && !Array.isArray(e) ? e : {}; }
  /* Sincronización con el servidor (por perfil). localStorage hace de copia local y de respaldo sin conexión. */
  var calPushTimer = null, calSynced = {}, calSyncing = {};
  function calHasEvents(ev) { for (var k in ev) if (Object.prototype.hasOwnProperty.call(ev, k) && Array.isArray(ev[k]) && ev[k].length) return true; return false; }
  function saveCal(all) {
    lsSet('cal', all);
    lsSet('calPending', true);
    clearTimeout(calPushTimer);
    calPushTimer = setTimeout(pushCal, 500);
  }
  function pushCal() {
    var who = email();
    if (!who) return Promise.resolve(false);
    var sent = JSON.stringify(calEvents());
    return apiCall('/api/calendar', { method: 'PUT', body: { events: JSON.parse(sent) } }).then(function (res) {
      if (email() !== who) return true;
      if (JSON.stringify(calEvents()) === sent) {
        if (res && res.events && typeof res.events === 'object') lsSet('cal', res.events);
        lsSet('calPending', false);
      }
      return true;
    }).catch(function () { return false; });
  }
  function syncCal(done) {
    var who = email();
    if (!who || calSyncing[who]) return;
    calSyncing[who] = true;
    apiCall('/api/calendar').then(function (res) {
      if (email() !== who) return;
      var local = calEvents();
      var pending = !!lsGet('calPending', false);
      if (pending || (!(res && res.saved) && calHasEvents(local))) {
        return pushCal().then(function () { calSynced[who] = true; });
      }
      if (res && res.saved && res.events && typeof res.events === 'object') lsSet('cal', res.events);
      calSynced[who] = true;
    }).catch(function () {}).then(function () {
      calSyncing[who] = false;
      if (typeof done === 'function' && email() === who) { try { done(); } catch (e) {} }
    });
  }

  addCss(
    '.snk4a-cal{display:flex;flex-direction:column;height:100%;min-height:0;gap:8px;color:var(--text,#fff);}' +
    '.snk4a-cal-head{display:flex;align-items:center;gap:6px;}' +
    '.snk4a-cal-head h3{flex:1;margin:0;font-size:1.02rem;text-transform:capitalize;}' +
    '.snk4a-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;}' +
    '.snk4a-cal-wd{text-align:center;font-size:0.7rem;font-weight:800;opacity:0.6;padding:2px 0;}' +
    '.snk4a-cal-day{position:relative;margin:0;width:auto;min-height:40px;padding:4px 2px 12px;border-radius:10px;font-size:0.82rem;font-weight:700;cursor:pointer;box-shadow:none;' +
      'background:var(--input-bg,rgba(255,255,255,0.06));color:var(--text,#fff);border:1px solid transparent;}' +
    '.snk4a-cal-day.out{opacity:0.35;}' +
    '.snk4a-cal-day.we{color:#ff9a8a;}' +
    '.snk4a-cal-day.hol{color:#ff6b6b;}' +
    '.snk4a-cal-day.today{background:linear-gradient(135deg,var(--accent,#34d17a),var(--accent-strong,#1f9e57));color:#04170c;}' +
    '.snk4a-cal-day.sel{border-color:var(--accent,#34d17a);box-shadow:0 0 0 2px rgba(52,209,122,0.35);}' +
    '.snk4a-cal-dots{position:absolute;left:0;right:0;bottom:4px;display:flex;justify-content:center;gap:2px;}' +
    '.snk4a-cal-dots i{width:5px;height:5px;border-radius:50%;display:block;}' +
    '.snk4a-cal-side{flex:1;min-height:0;overflow:auto;border-top:1px solid var(--input-border,rgba(255,255,255,0.14));padding-top:8px;}' +
    '.snk4a-cal-side h4{margin:0 0 6px;font-size:0.86rem;}' +
    '.snk4a-cal-hol{font-size:0.75rem;color:#ff8a7a;font-weight:700;margin-bottom:6px;}' +
    '.snk4a-cal-ev{display:flex;align-items:center;gap:8px;padding:7px 9px;margin-bottom:5px;border-radius:10px;background:var(--input-bg,rgba(255,255,255,0.06));border-left:4px solid #34d17a;font-size:0.8rem;}' +
    '.snk4a-cal-ev b{font-variant-numeric:tabular-nums;min-width:40px;}' +
    '.snk4a-cal-ev span{flex:1;min-width:0;word-break:break-word;}' +
    '.snk4a-cal-ev button{margin:0;width:auto;padding:2px 7px;min-height:0;border-radius:8px;background:transparent;border:none;box-shadow:none;cursor:pointer;color:inherit;opacity:0.65;}' +
    '.snk4a-cal-add{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;}' +
    '.snk4a-cal-add .snk4a-input[type=time]{flex:0 0 104px;}' +
    '.snk4a-cal-add .snk4a-input.t{flex:1;min-width:120px;}' +
    '.snk4a-cal-colors{display:flex;gap:5px;align-items:center;}' +
    '.snk4a-cal-colors button{margin:0;width:20px;height:20px;min-height:0;padding:0;border-radius:50%;border:2px solid transparent;box-shadow:none;cursor:pointer;}' +
    '.snk4a-cal-colors button.on{border-color:var(--text,#fff);}' +
    'body.phone-mode .snk4a-cal-day{min-height:44px;}'
  );

  function renderCalendarApp(body) {
    var now = new Date();
    var view = new Date(now.getFullYear(), now.getMonth(), 1);
    var sel = ymd(now);
    var color = EV_COLORS[0];
    body.innerHTML =
      '<div class="snk4a-cal">' +
      '<div class="snk4a-cal-head"><button type="button" class="snk4a-btn" data-nav="-1" aria-label="Mes anterior">‹</button>' +
      '<h3></h3><button type="button" class="snk4a-btn" data-nav="today">Hoy</button>' +
      '<button type="button" class="snk4a-btn" data-nav="1" aria-label="Mes siguiente">›</button></div>' +
      '<div class="snk4a-cal-grid"></div>' +
      '<div class="snk4a-cal-side"></div></div>';
    var title = body.querySelector('h3');
    var grid = body.querySelector('.snk4a-cal-grid');
    var side = body.querySelector('.snk4a-cal-side');
    body.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = b.dataset.nav;
        if (n === 'today') { view = new Date(now.getFullYear(), now.getMonth(), 1); sel = ymd(new Date()); }
        else view = new Date(view.getFullYear(), view.getMonth() + (+n), 1);
        paint();
      });
    });
    function paint() {
      var evs = calEvents();
      var today = ymd(new Date());
      title.textContent = MONTHS[view.getMonth()] + ' ' + view.getFullYear();
      grid.innerHTML = WD.map(function (w) { return '<div class="snk4a-cal-wd">' + w + '</div>'; }).join('');
      var first = (view.getDay() + 6) % 7;
      var start = new Date(view.getFullYear(), view.getMonth(), 1 - first);
      for (var i = 0; i < 42; i++) {
        var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        if (i >= 35 && d.getMonth() !== view.getMonth()) break;
        var key = ymd(d);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'snk4a-cal-day';
        if (d.getMonth() !== view.getMonth()) b.classList.add('out');
        if (d.getDay() === 0 || d.getDay() === 6) b.classList.add('we');
        var hol = HOLIDAYS[key.slice(5)];
        if (hol) { b.classList.add('hol'); b.title = hol; }
        if (key === today) b.classList.add('today');
        if (key === sel) b.classList.add('sel');
        b.dataset.day = key;
        var dots = (evs[key] || []).slice(0, 3).map(function (e) { return '<i style="background:' + esc(e.c || '#34d17a') + '"></i>'; }).join('');
        b.innerHTML = d.getDate() + (dots ? '<span class="snk4a-cal-dots">' + dots + '</span>' : '');
        b.setAttribute('aria-label', d.getDate() + ' de ' + MONTHS[d.getMonth()] + ((evs[key] || []).length ? ', ' + evs[key].length + ' evento(s)' : ''));
        b.addEventListener('click', function () {
          sel = this.dataset.day;
          var p = sel.split('-');
          if (+p[1] - 1 !== view.getMonth()) view = new Date(+p[0], +p[1] - 1, 1);
          paint();
        });
        grid.appendChild(b);
      }
      paintSide(evs);
    }
    function paintSide(evs) {
      var p = sel.split('-');
      var d = new Date(+p[0], +p[1] - 1, +p[2]);
      var wd = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d.getDay()];
      var list = (evs[sel] || []).slice().sort(function (a, b) { return String(a.h || '99').localeCompare(String(b.h || '99')); });
      var hol = HOLIDAYS[sel.slice(5)];
      var html = '<h4>' + esc(wd.charAt(0).toUpperCase() + wd.slice(1) + ', ' + (+p[2]) + ' de ' + MONTHS[+p[1] - 1]) + '</h4>' +
        (hol ? '<div class="snk4a-cal-hol">🎉 ' + esc(hol) + '</div>' : '');
      if (!list.length) html += '<div class="snk4a-empty" style="padding:8px">📭 Sin eventos este día</div>';
      list.forEach(function (e) {
        html += '<div class="snk4a-cal-ev" style="border-left-color:' + esc(e.c || '#34d17a') + '"><b>' + esc(e.h || 'Todo el día') + '</b><span>' + esc(e.t) + '</span>' +
          '<button type="button" data-del="' + esc(e.id) + '" aria-label="Borrar evento" title="Borrar">✕</button></div>';
      });
      html += '<div class="snk4a-cal-add"><input type="time" class="snk4a-input" aria-label="Hora">' +
        '<input type="text" class="snk4a-input t" maxlength="80" placeholder="Nuevo evento…" aria-label="Nuevo evento">' +
        '<span class="snk4a-cal-colors">' + EV_COLORS.map(function (c) { return '<button type="button" data-c="' + c + '" style="background:' + c + '" class="' + (c === color ? 'on' : '') + '" aria-label="Color"></button>'; }).join('') + '</span>' +
        '<button type="button" class="snk4a-btn primary" data-add="1">Añadir</button></div>';
      side.innerHTML = html;
      var tIn = side.querySelector('.snk4a-input.t');
      var hIn = side.querySelector('input[type=time]');
      side.querySelectorAll('[data-c]').forEach(function (b) {
        b.addEventListener('click', function () { color = b.dataset.c; side.querySelectorAll('[data-c]').forEach(function (x) { x.classList.toggle('on', x === b); }); });
      });
      function add() {
        var t = tIn.value.trim();
        if (!t) { tIn.focus(); toast('Escribe un título para el evento'); return; }
        var all = calEvents();
        (all[sel] = all[sel] || []).push({ id: 'e' + Date.now().toString(36), t: t, h: hIn.value || '', c: color });
        saveCal(all);
        toast('Evento guardado');
        paint();
        var ni = side.querySelector('.snk4a-input.t'); if (ni) ni.focus();
      }
      side.querySelector('[data-add]').addEventListener('click', add);
      tIn.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') add(); });
      side.querySelectorAll('.snk4a-cal-ev span').forEach(function (sp) {
        sp.title = 'Clic para editar';
        sp.style.cursor = 'text';
        sp.addEventListener('click', function () {
          var row = sp.closest('.snk4a-cal-ev');
          var id = row.querySelector('[data-del]').dataset.del;
          var inp = document.createElement('input');
          inp.type = 'text'; inp.className = 'snk4a-input'; inp.maxLength = 80; inp.value = sp.textContent;
          inp.setAttribute('aria-label', 'Editar evento');
          inp.style.minHeight = '28px'; inp.style.padding = '3px 8px';
          sp.replaceWith(inp);
          inp.focus(); inp.select();
          var done = false;
          function commit(save) {
            if (done) return; done = true;
            var v = inp.value.trim();
            if (save && v) {
              var all = calEvents();
              (all[sel] || []).forEach(function (e) { if (e.id === id) e.t = v; });
              saveCal(all);
            }
            paint();
          }
          inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') commit(true); else if (ev.key === 'Escape') commit(false); });
          inp.addEventListener('blur', function () { commit(true); });
        });
      });
      side.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          var all = calEvents();
          all[sel] = (all[sel] || []).filter(function (e) { return e.id !== b.dataset.del; });
          if (!all[sel].length) delete all[sel];
          saveCal(all);
          paint();
        });
      });
    }
    /* Teclado: flechas para moverse por los días, RePág/AvPág para cambiar de mes */
    grid.addEventListener('keydown', function (ev) {
      var delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
      var p = sel.split('-');
      var d = new Date(+p[0], +p[1] - 1, +p[2]);
      if (delta) d.setDate(d.getDate() + delta);
      else if (ev.key === 'PageUp') d.setMonth(d.getMonth() - 1);
      else if (ev.key === 'PageDown') d.setMonth(d.getMonth() + 1);
      else return;
      ev.preventDefault();
      sel = ymd(d);
      view = new Date(d.getFullYear(), d.getMonth(), 1);
      paint();
      var b = grid.querySelector('[data-day="' + sel + '"]');
      if (b) b.focus();
    });
    paint();
    syncCal(function () { if (body.isConnected) paint(); });
    var lastDay = ymd(new Date());
    var iv = setInterval(function () {
      if (!body.isConnected) { clearInterval(iv); return; }
      var t = ymd(new Date());
      if (t !== lastDay) { lastDay = t; now = new Date(); paint(); }
    }, 60000);
    return function () { clearInterval(iv); };
  }
  // Para los bots: añade un evento al Calendario real del usuario (mismo guardado/sincronización que la app)
  window.snakeCalAdd = function (day, title, hm) {
    day = String(day || '').trim(); title = String(title || '').trim().slice(0, 80); hm = String(hm || '').trim();
    var m = day.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if (m) day = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isNaN(new Date(day + 'T00:00:00').getTime())) throw new Error('Fecha no válida (usa AAAA-MM-DD)');
    if (!title) throw new Error('Falta el título');
    var hm2 = hm.match(/^(\d{1,2})[:.h](\d{2})$/); hm = hm2 ? ('0' + hm2[1]).slice(-2) + ':' + hm2[2] : '';
    var all = calEvents(); (all[day] = all[day] || []).push({ id: 'e' + Date.now(), t: title, h: hm, c: EV_COLORS[0] });
    saveCal(all);
    try { if (typeof window.reRenderIfOpen === 'function') window.reRenderIfOpen('calendario'); } catch (e) {}
    return { day: day, t: title, h: hm };
  };
  window.snakeCalList = function () { var all = calEvents(), out = []; Object.keys(all).sort().forEach(function (d) { (all[d] || []).forEach(function (e) { out.push({ day: d, t: e.t, h: e.h }); }); }); return out; };
  registerApp('calendario', { title: 'Calendario', icon: '📅', width: 400, height: 560, render: renderCalendarApp });

  /* Ajustes y el Calendario: eventos de hoy en la pantalla de bloqueo (ver más abajo) */
  function todayEvents() { var e = calEvents()[ymd(new Date())]; return Array.isArray(e) ? e : []; }

  /* Recordatorios: aviso cuando llega la hora de un evento de hoy (respeta «No molestar») */
  (function () {
    var fired = {};
    function check() {
      try {
        if (!email()) return;
        if (!calSynced[email()]) syncCal();
        if (document.body.classList.contains('qs-dnd')) return;
        var d = new Date();
        var hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
        var key = ymd(d);
        todayEvents().forEach(function (e) {
          if (!e.h || e.h !== hm) return;
          var id = email() + '|' + key + '|' + e.id;
          if (fired[id]) return;
          fired[id] = 1;
          toast('📅 Recordatorio · ' + e.h + ' · ' + e.t, 8000);
        });
      } catch (x) {}
    }
    setInterval(check, 20000);
  })();

  /* =================== Notas: buscador, fijadas, colores y guardado automático =================== */
  var NOTE_COLORS = [
    { id: '', name: 'Sin color', c: 'transparent' },
    { id: 'green', name: 'Verde', c: '#34d17a' },
    { id: 'blue', name: 'Azul', c: '#4aa3ff' },
    { id: 'yellow', name: 'Amarillo', c: '#ffc94a' },
    { id: 'pink', name: 'Rosa', c: '#ff6b8a' },
    { id: 'purple', name: 'Morado', c: '#b07cff' }
  ];
  var CHECK_RE = /^(\s*[-*] )\[( |x|X)\] ?/;
  function checkProg(t) {
    var d = 0, tot = 0;
    String(t || '').split('\n').forEach(function (l) { var m = CHECK_RE.exec(l); if (m) { tot++; if (m[2].toLowerCase() === 'x') d++; } });
    return tot ? d + '/' + tot : '';
  }
  function noteColor(id) { for (var i = 0; i < NOTE_COLORS.length; i++) if (NOTE_COLORS[i].id === (id || '')) return NOTE_COLORS[i]; return NOTE_COLORS[0]; }
  function notesArr() {
    try { if (typeof getNotesFor === 'function') { var n = getNotesFor(); if (Array.isArray(n)) return n; } } catch (e) {}
    try { if (typeof userNotes !== 'undefined' && Array.isArray(userNotes)) return userNotes; } catch (e2) {}
    return [];
  }

  addCss(
    '.snk4a-notes{display:flex;flex-direction:column;height:100%;min-height:0;gap:8px;color:var(--text,#fff);}' +
    '.snk4a-notes-top{display:flex;gap:6px;align-items:center;}' +
    '.snk4a-notes-top .snk4a-input{flex:1;}' +
    '.snk4a-notes-new textarea{margin:0;width:100%;box-sizing:border-box;min-height:46px;max-height:160px;resize:vertical;transition:min-height .15s ease;padding:8px 10px;border-radius:12px;font:inherit;font-size:0.85rem;' +
      'background:var(--input-bg,rgba(255,255,255,0.08));color:var(--text,#fff);border:1px solid var(--input-border,rgba(255,255,255,0.2));}' +
    '.snk4a-notes-new textarea:focus{min-height:86px;}' +
    'body.light .snk4a-notes-status .st.ok,body.theme-light .snk4a-notes-status .st.ok{color:#0b6b3a;}body.light .snk4a-notes-status .st.saving,body.theme-light .snk4a-notes-status .st.saving{color:#9a6a00;}' +
    '.snk4a-notes-new-row{display:flex;align-items:center;gap:8px;margin-top:6px;}' +
    '.snk4a-notes-new-row small{flex:1;font-size:0.68rem;opacity:0.6;}' +
    '.snk4a-notes-status{display:flex;align-items:center;justify-content:space-between;font-size:0.7rem;opacity:0.8;min-height:16px;}' +
    '.snk4a-notes-status .st.saving{color:#ffc94a;}.snk4a-notes-status .st.ok{color:var(--accent,#34d17a);}.snk4a-notes-status .st.err{color:#ff8a7a;}' +
    '.snk4a-notes-status .st{margin-left:auto;margin-right:8px;}' +
    '.snk4a-notes-exp{margin:0;width:auto;min-height:0;padding:2px 8px;border-radius:8px;font-size:0.7rem;background:transparent;border:1px solid var(--input-border,rgba(255,255,255,0.2));box-shadow:none;color:var(--text,#fff);cursor:pointer;}' +
    '.snk4a-notes-list{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:2px 2px 6px;}' +
    '.snk4a-note{position:relative;border-radius:12px;padding:9px 10px 8px 13px;background:var(--input-bg,rgba(255,255,255,0.07));border:1px solid var(--input-border,rgba(255,255,255,0.16));}' +
    '.snk4a-note::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:4px;border-radius:0 4px 4px 0;background:var(--nc,transparent);}' +
    '.snk4a-note.pinned{border-color:rgba(255,201,74,0.55);}' +
    '.snk4a-note-text{margin:0;font-size:0.86rem;white-space:pre-wrap;word-break:break-word;cursor:text;line-height:1.4;max-height:9.8em;overflow:hidden;}' +
    '.snk4a-note-text mark{background:rgba(255,201,74,0.45);color:inherit;border-radius:3px;}' +
    '.snk4a-note textarea{margin:0;width:100%;box-sizing:border-box;min-height:90px;resize:vertical;padding:6px 8px;border-radius:9px;font:inherit;font-size:0.86rem;line-height:1.4;' +
      'background:rgba(0,0,0,0.12);color:var(--text,#fff);border:1px solid var(--accent,#34d17a);}' +
    '.snk4a-note-foot{display:flex;align-items:center;gap:4px;margin-top:6px;}' +
    '.snk4a-note-foot .d{flex:1;font-size:0.66rem;opacity:0.62;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.snk4a-note-foot button{margin:0;width:auto;min-height:0;padding:3px 6px;border-radius:8px;font-size:0.8rem;background:transparent;border:1px solid transparent;box-shadow:none;cursor:pointer;color:inherit;opacity:0.75;}' +
    '.snk4a-note-foot button:hover{opacity:1;border-color:var(--input-border,rgba(255,255,255,0.25));}' +
    '.snk4a-note-foot button.on{opacity:1;}' +
    '.snk4a-note-colors{display:flex;gap:5px;padding:6px 0 0;}' +
    '.snk4a-note-colors button{margin:0;width:20px;height:20px;min-height:0;padding:0;border-radius:50%;box-shadow:none;cursor:pointer;border:2px solid var(--input-border,rgba(255,255,255,0.3));}' +
    '.snk4a-note-colors button.on{border-color:var(--text,#fff);transform:scale(1.12);}' +
    '.snk4a-notes-undo{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:10px;font-size:0.78rem;background:rgba(255,138,122,0.16);border:1px solid rgba(255,138,122,0.4);}' +
    '.snk4a-notes-undo span{flex:1;}' +
    '.snk4a-note-text label.snk4a-chk{cursor:pointer;display:inline-flex;align-items:flex-start;gap:4px;margin:0;padding:0;font-size:inherit;font-weight:inherit;color:inherit;text-transform:none;letter-spacing:normal;line-height:inherit;}' +
    '.snk4a-chk input{margin:2px 0 0;width:15px;height:15px;accent-color:var(--accent,#34d17a);cursor:pointer;flex:0 0 auto;}' +
    '.snk4a-chk.on span{text-decoration:line-through;opacity:0.6;}' +
    'body.phone-mode .snk4a-note-foot button{padding:6px 9px;font-size:0.95rem;}'
  );

  function renderNotesPlus(body) {
    var query = '';
    var editing = null;
    var undo = null;
    var saveTimer = null;
    var state = 'idle';
    var openColors = null;
    body.innerHTML =
      '<div class="snk4a-notes">' +
      '<div class="snk4a-notes-new"><textarea placeholder="Escribe algo para recordar… (Ctrl+Enter para guardar)" aria-label="Nueva nota" maxlength="5000"></textarea>' +
      '<div class="snk4a-notes-new-row"><small></small><button type="button" class="snk4a-btn" data-chk="1" title="Añadir una casilla de lista">☑ Lista</button><button type="button" class="snk4a-btn primary" data-add="1">＋ Añadir nota</button></div></div>' +
      '<div class="snk4a-notes-top"><input type="search" class="snk4a-input" placeholder="🔎 Buscar en tus notas…" aria-label="Buscar notas"></div>' +
      '<div class="snk4a-notes-status"><span class="cnt"></span><span class="st"></span><button type="button" class="snk4a-notes-exp" title="Descargar todas las notas en un .txt">⬇️ Exportar</button></div>' +
      '<div class="snk4a-notes-undo-slot"></div>' +
      '<div class="snk4a-notes-list" role="list"></div></div>';
    var newTa = body.querySelector('.snk4a-notes-new textarea');
    var newHint = body.querySelector('.snk4a-notes-new-row small');
    var search = body.querySelector('.snk4a-notes-top input');
    var list = body.querySelector('.snk4a-notes-list');
    var cnt = body.querySelector('.snk4a-notes-status .cnt');
    var st = body.querySelector('.snk4a-notes-status .st');
    var undoSlot = body.querySelector('.snk4a-notes-undo-slot');

    function setState(s) {
      state = s;
      st.className = 'st ' + s;
      st.textContent = s === 'saving' ? '⏳ Guardando…' : s === 'ok' ? '✓ Guardado' : s === 'err' ? '⚠️ No se pudo guardar, se reintentará' : '';
    }
    function saveNow() {
      clearTimeout(saveTimer); saveTimer = null;
      setState('saving');
      return apiCall('/api/notes', { method: 'PUT', body: notesArr() }).then(function () {
        if (body.isConnected) setState('ok');
      }).catch(function () {
        if (!body.isConnected) return;
        setState('err');
        saveTimer = setTimeout(saveNow, 8000);
      });
    }
    function saveSoon() { setState('saving'); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700); }
    function nowStr() { return new Date().toLocaleString('es-ES'); }

    function addNote() {
      var t = newTa.value.replace(/\s+$/, '');
      if (!t.trim()) { newTa.focus(); return; }
      var arr = notesArr();
      arr.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2), text: t, date: nowStr() });
      newTa.value = '';
      newHint.textContent = '';
      saveNow();
      paint();
    }
    function highlight(text) {
      var h = esc(text);
      var q = query.trim();
      if (!q) return h;
      var qe = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try { return h.replace(new RegExp(qe, 'gi'), function (m) { return '<mark>' + m + '</mark>'; }); } catch (e) { return h; }
    }
    function sorted() {
      var arr = notesArr();
      var idx = arr.map(function (n, i) { return { n: n, i: i }; });
      idx.sort(function (a, b) {
        var pa = a.n.pinned ? 1 : 0, pb = b.n.pinned ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return b.i - a.i;
      });
      return idx.map(function (x) { return x.n; });
    }
    function paint() {
      var all = notesArr();
      var q = query.trim().toLowerCase();
      var shown = sorted().filter(function (n) { return !q || String(n.text || '').toLowerCase().indexOf(q) >= 0; });
      var pinned = all.filter(function (n) { return n.pinned; }).length;
      cnt.textContent = all.length ? (all.length + (all.length === 1 ? ' nota' : ' notas') + (pinned ? ' · ' + pinned + ' fijada' + (pinned === 1 ? '' : 's') : '') + (q ? ' · ' + shown.length + ' encontrada' + (shown.length === 1 ? '' : 's') : '')) : '';
      list.innerHTML = '';
      if (!all.length) {
        list.innerHTML = '<div class="snk4a-empty"><span class="big">📝</span>Todavía no tienes notas guardadas.<br>Escribe arriba tu primera nota.</div>';
        return;
      }
      if (!shown.length) {
        list.innerHTML = '<div class="snk4a-empty"><span class="big">🔎</span>Ninguna nota contiene «' + esc(query) + '».</div>';
        return;
      }
      shown.forEach(function (n) { list.appendChild(noteEl(n)); });
    }
    function noteEl(n) {
      var el = document.createElement('div');
      el.className = 'snk4a-note' + (n.pinned ? ' pinned' : '');
      el.setAttribute('role', 'listitem');
      el.style.setProperty('--nc', noteColor(n.color).c);
      el.dataset.id = n.id;
      var isEd = editing === n.id;
      if (isEd) {
        var ta = document.createElement('textarea');
        ta.value = n.text || '';
        ta.maxLength = 5000;
        ta.setAttribute('aria-label', 'Editar nota');
        ta.addEventListener('input', function () {
          n.text = ta.value;
          n.edited = nowStr();
          saveSoon();
        });
        ta.addEventListener('keydown', function (ev) {
          if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); finishEdit(); }
        });
        el.appendChild(ta);
        setTimeout(function () { try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {} }, 0);
      } else {
        var p = document.createElement('p');
        p.className = 'snk4a-note-text';
        var srcLines = String(n.text || '').split('\n');
        var hasChecks = srcLines.some(function (l) { return CHECK_RE.test(l); });
        if (hasChecks) {
          p.innerHTML = srcLines.map(function (l, li) {
            var m = CHECK_RE.exec(l);
            if (!m) return highlight(l);
            var on = m[2].toLowerCase() === 'x';
            return '<label class="snk4a-chk' + (on ? ' on' : '') + '" data-li="' + li + '"><input type="checkbox"' + (on ? ' checked' : '') + '> <span>' + highlight(l.slice(m[0].length)) + '</span></label>';
          }).join('\n');
          p.querySelectorAll('.snk4a-chk').forEach(function (lab) {
            lab.addEventListener('click', function (ev) { ev.stopPropagation(); });
            lab.querySelector('input').addEventListener('change', function () {
              var arrL = String(n.text || '').split('\n');
              var li = +lab.dataset.li;
              var mm = CHECK_RE.exec(arrL[li] || '');
              if (!mm) return;
              arrL[li] = mm[1] + '[' + (this.checked ? 'x' : ' ') + '] ' + arrL[li].slice(mm[0].length);
              n.text = arrL.join('\n');
              saveNow();
              paint();
            });
          });
        } else {
          p.innerHTML = highlight(n.text || '');
        }
        p.title = 'Haz clic para editar';
        p.addEventListener('click', function () { editing = n.id; openColors = null; paint(); });
        el.appendChild(p);
      }
      var foot = document.createElement('div');
      foot.className = 'snk4a-note-foot';
      foot.innerHTML = '<span class="d">' + (n.pinned ? '📌 ' : '') + (!isEd && checkProg(n.text) ? '☑ ' + esc(checkProg(n.text)) + ' · ' : '') + esc(n.edited ? 'Editada ' + n.edited : (n.date || '')) + '</span>';
      function fb(ico, label, fn, on) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = ico; b.title = label; b.setAttribute('aria-label', label);
        if (on) b.classList.add('on');
        b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); });
        foot.appendChild(b);
      }
      if (isEd) fb('✓', 'Terminar de editar', finishEdit);
      else fb('✏️', 'Editar', function () { editing = n.id; openColors = null; paint(); });
      fb('📌', n.pinned ? 'Quitar de fijadas' : 'Fijar arriba', function () { n.pinned = !n.pinned; if (!n.pinned) delete n.pinned; saveNow(); paint(); }, n.pinned);
      fb('🎨', 'Color', function () { openColors = openColors === n.id ? null : n.id; paint(); }, openColors === n.id);
      fb('📋', 'Copiar texto', function () { copyText(n.text || '').then(function () { toast('Nota copiada'); }, function () { toast('No se pudo copiar'); }); });
      fb('⬇️', 'Descargar como .txt', function () {
        var name = String(n.text || 'nota').split('\n')[0].replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 40) || 'nota';
        downloadText(name + '.txt', n.text || '');
      });
      fb('🗑️', 'Eliminar', function () { removeNote(n); });
      el.appendChild(foot);
      if (openColors === n.id) {
        var cr = document.createElement('div');
        cr.className = 'snk4a-note-colors';
        NOTE_COLORS.forEach(function (c) {
          var b = document.createElement('button');
          b.type = 'button';
          b.title = c.name; b.setAttribute('aria-label', c.name);
          b.style.background = c.id ? c.c : 'repeating-linear-gradient(45deg,rgba(127,127,127,0.4) 0 3px,transparent 3px 6px)';
          if ((n.color || '') === c.id) b.classList.add('on');
          b.addEventListener('click', function () { if (c.id) n.color = c.id; else delete n.color; openColors = null; saveNow(); paint(); });
          cr.appendChild(b);
        });
        el.appendChild(cr);
      }
      return el;
    }
    function finishEdit() {
      var arr = notesArr();
      var n = arr.filter(function (x) { return x.id === editing; })[0];
      editing = null;
      if (n && !String(n.text || '').trim()) { removeNote(n); return; }
      if (saveTimer) saveNow();
      paint();
    }
    function removeNote(n) {
      var arr = notesArr();
      var i = arr.indexOf(n);
      if (i < 0) return;
      arr.splice(i, 1);
      if (editing === n.id) editing = null;
      saveNow();
      showUndo(n, i);
      paint();
    }
    function showUndo(n, i) {
      clearTimeout(undo && undo.t);
      undoSlot.innerHTML = '<div class="snk4a-notes-undo"><span>🗑️ Nota eliminada</span><button type="button" class="snk4a-btn">Deshacer</button></div>';
      undo = { n: n, i: i, t: setTimeout(function () { undoSlot.innerHTML = ''; undo = null; }, 6000) };
      undoSlot.querySelector('button').addEventListener('click', function () {
        if (!undo) return;
        var arr = notesArr();
        arr.splice(Math.min(undo.i, arr.length), 0, undo.n);
        clearTimeout(undo.t); undo = null; undoSlot.innerHTML = '';
        saveNow(); paint();
      });
    }
    body.querySelector('[data-add]').addEventListener('click', addNote);
    body.querySelector('[data-chk]').addEventListener('click', function () {
      var v = newTa.value;
      var pre = (!v || /\n$/.test(v)) ? '' : '\n';
      newTa.value = v + pre + '- [ ] ';
      newTa.focus();
      newTa.setSelectionRange(newTa.value.length, newTa.value.length);
      newTa.dispatchEvent(new Event('input'));
    });
    newTa.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      var v = newTa.value, pos = newTa.selectionStart;
      var lineStart = v.lastIndexOf('\n', pos - 1) + 1;
      var line = v.slice(lineStart, pos);
      var m = CHECK_RE.exec(line);
      if (!m) return;
      ev.preventDefault();
      if (line.slice(m[0].length).trim() === '') { newTa.value = v.slice(0, lineStart) + v.slice(pos); newTa.setSelectionRange(lineStart, lineStart); return; }
      var ins = '\n' + m[1] + '[ ] ';
      newTa.value = v.slice(0, pos) + ins + v.slice(newTa.selectionEnd);
      newTa.setSelectionRange(pos + ins.length, pos + ins.length);
    });
    newTa.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); addNote(); } });
    newTa.addEventListener('input', function () { var l = newTa.value.length; newHint.textContent = l ? l + ' caracteres' : ''; });
    search.addEventListener('input', function () { query = search.value; paint(); });
    body.querySelector('.snk4a-notes-exp').addEventListener('click', function () {
      var arr = sorted();
      if (!arr.length) { toast('No tienes notas que exportar'); return; }
      var txt = arr.map(function (n) { return (n.pinned ? '📌 ' : '') + (n.edited || n.date || '') + '\n' + (n.text || ''); }).join('\n\n-----\n\n');
      var d = new Date();
      downloadText('notas-' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + '.txt', txt);
    });
    paint();
    return function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; try { apiCall('/api/notes', { method: 'PUT', body: notesArr() }).catch(function () {}); } catch (e) {} }
      if (undo) clearTimeout(undo.t);
    };
  }
  wrapApp('notes', function (body) { return renderNotesPlus(body); });
  afterInstall(function (apps) { if (apps.notes && apps.notes.width < 400) { apps.notes.width = 400; apps.notes.height = Math.max(apps.notes.height || 0, 560); } });

  /* =================== Explorador: vista, orden, buscador, renombrar y detalles =================== */
  function filesArr() { try { return (typeof uploadedFiles !== 'undefined' && Array.isArray(uploadedFiles)) ? uploadedFiles : []; } catch (e) { return []; } }
  function trashArr() { try { return (typeof trashFiles !== 'undefined' && Array.isArray(trashFiles)) ? trashFiles : []; } catch (e) { return []; } }
  /* Enviar a la papelera guardando primero la papelera y después la lista de archivos:
     así el servidor nunca ve el archivo fuera de las dos listas (evita que borre su contenido). */
  function safeTrash(id) {
    var files = filesArr(), tr = trashArr();
    var idx = -1;
    for (var i = 0; i < files.length; i++) if (files[i].id === id) { idx = i; break; }
    if (idx < 0) return false;
    var entry = files.splice(idx, 1)[0];
    tr.push(entry);
    try { if (typeof closeApp === 'function') closeApp('file-' + entry.id); } catch (e) {}
    Promise.resolve().then(function () { return persistTrash(); }).then(function () { return persistFiles(); })
      .catch(function () { toast('Revisa la conexión: no se pudo guardar el cambio'); });
    try { refreshFileUI(); } catch (e2) {}
    return true;
  }
  function fIcon(e) { try { return fileIcon(e.name || '', e.type || ''); } catch (x) { return '📄'; } }
  function fSize(e) { return (typeof e.size === 'number' && e.size > 0) ? e.size : (e.dataUrl ? e.dataUrl.length : 0); }
  function fExt(e) { var m = /\.([a-z0-9]{1,8})$/i.exec(e.name || ''); return m ? m[1].toUpperCase() : ''; }
  function fKind(e) {
    var t = e.type || '', x = fExt(e).toLowerCase();
    if (/^image\//.test(t)) return 'Imagen';
    if (/^video\//.test(t)) return 'Vídeo';
    if (/^audio\//.test(t)) return 'Audio';
    if (/pdf/.test(t) || x === 'pdf') return 'PDF';
    if (/^text\//.test(t) || ['txt', 'md', 'js', 'py', 'html', 'css', 'json', 'csv'].indexOf(x) >= 0) return 'Texto';
    if (['zip', 'rar', '7z', 'gz', 'tar'].indexOf(x) >= 0) return 'Comprimido';
    return x ? 'Archivo ' + x.toUpperCase() : 'Archivo';
  }

  addCss(
    '.snk4a-fx-bar{display:flex;gap:6px;align-items:center;margin:8px 0;flex-wrap:wrap;}' +
    '.snk4a-fx-bar .snk4a-input{flex:1;min-width:120px;}' +
    '.snk4a-fx-bar select{margin:0;width:auto;min-height:36px;padding:4px 8px;border-radius:10px;font-size:0.8rem;background:var(--input-bg,rgba(255,255,255,0.08));color:var(--text,#fff);border:1px solid var(--input-border,rgba(255,255,255,0.2));}' +
    '.snk4a-fx-bar select option{color:#111;}' +
    '.snk4a-fx-view{display:inline-flex;border-radius:10px;overflow:hidden;border:1px solid var(--input-border,rgba(255,255,255,0.2));}' +
    '.snk4a-fx-view button{margin:0;width:auto;min-height:34px;padding:4px 10px;border:none;border-radius:0;box-shadow:none;background:transparent;color:var(--text,#fff);cursor:pointer;font-size:0.9rem;}' +
    '.snk4a-fx-view button.on{background:rgba(52,209,122,0.25);}' +
    '.snk4a-fx .explorer-item.sel{background:rgba(52,209,122,0.18);outline:1px solid rgba(52,209,122,0.5);}' +
    '.snk4a-fx .explorer-item .lb{max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word;}' +
    '.snk4a-fx-list{display:flex;flex-direction:column;gap:3px;margin-bottom:12px;}' +
    '.snk4a-fx-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:10px;cursor:pointer;font-size:0.8rem;}' +
    '.snk4a-fx-row:hover{background:var(--input-bg,rgba(255,255,255,0.06));}' +
    '.snk4a-fx-row.sel{background:rgba(52,209,122,0.18);}' +
    '.snk4a-fx-row .ic{font-size:1.2rem;flex:0 0 24px;text-align:center;}' +
    '.snk4a-fx-row .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}' +
    '.snk4a-fx-row .ty{flex:0 0 78px;opacity:0.65;font-size:0.72rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.snk4a-fx-row .sz{flex:0 0 64px;opacity:0.75;font-size:0.72rem;text-align:right;font-variant-numeric:tabular-nums;}' +
    '.snk4a-fx-row button{margin:0;width:auto;min-height:0;padding:3px 6px;border-radius:8px;background:transparent;border:none;box-shadow:none;cursor:pointer;color:inherit;opacity:0.7;}' +
    '.snk4a-fx-row button:hover{opacity:1;}' +
    '.snk4a-fx-det{margin:6px 0 10px;padding:10px 12px;border-radius:12px;background:var(--input-bg,rgba(255,255,255,0.07));border:1px solid var(--input-border,rgba(255,255,255,0.16));font-size:0.8rem;}' +
    '.snk4a-fx-det-h{display:flex;align-items:center;gap:10px;margin-bottom:6px;}' +
    '.snk4a-fx-det-h .ic{font-size:2rem;}' +
    '.snk4a-fx-det-h b{flex:1;min-width:0;word-break:break-word;font-size:0.9rem;}' +
    '.snk4a-fx-det dl{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:0 0 8px;}' +
    '.snk4a-fx-det dt{opacity:0.6;}.snk4a-fx-det dd{margin:0;word-break:break-word;}' +
    '.snk4a-fx-det-a{display:flex;gap:6px;flex-wrap:wrap;}' +
    '.snk4a-fx-ren{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;}.snk4a-fx-ren .snk4a-input{flex:1;min-width:140px;}' +
    '.snk4a-fx-err{color:#ff8a7a;font-size:0.74rem;margin-top:4px;}' +
    '.snk4a-fx-store{margin-top:4px;}' +
    '.snk4a-fx-meter{height:7px;border-radius:999px;background:rgba(127,127,127,0.25);overflow:hidden;margin:4px 0 2px;}' +
    '.snk4a-fx-meter i{display:block;height:100%;min-width:3px;border-radius:999px;background:linear-gradient(90deg,var(--accent,#34d17a),#4aa3ff);}' +
    'body.phone-mode .snk4a-fx-row{padding:9px 8px;}body.phone-mode .snk4a-fx-row .ty{display:none;}body.phone-mode .snk4a-fx-row button{padding:6px 9px;}' +
    '.snk4a-fx{position:relative;}' +
    '.snk4a-fx-drop{position:absolute;inset:4px;z-index:5;display:none;align-items:center;justify-content:center;border-radius:14px;border:2px dashed var(--accent,#34d17a);background:rgba(52,209,122,0.16);backdrop-filter:blur(2px);font-weight:800;font-size:0.95rem;pointer-events:none;}' +
    '.snk4a-fx-drop.show{display:flex;}' +
    '.snk4a-confirm{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0;padding:9px 11px;border-radius:12px;font-size:0.8rem;background:rgba(255,138,122,0.16);border:1px solid rgba(255,138,122,0.45);}' +
    '.snk4a-confirm span{flex:1;min-width:150px;}'
  );

  function renderExplorerPlus(body, orig) {
    orig(body);
    var origGrid = body.querySelector('#explorerGrid-x');
    var msg = body.querySelector('#explorerMsg-x');
    var storeP = body.querySelector('#explorerStorage-x');
    if (!origGrid) return;
    body.classList.add('snk4a-fx');
    var prefs = lsGet('fx', { view: 'grid', sort: 'name' }) || {};
    var view = prefs.view === 'list' ? 'list' : 'grid';
    var sort = prefs.sort || 'name';
    var query = '';
    var selId = null;
    var renaming = false;
    var bar = document.createElement('div');
    bar.className = 'snk4a-fx-bar';
    bar.innerHTML = '<input type="search" class="snk4a-input" placeholder="🔎 Buscar archivos…" aria-label="Buscar archivos">' +
      '<select aria-label="Ordenar por"><option value="name">Nombre</option><option value="recent">Recientes</option><option value="size">Tamaño</option><option value="type">Tipo</option></select>' +
      '<span class="snk4a-fx-view" role="group" aria-label="Vista"><button type="button" data-v="grid" title="Cuadrícula" aria-label="Vista de cuadrícula">▦</button><button type="button" data-v="list" title="Lista" aria-label="Vista de lista">☰</button></span>';
    origGrid.parentNode.insertBefore(bar, origGrid);
    var holder = document.createElement('div');
    origGrid.parentNode.insertBefore(holder, origGrid);
    origGrid.style.display = 'none';
    var det = document.createElement('div');
    holder.parentNode.insertBefore(det, holder.nextSibling);
    var search = bar.querySelector('input');
    var sel = bar.querySelector('select');
    sel.value = sort;
    search.addEventListener('input', function () { query = search.value; paint(); });
    sel.addEventListener('change', function () { sort = sel.value; lsSet('fx', { view: view, sort: sort }); paint(); });
    bar.querySelectorAll('[data-v]').forEach(function (b) {
      b.addEventListener('click', function () { view = b.dataset.v; lsSet('fx', { view: view, sort: sort }); paint(); });
    });
    /* Medidor de espacio */
    if (storeP) {
      try {
        var used = getUsedBytes();
        var sub = typeof isCloudSubscribed === 'function' && isCloudSubscribed();
        var total = typeof TOTAL_STORAGE_BYTES !== 'undefined' ? TOTAL_STORAGE_BYTES : 128 * 1073741824;
        var pct = sub ? 2 : Math.min(100, used / total * 100);
        var m = document.createElement('div');
        m.className = 'snk4a-fx-store';
        m.innerHTML = '<div class="snk4a-fx-meter" title="' + esc(fmtBytes(used)) + '"><i style="width:' + pct.toFixed(2) + '%"></i></div>';
        storeP.parentNode.insertBefore(m, storeP);
      } catch (eS) {}
    }
    function list() {
      var q = query.trim().toLowerCase();
      var arr = filesArr().filter(function (e) {
        var n = String(e.name || '');
        if (/(^|\/)\.keep$/.test(n)) return false; // marcador interno de carpeta vacía
        return !q || n.toLowerCase().indexOf(q) >= 0;
      });
      var withIdx = arr.map(function (e, i) { return { e: e, i: i }; });
      withIdx.sort(function (a, b) {
        if (sort === 'recent') return (+b.e.id || 0) - (+a.e.id || 0);
        if (sort === 'size') return fSize(b.e) - fSize(a.e);
        if (sort === 'type') return (fKind(a.e) + a.e.name).localeCompare(fKind(b.e) + b.e.name, 'es');
        return String(a.e.name || '').localeCompare(String(b.e.name || ''), 'es', { numeric: true, sensitivity: 'base' });
      });
      return withIdx.map(function (x) { return x.e; });
    }
    function findSel() { return filesArr().filter(function (e) { return e.id === selId; })[0] || null; }
    function select(e) { selId = selId === e.id ? null : e.id; renaming = false; paint(); try { body.focus({ preventScroll: true }); } catch (x) {} }
    function paint() {
      bar.querySelectorAll('[data-v]').forEach(function (b) { b.classList.toggle('on', b.dataset.v === view); });
      holder.innerHTML = '';
      var q = query.trim();
      // Cuadrícula sin búsqueda: se usa la vista original con carpetas (abrir, arrastrar, clic derecho).
      if (view === 'grid' && !q) { origGrid.style.display = ''; paintDet(); return; }
      origGrid.style.display = 'none';
      var items = list();
      if (view === 'grid') {
        var g = document.createElement('div');
        g.className = 'explorer-grid';
        if (!q) Array.prototype.forEach.call(origGrid.children, function (c) {
          if (!c.querySelector('.file-del-btn')) {
            var cl = c.cloneNode(true);
            cl.addEventListener('click', function () { if (msg) msg.textContent = 'Abriendo "' + (cl.textContent || '').trim() + '"…'; });
            g.appendChild(cl);
          }
        });
        items.forEach(function (e) {
          var it = document.createElement('div');
          it.className = 'explorer-item' + (e.id === selId ? ' sel' : '');
          it.title = e.name + ' · ' + fmtBytes(fSize(e));
          it.innerHTML = '<span class="ic">' + fIcon(e) + '</span><span class="lb">' + esc(e.name) + '</span>';
          var del = document.createElement('button');
          del.type = 'button'; del.className = 'file-del-btn'; del.title = 'Enviar a la papelera'; del.textContent = '🗑️';
          del.addEventListener('click', function (ev) { ev.stopPropagation(); trash(e); });
          it.appendChild(del);
          it.addEventListener('click', function () { select(e); });
          it.addEventListener('dblclick', function () { openF(e); });
          g.appendChild(it);
        });
        holder.appendChild(g);
      } else {
        var l = document.createElement('div');
        l.className = 'snk4a-fx-list';
        items.forEach(function (e) {
          var r = document.createElement('div');
          r.className = 'snk4a-fx-row' + (e.id === selId ? ' sel' : '');
          r.innerHTML = '<span class="ic">' + fIcon(e) + '</span><span class="nm">' + esc(e.name) + '</span><span class="ty">' + esc(fKind(e)) + '</span><span class="sz">' + esc(fmtBytes(fSize(e))) + '</span>';
          function rb(t, lab, fn) { var b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.title = lab; b.setAttribute('aria-label', lab); b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); }); r.appendChild(b); }
          rb('↗️', 'Abrir', function () { openF(e); });
          rb('🗑️', 'Enviar a la papelera', function () { trash(e); });
          r.addEventListener('click', function () { select(e); });
          r.addEventListener('dblclick', function () { openF(e); });
          l.appendChild(r);
        });
        holder.appendChild(l);
      }
      if (!items.length) {
        var em = document.createElement('div');
        em.className = 'snk4a-empty';
        em.innerHTML = q ? '<span class="big">🔎</span>Ningún archivo coincide con «' + esc(q) + '».' : '<span class="big">📂</span>Todavía no has subido archivos.<br>Pulsa «Subir archivo(s)» para guardar los tuyos.';
        holder.appendChild(em);
      }
      paintDet();
    }
    function paintDet() {
      var e = findSel();
      det.innerHTML = '';
      det.className = '';
      if (!e) return;
      det.className = 'snk4a-fx-det';
      det.innerHTML = '<div class="snk4a-fx-det-h"><span class="ic">' + fIcon(e) + '</span><b>' + esc(e.name) + '</b>' +
        '<button type="button" class="snk4a-btn" data-x="close" aria-label="Cerrar detalles">✕</button></div>' +
        '<dl><dt>Tipo</dt><dd>' + esc(fKind(e)) + (e.type ? ' · ' + esc(e.type) : '') + '</dd><dt>Tamaño</dt><dd>' + esc(fmtBytes(fSize(e))) + '</dd>' +
        '<dt>Ubicación</dt><dd>Mis archivos (privados de tu cuenta)</dd></dl>' +
        '<div style="font-size:0.68rem;opacity:0.6;margin:-4px 0 8px">Atajos: Intro abrir · F2 renombrar · Supr papelera</div>' +
        '<div class="snk4a-fx-det-a"><button type="button" class="snk4a-btn primary" data-x="open">↗️ Abrir</button>' +
        '<button type="button" class="snk4a-btn" data-x="ren">✏️ Renombrar</button>' +
        '<button type="button" class="snk4a-btn danger" data-x="trash">🗑️ Papelera</button></div>';
      det.querySelector('[data-x=close]').addEventListener('click', function () { selId = null; renaming = false; paint(); });
      det.querySelector('[data-x=open]').addEventListener('click', function () { openF(e); });
      det.querySelector('[data-x=trash]').addEventListener('click', function () { trash(e); });
      det.querySelector('[data-x=ren]').addEventListener('click', function () { renaming = true; paintDet(); });
      if (renaming) {
        var rw = document.createElement('div');
        rw.className = 'snk4a-fx-ren';
        rw.innerHTML = '<input type="text" class="snk4a-input" maxlength="120" aria-label="Nuevo nombre"><button type="button" class="snk4a-btn primary">Guardar</button><button type="button" class="snk4a-btn">Cancelar</button>';
        det.appendChild(rw);
        var err = document.createElement('div'); err.className = 'snk4a-fx-err'; det.appendChild(err);
        var inp = rw.querySelector('input');
        inp.value = e.name;
        setTimeout(function () { try { inp.focus(); var dot = e.name.lastIndexOf('.'); inp.setSelectionRange(0, dot > 0 ? dot : e.name.length); } catch (x) {} }, 0);
        var bs = rw.querySelectorAll('button');
        function doRen() {
          var nn = inp.value.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim();
          if (!nn) { err.textContent = 'Escribe un nombre válido.'; return; }
          if (nn === e.name) { renaming = false; paintDet(); return; }
          var dup = filesArr().some(function (x) { return x !== e && String(x.name).toLowerCase() === nn.toLowerCase(); });
          if (dup) { err.textContent = 'Ya tienes un archivo con ese nombre.'; return; }
          var old = e.name;
          e.name = nn;
          renaming = false;
          Promise.resolve().then(function () { return persistFiles(); }).then(function () {
            toast('Archivo renombrado');
          }).catch(function () {
            e.name = old;
            toast('No se pudo renombrar. Revisa la conexión.');
            try { refreshFileUI(); } catch (x2) {}
          });
          try { refreshFileUI(); } catch (x) { paint(); }
        }
        bs[0].addEventListener('click', doRen);
        bs[1].addEventListener('click', function () { renaming = false; paintDet(); });
        inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') doRen(); else if (ev.key === 'Escape') { renaming = false; paintDet(); } });
      }
    }
    function openF(e) { try { openFileViewerWindow(e); } catch (x) {} }
    function trash(e) { if (selId === e.id) selId = null; try { if (safeTrash(e.id)) toast('Enviado a la papelera'); } catch (x) {} }
    /* Teclado: Supr = papelera, F2 = renombrar, Intro = abrir, Esc = cerrar detalles */
    function onKeyFx(ev) {
      var t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      var e = findSel();
      if (!e) return;
      if (ev.key === 'Delete') { ev.preventDefault(); trash(e); }
      else if (ev.key === 'F2') { ev.preventDefault(); renaming = true; paintDet(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); openF(e); }
      else if (ev.key === 'Escape') { selId = null; renaming = false; paint(); }
    }
    body.addEventListener('keydown', onKeyFx);
    if (!body.hasAttribute('tabindex')) body.setAttribute('tabindex', '-1');
    /* Arrastrar y soltar archivos del ordenador para subirlos */
    var fileInput = body.querySelector('#fileInput-x');
    var dropOv = document.createElement('div');
    dropOv.className = 'snk4a-fx-drop';
    dropOv.innerHTML = '<div>📥 Suelta aquí para subir</div>';
    body.appendChild(dropOv);
    var dragDepth = 0;
    function hasFiles(ev) { try { return Array.prototype.indexOf.call(ev.dataTransfer.types || [], 'Files') >= 0; } catch (x) { return false; } }
    function onEnter(ev) { if (!hasFiles(ev)) return; ev.preventDefault(); dragDepth++; dropOv.classList.add('show'); }
    function onOver(ev) { if (!hasFiles(ev)) return; ev.preventDefault(); try { ev.dataTransfer.dropEffect = 'copy'; } catch (x) {} }
    function onLeave(ev) { if (!hasFiles(ev)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropOv.classList.remove('show'); }
    function onDrop(ev) {
      if (!hasFiles(ev)) return;
      ev.preventDefault();
      dragDepth = 0; dropOv.classList.remove('show');
      var files = ev.dataTransfer.files;
      if (!files || !files.length || !fileInput) return;
      try {
        var dt = new DataTransfer();
        Array.prototype.forEach.call(files, function (f) { dt.items.add(f); });
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (x) { toast('No se pudieron subir los archivos'); }
    }
    body.addEventListener('dragenter', onEnter);
    body.addEventListener('dragover', onOver);
    body.addEventListener('dragleave', onLeave);
    body.addEventListener('drop', onDrop);
    /* recordar selección entre repintados del sistema */
    selId = window.__snk4aFxSel || null;
    paint();
    return function () {
      window.__snk4aFxSel = selId;
      body.removeEventListener('dragenter', onEnter); body.removeEventListener('dragover', onOver);
      body.removeEventListener('dragleave', onLeave); body.removeEventListener('drop', onDrop);
      body.removeEventListener('keydown', onKeyFx);
      body.classList.remove('snk4a-fx');
    };
  }
  wrapApp('explorer', renderExplorerPlus);

  /* =================== Papelera: resumen y confirmación antes de vaciar =================== */
  function renderTrashPlus(body, orig) {
    orig(body);
    var btn = body.querySelector('#emptyTrashBtn-x');
    var msg = body.querySelector('#trashMsg-x');
    var arr = trashArr();
    if (msg && arr.length) {
      var tot = arr.reduce(function (s, e) { return s + fSize(e); }, 0);
      msg.textContent = arr.length + (arr.length === 1 ? ' archivo' : ' archivos') + ' · ' + fmtBytes(tot) + '. Pulsa ♻️ para restaurar o ❌ para eliminar para siempre.';
    }
    if (!arr.length) {
      var grid = body.querySelector('#trashGrid-x');
      if (grid) grid.innerHTML = '<div class="snk4a-empty" style="grid-column:1/-1"><span class="big">🗑️</span>La papelera está vacía.</div>';
      if (msg) msg.textContent = '';
      if (btn) { btn.disabled = true; btn.style.opacity = '0.55'; }
    }
    if (btn && arr.length) {
      var rs = document.createElement('button');
      rs.type = 'button';
      rs.className = 'snk4a-btn';
      rs.style.marginTop = '6px';
      rs.textContent = '♻️ Restaurar todo (' + arr.length + ')';
      rs.addEventListener('click', function () {
        try {
          var t = trashArr(), files = filesArr();
          if (!t.length) return;
          var n = t.length;
          while (t.length) files.push(t.shift());
          /* primero los archivos y después la papelera, para que el servidor nunca vea el archivo fuera de ambas listas */
          Promise.resolve().then(function () { return persistFiles(); }).then(function () { return persistTrash(); }).catch(function () { toast('Revisa la conexión: no se pudo guardar el cambio'); });
          refreshFileUI(true);
          toast(n + (n === 1 ? ' archivo restaurado' : ' archivos restaurados'));
        } catch (x) { toast('No se pudo restaurar'); }
      });
      btn.parentNode.insertBefore(rs, btn.nextSibling);
    }
    if (btn) {
      var ok = false;
      btn.addEventListener('click', function (ev) {
        if (ok || !trashArr().length) return;
        ev.stopImmediatePropagation();
        ev.preventDefault();
        if (body.querySelector('.snk4a-confirm')) return;
        var c = document.createElement('div');
        c.className = 'snk4a-confirm';
        c.innerHTML = '<span>¿Eliminar para siempre ' + trashArr().length + ' archivo(s)? No se puede deshacer.</span><button type="button" class="snk4a-btn danger">Vaciar</button><button type="button" class="snk4a-btn">Cancelar</button>';
        btn.parentNode.insertBefore(c, btn.nextSibling);
        var bs = c.querySelectorAll('button');
        bs[0].addEventListener('click', function () { ok = true; c.remove(); btn.click(); });
        bs[1].addEventListener('click', function () { c.remove(); });
      }, true);
    }
  }
  wrapApp('trash', renderTrashPlus);
  afterInstall(function (apps) { if (apps.explorer && apps.explorer.width < 460) { apps.explorer.width = 480; apps.explorer.height = Math.max(apps.explorer.height || 0, 520); } });

  /* =================== Doganiero AI: copiar respuestas, exportar y confirmar borrado =================== */
  addCss(
    '.snk4a-ai-copy{position:relative;}' +
    '.ai-msg.bot .snk4a-ai-cp{margin:0 0 0 2px;width:auto;min-height:0;align-self:flex-start;flex:0 0 auto;padding:2px 6px;border-radius:8px;font-size:0.72rem;line-height:1.2;cursor:pointer;' +
      'background:transparent;border:1px solid transparent;box-shadow:none;color:inherit;opacity:0;transition:opacity .15s ease;}' +
    '.ai-msg.bot:hover .snk4a-ai-cp,.ai-msg.bot .snk4a-ai-cp:focus-visible,.ai-msg.bot .snk4a-ai-cp.done{opacity:0.85;}' +
    '.ai-msg.bot .snk4a-ai-cp:hover{opacity:1;border-color:var(--input-border,rgba(255,255,255,0.25));}' +
    'body.phone-mode .ai-msg.bot .snk4a-ai-cp{opacity:0.7;padding:4px 7px;}' +
    '.snk4a-ai-tools{display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap;}' +
    '.snk4a-ai-tools .snk4a-btn{min-height:28px;padding:3px 10px;font-size:0.74rem;}'
  );
  function aiMsgText(msg) {
    var t = msg.querySelector('.ai-bubble-text');
    var src = t || msg;
    var c = src.cloneNode(true);
    c.querySelectorAll('.ai-gen-wrap,.snk4a-ai-cp,img,button').forEach(function (x) { x.remove(); });
    return (c.textContent || '').trim();
  }
  function decorateAiUser(root, body) {
    root.querySelectorAll('.ai-msg.user').forEach(function (m) {
      if (m.dataset.snk4a) return;
      m.dataset.snk4a = '1';
      m.title = 'Doble clic para reutilizar esta pregunta';
      m.addEventListener('dblclick', function () {
        var inp = body.querySelector('#aiInput-x');
        var t = (m.textContent || '').trim();
        if (!inp || !t) return;
        inp.value = t;
        try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        inp.focus();
        toast('Pregunta copiada al cuadro de texto');
      });
    });
  }
  function decorateAiMsgs(root) {
    root.querySelectorAll('.ai-msg.bot').forEach(function (m) {
      if (m.querySelector('.snk4a-ai-cp')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'snk4a-ai-cp';
      b.textContent = '📋';
      b.title = 'Copiar respuesta';
      b.setAttribute('aria-label', 'Copiar respuesta');
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var txt = aiMsgText(m);
        if (!txt) { toast('No hay texto que copiar'); return; }
        copyText(txt).then(function () {
          b.textContent = '✓'; b.classList.add('done'); toast('Respuesta copiada');
          setTimeout(function () { b.textContent = '📋'; b.classList.remove('done'); }, 1500);
        }, function () { toast('No se pudo copiar'); });
      });
      m.appendChild(b);
    });
  }
  function renderAIPlus(body, orig) {
    var cleanup = orig(body);
    var msgs = body.querySelector('#aiMessages-x');
    var mo = null;
    if (msgs) {
      decorateAiMsgs(msgs); decorateAiUser(msgs, body);
      mo = new MutationObserver(function () { decorateAiMsgs(msgs); decorateAiUser(msgs, body); });
      mo.observe(msgs, { childList: true });
    }
    var clear = body.querySelector('#aiClearBtn-x');
    if (clear) {
      var tools = document.createElement('div');
      tools.className = 'snk4a-ai-tools';
      clear.parentNode.insertBefore(tools, clear);
      tools.appendChild(clear);
      var exp = document.createElement('button');
      exp.type = 'button';
      exp.className = 'link-btn ai-clear-btn';
      exp.textContent = '⬇️ Exportar conversación';
      exp.addEventListener('click', function () {
        var lines = [];
        msgs.querySelectorAll('.ai-msg').forEach(function (m) {
          var who = m.classList.contains('user') ? ((cu() && cu().name) || 'Yo') : 'Doganiero AI';
          var t = m.classList.contains('user') ? (m.textContent || '').trim() : aiMsgText(m);
          if (t) lines.push(who + ':\n' + t + '\n');
        });
        if (!lines.length) { toast('La conversación está vacía'); return; }
        var d = new Date();
        downloadText('conversacion-doganiero-ai-' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + '.txt', lines.join('\n'));
      });
      tools.appendChild(exp);
      var ok = false;
      clear.addEventListener('click', function (ev) {
        if (ok) { ok = false; return; }
        var n = msgs ? msgs.querySelectorAll('.ai-msg.user').length : 0;
        if (!n) return;
        ev.stopImmediatePropagation(); ev.preventDefault();
        if (body.querySelector('.snk4a-confirm')) return;
        var c = document.createElement('div');
        c.className = 'snk4a-confirm';
        c.innerHTML = '<span>¿Borrar toda la conversación con Doganiero AI?</span><button type="button" class="snk4a-btn danger">Borrar</button><button type="button" class="snk4a-btn">Cancelar</button>';
        tools.parentNode.insertBefore(c, tools);
        var bs = c.querySelectorAll('button');
        bs[0].addEventListener('click', function () { c.remove(); ok = true; clear.click(); toast('Conversación borrada'); });
        bs[1].addEventListener('click', function () { c.remove(); });
      }, true);
    }
    return function () {
      if (mo) mo.disconnect();
      if (typeof cleanup === 'function') cleanup();
    };
  }
  wrapApp('ai', renderAIPlus);

  /* =================== Code Lab: temas, tamaño de letra, números de línea y descarga =================== */
  var CODE_THEMES = {
    auto: { name: 'Tema: automático' },
    dark: { name: 'Tema: noche', bg: '#0f1a14', fg: '#d7ffe6', gut: '#0a120e', gfg: '#5d8a70' },
    light: { name: 'Tema: claro', bg: '#fbfdfb', fg: '#16261c', gut: '#eef3ef', gfg: '#8aa294' },
    monokai: { name: 'Tema: Monokai', bg: '#272822', fg: '#f8f8f2', gut: '#1e1f1a', gfg: '#75715e' },
    ocean: { name: 'Tema: océano', bg: '#0b1730', fg: '#cfe3ff', gut: '#081124', gfg: '#5b7bb0' }
  };
  addCss(
    '.snk4a-code-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;flex-shrink:0;}' +
    '.snk4a-code-bar .snk4a-btn{min-height:30px;padding:4px 10px;font-size:0.76rem;}' +
    '.snk4a-code-bar select{margin:0;width:auto;min-height:30px;padding:3px 8px;border-radius:10px;font-size:0.76rem;background:var(--input-bg,rgba(255,255,255,0.08));color:var(--text,#fff);border:1px solid var(--input-border,rgba(255,255,255,0.2));}' +
    '.snk4a-code-bar select option{color:#111;}' +
    '.snk4a-code-bar .pos{margin-left:auto;font-size:0.7rem;opacity:0.7;font-variant-numeric:tabular-nums;white-space:nowrap;}' +
    '.snk4a-code-bar .fs{font-size:0.72rem;opacity:0.8;min-width:30px;text-align:center;font-variant-numeric:tabular-nums;}' +
    '.snk4a-ed{display:flex;min-width:0;min-height:200px;height:100%;border-radius:12px;overflow:hidden;}' +
    '.snk4a-ed-gut{flex:0 0 auto;margin:0;min-width:34px;padding:0 6px 0 4px;box-sizing:border-box;overflow:hidden;text-align:right;user-select:none;-webkit-user-select:none;' +
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre;opacity:0.85;background:rgba(0,0,0,0.18);color:rgba(200,220,210,0.6);border-right:1px solid rgba(127,127,127,0.25);}' +
    '.snk4a-ed.nolines .snk4a-ed-gut{display:none;}' +
    '.code-lab .snk4a-ed textarea#codeEditor-x{width:auto !important;flex:1 1 auto;min-width:0;border-radius:0 12px 12px 0;tab-size:2;-moz-tab-size:2;}' +
    '.code-lab .snk4a-ed.nolines textarea#codeEditor-x{border-radius:12px;}' +
    '.code-lab .snk4a-ed:not(.nolines) textarea#codeEditor-x{white-space:pre;overflow-wrap:normal;overflow-x:auto;}' +
    'body.phone-mode .snk4a-code-bar .pos{display:none;}body.phone-mode .snk4a-code-bar .snk4a-btn{padding:4px 8px;}'
  );
  function renderCodePlus(body, orig) {
    var cleanup = orig(body);
    var editor = body.querySelector('#codeEditor-x');
    var toolbar = body.querySelector('.code-lab-toolbar');
    var nameEl = body.querySelector('#codeName-x');
    var langEl = body.querySelector('#codeLang-x');
    if (!editor || !toolbar) return cleanup;
    var prefs = lsGet('code', {}) || {};
    var fs = Math.max(10, Math.min(24, +prefs.fs || 13));
    var theme = CODE_THEMES[prefs.theme] ? prefs.theme : 'auto';
    var lines = prefs.lines !== false;
    function savePrefs() { lsSet('code', { fs: fs, theme: theme, lines: lines }); }

    var bar = document.createElement('div');
    bar.className = 'snk4a-code-bar';
    bar.innerHTML =
      '<button type="button" class="snk4a-btn" data-a="open" title="Abrir un archivo de tu ordenador">📂 Abrir</button>' +
      '<input type="file" accept=".js,.mjs,.html,.htm,.css,.py,.txt,.md,.json,text/*" hidden>' +
      '<button type="button" class="snk4a-btn" data-a="dl" title="Descargar el archivo a tu ordenador">⬇️ Descargar</button>' +
      '<button type="button" class="snk4a-btn" data-a="copy" title="Copiar todo el código">📋 Copiar</button>' +
      '<button type="button" class="snk4a-btn" data-a="minus" aria-label="Letra más pequeña" title="Letra más pequeña">A−</button>' +
      '<span class="fs"></span>' +
      '<button type="button" class="snk4a-btn" data-a="plus" aria-label="Letra más grande" title="Letra más grande">A+</button>' +
      '<button type="button" class="snk4a-btn" data-a="lines" title="Mostrar u ocultar números de línea">№ Líneas</button>' +
      '<select aria-label="Tema del editor">' + Object.keys(CODE_THEMES).map(function (k) { return '<option value="' + k + '">' + CODE_THEMES[k].name + '</option>'; }).join('') + '</select>' +
      '<span class="pos" aria-live="off"></span>';
    toolbar.parentNode.insertBefore(bar, toolbar.nextSibling);
    var fsEl = bar.querySelector('.fs');
    var posEl = bar.querySelector('.pos');
    var themeSel = bar.querySelector('select');
    themeSel.value = theme;

    var wrap = document.createElement('div');
    wrap.className = 'snk4a-ed';
    var gut = document.createElement('pre');
    gut.className = 'snk4a-ed-gut';
    gut.setAttribute('aria-hidden', 'true');
    editor.parentNode.insertBefore(wrap, editor);
    wrap.appendChild(gut);
    wrap.appendChild(editor);

    var lastCount = -1;
    function paintGutter(force) {
      if (!lines) return;
      var n = (editor.value.match(/\n/g) || []).length + 1;
      if (n !== lastCount || force) {
        lastCount = n;
        var s = '';
        for (var i = 1; i <= n; i++) s += i + '\n';
        gut.textContent = s;
      }
      gut.scrollTop = editor.scrollTop;
    }
    function applyStyle() {
      editor.style.setProperty('font-size', fs + 'px', 'important');
      editor.style.setProperty('line-height', Math.round(fs * 1.45) + 'px', 'important');
      gut.style.fontSize = fs + 'px';
      gut.style.lineHeight = Math.round(fs * 1.45) + 'px';
      try {
        var cs = getComputedStyle(editor);
        gut.style.paddingTop = cs.paddingTop;
        gut.style.paddingBottom = cs.paddingBottom;
      } catch (e) {}
      fsEl.textContent = fs + 'px';
      wrap.classList.toggle('nolines', !lines);
      bar.querySelector('[data-a=lines]').classList.toggle('on', lines);
      var t = CODE_THEMES[theme];
      if (t && t.bg) {
        editor.style.setProperty('background', t.bg, 'important');
        editor.style.setProperty('color', t.fg, 'important');
        editor.style.setProperty('caret-color', t.fg);
        gut.style.background = t.gut; gut.style.color = t.gfg;
      } else {
        editor.style.removeProperty('background'); editor.style.removeProperty('color'); editor.style.removeProperty('caret-color');
        gut.style.background = ''; gut.style.color = '';
      }
      paintGutter(true);
    }
    function paintPos() {
      try {
        var v = editor.value, p = editor.selectionStart || 0;
        var before = v.slice(0, p);
        var ln = (before.match(/\n/g) || []).length + 1;
        var col = p - before.lastIndexOf('\n');
        var sel = Math.abs((editor.selectionEnd || 0) - p);
        posEl.textContent = 'Lín ' + ln + ', Col ' + col + (sel ? ' · ' + sel + ' selecc.' : '') + ' · ' + v.length + ' car.';
      } catch (e) {}
    }
    bar.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-a]');
      if (!b) return;
      var a = b.dataset.a;
      if (a === 'open') { fileIn.click(); return; }
      if (a === 'dl') {
        var name = (nameEl && nameEl.value || '').trim().replace(/[\\/:*?"<>|]+/g, '-') || 'programa';
        if (name.indexOf('.') < 0) name += '.' + ((langEl && langEl.value) || 'txt');
        var mime = { html: 'text/html', css: 'text/css', js: 'text/javascript', py: 'text/x-python' }[(langEl && langEl.value) || ''] || 'text/plain';
        if (downloadText(name, editor.value, mime + ';charset=utf-8')) toast('Descargando ' + name);
      } else if (a === 'copy') {
        copyText(editor.value).then(function () { toast('Código copiado'); }, function () { toast('No se pudo copiar'); });
      } else if (a === 'minus') { fs = Math.max(10, fs - 1); savePrefs(); applyStyle(); }
      else if (a === 'plus') { fs = Math.min(24, fs + 1); savePrefs(); applyStyle(); }
      else if (a === 'lines') { lines = !lines; savePrefs(); applyStyle(); }
    });
    themeSel.addEventListener('change', function () { theme = themeSel.value; savePrefs(); applyStyle(); });
    var fileIn = bar.querySelector('input[type=file]');
    fileIn.addEventListener('change', function () {
      var f = fileIn.files && fileIn.files[0];
      fileIn.value = '';
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) { toast('El archivo es demasiado grande (máx. 2 MB)'); return; }
      var rd = new FileReader();
      rd.onload = function () {
        var ext = (/\.([a-z0-9]+)$/i.exec(f.name) || [])[1];
        ext = (ext || '').toLowerCase();
        var lang = { js: 'js', mjs: 'js', html: 'html', htm: 'html', css: 'css', py: 'py' }[ext] || 'txt';
        if (nameEl) nameEl.value = f.name;
        if (langEl && langEl.value !== lang) {
          editor.value = '';
          langEl.value = lang;
          try { langEl.dispatchEvent(new Event('change')); } catch (e) {}
        }
        editor.value = String(rd.result || '');
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.scrollTop = 0;
        paintGutter(true); paintPos();
        toast('Abierto: ' + f.name);
      };
      rd.onerror = function () { toast('No se pudo leer el archivo'); };
      rd.readAsText(f);
    });
    editor.addEventListener('scroll', function () { gut.scrollTop = editor.scrollTop; });
    editor.addEventListener('input', function () { paintGutter(); paintPos(); });
    ['keyup', 'click', 'select'].forEach(function (evn) { editor.addEventListener(evn, paintPos); });
    editor.addEventListener('keydown', function (ev) {
      if (ev.key === 'Tab' && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault();
        var s = editor.selectionStart, e = editor.selectionEnd, v = editor.value;
        editor.value = v.slice(0, s) + '  ' + v.slice(e);
        editor.selectionStart = editor.selectionEnd = s + 2;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key === 's') {
        ev.preventDefault();
        var sv = body.querySelector('#codeSave-x');
        if (sv) sv.click();
      }
    });
    applyStyle();
    paintPos();
    /* el código generado por la IA cambia el texto sin evento: refrescar números */
    var iv = setInterval(function () { if (!body.isConnected) { clearInterval(iv); return; } paintGutter(); }, 600);
    return function () {
      clearInterval(iv);
      if (typeof cleanup === 'function') cleanup();
    };
  }
  wrapApp('code', renderCodePlus);

  /* =================== Pantalla de acceso: saludo, segundero y próximo festivo =================== */
  addCss(
    '#lockClock .snk4a-lc-sec{position:relative;width:132px;height:3px;margin:10px auto 0;border-radius:999px;background:rgba(255,255,255,0.28);overflow:hidden;}' +
    '#lockClock .snk4a-lc-sec i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:rgba(255,255,255,0.95);transition:width .9s linear;}' +
    '#lockClock .snk4a-lc-greet{margin-top:8px;font-size:clamp(0.8rem,2.6vw,0.95rem);font-weight:700;color:rgba(255,255,255,0.95);text-shadow:0 2px 10px rgba(0,0,0,0.2);}' +
    '#lockClock .snk4a-lc-extra{margin-top:3px;font-size:0.76rem;font-weight:600;color:rgba(255,255,255,0.85);text-shadow:0 2px 10px rgba(0,0,0,0.2);}' +
    '@media (max-height:740px){#lockClock .snk4a-lc-sec{margin-top:6px;}#lockClock .snk4a-lc-greet{margin-top:4px;}#lockClock .snk4a-lc-extra{display:none;}}' +
    '@media (prefers-reduced-motion:reduce){#lockClock .snk4a-lc-sec i{transition:none;}}'
  );
  function madridParts() {
    try {
      var f = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: 'numeric', minute: 'numeric', second: 'numeric', year: 'numeric', month: 'numeric', day: 'numeric', hour12: false });
      var o = {};
      f.formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
      return { h: +o.hour % 24, m: +o.minute, s: +o.second, y: +o.year, mo: +o.month, d: +o.day };
    } catch (e) { var d = new Date(); return { h: d.getHours(), m: d.getMinutes(), s: d.getSeconds(), y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate() }; }
  }
  function nextHoliday(p) {
    var base = new Date(p.y, p.mo - 1, p.d);
    for (var i = 0; i <= 14; i++) {
      var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      var h = HOLIDAYS[pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())];
      if (h) {
        if (i === 0) return '🎉 Hoy es festivo: ' + h;
        if (i === 1) return '🎉 Mañana es festivo: ' + h;
        var wd = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d.getDay()];
        return '🎉 Próximo festivo: ' + h + ' (' + wd + ' ' + d.getDate() + ')';
      }
    }
    return '';
  }
  function setupLockClock() {
    var lc = $('lockClock');
    var lock = $('lock');
    if (!lc || !lock || lc.querySelector('.snk4a-lc-sec')) return;
    var sec = document.createElement('div');
    sec.className = 'snk4a-lc-sec';
    sec.setAttribute('aria-hidden', 'true');
    sec.innerHTML = '<i></i>';
    var greet = document.createElement('div');
    greet.className = 'snk4a-lc-greet';
    var extra = document.createElement('div');
    extra.className = 'snk4a-lc-extra';
    var date = $('lockClockDate');
    if (date && date.parentNode === lc) { lc.insertBefore(sec, date); } else lc.appendChild(sec);
    lc.appendChild(greet);
    lc.appendChild(extra);
    var bar = sec.firstChild;
    function tick() {
      if (lock.classList.contains('hidden')) return;
      var p = madridParts();
      bar.style.width = ((p.s + 1) / 60 * 100).toFixed(1) + '%';
      var g = p.h < 6 ? '🌙 Buenas noches' : p.h < 13 ? '☀️ Buenos días' : p.h < 21 ? '🌤️ Buenas tardes' : '🌙 Buenas noches';
      if (greet.textContent !== g) greet.textContent = g;
      var x = nextHoliday(p);
      if (extra.textContent !== x) extra.textContent = x;
    }
    tick();
    setInterval(tick, 1000);
  }
  afterInstall(function () { try { setupLockClock(); } catch (e) {} });

  /* =================== Calculadora: teclado, historial y porcentajes =================== */
  addCss(
    '.snk4a-calc{display:flex;flex-direction:column;gap:8px;outline:none;}' +
    '.snk4a-calc .calc-display{margin-bottom:0;cursor:pointer;min-height:1.4em;}' +
    '.snk4a-calc-prev{text-align:right;font-size:0.78rem;opacity:0.65;min-height:1.1em;margin-top:-4px;padding:0 4px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.snk4a-calc-hist{max-height:92px;overflow:auto;display:flex;flex-direction:column;gap:2px;font-size:0.74rem;}' +
    '.snk4a-calc-hist button{margin:0;width:100%;min-height:0;padding:3px 6px;border-radius:8px;text-align:right;background:transparent;border:none;box-shadow:none;color:var(--text,#fff);opacity:0.8;cursor:pointer;font-variant-numeric:tabular-nums;}' +
    '.snk4a-calc-hist button:hover{opacity:1;background:var(--input-bg,rgba(255,255,255,0.06));}' +
    '.snk4a-calc-hh{display:flex;justify-content:space-between;align-items:center;font-size:0.7rem;opacity:0.7;}' +
    '.snk4a-calc-hh button{margin:0;width:auto;min-height:0;padding:1px 6px;border-radius:6px;background:transparent;border:none;box-shadow:none;color:var(--text,#fff);cursor:pointer;font-size:0.7rem;text-decoration:underline;}' +
    'body.light .calc-btn.calc-op,body.theme-light .calc-btn.calc-op{color:#0b6b3a;}'
  );
  function calcEval(expr) {
    var s = String(expr).replace(/÷/g, '/').replace(/×/g, '*').replace(/−/g, '-');
    s = s.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    if (!/^[0-9+\-*/.() ]+$/.test(s)) throw new Error('bad');
    if (/[+\-*/.]$/.test(s)) s = s.slice(0, -1);
    if (!s) return '';
    var r = Function('"use strict";return (' + s + ')')();
    if (typeof r !== 'number' || !isFinite(r)) throw new Error('nan');
    var out = parseFloat(r.toPrecision(12));
    return String(out);
  }
  function fmtNum(s) { return String(s).replace('.', ',').replace(/^-/, '−'); }
  function renderCalcPlus(body) {
    var hist = lsGet('calc', []) || [];
    body.innerHTML = '<div class="snk4a-calc" tabindex="-1">' +
      '<div class="calc-display" title="Clic para copiar el resultado" aria-live="polite">0</div>' +
      '<div class="snk4a-calc-prev"></div>' +
      '<div class="calc-grid"></div>' +
      '<div class="snk4a-calc-hh"><span>Historial</span><button type="button" data-clr="1">Borrar</button></div>' +
      '<div class="snk4a-calc-hist"></div></div>';
    var root = body.querySelector('.snk4a-calc');
    var display = body.querySelector('.calc-display');
    var prev = body.querySelector('.snk4a-calc-prev');
    var grid = body.querySelector('.calc-grid');
    var histEl = body.querySelector('.snk4a-calc-hist');
    var expr = '';
    var justEval = false;
    var keys = ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '±', '0', '.', '='];
    function show() {
      display.textContent = expr ? expr.replace(/\./g, ',') : '0';
      display.scrollLeft = display.scrollWidth;
      var p = '';
      if (expr && /[÷×−+%]/.test(expr.replace(/^−/, '')) && !justEval) { try { var r = calcEval(expr); if (r !== '') p = '= ' + fmtNum(r); } catch (e) {} }
      prev.textContent = p;
    }
    function paintHist() {
      histEl.innerHTML = '';
      body.querySelector('.snk4a-calc-hh').style.display = hist.length ? '' : 'none';
      hist.slice().reverse().forEach(function (h) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = h.e.replace(/\./g, ',') + ' = ' + fmtNum(h.r);
        b.title = 'Usar este resultado';
        b.addEventListener('click', function () { expr = h.r.replace('-', '−'); justEval = true; show(); root.focus(); });
        histEl.appendChild(b);
      });
    }
    function lastNumRange() { var m = /(−?)(\d+(?:\.\d*)?|\.\d*)$/.exec(expr); return m; }
    function press(k) {
      if (k === 'C') { expr = ''; justEval = false; }
      else if (k === '⌫') { expr = justEval ? '' : expr.slice(0, -1); justEval = false; }
      else if (k === '=') {
        if (!expr) return;
        try {
          var r = calcEval(expr);
          if (r === '') return;
          hist.push({ e: expr, r: r });
          if (hist.length > 12) hist = hist.slice(-12);
          lsSet('calc', hist);
          expr = r.replace(/^-/, '−');
          justEval = true;
          paintHist();
        } catch (e) { expr = ''; display.textContent = 'Error'; prev.textContent = 'Operación no válida'; justEval = false; return; }
      } else if (k === '±') {
        var m = lastNumRange();
        if (!m) return;
        var start = expr.length - m[0].length;
        expr = expr.slice(0, start) + (m[1] ? m[2] : '−' + m[2]);
        if (start > 0 && /\d$/.test(expr.slice(0, start))) { /* no-op */ }
        justEval = false;
      } else {
        var isOp = /[÷×−+%]/.test(k);
        if (justEval && !isOp) expr = '';
        justEval = false;
        if (isOp && k !== '%' && /[÷×−+]$/.test(expr)) expr = expr.slice(0, -1);
        if (k === '.') { var mm = lastNumRange(); if (mm && mm[2].indexOf('.') >= 0) return; if (!mm) expr += '0'; }
        if (expr.length >= 40) return;
        expr += k;
      }
      show();
    }
    keys.forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'calc-btn' + (k === '=' ? ' calc-eq' : '') + (['÷', '×', '−', '+'].indexOf(k) >= 0 ? ' calc-op' : '');
      b.textContent = k;
      b.setAttribute('aria-label', { 'C': 'Borrar todo', '⌫': 'Borrar', '±': 'Cambiar signo', '÷': 'Dividir', '×': 'Multiplicar', '−': 'Restar', '+': 'Sumar', '=': 'Igual', '%': 'Porcentaje' }[k] || k);
      b.addEventListener('click', function () { press(k); });
      grid.appendChild(b);
    });
    display.addEventListener('click', function () {
      var t = display.textContent;
      if (!t || t === 'Error') return;
      copyText(t).then(function () { toast('Copiado: ' + t); }, function () {});
    });
    body.querySelector('[data-clr]').addEventListener('click', function () { hist = []; lsSet('calc', hist); paintHist(); });
    var host = body.closest('.window') || body;
    function onKey(ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      var t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      var k = ev.key, map = { '/': '÷', '*': '×', 'x': '×', '-': '−', '+': '+', 'Enter': '=', '=': '=', 'Backspace': '⌫', 'Escape': 'C', 'Delete': 'C', ',': '.', '.': '.', '%': '%' };
      var v = /^[0-9]$/.test(k) ? k : map[k];
      if (!v) return;
      ev.preventDefault();
      press(v);
    }
    host.addEventListener('keydown', onKey);
    paintHist();
    show();
    setTimeout(function () { try { root.focus({ preventScroll: true }); } catch (e) {} }, 50);
    return function () { host.removeEventListener('keydown', onKey); };
  }
  wrapApp('calc', function (body) { return renderCalcPlus(body); });
  afterInstall(function (apps) { if (apps.calc && apps.calc.height < 520) { apps.calc.width = Math.max(apps.calc.width || 0, 290); apps.calc.height = 540; } });

  /* =================== Mi perfil: tarjeta de cuenta, contraseña más clara y zona de peligro plegada =================== */
  addCss(
    '.snk4a-pf-card{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;margin-bottom:10px;background:linear-gradient(135deg,rgba(52,209,122,0.18),rgba(74,163,255,0.14));border:1px solid var(--input-border,rgba(255,255,255,0.16));}' +
    '.snk4a-pf-av{flex:0 0 54px;width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:2rem;overflow:hidden;background:rgba(0,0,0,0.15);}' +
    '.snk4a-pf-av img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;}' +
    '.snk4a-pf-info{flex:1;min-width:0;}' +
    '.snk4a-pf-info b{display:block;font-size:1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.snk4a-pf-info span{display:block;font-size:0.74rem;opacity:0.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.snk4a-pf-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;}' +
    '.snk4a-pf-stats div{text-align:center;padding:7px 4px;border-radius:12px;background:var(--input-bg,rgba(255,255,255,0.06));border:1px solid var(--input-border,rgba(255,255,255,0.14));font-size:0.68rem;opacity:0.95;}' +
    '.snk4a-pf-stats b{display:block;font-size:0.95rem;}' +
    '.snk4a-pf-pw{position:relative;}' +
    '.snk4a-pf-pw input{padding-right:42px !important;}' +
    '.snk4a-pf-eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);margin:0 !important;width:32px !important;height:30px;min-height:0;padding:0 !important;border-radius:8px;background:transparent !important;border:none !important;box-shadow:none !important;cursor:pointer;font-size:0.95rem;color:var(--text,#fff);}' +
    '.snk4a-pf-meter{display:flex;align-items:center;gap:8px;font-size:0.7rem;margin:4px 0 2px;min-height:14px;}' +
    '.snk4a-pf-meter .bar{flex:1;height:5px;border-radius:999px;background:rgba(127,127,127,0.25);overflow:hidden;}' +
    '.snk4a-pf-meter .bar i{display:block;height:100%;width:0;border-radius:999px;transition:width .2s ease,background .2s ease;}' +
    '.snk4a-pf-match{font-size:0.7rem;min-height:14px;margin:3px 0 0;}' +
    '.snk4a-pf-danger{margin-top:12px;border-radius:12px;border:1px solid rgba(255,138,122,0.35);padding:4px 10px;}' +
    '.snk4a-pf-danger summary{cursor:pointer;font-size:0.8rem;font-weight:700;color:#ff8a7a;padding:6px 0;list-style:none;}' +
    '.snk4a-pf-danger summary::-webkit-details-marker{display:none;}' +
    'body.light .snk4a-pf-danger summary,body.theme-light .snk4a-pf-danger summary{color:#c0392b;}'
  );
  function pwScore(p) {
    if (!p) return -1;
    var s = 0;
    if (p.length >= 6) s++;
    if (p.length >= 10) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return Math.min(4, s);
  }
  function renderProfilePlus(body, orig) {
    var cleanup = orig(body);
    var u = cu() || {};
    var first = body.firstElementChild;
    /* Tarjeta */
    var card = document.createElement('div');
    card.className = 'snk4a-pf-card';
    var avHtml = '';
    try { avHtml = typeof window.avatarMarkup === 'function' ? window.avatarMarkup(u.avatar, 'avatar-img') : esc(u.avatar || '🙂'); } catch (e) { avHtml = esc(u.avatar || '🙂'); }
    card.innerHTML = '<div class="snk4a-pf-av">' + avHtml + '</div><div class="snk4a-pf-info"><b></b><span></span><span>' + esc(SNK_VERSION) + '</span></div>';
    card.querySelector('b').textContent = u.name || '';
    card.querySelectorAll('span')[0].textContent = u.email || '';
    body.insertBefore(card, first);
    var nmIn = body.querySelector('#profileName-x');
    if (nmIn) nmIn.addEventListener('input', function () { card.querySelector('b').textContent = nmIn.value.trim() || u.name || ''; });
    var stats = document.createElement('div');
    stats.className = 'snk4a-pf-stats';
    var nNotes = notesArr().length, nFiles = filesArr().length, used = 0;
    try { used = getUsedBytes(); } catch (e2) {}
    stats.innerHTML = '<div><b>' + nNotes + '</b>' + (nNotes === 1 ? 'nota' : 'notas') + '</div><div><b>' + nFiles + '</b>' + (nFiles === 1 ? 'archivo' : 'archivos') + '</div><div><b>' + esc(fmtBytes(used)) + '</b>usados</div>';
    body.insertBefore(stats, first);
    /* Contraseña: ver/ocultar, fuerza y coincidencia (solo ayuda visual) */
    var p1 = body.querySelector('#profilePass1-x');
    var p2 = body.querySelector('#profilePass2-x');
    [p1, p2, body.querySelector('#profileDeletePass-x')].forEach(function (inp) {
      if (!inp) return;
      var w = document.createElement('div');
      w.className = 'snk4a-pf-pw';
      inp.parentNode.insertBefore(w, inp);
      w.appendChild(inp);
      var eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'snk4a-pf-eye';
      eye.textContent = '👁️';
      eye.title = 'Mostrar contraseña';
      eye.setAttribute('aria-label', 'Mostrar contraseña');
      eye.addEventListener('click', function () {
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        eye.textContent = show ? '🙈' : '👁️';
        eye.title = show ? 'Ocultar contraseña' : 'Mostrar contraseña';
        eye.setAttribute('aria-label', eye.title);
      });
      w.appendChild(eye);
    });
    if (p1 && p2) {
      var meter = document.createElement('div');
      meter.className = 'snk4a-pf-meter';
      meter.innerHTML = '<span class="bar"><i></i></span><span class="lb"></span>';
      p1.parentNode.parentNode.insertBefore(meter, p1.parentNode.nextSibling);
      var match = document.createElement('div');
      match.className = 'snk4a-pf-match';
      p2.parentNode.parentNode.insertBefore(match, p2.parentNode.nextSibling);
      var bar = meter.querySelector('i'), lb = meter.querySelector('.lb');
      var LBL = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Muy fuerte'];
      var COL = ['#ff5c5c', '#ff9a4a', '#ffc94a', '#7bd86a', '#34d17a'];
      function upd() {
        var s = pwScore(p1.value);
        meter.style.visibility = s < 0 ? 'hidden' : 'visible';
        if (s >= 0) { bar.style.width = ((s + 1) * 20) + '%'; bar.style.background = COL[s]; lb.textContent = LBL[s]; lb.style.color = COL[s]; }
        if (!p2.value) match.textContent = '';
        else if (p1.value === p2.value) { match.textContent = '✓ Las contraseñas coinciden'; match.style.color = '#34d17a'; }
        else { match.textContent = '✕ Las contraseñas no coinciden'; match.style.color = '#ff8a7a'; }
      }
      p1.addEventListener('input', upd); p2.addEventListener('input', upd);
      upd();
    }
    /* Zona de peligro plegada */
    var delBtn = body.querySelector('#profileDeleteBtn-x');
    var delPass = body.querySelector('#profileDeletePass-x');
    if (delBtn && delPass) {
      var lbl = null, hr = null;
      var wrapP = delPass.closest('.snk4a-pf-pw') || delPass;
      var prevEl = wrapP.previousElementSibling;
      if (prevEl && prevEl.tagName === 'LABEL') { lbl = prevEl; var pp = lbl.previousElementSibling; if (pp && pp.tagName === 'HR') hr = pp; }
      var det = document.createElement('details');
      det.className = 'snk4a-pf-danger';
      det.innerHTML = '<summary>⚠️ Zona de peligro: eliminar cuenta</summary>';
      (hr || lbl || wrapP).parentNode.insertBefore(det, hr || lbl || wrapP);
      if (hr) hr.remove();
      if (lbl) det.appendChild(lbl);
      det.appendChild(wrapP);
      det.appendChild(delBtn);
    }
    return cleanup;
  }
  wrapApp('profile', renderProfilePlus);

  /* =================== Doganiero Desk: estado de conexión con indicador y duración de la sesión =================== */
  addCss(
    '.ddesk-status.snk4a-st{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:rgba(127,127,127,0.14);border:1px solid rgba(127,127,127,0.25);}' +
    '.ddesk-status.snk4a-st::before{content:"";width:8px;height:8px;border-radius:50%;background:#ff6b6b;flex:0 0 8px;}' +
    '.ddesk-status.snk4a-st[data-st="online"]{background:rgba(52,209,122,0.14);border-color:rgba(52,209,122,0.4);}' +
    '.ddesk-status.snk4a-st[data-st="online"]::before{background:#34d17a;box-shadow:0 0 0 3px rgba(52,209,122,0.25);}' +
    '.ddesk-status.snk4a-st[data-st="busy"]{background:rgba(255,201,74,0.14);border-color:rgba(255,201,74,0.4);}' +
    '.ddesk-status.snk4a-st[data-st="busy"]::before{background:#ffc94a;animation:snk4aPulse 1s ease-in-out infinite;}' +
    '@keyframes snk4aPulse{0%,100%{opacity:1;}50%{opacity:0.3;}}' +
    '@media (prefers-reduced-motion:reduce){.ddesk-status.snk4a-st[data-st="busy"]::before{animation:none;}}' +
    '.snk4a-ddesk-timer{margin-left:8px;font-size:0.72rem;font-variant-numeric:tabular-nums;opacity:0.8;}'
  );
  function renderDeskPlus(body, orig) {
    var cleanup = orig(body);
    var st = body.querySelector('#ddeskStatus');
    var mo = null, mo2 = null, tiv = null;
    if (st) {
      st.classList.add('snk4a-st');
      var paint = function () {
        var t = (st.textContent || '').toLowerCase();
        var s = st.classList.contains('online') ? 'online' : /conectando|reconectando|…|\.\.\./.test(t) ? 'busy' : 'off';
        if (st.getAttribute('data-st') !== s) st.setAttribute('data-st', s);
        st.setAttribute('role', 'status');
      };
      paint();
      mo = new MutationObserver(paint);
      mo.observe(st, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    var box = body.querySelector('#ddeskSession');
    var label = body.querySelector('#ddeskSessionLabel');
    if (box && label) {
      var timer = document.createElement('span');
      timer.className = 'snk4a-ddesk-timer';
      label.parentNode.insertBefore(timer, label.nextSibling);
      var since = 0;
      var tick = function () {
        if (!timer.isConnected) { if (tiv) { clearInterval(tiv); tiv = null; } return; }
        if (!since) { timer.textContent = ''; return; }
        var s = Math.floor((Date.now() - since) / 1000);
        timer.textContent = '⏱ ' + (s >= 3600 ? Math.floor(s / 3600) + ':' : '') + pad2(Math.floor(s / 60) % 60) + ':' + pad2(s % 60);
      };
      var check = function () {
        var open = !box.classList.contains('hidden');
        if (open && !since) { since = Date.now(); tick(); if (!tiv) tiv = setInterval(tick, 1000); }
        else if (!open && since) { since = 0; tick(); if (tiv) { clearInterval(tiv); tiv = null; } }
      };
      check();
      mo2 = new MutationObserver(check);
      mo2.observe(box, { attributes: true, attributeFilter: ['class'] });
    }
    return function () {
      if (mo) mo.disconnect();
      if (mo2) mo2.disconnect();
      if (tiv) clearInterval(tiv);
      if (typeof cleanup === 'function') cleanup();
    };
  }
  wrapApp('desk', renderDeskPlus);

  /* =================== Prism: pulido visual (solo CSS; no toca la puerta ni las flechas) =================== */
  addCss(
    '.prism-btn,.prism-chip{transition:background .15s ease,box-shadow .15s ease,transform .1s ease,border-color .15s ease;}' +
    '.prism-btn:active:not(:disabled),.prism-chip:active{transform:scale(0.97);}' +
    '.prism-btn:focus-visible,.prism-chip:focus-visible{outline:2px solid #74b9ff;outline-offset:1px;}' +
    '.prism-side{scrollbar-width:thin;scrollbar-color:rgba(116,185,255,0.35) transparent;}' +
    '.prism-side::-webkit-scrollbar{width:8px;}' +
    '.prism-side::-webkit-scrollbar-thumb{background:rgba(116,185,255,0.3);border-radius:8px;}' +
    '.prism-panel{transition:border-color .2s ease;}' +
    '.prism-panel:hover{border-color:rgba(168,180,255,0.3);}' +
    '.prism-status.ok::before{content:"● ";}' +
    '.prism-status.err::before{content:"● ";}'
  );

  /* =================== Acerca de: versión y acceso a las novedades =================== */
  function renderAboutPlus(body, orig) {
    var cleanup = orig(body);
    var box = document.createElement('div');
    box.style.cssText = 'margin-top:10px;text-align:center;display:flex;flex-direction:column;gap:6px;align-items:center;';
    box.innerHTML = '<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(52,209,122,0.2);font-weight:800;font-size:0.78rem;">' + esc(SNK_VERSION) + '</span>' +
      '<button type="button" class="snk4a-btn">🆕 Ver novedades de hoy</button>';
    box.querySelector('button').addEventListener('click', function () { window.snakeOpenSettings('acerca'); });
    body.appendChild(box);
    return cleanup;
  }
  wrapApp('about', renderAboutPlus);

  /* =================== App nueva: Capturas (galería de capturas de pantalla) =================== */
  addCss(
    '.snk4a-shots{display:flex;flex-direction:column;height:100%;min-height:0;gap:8px;color:var(--text,#fff);}' +
    '.snk4a-shots-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}' +
    '.snk4a-shots-top span{flex:1;font-size:0.76rem;opacity:0.75;min-width:120px;}' +
    '.snk4a-shots-grid{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;align-content:start;padding:2px;}' +
    '.snk4a-shot{position:relative;border-radius:12px;overflow:hidden;background:var(--input-bg,rgba(255,255,255,0.06));border:1px solid var(--input-border,rgba(255,255,255,0.16));cursor:pointer;}' +
    '.snk4a-shot .th{aspect-ratio:16/10;display:flex;align-items:center;justify-content:center;font-size:1.6rem;background:rgba(0,0,0,0.18);overflow:hidden;}' +
    '.snk4a-shot .th img{width:100%;height:100%;object-fit:cover;display:block;}' +
    '.snk4a-shot .cap{padding:5px 8px;font-size:0.68rem;opacity:0.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.snk4a-shot .act{position:absolute;top:5px;right:5px;display:flex;gap:4px;opacity:0;transition:opacity .15s ease;}' +
    '.snk4a-shot:hover .act,.snk4a-shot:focus-within .act{opacity:1;}' +
    'body.phone-mode .snk4a-shot .act{opacity:1;}' +
    '.snk4a-shot .act button{margin:0;width:28px;height:28px;min-height:0;padding:0;border-radius:8px;border:none;box-shadow:none;background:rgba(0,0,0,0.55);color:#fff;cursor:pointer;font-size:0.8rem;}' +
    'body.phone-mode .snk4a-shots-grid{grid-template-columns:repeat(2,1fr);}'
  );
  function isShot(e) { return /^Captura-/i.test(String(e.name || '')) && /^image\//.test(e.type || 'image/'); }
  function shotDate(e) {
    var m = /Captura-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/.exec(e.name || '');
    if (!m) return e.name;
    return (+m[3]) + ' ' + MONTHS[+m[2] - 1].slice(0, 3) + ' ' + m[1] + ' · ' + m[4] + ':' + m[5];
  }
  function renderShotsApp(body) {
    body.innerHTML = '<div class="snk4a-shots"><div class="snk4a-shots-top"><span></span>' +
      '<button type="button" class="snk4a-btn primary" data-a="new">📸 Nueva captura</button></div>' +
      '<div class="snk4a-shots-grid" role="list"></div></div>';
    var info = body.querySelector('.snk4a-shots-top span');
    var grid = body.querySelector('.snk4a-shots-grid');
    var lastSig = null;
    var alive = true;
    body.querySelector('[data-a=new]').addEventListener('click', function () {
      var x = window.__snakeOsDesktopExtras;
      if (x && typeof x.takeDesktopScreenshot === 'function') x.takeDesktopScreenshot();
      else toast('Las capturas no están disponibles ahora');
    });
    function loadThumb(e, holder) {
      var set = function (url) {
        if (!alive || !url) return;
        var img = new Image();
        img.alt = e.name;
        img.onload = function () { holder.innerHTML = ''; holder.appendChild(img); };
        img.src = url;
      };
      if (e.dataUrl) { set(e.dataUrl); return Promise.resolve(); }
      try { return Promise.resolve(ensureFileDataUrl(e)).then(set, function () {}); } catch (x) { return Promise.resolve(); }
    }
    function paint() {
      var shots = filesArr().filter(isShot).sort(function (a, b) { return String(b.name).localeCompare(String(a.name)); });
      var sig = shots.map(function (s) { return s.id; }).join(',');
      if (sig === lastSig) return;
      lastSig = sig;
      var tot = shots.reduce(function (s, e) { return s + fSize(e); }, 0);
      info.textContent = shots.length ? shots.length + (shots.length === 1 ? ' captura' : ' capturas') + ' · ' + fmtBytes(tot) : 'Atajo: Ctrl+Shift+S';
      grid.innerHTML = '';
      if (!shots.length) {
        grid.innerHTML = '<div class="snk4a-empty" style="grid-column:1/-1"><span class="big">📸</span>Todavía no tienes capturas.<br>Pulsa «Nueva captura», el botón 📸 de la barra o Ctrl+Shift+S.</div>';
        return;
      }
      var chain = Promise.resolve();
      shots.forEach(function (e, i) {
        var el = document.createElement('div');
        el.className = 'snk4a-shot';
        el.setAttribute('role', 'listitem');
        el.tabIndex = 0;
        el.title = e.name;
        el.innerHTML = '<div class="th">🖼️</div><div class="cap"></div><div class="act"></div>';
        el.querySelector('.cap').textContent = shotDate(e);
        var act = el.querySelector('.act');
        function ab(t, lab, fn) { var b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.title = lab; b.setAttribute('aria-label', lab); b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); }); act.appendChild(b); }
        ab('⬇️', 'Descargar', function () {
          Promise.resolve(e.dataUrl || ensureFileDataUrl(e)).then(function (url) {
            if (!url) { toast('No se pudo descargar'); return; }
            var a = document.createElement('a'); a.href = url; a.download = e.name; document.body.appendChild(a); a.click(); a.remove();
          }, function () { toast('No se pudo descargar'); });
        });
        ab('🗑️', 'Enviar a la papelera', function () { try { if (safeTrash(e.id)) toast('Captura enviada a la papelera'); } catch (x) {} });
        el.addEventListener('click', function () { try { openFileViewerWindow(e); } catch (x) {} });
        el.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { try { openFileViewerWindow(e); } catch (x) {} } });
        grid.appendChild(el);
        if (i < 40) { var th = el.querySelector('.th'); chain = chain.then(function () { return alive ? loadThumb(e, th) : null; }); }
      });
    }
    paint();
    var iv = setInterval(function () { if (!body.isConnected) { clearInterval(iv); return; } paint(); }, 1500);
    return function () { alive = false; clearInterval(iv); };
  }
  registerApp('capturas', { title: 'Capturas', icon: '📸', width: 560, height: 480, render: renderShotsApp });

  /* Tamaños de ventana: si no hay tamaño guardado se usa el de la app (ya ampliado);
     si el guardado es más pequeño que el mínimo usable, se vuelve al tamaño por defecto. */
  var WIN_MIN = {
    notes: [380, 480], explorer: [440, 460], calc: [270, 500],
    ajustes: [520, 440], calendario: [360, 480], capturas: [460, 380]
  };
  function fixWinSize(win) {
    try {
      if (!win || !win.isConnected || document.body.classList.contains('phone-mode') || win.classList.contains('maximized')) return;
      var id = (win.id || '').replace(/^win-/, '');
      var min = WIN_MIN[id];
      var app = window.APPS && window.APPS[id];
      if (!min || !app) return;
      var w = parseFloat(win.style.width) || win.offsetWidth;
      var h = parseFloat(win.style.height) || win.offsetHeight;
      if (w >= min[0] && h >= min[1]) return;
      var layer = document.getElementById('windows');
      var lw = layer && layer.clientWidth ? layer.clientWidth : window.innerWidth;
      var lh = layer && layer.clientHeight ? layer.clientHeight : window.innerHeight;
      var nw = Math.min(Math.max(w, app.width || min[0]), lw);
      var nh = Math.min(Math.max(h, app.height || min[1]), lh);
      win.style.width = nw + 'px';
      win.style.height = nh + 'px';
      var l = parseFloat(win.style.left) || 0, t = parseFloat(win.style.top) || 0;
      if (l + nw > lw) win.style.left = Math.max(0, lw - nw - 6) + 'px';
      if (t + nh > lh) win.style.top = Math.max(0, lh - nh - 6) + 'px';
    } catch (e) {}
  }
  function watchWinSizes() {
    var layer = document.getElementById('windows');
    if (!layer) return false;
    if (layer._snk4bSize) return true;
    layer._snk4bSize = true;
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType === 1 && n.classList && n.classList.contains('app-window')) {
            requestAnimationFrame(function () { fixWinSize(n); });
          }
        });
      });
    }).observe(layer, { childList: true });
    return true;
  }
  if (!watchWinSizes()) document.addEventListener('DOMContentLoaded', watchWinSizes);

  /* =================== Lote 5: búsqueda global, widgets, portapapeles, accesibilidad y centro de control =================== */
  var B5_DEF = { widgets: false, hc: false, bigCursor: false, focusRing: true };
  function b5Prefs() { var p = lsGet('b5', null); return Object.assign({}, B5_DEF, p && typeof p === 'object' ? p : {}); }
  function b5Get(k) { return !!b5Prefs()[k]; }
  function b5Set(k, v) {
    if (!email()) { toast('Inicia sesión para guardar este ajuste'); return; }
    var p = b5Prefs(); p[k] = !!v; lsSet('b5', p); b5Apply();
  }
  var b5LastEmail = null;
  function b5Apply() {
    var on = !!email();
    var p = on ? b5Prefs() : B5_DEF;
    var c = document.body.classList;
    c.toggle('snk-hc', on && p.hc);
    c.toggle('snk-bigcursor', on && p.bigCursor);
    c.toggle('snk-focusring', !!p.focusRing);
    widgetsSync();
  }
  function desktopReady() {
    var d = $('desktop');
    if (!d || d.classList.contains('hidden') || !cu()) return false;
    var lk = $('lock');
    if (lk && !lk.classList.contains('hidden')) return false;
    if (document.body.classList.contains('account-soft-locked')) return false;
    return true;
  }
  function inField(t) { return t && t.closest && t.closest('input, textarea, select, [contenteditable="true"], .xterm'); }

  addCss(
    /* Accesibilidad */
    'body.snk-focusring.snk-kbd :focus-visible{outline:3px solid #ffd400 !important;outline-offset:2px !important;box-shadow:0 0 0 5px rgba(0,0,0,0.55) !important;}' +
    'body.snk-hc .app-window,body.snk-hc #taskbar,body.snk-hc #startMenu,body.snk-hc .notif-panel,body.snk-hc #snkCtxMenu,body.snk-hc .snk5-panel{background:#000 !important;color:#fff !important;border:2px solid #fff !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}' +
    'body.snk-hc .win-body{background:#000 !important;color:#fff !important;}' +
    'body.snk-hc .win-titlebar{background:#000 !important;border-bottom:2px solid #fff !important;}body.snk-hc .win-title{color:#fff !important;opacity:1 !important;}' +
    'body.snk-hc .win-body *,body.snk-hc #taskbar *{text-shadow:none !important;}' +
    'body.snk-hc .win-body,body.snk-hc .win-body *,body.snk-hc #taskbar,body.snk-hc #taskbar *,body.snk-hc #startMenu *,body.snk-hc .notif-panel *,body.snk-hc .snk5-w,body.snk-hc .snk5-w *{color:#fff !important;opacity:1 !important;}' +
    'body.snk-hc .app-window button:not(.snk4a-switch),body.snk-hc #taskbar button,body.snk-hc #taskbar .task-item,body.snk-hc .snk5-panel button,body.snk-hc .snk4a-set-row{background:#000 !important;}' +
    'body.snk-hc .snk4a-set-row{border:1px solid #fff !important;}body.snk-hc .snk4a-switch[aria-checked="true"]{background:#ffd400 !important;}body.snk-hc .snk5-it.sel{background:#ffd400 !important;}body.snk-hc .snk5-it.sel *{color:#000 !important;}' +
    'body.snk-hc #phoneNav,body.snk-hc #phoneStatus .ps-pill,body.snk-hc #phoneStatus > *{background:#000 !important;color:#fff !important;border-color:#fff !important;backdrop-filter:none !important;}body.snk-hc #phoneNav *{color:#fff !important;}' +
    'body.snk-hc .snk5-w{background:#000 !important;border:2px solid #fff !important;backdrop-filter:none !important;}' +
    'body.snk-hc .app-window button,body.snk-hc .app-window input,body.snk-hc .app-window select,body.snk-hc .app-window textarea,body.snk-hc #taskbar button,body.snk-hc .snk5-panel button,body.snk-hc .snk5-panel input{border:2px solid #ffd400 !important;}' +
    'body.snk-hc .app-window input,body.snk-hc .app-window textarea,body.snk-hc .app-window select{background:#000 !important;color:#fff !important;}' +
    'body.snk-hc .desktop-icon .lb{color:#fff !important;background:#000;border-radius:4px;padding:0 3px;text-shadow:none !important;}' +
    'body.snk-hc a{color:#ffd400 !important;text-decoration:underline !important;}' +
    'body.snk-bigcursor,body.snk-bigcursor *{cursor:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2740%27 height=%2740%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M4 2l0 30 8-7 6 13 6-3-6-12 11 0z%27 fill=%27%23000%27 stroke=%27%23fff%27 stroke-width=%272.5%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E") 4 2,auto !important;}' +
    'body.snk-bigcursor input,body.snk-bigcursor textarea,body.snk-bigcursor [contenteditable="true"]{cursor:text !important;}' +
    /* Paneles (búsqueda y portapapeles) */
    '.snk5-ov{position:fixed;inset:0;z-index:11815;display:none;align-items:flex-start;justify-content:center;padding-top:12vh;background:rgba(0,0,0,0.32);}' +
    '.snk5-ov.open{display:flex;}' +
    '.snk5-panel{width:min(560px,calc(100vw - 20px));max-height:70vh;display:flex;flex-direction:column;border-radius:18px;overflow:hidden;background:rgba(14,26,20,0.92);color:#fff;border:1px solid rgba(255,255,255,0.25);' +
      'backdrop-filter:blur(28px) saturate(170%);-webkit-backdrop-filter:blur(28px) saturate(170%);box-shadow:0 24px 70px rgba(0,0,0,0.5);animation:snk5Pop .16s cubic-bezier(0.22,1,0.36,1);}' +
    '@keyframes snk5Pop{from{opacity:0;transform:translateY(-8px) scale(0.98);}to{opacity:1;transform:none;}}' +
    '.snk5-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.14);}' +
    '.snk5-head input{flex:1;margin:0;min-width:0;width:auto;padding:9px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.25);background:rgba(0,0,0,0.25);color:#fff;font-size:0.95rem;outline:none;}' +
    '.snk5-head .snk5-x{margin:0;width:auto;min-height:0;padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.22);background:transparent;color:inherit;cursor:pointer;font-size:0.75rem;}' +
    '.snk5-list{overflow:auto;padding:6px;}' +
    '.snk5-grp{font-size:0.64rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;opacity:0.7;padding:8px 8px 3px;}' +
    '.snk5-it{margin:0;width:100%;display:flex;align-items:center;gap:10px;text-align:left;padding:8px 10px;border:0;border-radius:10px;background:transparent;color:inherit;cursor:pointer;font-size:0.85rem;box-shadow:none;min-height:0;}' +
    '.snk5-it.sel,.snk5-it:hover{background:rgba(52,209,122,0.28);}' +
    '.snk5-ico{width:22px;text-align:center;flex-shrink:0;}' +
    '.snk5-txt{flex:1;min-width:0;}.snk5-txt b{display:block;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.snk5-txt span{display:block;font-size:0.72rem;opacity:0.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.snk5-empty{padding:18px;text-align:center;font-size:0.82rem;opacity:0.75;}' +
    '.snk5-foot{padding:7px 12px;font-size:0.68rem;opacity:0.7;border-top:1px solid rgba(255,255,255,0.12);}' +
    'body.theme-light .snk5-panel{background:rgba(255,255,255,0.94);color:#0d2818;border-color:rgba(0,0,0,0.12);}' +
    'body.theme-light .snk5-head input{background:rgba(255,255,255,0.85);color:#0d2818;border-color:rgba(0,0,0,0.18);}' +
    'body.theme-light .snk5-head,body.theme-light .snk5-foot{border-color:rgba(0,0,0,0.1);}' +
    'body.theme-light .snk5-it.sel,body.theme-light .snk5-it:hover{background:rgba(52,209,122,0.22);}' +
    'body.phone-mode .snk5-ov{padding-top:44px;}body.phone-mode .snk5-panel{max-height:calc(100vh - 160px);}body.phone-mode .snk5-head input{font-size:16px;}body.phone-mode .snk5-it{min-height:44px;}' +
    /* Widgets */
    '#snk5Widgets{position:absolute;inset:0 0 76px 0;z-index:2;pointer-events:none;}' +
    '.snk5-w{position:absolute;width:210px;pointer-events:auto;border-radius:16px;padding:10px 12px;background:rgba(10,24,18,0.55);color:#fff;border:1px solid rgba(255,255,255,0.22);' +
      'backdrop-filter:blur(18px) saturate(160%);-webkit-backdrop-filter:blur(18px) saturate(160%);box-shadow:0 10px 28px rgba(0,0,0,0.25);font-size:0.8rem;user-select:none;touch-action:none;cursor:grab;box-sizing:border-box;}' +
    '.snk5-w.drag{cursor:grabbing;box-shadow:0 18px 40px rgba(0,0,0,0.4);opacity:0.95;}' +
    '.snk5-w h4{margin:0 0 6px;font-size:0.66rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;opacity:0.75;}' +
    '.snk5-w .big{font-size:2rem;font-weight:800;line-height:1.05;font-variant-numeric:tabular-nums;}' +
    '.snk5-w .sub{opacity:0.8;margin-top:2px;}' +
    '.snk5-w ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px;}' +
    '.snk5-w li{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.snk5-w .row{display:flex;justify-content:space-between;gap:8px;font-weight:700;}' +
    '.snk5-w .muted{opacity:0.7;font-size:0.74rem;}' +
    'body.theme-light .snk5-w{background:rgba(255,255,255,0.6);color:#0d2818;border-color:rgba(0,0,0,0.1);}' +
    'body.phone-mode #snk5Widgets{display:none;}' +
    /* Portapapeles */
    '.snk5-clip-tx{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    /* Centro de control (móvil) */
    '#snk5CC{position:fixed;inset:0;z-index:11700;display:none;}' +
    '#snk5CC.open{display:block;}' +
    '#snk5CC .cc-bg{position:absolute;inset:0;background:rgba(0,0,0,0.35);}' +
    '#snk5CC .cc-sheet{position:absolute;left:8px;right:8px;top:6px;border-radius:24px;padding:14px 14px 10px;background:rgba(12,24,18,0.9);color:#fff;border:1px solid rgba(255,255,255,0.22);' +
      'backdrop-filter:blur(26px) saturate(170%);-webkit-backdrop-filter:blur(26px) saturate(170%);box-shadow:0 20px 50px rgba(0,0,0,0.5);transform:translateY(-110%);transition:transform .24s cubic-bezier(0.22,1,0.36,1);touch-action:none;}' +
    '#snk5CC.show .cc-sheet{transform:none;}' +
    '#snk5CC .cc-time{font-size:1.9rem;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;}' +
    '#snk5CC .cc-date{font-size:0.8rem;opacity:0.8;margin:3px 0 12px;}' +
    '#snk5CC .cc-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}' +
    '#snk5CC .cc-t{margin:0;width:100%;min-height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:6px 2px;border-radius:16px;border:1px solid rgba(255,255,255,0.16);' +
      'background:rgba(255,255,255,0.1);color:inherit;font-size:0.66rem;font-weight:700;cursor:pointer;box-shadow:none;line-height:1.15;text-align:center;}' +
    '#snk5CC .cc-t i{font-style:normal;font-size:1.25rem;}' +
    '#snk5CC .cc-t.on{background:#34d17a;color:#053018;border-color:#34d17a;}' +
    '#snk5CC .cc-grab{width:44px;height:5px;border-radius:3px;background:rgba(255,255,255,0.35);margin:12px auto 0;}' +
    'body.theme-light #snk5CC .cc-sheet{background:rgba(255,255,255,0.94);color:#0d2818;border-color:rgba(0,0,0,0.1);}' +
    'body.theme-light #snk5CC .cc-t{background:rgba(0,0,0,0.05);border-color:rgba(0,0,0,0.1);}body.theme-light #snk5CC .cc-grab{background:rgba(0,0,0,0.25);}'
  );

  /* ---------- Panel reutilizable ---------- */
  function makeOverlay(id, placeholder, foot) {
    var ov = $(id);
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = id;
    ov.className = 'snk5-ov';
    ov.innerHTML = '<div class="snk5-panel" role="dialog" aria-modal="true"><div class="snk5-head"><input type="search" autocomplete="off" spellcheck="false" placeholder="' + esc(placeholder) + '" aria-label="' + esc(placeholder) + '"><button type="button" class="snk5-x">Esc</button></div>' +
      '<div class="snk5-list" role="listbox"></div><div class="snk5-foot">' + esc(foot) + '</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('pointerdown', function (e) { if (e.target === ov) closeOverlay(ov); });
    ov.querySelector('.snk5-x').addEventListener('click', function () { closeOverlay(ov); });
    return ov;
  }
  function closeOverlay(ov) {
    if (!ov || !ov.classList.contains('open')) return;
    ov.classList.remove('open');
    var back = ov._back; ov._back = null;
    if (back && back.isConnected && back.focus) { try { back.focus(); } catch (e) {} }
  }
  function listNav(ov, items, onPick) {
    var inp = ov.querySelector('input');
    var sel = 0;
    function mark() {
      var els = ov.querySelectorAll('.snk5-it');
      els.forEach(function (el, i) { el.classList.toggle('sel', i === sel); el.setAttribute('aria-selected', i === sel ? 'true' : 'false'); });
      if (els[sel]) els[sel].scrollIntoView({ block: 'nearest' });
    }
    ov._mark = function (n) { sel = Math.max(0, Math.min(n, items().length - 1)); mark(); };
    inp.onkeydown = function (e) {
      var n = items().length;
      if (e.key === 'ArrowDown') { e.preventDefault(); if (n) { sel = (sel + 1) % n; mark(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) { sel = (sel + n - 1) % n; mark(); } }
      else if (e.key === 'Enter') { e.preventDefault(); var it = items()[sel]; if (it) onPick(it); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeOverlay(ov); }
    };
  }
  function renderItems(ov, groups, onPick) {
    var list = ov.querySelector('.snk5-list');
    list.innerHTML = '';
    var flat = [];
    groups.forEach(function (g) {
      if (!g.items.length) return;
      var h = document.createElement('div'); h.className = 'snk5-grp'; h.textContent = g.name; list.appendChild(h);
      g.items.forEach(function (it) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'snk5-it'; b.setAttribute('role', 'option');
        b.innerHTML = '<span class="snk5-ico">' + (it.icoHtml || esc(it.ico || '•')) + '</span><span class="snk5-txt"><b' + (it.mono ? ' class="snk5-clip-tx"' : '') + '>' + esc(it.title) + '</b>' + (it.sub ? '<span>' + esc(it.sub) + '</span>' : '') + '</span>';
        var idx = flat.length;
        b.addEventListener('mousemove', function () { if (ov._mark) ov._mark(idx); });
        b.addEventListener('click', function () { onPick(it); });
        list.appendChild(b);
        flat.push(it);
      });
    });
    if (!flat.length) { var em = document.createElement('div'); em.className = 'snk5-empty'; em.textContent = ov._emptyText || 'Sin resultados'; list.appendChild(em); }
    return flat;
  }

  /* ---------- Búsqueda global ---------- */
  var chatUsersCache = { at: 0, list: [], email: null, loading: false };
  function loadChatUsers(cb) {
    var who = email();
    if (!who) return;
    if (chatUsersCache.email === who && Date.now() - chatUsersCache.at < 120000) return;
    if (chatUsersCache.loading) return;
    chatUsersCache.loading = true;
    apiCall('/api/chat/users').then(function (d) {
      if (email() !== who) return;
      chatUsersCache = { at: Date.now(), list: (d && Array.isArray(d.users)) ? d.users.slice(0, 500) : [], email: who, loading: false };
      if (cb) cb();
    }).catch(function () { chatUsersCache.loading = false; });
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function score(hay, q) {
    var h = norm(hay); if (!q) return 1;
    var i = h.indexOf(q);
    if (i === -1) { var words = q.split(/\s+/).filter(Boolean); if (words.length > 1 && words.every(function (w) { return h.indexOf(w) !== -1; })) return 2; return 0; }
    return i === 0 ? 10 : (h.charAt(i - 1) === ' ' ? 6 : 3);
  }
  function searchGroups(raw) {
    var q = norm(raw.trim());
    var groups = [];
    var apps = [];
    try {
      Object.keys(window.APPS || {}).forEach(function (id) {
        var a = window.APPS[id]; if (!a || !a.title) return;
        var al = (window.APP_OPEN_ALIASES && window.APP_OPEN_ALIASES[id]) || [];
        var s = Math.max(score(a.title, q), q ? score(al.join(' '), q) - 1 : 0, q ? score(id, q) - 2 : 0);
        if (s > 0) apps.push({ s: s, ico: typeof a.icon === 'string' && a.icon.length < 6 ? a.icon : '🧩', title: a.title, sub: 'App', run: function () { window.openApp(id); } });
      });
    } catch (e) {}
    apps.sort(function (a, b) { return b.s - a.s || a.title.localeCompare(b.title); });
    groups.push({ name: 'Apps', items: apps.slice(0, q ? 6 : 8) });
    if (!q) {
      groups.push({ name: 'Atajos', items: [
        { ico: '📋', title: 'Historial del portapapeles', sub: 'Alt+V', run: function () { openClipboard(); } },
        { ico: '📸', title: 'Captura de pantalla', sub: 'Ctrl+Shift+S', run: function () { var b = $('tbShotBtn'); if (b) b.click(); } }
      ] });
      return groups;
    }
    var sets = [];
    try {
      settingsRows().forEach(function (r) {
        var s = score(r.title + ' ' + r.desc, q);
        if (s > 0) sets.push({ s: s, ico: r.ico, title: r.title, sub: 'Ajustes · ' + r.desc, run: function () { window.snakeOpenSettings(r.sec); } });
      });
    } catch (e2) {}
    sets.sort(function (a, b) { return b.s - a.s; });
    groups.push({ name: 'Ajustes', items: sets.slice(0, 5) });
    var notes = [];
    try {
      (Array.isArray(window.userNotes) ? window.userNotes : (typeof userNotes !== 'undefined' && Array.isArray(userNotes) ? userNotes : [])).forEach(function (n) {
        var t = String((n && n.text) || ''); var s = score(t, q);
        if (s > 0) notes.push({ s: s, ico: n.pinned ? '📌' : '📝', title: t.replace(/\s+/g, ' ').slice(0, 80), sub: 'Nota', run: function () { openNotesWith(raw.trim()); } });
      });
    } catch (e3) {}
    groups.push({ name: 'Notas', items: notes.sort(function (a, b) { return b.s - a.s; }).slice(0, 5) });
    var files = [];
    try {
      var uf = typeof uploadedFiles !== 'undefined' && Array.isArray(uploadedFiles) ? uploadedFiles : [];
      uf.forEach(function (f) {
        var s = score(f.name, q);
        if (s > 0) files.push({ s: s, ico: '📄', title: f.name, sub: 'Archivo · ' + fmtBytes(f.size || 0), run: function () { if (typeof openFileViewerWindow === 'function') openFileViewerWindow(f); else window.openApp('explorer'); } });
      });
    } catch (e4) {}
    groups.push({ name: 'Archivos', items: files.sort(function (a, b) { return b.s - a.s; }).slice(0, 5) });
    var evs = [];
    try {
      var all = calEvents(); var today = ymd(new Date());
      Object.keys(all).forEach(function (day) {
        (Array.isArray(all[day]) ? all[day] : []).forEach(function (e) {
          var s = score(e.t, q);
          if (s > 0) evs.push({ s: s + (day >= today ? 1 : 0), day: day, ico: '📅', title: e.t, sub: 'Evento · ' + day.split('-').reverse().join('/') + (e.h ? ' · ' + e.h : ''), run: function () { window.openApp('calendario'); } });
        });
      });
    } catch (e5) {}
    groups.push({ name: 'Calendario', items: evs.sort(function (a, b) { return b.s - a.s || (a.day < b.day ? 1 : -1); }).slice(0, 5) });
    var ppl = [];
    chatUsersCache.list.forEach(function (u) {
      if (!u || !u.email || (chatUsersCache.email && u.email === chatUsersCache.email)) return;
      var s = Math.max(score(u.name || '', q), score(u.email, q) - 1);
      if (s > 0) ppl.push({ s: s, ico: '💬', title: u.name || u.email, sub: 'Chat · ' + u.email, run: function () { if (typeof window.openDoganieroChatWith === 'function') window.openDoganieroChatWith(u.email); else window.openApp('chat'); } });
    });
    groups.push({ name: 'Contactos de Chat', items: ppl.sort(function (a, b) { return b.s - a.s; }).slice(0, 5) });
    return groups;
  }
  function openNotesWith(q) {
    window.openApp('notes');
    setTimeout(function () {
      var i = document.querySelector('#win-notes .snk4a-notes-top input[type="search"]');
      if (i) { i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); }
    }, 250);
  }
  function openSearch() {
    if (!desktopReady()) return;
    closeCC();
    var ov = makeOverlay('snk5Search', 'Buscar apps, notas, archivos, eventos, contactos y ajustes…', '↑↓ para moverte · Enter para abrir · Esc para cerrar · Ctrl+K');
    var clip = $('snk5Clip'); if (clip) closeOverlay(clip);
    var inp = ov.querySelector('input');
    var flat = [];
    function pick(it) { closeOverlay(ov); ov._back = null; try { it.run(); } catch (e) {} }
    function paint() { flat = renderItems(ov, searchGroups(inp.value), pick); if (ov._mark) ov._mark(0); }
    ov._emptyText = 'No hay resultados';
    listNav(ov, function () { return flat; }, pick);
    inp.oninput = paint;
    if (!ov.classList.contains('open')) { ov._back = document.activeElement; inp.value = ''; }
    ov.classList.add('open');
    paint();
    loadChatUsers(function () { if (ov.classList.contains('open') && inp.value.trim()) paint(); });
    setTimeout(function () { inp.focus(); inp.select(); }, 0);
  }

  /* ---------- Historial del portapapeles (solo copias dentro de Snake OS, en memoria) ---------- */
  var clipStore = {};
  function clipList() { var e = email(); return e ? (clipStore[e] = clipStore[e] || []) : []; }
  function noteClip(text) {
    try {
      if (!email()) return;
      text = String(text == null ? '' : text);
      if (!text.trim() || text.length > 20000) return;
      var l = clipList();
      var i = l.findIndex(function (x) { return x.t === text; });
      if (i !== -1) l.splice(i, 1);
      l.unshift({ t: text, at: Date.now() });
      if (l.length > 25) l.length = 25;
    } catch (e) {}
  }
  function selectedText() {
    var a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|url|email|tel|number)$/i.test(a.type || 'text')))) {
      try { return a.value.substring(a.selectionStart, a.selectionEnd); } catch (e) { return ''; }
    }
    var s = window.getSelection ? String(window.getSelection()) : '';
    return s;
  }
  function watchClipboard() {
    ['copy', 'cut'].forEach(function (ev) {
      document.addEventListener(ev, function () { var t = selectedText(); setTimeout(function () { noteClip(t); }, 0); }, true);
    });
    try {
      var cb = navigator.clipboard;
      if (cb && cb.writeText && !cb._snk5) {
        var orig = cb.writeText.bind(cb);
        cb.writeText = function (t) { noteClip(t); return orig(t); };
        cb._snk5 = true;
      }
    } catch (e) {}
  }
  function agoTxt(ts) { var s = Math.round((Date.now() - ts) / 1000); return s < 60 ? 'hace ' + s + ' s' : s < 3600 ? 'hace ' + Math.round(s / 60) + ' min' : 'hace ' + Math.round(s / 3600) + ' h'; }
  function insertInto(el, text) {
    try {
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        el.focus();
        var st = el.selectionStart, en = el.selectionEnd;
        el.setRangeText(text, st, en, 'end');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      if (el.isContentEditable) { el.focus(); document.execCommand('insertText', false, text); return true; }
    } catch (e) {}
    return false;
  }
  function openClipboard() {
    if (!desktopReady()) return;
    closeCC();
    var ov = makeOverlay('snk5Clip', 'Filtrar el portapapeles…', 'Enter: pegar en el campo activo (o copiar) · Solo copias hechas en Snake OS · Se borra al recargar');
    var s = $('snk5Search'); if (s) closeOverlay(s);
    var inp = ov.querySelector('input');
    var target = ov.classList.contains('open') ? ov._target : document.activeElement;
    ov._target = target;
    var flat = [];
    function pick(it) {
      if (it.clear) { var e = email(); if (e) clipStore[e] = []; toast('Historial borrado'); paint(); return; }
      closeOverlay(ov);
      var t = ov._target; ov._target = null;
      if (t && t !== document.body && inField(t) && t.isConnected && !t.readOnly && !t.disabled && insertInto(t, it.text)) { toast('Pegado'); return; }
      copyText(it.text).then(function () { toast('Copiado al portapapeles'); }, function () { toast('No se pudo copiar'); });
    }
    function paint() {
      var q = norm(inp.value.trim());
      var items = clipList().filter(function (x) { return !q || norm(x.t).indexOf(q) !== -1; }).map(function (x) {
        return { ico: '📋', title: x.t.replace(/\s+/g, ' ').slice(0, 140), sub: agoTxt(x.at) + ' · ' + x.t.length + ' caracteres', mono: true, text: x.t };
      });
      var groups = [{ name: 'Copiado recientemente', items: items }];
      if (clipList().length) groups.push({ name: 'Opciones', items: [{ ico: '🧹', title: 'Borrar historial', clear: true }] });
      flat = renderItems(ov, groups, pick);
      if (ov._mark) ov._mark(0);
    }
    ov._emptyText = 'Todavía no has copiado nada en Snake OS. Copia un texto (Ctrl+C) y aparecerá aquí.';
    listNav(ov, function () { return flat; }, pick);
    inp.oninput = paint;
    if (!ov.classList.contains('open')) inp.value = '';
    ov.classList.add('open');
    paint();
    setTimeout(function () { inp.focus(); }, 0);
  }

  /* ---------- Atajos globales ---------- */
  function onB5Key(e) {
    if (e.defaultPrevented && !(e.key === 'Escape')) return;
    var k = e.key;
    var mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && !e.shiftKey && (e.code === 'KeyK' || (e.ctrlKey && (e.code === 'Space' || k === ' ')))) {
      if (e.target && e.target.closest && e.target.closest('#win-terminal, #win-server-i8, .xterm')) return;
      if (!desktopReady()) return;
      e.preventDefault(); e.stopPropagation();
      try { var al = $('appLauncher'); if (al && al.classList.contains('open') && window.__snakeOsDesktopExtras) { al.classList.remove('open'); al.setAttribute('aria-hidden', 'true'); } } catch (x) {}
      var ov = $('snk5Search');
      if (ov && ov.classList.contains('open')) closeOverlay(ov); else openSearch();
      return;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyV') {
      if (!desktopReady()) return;
      e.preventDefault(); e.stopPropagation();
      var c = $('snk5Clip');
      if (c && c.classList.contains('open')) closeOverlay(c); else openClipboard();
      return;
    }
    if (k === 'Escape') {
      ['snk5Search', 'snk5Clip'].forEach(function (id) { var o = $(id); if (o && o.classList.contains('open')) { closeOverlay(o); e.stopPropagation(); } });
      if ($('snk5CC') && $('snk5CC').classList.contains('open')) closeCC();
    }
  }

  /* ---------- Widgets de escritorio ---------- */
  var W_IDS = ['clock', 'event', 'notes', 'wallet'];
  var wState = { timer: null, bal: { at: 0, h: null, c: null, email: null, loading: false } };
  function widgetsWanted() { return !!email() && b5Get('widgets') && !document.body.classList.contains('phone-mode') && !!$('desktop'); }
  function widgetsSync() {
    var layer = $('snk5Widgets');
    if (!widgetsWanted()) {
      if (layer) layer.remove();
      if (wState.timer) { clearInterval(wState.timer); wState.timer = null; }
      return;
    }
    if (!layer || layer._email !== email()) {
      if (layer) layer.remove();
      layer = buildWidgets();
    }
    if (!wState.timer) wState.timer = setInterval(function () { if (!$('snk5Widgets')) { clearInterval(wState.timer); wState.timer = null; return; } paintWidgets(); }, 10000);
  }
  function wPos() { var p = lsGet('wpos', {}); return p && typeof p === 'object' ? p : {}; }
  function buildWidgets() {
    var desk = $('desktop');
    var layer = document.createElement('div');
    layer.id = 'snk5Widgets';
    layer._email = email();
    var icons = $('iconLayer');
    if (icons && icons.parentNode === desk) desk.insertBefore(layer, icons.nextSibling); else desk.appendChild(layer);
    var pos = wPos();
    var lw = layer.clientWidth || window.innerWidth, lh = layer.clientHeight || window.innerHeight - 76;
    W_IDS.forEach(function (id, i) {
      var w = document.createElement('div');
      w.className = 'snk5-w';
      w.dataset.w = id;
      w.setAttribute('role', 'region');
      var p = pos[id];
      var x = p && typeof p.x === 'number' ? p.x : lw - 226;
      var y = p && typeof p.y === 'number' ? p.y : Math.max(12, lh - 12 - (W_IDS.length - i) * 118);
      w.style.left = Math.max(0, Math.min(x, lw - 80)) + 'px';
      w.style.top = Math.max(0, Math.min(y, lh - 40)) + 'px';
      makeWidgetDraggable(w);
      layer.appendChild(w);
    });
    paintWidgets();
    return layer;
  }
  function makeWidgetDraggable(w) {
    var st = null;
    w.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      st = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: w.offsetLeft, y: w.offsetTop, moved: false };
      try { w.setPointerCapture(e.pointerId); } catch (x) {}
    });
    w.addEventListener('pointermove', function (e) {
      if (!st || e.pointerId !== st.id) return;
      var dx = e.clientX - st.sx, dy = e.clientY - st.sy;
      if (!st.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      st.moved = true; w.classList.add('drag');
      var layer = w.parentNode;
      var nx = Math.max(0, Math.min(st.x + dx, layer.clientWidth - w.offsetWidth));
      var ny = Math.max(0, Math.min(st.y + dy, layer.clientHeight - w.offsetHeight));
      w.style.left = nx + 'px'; w.style.top = ny + 'px';
    });
    function end(e) {
      if (!st || (e && e.pointerId !== st.id)) return;
      var moved = st.moved; st = null; w.classList.remove('drag');
      if (moved && email()) { var p = wPos(); p[w.dataset.w] = { x: w.offsetLeft, y: w.offsetTop }; lsSet('wpos', p); }
      else if (!moved) widgetClick(w.dataset.w);
    }
    w.addEventListener('pointerup', end);
    w.addEventListener('pointercancel', function () { st = null; w.classList.remove('drag'); });
  }
  function widgetClick(id) {
    if (id === 'event') window.openApp('calendario');
    else if (id === 'notes') window.openApp('notes');
    else if (id === 'clock') window.openApp('calendario');
  }
  function loadBalances() {
    var b = wState.bal, who = email();
    if (!who || b.loading || document.hidden) return;
    if (b.email === who && Date.now() - b.at < 120000) return;
    b.loading = true;
    Promise.all([
      apiCall('/api/doganiero-tv').then(function (d) { return d && typeof d.huesitos === 'number' ? d.huesitos : (d && d.huesitos != null ? Number(d.huesitos) : null); }).catch(function () { return null; }),
      apiCall('/api/metaverse/avatar').then(function (d) { return d && typeof d.coins === 'number' ? d.coins : null; }).catch(function () { return null; })
    ]).then(function (r) {
      b.loading = false;
      if (email() !== who) return;
      b.h = r[0]; b.c = r[1]; b.at = Date.now(); b.email = who;
      paintWidgets();
    });
  }
  function paintWidgets() {
    var layer = $('snk5Widgets'); if (!layer) return;
    var now = new Date();
    var tz = { timeZone: 'Europe/Madrid' };
    layer.querySelectorAll('.snk5-w').forEach(function (w) {
      var id = w.dataset.w, html = '';
      if (id === 'clock') {
        var t = now.toLocaleTimeString('es-ES', Object.assign({ hour: '2-digit', minute: '2-digit' }, tz));
        var d = now.toLocaleDateString('es-ES', Object.assign({ weekday: 'long', day: 'numeric', month: 'long' }, tz));
        html = '<h4>🕒 Madrid</h4><div class="big">' + esc(t) + '</div><div class="sub">' + esc(d.charAt(0).toUpperCase() + d.slice(1)) + '</div>';
        w.setAttribute('aria-label', 'Reloj ' + t);
      } else if (id === 'event') {
        var nx = nextEvents(3);
        html = '<h4>📅 Próximos eventos</h4>' + (nx.length ? '<ul>' + nx.map(function (e) { return '<li><b>' + esc(e.when) + '</b> · ' + esc(e.t) + '</li>'; }).join('') + '</ul>' : '<div class="muted">No hay eventos próximos</div>');
        w.setAttribute('aria-label', 'Próximos eventos');
      } else if (id === 'notes') {
        var pins = [];
        try { pins = (typeof userNotes !== 'undefined' && Array.isArray(userNotes) ? userNotes : []).filter(function (n) { return n && n.pinned; }).slice(0, 3); } catch (e) {}
        html = '<h4>📌 Notas fijadas</h4>' + (pins.length ? '<ul>' + pins.map(function (n) { return '<li>' + esc(String(n.text || '').replace(/\s+/g, ' ').slice(0, 60)) + '</li>'; }).join('') + '</ul>' : '<div class="muted">Fija notas en Notas para verlas aquí</div>');
        w.setAttribute('aria-label', 'Notas fijadas');
      } else if (id === 'wallet') {
        loadBalances();
        var b = wState.bal, ok = b.email === email();
        function v(x) { return ok && x != null ? String(x) : '…'; }
        html = '<h4>🦴 Saldo</h4><div class="row"><span>🦴 Huesitos</span><span>' + v(b.h) + '</span></div><div class="row"><span>🪙 Monedas</span><span>' + v(b.c) + '</span></div><div class="muted" style="margin-top:4px">Solo lectura</div>';
        w.setAttribute('aria-label', 'Saldo');
      }
      if (w._html !== html) { w.innerHTML = html; w._html = html; }
    });
  }
  function nextEvents(n) {
    var all = calEvents(), out = [];
    var now = new Date(), today = ymd(now), hm = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    Object.keys(all).sort().forEach(function (day) {
      if (day < today || out.length >= n) return;
      (Array.isArray(all[day]) ? all[day].slice() : []).sort(function (a, b) { return String(a.h || '').localeCompare(String(b.h || '')); }).forEach(function (e) {
        if (out.length >= n) return;
        if (day === today && e.h && e.h < hm) return;
        var when = day === today ? 'Hoy' : day.split('-').reverse().slice(0, 2).join('/');
        out.push({ t: e.t, when: when + (e.h ? ' ' + e.h : '') });
      });
    });
    return out;
  }

  /* ---------- Centro de control (modo móvil) ---------- */
  function ccTiles() {
    function tile(ico, name, on, run) { return { ico: ico, name: name, on: on, run: run }; }
    return [
      tile('🌗', 'Tema', null, function () { var x = window.__snakeOsDesktopExtras; if (x && x.toggleTheme) x.toggleTheme(); }),
      tile('🔕', 'No molestar', function () { return document.body.classList.contains('qs-dnd'); }, function () { if (!clickTile('qsDnd')) toast('No disponible ahora'); }),
      tile('🔊', 'Sonidos', function () { return tileState('qsSounds'); }, function () { if (!clickTile('qsSounds')) toast('No disponible ahora'); }),
      tile('🔠', 'Texto', null, function () { if (!clickTile('qsTextSize')) toast('No disponible ahora'); }),
      tile('◐', 'Alto contraste', function () { return b5Get('hc'); }, function () { b5Set('hc', !b5Get('hc')); }),
      tile('🐢', 'Menos animación', function () { return tileState('qsReduceMotion'); }, function () { clickTile('qsReduceMotion'); }),
      tile('🔎', 'Buscar', null, function () { closeCC(); setTimeout(openSearch, 60); }),
      tile('📋', 'Portapapeles', null, function () { closeCC(); setTimeout(openClipboard, 60); }),
      tile('📸', 'Captura', null, function () { closeCC(); setTimeout(function () { var b = $('tbShotBtn'); if (b) b.click(); }, 300); }),
      tile('📅', 'Calendario', null, function () { closeCC(); window.openApp('calendario'); }),
      tile('⚙️', 'Ajustes', null, function () { closeCC(); window.openApp('ajustes'); }),
      tile('⛶', 'Pantalla completa', null, function () { closeCC(); clickTile('qsFullscreen'); })
    ];
  }
  function paintCC(cc) {
    var now = new Date(), tz = { timeZone: 'Europe/Madrid' };
    var d = now.toLocaleDateString('es-ES', Object.assign({ weekday: 'long', day: 'numeric', month: 'long' }, tz));
    cc.querySelector('.cc-time').textContent = now.toLocaleTimeString('es-ES', Object.assign({ hour: '2-digit', minute: '2-digit' }, tz));
    cc.querySelector('.cc-date').textContent = d.charAt(0).toUpperCase() + d.slice(1);
    var grid = cc.querySelector('.cc-grid');
    grid.innerHTML = '';
    ccTiles().forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'cc-t';
      var on = typeof t.on === 'function' ? !!t.on() : null;
      if (on) b.classList.add('on');
      if (on !== null) b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.innerHTML = '<i>' + t.ico + '</i>' + esc(t.name);
      b.addEventListener('click', function () { try { t.run(); } catch (e) {} if ($('snk5CC').classList.contains('open')) setTimeout(function () { paintCC(cc); }, 80); });
      grid.appendChild(b);
    });
  }
  function ensureCC() {
    var cc = $('snk5CC');
    if (cc) return cc;
    cc = document.createElement('div');
    cc.id = 'snk5CC';
    cc.setAttribute('role', 'dialog');
    cc.setAttribute('aria-label', 'Centro de control');
    cc.innerHTML = '<div class="cc-bg"></div><div class="cc-sheet"><div class="cc-time"></div><div class="cc-date"></div><div class="cc-grid"></div><div class="cc-grab" aria-hidden="true"></div></div>';
    document.body.appendChild(cc);
    cc.querySelector('.cc-bg').addEventListener('click', closeCC);
    var sheet = cc.querySelector('.cc-sheet'), sy = null;
    sheet.addEventListener('touchstart', function (e) { sy = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener('touchmove', function (e) { if (sy !== null && sy - e.touches[0].clientY > 50) { sy = null; closeCC(); } }, { passive: true });
    return cc;
  }
  function openCC() {
    if (!desktopReady() || !document.body.classList.contains('phone-mode')) return;
    var cc = ensureCC();
    paintCC(cc);
    cc.classList.add('open');
    requestAnimationFrame(function () { requestAnimationFrame(function () { cc.classList.add('show'); }); });
  }
  function closeCC() {
    var cc = $('snk5CC');
    if (!cc || !cc.classList.contains('open')) return;
    cc.classList.remove('show');
    setTimeout(function () { if (!cc.classList.contains('show')) cc.classList.remove('open'); }, 240);
  }
  function watchPullDown() {
    var st = null;
    document.addEventListener('touchstart', function (e) {
      st = null;
      if (!document.body.classList.contains('phone-mode') || e.touches.length !== 1) return;
      var t = e.touches[0];
      var bar = $('phoneStatus');
      var onBar = e.target && e.target.closest && e.target.closest('#phoneStatus');
      var barH = bar && bar.getClientRects().length ? bar.getBoundingClientRect().bottom : 30;
      if (!onBar && t.clientY > Math.max(24, barH)) return;
      st = { x: t.clientX, y: t.clientY, done: false };
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!st || st.done) return;
      var t = e.touches[0], dy = t.clientY - st.y, dx = Math.abs(t.clientX - st.x);
      if (dx > 40 && dx > dy) { st = null; return; }
      if (dy > 12 && e.cancelable) e.preventDefault();
      if (dy > 45) { st.done = true; openCC(); }
    }, { passive: false });
    document.addEventListener('touchend', function () { st = null; }, { passive: true });
  }

  /* ---------- Arranque del lote 5 ---------- */
  var b5Started = false;
  function b5Start() {
    if (b5Started || !document.body) return;
    b5Started = true;
    window.addEventListener('keydown', onB5Key, true);
    window.addEventListener('keydown', function (e) { if (e.key === 'Tab' || (e.key && e.key.indexOf('Arrow') === 0 && !inField(e.target))) document.body.classList.add('snk-kbd'); }, true);
    window.addEventListener('pointerdown', function () { document.body.classList.remove('snk-kbd'); }, true);
    watchClipboard();
    watchPullDown();
    b5Apply();
    setInterval(function () {
      var e = email();
      if (e !== b5LastEmail) { b5LastEmail = e; b5Apply(); if (!e) { ['snk5Search', 'snk5Clip'].forEach(function (id) { closeOverlay($(id)); }); closeCC(); } }
      else if (!!$('snk5Widgets') !== widgetsWanted()) widgetsSync();
    }, 1000);
  }
  if (document.body) b5Start(); else document.addEventListener('DOMContentLoaded', b5Start);

  /* =================== Escritorios virtuales (modo ordenador) =================== */
  var VD_N = 4;
  var vd = { cur: 1, email: null };
  addCss(
    'body:not(.phone-mode) #windows > .app-window.snk-vd-off{visibility:hidden !important;opacity:0 !important;pointer-events:none !important;}' +
    'body:not(.phone-mode) #taskItems > .task-item.snk-vd-off{display:none !important;}' +
    '#snkVd{display:flex;align-items:center;gap:3px;padding:3px;border-radius:12px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);flex-shrink:0;margin:0 4px;}' +
    '#snkVd button{position:relative;margin:0;width:24px;height:24px;min-width:24px;min-height:0;padding:0;border-radius:8px;border:0;background:transparent;color:inherit;font-size:0.72rem;font-weight:800;cursor:pointer;box-shadow:none;line-height:24px;}' +
    '#snkVd button:hover{background:rgba(255,255,255,0.18);}' +
    '#snkVd button.cur{background:#34d17a;color:#053018;}' +
    '#snkVd button.has:not(.cur)::after{content:"";position:absolute;left:50%;bottom:2px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:currentColor;opacity:0.8;}' +
    'body.theme-light #snkVd{background:rgba(255,255,255,0.45);border-color:rgba(0,0,0,0.1);}' +
    'body.phone-mode #snkVd{display:none !important;}' +
    'body.snk-hc #snkVd{background:#000 !important;border:2px solid #fff !important;}body.snk-hc #snkVd button.cur{background:#ffd400 !important;color:#000 !important;}'
  );
  function vdOf(w) { var n = parseInt(w.getAttribute('data-snkvd'), 10); return n >= 1 && n <= VD_N ? n : 1; }
  function vdWins() { return Array.prototype.slice.call(document.querySelectorAll('#windows > .app-window')); }
  function vdApply() {
    var phone = document.body.classList.contains('phone-mode');
    vdWins().forEach(function (w) {
      var off = !phone && vdOf(w) !== vd.cur;
      if (w.classList.contains('snk-vd-off') !== off) w.classList.toggle('snk-vd-off', off);
      if (off && !w._snkVdOff) { w._snkVdOff = true; w.setAttribute('inert', ''); }
      else if (!off && w._snkVdOff) { w._snkVdOff = false; w.removeAttribute('inert'); }
      var ti = $('task-' + (w.id || '').replace(/^win-/, ''));
      if (ti && ti.classList.contains('snk-vd-off') !== off) ti.classList.toggle('snk-vd-off', off);
    });
    vdPaint();
  }
  function vdPaint() {
    var box = $('snkVd'); if (!box) return;
    var has = {};
    vdWins().forEach(function (w) { if (!w.classList.contains('win-closing')) has[vdOf(w)] = 1; });
    box.querySelectorAll('button').forEach(function (b) {
      var n = +b.dataset.vd;
      b.classList.toggle('cur', n === vd.cur);
      b.classList.toggle('has', !!has[n]);
      b.setAttribute('aria-pressed', n === vd.cur ? 'true' : 'false');
    });
  }
  function vdGo(n, silent) {
    n = Math.max(1, Math.min(VD_N, n));
    if (n === vd.cur) return;
    vd.cur = n;
    vdApply();
    if (!silent) toast('🖥️ Escritorio ' + n, 1100);
  }
  function vdMoveFocused(dir) {
    var top = null, z = -1;
    vdWins().forEach(function (w) {
      if (vdOf(w) !== vd.cur || w.classList.contains('minimized') || w.classList.contains('win-closing')) return;
      var wz = parseInt(w.style.zIndex, 10) || 0; if (wz >= z) { z = wz; top = w; }
    });
    var n = vd.cur + dir;
    if (!top || n < 1 || n > VD_N) return;
    top.setAttribute('data-snkvd', String(n));
    vd.cur = n;
    vdApply();
    toast('Ventana movida al escritorio ' + n, 1300);
  }
  function vdEnsureUi() {
    var tb = $('taskbar'), items = $('taskItems');
    if (!tb || !items || $('snkVd')) return;
    var box = document.createElement('div');
    box.id = 'snkVd';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Escritorios virtuales');
    for (var i = 1; i <= VD_N; i++) {
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.vd = String(i); b.textContent = String(i);
      b.title = 'Escritorio ' + i + ' · Ctrl+Alt+← / →';
      b.setAttribute('aria-label', 'Escritorio ' + i);
      b.addEventListener('click', function () { vdGo(+this.dataset.vd); });
      box.appendChild(b);
    }
    items.parentNode.insertBefore(box, items);
    vdPaint();
  }
  function vdWatch() {
    var layer = $('windows');
    if (!layer || layer._snkVd) return !!layer;
    layer._snkVd = true;
    new MutationObserver(function (muts) {
      var repaint = false, jump = 0;
      muts.forEach(function (m) {
        if (m.type === 'childList') {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType === 1 && n.classList && n.classList.contains('app-window') && !n.hasAttribute('data-snkvd')) n.setAttribute('data-snkvd', String(vd.cur));
          });
          repaint = true;
          return;
        }
        var w = m.target;
        if (w.parentNode !== layer || !w.classList.contains('app-window') || document.body.classList.contains('phone-mode')) return;
        if (vdOf(w) === vd.cur) return;
        if (m.attributeName === 'style') {
          var oz = /z-index:\s*(\d+)/.exec(m.oldValue || '');
          if (oz && String(oz[1]) !== String(w.style.zIndex)) jump = vdOf(w);
        } else if (m.attributeName === 'class') {
          var old = ' ' + (m.oldValue || '') + ' ';
          if (old.indexOf(' minimized ') !== -1 && !w.classList.contains('minimized')) jump = vdOf(w);
        }
      });
      if (jump) vdGo(jump);
      else if (repaint) vdApply();
    }).observe(layer, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'], attributeOldValue: true });
    var ti = $('taskItems');
    if (ti) new MutationObserver(function () { vdApply(); }).observe(ti, { childList: true });
    return true;
  }
  function onVdKey(e) {
    if (!e.ctrlKey || !e.altKey || e.metaKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (document.body.classList.contains('phone-mode') || !desktopReady()) return;
    if (inField(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    var dir = e.key === 'ArrowLeft' ? -1 : 1;
    if (e.shiftKey) vdMoveFocused(dir); else vdGo(vd.cur + dir);
  }
  var vdStarted = false;
  function vdStart() {
    if (vdStarted || !document.body) return;
    if (!vdWatch()) return;
    vdStarted = true;
    window.addEventListener('keydown', onVdKey, true);
    setInterval(function () {
      vdEnsureUi();
      var e = email();
      if (e !== vd.email) { vd.email = e; if (vd.cur !== 1) { vd.cur = 1; } vdApply(); }
      var phone = document.body.classList.contains('phone-mode');
      if (phone !== vd.phone) { vd.phone = phone; vdApply(); }
    }, 1000);
    vdEnsureUi();
  }
  if (document.readyState !== 'loading') vdStart(); else document.addEventListener('DOMContentLoaded', vdStart);
  setTimeout(vdStart, 1500);

  /* Arranque: instalar en cuanto exista APPS */
  if (!installAll()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (installAll() || tries > 100) clearInterval(iv);
    }, 100);
  }
  window.SnakeApps4a = { version: SNK_VERSION, toast: toast };
})();
