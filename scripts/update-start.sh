#!/bin/sh
# Muestra a todos los usuarios la pantalla «Snake OS! se está actualizando...».
# Úsalo SIEMPRE antes de desplegar en la carpeta en vivo; al acabar, scripts/update-end.sh.
set -e
cd "$(dirname "$0")/.."
date -u +%Y-%m-%dT%H:%M:%SZ > .updating
echo "Pantalla de actualización ACTIVADA"
