/* Snake OS · salvapantallas (2026-10-17). Por perfil (snake-osx.js llama a configure):
   tiempo 1/2/5/10/15/30 min o nunca y tipo: ventana con serpientes (predeterminado), reloj grande,
   burbujas, serpientes de colores (Los Snakes) o degradado. En modo trabajo: reloj estático y ligero.
   Cualquier entrada lo quita, sin bloquear ni recargar. No salta con vídeo/Direct sonando, llamada,
   juego abierto ni un Doganiero Bot trabajando. */
(function () {
  'use strict';
  var IDLE_MS = 60000, last = Date.now(), el = null, on = false, cfg = { id: 'window', timeout: 1, light: false }, stopCur = null, uid = 0;
  /*__SVG_KEEP__*/var SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\" class=\"ss-logo\" aria-hidden=\"true\"><defs><linearGradient id=\"ssbg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3ddc84\"/><stop offset=\"1\" stop-color=\"#0b7a3b\"/></linearGradient><clipPath id=\"sswin\"><path d=\"M70 40 H442 Q472 40 472 70 V442 Q472 472 442 472 H130 Q40 472 40 382 V70 Q40 40 70 40Z\"/></clipPath></defs><g clip-path=\"url(#sswin)\"><rect width=\"512\" height=\"512\" fill=\"url(#ssbg)\"/><g class=\"ss-sn\" style=\"animation-delay:-0.37s;animation-duration:2.7s\"><path d=\"M60 90 c18.0 -25.2 36.0 25.2 54.0 0 s36.0 25.2 54.0 0\" fill=\"none\" stroke=\"#e74c3c\" stroke-width=\"13.5\" stroke-linecap=\"round\"><animate attributeName=\"d\" dur=\"1.23s\" repeatCount=\"indefinite\" values=\"M60 90 c18.0 -25.2 36.0 25.2 54.0 0 s36.0 25.2 54.0 0;M60 90 c18.0 25.2 36.0 -25.2 54.0 0 s36.0 -25.2 54.0 0;M60 90 c18.0 -25.2 36.0 25.2 54.0 0 s36.0 25.2 54.0 0\" calcMode=\"spline\" keySplines=\".45 0 .55 1;.45 0 .55 1\"/></path><g class=\"ss-hd\" style=\"animation-duration:1.23s\"><ellipse cx=\"173.4\" cy=\"90\" rx=\"11.700000000000001\" ry=\"9.0\" fill=\"#e74c3c\"/><circle cx=\"177.0\" cy=\"86.4\" r=\"3.06\" fill=\"#fff\"/><circle cx=\"177.9\" cy=\"86.4\" r=\"1.53\" fill=\"#111\"/><path d=\"M184.20000000000002 91.8 l7.2 0 m-2.7 0 l3.6 -2.7 m-3.6 2.7 l3.6 2.7\" stroke=\"#c0392b\" stroke-width=\"1.8\" fill=\"none\" stroke-linecap=\"round\"/></g></g><g class=\"ss-sn\" style=\"animation-delay:-0.74s;animation-duration:3.0s\"><path d=\"M250 140 c16.0 -22.400000000000002 32.0 22.400000000000002 48.0 0 s32.0 22.400000000000002 48.0 0\" fill=\"none\" stroke=\"#f1c40f\" stroke-width=\"12.0\" stroke-linecap=\"round\"><animate attributeName=\"d\" dur=\"1.36s\" repeatCount=\"indefinite\" values=\"M250 140 c16.0 -22.400000000000002 32.0 22.400000000000002 48.0 0 s32.0 22.400000000000002 48.0 0;M250 140 c16.0 22.400000000000002 32.0 -22.400000000000002 48.0 0 s32.0 -22.400000000000002 48.0 0;M250 140 c16.0 -22.400000000000002 32.0 22.400000000000002 48.0 0 s32.0 22.400000000000002 48.0 0\" calcMode=\"spline\" keySplines=\".45 0 .55 1;.45 0 .55 1\"/></path><g class=\"ss-hd\" style=\"animation-duration:1.36s\"><ellipse cx=\"350.8\" cy=\"140\" rx=\"10.4\" ry=\"8.0\" fill=\"#f1c40f\"/><circle cx=\"354.0\" cy=\"136.8\" r=\"2.72\" fill=\"#fff\"/><circle cx=\"354.8\" cy=\"136.8\" r=\"1.36\" fill=\"#111\"/><path d=\"M360.40000000000003 141.6 l6.4 0 m-2.4000000000000004 0 l3.2 -2.4000000000000004 m-3.2 2.4000000000000004 l3.2 2.4000000000000004\" stroke=\"#c0392b\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\"/></g></g><g class=\"ss-sn\" style=\"animation-delay:-1.11s;animation-duration:2.4s\"><path d=\"M70 190 c20.0 -28.0 40.0 28.0 60.0 0 s40.0 28.0 60.0 0\" fill=\"none\" stroke=\"#3498db\" stroke-width=\"15.0\" stroke-linecap=\"round\"><animate attributeName=\"d\" dur=\"1.49s\" repeatCount=\"indefinite\" values=\"M70 190 c20.0 -28.0 40.0 28.0 60.0 0 s40.0 28.0 60.0 0;M70 190 c20.0 28.0 40.0 -28.0 60.0 0 s40.0 -28.0 60.0 0;M70 190 c20.0 -28.0 40.0 28.0 60.0 0 s40.0 28.0 60.0 0\" calcMode=\"spline\" keySplines=\".45 0 .55 1;.45 0 .55 1\"/></path><g class=\"ss-hd\" style=\"animation-duration:1.49s\"><ellipse cx=\"196.0\" cy=\"190\" rx=\"13.0\" ry=\"10.0\" fill=\"#3498db\"/><circle cx=\"200.0\" cy=\"186.0\" r=\"3.4\" fill=\"#fff\"/><circle cx=\"201.0\" cy=\"186.0\" r=\"1.7\" fill=\"#111\"/><path d=\"M208.0 192.0 l8.0 0 m-3.0 0 l4.0 -3.0 m-4.0 3.0 l4.0 3.0\" stroke=\"#c0392b\" stroke-width=\"2.0\" fill=\"none\" stroke-linecap=\"round\"/></g></g><g class=\"ss-sn\" style=\"animation-delay:-1.48s;animation-duration:2.7s\"><path d=\"M55 300 c17.0 -23.8 34.0 23.8 51.0 0 s34.0 23.8 51.0 0\" fill=\"none\" stroke=\"#e67e22\" stroke-width=\"12.75\" stroke-linecap=\"round\"><animate attributeName=\"d\" dur=\"1.10s\" repeatCount=\"indefinite\" values=\"M55 300 c17.0 -23.8 34.0 23.8 51.0 0 s34.0 23.8 51.0 0;M55 300 c17.0 23.8 34.0 -23.8 51.0 0 s34.0 -23.8 51.0 0;M55 300 c17.0 -23.8 34.0 23.8 51.0 0 s34.0 23.8 51.0 0\" calcMode=\"spline\" keySplines=\".45 0 .55 1;.45 0 .55 1\"/></path><g class=\"ss-hd\" style=\"animation-duration:1.10s\"><ellipse cx=\"162.1\" cy=\"300\" rx=\"11.049999999999999\" ry=\"8.5\" fill=\"#e67e22\"/><circle cx=\"165.5\" cy=\"296.6\" r=\"2.8899999999999997\" fill=\"#fff\"/><circle cx=\"166.35\" cy=\"296.6\" r=\"1.4449999999999998\" fill=\"#111\"/><path d=\"M172.29999999999998 301.7 l6.8 0 m-2.55 0 l3.4 -2.55 m-3.4 2.55 l3.4 2.55\" stroke=\"#c0392b\" stroke-width=\"1.7\" fill=\"none\" stroke-linecap=\"round\"/></g></g><g class=\"ss-sn\" style=\"animation-delay:-1.85s;animation-duration:3.0s\"><path d=\"M250 340 c20.0 -28.0 40.0 28.0 60.0 0 s40.0 28.0 60.0 0\" fill=\"none\" stroke=\"#ecf0f1\" stroke-width=\"15.0\" stroke-linecap=\"round\"><animate attributeName=\"d\" dur=\"1.23s\" repeatCount=\"indefinite\" values=\"M250 340 c20.0 -28.0 40.0 28.0 60.0 0 s40.0 28.0 60.0 0;M250 340 c20.0 28.0 40.0 -28.0 60.0 0 s40.0 -28.0 60.0 0;M250 340 c20.0 -28.0 40.0 28.0 60.0 0 s40.0 28.0 60.0 0\" calcMode=\"spline\" keySplines=\".45 0 .55 1;.45 0 .55 1\"/></path><g class=\"ss-hd\" style=\"animation-duration:1.23s\"><ellipse cx=\"376.0\" cy=\"340\" rx=\"13.0\" ry=\"10.0\" fill=\"#ecf0f1\"/><circle cx=\"380.0\" cy=\"336.0\" r=\"3.4\" fill=\"#fff\"/><circle cx=\"381.0\" cy=\"336.0\" r=\"1.7\" fill=\"#111\"/><path d=\"M388.0 342.0 l8.0 0 m-3.0 0 l4.0 -3.0 m-4.0 3.0 l4.0 3.0\" stroke=\"#c0392b\" stroke-width=\"2.0\" fill=\"none\" stroke-linecap=\"round\"/></g></g><g class=\"ss-sn\" style=\"animation-delay:-2.22s;animation-duration:2.4s\"><path d=\"M80 395 c16.0 -22.400000000000002 32.0 22.400000000000002 48.0 0 s32.0 22.400000000000002 48.0 0\" fill=\"none\" stroke=\"#1abc9c\" stroke-width=\"12.0\" stroke-linecap=\"round\"><animate attributeName=\"d\" dur=\"1.36s\" repeatCount=\"indefinite\" values=\"M80 395 c16.0 -22.400000000000002 32.0 22.400000000000002 48.0 0 s32.0 22.400000000000002 48.0 0;M80 395 c16.0 22.400000000000002 32.0 -22.400000000000002 48.0 0 s32.0 -22.400000000000002 48.0 0;M80 395 c16.0 -22.400000000000002 32.0 22.400000000000002 48.0 0 s32.0 22.400000000000002 48.0 0\" calcMode=\"spline\" keySplines=\".45 0 .55 1;.45 0 .55 1\"/></path><g class=\"ss-hd\" style=\"animation-duration:1.36s\"><ellipse cx=\"180.8\" cy=\"395\" rx=\"10.4\" ry=\"8.0\" fill=\"#1abc9c\"/><circle cx=\"184.00000000000003\" cy=\"391.8\" r=\"2.72\" fill=\"#fff\"/><circle cx=\"184.8\" cy=\"391.8\" r=\"1.36\" fill=\"#111\"/><path d=\"M190.40000000000003 396.6 l6.4 0 m-2.4000000000000004 0 l3.2 -2.4000000000000004 m-3.2 2.4000000000000004 l3.2 2.4000000000000004\" stroke=\"#c0392b\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\"/></g></g><g class=\"ss-sn\" style=\"animation-delay:-2.59s;animation-duration:2.7s\"><path d=\"M270 440 c17.0 -23.8 34.0 23.8 51.0 0 s34.0 23.8 51.0 0\" fill=\"none\" stroke=\"#ff6fb5\" stroke-width=\"12.75\" stroke-linecap=\"round\"><animate attributeName=\"d\" dur=\"1.49s\" repeatCount=\"indefinite\" values=\"M270 440 c17.0 -23.8 34.0 23.8 51.0 0 s34.0 23.8 51.0 0;M270 440 c17.0 23.8 34.0 -23.8 51.0 0 s34.0 -23.8 51.0 0;M270 440 c17.0 -23.8 34.0 23.8 51.0 0 s34.0 23.8 51.0 0\" calcMode=\"spline\" keySplines=\".45 0 .55 1;.45 0 .55 1\"/></path><g class=\"ss-hd\" style=\"animation-duration:1.49s\"><ellipse cx=\"377.09999999999997\" cy=\"440\" rx=\"11.049999999999999\" ry=\"8.5\" fill=\"#ff6fb5\"/><circle cx=\"380.5\" cy=\"436.6\" r=\"2.8899999999999997\" fill=\"#fff\"/><circle cx=\"381.34999999999997\" cy=\"436.6\" r=\"1.4449999999999998\" fill=\"#111\"/><path d=\"M387.3 441.7 l6.8 0 m-2.55 0 l3.4 -2.55 m-3.4 2.55 l3.4 2.55\" stroke=\"#c0392b\" stroke-width=\"1.7\" fill=\"none\" stroke-linecap=\"round\"/></g></g><g transform=\"translate(25,-32)\"><g class=\"ss-sn\" style=\"animation-delay:-2.96s;animation-duration:3.0s\"><path d=\"M260 235 c15.0 -21.0 30.0 21.0 45.0 0 s30.0 21.0 45.0 0\" fill=\"none\" stroke=\"#9b59b6\" stroke-width=\"11.25\" stroke-linecap=\"round\"><animate attributeName=\"d\" dur=\"1.10s\" repeatCount=\"indefinite\" values=\"M260 235 c15.0 -21.0 30.0 21.0 45.0 0 s30.0 21.0 45.0 0;M260 235 c15.0 21.0 30.0 -21.0 45.0 0 s30.0 -21.0 45.0 0;M260 235 c15.0 -21.0 30.0 21.0 45.0 0 s30.0 21.0 45.0 0\" calcMode=\"spline\" keySplines=\".45 0 .55 1;.45 0 .55 1\"/></path><g class=\"ss-hd\" style=\"animation-duration:1.10s\"><ellipse cx=\"354.5\" cy=\"235\" rx=\"9.75\" ry=\"7.5\" fill=\"#9b59b6\"/><circle cx=\"357.5\" cy=\"232.0\" r=\"2.55\" fill=\"#fff\"/><circle cx=\"358.25\" cy=\"232.0\" r=\"1.275\" fill=\"#111\"/><path d=\"M363.5 236.5 l6.0 0 m-2.25 0 l3.0 -2.25 m-3.0 2.25 l3.0 2.25\" stroke=\"#c0392b\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\"/></g></g></g></g><g clip-path=\"url(#sswin)\" fill=\"none\" stroke=\"#06331a\" stroke-width=\"14\" stroke-linecap=\"round\"><path d=\"M256 30 C226 120 286 170 256 256 S226 400 256 482\"/><path d=\"M30 256 C120 226 170 286 256 256 S400 226 482 256\"/></g><path d=\"M70 40 H442 Q472 40 472 70 V442 Q472 472 442 472 H130 Q40 472 40 382 V70 Q40 40 70 40Z\" fill=\"none\" stroke=\"#06331a\" stroke-width=\"10\"/><path d=\"M70 48 H442 Q464 48 464 70 V150 Q260 110 48 170 V70 Q48 48 70 48Z\" fill=\"#fff\" opacity=\".12\"/></svg>";/*__END__*/
  var GAMES = ['snake', 'snake-racing', 'games', 'metaverse', 'doganiero-tv', 'los-snakes'];
  var IDS = ['window', 'clock', 'bubbles', 'family', 'gradient'];
  function playing() {
    var m = document.querySelectorAll('video, audio');
    for (var i = 0; i < m.length; i++) { var x = m[i]; if (!x.paused && !x.ended && x.readyState > 2) return true; }
    return false;
  }
  function busy() {
    if (document.hidden) return true;
    var b = document.body; if (!b) return true;
    var desk = document.getElementById('desktop'); if (!desk || desk.classList.contains('hidden')) return true;
    if (playing()) return true;
    if (document.querySelector('#dcCallDock, #dcCallMini, #dcCallBanner, .dph-incall, .dph-call')) return true;
    if (document.querySelector('.dbp-stop')) return true; // bot usando tu escritorio
    if (document.querySelector('.osx-modal, #osTutorial')) return true; // asistente Kids / tutorial
    var st = document.querySelectorAll('.mos-status[data-status]');
    for (var i = 0; i < st.length; i++) if ((st[i].textContent || '').trim() && st[i].offsetParent !== null) return true;
    for (var g = 0; g < GAMES.length; g++) { var w = document.getElementById('win-' + GAMES[g]); if (w && !w.classList.contains('minimized') && w.offsetParent !== null) return true; }
    var f = document.querySelector('iframe[src*="youtube"], iframe[src*="direct"]'); if (f && f.offsetParent !== null) return true;
    return false;
  }
  function css() {
    if (document.getElementById('ssCss')) return;
    var s = document.createElement('style'); s.id = 'ssCss';
    s.textContent =
      '#snkSaver{position:fixed;inset:0;z-index:2147483000;background:#020403;opacity:0;transition:opacity .8s ease;cursor:none;overflow:hidden}' +
      '#snkSaver.on{opacity:1}body.osx-work #snkSaver{transition:none;opacity:1}' +
      '.ss-stage{position:absolute;inset:0;overflow:hidden;background:radial-gradient(circle at 50% 45%,#0d2a1a 0,#050c08 60%,#020403 100%);display:flex;align-items:center;justify-content:center;color:#fff;font-family:var(--snake-font,system-ui,sans-serif)}' +
      '.ss-stage .ss-wrap{width:min(46%,46vmin,420px);aspect-ratio:1;animation:ssFloat 9s ease-in-out infinite;filter:drop-shadow(0 18px 40px rgba(0,0,0,.6)) drop-shadow(0 0 30px rgba(61,220,132,.18))}' +
      '.ss-stage.small .ss-wrap{width:58%;filter:none}' +
      '.ss-stage svg{width:100%;height:100%;display:block}' +
      '.ss-stage .ss-sn{animation:ssSlither 2.6s ease-in-out infinite;transform-box:fill-box}' +
      '.ss-stage .ss-hd{animation:ssHead 1.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}' +
      '.ss-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
      '.ss-clock{position:absolute;text-align:center;line-height:1;white-space:nowrap;transition:left 2s ease,top 2s ease}' +
      '.ss-clock b{display:block;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:#eafff2;text-shadow:0 0 40px rgba(61,220,132,.35)}' +
      '.ss-clock span{display:block;margin-top:.4em;opacity:.7;font-weight:600;text-transform:capitalize}' +
      '.ss-static{background:#0b0b0c}.ss-static .ss-clock b{color:#d6d6d8;text-shadow:none}.ss-static .ss-clock{transition:none}' +
      '.ss-grad{background:linear-gradient(120deg,#0f5132,#1f6feb,#8b5cf6,#ec4899,#f59e0b,#0f5132);background-size:400% 400%;animation:ssGrad 30s ease infinite}' +
      '.ss-grad .ss-clock b{text-shadow:0 2px 20px rgba(0,0,0,.35);color:#fff}' +
      '@keyframes ssGrad{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}' +
      '@keyframes ssSlither{0%,100%{transform:translateX(-7px)}50%{transform:translateX(9px)}}' +
      '@keyframes ssHead{0%,100%{transform:translateY(-1.5px) rotate(-4deg)}50%{transform:translateY(1.5px) rotate(4deg)}}' +
      '@keyframes ssFloat{0%,100%{transform:translate(0,0)}25%{transform:translate(4%,-3%)}50%{transform:translate(0,3%)}75%{transform:translate(-4%,-2%)}}' +
      '@media (prefers-reduced-motion:reduce){.ss-stage .ss-wrap,.ss-stage .ss-sn,.ss-stage .ss-hd,.ss-grad{animation:none}}';
    document.head.appendChild(s);
  }
  function fit(cv) { var r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.max(1, Math.round(r.width * d)); cv.height = Math.max(1, Math.round(r.height * d)); return d; }
  function loop(fn) { var raf = 0, alive = true; function f(t) { if (!alive) return; fn(t); raf = requestAnimationFrame(f); } raf = requestAnimationFrame(f); return function () { alive = false; cancelAnimationFrame(raf); }; }
  function clockInto(stage, small, moving) {
    var c = document.createElement('div'); c.className = 'ss-clock'; stage.appendChild(c);
    var big = small ? 26 : Math.max(64, Math.min(200, window.innerWidth / 6));
    function tick() {
      var d = new Date();
      c.innerHTML = '<b style="font-size:' + big + 'px">' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + '</b><span style="font-size:' + Math.round(big / 6.5) + 'px">' + d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) + '</span>';
    }
    function place(center) {
      var W = stage.clientWidth || window.innerWidth, H = stage.clientHeight || window.innerHeight, w = c.offsetWidth, h = c.offsetHeight;
      var x = center || !moving ? (W - w) / 2 : Math.random() * Math.max(0, W - w), y = center || !moving ? (H - h) / 2 : Math.random() * Math.max(0, H - h);
      c.style.left = Math.round(x) + 'px'; c.style.top = Math.round(y) + 'px';
    }
    tick(); place(true);
    var t1 = setInterval(tick, small ? 10000 : 1000), t2 = moving ? setInterval(function () { place(false); }, 20000) : 0;
    var t0 = setTimeout(function () { place(true); }, 50);
    return function () { clearInterval(t1); clearInterval(t2); clearTimeout(t0); };
  }
  function buildWindow(stage) {
    uid++;
    var svg = SVG.replace(/ssbg/g, 'ssbg' + uid).replace(/sswin/g, 'sswin' + uid);
    stage.innerHTML = '<div class="ss-wrap">' + svg + '</div>';
    return function () {};
  }
  function buildBubbles(stage, small) {
    stage.style.background = 'radial-gradient(circle at 50% 110%,#0f3b5a,#06121f 70%)';
    var cv = document.createElement('canvas'); stage.appendChild(cv);
    var ctx = cv.getContext('2d'), d = fit(cv), B = [], N = small ? 14 : 38, cols = ['#3ddc84', '#4aa3ff', '#ff6fb5', '#ffd32a', '#b07cff', '#1abc9c'];
    function nb(init) { var r = (small ? 4 : 14) + Math.random() * (small ? 10 : 46); return { x: Math.random() * cv.width, y: init ? Math.random() * cv.height : cv.height + r * d, r: r * d, v: (0.25 + Math.random() * 0.7) * d * (small ? 0.6 : 1), w: Math.random() * 6.28, c: cols[(Math.random() * cols.length) | 0] }; }
    for (var i = 0; i < N; i++) B.push(nb(true));
    var onR = function () { d = fit(cv); }; window.addEventListener('resize', onR);
    var stop = loop(function () {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (var i = 0; i < B.length; i++) {
        var b = B[i]; b.y -= b.v; b.w += 0.01; var x = b.x + Math.sin(b.w) * 12 * d;
        if (b.y < -b.r) B[i] = nb(false);
        var g = ctx.createRadialGradient(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.1, x, b.y, b.r);
        g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.35, b.c + '66'); g.addColorStop(1, b.c + '22');
        ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, 6.2832); ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = 1.5 * d; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
      }
    });
    return function () { stop(); window.removeEventListener('resize', onR); };
  }
  function buildFamily(stage, small) {
    stage.style.background = 'linear-gradient(#bfe9ff 0,#e9fbff 55%,#9be27a 55.2%,#5fbf4a 100%)';
    var cv = document.createElement('canvas'); stage.appendChild(cv);
    var ctx = cv.getContext('2d'), d = fit(cv);
    var cols = [['#e74c3c', '#ff8a7a'], ['#f1c40f', '#ffe27a'], ['#3498db', '#8fd0ff'], ['#9b59b6', '#d6a8f0'], ['#ff6fb5', '#ffc1e0'], ['#1abc9c', '#8ff0dc'], ['#e67e22', '#ffc08a']];
    var S = [];
    function ns(i, init) {
      var k = small ? 0.45 : 1, dir = Math.random() < 0.5 ? 1 : -1, len = (9 + (Math.random() * 7 | 0));
      return { dir: dir, x: init ? Math.random() * cv.width : (dir > 0 ? -len * 18 * k * d : cv.width + len * 18 * k * d), y: cv.height * (0.6 + Math.random() * 0.34), k: k * (0.8 + Math.random() * 0.5), len: len, sp: (0.6 + Math.random() * 0.9) * d, ph: Math.random() * 6.28, c: cols[i % cols.length] };
    }
    for (var i = 0; i < (small ? 4 : 7); i++) S.push(ns(i, true));
    var onR = function () { d = fit(cv); }; window.addEventListener('resize', onR);
    var stop = loop(function (t) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      S.sort(function (a, b) { return a.y - b.y; });
      for (var i = 0; i < S.length; i++) {
        var s = S[i], seg = 14 * s.k * d, rad = 9 * s.k * d; s.x += s.sp * s.dir; s.ph += 0.08;
        if ((s.dir > 0 && s.x - s.len * seg > cv.width) || (s.dir < 0 && s.x + s.len * seg < 0)) { S[i] = ns(i, false); continue; }
        for (var j = s.len; j >= 0; j--) {
          var px = s.x - j * seg * s.dir, py = s.y + Math.sin(s.ph - j * 0.55) * 7 * s.k * d, r = rad * (j === 0 ? 1.25 : 1 - j / (s.len * 2.2));
          ctx.beginPath(); ctx.arc(px, py + 3 * d, r, 0, 6.2832); ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fill();
          ctx.beginPath(); ctx.arc(px, py, r, 0, 6.2832); ctx.fillStyle = j % 2 ? s.c[0] : s.c[1]; ctx.fill();
          if (j === 0) {
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + r * 0.35 * s.dir, py - r * 0.35, r * 0.34, 0, 6.2832); ctx.fill();
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(px + r * 0.45 * s.dir, py - r * 0.35, r * 0.16, 0, 6.2832); ctx.fill();
            ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2 * d * s.k; ctx.beginPath(); ctx.moveTo(px + r * s.dir, py + r * 0.2); ctx.lineTo(px + (r + 7 * s.k * d) * s.dir, py + r * 0.2 + Math.sin(t / 90) * 2 * d); ctx.stroke();
          }
        }
      }
    });
    return function () { stop(); window.removeEventListener('resize', onR); };
  }
  function buildGradient(stage, small) { stage.classList.add('ss-grad'); return clockInto(stage, small, false); }
  function build(stage, id, small) {
    stage.classList.add('ss-stage'); if (small) stage.classList.add('small');
    if (id === 'static') { stage.classList.add('ss-static'); return clockInto(stage, small, false); }
    if (id === 'clock') return clockInto(stage, small, !small);
    if (id === 'bubbles') return buildBubbles(stage, small);
    if (id === 'family') return buildFamily(stage, small);
    if (id === 'gradient') return buildGradient(stage, small);
    return buildWindow(stage);
  }
  function show(force) {
    if (on) return; if (!force && busy()) return; css(); on = true;
    el = document.createElement('div'); el.id = 'snkSaver'; el.setAttribute('aria-hidden', 'true');
    var stage = document.createElement('div'); el.appendChild(stage);
    document.body.appendChild(el);
    stopCur = build(stage, cfg.light ? 'static' : cfg.id, false);
    if (cfg.light) el.classList.add('on');
    else requestAnimationFrame(function () { requestAnimationFrame(function () { if (el) el.classList.add('on'); }); });
    last = Date.now();
  }
  function hide() {
    if (!on) return; on = false;
    var x = el, st = stopCur; el = null; stopCur = null; if (!x) return;
    if (cfg.light) { if (st) st(); x.remove(); return; }
    x.classList.remove('on'); setTimeout(function () { if (st) st(); if (x.parentNode) x.parentNode.removeChild(x); }, 450);
  }
  function preview(container, id, small) {
    css(); container.innerHTML = '';
    var stage = document.createElement('div'); stage.style.position = 'absolute'; stage.style.inset = '0'; container.appendChild(stage);
    var stop = build(stage, IDS.indexOf(id) >= 0 || id === 'static' ? id : 'window', small);
    return function () { try { stop(); } catch (e) {} stage.remove(); };
  }
  function configure(o) {
    o = o || {};
    if (IDS.indexOf(o.id) >= 0) cfg.id = o.id;
    if (typeof o.timeout === 'number' && o.timeout >= 0) cfg.timeout = o.timeout;
    cfg.light = !!o.light;
    IDLE_MS = cfg.timeout ? cfg.timeout * 60000 : Infinity;
  }
  var lastMove = 0;
  function act(e) {
    if (e.type === 'mousemove') { var n = Date.now(); if (!on && n - lastMove < 250) return; lastMove = n; }
    last = Date.now();
    if (on) { hide(); if (e && e.type !== 'mousemove' && e.type !== 'pointermove' && e.cancelable) { e.preventDefault(); e.stopPropagation(); } }
  }
  ['mousemove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (t) { window.addEventListener(t, act, { capture: true, passive: t === 'mousemove' || t === 'wheel' || t === 'touchstart' }); });
  document.addEventListener('visibilitychange', function () { last = Date.now(); });
  setInterval(function () {
    if (on) { if (busy() && !document.hidden) hide(); return; }
    if (IDLE_MS !== Infinity && Date.now() - last >= IDLE_MS) { if (busy()) last = Date.now() - IDLE_MS + 5000; else show(); }
  }, 1000);
  window.snkScreensaver = { show: show, hide: hide, isOn: function () { return on; }, busy: busy, configure: configure, preview: preview, savers: IDS.slice(), config: function () { return Object.assign({}, cfg); } };
})();
