/* Doga Gorilla (2026.31) — juego de realidad virtual tipo «gorilla tag», sin terror.
 *
 * Se abre en https://doga-gorilla.softportweb.com/ (o en /doga-gorilla mientras el
 * túnel no publique el subdominio).
 *
 * CÓMO SE JUEGA (igual que Gorilla Tag)
 *   · No hay sticks para andar: te mueves con las MANOS. Apoyas las manos en el
 *     suelo, en una pared o en una seta y las arrastras: cada mano que roza una
 *     superficie te empuja en sentido contrario. Si empujas las manos hacia abajo,
 *     saltas; si las arrastras de lado, te deslizas.
 *   · Gatillo: no hace falta. Squeeze: cerrar la partida.
 *   · Las manos tocan cosas: orbes que se recogen, setas y gelatinas que te lanzan,
 *     molinos que giran, campanas que suenan y bichitos que salen volando.
 *
 * LOS MUNDOS (todos con límites: no se puede salir ni caer al vacío)
 *   · prado    — Prado de las Nubes: isla flotante con molinos y setas saltarinas.
 *   · caramelo — Isla Caramelo: colinas de helado, gelatinas y caramelos.
 *   · cristal  — Selva de Cristal: cristales que se encienden, lianas y luciérnagas.
 *
 * API: window.DogaGorilla = { version, supported(), worlds(), world(nombre),
 *      start(opts), stop(), state() }
 *   opts = { onState(state), onLog(text), onEnd(motivo), world }
 */
(function (global) {
  'use strict';

  var THREE_URL = '/static/assets/three-r160.min.js?v=r160';
  var LS_KEY = 'dogaGorilla';
  var VERSION = '2026.31';

  var GRAVITY = -12.5;      // m/s² (un pelín más que la real: va mejor en VR)
  var HAND_REACH = 1.15;    // altura a la que la mano «toca» el suelo (m)
  var PUSH_K = 4.5;         // cuánto empuja una mano al arrastrarla (1/s)
  var MAX_SPEED = 9.5;      // tope de velocidad (m/s)
  var DRAG_AIR = 0.10;      // roce en el aire
  var DRAG_GROUND = 1.6;    // roce con el suelo cuando no empujas
  var EYE = 1.6;            // altura de los ojos sobre los pies (vista previa)
  var FALL_Y = -9;          // por debajo de esto, al punto de salida
  /* Igual que en gorilla tag: el jugador es un monke bajito sin piernas. El
     suelo se sube hasta el pecho (se baja el cuerpo) para que las manos lleguen
     siempre al suelo. EYE_MONKE es dónde quedan los ojos sobre el suelo. */
  var EYE_MONKE = 1.15;     // altura de los ojos del monke sobre el suelo (m)
  var DROP_MAX = 1.05;      // cuánto se puede bajar el cuerpo como mucho (m)

  var WORLDS = {
    prado: {
      name: 'Prado de las Nubes', tag: '🌱', radius: 26,
      sky: ['#2f7fe0', '#79c8f5', '#d5f2ff', '#ffeccd'],
      grass: 0x7ee081, hill: 0x5cc47a, accent: 0xfff2a8, fog: 0xd6f2ff,
      monke: 0x2fa84f, belly: 0xf3e7c8
    },
    caramelo: {
      name: 'Isla Caramelo', tag: '🍭', radius: 24,
      sky: ['#ff7fb6', '#ffb3d1', '#ffe0ef', '#fff6cf'],
      grass: 0xffc2e0, hill: 0xff9ccb, accent: 0xfff3a0, fog: 0xffe6f2,
      monke: 0xff8ec2, belly: 0xfff4e6
    },
    cristal: {
      name: 'Selva de Cristal', tag: '💎', radius: 25,
      sky: ['#0d1b4c', '#254a8f', '#5b8fd6', '#c9e8ff'],
      grass: 0x3f8f8a, hill: 0x2f6f7a, accent: 0xa8f7ff, fog: 0x9fd8ea,
      monke: 0x53d8c8, belly: 0xd8fbff
    }
  };

  var S = {
    running: false, preview: false, three: null, loadP: null,
    renderer: null, scene: null, cam: null, player: null, canvas: null, host: null,
    session: null, refSpace: null, last: 0, t: 0, dt: 0,
    world: 'prado', group: null,
    props: [], orbs: 0, orbsTotal: 0, bells: 0, bounces: 0,
    hands: { left: null, right: null },
    vel: null, pos: null, onGround: true, lastPush: 0,
    avatar: null, body: null, drop: 0.5, eyeY: EYE, dropSet: false,
    trunks: [], grabbing: null,
    hud: null, hudCtx: null, hudTex: null, hudAt: 0, hudGoal: 0,
    keys: {}, drag: null, camYaw: 0.6, camPitch: 0.35,
    opts: {}, ended: false, msg: '¡Manos al suelo y a correr!'
  };

  function log(m) { try { console.info('[DogaGorilla] ' + m); } catch (e) {} }
  function warn(m) { try { console.warn('[DogaGorilla] ' + m); } catch (e) {} }
  function emit(msg) { S.msg = msg; if (S.opts.onLog) { try { S.opts.onLog(msg); } catch (e) {} } }

  function supported() {
    try { return !!(global.navigator && navigator.xr && navigator.xr.requestSession); } catch (e) { return false; }
  }

  function loadThree() {
    if (global.THREE) return Promise.resolve(global.THREE);
    if (S.loadP) return S.loadP;
    S.loadP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = THREE_URL;
      s.onload = function () {
        if (global.THREE) res(global.THREE);
        else rej(new Error('three.js cargó pero no definió THREE'));
      };
      s.onerror = function () { S.loadP = null; rej(new Error('no pude cargar ' + THREE_URL)); };
      document.head.appendChild(s);
    });
    return S.loadP;
  }

  function skyTexture(T, stops) {
    var c = document.createElement('canvas');
    c.width = 8;
    c.height = 512;
    var g = c.getContext('2d');
    if (!g) return null;
    var grd = g.createLinearGradient(0, 0, 0, 512);
    stops.forEach(function (hex, i) {
      grd.addColorStop(stops.length > 1 ? i / (stops.length - 1) : 0, hex);
    });
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 512);
    return new T.CanvasTexture(c);
  }

  /* --------------------------------------------------------------- escena */
  function buildScene() {
    var T = S.three;
    var sc = new T.Scene();
    S.scene = sc;
    S.cam = new T.PerspectiveCamera(72, 1, 0.05, 260);
    /* El jugador es un grupo con la cámara dentro: así se mueve el cuerpo
       (three.js aplica la matriz del padre a la cámara de la sesión XR). */
    S.player = new T.Group();
    S.player.name = 'doga-gorilla-player';
    S.player.add(S.cam);
    sc.add(S.player);
    sc.add(new T.HemisphereLight(0xffffff, 0x33543b, 2.1));
    var sun = new T.DirectionalLight(0xfff6dd, 1.25);
    sun.position.set(12, 22, 8);
    sc.add(sun);
    S.vel = new T.Vector3();
    S.pos = new T.Vector3(0, 0, 0);
    buildAvatar();
  }

  /* ================================================== EL MONKE (tu cuerpo) */
  /* Como en gorilla tag: eres un gorila SIN PIERNAS. Te ves el torso, los brazos
     larguísimos y las manos, y el suelo queda a la altura del pecho para que las
     manos lleguen siempre al suelo. Todo cuelga de S.player (el jugador). */
  function makeHand(furMat, skinMat) {
    var T = S.three;
    var g = new T.Group();
    var palm = new T.Mesh(new T.SphereGeometry(0.115, 14, 10), skinMat);
    palm.scale.set(1.15, 0.75, 1.25);
    g.add(palm);
    var knuckles = [], i;
    for (i = 0; i < 4; i++) {
      var f = new T.Mesh(new T.SphereGeometry(0.045, 8, 6), skinMat);
      f.position.set(-0.068 + i * 0.045, -0.02, -0.1);
      g.add(f);
      knuckles.push(f);
    }
    var thumb = new T.Mesh(new T.SphereGeometry(0.05, 8, 6), skinMat);
    thumb.position.set(0.08, -0.03, 0.02);
    g.add(thumb);
    var cuff = new T.Mesh(new T.SphereGeometry(0.1, 12, 10), furMat);
    cuff.position.set(0, 0.02, 0.1);
    cuff.scale.set(1.05, 0.9, 0.8);
    g.add(cuff);
    return { g: g, palm: palm, knuckles: knuckles, thumb: thumb, fist: 0 };
  }

  function buildAvatar() {
    var T = S.three;
    if (!T || !S.player) return;
    var meta = WORLDS[S.world] || WORLDS.prado;
    var furMat = new T.MeshStandardMaterial({ color: meta.monke, roughness: 0.85 });
    var skinMat = new T.MeshStandardMaterial({ color: meta.belly, roughness: 0.9 });
    var g = new T.Group();
    g.name = 'doga-gorilla-monke';
    var torso = new T.Mesh(new T.SphereGeometry(0.34, 18, 14), furMat);
    torso.scale.set(1.0, 1.25, 0.9);
    g.add(torso);
    var belly = new T.Mesh(new T.SphereGeometry(0.26, 16, 12), skinMat);
    belly.scale.set(0.95, 1.15, 0.72);
    g.add(belly);
    /* morro y orejas: al mirar abajo te ves la cara de monke */
    var muzzle = new T.Mesh(new T.SphereGeometry(0.15, 14, 10), skinMat);
    muzzle.scale.set(1.25, 0.8, 1);
    g.add(muzzle);
    var earGeo = new T.SphereGeometry(0.1, 12, 10);
    var earL = new T.Mesh(earGeo, furMat), earR = new T.Mesh(earGeo, furMat);
    g.add(earL); g.add(earR);
    var shoulderGeo = new T.SphereGeometry(0.16, 12, 10);
    var shL = new T.Mesh(shoulderGeo, furMat), shR = new T.Mesh(shoulderGeo, furMat);
    g.add(shL); g.add(shR);
    var armGeo = new T.CylinderGeometry(0.115, 0.095, 1, 10, 1);
    var armL = new T.Mesh(armGeo, furMat), armR = new T.Mesh(armGeo, furMat);
    g.add(armL); g.add(armR);
    var hands = { left: makeHand(furMat, skinMat), right: makeHand(furMat, skinMat) };
    g.add(hands.left.g); g.add(hands.right.g);
    S.player.add(g);
    S.avatar = g;
    S.body = {
      torso: torso, belly: belly, muzzle: muzzle, earL: earL, earR: earR,
      shL: shL, shR: shR, armL: armL, armR: armR, hands: hands,
      fur: furMat, skin: skinMat
    };
  }

  /* Coloca el cuerpo y las manos cada fotograma, y ajusta el suelo al pecho. */
  function updateAvatar(frame) {
    var T = S.three, b = S.body;
    if (!T || !b || !S.player) return;
    var dt = S.dt || 0.016;
    /* 1) altura real de tus ojos → el suelo se sube hasta el pecho */
    var eyeY = EYE;
    if (frame && S.refSpace && frame.getViewerPose) {
      try {
        var vp = frame.getViewerPose(S.refSpace);
        if (vp && vp.transform) eyeY = Math.max(0.7, Math.min(2.1, vp.transform.position.y));
      } catch (e) {}
    } else {
      eyeY = EYE_MONKE;      // vista previa: mismo monke bajito que en las gafas
    }
    S.eyeY = eyeY;
    var drop = Math.max(0, Math.min(DROP_MAX, eyeY - EYE_MONKE));
    S.drop = S.dropSet ? S.drop + (drop - S.drop) * Math.min(1, 8 * dt) : drop;
    S.dropSet = true;
    S.player.position.y = S.pos.y - S.drop;
    /* 2) cuerpo: sin piernas, colgando justo debajo de la cabeza */
    var top = eyeY - 0.24;
    var mid = top - 0.44;
    b.torso.position.set(0, mid, 0);
    b.belly.position.set(0, mid + 0.02, -0.07);
    b.muzzle.position.set(0, eyeY - 0.19, -0.24);
    b.earL.position.set(-0.29, eyeY - 0.1, 0.02);
    b.earR.position.set(0.29, eyeY - 0.1, 0.02);
    var shY = top - 0.05;
    b.shL.position.set(-0.3, shY, 0);
    b.shR.position.set(0.3, shY, 0);
    /* 3) manos y brazos */
    var names = ['left', 'right'];
    for (var i = 0; i < 2; i++) {
      var side = names[i], h = S.hands[side], hand = b.hands[side];
      var sh = side === 'left' ? b.shL : b.shR;
      var arm = side === 'left' ? b.armL : b.armR;
      var target, quat = null;
      if (h && h.now) {
        target = new T.Vector3(h.now.x, h.now.y, h.now.z);
        quat = h.quat || null;
      } else {
        /* sin mandos (vista previa): las manos cuelgan y se balancean */
        var sw = Math.sin(S.t * 1.7 + (side === 'left' ? 0 : 2.3)) * 0.05;
        target = new T.Vector3(side === 'left' ? -0.36 : 0.36,
          Math.max(0.22, shY - 0.62 + sw), -0.2);
      }
      hand.g.position.copy(target);
      if (quat) hand.g.quaternion.copy(quat); else hand.g.quaternion.identity();
      var want = (h && h.grab) ? 1 : 0;
      hand.fist += (want - hand.fist) * Math.min(1, 14 * dt);
      for (var k = 0; k < hand.knuckles.length; k++) {
        hand.knuckles[k].position.z = -0.1 + hand.fist * 0.07;
        hand.knuckles[k].position.y = -0.02 + hand.fist * 0.035;
      }
      hand.thumb.position.z = 0.02 + hand.fist * 0.05;
      var dir = new T.Vector3().subVectors(target, sh.position);
      var len = dir.length();
      if (len < 1e-4) { arm.visible = false; continue; }
      arm.visible = true;
      arm.position.copy(sh.position).addScaledVector(dir, 0.5);
      arm.scale.set(1, len, 1);
      arm.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
    }
  }

  /* Repinta el monke con los colores del mundo (cada mundo tiene su monke). */
  function paintMonke() {
    var meta = WORLDS[S.world] || WORLDS.prado;
    if (S.body) {
      try {
        S.body.fur.color.setHex(meta.monke);
        S.body.skin.color.setHex(meta.belly);
      } catch (e) {}
    }
  }

  /* Borra el mundo anterior (mallas y props) sin tocar jugador ni cámara. */
  function clearWorld() {
    var T = S.three;
    S.props = [];
    S.trunks = [];
    S.orbs = 0;
    S.orbsTotal = 0;
    S.bells = 0;
    S.bounces = 0;
    if (S.group && S.scene) {
      S.scene.remove(S.group);
      S.group.traverse(function (o) {
        if (o.geometry) { try { o.geometry.dispose(); } catch (e) {} }
        if (o.material) {
          try {
            if (o.material.map) o.material.map.dispose();
            o.material.dispose();
          } catch (e2) {}
        }
      });
    }
    S.group = new T.Group();
    S.group.name = 'doga-gorilla-world';
    S.scene.add(S.group);
    if (S.scene.fog) S.scene.fog = null;
  }

  /* ----------------------------------------------------- piezas comunes */
  function addSky(meta) {
    var T = S.three, radius = meta.radius;
    var mat = new T.MeshBasicMaterial({ side: T.BackSide, depthWrite: false });
    var tex = skyTexture(T, meta.sky);
    if (tex) mat.map = tex; else mat.color = new T.Color(meta.fog);
    S.group.add(new T.Mesh(new T.SphereGeometry(radius * 5, 32, 20), mat));
    S.scene.fog = new T.Fog(new T.Color(meta.fog), radius * 1.2, radius * 4.2);
  }

  function addGround(meta) {
    var T = S.three, radius = meta.radius, i;
    var ground = new T.Mesh(new T.CircleGeometry(radius, 84),
      new T.MeshStandardMaterial({ color: meta.grass, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    S.group.add(ground);
    /* canto de la isla: se ve dónde acaba el mundo (el límite es de verdad) */
    var rim = new T.Mesh(new T.CylinderGeometry(radius, radius * 0.82, 3.4, 84, 1, true),
      new T.MeshStandardMaterial({ color: meta.hill, roughness: 1, side: T.DoubleSide }));
    rim.position.y = -1.7;
    S.group.add(rim);
    for (i = 0; i < 14; i++) {
      var a = (i / 14) * Math.PI * 2, d = radius * (0.74 + (i % 3) * 0.08);
      var hill = new T.Mesh(new T.SphereGeometry(4 + (i % 4), 14, 10),
        new T.MeshStandardMaterial({ color: meta.hill, roughness: 1 }));
      hill.position.set(Math.cos(a) * d, -2.4 - (i % 3), Math.sin(a) * d);
      hill.scale.set(1, 0.6, 1);
      S.group.add(hill);
    }
    return ground;
  }

  /* Reparte n posiciones en anillos (nunca en el centro: ahí sales tú). */
  function scatter(n, cb) {
    var meta = WORLDS[S.world];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + (i % 4) * 0.21;
      var d = 4.2 + (i % 5) * (meta.radius * 0.11);
      cb(Math.cos(a) * d, Math.sin(a) * d, i);
    }
  }

  /* ------------------------------------------------ cosas que se tocan */
  function haptic(hand, power) {
    var h = S.hands[hand];
    try {
      var acts = h && h.src && h.src.gamepad && h.src.gamepad.hapticActuators;
      if (acts && acts.length) acts[0].pulse(power || 0.6, 60);
    } catch (e) {}
  }

  function hapticBoth(power) { haptic('left', power); haptic('right', power); }

  function addOrb(x, y, z, color) {
    var T = S.three;
    var hex = color || 0xffe066;
    var mesh = new T.Mesh(new T.IcosahedronGeometry(0.17, 0),
      new T.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.85,
        roughness: 0.3, metalness: 0.2 }));
    mesh.position.set(x, y, z);
    S.group.add(mesh);
    var p = {
      kind: 'orb', mesh: mesh, pos: mesh.position, r: 0.44, cool: 0,
      base: y, seed: Math.random() * 6.28,
      update: function (dt, t) {
        if (p.cool > 0) return;
        mesh.rotation.y += dt * 1.7;
        mesh.rotation.x += dt * 0.8;
        mesh.position.y = p.base + Math.sin(t * 1.7 + p.seed) * 0.12;
      },
      touch: function (hand) {
        if (p.cool > 0) return;
        p.cool = 1e9;
        mesh.visible = false;
        p.pos.set(0, -999, 0);
        S.orbs++;
        haptic(hand, 0.8);
        emit('estrella ' + S.orbs + ' / ' + S.orbsTotal);
        if (S.orbs >= S.orbsTotal) {
          emit('¡las has cogido todas! ahí van más');
          respawnOrbs();
        }
      }
    };
    S.orbsTotal++;
    S.props.push(p);
    return p;
  }

  /* Vuelve a repartir las estrellas por el mundo (el juego no se acaba nunca). */
  function respawnOrbs() {
    var n = 0, radius = WORLDS[S.world].radius;
    S.props.forEach(function (p) {
      if (p.kind !== 'orb') return;
      var a = Math.random() * Math.PI * 2;
      var d = 3 + Math.random() * (radius - 4);
      p.pos.set(Math.cos(a) * d, 0.9 + Math.random() * 0.9, Math.sin(a) * d);
      p.base = p.pos.y;
      p.mesh.visible = true;
      p.cool = 0;
      n++;
    });
    S.orbs = 0;
    S.orbsTotal = n;
  }

  function addBouncer(x, z, color, power) {
    var T = S.three;
    var hex = color || 0xff7fb0;
    var dome = new T.Mesh(new T.SphereGeometry(0.8, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new T.MeshStandardMaterial({ color: hex, roughness: 0.4, emissive: hex,
        emissiveIntensity: 0.2 }));
    dome.position.set(x, 0, z);
    dome.scale.set(1, 0.6, 1);
    S.group.add(dome);
    var p = {
      kind: 'bouncer', mesh: dome, pos: new T.Vector3(x, 0.4, z), r: 0.95,
      cool: 0, power: power || 8.2,
      update: function (dt) {
        if (p.cool > 0) p.cool -= dt;
        var k = p.cool > 0 ? 1 + (0.35 - p.cool) * 0.7 : 1;
        dome.scale.set(k, 0.6 / k, k);
      },
      touch: function (hand) {
        if (p.cool > 0) return;
        p.cool = 0.35;
        S.vel.y = Math.max(S.vel.y, p.power);
        S.pos.y = Math.max(S.pos.y, 0.05);
        S.bounces++;
        haptic(hand, 1);
        emit('¡boing! ' + S.bounces + ' saltos');
      }
    };
    S.props.push(p);
    return p;
  }

  function addSpinner(x, z, color) {
    var T = S.three;
    var hex = color || 0xfff2a8;
    var g = new T.Group();
    var post = new T.Mesh(new T.CylinderGeometry(0.09, 0.12, 1.55, 8),
      new T.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 }));
    post.position.y = 0.78;
    g.add(post);
    var hub = new T.Group();
    hub.position.y = 1.55;
    for (var i = 0; i < 4; i++) {
      var blade = new T.Mesh(new T.BoxGeometry(1.05, 0.5, 0.05),
        new T.MeshStandardMaterial({ color: hex, roughness: 0.5 }));
      blade.position.set(Math.cos(i * Math.PI / 2) * 0.55, Math.sin(i * Math.PI / 2) * 0.55, 0);
      blade.rotation.z = i * Math.PI / 2;
      hub.add(blade);
    }
    g.add(hub);
    g.position.set(x, 0, z);
    S.group.add(g);
    var p = {
      kind: 'spinner', mesh: g, pos: new T.Vector3(x, 1.55, z), r: 0.9, cool: 0, spin: 0,
      update: function (dt) {
        if (p.cool > 0) p.cool -= dt;
        if (Math.abs(p.spin) > 0.01) {
          hub.rotation.z += p.spin * dt;
          p.spin *= Math.max(0, 1 - 0.9 * dt);
        }
      },
      touch: function (hand) {
        if (p.cool > 0) return;
        p.cool = 0.3;
        p.spin = 11;
        haptic(hand, 0.45);
        emit('¡gira que gira!');
      }
    };
    S.props.push(p);
    return p;
  }

  function addBell(x, y, z, color) {
    var T = S.three;
    var hex = color || 0xffd166;
    var bell = new T.Mesh(new T.SphereGeometry(0.34, 16, 12),
      new T.MeshStandardMaterial({ color: hex, roughness: 0.25, metalness: 0.55,
        emissive: hex, emissiveIntensity: 0.25 }));
    bell.position.set(x, y, z);
    bell.scale.set(1, 1.15, 1);
    S.group.add(bell);
    var p = {
      kind: 'bell', mesh: bell, pos: bell.position, r: 0.6, cool: 0,
      update: function (dt) {
        if (p.cool > 0) p.cool -= dt;
        var k = p.cool > 0 ? 1 + (0.5 - p.cool) * 0.25 : 1;
        bell.scale.set(k, 1.15 / k, k);
        bell.material.emissiveIntensity = p.cool > 0 ? 0.9 : 0.25;
      },
      touch: function (hand) {
        if (p.cool > 0) return;
        p.cool = 0.5;
        S.bells++;
        haptic(hand, 0.9);
        emit('¡dong! ' + S.bells + ' campanadas');
      }
    };
    S.props.push(p);
    return p;
  }

  /* --------------------------------------------------------- los mundos */
  function buildWorld(name) {
    var key = WORLDS[name] ? name : 'prado';
    var meta = WORLDS[key];
    var i, a, d;
    S.world = key;
    clearWorld();
    addSky(meta);
    addGround(meta);
    if (key === 'prado') buildPrado(meta);
    else if (key === 'caramelo') buildCaramelo(meta);
    else buildCristal(meta);
    paintMonke();
    /* estrellas para recoger, repartidas por todo el mundo */
    for (i = 0; i < 9; i++) {
      a = (i / 9) * Math.PI * 2 + 0.4;
      d = 4 + (i % 3) * 3.2 + meta.radius * 0.3;
      addOrb(Math.cos(a) * d, 1.0 + (i % 2) * 0.4, Math.sin(a) * d,
        i % 2 ? meta.accent : 0xffffff);
    }
    /* punto de salida en el centro, quieto */
    S.pos.set(0, 0, 0);
    S.vel.set(0, 0, 0);
    S.player.position.copy(S.pos);
    S.ended = false;
    emit('Bienvenido a ' + meta.name + ' · manos al suelo y a correr');
    drawHud(true);
    return S.world;
  }

  function buildPrado(meta) {
    var T = S.three, i;
    var trunkMat = new T.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 1 });
    var leafMats = [
      new T.MeshStandardMaterial({ color: 0x35a54e, roughness: 0.9 }),
      new T.MeshStandardMaterial({ color: 0x59c76a, roughness: 0.9 }),
      new T.MeshStandardMaterial({ color: 0x8fe07a, roughness: 0.9 })
    ];
    scatter(12, function (x, z, n) {
      var tree = new T.Group();
      var h = 1.7 + (n % 3) * 0.5;
      var trunk = new T.Mesh(new T.CylinderGeometry(0.13, 0.19, h, 8), trunkMat);
      trunk.position.y = h / 2;
      tree.add(trunk);
      for (var k = 0; k < 3; k++) {
        var ball = new T.Mesh(new T.SphereGeometry(0.95 - k * 0.2, 12, 10), leafMats[(n + k) % 3]);
        ball.position.set(Math.sin(n + k) * 0.3, h + 0.2 + k * 0.45, Math.cos(n * 2 + k) * 0.3);
        tree.add(ball);
      }
      tree.position.set(x, 0, z);
      S.group.add(tree);
      /* el tronco se puede agarrar con el gatillo y trepar (como en gorilla tag) */
      S.trunks.push({ x: x, z: z, r: 0.34, top: h + 1.1 });
    });
    /* nubes flotando (se pueden empujar con la cabeza, no molestan) */
    for (i = 0; i < 14; i++) {
      var ca = (i / 14) * Math.PI * 2;
      var cloud = new T.Mesh(new T.SphereGeometry(2.2 + (i % 3), 12, 8),
        new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
      cloud.position.set(Math.cos(ca) * meta.radius * 0.8, 9 + (i % 4) * 1.6,
        Math.sin(ca) * meta.radius * 0.8);
      cloud.scale.set(1.4, 0.55, 1);
      S.group.add(cloud);
    }
    scatter(5, function (x, z, n) { addBouncer(x, z, 0xff8fb0, 8 + n * 0.4); });   // setas
    scatter(3, function (x, z) { addSpinner(x, z, 0xfff2a8); });                    // molinos
    scatter(4, function (x, z) { addBell(x, 1.05, z, 0xffd166); });                 // campanas
    scatter(6, function (x, z) { addCritter(x, z, 0xffb0e0); });                    // mariposas
  }

  function buildCaramelo(meta) {
    var T = S.three;
    var stickMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    /* charco de chocolate */
    var pond = new T.Mesh(new T.CircleGeometry(5.5, 48),
      new T.MeshStandardMaterial({ color: 0x6b3a1f, roughness: 0.35, metalness: 0.15 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(9, 0.012, -7);
    S.group.add(pond);
    /* piruletas */
    scatter(10, function (x, z, n) {
      if (Math.hypot(x - 9, z + 7) < 8) return;
      var g = new T.Group();
      var stick = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 2.1, 8), stickMat);
      stick.position.y = 1.05;
      g.add(stick);
      var sweet = new T.Mesh(new T.TorusGeometry(0.75, 0.3, 10, 20),
        new T.MeshStandardMaterial({ color: [0xff7fb6, 0x7fd6ff, 0xfff07a, 0xb48cff][n % 4],
          roughness: 0.35 }));
      sweet.position.y = 2.3;
      sweet.rotation.x = Math.PI / 2;
      g.add(sweet);
      g.position.set(x, 0, z);
      S.group.add(g);
      S.trunks.push({ x: x, z: z, r: 0.3, top: 2.9 });   // palo trepable
    });
    scatter(5, function (x, z, n) { addBouncer(x, z, 0x8ef2c0, 8.4 + n * 0.3); });  // gelatinas
    scatter(3, function (x, z) { addSpinner(x, z, 0xff9ad5); });                    // remolinos
    scatter(4, function (x, z) { addBell(x, 1.0, z, 0xfff3a0); });                  // gominolas
    scatter(5, function (x, z) { addCritter(x, z, 0xffd0f0); });                    // abejas
  }

  function buildCristal(meta) {
    var T = S.three, i;
    var moon = new T.Mesh(new T.SphereGeometry(3.4, 20, 14),
      new T.MeshBasicMaterial({ color: 0xdff6ff }));
    moon.position.set(-22, 20, -32);
    S.group.add(moon);
    /* cristales: conos translúcidos que se encienden */
    for (i = 0; i < 26; i++) {
      var a = (i / 26) * Math.PI * 2 + (i % 3) * 0.4;
      var d = 4.5 + (i % 5) * (meta.radius * 0.1);
      var h = 1.6 + (i % 4) * 0.9;
      var cry = new T.Mesh(new T.ConeGeometry(0.5, h, 6),
        new T.MeshStandardMaterial({ color: 0x9ff2ff, emissive: 0x2fa8c8,
          emissiveIntensity: 0.5, transparent: true, opacity: 0.82, roughness: 0.15,
          metalness: 0.4 }));
      cry.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
      cry.rotation.z = Math.sin(i) * 0.12;
      S.group.add(cry);
      S.trunks.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: 0.55, top: h });  // cristal trepable
    }
    /* luciérnagas de cristal */
    for (i = 0; i < 40; i++) {
      var fa = Math.random() * Math.PI * 2, fr = 2 + Math.random() * (meta.radius - 3);
      var fly = new T.Sprite(new T.SpriteMaterial({ color: 0xa8f7ff, transparent: true,
        opacity: 0.9, depthWrite: false }));
      fly.scale.setScalar(0.12);
      fly.position.set(Math.cos(fa) * fr, 0.8 + Math.random() * 3, Math.sin(fa) * fr);
      S.group.add(fly);
    }
    scatter(5, function (x, z, n) { addBouncer(x, z, 0x66e0ff, 8.6 + n * 0.3); });  // losas
    scatter(3, function (x, z) { addSpinner(x, z, 0xbdf5ff); });                    // esquirlas
    scatter(3, function (x, z) { addBell(x, 1.35, z, 0xc9f7ff); });                 // carillón
    scatter(5, function (x, z) { addCritter(x, z, 0x8ff0d0); });                    // polillas
  }

  /* ================================================== MANOS Y EMPUJONES */
  /* Igual que Gorilla Tag: no hay sticks. Cada mano que roza el suelo (o una
     seta, un molino, una campana) te empuja en sentido contrario a como la
     arrastras. Arrastra las manos hacia abajo → sales volando hacia arriba.
     Arrástralas hacia atrás → avanzas. Con las dos manos, más fuerza. */

  /* Altura del suelo bajo los pies (las islas son llanas). */
  function groundAt() { return 0; }

  /* Lee dónde están las manos (coordenadas del cuerpo: y = 0 es el suelo). */
  /* ¿Está apretado el botón «i» del mando? (0 = gatillo, 1 = squeeze/grip).
     El grip sirve para agarrarse al suelo o a un tronco y trepar. */
  function btn(src, i) {
    try {
      var gp = src && src.gamepad;
      if (!gp || !gp.buttons || !gp.buttons[i]) return false;
      var b = gp.buttons[i];
      return !!b.pressed || (b.value || 0) > 0.5;
    } catch (e) { return false; }
  }

  function readHands(frame) {
    var T = S.three;
    if (!frame || !S.session || !frame.getPose || !T) return;
    var sources = S.session.inputSources || [];
    var seen = { left: false, right: false };
    for (var i = 0; i < sources.length; i++) {
      var src = sources[i];
      if (!src || !src.gripSpace) continue;
      var hand = (src.handedness === 'left' || src.handedness === 'right') ? src.handedness : null;
      if (!hand) continue;
      var pose = null;
      try { pose = frame.getPose(src.gripSpace, S.refSpace); } catch (e) { pose = null; }
      if (!pose) continue;
      var p = pose.transform.position;
      var now = new T.Vector3(p.x, p.y, p.z);
      var prev = S.hands[hand];
      var q = pose.transform.orientation;
      var cur = {
        src: src,
        now: now,
        prev: prev && prev.now ? prev.now : now.clone(),
        quat: new T.Quaternion(q.x, q.y, q.z, q.w),
        grab: !!btn(src, 1),
        vel: new T.Vector3()
      };
      cur.vel.copy(now).sub(cur.prev).divideScalar(Math.max(1e-3, S.dt || 0.016));
      /* la mano «toca» el suelo si baja hasta la altura de la rodilla */
      cur.touching = (S.pos.y + now.y - (S.drop || 0)) < groundAt() + HAND_REACH;
      seen[hand] = true;
      S.hands[hand] = cur;
    }
    /* si sueltas un mando, esa mano desaparece (no se queda congelada) */
    if (!seen.left) S.hands.left = null;
    if (!seen.right) S.hands.right = null;
  }

  /* Toca lo que haya cerca (setas, molinos, campanas, estrellas, bichitos). */
  function propTouch(world, hand) {
    var hit = false;
    for (var i = 0; i < S.props.length; i++) {
      var p = S.props[i];
      if (!p || !p.mesh || p.cool > 0.9e9) continue;
      if (world.distanceTo(p.pos) > p.r) continue;
      p.touch(hand);
      hit = true;
    }
    return hit;
  }

  /* Aplica el empujón de cada mano. Devuelve true si alguna ha empujado. */
  function armPush(dt) {
    var T = S.three, names = ['left', 'right'], pushed = false, i;
    if (!T) return false;
    for (i = 0; i < 2; i++) {
      var h = S.hands[names[i]];
      if (!h) continue;
      /* la mano en coordenadas del mundo (el cuerpo va bajado «drop») */
      var world = new T.Vector3(S.pos.x + h.now.x, S.pos.y + h.now.y - (S.drop || 0),
        S.pos.z + h.now.z);
      /* primero, ¿ha tocado alguna cosa? */
      if (propTouch(world, names[i])) pushed = true;
      if (!h.touching) continue;
      var speed = h.vel.length();
      if (speed < 0.3) continue;
      /* el cuerpo coge la velocidad de la mano (en sentido contrario) */
      var k = PUSH_K * dt * Math.min(1, speed / 3.2);
      S.vel.addScaledVector(h.vel, -k);
      S.lastPush = S.t;
      pushed = true;
      /* pequeña sacudida en la mano que empuja (con freno, no en cada fotograma) */
      if (speed > 1.6 && S.t - (h.hapT || 0) > 0.14) {
        h.hapT = S.t;
        haptic(names[i], 0.18);
      }
    }
    if (pushed) {
      var flat = Math.hypot(S.vel.x, S.vel.z);
      if (flat > MAX_SPEED) {
        S.vel.x *= MAX_SPEED / flat;
        S.vel.z *= MAX_SPEED / flat;
      }
      if (S.vel.y > MAX_SPEED) S.vel.y = MAX_SPEED;
      if (S.vel.y < -MAX_SPEED) S.vel.y = -MAX_SPEED;
    }
    return pushed;
  }

  /* ¿Hay un tronco/cristal al alcance de esta mano (para trepar)? */
  function trunkNear(h) {
    if (!S.trunks || !S.trunks.length) return null;
    var wx = S.pos.x + h.now.x;
    var wy = S.pos.y + h.now.y - (S.drop || 0);
    var wz = S.pos.z + h.now.z;
    for (var i = 0; i < S.trunks.length; i++) {
      var t = S.trunks[i];
      if (wy < 0.12 || wy > t.top) continue;
      if (Math.hypot(wx - t.x, wz - t.z) < t.r + 0.5) return t;
    }
    return null;
  }

  /* Gravedad, rozamiento, trepar y límites del mundo. */
  function physics(dt) {
    if (!S.three) return;
    var drop = S.drop || 0;
    var pushed = armPush(dt);
    /* Trepar: con el gatillo apretado y la mano en el suelo o en un tronco, el
       cuerpo se mueve 1:1 con la mano (bajas las manos y subes, como en GT). */
    var climb = null, climbSide = null, ci;
    var cnames = ['left', 'right'];
    for (ci = 0; ci < 2; ci++) {
      var ch = S.hands[cnames[ci]];
      if (ch && ch.grab && (ch.touching || trunkNear(ch))) { climb = ch; climbSide = cnames[ci]; break; }
    }
    S.grabbing = climbSide;
    if (climb) {
      S.vel.set(0, 0, 0);
      S.pos.x -= (climb.now.x - climb.prev.x);
      S.pos.z -= (climb.now.z - climb.prev.z);
      S.pos.y = Math.max(groundAt(), Math.min(9, S.pos.y - (climb.now.y - climb.prev.y)));
      S.onGround = S.pos.y <= groundAt() + 0.02;
    } else {
      var drag = (S.onGround && !pushed) ? DRAG_GROUND : DRAG_AIR;
      S.vel.multiplyScalar(Math.max(0, 1 - drag * dt));
      S.vel.y += GRAVITY * dt;
      S.pos.addScaledVector(S.vel, dt);
      var gy = groundAt();
      if (S.pos.y <= gy + 1e-4) {
        S.pos.y = gy;
        if (S.vel.y < 0) S.vel.y = 0;
        S.onGround = true;
      } else {
        S.onGround = false;
      }
    }
    /* el límite del mundo: pared invisible en el borde de la isla */
    var radius = WORLDS[S.world].radius - 0.9;
    var d = Math.hypot(S.pos.x, S.pos.z);
    if (d > radius) {
      S.pos.x *= radius / d;
      S.pos.z *= radius / d;
      S.vel.x *= -0.18;
      S.vel.z *= -0.18;
      if (!S.wallT || S.t - S.wallT > 3) {
        S.wallT = S.t;
        emit('¡el borde del mundo! no se puede salir');
      }
    }
    if (S.pos.y < FALL_Y) respawn();
    /* el cuerpo va bajado «drop» para que el suelo quede a la altura del pecho */
    S.player.position.set(S.pos.x, S.pos.y - drop, S.pos.z);
    S.player.updateMatrixWorld(true);
  }

  function respawn() {
    S.pos.set(0, 0, 0);
    S.vel.set(0, 0, 0);
    S.grabbing = null;
    S.player.position.set(0, -(S.drop || 0), 0);
    S.player.updateMatrixWorld(true);
    emit('¡ups! al centro otra vez');
  }

  /* ================================================================ HUD */
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function makeHud() {
    var T = S.three;
    if (S.hud || !T || !S.scene) return;
    var c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    S.hudCtx = c.getContext('2d');
    if (!S.hudCtx) return;
    S.hudTex = new T.CanvasTexture(c);
    S.hud = new T.Mesh(new T.PlaneGeometry(0.66, 0.33),
      new T.MeshBasicMaterial({ map: S.hudTex, transparent: true, depthTest: false,
        depthWrite: false }));
    S.hud.renderOrder = 999;
    S.scene.add(S.hud);
    drawHud(true);
  }

  function drawHud(force) {
    if (!S.hudCtx) return;
    if (!force && S.t - S.hudAt < 0.25) return;
    S.hudAt = S.t;
    var g = S.hudCtx, meta = WORLDS[S.world] || WORLDS.prado;
    g.clearRect(0, 0, 512, 256);
    g.fillStyle = 'rgba(6,20,14,0.80)';
    roundRect(g, 2, 2, 508, 252, 26);
    g.fill();
    g.fillStyle = '#8ff7b6';
    g.font = 'bold 34px system-ui,sans-serif';
    g.fillText('DOGA GORILLA', 24, 54);
    g.fillStyle = '#d6ffe6';
    g.font = '22px system-ui,sans-serif';
    g.fillText(meta.tag + '  ' + meta.name, 24, 94);
    g.fillStyle = '#ffe066';
    g.font = 'bold 26px system-ui,sans-serif';
    g.fillText('⭐ ' + S.orbs + '/' + S.orbsTotal + '    🔔 ' + S.bells + '    🍄 ' + S.bounces, 24, 138);
    g.fillStyle = '#9fc4ae';
    g.font = '19px system-ui,sans-serif';
    g.fillText('Manos al suelo y arrástralas: así se anda.', 24, 176);
    g.fillStyle = '#8ff7ff';
    g.font = 'bold 19px system-ui,sans-serif';
    g.fillText(S.grabbing ? ('🖐️ agarrado (' + (S.grabbing === 'left' ? 'izq' : 'der') +
      ') · suelo al pecho') : ('🦍 monke · suelo al pecho · gatillo = trepar'), 24, 202);
    g.fillStyle = '#ffcf6b';
    g.font = '18px system-ui,sans-serif';
    g.fillText(String(S.msg || '').slice(0, 42), 24, 228);
    g.fillStyle = '#7fa692';
    g.font = '15px system-ui,sans-serif';
    g.fillText('Salir: menú del visor', 344, 228);
    if (S.hudTex) S.hudTex.needsUpdate = true;
  }

  /* Dónde está la cabeza en el mundo (con el cuerpo desplazado). */
  function headWorld(frame) {
    var T = S.three;
    var out = { p: new T.Vector3(0, EYE, 0), q: new T.Quaternion(), fwd: new T.Vector3(0, 0, -1) };
    if (!frame || !S.refSpace || !frame.getViewerPose) return out;
    var pose = null;
    try { pose = frame.getViewerPose(S.refSpace); } catch (e) { pose = null; }
    if (!pose) return out;
    var tr = pose.transform;
    out.p.set(tr.position.x + S.pos.x, tr.position.y + S.pos.y - (S.drop || 0),
      tr.position.z + S.pos.z);
    out.q.set(tr.orientation.x, tr.orientation.y, tr.orientation.z, tr.orientation.w);
    out.fwd.set(0, 0, -1).applyQuaternion(out.q);
    return out;
  }

  /* El cartel flota delante, un poco por encima de los ojos, y se esconde
     mientras juegas (sólo aparece cuando paras). En la vista previa del PC se
     pone encima del jugador mirando a la cámara. */
  function placeHud(frame) {
    if (!S.hud) return;
    var T = S.three, camW = S.hudCam || (S.hudCam = new T.Vector3());
    if (!S.session) {
      if (S.cam) {
        S.cam.updateMatrixWorld(true);
        camW.setFromMatrixPosition(S.cam.matrixWorld);
      } else {
        camW.set(0, 3, 7);
      }
      S.hud.position.set(S.pos.x, S.pos.y + 1.6, S.pos.z);
      S.hud.lookAt(camW);
      S.hud.visible = true;
      return;
    }
    var h = headWorld(frame);
    var fwd = h.fwd.clone();
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-5) fwd.set(0, 0, -1);
    fwd.normalize();
    S.hud.position.copy(h.p).addScaledVector(fwd, 1.25);
    S.hud.position.y = h.p.y + 0.16;
    S.hud.lookAt(h.p);
    var idle = S.t - (S.lastPush || 0);
    S.hud.visible = idle > 1.2 || S.t < 14;
  }

  function addCritter(x, z, color) {
    var T = S.three;
    var hex = color || 0xffb0e0;
    var body = new T.Mesh(new T.SphereGeometry(0.11, 8, 6),
      new T.MeshStandardMaterial({ color: hex, roughness: 0.5, emissive: hex,
        emissiveIntensity: 0.3 }));
    body.scale.set(1.6, 0.6, 1);
    body.position.set(x, 1.1, z);
    S.group.add(body);
    var p = {
      kind: 'critter', mesh: body, pos: body.position, r: 0.5, cool: 0,
      home: new T.Vector3(x, 1.1, z), seed: Math.random() * 6.28,
      update: function (dt, t) {
        if (p.cool > 0) {
          p.cool -= dt;
          body.position.y = Math.max(0.4, body.position.y - dt * 0.6);
          return;
        }
        body.position.set(p.home.x + Math.cos(t * 1.1 + p.seed) * 1.4,
          1.1 + Math.sin(t * 2 + p.seed) * 0.25,
          p.home.z + Math.sin(t * 1.1 + p.seed) * 1.4);
        body.rotation.y = t * 2;
      },
      touch: function (hand) {
        if (p.cool > 0) return;
        p.cool = 4;
        haptic(hand, 0.35);
        emit('¡el bichito se ha ido volando!');
      }
    };
    S.props.push(p);
    return p;
  }
  /* Mueve y hace cositas a todo lo interactivo. */
  function updateProps(dt) {
    for (var i = 0; i < S.props.length; i++) {
      var p = S.props[i];
      if (p && p.update) p.update(dt, S.t);
    }
  }

  /* ================================================== ESTADO PARA LA PÁGINA */
  function state() {
    return {
      version: VERSION,
      running: !!S.running,
      preview: !!S.preview,
      xr: !!S.session,
      world: S.world,
      worldName: (WORLDS[S.world] || {}).name || '',
      orbs: S.orbs,
      orbsTotal: S.orbsTotal,
      bells: S.bells,
      bounces: S.bounces,
      speed: S.vel ? Math.round(S.vel.length() * 10) / 10 : 0,
      onGround: !!S.onGround,
      pos: S.pos ? { x: Math.round(S.pos.x * 100) / 100, y: Math.round(S.pos.y * 100) / 100,
        z: Math.round(S.pos.z * 100) / 100 } : null,
      drop: Math.round((S.drop || 0) * 100) / 100,
      grabbing: S.grabbing || null,
      body: !!S.body,
      msg: S.msg
    };
  }

  function pushState(force) {
    if (!S.opts.onState) return;
    if (!force && S.t - (S.stateAt || 0) < 0.25) return;
    S.stateAt = S.t;
    try { S.opts.onState(state()); } catch (e) {}
  }

  /* ============================================================ SESIÓN XR */
  function makeRenderer(host) {
    var T = S.three;
    var r = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
    r.setSize(host.clientWidth || global.innerWidth || 800, host.clientHeight || global.innerHeight || 600);
    r.xr.enabled = true;
    try { r.xr.setReferenceSpaceType('local-floor'); } catch (e) {}
    host.appendChild(r.domElement);
    S.renderer = r;
    return r;
  }

  function onFrame(time, frame) {
    if (!S.running) return;
    var sess = S.session;
    if (sess && sess.requestAnimationFrame) sess.requestAnimationFrame(onFrame);
    else if (S.renderer && S.renderer.setAnimationLoop) S.renderer.setAnimationLoop(onFrame);
    var dt = S.last ? Math.min(0.08, Math.max(0.001, (time - S.last) / 1000)) : 0.016;
    S.last = time;
    S.dt = dt;
    S.t += dt;
    if (!S.refSpace && S.renderer && S.renderer.xr.getReferenceSpace) {
      try { S.refSpace = S.renderer.xr.getReferenceSpace(); } catch (e) {}
    }
    readHands(frame);
    physics(dt);
    updateAvatar(frame);
    updateProps(dt);
    drawHud(false);
    placeHud(frame);
    if (S.renderer) S.renderer.render(S.scene, S.cam);
    pushState(false);
  }

  function onSessionEnd() {
    var reason = 'ended';
    S.session = null;
    S.running = false;
    S.preview = false;
    S.hands = { left: null, right: null };
    emit('sesión cerrada');
    pushState(true);
    if (S.opts.onEnd) { try { S.opts.onEnd(reason); } catch (e) {} }
  }

  function start(opts) {
    S.opts = opts || {};
    var host = S.opts.host;
    if (!host) return Promise.reject(new Error('falta el contenedor (opts.host)'));
    if (S.running) return Promise.resolve(state());
    if (!supported()) return Promise.reject(new Error('este navegador no tiene WebXR'));
    if (S.opts.world) S.world = WORLDS[S.opts.world] ? S.opts.world : 'prado';
    return loadThree().then(function (T) {
      S.three = T;
      if (!S.scene) buildScene();
      if (!S.body) buildAvatar();
      if (!S.preview) makeRenderer(host);
      S.renderer.xr.enabled = true;
      return global.navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
      });
    }).then(function (sess) {
      S.session = sess;
      sess.addEventListener('end', onSessionEnd);
      return S.renderer.xr.setSession(sess);
    }).then(function () {
      S.running = true;
      S.last = 0;
      S.t = 0;
      S.refSpace = null;
      S.hands = { left: null, right: null };
      S.dropSet = false;                 // recalcula el suelo según tu altura
      S.grabbing = null;
      makeHud();
      buildWorld(S.world);
      try { S.refSpace = S.renderer.xr.getReferenceSpace(); } catch (e) {}
      emit('¡dentro! brazos largos: manos al suelo y arrastra para andar');
      pushState(true);
      S.session.requestAnimationFrame(onFrame);
      return state();
    });
  }


  /* ================================================= VISTA PREVIA EN EL PC */
  /* Para ver los mundos sin gafas: cámara en tercera persona, WASD para andar
     y el ratón (arrastrando) para girar la vista. No sustituye a la VR. */
  function onKey(e, down) {
    var k = e && e.key;
    if (!k || !S.running || !S.preview) return;
    S.keys[k.length === 1 ? k.toLowerCase() : k] = down;
    if (down && (k === ' ' || k === 'Spacebar')) {
      if (S.onGround) {
        S.vel.y = 8.4;
        S.pos.y = Math.max(S.pos.y, 0.02);
      }
      if (e.preventDefault) e.preventDefault();
    }
  }

  function placePreviewCam() {
    var d = 6.4;
    /* la cámara cuelga del jugador (S.player): se pasa a coordenadas locales
       para que la vista previa gire alrededor del jugador y no se vaya con él.
       El jugador va bajado «drop» (el suelo a la altura del pecho), así que la
       altura local se compensa con ese desplazamiento. */
    var drop = S.drop || 0;
    var wx = Math.cos(S.camYaw) * d;
    var wy = 2.6 + Math.sin(S.camPitch) * 3.0;
    var wz = Math.sin(S.camYaw) * d;
    S.cam.position.set(wx - S.pos.x, wy - S.pos.y + drop, wz - S.pos.z);
    S.cam.updateMatrixWorld(true);
    S.cam.lookAt(S.pos.x, S.pos.y + 0.8, S.pos.z);
  }

  function previewStep() {
    if (!S.running || !S.preview) return;
    var now = (global.performance && performance.now) ? performance.now() : Date.now();
    var dt = S.last ? Math.min(0.08, Math.max(0.001, (now - S.last) / 1000)) : 0.016;
    S.last = now;
    S.dt = dt;
    S.t += dt;
    var fx = -Math.sin(S.camYaw), fz = -Math.cos(S.camYaw);
    var sx = -fz, sz = fx, ax = 0, az = 0;
    if (S.keys.w || S.keys.ArrowUp) { ax += fx; az += fz; }
    if (S.keys.s || S.keys.ArrowDown) { ax -= fx; az -= fz; }
    if (S.keys.a || S.keys.ArrowLeft) { ax -= sx; az -= sz; }
    if (S.keys.d || S.keys.ArrowRight) { ax += sx; az += sz; }
    if (ax || az) {
      var len = Math.hypot(ax, az) || 1;
      S.vel.x += (ax / len) * 26 * dt;
      S.vel.z += (az / len) * 26 * dt;
      var flat = Math.hypot(S.vel.x, S.vel.z);
      if (flat > 6) {
        S.vel.x *= 6 / flat;
        S.vel.z *= 6 / flat;
      }
      S.lastPush = S.t;
    }
    physics(dt);
    updateAvatar(null);
    updateProps(dt);
    drawHud(false);
    placePreviewCam();
    placeHud(null);
    if (S.renderer) S.renderer.render(S.scene, S.cam);
    pushState(false);
    if (global.requestAnimationFrame) global.requestAnimationFrame(previewStep);
  }

  function startPreview(host, opts) {
    S.opts = opts || S.opts || {};
    if (!host) return Promise.reject(new Error('falta el contenedor (host)'));
    if (S.running) return Promise.resolve(state());
    return loadThree().then(function (T) {
      S.three = T;
      S.preview = true;
      if (!S.scene) buildScene();
      if (!S.body) buildAvatar();
      var r = makeRenderer(host);
      r.xr.enabled = false;
      S.cam.aspect = (host.clientWidth || 640) / (host.clientHeight || 360);
      S.cam.updateProjectionMatrix();
      makeHud();
      buildWorld(S.opts.world || S.world);
      /* en el PC no hay altura de ojos real: monke bajito como en las gafas */
      S.drop = 0;
      S.dropSet = true;
      S.running = true;
      S.last = 0;
      S.t = 0;
      if (global.addEventListener) {
        global.addEventListener('keydown', function (e) { onKey(e, true); });
        global.addEventListener('keyup', function (e) { onKey(e, false); });
      }
      var dom = r.domElement;
      dom.style.touchAction = 'none';
      if (dom.addEventListener) {
        dom.addEventListener('pointerdown', function (e) {
          S.drag = { x: e.clientX, y: e.clientY };
          if (dom.setPointerCapture && e.pointerId !== undefined) {
            try { dom.setPointerCapture(e.pointerId); } catch (err) {}
          }
        });
        dom.addEventListener('pointermove', function (e) {
          if (!S.drag) return;
          S.camYaw -= (e.clientX - S.drag.x) * 0.006;
          S.camPitch = Math.max(-0.5, Math.min(0.9, S.camPitch + (e.clientY - S.drag.y) * 0.004));
          S.drag = { x: e.clientX, y: e.clientY };
        });
        dom.addEventListener('pointerup', function () { S.drag = null; });
        dom.addEventListener('pointercancel', function () { S.drag = null; });
      }
      emit('vista previa: WASD para andar, espacio para saltar, arrastra para mirar');
      pushState(true);
      previewStep();
      return state();
    });
  }

  /* ================================================================= API */
  function stopAll() {
    S.running = false;
    S.preview = false;
    if (S.session) {
      var sess = S.session;
      S.session = null;
      try { sess.end(); } catch (e) {}
    }
    if (S.renderer) {
      try { S.renderer.setAnimationLoop(null); } catch (e2) {}
      try {
        var dom = S.renderer.domElement;
        if (dom && dom.parentNode) dom.parentNode.removeChild(dom);
      } catch (e3) {}
      try { S.renderer.dispose(); } catch (e4) {}
    }
    S.renderer = null;
    S.scene = null;
    S.player = null;
    S.group = null;
    S.hud = null;
    S.hudCtx = null;
    S.hudTex = null;
    S.props = [];
    S.trunks = [];
    S.avatar = null;
    S.body = null;
    S.dropSet = false;
    S.grabbing = null;
    S.hands = { left: null, right: null };
    S.vel = null;
    S.pos = null;
    S.last = 0;
    pushState(true);
    return state();
  }

  global.DogaGorilla = {
    version: VERSION,
    supported: supported,
    /* lista de mundos para pintar la página */
    worlds: function () {
      return Object.keys(WORLDS).map(function (k) {
        return { id: k, name: WORLDS[k].name, tag: WORLDS[k].tag, radius: WORLDS[k].radius };
      });
    },
    /* cambia de mundo (sin argumento devuelve el actual) */
    world: function (name) {
      if (!name) return S.world;
      if (!WORLDS[name]) return S.world;
      S.world = name;
      if (S.three && S.running) buildWorld(name);
      pushState(true);
      return S.world;
    },
    start: start,
    startPreview: startPreview,
    stop: stopAll,
    state: state,
    /* el monke: cuerpo visible, manos y cuánto va bajado el suelo */
    monke: function () {
      var r2 = function (v) { return Math.round((v || 0) * 100) / 100; };
      var out = {
        body: !!S.body,
        parts: S.body ? Object.keys(S.body) : [],
        hands: !!(S.body && S.body.hands && S.body.hands.left && S.body.hands.right),
        drop: r2(S.drop),
        eyeY: r2(S.eyeY),
        grabbing: S.grabbing || null
      };
      if (out.hands) {
        out.handPos = {
          left: [r2(S.body.hands.left.g.position.x), r2(S.body.hands.left.g.position.y),
            r2(S.body.hands.left.g.position.z)],
          right: [r2(S.body.hands.right.g.position.x), r2(S.body.hands.right.g.position.y),
            r2(S.body.hands.right.g.position.z)]
        };
        out.shoulderY = r2(S.body.shL.position.y);
        out.torsoY = r2(S.body.torso.position.y);
        out.armLen = [r2(S.body.armL.scale.y), r2(S.body.armR.scale.y)];
      }
      return out;
    }
  };
})(window);

