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
from auth import end_session, hash_password, start_session, user_from_session, verify_password

SITE_SESSION_MAX_AGE = 2 * 3600     # 2026.14: la sesión de las páginas (p. ej. /pro) dura 2 horas

SITES = {"pro", "tv"}                   # añade aquí el id de cada página nueva
SITE_RE = re.compile(r"^[a-z0-9-]{1,24}$")
LOGIN_MAX, LOGIN_WIN = 10, 15 * 60  # intentos fallidos por correo+IP
LOGIN_IP_MAX = 100                  # 2026.14b: por IP sola, alto (no bloquear a toda una red)
LOGIN_EMAIL_MAX = 50                # 2026.14: por correo desde cualquier IP (más alto: un atacante no bloquea /pro a su dueño)
SIGNUP_MAX, SIGNUP_WIN = 5, 3600    # cuentas nuevas por IP y hora
_lock = threading.Lock()
_hits: dict[str, list[float]] = {}


def cookie_name(site: str) -> str:
    return "doga_s_" + site


def _site(v: Any) -> str:
    s = str(v or "").strip().lower()
    if not SITE_RE.match(s) or s not in SITES:
        raise HTTPException(status_code=400, detail="Página no válida", headers={"X-Snk-Err": "bad_site"})
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
    """La cuenta con sesión iniciada en esa página (o None). Para usar desde otras rutas.
    2026.14: la sesión de una página caduca a las 2 horas (la de Snake OS sigue con su propia regla)."""
    sid = request.cookies.get(cookie_name(site))
    if not sid:
        return None
    row = db.get_session(sid)
    if not row:
        return None
    if time.time() - float(row["created_at"]) > SITE_SESSION_MAX_AGE:
        end_session(sid)
        return None
    return user_from_session(sid, kind="site")


def build_router(visitor_ip: Callable[[Request], str], blocked_domains: set[str], on_signup: Callable[[Any], None] | None = None) -> APIRouter:
    r = APIRouter()

    def set_cookie(request: Request, response: Response, site: str, sid: str) -> None:
        secure = request.url.scheme == "https" or (request.headers.get("x-forwarded-proto") or "").lower() == "https" or bool(request.headers.get("cf-visitor"))
        response.set_cookie(key=cookie_name(site), value=sid, max_age=SITE_SESSION_MAX_AGE, httponly=True, samesite="lax", secure=secure, path="/")

    def nostore(response: Response) -> None:
        response.headers["Cache-Control"] = "no-store, max-age=0"

    @r.get("/api/doga-auth/me")
    def me(site: str, request: Request, response: Response, soft: int = 0):
        nostore(response)
        user = site_user(request, _site(site))
        if not user:
            # soft=1 (doga-auth.js 2026.14): sin sesión responde 200 {"signed_in": false} para no llenar la consola de 401
            if soft:
                return {"signed_in": False}
            raise HTTPException(status_code=401, detail="No has iniciado sesión", headers={"X-Snk-Err": "not_signed_in"})
        return _me_view(user)

    @r.post("/api/doga-auth/login")
    def login(body: dict, request: Request, response: Response):
        nostore(response)
        body = body if isinstance(body, dict) else {}
        site = _site(body.get("site"))
        email = str(body.get("email") or "").strip().lower()
        password = str(body.get("password") or "")
        ip = visitor_ip(request)
        ipk, ek, gk = _k("li:", ip), _k("le:", email + "|" + ip), _k("lg:", email)
        if _limited(ipk, LOGIN_IP_MAX, LOGIN_WIN, False) or _limited(ek, LOGIN_MAX, LOGIN_WIN, False) or _limited(gk, LOGIN_EMAIL_MAX, LOGIN_WIN, False):
            raise HTTPException(status_code=429, detail="Demasiados intentos. Espera unos minutos y vuelve a probar.", headers={"X-Snk-Err": "too_many_tries"})
        user = db.get_user_by_email(email) if email else None
        if not user or not verify_password(password, user["password_hash"]):
            _limited(ipk, LOGIN_IP_MAX, LOGIN_WIN, True)
            _limited(ek, LOGIN_MAX, LOGIN_WIN, True)
            _limited(gk, LOGIN_EMAIL_MAX, LOGIN_WIN, True)
            raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos", headers={"X-Snk-Err": "bad_login"})
        end_session(request.cookies.get(cookie_name(site)))
        set_cookie(request, response, site, start_session(int(user["id"]), kind="site"))
        return _me_view(user)

    @r.post("/api/doga-auth/signup")
    def signup(body: dict, request: Request, response: Response):
        nostore(response)
        body = body if isinstance(body, dict) else {}
        site = _site(body.get("site"))
        if _limited(_k("su:", visitor_ip(request)), SIGNUP_MAX, SIGNUP_WIN, False):
            raise HTTPException(status_code=429, detail="Se han creado muchas cuentas desde aquí. Vuelve a intentarlo más tarde.", headers={"X-Snk-Err": "too_many_signups"})
        # Mismas reglas que /api/signup de Snake OS VP (main.py), en el mismo orden y con los mismos mensajes.
        email = str(body.get("email") or "").strip().lower()
        name = str(body.get("name") or "").strip()
        password = str(body.get("password") or "")
        avatar = db.safe_signup_avatar(body.get("avatar"))
        if not email or "@" not in email:
            raise HTTPException(status_code=400, detail="Correo no válido", headers={"X-Snk-Err": "bad_email"})
        if email.rsplit("@", 1)[1].strip().rstrip(".") in blocked_domains:
            raise HTTPException(status_code=400, detail="No se pueden crear cuentas nuevas con Gmail. Usa otro correo, por ejemplo tu correo@dogaemail.com.", headers={"X-Snk-Err": "no_gmail"})
        if not name:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacío", headers={"X-Snk-Err": "name_empty"})
        if len(name) > 60:
            raise HTTPException(status_code=400, detail="El nombre es demasiado largo (máx. 60 caracteres)", headers={"X-Snk-Err": "name_long"})
        if len(email) > 254:
            raise HTTPException(status_code=400, detail="Correo no válido", headers={"X-Snk-Err": "bad_email"})
        if len(password) > 200:
            raise HTTPException(status_code=400, detail="La contraseña es demasiado larga", headers={"X-Snk-Err": "pw_long"})
        if len(password) < 4:
            raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 4 caracteres", headers={"X-Snk-Err": "pw_short"})
        db.release_tombstone_email(email)
        if db.get_user_by_email(email):
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese correo", headers={"X-Snk-Err": "email_taken"})
        _limited(_k("su:", visitor_ip(request)), SIGNUP_MAX, SIGNUP_WIN, True)
        user = db.create_user(email, name, hash_password(password), avatar)
        if on_signup:
            try:
                on_signup(user)
            except Exception:
                pass
        set_cookie(request, response, site, start_session(int(user["id"]), kind="site"))
        return _me_view(user)

    @r.post("/api/doga-auth/logout")
    def logout(body: dict, request: Request, response: Response):
        nostore(response)
        site = _site((body or {}).get("site") if isinstance(body, dict) else "")
        end_session(request.cookies.get(cookie_name(site)))
        response.delete_cookie(key=cookie_name(site), path="/")
        return {"ok": True}

    return r
