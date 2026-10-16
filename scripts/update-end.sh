#!/bin/sh
# Quita la pantalla de actualización; los navegadores abiertos se recargan solos.
set -e
cd "$(dirname "$0")/.."
rm -f .updating
echo "Pantalla de actualización DESACTIVADA"
