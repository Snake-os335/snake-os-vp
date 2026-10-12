/* Snake OS · Bluetooth real (Web Bluetooth, dispositivos BLE cercanos) */
(function () {
  var SERVICES = [
    'generic_access',
    'generic_attribute',
    'device_information',
    'battery_service',
    'heart_rate',
    'current_time',
    'immediate_alert',
    'link_loss',
    'tx_power',
    'environmental_sensing',
    'pulse_oximeter',
    'weight_scale',
    'glucose',
    'cycling_power',
    'running_speed_and_cadence'
  ];
  var SERVICE_NAMES = {
    '00001800-0000-1000-8000-00805f9b34fb': 'Acceso',
    '00001801-0000-1000-8000-00805f9b34fb': 'Atributos',
    '0000180a-0000-1000-8000-00805f9b34fb': 'Información',
    '0000180f-0000-1000-8000-00805f9b34fb': 'Batería',
    '0000180d-0000-1000-8000-00805f9b34fb': 'Pulso',
    '00001812-0000-1000-8000-00805f9b34fb': 'Mando',
    '00001805-0000-1000-8000-00805f9b34fb': 'Hora',
    '0000181a-0000-1000-8000-00805f9b34fb': 'Ambiente',
    '00001802-0000-1000-8000-00805f9b34fb': 'Alerta'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function textOf(view) {
    try {
      var bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      return new TextDecoder('utf-8').decode(bytes).replace(/\u0000/g, '').trim();
    } catch (e) {
      return '';
    }
  }
  function serviceName(uuid) {
    var id = String(uuid || '').toLowerCase();
    return SERVICE_NAMES[id] || id.slice(0, 8);
  }

  function renderBluetoothApp(body) {
    var alive = true;
    var links = [];
    body.innerHTML =
      '<div class="snk-bt">' +
        '<p class="snk-bt-lead">Conecta Snake OS con dispositivos Bluetooth reales que estén cerca. El navegador enseña los que detecta y tú eliges uno.</p>' +
        '<p class="snk-bt-note">Hace falta Chrome o Edge. Los altavoces de audio clásico no salen: el navegador solo puede enlazar Bluetooth de bajo consumo (relojes, sensores, mandos, placas).</p>' +
        '<div class="snk-bt-actions">' +
          '<button type="button" class="snk-bt-go" id="snkBtScan">Buscar dispositivos</button>' +
          '<button type="button" class="snk-bt-ghost" id="snkBtKnown">Ya permitidos</button>' +
        '</div>' +
        '<p class="snk-bt-msg" id="snkBtMsg"></p>' +
        '<div id="snkBtKnownList"></div>' +
        '<div id="snkBtLinks"></div>' +
      '</div>';

    var msg = body.querySelector('#snkBtMsg');
    var knownBox = body.querySelector('#snkBtKnownList');
    var linksBox = body.querySelector('#snkBtLinks');
    var scanBtn = body.querySelector('#snkBtScan');
    var knownBtn = body.querySelector('#snkBtKnown');

    function say(text) {
      if (msg) msg.textContent = text || '';
    }
    function securePageUrl() {
      var search = '';
      try { search = location.search || ''; } catch (e) { search = ''; }
      return 'http://127.0.0.1:8791/' + search;
    }
    function blockedReason() {
      if (!window.isSecureContext) {
        return 'Bluetooth en este Mac se abre en http://127.0.0.1:8791. Pulsa Abrir página segura.';
      }
      if (!navigator.bluetooth) {
        return 'Este navegador no tiene Bluetooth web. Ábrelo en Chrome o Edge.';
      }
      return '';
    }
    function explainScanError(err) {
      if (!alive) return;
      if (err && err.name === 'NotFoundError') say('Búsqueda cancelada.');
      else if (err && err.name === 'SecurityError') {
        var detail = err && err.message ? String(err.message) : '';
        if (/user gesture/i.test(detail)) say('Pulsa Buscar dispositivos con el ratón. Chrome abre la lista en ese clic.');
        else say(blockedReason() || ('El navegador bloqueó el Bluetooth. ' + detail));
      }
      else if (err && err.name === 'NetworkError') say('No se pudo conectar. Acerca el dispositivo, enciéndelo y prueba otra vez.');
      else say('No se pudo conectar' + (err && err.message ? (': ' + err.message) : '.'));
    }
    function paintLinks() {
      if (!linksBox) return;
      if (!links.length) {
        linksBox.innerHTML = '';
        return;
      }
      linksBox.innerHTML = links.map(function (item, i) {
        var on = item.device.gatt && item.device.gatt.connected;
        var bits = [];
        if (item.battery != null) bits.push('Batería ' + item.battery + '%');
        if (item.maker) bits.push(item.maker);
        if (item.model) bits.push(item.model);
        if (item.services && item.services.length) bits.push(item.services.join(' · '));
        return '<article class="snk-bt-card' + (on ? ' on' : '') + '">' +
          '<header><strong>' + esc(item.device.name || 'Dispositivo') + '</strong>' +
          '<span>' + (on ? 'Conectado' : 'Desconectado') + '</span></header>' +
          '<p>' + esc(bits.join(' · ') || 'Sin datos extra') + '</p>' +
          '<button type="button" data-i="' + i + '" data-act="' + (on ? 'off' : 'on') + '">' +
            (on ? 'Desconectar' : 'Reconectar') +
          '</button></article>';
      }).join('');
    }

    async function describe(device) {
      var info = { device: device, battery: null, maker: '', model: '', services: [] };
      if (!device.gatt) throw new Error('El dispositivo no acepta la conexión.');
      var server = device.gatt;
      if (!server.connected) server = await device.gatt.connect();
      var services = [];
      try { services = await server.getPrimaryServices(); } catch (e) { services = []; }
      info.services = services.map(function (s) { return serviceName(s.uuid); });
      try {
        var bat = await server.getPrimaryService('battery_service');
        var level = await bat.getCharacteristic('battery_level');
        var value = await level.readValue();
        info.battery = value.getUint8(0);
      } catch (e1) {}
      try {
        var di = await server.getPrimaryService('device_information');
        try {
          var maker = await di.getCharacteristic('manufacturer_name_string');
          info.maker = textOf(await maker.readValue());
        } catch (e2) {}
        try {
          var model = await di.getCharacteristic('model_number_string');
          info.model = textOf(await model.readValue());
        } catch (e3) {}
      } catch (e4) {}
      return info;
    }

    function remember(info) {
      var id = info.device.id;
      links = links.filter(function (item) { return item.device.id !== id; });
      links.unshift(info);
      var dev = info.device;
      dev.ongattserverdisconnected = function () {
        if (!alive) return;
        say((dev.name || 'Dispositivo') + ' se desconectó.');
        paintLinks();
      };
      paintLinks();
    }

    async function connectDevice(device) {
      say('Conectando con ' + (device.name || 'el dispositivo') + '…');
      var info = await describe(device);
      if (!alive) {
        try { device.gatt.disconnect(); } catch (e) {}
        return;
      }
      remember(info);
      var extra = info.battery != null ? (' · batería ' + info.battery + '%') : '';
      say('Conectado a ' + (device.name || 'el dispositivo') + extra + '.');
    }

    function scan() {
      if (!window.isSecureContext) {
        say('Abriendo Snake OS en http://127.0.0.1:8791.');
        location.assign(securePageUrl());
        return;
      }
      if (!navigator.bluetooth) {
        say('Este navegador no tiene Bluetooth web. Ábrelo en Chrome o Edge.');
        return;
      }
      var pending;
      try {
        say('Elige un dispositivo de la lista del navegador. Son los que están cerca.');
        pending = navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: SERVICES
        });
      } catch (err) {
        explainScanError(err);
        return;
      }
      pending.then(function (device) {
        return connectDevice(device);
      }).catch(function (err) {
        explainScanError(err);
      });
    }

    async function showKnown() {
      var why = blockedReason();
      if (why) { say(why); return; }
      if (!navigator.bluetooth.getDevices) {
        say('Este navegador no guarda los dispositivos ya permitidos. Usa Buscar.');
        return;
      }
      var devices = [];
      try { devices = await navigator.bluetooth.getDevices(); } catch (e) { devices = []; }
      if (!devices.length) {
        knownBox.innerHTML = '';
        say('Todavía no has permitido ninguno. Pulsa Buscar dispositivos.');
        return;
      }
      knownBox.innerHTML = '<p class="snk-bt-k">Permitidos en este navegador</p>' + devices.map(function (d, i) {
        return '<button type="button" class="snk-bt-known" data-k="' + i + '">' + esc(d.name || 'Dispositivo') + '</button>';
      }).join('');
      knownBox._devices = devices;
      say('Pulsa uno para conectarte si sigue cerca.');
    }

    scanBtn.addEventListener('click', function () { scan(); });
    knownBtn.addEventListener('click', function () { showKnown(); });
    knownBox.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-k]');
      if (!btn || !knownBox._devices) return;
      var device = knownBox._devices[Number(btn.getAttribute('data-k'))];
      if (!device) return;
      connectDevice(device).catch(function (err) {
        explainScanError(err);
      });
    });
    linksBox.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-i]');
      if (!btn) return;
      var item = links[Number(btn.getAttribute('data-i'))];
      if (!item) return;
      var act = btn.getAttribute('data-act');
      if (act === 'off') {
        try { item.device.gatt.disconnect(); } catch (e) {}
        say('Desconectado.');
        paintLinks();
        return;
      }
      connectDevice(item.device).catch(function (err) {
        explainScanError(err);
      });
    });

    var why0 = blockedReason();
    if (why0) {
      say(why0);
      if (scanBtn && !window.isSecureContext) scanBtn.textContent = 'Abrir página segura';
    } else say('Pulsa Buscar dispositivos. Chrome enseña los que hay cerca.');

    return function () {
      alive = false;
      links.forEach(function (item) {
        try { if (item.device.gatt && item.device.gatt.connected) item.device.gatt.disconnect(); } catch (e) {}
      });
    };
  }

  var css = document.createElement('style');
  css.textContent =
    '.snk-bt{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0;max-width:100%;color:#fff;font-size:0.92rem;overflow-wrap:anywhere;}' +
    '.snk-bt-lead{margin:0;line-height:1.35;}' +
    '.snk-bt-note{margin:0;color:rgba(255,255,255,0.72);font-size:0.78rem;line-height:1.35;}' +
    '.snk-bt-actions{display:flex;gap:8px;flex-wrap:wrap;}' +
    '.snk-bt-go,.snk-bt-ghost,.snk-bt-card button,.snk-bt-known{border-radius:999px;border:1px solid rgba(255,255,255,0.45);cursor:pointer;font-weight:700;}' +
    '.snk-bt-go{background:#34d17a;color:#042014;padding:8px 14px;}' +
    '.snk-bt-ghost,.snk-bt-known,.snk-bt-card button{background:rgba(255,255,255,0.12);color:#fff;padding:8px 12px;}' +
    '.snk-bt-msg{margin:0;min-height:1.2em;line-height:1.35;}' +
    '.snk-bt-k{margin:0 0 6px;font-size:0.75rem;opacity:0.75;}' +
    '#snkBtKnownList,#snkBtLinks{display:flex;flex-direction:column;gap:8px;overflow:auto;min-height:0;}' +
    '.snk-bt-known{text-align:left;}' +
    '.snk-bt-card{border:1px solid rgba(255,255,255,0.28);border-radius:16px;padding:10px 12px;background:rgba(0,0,0,0.18);}' +
    '.snk-bt-card.on{border-color:rgba(52,209,122,0.7);}' +
    '.snk-bt-card header{display:flex;justify-content:space-between;gap:8px;align-items:baseline;}' +
    '.snk-bt-card header span{font-size:0.75rem;color:#9af0c4;}' +
    '.snk-bt-card p{margin:6px 0 8px;font-size:0.8rem;line-height:1.35;color:rgba(255,255,255,0.86);}';
  document.head.appendChild(css);

  function install() {
    var apps = window.APPS;
    if (!apps) return false;
    if (!apps.bluetooth) {
      apps.bluetooth = {
        title: 'Bluetooth',
        icon: '📡',
        width: 440,
        height: 560,
        render: renderBluetoothApp
      };
      try {
        if (document.querySelector('#iconLayer .desktop-icon') && typeof buildIcons === 'function') buildIcons();
        if (typeof buildStartMenu === 'function' && document.querySelector('#startMenu .start-item')) buildStartMenu();
      } catch (e) {}
    }
    return true;
  }
  window.renderBluetoothApp = renderBluetoothApp;
  if (!install()) {
    var tries = 0;
    var iv = setInterval(function () {
      if (install() || ++tries > 200) clearInterval(iv);
    }, 50);
  }
})();
