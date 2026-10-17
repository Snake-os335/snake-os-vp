# Snake OS

## Actualizar Snake OS (obligatorio para agentes y personas)

**Norma:** cada actualización terminada se sube a git **y** se lanza la update de Snake OS con el script:

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
  Cambia en cada despliegue, aunque solo cambien archivos estáticos y sin reiniciar.
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

### Qué ven los usuarios al actualizar
- Pestañas abiertas (comprueban `/api/status` cada 20 s, cada 3 s durante la update y al volver a la pestaña):
  con `updating: true` → pantalla completa «Snake OS! se está actualizando...»; al terminar (o si detectan una
  versión nueva sin haber visto el flag) se recargan con la versión nueva. Sin sesión, en seguida; con sesión,
  cuenta atrás de 10 s con «Actualizar ahora» / «Ahora no» (aviso con botón; se vuelve a lanzar a los 10 min).
- Cargas nuevas durante el despliegue: `maintenance.html` (503) y se recargan solas al terminar.
- Al abrir Snake OS con una versión nueva se muestra 10,5 s la pantalla mientras se refrescan cachés.
