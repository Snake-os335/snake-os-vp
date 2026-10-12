/* Snake OS — Service Worker (avisos nativos + Web Push de llamadas)
 *
 * Qué puede sonar:
 * - Pestaña abierta: la página reproduce /static/ringtone.mp3?v=202610031731 en bucle.
 * - Pestaña cerrada o pantalla bloqueada, con red y el navegador no forzado
 *   a parar: un Web Push despierta este SW y muestra UNA notificación por llamada.
 *   No se vuelve a mostrar en bucle: Android trata los reavisos cada pocos
 *   segundos como spam. Chrome usa el sonido de notificación del sistema.
 * - Teléfono apagado, sin red, o Chrome cerrado a la fuerza: no puede sonar.
 */
'use strict';

var ringStops = Object.create(null);

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

function showSnakeNotification(title, opts) {
  function attempt(options) {
    return self.registration.showNotification(title, options);
  }
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

function showIncoming(data) {
  var tag = data.tag || 'snakeos-call';
  if (ringStops[tag]) return Promise.resolve();
  var opts = {
    body: data.body || 'Llamada de voz',
    tag: tag,
    renotify: false,
    silent: false,
    requireInteraction: true,
    vibrate: [280, 120, 280],
    sound: data.sound || '/static/ringtone.mp3?v=202610031731',
    actions: [
      { action: 'answer', title: 'Contestar' },
      { action: 'decline', title: 'Rechazar' }
    ],
    data: {
      peerEmail: data.peerEmail || null,
      openApp: 'chat',
      url: data.url || '/',
      callKind: 'incoming',
      callId: data.callId || '',
      tag: tag
    }
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
    sound: data.sound || '/static/ringtone.mp3?v=202610031731',
    data: {
      peerEmail: data.peerEmail || null,
      openApp: data.openApp || 'chat',
      url: data.url || '/',
      callKind: data.callKind || '',
      callId: data.callId || '',
      tag: tag
    }
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
      peerEmail: null,
      openApp: 'doganiero-book',
      liveId: data.liveId || '',
      url: data.url || '/',
      callKind: '',
      callId: '',
      tag: tag
    }
  };
  return showSnakeNotification(data.title || '🔴 Direct™ en Doganiero Book', opts);
}

self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  if (data.kind === 'book-live') {
    event.waitUntil(showLiveNotice(data));
    return;
  }
  var action = data.action || 'ring';
  var tag = data.tag || 'snakeos-call';
  if (action === 'stop') {
    ringStops[tag] = true;
    event.waitUntil(closeTagged(tag));
    return;
  }
  if (action === 'missed') {
    ringStops[tag] = true;
    event.waitUntil(showOnce(data));
    return;
  }
  if (ringStops[tag]) return;
  event.waitUntil(showIncoming(data));
});

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'snakeos-show-notif') {
    var title = data.title || 'Doganiero Chat';
    var opts = data.options || {};
    if (!opts.sound && opts.data && (opts.data.callKind === 'incoming' || opts.data.callKind === 'missed')) {
      opts.sound = '/static/ringtone.mp3?v=202610031731';
    }
    event.waitUntil(showSnakeNotification(title, opts));
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var nd = event.notification.data || {};
  if (nd.tag) ringStops[nd.tag] = true;
  var peerEmail = nd.peerEmail || null;
  var openApp = nd.openApp || 'chat';
  var targetUrl = nd.url || '/';
  var action = event.action || '';
  var callId = nd.callId || '';
  // Tap on the notification body answers an incoming call. Rechazar stays decline. Contestar stays answer.
  if ((!action || action === 'default') && nd.callKind === 'incoming') action = 'answer';
  var payload = {
    type: 'snakeos-notif-click',
    peerEmail: peerEmail,
    openApp: openApp,
    action: action,
    callId: callId,
    callKind: nd.callKind || '',
    liveId: nd.liveId || ''
  };

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      function focusClient(client) {
        return client.focus().then(function (c) {
          var target = c || client;
          if (target && target.postMessage) target.postMessage(payload);
          return target;
        });
      }
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        try {
          if (client.url && client.url.indexOf(self.location.origin) === 0) {
            return focusClient(client);
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
