/* Snake OS · Mapas — busca un lugar real y traza la ruta hasta allí */
(function () {
  'use strict';
  if (window.__snkMaps) return;
  window.__snkMaps = true;

  var LEAFLET_CSS = '/static/assets/leaflet.css?v=194';
  var LEAFLET_JS = '/static/assets/leaflet.js?v=194';
  /* geocode via /api/maps/search (proxy Nominatim) */
  var OSRM_BASE = 'https://router.project-osrm.org/route/v1/';
  var leafletPromise = null;

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      if (!document.getElementById('snkMapsLeafletCss')) {
        var link = document.createElement('link');
        link.id = 'snkMapsLeafletCss';
        link.rel = 'stylesheet';
        link.href = LEAFLET_CSS;
        document.head.appendChild(link);
      }
      var s = document.createElement('script');
      s.src = LEAFLET_JS;
      s.async = true;
      s.onload = function () {
        if (window.L) resolve(window.L);
        else reject(new Error('Leaflet no cargó'));
      };
      s.onerror = function () { reject(new Error('No se pudo cargar Leaflet')); };
      document.head.appendChild(s);
    });
    return leafletPromise;
  }

  function ensureCss() {
    if (document.getElementById('snkMapsCss')) return;
    var st = document.createElement('style');
    st.id = 'snkMapsCss';
    st.textContent =
      '.snk-maps{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;height:100%;width:100%;background:#0b1a12;color:#eafff0;overflow:hidden;}' +
      '.snk-maps-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px;flex:none;border-bottom:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.28);}' +
      '.snk-maps-bar form#snkMapsForm{display:flex;gap:8px;align-items:center;flex:1 1 220px;min-width:0;margin:0;padding:0;}' +
      '.snk-maps-bar #snkMapsQ,.snk-maps-bar input#snkMapsQ{' +
        'flex:1 1 auto;min-width:0;width:auto;max-width:none;height:38px;min-height:38px;margin:0 !important;padding:0 12px !important;' +
        'border-radius:10px !important;font-size:.86rem !important;line-height:38px !important;box-sizing:border-box !important;' +
        'background:rgba(255,255,255,.10) !important;border:1px solid rgba(255,255,255,.22) !important;' +
        'color:#eafff0 !important;-webkit-text-fill-color:#eafff0 !important;caret-color:#7CFC9A !important;' +
        'opacity:1 !important;text-shadow:none !important;filter:none !important;}' +
      '.snk-maps-bar #snkMapsQ::placeholder{color:rgba(234,255,240,.45) !important;-webkit-text-fill-color:rgba(234,255,240,.45) !important;opacity:1 !important;}' +
      '.snk-maps-bar #snkMapsQ:focus{outline:none;border-color:#34d17a !important;box-shadow:0 0 0 2px rgba(52,209,122,.25);}' +
      '.snk-maps-bar button{margin:0 !important;width:auto !important;min-width:0 !important;flex:none;height:38px;min-height:38px;' +
        'padding:0 14px !important;border-radius:10px !important;font-size:.78rem !important;font-weight:700;cursor:pointer;' +
        'box-sizing:border-box !important;display:inline-flex;align-items:center;justify-content:center;line-height:1;}' +
      '.snk-maps-bar .snk-maps-go{background:linear-gradient(135deg,#3adf87,#1f9e57) !important;color:#04170c !important;' +
        'border:none !important;box-shadow:none !important;flex:0 0 auto;min-width:52px;}' +
      '.snk-maps-modes{display:flex;gap:2px;flex:none;align-items:center;height:38px;padding:3px;border-radius:10px;' +
        'background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.14);box-sizing:border-box;}' +
      '.snk-maps-modes button{all:unset;box-sizing:border-box;height:100%;padding:0 8px;border-radius:8px;font-size:.68rem;' +
        'font-weight:700;cursor:pointer;color:rgba(234,255,240,.75);display:inline-flex;align-items:center;}' +
      '.snk-maps-modes button.on{background:rgba(52,209,122,.35);color:#eafff0;}' +
      '.snk-maps-bar .snk-maps-loc,.snk-maps-bar .snk-maps-route{background:rgba(255,255,255,.08) !important;color:#eafff0 !important;' +
        'border:1px solid rgba(255,255,255,.2) !important;}' +
      '.snk-maps-bar .snk-maps-route:disabled{opacity:.45;cursor:default;}' +
      /* evitar espejo de emoji tapando el texto del buscador */ +
      '.snk-maps .snk-ei-wrap,.snk-maps .snk-ei-layer,.snk-maps .snk-ei-caret{display:none !important;}' +
      '.snk-maps input.snk-ei-on{color:#eafff0 !important;-webkit-text-fill-color:#eafff0 !important;caret-color:#7CFC9A !important;background:rgba(255,255,255,.10) !important;}' +
      '.snk-maps-status{padding:4px 10px;font-size:.72rem;opacity:.85;flex:none;min-height:1.2em;}' +
      '.snk-maps-status.err{color:#ff9c9c;opacity:1;}' +
      '.snk-maps-status.ok{color:#9dffc2;opacity:1;}' +
      '.snk-maps-stage{flex:1 1 auto;min-height:220px;position:relative;display:block;}' +'.snk-maps-frame,.snk-maps-frame.leaflet-container{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-height:0!important;margin:0!important;z-index:1;background:#1a2e22;}' +
      '.snk-maps-frame.leaflet-container,.snk-maps-frame .leaflet-container{font:inherit;}' +
      '.snk-maps-frame .leaflet-control-attribution{font-size:9px;background:rgba(0,0,0,.45);color:#cfe8d8;}' +
      '.snk-maps-frame .leaflet-control-attribution a{color:#9dffc2;}' +
      '.snk-maps-frame .leaflet-control-zoom a{' +
        'background:rgba(10,28,18,.92) !important;color:#eafff0 !important;border:1px solid rgba(255,255,255,.2) !important;' +
        'width:32px !important;height:32px !important;line-height:30px !important;font-size:16px !important;' +
        'text-shadow:none !important;box-shadow:none !important;}' +
      '.snk-maps-frame .leaflet-control-zoom a:hover{background:rgba(52,209,122,.35) !important;}' +
      '.snk-maps-frame .leaflet-bar{border:none !important;box-shadow:0 6px 18px rgba(0,0,0,.35) !important;}' +
      '.snk-maps-steps{flex:none;max-height:38%;overflow:auto;border-top:1px solid rgba(255,255,255,.14);' +
        'background:rgba(4,14,10,.92);display:none;}' +
      '.snk-maps-steps.open{display:block;}' +
      '.snk-maps-steps-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;' +
        'font-size:.72rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#9dffc2;}' +
      '.snk-maps-steps-head button{all:unset;cursor:pointer;color:#eafff0;font-size:.75rem;font-weight:700;' +
        'padding:4px 8px;border-radius:8px;background:rgba(255,255,255,.08);}' +
      '.snk-maps-steps ol{list-style:none;margin:0;padding:0 8px 10px;display:flex;flex-direction:column;gap:4px;}' +
      '.snk-maps-steps li{display:flex;gap:8px;align-items:flex-start;padding:8px 8px;border-radius:10px;' +
        'font-size:.78rem;line-height:1.35;color:#eafff0;cursor:pointer;border:1px solid transparent;}' +
      '.snk-maps-steps li:hover{background:rgba(255,255,255,.06);}' +
      '.snk-maps-steps li.on{background:rgba(52,209,122,.18);border-color:rgba(52,209,122,.45);}' +
      '.snk-maps-steps .n{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;' +
        'font-size:.68rem;font-weight:800;background:rgba(52,209,122,.35);color:#04170c;}' +
      '.snk-maps-steps .txt{flex:1;min-width:0;}' +
      '.snk-maps-steps .meta{display:block;font-size:.66rem;opacity:.7;margin-top:2px;}' +
      '.snk-maps-arrow{width:40px;height:40px;margin-left:-20px;margin-top:-20px;}' +
      '.snk-maps-arrow svg{width:40px;height:40px;display:block;filter:drop-shadow(0 2px 5px rgba(0,0,0,.55));transform-origin:50% 58%;}' +
      '.snk-maps-frame.nav-follow{box-shadow:inset 0 0 0 2px rgba(52,209,122,.35);}' +
      '.snk-maps-navbanner{display:none;padding:10px 12px;background:linear-gradient(90deg,rgba(52,209,122,.35),rgba(8,28,18,.88));' +
        'border-bottom:1px solid rgba(52,209,122,.45);font-size:.92rem;font-weight:800;}' +
      '.snk-maps-navbanner.open{display:block;}' +
      '.snk-maps-navbanner .sub{display:block;font-size:.72rem;font-weight:600;opacity:.85;margin-top:3px;}' +
      '.snk-maps-navbanner .turn{font-size:1.05rem;}' +
      '.snk-maps-suggest{position:absolute;left:8px;right:8px;top:8px;z-index:500;max-height:42%;overflow:auto;pointer-events:auto;' +
        'background:rgba(8,22,14,.96);border:1px solid rgba(255,255,255,.2);border-radius:12px;display:none;box-shadow:0 12px 32px rgba(0,0,0,.4);}' +
      '.snk-maps-suggest.open{display:block;}' +
      '.snk-maps-suggest button{all:unset;box-sizing:border-box;display:block;width:100%;padding:9px 12px;cursor:pointer;font-size:.78rem;line-height:1.3;color:#eafff0;border-bottom:1px solid rgba(255,255,255,.08);}' +
      '.snk-maps-suggest button:hover,.snk-maps-suggest button:focus-visible{background:rgba(52,209,122,.22);}' +
      '.snk-maps-suggest button:last-child{border-bottom:0;}' +
      '.snk-maps-suggest .snk-maps-sug-sub{display:block;font-size:.68rem;opacity:.7;margin-top:2px;}' +
      '.snk-maps-bar .snk-maps-fs{background:rgba(255,255,255,.08) !important;color:#eafff0 !important;border:1px solid rgba(255,255,255,.2) !important;min-width:38px;padding:0 10px !important;}' +'.snk-maps-bar .snk-maps-fs.on{background:rgba(52,209,122,.35) !important;border-color:rgba(52,209,122,.55) !important;}' +'.snk-maps.is-fs{position:fixed !important;inset:0 !important;z-index:2147483000 !important;width:100vw !important;height:100vh !important;height:100dvh !important;max-width:none !important;border-radius:0 !important;background:#0b1a12 !important;}' +'.snk-maps.is-fs .snk-maps-stage{flex:1 1 auto;min-height:0;}' +'.snk-maps.is-fs .snk-maps-frame{flex:1 1 auto;min-height:0;}' +'.snk-maps.is-fs .snk-maps-steps{max-height:32%;}' +'.snk-maps-fs-exit{display:none;position:absolute;top:10px;right:10px;z-index:600;height:40px;min-width:40px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.28);background:rgba(8,22,14,.92);color:#eafff0;font-weight:800;font-size:.78rem;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.4);}' +'.snk-maps.is-fs .snk-maps-fs-exit{display:inline-flex;align-items:center;justify-content:center;gap:6px;}' +'body.phone-mode .snk-maps-bar{flex-wrap:wrap;}' +
      'body.phone-mode .snk-maps-bar form{flex:1 1 100%;}' +'body.phone-mode .snk-maps-modes{order:3;}' +
      'body.theme-light .snk-maps,body.light .snk-maps{background:#e8f6ec;color:#0d2818;}' +
      'body.theme-light .snk-maps-bar,body.light .snk-maps-bar{background:rgba(255,255,255,.7);border-color:rgba(0,0,0,.1);}' +
      'body.theme-light .snk-maps-bar #snkMapsQ,body.light .snk-maps-bar #snkMapsQ{background:#fff !important;color:#0d2818 !important;-webkit-text-fill-color:#0d2818 !important;border-color:rgba(0,0,0,.15) !important;caret-color:#1f9e57 !important;}' +'body.theme-light .snk-maps-bar #snkMapsQ::placeholder,body.light .snk-maps-bar #snkMapsQ::placeholder{color:rgba(13,40,24,.45) !important;-webkit-text-fill-color:rgba(13,40,24,.45) !important;}' +
      'body.theme-light .snk-maps-suggest,body.light .snk-maps-suggest{background:#f4fff7;color:#0d2818;border-color:rgba(0,0,0,.12);}' +
      'body.theme-light .snk-maps-suggest button,body.light .snk-maps-suggest button{color:#0d2818;border-bottom-color:rgba(0,0,0,.06);}' +'body.theme-light .snk-maps-steps,body.light .snk-maps-steps{background:rgba(255,255,255,.92);color:#0d2818;}' +'body.theme-light .snk-maps-steps-head,body.light .snk-maps-steps-head{color:#1f9e57;}' +'body.theme-light .snk-maps-steps li,body.light .snk-maps-steps li{color:#0d2818;}' +'body.theme-light .snk-maps-frame .leaflet-control-zoom a,body.light .snk-maps-frame .leaflet-control-zoom a{background:#fff !important;color:#0d2818 !important;border-color:rgba(0,0,0,.15) !important;}';
    (document.head || document.documentElement).appendChild(st);
  }

  var searchSeq = 0;
  var searchAbort = null;
  function searchPlaces(q) {
    var query = String(q || '').trim();
    if (query.length < 2) return Promise.resolve([]);
    var url = '/api/maps/search?q=' + encodeURIComponent(query);
    try { if (searchAbort) searchAbort.abort(); } catch (eA) {}
    searchAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var opts = { method: 'GET', credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
    if (searchAbort) opts.signal = searchAbort.signal;
    return fetch(url, opts).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) {
          var msg = (data && (data.detail || data.message)) || ('Búsqueda no disponible (' + r.status + ')');
          if (Array.isArray(msg)) msg = msg.map(function (x) { return x.msg || x; }).join(' ');
          throw new Error(String(msg));
        }
        var list = (data && data.results) || data || [];
        return Array.isArray(list) ? list : [];
      });
    }).catch(function (err) {
      if (err && (err.name === 'AbortError' || err.code === 20)) return [];
      throw err;
    });
  }

  function formatKm(m) {
    if (m >= 1000) return (m / 1000).toFixed(1).replace(/\.0$/, '') + ' km';
    return Math.round(m) + ' m';
  }
  function formatDur(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return sec + ' s';
    var m = Math.round(sec / 60);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60);
    var mm = m % 60;
    return h + ' h' + (mm ? ' ' + mm + ' min' : '');
  }

  function getPosition() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error('Tu dispositivo no tiene geolocalización'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) { resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
        function (err) {
          var msg = 'No se pudo obtener tu ubicación';
          if (err && err.code === 1) msg = 'Activa el permiso de ubicación';
          else if (err && err.code === 3) msg = 'Tiempo de espera al localizar';
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 }
      );
    });
  }

  function osrmProfile(profile) {
    if (profile === 'foot') return 'foot';
    /* Autobús: misma red viaria que coche (OSRM público no tiene GTFS) */
    return 'driving';
  }

  function fetchRoute(from, to, profile) {
    var osrm = osrmProfile(profile);
    var url = '/api/maps/route?from_lat=' + encodeURIComponent(from.lat) +
      '&from_lon=' + encodeURIComponent(from.lon) +
      '&to_lat=' + encodeURIComponent(to.lat) +
      '&to_lon=' + encodeURIComponent(to.lon) +
      '&profile=' + encodeURIComponent(osrm);
    return fetch(url, { method: 'GET', credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) {
            var msg = (data && (data.detail || data.message)) || 'Ruta no disponible';
            if (Array.isArray(msg)) msg = msg.map(function (x) { return x.msg || x; }).join(' ');
            throw new Error(String(msg));
          }
          if (!data || data.code !== 'Ok' || !data.routes || !data.routes[0]) {
            throw new Error(profile === 'foot'
              ? 'No hay ruta a pie hasta ese sitio'
              : (profile === 'bus'
                ? 'No hay ruta en autobús hasta ese sitio'
                : 'No hay ruta en coche hasta ese sitio'));
          }
          return data.routes[0];
        });
      });
  }


  function fetchBusPlan(from, to) {
    var url = '/api/maps/bus-plan?from_lat=' + encodeURIComponent(from.lat) +
      '&from_lon=' + encodeURIComponent(from.lon) +
      '&to_lat=' + encodeURIComponent(to.lat) +
      '&to_lon=' + encodeURIComponent(to.lon);
    var opts = { method: 'GET', credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
    try {
      if (window.AbortSignal && typeof AbortSignal.timeout === 'function') {
        opts.signal = AbortSignal.timeout(35000);
      }
    } catch (eT) {}
    return fetch(url, opts)
      .then(function (r) {
        return r.text().then(function (txt) {
          var data = null;
          try { data = txt ? JSON.parse(txt) : null; } catch (eParse) { data = null; }
          if (!r.ok) {
            var msg = (data && (data.detail || data.message)) || '';
            if (Array.isArray(msg)) msg = msg.map(function (x) { return x.msg || x; }).join(' ');
            msg = String(msg || '').trim();
            if (!msg) {
              if (r.status === 401) msg = 'Inicia sesión para planificar el autobús';
              else if (r.status === 404) msg = 'No hay paradas de autobús cerca';
              else if (r.status === 503 || r.status === 502 || r.status === 504)
                msg = 'El mapa de autobuses está ocupado. Reintenta en unos segundos.';
              else msg = 'No se pudo planificar el autobús. Reintenta.';
            }
            throw new Error(msg);
          }
          if (!data) throw new Error('Respuesta inválida del planificador de autobús');
          return data;
        });
      });
  }


  function stepInstruction(step, profile) {
    if (!step) return 'Continúa';
    if (step._snkLabel) return String(step._snkLabel);
    var m = step.maneuver || {};
    var type = String(m.type || '');
    var mod = String(m.modifier || '');
    var name = String(step.name || '').trim();
    var road = name ? (' por ' + name) : '';
    var mapType = {
      'depart': 'Salida',
      'arrive': 'Has llegado',
      'turn': 'Gira',
      'new name': 'Continúa',
      'merge': 'Incorpórate',
      'ramp': 'Toma la salida',
      'on ramp': 'Entra en la incorporación',
      'off ramp': 'Toma la salida',
      'fork': 'Mantente',
      'end of road': 'Al final de la calle, gira',
      'continue': 'Sigue recto',
      'roundabout': 'En la rotonda',
      'rotary': 'En la rotonda',
      'roundabout turn': 'En la rotonda',
      'notification': 'Aviso',
      'exit roundabout': 'Sal de la rotonda',
      'exit rotary': 'Sal de la rotonda'
    };
    var mapMod = {
      'left': 'a la izquierda',
      'right': 'a la derecha',
      'sharp left': 'cerrado a la izquierda',
      'sharp right': 'cerrado a la derecha',
      'slight left': 'leve a la izquierda',
      'slight right': 'leve a la derecha',
      'straight': 'de frente',
      'uturn': 'en U'
    };
    if (type === 'arrive') return 'Has llegado a tu destino';
    if (type === 'depart') return 'Sal hacia tu destino' + road;
    if (type === 'continue' || (type === 'new name' && (!mod || mod === 'straight'))) {
      return 'Sigue recto' + road;
    }
    var head = mapType[type] || 'Continúa';
    var tail = mapMod[mod] || '';
    if (type === 'roundabout' || type === 'rotary' || type === 'roundabout turn') {
      var exit = m.exit ? ('salida ' + m.exit) : (tail || '');
      return (head + (exit ? (': ' + exit) : '') + road).trim();
    }
    return (head + (tail ? (' ' + tail) : '') + road).replace(/\s+/g, ' ').trim();
  }

  function flattenSteps(route) {
    var out = [];
    var legs = (route && route.legs) || [];
    for (var i = 0; i < legs.length; i++) {
      var steps = legs[i].steps || [];
      for (var j = 0; j < steps.length; j++) out.push(steps[j]);
    }
    return out;
  }

  function distMeters(a, b) {
    var R = 6371000;
    var toRad = function (d) { return d * Math.PI / 180; };
    var dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    var lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }

  function bearingDeg(a, b) {
    var toRad = function (d) { return d * Math.PI / 180; };
    var toDeg = function (r) { return r * 180 / Math.PI; };
    var lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    var dLon = toRad(b.lon - a.lon);
    var y = Math.sin(dLon) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function offsetLatLng(lat, lon, bearing, meters) {
    var R = 6371000;
    var br = (bearing || 0) * Math.PI / 180;
    var lat1 = lat * Math.PI / 180;
    var lon1 = lon * Math.PI / 180;
    var ang = meters / R;
    var lat2 = Math.asin(Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(br));
    var lon2 = lon1 + Math.atan2(
      Math.sin(br) * Math.sin(ang) * Math.cos(lat1),
      Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2)
    );
    return { lat: lat2 * 180 / Math.PI, lon: lon2 * 180 / Math.PI };
  }

  function nearestOnLine(latlngs, point) {
    var best = { idx: 0, lat: point.lat, lon: point.lon, dist: 1e15 };
    if (!latlngs || !latlngs.length) return best;
    for (var i = 0; i < latlngs.length; i++) {
      var pt = { lat: latlngs[i][0], lon: latlngs[i][1] };
      var d = distMeters(point, pt);
      if (d < best.dist) best = { idx: i, lat: pt.lat, lon: pt.lon, dist: d };
    }
    return best;
  }

  function arrowIconHtml(bearing) {
    var rot = (typeof bearing === 'number' && isFinite(bearing)) ? bearing : 0;
    return '<div class="snk-maps-arrow" style="transform:rotate(' + rot + 'deg)">' +
      '<svg viewBox="0 0 40 40" aria-hidden="true">' +
      '<circle cx="20" cy="20" r="18" fill="#1a73e8" fill-opacity=".22" stroke="#fff" stroke-width="2"/>' +
      '<path d="M20 6 L30 28 L20 23 L10 28 Z" fill="#1a73e8" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>' +
      '</svg></div>';
  }

  window.renderMapsApp = function renderMapsApp(container) {
    ensureCss();
    container.innerHTML =
      '<div class="snk-maps snk-noemoji">' +
        '<div class="snk-maps-bar">' +
          '<form id="snkMapsForm">' +
            '<input type="text" id="snkMapsQ" class="snk-noemoji" placeholder="¿A dónde quieres ir? (ciudad, calle, sitio…)" autocomplete="off" enterkeyhint="search" spellcheck="false">' +
            '<button type="submit" class="snk-maps-go">Ir</button>' +
          '</form>' +
          '<div class="snk-maps-modes" role="group" aria-label="Tipo de ruta">' +
            '<button type="button" class="on" id="snkMapsModeDrive" data-mode="driving" title="En coche">🚗 Coche</button>' +
            '<button type="button" id="snkMapsModeBus" data-mode="bus" title="En autobús">🚌 Bus</button>' +
            '<button type="button" id="snkMapsModeFoot" data-mode="foot" title="A pie">🚶 A pie</button>' +
          '</div>' +
          '<button type="button" class="snk-maps-loc" id="snkMapsLoc" title="Mi ubicación">📍</button>' +
          '<button type="button" class="snk-maps-route" id="snkMapsRoute" disabled title="Ruta hasta el destino">Llévame</button>' +
          '<button type="button" class="snk-maps-fs" id="snkMapsFs" title="Pantalla completa">⛶</button>' +
        '</div>' +
        '<div class="snk-maps-status" id="snkMapsStatus">Escribe un lugar real y pulsa Ir</div>' +
        '<div class="snk-maps-navbanner" id="snkMapsNav"></div>' +
        '<div class="snk-maps-stage">' +
          '<div class="snk-maps-frame" id="snkMapsFrame"></div>' +
          '<div class="snk-maps-suggest" id="snkMapsSuggest" role="listbox"></div>' +
          '<button type="button" class="snk-maps-fs-exit" id="snkMapsFsExit" title="Salir de pantalla completa">✕ Salir</button>' +
        '</div>' +
        '<div class="snk-maps-steps" id="snkMapsSteps">' +
          '<div class="snk-maps-steps-head"><span>Indicaciones</span>' +
            '<button type="button" id="snkMapsStepsClose">Cerrar</button></div>' +
          '<ol id="snkMapsStepsList"></ol>' +
        '</div>' +
      '</div>';

    var form = container.querySelector('#snkMapsForm');
    var input = container.querySelector('#snkMapsQ');
    var statusEl = container.querySelector('#snkMapsStatus');
    var frame = container.querySelector('#snkMapsFrame');
    var suggest = container.querySelector('#snkMapsSuggest');
    var locBtn = container.querySelector('#snkMapsLoc');
    var routeBtn = container.querySelector('#snkMapsRoute');
    var fsBtn = container.querySelector('#snkMapsFs');
    var fsExitBtn = container.querySelector('#snkMapsFsExit');
    var mapsRoot = container.querySelector('.snk-maps');
    var modeDriveBtn = container.querySelector('#snkMapsModeDrive');
    var modeBusBtn = container.querySelector('#snkMapsModeBus');
    var modeFootBtn = container.querySelector('#snkMapsModeFoot');
    var stepsBox = container.querySelector('#snkMapsSteps');
    var stepsList = container.querySelector('#snkMapsStepsList');
    var stepsClose = container.querySelector('#snkMapsStepsClose');
    var navBanner = container.querySelector('#snkMapsNav');

    var map = null, destMarker = null, meMarker = null, routeLine = null, doneLine = null;
    var dest = null, me = null;
    var routeProfile = 'driving';
    var destroyed = false;
    var searchT = null;
    var navSteps = [];
    var navIdx = 0;
    var navWatch = null;
    var navActive = false;
    var routeCoords = [];
    var navBearing = 0;
    var lastNavPos = null;
    var boardMarker = null, alightMarker = null;

    function setStatus(msg, kind) {
      statusEl.textContent = msg || '';
      statusEl.className = 'snk-maps-status' + (kind ? ' ' + kind : '');
    }
    function closeSuggest() { suggest.classList.remove('open'); suggest.innerHTML = ''; }
    function updateRouteBtn() { routeBtn.disabled = !dest; }

    function clearRoute() {
      if (routeLine && map) { try { map.removeLayer(routeLine); } catch (e) {} }
      if (doneLine && map) { try { map.removeLayer(doneLine); } catch (e2) {} }
      if (boardMarker && map) { try { map.removeLayer(boardMarker); } catch (e3) {} }
      if (alightMarker && map) { try { map.removeLayer(alightMarker); } catch (e4) {} }
      routeLine = null;
      doneLine = null;
      boardMarker = null;
      alightMarker = null;
      routeCoords = [];
      stopNav(false);
      navSteps = [];
      navIdx = 0;
      if (stepsList) stepsList.innerHTML = '';
      if (stepsBox) stepsBox.classList.remove('open');
      if (navBanner) { navBanner.classList.remove('open'); navBanner.textContent = ''; }
      if (frame) frame.classList.remove('nav-follow');
    }
    function stopNav(keepBanner) {
      navActive = false;
      if (navWatch != null) {
        try { navigator.geolocation.clearWatch(navWatch); } catch (eW) {}
        navWatch = null;
      }
      if (!keepBanner && navBanner) { navBanner.classList.remove('open'); }
      if (frame) frame.classList.remove('nav-follow');
      if (me && map) setMe(me, false, false);
    }
    function showSteps(route) {
      navSteps = flattenSteps(route);
      if (!stepsList) return;
      stepsList.innerHTML = '';
      navSteps.forEach(function (step, i) {
        var li = document.createElement('li');
        li.dataset.idx = String(i);
        if (i === 0) li.classList.add('on');
        var dist = formatKm(step.distance || 0);
        var dur = formatDur(step.duration || 0);
        li.innerHTML = '<span class="n">' + (i + 1) + '</span><span class="txt">' +
          stepInstruction(step, routeProfile).replace(/</g, '&lt;') +
          '<span class="meta">' + dist + ' · ' + dur + '</span></span>';
        li.addEventListener('click', function () {
          focusStep(i, true);
        });
        stepsList.appendChild(li);
      });
      if (stepsBox) stepsBox.classList.add('open');
      focusStep(0, false);
    }
    function focusStep(i, fly) {
      if (!navSteps.length) return;
      navIdx = Math.max(0, Math.min(i, navSteps.length - 1));
      var step = navSteps[navIdx];
      if (stepsList) {
        var items = stepsList.querySelectorAll('li');
        for (var k = 0; k < items.length; k++) items[k].classList.toggle('on', k === navIdx);
        if (items[navIdx]) try { items[navIdx].scrollIntoView({ block: 'nearest' }); } catch (eS) {}
      }
      var loc = step && step.maneuver && step.maneuver.location;
      if (fly && map && loc && !navActive) {
        try { map.flyTo([loc[1], loc[0]], Math.max(map.getZoom(), 16), { duration: 0.6 }); } catch (eF) {}
      }
      if (navBanner) {
        navBanner.classList.add('open');
        var next = stepInstruction(step, routeProfile);
        var meta = formatKm(step.distance || 0) + ' · paso ' + (navIdx + 1) + '/' + navSteps.length;
        navBanner.innerHTML = next.replace(/</g, '&lt;') + '<span class="sub">' + meta + '</span>';
      }
    }
    function updateRouteProgress(here) {
      if (!routeCoords.length || !map || !window.L) return null;
      var near = nearestOnLine(routeCoords, here);
      var idx = near.idx;
      var look = Math.min(routeCoords.length - 1, idx + 3);
      if (look > idx) {
        navBearing = bearingDeg(
          { lat: routeCoords[idx][0], lon: routeCoords[idx][1] },
          { lat: routeCoords[look][0], lon: routeCoords[look][1] }
        );
      }
      var done = routeCoords.slice(0, idx + 1);
      var rest = routeCoords.slice(idx);
      if (doneLine && map) { try { map.removeLayer(doneLine); } catch (e0) {} doneLine = null; }
      if (routeLine && map) { try { map.removeLayer(routeLine); } catch (e1) {} routeLine = null; }
      var color = routeProfile === 'foot' ? '#5ec8ff' : (routeProfile === 'bus' ? '#f5a524' : '#1a73e8');
      if (done.length > 1) {
        doneLine = window.L.polyline(done, { color: '#8899aa', weight: 5, opacity: 0.45 }).addTo(map);
      }
      if (rest.length > 1) {
        routeLine = window.L.polyline(rest, { color: color, weight: 6, opacity: 0.95 }).addTo(map);
      }
      return near;
    }

    function startNav() {
      if (!navSteps.length) return;
      navActive = true;
      lastNavPos = null;
      if (frame) frame.classList.add('nav-follow');
      focusStep(navIdx || 0, false);
      if (me) {
        updateRouteProgress(me);
        setMe(me, true, true);
      }
      if (!navigator.geolocation) return;
      if (navWatch != null) try { navigator.geolocation.clearWatch(navWatch); } catch (e0) {}
      navWatch = navigator.geolocation.watchPosition(function (pos) {
        if (destroyed || !navActive) return;
        var here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        var gpsHeading = pos.coords.heading;
        if (typeof gpsHeading === 'number' && isFinite(gpsHeading) && pos.coords.speed > 0.8) {
          navBearing = gpsHeading;
        } else if (lastNavPos && distMeters(lastNavPos, here) > 2.5) {
          navBearing = bearingDeg(lastNavPos, here);
        }
        lastNavPos = here;
        var near = updateRouteProgress(here);
        var follow = (near && near.dist < 80)
          ? { lat: near.lat, lon: near.lon }
          : here;
        setMe(follow, true, true);
        var guard = 0;
        while (navIdx < navSteps.length - 1 && guard++ < 5) {
          var step = navSteps[navIdx];
          var loc = step && step.maneuver && step.maneuver.location;
          if (!loc) break;
          var d = distMeters(here, { lat: loc[1], lon: loc[0] });
          var threshold = Math.max(28, Math.min(70, (step.distance || 40) * 0.35));
          if (d <= threshold) focusStep(navIdx + 1, false);
          else break;
        }
        if (navBanner && navSteps[navIdx]) {
          var st = navSteps[navIdx];
          var ml = st.maneuver && st.maneuver.location;
          var rem = ml ? distMeters(here, { lat: ml[1], lon: ml[0] }) : (st.distance || 0);
          var next = stepInstruction(st, routeProfile);
          navBanner.classList.add('open');
          navBanner.innerHTML = '<span class="turn">' + next.replace(/</g, '&lt;') + '</span>' +
            '<span class="sub">En ' + formatKm(rem) + ' · sigue la línea · paso ' +
            (navIdx + 1) + '/' + navSteps.length + '</span>';
        }
        if (navIdx >= navSteps.length - 1) {
          var last = navSteps[navSteps.length - 1];
          var ll = last && last.maneuver && last.maneuver.location;
          if (ll && distMeters(here, { lat: ll[1], lon: ll[0] }) < 40) {
            if (navBanner) {
              navBanner.classList.add('open');
              navBanner.innerHTML = 'Has llegado a tu destino<span class="sub">Navegación finalizada</span>';
            }
            stopNav(true);
          }
        }
      }, function () {}, { enableHighAccuracy: true, maximumAge: 500, timeout: 8000 });
    }

    function setDest(place, opts) {
      if (!map || !window.L) return;
      opts = opts || {};
      dest = { lat: Number(place.lat), lon: Number(place.lon), name: place.display_name || place.name || 'Destino' };
      if (destMarker) map.removeLayer(destMarker);
      destMarker = window.L.marker([dest.lat, dest.lon]).addTo(map)
        .bindPopup('<strong>Destino</strong><br>' + dest.name.replace(/</g, '&lt;'));
      destMarker.openPopup();
      clearRoute();
      map.flyTo([dest.lat, dest.lon], Math.max(map.getZoom(), 14), { duration: 0.85 });
      input.value = place.name || (place.display_name || '').split(',')[0] || input.value;
      updateRouteBtn();
      closeSuggest();
      if (opts.route === false) {
        setStatus('Destino: ' + (place.display_name || dest.name) + ' · pulsa Llévame', 'ok');
        return;
      }
      setStatus('Destino: ' + (place.display_name || dest.name) + ' · calculando ruta…', 'ok');
      doRoute(false);
    }

    function followCamera(pos) {
      if (!map || !pos || !navActive) return;
      try {
        var z = map.getZoom();
        if (z < 17) z = 17;
        if (z > 19) z = 19;
        /* Centro un poco delante de la flecha para ver la ruta que viene */
        var ahead = offsetLatLng(pos.lat, pos.lon, navBearing, 55);
        map.setView([ahead.lat, ahead.lon], z, { animate: true, duration: 0.35 });
      } catch (eC) {
        try { map.panTo([pos.lat, pos.lon], { animate: true, duration: 0.35 }); } catch (eP) {}
      }
    }

    function setMe(pos, fly, navArrow) {
      if (!map || !window.L) return;
      me = pos;
      var useArrow = !!(navArrow || navActive);
      if (useArrow) {
        if (meMarker && meMarker.setLatLng && meMarker.getElement) {
          try { meMarker.setLatLng([pos.lat, pos.lon]); } catch (eS) {}
          try {
            var el = meMarker.getElement();
            var arrow = el && el.querySelector && el.querySelector('.snk-maps-arrow');
            if (arrow) arrow.style.transform = 'rotate(' + (navBearing || 0) + 'deg)';
            else {
              meMarker.setIcon(window.L.divIcon({
                className: '',
                html: arrowIconHtml(navBearing),
                iconSize: [40, 40],
                iconAnchor: [20, 20]
              }));
            }
          } catch (eR) {}
        } else {
          if (meMarker) try { map.removeLayer(meMarker); } catch (e0) {}
          var ic = window.L.divIcon({
            className: '',
            html: arrowIconHtml(navBearing),
            iconSize: [40, 40],
            iconAnchor: [20, 20]
          });
          meMarker = window.L.marker([pos.lat, pos.lon], { icon: ic, zIndexOffset: 800 }).addTo(map);
        }
        followCamera(pos);
      } else {
        if (meMarker) try { map.removeLayer(meMarker); } catch (e1) {}
        meMarker = window.L.circleMarker([pos.lat, pos.lon], {
          radius: 8, color: '#04170c', weight: 2, fillColor: '#34d17a', fillOpacity: 1
        }).addTo(map).bindPopup('Estás aquí');
        if (fly) map.flyTo([pos.lat, pos.lon], Math.max(map.getZoom(), 15), { duration: 0.9 });
      }
    }

    function showSuggest(list) {
      suggest.innerHTML = '';
      if (!list || !list.length) { closeSuggest(); return; }
      list.forEach(function (p) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'option');
        var main = p.name || (p.display_name || '').split(',')[0] || 'Lugar';
        b.innerHTML = main.replace(/</g, '&lt;') +
          '<span class="snk-maps-sug-sub">' + String(p.display_name || '').replace(/</g, '&lt;') + '</span>';
        b.addEventListener('click', function () { setDest(p); });
        suggest.appendChild(b);
      });
      suggest.classList.add('open');
    }

    var searching = false;
    function doSearch(q, fromSuggestOnly) {
      q = String(q || '').trim();
      if (!q) { setStatus('Escribe un lugar', 'err'); return Promise.resolve(); }
      if (searching && !fromSuggestOnly) return Promise.resolve();
      var mySeq = ++searchSeq;
      if (!fromSuggestOnly) {
        searching = true;
        setStatus('Buscando «' + q + '»…');
        closeSuggest();
        try { if (window.snakeCursor && window.snakeCursor.beginBusy) window.snakeCursor.beginBusy(); } catch (eB) {}
      }
      return searchPlaces(q).then(function (list) {
        if (destroyed || mySeq !== searchSeq) return;
        if (!list || !list.length) {
          if (!fromSuggestOnly) setStatus('No encontré «' + q + '». Prueba con ciudad (ej. Madrid) o el nombre completo.', 'err');
          else closeSuggest();
          return;
        }
        if (fromSuggestOnly) {
          showSuggest(list);
          return;
        }
        /* Ir: ir siempre al mejor resultado */
        setDest(list[0]);
        if (list.length > 1) {
          /* ofrecer alternativas sin tapar la barra */
          showSuggest(list);
          setStatus('Destino: ' + (list[0].display_name || list[0].name) + ' · toca otra opción si no es esa', 'ok');
        }
      }).catch(function (err) {
        if (!destroyed && mySeq === searchSeq && !fromSuggestOnly) {
          setStatus((err && err.message) || 'Error al buscar', 'err');
        }
      }).finally(function () {
        if (!fromSuggestOnly) {
          searching = false;
          try { if (window.snakeCursor && window.snakeCursor.endBusy) window.snakeCursor.endBusy(); } catch (eE) {}
        }
      });
    }

    function setRouteProfile(profile) {
      if (profile === 'foot') routeProfile = 'foot';
      else if (profile === 'bus') routeProfile = 'bus';
      else routeProfile = 'driving';
      if (modeDriveBtn) modeDriveBtn.classList.toggle('on', routeProfile === 'driving');
      if (modeBusBtn) modeBusBtn.classList.toggle('on', routeProfile === 'bus');
      if (modeFootBtn) modeFootBtn.classList.toggle('on', routeProfile === 'foot');
      if (me && dest) {
        doRoute(true);
      } else {
        setStatus(routeProfile === 'foot'
          ? 'Modo a pie. Pulsa Llévame para la ruta.'
          : (routeProfile === 'bus'
            ? 'Modo autobús. Pulsa Llévame para la ruta.'
            : 'Modo coche. Pulsa Llévame para la ruta.'));
      }
    }
    function stopIcon(label, tone) {
      var bg = tone === 'alight' ? '#f5a524' : '#1f9e57';
      return window.L.divIcon({
        className: '',
        html: '<div style="background:' + bg + ';color:#04170c;font:700 11px/1 Outfit,system-ui,sans-serif;' +
          'padding:5px 8px;border-radius:999px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);' +
          'white-space:nowrap;transform:translate(-50%,-120%)">' + label + '</div>',
        iconSize: [1, 1],
        iconAnchor: [0, 0]
      });
    }

    function mergeBusTrip(walk1, busLeg, walk2, board, alight) {
      var coords = [];
      function appendGeom(route) {
        var c = (route.geometry && route.geometry.coordinates) || [];
        for (var i = 0; i < c.length; i++) {
          var ll = [c[i][1], c[i][0]];
          if (!coords.length || coords[coords.length - 1][0] !== ll[0] || coords[coords.length - 1][1] !== ll[1]) {
            coords.push(ll);
          }
        }
      }
      appendGeom(walk1);
      appendGeom(busLeg);
      appendGeom(walk2);
      var steps = [];
      steps.push({
        name: board.name || 'Parada',
        distance: walk1.distance || 0,
        duration: walk1.duration || 0,
        maneuver: {
          type: 'depart',
          modifier: 'straight',
          location: [board.lon, board.lat]
        },
        _snkLabel: 'Camina hasta la parada «' + (board.name || 'Parada') + '»'
      });
      flattenSteps(walk1).forEach(function (s) { steps.push(s); });
      steps.push({
        name: alight.name || 'Parada',
        distance: busLeg.distance || 0,
        duration: busLeg.duration || 0,
        maneuver: {
          type: 'notification',
          modifier: 'straight',
          location: [board.lon, board.lat]
        },
        _snkLabel: 'Autobús hasta «' + (alight.name || 'parada de bajada') + '»'
      });
      flattenSteps(busLeg).forEach(function (s) { steps.push(s); });
      steps.push({
        name: dest.name || 'Destino',
        distance: walk2.distance || 0,
        duration: walk2.duration || 0,
        maneuver: {
          type: 'notification',
          modifier: 'straight',
          location: [alight.lon, alight.lat]
        },
        _snkLabel: 'Baja y camina hasta el destino'
      });
      flattenSteps(walk2).forEach(function (s) { steps.push(s); });
      var dist = (walk1.distance || 0) + (busLeg.distance || 0) + (walk2.distance || 0);
      var dur = (walk1.duration || 0) + (busLeg.duration || 0) + (walk2.duration || 0);
      return {
        distance: dist,
        duration: dur,
        geometry: { coordinates: coords.map(function (ll) { return [ll[1], ll[0]]; }) },
        legs: [{ steps: steps }],
        _snkCoordsLatLng: coords,
        _board: board,
        _alight: alight
      };
    }

    function doRoute(reuseMe) {
      if (!dest) { setStatus('Primero elige un destino', 'err'); return; }
      var label = routeProfile === 'foot' ? 'a pie' : (routeProfile === 'bus' ? 'en autobús' : 'en coche');
      setStatus(reuseMe && me ? ('Calculando ruta ' + label + '…') : 'Obteniendo tu ubicación…');
      try { if (window.snakeCursor && window.snakeCursor.beginBusy) window.snakeCursor.beginBusy(); } catch (eB) {}
      var posP = (reuseMe && me) ? Promise.resolve(me) : getPosition();
      posP.then(function (pos) {
        if (destroyed) return null;
        setMe(pos, false);
        if (routeProfile !== 'bus') {
          setStatus('Calculando ruta ' + label + '…');
          return fetchRoute(pos, dest, routeProfile).then(function (route) {
            return { kind: 'simple', route: route, pos: pos };
          });
        }
        setStatus('Buscando parada de autobús hacia tu destino…');
        return fetchBusPlan(pos, dest).then(function (plan) {
          if (destroyed) return null;
          var board = plan.board;
          var alight = plan.alight;
          setStatus('Parada «' + board.name + '» · calculando caminar + bus…');
          return Promise.all([
            fetchRoute(pos, board, 'foot'),
            fetchRoute(board, alight, 'driving'),
            fetchRoute(alight, dest, 'foot')
          ]).then(function (legs) {
            var merged = mergeBusTrip(legs[0], legs[1], legs[2], board, alight);
            return { kind: 'bus', route: merged, pos: pos, plan: plan };
          });
        });
      }).then(function (pack) {
        if (destroyed || !pack || !pack.route || !map || !window.L) return;
        var route = pack.route;
        if (routeLine && map) { try { map.removeLayer(routeLine); } catch (eR) {} }
        if (doneLine && map) { try { map.removeLayer(doneLine); } catch (eD0) {} }
        if (boardMarker && map) { try { map.removeLayer(boardMarker); } catch (eB0) {} }
        if (alightMarker && map) { try { map.removeLayer(alightMarker); } catch (eA0) {} }
        routeLine = null;
        doneLine = null;
        boardMarker = null;
        alightMarker = null;
        stopNav(false);

        var coords;
        if (route._snkCoordsLatLng && route._snkCoordsLatLng.length) {
          coords = route._snkCoordsLatLng;
        } else {
          coords = (route.geometry && route.geometry.coordinates || []).map(function (c) {
            return [c[1], c[0]];
          });
        }
        if (!coords.length) throw new Error('Ruta vacía');
        routeCoords = coords;

        var color = routeProfile === 'foot' ? '#5ec8ff' : (routeProfile === 'bus' ? '#f5a524' : '#1a73e8');
        routeLine = window.L.polyline(coords, { color: color, weight: 6, opacity: 0.95 }).addTo(map);

        if (pack.kind === 'bus' && route._board && route._alight) {
          boardMarker = window.L.marker([route._board.lat, route._board.lon], {
            icon: stopIcon('🚌 ' + (route._board.name || 'Subida'), 'board'),
            zIndexOffset: 600
          }).addTo(map).bindPopup('<strong>Sube aquí</strong><br>' + String(route._board.name || '').replace(/</g, '&lt;'));
          alightMarker = window.L.marker([route._alight.lat, route._alight.lon], {
            icon: stopIcon('🚏 ' + (route._alight.name || 'Bajada'), 'alight'),
            zIndexOffset: 600
          }).addTo(map).bindPopup('<strong>Baja aquí</strong><br>' + String(route._alight.name || '').replace(/</g, '&lt;'));
        }

        map.fitBounds(routeLine.getBounds(), { padding: [36, 36] });
        if (coords.length > 1 && me) {
          var near0 = nearestOnLine(coords, me);
          var look0 = Math.min(coords.length - 1, near0.idx + 4);
          navBearing = bearingDeg(
            { lat: coords[near0.idx][0], lon: coords[near0.idx][1] },
            { lat: coords[look0][0], lon: coords[look0][1] }
          );
        }
        showSteps(route);
        startNav();
        if (pack.kind === 'bus') {
          var bn = (route._board && route._board.name) || 'la parada';
          setStatus('Ve a pie a «' + bn + '» y sigue la línea en bus · ' +
            formatKm(route.distance) + ' · ' + formatDur(route.duration), 'ok');
          if (navBanner) {
            navBanner.classList.add('open');
            navBanner.innerHTML = '<span class="turn">Camina hasta la parada «' +
              String(bn).replace(/</g, '&lt;') + '»</span>' +
              '<span class="sub">Luego autobús hasta cerca del destino</span>';
          }
        } else {
          setStatus('Sigue la flecha por la línea · ' + formatKm(route.distance) + ' · ' + formatDur(route.duration), 'ok');
        }
      }).catch(function (err) {
        if (destroyed) return;
        var msg = (err && err.message) || 'No se pudo trazar la ruta';
        if (/ubicación|localizar|permiso|geolocation|Activa/i.test(msg)) {
          setStatus(msg + ' · el destino ya está marcado; activa ubicación y pulsa Llévame', 'err');
        } else {
          setStatus(msg, 'err');
        }
      }).finally(function () {
        try { if (window.snakeCursor && window.snakeCursor.endBusy) window.snakeCursor.endBusy(); } catch (eE) {}
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(searchT);
      doSearch(input.value, false);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(searchT);
        doSearch(input.value, false);
      }
    });
    input.addEventListener('input', function () {
      clearTimeout(searchT);
      var q = input.value.trim();
      if (q.length < 3) { closeSuggest(); return; }
      searchT = setTimeout(function () {
        doSearch(q, true);
      }, 320);
    });
    locBtn.addEventListener('click', function () {
      setStatus('Localizando…');
      getPosition().then(function (pos) {
        if (destroyed) return;
        setMe(pos, true);
        setStatus('Ubicación actual marcada', 'ok');
      }).catch(function (err) {
        if (!destroyed) setStatus((err && err.message) || 'Sin ubicación', 'err');
      });
    });
    if (modeDriveBtn) modeDriveBtn.addEventListener('click', function () { setRouteProfile('driving'); });
    if (modeBusBtn) modeBusBtn.addEventListener('click', function () { setRouteProfile('bus'); });
    if (modeFootBtn) modeFootBtn.addEventListener('click', function () { setRouteProfile('foot'); });
    routeBtn.addEventListener('click', function () { doRoute(false); });

    var fsCssOnly = false;
    function mapsFsActive() {
      try {
        var cur = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
        if (cur && mapsRoot && (cur === mapsRoot || mapsRoot.contains(cur))) return true;
      } catch (e0) {}
      return !!(mapsRoot && mapsRoot.classList.contains('is-fs'));
    }
    function syncFsUi() {
      var on = mapsFsActive();
      if (fsBtn) {
        fsBtn.classList.toggle('on', on);
        fsBtn.textContent = on ? '⛶' : '⛶';
        fsBtn.title = on ? 'Salir de pantalla completa' : 'Pantalla completa';
        fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      if (mapsRoot && !document.fullscreenElement && !document.webkitFullscreenElement) {
        /* keep class in sync when browser FS exits */
      }
      setTimeout(function () {
        if (map) try { map.invalidateSize({ animate: false }); } catch (eI) {}
      }, 60);
      setTimeout(function () {
        if (map) try { map.invalidateSize({ animate: false }); } catch (eI2) {}
      }, 280);
    }
    function enterMapsFs() {
      if (!mapsRoot) return;
      fsCssOnly = false;
      var req = mapsRoot.requestFullscreen || mapsRoot.webkitRequestFullscreen || mapsRoot.msRequestFullscreen;
      var p = null;
      try {
        if (req) p = req.call(mapsRoot);
      } catch (eR) { p = null; }
      Promise.resolve(p).then(function () {
        mapsRoot.classList.add('is-fs');
        syncFsUi();
        setStatus('Pantalla completa · Esc o ✕ para salir', 'ok');
      }).catch(function () {
        fsCssOnly = true;
        mapsRoot.classList.add('is-fs');
        syncFsUi();
        setStatus('Pantalla completa · Esc o ✕ para salir', 'ok');
      });
    }
    function exitMapsFs() {
      if (!mapsRoot) return;
      var cur = null;
      try { cur = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement; } catch (eC) {}
      if (cur) {
        var ex = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
        try { if (ex) ex.call(document); } catch (eE) {}
      }
      mapsRoot.classList.remove('is-fs');
      fsCssOnly = false;
      syncFsUi();
    }
    function toggleMapsFs() {
      if (mapsFsActive()) exitMapsFs();
      else enterMapsFs();
    }
    if (fsBtn) fsBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleMapsFs();
    });
    if (fsExitBtn) fsExitBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      exitMapsFs();
    });
    function onFsChange() {
      try {
        var cur = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
        if (!cur && mapsRoot && !fsCssOnly) mapsRoot.classList.remove('is-fs');
        if (cur && mapsRoot && (cur === mapsRoot || mapsRoot.contains(cur))) mapsRoot.classList.add('is-fs');
      } catch (eF) {}
      syncFsUi();
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    function onFsKey(e) {
      if (!mapsRoot || destroyed) return;
      if (e.key === 'Escape' && mapsFsActive()) {
        e.preventDefault();
        exitMapsFs();
      } else if ((e.key === 'f' || e.key === 'F') && mapsRoot.contains(document.activeElement || null) && (e.altKey || e.ctrlKey)) {
        /* ignore */
      }
    }
    document.addEventListener('keydown', onFsKey, true);
    if (stepsClose) stepsClose.addEventListener('click', function () {
      if (stepsBox) stepsBox.classList.remove('open');
    });
    function onDoc(e) {
      if (destroyed) return;
      if (!container.contains(e.target)) closeSuggest();
      else if (!suggest.contains(e.target) && e.target !== input && !(e.target.closest && e.target.closest('#snkMapsForm'))) closeSuggest();
    }
    document.addEventListener('click', onDoc);

    loadLeaflet().then(function (L) {
      if (destroyed) return;
      function forceMapBox() {
        try {
          var stage = frame.parentNode;
          var win = container && container.closest ? container.closest('.app-window') : null;
          var bodyH = (container && container.clientHeight) || 0;
          var winH = (win && win.clientHeight) || 0;
          var barH = 0;
          try {
            var bar = mapsRoot && mapsRoot.querySelector('.snk-maps-bar');
            var st = mapsRoot && mapsRoot.querySelector('.snk-maps-status');
            var nb = mapsRoot && mapsRoot.querySelector('.snk-maps-navbanner');
            barH = ((bar && bar.offsetHeight) || 0) + ((st && st.offsetHeight) || 0) + ((nb && nb.offsetHeight) || 0);
          } catch (eB) {}
          var target = bodyH;
          if (target < 120 && winH > 80) target = winH - 48;
          if (target < 120) target = Math.max(280, Math.floor((window.innerHeight || 640) * 0.5));
          var stageH = Math.max(200, target - barH - 8);
          if (mapsRoot) {
            mapsRoot.style.flex = '1 1 auto';
            mapsRoot.style.height = '100%';
            mapsRoot.style.minHeight = target + 'px';
          }
          if (stage) {
            stage.style.position = 'relative';
            stage.style.flex = '1 1 auto';
            stage.style.minHeight = stageH + 'px';
            stage.style.height = stageH + 'px';
          }
          frame.style.position = 'absolute';
          frame.style.left = '0';
          frame.style.top = '0';
          frame.style.right = '0';
          frame.style.bottom = '0';
          frame.style.width = '100%';
          frame.style.height = '100%';
          frame.style.minHeight = stageH + 'px';
        } catch (eSz) {}
      }
      forceMapBox();
      map = L.map(frame, { zoomControl: true, attributionControl: true }).setView([40.4168, -3.7038], 5);
      try {
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: '/static/assets/leaflet-marker-icon-2x.png',
          iconUrl: '/static/assets/leaflet-marker-icon.png',
          shadowUrl: '/static/assets/leaflet-marker-shadow.png'
        });
      } catch (eIc) {}
      var tiles = L.tileLayer('/api/maps/tile/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      });
      tiles.addTo(map);
      map.on('click', function (ev) {
        setDest({
          lat: ev.latlng.lat,
          lon: ev.latlng.lng,
          display_name: ev.latlng.lat.toFixed(5) + ', ' + ev.latlng.lng.toFixed(5),
          name: 'Punto en el mapa'
        }, { route: false });
      });
      function fixSize() {
        try {
          forceMapBox();
          map.invalidateSize({ animate: false });
        } catch (e) {}
      }
      fixSize();
      [40, 120, 280, 500, 900, 1500, 2500].forEach(function (ms) { setTimeout(fixSize, ms); });
      requestAnimationFrame(function () { requestAnimationFrame(fixSize); });
      try {
        var winEl = container && container.closest ? container.closest('.app-window') : null;
        if (winEl) {
          winEl.addEventListener('animationend', function onAe() {
            fixSize();
          });
          winEl.addEventListener('transitionend', function onTe() {
            fixSize();
          });
        }
      } catch (eWin) {}
      setStatus('Escribe un lugar o toca el mapa');
    }).catch(function (err) {
      setStatus((err && err.message) || 'No se pudo cargar el mapa', 'err');
    });

    var ro = null;
    try {
      if (window.ResizeObserver) {
        ro = new ResizeObserver(function () {
          if (map) try { map.invalidateSize(); } catch (e) {}
        });
        ro.observe(frame);
      }
    } catch (eRo) {}

    return function cleanup() {
      destroyed = true;
      clearTimeout(searchT);
      stopNav(false);
      try { exitMapsFs(); } catch (eFs) {}
      try { document.removeEventListener('click', onDoc); } catch (eD) {}
      try { document.removeEventListener('fullscreenchange', onFsChange); } catch (eF1) {}
      try { document.removeEventListener('webkitfullscreenchange', onFsChange); } catch (eF2) {}
      try { document.removeEventListener('keydown', onFsKey, true); } catch (eK) {}
      try { if (ro) ro.disconnect(); } catch (e) {}
      try { if (map) map.remove(); } catch (e2) {}
      map = null;
    };
  };
})();
