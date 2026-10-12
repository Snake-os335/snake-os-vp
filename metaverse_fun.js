/* cache-bust __CACHE_BUST__ — Doganiero Metaverse 2D fun: bones, emotes, highfive, d-pad */
(function (global) {
  'use strict';

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

  var EMOTES = ['👋', '😂', '🦴', '❤️', '🎉', '🐕'];

  var WORLD_BY_ID = {};
  WORLDS.forEach(function (w) { WORLD_BY_ID[w.id] = w; });

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
      for (i = 0; i < 12; i++) {
        var ang = (i / 12) * Math.PI * 2;
        items.push({ type: 'tree', x: 400 + Math.cos(ang) * 220, y: 400 + Math.sin(ang) * 220 });
      }
    } else if (worldId === 'parque') {
      items.push({ type: 'circle', x: 400, y: 400, r: 70, fill: '#5a9e6a' });
      items.push({ type: 'rect', x: 280, y: 250, w: 100, h: 40, fill: '#6b4423' });
      for (i = 0; i < 20; i++) {
        items.push({ type: 'tree', x: 80 + (i % 5) * 150 + (i % 2) * 20, y: 90 + Math.floor(i / 5) * 160 });
      }
      items.push({ type: 'circle', x: 600, y: 200, r: 40, fill: '#4a90d9' });
    } else {
      for (i = 0; i < 10; i++) {
        items.push({ type: 'rect', x: 80 + (i % 5) * 140, y: 100 + Math.floor(i / 5) * 280, w: 60, h: 120 + (i % 3) * 30, fill: i % 2 ? '#5a6574' : '#3d4654' });
      }
      items.push({ type: 'rect', x: 300, y: 380, w: 200, h: 40, fill: '#6b7280' });
    }
    return items;
  }

  function renderMetaverseApp(container, opts) {
    opts = opts || {};
    var user = opts.currentUser || global.currentUser;
    if (!user || !user.email) {
      container.innerHTML = '<p class="sub">Inicia sesión para entrar en Doganiero Metaverse.</p>';
      return function () {};
    }

    container.innerHTML =
      '<div class="mv-root">' +
      '  <div class="mv-stage">' +
      '    <canvas class="mv-canvas"></canvas>' +
      '    <div class="mv-hud">' +
      '      <div class="mv-title"><img class="app-icon-img" src="/static/assets/doganiero-metaverse-logo.jpg" alt=""> Doganiero Metaverse</div>' +
      '      <div class="mv-hint">WASD mover · Shift correr · E / botones emotear · recoge 🦴 · acercate y choca la mano</div>' +
      '      <div class="mv-status" data-mv="status">Conectando…</div>' +
      '      <div class="mv-score" data-mv="score">🦴 0 huesitos</div>' +
      '      <div class="mv-world-bar" data-mv="worldBar"></div>' +
      '    </div>' +
      '    <div class="mv-emotes" data-mv="emotes"></div>' +
      '    <div class="mv-dpad" data-mv="dpad">' +
      '      <button type="button" class="mv-dpad-btn up" data-k="ArrowUp">▲</button>' +
      '      <button type="button" class="mv-dpad-btn down" data-k="ArrowDown">▼</button>' +
      '      <button type="button" class="mv-dpad-btn left" data-k="ArrowLeft">◀</button>' +
      '      <button type="button" class="mv-dpad-btn right" data-k="ArrowRight">▶</button>' +
      '    </div>' +
      '    <div class="mv-toast" data-mv="toast"></div>' +
      '    <div class="mv-room-overlay hidden" data-mv="roomOverlay">' +
      '      <div class="mv-room-card">' +
      '        <div class="mv-room-card-title" data-mv="roomTitle">Sala</div>' +
      '        <p class="mv-room-empty" data-mv="roomEmpty">No hay eventos por ahora — ¡explora y chatea!</p>' +
      '        <button type="button" class="mv-room-leave" data-mv="roomLeave">Salir de la sala</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <aside class="mv-side">' +
      '    <div class="mv-section"><div class="mv-sec-title">Mundos</div><div class="mv-worlds" data-mv="worlds"></div></div>' +
      '    <div class="mv-section"><div class="mv-sec-title">Salas de eventos</div><div class="mv-rooms" data-mv="rooms"></div></div>' +
      '    <div class="mv-section"><div class="mv-sec-title">En línea <span class="mv-chat-target" data-mv="worldLabel">Plaza</span></div><div class="mv-online" data-mv="online"></div></div>' +
      '    <div class="mv-section mv-chat-sec">' +
      '      <div class="mv-sec-title">Chat <span class="mv-chat-target" data-mv="chatTarget">Sala pública</span></div>' +
      '      <div class="mv-messages" data-mv="messages"></div>' +
      '      <form class="mv-compose" data-mv="form"><input type="text" maxlength="500" placeholder="Escribe un mensaje…" data-mv="input" autocomplete="off"><button type="submit">Enviar</button></form>' +
      '      <button type="button" class="link-btn mv-public-btn" data-mv="publicBtn">Volver a chat público</button>' +
      '    </div>' +
      '  </aside>' +
      '</div>';

    var root = container.querySelector('.mv-root');
    var canvas = container.querySelector('.mv-canvas');
    var ctx = canvas.getContext('2d');
    var statusEl = container.querySelector('[data-mv="status"]');
    var scoreEl = container.querySelector('[data-mv="score"]');
    var onlineEl = container.querySelector('[data-mv="online"]');
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
    var roomLeaveBtn = container.querySelector('[data-mv="roomLeave"]');
    var emotesEl = container.querySelector('[data-mv="emotes"]');
    var toastEl = container.querySelector('[data-mv="toast"]');
    var dpadEl = container.querySelector('[data-mv="dpad"]');

    var closed = false;
    var ws = null;
    var chatPeer = null;
    var players = {};
    var remotePos = {};
    var bones = [];
    var particles = [];
    var floaters = {};
    var myScore = 0;
    var currentWorld = 'plaza';
    var currentRoom = null;
    var me = { x: 400 + (Math.random() - 0.5) * 60, y: 400 + (Math.random() - 0.5) * 60, ry: 0 };
    var keys = {};
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

    function setStatus(t) { if (statusEl) statusEl.textContent = t; }
    function setScore(n) {
      myScore = n || 0;
      if (scoreEl) scoreEl.textContent = '🦴 ' + myScore + ' huesitos';
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
        btn.innerHTML = '<span>' + r.emoji + '</span><span>' + esc(r.name) + '</span>';
        btn.addEventListener('click', function () { enterRoom(r.id); });
        roomsEl.appendChild(btn);
      });
    }

    function showRoomOverlay(room) {
      if (!roomOverlay) return;
      roomOverlay.classList.remove('hidden');
      if (roomTitleEl) roomTitleEl.textContent = (room.emoji || '') + ' ' + room.name;
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
      showRoomOverlay(room);
      renderRooms();
      toast('Entraste a ' + room.name);
    }

    function leaveRoom() {
      currentRoom = null;
      if (roomOverlay) roomOverlay.classList.add('hidden');
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'enter_room', room: null }));
      sendMove(true);
      renderRooms();
    }
    if (roomLeaveBtn) roomLeaveBtn.addEventListener('click', leaveRoom);

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
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'set_world', world: wid, x: me.x, y: me.y, ry: me.ry }));
      }
      if (after) after();
    }

    function renderOnline() {
      if (!onlineEl) return;
      var list = Object.keys(players).map(function (k) { return players[k]; })
        .filter(function (p) { return p && p.email; })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      onlineEl.innerHTML = '';
      if (!list.length) {
        onlineEl.innerHTML = '<div class="mv-empty">Solo tú por ahora — ¡invita a alguien!</div>';
        return;
      }
      list.forEach(function (p) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mv-user' + (p.email === user.email ? ' self' : '') + (chatPeer === p.email ? ' active' : '');
        var roomHint = '';
        if (p.room) {
          var rr = EVENT_ROOMS.filter(function (r) { return r.id === p.room; })[0];
          if (rr) roomHint = ' · ' + rr.emoji;
        }
        btn.innerHTML = '<span class="mv-u-av">' + esc(p.avatar || '🐶') + '</span><span class="mv-u-name">' +
          esc(p.name) + roomHint + '</span>' + (p.email === user.email ? '<span class="mv-u-you">tú</span>' : '');
        if (p.email !== user.email) {
          btn.addEventListener('click', function () { selectPeer(p.email, p.name); });
        }
        onlineEl.appendChild(btn);
      });
      setStatus('En línea · ' + Object.keys(players).length + ' en ' + worldName(currentWorld));
    }

    function selectPeer(email, name) {
      chatPeer = email;
      if (chatTargetEl) chatTargetEl.textContent = 'Con ' + (name || email);
      clearMessages();
      fetch('/api/metaverse/messages?peer=' + encodeURIComponent(email), { credentials: 'include' })
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

    function sendEmote(emoji) {
      myEmote = emoji;
      myEmoteUntil = performance.now() + 2500;
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'emote', emoji: emoji }));
    }

    function upsertPlayer(p) {
      if (!p || !p.email) return;
      if (p.email === user.email) {
        if (typeof p.x === 'number') { me.x = p.x; me.y = p.y; me.ry = p.ry || 0; }
        return;
      }
      players[p.email] = Object.assign({}, players[p.email] || {}, p);
      var prev = remotePos[p.email];
      if (!prev) {
        remotePos[p.email] = { x: p.x, y: p.y, ry: p.ry || 0, tx: p.x, ty: p.y, try: p.ry || 0 };
      } else {
        prev.tx = p.x; prev.ty = p.y; prev.try = p.ry || 0;
      }
      if (p.room) {
        var rr = EVENT_ROOMS.filter(function (r) { return r.id === p.room; })[0];
      }
      renderOnline();
    }

    function removePlayer(email) {
      delete players[email];
      delete remotePos[email];
      delete floaters[email];
      renderOnline();
      if (chatPeer === email) selectPublic();
    }

    function spawnParticles(x, y, color) {
      for (var i = 0; i < 14; i++) {
        particles.push({
          x: x, y: y,
          vx: (Math.random() - 0.5) * 120,
          vy: (Math.random() - 0.5) * 120 - 40,
          life: 0.6 + Math.random() * 0.4,
          color: color || '#ffb84d',
        });
      }
    }

    function connectWs() {
      if (closed) return;
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      var url = proto + '//' + location.host + '/api/metaverse/ws?world=' + encodeURIComponent(currentWorld);
      try { ws = new WebSocket(url); }
      catch (e) { setStatus('Error WebSocket'); return; }
      ws.onopen = function () { setStatus('Conectado'); sendMove(true); };
      ws.onclose = function () {
        setStatus('Reconectando…');
        if (!closed) setTimeout(connectWs, 2000);
      };
      ws.onerror = function () {};
      ws.onmessage = function (ev) {
        var msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (!msg || !msg.type) return;
        if (msg.type === 'welcome') {
          players = {};
          remotePos = {};
          if (msg.you) {
            me.x = msg.you.x; me.y = msg.you.y; me.ry = msg.you.ry || 0;
            if (typeof msg.you.score === 'number') setScore(msg.you.score);
          }
          currentWorld = msg.world || currentWorld;
          bones = msg.bones || [];
          (msg.players || []).forEach(upsertPlayer);
          clearMessages();
          (msg.history || []).forEach(appendMsg);
          renderWorlds();
          renderRooms();
          renderOnline();
          setStatus('En línea · ' + Object.keys(players).length + ' en ' + worldName(currentWorld));
        } else if (msg.type === 'join') {
          upsertPlayer(msg.player);
        } else if (msg.type === 'leave') {
          removePlayer(msg.email);
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
          (msg.players || []).forEach(upsertPlayer);
          clearMessages();
          (msg.history || []).forEach(appendMsg);
          renderWorlds();
          renderRooms();
          renderOnline();
        } else if (msg.type === 'emote') {
          floaters[msg.email] = { emoji: msg.emoji, until: performance.now() + 2500 };
          if (msg.email === user.email) {
            myEmote = msg.emoji;
            myEmoteUntil = performance.now() + 2500;
          }
        } else if (msg.type === 'bone_collected') {
          bones = msg.bones || bones;
          if (msg.collected_id) {
            var gone = (msg.bones || []).length;
          }
          spawnParticles(me.x, me.y, '#ffd56a');
          if (msg.by === user.email) {
            setScore(msg.score);
            toast('🦴 +1 huesito!');
            spawnParticles(me.x, me.y, '#fff3a0');
          } else {
            toast((msg.by_name || 'Alguien') + ' recogió un 🦴');
          }
        } else if (msg.type === 'highfive') {
          toast('🙌 ¡Choca esos cinco!');
          spawnParticles(me.x, me.y, '#ff7ab6');
        } else if (msg.type === 'error') {
          setStatus(msg.detail || 'Error');
        }
      };
    }

    function resize() {
      if (!root || !canvas) return;
      var stage = root.querySelector('.mv-stage');
      cssW = stage.clientWidth || 320;
      cssH = stage.clientHeight || 240;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function sendMove(force) {
      if (!ws || ws.readyState !== 1) return;
      var now = performance.now();
      if (!force && now - lastMoveSent < 50) return;
      lastMoveSent = now;
      ws.send(JSON.stringify({
        type: 'move', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: 0,
        ry: +me.ry.toFixed(3), world: currentWorld, room: currentRoom,
      }));
    }

    function tryCollect() {
      var now = performance.now();
      if (now - lastCollectTry < 120 || !ws || ws.readyState !== 1) return;
      for (var i = 0; i < bones.length; i++) {
        var b = bones[i];
        if (Math.hypot(me.x - b.x, me.y - b.y) < 28) {
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
        if (!p || !rp || p.email === user.email) continue;
        if (Math.hypot(me.x - rp.x, me.y - rp.y) < 40) {
          lastHighfive = now;
          ws.send(JSON.stringify({ type: 'highfive', to: p.email }));
          return;
        }
      }
    }

    function drawAvatar(px, py, ry, avatar, name, color, isMe, email) {
      ctx.save();
      ctx.translate(px, py);
      var bounce = Math.sin(performance.now() / 180 + px) * (isMe && (keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD'] || keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight']) ? 2 : 0.5);
      ctx.translate(0, bounce);
      ctx.rotate(ry);
      ctx.beginPath();
      ctx.arc(0, 0, isMe ? 16 : 14, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = isMe ? 3 : 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -4); ctx.lineTo(12, 0); ctx.lineTo(0, 4); ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
      ctx.restore();

      ctx.font = '16px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(avatar || '🐶', px, py - 28);

      var em = null;
      if (isMe && myEmote && performance.now() < myEmoteUntil) em = myEmote;
      else if (email && floaters[email] && performance.now() < floaters[email].until) em = floaters[email].emoji;
      if (em) {
        ctx.font = '22px serif';
        ctx.fillText(em, px + 18, py - 40);
      }

      ctx.font = '600 11px system-ui,sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(px - 40, py + 18, 80, 16);
      ctx.fillStyle = '#fff';
      ctx.fillText((name || '').slice(0, 14), px, py + 26);
    }

    function drawWorld() {
      var wdef = WORLD_BY_ID[currentWorld] || WORLDS[0];
      var size = wdef.size || 800;
      ctx.fillStyle = wdef.bg;
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.save();
      ctx.translate(cssW / 2 - cam.x, cssH / 2 - cam.y);
      ctx.fillStyle = wdef.ground;
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      var g;
      for (g = 0; g <= size; g += 40) {
        ctx.beginPath(); ctx.moveTo(g, 0); ctx.lineTo(g, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, g); ctx.lineTo(size, g); ctx.stroke();
      }
      getDecor(currentWorld).forEach(function (d) {
        if (d.type === 'circle') {
          ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fillStyle = d.fill; ctx.fill();
        } else if (d.type === 'rect') {
          ctx.fillStyle = d.fill; ctx.fillRect(d.x, d.y, d.w, d.h);
        } else if (d.type === 'tree') {
          ctx.fillStyle = '#6b4423'; ctx.fillRect(d.x - 4, d.y - 4, 8, 16);
          ctx.beginPath(); ctx.arc(d.x, d.y - 12, 14, 0, Math.PI * 2);
          ctx.fillStyle = '#2f7a3e'; ctx.fill();
        }
      });

      roomsForWorld(currentWorld).forEach(function (r) {
        var active = currentRoom === r.id;
        ctx.beginPath(); ctx.arc(r.x, r.y, active ? 28 : 24, 0, Math.PI * 2);
        ctx.fillStyle = active ? 'rgba(52,209,122,0.35)' : 'rgba(0,0,0,0.35)';
        ctx.fill();
        ctx.strokeStyle = active ? '#34d17a' : 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2; ctx.stroke();
        ctx.font = '20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(r.emoji || '📍', r.x, r.y);
        ctx.font = '600 10px system-ui,sans-serif'; ctx.fillStyle = '#fff';
        ctx.fillText(r.name, r.x, r.y + 36);
      });

      var t = performance.now() / 400;
      bones.forEach(function (b) {
        var bob = Math.sin(t + b.x) * 4;
        ctx.font = '22px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🦴', b.x, b.y + bob);
        ctx.beginPath();
        ctx.arc(b.x, b.y + bob, 16 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,200,80,0.35)';
        ctx.stroke();
      });

      particles.forEach(function (p) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      Object.keys(remotePos).forEach(function (email) {
        var p = players[email];
        var rp = remotePos[email];
        if (!p || !rp) return;
        drawAvatar(rp.x, rp.y, rp.ry, p.avatar, p.name, colorFromEmail(email), false, email);
      });
      drawAvatar(me.x, me.y, me.ry, user.avatar, user.name, colorFromEmail(user.email), true, user.email);
      ctx.restore();
    }

    function animate(ts) {
      if (closed) return;
      animId = requestAnimationFrame(animate);
      var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
      lastTs = ts;
      var speed = keys['ShiftLeft'] || keys['ShiftRight'] ? 220 : 140;
      var dx = 0, dy = 0;
      if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) dx += 1;
      if (dx || dy) {
        var len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        me.x += dx * speed * dt;
        me.y += dy * speed * dt;
        me.ry = Math.atan2(dy, dx);
        var lim = (WORLD_BY_ID[currentWorld] || WORLDS[0]).size || 800;
        me.x = Math.max(20, Math.min(lim - 20, me.x));
        me.y = Math.max(20, Math.min(lim - 20, me.y));
        sendMove(false);
        tryCollect();
        tryHighfive();
      } else {
        tryCollect();
      }

      Object.keys(remotePos).forEach(function (email) {
        var rp = remotePos[email];
        rp.x += (rp.tx - rp.x) * Math.min(1, dt * 12);
        rp.y += (rp.ty - rp.y) * Math.min(1, dt * 12);
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
      drawWorld();
    }

    function onKeyDown(e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      keys[e.code] = true;
      if (e.code === 'KeyE') sendEmote(EMOTES[Math.floor(Math.random() * EMOTES.length)]);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
    }
    function onKeyUp(e) { keys[e.code] = false; }

    function onCanvasClick(e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var wx = mx - cssW / 2 + cam.x;
      var wy = my - cssH / 2 + cam.y;
      var hit = null;
      roomsForWorld(currentWorld).forEach(function (r) {
        if (Math.hypot(wx - r.x, wy - r.y) < 30) hit = r;
      });
      if (hit) enterRoom(hit.id);
    }

    if (dpadEl) {
      dpadEl.querySelectorAll('.mv-dpad-btn').forEach(function (btn) {
        var code = btn.getAttribute('data-k');
        var down = function (ev) { ev.preventDefault(); keys[code] = true; };
        var up = function (ev) { ev.preventDefault(); keys[code] = false; };
        btn.addEventListener('touchstart', down, { passive: false });
        btn.addEventListener('touchend', up);
        btn.addEventListener('touchcancel', up);
        btn.addEventListener('mousedown', down);
        btn.addEventListener('mouseup', up);
        btn.addEventListener('mouseleave', up);
      });
    }

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
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('click', onCanvasClick);
    connectWs();
    loadPublicHistory();
    animId = requestAnimationFrame(animate);

    return function cleanup() {
      closed = true;
      try { if (ws) ws.close(); } catch (e) {}
      if (animId) cancelAnimationFrame(animId);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      if (ro) ro.disconnect();
      else global.removeEventListener('resize', resize);
    };
  }

  global.renderMetaverseApp = renderMetaverseApp;
})(typeof window !== 'undefined' ? window : this);
