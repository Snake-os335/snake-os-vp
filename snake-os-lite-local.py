#!/usr/bin/env python3
"""Snake OS Lite · helper local Ubuntu: instalador (8792) + puente USB ↔ web."""
from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
PORT = 8792
DEFAULT_WEB_BASE = ""
MARK = Path.home() / ".snake-os-lite-installed"
HERE = Path(__file__).resolve().parent
WEB_BASE_FILE = HERE / "snake-os-lite-web-base.txt"
HEX_NAMES = ("snake-os-lite-mega2560.hex", "snake-os-lite.hex")


def web_base() -> str:
    """URL del Snake OS de esta instalación. Solo sale de SNAKEOS_WEB_BASE."""
    import os

    for key in ("SNAKEOS_WEB_BASE", "SNAKEOS_LITE_WEB_BASE"):
        raw = (os.environ.get(key) or "").strip()
        if raw:
            return raw.rstrip("/")
    try:
        if WEB_BASE_FILE.is_file():
            line = WEB_BASE_FILE.read_text(encoding="utf-8", errors="ignore").splitlines()
            if line and line[0].strip():
                return line[0].strip().rstrip("/")
    except OSError:
        pass
    return DEFAULT_WEB_BASE

SH_NAME = "snake-os-lite-cargar.sh"
BAUD = 115200

_bridge_pause = threading.Event()
_bridge_lock = threading.Lock()


def _instalado() -> bool:
    try:
        return MARK.is_file() and "Snake OS Lite" in MARK.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False


def _download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "SnakeOS-Lite-Local/1.0"})
    with urllib.request.urlopen(req, timeout=60) as res, dest.open("wb") as out:
        out.write(res.read())


def _ensure_files() -> tuple[Path, Path]:
    sh = HERE / SH_NAME
    hex_path = next((HERE / name for name in HEX_NAMES if (HERE / name).is_file()), None)
    if hex_path is None:
        hex_path = HERE / HEX_NAMES[0]
        print(f"Descargando {hex_path.name}…")
        _download(f"{web_base()}/descargas/snake-os-lite.hex", hex_path)
    if not sh.is_file():
        print(f"Descargando {SH_NAME}…")
        _download(f"{web_base()}/descargas/snake-os-lite-cargar.sh", sh)
    sh.chmod(sh.stat().st_mode | 0o111)
    return sh, hex_path


def _puerto_serie() -> str:
    for name in ("ttyACM", "ttyUSB", "cu.usbmodem"):
        found = sorted(Path("/dev").glob(f"{name}*"))
        if found:
            return str(found[0])
    return ""


def _http_json(method: str, path: str, payload: dict | None = None) -> dict:
    data = None
    headers = {"User-Agent": "SnakeOS-Lite-Local/1.0", "Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(web_base() + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=20) as res:
        body = res.read().decode("utf-8", errors="replace")
        return json.loads(body) if body else {}


def _instalar() -> dict:
    if _instalado():
        return {
            "ok": True,
            "instalado": True,
            "mensaje": "Esta Mega 2560 ya tiene Snake OS Lite. Abre Snake OS Lite en el escritorio y escribe ayuda o rtos.",
        }
    puerto = _puerto_serie()
    if not puerto:
        return {
            "ok": False,
            "instalado": False,
            "mensaje": "No veo la Mega. En Ubuntu debe aparecer como /dev/ttyACM0. Comprueba el USB y que tu usuario esté en el grupo dialout.",
        }
    try:
        sh, _hex = _ensure_files()
    except Exception as exc:
        return {"ok": False, "instalado": False, "mensaje": f"No pude preparar el instalador: {exc}"}

    _bridge_pause.set()
    time.sleep(0.4)
    try:
        proc = subprocess.run(
            ["bash", str(sh)],
            cwd=str(HERE),
            capture_output=True,
            text=True,
            timeout=180,
        )
    except FileNotFoundError:
        return {"ok": False, "instalado": False, "mensaje": "Falta bash."}
    except subprocess.TimeoutExpired:
        return {"ok": False, "instalado": False, "mensaje": "La instalación tardó demasiado."}
    finally:
        _bridge_pause.clear()

    out = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()
    last = out.splitlines()[-1] if out else "No se pudo instalar."
    if _instalado() or "ya esta en la placa" in out.lower() or "ya tiene Snake OS Lite" in out:
        return {"ok": True, "instalado": True, "mensaje": last}
    if proc.returncode == 0:
        MARK.write_text("Snake OS Lite\n", encoding="utf-8")
        return {"ok": True, "instalado": True, "mensaje": last}
    return {"ok": False, "instalado": False, "mensaje": last}


def _abrir_serie(port: str):
    import serial

    link = serial.Serial(port, BAUD, timeout=0.2)
    time.sleep(2.2)
    try:
        link.reset_input_buffer()
    except Exception:
        pass
    return link


def _leer_lineas(link, segundos: float = 0.8) -> list[str]:
    data = b""
    fin = time.time() + segundos
    while time.time() < fin:
        try:
            chunk = link.read(link.in_waiting or 1)
        except Exception:
            break
        if chunk:
            data += chunk
            fin = time.time() + 0.35
        else:
            time.sleep(0.05)
    text = data.decode("utf-8", errors="replace").replace("\r", "\n")
    return [ln.strip() for ln in text.split("\n") if ln.strip()]


def _es_basura(text: str) -> bool:
    line = text.strip()
    if line.startswith(("GET ", "POST ", "PUT ", "HEAD ", "DELETE ", "HTTP/")):
        return True
    name = line.split(":", 1)[0].strip().lower()
    return name in {
        "host", "accept", "accept-encoding", "accept-language", "user-agent",
        "connection", "cache-control", "upgrade-insecure-requests",
    }


def _puente_loop() -> None:
    link = None
    port_actual = ""
    while True:
        if _bridge_pause.is_set():
            if link is not None:
                try:
                    link.close()
                except Exception:
                    pass
                link = None
                port_actual = ""
            time.sleep(0.3)
            continue
        puerto = _puerto_serie()
        if not puerto:
            if link is not None:
                try:
                    link.close()
                except Exception:
                    pass
                link = None
                port_actual = ""
            time.sleep(1.0)
            continue
        try:
            with _bridge_lock:
                if link is None or port_actual != puerto or not getattr(link, "is_open", False):
                    if link is not None:
                        try:
                            link.close()
                        except Exception:
                            pass
                    print(f"Puente USB: abriendo {puerto}")
                    link = _abrir_serie(puerto)
                    port_actual = puerto
                    for linea in _leer_lineas(link, 1.2):
                        if _es_basura(linea):
                            continue
                        try:
                            _http_json("POST", "/api/board/reply", {"text": linea[:4000]})
                            print(f"Mega → {linea}")
                        except Exception as exc:
                            print(f"No pude enviar arranque: {exc}")

                try:
                    pending = _http_json("GET", "/api/board/pending")
                except Exception as exc:
                    print(f"Sin contacto con la web: {exc}")
                    time.sleep(1.5)
                    continue

                for item in pending.get("lines") or []:
                    texto = str(item.get("text") or "").strip()
                    item_id = int(item.get("id") or 0)
                    if not texto or not item_id:
                        continue
                    link.write((texto + "\n").encode("utf-8", errors="replace"))
                    link.flush()
                    print(f"Tú → Mega: {texto}")
                    try:
                        _http_json("POST", "/api/board/ack", {"id": item_id})
                    except Exception:
                        pass
                    for linea in _leer_lineas(link, 1.5):
                        if _es_basura(linea):
                            continue
                        try:
                            _http_json("POST", "/api/board/reply", {"text": linea[:4000]})
                            print(f"Mega → {linea}")
                        except Exception as exc:
                            print(f"No pude enviar respuesta: {exc}")

                for linea in _leer_lineas(link, 0.2):
                    if _es_basura(linea):
                        continue
                    try:
                        _http_json("POST", "/api/board/reply", {"text": linea[:4000]})
                        print(f"Mega → {linea}")
                    except Exception:
                        pass
        except Exception as exc:
            print(f"Puente: {exc}")
            if link is not None:
                try:
                    link.close()
                except Exception:
                    pass
                link = None
                port_actual = ""
            time.sleep(1.0)
            continue
        time.sleep(0.35)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] == "/estado":
            self._json(
                200,
                {
                    "instalado": _instalado(),
                    "puerto": _puerto_serie(),
                    "puente": True,
                },
            )
            return
        self._json(404, {"ok": False, "mensaje": "Ruta desconocida."})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] == "/instalar":
            self._json(200, _instalar())
            return
        self._json(404, {"ok": False, "mensaje": "Ruta desconocida."})


def main() -> int:
    try:
        import serial  # noqa: F401
    except ImportError:
        print("Falta pyserial. En Ubuntu: sudo apt install python3-serial")
        return 1

    puerto = _puerto_serie()
    base = web_base()
    print("Snake OS Lite · helper local")
    print(f"Instalador: http://{HOST}:{PORT}")
    print(f"Puente: Mega USB ↔ {base}/api/board/*")
    print("  (cambia con SNAKEOS_WEB_BASE o snake-os-lite-web-base.txt junto al script)")
    if puerto:
        print(f"Mega detectada en {puerto}")
    else:
        print("Aún no veo /dev/ttyACM* ni /dev/ttyUSB*. Enchufa la Mega 2560.")
        print("Si hace falta: sudo usermod -aG dialout $USER  (luego cierra sesión)")
        print("Y: sudo apt install avrdude python3-serial")
    try:
        _ensure_files()
    except Exception as exc:
        print(f"Aviso: no pude descargar hex/script todavía ({exc}).")

    threading.Thread(target=_puente_loop, name="snake-lite-bridge", daemon=True).start()
    print("Deja esta ventana abierta.")
    print("En Snake OS Lite (escritorio) escribe: ayuda   o   rtos")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nCerrado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
