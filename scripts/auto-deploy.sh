#!/bin/bash
# Snake OS VP · auto-deploy desde origin/main (solo fast-forward).
# Lo lanza cron cada 3 min desde una copia en /srv/juegos_david/bin/ (no se edita a sí mismo a mitad).
# Fetch anónimo por HTTPS (repo público): en la VM no hacen falta credenciales de escritura.
set -u
REPO=/srv/juegos_david/snake-os-vp
URL=https://github.com/Snake-os335/snake-os-vp.git
LOG=/srv/juegos_david/logs/snake-auto-deploy.log
BK=/srv/juegos_david/backups/snake-os-vp
HEALTH=http://127.0.0.1:8988
mkdir -p "$(dirname "$LOG")" "$BK"
exec 9>/tmp/snake-auto-deploy.lock
flock -n 9 || exit 0
log(){ echo "$(date "+%F %T") $*" >> "$LOG"; }
cd "$REPO" || exit 1
export GIT_TERMINAL_PROMPT=0
[ "$(git symbolic-ref --short HEAD 2>/dev/null)" = main ] || { log "SKIP: carpeta no está en main"; exit 0; }
git fetch -q "$URL" +refs/heads/main:refs/remotes/origin/main 2>>"$LOG" || { log "ERROR fetch"; exit 1; }
OLD=$(git rev-parse HEAD); NEW=$(git rev-parse origin/main)
[ "$OLD" = "$NEW" ] && exit 0
[ "$(cat "$BK/bad" 2>/dev/null)" = "$NEW" ] && exit 0  # ya falló: esperar a un commit nuevo
if ! git merge-base --is-ancestor "$OLD" "$NEW"; then log "RECHAZADO: origin/main $NEW no es fast-forward de $OLD"; exit 1; fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then log "RECHAZADO: cambios locales sin commit en la carpeta en vivo"; exit 1; fi
log "Nuevo main: ${OLD:0:7} -> ${NEW:0:7}"
sh scripts/update-start.sh >>"$LOG" 2>&1
TS=$(date +%Y%m%d-%H%M%S)
git bundle create -q "$BK/pre-$TS-${OLD:0:7}.bundle" HEAD 2>>"$LOG"; echo "$OLD" > "$BK/last-good"
ls -1t "$BK"/pre-*.bundle 2>/dev/null | tail -n +21 | xargs -r rm -f
CHANGED=$(git diff --name-only "$OLD" "$NEW")
needs_restart(){ echo "$CHANGED" | grep -Eq "(\.py$|^Dockerfile|^docker-compose|^requirements)"; }
restart(){
  if echo "$CHANGED" | grep -Eq "^(Dockerfile|requirements)"; then docker compose up -d --build web >>"$LOG" 2>&1
  else docker compose restart web >>"$LOG" 2>&1; fi
}
health(){ # 200 en / y /api/status responde (updating true mientras dura)
  for i in $(seq 1 20); do
    c=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH/"); s=$(curl -s "$HEALTH/api/status")
    # Con .updating, "/" da 503 (maintenance.html) a propósito: vale 200 o 503 si /api/status responde.
    if { [ "$c" = 200 ] || [ "$c" = 503 ]; } && echo "$s" | grep -q "\"updating\""; then return 0; fi; sleep 3
  done; log "health falló: http=$c status=$s"; return 1
}
ok=1
git merge --ff-only -q "$NEW" >>"$LOG" 2>&1 || ok=0
if [ $ok = 1 ] && needs_restart; then log "Reinicio del contenedor (cambió Python/docker)"; restart || ok=0; fi
[ $ok = 1 ] && { health || ok=0; }
if [ $ok = 1 ]; then
  sh scripts/update-end.sh >>"$LOG" 2>&1
  for i in $(seq 1 10); do c=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH/"); [ "$c" = 200 ] && break; sleep 2; done
  if [ "$c" = 200 ]; then log "OK desplegado ${NEW:0:7}"; exit 0; fi
  log "health final falló (http=$c)"; ok=0; sh scripts/update-start.sh >>"$LOG" 2>&1
fi
if [ $ok = 0 ]; then
  log "FALLO: vuelvo a ${OLD:0:7}"; echo "$NEW" > "$BK/bad"
  git reset -q --hard "$OLD" >>"$LOG" 2>&1
  CHANGED=$(git diff --name-only "$OLD" "$NEW"); needs_restart && restart
  health && log "Rollback OK" || log "Rollback: health sigue fallando, revisar a mano"
fi
sh scripts/update-end.sh >>"$LOG" 2>&1
