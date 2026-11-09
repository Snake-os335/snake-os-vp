/* Doga Gorilla — la página (2026.31)
 *
 * Manda sobre el juego (doga-gorilla.js): elige mundo, entra en VR, abre la vista
 * previa del PC, sale y pinta el estado que va llegando.
 */
(function () {
  'use strict';

  var G = window.DogaGorilla;
  function el(id) { return document.getElementById(id); }

  var stage = el('stage');
  var goBtn = el('go');
  var prevBtn = el('prev');
  var outBtn = el('out');
  var stEl = el('st');
  var stTxt = el('stTxt');
  var logEl = el('log');
  var toastEl = el('toast');
  var worldHint = el('worldHint');

  var HINTS = {
    prado: 'Isla flotante con molinos, setas saltarinas y nubes blanditas.',
    caramelo: 'Colinas de helado, gelatinas que rebotan y caramelos por el aire.',
    cristal: 'Selva de cristal: piedras que se encienden y luciérnagas de colores.'
  };

  var world = 'prado';
  var lastMsg = '';
  var busy = false;

  try { document.body.classList.remove('pre'); } catch (e) {}

  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = String(text || '');
    toastEl.classList.add('on');
    if (toast._t) clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove('on'); }, 5000);
  }

  function addLog(text) {
    if (!logEl || !text) return;
    text = String(text);
    if (text === lastMsg) return;
    lastMsg = text;
    var li = document.createElement('li');
    li.textContent = text;
    logEl.insertBefore(li, logEl.firstChild);
    while (logEl.children.length > 8) logEl.removeChild(logEl.lastChild);
  }

  function pill(kind, text) {
    if (!stEl) return;
    stEl.className = 'status' + (kind ? ' ' + kind : '');
    if (stTxt) stTxt.textContent = text;
  }

  function fmt(n) { return (Math.round((n || 0) * 10) / 10).toFixed(1); }

  /* Pinta todo lo que manda el juego. */
  function paint(s) {
    if (!s) return;
    var K = {
      kWorld: s.worldName || '—',
      kOrbs: (s.orbs || 0) + '/' + (s.orbsTotal || 0),
      kBells: String(s.bells || 0),
      kBounces: String(s.bounces || 0),
      kSpeed: fmt(s.speed) + ' m/s',
      kGround: s.running ? (s.onGround ? 'sí' : 'aire') : '—',
      kBody: s.running ? (s.grabbing ? '🖐️ trepando' : (s.body ? '🦍 monke' : '—')) : '—'
    };
    for (var k in K) {
      if (!Object.prototype.hasOwnProperty.call(K, k)) continue;
      var node = el(k);
      if (node) node.textContent = K[k];
    }
    if (s.running) {
      pill('on', (s.xr ? 'en VR' : 'vista previa') + ' · ' + (s.worldName || ''));
      if (outBtn) outBtn.disabled = false;
    }
    if (s.msg) addLog(s.msg);
  }

  function showStage(on) {
    if (stage) stage.classList.toggle('on', !!on);
    try { document.body.classList.toggle('playing', !!on); } catch (e) {}
  }

  function released() {
    busy = false;
    showStage(false);
    if (outBtn) outBtn.disabled = true;
    if (goBtn) goBtn.disabled = !(G && G.supported());
    if (prevBtn) prevBtn.disabled = false;
    pill('', 'fuera · elige mundo y entra');
  }

  function onEnd(reason) {
    addLog('sesión cerrada' + (reason && reason !== 'ended' ? ' (' + reason + ')' : ''));
    released();
  }

  function fail(where, err) {
    busy = false;
    showStage(false);
    if (outBtn) outBtn.disabled = true;
    if (goBtn) goBtn.disabled = !(G && G.supported());
    if (prevBtn) prevBtn.disabled = false;
    pill('', 'fuera');
    var msg = err && err.message ? err.message : String(err || 'error');
    addLog(where + ': ' + msg);
    toast(where + ': ' + msg);
  }

  function enterVR() {
    if (busy) return;
    if (!G) return toast('El juego no se ha cargado (doga-gorilla.js).');
    if (!G.supported()) {
      return toast('Este navegador no tiene WebXR. Ábrelo en el visor o usa la vista previa del PC.');
    }
    busy = true;
    if (goBtn) goBtn.disabled = true;
    try { if (G.state().running) G.stop(); } catch (e) {}
    showStage(true);
    pill('busy', 'entrando en VR…');
    addLog('pidiendo la sesión de VR al visor…');
    G.start({
      host: stage,
      world: world,
      onState: paint,
      onLog: addLog,
      onEnd: onEnd
    }).then(function (s) {
      busy = false;
      if (outBtn) outBtn.disabled = false;
      pill('on', 'en VR · ' + (s && s.worldName ? s.worldName : ''));
      addLog('¡dentro! brazos largos: manos al suelo y arrastra para andar');
    }).catch(function (err) {
      fail('VR', err);
    });
  }

  function enterPreview() {
    if (busy) return;
    if (!G) return toast('El juego no se ha cargado (doga-gorilla.js).');
    busy = true;
    if (prevBtn) prevBtn.disabled = true;
    try { if (G.state().running) G.stop(); } catch (e) {}
    showStage(true);
    pill('busy', 'abriendo la vista previa…');
    G.startPreview(stage, {
      world: world,
      onState: paint,
      onLog: addLog,
      onEnd: onEnd
    }).then(function () {
      busy = false;
      if (outBtn) outBtn.disabled = false;
      pill('busy', 'vista previa · WASD para andar');
    }).catch(function (err) {
      fail('vista previa', err);
    });
  }

  function leave() {
    busy = false;
    if (G) {
      try { G.stop(); } catch (e) {}
    }
    released();
    addLog('has salido. ¡Hasta la próxima!');
  }

  function pickWorld(name) {
    if (!HINTS[name]) return;
    world = name;
    var btns = document.querySelectorAll('#worlds button');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      b.setAttribute('aria-pressed', b.getAttribute('data-world') === name ? 'true' : 'false');
    }
    if (worldHint) worldHint.textContent = HINTS[name];
    if (G && G.world) {
      try { G.world(name); } catch (e) {}
    }
    addLog('mundo elegido: ' + name);
  }

  /* ------------------------------------------------------------- arranque */
  if (!G) {
    pill('', 'el juego no se ha cargado');
    toast('No encuentro /static/doga-gorilla.js. Recarga la página.');
    if (goBtn) goBtn.disabled = true;
    if (prevBtn) prevBtn.disabled = true;
    return;
  }

  var verNode = el('ver');
  if (verNode) verNode.textContent = 'DogaGorilla ' + (G.version || '');

  if (G.supported()) {
    pill('', 'WebXR listo · esperando');
  } else {
    pill('', 'sin WebXR aquí · usa el visor o la vista previa');
    if (goBtn) goBtn.disabled = true;
  }

  if (prevBtn) prevBtn.addEventListener('click', enterPreview);
  if (goBtn) goBtn.addEventListener('click', enterVR);
  if (outBtn) outBtn.addEventListener('click', leave);
  var floatBtn = el('exitFloat');
  if (floatBtn) floatBtn.addEventListener('click', leave);

  var worldBtns = document.querySelectorAll('#worlds button');
  for (var w = 0; w < worldBtns.length; w++) {
    worldBtns[w].addEventListener('click', function () {
      pickWorld(this.getAttribute('data-world'));
    });
  }

  /* Si el visor cierra la sesión con su menú, la página se entera. */
  window.addEventListener('pagehide', function () {
    if (G) { try { G.stop(); } catch (e) {} }
  });

  pickWorld(world);
  paint(G.state());
})();

