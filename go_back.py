"""Go back: archivos de la nube y papelera de la cuenta Dogaemail."""
from __future__ import annotations

import hashlib
import hmac
import os
import time

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse

import db
from doga_auth import site_user

ROOT = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(ROOT, "static", "goback.html")
HOST = "go-back.softportweb.com"
COOKIE = "doga_back_from_hub"
OOPS = """<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Go back</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#10182f;color:#f4f7ff;font-family:-apple-system,sans-serif}main{max-width:440px;padding:28px;text-align:center}a{color:#9db7ff}</style></head>
<body><main><h1>Entra desde Doganiero</h1><p>Go back se abre desde el buscador de doganiero.softportweb.com.</p><p><a href="https://doganiero.softportweb.com/">Ir a Doganiero</a></p></main></body></html>"""


def _entry_secret() -> str:
    for path in (os.path.join(ROOT, "entry.env"), os.path.join(ROOT, "secrets.env")):
        if not os.path.isfile(path):
            continue
        for line in open(path):
            line = line.strip()
            if line.startswith("ENTRY_SECRET="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get("ENTRY_SECRET") or ""


def _valid(token: str, skew: int = 0) -> bool:
    secret = _entry_secret()
    if not secret or "." not in (token or ""):
        return False
    exp, digest = token.split(".", 1)
    if not exp.isdigit() or int(exp) + skew < int(time.time()):
        return False
    good = hmac.new(secret.encode(), exp.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(good, digest)


def _user(request: Request):
    user = site_user(request, "goback")
    if not user:
        raise HTTPException(status_code=401, detail="Entra con tu cuenta de Dogaemail")
    return user


def _items(uid: int, field: str) -> list:
    rows = db.list_file_meta(uid, field) or []
    out = []
    for row in rows:
        if not isinstance(row, dict) or row.get("id") is None:
            continue
        out.append({
            "id": row.get("id"),
            "name": row.get("name") or "archivo",
            "type": row.get("type") or "application/octet-stream",
            "size": row.get("size") or 0,
        })
    return out


def mount(app) -> None:
    @app.middleware("http")
    async def go_back_host(request: Request, call_next):
        host = (request.headers.get("host") or "").split(":")[0].lower()
        path = request.url.path
        if host == HOST and path not in {"/goback/enter"} and not _valid(request.cookies.get(COOKIE, "")):
            return HTMLResponse(OOPS, status_code=404, headers={"Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"})
        if host == HOST and path in {"", "/"}:
            request.scope["path"] = "/goback"
            request.scope["raw_path"] = b"/goback"
        return await call_next(request)

    @app.get("/goback/enter")
    def goback_enter(t: str = ""):
        if not _valid(t):
            return HTMLResponse(OOPS, status_code=404, headers={"Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"})
        exp = str(int(time.time()) + 12 * 3600)
        secret = _entry_secret()
        digest = hmac.new(secret.encode(), exp.encode(), hashlib.sha256).hexdigest()
        resp = RedirectResponse("/goback", status_code=302)
        resp.set_cookie(COOKIE, exp + "." + digest, max_age=12 * 3600, httponly=True, secure=True, samesite="lax", path="/")
        resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.get("/goback")
    def goback_page():
        return FileResponse(PAGE, media_type="text/html")

    @app.get("/api/goback/files")
    def goback_files(request: Request):
        user = _user(request)
        uid = int(user["id"])
        return {
            "name": user["name"],
            "email": user["email"],
            "files": _items(uid, "files"),
            "trash": _items(uid, "trash"),
        }

    @app.get("/api/goback/content/{file_id}")
    def goback_content(file_id: int, request: Request):
        user = _user(request)
        uid = int(user["id"])
        known = {int(item["id"]) for item in _items(uid, "files") + _items(uid, "trash")}
        if int(file_id) not in known:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        data_url = db.get_file_data_url(uid, int(file_id))
        if not data_url:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        return {"id": int(file_id), "dataUrl": data_url}

    @app.post("/api/goback/restore")
    async def goback_restore(request: Request):
        user = _user(request)
        uid = int(user["id"])
        body = await request.json()
        try:
            fid = int((body or {}).get("id"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Elige un archivo")
        files = db.list_file_meta(uid, "files") or []
        trash = db.list_file_meta(uid, "trash") or []
        item = next((row for row in trash if isinstance(row, dict) and int(row.get("id") or -1) == fid), None)
        if item is None:
            raise HTTPException(status_code=404, detail="Ese archivo ya no está entre los eliminados")
        if not any(isinstance(row, dict) and int(row.get("id") or -1) == fid for row in files):
            files = list(files) + [item]
        trash = [row for row in trash if not (isinstance(row, dict) and int(row.get("id") or -1) == fid)]
        from main import _tomb_files
        db.sync_file_meta_list(uid, "files", _tomb_files(uid, "files", files))
        db.sync_file_meta_list(uid, "trash", _tomb_files(uid, "trash", trash))
        return {"ok": True, "files": _items(uid, "files"), "trash": _items(uid, "trash")}
