# Norma del proyecto: al terminar, SIEMPRE commit y push

> Esta norma es obligatoria en **snake-os-vp**. Aplica a cualquier tarea: arreglos, features,
> refactors, tests o cambios de documentación.

## Regla

Cuando el trabajo de una tarea está **terminado y validado**, hay que:

1. **Commitear** los cambios en `main`.
2. **Pushear** a `origin` (`git push origin main`).

No se deja trabajo terminado sin commitear ni commits sin subir. Si la tarea termina en un
punto intermedio (a medias, sin validar), se avisa explícitamente de por qué **no** se commitea.

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

## Límite: producción (deploy) ≠ git

- Commitear y pushear es **siempre** obligatorio al terminar.
- **Desplegar a producción** (reiniciar el contenedor, hot‑sync al servidor, etc.) **no** se hace
  automáticamente: requiere que David lo autorice (respetar el "gate" de producción de cada
  `ROLLBACK.json`/`MANIFEST.json`). Una vez autorizado, hacer el deploy y luego commit+push igual.

## Resumen final al usuario

Al terminar, el resumen debe indicar: qué se cambió, resultados de validación y el SHA/estado
del commit + push (o el motivo si no se pudo pushear).
