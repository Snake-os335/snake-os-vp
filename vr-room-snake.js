/* Doganiero VR · La serpiente de tu habitación (2026.23) — juego de realidad mixta.
 *
 * Qué hace (se abre desde Doganiero-vr-send.softportweb.com):
 *  1. ESCANEA la habitación: en WebXR immersive-ar (Meta Quest 3/3S y similares) usa
 *     hit-test sobre el suelo y las superficies para apuntar puntos; al terminar se
 *     calcula la zona libre (los muebles/paredes quedan como obstáculos).
 *  2. Aparece una SERPIENTE en el suelo escaneado, que se arrastra por la zona libre y
 *     esquiva lo que has marcado como obstáculo.
 *  3. Se cuida con los mandos: gatillo para dejar comida o acariciarla, squeeze para
 *     limpiar sus desastres, botón A para jugar. Comida, cariño y limpieza bajan con el
 *     tiempo; hay puntos y niveles.
 *  4. Deja un ESPEJO (canvas 2D-3D aparte) para que el ordenador reciba la imagen
 *     (vr-send.js lo usa como fuente de vídeo) y pueda pedir una foto.
 *
 * API: window.DoganieroRoomSnake = { supported(), start(opts), stop(), snapshot(),
 *      mirrorStream(), state() }.
 *   opts = { onState(state), onLog(text), onEnd(motivo) }
 */
(function (global) {
  'use strict';

  var THREE_URL = '/static/assets/three-r160.min.js?v=r160';
  var LS_KEY = 'dvrRoomSnake';
  var GRID = 0.25;              // tamaño de celda del mapa de la habitación
  var MAX_ARENA = 6.0;          // lado máximo de la zona de juego (m)
  var MIRROR_W = 640, MIRROR_H = 360;

  var st = {
    running: false,
    three: null,
    loadP: null,
    renderer: null,
    scene: null,
    camera: null,
    canvas: null,
    host: null,
    clock: null,
    session: null,
    refSpace: null,
    hitSource: null,
    floorY: 0,
    scan: { active: false, pts: [], last: null, obstacles: [], done: false },
    arena: null,
    snake: null,
    segPos: [],
    target: null,
    food: null,
    messes: [],
    markers: [],
    stats: { hunger: 72, happy: 72, clean: 82, score: 0, level: 1 },
    lastState: 0,
    lastMess: 0,
    lastStep: 0,
    hint: 'Escanea la habitación',
    hintUntil: 0,
    statsCanvas: null,
    statsTex: null,
    statsSprite: null,
    statsAt: 0,
    controllers: [],
    rays: [],
    reticles: [],
    raycaster: null,
    mirror: { canvas: null, renderer: null, cam: null, last: 0, stream: null },
    opts: {},
    preview: null,
    ended: false
  };

  function log(msg) {
    try { if (st.opts.onLog) st.opts.onLog(msg); } catch (e) {}
  }

  function ensureThree() {
    if (st.loadP) return st.loadP;
    st.loadP = new Promise(function (res, rej) {
      if (global.THREE && +global.THREE.REVISION >= 150) { res(global.THREE); return; }
      var s = document.createElement('script');
      s.src = THREE_URL;
      s.async = true;
      s.onload = function () {
        if (global.THREE) res(global.THREE);
        else rej(new Error('three.js no disponible'));
      };
      s.onerror = function () { st.loadP = null; rej(new Error('No se pudo cargar three.js')); };
      document.head.appendChild(s);
    });
    return st.loadP;
  }

  function supported() {
    return !!(global.navigator && navigator.xr && navigator.xr.isSessionSupported);
  }

  function fmtScan() {
    if (!st.scan.done) return 'escaneando (' + st.scan.pts.length + ' puntos)';
    if (!st.arena) return 'sin datos';
    return st.arena.w.toFixed(1) + ' × ' + st.arena.d.toFixed(1) + ' m';
  }

  function stateView() {
    var s = st.stats;
    return {
      hunger: Math.round(s.hunger),
      happy: Math.round(s.happy),
      clean: Math.round(s.clean),
      score: Math.round(s.score),
      level: s.level,
      scan: fmtScan(),
      text: st.hint
    };
  }

  function saveStats() {
    try {
      var prev = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
      prev.score = st.stats.score;
      prev.level = st.stats.level;
      localStorage.setItem(LS_KEY, JSON.stringify(prev));
    } catch (e) {}
  }

  function loadStats() {
    try {
      var prev = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
      if (typeof prev.score === 'number' && prev.score > st.stats.score) {
        st.stats.score = prev.score;
        st.stats.level = Math.max(1, 1 + Math.floor(prev.score / 100));
      }
    } catch (e) {}
  }

  /* ---------------- escena ---------------- */

  function buildScene(THREE) {
    var scene = new THREE.Scene();
    var hemi = new THREE.HemisphereLight(0xe8fff2, 0x0e2818, 1.15);
    scene.add(hemi);
    var dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(1.2, 2.4, 0.8);
    scene.add(dir);
    st.scene = scene;
    st.raycaster = new THREE.Raycaster();
    buildStatsPanel(THREE);
  }

  function buildStatsPanel(THREE) {
    var c = document.createElement('canvas');
    c.width = 640; c.height = 200;
    st.statsCanvas = c;
    st.statsTex = new THREE.CanvasTexture(c);
    var mat = new THREE.SpriteMaterial({ map: st.statsTex, transparent: true, depthTest: false });
    var sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.9, 0.28, 1);
    sprite.position.set(0, 1.35, 0);
    st.statsSprite = sprite;
    st.scene.add(sprite);
    paintStats();
  }

  function paintStats() {
    var c = st.statsCanvas;
    if (!c) return;
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(4,18,11,0.82)';
    roundRect(ctx, 6, 6, c.width - 12, c.height - 12, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(52,209,122,0.55)';
    ctx.lineWidth = 3;
    roundRect(ctx, 6, 6, c.width - 12, c.height - 12, 26);
    ctx.stroke();
    ctx.font = '700 30px Segoe UI, system-ui, sans-serif';
    ctx.fillStyle = '#8dffcf';
    ctx.fillText('La serpiente de tu habitación', 28, 50);
    ctx.font = '700 24px Segoe UI, system-ui, sans-serif';
    ctx.fillStyle = '#eafff0';
    ctx.fillText('Nivel ' + st.stats.level + ' · ' + Math.round(st.stats.score) + ' puntos · ' + fmtScan(), 28, 84);
    var bars = [
      ['Comida', st.stats.hunger, '#34d17a'],
      ['Cariño', st.stats.happy, '#ffb454'],
      ['Limpieza', st.stats.clean, '#57c8ff']
    ];
    for (var i = 0; i < bars.length; i++) {
      var y = 104 + i * 30;
      ctx.font = '600 20px Segoe UI, system-ui, sans-serif';
      ctx.fillStyle = '#9dffc2';
      ctx.fillText(bars[i][0], 28, y + 16);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      roundRect(ctx, 140, y, 430, 20, 10);
      ctx.fill();
      ctx.fillStyle = bars[i][2];
      roundRect(ctx, 140, y, Math.max(6, 430 * Math.max(0, Math.min(100, bars[i][1])) / 100), 20, 10);
      ctx.fill();
    }
    try { st.statsTex.needsUpdate = true; } catch (e) {}
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------------- arranque / parada ---------------- */

  async function start(opts) {
    if (st.running) return stateView();
    st.opts = opts || {};
    st.ended = false;
    var THREE = await ensureThree();
    st.three = THREE;
    loadStats();
    makeCanvas();
    buildScene(THREE);
    st.clock = new THREE.Clock();
    st.running = true;
    log('Cargando realidad mixta…');
    var xrOk = false;
    if (supported()) {
      try { xrOk = await navigator.xr.isSessionSupported('immersive-ar'); } catch (e) { xrOk = false; }
    }
    if (xrOk) {
      try {
        await enterXR();
      } catch (e) {
        log('No se pudo abrir la sesión AR: ' + (e.message || e));
        startPreview('sin sesión AR');
        return stateView();
      }
    } else {
      var vrOk = false;
      if (supported()) {
        try { vrOk = await navigator.xr.isSessionSupported('immersive-vr'); } catch (e) { vrOk = false; }
      }
      if (vrOk) {
        try { await enterXR('immersive-vr'); }
        catch (e) { startPreview('sin sesión VR'); }
      } else {
        startPreview('este navegador no tiene WebXR');
      }
    }
    return stateView();
  }

  function makeCanvas() {
    var THREE = st.three;
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;z-index:2147483200;background:#04120b;touch-action:none;';
    document.body.appendChild(canvas);
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.5));
    renderer.setSize(global.innerWidth, global.innerHeight, false);
    renderer.setClearColor(0x000000, 0);
    renderer.xr.enabled = true;
    st.canvas = canvas;
    st.renderer = renderer;
    st.camera = new THREE.PerspectiveCamera(70, global.innerWidth / Math.max(1, global.innerHeight), 0.05, 40);
    st.camera.position.set(0, 1.5, 1.8);
    st.camera.lookAt(0, 0.4, 0);
    global.addEventListener('resize', onResize);
  }

  function onResize() {
    if (!st.renderer || !st.camera) return;
    if (st.renderer.xr.isPresenting) return;
    st.camera.aspect = global.innerWidth / Math.max(1, global.innerHeight);
    st.camera.updateProjectionMatrix();
    st.renderer.setSize(global.innerWidth, global.innerHeight, false);
  }

  async function enterXR(mode) {
    var THREE = st.three;
    var sessionInit = {
      requiredFeatures: ['hit-test', 'local-floor'],
      optionalFeatures: ['anchors', 'plane-detection', 'hand-tracking']
    };
    mode = mode || 'immersive-ar';
    var session = await navigator.xr.requestSession(mode, sessionInit);
    st.session = session;
    st.renderer.xr.setReferenceSpaceType('local-floor');
    await st.renderer.xr.setSession(session);
    st.refSpace = st.renderer.xr.getReferenceSpace();
    try {
      var viewer = await session.requestReferenceSpace('viewer');
      st.hitSource = await session.requestHitTestSource({ space: viewer });
    } catch (e) {
      st.hitSource = null;
    }
    session.addEventListener('end', function () { finish('sesión cerrada'); });
    setupControllers();
    st.scan.active = true;
    st.scan.done = false;
    st.scan.pts = [];
    st.scan.obstacles = [];
    setHint(mode === 'immersive-ar'
      ? 'Apunta al suelo y muévete despacio para escanear'
      : 'Sin passthrough: se jugará en un cuarto virtual');
    log(mode === 'immersive-ar' ? 'Sesión AR abierta: escaneando' : 'Sesión VR abierta (sin passthrough)');
    st.renderer.setAnimationLoop(xrLoop);
    emitState(true);
  }

  /* ---------------- mandos ---------------- */

  function setupControllers() {
    var THREE = st.three;
    var renderer = st.renderer;
    for (var i = 0; i < 2; i++) {
      var ctrl = renderer.xr.getController(i);
      ctrl.userData.index = i;
      var lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1.4)
      ]);
      var line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x35ffb2, transparent: true, opacity: 0.65 }));
      line.scale.z = 1.4;
      ctrl.add(line);
      st.rays.push(line);
      st.scene.add(ctrl);
      st.controllers.push(ctrl);
      ctrl.addEventListener('selectstart', function (ev) { onTrigger(ev.target); });
      ctrl.addEventListener('squeezestart', function (ev) { onSqueeze(ev.target); });
      var reticle = makeReticle(THREE);
      st.scene.add(reticle);
      st.reticles.push(reticle);
    }
  }

  function makeReticle(THREE) {
    var geo = new THREE.RingGeometry(0.035, 0.05, 24);
    geo.rotateX(-Math.PI / 2);
    var mat = new THREE.MeshBasicMaterial({ color: 0x35ffb2, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    return mesh;
  }

  function controllerPoint(ctrl, out) {
    var THREE = st.three;
    var origin = new THREE.Vector3();
    var dir = new THREE.Vector3(0, 0, -1);
    ctrl.getWorldPosition(origin);
    dir.applyQuaternion(ctrl.quaternion.clone().setFromRotationMatrix(ctrl.matrixWorld));
    var t = (st.floorY - origin.y) / (dir.y || -0.0001);
    if (t <= 0.15 || t > 8) return null;
    out = out || new THREE.Vector3();
    out.copy(origin).addScaledVector(dir, t);
    return out;
  }

  function haptic(ctrl, strength) {
    try {
      var gp = ctrl.gamepad;
      if (gp && gp.hapticActuators && gp.hapticActuators[0]) {
        gp.hapticActuators[0].pulse(strength || 0.6, 70);
      }
    } catch (e) {}
  }

  /* ---------------- escaneo de la habitación ---------------- */

  function scanHits(frame) {
    if (!st.hitSource || !st.refSpace) return;
    var THREE = st.three;
    var results;
    try { results = frame.getHitTestResults(st.hitSource); } catch (e) { return; }
    var n = Math.min(results.length, 2);
    for (var i = 0; i < n; i++) {
      var pose;
      try { pose = results[i].getPose(st.refSpace); } catch (e) { continue; }
      if (!pose) continue;
      var p = pose.transform.position;
      var q = pose.transform.orientation;
      var up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
      if (up.y < -0.75) up.y = -up.y;   // normal hacia abajo = suelo
      if (up.y > 0.72) {
        if (!st.scan.pts.length) st.floorY = p.y;
        var last = st.scan.last;
        if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 0.1 || Math.abs(p.y - last.y) > 0.1) {
          st.scan.pts.push({ x: p.x, y: p.y, z: p.z });
          st.scan.last = { x: p.x, y: p.y, z: p.z };
          if (st.scan.pts.length % 4 === 0) addMarker(p.x, p.y + 0.004, p.z);
        }
      } else if (p.y > st.floorY + 0.12) {
        var lo = st.scan.obstacles[st.scan.obstacles.length - 1];
        if (!lo || Math.hypot(p.x - lo.x, p.z - lo.z) > 0.22) {
          st.scan.obstacles.push({ x: p.x, y: p.y, z: p.z });
        }
      }
    }
    if (st.scan.pts.length >= 70) finishScan('suficiente suelo escaneado');
  }

  function addMarker(x, y, z) {
    var THREE = st.three;
    var geo = new THREE.RingGeometry(0.05, 0.07, 16);
    geo.rotateX(-Math.PI / 2);
    var mat = new THREE.MeshBasicMaterial({ color: 0x57e6ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    st.scene.add(mesh);
    st.markers.push({ mesh: mesh, born: performance.now() });
    if (st.markers.length > 90) {
      var old = st.markers.shift();
      try { st.scene.remove(old.mesh); old.mesh.geometry.dispose(); old.mesh.material.dispose(); } catch (e) {}
    }
  }

  function clearMarkers() {
    st.markers.forEach(function (m) {
      try { st.scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose(); } catch (e) {}
    });
    st.markers = [];
  }

  function finishScan(why) {
    if (st.scan.done) return;
    st.scan.done = true;
    st.scan.active = false;
    var pts = st.scan.pts.slice();
    var bounds = null;
    if (pts.length >= 8) {
      var xs = pts.map(function (p) { return p.x; }).sort(function (a, b) { return a - b; });
      var zs = pts.map(function (p) { return p.z; }).sort(function (a, b) { return a - b; });
      var lo = Math.floor(xs.length * 0.05);
      var hi = Math.max(lo + 1, Math.ceil(xs.length * 0.95) - 1);
      bounds = { minX: xs[lo], maxX: xs[hi], minZ: zs[lo], maxZ: zs[hi] };
    }
    buildArena(bounds);
    clearMarkers();
    spawnSnake();
    setHint('¡Ya está! Cuida de ella con los mandos');
    log('Habitación lista (' + why + '): ' + fmtScan());
    emitState(true);
  }

  function buildArena(bounds) {
    var THREE = st.three;
    if (!bounds) bounds = { minX: -1.25, maxX: 1.25, minZ: -1.25, maxZ: 1.25 };
    var w = Math.min(MAX_ARENA, Math.max(1.1, bounds.maxX - bounds.minX));
    var d = Math.min(MAX_ARENA, Math.max(1.1, bounds.maxZ - bounds.minZ));
    var cx = (bounds.minX + bounds.maxX) / 2;
    var cz = (bounds.minZ + bounds.maxZ) / 2;
    var cols = Math.max(4, Math.round(w / GRID));
    var rows = Math.max(4, Math.round(d / GRID));
    var minX = cx - (cols * GRID) / 2;
    var minZ = cz - (rows * GRID) / 2;
    var blocked = {};
    st.scan.obstacles.forEach(function (o) {
      var c = Math.floor((o.x - minX) / GRID);
      var r = Math.floor((o.z - minZ) / GRID);
      for (var dc = -1; dc <= 1; dc++) {
        for (var dr = -1; dr <= 1; dr++) {
          var cc = c + dc, rr = r + dr;
          if (cc >= 0 && cc < cols && rr >= 0 && rr < rows) blocked[cc + ':' + rr] = 1;
        }
      }
    });
    var free = [];
    for (var c2 = 0; c2 < cols; c2++) {
      for (var r2 = 0; r2 < rows; r2++) {
        if (!blocked[c2 + ':' + r2]) free.push({ c: c2, r: r2 });
      }
    }
    if (!free.length) {
      free.push({ c: Math.floor(cols / 2), r: Math.floor(rows / 2) });
    }
    st.arena = { cx: cx, cz: cz, w: cols * GRID, d: rows * GRID, cols: cols, rows: rows, minX: minX, minZ: minZ, free: free };
    // Contorno suave de la zona de juego en el suelo
    var y = st.floorY + 0.002;
    var pts = [
      new THREE.Vector3(minX, y, minZ),
      new THREE.Vector3(minX + cols * GRID, y, minZ),
      new THREE.Vector3(minX + cols * GRID, y, minZ + rows * GRID),
      new THREE.Vector3(minX, y, minZ + rows * GRID)
    ];
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var line = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0x35ffb2, transparent: true, opacity: 0.5 }));
    st.scene.add(line);
    if (st.statsSprite) st.statsSprite.position.set(cx, st.floorY + 1.3, cz);
  }

  function cellCenter(cell) {
    return {
      x: st.arena.minX + (cell.c + 0.5) * GRID,
      z: st.arena.minZ + (cell.r + 0.5) * GRID
    };
  }

  function randomFreeCell(minDist, from) {
    if (!st.arena) return { x: 0, z: 0 };
    var best = null;
    for (var i = 0; i < 24; i++) {
      var cell = st.arena.free[Math.floor(Math.random() * st.arena.free.length)];
      var p = cellCenter(cell);
      var dist = from ? Math.hypot(p.x - from.x, p.z - from.z) : 99;
      if (dist >= (minDist || 0)) return p;
      best = p;
    }
    return best || cellCenter(st.arena.free[0]);
  }

  /* ---------------- la serpiente ---------------- */

  function spawnSnake() {
    var THREE = st.three;
    clearSnake();
    var start = randomFreeCell(0.4, { x: st.arena.cx + 3, z: st.arena.cz });
    var head = new THREE.Group();
    var body = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0x3ddc84, roughness: 0.35, metalness: 0.05, emissive: 0x0c3a22 })
    );
    head.add(body);
    var eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    var pupilMat = new THREE.MeshStandardMaterial({ color: 0x08130c, roughness: 0.4 });
    [-1, 1].forEach(function (side) {
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), eyeMat);
      eye.position.set(side * 0.028, 0.02, 0.048);
      head.add(eye);
      var pupil = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), pupilMat);
      pupil.position.set(side * 0.03, 0.02, 0.062);
      head.add(pupil);
    });
    var tongue = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, 0.004, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xff4d6d, emissive: 0x5a0716 })
    );
    tongue.position.set(0, -0.004, 0.085);
    head.add(tongue);
    head.position.set(start.x, st.floorY + 0.06, start.z);
    st.scene.add(head);
    var segs = [];
    for (var i = 0; i < 9; i++) {
      var r = 0.048 - i * 0.0022;
      var seg = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.022, r), 14, 10),
        new THREE.MeshStandardMaterial({ color: 0x34c46f - i * 0x010203, roughness: 0.4, emissive: 0x082b18 })
      );
      seg.position.copy(head.position);
      st.scene.add(seg);
      segs.push(seg);
    }
    st.snake = { head: head, segs: segs, tongue: tongue, heading: Math.random() * Math.PI * 2, speed: 0.16 };
    st.segPos = [];
    for (var k = 0; k < 90; k++) st.segPos.push(head.position.clone());
    st.target = randomFreeCell(0.6, start);
    st.food = null;
    st.messes = [];
  }

  function clearSnake() {
    if (!st.snake) return;
    try {
      st.scene.remove(st.snake.head);
      st.snake.segs.forEach(function (s) { st.scene.remove(s); });
    } catch (e) {}
    st.snake = null;
    st.food = null;
    st.messes = [];
  }

  function pickTarget(force) {
    var head = st.snake ? st.snake.head.position : { x: 0, z: 0 };
    if (!force && st.target) return;
    st.target = randomFreeCell(0.5, { x: head.x, z: head.z });
  }

  function spawnFood(x, z) {
    var THREE = st.three;
    if (st.food) {
      try { st.scene.remove(st.food.mesh); } catch (e) {}
      st.food = null;
    }
    var group = new THREE.Group();
    var apple = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0xff4d4d, roughness: 0.35, emissive: 0x4a0c0c })
    );
    apple.position.y = 0.035;
    group.add(apple);
    var leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x35ffb2, emissive: 0x0c4a2c })
    );
    leaf.scale.set(1.6, 0.5, 1);
    leaf.position.set(0.012, 0.072, 0);
    group.add(leaf);
    group.position.set(x, st.floorY + 0.002, z);
    st.scene.add(group);
    st.food = { mesh: group };
    st.target = { x: x, z: z };
    setHint('Comida en el suelo: la serpiente va a por ella');
  }

  function spawnMess() {
    if (!st.arena || !st.snake) return;
    var THREE = st.three;
    var pos = randomFreeCell(0.3, { x: st.snake.head.position.x, z: st.snake.head.position.z });
    var mess = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x7a5b32, roughness: 0.9, emissive: 0x221606 })
    );
    mess.scale.set(1, 0.35, 1);
    mess.position.set(pos.x, st.floorY + 0.012, pos.z);
    st.scene.add(mess);
    st.messes.push({ mesh: mess });
    setHint('¡Vaya! Hay que limpiar (aprieta el mando, squeeze)');
  }

  function clearMesses() {
    st.messes.forEach(function (m) { try { st.scene.remove(m.mesh); } catch (e) {} });
    st.messes = [];
  }

  function setHint(text) {
    st.hint = text;
    st.hintUntil = performance.now() + 4500;
  }

  /* ---------------- movimiento y cuidados ---------------- */

  function updateSnake(dt, time) {
    var s = st.snake;
    if (!s) return;
    var THREE = st.three;
    var pos = s.head.position;
    if (!st.target) pickTarget(true);
    var dx = st.target.x - pos.x;
    var dz = st.target.z - pos.z;
    var dist = Math.hypot(dx, dz);
    var speed = (st.stats.hunger < 20 ? 0.075 : 0.16) * (1 + (st.stats.happy > 70 ? 0.15 : 0));
    if (dist < 0.1) {
      if (st.food) eatFood();
      else pickTarget(true);
    } else {
      var step = Math.min(dist, speed * dt * (st.food ? 1.8 : 1));
      pos.x += (dx / dist) * step;
      pos.z += (dz / dist) * step;
      s.heading = Math.atan2(dx, dz);
    }
    // Cabeceo al arrastrarse y orientación hacia donde va
    pos.y = st.floorY + 0.06 + Math.sin(time * 0.004) * 0.006;
    s.head.rotation.y = s.heading;
    s.head.rotation.z = Math.sin(time * 0.009) * 0.18;
    s.tongue.scale.z = 0.7 + Math.abs(Math.sin(time * 0.006)) * 0.9;

    // El cuerpo sigue el rastro de la cabeza
    var last = st.segPos[0];
    if (!last || Math.hypot(pos.x - last.x, pos.z - last.z) > 0.006) {
      st.segPos.unshift(pos.clone());
      if (st.segPos.length > 120) st.segPos.pop();
    }
    for (var i = 0; i < s.segs.length; i++) {
      var idx = Math.min(st.segPos.length - 1, (i + 1) * 6);
      var p = st.segPos[idx] || pos;
      s.segs[i].position.set(p.x, st.floorY + 0.045 - i * 0.0015, p.z);
    }
  }

  function eatFood() {
    if (!st.food) return;
    try { st.scene.remove(st.food.mesh); } catch (e) {}
    st.food = null;
    st.stats.hunger = Math.min(100, st.stats.hunger + 16);
    st.stats.score += 12;
    st.stats.happy = Math.min(100, st.stats.happy + 3);
    bumpLevel();
    setHint('¡Ñam! La serpiente ha comido (+16)');
    st.controllers.forEach(function (c) { haptic(c, 0.45); });
    saveStats();
    emitState(true);
  }

  function bumpLevel() {
    var lvl = 1 + Math.floor(st.stats.score / 100);
    if (lvl > st.stats.level) {
      st.stats.level = lvl;
      setHint('¡Nivel ' + lvl + '! La serpiente está contenta');
    }
  }

  function updateStats(dt) {
    if (!st.snake) return;
    st.stats.hunger = Math.max(0, st.stats.hunger - 0.22 * dt);
    st.stats.happy = Math.max(0, st.stats.happy - (0.12 + (st.food ? 0 : 0.03)) * dt);
    st.stats.clean = Math.max(0, st.stats.clean - (0.06 + st.messes.length * 0.03) * dt);
    if (st.stats.hunger <= 0) st.stats.happy = Math.max(0, st.stats.happy - 0.2 * dt);
  }

  function nearestMess(point, maxDist) {
    var best = null;
    var bestD = maxDist;
    st.messes.forEach(function (m, i) {
      var d = Math.hypot(m.mesh.position.x - point.x, m.mesh.position.z - point.z);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function snakeNear(point, maxDist) {
    if (!st.snake) return false;
    var p = st.snake.head.position;
    return Math.hypot(p.x - point.x, p.z - point.z) <= maxDist;
  }

  function onTrigger(ctrl) {
    if (st.scan.active && !st.scan.done) {
      finishScan('terminado con el gatillo');
      return;
    }
    if (!st.snake) return;
    var point = controllerPoint(ctrl);
    if (!point) {
      // Sin suelo delante: acariciar si el mando está cerca de la serpiente
      var cp = new st.three.Vector3();
      ctrl.getWorldPosition(cp);
      if (st.snake && Math.hypot(cp.x - st.snake.head.position.x, cp.z - st.snake.head.position.z) < 0.35) {
        st.stats.happy = Math.min(100, st.stats.happy + 10);
        st.stats.score += 3;
        bumpLevel();
        haptic(ctrl, 0.5);
        setHint('Le encanta que la acaricies (+10 cariño)');
        emitState(true);
      }
      return;
    }
    if (snakeNear(point, 0.22)) {
      st.stats.happy = Math.min(100, st.stats.happy + 10);
      st.stats.score += 3;
      bumpLevel();
      haptic(ctrl, 0.5);
      setHint('Le encanta que la acaricies (+10 cariño)');
    } else if (st.messes.length && nearestMess(point, 0.3) !== null) {
      cleanMess(ctrl, point);
    } else if (st.stats.hunger < 96) {
      spawnFood(point.x, point.z);
      haptic(ctrl, 0.3);
    } else {
      setHint('Está llena: mejor acaríciala');
    }
    emitState(true);
  }

  function onSqueeze(ctrl) {
    if (!st.snake) return;
    var point = controllerPoint(ctrl);
    if (!point) {
      var cp = new st.three.Vector3();
      ctrl.getWorldPosition(cp);
      point = { x: cp.x, z: cp.z };
    }
    if (st.messes.length && nearestMess(point, 0.55) !== null) {
      cleanMess(ctrl, point);
      emitState(true);
    } else {
      setHint('No hay nada que limpiar ahora mismo');
    }
  }

  function cleanMess(ctrl, point) {
    var i = nearestMess(point, 0.6);
    if (i === null) return;
    try { st.scene.remove(st.messes[i].mesh); } catch (e) {}
    st.messes.splice(i, 1);
    st.stats.clean = Math.min(100, st.stats.clean + 16);
    st.stats.score += 4;
    bumpLevel();
    haptic(ctrl, 0.6);
    setHint('¡Limpio! (+16 limpieza)');
  }

  /* ---------------- bucle, botones y espejo ---------------- */

  function frameUpdate(time, frame) {
    var dt = Math.min(0.06, st.clock ? st.clock.getDelta() : 0.016);
    if (st.scan.active && frame) scanHits(frame);
    if (st.snake) {
      updateSnake(dt, time);
      updateStats(dt);
      if (time > st.lastMess + 45000 && st.messes.length < 4) {
        st.lastMess = time;
        spawnMess();
      }
    }
    updateReticles();
    updateButtons();
    if (time > st.hintUntil && st.hint !== '') {
      st.hint = st.scan.done ? 'Cuídala: comida, cariño y limpieza' : st.hint;
    }
    if (time - st.statsAt > 450) {
      st.statsAt = time;
      paintStats();
    }
    if (time - st.lastState > 1000) emitState();
  }

  function updateReticles() {
    for (var i = 0; i < st.controllers.length && i < st.reticles.length; i++) {
      var point = controllerPoint(st.controllers[i]);
      var ret = st.reticles[i];
      if (point) {
        ret.visible = true;
        ret.position.set(point.x, st.floorY + 0.004, point.z);
      } else {
        ret.visible = false;
      }
    }
  }

  function updateButtons() {
    for (var i = 0; i < st.controllers.length; i++) {
      var ctrl = st.controllers[i];
      var gp = ctrl.gamepad;
      if (!gp || !gp.buttons) continue;
      var a = gp.buttons[4] && gp.buttons[4].pressed;   // A / X
      var b = gp.buttons[5] && gp.buttons[5].pressed;   // B / Y
      if (a && !ctrl.userData.aDown) {
        if (st.snake) {
          st.stats.happy = Math.min(100, st.stats.happy + 6);
          st.stats.score += 2;
          bumpLevel();
          haptic(ctrl, 0.4);
          setHint('¡A jugar! La serpiente da vueltas de alegría');
          pickTarget(true);
          emitState(true);
        }
      }
      if (b && !ctrl.userData.bDown) {
        if (st.statsSprite) st.statsSprite.visible = !st.statsSprite.visible;
      }
      ctrl.userData.aDown = !!a;
      ctrl.userData.bDown = !!b;
    }
  }

  function xrLoop(time, frame) {
    if (!st.running) return;
    frameUpdate(time, frame);
    st.renderer.render(st.scene, st.camera);
    mirrorTick(time);
  }

  function mirrorTick(now) {
    if (now - st.mirror.last < 70) return;
    st.mirror.last = now;
    mirrorRender();
  }

  function mirrorRender() {
    var THREE = st.three;
    if (!THREE || !st.scene) return null;
    var m = st.mirror;
    if (!m.canvas) {
      m.canvas = document.createElement('canvas');
      m.canvas.width = MIRROR_W;
      m.canvas.height = MIRROR_H;
      m.renderer = new THREE.WebGLRenderer({ canvas: m.canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
      m.renderer.setSize(MIRROR_W, MIRROR_H, false);
      m.renderer.setClearColor(0x000000, 0);
      m.cam = new THREE.PerspectiveCamera(72, MIRROR_W / MIRROR_H, 0.05, 40);
    }
    var src = st.camera;
    try {
      if (st.renderer && st.renderer.xr && st.renderer.xr.isPresenting) {
        var xrCam = st.renderer.xr.getCamera();
        if (xrCam && xrCam.cameras && xrCam.cameras.length) src = xrCam.cameras[0];
        else if (xrCam) src = xrCam;
      }
    } catch (e) {}
    if (src && src.matrixWorld) {
      m.cam.position.setFromMatrixPosition(src.matrixWorld);
      m.cam.quaternion.setFromRotationMatrix(src.matrixWorld);
      m.cam.fov = src.fov || 72;
      m.cam.aspect = MIRROR_W / MIRROR_H;
      m.cam.updateProjectionMatrix();
    }
    m.renderer.render(st.scene, m.cam);
    return m.canvas;
  }

  function mirrorStream() {
    if (!st.running) return null;
    var m = st.mirror;
    if (!m.canvas) mirrorRender();
    if (!m.canvas || !m.canvas.captureStream) return null;
    if (!m.stream) m.stream = m.canvas.captureStream(15);
    return m.stream;
  }

  function snapshot() {
    var canvas = mirrorRender();
    if (!canvas) return null;
    try { return canvas.toDataURL('image/jpeg', 0.6); } catch (e) { return null; }
  }

  function emitState(force) {
    if (!st.opts.onState) return;
    var now = performance.now();
    if (!force && now - st.lastState < 1000) return;
    st.lastState = now;
    try { st.opts.onState(stateView()); } catch (e) {}
  }

  /* ---------------- modo prueba (sin WebXR, p. ej. para revisar en el PC) ---------------- */

  function startPreview(why) {
    st.scan.active = false;
    st.scan.done = true;
    buildArena(null);
    spawnSnake();
    setHint('Modo prueba: la habitación es virtual');
    log('Juego en modo prueba (' + why + ')');
    var canvas = st.canvas;
    var drag = null;
    st.preview = { yaw: 0.35, height: 1.35, dist: 2.1 };
    canvas.addEventListener('pointerdown', function (ev) {
      drag = { x: ev.clientX, y: ev.clientY };
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      st.preview.yaw += (ev.clientX - drag.x) * 0.005;
      drag = { x: ev.clientX, y: ev.clientY };
    });
    canvas.addEventListener('pointerup', function () { drag = null; });
    canvas.addEventListener('click', function (ev) {
      previewClick(ev);
    });
    function placeCamera() {
      if (!st.preview) return;
      var cx = st.arena ? st.arena.cx : 0;
      var cz = st.arena ? st.arena.cz : 0;
      var p = st.preview;
      st.camera.position.set(cx + Math.sin(p.yaw) * p.dist, st.floorY + p.height, cz + Math.cos(p.yaw) * p.dist);
      st.camera.lookAt(cx, st.floorY + 0.1, cz);
    }
    var raf = 0;
    function step() {
      if (!st.running) return;
      var time = performance.now();
      st.clock.getDelta();
      frameUpdate(time, null);
      placeCamera();
      st.renderer.render(st.scene, st.camera);
      mirrorTick(time);
      raf = global.requestAnimationFrame(step);
    }
    st.previewRaf = raf;
    step();
    emitState(true);
  }

  function previewClick(ev) {
    var THREE = st.three;
    var rect = st.canvas.getBoundingClientRect();
    var ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1
    );
    st.raycaster.setFromCamera(ndc, st.camera);
    var hit = new THREE.Vector3();
    var ok = st.raycaster.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -st.floorY), hit
    );
    if (!ok) return;
    if (st.snake && snakeNear(hit, 0.22)) {
      st.stats.happy = Math.min(100, st.stats.happy + 8);
      st.stats.score += 2;
      bumpLevel();
      setHint('Le encanta que la acaricies');
    } else if (st.messes.length && nearestMess(hit, 0.4) !== null) {
      cleanMess(st.controllers[0] || { gamepad: null }, hit);
    } else if (st.stats.hunger < 96) {
      spawnFood(hit.x, hit.z);
    }
    emitState(true);
  }

  /* ---------------- fin ---------------- */

  function finish(reason) {
    if (st.ended) return;
    st.ended = true;
    st.running = false;
    try { if (st.previewRaf) global.cancelAnimationFrame(st.previewRaf); } catch (e) {}
    try { if (st.renderer) st.renderer.setAnimationLoop(null); } catch (e) {}
    try { if (st.session && st.session.end) st.session.end(); } catch (e) {}
    st.session = null;
    try {
      if (st.mirror.stream) {
        st.mirror.stream.getTracks().forEach(function (t) { t.stop(); });
      }
    } catch (e) {}
    st.mirror.stream = null;
    try {
      if (st.renderer) st.renderer.dispose();
    } catch (e) {}
    try {
      if (st.mirror.renderer) st.mirror.renderer.dispose();
    } catch (e) {}
    st.mirror.renderer = null;
    st.mirror.canvas = null;
    st.mirror.cam = null;
    try {
      if (st.canvas && st.canvas.parentNode) st.canvas.parentNode.removeChild(st.canvas);
    } catch (e) {}
    try { global.removeEventListener('resize', onResize); } catch (e) {}
    clearSnake();
    clearMesses();
    saveStats();
    log('Juego cerrado' + (reason ? ': ' + reason : ''));
    try { if (st.opts.onEnd) st.opts.onEnd(reason || 'fin'); } catch (e) {}
    st.canvas = null;
    st.renderer = null;
    st.scene = null;
    st.camera = null;
    st.statsSprite = null;
    st.statsCanvas = null;
    st.statsTex = null;
  }

  function stop() {
    finish('detenido');
  }

  global.DoganieroRoomSnake = {
    supported: supported,
    start: start,
    stop: stop,
    finish: finish,
    snapshot: snapshot,
    mirrorStream: mirrorStream,
    state: stateView,
    preload: function () { ensureThree().catch(function () {}); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      global.DoganieroRoomSnake.preload();
    });
  } else {
    global.DoganieroRoomSnake.preload();
  }
})(window);
