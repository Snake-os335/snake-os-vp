/* Snake OS · sonido de notificación (campanilla original de 3 tonos, generada por código).
   No se usa para llamadas. Respeta «No molestar» (Ajustes rápidos) y localStorage snkNotifSound='0'.
   Segundo plano: un único AudioContext desbloqueado con el primer gesto y mantenido vivo;
   la campanilla se programa con ctx.currentTime (sin cadenas de setTimeout, que el navegador frena). */
(function () {
  var SRC = '/static/assets/notif-chime.wav?v=202610160830';
  var VOL = 0.3, base = null, last = 0, ctx = null, buf = null, loading = false, keep = null;
  function muted() {
    try { if (document.body && document.body.classList.contains('qs-dnd')) return true; } catch (e) {}
    try { if (localStorage.getItem('snkNotifSound') === '0') return true; } catch (e) {}
    return false;
  }
  function getCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; return null; }
    try {
      /* Ganancia 0 continua: mantiene el contexto «sonando» para que el navegador no lo suspenda. */
      var g = ctx.createGain(); g.gain.value = 0; g.connect(ctx.destination);
      var o = ctx.createOscillator(); o.connect(g); o.start(); keep = o;
    } catch (e) {}
    return ctx;
  }
  function wake() {
    var c = ctx; if (!c) return null;
    try { if (c.state !== 'running' && c.resume) { var p = c.resume(); if (p && p.catch) p.catch(function () {}); } } catch (e) {}
    return c;
  }
  function load() {
    if (buf || loading || !ctx || !window.fetch) return;
    loading = true;
    fetch(SRC).then(function (r) { return r.arrayBuffer(); }).then(function (ab) {
      return new Promise(function (ok, ko) { var p = ctx.decodeAudioData(ab, ok, ko); if (p && p.then) p.then(ok, ko); });
    }).then(function (b) { buf = b; }).catch(function () {}).then(function () { loading = false; });
  }
  function unlock() {
    if (!getCtx()) return;
    wake(); load();
  }
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach(function (ev) {
    try { window.addEventListener(ev, unlock, { capture: true, passive: true }); } catch (e) {}
  });
  document.addEventListener('visibilitychange', function () { wake(); });
  window.addEventListener('focus', function () { wake(); });
  window.addEventListener('pageshow', function () { wake(); });
  function playBuf() {
    var c = wake(); if (!c || !buf) return false;
    /* 'suspended' / 'interrupted' (Safari): resume() ya pedido; si no arranca, no sonará este aviso. */
    try {
      var t = c.currentTime + 0.02;
      var s = c.createBufferSource(); s.buffer = buf;
      /* Más suave: filtro paso bajo (quita lo chillón) + volumen 30 % con entrada suave. */
      var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
      var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(VOL, t + 0.04);
      s.connect(f); f.connect(g); g.connect(c.destination);
      s.start(t);
      return true;
    } catch (e) { return false; }
  }
  function playTag() {
    try {
      if (!base) { base = new Audio(SRC); base.preload = 'auto'; }
      var a = base.cloneNode(); a.volume = VOL;
      try { a.setAttribute('playsinline', 'true'); } catch (e) {}
      var p = a.play(); if (p && p.catch) p.catch(function () {});
      return true;
    } catch (e) { return false; }
  }
  function play() {
    if (muted()) return false;
    var now = Date.now(); if (now - last < 1200) return false; last = now;
    if (ctx && buf && playBuf()) return true;
    return playTag();
  }
  try { base = new Audio(SRC); base.preload = 'auto'; } catch (e) {}
  window.snakeNotifSound = play;
})();
