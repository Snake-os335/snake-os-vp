# Snake OS

## Actualizar Snake OS (obligatorio para agentes y personas)

**Norma:** cada actualización terminada **se publica siempre** (no queda nada "para luego"): se sube a git
**y** se despliega. El push a `main` ya dispara el auto-deploy de la VM (≤3 min); el script de abajo es el
atajo para aplicarlo al momento:

```bash
# 1) En tu worktree/rama (nunca en la carpeta en vivo):
git fetch origin && git rebase origin/main
git push origin HEAD:main            # fast-forward, NUNCA --force
# 2) Lanzar la update en la VM (carpeta en vivo):
bash /srv/juegos_david/snake-os-vp/scripts/publicar-update.sh
```

`scripts/publicar-update.sh` (comparte cerrojo con el auto-deploy): se niega si la carpeta en vivo no está en
`main` o tiene cambios sin commit; fetch; backup (git bundle en `/srv/juegos_david/backups/snake-os-vp`);
`scripts/update-start.sh` (pantalla «Snake OS! se está actualizando...» en todas las pestañas abiertas y 503
`maintenance.html` para cargas nuevas); `git merge --ff-only origin/main`; reinicia **solo** `snake-os-vp` si cambió
Python/Docker; health-check (rollback si falla); mantiene la pantalla al menos `UPDATE_MIN_SECONDS` (25 s) y
`scripts/update-end.sh`. Sin commits nuevos también relanza la update. Log: `/srv/juegos_david/logs/snake-auto-deploy.log`.

- **Versión automática:** `/api/status` → `version` = commit + firma (mtime/tamaño) de los .js/.css/.html servidos.
  Cambia en cada despliegue, aunque solo cambien archivos estáticos y sin reiniciar. `started` = hora de arranque
  del proceso: solo cambia cuando el contenedor se reinicia (es lo único que recarga el código Python).
- **?v= automático:** `/` reescribe cada `src=/href="/static/..."` de `index.html` con el token real del archivo.
  Ya no hace falta subir los `?v=` a mano. `/static` con el token correcto → caché inmutable; sin él → `no-cache`
  (revalida con ETag; antes Cloudflare lo guardaba 4 h).

### Auto-deploy en la VM (sin depender del Mac)
Cada 3 min, cron ejecuta `/srv/juegos_david/bin/snake-auto-deploy.sh` (copia de `scripts/auto-deploy.sh`):
fetch anónimo HTTPS de `main`; si hay commits nuevos y es fast-forward → `update-start.sh`, backup (git bundle en
`/srv/juegos_david/backups/snake-os-vp`), `merge --ff-only`, reinicio del contenedor solo si cambian `.py`/Docker,
health-check (200 + `/api/status`), `update-end.sh`. Si algo falla vuelve al commit anterior y no reintenta ese commit.
Log: `/srv/juegos_david/logs/snake-auto-deploy.log`. Para desplegar basta con hacer push a `main`.
Si cambias `scripts/auto-deploy.sh`, vuelve a copiarlo a `/srv/juegos_david/bin/`.

**Comprobado el 6-nov-2026: en el VPS la copia en `/srv/juegos_david/bin/` está desfasada y no reinicia el
contenedor.** El cron mueve el commit (los `.html`/`.js`/`.css` se sirven al instante) pero el `.py` sigue
siendo el anterior: se ve porque `/api/status` no devuelve `started`. Para arreglarlo, en el VPS:

```bash
cp /srv/juegos_david/snake-os-vp/scripts/auto-deploy.sh /srv/juegos_david/bin/snake-auto-deploy.sh
cd /srv/juegos_david/snake-os-vp && docker compose up -d web   # recarga el código Python nuevo
curl -s http://127.0.0.1:8988/api/status                       # debe aparecer "started"
```

### Qué ven los usuarios al actualizar
- Pestañas abiertas (comprueban `/api/status` cada 20 s, cada 3 s durante la update y al volver a la pestaña):
  con `updating: true` → pantalla completa «Snake OS! se está actualizando...»; al terminar (o si detectan una
  versión nueva sin haber visto el flag) se recargan con la versión nueva. Sin sesión, en seguida; con sesión,
  cuenta atrás de 10 s con «Actualizar ahora» / «Ahora no» (aviso con botón; se vuelve a lanzar a los 10 min).
- Cargas nuevas durante el despliegue: `maintenance.html` (503) y se recargan solas al terminar.
- Al abrir Snake OS con una versión nueva se muestra 10,5 s la pantalla mientras se refrescan cachés.

## Doganiero_Network (red wifi)

`snake-network.js` añade una red wifi con interruptor en la barra de tareas (icono wifi junto a
los ajustes rápidos) y un acceso en Ajustes rápidos. Reglas:

- **Nunca miente:** «internet disponible» = el ping a `/api/status` responde. Si el interruptor está encendido
  pero el ping falla, el estado dice «Sin internet real» y las funciones online siguen bloqueadas.
- **Bloqueo común, no botón a botón:** intercepta `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` y
  `navigator.sendBeacon`. Necesitan internet otro origen y `/api/*`, salvo las rutas de arranque y sesión
  (`/api/status`, `/api/os-gate`, `/api/login`, `/api/signup`, `/api/logout`, `/api/me`, `/api/bootstrap`,
  `/api/avatars/`, `/api/tutorial/done`, `/api/setup/done`), que pasan siempre para no bloquear el arranque.
  Estáticos, páginas y descargas del propio servidor son locales y no se tocan.
- **Como sin cobertura:** fetch rechaza con `TypeError` (`code: doga_net_offline`), XHR acaba en `error` con
  `status 0`, WebSocket cierra con `1006`, EventSource no abre y `sendBeacon` devuelve `false`.
- **Por defecto va encendida y se guarda POR PERFIL** (`localStorage['dogaNetOn:u:<email>']`; sin sesión,
  `dogaNetOn:guest`): al entrar no cambia nada y, si te desconectas, solo afecta a tu cuenta en ese navegador
  (los demás perfiles no se enteran). Al cambiar de cuenta (login/logout sin recargar) se carga el interruptor
  de ese perfil. El formato global antiguo (`dogaNetOn`) se migra una sola vez al primer perfil que entre.
  Al encenderla se ve el planeta girando con «Conectando…» (mínimo 2,4 s) mientras se comprueba la conexión real.
- **Con la conexión real del dispositivo:** no crea ni modifica ninguna wifi; solo refleja si hay internet.
- **Sin la pantalla «server i9 no está conectada» (2026.18):** el OS arranca siempre, haya o no server i9, y la
  API ya no devuelve 503 por su causa.
- **Llamadas que se oyen (2026.19):** el audio del otro lado se reproduce con reintento y, si el navegador
  bloquea el autoplay (típico en móvil), se desbloquea con el próximo toque o con el botón «🔊 Sonido» de la
  barra de la llamada. Si WebRTC dice «conectado» pero no entran bytes de audio (sondeo `getStats`
  `inbound-rtp`), la voz sigue por el canal del chat (PCM) y un `AudioContext` suspendido ya no se da por
  bueno. Además, el server i9 ya no cierra los WebSocket (`/api/chat/ws`, metaverso, TV) cuando no está
  conectado: la señalización de las llamadas no puede quedarse sin canal.
- API: `window.DogaNet` (`isOn()`, `isConnected()`, `hasInternet()`, `set(bool)`, `toggle()`, `check()`,
  `requireOnline(nombre)`, `isOnlineRequest(url)`, `profile()`, `syncProfile()`, `on(fn)`).
  Pruebas: `node tests/test_release_2617.js`, `node tests/test_release_2618.js` y `node tests/test_release_2619.js`.

## Snake VR (2026.22)

`snake-vr.js` añade la app **🥽 Snake VR** (escritorio y buscador de apps): tu escritorio de Snake OS
dentro de una **jungla viva en 3D** — árboles, helechos, lianas meciéndose, luciérnagas y serpientes que
se arrastran por todas partes — con una **pantalla gigante** que abre tu escritorio real y dos paneles
laterales en vivo (hora, versión, estado del escritorio, apps abiertas, novedades y controles).

- **Jungla animada (2026.21):** suelo de musgo procedural, 34 árboles con copas (instanciados), 46
  helechos con hoja recortada, 9 lianas que se mecen, 220 luciérnagas flotando y **10 serpientes
  ambientales** (cuerpo instanciado de 14 segmentos siguiendo curvas `CatmullRomCurve3`) con cabeza, ojos
  y lengua bífida. Niebla verde y luces ámbar/verde en vez del antiguo suelo de neón y las estrellas.
- **Mandos-serpiente (2026.21):** en WebXR los **dos** mandos son serpientes (lima la izquierda, cian la
  derecha): cuerpo enrollado en hélice, cabeza con dos ojos y lengua bífida animada. El rayo sale de su
  boca y se acorta/colorea según lo que apuntas (ámbar = tótem, verde = pantalla). El gatillo «muerde»
  (animación + vibración háptica) y hace `click` real en lo apuntado; morder el suelo teletransporta.
- **Serpiente tótem que te sigue (2026.21):** una serpiente enrollada en espiral con halo y anillo flota
  a tu lado (te sigue la cabeza, en XR o con ratón), **en la esquina inferior derecha, pequeña y
  translúcida para no estorbar** (y se aparta y se desvanece cuando el escritorio está abierto). La
  pantalla del escritorio **empieza cerrada**: al pulsar/morder al tótem se abre con animación de escala,
  y al volver a pulsarlo se cierra. También desde el HUD (🗔 Escritorio) y desde la app (🔮 Abrir el
  escritorio dentro de VR).

- **Escritorio REAL dentro de la pantalla (2026.22):** el espejo ya no dibuja un boceto: `paintDomNode`
  recorre los hijos del `body` (salvo el propio visor) y pinta fondos, bordes, textos (con los
  rectángulos reales de cada línea vía `Range.getClientRects`), imágenes y **el canvas de las apps**,
  respetando `opacity`, `overflow` (recorte) y ocultando lo que no se ve. Los estilos se cachean
  (`Map` + `getComputedStyle` cada 0,7 s) y el repintado es **adaptativo (~14 fps)**: si pintar cuesta
  más de 45 ms se espacia hasta 280 ms y, si va sobrado, se aprieta. Lo que abres, mueves o cierras se
  ve al instante dentro del visor.
- **Todo funciona igual que en el ordenador (2026.22):** los eventos se inyectan como
  `PointerEvent` + `MouseEvent` (y `WheelEvent`) reales en el elemento bajo el rayo
  (`raycast → uv → píxel CSS → elementsFromPoint → evento`), así que funcionan:
  **clic**, **mantener y arrastrar** ventanas (barra de título) e iconos, **doble clic** (abrir),
  **clic derecho** (menú contextual: apretar el mando —squeeze— apuntando a la pantalla; fuera de la
  pantalla sigue siendo el atajo de salida de VR), **rueda/stick** (desplazar listas dentro de las
  apps) y **foco** en campos de texto. En modo ratón, pulsar sobre la pantalla arrastra el escritorio y
  la rueda desplaza la app en vez de hacer zoom (el zoom sigue fuera de la pantalla).
- **Tres formas de mirar:** ratón/teclado (arrastrar, rueda, WASD/flechas, doble toque en el fondo =
  recentrar), **👓 Gafas (SBS)** con dos cámaras y dos viewports (gafas de cartón, pide horizontal en el
  móvil) y **🥽 VR real** con `navigator.xr.requestSession('immersive-vr')` (Meta Quest y PCVR): el visor
  manda la orientación/posición, los mandos tienen rayo visible, el gatillo pulsa la pantalla y apuntar al
  suelo teletransporta la «sala». El **🧭 Giroscopio** mueve la vista con la cabeza (pide permiso en iOS).
- **Sin dependencias nuevas:** usa el three.js local que ya sirven Snake Racing 3D, el Metaverso y la TV
  (`/static/assets/three-r160.min.js`), cargado solo al entrar. Al salir se para el bucle (`setAnimationLoop(null)`),
  se hace `dispose()` y se quita el overlay: no quedan renders ni listeners colgados.
- Límites conocidos: no hay audio posicional propio; la pantalla es un reflejo (las apps se siguen usando
  desde el escritorio normal, aquí se ven y se pulsan). En WebXR la cámara y el movimiento los lleva el visor;
  fuera de WebXR la posición inicial se puede mover con WASD/rueda.
- API: `window.SnakeVR` (`open({sbs, xr, screen})`, `close()`, `recenter()`, `supported()`,
  `toggleScreen()`, `setScreenOpen(bool)`, `isScreenOpen`, `isOpen`, `mode`) y
  `window.renderSnakeVrApp(body)`.
- **Mandos y puntero (2026.28 … 2026.30, bloque `SNK-XR-MANDOS`):** en VR los mandos no se dibujan
  (ni serpientes-mano ni empuñaduras) pero **el rayo-puntero sigue a la vista**; el **stick izquierdo
  anda** y el **derecho gira** (sin el retroceso de la «mordida al suelo»). El rayo **cuelga de un ancla
  propia colocada con la pose real del mando** (`frame.getPose`, o la empuñadura si el visor no la da),
  así que el puntero sigue al mando aunque la jerarquía del juego se quede congelada, y los mandos se
  emparejan con su objeto por `handedness` (no por orden de conexión). La pestaña se **recarga sola**
  cuando el servidor sirve otro `?v=`, y con el visor puesto la actualización **espera a que salgas**
  (`window.__snkXrBusy`). API de ajuste: `window.SnakeVrLocomotion`
  (`on`, `pointer`, `teleport`, `speed`, `turn`, `reset`, `diag()`, `state`, `version`, `update()`).
- **Mascota MR desde el escritorio (2026.30):** el botón flotante **🐍 MR** está en todo Snake OS (no
  hay que entrar en Snake VR) y hay app **🐍 Mascota MR** en el escritorio
  (`window.renderSnakeMrApp(body)` → `window.SnakeMr.open()`).
- Pruebas: `node tests/test_release_2622.js`, `node tests/test_release_2621.js` (y `tests/test_release_2616.js` … `tests/test_release_2620.js`, que siguen la versión actual), más
  `node tests/test_vr_locomotion.js` (61 comprobaciones: sticks, puntero anclado, emparejamiento de
  mandos), `node tests/test_mr_pet.js` y `node tests/test_update_xr.js`.

## Doganiero VR (2026.23): buscar gafas + ver lo que ves + juego de realidad mixta

Dos páginas nuevas en este mismo servidor (no hace falta otro despliegue):

| Página | Dónde se abre | Para qué |
| --- | --- | --- |
| <https://Doganiero-vr-search.softportweb.com> (`/vr-search`) | ordenador | Busca las gafas por **Bluetooth**, pide la conexión a tu cuenta dogaemail y **muestra en directo lo que estás viendo dentro de las gafas** |
| <https://Doganiero-vr-send.softportweb.com> (`/vr-send`) | gafas VR | Detecta la **solicitud del ordenador**, acepta y **transmite lo que ves**; desde aquí se lanza el **juego MR** (escanear la habitación y cuidar a una serpiente) |

- **Cuenta:** las dos usan las cuentas **dogaemail** de siempre (`doga_auth`, sitios `vrsearch` y
  `vrsend`). En las gafas también se puede entrar con un **código de 6 caracteres** que muestra el
  ordenador (sin escribir la contraseña con los mandos); vale 6 h.
- **Bluetooth:** la página del ordenador usa **Web Bluetooth** (Chrome/Edge): pide permiso, lista las
  gafas/dispositivos VR cercanos y guarda nombre, modelo y batería en la cuenta (`battery_service` y
  `device_information` cuando el dispositivo los expone). Es el canal de descubrimiento; la conexión
  de vídeo va por el servidor (WebSocket) + **WebRTC** directo entre los dos dispositivos.
- **Solicitud:** el ordenador pulsa «Pedir conexión»; a las gafas les llega `request` con el nombre y
  las gafas vistas por Bluetooth. Al **aceptar**, las gafas mandan la oferta WebRTC (`offer`) con el
  vídeo y el ordenador responde (`answer`); los ICE se reenvían por `/api/vrlink/ws` (misma cuenta).
- **Fuentes de vídeo en las gafas:** «pantalla del visor» (`getDisplayMedia`, solo si el navegador de
  las gafas lo permite), **cámara** (`getUserMedia`) y, la que siempre funciona, el **espejo del juego
  MR**: `vr-room-snake.js` renderiza la escena a un canvas aparte (`captureStream(15)`) y ese es el
  vídeo que ve el ordenador (habitación + serpiente en primera persona).
- **Juego de realidad mixta:** con WebXR `immersive-ar` (Meta Quest 3/3S, Pico 4 Ultra…) la página
  abre passthrough + `hit-test`: se **escanea la habitación** apuntando al suelo (marcas azules) y las
  superficies verticales detectadas se convierten en **obstáculos** de un mapa de celdas de 0,25 m.
  Al terminar (70 puntos o gatillo) aparece la **serpiente** en la zona libre: **gatillo** = dejar
  comida o acariciarla, **squeeze** = limpiar sus desastres, **A** = jugar, **B** = ocultar el panel.
  Comida/cariño/limpieza bajan con el tiempo; hay puntos y niveles (se guardan en `localStorage`).
  Sin AR el juego cae a `immersive-vr` y, sin WebXR, a un **modo prueba** con ratón (útil para revisar
  en el PC). El ordenador ve el estado (barras + nivel) y puede pedir una **foto** (`toDataURL`).
- **DNS / túnel (solo la primera vez):** en Cloudflare (túnel `snake-os-vp-cloudflared`) hay que
  añadir dos *public hostnames* → `http://web:8000`: `doganiero-vr-search.softportweb.com` y
  `doganiero-vr-send.softportweb.com`. Mientras no estén, todo funciona igual en
  `https://snake-os-vp.softportweb.com/vr-search` y `/vr-send` (el código del ordenador muestra
  también esa URL de reserva).
- **Opcional:** `SNAKEOS_TURN_URL` (p. ej. `turn:mi-turn:3478`), `SNAKEOS_TURN_USER` y
  `SNAKEOS_TURN_PASS` añaden un servidor TURN para cuando las gafas y el ordenador están en redes
  distintas con NAT simétrico (sin TURN basta STUN público si están en la misma wifi).
- **Límites conocidos:** el navegador de las gafas (Meta Quest Browser/Wolvic) no suele dejar
  capturar la pantalla del sistema (`getDisplayMedia`), por eso el espejo del juego es la fuente
  principal; el escaneo es un muestreo de `hit-test` (no hay malla de la habitación), así que con
  poca luz o poca superficie vista la zona de juego se reduce a lo escaneado; y Web Bluetooth no
  existe en las gafas: la búsqueda se hace siempre desde el ordenador.
- **API:** `window.DoganieroRoomSnake` (`start({onState,onLog,onEnd})`, `stop()`, `snapshot()`,
  `mirrorStream()`, `state()`, `supported()`).
- **Pruebas:** `node tests/test_release_2623.js` (y `tests/test_release_2616.js` … `tests/test_release_2622.js`).

## Doga Tag VR (2026.32, con la locomoción más rápida de 2026.33): pilla-pilla estilo «gorilla tag» en el bosque de Doganiero

Sustituye al juego anterior de 2026.31 (ya no está `doga-gorilla.js`). Es el juego completo: bosque
con **Ciudad Doganiero**, bots, **Doga-huesos**, tienda de cosméticos, power-ups, audio procedural y
**WebXR** con locomoción de brazos. No hay paso de compilación: Three.js r160 va dentro del propio
juego, en `doga-tag-vr/lib/three.module.js` (módulos ES + `importmap`), así que funciona sin CDN.

| Dónde se abre | Para qué |
| --- | --- |
| <https://snake-os-vp.softportweb.com/doga-gorilla> | la página del juego (también `/doga-tag-vr`) |
| <https://doga-gorilla.softportweb.com> | lo mismo, en su propio subdominio cuando el túnel lo publique |

- **Cómo se anda (lo importante):** con el **joystick izquierdo** andas hacia donde miras (`applyStickWalk`,
  `xrSticks`: zona muerta `STICK_DEAD = 0,16`, `VR_WALK = 7 m/s` y `VR_RUN = 12 m/s` con el joystick a
  tope, con pasos de nudillos y frenada suave al soltarlo) y, como en *gorilla tag*, también **con los
  brazos**: en VR apoyas las manos en el suelo, los troncos, las rocas o las plataformas (`insideSurface`)
  y las **arrastras** para empujarte (`updatePlayerVR`, anclas por mano y `handHistory` para el impulso);
  al **soltar** sales disparado con la media de la velocidad de las manos (`powerMul().cap`, 13 m/s).
  En el ordenador, **WASD** anda a 8,2 m/s, el **ratón** mira, **espacio** salta, **shift** corre a
  12,5 m/s y **clic** da un manotazo. En el móvil, mitad izquierda para moverse y mitad derecha para mirar.
- **El mundo:** claro de Doganiero (`AREA_R = 15 m`), bosque de 170 árboles instanciados, rocas y
  troncos (`trunks`, `boxes`) por los que trepar, y **Ciudad Doganiero** al norte (`CITY`, `-52..-23`
  en Z) con plaza, calles, azoteas, torre del reloj, tiendas con toldos, farolas y contenedores.
  `heightAt` hace las colinas y `supportHeight`/`pushOut` la física de suelo y choques. Los límites del
  mundo están en `WORLD_R = 58`.
- **El monke:** avatar low-poly con textura de pelo moteada (`furTex`), antifaz en forma de corazón,
  ojos grandes, morro gris, emblema «</>» de Doganiero en el pecho (`badgeTex` con
  `assets/doganiero-icon.png`) y **manos de bloques** (`makeBlockyHand`); sin piernas, como el original.
  Los bots (`makeGorilla`, 6 en el mapa) llevan los mismos cuerpos, colores y gorros de la tienda.
- **Pilla-pilla:** quien la lleva brilla en rojo (`IT_COLOR`); tocarlo con las manos (o el cuerpo, en
  el ordenador) se la pasa (`checkTags`, `setIt`) con 2 s de gracia para no devolverla al instante. Hay
  marcador en el claro y HUD con quién la lleva, avisos y ranking por tiempo libre.
- **Doga-huesos 🦴:** 24 flotando por el mapa en **un solo `InstancedMesh`** (`boneIM`), reaparecen a
  los 18-28 s. Se gastan en la **Tienda Doganiero** (`SHOP`): gorros (`HATS`: Gorra Doga, Chistera
  Snake, Hoja, Corona) y colores de pelo (`COLORS`); los botones se tocan con la mano en VR o con
  clic/raycast en el ordenador (`pressShop`, `shopRaycast`). Se guarda en `localStorage`
  (`dogaTag.v1`: huesos, `owned`, `hat`, `color`).
- **Power-ups (8 s, reaparecen a los 25 s):** **Salto Snake 🐍** (salto ×1,8; en VR el lanzamiento
  ×1,8 con tope 20 m/s) y **Turbo Doga ⚡** (velocidad ×1,55 y más alcance de brazos). Ver
  `powerMul`.
- **Audio sin descargar nada:** WebAudio procedural (`initAudio`, `playImpact`, `beep`) con pasos de
  nudillos, variantes por superficie (hierba, madera, piedra, cemento, metal: `SURFACE_FX`,
  `surfaceAt`), golpes de manos en VR y pasos de bots con `PannerNode`; música del menú propia
  (`composeTitleMusic`, ~116 BPM) con botón 🔊 para silenciar (`dogaTag.musicMuted`).
- **Rendimiento para Quest:** huesos en un `InstancedMesh`, árboles y farolas instanciados, geometrías
  y materiales compartidos (`SHARED`, `G`), partículas de etiqueta en pool y zero allocations en los
  bucles calientes.

- **Ficheros:** `doga-tag-vr/` (`index.html`, `game.js`, `lib/three.module.js`, `lib/VRButton.js`,
  `assets/*.png`, su propio `README.md`) y `doga_gorilla.py` (rutas `/doga-gorilla`, `/doga-tag-vr`,
  `/api/doga-gorilla/status` y el subdominio). Los archivos del juego se sirven por
  **`/doga-gorilla/files/<ruta>`** y no por `/static`: la lista blanca de `/static` solo deja pasar la
  raíz del proyecto y `assets/`, y aquí hay subcarpetas (`lib/`, `assets/`) con módulos `.js` y `.png`.
  `_safe_rel` sanea la ruta (nada de `..`, `.env` ni extensiones raras) y `FileResponse` pone el tipo
  correcto (`text/javascript` para los módulos ES, que es obligatorio para que el navegador los
  ejecute como módulo).
- **Caché (por qué a veces «no llegaban» los cambios):** Cloudflare reescribe el `Cache-Control` de
  los estáticos a `max-age=14400` (**4 horas**). Con una URL fija el navegador se quedaba con el
  `game.js` viejo aunque el deploy fuese nuevo. Ahora `doga_gorilla.py` sirve la página **reescrita**
  (`_render_page` + `_REL_REF_RE`) y cambia cada `./game.js`, `./lib/three.module.js` y `./assets/*.png`
  por `/doga-gorilla/files/<ruta>?v=<token real>` (`_asset_token` = sha1 de ruta+mtime+tamaño, igual
  que hace `main.py` con `index.html`): si el archivo cambia, cambia la URL y no hay copia vieja que
  valga. Con el `?v=` bueno la respuesta va `immutable`; sin él, `no-cache` (revalida y nunca se queda
  viejo). La página va con `no-store`. `/api/doga-gorilla/status` dice qué está sirviendo producción
  (`version`, `build`, `engineTokens`, `fileTokens`).
- **API:** `window.__game` (`THREE`, `scene`, `rig`, `camera`, `entities`, `player`, `hands`, `boxes`,
  `trunks`, `setIt`, `save`, `power`, `bones`, `powerItems`, `shopButtons`, `pressShop`, `tagBurst`,
  `CITY`, `CITY_SPOTS`, `inCity`, `keys`, `surfaceAt`, `ensureAudio`, `playImpact`, música, `look()`,
  `simT`, `xrSticks`, `applyStickWalk`, `vrWalk`, `VR_WALK`, `VR_RUN`, `STICK_DEAD`, `powerMul`).
  Parámetros de URL para pruebas: `?autostart`,
  `&view=forest|doganiero|arms|tienda|avatar|ciudad`, `&freeze`, `&seed=N`.
- **DNS / túnel (solo la primera vez):** en Cloudflare (túnel `snake-os-vp-cloudflared`) hay que añadir
  el *public hostname* `doga-gorilla.softportweb.com` → `http://web:8000`. Mientras no esté, el juego
  funciona igual en `https://snake-os-vp.softportweb.com/doga-gorilla`.
- **Pruebas:** `node tests/test_doga_tag_vr.js` (arranca el motor de verdad: carga el `three.js` real y
  solo cambia el `WebGLRenderer` y el reloj, así que sin WebGL ni gafas se ejecutan el mundo, los bots,
  los huesos, los power-ups, la tienda, el HUD, el pilla-pilla, la **locomoción de brazos en VR** y
  **andar/correr con el joystick** —zona muerta, media potencia y a tope—, además de la velocidad a pie
  en el ordenador),
  `python3 -m unittest tests.test_doga_tag_vr` (el `?v=` real de la página, las rutas saneadas y la
  caché, sin fastapi) y `node tests/test_release_2633.js` (y `tests/test_release_2616.js` …
  `tests/test_release_2632.js`).


### Mascota MR sin límites (2026.31)

- Ya **no hace falta escanear** la habitación para empezar: el gatillo pone la mascota en marcha al
  instante y el suelo se coloca solo a los ~6 s (antes había mínimos de puntos escaneados).
- **Jardín grande** (`GARDEN_R = 20 m`) al que se puede salir a pasear: cielo, sol, hierba, lago,
  árboles, flores, matojos, colinas, arcoíris, farolillos, luciérnagas y mariposas (`buildGarden`,
  `updateGarden`). Se cambia **jardín ↔ tu habitación** con el botón **A** del mando
  (`setWorld`/`toggleWorld`, se recuerda en `prefWorld`).
- **Andar con el mando en el jardín**: stick izquierdo para moverse y stick derecho para girar
  (`walkSticks`); en la habitación se sigue andando de verdad (passthrough).


