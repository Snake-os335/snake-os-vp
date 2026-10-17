/* Snake OS · Compartir ubicación con tus contactos (para la app Mapas) */
(function () {
  'use strict';
  if (window.snkLocShare) return;
  var on = false, watchId = null, lastSent = 0, checkedFor = '';
  function req(url, opts) {
    opts = opts || {};
    opts.credentials = 'include';
    opts.headers = Object.assign({ 'Accept': 'application/json' }, opts.headers || {});
    if (opts.body && typeof opts.body !== 'string') { opts.body = JSON.stringify(opts.body); opts.headers['Content-Type'] = 'application/json'; }
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error((d && d.detail) || ('Error ' + r.status)); e.status = r.status; throw e; }
        return d;
      });
    });
  }
  function send(pos) {
    if (!on) return;
    var now = Date.now();
    if (now - lastSent < 45000) return;
    lastSent = now;
    req('/api/me/location-share/ping', { method: 'POST', body: { lat: pos.coords.latitude, lng: pos.coords.longitude } }).catch(function () {});
  }
  function startWatch() {
    if (watchId != null || !navigator.geolocation) return;
    try {
      watchId = navigator.geolocation.watchPosition(send, function () {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 30000 });
    } catch (e) {}
  }
  function stopWatch() {
    if (watchId != null && navigator.geolocation) { try { navigator.geolocation.clearWatch(watchId); } catch (e) {} }
    watchId = null;
  }
  function apply(v) {
    on = !!v;
    if (on) { lastSent = 0; startWatch(); } else stopWatch();
    try { document.dispatchEvent(new CustomEvent('snk-locshare', { detail: { on: on } })); } catch (e) {}
    return on;
  }
  function check() {
    var u = window.currentUser;
    var key = u && u.email ? String(u.email).toLowerCase() : '';
    if (key === checkedFor) return;
    checkedFor = key;
    if (!key) { apply(false); return; }
    req('/api/me/location-share').then(function (d) {
      if (checkedFor !== key) return;
      apply(d && d.on);
      if (d && !d.decided) watchPermission(key);
    }).catch(function () {});
  }
  var NOTICE = 'Tus contactos de Snake OS podrán ver tu ubicación mientras tengas Snake OS abierto. Puedes desactivarlo en Mapas › 📡 o en Ajustes › Cuenta.';
  function showNotice() {
    var old = document.getElementById('snkLocNotice'); if (old) old.remove();
    var box = document.createElement('div');
    box.id = 'snkLocNotice'; box.setAttribute('role', 'alertdialog');
    box.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:2147483646;max-width:min(440px,calc(100vw - 24px));padding:14px 16px;border-radius:16px;background:rgba(8,26,16,.97);color:#eafff0;border:1px solid rgba(52,209,122,.55);box-shadow:0 14px 40px rgba(0,0,0,.5);font:14px/1.4 Inter,system-ui,sans-serif;display:flex;flex-direction:column;gap:10px;';
    var t = document.createElement('div'); t.innerHTML = '<b>📡 Compartir ubicación activado</b><br>'; t.appendChild(document.createTextNode(NOTICE));
    var row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
    var off = document.createElement('button'); off.type = 'button'; off.textContent = 'Desactivar';
    off.style.cssText = 'border:0;border-radius:10px;padding:8px 14px;font-weight:700;background:#c0392b;color:#fff;cursor:pointer;';
    var ok = document.createElement('button'); ok.type = 'button'; ok.textContent = 'Vale';
    ok.style.cssText = 'border:0;border-radius:10px;padding:8px 14px;font-weight:700;background:#1f9e57;color:#fff;cursor:pointer;';
    off.onclick = function () { box.remove(); window.snkLocShare.set(false).catch(function () {}); };
    ok.onclick = function () { box.remove(); };
    row.appendChild(off); row.appendChild(ok); box.appendChild(t); box.appendChild(row);
    document.body.appendChild(box);
    setTimeout(function () { if (box.isConnected) box.remove(); }, 20000);
  }
  var autoTried = '';
  function autoEnable(key) {
    if (autoTried === key || checkedFor !== key || on) return;
    autoTried = key;
    showNotice(); // primero el aviso, después se activa
    window.snkLocShare.set(true).catch(function () {});
  }
  function watchPermission(key) {
    try {
      if (!navigator.permissions || !navigator.permissions.query) return;
      navigator.permissions.query({ name: 'geolocation' }).then(function (st) {
        if (st.state === 'granted') autoEnable(key);
        st.onchange = function () { if (st.state === 'granted' && checkedFor === key) autoEnable(key); };
      }).catch(function () {});
    } catch (e) {}
  }
  setInterval(check, 4000);
  window.snkLocShare = {
    isOn: function () { return on; },
    set: function (v) {
      return req('/api/me/location-share', { method: 'POST', body: { on: !!v } }).then(function (d) { return apply(d && d.on); });
    },
    contact: function (email) {
      return req('/api/maps/contact-location?email=' + encodeURIComponent(String(email || '').trim()));
    }
  };
})();
