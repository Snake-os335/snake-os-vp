/* Snake OS · Snake Racing — solo+IA al instante, multijugador en vivo */
(function (global) {
  'use strict';

  var LOGO_URL = '/static/assets/snake-racing-logo.jpg?v=202610121940';
  var LAPS = 3;
  var AI_EMAIL = '__snake_racing_ai__';
  var AI_ASK_MS = 1800;
  var PAL = {
    lime: '#A2D729', yellow: '#F9E400', orange: '#F78C00', red: '#E63946',
    purple: '#7209B7', blue: '#4361EE', track: '#1A1A1A', silver: '#C0C0C0',
    panel: '#B54D13', panelDark: '#8B3A0F'
  };
  var COLORS = [PAL.lime, PAL.yellow, PAL.orange, PAL.red, PAL.purple, PAL.blue];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  function aiHeuristic(player) {
    var lane = player.lane || 0;
    var steer = 0;
    if (lane > 0.55) steer = -1;
    else if (lane < -0.55) steer = 1;
    else if (Math.abs(lane) > 0.2) steer = lane > 0 ? -1 : 1;
    else steer = Math.random() > 0.5 ? 1 : -1;
    return { steer: steer, accel: (player.progress || 0) < LAPS * 0.92 && Math.random() > 0.1 };
  }

  /** Jugador en pista: física local + estado de red. */
  function Player(opts) {
    this.email = opts.email || 'local-you';
    this.name = opts.name || 'Tú';
    this.color = opts.color || PAL.lime;
    this.isHuman = !!opts.isHuman;
    this.isAi = !!opts.isAi;
    this.progress = 0;
    this.lane = typeof opts.lane === 'number' ? opts.lane : (Math.random() * 0.7 - 0.35);
    this.speed = 0;
    this.steer = 0;
    this.accel = !!opts.isAi;
    this.finished = false;
    this.place = null;
  }

  Player.prototype.applyInput = function (input) {
    if (this.finished || this.isAi) return;
    var steer = input.steer;
    if (steer !== -1 && steer !== 0 && steer !== 1) steer = 0;
    this.steer = steer;
    this.accel = !!input.accel;
  };

  Player.prototype.step = function (dt) {
    if (this.finished) return;
    var lane = this.lane;
    lane += this.steer * dt * 1.35;
    if (lane < -1) lane = -1;
    if (lane > 1) lane = 1;
    this.lane = lane;
    var speed = this.speed;
    if (this.accel) speed += dt * 0.95;
    else speed -= dt * 0.45;
    if (speed < 0) speed = 0;
    if (speed > 0.55) speed = 0.55;
    var curvePen = Math.abs(lane) * 0.08;
    var prog = this.progress + speed * dt * (1 / LAPS) * (1 - curvePen);
    this.speed = speed;
    this.progress = prog;
    if (prog >= LAPS) {
      this.finished = true;
      this.speed = 0;
    }
  };

  Player.prototype.toPublic = function () {
    return {
      email: this.email,
      name: this.name,
      color: this.color,
      progress: this.progress,
      lane: this.lane,
      speed: this.speed,
      finished: this.finished,
      place: this.place,
      isAi: this.isAi
    };
  };

  Player.fromPublic = function (p) {
    var pl = new Player({
      email: p.email,
      name: p.name,
      color: p.color,
      isHuman: false,
      isAi: !!p.isAi || p.email === AI_EMAIL
    });
    pl.progress = p.progress || 0;
    pl.lane = p.lane || 0;
    pl.speed = p.speed || 0;
    pl.finished = !!p.finished;
    pl.place = p.place;
    return pl;
  };

  function AiDriver(player, getOpponents) {
    this.player = player;
    this.getOpponents = getOpponents;
    this.lastAsk = 0;
    this.pending = false;
    this.plan = { steer: 0, accel: true };
  }

  AiDriver.prototype.tick = function (now) {
    var p = this.player;
    if (p.finished) return;
    if (now - this.lastAsk < AI_ASK_MS) {
      p.steer = this.plan.steer;
      p.accel = this.plan.accel;
      return;
    }
    if (this.pending) {
      p.steer = this.plan.steer;
      p.accel = this.plan.accel;
      return;
    }
    this.lastAsk = now;
    this.pending = true;
    var self = this;
    var fallback = aiHeuristic(p);
    this.plan = fallback;
    p.steer = fallback.steer;
    p.accel = fallback.accel;
    var opponents = (this.getOpponents() || []).slice(0, 4);
    var prompt =
      'Snake Racing. JSON only {"steer":-1|0|1,"accel":bool}. ' +
      'Bot lane=' + (p.lane || 0).toFixed(2) +
      ' speed=' + (p.speed || 0).toFixed(2) +
      ' progress=' + (p.progress || 0).toFixed(2) + '/' + LAPS +
      '. Rivals: ' + JSON.stringify(opponents);
    fetch('/api/ai/ask', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt,
        system: 'Racing AI. Reply with compact JSON steering only.',
        tier: 'fast',
        max_output_tokens: 64,
        json_schema: {
          type: 'object',
          properties: { steer: { type: 'integer' }, accel: { type: 'boolean' } },
          required: ['steer', 'accel'],
          additionalProperties: false
        }
      })
    }).then(function (res) {
      if (!res.ok) throw new Error('ask');
      return res.json();
    }).then(function (data) {
      var text = (data && data.text) ? String(data.text).trim() : '';
      if (!text) return;
      var parsed;
      try { parsed = JSON.parse(text); } catch (e) { return; }
      if (parsed.steer !== -1 && parsed.steer !== 0 && parsed.steer !== 1) return;
      self.plan = { steer: parsed.steer, accel: !!parsed.accel };
    }).catch(function () {
      self.plan = aiHeuristic(self.player);
    }).finally(function () {
      self.pending = false;
    });
  };

  function LocalRace() {
    this.status = 'racing';
    this.laps = LAPS;
    this.countdown = 0;
    this.winner = null;
    this.human = new Player({ email: 'local-you', name: 'Tú', color: PAL.lime, isHuman: true });
    this.ai = new Player({ email: AI_EMAIL, name: 'Copiloto IA', color: PAL.orange, isAi: true });
    this.aiDriver = new AiDriver(this.ai, function () {
      return [this.human.toPublic()];
    }.bind(this));
    this.players = [this.human, this.ai];
    this.startedAt = Date.now();
  }

  LocalRace.prototype.snapshot = function () {
    return {
      status: this.status,
      laps: this.laps,
      countdown: this.countdown,
      winner: this.winner,
      players: this.players.map(function (p) { return p.toPublic(); })
    };
  };

  LocalRace.prototype.step = function (dt, now) {
    if (this.status !== 'racing') return;
    this.aiDriver.tick(now || Date.now());
    var finishedBefore = this.players.filter(function (p) { return p.finished; }).length;
    this.players.forEach(function (p) { p.step(dt); });
    var finishedAfter = this.players.filter(function (p) { return p.finished; }).length;
    if (finishedBefore < this.players.length && finishedAfter >= this.players.length) {
      this.status = 'results';
      var sorted = this.players.slice().sort(function (a, b) {
        return (a.progress || 0) > (b.progress || 0) ? -1 : 1;
      });
      sorted.forEach(function (p, i) { p.place = i + 1; });
      this.winner = sorted[0] ? sorted[0].name : null;
    }
  };

  function renderSnakeRacingApp(container) {
    var root = document.createElement('div');
    root.className = 'snk-race-root';
    root.setAttribute('data-keyboard-game', '1');
    root.innerHTML =
      '<div class="snk-race-head">' +
        '<div class="snk-race-brand">' +
          '<img class="snk-race-logo" src="' + LOGO_URL + '" alt="Snake Racing">' +
          '<div class="snk-race-brand-text">' +
            '<span class="snk-race-title">Snake Racing</span>' +
            '<div class="snk-race-sub">Carrera instantánea vs Copiloto IA · rivales en línea se unen en vivo</div>' +
          '</div>' +
        '</div>' +
        '<div class="snk-race-net" data-r="net">Modo local</div>' +
      '</div>' +
      '<canvas class="snk-race-canvas" data-r="canvas" width="640" height="420"></canvas>' +
      '<div class="snk-race-bar">' +
        '<div class="snk-race-hud-row">' +
          '<img class="snk-race-mark" src="' + LOGO_URL + '" alt="" aria-hidden="true">' +
          '<div class="snk-race-status" data-r="status">¡Salida!</div>' +
        '</div>' +
        '<div class="snk-race-players" data-r="players"></div>' +
      '</div>' +
      '<div class="snk-race-controls">' +
        '<button type="button" class="snk-race-go" data-r="start" hidden>🏁 Otra carrera</button>' +
        '<div class="snk-race-keys">W / ↑ acelerar · A/D girar · Espacio turbo</div>' +
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
    var online = false;
    var you = '';
    var race = new LocalRace().snapshot();
    var localRace = new LocalRace();
    var keys = { up: false, left: false, right: false };
    var animId = 0;
    var lastSend = 0;
    var lastFrame = 0;
    var midRaceNotice = '';

    function wsUrl() {
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return proto + '//' + location.host + '/api/snake-racing/ws';
    }

    function setNet(on, label) {
      netEl.textContent = label || (on ? 'En línea · rivales en pista' : 'Modo local · IA activa');
      netEl.classList.toggle('on', !!on);
    }

    function displayRace() {
      return online ? race : localRace.snapshot();
    }

    function applyRace(r) {
      if (!r) return;
      race = r;
      updateHud();
    }

    function updateHud() {
      var view = displayRace();
      var st = view.status || 'racing';
      if (st === 'countdown') {
        statusEl.textContent = 'Salida en ' + (view.countdown || 3) + '…';
      } else if (st === 'racing') {
        statusEl.textContent = midRaceNotice || ('¡Carrera en marcha! ' + (view.laps || LAPS) + ' vueltas');
      } else if (st === 'results') {
        statusEl.textContent = view.winner
          ? '🏆 Gana ' + view.winner + ' · nueva carrera en unos segundos'
          : 'Meta · nueva carrera en unos segundos';
      } else {
        statusEl.textContent = '¡Carrera en marcha!';
      }
      startBtn.hidden = st !== 'results' || online;
      startBtn.disabled = st === 'racing' || st === 'countdown';
      playersEl.innerHTML = (view.players || []).map(function (p) {
        var lap = Math.min(view.laps || LAPS, Math.floor(p.progress || 0) + (p.finished ? 0 : 1));
        var tag = '';
        if (p.email === you || (p.email === 'local-you' && !online)) tag = ' (tú)';
        if (p.isAi || p.email === AI_EMAIL) tag = ' 🤖';
        var fin = p.finished && p.place ? ' #' + p.place : '';
        return '<span class="snk-race-chip" style="--c:' + esc(p.color || PAL.lime) + '">' +
          esc(p.name) + tag + ' · vuelta ' + lap + '/' + (view.laps || LAPS) + fin + '</span>';
      }).join('');
    }

    function connect() {
      if (closed) return;
      try { ws = new WebSocket(wsUrl()); } catch (e) { setNet(false); return; }
      ws.onopen = function () { setNet(true); };
      ws.onclose = function () {
        online = false;
        you = '';
        midRaceNotice = '';
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
          online = true;
          you = msg.you || '';
          if (msg.midRaceJoin) {
            midRaceNotice = 'Te uniste a la carrera en curso — ¡alcanza a los demás!';
            setTimeout(function () { midRaceNotice = ''; updateHud(); }, 6000);
          }
          applyRace(msg.race);
          setNet(true);
        } else if (msg.type === 'state') {
          online = true;
          applyRace(msg.race);
        } else if (msg.type === 'join') {
          if (msg.player && msg.player.email && msg.player.email !== you && msg.player.email !== AI_EMAIL) {
            midRaceNotice = esc(msg.player.name || 'Piloto') + ' se unió a la pista';
            setTimeout(function () { midRaceNotice = ''; updateHud(); }, 5000);
            updateHud();
          }
        }
      };
    }

    function sendInput() {
      if (!online || !ws || ws.readyState !== 1) return;
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

    function localInput() {
      if (online) return;
      localRace.human.applyInput({
        accel: !!keys.up,
        steer: keys.left ? -1 : (keys.right ? 1 : 0)
      });
    }

    function drawTrack(w, h) {
      ctx.fillStyle = PAL.track;
      ctx.fillRect(0, 0, w, h);
      var cx = w * 0.5;
      var cy = h * 0.52;
      var trackGrad = ctx.createLinearGradient(0, 0, w, h);
      trackGrad.addColorStop(0, PAL.lime);
      trackGrad.addColorStop(0.35, PAL.orange);
      trackGrad.addColorStop(0.65, PAL.red);
      trackGrad.addColorStop(1, PAL.blue);
      ctx.strokeStyle = trackGrad;
      ctx.lineWidth = 52;
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.38, h * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(192,192,192,0.28)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 14]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = PAL.yellow;
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
        ctx.fillStyle = i === 0 ? PAL.yellow : color;
        ctx.beginPath();
        ctx.arc(0, i * 7, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = PAL.silver;
      ctx.font = (isYou ? 'bold ' : '') + '11px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(name, 0, -16);
      ctx.restore();
    }

    function frame(ts) {
      if (closed) return;
      animId = requestAnimationFrame(frame);
      if (!lastFrame) lastFrame = ts;
      var dt = Math.min(0.05, (ts - lastFrame) / 1000);
      lastFrame = ts;

      localInput();
      sendInput();

      if (!online) {
        if (localRace.status === 'results') {
          /* espera reinicio automático local */
        } else {
          localRace.step(dt, ts);
        }
        if (localRace.status === 'results' && !localRace._restartScheduled) {
          localRace._restartScheduled = true;
          setTimeout(function () {
            if (!closed && !online) {
              localRace = new LocalRace();
              localRace._restartScheduled = false;
              updateHud();
            }
          }, 8000);
        }
      }

      updateHud();

      var w = canvas.width;
      var h = canvas.height;
      drawTrack(w, h);
      var view = displayRace();
      (view.players || []).forEach(function (p) {
        var t = (p.progress || 0) / (view.laps || LAPS);
        t = t - Math.floor(t);
        if (p.finished) t = 0.99;
        var pt = trackPoint(t, p.lane || 0, w, h);
        var isYou = online ? (p.email === you) : (p.email === 'local-you' || p.email === you);
        drawSnake(pt.x, pt.y, pt.ang, p.color || COLORS[0], p.name || '?', isYou);
      });
      if (view.status === 'countdown' && view.countdown) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = PAL.yellow;
        ctx.font = 'bold 72px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(view.countdown), w / 2, h / 2 + 24);
      }
    }

    function onKeyDown(ev) { onKey(ev, true); }
    function onKeyUp(ev) { onKey(ev, false); }

    function onKey(ev, down) {
      if (!root.isConnected) return;
      if (ev.code === 'ArrowUp' || ev.code === 'KeyW') keys.up = down;
      if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') keys.left = down;
      if (ev.code === 'ArrowRight' || ev.code === 'KeyD') keys.right = down;
      if (down && ev.code === 'Space') keys.up = true;
      if (!down && ev.code === 'Space') keys.up = false;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(ev.code) >= 0) {
        ev.preventDefault();
      }
    }

    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    startBtn.addEventListener('click', function () {
      if (online) {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'start' }));
      } else {
        localRace = new LocalRace();
        updateHud();
      }
    });

    if (!document.getElementById('snk-race-css')) {
      var st = document.createElement('style');
      st.id = 'snk-race-css';
      st.textContent =
        '.snk-race-root{' +
          '--sr-lime:#A2D729;--sr-yellow:#F9E400;--sr-orange:#F78C00;--sr-red:#E63946;' +
          '--sr-purple:#7209B7;--sr-blue:#4361EE;--sr-track:#1A1A1A;--sr-silver:#C0C0C0;--sr-panel:#B54D13;' +
          'display:flex;flex-direction:column;gap:10px;height:100%;padding:10px;box-sizing:border-box;color:#fff;' +
          'background:linear-gradient(165deg,rgba(181,77,19,0.42) 0%,rgba(26,26,26,0.94) 48%,rgba(15,15,15,0.98) 100%);' +
          'border-radius:12px;' +
        '}' +
        '.snk-race-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;}' +
        '.snk-race-brand{display:flex;align-items:center;gap:10px;min-width:0;}' +
        '.snk-race-logo{width:52px;height:52px;object-fit:contain;border-radius:8px;flex-shrink:0;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45));}' +
        '.snk-race-title{display:block;font-weight:800;font-size:1.05rem;line-height:1.15;' +
          'background:linear-gradient(90deg,var(--sr-lime),var(--sr-yellow),var(--sr-orange),var(--sr-red),var(--sr-purple),var(--sr-blue));' +
          '-webkit-background-clip:text;background-clip:text;color:transparent;}' +
        '.snk-race-sub{font-size:0.78rem;opacity:0.88;margin-top:2px;color:var(--sr-silver);}' +
        '.snk-race-net{font-size:0.72rem;padding:4px 10px;border-radius:999px;background:rgba(230,57,70,0.28);border:1px solid rgba(230,57,70,0.45);}' +
        '.snk-race-net.on{background:rgba(162,215,41,0.28);border-color:rgba(162,215,41,0.55);}' +
        '.snk-race-canvas{width:100%;max-width:100%;border-radius:14px;border:2px solid rgba(247,140,0,0.45);' +
          'box-shadow:0 0 0 1px rgba(192,192,192,0.12) inset;background:var(--sr-track);flex:1;min-height:200px;}' +
        '.snk-race-bar{display:flex;flex-direction:column;gap:6px;padding:6px 8px;border-radius:10px;background:rgba(139,58,15,0.35);border:1px solid rgba(247,140,0,0.25);}' +
        '.snk-race-hud-row{display:flex;align-items:center;gap:8px;min-width:0;}' +
        '.snk-race-mark{width:22px;height:22px;object-fit:contain;border-radius:4px;flex-shrink:0;opacity:0.95;}' +
        '.snk-race-status{font-size:0.82rem;font-weight:700;color:var(--sr-yellow);flex:1;min-width:0;}' +
        '.snk-race-players{display:flex;flex-wrap:wrap;gap:6px;}' +
        '.snk-race-chip{font-size:0.72rem;padding:3px 8px;border-radius:999px;background:rgba(26,26,26,0.55);border:1px solid var(--c,var(--sr-lime));}' +
        '.snk-race-controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px;}' +
        '.snk-race-go{padding:8px 16px;border-radius:10px;border:1px solid rgba(249,228,0,0.55);' +
          'background:linear-gradient(135deg,var(--sr-orange),var(--sr-yellow));color:#1A1A1A;font-weight:800;cursor:pointer;' +
          'box-shadow:0 2px 8px rgba(247,140,0,0.35);}' +
        '.snk-race-go:disabled{opacity:0.45;cursor:not-allowed;box-shadow:none;}' +
        '.snk-race-keys{font-size:0.72rem;opacity:0.8;color:var(--sr-silver);}';
      document.head.appendChild(st);
    }

    updateHud();
    connect();
    animId = requestAnimationFrame(frame);

    return function cleanup() {
      closed = true;
      cancelAnimationFrame(animId);
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('keyup', onKeyUp);
      try { if (ws) ws.close(); } catch (e) {}
    };
  }

  global.renderSnakeRacingApp = renderSnakeRacingApp;
})(typeof window !== 'undefined' ? window : globalThis);
