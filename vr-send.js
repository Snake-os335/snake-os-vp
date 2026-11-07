/* Doganiero VR · Enviar (2026.23) — página de las GAFAS VR.
 *
 * Qué hace (doganiero-vr-send.softportweb.com | /vr-send):
 *  1. Entra con la cuenta dogaemail o con el código de 6 caracteres que muestra el ordenador
 *     (WebSocket /api/vrlink/ws?role=send).
 *  2. Detecta la solicitud que llega desde Doganiero-vr-search: enseña quién la pide (y las
 *     gafas que se encontraron por Bluetooth). Al aceptar se empieza a transmitir.
 *  3. Transmite por WebRTC lo que se ve: pantalla del visor (si el navegador lo permite),
 *     cámara, o el ESPEJO del juego de realidad mixta (funciona siempre).
 *  4. Lanza el juego MR (vr-room-snake.js): escanear la habitación y cuidar a la serpiente
 *     con los mandos. El estado va al ordenador y puede pedir fotos.
 */
(function (global) {
  'use strict';

  var SITE = 'vrsend';
  var LS_CODE = 'dvrSendCode';
  var $ = function (id) { return document.getElementById(id); };

  var st = {
    user: null,
    code: '',
    ws: null,
    wsRetry: 0,
    wsTimer: 0,
    pingTimer: 0,
    ice: null,
    rtc: null,
    stream: null,
    kind: '',
    requestId: null,
    peers: { pc: 0, send: 0 },
    game: null,
    gameOn: false,
    stateSent: 0
  };

  function log(msg) {
    var el = $('log');
    if (!el) return;
    var line = new Date().toLocaleTimeString('es-ES') + '  ' + msg;
    el.textContent = line + '\n' + el.textContent;
    if (el.textContent.length > 16000) el.textContent = el.textContent.slice(0, 16000);
  }

  function setStatus(text, on) {
    $('status').classList.toggle('on', !!on);
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

  /* ---------------- 1 · cuenta / código ---------------- */

  function renderAuth() {
    var box = $('codeFormBox');
    var form = $('loginForm');
    var acc = $('account');
    if (st.user) {
      box.hidden = true;
      form.hidden = true;
      acc.hidden = false;
      $('accAvatar').textContent = st.user.avatar || '🥽';
      $('accName').textContent = st.user.name || (st.user.email || '').split('@')[0];
      $('accEmail').textContent = st.user.email || '';
    } else {
      box.hidden = false;
      form.hidden = false;
      acc.hidden = true;
    }
  }

  async function loadMe() {
    try {
      st.user = await api('/api/doga-auth/me?site=' + SITE);
    } catch (e) {
      st.user = null;
    }
    renderAuth();
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
      renderAuth();
      connectWS('');
    } catch (e) {
      log('No se pudo entrar: ' + e.message);
    } finally {
      $('loginBtn').disabled = false;
    }
  }

  async function logout() {
    try { await api('/api/doga-auth/logout', { method: 'POST', body: JSON.stringify({ site: SITE }) }); }
    catch (e) {}
    st.user = null;
    st.code = '';
    try { localStorage.removeItem(LS_CODE); } catch (e) {}
    closeWS();
    renderAuth();
    log('Sesión cerrada');
  }

  function enterCode() {
    var code = ($('codeInput').value || '').trim().toUpperCase();
    if (code.length < 4) {
      log('Escribe el código que aparece en el ordenador');
      return;
    }
    st.code = code;
    try { localStorage.setItem(LS_CODE, code); } catch (e) {}
    connectWS(code);
  }

  /* ---------------- 2 · WebSocket ---------------- */

  function wsUrl(code) {
    var proto = (location.protocol === 'https:') ? 'wss' : 'ws';
    var q = '/api/vrlink/ws?role=send';
    if (code) q += '&code=' + encodeURIComponent(code);
    return proto + '://' + location.host + q;
  }

  function wsSend(obj) {
    if (!st.ws || st.ws.readyState !== 1) return false;
    try { st.ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function connectWS(code) {
    closeWS();
    clearTimeout(st.wsTimer);
    var ws;
    try { ws = new WebSocket(wsUrl(code || '')); } catch (e) { scheduleReconnect(code); return; }
    st.ws = ws;
    ws.onopen = function () {
      st.wsRetry = 0;
      setStatus('Enlace abierto · esperando al ordenador', true);
      log('Enlace abierto con el servidor');
    };
    ws.onmessage = function (ev) { onMessage(ev.data); };
    ws.onclose = function (ev) {
      if (st.ws === ws) st.ws = null;
      setStatus('Sin conexión', false);
      if (ev && ev.code === 4401) {
        log('Código caducado o sesión terminada. Vuelve a entrar.');
        st.code = '';
        try { localStorage.removeItem(LS_CODE); } catch (e) {}
        st.user = null;
        renderAuth();
        return;
      }
      scheduleReconnect(code);
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

  function scheduleReconnect(code) {
    clearTimeout(st.wsTimer);
    st.wsRetry = Math.min(st.wsRetry + 1, 8);
    st.wsTimer = setTimeout(function () {
      connectWS(code || st.code || (st.user ? '' : savedCode()));
    }, 900 * st.wsRetry);
  }

  function savedCode() {
    try { return localStorage.getItem(LS_CODE) || ''; } catch (e) { return ''; }
  }

  /* ---------------- 3 · solicitud del ordenador ---------------- */

  function showRequest(msg) {
    st.requestId = msg.id || null;
    $('reqFrom').textContent = (msg.from || 'Tu ordenador') + ' quiere ver lo que ves';
    $('reqAvatar').textContent = msg.avatar || '🐶';
    var devs = Array.isArray(msg.devices) ? msg.devices : [];
    if (devs.length) {
      var names = devs.map(function (d) { return d.name || d.id; }).join(', ');
      $('reqDevices').textContent = 'Gafas encontradas por Bluetooth: ' + names;
    } else {
      $('reqDevices').textContent = 'Sin datos de Bluetooth (conexión por tu cuenta).';
    }
    $('requestCard').hidden = false;
    log('Solicitud del ordenador: ' + (msg.from || ''));
  }

  function hideRequest() {
    st.requestId = null;
    $('requestCard').hidden = true;
  }

  async function acceptRequest() {
    if (!st.requestId) return;
    var rid = st.requestId;
    hideRequest();
    wsSend({ type: 'accept', id: rid, device: detectDeviceName() });
    log('Solicitud aceptada');
    var kind = pickSource();
    if (!kind) {
      wsSend({ type: 'status', text: 'Gafas: no hay fuente de vídeo disponible todavía' });
      log('No hay fuente de vídeo: abre el juego MR o activa la pantalla del visor');
      return;
    }
    startShare(kind);
  }

  function rejectRequest() {
    if (!st.requestId) return;
    wsSend({ type: 'reject', id: st.requestId });
    hideRequest();
    log('Solicitud rechazada');
  }

  function detectDeviceName() {
    var ua = navigator.userAgent || '';
    if (/Quest/i.test(ua)) return 'Meta Quest';
    if (/Pico/i.test(ua)) return 'Pico';
    if (/Wolvic/i.test(ua)) return 'Wolvic';
    if (/visionOS|Vision/i.test(ua)) return 'Apple Vision';
    return 'Gafas VR';
  }

  function pickSource() {
    if (st.gameOn && global.DoganieroRoomSnake && DoganieroRoomSnake.mirrorStream) return 'game';
    if (canScreen()) return 'screen';
    if (canCamera()) return 'camera';
    return '';
  }

  /* ---------------- 4 · WebRTC: enviar lo que ves ---------------- */

  function canScreen() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  }
  function canCamera() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function kindLabel(kind) {
    if (kind === 'game') return 'juego MR (espejo)';
    if (kind === 'screen') return 'pantalla del visor';
    if (kind === 'camera') return 'cámara';
    return kind || '—';
  }

  async function sourceStream(kind) {
    if (kind === 'game') {
      if (!global.DoganieroRoomSnake || !DoganieroRoomSnake.mirrorStream) {
        throw new Error('Abre primero el juego MR (botón 🧭).');
      }
      var s = DoganieroRoomSnake.mirrorStream();
      if (!s) throw new Error('El juego aún no está dibujando el espejo. Espera unos segundos.');
      return s;
    }
    if (kind === 'screen') {
      if (!canScreen()) throw new Error('Este navegador de las gafas no permite capturar la pantalla. Usa el Juego MR.');
      return await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } },
        audio: false
      });
    }
    if (kind === 'camera') {
      if (!canCamera()) throw new Error('Este dispositivo no tiene cámara accesible.');
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
    }
    throw new Error('Fuente desconocida');
  }

  async function startShare(kind) {
    stopShare(false);
    $('shareState').textContent = 'Preparando «' + kindLabel(kind) + '»…';
    var stream;
    try {
      stream = await sourceStream(kind);
    } catch (e) {
      $('shareState').textContent = 'No se pudo empezar: ' + (e.message || e);
      log('Transmitir: ' + (e.message || e));
      wsSend({ type: 'status', text: 'Gafas: ' + (e.message || e) });
      return;
    }
    st.stream = stream;
    st.kind = kind;
    var cfg = { iceServers: st.ice || [{ urls: ['stun:stun.l.google.com:19302'] }] };
    var rtc = new RTCPeerConnection(cfg);
    st.rtc = rtc;
    stream.getTracks().forEach(function (track) {
      try { rtc.addTrack(track, stream); } catch (e) {}
    });
    rtc.onicecandidate = function (ev) {
      if (ev.candidate) wsSend({ type: 'ice', candidate: ev.candidate.toJSON() });
    };
    rtc.onconnectionstatechange = function () {
      log('WebRTC: ' + rtc.connectionState);
      if (rtc.connectionState === 'failed' || rtc.connectionState === 'disconnected') {
        $('shareState').textContent = 'La conexión con el ordenador se ha cortado (' + rtc.connectionState + ').';
      }
    };
    try {
      var offer = await rtc.createOffer();
      await rtc.setLocalDescription(offer);
      wsSend({ type: 'offer', sdp: offer.sdp, source: kind });
      $('shareState').textContent = 'Transmitiendo «' + kindLabel(kind) + '» al ordenador.';
      log('Oferta WebRTC enviada (' + kindLabel(kind) + ')');
      wsSend({ type: 'status', text: 'Gafas transmitiendo: ' + kindLabel(kind) });
    } catch (e) {
      $('shareState').textContent = 'No se pudo crear la conexión: ' + (e.message || e);
      log('WebRTC: ' + (e.message || e));
    }
  }

  function stopShare(notify) {
    if (notify !== false) wsSend({ type: 'hangup' });
    if (st.rtc) {
      try { st.rtc.close(); } catch (e) {}
      st.rtc = null;
    }
    if (st.stream) {
      try { st.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      st.stream = null;
    }
    var was = st.kind;
    st.kind = '';
    if (was) $('shareState').textContent = 'Has dejado de transmitir.';
    if (notify !== false) log('Transmisión detenida');
  }

  /* ---------------- 5 · juego de realidad mixta ---------------- */

  function setBar(id, value) {
    var v = Math.max(0, Math.min(100, Number(value) || 0));
    $(id).style.width = v + '%';
  }

  function renderState(s) {
    if (!s) return;
    setBar('barHunger', s.hunger);
    setBar('barHappy', s.happy);
    setBar('barClean', s.clean);
    var bits = [];
    if (s.scan) bits.push('Habitación: ' + s.scan);
    if (typeof s.score === 'number') bits.push('Puntos: ' + s.score);
    if (s.level) bits.push('Nivel ' + s.level);
    if (s.text) bits.push(s.text);
    $('gameState').textContent = bits.join(' · ') || 'Partida en marcha';
  }

  function onGameState(s) {
    renderState(s);
    var now = Date.now();
    if (now - st.stateSent < 1100) return;
    st.stateSent = now;
    wsSend({ type: 'game_state', state: s });
  }

  async function refreshXr() {
    var pill = $('xrPill');
    if (!(navigator.xr && navigator.xr.isSessionSupported)) {
      pill.className = 'pill off';
      pill.textContent = 'WebXR no disponible en este navegador';
      return;
    }
    try {
      var ok = await navigator.xr.isSessionSupported('immersive-ar');
      if (ok) {
        pill.className = 'pill on';
        pill.textContent = 'Realidad mixta lista (passthrough + escaneo)';
      } else {
        var vr = await navigator.xr.isSessionSupported('immersive-vr');
        pill.className = 'pill';
        pill.textContent = vr ? 'Solo VR (sin passthrough): jugarás en un cuarto virtual' : 'WebXR no disponible';
      }
    } catch (e) {
      pill.className = 'pill off';
      pill.textContent = 'No se pudo comprobar WebXR';
    }
  }

  async function startGame() {
    if (!global.DoganieroRoomSnake) {
      log('El juego no está cargado (vr-room-snake.js)');
      return;
    }
    $('gameBtn').disabled = true;
    try {
      await DoganieroRoomSnake.start({
        onState: onGameState,
        onLog: function (m) { log(m); },
        onEnd: function (why) {
          st.gameOn = false;
          $('gameBtn').disabled = false;
          $('gameBtn').hidden = false;
          $('gameStop').hidden = true;
          log('Juego terminado' + (why ? ' (' + why + ')' : ''));
          wsSend({ type: 'game_state', state: { scan: 'terminado', text: 'Juego terminado', hunger: 0, happy: 0, clean: 0 } });
          if (st.kind === 'game') stopShare(true);
        }
      });
      st.gameOn = true;
      $('gameBtn').hidden = true;
      $('gameStop').hidden = false;
      log('Juego MR iniciado: escanea la habitación');
      // Si ya estabas transmitiendo, cambia al espejo del juego.
      if (st.kind && st.kind !== 'game') {
        setTimeout(function () { startShare('game'); }, 1500);
      }
    } catch (e) {
      $('gameBtn').disabled = false;
      log('Juego: ' + (e.message || e));
      $('gameState').textContent = 'No se pudo abrir: ' + (e.message || e);
    }
  }

  function stopGame() {
    if (global.DoganieroRoomSnake) {
      try { DoganieroRoomSnake.stop(); } catch (e) {}
    }
    st.gameOn = false;
    $('gameBtn').disabled = false;
    $('gameBtn').hidden = false;
    $('gameStop').hidden = true;
  }

  function snapshotGame() {
    if (global.DoganieroRoomSnake && DoganieroRoomSnake.snapshot) {
      var url = DoganieroRoomSnake.snapshot();
      if (url) {
        wsSend({ type: 'screenshot', dataUrl: url });
        log('Foto enviada al ordenador');
        return;
      }
    }
    wsSend({ type: 'status', text: 'Gafas: abre el juego MR para poder mandar una foto' });
    log('No hay juego abierto del que sacar la foto');
  }

  /* ---------------- 6 · mensajes del servidor / ordenador ---------------- */

  function onMessage(raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'welcome':
        if (msg.iceServers) st.ice = msg.iceServers;
        if (msg.peers) {
          st.peers = msg.peers;
          if (st.peers.pc) setStatus('El ordenador está conectado · esperando solicitud', true);
        }
        log('Conectado como ' + (msg.name || msg.email));
        break;
      case 'peers':
        st.peers = { pc: msg.pc || 0, send: msg.send || 0 };
        if (st.peers.pc) setStatus('El ordenador está conectado', true);
        else setStatus('Enlace abierto · esperando al ordenador', !!st.ws);
        break;
      case 'request':
        showRequest(msg);
        break;
      case 'answer':
        if (st.rtc && msg.sdp) {
          st.rtc.setRemoteDescription({ type: 'answer', sdp: msg.sdp }).then(function () {
            log('Respuesta del ordenador recibida');
          }).catch(function (e) { log('WebRTC (respuesta): ' + (e.message || e)); });
        }
        break;
      case 'ice':
        if (st.rtc && msg.candidate) {
          st.rtc.addIceCandidate(msg.candidate).catch(function () {});
        }
        break;
      case 'hangup':
        stopShare(false);
        $('shareState').textContent = 'El ordenador ha cortado la transmisión.';
        log('El ordenador ha cortado');
        break;
      case 'game_cmd':
        if (msg.action === 'screenshot') snapshotGame();
        else if (msg.action === 'stop') stopGame();
        break;
      case 'bt_devices':
        if (Array.isArray(msg.devices) && msg.devices.length) {
          var names = msg.devices.map(function (d) { return d.name || d.id; }).join(', ');
          $('reqDevices').textContent = 'Gafas por Bluetooth del ordenador: ' + names;
        }
        break;
      case 'peer_offline':
        log('El ordenador ya no está conectado');
        setStatus('Enlace abierto · esperando al ordenador', !!st.ws);
        break;
      case 'error':
        log('Error: ' + (msg.detail || 'desconocido'));
        break;
      default:
        break;
    }
  }

  /* ---------------- 7 · arranque ---------------- */

  function wire() {
    $('loginForm').addEventListener('submit', login);
    $('logoutBtn').addEventListener('click', logout);
    $('codeBtn').addEventListener('click', enterCode);
    $('codeInput').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); enterCode(); }
    });
    $('acceptBtn').addEventListener('click', acceptRequest);
    $('rejectBtn').addEventListener('click', rejectRequest);
    $('shareScreen').addEventListener('click', function () { startShare('screen'); });
    $('shareGame').addEventListener('click', function () { startShare('game'); });
    $('shareCam').addEventListener('click', function () { startShare('camera'); });
    $('stopShare').addEventListener('click', function () { stopShare(true); });
    $('gameBtn').addEventListener('click', startGame);
    $('gameStop').addEventListener('click', stopGame);
    if (!canScreen()) {
      $('shareScreen').disabled = true;
      $('shareHint').innerHTML = 'Este navegador de las gafas no deja capturar la pantalla del visor: usa el <b>Juego MR</b> (su espejo se transmite igual) o la cámara.';
    }
    global.addEventListener('beforeunload', function () {
      wsSend({ type: 'hangup' });
      closeWS();
    });
  }

  async function boot() {
    wire();
    refreshXr();
    var urlCode = '';
    try {
      urlCode = (new URLSearchParams(location.search).get('code') || '').toUpperCase();
    } catch (e) {}
    if (urlCode) $('codeInput').value = urlCode;
    var user = await loadMe();
    log('Doganiero VR · Enviar listo');
    if (user) {
      connectWS('');
    } else if (urlCode || savedCode()) {
      st.code = urlCode || savedCode();
      $('codeInput').value = st.code;
      connectWS(st.code);
    } else {
      log('Entra con tu cuenta dogaemail o con el código del ordenador');
    }
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

  global.DogaVrSend = { st: st, log: log, startGame: startGame, stopGame: stopGame };
})(window);
