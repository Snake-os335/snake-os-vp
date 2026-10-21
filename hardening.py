"""Refuerzos de seguridad de Snake OS VP (oct 2026).

Todo es aditivo y conservador: un usuario normal no nota nada.

- ``install(app)`` añade un middleware ASGI (no toca WebSockets) que:
    * corta con 413 los cuerpos /api/ con Content-Length enorme (por defecto > 160 MB);
    * rechaza con 403 un POST/PUT/PATCH/DELETE /api/ que llega desde OTRA web
      (cabecera Origin de otro sitio y el navegador NO dice Sec-Fetch-Site: same-origin);
      sin Origin, con Origin "null" o desde la propia web pasa siempre;
    * limita por IP las rutas caras que llaman a servicios externos (imágenes IA,
      traducir, buscar en la web, mapas). Los límites son muy generosos.
  y un manejador para que cualquier excepción no prevista salga como JSON 500.
- ``FailThrottle`` cuenta intentos FALLIDOS (contraseñas) por clave y bloquea con 429.

Variables de entorno (opcionales):
  SNAKEOS_ORIGIN_CHECK = on | report | off   (por defecto on; report solo lo escribe en el log)
  SNAKEOS_PUBLIC_HOSTS = hosts extra permitidos, separados por comas
  SNAKEOS_MAX_BODY_BYTES = tamaño máximo del cuerpo en /api/ (por defecto 167772160)
  SNAKEOS_RATE_LIMITS = on | off            (por defecto on)
"""
from __future__ import annotations

import ipaddress
import json
import os
import threading
import time
from typing import Any, Iterable
from urllib.parse import urlsplit

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

DEFAULT_PUBLIC_HOSTS = {"snake-os-vp.softportweb.com"}
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# (prefijo de ruta, peticiones máximas por IP y minuto). Muy por encima del uso normal.
RATE_RULES: tuple[tuple[str, int], ...] = (
    ("/api/ai-image", 30),
    ("/api/translate", 300),
    ("/api/web-search", 60),
    ("/api/maps/search", 90),
    ("/api/maps/route", 90),
    ("/api/maps/bus-plan", 60),
    ("/api/maps/tile/", 1500),
    ("/api/frame-check", 240),
    ("/api/os-gate/check-email", 30),  # pública: frena que se prueben correos en masa
)
RATE_WINDOW_S = 60.0


def _env(name: str, default: str) -> str:
    return (os.environ.get(name) or default).strip().lower()


def max_body_bytes() -> int:
    try:
        return max(1024, int(os.environ.get("SNAKEOS_MAX_BODY_BYTES") or 160 * 1024 * 1024))
    except ValueError:
        return 160 * 1024 * 1024


def public_hosts() -> set[str]:
    extra = os.environ.get("SNAKEOS_PUBLIC_HOSTS") or ""
    return DEFAULT_PUBLIC_HOSTS | {h.strip().lower() for h in extra.split(",") if h.strip()}


def _valid_ip(raw: str) -> str:
    raw = (raw or "").split("%", 1)[0].strip()
    try:
        return str(ipaddress.ip_address(raw))
    except ValueError:
        return ""


def client_ip_from(headers: dict[str, str], peer: str) -> str:
    """IP del visitante para los límites. Detrás de Cloudflare usa CF-Connecting-IP,
    así no se mezclan todos los visitantes en la IP del túnel/proxy."""
    for name in ("cf-connecting-ip", "x-real-ip"):
        ip = _valid_ip(headers.get(name, "").split(",")[0])
        if ip:
            return ip
    for part in headers.get("x-forwarded-for", "").split(","):
        ip = _valid_ip(part)
        if ip:
            return ip
    return _valid_ip(peer) or "unknown"


def request_ip(request: Request) -> str:
    peer = request.client.host if request.client and request.client.host else ""
    headers = {k.lower(): v for k, v in request.headers.items()}
    return client_ip_from(headers, peer)


def _host_only(value: str) -> str:
    return (value or "").strip().lower().rstrip(".")


def origin_allowed(origin: str, host: str, forwarded_host: str, fetch_site: str) -> bool:
    """True si una petición que cambia datos puede pasar. Muy conservador."""
    origin = (origin or "").strip()
    if not origin or origin.lower() == "null":
        return True
    if (fetch_site or "").strip().lower() == "same-origin":
        return True
    try:
        parts = urlsplit(origin)
    except ValueError:
        return False
    o_netloc = _host_only(parts.netloc)
    o_host = _host_only(parts.hostname or "")
    if not o_netloc:
        return False
    allowed = public_hosts()
    for h in (host, forwarded_host.split(",")[0] if forwarded_host else ""):
        h = _host_only(h)
        if h:
            allowed.add(h)
    return o_netloc in allowed or o_host in allowed


class SlidingLimiter:
    """Ventana deslizante en memoria (un solo proceso)."""

    def __init__(self, window_s: float, max_keys: int = 20000):
        self.window_s = float(window_s)
        self.max_keys = int(max_keys)
        self._lock = threading.Lock()
        self._hits: dict[str, list[float]] = {}

    def _fresh(self, key: str, now: float) -> list[float]:
        calls = [t for t in self._hits.get(key, ()) if t > now - self.window_s]
        if calls:
            self._hits[key] = calls
        else:
            self._hits.pop(key, None)
        return calls

    def hit(self, key: str, limit: int) -> int:
        """Apunta una llamada. Devuelve 0 si pasa o los segundos de espera si no."""
        now = time.monotonic()
        with self._lock:
            if len(self._hits) > self.max_keys:
                self._hits.clear()
            calls = self._fresh(key, now)
            if len(calls) >= limit:
                return max(1, int(self.window_s - (now - calls[0])) + 1)
            calls.append(now)
            self._hits[key] = calls
            return 0

    def blocked(self, key: str, limit: int) -> int:
        now = time.monotonic()
        with self._lock:
            calls = self._fresh(key, now)
            if len(calls) >= limit:
                return max(1, int(self.window_s - (now - calls[0])) + 1)
            return 0

    def add(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            if len(self._hits) > self.max_keys:
                self._hits.clear()
            calls = self._fresh(key, now)
            calls.append(now)
            self._hits[key] = calls

    def clear(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


class FailThrottle:
    """Bloquea (429) una clave tras demasiados intentos fallidos. Los aciertos no cuentan."""

    def __init__(self, limit: int, window_s: float, message: str):
        self.limit = int(limit)
        self.message = message
        self._lim = SlidingLimiter(window_s)

    def check(self, keys: Iterable[str]) -> None:
        for key in keys:
            wait = self._lim.blocked(key, self.limit)
            if wait:
                raise HTTPException(status_code=429, detail=self.message, headers={"Retry-After": str(wait)})

    def fail(self, keys: Iterable[str]) -> None:
        for key in keys:
            self._lim.add(key)

    def clear(self, keys: Iterable[str]) -> None:
        for key in keys:
            self._lim.clear(key)

    def reset(self) -> None:
        self._lim.reset()


_MSG_LOGIN = "Demasiados intentos fallidos. Espera unos minutos y vuelve a probar."
LOGIN_IP_FAILS = FailThrottle(30, 15 * 60, _MSG_LOGIN)
LOGIN_EMAIL_FAILS = FailThrottle(10, 15 * 60, _MSG_LOGIN)
GATE_IP_FAILS = FailThrottle(15, 15 * 60, _MSG_LOGIN)
PASSWORD_USER_FAILS = FailThrottle(10, 15 * 60, _MSG_LOGIN)
SIGNUP_IP = FailThrottle(20, 3600, "Se han creado demasiadas cuentas desde esta conexión. Prueba más tarde.")
RATE = SlidingLimiter(RATE_WINDOW_S)

NAME_MAX = 80
AVATAR_TEXT_MAX = 16


def clean_name(name: str) -> str:
    """Nombre de perfil: sin espacios a los lados y con un tope de longitud."""
    name = (name or "").strip()
    if len(name) > NAME_MAX:
        raise HTTPException(status_code=400, detail=f"El nombre es demasiado largo (máx. {NAME_MAX} caracteres)")
    return name


def rate_rule_for(path: str) -> int:
    for prefix, limit in RATE_RULES:
        if path.startswith(prefix):
            return limit
    return 0


def _json_bytes(status: int, detail: str) -> bytes:
    return json.dumps({"detail": detail}, ensure_ascii=False).encode("utf-8")


class HardeningMiddleware:
    def __init__(self, app: Any):
        self.app = app

    async def _reply(self, send: Any, status: int, detail: str, extra: list[tuple[bytes, bytes]] | None = None) -> None:
        body = _json_bytes(status, detail)
        headers = [(b"content-type", b"application/json; charset=utf-8"), (b"content-length", str(len(body)).encode())]
        headers.extend(extra or [])
        await send({"type": "http.response.start", "status": status, "headers": headers})
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path") or ""
        if not path.startswith("/api/"):
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers") or []}
        method = (scope.get("method") or "GET").upper()

        # 1) Tamaño del cuerpo
        cl = headers.get("content-length", "")
        if cl:
            try:
                too_big = int(cl) > max_body_bytes()
            except ValueError:
                too_big = False
            if too_big:
                await self._reply(send, 413, "El envío es demasiado grande.")
                return

        # 2) Peticiones que cambian datos desde otra web (CSRF)
        mode = _env("SNAKEOS_ORIGIN_CHECK", "on")
        if method in UNSAFE_METHODS and mode != "off":
            ok = origin_allowed(
                headers.get("origin", ""),
                headers.get("host", ""),
                headers.get("x-forwarded-host", ""),
                headers.get("sec-fetch-site", ""),
            )
            if not ok:
                print(f"[harden] origen ajeno {method} {path} origin={headers.get('origin', '')[:80]!r}"
                      f"{' (solo aviso)' if mode == 'report' else ''}", flush=True)
                if mode != "report":
                    await self._reply(send, 403, "Petición bloqueada: viene de otra web.")
                    return

        # 3) Límites por IP en rutas caras
        if _env("SNAKEOS_RATE_LIMITS", "on") != "off":
            limit = rate_rule_for(path)
            if limit:
                client = scope.get("client") or ("", 0)
                ip = client_ip_from(headers, str(client[0] or ""))
                prefix = next(p for p, lim in RATE_RULES if path.startswith(p))
                wait = RATE.hit(prefix + "|" + ip, limit)
                if wait:
                    await self._reply(send, 429, "Demasiadas peticiones seguidas; espera un momento.",
                                      [(b"retry-after", str(wait).encode())])
                    return

        await self.app(scope, receive, send)


async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    print(f"[harden] error no controlado en {request.method} {request.url.path}: {type(exc).__name__}", flush=True)
    return JSONResponse(status_code=500, content={"detail": "Error interno del servidor. Inténtalo de nuevo."})


def install(app: Any) -> None:
    app.add_middleware(HardeningMiddleware)
    app.add_exception_handler(Exception, _unhandled)
