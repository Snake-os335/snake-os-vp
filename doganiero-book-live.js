/* DoganieroBook · Retransmisiones en directo (máx. 40 min)
 * WebRTC uno-a-muchos (el emisor crea un peer por espectador) con señalización
 * por WebSocket (/api/book/live/ws). Si WebRTC no conecta, el servidor hace de
 * relé (fotogramas JPEG + audio PCM). El servidor corta a los 40:00 para todos.
 */
(function () {
  'use strict';
  if (window.__dbookLiveLoaded) return;
  window.__dbookLiveLoaded = true;

  var MAX_SEC = 40 * 60;
  // Misma configuración ICE que las videollamadas de Doganiero Chat
  var ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
  var RELAY_AFTER_MS = 12000;

  // ---------- utilidades ----------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  // Logo de Direct™ (si no carga, vuelve el 🔴 de siempre)
  var DTM_LOGO = '/static/assets/direct-tm-logo.png?v=1';
  function dtmImg() {
    var im = document.createElement('img');
    im.src = DTM_LOGO; im.alt = ''; im.className = 'dbl-dtm';
    im.onerror = function () { try { im.replaceWith(document.createTextNode('🔴')); } catch (e) {} };
    return im;
  }
  function dtmLabel(node, text) {
    node.textContent = '';
    node.appendChild(dtmImg());
    node.appendChild(document.createTextNode(' ' + text));
    return node;
  }
  function btn(cls, text, onClick) {
    var b = el('button', cls, text);
    b.type = 'button';
    if (onClick) b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); onClick(ev); });
    return b;
  }
  function fmt(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function b64FromBytes(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(out);
  }
  function bytesFromB64(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 255;
    return bytes;
  }
  function icePlain(c) {
    if (!c) return null;
    if (typeof c.toJSON === 'function') return c.toJSON();
    return { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex };
  }
  function sdpPlain(d) { return d ? { type: d.type, sdp: d.sdp } : null; }
  function safePlay(v) {
    try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }
  function canScreen() { return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia); }
  function stopStream(s) { try { if (s) s.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); } catch (e) {} }
  function mediaErrText(e) {
    var n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'Permiso denegado. Permite cámara y micrófono en el navegador.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No se encontró cámara o micrófono.';
    if (n === 'NotReadableError') return 'La cámara está siendo usada por otra app.';
    if (!window.isSecureContext) return 'El Direct™ necesita abrir Snake OS con https.';
    return (e && e.message) || 'No se pudo abrir la cámara.';
  }

  // ---------- estilos ----------
  function injectCss() {
    if (document.getElementById('dbl-style')) return;
    var st = document.createElement('style');
    st.id = 'dbl-style';
    st.textContent = [
      '.dbl-strip{background:rgba(0,0,0,.3);border:1px solid rgba(255,80,80,.35);border-radius:16px;padding:10px;display:flex;flex-direction:column;gap:8px;flex-shrink:0;}',
      '.dbl-strip-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}',
      '.dbl-strip-title{font-weight:800;font-size:.95rem;}',
      '.dbl-go{background:#e5303a !important;border-color:#ff9a9f !important;color:#fff !important;}',
      '.dbl-list{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;}',
      '.dbl-item{flex:0 0 auto;min-width:180px;max-width:240px;display:flex;gap:8px;align-items:center;text-align:left;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:8px;color:inherit;cursor:pointer;font:inherit;}',
      '.dbl-item:hover{border-color:#ff9a9f;}',
      '.dbl-item-info{display:flex;flex-direction:column;gap:2px;min-width:0;}',
      '.dbl-item-info strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.85rem;}',
      '.dbl-badge{display:inline-flex;align-items:center;gap:4px;background:#e5303a;color:#fff;font-weight:900;font-size:.68rem;letter-spacing:.04em;padding:3px 7px;border-radius:6px;}',
      '.dbl-badge::before{content:"";width:7px;height:7px;border-radius:50%;background:#fff;animation:dblPulse 1.2s infinite;}',
      '@keyframes dblPulse{0%,100%{opacity:1}50%{opacity:.25}}',
      '.dbl-viewers{font-size:.72rem;font-weight:800;color:#ffd0d2;}',
      '.dbl-muted{color:rgba(232,245,236,.65);font-size:.74rem;}',
      '.dbl-ov{position:absolute;inset:0;z-index:60;background:#050a07;display:flex;flex-direction:column;color:#fff;font-family:ui-rounded,"Segoe UI",system-ui,sans-serif;}',
      '.dbl-ov[hidden]{display:none !important;}',
      '.dbl-stage{position:relative;flex:1;min-height:0;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden;}',
      '.dbl-stage video,.dbl-stage img.dbl-frame{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;}',
      '.dbl-stage video.mirror{transform:scaleX(-1);}',
      '.dbl-hud{position:absolute;left:10px;right:10px;top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;pointer-events:none;}',
      '.dbl-pill{background:rgba(0,0,0,.6);border-radius:999px;padding:4px 10px;font-weight:800;font-size:.8rem;}',
      '.dbl-pill.warn{background:#b8860b;}',
      '.dbl-pill.danger{background:#e5303a;}',
      '.dbl-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:20px;background:rgba(0,0,0,.55);}',
      '.dbl-center[hidden]{display:none !important;}',
      '.dbl-bar{display:flex;flex-wrap:wrap;gap:8px;padding:10px;justify-content:center;background:#0b1a12;border-top:1px solid rgba(255,255,255,.1);}',
      '.dbl-bar button,.dbl-center button,.dbl-setup button{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;border-radius:999px;padding:9px 14px;font-weight:800;font-size:.85rem;cursor:pointer;min-height:40px;}',
      '.dbl-bar button.end,.dbl-setup button.go,.dbl-center button.go{background:#e5303a;border-color:#ff9a9f;}',
      '.dbl-bar button.on{background:#1f9e57;border-color:#9dffc2;color:#04150c;}',
      '.dbl-info{padding:8px 12px;background:#0b1a12;display:flex;flex-direction:column;gap:2px;}',
      '.dbl-info strong{font-size:.95rem;}',
      '.dbl-setup{padding:12px;display:flex;flex-direction:column;gap:8px;background:#0b1a12;}',
      '.dbl-setup input,.dbl-setup select{width:100%;box-sizing:border-box;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.35);color:#fff;padding:10px 12px;font:inherit;}',
      '.dbl-setup-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;}',
      '.dbl-err{color:#ff8f8f;font-size:.8rem;min-height:1em;}',
      '.dbl-av{width:34px;height:34px;border-radius:50%;background:rgba(229,48,58,.25);display:inline-flex;align-items:center;justify-content:center;font-size:1.05rem;overflow:hidden;flex-shrink:0;border:2px solid #e5303a;}',
      '.dbl-av img{width:100%;height:100%;object-fit:cover;}',
      '.dbl-main{flex:1;min-height:0;display:flex;flex-direction:column;}',
      '.dbl-main.wide{flex-direction:row;}',
      '.dbl-main > .dbl-stage{flex:1;min-height:0;min-width:0;}',
      '.dbl-chat{display:flex;flex-direction:column;background:#0b1a12;border-top:1px solid rgba(255,255,255,.1);height:clamp(140px,36%,240px);flex-shrink:0;min-height:0;}',
      '.dbl-main.wide .dbl-chat{height:auto;width:300px;max-width:42%;border-top:0;border-left:1px solid rgba(255,255,255,.1);}',
      '.dbl-chat-head{padding:6px 10px;font-weight:800;font-size:.8rem;color:#ffd0d2;border-bottom:1px solid rgba(255,255,255,.08);}',
      '.dbl-chat-list{flex:1;min-height:0;overflow-y:auto;padding:6px 8px;display:flex;flex-direction:column;gap:6px;overscroll-behavior:contain;}',
      '.dbl-chat-empty{color:rgba(232,245,236,.55);font-size:.78rem;text-align:center;padding:10px 4px;}',
      '.dbl-chat-msg{display:flex;gap:7px;align-items:flex-start;padding:4px 6px;border-radius:10px;}',
      '.dbl-chat-msg.host{background:rgba(229,48,58,.18);border:1px solid rgba(255,120,125,.45);}',
      '.dbl-cav{width:26px;height:26px;border-radius:50%;flex-shrink:0;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;font-size:.95rem;background:rgba(255,255,255,.1);}',
      '.dbl-cav img{width:100%;height:100%;object-fit:cover;border-radius:50%;}',
      '.dbl-chat-body{min-width:0;flex:1;}',
      '.dbl-chat-who{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:.74rem;}',
      '.dbl-chat-who strong{color:#9dffc2;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dbl-chat-msg.host .dbl-chat-who strong{color:#ffd0d2;}',
      '.dbl-chat-crown{background:#e5303a;color:#fff;font-weight:900;font-size:.6rem;padding:1px 5px;border-radius:5px;}',
      '.dbl-chat-text{font-size:.85rem;line-height:1.3;overflow-wrap:anywhere;word-break:break-word;}',
      '.dbl-chat-sys{font-size:.74rem;color:rgba(232,245,236,.6);text-align:center;}',
      '.dbl-chat-err{color:#ff8f8f;font-size:.74rem;padding:0 10px;}',
      '.dbl-chat-form{display:flex;gap:6px;padding:6px 8px 8px;margin:0;}',
      '.dbl-chat-form input{flex:1 1 auto;width:auto;margin:0;min-width:0;caret-color:#fff;-webkit-text-fill-color:#fff;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.35);color:#fff;padding:8px 12px;font:inherit;font-size:16px;}',
      '.dbl-chat-form input::placeholder{color:rgba(255,255,255,.6);-webkit-text-fill-color:rgba(255,255,255,.6);opacity:1;}',
      '.dbl-chat-form button{width:auto !important;margin:0 !important;flex:0 0 auto;border:1px solid #ff9a9f;background:#e5303a;color:#fff;border-radius:999px;padding:8px 14px;font-weight:800;cursor:pointer;}',
      '.dbl-chat-form button:disabled,.dbl-chat-form input:disabled{opacity:.5;cursor:default;}',
      '.dbl-bar button.dbl-like.liked{background:rgba(229,48,58,.3);border-color:#ff9a9f;}',
      '.dbl-dtm{width:1.45em;height:1.45em;object-fit:contain;vertical-align:-0.4em;display:inline-block;}',
      '.dbl-badge .dbl-dtm{width:1.25em;height:1.25em;vertical-align:middle;}',
      '.dbl-wm{position:absolute;right:10px;bottom:10px;width:40px;height:40px;object-fit:contain;opacity:.75;pointer-events:none;z-index:2;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6));}',
      '.dbl-toast{position:absolute;left:50%;bottom:76px;transform:translateX(-50%);background:rgba(0,0,0,.8);padding:8px 14px;border-radius:999px;font-weight:700;font-size:.82rem;z-index:3;pointer-events:none;}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ---------- estado global ----------
  var L = {
    ws: null, wsOpen: false, wantWs: false, retry: 0, retryTimer: null, pingTimer: null, lastPong: 0,
    connId: null, me: null, lives: [], myLiveIdServer: null, skew: 0,
    container: null, strip: null, observer: null, ov: null,
    bc: null,     // emisión propia
    watch: null,  // directo que estoy viendo
    setup: null   // pantalla previa
  };

  // ---------- señalización ----------
  function wsUrl() {
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/book/live/ws';
  }
  function send(obj) {
    if (L.ws && L.ws.readyState === 1) {
      try { L.ws.send(JSON.stringify(obj)); return true; } catch (e) {}
    }
    return false;
  }
  function connect() {
    L.wantWs = true;
    if (L.ws && (L.ws.readyState === 0 || L.ws.readyState === 1)) return;
    clearTimeout(L.retryTimer);
    var ws;
    try { ws = new WebSocket(wsUrl()); } catch (e) { scheduleReconnect(); return; }
    L.ws = ws;
    ws.onopen = function () {
      if (L.ws !== ws) return;
      L.wsOpen = true;
      L.retry = 0;
      L.lastPong = Date.now();
      clearInterval(L.pingTimer);
      L.pingTimer = setInterval(function () {
        if (L.ws !== ws) return;
        if (Date.now() - L.lastPong > 45000) { try { ws.close(); } catch (e) {} return; }
        send({ type: 'ping', t: Date.now() });
      }, 15000);
    };
    ws.onmessage = function (ev) {
      if (L.ws !== ws) return;
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg && msg.type) onMsg(msg);
    };
    ws.onclose = function (ev) {
      if (L.ws !== ws) return;
      L.ws = null;
      L.wsOpen = false;
      clearInterval(L.pingTimer);
      if (ev && ev.code === 4401) { L.wantWs = false; return; }
      if (L.wantWs) scheduleReconnect();
      paintStrip();
    };
    ws.onerror = function () {};
  }
  function scheduleReconnect() {
    clearTimeout(L.retryTimer);
    var delay = Math.min(10000, 800 * Math.pow(2, L.retry++));
    L.retryTimer = setTimeout(function () { if (L.wantWs) connect(); }, delay);
  }
  function disconnectIfIdle() {
    if (L.container || L.bc || L.watch) return;
    L.wantWs = false;
    clearTimeout(L.retryTimer);
    clearInterval(L.pingTimer);
    if (L.ws) { var w = L.ws; L.ws = null; try { w.close(); } catch (e) {} }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && L.wantWs && (!L.ws || L.ws.readyState > 1)) { L.retry = 0; connect(); }
  });
  window.addEventListener('online', function () { if (L.wantWs) { L.retry = 0; connect(); } });

  function onMsg(m) {
    var t = m.type;
    if (m.serverNow) L.skew = Date.now() / 1000 - Number(m.serverNow);
    if (t === 'pong') { L.lastPong = Date.now(); return; }
    L.lastPong = Date.now();
    if (t === 'hello') {
      L.connId = m.connId;
      L.me = m.you;
      if (typeof m.hasChannel === 'boolean') L.hasChannel = m.hasChannel;
      L.lives = m.lives || [];
      L.myLiveIdServer = m.myLiveId || null;
      // Reanudar tras reconexión
      if (L.bc && L.bc.liveId) send({ type: 'live_resume', liveId: L.bc.liveId });
      if (L.watch && L.watch.liveId && !L.watch.ended) send({ type: 'live_join', liveId: L.watch.liveId });
      paintStrip();
      return;
    }
    if (t === 'lives') {
      L.lives = m.lives || [];
      var mine = null;
      L.lives.forEach(function (lv) { if (L.me && Number(lv.userId) === Number(L.me.id)) mine = lv.id; });
      L.myLiveIdServer = mine;
      likeSyncFromLives();
      paintStrip();
      updateWatchInfo();
      updateBcViewers();
      return;
    }
    if (t === 'live_error' && m.code === 'no_channel') {
      L.hasChannel = false;
      if (L.bc && !L.bc.liveId) { stopStream(L.bc.stream); L.bc = null; }
      if (L.setup) { stopStream(L.setup.stream); L.setup = null; }
      closeOverlay();
      return;
    }
    if (t === 'live_error') { setupError(m.detail || 'No se pudo iniciar el Direct™'); toast(m.detail || 'Error'); return; }
    if (t === 'live_started') { onLiveStarted(m); return; }
    if (t === 'viewer_join') { if (L.bc && m.liveId === L.bc.liveId) { createHostPeer(m.viewerId); L.bc.viewers = m.viewers; updateBcViewers(); } return; }
    if (t === 'viewer_leave') { if (L.bc && m.liveId === L.bc.liveId) { closeHostPeer(m.viewerId); L.bc.viewers = m.viewers; updateBcViewers(); } return; }
    if (t === 'relay_count') { if (L.bc && m.liveId === L.bc.liveId) setRelay(Number(m.count) || 0); return; }
    if (t === 'book_post_deleted') {
      try { window.dispatchEvent(new CustomEvent('dbook:post-deleted', { detail: { postId: m.postId } })); } catch (e) {}
      return;
    }
    if (t === 'live_chat') { chatOnMessage(m); return; }
    if (t === 'live_likes') { likeOnMsg(m); return; }
    if (t === 'book_post_likes') {
      try { window.dispatchEvent(new CustomEvent('dbook:post-likes', { detail: { postId: m.postId, likeCount: m.likeCount } })); } catch (e) {}
      return;
    }
    if (t === 'live_chat_error') { if (m.liveId === chatLiveId()) chatError(m.detail || 'No se pudo enviar'); return; }
    if (t === 'live_signal') {
      if (L.bc && m.liveId === L.bc.liveId && m.from !== 'host') hostOnSignal(m.from, m.signal);
      else if (L.watch && m.liveId === L.watch.liveId && m.from === 'host') viewerOnSignal(m.signal);
      return;
    }
    if (t === 'live_joined') {
      if (L.watch && m.live && m.live.id === L.watch.liveId) {
        L.watch.viewerId = m.viewerId;
        L.watch.live = m.live;
        L.watch.startLocal = Date.now() - (Number(m.live.elapsedSec) || 0) * 1000;
        updateWatchInfo();
        armRelayTimer();
        chatSetHistory(m.live.id, m.chat || []);
        likeSet(m.live.id, m.live.likes, m.liked);
      }
      return;
    }
    if (t === 'live_frame') { if (L.watch && m.liveId === L.watch.liveId) showRelayFrame(m.jpeg); return; }
    if (t === 'live_pcm') { if (L.watch && m.liveId === L.watch.liveId) playPcm(m.pcm, m.rate); return; }
    if (t === 'live_ended') {
      if (L.bc && m.liveId === L.bc.liveId) onHostEnded(m);
      if (L.watch && m.liveId === L.watch.liveId) onWatchEnded(m);
      L.lives = L.lives.filter(function (lv) { return lv.id !== m.liveId; });
      if (L.myLiveIdServer === m.liveId) L.myLiveIdServer = null;
      paintStrip();
      return;
    }
  }

  // ---------- integración con DoganieroBook ----------
  function hostEl() { return L.container; }
  function ensureContainerPositioned(c) {
    try { if (getComputedStyle(c).position === 'static') c.style.position = 'relative'; } catch (e) {}
  }
  function ensureStrip() {
    if (!L.container || !L.strip) return;
    var body = L.container.querySelector('.dbook-body');
    if (body && L.strip.parentNode !== body) body.insertBefore(L.strip, body.firstChild);
    else if (body && body.firstChild !== L.strip) body.insertBefore(L.strip, body.firstChild);
  }
  function attach(container) {
    injectCss();
    clearTimeout(L.detachTimer);
    L.detachTimer = null;
    if (L.observer) { try { L.observer.disconnect(); } catch (e) {} L.observer = null; }
    L.container = container;
    ensureContainerPositioned(container);
    L.strip = el('section', 'dbl-strip');
    paintStrip();
    var scheduled = false;
    L.observer = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      Promise.resolve().then(function () { scheduled = false; ensureStrip(); });
    });
    L.observer.observe(container, { childList: true, subtree: true });
    ensureStrip();
    connect();
    // Si había una emisión/visionado activo (ventana reabierta), volver a mostrarlo
    if (L.ov) {
      container.appendChild(L.ov);
      var vids = L.ov.querySelectorAll('video');
      for (var vi = 0; vi < vids.length; vi++) { try { var pp = vids[vi].play(); if (pp && pp.catch) pp.catch(function () {}); } catch (e) {} }
    }
    return function detach() {
      if (L.container !== container) return;
      try { L.observer && L.observer.disconnect(); } catch (e) {}
      L.observer = null;
      L.container = null;
      L.strip = null;
      if (L.ov && L.ov.parentNode) L.ov.parentNode.removeChild(L.ov);
      // Si la app se vuelve a pintar enseguida (cambio móvil/ordenador) se conserva todo.
      // Si de verdad se cierra DoganieroBook: termina tu directo y deja de ver el que veías.
      clearTimeout(L.detachTimer);
      L.detachTimer = setTimeout(function () {
        L.detachTimer = null;
        if (L.container) return;
        if (L.bc) { if (L.bc.liveId) send({ type: 'live_end', liveId: L.bc.liveId, reason: 'host' }); teardownBroadcast(); }
        if (L.watch) leaveWatch();
        if (L.setup) { stopStream(L.setup.stream); L.setup = null; }
        L.ov = null;
        disconnectIfIdle();
      }, 2000);
    };
  }

  function avatarNode(lv) {
    var a = el('span', 'dbl-av');
    if (lv.photoUrl) {
      var im = document.createElement('img');
      im.src = lv.photoUrl; im.alt = '';
      a.appendChild(im);
    } else {
      if (window.snakeEmoji && window.snakeEmoji.fill) window.snakeEmoji.fill(a, lv.avatar || '👤'); else a.textContent = lv.avatar || '👤';
    }
    return a;
  }
  function elapsedOf(lv) {
    var start = Number(lv.startedAt) + L.skew;
    return Math.min(MAX_SEC, Math.max(0, Date.now() / 1000 - start));
  }

  function paintStrip() {
    var s = L.strip;
    if (!s) return;
    s.innerHTML = '';
    var head = el('div', 'dbl-strip-head');
    head.appendChild(dtmLabel(el('div', 'dbl-strip-title'), 'Direct™'));
    if (L.bc && L.bc.liveId) {
      head.appendChild(dtmLabel(btn('dbook-btn dbl-go', '', function () { showOverlay(); }), 'Volver a mi Direct™'));
    } else if (L.bc || L.setup) {
      head.appendChild(btn('dbook-btn dbl-go', 'Preparando Direct™…', function () { showOverlay(); }));
    } else if (L.myLiveIdServer) {
      var wrapBtns = el('div', 'dbl-setup-row');
      wrapBtns.appendChild(dtmLabel(btn('dbook-btn dbl-go', '', function () { openSetup(L.myLiveIdServer); }), 'Retomar mi Direct™'));
      wrapBtns.appendChild(btn('dbook-btn ghost', '⏹ Terminar Direct™', function () {
        if (confirm('¿Terminar tu Direct™?')) send({ type: 'live_end', liveId: L.myLiveIdServer });
      }));
      head.appendChild(wrapBtns);
    } else if (L.hasChannel === false) {
      var needCh = el('div', 'dbl-setup-row');
      needCh.style.alignItems = 'center';
      needCh.appendChild(el('span', 'dbl-muted', 'Para hacer un Direct™ necesitas tener un canal'));
      needCh.appendChild(btn('dbook-btn', '➕ Crear mi canal', function () {
        try { window.dispatchEvent(new CustomEvent('dbook:open-tab', { detail: { tab: 'mine' } })); } catch (e) {}
      }));
      head.appendChild(needCh);
    } else {
      head.appendChild(dtmLabel(btn('dbook-btn dbl-go', '', function () { openSetup(null); }), 'Iniciar Direct™'));
    }
    s.appendChild(head);
    var lives = L.lives || [];
    if (!L.wsOpen && !lives.length) {
      s.appendChild(el('div', 'dbl-muted', L.wantWs ? 'Conectando con los Direct™…' : 'Direct™ no disponible'));
      return;
    }
    if (!lives.length) {
      s.appendChild(el('div', 'dbl-muted', 'Nadie está haciendo un Direct™ ahora. Cada Direct™ dura como máximo 40 minutos.'));
      return;
    }
    var list = el('div', 'dbl-list');
    lives.forEach(function (lv) {
      var mine = L.me && Number(lv.userId) === Number(L.me.id);
      var item = btn('dbl-item', null, function () {
        if (mine) { if (L.bc) showOverlay(); return; }
        startWatch(lv);
      });
      item.appendChild(avatarNode(lv));
      var info = el('div', 'dbl-item-info');
      var top = el('div');
      top.appendChild(dtmLabel(el('span', 'dbl-badge'), 'DIRECT™'));
      top.appendChild(document.createTextNode(' '));
      top.appendChild(el('span', 'dbl-viewers', '👁 ' + (lv.viewers || 0)));
      top.appendChild(document.createTextNode(' '));
      top.appendChild(el('span', 'dbl-viewers', '❤️ ' + (lv.likes || 0)));
      info.appendChild(top);
      info.appendChild(el('strong', null, lv.title || 'Direct™'));
      var who = (lv.channelTitle || lv.name || 'Perfil') + (lv.handle ? ' · @' + lv.handle : '') + (mine ? ' (tú)' : '');
      info.appendChild(el('span', 'dbl-muted', who));
      var tline = el('span', 'dbl-muted dbl-tline');
      tline.setAttribute('data-start', String(lv.startedAt));
      tline.textContent = fmt(elapsedOf(lv)) + ' · quedan ' + fmt(MAX_SEC - elapsedOf(lv)) + (lv.hostOnline === false ? ' · reconectando…' : '');
      info.appendChild(tline);
      item.appendChild(info);
      list.appendChild(item);
    });
    s.appendChild(list);
  }
  setInterval(function () {
    if (!L.strip) return;
    var nodes = L.strip.querySelectorAll('.dbl-tline');
    for (var i = 0; i < nodes.length; i++) {
      var st = Number(nodes[i].getAttribute('data-start')) || 0;
      var e = elapsedOf({ startedAt: st });
      var extra = nodes[i].textContent.indexOf('reconectando') >= 0 ? ' · reconectando…' : '';
      nodes[i].textContent = fmt(e) + ' · quedan ' + fmt(MAX_SEC - e) + extra;
    }
  }, 1000);

  // ---------- overlay ----------
  function makeOverlay() {
    if (L.ov && L.ov.parentNode) L.ov.parentNode.removeChild(L.ov);
    var ov = el('div', 'dbl-ov');
    L.ov = ov;
    if (hostEl()) hostEl().appendChild(ov);
    return ov;
  }
  function showOverlay() { if (L.ov) { L.ov.hidden = false; if (hostEl() && L.ov.parentNode !== hostEl()) hostEl().appendChild(L.ov); } }
  function hideOverlay() { if (L.ov) L.ov.hidden = true; paintStrip(); }
  function closeOverlay() { if (L.ov && L.ov.parentNode) L.ov.parentNode.removeChild(L.ov); L.ov = null; paintStrip(); }
  function toast(text) {
    if (!L.ov) return;
    var stage = L.ov.querySelector('.dbl-stage');
    if (!stage) return;
    var t = el('div', 'dbl-toast', text);
    stage.appendChild(t);
    setTimeout(function () { try { t.remove(); } catch (e) {} }, 3500);
  }

  // ---------- medios del emisor ----------
  function getCamera(facing) {
    var md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) return Promise.reject(new Error(window.isSecureContext ? 'Este navegador no permite cámara' : 'El Direct™ necesita abrir Snake OS con https.'));
    var v = { facingMode: facing || 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } };
    var a = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    return md.getUserMedia({ video: v, audio: a }).catch(function (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e;
      // Reintentos más sencillos (algunos móviles no aceptan las restricciones)
      return md.getUserMedia({ video: true, audio: true }).catch(function () {
        return md.getUserMedia({ video: true, audio: false });
      });
    });
  }

  // ---------- cámaras (delantera / trasera) ----------
  function isMobileDevice() {
    try {
      if (/Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent || '')) return true;
      if (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || '')) return true; // iPadOS
    } catch (e) {}
    return false;
  }
  function canFlipCamera() { return isMobileDevice() || (L.camCount || 0) > 1; }
  function refreshCamCount() {
    var md = navigator.mediaDevices;
    if (!md || !md.enumerateDevices) return Promise.resolve(0);
    return md.enumerateDevices().then(function (list) {
      L.camCount = list.filter(function (d) { return d.kind === 'videoinput'; }).length;
      return L.camCount;
    }, function () { return L.camCount || 0; });
  }
  function trackDeviceId(t) {
    try { return (t && t.getSettings && t.getSettings().deviceId) || ''; } catch (e) { return ''; }
  }
  function facingOf(t, wanted) {
    try {
      var f = t && t.getSettings ? t.getSettings().facingMode : '';
      if (f === 'user' || f === 'environment') return f;
    } catch (e) {}
    return wanted;
  }
  // Solo vídeo. Orden: facingMode exact → ideal → otra cámara por deviceId.
  function getCameraVideo(facing, avoidDeviceId) {
    var md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) return Promise.reject(new Error('Este navegador no permite cámara'));
    function cons(extra) {
      var v = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } };
      for (var k in extra) v[k] = extra[k];
      return { video: v, audio: false };
    }
    function denied(e) { return e && (e.name === 'NotAllowedError' || e.name === 'SecurityError'); }
    return md.getUserMedia(cons({ facingMode: { exact: facing } })).catch(function (e1) {
      if (denied(e1)) throw e1;
      return md.getUserMedia(cons({ facingMode: { ideal: facing } })).then(function (s) {
        var t = s.getVideoTracks()[0];
        if (avoidDeviceId && trackDeviceId(t) && trackDeviceId(t) === avoidDeviceId) { stopStream(s); throw new Error('misma cámara'); }
        return s;
      }).catch(function (e2) {
        if (denied(e2)) throw e2;
        if (!md.enumerateDevices) throw e2;
        return md.enumerateDevices().then(function (list) {
          var cams = list.filter(function (d) { return d.kind === 'videoinput' && d.deviceId; });
          L.camCount = cams.length || L.camCount;
          var idx = -1;
          for (var i = 0; i < cams.length; i++) if (cams[i].deviceId === avoidDeviceId) idx = i;
          var next = cams.length ? cams[(idx + 1) % cams.length] : null;
          if (!next || (avoidDeviceId && next.deviceId === avoidDeviceId)) throw e2;
          return md.getUserMedia(cons({ deviceId: { exact: next.deviceId } }));
        });
      });
    });
  }

  function openSetup(resumeLiveId) {
    if (L.bc || L.setup) { showOverlay(); return; }
    if (L.hasChannel === false) { paintStrip(); return; }
    if (L.watch) leaveWatch();
    var ov = makeOverlay();
    var stage = el('div', 'dbl-stage');
    var video = document.createElement('video');
    video.muted = true; video.autoplay = true; video.playsInline = true; video.setAttribute('playsinline', '');
    video.className = 'mirror';
    stage.appendChild(video);
    var center = el('div', 'dbl-center', null);
    center.appendChild(el('div', null, 'Abriendo cámara y micrófono…'));
    stage.appendChild(center);
    ov.appendChild(stage);

    var setup = el('div', 'dbl-setup');
    var title = document.createElement('input');
    title.maxLength = 100;
    title.placeholder = 'Título del Direct™';
    var srcSel = document.createElement('select');
    var o1 = document.createElement('option'); o1.value = 'camera'; o1.textContent = '📷 Cámara delantera'; srcSel.appendChild(o1);
    var o1b = document.createElement('option'); o1b.value = 'camera-back'; o1b.textContent = '📷 Cámara trasera'; srcSel.appendChild(o1b);
    if (canScreen()) { var o2 = document.createElement('option'); o2.value = 'screen'; o2.textContent = '🖥️ Pantalla + micrófono'; srcSel.appendChild(o2); }
    var err = el('div', 'dbl-err');
    if (!resumeLiveId) setup.appendChild(title);
    setup.appendChild(srcSel);
    setup.appendChild(el('div', 'dbl-muted', resumeLiveId ? 'Retomas tu Direct™: el tiempo sigue contando desde que empezó (máx. 40:00).' : 'Duración máxima: 40 minutos. Al llegar a 40:00 el Direct™ se corta solo para todos.'));
    setup.appendChild(err);
    var row = el('div', 'dbl-setup-row');
    var cancel = btn('', 'Cancelar', function () { cancelSetup(); });
    var flipS = btn('', '🔄 Cambiar cámara', function () {
      if (!L.setup) return;
      setupCamera(L.setup.facing === 'environment' ? 'user' : 'environment');
    });
    flipS.hidden = true;
    row.appendChild(flipS);
    var go = btn('go', resumeLiveId ? '🔴 Retomar mi Direct™' : '🔴 Empezar Direct™', function () {
      if (!L.setup || !L.setup.stream) { err.textContent = 'Primero hace falta la cámara.'; return; }
      go.disabled = true;
      go.textContent = 'Conectando…';
      L.setup.goBtn = go;
      beginBroadcast(title.value, resumeLiveId);
    });
    dtmLabel(go, resumeLiveId ? 'Retomar mi Direct™' : 'Empezar Direct™');
    go.disabled = true;
    row.appendChild(cancel);
    row.appendChild(go);
    setup.appendChild(row);
    ov.appendChild(setup);

    L.setup = { stream: null, video: video, source: 'camera', facing: 'user', err: err, goBtn: go, center: center };
    paintStrip();

    function useStream(stream, source) {
      if (!L.setup) { stopStream(stream); return; }
      if (L.setup.stream && L.setup.stream !== stream) {
        // conservar el micro al cambiar de fuente
        L.setup.stream.getVideoTracks().forEach(function (t) { t.stop(); });
        if (!stream.getAudioTracks().length) L.setup.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
        else L.setup.stream.getAudioTracks().forEach(function (t) { t.stop(); });
      }
      L.setup.stream = stream;
      L.setup.source = source;
      video.className = source === 'camera' && L.setup.facing === 'user' ? 'mirror' : '';
      video.srcObject = stream;
      safePlay(video);
      center.hidden = true;
      err.textContent = stream.getAudioTracks().length ? '' : 'Sin micrófono: el Direct™ irá sin sonido.';
      go.disabled = false;
      srcSel.value = source === 'screen' ? 'screen' : (L.setup.facing === 'environment' ? 'camera-back' : 'camera');
      syncSetupFlip();
    }
    function syncSetupFlip() {
      flipS.hidden = !(L.setup && L.setup.source === 'camera' && canFlipCamera());
    }
    function setupCamera(facing) {
      if (!L.setup) return;
      go.disabled = true;
      var old = L.setup.stream;
      var curId = old && L.setup.source === 'camera' ? trackDeviceId(old.getVideoTracks()[0]) : '';
      var audio = old ? old.getAudioTracks() : [];
      // Aún no se emite: soltar la cámara actual primero (muchos móviles no abren dos a la vez)
      if (old) old.getVideoTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      var prevFacing = L.setup.facing;
      var p = old ? getCameraVideo(facing, curId) : getCamera(facing);
      p.then(function (vs) {
        if (!L.setup) { stopStream(vs); return; }
        L.setup.facing = facingOf(vs.getVideoTracks()[0], facing);
        var ms = old ? new MediaStream(vs.getVideoTracks().concat(audio)) : vs;
        L.setup.stream = null;
        useStream(ms, 'camera');
      }, function (e) {
        if (!L.setup) return;
        err.textContent = (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) ? mediaErrText(e) : 'No se pudo abrir esa cámara.';
        getCameraVideo(prevFacing, '').then(function (vs) {
          if (!L.setup) { stopStream(vs); return; }
          L.setup.facing = facingOf(vs.getVideoTracks()[0], prevFacing);
          L.setup.stream = null;
          useStream(new MediaStream(vs.getVideoTracks().concat(audio)), 'camera');
          err.textContent = 'Este dispositivo no tiene otra cámara.';
        }, function () { go.disabled = true; });
      });
    }
    refreshCamCount().then(function () { syncSetupFlip(); });
    getCamera('user').then(function (s) { useStream(s, 'camera'); refreshCamCount().then(syncSetupFlip); }, function (e) {
      center.hidden = false;
      center.innerHTML = '';
      center.appendChild(el('div', null, mediaErrText(e)));
      err.textContent = mediaErrText(e);
    });
    srcSel.addEventListener('change', function () {
      if (!L.setup) return;
      go.disabled = true;
      if (srcSel.value === 'screen') {
        navigator.mediaDevices.getDisplayMedia(displayMediaOpts()).then(function (scr) {
          var mic = L.setup && L.setup.stream ? L.setup.stream.getAudioTracks() : [];
          var ms = new MediaStream(scr.getVideoTracks().concat(mic));
          if (L.setup && L.setup.stream) L.setup.stream.getVideoTracks().forEach(function (t) { t.stop(); });
          L.setup.stream = null;
          useStream(ms, 'screen');
        }, function (e) {
          srcSel.value = L.setup && L.setup.facing === 'environment' ? 'camera-back' : 'camera';
          go.disabled = !L.setup || !L.setup.stream;
          err.textContent = 'No se pudo compartir la pantalla.';
        });
      } else {
        setupCamera(srcSel.value === 'camera-back' ? 'environment' : 'user');
      }
    });
  }
  function setupError(text) {
    if (L.setup && L.setup.err) {
      L.setup.err.textContent = text;
      if (L.setup.goBtn) { L.setup.goBtn.disabled = false; dtmLabel(L.setup.goBtn, 'Empezar Direct™'); }
    }
    if (L.bc && !L.bc.liveId) { // la solicitud falló: volver a la pantalla previa
      L.setup = L.setup || {};
      L.setup.stream = L.bc.stream;
      L.bc = null;
    }
  }
  function cancelSetup() {
    if (L.setup) stopStream(L.setup.stream);
    L.setup = null;
    if (!L.bc) closeOverlay();
  }

  // ---------- emisión ----------
  function beginBroadcast(title, resumeLiveId) {
    var su = L.setup;
    L.bc = {
      liveId: null, stream: su.stream, source: su.source, facing: su.facing, peers: {}, viewers: 0,
      title: (title || '').trim(), startLocal: Date.now(), relayCount: 0, frameTimer: null, pcm: null,
      micOn: true, timer: null, warned: {}, snapshot: null, snapTimer: null, pendingResume: resumeLiveId
    };
    connect();
    var msg = resumeLiveId ? { type: 'live_resume', liveId: resumeLiveId } : { type: 'live_start', title: L.bc.title, source: L.bc.source };
    if (!send(msg)) {
      // Se enviará al reconectar (hello) solo si hay liveId; para inicio, reintentar
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (!L.bc || L.bc.liveId) { clearInterval(iv); return; }
        if (send(msg)) { clearInterval(iv); return; }
        if (tries > 20) { clearInterval(iv); setupError('Sin conexión con el servidor. Inténtalo de nuevo.'); }
      }, 500);
    }
  }

  function onLiveStarted(m) {
    if (!L.bc) {
      // live_started sin emisión local (otra pestaña): ignorar
      return;
    }
    var live = m.live;
    var firstTime = !L.bc.liveId;
    L.bc.liveId = live.id;
    L.bc.live = live;
    L.bc.title = live.title;
    L.bc.startLocal = Date.now() - (Number(live.elapsedSec) || 0) * 1000;
    L.bc.viewers = live.viewers || 0;
    var ids = m.viewerIds || [];
    // Peers: crear para espectadores nuevos, cerrar los que ya no están
    Object.keys(L.bc.peers).forEach(function (vid) { if (ids.indexOf(vid) < 0) closeHostPeer(vid); });
    ids.forEach(function (vid) { if (!L.bc.peers[vid]) createHostPeer(vid); });
    if (firstTime) {
      if (L.setup) L.setup.stream = null;
      L.setup = null;
      buildBroadcastUi();
      recStart(L.bc);
      if (live.source !== L.bc.source) send({ type: 'live_source', liveId: live.id, source: L.bc.source });
    }
    chatSetHistory(live.id, m.chat || []);
    likeSet(live.id, live.likes, m.liked);
    updateBcViewers();
    paintStrip();
  }

  function buildBroadcastUi() {
    var bc = L.bc;
    var ov = makeOverlay();
    var stage = el('div', 'dbl-stage');
    var video = document.createElement('video');
    video.muted = true; video.autoplay = true; video.playsInline = true; video.setAttribute('playsinline', '');
    video.srcObject = bc.stream;
    video.className = bc.source === 'camera' && bc.facing === 'user' ? 'mirror' : '';
    stage.appendChild(video);
    safePlay(video);
    var hud = el('div', 'dbl-hud');
    hud.appendChild(dtmLabel(el('span', 'dbl-badge'), 'DIRECT™'));
    var timeP = el('span', 'dbl-pill', '00:00 / 40:00');
    var remP = el('span', 'dbl-pill', 'Quedan 40:00');
    var viewP = el('span', 'dbl-pill', '👁 0');
    hud.appendChild(timeP); hud.appendChild(remP); hud.appendChild(viewP);
    stage.appendChild(hud);
    stage.appendChild(dtmWatermark());
    var center = el('div', 'dbl-center');
    center.hidden = true;
    stage.appendChild(center);
    ov.appendChild(stage);
    chatMount(ov, stage);

    var info = el('div', 'dbl-info');
    info.appendChild(el('strong', null, bc.title || 'Mi Direct™'));
    info.appendChild(el('span', 'dbl-muted', 'Estás emitiendo para todos los perfiles de DoganieroBook.'));
    ov.appendChild(info);

    var bar = el('div', 'dbl-bar');
    var micB = btn('on', '🎤 Micro activado', function () {
      bc.micOn = !bc.micOn;
      bc.stream.getAudioTracks().forEach(function (t) { t.enabled = bc.micOn; });
      micB.textContent = bc.micOn ? '🎤 Micro activado' : '🔇 Micro silenciado';
      micB.className = bc.micOn ? 'on' : '';
    });
    if (!bc.stream.getAudioTracks().length) { micB.textContent = '🔇 Sin micrófono'; micB.disabled = true; micB.className = ''; }
    bar.appendChild(micB);
    var flipB = btn('', '🔄 Cambiar cámara', function () { flipCamera(); });
    bar.appendChild(flipB);
    var scrB = null;
    if (canScreen()) {
      scrB = btn('', bc.source === 'screen' ? '📷 Usar cámara' : '🖥️ Compartir pantalla', function () {
        switchSource(bc.source === 'screen' ? 'camera' : 'screen');
      });
      bar.appendChild(scrB);
    }
    bar.appendChild(likeButton());
    bar.appendChild(btn('', '⤵ Ocultar', function () { hideOverlay(); }));
    bar.appendChild(btn('end', '⏹ Terminar Direct™', function () {
      if (confirm('¿Terminar el Direct™ para todos?')) endBroadcast('host');
    }));
    ov.appendChild(bar);

    bc.ui = { video: video, timeP: timeP, remP: remP, viewP: viewP, center: center, info: info, bar: bar, flipB: flipB, scrB: scrB, stage: stage };
    syncSourceButtons();
    refreshCamCount().then(function () { syncSourceButtons(); });
    clearInterval(bc.timer);
    bc.timer = setInterval(bcTick, 250);
    bcTick();
    // Foto de portada para el resumen (a los 5 s y cada minuto)
    setTimeout(takeSnapshot, 5000);
    bc.snapTimer = setInterval(takeSnapshot, 60000);
  }
  function syncSourceButtons() {
    var bc = L.bc;
    if (!bc || !bc.ui) return;
    bc.ui.flipB.hidden = bc.source !== 'camera' || !canFlipCamera();
    if (bc.ui.scrB) bc.ui.scrB.textContent = bc.source === 'screen' ? '📷 Usar cámara' : '🖥️ Compartir pantalla';
    bc.ui.video.className = bc.source === 'camera' && bc.facing === 'user' ? 'mirror' : '';
  }
  function bcTick() {
    var bc = L.bc;
    if (!bc || !bc.ui || !bc.liveId) return;
    var e = (Date.now() - bc.startLocal) / 1000;
    if (e >= MAX_SEC) {
      bc.ui.timeP.textContent = '40:00 / 40:00';
      bc.ui.remP.textContent = 'Tiempo agotado';
      endBroadcast('limit');
      return;
    }
    var rem = MAX_SEC - e;
    scViewerSync(bc);
    bc.ui.timeP.textContent = fmt(e) + ' / 40:00';
    bc.ui.remP.textContent = 'Quedan ' + fmt(rem);
    bc.ui.remP.className = 'dbl-pill' + (rem <= 60 ? ' danger' : rem <= 300 ? ' warn' : '');
    if (rem <= 300 && !bc.warned.five) { bc.warned.five = true; toast('Quedan 5 minutos de Direct™'); }
    if (rem <= 60 && !bc.warned.one) { bc.warned.one = true; toast('Queda 1 minuto: el Direct™ se cortará a los 40:00'); }
  }
  function updateBcViewers() {
    var bc = L.bc;
    if (!bc || !bc.liveId) return;
    for (var i = 0; i < L.lives.length; i++) if (L.lives[i].id === bc.liveId) bc.viewers = L.lives[i].viewers;
    if (bc.ui) bc.ui.viewP.textContent = '👁 ' + (bc.viewers || 0) + (bc.viewers === 1 ? ' espectador' : ' espectadores');
  }
  function takeSnapshot() {
    var bc = L.bc;
    if (!bc || !bc.ui) return;
    var v = bc.ui.video;
    if (!v || !v.videoWidth) return;
    try {
      var w = Math.min(960, v.videoWidth), h = Math.round(v.videoHeight * (w / v.videoWidth));
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(v, 0, 0, w, h);
      c.toBlob(function (b) { if (b && L.bc === bc) bc.snapshot = b; }, 'image/jpeg', 0.8);
    } catch (e) {}
  }

  function replaceVideoTrack(newTrack) {
    var bc = L.bc;
    var old = bc.stream.getVideoTracks();
    old.forEach(function (t) { bc.stream.removeTrack(t); });
    bc.stream.addTrack(newTrack);  // el audio se queda en el mismo stream
    Object.keys(bc.peers).forEach(function (vid) {
      var p = bc.peers[vid];
      if (!p || !p.pc) return;
      p.pc.getSenders().forEach(function (s) {
        if (s === p.videoSender || (s.track && s.track.kind === 'video')) {
          try { var pr = s.replaceTrack(newTrack); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
        }
      });
    });
    // La vista previa (y el relé por servidor, que captura de este <video>) usa la pista nueva
    if (bc.ui) { try { bc.ui.video.srcObject = null; } catch (e0) {} bc.ui.video.srcObject = bc.stream; safePlay(bc.ui.video); }
    old.forEach(function (t) { if (t !== newTrack) { try { t.stop(); } catch (e) {} } });
  }
  function flipCamera() {
    var bc = L.bc;
    if (!bc || bc.source !== 'camera' || bc.flipping) return;
    bc.flipping = true;
    var prev = bc.facing === 'environment' ? 'environment' : 'user';
    var next = prev === 'user' ? 'environment' : 'user';
    var curId = trackDeviceId(bc.stream.getVideoTracks()[0]);
    function apply(s, wanted, okMsg) {
      bc.flipping = false;
      if (L.bc !== bc || bc.source !== 'camera') { stopStream(s); return; }
      var t = s.getVideoTracks()[0];
      if (!t) return;
      bc.facing = facingOf(t, wanted);
      replaceVideoTrack(t);
      syncSourceButtons();
      if (okMsg) toast(okMsg);
    }
    var label = next === 'environment' ? '📷 Cámara trasera' : '📷 Cámara delantera';
    getCameraVideo(next, curId).then(function (s) { apply(s, next, label); }, function (e) {
      if (L.bc !== bc) { bc.flipping = false; return; }
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) { bc.flipping = false; toast(mediaErrText(e)); return; }
      // Algunos móviles no abren dos cámaras a la vez: soltar la actual y reintentar
      bc.stream.getVideoTracks().forEach(function (t) { try { t.stop(); } catch (e2) {} });
      getCameraVideo(next, curId).then(function (s) { apply(s, next, label); }, function () {
        // No hay otra cámara: volver a la de antes sin cortar el Direct™
        getCameraVideo(prev, '').then(function (s) { apply(s, prev, 'Este dispositivo no tiene otra cámara'); }, function () {
          bc.flipping = false;
          toast('No se pudo abrir la cámara');
        });
      });
    });
  }
  function switchSource(to) {
    var bc = L.bc;
    if (!bc) return;
    var p = to === 'screen'
      ? navigator.mediaDevices.getDisplayMedia(displayMediaOpts())
      : navigator.mediaDevices.getUserMedia({ video: { facingMode: bc.facing || 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
    p.then(function (s) {
      if (!L.bc) { stopStream(s); return; }
      var track = s.getVideoTracks()[0];
      if (!track) return;
      bc.source = to;
      replaceVideoTrack(track);
      scViewerSync(bc);
      if (to === 'screen') {
        track.addEventListener('ended', function () { if (L.bc === bc && bc.source === 'screen') switchSource('camera'); });
      }
      send({ type: 'live_source', liveId: bc.liveId, source: to });
      syncSourceButtons();
      toast(to === 'screen' ? 'Compartiendo pantalla' : 'Cámara activada');
    }, function (e) { toast(to === 'screen' ? 'No se pudo compartir la pantalla' : mediaErrText(e)); });
  }

  // Peers del emisor (uno por espectador)
  function createHostPeer(vid) {
    var bc = L.bc;
    if (!bc || !bc.stream || !vid) return;
    closeHostPeer(vid);
    var pc;
    try { pc = new RTCPeerConnection({ iceServers: ICE }); } catch (e) { return; }
    var peer = { pc: pc, pendingIce: [], remoteSet: false };
    bc.peers[vid] = peer;
    bc.stream.getTracks().forEach(function (t) {
      var s = pc.addTrack(t, bc.stream);
      if (t.kind === 'video') peer.videoSender = s;
    });
    if (bc.vcv && bc.vcv.track && peer.videoSender) { try { var vr = peer.videoSender.replaceTrack(bc.vcv.track); if (vr && vr.catch) vr.catch(function () {}); } catch (e) {} }
    pc.onicecandidate = function (ev) {
      if (ev.candidate) send({ type: 'live_signal', liveId: bc.liveId, to: vid, signal: { candidate: icePlain(ev.candidate) } });
    };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'connected') limitBitrate(peer);
    };
    pc.createOffer().then(function (offer) {
      return pc.setLocalDescription(offer);
    }).then(function () {
      send({ type: 'live_signal', liveId: bc.liveId, to: vid, signal: { sdp: sdpPlain(pc.localDescription) } });
    }).catch(function () {});
  }
  function limitBitrate(peer) {
    try {
      var s = peer.videoSender;
      if (!s || !s.getParameters) return;
      var p = s.getParameters();
      if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = 900000;
      s.setParameters(p).catch(function () {});
    } catch (e) {}
  }
  function closeHostPeer(vid) {
    var bc = L.bc;
    if (!bc || !bc.peers[vid]) return;
    try { bc.peers[vid].pc.close(); } catch (e) {}
    delete bc.peers[vid];
  }
  function hostOnSignal(vid, sig) {
    var bc = L.bc;
    var peer = bc && bc.peers[vid];
    if (!peer || !sig) return;
    var pc = peer.pc;
    if (sig.sdp && sig.sdp.type === 'answer') {
      pc.setRemoteDescription(sig.sdp).then(function () {
        peer.remoteSet = true;
        peer.pendingIce.splice(0).forEach(function (c) { pc.addIceCandidate(c).catch(function () {}); });
      }).catch(function () {});
    } else if (sig.candidate) {
      if (peer.remoteSet) pc.addIceCandidate(sig.candidate).catch(function () {});
      else peer.pendingIce.push(sig.candidate);
    }
  }

  // Relé por servidor (cuando un espectador no puede conectar por WebRTC)
  function setRelay(count) {
    var bc = L.bc;
    if (!bc) return;
    bc.relayCount = count;
    if (count > 0) startRelay(); else stopRelay();
  }
  function startRelay() {
    var bc = L.bc;
    if (!bc || bc.frameTimer) return;
    var canvas = document.createElement('canvas');
    function tick() {
      if (L.bc !== bc || bc.relayCount <= 0) { bc.frameTimer = null; return; }
      bc.frameTimer = setTimeout(tick, 200);
      var v = bc.ui && bc.ui.video;
      if (!v || !v.videoWidth) return;
      var src = bc.vcv ? bc.vcv.canvas : v; // con cursor Snake si se comparte esta pestaña
      var sw0 = bc.vcv ? src.width : v.videoWidth, sh0 = bc.vcv ? src.height : v.videoHeight;
      var w = 360, h = Math.max(1, Math.round(sh0 * (w / sw0)));
      if (h > 270) { h = 270; w = Math.max(1, Math.round(sw0 * (270 / sh0))); }
      canvas.width = w; canvas.height = h;
      try {
        canvas.getContext('2d').drawImage(src, 0, 0, w, h);
        var data = canvas.toDataURL('image/jpeg', 0.5);
        var b64 = data.slice(data.indexOf(',') + 1);
        if (b64 && b64.length < 110000) send({ type: 'live_frame', liveId: bc.liveId, jpeg: b64 });
      } catch (e) {}
    }
    tick();
    // audio PCM 16 kHz
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || !bc.stream.getAudioTracks().length) return;
      var ctx = new AC();
      var src = ctx.createMediaStreamSource(bc.stream);
      var proc = ctx.createScriptProcessor(2048, 1, 1);
      var sink = ctx.createGain(); sink.gain.value = 0; // solo para que el procesador funcione; no afecta a WebRTC
      src.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
      proc.onaudioprocess = function (ev) {
        if (L.bc !== bc || bc.relayCount <= 0 || !bc.micOn) return;
        var input = ev.inputBuffer.getChannelData(0);
        var step = (ctx.sampleRate || 48000) / 16000;
        var n = Math.floor(input.length / step);
        if (n < 16) return;
        var bytes = new Uint8Array(n * 2);
        for (var i = 0; i < n; i++) {
          var s = input[Math.floor(i * step)] || 0;
          if (s > 1) s = 1; else if (s < -1) s = -1;
          var val = (s < 0 ? s * 0x8000 : s * 0x7fff) | 0;
          bytes[i * 2] = val & 255; bytes[i * 2 + 1] = (val >> 8) & 255;
        }
        send({ type: 'live_pcm', liveId: bc.liveId, rate: 16000, pcm: b64FromBytes(bytes) });
      };
      try { ctx.resume(); } catch (e) {}
      bc.pcm = { ctx: ctx, src: src, proc: proc, sink: sink };
    } catch (e) {}
  }
  function stopRelay() {
    var bc = L.bc;
    if (!bc) return;
    clearTimeout(bc.frameTimer); bc.frameTimer = null;
    if (bc.pcm) {
      try { bc.pcm.proc.onaudioprocess = null; bc.pcm.src.disconnect(); bc.pcm.proc.disconnect(); bc.pcm.ctx.close(); } catch (e) {}
      bc.pcm = null;
    }
  }

  function teardownBroadcast() {
    var bc = L.bc;
    if (!bc) return;
    clearInterval(bc.timer);
    clearInterval(bc.snapTimer);
    bc.relayCount = 0;
    stopRelay();
    scViewerStop(bc);
    Object.keys(bc.peers).forEach(function (vid) { try { bc.peers[vid].pc.close(); } catch (e) {} });
    bc.peers = {};
    stopStream(bc.stream);
    L.bc = null;
  }
  function endBroadcast(reason) {
    var bc = L.bc;
    if (!bc) return;
    if (bc.liveId) send({ type: 'live_end', liveId: bc.liveId, reason: reason });
    var dur = Math.min(MAX_SEC, (Date.now() - bc.startLocal) / 1000);
    var summary = { title: bc.title, durationSec: dur, reason: reason, snapshot: bc.snapshot, peakViewers: null, liveId: bc.liveId, recP: recStop(bc) };
    teardownBroadcast();
    showHostSummary(summary);
  }
  function onHostEnded(m) {
    var bc = L.bc;
    if (!bc) return;
    var summary = { title: bc.title, durationSec: m.durationSec, reason: m.reason, snapshot: bc.snapshot, peakViewers: m.peakViewers, liveId: bc.liveId, recP: recStop(bc) };
    teardownBroadcast();
    showHostSummary(summary);
  }
  function showHostSummary(sm) {
    if (!hostEl()) { closeOverlay(); return; }
    var ov = makeOverlay();
    var stage = el('div', 'dbl-stage');
    var c = el('div', 'dbl-center');
    c.appendChild(el('div', 'dbl-strip-title', sm.reason === 'limit' ? '⏱ Se alcanzó el límite de 40 minutos' : '⏹ Direct™ terminado'));
    c.appendChild(el('div', null, (sm.title || 'Direct™') + ' · duración ' + fmt(sm.durationSec)));
    if (sm.peakViewers != null) c.appendChild(el('div', 'dbl-muted', 'Máximo de espectadores a la vez: ' + sm.peakViewers));
    var msg = el('div', 'dbl-muted');
    c.appendChild(msg);
    var row = el('div', 'dbl-setup-row');
    if (sm.recP && sm.durationSec >= 5) {
      recPublish(sm, msg, row);
    } else if (sm.snapshot && sm.durationSec >= 5) {
      var pub = btn('go', '📗 Publicar resumen en mi canal', function () {
        pub.disabled = true; pub.textContent = 'Publicando…';
        var fd = new FormData();
        fd.append('kind', 'image');
        fd.append('title', ('🔴 Direct™: ' + (sm.title || 'Mi Direct™')).slice(0, 100));
        fd.append('description', 'Direct™ terminado · duración ' + fmt(sm.durationSec) + (sm.peakViewers != null ? ' · ' + sm.peakViewers + ' espectadores como máximo' : ''));
        fd.append('file', sm.snapshot, 'directo.jpg');
        fetch('/api/book/posts/upload', { method: 'POST', body: fd, credentials: 'same-origin' }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (d) {
            if (!r.ok) throw new Error((d && d.detail) || ('Error ' + r.status));
            pub.textContent = '✔ Publicado';
            msg.textContent = 'Publicado en tu canal. Recarga Inicio para verlo.';
          });
        }).catch(function (e) {
          pub.disabled = false; pub.textContent = '📗 Publicar resumen en mi canal';
          msg.textContent = (e && e.message) || 'No se pudo publicar (¿tienes canal creado?)';
        });
      });
      row.appendChild(pub);
    }
    row.appendChild(btn('', 'Cerrar', function () { closeOverlay(); }));
    c.appendChild(row);
    stage.appendChild(c);
    ov.appendChild(stage);
    paintStrip();
  }

  // ---------- Cursor de Snake OS en la pantalla compartida (Direct™) ----------
  // Si se comparte la propia pestaña de Snake OS, el cursor CSS no sale en la captura:
  // se dibuja encima (grabación y espectadores). Otra ventana/pantalla: sin superposición.
  var SC_HANDLE = 'snakeos-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.setCaptureHandleConfig) {
      navigator.mediaDevices.setCaptureHandleConfig({ handle: SC_HANDLE, exposeOrigin: true, permittedOrigins: [location.origin] });
    }
  } catch (e) {}
  function displayMediaOpts() {
    return {
      video: { cursor: 'never', width: { max: 1920 }, height: { max: 1920 }, frameRate: { ideal: 24, max: 30 } },
      audio: false, selfBrowserSurface: 'include', surfaceSwitching: 'exclude'
    };
  }
  var SC_MAP = { 'default': 'arrow', auto: 'arrow', pointer: 'hand', grab: 'hand', grabbing: 'hand', text: 'text', 'vertical-text': 'text',
    wait: 'wait', progress: 'progress', move: 'move', 'all-scroll': 'move', 'ew-resize': 'ew', 'col-resize': 'ew', 'e-resize': 'ew', 'w-resize': 'ew',
    'ns-resize': 'ns', 'row-resize': 'ns', 'n-resize': 'ns', 's-resize': 'ns', 'nwse-resize': 'nwse', 'nw-resize': 'nwse', 'se-resize': 'nwse',
    'nesw-resize': 'nesw', 'ne-resize': 'nesw', 'sw-resize': 'nesw' };
  var SC_HOT = { arrow: [3, 2], hand: [13, 1], text: [16, 16], wait: [16, 16], progress: [2, 2], move: [16, 16], ew: [16, 16], ns: [16, 16], nwse: [16, 16], nesw: [16, 16] };
  var SC = { x: -1, y: -1, inside: false, target: null, ripples: [], imgs: {}, ci: null, ciAt: 0, ciTarget: null };
  function scPoint(e) {
    if (e.pointerType === 'touch') return false;
    SC.x = e.clientX; SC.y = e.clientY; SC.inside = true;
    if (SC.target !== e.target) { SC.target = e.target; SC.ciAt = 0; }
    return true;
  }
  document.addEventListener('pointermove', scPoint, { passive: true, capture: true });
  document.addEventListener('pointerdown', function (e) {
    if (!scPoint(e)) return;
    SC.ripples.push({ x: e.clientX, y: e.clientY, t: Date.now() });
    if (SC.ripples.length > 6) SC.ripples.shift();
  }, { passive: true, capture: true });
  document.addEventListener('mouseout', function (e) { if (!e.relatedTarget) SC.inside = false; }, { passive: true });
  function scPrefOn() {
    try { return !(window.snakeCursor && window.snakeCursor.get && window.snakeCursor.get() === 'system'); } catch (e) { return true; }
  }
  function scIsSelf(track) {
    var st = {};
    try { st = track.getSettings() || {}; } catch (e) {}
    if (st.displaySurface && st.displaySurface !== 'browser') return false;
    try {
      if (track.getCaptureHandle) { var h = track.getCaptureHandle(); return !!(h && h.handle === SC_HANDLE); }
    } catch (e) {}
    // Sin Capture Handle: solo una pestaña con la misma proporción que esta ventana
    if (st.displaySurface !== 'browser' || !st.width || !st.height || !window.innerHeight) return false;
    return Math.abs(st.width / st.height - window.innerWidth / window.innerHeight) < 0.02;
  }
  function scActive(bc) {
    if (!bc || bc.source !== 'screen' || !bc.stream || !scPrefOn()) return false;
    var t = bc.stream.getVideoTracks()[0];
    if (!t || t.readyState === 'ended') return false;
    if (bc.scTrackId !== t.id) {
      bc.scTrackId = t.id;
      bc.scSelf = scIsSelf(t);
      try { console.info('[Direct™] pantalla compartida: ' + (bc.scSelf ? 'pestaña de Snake OS → cursor Snake dibujado' : 'otra ventana/pantalla → sin cursor superpuesto')); } catch (e) {}
    }
    return !!bc.scSelf;
  }
  function scImg(src) {
    var im = SC.imgs[src];
    if (!im) { im = new Image(); im.src = src; SC.imgs[src] = im; }
    return im;
  }
  function scCursor() {
    var now = Date.now();
    if (SC.ciAt && now - SC.ciAt < 200) return SC.ci;
    SC.ciAt = now;
    var t = SC.target, v = '';
    try { v = t && t.nodeType === 1 ? getComputedStyle(t).cursor : ''; } catch (e) {}
    var m = /url\(["']?([^"')]*snk-cur-[a-z]+(?:-hc)?(?:-big)?\.svg[^"')]*)["']?\)\s*(\d+)?\s*(\d+)?/.exec(v || '');
    if (m) { SC.ci = { src: m[1], hx: +m[2] || 0, hy: +m[3] || 0, size: /-big\.svg/.test(m[1]) ? 48 : 32 }; return SC.ci; }
    var k = String(v || '').split(',').pop().trim().toLowerCase();
    if (k === 'none') { SC.ci = null; return null; }
    var name = SC_MAP[k];
    if (!name) {
      var c = t && t.closest ? t : null;
      name = c && c.closest('a,button,[role=button],select,summary,label') ? 'hand'
        : (c && c.closest('input,textarea,[contenteditable]') ? 'text' : 'arrow');
    }
    var hs = SC_HOT[name] || [3, 2];
    SC.ci = { src: '/static/assets/snk-cur-' + name + '.svg?v=20261009', hx: hs[0], hy: hs[1], size: 32 };
    return SC.ci;
  }
  // Dibuja el cursor (y los clics) sobre un fotograma de la pestaña pintado en (dx, dy, dw, dh)
  function scDraw(ctx, dx, dy, dw, dh) {
    try {
      var vw = window.innerWidth || 1, vh = window.innerHeight || 1, kx = dw / vw, ky = dh / vh;
      var now = Date.now();
      SC.ripples = SC.ripples.filter(function (r) { return now - r.t < 450; });
      SC.ripples.forEach(function (r) {
        var p = (now - r.t) / 450;
        ctx.beginPath();
        ctx.arc(dx + r.x * kx, dy + r.y * ky, (5 + 20 * p) * kx, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(74,222,128,' + (0.9 * (1 - p)).toFixed(3) + ')';
        ctx.lineWidth = Math.max(1.5, 3 * kx);
        ctx.stroke();
      });
      if (!SC.inside || SC.x < 0) return;
      var ci = scCursor();
      if (!ci) return;
      var im = scImg(ci.src);
      if (!im.complete || !im.naturalWidth) return;
      ctx.drawImage(im, dx + (SC.x - ci.hx) * kx, dy + (SC.y - ci.hy) * ky, ci.size * kx, ci.size * ky);
    } catch (e) {}
  }
  // Espectadores: si hay cursor superpuesto, reciben un lienzo (máx. 720p) con el cursor en vez de la pista cruda
  function scViewerStop(bc) {
    var vc = bc && bc.vcv;
    if (!vc) return;
    bc.vcv = null;
    clearInterval(vc.timer);
    try { vc.track.stop(); } catch (e) {}
  }
  function scViewerStart(bc) {
    var v = bc.ui && bc.ui.video;
    if (!v) return null;
    var cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
    var ctx = cv.getContext('2d');
    var vc = { canvas: cv, track: null, timer: null };
    var draw = function () {
      try {
        var sw = v.videoWidth, sh = v.videoHeight;
        if (!sw || !sh) return;
        var k = Math.min(1, (sh > sw ? 720 : 1280) / sw, (sh > sw ? 1280 : 720) / sh);
        var W = Math.max(2, Math.round(sw * k / 2) * 2), H = Math.max(2, Math.round(sh * k / 2) * 2);
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        ctx.drawImage(v, 0, 0, W, H);
        scDraw(ctx, 0, 0, W, H);
      } catch (e) {}
    };
    draw();
    try { vc.track = cv.captureStream(30).getVideoTracks()[0]; } catch (e) { return null; }
    if (!vc.track) return null;
    vc.timer = setInterval(draw, 33);
    bc.vcv = vc;
    return vc;
  }
  function scViewerSync(bc) {
    if (!bc || !bc.stream) return;
    var want = scActive(bc);
    if (want && !bc.vcv) scViewerStart(bc);
    if (!want && bc.vcv) scViewerStop(bc);
    var target = bc.vcv ? bc.vcv.track : bc.stream.getVideoTracks()[0];
    if (!target) return;
    Object.keys(bc.peers || {}).forEach(function (vid) {
      var p = bc.peers[vid], s = p && p.videoSender;
      if (s && s.track !== target) { try { var pr = s.replaceTrack(target); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {} }
    });
  }

  // ---------- Direct™ completo: marca de agua + grabación para guardarlo en el canal ----------
  var REC_MAX_BYTES = 95 * 1024 * 1024; // límite de subida (Cloudflare: 100 MB)
  var REC_BUDGET_BYTES = 90 * 1024 * 1024; // objetivo: el Direct™ entero cabe en una sola subida
  var REC_AUDIO_BPS = 32000;
  // Vídeo a 1080p (o menos si la fuente es más pequeña): bitrate según el tiempo que queda hasta los 40 min
  function recVideoBps(remainingSec) {
    var rem = Math.max(60, Math.min(MAX_SEC, remainingSec || MAX_SEC));
    var bps = Math.floor(REC_BUDGET_BYTES * 8 / rem) - REC_AUDIO_BPS;
    return Math.max(150000, Math.min(4000000, bps));
  }
  function dtmWatermark() {
    var im = document.createElement('img');
    im.className = 'dbl-wm'; im.src = DTM_LOGO; im.alt = '';
    im.onerror = function () { try { im.remove(); } catch (e) {} };
    return im;
  }
  function recPickMime() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    var c = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
    for (var i = 0; i < c.length; i++) { try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) {} }
    return '';
  }
  // Graba lo que ven los espectadores (sin espejo) en un lienzo con el logo de Direct™ abajo a la derecha
  function recStart(bc) {
    if (!bc || bc.rec || !bc.ui || !bc.ui.video || !bc.stream) return;
    var mime = recPickMime();
    if (!mime) return;
    try {
      var v = bc.ui.video;
      var sw = v.videoWidth, sh = v.videoHeight;
      if (!sw || !sh) {
        try { var st = bc.stream.getVideoTracks()[0].getSettings(); sw = st.width; sh = st.height; } catch (e0) {}
      }
      if (!sw || !sh) { sw = 1920; sh = 1080; }
      var portrait = sh > sw;
      // 1080p como máximo (vertical 1080×1920); si la fuente es más pequeña, su tamaño real
      var capW = portrait ? 1080 : 1920, capH = portrait ? 1920 : 1080;
      var k = Math.min(1, capW / sw, capH / sh);
      var W = Math.max(2, Math.round(sw * k / 2) * 2), H = Math.max(2, Math.round(sh * k / 2) * 2);
      var remaining = MAX_SEC - Math.max(0, (Date.now() - (bc.startLocal || Date.now())) / 1000);
      var vbps = recVideoBps(remaining);
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var ctx = cv.getContext('2d');
      var wm = new Image(); wm.src = DTM_LOGO;
      var rec = { mime: mime, chunks: [], bytes: 0, full: false, timer: null, mr: null };
      var draw = function () {
        try {
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
          var vw = v.videoWidth, vh = v.videoHeight;
          if (vw && vh) {
            var s = Math.min(W / vw, H / vh), dw = vw * s, dh = vh * s;
            ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
            if (scActive(bc)) scDraw(ctx, (W - dw) / 2, (H - dh) / 2, dw, dh);
          }
          if (wm.complete && wm.naturalWidth) {
            var ws = Math.round(Math.min(W, H) * 0.11), mg = Math.round(Math.min(W, H) * 0.028);
            ctx.globalAlpha = 0.75;
            ctx.drawImage(wm, W - ws - mg, H - ws - mg, ws, ws);
            ctx.globalAlpha = 1;
          }
        } catch (e) {}
      };
      draw();
      var out = cv.captureStream(30);
      bc.stream.getAudioTracks().forEach(function (t) { try { out.addTrack(t); } catch (e) {} });
      var mr = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: vbps, audioBitsPerSecond: REC_AUDIO_BPS });
      rec.width = W; rec.height = H; rec.vbps = vbps;
      try { console.info('[Direct™] grabando ' + W + '×' + H + ' · ' + mime + ' · vídeo ' + Math.round(vbps / 1000) + ' kbps'); } catch (e1) {}
      mr.ondataavailable = function (ev) {
        if (rec.full || !ev.data || !ev.data.size) return;
        if (rec.bytes + ev.data.size > REC_MAX_BYTES) {
          rec.full = true;
          try { if (mr.state !== 'inactive') mr.stop(); } catch (e) {}
          return;
        }
        rec.chunks.push(ev.data); rec.bytes += ev.data.size;
      };
      rec.timer = setInterval(draw, 33);
      rec.mr = mr;
      mr.start(5000);
      bc.rec = rec;
    } catch (e) { bc.rec = null; }
  }
  function recStop(bc) {
    var rec = bc && bc.rec;
    if (!rec || !rec.mr) return null;
    bc.rec = null;
    clearInterval(rec.timer);
    return new Promise(function (resolve) {
      var done = false;
      var finish = function () {
        if (done) return; done = true;
        var type = rec.mime.split(';')[0];
        resolve(rec.chunks.length ? { blob: new Blob(rec.chunks, { type: type }), full: rec.full, ext: type === 'video/mp4' ? 'mp4' : 'webm' } : null);
      };
      if (rec.mr.state === 'inactive') { finish(); return; }
      rec.mr.onstop = function () { setTimeout(finish, 0); };
      try { rec.mr.stop(); } catch (e) { finish(); }
      setTimeout(finish, 5000);
    });
  }
  // Sube el Direct™ entero como vídeo al canal y copia su chat como comentarios
  function recPublish(sm, msg, row) {
    msg.textContent = 'Guardando tu Direct™ completo en tu canal…';
    var retry = null;
    function upload(res) {
      if (retry) { try { retry.remove(); } catch (e) {} retry = null; }
      function fail(t) {
        msg.textContent = 'No se pudo guardar el Direct™: ' + t;
        retry = btn('go', '🔁 Reintentar', function () { upload(res); });
        row.insertBefore(retry, row.firstChild);
      }
      var fd = new FormData();
      fd.append('kind', 'video');
      fd.append('title', ('Direct™: ' + (sm.title || 'Mi Direct™')).slice(0, 100));
      fd.append('description', ('Direct™ completo · duración ' + fmt(sm.durationSec) +
        (sm.peakViewers != null ? ' · ' + sm.peakViewers + ' espectadores como máximo' : '') +
        (res.full ? ' · guardado hasta el límite de 95 MB' : '')).slice(0, 500));
      fd.append('file', res.blob, 'direct.' + res.ext);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/book/posts/upload');
      xhr.withCredentials = true;
      xhr.upload.onprogress = function (ev) {
        if (ev.lengthComputable) msg.textContent = 'Guardando tu Direct™ completo en tu canal… ' + Math.round(ev.loaded * 100 / ev.total) + '%';
      };
      xhr.onerror = function () { fail('sin conexión'); };
      xhr.onload = function () {
        var d = null; try { d = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status < 200 || xhr.status >= 300 || !d || !d.id) { fail((d && d.detail) || ('error ' + xhr.status)); return; }
        msg.textContent = '✔ Direct™ guardado en tu canal. Copiando el chat…';
        fetch('/api/book/posts/' + d.id + '/live-chat', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ liveId: sm.liveId || '' })
        }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (j) {
          var n = Number(j && j.imported) || 0;
          msg.textContent = '✔ Direct™ guardado en tu canal' + (n ? ' con ' + n + ' comentario' + (n === 1 ? '' : 's') + ' del chat' : '') + '. Recarga Inicio para verlo.';
        }).catch(function () { msg.textContent = '✔ Direct™ guardado en tu canal (no se pudo copiar el chat).'; });
      };
      xhr.send(fd);
    }
    sm.recP.then(function (res) {
      if (!res || !res.blob || res.blob.size < 20000) { msg.textContent = 'No se pudo grabar el Direct™ en este navegador.'; return; }
      upload(res);
    });
  }

  // ---------- chat del directo ----------
  var CHAT_MAX = 200;
  function chatLiveId() {
    if (L.bc && L.bc.liveId) return L.bc.liveId;
    if (L.watch && L.watch.liveId) return L.watch.liveId;
    return null;
  }
  function chatMount(ov, stage) {
    if (L.chatUi && L.chatUi.ro) { try { L.chatUi.ro.disconnect(); } catch (e) {} }
    var main = el('div', 'dbl-main');
    ov.insertBefore(main, stage);
    main.appendChild(stage);
    var box = el('aside', 'dbl-chat');
    box.appendChild(el('div', 'dbl-chat-head', '💬 Chat del Direct™'));
    var list = el('div', 'dbl-chat-list');
    list.setAttribute('aria-live', 'polite');
    var empty = el('div', 'dbl-chat-empty', 'Todavía no hay mensajes. ¡Saluda!');
    list.appendChild(empty);
    var err = el('div', 'dbl-chat-err');
    var form = document.createElement('form');
    form.className = 'dbl-chat-form';
    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = CHAT_MAX;
    input.placeholder = 'Escribe un mensaje…';
    input.autocomplete = 'off';
    input.setAttribute('enterkeyhint', 'send');
    input.setAttribute('aria-label', 'Mensaje para el chat del Direct™');
    var sendB = el('button', null, 'Enviar');
    sendB.type = 'submit';
    form.appendChild(input);
    form.appendChild(sendB);
    box.appendChild(list);
    box.appendChild(err);
    box.appendChild(form);
    main.appendChild(box);
    var ui = { main: main, list: list, empty: empty, input: input, sendB: sendB, err: err, ro: null, lastSend: 0, errTimer: null };
    // Que las teclas del chat no lleguen a los atajos de Snake OS (Enter sigue enviando)
    input.addEventListener('keydown', function (ev) { ev.stopPropagation(); });
    input.addEventListener('keyup', function (ev) { ev.stopPropagation(); });
    form.addEventListener('submit', function (ev) { ev.preventDefault(); ev.stopPropagation(); chatSend(); });
    function fit() { main.classList.toggle('wide', (ov.clientWidth || 0) >= 640); }
    if (typeof ResizeObserver === 'function') { ui.ro = new ResizeObserver(fit); ui.ro.observe(ov); }
    else window.addEventListener('resize', fit);
    fit();
    setTimeout(fit, 0);
    L.chatUi = ui;
    return ui;
  }
  function chatError(text) {
    var ui = L.chatUi;
    if (!ui) return;
    ui.err.textContent = text || '';
    clearTimeout(ui.errTimer);
    if (text) ui.errTimer = setTimeout(function () { ui.err.textContent = ''; }, 3500);
  }
  function chatSend() {
    var ui = L.chatUi;
    if (!ui) return;
    var text = String(ui.input.value || '').replace(/\s+/g, ' ').trim();
    if (!text) { chatError('Escribe un mensaje'); return; }
    if (text.length > CHAT_MAX) { chatError('Máximo ' + CHAT_MAX + ' caracteres'); return; }
    var lid = chatLiveId();
    if (!lid || (L.watch && L.watch.ended)) { chatError('El Direct™ ya no está disponible'); return; }
    var now = Date.now();
    if (now - ui.lastSend < 1000) { chatError('Espera un segundo entre mensajes'); return; }
    if (!send({ type: 'live_chat', liveId: lid, text: text })) { chatError('Sin conexión, reintentando…'); return; }
    ui.lastSend = now;
    ui.input.value = '';
    chatError('');
  }
  function chatRow(m) {
    if (m.system) return el('div', 'dbl-chat-sys', String(m.text || ''));
    var row = el('div', 'dbl-chat-msg' + (m.host ? ' host' : ''));
    var av = el('span', 'dbl-cav');
    var photo = (typeof m.photo === 'string' && m.photo.indexOf('/api/avatars/') === 0) ? m.photo : '';
    if (photo) {
      var im = document.createElement('img');
      im.alt = '';
      im.loading = 'lazy';
      im.onerror = function () { av.textContent = '👤'; };
      im.src = photo;
      av.appendChild(im);
    } else {
      if (window.snakeEmoji && window.snakeEmoji.fill) window.snakeEmoji.fill(av, String(m.emoji || '👤')); else av.textContent = String(m.emoji || '👤');
    }
    var body = el('div', 'dbl-chat-body');
    var who = el('div', 'dbl-chat-who');
    who.appendChild(el('strong', null, String(m.name || 'Perfil')));
    if (m.host) who.appendChild(el('span', 'dbl-chat-crown', '👑 EN DIRECT™'));
    body.appendChild(who);
    body.appendChild(el('div', 'dbl-chat-text', String(m.text || '')));
    row.appendChild(av);
    row.appendChild(body);
    return row;
  }
  function chatAppend(m, noScroll) {
    var ui = L.chatUi;
    if (!ui || !m) return;
    if (ui.empty.parentNode) ui.empty.parentNode.removeChild(ui.empty);
    ui.list.appendChild(chatRow(m));
    while (ui.list.childNodes.length > 150) ui.list.removeChild(ui.list.firstChild);
    if (!noScroll) ui.list.scrollTop = ui.list.scrollHeight;
  }
  function chatSetHistory(liveId, msgs) {
    var ui = L.chatUi;
    if (!ui || !liveId || liveId !== chatLiveId()) return;
    while (ui.list.firstChild) ui.list.removeChild(ui.list.firstChild);
    ui.list.appendChild(ui.empty);
    (msgs || []).forEach(function (m) { chatAppend(m, true); });
    ui.list.scrollTop = ui.list.scrollHeight;
  }
  function chatOnMessage(m) {
    if (!m || !m.message || m.liveId !== chatLiveId()) return;
    chatAppend(m.message);
  }
  function chatEnded() {
    var ui = L.chatUi;
    if (!ui) return;
    ui.input.disabled = true;
    ui.sendB.disabled = true;
    ui.input.placeholder = 'El Direct™ ha terminado';
  }

  // ---------- «Me gusta» del Direct™ ----------
  function likeGet(id) {
    L.likeState = L.likeState || {};
    var s = L.likeState[id];
    if (!s) {
      s = { count: 0, liked: false };
      for (var i = 0; i < (L.lives || []).length; i++) if (L.lives[i].id === id) s.count = Number(L.lives[i].likes) || 0;
      L.likeState[id] = s;
    }
    return s;
  }
  function likeSet(id, count, liked) {
    if (!id) return;
    var s = likeGet(id);
    if (count != null) s.count = Number(count) || 0;
    if (typeof liked === 'boolean') s.liked = liked;
    likeRender();
  }
  function likeSyncFromLives() {
    L.likeState = L.likeState || {};
    (L.lives || []).forEach(function (lv) {
      if (lv && L.likeState[lv.id] && lv.likes != null) L.likeState[lv.id].count = Number(lv.likes) || 0;
    });
    likeRender();
  }
  function likeRender() {
    var b = L.likeBtn;
    if (!b) return;
    var id = chatLiveId();
    var s = id ? likeGet(id) : { count: 0, liked: false };
    b.textContent = (s.liked ? '❤️ ' : '🤍 ') + s.count + ' · ' + (s.liked ? 'Ya no me gusta' : 'Me gusta');
    b.title = s.liked ? 'Ya no me gusta' : 'Me gusta';
    b.setAttribute('aria-pressed', s.liked ? 'true' : 'false');
    b.className = 'dbl-like' + (s.liked ? ' liked' : '');
  }
  function likeOnMsg(m) {
    if (!m || !m.liveId) return;
    for (var i = 0; i < (L.lives || []).length; i++) if (L.lives[i].id === m.liveId) L.lives[i].likes = Number(m.count) || 0;
    likeSet(m.liveId, m.count, typeof m.liked === 'boolean' ? m.liked : undefined);
    paintStrip();
  }
  function likeButton() {
    var b = btn('dbl-like', '🤍 0 · Me gusta', function () {
      var id = chatLiveId();
      if (!id) { toast('Espera a que empiece el Direct™'); return; }
      var s = likeGet(id);
      var on = !s.liked;
      var prev = { count: s.count, liked: s.liked };
      s.liked = on;
      s.count = Math.max(0, s.count + (on ? 1 : -1));
      likeRender();
      if (!send({ type: 'live_like', liveId: id, on: on })) {
        s.count = prev.count; s.liked = prev.liked;
        likeRender();
        toast('Sin conexión: no se pudo dar me gusta');
      }
    });
    L.likeBtn = b;
    likeRender();
    return b;
  }

  // ---------- espectador ----------
  function startWatch(lv) {
    if (L.bc || L.setup) { toast('Termina tu Direct™ para ver otros'); return; }
    if (L.watch) leaveWatch();
    var ov = makeOverlay();
    var stage = el('div', 'dbl-stage');
    var video = document.createElement('video');
    video.autoplay = true; video.playsInline = true; video.setAttribute('playsinline', '');
    stage.appendChild(video);
    var frame = document.createElement('img');
    frame.className = 'dbl-frame'; frame.alt = ''; frame.style.display = 'none';
    stage.appendChild(frame);
    var hud = el('div', 'dbl-hud');
    hud.appendChild(dtmLabel(el('span', 'dbl-badge'), 'DIRECT™'));
    var viewP = el('span', 'dbl-pill', '👁 ' + (lv.viewers || 0));
    var timeP = el('span', 'dbl-pill', '00:00');
    hud.appendChild(viewP); hud.appendChild(timeP);
    stage.appendChild(hud);
    stage.appendChild(dtmWatermark());
    var center = el('div', 'dbl-center');
    center.appendChild(el('div', null, 'Conectando con el Direct™…'));
    stage.appendChild(center);
    ov.appendChild(stage);
    chatMount(ov, stage);
    var info = el('div', 'dbl-info');
    var tEl = el('strong', null, lv.title || 'Direct™');
    var wEl = el('span', 'dbl-muted', (lv.channelTitle || lv.name || 'Perfil') + (lv.handle ? ' · @' + lv.handle : ''));
    info.appendChild(tEl); info.appendChild(wEl);
    ov.appendChild(info);
    var bar = el('div', 'dbl-bar');
    var soundB = btn('on', '🔊 Sonido', function () {
      // Silenciar solo este reproductor (no toca el volumen de WebRTC)
      video.muted = !video.muted;
      soundB.textContent = video.muted ? '🔇 Sin sonido' : '🔊 Sonido';
      soundB.className = video.muted ? '' : 'on';
      if (!video.muted) { safePlay(video); ensureAudioCtx(); }
      if (L.watch) L.watch.relayMuted = video.muted;
    });
    bar.appendChild(soundB);
    bar.appendChild(likeButton());
    bar.appendChild(btn('end', '✖ Salir del Direct™', function () { leaveWatch(); closeOverlay(); }));
    ov.appendChild(bar);

    L.watch = {
      liveId: lv.id, live: lv, pc: null, pendingIce: [], remoteSet: false, viewerId: null,
      startLocal: Date.now() - elapsedOf(lv) * 1000, relay: false, relayTimer: null, ended: false,
      ui: { video: video, frame: frame, viewP: viewP, timeP: timeP, center: center, soundB: soundB, tEl: tEl },
      timer: setInterval(watchTick, 1000), audioCtx: null, playAt: 0, relayMuted: false
    };
    ensureAudioCtx(); // dentro del clic: desbloquea el audio en móviles
    connect();
    if (!send({ type: 'live_join', liveId: lv.id })) {
      // se enviará en el 'hello' al conectar
    }
    watchTick();
    paintStrip();
  }
  function ensureAudioCtx() {
    var w = L.watch;
    if (!w) return null;
    if (!w.audioCtx) {
      try { var AC = window.AudioContext || window.webkitAudioContext; if (AC) w.audioCtx = new AC(); } catch (e) {}
    }
    try { if (w.audioCtx && w.audioCtx.state === 'suspended') w.audioCtx.resume(); } catch (e) {}
    return w.audioCtx;
  }
  function watchTick() {
    var w = L.watch;
    if (!w || w.ended) return;
    var e = Math.min(MAX_SEC, (Date.now() - w.startLocal) / 1000);
    w.ui.timeP.textContent = fmt(e) + ' · quedan ' + fmt(MAX_SEC - e);
  }
  function updateWatchInfo() {
    var w = L.watch;
    if (!w || w.ended) return;
    for (var i = 0; i < L.lives.length; i++) {
      var lv = L.lives[i];
      if (lv.id === w.liveId) {
        w.ui.viewP.textContent = '👁 ' + (lv.viewers || 0);
        if (lv.title) w.ui.tEl.textContent = lv.title;
      }
    }
  }
  function armRelayTimer() {
    var w = L.watch;
    if (!w) return;
    clearTimeout(w.relayTimer);
    w.relayTimer = setTimeout(function () {
      if (L.watch !== w || w.ended) return;
      if (!webrtcLive()) setWatchRelay(true);
    }, RELAY_AFTER_MS);
  }
  function webrtcLive() {
    var w = L.watch;
    if (!w || !w.pc) return false;
    var st = w.pc.connectionState || w.pc.iceConnectionState;
    var ok = st === 'connected' || w.pc.iceConnectionState === 'connected' || w.pc.iceConnectionState === 'completed';
    return ok && w.ui.video.videoWidth > 0;
  }
  function setWatchRelay(on) {
    var w = L.watch;
    if (!w || w.relay === on) return;
    w.relay = on;
    send({ type: 'live_relay', liveId: w.liveId, on: on });
    if (on) {
      w.ui.center.hidden = true;
    } else {
      w.ui.frame.style.display = 'none';
      w.ui.video.style.visibility = '';
    }
  }
  function playVideoWithSound() {
    var w = L.watch;
    if (!w) return;
    var v = w.ui.video;
    var p;
    try { p = v.play(); } catch (e) { p = null; }
    if (p && p.catch) {
      p.catch(function () {
        // El navegador bloquea el audio sin gesto: reproducir sin sonido y ofrecer activarlo
        v.muted = true;
        safePlay(v);
        w.ui.soundB.textContent = '🔇 Toca para activar el sonido';
        w.ui.soundB.className = '';
      });
    }
  }
  function viewerOnSignal(sig) {
    var w = L.watch;
    if (!w || !sig) return;
    if (sig.sdp && sig.sdp.type === 'offer') {
      if (w.pc) { try { w.pc.close(); } catch (e) {} }
      var pc;
      try { pc = new RTCPeerConnection({ iceServers: ICE }); } catch (e) { setWatchRelay(true); return; }
      w.pc = pc; w.pendingIce = []; w.remoteSet = false;
      pc.ontrack = function (ev) {
        if (L.watch !== w) return;
        var s = (ev.streams && ev.streams[0]) || null;
        if (!s) { s = w.ui.video.srcObject || new MediaStream(); s.addTrack(ev.track); }
        if (w.ui.video.srcObject !== s) w.ui.video.srcObject = s;
        playVideoWithSound();
      };
      pc.onicecandidate = function (ev) {
        if (ev.candidate) send({ type: 'live_signal', liveId: w.liveId, signal: { candidate: icePlain(ev.candidate) } });
      };
      pc.onconnectionstatechange = function () {
        if (L.watch !== w || w.pc !== pc) return;
        var st = pc.connectionState;
        if (st === 'connected') {
          w.ui.center.hidden = true;
          setTimeout(function () { if (L.watch === w && webrtcLive()) setWatchRelay(false); }, 1500);
        } else if (st === 'failed') {
          setWatchRelay(true);
        } else if (st === 'disconnected') {
          setTimeout(function () { if (L.watch === w && w.pc === pc && pc.connectionState !== 'connected') setWatchRelay(true); }, 6000);
        }
      };
      pc.setRemoteDescription(sig.sdp).then(function () {
        w.remoteSet = true;
        w.pendingIce.splice(0).forEach(function (c) { pc.addIceCandidate(c).catch(function () {}); });
        return pc.createAnswer();
      }).then(function (ans) { return pc.setLocalDescription(ans); }).then(function () {
        send({ type: 'live_signal', liveId: w.liveId, signal: { sdp: sdpPlain(pc.localDescription) } });
      }).catch(function () { setWatchRelay(true); });
      armRelayTimer();
    } else if (sig.candidate && w.pc) {
      if (w.remoteSet) w.pc.addIceCandidate(sig.candidate).catch(function () {});
      else w.pendingIce.push(sig.candidate);
    }
  }
  function showRelayFrame(b64) {
    var w = L.watch;
    if (!w || w.ended || !b64) return;
    if (webrtcLive()) { setWatchRelay(false); return; }
    w.ui.center.hidden = true;
    w.ui.video.style.visibility = 'hidden';
    w.ui.frame.style.display = 'block';
    w.ui.frame.src = 'data:image/jpeg;base64,' + b64;
  }
  function playPcm(b64, rate) {
    var w = L.watch;
    if (!w || w.ended || !b64 || w.relayMuted || webrtcLive()) return;
    var ctx = ensureAudioCtx();
    if (!ctx) return;
    try {
      var bytes = bytesFromB64(b64);
      var n = Math.floor(bytes.length / 2);
      if (n < 8) return;
      var f32 = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        var v = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
        if (v & 0x8000) v -= 0x10000;
        f32[i] = v / 0x8000;
      }
      var buf = ctx.createBuffer(1, n, rate || 16000);
      buf.copyToChannel(f32, 0);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      var now = ctx.currentTime + 0.03;
      var when = Math.max(now, w.playAt || 0);
      if (when - now > 0.4) when = now;
      src.start(when);
      w.playAt = when + buf.duration;
    } catch (e) {}
  }
  function teardownWatch() {
    var w = L.watch;
    if (!w) return;
    clearInterval(w.timer);
    clearTimeout(w.relayTimer);
    if (w.pc) { try { w.pc.close(); } catch (e) {} }
    try { w.ui.video.pause(); w.ui.video.srcObject = null; } catch (e) {}
    if (w.audioCtx) { try { w.audioCtx.close(); } catch (e) {} }
    L.watch = null;
  }
  function leaveWatch() {
    var w = L.watch;
    if (!w) return;
    if (!w.ended) send({ type: 'live_leave', liveId: w.liveId });
    teardownWatch();
    paintStrip();
  }
  function onWatchEnded(m) {
    var w = L.watch;
    if (!w) return;
    w.ended = true;
    chatEnded();
    var ui = w.ui;
    teardownWatch();
    if (!L.ov) return;
    ui.frame.style.display = 'none';
    ui.center.hidden = false;
    ui.center.innerHTML = '';
    var txt = m.reason === 'limit' ? '⏱ El Direct™ llegó al límite de 40 minutos y ha terminado.'
      : m.reason === 'gone' ? 'Este Direct™ ya no está disponible.'
      : m.reason === 'disconnect' ? 'El Direct™ terminó: se perdió la conexión con quien emitía.'
      : '⏹ El Direct™ ha terminado.';
    ui.center.appendChild(el('div', 'dbl-strip-title', txt));
    if (m.durationSec) ui.center.appendChild(el('div', null, 'Duración: ' + fmt(m.durationSec)));
    ui.center.appendChild(btn('go', 'Cerrar', function () { closeOverlay(); }));
  }

  // ---------- engancharse a DoganieroBook ----------
  function wrap() {
    var orig = window.renderDoganieroBookApp;
    if (typeof orig !== 'function' || orig.__dblWrapped) return false;
    var wrapped = function (container) {
      var c1 = orig.apply(this, arguments);
      var c2 = null;
      try { c2 = attach(container); } catch (e) { try { console.warn('[dbook-live]', e); } catch (e2) {} }
      return function cleanup() {
        try { if (c2) c2(); } catch (e) {}
        if (typeof c1 === 'function') { try { c1(); } catch (e) {} }
      };
    };
    wrapped.__dblWrapped = true;
    window.renderDoganieroBookApp = wrapped;
    return true;
  }
  if (!wrap()) {
    var n = 0;
    var iv = setInterval(function () { if (wrap() || ++n > 100) clearInterval(iv); }, 100);
  }
  // Abrir DoganieroBook desde una notificación y, si el directo sigue activo, verlo.
  function openLive(liveId) {
    liveId = String(liveId || '');
    try { if (typeof window.openApp === 'function') window.openApp('doganiero-book'); } catch (e) {}
    clearInterval(L.openLiveTimer);
    L.openLiveTimer = null;
    if (!liveId || L.bc || L.setup) return;
    if (L.watch && L.watch.liveId === liveId && !L.watch.ended) { showOverlay(); return; }
    var tries = 0;
    L.openLiveTimer = setInterval(function () {
      tries++;
      var lv = null;
      (L.lives || []).forEach(function (x) { if (x && x.id === liveId) lv = x; });
      if (L.container && L.wsOpen && lv) {
        clearInterval(L.openLiveTimer);
        L.openLiveTimer = null;
        if (L.bc || L.setup) return;
        if (L.me && Number(lv.userId) === Number(L.me.id)) return;
        if (L.watch && L.watch.liveId === liveId && !L.watch.ended) { showOverlay(); return; }
        startWatch(lv);
        return;
      }
      // ~12 s: si el directo ya terminó, se queda abierto DoganieroBook con «🔴 Directos»
      if (tries > 48) { clearInterval(L.openLiveTimer); L.openLiveTimer = null; }
    }, 250);
  }
  window.addEventListener('dbook:me', function (ev) {
    var d = ev && ev.detail;
    if (!d || !d.me) return;
    var has = !!d.hasChannel;
    if (L.hasChannel !== has) { L.hasChannel = has; paintStrip(); }
  });
  window.DoganieroBookLive = { state: L, maxSec: MAX_SEC, openLive: openLive };
})();
