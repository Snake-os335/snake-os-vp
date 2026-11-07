/* Snake OS · Snake VR — realidad virtual para gafas VR (2026.20).
 *
 * Qué hace:
 *  - Mundo 3D real con three.js (local, /static/assets/three-r160.min.js): sala neón,
 *    suelo de rejilla, estrellas y una pantalla gigante «espejo» de tu escritorio.
 *  - La pantalla espejo se pinta en un canvas 2D leyendo el DOM REAL (iconos, ventanas,
 *    reloj) y los clics sobre ella abren apps de verdad (raycast → elementFromPoint).
 *  - Tres modos: ratón/teclado (mono), estereoscópico para gafas de cartón (SBS) y
 *    WebXR immersive-vr real (Meta Quest / PCVR) con mandos y teletransporte.
 *  - Giroscopio del móvil (deviceorientation) para mirar moviendo la cabeza.
 *
 * Sin dependencias nuevas: usa el three.js que ya sirve Snake OS y el DOM existente.
 * API: window.SnakeVR.open(), .close(), .supported(), window.renderSnakeVrApp(body).
 */
(function (global) {
  'use strict';

  var VR_VERSION = '2026.20';
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
    mode: 'mono',            // mono | sbs | xr
    yaw: 0, pitch: -0.05,
    zoom: 3.4,               // z del rig (distancia al panel)
    keys: {},
    pointer: null,
    dragMoved: 0,
    lastTap: 0,
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
        'Arrastra para mirar · rueda o pellizco = acercarte · WASD/flechas = moverte · clic sobre la pantalla = usar Snake OS · doble clic = recentrar',
        'Drag to look · wheel or pinch = zoom · WASD/arrows = move · click the screen = use Snake OS · double click = recenter'
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

  /* ---------------- Escena 3D ---------------- */
  function makeStarField(THREE) {
    var n = 1400, pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var r = 34 + Math.random() * 52;
      var th = Math.random() * Math.PI * 2;
      var ph = Math.random() * Math.PI * 0.62;
      pos[i * 3] = Math.cos(th) * Math.sin(ph + 0.16) * r;
      pos[i * 3 + 1] = Math.abs(Math.cos(ph)) * r * 0.62 + 2;
      pos[i * 3 + 2] = Math.sin(th) * Math.sin(ph + 0.16) * r;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var m = new THREE.PointsMaterial({ color: 0xbfe9ff, size: 0.16, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false });
    return new THREE.Points(g, m);
  }

  function makeSkyTexture(THREE) {
    var c = document.createElement('canvas');
    c.width = 8; c.height = 256;
    var cx = c.getContext('2d');
    var grad = cx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#050b1a');
    grad.addColorStop(0.45, '#071726');
    grad.addColorStop(0.72, '#0a2330');
    grad.addColorStop(1, '#02060c');
    cx.fillStyle = grad;
    cx.fillRect(0, 0, 8, 256);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function buildScene(THREE, renderer) {
    var scene = new THREE.Scene();
    scene.background = makeSkyTexture(THREE);
    scene.fog = new THREE.Fog(0x02060c, 7, 46);

    var camera = new THREE.PerspectiveCamera(72, 1, 0.05, 240);
    var rig = new THREE.Group();
    rig.position.set(0, 1.62, 3.4);
    rig.add(camera);
    scene.add(rig);

    var camL = camera.clone(); camL.position.x = -0.031; rig.add(camL);
    var camR = camera.clone(); camR.position.x = 0.031; rig.add(camR);

    scene.add(new THREE.AmbientLight(0x9fb8ff, 0.55));
    var p1 = new THREE.PointLight(0x35ffb2, 1.35, 34); p1.position.set(0.4, 3.1, 2.4); scene.add(p1);
    var p2 = new THREE.PointLight(0x2f7cff, 0.95, 34); p2.position.set(-4.2, 2.1, 3.4); scene.add(p2);
    var p3 = new THREE.PointLight(0xff5fa2, 0.55, 30); p3.position.set(4.4, 1.6, 1.2); scene.add(p3);

    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: 0x061018, roughness: 0.92, metalness: 0.28 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    var grid = new THREE.GridHelper(120, 120, 0x1f6f5a, 0x0d2530);
    grid.position.y = 0.02;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    scene.add(grid);

    scene.add(makeStarField(THREE));

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
    screen.position.set(0, 1.55, 0);
    screen.name = 'snk-vr-screen';
    scene.add(screen);

    var frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(3.34, 2.14, 0.07)),
      new THREE.LineBasicMaterial({ color: 0x35ffb2, transparent: true, opacity: 0.9 })
    );
    frame.position.set(0, 1.55, -0.01);
    scene.add(frame);

    var glow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.9, 2.7),
      new THREE.MeshBasicMaterial({ color: 0x0a3a2c, transparent: true, opacity: 0.24, depthWrite: false })
    );
    glow.position.set(0, 1.55, -0.06);
    scene.add(glow);

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

  function drawIcon(ctx, el, kx, ky) {
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var cx = (r.left + r.width / 2) * kx;
    var top = r.top * ky;
    var ic = el.querySelector('.ic');
    var img = ic ? ic.querySelector('img') : null;
    var size = Math.min(r.width, r.height) * 0.56 * kx;
    var iy = top + r.height * 0.09 * ky;
    var drew = false;
    if (img && img.complete && img.naturalWidth) {
      try { ctx.drawImage(img, cx - size / 2, iy, size, size); drew = true; } catch (eImg) {}
    }
    if (!drew) {
      var txt = ic ? String(ic.textContent || '').trim() : '';
      if (txt) {
        ctx.font = Math.round(size * 0.92) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(txt, cx, iy);
      }
    }
    var lb = el.querySelector('.lb');
    var label = lb ? String(lb.textContent || '').trim() : '';
    if (label) {
      ctx.font = vrFont(Math.max(11, Math.round(13 * kx)), 600);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(2,8,14,.65)';
      var tw = ctx.measureText(label).width;
      var lby = top + r.height * 0.72 * ky;
      rrect(ctx, cx - tw / 2 - 6, lby - 13, tw + 12, 18, 6);
      ctx.fill();
      ctx.fillStyle = '#eafff4';
      ctx.fillText(label, cx, lby);
    }
  }

  function drawWindow(ctx, el, kx, ky) {
    if (el.classList.contains('minimized')) return;
    var r = el.getBoundingClientRect();
    if (r.width < 30 || r.height < 30) return;
    var x = r.left * kx, y = r.top * ky, w = r.width * kx, h = r.height * ky;
    ctx.save();
    ctx.shadowColor = 'rgba(53,255,178,.25)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(8,17,26,.92)';
    rrect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.restore();
    var barH = Math.max(22, 30 * ky);
    ctx.save();
    rrect(ctx, x, y, w, barH, 10);
    ctx.clip();
    ctx.fillStyle = 'rgba(24,44,58,.96)';
    ctx.fillRect(x, y, w, barH);
    ctx.restore();
    ctx.strokeStyle = 'rgba(53,255,178,.5)';
    ctx.lineWidth = 1.4;
    rrect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 10);
    ctx.stroke();
    var t = el.querySelector('.win-title');
    var title = t ? String(t.textContent || '').trim() : '';
    if (title) {
      ctx.font = vrFont(Math.max(10, Math.round(13 * ky)), 700);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#d8fff0';
      ctx.fillText(title.length > 42 ? title.slice(0, 41) + '…' : title, x + 10, y + barH / 2);
    }
    /* Esqueleto del cuerpo: da volumen sin copiar el DOM interno. */
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(120,200,180,.16)';
    var rows = Math.min(8, Math.max(2, Math.floor((h - barH) / (24 * ky))));
    for (var i = 0; i < rows; i++) {
      var ry = y + barH + 12 + i * 24 * ky;
      var rw = w * (0.5 + ((i * 37) % 40) / 100);
      rrect(ctx, x + 12, ry, Math.max(20, rw - 24), Math.max(6, 10 * ky), 4);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function paintMirror() {
    var ctx = st.mirrorCtx;
    if (!ctx) return;
    var W = MIRROR_W, H = MIRROR_H;
    var vw = Math.max(320, global.innerWidth || 1280), vh = Math.max(240, global.innerHeight || 800);
    var kx = W / vw, ky = H / vh;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

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
    ctx.fillStyle = 'rgba(3,8,14,.26)';
    ctx.fillRect(0, 0, W, H);

    var wins = document.querySelectorAll('#windows .app-window');
    for (var i = 0; i < wins.length; i++) drawWindow(ctx, wins[i], kx, ky);
    var icons = document.querySelectorAll('#iconLayer .desktop-icon');
    for (var j = 0; j < icons.length; j++) drawIcon(ctx, icons[j], kx, ky);

    /* Barra de tareas espejo */
    var bh = Math.max(34, 64 * ky);
    ctx.fillStyle = 'rgba(4,10,16,.88)';
    ctx.fillRect(0, H - bh, W, bh);
    ctx.fillStyle = 'rgba(53,255,178,.5)';
    ctx.fillRect(0, H - bh, W, 1.5);
    ctx.font = vrFont(Math.max(12, Math.round(17 * ky)), 800);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8dffcf';
    ctx.fillText('🐍 Snake OS', 18, H - bh / 2);
    ctx.font = vrFont(Math.max(11, Math.round(14 * ky)), 600);
    ctx.fillStyle = 'rgba(223,251,234,.85)';
    ctx.textAlign = 'right';
    ctx.fillText(clockText(), W - 18, H - bh / 2);

    /* HUD: esquinas y etiqueta */
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

    L.font = vrFont(15, 700);
    L.fillStyle = 'rgba(141,255,207,.85)';
    L.fillText(vrT('APPS ABIERTAS', 'OPEN APPS') + ' · ' + openTitles.length, 34, 408);
    L.font = vrFont(17, 600);
    var y = 442;
    if (!openTitles.length) {
      L.fillStyle = 'rgba(234,255,244,.55)';
      wrapText(L, vrT('Ninguna: toca un icono en la pantalla', 'None: tap an icon on the screen'), 34, y, W - 68, 26, 2);
      y += 30;
    }
    for (var k = 0; k < Math.min(6, openTitles.length); k++) {
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
      'Arrastra: mirar|Rueda: acercarte|WASD: moverte|Clic: abrir apps|Doble clic: recentrar|🧭 Giroscopio: con la cabeza|👓 SBS: gafas de cartón',
      'Drag: look|Wheel: zoom|WASD: move|Click: open apps|Double click: recenter|🧭 Gyro: with your head|👓 SBS: cardboard'
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

  function clickDomFromUv(uv) {
    if (!uv) return false;
    var px = clampN(uv.x, 0, 1) * (global.innerWidth || 1280);
    var py = (1 - clampN(uv.y, 0, 1)) * (global.innerHeight || 800);
    var el = pickDomAt(px, py);
    if (!el) return false;
    var target = (el.closest && (el.closest('button,a,input,textarea,select,[data-app],.desktop-icon,.win-titlebar,[role="button"],.start-item') || el)) || el;
    try {
      if (target.focus && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) target.focus();
      target.click();
      return true;
    } catch (eC) { return false; }
  }

  function tapAt(cx, cy) {
    if (!st.three || !st.camera || !st.mirrorMesh) return;
    var now = Date.now();
    var w = global.innerWidth || 1280, h = global.innerHeight || 800;
    var ndc = new st.three.Vector2((cx / w) * 2 - 1, -(cy / h) * 2 + 1);
    var rc = new st.three.Raycaster();
    rc.setFromCamera(ndc, st.camera);
    var hits = rc.intersectObject(st.mirrorMesh, false);
    if (hits && hits.length && hits[0].uv) {
      flashAtPoint(hits[0].point);
      var didClick = clickDomFromUv(hits[0].uv);
      st.lastTap = didClick ? 0 : now;
      return;
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
    if (gyro) gyro.setAttribute('aria-pressed', st.gyro ? 'true' : 'false');
    if (sbs) sbs.setAttribute('aria-pressed', st.mode === 'sbs' ? 'true' : 'false');
    if (xr) xr.setAttribute('aria-pressed', st.mode === 'xr' ? 'true' : 'false');
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
      st.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), moved: 0 };
      try { c.setPointerCapture(e.pointerId); } catch (eP) {}
    });
    c.addEventListener('pointermove', function (e) {
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

  function setupXRControllers() {
    if (st.xrControllers.length) return;
    var THREE = st.three, r = st.renderer;
    var rc = new THREE.Raycaster();
    var rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    for (var i = 0; i < 2; i++) {
      var c = r.xr.getController(i);
      var line = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0x35ffb2, transparent: true, opacity: 0.85 }));
      line.scale.z = 7;
      c.add(line);
      c.addEventListener('selectstart', onXRSelect.bind(null, c, rc));
      if (i === 0) {
        c.addEventListener('squeezestart', function () {
          if (st.xrSession) { try { st.xrSession.end(); } catch (eQ) {} }
        });
      }
      st.scene.add(c);
      st.xrControllers.push(c);
    }
  }

  function onXRSelect(c, rc) {
    if (!st.mirrorMesh || !st.floorMesh) return;
    var THREE = st.three;
    var m = new THREE.Matrix4().extractRotation(c.matrixWorld);
    var o = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
    var d = new THREE.Vector3(0, 0, -1).applyMatrix4(m).normalize();
    rc.set(o, d);
    var hits = rc.intersectObject(st.mirrorMesh, false);
    if (hits.length && hits[0].uv) {
      flashAtPoint(hits[0].point);
      clickDomFromUv(hits[0].uv);
      return;
    }
    var fh = rc.intersectObject(st.floorMesh, false);
    if (fh.length) teleportTo(fh[0].point);
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

    if (now - st.mirrorLast > 1.2) { st.mirrorLast = now; try { paintMirror(); } catch (ePm) {} }
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
          'Tu escritorio de Snake OS en 3D: pantalla gigante con tus iconos y ventanas, paneles en vivo a los lados y suelo de neón. Funciona con gafas VR de verdad, con gafas de cartón y con ratón y teclado.',
          'Your Snake OS desktop in 3D: a giant screen with your icons and windows, live side panels and a neon floor. Works with true VR headsets, cardboard goggles, and mouse and keyboard.'
        ) + '</p>' +
        '<div class="snkvr-chips">' +
          '<span class="snkvr-chip" id="snkvr-compat">WebXR…</span>' +
          '<span class="snkvr-chip on">👓 ' + vrT('Cardboard (SBS)', 'Cardboard (SBS)') + '</span>' +
          '<span class="snkvr-chip on">🧭 ' + vrT('Giroscopio', 'Gyroscope') + '</span>' +
        '</div>' +
        '<button type="button" class="snkvr-btn" id="snkvr-enter">🥽 ' + vrT('Entrar en Snake VR', 'Enter Snake VR') + '</button>' +
        '<div class="snkvr-row">' +
          '<button type="button" class="snkvr-btn2" id="snkvr-sbs">👓 ' + vrT('Visor estereoscópico', 'Stereoscopic viewer') + '</button>' +
          '<button type="button" class="snkvr-btn2" id="snkvr-xr">🥽 ' + vrT('VR real (WebXR)', 'True VR (WebXR)') + '</button>' +
          '<button type="button" class="snkvr-btn2" id="snkvr-close">✖ ' + vrT('Salir de VR', 'Exit VR') + '</button>' +
        '</div>' +
        '<div>' +
          '<p style="margin:0 0 6px;font-weight:700">' + vrT('Qué puedes hacer dentro', 'What you can do inside') + '</p>' +
          '<ul>' +
            '<li>' + vrT('Ver tu escritorio real en una pantalla gigante: iconos, apps abiertas y reloj se actualizan solos.', 'See your real desktop on a giant screen: icons, open apps and the clock update by themselves.') + '</li>' +
            '<li>' + vrT('Abrir apps sin salir: apunta con el ratón o el mando y pulsa un icono de la pantalla.', 'Open apps without leaving: aim with the mouse or controller and click an icon on the screen.') + '</li>' +
            '<li>' + vrT('Paneles laterales con hora, versión de Snake OS, apps abiertas y novedades.', 'Side panels with the time, Snake OS version, open apps and what’s new.') + '</li>' +
            '<li>' + vrT('En gafas: modo WebXR con mandos y teletransporte, o modo Cardboard para el móvil.', 'On headsets: WebXR mode with controllers and teleport, or Cardboard mode for your phone.') + '</li>' +
          '</ul>' +
        '</div>' +
        '<p class="snkvr-note">' + vrT(
          'Consejo: en el móvil, abre Snake VR, pulsa 🧭 Giroscopio y 👓 Gafas (SBS) y mete el teléfono en las gafas de cartón. En Meta Quest usa directamente 🥽 VR real.',
          'Tip: on your phone, open Snake VR, press 🧭 Gyroscope and 👓 Headset (SBS) and put the phone into your cardboard goggles. On Meta Quest just use 🥽 True VR.'
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
    get mode() { return st.mode; },
    get isOpen() { return !!st.open; }
  };
})(window);
