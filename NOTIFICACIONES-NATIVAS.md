# Notificaciones nativas — Doganiero Chat / Snake OS

## Qué hay
- **Notification API** + **Service Worker** (`/snake-os-sw.js?v=…`, scope `/`).
- Cuando A escribe a B, el servidor envía WS `notification` a B.
- Si B tiene permiso concedido y la pestaña/PWA no está visible (o sin foco), se muestra una notificación del SO: **título = remitente**, **body = preview**.
- Al tocar: enfoca Snake OS y abre Doganiero Chat con ese peer (`openChat` / postMessage).

## Permiso (Chrome / Android)
- Se pide **solo con gesto**: botón «Activar avisos del teléfono» en el panel 🔔.
- **Importante:** `Notification.requestPermission()` se llama *antes* de `await` del registro del SW (si no, Chrome pierde la user activation y el diálogo no aparece).
- Requiere **HTTPS** (túnel Cloudflare).
- Feedback visible en el panel: éxito (verde), denegado/bloqueado (rojo), sin SW, etc.
- Si el permiso quedó en **blocked**: candado del sitio → Permisos → Notificaciones → Permitir.

## Cómo probar (Android Chrome + HTTPS)
1. Abre Snake OS por el enlace Cloudflare `https://…` (no IP `http://`).
2. Recarga forzada (o cierra pestaña y vuelve) para pillar `doganiero-chat.js?v=20261002083600notif`.
3. Inicia sesión → toca 🔔 → «Activar avisos del teléfono».
4. Debe salir el diálogo del sistema; elige **Permitir**.
5. Deberías ver texto verde «Listo / Avisos activados» y una notificación de prueba.
6. Si no sale diálogo: revisa si ya está bloqueado en ajustes del sitio; el hint rojo lo indica.
7. Prueba real: con la pestaña en segundo plano, que otro usuario te escriba en Doganiero Chat.

## Límites (sin FCM / Web Push VAPID)
| Situación | ¿Aviso nativo? |
|-----------|----------------|
| Pestaña en background, navegador vivo | Sí (vía WS → SW `showNotification`) |
| Pantalla bloqueada, proceso del navegador/PWA vivo | Suele sí (Android) |
| Navegador/PWA **matado** por el SO | **No** — haría falta push remoto |
| iOS Safari sin «Añadir a pantalla de inicio» | Limitado / no fiable |


## Llamadas con Snake OS cerrado o en segundo plano (v2026.11)
| Situación | Notificación | Tono |
|-----------|--------------|------|
| Snake OS en segundo plano (pestaña/PWA abierta) | Sí, con Contestar / Rechazar | Sí: el SW despierta la pestaña y suena `ringtone.mp3` en bucle (mismo tono que con Snake OS abierto) |
| Snake OS cerrado (navegador vivo) | Sí, con Contestar / Rechazar, vibración, se queda fija | Sonido de notificación del sistema (un navegador no deja reproducir un MP3 propio sin pestaña). Al tocar el aviso se abre Snake OS y contesta |
| Navegador matado por el sistema / sin red | No | No |
| iPhone | Solo si Snake OS está en la pantalla de inicio (PWA) | Sonido del sistema |
- El aviso único «Activar» / «Ahora no» (30 días) por perfil sigue igual.
