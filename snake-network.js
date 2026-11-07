/* Snake OS · Doganiero_Network (red wifi).
 *
 * Qué es: la red wifi Doganiero_Network de Snake OS, con interruptor y estado visible.
 *  - No crea ni cambia ninguna wifi: trabaja con la conexión real del dispositivo.
 *  - «Internet disponible» = hay conexión REAL: se comprueba con un ping a /api/status.
 *    Si el interruptor está encendido pero el ping falla, el estado dice «Sin internet real»
 *    y las funciones online siguen bloqueadas (nunca se miente sobre el acceso a internet).
 *
 * Cómo controla las funciones online (de forma común, no botón a botón):
 *  intercepta fetch / XMLHttpRequest / WebSocket / EventSource / sendBeacon. Cuando la red
 *  está desconectada (interruptor apagado) o no hay internet real, las peticiones que necesitan internet
 *  se rechazan como si el dispositivo estuviese sin conexión y se muestra el aviso
 *  «Conéctate a Doganiero_Network para usar esta función». Las funciones locales (escritorio,
 *  notas, calculadora, archivos, editor...) no usan red y siguen funcionando.
 *
 * Nunca se bloquea el arranque: /api/status, /api/os-gate, /api/login, /api/signup, /api/logout,
 * /api/me, /api/bootstrap y /api/avatars/ pasan siempre (si no, no podrías ni iniciar sesión ni
 * volver a encender la red).
 *
 * API pública: window.DogaNet
 *   .isOn()                  interruptor encendido
 *   .isConnected()           encendido Y con internet real
 *   .hasInternet()           internet real detectado
 *   .set(bool)               encender (con animación de conexión) / apagar
 *   .toggle() .check()       atajo / volver a comprobar
 *   .requireOnline(name)     true si se puede usar una función online (si no, muestra el aviso)
 *   .isOnlineRequest(url)    ¿esa URL necesita internet?
 *   .msg                     texto del aviso
 */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : null;
  if (!W) return;
  if (W.DogaNet && W.DogaNet.__installed) return;

  var DOC = typeof document !== 'undefined' ? document : null;
  var NAV = W.navigator || {};
  var LOC = W.location || { href: '/', origin: '', pathname: '/' };

  var OFF_MSG = 'Conéctate a Doganiero_Network para usar esta función';
  var LS_ON = 'dogaNetOn';        // se guarda por perfil: dogaNetOn:u:<email> / dogaNetOn:guest
  var CHECK_MS = 30000;      // repaso periódico de internet real
  var CONNECT_MIN_MS = 2400; // el planeta gira al menos esto (que se vea)
  var PING_TIMEOUT = 6000;

  /* ---------------- estado ---------------- */
  var st = {
    on: true,          // interruptor
    profile: 'guest',  // perfil dueño del interruptor (ver profileTag)
    real: null,        // true = internet real, false = sin internet, null = sin comprobar
    fails: 0,          // fallos seguidos del ping (2 fallos = sin internet)
    connecting: false,
    connectToken: 0,
    lastCheck: 0,
    checkTimer: 0,
    retryTimer: 0,
    profileTimer: 0,
    blocked: 0,        // peticiones online bloqueadas desde el arranque
    lastBlockedUrl: ''
  };

  function readLS(k) {
    try { return W.localStorage ? W.localStorage.getItem(k) : null; } catch (e) { return null; }
  }
  function writeLS(k, v) {
    try { if (W.localStorage) W.localStorage.setItem(k, v); } catch (e) {}
  }

  /* El interruptor es POR PERFIL: desconectarte solo afecta a tu cuenta en este navegador.
     Clave por perfil: dogaNetOn:u:<email> con sesión; dogaNetOn:guest sin sesión. */
  function profileTag() {
    try {
      var u = W.currentUser;
      var email = u && u.email ? String(u.email).trim().toLowerCase() : '';
      return email ? 'u:' + email : 'guest';
    } catch (e) { return 'guest'; }
  }
  function onKey() { return LS_ON + ':' + st.profile; }
  function readOnStored() {
    var v = readLS(onKey());
    if (v === null) {                       // migración del interruptor global antiguo (una sola vez)
      v = readLS(LS_ON);
      if (v !== null) {
        writeLS(onKey(), v);
        try { if (W.localStorage) W.localStorage.removeItem(LS_ON); } catch (e) {}
      }
    }
    return v;
  }
  st.profile = profileTag();
  (function () {
    var v = readOnStored();
    st.on = v === null ? true : v === '1';  // por defecto encendida: no cambia nada al entrar
  })();

  /* ---------------- qué necesita internet ---------------- */
  // Rutas que SIEMPRE pasan: acceso inicial, sesión y recursos de la propia cuenta.
  var EXEMPT = [
    /^\/api\/status(?:[\/?]|$)/,
    /^\/api\/os-gate(?:[\/?]|$)/,
    /^\/api\/(?:login|signup|logout)(?:[\/?]|$)/,
    /^\/api\/me(?:\?|$)/,
    /^\/api\/bootstrap(?:[\/?]|$)/,
    /^\/api\/avatars\//,
    /^\/api\/(?:tutorial|setup)\/done(?:[\/?]|$)/
  ];

  function absUrl(url) {
    try {
      if (typeof URL === 'function') return new URL(String(url), LOC.href || '/');
    } catch (e) {}
    return null;
  }

  /** ¿Esta URL necesita internet? Otro origen = internet; /api/* = online (salvo excepciones);
   *  estáticos, páginas y descargas del propio servidor = local. */
  function isOnlineRequest(url) {
    var u = absUrl(url);
    if (!u) return false;                                  // no se puede resolver: no bloquear
    var proto = String(u.protocol || '').toLowerCase();
    if (proto === 'ws:' || proto === 'wss:') return true;   // cualquier socket necesita red
    if (proto !== 'http:' && proto !== 'https:') return false; // data:, blob:, file: → local
    if (u.origin !== LOC.origin) return true;               // otro sitio → internet
    var p = u.pathname || '/';
    var i;
    for (i = 0; i < EXEMPT.length; i++) if (EXEMPT[i].test(p)) return false;
    if (p.indexOf('/api/') === 0) return true;              // API de Snake OS → online
    return false;                                           // /static, html, descargas → local
  }

  /** Se bloquea si la red está apagada, o si sabemos que NO hay internet real. */
  function shouldBlock(url, method) {
    if (method && String(method).toUpperCase() === 'OPTIONS') return false; // preflight del navegador
    if (!isOnlineRequest(url)) return false;
    if (!st.on) return true;
    if (st.real === false) return true;
    return false;
  }

  function dnError() {
    var e;
    try { e = new TypeError(OFF_MSG); } catch (x) { e = new Error(OFF_MSG); }
    e.name = 'TypeError';
    e.message = OFF_MSG;
    e.code = 'doga_net_offline';
    e.dogaNet = true;
    return e;
  }

  /* ---------------- interceptor común de red ---------------- */
  var nFetch = typeof W.fetch === 'function' ? W.fetch : null;

  function noteBlocked(url) {
    st.blocked++;
    st.lastBlockedUrl = String(url || '');
    if (DOC) showToast();
  }

  if (nFetch) {
    W.fetch = function (input, init) {
      var url = '';
      var method = (init && init.method) || '';
      try {
        if (typeof input === 'string') url = input;
        else if (input && typeof input === 'object') {
          url = input.url || '';
          method = method || input.method || '';
        } else url = String(input);
      } catch (e) {}
      if (shouldBlock(url, method)) {
        noteBlocked(url);
        return Promise.reject(dnError());
      }
      return nFetch.apply(this, arguments);
    };
    W.fetch.__dogaNetNative = true;
  }

  // XMLHttpRequest: se marca la URL en open() y se corta en send() con un error de red.
  try {
    var XP = W.XMLHttpRequest && W.XMLHttpRequest.prototype;
    if (XP && XP.open && XP.send) {
      var xOpen = XP.open, xSend = XP.send;
      XP.open = function (method, url) {
        try { this.__dnUrl = url; this.__dnMethod = method; } catch (e) {}
        return xOpen.apply(this, arguments);
      };
      XP.send = function () {
        var self = this;
        if (shouldBlock(self.__dnUrl, self.__dnMethod)) {
          noteBlocked(self.__dnUrl);
          setTimeout(function () {
            try { Object.defineProperty(self, 'readyState', { value: 4, configurable: true }); } catch (e) {}
            try { Object.defineProperty(self, 'status', { value: 0, configurable: true }); } catch (e) {}
            try { Object.defineProperty(self, 'responseText', { value: '', configurable: true }); } catch (e) {}
            function ev(type) { try { return new W.Event(type); } catch (e) { return { type: type, target: self }; } }
            try { if (typeof self.onerror === 'function') self.onerror(ev('error')); } catch (e) {}
            try { if (typeof self.onloadend === 'function') self.onloadend(ev('loadend')); } catch (e) {}
            try { self.dispatchEvent(ev('error')); } catch (e) {}
            try { self.dispatchEvent(ev('loadend')); } catch (e) {}
          }, 0);
          return;
        }
        return xSend.apply(this, arguments);
      };
    }
  } catch (eXhr) {}

  // WebSocket: si está bloqueado devuelve un socket «muerto» que avisa con close 1006.
  try {
    var NativeWS = W.WebSocket;
    if (typeof NativeWS === 'function') {
      function DeadWS(url) {
        var self = this;
        this.url = String(url);
        this.readyState = 0;
        this.bufferedAmount = 0;
        this.protocol = '';
        this.extensions = '';
        this.onopen = null; this.onmessage = null; this.onerror = null; this.onclose = null;
        setTimeout(function () {
          self.readyState = 3;
          noteBlocked(self.url);
          try { if (typeof self.onerror === 'function') self.onerror({ type: 'error', target: self }); } catch (e) {}
          try { if (typeof self.onclose === 'function') self.onclose({ type: 'close', code: 1006, reason: 'Doganiero_Network desconectada', target: self, wasClean: false }); } catch (e) {}
        }, 0);
      }
      DeadWS.prototype.send = function () {};
      DeadWS.prototype.close = function () { this.readyState = 3; };
      DeadWS.prototype.addEventListener = function (t, fn) {
        if (t === 'close') this.onclose = fn;
        else if (t === 'error') this.onerror = fn;
        else if (t === 'message') this.onmessage = fn;
        else if (t === 'open') this.onopen = fn;
      };
      DeadWS.prototype.removeEventListener = function () {};
      DeadWS.prototype.dispatchEvent = function () { return true; };
      DeadWS.prototype.CONNECTING = 0; DeadWS.prototype.OPEN = 1; DeadWS.prototype.CLOSING = 2; DeadWS.prototype.CLOSED = 3;
      DeadWS.CONNECTING = 0; DeadWS.OPEN = 1; DeadWS.CLOSING = 2; DeadWS.CLOSED = 3;

      W.WebSocket = function (url, protocols) {
        if (shouldBlock(url)) return new DeadWS(url);
        if (protocols === undefined) return new NativeWS(url);
        return new NativeWS(url, protocols);
      };
      W.WebSocket.CONNECTING = 0; W.WebSocket.OPEN = 1; W.WebSocket.CLOSING = 2; W.WebSocket.CLOSED = 3;
      W.WebSocket.prototype = NativeWS.prototype;
    }
  } catch (eWs) {}

  // EventSource: igual, un objeto que falla y se cierra.
  try {
    var NativeES = W.EventSource;
    if (typeof NativeES === 'function') {
      function DeadES(url) {
        var self = this;
        this.url = String(url);
        this.readyState = 2;
        this.withCredentials = false;
        this.onopen = null; this.onmessage = null; this.onerror = null;
        setTimeout(function () {
          noteBlocked(self.url);
          try { if (typeof self.onerror === 'function') self.onerror({ type: 'error', target: self }); } catch (e) {}
        }, 0);
      }
      DeadES.prototype.close = function () { this.readyState = 2; };
      DeadES.prototype.addEventListener = function (t, fn) { if (t === 'error') this.onerror = fn; };
      DeadES.prototype.removeEventListener = function () {};
      DeadES.prototype.dispatchEvent = function () { return true; };
      DeadES.prototype.CONNECTING = 0; DeadES.prototype.OPEN = 1; DeadES.prototype.CLOSED = 2;
      NativeES.CONNECTING = 0; NativeES.OPEN = 1; NativeES.CLOSED = 2;
      W.EventSource = function (url) {
        if (shouldBlock(url)) return new DeadES(url);
        return new NativeES(url);
      };
      W.EventSource.prototype = NativeES.prototype;
    }
  } catch (eEs) {}

  // navigator.sendBeacon: false = el navegador no ha enviado nada (lo mismo que sin red).
  try {
    if (NAV && typeof NAV.sendBeacon === 'function') {
      var nBeacon = NAV.sendBeacon;
      NAV.sendBeacon = function (url) {
        if (shouldBlock(url, 'POST')) { noteBlocked(url); return false; }
        return nBeacon.apply(NAV, arguments);
      };
    }
  } catch (eBc) {}

  /* ---------------- ¿hay internet de verdad? ---------------- */
  function emit() {
    try {
      if (typeof W.CustomEvent === 'function') {
        W.dispatchEvent(new W.CustomEvent('doga-net', { detail: snapshot() }));
      }
    } catch (e) {}
  }

  function setReal(v, manual) {
    if (v === true) {
      st.fails = 0;
      st.real = true;
    } else if (manual) {
      st.real = false;           // comprobación pedida por el usuario: resultado inmediato
    } else {
      st.fails++;
      if (st.fails >= 2) st.real = false; // dos fallos seguidos para no cortar por un hipo
    }
    st.lastCheck = Date.now();
    updateUI();
    emit();
  }

  function check(opts) {
    var manual = !!(opts && opts.manual);
    var done = typeof (opts && opts.done) === 'function' ? opts.done : null;
    if (!st.on && !manual) return;   // con la red apagada no se comprueba nada
    if (!nFetch) { setReal(false, manual); if (done) done(false); return; }
    var ctl = null;
    var timer = 0;
    var finished = false;
    function finish(ok) {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      setReal(!!ok, manual);
      if (!ok && !manual && st.retryTimer) { /* ya hay reintento programado abajo */ }
      if (!ok && !manual) scheduleRetry();
      if (done) done(!!ok);
    }
    try { if (typeof W.AbortController === 'function') ctl = new W.AbortController(); } catch (e) {}
    timer = setTimeout(function () {
      try { if (ctl) ctl.abort(); } catch (e) {}
      finish(false);
    }, PING_TIMEOUT);
    try {
      nFetch.call(W, '/api/status?dogaNet=' + Date.now(), {
        cache: 'no-store',
        credentials: 'omit',
        signal: ctl ? ctl.signal : undefined
      }).then(function (r) {
        if (!r || !r.ok) { finish(false); return; }
        // response válida = hay servidor, es decir, hay internet
        finish(true);
      }).catch(function () { finish(false); });
    } catch (e) { finish(false); }
  }

  function scheduleRetry() {
    if (st.retryTimer || !st.on) return;
    st.retryTimer = setTimeout(function () {
      st.retryTimer = 0;
      check({ manual: false });
    }, 4000);
  }

  function startWatchers() {
    try {
      W.addEventListener('online', function () { check({ manual: true }); }, false);
      W.addEventListener('offline', function () { setReal(false, true); }, false);
      if (DOC) DOC.addEventListener('visibilitychange', function () {
        if (DOC.visibilityState === 'visible' && Date.now() - st.lastCheck > CHECK_MS) check({ manual: false });
      }, false);
    } catch (e) {}
    if (st.checkTimer) clearInterval(st.checkTimer);
    st.checkTimer = setInterval(function () {
      if (DOC && DOC.hidden) return;
      check({ manual: false });
    }, CHECK_MS);
    // login/logout sin recargar la página: cada perfil tiene su propio interruptor
    if (st.profileTimer) clearInterval(st.profileTimer);
    st.profileTimer = setInterval(syncProfile, 1500);
  }

  /* Cambió la cuenta (login/logout): carga el interruptor de ese perfil sin tocar los demás. */
  function syncProfile() {
    var p = profileTag();
    if (p === st.profile) return false;
    st.profile = p;
    var v = readOnStored();
    st.on = v === null ? true : v === '1';
    st.real = null;
    st.fails = 0;
    st.blocked = 0;
    st.lastBlockedUrl = '';
    st.connecting = false;
    st.connectToken++;
    hideOverlay();
    hideToast();
    updateUI();
    emit();
    if (st.on) check({ manual: false });
    return true;
  }

  /* ---------------- encender / apagar ---------------- */
  function set(on, opts) {
    on = !!on;
    var silent = !!(opts && opts.silent);
    if (on === false) {
      st.connecting = false;
      st.connectToken++;
      st.on = false;
      writeLS(onKey(), '0');
      closeOverlay();
      updateUI();
      emit();
      return Promise.resolve(false);
    }
    if (st.on && st.real === true && !st.connecting) {
      writeLS(onKey(), '1');
      updateUI();
      check({ manual: true });   // solo refresca el estado, sin animación
      return Promise.resolve(true);
    }
    // Encender: planeta girando + «Conectando…» mientras se comprueba internet real.
    var token = ++st.connectToken;
    st.connecting = true;
    var t0 = Date.now();
    if (!silent) openOverlay();
    updateUI();
    return new Promise(function (resolve) {
      check({
        manual: true,
        done: function (ok) {
          var wait = Math.max(0, CONNECT_MIN_MS - (Date.now() - t0));
          setTimeout(function () {
            if (token !== st.connectToken) { resolve(false); return; }
            st.connecting = false;
            st.on = true;
            writeLS(onKey(), '1');
            if (!silent) finishOverlay(ok);
            updateUI();
            emit();
            resolve(ok);
          }, wait);
        }
      });
    });
  }

  function toggle() { return set(!st.on); }

  function snapshot() {
    return {
      on: st.on,
      real: st.real,
      connected: isConnected(),
      connecting: st.connecting,
      blocked: st.blocked,
      state: stateKey()
    };
  }

  function stateKey() {
    if (st.connecting) return 'connecting';
    if (!st.on) return 'off';
    if (st.real === true) return 'online';
    if (st.real === false) return 'nointernet';
    return 'checking';
  }

  /* ---------------- estilos (se inyectan: no toca el CSS grande de index.html) ---------------- */
  var CSS = `
.dn-btn{ position:relative; }
.dn-btn svg{ width:20px; height:20px; display:block; }
.dn-btn .dn-dot{ position:absolute; right:6px; bottom:6px; width:7px; height:7px; border-radius:50%;
  background:#8b9a92; box-shadow:0 0 0 2px rgba(8,18,13,.85); transition:background .2s; }
.dn-btn[data-state="online"] .dn-dot{ background:#34d17a; box-shadow:0 0 0 2px rgba(8,18,13,.85), 0 0 8px #34d17a; }
.dn-btn[data-state="nointernet"] .dn-dot{ background:#ffb020; }
.dn-btn[data-state="checking"] .dn-dot{ background:#4aa3ff; animation:dn-pulse 1s infinite; }
.dn-btn[data-state="connecting"] .dn-dot{ background:#4aa3ff; animation:dn-pulse .7s infinite; }
.dn-btn[data-state="off"] .dn-dot{ background:#ff5d5d; }
.dn-btn[data-state="off"] svg{ opacity:.55; }
.dn-btn[data-state="off"]::after{ content:""; position:absolute; left:8px; right:8px; top:50%; height:2px;
  background:#ff5d5d; transform:rotate(-38deg); border-radius:2px; box-shadow:0 0 0 1.5px rgba(8,18,13,.85); }
@keyframes dn-pulse{ 0%,100%{ opacity:1; } 50%{ opacity:.25; } }
@keyframes dn-spin{ from{ transform:translateX(0); } to{ transform:translateX(-184px); } }
@keyframes dn-fade{ from{ opacity:0; } to{ opacity:1; } }
@keyframes dn-pop{ from{ opacity:0; transform:translateY(10px) scale(.97); } to{ opacity:1; transform:none; } }
@keyframes dn-bar{ from{ width:4%; } to{ width:96%; } }
@keyframes dn-rot{ from{ transform:rotate(0); } to{ transform:rotate(360deg); } }

/* Panel */
#dogaNetPanel{ position:fixed; z-index:2147482000; display:none; flex-direction:column; gap:10px;
  width:330px; max-width:calc(100vw - 16px); padding:14px 14px 12px; box-sizing:border-box;
  background:rgba(9,21,15,.97); color:#f4fff8; border:1px solid rgba(52,209,122,.35); border-radius:16px;
  box-shadow:0 18px 50px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06);
  font-family:var(--snake-font, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
}
#dogaNetPanel.open{ display:flex; animation:dn-pop .16s ease-out; }
#dogaNetPanel .dn-head{ display:flex; align-items:center; gap:10px; }
#dogaNetPanel .dn-head-ico{ width:36px; height:36px; flex:0 0 36px; border-radius:10px; display:grid; place-items:center;
  background:rgba(52,209,122,.14); border:1px solid rgba(52,209,122,.3); }
#dogaNetPanel .dn-head-ico svg{ width:20px; height:20px; }
#dogaNetPanel .dn-head-txt{ flex:1 1 auto; min-width:0; }
#dogaNetPanel .dn-name{ display:block; font-size:.95rem; font-weight:800; letter-spacing:.01em; }
#dogaNetPanel .dn-state{ display:flex; align-items:center; gap:6px; font-size:.76rem; font-weight:600; color:#a9c4b6; }
#dogaNetPanel .dn-led{ width:8px; height:8px; border-radius:50%; background:#8b9a92; flex:0 0 8px; }
#dogaNetPanel[data-state="online"] .dn-led{ background:#34d17a; box-shadow:0 0 8px #34d17a; }
#dogaNetPanel[data-state="nointernet"] .dn-led{ background:#ffb020; }
#dogaNetPanel[data-state="checking"] .dn-led,
#dogaNetPanel[data-state="connecting"] .dn-led{ background:#4aa3ff; animation:dn-pulse 1s infinite; }
#dogaNetPanel[data-state="off"] .dn-led{ background:#ff5d5d; }
#dogaNetPanel[data-state="online"] .dn-state{ color:#7CFFB0; }

/* Interruptor */
.dn-switch{ position:relative; width:48px; height:28px; flex:0 0 48px; padding:0; border-radius:999px; cursor:pointer;
  border:1px solid rgba(255,255,255,.16); background:rgba(255,255,255,.1); transition:background .2s, border-color .2s; }
.dn-switch i{ position:absolute; top:3px; left:3px; width:20px; height:20px; border-radius:50%; background:#e8f5ee;
  transition:transform .2s ease, background .2s; box-shadow:0 1px 3px rgba(0,0,0,.4); }
.dn-switch[aria-checked="true"]{ background:#22a35d; border-color:rgba(52,209,122,.7); }
.dn-switch[aria-checked="true"] i{ transform:translateX(20px); background:#fff; }
.dn-switch:focus-visible{ outline:2px solid #7CFFB0; outline-offset:2px; }
#dogaNetPanel.dn-busy .dn-switch{ opacity:.65; pointer-events:none; }
.qs-tile-ico svg, #qsNet svg{ width:18px; height:18px; display:inline-block; vertical-align:middle; }

#dogaNetPanel .dn-hint{ margin:0; font-size:.78rem; line-height:1.35; color:#c8ddd2; }
#dogaNetPanel .dn-list{ margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:3px;
  font-size:.74rem; color:#a9c4b6; max-height:132px; overflow:auto; }
#dogaNetPanel .dn-list li{ display:flex; gap:6px; align-items:center; }
#dogaNetPanel .dn-list li b{ font-weight:700; color:#d9f3e6; }
#dogaNetPanel .dn-list li span{ opacity:.55; }
#dogaNetPanel .dn-list li.ok b{ color:#7CFFB0; }
#dogaNetPanel .dn-list li.no b{ color:#ffb8b8; }
#dogaNetPanel .dn-list.locked li b{ color:#ffb8b8; }
#dogaNetPanel .dn-actions{ display:flex; gap:8px; }
#dogaNetPanel .dn-actions button{ flex:1 1 auto; padding:8px 10px; border-radius:10px; cursor:pointer; font-weight:700;
  font-size:.78rem; border:1px solid rgba(52,209,122,.35); background:rgba(52,209,122,.12); color:#c9ffe0; }
#dogaNetPanel .dn-actions button:hover{ background:rgba(52,209,122,.22); }
#dogaNetPanel .dn-legal{ margin:0; font-size:.68rem; line-height:1.3; color:#7f9a8c; }
body.theme-light #dogaNetPanel, body.light #dogaNetPanel{ background:rgba(248,252,250,.98); color:#0d1f16;
  border-color:rgba(13,120,70,.3); box-shadow:0 18px 50px rgba(0,40,20,.25); }
body.theme-light #dogaNetPanel .dn-state, body.light #dogaNetPanel .dn-state{ color:#3c6552; }
body.theme-light #dogaNetPanel .dn-hint, body.light #dogaNetPanel .dn-hint{ color:#274b3a; }
body.theme-light #dogaNetPanel .dn-list, body.light #dogaNetPanel .dn-list{ color:#3c6552; }
body.theme-light #dogaNetPanel .dn-actions button, body.light #dogaNetPanel .dn-actions button{ color:#0a5c34; }
body.theme-light #dogaNetPanel .dn-legal, body.light #dogaNetPanel .dn-legal{ color:#5c7a6b; }

/* Overlay «Conectando…» con el planeta */
#dogaNetOverlay{ position:fixed; inset:0; z-index:2147483000; display:none; align-items:center; justify-content:center;
  padding:16px; box-sizing:border-box; background:rgba(3,10,7,.72); animation:dn-fade .2s ease-out;
  backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
#dogaNetOverlay.open{ display:flex; }
#dogaNetOverlay .dn-ov-card{ width:340px; max-width:100%; padding:26px 22px 22px; border-radius:22px; text-align:center;
  background:radial-gradient(120% 120% at 50% 0%, #0d2318 0%, #071410 62%, #04100a 100%);
  border:1px solid rgba(52,209,122,.3); color:#f4fff8;
  box-shadow:0 30px 80px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.07);
  font-family:var(--snake-font, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif); }
#dogaNetOverlay .dn-globe-wrap{ position:relative; width:148px; height:148px; margin:0 auto 12px; }
#dogaNetOverlay .dn-globe{ width:148px; height:148px; display:block; filter:drop-shadow(0 10px 26px rgba(0,90,190,.45)); }
#dogaNetOverlay .dn-globe .dn-world{ animation:dn-spin 9s linear infinite; }
#dogaNetOverlay .dn-ov-ring{ position:absolute; inset:-12px; border-radius:50%; border:1px dashed rgba(124,255,176,.35);
  animation:dn-rot 14s linear infinite; pointer-events:none; }
#dogaNetOverlay .dn-ov-title{ margin:2px 0 2px; font-size:1.12rem; font-weight:800; letter-spacing:.01em; }
#dogaNetOverlay .dn-ov-sub{ margin:0 0 12px; font-size:.82rem; font-weight:700; color:#7CFFB0; letter-spacing:.04em; }
#dogaNetOverlay .dn-ov-bar{ height:4px; border-radius:999px; background:rgba(255,255,255,.12); overflow:hidden; margin:0 8px 12px; }
#dogaNetOverlay .dn-ov-bar i{ display:block; height:100%; width:4%; border-radius:999px;
  background:linear-gradient(90deg,#34d17a,#4aa3ff); animation:dn-bar 2.3s ease-out forwards; }
#dogaNetOverlay .dn-ov-note{ margin:0; font-size:.72rem; line-height:1.35; color:#93b3a4; }
#dogaNetOverlay .dn-ov-note b{ color:#c8ddd2; font-weight:700; }
#dogaNetOverlay[data-result="ok"] .dn-ov-title{ color:#7CFFB0; }
#dogaNetOverlay[data-result="ok"] .dn-ov-bar i{ animation:none; width:100%; background:#34d17a; }
#dogaNetOverlay[data-result="nointernet"] .dn-ov-title{ color:#ffc46b; }
#dogaNetOverlay[data-result="nointernet"] .dn-ov-bar i{ animation:none; width:100%; background:#ffb020; }
#dogaNetOverlay[data-result="ok"] .dn-ov-globe-ring,
#dogaNetOverlay[data-result="nointernet"] .dn-globe .dn-world{ animation-duration:28s; }

/* Aviso «Conéctate a Doganiero_Network…» */
#dogaNetToast{ position:fixed; z-index:2147482500; left:50%; bottom:74px; transform:translateX(-50%);
  display:none; align-items:center; gap:10px; max-width:min(520px, calc(100vw - 20px)); padding:10px 12px;
  border-radius:14px; box-sizing:border-box; background:rgba(32,12,14,.97); color:#ffe9e9;
  border:1px solid rgba(255,93,93,.5); box-shadow:0 14px 40px rgba(0,0,0,.5);
  font-family:var(--snake-font, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif); font-size:.82rem; }
#dogaNetToast.show{ display:flex; animation:dn-pop .18s ease-out; }
#dogaNetToast .dn-toast-ico{ flex:0 0 22px; width:22px; height:22px; display:grid; place-items:center;
  border-radius:50%; background:rgba(255,93,93,.18); font-size:.78rem; }
#dogaNetToast .dn-toast-txt{ flex:1 1 auto; line-height:1.3; font-weight:600; }
#dogaNetToast .dn-toast-btn{ flex:0 0 auto; padding:6px 11px; border-radius:9px; cursor:pointer; font-weight:800;
  font-size:.76rem; border:1px solid rgba(255,255,255,.25); background:#ff5d5d; color:#2a0708; }
#dogaNetToast .dn-toast-btn:hover{ background:#ff7d7d; }

/* Móvil y pantallas pequeñas */
@media (max-width: 720px){
  #dogaNetPanel{ left:8px; right:8px; width:auto; bottom:calc(72px + env(safe-area-inset-bottom, 0px)); }
  body.phone-mode #dogaNetPanel{ bottom:calc(104px + env(safe-area-inset-bottom, 0px)); }
  #dogaNetPanel .dn-list{ max-height:104px; }
  #dogaNetToast{ bottom:calc(78px + env(safe-area-inset-bottom, 0px)); font-size:.78rem; }
  body.phone-mode #dogaNetToast{ bottom:calc(110px + env(safe-area-inset-bottom, 0px)); }
  #dogaNetOverlay .dn-globe-wrap, #dogaNetOverlay .dn-globe{ width:120px; height:120px; }
  #dogaNetOverlay .dn-ov-card{ padding:22px 18px 18px; }
}
@media (prefers-reduced-motion: reduce){
  #dogaNetOverlay .dn-globe .dn-world, #dogaNetOverlay .dn-ov-ring{ animation:none; }
}
`;
/* ---------------- piezas SVG ---------------- */
  var SVG_WIFI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5.5 12.6a10 10 0 0 1 13 0"/>' +
    '<path d="M9 16.4a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r="1.3" fill="currentColor" stroke="none"/></svg>';

  var SVG_GLOBE =
    '<svg class="dn-globe" viewBox="0 0 220 220" role="img" aria-label="Planeta Tierra girando">' +
      '<defs>' +
        '<radialGradient id="dnOc" cx="36%" cy="30%" r="76%">' +
          '<stop offset="0" stop-color="#93e6ff"/><stop offset=".42" stop-color="#2f9ddb"/>' +
          '<stop offset=".78" stop-color="#0e5f96"/><stop offset="1" stop-color="#06314f"/>' +
        '</radialGradient>' +
        '<radialGradient id="dnSh" cx="33%" cy="27%" r="82%">' +
          '<stop offset="0" stop-color="#ffffff" stop-opacity=".42"/>' +
          '<stop offset=".34" stop-color="#ffffff" stop-opacity=".05"/>' +
          '<stop offset=".7" stop-color="#000814" stop-opacity=".24"/>' +
          '<stop offset="1" stop-color="#02060f" stop-opacity=".84"/>' +
        '</radialGradient>' +
        '<linearGradient id="dnIce" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#ffffff" stop-opacity=".95"/>' +
          '<stop offset="1" stop-color="#d3ecff" stop-opacity=".28"/>' +
        '</linearGradient>' +
        '<clipPath id="dnClip"><circle cx="110" cy="110" r="92"/></clipPath>' +
        '<filter id="dnGlow" x="-30%" y="-30%" width="160%" height="160%">' +
          '<feGaussianBlur stdDeviation="7"/></filter>' +
        '<g id="dnW1">' +
          '<path fill="#2f9e5b" d="M83.3,76.7 L83.8,70.5 L86.9,64.4 L88.9,56.2 L97.1,54.2 L102.2,59.3 L108.4,60.3 L109.9,68.5 L113.9,79.7 L118,80.8 L113.9,90 L113,95.1 L112.4,102.2 L110,112.4 L108.4,118.6 L105.4,126.8 L101.3,126.8 L98.2,110.4 L96.7,93 L93,86.9 L88.4,87.9 L85.4,83.8 Z"/>' +
          '<path fill="#d9b87a" opacity=".85" d="M89,57 L101,56 L106,62 L104,70 L97,72 L90,66 Z"/>' +
          '<path fill="#2b8a4e" d="M86.9,55.2 L92,47 L89.4,41.9 L93,39.9 L96.7,35.8 L94.6,29.6 L100.2,21.5 L107.3,19.4 L122.7,20.4 L138,14.3 L153.3,17.4 L169,20.4 L184,26.6 L178.9,31.7 L173.8,33.7 L166.2,47 L158.5,49.1 L154.4,52.1 L153.3,60.3 L148.2,71.6 L145.7,81.8 L143.1,78.7 L142.1,83.8 L140.6,75.6 L138,69.5 L135,70.5 L132.9,81.8 L131.4,83.8 L128.9,71.6 L126.9,67.5 L122.7,66.4 L121.2,69.5 L117.6,63.4 L116.6,61.3 L114.5,53.1 L110.4,55.2 L106.3,55.2 L102.2,51.1 L98.2,46 L93.5,49.1 Z"/>' +
          '<path fill="#c9a86d" opacity=".8" d="M112,58 L122,56 L128,62 L124,70 L114,68 Z"/>' +
          '<path fill="#c9a86d" opacity=".55" d="M128,72 L138,68 L142,76 L134,80 Z"/>' +
          '<path fill="#3aa064" d="M6.1,24.5 L10.2,19.4 L20.4,20.4 L30.7,18.4 L40.9,18.4 L51.1,17.4 L57.3,30.7 L63.4,40.9 L58.3,46 L56.2,50.1 L53.2,55.2 L50.6,65.4 L46,61.3 L42.4,65.4 L38.4,69.5 L33.2,60.3 L28.6,51.1 L28.1,41.9 L23,33.7 L15.3,31.7 Z"/>' +
          '<path fill="#3aa064" d="M50.6,83.8 L56.2,80.8 L61.3,81.8 L66.4,92 L74.1,98.1 L72.6,106.3 L67.5,117.6 L62.4,127.8 L60.3,132.9 L58.7,138 L57.1,145.1 L53.7,145.1 L54.7,138 L55.7,122.7 L56.2,110.4 L53.2,106.3 L50.6,97.1 Z"/>' +
          '<path fill="#1f7a44" opacity=".9" d="M56.6,102 L66,98 L72,104 L68,114 L60,118 L56,110 Z"/>' +
          '<path fill="#2f9e5b" d="M150.3,114.5 L154.4,109.4 L158.5,104.2 L162,104.2 L164.6,103.2 L166.7,111.4 L170.2,117.6 L168.7,129.8 L163.6,130.9 L158.5,124.7 L150.9,126.8 Z"/>' +
          '<path fill="#e8f6ff" d="M69,30.7 L80.8,20.4 L81.8,8.2 L69,7.2 L62.4,14.3 L63.4,24.5 Z"/>' +
          '<path fill="#2f9e5b" d="M113.9,104.2 L117.6,109.4 L116,117.6 L113.9,112.4 Z"/>' +
          '<path fill="#2f9e5b" d="M158.5,60.3 L164.6,51.1 L166.2,47 L163.6,55.2 L160,58.2 Z"/>' +
          '<path fill="#2f9e5b" d="M180.4,127.8 L183,130.9 L181,134 L177.4,138 Z"/>' +
          '<path fill="#e8f6ff" d="M79,24 L84,22 L88,24 L86,27 L80,26 Z"/>' +
          '<path fill="#eaf7ff" d="M0,158 C40,150 80,166 120,152 C150,142 170,158 184,150 L184,184 L0,184 Z"/>' +
        '</g>' +
        '<g id="dnC1" fill="#ffffff" opacity=".26">' +
          '<ellipse cx="24" cy="60" rx="17" ry="7"/><ellipse cx="44" cy="96" rx="12" ry="5"/>' +
          '<ellipse cx="70" cy="44" rx="14" ry="6"/><ellipse cx="96" cy="78" rx="18" ry="7"/>' +
          '<ellipse cx="120" cy="34" rx="15" ry="6"/><ellipse cx="140" cy="104" rx="20" ry="8"/>' +
          '<ellipse cx="162" cy="66" rx="13" ry="5"/><ellipse cx="176" cy="128" rx="16" ry="6"/>' +
        '</g>' +
      '</defs>' +
      '<circle cx="110" cy="110" r="100" fill="#2a7fff" opacity=".3" filter="url(#dnGlow)"/>' +
      '<circle cx="110" cy="110" r="92" fill="url(#dnOc)"/>' +
      '<g clip-path="url(#dnClip)">' +
        '<g class="dn-world"><use href="#dnW1"/><use href="#dnW1" x="184"/></g>' +
        '<g class="dn-clouds"><use href="#dnC1"/><use href="#dnC1" x="184"/></g>' +
        '<ellipse cx="110" cy="14" rx="94" ry="15" fill="url(#dnIce)"/>' +
        '<ellipse cx="110" cy="206" rx="94" ry="16" fill="url(#dnIce)"/>' +
        '<circle cx="110" cy="110" r="92" fill="url(#dnSh)"/>' +
      '</g>' +
      '<ellipse cx="76" cy="62" rx="27" ry="13" fill="#ffffff" opacity=".18" transform="rotate(-28 76 62)"/>' +
      '<circle cx="110" cy="110" r="92" fill="none" stroke="#a5e8ff" stroke-opacity=".45" stroke-width="1.4"/>' +
    '</svg>';


  /* ---------------- textos ---------------- */
  var T = {
    name: 'Doganiero_Network',
    connecting: 'Conectando…',
    online: 'Conectado · internet disponible',
    nointernet: 'Sin internet real',
    checking: 'Comprobando…',
    off: 'Desconectado',
    hintOnline: 'Red encendida con internet real: las funciones online usan la conexión del dispositivo.',
    hintOff: 'Red apagada: las funciones online están bloqueadas, como sin wifi. Las apps locales siguen funcionando.',
    hintNo: 'La red está encendida, pero no hay internet real: las funciones online siguen bloqueadas.',
    hintChecking: 'Comprobando la conexión real del dispositivo…',
    recheck: 'Comprobar de nuevo',
    reconnect: 'Reconectar',
    qs: 'Ajustes rápidos',
    toastBtn: 'Conectar',
    panelAria: 'Doganiero_Network: red wifi de Snake OS',
    switchAria: 'Encender o apagar Doganiero_Network',
    btnTitle: 'Doganiero_Network: red wifi de Snake OS',
    legal: 'Red wifi de Snake OS: refleja la conexión real del dispositivo. Nunca se dice que hay internet cuando no lo hay.',
    ovSub: 'Doganiero_Network',
    ovNoteOn: 'Snake OS comprueba la conexión real del dispositivo mientras el planeta gira…',
    ovOk: 'Conectado',
    ovNo: 'Sin internet real',
    ovNoteOk: 'Ya puedes usar las funciones online. Las apps locales siguen funcionando igual.',
    ovNoteNo: 'La red queda encendida, pero las funciones online seguirán bloqueadas hasta que haya internet real.',
    listOnline: 'Online: clima, chat, correo, TV, bots, tienda',
    listLocal: 'Local: escritorio, notas, calculadora, archivos, editor'
  };

  /* ---------------- utilidades de interfaz ---------------- */
  function q(sel, root) { try { return (root || DOC).querySelector(sel); } catch (e) { return null; } }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function isConnected() { return st.on && st.real === true; }

  function stateText() {
    var k = stateKey();
    if (k === 'online') return T.online;
    if (k === 'nointernet') return T.nointernet;
    if (k === 'connecting') return T.connecting;
    if (k === 'checking') return T.checking;
    return T.off;
  }

  function stateHint() {
    var k = stateKey();
    if (k === 'online') return T.hintOnline;
    if (k === 'nointernet') return T.hintNo;
    if (k === 'off') return T.hintOff;
    return T.hintChecking;
  }

  function listHtml() {
    var online = isConnected();
    return '<li class="' + (online ? 'ok' : 'no') + '"><b aria-hidden="true">' + (online ? '✓' : '✕') + '</b>' + esc(T.listOnline) + '</li>' +
      '<li class="ok"><b aria-hidden="true">✓</b>' + esc(T.listLocal) + '</li>';
  }


  /* ---------------- montaje de la interfaz ---------------- */
  var UI = { css: false, btn: null, panel: null, ov: null, toast: null, tile: null, toastTimer: 0, ovTimer: 0, ovAuto: 0, outsideBound: false };

  function injectCss() {
    if (UI.css || !DOC) return;
    try {
      var old = DOC.getElementById('dogaNetCss');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var s = DOC.createElement('style');
      s.id = 'dogaNetCss';
      s.textContent = CSS;
      (DOC.head || DOC.documentElement).appendChild(s);
      UI.css = true;
    } catch (e) {}
  }

  function panelHtml() {
    return '<div class="dn-head">' +
        '<span class="dn-head-ico" aria-hidden="true">' + SVG_WIFI + '</span>' +
        '<span class="dn-head-txt">' +
          '<span class="dn-name">' + esc(T.name) + '</span>' +
          '<span class="dn-state"><i class="dn-led" aria-hidden="true"></i><span class="dn-state-txt"></span></span>' +
        '</span>' +
        '<button type="button" class="dn-switch" role="switch" aria-checked="true" aria-label="' + esc(T.switchAria) + '"><i aria-hidden="true"></i></button>' +
      '</div>' +
      '<p class="dn-hint"></p>' +
      '<ul class="dn-list"></ul>' +
      '<div class="dn-actions">' +
        '<button type="button" class="dn-recheck"></button>' +
        '<button type="button" class="dn-qs">' + esc(T.qs) + '</button>' +
      '</div>' +
      '<p class="dn-legal">' + esc(T.legal) + '</p>';
  }

  function overlayHtml() {
    return '<div class="dn-ov-card" role="status" aria-live="polite">' +
        '<div class="dn-globe-wrap"><span class="dn-ov-ring" aria-hidden="true"></span>' + SVG_GLOBE + '</div>' +
        '<p class="dn-ov-title">' + esc(T.connecting) + '</p>' +
        '<p class="dn-ov-sub">' + esc(T.ovSub) + '</p>' +
        '<div class="dn-ov-bar" aria-hidden="true"><i></i></div>' +
        '<p class="dn-ov-note">' + esc(T.ovNoteOn) + '</p>' +
      '</div>';
  }

  function ensureUI() {
    if (!DOC || !DOC.body) return;
    injectCss();
    ensureBarButton();
    ensurePanel();
    ensureTile();
    ensureToast();
    ensureOverlay();
    bindOutside();
    updateUI();
  }

  // 1) Botón en la barra de tareas (junto a los ajustes rápidos).
  function ensureBarButton() {
    if (UI.btn) return;
    var b = DOC.createElement('button');
    b.type = 'button';
    b.id = 'tbNetBtn';
    b.className = 'tb-tool dn-btn';
    b.title = T.btnTitle;
    b.setAttribute('aria-label', T.btnTitle);
    b.setAttribute('data-state', stateKey());
    b.innerHTML = SVG_WIFI + '<i class="dn-dot" aria-hidden="true"></i>';
    b.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      togglePanel();
    });
    var tools = q('#tbTools');
    if (tools) tools.appendChild(b);
    else {
      var tb = q('#taskbar');
      if (tb) tb.appendChild(b);
    }
    UI.btn = b;
  }

  // 2) Panel del interruptor (encima de la barra, alineado con el botón).
  function ensurePanel() {
    if (UI.panel) return;
    var p = DOC.createElement('div');
    p.id = 'dogaNetPanel';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', T.panelAria);
    p.setAttribute('data-state', stateKey());
    p.innerHTML = panelHtml();
    DOC.body.appendChild(p);
    var sw = q('.dn-switch', p);
    if (sw) sw.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      set(!st.on);
    });
    var re = q('.dn-recheck', p);
    if (re) re.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      set(true); // reconectar o comprobar otra vez (con la animación del planeta)
    });
    var qsBtn = q('.dn-qs', p);
    if (qsBtn) qsBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      closePanel();
      var tbQs = q('#tbQsBtn');
      if (tbQs) { try { tbQs.click(); } catch (e) {} }
    });
    UI.panel = p;
  }
  // 3) Tile en Ajustes rápidos (misma red, otro acceso).
  function ensureTile() {
    if (UI.tile) return;
    var grid = q('#qsGrid');
    if (!grid) return;
    var tile = DOC.createElement('button');
    tile.type = 'button';
    tile.className = 'qs-tile';
    tile.id = 'qsNet';
    tile.setAttribute('aria-pressed', isConnected() ? 'true' : 'false');
    tile.innerHTML = '<span class="qs-tile-ico" aria-hidden="true">' + SVG_WIFI + '</span>' +
      '<span class="qs-tile-lab">' + esc(T.name) + '</span>';
    tile.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      toggle();
    });
    grid.appendChild(tile);
    UI.tile = tile;
  }

  // 4) Aviso «Conéctate a Doganiero_Network para usar esta función».
  function ensureToast() {
    if (UI.toast || !DOC || !DOC.body) return;
    var t = DOC.createElement('div');
    t.id = 'dogaNetToast';
    t.setAttribute('role', 'alert');
    t.innerHTML = '<span class="dn-toast-ico" aria-hidden="true">📶</span>' +
      '<span class="dn-toast-txt">' + esc(OFF_MSG) + '</span>' +
      '<button type="button" class="dn-toast-btn">' + esc(T.toastBtn) + '</button>';
    var tBtn = q('.dn-toast-btn', t);
    if (tBtn) tBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      hideToast();
      set(true);
    });
    DOC.body.appendChild(t);
    UI.toast = t;
  }

  // 5) Pantalla completa «Conectando…» con el planeta.
  function ensureOverlay() {
    if (UI.ov || !DOC || !DOC.body) return;
    var ov = DOC.createElement('div');
    ov.id = 'dogaNetOverlay';
    ov.setAttribute('aria-hidden', 'true');
    ov.innerHTML = overlayHtml();
    DOC.body.appendChild(ov);
    UI.ov = ov;
  }

  // Cerrar el panel al pulsar fuera o con Escape.
  function bindOutside() {
    if (UI.outsideBound) return;
    UI.outsideBound = true;
    DOC.addEventListener('click', function (ev) {
      if (!UI.panel || !UI.panel.classList.contains('open')) return;
      var tgt = ev.target;
      if (UI.panel.contains(tgt)) return;
      if (UI.btn && (UI.btn === tgt || UI.btn.contains(tgt))) return;
      closePanel();
    }, true);
    DOC.addEventListener('keydown', function (ev) {
      if (!ev || ev.key !== 'Escape') return;
      if (UI.ov && UI.ov.classList.contains('open')) { hideOverlay(); return; }
      closePanel();
    }, true);
  }


  /* ---------------- refresco de la interfaz ---------------- */
  function updateUI() {
    if (!DOC) return;
    var key = stateKey();
    if (UI.btn) UI.btn.setAttribute('data-state', key);
    if (UI.panel) {
      UI.panel.setAttribute('data-state', key);
      try { UI.panel.classList.toggle('dn-busy', !!st.connecting); } catch (e) {}
      var sw = q('.dn-switch', UI.panel);
      if (sw) {
        sw.setAttribute('aria-checked', st.on ? 'true' : 'false');
        sw.setAttribute('aria-busy', st.connecting ? 'true' : 'false');
      }
      var stx = q('.dn-state-txt', UI.panel);
      if (stx) stx.textContent = stateText();
      var hint = q('.dn-hint', UI.panel);
      if (hint) hint.textContent = stateHint();
      var list = q('.dn-list', UI.panel);
      if (list) {
        var html = listHtml();
        if (list.__dnHtml !== html) { list.innerHTML = html; list.__dnHtml = html; }
      }
      var re = q('.dn-recheck', UI.panel);
      if (re) {
        re.textContent = st.on ? T.recheck : T.reconnect;
        re.disabled = !!st.connecting;
      }
    }
    if (UI.tile) UI.tile.setAttribute('aria-pressed', isConnected() ? 'true' : 'false');
  }

  function placePanel() {
    var p = UI.panel, b = UI.btn;
    if (!p) return;
    var vw = W.innerWidth || 1024;
    var vh = W.innerHeight || 768;
    if (vw <= 720 || !b || typeof b.getBoundingClientRect !== 'function') {
      p.style.left = ''; p.style.right = ''; p.style.bottom = ''; p.style.top = '';
      return;
    }
    var bb = b.getBoundingClientRect();
    var w = p.offsetWidth || 330;
    var left = Math.min(Math.max(8, bb.left + bb.width / 2 - w / 2), Math.max(8, vw - w - 8));
    var bottom = Math.max(8, vh - bb.top + 8);
    p.style.left = Math.round(left) + 'px';
    p.style.right = 'auto';
    p.style.bottom = Math.round(bottom) + 'px';
    p.style.top = 'auto';
  }

  function openPanel() {
    ensureUI();
    if (!UI.panel) return;
    UI.panel.classList.add('open');
    placePanel();
    updateUI();
  }

  function closePanel() {
    if (UI.panel) UI.panel.classList.remove('open');
  }

  function togglePanel() {
    ensureUI();
    if (UI.panel && UI.panel.classList.contains('open')) closePanel();
    else openPanel();
  }

  /* ---------------- pantalla «Conectando…» ---------------- */
  function openOverlay() {
    ensureUI();
    var ov = UI.ov;
    if (!ov) return;
    ov.removeAttribute('data-result');
    var title = q('.dn-ov-title', ov);
    if (title) title.textContent = T.connecting;
    var note = q('.dn-ov-note', ov);
    if (note) note.textContent = T.ovNoteOn;
    var bar = q('.dn-ov-bar', ov);
    if (bar) bar.innerHTML = '<i></i>';   // la barra vuelve a empezar
    ov.classList.add('open');
    ov.setAttribute('aria-hidden', 'false');
    if (UI.ovAuto) clearTimeout(UI.ovAuto);
    UI.ovAuto = setTimeout(function () {  // nunca tapar el escritorio para siempre
      UI.ovAuto = 0;
      if (!st.connecting) hideOverlay();
    }, 12000);
  }

  function finishOverlay(ok) {
    var ov = UI.ov;
    if (!ov) return;
    ov.setAttribute('data-result', ok ? 'ok' : 'nointernet');
    var title = q('.dn-ov-title', ov);
    if (title) title.textContent = ok ? T.ovOk : T.ovNo;
    var note = q('.dn-ov-note', ov);
    if (note) note.textContent = ok ? T.ovNoteOk : T.ovNoteNo;
    if (UI.ovAuto) { clearTimeout(UI.ovAuto); UI.ovAuto = 0; }
    if (UI.ovTimer) clearTimeout(UI.ovTimer);
    UI.ovTimer = setTimeout(function () { UI.ovTimer = 0; hideOverlay(); }, 1200);
  }

  function hideOverlay() {
    var ov = UI.ov;
    if (ov) {
      ov.classList.remove('open');
      ov.setAttribute('aria-hidden', 'true');
    }
    if (UI.ovTimer) { clearTimeout(UI.ovTimer); UI.ovTimer = 0; }
    if (UI.ovAuto) { clearTimeout(UI.ovAuto); UI.ovAuto = 0; }
  }
  var closeOverlay = hideOverlay; // alias que usa set(false)

  /* ---------------- aviso de función online ---------------- */
  function showToast() {
    if (!DOC || !DOC.body) return;
    ensureToast();
    var t = UI.toast;
    if (!t) return;
    t.classList.add('show');
    if (UI.toastTimer) clearTimeout(UI.toastTimer);
    UI.toastTimer = setTimeout(function () {
      UI.toastTimer = 0;
      if (UI.toast) UI.toast.classList.remove('show');
    }, 7000);
  }

  function hideToast() {
    if (UI.toast) UI.toast.classList.remove('show');
    if (UI.toastTimer) { clearTimeout(UI.toastTimer); UI.toastTimer = 0; }
  }

  /* ---------------- API pública (window.DogaNet) ---------------- */
  var api = {
    __installed: true,
    version: '2026.18',
    msg: OFF_MSG,
    isOn: function () { return !!st.on; },
    hasInternet: function () { return st.real === true; },
    isConnected: isConnected,
    state: snapshot,
    set: set,
    toggle: toggle,
    profile: profileTag,
    syncProfile: syncProfile,
    check: function () {
      return new Promise(function (resolve) { check({ manual: true, done: resolve }); });
    },
    /* Para funciones online de otras apps: true si se pueden usar; si no, avisa. */
    requireOnline: function (name) {
      if (isConnected()) return true;
      try { st.lastWanted = String(name || ''); } catch (e) {}
      showToast();
      return false;
    },
    isOnlineRequest: isOnlineRequest,
    openPanel: openPanel,
    closePanel: closePanel,
    /* Suscripción al estado: devuelve la función para desuscribirse. */
    on: function (fn) {
      if (typeof fn !== 'function') return function () {};
      var h = function (ev) { try { fn(ev && ev.detail ? ev.detail : snapshot()); } catch (e) {} };
      try { W.addEventListener('doga-net', h, false); } catch (e) {}
      return function () { try { W.removeEventListener('doga-net', h, false); } catch (e) {} };
    }
  };
  W.DogaNet = api;
  W.dogaNet = api; // atajo
  try { if (typeof module !== 'undefined' && module && module.exports) module.exports = api; } catch (e) {}

  /* ---------------- arranque ---------------- */
  function init() {
    if (!DOC) return;
    ensureUI();
    startWatchers();
    updateUI();
    if (st.on) check({ manual: false }); // comprueba internet real sin animación
  }

  if (DOC) {
    injectCss(); // el estilo puede entrar ya: no depende del DOM
    if (DOC.readyState === 'loading') DOC.addEventListener('DOMContentLoaded', init, false);
    else setTimeout(init, 0);
  }
})();
