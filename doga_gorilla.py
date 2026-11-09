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

OJO CON LA CACHÉ (arreglado): Cloudflare reescribe el `Cache-Control` de los
estáticos a «max-age=14400» (4 horas), así que un `<script src="...?v=2026.31">`
que no cambia de URL se quedaba con el motor viejo en el navegador aunque el
deploy fuese nuevo. Igual que hace main.py con index.html, la página se sirve
reescrita: cada `src="/static/..."` lleva `?v=<token real del archivo>`
(sha1 de ruta+mtime+tamaño). Si el archivo cambia, cambia la URL y el navegador
no puede reutilizar la copia vieja. La página en sí va con `no-store`.
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path as FsPath
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.responses import HTMLResponse

GAME = "doga-gorilla"
GAME_VERSION = "2026.31"
HOST = "doga-gorilla."          # doga-gorilla.softportweb.com

_APP_DIR = FsPath(__file__).resolve().parent
_PAGE = _APP_DIR / "doga-gorilla.html"
_ENGINE = ("doga-gorilla.js", "doga-gorilla-page.js")

_NO_CACHE = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    "Pragma": "no-cache",
}

# <script src="/static/x.js?v=loquesea"> → se le pone el token real del archivo
_STATIC_REF_RE = re.compile(
    r"""(\b(?:src|href)=["'])/static/([A-Za-z0-9_./-]+?\.(?:js|mjs|css|png|jpe?g|gif|webp|svg|ico|mp3|m4a|ogg|wav|mp4|webm|webmanifest))(?:\?v=[A-Za-z0-9_.-]*)?(?=["'&])"""
)

# Copia de los mundos de doga-gorilla.js (solo para el estado y la página).
WORLDS = [
    {"id": "prado", "name": "Prado de las Nubes", "tag": "\U0001F331", "radius": 26},
    {"id": "caramelo", "name": "Isla Caramelo", "tag": "\U0001F36D", "radius": 24},
    {"id": "cristal", "name": "Selva de Cristal", "tag": "\U0001F48E", "radius": 25},
]

_page_cache: dict[str, Any] = {"key": None, "body": ""}


def _asset_token(rel: str) -> str:
    """Token de caché de un estático: cambia cuando cambia el archivo."""
    try:
        st = (_APP_DIR / rel).stat()
    except OSError:
        return ""
    return hashlib.sha1(f"{rel}:{st.st_mtime_ns}:{st.st_size}".encode()).hexdigest()[:10]


def _assets_sig() -> str:
    """Firma corta del motor: lo que se ve en el «build» de la página."""
    return hashlib.sha1(":".join(_asset_token(f) for f in _ENGINE).encode()).hexdigest()[:8]


def _render_page() -> str:
    """doga-gorilla.html con ?v=<token real> en cada estático (sin caché vieja)."""
    try:
        st = _PAGE.stat()
    except OSError:
        return ""
    key = (st.st_mtime_ns, st.st_size, _assets_sig())
    if _page_cache["key"] == key:
        return _page_cache["body"]
    text = _PAGE.read_text(encoding="utf-8")

    def _sub(m: "re.Match[str]") -> str:
        tok = _asset_token(m.group(2))
        if not tok:
            return m.group(0)
        return f"{m.group(1)}/static/{m.group(2)}?v={tok}"

    body = _STATIC_REF_RE.sub(_sub, text)
    _page_cache.update(key=key, body=body)
    return body


def _page_response() -> HTMLResponse:
    return HTMLResponse(_render_page(), media_type="text/html; charset=utf-8",
                        headers=_NO_CACHE)


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
            "build": _assets_sig(),
            "host": host,
            "page": str(_PAGE.name),
            "worlds": WORLDS,
            "engine": [f"/static/{f}" for f in _ENGINE],
            "engineTokens": {f: _asset_token(f) for f in _ENGINE},
            "look": "pixel",
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
