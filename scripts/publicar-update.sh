#!/bin/bash
# Snake OS VP · publicar una actualización (NORMA: cada actualización terminada se sube a git
# y se lanza con este script para que todos vean la pantalla «Snake OS! se está actualizando...»).
#
# Uso (en la VM):   bash /srv/juegos_david/snake-os-vp/scripts/publicar-update.sh
#   1. Antes: commit en tu rama, rebase sobre origin/main, fast-forward de main y `git push origin main` (sin forzar).
#   2. Este script, en la carpeta en vivo: fetch, backup (git bundle), pantalla de update (.updating),
#      git merge --ff-only origin/main, reinicio SOLO de snake-os-vp si cambió Python/Docker, health-check,
#      quita la pantalla. Las pestañas abiertas ven la pantalla y se recargan con la versión nueva.
#   Sin commits nuevos también lanza la update (relanza la pantalla y recarga a los clientes).
#   Si algo falla vuelve al commit anterior. Comparte cerrojo con el auto-deploy (cron) para no pisarse.
# Variables: UPDATE_MIN_SECONDS (por defecto 25: tiempo mínimo de pantalla para que la vean todas las pestañas).
set -u
REPO=/srv/juegos_david/snake-os-vp
URL=https://github.com/Snake-os335/snake-os-vp.git
BK=/srv/juegos_david/backups/snake-os-vp
LOG=/srv/juegos_david/logs/snake-auto-deploy.log
HEALTH=http://127.0.0.1:8988
MIN=${UPDATE_MIN_SECONDS:-25}
mkdir -p "$BK" "$(dirname "$LOG")"
say(){ echo "$(date "+%F %T") [publicar-update] $*" | tee -a "$LOG"; }
cd "$REPO" || exit 1
exec 9>/tmp/snake-auto-deploy.lock
flock -w 300 9 || { say "ERROR: otro despliegue sigue en marcha (cerrojo ocupado)"; exit 1; }
[ "$(git symbolic-ref --short HEAD 2>/dev/null)" = main ] || { say "ERROR: la carpeta en vivo no está en main"; exit 1; }
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  say "ERROR: hay cambios sin commit en la carpeta en vivo (¿otro proceso probando?). No publico."; git status --short --untracked-files=no; exit 1
fi
export GIT_TERMINAL_PROMPT=0
git fetch -q origin main 2>/dev/null || git fetch -q "$URL" +refs/heads/main:refs/remotes/origin/main || { say "ERROR fetch"; exit 1; }
OLD=$(git rev-parse HEAD); NEW=$(git rev-parse origin/main)
git merge-base --is-ancestor "$OLD" "$NEW" || { say "ERROR: origin/main ($NEW) no es fast-forward de $OLD"; exit 1; }
CHANGED=$(git diff --name-only "$OLD" "$NEW")
TS=$(date +%Y%m%d-%H%M%S)
git bundle create -q "$BK/pre-$TS-${OLD:0:7}.bundle" HEAD && echo "$OLD" > "$BK/last-good"
ls -1t "$BK"/pre-*.bundle 2>/dev/null | tail -n +21 | xargs -r rm -f
V0=$(curl -s "$HEALTH/api/status")
T0=$(date +%s)
sh scripts/update-start.sh >/dev/null && say "Update LANZADA ${OLD:0:7} -> ${NEW:0:7} (antes: $V0)"
needs_restart(){ echo "$CHANGED" | grep -Eq "(\.py$|^Dockerfile|^docker-compose|^requirements)"; }
restart(){
  if echo "$CHANGED" | grep -Eq "^(Dockerfile|requirements)"; then docker compose up -d --build web
  elif echo "$CHANGED" | grep -Eq "^docker-compose"; then docker compose up -d web
  else docker compose restart web; fi
}
health(){ for i in $(seq 1 30); do c=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH/"); s=$(curl -s "$HEALTH/api/status")
  if { [ "$c" = 200 ] || [ "$c" = 503 ]; } && echo "$s" | grep -q '"updating"'; then return 0; fi; sleep 3; done
  say "health falló: http=$c status=$s"; return 1; }
ok=1
[ "$OLD" = "$NEW" ] || git merge --ff-only -q "$NEW" || ok=0
if [ $ok = 1 ] && needs_restart; then say "Reinicio de snake-os-vp (cambió Python/Docker)"; restart >>"$LOG" 2>&1 || ok=0; fi
[ $ok = 1 ] && { health || ok=0; }
if [ $ok = 0 ]; then
  say "FALLO: vuelvo a ${OLD:0:7}"; git reset -q --hard "$OLD"; needs_restart && restart >>"$LOG" 2>&1; health || say "Rollback: health sigue fallando, revisar a mano"
fi
W=$(( MIN - ($(date +%s) - T0) )); [ $W -gt 0 ] && sleep $W
sh scripts/update-end.sh >/dev/null
for i in $(seq 1 10); do c=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH/"); [ "$c" = 200 ] && break; sleep 2; done
say "Update TERMINADA (ok=$ok, http=$c): $(curl -s "$HEALTH/api/status")"
[ $ok = 1 ]
