# Snake OS · firmware MAX7219 (8×8)

Driver serial **~m** para una matriz 8×8 con chip **MAX7219** (p. ej. módulo FC-16). SPI por **bit-bang** (sin librería LedControl).

## Mismo puente que llamadas y «¿Dónde?»

En producción la Mega no habla HTTP: **Snake OS Lite local** (`snake-os-lite-local.py`) en el **Mac/PC donde está el USB** hace poll de `GET /api/board/pending` contra el servidor Snake OS (p. ej. `http://127.0.0.1:8987` vía `SNAKEOS_WEB_BASE`), escribe cada línea por USB y reenvía respuestas a `POST /api/board/reply`.

| Origen | Comando | Cuándo |
|--------|---------|--------|
| Llamada (servidor + chat) | `~c1` | Llamada **activa** (`main.py` `call_answer`, `doganiero-chat.js` `dcBoardCallStart`) |
| Llamada | `~c?` | Colgar tras llamada contestada (`_emit_ended`, `dcBoardCallFinish`) |
| Llamada | `~d min sec` | Mega → servidor: duración (`board_reply` → WebSocket `call_duration`) |
| App **¿Dónde?** | `~g lat₁ lon₁ lat₂ lon₂` | Búsqueda de distancia (`/api/where/search`) — coords ×10⁶ |
| App **Matriz LED** | `~m …` | `/api/matrix/apply` y `/api/matrix/clear` (`matrix_api` → `_queue_board_line`) |
| App **Snake** (juego) | `~m f …` / `~m c` | Espejo 8×8 en cada frame (`snake-game-matrix.js` → `/api/board/say`, misma cola) |

**Firmware en el repo**

| Artefacto | ¿Entiende `~m f`? | Notas |
|-----------|-------------------|--------|
| `snake-os-lite.hex` (RTOS descargable) | **No** | Shell serial (`ayuda`, `rtos`, LED 13…); no hay cadenas `~m`/`~c1` en el binario. |
| `firmware/matrix-max7219/matrix-max7219.ino` | **Sí** | `handleMatrixLine` → `cmdFrame` parsea `~m f <16hex>`; también `~c1`, `~c?`, `~g` (misma cola web). |

**Matriz LED**, **Snake** y el espejo del juego necesitan el sketch **matrix-max7219** flasheado en la Mega. Sin `~m`, la cola web recibe líneas pero la placa las ignora.

### Flashear en el Mac de Livian (USB)

1. Instala [Arduino IDE 2](https://www.arduino.cc/en/software) o `arduino-cli`.
2. Clona/descarga el repo y abre `firmware/matrix-max7219/matrix-max7219.ino`.
3. Placa **Arduino Mega 2560**, puerto **/dev/cu.usbmodem\***, subir (115200 baud).
4. Monitor serial: escribe `~m ?` → debe responder `~m hi 1 8x8`.
5. En el Mac, con el puente: `export SNAKEOS_WEB_BASE=http://127.0.0.1:8987` y `python3 snake-os-lite-local.py`.
6. En Snake OS: app **Matriz LED** (Enviar prueba) o **Snake** (Iniciar) — la matriz debe encenderse.

**Un comando en el Mac (USB, desde Snake OS en LAN):**

```bash
mkdir -p "$HOME/snake-os-matrix" && cd "$HOME/snake-os-matrix"
curl -fL -o flash.sh "http://127.0.0.1:8987/descargas/snake-os-matrix-cargar.sh"
chmod +x flash.sh
export SNAKEOS_WEB_BASE=http://127.0.0.1:8987
./flash.sh
```

(Sustituye la URL si entras por otro host.) Requiere `brew install arduino-cli` la primera vez.

Desde el repo clonado: `cd firmware && ./flash-matrix.sh` (`PORT=/dev/cu.usbmodem…` si hace falta).

Para volver al RTOS didáctico de `snake-os-lite.hex`: `./snake-os-lite-cargar.sh` en la raíz del repo.

La app **Mapas** (`snake-maps.js`) no encola líneas a la placa; la búsqueda con efecto en matriz es la app **¿Dónde?** (`snake-where.js`).

## Cableado (Arduino Mega / Uno)

| MAX7219 | Arduino |
|---------|---------|
| VCC     | 5 V     |
| GND     | GND     |
| DIN     | **12**  |
| CS      | **11**  |
| CLK     | **10**  |

Alimenta la matriz con 5 V estable; comparte GND con la placa.

## Orientación (FC-16)

En `matrix-max7219/matrix-max7219.ino`, descomenta según montaje:

- `ROTATE_90` — rota 90° en sentido horario
- `MIRROR_X` — invierte columnas
- `MIRROR_Y` — invierte filas

Vuelve a compilar tras cambiar defines.

## Flashear

```bash
cd firmware
chmod +x flash-matrix.sh
./flash-matrix.sh          # BOARD=mega2560 por defecto
BOARD=uno ./flash-matrix.sh
PORT=/dev/ttyACM0 ./flash-matrix.sh
```

**Advertencia:** `flash-matrix.sh` **sustituye** Snake OS Lite (u otro firmware) en la EEPROM/flash. Para volver a Lite, usa `snake-os-lite-cargar.sh` en la raíz del repo.

Sin `arduino-cli`, el script imprime pasos para Arduino IDE; el `.ino` está en `matrix-max7219/`.

Monitor **115200** baud, una línea por comando (terminada en `\n`).

## Protocolo ~m (resumen)

| Comando | Respuesta |
|---------|-----------|
| `~m ?` | `~m hi 1 8x8` |
| `~m c` | Apaga, para animación y subida → `~m ok c` |
| `~m b <0-15>` | Brillo → `~m ok b` |
| `~m f <16hex>` | Un frame (8 bytes hex), para anim → `~m ok f` |
| `~m A <job> <idx0> <total> <loop 0\|1> <tok>[,…]` | Subida de animación (hasta 32 frames). Cada `tok` = 16 hex (frame) + 2 hex (duración en **ms/10**). Índices consecutivos desde 0. Al recibir `total` frames, arranca la animación → `~m ok A <job> <n>` |

Errores: `~m err len|hex|range|seq`.

Ejemplo rápido:

```
~m ?
~m f 0000000000000000
~m b 8
~m A demo 0 2 1 FF00FF00FF00FF00FF,00FF00FF00FF00FF0A,01010101010101010A
```

## Archivos

- `matrix-max7219/matrix-max7219.ino` — firmware
- `flash-matrix.sh` — compila/sube (Mega por defecto)
