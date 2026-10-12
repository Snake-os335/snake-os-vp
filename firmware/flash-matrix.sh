#!/bin/bash
# Snake OS · MAX7219 matrix firmware — compila y sube por USB.
#
# Firmware unificado: ~m (Matriz LED + Snake) y ~c1/~c?/~g (llamadas + ¿Dónde?).
# Sustituye el .hex RTOS de snake-os-lite.hex en la placa.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SKETCH_DIR="$ROOT/matrix-max7219"
BOARD="${BOARD:-mega2560}"

warn_replace() {
  echo "================================================================"
  echo " ADVERTENCIA: este proceso REESCRIBE el flash de la Arduino."
  echo " El RTOS interactivo de snake-os-lite.hex deja de estar en la placa;"
  echo " en su lugar queda el driver de matriz + protocolo web (~m, ~c1, ~g)."
  echo "================================================================"
}

pick_port() {
  PORT="${PORT:-}"
  if [ -n "$PORT" ]; then
    return 0
  fi
  shopt -s nullglob
  for candidate in /dev/cu.usbmodem* /dev/ttyACM* /dev/ttyUSB*; do
    if [ -e "$candidate" ]; then
      PORT="$candidate"
      break
    fi
  done
  shopt -u nullglob
  if [ -z "${PORT:-}" ]; then
    echo "No veo ninguna placa USB (/dev/ttyACM*, /dev/ttyUSB*, …)."
    echo "Enchufa la Arduino y, en Linux, comprueba permisos (dialout)."
    exit 1
  fi
}

fqbn_for_board() {
  case "$1" in
    mega2560|mega) echo "arduino:avr:mega" ;;
    uno) echo "arduino:avr:uno" ;;
    *)
      echo "BOARD desconocido: $1 (usa mega2560 o uno)"
      exit 1
      ;;
  esac
}

flash_with_arduino_cli() {
  local fqbn="$1"
  warn_replace
  pick_port
  echo "Compilando $SKETCH_DIR para $BOARD ($fqbn)…"
  arduino-cli compile --fqbn "$fqbn" "$SKETCH_DIR"
  echo "Subiendo a $PORT…"
  arduino-cli upload -p "$PORT" --fqbn "$fqbn" "$SKETCH_DIR"
  echo "Listo. Monitor serial: arduino-cli monitor -p $PORT -c baudrate=115200"
  echo "Prueba monitor 115200: ~m ?  →  ~m hi 1 8x8"
}

manual_instructions() {
  cat <<EOF
No encuentro arduino-cli en PATH.

Instalación rápida (Linux):
  curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
  arduino-cli core update-index
  arduino-cli core install arduino:avr

Compilar y subir manualmente:
  export BOARD=${BOARD}
  $0

O desde Arduino IDE 2.x:
  1. Abre $SKETCH_DIR/matrix-max7219.ino
  2. Placa: Arduino Mega 2560 (o Uno si cambiaste BOARD=uno)
  3. Puerto serial correcto → Subir

Tras flashear, prueba en monitor 115200:
  ~m ?
  → debe responder: ~m hi 1 8x8
EOF
}

main() {
  if [ ! -f "$SKETCH_DIR/matrix-max7219.ino" ]; then
    echo "No encuentro $SKETCH_DIR/matrix-max7219.ino"
    exit 1
  fi

  FQBN="$(fqbn_for_board "$BOARD")"

  if command -v arduino-cli >/dev/null 2>&1; then
    flash_with_arduino_cli "$FQBN"
    exit 0
  fi

  echo "arduino-cli no está instalado; el sketch está listo para compilar en IDE."
  manual_instructions
  exit 0
}

main "$@"
