
(function(){
  var T = SRA.T, $s = function(s){ return document.querySelector(s); };
  var game = new Chess(), board = null, sf = null, thinking = false, st = { color: 'w', level: 4, pgn: '' }, ready = false, pend = null;
  var LV = [null, [0, 80, 1], [2, 150, 2], [4, 250, 4], [6, 350, 6], [8, 500, 8], [10, 700, 10], [13, 900, 12], [16, 1200, 14], [18, 1600, 18], [20, 2200, 22]];
  function save(){ st.pgn = game.pgn(); SRA.save('game', st); }
  SRA.onClose(save);
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
        status();
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
  function onDragStart(src, piece){ if (game.game_over() || thinking || game.turn() !== st.color || piece[0] !== st.color) return false; }
  function onDrop(from, to){
    var mv = game.move({ from: from, to: to, promotion: 'q' });
    if (!mv) return 'snapback';
    save(); status(); setTimeout(think, 150);
  }
  function onSnapEnd(){ board.position(game.fen()); }
  function newGame(color){ game.reset(); st.color = color; board.orientation(color === 'w' ? 'white' : 'black'); board.start(); save(); status(); if (color === 'b') setTimeout(think, 300); }
  function size(){ var w = document.getElementById('wrap'), side = window.innerWidth >= 700; var a = side ? Math.min(window.innerHeight - 24, window.innerWidth - 270) : Math.min(window.innerWidth - 16, window.innerHeight - 190); $s('#board').style.width = Math.max(240, Math.floor(a / 8) * 8) + 'px'; if (board) board.resize(); }
  window.addEventListener('resize', size);
  document.querySelectorAll('[data-t]').forEach(function(b){ var p = b.getAttribute('data-t').split('|'); b.textContent = T(p[0], p[1]); });
  var lv = $s('#level'); for (var i = 1; i <= 10; i++) { var o = document.createElement('option'); o.value = i; o.textContent = T('Nivel ', 'Level ') + i; lv.appendChild(o); }
  lv.addEventListener('change', function(){ st.level = +lv.value; save(); });
  $s('#nw').addEventListener('click', function(){ newGame('w'); });
  $s('#nb').addEventListener('click', function(){ newGame('b'); });
  $s('#undo').addEventListener('click', function(){ if (thinking) return; game.undo(); if (game.turn() !== st.color) game.undo(); board.position(game.fen()); save(); status(); });
  $s('#flip').addEventListener('click', function(){ board.flip(); });
  SRA.load('game').then(null, function(){ return null; }).then(function(saved){
    if (saved) { st = Object.assign(st, saved); if (st.pgn) game.load_pgn(st.pgn); }
    lv.value = st.level;
    size();
    board = Chessboard('board', { draggable: true, position: game.fen(), orientation: st.color === 'w' ? 'white' : 'black', pieceTheme: '/static/assets/sra-chess-p-{piece}.svg?v=' + SRA.ver, onDragStart: onDragStart, onDrop: onDrop, onSnapEnd: onSnapEnd, moveSpeed: 160, snapSpeed: 60 });
    size(); status(); engine(); if (game.turn() !== st.color) setTimeout(think, 300);
  });
})();
