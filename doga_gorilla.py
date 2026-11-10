"""Doga Tag VR (2026.33) — pilla-pilla estilo «gorilla tag» en el bosque de Doganiero.

El juego entero vive en la carpeta doga-tag-vr/ (Three.js r160 en módulos ES, sin
compilar nada):

  doga-tag-vr/index.html            la página: importmap, HUD, tarjeta de inicio
  doga-tag-vr/game.js               el motor: bosque, Ciudad Doganiero, bots, huesos,
                                    tienda, power-ups, audio, XR y escritorio
  doga-tag-vr/lib/three.module.js   Three.js r160 (va dentro, no se pide a un CDN)
  doga-tag-vr/lib/VRButton.js       el botón de entrar en VR
  doga-tag-vr/assets/*.png          logo Doganiero, icono y favicon

Se abre de dos maneras:

  • https://doga-gorilla.softportweb.com/  (cuando el túnel de Cloudflare publica
    ese subdominio) → la página del juego
  • /doga-gorilla  (y /doga-tag-vr)        → mientras tanto, o en local

Los archivos del juego se sirven por /doga-gorilla/files/<ruta> y no por /static
porque la lista blanca de /static solo deja pasar la raíz del proyecto y assets/,
y aquí hay subcarpetas (lib/, assets/) con módulos .js y .png.

OJO CON LA CACHÉ (lo que hacía que «no llegaran» los cambios): Cloudflare reescribe
el `Cache-Control` de los estáticos a «max-age=14400» (4 horas), así que una URL
fija se queda con la copia vieja en el navegador aunque el deploy sea nuevo. Igual
que hace main.py con index.html, la página se sirve reescrita: cada `./game.js`,
`./lib/three.module.js` y `./assets/*.png` sale como
`/doga-gorilla/files/<ruta>?v=<token real del archivo>` (sha1 de ruta+mtime+tamaño).
Si el archivo cambia, cambia la URL y no hay copia vieja que valga; cuando el `?v=`
coincide con el token, la respuesta va con `immutable`. La página va con `no-store`.
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path as FsPath
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse

GAME = "doga-gorilla"
GAME_NAME = "Doga Tag VR"
GAME_VERSION = "2026.33"
HOST = "doga-gorilla."          # doga-gorilla.softportweb.com

_APP_DIR = FsPath(__file__).resolve().parent
_GAME_DIR = _APP_DIR / "doga-tag-vr"
_PAGE = _GAME_DIR / "index.html"
_FILES_URL = "/doga-gorilla/files/"

# Lo que lleva ?v=<token> y compone la firma «build» del estado.
_ENGINE = ("game.js", "lib/three.module.js", "lib/VRButton.js")
_ASSETS = ("assets/doganiero-logo.png", "assets/doganiero-icon.png", "assets/favicon-64.png")

# Lo que se puede# Lo que se puea-gorilla/files/... (nada de .py, .env ni copias)
_ALLOWED_EXT = {"js", "mjs", "css", "png", "jpg", "jpeg", "webp", "gif", "svg", "ico",
                "mp3", "ogg", "wav", "m4a", "webmanifest", "json", "glb", "gltf", "hdr"}

_MEDIA = {
    "js": "text/javascript; charset=utf-8",
    "mjs": "text/javascript; charset=utf-8",
    "css": "text/css; charset=utf-8",
    "json": "application/json",
    "webmanifest": "application/manifest+json",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
    "svg": "image/svg+xml",
    "ico": "image/x-icon",
    "mp3": "audio/mpeg",
    "m4a": "audio/mp4",
    "ogg": "audio/ogg",
    "wav": "audio/wav",
}

_NO_CACHE = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    "Pragma": "no-cache",
}

# "./game.js", "./lib/three.module.js" (también dentro del importmap) → token real
_REL_REF_RE = re.compile(
    r"""(?<=["'])\./([A-Za-z0-9_./-]+?\.(?:js|mjs|css|png|jpe?g|gif|webp|svg|ico|mp3|m4a|ogg|wav|webmanifest))(?:[?#][^"']*)?(?=["'])"""
)

_page_cache: dict[str, Any] = {"key": None, "body": ""}


def _safe_rel(rel: str) -> str:
    """Ruta relativa limpia dentro de doga-tag-vr/, o «» si no es de fiar."""
    p = (rel or "").replace("\\", "/").lstrip("/")
    parts = [x for x in p.split("/") if x]
    if not parts:
        return ""
    for part in parts:
        if part in (".", "..") or part.startswith(".") or part.startswith("_"):
            return ""
    name = parts[-1]
    if ".bak" in name or "." not in name:
        return ""
    if name.rsplit(".", 1)[1].lower() not in _ALLOWED_EXT:
        return ""
    return "/".join(parts)


def _asset_token(rel: str) -> str:
    """Token de caché de un archivo del juego: cambia cuando cambia el archivo."""
    safe = _safe_rel(rel)
    if not safe:
        return ""
    try:
        st = (_GAME_DIR / safe).stat()
    except OSError:
        return ""
    return hashlib.sha1(f"{safe}:{st.st_mtime_ns}:{st.st_size}".encode()).hexdigest()[:10]


def _assets_sig() -> str:
    """Firma corta del juego: lo que se ve en el sello «build»."""
    rels = list(_ENGINE) + list(_ASSETS)
    return hashlib.sha1(":".join(_asset_token(f) for f in rels).encode()).hexdigest()[:8]


def _files_url(rel: str) -> str:
    tok = _asset_token(rel)
    return f"{_FILES_URL}{rel}?v={tok}" if tok else f"{_FILES_URL}{rel}"


def _render_page() -> str:
    """index.html con el ?v= real de cada archivo del juego (sin caché vieja)."""
    try:
        st = _PAGE.stat()
    except OSError:
        return ""
    key = (st.st_mtime_ns, st.st_size, _assets_sig())
    if _page_cache["key"] == key:
        return _page_cache["body"]
    text = _PAGE.read_text(encoding="utf-8")

    def _sub(m: "re.Match[str]") -> str:
        tok = _asset_token(m.group(1))
        if not tok:
            return m.group(0)
        return f"{_FILES_URL}{m.group(1)}?v={tok}"

    body = _REL_REF_RE.sub(_sub, text)
    _page_cache.update(key=key, body=body)
    return body


def _page_response() -> HTMLResponse:
    return HTMLResponse(_render_page(), media_type="text/html; charset=utf-8",
                        headers=_NO_CACHE)


def _file_response(rel: str, qv: str = "") -> FileResponse:
    """Un archivo del juego, con caché larga solo si el ?v= es el token actual."""
    safe = _safe_rel(rel)
    if not safe:
        raise HTTPException(status_code=404)
    try:
        path = (_GAME_DIR / safe).resolve()
        if _GAME_DIR.resolve() not in path.parents:
            raise HTTPException(status_code=404)
    except OSError:
        raise HTTPException(status_code=404)
    if not path.is_file():
        raise HTTPException(status_code=404)
    ext = safe.rsplit(".", 1)[1].lower()
    tok = _asset_token(safe)
    cc = "public, max-age=31536000, immutable" if tok and qv == tok else "no-cache"
    return FileResponse(path, media_type=_MEDIA.get(ext, "application/octet-stream"),
                        headers={"Cache-Control": cc, "CDN-Cache-Control": cc})



def build_router() -> APIRouter:
    r = APIRouter()

    @r.get("/doga-gorilla")
    def doga_gorilla_page():
        """La página del juego (también se sirve en / del subdominio)."""
        return _page_response()

    @r.get("/doga-tag-vr")
    def doga_tag_vr_page():
        """Alias con el nombre del juego: Doga Tag VR."""
        return _page_response()

    @r.get(_FILES_URL + "{rel:path}")
    def doga_gorilla_file(rel: str, request: Request):
        """game.js, lib/three.module.js, lib/VRButton.js y los .png del juego."""
        qv = (request.query_params.get("v") or "").strip()
        return _file_response(rel, qv)

    @r.get("/api/doga-gorilla/status")
    def doga_gorilla_status(request: Request) -> dict[str, Any]:
        """Versión, archivos y caché. Sin caché: sirve para comprobar el deploy."""
        host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
        return {
            "ok": True,
            "game": GAME,
            "name": GAME_NAME,
            "version": GAME_VERSION,
            "build": _assets_sig(),
            "host": host,
            "page": str(_PAGE.name),
            "folder": _GAME_DIR.name,
            "places": ["Bosque Doganiero", "Ciudad Doganiero"],
            "engine": [f"{_FILES_URL}{f}" for f in _ENGINE],
            "assets": [f"{_FILES_URL}{f}" for f in _ASSETS],
            "engineTokens": {f: _asset_token(f) for f in _ENGINE},
            "fileTokens": {f: _asset_token(f) for f in list(_ENGINE) + list(_ASSETS)},
            "features": ["gorilla-tag", "huesos", "tienda", "power-ups", "bots", "ciudad",
                         "webxr", "escritorio", "movil"],
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
                if path in ("/", "/index.html", "/doga-gorilla", "/doga-tag-vr"):
                    return _page_response()
                if path == "/favicon.ico":
                    return _file_response("assets/favicon-64.png")
        return await call_next(request)

    return None

