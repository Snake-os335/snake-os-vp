(function(){
  var T = SRA.T, EN = SRA.en, $s = function(s){ return document.querySelector(s); };
  var game = new Chess(), board = null, sf = null, thinking = false, st = { color: 'w', level: 4, pgn: '', mode: 'beginner', arrow: true }, ready = false, pend = null;
  var LV = [null, [0, 80, 1], [2, 150, 2], [4, 250, 4], [6, 350, 6], [8, 500, 8], [10, 700, 10], [13, 900, 12], [16, 1200, 14], [18, 1600, 18], [20, 2200, 22]];
  function save(){ st.pgn = game.pgn(); SRA.save('game', st); }
  SRA.onClose(function(){ save(); try { if (coachW) coachW.terminate(); } catch (e) {} });
  function status(){
    var t, turn = game.turn() === 'w' ? T('blancas', 'White') : T('negras', 'Black');
    if (game.in_checkmate()) t = (game.turn() === st.color ? T('Jaque mate. Gana Stockfish.', 'Checkmate. Stockfish wins.') : T('¡Jaque mate! Has ganado 🎉', 'Checkmate! You win 🎉'));
    else if (game.in_draw()) t = game.in_stalemate() ? T('Tablas por ahogado.', 'Draw by stalemate.') : game.in_threefold_repetition() ? T('Tablas por repetición.', 'Draw by repetition.') : T('Tablas.', 'Draw.');
    else { t = (game.turn() === st.color ? T('Te toca (', 'Your move (') + turn + ')' : T('Stockfish está pensando…', 'Stockfish is thinking…')); if (game.in_check()) t += T(' · ¡Jaque!', ' · Check!'); }
    $s('#status').textContent = t;
    var h = game.history(), out = '';
    for (var i = 0; i < h.length; i += 2) out += '<span><i>' + (i / 2 + 1) + '.</i> ' + h[i] + (h[i + 1] ? ' ' + h[i + 1] : '') + '</span> ';
    $s('#moves').innerHTML = out || '<em>' + T('Aún no hay jugadas', 'No moves yet') + '</em>';
    $s('#moves').scrollTop = 1e6;
  }
  function engine(){
    if (sf) return sf;
    sf = new Worker('/static/assets/sra-chess-stockfish.js?v=' + SRA.ver);
    sf.onmessage = function(e){
      var l = String(e.data || '');
      if (l === 'uciok') { sf.postMessage('setoption name Hash value 16'); sf.postMessage('isready'); }
      else if (l === 'readyok') { ready = true; if (pend) { var p = pend; pend = null; p(); } }
      else if (l.indexOf('bestmove') === 0) {
        var m = l.split(' ')[1]; thinking = false;
        if (m && m !== '(none)' && game.turn() !== st.color) { game.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] || 'q' }); board.position(game.fen()); save(); }
        status(); playerTurn();
      }
    };
    sf.postMessage('uci');
    return sf;
  }
  function think(){
    if (game.game_over() || game.turn() === st.color) { status(); return; }
    thinking = true; status();
    var go = function(){ var L = LV[st.level]; sf.postMessage('setoption name Skill Level value ' + L[0]); sf.postMessage('position fen ' + game.fen()); sf.postMessage('go movetime ' + L[1] + ' depth ' + L[2]); };
    engine(); if (ready) go(); else pend = go;
  }

  /* ================= Entrenador (solo «Modo principiante») =================
     Un segundo Stockfish a plena fuerza analiza la posición en el navegador; los consejos salen de ese
     análisis. AskBox (si está disponible) solo lo explica con palabras sencillas: nunca elige la jugada. */
  var coachW = null, coachReady = false, coachQ = [], coachCur = null, gen = 0, lastAn = null, moveCheck = null;
  var aiOff = false, aiLast = 0, aiBusy = false, VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  function beginner(){ return st.mode !== 'expert'; }
  function coach(){
    if (coachW) return coachW;
    coachW = new Worker('/static/assets/sra-chess-stockfish.js?v=' + SRA.ver);
    coachW.onmessage = function(e){
      var l = String(e.data || '');
      if (l === 'uciok') { coachW.postMessage('setoption name Hash value 16'); coachW.postMessage('isready'); }
      else if (l === 'readyok') { coachReady = true; nextAn(); }
      else if (coachCur && l.indexOf('info ') === 0 && l.indexOf(' pv ') > 0) {
        var m = / score (cp|mate) (-?\d+)/.exec(l), pv = l.split(' pv ')[1];
        if (m && pv) { coachCur.r.kind = m[1]; coachCur.r.score = +m[2]; coachCur.r.pv = pv.trim().split(/\s+/); }
      } else if (coachCur && l.indexOf('bestmove') === 0) {
        var c = coachCur; coachCur = null; c.r.best = l.split(' ')[1]; c.res(c.r); nextAn();
      }
    };
    coachW.postMessage('uci');
    return coachW;
  }
  function nextAn(){
    if (!coachReady || coachCur || !coachQ.length) return;
    coachCur = coachQ.shift(); coachCur.r = { fen: coachCur.fen, kind: 'cp', score: 0, pv: [] };
    coachW.postMessage('setoption name Skill Level value 20');
    coachW.postMessage('position fen ' + coachCur.fen); coachW.postMessage('go movetime ' + coachCur.ms + ' depth 16');
  }
  function analyze(fen, ms){ coach(); return new Promise(function(res){ coachQ.push({ fen: fen, ms: ms || 650, res: res }); nextAn(); }); }
  // Puntuación desde el punto de vista del jugador (centipeones; mate = ±(10000 - jugadas))
  function forPlayer(r){ var turn = r.fen.split(' ')[1], s = r.kind === 'mate' ? (r.score > 0 ? 10000 - r.score : -10000 - r.score) : r.score; return turn === st.color ? s : -s; }
  function pname(t){ return { p: T('peón', 'pawn'), n: T('caballo', 'knight'), b: T('alfil', 'bishop'), r: T('torre', 'rook'), q: T('dama', 'queen'), k: T('rey', 'king') }[t]; }
  function moveObj(fen, uci){ var g = new Chess(fen); return g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' }); }
  function pvSan(fen, pv, n){ var g = new Chess(fen), out = []; for (var i = 0; i < Math.min(n, pv.length); i++) { var m = g.move({ from: pv[i].slice(0, 2), to: pv[i].slice(2, 4), promotion: pv[i][4] || 'q' }); if (!m) break; out.push(m.san); } return out; }
  function words(m){
    if (m.flags.indexOf('k') >= 0) return T('enroque corto', 'castle kingside');
    if (m.flags.indexOf('q') >= 0) return T('enroque largo', 'castle queenside');
    return pname(m.piece) + T(' de ', ' from ') + m.from + T(' a ', ' to ') + m.to + (m.captured ? T(' capturando ' + (m.captured === 'p' ? 'un ' : 'el ') + pname(m.captured), ' capturing the ' + pname(m.captured)) : '');
  }
  function why(m, r){
    var g = new Chess(r.fen); g.move(m.san);
    if (g.in_checkmate()) return T('¡es jaque mate!', 'it is checkmate!');
    if (r.kind === 'mate' && r.score > 0) return T('lleva a un jaque mate en ' + r.score, 'it leads to mate in ' + r.score);
    if (m.flags.indexOf('k') >= 0 || m.flags.indexOf('q') >= 0) return T('pone a salvo a tu rey y conecta las torres', 'it keeps your king safe and connects your rooks');
    if (m.promotion) return T('corona un peón', 'it promotes a pawn');
    if (m.captured && VAL[m.captured] >= 3) return T('ganas material: te comes ' + (m.captured === 'q' ? 'la dama' : (m.captured === 'r' ? 'una torre' : 'un ' + pname(m.captured))), 'you win material: you take the ' + pname(m.captured));
    if (m.captured) return T('ganas un peón', 'you win a pawn');
    if (g.in_check()) return T('das jaque y obligas al rival a responder', 'it gives check and forces a reply');
    var back = st.color === 'w' ? '1' : '8';
    if ((m.piece === 'n' || m.piece === 'b') && m.from[1] === back) return T('desarrolla una pieza hacia el centro', 'it develops a piece toward the centre');
    if (m.piece === 'p' && 'de'.indexOf(m.to[0]) >= 0 && '45'.indexOf(m.to[1]) >= 0) return T('controla el centro', 'it controls the centre');
    var h = hanging(r.fen, st.color); if (h.some(function(x){ return x.sq === m.from; })) return T('salva una pieza que estaba en peligro', 'it saves a piece that was in danger');
    return T('es la jugada más sólida según Stockfish', 'it is the most solid move according to Stockfish');
  }
  function withTurn(fen, c){ var p = fen.split(' '); p[1] = c; p[3] = '-'; return p.join(' '); }
  // Piezas de «color» atacadas y sin defensa suficiente (aproximado, con las reglas de chess.js)
  function hanging(fen, color){
    var opp = color === 'w' ? 'b' : 'w', out = [], g = new Chess();
    if (!g.load(withTurn(fen, opp))) return out;
    var caps = g.moves({ verbose: true }).filter(function(m){ return m.captured; });
    var files = 'abcdefgh';
    for (var r = 1; r <= 8; r++) for (var f = 0; f < 8; f++) {
      var sq = files[f] + r, pc = g.get(sq); if (!pc || pc.color !== color || pc.type === 'k') continue;
      var att = caps.filter(function(m){ return m.to === sq; }); if (!att.length) continue;
      var minA = Math.min.apply(null, att.map(function(m){ return VAL[m.piece] || 9; }));
      var d = new Chess(); var defended = false;
      if (d.load(withTurn(fen, color))) { d.remove(sq); d.put({ type: 'q', color: opp }, sq); defended = d.moves({ verbose: true }).some(function(m){ return m.to === sq; }); }
      if (!defended || minA < VAL[pc.type]) out.push({ sq: sq, t: pc.type, v: VAL[pc.type] });
    }
    return out.sort(function(a, b){ return b.v - a.v; });
  }
  function evalText(s){
    if (Math.abs(s) >= 9000) { var n = 10000 - Math.abs(s); return s > 0 ? T('tienes mate en ' + n, 'you have mate in ' + n) : T('cuidado: Stockfish puede darte mate en ' + n, 'careful: Stockfish can mate you in ' + n); }
    var p = (s / 100).toFixed(1), sign = s > 0 ? '+' : '';
    var w = s >= 300 ? T('vas ganando claramente', 'you are clearly winning') : s >= 100 ? T('tienes ventaja', 'you are better') : s > -100 ? T('la partida está igualada', 'the game is level') : s > -300 ? T('vas algo peor', 'you are a bit worse') : T('vas perdiendo', 'you are losing');
    return w + ' (' + sign + (EN ? p : p.replace('.', ',')) + ')';
  }
  function verdict(loss, ply){ if (ply <= 8 && loss < 200) return null; return loss < 100 ? null : loss < 200 ? T('imprecisa', 'inaccurate') : loss < 350 ? T('un error', 'a mistake') : T('un error grave', 'a serious mistake'); }
  function plan(){
    var n = game.history().length, k = game.board(), castled = false, kingHome = st.color === 'w' ? 'e1' : 'e8';
    var kp = game.get(kingHome); castled = !(kp && kp.type === 'k' && kp.color === st.color);
    if (n < 12) return T('Plan: desarrolla caballos y alfiles, controla el centro y enroca pronto.', 'Plan: develop knights and bishops, control the centre and castle early.');
    if (!castled && n < 30) return T('Plan: enroca para poner a salvo a tu rey.', 'Plan: castle to keep your king safe.');
    return T('Plan: antes de mover, mira qué piezas pueden capturar las suyas y las tuyas.', 'Plan: before moving, check which pieces can be captured on both sides.');
  }
  function facts(r){
    var best = r.best && r.best !== '(none)' ? moveObj(r.fen, r.best) : null, s = forPlayer(r), f = { r: r, best: best, s: s };
    f.pv = best ? pvSan(r.fen, r.pv.length ? r.pv : [r.best], 4) : [];
    f.hang = hanging(r.fen, st.color).slice(0, 2);
    f.oppHang = hanging(r.fen, st.color === 'w' ? 'b' : 'w').slice(0, 2);
    f.last = moveCheck && moveCheck.fenAfterEngine === r.fen ? moveCheck : null;
    f.why = best ? why(best, r) : '';
    return f;
  }
  function localTip(f, full){
    var L = [];
    if (f.last && f.last.verdict) { L.push('⚠️ ' + T('Tu jugada ' + f.last.san + ' fue ' + f.last.verdict + (f.last.better ? ': era mejor ' + f.last.better : '') + '.', 'Your move ' + f.last.san + ' was ' + f.last.verdict + (f.last.better ? ': ' + f.last.better + ' was better' : '') + '.')); }
    if (f.hang.length) L.push('⚠️ ' + f.hang.map(function(h){ return T('Tu ' + pname(h.t) + ' en ' + h.sq + ' está en peligro', 'Your ' + pname(h.t) + ' on ' + h.sq + ' is in danger'); }).join(T(' y ', ' and ')) + '.');
    if (f.best) L.push('🎯 ' + moveLine(f.best) + ' (' + f.best.san + ') — ' + f.why + '.');
    L.push('📊 ' + evalText(f.s).replace(/^./, function(c){ return c.toUpperCase(); }) + '.');
    if (full) L.push(plan());
    return L.join('\n');
  }
  function aiPrompt(f, full){
    var h = game.history(), mv = '';
    for (var i = 0; i < h.length; i += 2) mv += (i / 2 + 1) + '. ' + h[i] + (h[i + 1] ? ' ' + h[i + 1] : '') + ' ';
    return ['LANG=' + (EN ? 'en' : 'es'), 'PLAYER_COLOR=' + (st.color === 'w' ? 'white' : 'black'), 'FEN=' + f.r.fen, 'MOVES=' + (mv.trim() || '(start)'),
      'STOCKFISH_EVAL_FOR_PLAYER=' + evalText(f.s), 'BEST_SAN=' + f.best.san, 'BEST_MOVE_IN_WORDS=' + words(f.best), 'WHY_HINT=' + f.why,
      'STOCKFISH_LINE=' + f.pv.join(' '), 'LAST_PLAYER_MOVE=' + (f.last ? f.last.san + (f.last.verdict ? ' (' + f.last.verdict + (f.last.better ? '; better was ' + f.last.better : '') + ')' : ' (ok)') : '-'),
      'PLAYER_PIECES_IN_DANGER=' + (f.hang.map(function(x){ return pname(x.t) + ' ' + x.sq; }).join(', ') || '-'),
      'OPPONENT_PIECES_LOOSE=' + (f.oppHang.map(function(x){ return pname(x.t) + ' ' + x.sq; }).join(', ') || '-'),
      'SIMPLE_PLAN=' + plan(), 'DETAIL=' + (full ? 'button' : 'auto')].join('\n');
  }
  function aiSystem(full){
    return EN
      ? 'You are the Snake OS chess coach for beginners. Always answer in English, plain text, no markdown, ' + (full ? 'at most 3 short sentences (70 words) and end with a simple plan' : 'at most 2 short sentences (40 words)') + '. The Stockfish analysis you get is the truth. Recommend ONLY the move BEST_SAN, written exactly like that, and explain why in simple words. Never suggest any other move or variation. If PLAYER_PIECES_IN_DANGER is not "-", warn about it first. If the last move was a mistake, say so kindly.'
      : 'Eres el entrenador de ajedrez de Snake OS para principiantes. Responde siempre en español, texto plano sin markdown, ' + (full ? 'como mucho 3 frases cortas (70 palabras) y termina con un plan sencillo' : 'como mucho 2 frases cortas (40 palabras)') + '. El análisis de Stockfish que te doy es la verdad. Recomienda SOLO la jugada BEST_SAN, escrita exactamente así, y explica por qué con palabras sencillas. Nunca propongas otras jugadas ni variantes. Si PLAYER_PIECES_IN_DANGER no es "-", avisa de eso primero. Si la última jugada fue un error, dilo con amabilidad.';
  }
  // La IA solo puede nombrar jugadas que salen del análisis (o de la partida); si nombra otra, se descarta.
  function aiOk(text, f){
    var ok = {}; f.pv.concat(game.history(), f.last ? [f.last.san].concat(f.last.better ? [f.last.better] : []) : []).forEach(function(s){ ok[s.replace(/[+#]/g, '')] = 1; });
    Object.keys(ok).forEach(function(s){ ok[s.replace(/^N/, 'C').replace(/^B/, 'A').replace(/^R/, 'T').replace(/^Q/, 'D').replace(/^K/, 'R')] = 1; });
    var toks = text.match(/\b[KQRBNCATD][a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?/g) || [];
    if (toks.some(function(t){ return !ok[t.replace(/[+#]/g, '')]; })) return false;
    return text.indexOf(f.best.san.replace(/[+#]/g, '')) >= 0 || (f.best.flags.match(/[kq]/) && /O-O|enroc|castl/i.test(text));
  }
  /* ---- Marcas en el tablero: casilla de origen (dorada), destino (diana verde) y flecha ---- */
  var curMark = null;
  function art(t){ return t === 'q' || t === 'r' ? 'la' : 'el'; }
  function moveLine(m){
    if (m.flags.indexOf('k') >= 0 || m.flags.indexOf('q') >= 0) return T('Enroca: mueve el rey de ' + m.from + ' a ' + m.to, 'Castle: move the king from ' + m.from + ' to ' + m.to);
    return T('Mueve ' + art(m.piece) + ' ' + pname(m.piece) + ' de ' + m.from + ' a ' + m.to, 'Move the ' + pname(m.piece) + ' from ' + m.from + ' to ' + m.to) +
      (m.captured ? T(' y captura ' + (m.captured === 'p' ? 'el peón' : art(m.captured) + ' ' + pname(m.captured)), ' and capture the ' + pname(m.captured)) : '') +
      (m.promotion ? T(' y corona dama', ' and promote to a queen') : '');
  }
  function sqEl(sq){ return document.querySelector('#board [data-square="' + sq + '"]'); }
  function clearMarks(keep){
    document.querySelectorAll('#board .sra-from, #board .sra-to').forEach(function(e){ e.classList.remove('sra-from', 'sra-to'); });
    var o = document.getElementById('sraArrow'); if (o) o.remove();
    if (!keep) curMark = null;
  }
  function drawMarks(){
    clearMarks(true);
    if (!curMark || !beginner()) return;
    var a = sqEl(curMark.from), b = sqEl(curMark.to), host = document.getElementById('board'); if (!a || !b || !host) return;
    a.classList.add('sra-from'); b.classList.add('sra-to');
    if (!st.arrow) return;
    var hr = host.getBoundingClientRect(), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), sz = ra.width;
    var x1 = ra.left - hr.left + sz / 2, y1 = ra.top - hr.top + sz / 2, x2 = rb.left - hr.left + sz / 2, y2 = rb.top - hr.top + sz / 2;
    var dx = x2 - x1, dy = y2 - y1, L = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L;
    var head = sz * 0.42, w = sz * 0.16, sx = x1 + ux * sz * 0.22, sy = y1 + uy * sz * 0.22, ex = x2 - ux * sz * 0.12, ey = y2 - uy * sz * 0.12, bx = ex - ux * head, by = ey - uy * head;
    var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.id = 'sraArrow'; svg.setAttribute('width', hr.width); svg.setAttribute('height', hr.height); svg.setAttribute('aria-hidden', 'true');
    var line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', sx); line.setAttribute('y1', sy); line.setAttribute('x2', bx); line.setAttribute('y2', by);
    line.setAttribute('stroke', 'rgba(255,170,20,.88)'); line.setAttribute('stroke-width', w); line.setAttribute('stroke-linecap', 'round');
    var poly = document.createElementNS(NS, 'polygon'), px = -uy, py = ux;
    poly.setAttribute('points', [ex, ey, bx + px * head * 0.62, by + py * head * 0.62, bx - px * head * 0.62, by - py * head * 0.62].map(function(v){ return v.toFixed(1); }).join(' '));
    poly.setAttribute('fill', 'rgba(255,170,20,.92)');
    svg.appendChild(line); svg.appendChild(poly); host.appendChild(svg);
  }
  function mark(m){ curMark = m && beginner() ? { from: m.from, to: m.to } : null; drawMarks(); }
  function hideTip(){ $s('#tip').hidden = true; clearMarks(); }
  function show(text, src){
    clearMarks();
    var b = $s('#tip'); b.hidden = false; $s('#tipt').textContent = text; $s('#tips').textContent = src || '';
  }
  function tipNote(base){ return base; }
  function tip(full){
    if (!beginner() || game.game_over() || game.turn() !== st.color) return;
    var g = ++gen, fen = game.fen();
    show(T('Pensando un consejo…', 'Thinking of a tip…'), '');
    analyze(fen, full ? 1100 : 650).then(function(r){
      if (g !== gen || !beginner() || game.fen() !== fen) return;
      lastAn = r;
      var f = facts(r), loc = localTip(f, full);
      if (!f.best) { show(loc, ''); return; }
      var mk = function(){ mark(f.best); };
      var now = Date.now(), can = !aiOff && !aiBusy && (full ? now - aiLast > 4000 : now - aiLast > 6000);
      show(loc, T('Consejo de Stockfish', 'Stockfish tip') + (can ? T(' · preguntando a AskBox…', ' · asking AskBox…') : (aiOff ? T(' · IA no disponible', ' · AI not available') : ''))); mk();
      if (!can) return;
      aiBusy = true; aiLast = now;
      SRA.ai(aiPrompt(f, full), aiSystem(full), { tier: 'fast', maxOutputTokens: full ? 260 : 160 }).then(function(t){
        aiBusy = false;
        if (g !== gen || !beginner() || game.fen() !== fen) return;
        t = t.replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim().slice(0, full ? 420 : 260);
        if (!aiOk(t, f)) { show(loc, T('Consejo de Stockfish', 'Stockfish tip')); mk(); return; }
        var warn = f.hang.length && !/peligro|danger|defend|colg|hang|captur|atac|attack/i.test(t) ? localTip({ hang: f.hang, last: null, best: null, s: f.s }, false).split('\n')[0] + '\n' : '';
        show(warn + '🎯 ' + moveLine(f.best) + ' (' + f.best.san + ').\n💡 ' + t + '\n📊 ' + evalText(f.s).replace(/^./, function(c){ return c.toUpperCase(); }) + '.', T('Consejo de AskBox con el análisis de Stockfish', 'AskBox tip based on Stockfish analysis')); mk();
      }, function(e){
        aiBusy = false;
        if (e && (e.status === 401 || e.status === 403)) aiOff = true;
        if (g !== gen || game.fen() !== fen) return;
        show(loc, T('Consejo de Stockfish', 'Stockfish tip') + (e && e.status === 429 ? T(' · AskBox está ocupada, prueba en un minuto', ' · AskBox is busy, try again in a minute') : (aiOff ? T(' · IA no disponible', ' · AI not available') : ''))); mk();
      });
    });
  }
  // Tras la jugada del jugador: ¿fue buena? (se compara con el análisis anterior)
  function checkMove(mv, fenBefore){
    if (!beginner()) return;
    var before = lastAn && lastAn.fen === fenBefore ? forPlayer(lastAn) : null, fenAfter = game.fen(), g = gen;
    moveCheck = { san: mv.san, fenAfter: fenAfter, fenAfterEngine: null, verdict: null, loss: 0, better: null };
    var mc = moveCheck;
    analyze(fenAfter, 500).then(function(r){
      if (mc !== moveCheck) return;
      if (before !== null) { mc.loss = Math.max(0, before - forPlayer(r)); mc.verdict = verdict(mc.loss, game.history().length); }
      var bm = mc.verdict && lastAn && lastAn.best && lastAn.best !== '(none)' ? moveObj(fenBefore, lastAn.best) : null;
      mc.better = bm && bm.san !== mv.san ? bm.san : null;
    });
  }
  function playerTurn(){
    if (moveCheck && !moveCheck.fenAfterEngine) moveCheck.fenAfterEngine = game.fen();
    if (beginner() && !game.game_over() && game.turn() === st.color) setTimeout(function(){ tip(false); }, 200);
  }
  function setMode(m, init){
    if (!init && (m === 'expert' ? 'expert' : 'beginner') === st.mode) return;
    st.mode = m === 'expert' ? 'expert' : 'beginner'; save();
    document.querySelectorAll('.seg button').forEach(function(b){ b.classList.toggle('on', b.dataset.m === st.mode); b.setAttribute('aria-pressed', b.dataset.m === st.mode); });
    var exp = st.mode === 'expert';
    $s('#tipBtn').hidden = exp; $s('#arrowRow').hidden = exp; hideTip(); gen++; moveCheck = null;
    if (exp) { coachQ = []; if (coachW) { try { coachW.terminate(); } catch (e) {} coachW = null; coachReady = false; coachCur = null; } }
    else playerTurn();
  }
  /* ========================================================================== */

  function onDragStart(src, piece){ if (game.game_over() || thinking || game.turn() !== st.color || piece[0] !== st.color) return false; clearMarks(true); }
  function onDrop(from, to){
    var fenBefore = game.fen(), mv = game.move({ from: from, to: to, promotion: 'q' });
    if (!mv) return 'snapback';
    gen++; hideTip();
    save(); status(); checkMove(mv, fenBefore); setTimeout(think, 150);
  }
  function onSnapEnd(){ board.position(game.fen()); }
  function onSnapback(){ drawMarks(); }
  function newGame(color){ gen++; moveCheck = null; lastAn = null; game.reset(); st.color = color; board.orientation(color === 'w' ? 'white' : 'black'); board.start(false); save(); status(); hideTip(); if (color === 'b') setTimeout(think, 300); else playerTurn(); }
  function size(){ var side = window.innerWidth >= 700; var a = side ? Math.min(window.innerHeight - 24, window.innerWidth - 270) : Math.min(window.innerWidth - 16, window.innerHeight - 250); $s('#board').style.width = Math.max(240, Math.floor(a / 8) * 8) + 'px'; if (board) { board.resize(); drawMarks(); } }
  window.addEventListener('resize', size);
  document.querySelectorAll('[data-t]').forEach(function(b){ var p = b.getAttribute('data-t').split('|'); b.textContent = T(p[0], p[1]); });
  var lv = $s('#level'); for (var i = 1; i <= 10; i++) { var o = document.createElement('option'); o.value = i; o.textContent = T('Nivel ', 'Level ') + i; lv.appendChild(o); }
  lv.addEventListener('change', function(){ st.level = +lv.value; save(); });
  $s('#nw').addEventListener('click', function(){ newGame('w'); });
  $s('#nb').addEventListener('click', function(){ newGame('b'); });
  $s('#undo').addEventListener('click', function(){ if (thinking) return; gen++; moveCheck = null; game.undo(); if (game.turn() !== st.color) game.undo(); board.position(game.fen()); save(); status(); hideTip(); playerTurn(); });
  $s('#flip').addEventListener('click', function(){ board.flip(); drawMarks(); });
  $s('#tipBtn').addEventListener('click', function(){ if (game.turn() !== st.color || thinking) { show(T('Espera a que sea tu turno.', 'Wait for your turn.'), ''); return; } tip(true); });
  $s('#arrowT').addEventListener('change', function(){ st.arrow = this.checked; save(); drawMarks(); });
  document.querySelectorAll('.seg button').forEach(function(b){ b.addEventListener('click', function(){ setMode(b.dataset.m); }); });
  SRA.load('game').then(null, function(){ return null; }).then(function(saved){
    if (saved) { st = Object.assign(st, saved); if (st.pgn) game.load_pgn(st.pgn); }
    if (st.mode !== 'expert') st.mode = 'beginner';
    if (st.arrow !== false) st.arrow = true; $s('#arrowT').checked = st.arrow;
    lv.value = st.level;
    size();
    board = Chessboard('board', { draggable: true, position: game.fen(), orientation: st.color === 'w' ? 'white' : 'black', pieceTheme: '/static/assets/sra-chess-p-{piece}.svg?v=' + SRA.ver, onDragStart: onDragStart, onDrop: onDrop, onSnapEnd: onSnapEnd, onSnapbackEnd: onSnapback, moveSpeed: 160, snapSpeed: 60 });
    size(); status(); engine(); setMode(st.mode, true);
    if (game.turn() !== st.color) setTimeout(think, 300);
  });
})();
