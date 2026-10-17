/* Doganiero Desk - transmision HD + control remoto */
(function () {
  'use strict';

  var DESK_ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function avHtml(av) {
    if (typeof window.snkAvatarHtml === 'function') return window.snkAvatarHtml(av, 'avatar-img');
    if (typeof window.avatarMarkup === 'function') return window.avatarMarkup(av, 'avatar-img');
    var a = String(av || '\uD83D\uDDA5\uFE0F');
    if (a.indexOf('/api/avatars/') === 0 || a.indexOf('data:image/') === 0) {
      return '<img class="avatar-img" src="' + esc(a) + '" alt="">';
    }
    return esc(a);
  }

  function api(path, opts) {
    if (typeof window.api === 'function') return window.api(path, opts);
    opts = opts || {};
    var init = { credentials: 'include', method: opts.method || 'GET', headers: {} };
    if (opts.body != null) {
      init.headers['Content-Type'] = 'application/json';
      init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    }
    return fetch(path, init).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = { detail: text }; }
        if (!res.ok) {
          var detail = (data && (data.detail || data.message)) || ('Error ' + res.status);
          var err = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (loadHtml2Canvas._p) return loadHtml2Canvas._p;
    loadHtml2Canvas._p = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.async = true;
      s.onload = function () { resolve(window.html2canvas); };
      s.onerror = function () {
        loadHtml2Canvas._p = null;
        reject(new Error('No se pudo cargar html2canvas'));
      };
      document.head.appendChild(s);
    });
    return loadHtml2Canvas._p;
  }

  var agent = {
    ws: null,
    pingTimer: null,
    stopped: true,
    myCode: '',
    myFormatted: '',
    sessionId: null,
    role: null,
    pc: null,
    dc: null,
    localStream: null,
    captureTimer: null,
    captureCanvas: null,
    captureCtx: null,
    h2c: null,
    listeners: [],
    ui: null,
    controlBound: false,
    controlVideo: null,
    lastPointerTarget: null,
    hostIndicator: null
  };

  function agentEmit(ev, data) {
    agent.listeners.slice().forEach(function (fn) {
      try { fn(ev, data); } catch (e) {}
    });
    if (agent.ui && typeof agent.ui.onEvent === 'function') {
      try { agent.ui.onEvent(ev, data); } catch (e2) {}
    }
  }

  function agentSend(obj) {
    if (!agent.ws || agent.ws.readyState !== 1) return false;
    try { agent.ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function stopCaptureLoop() {
    if (agent.captureTimer) {
      clearTimeout(agent.captureTimer);
      clearInterval(agent.captureTimer);
      agent.captureTimer = null;
    }
  }

  function setHostIndicator(on) {
    try {
      document.body.classList.toggle('desk-being-controlled', !!on);
      var el = agent.hostIndicator;
      if (on) {
        if (!el) {
          el = document.createElement('div');
          el.id = 'deskHostBadge';
          el.textContent = 'Control remoto activo';
          document.body.appendChild(el);
          agent.hostIndicator = el;
        }
        el.classList.add('show');
      } else if (el) {
        el.classList.remove('show');
      }
      ensureFastBtn();
      updateFastBtn();
    } catch (e) {}
  }

  function cleanupRtc() {
    stopCaptureLoop();
    clearConnectTimer();
    agent.gotTrack = false;
    try { if (agent.pc && agent.pc._discTimer) clearTimeout(agent.pc._discTimer); } catch (eT) {}
    try { if (agent.captureMo) agent.captureMo.disconnect(); } catch (eMo) {}
    agent.captureMo = null;
    agent.markDirty = null;
    agent.restartCanvasLoop = null;
    if (agent.fastStream) {
      try { agent.fastStream.getTracks().forEach(function (x) { x.onended = null; x.stop(); }); } catch (eF) {}
    }
    agent.fastStream = null;
    agent.fastTrack = null;
    agent.fastMode = false;
    agent.videoSender = null;
    agent.canvasTrack = null;
    unbindGuestControl();
    setHostIndicator(false);
    try {
      if (agent.dc) {
        try { agent.dc.close(); } catch (e0) {}
      }
    } catch (e1) {}
    agent.dc = null;
    try {
      if (agent.pc) {
        agent.pc.onicecandidate = null;
        agent.pc.ontrack = null;
        agent.pc.ondatachannel = null;
        agent.pc.close();
      }
    } catch (e) {}
    agent.pc = null;
    if (agent.localStream) {
      try { agent.localStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e2) {}
    }
    agent.localStream = null;
    agent.lastPointerTarget = null;
  }

  function endSession(reason) {
    cleanupRtc();
    agent.sessionId = null;
    agent.role = null;
    agentEmit('session_ended', { reason: reason || '' });
  }

  function setupDataChannel(dc) {
    agent.dc = dc;
    dc.binaryType = 'arraybuffer';
    dc.onopen = function () {
      agentEmit('control_ready', { role: agent.role });
      if (agent.role === 'host') setHostIndicator(true);
    };
    dc.onclose = function () {
      if (agent.dc === dc) agent.dc = null;
    };
    dc.onmessage = function (ev) {
      if (agent.role !== 'host') return;
      var msg = null;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      handleRemoteInput(msg);
    };
  }

  function sendInput(msg) {
    if (!agent.dc || agent.dc.readyState !== 'open') return;
    try { agent.dc.send(JSON.stringify(msg)); } catch (e) {}
  }

  function ensurePc(asOfferer) {
    if (agent.pc) return agent.pc;
    var pc = new RTCPeerConnection({
      iceServers: DESK_ICE,
      sdpSemantics: 'unified-plan'
    });
    pc.onicecandidate = function (ev) {
      if (!ev.candidate || !agent.sessionId) return;
      agentSend({
        type: 'ice',
        sessionId: agent.sessionId,
        candidate: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate
      });
    };
    pc.ontrack = function (ev) {
      // Baja latencia en el receptor: buffer de jitter minimo
      try {
        if (ev.receiver) {
          if ('jitterBufferTarget' in ev.receiver) ev.receiver.jitterBufferTarget = 0;
          if ('playoutDelayHint' in ev.receiver) ev.receiver.playoutDelayHint = 0;
        }
      } catch (eJb) {}
      var stream = (ev.streams && ev.streams[0]) || new MediaStream([ev.track]);
      agent.gotTrack = true;
      clearConnectTimer();
      agentEmit('remote_track', { stream: stream });
    };
    pc.ondatachannel = function (ev) {
      if (ev.channel && ev.channel.label === 'desk-input') setupDataChannel(ev.channel);
    };
    if (asOfferer) {
      setupDataChannel(pc.createDataChannel('desk-input', { ordered: true }));
    }
    pc._iceQueue = [];
    pc._restarts = 0;
    pc.onconnectionstatechange = function () { onPcState(pc); };
    pc.oniceconnectionstatechange = function () { onPcState(pc); };
    agent.pc = pc;
    return pc;
  }

  /* ---- Robustez WebRTC: reinicio ICE si la conexion directa cae ---- */
  var PC_MAX_RESTARTS = 4;

  function pcState(pc) {
    var s = pc.connectionState || '';
    if (!s || s === 'new') s = pc.iceConnectionState || s;
    return s;
  }

  function onPcState(pc) {
    if (pc !== agent.pc || !agent.sessionId) return;
    var s = pcState(pc);
    if (s === 'connected' || s === 'completed') {
      pc._restarts = 0;
      if (pc._discTimer) { clearTimeout(pc._discTimer); pc._discTimer = null; }
      clearConnectTimer();
      agentEmit('rtc_state', { state: 'connected' });
      return;
    }
    if (s === 'disconnected') {
      agentEmit('rtc_state', { state: 'reconnecting' });
      if (!pc._discTimer) {
        pc._discTimer = setTimeout(function () {
          pc._discTimer = null;
          if (pc === agent.pc && pcState(pc) === 'disconnected') requestIceRestart('disconnected');
        }, 3500);
      }
      return;
    }
    if (s === 'failed') {
      agentEmit('rtc_state', { state: 'reconnecting' });
      requestIceRestart('failed');
    }
  }

  function requestIceRestart(why) {
    var pc = agent.pc;
    if (!pc || !agent.sessionId) return;
    if (pc._restarts >= PC_MAX_RESTARTS) {
      agentEmit('error', { detail: 'No se pudo mantener la conexi\u00f3n directa con el otro escritorio (la red bloquea WebRTC). Int\u00e9ntalo de nuevo o prueba otra red.' });
      try { agentSend({ type: 'hangup', sessionId: agent.sessionId }); } catch (e0) {}
      endSession('Conexi\u00f3n perdida');
      return;
    }
    pc._restarts++;
    if (agent.role === 'host') {
      hostIceRestart().catch(function () {});
    } else {
      // El anfitrion es quien ofrece: pedirle que reinicie ICE
      agentSend({ type: 'restart', sessionId: agent.sessionId, why: why || '' });
    }
  }

  async function hostIceRestart() {
    var pc = agent.pc;
    if (!pc || agent.role !== 'host' || !agent.sessionId) return;
    if (pc.signalingState !== 'stable') {
      // Una negociacion en curso: reintentar en breve
      setTimeout(function () { if (agent.pc === pc) hostIceRestart().catch(function () {}); }, 800);
      return;
    }
    var offer = await pc.createOffer({ iceRestart: true });
    await pc.setLocalDescription(offer);
    agentSend({ type: 'offer', sessionId: agent.sessionId, sdp: pc.localDescription });
  }

  function clearConnectTimer() {
    if (agent.connectTimer) { clearTimeout(agent.connectTimer); agent.connectTimer = null; }
    if (agent.connectTimer2) { clearTimeout(agent.connectTimer2); agent.connectTimer2 = null; }
  }

  // Invitado: si en 15 s no llega imagen, reintento ICE; a los 40 s, error claro.
  function armGuestConnectTimer() {
    clearConnectTimer();
    var sid = agent.sessionId;
    agent.connectTimer = setTimeout(function () {
      agent.connectTimer = null;
      if (agent.sessionId !== sid || agent.role !== 'guest' || agent.gotTrack) return;
      agentEmit('status_msg', { text: 'Tarda en conectar\u2026 reintentando', ok: true });
      requestIceRestart('timeout');
    }, 15000);
    agent.connectTimer2 = setTimeout(function () {
      agent.connectTimer2 = null;
      if (agent.sessionId !== sid || agent.role !== 'guest' || agent.gotTrack) return;
      agentEmit('error', { detail: 'No se pudo conectar con ese escritorio. Comprueba que el otro Snake OS est\u00e1 abierto y con internet, y vuelve a intentarlo.' });
      try { agentSend({ type: 'hangup', sessionId: sid }); } catch (e) {}
      endSession('No se pudo conectar');
    }, 40000);
  }

  async function flushIceQueue(pc) {
    if (!pc || !pc.remoteDescription) return;
    var q = pc._iceQueue || [];
    pc._iceQueue = [];
    for (var i = 0; i < q.length; i++) {
      try { await pc.addIceCandidate(q[i]); } catch (e) {}
    }
  }

  var CAPTURE_TARGET_W = 1080;

  async function tuneVideoSender(pc) {
    try {
      var senders = pc.getSenders();
      for (var i = 0; i < senders.length; i++) {
        var sender = senders[i];
        if (!sender.track || sender.track.kind !== 'video') continue;
        try { sender.track.contentHint = 'detail'; } catch (e0) {}
        try {
          var params = sender.getParameters();
          if (!params.encodings || !params.encodings.length) params.encodings = [{}];
          // Bitrate alto + hasta 60 FPS (modo rapido) / lo que de el canvas
          params.encodings[0].maxBitrate = 10000000;
          params.encodings[0].maxFramerate = 60;
          params.encodings[0].scaleResolutionDownBy = 1.0;
          await sender.setParameters(params);
        } catch (e1) {}
        try {
          var p2 = sender.getParameters();
          p2.degradationPreference = 'balanced';
          await sender.setParameters(p2);
        } catch (e2) {}
      }
    } catch (e) {}
  }

  function captureScale(desktop) {
    var w = Math.max(1, desktop.clientWidth || window.innerWidth || 1280);
    // Ancho objetivo 1080px (nitidez). Escala baja si el escritorio es mas ancho = mas rapido.
    // Sin ampliar (max 1.0): menos pixeles por frame = mucho mas rapido en movil.
    return Math.max(0.5, Math.min(1.0, CAPTURE_TARGET_W / w));
  }

  function shouldIgnoreCaptureEl(el) {
    try {
      if (!el) return false;
      var id = el.id || '';
      if (id === 'ddeskRemote' || id === 'ddeskStage' || id === 'avatarAdjustOverlay' || id === 'appLauncher') return true;
      if (id === 'deskHostBadge' || id === 'qsSoftLock' || id === 'shotToast' || id === 'phoneRecentsOverlay') return true;
      if (id === 'deskFastBtn') return true;
      if (el.classList) {
        // display:none / visibility:hidden: no se ven, no hace falta clonarlos cada frame
        if (el.classList.contains('hidden')) return true;
        if (el.classList.contains('app-window') && el.classList.contains('minimized')) return true;
      }
      if (id === 'win-desk' || id === 'qsPanel' || id === 'wpPanel' || id === 'startMenu' || id === 'notifPanel') return true;
      if (el.tagName === 'IFRAME' || el.tagName === 'VIDEO') {
        if (id === 'ddeskRemote' || (el.closest && el.closest('#win-desk'))) return true;
      }
      if (el.classList && el.classList.contains('app-window') && id.indexOf('win-desk') === 0) return true;
      if (el.closest && el.closest('#win-desk')) return true;
      return false;
    } catch (e) { return false; }
  }

  function desktopBgColor() {
    try {
      var cs = window.getComputedStyle(document.body);
      if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return cs.backgroundColor;
    } catch (e) {}
    return '#0f2a1c';
  }

  function seedCanvasWithWallpaper(ctx, canvas) {
    var bg = desktopBgColor();
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    try {
      var cs = window.getComputedStyle(document.body);
      var img = cs.backgroundImage || '';
      var m = img && img.match(/url\(["']?([^"')]+)["']?\)/);
      if (!m) return;
      var src = m[1];
      if (agent._wpCache && agent._wpCache.src === src && agent._wpCache.img && agent._wpCache.img.complete) {
        ctx.drawImage(agent._wpCache.img, 0, 0, canvas.width, canvas.height);
        return;
      }
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () {
        agent._wpCache = { src: src, img: im };
        try {
          if (agent.captureCtx && agent.captureCanvas) {
            agent.captureCtx.drawImage(im, 0, 0, agent.captureCanvas.width, agent.captureCanvas.height);
          }
        } catch (e2) {}
      };
      im.src = src;
    } catch (e3) {}
  }

  function prepareCloneForCapture(clonedDoc, transparentBg) {
    if (transparentBg) {
      try {
        var st = clonedDoc.createElement('style');
        st.textContent = [
          '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;filter:none!important;box-shadow:none!important;text-shadow:none!important;transition:none!important;animation:none!important;}',
          'html,body,#desktop{background:transparent!important;background-image:none!important;}',
          '.app-window,.notif-panel,#taskbar,#startMenu,#qsPanel,#wpPanel,.glass, .panel{background:rgba(18,36,28,0.97)!important;}',
          '#win-desk,.ddesk-stage,#ddeskRemote,#deskHostBadge,#deskFastBtn,#shotToast,#appLauncher,#avatarAdjustOverlay,#qsPanel,#wpPanel,#startMenu,#notifPanel{display:none!important;visibility:hidden!important;}'
        ].join('');
        clonedDoc.head.appendChild(st);
      } catch (eT) {}
      return;
    }
    try {
      var bg = desktopBgColor();
      var bodyBg = '';
      try {
        var liveCs = window.getComputedStyle(document.body);
        if (liveCs.backgroundImage && liveCs.backgroundImage !== 'none') {
          bodyBg = 'background-image:' + liveCs.backgroundImage + '!important;background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important;';
        }
      } catch (eBg) {}
      var style = clonedDoc.createElement('style');
      style.textContent = [
        '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;filter:none!important;box-shadow:none!important;text-shadow:none!important;transition:none!important;animation:none!important;}',
        'body,#desktop{background-color:' + bg + '!important;' + bodyBg + '}',
        '.app-window,.notif-panel,#taskbar,#startMenu,#qsPanel,#wpPanel,.glass, .panel{background:rgba(18,36,28,0.97)!important;}',
        '#win-desk,.ddesk-stage,#ddeskRemote,#deskHostBadge,#shotToast,#appLauncher,#avatarAdjustOverlay,#qsPanel,#wpPanel,#startMenu,#notifPanel{display:none!important;visibility:hidden!important;}'
      ].join('');
      clonedDoc.head.appendChild(style);
      var desk = clonedDoc.getElementById('desktop');
      if (desk) {
        desk.style.backgroundColor = bg;
        if (bodyBg) {
          try {
            var liveCs2 = window.getComputedStyle(document.body);
            desk.style.backgroundImage = liveCs2.backgroundImage;
            desk.style.backgroundSize = 'cover';
            desk.style.backgroundPosition = 'center';
          } catch (e2) {}
        }
      }
    } catch (e) {}
  }

  function withCaptureChromeHidden(fn) {
    var ids = ['win-desk', 'deskHostBadge', 'qsPanel', 'wpPanel', 'appLauncher', 'shotToast', 'startMenu', 'notifPanel', 'avatarAdjustOverlay'];
    var prev = [];
    var i;
    for (i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el) continue;
      prev.push({ el: el, vis: el.style.visibility });
      el.style.visibility = 'hidden';
    }
    try {
      return Promise.resolve(fn()).then(function (r) {
        for (i = 0; i < prev.length; i++) prev[i].el.style.visibility = prev[i].vis || '';
        return r;
      }, function (err) {
        for (i = 0; i < prev.length; i++) prev[i].el.style.visibility = prev[i].vis || '';
        throw err;
      });
    } catch (syncErr) {
      for (i = 0; i < prev.length; i++) prev[i].el.style.visibility = prev[i].vis || '';
      return Promise.reject(syncErr);
    }
  }

  function nowMs() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  // Fondo de pantalla (una sola url) cacheado: se pinta 1 vez por frame con drawImage
  // en vez de que html2canvas lo cargue/decodifique/escale en cada captura.
  function wallpaperUrl() {
    try {
      var img = window.getComputedStyle(document.body).backgroundImage || '';
      if (!img || img === 'none') return '';
      var m = img.match(/^url\(["']?([^"')]+)["']?\)$/);
      return m ? m[1] : '';
    } catch (e) { return ''; }
  }

  function cachedWallpaper() {
    var src = wallpaperUrl();
    if (!src) return null;
    var c = agent._wpCache;
    if (c && c.src === src && c.img && c.img.complete && c.img.naturalWidth) return c.img;
    if (agent._wpLoading !== src) {
      agent._wpLoading = src;
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { agent._wpCache = { src: src, img: im }; if (agent._wpLoading === src) agent._wpLoading = null; };
      im.onerror = function () { if (agent._wpLoading === src) agent._wpLoading = null; };
      im.src = src;
    }
    return null;
  }

  function drawCover(ctx, img, w, h) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var s = Math.max(w / iw, h / ih);
    var dw = iw * s;
    var dh = ih * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  async function startHostDesktopShare() {
    var desktop = document.getElementById('desktop');
    if (!desktop) throw new Error('Escritorio no disponible');
    agent.h2c = await loadHtml2Canvas();
    cachedWallpaper();
    var canvas = document.createElement('canvas');
    var cssW = Math.max(320, desktop.clientWidth || window.innerWidth || 1280);
    var cssH = Math.max(240, desktop.clientHeight || window.innerHeight || 720);
    var scale0 = captureScale(desktop);
    // Lienzo = tamano real de captura (sin reescalar despues)
    canvas.width = Math.max(160, Math.round(cssW * scale0));
    canvas.height = Math.max(120, Math.round(cssH * scale0));
    agent.captureCanvas = canvas;
    agent.captureCtx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    agent.captureCtx.imageSmoothingEnabled = true;
    agent.captureCtx.imageSmoothingQuality = 'low';
    seedCanvasWithWallpaper(agent.captureCtx, canvas);

    var stream = canvas.captureStream(60);
    agent.localStream = stream;
    agent.canvasTrack = stream.getVideoTracks()[0] || null;
    var peer = ensurePc(true);
    stream.getTracks().forEach(function (tr) {
      try { tr.contentHint = 'detail'; } catch (e) {}
      var snd = peer.addTrack(tr, stream);
      if (tr.kind === 'video') agent.videoSender = snd;
    });

    var painting = false;
    var framesOk = 0;
    var lastCost = 60;
    var dirty = true;
    var lastDirty = nowMs();
    var liveMediaAt = 0;
    var liveMediaVal = false;

    function markDirty() {
      dirty = true;
      lastDirty = nowMs();
      if (!painting && agent.captureTimer && !agent.fastMode) schedule(0);
    }
    agent.markDirty = markDirty;

    // Cambios del DOM => captura inmediata (en vez de esperar al siguiente tick fijo)
    try {
      if (agent.captureMo) agent.captureMo.disconnect();
      agent.captureMo = new MutationObserver(function () { markDirty(); });
      agent.captureMo.observe(desktop, { subtree: true, childList: true, attributes: true, characterData: true });
    } catch (eMo) {}

    function hasLiveMedia() {
      var t = nowMs();
      if (t - liveMediaAt < 1000) return liveMediaVal;
      liveMediaAt = t;
      try {
        liveMediaVal = !!desktop.querySelector('.app-window:not(.minimized) canvas, .app-window:not(.minimized) video');
      } catch (e) { liveMediaVal = false; }
      return liveMediaVal;
    }

    async function paint() {
      if (painting || agent.stopped || agent.role !== 'host' || agent.fastMode) return;
      painting = true;
      dirty = false;
      var t0 = nowMs();
      try {
        var w = Math.max(320, desktop.clientWidth || cssW);
        var h = Math.max(240, desktop.clientHeight || cssH);
        var sc = captureScale(desktop);
        var wp = cachedWallpaper();
        var transparent = !!wp;
        // Sin tocar la pagina real (antes se ocultaban elementos en vivo cada frame = reflow)
        var shot = await agent.h2c(desktop, {
          width: w,
          height: h,
          scale: sc,
          logging: false,
          useCORS: true,
          allowTaint: false,
          backgroundColor: transparent ? null : desktopBgColor(),
          foreignObjectRendering: false,
          imageTimeout: 150,
          removeContainer: true,
          x: 0,
          y: 0,
          scrollX: 0,
          scrollY: 0,
          windowWidth: w,
          windowHeight: h,
          onclone: function (doc) { prepareCloneForCapture(doc, transparent); },
          ignoreElements: shouldIgnoreCaptureEl
        });
        if (agent.stopped || agent.role !== 'host' || agent.fastMode) return;
        var outW = shot.width || Math.round(w * sc);
        var outH = shot.height || Math.round(h * sc);
        if (canvas.width !== outW || canvas.height !== outH) {
          canvas.width = outW;
          canvas.height = outH;
          agent.captureCtx = canvas.getContext('2d', { alpha: false, desynchronized: true });
          agent.captureCtx.imageSmoothingEnabled = true;
          agent.captureCtx.imageSmoothingQuality = 'low';
        }
        var ctx = agent.captureCtx;
        if (transparent) {
          ctx.fillStyle = desktopBgColor();
          ctx.fillRect(0, 0, outW, outH);
          drawCover(ctx, wp, outW, outH);
        }
        ctx.drawImage(shot, 0, 0, outW, outH);
        try { if (agent.canvasTrack && agent.canvasTrack.requestFrame) agent.canvasTrack.requestFrame(); } catch (eRf) {}
        framesOk++;
        lastCost = nowMs() - t0;
      } catch (e) {
        try {
          if (!framesOk) {
            seedCanvasWithWallpaper(agent.captureCtx, canvas);
            agent.captureCtx.fillStyle = '#7CFC9A';
            agent.captureCtx.font = 'bold 15px sans-serif';
            agent.captureCtx.fillText('Capturando escritorio\u2026', 16, 28);
          }
        } catch (e2) {}
      } finally {
        painting = false;
      }
    }

    function nextDelay() {
      // Hueco corto tras cada captura (deja respirar a la pagina) en vez de +33..55 ms fijos
      var gap = Math.max(4, Math.min(30, Math.round(lastCost * 0.25)));
      if (dirty || (nowMs() - lastDirty) < 1500 || hasLiveMedia()) return gap;
      return 250; // en reposo: refresco suave para hovers/animaciones CSS
    }

    function schedule(delay) {
      if (agent.captureTimer) clearTimeout(agent.captureTimer);
      agent.captureTimer = setTimeout(loop, delay);
    }

    function loop() {
      agent.captureTimer = null;
      if (agent.stopped || agent.role !== 'host' || agent.fastMode) return;
      paint().then(function () {
        if (agent.stopped || agent.role !== 'host' || agent.fastMode) return;
        schedule(nextDelay());
      });
    }
    agent.restartCanvasLoop = function () {
      dirty = true;
      lastDirty = nowMs();
      schedule(0);
    };

    await paint();
    if (framesOk < 1) await paint();
    await tuneVideoSender(peer);
    var offer = await peer.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    await peer.setLocalDescription(offer);
    agentSend({ type: 'offer', sessionId: agent.sessionId, sdp: peer.localDescription });

    stopCaptureLoop();
    schedule(0);
    agentEmit('hosting', { sessionId: agent.sessionId });
    updateFastBtn();
  }

  /* ---- Modo rapido (ordenador): captura real de la pestana a 60 FPS ----
   * Requiere un clic del anfitrion (el navegador lo exige) y Chrome/Edge.
   * En movil o si no se puede, sigue la captura optimizada por canvas. */
  function fastModeSupported() {
    try {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') return false;
      if (document.body.classList.contains('phone-mode')) return false;
      if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')) return false;
      return true;
    } catch (e) { return false; }
  }

  function setFastBtnLabel(text, title) {
    var b = agent.fastBtn;
    if (!b) return;
    b.textContent = text;
    if (title) b.title = title;
  }

  function updateFastBtn() {
    var b = agent.fastBtn;
    if (!b) return;
    var show = agent.role === 'host' && !!agent.pc && fastModeSupported() && document.body.classList.contains('desk-being-controlled');
    b.style.display = show ? 'block' : 'none';
    if (agent.fastMode) setFastBtnLabel('\u26a1 R\u00e1pida activa \u00b7 parar', 'Volver a la transmisi\u00f3n normal');
    else setFastBtnLabel('\u26a1 Transmisi\u00f3n r\u00e1pida', 'Compartir esta pesta\u00f1a a 60 FPS (elige \u00abEsta pesta\u00f1a\u00bb)');
  }

  function stopFastMode() {
    var tr = agent.fastTrack;
    agent.fastTrack = null;
    if (agent.fastStream) {
      try { agent.fastStream.getTracks().forEach(function (x) { x.onended = null; x.stop(); }); } catch (e) {}
    }
    agent.fastStream = null;
    var wasFast = agent.fastMode;
    agent.fastMode = false;
    if (wasFast && agent.videoSender && agent.canvasTrack && agent.pc) {
      agent.videoSender.replaceTrack(agent.canvasTrack).catch(function () {});
      if (typeof agent.restartCanvasLoop === 'function') agent.restartCanvasLoop();
    }
    void tr;
    updateFastBtn();
  }

  async function startFastMode() {
    if (agent.role !== 'host' || !agent.pc || !agent.videoSender) return;
    if (agent.fastMode) { stopFastMode(); return; }
    var stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 60, max: 60 }, displaySurface: 'browser' },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
      monitorTypeSurfaces: 'exclude'
    });
    var track = stream.getVideoTracks()[0];
    function bail(msg) {
      try { stream.getTracks().forEach(function (x) { x.stop(); }); } catch (e) {}
      throw new Error(msg);
    }
    if (!track) bail('No se pudo capturar la pesta\u00f1a');
    var st = {};
    try { st = track.getSettings ? track.getSettings() : {}; } catch (eS) {}
    if (st.displaySurface && st.displaySurface !== 'browser') bail('Elige \u00abEsta pesta\u00f1a\u00bb (Snake OS)');
    // Recorte exacto a #desktop (solo funciona si es esta misma pestana) => clics alineados
    if (window.CropTarget && typeof window.CropTarget.fromElement === 'function' && typeof track.cropTo === 'function') {
      try {
        var ct = await window.CropTarget.fromElement(document.getElementById('desktop'));
        await track.cropTo(ct);
      } catch (eC) {
        bail('Elige \u00abEsta pesta\u00f1a\u00bb (Snake OS)');
      }
    }
    if (agent.role !== 'host' || !agent.pc || !agent.videoSender) bail('La sesi\u00f3n termin\u00f3');
    try { track.contentHint = 'motion'; } catch (eH) {}
    await agent.videoSender.replaceTrack(track);
    agent.fastMode = true;
    agent.fastStream = stream;
    agent.fastTrack = track;
    stopCaptureLoop();
    track.onended = function () { stopFastMode(); };
    try { await tuneVideoSender(agent.pc); } catch (eT) {}
    updateFastBtn();
  }

  function ensureFastBtn() {
    if (agent.fastBtn) return agent.fastBtn;
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'deskFastBtn';
    b.style.cssText = 'position:fixed;top:52px;left:50%;transform:translateX(-50%);z-index:15001;display:none;' +
      'padding:7px 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.25);font-size:0.76rem;font-weight:800;' +
      'color:#fff;background:linear-gradient(135deg,#6c5ce7,#00b4d8);box-shadow:0 8px 24px rgba(0,0,0,0.35);cursor:pointer;';
    b.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (!ev.isTrusted) return; // el invitado no puede activarlo en remoto
      startFastMode().catch(function (err) {
        setFastBtnLabel('\u26a0 ' + ((err && err.name === 'NotAllowedError') ? 'Cancelado' : ((err && err.message) || 'No disponible')));
        setTimeout(updateFastBtn, 2600);
      });
    });
    document.body.appendChild(b);
    agent.fastBtn = b;
    return b;
  }

  function desktopPointFromNorm(nx, ny) {
    var desktop = document.getElementById('desktop');
    if (!desktop || desktop.classList.contains('hidden')) return null;
    var rect = desktop.getBoundingClientRect();
    var x = rect.left + nx * rect.width;
    var y = rect.top + ny * rect.height;
    return { x: x, y: y, desktop: desktop, rect: rect };
  }

  function fireAt(target, type, x, y, extra) {
    if (!target) return;
    extra = extra || {};
    var common = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: extra.button || 0,
      buttons: extra.buttons != null ? extra.buttons : (type === 'pointerup' || type === 'mouseup' ? 0 : 1),
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      width: 1,
      height: 1,
      pressure: (type === 'pointerup' || type === 'mouseup') ? 0 : 0.5
    };
    try {
      if (typeof PointerEvent === 'function' && type.indexOf('pointer') === 0) {
        target.dispatchEvent(new PointerEvent(type, common));
      }
    } catch (e) {}
    try {
      var mouseType = type.replace('pointer', 'mouse');
      if (mouseType === 'mousedown' || mouseType === 'mouseup' || mouseType === 'mousemove' || mouseType === 'click' || mouseType === 'dblclick' || mouseType === 'contextmenu') {
        target.dispatchEvent(new MouseEvent(mouseType, common));
      }
    } catch (e2) {}
  }

  function handleRemoteInput(msg) {
    if (!msg || !msg.type) return;
    try { if (agent.markDirty) agent.markDirty(); } catch (eD) {}
    if (msg.type === 'pointer') {
      var pt = desktopPointFromNorm(msg.nx, msg.ny);
      if (!pt) return;
      var target = document.elementFromPoint(pt.x, pt.y) || pt.desktop;
      agent.lastPointerTarget = target;
      var act = msg.action;
      if (act === 'move') {
        fireAt(target, 'pointermove', pt.x, pt.y, msg);
        fireAt(target, 'mousemove', pt.x, pt.y, msg);
      } else if (act === 'down') {
        fireAt(target, 'pointerdown', pt.x, pt.y, msg);
        fireAt(target, 'mousedown', pt.x, pt.y, msg);
        try { if (target.focus) target.focus({ preventScroll: true }); } catch (e) {}
      } else if (act === 'up') {
        fireAt(target, 'pointerup', pt.x, pt.y, msg);
        fireAt(target, 'mouseup', pt.x, pt.y, msg);
        fireAt(target, 'click', pt.x, pt.y, msg);
      } else if (act === 'dbl') {
        fireAt(target, 'dblclick', pt.x, pt.y, msg);
      } else if (act === 'context') {
        fireAt(target, 'contextmenu', pt.x, pt.y, msg);
      }
      return;
    }
    if (msg.type === 'wheel') {
      var ptw = desktopPointFromNorm(msg.nx, msg.ny);
      if (!ptw) return;
      var tw = document.elementFromPoint(ptw.x, ptw.y) || ptw.desktop;
      try {
        tw.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          clientX: ptw.x,
          clientY: ptw.y,
          deltaX: msg.dx || 0,
          deltaY: msg.dy || 0,
          deltaMode: msg.mode || 0
        }));
      } catch (e) {}
      return;
    }
    if (msg.type === 'key') {
      var kel = agent.lastPointerTarget || document.activeElement || document.getElementById('desktop');
      if (!kel) return;
      var init = {
        bubbles: true,
        cancelable: true,
        key: msg.key,
        code: msg.code,
        keyCode: msg.keyCode || 0,
        which: msg.which || msg.keyCode || 0,
        altKey: !!msg.altKey,
        ctrlKey: !!msg.ctrlKey,
        metaKey: !!msg.metaKey,
        shiftKey: !!msg.shiftKey,
        repeat: !!msg.repeat
      };
      try {
        kel.dispatchEvent(new KeyboardEvent(msg.action === 'up' ? 'keyup' : (msg.action === 'press' ? 'keypress' : 'keydown'), init));
      } catch (e3) {}
      // Also inject into focused inputs
      if (msg.action === 'down' && msg.key && msg.key.length === 1 && !msg.ctrlKey && !msg.metaKey && !msg.altKey) {
        try {
          if (kel.tagName === 'INPUT' || kel.tagName === 'TEXTAREA' || kel.isContentEditable) {
            // browsers often ignore synthetic keydown for typing; try input event
            if (typeof kel.value === 'string' && kel.tagName !== 'DIV') {
              var start = kel.selectionStart != null ? kel.selectionStart : kel.value.length;
              var end = kel.selectionEnd != null ? kel.selectionEnd : kel.value.length;
              kel.value = kel.value.slice(0, start) + msg.key + kel.value.slice(end);
              var pos = start + msg.key.length;
              try { kel.setSelectionRange(pos, pos); } catch (e4) {}
              kel.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
        } catch (e5) {}
      }
    }
  }

  function videoNormCoords(video, clientX, clientY) {
    var rect = video.getBoundingClientRect();
    var vw = video.videoWidth || 1;
    var vh = video.videoHeight || 1;
    var scale = Math.min(rect.width / vw, rect.height / vh);
    var dispW = vw * scale;
    var dispH = vh * scale;
    var offX = rect.left + (rect.width - dispW) / 2;
    var offY = rect.top + (rect.height - dispH) / 2;
    var x = (clientX - offX) / dispW;
    var y = (clientY - offY) / dispH;
    if (x < 0 || y < 0 || x > 1 || y > 1) return null;
    return { nx: x, ny: y };
  }

  function unbindGuestControl() {
    var v = agent.controlVideo;
    if (!v || !agent.controlBound) {
      agent.controlBound = false;
      agent.controlVideo = null;
      return;
    }
    var handlers = v._deskHandlers || {};
    Object.keys(handlers).forEach(function (k) {
      v.removeEventListener(k, handlers[k]);
    });
    v._deskHandlers = null;
    v.classList.remove('ddesk-controlling');
    agent.controlBound = false;
    agent.controlVideo = null;
  }

  function bindGuestControl(video) {
    unbindGuestControl();
    if (!video) return;
    agent.controlVideo = video;
    agent.controlBound = true;
    video.classList.add('ddesk-controlling');
    video.tabIndex = 0;
    try { video.focus({ preventScroll: true }); } catch (e) {}

    var handlers = {};
    function onPointer(action, e) {
      if (agent.role !== 'guest') return;
      var n = videoNormCoords(video, e.clientX, e.clientY);
      if (!n) return;
      e.preventDefault();
      sendInput({
        type: 'pointer',
        action: action,
        nx: n.nx,
        ny: n.ny,
        button: e.button || 0,
        buttons: e.buttons || 0
      });
    }
    handlers.pointerdown = function (e) { onPointer('down', e); try { video.setPointerCapture(e.pointerId); } catch (err) {} try { video.focus(); } catch (e2) {} };
    handlers.pointermove = function (e) { onPointer('move', e); };
    handlers.pointerup = function (e) { onPointer('up', e); };
    handlers.pointercancel = function (e) { onPointer('up', e); };
    handlers.dblclick = function (e) { onPointer('dbl', e); };
    handlers.contextmenu = function (e) { e.preventDefault(); onPointer('context', e); };
    handlers.wheel = function (e) {
      if (agent.role !== 'guest') return;
      var n = videoNormCoords(video, e.clientX, e.clientY);
      if (!n) return;
      e.preventDefault();
      sendInput({ type: 'wheel', nx: n.nx, ny: n.ny, dx: e.deltaX, dy: e.deltaY, mode: e.deltaMode });
    };
    handlers.keydown = function (e) {
      if (agent.role !== 'guest') return;
      // allow Esc locally? still send
      sendInput({
        type: 'key',
        action: 'down',
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
        which: e.which,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        repeat: e.repeat
      });
      if (!(e.ctrlKey || e.metaKey || e.altKey) && e.key && e.key.length === 1) {
        e.preventDefault();
      }
    };
    handlers.keyup = function (e) {
      if (agent.role !== 'guest') return;
      sendInput({
        type: 'key',
        action: 'up',
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
        which: e.which,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey
      });
    };

    Object.keys(handlers).forEach(function (k) {
      video.addEventListener(k, handlers[k], { passive: false });
    });
    video._deskHandlers = handlers;
  }

  async function handleOffer(sdp) {
    var peer = ensurePc(false);
    await peer.setRemoteDescription(sdp);
    await flushIceQueue(peer);
    var answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    agentSend({ type: 'answer', sessionId: agent.sessionId, sdp: peer.localDescription });
  }

  async function handleAnswer(sdp) {
    var pc = agent.pc;
    if (!pc) return;
    if (pc.signalingState !== 'have-local-offer') return; // respuesta duplicada/tardia
    await pc.setRemoteDescription(sdp);
    await flushIceQueue(pc);
  }

  async function handleIce(candidate) {
    if (!candidate) return;
    // Los candidatos pueden llegar ANTES de la oferta: antes se perdian (fallo de conexion).
    var pc = agent.pc || (agent.role === 'guest' ? ensurePc(false) : null);
    if (!pc) return;
    if (!pc.remoteDescription || !pc.remoteDescription.type) {
      pc._iceQueue.push(candidate);
      return;
    }
    try { await pc.addIceCandidate(candidate); } catch (e) {}
  }

  function onAgentMessage(msg) {
    var t = msg && msg.type;
    if (t === 'welcome') {
      agent.myCode = msg.code || agent.myCode;
      agent.myFormatted = msg.formatted || agent.myFormatted;
      agentEmit('welcome', msg);
      return;
    }
    if (t === 'error') {
      agentEmit('error', { detail: msg.detail || 'Error' });
      return;
    }
    if (t === 'pong') return;
    if (t === 'resumed') {
      if (msg.sessionId && msg.sessionId === agent.sessionId) {
        agentEmit('status', { text: 'Conectado', online: true });
        // Si la conexion directa se cayo mientras tanto, reiniciar ICE
        if (agent.pc && pcState(agent.pc) !== 'connected' && pcState(agent.pc) !== 'completed' && agent.role === 'host') {
          hostIceRestart().catch(function () {});
        }
      }
      return;
    }
    if (t === 'peer_resumed') {
      if (msg.sessionId === agent.sessionId && agent.pc && agent.role === 'host') {
        var st0 = pcState(agent.pc);
        if (st0 !== 'connected' && st0 !== 'completed') hostIceRestart().catch(function () {});
      }
      return;
    }
    if (t === 'restart') {
      if (msg.sessionId === agent.sessionId && agent.role === 'host') {
        hostIceRestart().catch(function () {});
      }
      return;
    }
    if (t === 'host_start' || (t === 'accepted' && msg.role === 'host')) {
      if (agent.sessionId && msg.sessionId && agent.sessionId !== msg.sessionId) {
        // Restos de una sesion anterior: limpiar antes (antes se reutilizaba el RTCPeerConnection viejo)
        cleanupRtc();
      }
      agent.sessionId = msg.sessionId || agent.sessionId;
      agent.role = 'host';
      agentEmit('host_start', msg);
      startHostDesktopShare().catch(function (err) {
        agentEmit('error', { detail: (err && err.message) || 'No se pudo compartir el escritorio' });
        if (agent.sessionId) agentSend({ type: 'hangup', sessionId: agent.sessionId });
        endSession();
      });
      return;
    }
    if (t === 'accepted' && msg.role === 'guest') {
      if (agent.sessionId && msg.sessionId && agent.sessionId !== msg.sessionId) cleanupRtc();
      agent.sessionId = msg.sessionId || agent.sessionId;
      agent.role = 'guest';
      agent.gotTrack = false;
      ensurePc(false);
      armGuestConnectTimer();
      agentEmit('guest_connected', msg);
      return;
    }
    if (t === 'connecting') {
      agent.sessionId = msg.sessionId;
      agent.role = 'guest';
      agentEmit('connecting', msg);
      return;
    }
    if (t === 'offer' && msg.sessionId === agent.sessionId) {
      handleOffer(msg.sdp).catch(function (err) {
        agentEmit('error', { detail: (err && err.message) || 'Error WebRTC' });
      });
      return;
    }
    if (t === 'answer' && msg.sessionId === agent.sessionId) {
      handleAnswer(msg.sdp).catch(function () {});
      return;
    }
    if (t === 'ice' && msg.sessionId === agent.sessionId) {
      handleIce(msg.candidate);
      return;
    }
    if ((t === 'session_ended' || t === 'rejected') && msg.sessionId && agent.sessionId && msg.sessionId !== agent.sessionId) {
      return; // aviso de una sesion vieja: no cortar la actual
    }
    if ((t === 'session_ended' || t === 'rejected') && !agent.sessionId) return;
    if (t === 'session_ended' || t === 'rejected') {
      var reason = msg.detail || msg.reason || 'Sesi\u00f3n finalizada';
      if (msg.reason === 'peer_offline') reason = 'La otra persona se desconect\u00f3 de Snake OS';
      if (msg.reason === 'hangup') reason = 'Sesi\u00f3n finalizada';
      if (msg.reason === 'expired') reason = 'La sesi\u00f3n caduc\u00f3 (conexi\u00f3n perdida). Vuelve a conectar.';
      endSession(reason);
      return;
    }
    if (t === 'replaced') {
      agentEmit('status', { text: 'Reconectado en otra pesta\u00f1a', online: false });
    }
  }

  var WS_PING_MS = 15000;
  var WS_DEAD_MS = 40000;

  function clearWsTimers() {
    if (agent.pingTimer) { clearInterval(agent.pingTimer); agent.pingTimer = null; }
    if (agent.reconnectTimer) { clearTimeout(agent.reconnectTimer); agent.reconnectTimer = null; }
  }

  function scheduleReconnect(fatal) {
    if (agent.stopped) return;
    if (agent.reconnectTimer) return;
    agent.retry = (agent.retry || 0) + 1;
    // Backoff exponencial con jitter: 1s, 2s, 4s, 8s ... max 20s (30s si sesion invalida)
    var base = Math.min(20000, 1000 * Math.pow(2, Math.min(5, agent.retry - 1)));
    if (fatal) base = 30000;
    var delay = Math.round(base * (0.75 + Math.random() * 0.5));
    agentEmit('status', { text: 'Reconectando\u2026 (' + Math.max(1, Math.round(delay / 1000)) + ' s)', online: false });
    agent.reconnectTimer = setTimeout(function () {
      agent.reconnectTimer = null;
      connectAgentWs();
    }, delay);
  }

  function connectAgentWs() {
    if (agent.stopped) return;
    if (agent.reconnectTimer) { clearTimeout(agent.reconnectTimer); agent.reconnectTimer = null; }
    var old = agent.ws;
    agent.ws = null;
    if (old) {
      try { old.onclose = null; old.onerror = null; old.onmessage = null; old.close(); } catch (e) {}
    }
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var ws;
    try {
      ws = new WebSocket(proto + '//' + location.host + '/api/desk/ws');
    } catch (eNew) {
      scheduleReconnect(false);
      return;
    }
    agent.ws = ws;
    agent.lastRx = Date.now();
    agent.fatalAuth = false;
    agentEmit('status', { text: agent.retry ? 'Reconectando\u2026' : 'Conectando\u2026', online: false });
    ws.onopen = function () {
      if (agent.ws !== ws) return;
      agent.retry = 0;
      agent.lastRx = Date.now();
      agentEmit('status', { text: 'Conectado (listo para conexiones)', online: true });
      // Reanudar la sesion activa tras un corte del WebSocket (la conexion WebRTC puede seguir viva)
      if (agent.sessionId) agentSend({ type: 'resume', sessionId: agent.sessionId, role: agent.role });
      if (agent.pingTimer) clearInterval(agent.pingTimer);
      agent.pingTimer = setInterval(function () {
        if (agent.ws !== ws) return;
        if (Date.now() - (agent.lastRx || 0) > WS_DEAD_MS) {
          // Socket medio muerto (movil dormido, proxy): forzar reconexion
          try { ws.close(); } catch (eC) {}
          return;
        }
        agentSend({ type: 'ping', t: Date.now(), vis: document.visibilityState === 'visible' });
      }, WS_PING_MS);
    };
    ws.onclose = function (ev) {
      if (agent.ws !== ws) return;
      agent.ws = null;
      if (agent.pingTimer) { clearInterval(agent.pingTimer); agent.pingTimer = null; }
      if (agent.stopped) return;
      scheduleReconnect(!!(ev && ev.code === 4401) || agent.fatalAuth);
    };
    ws.onerror = function () {};
    ws.onmessage = function (ev) {
      if (agent.ws !== ws) return;
      agent.lastRx = Date.now();
      var msg = null;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg && msg.type === 'error' && msg.fatal) agent.fatalAuth = true;
      onAgentMessage(msg);
    };
  }

  function wakeDeskWs() {
    if (agent.stopped) return;
    var ws = agent.ws;
    if (!ws || ws.readyState > 1) {
      agent.retry = 0;
      connectAgentWs();
    } else if (ws.readyState === 1) {
      agentSend({ type: 'ping', t: Date.now(), vis: document.visibilityState === 'visible' });
    }
  }

  if (!window.__deskWakeBound) {
    window.__deskWakeBound = true;
    window.addEventListener('online', wakeDeskWs);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') wakeDeskWs();
    });
  }

  function startDeskAgent() {
    if (!window.currentUser) return;
    agent.stopped = false;
    api('/api/desk/me').then(function (data) {
      agent.myCode = data.code || '';
      agent.myFormatted = data.formatted || agent.myCode;
      agentEmit('welcome', data);
    }).catch(function () {});
    connectAgentWs();
  }

  function stopDeskAgent() {
    agent.stopped = true;
    clearWsTimers();
    agent.retry = 0;
    if (agent.sessionId) {
      try { agentSend({ type: 'hangup', sessionId: agent.sessionId }); } catch (e) {}
    }
    endSession();
    try { if (agent.ws) { agent.ws.onclose = null; agent.ws.close(); } } catch (e2) {}
    agent.ws = null;
    agent.myCode = '';
    agent.myFormatted = '';
  }

  function deskConnectTo(code) {
    return api('/api/desk/lookup', { method: 'POST', body: { code: code } }).then(function () {
      if (!agent.ws || agent.ws.readyState !== 1) {
        wakeDeskWs();
        throw new Error('Reconectando con el servidor\u2026 espera un segundo e int\u00e9ntalo de nuevo.');
      }
      if (agent.sessionId) {
        // Cerrar la sesion anterior antes de abrir otra
        agentSend({ type: 'hangup', sessionId: agent.sessionId });
        endSession('');
      }
      if (!agentSend({ type: 'connect', code: code })) {
        throw new Error('No se pudo enviar la conexi\u00f3n. Int\u00e9ntalo de nuevo.');
      }
    });
  }

  function deskHangup() {
    if (agent.sessionId) agentSend({ type: 'hangup', sessionId: agent.sessionId });
    endSession('Sesi\u00f3n finalizada');
  }

  window.startDeskAgent = startDeskAgent;
  window.stopDeskAgent = stopDeskAgent;
  window.deskConnectTo = deskConnectTo;
  window.deskHangup = deskHangup;
  window.getDeskAgentInfo = function () {
    return { code: agent.myCode, formatted: agent.myFormatted, online: !!(agent.ws && agent.ws.readyState === 1) };
  };

  function renderDoganieroDeskApp(container) {
    container.innerHTML =
      '<div class="ddesk">' +
        '<div class="ddesk-head" id="ddeskHead">' +
          '<div class="ddesk-brand">\uD83D\uDDA5\uFE0F Doganiero Desk</div>' +
          '<p class="ddesk-sub">Tu c\u00f3digo es \u00fanico. Al conectarte ver\u00e1s el escritorio en calidad alta y podr\u00e1s controlarlo con rat\u00f3n y teclado.</p>' +
        '</div>' +
        '<div class="ddesk-card" id="ddeskCodeCard">' +
          '<div class="ddesk-label">Tu c\u00f3digo de escritorio</div>' +
          '<div class="ddesk-code" id="ddeskCode">\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7</div>' +
          '<div class="ddesk-row">' +
            '<button type="button" id="ddeskCopy">Copiar</button>' +
            '<span class="ddesk-status" id="ddeskStatus">\u2026</span>' +
          '</div>' +
        '</div>' +
        '<div class="ddesk-card" id="ddeskConnectCard">' +
          '<div class="ddesk-label">Conectar a otro escritorio</div>' +
          '<input type="text" id="ddeskTarget" inputmode="numeric" autocomplete="off" placeholder="Ej: 123 456 789" maxlength="14">' +
          '<div class="ddesk-row">' +
            '<button type="button" class="ddesk-primary" id="ddeskConnect">Conectar</button>' +
          '</div>' +
          '<p class="ddesk-msg" id="ddeskMsg"></p>' +
        '</div>' +
        '<div class="ddesk-session hidden" id="ddeskSession">' +
          '<div class="ddesk-session-bar">' +
            '<span id="ddeskSessionLabel">Sesi\u00f3n remota</span>' +
            '<button type="button" id="ddeskHangup">Desconectar</button>' +
          '</div>' +
          '<div class="ddesk-stage" id="ddeskStage">' +
            '<video id="ddeskRemote" autoplay playsinline muted></video>' +
          '</div>' +
          '<p class="ddesk-hint" id="ddeskHint"></p>' +
        '</div>' +
      '</div>';

    var codeEl = container.querySelector('#ddeskCode');
    var statusEl = container.querySelector('#ddeskStatus');
    var msgEl = container.querySelector('#ddeskMsg');
    var targetInp = container.querySelector('#ddeskTarget');
    var sessionBox = container.querySelector('#ddeskSession');
    var sessionLabel = container.querySelector('#ddeskSessionLabel');
    var remoteVideo = container.querySelector('#ddeskRemote');
    var hintEl = container.querySelector('#ddeskHint');
    var head = container.querySelector('#ddeskHead');
    var codeCard = container.querySelector('#ddeskCodeCard');
    var connectCard = container.querySelector('#ddeskConnectCard');
    var root = container.querySelector('.ddesk');

    function setMsg(text, ok) {
      msgEl.textContent = text || '';
      msgEl.className = 'ddesk-msg' + (text ? (ok ? ' ok' : ' err') : '');
    }
    function setStatus(text, online) {
      statusEl.textContent = text || '';
      statusEl.classList.toggle('online', !!online);
    }
    var stageEl = container.querySelector('#ddeskStage');
    function showSession(label, mode) {
      // mode: 'guest' | 'host'
      sessionBox.classList.remove('hidden');
      sessionLabel.textContent = label || 'Sesi\u00f3n remota';
      root.classList.remove('ddesk-live');
      root.classList.remove('ddesk-hosting');
      if (mode === 'guest') {
        root.classList.add('ddesk-live');
        if (stageEl) stageEl.classList.remove('hidden');
        if (head) head.classList.add('hidden');
        if (codeCard) codeCard.classList.add('hidden');
        if (connectCard) connectCard.classList.add('hidden');
      } else {
        // Anfitrion: NO mostrar el video negro vacio
        root.classList.add('ddesk-hosting');
        if (stageEl) stageEl.classList.add('hidden');
        if (head) head.classList.remove('hidden');
        if (codeCard) codeCard.classList.remove('hidden');
        if (connectCard) connectCard.classList.remove('hidden');
      }
    }
    function hideSession() {
      sessionBox.classList.add('hidden');
      root.classList.remove('ddesk-live');
      root.classList.remove('ddesk-hosting');
      if (stageEl) stageEl.classList.remove('hidden');
      if (head) head.classList.remove('hidden');
      if (codeCard) codeCard.classList.remove('hidden');
      if (connectCard) connectCard.classList.remove('hidden');
      unbindGuestControl();
      try { remoteVideo.srcObject = null; } catch (e) {}
      hintEl.textContent = '';
    }

    var info = window.getDeskAgentInfo ? window.getDeskAgentInfo() : {};
    if (info.formatted || info.code) codeEl.textContent = info.formatted || info.code;
    setStatus(info.online ? 'En l\u00ednea (listo para conexiones)' : 'Conectando\u2026', !!info.online);

    var ui = {
      onEvent: function (ev, data) {
        if (ev === 'welcome') {
          codeEl.textContent = data.formatted || data.code || codeEl.textContent;
          return;
        }
        if (ev === 'status') {
          setStatus(data.text || '', !!data.online);
          return;
        }
        if (ev === 'status_msg') {
          setMsg(data.text || '', !!data.ok);
          return;
        }
        if (ev === 'rtc_state') {
          if (data.state === 'reconnecting') setMsg('Reconectando con el otro escritorio\u2026', true);
          else if (data.state === 'connected' && agent.sessionId) setMsg(agent.role === 'host' ? 'Control remoto activo' : 'Conectado \u2014 control remoto listo', true);
          return;
        }
        if (ev === 'error') {
          setMsg(data.detail || 'Error', false);
          return;
        }
        if (ev === 'connecting' || ev === 'guest_connected') {
          var name = (data && data.to && data.to.name) || 'escritorio remoto';
          showSession('Controlando: ' + name, 'guest');
          setMsg('Conectando\u2026', true);
          hintEl.textContent = 'Espera la imagen. Luego usa el rat\u00f3n y el teclado sobre el escritorio remoto.';
          return;
        }
        if (ev === 'host_start' || ev === 'hosting') {
          showSession('Alguien est\u00e1 controlando tu escritorio', 'host');
          hintEl.textContent = 'Transmisi\u00f3n activa. Pueden mover el rat\u00f3n y escribir en tu Snake OS.';
          setMsg('Control remoto activo', true);
          return;
        }
        if (ev === 'remote_track') {
          remoteVideo.srcObject = data.stream;
          try { remoteVideo.play(); } catch (e) {}
          bindGuestControl(remoteVideo);
          setMsg('Conectado \u2014 control remoto listo', true);
          hintEl.textContent = 'Haz clic en el escritorio remoto para controlarlo (clics, arrastre, rueda y teclado).';
          return;
        }
        if (ev === 'control_ready' && agent.role === 'guest' && remoteVideo.srcObject) {
          bindGuestControl(remoteVideo);
          return;
        }
        if (ev === 'session_ended') {
          hideSession();
          if (data && data.reason) setMsg(data.reason, false);
        }
      }
    };
    agent.ui = ui;

    container.querySelector('#ddeskCopy').addEventListener('click', function () {
      var text = (window.getDeskAgentInfo() || {}).formatted || codeEl.textContent;
      if (!text || text.indexOf('\u00b7') >= 0) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { setMsg('C\u00f3digo copiado', true); })
          .catch(function () { setMsg('No se pudo copiar', false); });
      }
    });

    container.querySelector('#ddeskConnect').addEventListener('click', function () {
      var raw = (targetInp.value || '').trim();
      setMsg('');
      if (!raw) { setMsg('Introduce un c\u00f3digo de escritorio', false); return; }
      deskConnectTo(raw).then(function () {
        setMsg('Conectando\u2026', true);
      }).catch(function (err) {
        setMsg((err && err.message) || 'Ese c\u00f3digo de escritorio no existe', false);
      });
    });

    targetInp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        container.querySelector('#ddeskConnect').click();
      }
    });

    container.querySelector('#ddeskHangup').addEventListener('click', function () {
      deskHangup();
      hideSession();
      setMsg('Sesi\u00f3n finalizada', false);
    });

    if (!agent.ws || agent.ws.readyState > 1) startDeskAgent();

    return function cleanup() {
      if (agent.ui === ui) agent.ui = null;
      unbindGuestControl();
    };
  }

  window.renderDoganieroDeskApp = renderDoganieroDeskApp;
})();
