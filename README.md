# Snake OS

## Actualizar Snake OS (obligatorio para agentes y personas)

En cada actualización de la carpeta en vivo:

1. Trabaja en una copia aparte (`git worktree` o clon), **nunca** en la carpeta en vivo.
2. `scripts/update-start.sh`: todos los usuarios ven la pantalla «Snake OS! se está actualizando...» (`/api/status` devuelve `updating: true`).
3. Despliega (`git checkout main && git pull`, reiniciar el contenedor si cambió Python).
4. Comprueba que `/` responde 200 y que no hay errores al arrancar.
5. `scripts/update-end.sh`: se quita la pantalla y los navegadores abiertos se recargan solos.

Si algo falla, no dejes la pantalla puesta indefinidamente: vuelve a la versión anterior y ejecuta `update-end.sh`.

### Auto-deploy en la VM (sin depender del Mac)
Cada 3 min, cron ejecuta `/srv/juegos_david/bin/snake-auto-deploy.sh` (copia de `scripts/auto-deploy.sh`):
fetch anónimo HTTPS de `main`; si hay commits nuevos y es fast-forward → `update-start.sh`, backup (git bundle en
`/srv/juegos_david/backups/snake-os-vp`), `merge --ff-only`, reinicio del contenedor solo si cambian `.py`/Docker,
health-check (200 + `/api/status`), `update-end.sh`. Si algo falla vuelve al commit anterior y no reintenta ese commit.
Log: `/srv/juegos_david/logs/snake-auto-deploy.log`. Para desplegar basta con hacer push a `main`.
Si cambias `scripts/auto-deploy.sh`, vuelve a copiarlo a `/srv/juegos_david/bin/`.

### Qué ven los usuarios al actualizar
- Durante el despliegue (`.updating` existe), las cargas NUEVAS de `/` reciben `maintenance.html` (503) y se recargan solas al terminar.
- Sesiones ya abiertas: no se interrumpen ni se recargan; solo ven un aviso pequeño «Hay una actualización de Snake OS! — se instalará la próxima vez que lo abras».
- Al abrir Snake OS con una versión nueva (`/api/status` → `version` = commit), se muestra 10,5 s la pantalla «Snake OS! se está actualizando...» mientras se refrescan cachés, y se entra en la versión nueva.
