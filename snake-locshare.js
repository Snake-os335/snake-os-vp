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
    req('/api/me/location-share').then(function (d) { if (checkedFor === key) apply(d && d.on); }).catch(function () {});
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
