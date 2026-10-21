/* Snake OS · Snake Racing 3D — vista 3D de karts (three.js r160 local: /static/assets/three-r160.min.js).
   Solo dibuja: la física, la IA, la red y los comentarios siguen en snake-racing.js.
   Coordenadas: la simulación usa (x, y) en el plano y z = altura; en three.js es (x, z_alt, y). */
(function (global) {
  'use strict';

  function smooth(e0, e1, x) { var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
  function fbm(x, z) {
    return Math.sin(x * 0.0021 + 1.3) * Math.cos(z * 0.0017 + 0.4) * 0.55 +
      Math.sin(x * 0.0047 + z * 0.0031) * 0.3 + Math.sin(z * 0.0083 - x * 0.0059 + 2) * 0.15;
  }
  function rnd(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

  function create(opt) {
    var THREE = global.THREE;
    var T = opt.track, TW = opt.trackW, LIM = opt.wallOff, P = T.pts, N = T.N;
    var quality = opt.quality || 'high';
    var canvas = opt.canvas;
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: quality === 'high', powerPreference: 'high-performance', alpha: false, stencil: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = quality === 'high';
    renderer.shadowMap.type = THREE.PCFShadowMap;
    var scene = new THREE.Scene();
    var SKY_H = new THREE.Color('#cdeeff');
    scene.fog = new THREE.Fog(SKY_H, 2600, 9500);
    scene.background = SKY_H;
    var camera = new THREE.PerspectiveCamera(68, 1, 4, 14000);
    var disposables = [];
    function keep(o) { disposables.push(o); return o; }

    // ---------- materiales toon (look de dibujos) ----------
    var gradTex = (function () {
      var d = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
      var t = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return keep(t);
    })();
    var matCache = {};
    function toon(col, extra) {
      var k = col + (extra ? JSON.stringify(extra) : '');
      if (!matCache[k]) matCache[k] = keep(new THREE.MeshToonMaterial(Object.assign({ color: new THREE.Color(col), gradientMap: gradTex }, extra || {})));
      return matCache[k];
    }
    function lambert(o) { return keep(new THREE.MeshLambertMaterial(o)); }
    function canvasTex(w, h, fn, rep) {
      var c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
      var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return keep(t);
    }

    // ---------- luces ----------
    scene.add(new THREE.HemisphereLight(0xd8f0ff, 0x5c8f3c, 1.25));
    var sun = new THREE.DirectionalLight(0xfff4dc, 2.1);
    sun.position.set(600, 1200, 300);
    sun.castShadow = quality === 'high';
    sun.shadow.mapSize.set(1024, 1024);
    var sc = sun.shadow.camera; sc.left = -420; sc.right = 420; sc.top = 420; sc.bottom = -420; sc.near = 10; sc.far = 2600;
    sun.shadow.bias = -0.0015;
    scene.add(sun); scene.add(sun.target);

    // ---------- utilidades de pista ----------
    function nearestAll(x, y) {
      var bi = 0, bd = 1e18;
      for (var i = 0; i < N; i++) { var dx = P[i].x - x, dy = P[i].y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i; } }
      return { i: bi, d: Math.sqrt(bd) };
    }
    function hFrac(i, x, y) {
      var p = P[i], q = P[(i + 1) % N], o = P[(i - 1 + N) % N];
      var s = (x - p.x) * p.tx + (y - p.y) * p.ty;
      if (s >= 0) return p.h + (q.h - p.h) * Math.min(1, s / T.step);
      return p.h + (o.h - p.h) * Math.min(1, -s / T.step);
    }
    function terrainAt(x, y) {
      var n = nearestAll(x, y), base = hFrac(n.i, x, y);
      var w = smooth(LIM + 30, LIM + 950, n.d);
      var near = smooth(TW / 2 + 20, TW / 2 + 90, n.d);
      return base - 1 - 4 * near + w * (45 + 190 * (0.5 + 0.5 * fbm(x, y)));
    }
    T.terrainAt = terrainAt;

    // ---------- cielo, montañas y nubes ----------
    (function sky() {
      var g = keep(new THREE.SphereGeometry(12500, 24, 12)), top = new THREE.Color('#2f86ff'), hor = new THREE.Color('#d4f1ff'), cols = [];
      var pos = g.attributes.position;
      for (var i = 0; i < pos.count; i++) { var k = Math.max(0, pos.getY(i) / 12500); var c = hor.clone().lerp(top, Math.pow(k, 0.55)); cols.push(c.r, c.g, c.b); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      var m = new THREE.Mesh(g, keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
      m.renderOrder = -10; scene.add(m); skyMesh = m;
    })();
    var skyMesh;
    var B = T.box, cx = (B.minX + B.maxX) / 2, cy = (B.minY + B.maxY) / 2;
    (function mountains() {
      var r = rnd(7), cone = keep(new THREE.ConeGeometry(1, 1, 7, 1)), grp = new THREE.Group();
      var cols = ['#5aa36b', '#6fb46a', '#7fa8c9', '#8bb8d8', '#69a07a'];
      for (var i = 0; i < 26; i++) {
        var a = i / 26 * Math.PI * 2 + r() * 0.2, R = 5600 + r() * 1500, hgt = 900 + r() * 1300, rad = 900 + r() * 700;
        var m = new THREE.Mesh(cone, toon(cols[i % cols.length], { fog: true }));
        m.scale.set(rad, hgt, rad); m.position.set(cx + Math.cos(a) * R, hgt / 2 - 60, cy + Math.sin(a) * R); grp.add(m);
        if (hgt > 1700) { var cap = new THREE.Mesh(cone, toon('#ffffff')); cap.scale.set(rad * 0.28, hgt * 0.28, rad * 0.28); cap.position.set(m.position.x, hgt - 60 - hgt * 0.14, m.position.z); grp.add(cap); }
      }
      scene.add(grp);
    })();
    var clouds = new THREE.Group();
    (function () {
      var r = rnd(11), s = keep(new THREE.IcosahedronGeometry(1, 1)), mat = lambert({ color: 0xffffff, emissive: 0x9aa8b8, flatShading: true, fog: false });
      for (var i = 0; i < 16; i++) {
        var g = new THREE.Group(), n = 3 + Math.floor(r() * 3);
        for (var k = 0; k < n; k++) { var m = new THREE.Mesh(s, mat), sz = 90 + r() * 110; m.scale.set(sz * 1.4, sz * 0.8, sz); m.position.set((k - n / 2) * 120 + r() * 40, r() * 40, r() * 60); g.add(m); }
        g.position.set(cx + (r() - 0.5) * 9000, 1300 + r() * 700, cy + (r() - 0.5) * 9000); clouds.add(g);
      }
      scene.add(clouds);
    })();

    // ---------- terreno ----------
    var terrain;
    (function () {
      var M = 1900, W = (B.maxX - B.minX) + M * 2, H = (B.maxY - B.minY) + M * 2, S = quality === 'low' ? 96 : 132;
      var g = keep(new THREE.PlaneGeometry(W, H, S, S)); g.rotateX(-Math.PI / 2);
      var pos = g.attributes.position, cols = [], c1 = new THREE.Color('#62c23c'), c2 = new THREE.Color('#47a32f'), c3 = new THREE.Color('#9bd451'), c4 = new THREE.Color('#d9c98f'), tmp = new THREE.Color();
      for (var i = 0; i < pos.count; i++) {
        var x = pos.getX(i) + cx, y = pos.getZ(i) + cy;
        var hh = terrainAt(x, y);
        pos.setXYZ(i, x, hh, y);
        var n = 0.5 + 0.5 * Math.sin(x * 0.013 + Math.sin(y * 0.011) * 2.0) * Math.cos(y * 0.009);
        tmp.copy(c2).lerp(c1, n);
        if (hh > 120) tmp.lerp(c3, smooth(120, 260, hh));
        var nd = nearestAll(x, y).d;
        if (nd < TW / 2 + 70) tmp.lerp(c4, 0.75);
        cols.push(tmp.r, tmp.g, tmp.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.computeVertexNormals();
      terrain = new THREE.Mesh(g, lambert({ vertexColors: true }));
      terrain.receiveShadow = true; scene.add(terrain);
    })();

    // ---------- pista (cintas) ----------
    function band(offA, offB, dyA, dyB, colorFn, uvMode) {
      var pos = [], col = [], uv = [];
      for (var i = 0; i < N; i++) {
        var a = P[i], b = P[(i + 1) % N];
        var dA = a.d, dB = i + 1 === N ? T.len : b.d;
        var v = [
          [a.x + a.nx * offA, a.h + dyA, a.y + a.ny * offA, 0, dA],
          [a.x + a.nx * offB, a.h + dyB, a.y + a.ny * offB, 1, dA],
          [b.x + b.nx * offA, b.h + dyA, b.y + b.ny * offA, 0, dB],
          [b.x + b.nx * offB, b.h + dyB, b.y + b.ny * offB, 1, dB]
        ];
        var order = offB > offA ? [0, 2, 1, 1, 2, 3] : [0, 1, 2, 1, 3, 2];
        var cc = colorFn ? colorFn(i) : null;
        order.forEach(function (k) {
          pos.push(v[k][0], v[k][1], v[k][2]);
          if (uvMode) uv.push(v[k][3], v[k][4] / TW);
          if (cc) col.push(cc.r, cc.g, cc.b);
        });
      }
      var g = keep(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      if (uvMode) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      if (col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    }
    var asphaltTex = canvasTex(256, 256, function (g, w, h) {
      g.fillStyle = '#5a5e66'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(6, 0, 5, h); g.fillRect(w - 11, 0, 5, h);
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(w / 2 - 3, 0, 6, h * 0.45);
    }, true);
    var half = TW / 2;
    var asphalt = new THREE.Mesh(band(-half, half, 0.6, 0.6, null, true), lambert({ map: asphaltTex, side: THREE.DoubleSide }));
    asphalt.receiveShadow = true; scene.add(asphalt);
    var RED = new THREE.Color('#ff3030'), WHITE = new THREE.Color('#ffffff'), BLUE = new THREE.Color('#2f7dff'), YEL = new THREE.Color('#ffd60a');
    function curbCol(i) { return (Math.floor(i / 2) % 2) ? WHITE : (P[i].curv > 0.25 ? RED : BLUE); }
    [[-half - 18, -half], [half, half + 18]].forEach(function (o) {
      var m = new THREE.Mesh(band(o[0], o[1], o[0] < 0 ? 1.6 : 0.8, o[0] < 0 ? 0.8 : 1.6, curbCol), lambert({ vertexColors: true, side: THREE.DoubleSide }));
      m.receiveShadow = true; scene.add(m);
    });
    var SAND = new THREE.Color('#e8d49a');
    [[-half - 18, -half - 62], [half + 18, half + 62]].forEach(function (o) {
      var m = new THREE.Mesh(band(o[0], o[1], 0.4, -5, function () { return SAND; }), lambert({ vertexColors: true, side: THREE.DoubleSide }));
      m.receiveShadow = true; scene.add(m);
    });
    // muros: barrera de colores donde no pisa otra parte del circuito
    (function walls() {
      var pos = [], col = [], WH = 18;
      [-1, 1].forEach(function (side) {
        for (var i = 0; i < N; i++) {
          var a = P[i], b = P[(i + 1) % N];
          var ax = a.x + a.nx * LIM * side, ay = a.y + a.ny * LIM * side, bx = b.x + b.nx * LIM * side, by = b.y + b.ny * LIM * side;
          var mid = nearestAll((ax + bx) / 2, (ay + by) / 2);
          if (mid.d < LIM - 6 || Math.hypot(bx - ax, by - ay) > T.step * 3) continue;
          var ga = terrainAt(ax, ay) - 4, gb = terrainAt(bx, by) - 4, ha = a.h - 2, hb = b.h - 2;
          var ya0 = Math.min(ga, ha), yb0 = Math.min(gb, hb), ya1 = Math.max(ga, ha) + WH + 4, yb1 = Math.max(gb, hb) + WH + 4;
          var c = (Math.floor(i / 3) % 2) ? WHITE : (side > 0 ? RED : BLUE);
          var q = [[ax, ya0, ay], [bx, yb0, by], [ax, ya1, ay], [bx, yb1, by]];
          [0, 1, 2, 2, 1, 3].forEach(function (k) { pos.push(q[k][0], q[k][1], q[k][2]); col.push(c.r, c.g, c.b); });
        }
      });
      var g = keep(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      var m = new THREE.Mesh(g, lambert({ vertexColors: true, side: THREE.DoubleSide }));
      scene.add(m);
    })();
    // meta: tablero de ajedrez y arco
    (function finish() {
      var p = P[0], ang = Math.atan2(p.ty, p.tx);
      var chk = canvasTex(256, 32, function (g, w, h) { for (var x = 0; x < 16; x++) for (var y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); } });
      var m = new THREE.Mesh(keep(new THREE.PlaneGeometry(TW, 26)), lambert({ map: chk }));
      m.rotation.x = -Math.PI / 2; var grp = new THREE.Group(); grp.add(m); m.rotation.z = Math.PI / 2;
      grp.position.set(p.x, p.h + 0.9, p.y); grp.rotation.y = -ang; scene.add(grp);
      var arch = new THREE.Group(), pil = keep(new THREE.CylinderGeometry(7, 9, 120, 10));
      [-1, 1].forEach(function (s) { var c = new THREE.Mesh(pil, toon('#ffd60a')); c.position.set(0, 60, s * (half + 34)); c.castShadow = true; arch.add(c); });
      var ban = canvasTex(1024, 128, function (g, w, h) {
        var gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#1db954'); gr.addColorStop(0.5, '#0b7a3b'); gr.addColorStop(1, '#1db954');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (var x = 0; x < w; x += 32) { g.fillStyle = (x / 32) % 2 ? '#111' : '#fff'; g.fillRect(x, 0, 32, 14); g.fillRect(x + 32, h - 14, 32, 14); }
        g.font = 'italic 900 76px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 10; g.strokeStyle = '#063'; g.strokeText('🐍 SNAKE RACING 🐍', w / 2, h / 2 + 3);
        g.fillStyle = '#ffd60a'; g.fillText('🐍 SNAKE RACING 🐍', w / 2, h / 2 + 3);
      });
      var beam = new THREE.Mesh(keep(new THREE.BoxGeometry(10, 34, TW + 90)), [lambert({ map: ban }), lambert({ map: ban }), toon('#0b7a3b'), toon('#0b7a3b'), toon('#0b7a3b'), toon('#0b7a3b')]);
      beam.position.set(0, 122, 0); beam.castShadow = true; arch.add(beam);
      arch.position.set(p.x, p.h, p.y); arch.rotation.y = -ang; scene.add(arch);
    })();

    // ---------- rampas y turbos ----------
    var rampTex = canvasTex(128, 256, function (g, w, h) {
      g.fillStyle = '#ffcc00'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1b1b1b';
      for (var y = -h; y < h * 2; y += 64) { g.beginPath(); g.moveTo(0, y + 32); g.lineTo(w / 2, y); g.lineTo(w, y + 32); g.lineTo(w, y + 56); g.lineTo(w / 2, y + 24); g.lineTo(0, y + 56); g.closePath(); g.fill(); }
    }, true);
    (T.ramps || []).forEach(function (r) {
      var pos = [], uv = [], hw = half + 18;
      for (var k = 0; k < r.n; k++) {
        var i = (r.i0 + k) % N, j = (i + 1) % N, a = P[i], b = P[j];
        var ya = a.h + r.rise * k / r.n + 1, yb = b.h + r.rise * (k + 1) / r.n + 1;
        var q = [[a.x - a.nx * hw, ya, a.y - a.ny * hw, 0, k / r.n], [a.x + a.nx * hw, ya, a.y + a.ny * hw, 1, k / r.n], [b.x - b.nx * hw, yb, b.y - b.ny * hw, 0, (k + 1) / r.n], [b.x + b.nx * hw, yb, b.y + b.ny * hw, 1, (k + 1) / r.n]];
        [0, 2, 1, 1, 2, 3].forEach(function (z) { pos.push(q[z][0], q[z][1], q[z][2]); uv.push(q[z][3] * 2, q[z][4] * 1.5); });
      }
      var e = P[(r.i0 + r.n) % N], top = e.h + r.rise + 1;
      var lip = [[e.x - e.nx * hw, top, e.y - e.ny * hw], [e.x + e.nx * hw, top, e.y + e.ny * hw], [e.x - e.nx * hw, e.h - 1, e.y - e.ny * hw], [e.x + e.nx * hw, e.h - 1, e.y + e.ny * hw]];
      var g = keep(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
      var m = new THREE.Mesh(g, lambert({ map: rampTex, side: THREE.DoubleSide })); m.receiveShadow = true; scene.add(m);
      var g2 = keep(new THREE.BufferGeometry()), lp = [];
      [0, 2, 1, 1, 2, 3].forEach(function (z) { lp.push(lip[z][0], lip[z][1], lip[z][2]); });
      g2.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); g2.computeVertexNormals();
      scene.add(new THREE.Mesh(g2, lambert({ color: 0x2a2a2a, side: THREE.DoubleSide })));
      // flechas laterales
      [-1, 1].forEach(function (s) { var post = new THREE.Mesh(keep(new THREE.CylinderGeometry(3, 3, 60, 6)), toon('#ff3b30')); var pp = P[r.i0]; post.position.set(pp.x + pp.nx * s * (hw + 12), pp.h + 30, pp.y + pp.ny * s * (hw + 12)); scene.add(post); });
    });
    var padTex = canvasTex(128, 128, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff9f0a'); gr.addColorStop(1, '#ffdd33'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.95)';
      for (var y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(16, y + 52); g.lineTo(w / 2, y + 12); g.lineTo(w - 16, y + 52); g.lineTo(w - 16, y + 64); g.lineTo(w / 2, y + 28); g.lineTo(16, y + 64); g.closePath(); g.fill(); }
    }, true);
    var padMat = keep(new THREE.MeshBasicMaterial({ map: padTex, transparent: true, opacity: 0.95 }));
    (T.pads || []).forEach(function (pd) {
      var p = P[pd.i], ang = Math.atan2(p.ty, p.tx);
      var m = new THREE.Mesh(keep(new THREE.PlaneGeometry(pd.hw * 2, pd.hl * 2 * T.step)), padMat);
      var grp = new THREE.Group(); m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.PI / 2; grp.add(m);
      grp.position.set(p.x + p.nx * pd.lat, hFrac(pd.i, p.x, p.y) + 1.3, p.y + p.ny * pd.lat); grp.rotation.y = -ang;
      // inclinación de la pendiente
      var q = P[(pd.i + 1) % N]; grp.rotation.z = Math.atan2(q.h - p.h, T.step);
      scene.add(grp);
    });

    // ---------- decorado ----------
    var deco = [];
    (function trees() {
      var r = rnd(3), max = 360, list = [];
      for (var t = 0; t < 4000 && list.length < max; t++) {
        var x = B.minX - 1200 + r() * (B.maxX - B.minX + 2400), y = B.minY - 1200 + r() * (B.maxY - B.minY + 2400);
        var n = nearestAll(x, y); if (n.d < LIM + 45) continue;
        list.push([x, y, terrainAt(x, y), 0.7 + r() * 0.8, r() < 0.45 ? 1 : 0, r()]);
      }
      var trunkG = keep(new THREE.CylinderGeometry(5, 8, 34, 6)), pineG = keep(new THREE.ConeGeometry(30, 86, 7)), roundG = keep(new THREE.IcosahedronGeometry(36, 0));
      var trunk = new THREE.InstancedMesh(trunkG, toon('#8a5a2b'), list.length);
      var pines = list.filter(function (l) { return l[4]; }), rounds = list.filter(function (l) { return !l[4]; });
      var pine = new THREE.InstancedMesh(pineG, toon('#ffffff'), pines.length), round = new THREE.InstancedMesh(roundG, toon('#ffffff'), rounds.length);
      var mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), col = new THREE.Color();
      var greens = ['#2fae4f', '#3fbf3f', '#1f9c5a', '#5ccd3a', '#ffb3d9', '#ffcc33'];
      list.forEach(function (l, i) { s.set(l[3], l[3], l[3]); v.set(l[0], l[2] + 16 * l[3], l[1]); mtx.compose(v, q, s); trunk.setMatrixAt(i, mtx); });
      pines.forEach(function (l, i) { s.set(l[3], l[3], l[3]); v.set(l[0], l[2] + (34 + 38) * l[3], l[1]); mtx.compose(v, q, s); pine.setMatrixAt(i, mtx); pine.setColorAt(i, col.set(greens[Math.floor(l[5] * 3)])); });
      rounds.forEach(function (l, i) { s.set(l[3], l[3] * 0.95, l[3]); v.set(l[0], l[2] + (34 + 26) * l[3], l[1]); mtx.compose(v, q, s); round.setMatrixAt(i, mtx); round.setColorAt(i, col.set(greens[l[5] < 0.12 ? 4 : l[5] < 0.2 ? 5 : 1 + Math.floor(l[5] * 3)])); });
      [trunk, pine, round].forEach(function (m) { m.castShadow = false; scene.add(m); deco.push(m); m.userData.full = m.count; });
    })();
    (function chevrons() {
      var texL = canvasTex(128, 64, function (g, w, h) { g.fillStyle = '#ffd60a'; g.fillRect(0, 0, w, h); g.fillStyle = '#e10600'; for (var x = 8; x < w; x += 40) { g.beginPath(); g.moveTo(x + 22, 8); g.lineTo(x, h / 2); g.lineTo(x + 22, h - 8); g.lineTo(x + 32, h - 8); g.lineTo(x + 10, h / 2); g.lineTo(x + 32, 8); g.fill(); } });
      var texR = canvasTex(128, 64, function (g, w, h) { g.translate(w, 0); g.scale(-1, 1); g.fillStyle = '#ffd60a'; g.fillRect(0, 0, w, h); g.fillStyle = '#e10600'; for (var x = 8; x < w; x += 40) { g.beginPath(); g.moveTo(x + 22, 8); g.lineTo(x, h / 2); g.lineTo(x + 22, h - 8); g.lineTo(x + 32, h - 8); g.lineTo(x + 10, h / 2); g.lineTo(x + 32, 8); g.fill(); } });
      var geo = keep(new THREE.PlaneGeometry(70, 34)), mL = lambert({ map: texL, side: THREE.DoubleSide }), mR = lambert({ map: texR, side: THREE.DoubleSide });
      var postG = keep(new THREE.CylinderGeometry(2, 2, 30, 5));
      for (var i = 0; i < N; i += 7) {
        var p = P[i]; if (p.curv < 0.3) continue;
        var q = P[(i + 10) % N], turn = p.tx * q.ty - p.ty * q.tx, side = turn > 0 ? -1 : 1; // fuera de la curva
        var off = (half + 70) * side, x = p.x + p.nx * off, y = p.y + p.ny * off;
        if (nearestAll(x, y).d < half + 50) continue;
        var g = new THREE.Group(), board = new THREE.Mesh(geo, turn > 0 ? mL : mR); board.position.y = 44; g.add(board);
        var post = new THREE.Mesh(postG, toon('#cccccc')); post.position.y = 15; g.add(post);
        g.position.set(x, terrainAt(x, y), y);
        g.rotation.y = Math.atan2(p.tx, p.ty) + Math.PI; // de cara a los que llegan
        scene.add(g);
      }
    })();
    (function statue() {
      // gran serpiente enroscada de Snake OS en el interior del circuito
      var best = null;
      for (var gx = B.minX; gx < B.maxX; gx += 60) for (var gy = B.minY; gy < B.maxY; gy += 60) {
        var n = nearestAll(gx, gy); if (n.d < 430) continue;
        var dS = Math.hypot(gx - P[12].x, gy - P[12].y); if (!best || dS < best.d) best = { x: gx, y: gy, d: dS };
      }
      if (!best) return;
      var g = new THREE.Group(), body = toon('#2fd16a'), belly = toon('#ffe066');
      [[110, 30, 0], [86, 28, 52], [62, 26, 100]].forEach(function (c) { var t = new THREE.Mesh(keep(new THREE.TorusGeometry(c[0], c[1], 10, 28)), body); t.rotation.x = Math.PI / 2; t.position.y = c[2] + 30; t.castShadow = true; g.add(t); });
      var curve = new THREE.CatmullRomCurve3([new THREE.Vector3(60, 130, 0), new THREE.Vector3(30, 190, 10), new THREE.Vector3(0, 240, 0), new THREE.Vector3(-10, 270, 0)]);
      g.add(new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 16, 24, 10)), body));
      var head = new THREE.Mesh(keep(new THREE.SphereGeometry(42, 16, 12)), body); head.scale.set(1.35, 0.85, 1.05); head.position.set(-20, 285, 0); g.add(head);
      [-1, 1].forEach(function (s) {
        var e = new THREE.Mesh(keep(new THREE.SphereGeometry(13, 12, 10)), toon('#ffffff')); e.position.set(-38, 305, s * 22); g.add(e);
        var pp = new THREE.Mesh(keep(new THREE.SphereGeometry(7, 10, 8)), toon('#111111')); pp.position.set(-48, 306, s * 22); g.add(pp);
      });
      var tongue = new THREE.Mesh(keep(new THREE.BoxGeometry(34, 3, 6)), toon('#ff3b5c')); tongue.position.set(-88, 272, 0); g.add(tongue);
      var band = new THREE.Mesh(keep(new THREE.TorusGeometry(112, 8, 6, 28)), belly); band.rotation.x = Math.PI / 2; band.position.y = 30; g.add(band);
      g.position.set(best.x, terrainAt(best.x, best.y) - 4, best.y);
      g.rotation.y = Math.atan2(best.x - P[12].x, best.y - P[12].y) - Math.PI / 2;
      scene.add(g); statueObj = g;
    })();
    var statueObj = null;
    (function grandstand() {
      var p = P[2], side = 0;
      [-1, 1].forEach(function (s) { if (side) return; var x = p.x + p.nx * s * (LIM + 90), y = p.y + p.ny * s * (LIM + 90); if (nearestAll(x, y).d > LIM + 60) side = s; });
      if (!side) return;
      var crowd = canvasTex(512, 64, function (g, w, h) { g.fillStyle = '#334'; g.fillRect(0, 0, w, h); var cs = ['#ff3b30', '#ffd60a', '#30d158', '#0a84ff', '#bf5af2', '#ff9f0a', '#fff']; for (var i = 0; i < 260; i++) { g.fillStyle = cs[i % cs.length]; g.beginPath(); g.arc(Math.random() * w, 10 + Math.random() * (h - 20), 5, 0, 7); g.fill(); } }, true);
      var grp = new THREE.Group();
      for (var k = 0; k < 4; k++) {
        var m = new THREE.Mesh(keep(new THREE.BoxGeometry(360, 18, 30)), [toon('#d0d6e0'), toon('#d0d6e0'), lambert({ map: crowd }), toon('#d0d6e0'), lambert({ map: crowd }), lambert({ map: crowd })]);
        m.position.set(0, 9 + k * 18, side * k * 28); grp.add(m);
      }
      var roof = new THREE.Mesh(keep(new THREE.BoxGeometry(380, 6, 150)), toon('#ff3b30')); roof.position.set(0, 140, side * 45); grp.add(roof);
      [-180, 180].forEach(function (x) { var c = new THREE.Mesh(keep(new THREE.CylinderGeometry(4, 4, 140, 6)), toon('#ffffff')); c.position.set(x, 70, side * 110); grp.add(c); });
      var x0 = p.x + p.nx * side * (LIM + 40), y0 = p.y + p.ny * side * (LIM + 40);
      grp.position.set(x0, terrainAt(x0, y0) - 2, y0); grp.rotation.y = -Math.atan2(p.ty, p.tx);
      scene.add(grp);
    })();

    // ---------- karts con pilotos serpiente ----------
    var wheelG = keep(new THREE.CylinderGeometry(7.5, 7.5, 7, 14)); wheelG.rotateX(Math.PI / 2);
    var rimG = keep(new THREE.CylinderGeometry(3.6, 3.6, 7.4, 8)); rimG.rotateX(Math.PI / 2);
    var boxG = keep(new THREE.BoxGeometry(1, 1, 1)), sphG = keep(new THREE.SphereGeometry(1, 14, 10)), flameG = keep(new THREE.ConeGeometry(3.4, 16, 8)); flameG.rotateZ(Math.PI / 2);
    var blobTex = canvasTex(64, 64, function (g, w, h) { var gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    var blobMat = keep(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })), blobG = keep(new THREE.PlaneGeometry(72, 44)); blobG.rotateX(-Math.PI / 2);
    var flameMat = keep(new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    var SNAKE_SKIN = ['#3ad16a', '#7ee04a', '#2fc9a0', '#a6e22e', '#43c45a', '#5fd38d'];
    function part(geo, mat, sx, sy, sz, x, y, z, parent) { var m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
    // une las piezas fijas de un grupo en una malla por material (menos llamadas de dibujo)
    function mergeStatic(parent) {
      var byMat = new Map(), drop = [];
      parent.children.forEach(function (ch) {
        if (!ch.isMesh || ch.userData.keep) return;
        ch.updateMatrix();
        var g = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone();
        g.applyMatrix4(ch.matrix);
        var e = byMat.get(ch.material); if (!e) byMat.set(ch.material, e = []);
        e.push(g); drop.push(ch);
      });
      drop.forEach(function (ch) { parent.remove(ch); });
      byMat.forEach(function (list, mat) {
        var n = 0; list.forEach(function (g) { n += g.attributes.position.count; });
        var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), o = 0;
        list.forEach(function (g) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); });
        var mg = keep(new THREE.BufferGeometry());
        mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        mg.computeBoundingSphere();
        var m = new THREE.Mesh(mg, mat); m.castShadow = true; parent.add(m);
      });
    }
    function hashName(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
    function makeLabel(name, color) {
      var tex = canvasTex(256, 64, function (g, w, h) {
        g.font = '700 34px sans-serif'; var tw = g.measureText(name).width + 50;
        g.fillStyle = 'rgba(0,0,0,.55)'; var x0 = (w - tw) / 2; g.beginPath(); g.roundRect ? g.roundRect(x0, 8, tw, 48, 14) : g.rect(x0, 8, tw, 48); g.fill();
        g.fillStyle = color; g.fillRect(x0 + 12, 24, 16, 16);
        g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(name, x0 + 36, 33);
      });
      var sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, sizeAttenuation: false })));
      sp.scale.set(0.14, 0.035, 1); sp.position.set(0, 70, 0); return sp;
    }
    function buildKart(c, isMe) {
      var root = new THREE.Group(), body = new THREE.Group(); root.add(body);
      var col = toon(c.color), dark = toon('#1c1f26'), metal = toon('#c8ced8'), seat = toon('#2a2d36');
      part(boxG, col, 44, 7, 26, -2, 9, 0, body);              // chasis
      part(boxG, col, 16, 6, 20, 24, 8, 0, body);              // morro
      part(sphG, col, 9, 5, 10, 32, 8, 0, body);
      part(boxG, dark, 5, 5, 32, 37, 6, 0, body);              // parachoques
      part(boxG, col, 30, 5, 6, -6, 12, 14, body); part(boxG, col, 30, 5, 6, -6, 12, -14, body); // pontones
      part(boxG, seat, 10, 14, 18, -14, 17, 0, body);          // asiento
      part(boxG, dark, 3, 10, 2, -30, 20, 10, body); part(boxG, dark, 3, 10, 2, -30, 20, -10, body);
      part(boxG, col, 8, 3, 36, -30, 26, 0, body);             // alerón
      var st = new THREE.Mesh(keep(new THREE.TorusGeometry(4.5, 1.1, 6, 14)), dark); st.position.set(6, 20, 0); st.rotation.y = Math.PI / 2; st.rotation.z = 0.5; body.add(st);
      var ex1 = part(keep(new THREE.CylinderGeometry(2.2, 2.6, 8, 8)), metal, 1, 1, 1, -27, 12, 6, body); ex1.rotation.z = Math.PI / 2;
      var ex2 = part(ex1.geometry, metal, 1, 1, 1, -27, 12, -6, body); ex2.rotation.z = Math.PI / 2;
      var flames = [6, -6].map(function (z) { var f = new THREE.Mesh(flameG, flameMat); f.position.set(-38, 12, z); f.visible = false; f.userData.keep = 1; body.add(f); return f; });
      // ruedas
      var wheels = [], fronts = [];
      [[22, 15], [22, -15], [-20, 16], [-20, -16]].forEach(function (w, k) {
        var piv = new THREE.Group(); piv.position.set(w[0], 7.5, w[1]); body.add(piv);
        var wh = new THREE.Mesh(wheelG, toon('#20232a')); wh.castShadow = true; piv.add(wh);
        var rim = new THREE.Mesh(rimG, toon(k < 2 ? '#e8e8e8' : '#ffd60a')); wh.add(rim);
        if (k >= 2) wh.scale.set(1.15, 1.15, 1.25);
        wheels.push(wh); if (k < 2) fronts.push(piv);
      });
      // piloto serpiente
      var skin = toon(SNAKE_SKIN[hashName(c.name || 'x') % SNAKE_SKIN.length]), bellyM = toon('#fff2a8');
      var curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-14, 14, 0), new THREE.Vector3(-12, 26, 0), new THREE.Vector3(-8, 36, 0), new THREE.Vector3(-2, 42, 0)]);
      var neck = new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 10, 5.6, 8)), skin); neck.castShadow = true; body.add(neck);
      var tail = new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-18, 16, 0), new THREE.Vector3(-26, 20, 6), new THREE.Vector3(-34, 26, 9), new THREE.Vector3(-40, 34, 4)]), 8, 3.2, 6)), skin); body.add(tail);
      var head = new THREE.Group(); head.position.set(0, 46, 0); body.add(head);
      part(sphG, skin, 11, 8, 9.5, 2, 0, 0, head);
      part(sphG, bellyM, 8, 3.5, 7.4, 6, -4.5, 0, head);
      var eyes = [];
      [-1, 1].forEach(function (s) {
        part(sphG, toon('#ffffff'), 3.6, 4.2, 3.6, 6, 5.5, s * 4.6, head);
        eyes.push(part(sphG, toon('#111111'), 1.8, 2.4, 1.8, 9, 5.8, s * 4.8, head));
      });
      // gorra del color del kart
      part(sphG, col, 9.5, 3.6, 8.6, 0, 6, 0, head);
      part(boxG, col, 10, 1.4, 12, 9, 6.2, 0, head);
      var tongue = new THREE.Group(); tongue.position.set(12, -2, 0); head.add(tongue);
      var tm = toon('#ff3b5c');
      part(boxG, tm, 7, 0.9, 1.5, 3.5, 0, 0, tongue);
      var tf1 = part(boxG, tm, 3.5, 0.9, 1.2, 8, 0, 1, tongue); tf1.rotation.y = -0.5;
      var tf2 = part(boxG, tm, 3.5, 0.9, 1.2, 8, 0, -1, tongue); tf2.rotation.y = 0.5;
      mergeStatic(body); mergeStatic(head); mergeStatic(tongue);
      var blob = new THREE.Mesh(blobG, blobMat); blob.renderOrder = 1;
      scene.add(blob);
      var label = null;
      if (!isMe) { label = makeLabel(c.name || '?', c.color); root.add(label); }
      root.traverse(function (o) { if (o.isMesh && o !== label) o.castShadow = !o.userData.keep; });
      scene.add(root);
      return { root: root, body: body, wheels: wheels, fronts: fronts, flames: flames, head: head, tongue: tongue, blob: blob, label: label, spin: 0, yawVis: 0, roll: 0, pitch: 0, t: Math.random() * 10, name: c.name };
    }
    var karts = new Map();

    // ---------- partículas (chispas, humo, polvo, turbo) ----------
    var PMAX = 700, pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 4), pSize = new Float32Array(PMAX), parts = [];
    var pg = keep(new THREE.BufferGeometry());
    pg.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('pc', new THREE.BufferAttribute(pCol, 4).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('size', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
    var pMat = keep(new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false,
      vertexShader: 'attribute float size; attribute vec4 pc; varying vec4 vc; uniform float uScale; void main(){ vc=pc; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=max(1.0,size*uScale/max(1.0,-mv.z)); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying vec4 vc; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); if(r>0.5) discard; gl_FragColor=vec4(vc.rgb, vc.a*(1.0-r*1.6)); }'
    }));
    var points = new THREE.Points(pg, pMat); points.frustumCulled = false; scene.add(points);
    var pBudget = 1;
    function emit(x, y, z, vx, vy, vz, life, size, r, g, b, a, grow, grav) {
      if (parts.length >= PMAX * pBudget) return;
      parts.push({ x: x, y: y, z: z, vx: vx, vy: vy, vz: vz, life: life, l0: life, size: size, r: r, g: g, b: b, a: a, grow: grow || 0, grav: grav || 0 });
    }
    function stepParts(dt) {
      var n = 0;
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i]; p.life -= dt;
        if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.grav * dt;
        var k = p.life / p.l0;
        pPos[n * 3] = p.x; pPos[n * 3 + 1] = p.z; pPos[n * 3 + 2] = p.y;
        pCol[n * 4] = p.r; pCol[n * 4 + 1] = p.g; pCol[n * 4 + 2] = p.b; pCol[n * 4 + 3] = p.a * k;
        pSize[n] = p.size + p.grow * (1 - k);
        n++;
      }
      pg.setDrawRange(0, n);
      pg.attributes.position.needsUpdate = true; pg.attributes.pc.needsUpdate = true; pg.attributes.size.needsUpdate = true;
    }
    var SPARK = [[0.75, 0.75, 0.75], [0.35, 0.7, 1], [1, 0.62, 0.1], [0.85, 0.4, 1]];

    // ---------- calidad ----------
    var vw = 1, vh = 1, dprIn = 1;
    function applyQuality() {
      var pr = quality === 'high' ? Math.min(dprIn, 1.5) : quality === 'med' ? Math.min(dprIn, 1) : Math.min(dprIn, 1) * 0.7;
      renderer.setPixelRatio(pr);
      renderer.setSize(vw, vh, false);
      var shadows = quality === 'high';
      if (sun.castShadow !== shadows) { sun.castShadow = shadows; renderer.shadowMap.enabled = shadows; }
      scene.fog.near = quality === 'low' ? 1500 : 2600; scene.fog.far = quality === 'low' ? 6500 : 9500;
      deco.forEach(function (m) { m.count = quality === 'low' ? Math.floor(m.userData.full * 0.45) : m.userData.full; });
      clouds.visible = quality !== 'low';
      pBudget = quality === 'low' ? 0.4 : 1;
      pMat.uniforms.uScale.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(camera.fov * Math.PI / 360));
    }
    function resize(w, h, dpr) { vw = Math.max(1, w); vh = Math.max(1, h); dprIn = dpr || 1; camera.aspect = vw / vh; camera.updateProjectionMatrix(); applyQuality(); }

    // ---------- cámara ----------
    var cam = { x: P[0].x, y: P[0].y, z: 200, a: Math.atan2(P[0].ty, P[0].tx), init: false, fov: 68, shake: 0 };
    var look = new THREE.Vector3(), orbitT = 0;
    function groundUnder(x, y, hint) {
      var bi = hint || 0, bd = 1e18;
      for (var k = -30; k <= 30; k++) { var i = (bi + k + N) % N, dx = P[i].x - x, dy = P[i].y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i; } }
      var d0 = Math.sqrt(bd), base = hFrac(bi, x, y);
      return base + smooth(LIM + 30, LIM + 950, d0) * 235;  // cota superior de las colinas
    }
    function updateCamera(dt, me, state) {
      if (!me || state === 'menu' || state === 'lobby' || (state === 'results' && !me.done)) {
        // vista de presentación: órbita lenta sobre la parrilla
        orbitT += dt * 0.12;
        var p = P[(N - 10) % N], R = 330;
        camera.position.set(p.x + Math.cos(orbitT) * R, p.h + 120, p.y + Math.sin(orbitT) * R);
        look.set(p.x, p.h + 25, p.y); camera.lookAt(look); cam.init = false;
        return;
      }
      var k = 1 - Math.exp(-dt * 6);
      var vel = Math.hypot(me.vx, me.vy), dirV = Math.atan2(me.vy, me.vx);
      var target = me.a;
      if (vel > 200 && Math.abs(angd(dirV, me.a)) < 1.2) target = me.a + angd(dirV, me.a) * 0.35;
      if (!cam.init) { cam.a = target; cam.x = me.x; cam.y = me.y; cam.z = me.z || 0; cam.init = true; k = 1; }
      cam.a += angd(target, cam.a) * Math.min(1, dt * 4.2);
      cam.x += (me.x - cam.x) * Math.min(1, dt * 14); cam.y += (me.y - cam.y) * Math.min(1, dt * 14);
      cam.z += ((me.z || 0) - cam.z) * Math.min(1, dt * (me.air ? 4 : 8));
      if (cam.z < (me.z || 0) - 25) cam.z = (me.z || 0) - 25; if (cam.z > (me.z || 0) + 25) cam.z = (me.z || 0) + 25;
      var boost = me.boostT > 0 ? 1 : 0;
      var back = 128 + Math.min(40, vel * 0.03) + boost * 14, up = 52 + boost * 2;
      var fx = Math.cos(cam.a), fy = Math.sin(cam.a);
      var px = cam.x - fx * back, py = cam.y - fy * back, pz = cam.z + up;
      var gz = groundUnder(px, py, me.idx) + 18; if (pz < gz) pz = gz;
      if (cam.shake > 0) { cam.shake -= dt; pz += (Math.random() - 0.5) * 3; }
      camera.position.x += (px - camera.position.x) * (k > 0.99 ? 1 : Math.min(1, dt * 10));
      camera.position.y += (pz - camera.position.y) * (k > 0.99 ? 1 : Math.min(1, dt * 8));
      camera.position.z += (py - camera.position.z) * (k > 0.99 ? 1 : Math.min(1, dt * 10));
      if (k > 0.99) camera.position.set(px, pz, py);
      look.set(cam.x + fx * 70, cam.z + 22, cam.y + fy * 70);
      camera.lookAt(look);
      var fovT = 66 + Math.min(10, vel * 0.008) + boost * 8;
      cam.fov += (fovT - cam.fov) * Math.min(1, dt * 3);
      if (Math.abs(camera.fov - cam.fov) > 0.05) { camera.fov = cam.fov; camera.updateProjectionMatrix(); pMat.uniforms.uScale.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(camera.fov * Math.PI / 360)); }
      sun.position.set(me.x + 500, (me.z || 0) + 1100, me.y + 260); sun.target.position.set(me.x, me.z || 0, me.y); sun.target.updateMatrixWorld();
      skyMesh.position.set(camera.position.x, 0, camera.position.z);
    }
    function angd(a, b) { var d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

    // ---------- fotograma ----------
    var padT = 0;
    function render(dt, ctx) {
      var cars = ctx.cars || [], me = ctx.me;
      var seen = new Set();
      cars.forEach(function (c) {
        var k = karts.get(c);
        if (!k) { k = buildKart(c, c === me); karts.set(c, k); }
        seen.add(c);
        var z = c.z || 0, gz = c.gz != null ? c.gz : z;
        k.t += dt;
        k.root.position.set(c.x, z, c.y);
        // derrape visual: el kart gira más hacia dentro de la curva
        var dTarget = c.dc > 0 || c.fakeDrift > 0 ? (c.driftDir || (c.steer > 0 ? 1 : -1)) * 0.32 : 0;
        k.yawVis += (dTarget - k.yawVis) * Math.min(1, dt * 7);
        k.root.rotation.y = -(c.a + k.yawVis);
        var pitchT = c.air ? Math.max(-0.35, Math.min(0.35, (c.vz || 0) / 900)) : (c.slope || 0);
        k.pitch += (pitchT - k.pitch) * Math.min(1, dt * 8);
        var rollT = -(c.steer || 0) * Math.min(1, Math.abs(c.fwd || 0) / 600) * 0.09;
        k.roll += (rollT - k.roll) * Math.min(1, dt * 6);
        k.body.rotation.set(k.roll, 0, k.pitch);
        k.body.position.y = c.air ? 0 : Math.sin(k.t * 30) * 0.25 * Math.min(1, Math.abs(c.fwd || 0) / 400);
        k.spin -= (c.fwd || 0) * dt / 7.5;
        k.wheels.forEach(function (w) { w.rotation.z = k.spin; });
        k.fronts.forEach(function (f) { f.rotation.y = -(c.steer || 0) * 0.45; });
        k.head.rotation.y = -(c.steer || 0) * 0.35 + Math.sin(k.t * 1.7) * 0.08;
        k.head.rotation.z = Math.sin(k.t * 2.3) * 0.05;
        k.tongue.visible = (Math.sin(k.t * 5) > 0.55);
        var boost = c.boostT > 0;
        k.flames.forEach(function (f) { f.visible = boost; if (boost) { var s = 0.8 + Math.random() * 0.7; f.scale.set(s * 1.2, 1, 1); } });
        // sombra de mancha en el suelo
        k.blob.position.set(c.x, gz + 1.6, c.y); k.blob.rotation.y = -c.a;
        var hgt = Math.max(0, z - gz); k.blob.scale.setScalar(Math.max(0.4, 1 - hgt / 160)); k.blob.material.opacity = 1;
        var dd = camera.position.distanceTo(k.root.position);
        k.root.visible = c === me || dd > 60;   // no tapar la cámara con un kart pegado
        if (k.label) k.label.visible = dd < 1500 && dd > 90;
        // partículas
        var fx = Math.cos(c.a), fy = Math.sin(c.a), sp = Math.abs(c.fwd || 0);
        var dist2 = me ? (c.x - me.x) * (c.x - me.x) + (c.y - me.y) * (c.y - me.y) : 0;
        var nearMe = dist2 < 1400 * 1400;
        if (nearMe && !c.air) {
          var lvl = c.dlvl || 0, drifting = c.dc > 0 || c.fakeDrift > 0;
          if (drifting && sp > 200) {
            var sc0 = SPARK[lvl > 0 ? lvl : (c.fakeDrift > 0 ? 1 : 0)];
            for (var s = -1; s <= 1; s += 2) {
              var wx = c.x - fx * 22 - fy * 16 * s, wy = c.y - fy * 22 + fx * 16 * s;
              if (Math.random() < (lvl ? 0.95 : 0.5)) emit(wx, wy, z + 3, (Math.random() - 0.5) * 120 - fx * 60, (Math.random() - 0.5) * 120 - fy * 60, 60 + Math.random() * 90, 0.25 + Math.random() * 0.2, lvl ? 2.4 : 4, sc0[0], sc0[1], sc0[2], 1, lvl ? 0 : 6, 320);
            }
          }
          if (c.offGrass && sp > 120 && Math.random() < 0.7) emit(c.x - fx * 20, c.y - fy * 20, z + 4, (Math.random() - 0.5) * 60 - c.vx * 0.15, (Math.random() - 0.5) * 60 - c.vy * 0.15, 30 + Math.random() * 30, 0.6, 10, 0.55, 0.42, 0.25, 0.75, 22, 40);
          if (boost && Math.random() < 0.9) emit(c.x - fx * 38, c.y - fy * 38, z + 12, -fx * 80 + (Math.random() - 0.5) * 30, -fy * 80 + (Math.random() - 0.5) * 30, 10, 0.22, 7, 1, 0.7, 0.2, 0.9, -4, 0);
        }
        if (c.landFx) { c.landFx = 0; for (var q = 0; q < 14; q++) emit(c.x + (Math.random() - 0.5) * 40, c.y + (Math.random() - 0.5) * 40, gz + 3, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, 40 + Math.random() * 40, 0.5, 9, 0.9, 0.86, 0.75, 0.8, 18, 120); if (c === me) cam.shake = 0.2; }
      });
      karts.forEach(function (k, c) { if (!seen.has(c)) { scene.remove(k.root); scene.remove(k.blob); karts.delete(c); } });
      stepParts(dt);
      padT += dt; padTex.offset.y = -(padT * 1.6) % 1;
      clouds.position.x = (clouds.position.x + dt * 6) % 3000;
      updateCamera(dt, me, ctx.state);
      renderer.render(scene, camera);
    }

    return {
      render: render, resize: resize,
      setQuality: function (q) { if (q === quality) return; quality = q; applyQuality(); },
      quality: function () { return quality; },
      snap: function () { cam.init = false; },
      info: function () { return renderer.info.render; },
      dispose: function () {
        disposables.forEach(function (d) { try { d.dispose(); } catch (e) {} });
        try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) {}
      }
    };
  }

  global.SNK_RACING_3D = { create: create, version: '1' };
})(window);
