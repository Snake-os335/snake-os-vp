/* Snake OS · Snake VR — realidad virtual para gafas VR (2026.22).
 *
 * Qué hace:
 *  - Jungla viva en 3D con three.js (local, /static/assets/three-r160.min.js): suelo de
 *    musgo, árboles, helechos, lianas y serpientes que se arrastran por todas partes,
 *    más una pantalla gigante «espejo» de tu escritorio.
 *  - La pantalla espejo pinta el escritorio REAL completo (cada fondo, borde, texto,
 *    icono, imagen y canvas de las apps tal y como están en el ordenador) y refresca
 *    ~14 veces por segundo, no una foto vieja.
 *  - Dentro de la pantalla todo funciona igual que con el ratón del PC: clic, doble
 *    clic (abrir), clic derecho (menú contextual), arrastrar ventanas e iconos,
 *    rueda/stick para desplazar listas y foco en los campos de texto. Los eventos se
 *    inyectan como PointerEvent/MouseEvent/WheelEvent reales (raycast → uv → píxel →
 *    elementFromPoint).
 *  - Una serpiente tótem te sigue flotando: al pulsarla (o morderla con el mando) se
 *    abre el escritorio en la pantalla gigante y al volver a pulsarla se cierra.
 *  - En WebXR los DOS mandos son serpientes con ojos y lengua bífida: el rayo sale de su
 *    boca, el gatillo «muerde» (clic real en el DOM) y apuntar al suelo teletransporta.
 *  - Tres modos: ratón/teclado (mono), estereoscópico para gafas de cartón (SBS) y
 *    WebXR immersive-vr real (Meta Quest / PCVR).
 *  - Giroscopio del móvil (deviceorientation) para mirar moviendo la cabeza.
 *
 * Sin dependencias nuevas: usa el three.js que ya sirve Snake OS y el DOM existente.
 * API: window.SnakeVR.open({sbs,xr}), .close(), .supported(), .toggleScreen(),
 *      .setScreenOpen(bool), .isScreenOpen, window.renderSnakeVrApp(body).
 */
(function (global) {
  'use strict';

  var VR_VERSION = '2026.22';
  var THREE_URL = '/static/assets/three-r160.min.js?v=r160';
  var LS_KEY = 'snkVRprefs';
  var MIRROR_W = 1600, MIRROR_H = 1000;
  var INFO_W = 512, INFO_H = 720;

  var st = {
    open: false,
    root: null,
    canvas: null,
    hud: null,
    pad: null,
    three: null,
    loadP: null,
    renderer: null,
    scene: null,
    rig: null,
    camera: null,
    camL: null,
    camR: null,
    mirrorMesh: null,
    mirrorCanvas: null,
    mirrorCtx: null,
    mirrorTex: null,
    mirrorLast: 0,
    infoLast: 0,
    leftCanvas: null,
    leftCtx: null,
    leftTex: null,
    rightCanvas: null,
    rightCtx: null,
    rightTex: null,
    floorMesh: null,
    starField: null,
    frameMesh: null,
    screenGroup: null,       // pantalla + marco + halo (se abre/cierra con el tótem)
    screenOpen: false,       // el escritorio empieza CERRADO: hay que morder al tótem
    screenAnim: 0,           // 0..1 animación de apertura/cierre
    jungle: null,            // árboles, helechos y lianas de la jungla
    lianas: [],              // lianas que se mecen
    ambient: [],             // serpientes que se arrastran por la jungla
    fireflies: null,         // luciérnagas
    spirit: null,            // serpiente tótem que te sigue (abre/cierra)
    handSnakes: [],          // las dos serpientes de los mandos XR
    rc: null,                // raycaster reutilizado para los punteros XR
    tmpV: null, tmpV2: null, tmpQ: null, tmpM: null,
    tickN: 0,
    mode: 'mono',            // mono | sbs | xr
    yaw: 0, pitch: -0.05,
    zoom: 3.4,               // z del rig (distancia al panel)
    keys: {},
    pointer: null,
    dragMoved: 0,
    lastTap: 0,
    deskDrag: null,          // pulsación activa sobre la pantalla (arrastre real del DOM)
    deskLastTap: null,       // último clic en la pantalla (para el doble clic)
    domStyles: null,         // caché de getComputedStyle para el espejo (Map)
    domBudget: 3200,         // nodos máximos que se pintan por fotograma del espejo
    paintEvery: 0.09,        // segundos entre repintados del espejo (adaptativo)
    paintCost: 0,            // duración del último repintado
    gyro: false,
    gyroBase: null,
    gyroHandler: null,
    xrSession: null,
    xrControllers: [],
    xrReady: false,
    onKeyDown: null,
    onKeyUp: null,
    xrMoveTo: null,
    marker: null,
    errorShown: false,
    raf: 0,
    clock: null
  };

      /* === SNK-XR-MANDOS (2026.27) ==========================================
     · Los mandos VR no se dibujan (ni serpientes-mano ni empuñaduras), pero
       el RAYO-PUNTERO sigue a la vista: así se puede apuntar y pulsar el
       tótem, el escritorio y sus ventanas sin perder la referencia.
     · Stick IZQUIERDO  = moverse (adelante/atrás + lateral).
     · Stick DERECHO    = girar la vista (suave, alrededor de la cabeza).
     · El gatillo apuntando al SUELO ya no teletransporta mientras se anda
       con el stick: ese teletransporte ("morder el suelo") dejaba al jugador
       pegado, avanzaba un milímetro y lo devolvía atrás. Todo lo demás se
       sigue pudiendo pulsar igual (tótem y pantalla del escritorio).
     Se instala envolviendo XRSession.prototype.requestAnimationFrame: no
     depende de ningún nombre interno del juego y no borra código existente.
     Para desactivar la locomoción: window.SnakeVrLocomotion.on(false)
     Puntero visible on/off:        window.SnakeVrLocomotion.pointer(false)
     Volver a permitir el teletransporte de la mordida:
                                    window.SnakeVrLocomotion.teleport(true)
     Volver a ver manos y rayos:    window.SnakeVrLocomotion.hideHands(false)
     Para quitarlo: borra este bloque completo (marcadores SNK-XR-MANDOS).
     ==================================================================== */
  var SNK_XR = {
    on: true,        // locomoción activa
    hide: true,      // mandos invisibles (menos el puntero)
    pointer: true,   // el rayo-puntero se queda a la vista para poder pulsar
    noTeleport: true,// el gatillo sobre el suelo no teletransporta
    speed: 2.4,      // m/s con el stick izquierdo
    turn: 1.9,       // rad/s con el stick derecho
    dead: 0.16,      // zona muerta del stick
    last: 0,
    errs: 0,
    sess: null,      // sesión XR en curso
    base: null,      // posición del rig al empezar (Vector3)
    acc: null,       // desplazamiento acumulado por el stick (Vector3)
    fights: 0,       // veces que hubo que reaplicar la posición del rig
    walked: 0,       // segundos andando con el stick
    blocked: 0,      // mordidas al suelo descartadas (teletransporte)
    kills: 0,        // teletransportes pendientes cancelados al andar
    stickSeen: false,// se ha visto un mando con stick (locomoción posible)
    rc: null,        // raycaster propio del puntero
    rcFloor: null    // raycaster propio del suelo
  };

  function snkXrLog(msg) {
    try { if (global.console && console.warn) console.warn('[SnakeVR] ' + msg); } catch (e) {}
  }

  function snkXrSession() {
    try {
      if (st.renderer && st.renderer.xr && st.renderer.xr.getSession) return st.renderer.xr.getSession();
    } catch (e) {}
    return null;
  }

  function snkXrController(i) {
    try {
      if (st.renderer && st.renderer.xr) return st.renderer.xr.getController(i);
    } catch (e) {}
    return null;
  }

  /* Cámara de la cabeza: en XR la buena es la de renderer.xr (su matrixWorld ya
     lleva el rig aplicado), si no st.camera. */
  function snkXrHead() {
    try {
      if (st.renderer && st.renderer.xr && st.renderer.xr.isPresenting && st.renderer.xr.getCamera) {
        var xc = st.renderer.xr.getCamera();
        if (xc && xc.matrixWorld) return xc;
      }
    } catch (e) {}
    return st.camera;
  }

  function snkXrVis(obj, vis) {
    if (!obj) return;
    if (obj.traverse) obj.traverse(function (o) { o.visible = vis; });
    else obj.visible = vis;
  }

  /* Deja a la vista sólo el rayo-puntero de cada mando. Se llama cada
     fotograma porque el juego vuelve a poner visible=true al apretar el
     gatillo (anima la serpiente-mano y el rayo al morder). */
  function snkXrHideHands() {
    for (var i = 0; i < 2; i++) {
      var ctl = snkXrController(i);
      if (!ctl) continue;
      var ray = (ctl.userData && ctl.userData.ray) || null;
      var keepRay = SNK_XR.pointer !== false;
      var kids = ctl.children || [];
      for (var k = 0; k < kids.length; k++) {
        var o = kids[k];
        if (!o || o === ray) continue;
        snkXrVis(o, !SNK_XR.hide);
      }
      if (ray) {
        ray.visible = SNK_XR.hide ? keepRay : true;
        try { if (ray.material) ray.material.opacity = SNK_XR.hide ? 0.32 : 0.55; } catch (eM) {}
      }
      try {
        if (st.renderer && st.renderer.xr && st.renderer.xr.getControllerGrip) {
          snkXrVis(st.renderer.xr.getControllerGrip(i), !SNK_XR.hide);
        }
      } catch (eG) {}
    }
    var hs = st.handSnakes || [];
    for (var h = 0; h < hs.length; h++) {
      var it = hs[h];
      var obj = it && (it.group || it.root || it.holder || it.obj || it.mesh || it);
      if (obj) snkXrVis(obj, !SNK_XR.hide);
    }
    var ret = st.reticles || [];
    for (var r = 0; r < ret.length; r++) if (ret[r]) ret[r].visible = !SNK_XR.hide;
  }

  /* Gamepad del mando izquierdo/derecho (inputSources y, si no, el controller). */
  function snkXrGamepad(hand) {
    var sess = snkXrSession();
    var srcs = (sess && sess.inputSources) || [];
    for (var i = 0; i < srcs.length; i++) {
      var s = srcs[i];
      if (s && s.handedness === hand && s.gamepad) return s.gamepad;
    }
    for (var j = 0; j < 2; j++) {
      var ctl = snkXrController(j);
      var gp = ctl && ctl.gamepad;
      if (!gp) continue;
      if (gp.handedness === hand) return gp;
      if (hand === 'left' && j === 0 && !gp.handedness) return gp;
      if (hand === 'right' && j === 1 && !gp.handedness) return gp;
    }
    return null;
  }

  /* Stick real: en Quest/WebXR está en axes[2] y axes[3]; si el mando expone
     el trackpad en axes[0]/[1] y está más movido, se usa ese. */
  function snkXrStick(gp) {
    if (!gp || !gp.axes) return [0, 0];
    var a = gp.axes;
    var x1 = a[0] || 0, y1 = a[1] || 0, x2 = a[2] || 0, y2 = a[3] || 0;
    var ax = 0, ay = 0;
    if (Math.abs(x2) + Math.abs(y2) >= Math.abs(x1) + Math.abs(y1)) { ax = x2; ay = y2; }
    else { ax = x1; ay = y1; }
    if (Math.abs(ax) < SNK_XR.dead) ax = 0;
    if (Math.abs(ay) < SNK_XR.dead) ay = 0;
    return [ax, ay];
  }

  /* Gira la vista dyaw radianes ALREDEDOR DE LA CABEZA (no del origen del rig),
     moviendo el rig como un todo: así el jugador no se desplaza al girar. */
  function snkXrTurn(dyaw) {
    var THREE = st.three, rig = st.rig, cam = snkXrHead();
    if (!THREE || !rig || !cam || !dyaw) return;
    var pivot = new THREE.Vector3();
    cam.getWorldPosition(pivot);
    var q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dyaw);
    var rel = rig.position.clone().sub(pivot);
    rel.applyQuaternion(q);
    rig.position.copy(pivot).add(rel);
    rig.quaternion.premultiply(q);
    rig.updateMatrixWorld(true);
    /* si el juego reconstruye la rotación del rig desde st.yaw, se mantiene */
    if (typeof st.yaw === 'number') st.yaw += dyaw;
    snkXrRebase();
  }

  /* Prepara el modelo base + desplazamiento de la sesión en curso (y lo
     reinicia si el juego abre otra sesión XR). */
  function snkXrReady() {
    var THREE = st.three, rig = st.rig;
    if (!THREE || !rig) return false;
    var sess = snkXrSession();
    if (!sess) { SNK_XR.base = null; SNK_XR.sess = null; return false; }
    if (!SNK_XR.base || SNK_XR.sess !== sess) {
      SNK_XR.sess = sess;
      SNK_XR.base = new THREE.Vector3().copy(rig.position);
      SNK_XR.acc = new THREE.Vector3();
    }
    return true;
  }

  /* El giro mueve el rig: se toma su posición actual como nueva base. */
  function snkXrRebase() {
    if (SNK_XR.base && SNK_XR.acc && st.rig) SNK_XR.base.copy(st.rig.position).sub(SNK_XR.acc);
  }

  function snkXrApply() {
    if (!SNK_XR.base || !SNK_XR.acc || !st.rig) return;
    st.rig.position.copy(SNK_XR.base).add(SNK_XR.acc);
    st.rig.updateMatrixWorld(true);
  }

  /* El juego, en modo XR, mueve el rig con rig.position.lerp(st.xrMoveTo, dt*6)
     cuando su "mordida al suelo" deja un teletransporte pendiente. Si se anda
     con el stick, ese lerp tira del jugador hacia el punto de destino viejo:
     se avanza un milímetro y se vuelve atrás. Al detectar el stick se cancela
     el teletransporte pendiente y la posición actual pasa a ser la base. */
  function snkXrStopTeleport() {
    if (!st || !st.xrMoveTo) return false;
    st.xrMoveTo = null;
    SNK_XR.kills++;
    snkXrRebase();
    return true;
  }

  /* Stick izquierdo: adelante/atrás (eje Y) y lateral (eje X) en el plano del
     suelo, mirando hacia donde mira la cabeza. El stick derecho gira. */
  function snkXrWalk(dt) {
    var THREE = st.three, cam = snkXrHead();
    if (!THREE || !cam || !snkXrReady()) return;
    var R = snkXrStick(snkXrGamepad('right'));
    var gpL = snkXrGamepad('left');
    if (gpL && gpL.axes && gpL.axes.length > 1) SNK_XR.stickSeen = true;
    var L = snkXrStick(gpL);
    if (R[0] || L[0] || L[1]) snkXrStopTeleport();
    if (R[0]) snkXrTurn(-R[0] * SNK_XR.turn * dt);          // stick derecho = girar
    if (L[0] || L[1]) {
      var fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() > 1e-6) {
        fwd.normalize();
        var side = new THREE.Vector3(-fwd.z, 0, fwd.x);
        SNK_XR.acc.addScaledVector(fwd, -L[1] * SNK_XR.speed * dt);
        SNK_XR.acc.addScaledVector(side, L[0] * SNK_XR.speed * dt);
        SNK_XR.walked += dt;
      }
    }
    snkXrApply();
  }

  /* Después del fotograma del juego: si reescribió la posición del rig, se
     reaplica lo nuestro; si fue un salto grande (su teletransporte), se toma
     su posición como nueva base y se respeta; si su teletransporte suave está
     en curso y no hay stick, se le deja mandar a él. */
  function snkXrWatch() {
    var THREE = st.three, rig = st.rig;
    if (!THREE || !rig || !SNK_XR.base || !SNK_XR.acc) return;
    if (st.xrMoveTo) { SNK_XR.base.copy(rig.position).sub(SNK_XR.acc); return; }
    var want = new THREE.Vector3().copy(SNK_XR.base).add(SNK_XR.acc);
    var d = rig.position.distanceTo(want);
    if (d > 0.5) { SNK_XR.base.copy(rig.position).sub(SNK_XR.acc); return; }
    if (d > 1e-5) {
      rig.position.copy(want);
      rig.updateMatrixWorld(true);
      SNK_XR.fights++;
    }
  }

  /* Rayo desde la boca del mando hacia lo que se quiera comprobar. */
  function snkXrAim(c, target, slot) {
    var THREE = st.three;
    if (!THREE || !c || !c.matrixWorld || !target) return false;
    try {
      var key = slot === 'floor' ? 'rcFloor' : 'rc';
      var rc = SNK_XR[key] || (SNK_XR[key] = new THREE.Raycaster());
      var m = new THREE.Matrix4().extractRotation(c.matrixWorld);
      var o = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
      var d = new THREE.Vector3(0, 0, -1).applyMatrix4(m).normalize();
      rc.set(o, d);
      return rc.intersectObject(target, false).length > 0;
    } catch (eA) { return false; }
  }

  /* ¿El mando está apuntando a algo pulsable? El tótem (abre/cierra el
     escritorio) y la pantalla del escritorio, con sus ventanas y botones. */
  function snkXrAimPlayable(c) {
    try {
      if (st.spirit && st.spirit.pickMesh && snkXrAim(c, st.spirit.pickMesh, 'play')) return true;
      if (st.screenOpen && st.mirrorMesh && snkXrAim(c, st.mirrorMesh, 'play')) return true;
    } catch (eP) {}
    return false;
  }

  /* El gatillo apuntando al suelo es la "mordida" que teletransporta. Con los
     sticks ya se anda, así que se descarta sólo ese caso: los clics en el
     tótem y en el escritorio siguen llegando al juego como siempre. Si las
     gafas no dan ningún stick (no habría forma de andar), no se descarta
     nada: el teletransporte sigue disponible. */
  function snkXrGuard(c) {
    if (!c || c.__snkGuard || typeof c.dispatchEvent !== 'function') return;
    c.__snkGuard = true;
    var orig = c.dispatchEvent;
    c.dispatchEvent = function (ev) {
      try {
        if (ev && ev.type === 'selectstart' && SNK_XR.on && SNK_XR.noTeleport &&
            SNK_XR.stickSeen && SNK_XR.sess && st.mode === 'xr' && st.floorMesh) {
          if (!snkXrAimPlayable(c) && snkXrAim(c, st.floorMesh, 'floor')) {
            SNK_XR.blocked++;
            return true;      /* se traga el evento: ni mordida ni teletransporte */
          }
        }
      } catch (eGu) {}
      return orig.apply(this, arguments);
    };
  }

  /* Un fotograma de XR: puntero/ manos ocultas + guardia del gatillo + sticks.
     dt limitado para que un parón del navegador no dé un salto enorme. */
  function snkXrFrame(nowMs) {
    var t = (typeof nowMs === 'number' ? nowMs : Date.now()) / 1000;
    var dt = SNK_XR.last ? Math.min(0.1, Math.max(0, t - SNK_XR.last)) : 0.016;
    SNK_XR.last = t;
    snkXrHideHands();
    snkXrGuard(snkXrController(0));
    snkXrGuard(snkXrController(1));
    if (SNK_XR.on) snkXrWalk(dt);
  }

  /* Si el fotograma del juego lanza una excepción, three.js deja de pedir
     fotogramas y la sesión immersive-vr se cierra sola. Aquí se mantiene viva
     con un bucle de rescate que solo dibuja la escena. */
  function snkXrRescue(sess, orig) {
    if (!sess || sess.__snkRescue) return;
    sess.__snkRescue = true;
    var step = function () {
      try {
        orig.call(sess, function () {
          try {
            snkXrHideHands();
            if (st.renderer && st.scene && st.camera) st.renderer.render(st.scene, st.camera);
          } catch (eR) {}
          step();
        });
      } catch (eS) {}
    };
    step();
  }

  function snkXrInstall() {
    if (typeof XRSession === 'undefined' || !XRSession.prototype) return;
    if (XRSession.prototype.__snkMandos) return;
    var orig = XRSession.prototype.requestAnimationFrame;
    if (typeof orig !== 'function') return;
    XRSession.prototype.requestAnimationFrame = function (cb) {
      var self = this;
      return orig.call(this, function (time, frame) {
        try { snkXrFrame(time); } catch (eF) {}
        try {
          cb(time, frame);
        } catch (err) {
          SNK_XR.errs++;
          snkXrLog('fotograma XR fallido #' + SNK_XR.errs + ' ' +
            (err && err.message ? err.message : err));
          snkXrRescue(self, orig);
        }
        try { snkXrWatch(); } catch (eW) {}
      });
    };
    XRSession.prototype.__snkMandos = true;
  }

  snkXrInstall();

  try {
    global.SnakeVrLocomotion = {
      on: function (v) { SNK_XR.on = (v !== false); return SNK_XR.on; },
      hideHands: function (v) { SNK_XR.hide = (v !== false); snkXrHideHands(); return SNK_XR.hide; },
      /* El rayo del mando se queda visible para poder apuntar y pulsar. */
      pointer: function (v) { SNK_XR.pointer = (v !== false); snkXrHideHands(); return SNK_XR.pointer; },
      /* teleport(false) = la mordida al suelo no te mueve (por defecto). */
      teleport: function (v) {
        SNK_XR.noTeleport = (v !== true);
        if (!SNK_XR.noTeleport) snkXrRebase();
        return !SNK_XR.noTeleport;
      },
      speed: function (v) { if (typeof v === 'number' && v > 0) SNK_XR.speed = v; return SNK_XR.speed; },
      turn: function (v) { if (typeof v === 'number' && v > 0) SNK_XR.turn = v; return SNK_XR.turn; },
      /* Vuelve a poner al jugador donde estaba al entrar en VR. */
      reset: function () {
        if (SNK_XR.base && SNK_XR.acc) {
          SNK_XR.acc.set(0, 0, 0);
          if (st && st.rig) { st.rig.position.copy(SNK_XR.base); st.rig.updateMatrixWorld(true); }
        }
        return true;
      },
      state: SNK_XR
    };
  } catch (eApi) {}
  /* === fin SNK-XR-MANDOS === */

  function vrT(es, en) {
    try {
      var l = global.snakeI18n && global.snakeI18n.lang;
      if (!l) l = (document.documentElement.getAttribute('lang') === 'en') ? 'en' : 'es';
      return l === 'en' ? en : es;
    } catch (e) { return es; }
  }

  function prefs() {
    try { return JSON.parse(global.localStorage.getItem(LS_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function savePrefs(p) {
    try { global.localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) {}
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { try { s.remove(); } catch (e) {} rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* three.js ya está en memoria si abriste Snake Racing 3D, el Metaverso o la TV. */
  function ensureThree() {
    if (st.loadP) return st.loadP;
    st.loadP = new Promise(function (res, rej) {
      if (global.THREE && +global.THREE.REVISION >= 150) { res(global.THREE); return; }
      loadScript(THREE_URL).then(function () {
        if (global.THREE) res(global.THREE);
        else { st.loadP = null; rej(new Error('THREE no disponible')); }
      }, function (err) { st.loadP = null; rej(err); });
    });
    return st.loadP;
  }

  function xrSupported() {
    try { return !!(global.navigator && global.navigator.xr && global.navigator.xr.isSessionSupported); }
    catch (e) { return false; }
  }

  function clockText() {
    var c = document.getElementById('clock');
    if (c && c.textContent) return c.textContent.trim();
    try {
      return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    } catch (e) { return '--:--'; }
  }
  function dateText() {
    try {
      return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    } catch (e) { return ''; }
  }

  /* ---------------- CSS del visor (una vez) ---------------- */
  var CSS = [
    '#snk-vr-root{position:fixed;inset:0;z-index:2147483000;background:#02040a;overflow:hidden;touch-action:none;}',
    '#snk-vr-root canvas.snk-vr-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}',
    '#snk-vr-root .snk-vr-hud{position:absolute;left:0;right:0;top:0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:10px 12px;font:600 13px/1.2 Inter,system-ui,sans-serif;color:#dffbea;background:linear-gradient(180deg,rgba(3,8,14,.82),rgba(3,8,14,0));pointer-events:none;}',
    '#snk-vr-root .snk-vr-brand{display:flex;align-items:center;gap:8px;text-shadow:0 2px 10px rgba(0,0,0,.6);pointer-events:auto;}',
    '#snk-vr-root .snk-vr-brand b{font-size:15px;letter-spacing:.4px;}',
    '#snk-vr-root .snk-vr-badge{font:700 10px/1 Inter,system-ui,sans-serif;letter-spacing:.8px;padding:4px 7px;border-radius:999px;background:rgba(53,255,178,.16);border:1px solid rgba(53,255,178,.5);color:#8dffcf;}',
    '#snk-vr-root .snk-vr-actions{display:flex;flex-wrap:wrap;gap:6px;pointer-events:auto;}',
    '#snk-vr-root .snk-vr-actions button{appearance:none;border:1px solid rgba(120,220,180,.35);background:rgba(10,24,34,.82);color:#dffbea;font:600 12px/1 Inter,system-ui,sans-serif;padding:8px 10px;border-radius:10px;cursor:pointer;}',
    '#snk-vr-root .snk-vr-actions button:hover{background:rgba(20,48,52,.9);}',
    '#snk-vr-root .snk-vr-actions button[aria-pressed="true"]{border-color:#35ffb2;background:rgba(53,255,178,.22);color:#fff;}',
    '#snk-vr-root .snk-vr-actions button.snk-vr-exit{border-color:rgba(255,120,120,.6);color:#ffd7d7;background:rgba(60,10,16,.75);}',
    '#snk-vr-root .snk-vr-help{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);max-width:min(94vw,720px);text-align:center;font:500 11px/1.35 Inter,system-ui,sans-serif;color:rgba(223,251,234,.72);text-shadow:0 1px 6px #000;pointer-events:none;padding:0 8px;}',
    '#snk-vr-root .snk-vr-pad{position:absolute;right:12px;bottom:44px;display:grid;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(2,44px);gap:6px;}',
    '#snk-vr-root .snk-vr-pad button{appearance:none;border:1px solid rgba(120,220,180,.35);background:rgba(10,24,34,.8);color:#dffbea;font-size:17px;border-radius:12px;cursor:pointer;}',
    '#snk-vr-root .snk-vr-pad button:active{background:rgba(53,255,178,.3);}',
    '#snk-vr-root .snk-vr-pad .up{grid-column:2;grid-row:1;}',
    '#snk-vr-root .snk-vr-pad .left{grid-column:1;grid-row:2;}',
    '#snk-vr-root .snk-vr-pad .down{grid-column:2;grid-row:2;}',
    '#snk-vr-root .snk-vr-pad .right{grid-column:3;grid-row:2;}',
    '#snk-vr-note{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483001;max-width:min(92vw,460px);background:#0c1822;color:#eafff4;border:1px solid rgba(120,220,180,.4);border-radius:16px;padding:18px 20px;font:500 13px/1.45 Inter,system-ui,sans-serif;box-shadow:0 24px 80px rgba(0,0,0,.6);display:none;}',
    '#snk-vr-note b{display:block;font-size:15px;margin-bottom:6px;}',
    '#snk-vr-note button{margin-top:12px;appearance:none;border:1px solid #35ffb2;background:rgba(53,255,178,.18);color:#fff;font:700 12px/1 Inter,system-ui,sans-serif;padding:9px 12px;border-radius:10px;cursor:pointer;}',
    '.snkvr-app{display:flex;flex-direction:column;gap:14px;padding:18px;color:#eafff4;font:500 13px/1.5 Inter,system-ui,sans-serif;height:100%;box-sizing:border-box;overflow:auto;background:radial-gradient(120% 90% at 20% 0%,rgba(53,255,178,.16),transparent 55%),radial-gradient(110% 90% at 100% 100%,rgba(47,124,255,.18),transparent 60%),#081019;}',
    '.snkvr-app h1{margin:0;font:800 22px/1.1 Outfit,Inter,system-ui,sans-serif;letter-spacing:.4px;display:flex;align-items:center;gap:10px;}',
    '.snkvr-app .snkvr-sub{margin:0;color:rgba(234,255,244,.78);}',
    '.snkvr-app .snkvr-btn{appearance:none;border:1px solid #35ffb2;background:linear-gradient(180deg,rgba(53,255,178,.28),rgba(53,255,178,.14));color:#fff;font:800 15px/1 Inter,system-ui,sans-serif;padding:15px 18px;border-radius:14px;cursor:pointer;box-shadow:0 10px 30px rgba(53,255,178,.22);}',
    '.snkvr-app .snkvr-btn:hover{filter:brightness(1.12);}',
    '.snkvr-app .snkvr-row{display:flex;flex-wrap:wrap;gap:8px;}',
    '.snkvr-app .snkvr-btn2{appearance:none;border:1px solid rgba(120,220,180,.4);background:rgba(12,28,38,.9);color:#dffbea;font:700 12px/1 Inter,system-ui,sans-serif;padding:11px 13px;border-radius:11px;cursor:pointer;}',
    '.snkvr-app .snkvr-btn2:hover{background:rgba(24,52,58,.95);}',
    '.snkvr-app .snkvr-chips{display:flex;flex-wrap:wrap;gap:6px;}',
    '.snkvr-app .snkvr-chip{font:700 11px/1 Inter,system-ui,sans-serif;padding:7px 9px;border-radius:999px;background:rgba(12,28,38,.9);border:1px solid rgba(120,220,180,.28);color:#bfe9d6;}',
    '.snkvr-app .snkvr-chip.on{border-color:#35ffb2;color:#8dffcf;background:rgba(53,255,178,.14);}',
    '.snkvr-app ul{margin:0;padding-left:18px;color:rgba(234,255,244,.8);}',
    '.snkvr-app .snkvr-note{font:500 11.5px/1.45 Inter,system-ui,sans-serif;color:rgba(234,255,244,.62);border-top:1px solid rgba(120,220,180,.2);padding-top:10px;}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('snk-vr-css')) return;
    var s = document.createElement('style');
    s.id = 'snk-vr-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------- Overlay del visor ---------------- */
  function buildRoot() {
    injectCss();
    var root = document.createElement('div');
    root.id = 'snk-vr-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Snake VR');
    root.innerHTML =
      '<canvas class="snk-vr-canvas"></canvas>' +
      '<div class="snk-vr-hud">' +
        '<div class="snk-vr-brand">🥽 <b>Snake VR</b><span class="snk-vr-badge">' + vrT('EN DIRECTO', 'LIVE') + '</span></div>' +
        '<div class="snk-vr-actions">' +
          '<button type="button" data-vr="screen" aria-pressed="false" title="' + vrT('Abrir o cerrar el escritorio en la pantalla gigante', 'Open or close the desktop on the giant screen') + '">🗔 ' + vrT('Escritorio', 'Desktop') + '</button>' +
          '<button type="button" data-vr="gyro" aria-pressed="false" title="' + vrT('Mira moviendo la cabeza (móvil)', 'Look by moving your head (phone)') + '">🧭 ' + vrT('Giroscopio', 'Gyroscope') + '</button>' +
          '<button type="button" data-vr="sbs" aria-pressed="false" title="' + vrT('Dos ojos para gafas de cartón (Cardboard)', 'Two eyes for cardboard headsets') + '">👓 ' + vrT('Gafas (SBS)', 'Headset (SBS)') + '</button>' +
          '<button type="button" data-vr="xr" aria-pressed="false" title="' + vrT('Realidad virtual real con WebXR', 'True VR with WebXR') + '">🥽 ' + vrT('VR real', 'True VR') + '</button>' +
          '<button type="button" data-vr="recenter" title="' + vrT('Volver al centro', 'Back to center') + '">🎯 ' + vrT('Recentrar', 'Recenter') + '</button>' +
          '<button type="button" class="snk-vr-exit" data-vr="exit" title="' + vrT('Salir de Snake VR', 'Exit Snake VR') + '">✖ ' + vrT('Salir', 'Exit') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="snk-vr-pad">' +
        '<button type="button" class="up" data-move="fwd" aria-label="' + vrT('Avanzar', 'Forward') + '">▲</button>' +
        '<button type="button" class="left" data-move="left" aria-label="' + vrT('Izquierda', 'Left') + '">◀</button>' +
        '<button type="button" class="down" data-move="back" aria-label="' + vrT('Atrás', 'Back') + '">▼</button>' +
        '<button type="button" class="right" data-move="right" aria-label="' + vrT('Derecha', 'Right') + '">▶</button>' +
      '</div>' +
      '<div class="snk-vr-help">' + vrT(
        'Arrastra para mirar · rueda o pellizco = acercarte · WASD/flechas = moverte · la serpiente tótem, abajo a la derecha, abre y cierra el escritorio (púlsala) · dentro todo va igual que en el ordenador: clic, mantener y arrastrar ventanas, doble clic, clic derecho, rueda o stick para desplazar · doble clic fuera = recentrar',
        'Drag to look · wheel or pinch = zoom · WASD/arrows = move · the totem snake, bottom-right, opens and closes the desktop (press it) · inside everything works like on the computer: click, hold and drag windows, double click, right click, wheel or stick to scroll · double click outside = recenter'
      ) + '</div>';
    document.body.appendChild(root);
    return root;
  }

  function showNote(title, body) {
    var n = document.getElementById('snk-vr-note');
    if (!n) {
      n = document.createElement('div');
      n.id = 'snk-vr-note';
      document.body.appendChild(n);
    }
    n.innerHTML = '<b>' + title + '</b>' + body +
      '<div><button type="button" id="snk-vr-note-ok">' + vrT('Entendido', 'Got it') + '</button></div>';
    n.style.display = 'block';
    var ok = document.getElementById('snk-vr-note-ok');
    if (ok) ok.onclick = function () { n.style.display = 'none'; };
  }

  /* ---------------- Escena 3D: jungla con serpientes ---------------- */
  function makeJungleSky(THREE) {
    var c = document.createElement('canvas');
    c.width = 8; c.height = 256;
    var cx = c.getContext('2d');
    var grad = cx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#03120b');
    grad.addColorStop(0.42, '#062a18');
    grad.addColorStop(0.7, '#0a3a22');
    grad.addColorStop(1, '#02090a');
    cx.fillStyle = grad;
    cx.fillRect(0, 0, 8, 256);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function makeGroundTexture(THREE) {
    var S = 256, c = document.createElement('canvas');
    c.width = S; c.height = S;
    var cx = c.getContext('2d');
    cx.fillStyle = '#0d2a15';
    cx.fillRect(0, 0, S, S);
    var i, x, y, r;
    for (i = 0; i < 380; i++) {
      x = Math.random() * S; y = Math.random() * S;
      r = 3 + Math.random() * 16;
      cx.fillStyle = 'rgba(' + ((10 + Math.random() * 26) | 0) + ',' + ((44 + Math.random() * 60) | 0) + ',' + ((18 + Math.random() * 26) | 0) + ',' + (0.25 + Math.random() * 0.5).toFixed(2) + ')';
      cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
    }
    for (i = 0; i < 60; i++) {   /* motas bioluminiscentes del musgo */
      x = Math.random() * S; y = Math.random() * S;
      cx.fillStyle = 'rgba(120,255,190,' + (0.05 + Math.random() * 0.16).toFixed(2) + ')';
      cx.beginPath(); cx.arc(x, y, 1 + Math.random() * 3, 0, Math.PI * 2); cx.fill();
    }
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(22, 22);
    return t;
  }

  function makeLeafTexture(THREE) {
    var S = 128, c = document.createElement('canvas');
    c.width = S; c.height = S;
    var cx = c.getContext('2d');
    cx.clearRect(0, 0, S, S);
    cx.save();
    cx.translate(S / 2, S - 6);
    var g = cx.createLinearGradient(0, 0, 0, -S);
    g.addColorStop(0, 'rgba(22,86,44,.96)');
    g.addColorStop(1, 'rgba(88,220,120,.9)');
    cx.fillStyle = g;
    for (var f = 0; f < 5; f++) {
      cx.save();
      cx.rotate((f - 2) * 0.42);
      cx.beginPath();
      cx.moveTo(0, 0);
      cx.quadraticCurveTo(16, -S * 0.42, 0, -S * 0.86);
      cx.quadraticCurveTo(-16, -S * 0.42, 0, 0);
      cx.fill();
      cx.restore();
    }
    cx.restore();
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function makeFireflies(THREE) {
    var n = 220, pos = new Float32Array(n * 3), base = [];
    for (var i = 0; i < n; i++) {
      var r = 2.5 + Math.random() * 22;
      var th = Math.random() * Math.PI * 2;
      var y = 0.3 + Math.random() * 6;
      pos[i * 3] = Math.cos(th) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(th) * r - 3;
      base.push({ x: pos[i * 3], y: y, z: pos[i * 3 + 2], ph: Math.random() * Math.PI * 2, sp: 0.3 + Math.random() * 0.6 });
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var m = new THREE.PointsMaterial({ color: 0xc8ffb0, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false });
    var pts = new THREE.Points(g, m);
    pts.userData.base = base;
    return pts;
  }

  /* Árboles, helechos y lianas: la selva que rodea la pantalla. */
  function makeJungle(THREE) {
    var group = new THREE.Group();
    var trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6);
    trunkGeo.translate(0, 0.5, 0);       /* base en y=0 */
    var trunkMat = new THREE.MeshStandardMaterial({ color: 0x2b1c12, roughness: 0.95, metalness: 0.05 });
    var capGeo = new THREE.IcosahedronGeometry(1, 1);
    var capMat = new THREE.MeshStandardMaterial({ color: 0x0f4a26, roughness: 0.9, metalness: 0.05, flatShading: true });
    var N = 34;
    var trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
    var caps = new THREE.InstancedMesh(capGeo, capMat, N * 2);
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    var axisY = new THREE.Vector3(0, 1, 0);
    var capI = 0, i, k;
    for (i = 0; i < N; i++) {
      var ang = (i / N) * Math.PI * 2 + Math.random() * 0.5;
      var rad = 9 + Math.random() * 15;
      var x = Math.cos(ang) * rad, z = Math.sin(ang) * rad - 4;
      var h = 3.4 + Math.random() * 6.5;
      v.set(x, 0, z);
      s.set(1, h, 1);
      q.setFromAxisAngle(axisY, Math.random() * Math.PI);
      m4.compose(v, q, s);
      trunks.setMatrixAt(i, m4);
      for (k = 0; k < 2; k++) {
        v.set(x + (Math.random() - 0.5) * 1.6, h * (0.72 + k * 0.2), z + (Math.random() - 0.5) * 1.6);
        s.set(1.1 + Math.random() * 1.1, 0.9 + Math.random() * 0.8, 1.1 + Math.random() * 1.1);
        q.setFromAxisAngle(axisY, Math.random() * Math.PI);
        m4.compose(v, q, s);
        caps.setMatrixAt(capI++, m4);
      }
    }
    trunks.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    group.add(trunks); group.add(caps);

    /* Helechos: planos con hoja recortada en círculos alrededor de la pantalla. */
    var leafMat = new THREE.MeshBasicMaterial({
      map: makeLeafTexture(THREE), transparent: true, alphaTest: 0.25,
      side: THREE.DoubleSide, depthWrite: false
    });
    var F = 46, ferns = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.5), leafMat, F);
    for (i = 0; i < F; i++) {
      var fa = Math.random() * Math.PI * 2;
      var fr = 2.4 + Math.random() * 13;
      v.set(Math.cos(fa) * fr, 0.72, Math.sin(fa) * fr - 3);
      q.setFromAxisAngle(axisY, Math.random() * Math.PI * 2);
      var fs = 0.7 + Math.random() * 1.5;
      s.set(fs, fs, fs);
      m4.compose(v, q, s);
      ferns.setMatrixAt(i, m4);
    }
    ferns.instanceMatrix.needsUpdate = true;
    group.add(ferns);

    /* Lianas colgantes que se mecen (updateJungle). */
    var lianas = [];
    for (var L = 0; L < 9; L++) {
      var la = Math.random() * Math.PI * 2;
      var lr = 6 + Math.random() * 10;
      var lx = Math.cos(la) * lr, lz = Math.sin(la) * lr - 4;
      var top = 6 + Math.random() * 4;
      var len = 2.5 + Math.random() * 4;
      var pts = [];
      for (var p = 0; p <= 8; p++) {
        var t01 = p / 8;
        pts.push(new THREE.Vector3(Math.sin(t01 * 3.1) * 0.25, -t01 * len, Math.cos(t01 * 2.1) * 0.2));
      }
      var vine = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.035, 5, false),
        new THREE.MeshStandardMaterial({ color: 0x1c6b3a, roughness: 0.8, emissive: 0x0a3a1e, emissiveIntensity: 0.4 })
      );
      vine.position.set(lx, top, lz);
      vine.userData.phase = Math.random() * Math.PI * 2;
      vine.userData.sway = 0.06 + Math.random() * 0.08;
      group.add(vine);
      lianas.push(vine);
    }
    group.userData.lianas = lianas;
    return group;
  }

  function updateJungle(dt, now) {
    var lianas = (st.jungle && st.jungle.userData && st.jungle.userData.lianas) || [];
    for (var i = 0; i < lianas.length; i++) {
      var L = lianas[i];
      L.rotation.z = Math.sin(now * 0.8 + L.userData.phase) * L.userData.sway;
      L.rotation.x = Math.cos(now * 0.6 + L.userData.phase) * L.userData.sway * 0.6;
    }
  }

  function updateFireflies(dt, now) {
    var ff = st.fireflies;
    if (!ff || !ff.userData || !ff.userData.base) return;
    var arr = ff.geometry.attributes.position.array;
    var base = ff.userData.base;
    for (var i = 0; i < base.length; i++) {
      var b = base[i];
      arr[i * 3] = b.x + Math.sin(now * b.sp + b.ph) * 1.6;
      arr[i * 3 + 1] = b.y + Math.sin(now * b.sp * 1.7 + b.ph) * 0.5;
      arr[i * 3 + 2] = b.z + Math.cos(now * b.sp * 0.8 + b.ph) * 1.6;
    }
    ff.geometry.attributes.position.needsUpdate = true;
  }

  /* Cabeza de serpiente reutilizable (hocico hacia +Z local): la usan la jungla,
     el tótem que te sigue y los dos mandos. */
  function makeSnakeHead(THREE, color, size) {
    var group = new THREE.Group();
    var mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.42, metalness: 0.12, emissive: color, emissiveIntensity: 0.35 });
    var skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), mat);
    skull.scale.set(1, 0.82, 1.3);
    group.add(skull);
    var jaw = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), mat);
    jaw.scale.set(0.92, 0.5, 1.4);
    jaw.position.set(0, -0.045, 0.075);
    group.add(jaw);
    var eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff27a, toneMapped: false });
    var pupMat = new THREE.MeshBasicMaterial({ color: 0x120800, toneMapped: false });
    var eyes = [];
    for (var e = -1; e <= 1; e += 2) {
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), eyeMat);
      eye.position.set(0.052 * e, 0.028, 0.055);
      group.add(eye);
      var pup = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), pupMat);
      pup.position.set(0.052 * e, 0.03, 0.078);
      group.add(pup);
      eyes.push(eye);
    }
    var tongue = new THREE.Group();
    var tMat = new THREE.MeshBasicMaterial({ color: 0xff4d6d, toneMapped: false });
    for (var b = -1; b <= 1; b += 2) {
      var fork = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.1, 4), tMat);
      fork.position.set(0.018 * b, -0.005, 0.05);
      fork.rotation.x = Math.PI / 2;
      fork.rotation.z = -0.32 * b;
      tongue.add(fork);
    }
    tongue.position.set(0, -0.02, 0.12);
    group.add(tongue);
    group.scale.setScalar(size || 1);
    return { group: group, mat: mat, eyeMat: eyeMat, tongue: tongue, eyes: eyes };
  }

  var SNAKE_COLORS = [0x6dff8a, 0x35ffd6, 0x9dff3c, 0x35b6ff, 0xffd24a, 0xff7a3c, 0xff5fa2, 0xa0ff6a];

  /* Serpiente que se arrastra sola por la jungla: cuerpo instanciado siguiendo una
     curva cerrada (unas a ras de suelo, otras entre las ramas). */
  function makeAmbientSnake(THREE, i) {
    var grp = new THREE.Group();
    var color = SNAKE_COLORS[i % SNAKE_COLORS.length];
    var segs = 14;
    var rad = 3.5 + Math.random() * 14;
    var baseY = Math.random() < 0.5 ? 0.22 : (1 + Math.random() * 4.5);
    var cx = (Math.random() - 0.5) * 8, cz = (Math.random() - 0.5) * 8 - 3;
    var pts = [], k;
    for (k = 0; k < 8; k++) {
      var a = (k / 8) * Math.PI * 2;
      var rr = rad * (0.55 + Math.random() * 0.55);
      pts.push(new THREE.Vector3(
        cx + Math.cos(a) * rr,
        baseY + Math.sin(a * 2 + i) * (baseY < 1 ? 0.12 : 0.9),
        cz + Math.sin(a) * rr
      ));
    }
    var curve = new THREE.CatmullRomCurve3(pts, true);
    var bodyGeo = new THREE.SphereGeometry(0.085, 8, 6);
    bodyGeo.scale(1, 0.72, 1);
    var bodyMat = new THREE.MeshStandardMaterial({
      color: color, roughness: 0.45, metalness: 0.18,
      emissive: color, emissiveIntensity: 0.32
    });
    var body = new THREE.InstancedMesh(bodyGeo, bodyMat, segs);
    try { body.instanceMatrix.setUsage(THREE.DynamicDrawUsage); } catch (eDU) {}
    grp.add(body);
    var head = makeSnakeHead(THREE, color, 1);
    grp.add(head.group);
    return {
      group: grp, body: body, head: head, curve: curve,
      u: Math.random(), speed: (0.02 + Math.random() * 0.05) * (Math.random() < 0.5 ? 1 : -1),
      segs: segs, span: 0.055 + Math.random() * 0.05, phase: Math.random() * 6.28
    };
  }

  function updateAmbientSnakes(dt, now) {
    var THREE = st.three;
    if (!THREE) return;
    var m4 = st.tmpM || (st.tmpM = new THREE.Matrix4());
    var q = st.tmpQ || (st.tmpQ = new THREE.Quaternion());
    var v = st.tmpV || (st.tmpV = new THREE.Vector3());
    var v2 = st.tmpV2 || (st.tmpV2 = new THREE.Vector3());
    var up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3();
    for (var i = 0; i < st.ambient.length; i++) {
      var sn = st.ambient[i];
      sn.u = (sn.u + sn.speed * dt + 1) % 1;
      for (var j = 0; j < sn.segs; j++) {
        var t = (sn.u - j * sn.span + 1) % 1;
        sn.curve.getPoint(t, v);
        var sc = (1 - (j / sn.segs) * 0.62) * (0.9 + Math.sin(now * 6 + sn.phase + j * 0.7) * 0.06);
        s.set(sc, sc, sc);
        q.setFromAxisAngle(up, now * 0.3 + i);
        m4.compose(v, q, s);
        sn.body.setMatrixAt(j, m4);
      }
      sn.body.instanceMatrix.needsUpdate = true;
      sn.curve.getPoint(sn.u, v);
      sn.curve.getPoint((sn.u + 0.012) % 1, v2);
      sn.head.group.position.copy(v);
      sn.head.group.lookAt(v2);
      sn.head.tongue.scale.z = 0.4 + Math.max(0, Math.sin(now * (5 + i) + sn.phase)) * 1.5;
    }
  }


  /* Serpiente tótem que flota a tu lado, en la esquina inferior derecha: se enrolla en espiral,
     tiene halo y anillo, y al pulsarla (ratón o mandos) abre/cierra el escritorio. */
  function makeSpiritSnake(THREE) {
    var group = new THREE.Group();
    var color = 0x9dff5a;
    var mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.35, metalness: 0.25, emissive: color, emissiveIntensity: 0.5 });
    var pts = [], k;
    for (k = 0; k <= 44; k++) {
      var f = k / 44;
      var ang = f * Math.PI * 2 * 2.4;
      var rr = 0.105 * (1 - f * 0.35);
      pts.push(new THREE.Vector3(Math.cos(ang) * rr, f * 0.3 - 0.15, Math.sin(ang) * rr));
    }
    var spiral = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.024, 8, false), mat);
    group.add(spiral);
    var head = makeSnakeHead(THREE, color, 1.35);
    head.group.position.set(0, 0.18, 0);
    group.add(head.group);

    /* Halo suave (sprite radial) */
    var haloTex = (function () {
      var S = 128, c = document.createElement('canvas');
      c.width = S; c.height = S;
      var cx = c.getContext('2d');
      var g = cx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
      g.addColorStop(0, 'rgba(157,255,90,.85)');
      g.addColorStop(0.45, 'rgba(70,200,110,.35)');
      g.addColorStop(1, 'rgba(30,80,50,0)');
      cx.fillStyle = g;
      cx.fillRect(0, 0, S, S);
      var t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, opacity: 0.85 }));
    halo.scale.set(0.85, 0.85, 1);
    halo.position.set(0, 0, -0.06);
    group.add(halo);

    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.19, 0.008, 6, 40),
      new THREE.MeshBasicMaterial({ color: 0x9dff5a, transparent: true, opacity: 0.9, toneMapped: false })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.16;
    group.add(ring);

    /* Zona clicable (invisible pero el raycaster sí la ve): pequeña, para que un clic
       cerca del tótem pase de largo y no estorbe. */
    var pick = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    group.add(pick);

    return { group: group, spiral: spiral, head: head, halo: halo, ring: ring, pickMesh: pick, mat: mat, bite: 0 };
  }

  /* Posición/dirección reales de los ojos del que mira (vale en XR y fuera de XR). */
  function viewerWorldPos(out) {
    var r = st.renderer;
    if (r && r.xr && r.xr.isPresenting) {
      try {
        var xc = r.xr.getCamera();
        if (xc) return xc.getWorldPosition(out);
      } catch (eXv1) {}
    }
    return st.camera.getWorldPosition(out);
  }
  function viewerWorldDir(out) {
    var r = st.renderer;
    if (r && r.xr && r.xr.isPresenting) {
      try {
        var xc = r.xr.getCamera();
        if (xc) return xc.getWorldDirection(out);
      } catch (eXv2) {}
    }
    return st.camera.getWorldDirection(out);
  }

  function updateSpirit(dt, now) {
    var sp = st.spirit;
    if (!sp || !st.three) return;
    var THREE = st.three;
    var pos = new THREE.Vector3(), dir = new THREE.Vector3(), look = new THREE.Vector3();
    viewerWorldPos(pos);
    viewerWorldDir(dir);
    dir.y = 0;
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, -1);
    dir.normalize();
    /* Vive en la esquina inferior derecha de la vista: a la altura del pecho, pequeño y
       translúcido, para que no estorbe — ni tapa el centro de la mirada ni la pantalla.
       Con el escritorio abierto se aparta aún más y se desvanece casi del todo. */
    var sideX = -dir.z, sideZ = dir.x; // hombro derecho
    var reach = st.screenOpen ? 1.55 : 1.25;
    var side = st.screenOpen ? 0.85 : 0.62;
    look.copy(pos).addScaledVector(dir, reach);
    look.x += sideX * side;
    look.z += sideZ * side;
    look.y = clampN(pos.y - (st.screenOpen ? 0.7 : 0.52), 0.5, 1.35);
    look.y += Math.sin(now * 1.4) * 0.012;
    sp.group.position.lerp(look, Math.min(1, dt * 4.5));
    /* La cabeza te mira siempre a ti */
    sp.head.group.lookAt(pos.x, pos.y, pos.z);
    sp.spiral.rotation.y = now * 0.9;
    sp.ring.rotation.z = now * (st.screenOpen ? 2.4 : 0.7);
    sp.halo.material.opacity = (st.screenOpen ? 0.28 : 0.55) + Math.sin(now * 5) * 0.05;
    var baseScale = st.screenOpen ? 0.44 : 0.6;
    sp.group.scale.setScalar(baseScale * (1 + Math.sin(now * 3.2) * 0.05 + sp.bite * 0.35));
    sp.head.tongue.scale.z = 0.5 + Math.max(0, Math.sin(now * 6.5)) * 1.4;
    if (sp.bite > 0) sp.bite = Math.max(0, sp.bite - dt * 3);
    var col = st.screenOpen ? 0x9dff5a : 0xffc861;
    try {
      sp.ring.material.color.setHex(col);
      sp.mat.emissive.setHex(col);
    } catch (eCol) {}
  }

  /* ---------------- Abrir / cerrar el escritorio desde el tótem ---------------- */
  function updateScreenAnim(dt) {
    var g = st.screenGroup;
    if (!g) return;
    var target = st.screenOpen ? 1 : 0;
    st.screenAnim += (target - st.screenAnim) * Math.min(1, dt * 5.5);
    if (Math.abs(target - st.screenAnim) < 0.012) st.screenAnim = target;
    var k = st.screenAnim;
    g.visible = k > 0.01;
    g.scale.setScalar(Math.max(0.001, k));
  }

  function setScreenOpen(on) {
    var want = !!on;
    if (st.screenOpen === want) return st.screenOpen;
    st.screenOpen = want;
    if (st.spirit) st.spirit.bite = 1;
    try { paintInfo(); } catch (eSi) {}
    syncHud();
    return st.screenOpen;
  }

  function toggleScreen() { return setScreenOpen(!st.screenOpen); }

  /* ---------------- Mandos-serpiente de WebXR ---------------- */
  function makeControllerSnake(THREE, hand) {
    var group = new THREE.Group();
    /* Mano izquierda lima, derecha cian */
    var color = hand === 0 ? 0x9dff3c : 0x35ffd6;
    var mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.4, metalness: 0.2, emissive: color, emissiveIntensity: 0.4 });
    var pts = [], k;
    for (k = 0; k <= 48; k++) {
      var f = k / 48;
      var ang = f * Math.PI * 2 * 2.4;
      pts.push(new THREE.Vector3(Math.cos(ang) * 0.027, Math.sin(ang) * 0.027, 0.08 - f * 0.24));
    }
    var coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.0115, 6, false), mat);
    group.add(coil);
    var tail = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.05, 8), mat);
    tail.position.set(0, 0.027, 0.1);
    tail.rotation.x = -Math.PI / 2;
    group.add(tail);
    var head = makeSnakeHead(THREE, color, 0.85);
    head.group.position.set(0, 0.024, -0.185);
    head.group.rotation.y = Math.PI;      /* el hocico mira al frente del mando (-Z) */
    group.add(head.group);
    return { group: group, coil: coil, head: head, color: color, mat: mat, bite: 0, phase: Math.random() * 6.28 };
  }

  function updateHandSnakes(dt, now) {
    for (var i = 0; i < st.handSnakes.length; i++) {
      var sn = st.handSnakes[i];
      if (!sn) continue;
      sn.coil.rotation.z = now * 1.1 + i;
      sn.head.group.rotation.x = Math.sin(now * 2 + sn.phase) * 0.06;
      sn.head.group.rotation.y = Math.PI + Math.sin(now * 0.9 + sn.phase) * 0.12;
      sn.head.tongue.scale.z = 0.35 + Math.max(0, Math.sin(now * 8 + sn.phase)) * 1.6;
      if (sn.bite > 0) {
        sn.bite = Math.max(0, sn.bite - dt * 2.6);
        sn.head.group.position.z = -0.185 - sn.bite * 0.06;
        sn.head.group.rotation.x += sn.bite * 0.35;
      } else {
        sn.head.group.position.z = -0.185;
      }
    }
  }

  function biteNow(c) {
    if (c && c.userData && c.userData.snake) c.userData.snake.bite = 1;
    hapticPulse(c, 0.55);
  }

  function hapticPulse(c, amp) {
    try {
      var gp = c && c.userData && c.userData.gamepad;
      var acts = gp && gp.hapticActuators;
      if (acts && acts.length && acts[0].pulse) acts[0].pulse(amp, 60);
    } catch (eH) {}
  }

  /* Punteros del mando: el rayo sale de la boca y se acorta/colorea según lo que
     tengas delante (tótem = ámbar, pantalla = verde). */
  function updateXRPointers() {
    if (st.mode !== 'xr' || !st.three) return;
    var THREE = st.three;
    var rc = st.rc || (st.rc = new THREE.Raycaster());
    for (var i = 0; i < st.xrControllers.length; i++) {
      var c = st.xrControllers[i];
      if (!c.userData.ray || !c.userData.snake) continue;
      var m = new THREE.Matrix4().extractRotation(c.matrixWorld);
      var o = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
      var d = new THREE.Vector3(0, 0, -1).applyMatrix4(m).normalize();
      rc.set(o, d);
      var len = 7, col = c.userData.snake.color, op = 0.55;
      var hitS = st.spirit ? rc.intersectObject(st.spirit.pickMesh, false) : [];
      var hitM = (st.screenOpen && st.mirrorMesh) ? rc.intersectObject(st.mirrorMesh, false) : [];
      if (hitS.length && (!hitM.length || hitS[0].distance < hitM[0].distance)) {
        len = Math.max(0.12, hitS[0].distance); col = 0xffd24a; op = 0.95;
      } else if (hitM.length) {
        len = Math.max(0.12, hitM[0].distance); col = 0x35ffb2; op = 0.9;
        c.userData.lastUv = hitM[0].uv;
        /* Gatillo mantenido: mover el mando arrastra ventanas e iconos. */
        if (c.userData.press) domMoveUv(hitM[0].uv, c.userData.press);
        /* Stick arriba/abajo: rueda del ratón en la app (scroll de listas). */
        var pad = c.userData.gamepad;
        if (pad && pad.axes && Math.abs(pad.axes[1] || 0) > 0.45) {
          var tW = (global.performance && global.performance.now ? global.performance.now() : Date.now()) / 1000;
          if (!c.userData.wheelT || tW - c.userData.wheelT > 0.12) {
            c.userData.wheelT = tW;
            domWheelUv(hitM[0].uv, (pad.axes[2] || 0) * 90, (pad.axes[1] || 0) * 160);
            try { paintMirror(); } catch (eWp) {}
          }
        }
      }
      var ray = c.userData.ray;
      ray.scale.z = len;
      try { ray.material.color.setHex(col); ray.material.opacity = op; } catch (eRay) {}
    }
  }

  function buildScene(THREE, renderer) {
    var scene = new THREE.Scene();
    scene.background = makeJungleSky(THREE);
    scene.fog = new THREE.Fog(0x04140d, 6.5, 40);

    var camera = new THREE.PerspectiveCamera(72, 1, 0.05, 240);
    var rig = new THREE.Group();
    rig.position.set(0, 1.62, 3.4);
    rig.add(camera);
    scene.add(rig);

    var camL = camera.clone(); camL.position.x = -0.031; rig.add(camL);
    var camR = camera.clone(); camR.position.x = 0.031; rig.add(camR);

    scene.add(new THREE.AmbientLight(0xa8ffce, 0.62));
    var p1 = new THREE.PointLight(0x8dff9a, 1.05, 30); p1.position.set(0.4, 3.4, 2.4); scene.add(p1);
    var p2 = new THREE.PointLight(0xffc46b, 0.7, 30); p2.position.set(-4.2, 2.2, 3.4); scene.add(p2);
    var p3 = new THREE.PointLight(0x35ffd6, 0.6, 28); p3.position.set(4.4, 2.4, 1.2); scene.add(p3);

    /* Suelo de musgo de la jungla */
    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ map: makeGroundTexture(THREE), roughness: 0.98, metalness: 0.04 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    /* Selva: árboles, helechos y lianas */
    var jungle = makeJungle(THREE);
    scene.add(jungle);
    st.jungle = jungle;

    /* Luciérnagas flotando */
    st.fireflies = makeFireflies(THREE);
    scene.add(st.fireflies);

    /* Serpientes que se arrastran por todas partes */
    st.ambient = [];
    for (var sI = 0; sI < 10; sI++) {
      var asn = makeAmbientSnake(THREE, sI);
      scene.add(asn.group);
      st.ambient.push(asn);
    }

    /* Serpiente tótem que te sigue: abre y cierra el escritorio (esquina inferior derecha) */
    st.spirit = makeSpiritSnake(THREE);
    st.spirit.bite = 0;
    st.spirit.group.position.set(0.62, 1.1, 2.15);
    scene.add(st.spirit.group);

    /* Pantalla central: espejo del escritorio (pulsable) */
    var mirrorCanvas = document.createElement('canvas');
    mirrorCanvas.width = MIRROR_W; mirrorCanvas.height = MIRROR_H;
    var mirrorTex = new THREE.CanvasTexture(mirrorCanvas);
    mirrorTex.colorSpace = THREE.SRGBColorSpace;
    try { mirrorTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); } catch (eAn) {}
    var screen = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 2.0),
      new THREE.MeshBasicMaterial({ map: mirrorTex, toneMapped: false })
    );
    screen.position.set(0, 0, 0);
    screen.name = 'snk-vr-screen';

    var frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(3.34, 2.14, 0.07)),
      new THREE.LineBasicMaterial({ color: 0x9dff5a, transparent: true, opacity: 0.9 })
    );
    frame.position.set(0, 0, -0.01);

    var glow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.9, 2.7),
      new THREE.MeshBasicMaterial({ color: 0x0a3a2c, transparent: true, opacity: 0.24, depthWrite: false })
    );
    glow.position.set(0, 0, -0.06);

    /* Grupo de la pantalla: el tótem lo abre (escala 0→1) y lo cierra. */
    var screenGroup = new THREE.Group();
    screenGroup.position.set(0, 1.55, 0);
    screenGroup.scale.setScalar(0.001);
    screenGroup.visible = false;
    screenGroup.add(screen);
    screenGroup.add(frame);
    screenGroup.add(glow);
    scene.add(screenGroup);

    function sidePanel(x, ry) {
      var c = document.createElement('canvas');
      c.width = INFO_W; c.height = INFO_H;
      var tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      try { tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); } catch (eAn2) {}
      var mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.08, 1.52),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true })
      );
      mesh.position.set(x, 1.5, -0.45);
      mesh.rotation.y = ry;
      scene.add(mesh);
      var ring = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1.12, 1.56, 0.04)),
        new THREE.LineBasicMaterial({ color: 0x2f7cff, transparent: true, opacity: 0.7 })
      );
      ring.position.copy(mesh.position);
      ring.rotation.y = ry;
      scene.add(ring);
      return { canvas: c, ctx: c.getContext('2d'), tex: tex };
    }
    var left = sidePanel(-2.55, 0.52);
    var right = sidePanel(2.55, -0.52);

    st.scene = scene;
    st.camera = camera;
    st.camL = camL;
    st.camR = camR;
    st.rig = rig;
    st.mirrorMesh = screen;
    st.floorMesh = floor;
    st.frameMesh = frame;
    st.screenGroup = screenGroup;
    st.screenOpen = false;
    st.screenAnim = 0;
    st.mirrorCanvas = mirrorCanvas;
    st.mirrorCtx = mirrorCanvas.getContext('2d');
    st.mirrorTex = mirrorTex;
    st.leftCanvas = left.canvas; st.leftCtx = left.ctx; st.leftTex = left.tex;
    st.rightCanvas = right.canvas; st.rightCtx = right.ctx; st.rightTex = right.tex;
  }

  /* ---------------- Espejo del escritorio (canvas 2D → textura) ---------------- */
  function rrect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawCover(ctx, img, W, H) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return false;
    var sc = Math.max(W / iw, H / ih);
    ctx.drawImage(img, (W - iw * sc) / 2, (H - ih * sc) / 2, iw * sc, ih * sc);
    return true;
  }

  function vrFont(size, weight, fam) {
    return (weight || 600) + ' ' + size + 'px ' + (fam || 'Inter, system-ui, -apple-system, sans-serif');
  }

  var DOM_SKIP_TAGS = { SCRIPT: 1, STYLE: 1, LINK: 1, META: 1, HEAD: 1, TITLE: 1, NOSCRIPT: 1, TEMPLATE: 1, BASE: 1 };

  function cssAlpha(c) {
    if (!c) return 0;
    c = String(c).trim();
    if (c === 'transparent' || c === 'rgba(0, 0, 0, 0)') return 0;
    if (c.charAt(0) === '#') return 1;
    var m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return 1;
    var p = m[1].split(',');
    return p.length > 3 ? parseFloat(p[3]) : 1;
  }

  /* Primer color de un degradado CSS: sirve de relleno sólido aproximado,
     porque el canvas 2D no puede pintar el degradado tal cual. */
  function firstColor(s) {
    if (!s || s === 'none') return '';
    var m = String(s).match(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/g);
    return m && m.length ? m[0] : '';
  }

  /* Estilos calculados con caché corta: getComputedStyle es caro y el DOM real
     se repinta ~14 veces por segundo en la pantalla. */
  function styleOf(el, now) {
    var cache = st.domStyles || (st.domStyles = new Map());
    var rec = cache.get(el);
    if (rec && (now - rec.t) < 0.7) return rec;
    var cs;
    try { cs = global.getComputedStyle(el); } catch (eG) { cs = null; }
    if (!cs) return { t: now, bg: '', bA: 0, bgi: '', bdW: 0, bdC: '', bdS: 'none', rad: 0, vis: 'visible', disp: 'block', op: 1, of: 'visible', ofx: 'visible', ofy: 'visible', fs: 13, fw: 400, ff: 'sans-serif', color: '#fff', align: 'left', filter: 'none' };
    rec = {
      t: now,
      bg: cs.backgroundColor,
      bA: cssAlpha(cs.backgroundColor),
      bgi: (cs.backgroundImage && cs.backgroundImage.indexOf('gradient') >= 0) ? firstColor(cs.backgroundImage) : '',
      bdW: parseFloat(cs.borderTopWidth) || 0,
      bdC: cs.borderTopColor,
      bdS: cs.borderTopStyle,
      rad: Math.min(28, parseFloat(cs.borderTopLeftRadius) || 0),
      vis: cs.visibility,
      disp: cs.display,
      op: cs.opacity === '' ? 1 : parseFloat(cs.opacity),
      of: cs.overflow, ofx: cs.overflowX, ofy: cs.overflowY,
      fs: parseFloat(cs.fontSize) || 13,
      fw: parseInt(cs.fontWeight, 10) || 400,
      ff: cs.fontFamily || 'sans-serif',
      color: cs.color,
      align: cs.textAlign,
      filter: cs.filter || 'none'
    };
    if (cache.size > 6000) cache.clear();
    cache.set(el, rec);
    return rec;
  }

  /* Texto de un nodo con sus rectángulos reales (cada línea va a su sitio). */
  function drawMirrorText(ctx, node, s, kx, ky) {
    if (!node || !node.nodeValue || !/\S/.test(node.nodeValue)) return;
    var range, rects;
    try {
      range = document.createRange();
      range.selectNodeContents(node);
      rects = range.getClientRects ? range.getClientRects() : null;
    } catch (eR) { return; }
    if (!rects || !rects.length) return;
    var str = String(node.nodeValue).replace(/\s+/g, ' ').trim();
    if (!str) return;
    ctx.font = s.fw + ' ' + Math.max(5, Math.round(s.fs * ky * 10) / 10) + 'px ' + s.ff;
    ctx.fillStyle = s.color;
    ctx.textBaseline = 'middle';
    function put(text, r) {
      if (!text || r.width < 1 || r.height < 1) return;
      var x = r.left * kx, maxW = Math.max(6, r.width * kx + 2);
      if (s.align === 'center') { ctx.textAlign = 'center'; x += (r.width * kx) / 2; }
      else if (s.align === 'right' || s.align === 'end') { ctx.textAlign = 'right'; x += r.width * kx; }
      else ctx.textAlign = 'left';
      ctx.fillText(text, x, (r.top + r.height / 2) * ky, maxW);
    }
    if (rects.length === 1) { put(str, rects[0]); return; }
    /* Varias líneas: reparto aproximado de palabras por rectángulo de línea. */
    var words = str.split(' ');
    var per = Math.ceil(words.length / rects.length);
    for (var i = 0; i < rects.length; i++) {
      if (i * per >= words.length) break;
      put(words.slice(i * per, (i + 1) * per).join(' '), rects[i]);
    }
  }

  /* Pinta un elemento real del DOM (y sus hijos) dentro del canvas del espejo:
     fondo, borde, texto, imágenes, canvas de apps y recorte por overflow. */
  function paintDomNode(ctx, el, kx, ky, depth, alpha, vw, vh, now) {
    if (!el || depth > 16 || st.domBudget <= 0) return;
    var tag = el.tagName;
    if (!tag || DOM_SKIP_TAGS[tag]) return;
    if (el.id === 'snk-vr-root' || el.id === 'snk-vr-note' || el.id === 'wpCustomImg') return;
    if (el.classList && (el.classList.contains('snk-vr-canvas') || el.classList.contains('snk-vr-hud'))) return;
    st.domBudget--;
    var r;
    try { r = el.getBoundingClientRect(); } catch (eR2) { return; }
    if (!r || r.width < 1 || r.height < 1) return;
    if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) return;
    var s = styleOf(el, now);
    if (s.disp === 'none' || s.vis === 'hidden' || s.vis === 'collapse') return;
    if (s.filter && s.filter.indexOf('blur') >= 0) return;
    var op = clampN(alpha * (isFinite(s.op) ? s.op : 1), 0, 1);
    if (op < 0.03) return;
    ctx.globalAlpha = op;
    var x = r.left * kx, y = r.top * ky, w = r.width * kx, h = r.height * ky;
    var bgFill = (s.bA > 0.03) ? s.bg : (s.bgi || '');
    if (bgFill) {
      ctx.fillStyle = bgFill;
      if (s.rad > 0) {
        rrect(ctx, x, y, w, h, Math.min(s.rad * Math.min(kx, ky), w / 2, h / 2));
        ctx.fill();
      } else ctx.fillRect(x, y, w, h);
    }
    if (s.bdW > 0 && s.bdS !== 'none' && cssAlpha(s.bdC) > 0.05) {
      ctx.strokeStyle = s.bdC;
      ctx.lineWidth = Math.max(1, s.bdW * Math.min(kx, ky));
      if (s.rad > 0) {
        rrect(ctx, x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1), Math.max(0, Math.min(s.rad * Math.min(kx, ky), w / 2, h / 2) - 1));
        ctx.stroke();
      } else ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1));
    }
    /* Contenido propio: canvas de las apps, imágenes y campos de texto. */
    if (tag === 'CANVAS' || tag === 'VIDEO') {
      try { ctx.drawImage(el, x, y, w, h); } catch (eCv) {}
    } else if (tag === 'IMG') {
      try { if (el.complete !== false && el.naturalWidth !== 0) ctx.drawImage(el, x, y, w, h); } catch (eIm) {}
    } else if (tag === 'INPUT' || tag === 'TEXTAREA') {
      var val = String(el.value || '');
      var show = val || String(el.getAttribute('placeholder') || '');
      if (show) {
        ctx.font = s.fw + ' ' + Math.max(5, Math.round(s.fs * ky * 10) / 10) + 'px ' + s.ff;
        ctx.fillStyle = val ? s.color : 'rgba(190,210,200,.55)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(show.slice(0, 90), x + 4 * kx, y + h / 2, Math.max(6, w - 8));
      }
    }
    var clip = (s.of !== 'visible' || s.ofx !== 'visible' || s.ofy !== 'visible');
    if (clip) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
    }
    var kids = el.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 3) {
        drawMirrorText(ctx, k, s, kx, ky);
        ctx.globalAlpha = op;
      } else if (k.nodeType === 1) {
        paintDomNode(ctx, k, kx, ky, depth + 1, op, vw, vh, now);
        ctx.globalAlpha = op;
      }
    }
    if (clip) ctx.restore();
  }

  function paintMirror() {
    var ctx = st.mirrorCtx;
    if (!ctx) return;
    var W = MIRROR_W, H = MIRROR_H;
    var vw = Math.max(320, global.innerWidth || 1280), vh = Math.max(240, global.innerHeight || 800);
    var kx = W / vw, ky = H / vh;
    var now = (global.performance && global.performance.now ? global.performance.now() : Date.now()) / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);

    /* 1) Fondo del escritorio (papel pintado propio o degradados del tema). */
    var wp = document.getElementById('wpCustomImg'), okBg = false;
    if (wp && wp.complete && wp.naturalWidth) {
      try { okBg = wp.getBoundingClientRect().width > 0 && drawCover(ctx, wp, W, H); } catch (e0) {}
    }
    if (!okBg) {
      var g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#07131c'); g.addColorStop(0.55, '#081726'); g.addColorStop(1, '#04080f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      var rg = ctx.createRadialGradient(W * 0.2, H * 0.15, 0, W * 0.2, H * 0.15, W * 0.55);
      rg.addColorStop(0, 'rgba(53,255,178,.20)'); rg.addColorStop(1, 'rgba(53,255,178,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      var rg2 = ctx.createRadialGradient(W * 0.85, H * 0.8, 0, W * 0.85, H * 0.8, W * 0.5);
      rg2.addColorStop(0, 'rgba(47,124,255,.22)'); rg2.addColorStop(1, 'rgba(47,124,255,0)');
      ctx.fillStyle = rg2; ctx.fillRect(0, 0, W, H);
    }

    /* 2) El escritorio REAL, tal cual está en el ordenador: iconos, ventanas con
     *    el contenido de sus apps, barra de tareas, menú Inicio, menús y avisos.
     *    Se recorren los hijos del body salvo el propio visor VR. */
    st.domBudget = 3200;
    var body = document.body;
    if (body && body.children) {
      for (var bi = 0; bi < body.children.length; bi++) {
        try { paintDomNode(ctx, body.children[bi], kx, ky, 0, 1, vw, vh, now); } catch (eNode) {}
        ctx.globalAlpha = 1;
      }
    }

    /* 3) Marco del visor: esquinas, etiqueta y viñeta (identidad del VR). */
    var m = 16, l = 46;
    ctx.strokeStyle = 'rgba(53,255,178,.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(m, m + l); ctx.lineTo(m, m); ctx.lineTo(m + l, m);
    ctx.moveTo(W - m - l, m); ctx.lineTo(W - m, m); ctx.lineTo(W - m, m + l);
    ctx.moveTo(m, H - m - l); ctx.lineTo(m, H - m); ctx.lineTo(m + l, H - m);
    ctx.moveTo(W - m - l, H - m); ctx.lineTo(W - m, H - m); ctx.lineTo(W - m, H - m - l);
    ctx.stroke();
    ctx.font = vrFont(Math.max(12, Math.round(14 * ky)), 700);
    ctx.fillStyle = 'rgba(141,255,207,.8)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('SNAKE OS · VR · ' + clockText(), m + 12, m + 8);

    var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    if (st.mirrorTex) st.mirrorTex.needsUpdate = true;
    /* Coste del pintado: el bucle lo usa para bajar o subir los repintados. */
    st.paintCost = ((global.performance && global.performance.now ? global.performance.now() : Date.now()) / 1000) - now;
  }

  /* ---------------- Paneles laterales (estado y ayuda) ---------------- */
  function wrapText(ctx, text, x, y, maxW, lh, maxLines) {
    var words = String(text || '').split(/\s+/), line = '', n = 0;
    for (var i = 0; i < words.length; i++) {
      var test = line ? (line + ' ' + words[i]) : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y);
        y += lh; line = words[i]; n++;
        if (n >= maxLines - 1 && i < words.length - 1) {
          var rest = words.slice(i).join(' ');
          while (rest.length > 3 && ctx.measureText(rest + '…').width > maxW) rest = rest.slice(0, -1);
          ctx.fillText(rest + '…', x, y);
          return y + lh;
        }
      } else line = test;
    }
    if (line) ctx.fillText(line, x, y);
    return y + lh;
  }

  function panelBg(ctx, W, H, c1, c2, accent) {
    ctx.clearRect(0, 0, W, H);
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g;
    rrect(ctx, 2, 2, W - 4, H - 4, 22);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    rrect(ctx, 3, 3, W - 6, H - 6, 22);
    ctx.stroke();
  }

  function openWindowTitles() {
    var out = [];
    var wins = document.querySelectorAll('#windows .app-window');
    for (var i = 0; i < wins.length; i++) {
      var t = wins[i].querySelector('.win-title');
      if (!t) continue;
      var tx = String(t.textContent || '').replace(/\s+/g, ' ').trim();
      if (tx && out.indexOf(tx) === -1) out.push(tx);
    }
    return out;
  }

  function paintInfo() {
    var L = st.leftCtx, R = st.rightCtx;
    if (!L || !R) return;
    var W = INFO_W, H = INFO_H;
    var openTitles = openWindowTitles();

    /* --- Izquierdo: estado --- */
    panelBg(L, W, H, 'rgba(6,35,28,.96)', 'rgba(4,16,24,.96)', 'rgba(53,255,178,.75)');
    L.textAlign = 'left'; L.textBaseline = 'alphabetic';
    L.font = vrFont(34, 800, 'Outfit, Inter, system-ui, sans-serif');
    L.fillStyle = '#8dffcf';
    L.fillText('🥽 SNAKE VR', 34, 76);
    L.font = vrFont(19, 600);
    L.fillStyle = 'rgba(223,251,234,.72)';
    L.fillText(vrT('Escritorio inmersivo', 'Immersive desktop'), 34, 108);

    L.font = vrFont(104, 800, 'Outfit, Inter, system-ui, sans-serif');
    L.fillStyle = '#ffffff';
    L.fillText(clockText(), 30, 224);
    L.font = vrFont(20, 600);
    L.fillStyle = 'rgba(223,251,234,.78)';
    var dt = dateText();
    L.fillText(dt.charAt(0).toUpperCase() + dt.slice(1), 34, 258);

    L.strokeStyle = 'rgba(120,200,180,.32)';
    L.lineWidth = 2;
    L.beginPath(); L.moveTo(34, 290); L.lineTo(W - 34, 290); L.stroke();

    L.font = vrFont(15, 700);
    L.fillStyle = 'rgba(141,255,207,.85)';
    L.fillText(vrT('VERSIÓN', 'VERSION'), 34, 326);
    L.font = vrFont(24, 800);
    L.fillStyle = '#eafff4';
    L.fillText(String(global.SNAKE_OS_VERSION || VR_VERSION), 34, 358);

    L.strokeStyle = 'rgba(120,200,180,.32)';
    L.lineWidth = 2;
    L.beginPath(); L.moveTo(34, 378); L.lineTo(W - 34, 378); L.stroke();

    L.font = vrFont(15, 700);
    L.fillStyle = 'rgba(141,255,207,.85)';
    L.fillText(vrT('ESCRITORIO', 'DESKTOP'), 34, 408);
    L.font = vrFont(19, 700);
    L.fillStyle = st.screenOpen ? '#8dffcf' : '#ffd28a';
    L.fillText(st.screenOpen
      ? vrT('Abierto en la pantalla', 'Open on the screen')
      : vrT('Cerrado: muerde al tótem', 'Closed: bite the totem'), 34, 438);

    L.font = vrFont(15, 700);
    L.fillStyle = 'rgba(141,255,207,.85)';
    L.fillText(vrT('APPS ABIERTAS', 'OPEN APPS') + ' · ' + openTitles.length, 34, 480);
    L.font = vrFont(17, 600);
    var y = 512;
    if (!openTitles.length) {
      L.fillStyle = 'rgba(234,255,244,.55)';
      wrapText(L, vrT('Ninguna: toca un icono en la pantalla', 'None: tap an icon on the screen'), 34, y, W - 68, 26, 2);
      y += 30;
    }
    for (var k = 0; k < Math.min(4, openTitles.length); k++) {
      var name = openTitles[k];
      if (name.length > 24) name = name.slice(0, 23) + '…';
      L.fillStyle = 'rgba(234,255,244,.9)';
      L.fillText('▸ ' + name, 34, y);
      y += 30;
    }

    L.font = vrFont(15, 700);
    L.fillStyle = 'rgba(141,255,207,.85)';
    L.fillText(vrT('GAFAS', 'HEADSET'), 34, H - 96);
    var xrReady = !!st.xrSession || st.xrReady;
    L.font = vrFont(19, 700);
    L.fillStyle = xrReady ? '#8dffcf' : 'rgba(234,255,244,.62)';
    L.fillText(xrReady ? 'WebXR ✓ ' + vrT('listo', 'ready') : (st.mode === 'sbs' ? 'Cardboard (SBS)' : vrT('visor con ratón', 'mouse viewer')), 34, H - 64);
    L.font = vrFont(14, 500);
    L.fillStyle = 'rgba(234,255,244,.45)';
    L.fillText('snake-os-vp.softportweb.com', 34, H - 34);
    if (st.leftTex) st.leftTex.needsUpdate = true;

    paintInfoRight(R, W, H);
  }

  function paintInfoRight(R, W, H) {
    /* --- Derecho: novedades y controles --- */
    panelBg(R, W, H, 'rgba(8,20,36,.96)', 'rgba(4,10,20,.96)', 'rgba(47,124,255,.75)');
    R.textAlign = 'left'; R.textBaseline = 'alphabetic';
    R.font = vrFont(30, 800, 'Outfit, Inter, system-ui, sans-serif');
    R.fillStyle = '#9cc8ff';
    R.fillText(vrT('NOVEDADES', 'WHAT’S NEW'), 34, 68);
    var en = false;
    try { en = (global.snakeI18n && global.snakeI18n.lang === 'en') || document.documentElement.getAttribute('lang') === 'en'; } catch (eL) {}
    var changes = global.SNAKE_OS_CHANGES || [];
    var list = (changes[0] && (en ? changes[0].en : changes[0].es)) || [];
    R.font = vrFont(17, 600);
    var ry = 104;
    for (var c = 0; c < Math.min(3, list.length); c++) {
      R.fillStyle = 'rgba(53,255,178,.95)';
      R.fillText('•', 34, ry);
      R.fillStyle = 'rgba(234,255,244,.9)';
      ry = wrapText(R, list[c], 52, ry, W - 84, 23, 4) + 14;
      if (ry > 470) break;
    }
    R.strokeStyle = 'rgba(120,160,220,.3)';
    R.lineWidth = 2;
    R.beginPath(); R.moveTo(34, 500); R.lineTo(W - 34, 500); R.stroke();
    R.font = vrFont(20, 800, 'Outfit, Inter, system-ui, sans-serif');
    R.fillStyle = '#9cc8ff';
    R.fillText(vrT('CONTROLES', 'CONTROLS'), 34, 540);
    R.font = vrFont(16, 600);
    R.fillStyle = 'rgba(234,255,244,.86)';
    var lines = vrT(
      '🐍 Mandos: serpientes que apuntan y muerden|🎮 Gatillo: clic · mantener y mover: arrastrar|▣ Mando apretado sobre la pantalla: clic derecho|🕹 Stick: desplazar la app (rueda)|🔮 Tótem abajo a la derecha: abre/cierra el escritorio|🖐 Muerde el suelo: moverte|🌿 Jungla viva con serpientes|🧭 Giroscopio · 👓 SBS · doble clic: recentrar',
      '🐍 Controllers: snakes that aim and bite|🎮 Trigger: click · hold and move: drag|▣ Squeeze on the screen: right click|🕹 Stick: scroll the app (wheel)|🔮 Totem bottom-right: open/close the desktop|🖐 Bite the floor: move|🌿 Living jungle full of snakes|🧭 Gyro · 👓 SBS · double click: recenter'
    ).split('|');
    var ly = 576;
    for (var l = 0; l < lines.length; l++) {
      ly = wrapText(R, '▸ ' + lines[l], 34, ly, W - 74, 24, 2) + 2;
      if (ly > H - 44) break;
    }
    R.font = vrFont(13, 500);
    R.fillStyle = 'rgba(156,200,255,.5)';
    R.fillText(VR_VERSION, W - 34 - R.measureText(VR_VERSION).width, H - 30);
    if (st.rightTex) st.rightTex.needsUpdate = true;
  }

  /* ---------------- Interacción (ratón, táctil, teclado, giroscopio) ---------------- */
  function clampN(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function applyLook() {
    if (!st.camera || st.mode === 'xr') return;
    st.camera.rotation.order = 'YXZ';
    st.camera.rotation.y = st.yaw;
    st.camera.rotation.x = st.pitch;
  }

  function recenter() {
    st.yaw = 0;
    st.pitch = -0.05;
    if (st.rig) st.rig.position.set(0, 1.62, 3.4);
    applyLook();
  }

  function flashAtPoint(p) {
    if (!st.three || !st.scene || !p) return;
    var THREE = st.three;
    if (!st.flashMesh) {
      st.flashMesh = new THREE.Mesh(
        new THREE.CircleGeometry(0.055, 24),
        new THREE.MeshBasicMaterial({ color: 0x35ffb2, transparent: true, opacity: 0.9, depthWrite: false })
      );
      st.scene.add(st.flashMesh);
    }
    st.flashMesh.position.set(p.x, p.y, p.z + 0.02);
    st.flashMesh.material.opacity = 0.9;
    st.flashT = 0.0001;
  }

  function pickDomAt(px, py) {
    var els;
    try { els = document.elementsFromPoint(px, py); } catch (e) { return null; }
    if (!els) return null;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el) continue;
      if (st.root && (el === st.root || st.root.contains(el))) continue;
      if (el.closest && el.closest('#snk-vr-root,#snk-vr-note')) continue;
      return el;
    }
    return null;
  }

  /* ---------------- Ratón REAL del escritorio (igual que en el ordenador) ----------------
   * La pantalla del VR se comporta como el escritorio del PC: los eventos se inyectan
   * como PointerEvent/MouseEvent/WheelEvent de verdad en el elemento que hay debajo
   * del rayo, así funcionan los arrastres de ventanas e iconos, el doble clic, los
   * menús contextuales (clic derecho) y la rueda dentro de las apps. */
  var DOM_PID = 1;

  function fireDom(el, type, x, y, extra) {
    if (!el || !el.dispatchEvent) return;
    extra = extra || {};
    var isUp = (type === 'pointerup' || type === 'mouseup');
    var common = {
      bubbles: true, cancelable: true, composed: true, view: global,
      clientX: x, clientY: y, screenX: x, screenY: y,
      button: extra.button || 0,
      buttons: extra.buttons != null ? extra.buttons : (isUp ? 0 : (extra.button === 2 ? 2 : 1)),
      pointerId: DOM_PID, pointerType: 'mouse', isPrimary: true,
      width: 1, height: 1,
      pressure: isUp ? 0 : 0.5
    };
    try {
      if (typeof PointerEvent === 'function' && type.indexOf('pointer') === 0) {
        el.dispatchEvent(new PointerEvent(type, common));
      }
    } catch (eP) {}
    try {
      var mt = type.indexOf('pointer') === 0 ? type.replace('pointer', 'mouse') : type;
      if (mt === 'mousedown' || mt === 'mouseup' || mt === 'mousemove' || mt === 'click' || mt === 'dblclick' || mt === 'contextmenu') {
        el.dispatchEvent(new MouseEvent(mt, common));
      }
    } catch (eM) {}
  }

  function domPointFromUv(uv) {
    var vw = Math.max(320, global.innerWidth || 1280), vh = Math.max(240, global.innerHeight || 800);
    var px = clampN(uv.x, 0, 1) * vw;
    var py = (1 - clampN(uv.y, 0, 1)) * vh;
    return { x: px, y: py, el: pickDomAt(px, py) };
  }

  /* Pulsar: pointerdown + mousedown + foco en campos de texto. */
  function domPressUv(uv) {
    var a = domPointFromUv(uv);
    if (!a.el) return null;
    fireDom(a.el, 'pointerdown', a.x, a.y);
    fireDom(a.el, 'mousedown', a.x, a.y);
    try {
      var f = a.el.closest ? a.el.closest('input,textarea,select') : null;
      if (f && f.focus) f.focus({ preventScroll: true });
      else if (a.el.focus) a.el.focus({ preventScroll: true });
    } catch (eF) {}
    return { x: a.x, y: a.y, moved: 0, t: Date.now(), el: a.el };
  }

  /* Mover con el botón pulsado: arrastra ventanas, iconos y selecciona texto. */
  function domMoveUv(uv, press) {
    if (!press || !uv) return;
    var a = domPointFromUv(uv);
    var el = a.el || press.el;
    if (!el) return;
    press.moved += Math.abs(a.x - press.x) + Math.abs(a.y - press.y);
    press.x = a.x;
    press.y = a.y;
    fireDom(el, 'pointermove', a.x, a.y);
    fireDom(el, 'mousemove', a.x, a.y);
  }

  /* Soltar: pointerup + mouseup y, si no arrastró, click (y dblclick al repetir). */
  function domReleaseUv(uv, press) {
    if (!press) return false;
    if (uv) domMoveUv(uv, press);
    var a = uv ? domPointFromUv(uv) : { x: press.x, y: press.y, el: pickDomAt(press.x, press.y) };
    var el = a.el || press.el;
    if (!el) return false;
    fireDom(el, 'pointerup', a.x, a.y);
    fireDom(el, 'mouseup', a.x, a.y);
    var now = Date.now();
    var clicked = press.moved < 14 && (now - press.t) < 1500;
    if (clicked) {
      fireDom(el, 'click', a.x, a.y);
      var last = st.deskLastTap;
      if (last && now - last.t < 460 && Math.abs(a.x - last.x) < 16 && Math.abs(a.y - last.y) < 16) {
        fireDom(el, 'dblclick', a.x, a.y);
        st.deskLastTap = null;
      } else {
        st.deskLastTap = { t: now, x: a.x, y: a.y };
      }
    }
    return clicked;
  }

  /* Clic derecho: pointerdown/mousedown + contextmenu + up (menú contextual). */
  function domRightClickUv(uv) {
    var a = domPointFromUv(uv);
    if (!a.el) return false;
    fireDom(a.el, 'pointerdown', a.x, a.y, { button: 2, buttons: 2 });
    fireDom(a.el, 'mousedown', a.x, a.y, { button: 2, buttons: 2 });
    fireDom(a.el, 'contextmenu', a.x, a.y, { button: 2, buttons: 2 });
    fireDom(a.el, 'pointerup', a.x, a.y, { button: 2, buttons: 2 });
    fireDom(a.el, 'mouseup', a.x, a.y, { button: 2, buttons: 0 });
    return true;
  }

  /* Rueda del ratón en la app que esté bajo el rayo (scroll de listas y paneles). */
  function domWheelUv(uv, dx, dy) {
    var a = domPointFromUv(uv);
    if (!a.el) return false;
    try {
      a.el.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, clientX: a.x, clientY: a.y,
        deltaX: dx || 0, deltaY: dy || 0, deltaMode: 0
      }));
    } catch (eW) {}
    return true;
  }

  /* Clic rápido completo (compatibilidad con el código anterior). */
  function clickDomFromUv(uv) {
    if (!uv) return false;
    var press = domPressUv(uv);
    if (!press) return false;
    domReleaseUv(uv, press);
    return true;
  }

  /* UV del punto de la pantalla que hay bajo un punto de la ventana (modo ratón). */
  function screenUvAt(cx, cy) {
    if (!st.three || !st.camera || !st.screenOpen || !st.mirrorMesh) return null;
    var w = global.innerWidth || 1280, h = global.innerHeight || 800;
    var rc = new st.three.Raycaster();
    rc.setFromCamera(new st.three.Vector2((cx / w) * 2 - 1, -(cy / h) * 2 + 1), st.camera);
    var hits = rc.intersectObject(st.mirrorMesh, false);
    return (hits && hits.length && hits[0].uv) ? hits[0].uv : null;
  }

  /* ¿El ratón/dedo está encima del tótem? (va delante de la pantalla y manda). */
  function spiritHitAt(cx, cy) {
    if (!st.three || !st.camera || !st.spirit) return false;
    var w = global.innerWidth || 1280, h = global.innerHeight || 800;
    var rc = new st.three.Raycaster();
    rc.setFromCamera(new st.three.Vector2((cx / w) * 2 - 1, -(cy / h) * 2 + 1), st.camera);
    return rc.intersectObject(st.spirit.pickMesh, false).length > 0;
  }

  function tapAt(cx, cy) {
    if (!st.three || !st.camera) return;
    var now = Date.now();
    var w = global.innerWidth || 1280, h = global.innerHeight || 800;
    var ndc = new st.three.Vector2((cx / w) * 2 - 1, -(cy / h) * 2 + 1);
    var rc = new st.three.Raycaster();
    rc.setFromCamera(ndc, st.camera);
    /* 1) La serpiente tótem que te sigue: abre o cierra el escritorio. */
    if (st.spirit && rc.intersectObject(st.spirit.pickMesh, false).length) {
      toggleScreen();
      st.lastTap = 0;
      return;
    }
    /* 2) La pantalla gigante (solo si el tótem ya la ha abierto). */
    if (st.screenOpen && st.mirrorMesh) {
      var hits = rc.intersectObject(st.mirrorMesh, false);
      if (hits && hits.length && hits[0].uv) {
        flashAtPoint(hits[0].point);
        var didClick = clickDomFromUv(hits[0].uv);
        st.lastTap = didClick ? 0 : now;
        return;
      }
    }
    /* Fuera de la pantalla: doble toque = recentrar. */
    if (now - st.lastTap < 340) { st.lastTap = 0; recenter(); }
    else st.lastTap = now;
  }

  function moveForward(d) {
    if (!st.rig || !st.three || st.mode === 'xr') return;
    var fwd = new st.three.Vector3(0, 0, -1).applyEuler(new st.three.Euler(0, st.yaw, 0));
    st.rig.position.addScaledVector(fwd, d);
    st.rig.position.x = clampN(st.rig.position.x, -7, 7);
    st.rig.position.z = clampN(st.rig.position.z, -6, 14);
  }

  function toggleSbs(on) {
    if (st.mode === 'xr') return;
    st.mode = on ? 'sbs' : 'mono';
    savePrefs({ sbs: !!on });
    try {
      if (on && global.screen && global.screen.orientation && global.screen.orientation.lock) {
        var pr = global.screen.orientation.lock('landscape');
        if (pr && pr.catch) pr.catch(function () {});
      }
    } catch (eL) {}
    resize();
    syncHud();
  }

  function syncHud() {
    var root = st.root;
    if (!root) return;
    var gyro = root.querySelector('[data-vr="gyro"]');
    var sbs = root.querySelector('[data-vr="sbs"]');
    var xr = root.querySelector('[data-vr="xr"]');
    var scr = root.querySelector('[data-vr="screen"]');
    if (gyro) gyro.setAttribute('aria-pressed', st.gyro ? 'true' : 'false');
    if (sbs) sbs.setAttribute('aria-pressed', st.mode === 'sbs' ? 'true' : 'false');
    if (xr) xr.setAttribute('aria-pressed', st.mode === 'xr' ? 'true' : 'false');
    if (scr) scr.setAttribute('aria-pressed', st.screenOpen ? 'true' : 'false');
  }

  function disableGyro() {
    if (st.gyroHandler) {
      try { global.removeEventListener('deviceorientation', st.gyroHandler, true); } catch (e) {}
      st.gyroHandler = null;
    }
    st.gyro = false;
    st.gyroBase = null;
    syncHud();
  }

  function enableGyro() {
    if (st.gyro) { disableGyro(); return; }
    var DOE = global.DeviceOrientationEvent;
    if (!DOE) {
      showNote(vrT('Sin giroscopio', 'No gyroscope'),
        vrT('Este dispositivo no tiene sensores de orientación. Puedes mirar arrastrando el dedo o el ratón.',
          'This device has no orientation sensors. You can look by dragging a finger or the mouse.'));
      return;
    }
    function attach() {
      st.gyroBase = null;
      st.gyroHandler = function (ev) {
        if (ev.alpha == null) return;
        var a = ev.alpha * Math.PI / 180;
        var b = (ev.beta == null ? 0 : ev.beta) * Math.PI / 180;
        if (!st.gyroBase) st.gyroBase = { a: a, b: b };
        st.yaw = -(a - st.gyroBase.a);
        st.pitch = clampN((b - st.gyroBase.b) - 0.05, -1.25, 1.15);
        applyLook();
      };
      global.addEventListener('deviceorientation', st.gyroHandler, true);
      st.gyro = true;
      syncHud();
    }
    if (typeof DOE.requestPermission === 'function') {
      var pr = DOE.requestPermission();
      if (pr && pr.then) {
        pr.then(function (r) {
          if (r === 'granted') attach();
          else showNote(vrT('Permiso denegado', 'Permission denied'),
            vrT('El navegador no ha dejado usar el giroscopio. Arrastra el dedo para mirar.',
              'The browser did not allow the gyroscope. Drag your finger to look.'));
        }).catch(function () {
          showNote(vrT('Permiso denegado', 'Permission denied'),
            vrT('El navegador no ha dejado usar el giroscopio. Arrastra el dedo para mirar.',
              'The browser did not allow the gyroscope. Drag your finger to look.'));
        });
      }
    } else attach();
  }

  function bindInput() {
    var c = st.canvas;
    c.addEventListener('pointerdown', function (e) {
      if (st.mode === 'xr') return;
      /* Si se pulsa sobre el escritorio abierto, es ratón real del PC:
         pulsar = clic, mantener y mover = arrastrar ventanas/iconos.
         El tótem va delante de la pantalla, así que se mira él primero. */
      if (!spiritHitAt(e.clientX, e.clientY)) {
        var uv = screenUvAt(e.clientX, e.clientY);
        if (uv) {
          st.deskDrag = domPressUv(uv);
          st.pointer = null;
          try { c.setPointerCapture(e.pointerId); } catch (eP0) {}
          try { paintMirror(); } catch (ePP) {}
          return;
        }
      }
      st.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), moved: 0 };
      try { c.setPointerCapture(e.pointerId); } catch (eP) {}
    });
    c.addEventListener('pointermove', function (e) {
      if (st.deskDrag) {
        var uvD = screenUvAt(e.clientX, e.clientY);
        if (uvD) domMoveUv(uvD, st.deskDrag);
        return;
      }
      var p = st.pointer;
      if (!p || p.id !== e.pointerId) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      p.moved += Math.abs(dx) + Math.abs(dy);
      if (p.moved > 6 && !st.gyro) {
        st.yaw -= dx * 0.0031;
        st.pitch = clampN(st.pitch - dy * 0.0031, -1.25, 1.15);
        applyLook();
      }
    });
    function finish(e, up) {
      if (st.deskDrag) {
        var d = st.deskDrag;
        st.deskDrag = null;
        if (up) {
          var uvU = screenUvAt(e.clientX, e.clientY);
          try { domReleaseUv(uvU, d); } catch (eRel) {}
        }
        try { paintMirror(); } catch (ePP2) {}
        return;
      }
      var p = st.pointer;
      if (!p || p.id !== e.pointerId) return;
      st.pointer = null;
      if (!up) return;
      if ((Date.now() - p.t) < 450 && p.moved < 9) tapAt(p.x, p.y);
    }
    c.addEventListener('pointerup', function (e) { finish(e, true); });
    c.addEventListener('pointercancel', function (e) { finish(e, false); });
    c.addEventListener('wheel', function (e) {
      if (st.mode === 'xr') return;
      e.preventDefault();
      /* Rueda sobre el escritorio = desplazar la app (igual que en el PC);
         rueda fuera de él = acercarse o alejarse en la jungla. */
      var uvW = screenUvAt(e.clientX, e.clientY);
      if (uvW) {
        domWheelUv(uvW, e.deltaX, e.deltaY);
        try { paintMirror(); } catch (ePP3) {}
        return;
      }
      moveForward(-e.deltaY * 0.0022);
    }, { passive: false });

    var pad = st.root.querySelector('.snk-vr-pad');
    if (pad) {
      var MAPM = { fwd: 'w', back: 's', left: 'a', right: 'd' };
      Array.prototype.forEach.call(pad.querySelectorAll('button'), function (b) {
        var key = MAPM[b.getAttribute('data-move')];
        function on(e) { if (e && e.cancelable) { try { e.preventDefault(); } catch (eP1) {} } st.keys[key] = true; }
        function off() { st.keys[key] = false; }
        b.addEventListener('pointerdown', on);
        b.addEventListener('pointerup', off);
        b.addEventListener('pointerleave', off);
        b.addEventListener('pointercancel', off);
      });
    }
  }

  var KEY_MAP = { w: 'w', a: 'a', s: 's', d: 'd', arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd' };

  function bindKeys() {
    if (st.onKeyDown) return;
    st.onKeyDown = function (e) {
      if (!st.open || st.mode === 'xr') return;
      var k = String(e.key || '').toLowerCase();
      if (k === 'escape') { close(); return; }
      if (KEY_MAP[k]) {
        st.keys[KEY_MAP[k]] = true;
        if (e.cancelable) { try { e.preventDefault(); } catch (eK1) {} }
      }
    };
    st.onKeyUp = function (e) {
      var k = String(e.key || '').toLowerCase();
      if (KEY_MAP[k]) st.keys[KEY_MAP[k]] = false;
    };
    global.addEventListener('keydown', st.onKeyDown, true);
    global.addEventListener('keyup', st.onKeyUp, true);
  }

  function unbindKeys() {
    if (st.onKeyDown) { try { global.removeEventListener('keydown', st.onKeyDown, true); } catch (e) {} }
    if (st.onKeyUp) { try { global.removeEventListener('keyup', st.onKeyUp, true); } catch (e2) {} }
    st.onKeyDown = null;
    st.onKeyUp = null;
  }

  function resize() {
    if (!st.renderer || !st.canvas) return;
    if (st.renderer.xr && st.renderer.xr.isPresenting) return;
    var w = st.canvas.clientWidth || global.innerWidth || 1280;
    var h = st.canvas.clientHeight || global.innerHeight || 800;
    var dpr = Math.min(global.devicePixelRatio || 1, 1.6);
    st.renderer.setPixelRatio(dpr);
    st.renderer.setSize(w, h, false);
    var aspect = (st.mode === 'sbs') ? (w / 2) / h : w / h;
    if (st.camera) { st.camera.aspect = aspect; st.camera.updateProjectionMatrix(); }
    if (st.camL) { st.camL.aspect = aspect; st.camL.updateProjectionMatrix(); }
    if (st.camR) { st.camR.aspect = aspect; st.camR.updateProjectionMatrix(); }
  }

  /* ---------------- WebXR (gafas de verdad) ---------------- */
  function xrNotAvailableNote() {
    showNote(vrT('VR real no disponible', 'True VR not available'),
      vrT('Este navegador no ofrece WebXR immersive-vr. Puedes usar 👓 Gafas (SBS) con gafas de cartón, ' +
        'o abrir Snake OS en el navegador de Meta Quest / un PC con visor VR.',
        'This browser does not offer WebXR immersive-vr. You can use 👓 Headset (SBS) with cardboard goggles, ' +
        'or open Snake OS in the Meta Quest browser / a PC with a VR headset.'));
  }

  function enterXR() {
    var nav = global.navigator;
    if (!nav || !nav.xr || !nav.xr.requestSession) { xrNotAvailableNote(); return; }
    if (!st.renderer || !st.three) {
      showNote(vrT('Preparando Snake VR…', 'Preparing Snake VR…'),
        vrT('La escena 3D aún se está cargando. Espera un segundo y vuelve a pulsar 🥽 VR real.',
          'The 3D scene is still loading. Wait a second and press 🥽 True VR again.'));
      return;
    }
    var sup;
    try { sup = nav.xr.isSessionSupported('immersive-vr'); } catch (eS) { xrNotAvailableNote(); return; }
    Promise.resolve(sup).then(function (ok) {
      if (!ok) { xrNotAvailableNote(); return; }
      return nav.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] })
        .then(startXRSession)
        .catch(function () {
          showNote(vrT('No se pudo entrar en VR', 'Could not enter VR'),
            vrT('El navegador no ha concedido la sesión de realidad virtual. Comprueba que las gafas están conectadas y permite la entrada.',
              'The browser did not grant the VR session. Check the headset is connected and allow entering.'));
        });
    }).catch(function () { xrNotAvailableNote(); });
  }

  function startXRSession(session) {
    var THREE = st.three, r = st.renderer;
    if (!THREE || !r) return;
    st.xrSession = session;
    st.mode = 'xr';
    st.rig.position.set(0, 0, 3.4);
    r.xr.enabled = true;
    try { r.xr.setReferenceSpaceType('local-floor'); } catch (eRef) {}
    r.xr.setSession(session);
    setupXRControllers();
    session.addEventListener('end', function () {
      st.xrSession = null;
      try { r.xr.enabled = false; } catch (eE) {}
      st.mode = 'mono';
      st.rig.position.set(0, 1.62, 3.4);
      st.xrMoveTo = null;
      resize();
      syncHud();
    });
    syncHud();
    paintInfo();
  }

  function teleportTo(p) {
    if (!st.rig || !st.three) return;
    st.xrMoveTo = new st.three.Vector3(p.x, 0, p.z);
  }

  function onCtrlConnected(c) {
    return function (ev) {
      c.userData.gamepad = ev.data.gamepad;
      /* Si las gafas dan el espacio de la empuñadura, la serpiente se
         enrolla ahí (mejor alineada con la mano). */
      try {
        if (ev.data.gripSpace && c.userData.snakeNest === undefined) {
          c.userData.snakeNest = true;
        }
      } catch (eGrip) {}
    };
  }

  function setupXRControllers() {
    if (st.xrControllers.length) return;
    var THREE = st.three, r = st.renderer;
    var rc = new THREE.Raycaster();
    var rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    st.handSnakes = [];
    for (var i = 0; i < 2; i++) {
      var c = r.xr.getController(i);
      /* Mando-serpiente: cuerpo enrollado, cabeza con ojos y lengua al frente */
      var snake = makeControllerSnake(THREE, i);
      c.add(snake.group);
      st.handSnakes.push(snake);
      /* El rayo sale de la boca de la serpiente */
      var line = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: snake.color, transparent: true, opacity: 0.6 }));
      line.position.set(0, 0.005, -0.2);
      line.scale.z = 7;
      c.add(line);
      c.userData.ray = line;
      c.userData.snake = snake;
      c.addEventListener('connected', onCtrlConnected(c));
      c.addEventListener('selectstart', onXRSelect.bind(null, c, rc));
      c.addEventListener('selectend', onXRSelectEnd.bind(null, c, rc));
      c.addEventListener('squeezestart', onXRSqueeze.bind(null, c, rc));
      st.scene.add(c);
      st.xrControllers.push(c);
    }
  }

  function castFromController(c, rc) {
    var THREE = st.three;
    var m = new THREE.Matrix4().extractRotation(c.matrixWorld);
    var o = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
    var d = new THREE.Vector3(0, 0, -1).applyMatrix4(m).normalize();
    rc.set(o, d);
    return rc;
  }

  function onXRSelect(c, rc) {
    if (!st.spirit) return;
    castFromController(c, rc);
    /* 1) El tótem serpiente que te sigue: abre o cierra el escritorio. */
    if (rc.intersectObject(st.spirit.pickMesh, false).length) {
      biteNow(c);
      toggleScreen();
      return;
    }
    /* 2) La pantalla del escritorio, si ya está abierta: pulsar es el botón
     *    izquierdo del ratón (clic al soltar; mantener y mover = arrastrar). */
    if (st.screenOpen && st.mirrorMesh) {
      var hits = rc.intersectObject(st.mirrorMesh, false);
      if (hits.length && hits[0].uv) {
        biteNow(c);
        flashAtPoint(hits[0].point);
        c.userData.press = domPressUv(hits[0].uv);
        c.userData.lastUv = hits[0].uv;
        try { paintMirror(); } catch (ePp) {}
        return;
      }
    }
    /* 3) El suelo de la jungla: muerde para teletransportarte. */
    if (st.floorMesh) {
      var fh = rc.intersectObject(st.floorMesh, false);
      if (fh.length) { biteNow(c); teleportTo(fh[0].point); }
    }
  }

  /* Soltar el gatillo: pointerup/mouseup y clic (o doble clic si repites). */
  function onXRSelectEnd(c, rc) {
    var press = c.userData.press;
    if (!press) return;
    c.userData.press = null;
    castFromController(c, rc);
    var uv = c.userData.lastUv;
    if (st.screenOpen && st.mirrorMesh) {
      var hits = rc.intersectObject(st.mirrorMesh, false);
      if (hits.length && hits[0].uv) uv = hits[0].uv;
    }
    if (uv) {
      try { domReleaseUv(uv, press); } catch (eRel) {}
      try { paintMirror(); } catch (ePr) {}
    }
  }

  /* Apretar el mando (squeeze) apuntando al escritorio = clic derecho, como en
   * el PC (menú contextual). Apretarlo fuera de la pantalla sigue sirviendo de
   * atajo de salida del modo VR. */
  function onXRSqueeze(c, rc) {
    castFromController(c, rc);
    if (st.screenOpen && st.mirrorMesh) {
      var hits = rc.intersectObject(st.mirrorMesh, false);
      if (hits.length && hits[0].uv) {
        biteNow(c);
        flashAtPoint(hits[0].point);
        domRightClickUv(hits[0].uv);
        try { paintMirror(); } catch (ePq) {}
        return;
      }
    }
    if (st.xrSession) { try { st.xrSession.end(); } catch (eQ) {} }
  }

  /* ---------------- Bucle de render ---------------- */
  function tick(time) {
    if (!st.open || !st.renderer || !st.scene) return;
    var now = (typeof time === 'number' ? time : (global.performance && global.performance.now ? global.performance.now() : Date.now())) / 1000;
    var dt = st.lastT ? Math.min(0.1, now - st.lastT) : 0.016;
    st.lastT = now;

    if (st.mode !== 'xr') {
      var speed = 1.9 * dt;
      if (st.keys.w) moveForward(speed);
      if (st.keys.s) moveForward(-speed);
      if ((st.keys.a || st.keys.d) && st.rig && st.three) {
        var strafe = new st.three.Vector3(1, 0, 0).applyEuler(new st.three.Euler(0, st.yaw, 0));
        st.rig.position.addScaledVector(strafe, (st.keys.d ? 1 : -1) * speed);
        st.rig.position.x = clampN(st.rig.position.x, -7, 7);
      }
    } else if (st.xrMoveTo && st.rig) {
      st.rig.position.lerp(st.xrMoveTo, Math.min(1, dt * 6));
      if (st.rig.position.distanceTo(st.xrMoveTo) < 0.05) st.xrMoveTo = null;
    }

    if (st.flashT > 0 && st.flashMesh) {
      st.flashT += dt;
      var k = st.flashT / 0.6;
      if (k >= 1) { st.flashT = 0; st.flashMesh.visible = false; }
      else {
        st.flashMesh.visible = true;
        st.flashMesh.material.opacity = 0.9 * (1 - k);
        var sc = 1 + k * 2.4;
        st.flashMesh.scale.set(sc, sc, sc);
      }
    }

    /* Animación viva de la jungla, las serpientes, el tótem y la pantalla. */
    st.tickN = (st.tickN + 1) % 100000;
    try {
      updateScreenAnim(dt);
      if (st.ambient && st.ambient.length) updateAmbientSnakes(dt, now);
      if (st.jungle) updateJungle(dt, now);
      if (st.fireflies) updateFireflies(dt, now);
      if (st.spirit) updateSpirit(dt, now);
      if (st.mode === 'xr') {
        updateHandSnakes(dt, now);
        if (st.tickN % 2 === 0) updateXRPointers();
      }
    } catch (eAnim) {}

    if (st.screenOpen && now - st.mirrorLast > st.paintEvery) {
      st.mirrorLast = now;
      try { paintMirror(); } catch (ePm) {}
      /* Repintado adaptativo: si pintar el DOM real cuesta mucho (gafas lentas),
         se espacia; si va sobrado, se aprieta hasta ~14 fps. */
      var targetP = st.mode === 'xr' ? 0.07 : 0.09;
      if (st.paintCost > 0.045) st.paintEvery = Math.min(0.28, st.paintEvery * 1.35 + 0.01);
      else st.paintEvery = Math.max(targetP, st.paintEvery * 0.82 - 0.002);
    }
    if (now - st.infoLast > 2) { st.infoLast = now; try { paintInfo(); } catch (ePi) {} }

    renderFrame();
  }

  function renderFrame() {
    var r = st.renderer;
    if (!r || !st.scene || !st.camera) return;
    if (r.xr && r.xr.isPresenting) {
      r.render(st.scene, st.camera);
      return;
    }
    if (st.mode === 'sbs' && st.camL && st.camR && st.three) {
      var size = r.getDrawingBufferSize(new st.three.Vector2());
      var w2 = Math.max(2, Math.floor(size.x / 2));
      var h2 = Math.max(2, Math.floor(size.y));
      st.camL.position.copy(st.camera.position);
      st.camL.quaternion.copy(st.camera.quaternion);
      st.camR.position.copy(st.camera.position);
      st.camR.quaternion.copy(st.camera.quaternion);
      st.camL.translateX(-0.032);
      st.camR.translateX(0.032);
      r.setScissorTest(true);
      r.setViewport(0, 0, w2, h2);
      r.setScissor(0, 0, w2, h2);
      r.render(st.scene, st.camL);
      r.setViewport(w2, 0, w2, h2);
      r.setScissor(w2, 0, w2, h2);
      r.render(st.scene, st.camR);
      r.setScissorTest(false);
      return;
    }
    r.render(st.scene, st.camera);
  }

  /* ---------------- Abrir / cerrar ---------------- */
  function onHudClick(e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-vr]') : null;
    if (!b) return;
    var a = b.getAttribute('data-vr');
    if (a === 'exit') close();
    else if (a === 'recenter') recenter();
    else if (a === 'gyro') enableGyro();
    else if (a === 'sbs') toggleSbs(st.mode !== 'sbs');
    else if (a === 'xr') enterXR();
    else if (a === 'screen') toggleScreen();
  }

  function open(opts) {
    opts = opts || {};
    if (st.open) {
      if (opts.sbs) toggleSbs(true);
      if (opts.xr) enterXR();
      return true;
    }
    if (!document.body) return false;
    st.root = buildRoot();
    st.canvas = st.root.querySelector('canvas.snk-vr-canvas');
    var pv = prefs();
    st.mode = (opts.sbs != null) ? (opts.sbs ? 'sbs' : 'mono') : (pv.sbs ? 'sbs' : 'mono');
    st.yaw = 0;
    st.pitch = -0.05;
    st.keys = {};
    st.pointer = null;
    st.lastT = 0;
    st.mirrorLast = 0;
    st.infoLast = 0;
    st.screenOpen = false;
    st.screenAnim = 0;
    st.screenGroup = null;
    st.jungle = null;
    st.lianas = [];
    st.ambient = [];
    st.fireflies = null;
    st.spirit = null;
    st.handSnakes = [];
    st.rc = null;
    st.tickN = 0;
    st.tmpV = null; st.tmpV2 = null; st.tmpQ = null; st.tmpM = null;
    st.open = true;
    document.body.classList.add('snk-vr-on');
    st.root.addEventListener('click', onHudClick);
    global.addEventListener('resize', resize);

    ensureThree().then(function (THREE) {
      if (!st.open) return;
      st.three = THREE;
      st.renderer = new THREE.WebGLRenderer({
        canvas: st.canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      st.renderer.setClearColor(0x02040a, 1);
      st.renderer.xr.enabled = false;
      buildScene(THREE, st.renderer);
      st.xrControllers = [];
      applyLook();
      resize();
      try { paintMirror(); } catch (ePM) {}
      try { paintInfo(); } catch (ePI) {}
      bindInput();
      bindKeys();
      syncHud();
      if (opts.screen) setScreenOpen(true);
      try {
        var nav = global.navigator;
        if (nav && nav.xr && nav.xr.isSessionSupported) {
          nav.xr.isSessionSupported('immersive-vr').then(function (ok) { st.xrReady = !!ok; }, function () { st.xrReady = false; });
        }
      } catch (eXc) {}
      st.renderer.setAnimationLoop(tick);
      if (opts.xr) enterXR();
    }).catch(function () {
      close();
      showNote(vrT('No se pudo abrir Snake VR', 'Could not open Snake VR'),
        vrT('No se ha podido cargar el motor 3D (three.js/WebGL). Comprueba la conexión y vuelve a intentarlo.',
          'The 3D engine (three.js/WebGL) could not load. Check your connection and try again.'));
    });
    return true;
  }

  function close() {
    if (!st.open && !st.root) return;
    if (st.xrSession) { try { st.xrSession.end(); } catch (eX) {} }
    st.open = false;
    if (st.gyroHandler) { try { global.removeEventListener('deviceorientation', st.gyroHandler, true); } catch (eG) {} }
    st.gyroHandler = null;
    st.gyro = false;
    try { global.removeEventListener('resize', resize); } catch (eR) {}
    unbindKeys();
    if (st.renderer) {
      try { st.renderer.setAnimationLoop(null); } catch (eL) {}
      try { st.renderer.dispose(); } catch (eD) {}
      st.renderer = null;
    }
    if (st.root && st.root.parentNode) st.root.parentNode.removeChild(st.root);
    st.root = null;
    st.canvas = null;
    st.scene = null;
    st.camera = null;
    st.camL = null;
    st.camR = null;
    st.rig = null;
    st.mirrorMesh = null;
    st.mirrorCtx = null;
    st.mirrorTex = null;
    st.mirrorCanvas = null;
    st.floorMesh = null;
    st.frameMesh = null;
    st.starField = null;
    st.screenGroup = null;
    st.screenOpen = false;
    st.screenAnim = 0;
    st.jungle = null;
    st.lianas = [];
    st.ambient = [];
    st.fireflies = null;
    st.spirit = null;
    st.handSnakes = [];
    st.rc = null;
    st.tmpV = null; st.tmpV2 = null; st.tmpQ = null; st.tmpM = null;
    st.leftCtx = null; st.rightCtx = null;
    st.leftTex = null; st.rightTex = null;
    st.leftCanvas = null; st.rightCanvas = null;
    st.xrControllers = [];
    st.xrSession = null;
    st.xrMoveTo = null;
    st.mode = 'mono';
    st.keys = {};
    st.pointer = null;
    st.flashMesh = null;
    st.flashT = 0;
    document.body.classList.remove('snk-vr-on');
    syncHud();
  }

  /* ---------------- App «Snake VR» del escritorio ---------------- */
  function renderSnakeVrApp(body) {
    if (!body) return function () {};
    injectCss();
    body.innerHTML =
      '<div class="snkvr-app">' +
        '<h1>🥽 Snake VR</h1>' +
        '<p class="snkvr-sub">' + vrT(
          'Una jungla viva en 3D con serpientes por todas partes: tu escritorio se abre en una pantalla gigante solo si muerdes a la serpiente tótem que te sigue. Tus dos mandos de VR también son serpientes.',
          'A living 3D jungle full of snakes: your desktop opens on a giant screen only when you bite the totem snake that follows you. Your two VR controllers are snakes too.'
        ) + '</p>' +
        '<div class="snkvr-chips">' +
          '<span class="snkvr-chip" id="snkvr-compat">WebXR…</span>' +
          '<span class="snkvr-chip on">🐍 ' + vrT('Mandos serpiente', 'Snake controllers') + '</span>' +
          '<span class="snkvr-chip on">👓 ' + vrT('Cardboard (SBS)', 'Cardboard (SBS)') + '</span>' +
          '<span class="snkvr-chip on">🧭 ' + vrT('Giroscopio', 'Gyroscope') + '</span>' +
        '</div>' +
        '<button type="button" class="snkvr-btn" id="snkvr-enter">🥽 ' + vrT('Entrar en Snake VR', 'Enter Snake VR') + '</button>' +
        '<div class="snkvr-row">' +
          '<button type="button" class="snkvr-btn2" id="snkvr-sbs">👓 ' + vrT('Visor estereoscópico', 'Stereoscopic viewer') + '</button>' +
          '<button type="button" class="snkvr-btn2" id="snkvr-xr">🥽 ' + vrT('VR real (WebXR)', 'True VR (WebXR)') + '</button>' +
          '<button type="button" class="snkvr-btn2" id="snkvr-screen">🔮 ' + vrT('Abrir el escritorio dentro de VR', 'Open the desktop inside VR') + '</button>' +
          '<button type="button" class="snkvr-btn2" id="snkvr-close">✖ ' + vrT('Salir de VR', 'Exit VR') + '</button>' +
        '</div>' +
        '<div>' +
          '<p style="margin:0 0 6px;font-weight:700">' + vrT('Qué puedes hacer dentro', 'What you can do inside') + '</p>' +
          '<ul>' +
            '<li>' + vrT('La pantalla gigante empieza cerrada: muerde a la serpiente tótem que te sigue (abajo a la derecha, sin estorbar; o púlsala con el ratón) para abrir tu escritorio, y muerde otra vez para cerrarlo.', 'The giant screen starts closed: bite the totem snake that follows you (bottom-right, out of the way; or press it with the mouse) to open your desktop, and bite again to close it.') + '</li>' +
            '<li>' + vrT('Con las dos manos: cada mando es una serpiente con ojos y lengua. El rayo sale de su boca y el gatillo la hace morder lo que apunta (iconos, apps, ventanas).', 'Both hands: each controller is a snake with eyes and tongue. Its ray comes out of its mouth and the trigger makes it bite whatever it points at (icons, apps, windows).') + '</li>' +
            '<li>' + vrT('Jungla animada alrededor: árboles, helechos, lianas meciéndose, luciérnagas y serpientes que se arrastran por todas partes.', 'Animated jungle all around: trees, ferns, swaying vines, fireflies and snakes crawling everywhere.') + '</li>' +
            '<li>' + vrT('Paneles laterales con hora, versión de Snake OS, estado del escritorio, apps abiertas y novedades.', 'Side panels with the time, Snake OS version, desktop state, open apps and what’s new.') + '</li>' +
          '</ul>' +
        '</div>' +
        '<p class="snkvr-note">' + vrT(
          'Consejo: en el móvil, abre Snake VR, pulsa 🧭 Giroscopio y 👓 Gafas (SBS) y mete el teléfono en las gafas de cartón. En Meta Quest usa directamente 🥽 VR real y busca al tótem en la esquina inferior derecha, apartado para no estorbarte.',
          'Tip: on your phone, open Snake VR, press 🧭 Gyroscope and 👓 Headset (SBS) and put the phone into your cardboard goggles. On Meta Quest just use 🥽 True VR and look for the totem in the bottom-right corner, out of your way.'
        ) + '</p>' +
      '</div>';

    var compat = body.querySelector('#snkvr-compat');
    if (compat) {
      try {
        var nav = global.navigator;
        if (xrSupported()) {
          nav.xr.isSessionSupported('immersive-vr').then(function (ok) {
            if (ok) { compat.textContent = '✓ ' + vrT('Gafas compatibles (WebXR)', 'Compatible headset (WebXR)'); compat.classList.add('on'); }
            else compat.textContent = vrT('WebXR sin visor: usa 👓 Gafas (SBS)', 'WebXR without headset: use 👓 Headset (SBS)');
          }, function () {
            compat.textContent = vrT('WebXR no disponible: usa 👓 Gafas (SBS)', 'WebXR unavailable: use 👓 Headset (SBS)');
          });
        } else {
          compat.textContent = vrT('Sin WebXR: usa 👓 Gafas (SBS)', 'No WebXR: use 👓 Headset (SBS)');
        }
      } catch (eC) { compat.textContent = vrT('Sin WebXR: usa 👓 Gafas (SBS)', 'No WebXR: use 👓 Headset (SBS)'); }
    }

    var btnEnter = body.querySelector('#snkvr-enter');
    if (btnEnter) btnEnter.addEventListener('click', function () { open(); });
    var btnSbs = body.querySelector('#snkvr-sbs');
    if (btnSbs) btnSbs.addEventListener('click', function () { open({ sbs: true }); });
    var btnXr = body.querySelector('#snkvr-xr');
    if (btnXr) btnXr.addEventListener('click', function () { open({ xr: true }); });
    var btnScreen = body.querySelector('#snkvr-screen');
    if (btnScreen) btnScreen.addEventListener('click', function () {
      if (st.open) { setScreenOpen(true); return; }
      open({ screen: true });
    });
    var btnClose = body.querySelector('#snkvr-close');
    if (btnClose) btnClose.addEventListener('click', function () { close(); });

    return function () {
      /* Si cierras la ventana con el visor abierto, el visor se cierra también. */
      try { if (st.open) close(); } catch (eCl) {}
    };
  }

  /* ---------------- API pública ---------------- */
  global.renderSnakeVrApp = renderSnakeVrApp;
  global.SnakeVR = {
    version: VR_VERSION,
    open: open,
    close: close,
    recenter: recenter,
    supported: xrSupported,
    toggleScreen: toggleScreen,
    setScreenOpen: setScreenOpen,
    get isScreenOpen() { return !!st.screenOpen; },
    get mode() { return st.mode; },
    get isOpen() { return !!st.open; }
  };
})(window);

/* === SNK-MR-MASCOTA (2026.26) =========================================
   Mascota de realidad mixta para Snake VR: una serpiente vive en TU
   habitación. Antes de aparecer, las gafas te piden ESCANEAR el cuarto
   apuntando al suelo con los mandos; con eso se construye un mapa de
   celdas de 25 cm, se detectan muebles y paredes (plane-detection y
   mesh-detection cuando el visor los soporta) y la serpiente se mueve
   SOLO por suelo conocido, rodea los obstáculos y no sale del cuarto.

   Uso:
     · Aparece un botón «🐍 MR» abajo a la derecha mientras Snake VR está
       abierto (o entrando con la URL acabada en #mr).
     · Al pulsarlo se entra en XR con passthrough: immersive-ar si el visor
       lo soporta, si no immersive-vr.
     · Fase 1 ESCANEO: mira alrededor y apunta al suelo hasta el 100 %.
       Gatillo = empezar ya con lo escaneado.
     · Fase 2 MASCOTA: la serpiente sale enroscada delante de ti y te
       sigue. Gatillo = llámala. Agarre = salir.
     · Acércale la mano o el mando a la cabeza (<30 cm) para acariciarla.

   API: window.SnakeMr.open(), .close(), .state()
   No toca nada del juego base: escena, canvas y sesión XR propias.
   ==================================================================== */
(function () {
  'use strict';
  if (window.SnakeMr && window.SnakeMr.__v) return;

  var THREE_URL = '/static/assets/three-r160.min.js?v=r160';
  var CELL = 0.25;        // lado de cada celda del mapa (m)
  var GOAL = 90;          // celdas de suelo conocidas para dar el cuarto por escaneado
  var SEGS = 16;          // segmentos de la serpiente
  var SEG_LEN = 0.075;    // separación entre segmentos (m) → serpiente de ~1,2 m
  var MAX_CELLS = 5000;

  var S = {
    __v: '2026.26',
    phase: 'idle',        // idle | scan | play
    three: null, loadP: null,
    canvas: null, renderer: null, scene: null, cam: null,
    session: null, refSpace: null, viewer: null, hits: null, planes: null,
    cells: null, blocks: [], blockedSet: null, floorY: 0, room: null,
    instWalk: null, instBlocked: null,
    panel: null, panelCtx: null, panelTex: null, panelDrawn: -1,
    stack: null, ring: null,
    snake: null, parts: [], pts: [], head: null, path: null, pathI: 0,
    mood: 'scan', moodT: 0, target: null, roamT: 0,
    t: 0, dt: 0, last: 0, pet: 0, hearts: [],
    lastPlayer: null, idleT: 0, playerMoved: 0,
    progress: 0, msg: '', btn: null, overlay: null, err: ''
  };

  function log(m) { try { console.info('[SnakeMR] ' + m); } catch (e) {} }
  function warn(m) { try { console.warn('[SnakeMR] ' + m); } catch (e) {} }
  function css(o) { var s = '', k; for (k in o) s += k + ':' + o[k] + ';'; return s; }

  function makeEl(tag, style, text) {
    var d = document.createElement(tag);
    if (style) d.setAttribute('style', style);
    if (text != null) d.textContent = text;
    return d;
  }

  /* three.js: ya suele estar cargado por Snake VR; si no, se pide el local. */
  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (S.loadP) return S.loadP;
    S.loadP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = THREE_URL;
      s.onload = function () {
        if (window.THREE) res(window.THREE);
        else rej(new Error('three.js cargó pero no definió THREE'));
      };
      s.onerror = function () { rej(new Error('no pude cargar ' + THREE_URL)); };
      document.head.appendChild(s);
    });
    return S.loadP;
  }

  /* ---------------------------------------------------------------- UI 2D */
  function mountBtn() {
    if (S.btn || !document.body) return;
    var b = makeEl('button', css({
      position: 'fixed', right: '18px', bottom: '18px', zIndex: 2147483000,
      padding: '10px 16px', borderRadius: '12px', cursor: 'pointer',
      background: 'linear-gradient(180deg,#123a24,#0b2a1a)',
      color: '#8ff7b6', border: '1px solid #2f8f5a',
      font: '600 14px/1 system-ui,system-ui,sans-serif',
      boxShadow: '0 6px 20px rgba(0,0,0,.45)', display: 'none'
    }), '🐍 MR');
    b.title = 'Mascota de realidad mixta: una serpiente en tu habitación';
    b.onclick = function () { open(); };
    document.body.appendChild(b);
    S.btn = b;
    /* Solo mientras Snake VR está abierto (su root es #snk-vr-root), o con #mr. */
    setInterval(function () {
      var on = !!document.getElementById('snk-vr-root') || /(^|#)mr\b/.test(location.hash);
      if (S.open) on = false;
      if (b.style.display !== (on ? 'block' : 'none')) b.style.display = on ? 'block' : 'none';
    }, 1200);
  }

  function overlay(html) {
    if (!S.overlay) {
      var o = makeEl('div', css({
        position: 'fixed', inset: '0', zIndex: 2147483001, display: 'flex',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        padding: '24px', background: 'rgba(4,12,9,.92)', color: '#d6ffe6',
        font: '500 16px/1.5 system-ui,system-ui,sans-serif'
      }));
      o.id = 'snk-mr-overlay';
      document.body.appendChild(o);
      S.overlay = o;
    }
    S.overlay.innerHTML = html;
    S.overlay.style.display = 'flex';
  }

  function hideOverlay() { if (S.overlay) S.overlay.style.display = 'none'; }


  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;';
    });
  }

  /* ------------------------------------------------------------ arranque */
  S.open = false;

  function open() {
    if (S.open) return Promise.resolve();
    S.open = true;
    S.phase = 'scan';
    S.progress = 0;
    S.msg = '';
    S.err = '';
    reset();
    overlay('<div><div style="font-size:42px">🐍</div><b style="font-size:19px">Mascota de realidad mixta</b><br>' +
      'Ponte las gafas. Primero escaneamos la habitación y después la serpiente aparecerá dentro.</div>');
    return loadThree().then(function (T) {
      S.three = T;
      return startXR();
    }).catch(function (e) {
      S.open = false;
      S.phase = 'idle';
      warn('open: ' + (e && e.message ? e.message : e));
      overlay('<div><div style="font-size:42px">😕</div><b>No pude abrir la realidad mixta</b><br>' +
        esc(e && e.message ? e.message : e) +
        '<br><br>Hace falta un visor con WebXR (Meta Quest y similares) y passthrough.' +
        '<br><br><button id="snk-mr-x" style="padding:10px 18px;border-radius:10px;border:1px solid #2f8f5a;' +
        'background:#12261c;color:#8ff7b6;font-weight:600;cursor:pointer">Cerrar</button></div>');
      var b = document.getElementById('snk-mr-x');
      if (b) b.onclick = close;
    });
  }

  function startXR() {
    var T = S.three;
    if (!navigator.xr || !navigator.xr.requestSession) {
      return Promise.reject(new Error('este navegador no tiene WebXR'));
    }
    var cv = makeEl('canvas', 'position:fixed;inset:0;width:100%;height:100%;z-index:2147483000;' +
      'background:transparent;touch-action:none');
    cv.id = 'snk-mr-canvas';
    document.body.appendChild(cv);
    S.canvas = cv;
    var r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.setClearAlpha(0);                 // fondo transparente = passthrough
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    S.renderer = r;
    var init = {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hit-test', 'anchors',
        'plane-detection', 'mesh-detection', 'hand-tracking'],
      requiredFeatures: []
    };
    return navigator.xr.isSessionSupported('immersive-ar').then(function (ok) {
      S.mode = ok ? 'immersive-ar' : 'immersive-vr';
      return navigator.xr.requestSession(S.mode, init).catch(function (e1) {
        if (S.mode === 'immersive-ar') {           // visor sin AR: probamos VR
          S.mode = 'immersive-vr';
          return navigator.xr.requestSession('immersive-vr', init);
        }
        throw e1;
      });
    }).then(function (sess) {
      S.session = sess;
      return r.xr.setSession(sess);
    }).then(function () {
      buildScene();
      hookSession();
      r.setAnimationLoop(onFrame);
      hideOverlay();
      log('sesión ' + S.mode + ' lista');
    });
  }

  function hookSession() {
    var sess = S.session;
    sess.addEventListener('selectstart', onSelect);
    sess.addEventListener('squeezestart', onSqueeze);
    sess.addEventListener('end', function () { cleanup(); });
    sess.requestReferenceSpace('viewer').then(function (v) {
      S.viewer = v;
      if (!sess.requestHitTestSource) return null;
      return sess.requestHitTestSource({ space: v });
    }).then(function (src) {
      S.hits = src || null;
      if (!src) S.msg = 'este visor no tiene hit-test: apunta a ojo';
    }).catch(function (e) { S.msg = 'sin hit-test (' + e.message + ')'; });
  }

  /* ------------------------------------------------------------- escena 3D */
  function buildScene() {
    var T = S.three;
    var sc = new T.Scene();
    S.scene = sc;
    S.cam = new T.PerspectiveCamera(70, 1, 0.05, 60);
    sc.add(new T.HemisphereLight(0xffffff, 0x33423b, 2.2));
    var dl = new T.DirectionalLight(0xfff3d6, 1.3);
    dl.position.set(0.8, 3.2, 1.1);
    sc.add(dl);
    var g = new T.PlaneGeometry(CELL * 0.86, CELL * 0.86);
    var matW = new T.MeshBasicMaterial({ color: 0x35d07f, transparent: true, opacity: 0.15, depthWrite: false, side: T.DoubleSide });
    var matB = new T.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.30, depthWrite: false, side: T.DoubleSide });
    S.instWalk = new T.InstancedMesh(g, matW, MAX_CELLS);
    S.instBlocked = new T.InstancedMesh(g, matB, MAX_CELLS);
    S.instWalk.count = 0;
    S.instBlocked.count = 0;
    S.instWalk.frustumCulled = false;
    S.instBlocked.frustumCulled = false;
    sc.add(S.instWalk);
    sc.add(S.instBlocked);
    S.ring = new T.Mesh(new T.RingGeometry(0.30, 0.365, 48),
      new T.MeshBasicMaterial({ color: 0x8ff7b6, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false }));
    S.ring.rotation.x = -Math.PI / 2;
    S.ring.renderOrder = 20;
    sc.add(S.ring);
    var cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 256;
    S.panelCtx = cv.getContext('2d');
    S.panelTex = new T.CanvasTexture(cv);
    S.panel = new T.Mesh(new T.PlaneGeometry(1.05, 0.525),
      new T.MeshBasicMaterial({ map: S.panelTex, transparent: true, depthWrite: false, depthTest: false }));
    S.panel.renderOrder = 30;
    sc.add(S.panel);
    S.snake = new T.Group();
    S.snake.visible = false;
    sc.add(S.snake);
    drawPanel(true);
  }


  /* ------------------------------------------------------------- bucle XR */
  function onFrame(time, frame) {
    var r = S.renderer;
    if (!r) return;
    var dt = S.last ? Math.min(0.1, Math.max(0, (time - S.last) / 1000)) : 0.016;
    S.last = time;
    S.t += dt;
    S.dt = dt;
    if (!S.refSpace && r.xr.getReferenceSpace) S.refSpace = r.xr.getReferenceSpace();
    var head = headPose(frame);
    S.lastHeadP = head.p.clone();
    S.lastHeadF = head.fwd.clone();
    playerStill(head.p, dt);
    if (S.phase === 'scan') scanStep(frame);
    else if (S.phase === 'play') updateSnake(dt, head);
    updateHearts(dt);
    placeHud(head);
    r.render(S.scene, S.cam);
  }

  /* Cuánto tiempo llevas sin moverte (para que se duerma si te paras). */
  function playerStill(p, dt) {
    if (!S.lastPlayer) { S.lastPlayer = p.clone(); return S.idleT; }
    var d = Math.hypot(p.x - S.lastPlayer.x, p.y - S.lastPlayer.y, p.z - S.lastPlayer.z);
    S.lastPlayer.copy(p);
    if (d > 0.04) S.idleT = 0; else S.idleT += dt;
    return S.idleT;
  }

  /* Posición/orientación de la cabeza en el espacio de referencia. */
  function headPose(frame) {
    var T = S.three;
    var out = { p: new T.Vector3(0, 1.6, 0), q: new T.Quaternion(), fwd: new T.Vector3(0, 0, -1) };
    if (!frame || !S.refSpace || !frame.getViewerPose) return out;
    var pose = frame.getViewerPose(S.refSpace);
    if (!pose) return out;
    var tr = pose.transform;
    out.p.set(tr.position.x, tr.position.y, tr.position.z);
    out.q.set(tr.orientation.x, tr.orientation.y, tr.orientation.z, tr.orientation.w);
    out.fwd.set(0, 0, -1).applyQuaternion(out.q);
    return out;
  }

  /* ------------------------------------------ FASE 1: escanear el cuarto */
  function scanStep(frame) {
    var T = S.three, i;
    if (S.hits && frame && frame.getHitTestResults) {   // suelo apuntando con el mando
      var res = frame.getHitTestResults(S.hits);
      for (i = 0; i < res.length; i++) {
        var pose = res[i].getPose(S.refSpace);
        if (!pose) continue;
        var m = new T.Matrix4().fromArray(pose.transform.matrix);
        var p = new T.Vector3().setFromMatrixPosition(m);
        var nrm = new T.Vector3(0, 1, 0).transformDirection(m);
        if (nrm.y < 0.75) continue;            // solo superficies que miran hacia arriba
        S.floorY = p.y;
        stampFloor(p.x, p.z, 0.42);
      }
    }
    absorbPlanes(frame);
    absorbMeshes(frame);
    /* Plan B: visores sin hit-test ni planos. Tras 15 s se supone el suelo
       alrededor del jugador para que se pueda jugar igualmente. */
    if (S.progress < 0.02 && !S.hits && S.t > 15 && S.lastHeadP) {
      stampFloor(S.lastHeadP.x, S.lastHeadP.z, 1.4);
      S.msg = 'este visor no da suelo: he supuesto el tuyo alrededor';
    }
    var walk = 0;
    S.cells.forEach(function (c) { if (!c.blocked) walk++; });
    S.progress = Math.min(1, walk / GOAL);
    if (S.progress >= 1) finishScan();         // cuarto escaneado: la serpiente sale
  }

  /* Suelo y muebles detectados por el visor (plane-detection). */
  function absorbPlanes(frame) {
    var T = S.three, ps = frame && frame.detectedPlanes;
    if (!ps || !ps.forEach || !S.refSpace || !frame.getPose) return;
    if (!S.planes) S.planes = new Set();
    ps.forEach(function (plane) {
      if (S.planes.has(plane)) return;
      var pose = frame.getPose(plane.planeSpace, S.refSpace);
      if (!pose) return;                       // se reintenta en el siguiente frame
      S.planes.add(plane);
      var M = new T.Matrix4().fromArray(pose.transform.matrix);
      var poly = plane.polygon || [];
      var pts = [], i;
      for (i = 0; i < poly.length; i++) {
        pts.push(new T.Vector3(poly[i].x, poly[i].y, poly[i].z).applyMatrix4(M));
      }
      if (pts.length < 3) {                    // sin polígono: ancho × alto
        var w = (plane.width || 0) / 2, h = (plane.height || 0) / 2;
        if (w > 0.02 && h > 0.02) {
          pts.push(new T.Vector3(-w, 0, -h).applyMatrix4(M));
          pts.push(new T.Vector3(w, 0, -h).applyMatrix4(M));
          pts.push(new T.Vector3(w, 0, h).applyMatrix4(M));
          pts.push(new T.Vector3(-w, 0, h).applyMatrix4(M));
        }
      }
      if (pts.length < 3) return;
      var minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9, miny = 1e9, maxy = -1e9, sy = 0;
      for (i = 0; i < pts.length; i++) {
        var p = pts[i];
        sy += p.y;
        if (p.x < minx) minx = p.x;
        if (p.x > maxx) maxx = p.x;
        if (p.z < minz) minz = p.z;
        if (p.z > maxz) maxz = p.z;
        if (p.y < miny) miny = p.y;
        if (p.y > maxy) maxy = p.y;
      }
      var y = sy / pts.length;
      if ((maxy - miny) < 0.06 && y < S.floorY + 0.12) {
        for (i = 0; i < pts.length; i++) stampFloor(pts[i].x, pts[i].z, 0.22);
      } else {
        addBlock(minx, maxx, minz, maxz, miny, maxy);   // pared, mesa, sofá…
      }
    });
  }

  /* ------------------------------------------------------ mapa de celdas */
  function cellKey(ix, iz) { return ix + ',' + iz; }
  function cellOf(x, z) { return { ix: Math.round(x / CELL), iz: Math.round(z / CELL) }; }
  function walkable(ix, iz) {
    var c = S.cells.get(cellKey(ix, iz));
    return !!c && !c.blocked;
  }

  function stampFloor(x, z, radius) {
    var r = Math.max(0, Math.ceil(radius / CELL)), c0 = cellOf(x, z);
    for (var dx = -r; dx <= r; dx++) {
      for (var dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r + 1) continue;
        addCell(c0.ix + dx, c0.iz + dz, false);
      }
    }
  }

  function addCell(ix, iz, blocked) {
    var k = cellKey(ix, iz), c = S.cells.get(k);
    if (c) {
      c.n++;
      if (blocked && !c.blocked) { c.blocked = true; paintCell(c, true); }
      return c;
    }
    if (S.cells.size >= MAX_CELLS) return null;
    c = { ix: ix, iz: iz, n: 1, blocked: !!blocked, pw: false, pb: false };
    S.cells.set(k, c);
    paintCell(c, !!blocked);
    return c;
  }

  /* Cada celda se pinta como losa fina en el suelo: verde = transitable,
     rojo = obstáculo. InstancedMesh para no crear mil mallas. */
  function paintCell(c, blocked) {
    var T = S.three;
    if (blocked ? c.pb : c.pw) return;
    var inst = blocked ? S.instBlocked : S.instWalk;
    if (!inst || inst.count >= MAX_CELLS) return;
    var m = new T.Matrix4();
    var q = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2);
    m.compose(new T.Vector3(c.ix * CELL, S.floorY + (blocked ? 0.006 : 0.003), c.iz * CELL),
      q, new T.Vector3(1, 1, 1));
    inst.setMatrixAt(inst.count, m);
    inst.count++;
    inst.instanceMatrix.needsUpdate = true;
    if (blocked) c.pb = true; else c.pw = true;
  }

  function blockAround(x, z, radius) {
    var r = Math.max(0, Math.ceil(radius / CELL)), c0 = cellOf(x, z);
    for (var dx = -r; dx <= r; dx++) {
      for (var dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r + 1) continue;
        addCell(c0.ix + dx, c0.iz + dz, true);
      }
    }
  }

  /* Obstáculo para la colisión fina (caja en XZ, con margen). */
  function addBlock(x0, x1, z0, z1, y0, y1) {
    if (S.blocks.length > 400) return;
    var pad = 0.05;
    S.blocks.push({ x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad, y0: y0, y1: y1 });
    var ix0 = Math.round((x0 - pad) / CELL), ix1 = Math.round((x1 + pad) / CELL);
    var iz0 = Math.round((z0 - pad) / CELL), iz1 = Math.round((z1 + pad) / CELL);
    if (Math.abs(ix1 - ix0) > 40 || Math.abs(iz1 - iz0) > 40) return;   // pared enorme
    for (var ix = ix0; ix <= ix1; ix++) {
      for (var iz = iz0; iz <= iz1; iz++) addCell(ix, iz, true);
    }
  }

  function finishScan() {
    if (S.phase !== 'scan') return;
    buildRoom();
    S.phase = 'play';
    S.mood = 'spawn';
    S.moodT = 0;
    S.playT0 = S.t;
    spawnSnake();
    drawPanel(true);
    log('cuarto escaneado: ' + Math.round(S.progress * 100) + ' %');
  }

  /* Límites del cuarto: caja que envuelve el suelo conocido, 18 cm hacia dentro. */
  function buildRoom() {
    var minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9, any = false;
    S.cells.forEach(function (c) {
      if (c.blocked) return;
      any = true;
      if (c.ix < minx) minx = c.ix;
      if (c.ix > maxx) maxx = c.ix;
      if (c.iz < minz) minz = c.iz;
      if (c.iz > maxz) maxz = c.iz;
    });
    if (!any) { minx = -6; maxx = 6; minz = -6; maxz = 6; }
    var m = 0.18;
    S.room = {
      x0: minx * CELL + m, x1: maxx * CELL - m,
      z0: minz * CELL + m, z1: maxz * CELL - m
    };
  }

  /* ------------------------------------------------ navegación y colisión */
  function insideRoom(x, z) {
    var r = S.room;
    return !!r && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  }

  function blockedAt(x, z, pad) {
    for (var i = 0; i < S.blocks.length; i++) {
      var b = S.blocks[i];
      if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
    }
    return false;
  }

  /* Solo suelo escaneado, sin obstáculos y dentro del cuarto. */
  function freeAt(x, z) {
    if (!insideRoom(x, z)) return false;
    if (blockedAt(x, z, 0.06)) return false;
    return walkable(Math.round(x / CELL), Math.round(z / CELL));
  }

  function clearLine(a, b) {
    var d = a.distanceTo(b), n = Math.max(2, Math.ceil(d / 0.1));
    for (var i = 1; i < n; i++) {
      var t = i / n;
      if (!freeAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  function nearestWalk(ix, iz, maxR) {
    for (var r = 0; r <= maxR; r++) {
      for (var dx = -r; dx <= r; dx++) {
        for (var dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (walkable(ix + dx, iz + dz)) return { ix: ix + dx, iz: iz + dz };
        }
      }
    }
    return null;
  }

  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function rebuildPath(prev, cur) {
    var out = [], k = cellKey(cur[0], cur[1]), guard = 0;
    while (k && guard++ < 600) {
      var p = k.split(',');
      out.push(new S.three.Vector3(parseInt(p[0], 10) * CELL, S.floorY, parseInt(p[1], 10) * CELL));
      k = prev[k];
    }
    out.reverse();
    return out;
  }

  /* BFS sobre celdas transitables: la serpiente nunca cruza lo no escaneado. */
  function findPath(from, to) {
    var s = cellOf(from.x, from.z), g = cellOf(to.x, to.z);
    if (!walkable(g.ix, g.iz)) {
      g = nearestWalk(g.ix, g.iz, 8);
      if (!g) return null;
    }
    if (!walkable(s.ix, s.iz)) {
      s = nearestWalk(s.ix, s.iz, 8);
      if (!s) return null;
    }
    var goalK = cellKey(g.ix, g.iz), startK = cellKey(s.ix, s.iz);
    var q = [[s.ix, s.iz]], qi = 0, seen = {}, prev = {}, guard = 0;
    seen[startK] = 1;
    while (qi < q.length && guard++ < 5000) {
      var cur = q[qi++], cx = cur[0], cz = cur[1];
      if (cellKey(cx, cz) === goalK) return rebuildPath(prev, cur);
      for (var d = 0; d < 8; d++) {
        var nx = cx + DIRS[d][0], nz = cz + DIRS[d][1], nk = cellKey(nx, nz);
        if (seen[nk] || !walkable(nx, nz)) continue;
        if (d >= 4 && (!walkable(cx + DIRS[d][0], cz) || !walkable(cx, cz + DIRS[d][1]))) continue;
        if (blockedAt(nx * CELL, nz * CELL, 0.06)) continue;
        seen[nk] = 1;
        prev[nk] = cellKey(cx, cz);
        q.push([nx, nz]);
      }
    }
    return null;
  }

  function randomWalkPoint(around, radius) {
    var list = [];
    S.cells.forEach(function (c) {
      if (!c.blocked && !blockedAt(c.ix * CELL, c.iz * CELL, 0.06)) list.push(c);
    });
    if (!list.length) return null;
    for (var t = 0; t < 24; t++) {
      var c = list[(Math.random() * list.length) | 0];
      var p = new S.three.Vector3(c.ix * CELL, S.floorY, c.iz * CELL);
      if (around && radius && p.distanceTo(around) > radius) continue;
      return p;
    }
    return null;
  }

  /* ---------------------------------------------------------- la mascota */
  function spawnSnake() {
    var T = S.three;
    if (S.parts.length) return;
    var skin = new T.MeshStandardMaterial({ color: 0x2f9b46, roughness: 0.5, metalness: 0.08 });
    var light = new T.MeshStandardMaterial({ color: 0xd8f58a, roughness: 0.6 });
    var white = new T.MeshBasicMaterial({ color: 0xf7fff4 });
    var black = new T.MeshBasicMaterial({ color: 0x10160f });
    var red = new T.MeshBasicMaterial({ color: 0xe8455f });

    var head = new T.Group();
    head.add(new T.Mesh(new T.SphereGeometry(0.048, 16, 12), skin));
    var snout = new T.Mesh(new T.SphereGeometry(0.032, 14, 10), skin);
    snout.position.set(0, -0.004, 0.032);
    snout.scale.set(1.25, 0.85, 1.1);
    head.add(snout);
    [-1, 1].forEach(function (sd) {
      var eye = new T.Mesh(new T.SphereGeometry(0.014, 10, 8), white);
      eye.position.set(0.021 * sd, 0.014, 0.028);
      head.add(eye);
      var pup = new T.Mesh(new T.SphereGeometry(0.007, 8, 6), black);
      pup.position.set(0.021 * sd, 0.014, 0.040);
      head.add(pup);
    });
    var tongue = new T.Group();
    [-1, 1].forEach(function (sd) {
      var c = new T.Mesh(new T.ConeGeometry(0.005, 0.055, 6), red);
      c.position.set(0.008 * sd, 0, 0.03);
      c.rotation.set(Math.PI / 2, 0, 0.28 * sd);
      tongue.add(c);
    });
    tongue.position.set(0, -0.008, 0.05);
    head.add(tongue);
    S.tongue = tongue;
    S.head = head;
    S.snake.add(head);
    S.parts.push(head);

    for (var i = 1; i < SEGS; i++) {
      var t = i / (SEGS - 1);
      var ball = new T.Mesh(new T.SphereGeometry(0.038 * (1 - 0.55 * t), 12, 10), light);
      S.snake.add(ball);
      S.parts.push(ball);
    }

    /* Sale enroscada a ~0,9 m delante del jugador, en suelo escaneado. */
    var base = spawnSpot();
    S.pts = [];
    for (i = 0; i < SEGS; i++) {
      var ang = i * 0.62;
      var rad = 0.012 + i * 0.011;
      S.pts.push(new S.three.Vector3(
        base.x + Math.cos(ang) * rad, S.floorY, base.z + Math.sin(ang) * rad));
    }
    S.snake.visible = true;
    S.snake.scale.setScalar(0.001);
    S.mood = 'spawn';
    S.moodT = 0;
    S.path = null;
    S.target = null;
  }

  function spawnSpot() {
    var T = S.three;
    var p = S.lastHeadP || new T.Vector3(0, 0, 0);
    var f = S.lastHeadF || new T.Vector3(0, 0, -1);
    var x = p.x + f.x * 0.9, z = p.z + f.z * 0.9;
    if (freeAt(x, z)) return new T.Vector3(x, S.floorY, z);
    var n = nearestWalkFrom(x, z);
    if (n) return n;
    var r = randomWalkPoint(p, 3);
    return r || new T.Vector3(p.x, S.floorY, p.z + 0.9);
  }

  function nearestWalkFrom(x, z) {
    var c = cellOf(x, z);
    var n = nearestWalk(c.ix, c.iz, 10);
    return n ? new S.three.Vector3(n.ix * CELL, S.floorY, n.iz * CELL) : null;
  }

  /* ------------------------------------------------------------ movimiento */
  function updateSnake(dt, head) {
    var T = S.three, i;
    if (!S.parts.length || !S.pts.length) return;
    S.moodT += dt;

    /* aparición: la serpiente "crece" delante de ti */
    if (S.mood === 'spawn') {
      S.snake.scale.setScalar(0.15 + 0.85 * Math.min(1, S.moodT / 1.1));
      if (S.moodT > 1.3) { S.mood = 'follow'; S.moodT = 0; }
    }

    /* acariciar: mano o mando a menos de 30 cm de la cabeza */
    var petting = handNearHead();
    if (petting && S.mood !== 'pet') { S.mood = 'pet'; S.moodT = 0; addHearts(4); }
    else if (!petting && S.mood === 'pet') { S.mood = 'follow'; S.moodT = 0; }

    /* si te quedas quieto mucho rato se acurruca y se duerme */
    if (S.mood !== 'pet' && S.mood !== 'spawn') {
      if (S.idleT > 45 && S.mood !== 'sleep') { S.mood = 'sleep'; S.moodT = 0; }
      else if (S.idleT < 1 && S.mood === 'sleep') { S.mood = 'follow'; S.moodT = 0; }
    }

    var hp = S.pts[0];
    var tgt = pickTarget(head, dt);
    var speed = S.mood === 'follow' ? 0.9 : S.mood === 'roam' ? 0.55 : 0;
    if (S.mood === 'pet' || S.mood === 'sleep' || S.mood === 'idle') speed = 0;

    /* recalcula la ruta cada 0,7 s o si el objetivo se ha movido */
    S.pathT = (S.pathT || 0) - dt;
    if (tgt && speed > 0 &&
        (!S.path || S.pathT <= 0 || !S.pathGoal || S.pathGoal.distanceTo(tgt) > 0.35)) {
      S.path = findPath(hp, tgt);
      S.pathI = 0;
      S.pathGoal = tgt.clone();
      S.pathT = 0.7;
    }

    /* waypoint actual, saltando los que ya se ven en línea recta */
    var wp = tgt;
    if (S.path && S.path.length) {
      var guard = 0;
      while (S.pathI < S.path.length - 1 && guard++ < 6 && clearLine(hp, S.path[S.pathI + 1])) S.pathI++;
      wp = S.path[S.pathI] || tgt;
      if (wp && Math.hypot(wp.x - hp.x, wp.z - hp.z) < 0.12) {
        S.pathI++;
        wp = S.path[S.pathI] || tgt;
      }
    }

    /* avanza la cabeza (con deslizamiento si hay un obstáculo de frente) */
    if (wp && speed > 0) {
      var dx = wp.x - hp.x, dz = wp.z - hp.z;
      var len = Math.hypot(dx, dz);
      if (len > 0.05) {
        var step = Math.min(speed * dt, len);
        var nx = hp.x + (dx / len) * step, nz = hp.z + (dz / len) * step;
        if (freeAt(nx, nz)) { hp.x = nx; hp.z = nz; }
        else if (freeAt(nx, hp.z)) { hp.x = nx; }
        else if (freeAt(hp.x, nz)) { hp.z = nz; }
        else { S.pathT = 0; }          // atascada: que recalcule ruta
      }
    }
    hp.y = S.floorY;
    S.moving = speed > 0 && Math.hypot(wp ? wp.x - hp.x : 0, wp ? wp.z - hp.z : 0) > 0.06;

    /* cadena de segmentos: cada uno sigue al anterior a distancia fija */
    for (i = 1; i < S.pts.length; i++) {
      var a = S.pts[i - 1], b = S.pts[i];
      var ddx = b.x - a.x, ddz = b.z - a.z;
      var dl = Math.hypot(ddx, ddz) || 1e-6;
      var tx = a.x + (ddx / dl) * SEG_LEN, tz = a.z + (ddz / dl) * SEG_LEN;
      var curFree = freeAt(b.x, b.z);
      if (freeAt(tx, tz) || !curFree) { b.x = tx; b.z = tz; }
      b.y = S.floorY;
    }
    positionParts();
  }

  /* Coloca los segmentos con ondulación lateral y orienta la cabeza. */
  function positionParts() {
    var T = S.three, i, n = S.parts.length;
    var wave = (S.mood === 'sleep' || S.mood === 'pet') ? 0.35 : 1;
    var freq = S.moving ? 9 : 3.2;
    for (i = 0; i < n; i++) {
      var p = S.pts[i], q = S.pts[Math.max(0, i - 1)];
      var dx = p.x - q.x, dz = p.z - q.z, dl = Math.hypot(dx, dz) || 1;
      var px = -dz / dl, pz = dx / dl;
      var amp = 0.024 * wave * Math.min(1, i / 3);
      var off = Math.sin(S.t * freq - i * 0.85) * amp;
      var lift = 0.03 + Math.sin(S.t * 3.1 + i * 0.4) * 0.002;
      S.parts[i].position.set(p.x + px * off, p.y + lift, p.z + pz * off);
    }
    /* la cabeza mira hacia donde va; si la acaricias, te mira a ti */
    var h = S.pts[0], ahead = S.pts[1];
    var look = new T.Vector3(h.x, h.y + 0.03, h.z);
    if (S.mood === 'pet' || S.mood === 'sleep' || S.mood === 'idle') {
      if (S.lastHeadP) look.copy(S.lastHeadP).setY(S.floorY + 0.05);
    } else if (ahead) {
      look.set(h.x + (h.x - ahead.x) * 3, S.floorY + 0.03, h.z + (h.z - ahead.z) * 3);
    }
    S.parts[0].lookAt(look);
    /* cabeza un poco levantada cuando está quieta o te mira */
    var raise = (S.mood === 'pet' || S.mood === 'idle') ? 0.045 : 0;
    S.parts[0].position.y += raise;
    if (S.tongue) {
      var flick = Math.max(0, Math.sin(S.t * 2.6) - 0.75) * 4;
      S.tongue.scale.set(1, 1, 0.4 + flick);
      S.tongue.visible = S.mood !== 'sleep';
    }
  }

  /* Qué quiere hacer: seguirte, curiosear, dejarse acariciar o dormir. */
  function pickTarget(head, dt) {
    var T = S.three, hp = S.pts[0], player = head.p;
    var dist = Math.hypot(hp.x - player.x, hp.z - player.z);
    if (S.mood === 'pet' || S.mood === 'sleep') {
      S.target = null;
      return null;
    }
    if (dist > 1.55) {                       // te sigue a ~0,9 m
      S.mood = 'follow';
      S.target = pointNear(player, 0.9, hp) || S.target;
      return S.target;
    }
    if (dist < 0.6) {                        // no se te echa encima
      S.mood = 'idle';
      S.target = null;
      return null;
    }
    if (S.mood === 'follow') { S.mood = 'roam'; S.roamT = 0; S.target = null; }
    S.roamT = (S.roamT || 0) + dt;
    if (!S.target || S.roamT > 9 ||
        Math.hypot(S.target.x - hp.x, S.target.z - hp.z) < 0.18) {
      S.roamT = 0;
      S.target = randomWalkPoint(player, 2.6) || randomWalkPoint(hp, 2) || null;
    }
    return S.target;
  }

  /* Punto libre a «r» metros del jugador, en la dirección en que está la serpiente. */
  function pointNear(p, r, from) {
    var T = S.three;
    var dx = from.x - p.x, dz = from.z - p.z;
    var l = Math.hypot(dx, dz);
    if (l < 0.05) { dx = 0; dz = 1; l = 1; }
    var x = p.x + (dx / l) * r, z = p.z + (dz / l) * r;
    if (freeAt(x, z)) return new T.Vector3(x, S.floorY, z);
    return nearestWalkFrom(x, z);
  }

  /* ¿Hay una mano o un mando a menos de 30 cm de la cabeza? */
  function handNearHead() {
    var sess = S.session, head = S.head;
    if (!sess || !sess.inputSources || !head) return false;
    var frame = S.renderer && S.renderer.xr.getFrame ? S.renderer.xr.getFrame() : null;
    if (!frame || !frame.getPose || !S.refSpace) return false;
    var c = head.position;
    for (var i = 0; i < sess.inputSources.length; i++) {
      var src = sess.inputSources[i];
      var sp = src.gripSpace || src.targetRaySpace;
      if (!sp) continue;
      var pose = null;
      try { pose = frame.getPose(sp, S.refSpace); } catch (e) { pose = null; }
      if (!pose) continue;
      var p = pose.transform.position;
      if (Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) < 0.3) return true;
    }
    return false;
  }

  /* Objetos por malla (mesh-detection): la API no da vértices, así que solo
     se bloquea una zona alrededor de su origen si está por encima del suelo. */
  function absorbMeshes(frame) {
    var ms = frame && frame.detectedMeshes;
    if (!ms || !ms.forEach || !S.refSpace || !frame.getPose) return;
    ms.forEach(function (mesh) {
      if (!mesh.meshSpace) return;
      var pose = frame.getPose(mesh.meshSpace, S.refSpace);
      if (!pose) return;
      var p = pose.transform.position;
      if (p.y > S.floorY + 0.15) blockAround(p.x, p.z, 0.4);
    });
  }

  /* ------------------------------------------------------------- adorno */
  function heartTexture() {
    if (S.heartTex) return S.heartTex;
    var c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    var g = c.getContext('2d');
    g.fillStyle = '#ff5a7a';
    g.beginPath();
    g.moveTo(32, 58);
    g.bezierCurveTo(0, 32, 10, 6, 32, 22);
    g.bezierCurveTo(54, 6, 64, 32, 32, 58);
    g.fill();
    S.heartTex = new S.three.CanvasTexture(c);
    return S.heartTex;
  }

  function addHearts(n) {
    var T = S.three;
    if (!S.scene || !S.head) return;
    for (var i = 0; i < n; i++) {
      var sp = new T.Sprite(new T.SpriteMaterial({
        map: heartTexture(), transparent: true, depthWrite: false
      }));
      sp.scale.setScalar(0.07);
      sp.position.copy(S.head.position);
      sp.position.x += (Math.random() - 0.5) * 0.12;
      sp.position.y += 0.09 + Math.random() * 0.06;
      sp.position.z += (Math.random() - 0.5) * 0.12;
      sp.userData.age = 0;
      sp.userData.vel = new T.Vector3((Math.random() - 0.5) * 0.12,
        0.22 + Math.random() * 0.12, (Math.random() - 0.5) * 0.12);
      S.scene.add(sp);
      S.hearts.push(sp);
    }
    while (S.hearts.length > 24) {
      var old = S.hearts.shift();
      S.scene.remove(old);
      if (old.material) old.material.dispose();
    }
  }

  function updateHearts(dt) {
    for (var i = S.hearts.length - 1; i >= 0; i--) {
      var h = S.hearts[i];
      h.userData.age += dt;
      h.position.addScaledVector(h.userData.vel, dt);
      h.scale.setScalar(0.07 + h.userData.age * 0.03);
      if (h.material) h.material.opacity = Math.max(0, 1 - h.userData.age / 1.6);
      if (h.userData.age > 1.6) {
        S.scene.remove(h);
        if (h.material) h.material.dispose();
        S.hearts.splice(i, 1);
      }
    }
  }

  /* ------------------------------------------------- panel flotante 3D */
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawPanel(force) {
    var g = S.panelCtx;
    if (!g || !S.panelTex) return;
    var pct = Math.round(S.progress * 100);
    var stamp = S.phase + '|' + pct + '|' + S.mood + '|' + (S.msg || '');
    if (!force && S.panelDrawn === stamp) return;
    S.panelDrawn = stamp;
    g.clearRect(0, 0, 512, 256);
    g.fillStyle = 'rgba(6,18,13,.86)';
    roundRect(g, 6, 6, 500, 244, 24);
    g.fill();
    g.strokeStyle = '#2f8f5a';
    g.lineWidth = 3;
    roundRect(g, 6, 6, 500, 244, 24);
    g.stroke();
    if (S.phase === 'scan') {
      g.fillStyle = '#8ff7b6';
      g.font = 'bold 30px system-ui,sans-serif';
      g.fillText('Escanéame la habitación', 30, 62);
      g.fillStyle = '#d6ffe6';
      g.font = '19px system-ui,sans-serif';
      g.fillText('Apunta al suelo con el mando y ve mirando', 30, 100);
      g.fillText('alrededor. La serpiente sólo andará por ahí.', 30, 126);
      g.fillStyle = '#0d2418';
      roundRect(g, 30, 148, 452, 28, 14);
      g.fill();
      g.fillStyle = '#35d07f';
      roundRect(g, 30, 148, Math.max(10, 452 * S.progress), 28, 14);
      g.fill();
      g.fillStyle = '#8ff7b6';
      g.font = 'bold 24px system-ui,sans-serif';
      g.fillText(pct + ' %', 30, 216);
      g.fillStyle = '#9fc4ae';
      g.font = '18px system-ui,sans-serif';
      g.fillText('Gatillo = empezar con lo escaneado', 140, 216);
      if (S.msg) {
        g.fillStyle = '#ffcf6b';
        g.font = '16px system-ui,sans-serif';
        g.fillText(S.msg, 30, 240);
      }
    } else {
      var moods = {
        spawn: '¡Hola!', follow: 'Te sigue', roam: 'Curioseando',
        idle: 'Esperando a tu lado', pet: 'Le gustan los mimos', sleep: 'Durmiendo'
      };
      g.fillStyle = '#8ff7b6';
      g.font = 'bold 28px system-ui,sans-serif';
      g.fillText('Tu serpiente · ' + (moods[S.mood] || 'A tu lado'), 30, 66);
      g.fillStyle = '#d6ffe6';
      g.font = '19px system-ui,sans-serif';
      g.fillText('Gatillo: llámala    ·    Acerca la mano: mimos', 30, 114);
      g.fillText('Agarre: salir', 30, 144);
      g.fillStyle = '#9fc4ae';
      g.font = '16px system-ui,sans-serif';
      g.fillText('Mapa: ' + S.cells.size + ' celdas · ' + S.blocks.length + ' obstáculos', 30, 196);
    }
    S.panelTex.needsUpdate = true;
  }

  function placeHud(head) {
    var p = head.p, f = head.fwd;
    if (S.panel) {
      S.panel.position.set(p.x + f.x * 1.15, p.y + f.y * 1.15 - 0.2, p.z + f.z * 1.15);
      S.panel.lookAt(p.x, p.y - 0.2, p.z);
      S.panel.visible = S.phase === 'scan' || (S.t - (S.playT0 || 0)) < 8;
    }
    if (S.ring) {
      S.ring.position.set(p.x, S.floorY + 0.012, p.z);
      S.ring.scale.setScalar(0.7 + S.progress * 1.1);
      S.ring.visible = S.phase === 'scan';
    }
    if (S.phase === 'scan') drawPanel(false);
  }

  /* ----------------------------------------------------------- controles */
  function onSelect() {
    if (S.phase === 'scan') {
      if (S.progress < 0.35) {
        S.msg = 'escanea un poco más (mínimo 35 %)';
        drawPanel(true);
        return;
      }
      finishScan();
    } else if (S.phase === 'play') {
      callSnake();
    }
  }

  function callSnake() {
    if (!S.parts.length) return;
    S.mood = 'follow';
    S.moodT = 0;
    S.roamT = 0;
    S.target = null;
    S.path = null;
    S.pathT = 0;
    addHearts(2);
    drawPanel(true);
  }

  function onSqueeze() { close(); }

  function reset() {
    S.phase = 'scan';
    S.progress = 0;
    S.msg = '';
    S.cells = new Map();
    S.planes = null;
    S.blocks = [];
    S.parts = [];
    S.pts = [];
    S.hearts = [];
    S.head = null;
    S.tongue = null;
    S.snake = null;
    S.hits = null;
    S.refSpace = null;
    S.room = null;
    S.floorY = 0;
    S.path = null;
    S.target = null;
    S.pathGoal = null;
    S.mood = 'scan';
    S.moodT = 0;
    S.roamT = 0;
    S.idleT = 0;
    S.lastPlayer = null;
    S.lastHeadP = null;
    S.lastHeadF = null;
    S.last = 0;
    S.moving = false;
    S.panelDrawn = -1;
    S.panel = null;
    S.panelCtx = null;
    S.panelTex = null;
    S.ring = null;
    S.instWalk = null;
    S.instBlocked = null;
    S.scene = null;
    S.cam = null;
  }

  function cleanup() {
    var r = S.renderer;
    if (r) {
      try { r.setAnimationLoop(null); } catch (e) {}
      try { r.xr.setSession(null); } catch (e) {}
      try { r.dispose(); } catch (e) {}
    }
    if (S.canvas && S.canvas.parentNode) S.canvas.parentNode.removeChild(S.canvas);
    if (S.overlay) S.overlay.style.display = 'none';
    reset();
    S.renderer = null;
    S.canvas = null;
    S.session = null;
    S.open = false;
    log('realidad mixta cerrada');
  }

  function close() {
    var s = S.session;
    if (s) {
      try {
        var p = s.end();
        if (p && p.catch) p.catch(function () { cleanup(); });
      } catch (e) { cleanup(); }
    } else {
      cleanup();
    }
  }

  /* ---------------------------------------------------------------- API */
  window.SnakeMr = {
    __v: S.__v,
    open: open,
    close: close,
    start: function () { finishScan(); },
    /* ganchos para tests automáticos sin visor (tests/test_mr_pet.js) */
    __test: {
      setThree: function (T) { S.three = T; },
      newMap: function () {
        S.cells = new Map();
        S.blocks = [];
        S.room = null;
        S.floorY = 0;
        S.instWalk = null;
        S.instBlocked = null;
      },
      stampFloor: stampFloor,
      addBlock: addBlock,
      blockAround: blockAround,
      buildRoom: buildRoom,
      freeAt: freeAt,
      findPath: findPath,
      walkable: walkable,
      count: function () { return S.cells.size; }
    },
    state: function () {
      return {
        version: S.__v,
        open: !!S.open,
        xr: !!S.session,
        mode: S.mode || null,
        phase: S.phase,
        progress: Math.round(S.progress * 100),
        cells: S.cells ? S.cells.size : 0,
        blocks: S.blocks.length,
        mood: S.mood,
        msg: S.msg,
        room: S.room
      };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountBtn);
  else mountBtn();
  setTimeout(mountBtn, 2000);      // por si el script se carga de forma diferida
})();
/* === fin SNK-MR-MASCOTA === */
