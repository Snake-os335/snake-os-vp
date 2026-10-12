#!/bin/bash
# Snake OS · flashea firmware ~m (Matriz LED, Snake, ~c1/~g) en Arduino Mega 2560 por USB.
# Mac: /dev/cu.usbmodem* · Linux: /dev/ttyACM*
set -euo pipefail

BASE="${SNAKEOS_WEB_BASE:-http://127.0.0.1:8987}"
BASE="${1:-$BASE}"
BASE="${BASE%/}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORKDIR="${SNAKEOS_MATRIX_BUILD_DIR:-$HOME/snake-os-matrix-firmware}"
SKETCH_DIR="$WORKDIR/matrix-max7219"
BOARD="${BOARD:-mega2560}"

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
    echo "No veo la Mega por USB. Enchúfala y vuelve a intentar."
    exit 1
  fi
}

ensure_sketch() {
  if [ -f "$HERE/firmware/matrix-max7219/matrix-max7219.ino" ]; then
    SKETCH_DIR="$HERE/firmware/matrix-max7219"
    return 0
  fi
  mkdir -p "$SKETCH_DIR"
  echo "Descargando sketch desde $BASE …"
  curl -fsSL "$BASE/descargas/firmware/matrix-max7219.ino" -o "$SKETCH_DIR/matrix-max7219.ino"
}

ensure_arduino_cli() {
  if command -v arduino-cli >/dev/null 2>&1; then
    return 0
  fi
  echo "No encuentro arduino-cli."
  if command -v brew >/dev/null 2>&1; then
    echo "Instalando con Homebrew (puede pedir contraseña)…"
    brew install arduino-cli
  else
    cat <<EOF
Instala Arduino CLI en el Mac:
  brew install arduino-cli
  arduino-cli core update-index
  arduino-cli core install arduino:avr

O sube firmware/matrix-max7219/matrix-max7219.ino con Arduino IDE 2 (Mega 2560, 115200).
EOF
    exit 1
  fi
}

fqbn_for_board() {
  case "$1" in
    mega2560|mega) echo "arduino:avr:mega" ;;
    uno) echo "arduino:avr:uno" ;;
    *) echo "BOARD desconocido: $1" >&2; exit 1 ;;
  esac
}

main() {
  echo "Snake OS · firmware matriz ~m (+ ~c1 / ~g)"
  pick_port
  ensure_sketch
  ensure_arduino_cli
  arduino-cli core update-index >/dev/null 2>&1 || true
  arduino-cli core install arduino:avr >/dev/null 2>&1 || arduino-cli core install arduino:avr
  FQBN="$(fqbn_for_board "$BOARD")"
  echo "Compilando para $BOARD ($FQBN)…"
  arduino-cli compile --fqbn "$FQBN" "$SKETCH_DIR"
  echo "Subiendo a $PORT …"
  arduino-cli upload -p "$PORT" --fqbn "$FQBN" "$SKETCH_DIR"
  echo ""
  echo "Listo. Comprueba en monitor serial (115200):  ~m ?"
  echo "Debe responder:  ~m hi 1 8x8"
  echo ""
  echo "Luego deja el puente en este Mac:"
  echo "  export SNAKEOS_WEB_BASE=$BASE"
  echo "  python3 snake-os-lite-local.py"
  echo "En Matriz LED los badges deben pasar a ~m OK y Placa ~m hace …s"
}

main "$@"
