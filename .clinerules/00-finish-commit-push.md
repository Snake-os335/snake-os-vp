# Norma del proyecto: al terminar, SIEMPRE commit, push y deploy

> Esta norma es obligatoria en **snake-os-vp**. Aplica a cualquier tarea: arreglos, features,
> refactors, tests o cambios de documentación.

## Regla

Cuando el trabajo de una tarea está **terminado y validado**, hay que:

1. **Commitear** los cambios en `main`.
2. **Pushear** a `origin` (`git push origin main`).
3. **Desplegar a producción**: el push ya despliega solo (auto-deploy del VPS, ≤3 min); hay que
   **verificar** que prod sirve ese commit (`/api/status`) y, si corre prisa, lanzar la update a mano.

No se deja trabajo terminado sin commitear, ni commits sin subir, ni commits sin desplegar y verificar.
Si la tarea termina en un punto intermedio (a medias, sin validar), se avisa explícitamente de por qué
**no** se commitea.

## Qué significa "terminado"

- El código compila / pasa el chequeo: `python3 -m py_compile <archivos>.py` y, si es JS,
  `node --check` (o `ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app/Contents/MacOS/Code" --check <archivo>.js`
  si no hay `node` en el PATH).
- Los tests nuevos o tocados pasan (p. ej. `tests/test_call_video_ad.js`,
  `python3 -m unittest tests.test_privacy_share`). Los omitidos por falta de dependencias
  locales (FastAPI) se mencionan en el resumen, no bloquean el commit.
- No quedan placeholders ni TODOs sin terminar en lo que se entrega.

## Cómo commitear (selectivo, nunca a ciegas)

- **Nunca** `git add -A` a ciegas si hay archivos desconocidos: revisar antes con `git status`.
- Respetar `.gitignore`. **Prohibido** subir: `.env`, `block.env`, `entry.env`, `secrets/`,
  `certs/`, `data/`, `core`/`core.*`, `*.bak*`, `backups/`, `__pycache__/`.
- Añadir solo archivos de código/assets/tests reales, incluidos los nuevos que el código importa
  o referencia (p. ej. `privacy_share.py`, `account_block.py`, `doga_gate.py`, `go_back.py`,
  `call-video-ad.js`, `snake-kernel-flip.js`, `assets/*`, `static/*`, `tests/*`).
- Mensaje de commit en **español**, de una línea descriptiva y larga, con el estilo del repo
  (qué cambia y por qué). Añadir "Sin cambio de versión" cuando no se sube versión.

## Cómo pushear

- `git push origin main`. Si falla por cambios remotos, `git pull --rebase origin main` y
  reintentar el push; si hay conflicto, resolverlo o avisar. Nunca dejar el árbol terminado
  sin subir.

## Producción: el push despliega (no hay "gate" de autorización)

- Producción es el VPS de Oracle (`vps4_david` → `143.47.39.192`), carpeta en vivo
  `/srv/juegos_david/snake-os-vp` (contenedor `snake-os-vp` en :8988 + `snake-os-vp-cloudflared`),
  URL pública <https://snake-os-vp.softportweb.com>.
- **Push a `main` = deploy.** El cron del VPS (`/srv/juegos_david/bin/snake-auto-deploy.sh`, copia de
  `scripts/auto-deploy.sh`) despliega cada 3 min sin intervención: pantalla de actualización, backup
  (`git bundle`), `merge --ff-only`, reinicio del contenedor solo si cambian `.py`/Docker/requirements,
  health-check y **rollback automático** si falla (ese commit queda marcado como `bad`).
- **No existe autorización previa de nadie ni ficheros `ROLLBACK.json`/`MANIFEST.json` que respetar.**
  El único control es el health-check con rollback del propio auto-deploy. Por tanto: **no preguntes
  "¿lo despliego?"**; termina, valida, commitea, pushea y verifica el deploy.
- **Verificar el deploy** (público, sin SSH ni contraseñas):
  ```bash
  curl -s https://snake-os-vp.softportweb.com/api/status   # {"updating":false,"version":"<sha>-<firma>"}
  git rev-parse --short HEAD                                # debe coincidir con <sha>
  ```
  El sufijo tras el guion es la firma de los estáticos servidos; el SHA del commit es lo que importa.
- **Deploy inmediato** (no esperar los 3 min del cron), desde el Mac:
  ```bash
  ssh vps4_david 'bash /srv/juegos_david/snake-os-vp/scripts/publicar-update.sh'
  ```
  Mismo procedimiento que el cron (comparte cerrojo) y mantiene la pantalla de actualización ≥25 s.
  Si `ssh` pide contraseña (esta sesión no tiene la clave `id_ed25519_vps4_david` autorizada), se espera
  al cron y se verifica con `/api/status`.
- **Ojo con la carpeta local**: esta sesión trabaja en `/Users/antonella/vps-juegos-david/snake-os-vp`
  (copia en el Mac; el "vps" del nombre es solo orientativo). **No es la carpeta en vivo**: nada de lo que
  se edita aquí está en producción hasta el push.
- **Editar por SSH en la carpeta en vivo no es la vía**: el auto-deploy rechaza desplegar si hay cambios
  sin commit allí y un rollback (`git reset --hard`) los borraría; para `.py` haría falta reiniciar el
  contenedor a mano. Si por urgencia se toca algo en vivo: traerlo al worktree, commit+push y
  `publicar-update.sh`.

## Resumen final al usuario

Al terminar, el resumen debe indicar: qué se cambió, resultados de validación y el SHA/estado
del commit + push, y la confirmación del deploy en producción (`/api/status` sirviendo ese SHA,
o el motivo/estado si aún no ha pasado el auto-deploy).
