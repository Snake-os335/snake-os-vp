#!/bin/bash
# Snake OS Lite · carga el RTOS solo en una Arduino Mega 2560.
# Si la Mega ya arranca con Snake OS Lite, no escribe nada.
set -euo pipefail

MARK="$HOME/.snake-os-lite-installed"
HEX="$(cd "$(dirname "$0")" && pwd)/snake-os-lite-mega2560.hex"
if [ ! -f "$HEX" ]; then
  HEX="$(cd "$(dirname "$0")" && pwd)/snake-os-lite.hex"
fi
if [ ! -f "$HEX" ]; then
  echo "No encuentro el archivo snake-os-lite-mega2560.hex junto a este instalador."
  exit 1
fi

AVRDUDE=""
CONF=""
for candidate in \
  "$HOME/Library/Arduino15/packages/arduino/tools/avrdude/"*/bin/avrdude \
  /Users/*/Library/Arduino15/packages/arduino/tools/avrdude/*/bin/avrdude
do
  if [ -x "$candidate" ]; then
    AVRDUDE="$candidate"
    CONF="$(cd "$(dirname "$candidate")/../etc" 2>/dev/null && pwd)/avrdude.conf"
    [ -f "$CONF" ] || CONF=""
    break
  fi
done
if [ -z "$AVRDUDE" ]; then
  AVRDUDE="$(command -v avrdude || true)"
  CONF=""
fi
if [ -z "$AVRDUDE" ]; then
  echo "No encuentro avrdude. En Linux: sudo apt install avrdude"
  exit 1
fi

PORT=""
shopt -s nullglob
for candidate in /dev/cu.usbmodem* /dev/ttyACM* /dev/ttyUSB*; do
  if [ -e "$candidate" ]; then
    PORT="$candidate"
    break
  fi
done
shopt -u nullglob
if [ -z "$PORT" ]; then
  echo "No veo una placa. Enchufa la Mega 2560 por USB."
  echo "En Linux debe aparecer como /dev/ttyACM0 o /dev/ttyUSB0."
  echo "Si usas una máquina virtual, pasa el USB de la Mega al guest."
  exit 1
fi

abrir_rtos() {
  case "$PORT" in
    /dev/ttyACM*|/dev/ttyUSB*)
      echo "Abre el RTOS con:"
      echo "python3 -m serial.tools.miniterm $PORT 115200"
      echo "Escribe ayuda o rtos."
      ;;
  esac
}

echo "Snake OS Lite · comprobando que sea una Mega 2560 en $PORT"
CONF_ARG=()
if [ -n "$CONF" ]; then
  CONF_ARG=(-C "$CONF")
fi
if ! "$AVRDUDE" "${CONF_ARG[@]}" -patmega2560 -cwiring -P"$PORT" -b115200 -n >/tmp/snake-os-lite-firma.txt 2>&1; then
  echo "Esta placa no es una Arduino Mega 2560. Snake OS Lite no se ha escrito."
  exit 1
fi

ya=""
set +e
ya="$(python3 - "$PORT" <<'PY'
import sys, time
try:
    import serial
except Exception:
    sys.exit(2)
port = sys.argv[1]
try:
    link = serial.Serial(port, 115200, timeout=0.2)
    try:
        time.sleep(2.2)
        data = link.read(link.in_waiting or 1)
        end = time.time() + 0.6
        while time.time() < end:
            chunk = link.read(link.in_waiting or 1)
            if chunk:
                data += chunk
    finally:
        link.close()
except Exception:
    sys.exit(2)
sys.exit(0 if b"Snake OS Lite" in data else 1)
PY
)"
codigo=$?
set -e
if [ "$codigo" -eq 0 ]; then
  echo "Esta Mega 2560 ya tiene Snake OS Lite. No se instala otra vez."
  echo "Snake OS Lite" > "$MARK"
  abrir_rtos
  exit 1
fi
if [ "$codigo" -eq 2 ]; then
  echo "No pude leer la placa. No he escrito nada."
  exit 1
fi

echo "Firma de Mega 2560 correcta. Escribo solo el programa."
"$AVRDUDE" "${CONF_ARG[@]}" -patmega2560 -cwiring -P"$PORT" -b115200 -D -Uflash:w:"$HEX":i
echo "Snake OS Lite" > "$MARK"
echo "Snake OS Lite ya esta en la placa."
abrir_rtos
