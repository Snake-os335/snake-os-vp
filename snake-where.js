/* Snake OS · where i am? La distancia la calcula la Mega. */
(function () {
  var css = document.createElement("style");
  css.textContent =
    ".where-app{display:flex;flex-direction:column;gap:12px;height:100%;min-height:240px;padding:18px 16px;background:#07140d;color:#f4fff8;font-family:ui-sans-serif,system-ui,sans-serif;box-sizing:border-box;overflow:auto;}" +
    ".where-app h2{margin:0;font-size:1.35rem;}" +
    ".where-app input{width:100%;box-sizing:border-box;border:0;border-radius:12px;padding:12px 14px;font-size:1rem;background:rgba(255,255,255,0.12);color:#fff;}" +
    ".where-app button{border:0;border-radius:12px;padding:10px 14px;font-weight:700;background:#1f9e57;color:#fff;cursor:pointer;}" +
    ".where-out{margin:0;font-size:1.35rem;font-weight:800;line-height:1.3;}" +
    ".where-note{margin:0;color:rgba(244,255,248,0.72);font-size:0.92rem;}" +
    ".where-map{height:240px;min-height:240px;border-radius:12px;overflow:hidden;background:#10261a;}" +
    ".where-map.leaflet-container{width:100%;height:240px;font:12px/1.4 system-ui,sans-serif;}";
  document.head.appendChild(css);

  var leafletPromise = null;

  function loadLeaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      if (!document.getElementById("whereLeafletCss")) {
        var link = document.createElement("link");
        link.id = "whereLeafletCss";
        link.rel = "stylesheet";
        link.href = "/static/assets/leaflet.css?v=194";
        document.head.appendChild(link);
      }
      function ready() {
        if (window.L && window.L.map) resolve(window.L);
        else reject(new Error("leaflet"));
      }
      var scripts = document.getElementsByTagName("script");
      var existing = null;
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].getAttribute("src") || "";
        if (src.indexOf("leaflet.js") !== -1) { existing = scripts[i]; break; }
      }
      if (existing) {
        if (window.L && window.L.map) ready();
        else existing.addEventListener("load", ready);
        return;
      }
      var s = document.createElement("script");
      s.src = "/static/assets/leaflet.js?v=194";
      s.async = true;
      s.onload = ready;
      s.onerror = function () { reject(new Error("leaflet")); };
      document.head.appendChild(s);
    });
    return leafletPromise;
  }


  function finitePair(lat, lng) {
    var la = Number(lat), ln = Number(lng);
    if (!isFinite(la) || !isFinite(ln)) return null;
    if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
    return { lat: la, lng: ln };
  }

  function profileLocation() {
    return fetch("/api/me/location", { cache: "no-store", credentials: "same-origin" }).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).then(function (data) {
      if (!data) return null;
      return finitePair(data.lat, data.lng);
    }, function () { return null; });
  }

  function sessionLocation() {
    var loc = window.doganieroUserLocation;
    if (!loc || loc.status !== "ok") return null;
    return finitePair(loc.lat, loc.lng);
  }

  function permissionState() {
    if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve("unknown");
    return navigator.permissions.query({ name: "geolocation" }).then(function (st) {
      return (st && st.state) || "unknown";
    }, function () { return "unknown"; });
  }

  function readGrantedPosition() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(function (pos) {
        var coords = pos && pos.coords;
        resolve(coords ? finitePair(coords.latitude, coords.longitude) : null);
      }, function () { resolve(null); }, {
        enableHighAccuracy: false,
        maximumAge: 600000,
        timeout: 12000
      });
    });
  }

  function whereOrigin() {
    return profileLocation().then(function (profile) {
      if (profile) return profile;
      var session = sessionLocation();
      if (session) return session;
      return permissionState().then(function (state) {
        if (state === "denied" || state === "prompt") return null;
        return readGrantedPosition().then(function (fix) {
          if (fix) return fix;
          if (state === "granted") return { enabled: true };
          return null;
        });
      });
    });
  }

  function fmtMeters(m) {
    m = Math.round(Number(m));
    if (!(m >= 0)) return "";
    if (m < 1000) return m + " m";
    var km = m / 1000;
    var text = km >= 100 ? String(Math.round(km)) : km.toFixed(1).replace(".", ",");
    return text + " km";
  }

  function renderWhereApp(container) {
    container.innerHTML =
      "<div class=\"where-app\">" +
        "<h2>where i am?</h2>" +
        "<input data-where=\"q\" type=\"text\" maxlength=\"120\" placeholder=\"Escribe un lugar\" autocomplete=\"off\">" +
        "<button type=\"button\" data-where=\"go\">Medir distancia</button>" +
        "<p class=\"where-out\" data-where=\"out\">—</p>" +
        "<p class=\"where-note\" data-where=\"note\">La placa mide desde la ubicación de tu perfil de dogaemail.</p>" +
        "<div class=\"where-map\" data-where=\"map\" hidden></div>" +
      "</div>";
    var input = container.querySelector("[data-where=q]");
    var out = container.querySelector("[data-where=out]");
    var note = container.querySelector("[data-where=note]");
    var mapEl = container.querySelector("[data-where=map]");
    var alive = true;
    var timer = 0;
    var map = null;
    var placeMarker = null;
    var userMarker = null;
    var here = null;
    function stop() {
      if (timer) clearInterval(timer);
      timer = 0;
    }
    function showBoth(user, lat, lng, name) {
      var place = finitePair(lat, lng);
      var me = user && user.lat != null ? finitePair(user.lat, user.lng) : null;
      if (!place && !me) return;
      var focus = place || me;
      mapEl.hidden = false; mapEl.style.display = "block"; mapEl.style.height = "240px"; mapEl.style.minHeight = "240px";
      loadLeaflet().then(function (L) {
        if (!alive) return;
        try {
          delete L.Icon.Default.prototype._getIconUrl;
          L.Icon.Default.mergeOptions({
            iconRetinaUrl: "/static/assets/leaflet-marker-icon-2x.png",
            iconUrl: "/static/assets/leaflet-marker-icon.png",
            shadowUrl: "/static/assets/leaflet-marker-shadow.png"
          });
        } catch (eIc) {}
        if (!map) {
          map = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView([focus.lat, focus.lng], 14);
          L.tileLayer("/api/maps/tile/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap"
          }).addTo(map);
        }
        if (placeMarker) { try { map.removeLayer(placeMarker); } catch (eRm) {} placeMarker = null; }
        if (userMarker) { try { map.removeLayer(userMarker); } catch (eRu) {} userMarker = null; }
        if (me) {
          userMarker = L.circleMarker([me.lat, me.lng], {
            radius: 8, color: "#ffffff", weight: 2, fillColor: "#1f9e57", fillOpacity: 1
          }).addTo(map);
        }
        if (place) {
          placeMarker = L.marker([place.lat, place.lng]).addTo(map);
          if (name) placeMarker.bindTooltip(String(name), { direction: "top" });
        }
        if (me && place) {
          try {
            map.fitBounds(L.latLngBounds([[me.lat, me.lng], [place.lat, place.lng]]), { padding: [28, 28], maxZoom: 15 });
          } catch (eFit) {
            map.setView([place.lat, place.lng], 14);
          }
        } else {
          map.setView([focus.lat, focus.lng], 14);
        }
        setTimeout(function () {
          if (map) { try { map.invalidateSize(); } catch (eSz) {} }
        }, 80);
      }).catch(function () {
        if (alive) note.textContent = "No se pudo abrir el mapa del lugar.";
      });
    }
    async function poll(job) {
      var tries = 0;
      stop();
      timer = setInterval(async function () {
        if (!alive) { stop(); return; }
        tries += 1;
        try {
          var res = await fetch("/api/where/result?job=" + job, { cache: "no-store", credentials: "same-origin" });
          if (!res.ok) throw new Error("http");
          var data = await res.json();
          if (data && data.status === "done" && data.meters != null) {
            stop();
            var label = fmtMeters(data.meters);
            out.textContent = label ? ("A " + label) : "—";
            note.textContent = data.place ? ("Hasta " + data.place + ". Lo ha calculado la placa.") : "Lo ha calculado la placa.";
            if (data.lat != null && data.lng != null) showBoth(finitePair(data.fromLat, data.fromLng) || here, data.lat, data.lng, data.place);
          } else if (tries > 16) {
            stop();
            out.textContent = "—";
            note.textContent = "La placa no contestó.";
          }
        } catch (e) {
          if (tries > 16) {
            stop();
            note.textContent = "La placa no contestó.";
          }
        }
      }, 500);
    }
    async function go() {
      var q = String(input.value || "").trim();
      if (q.length < 2) {
        note.textContent = "Escribe un lugar.";
        return;
      }
      stop();
      out.textContent = "—";
      note.textContent = "Buscando el lugar…";
      var origin = null;
      try { origin = await whereOrigin(); } catch (eO) { origin = null; }
      here = (origin && origin.lat != null) ? origin : null;
      var payload = { q: q };
      if (origin && origin.lat != null && origin.lng != null) {
        payload.lat = origin.lat;
        payload.lng = origin.lng;
      }
      try {
        var res = await fetch("/api/where/search", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(payload)
        });
        var data = await res.json();
        if (!data || data.ok === false) {
          out.textContent = "—";
          mapEl.hidden = true;
          if (origin && origin.enabled && data && data.reason === "noloc") {
            note.textContent = "No se pudo leer la ubicación. Inténtalo otra vez.";
          } else {
            note.textContent = (data && data.detail) || "No se pudo medir.";
          }
          return;
        }
        note.textContent = "La placa está midiendo…";
        if (data.lat != null && data.lng != null) showBoth(finitePair(data.fromLat, data.fromLng) || here, data.lat, data.lng, data.place);
        poll(data.id);
      } catch (e) {
        note.textContent = "No se pudo medir.";
      }
    }
    container.querySelector("[data-where=go]").addEventListener("click", go);
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") go();
    });
    return function () {
      alive = false;
      stop();
      if (map) {
        try { map.remove(); } catch (eMap) {}
        map = null;
      }
    };
  }
  window.renderWhereApp = renderWhereApp;
})();

