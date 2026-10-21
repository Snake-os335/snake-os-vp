"""Inicio de sesión compartido con las cuentas Dogaemail de Snake OS VP (oct 2026).

Para páginas web propias (la primera es /pro) que necesitan una cuenta. Usa EXACTAMENTE el mismo almacén de
cuentas (tabla users de data/snakeos.db), el mismo hash de contraseñas (auth.hash_password / verify_password,
bcrypt) y la misma tabla de sesiones. No hay otra base de usuarios: una cuenta creada aquí entra en Snake OS VP
y al revés.

Cada página tiene su propia cookie de sesión «doga_s_<sitio>» (HttpOnly, SameSite=Lax, Secure si llega por
HTTPS). Entrar o salir en una página no toca la cookie «session_id» de Snake OS ni sus sesiones.

API (sitio = [a-z0-9-]{1,24}, en la lista SITES):
  GET  /api/doga-auth/me?site=pro          → datos públicos de la cuenta (o 401)
  POST /api/doga-auth/login   {site,email,password}
  POST /api/doga-auth/signup  {site,email,name,password,avatar?}  (mismas reglas que /api/signup)
  POST /api/doga-auth/logout  {site}
Límites por IP (y por correo en el inicio de sesión), en memoria.
"""
from __future__ import annotations

import hashlib
import re
import threading
import time
from typing import Any, Callable

from fastapi import APIRouter, HTTPException, Request, Response

import db
from auth import SESSION_MAX_AGE, end_session, hash_password, start_session, user_from_session, verify_password

SITES = {"pro"}                     # añade aquí el id de cada página nueva
SITE_RE = re.compile(r"^[a-z0-9-]{1,24}$")
LOGIN_MAX, LOGIN_WIN = 10, 15 * 60  # intentos fallidos por IP y por correo
SIGNUP_MAX, SIGNUP_WIN = 5, 3600    # cuentas nuevas por IP y hora
_lock = threading.Lock()
_hits: dict[str, list[float]] = {}


def cookie_name(site: str) -> str:
    return "doga_s_" + site


def _site(v: Any) -> str:
    s = str(v or "").strip().lower()
    if not SITE_RE.match(s) or s not in SITES:
        raise HTTPException(status_code=400, detail="Página no válida")
    return s


def _limited(key: str, limit: int, window: float, count: bool) -> bool:
    now = time.time()
    with _lock:
        arr = [t for t in _hits.get(key, []) if now - t < window]
        hit = len(arr) >= limit
        if count and not hit:
            arr.append(now)
        _hits[key] = arr
        if len(_hits) > 5000:
            for k in list(_hits.keys())[:1000]:
                if not _hits[k] or now - _hits[k][-1] > 3600:
                    _hits.pop(k, None)
        return hit


def _k(prefix: str, v: str) -> str:
    return prefix + hashlib.sha256(v.encode("utf-8", "replace")).hexdigest()[:24]


def _me_view(user) -> dict[str, Any]:
    """Solo los datos de la propia cuenta con sesión en la página, con la foto o GIF de perfil y si tiene Pro."""
    out = db.user_public(user)
    out["pro"] = db.pro_flag(user["id"])
    return out


def site_user(request: Request, site: str):
    """La cuenta con sesión iniciada en esa página (o None). Para usar desde otras rutas."""
    return user_from_session(request.cookies.get(cookie_name(site)))


def build_router(visitor_ip: Callable[[Request], str], blocked_domains: set[str], on_signup: Callable[[Any], None] | None = None) -> APIRouter:
    r = APIRouter()

    def set_cookie(request: Request, response: Response, site: str, sid: str) -> None:
        secure = request.url.scheme == "https" or (request.headers.get("x-forwarded-proto") or "").lower() == "https" or bool(request.headers.get("cf-visitor"))
        response.set_cookie(key=cookie_name(site), value=sid, max_age=SESSION_MAX_AGE, httponly=True, samesite="lax", secure=secure, path="/")

    def nostore(response: Response) -> None:
        response.headers["Cache-Control"] = "no-store, max-age=0"

    @r.get("/api/doga-auth/me")
    def me(site: str, request: Request, response: Response):
        nostore(response)
        user = site_user(request, _site(site))
        if not user:
            raise HTTPException(status_code=401, detail="No has iniciado sesión")
        return _me_view(user)

    @r.post("/api/doga-auth/login")
    def login(body: dict, request: Request, response: Response):
        nostore(response)
        body = body if isinstance(body, dict) else {}
        site = _site(body.get("site"))
        email = str(body.get("email") or "").strip().lower()
        password = str(body.get("password") or "")
        ipk, ek = _k("li:", visitor_ip(request)), _k("le:", email)
        if _limited(ipk, LOGIN_MAX, LOGIN_WIN, False) or _limited(ek, LOGIN_MAX, LOGIN_WIN, False):
            raise HTTPException(status_code=429, detail="Demasiados intentos. Espera unos minutos y vuelve a probar.")
        user = db.get_user_by_email(email) if email else None
        if not user or not verify_password(password, user["password_hash"]):
            _limited(ipk, LOGIN_MAX, LOGIN_WIN, True)
            _limited(ek, LOGIN_MAX, LOGIN_WIN, True)
            raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
        end_session(request.cookies.get(cookie_name(site)))
        set_cookie(request, response, site, start_session(int(user["id"])))
        return _me_view(user)

    @r.post("/api/doga-auth/signup")
    def signup(body: dict, request: Request, response: Response):
        nostore(response)
        body = body if isinstance(body, dict) else {}
        site = _site(body.get("site"))
        if _limited(_k("su:", visitor_ip(request)), SIGNUP_MAX, SIGNUP_WIN, False):
            raise HTTPException(status_code=429, detail="Se han creado muchas cuentas desde aquí. Vuelve a intentarlo más tarde.")
        # Mismas reglas que /api/signup de Snake OS VP (main.py), en el mismo orden y con los mismos mensajes.
        email = str(body.get("email") or "").strip().lower()
        name = str(body.get("name") or "").strip()
        password = str(body.get("password") or "")
        avatar = str(body.get("avatar") or "") or "🐶"
        if not email or "@" not in email:
            raise HTTPException(status_code=400, detail="Correo no válido")
        if email.rsplit("@", 1)[1].strip().rstrip(".") in blocked_domains:
            raise HTTPException(status_code=400, detail="No se pueden crear cuentas nuevas con Gmail. Usa otro correo, por ejemplo tu correo@dogaemail.com.")
        if not name:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
        if len(password) < 4:
            raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 4 caracteres")
        db.release_tombstone_email(email)
        if db.get_user_by_email(email):
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese correo")
        _limited(_k("su:", visitor_ip(request)), SIGNUP_MAX, SIGNUP_WIN, True)
        user = db.create_user(email, name, hash_password(password), avatar)
        if on_signup:
            try:
                on_signup(user)
            except Exception:
                pass
        set_cookie(request, response, site, start_session(int(user["id"])))
        return _me_view(user)

    @r.post("/api/doga-auth/logout")
    def logout(body: dict, request: Request, response: Response):
        nostore(response)
        site = _site((body or {}).get("site") if isinstance(body, dict) else "")
        end_session(request.cookies.get(cookie_name(site)))
        response.delete_cookie(key=cookie_name(site), path="/")
        return {"ok": True}

    return r
