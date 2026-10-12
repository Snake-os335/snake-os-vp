/* Snake OS · Snake Racing — carreras multijugador en tiempo real */
(function (global) {
  'use strict';

  var COLORS = ['#34d17a', '#ff6b6b', '#4cc9f0', '#ffd23f', '#c77dff', '#ff8a3d'];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function trackPoint(t, lane, w, h) {
    var cx = w * 0.5;
    var cy = h * 0.52;
    var rx = w * 0.38;
    var ry = h * 0.34;
    var ang = t * Math.PI * 2 - Math.PI / 2;
    var lx = -Math.sin(ang);
    var ly = Math.cos(ang);
    var x = cx + Math.cos(ang) * rx + lx * lane * rx * 0.22;
    var y = cy + Math.sin(ang) * ry + ly * lane * ry * 0.22;
    return { x: x, y: y, ang: ang };
  }

  function renderSnakeRacingApp(container) {
    var root = document.createElement('div');
    root.className = 'snk-race-root';
    root.innerHTML =
      '<div class="snk-race-head">' +
        '<div><strong>🏁 Snake Racing</strong><div class="snk-race-sub">Conéctate con quien esté jugando ahora mismo</div></div>' +
        '<div class="snk-race-net" data-r="net">Desconectado</div>' +
      '</div>' +
      '<canvas class="snk-race-canvas" data-r="canvas" width="640" height="420"></canvas>' +
      '<div class="snk-race-bar">' +
        '<div class="snk-race-status" data-r="status">Esperando pilotos…</div>' +
        '<div class="snk-race-players" data-r="players"></div>' +
      '</div>' +
      '<div class="snk-race-controls">' +
        '<button type="button" class="snk-race-go" data-r="start">🏁 ¡Salida!</button>' +
        '<div class="snk-race-keys">W acelerar · A/D girar · Espacio turbo</div>' +
      '</div>';
    container.innerHTML = '';
    container.appendChild(root);

    var canvas = root.querySelector('[data-r="canvas"]');
    var ctx = canvas.getContext('2d');
    var netEl = root.querySelector('[data-r="net"]');
    var statusEl = root.querySelector('[data-r="status"]');
    var playersEl = root.querySelector('[data-r="players"]');
    var startBtn = root.querySelector('[data-r="start"]');
    var closed = false;
    var ws = null;
    var race = { status: 'lobby', players: [], laps: 3, countdown: 0, winner: null };
    var you = '';
    var keys = { up: false, left: false, right: false };
    var animId = 0;
    var lastSend = 0;

    function wsUrl() {
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return proto + '//' + location.host + '/api/snake-racing/ws';
    }

    function setNet(on, label) {
      netEl.textContent = label || (on ? 'En línea · multijugador' : 'Desconectado');
      netEl.classList.toggle('on', !!on);
    }

    function applyRace(r) {
      if (!r) return;
      race = r;
      var st = race.status || 'lobby';
      if (st === 'countdown') {
        statusEl.textContent = 'Salida en ' + (race.countdown || 3) + '…';
      } else if (st === 'racing') {
        statusEl.textContent = '¡Carrera en marcha! Completa ' + (race.laps || 3) + ' vueltas';
      } else if (st === 'results') {
        statusEl.textContent = race.winner
          ? '🏆 Gana ' + race.winner + ' · nueva carrera en unos segundos'
          : 'Meta · nueva carrera en unos segundos';
      } else {
        statusEl.textContent = race.players.length > 1
          ? race.players.length + ' pilotos en pista · pulsa Salida'
          : 'Esperando más pilotos (comparte Snake Racing con tus amigos)';
      }
      startBtn.disabled = st === 'racing' || st === 'countdown';
      playersEl.innerHTML = (race.players || []).map(function (p) {
        var lap = Math.min(race.laps || 3, Math.floor(p.progress || 0) + (p.finished ? 0 : 1));
        var tag = p.email === you ? ' (tú)' : '';
        var fin = p.finished && p.place ? ' #' + p.place : '';
        return '<span class="snk-race-chip" style="--c:' + esc(p.color || '#34d17a') + '">' +
          esc(p.name) + tag + ' · vuelta ' + lap + '/' + (race.laps || 3) + fin + '</span>';
      }).join('');
    }

    function connect() {
      if (closed) return;
      try { ws = new WebSocket(wsUrl()); } catch (e) { setNet(false); return; }
      ws.onopen = function () { setNet(true); };
      ws.onclose = function () {
        setNet(false);
        ws = null;
        if (!closed) setTimeout(connect, 1800);
      };
      ws.onerror = function () { setNet(false); };
      ws.onmessage = function (ev) {
        var msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg.type === 'error') {
          statusEl.textContent = msg.detail || 'Error de conexión';
        } else if (msg.type === 'welcome') {
          you = msg.you || '';
          applyRace(msg.race);
        } else if (msg.type === 'state') {
          applyRace(msg.race);
        } else if (msg.type === 'join' || msg.type === 'leave') {
          /* state broadcast follows */
        }
      };
    }

    function sendInput() {
      if (!ws || ws.readyState !== 1) return;
      var now = Date.now();
      if (now - lastSend < 70) return;
      lastSend = now;
      var steer = keys.left ? -1 : (keys.right ? 1 : 0);
      ws.send(JSON.stringify({
        type: 'input',
        accel: !!(keys.up),
        steer: steer
      }));
    }

    function drawTrack(w, h) {
      ctx.fillStyle = '#0a1610';
      ctx.fillRect(0, 0, w, h);
      var cx = w * 0.5;
      var cy = h * 0.52;
      ctx.strokeStyle = 'rgba(52,209,122,0.35)';
      ctx.lineWidth = 52;
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.38, h * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 14]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#34d17a';
      ctx.font = 'bold 14px system-ui,sans-serif';
      ctx.fillText('META', cx - 18, cy - h * 0.34 - 8);
    }

    function drawSnake(x, y, ang, color, name, isYou) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang + Math.PI / 2);
      var segs = 6;
      for (var i = 0; i < segs; i++) {
        var t = i / (segs - 1);
        var r = 10 - t * 3;
        ctx.fillStyle = i === 0 ? '#fff' : color;
        ctx.beginPath();
        ctx.arc(0, i * 7, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.font = (isYou ? 'bold ' : '') + '11px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(name, 0, -16);
      ctx.restore();
    }

    function frame() {
      if (closed) return;
      animId = requestAnimationFrame(frame);
      sendInput();
      var w = canvas.width;
      var h = canvas.height;
      drawTrack(w, h);
      (race.players || []).forEach(function (p) {
        var t = (p.progress || 0) / (race.laps || 3);
        t = t - Math.floor(t);
        if (p.finished) t = 0.99;
        var pt = trackPoint(t, p.lane || 0, w, h);
        drawSnake(pt.x, pt.y, pt.ang, p.color || COLORS[0], p.name || '?', p.email === you);
      });
      if (race.status === 'countdown' && race.countdown) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffd23f';
        ctx.font = 'bold 72px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(race.countdown), w / 2, h / 2 + 24);
      }
    }

    function onKey(ev, down) {
      if (ev.code === 'ArrowUp' || ev.code === 'KeyW') keys.up = down;
      if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') keys.left = down;
      if (ev.code === 'ArrowRight' || ev.code === 'KeyD') keys.right = down;
      if (down && ev.code === 'Space') keys.up = true;
      if (!down && ev.code === 'Space') keys.up = false;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(ev.code) >= 0) {
        ev.preventDefault();
      }
    }

    document.addEventListener('keydown', function (e) { onKey(e, true); });
    document.addEventListener('keyup', function (e) { onKey(e, false); });
    startBtn.addEventListener('click', function () {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'start' }));
    });

    if (!document.getElementById('snk-race-css')) {
      var st = document.createElement('style');
      st.id = 'snk-race-css';
      st.textContent =
        '.snk-race-root{display:flex;flex-direction:column;gap:10px;height:100%;padding:10px;box-sizing:border-box;color:#fff;}' +
        '.snk-race-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;}' +
        '.snk-race-sub{font-size:0.78rem;opacity:0.82;margin-top:2px;}' +
        '.snk-race-net{font-size:0.72rem;padding:4px 10px;border-radius:999px;background:rgba(255,107,107,0.25);}' +
        '.snk-race-net.on{background:rgba(52,209,122,0.35);}' +
        '.snk-race-canvas{width:100%;max-width:100%;border-radius:14px;border:1px solid rgba(255,255,255,0.2);background:#06100c;flex:1;min-height:200px;}' +
        '.snk-race-bar{display:flex;flex-direction:column;gap:6px;}' +
        '.snk-race-status{font-size:0.82rem;font-weight:700;}' +
        '.snk-race-players{display:flex;flex-wrap:wrap;gap:6px;}' +
        '.snk-race-chip{font-size:0.72rem;padding:3px 8px;border-radius:999px;background:rgba(0,0,0,0.35);border:1px solid var(--c,#34d17a);}' +
        '.snk-race-controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px;}' +
        '.snk-race-go{padding:8px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.35);background:linear-gradient(135deg,#1f9e57,#34d17a);color:#04170c;font-weight:800;cursor:pointer;}' +
        '.snk-race-go:disabled{opacity:0.45;cursor:not-allowed;}' +
        '.snk-race-keys{font-size:0.72rem;opacity:0.75;}';
      document.head.appendChild(st);
    }

    connect();
    animId = requestAnimationFrame(frame);

    return function cleanup() {
      closed = true;
      cancelAnimationFrame(animId);
      document.removeEventListener('keydown', function () {});
      document.removeEventListener('keyup', function () {});
      try { if (ws) ws.close(); } catch (e) {}
    };
  }

  global.renderSnakeRacingApp = renderSnakeRacingApp;
})(typeof window !== 'undefined' ? window : globalThis);
