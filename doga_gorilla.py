"""Doga Gorilla (2026.31) — juego de realidad virtual tipo «gorilla tag», sin terror.

Se abre de dos maneras:

  • https://doga-gorilla.softportweb.com/  (cuando el túnel de Cloudflare publica
    ese subdominio) → doga-gorilla.html
  • /doga-gorilla                          (mientras tanto, o en local)

El juego en sí vive en dos archivos que se sirven como estáticos normales desde
la raíz del proyecto (la lista blanca de /static los deja pasar):

  /static/doga-gorilla.js        motor: mundos, física de manos, XR, HUD
  /static/doga-gorilla-page.js   la página: botones, mundo elegido, estado

Aquí solo está la página y un /api/doga-gorilla/status para saber qué versión
está sirviendo producción sin abrir las gafas.
"""
from __future__ import annotations

from pathlib import Path as FsPath
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.responses import FileResponse

GAME = "doga-gorilla"
GAME_VERSION = "2026.31"
HOST = "doga-gorilla."          # doga-gorilla.softportweb.com

_APP_DIR = FsPath(__file__).resolve().parent
_PAGE = _APP_DIR / "doga-gorilla.html"

_NO_CACHE = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    "Pragma": "no-cache",
}

# Copia de los mundos de doga-gorilla.js (solo para el estado y la página).
WORLDS = [
    {"id": "prado", "name": "Prado de las Nubes", "tag": "\U0001F331", "radius": 26},
    {"id": "caramelo", "name": "Isla Caramelo", "tag": "\U0001F36D", "radius": 24},
    {"id": "cristal", "name": "Selva de Cristal", "tag": "\U0001F48E", "radius": 25},
]


def _page_response() -> FileResponse:
    return FileResponse(_PAGE, media_type="text/html; charset=utf-8", headers=_NO_CACHE)


def build_router() -> APIRouter:
    r = APIRouter()

    @r.get("/doga-gorilla")
    def doga_gorilla_page():
        """La página del juego (también se sirve en / del subdominio)."""
        return _page_response()

    @r.get("/api/doga-gorilla/status")
    def doga_gorilla_status(request: Request) -> dict[str, Any]:
        """Versión y mundos. Sin caché: sirve para comprobar el deploy."""
        host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
        return {
            "ok": True,
            "game": GAME,
            "version": GAME_VERSION,
            "host": host,
            "page": str(_PAGE.name),
            "worlds": WORLDS,
            "engine": ["/static/doga-gorilla.js", "/static/doga-gorilla-page.js"],
        }

    return r


def install_hosts(app) -> None:
    """Sirve el juego en «/» cuando el túnel publique doga-gorilla.softportweb.com."""

    @app.middleware("http")
    async def doga_gorilla_hosts(request: Request, call_next):
        if request.method in ("GET", "HEAD"):
            host = (request.headers.get("host") or "").split(":")[0].strip().lower()
            if host.startswith(HOST):
                path = request.url.path
                if path in ("/", "/index.html", "/doga-gorilla"):
                    return _page_response()
                if path == "/favicon.ico":
                    return Response(status_code=204)
        return await call_next(request)

    return None
