/* cache-bust 202610051715 — mando pair via ws */
(function (global) {
  'use strict';

  /* Local-only: who I stopped hearing. Survives closing/reopening the app until reload. */
  var mutedPeers = new Set();

  var WORLDS = [
    { id: 'plaza', name: 'Plaza', emoji: '🏛️', bg: '#2d6b3a', ground: '#3d8f4a', path: '#c4b49a', accent: '#6b8cae', size: 800 },
    { id: 'parque', name: 'Parque', emoji: '🌳', bg: '#1e4d2b', ground: '#2f7a3e', path: '#8fbc6b', accent: '#5a8f4a', size: 800 },
    { id: 'ciudad', name: 'Ciudad', emoji: '🏙️', bg: '#2a3340', ground: '#4a5564', path: '#6b7280', accent: '#8e6bb8', size: 800 },
  ];

  var EVENT_ROOMS = [
    { id: 'sala-central', name: 'Sala Central', world: 'plaza', emoji: '🎪', x: 400, y: 280 },
    { id: 'anfiteatro', name: 'Anfiteatro', world: 'plaza', emoji: '🎭', x: 560, y: 480 },
    { id: 'quiosco', name: 'Quiosco', world: 'parque', emoji: '🍵', x: 320, y: 360 },
    { id: 'pista', name: 'Pista al aire libre', world: 'parque', emoji: '🎵', x: 520, y: 420 },
    { id: 'auditorio', name: 'Auditorio', world: 'ciudad', emoji: '🎤', x: 380, y: 300 },
    { id: 'galeria', name: 'Galería', world: 'ciudad', emoji: '🖼️', x: 540, y: 460 },
  ];


  // Events removed: rooms stay as venues only (no event overlay / notifs).
  function getRoomEvent(_roomOrId) {
    return null;
  }

  function applyWorldsCatalog(data) {
    if (!data || !Array.isArray(data.rooms)) return;
    data.rooms.forEach(function (apiRoom) {
      if (!apiRoom || !apiRoom.id) return;
      var id = String(apiRoom.id);
      var local = null;
      for (var i = 0; i < EVENT_ROOMS.length; i++) {
        if (EVENT_ROOMS[i].id === id) { local = EVENT_ROOMS[i]; break; }
      }
      if (!local) {
        local = {
          id: id,
          name: apiRoom.name || id,
          world: apiRoom.world || 'plaza',
          emoji: apiRoom.emoji || '📍',
          x: typeof apiRoom.x === 'number' ? apiRoom.x : 400,
          y: typeof apiRoom.y === 'number' ? apiRoom.y : 400
        };
        EVENT_ROOMS.push(local);
      } else {
        if (apiRoom.name) local.name = apiRoom.name;
        if (apiRoom.world) local.world = apiRoom.world;
        if (apiRoom.emoji) local.emoji = apiRoom.emoji;
        if (typeof apiRoom.x === 'number') local.x = apiRoom.x;
        if (typeof apiRoom.y === 'number') local.y = apiRoom.y;
      }
      // event fields ignored (Metaverse rooms have no events)
    });
  }

  var EMOTES = ['👋', '😂', '🦴', '❤️', '🎉', '✨', '🔥', '🌈', '🚀', '😎', '🥳', '💥', '⭐', '🍕', '🕺', '💃', '🦄', '🎵'];

  var pendingMetaverseRoom = null;

  function setMetaversePendingRoom(roomId, world) {
    if (!roomId) {
      pendingMetaverseRoom = null;
      return;
    }
    pendingMetaverseRoom = {
      roomId: String(roomId),
      world: world ? String(world) : null
    };
  }

  function takeMetaversePendingRoom() {
    var p = pendingMetaverseRoom;
    pendingMetaverseRoom = null;
    return p;
  }

  function openMetaverseRoom(roomId, world) {
    if (roomId) setMetaversePendingRoom(roomId, world);
    if (roomId && typeof global.__mvEnterRoom === 'function') {
      try {
        global.__mvEnterRoom(String(roomId));
        return;
      } catch (e) {}
    }
    if (typeof global.openApp === 'function') global.openApp('metaverse');
  }



  var WORLD_BY_ID = {};
  WORLDS.forEach(function (w) { WORLD_BY_ID[w.id] = w; });

  var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
  var threePromise = null;

  function loadThree() {
    if (global.THREE) return Promise.resolve(global.THREE);
    if (threePromise) return threePromise;
    threePromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = THREE_URL;
      s.async = true;
      s.onload = function () {
        if (global.THREE) resolve(global.THREE);
        else reject(new Error('THREE no disponible'));
      };
      s.onerror = function () { reject(new Error('No se pudo cargar Three.js')); };
      document.head.appendChild(s);
    });
    return threePromise;
  }

  function hslToHex(hsl) {
    try {
      var el = document.createElement('div');
      el.style.color = hsl;
      document.body.appendChild(el);
      var rgb = getComputedStyle(el).color;
      document.body.removeChild(el);
      var m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgb);
      if (!m) return 0x34d17a;
      return (parseInt(m[1], 10) << 16) | (parseInt(m[2], 10) << 8) | parseInt(m[3], 10);
    } catch (e) { return 0x34d17a; }
  }

  function parseHexColor(c, fallback) {
    if (typeof c === 'number') return c;
    var s = String(c || '').trim();
    if (s.charAt(0) === '#') {
      var h = s.slice(1);
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      var n = parseInt(h, 16);
      if (!isNaN(n)) return n;
    }
    return fallback != null ? fallback : 0x888888;
  }

  function colorFromEmail(email) {
    var h = 0;
    var s = String(email || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return 'hsl(' + (h % 360) + ',70%,55%)';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTime(ts) {
    try {
      return new Date(ts * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function worldDecor(worldId) {
    var items = [];
    var i;
    if (worldId === 'plaza') {
      items.push({ type: 'circle', x: 400, y: 400, r: 90, fill: '#c4b49a' });
      items.push({ type: 'rect', x: 520, y: 300, w: 70, h: 55, fill: '#6b8cae' });
      items.push({ type: 'rect', x: 220, y: 460, w: 80, h: 50, fill: '#b07a4a' });
      items.push({ type: 'rect', x: 450, y: 520, w: 55, h: 70, fill: '#8e6bb8' });
      items.push({ type: 'path', x: 370, y: 40, w: 60, h: 720, fill: '#d8c7a6' });
      items.push({ type: 'path', x: 40, y: 370, w: 720, h: 60, fill: '#d8c7a6' });
      items.push({ type: 'fountain', x: 400, y: 400 });
      [[250, 250], [560, 250], [250, 560], [600, 560], [330, 160], [480, 170], [160, 520], [640, 330]].forEach(function (p) {
        items.push({ type: 'lamp', x: p[0], y: p[1] });
      });
      items.push({ type: 'bench', x: 330, y: 230, rot: 0 });
      items.push({ type: 'bench', x: 470, y: 560, rot: Math.PI });
      items.push({ type: 'bench', x: 230, y: 330, rot: Math.PI / 2 });
      items.push({ type: 'bench', x: 640, y: 450, rot: -Math.PI / 2 });
      items.push({ type: 'stall', x: 150, y: 470, rot: Math.PI / 2, color: 0xd35400 });
      items.push({ type: 'stall', x: 650, y: 470, rot: -Math.PI / 2, color: 0x1f6f4a });
      for (i = 0; i < 12; i++) {
        var ang = (i / 12) * Math.PI * 2;
        items.push({ type: 'tree', x: 400 + Math.cos(ang) * 220, y: 400 + Math.sin(ang) * 220 });
        items.push({ type: 'bush', x: 400 + Math.cos(ang + 0.26) * 180, y: 400 + Math.sin(ang + 0.26) * 180 });
      }
      items.push({ type: 'flower', x: 180, y: 180 });
      items.push({ type: 'flower', x: 620, y: 180 });
      items.push({ type: 'flower', x: 180, y: 620 });
      items.push({ type: 'flower', x: 700, y: 250 });
    } else if (worldId === 'parque') {
      items.push({ type: 'circle', x: 400, y: 400, r: 70, fill: '#5a9e6a' });
      items.push({ type: 'rect', x: 280, y: 250, w: 100, h: 40, fill: '#6b4423' });
      for (i = 0; i < 20; i++) {
        items.push({ type: 'tree', x: 80 + (i % 5) * 150 + (i % 2) * 20, y: 90 + Math.floor(i / 5) * 160 });
      }
      items.push({ type: 'tree', x: 730, y: 40 });
      items.push({ type: 'tree', x: 70, y: 730 });
      items.push({ type: 'tree', x: 730, y: 730 });
      items.push({ type: 'circle', x: 600, y: 200, r: 40, fill: '#4a90d9' });
      items.push({ type: 'path', x: 60, y: 318, w: 680, h: 28, fill: '#c4b49a' });
      items.push({ type: 'path', x: 448, y: 60, w: 28, h: 680, fill: '#c4b49a' });
      items.push({ type: 'path', x: 575, y: 248, w: 50, h: 18, fill: '#8b5a2b' });
      items.push({ type: 'bench', x: 200, y: 370, rot: 0 });
      items.push({ type: 'bench', x: 640, y: 370, rot: 0 });
      items.push({ type: 'bench', x: 500, y: 640, rot: 0 });
      items.push({ type: 'bench', x: 300, y: 150, rot: Math.PI / 2 });
      [[165, 300], [330, 300], [640, 300], [400, 140], [430, 520], [700, 640]].forEach(function (p) {
        items.push({ type: 'lamp', x: p[0], y: p[1] });
      });
      items.push({ type: 'bush', x: 540, y: 230 });
      items.push({ type: 'bush', x: 670, y: 160 });
      items.push({ type: 'bush', x: 560, y: 150, color: 0x3e9a55 });
      items.push({ type: 'bush', x: 120, y: 400 });
      items.push({ type: 'flower', x: 360, y: 450 });
      items.push({ type: 'flower', x: 700, y: 480 });
      items.push({ type: 'flower', x: 120, y: 480 });
      items.push({ type: 'flower', x: 520, y: 250 });
    } else {
      for (i = 0; i < 10; i++) {
        items.push({ type: 'rect', x: 80 + (i % 5) * 140, y: 100 + Math.floor(i / 5) * 280, w: 60, h: 120 + (i % 3) * 30, fill: i % 2 ? '#5a6574' : '#3d4654' });
      }
      items.push({ type: 'path', x: 40, y: 300, w: 720, h: 56, fill: '#6b7280' });
      items.push({ type: 'path', x: 145, y: 40, w: 48, h: 720, fill: '#5c6570' });
      items.push({ type: 'path', x: 425, y: 40, w: 48, h: 720, fill: '#5c6570' });
      items.push({ type: 'path', x: 40, y: 620, w: 720, h: 48, fill: '#6b7280' });
      for (i = 0; i < 6; i++) {
        items.push({ type: 'path', x: 250 + i * 14, y: 308, w: 8, h: 40, fill: '#e8e4d8' });
      }
      [[100, 345], [250, 345], [520, 345], [700, 345], [100, 660], [300, 660], [700, 660]].forEach(function (p) {
        items.push({ type: 'lamp', x: p[0], y: p[1] });
      });
      items.push({ type: 'bench', x: 230, y: 370, rot: 0 });
      items.push({ type: 'bench', x: 600, y: 370, rot: 0 });
      items.push({ type: 'bench', x: 400, y: 660, rot: 0 });
      items.push({ type: 'fountain', x: 400, y: 700 });
      items.push({ type: 'stall', x: 250, y: 700, rot: 0, color: 0xb03a2e });
      items.push({ type: 'stall', x: 640, y: 690, rot: 0.4, color: 0x245b8a });
      items.push({ type: 'flower', x: 330, y: 700 });
      items.push({ type: 'flower', x: 480, y: 690 });
    }
    return items;
  }

  /* Actualización 2026-10-09: pulido de la interfaz del Metaverse (contador en línea, avisos, botones) */
  function ensureMvUpd20261009Css() {
    if (document.getElementById('mv-upd-20261009-css')) return;
    var st = document.createElement('style');
    st.id = 'mv-upd-20261009-css';
    st.textContent =
      '.mv-online-count{display:inline-flex;align-items:center;justify-content:center;gap:4px;margin-left:6px;padding:1px 7px;height:18px;border-radius:999px;' +
        'font-size:0.66rem;font-weight:800;color:#eafff0;background:rgba(52,209,122,0.22);border:1px solid rgba(157,255,194,0.5);vertical-align:middle;}' +
      '.mv-online-count::before{content:"";width:6px;height:6px;border-radius:50%;background:#34d17a;box-shadow:0 0 0 0 rgba(52,209,122,0.7);animation:mvOnlinePulse 2s ease-out infinite;}' +
      '.mv-online-count.bump{animation:mvCountBump .45s cubic-bezier(0.22,1.4,0.36,1);}' +
      '@keyframes mvOnlinePulse{0%{box-shadow:0 0 0 0 rgba(52,209,122,0.7);}70%{box-shadow:0 0 0 6px rgba(52,209,122,0);}100%{box-shadow:0 0 0 0 rgba(52,209,122,0);}}' +
      '@keyframes mvCountBump{0%{transform:scale(1);}40%{transform:scale(1.25);}100%{transform:scale(1);}}' +
      '.mv-toast{padding:8px 18px;border-radius:999px;background:rgba(0,0,0,0.42);border:1px solid rgba(255,255,255,0.18);' +
        'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transform:translate(-50%,-50%) scale(0.86);' +
        'transition:opacity .2s ease,transform .32s cubic-bezier(0.22,1.4,0.36,1);white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis;}' +
      '.mv-toast.show{transform:translate(-50%,-50%) scale(1);}' +
      '.mv-fun-grid.open{animation:mvGridIn .24s cubic-bezier(0.22,1,0.36,1);transform-origin:top right;}' +
      '@keyframes mvGridIn{from{opacity:0;transform:translateY(-6px) scale(0.96);}to{opacity:1;transform:none;}}' +
      '.mv-root .mv-view-toggle,.mv-root .mv-mando-pro-btn,.mv-root .mv-mic-btn,.mv-root .mv-action-btn,.mv-root .mv-fun-toggle,.mv-root .mv-fun-btn,' +
      '.mv-root .mv-panel-toggle,.mv-root .mv-world-btn,.mv-root .mv-room-btn,.mv-root .mv-user,.mv-root .mv-mute-btn{' +
        'transition:transform .14s cubic-bezier(0.22,1,0.36,1),background .2s ease,border-color .2s ease,box-shadow .2s ease,filter .14s ease;}' +
      '.mv-root .mv-view-toggle:active,.mv-root .mv-mando-pro-btn:active,.mv-root .mv-mic-btn:active,.mv-root .mv-action-btn:active,.mv-root .mv-fun-toggle:active,' +
      '.mv-root .mv-fun-btn:active,.mv-root .mv-panel-toggle:active,.mv-root .mv-mute-btn:active{transform:scale(0.93);filter:brightness(1.12);}' +
      '.mv-root .mv-world-btn:active,.mv-root .mv-room-btn:active,.mv-root .mv-user:not(.self):active{transform:scale(0.98);}' +
      '.mv-root .mv-mic-btn.on{animation:mvMicGlow 1.6s ease-in-out infinite;}' +
      '@keyframes mvMicGlow{0%,100%{box-shadow:0 0 0 2px rgba(255,80,100,0.35);}50%{box-shadow:0 0 0 5px rgba(255,80,100,0.12);}}' +
      '@media (prefers-reduced-motion: reduce){.mv-online-count::before,.mv-online-count.bump,.mv-fun-grid.open,.mv-root .mv-mic-btn.on{animation:none !important;}.mv-toast{transition:opacity .2s;}}';
    document.head.appendChild(st);
  }

  function renderMetaverseApp(container, opts) {
    opts = opts || {};
    var user = opts.currentUser || global.currentUser;
    if (!user || !user.email) {
      container.innerHTML = '<p class="sub">Inicia sesión para entrar en Doganiero Metaverse.</p>';
      return function () {};
    }

    ensureMvUpd20261009Css();
    container.innerHTML =
      '<div class="mv-root">' +
      '  <div class="mv-stage">' +
      '    <canvas class="mv-canvas"></canvas>' +
      '    <div class="mv-labels" data-mv="labels"></div>' +
      '    <div class="mv-crosshair" data-mv="crosshair" hidden aria-hidden="true"></div>' +
      '    <div class="mv-hud">' +
      '      <div class="mv-title"><img class="app-icon-img" src="/static/assets/doganiero-metaverse-logo.jpg?v=202610101755" alt=""> Doganiero Metaverse</div>' +
      '      <div class="mv-hint">WASD mover · 1ª persona: clic para mirar · Ratón brazo · Espacio salto</div>' +
      '      <button type="button" class="mv-view-toggle" data-mv="viewToggle" aria-pressed="true" title="Cambiar vista">Desde arriba</button>' +
      '      <button type="button" class="mv-mando-pro-btn" data-mv="mandoProBtn" title="Abrir Mando Pro en el móvil">📱 Mando Pro</button>' +
      '      <div class="mv-status" data-mv="status">Conectando…</div>' +
      '      <div class="mv-score" data-mv="coins">🪙 0 coins</div>' +
      '      <div class="mv-party-timer" data-mv="partyTimer">⏳ Fiesta en 1:00:00</div>' +
      '      <div class="mv-world-bar" data-mv="worldBar"></div>' +
      '    </div>' +
      '    <div class="mv-emotes" data-mv="emotes"></div>' +
      '    <div class="mv-voice-bar" data-mv="voiceBar">' +
      '      <button type="button" class="mv-mic-btn" data-mv="micBtn" title="Chat de voz">🎤 Voz</button>' +
      '      <span class="mv-voice-status" data-mv="voiceStatus">Micrófono apagado</span>' +
      '    </div>' +
      '    <div class="mv-stick" data-mv="stick" aria-label="Joystick de movimiento">' +
      '      <div class="mv-stick-base">' +
      '        <div class="mv-stick-knob" data-mv="stickKnob"></div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="mv-arm-stick" data-mv="armStick" aria-label="Joystick de la mano">' +
      '      <div class="mv-arm-stick-base">' +
      '        <div class="mv-arm-stick-knob" data-mv="armStickKnob"></div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="mv-action-pad" data-mv="actionPad" aria-label="Acciones táctiles">' +
      '      <button type="button" class="mv-action-btn" data-mv="runBtn" title="Correr">🏃</button>' +
      '      <button type="button" class="mv-action-btn" data-mv="funPadBtn" title="Diversión" style="margin-top:8px;">🎉</button>' +
      '    </div>' +
      '    <button type="button" class="mv-panel-toggle" data-mv="panelToggle" aria-expanded="false" title="Menú">☰ Menú</button>' +
      '    <button type="button" class="mv-side-backdrop" data-mv="sideBackdrop" aria-label="Cerrar menú"></button>' +
      '    <div class="mv-toast" data-mv="toast"></div>' +
      '    <div class="mv-fx-overlay" data-mv="fx"></div>' +
      '    <div class="mv-fun-panel" data-mv="funPanel">' +
      '      <button type="button" class="mv-fun-toggle" data-mv="funToggle">🎉 Diversión</button>' +
      '      <div class="mv-fun-grid" data-mv="funGrid">' +
      '        <button type="button" class="mv-fun-btn" data-fun="confetti">🎊 Confeti</button>' +
      '        <button type="button" class="mv-fun-btn" data-fun="fireworks">🎆 Fuegos</button>' +
      '        <button type="button" class="mv-fun-btn" data-fun="disco">🪩 Disco</button>' +
      '        <button type="button" class="mv-fun-btn" data-fun="turbo">⚡ Turbo</button>' +
      '        <button type="button" class="mv-fun-btn" data-fun="jump">🦘 Salto</button>' +
      '        <button type="button" class="mv-fun-btn" data-fun="dance">🕺 Baile</button>' +
      '        <button type="button" class="mv-fun-btn" data-fun="balloons">🎈 Globos</button>' +
      '        <button type="button" class="mv-fun-btn" data-fun="stars">⭐ Estrellas</button>' +
      '        <button type="button" class="mv-fun-btn" data-fun="quake">🌋 Temblor</button>' +
      '        <button type="button" class="mv-fun-btn" data-fun="magnet">🧲 Imán</button>' +
      '        <button type="button" class="mv-fun-btn" data-fun="rocket">🚀 Cohete</button>' +
      '        <button type="button" class="mv-fun-btn" data-fun="mystery">🎲 Sorpresa</button>' +
      '      </div>' +
      '    </div>' +
      '    <div class="mv-mando-overlay hidden" data-mv="mandoOverlay">' +
      '      <div class="mv-mando-card">' +
      '        <div class="mv-mando-card-title">📱 Mando Pro</div>' +
      '        <div class="mv-mando-card-sub">Solo efectos extra · sin mover al jugador</div>' +
      '        <div class="mv-mando-ip" data-mv="mandoIp">…</div>' +
      '        <div class="mv-mando-code-wrap">Código <span data-mv="mandoCode">······</span></div>' +
      '        <div class="mv-mando-actions">' +
      '          <button type="button" class="mv-mando-copy" data-mv="mandoCopy">Copiar enlace</button>' +
      '          <button type="button" class="mv-mando-refresh" data-mv="mandoRefresh">Nuevo código</button>' +
      '          <button type="button" class="mv-mando-close" data-mv="mandoClose">Cerrar</button>' +
      '        </div>' +
      '        <div class="mv-mando-hint">En el móvil (misma Wi‑Fi o el enlace): abre esa IP / URL</div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="mv-room-overlay hidden" data-mv="roomOverlay">' +
      '      <div class="mv-room-card">' +
      '        <div class="mv-room-card-title" data-mv="roomTitle">Sala</div>' +
      '        <div class="mv-room-event" data-mv="roomEvent"></div>' +
      '        <button type="button" class="mv-room-leave" data-mv="roomLeave">Salir de la sala</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <aside class="mv-side">' +
      '    <div class="mv-section"><div class="mv-sec-title">Mundos</div><div class="mv-worlds" data-mv="worlds"></div></div>' +
      '    <div class="mv-section"><div class="mv-sec-title">Salas</div><div class="mv-rooms" data-mv="rooms"></div></div>' +
      '    <div class="mv-section"><div class="mv-sec-title">En línea <span class="mv-chat-target" data-mv="worldLabel">Plaza</span><span class="mv-online-count" data-mv="onlineCount" title="Jugadores en este mundo">0</span></div><div class="mv-online" data-mv="online"></div></div>' +
      '    <div class="mv-section mv-avatar-sec">' +
      '      <div class="mv-sec-title">Avatar</div>' +
      '      <div class="mv-coins" data-mv="coinsSide">🪙 0 coins</div>' +
      '      <div class="mv-avatar-shop" data-mv="avatarShop"></div>' +
      '      <div class="mv-av-msg" data-mv="avatarMsg"></div>' +
      '    </div>' +
      '    <div class="mv-section mv-chat-sec">' +
      '      <div class="mv-sec-title">Chat <span class="mv-chat-target" data-mv="chatTarget">Sala pública</span></div>' +
      '      <div class="mv-messages" data-mv="messages"></div>' +
      '      <div class="mv-chat-foot">' +
      '        <form class="mv-compose" data-mv="form"><input type="text" maxlength="500" placeholder="Escribe un mensaje…" data-mv="input" autocomplete="off"><button type="submit">Enviar</button></form>' +
      '        <button type="button" class="link-btn mv-public-btn" data-mv="publicBtn">Volver a chat público</button>' +
      '      </div>' +
      '    </div>' +
      '  </aside>' +
      '</div>';

    var root = container.querySelector('.mv-root');
    var canvas = container.querySelector('.mv-canvas');
    var THREE = null;
    var renderer = null;
    var scene = null;
    var camera = null;
    var worldRoot = null;
    var avatarMeshes = {};
    var boneMeshes = {};
    var particleMeshes = [];
    var roomMarkers = {};
    var nameLabels = {};
    var labelsEl = null;
    var threeReady = false;
    var hemiLight = null;
    var dirLight = null;
    var raycaster = null;
    var pointerNdc = { x: 0, y: 0 };
    var worldPlane = null;
    var emoteApplied = {};
    var statusEl = container.querySelector('[data-mv="status"]');
    var scoreEl = container.querySelector('[data-mv="score"]');
    var coinsEl = container.querySelector('[data-mv="coins"]');
    var partyTimerEl = container.querySelector('[data-mv="partyTimer"]');
    var coinsSideEl = container.querySelector('[data-mv="coinsSide"]');
    var avatarShopEl = container.querySelector('[data-mv="avatarShop"]');
    var avatarMsgEl = container.querySelector('[data-mv="avatarMsg"]');
    var onlineEl = container.querySelector('[data-mv="online"]');
    var onlineCountEl = container.querySelector('[data-mv="onlineCount"]');
    var messagesEl = container.querySelector('[data-mv="messages"]');
    var chatTargetEl = container.querySelector('[data-mv="chatTarget"]');
    var worldLabelEl = container.querySelector('[data-mv="worldLabel"]');
    var worldsEl = container.querySelector('[data-mv="worlds"]');
    var roomsEl = container.querySelector('[data-mv="rooms"]');
    var worldBarEl = container.querySelector('[data-mv="worldBar"]');
    var form = container.querySelector('[data-mv="form"]');
    var input = container.querySelector('[data-mv="input"]');
    var publicBtn = container.querySelector('[data-mv="publicBtn"]');
    var roomOverlay = container.querySelector('[data-mv="roomOverlay"]');
    var roomTitleEl = container.querySelector('[data-mv="roomTitle"]');
    var roomEventEl = container.querySelector('[data-mv="roomEvent"]');
    var roomLeaveBtn = container.querySelector('[data-mv="roomLeave"]');
    var emotesEl = container.querySelector('[data-mv="emotes"]');
    var toastEl = container.querySelector('[data-mv="toast"]');
    var fxEl = container.querySelector('[data-mv="fx"]');
    var funToggle = container.querySelector('[data-mv="funToggle"]');
    var funGrid = container.querySelector('[data-mv="funGrid"]');
    var funUntil = { turbo: 0, dance: 0, jump: 0, magnet: 0, rocket: 0, disco: 0 };
    var funData = { jumpY: 0, rocketBoost: 0 };
    var wsReplaced = false;
    var funCooldown = { jumpY: 0, rocketBoost: 0 };
    var mandoProBtn = container.querySelector('[data-mv="mandoProBtn"]');
    var mandoOverlay = container.querySelector('[data-mv="mandoOverlay"]');
    var mandoIpEl = container.querySelector('[data-mv="mandoIp"]');
    var mandoCodeEl = container.querySelector('[data-mv="mandoCode"]');
    var mandoCopyBtn = container.querySelector('[data-mv="mandoCopy"]');
    var mandoRefreshBtn = container.querySelector('[data-mv="mandoRefresh"]');
    var mandoCloseBtn = container.querySelector('[data-mv="mandoClose"]');
    var mandoPairUrl = '';
    var mandoPairCode = '';
    var proFxUntil = {}; /* email -> { effect: untilMs } */
    var stickEl = container.querySelector('[data-mv="stick"]');
    var stickKnob = container.querySelector('[data-mv="stickKnob"]');
    var armStickEl = container.querySelector('[data-mv="armStick"]');
    var armStickKnob = container.querySelector('[data-mv="armStickKnob"]');
    labelsEl = container.querySelector('[data-mv="labels"]');
    var actionPadEl = container.querySelector('[data-mv="actionPad"]');
    var runBtn = container.querySelector('[data-mv="runBtn"]');
    var panelToggle = container.querySelector('[data-mv="panelToggle"]');
    var viewToggle = container.querySelector('[data-mv="viewToggle"]');
    var crosshairEl = container.querySelector('[data-mv="crosshair"]');
    var sideBackdrop = container.querySelector('[data-mv="sideBackdrop"]');
    var sideEl = container.querySelector('.mv-side');
    var micBtn = container.querySelector('[data-mv="micBtn"]');
    var voiceStatusEl = container.querySelector('[data-mv="voiceStatus"]');

    var closed = false;
    var bgAudio = null;
    var bgUnlockBound = false;
    function stopMetaverseBg() {
      if (bgUnlockBound) {
        try { container.removeEventListener("pointerdown", startMetaverseBgOnGesture); } catch (eBgU) {}
        try { document.removeEventListener("keydown", startMetaverseBgOnGesture); } catch (eBgK) {}
        bgUnlockBound = false;
      }
      if (!bgAudio) return;
      try { bgAudio.pause(); } catch (eBgP) {}
      try { bgAudio.currentTime = 0; } catch (eBgT) {}
      try {
        bgAudio.removeAttribute("src");
        bgAudio.load();
      } catch (eBgS) {}
      bgAudio = null;
    }
    function startMetaverseBgOnGesture() {
      if (closed || !bgAudio) return;
      var p = bgAudio.play();
      if (p && p.then) {
        p.then(function () {
          try { container.removeEventListener("pointerdown", startMetaverseBgOnGesture); } catch (e1) {}
          try { document.removeEventListener("keydown", startMetaverseBgOnGesture); } catch (e2) {}
          bgUnlockBound = false;
        }).catch(function () {});
      }
    }
    function startMetaverseBg() {
      if (closed) return;
      if (!bgAudio) {
        bgAudio = new Audio("/static/assets/metaverse-bg.mp3");
        bgAudio.loop = true;
        bgAudio.volume = 0.35;
        bgAudio.preload = "auto";
        bgAudio.setAttribute("playsinline", "");
      }
      var p = bgAudio.play();
      if (p && p.then) {
        p.catch(function () {
          if (closed || !bgAudio || bgUnlockBound) return;
          bgUnlockBound = true;
          container.addEventListener("pointerdown", startMetaverseBgOnGesture);
          document.addEventListener("keydown", startMetaverseBgOnGesture);
        });
      }
    }
    var ws = null;
    var wsReconnectTimer = null;
    var wsHeartbeatTimer = null;
    var wsReconnectAttempt = 0;
    var wsConnecting = false;
    var wsLastPongAt = 0;
    var chatPeer = null;
    var players = {};
    var remotePos = {};
    var bones = [];
    var particles = [];
    var floaters = {};
    var myScore = 0;
    var myCoins = 0;
    var myLook = { skin: 'claro', hair: 'corto', shirt: 'verde', hat: 'none' };
    var avatarBusy = false;
    var avatarRev = 0;
    var currentWorld = 'plaza';
    var currentRoom = null;
    var me = { x: 400 + (Math.random() - 0.5) * 60, y: 400 + (Math.random() - 0.5) * 60, ry: 0 };
    var keys = {};
    var stickVec = { x: 0, y: 0 };
    var stickActive = false;
    var stickPointerId = null;
    var stickMax = 42;
    var stickDead = 0.08;
    var armStickVec = { x: 0, y: 0 };
    var armStickActive = false;
    var armStickPointerId = null;
    var armStickHeld = false;
    var armStickMax = 40;
    var viewMode = 'top'; // behind | first | top — el mundo abre siempre desde arriba
    var firstPerson = false; // derivado de viewMode === 'first'
    var fpLook = { yaw: 0, pitch: 0 };
    var fpPointerLocked = false;
    var viewSnap = false;
    var moveBasisYaw = null; /* unused: movimiento simple cada frame */
    var armAim = { x: 0, y: 0.15, live: false, wx: null, wy: null, wz: null };
    var armNet = null;
    var lastArmSentAt = 0;
    var lastArmPacked = null;
    var myProgress = null;
    var lastProgressSave = 0;
    var progressSaveTimer = 0;
    var progressLoaded = false;
    var lastMoveSent = 0;
    var lastCollectTry = 0;
    var lastHighfive = 0;
    var animId = 0;
    var lastTs = 0;
    var cam = { x: me.x, y: me.y };
    var decorCache = {};
    var cssW = 0;
    var cssH = 0;
    var myEmote = null;
    var myEmoteUntil = 0;
    var voiceOn = false;
    var voiceDestroyed = false;
    var localStream = null;
    var peerConnections = {};
    var remoteAudioEls = {};
    var voicePeers = {};
    var pcmProc = null, pcmSrc = null, pcmSink = null, pcmPlayAt = {};
    var speakingUntil = {};
    var pcmNodes = {};
    var pcmGains = {};
    var audioCtx = null;
    var localAnalyser = null;
    var remoteAnalysers = {};
    var mvSessionLive = false;
    var suppressPoseFromNet = false;
    var ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];

    function setStatus(t) { if (statusEl) statusEl.textContent = t; }

    function setScore(n) {
      myScore = n || 0;
      if (scoreEl) scoreEl.textContent = '🦴 ' + myScore + ' huesitos';
    }

    /* AVATAR_COINS_SHOP: per-profile coins wardrobe. Not the huesitos pickup score. */
    var AVATAR_CATALOG = {
      skin: [
        { id: 'claro', name: 'Claro', price: 0 },
        { id: 'melocoton', name: 'Melocotón', price: 15 },
        { id: 'bronce', name: 'Bronce', price: 15 },
        { id: 'marron', name: 'Marrón', price: 15 },
        { id: 'oscuro', name: 'Oscuro', price: 20 }
      ],
      hair: [
        { id: 'corto', name: 'Corto', price: 0 },
        { id: 'castano', name: 'Castaño', price: 20 },
        { id: 'rubio', name: 'Rubio', price: 25 },
        { id: 'rosa', name: 'Rosa', price: 40 },
        { id: 'azul', name: 'Azul', price: 40 },
        { id: 'rapado', name: 'Rapado', price: 10 }
      ],
      shirt: [
        { id: 'verde', name: 'Verde', price: 0 },
        { id: 'rojo', name: 'Rojo', price: 20 },
        { id: 'azul', name: 'Azul', price: 20 },
        { id: 'amarillo', name: 'Amarillo', price: 25 },
        { id: 'morado', name: 'Morado', price: 30 },
        { id: 'negro', name: 'Negro', price: 25 }
      ],
      hat: [
        { id: 'none', name: 'Ninguno', price: 0 },
        { id: 'gorra', name: 'Gorra', price: 30 },
        { id: 'sombrero', name: 'Sombrero', price: 45 },
        { id: 'corona', name: 'Corona', price: 80 }
      ]
    };
    var AVATAR_GROUPS = [
      { key: 'skin', title: 'Piel' },
      { key: 'hair', title: 'Pelo' },
      { key: 'shirt', title: 'Camiseta' },
      { key: 'hat', title: 'Gorro' }
    ];
    var SKIN_COLOR = { claro: 0xffe0bd, melocoton: 0xf1c27d, bronce: 0xc68642, marron: 0x8d5524, oscuro: 0x4a2912 };
    var HAIR_COLOR = { corto: 0x1a1a1a, castano: 0x6b3a1f, rubio: 0xf2d16b, rosa: 0xff5fa2, azul: 0x3b82f6 };
    var SHIRT_COLOR = { verde: 0x34d17a, rojo: 0xd64545, azul: 0x3b82f6, amarillo: 0xf5c542, morado: 0x8b5cf6, negro: 0x222222 };

    function normalizeLook(raw) {
      var out = { skin: 'claro', hair: 'corto', shirt: 'verde', hat: 'none' };
      if (!raw || typeof raw !== 'object') return out;
      AVATAR_GROUPS.forEach(function (g) {
        var id = raw[g.key];
        var opts = AVATAR_CATALOG[g.key];
        for (var i = 0; i < opts.length; i++) {
          if (opts[i].id === id) { out[g.key] = id; break; }
        }
      });
      return out;
    }

    function setCoins(n) {
      myCoins = Math.max(0, Number(n) || 0);
      var label = '🪙 ' + myCoins + ' coins';
      if (coinsEl) coinsEl.textContent = label;
      if (coinsSideEl) coinsSideEl.textContent = label;
    }

    function setAvatarMsg(t) {
      if (avatarMsgEl) avatarMsgEl.textContent = t || '';
    }

    function renderAvatarShop() {
      if (!avatarShopEl) return;
      var look = normalizeLook(myLook);
      myLook = look;
      var html = '';
      AVATAR_GROUPS.forEach(function (g) {
        html += '<div class="mv-av-label">' + g.title + '</div>';
        AVATAR_CATALOG[g.key].forEach(function (opt) {
          var on = look[g.key] === opt.id ? ' on' : '';
          var price = opt.price ? (opt.price + ' 🪙') : 'gratis';
          html += '<button type="button" class="mv-av-opt' + on + '" data-av-part="' + g.key + '" data-av-id="' + opt.id + '">' +
            opt.name + ' · ' + price + '</button>';
        });
      });
      avatarShopEl.innerHTML = html;
      avatarShopEl.querySelectorAll('[data-av-part]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          pickAvatarPart(btn.getAttribute('data-av-part'), btn.getAttribute('data-av-id'));
        });
      });
    }

    function pickAvatarPart(part, id) {
      if (avatarBusy) return;
      var cur = normalizeLook(myLook);
      if (!AVATAR_CATALOG[part] || cur[part] === id) return;
      var opt = null;
      AVATAR_CATALOG[part].forEach(function (o) { if (o.id === id) opt = o; });
      if (!opt) return;
      if (opt.price > myCoins) {
        setAvatarMsg('No tienes suficientes coins');
        return;
      }
      var next = normalizeLook(cur);
      next[part] = id;
      buyAvatarLook(next);
    }

    function buyAvatarLook(next) {
      avatarBusy = true;
      avatarRev += 1;
      var rev = avatarRev;
      setAvatarMsg('');
      fetch('/api/metaverse/avatar', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next)
      }).then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        }).catch(function () { return { ok: r.ok, data: {} }; });
      }).then(function (res) {
        if (rev !== avatarRev) return;
        avatarBusy = false;
        if (!res.ok) {
          var d = res.data && res.data.detail;
          if (d && typeof d === 'object') d = '';
          setAvatarMsg(typeof d === 'string' && d ? d : 'No tienes suficientes coins');
          return;
        }
        myLook = normalizeLook(res.data.look || next);
        if (typeof res.data.coins === 'number') setCoins(res.data.coins);
        if (res.data.spent > 0) toast('−' + res.data.spent + ' coins');
        else toast('Avatar guardado');
        setAvatarMsg('');
        renderAvatarShop();
        dropAvatarMesh(user.email);
        if (threeReady) ensureAvatarMeshes();
      }).catch(function () {
        if (rev !== avatarRev) return;
        avatarBusy = false;
        setAvatarMsg('No se pudo guardar el avatar');
      });
    }

    function loadAvatarWallet() {
      var rev = avatarRev;
      fetch('/api/metaverse/avatar', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || rev !== avatarRev) return;
          if (typeof data.coins === 'number') setCoins(data.coins);
          if (data.look) myLook = normalizeLook(data.look);
          renderAvatarShop();
          if (threeReady) ensureAvatarMeshes();
        })
        .catch(function () {});
    }

    function applyProgress(prog, opts) {
      opts = opts || {};
      if (!prog || typeof prog !== 'object') return;
      myProgress = prog;
      if (typeof prog.boneScore === 'number') setScore(prog.boneScore);
      else setScore(myScore);
      if (opts.applyPose !== false) {
        if (typeof prog.x === 'number') me.x = prog.x;
        if (typeof prog.y === 'number') me.y = prog.y;
        if (typeof prog.ry === 'number') me.ry = prog.ry;
      }
      // No reescribir mundo/sala en acks de guardado (evita teletransporte / mapa incorrecto al andar)
      if (opts.applyWorld !== false) {
        if (prog.world && WORLD_BY_ID[prog.world]) {
          currentWorld = prog.world;
        }
        if (prog.room) currentRoom = prog.room;
        else if (opts.clearRoom) currentRoom = null;
      }
      // Optional: restore mic preference (do not auto-start without gesture on some browsers)
      if (prog.prefs && prog.prefs.micOn && opts.restoreMic && !voiceOn) {
        try { toggleVoice(); } catch (eMic) {}
      }
      progressLoaded = true;
      renderWorlds();
      renderRooms();
      if (currentRoom) {
        var rr = EVENT_ROOMS.filter(function (r) { return r.id === currentRoom; })[0];
        if (rr) showRoomOverlay(rr);
      }
    }

    function buildProgressPayload() {
      return {
        world: currentWorld,
        room: currentRoom,
        x: +me.x.toFixed(2),
        y: +me.y.toFixed(2),
        ry: +me.ry.toFixed(3),
        boneScore: myScore,
        prefs: { micOn: !!voiceOn }
      };
    }

    function saveProgress(force) {
      var now = Date.now();
      if (!force && now - lastProgressSave < 8000) return;
      lastProgressSave = now;
      var payload = buildProgressPayload();
      if (ws && ws.readyState === 1) {
        try {
          ws.send(JSON.stringify(Object.assign({ type: 'save_progress', score: myScore }, payload)));
          return;
        } catch (e0) {}
      }
      try {
        fetch('/api/metaverse/progress', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (r) { return r.ok ? r.json() : null; }).then(function (prog) {
          if (prog) applyProgress(prog, { applyPose: false, applyWorld: false, restoreMic: false });
        }).catch(function () {});
      } catch (e1) {}
    }

    function scheduleProgressSave() {
      if (progressSaveTimer) clearTimeout(progressSaveTimer);
      progressSaveTimer = setTimeout(function () { saveProgress(false); }, 5000);
    }

    function loadWorldsCatalog() {
      return fetch('/api/metaverse/worlds', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          applyWorldsCatalog(data);
          renderRooms();
          refreshRoomOverlayIfNeeded();
          if (threeReady) {
            try { buildWorld3D(); } catch (eW) {}
          }
          return data;
        })
        .catch(function () { return null; });
    }

    function loadProgressThenConnect() {
      loadWorldsCatalog().then(function () {
        return fetch('/api/metaverse/progress', { credentials: 'include' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (prog) {
            // Pending room from notification wins over saved room; apply on WS welcome
            var pendingEarly = pendingMetaverseRoom;
            if (pendingEarly && pendingEarly.roomId) {
              if (prog) applyProgress(prog, { applyPose: false, restoreMic: false, clearRoom: true });
              else { currentRoom = null; }
            } else if (prog) {
              applyProgress(prog, { applyPose: true, restoreMic: false, clearRoom: false });
            }
            connectWs();
          })
          .catch(function () { connectWs(); });
      });
    }
    function toast(msg) {
      if (!toastEl) return;
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      clearTimeout(toast._t);
      toast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 1200);
    }
    function worldName(id) { return (WORLD_BY_ID[id] && WORLD_BY_ID[id].name) || id; }
    function roomsForWorld(wid) { return EVENT_ROOMS.filter(function (r) { return r.world === wid; }); }
    function getDecor(wid) {
      if (!decorCache[wid]) decorCache[wid] = worldDecor(wid);
      return decorCache[wid];
    }

    function appendMsg(msg) {
      if (!messagesEl || !msg) return;
      var isDm = !!msg.to;
      var relevant =
        (!chatPeer && !isDm) ||
        (chatPeer && isDm &&
          ((msg.from === user.email && msg.to === chatPeer) ||
            (msg.from === chatPeer && msg.to === user.email)));
      if (chatPeer && !relevant) return;
      if (!chatPeer && isDm) return;
      var div = document.createElement('div');
      div.className = 'mv-msg' + (msg.from === user.email ? ' me' : '');
      var who = msg.from === user.email ? 'Tú' : esc(msg.from_name || msg.from);
      if (msg.from !== user.email && msg.from_pro === true && !msg.bot && window.snkProBadge) who = window.snkProBadge.name({ pro: true }, who);
      var meta = who + (isDm ? ' · privado' : '') + ' · ' + formatTime(msg.created_at || msg.ts || Date.now() / 1000);
      div.innerHTML = '<div class="mv-msg-meta">' + meta + '</div><div class="mv-msg-text">' + esc(msg.text) + '</div>';
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    function clearMessages() { if (messagesEl) messagesEl.innerHTML = ''; }

    function renderWorlds() {
      if (!worldsEl) return;
      worldsEl.innerHTML = '';
      WORLDS.forEach(function (w) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mv-world-btn' + (currentWorld === w.id ? ' active' : '');
        btn.innerHTML = '<span>' + w.emoji + '</span><span>' + esc(w.name) + '</span>';
        try { if (typeof mvxWorldBtnHtml === 'function' && mvxWorlds) { btn.innerHTML = mvxWorldBtnHtml(w); btn.classList.add('mvx-wbtn'); } } catch (eMvxW) {}
        btn.addEventListener('click', function () { switchWorld(w.id); });
        worldsEl.appendChild(btn);
      });
      if (worldBarEl) worldBarEl.textContent = (WORLD_BY_ID[currentWorld] || {}).emoji + ' ' + worldName(currentWorld);
      if (worldLabelEl) worldLabelEl.textContent = worldName(currentWorld);
    }

    function renderRooms() {
      if (!roomsEl) return;
      roomsEl.innerHTML = '';
      roomsForWorld(currentWorld).forEach(function (r) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mv-room-btn' + (currentRoom === r.id ? ' active' : '');
        btn.innerHTML =
          '<span class="mv-room-btn-emoji">' + r.emoji + '</span>' +
          '<span class="mv-room-btn-text"><span class="mv-room-btn-name">' + esc(r.name) + '</span></span>';
        btn.title = r.name || '';
        btn.addEventListener('click', function () { enterRoom(r.id); });
        roomsEl.appendChild(btn);
      });
    }

    function showRoomOverlay(room) {
      if (!roomOverlay || !room) return;
      roomOverlay.classList.remove('hidden');
      if (roomTitleEl) roomTitleEl.textContent = (room.emoji || '') + ' ' + room.name;
      if (roomEventEl) {
        roomEventEl.className = 'mv-room-empty';
        roomEventEl.innerHTML = 'No hay eventos por ahora — ¡explora, chatea o juega!';
      }
    }

    function refreshRoomOverlayIfNeeded() {
      if (!currentRoom) {
        if (roomOverlay) roomOverlay.classList.add('hidden');
        return;
      }
      var rr = EVENT_ROOMS.filter(function (r) { return r.id === currentRoom; })[0];
      if (rr) showRoomOverlay(rr);
    }

    function enterRoom(roomId) {
      var room = EVENT_ROOMS.filter(function (r) { return r.id === roomId; })[0];
      if (!room) return;
      if (room.world !== currentWorld) {
        switchWorld(room.world, function () { doEnterRoom(room); });
      } else doEnterRoom(room);
    }

    function doEnterRoom(room) {
      currentRoom = room.id;
      me.x = room.x;
      me.y = room.y + 40;
      sendMove(true);
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'enter_room', room: room.id }));
      }
      closeAllPeers();
      if (voiceOn) setTimeout(syncVoiceMesh, 200);
      showRoomOverlay(room);
      renderRooms();
      toast('Entraste a ' + room.name);
    }

    function leaveRoom() {
      currentRoom = null;
      if (roomOverlay) roomOverlay.classList.add('hidden');
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'enter_room', room: null }));
      closeAllPeers();
      if (voiceOn) setTimeout(syncVoiceMesh, 200);
      sendMove(true);
      renderRooms();
    }
    if (roomLeaveBtn) roomLeaveBtn.addEventListener('click', leaveRoom);

    global.__mvEnterRoom = enterRoom;
    function tryPendingMetaverseRoom() {
      var pending = null;
      if (opts.room) {
        pending = { roomId: String(opts.room), world: opts.world || null };
        // one-shot: no re-entrar en cada reconnect
        opts.room = null;
      } else if (typeof takeMetaversePendingRoom === 'function') {
        pending = takeMetaversePendingRoom();
      } else if (pendingMetaverseRoom) {
        pending = takeMetaversePendingRoom();
      }
      if (pending && pending.roomId) {
        enterRoom(pending.roomId);
        return true;
      }
      return false;
    }


    function snapTopDownView() {
      /* Vista de arranque: desde arriba. Se reaplica al abrir, reconectar y cambiar de mundo. */
      viewMode = 'top';
      firstPerson = false;
      viewSnap = true;
      if (camera) {
        if (camera.userData) camera.userData.look = null;
        camera.up.set(0, 0, -1);
        camera.position.set(me.x, 280, me.y + 0.01);
        camera.lookAt(me.x, 0, me.y);
        if (Math.abs((camera.fov || 50) - 58) > 0.1) {
          camera.fov = 58;
          if (camera.updateProjectionMatrix) camera.updateProjectionMatrix();
        }
      }
      try { syncViewBtn(); } catch (eSnapBtn) {}
      try { syncFpHud(); } catch (eSnapHud) {}
    }

    function switchWorld(wid, after) {
      if (!WORLD_BY_ID[wid]) return;
      currentWorld = wid;
      currentRoom = null;
      if (roomOverlay) roomOverlay.classList.add('hidden');
      players = {};
      remotePos = {};
      bones = [];
      me.x = 400 + (Math.random() - 0.5) * 80;
      me.y = 400 + (Math.random() - 0.5) * 80;
      renderWorlds();
      renderRooms();
      renderOnline();
      if (threeReady) buildWorld3D();
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'set_world', world: wid, x: me.x, y: me.y, ry: me.ry })); saveProgress(true);
      }
      if (after) after();
      snapTopDownView();
    }

    function renderOnline() {
      if (!onlineEl) return;
      var list = Object.keys(players).map(function (k) { return players[k]; })
        .filter(function (p) { return p && p.email; })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      if (onlineCountEl) {
        var nOnline = String(list.length);
        if (onlineCountEl.textContent !== nOnline) {
          onlineCountEl.textContent = nOnline;
          onlineCountEl.classList.remove('bump');
          void onlineCountEl.offsetWidth;
          onlineCountEl.classList.add('bump');
        }
        onlineCountEl.title = list.length === 1 ? '1 jugador en este mundo' : list.length + ' jugadores en este mundo';
      }
      onlineEl.innerHTML = '';
      if (!list.length) {
        onlineEl.innerHTML = '<div class="mv-empty">Solo tú por ahora — ¡invita a alguien!</div>';
        return;
      }
      list.forEach(function (p) {
        var row = document.createElement('div');
        row.className = 'mv-user-row';
        var btn = document.createElement('button');
        btn.type = 'button';
        var peerMuted = !isMe(p.email) && isPeerMuted(p.email);
        btn.className = 'mv-user' + (p.email === user.email ? ' self' : '') + (chatPeer === p.email ? ' active' : '') + (peerMuted ? ' peer-muted' : '');
        var roomHint = '';
        if (p.room) {
          var rr = EVENT_ROOMS.filter(function (r) { return r.id === p.room; })[0];
          if (rr) roomHint = ' · ' + rr.emoji;
        }
        var vIcon = p.voice ? (speakingUntil[p.email] && speakingUntil[p.email] > performance.now() ? '🔴' : '🎤') : '';
        ensureHeadAvCss();
        btn.innerHTML = '<span class="mv-u-av">' + avatarListHtml(p.email === user.email ? myAvatar() : p.avatar) + '</span><span class="mv-u-name">' +
          esc(p.name) + (p.bot ? ' · IA' : '') + roomHint + '</span>' + (p.pro === true && !p.bot && p.email !== user.email && window.snkProBadge ? window.snkProBadge.html({ pro: true }) : '') + (p.email === user.email ? '<span class="mv-u-you">tú</span>' : '') + (vIcon ? '<span class="mv-u-voice">' + vIcon + '</span>' : '') + (peerMuted ? '<span class="mv-u-muted" title="Silenciado para ti">🔇</span>' : '');
        if (p.email !== user.email && !p.bot) {
          btn.addEventListener('click', function () { selectPeer(p.email, p.name); });
        }
        row.appendChild(btn);
        if (!isMe(p.email) && !p.bot) {
          var muteBtn = document.createElement('button');
          muteBtn.type = 'button';
          muteBtn.className = 'mv-mute-btn' + (peerMuted ? ' is-muted' : '');
          muteBtn.textContent = peerMuted ? 'Activar' : 'Silenciar';
          muteBtn.title = peerMuted ? 'Volver a oír a este jugador (solo tú)' : 'Dejar de oír a este jugador (solo tú)';
          muteBtn.setAttribute('aria-pressed', peerMuted ? 'true' : 'false');
          muteBtn.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            togglePeerMute(p.email);
          });
          row.appendChild(muteBtn);
        }
        onlineEl.appendChild(row);
      });
      setStatus('En línea · ' + Object.keys(players).length + ' en ' + worldName(currentWorld));
    }

    function selectPeer(email, name) {
      chatPeer = email;
      if (chatTargetEl) chatTargetEl.textContent = 'Con ' + (name || email);
      clearMessages();
      fetch('/api/metaverse/messages?with=' + encodeURIComponent(email), { credentials: 'include' })
        .then(function (r) { return r.json(); })
        .then(function (data) { (data.messages || data || []).forEach(appendMsg); })
        .catch(function () {});
    }

    function loadPublicHistory() {
      chatPeer = null;
      if (chatTargetEl) chatTargetEl.textContent = 'Chat público';
      clearMessages();
      fetch('/api/metaverse/messages?world=' + encodeURIComponent(currentWorld), { credentials: 'include' })
        .then(function (r) { return r.json(); })
        .then(function (data) { (data.messages || data || []).forEach(appendMsg); })
        .catch(function () {});
    }
    function selectPublic() { loadPublicHistory(); }
    if (publicBtn) publicBtn.addEventListener('click', selectPublic);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = (input.value || '').trim();
      if (!text || !ws || ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: 'chat', to: chatPeer, text: text, world: currentWorld }));
      input.value = '';
    });

    EMOTES.forEach(function (em) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mv-emote-btn';
      b.textContent = em;
      b.addEventListener('click', function () { sendEmote(em); });
      emotesEl.appendChild(b);
    });


    function broadcastFun(effect, payload) {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'fun', effect: effect, payload: payload || {} }));
      }
      applyFunEffect(effect, user.email, payload || {}, true);
    }

    function spawnFxBits(symbols, count) {
      if (!fxEl) return;
      for (var i = 0; i < count; i++) {
        (function (sym) {
          var el = document.createElement('div');
          el.className = 'mv-fx-bit';
          el.textContent = sym;
          el.style.left = (8 + Math.random() * 84) + '%';
          el.style.top = (55 + Math.random() * 35) + '%';
          el.style.fontSize = (1 + Math.random() * 1.2) + 'rem';
          fxEl.appendChild(el);
          setTimeout(function () { try { el.remove(); } catch (e0) {} }, 1500);
        })(symbols[i % symbols.length]);
      }
    }

    function applyFunEffect(effect, fromEmail, payload, isSelf) {
      var now = performance.now();
      if (effect === 'confetti') {
        spawnFxBits(['🎊', '🎉', '✨', '💛', '💚', '💜'], 18);
        spawnParticles(me.x, me.y, '#ff7ab6');
        spawnParticles(me.x + 20, me.y - 10, '#7ad7ff');
        toast(isSelf ? '🎊 ¡Confeti!' : '🎊 ' + ((payload && payload.name) || 'Alguien') + ' lanza confeti');
      } else if (effect === 'fireworks') {
        spawnFxBits(['🎆', '🎇', '💥', '✨'], 14);
        for (var fi = 0; fi < 5; fi++) {
          spawnParticles(me.x + (Math.random() - 0.5) * 160, me.y + (Math.random() - 0.5) * 160, '#ffd56a');
        }
        toast(isSelf ? '🎆 Fuegos artificiales' : '🎆 ¡Espectáculo en el cielo!');
      } else if (effect === 'disco') {
        funUntil.disco = now + 8000;
        if (fxEl) {
          fxEl.classList.add('disco');
          setTimeout(function () { try { fxEl.classList.remove('disco'); } catch (e1) {} }, 8000);
        }
        toast('🪩 Modo disco');
      } else if (effect === 'turbo') {
        if (fromEmail === user.email || isSelf) {
          funUntil.turbo = now + 7000;
          toast('⚡ Turbo activado');
        } else {
          toast('⚡ ' + ((payload && payload.name) || 'Alguien') + ' va a toda velocidad');
        }
      } else if (effect === 'jump') {
        if (fromEmail === user.email || isSelf) {
          funUntil.jump = now + 900;
          funData.jumpY = 28;
          toast('🦘 ¡Salto!');
        }
        spawnParticles(me.x, me.y, '#9dffc2');
      } else if (effect === 'dance') {
        if (fromEmail === user.email || isSelf) {
          funUntil.dance = now + 6000;
          toast('🕺 A bailar');
        } else {
          toast('💃 Alguien se puso a bailar');
        }
        spawnFxBits(['🕺', '💃', '🎵', '🎶'], 10);
      } else if (effect === 'balloons') {
        spawnFxBits(['🎈', '🎈', '💛', '💙', '❤️'], 16);
        toast('🎈 Globos por todas partes');
      } else if (effect === 'stars') {
        spawnFxBits(['⭐', '✨', '🌟', '💫'], 20);
        toast('⭐ Lluvia de estrellas');
      } else if (effect === 'quake') {
        if (fxEl) {
          fxEl.classList.remove('shake');
          void fxEl.offsetWidth;
          fxEl.classList.add('shake');
          setTimeout(function () { try { fxEl.classList.remove('shake'); } catch (e2) {} }, 500);
        }
        toast('🌋 ¡Temblor!');
      } else if (effect === 'magnet') {
        if (fromEmail === user.email || isSelf) {
          funUntil.magnet = now + 9000;
          toast('🧲 Imán de coins');
        }
      } else if (effect === 'rocket') {
        if (fromEmail === user.email || isSelf) {
          funUntil.rocket = now + 2500;
          funData.rocketBoost = 1;
          toast('🚀 ¡Despegue!');
        }
        spawnFxBits(['🚀', '🔥', '💨'], 12);
      } else if (effect === 'mystery') {
        var pool = ['confetti', 'fireworks', 'disco', 'turbo', 'jump', 'dance', 'balloons', 'stars', 'quake', 'magnet', 'rocket'];
        var pick = pool[Math.floor(Math.random() * pool.length)];
        toast('🎲 Sorpresa: ' + pick);
        applyFunEffect(pick, fromEmail, payload, isSelf);
      }
    }

    function triggerFun(effect) {
      if (!effect) return;
      if (effect === 'mystery') {
        broadcastFun('mystery', { name: user.name });
        return;
      }
      broadcastFun(effect, { name: user.name });
    }

    function ensureProFx(email) {
      if (!proFxUntil[email]) proFxUntil[email] = {};
      return proFxUntil[email];
    }

    function applyMandoPro(effect, fromEmail, meta) {
      if (!effect || !fromEmail) return;
      var now = performance.now();
      var bag = ensureProFx(fromEmail);
      var isSelf = fromEmail === user.email;
      var who = (meta && meta.name) || (isSelf ? 'Tú' : fromEmail);
      var label = (meta && meta.label) || effect;
      if (effect === 'glow') {
        bag.glow = now + 10000;
        spawnFxBits(['✨', '🌟', '💫'], 10);
        toast(isSelf ? '✨ Aura Pro' : '✨ ' + who + ' brilla');
      } else if (effect === 'trail') {
        bag.trail = now + 12000;
        toast(isSelf ? '🌟 Estela Pro' : '🌟 Estela de ' + who);
      } else if (effect === 'bighead') {
        bag.bighead = now + 9000;
        bag.tiny = 0;
        toast(isSelf ? '🗿 Cabezón' : '🗿 ' + who + ' modo cabezón');
      } else if (effect === 'tiny') {
        bag.tiny = now + 9000;
        bag.bighead = 0;
        toast(isSelf ? '🪲 Mini' : '🪲 ' + who + ' se encoge');
      } else if (effect === 'rainbow') {
        bag.rainbow = now + 10000;
        spawnFxBits(['🌈', '✨', '💛', '💚', '💜'], 12);
        toast(isSelf ? '🌈 Arcoíris' : '🌈 ' + who);
      } else if (effect === 'ghost') {
        bag.ghost = now + 9000;
        toast(isSelf ? '👻 Fantasma' : '👻 ' + who + ' se vuelve fantasma');
      } else if (effect === 'hearts') {
        spawnFxBits(['💖', '💕', '💗', '✨'], 16);
        spawnParticles(me.x, me.y, '#ff7ab6');
        toast(isSelf ? '💖 Corazones' : '💖 ' + who);
      } else if (effect === 'thunder') {
        if (fxEl) {
          fxEl.classList.add('mv-thunder');
          setTimeout(function () { try { fxEl.classList.remove('mv-thunder'); } catch (eT) {} }, 450);
        }
        spawnFxBits(['⚡', '💥', '✨'], 10);
        toast(isSelf ? '⚡ Rayo Pro' : '⚡ Rayo de ' + who);
      } else if (effect === 'spotlight') {
        bag.spotlight = now + 8000;
        toast(isSelf ? '🔦 Foco' : '🔦 Foco sobre ' + who);
      } else if (effect === 'pulse') {
        spawnFxBits(['📳', '〰️', '✨'], 8);
        if (isSelf) spawnParticles(me.x, me.y, '#7ad7ff');
        toast(isSelf ? '📳 Pulso' : '📳 Pulso de ' + who);
      } else if (effect === 'smoke') {
        spawnFxBits(['💨', '☁️', '🌫️'], 14);
        toast(isSelf ? '💨 Humo' : '💨 ' + who);
      } else if (effect === 'crown') {
        bag.crown = now + 10000;
        floaters[fromEmail] = { emoji: '👑', until: now + 10000 };
        toast(isSelf ? '👑 Corona' : '👑 ' + who);
      } else {
        toast('Pro: ' + label);
      }
    }

    function applyProFxToMesh(mesh, email, nowP) {
      if (!mesh) return;
      var bag = proFxUntil[email] || {};
      mesh.scale.setScalar(bag.tiny > nowP ? 0.55 : 1);
      if (mesh.userData.headPivot) {
        mesh.userData.headPivot.scale.setScalar(bag.bighead > nowP ? 1.85 : 1);
      }
      var ghostOn = bag.ghost > nowP;
      var glowOn = bag.glow > nowP;
      var rainbowOn = bag.rainbow > nowP;
      mesh.traverse(function (ch) {
        if (!ch || !ch.isMesh || !ch.material) return;
        var mats = Array.isArray(ch.material) ? ch.material : [ch.material];
        mats.forEach(function (mat) {
          if (!mat) return;
          mat.userData = mat.userData || {};
          if (ghostOn) {
            if (!mat.userData._proGhosted) {
              mat.userData._proGhosted = true;
              mat.userData._proPrevOpacity = mat.opacity;
              mat.userData._proPrevTransparent = !!mat.transparent;
            }
            mat.transparent = true;
            mat.opacity = 0.38;
          } else if (mat.userData._proGhosted) {
            mat.opacity = mat.userData._proPrevOpacity != null ? mat.userData._proPrevOpacity : 1;
            mat.transparent = !!mat.userData._proPrevTransparent;
            mat.userData._proGhosted = false;
          }
          if (rainbowOn && mat.color && mat.color.setHSL) {
            mat.color.setHSL(((nowP / 400) + (email.length * 0.07)) % 1, 0.75, 0.55);
          }
          if (mat.emissive && mat.emissive.setHex) {
            if (glowOn) {
              mat.emissive.setHex(0x34d17a);
              if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0.55 + Math.sin(nowP / 180) * 0.2;
              mat.userData._proGlow = true;
            } else if (mat.userData._proGlow) {
              mat.emissive.setHex(0x000000);
              if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0;
              mat.userData._proGlow = false;
            }
          }
        });
      });
      if (bag.spotlight > nowP && mesh.userData.ring) {
        mesh.userData.ring.material.opacity = 0.85;
        var pulse = 1.2 + Math.sin(nowP / 140) * 0.15;
        mesh.userData.ring.scale.set(pulse, pulse, 1);
      }
      if (bag.trail > nowP && email === user.email && Math.random() < 0.25) {
        spawnParticles(me.x + (Math.random() - 0.5) * 10, me.y + (Math.random() - 0.5) * 10, '#9dffc2');
      }
      if (bag.crown > nowP) setEmoteOnMesh(email, '👑');
    }

    function renderMandoPairData(data) {
      var hereHost = location.host || (location.hostname + (location.port ? ':' + location.port : ''));
      var hereBase = location.protocol + '//' + hereHost;
      if (!data || !data.code) {
        if (mandoIpEl) {
          mandoIpEl.innerHTML =
            '<div class="mv-mando-ip-label">Tu IP / host</div>' +
            '<div class="mv-mando-ip-big">' + esc(hereHost) + '</div>' +
            '<div class="mv-mando-url">' + esc(hereBase + '/mando-pro') + '</div>' +
            '<div class="mv-mando-wait">No se pudo crear el código</div>';
        }
        return;
      }
      mandoPairCode = data.code;
      var localUrl = hereBase + '/mando-pro?code=' + encodeURIComponent(data.code);
      var urls = Array.isArray(data.urls) ? data.urls.slice() : [];
      if (urls.indexOf(localUrl) < 0) urls.unshift(localUrl);
      var lanIps = Array.isArray(data.lanIps) ? data.lanIps : [];
      var lanPort = data.lanPort || 8987;
      lanIps.forEach(function (ip) {
        var u = 'http://' + ip + ':' + lanPort + '/mando-pro?code=' + encodeURIComponent(data.code);
        if (urls.indexOf(u) < 0) urls.push(u);
      });
      var primaryIp = data.primaryIp || lanIps[0] || location.hostname;
      var primaryDisp = primaryIp;
      if (primaryIp && String(primaryIp).indexOf(':') < 0 && !/^[a-z]/i.test(String(primaryIp))) {
        primaryDisp = primaryIp + ':' + lanPort;
      } else if (!lanIps.length) {
        primaryDisp = hereHost;
      }
      mandoPairUrl = '';
      for (var i = 0; i < urls.length; i++) {
        if (urls[i].indexOf('http://') === 0 && /\d+\.\d+\.\d+\.\d+/.test(urls[i])) {
          mandoPairUrl = urls[i];
          break;
        }
      }
      if (!mandoPairUrl) mandoPairUrl = localUrl;
      if (mandoCodeEl) mandoCodeEl.textContent = data.code;
      if (mandoIpEl) {
        var html = '';
        html += '<div class="mv-mando-ip-label">IP del servidor</div>';
        html += '<div class="mv-mando-ip-big">' + esc(primaryDisp) + '</div>';
        html += '<div class="mv-mando-ip-label">Enlaces Mando Pro</div>';
        html += urls.map(function (u) {
          return '<div class="mv-mando-url">' + esc(u) + '</div>';
        }).join('');
        mandoIpEl.innerHTML = html;
      }
    }

    function openMandoProPanel(forceNew) {
      if (mvIsPhoneMode()) return;
      if (mandoOverlay) mandoOverlay.classList.remove('hidden');
      var hereHost = location.host || (location.hostname + (location.port ? ':' + location.port : ''));
      var hereBase = location.protocol + '//' + hereHost;
      if (mandoIpEl) {
        mandoIpEl.innerHTML =
          '<div class="mv-mando-ip-label">Abre en el móvil</div>' +
          '<div class="mv-mando-ip-big">' + esc(hereHost) + '</div>' +
          '<div class="mv-mando-url">' + esc(hereBase + '/mando-pro') + '</div>' +
          '<div class="mv-mando-wait">Generando código…</div>';
      }
      if (mandoCodeEl) mandoCodeEl.textContent = '······';

      var done = false;
      function fail(msg) {
        if (done) return;
        done = true;
        if (mandoIpEl) {
          mandoIpEl.innerHTML =
            '<div class="mv-mando-ip-label">Tu IP / host</div>' +
            '<div class="mv-mando-ip-big">' + esc(hereHost) + '</div>' +
            '<div class="mv-mando-url">' + esc(hereBase + '/mando-pro') + '</div>' +
            '<div class="mv-mando-wait">' + esc(msg || 'Error al generar el código') + '</div>';
        }
      }
      function ok(data) {
        if (done) return;
        done = true;
        renderMandoPairData(data);
      }

      // Preferred: Metaverse WebSocket (already authenticated) — avoids HTTP 401.
      if (ws && ws.readyState === 1) {
        try {
          ws.send(JSON.stringify({ type: 'mando_pair', force: !!forceNew }));
          // Response handled in onmessage → mando_pair_ok / mando_pair_err
          // Keep a timeout fallback to HTTP
          setTimeout(function () {
            if (done) return;
            tryHttpPair();
          }, 2500);
          window.__mvMandoPairOk = function (data) { ok(data); };
          window.__mvMandoPairErr = function (detail) {
            if (done) return;
            tryHttpPair(detail);
          };
          return;
        } catch (eWs) {}
      }
      tryHttpPair();

      function tryHttpPair(prevErr) {
        fetch('/api/metaverse/mando-pro/pair', { method: 'POST', credentials: 'include' })
          .then(function (r) {
            if (!r.ok) throw new Error((prevErr ? prevErr + ' · ' : '') + 'HTTP ' + r.status);
            return r.json();
          })
          .then(function (data) { ok(data); })
          .catch(function (err) {
            fail((err && err.message) || prevErr || 'Error de red');
          });
      }
    }

    function closeMandoProPanel() {
      if (mandoOverlay) mandoOverlay.classList.add('hidden');
    }

    if (mandoProBtn) {
      mandoProBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        openMandoProPanel(false);
      });
    }
    if (mandoCloseBtn) mandoCloseBtn.addEventListener('click', closeMandoProPanel);
    if (mandoOverlay) {
      mandoOverlay.addEventListener('click', function (ev) {
        if (ev.target === mandoOverlay) closeMandoProPanel();
      });
    }
    if (mandoRefreshBtn) {
      mandoRefreshBtn.addEventListener('click', function () { openMandoProPanel(true); });
    }
    if (mandoCopyBtn) {
      mandoCopyBtn.addEventListener('click', function () {
        var text = mandoPairUrl || '';
        if (!text) return;
        function ok() { toast('Enlace copiado'); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(ok).catch(function () {
            try { window.prompt('Copia el enlace:', text); } catch (eC) {}
          });
        } else {
          try { window.prompt('Copia el enlace:', text); } catch (eC2) {}
        }
      });
    }

    if (funToggle && funGrid) {
      funToggle.addEventListener('click', function () {
        funGrid.classList.toggle('open');
      });
      funGrid.querySelectorAll('[data-fun]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          triggerFun(btn.getAttribute('data-fun'));
        });
      });
    }

    function sendEmote(emoji) {
      myEmote = emoji;
      myEmoteUntil = performance.now() + 2500;
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'emote', emoji: emoji }));
    }

    function botEdges() {
      var lim = (WORLD_BY_ID[currentWorld] || WORLDS[0]).size || 800;
      return { lo: 24, hi: Math.max(24, lim - 24) };
    }

    function pullBotCoord(v) {
      var edge = botEdges();
      var n = +v;
      if (!(n > -1e9 && n < 1e9)) n = edge.lo;
      if (n < edge.lo) return edge.lo;
      if (n > edge.hi) return edge.hi;
      return n;
    }

    function upsertPlayer(p) {
      if (!p || !p.email) return;
      if (p.email === user.email) {
        /* Never snap local avatar from network — causes random teleports while walking. */
        return;
      }
      var existed = !!players[p.email];
      var before = existed ? players[p.email] : null;
      players[p.email] = Object.assign({}, players[p.email] || {}, p);
      var isBot = !!(p.bot || players[p.email].bot || String(p.email).indexOf("ai-bot:") === 0);
      if (isBot && typeof p.dance === "boolean") noteMapParty(p.dance);
      var prev = remotePos[p.email];
      var bx = isBot ? pullBotCoord(p.x) : p.x;
      var by = isBot ? pullBotCoord(p.y) : p.y;
      if (!prev) {
        remotePos[p.email] = {
          x: bx, y: by, ry: p.ry || 0, tx: bx, ty: by, try: p.ry || 0,
          vx: typeof p.vx === "number" ? p.vx : 0,
          vy: typeof p.vy === "number" ? p.vy : 0,
          cvx: typeof p.vx === "number" ? p.vx : 0,
          cvy: typeof p.vy === "number" ? p.vy : 0,
          at: performance.now(),
          bot: isBot
        };
      } else {
        prev.tx = isBot ? pullBotCoord(p.x) : p.x;
        prev.ty = isBot ? pullBotCoord(p.y) : p.y;
        prev.try = p.ry || 0;
        if (isBot) {
          prev.bot = true;
          if (prev.x < 24 || prev.y < 24 || prev.x > 776 || prev.y > 776) {
            prev.x = pullBotCoord(prev.x);
            prev.y = pullBotCoord(prev.y);
          }
          var nvx = typeof p.vx === "number" ? p.vx : (prev.vx || 0);
          var nvy = typeof p.vy === "number" ? p.vy : (prev.vy || 0);
          /* A quieto / zero sample must not cancel the glide between decisions. */
          if (Math.hypot(nvx, nvy) < 1 && Math.hypot(prev.cvx || prev.vx || 0, prev.cvy || prev.vy || 0) >= 1) {
            nvx = prev.cvx || prev.vx || 0;
            nvy = prev.cvy || prev.vy || 0;
          }
          prev.vx = nvx;
          prev.vy = nvy;
          if (Math.hypot(nvx, nvy) >= 1) { prev.cvx = nvx; prev.cvy = nvy; }
          prev.at = performance.now();
          if (mvxState && mvxState.gest) {
            if (p.dance) mvxState.gest[p.email] = { g: 'dance', until: performance.now() + 1600 };
            else if (mvxState.gest[p.email] && mvxState.gest[p.email].g === 'dance') delete mvxState.gest[p.email];
          }
        }
      }
      if (p.arm && typeof p.arm === 'object' && remotePos[p.email]) {
        var armPose = {
          x: Math.max(-6, Math.min(6, +p.arm.x || 0)),
          y: Math.max(-6, Math.min(6, +p.arm.y || 0)),
          z: Math.max(-6, Math.min(6, +p.arm.z || 0)),
          s: 1
        };
        if (p.arm.tx != null && p.arm.ty != null && p.arm.tz != null) {
          armPose.tx = +p.arm.tx;
          armPose.ty = +p.arm.ty;
          armPose.tz = +p.arm.tz;
        }
        remotePos[p.email].arm = armPose;
        var armMesh = avatarMeshes[p.email];
        if (armMesh && armMesh.userData.armR) {
          applyRemoteArm(armMesh.userData.armR, armPose);
        }
      }
      if (p.room) {
        var rr = EVENT_ROOMS.filter(function (r) { return r.id === p.room; })[0];
      }
      var listChanged = !before
        || before.name !== players[p.email].name
        || before.avatar !== players[p.email].avatar
        || before.voice !== players[p.email].voice
        || before.room !== players[p.email].room
        || !!before.bot !== !!players[p.email].bot;
      if (listChanged) renderOnline();
    }

    function removePlayer(email) {
      delete players[email];
      delete remotePos[email];
      if (avatarMeshes[email]) {
        try { if (scene) scene.remove(avatarMeshes[email]); disposeObject3D(avatarMeshes[email]); } catch (eR) {}
        delete avatarMeshes[email];
      }
      removeNameLabel(email);
      delete emoteApplied[email];
      delete floaters[email];
      renderOnline();
      if (chatPeer === email) selectPublic();
    }

    function spawnParticles(x, y, color) {
      var hex = 0xffd56a;
      if (typeof color === 'string' && color.charAt(0) === '#') hex = parseHexColor(color, 0xffd56a);
      else if (typeof color === 'string') hex = hslToHex(color);
      for (var i = 0; i < 14; i++) {
        particles.push({
          x: x, y: y,
          vx: (Math.random() - 0.5) * 120,
          vy: (Math.random() - 0.5) * 120 - 40,
          life: 0.6 + Math.random() * 0.4,
          color: color || '#ffb84d',
          hex: hex
        });
      }
    }


    function voiceEligible(p) {
      if (!p || p.email === user.email) return false;
      if (p.bot || String(p.email || '').indexOf('ai-bot:') === 0) return false;
      if ((p.world || currentWorld) !== currentWorld) return false;
      return (p.room || null) === (currentRoom || null);
    }

    function setVoiceStatus(t) {
      if (voiceStatusEl) voiceStatusEl.textContent = t;
    }

    function updateMicBtn() {
      if (!micBtn) return;
      micBtn.classList.toggle('on', voiceOn);
      micBtn.textContent = voiceOn ? '🎤 Mic ON' : '🎤 Voz';
      setVoiceStatus(voiceOn ? 'Voz activa' : 'Micrófono apagado');
    }

    function rtcLive(email) {
      var pc = peerByEmail(peerConnections, email);
      if (!pc) return false;
      return pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed';
    }

    /* WebRTC only counts as "already hearing" when the element is actually unmuted.
       A connected PC with volume 0 / muted must not keep PCM dropped after Activar. */
    function webrtcHears(email) {
      if (voiceDestroyed || closed) return false;
      if (!rtcLive(email)) return false;
      var a = peerByEmail(remoteAudioEls, email);
      if (!a || !a.srcObject) return false;
      if (a.muted) return false;
      if (typeof a.volume === 'number' && a.volume <= 0) return false;
      if (a.paused) return false;
      try {
        var tracks = a.srcObject.getAudioTracks ? a.srcObject.getAudioTracks() : [];
        var i;
        var anyOn = false;
        for (i = 0; i < tracks.length; i++) {
          if (tracks[i] && tracks[i].enabled !== false && tracks[i].readyState === 'live') anyOn = true;
        }
        if (tracks.length && !anyOn) return false;
      } catch (eTr) {}
      return true;
    }

    function b64FromBytes(bytes) {
      var out = '';
      var chunk = 0x8000;
      for (var i = 0; i < bytes.length; i += chunk) {
        out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(out);
    }

    function bytesFromB64(b64) {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 255;
      return bytes;
    }

    function stopPcmRelay() {
      try { if (pcmProc) pcmProc.onaudioprocess = null; } catch (e0) {}
      try { if (pcmProc) pcmProc.disconnect(); } catch (e1) {}
      try { if (pcmSrc) pcmSrc.disconnect(); } catch (e2) {}
      try { if (pcmSink) pcmSink.disconnect(); } catch (e3) {}
      pcmProc = null; pcmSrc = null; pcmSink = null;
    }

    var micRecovering = false;
    var micWatchTimer = null;

    function micTrackLive() {
      if (!localStream || !localStream.getAudioTracks) return false;
      var tracks = localStream.getAudioTracks();
      for (var i = 0; i < tracks.length; i++) {
        if (tracks[i] && tracks[i].readyState === 'live') return true;
      }
      return false;
    }

    function bindAudioCtx() {
      if (!audioCtx || audioCtx._mvBound) return;
      audioCtx._mvBound = true;
      audioCtx.onstatechange = function () {
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
          audioCtx.resume().catch(function () {});
          if (voiceOn && !pcmProc) startPcmRelay();
        }
      };
    }

    function ensureAudioCtx() {
      try {
        if (!audioCtx || audioCtx.state === 'closed') {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          stopPcmRelay();
        }
        bindAudioCtx();
        if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') audioCtx.resume();
      } catch (eCtx) {}
      return audioCtx;
    }

    function bindMicTrack(stream) {
      if (!stream || !stream.getAudioTracks) return;
      stream.getAudioTracks().forEach(function (t) {
        t.onended = function () {
          if (voiceOn) ensureMicAlive('track-ended');
        };
      });
    }

    function startMicWatch() {
      if (micWatchTimer) return;
      micWatchTimer = setInterval(function () {
        if (!voiceOn) return;
        var ctxBad = !audioCtx || audioCtx.state === 'suspended' || audioCtx.state === 'interrupted' || audioCtx.state === 'closed';
        if (!micTrackLive() || ctxBad || !pcmProc) ensureMicAlive('watch');
      }, 4000);
    }

    async function ensureMicAlive(reason) {
      if (voiceDestroyed || closed || !voiceOn || micRecovering) return;
      micRecovering = true;
      try {
        ensureAudioCtx();
        var replaced = false;
        if (!micTrackLive()) {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
          var fresh = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          });
          if (voiceDestroyed || closed || !voiceOn) {
            fresh.getTracks().forEach(function (t) { try { t.stop(); } catch (eKill) {} });
            return;
          }
          var old = localStream;
          localStream = fresh;
          bindMicTrack(fresh);
          var nt = fresh.getAudioTracks()[0];
          Object.keys(peerConnections).forEach(function (em) {
            var pc = peerConnections[em];
            if (!pc || !nt) return;
            var sender = null;
            try {
              var senders = pc.getSenders ? pc.getSenders() : [];
              for (var si = 0; si < senders.length; si++) {
                if (senders[si] && senders[si].track && senders[si].track.kind === 'audio') { sender = senders[si]; break; }
              }
            } catch (eS) {}
            if (sender && sender.replaceTrack) sender.replaceTrack(nt).catch(function () {});
            else { try { pc.addTrack(nt, fresh); } catch (eAdd) {} }
          });
          if (old && old !== fresh) {
            old.getTracks().forEach(function (t) { try { t.onended = null; t.stop(); } catch (eStop) {} });
          }
          setupAnalyser(localStream, true, null);
          replaced = true;
        }
        if (audioCtx && (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted')) {
          try { await audioCtx.resume(); } catch (eR) {}
        }
        if (replaced || !pcmProc) startPcmRelay();
        if ((replaced || reason === 'reconnect') && ws && ws.readyState === 1) {
          try { ws.send(JSON.stringify({ type: 'voice_state', on: true })); } catch (eV) {}
        }
      } catch (e) {
        console.warn('mic recover', reason, e);
      } finally {
        micRecovering = false;
      }
    }

    function startPcmRelay() {
      stopPcmRelay();
      if (voiceDestroyed || closed) return;
      if (!localStream || !micTrackLive()) return;
      try {
        ensureAudioCtx();
        if (!audioCtx) return;
        pcmSrc = audioCtx.createMediaStreamSource(localStream);
        pcmProc = audioCtx.createScriptProcessor(2048, 1, 1);
        pcmSink = audioCtx.createGain();
        pcmSink.gain.value = 0;
        pcmSrc.connect(pcmProc);
        pcmProc.connect(pcmSink);
        pcmSink.connect(audioCtx.destination);
        pcmProc.onaudioprocess = function (ev) {
          if (!voiceOn || !ws || ws.readyState !== 1) return;
          var input = ev.inputBuffer.getChannelData(0);
          var rateIn = audioCtx.sampleRate || 48000;
          var step = rateIn / 16000;
          var n = Math.floor(input.length / step);
          if (n < 16) return;
          var bytes = new Uint8Array(n * 2);
          for (var i = 0; i < n; i++) {
            var s = input[Math.floor(i * step)] || 0;
            if (s > 1) s = 1; else if (s < -1) s = -1;
            var v = (s < 0 ? s * 0x8000 : s * 0x7fff) | 0;
            bytes[i * 2] = v & 255;
            bytes[i * 2 + 1] = (v >> 8) & 255;
          }
          try {
            ws.send(JSON.stringify({ type: 'voice_pcm', rate: 16000, pcm: b64FromBytes(bytes) }));
          } catch (eSend) {}
        };
      } catch (e) {
        console.warn('voice relay', e);
      }
    }

    function emailKey(e) {
      return String(e || '').trim().toLowerCase();
    }
    function isMe(e) {
      return emailKey(e) === emailKey(user.email);
    }

    function peerByEmail(map, email) {
      if (!map) return null;
      if (email && Object.prototype.hasOwnProperty.call(map, email)) return map[email];
      var k = emailKey(email);
      if (!k) return null;
      var keys = Object.keys(map);
      for (var i = 0; i < keys.length; i++) {
        if (emailKey(keys[i]) === k) return map[keys[i]];
      }
      return null;
    }

    function isPeerMuted(email) {
      return mutedPeers.has(emailKey(email));
    }

    function ensurePcmGain(email) {
      var k = emailKey(email);
      if (!k || !audioCtx) return null;
      var g = pcmGains[k];
      if (!g || g.context !== audioCtx) {
        try { if (g) g.disconnect(); } catch (eOld) {}
        g = audioCtx.createGain();
        g.connect(audioCtx.destination);
        pcmGains[k] = g;
      }
      return g;
    }

    function dropPcm(email) {
      var k = emailKey(email);
      Object.keys(pcmPlayAt).forEach(function (ek) {
        if (emailKey(ek) === k) delete pcmPlayAt[ek];
      });
      Object.keys(pcmNodes).forEach(function (ek) {
        if (emailKey(ek) !== k) return;
        (pcmNodes[ek] || []).forEach(function (src) {
          try { src.stop(0); } catch (eStop) {}
          try { src.disconnect(); } catch (eDisc) {}
        });
        delete pcmNodes[ek];
      });
    }

    function setStreamTracksEnabled(stream, on) {
      if (!stream || !stream.getAudioTracks) return;
      stream.getAudioTracks().forEach(function (t) {
        try { t.enabled = !!on; } catch (eEn) {}
      });
    }

    function applyRemoteAudible(email) {
      var muted = isPeerMuted(email);
      var k = emailKey(email);
      if (!muted) {
        /* Activar is a user gesture: resume PCM context here or iOS stays silent. */
        try { ensureAudioCtx(); } catch (eCtx) {}
        try {
          if (audioCtx && audioCtx.state !== 'closed' && (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted')) {
            audioCtx.resume();
          }
        } catch (eRes) {}
      }
      Object.keys(remoteAudioEls).forEach(function (ek) {
        if (emailKey(ek) !== k) return;
        var a = remoteAudioEls[ek];
        if (!a) return;
        var stream = null;
        try { stream = a.srcObject; } catch (eSo) { stream = null; }
        setStreamTracksEnabled(stream, !muted);
        if (muted) {
          /* Never write volume=0: Chrome latches MediaStream element volume at 0. */
          a.muted = true;
          try { a.pause(); } catch (eP) {}
          return;
        }
        a.muted = false;
        try { a.volume = 1; } catch (eVol2) {}
        try {
          var pr = a.play();
          if (pr && typeof pr.catch === 'function') pr.catch(function () {});
        } catch (ePlay) {}
      });
      if (muted) {
        if (pcmGains[k]) { try { pcmGains[k].gain.value = 0; } catch (eG0) {} }
        dropPcm(email);
      } else {
        var g1 = ensurePcmGain(email);
        if (g1) { try { g1.gain.value = 1; } catch (eG1) {} }
        Object.keys(pcmPlayAt).forEach(function (ek) {
          if (emailKey(ek) === k) delete pcmPlayAt[ek];
        });
      }
    }

    function togglePeerMute(email) {
      var k = emailKey(email);
      if (!k || isMe(email)) return;
      if (mutedPeers.has(k)) {
        mutedPeers.delete(k);
        /* Drop the latched <audio> and renegotiate. PCM plays until WebRTC is fresh. */
        var hadPc = !!peerByEmail(peerConnections, email);
        if (hadPc) closePeer(email);
        try { ensureAudioCtx(); } catch (eCtx2) {}
        try {
          if (audioCtx && audioCtx.state !== 'closed' && (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted')) {
            audioCtx.resume();
          }
        } catch (eRes2) {}
        var gUn = ensurePcmGain(email);
        if (gUn) { try { gUn.gain.value = 1; } catch (eGu) {} }
        Object.keys(pcmPlayAt).forEach(function (ek) {
          if (emailKey(ek) === k) delete pcmPlayAt[ek];
        });
        renderOnline();
        if (hadPc && voiceOn && !voiceDestroyed) {
          setTimeout(function () {
            if (!closed && !voiceDestroyed && voiceOn && !isPeerMuted(email)) syncVoiceMesh();
          }, 350);
        }
        return;
      }
      mutedPeers.add(k);
      applyRemoteAudible(email);
      renderOnline();
    }

    function playPcm(email, b64, rate) {
      if (voiceDestroyed || closed) return;
      if (!b64 || isPeerMuted(email) || webrtcHears(email)) return;
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        var bytes = bytesFromB64(b64);
        var n = Math.floor(bytes.length / 2);
        if (n < 8) return;
        var f32 = new Float32Array(n);
        for (var i = 0; i < n; i++) {
          var v = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
          if (v & 0x8000) v = v - 0x10000;
          f32[i] = v / 0x8000;
        }
        var sr = rate || 16000;
        var buf = audioCtx.createBuffer(1, n, sr);
        buf.copyToChannel(f32, 0);
        var src = audioCtx.createBufferSource();
        src.buffer = buf;
        var gain = ensurePcmGain(email);
        if (!gain) return;
        gain.gain.value = isPeerMuted(email) ? 0 : 1;
        if (gain.gain.value === 0) return;
        src.connect(gain);
        var slot = emailKey(email);
        pcmNodes[slot] = pcmNodes[slot] || [];
        pcmNodes[slot].push(src);
        src.onended = function () {
          var arr = pcmNodes[slot];
          if (!arr) return;
          var ix = arr.indexOf(src);
          if (ix >= 0) arr.splice(ix, 1);
        };
        var now = audioCtx.currentTime + 0.02;
        var when = Math.max(now, pcmPlayAt[slot] || 0);
        if (when - now > 0.35) when = now;
        src.start(when);
        pcmPlayAt[slot] = when + buf.duration;
        if (!voiceOn) setVoiceStatus('Escuchando · micrófono apagado');
        else setVoiceStatus('Voz conectada');
      } catch (e) {}
    }

    function sdpPlain(desc) {
      if (!desc) return null;
      return { type: desc.type, sdp: desc.sdp };
    }

    function icePlain(cand) {
      if (!cand) return null;
      if (typeof cand.toJSON === 'function') return cand.toJSON();
      return { candidate: cand.candidate, sdpMid: cand.sdpMid, sdpMLineIndex: cand.sdpMLineIndex };
    }

    function queueIce(pc, cand) {
      if (!cand) return;
      if (pc.remoteDescription && pc.remoteDescription.type) {
        pc.addIceCandidate(cand).catch(function () {});
      } else {
        pc._pendingIce = pc._pendingIce || [];
        pc._pendingIce.push(cand);
      }
    }

    function flushIce(pc) {
      var list = pc._pendingIce || [];
      pc._pendingIce = [];
      list.forEach(function (cand) {
        pc.addIceCandidate(cand).catch(function () {});
      });
    }

    function ensureAudioEl(email) {
      if (remoteAudioEls[email]) return remoteAudioEls[email];
      var a = document.createElement('audio');
      a.autoplay = true;
      a.playsInline = true;
      a.setAttribute('playsinline', '');
      a.setAttribute('data-voice-peer', email);
      a.volume = 1;
      a.muted = isPeerMuted(email);
      a.style.display = 'none';
      container.appendChild(a);
      remoteAudioEls[email] = a;
      return a;
    }

    function closePeer(email) {
      try {
        if (peerConnections[email]) {
          peerConnections[email].onicecandidate = null;
          peerConnections[email].ontrack = null;
          peerConnections[email].close();
        }
      } catch (e) {}
      delete peerConnections[email];
      delete remoteAnalysers[email];
      dropPcm(email);
      if (remoteAudioEls[email]) {
        try { remoteAudioEls[email].srcObject = null; remoteAudioEls[email].remove(); } catch (e2) {}
        delete remoteAudioEls[email];
      }
    }

    function closeAllPeers() {
      Object.keys(peerConnections).forEach(closePeer);
    }

    async function stopVoice() {
      voiceOn = false;
      updateMicBtn();
      stopPcmRelay();
      closeAllPeers();
      if (localStream) {
        localStream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        localStream = null;
      }
      localAnalyser = null;
      if (ws && ws.readyState === 1) {
        try { ws.send(JSON.stringify({ type: 'voice_state', on: false })); } catch (eOff) {}
      }
    }

    /* App close: kill every voice path. Mic-off still receives PCM, so stopVoice is not enough. */
    function destroyVoiceEngine() {
      voiceDestroyed = true;
      voiceOn = false;
      if (micWatchTimer) {
        clearInterval(micWatchTimer);
        micWatchTimer = null;
      }
      try { updateMicBtn(); } catch (eBtn) {}
      try { stopPcmRelay(); } catch (eRel) {}
      Object.keys(pcmNodes).forEach(function (ek) {
        (pcmNodes[ek] || []).forEach(function (src) {
          try { src.onended = null; src.stop(0); } catch (eStop) {}
          try { src.disconnect(); } catch (eDisc) {}
        });
      });
      pcmNodes = {};
      pcmPlayAt = {};
      Object.keys(pcmGains).forEach(function (k) {
        try { pcmGains[k].gain.value = 0; pcmGains[k].disconnect(); } catch (eG) {}
      });
      pcmGains = {};
      Object.keys(peerConnections).forEach(function (em) {
        try {
          var pc = peerConnections[em];
          if (!pc) return;
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.onconnectionstatechange = null;
          pc.close();
        } catch (ePc) {}
      });
      peerConnections = {};
      remoteAnalysers = {};
      function killAudio(a) {
        if (!a) return;
        try { a.pause(); } catch (ePa) {}
        try {
          if (a.srcObject && a.srcObject.getTracks) {
            a.srcObject.getTracks().forEach(function (t) { try { t.stop(); } catch (eTr) {} });
          }
        } catch (eSo) {}
        try { a.srcObject = null; a.remove(); } catch (eRm) {}
      }
      Object.keys(remoteAudioEls).forEach(function (em) { killAudio(remoteAudioEls[em]); });
      remoteAudioEls = {};
      try {
        var nodes = [];
        if (container && container.querySelectorAll) {
          container.querySelectorAll('audio[data-voice-peer]').forEach(function (a) { nodes.push(a); });
        }
        document.querySelectorAll('audio[data-voice-peer]').forEach(function (a) { nodes.push(a); });
        nodes.forEach(killAudio);
      } catch (eQ) {}
      if (localStream) {
        localStream.getTracks().forEach(function (t) { try { t.onended = null; t.stop(); } catch (eLs) {} });
        localStream = null;
      }
      localAnalyser = null;
      if (audioCtx) {
        var ctx = audioCtx;
        audioCtx = null;
        try { ctx.onstatechange = null; } catch (eOc) {}
        try { ctx.close(); } catch (eCl) {}
      }
      if (ws && ws.readyState === 1) {
        try { ws.send(JSON.stringify({ type: 'voice_state', on: false })); } catch (eVs) {}
      }
    }

    function setupAnalyser(stream, isLocal, email) {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        var src = audioCtx.createMediaStreamSource(stream);
        var an = audioCtx.createAnalyser();
        an.fftSize = 256;
        src.connect(an);
        if (isLocal) localAnalyser = an;
        else remoteAnalysers[email] = an;
      } catch (e) {}
    }

    function levelFromAnalyser(an) {
      if (!an) return 0;
      var data = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(data);
      var sum = 0;
      for (var i = 0; i < data.length; i++) sum += data[i];
      return sum / (data.length * 255);
    }

    function createPeerConnection(peerEmail, polite) {
      if (peerConnections[peerEmail]) return peerConnections[peerEmail];
      var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnections[peerEmail] = pc;
      pc._pendingIce = [];
      if (localStream) {
        localStream.getTracks().forEach(function (track) {
          pc.addTrack(track, localStream);
        });
      }
      pc.onicecandidate = function (ev) {
        if (!ev.candidate || !ws || ws.readyState !== 1) return;
        ws.send(JSON.stringify({
          type: 'voice_signal',
          to: peerEmail,
          signal: { kind: 'ice', candidate: icePlain(ev.candidate) },
        }));
      };
      pc.ontrack = function (ev) {
        var stream = (ev.streams && ev.streams[0]) ? ev.streams[0] : new MediaStream([ev.track]);
        var audio = ensureAudioEl(peerEmail);
        if (audio.srcObject !== stream) audio.srcObject = stream;
        applyRemoteAudible(peerEmail);
        var kick = function () {
          if (isPeerMuted(peerEmail)) return;
          try { audio.volume = 1; } catch (eKick) {}
          audio.muted = false;
          var pr = audio.play();
          if (pr && typeof pr.catch === 'function') pr.catch(function () {});
        };
        kick();
        audio.oncanplay = kick;
        setupAnalyser(stream, false, peerEmail);
        setVoiceStatus('Voz WebRTC conectada');
      };
      pc.onconnectionstatechange = function () {
        if (pc.connectionState === 'connected') setVoiceStatus('Voz WebRTC conectada');
        if (pc.connectionState === 'failed') {
          /* Peer only. The mic and 16kHz PCM sender stay up. */
          closePeer(peerEmail);
          if (voiceOn) {
            if (!pcmProc) startPcmRelay();
            setTimeout(function () { if (voiceOn) syncVoiceMesh(); }, 5000);
          }
        }
      };
      pc._polite = !!polite;
      return pc;
    }

    async function callPeer(peerEmail) {
      if (!voiceOn || !localStream) return;
      if (!voiceEligible(players[peerEmail] || { email: peerEmail, world: currentWorld, room: currentRoom })) return;
      var polite = user.email > peerEmail;
      var pc = createPeerConnection(peerEmail, polite);
      if (pc.signalingState && pc.signalingState !== 'stable') return;
      if (pc._makingOffer) return;
      try {
        pc._makingOffer = true;
        var offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'voice_signal',
            to: peerEmail,
            signal: { kind: 'offer', sdp: sdpPlain(pc.localDescription) },
          }));
        }
      } catch (e) {
        console.warn('voice offer', e);
      } finally {
        pc._makingOffer = false;
      }
    }

    async function handleVoiceSignal(from, signal) {
      if (!signal || !from || from === user.email) return;
      if (!voiceOn || !localStream) return;
      var polite = user.email > from;
      var pc = createPeerConnection(from, polite);
      try {
        if (signal.kind === 'offer' && signal.sdp) {
          if (pc.signalingState !== 'stable') {
            if (!polite) return;
            try { await pc.setLocalDescription({ type: 'rollback' }); } catch (e0) {}
          }
          await pc.setRemoteDescription(signal.sdp);
          flushIce(pc);
          var answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'voice_signal',
              to: from,
              signal: { kind: 'answer', sdp: sdpPlain(pc.localDescription) },
            }));
          }
        } else if (signal.kind === 'answer' && signal.sdp) {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(signal.sdp);
            flushIce(pc);
          }
        } else if (signal.kind === 'ice' && signal.candidate) {
          queueIce(pc, signal.candidate);
        }
      } catch (e) {
        console.warn('voice signal', e);
      }
    }

    function syncVoiceMesh() {
      if (!voiceOn) return;
      Object.keys(players).forEach(function (em) {
        var p = players[em];
        if (!p || !p.voice) return;
        if (!voiceEligible(p)) {
          closePeer(em);
          return;
        }
        if (user.email < em && !peerConnections[em]) callPeer(em);
      });
      Object.keys(peerConnections).forEach(function (em) {
        var p = players[em];
        if (!p || !p.voice || !voiceEligible(p)) closePeer(em);
      });
    }

    async function toggleVoice() {
      if (voiceOn) {
        await stopVoice();
        toast('🎤 Voz desactivada');
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast('Tu navegador no permite micrófono');
        setVoiceStatus('No disponible');
        return;
      }
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
      } catch (eCtx) {}
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      } catch (err) {
        var msg = 'No se pudo acceder al micrófono.';
        if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
          msg = 'Permiso de micrófono denegado. Actívalo en el navegador para usar el chat de voz.';
        } else if (err && err.name === 'NotFoundError') {
          msg = 'No se encontró ningún micrófono.';
        } else if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
          msg = 'El micrófono requiere HTTPS (o localhost). Abre Snake OS por el túnel seguro.';
        }
        toast(msg);
        setVoiceStatus('Sin permiso');
        return;
      }
      voiceOn = true;
      bindMicTrack(localStream);
      setupAnalyser(localStream, true, null);
      startPcmRelay();
      startMicWatch();
      updateMicBtn();
      setVoiceStatus('Voz activa · conectando');
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'voice_state', on: true }));
      } else {
        toast('Sin conexión al metaverso. Entra de nuevo y activa la voz.');
      }
      toast('🎤 Micrófono activado. Quien lo tenga apagado también puede oírte.');
      Object.keys(players).forEach(function (em) {
        if (players[em] && players[em].voice && voiceEligible(players[em]) && user.email < em) {
          callPeer(em);
        }
      });
    }

    function tickSpeaking() {
      var now = performance.now();
      if (voiceOn && localAnalyser && levelFromAnalyser(localAnalyser) > 0.08) {
        speakingUntil[user.email] = now + 400;
      }
      Object.keys(remoteAnalysers).forEach(function (em) {
        if (levelFromAnalyser(remoteAnalysers[em]) > 0.06) {
          speakingUntil[em] = now + 400;
        }
      });
    }

    function unlockListenAudio() {
      try { ensureAudioCtx(); } catch (eU) {}
    }
    container.addEventListener('pointerdown', unlockListenAudio, { passive: true });
    function onVisVoice() {
      if (voiceDestroyed || closed) return;
      if (document.visibilityState !== 'visible') return;
      unlockListenAudio();
      if (voiceOn) ensureMicAlive('visible');
    }
    document.addEventListener('visibilitychange', onVisVoice);
    function onVisWs() {
      if (closed || document.visibilityState !== 'visible') return;
      if (!ws || ws.readyState === 3) connectWs();
      else if (ws.readyState === 1) {
        try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (ePv) {}
      }
    }
    document.addEventListener('visibilitychange', onVisWs);
    window.addEventListener('online', onVisWs);
    function onReclaimTab() {
      if (closed || !wsReplaced || ws) return;
      wsReplaced = false;
      wsReconnectAttempt = 0;
      connectWs();
    }
    container.addEventListener('pointerdown', onReclaimTab, { passive: true });
    if (micBtn) micBtn.addEventListener('click', function () { toggleVoice(); });
    function clearWsHeartbeat() {
      if (wsHeartbeatTimer) {
        clearInterval(wsHeartbeatTimer);
        wsHeartbeatTimer = null;
      }
    }
    function clearWsReconnect() {
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
      }
    }
    function scheduleWsReconnect(reason) {
      if (closed) return;
      clearWsReconnect();
      wsConnecting = false;
      wsReconnectAttempt += 1;
      var delay = Math.min(8000, 400 + wsReconnectAttempt * 500);
      setStatus('Reconectando… (' + wsReconnectAttempt + ')');
      wsReconnectTimer = setTimeout(function () {
        wsReconnectTimer = null;
        connectWs();
      }, delay);
    }
    function startWsHeartbeat(sock) {
      clearWsHeartbeat();
      wsLastPongAt = performance.now();
      wsHeartbeatTimer = setInterval(function () {
        if (closed || ws !== sock) { clearWsHeartbeat(); return; }
        if (sock.readyState !== 1) return;
        /* Cloudflare idle ~100s; keep alive often. Any traffic refreshes wsLastPongAt. */
        try { sock.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (eP) {}
        if (wsLastPongAt && performance.now() - wsLastPongAt > 75000) {
          try { sock.close(4001, 'heartbeat'); } catch (eDead) {}
        }
      }, 12000);
    }
    function connectWs() {
      if (closed) return;
      if (wsConnecting) return;
      if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
      clearWsReconnect();
      wsConnecting = true;
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      var url = proto + '//' + location.host + '/api/metaverse/ws?world=' + encodeURIComponent(currentWorld);
      try {
        if (ws) {
          try { ws.onclose = null; ws.onmessage = null; ws.onerror = null; ws.onopen = null; } catch (eH) {}
          try { ws.close(); } catch (eC) {}
        }
      } catch (eOld) {}
      var sock;
      try { sock = new WebSocket(url); ws = sock; }
      catch (e) {
        wsConnecting = false;
        setStatus('Error WebSocket');
        scheduleWsReconnect('error');
        return;
      }
      sock.onopen = function () {
        if (ws !== sock) return;
        wsReplaced = false;
        wsConnecting = false;
        wsReconnectAttempt = 0;
        wsLastPongAt = performance.now();
        startWsHeartbeat(sock);
        setStatus('Conectado');
        sendMove(true);
        scheduleProgressSave();
      };
      sock.onclose = function (ev) {
        if (ws !== sock || closed) return;
        clearWsHeartbeat();
        wsConnecting = false;
        ws = null;
        var code = ev && typeof ev.code === 'number' ? ev.code : 0;
        /* 4000 = otra pestaña/sesión reemplazó esta conexión: no pelear en bucle. */
        if (code === 4000) {
          wsReplaced = true;
          setStatus('Abierto en otra pestaña · toca aquí para jugar en esta');
          wsReconnectAttempt = 0;
          clearWsReconnect();
          return;
        }
        scheduleWsReconnect('close');
      };
      sock.onerror = function () {
        /* onclose will schedule reconnect */
      };
      sock.onmessage = function (ev) {
        if (ws !== sock || closed || voiceDestroyed) return;
        var msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (!msg || !msg.type) return;
        /* Any inbound frame proves the socket is alive (move/chat/voice), not only pong. */
        wsLastPongAt = performance.now();
        try { mvxOnMsg(msg); } catch (eMvxMsg) {}
        if (msg.type === 'pong' || msg.type === 'ping') {
          if (msg.type === 'ping' && sock.readyState === 1) {
            try { sock.send(JSON.stringify({ type: 'pong' })); } catch (ePo) {}
          }
          return;
        }
        if (msg.type === 'replaced') {
          wsReplaced = true;
          setStatus('Abierto en otra pestaña · toca aquí para jugar en esta');
          try { sock.onclose = null; sock.close(); } catch (eR) {}
          clearWsHeartbeat();
          clearWsReconnect();
          ws = null;
          wsConnecting = false;
          return;
        }
        if (msg.type === 'welcome') {
          players = {};
          remotePos = {};
          var hasPendingRoom = !!(pendingMetaverseRoom && pendingMetaverseRoom.roomId) || !!opts.room;
          var keepLocalPose = mvSessionLive && !hasPendingRoom;
          if (msg.progress) {
            applyProgress(msg.progress, {
              applyPose: !hasPendingRoom && !keepLocalPose,
              applyWorld: !keepLocalPose,
              restoreMic: false,
              clearRoom: !!hasPendingRoom && !keepLocalPose
            });
          }
          if (msg.you) {
            if (!hasPendingRoom && !keepLocalPose) {
              me.x = msg.you.x; me.y = msg.you.y; me.ry = msg.you.ry || 0;
              if (msg.you.room) currentRoom = msg.you.room;
            } else if (!hasPendingRoom && keepLocalPose && msg.you.room && !currentRoom) {
              currentRoom = msg.you.room;
            }
            if (typeof msg.you.score === 'number' && !keepLocalPose) setScore(msg.you.score);
            else if (typeof msg.you.score === 'number' && msg.you.score > myScore) setScore(msg.you.score);
            if (typeof msg.you.coins === 'number') setCoins(msg.you.coins);
            if (msg.you.look) {
              myLook = normalizeLook(msg.you.look);
              renderAvatarShop();
            }
          }
          if (!hasPendingRoom && !keepLocalPose) currentWorld = msg.world || currentWorld;
          bones = msg.bones || [];
          applyPartyMsg(msg);
          (msg.players || []).forEach(upsertPlayer);
          clearMessages();
          (msg.history || []).forEach(appendMsg);
          renderWorlds();
          renderRooms();
          renderOnline();
          if (threeReady) { buildWorld3D(); syncBoneMeshes(); }
          setStatus('En línea · ' + Object.keys(players).length + ' en ' + worldName(currentWorld));
          if (voiceOn) {
            try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'voice_state', on: true })); } catch (eVs) {}
            startMicWatch();
            ensureMicAlive('reconnect');
            syncVoiceMesh();
          }
          tryPendingMetaverseRoom();
          refreshRoomOverlayIfNeeded();
          snapTopDownView();
          mvSessionLive = true;
          /* Push authoritative local pose so reconnect never leaves us at an old DB spawn. */
          sendMove(true);
          scheduleProgressSave();
        } else if (msg.type === 'join') {
          upsertPlayer(msg.player);
          if (voiceOn) syncVoiceMesh();
        } else if (msg.type === 'leave') {
          closePeer(msg.email);
          removePlayer(msg.email);
          if (voiceOn) syncVoiceMesh();
        } else if (msg.type === 'move') {
          upsertPlayer(msg);
        } else if (msg.type === 'chat') {
          appendMsg(msg);
          if (msg.to && msg.to === user.email && chatPeer !== msg.from) {
            toast('💬 DM de ' + (msg.from_name || msg.from));
          }
        } else if (msg.type === 'world_players') {
          players = {};
          remotePos = {};
          currentWorld = msg.world || currentWorld;
          bones = msg.bones || [];
          applyPartyMsg(msg);
          (msg.players || []).forEach(upsertPlayer);
          clearMessages();
          (msg.history || []).forEach(appendMsg);
          renderWorlds();
          renderRooms();
          renderOnline();
          if (threeReady) { buildWorld3D(); syncBoneMeshes(); }
          snapTopDownView();
          closeAllPeers();
          if (voiceOn) syncVoiceMesh();
        } else if (msg.type === 'party') {
          applyPartyMsg(msg);
        } else if (msg.type === 'emote') {
          floaters[msg.email] = { emoji: msg.emoji, until: performance.now() + 2500 };
          if (msg.email === user.email) {
            myEmote = msg.emoji;
            myEmoteUntil = performance.now() + 2500;
          }
        } else if (msg.type === 'bone_collected') {
          bones = msg.bones || bones;
          if (threeReady) syncBoneMeshes();
          if (msg.collected_id) {
            var gone = (msg.bones || []).length;
          }
          spawnParticles(me.x, me.y, '#ffd56a');
          if (msg.by === user.email) {
            if (typeof msg.coins === 'number') setCoins(msg.coins);
            toast('🪙 +1 coin');
            spawnParticles(me.x, me.y, '#fff3a0');
          } else {
            toast((msg.by_name || 'Alguien') + ' recogió un 🪙');
          }
        } else if (msg.type === 'fun') {
          if (msg.email !== user.email) applyFunEffect(msg.effect, msg.email, { name: msg.name }, false);
        } else if (msg.type === 'mando_pro') {
          applyMandoPro(msg.effect, msg.email, { name: msg.name, label: msg.label });
        } else if (msg.type === 'mando_pair_ok') {
          try {
            if (typeof window.__mvMandoPairOk === 'function') window.__mvMandoPairOk(msg);
            else renderMandoPairData(msg);
          } catch (ePairOk) {}
        } else if (msg.type === 'mando_pair_err') {
          try {
            if (typeof window.__mvMandoPairErr === 'function') window.__mvMandoPairErr(msg.detail || 'Error');
          } catch (ePairErr) {}
        } else if (msg.type === 'highfive') {
          toast('🙌 ¡Choca esos cinco!');
          spawnParticles(me.x, me.y, '#ff7ab6');
        } else if (msg.type === 'voice_state') {
          if (players[msg.email]) players[msg.email].voice = !!msg.on;
          else if (msg.email !== user.email) {
            players[msg.email] = players[msg.email] || { email: msg.email, name: msg.name, avatar: '🐶', world: msg.world || currentWorld, room: msg.room || null, voice: !!msg.on };
            if (players[msg.email]) players[msg.email].voice = !!msg.on;
          }
          if (msg.email === user.email) { /* ignore echo */ }
          if (!msg.on) closePeer(msg.email);
          else if (voiceOn) syncVoiceMesh();
          renderOnline();
        } else if (msg.type === 'voice_signal') {
          if (!msg.from || String(msg.from).indexOf('ai-bot:') === 0) { /* bots have no voice */ }
          else handleVoiceSignal(msg.from, msg.signal);
        } else if (msg.type === 'voice_pcm') {
          if (!closed && !voiceDestroyed && msg.from && msg.from !== user.email && String(msg.from).indexOf('ai-bot:') !== 0) playPcm(msg.from, msg.pcm, msg.rate);
        } else if (msg.type === 'progress') {
          if (msg.progress) applyProgress(msg.progress, { applyPose: false, applyWorld: false, restoreMic: false });
        } else if (msg.type === 'profile') {
          if (msg.email) {
            if (msg.email === user.email) {
              if (msg.avatar) user.avatar = msg.avatar;
              if (msg.name) user.name = msg.name;
            } else if (players[msg.email]) {
              if (msg.avatar) players[msg.email].avatar = msg.avatar;
              if (msg.name) players[msg.email].name = msg.name;
            }
            if (threeReady) ensureAvatarMeshes();
            renderOnline();
          }
        } else if (msg.type === 'look') {
          if (msg.email && msg.look) {
            if (msg.email === user.email) {
              myLook = normalizeLook(msg.look);
              renderAvatarShop();
            } else {
              players[msg.email] = players[msg.email] || {
                email: msg.email,
                name: msg.name || msg.email,
                avatar: '🐶',
                world: msg.world || currentWorld,
                room: null
              };
              players[msg.email].look = normalizeLook(msg.look);
            }
            dropAvatarMesh(msg.email);
            if (threeReady) ensureAvatarMeshes();
          }
        } else if (msg.type === 'error') {
          setStatus(msg.detail || 'Error');
        }
      };
    }

    function disposeObject3D(obj) {
      if (!obj) return;
      obj.traverse(function (ch) {
        if (ch.geometry) ch.geometry.dispose();
        if (ch.material) {
          var mats = Array.isArray(ch.material) ? ch.material : [ch.material];
          mats.forEach(function (m) {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
    }

    function makeEmojiTexture(emoji, size) {
      size = size || 128;
      var c = document.createElement('canvas');
      c.width = size; c.height = size;
      var c2 = c.getContext('2d');
      c2.clearRect(0, 0, size, size);
      c2.font = Math.floor(size * 0.62) + 'px serif';
      c2.textAlign = 'center';
      c2.textBaseline = 'middle';
      c2.fillText(emoji || '🐶', size / 2, size / 2 + 4);
      var tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      try { if (window.snakeEmoji && window.snakeEmoji.paintCanvas) window.snakeEmoji.paintCanvas(c2, emoji || '🐶', size, function () { tex.needsUpdate = true; }); } catch (eSE) {}
      return tex;
    }

    function makeAvatarMesh(email, avatar, isMe, look) {
      var group = new THREE.Group();
      var custom = !!(look && look.skin);
      var n = custom ? normalizeLook(look) : null;
      var bodyColor = custom ? SHIRT_COLOR[n.shirt] : hslToHex(colorFromEmail(email));
      var headColor = custom ? SKIN_COLOR[n.skin] : 0xffe0bd;
      var bodyRestY = isMe ? 22 : 20;
      var body = new THREE.Mesh(
        new THREE.CapsuleGeometry(isMe ? 8 : 7.2, isMe ? 12 : 10, 4, 8),
        new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.55, metalness: 0.08 })
      );
      body.position.y = bodyRestY;
      body.castShadow = true;
      group.add(body);
      function addLimb(px, py, pz, len, radius, color) {
        var pivot = new THREE.Group();
        pivot.position.set(px, py, pz);
        var limb = new THREE.Mesh(
          new THREE.CapsuleGeometry(radius, len, 3, 6),
          new THREE.MeshStandardMaterial({ color: color, roughness: 0.62, metalness: 0.04 })
        );
        limb.position.y = -(len * 0.5 + radius);
        limb.castShadow = true;
        pivot.add(limb);
        pivot.userData.limb = limb;
        pivot.userData.baseLen = len;
        pivot.userData.radius = radius;
        pivot.userData.restPos = { x: px, y: py, z: pz };
        group.add(pivot);
        return pivot;
      }
      var shoulderY = isMe ? 30 : 27;
      var side = isMe ? 12.2 : 11;
      group.userData.armL = addLimb(side, shoulderY, 0, isMe ? 15 : 13, isMe ? 2.4 : 2.1, headColor);
      group.userData.armR = addLimb(-side, shoulderY, 0, isMe ? 15 : 13, isMe ? 2.4 : 2.1, headColor);
      group.userData.legL = addLimb(4.4, isMe ? 10 : 9, 0, isMe ? 13 : 12, isMe ? 2.7 : 2.4, 0x2c3548);
      group.userData.legR = addLimb(-4.4, isMe ? 10 : 9, 0, isMe ? 13 : 12, isMe ? 2.7 : 2.4, 0x2c3548);
      group.userData.bodyRest = bodyRestY;
      var hr = isMe ? 9 : 8;
      function shadeHex(hex, factor) {
        var r = Math.max(0, Math.min(255, Math.round(((hex >> 16) & 255) * factor)));
        var g = Math.max(0, Math.min(255, Math.round(((hex >> 8) & 255) * factor)));
        var b = Math.max(0, Math.min(255, Math.round((hex & 255) * factor)));
        return (r << 16) | (g << 8) | b;
      }
      var skinMat = new THREE.MeshStandardMaterial({
        color: headColor,
        roughness: 0.58,
        metalness: 0,
        emissive: headColor,
        emissiveIntensity: 0.16
      });
      var headPivot = new THREE.Group();
      headPivot.position.y = isMe ? 40 : 37;
      headPivot.rotation.x = -0.72;
      var head = new THREE.Mesh(new THREE.SphereGeometry(hr, 16, 14), skinMat);
      head.castShadow = true;
      headPivot.add(head);
      var eyeMat = new THREE.MeshStandardMaterial({ color: 0x243044, roughness: 0.4, metalness: 0 });
      var eyeGeo = new THREE.SphereGeometry(Math.max(0.7, hr * 0.11), 8, 8);
      var eyeL = new THREE.Mesh(eyeGeo, eyeMat);
      var eyeR = new THREE.Mesh(eyeGeo, eyeMat);
      eyeL.position.set(-hr * 0.28, hr * 0.16, hr * 0.86);
      eyeR.position.set(hr * 0.28, hr * 0.16, hr * 0.86);
      headPivot.add(eyeL);
      headPivot.add(eyeR);
      var nose = new THREE.Mesh(
        new THREE.ConeGeometry(hr * 0.14, hr * 0.34, 6),
        new THREE.MeshStandardMaterial({ color: shadeHex(headColor, 0.76), roughness: 0.55, metalness: 0 })
      );
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, -hr * 0.02, hr * 0.92);
      headPivot.add(nose);
      if (custom && n.hair !== 'rapado' && HAIR_COLOR[n.hair] != null) {
        var hair = new THREE.Mesh(
          new THREE.SphereGeometry(hr + 0.25, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.36),
          new THREE.MeshStandardMaterial({ color: HAIR_COLOR[n.hair], roughness: 0.72, metalness: 0 })
        );
        hair.position.set(0, hr * 0.22, -hr * 0.42);
        hair.castShadow = true;
        headPivot.add(hair);
      }
      if (custom && n.hat && n.hat !== 'none') {
        var hatColor = n.hat === 'corona' ? 0xf5c542 : (n.hat === 'gorra' ? 0x1f4fd8 : 0x5c3a1e);
        var hatMat = new THREE.MeshStandardMaterial({
          color: hatColor,
          roughness: 0.45,
          metalness: n.hat === 'corona' ? 0.45 : 0.05
        });
        if (n.hat === 'gorra') {
          var cap = new THREE.Mesh(new THREE.SphereGeometry(hr + 0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatMat);
          cap.position.y = hr * 0.42;
          cap.castShadow = true;
          headPivot.add(cap);
          var brim = new THREE.Mesh(new THREE.BoxGeometry(hr * 1.7, 1.1, 6), hatMat);
          brim.position.set(0, hr * 0.18, hr * 0.72);
          headPivot.add(brim);
        } else if (n.hat === 'sombrero') {
          var brimWide = new THREE.Mesh(new THREE.CylinderGeometry(hr + 5, hr + 5, 1.1, 16), hatMat);
          brimWide.position.y = hr * 0.5;
          headPivot.add(brimWide);
          var crown = new THREE.Mesh(new THREE.CylinderGeometry(hr * 0.58, hr * 0.58, 7, 12), hatMat);
          crown.position.y = hr * 0.95;
          crown.castShadow = true;
          headPivot.add(crown);
        } else if (n.hat === 'corona') {
          var iHat;
          for (iHat = 0; iHat < 5; iHat++) {
            var ang = (iHat / 5) * Math.PI * 2;
            var spike = new THREE.Mesh(new THREE.ConeGeometry(1.8, 6, 5), hatMat);
            spike.position.set(Math.cos(ang) * (hr * 0.62), hr * 0.85, Math.sin(ang) * (hr * 0.62));
            headPivot.add(spike);
          }
          var band = new THREE.Mesh(new THREE.TorusGeometry(hr * 0.68, 0.6, 6, 16), hatMat);
          band.rotation.x = Math.PI / 2;
          band.position.y = hr * 0.55;
          headPivot.add(band);
        }
      }
      group.add(headPivot);
      group.userData.headPivot = headPivot;
      /* La foto/emoji de perfil va encima del nombre (etiqueta HTML), no como sprite 3D. */
      var sprite = null;
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(14, 16, 24),
        new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 1.2;
      group.add(ring);
      group.userData.email = email;
      group.userData.isMe = !!isMe;
      group.userData.body = body;
      group.userData.ring = ring;
      group.userData.sprite = sprite;
      group.userData.emoteSprite = null;
      group.userData.lookKey = custom ? (n.skin + '|' + n.hair + '|' + n.shirt + '|' + n.hat) : 'legacy';
      return group;
    }

    function ensureNameLabel(email, text) {
      if (!labelsEl) return null;
      var el = nameLabels[email];
      if (!el) {
        el = document.createElement('div');
        el.className = 'mv-nameplate';
        labelsEl.appendChild(el);
        nameLabels[email] = el;
      }
      el.textContent = text;
      return el;
    }

    function isPhotoAv(av) {
      return String(av || '').indexOf('/api/avatars/') === 0;
    }

    function myAvatar() {
      var cu = global.currentUser;
      if (cu && cu.email && user && String(cu.email).toLowerCase() === String(user.email || '').toLowerCase() && cu.avatar) {
        return cu.avatar;
      }
      return (user && user.avatar) || '🐶';
    }

    function avatarListHtml(av) {
      av = av || '🐶';
      if (isPhotoAv(av)) {
        return '<img class="mv-u-photo" src="' + esc(av) + '" alt="" draggable="false" ' +
          'onerror="this.replaceWith(document.createTextNode(\'🐶\'))">';
      }
      return esc(av);
    }

    function ensureHeadAvCss() {
      if (document.getElementById('mv-head-av-css')) return;
      var st = document.createElement('style');
      st.id = 'mv-head-av-css';
      st.textContent =
        '.mv-nameplate.mv-nameplate-player{background:none;border:none;padding:0;display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none}' +
        '.mv-nameplate-player .mv-head-av{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:21px;line-height:1;' +
          'background:rgba(0,0,0,0.28);border:2px solid rgba(255,255,255,0.85);box-shadow:0 2px 8px rgba(0,0,0,0.35);overflow:hidden;box-sizing:border-box}' +
        '.mv-nameplate-player .mv-head-av.photo{background:#1b1b1b}' +
        '.mv-nameplate-player .mv-head-av img{width:100%;height:100%;object-fit:cover;display:block;border-radius:50%}' +
        '.mv-nameplate-player .mv-nameplate-text{font-size:0.68rem;padding:2px 7px;border-radius:8px;background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.15);color:#fff;white-space:nowrap}' +
        'body.phone-mode .mv-nameplate-player .mv-head-av{width:26px;height:26px;font-size:17px}' +
        '.mv-u-photo{width:18px;height:18px;border-radius:50%;object-fit:cover;vertical-align:middle;display:inline-block}';
      document.head.appendChild(st);
    }

    function setHeadAvatar(el, av) {
      var bub = el && el._avEl;
      if (!bub) return;
      av = av || '🐶';
      if (el._av === av) return;
      el._av = av;
      bub.textContent = '';
      bub.classList.remove('photo');
      if (isPhotoAv(av)) {
        var img = new Image();
        img.alt = '';
        img.decoding = 'async';
        img.draggable = false;
        img.onerror = function () {
          if (el._av !== av) return;
          bub.classList.remove('photo');
          bub.textContent = '🐶';
        };
        bub.classList.add('photo');
        bub.appendChild(img);
        img.src = av; // mismo origen (/api/avatars/...), sin CORS
      } else {
        bub.textContent = String(av).slice(0, 16);
      }
    }

    function ensurePlayerLabel(email, text, av) {
      if (!labelsEl) return null;
      ensureHeadAvCss();
      var el = nameLabels[email];
      if (!el || !el._avEl) {
        if (el) { try { el.remove(); } catch (eOld) {} }
        el = document.createElement('div');
        el.className = 'mv-nameplate mv-nameplate-player';
        var bub = document.createElement('div');
        bub.className = 'mv-head-av';
        var txt = document.createElement('div');
        txt.className = 'mv-nameplate-text';
        el.appendChild(bub);
        el.appendChild(txt);
        el._avEl = bub;
        el._txtEl = txt;
        labelsEl.appendChild(el);
        nameLabels[email] = el;
      }
      if (el._txt !== text) {
        el._txt = text;
        el._txtEl.textContent = text;
        if (el._pbEl) el._txtEl.appendChild(el._pbEl);
      }
      /* Insignia ⭐ PRO pública de otros jugadores (snake-pro-badge.js) */
      var wantPro = arguments[3] === true;
      if (el._pro !== wantPro) {
        el._pro = wantPro;
        if (el._pbEl) { try { el._pbEl.remove(); } catch (ePb0) {} el._pbEl = null; }
        if (wantPro && window.snkProBadge) { el._pbEl = window.snkProBadge.el({ pro: true }); if (el._pbEl) el._txtEl.appendChild(el._pbEl); }
      }
      setHeadAvatar(el, av);
      return el;
    }

    function removeNameLabel(email) {
      if (nameLabels[email]) {
        try { nameLabels[email].remove(); } catch (e) {}
        delete nameLabels[email];
      }
    }

    function projectLabel(el, wx, wy, wz) {
      if (!el || !camera || !renderer) return;
      var v = new THREE.Vector3(wx, wy, wz);
      v.project(camera);
      var hw = cssW / 2, hh = cssH / 2;
      var sx = v.x * hw + hw;
      var sy = -v.y * hh + hh;
      if (v.z > 1 || sx < -40 || sy < -20 || sx > cssW + 40 || sy > cssH + 20) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';
      el.style.left = sx + 'px';
      el.style.top = (sy - 8) + 'px';
    }

    function clearWorldRoot() {
      if (!worldRoot || !scene) return;
      scene.remove(worldRoot);
      disposeObject3D(worldRoot);
      worldRoot = null;
      roomMarkers = {};
      Object.keys(boneMeshes).forEach(function (id) { delete boneMeshes[id]; });
      boneMeshes = {};
      Object.keys(nameLabels).forEach(function (k) {
        if (k.indexOf('room:') === 0) removeNameLabel(k);
      });
    }

    function addTree(parent, x, z) {
      var g = new THREE.Group();
      var trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(2.5, 3.5, 16, 6),
        new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 })
      );
      trunk.position.y = 8;
      trunk.castShadow = true;
      g.add(trunk);
      var leaf = new THREE.Mesh(
        new THREE.SphereGeometry(12, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x2f7a3e, roughness: 0.8 })
      );
      leaf.position.y = 22;
      leaf.castShadow = true;
      g.add(leaf);
      g.position.set(x, 0, z);
      parent.add(g);
    }


    function addFlatPath(parent, d) {
      var w = d.w || 40;
      var h = d.h || 40;
      var mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.55, h),
        new THREE.MeshStandardMaterial({ color: parseHexColor(d.fill, 0xc4b49a), roughness: 0.95 })
      );
      mesh.position.set(d.x + w / 2, 0.32, d.y + h / 2);
      mesh.receiveShadow = true;
      parent.add(mesh);
    }

    function addBench(parent, d) {
      var g = new THREE.Group();
      var wood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.82 });
      var metal = new THREE.MeshStandardMaterial({ color: 0x2c2c2c, metalness: 0.45, roughness: 0.45 });
      var seat = new THREE.Mesh(new THREE.BoxGeometry(16, 1.1, 5), wood);
      seat.position.y = 4.2;
      g.add(seat);
      var back = new THREE.Mesh(new THREE.BoxGeometry(16, 4.2, 0.7), wood);
      back.position.set(0, 6.6, -2.2);
      g.add(back);
      [[-6.2, -1.5], [6.2, -1.5], [-6.2, 1.5], [6.2, 1.5]].forEach(function (p) {
        var leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 4.2, 0.7), metal);
        leg.position.set(p[0], 2.1, p[1]);
        g.add(leg);
      });
      g.position.set(d.x, 0, d.y);
      if (d.rot) g.rotation.y = d.rot;
      parent.add(g);
    }

    function addLamp(parent, d) {
      var g = new THREE.Group();
      var pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.7, 16, 6),
        new THREE.MeshStandardMaterial({ color: 0x242424, metalness: 0.55, roughness: 0.4 })
      );
      pole.position.y = 8;
      g.add(pole);
      var arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 3.2),
        new THREE.MeshStandardMaterial({ color: 0x242424, metalness: 0.55, roughness: 0.4 })
      );
      arm.position.set(0, 15.6, 1.1);
      g.add(arm);
      var head = new THREE.Mesh(
        new THREE.SphereGeometry(1.35, 8, 8),
        new THREE.MeshStandardMaterial({
          color: 0xffe7a0, emissive: 0xffcc66, emissiveIntensity: 0.85, roughness: 0.35
        })
      );
      head.position.set(0, 14.6, 2.4);
      g.add(head);
      g.position.set(d.x, 0, d.y);
      parent.add(g);
    }

    function addFountain(parent, d) {
      var g = new THREE.Group();
      var stone = new THREE.MeshStandardMaterial({ color: 0xd5cbb8, roughness: 0.72 });
      var basin = new THREE.Mesh(new THREE.CylinderGeometry(14, 16, 3.6, 18), stone);
      basin.position.y = 1.8;
      g.add(basin);
      var water = new THREE.Mesh(
        new THREE.CylinderGeometry(11.2, 11.2, 1.1, 18),
        new THREE.MeshStandardMaterial({ color: 0x3aa0d8, roughness: 0.18, metalness: 0.2, transparent: true, opacity: 0.88 })
      );
      water.position.y = 3.7;
      g.add(water);
      var col = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.7, 9, 8), stone);
      col.position.y = 6.4;
      g.add(col);
      var top = new THREE.Mesh(new THREE.SphereGeometry(2.1, 8, 8), stone);
      top.position.y = 11.4;
      g.add(top);
      g.position.set(d.x, 0, d.y);
      parent.add(g);
    }

    function addStall(parent, d) {
      var g = new THREE.Group();
      var cloth = new THREE.MeshStandardMaterial({ color: (d.color != null ? d.color : 0xc0392b), roughness: 0.62 });
      var wood = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.86 });
      var iron = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.55 });
      var counter = new THREE.Mesh(new THREE.BoxGeometry(14, 5.5, 8), wood);
      counter.position.y = 2.8;
      g.add(counter);
      [[-6.4, -3.4], [6.4, -3.4], [-6.4, 3.4], [6.4, 3.4]].forEach(function (p) {
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 7.5, 5), iron);
        pole.position.set(p[0], 6.6, p[1]);
        g.add(pole);
      });
      var roof = new THREE.Mesh(new THREE.BoxGeometry(18, 1.1, 12), cloth);
      roof.position.y = 10.2;
      g.add(roof);
      var awning = new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, 4), cloth);
      awning.position.set(0, 8.4, 6);
      awning.rotation.x = 0.45;
      g.add(awning);
      g.position.set(d.x, 0, d.y);
      if (d.rot) g.rotation.y = d.rot;
      parent.add(g);
    }

    function addBush(parent, d) {
      var g = new THREE.Group();
      var mat = new THREE.MeshStandardMaterial({ color: (d.color != null ? d.color : 0x2f8f45), roughness: 0.86 });
      var a = new THREE.Mesh(new THREE.SphereGeometry(3.6, 7, 6), mat);
      a.position.y = 2.6;
      g.add(a);
      var b = new THREE.Mesh(new THREE.SphereGeometry(2.6, 7, 6), mat);
      b.position.set(2.2, 2.1, 0.8);
      g.add(b);
      g.position.set(d.x, 0, d.y);
      parent.add(g);
    }

    function addFlower(parent, d) {
      var g = new THREE.Group();
      var stemMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 });
      var colors = [0xff5a7a, 0xffd24a, 0xfff6ea, 0xc56bff];
      for (var i = 0; i < 4; i++) {
        var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.6, 4), stemMat);
        var ang = (i / 4) * Math.PI * 2;
        stem.position.set(Math.cos(ang) * 1.3, 1.3, Math.sin(ang) * 1.3);
        g.add(stem);
        var bloom = new THREE.Mesh(
          new THREE.SphereGeometry(0.62, 6, 5),
          new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.45 })
        );
        bloom.position.set(Math.cos(ang) * 1.3, 2.8, Math.sin(ang) * 1.3);
        g.add(bloom);
      }
      g.position.set(d.x, 0, d.y);
      parent.add(g);
    }

    function addCityFacade(box, w, h, depth) {
      var winMat = new THREE.MeshStandardMaterial({
        color: 0xb9e2ff, emissive: 0x16324a, emissiveIntensity: 0.4, roughness: 0.22, metalness: 0.12
      });
      var cols = Math.max(1, Math.round(w / 18));
      var rows = Math.max(2, Math.round(h / 26));
      var cw = w / cols;
      var rh = h / rows;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if ((r + c) % 5 === 0) continue;
          var win = new THREE.Mesh(
            new THREE.BoxGeometry(Math.min(5.5, cw * 0.42), Math.min(7.5, rh * 0.42), 0.8),
            winMat
          );
          win.position.set(-w / 2 + cw * (c + 0.5), -h / 2 + rh * (r + 0.5), depth / 2 + 0.35);
          box.add(win);
        }
      }
      var roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 3, 2.4, depth + 3),
        new THREE.MeshStandardMaterial({ color: 0x2c333d, roughness: 0.78 })
      );
      roof.position.y = h / 2 + 1.1;
      box.add(roof);
    }


    var mapParty = false;
    var partyPollKnown = false;
    var partyPollTimer = null;
    var partyCycleTimer = null;

    function fmtPartyCountdown(sec) {
      sec = Math.max(0, Math.floor(sec || 0));
      var h = Math.floor(sec / 3600);
      var m = Math.floor((sec % 3600) / 60);
      var s = sec % 60;
      if (h > 0) {
        return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      }
      return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function paintPartyTimer(data) {
      if (!partyTimerEl || !data) return;
      var phase = data.phase === 'party' ? 'party' : 'hour';
      var left = fmtPartyCountdown(data.secondsLeft);
      if (phase === 'party' || data.party) {
        partyTimerEl.textContent = '🎉 Modo fiesta · ' + left;
        partyTimerEl.classList.add('party-on');
      } else {
        partyTimerEl.textContent = '⏳ Fiesta en ' + left;
        partyTimerEl.classList.remove('party-on');
      }
    }

    function pollPartyCycle() {
      if (closed) return;
      fetch('/api/metaverse/party-cycle', { credentials: 'include', cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (closed || !data) return;
          paintPartyTimer(data);
          if (typeof data.party === 'boolean') {
            partyPollKnown = true;
            setMapParty(data.party);
          }
        })
        .catch(function () {});
    }

    function noteMapParty(on) {
      /* Antes del aviso directo, el baile de los bots ya trae la bandera de la Mega. */
      if (partyPollKnown) return;
      setMapParty(!!on);
    }

    function setMapParty(on) {
      var next = !!on;
      if (next === mapParty) return;
      mapParty = next;
      if (threeReady) syncPartyDecor();
    }

    function applyPartyMsg(msg) {
      if (!msg || typeof msg.party !== 'boolean') return;
      partyPollKnown = true;
      setMapParty(msg.party);
    }

    function pollMapParty() {
      if (closed) return;
      fetch('/api/metaverse/party', { credentials: 'include', cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (closed || !data || typeof data.party !== 'boolean') return;
          partyPollKnown = true;
          setMapParty(data.party);
        })
        .catch(function () {});
    }

    function clearPartyDecor() {
      if (!worldRoot) return;
      var old = worldRoot.getObjectByName('mv-party');
      if (!old) return;
      worldRoot.remove(old);
      disposeObject3D(old);
    }

    function syncPartyDecor() {
      clearPartyDecor();
      if (!mapParty || !worldRoot || !THREE) return;
      buildPartyDecor();
    }

    function buildPartyDecor() {
      var size = (WORLD_BY_ID[currentWorld] || WORLDS[0]).size || 800;
      var g = new THREE.Group();
      g.name = 'mv-party';
      g.userData.bits = [];
      var colors = [0xff4d6d, 0xffd23f, 0x4cc9f0, 0xc77dff, 0x5dff9a, 0xff8a3d];
      var lines = [150, 400, 650];
      lines.forEach(function (z, li) {
        var rope = new THREE.Mesh(
          new THREE.BoxGeometry(size - 70, 0.35, 0.35),
          new THREE.MeshStandardMaterial({ color: 0xfff6ea, roughness: 0.6 })
        );
        rope.position.set(size / 2, 15, z);
        g.add(rope);
        [70, 160, 250, 340, 460, 550, 640, 730].forEach(function (x, fi) {
          var col = colors[(li + fi) % colors.length];
          var flag = new THREE.Mesh(
            new THREE.ConeGeometry(2.5, 5.4, 3),
            new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, emissive: col, emissiveIntensity: 0.22 })
          );
          flag.rotation.x = Math.PI;
          flag.position.set(x, 11.2, z);
          g.add(flag);
        });
      });
      var balloonAt = [
        [150, 170], [330, 150], [490, 180], [670, 160],
        [160, 400], [640, 400],
        [150, 630], [330, 650], [490, 620], [670, 640],
        [400, 250], [400, 560],
        [300, 320], [500, 320], [300, 480], [500, 480]
      ];
      balloonAt.forEach(function (p, i) {
        var col = colors[i % colors.length];
        var b = new THREE.Group();
        var h = 20 + (i % 3) * 3;
        var balloon = new THREE.Mesh(
          new THREE.SphereGeometry(6.2, 12, 10),
          new THREE.MeshStandardMaterial({ color: col, roughness: 0.32, metalness: 0.04, emissive: col, emissiveIntensity: 0.28 })
        );
        balloon.scale.set(1, 1.22, 1);
        balloon.position.y = h;
        var string = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, h, 5),
          new THREE.MeshStandardMaterial({ color: 0xf7f1e6, roughness: 0.7 })
        );
        string.position.y = h / 2;
        b.add(string);
        b.add(balloon);
        b.position.set(p[0], 0, p[1]);
        g.add(b);
        g.userData.bits.push({ kind: 'balloon', obj: b, phase: i * 0.7 });
      });
      for (var c = 0; c < 12; c++) {
        var flake = new THREE.Mesh(
          new THREE.PlaneGeometry(3.4, 2.1),
          new THREE.MeshBasicMaterial({ color: colors[c % colors.length], side: THREE.DoubleSide, toneMapped: false })
        );
        flake.position.set(80 + (c * 53) % (size - 160), 22 + (c % 4) * 5, lines[c % lines.length] + ((c % 5) - 2) * 8);
        flake.rotation.x = -Math.PI / 2;
        g.add(flake);
        g.userData.bits.push({ kind: 'flake', obj: flake, spin: 0.4 + (c % 4) * 0.2, baseZ: flake.position.z });
      }
      for (var li2 = 0; li2 < 5; li2++) {
        var hue = li2 / 5;
        var light = new THREE.PointLight(0xff66aa, 160, 110, 2);
        light.color.setHSL(hue, 0.82, 0.55);
        var bulb = new THREE.Mesh(
          new THREE.SphereGeometry(7, 12, 10),
          new THREE.MeshBasicMaterial({ color: light.color.clone(), toneMapped: false })
        );
        var ang0 = li2 * (Math.PI * 2 / 5);
        var x0 = Math.max(40, Math.min(size - 40, me.x + Math.cos(ang0) * 128));
        var z0 = Math.max(40, Math.min(size - 40, me.y + Math.sin(ang0) * 128));
        light.position.set(x0, 34, z0);
        bulb.position.set(x0, 34, z0);
        g.add(light);
        g.add(bulb);
        g.userData.bits.push({
          kind: 'light',
          light: light,
          bulb: bulb,
          hue: hue,
          phase: li2 * (Math.PI * 2 / 5),
          r: 128
        });
      }
      worldRoot.add(g);
    }

    function tickPartyDecor() {
      if (!mapParty || !worldRoot) return;
      var g = worldRoot.getObjectByName('mv-party');
      if (!g || !g.userData.bits) return;
      var t = performance.now() * 0.001;
      var lim = (WORLD_BY_ID[currentWorld] || WORLDS[0]).size || 800;
      var cx = me.x;
      var cz = me.y;
      g.userData.bits.forEach(function (item) {
        if (item.kind === 'balloon') {
          item.obj.position.y = Math.sin(t * 1.15 + item.phase) * 1.4;
        } else if (item.kind === 'flake') {
          item.obj.rotation.z += item.spin * 0.02;
          item.obj.position.y -= 0.045;
          if (item.obj.position.y < 8) item.obj.position.y = 36;
        } else if (item.kind === 'light') {
          var ang = item.phase + t * 0.11;
          var x = Math.max(40, Math.min(lim - 40, cx + Math.cos(ang) * item.r));
          var z = Math.max(40, Math.min(lim - 40, cz + Math.sin(ang) * item.r));
          item.light.position.set(x, 34, z);
          item.bulb.position.set(x, 34, z);
          var hue = (item.hue + t * 0.045) % 1;
          item.light.color.setHSL(hue, 0.8, 0.54);
          item.bulb.material.color.setHSL(hue, 0.86, 0.6);
        }
      });
    }

    function buildWorld3D() {
      if (!THREE || !scene) return;
      clearWorldRoot();
      var wdef = WORLD_BY_ID[currentWorld] || WORLDS[0];
      var size = wdef.size || 800;
      worldRoot = new THREE.Group();
      worldRoot.name = 'world-' + currentWorld;

      if (hemiLight) {
        hemiLight.color.set(parseHexColor(wdef.bg, 0x88aacc));
        hemiLight.groundColor.set(parseHexColor(wdef.ground, 0x3d8f4a));
      }
      if (scene.fog) {
        scene.fog.color.set(parseHexColor(wdef.bg, 0x2d6b3a));
        scene.fog.near = 520;
        scene.fog.far = 1600;
      }
      scene.background = new THREE.Color(parseHexColor(wdef.bg, 0x2d6b3a));

      var ground = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size, 20, 20),
        new THREE.MeshStandardMaterial({
          color: parseHexColor(wdef.ground, 0x3d8f4a),
          roughness: 0.92,
          metalness: 0.02
        })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(size / 2, 0, size / 2);
      ground.receiveShadow = true;
      worldRoot.add(ground);

      // subtle grid helper as lines on ground
      var grid = new THREE.GridHelper(size, 20, 0xffffff, 0xffffff);
      var gm = grid.material;
      (Array.isArray(gm) ? gm : [gm]).forEach(function (mat) {
        mat.transparent = true;
        mat.opacity = 0.08;
      });
      grid.position.set(size / 2, 0.05, size / 2);
      worldRoot.add(grid);

      getDecor(currentWorld).forEach(function (d) {
        if (d.type === 'circle') {
          var disk = new THREE.Mesh(
            new THREE.CircleGeometry(d.r, 32),
            new THREE.MeshStandardMaterial({
              color: parseHexColor(d.fill, 0xc4b49a),
              roughness: 0.85
            })
          );
          disk.rotation.x = -Math.PI / 2;
          disk.position.set(d.x, 0.15, d.y);
          disk.receiveShadow = true;
          worldRoot.add(disk);
          if (String(d.fill || '').toLowerCase() === '#4a90d9') {
            var rim = new THREE.Mesh(
              new THREE.TorusGeometry(Math.max(4, d.r - 1), 1.5, 8, 24),
              new THREE.MeshStandardMaterial({ color: 0x9fd4ef, roughness: 0.35 })
            );
            rim.rotation.x = Math.PI / 2;
            rim.position.set(d.x, 1.15, d.y);
            worldRoot.add(rim);
          }
        } else if (d.type === 'rect') {
          var h = Math.max(22, (d.h || 40) * 1.1);
          var box = new THREE.Mesh(
            new THREE.BoxGeometry(d.w || 40, h, Math.max(20, (d.h || 40) * 0.85)),
            new THREE.MeshStandardMaterial({
              color: parseHexColor(d.fill, 0x5a6574),
              roughness: 0.7,
              metalness: 0.05
            })
          );
          box.position.set(d.x + (d.w || 40) / 2, h / 2, d.y + (d.h || 40) / 2);
          box.castShadow = true;
          box.receiveShadow = true;
          worldRoot.add(box);
          if (currentWorld === 'ciudad' && (d.h || 0) >= 90) {
            addCityFacade(box, d.w || 40, h, Math.max(20, (d.h || 40) * 0.85));
          }
        } else if (d.type === 'tree') {
          addTree(worldRoot, d.x, d.y);
        } else if (d.type === 'path') {
          addFlatPath(worldRoot, d);
        } else if (d.type === 'bench') {
          addBench(worldRoot, d);
        } else if (d.type === 'lamp') {
          addLamp(worldRoot, d);
        } else if (d.type === 'fountain') {
          addFountain(worldRoot, d);
        } else if (d.type === 'stall') {
          addStall(worldRoot, d);
        } else if (d.type === 'bush') {
          addBush(worldRoot, d);
        } else if (d.type === 'flower') {
          addFlower(worldRoot, d);
        }
      });

      roomsForWorld(currentWorld).forEach(function (r) {
        var marker = new THREE.Group();
        var pad = new THREE.Mesh(
          new THREE.CylinderGeometry(24, 24, 2, 24),
          new THREE.MeshStandardMaterial({ color: 0x1a3d2a, emissive: 0x0a2818, roughness: 0.6 })
        );
        pad.position.y = 1;
        marker.add(pad);
        var pole = new THREE.Mesh(
          new THREE.CylinderGeometry(2, 2, 36, 8),
          new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.4, roughness: 0.4 })
        );
        pole.position.y = 20;
        marker.add(pole);
        var tex = makeEmojiTexture(r.emoji || '📍', 128);
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
        sp.scale.set(28, 28, 28);
        sp.position.y = 48;
        marker.add(sp);
        var glow = new THREE.Mesh(
          new THREE.RingGeometry(22, 28, 32),
          new THREE.MeshBasicMaterial({
            color: 0x34d17a, transparent: true, opacity: 0.35, side: THREE.DoubleSide
          })
        );
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = 2.2;
        glow.userData.isRoomGlow = true;
        marker.add(glow);
        marker.position.set(r.x, 0, r.y);
        marker.userData.roomId = r.id;
        worldRoot.add(marker);
        roomMarkers[r.id] = marker;
        var labelTxt = (r.emoji || '') + ' ' + r.name;
        ensureNameLabel('room:' + r.id, labelTxt);
      });

      scene.add(worldRoot);
      syncPartyDecor();
      syncBoneMeshes();
      ensureAvatarMeshes();
    }

    function syncBoneMeshes() {
      if (!THREE || !worldRoot) return;
      var seen = {};
      bones.forEach(function (b) {
        seen[b.id] = true;
        var g = boneMeshes[b.id];
        if (!g) {
          var tex = makeEmojiTexture('🪙', 96);
          var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
          spr.scale.set(20, 20, 20);
          var halo = new THREE.Mesh(
            new THREE.RingGeometry(10, 14, 20),
            new THREE.MeshBasicMaterial({ color: 0xffc850, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
          );
          halo.rotation.x = -Math.PI / 2;
          g = new THREE.Group();
          g.add(spr);
          g.add(halo);
          g.userData.sprite = spr;
          g.userData.halo = halo;
          boneMeshes[b.id] = g;
          worldRoot.add(g);
        }
        boneMeshes[b.id].position.set(b.x, 14, b.y);
      });
      Object.keys(boneMeshes).forEach(function (id) {
        if (!seen[id]) {
          worldRoot.remove(boneMeshes[id]);
          disposeObject3D(boneMeshes[id]);
          delete boneMeshes[id];
        }
      });
    }

    function dropAvatarMesh(email) {
      var mesh = avatarMeshes[email];
      if (!mesh) return;
      try { if (scene) scene.remove(mesh); disposeObject3D(mesh); } catch (eDrop) {}
      delete avatarMeshes[email];
      delete emoteApplied[email];
    }

    function ensureAvatarMeshes() {
      if (!THREE || !scene) return;
      function syncOne(email, avatar, isMe, look) {
        var custom = !!(look && look.skin);
        var key = 'legacy';
        if (custom) {
          var n = normalizeLook(look);
          key = n.skin + '|' + n.hair + '|' + n.shirt + '|' + n.hat;
        }
        var mesh = avatarMeshes[email];
        if (!mesh || mesh.userData.lookKey !== key) {
          if (mesh) {
            try { scene.remove(mesh); disposeObject3D(mesh); } catch (eM) {}
            delete emoteApplied[email];
          }
          mesh = makeAvatarMesh(email, avatar, isMe, custom ? look : null);
          avatarMeshes[email] = mesh;
          scene.add(mesh);
        }
      }
      syncOne(user.email, myAvatar(), true, myLook);
      ensurePlayerLabel(user.email, (user.name || 'tú') + ' (tú)', myAvatar());
      Object.keys(players).forEach(function (email) {
        if (email === user.email) return;
        var p = players[email];
        if (!p) return;
        syncOne(email, p.avatar, false, (p.look && p.look.skin) ? p.look : null);
        ensurePlayerLabel(email, (p.name || email) + (p.bot ? ' · IA' : ''), p.avatar || '🐶', p.pro === true && !p.bot);
      });
      Object.keys(avatarMeshes).forEach(function (email) {
        if (email !== user.email && !players[email]) {
          scene.remove(avatarMeshes[email]);
          disposeObject3D(avatarMeshes[email]);
          delete avatarMeshes[email];
          removeNameLabel(email);
          delete emoteApplied[email];
        }
      });
    }

    function setEmoteOnMesh(email, emoji) {
      var mesh = avatarMeshes[email];
      if (!mesh || !THREE) return;
      var key = emoji || '';
      if (emoteApplied[email] === key) return;
      emoteApplied[email] = key;
      if (mesh.userData.emoteSprite) {
        mesh.remove(mesh.userData.emoteSprite);
        disposeObject3D(mesh.userData.emoteSprite);
        mesh.userData.emoteSprite = null;
      }
      if (!emoji) return;
      var tex = makeEmojiTexture(emoji, 96);
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      sp.scale.set(18, 18, 18);
      sp.position.set(16, 56, 0);
      mesh.add(sp);
      mesh.userData.emoteSprite = sp;
    }

    function syncParticleMeshes() {
      if (!THREE || !scene) return;
      while (particleMeshes.length < particles.length) {
        var m = new THREE.Mesh(
          new THREE.SphereGeometry(3, 6, 6),
          new THREE.MeshBasicMaterial({ transparent: true })
        );
        scene.add(m);
        particleMeshes.push(m);
      }
      for (var i = 0; i < particleMeshes.length; i++) {
        var mesh = particleMeshes[i];
        var p = particles[i];
        if (!p) { mesh.visible = false; continue; }
        mesh.visible = true;
        mesh.position.set(p.x, 12 + Math.max(0, 20 + p.vy * -0.02), p.y);
        mesh.material.color.setHex(p.hex || 0xffd56a);
        mesh.material.opacity = Math.max(0, p.life);
      }
    }

    function initThree() {
      return loadThree().then(function (T) {
        if (closed) return;
        THREE = T;
        renderer = new THREE.WebGLRenderer({
          canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance'
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
        else if (renderer.outputEncoding != null && THREE.sRGBEncoding != null) renderer.outputEncoding = THREE.sRGBEncoding;
        if (THREE.ACESFilmicToneMapping) {
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.12;
        }
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x2d6b3a);
        scene.fog = new THREE.Fog(0x2d6b3a, 200, 1400);
        camera = new THREE.PerspectiveCamera(58, 1, 2, 2500);
        /* Vista inicial desde arriba: norte de pantalla = -Z. */
        camera.up.set(0, 0, -1);
        camera.position.set(me.x, 280, me.y + 0.01);
        camera.lookAt(me.x, 0, me.y);
        camera.userData.look = { x: me.x, y: 0, z: me.y };
        hemiLight = new THREE.HemisphereLight(0xb1e1ff, 0x3d8f4a, 0.85);
        scene.add(hemiLight);
        dirLight = new THREE.DirectionalLight(0xfff2d6, 0.95);
        dirLight.position.set(200, 320, 120);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(1024, 1024);
        dirLight.shadow.camera.near = 10;
        dirLight.shadow.camera.far = 1200;
        dirLight.shadow.camera.left = -400;
        dirLight.shadow.camera.right = 400;
        dirLight.shadow.camera.top = 400;
        dirLight.shadow.camera.bottom = -400;
        scene.add(dirLight);
        scene.add(new THREE.AmbientLight(0xffffff, 0.22));
        raycaster = new THREE.Raycaster();
        worldPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        threeReady = true;
        resize();
        buildWorld3D();
        ensureAvatarMeshes();
      }).catch(function (err) {
        console.error(err);
        setStatus('Error cargando Three.js');
      });
    }

    function armMouseAllowed() {
      if (mvIsPhoneMode()) return false;
      var coarse = false;
      var fine = false;
      try { coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (eC) {}
      try { fine = !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches); } catch (eF) {}
      if (coarse && !fine) return false;
      if (!fine) return false;
      return true;
    }

    /* Mouse on desktop, red stick on phone. Both hold the last aim. */
    function armControlLive() {
      if (!armAim.live) return false;
      if (armMouseAllowed()) return true;
      return !!(armStickHeld && mvIsPhoneMode());
    }

    function resetArmReach(armPivot) {
      if (!armPivot || !armPivot.userData || !armPivot.userData.limb) return;
      var len = armPivot.userData.baseLen || 15;
      var radius = armPivot.userData.radius || 2.4;
      var limb = armPivot.userData.limb;
      limb.scale.set(1, 1, 1);
      limb.position.y = -(len * 0.5 + radius);
    }

    function aimArmAtWorld(mesh, armPivot, wx, wy, wz) {
      if (!mesh || !armPivot || !THREE) return null;
      mesh.updateMatrixWorld(true);
      var shoulder = new THREE.Vector3();
      armPivot.getWorldPosition(shoulder);
      var target = new THREE.Vector3(wx, wy, wz);
      var dist = shoulder.distanceTo(target);
      if (dist < 0.001) return null;
      var dirWorld = target.clone().sub(shoulder).normalize();
      /* Convertir dirección a espacio local del avatar (padre del pivot). */
      var parent = armPivot.parent || mesh;
      var qParent = new THREE.Quaternion();
      parent.getWorldQuaternion(qParent);
      var dirLocal = dirWorld.clone().applyQuaternion(qParent.clone().invert()).normalize();
      var down = new THREE.Vector3(0, -1, 0);
      if (dirLocal.lengthSq() < 1e-6) return null;
      armPivot.quaternion.setFromUnitVectors(down, dirLocal);
      armPivot.rotation.setFromQuaternion(armPivot.quaternion);
      /* Longitud fija: solo apunta, nunca se estira hacia el puntero. */
      resetArmReach(armPivot);
      return {
        x: +armPivot.rotation.x,
        y: +armPivot.rotation.y,
        z: +armPivot.rotation.z,
        s: 1,
        tx: +wx.toFixed(2),
        ty: +wy.toFixed(2),
        tz: +wz.toFixed(2)
      };
    }

    function applyRemoteArm(armPivot, remoteArm) {
      if (!armPivot || !remoteArm) return;
      if (remoteArm.tx != null && remoteArm.ty != null && remoteArm.tz != null && armPivot.parent) {
        aimArmAtWorld(armPivot.parent, armPivot, +remoteArm.tx, +remoteArm.ty, +remoteArm.tz);
        return;
      }
      armPivot.rotation.x = +remoteArm.x || 0;
      armPivot.rotation.y = +remoteArm.y || 0;
      armPivot.rotation.z = +remoteArm.z || 0;
      resetArmReach(armPivot);
    }

    function poseLimbs(mesh, moving, isMe, nowP, email) {
      if (!mesh || !mesh.userData) return;
      var legL = mesh.userData.legL;
      var legR = mesh.userData.legR;
      var armL = mesh.userData.armL;
      var armR = mesh.userData.armR;
      if (!legL || !legR || !armL || !armR) return;
      var swing = moving ? Math.sin(nowP / 150) * 0.65 : Math.sin(nowP / 900) * 0.05;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.8;
      armL.rotation.y = 0;
      armL.rotation.z = 0.22;
      var remoteArm = (!isMe && email && remotePos[email]) ? remotePos[email].arm : null;
      /* Brazo izquierdo en 1ª persona: pose de listo. */
      if (isMe && firstPerson) {
        armL.rotation.x = -0.55 + swing * 0.15;
        armL.rotation.y = 0.12;
        armL.rotation.z = 0.35;
        resetArmReach(armL);
      }
      if (isMe && firstPerson && fpPointerLocked) {
        /* Apuntar al centro de la mira. */
        var ey = 42.2 + meEyeLift();
        var py = fpLook.pitch;
        var yy = fpLook.yaw;
        var cpy = Math.cos(py), spy = Math.sin(py);
        var fxx = Math.cos(yy), fzz = Math.sin(yy);
        var axw = me.x + fxx * cpy * 90;
        var ayw = ey + spy * 90;
        var azw = me.y + fzz * cpy * 90;
        armAim.wx = axw; armAim.wy = ayw; armAim.wz = azw;
        armAim.live = true;
        var posedLock = aimArmAtWorld(mesh, armR, axw, ayw, azw);
        if (posedLock) armNet = posedLock;
      } else if (isMe && armControlLive() && armAim.wx != null) {
        var posed = aimArmAtWorld(mesh, armR, armAim.wx, armAim.wy, armAim.wz);
        if (posed) armNet = posed;
      } else if (isMe && armControlLive()) {
        /* Fallback NDC (stick móvil) */
        var ax = Math.max(-1, Math.min(1, armAim.x));
        var ay = Math.max(-1, Math.min(1, armAim.y));
        armR.rotation.x = -0.25 - ay * 1.35;
        armR.rotation.y = ax * 0.85;
        armR.rotation.z = -0.15 - ax * 0.95;
        resetArmReach(armR);
        armNet = { x: armR.rotation.x, y: armR.rotation.y, z: armR.rotation.z, s: 1 };
      } else if (remoteArm) {
        applyRemoteArm(armR, remoteArm);
      } else {
        armR.rotation.set(0, 0, 0);
        armR.rotation.x = swing * 0.8;
        armR.rotation.z = -0.22;
        resetArmReach(armR);
        if (isMe) armNet = null;
      }
      try { mvxPoseGestureArms(mesh, email, isMe, nowP); } catch (eMvxArm) {}
    }

    function updateAvatarPose(mesh, x, y, ry, email, isMe) {
      if (!mesh) return;
      var extraY = 0;
      var spin = 0;
      var nowP = performance.now();
      if (isMe) {
        if (funUntil.jump > nowP) {
          var jt = (funUntil.jump - nowP) / 900;
          extraY = Math.sin((1 - jt) * Math.PI) * 34;
        }
        if (funUntil.rocket > nowP) extraY += 18 + Math.sin(nowP / 80) * 4;
        if (funUntil.dance > nowP) spin = Math.sin(nowP / 120) * 0.55;
      } else {
        var mvxRg = mvxRemoteGesture(email, nowP);
        if (mvxRg) { extraY = mvxRg.y; spin = mvxRg.spin; }
      }
      mesh.position.set(x, extraY, y);
      mesh.rotation.y = -ry + Math.PI / 2 + spin;
      var speaking = email && speakingUntil[email] && speakingUntil[email] > nowP;
      if (mesh.userData.ring) {
        mesh.userData.ring.material.opacity = speaking ? 0.9 : 0;
        if (speaking) {
          var pulse = 1 + Math.sin(nowP / 120) * 0.12;
          mesh.userData.ring.scale.set(pulse, pulse, 1);
        }
      }
      var moving = false;
      if (isMe) {
        var movingStick = Math.hypot(stickVec.x, stickVec.y) > stickDead;
        moving = !!(keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD'] ||
          keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight'] || movingStick);
        if (funUntil.dance > nowP) moving = true;
      } else {
        var mvxRg2 = mvxRemoteGesture(email, nowP);
        if (mvxRg2 && mvxRg2.moving) moving = true;
      }
      if (!moving && email && players[email] && players[email].bot) {
        var rpB = remotePos[email];
        if (rpB && Math.hypot(rpB.vx || 0, rpB.vy || 0) > 8) moving = true;
        else if (rpB && Math.hypot(rpB.cvx || 0, rpB.cvy || 0) > 8) moving = true;
        else if (rpB && Math.hypot((rpB.tx || 0) - rpB.x, (rpB.ty || 0) - rpB.y) > 2) moving = true;
      }
      var bounce = Math.sin(nowP / 180 + x) * (moving ? 2.2 : 0.4);
      if (isMe && funUntil.dance > nowP) bounce += Math.sin(nowP / 90) * 4;
      if (mesh.userData.body) mesh.userData.body.position.y = (mesh.userData.bodyRest || 18) + bounce;
      poseLimbs(mesh, moving, !!isMe, nowP, email);
      if (isMe) {
        if (firstPerson) {
          mesh.visible = true;
          if (mesh.userData.body) mesh.userData.body.visible = false;
          if (mesh.userData.headPivot) mesh.userData.headPivot.visible = false;
          if (mesh.userData.legL) mesh.userData.legL.visible = false;
          if (mesh.userData.legR) mesh.userData.legR.visible = false;
          if (mesh.userData.sprite) mesh.userData.sprite.visible = false;
          if (mesh.userData.ring) mesh.userData.ring.visible = false;
          if (mesh.userData.emoteSprite) mesh.userData.emoteSprite.visible = false;
          /* Brazos a la vista, adelantados y más cerca del encuadre. */
          if (mesh.userData.armL) {
            mesh.userData.armL.visible = true;
            mesh.userData.armL.position.set(5.2, 27.5, 7.5);
          }
          if (mesh.userData.armR) {
            mesh.userData.armR.visible = true;
            mesh.userData.armR.position.set(-5.2, 27.5, 7.5);
          }
        } else {
          mesh.visible = true;
          if (mesh.userData.body) mesh.userData.body.visible = true;
          if (mesh.userData.headPivot) mesh.userData.headPivot.visible = true;
          if (mesh.userData.armL) {
            mesh.userData.armL.visible = true;
            var rpL = mesh.userData.armL.userData.restPos;
            if (rpL) mesh.userData.armL.position.set(rpL.x, rpL.y, rpL.z);
          }
          if (mesh.userData.armR) {
            mesh.userData.armR.visible = true;
            var rpR = mesh.userData.armR.userData.restPos;
            if (rpR) mesh.userData.armR.position.set(rpR.x, rpR.y, rpR.z);
          }
          if (mesh.userData.legL) mesh.userData.legL.visible = true;
          if (mesh.userData.legR) mesh.userData.legR.visible = true;
          if (mesh.userData.sprite) mesh.userData.sprite.visible = true;
          if (mesh.userData.ring) mesh.userData.ring.visible = true;
        }
      }
    }

    function updateLabels() {
      Object.keys(avatarMeshes).forEach(function (email) {
        var mesh = avatarMeshes[email];
        var el = nameLabels[email];
        if (!mesh || !el) return;
        if (firstPerson && email === user.email) { el.style.visibility = 'hidden'; return; }
        el.style.visibility = '';
        if (el._avEl) setHeadAvatar(el, email === user.email ? myAvatar() : ((players[email] && players[email].avatar) || '🐶'));
        projectLabel(el, mesh.position.x, 58, mesh.position.z);
      });
      roomsForWorld(currentWorld).forEach(function (r) {
        var el = nameLabels['room:' + r.id];
        if (!el) return;
        projectLabel(el, r.x, 56, r.y);
      });
    }

    function render3D(dt) {
      if (!threeReady || !renderer || !scene || !camera) return;
      var t = performance.now() / 400;
      Object.keys(boneMeshes).forEach(function (id) {
        var g = boneMeshes[id];
        var b = null;
        for (var i = 0; i < bones.length; i++) if (String(bones[i].id) === String(id)) { b = bones[i]; break; }
        if (!b || !g) return;
        var bob = Math.sin(t + b.x * 0.05) * 4;
        g.position.set(b.x, 14 + bob, b.y);
        if (g.userData.halo) {
          var s = 1 + Math.sin(t * 2) * 0.08;
          g.userData.halo.scale.set(s, s, 1);
        }
      });

      Object.keys(roomMarkers).forEach(function (rid) {
        var m = roomMarkers[rid];
        if (!m) return;
        var active = currentRoom === rid;
        m.scale.setScalar(active ? 1.12 : 1);
        m.traverse(function (ch) {
          if (ch.userData && ch.userData.isRoomGlow && ch.material) {
            ch.material.opacity = active ? 0.75 : 0.35;
            ch.material.color.setHex(active ? 0x34d17a : 0x88aacc);
          }
        });
      });

      ensureAvatarMeshes();
      updateAvatarPose(avatarMeshes[user.email], me.x, me.y, me.ry, user.email, true);
      applyProFxToMesh(avatarMeshes[user.email], user.email, performance.now());
      Object.keys(remotePos).forEach(function (email) {
        var rp = remotePos[email];
        var mesh = avatarMeshes[email];
        if (!rp || !mesh) return;
        updateAvatarPose(mesh, rp.x, rp.y, rp.ry, email, false);
        applyProFxToMesh(mesh, email, performance.now());
      });

      if (myEmote && performance.now() < myEmoteUntil) setEmoteOnMesh(user.email, myEmote);
      else setEmoteOnMesh(user.email, null);
      Object.keys(floaters).forEach(function (email) {
        if (email === user.email) return;
        var f = floaters[email];
        if (f && performance.now() < f.until) setEmoteOnMesh(email, f.emoji);
        else setEmoteOnMesh(email, null);
      });

      syncParticleMeshes();

      /* Camera: behind (3D), first person, or top-down. */
      firstPerson = (viewMode === 'first');
      var yaw = me.ry || 0;
      var fx = Math.cos(yaw);
      var fz = Math.sin(yaw);
      var wantX, wantY, wantZ, lookX, lookY, lookZ;
      if (viewMode === 'first') {
        /* 1ª persona: mirada con ratón (yaw/pitch), bob natural, horizonte correcto. */
        if (fpPointerLocked) {
          me.ry = fpLook.yaw;
        } else if (armAim.live) {
          /* Sin lock: offset sobre el rumbo del cuerpo (no acumular). */
          fpLook.yaw = (me.ry || 0) + armAim.x * 0.72;
          fpLook.pitch = Math.max(-1.15, Math.min(1.05, -armAim.y * 0.95));
        } else {
          fpLook.yaw = me.ry || 0;
          fpLook.pitch *= 0.9;
        }
        yaw = fpLook.yaw;
        fx = Math.cos(yaw);
        fz = Math.sin(yaw);
        var pitch = fpLook.pitch;
        var cp = Math.cos(pitch);
        var sp = Math.sin(pitch);
        var movingFp = !!(keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD'] ||
          keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight'] ||
          Math.hypot(stickVec.x, stickVec.y) > stickDead);
        var nowFp = performance.now();
        var bobY = 0, bobX = 0, bobZ = 0;
        if (movingFp) {
          var ph = nowFp / 145;
          bobY = Math.sin(ph) * 1.15;
          bobX = Math.cos(ph * 0.5) * 0.35;
          bobZ = Math.sin(ph * 0.5) * 0.35;
        } else {
          bobY = Math.sin(nowFp / 900) * 0.18;
        }
        var eyeH = 42.2 + meEyeLift() + bobY;
        var eyeForward = 2.4;
        var rx = -fz, rz = fx; /* right vector */
        wantX = me.x + fx * eyeForward + rx * bobX;
        wantY = eyeH;
        wantZ = me.y + fz * eyeForward + rz * bobZ;
        var lookDist = 160;
        lookX = wantX + fx * cp * lookDist;
        lookY = wantY + sp * lookDist;
        lookZ = wantZ + fz * cp * lookDist;
        camera.up.set(0, 1, 0);
      } else if (viewMode === 'top') {
        /* Vista desde arriba fija (como el punto rojo): norte de pantalla = -Z mundo. */
        var topH = 280;
        wantX = me.x;
        wantY = topH + meEyeLift() * 0.35;
        wantZ = me.y + 0.01;
        lookX = me.x;
        lookY = 0;
        lookZ = me.y;
        camera.up.set(0, 0, -1);
      } else {
        var backDist = 82;
        var camHeight = 38;
        var lookAhead = 36;
        var lookHeight = 18;
        wantX = me.x - fx * backDist;
        wantY = camHeight;
        wantZ = me.y - fz * backDist;
        lookX = me.x + fx * lookAhead;
        lookY = lookHeight;
        lookZ = me.y + fz * lookAhead;
        camera.up.set(0, 1, 0);
      }
      var gap = Math.hypot(wantX - camera.position.x, wantY - camera.position.y, wantZ - camera.position.z);
      /* 1ª persona: sin suavizado (más precisa). Otras vistas: lerp suave. */
      var k;
      if (viewMode === 'first' || viewSnap || gap > 420) k = 1;
      else k = Math.min(1, dt * 6);
      camera.position.x += (wantX - camera.position.x) * k;
      camera.position.y += (wantY - camera.position.y) * k;
      camera.position.z += (wantZ - camera.position.z) * k;
      if (!camera.userData.look) camera.userData.look = { x: lookX, y: lookY, z: lookZ };
      var lk;
      if (viewMode === 'first' || viewSnap || gap > 420) lk = 1;
      else lk = Math.min(1, dt * 8);
      camera.userData.look.x += (lookX - camera.userData.look.x) * lk;
      camera.userData.look.y += (lookY - camera.userData.look.y) * lk;
      camera.userData.look.z += (lookZ - camera.userData.look.z) * lk;
      camera.lookAt(camera.userData.look.x, camera.userData.look.y, camera.userData.look.z);
      if (viewSnap) viewSnap = false;

      if (dirLight) {
        dirLight.position.set(me.x + 120, 280, me.y - 80);
        dirLight.target.position.set(me.x, 0, me.y);
        if (!dirLight.target.parent) scene.add(dirLight.target);
      }

      // keep 2d cam in sync for any leftover math
      cam.x = me.x;
      cam.y = me.y;

      if (camera) {
        var wantFov = viewMode === 'first' ? 66 : (viewMode === 'top' ? 58 : 50);
        var wantNear = viewMode === 'first' ? 0.55 : 2;
        var changed = false;
        if (Math.abs((camera.fov || 50) - wantFov) > 0.1) {
          camera.fov = wantFov;
          changed = true;
        }
        if (Math.abs((camera.near || 2) - wantNear) > 0.01) {
          camera.near = wantNear;
          changed = true;
        }
        if (changed) camera.updateProjectionMatrix();
      }
      if (scene && scene.fog) {
        if (viewMode === 'first') {
          scene.fog.near = 380;
          scene.fog.far = 1750;
        } else if (viewMode === 'top') {
          scene.fog.near = 200;
          scene.fog.far = 1400;
        } else {
          scene.fog.near = 520;
          scene.fog.far = 1600;
        }
      }
      updateLabels();
      try { mvxFrame(dt); } catch (eMvxFrame) {}
      tickPartyDecor();
      renderer.render(scene, camera);
    }


    function resize() {
      if (!root || !canvas) return;
      var stage = root.querySelector('.mv-stage');
      cssW = stage.clientWidth || 320;
      cssH = stage.clientHeight || 240;
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      if (renderer && camera) {
        renderer.setSize(cssW, cssH, false);
        camera.aspect = cssW / Math.max(1, cssH);
        camera.updateProjectionMatrix();
      }
    }

    function armDelta(a, b) {
      if (!a || !b) return 99;
      return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
    }

    function cameraLookYaw() {
      /* 1ª persona: rumbo de la mirada; arriba: rumbo del avatar. */
      if (viewMode === 'first') return fpLook.yaw || me.ry || 0;
      if (viewMode === 'top') return me.ry || 0;
      if (camera && camera.userData && camera.userData.look) {
        var lx = camera.userData.look.x - camera.position.x;
        var lz = camera.userData.look.z - camera.position.z;
        if (lx * lx + lz * lz > 0.04) return Math.atan2(lz, lx);
      }
      return me.ry || 0;
    }

    function meEyeLift() {
      var extraY = 0;
      var nowP = performance.now();
      if (funUntil.jump > nowP) {
        var jt = (funUntil.jump - nowP) / 900;
        extraY = Math.sin((1 - jt) * Math.PI) * 34;
      }
      if (funUntil.rocket > nowP) extraY += 18 + Math.sin(nowP / 80) * 4;
      return extraY;
    }

    function sendMove(force) {
      if (!ws || ws.readyState !== 1) return;
      var now = performance.now();
      var moveDue = !!(force || (now - lastMoveSent >= 50));
      var armChanged = !!(armNet && armControlLive() && armDelta(armNet, lastArmPacked) > 0.04);
      var armDue = !!(armChanged && (force || now - lastArmSentAt >= 100));
      if (!moveDue && !armDue) return;
      /* Position stays on the existing ~20 Hz throttle. Arm rides along, and arm-only waves cap at 10 Hz. */
      if (moveDue) lastMoveSent = now;
      var payload = {
        type: 'move', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: 0,
        ry: +me.ry.toFixed(3), room: currentRoom
      };
      if (armNet && armControlLive() && (armDue || (moveDue && now - lastArmSentAt >= 100))) {
        payload.arm = {
          x: +(+armNet.x).toFixed(3),
          y: +(+armNet.y).toFixed(3),
          z: +(+armNet.z).toFixed(3),
          s: 1,
          tx: armNet.tx != null ? +(+armNet.tx).toFixed(2) : undefined,
          ty: armNet.ty != null ? +(+armNet.ty).toFixed(2) : undefined,
          tz: armNet.tz != null ? +(+armNet.tz).toFixed(2) : undefined
        };
        lastArmPacked = { x: payload.arm.x, y: payload.arm.y, z: payload.arm.z };
        lastArmSentAt = now;
      }
      ws.send(JSON.stringify(payload));
      if (moveDue) scheduleProgressSave();
    }

    function tryCollect() {
      var now = performance.now();
      if (now - lastCollectTry < 120 || !ws || ws.readyState !== 1) return;
      var magnetOn = funUntil.magnet > now;
      var collectR = magnetOn ? 92 : 28;
      for (var i = 0; i < bones.length; i++) {
        var b = bones[i];
        if (Math.hypot(me.x - b.x, me.y - b.y) < collectR) {
          lastCollectTry = now;
          ws.send(JSON.stringify({ type: 'collect', id: b.id }));
          return;
        }
      }
    }

    function tryHighfive() {
      var now = performance.now();
      if (now - lastHighfive < 1500 || !ws || ws.readyState !== 1) return;
      var emails = Object.keys(players);
      for (var i = 0; i < emails.length; i++) {
        var p = players[emails[i]];
        var rp = remotePos[emails[i]];
        if (!p || !rp || p.email === user.email || p.bot) continue;
        if (Math.hypot(me.x - rp.x, me.y - rp.y) < 40) {
          lastHighfive = now;
          ws.send(JSON.stringify({ type: 'highfive', to: p.email }));
          return;
        }
      }
    }

    function animate(ts) {
      if (closed) return;
      animId = requestAnimationFrame(animate);
      var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
      lastTs = ts;
      var sprint = keys['ShiftLeft'] || keys['ShiftRight'];
      var nowSp = performance.now();
      var speed = sprint ? 240 : 160;
      if (funUntil.turbo > nowSp) speed *= 1.85;
      if (funUntil.rocket > nowSp) speed *= 2.4;
      /* Movimiento simple (como punto-rojo): flechas/WASD cada frame, sin bloquear dirección. */
      var ix = 0, iy = 0;
      if (keys['KeyW'] || keys['ArrowUp']) iy += 1;
      if (keys['KeyS'] || keys['ArrowDown']) iy -= 1;
      if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
      var sMag = Math.hypot(stickVec.x, stickVec.y);
      if (sMag > 0.08) {
        ix += stickVec.x;
        iy += -stickVec.y;
      }
      if (ix || iy) {
        var len = Math.hypot(ix, iy) || 1;
        ix /= len; iy /= len;
        var moveX, moveZ;
        if (viewMode === 'top') {
          /* Vista arriba: ejes fijos de pantalla → mundo (igual que el punto rojo). */
          moveX = ix;
          moveZ = -iy;
        } else {
          /* 3D: adelante = hacia donde mira la cámara ahora (sin congelar). */
          var basis = cameraLookYaw();
          var fxm = Math.cos(basis);
          var fzm = Math.sin(basis);
          moveX = iy * fxm + ix * (-fzm);
          moveZ = iy * fzm + ix * fxm;
        }
        me.x += moveX * speed * dt;
        me.y += moveZ * speed * dt;
        if (viewMode === 'first') {
          if (fpPointerLocked) me.ry = fpLook.yaw;
          else if (Math.hypot(moveX, moveZ) > 0.001) me.ry = Math.atan2(moveZ, moveX);
        } else if (Math.hypot(moveX, moveZ) > 0.001) {
          me.ry = Math.atan2(moveZ, moveX);
        }
        var lim = (WORLD_BY_ID[currentWorld] || WORLDS[0]).size || 800;
        me.x = Math.max(20, Math.min(lim - 20, me.x));
        me.y = Math.max(20, Math.min(lim - 20, me.y));
        sendMove(false);
        scheduleProgressSave();
        tryCollect();
        tryHighfive();
      } else {
        tryCollect();
        if (armNet && armControlLive() && (performance.now() - lastArmSentAt) >= 100 && armDelta(armNet, lastArmPacked) > 0.04) {
          sendMove(true);
        }
      }

      Object.keys(remotePos).forEach(function (email) {
        var rp = remotePos[email];
        var pose = players[email];
        var isBot = !!(rp.bot || (pose && pose.bot) || String(email).indexOf("ai-bot:") === 0);
        if (isBot && (typeof rp.vx === "number" || typeof rp.vy === "number")) {
          /* Integrate the last non-zero velocity every frame. Do not freeze after 0.2s or snap. */
          var bvx = rp.vx || 0;
          var bvy = rp.vy || 0;
          if (Math.hypot(bvx, bvy) < 1 && Math.hypot(rp.cvx || 0, rp.cvy || 0) >= 1) {
            bvx = rp.cvx;
            bvy = rp.cvy;
          } else if (Math.hypot(bvx, bvy) >= 1) {
            rp.cvx = bvx;
            rp.cvy = bvy;
          }
          var age = Math.min(1.25, Math.max(0, (performance.now() - (rp.at || performance.now())) / 1000));
          rp.x += bvx * dt;
          rp.y += bvy * dt;
          var predX = rp.tx + bvx * age;
          var predY = rp.ty + bvy * age;
          var ex = predX - rp.x;
          var ey = predY - rp.y;
          var err = Math.hypot(ex, ey);
          if (err > 480) {
            rp.x = predX;
            rp.y = predY;
          } else if (err > 0.4) {
            var corr = Math.min(err, 36 * dt);
            rp.x += (ex / err) * corr;
            rp.y += (ey / err) * corr;
          }
          rp.x = pullBotCoord(rp.x);
          rp.y = pullBotCoord(rp.y);
          rp.tx = pullBotCoord(rp.tx);
          rp.ty = pullBotCoord(rp.ty);
        } else {
          rp.x += (rp.tx - rp.x) * Math.min(1, dt * 12);
          rp.y += (rp.ty - rp.y) * Math.min(1, dt * 12);
        }
        var diff = rp.try - rp.ry;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        rp.ry += diff * Math.min(1, dt * 10);
      });

      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 180 * dt;
        if (p.life <= 0) particles.splice(i, 1);
      }

      cam.x += (me.x - cam.x) * Math.min(1, dt * 8);
      cam.y += (me.y - cam.y) * Math.min(1, dt * 8);
      var speakBefore = JSON.stringify(speakingUntil);
      tickSpeaking();
      if (speakBefore !== JSON.stringify(speakingUntil)) renderOnline();
      if (threeReady) {
        syncBoneMeshes();
        render3D(dt);
      }
    }

    function onKeyDown(e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      keys[e.code] = true;
      if (e.code === 'KeyE') sendEmote(EMOTES[Math.floor(Math.random() * EMOTES.length)]);
      if (e.code === 'Space') {
        e.preventDefault();
        if (performance.now() > funUntil.jump - 200) triggerFun('jump');
      }
      if (e.code === 'KeyF') {
        e.preventDefault();
        triggerFun('mystery');
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
    }
    function onKeyUp(e) { keys[e.code] = false; }

    function worldFromClient(clientX, clientY) {
      if (!threeReady || !camera || !raycaster || !worldPlane) {
        var rect0 = canvas.getBoundingClientRect();
        var mx = clientX - rect0.left;
        var my = clientY - rect0.top;
        return { x: mx - cssW / 2 + cam.x, y: my - cssH / 2 + cam.y };
      }
      var rect = canvas.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      var hitPt = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(worldPlane, hitPt)) {
        return { x: hitPt.x, y: hitPt.z };
      }
      return null;
    }

    /** Punto 3D bajo el puntero (suelo o lejos en el rayo) para extender el brazo. */
    function aimPointFromClient(clientX, clientY) {
      if (!threeReady || !camera || !raycaster) {
        var w2 = worldFromClient(clientX, clientY);
        if (!w2) return null;
        return { x: w2.x, y: 18, z: w2.y };
      }
      var rect = canvas.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      var hitPt = new THREE.Vector3();
      if (worldPlane && raycaster.ray.intersectPlane(worldPlane, hitPt)) {
        /* Un poco por encima del suelo para no apuntar a los pies. */
        return { x: hitPt.x, y: 14, z: hitPt.z };
      }
      /* Cielo / sin hit: punto a lo largo del rayo. */
      var far = new THREE.Vector3();
      raycaster.ray.at(120, far);
      return { x: far.x, y: Math.max(6, far.y), z: far.z };
    }

    function onCanvasClick(e) {
      try { if (mvxPickPlayer(e)) return; } catch (eMvxPick) {}
      var wpos = worldFromClient(e.clientX, e.clientY);
      if (!wpos) return;
      var wx = wpos.x, wy = wpos.y;
      var hit = null;
      roomsForWorld(currentWorld).forEach(function (r) {
        if (Math.hypot(wx - r.x, wy - r.y) < 28) hit = r;
      });
      /* Avoid accidental room teleports while walking / after stick use. */
      if (hit && !(keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD'] ||
          keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight'] ||
          Math.hypot(stickVec.x, stickVec.y) > 0.12)) {
        enterRoom(hit.id);
      }
    }

    function mvIsPhoneMode() {
      try {
        if (typeof global.isPhoneMode === 'function') return !!global.isPhoneMode();
      } catch (e0) {}
      try {
        if (document.body && document.body.classList.contains('phone-mode')) return true;
      } catch (e1) {}
      var narrow = false;
      try { narrow = window.matchMedia && window.matchMedia('(max-width: 600px)').matches; } catch (e2a) { narrow = window.innerWidth <= 600; }
      var coarse = false;
      try { coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; } catch (e2) {}
      var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      return narrow || (touch && coarse && window.innerWidth <= 900);
    }

    function setSideOpen(open) {
      if (!root) return;
      root.classList.toggle('mv-side-open', !!open);
      if (panelToggle) {
        panelToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        panelToggle.textContent = open ? '✕ Cerrar' : '☰ Menú';
      }
    }

    function syncMobileControls() {
      var phone = mvIsPhoneMode();
      var coarse = false;
      var fine = false;
      try { coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e1) {}
      try { fine = !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches); } catch (e2) {}
      // Solo joystick en tactil real (no MacBook con trackpad / ontouchstart legacy)
      var touchish = coarse && !fine;
      var showStick = phone || touchish;
      /* Stick/action: phone o tactil real. mv-mobile-controls mueve voz/emotes. */
      if (stickEl) stickEl.classList.toggle('mv-stick-visible', showStick);
      if (actionPadEl) actionPadEl.classList.toggle('mv-action-visible', showStick);
      if (mandoProBtn) mandoProBtn.style.display = phone ? 'none' : '';
      if (phone && mandoOverlay && !mandoOverlay.classList.contains('hidden')) closeMandoProPanel();
      if (root) {
        root.classList.toggle('mv-mobile-controls', showStick);
        root.classList.add('mv-phone-layout');
        root.classList.toggle('mv-desktop-fs', !phone);
      }
      if (panelToggle) panelToggle.style.display = '';
      var showArm = mvIsPhoneMode();
      if (armStickEl) armStickEl.classList.toggle('mv-arm-stick-visible', showArm);
      if (root) root.classList.toggle('mv-arm-stick-on', showArm);
      if (!showArm && armStickHeld) releaseArmStick(true);
      if (!showStick) {
        resetStick();
      }
      try { resize(); } catch (eSync) {}
    }

    function setStickKnob(nx, ny) {
      if (!stickKnob) return;
      stickKnob.style.transform = 'translate(' + (nx * stickMax) + 'px,' + (ny * stickMax) + 'px)';
    }

    function resetStick() {
      stickVec.x = 0;
      stickVec.y = 0;
      stickActive = false;
      stickPointerId = null;
      setStickKnob(0, 0);
      if (stickEl) stickEl.classList.remove('active');
    }

    function updateStickFromEvent(ev) {
      if (!stickEl) return;
      var base = stickEl.querySelector('.mv-stick-base') || stickEl;
      var rect = base.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = ev.clientX - cx;
      var dy = ev.clientY - cy;
      var mag = Math.hypot(dx, dy) || 1;
      var maxPx = Math.min(rect.width, rect.height) * 0.38;
      if (mag > maxPx) { dx = dx / mag * maxPx; dy = dy / mag * maxPx; mag = maxPx; }
      stickVec.x = dx / maxPx;
      stickVec.y = dy / maxPx;
      setStickKnob(stickVec.x, stickVec.y);
    }

    function onStickPointerDown(ev) {
      if (!stickEl || !stickEl.classList.contains('mv-stick-visible')) return;
      if (stickActive) return;
      stickActive = true;
      stickPointerId = ev.pointerId;
      stickEl.classList.add('active');
      try { stickEl.setPointerCapture(ev.pointerId); } catch (e3) {}
      updateStickFromEvent(ev);
      ev.preventDefault();
      ev.stopPropagation();
    }
    function onStickPointerMove(ev) {
      if (!stickActive || ev.pointerId !== stickPointerId) return;
      updateStickFromEvent(ev);
      ev.preventDefault();
      ev.stopPropagation();
    }
    function onStickPointerUp(ev) {
      if (!stickActive || (stickPointerId != null && ev.pointerId !== stickPointerId)) return;
      resetStick();
      ev.preventDefault();
      ev.stopPropagation();
    }

    function onArmPointerMove(ev) {
      /* Phone pose is owned by the red stick; don't clear it on canvas touches. */
      if (!armMouseAllowed()) return;
      if (ev.pointerType && ev.pointerType !== 'mouse') return;
      if (stickActive) return;
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(1, rect.width);
      var h = Math.max(1, rect.height);
      armAim.x = ((ev.clientX - rect.left) / w) * 2 - 1;
      armAim.y = -((ev.clientY - rect.top) / h) * 2 + 1;
      var aim = aimPointFromClient(ev.clientX, ev.clientY);
      if (aim) {
        armAim.wx = aim.x;
        armAim.wy = aim.y;
        armAim.wz = aim.z;
      }
      armAim.live = true;
    }
    canvas.addEventListener('pointermove', onArmPointerMove, { passive: true });

    function onFpMouseMove(ev) {
      if (viewMode !== 'first' || !fpPointerLocked) return;
      var sens = 0.00205 * mvxSens();
      fpLook.yaw -= (ev.movementX || 0) * sens;
      fpLook.pitch -= (ev.movementY || 0) * sens;
      if (fpLook.pitch > 1.15) fpLook.pitch = 1.15;
      if (fpLook.pitch < -1.25) fpLook.pitch = -1.25;
      me.ry = fpLook.yaw;
    }
    function onFpPointerLockChange() {
      fpPointerLocked = !!(document.pointerLockElement === canvas);
      if (root) {
        if (fpPointerLocked) root.classList.add('mv-fp-locked');
        else root.classList.remove('mv-fp-locked');
      }
      if (fpPointerLocked) {
        fpLook.yaw = me.ry || 0;
      }
    }
    function onFpCanvasClick(ev) {
      if (viewMode !== 'first' || !canvas) return;
      if (ev.target && (ev.target.closest && ev.target.closest('button'))) return;
      if (document.pointerLockElement === canvas) return;
      try { canvas.requestPointerLock(); } catch (e1) {}
    }
    document.addEventListener('pointerlockchange', onFpPointerLockChange);
    document.addEventListener('mousemove', onFpMouseMove, { passive: true });
    canvas.addEventListener('click', onFpCanvasClick);


    function syncViewBtn() {
      if (!viewToggle) return;
      var labels = { behind: 'Vista 3D', first: '1ª persona', top: 'Desde arriba' };
      viewToggle.textContent = labels[viewMode] || 'Vista 3D';
      viewToggle.setAttribute('aria-pressed', viewMode !== 'behind' ? 'true' : 'false');
      viewToggle.title = 'Cambiar vista (3D → 1ª persona → desde arriba)';
    }
    function syncFpHud() {
      firstPerson = (viewMode === 'first');
      if (crosshairEl) {
        if (firstPerson) crosshairEl.removeAttribute('hidden');
        else crosshairEl.setAttribute('hidden', '');
      }
      if (root) {
        if (firstPerson) root.classList.add('mv-fp');
        else root.classList.remove('mv-fp');
      }
      if (!firstPerson && typeof document !== 'undefined' && document.exitPointerLock && document.pointerLockElement) {
        try { document.exitPointerLock(); } catch (e0) {}
      }
    }
    if (viewToggle) {
      viewToggle.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (viewMode === 'behind') viewMode = 'first';
        else if (viewMode === 'first') viewMode = 'top';
        else viewMode = 'behind';
        firstPerson = (viewMode === 'first');
        if (firstPerson) {
          fpLook.yaw = me.ry || 0;
          fpLook.pitch = 0;
        }
        viewSnap = true;
        if (camera && camera.userData) camera.userData.look = null;
        syncViewBtn();
        syncFpHud();
      });
    }
    syncViewBtn();
    syncFpHud();

    if (stickEl) {
      stickEl.addEventListener('pointerdown', onStickPointerDown);
      stickEl.addEventListener('pointermove', onStickPointerMove);
      stickEl.addEventListener('pointerup', onStickPointerUp);
      stickEl.addEventListener('pointercancel', onStickPointerUp);
      stickEl.addEventListener('lostpointercapture', function () { resetStick(); });
    }

    function armStickShown() {
      if (!armStickEl || !mvIsPhoneMode()) return false;
      if (armStickEl.classList.contains('mv-arm-stick-visible')) return true;
      return !!(document.body && document.body.classList.contains('phone-mode'));
    }
    function setArmKnob(nx, ny) {
      if (!armStickKnob) return;
      armStickKnob.style.transform = 'translate(' + (nx * armStickMax) + 'px,' + (ny * armStickMax) + 'px)';
    }
    function releaseArmStick(clearPose) {
      armStickActive = false;
      armStickPointerId = null;
      if (armStickEl) armStickEl.classList.remove('active');
      if (!clearPose) return;
      armStickHeld = false;
      armStickVec.x = 0;
      armStickVec.y = 0;
      setArmKnob(0, 0);
      armAim.live = false;
      armAim.wx = armAim.wy = armAim.wz = null;
      armNet = null;
    }
    function updateArmStickFromEvent(ev) {
      if (!armStickEl) return;
      var base = armStickEl.querySelector('.mv-arm-stick-base') || armStickEl;
      var rect = base.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = ev.clientX - cx;
      var dy = ev.clientY - cy;
      var mag = Math.hypot(dx, dy) || 1;
      var maxPx = Math.min(rect.width, rect.height) * 0.38;
      if (mag > maxPx) { dx = dx / mag * maxPx; dy = dy / mag * maxPx; mag = maxPx; }
      armStickVec.x = dx / maxPx;
      armStickVec.y = dy / maxPx;
      setArmKnob(armStickVec.x, armStickVec.y);
      /* Same NDC as the desktop mouse: right = +x, up = +y. Hold on release. */
      armAim.x = Math.max(-1, Math.min(1, armStickVec.x));
      armAim.y = Math.max(-1, Math.min(1, -armStickVec.y));
      /* Stick → punto delante del jugador para extender el brazo. */
      var yawA = me.ry || 0;
      var fxa = Math.cos(yawA), fza = Math.sin(yawA);
      var rxa = -fza, rza = fxa;
      var reachD = 28 + Math.hypot(armAim.x, armAim.y) * 55;
      armAim.wx = me.x + fxa * (20 + armAim.y * 40) + rxa * armAim.x * reachD;
      armAim.wy = 12 + Math.max(0, armAim.y) * 36;
      armAim.wz = me.y + fza * (20 + armAim.y * 40) + rza * armAim.x * reachD;
      armAim.live = true;
      armStickHeld = true;
    }
    function onArmStickPointerDown(ev) {
      if (!armStickShown()) return;
      if (armStickActive) return;
      armStickActive = true;
      armStickPointerId = ev.pointerId;
      armStickEl.classList.add('active');
      try { armStickEl.setPointerCapture(ev.pointerId); } catch (eArmCap) {}
      updateArmStickFromEvent(ev);
      ev.preventDefault();
      ev.stopPropagation();
    }
    function onArmStickPointerMove(ev) {
      if (!armStickActive || ev.pointerId !== armStickPointerId) return;
      updateArmStickFromEvent(ev);
      ev.preventDefault();
      ev.stopPropagation();
    }
    function onArmStickPointerUp(ev) {
      if (!armStickActive || (armStickPointerId != null && ev.pointerId !== armStickPointerId)) return;
      armStickActive = false;
      armStickPointerId = null;
      if (armStickEl) armStickEl.classList.remove('active');
      ev.preventDefault();
      ev.stopPropagation();
    }
    if (armStickEl) {
      armStickEl.addEventListener('pointerdown', onArmStickPointerDown);
      armStickEl.addEventListener('pointermove', onArmStickPointerMove);
      armStickEl.addEventListener('pointerup', onArmStickPointerUp);
      armStickEl.addEventListener('pointercancel', onArmStickPointerUp);
      armStickEl.addEventListener('lostpointercapture', function (ev) {
        if (!armStickActive) return;
        if (armStickPointerId != null && ev.pointerId !== armStickPointerId) return;
        armStickActive = false;
        armStickPointerId = null;
        armStickEl.classList.remove('active');
      });
    }

    if (runBtn) {
      var runDown = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        keys['ShiftLeft'] = true;
        runBtn.classList.add('on');
      };
      var runUp = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        keys['ShiftLeft'] = false;
        runBtn.classList.remove('on');
      };
      runBtn.addEventListener('pointerdown', runDown);
      runBtn.addEventListener('pointerup', runUp);
      runBtn.addEventListener('pointercancel', runUp);
      runBtn.addEventListener('pointerleave', runUp);
    }

    if (panelToggle) {
      panelToggle.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!root) return;
        setSideOpen(!root.classList.contains('mv-side-open'));
      });
    }
    if (sideBackdrop) {
      sideBackdrop.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setSideOpen(false);
      });
    }

    /* Swipe-to-close on .mv-side (players / voice mute / rooms).
       Phone: bottom sheet — swipe down. Desktop fs: right drawer — swipe sideways.
       Either a horizontal or a downward drag past the threshold closes it.
       Taps stay clicks so mute and chat still work. */
    var sideSwipe = null;
    var sideSwipeKillClick = null;
    var SIDE_SWIPE_SLOP = 14;
    var SIDE_SWIPE_PX = 64;
    function sideSwipeCanPullDown(startNode) {
      var node = startNode;
      while (node) {
        if (node.nodeType === 1) {
          var oy = "";
          try { oy = (global.getComputedStyle(node).overflowY || ""); } catch (eOy) { oy = ""; }
          if ((oy === "auto" || oy === "scroll" || oy === "overlay") &&
              node.scrollHeight > node.clientHeight + 4 && node.scrollTop > 2) {
            return false;
          }
        }
        if (node === sideEl) break;
        node = node.parentNode;
      }
      return true;
    }
    function detachSideSwipeWindow() {
      global.removeEventListener("pointermove", onSideSwipeMove);
      global.removeEventListener("pointerup", onSideSwipeEnd);
      global.removeEventListener("pointercancel", onSideSwipeEnd);
    }
    function onSideSwipeDown(ev) {
      if (!root || !sideEl || !root.classList.contains("mv-side-open")) return;
      detachSideSwipeWindow();
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      var t = ev.target;
      if (t && t.closest && t.closest("input, textarea, select")) return;
      sideSwipe = {
        id: ev.pointerId,
        x: ev.clientX,
        y: ev.clientY,
        drag: false,
        pullDown: sideSwipeCanPullDown(t)
      };
      global.addEventListener("pointermove", onSideSwipeMove, { passive: true });
      global.addEventListener("pointerup", onSideSwipeEnd);
      global.addEventListener("pointercancel", onSideSwipeEnd);
    }
    function onSideSwipeMove(ev) {
      if (!sideSwipe || ev.pointerId !== sideSwipe.id) return;
      var dx = ev.clientX - sideSwipe.x;
      var dy = ev.clientY - sideSwipe.y;
      if (!sideSwipe.drag && Math.hypot(dx, dy) >= SIDE_SWIPE_SLOP) sideSwipe.drag = true;
    }
    function onSideSwipeEnd(ev) {
      if (!sideSwipe || (ev.pointerId != null && ev.pointerId !== sideSwipe.id)) return;
      var dx = ev.clientX - sideSwipe.x;
      var dy = ev.clientY - sideSwipe.y;
      var drag = sideSwipe.drag;
      var pullDown = sideSwipe.pullDown;
      sideSwipe = null;
      detachSideSwipeWindow();
      if (!drag || !root || !root.classList.contains("mv-side-open")) return;
      var absX = Math.abs(dx);
      var absY = Math.abs(dy);
      var horizontal = absX >= SIDE_SWIPE_PX && absX > absY;
      var downward = pullDown && dy >= SIDE_SWIPE_PX && dy >= absX;
      if (!horizontal && !downward) return;
      setSideOpen(false);
      if (!sideEl) return;
      if (sideSwipeKillClick) {
        sideEl.removeEventListener("click", sideSwipeKillClick, true);
      }
      sideSwipeKillClick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (sideEl && sideSwipeKillClick) sideEl.removeEventListener("click", sideSwipeKillClick, true);
        sideSwipeKillClick = null;
      };
      sideEl.addEventListener("click", sideSwipeKillClick, true);
      setTimeout(function () {
        if (sideEl && sideSwipeKillClick) sideEl.removeEventListener("click", sideSwipeKillClick, true);
        sideSwipeKillClick = null;
      }, 400);
    }
    if (sideEl) sideEl.addEventListener("pointerdown", onSideSwipeDown);

    syncMobileControls();
    var onPhoneModeResize = function () { syncMobileControls(); };
    global.addEventListener('resize', onPhoneModeResize);
    var phoneModeObserver = null;
    try {
      if (global.MutationObserver && document.body) {
        phoneModeObserver = new MutationObserver(syncMobileControls);
        phoneModeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }
    } catch (e4) {}

    var ro = null;
    renderWorlds();
    renderRooms();
    resize();
    if (global.ResizeObserver) {
      ro = new ResizeObserver(resize);
      ro.observe(root.querySelector('.mv-stage'));
    } else {
      global.addEventListener('resize', resize);
    }

    var funPadBtn = container.querySelector('[data-mv="funPadBtn"]');
    if (funPadBtn) {
      funPadBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        triggerFun('mystery');
      });
    }
    /* ===== Gran actualización 2026-10-09 · tanda 3 (Metaverse): gestos, bocadillos de chat, etiquetas ===== */
    var MVX_GESTURES = [
      { id: 'wave', emoji: '👋', label: 'Saludar', ms: 2200 },
      { id: 'dance', emoji: '🕺', label: 'Bailar', ms: 6000 },
      { id: 'jump', emoji: '🦘', label: 'Saltar', ms: 900 },
      { id: 'heart', emoji: '❤️', label: 'Corazón', ms: 2600 },
      { id: 'clap', emoji: '👏', label: 'Aplaudir', ms: 2200 },
      { id: 'laugh', emoji: '😂', label: 'Reír', ms: 2200 }
    ];
    var MVX_GESTURE_BY_ID = {};
    MVX_GESTURES.forEach(function (g) { MVX_GESTURE_BY_ID[g.id] = g; });
    var mvxState = { gest: {}, bubbles: {}, lastGestAt: 0, wheelEl: null, gestBtn: null, labelOp: {} };

    function ensureMvxCss() {
      if (document.getElementById('mvx-bigupd3-css')) return;
      var st = document.createElement('style');
      st.id = 'mvx-bigupd3-css';
      st.textContent =
        '.mvx-gest-btn{position:absolute;left:10px;bottom:106px;z-index:4;margin:0;width:44px;height:44px;padding:0;border-radius:50%;font-size:1.3rem;line-height:1;' +
          'background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.28);color:#fff;box-shadow:0 3px 10px rgba(0,0,0,0.35);cursor:pointer;pointer-events:auto;' +
          'transition:transform .14s cubic-bezier(0.22,1,0.36,1),background .2s ease;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}' +
        '.mvx-gest-btn:active{transform:scale(0.92);}' +
        '.mvx-gest-btn.open{background:rgba(52,209,122,0.45);border-color:#9dffc2;}' +
        '.mv-action-pad .mvx-gest-btn{position:static;display:block;width:56px;height:56px;margin-top:8px;font-size:1.35rem;border-width:2px;}' +
        'body.phone-mode .mv-action-pad .mvx-gest-btn{width:60px;height:60px;}' +
        '.mv-root.mv-mobile-controls .mv-stage > .mvx-gest-btn{display:none;}' +
        '.mvx-wheel{position:absolute;inset:0;z-index:9;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.28);pointer-events:auto;' +
          'opacity:0;transition:opacity .18s ease;-webkit-tap-highlight-color:transparent;}' +
        '.mvx-wheel.show{opacity:1;}' +
        '.mvx-wheel[hidden]{display:none;}' +
        '.mvx-wheel-ring{position:relative;width:236px;height:236px;border-radius:50%;background:radial-gradient(circle,rgba(20,30,26,0.55) 0 34%,rgba(12,20,16,0.86) 35% 100%);' +
          'border:1px solid rgba(255,255,255,0.22);box-shadow:0 10px 40px rgba(0,0,0,0.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);' +
          'transform:scale(0.85);transition:transform .24s cubic-bezier(0.22,1.4,0.36,1);}' +
        '.mvx-wheel.show .mvx-wheel-ring{transform:scale(1);}' +
        '.mvx-wheel-item{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;' +
          'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.22);color:#fff;cursor:pointer;transition:transform .14s ease,background .15s ease,border-color .15s ease;}' +
        '.mvx-wheel-item:hover,.mvx-wheel-item:focus-visible{background:rgba(52,209,122,0.32);border-color:#9dffc2;transform:scale(1.08);outline:none;}' +
        '.mvx-wheel-item:active{transform:scale(0.94);}' +
        '.mvx-wheel-emoji{font-size:1.45rem;line-height:1;}' +
        '.mvx-wheel-label{font-size:0.6rem;font-weight:700;letter-spacing:0.01em;opacity:0.92;}' +
        '.mvx-wheel-center{position:absolute;left:50%;top:50%;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;padding:0;font-size:0.68rem;font-weight:800;' +
          'background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.25);color:#fff;cursor:pointer;line-height:1.15;}' +
        '.mvx-wheel-hint{position:absolute;left:0;right:0;bottom:-30px;text-align:center;font-size:0.7rem;color:#e8fff1;text-shadow:0 1px 3px #000;}' +
        '.mvx-bubble{display:block;width:max-content;max-width:180px;padding:5px 9px;margin:0 auto 5px;border-radius:12px;background:rgba(255,255,255,0.96);color:#15222b;' +
          'font-size:0.72rem;font-weight:600;line-height:1.25;white-space:normal;word-break:break-word;text-align:center;box-shadow:0 3px 10px rgba(0,0,0,0.35);position:relative;' +
          'animation:mvxBubIn .24s cubic-bezier(0.22,1.4,0.36,1);transition:opacity .35s ease;}' +
        '.mvx-bubble::after{content:"";position:absolute;left:50%;bottom:-5px;margin-left:-5px;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid rgba(255,255,255,0.96);}' +
        '.mvx-bubble.me{background:rgba(214,255,228,0.97);}' +
        '.mvx-bubble.me::after{border-top-color:rgba(214,255,228,0.97);}' +
        '.mvx-bubble.out{opacity:0;}' +
        '@keyframes mvxBubIn{from{opacity:0;transform:translateY(6px) scale(0.85);}to{opacity:1;transform:none;}}' +
        '.mv-nameplate{transition:opacity .25s linear;}' +
        'body.phone-mode .mvx-bubble{max-width:150px;font-size:0.7rem;}' +
        'body.phone-mode .mv-root .mv-emotes,.mv-root.mv-arm-stick-on .mv-emotes{bottom:236px;}' +
        '@media (prefers-reduced-motion: reduce){.mvx-bubble,.mvx-wheel-ring{animation:none !important;transition:none !important;}}';
      document.head.appendChild(st);
    }

    function mvxGestureActive(email, nowP) {
      var s = email ? mvxState.gest[email] : null;
      if (!s || s.until < nowP) return null;
      return s;
    }

    /* Salto / baile / cohete y gestos de OTROS jugadores: ahora se ven en su avatar. */
    function mvxRemoteGesture(email, nowP) {
      var s = mvxGestureActive(email, nowP);
      if (!s) return null;
      if (s.g === 'jump') {
        var jt = Math.max(0, Math.min(1, (s.until - nowP) / 900));
        return { y: Math.sin((1 - jt) * Math.PI) * 34, spin: 0, moving: false };
      }
      if (s.g === 'dance') return { y: Math.abs(Math.sin(nowP / 180)) * 4, spin: Math.sin(nowP / 120) * 0.55, moving: true };
      if (s.g === 'rocket') return { y: 18 + Math.sin(nowP / 80) * 4, spin: 0, moving: false };
      if (s.g === 'clap' || s.g === 'laugh') return { y: Math.abs(Math.sin(nowP / 110)) * 1.6, spin: 0, moving: false };
      return null;
    }

    function mvxPoseGestureArms(mesh, email, isMe, nowP) {
      if (!mesh || !mesh.userData) return;
      if (isMe && firstPerson) return;
      var s = mvxGestureActive(email, nowP);
      if (!s) return;
      var armL = mesh.userData.armL;
      var armR = mesh.userData.armR;
      if (!armL || !armR) return;
      if (s.g === 'wave') {
        armR.rotation.set(0, 0, -2.45 + Math.sin(nowP / 110) * 0.45);
        resetArmReach(armR);
      } else if (s.g === 'clap') {
        var c = Math.abs(Math.sin(nowP / 75));
        armL.rotation.set(-1.3, 0, -0.15 - c * 0.3);
        armR.rotation.set(-1.3, 0, 0.15 + c * 0.3);
        resetArmReach(armL);
        resetArmReach(armR);
      } else if (s.g === 'heart') {
        armL.rotation.set(-0.2, 0, 2.6);
        armR.rotation.set(-0.2, 0, -2.6);
        resetArmReach(armL);
        resetArmReach(armR);
      } else if (s.g === 'laugh') {
        armL.rotation.set(-0.9, 0, -0.5);
        armR.rotation.set(-0.9, 0, 0.5);
        resetArmReach(armL);
        resetArmReach(armR);
      }
    }

    function mvxPosOf(email) {
      if (email === user.email) return { x: me.x, y: me.y };
      var rp = remotePos[email];
      return rp ? { x: rp.x, y: rp.y } : null;
    }

    function mvxHearts(email) {
      var p = mvxPosOf(email);
      if (!p) return;
      spawnParticles(p.x, p.y, '#ff5c8a');
      setTimeout(function () { if (!closed) { var p2 = mvxPosOf(email); if (p2) spawnParticles(p2.x, p2.y, '#ff9ab8'); } }, 260);
    }

    function mvxDoGesture(id) {
      var g = MVX_GESTURE_BY_ID[id];
      if (!g) return;
      var now = performance.now();
      if (now - mvxState.lastGestAt < 500) return;
      mvxState.lastGestAt = now;
      mvxCloseWheel();
      if (id === 'jump') {
        triggerFun('jump');
      } else if (id === 'dance') {
        triggerFun('dance');
      } else {
        mvxState.gest[user.email] = { g: id, until: now + g.ms };
        if (ws && ws.readyState === 1) {
          try { ws.send(JSON.stringify({ type: 'fun', effect: 'gesture', payload: { g: id, name: user.name } })); } catch (eG) {}
        }
        if (id === 'heart') mvxHearts(user.email);
        toast(g.emoji + ' ' + g.label);
      }
      sendEmote(g.emoji);
    }

    function mvxOpenWheel() {
      var stage = root && root.querySelector('.mv-stage');
      if (!stage) return;
      if (!mvxState.wheelEl) {
        var w = document.createElement('div');
        w.className = 'mvx-wheel';
        w.hidden = true;
        var ring = document.createElement('div');
        ring.className = 'mvx-wheel-ring';
        MVX_GESTURES.forEach(function (g, i) {
          var a = -Math.PI / 2 + (i / MVX_GESTURES.length) * Math.PI * 2;
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'mvx-wheel-item';
          b.style.left = (118 + Math.cos(a) * 82) + 'px';
          b.style.top = (118 + Math.sin(a) * 82) + 'px';
          b.title = g.label;
          b.innerHTML = '<span class="mvx-wheel-emoji">' + g.emoji + '</span><span class="mvx-wheel-label">' + esc(g.label) + '</span>';
          b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); mvxDoGesture(g.id); });
          ring.appendChild(b);
        });
        var center = document.createElement('button');
        center.type = 'button';
        center.className = 'mvx-wheel-center';
        center.textContent = 'Cerrar';
        center.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); mvxCloseWheel(); });
        ring.appendChild(center);
        var hint = document.createElement('div');
        hint.className = 'mvx-wheel-hint';
        hint.textContent = 'Todos los de tu mundo verán tu gesto';
        ring.appendChild(hint);
        w.appendChild(ring);
        w.addEventListener('click', function (ev) { if (ev.target === w) mvxCloseWheel(); });
        stage.appendChild(w);
        mvxState.wheelEl = w;
      }
      mvxState.wheelEl.hidden = false;
      void mvxState.wheelEl.offsetWidth;
      mvxState.wheelEl.classList.add('show');
      if (mvxState.gestBtn) mvxState.gestBtn.classList.add('open');
      if (mvxState.gestPadBtn) mvxState.gestPadBtn.classList.add('open');
    }

    function mvxCloseWheel() {
      var w = mvxState.wheelEl;
      if (!w || w.hidden) return;
      w.classList.remove('show');
      if (mvxState.gestBtn) mvxState.gestBtn.classList.remove('open');
      if (mvxState.gestPadBtn) mvxState.gestPadBtn.classList.remove('open');
      setTimeout(function () { if (w && !w.classList.contains('show')) w.hidden = true; }, 180);
    }

    function mvxToggleWheel() {
      if (mvxState.wheelEl && !mvxState.wheelEl.hidden && mvxState.wheelEl.classList.contains('show')) mvxCloseWheel();
      else mvxOpenWheel();
    }

    function mvxShowBubble(email, text) {
      var el = nameLabels[email];
      if (!el || !text) return;
      var old = mvxState.bubbles[email];
      if (old && old.el) { try { old.el.remove(); } catch (eB) {} }
      var t = String(text);
      if (t.length > 90) t = t.slice(0, 88) + '…';
      var b = document.createElement('div');
      b.className = 'mvx-bubble' + (email === user.email ? ' me' : '');
      b.textContent = t;
      el.insertBefore(b, el.firstChild);
      mvxState.bubbles[email] = { el: b, until: performance.now() + Math.min(9000, 3500 + t.length * 60) };
    }

    function mvxTickBubbles(nowP) {
      Object.keys(mvxState.bubbles).forEach(function (email) {
        var bb = mvxState.bubbles[email];
        if (!bb || !bb.el) { delete mvxState.bubbles[email]; return; }
        if (!bb.el.isConnected) { delete mvxState.bubbles[email]; return; }
        if (nowP > bb.until && !bb.out) {
          bb.out = true;
          bb.el.classList.add('out');
          setTimeout(function () { try { bb.el.remove(); } catch (eR) {} }, 380);
        }
        if (nowP > bb.until + 500) delete mvxState.bubbles[email];
      });
    }

    function mvxFadeLabels() {
      if (!camera) return;
      Object.keys(avatarMeshes).forEach(function (email) {
        var mesh = avatarMeshes[email];
        var el = nameLabels[email];
        if (!mesh || !el) return;
        var op = 1;
        if (email !== user.email) {
          var dx = mesh.position.x - camera.position.x;
          var dz = mesh.position.z - camera.position.z;
          var d = Math.sqrt(dx * dx + dz * dz);
          op = d < 230 ? 1 : Math.max(0.3, 1 - (d - 230) / 480);
          if (mvxState.bubbles[email]) op = Math.max(op, 0.9);
        }
        var prev = mvxState.labelOp[email];
        if (prev == null || Math.abs(prev - op) > 0.04) {
          mvxState.labelOp[email] = op;
          el.style.opacity = op >= 0.999 ? '' : op.toFixed(2);
        }
      });
    }

    function mvxOnMsg(msg) {
      if (!msg) return;
      var now = performance.now();
      if (msg.type === 'fun' && msg.email && msg.email !== user.email) {
        if (msg.effect === 'jump') mvxState.gest[msg.email] = { g: 'jump', until: now + 900 };
        else if (msg.effect === 'dance') mvxState.gest[msg.email] = { g: 'dance', until: now + 6000 };
        else if (msg.effect === 'rocket') mvxState.gest[msg.email] = { g: 'rocket', until: now + 2500 };
        else if (msg.effect === 'gesture' && msg.payload && MVX_GESTURE_BY_ID[msg.payload.g]) {
          var g = MVX_GESTURE_BY_ID[msg.payload.g];
          mvxState.gest[msg.email] = { g: g.id, until: now + g.ms };
          if (g.id === 'heart') mvxHearts(msg.email);
        }
      } else if (msg.type === 'chat' && !msg.to && msg.from && msg.text) {
        var w = msg.world || currentWorld;
        if (w === currentWorld) mvxShowBubble(msg.from, msg.text);
      } else if (msg.type === 'leave' && msg.email) {
        if (mvxCard.email === msg.email) mvxCloseCard();
        delete mvxState.gest[msg.email];
        delete mvxState.bubbles[msg.email];
        delete mvxState.labelOp[msg.email];
      }
    }

    function mvxFrame(dt) {
      var nowP = performance.now();
      mvxTickBubbles(nowP);
      mvxFadeLabels();
      mvxDrawMinimap(nowP);
      mvxFrameC(dt, nowP);
      mvxFrameE();
    }

    function mvxKey(e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
      if (e.code === 'KeyG' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); mvxToggleWheel(); }
      else if (e.code === 'Escape') { mvxCloseWheel(); mvxCloseCard(); mvxCloseSettings(); mvxCloseWorlds(); }
      else if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && !e.altKey) { mvxSetMinimap(!mvxMini.on); }
      else if (/^Digit[1-6]$/.test(e.code) && mvxState.wheelEl && !mvxState.wheelEl.hidden) {
        var gi = MVX_GESTURES[parseInt(e.code.slice(5), 10) - 1];
        if (gi) { e.preventDefault(); mvxDoGesture(gi.id); }
      }
    }

    function mvxInit() {
      ensureMvxCss();
      var stage = root && root.querySelector('.mv-stage');
      if (stage) {
        var gb = document.createElement('button');
        gb.type = 'button';
        gb.className = 'mvx-gest-btn';
        gb.title = 'Gestos (G)';
        gb.setAttribute('aria-label', 'Gestos');
        gb.textContent = '😀';
        gb.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); mvxToggleWheel(); });
        stage.appendChild(gb);
        mvxState.gestBtn = gb;
      }
      if (actionPadEl) {
        var pb = document.createElement('button');
        pb.type = 'button';
        pb.className = 'mv-action-btn mvx-gest-btn';
        pb.title = 'Gestos';
        pb.setAttribute('aria-label', 'Gestos');
        pb.textContent = '😀';
        pb.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); mvxToggleWheel(); });
        actionPadEl.appendChild(pb);
        mvxState.gestPadBtn = pb;
      }
      document.addEventListener('keydown', mvxKey);
    }

    function mvxCleanup() {
      document.removeEventListener('keydown', mvxKey);
      Object.keys(mvxState.bubbles).forEach(function (k) {
        var bb = mvxState.bubbles[k];
        if (bb && bb.el) { try { bb.el.remove(); } catch (eC) {} }
      });
      mvxState.bubbles = {};
      mvxState.gest = {};
      mvxCleanupC();
      mvxCleanupE();
    }
    /* --- Tanda 3 · minimapa y ficha de jugador --- */
    var mvxMini = { el: null, cv: null, ctx: null, btn: null, on: true, staticFor: '', staticCv: null, lastDraw: 0 };
    var mvxCard = { el: null, email: null, contacts: null, contactsAt: 0, channels: null, channelsAt: 0 };

    function ensureMvxCssB() {
      if (document.getElementById('mvx-bigupd3-css-b')) return;
      var st = document.createElement('style');
      st.id = 'mvx-bigupd3-css-b';
      st.textContent =
        '.mvx-minimap{position:absolute;right:10px;top:96px;z-index:3;width:128px;padding:4px;border-radius:14px;background:rgba(8,14,12,0.62);' +
          'border:1px solid rgba(255,255,255,0.22);box-shadow:0 4px 16px rgba(0,0,0,0.4);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);pointer-events:auto;' +
          'transition:opacity .2s ease,transform .2s ease;}' +
        '.mvx-minimap canvas{display:block;width:120px;height:120px;border-radius:10px;}' +
        '.mvx-minimap-head{display:flex;align-items:center;justify-content:space-between;gap:4px;padding:0 2px 3px;font-size:0.62rem;font-weight:800;color:#dfffea;letter-spacing:0.02em;}' +
        '.mvx-minimap-x{margin:0;width:20px;height:20px;padding:0;border-radius:6px;font-size:0.7rem;line-height:1;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;}' +
        '.mvx-minimap[hidden],.mvx-mini-btn[hidden]{display:none !important;}' +
        '.mvx-mini-btn{position:absolute;right:10px;top:96px;z-index:3;margin:0;width:40px;height:40px;padding:0;border-radius:12px;font-size:1.15rem;' +
          'background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.28);color:#fff;cursor:pointer;pointer-events:auto;box-shadow:0 3px 10px rgba(0,0,0,0.35);}' +
        '.mv-root.mv-mobile-controls .mvx-minimap,body.phone-mode .mv-root .mvx-minimap{top:96px;bottom:auto;right:8px;width:96px;}' +
        '.mv-root.mv-mobile-controls .mvx-minimap canvas,body.phone-mode .mv-root .mvx-minimap canvas{width:88px;height:88px;}' +
        '.mv-root.mv-mobile-controls .mvx-mini-btn,body.phone-mode .mv-root .mvx-mini-btn{top:96px;bottom:auto;right:8px;}' +
        '.mv-root.mv-side-open .mvx-minimap,.mv-root.mv-side-open .mvx-mini-btn{opacity:0;pointer-events:none;}' +
        '.mvx-card-wrap{position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.25);pointer-events:auto;' +
          'opacity:0;transition:opacity .18s ease;}' +
        '.mvx-card-wrap.show{opacity:1;}' +
        '.mvx-card-wrap[hidden]{display:none;}' +
        '.mvx-card{position:relative;width:min(280px,86%);padding:16px 14px 14px;border-radius:18px;background:rgba(12,22,16,0.94);border:1px solid rgba(255,255,255,0.18);' +
          'box-shadow:0 14px 40px rgba(0,0,0,0.55);color:#fff;text-align:center;transform:translateY(10px) scale(0.96);transition:transform .24s cubic-bezier(0.22,1.4,0.36,1);}' +
        '.mvx-card-wrap.show .mvx-card{transform:none;}' +
        '.mvx-card-close{position:absolute;right:8px;top:8px;margin:0;width:30px;height:30px;padding:0;border-radius:50%;font-size:0.85rem;background:rgba(255,255,255,0.1);' +
          'border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;}' +
        '.mvx-card-av{width:72px;height:72px;margin:0 auto 8px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:40px;line-height:1;overflow:hidden;' +
          'background:rgba(255,255,255,0.08);border:3px solid rgba(157,255,194,0.8);box-shadow:0 4px 14px rgba(0,0,0,0.4);}' +
        '.mvx-card-av img{width:100%;height:100%;object-fit:cover;display:block;}' +
        '.mvx-card-name{font-size:1.05rem;font-weight:800;margin:0 0 2px;word-break:break-word;}' +
        '.mvx-card-sub{font-size:0.74rem;opacity:0.82;margin:0 0 4px;}' +
        '.mvx-card-num{font-size:0.78rem;font-weight:700;color:#bfffd6;min-height:1.1em;margin:0 0 10px;letter-spacing:0.03em;}' +
        '.mvx-card-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;}' +
        '.mvx-card-actions button{margin:0;width:100%;min-height:40px;padding:8px 6px;border-radius:12px;font-size:0.78rem;font-weight:700;cursor:pointer;color:#fff;' +
          'background:rgba(255,255,255,0.09);border:1px solid rgba(255,255,255,0.22);transition:background .15s ease,transform .12s ease;}' +
        '.mvx-card-actions button:hover{background:rgba(52,209,122,0.28);border-color:#9dffc2;}' +
        '.mvx-card-actions button:active{transform:scale(0.96);}' +
        '.mvx-card-actions button.primary{background:rgba(52,209,122,0.42);border-color:#9dffc2;}' +
        '.mvx-card-actions button[hidden]{display:none;}';
      document.head.appendChild(st);
    }

    function mvxStoreKey(k) { return 'mvx:' + k + ':' + String((user && user.email) || ''); }
    function mvxLoad(k, def) {
      try { var v = localStorage.getItem(mvxStoreKey(k)); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    }
    function mvxSave(k, v) { try { localStorage.setItem(mvxStoreKey(k), JSON.stringify(v)); } catch (e) {} }

    function mvxSetMinimap(on) {
      mvxMini.on = !!on;
      mvxSave('minimap', mvxMini.on);
      if (mvxMini.el) mvxMini.el.hidden = !mvxMini.on;
      if (mvxMini.btn) mvxMini.btn.hidden = mvxMini.on;
      mvxMini.lastDraw = 0;
    }

    function mvxBuildMiniStatic(size) {
      var key = currentWorld + ':' + size;
      if (mvxMini.staticFor === key && mvxMini.staticCv) return mvxMini.staticCv;
      var wdef = WORLD_BY_ID[currentWorld] || WORLDS[0];
      var wsz = wdef.size || 800;
      var c = document.createElement('canvas');
      c.width = size; c.height = size;
      var g = c.getContext('2d');
      var k = size / wsz;
      g.fillStyle = wdef.ground || '#3d8f4a';
      g.fillRect(0, 0, size, size);
      getDecor(currentWorld).forEach(function (d) {
        if (d.type === 'path' || d.type === 'rect') {
          g.fillStyle = d.type === 'rect' ? 'rgba(20,24,30,0.55)' : (d.fill || '#c4b49a');
          g.globalAlpha = d.type === 'path' ? 0.75 : 1;
          var rx = d.x, ry = d.y;
          g.fillRect(rx * k, ry * k, Math.max(1, (d.w || 10) * k), Math.max(1, (d.h || 10) * k));
          g.globalAlpha = 1;
        } else if (d.type === 'circle') {
          g.fillStyle = d.fill || '#c4b49a';
          g.beginPath(); g.arc(d.x * k, d.y * k, Math.max(1.5, (d.r || 10) * k), 0, Math.PI * 2); g.fill();
        } else if (d.type === 'tree' || d.type === 'bush') {
          g.fillStyle = 'rgba(10,60,25,0.85)';
          g.beginPath(); g.arc(d.x * k, d.y * k, d.type === 'tree' ? 2.4 : 1.6, 0, Math.PI * 2); g.fill();
        } else if (d.type === 'fountain') {
          g.fillStyle = '#4aa3df';
          g.beginPath(); g.arc(d.x * k, d.y * k, 4, 0, Math.PI * 2); g.fill();
        }
      });
      mvxMini.staticFor = key;
      mvxMini.staticCv = c;
      return c;
    }

    function mvxDrawMinimap(nowP) {
      if (!mvxMini.on || !mvxMini.cv || !mvxMini.ctx) return;
      if (nowP - mvxMini.lastDraw < 120) return;
      mvxMini.lastDraw = nowP;
      var cv = mvxMini.cv;
      var cssSize = Math.round(cv.getBoundingClientRect().width) || 120;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var px = Math.round(cssSize * dpr);
      if (cv.width !== px) { cv.width = px; cv.height = px; mvxMini.staticFor = ''; }
      var g = mvxMini.ctx;
      var wsz = (WORLD_BY_ID[currentWorld] || WORLDS[0]).size || 800;
      var k = px / wsz;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, px, px);
      g.drawImage(mvxBuildMiniStatic(px), 0, 0);
      roomsForWorld(currentWorld).forEach(function (r) {
        g.fillStyle = currentRoom === r.id ? '#34d17a' : 'rgba(255,255,255,0.75)';
        g.fillRect(r.x * k - 2 * dpr, r.y * k - 2 * dpr, 4 * dpr, 4 * dpr);
      });
      g.fillStyle = '#ffd56a';
      bones.forEach(function (b) {
        g.beginPath(); g.arc(b.x * k, b.y * k, 1.6 * dpr, 0, Math.PI * 2); g.fill();
      });
      Object.keys(remotePos).forEach(function (email) {
        var rp = remotePos[email];
        var pl = players[email];
        if (!rp || !pl) return;
        var bot = !!(pl.bot || String(email).indexOf('ai-bot:') === 0);
        g.fillStyle = bot ? '#9fb7ff' : '#ff8fc0';
        g.strokeStyle = 'rgba(0,0,0,0.6)';
        g.lineWidth = 1 * dpr;
        g.beginPath(); g.arc(rp.x * k, rp.y * k, (bot ? 2.4 : 3) * dpr, 0, Math.PI * 2); g.fill(); g.stroke();
      });
      /* Yo: flecha con la dirección */
      var ang = (viewMode === 'first' ? (fpLook.yaw || me.ry || 0) : (me.ry || 0));
      g.save();
      g.translate(me.x * k, me.y * k);
      g.rotate(ang);
      g.fillStyle = '#34d17a';
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.2 * dpr;
      g.beginPath();
      g.moveTo(6 * dpr, 0);
      g.lineTo(-4 * dpr, 4 * dpr);
      g.lineTo(-2 * dpr, 0);
      g.lineTo(-4 * dpr, -4 * dpr);
      g.closePath();
      g.fill(); g.stroke();
      g.restore();
    }

    function mvxCloseCard() {
      var w = mvxCard.el;
      mvxCard.email = null;
      if (!w || w.hidden) return;
      w.classList.remove('show');
      setTimeout(function () { if (w && !w.classList.contains('show')) w.hidden = true; }, 180);
    }

    function mvxGetJson(url) {
      return fetch(url, { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }

    function mvxFillCardExtras(email, p) {
      var w = mvxCard.el;
      if (!w) return;
      var numEl = w.querySelector('[data-mvx="num"]');
      var chBtn = w.querySelector('[data-mvx="channel"]');
      var now = Date.now();
      var bot = !!(p.bot || String(email).indexOf('ai-bot:') === 0);
      if (bot) { if (numEl) numEl.textContent = ''; return; }
      var pc = (mvxCard.contacts && now - mvxCard.contactsAt < 60000) ? Promise.resolve(mvxCard.contacts)
        : mvxGetJson('/api/phone/contacts').then(function (d) { mvxCard.contacts = (d && d.contacts) || []; mvxCard.contactsAt = Date.now(); return mvxCard.contacts; });
      pc.then(function (list) {
        if (mvxCard.email !== email || !numEl) return;
        var matches = (list || []).filter(function (c) { return c && c.name === p.name && (!p.avatar || c.avatar === p.avatar); });
        if (matches.length !== 1) matches = (list || []).filter(function (c) { return c && c.name === p.name; });
        numEl.textContent = matches.length === 1 && matches[0].number ? ('📞 ' + matches[0].number) : '';
      });
      var cc = (mvxCard.channels && now - mvxCard.channelsAt < 60000) ? Promise.resolve(mvxCard.channels)
        : mvxGetJson('/api/book/channels').then(function (d) { mvxCard.channels = (d && d.channels) || []; mvxCard.channelsAt = Date.now(); return mvxCard.channels; });
      cc.then(function (list) {
        if (mvxCard.email !== email || !chBtn) return;
        var ch = (list || []).filter(function (c) { return c && c.owner && String(c.owner.email || '').toLowerCase() === String(email).toLowerCase(); })[0];
        if (ch && ch.handle) {
          chBtn.hidden = false;
          chBtn.dataset.handle = ch.handle;
        }
      });
    }

    function mvxOpenCard(email) {
      var p = players[email];
      if (!p) return;
      var stage = root && root.querySelector('.mv-stage');
      if (!stage) return;
      if (!mvxCard.el) {
        var w = document.createElement('div');
        w.className = 'mvx-card-wrap';
        w.hidden = true;
        w.innerHTML =
          '<div class="mvx-card" role="dialog" aria-label="Ficha del jugador">' +
          '<button type="button" class="mvx-card-close" data-mvx="close" aria-label="Cerrar">✕</button>' +
          '<div class="mvx-card-av" data-mvx="av"></div>' +
          '<div class="mvx-card-name" data-mvx="name"></div>' +
          '<div class="mvx-card-sub" data-mvx="sub"></div>' +
          '<div class="mvx-card-num" data-mvx="num"></div>' +
          '<div class="mvx-card-actions">' +
          '<button type="button" class="primary" data-mvx="call">📞 Llamar</button>' +
          '<button type="button" data-mvx="channel" hidden>📺 Ver canal</button>' +
          '<button type="button" data-mvx="dm">💬 Mensaje</button>' +
          '<button type="button" data-mvx="wave">👋 Saludar</button>' +
          '</div></div>';
        w.addEventListener('click', function (ev) {
          if (ev.target === w) { mvxCloseCard(); return; }
          var b = ev.target.closest && ev.target.closest('[data-mvx]');
          if (!b) return;
          var act = b.getAttribute('data-mvx');
          var em = mvxCard.email;
          var pl = em ? players[em] : null;
          if (act === 'close') { mvxCloseCard(); return; }
          if (!pl) { mvxCloseCard(); return; }
          if (act === 'call') {
            var st = null;
            try { st = typeof global.getDoganieroCallState === 'function' ? global.getDoganieroCallState() : null; } catch (eS) {}
            if (st && st.phase && st.phase !== 'idle') { toast('Ya hay una llamada en curso'); return; }
            if (typeof global.startDoganieroCall !== 'function') { toast('Las llamadas no están disponibles'); return; }
            try { global.startDoganieroCall({ email: em, name: pl.name, avatar: pl.avatar }, false); toast('📞 Llamando a ' + (pl.name || '')); } catch (eC) { toast('No se pudo llamar'); }
            mvxCloseCard();
          } else if (act === 'channel') {
            var h = b.dataset.handle;
            if (!h) return;
            mvxCloseCard();
            return;
          } else if (act === 'dm') {
            mvxCloseCard();
            selectPeer(em, pl.name);
            setSideOpen(true);
            setTimeout(function () { try { if (input) input.focus(); } catch (eF) {} }, 260);
          } else if (act === 'wave') {
            mvxCloseCard();
            mvxDoGesture('wave');
          }
        });
        stage.appendChild(w);
        mvxCard.el = w;
      }
      var wrap = mvxCard.el;
      mvxCard.email = email;
      var bot = !!(p.bot || String(email).indexOf('ai-bot:') === 0);
      var avEl = wrap.querySelector('[data-mvx="av"]');
      avEl.innerHTML = '';
      var av = p.avatar || '🐶';
      if (isPhotoAv(av)) {
        var img = new Image();
        img.alt = '';
        img.onerror = function () { avEl.textContent = '🐶'; };
        img.src = av;
        avEl.appendChild(img);
      } else {
        avEl.textContent = String(av).slice(0, 16);
      }
      wrap.querySelector('[data-mvx="name"]').textContent = p.name || 'Jugador';
      try { if (p.pro === true && !p.bot && window.snkProBadge) { var mvpb = window.snkProBadge.el({ pro: true }); if (mvpb) wrap.querySelector('[data-mvx="name"]').appendChild(mvpb); } } catch (eMvPb) {}
      var roomTxt = '';
      if (p.room) {
        var rr = EVENT_ROOMS.filter(function (r) { return r.id === p.room; })[0];
        if (rr) roomTxt = ' · ' + rr.emoji + ' ' + rr.name;
      }
      wrap.querySelector('[data-mvx="sub"]').textContent = (bot ? '🤖 Jugador IA · ' : '') + 'En ' + worldName(currentWorld) + roomTxt;
      wrap.querySelector('[data-mvx="num"]').textContent = '';
      var chBtn = wrap.querySelector('[data-mvx="channel"]');
      chBtn.hidden = true;
      chBtn.dataset.handle = '';
      wrap.querySelector('[data-mvx="call"]').hidden = bot;
      wrap.querySelector('[data-mvx="dm"]').hidden = bot;
      wrap.hidden = false;
      void wrap.offsetWidth;
      wrap.classList.add('show');
      mvxFillCardExtras(email, p);
    }

    /* Clic/toque sobre otro jugador → ficha. Devuelve true si se ha abierto. */
    function mvxPickPlayer(e) {
      if (!threeReady || !camera || fpPointerLocked || viewMode === 'first') return false;
      if (!e || e.clientX == null) return false;
      var rect = canvas.getBoundingClientRect();
      var cx = e.clientX - rect.left;
      var cy = e.clientY - rect.top;
      var best = null;
      var bestD = 34;
      var v = new THREE.Vector3();
      Object.keys(avatarMeshes).forEach(function (email) {
        if (email === user.email || !players[email]) return;
        var mesh = avatarMeshes[email];
        if (!mesh || !mesh.visible) return;
        [8, 26, 44, 60].forEach(function (hy) {
          v.set(mesh.position.x, mesh.position.y + hy, mesh.position.z);
          v.project(camera);
          if (v.z > 1) return;
          var sx = (v.x * 0.5 + 0.5) * rect.width;
          var sy = (-v.y * 0.5 + 0.5) * rect.height;
          var d = Math.hypot(sx - cx, sy - cy);
          if (d < bestD) { bestD = d; best = email; }
        });
      });
      if (!best) return false;
      mvxOpenCard(best);
      return true;
    }

    function mvxInitB() {
      ensureMvxCssB();
      var stage = root && root.querySelector('.mv-stage');
      if (!stage) return;
      var box = document.createElement('div');
      box.className = 'mvx-minimap';
      box.innerHTML = '<div class="mvx-minimap-head"><span>🗺️ Mapa</span><button type="button" class="mvx-minimap-x" title="Ocultar mapa (M)" aria-label="Ocultar mapa">✕</button></div>';
      var cv = document.createElement('canvas');
      cv.width = 120; cv.height = 120;
      cv.setAttribute('aria-label', 'Minimapa');
      box.appendChild(cv);
      stage.appendChild(box);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mvx-mini-btn';
      btn.title = 'Mostrar mapa (M)';
      btn.setAttribute('aria-label', 'Mostrar mapa');
      btn.textContent = '🗺️';
      stage.appendChild(btn);
      box.querySelector('.mvx-minimap-x').addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); mvxSetMinimap(false); });
      btn.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); mvxSetMinimap(true); });
      mvxMini.el = box;
      mvxMini.cv = cv;
      mvxMini.ctx = cv.getContext('2d');
      mvxMini.btn = btn;
      mvxSetMinimap(mvxLoad('minimap', true) !== false);
    }

    /* --- Tanda 3 · ajustes, ciclo día/noche, cielo y huellas --- */
    var MVX_DEFAULTS = { vol: 35, sens: 1, quality: 'high', sky: 'auto', steps: true };
    var mvxSet = Object.assign({}, MVX_DEFAULTS, mvxLoad('settings', {}) || {});
    var mvxSky = { group: null, dome: null, stars: null, lastApply: 0, lastKey: '', phase: 'dia' };
    var mvxSteps = { pool: [], idx: 0, lastAt: 0, side: 1, remoteLast: {} };
    var mvxSetUi = { btn: null, wrap: null };

    function mvxSens() {
      var s = +((mvxSet && mvxSet.sens) || 1);
      return isFinite(s) && s > 0 ? Math.max(0.3, Math.min(2.5, s)) : 1;
    }

    function ensureMvxCssC() {
      if (document.getElementById('mvx-bigupd3-css-c')) return;
      var st = document.createElement('style');
      st.id = 'mvx-bigupd3-css-c';
      st.textContent =
        '.mvx-set-btn{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin:6px 0 0 6px;height:30px;min-width:34px;padding:0 9px;border-radius:999px;' +
          'font-size:0.78rem;font-weight:700;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.28);color:#fff;cursor:pointer;pointer-events:auto;' +
          'transition:transform .14s ease,background .2s ease;-webkit-tap-highlight-color:transparent;}' +
        '.mvx-set-btn:active{transform:scale(0.93);}' +
        '.mvx-set-wrap{position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);pointer-events:auto;opacity:0;transition:opacity .18s ease;}' +
        '.mvx-set-wrap.show{opacity:1;}' +
        '.mvx-set-wrap[hidden]{display:none;}' +
        '.mvx-set{position:relative;width:min(330px,90%);max-height:88%;overflow:auto;padding:16px 16px 14px;border-radius:18px;background:rgba(12,22,16,0.95);' +
          'border:1px solid rgba(255,255,255,0.18);box-shadow:0 14px 40px rgba(0,0,0,0.55);color:#fff;transform:translateY(10px) scale(0.96);transition:transform .24s cubic-bezier(0.22,1.4,0.36,1);}' +
        '.mvx-set-wrap.show .mvx-set{transform:none;}' +
        '.mvx-set h3{margin:0 0 12px;font-size:1rem;font-weight:800;}' +
        '.mvx-set-row{margin:0 0 12px;}' +
        '.mvx-set-lab{display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;font-weight:700;margin:0 0 6px;}' +
        '.mvx-set-lab span:last-child{font-weight:600;opacity:0.8;font-size:0.74rem;}' +
        '.mvx-set input[type=range]{width:100%;accent-color:#34d17a;margin:0;}' +
        '.mvx-seg{display:flex;gap:5px;}' +
        '.mvx-seg button{flex:1;margin:0;min-height:36px;padding:6px 4px;border-radius:10px;font-size:0.74rem;font-weight:700;color:#fff;cursor:pointer;' +
          'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);}' +
        '.mvx-seg button.on{background:rgba(52,209,122,0.42);border-color:#9dffc2;}' +
        '.mvx-set-hint{font-size:0.7rem;opacity:0.7;margin:4px 0 0;line-height:1.35;}' +
        '.mvx-set-close{position:absolute;right:10px;top:10px;margin:0;width:30px;height:30px;padding:0;border-radius:50%;font-size:0.85rem;background:rgba(255,255,255,0.1);' +
          'border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;}' +
        '.mvx-set-done{display:block;width:100%;margin:6px 0 0;min-height:40px;border-radius:12px;font-weight:800;font-size:0.82rem;color:#04170c;cursor:pointer;' +
          'background:linear-gradient(135deg,#34d17a,#1fae5e);border:none;}';
      document.head.appendChild(st);
    }

    function mvxHexMix(a, b, t) {
      var ca = new THREE.Color(parseHexColor(a, 0x2d6b3a));
      var cb = new THREE.Color(parseHexColor(b, 0xcfe7ff));
      return ca.lerp(cb, t);
    }

    function mvxPhaseWeights() {
      var mode = mvxSet.sky || 'auto';
      if (mode === 'dia') return { dia: 1, tarde: 0, noche: 0 };
      if (mode === 'tarde') return { dia: 0, tarde: 1, noche: 0 };
      if (mode === 'noche') return { dia: 0, tarde: 0, noche: 1 };
      var d = new Date();
      var h = d.getHours() + d.getMinutes() / 60;
      /* 6-7.5 amanecer · 7.5-19 día · 19-20.5 atardecer · 20.5-21.5 anochecer · noche */
      if (h >= 7.5 && h < 19) return { dia: 1, tarde: 0, noche: 0 };
      if (h >= 19 && h < 20.5) { var t1 = (h - 19) / 1.5; return { dia: 1 - t1, tarde: t1, noche: 0 }; }
      if (h >= 20.5 && h < 21.5) { var t2 = h - 20.5; return { dia: 0, tarde: 1 - t2, noche: t2 }; }
      if (h >= 6 && h < 7.5) { var t3 = (h - 6) / 1.5; return t3 < 0.5 ? { dia: 0, tarde: t3 * 2, noche: 1 - t3 * 2 } : { dia: (t3 - 0.5) * 2, tarde: 1 - (t3 - 0.5) * 2, noche: 0 }; }
      return { dia: 0, tarde: 0, noche: 1 };
    }

    function mvxPhaseName(w) {
      if (w.noche >= w.dia && w.noche >= w.tarde) return 'Noche';
      if (w.tarde >= w.dia) return 'Atardecer';
      return 'Día';
    }

    function mvxEnsureSky() {
      if (mvxSky.group || !THREE || !scene) return;
      var g = new THREE.Group();
      g.name = 'mvx-sky';
      var geo = new THREE.SphereGeometry(1900, 24, 14);
      var cols = new Float32Array(geo.attributes.position.count * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      var dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
      dome.renderOrder = -10;
      dome.frustumCulled = false;
      g.add(dome);
      var n = 360;
      var sp = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) {
        var u = Math.random() * Math.PI * 2;
        var v = 0.08 + Math.random() * 0.92;
        var r = 1800;
        var cy = Math.sqrt(v);
        var rr = Math.sqrt(Math.max(0, 1 - cy * cy));
        sp[i * 3] = Math.cos(u) * rr * r;
        sp[i * 3 + 1] = cy * r;
        sp[i * 3 + 2] = Math.sin(u) * rr * r;
      }
      var sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      var stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
      stars.renderOrder = -9;
      stars.frustumCulled = false;
      g.add(stars);
      scene.add(g);
      mvxSky.group = g;
      mvxSky.dome = dome;
      mvxSky.stars = stars;
      mvxSky.lastKey = '';
    }

    function mvxApplySky(nowP) {
      if (!THREE || !scene || !camera) return;
      mvxEnsureSky();
      if (!mvxSky.group) return;
      mvxSky.group.position.set(camera.position.x, 0, camera.position.z);
      if (nowP - mvxSky.lastApply < 1000 && mvxSky.lastKey) {
        if (scene.fog && mvxSky.horizon) scene.fog.color.copy(mvxSky.horizon);
        return;
      }
      mvxSky.lastApply = nowP;
      var wdef = WORLD_BY_ID[currentWorld] || WORLDS[0];
      var w = mvxPhaseWeights();
      var key = currentWorld + '|' + w.dia.toFixed(2) + '|' + w.tarde.toFixed(2) + '|' + w.noche.toFixed(2);
      mvxSky.phase = mvxPhaseName(w);
      var hDay = mvxHexMix(wdef.bg, '#cfe7ff', 0.62), hEve = mvxHexMix(wdef.bg, '#ff9e6b', 0.55), hNight = mvxHexMix(wdef.bg, '#141d3a', 0.78);
      var tDay = new THREE.Color(0x4f9fe8), tEve = new THREE.Color(0x3b3f8f), tNight = new THREE.Color(0x040919);
      function blend(a, b, c) {
        return new THREE.Color(a.r * w.dia + b.r * w.tarde + c.r * w.noche, a.g * w.dia + b.g * w.tarde + c.g * w.noche, a.b * w.dia + b.b * w.tarde + c.b * w.noche);
      }
      var horizon = blend(hDay, hEve, hNight);
      var top = blend(tDay, tEve, tNight);
      mvxSky.horizon = horizon;
      if (key !== mvxSky.lastKey) {
        mvxSky.lastKey = key;
        var pos = mvxSky.dome.geometry.attributes.position;
        var col = mvxSky.dome.geometry.attributes.color;
        var tmp = new THREE.Color();
        for (var i = 0; i < pos.count; i++) {
          var y = pos.getY(i) / 1900;
          var t = y <= 0 ? 0 : Math.pow(y, 0.55);
          tmp.copy(horizon).lerp(top, t);
          col.setXYZ(i, tmp.r, tmp.g, tmp.b);
        }
        col.needsUpdate = true;
      }
      if (scene.background && scene.background.isColor) scene.background.copy(horizon);
      else scene.background = horizon.clone();
      if (scene.fog) scene.fog.color.copy(horizon);
      if (mvxSky.stars) mvxSky.stars.material.opacity = Math.min(1, w.noche * 0.95 + w.tarde * 0.15);
      if (hemiLight) hemiLight.intensity = 0.85 * w.dia + 0.62 * w.tarde + 0.38 * w.noche;
      if (dirLight) {
        dirLight.intensity = 0.95 * w.dia + 0.72 * w.tarde + 0.26 * w.noche;
        dirLight.color.copy(blend(new THREE.Color(0xfff2d6), new THREE.Color(0xffb27a), new THREE.Color(0x9fb4ff)));
      }
    }

    function mvxApplyQuality() {
      if (!renderer) return;
      var low = mvxSet.quality === 'low';
      try { renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 2)); } catch (eP) {}
      if (dirLight) dirLight.castShadow = !low;
      try { resize(); } catch (eR) {}
    }

    function mvxEnsureStepPool() {
      if (mvxSteps.pool.length || !THREE || !scene) return;
      for (var i = 0; i < 20; i++) {
        var m = new THREE.Mesh(new THREE.CircleGeometry(3, 12), new THREE.MeshBasicMaterial({ color: 0xf1ead6, transparent: true, opacity: 0, depthWrite: false }));
        m.rotation.x = -Math.PI / 2;
        m.visible = false;
        m.renderOrder = 1;
        m.userData.life = 0;
        scene.add(m);
        mvxSteps.pool.push(m);
      }
    }

    function mvxSpawnStep(x, z, ry) {
      mvxEnsureStepPool();
      if (!mvxSteps.pool.length) return;
      var m = mvxSteps.pool[mvxSteps.idx % mvxSteps.pool.length];
      mvxSteps.idx++;
      mvxSteps.side = -mvxSteps.side;
      var sx = -Math.sin(ry) * 3 * mvxSteps.side;
      var sz = Math.cos(ry) * 3 * mvxSteps.side;
      m.position.set(x + sx - Math.cos(ry) * 4, 0.25, z + sz - Math.sin(ry) * 4);
      m.userData.life = 0.7;
      m.scale.setScalar(0.6);
      m.material.opacity = 0.42;
      m.visible = true;
    }

    function mvxTickSteps(dt, nowP) {
      if (!mvxSteps.pool.length && !(mvxSet.steps && mvxSet.quality !== 'low')) return;
      mvxSteps.pool.forEach(function (m) {
        if (!m.visible) return;
        m.userData.life -= dt;
        if (m.userData.life <= 0) { m.visible = false; return; }
        var k = 1 - m.userData.life / 0.7;
        m.scale.setScalar(0.6 + k * 1.2);
        m.material.opacity = 0.42 * (1 - k);
      });
      if (!mvxSet.steps || mvxSet.quality === 'low') return;
      var moving = !!(keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD'] ||
        keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight'] || Math.hypot(stickVec.x, stickVec.y) > stickDead);
      var sprint = keys['ShiftLeft'] || keys['ShiftRight'];
      if (moving && meEyeLift() < 1 && nowP - mvxSteps.lastAt > (sprint ? 170 : 240)) {
        mvxSteps.lastAt = nowP;
        mvxSpawnStep(me.x, me.y, me.ry || 0);
      }
      Object.keys(remotePos).forEach(function (email) {
        var rp = remotePos[email];
        if (!rp) return;
        var last = mvxSteps.remoteLast[email];
        if (!last) { mvxSteps.remoteLast[email] = { x: rp.x, y: rp.y, at: nowP }; return; }
        if (nowP - last.at < 260) return;
        var d = Math.hypot(rp.x - last.x, rp.y - last.y);
        last.x = rp.x; last.y = rp.y; last.at = nowP;
        if (d > 6 && d < 200 && Math.hypot(rp.x - me.x, rp.y - me.y) < 320) mvxSpawnStep(rp.x, rp.y, rp.ry || 0);
      });
    }

    function mvxSaveSettings() { mvxSave('settings', mvxSet); }

    function mvxPaintSettings() {
      var w = mvxSetUi.wrap;
      if (!w) return;
      var vol = w.querySelector('[data-set="vol"]');
      var sens = w.querySelector('[data-set="sens"]');
      vol.value = String(mvxSet.vol);
      sens.value = String(mvxSens());
      w.querySelector('[data-val="vol"]').textContent = Math.round(mvxSet.vol) + '%';
      w.querySelector('[data-val="sens"]').textContent = mvxSens().toFixed(1) + '×';
      w.querySelectorAll('[data-seg]').forEach(function (b) {
        var k = b.getAttribute('data-seg');
        var v = b.getAttribute('data-v');
        var cur = k === 'minimap' ? (mvxMini.on ? 'on' : 'off') : (k === 'steps' ? (mvxSet.steps ? 'on' : 'off') : String(mvxSet[k]));
        b.classList.toggle('on', cur === v);
      });
      var ph = w.querySelector('[data-val="sky"]');
      if (ph) ph.textContent = 'Ahora: ' + mvxPhaseName(mvxPhaseWeights());
    }

    function mvxOpenSettings() {
      var stage = root && root.querySelector('.mv-stage');
      if (!stage) return;
      if (!mvxSetUi.wrap) {
        var w = document.createElement('div');
        w.className = 'mvx-set-wrap';
        w.hidden = true;
        w.innerHTML =
          '<div class="mvx-set" role="dialog" aria-label="Ajustes del Metaverse">' +
          '<button type="button" class="mvx-set-close" data-act="close" aria-label="Cerrar">✕</button>' +
          '<h3>⚙️ Ajustes del Metaverse</h3>' +
          '<div class="mvx-set-row"><div class="mvx-set-lab"><span>🎵 Volumen de la música</span><span data-val="vol"></span></div>' +
          '<input type="range" min="0" max="100" step="1" data-set="vol" aria-label="Volumen de la música"></div>' +
          '<div class="mvx-set-row"><div class="mvx-set-lab"><span>🖱️ Sensibilidad (1ª persona)</span><span data-val="sens"></span></div>' +
          '<input type="range" min="0.4" max="2" step="0.1" data-set="sens" aria-label="Sensibilidad"></div>' +
          '<div class="mvx-set-row"><div class="mvx-set-lab"><span>🎨 Calidad gráfica</span><span></span></div><div class="mvx-seg">' +
          '<button type="button" data-seg="quality" data-v="low">Baja</button><button type="button" data-seg="quality" data-v="high">Alta</button></div>' +
          '<div class="mvx-set-hint">Baja: sin sombras ni huellas, ideal para móviles lentos.</div></div>' +
          '<div class="mvx-set-row"><div class="mvx-set-lab"><span>🌗 Cielo</span><span data-val="sky"></span></div><div class="mvx-seg">' +
          '<button type="button" data-seg="sky" data-v="auto">Auto</button><button type="button" data-seg="sky" data-v="dia">Día</button>' +
          '<button type="button" data-seg="sky" data-v="tarde">Tarde</button><button type="button" data-seg="sky" data-v="noche">Noche</button></div>' +
          '<div class="mvx-set-hint">Auto sigue la hora real: amanece, atardece y de noche salen las estrellas.</div></div>' +
          '<div class="mvx-set-row"><div class="mvx-set-lab"><span>🗺️ Minimapa</span><span></span></div><div class="mvx-seg">' +
          '<button type="button" data-seg="minimap" data-v="on">Sí</button><button type="button" data-seg="minimap" data-v="off">No</button></div></div>' +
          '<div class="mvx-set-row"><div class="mvx-set-lab"><span>👣 Huellas al caminar</span><span></span></div><div class="mvx-seg">' +
          '<button type="button" data-seg="steps" data-v="on">Sí</button><button type="button" data-seg="steps" data-v="off">No</button></div></div>' +
          '<div class="mvx-set-hint">Atajos: G gestos · M mapa · Esc cerrar · Espacio salto</div>' +
          '<button type="button" class="mvx-set-done" data-act="close">Listo</button>' +
          '</div>';
        w.addEventListener('click', function (ev) {
          if (ev.target === w) { mvxCloseSettings(); return; }
          var c = ev.target.closest && ev.target.closest('[data-act="close"]');
          if (c) { mvxCloseSettings(); return; }
          var b = ev.target.closest && ev.target.closest('[data-seg]');
          if (!b) return;
          var k = b.getAttribute('data-seg');
          var v = b.getAttribute('data-v');
          if (k === 'minimap') mvxSetMinimap(v === 'on');
          else if (k === 'steps') mvxSet.steps = (v === 'on');
          else if (k === 'quality') { mvxSet.quality = v === 'low' ? 'low' : 'high'; mvxApplyQuality(); }
          else if (k === 'sky') { mvxSet.sky = v; mvxSky.lastApply = 0; mvxSky.lastKey = ''; }
          mvxSaveSettings();
          mvxPaintSettings();
        });
        w.addEventListener('input', function (ev) {
          var k = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-set');
          if (!k) return;
          var v = parseFloat(ev.target.value);
          if (!isFinite(v)) return;
          if (k === 'vol') mvxSet.vol = Math.max(0, Math.min(100, v));
          else if (k === 'sens') mvxSet.sens = Math.max(0.4, Math.min(2, v));
          mvxSaveSettings();
          mvxPaintSettings();
        });
        w.addEventListener('keydown', function (ev) { ev.stopPropagation(); if (ev.key === 'Escape') mvxCloseSettings(); });
        stage.appendChild(w);
        mvxSetUi.wrap = w;
      }
      mvxPaintSettings();
      mvxSetUi.wrap.hidden = false;
      void mvxSetUi.wrap.offsetWidth;
      mvxSetUi.wrap.classList.add('show');
    }

    function mvxCloseSettings() {
      var w = mvxSetUi.wrap;
      if (!w || w.hidden) return;
      w.classList.remove('show');
      setTimeout(function () { if (w && !w.classList.contains('show')) w.hidden = true; }, 180);
    }

    function mvxFrameC(dt, nowP) {
      if (bgAudio) {
        var tv = Math.max(0, Math.min(1, (+mvxSet.vol || 0) / 100));
        if (Math.abs((bgAudio.volume || 0) - tv) > 0.004) { try { bgAudio.volume = tv; } catch (eV) {} }
      }
      mvxApplySky(nowP);
      mvxTickSteps(dt, nowP);
    }

    function mvxInitC() {
      ensureMvxCssC();
      if (viewToggle && viewToggle.parentNode) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'mvx-set-btn';
        b.title = 'Ajustes: música, sensibilidad, gráficos y cielo';
        b.setAttribute('aria-label', 'Ajustes');
        b.textContent = '⚙️';
        b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); mvxOpenSettings(); });
        viewToggle.parentNode.insertBefore(b, viewToggle.nextSibling);
        mvxSetUi.btn = b;
      }
    }

    function mvxCleanupC() {
      try {
        if (mvxSky.group) {
          if (scene) scene.remove(mvxSky.group);
          disposeObject3D(mvxSky.group);
        }
      } catch (eS) {}
      mvxSky.group = null; mvxSky.dome = null; mvxSky.stars = null;
      try {
        mvxSteps.pool.forEach(function (m) { if (scene) scene.remove(m); disposeObject3D(m); });
      } catch (eP) {}
      mvxSteps.pool = [];
    }

    /* --- Tanda 3 · selector de mundos con vista previa y HUD del móvil --- */
    var MVX_WORLD_DESC = { plaza: 'Fuente, farolas y puestos', parque: 'Árboles, lago y bancos', ciudad: 'Edificios, calles y galería' };
    var mvxWorlds = { wrap: null, prev: {} };

    function ensureMvxCssD() {
      if (document.getElementById('mvx-bigupd3-css-d')) return;
      var st = document.createElement('style');
      st.id = 'mvx-bigupd3-css-d';
      st.textContent =
        '.mv-root .mv-world-bar.mvx-click{pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent;}' +
        '.mv-root .mv-world-bar.mvx-click::after{content:" ▾";opacity:0.85;}' +
        '.mv-world-btn .mvx-wthumb{width:38px;height:38px;flex:0 0 38px;border-radius:9px;background-size:cover;background-position:center;border:1px solid rgba(255,255,255,0.3);' +
          'display:inline-flex;align-items:flex-end;justify-content:flex-end;font-size:0.9rem;line-height:1;padding:1px;box-sizing:border-box;margin-right:8px;vertical-align:middle;}' +
        '.mv-world-btn.mvx-wbtn{display:flex;align-items:center;text-align:left;}' +
        '.mv-world-btn .mvx-wtxt{display:flex;flex-direction:column;min-width:0;}' +
        '.mv-world-btn .mvx-wtxt b{font-size:0.82rem;}' +
        '.mv-world-btn .mvx-wtxt small{font-size:0.66rem;opacity:0.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
        '.mvx-wp-wrap{position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);pointer-events:auto;opacity:0;transition:opacity .18s ease;}' +
        '.mvx-wp-wrap.show{opacity:1;}' +
        '.mvx-wp-wrap[hidden]{display:none;}' +
        '.mvx-wp{position:relative;width:min(560px,92%);max-height:90%;overflow:auto;padding:16px;border-radius:18px;background:rgba(12,22,16,0.95);border:1px solid rgba(255,255,255,0.18);' +
          'box-shadow:0 14px 40px rgba(0,0,0,0.55);color:#fff;transform:translateY(10px) scale(0.96);transition:transform .24s cubic-bezier(0.22,1.4,0.36,1);}' +
        '.mvx-wp-wrap.show .mvx-wp{transform:none;}' +
        '.mvx-wp h3{margin:0 0 12px;font-size:1rem;font-weight:800;}' +
        '.mvx-wp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}' +
        '.mvx-wp-card{position:relative;margin:0;padding:0 0 8px;border-radius:14px;overflow:hidden;cursor:pointer;color:#fff;text-align:left;background:rgba(255,255,255,0.06);' +
          'border:1px solid rgba(255,255,255,0.2);transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease;}' +
        '.mvx-wp-card:hover{transform:translateY(-2px);border-color:#9dffc2;box-shadow:0 6px 18px rgba(0,0,0,0.4);}' +
        '.mvx-wp-card.on{border-color:#34d17a;box-shadow:0 0 0 2px rgba(52,209,122,0.45);}' +
        '.mvx-wp-img{display:block;width:100%;aspect-ratio:1/1;background-size:cover;background-position:center;}' +
        '.mvx-wp-name{display:block;padding:7px 9px 0;font-size:0.88rem;font-weight:800;}' +
        '.mvx-wp-desc{display:block;padding:2px 9px 0;font-size:0.68rem;opacity:0.78;line-height:1.3;}' +
        '.mvx-wp-here{position:absolute;left:6px;top:6px;padding:2px 7px;border-radius:999px;font-size:0.62rem;font-weight:800;background:#34d17a;color:#04170c;}' +
        '.mvx-wp-close{position:absolute;right:10px;top:10px;margin:0;width:30px;height:30px;padding:0;border-radius:50%;font-size:0.85rem;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;}' +
        '@media (max-width:480px){.mvx-wp-grid{grid-template-columns:1fr;}.mvx-wp-card{display:grid;grid-template-columns:84px 1fr;align-items:center;padding:0;}' +
          '.mvx-wp-img{width:84px;height:84px;aspect-ratio:auto;}.mvx-wp-name,.mvx-wp-desc{padding-left:10px;}}' +
        /* Escritorio: la fila de emojis no se sale de la ventana ni pisa el mapa */
        '.mv-root:not(.mv-mobile-controls) .mv-emotes{max-width:calc(100% - 20px);overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;}' +
        /* Móvil: el HUD no se mete debajo del mapa; la pista de teclado no aplica */
        'body.phone-mode .mv-root .mv-hint,.mv-root.mv-mobile-controls .mv-hint{display:none;}' +
        'body.phone-mode .mv-root .mv-hud,.mv-root.mv-mobile-controls .mv-hud{right:112px;}' +
        /* Móvil: la barra de voz va encima de los emojis, lejos de los joysticks y botones */
        'body.phone-mode .mv-root .mv-voice-bar,.mv-root.mv-mobile-controls .mv-voice-bar{bottom:296px;left:8px;}' +
        /* Móvil: botones de acción en columna, sin pisar el joystick verde ni el rojo */
        '.mv-root .mv-action-pad.mv-action-visible,body.phone-mode .mv-root .mv-action-pad{display:flex;flex-direction:column;align-items:center;gap:8px;}' +
        '.mv-root .mv-action-pad .mv-action-btn{margin-top:0 !important;}' +
        'body.phone-mode .mv-root .mv-action-btn,.mv-root.mv-arm-stick-on .mv-action-btn{width:52px;height:52px;font-size:1.25rem;}' +
        'body.phone-mode .mv-root .mv-action-pad .mvx-gest-btn,.mv-root.mv-arm-stick-on .mv-action-pad .mvx-gest-btn{width:52px;height:52px;}' +
        '@media (max-width:370px){body.phone-mode .mv-root .mv-action-pad,.mv-root.mv-arm-stick-on .mv-action-pad{right:132px;bottom:20px;gap:6px;}' +
          'body.phone-mode .mv-root .mv-action-btn,.mv-root.mv-arm-stick-on .mv-action-btn,body.phone-mode .mv-root .mv-action-pad .mvx-gest-btn{width:46px;height:46px;font-size:1.1rem;}' +
          'body.phone-mode .mv-root .mv-emotes,.mv-root.mv-arm-stick-on .mv-emotes{bottom:212px;}' +
          'body.phone-mode .mv-root .mv-voice-bar,.mv-root.mv-mobile-controls .mv-voice-bar{bottom:270px;}}';
      document.head.appendChild(st);
    }

    function mvxWorldPreview(wid) {
      if (mvxWorlds.prev[wid]) return mvxWorlds.prev[wid];
      var keepW = currentWorld;
      var keepFor = mvxMini.staticFor, keepCv = mvxMini.staticCv;
      var url = '';
      try {
        currentWorld = wid;
        mvxMini.staticFor = '';
        var c = mvxBuildMiniStatic(160);
        url = c.toDataURL('image/png');
      } catch (eP) { url = ''; }
      currentWorld = keepW;
      mvxMini.staticFor = keepFor;
      mvxMini.staticCv = keepCv;
      if (url) mvxWorlds.prev[wid] = url;
      return url;
    }

    function mvxWorldBtnHtml(w) {
      var url = mvxWorldPreview(w.id);
      return '<span class="mvx-wthumb" style="background-image:url(' + url + ')">' + w.emoji + '</span>' +
        '<span class="mvx-wtxt"><b>' + esc(w.name) + '</b><small>' + esc(MVX_WORLD_DESC[w.id] || '') + '</small></span>';
    }

    function mvxOpenWorlds() {
      var stage = root && root.querySelector('.mv-stage');
      if (!stage) return;
      if (!mvxWorlds.wrap) {
        var wrap = document.createElement('div');
        wrap.className = 'mvx-wp-wrap';
        wrap.hidden = true;
        wrap.innerHTML = '<div class="mvx-wp" role="dialog" aria-label="Elegir mundo"><button type="button" class="mvx-wp-close" data-act="close" aria-label="Cerrar">✕</button>' +
          '<h3>🌍 Elige mundo</h3><div class="mvx-wp-grid" data-mvx="grid"></div></div>';
        wrap.addEventListener('click', function (ev) {
          if (ev.target === wrap) { mvxCloseWorlds(); return; }
          if (ev.target.closest && ev.target.closest('[data-act="close"]')) { mvxCloseWorlds(); return; }
          var card = ev.target.closest && ev.target.closest('[data-world]');
          if (!card) return;
          var wid = card.getAttribute('data-world');
          mvxCloseWorlds();
          if (wid && wid !== currentWorld) {
            switchWorld(wid);
            toast((WORLD_BY_ID[wid] || {}).emoji + ' ' + worldName(wid));
          }
        });
        stage.appendChild(wrap);
        mvxWorlds.wrap = wrap;
      }
      var grid = mvxWorlds.wrap.querySelector('[data-mvx="grid"]');
      grid.innerHTML = '';
      WORLDS.forEach(function (w) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'mvx-wp-card' + (w.id === currentWorld ? ' on' : '');
        b.setAttribute('data-world', w.id);
        var here = w.id === currentWorld ? '<span class="mvx-wp-here">Estás aquí</span>' : '';
        b.innerHTML = '<span class="mvx-wp-img" style="background-image:url(' + mvxWorldPreview(w.id) + ')"></span>' + here +
          '<span><span class="mvx-wp-name">' + w.emoji + ' ' + esc(w.name) + '</span><span class="mvx-wp-desc">' + esc(MVX_WORLD_DESC[w.id] || '') + '</span></span>';
        grid.appendChild(b);
      });
      mvxWorlds.wrap.hidden = false;
      void mvxWorlds.wrap.offsetWidth;
      mvxWorlds.wrap.classList.add('show');
    }

    function mvxCloseWorlds() {
      var w = mvxWorlds.wrap;
      if (!w || w.hidden) return;
      w.classList.remove('show');
      setTimeout(function () { if (w && !w.classList.contains('show')) w.hidden = true; }, 180);
    }

    function mvxInitD() {
      ensureMvxCssD();
      if (worldBarEl) {
        worldBarEl.classList.add('mvx-click');
        worldBarEl.title = 'Cambiar de mundo';
        worldBarEl.setAttribute('role', 'button');
        worldBarEl.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); mvxOpenWorlds(); });
      }
      try { renderWorlds(); } catch (eRw) {}
    }

    /* --- Tanda 3 · farolas de noche, sol y luna, mapa ampliable y aviso de novedades --- */
    var mvxGlow = { group: null, world: '', tex: null, sun: null, moon: null };

    function ensureMvxCssE() {
      if (document.getElementById('mvx-bigupd3-css-e')) return;
      var st = document.createElement('style');
      st.id = 'mvx-bigupd3-css-e';
      st.textContent =
        '.mvx-minimap canvas{cursor:zoom-in;transition:width .2s ease,height .2s ease;}' +
        '.mvx-minimap.big{width:208px;}' +
        '.mvx-minimap.big canvas{width:200px;height:200px;cursor:zoom-out;}' +
        '.mv-root.mv-mobile-controls .mvx-minimap.big,body.phone-mode .mv-root .mvx-minimap.big{width:168px;}' +
        '.mv-root.mv-mobile-controls .mvx-minimap.big canvas,body.phone-mode .mv-root .mvx-minimap.big canvas{width:160px;height:160px;}' +
        '.mvx-news{position:absolute;left:50%;top:58px;z-index:7;transform:translateX(-50%);max-width:min(440px,88%);padding:9px 14px;border-radius:14px;' +
          'background:rgba(10,20,14,0.88);border:1px solid rgba(157,255,194,0.45);color:#eafff1;font-size:0.76rem;line-height:1.4;text-align:center;' +
          'box-shadow:0 8px 24px rgba(0,0,0,0.45);pointer-events:auto;cursor:pointer;animation:mvxNewsIn .35s cubic-bezier(0.22,1.4,0.36,1);transition:opacity .4s ease;}' +
        '.mvx-news b{color:#9dffc2;}' +
        '.mvx-news.out{opacity:0;}' +
        'body.phone-mode .mv-root .mvx-news{top:auto;bottom:360px;}' +
        '@keyframes mvxNewsIn{from{opacity:0;transform:translate(-50%,-8px);}to{opacity:1;transform:translate(-50%,0);}}';
      document.head.appendChild(st);
    }

    function mvxGlowTexture() {
      if (mvxGlow.tex) return mvxGlow.tex;
      var c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      var g = c.getContext('2d');
      var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      mvxGlow.tex = new THREE.CanvasTexture(c);
      return mvxGlow.tex;
    }

    function mvxBuildLampGlow() {
      if (!THREE || !scene) return;
      if (mvxGlow.group && mvxGlow.world === currentWorld) return;
      if (mvxGlow.group) {
        scene.remove(mvxGlow.group);
        mvxGlow.group.traverse(function (ch) { if (ch.geometry) ch.geometry.dispose(); if (ch.material) ch.material.dispose(); });
      }
      var grp = new THREE.Group();
      grp.name = 'mvx-lamp-glow';
      var tex = mvxGlowTexture();
      var sMat = new THREE.SpriteMaterial({ map: tex, color: 0xffcf7a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      var pMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffc46b, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      var pGeo = new THREE.PlaneGeometry(46, 46);
      getDecor(currentWorld).forEach(function (d) {
        if (d.type !== 'lamp') return;
        var s = new THREE.Sprite(sMat);
        s.scale.set(16, 16, 1);
        s.position.set(d.x, 14.6, d.y + 2.4);
        grp.add(s);
        var pool = new THREE.Mesh(pGeo, pMat);
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(d.x, 0.2, d.y + 2.4);
        grp.add(pool);
      });
      grp.userData.sMat = sMat;
      grp.userData.pMat = pMat;
      scene.add(grp);
      mvxGlow.group = grp;
      mvxGlow.world = currentWorld;
    }

    function mvxEnsureSunMoon() {
      if (mvxGlow.sun || !mvxSky.group || !THREE) return;
      var tex = mvxGlowTexture();
      var sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xfff1c4, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      sun.scale.set(320, 320, 1);
      sun.position.set(0.39 * 1700, 0.86 * 1700, -0.26 * 1700);
      sun.renderOrder = -8;
      var moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xdfe8ff, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      moon.scale.set(150, 150, 1);
      moon.position.set(-0.5 * 1700, 0.7 * 1700, 0.5 * 1700);
      moon.renderOrder = -8;
      mvxSky.group.add(sun);
      mvxSky.group.add(moon);
      mvxGlow.sun = sun;
      mvxGlow.moon = moon;
    }

    function mvxFrameE() {
      if (!THREE || !scene) return;
      mvxBuildLampGlow();
      mvxEnsureSunMoon();
      var w = mvxPhaseWeights();
      var night = Math.min(1, w.noche + w.tarde * 0.45);
      if (mvxGlow.group) {
        mvxGlow.group.userData.sMat.opacity = 0.95 * night;
        mvxGlow.group.userData.pMat.opacity = 0.32 * night;
        mvxGlow.group.visible = night > 0.02;
      }
      if (mvxGlow.sun) {
        mvxGlow.sun.material.opacity = 0.9 * w.dia + 0.75 * w.tarde;
        mvxGlow.sun.material.color.setHex(w.tarde > w.dia ? 0xffb36b : 0xfff1c4);
        mvxGlow.sun.position.y = (0.86 - 0.62 * w.tarde) * 1700;
      }
      if (mvxGlow.moon) mvxGlow.moon.material.opacity = 0.85 * w.noche;
    }

    function mvxShowNews() {
      if (mvxLoad('news3', false)) return;
      var stage = root && root.querySelector('.mv-stage');
      if (!stage) return;
      var n = document.createElement('div');
      n.className = 'mvx-news';
      n.setAttribute('role', 'status');
      n.innerHTML = '✨ <b>Novedades:</b> 😀 gestos (G) · 🗺️ mapa (M) · ⚙️ ajustes · ☀️🌙 día y noche · toca a alguien para ver su ficha';
      stage.appendChild(n);
      mvxSave('news3', true);
      var gone = false;
      function hide() {
        if (gone) return;
        gone = true;
        n.classList.add('out');
        setTimeout(function () { try { n.remove(); } catch (eN) {} }, 450);
      }
      n.addEventListener('click', hide);
      setTimeout(hide, 9000);
    }

    function mvxInitE() {
      ensureMvxCssE();
      if (mvxMini.cv && mvxMini.el) {
        mvxMini.cv.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          mvxMini.el.classList.toggle('big');
          mvxMini.lastDraw = 0;
        });
        mvxMini.cv.title = 'Toca para ampliar o reducir';
      }
      setTimeout(function () { if (!closed) mvxShowNews(); }, 2500);
    }

    function mvxCleanupE() {
      try {
        if (mvxGlow.group) {
          if (scene) scene.remove(mvxGlow.group);
          mvxGlow.group.traverse(function (ch) { if (ch.geometry) ch.geometry.dispose(); if (ch.material) ch.material.dispose(); });
        }
        if (mvxGlow.tex) mvxGlow.tex.dispose();
      } catch (eG) {}
      mvxGlow.group = null; mvxGlow.tex = null; mvxGlow.sun = null; mvxGlow.moon = null;
    }

    try { mvxInit(); } catch (eMvxInit) { console.warn('[metaverse] mvx init', eMvxInit); }
    try { mvxInitB(); } catch (eMvxInitB) { console.warn('[metaverse] mvx minimap', eMvxInitB); }
    try { mvxInitC(); } catch (eMvxInitC) { console.warn('[metaverse] mvx ajustes', eMvxInitC); }
    try { mvxInitD(); } catch (eMvxInitD) { console.warn('[metaverse] mvx mundos', eMvxInitD); }
    try { mvxInitE(); } catch (eMvxInitE) { console.warn('[metaverse] mvx noche', eMvxInitE); }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('click', onCanvasClick);
    initThree().then(function () {
      if (closed) return;
      if (!document.getElementById('mv-avatar-shop-css')) {
        var avCss = document.createElement('style');
        avCss.id = 'mv-avatar-shop-css';
        avCss.textContent = '.mv-coins{font-weight:700;margin:0 0 6px;font-size:.78rem;flex-shrink:0}' +
          '.mv-avatar-shop{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;padding-right:2px}' +
          '.mv-av-label{font-size:.72rem;opacity:.85;margin:8px 0 3px;color:#fff;position:sticky;top:0;background:rgba(12,24,18,0.92);padding:3px 0;z-index:1}' +
          '.mv-av-opt{display:block;width:100%;text-align:left;margin:0 0 4px !important;padding:7px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.28);background:rgba(0,0,0,.28);color:#fff;cursor:pointer;font-size:.74rem;box-sizing:border-box}' +
          '.mv-av-opt.on{border-color:#34d17a;box-shadow:0 0 0 2px rgba(52,209,122,.35)}' +
          '.mv-av-msg{font-size:.74rem;color:#ffb4b4;min-height:1em;margin-top:4px;flex-shrink:0}';
        document.head.appendChild(avCss);
      }
      try { if (mvxSet.quality === 'low') mvxApplyQuality(); } catch (eMvxQ) {}
      renderAvatarShop();
      loadAvatarWallet();
      loadProgressThenConnect();
      loadPublicHistory();
      animId = requestAnimationFrame(animate);
    });

    pollPartyCycle();
    partyCycleTimer = setInterval(pollPartyCycle, 1000);
    startMetaverseBg();
    return function cleanup() {
      closed = true;
      if (partyPollTimer) { clearInterval(partyPollTimer); partyPollTimer = null; }
      if (partyCycleTimer) { clearInterval(partyCycleTimer); partyCycleTimer = null; }
      try { mvxCleanup(); } catch (eMvxC) {}
      try { stopMetaverseBg(); } catch (eBg) {}
      if (global.__mvEnterRoom === enterRoom) {
        try { global.__mvEnterRoom = null; } catch (eClr) {}
      }
      try { saveProgress(true); } catch (eSave) {}
      try { destroyVoiceEngine(); } catch (e0) {}
      try { document.removeEventListener('visibilitychange', onVisVoice); } catch (eVis) {}
      try { document.removeEventListener('visibilitychange', onVisWs); } catch (eVis2) {}
      try { window.removeEventListener('online', onVisWs); } catch (eOn) {}
      clearWsHeartbeat();
      clearWsReconnect();
      try { container.removeEventListener('pointerdown', unlockListenAudio); } catch (ePd) {}
      try { container.removeEventListener('pointerdown', onReclaimTab); } catch (eRc) {}
      try {
        if (ws) {
          try { ws.onmessage = null; ws.onclose = null; ws.onerror = null; } catch (eH) {}
          ws.close();
        }
      } catch (e) {}
      ws = null;
      if (animId) cancelAnimationFrame(animId);
      document.removeEventListener('keydown', onKeyDown);
      try { canvas.removeEventListener('pointermove', onArmPointerMove); } catch (eArm) {}
      document.removeEventListener('keyup', onKeyUp);
      detachSideSwipeWindow();
      sideSwipe = null;
      if (sideEl) {
        sideEl.removeEventListener('pointerdown', onSideSwipeDown);
        if (sideSwipeKillClick) sideEl.removeEventListener('click', sideSwipeKillClick, true);
      }
      global.removeEventListener('resize', onPhoneModeResize);
      try { if (phoneModeObserver) phoneModeObserver.disconnect(); } catch (e5) {}
      resetStick();
      releaseArmStick(true);
      keys['ShiftLeft'] = false;
      if (ro) ro.disconnect();
      else global.removeEventListener('resize', resize);
      try {
        Object.keys(nameLabels).forEach(removeNameLabel);
        Object.keys(avatarMeshes).forEach(function (em) {
          if (scene) scene.remove(avatarMeshes[em]);
          disposeObject3D(avatarMeshes[em]);
        });
        avatarMeshes = {};
        particleMeshes.forEach(function (m) {
          if (scene) scene.remove(m);
          disposeObject3D(m);
        });
        particleMeshes = [];
        clearWorldRoot();
        if (renderer) {
          renderer.dispose();
          if (renderer.forceContextLoss) renderer.forceContextLoss();
        }
        renderer = null; scene = null; camera = null; THREE = null; threeReady = false;
      } catch (e3d) {}
    };
  }

  global.renderMetaverseApp = renderMetaverseApp;
  global.setMetaversePendingRoom = setMetaversePendingRoom;
  global.takeMetaversePendingRoom = takeMetaversePendingRoom;
  global.openMetaverseRoom = openMetaverseRoom;
})(typeof window !== 'undefined' ? window : this);
