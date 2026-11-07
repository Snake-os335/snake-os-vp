/* Doganiero VR · Buscar gafas (2026.23) — página del ORDENADOR.
 *
 * Qué hace (doganiero-vr-search.softportweb.com | /vr-search):
 *  1. Busca gafas VR por Bluetooth con Web Bluetooth (Chrome/Edge). Lee nombre, modelo,
 *     firmware y batería si el dispositivo los expone y los guarda en tu cuenta.
 *  2. Pide la conexión a las gafas (WebSocket /api/vrlink/ws?role=pc, cuenta dogaemail).
 *  3. Recibe por WebRTC lo que se ve dentro de las gafas (oferta de las gafas → respuesta
 *     del ordenador) y lo muestra en un <video> con estadísticas y pantalla completa.
 *  4. Sigue el juego de realidad mixta (comida/cariño/limpieza de la serpiente) y puede
 *     pedir una foto de la habitación.
 *
 * Sin dependencias: Web Bluetooth, WebRTC y WebSocket del propio navegador.
 */
(function (global) {
  'use strict';

  var SITE = 'vrsearch';
  var $ = function (id) { return document.getElementById(id); };

  var st = {
    user: null,
    ws: null,
    wsRetry: 0,
    wsTimer: 0,
    pingTimer: 0,
    code: null,
    urls: [],
    devices: [],
    ice: null,
    rtc: null,
    pendingId: null,
    peers: { pc: 0, send: 0 },
    statsTimer: 0,
    lastBytes: 0,
    lastBytesAt: 0,
    game: null,
    videoOn: false
  };

  function log(msg) {
    var el = $('log');
    if (!el) return;
    var line = new Date().toLocaleTimeString('es-ES') + '  ' + msg;
    el.textContent = line + '\n' + el.textContent;
    if (el.textContent.length > 16000) el.textContent = el.textContent.slice(0, 16000);
  }

  function setStatus(text, on) {
    var box = $('status');
    if (!box) return;
    box.classList.toggle('on', !!on);
    $('statusText').textContent = text;
  }

  async function api(path, opts) {
    var res = await fetch(path, Object.assign({
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }
    }, opts || {}));
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      var err = new Error((data && (data.detail || data.message)) || ('HTTP ' + res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function fmtKb(bytes) {
    if (!bytes) return '0 kb/s';
    if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB/s';
    return Math.round(bytes / 1024) + ' kb/s';
  }

  /* ---------------- 1 · cuenta dogaemail ---------------- */

  function renderAccount() {
    var form = $('loginForm');
    var acc = $('account');
    if (st.user) {
      form.hidden = true;
      acc.hidden = false;
      $('accAvatar').textContent = st.user.avatar || '🐍';
      $('accName').textContent = st.user.name || (st.user.email || '').split('@')[0];
      $('accEmail').textContent = st.user.email || '';
      $('loginHint').textContent = 'Sesión iniciada. Las gafas ven tu nombre al pedir la conexión.';
    } else {
      form.hidden = false;
      acc.hidden = true;
      $('loginHint').textContent = 'La misma cuenta que usas en las gafas: así la solicitud de conexión llega a tu Doganiero-vr-send.';
    }
    $('reqBtn').disabled = !st.user || !st.ws;
  }

  async function loadMe() {
    try {
      st.user = await api('/api/doga-auth/me?site=' + SITE);
    } catch (e) {
      st.user = null;
    }
    renderAccount();
    return st.user;
  }

  async function login(ev) {
    if (ev) ev.preventDefault();
    var email = ($('email').value || '').trim();
    var password = $('password').value || '';
    if (!email || !password) return;
    $('loginBtn').disabled = true;
    try {
      st.user = await api('/api/doga-auth/login', {
        method: 'POST',
        body: JSON.stringify({ site: SITE, email: email, password: password })
      });
      $('password').value = '';
      log('Sesión iniciada como ' + st.user.email);
      renderAccount();
      await ensurePair(true);
      connectWS(true);
    } catch (e) {
      log('No se pudo entrar: ' + e.message);
      $('loginHint').textContent = e.message;
    } finally {
      $('loginBtn').disabled = false;
    }
  }

  async function logout() {
    try { await api('/api/doga-auth/logout', { method: 'POST', body: JSON.stringify({ site: SITE }) }); }
    catch (e) {}
    st.user = null;
    st.code = null;
    st.urls = [];
    closeWS();
    renderAccount();
    renderPair();
    log('Sesión cerrada');
  }

  /* ---------------- 2 · Bluetooth (Web Bluetooth) ---------------- */

  function btSupported() {
    return !!(global.navigator && global.navigator.bluetooth && navigator.bluetooth.requestDevice);
  }

  function renderDevices() {
    var ul = $('btList');
    if (!ul) return;
    ul.innerHTML = '';
    if (!st.devices.length) {
      var li0 = document.createElement('li');
      li0.innerHTML = '<span class="ico">📡</span><div class="meta"><b>Ninguna gafa guardada todavía</b><span>Pulsa «Buscar gafas VR».</span></div>';
      ul.appendChild(li0);
      return;
    }
    st.devices.forEach(function (d) {
      var li = document.createElement('li');
      var ico = document.createElement('span');
      ico.className = 'ico';
      ico.textContent = '🥽';
      var meta = document.createElement('div');
      meta.className = 'meta';
      var b = document.createElement('b');
      b.textContent = d.name || '(sin nombre)';
      var sp = document.createElement('span');
      var bits = [];
      if (d.model) bits.push('Modelo: ' + d.model);
      if (d.id) bits.push(d.id);
      sp.textContent = bits.join(' · ') || 'Dispositivo Bluetooth';
      meta.appendChild(b);
      meta.appendChild(sp);
      li.appendChild(ico);
      li.appendChild(meta);
      if (typeof d.battery === 'number') {
        var tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = '🔋 ' + d.battery + '%';
        li.appendChild(tag);
      }
      ul.appendChild(li);
    });
  }

  function addDevice(dev) {
    var id = String(dev.id || dev.name || Date.now());
    st.devices = st.devices.filter(function (d) { return String(d.id || d.name) !== id; });
    dev.seen = Date.now() / 1000;
    st.devices.unshift(dev);
    st.devices = st.devices.slice(0, 24);
    renderDevices();
    wsSend({ type: 'bt_devices', devices: st.devices });
  }

  async function readBattery(server) {
    try {
      var svc = await server.getPrimaryService('battery_service');
      var ch = await svc.getCharacteristic('battery_level');
      var val = await ch.readValue();
      return val.getUint8(0);
    } catch (e) { return undefined; }
  }

  async function readInfo(server) {
    var out = {};
    var names = [
      ['manufacturer_name_string', 'manufacturer'],
      ['model_number_string', 'model'],
      ['firmware_revision_string', 'firmware'],
      ['serial_number_string', 'serial']
    ];
    for (var i = 0; i < names.length; i++) {
      try {
        var svc = await server.getPrimaryService('device_information');
        var ch = await svc.getCharacteristic(names[i][0]);
        var val = await ch.readValue();
        var text = new TextDecoder('utf-8').decode(val).replace(/\u0000/g, '').trim();
        if (text) out[names[i][1]] = text;
      } catch (e) {}
    }
    return out;
  }

  async function btSearch() {
    if (!btSupported()) {
      $('btHint').textContent = 'Este navegador no tiene Web Bluetooth. Usa Chrome o Edge en el ordenador (con HTTPS).';
      return;
    }
    $('btSearch').disabled = true;
    try {
      var device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information', 'generic_access', 'human_interface_device']
      });
      var dev = { id: device.id, name: device.name || '', seen: Date.now() / 1000 };
      log('Gafas encontradas: ' + (dev.name || dev.id));
      try {
        if (device.gatt) {
          var server = await device.gatt.connect();
          var info = await readInfo(server);
          if (info.model) dev.model = info.model;
          var battery = await readBattery(server);
          if (typeof battery === 'number') dev.battery = battery;
          try { device.gatt.disconnect(); } catch (e) {}
        }
      } catch (e) {
        log('Bluetooth conectado pero sin datos extra: ' + (e.message || e));
      }
      addDevice(dev);
      $('btHint').textContent = 'Guardada «' + (dev.name || dev.id) + '». Las gafas ya la verán al conectarse.';
    } catch (e) {
      if (e && (e.name === 'NotFoundError' || e.name === 'AbortError')) {
        $('btHint').textContent = 'Búsqueda cancelada (no se eligió ninguna).';
      } else {
        log('Bluetooth: ' + (e.message || e));
        $('btHint').textContent = 'No se pudo buscar: ' + (e.message || e);
      }
    } finally {
      $('btSearch').disabled = false;
    }
  }

  async function btKnown() {
    if (!(navigator.bluetooth && navigator.bluetooth.getDevices)) {
      $('btHint').textContent = 'Este navegador no puede listar las ya emparejadas. Pulsa «Buscar gafas VR».';
      return;
    }
    try {
      var list = await navigator.bluetooth.getDevices();
      (list || []).forEach(function (device) {
        addDevice({ id: device.id, name: device.name || '', seen: Date.now() / 1000 });
      });
      $('btHint').textContent = 'Vistas ' + (list || []).length + ' ya emparejadas.';
    } catch (e) {
      $('btHint').textContent = 'No se pudo listar: ' + (e.message || e);
    }
  }

  /* ---------------- 3 · código de emparejamiento ---------------- */

  function renderPair() {
    $('pairCode').textContent = st.code || '····';
    var box = $('pairUrls');
    box.innerHTML = '';
    if (!st.urls.length) {
      box.innerHTML = '<span class="hint">Crea el código al entrar con tu cuenta.</span>';
      return;
    }
    st.urls.forEach(function (u) {
      var a = document.createElement('a');
      a.href = u;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = u;
      box.appendChild(a);
    });
  }

  async function ensurePair(create) {
    if (!st.user) return;
    try {
      var data = create ? await api('/api/vrlink/pair', { method: 'POST', body: '{}' })
                        : await api('/api/vrlink/pair');
      if (data && data.code) {
        st.code = data.code;
        st.urls = data.urls || [];
        if (Array.isArray(data.devices) && data.devices.length && !st.devices.length) {
          st.devices = data.devices;
          renderDevices();
        }
        renderPair();
      } else {
        st.code = null;
        st.urls = [];
        renderPair();
      }
    } catch (e) {
      if (e.status !== 401) log('Código: ' + e.message);
    }
  }

  /* ---------------- 4 · WebSocket del enlace ---------------- */

  function wsUrl() {
    var proto = (location.protocol === 'https:') ? 'wss' : 'ws';
    return proto + '://' + location.host + '/api/vrlink/ws?role=pc';
  }

  function wsSend(obj) {
    if (!st.ws || st.ws.readyState !== 1) return false;
    try { st.ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function connectWS(force) {
    if (!st.user) return;
    if (st.ws && !force) return;
    closeWS();
    var ws;
    try { ws = new WebSocket(wsUrl()); } catch (e) { scheduleReconnect(); return; }
    st.ws = ws;
    ws.onopen = function () {
      st.wsRetry = 0;
      setStatus('Enlace abierto · esperando gafas', true);
      log('Enlace abierto con el servidor');
      renderAccount();
      if (st.devices.length) wsSend({ type: 'bt_devices', devices: st.devices });
    };
    ws.onmessage = function (ev) { onMessage(ev.data); };
    ws.onclose = function () {
      if (st.ws === ws) st.ws = null;
      setStatus('Sin conexión', false);
      renderAccount();
      scheduleReconnect();
    };
    ws.onerror = function () {};
    clearInterval(st.pingTimer);
    st.pingTimer = setInterval(function () { wsSend({ type: 'ping', t: Date.now() }); }, 20000);
  }

  function closeWS() {
    clearInterval(st.pingTimer);
    if (st.ws) {
      var ws = st.ws;
      st.ws = null;
      try { ws.close(); } catch (e) {}
    }
  }

  function scheduleReconnect() {
    clearTimeout(st.wsTimer);
    st.wsRetry = Math.min(st.wsRetry + 1, 8);
    st.wsTimer = setTimeout(function () { connectWS(true); }, 900 * st.wsRetry);
  }

  function renderPeers() {
    var n = st.peers.send || 0;
    $('statusText').textContent = n
      ? (n + (n === 1 ? ' gafa conectada · listo para pedir conexión' : ' gafas conectadas'))
      : (st.ws ? 'Enlace abierto · esperando gafas' : 'Sin conexión');
    $('reqBtn').disabled = !st.user || !st.ws || !n;
    if (!n && st.user) $('linkHint').textContent = 'Abre en las gafas Doganiero-vr-send.softportweb.com (o entra con el código) y deja la página abierta.';
  }

  /* ---------------- 5 · WebRTC: recibir lo que ves ---------------- */

  function ensureRtc() {
    if (st.rtc) return st.rtc;
    var cfg = { iceServers: st.ice || [{ urls: ['stun:stun.l.google.com:19302'] }] };
    var rtc = new RTCPeerConnection(cfg);
    rtc.onicecandidate = function (ev) {
      if (ev.candidate) wsSend({ type: 'ice', candidate: ev.candidate.toJSON() });
    };
    rtc.ontrack = function (ev) {
      var stream = ev.streams && ev.streams[0];
      if (stream) attachStream(stream);
    };
    rtc.onconnectionstatechange = function () {
      log('WebRTC: ' + rtc.connectionState);
      $('statState').textContent = rtc.connectionState;
      if (rtc.connectionState === 'failed' || rtc.connectionState === 'disconnected') {
        st.videoOn = false;
        $('videoWrap').classList.remove('has-video');
      }
    };
    st.rtc = rtc;
    return rtc;
  }

  function attachStream(stream) {
    var video = $('remote');
    video.srcObject = stream;
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
    st.videoOn = true;
    $('videoWrap').classList.add('has-video');
    startStats();
    log('Recibiendo imagen de las gafas');
  }

  async function handleOffer(sdp) {
    if (st.rtc && st.rtc.signalingState !== 'stable') stopVideo();
    var rtc = ensureRtc();
    try {
      await rtc.setRemoteDescription({ type: 'offer', sdp: sdp });
      var answer = await rtc.createAnswer();
      await rtc.setLocalDescription(answer);
      wsSend({ type: 'answer', sdp: answer.sdp });
      log('Respuesta WebRTC enviada a las gafas');
    } catch (e) {
      log('WebRTC (oferta): ' + (e.message || e));
    }
  }

  function startStats() {
    clearInterval(st.statsTimer);
    st.lastBytes = 0;
    st.lastBytesAt = Date.now();
    st.statsTimer = setInterval(async function () {
      var rtc = st.rtc;
      if (!rtc || !st.videoOn) return;
      try {
        var stats = await rtc.getStats();
        stats.forEach(function (row) {
          if (row.type !== 'inbound-rtp' || row.kind !== 'video') return;
          if (row.frameWidth) $('statRes').textContent = row.frameWidth + '×' + row.frameHeight;
          if (row.framesPerSecond) $('statRes').textContent = (row.frameWidth || 0) + '×' + (row.frameHeight || 0) + ' · ' + Math.round(row.framesPerSecond) + ' fps';
          var now = Date.now();
          var dt = (now - st.lastBytesAt) / 1000;
          if (dt > 0.4 && typeof row.bytesReceived === 'number') {
            var delta = row.bytesReceived - st.lastBytes;
            if (delta >= 0) $('statRate').textContent = fmtKb(delta / dt);
            st.lastBytes = row.bytesReceived;
            st.lastBytesAt = now;
          }
        });
      } catch (e) {}
    }, 1000);
  }

  function stopVideo() {
    clearInterval(st.statsTimer);
    st.videoOn = false;
    $('videoWrap').classList.remove('has-video');
    $('statRes').textContent = '—';
    $('statRate').textContent = '—';
    $('statState').textContent = '—';
    var video = $('remote');
    try { video.srcObject = null; } catch (e) {}
    if (st.rtc) {
      try { st.rtc.close(); } catch (e) {}
      st.rtc = null;
    }
  }

  /* ---------------- 6 · mensajes del servidor / gafas ---------------- */

  function setBar(id, value) {
    var v = Math.max(0, Math.min(100, Number(value) || 0));
    $(id).style.width = v + '%';
  }

  function renderGame(s) {
    st.game = s || null;
    if (!s) return;
    setBar('barHunger', s.hunger);
    setBar('barHappy', s.happy);
    setBar('barClean', s.clean);
    var bits = [];
    if (s.scan) bits.push('Habitación: ' + s.scan);
    if (typeof s.score === 'number') bits.push('Puntos: ' + s.score);
    if (s.level) bits.push('Nivel ' + s.level);
    if (s.text) bits.push(s.text);
    $('gameInfo').textContent = bits.join(' · ') || 'Partida en marcha';
  }

  function onMessage(raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'welcome':
        if (msg.iceServers) st.ice = msg.iceServers;
        if (msg.peers) { st.peers = msg.peers; renderPeers(); }
        if (msg.devices && msg.devices.length && !st.devices.length) {
          st.devices = msg.devices;
          renderDevices();
        }
        if (msg.code && !st.code) { st.code = msg.code; renderPair(); }
        log('Conectado como ' + (msg.name || msg.email));
        break;
      case 'peers':
        st.peers = { pc: msg.pc || 0, send: msg.send || 0 };
        renderPeers();
        if (st.peers.send && st.user && !st.code) ensurePair(true);
        break;
      case 'request_sent':
        st.pendingId = msg.id || null;
        $('linkHint').textContent = 'Solicitud enviada. Acepta en las gafas (Doganiero-vr-send).';
        log('Solicitud enviada a las gafas');
        break;
      case 'accepted':
        $('linkHint').textContent = 'Las gafas han aceptado. Esperando la imagen…';
        log('Las gafas han aceptado (' + (msg.from || '') + ')');
        break;
      case 'rejected':
        $('linkHint').textContent = 'Las gafas han rechazado la conexión.';
        log('Conexión rechazada desde las gafas');
        break;
      case 'offer':
        handleOffer(msg.sdp);
        break;
      case 'answer':
        // El ordenador es quien responde; una respuesta aquí solo puede venir de un reintento.
        log('Respuesta recibida (la conexión la inicia el ordenador)');
        break;
      case 'ice':
        if (st.rtc && msg.candidate) {
          st.rtc.addIceCandidate(msg.candidate).catch(function () {});
        }
        break;
      case 'hangup':
        stopVideo();
        $('linkHint').textContent = 'Las gafas han cortado la transmisión.';
        log('Transmisión cortada desde las gafas');
        break;
      case 'game_state':
        renderGame(msg.state);
        break;
      case 'status':
        if (msg.text) log('Gafas: ' + msg.text);
        break;
      case 'screenshot':
        if (msg.dataUrl) {
          var img = $('gameShotImg');
          img.src = msg.dataUrl;
          img.style.display = 'block';
          log('Foto de la habitación recibida');
        }
        break;
      case 'bt_devices':
        if (Array.isArray(msg.devices) && msg.devices.length) {
          st.devices = msg.devices;
          renderDevices();
        }
        break;
      case 'bt_saved':
        log('Gafas guardadas en tu cuenta: ' + msg.count);
        break;
      case 'peer_offline':
        if (msg.for === 'request') {
          $('linkHint').textContent = 'Las gafas no están conectadas. Abre Doganiero-vr-send.softportweb.com en ellas.';
          log('No hay gafas conectadas ahora mismo');
        }
        break;
      case 'error':
        log('Error: ' + (msg.detail || 'desconocido'));
        break;
      default:
        break;
    }
  }

  /* ---------------- 7 · acciones ---------------- */

  function requestLink() {
    if (!wsSend({ type: 'request' })) {
      log('No hay enlace con el servidor todavía');
      return;
    }
    $('linkHint').textContent = 'Solicitud enviada. Acepta en las gafas…';
    log('Pidiendo conexión a las gafas…');
    setTimeout(function () { ensureRtc(); }, 0);
  }

  function stopLink() {
    wsSend({ type: 'hangup' });
    stopVideo();
    $('linkHint').textContent = 'Has cortado la transmisión.';
    log('Transmisión cortada desde el ordenador');
  }

  function goFullscreen() {
    var video = $('remote');
    var el = $('videoWrap');
    try {
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      (el.requestFullscreen || video.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
    } catch (e) { log('Pantalla completa: ' + (e.message || e)); }
  }

  function requestPhoto() {
    wsSend({ type: 'game_cmd', action: 'screenshot' });
    log('Pidiendo foto a las gafas…');
  }

  /* ---------------- 8 · arranque ---------------- */

  function wire() {
    $('loginForm').addEventListener('submit', login);
    $('logoutBtn').addEventListener('click', logout);
    $('btSearch').addEventListener('click', btSearch);
    $('btKnown').addEventListener('click', btKnown);
    $('reqBtn').addEventListener('click', requestLink);
    $('newCodeBtn').addEventListener('click', function () { ensurePair(true).then(function () { log('Código nuevo: ' + (st.code || '—')); }); });
    $('stopBtn').addEventListener('click', stopLink);
    $('fsBtn').addEventListener('click', goFullscreen);
    $('shotBtn').addEventListener('click', requestPhoto);
    $('gameShotBtn').addEventListener('click', requestPhoto);
    global.addEventListener('beforeunload', function () { closeWS(); });
  }

  async function boot() {
    wire();
    renderDevices();
    renderPair();
    renderPeers();
    if (!btSupported()) {
      $('btHint').textContent = 'Este navegador no tiene Web Bluetooth (usa Chrome o Edge en el ordenador). La conexión con las gafas funciona igual.';
    }
    var user = await loadMe();
    if (user) {
      await ensurePair(false);
      if (!st.code) await ensurePair(true);
      connectWS(true);
    }
    log('Doganiero VR · Buscar gafas listo');
    try {
      var ice = await api('/api/vrlink/ice');
      if (ice && ice.iceServers) st.ice = ice.iceServers;
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.DogaVrSearch = { st: st, log: log, requestLink: requestLink, stopLink: stopLink };
})(window);
