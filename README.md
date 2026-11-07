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
- API: `window.DogaNet` (`isOn()`, `isConnected()`, `hasInternet()`, `set(bool)`, `toggle()`, `check()`,
  `requireOnline(nombre)`, `isOnlineRequest(url)`, `profile()`, `syncProfile()`, `on(fn)`).
  Pruebas: `node tests/test_release_2617.js` y `node tests/test_release_2618.js`.

