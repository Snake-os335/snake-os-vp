# Workflow: Commit + Push al terminar (snake-os-vp)

Skill reutilizable: ejecuta el cierre obligatorio de cualquier tarea del proyecto.
Uso: `/commit-and-push` al finalizar una tarea ya validada.

## Pasos

1. **Revisar estado** (qué está modificado vs. nuevo):
   ```bash
   git status --porcelain
   git --no-pager diff --stat
   ```

2. **Validar** lo tocado antes de commitear:
   - Python: `python3 -m py_compile $(git diff --name-only -- '*.py')`
   - JS: `node --check <archivo>.js` o, sin `node`,
     `ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app/Contents/MacOS/Code" --check <archivo>.js`
   - Tests: los de `tests/` tocados (los omitidos por falta de deps se anotan, no bloquean).

3. **Comprobar secretos/junk** que NO deben entrar (`.gitignore` ya los cubre):
   `.env`, `block.env`, `entry.env`, `secrets/`, `certs/`, `data/`, `core`/`core.*`,
   `*.bak*`, `backups/`, `__pycache__/`. Si aparece algún archivo de estos en `git status`,
   confirmar que está ignorado; si no, añadirlo a `.gitignore`.

4. **Añadir selectivamente** el código/assets/tests reales (incluye nuevos que el código importa
   o referencia):
   ```bash
   git add <archivos...>            # o: git add -A  solo si .gitignore cubre secretos/junk
   ```

5. **Commit** con mensaje descriptivo en español, estilo del repo (una línea larga + "Sin cambio
   de versión" si aplica):
   ```bash
   git commit -m "<descripción clara, qué y por qué>"
   ```

6. **Push**:
   ```bash
   git push origin main
   ```
   Si falla: `git pull --rebase origin main` y reintentar. Si hay conflicto, resolver o avisar.
   Nunca dejar commits sin subir.

7. **Resumen**: informar del SHA corto, rama y confirmación de push (o el motivo del fallo).
   Recordar que el **deploy a producción** requiere autorización de David (no lo hace este skill).
