/* Snake OS · refleja el juego Snake en la matriz 8×8 (cola _board + snake-os-lite-local.py, ~m f). */
(function () {
  var lastHex = '';
  var enabled = true;

  function rowsToHex(rows) {
    var out = '';
    for (var i = 0; i < 8; i++) {
      var n = (rows[i] | 0) & 0xff;
      var h = n.toString(16);
      if (h.length < 2) h = '0' + h;
      out += h;
    }
    return out;
  }

  function setPixel(rows, gx, gy, cols, rowsCount) {
    var x = Math.min(7, Math.max(0, Math.floor((gx * 8) / cols)));
    var y = Math.min(7, Math.max(0, Math.floor((gy * 8) / rowsCount)));
    rows[y] = (rows[y] | 0) | (0x80 >> x);
  }

  function frameFromGame(snake, food, cols, rowsCount) {
    var rows = [0, 0, 0, 0, 0, 0, 0, 0];
    if (!snake || !snake.length) return rows;
    for (var i = 0; i < snake.length; i++) {
      setPixel(rows, snake[i].x, snake[i].y, cols, rowsCount);
    }
    if (food) setPixel(rows, food.x, food.y, cols, rowsCount);
    return rows;
  }

  function boardSay(text) {
    try {
      fetch('/api/board/say', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ text: text })
      }).catch(function () {});
    } catch (e) {}
  }

  function pushRows(rows) {
    if (!enabled) return;
    var hex = rowsToHex(rows);
    if (hex === lastHex) return;
    lastHex = hex;
    boardSay('~m f ' + hex);
  }

  window.SnakeGameMatrix = {
    sync: function (snake, food, cols, rowsCount) {
      pushRows(frameFromGame(snake, food, cols, rowsCount || 16));
    },
    clear: function () {
      lastHex = '';
      boardSay('~m c');
    },
    setEnabled: function (on) {
      enabled = !!on;
      if (!enabled) lastHex = '';
    }
  };
})();
