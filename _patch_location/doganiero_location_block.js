  /* Doganiero AI — ubicación del usuario (Geolocation + reverse geocode) */
  // No hay clave de Google Maps Geocoding en el proyecto (la AIza de Gemini
  // no tiene Maps activado). Usamos Nominatim/OSM + enlace a Google Maps.
  var DOGANIERO_MAPS_GEOCODE_KEY = ''; // vacío a propósito; no inventar secretos
  var DOGANIERO_LOC_STALE_MS = 4 * 60 * 1000;
  var doganieroUserLocation = {
    status: 'idle', // idle|pending|ok|denied|unavailable|error
    lat: null,
    lng: null,
    accuracy: null,
    label: '',
    road: '',
    city: '',
    region: '',
    country: '',
    postcode: '',
    mapsUrl: '',
    source: '',
    updatedAt: 0,
    message: ''
  };
  var _dogLocInflight = null;
  var _dogLocWatchers = [];

  function doganieroLocNotify(){
    _dogLocWatchers.slice().forEach(function(fn){
      try { fn(doganieroUserLocation); } catch(e){}
    });
  }

  function onDoganieroLocation(fn){
    if(typeof fn === 'function') _dogLocWatchers.push(fn);
    return function(){
      _dogLocWatchers = _dogLocWatchers.filter(function(f){ return f !== fn; });
    };
  }

  function doganieroLocIsFresh(){
    return doganieroUserLocation.status === 'ok' &&
      doganieroUserLocation.updatedAt &&
      (Date.now() - doganieroUserLocation.updatedAt) < DOGANIERO_LOC_STALE_MS;
  }

  function formatDoganieroMapsLabel(parts){
    var bits = [];
    if(parts.road){
      bits.push(parts.house ? (parts.road + ' ' + parts.house) : parts.road);
    }
    if(parts.neighbourhood && parts.neighbourhood !== parts.city) bits.push(parts.neighbourhood);
    if(parts.city) bits.push(parts.city);
    if(parts.region && parts.region !== parts.city) bits.push(parts.region);
    if(parts.postcode) bits.push(parts.postcode);
    if(parts.country) bits.push(parts.country);
    return bits.filter(Boolean).join(', ');
  }

  function reverseGeocodeDoganiero(lat, lng){
    var latN = Number(lat), lngN = Number(lng);
    if(!isFinite(latN) || !isFinite(lngN)){
      return Promise.reject(new Error('Coordenadas inválidas'));
    }
    if(DOGANIERO_MAPS_GEOCODE_KEY){
      var gUrl = 'https://maps.googleapis.com/maps/api/geocode/json?latlng=' +
        encodeURIComponent(latN + ',' + lngN) +
        '&language=es&key=' + encodeURIComponent(DOGANIERO_MAPS_GEOCODE_KEY);
      return fetch(gUrl).then(function(r){ return r.json(); }).then(function(data){
        if(!data || data.status !== 'OK' || !data.results || !data.results.length){
          throw new Error((data && data.error_message) || (data && data.status) || 'Geocoding Google falló');
        }
        var best = data.results[0];
        var comps = {};
        (best.address_components || []).forEach(function(c){
          (c.types || []).forEach(function(t){ comps[t] = c.long_name; });
        });
        var parts = {
          road: comps.route || '',
          house: comps.street_number || '',
          neighbourhood: comps.neighborhood || comps.sublocality || comps.sublocality_level_1 || '',
          city: comps.locality || comps.administrative_area_level_2 || '',
          region: comps.administrative_area_level_1 || '',
          postcode: comps.postal_code || '',
          country: comps.country || ''
        };
        return {
          label: best.formatted_address || formatDoganieroMapsLabel(parts),
          parts: parts,
          source: 'google_maps'
        };
      });
    }
    // Nominatim (OpenStreetMap) — nombres estilo Maps, idioma español
    var nUrl = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' +
      encodeURIComponent(latN) + '&lon=' + encodeURIComponent(lngN) +
      '&accept-language=es&addressdetails=1&zoom=18';
    return fetch(nUrl, {
      headers: {
        'Accept': 'application/json'
      }
    }).then(function(r){
      if(!r.ok) throw new Error('Nominatim HTTP ' + r.status);
      return r.json();
    }).then(function(data){
      var a = (data && data.address) || {};
      var parts = {
        road: a.road || a.pedestrian || a.footway || a.path || a.square || '',
        house: a.house_number || '',
        neighbourhood: a.neighbourhood || a.suburb || a.quarter || a.city_district || '',
        city: a.city || a.town || a.village || a.municipality || a.hamlet || '',
        region: a.state || a.region || a.province || '',
        postcode: a.postcode || '',
        country: a.country || ''
      };
      var label = (data && data.display_name) || formatDoganieroMapsLabel(parts);
      return { label: label, parts: parts, source: 'nominatim_osm' };
    });
  }

  function applyDoganieroGeoPosition(pos){
    var coords = pos && pos.coords;
    if(!coords) return Promise.reject(new Error('Sin coordenadas'));
    var lat = coords.latitude;
    var lng = coords.longitude;
    var accuracy = coords.accuracy;
    return reverseGeocodeDoganiero(lat, lng).then(function(geo){
      var parts = geo.parts || {};
      doganieroUserLocation.status = 'ok';
      doganieroUserLocation.lat = lat;
      doganieroUserLocation.lng = lng;
      doganieroUserLocation.accuracy = accuracy;
      doganieroUserLocation.label = geo.label || '';
      doganieroUserLocation.road = formatDoganieroMapsLabel({
        road: parts.road, house: parts.house
      }) || parts.road || '';
      doganieroUserLocation.city = parts.city || '';
      doganieroUserLocation.region = parts.region || '';
      doganieroUserLocation.country = parts.country || '';
      doganieroUserLocation.postcode = parts.postcode || '';
      doganieroUserLocation.mapsUrl = 'https://www.google.com/maps?q=' +
        encodeURIComponent(String(lat) + ',' + String(lng)) + '&hl=es';
      doganieroUserLocation.source = geo.source || '';
      doganieroUserLocation.updatedAt = Date.now();
      doganieroUserLocation.message = '';
      doganieroLocNotify();
      return doganieroUserLocation;
    }, function(err){
      // Coordenadas sí, dirección no
      doganieroUserLocation.status = 'ok';
      doganieroUserLocation.lat = lat;
      doganieroUserLocation.lng = lng;
      doganieroUserLocation.accuracy = accuracy;
      doganieroUserLocation.label = 'Coordenadas ' + Number(lat).toFixed(5) + ', ' + Number(lng).toFixed(5);
      doganieroUserLocation.road = '';
      doganieroUserLocation.city = '';
      doganieroUserLocation.region = '';
      doganieroUserLocation.country = '';
      doganieroUserLocation.postcode = '';
      doganieroUserLocation.mapsUrl = 'https://www.google.com/maps?q=' +
        encodeURIComponent(String(lat) + ',' + String(lng)) + '&hl=es';
      doganieroUserLocation.source = 'coords_only';
      doganieroUserLocation.updatedAt = Date.now();
      doganieroUserLocation.message = (err && err.message) ? String(err.message) : '';
      doganieroLocNotify();
      return doganieroUserLocation;
    });
  }

  function ensureDoganieroLocation(force){
    if(!force && doganieroLocIsFresh()){
      return Promise.resolve(doganieroUserLocation);
    }
    if(_dogLocInflight && !force) return _dogLocInflight;
    if(typeof navigator === 'undefined' || !navigator.geolocation){
      doganieroUserLocation.status = 'unavailable';
      doganieroUserLocation.message = 'Este dispositivo/navegador no soporta geolocalización.';
      doganieroLocNotify();
      return Promise.resolve(doganieroUserLocation);
    }
    doganieroUserLocation.status = 'pending';
    doganieroUserLocation.message = 'Solicitando permiso de ubicación…';
    doganieroLocNotify();
    _dogLocInflight = new Promise(function(resolve){
      var done = false;
      var timer = setTimeout(function(){
        if(done) return;
        done = true;
        doganieroUserLocation.status = 'error';
        doganieroUserLocation.message = 'Tiempo de espera agotado al obtener la ubicación.';
        doganieroLocNotify();
        resolve(doganieroUserLocation);
      }, 20000);
      try {
        navigator.geolocation.getCurrentPosition(function(pos){
          if(done) return;
          clearTimeout(timer);
          applyDoganieroGeoPosition(pos).then(function(loc){
            done = true;
            resolve(loc);
          }, function(err){
            done = true;
            doganieroUserLocation.status = 'error';
            doganieroUserLocation.message = (err && err.message) ? String(err.message) : 'Error de ubicación';
            doganieroLocNotify();
            resolve(doganieroUserLocation);
          });
        }, function(err){
          if(done) return;
          done = true;
          clearTimeout(timer);
          var code = err && err.code;
          if(code === 1){
            doganieroUserLocation.status = 'denied';
            doganieroUserLocation.message = 'Permiso de ubicación denegado. Doganiero AI no sabrá dónde estás hasta que lo actives en el navegador.';
          } else if(code === 2){
            doganieroUserLocation.status = 'unavailable';
            doganieroUserLocation.message = 'Ubicación no disponible (GPS/red).';
          } else if(code === 3){
            doganieroUserLocation.status = 'error';
            doganieroUserLocation.message = 'Tiempo de espera al obtener la ubicación.';
          } else {
            doganieroUserLocation.status = 'error';
            doganieroUserLocation.message = (err && err.message) ? String(err.message) : 'No se pudo obtener la ubicación.';
          }
          doganieroLocNotify();
          resolve(doganieroUserLocation);
        }, {
          enableHighAccuracy: true,
          timeout: 18000,
          maximumAge: force ? 0 : 60000
        });
      } catch(e){
        clearTimeout(timer);
        doganieroUserLocation.status = 'unavailable';
        doganieroUserLocation.message = 'Geolocalización no disponible en este entorno.';
        doganieroLocNotify();
        resolve(doganieroUserLocation);
      }
    }).then(function(loc){
      _dogLocInflight = null;
      return loc;
    }, function(err){
      _dogLocInflight = null;
      throw err;
    });
    return _dogLocInflight;
  }

  function doganieroLocationContext(){
    var loc = doganieroUserLocation;
    if(loc.status === 'ok' && loc.lat != null && loc.lng != null){
      var acc = (loc.accuracy != null && isFinite(loc.accuracy))
        ? ('±' + Math.round(loc.accuracy) + ' m')
        : 'precisión desconocida';
      var ageSec = loc.updatedAt ? Math.max(0, Math.round((Date.now() - loc.updatedAt) / 1000)) : null;
      var ageTxt = ageSec != null ? (ageSec < 60 ? (ageSec + ' s') : (Math.round(ageSec / 60) + ' min')) : '?';
      var line =
        'Ubicación actual del usuario (GPS del navegador + geocodificación inversa; úsala si pregunta «dónde estoy», sitios cercanos, clima local, etc.; no inventes otra):\n' +
        '- Dirección / lugar (estilo Maps): ' + (loc.label || '(solo coordenadas)') + '\n' +
        '- Calle: ' + (loc.road || '—') + '\n' +
        '- Ciudad: ' + (loc.city || '—') + '\n' +
        '- Región: ' + (loc.region || '—') + '\n' +
        '- País: ' + (loc.country || '—') + '\n' +
        '- CP: ' + (loc.postcode || '—') + '\n' +
        '- Coordenadas: ' + Number(loc.lat).toFixed(6) + ', ' + Number(loc.lng).toFixed(6) + ' (' + acc + ')\n' +
        '- Google Maps: ' + (loc.mapsUrl || '') + '\n' +
        '- Actualizada hace: ' + ageTxt + ' (fuente geocodificación: ' + (loc.source || 'n/d') + ').\n' +
        'Privacidad: esta ubicación solo sirve para responder en Doganiero AI; no la compartas en público ni la guardes en archivos salvo que el usuario lo pida.';
      return line;
    }
    if(loc.status === 'pending'){
      return 'Ubicación del usuario: aún se está solicitando permiso / GPS. Si pregunta dónde está, di que estás obteniendo la ubicación y que puede tardar unos segundos tras aceptar el permiso del navegador.';
    }
    if(loc.status === 'denied'){
      return 'Ubicación del usuario: NO disponible (permiso denegado en el navegador). Si pregunta dónde está, explica amablemente que necesita activar la ubicación para Snake OS / este sitio en los permisos del navegador o del teléfono. El chat sigue funcionando con normalidad.';
    }
    if(loc.status === 'unavailable' || loc.status === 'error'){
      return 'Ubicación del usuario: no disponible (' + (loc.message || loc.status) + '). Si pregunta dónde está, indícalo sin inventar una dirección. El chat sigue funcionando.';
    }
    return 'Ubicación del usuario: todavía no solicitada en esta sesión. Si pregunta dónde está, pide que acepte el permiso de ubicación del navegador (se solicita al abrir Doganiero AI).';
  }
