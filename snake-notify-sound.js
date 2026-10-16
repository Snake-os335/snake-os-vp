/* Snake OS · sonido de notificación (campanilla original de 3 tonos, generada por código).
   No se usa para llamadas. Respeta «No molestar» (Ajustes rápidos) y localStorage snkNotifSound='0'. */
(function () {
  var SRC = '/static/assets/notif-chime.wav?v=202610160830';
  var base = null, last = 0;
  function muted() {
    try { if (document.body && document.body.classList.contains('qs-dnd')) return true; } catch (e) {}
    try { if (localStorage.getItem('snkNotifSound') === '0') return true; } catch (e) {}
    return false;
  }
  function play() {
    if (muted()) return false;
    var now = Date.now(); if (now - last < 1200) return false; last = now;
    try {
      if (!base) { base = new Audio(SRC); base.preload = 'auto'; }
      var a = base.cloneNode(); a.volume = 1;
      try { a.setAttribute('playsinline', 'true'); } catch (e) {}
      var p = a.play(); if (p && p.catch) p.catch(function () {});
      return true;
    } catch (e) { return false; }
  }
  try { base = new Audio(SRC); base.preload = 'auto'; } catch (e) {}
  window.snakeNotifSound = play;
})();
