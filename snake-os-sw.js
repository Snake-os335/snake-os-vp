/* Snake OS — Service Worker (avisos nativos + Web Push de llamadas)
 *
 * Qué puede sonar:
 * - Pestaña abierta (aunque en segundo plano): la página reproduce
 *   /static/ringtone.mp3?v=202610141730 en bucle. Al recibir el Web Push,
 *   este SW despierta los clientes abiertos (postMessage) para que arranquen
 *   ese mismo tono.
 * - Pestaña cerrada (sin clientes): UNA notificación rica (Contestar /
 *   Rechazar, vibración). Chrome/Android usan el sonido del sistema; el
 *   ringtone.mp3 propio suena al tocar el aviso y abrirse Snake OS.
 * - Teléfono apagado, sin red, o navegador cerrado a la fuerza: no suena.
 * - iOS: hace falta «Añadir a pantalla de inicio» para recibir push.
 */
'use strict';

var ringStops = Object.create(null);
var RING_SRC = '/static/ringtone.mp3?v=202610141730';
var CALL_ICON = '/static/assets/phone-icon.png';

self.addEventListener('install', function () { self.skipWaiting(); });
/* Este SW no cachea nada (sin 'fetch'): al activarse borra cachés antiguas por si quedó alguna. */
self.addEventListener('activate', function (event) { event.waitUntil((self.caches && caches.keys ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }) : Promise.resolve()).catch(function () {}).then(function () { return self.clients.claim(); })); });

function showSnakeNotification(title, opts) {
  function attempt(options) { return self.registration.showNotification(title, options); }
  return attempt(opts).catch(function () {
    var copy = {};
    Object.keys(opts || {}).forEach(function (k) {
      if (k !== 'sound' && k !== 'vibrate' && k !== 'renotify') copy[k] = opts[k];
    });
    return attempt(copy).catch(function () {
      try { delete copy.actions; } catch (e0) {}
      try { delete copy.requireInteraction; } catch (e1) {}
      return attempt(copy);
    });
  });
}

function closeTagged(tag) {
  return self.registration.getNotifications({ tag: tag }).then(function (list) {
    list.forEach(function (n) { try { n.close(); } catch (e2) {} });
  });
}

/** Despierta pestañas/PWA abiertas (aunque estén en segundo plano). */
function wakeClients(payload) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      try {
        if (list[i].url && list[i].url.indexOf(self.location.origin) === 0) {
          list[i].postMessage(payload);
          n += 1;
        }
      } catch (e) {}
    }
    return n;
  }).catch(function () { return 0; });
}

function callData(data, kind, tag) {
  return {
    peerEmail: data.peerEmail || null,
    peerName: data.peerName || null,
    openApp: data.openApp || 'chat',
    url: data.url || '/',
    callKind: kind,
    callId: data.callId || '',
    media: data.media === 'video' ? 'video' : 'audio',
    tag: tag
  };
}

function showIncoming(data) {
  var tag = data.tag || 'snakeos-call';
  if (ringStops[tag]) return Promise.resolve();
  var opts = {
    body: data.body || 'Llamada de voz',
    tag: tag,
    renotify: false,
    silent: false,
    requireInteraction: true,
    vibrate: [400, 200, 400, 200, 400, 200, 400],
    sound: data.sound || RING_SRC,
    icon: data.icon || CALL_ICON,
    badge: CALL_ICON,
    actions: [
      { action: 'answer', title: 'Contestar' },
      { action: 'decline', title: 'Rechazar' }
    ],
    data: callData(data, 'incoming', tag)
  };
  return showSnakeNotification(data.title || 'Llamada entrante', opts).then(function () {
    if (ringStops[tag]) return closeTagged(tag);
  });
}

function showOnce(data) {
  var tag = data.tag || 'snakeos';
  ringStops[tag] = true;
  var opts = {
    body: data.body || '',
    tag: tag,
    renotify: true,
    silent: false,
    requireInteraction: false,
    vibrate: [180, 80, 180],
    icon: data.icon || CALL_ICON,
    badge: CALL_ICON,
    data: callData(data, data.callKind || '', tag)
  };
  return showSnakeNotification(data.title || 'Snake OS', opts);
}

// Aviso de directo nuevo en Doganiero Book (una sola notificación, sin sonar como llamada)
function showLiveNotice(data) {
  var tag = data.tag || 'book-live';
  var opts = {
    body: data.body || 'Doganiero Book',
    icon: '/static/assets/direct-tm-logo.png?v=1',
    tag: tag,
    renotify: true,
    silent: false,
    requireInteraction: false,
    vibrate: [120, 60, 120],
    data: {
      peerEmail: null, openApp: 'doganiero-book', liveId: data.liveId || '',
      url: data.url || '/', callKind: '', callId: '', tag: tag
    }
  };
  return showSnakeNotification(data.title || '🔴 Direct™ en Doganiero Book', opts);
}

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  if (data.kind === 'book-live') {
    event.waitUntil(showLiveNotice(data));
    return;
  }
  if (data.kind === 'notif') {
    // Mensajes y avisos del sistema. Si Snake OS está abierto y a la vista, ya lo avisa la propia página.
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) { if (list[i].visibilityState === 'visible' && list[i].focused) return; }
      return showSnakeNotification(data.title || 'Snake OS!', {
        body: data.body || '', tag: data.tag || 'snakeos-notif', icon: data.icon || undefined, badge: data.icon || undefined,
        data: { url: data.url || '/', peerEmail: data.peerEmail || null, openApp: data.app === 'chat' ? 'chat' : (data.app || 'chat'), tag: data.tag || '' }
      });
    }));
    return;
  }
  var action = data.action || 'ring';
  var tag = data.tag || 'snakeos-call';
  var stopMsg = { type: 'snakeos-push-stop', tag: tag, callId: data.callId || '' };
  if (action === 'stop') {
    ringStops[tag] = true;
    event.waitUntil(Promise.all([closeTagged(tag), wakeClients(stopMsg)]));
    return;
  }
  if (action === 'missed') {
    ringStops[tag] = true;
    event.waitUntil(Promise.all([closeTagged(tag).then(function () { return showOnce(data); }), wakeClients(stopMsg)]));
    return;
  }
  if (ringStops[tag]) return;
  event.waitUntil(Promise.all([
    wakeClients({
      type: 'snakeos-push-ring',
      callId: data.callId || '',
      peerEmail: data.peerEmail || '',
      peerName: data.peerName || '',
      media: data.media === 'video' ? 'video' : 'audio'
    }),
    showIncoming(data)
  ]));
});

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'snakeos-show-notif') {
    var opts = data.options || {};
    if (!opts.sound && opts.data && (opts.data.callKind === 'incoming' || opts.data.callKind === 'missed')) {
      opts.sound = RING_SRC;
    }
    event.waitUntil(showSnakeNotification(data.title || 'Doganiero Chat', opts));
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var nd = event.notification.data || {};
  if (nd.tag) ringStops[nd.tag] = true;
  var peerEmail = nd.peerEmail || null;
  var targetUrl = nd.url || '/';
  var action = event.action || '';
  var callId = nd.callId || '';
  // Tocar el cuerpo de una llamada entrante = Contestar. Rechazar sigue siendo rechazar.
  if ((!action || action === 'default') && nd.callKind === 'incoming') action = 'answer';
  var payload = {
    type: 'snakeos-notif-click',
    peerEmail: peerEmail,
    openApp: nd.openApp || 'chat',
    action: action,
    callId: callId,
    callKind: nd.callKind || '',
    liveId: nd.liveId || ''
  };
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        try {
          if (client.url && client.url.indexOf(self.location.origin) === 0) {
            return client.focus().then(function (c) {
              var target = c || client;
              if (target && target.postMessage) target.postMessage(payload);
              return target;
            });
          }
        } catch (e) {}
      }
      var sep = targetUrl.indexOf('?') >= 0 ? '&' : '?';
      var q = '';
      if (peerEmail) q += sep + 'openChat=' + encodeURIComponent(peerEmail);
      if (action === 'answer' || action === 'decline') {
        q += (q ? '&' : sep) + 'callAction=' + encodeURIComponent(action);
        if (callId) q += '&callId=' + encodeURIComponent(callId);
      }
      return self.clients.openWindow(targetUrl + q);
    })
  );
});
