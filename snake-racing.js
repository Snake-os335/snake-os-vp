/* Snake OS · Snake Racing v2 — arcade top-down, IA, drift controlado, táctil */
(function (global) {
  'use strict';

  var LOGO_URL = '/static/assets/snake-racing-logo.jpg?v=202610121940';
  var CAR_COLORS = ['#ff3b30', '#0a84ff', '#ffd60a', '#30d158', '#bf5af2', '#ff9f0a'];
  var AI_NAMES = ['Vega', 'Kato', 'Rossi', 'Nadia', 'Blitz'];

  // Circuito (puntos de control, Catmull-Rom cerrado)
  var CTRL = [
    [0, 0], [700, 0], [1150, 80], [1400, 380], [1350, 750], [1000, 900], [800, 1150],
    [900, 1450], [650, 1700], [200, 1650], [-150, 1400], [-100, 1050], [250, 900],
    [300, 650], [-50, 520], [-350, 350], [-300, 60]
  ];
  var TRACK_W = 150; // ancho total de asfalto

  function sc(p) { return [p[0] * 1.4, p[1] * 1.4]; }
  function buildTrack() {
    var pts = [], n = CTRL.length, SEG = 24;
    for (var i = 0; i < n; i++) {
      var K = 1.4, p0 = sc(CTRL[(i - 1 + n) % n]), p1 = sc(CTRL[i]), p2 = sc(CTRL[(i + 1) % n]), p3 = sc(CTRL[(i + 2) % n]);
      for (var s = 0; s < SEG; s++) {
        var t = s / SEG, t2 = t * t, t3 = t2 * t;
        pts.push({
          x: 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          y: 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        });
      }
    }
    var N = pts.length, len = 0;
    for (var k = 0; k < N; k++) {
      var a = pts[k], b = pts[(k + 1) % N];
      var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      a.tx = dx / d; a.ty = dy / d; a.nx = -a.ty; a.ny = a.tx; a.d = len; len += d;
    }
    // curvatura -> velocidad objetivo IA
    for (var j = 0; j < N; j++) {
      var c = 0;
      for (var q = 0; q < 8; q++) {
        var u = pts[(j + q) % N], v = pts[(j + q + 1) % N];
        c += Math.abs(Math.atan2(u.tx * v.ty - u.ty * v.tx, u.tx * v.tx + u.ty * v.ty));
      }
      pts[j].curv = c;
    }
    for (var m = 0; m < N; m++) {
      var mx = 0;
      for (var r = 0; r < 30; r++) mx = Math.max(mx, pts[(m + r) % N].curv);
      pts[m].vmax = Math.max(330, 760 - mx * 900);
    }
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    pts.forEach(function (p) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
    return { pts: pts, N: N, len: len, box: { minX: minX - 300, minY: minY - 300, maxX: maxX + 300, maxY: maxY + 300 } };
  }

  var TRACK = null;

  function nearestIdx(x, y, hint) {
    var P = TRACK.pts, N = TRACK.N, best = -1, bd = 1e18, i, k;
    if (hint != null && hint >= 0) {
      for (k = -20; k <= 40; k++) {
        i = (hint + k + N) % N;
        var dx = P[i].x - x, dy = P[i].y - y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      if (bd < 250 * 250) return { i: best, d2: bd };
    }
    for (i = 0; i < N; i++) {
      var ex = P[i].x - x, ey = P[i].y - y, e = ex * ex + ey * ey;
      if (e < bd) { bd = e; best = i; }
    }
    return { i: best, d2: bd };
  }

  function lateralOffset(i, x, y) {
    var p = TRACK.pts[i];
    return (x - p.x) * p.nx + (y - p.y) * p.ny;
  }

  // Sprite de coche pre-renderizado
  function makeCarSprite(color) {
    var c = document.createElement('canvas'), W = 60, H = 30, S = 2;
    c.width = W * S; c.height = H * S;
    var g = c.getContext('2d');
    g.scale(S, S);
    g.translate(W / 2, H / 2); // coche apuntando a +X
    function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    // ruedas
    g.fillStyle = '#111';
    [[-17, -13], [-17, 8], [12, -13], [12, 8]].forEach(function (w) { rr(w[0], w[1], 10, 5, 1.5); g.fill(); });
    // carrocería
    var grd = g.createLinearGradient(0, -11, 0, 11);
    grd.addColorStop(0, shade(color, 0.35)); grd.addColorStop(0.5, color); grd.addColorStop(1, shade(color, -0.35));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(-24, -9); g.quadraticCurveTo(-25, 0, -24, 9);
    g.lineTo(10, 10); g.quadraticCurveTo(25, 8, 26, 0); g.quadraticCurveTo(25, -8, 10, -10);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1; g.stroke();
    // franjas
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.fillRect(-24, -2.2, 50, 1.4); g.fillRect(-24, 0.8, 50, 1.4);
    // cabina
    g.fillStyle = '#0d1b2a';
    g.beginPath(); g.moveTo(-8, -7); g.lineTo(6, -6); g.quadraticCurveTo(11, 0, 6, 6); g.lineTo(-8, 7); g.quadraticCurveTo(-11, 0, -8, -7); g.fill();
    g.fillStyle = 'rgba(160,210,255,.35)';
    g.beginPath(); g.moveTo(2, -5.5); g.quadraticCurveTo(9, 0, 2, 5.5); g.lineTo(5, 0); g.fill();
    // alerón
    g.fillStyle = shade(color, -0.5); rr(-28, -12, 5, 24, 1.5); g.fill();
    // faros
    g.fillStyle = '#fffbe0'; g.fillRect(22, -6, 3, 3); g.fillRect(22, 3, 3, 3);
    g.fillStyle = '#ff2a2a'; g.fillRect(-25, -8, 2, 3); g.fillRect(-25, 5, 2, 3);
    return c;
  }
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    function m(v) { return Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)); }
    return 'rgb(' + m(r) + ',' + m(gg) + ',' + m(b) + ')';
  }

  // Pista pre-renderizada en canvas offscreen
  function makeTrackCanvas() {
    var B = TRACK.box, W = B.maxX - B.minX, H = B.maxY - B.minY, SC = 0.5;
    var c = document.createElement('canvas');
    c.width = Math.ceil(W * SC); c.height = Math.ceil(H * SC);
    var g = c.getContext('2d');
    g.scale(SC, SC); g.translate(-B.minX, -B.minY);
    // césped con textura
    g.fillStyle = '#2f6b2f'; g.fillRect(B.minX, B.minY, W, H);
    for (var i = 0; i < 2500; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)';
      g.fillRect(B.minX + Math.random() * W, B.minY + Math.random() * H, 18 + Math.random() * 40, 18 + Math.random() * 40);
    }
    // franjas de corte de césped
    g.fillStyle = 'rgba(255,255,255,.03)';
    for (var sx = B.minX; sx < B.maxX; sx += 160) g.fillRect(sx, B.minY, 80, H);
    var P = TRACK.pts;
    function path() { g.beginPath(); g.moveTo(P[0].x, P[0].y); for (var k = 1; k < P.length; k++) g.lineTo(P[k].x, P[k].y); g.closePath(); }
    g.lineJoin = 'round'; g.lineCap = 'round';
    // escapatoria
    path(); g.strokeStyle = '#c9b48a'; g.lineWidth = TRACK_W + 90; g.stroke();
    // sombra
    path(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = TRACK_W + 26; g.stroke();
    // pianos (rojo/blanco)
    path(); g.strokeStyle = '#ffffff'; g.lineWidth = TRACK_W + 18; g.stroke();
    path(); g.setLineDash([22, 22]); g.strokeStyle = '#e10600'; g.lineWidth = TRACK_W + 18; g.stroke(); g.setLineDash([]);
    // asfalto
    path(); g.strokeStyle = '#3a3d42'; g.lineWidth = TRACK_W; g.stroke();
    path(); g.strokeStyle = '#34373c'; g.lineWidth = TRACK_W * 0.55; g.stroke();
    // línea central discontinua
    path(); g.setLineDash([30, 40]); g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 3; g.stroke(); g.setLineDash([]);
    // meta (cuadros)
    var p0 = P[0], half = TRACK_W / 2, cs = 12;
    g.save(); g.translate(p0.x, p0.y); g.rotate(Math.atan2(p0.ty, p0.tx));
    for (var yy = -half; yy < half; yy += cs) for (var xx = 0; xx < 2; xx++) {
      g.fillStyle = ((Math.round((yy + half) / cs) + xx) % 2) ? '#fff' : '#111';
      g.fillRect(xx * cs - cs, yy, cs, cs);
    }
    g.restore();
    // neumáticos / árboles decorativos fuera de pista
    for (var t = 0; t < 260; t++) {
      var x = B.minX + Math.random() * W, y = B.minY + Math.random() * H;
      var nI = nearestIdx(x, y).d2;
      if (nI < (TRACK_W / 2 + 120) * (TRACK_W / 2 + 120)) continue;
      var r = 14 + Math.random() * 18;
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(x + 6, y + 6, r, 0, 7); g.fill();
      g.fillStyle = '#1f4d1f'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.fillStyle = '#2b6a2b'; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.6, 0, 7); g.fill();
    }
    return { canvas: c, scale: SC };
  }

  function fmtTime(ms) {
    if (ms == null || !isFinite(ms)) return '--:--.---';
    var m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, x = Math.floor(ms % 1000);
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + ('00' + x).slice(-3);
  }

  var CSS = '' +
    '.srx{position:relative;height:100%;width:100%;background:#0b0d12;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;outline:none;user-select:none;-webkit-user-select:none;touch-action:none}' +
    '.srx canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
    '.srx-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 30%,rgba(20,30,50,.75),rgba(5,6,10,.92));z-index:5}' +
    '.srx-card{text-align:center;max-width:420px;padding:22px 26px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(8px);box-shadow:0 20px 60px rgba(0,0,0,.5)}' +
    '.srx-card img{width:96px;height:96px;border-radius:22px;object-fit:cover;box-shadow:0 8px 24px rgba(0,0,0,.5)}' +
    '.srx-card h1{margin:12px 0 4px;font-size:28px;font-weight:900;letter-spacing:.5px;font-style:italic;background:linear-gradient(90deg,#ff3b30,#ffd60a);-webkit-background-clip:text;background-clip:text;color:transparent}' +
    '.srx-card p{margin:4px 0;color:#b8c0cc;font-size:13px}' +
    '.srx-row{display:flex;gap:8px;justify-content:center;margin:12px 0}' +
    '.srx-opt{padding:7px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#dfe5ee;font-size:13px;cursor:pointer}' +
    '.srx-opt.on{background:#ffd60a;color:#111;border-color:#ffd60a;font-weight:700}' +
    '.srx-go{margin-top:10px;padding:12px 34px;font-size:17px;font-weight:800;border:0;border-radius:12px;cursor:pointer;color:#111;background:linear-gradient(90deg,#ffd60a,#ff9f0a);box-shadow:0 6px 20px rgba(255,159,10,.4)}' +
    '.srx-go:hover{filter:brightness(1.08)}' +
    '.srx-keys{margin-top:14px;font-size:12px;color:#8f99a8;line-height:1.6}' +
    '.srx-keys b{display:inline-block;min-width:18px;padding:1px 6px;border-radius:5px;background:rgba(255,255,255,.12);color:#fff;font-weight:600}' +
    '.srx-hud{position:absolute;inset:0;pointer-events:none;z-index:3}' +
    '.srx-pos{position:absolute;top:10px;left:12px;font-weight:900;font-style:italic;font-size:34px;line-height:1;text-shadow:0 2px 8px rgba(0,0,0,.6)}' +
    '.srx-pos small{font-size:15px;color:#c8d0dc}' +
    '.srx-info{position:absolute;top:10px;right:12px;text-align:right;font-size:13px;background:rgba(0,0,0,.45);padding:8px 12px;border-radius:12px;font-variant-numeric:tabular-nums}' +
    '.srx-info b{font-size:18px}' +
    '.srx-spd{position:absolute;bottom:12px;right:14px;text-align:right;font-style:italic;font-weight:900;text-shadow:0 2px 8px rgba(0,0,0,.7)}' +
    '.srx-spd .v{font-size:44px;line-height:1;font-variant-numeric:tabular-nums}.srx-spd .u{font-size:13px;color:#c8d0dc}' +
    '.srx-bar{width:150px;height:6px;border-radius:3px;background:rgba(255,255,255,.15);margin-top:4px;overflow:hidden}.srx-bar i{display:block;height:100%;background:linear-gradient(90deg,#30d158,#ffd60a,#ff3b30)}' +
    '.srx-big{position:absolute;left:0;right:0;top:38%;text-align:center;font-size:72px;font-weight:900;font-style:italic;text-shadow:0 4px 20px rgba(0,0,0,.7);transition:transform .15s}' +
    '.srx-msg{position:absolute;left:0;right:0;top:22%;text-align:center;font-size:18px;font-weight:800;color:#ffd60a;text-shadow:0 2px 10px rgba(0,0,0,.8)}' +
    '.srx-touch{position:absolute;bottom:14px;left:0;right:0;display:none;justify-content:space-between;padding:0 14px;z-index:4;pointer-events:none}' +
    '.srx-touch .g{display:flex;gap:10px;pointer-events:auto}' +
    '.srx-touch button{width:64px;height:64px;border-radius:50%;border:2px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);color:#fff;font-size:24px;font-weight:900;touch-action:none}' +
    '.srx-touch button.on{background:rgba(255,214,10,.5)}' +
    '.srx.touch .srx-touch{display:flex}.srx.touch .srx-spd{bottom:92px}' +
    '.srx-res{width:100%;border-collapse:collapse;margin:10px 0;font-size:14px;font-variant-numeric:tabular-nums}' +
    '.srx-res td{padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}.srx-res tr.me td{color:#ffd60a;font-weight:800}' +
    '.srx-toasts{position:absolute;top:60px;left:50%;transform:translateX(-50%);z-index:8;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none}' +
    '.srx-toast{padding:7px 14px;border-radius:20px;background:rgba(10,12,18,.88);border:1px solid rgba(255,255,255,.15);font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.4);animation:srxIn .25s ease-out}' +
    '@keyframes srxIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}' +
    '.srx-pl{list-style:none;margin:10px 0;padding:0;text-align:left;font-size:14px}.srx-pl li{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.05);margin-bottom:5px}' +
    '.srx-pl .dot{width:12px;height:12px;border-radius:3px}.srx-pl .st{margin-left:auto;font-size:12px;color:#8f99a8}.srx-pl .st.ok{color:#30d158;font-weight:700}' +
    '.srx-reset{position:absolute;left:0;right:0;top:30%;text-align:center;font-size:15px;font-weight:700;color:#fff;text-shadow:0 2px 8px #000}.srx-reset b{background:#ffd60a;color:#111;padding:2px 8px;border-radius:6px}' +
    '.srx-pause{position:absolute;top:10px;left:50%;transform:translateX(-50%);pointer-events:auto;border:0;border-radius:10px;padding:5px 12px;background:rgba(0,0,0,.45);color:#fff;font-size:13px;cursor:pointer}';

  function renderSnakeRacingApp(container) {
    if (!TRACK) TRACK = buildTrack();
    if (!document.getElementById('srx-css')) {
      var st = document.createElement('style'); st.id = 'srx-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    container.innerHTML =
      '<div class="srx" tabindex="0">' +
      '<canvas></canvas>' +
      '<div class="srx-hud" style="display:none">' +
      '<div class="srx-pos"></div><div class="srx-info"></div>' +
      '<div class="srx-spd"><span class="v">0</span> <span class="u">km/h</span><div class="srx-bar"><i></i></div></div>' +
      '<div class="srx-msg"></div><div class="srx-big"></div><div class="srx-reset" style="display:none">Pulsa <b>R</b> para volver a pista</div>' +
      '<button class="srx-pause" type="button">❚❚ Pausa</button>' +
      '</div>' +
      '<div class="srx-toasts"></div><div class="srx-touch"><div class="g"><button data-k="reset">R</button><button data-k="left">◀</button><button data-k="right">▶</button></div>' +
      '<div class="g"><button data-k="drift">⤳</button><button data-k="down">▼</button><button data-k="up">▲</button></div></div>' +
      '<div class="srx-ov"></div>' +
      '</div>';

    var root = container.querySelector('.srx');
    var canvas = root.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var hud = root.querySelector('.srx-hud');
    var elPos = root.querySelector('.srx-pos'), elInfo = root.querySelector('.srx-info');
    var elSpd = root.querySelector('.srx-spd .v'), elBar = root.querySelector('.srx-bar i');
    var elBig = root.querySelector('.srx-big'), elMsg = root.querySelector('.srx-msg');
    var ov = root.querySelector('.srx-ov');
    var alive = true, raf = 0, last = 0, dpr = 1, vw = 0, vh = 0;
    var trackImg = makeTrackCanvas();
    var keys = { up: false, down: false, left: false, right: false, drift: false };
    var elReset = root.querySelector('.srx-reset'), elToasts = root.querySelector('.srx-toasts');
    var net = { ws: null, on: false, you: null, lobby: null, isAiHost: false, sendAcc: 0, raceId: 0, results: null };
    var opts = { laps: 3, diff: 1 };
    try { var sv = JSON.parse(localStorage.getItem('snkRacingOpts') || 'null'); if (sv) { opts.laps = sv.laps || 3; opts.diff = sv.diff != null ? sv.diff : 1; } } catch (e) {}
    var best = null; try { best = parseFloat(localStorage.getItem('snkRacingBest')) || null; } catch (e) {}
    var state = 'menu', cars = [], me = null, t0 = 0, raceT = 0, countdown = 0, skids = [], parts = [], finishOrder = [], cam = { x: 0, y: 0, z: 1 }, msgTimer = 0;

    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) root.classList.add('touch');

    function resize() {
      var r = root.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      vw = Math.max(1, r.width); vh = Math.max(1, r.height);
      canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    }
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(root); else window.addEventListener('resize', resize);
    resize();

    function newCar(i, color, name, ai) {
      var P = TRACK.pts, N = TRACK.N;
      var row = Math.floor(i / 2), side = i % 2 ? 1 : -1;
      var idx = (N - 6 - row * 5 + N) % N, p = P[idx];
      return {
        x: p.x + p.nx * side * 34, y: p.y + p.ny * side * 34, a: Math.atan2(p.ty, p.tx),
        vx: 0, vy: 0, steer: 0, idx: idx, lap: 0, prog: 0, lastIdx: idx, lapStart: 0, bestLap: null,
        sprite: makeCarSprite(color), color: color, name: name, ai: ai, done: false, finishT: null,
        skill: ai ? (0.86 + opts.diff * 0.06 + Math.random() * 0.05) : 1, laneBias: (Math.random() - 0.5) * 50, drifting: false,
        goodIdx: idx, offT: 0, frozen: 0, remote: false, buf: [], id: null
      };
    }

    function startRace(grid) {
      try { localStorage.setItem('snkRacingOpts', JSON.stringify(opts)); } catch (e) {}
      cars = [];
      if (grid && grid.length) {
        grid.forEach(function (g, i) {
          var c = newCar(i, g.color, g.id === net.you ? 'Tú' : g.name, g.ai);
          c.id = g.id;
          if (g.id === net.you) me = c;
          else if (!(g.ai && net.isAiHost)) c.remote = true;
          if (g.ai) c.skill = 0.86 + opts.diff * 0.06 + (i % 3) * 0.02;
          cars.push(c);
        });
        if (!me) { me = newCar(0, CAR_COLORS[0], 'Tú', false); cars.push(me); }
      } else {
        net.on = false;
        if (net.ws) { try { net.ws.close(); } catch (e) {} net.ws = null; }
        for (var i = 0; i <= 5; i++) {
          if (i === 5) { me = newCar(i, CAR_COLORS[0], 'Tú', false); cars.push(me); }
          else cars.push(newCar(i, CAR_COLORS[i + 1], AI_NAMES[i], true));
        }
      }
      skids = []; parts = []; finishOrder = [];
      countdown = 3.5; raceT = 0; state = 'count';
      cam.x = me.x; cam.y = me.y;
      ov.style.display = 'none'; hud.style.display = '';
      root.focus();
    }

    // ---------- física arcade ----------
    var MAXV = 820, ACC = 520, BRAKE = 900, REV = 220;
    function resetCar(c) {
      if (c.frozen > 0) return;
      var P = TRACK.pts, i = c.goodIdx, p = P[i];
      c.x = p.x; c.y = p.y; c.a = Math.atan2(p.ty, p.tx); c.vx = c.vy = 0; c.fwd = 0; c.steer = 0;
      c.idx = i; c.lastIdx = i; c.offT = 0; c.frozen = 1;
      if (c === me) flash('Recolocado · +1 s');
    }
    function stepCar(c, dt, inp) {
      if (c.frozen > 0) { c.frozen -= dt; c.vx = c.vy = 0; c.fwd = 0; return; }
      var fx = Math.cos(c.a), fy = Math.sin(c.a);
      var fwd = c.vx * fx + c.vy * fy;            // velocidad longitudinal
      var lat = -c.vx * fy + c.vy * fx;           // velocidad lateral
      var near = nearestIdx(c.x, c.y, c.idx);
      c.idx = near.i;
      var off = Math.sqrt(near.d2) > TRACK_W / 2 + 10;
      var grass = Math.sqrt(near.d2) > TRACK_W / 2 + 45;
      var maxv = MAXV * c.skill * (grass ? 0.45 : off ? 0.8 : 1);
      // motor / freno
      if (inp.up) fwd += ACC * dt * (1 - Math.max(0, fwd) / maxv);
      if (inp.down) fwd -= (fwd > 20 ? BRAKE : REV) * dt;
      if (!inp.up && !inp.down) fwd *= Math.pow(0.55, dt);   // rodadura
      if (fwd > maxv) fwd += (maxv - fwd) * Math.min(1, dt * 3);
      if (fwd < -REV) fwd = -REV;
      // dirección: proporcional a velocidad, menos a alta velocidad
      c.steer += ((inp.steer || 0) - c.steer) * Math.min(1, dt * 10);
      var sp = Math.abs(fwd);
      var turn = c.steer * Math.min(1, sp / 140) * (2.9 - 1.2 * Math.min(1, sp / MAXV));
      if (inp.drift && sp > 250) turn *= 1.35;
      c.a += turn * dt * (fwd >= 0 ? 1 : -1);
      // agarre lateral: alto normalmente -> el coche va hacia donde apunta
      var grip = inp.drift && sp > 250 ? 2.2 : (grass ? 6 : 14);
      lat *= Math.exp(-grip * dt);
      if (inp.drift && sp > 250) fwd -= 60 * dt;
      c.drifting = Math.abs(lat) > 90;
      fx = Math.cos(c.a); fy = Math.sin(c.a);
      c.vx = fx * fwd - fy * lat; c.vy = fy * fwd + fx * lat;
      c.x += c.vx * dt; c.y += c.vy * dt;
      // muro exterior blando
      var dd = Math.sqrt(near.d2), lim = TRACK_W / 2 + 120;
      if (dd > lim) {
        var p = TRACK.pts[c.idx], o = lateralOffset(c.idx, c.x, c.y), s = o > 0 ? 1 : -1;
        c.x = p.x + p.nx * s * lim; c.y = p.y + p.ny * s * lim;
        c.vx *= 0.5; c.vy *= 0.5;
      }
      c.fwd = fwd; c.off = off;
      if (!off) { c.offT = 0; var gd = c.idx - c.goodIdx; if ((gd > 0 && gd < 60) || gd < -TRACK.N / 2) c.goodIdx = c.idx; } else c.offT += dt;
      if (c.ai && c.offT > 3) resetCar(c);
      // progreso / vueltas
      var N = TRACK.N, di = c.idx - c.lastIdx;
      if (di < -N / 2) { // cruzó meta hacia delante
        c.lap++;
        var lt = raceT - c.lapStart; c.lapStart = raceT;
        if (c.lap > 1 || lt > 5) { if (c.bestLap == null || lt < c.bestLap) c.bestLap = lt; }
        if (c === me && c.lap >= 2) flash('Vuelta ' + fmtTime(lt * 1000));
        if (c.lap > opts.laps && !c.done) { c.done = true; c.finishT = raceT; finishOrder.push(c);
          if (net.on) { if (c === me) netSend({ type: 'finish', t: raceT, best: c.bestLap }); else if (c.ai) netSend({ type: 'ai_finish', id: c.id, t: raceT, best: c.bestLap }); } }
      } else if (di > N / 2) c.lap--;
      c.lastIdx = c.idx;
      c.prog = c.lap * N + c.idx;
      // marcas de derrape
      if ((c.drifting || (inp.down && sp > 300)) && !grass) {
        var bx = -fx * 16, by = -fy * 16;
        skids.push({ x: c.x + bx - fy * 9, y: c.y + by + fx * 9, a: 0.5 }, { x: c.x + bx + fy * 9, y: c.y + by - fx * 9, a: 0.5 });
        if (Math.random() < 0.5) parts.push({ x: c.x + bx, y: c.y + by, vx: (Math.random() - .5) * 40, vy: (Math.random() - .5) * 40, life: 0.8, col: 'rgba(220,220,220,' });
      }
      if (grass && sp > 120 && Math.random() < 0.6) parts.push({ x: c.x, y: c.y, vx: -c.vx * 0.2 + (Math.random() - .5) * 60, vy: -c.vy * 0.2 + (Math.random() - .5) * 60, life: 0.6, col: 'rgba(120,90,50,' });
    }

    function aiInput(c) {
      var P = TRACK.pts, N = TRACK.N;
      var sp = Math.hypot(c.vx, c.vy);
      var look = 14 + Math.floor(sp / 50);
      var t = P[(c.idx + look) % N];
      var tx = t.x + t.nx * c.laneBias, ty = t.y + t.ny * c.laneBias;
      var desired = Math.atan2(ty - c.y, tx - c.x);
      var da = desired - c.a;
      while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      var vt = P[(c.idx + 6) % N].vmax * c.skill;
      // rubber band suave
      var lead = (me.prog - c.prog) / N;
      vt *= 1 + Math.max(-0.08, Math.min(0.06, lead * 0.15));
      return { steer: Math.max(-1, Math.min(1, da * 2.5)), up: sp < vt, down: sp > vt + 90, drift: false };
    }

    function collide() {
      for (var i = 0; i < cars.length; i++) for (var j = i + 1; j < cars.length; j++) {
        var a = cars[i], b = cars[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), R = 26;
        if (d > 0 && d < R) {
          var nx = dx / d, ny = dy / d, push = (R - d) / 2;
          if (a.remote && b.remote) continue;
          var wa = a.remote ? 0 : (b.remote ? 2 : 1), wb = b.remote ? 0 : (a.remote ? 2 : 1);
          a.x -= nx * push * wa; a.y -= ny * push * wa; b.x += nx * push * wb; b.y += ny * push * wb;
          var rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) { var imp = -rv * 0.6; a.vx -= nx * imp * wa; a.vy -= ny * imp * wa; b.vx += nx * imp * wb; b.vy += ny * imp * wb; }
        }
      }
    }

    function flash(t) { elMsg.textContent = t; msgTimer = 2; }

    function rankCars() {
      return cars.slice().sort(function (a, b) {
        if (a.done && b.done) return a.finishT - b.finishT;
        if (a.done) return -1; if (b.done) return 1;
        return b.prog - a.prog;
      });
    }

    function update(dt) {
      if (state === 'count' && net.on) { net.sendAcc += dt; if (net.sendAcc >= 0.1) { net.sendAcc = 0; sendState(); } cars.forEach(function (c) { if (c.remote) interp(c); }); }
      if (state === 'count') {
        var prev = Math.ceil(countdown - 0.5);
        countdown -= dt;
        var n = Math.ceil(countdown - 0.5);
        elBig.textContent = countdown > 0.5 ? String(n) : '¡YA!';
        elBig.style.color = countdown > 0.5 ? '#ff3b30' : '#30d158';
        if (countdown <= 0) { state = 'race'; elBig.textContent = ''; cars.forEach(function (c) { c.lapStart = 0; }); }
      } else if (state === 'race' || state === 'finish') {
        raceT += dt;
        cars.forEach(function (c) {
          if (c.remote) { interp(c); return; }
          var inp;
          if (c.ai || c.done) inp = aiInput(c);
          else inp = { up: keys.up, down: keys.down, steer: (keys.left ? -1 : 0) + (keys.right ? 1 : 0), drift: keys.drift };
          stepCar(c, dt, inp);
        });
        collide();
        if (me.done && state === 'race') { state = 'finish'; flash('¡META!'); if (!net.on) setTimeout(function () { if (alive) showResults(); }, 2500); else flash('¡META! Esperando al resto…'); }
        if (net.on) { net.sendAcc += dt; if (net.sendAcc >= 0.04) { net.sendAcc = 0; sendState(); } }
        elReset.style.display = (me.offT > 2 && !me.done) ? '' : 'none';
      }
      // cámara con anticipación y zoom por velocidad
      var sp = Math.hypot(me.vx, me.vy);
      var zt = Math.max(0.55, 1.05 - sp / 1600) * Math.min(1, Math.min(vw, vh) / 520);
      cam.z += (zt - cam.z) * Math.min(1, dt * 2);
      var ax = me.x + me.vx * 0.35, ay = me.y + me.vy * 0.35;
      cam.x += (ax - cam.x) * Math.min(1, dt * 5); cam.y += (ay - cam.y) * Math.min(1, dt * 5);
      // partículas
      for (var i = parts.length - 1; i >= 0; i--) { var p = parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life <= 0) parts.splice(i, 1); }
      if (skids.length > 1600) skids.splice(0, skids.length - 1600);
      if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) elMsg.textContent = ''; }
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#2f6b2f'; ctx.fillRect(0, 0, vw, vh);
      if (!me) return;
      ctx.save();
      ctx.translate(vw / 2, vh / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
      var B = TRACK.box;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(trackImg.canvas, B.minX, B.minY, trackImg.canvas.width / trackImg.scale, trackImg.canvas.height / trackImg.scale);
      ctx.fillStyle = 'rgba(15,15,15,.45)';
      for (var i = 0; i < skids.length; i++) { var s = skids[i]; ctx.fillRect(s.x - 2.5, s.y - 2.5, 5, 5); }
      for (var k = 0; k < parts.length; k++) { var p = parts[k]; ctx.fillStyle = p.col + (p.life * 0.6) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, 6 + (1 - p.life) * 10, 0, 7); ctx.fill(); }
      cars.forEach(function (c) {
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(4, 5, 30, 15, 0, 0, 7); ctx.fill();
        ctx.drawImage(c.sprite, -30, -15, 60, 30);
        ctx.restore();
        if (c !== me) {
          ctx.font = '600 13px system-ui,sans-serif'; ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(0,0,0,.55)'; var w = ctx.measureText(c.name).width + 10;
          ctx.fillRect(c.x - w / 2, c.y - 44, w, 18);
          ctx.fillStyle = '#fff'; ctx.fillText(c.name, c.x, c.y - 31);
        }
      });
      ctx.restore();
      drawMinimap();
    }

    function drawMinimap() {
      var B = TRACK.box, S = Math.min(130, vw * 0.22) / (B.maxX - B.minX);
      var mw = (B.maxX - B.minX) * S, mh = (B.maxY - B.minY) * S, ox = 12, oy = vh - mh - 12;
      if (root.classList.contains('touch')) oy = 70;
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(ox - 6, oy - 6, mw + 12, mh + 12, 10) : ctx.rect(ox - 6, oy - 6, mw + 12, mh + 12); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.beginPath();
      TRACK.pts.forEach(function (p, i) { var x = ox + (p.x - B.minX) * S, y = oy + (p.y - B.minY) * S; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath(); ctx.stroke();
      cars.forEach(function (c) {
        ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(ox + (c.x - B.minX) * S, oy + (c.y - B.minY) * S, c === me ? 4.5 : 3, 0, 7); ctx.fill();
        if (c === me) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
      });
    }

    function updateHud() {
      if (state === 'menu' || state === 'results' || !me) return;
      var rk = rankCars(), pos = rk.indexOf(me) + 1;
      elPos.innerHTML = pos + '<small>/' + cars.length + '</small>';
      var lap = Math.max(1, Math.min(opts.laps, me.lap));
      var cur = state === 'count' ? 0 : (raceT - me.lapStart) * 1000;
      elInfo.innerHTML = 'VUELTA <b>' + lap + '/' + opts.laps + '</b><br>' +
        'Tiempo ' + fmtTime(raceT * 1000) + '<br>Vuelta ' + fmtTime(cur) + '<br>' +
        '<span style="color:#ffd60a">Mejor ' + fmtTime(me.bestLap != null ? me.bestLap * 1000 : null) + '</span>';
      var kmh = Math.round(Math.abs(me.fwd || 0) * 0.32);
      elSpd.textContent = kmh;
      elBar.style.width = Math.min(100, kmh / 2.7) + '%';
    }

    function loop(ts) {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      var dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts;
      if ((state !== 'paused' || net.on) && state !== 'menu' && state !== 'results' && state !== 'lobby') {
        var real = state; if (state === 'paused') state = pausedFrom;
        // sub-pasos para estabilidad
        var steps = Math.ceil(dt / 0.0167);
        for (var i = 0; i < steps; i++) update(dt / steps);
        if (real === 'paused') { pausedFrom = state; state = 'paused'; }
      }
      draw(); updateHud();
    }

    // ---------- menús ----------
    function optBtns(name, vals, labels) {
      return vals.map(function (v, i) { return '<button type="button" class="srx-opt' + (opts[name] === v ? ' on' : '') + '" data-o="' + name + '" data-v="' + v + '">' + labels[i] + '</button>'; }).join('');
    }
    function showMenu() {
      state = 'menu'; elReset.style.display = 'none'; hud.style.display = 'none'; ov.style.display = '';
      ov.innerHTML = '<div class="srx-card">' +
        '<img src="' + LOGO_URL + '" alt="" onerror="this.style.display=\'none\'">' +
        '<h1>SNAKE RACING</h1><p>Circuito Doganiero · 6 pilotos</p>' +
        '<div class="srx-row">' + optBtns('laps', [2, 3, 5], ['2 vueltas', '3 vueltas', '5 vueltas']) + '</div>' +
        '<div class="srx-row">' + optBtns('diff', [0, 1, 2], ['Fácil', 'Normal', 'Pro']) + '</div>' +
        '<button type="button" class="srx-go">▶ UN JUGADOR</button> <button type="button" class="srx-go srx-online" style="background:linear-gradient(90deg,#0a84ff,#bf5af2);color:#fff">🌐 ONLINE</button>' +
        '<p style="margin-top:10px">Récord de vuelta: <b style="color:#ffd60a">' + fmtTime(best != null ? best * 1000 : null) + '</b></p>' +
        '<div class="srx-keys"><b>↑</b>/<b>W</b> acelerar · <b>↓</b>/<b>S</b> frenar · <b>←</b><b>→</b> girar<br><b>Espacio</b> derrape controlado · <b>R</b> volver a pista · <b>P</b>/<b>Esc</b> pausa</div>' +
        '</div>';
      ov.querySelectorAll('.srx-opt').forEach(function (b) {
        b.onclick = function () { opts[b.dataset.o] = +b.dataset.v; showMenu(); };
      });
      ov.querySelector('.srx-go').onclick = function () { startRace(); };
      ov.querySelector('.srx-online').onclick = goOnline;
      if (!me) { me = newCar(0, CAR_COLORS[0], 'Tú', false); cars = [me]; cam.x = me.x; cam.y = me.y; cam.z = 0.7; }
    }
    function showResults() {
      state = 'results'; hud.style.display = 'none'; ov.style.display = '';
      var rk = rankCars(), pos = rk.indexOf(me) + 1;
      if (me.bestLap != null && (best == null || me.bestLap < best)) { best = me.bestLap; try { localStorage.setItem('snkRacingBest', String(best)); } catch (e) {} }
      var rows = rk.map(function (c, i) {
        return '<tr class="' + (c === me ? 'me' : '') + '"><td>' + (i + 1) + '</td><td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + c.color + '"></span> ' + c.name + '</td><td>' + (c.done ? fmtTime(c.finishT * 1000) : '—') + '</td><td>' + fmtTime(c.bestLap != null ? c.bestLap * 1000 : null) + '</td></tr>';
      }).join('');
      ov.innerHTML = '<div class="srx-card"><h1>' + (pos === 1 ? '🏆 ¡VICTORIA!' : 'P' + pos) + '</h1>' +
        '<table class="srx-res"><tr style="color:#8f99a8"><td>#</td><td>Piloto</td><td>Total</td><td>Mejor</td></tr>' + rows + '</table>' +
        '<button type="button" class="srx-go">↻ Revancha</button> <button type="button" class="srx-opt srx-menu">Menú</button></div>';
      ov.querySelector('.srx-go').onclick = function () { startRace(); };
      ov.querySelector('.srx-menu').onclick = showMenu;
    }
    var pausedFrom = null;
    function togglePause() {
      if (state === 'paused') { state = pausedFrom; ov.style.display = 'none'; root.focus(); return; }
      if (state !== 'race' && state !== 'count') return;
      if (net.on) { /* online no se detiene: solo menú superpuesto */ }
      pausedFrom = state; state = 'paused'; ov.style.display = '';
      ov.innerHTML = '<div class="srx-card"><h1>PAUSA</h1><button type="button" class="srx-go">▶ Continuar</button><div class="srx-row"><button type="button" class="srx-opt r1">Reiniciar</button><button type="button" class="srx-opt r2">Menú</button></div></div>';
      ov.querySelector('.srx-go').onclick = togglePause;
      ov.querySelector('.r1').onclick = function () { startRace(); };
      ov.querySelector('.r2').onclick = showMenu;
      if (net.on) { ov.querySelector('.r1').style.display = 'none'; ov.querySelector('h1').textContent = 'PAUSA (la carrera online sigue)'; }
    }
    root.querySelector('.srx-pause').onclick = togglePause;

    // ---------- controles ----------
    var KMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'drift', ShiftLeft: 'drift', KeyR: 'reset' };
    function onKey(e) {
      if (!alive) return;
      if (!root.isConnected) return;
      var focusedHere = root.contains(document.activeElement) || document.activeElement === document.body;
      if (!focusedHere) return;
      var k = KMAP[e.code];
      if (e.type === 'keydown' && (e.code === 'KeyP' || e.code === 'Escape')) { togglePause(); e.preventDefault(); return; }
      if (e.type === 'keydown' && e.code === 'Enter' && !net.on && (state === 'menu' || state === 'results')) { startRace(); e.preventDefault(); return; }
      if (k === 'reset') { if (e.type === 'keydown' && me && (state === 'race')) resetCar(me); e.preventDefault(); return; }
      if (k) { keys[k] = e.type === 'keydown'; e.preventDefault(); e.stopPropagation(); }
    }
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    root.addEventListener('pointerdown', function () { root.focus(); });
    function onBlur() { for (var k in keys) keys[k] = false; }
    window.addEventListener('blur', onBlur);
    root.querySelectorAll('.srx-touch button').forEach(function (b) {
      var k = b.dataset.k;
      function on(e) { e.preventDefault(); if (k === 'reset') { if (me && state === 'race') resetCar(me); return; } keys[k] = true; b.classList.add('on'); }
      function off(e) { e.preventDefault(); keys[k] = false; b.classList.remove('on'); }
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    });


    // ---------- online ----------
    var actx = null;
    function beep(up) {
      try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
        o.type = 'sine'; o.frequency.setValueAtTime(up ? 660 : 520, t); o.frequency.linearRampToValueAtTime(up ? 880 : 390, t + 0.18);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.32);
      } catch (e) {}
    }
    function esc(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }
    function toast(html, kind) {
      var d = document.createElement('div'); d.className = 'srx-toast'; d.innerHTML = html;
      elToasts.appendChild(d); setTimeout(function () { d.remove(); }, 3500);
      if (kind !== 'chat') beep(kind === 'join');
    }
    function netSend(o) { if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(o)); }
    function r1(v) { return Math.round(v * 10) / 10; }
    function sendState() {
      if (!me) return;
      var msg = { type: 'state', s: [r1(me.x), r1(me.y), Math.round(me.a * 1000) / 1000, r1(me.vx), r1(me.vy), me.lap, me.idx, me.done ? 1 : 0, Math.round(me.fwd || 0)] };
      if (net.isAiHost) msg.ai = cars.filter(function (c) { return c.ai && !c.remote; }).map(function (c) { return [c.id, r1(c.x), r1(c.y), Math.round(c.a * 1000) / 1000, r1(c.vx), r1(c.vy), c.lap, c.idx, c.done ? 1 : 0, c.done ? c.finishT : 0]; });
      netSend(msg);
    }
    function pushSnap(c, s, off) {
      var now = performance.now();
      c.buf.push({ t: now, x: s[off], y: s[off + 1], a: s[off + 2], vx: s[off + 3], vy: s[off + 4] });
      if (c.buf.length > 20) c.buf.shift();
      c.lap = s[off + 5]; c.idx = s[off + 6]; c.prog = c.lap * TRACK.N + c.idx;
      if (s[off + 7] && !c.done) { c.done = true; c.finishT = c.ai ? s[off + 8] : raceT; }
    }
    function interp(c) {
      var b = c.buf; if (!b.length) return;
      var rt = performance.now() - 110, i = b.length - 1;
      while (i > 0 && b[i - 1].t > rt) i--;
      var A = b[Math.max(0, i - 1)], B = b[i];
      if (rt >= B.t) { // extrapolación corta
        var e = Math.min(0.2, (rt - B.t) / 1000);
        c.x = B.x + B.vx * e; c.y = B.y + B.vy * e; c.a = B.a; c.vx = B.vx; c.vy = B.vy; return;
      }
      var k = B.t === A.t ? 1 : Math.max(0, Math.min(1, (rt - A.t) / (B.t - A.t)));
      var da = B.a - A.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      c.x = A.x + (B.x - A.x) * k; c.y = A.y + (B.y - A.y) * k; c.a = A.a + da * k;
      c.vx = B.vx; c.vy = B.vy;
    }
    function carById(id) { for (var i = 0; i < cars.length; i++) if (cars[i].id === id) return cars[i]; return null; }
    function goOnline() {
      net.on = true; state = 'lobby';
      ov.innerHTML = '<div class="srx-card"><h1>ONLINE</h1><p>Conectando con la sala…</p></div>';
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      var ws = new WebSocket(proto + '//' + location.host + '/api/snake-racing/ws');
      net.ws = ws;
      ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } onNet(m); };
      ws.onclose = function () {
        if (!alive || net.ws !== ws) return;
        net.ws = null;
        if (net.on) { toast('⚠️ Conexión perdida', 'leave'); net.on = false; if (state === 'lobby') showMenu(); }
      };
    }
    function onNet(m) {
      if (m.type === 'welcome') { net.you = m.you; }
      else if (m.type === 'error') { toast('⚠️ ' + esc(m.detail)); net.on = false; showMenu(); }
      else if (m.type === 'info') { toast('ℹ️ ' + esc(m.detail), 'chat'); }
      else if (m.type === 'toast') {
        var dot = '<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + esc(m.color) + '"></span> ';
        if (m.kind === 'join') toast(dot + '<b>' + esc(m.name) + '</b> ha entrado en la sala', 'join');
        else if (m.kind === 'leave') toast(dot + '<b>' + esc(m.name) + '</b> ha salido', 'leave');
        else toast(dot + '<b>' + esc(m.name) + ':</b> ' + esc(m.text), 'chat');
      }
      else if (m.type === 'lobby') { net.lobby = m; opts.laps = m.laps; opts.diff = m.diff; if (state === 'lobby') renderLobby(); }
      else if (m.type === 'countdown') {
        net.raceId = m.raceId; net.isAiHost = m.aiHost === net.you; opts.laps = m.laps; opts.diff = m.diff;
        var inGrid = m.grid.some(function (g) { return g.id === net.you; });
        if (!inGrid) return;
        startRace(m.grid); countdown = m.inMs / 1000 - 0.5;
      }
      else if (m.type === 'states') {
        if (!cars.length) return;
        for (var id in m.p) { var c = carById(id); if (c && c.remote) pushSnap(c, m.p[id], 0); }
        (m.ai || []).forEach(function (a) { var c = carById(a[0]); if (c && c.remote) pushSnap(c, a, 1); });
      }
      else if (m.type === 'finished') { var fc = carById(m.id); if (fc && fc !== me) { fc.done = true; fc.finishT = m.t; toast('🏁 <b>' + esc(fc.name) + '</b> ha cruzado la meta', 'chat'); } }
      else if (m.type === 'gone') { cars = cars.filter(function (c) { return c.id !== m.id; }); }
      else if (m.type === 'results') { if (m.raceId === net.raceId) showNetResults(m.rows); }
    }
    function renderLobby() {
      var L = net.lobby; if (!L) return;
      var isHost = L.host === net.you, mine = null;
      var li = L.players.map(function (p) {
        if (p.id === net.you) mine = p;
        return '<li><span class="dot" style="background:' + esc(p.color) + '"></span>' + esc(p.name) + (p.id === net.you ? ' <small style="color:#8f99a8">(tú)</small>' : '') + (p.id === L.host ? ' 👑' : '') +
          '<span class="st' + (p.ready ? ' ok' : '') + '">' + (p.inRace ? 'en carrera' : (p.ready ? '✔ Listo' : 'esperando')) + '</span></li>';
      }).join('');
      var ai = Math.max(0, L.max - L.players.length);
      var busy = L.phase !== 'lobby';
      ov.style.display = ''; hud.style.display = 'none';
      ov.innerHTML = '<div class="srx-card" style="min-width:300px"><h1>SALA ONLINE</h1>' +
        '<p>' + L.players.length + ' piloto' + (L.players.length === 1 ? '' : 's') + ' · ' + ai + ' hueco' + (ai === 1 ? '' : 's') + ' con IA · ' + L.laps + ' vueltas</p>' +
        '<ul class="srx-pl">' + li + '</ul>' +
        (busy ? '<p style="color:#ffd60a">Carrera en curso… entrarás en la siguiente.</p>' :
          (isHost ? '<div class="srx-row">' + optBtns('laps', [2, 3, 5], ['2 v', '3 v', '5 v']) + optBtns('diff', [0, 1, 2], ['Fácil', 'Normal', 'Pro']) + '</div>' : '') +
          '<button type="button" class="srx-go srx-ready">' + (mine && mine.ready ? '✖ No listo' : '✔ LISTO') + '</button>' +
          (isHost ? ' <button type="button" class="srx-opt srx-force">⚑ Empezar ya</button>' : '')) +
        '<p style="margin-top:8px;font-size:12px">La salida empieza cuando todos estén listos' + (isHost ? '; como anfitrión puedes forzarla.' : '.') + '</p>' +
        '<button type="button" class="srx-opt srx-leave" style="margin-top:6px">← Salir de la sala</button></div>';
      var b = ov.querySelector('.srx-ready'); if (b) b.onclick = function () { netSend({ type: 'ready', ready: !(mine && mine.ready) }); };
      var f = ov.querySelector('.srx-force'); if (f) f.onclick = function () { netSend({ type: 'start' }); };
      ov.querySelectorAll('.srx-opt[data-o]').forEach(function (o) { o.onclick = function () { opts[o.dataset.o] = +o.dataset.v; netSend({ type: 'config', laps: opts.laps, diff: opts.diff }); }; });
      ov.querySelector('.srx-leave').onclick = function () { net.on = false; if (net.ws) { var w = net.ws; net.ws = null; w.close(); } showMenu(); };
    }
    function showNetResults(rows) {
      state = 'results'; hud.style.display = 'none'; ov.style.display = ''; elReset.style.display = 'none';
      if (me && me.bestLap != null && (best == null || me.bestLap < best)) { best = me.bestLap; try { localStorage.setItem('snkRacingBest', String(best)); } catch (e) {} }
      var html = rows.map(function (r, i) {
        var mine = r.id === net.you;
        return '<tr class="' + (mine ? 'me' : '') + '"><td>' + (i + 1) + '</td><td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + esc(r.color) + '"></span> ' + esc(mine ? 'Tú' : r.name) + (r.ai ? ' <small style="color:#8f99a8">IA</small>' : '') + '</td><td>' + (r.t != null ? fmtTime(r.t * 1000) : '—') + '</td><td>' + fmtTime(r.best != null ? r.best * 1000 : null) + '</td></tr>';
      }).join('');
      ov.innerHTML = '<div class="srx-card"><h1>RESULTADOS</h1><table class="srx-res"><tr style="color:#8f99a8"><td>#</td><td>Piloto</td><td>Total</td><td>Mejor</td></tr>' + html + '</table>' +
        '<button type="button" class="srx-go">↩ Volver a la sala</button></div>';
      ov.querySelector('.srx-go').onclick = function () { state = 'lobby'; renderLobby(); };
    }
    root.__srx = { sim: function (sec, auto) { for (var i = 0; i < sec * 60; i++) { if (auto && me) { var a = aiInput(me); keys.up = a.up; keys.down = a.down; keys.left = a.steer < -0.2; keys.right = a.steer > 0.2; } update(1 / 60); } }, start: startRace, cars: function () { return cars; }, state: function () { return state; } };
    showMenu();
    raf = requestAnimationFrame(loop);

    return function () {
      alive = false; cancelAnimationFrame(raf);
      if (net.ws) { try { net.ws.onclose = null; net.ws.close(); } catch (e) {} }
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('blur', onBlur);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
    };
  }

  global.renderSnakeRacingApp = renderSnakeRacingApp;
})(window);
