/* Snake OS · Sensor. En casa, grados y humedad del DHT. Fuera de España, temperatura del país. */
(function () {
  var css = document.createElement('style');
  css.textContent =
    '.clima-app{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:100%;min-height:220px;padding:28px 18px;background:#07140d;color:#f4fff8;font-family:var(--snake-font,ui-sans-serif,system-ui,sans-serif);text-align:center;}' +
    '.clima-deg{font-size:4.2rem;font-weight:800;line-height:1;letter-spacing:-0.04em;color:#fff;}' +
    '.clima-deg span{font-size:1.6rem;font-weight:700;color:#7CFFB0;}' +
    '.clima-deg.country{font-size:1.7rem;letter-spacing:0;line-height:1.25;max-width:300px;}' +
    '.clima-hum{font-size:1.35rem;font-weight:700;color:#d8ffe8;min-height:1.4em;}' +
    '.clima-note{font-size:0.9rem;color:rgba(244,255,248,0.7);max-width:280px;min-height:1.2em;}';
  document.head.appendChild(css);

  function renderClimaApp(container) {
    container.innerHTML =
      '<div class="clima-app">' +
        '<div class="clima-deg" data-clima="deg">—</div>' +
        '<div class="clima-hum" data-clima="hum"></div>' +
        '<div class="clima-note" data-clima="note"></div>' +
      '</div>';
    var deg = container.querySelector('[data-clima="deg"]');
    var hum = container.querySelector('[data-clima="hum"]');
    var note = container.querySelector('[data-clima="note"]');
    var alive = true;
    var timer = 0;
    function stopBoard() {
      if (timer) clearInterval(timer);
      timer = 0;
    }
    async function pullBoard() {
      if (!alive) return;
      try {
        var res = await fetch('/api/room/climate', { cache: 'no-store' });
        if (!res.ok) throw new Error('http');
        var data = await res.json();
        var c = data && data.c;
        var h = data && data.h;
        var at = Number(data && data.at) || 0;
        var age = at ? (Date.now() / 1000 - at) : 9999;
        var err = data && data.err ? String(data.err) : '';
        deg.className = 'clima-deg';
        if (err && age <= 20) {
          deg.textContent = '—';
          hum.textContent = '';
          note.textContent = err;
          return;
        }
        if (c == null || h == null || age > 20) {
          deg.textContent = '—';
          hum.textContent = '';
          note.textContent = 'Sin lectura del sensor.';
          return;
        }
        deg.innerHTML = String(c) + ' <span>°C</span>';
        hum.textContent = String(h) + ' %';
        note.textContent = '';
      } catch (e) {
        deg.className = 'clima-deg';
        deg.textContent = '—';
        hum.textContent = '';
        note.textContent = 'Sin lectura del sensor.';
      }
    }
    function showLocal() {
      pullBoard();
      stopBoard();
      timer = setInterval(pullBoard, 3000);
    }
    fetch('/api/visitor/climate', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!alive) return;
        if (data && data.mode === 'country' && data.label) {
          deg.className = 'clima-deg country';
          deg.textContent = String(data.label);
          hum.textContent = '';
          note.textContent = '';
          return;
        }
        if (data && data.mode === 'unavailable') {
          deg.className = 'clima-deg';
          deg.textContent = '—';
          hum.textContent = '';
          note.textContent = 'Temperatura no disponible';
          return;
        }
        showLocal();
      })
      .catch(function () {
        if (alive) showLocal();
      });
    return function () {
      alive = false;
      stopBoard();
    };
  }

  function install() {
    var apps = window.APPS;
    if (!apps) return false;
    apps.clima = {
      title: 'Sensor',
      icon: '🌡️',
      width: 360,
      height: 320,
      render: renderClimaApp
    };
    try {
      if (document.querySelector('#iconLayer .desktop-icon') && typeof buildIcons === 'function') buildIcons();
      if (typeof buildStartMenu === 'function' && document.querySelector('#startMenu .start-item')) buildStartMenu();
    } catch (e) {}
    return true;
  }

  window.renderSensorApp = renderClimaApp;

  if (!install()) {
    var tries = 0;
    var iv = setInterval(function () {
      if (install() || ++tries > 200) clearInterval(iv);
    }, 50);
  }
})();
