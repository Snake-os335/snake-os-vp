"""Snake OS — FastAPI backend with server-side sessions and user data."""
from __future__ import annotations

import asyncio
import fcntl
import hashlib
import ipaddress
import hmac
import html as html_lib
import math
import os
import json
import pty
import re
import secrets
import shutil
import socket
import struct
import termios
import time
import threading
import unicodedata
from pathlib import Path as FsPath
from typing import Any
from urllib.parse import parse_qs, quote_plus, unquote, urlparse
from urllib.request import Request as UrlRequest, urlopen

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import db
import dog_phone
import added_accounts
import chat_extras
import store_extras
import calendar_extras
import bots_extras
import osx_extras
import snake_tts
import askbox_client
import matrix_api
import hardening
from askbox_client import AskboxError
from auth import (
    COOKIE_NAME,
    SESSION_MAX_AGE,
    end_session,
    hash_password,
    start_session,
    user_from_session,
    verify_password,
)

app = FastAPI(title="Snake OS")
hardening.install(app)  # límites de tamaño, CSRF por Origin, límites por IP y errores en JSON


def placa_required() -> bool:
    """false: Snake OS funciona sin la Mega. true: vuelve a exigir la placa."""
    raw = (os.environ.get("SNAKEOS_PLACA") or "false").strip().lower()
    return raw in {"1", "true", "yes", "si", "sí"}


DEMO_EMAIL = (os.environ.get("SNAKEOS_DEMO_EMAIL") or "").strip().lower()
DEMO_PASSWORD = os.environ.get("SNAKEOS_DEMO_PASSWORD") or ""
DEMO_NAME = os.environ.get("SNAKEOS_DEMO_NAME") or "Snake OS"
DEMO_AVATAR = "🐶"

ACCOUNTS_BASIC_USER = "doganiero"
ACCOUNTS_BASIC_PASSWORD = os.environ.get("SNAKEOS_ACCOUNTS_PASSWORD") or ""
accounts_basic = HTTPBasic(realm="Snake OS Accounts")


# Site-wide access gate (before account login). Override with OS_GATE_PASSWORD env.
OS_GATE_PASSWORD = os.environ.get("OS_GATE_PASSWORD") or ACCOUNTS_BASIC_PASSWORD
OS_GATE_COOKIE = "os_gate"
# Session cookie only (no max_age): used after unlock so APIs work in this
# browsing session. Index clears it on every full page load → gate always returns.


def _os_gate_token() -> str:
    secret = (OS_GATE_PASSWORD + "|snake-os-gate").encode("utf-8")
    return hmac.new(secret, b"unlocked", hashlib.sha256).hexdigest()


def is_os_gate_unlocked(request: Request) -> bool:
    raw = request.cookies.get(OS_GATE_COOKIE) or ""
    if not raw:
        return False
    try:
        return secrets.compare_digest(raw, _os_gate_token())
    except Exception:
        return False


def require_os_gate(request: Request) -> None:
    return


def clear_os_gate_cookie(response: Response) -> None:
    """Expire any prior os_gate cookie (including old 30-day ones)."""
    response.delete_cookie(key=OS_GATE_COOKIE, path="/")


def set_os_gate_cookie(response: Response) -> None:
    # No max_age → browser session cookie (not multi-day persistence).
    response.set_cookie(
        key=OS_GATE_COOKIE,
        value=_os_gate_token(),
        httponly=True,
        samesite="lax",
        path="/",
    )


class OsGateBody(BaseModel):
    password: str


@app.on_event("startup")
async def on_startup() -> None:
    db.init_db()
    try:
        db.purge_tombstone_users()
        db.purge_orphan_account_links()
    except Exception:
        pass
    try:
        _n_phone = dog_phone.init_and_assign_all()
        if _n_phone:
            print(f"[phone] números Doganiero asignados: {_n_phone}", flush=True)
    except Exception as exc:
        print(f"[phone] error asignando números: {exc!r}", flush=True)
    try:
        db.backfill_missing_desk_codes()
    except Exception:
        pass
    if DEMO_EMAIL and DEMO_PASSWORD and not db.get_user_by_email(DEMO_EMAIL):
        db.create_user(
            DEMO_EMAIL,
            DEMO_NAME,
            hash_password(DEMO_PASSWORD),
            DEMO_AVATAR,
        )
    # Migrar dataUrls embebidos en SQLite a ficheros en disco
    try:
        for u in db.list_users():
            db.list_file_meta(int(u["id"]), "files")
            db.list_file_meta(int(u["id"]), "trash")
    except Exception:
        pass
    try:
        if _metaverse_ai_bots is not None:
            _metaverse_ai_bots.schedule()
    except Exception:
        pass


def require_accounts_admin(
    credentials: HTTPBasicCredentials = Depends(accounts_basic),
) -> str:
    user_ok = secrets.compare_digest(credentials.username, ACCOUNTS_BASIC_USER)
    pass_ok = secrets.compare_digest(credentials.password, ACCOUNTS_BASIC_PASSWORD)
    if not (user_ok and pass_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autorizado",
            headers={"WWW-Authenticate": 'Basic realm="Snake OS Accounts"'},
        )
    return credentials.username


def set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=session_id,
        httponly=True,
        samesite="lax",
        max_age=SESSION_MAX_AGE,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")


def require_user(request: Request):
    user = user_from_session(request.cookies.get(COOKIE_NAME))
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    return user


class SignupBody(BaseModel):
    email: str
    name: str
    password: str
    avatar: str = "🐶"


class LoginBody(BaseModel):
    email: str
    password: str


class PatchMeBody(BaseModel):
    name: str | None = None
    avatar: str | None = None
    password: str | None = None
    cloudSub: bool | None = None

class AvatarUploadBody(BaseModel):
    dataUrl: str

class DeleteMeBody(BaseModel):
    password: str


class VerifyPasswordBody(BaseModel):
    password: str


class HighscoreBody(BaseModel):
    value: int = Field(ge=0)


class MetaverseProgressBody(BaseModel):
    world: str | None = None
    room: str | None = None
    x: float | None = None
    y: float | None = None
    ry: float | None = None
    boneScore: int | None = None
    prefs: dict[str, Any] | None = None


class MetaverseAvatarBody(BaseModel):
    skin: str | None = None
    hair: str | None = None
    shirt: str | None = None
    hat: str | None = None


class ImportBody(BaseModel):
    notes: list[Any] | None = None
    files: list[Any] | None = None
    trash: list[Any] | None = None
    iconpos: dict[str, Any] | None = None
    ai_chat: list[Any] | None = None
    highscore: int | None = None
    cloudSub: bool | None = None


class FileUploadBody(BaseModel):
    id: int | None = None
    name: str
    type: str = "application/octet-stream"
    dataUrl: str
    inTrash: bool = False


class ImpersonateBody(BaseModel):
    email: str




class CheckDogaEmailBody(BaseModel):
    email: str


def _emailjs_public_config() -> dict[str, str]:
    """EmailJS ids come from the environment or emailjs.local.json. Never from source."""
    service = (os.environ.get("EMAILJS_SERVICE_ID") or "").strip()
    template = (os.environ.get("EMAILJS_TEMPLATE_ID") or "").strip()
    public = (os.environ.get("EMAILJS_PUBLIC_KEY") or "").strip()
    local_path = FsPath(__file__).resolve().parent / "emailjs.local.json"
    if local_path.is_file():
        try:
            data = json.loads(local_path.read_text(encoding="utf-8"))
        except Exception:
            data = {}
        if isinstance(data, dict):
            service = service or str(data.get("serviceId") or data.get("EMAILJS_SERVICE_ID") or "").strip()
            template = template or str(data.get("templateId") or data.get("EMAILJS_TEMPLATE_ID") or "").strip()
            public = public or str(data.get("publicKey") or data.get("EMAILJS_PUBLIC_KEY") or "").strip()
    if not (service and template and public):
        return {"enabled": False}
    return {
        "enabled": True,
        "serviceId": service,
        "templateId": template,
        "publicKey": public,
    }


@app.get("/api/emailjs-config")
def emailjs_config():
    return _emailjs_public_config()


_UPDATING_FLAG = FsPath(os.path.dirname(os.path.abspath(__file__))) / ".updating"


@app.get("/api/status")
def os_status():
    """Público y ligero: ¿se está actualizando Snake OS? (lo activan scripts/update-start.sh y update-end.sh)."""
    return JSONResponse({"updating": _UPDATING_FLAG.exists(), "version": _os_version()}, headers={"Cache-Control": "no-store"})


def _git_version() -> str:
    """Commit de git desplegado (12 caracteres)."""
    try:
        base = FsPath(os.path.dirname(os.path.abspath(__file__)))
        g = base / ".git"
        if g.is_file():  # worktree
            g = FsPath(g.read_text().split(":", 1)[1].strip())
        head = (g / "HEAD").read_text().strip()
        if not head.startswith("ref:"):
            return head[:12]
        ref = head[4:].strip()
        roots = [g]
        common = g / "commondir"
        if common.exists():
            roots.append((g / common.read_text().strip()).resolve())
        for r in roots:
            if (r / ref).exists():
                return (r / ref).read_text().strip()[:12]
            pk = r / "packed-refs"
            if pk.exists():
                for line in pk.read_text().splitlines():
                    if line.endswith(" " + ref):
                        return line[:12]
    except Exception:
        pass
    return "dev"


_APP_DIR = FsPath(os.path.dirname(os.path.abspath(__file__)))
_SIG_EXT = (".js", ".mjs", ".css", ".html", ".webmanifest")
_sig_cache: dict[str, Any] = {"t": 0.0, "v": ""}


def _assets_sig() -> str:
    """Firma de los archivos que sirve Snake OS (mtime+tamaño de los .js/.css/.html de la raíz).
    Cambia en cuanto se publica cualquier archivo estático, aunque no haya commit ni reinicio."""
    now = time.time()
    if now - _sig_cache["t"] < 2.0 and _sig_cache["v"]:
        return _sig_cache["v"]
    h = hashlib.sha1()
    try:
        with os.scandir(_APP_DIR) as it:
            rows = []
            for e in it:
                n = e.name
                if n.startswith((".", "_")) or not n.lower().endswith(_SIG_EXT) or ".bak" in n:
                    continue
                try:
                    st = e.stat()
                except OSError:
                    continue
                rows.append(f"{n}:{st.st_mtime_ns}:{st.st_size}")
        for r in sorted(rows):
            h.update(r.encode())
    except OSError:
        pass
    v = h.hexdigest()[:8]
    _sig_cache.update(t=now, v=v)
    return v


def _os_version() -> str:
    """Versión desplegada = commit de git + firma de los archivos estáticos.
    Cambia en cada despliegue (git pull, merge o copia de archivos), sin reiniciar el contenedor."""
    return f"{_git_version()[:7]}-{_assets_sig()}"


def _asset_token(rel: str) -> str:
    """Token de caché de un archivo servido en /static (cambia cuando cambia el archivo)."""
    try:
        st = (_APP_DIR / rel).stat()
    except OSError:
        return ""
    return hashlib.sha1(f"{rel}:{st.st_mtime_ns}:{st.st_size}".encode()).hexdigest()[:10]


_STATIC_REF_RE = re.compile(
    r"""(\b(?:src|href)=["'])/static/([A-Za-z0-9_./-]+?\.(?:js|mjs|css|png|jpe?g|gif|webp|svg|ico|mp3|m4a|ogg|wav|mp4|webm|webmanifest))(?:\?v=[A-Za-z0-9_.-]*)?(?=["'&])"""
)
_index_cache: dict[str, Any] = {"key": None, "body": b""}


def _render_index() -> bytes:
    """index.html con ?v= automático en cada <script src>/<link href>/<img src> de /static:
    el ?v= es el token del archivo real, así que nadie tiene que acordarse de subirlo a mano
    y ni el navegador ni Cloudflare pueden servir una versión vieja."""
    try:
        st = (_APP_DIR / "index.html").stat()
        key = (st.st_mtime_ns, st.st_size, _assets_sig())
    except OSError:
        key = None
    if key is not None and _index_cache["key"] == key:
        return _index_cache["body"]
    text = (_APP_DIR / "index.html").read_text(encoding="utf-8")

    def _sub(m: "re.Match[str]") -> str:
        rel = m.group(2)
        tok = _asset_token(rel) if _PublicStaticFiles.is_public(rel) else ""
        if not tok:
            return m.group(0)
        return f"{m.group(1)}/static/{rel}?v={tok}"

    body = _STATIC_REF_RE.sub(_sub, text).encode("utf-8")
    _index_cache.update(key=key, body=body)
    return body


_MAINT_HTML = FsPath(os.path.dirname(os.path.abspath(__file__))) / "maintenance.html"


@app.get("/api/os-gate")
def os_gate_status(request: Request):
    return {"unlocked": is_os_gate_unlocked(request)}



@app.post("/api/os-gate/check-email")
def os_gate_check_email(body: CheckDogaEmailBody):
    """Public (no gate): used from the OS gate screen to verify a Dogaemail exists before requesting the access code."""
    email = (body.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Correo no válido")
    user = db.get_user_by_email(email)
    return {"exists": bool(user), "email": email}

@app.post("/api/os-gate")
def os_gate_unlock(body: OsGateBody, response: Response, request: Request):
    # Do not log the submitted password.
    submitted = body.password if isinstance(body.password, str) else ""
    gate_keys = ["ip:" + hardening.request_ip(request)]
    hardening.GATE_IP_FAILS.check(gate_keys)
    if not secrets.compare_digest(submitted.encode("utf-8"), OS_GATE_PASSWORD.encode("utf-8")):
        hardening.GATE_IP_FAILS.fail(gate_keys)
        raise HTTPException(status_code=403, detail="Contraseña incorrecta.")
    set_os_gate_cookie(response)
    return {"unlocked": True}

BLOCKED_SIGNUP_DOMAINS = {"gmail.com", "googlemail.com"}


@app.post("/api/signup")
def signup(body: SignupBody, response: Response, request: Request, _gate: None = Depends(require_os_gate)):
    email = body.email.strip().lower()
    name = hardening.clean_name(body.name)
    password = body.password
    avatar = db.safe_signup_avatar(body.avatar)
    if len(email) > 320:
        raise HTTPException(status_code=400, detail="Correo no válido")

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Correo no válido")
    # Solo cuentas NUEVAS: las de Gmail que ya existen siguen entrando con /api/login.
    if email.rsplit("@", 1)[1].strip().rstrip(".") in BLOCKED_SIGNUP_DOMAINS:
        raise HTTPException(status_code=400, detail="No se pueden crear cuentas nuevas con Gmail. Usa otro correo, por ejemplo tu correo@dogaemail.com.")
    if not name:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 4 caracteres")
    # A row only marked deleted must not occupy the address.
    db.release_tombstone_email(email)
    if db.get_user_by_email(email):
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese correo")

    signup_keys = ["ip:" + hardening.request_ip(request)]
    hardening.SIGNUP_IP.check(signup_keys)
    hardening.SIGNUP_IP.fail(signup_keys)  # cuenta cada cuenta creada
    user = db.create_user(email, name, hash_password(password), avatar)
    try:
        dog_phone.ensure_number(int(user["id"]))
    except Exception:
        pass
    sid = start_session(int(user["id"]))
    set_session_cookie(response, sid)
    note_activity("cuenta", user["name"])
    return db.user_public(user)


_login_dots = 0
_login_dots_lock = threading.Lock()


def _login_matrix_dots(on: bool) -> None:
    # Tres puntos en la matriz durante un login. No guarda la contraseña.
    global _login_dots
    try:
        send = ""
        with _login_dots_lock:
            if on:
                _login_dots += 1
                if _login_dots == 1:
                    send = "~."
            else:
                if _login_dots > 0:
                    _login_dots -= 1
                if _login_dots == 0:
                    send = "~.0"
        if send:
            _queue_board_line(send)
    except Exception:
        pass


@app.post("/api/login")
def login(body: LoginBody, response: Response, request: Request, _gate: None = Depends(require_os_gate)):
    email = body.email.strip().lower()
    ip = hardening.request_ip(request)
    ip_keys = ["ip:" + ip]
    email_keys = ["em:" + email[:320]]
    email_ip_keys = ["emip:" + email[:320] + "|" + ip]
    hardening.LOGIN_IP_FAILS.check(ip_keys)
    hardening.LOGIN_EMAIL_IP_FAILS.check(email_ip_keys)
    hardening.LOGIN_EMAIL_FAILS.check(email_keys)
    _login_matrix_dots(True)
    try:
        user = db.get_user_by_email(email)
        if not user or not verify_password(body.password, user["password_hash"]):
            hardening.LOGIN_IP_FAILS.fail(ip_keys)
            hardening.LOGIN_EMAIL_IP_FAILS.fail(email_ip_keys)
            hardening.LOGIN_EMAIL_FAILS.fail(email_keys)
            raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
        hardening.LOGIN_EMAIL_FAILS.clear(email_keys)
        hardening.LOGIN_EMAIL_IP_FAILS.clear(email_ip_keys)
        unlocked = db.set_account_locked(int(user["id"]), False)
        if unlocked:
            user = unlocked
        sid = start_session(int(user["id"]))
        set_session_cookie(response, sid)
        note_activity("inicio", user["name"])
        return db.user_public(user)
    finally:
        _login_matrix_dots(False)


@app.post("/api/logout")
def logout(request: Request, response: Response):
    end_session(request.cookies.get(COOKIE_NAME))
    clear_session_cookie(response)
    return {"ok": True}


@app.get("/api/me")
def me(user=Depends(require_user)):
    return db.user_public(user)


@app.post("/api/me/lock")
def lock_me_account(user=Depends(require_user), _gate: None = Depends(require_os_gate)):
    """Bloquea la cuenta en el servidor (visible en todos los dispositivos)."""
    updated = db.set_account_locked(int(user["id"]), True)
    if not updated:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return db.user_public(updated)


@app.post("/api/me/verify-password")
def verify_me_password(body: VerifyPasswordBody, user=Depends(require_user), _gate: None = Depends(require_os_gate)):
    """Comprueba la contraseña y desbloquea la cuenta en el servidor."""
    pwd = body.password if isinstance(body.password, str) else ""
    if not pwd:
        raise HTTPException(status_code=400, detail="Indica tu contraseña")
    pw_keys = ["uid:" + str(int(user["id"]))]
    hardening.PASSWORD_USER_FAILS.check(pw_keys)
    if not verify_password(pwd, user["password_hash"]):
        hardening.PASSWORD_USER_FAILS.fail(pw_keys)
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")
    hardening.PASSWORD_USER_FAILS.clear(pw_keys)
    updated = db.set_account_locked(int(user["id"]), False)
    return {"ok": True, "user": db.user_public(updated) if updated else db.user_public(user)}


@app.patch("/api/me")
def patch_me(body: PatchMeBody, request: Request, response: Response, user=Depends(require_user)):
    if body.name is not None and not body.name.strip():
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
    if body.name is not None and body.name.strip() != str(user["name"] or "").strip():
        hardening.clean_name(body.name)  # solo al cambiar el nombre: los nombres largos de antes siguen valiendo
    if body.password is not None and len(body.password) < 4:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 4 caracteres")
    avatar = body.avatar
    if avatar is not None:
        avatar = str(avatar).strip()
        if not avatar:
            raise HTTPException(status_code=400, detail="Avatar vacío")
        # Emoji / short text avatar — drop stored photo file
        if not db.is_photo_avatar(avatar):
            if len(avatar) > 16:
                raise HTTPException(status_code=400, detail="Avatar no válido")
            db.clear_avatar_file(int(user["id"]))
        elif not avatar.startswith(f"/api/avatars/{int(user['id'])}"):
            raise HTTPException(status_code=400, detail="Foto de perfil no válida")

    updated = db.update_user(
        int(user["id"]),
        name=body.name,
        avatar=avatar,
        password_hash=hash_password(body.password) if body.password else None,
        cloud_sub=body.cloudSub,
    )
    if body.password:
        # 2026.14: al cambiar la contraseña se cierran las demás sesiones (otros dispositivos y páginas como /pro);
        # este navegador sigue dentro con una sesión nueva.
        db.delete_user_sessions(int(user["id"]))
        set_session_cookie(response, start_session(int(user["id"])))
    _mv_notify_profile(updated)
    return db.user_public(updated)


def _mv_notify_profile(row: Any) -> None:
    """Propaga en vivo la foto/emoji y el nombre de perfil al Metaverse (si la cuenta está dentro).

    Los endpoints de perfil son síncronos (threadpool de AnyIO), así que se salta al bucle
    de eventos con anyio.from_thread. Nunca hace fallar el guardado del perfil.
    """
    try:
        if not row:
            return
        pub = db.user_public(row)
        email = str(pub.get("email") or "").strip().lower()
        if not email:
            return
        import anyio.from_thread

        anyio.from_thread.run(metaverse_room.update_profile, email, pub)
    except Exception:
        pass


@app.post("/api/me/avatar")
def post_me_avatar(body: AvatarUploadBody, user=Depends(require_user)):
    raw = (body.dataUrl or "").strip()
    if not raw.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Envía una imagen (data URL)")
    try:
        header, b64 = raw.split(",", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="data URL inválida")
    if ";base64" not in header:
        raise HTTPException(status_code=400, detail="Solo se acepta base64")
    try:
        import base64
        data = base64.b64decode(b64, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="No se pudo leer la imagen")
    try:
        url = db.save_avatar_jpeg(int(user["id"]), data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    updated = db.update_user(int(user["id"]), avatar=url)
    _mv_notify_profile(updated)
    return db.user_public(updated)




@app.post("/api/me/avatar-file")
async def post_me_avatar_file(
    user=Depends(require_user),
    file: UploadFile = File(...),
    sx: float = Form(0),
    sy: float = Form(0),
    sw: float = Form(0),
    sh: float = Form(0),
):
    """Subida multipart de foto/GIF de perfil (hasta 10 MB).
    Si envías sx/sy/sw/sh, recorta el GIF frame a frame (mantiene animación + zoom)."""
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    if len(raw) > db.MAX_AVATAR_BYTES:
        raise HTTPException(status_code=400, detail="La foto es demasiado grande (máx. 10 MB)")
    head = raw[:6]
    is_gif = head.startswith(b"GIF87a") or head.startswith(b"GIF89a")
    try:
        if is_gif and float(sw) > 1 and float(sh) > 1:
            raw = db.crop_animated_gif_bytes(
                raw, float(sx), float(sy), float(sw), float(sh), out_size=256
            )
        url = db.save_avatar_jpeg(int(user["id"]), raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    updated = db.update_user(int(user["id"]), avatar=url)
    _mv_notify_profile(updated)
    return db.user_public(updated)


@app.get("/api/avatars/{user_id}")
def get_user_avatar(user_id: int):
    path = db.avatar_file_path(int(user_id))
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Sin foto")
    # Detect content type from magic (GIF included so animation works for everyone)
    head = path.read_bytes()[:12]
    media = "image/jpeg"
    if head.startswith(b"GIF87a") or head.startswith(b"GIF89a"):
        media = "image/gif"
    elif head.startswith(b"\x89PNG\r\n\x1a\n"):
        media = "image/png"
    elif len(head) >= 12 and head[0:4] == b"RIFF" and head[8:12] == b"WEBP":
        media = "image/webp"
    return FileResponse(
        path,
        media_type=media,
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ---------- Doganiero Desk ----------

class DeskLookupBody(BaseModel):
    code: str


DESK_RESUME_GRACE_S = 15.0


class DeskHub:
    """Presence + WebRTC signaling for remote desktop sessions.

    - Varias pestañas/dispositivos por cuenta: ya NO se expulsan entre sí
      (antes cada pestaña cerraba a la otra con 4000 y ambas reconectaban cada
      ~1,4 s, en bucle, cortando las sesiones activas).
    - Cada sesión queda ligada al WebSocket concreto de anfitrión e invitado.
    - Si un WebSocket cae, la sesión espera DESK_RESUME_GRACE_S para que la
      misma cuenta la reanude (type=resume) antes de cerrarla.
    """

    def __init__(self) -> None:
        self.clients: dict[str, list[dict[str, Any]]] = {}
        self.sessions: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()
        self._grace_tasks: dict[str, asyncio.Task] = {}

    @staticmethod
    def _norm(email: str) -> str:
        return str(email or "").strip().lower()

    async def connect(self, email: str, user: dict[str, Any], code: str, ws: WebSocket) -> None:
        email = self._norm(email)
        now = time.monotonic()
        async with self._lock:
            conns = self.clients.setdefault(email, [])
            conns[:] = [c for c in conns if c.get("ws") is not ws]
            conns.append(
                {
                    "ws": ws,
                    "user": user,
                    "code": db.normalize_desk_code(code),
                    "seen": now,
                    "visible": True,
                }
            )

    def touch(self, email: str, ws: WebSocket, visible: Any = None) -> None:
        for c in self.clients.get(self._norm(email)) or []:
            if c.get("ws") is ws:
                c["seen"] = time.monotonic()
                if visible is not None:
                    c["visible"] = bool(visible)

    def pick_ws(self, email: str) -> WebSocket | None:
        conns = list(self.clients.get(self._norm(email)) or [])
        if not conns:
            return None
        conns.sort(key=lambda c: (1 if c.get("visible") else 0, c.get("seen", 0.0)), reverse=True)
        return conns[0].get("ws")

    async def disconnect(self, email: str, ws: WebSocket) -> None:
        email = self._norm(email)
        affected: list[str] = []
        async with self._lock:
            conns = self.clients.get(email) or []
            conns[:] = [c for c in conns if c.get("ws") is not ws]
            if not conns:
                self.clients.pop(email, None)
            for sid, s in self.sessions.items():
                hit = False
                if s.get("host_ws") is ws:
                    s["host_ws"] = None
                    hit = True
                if s.get("guest_ws") is ws:
                    s["guest_ws"] = None
                    hit = True
                if hit:
                    affected.append(sid)
        for sid in affected:
            self._schedule_grace(sid)

    def _schedule_grace(self, sid: str) -> None:
        old = self._grace_tasks.pop(sid, None)
        if old:
            old.cancel()

        async def _wait() -> None:
            try:
                await asyncio.sleep(DESK_RESUME_GRACE_S)
            except asyncio.CancelledError:
                return
            async with self._lock:
                s = self.sessions.get(sid)
                dead = bool(s) and (s.get("host_ws") is None or s.get("guest_ws") is None)
            if self._grace_tasks.get(sid) is asyncio.current_task():
                self._grace_tasks.pop(sid, None)
            if dead:
                await self.end_session(sid, reason="peer_offline")

        try:
            self._grace_tasks[sid] = asyncio.get_running_loop().create_task(_wait())
        except RuntimeError:
            pass

    async def resume(self, sid: str, email: str, ws: WebSocket) -> str | None:
        email = self._norm(email)
        async with self._lock:
            s = self.sessions.get(sid)
            if not s:
                return None
            if s.get("host") == email:
                role = "host"
            elif s.get("guest") == email:
                role = "guest"
            else:
                return None
            s[role + "_ws"] = ws
            both = s.get("host_ws") is not None and s.get("guest_ws") is not None
        if both:
            task = self._grace_tasks.pop(sid, None)
            if task:
                task.cancel()
        return role

    def is_online(self, email: str) -> bool:
        return bool(self.clients.get(self._norm(email)))

    async def send_ws(self, ws: WebSocket | None, payload: dict[str, Any]) -> bool:
        if ws is None:
            return False
        try:
            await ws.send_text(json.dumps(payload, ensure_ascii=False))
            return True
        except Exception:
            return False

    async def send_email(self, email: str, payload: dict[str, Any]) -> bool:
        return await self.send_ws(self.pick_ws(email), payload)

    async def send_session(self, sid: str, role: str, payload: dict[str, Any]) -> bool:
        s = self.sessions.get(sid)
        if not s:
            return False
        return await self.send_ws(s.get(role + "_ws"), payload)

    async def end_session(self, sid: str, reason: str = "ended") -> None:
        async with self._lock:
            sess = self.sessions.pop(sid, None)
        task = self._grace_tasks.pop(sid, None)
        if task and task is not asyncio.current_task():
            task.cancel()
        if not sess:
            return
        msg = {"type": "session_ended", "sessionId": sid, "reason": reason}
        await self.send_ws(sess.get("host_ws"), msg)
        await self.send_ws(sess.get("guest_ws"), msg)


desk_hub = DeskHub()


@app.get("/api/desk/me")
def desk_me(user=Depends(require_user)):
    code = db.ensure_user_desk_code(int(user["id"]))
    return {
        "code": code,
        "formatted": db.format_desk_code(code),
        "name": user["name"],
        "email": user["email"],
        "avatar": user["avatar"],
        "online": desk_hub.is_online(str(user["email"])),
    }


@app.post("/api/desk/lookup")
def desk_lookup(body: DeskLookupBody, user=Depends(require_user)):
    code = db.normalize_desk_code(body.code)
    if len(code) != 9:
        raise HTTPException(status_code=400, detail="Código de escritorio inválido")
    target = db.get_user_by_desk_code(code)
    if not target:
        raise HTTPException(status_code=404, detail="Ese código de escritorio no existe")
    my_email = str(user["email"]).strip().lower()
    target_email = str(target["email"]).strip().lower()
    if target_email == my_email:
        raise HTTPException(status_code=400, detail="Ese es tu propio código de escritorio")
    return {
        "exists": True,
        "code": code,
        "formatted": db.format_desk_code(code),
        "name": target["name"],
        "avatar": target["avatar"],
        "online": desk_hub.is_online(target_email),
    }


@app.websocket("/api/desk/ws")
async def desk_ws(websocket: WebSocket):
    await websocket.accept()
    if not await _i9_ws_enter(websocket):
        return
    sid_cookie = websocket.cookies.get(COOKIE_NAME)
    user_row = user_from_session(sid_cookie)
    if not user_row:
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "detail": "Sesión no válida", "fatal": True}, ensure_ascii=False)
            )
        except Exception:
            pass
        await _ws_close_quiet(websocket, 4401)
        _i9_untrack(websocket)
        return

    email = str(user_row["email"]).strip().lower()
    code = db.ensure_user_desk_code(int(user_row["id"]))
    pub = db.user_public(user_row)
    await desk_hub.connect(email, pub, code, websocket)

    async def reply(payload: dict[str, Any]) -> None:
        await websocket.send_text(json.dumps(payload, ensure_ascii=False))

    await reply(
        {
            "type": "welcome",
            "code": code,
            "formatted": db.format_desk_code(code),
            "name": pub.get("name"),
            "avatar": pub.get("avatar"),
        }
    )

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if not isinstance(msg, dict):
                continue
            mtype = str(msg.get("type") or "")
            desk_hub.touch(email, websocket, msg.get("vis") if "vis" in msg else None)

            if mtype == "ping":
                await reply({"type": "pong", "t": msg.get("t")})
                continue

            if mtype == "resume":
                session_id = str(msg.get("sessionId") or "")
                role = await desk_hub.resume(session_id, email, websocket) if session_id else None
                if not role:
                    await reply({"type": "session_ended", "sessionId": session_id, "reason": "expired"})
                    continue
                await reply({"type": "resumed", "sessionId": session_id, "role": role})
                peer_role = "guest" if role == "host" else "host"
                await desk_hub.send_session(
                    session_id, peer_role, {"type": "peer_resumed", "sessionId": session_id}
                )
                continue

            if mtype == "connect":
                target_code = db.normalize_desk_code(msg.get("code"))
                if len(target_code) != 9:
                    await reply({"type": "error", "detail": "Código de escritorio inválido"})
                    continue
                target_row = db.get_user_by_desk_code(target_code)
                if not target_row:
                    await reply({"type": "error", "detail": "Ese código de escritorio no existe"})
                    continue
                host_email = str(target_row["email"]).strip().lower()
                if host_email == email:
                    await reply({"type": "error", "detail": "No puedes conectarte a tu propio escritorio"})
                    continue
                host_ws = desk_hub.pick_ws(host_email)
                if host_ws is None:
                    await reply({"type": "error", "detail": "Esa cuenta no está conectada a Snake OS ahora."})
                    continue
                # Limpiar sesiones viejas: las mías como invitado y las de ese anfitrión
                # que sean restos de este mismo invitado (recarga de página, etc.).
                stale: list[str] = []
                busy = False
                async with desk_hub._lock:
                    for sid0, s0 in desk_hub.sessions.items():
                        if s0.get("guest_ws") is websocket:
                            stale.append(sid0)
                        elif s0.get("host") == host_email:
                            if s0.get("guest") == email:
                                stale.append(sid0)
                            else:
                                busy = True
                for sid0 in stale:
                    await desk_hub.end_session(sid0, reason="hangup")
                if busy:
                    await reply(
                        {
                            "type": "error",
                            "detail": "Ese escritorio ya está en una sesión remota. Inténtalo en unos segundos.",
                        }
                    )
                    continue
                # Conexión directa: sin aceptar y sin abrir Doganiero Desk.
                session_id = secrets.token_urlsafe(12)
                async with desk_hub._lock:
                    desk_hub.sessions[session_id] = {
                        "host": host_email,
                        "guest": email,
                        "host_ws": host_ws,
                        "guest_ws": websocket,
                        "state": "accepted",
                        "created": time.monotonic(),
                    }
                ok = await desk_hub.send_ws(
                    host_ws,
                    {
                        "type": "host_start",
                        "sessionId": session_id,
                        "from": {
                            "name": pub.get("name"),
                            "avatar": pub.get("avatar"),
                            "email": email,
                        },
                        "code": code,
                        "formatted": db.format_desk_code(code),
                    },
                )
                if not ok:
                    async with desk_hub._lock:
                        desk_hub.sessions.pop(session_id, None)
                    await reply({"type": "error", "detail": "No se pudo avisar al otro escritorio. Inténtalo de nuevo."})
                    continue
                await reply(
                    {
                        "type": "accepted",
                        "sessionId": session_id,
                        "role": "guest",
                        "to": {
                            "name": target_row["name"],
                            "avatar": target_row["avatar"],
                            "code": target_code,
                            "formatted": db.format_desk_code(target_code),
                        },
                    }
                )
                continue

            if mtype in ("offer", "answer", "ice", "restart"):
                session_id = str(msg.get("sessionId") or "")
                async with desk_hub._lock:
                    sess = desk_hub.sessions.get(session_id)
                if not sess:
                    if mtype in ("offer", "answer", "restart"):
                        await reply({"type": "session_ended", "sessionId": session_id, "reason": "expired"})
                    continue
                if sess.get("host") == email:
                    my_role, peer_role = "host", "guest"
                elif sess.get("guest") == email:
                    my_role, peer_role = "guest", "host"
                else:
                    continue
                # Si este socket es nuevo para la sesión (reconexión), enlazarlo
                if sess.get(my_role + "_ws") is not websocket:
                    await desk_hub.resume(session_id, email, websocket)
                payload = {
                    "type": mtype,
                    "sessionId": session_id,
                    "sdp": msg.get("sdp"),
                    "candidate": msg.get("candidate"),
                }
                await desk_hub.send_session(session_id, peer_role, payload)
                continue

            if mtype == "hangup":
                session_id = str(msg.get("sessionId") or "")
                async with desk_hub._lock:
                    sess = desk_hub.sessions.get(session_id)
                if sess and (sess.get("host") == email or sess.get("guest") == email):
                    await desk_hub.end_session(session_id, reason="hangup")
                continue

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _i9_untrack(websocket)
        await desk_hub.disconnect(email, websocket)


def _term_ssh_key_path(preferred: str | None = None) -> str:
    candidates = [
        preferred or "",
        os.environ.get("SNAKEOS_UBUNTU_SSH_KEY") or "",
        "/run/secrets/ubuntu_ssh_key",
        os.environ.get("SNAKEOS_PVE_SSH_KEY") or "",
        "/run/secrets/pve_ssh_key",
    ]
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return preferred or "/run/secrets/ubuntu_ssh_key"


TERM_SSH_TARGETS: dict[str, dict[str, str]] = {
    "vm-proxmox-asrock": {
        # Ubuntu Desktop VM 100 en el Proxmox ASRock, usuario david
        "host": os.environ.get("SNAKEOS_UBUNTU_SSH_HOST") or "",
        "user": os.environ.get("SNAKEOS_UBUNTU_SSH_USER") or "",
        "label": "Ubuntu Desktop",
        "key": os.environ.get("SNAKEOS_UBUNTU_SSH_KEY") or "/run/secrets/ubuntu_ssh_key",
    },
    "proxmox": {
        "host": os.environ.get("SNAKEOS_PVE_SSH_HOST") or "",
        "user": os.environ.get("SNAKEOS_PVE_SSH_USER") or "",
        "label": "Proxmox VE host (root)",
        "key": os.environ.get("SNAKEOS_PVE_SSH_KEY") or "/run/secrets/pve_ssh_key",
    },
}


@app.get("/api/term/hosts")
def term_hosts(user=Depends(require_user), _gate: None = Depends(require_os_gate)):
    return {
        "hosts": [
            {"id": key, "label": meta.get("label") or key, "user": meta.get("user") or "root"}
            for key, meta in TERM_SSH_TARGETS.items()
        ]
    }


@app.websocket("/api/term/ssh")
async def term_ssh_ws(websocket: WebSocket):
    """Interactive SSH into allowlisted hosts (e.g. vm-proxmox-asrock)."""
    await websocket.accept()
    if not await _i9_ws_enter(websocket):
        return
    sid_cookie = websocket.cookies.get(COOKIE_NAME)
    user_row = user_from_session(sid_cookie)
    if not user_row:
        try:
            await websocket.send_text(json.dumps({"type": "error", "detail": "Sesión no válida"}))
        except Exception:
            pass
        await _ws_close_quiet(websocket, 4401)
        _i9_untrack(websocket)
        return
    master_fd: int | None = None
    pid: int | None = None
    reader_task: asyncio.Task | None = None

    async def _send(obj: dict[str, Any]) -> None:
        await websocket.send_text(json.dumps(obj, ensure_ascii=False))

    def _spawn_ssh(target_id: str, cols: int, rows: int) -> tuple[int, int]:
        meta = TERM_SSH_TARGETS.get(target_id)
        if not meta:
            raise ValueError(f"Host no permitido: {target_id}")
        key = _term_ssh_key_path(meta.get("key"))
        if not os.path.isfile(key):
            raise ValueError("Clave SSH no disponible en el servidor")
        ssh_bin = shutil.which("ssh") or "/usr/bin/ssh"
        if not os.path.isfile(ssh_bin):
            raise ValueError("Cliente SSH no instalado en el servidor")
        host = meta["host"]
        user = meta.get("user") or "root"
        env = os.environ.copy()
        env["TERM"] = "xterm-256color"
        env["LANG"] = env.get("LANG") or "C.UTF-8"
        argv = [
            ssh_bin,
            "-tt",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=10",
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-o",
            "IdentitiesOnly=yes",
            "-o",
            "ServerAliveInterval=30",
            "-o",
            "ServerAliveCountMax=3",
            "-i",
            key,
            f"{user}@{host}",
        ]
        pid_local, fd = pty.fork()
        if pid_local == 0:
            try:
                os.environ.clear()
                os.environ.update(env)
                try:
                    winsize = struct.pack("HHHH", max(1, rows), max(1, cols), 0, 0)
                    fcntl.ioctl(0, termios.TIOCSWINSZ, winsize)
                except Exception:
                    pass
                os.execvpe(ssh_bin, argv, env)
            except Exception:
                os._exit(127)
        try:
            winsize = struct.pack("HHHH", max(1, rows), max(1, cols), 0, 0)
            fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
        except Exception:
            pass
        try:
            flags = fcntl.fcntl(fd, fcntl.F_GETFL)
            fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
        except Exception:
            pass
        return pid_local, fd

    async def _read_nonblock(fd: int) -> bytes:
        loop = asyncio.get_running_loop()

        def _read() -> bytes:
            try:
                return os.read(fd, 8192)
            except BlockingIOError:
                return b""
            except OSError:
                return b""

        return await loop.run_in_executor(None, _read)

    async def _pump_stdout_nb(fd: int) -> None:
        try:
            while True:
                await asyncio.sleep(0.02)
                chunk = await _read_nonblock(fd)
                if chunk:
                    await websocket.send_text(
                        json.dumps(
                            {"type": "out", "data": chunk.decode("utf-8", errors="replace")},
                            ensure_ascii=False,
                        )
                    )
                    continue
                if pid is not None:
                    waited = os.waitpid(pid, os.WNOHANG)
                    if waited[0] != 0:
                        break
        except asyncio.CancelledError:
            raise
        except Exception:
            pass
        finally:
            try:
                await _send({"type": "exit", "detail": "Sesión SSH cerrada"})
            except Exception:
                pass

    try:
        await _send(
            {
                "type": "ready",
                "hosts": list(TERM_SSH_TARGETS.keys()),
            }
        )
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                if master_fd is not None:
                    try:
                        os.write(master_fd, raw.encode("utf-8", errors="replace"))
                    except Exception:
                        pass
                continue

            mtype = str(msg.get("type") or "")
            if mtype == "ping":
                await _send({"type": "pong", "t": msg.get("t")})
                continue

            if mtype == "connect":
                if master_fd is not None:
                    await _send({"type": "error", "detail": "Ya hay una sesión SSH activa"})
                    continue
                target = str(msg.get("target") or msg.get("host") or "").strip().lower()
                cols = int(msg.get("cols") or 100)
                rows = int(msg.get("rows") or 30)
                try:
                    pid, master_fd = await asyncio.get_running_loop().run_in_executor(
                        None, lambda: _spawn_ssh(target, cols, rows)
                    )
                except Exception as exc:
                    master_fd = None
                    pid = None
                    await _send({"type": "error", "detail": str(exc)})
                    continue
                label = TERM_SSH_TARGETS[target].get("label") or target
                await _send(
                    {
                        "type": "connected",
                        "target": target,
                        "label": label,
                        "user": TERM_SSH_TARGETS[target].get("user") or "root",
                    }
                )
                reader_task = asyncio.create_task(_pump_stdout_nb(master_fd))
                continue

            if mtype == "in" or mtype == "input":
                data = msg.get("data")
                if master_fd is not None and data is not None:
                    try:
                        os.write(master_fd, str(data).encode("utf-8", errors="replace"))
                    except Exception:
                        pass
                continue

            if mtype == "resize":
                if master_fd is not None:
                    cols = int(msg.get("cols") or 80)
                    rows = int(msg.get("rows") or 24)
                    try:
                        winsize = struct.pack("HHHH", max(1, rows), max(1, cols), 0, 0)
                        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
                    except Exception:
                        pass
                continue

            if mtype == "disconnect" or mtype == "close":
                break

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _i9_untrack(websocket)
        if reader_task is not None:
            reader_task.cancel()
            try:
                await reader_task
            except (Exception, asyncio.CancelledError):
                pass
        if master_fd is not None:
            try:
                os.close(master_fd)
            except Exception:
                pass
        if pid is not None:
            try:
                os.kill(pid, 15)
            except Exception:
                pass
            try:
                os.waitpid(pid, 0)
            except Exception:
                pass


@app.post("/api/tutorial/done")
def tutorial_done(user=Depends(require_user)):
    updated = db.set_tutorial_done(int(user["id"]))
    if not updated:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return db.user_public(updated)


@app.post("/api/setup/done")
def setup_done(user=Depends(require_user)):
    updated = db.set_setup_done(int(user["id"]))
    if not updated:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return db.user_public(updated)


def _drop_profile_memory(user_id: int, email: str) -> None:
    """Forget one deleted profile in this process. Other accounts stay."""
    em = str(email or "").strip().lower()
    try:
        if em:
            desk_hub.clients.pop(em, None)
            sessions = getattr(desk_hub, "sessions", None)
            if isinstance(sessions, dict):
                for sid, sess in list(sessions.items()):
                    if isinstance(sess, dict) and (sess.get("host") == em or sess.get("guest") == em):
                        sessions.pop(sid, None)
    except Exception:
        pass
    try:
        if em:
            metaverse_room.clients.pop(em, None)
    except Exception:
        pass
    try:
        chat_hub._clients.pop(int(user_id), None)
    except Exception:
        pass
    try:
        _askbox_calls_by_user.pop(int(user_id), None)
    except Exception:
        pass
    try:
        _matrix_calls_by_user.pop(int(user_id), None)
    except Exception:
        pass
    try:
        if int(_where_job.get("user_id") or 0) == int(user_id):
            _where_job.clear()
            _where_job.update({
                "id": 0,
                "user_id": 0,
                "meters": None,
                "status": "idle",
                "place": "",
                "lat": None,
                "lng": None,
                "from_lat": None,
                "from_lng": None,
                "at": 0.0,
            })
    except Exception:
        pass


@app.delete("/api/me")
def delete_me(body: DeleteMeBody, request: Request, response: Response, user=Depends(require_user)):
    if not body.password:
        raise HTTPException(status_code=400, detail="Indica tu contraseña para eliminar la cuenta")
    pw_keys = ["uid:" + str(int(user["id"]))]
    hardening.PASSWORD_USER_FAILS.check(pw_keys)
    if not verify_password(body.password, user["password_hash"]):
        hardening.PASSWORD_USER_FAILS.fail(pw_keys)
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")
    uid = int(user["id"])
    email = str(user["email"] or "")
    # end current session cookie first
    end_session(request.cookies.get(COOKIE_NAME))
    clear_session_cookie(response)
    db.delete_user_sessions(uid)
    if not db.delete_user(uid):
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    _drop_profile_memory(uid, email)
    return {"ok": True}



# ===== Borrados sincronizados entre dispositivos (lápidas) =====
# Si un dispositivo con datos viejos vuelve a guardar algo que ya se borró en otro,
# el servidor no lo deja volver a aparecer.
_TOMB_TTL = 60 * 60 * 24 * 60
_tomb_lock = threading.Lock()


def _tomb_path(uid: int):
    return db.user_files_dir(int(uid)) / "_deleted.json"


def _tomb_load(uid: int) -> dict:
    try:
        data = json.loads(_tomb_path(uid).read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            data = {}
    except Exception:
        data = {}
    now = time.time()
    for kind in ("notes", "files"):
        cur = data.get(kind)
        if not isinstance(cur, dict):
            cur = {}
        data[kind] = {k: v for k, v in cur.items() if isinstance(v, (int, float)) and now - v < _TOMB_TTL}
    return data


def _tomb_save(uid: int, data: dict) -> None:
    try:
        tmp = _tomb_path(uid).with_suffix(".tmp")
        tmp.write_text(json.dumps(data), encoding="utf-8")
        tmp.replace(_tomb_path(uid))
    except Exception:
        pass


def _note_key(item):
    if isinstance(item, dict) and item.get("id") not in (None, ""):
        return str(item.get("id"))
    return None


def _file_key(item):
    if isinstance(item, dict) and item.get("id") is not None:
        return "%s|%s" % (item.get("id"), item.get("name") or "")
    return None


def _tomb_notes(uid: int, payload):
    if not isinstance(payload, list):
        return payload
    with _tomb_lock:
        data = _tomb_load(uid)
        old = db.get_json_field(uid, "notes", []) or []
        old_keys = {k for k in (_note_key(n) for n in old) if k}
        new_keys = {k for k in (_note_key(n) for n in payload) if k}
        now = time.time()
        for k in old_keys - new_keys:
            data["notes"][k] = now
        out = [n for n in payload if not (_note_key(n) and _note_key(n) in data["notes"] and _note_key(n) not in old_keys)]
        _tomb_save(uid, data)
    return out


def _tomb_files(uid: int, field: str, payload):
    if not isinstance(payload, list):
        return payload
    other = "trash" if field == "files" else "files"
    with _tomb_lock:
        data = _tomb_load(uid)
        cur = db.list_file_meta(uid, field) or []
        oth = db.list_file_meta(uid, other) or []
        before = {k for k in (_file_key(x) for x in cur + oth) if k}
        # ids que el servidor ya tiene: si llega uno con un nombre «borrado» antes, es un MOVER/RENOMBRAR
        # (p. ej. volver a meter un archivo en una carpeta donde estuvo), no una resurrección: se acepta.
        live_ids = {str(x.get("id")) for x in cur + oth if isinstance(x, dict) and x.get("id") is not None}
        def _stale(x):
            k = _file_key(x)
            return bool(k and k in data["files"] and k not in before and str(x.get("id")) not in live_ids)
        payload = [x for x in payload if not _stale(x)]
        for x in payload:
            k = _file_key(x)
            if k and k in data["files"]:
                data["files"].pop(k, None)
        after = {k for k in (_file_key(x) for x in payload + oth) if k}
        now = time.time()
        for k in before - after:
            data["files"][k] = now
        _tomb_save(uid, data)
    return payload


@app.get("/api/notes")
def get_notes(user=Depends(require_user)):
    return db.get_json_field(int(user["id"]), "notes", [])


@app.put("/api/notes")
def put_notes(payload: list[Any], user=Depends(require_user)):
    payload = _tomb_notes(int(user["id"]), payload)
    db.set_json_field(int(user["id"]), "notes", payload)
    return payload


@app.get("/api/files")
def get_files(user=Depends(require_user)):
    return db.list_file_meta(int(user["id"]), "files")


@app.put("/api/files")
def put_files(payload: list[Any], user=Depends(require_user)):
    try:
        return db.sync_file_meta_list(int(user["id"]), "files", _tomb_files(int(user["id"]), "files", payload))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/api/files/upload")
def upload_file(body: FileUploadBody, user=Depends(require_user)):
    uid = int(user["id"])
    fid = int(body.id) if body.id is not None else None
    if fid is None:
        existing = db.list_file_meta(uid, "files") + db.list_file_meta(uid, "trash")
        max_id = 0
        for m in existing:
            try:
                max_id = max(max_id, int(m.get("id") or 0))
            except (TypeError, ValueError):
                pass
        fid = max_id + 1
    try:
        entry = db.save_uploaded_file(
            uid,
            file_id=fid,
            name=body.name,
            type_=body.type or "application/octet-stream",
            data_url=body.dataUrl,
            in_trash=bool(body.inTrash),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    note_activity("archivo", user["name"])
    return entry


@app.get("/api/files/{file_id}/content")
def get_file_content(file_id: int, user=Depends(require_user)):
    data_url = db.get_file_data_url(int(user["id"]), int(file_id))
    if not data_url:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return {"id": int(file_id), "dataUrl": data_url}


@app.get("/api/trash")
def get_trash(user=Depends(require_user)):
    return db.list_file_meta(int(user["id"]), "trash")


@app.put("/api/trash")
def put_trash(payload: list[Any], user=Depends(require_user)):
    try:
        return db.sync_file_meta_list(int(user["id"]), "trash", _tomb_files(int(user["id"]), "trash", payload))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e



def _mask_key(key: str) -> str:
    key = str(key or "")
    if not key:
        return ""
    if len(key) <= 10:
        return "•" * 6
    return key[:4] + "••••••" + key[-4:]


def _ai_keys_payload(keys: dict[str, str], uid: int | None = None) -> dict[str, Any]:
    """Nunca devuelve la clave completa: solo si hay una propia y una versión enmascarada."""
    askbox = keys.get("askbox") or ""
    kids_on = bool(uid and osx_extras.kids_policy(int(uid)))
    return {
        "askbox": "",
        "askboxCustom": bool(askbox),
        "askboxMasked": _mask_key(askbox),
        "systemKey": bool(ASKBOX_SYSTEM_KEY_PRESENT()),
        "kidsLocked": kids_on,
    }


def ASKBOX_SYSTEM_KEY_PRESENT() -> bool:
    try:
        return bool((askbox_client.default_key() or "").strip())
    except Exception:
        return False


@app.get("/api/ai-keys")
def get_ai_keys(user=Depends(require_user)):
    """Clave propia de Askbox (enmascarada). Vacío = clave del sistema."""
    return _ai_keys_payload(db.get_ai_keys(int(user["id"])), int(user["id"]))


@app.post("/api/ai-keys/test")
def test_ai_keys(user=Depends(require_user)):
    """Prueba la clave guardada del perfil (o la del sistema si no hay propia) sin mostrarla."""
    uid = int(user["id"])
    own = (db.get_ai_keys(uid).get("askbox") or "").strip()
    key = own or resolve_askbox_key(uid)
    if not key:
        return {"valid": False, "which": "none", "message": "No hay ninguna clave de Askbox configurada"}
    try:
        valid = bool(askbox_client.validate_key(key))
    except AskboxError as exc:
        return {"valid": False, "which": "own" if own else "system", "message": exc.message}
    return {"valid": valid, "which": "own" if own else "system"}


@app.put("/api/ai-keys")
def put_ai_keys(payload: dict[str, Any], request: Request, user=Depends(require_user)):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Datos no válidos")
    if osx_extras.kids_policy(int(user["id"])) and not osx_extras.parent_ok(int(user["id"]), request):
        raise HTTPException(status_code=403, detail="Hace falta el PIN del adulto (Snake OS Kids)")
    cur = db.get_ai_keys(int(user["id"]))
    nxt = {"askbox": cur.get("askbox") or ""}
    if "askbox" in payload:
        nxt["askbox"] = payload.get("askbox")
    try:
        saved = db.set_ai_keys(int(user["id"]), nxt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _ai_keys_payload(saved, int(user["id"]))


def resolve_askbox_key(user_id: int) -> str:
    """The user's own Askbox key if set, otherwise the shared system key.

    Reads db.get_ai_keys() first (normalize_ai_keys already supports
    "askbox"). Falls back to a raw read of the ai_keys JSON column in case
    this checkout's db.py hasn't picked up that field yet, so this still
    works regardless of merge order with the keys-storage change.
    """
    own = ""
    try:
        keys = db.get_ai_keys(int(user_id))
    except Exception:
        keys = None
    if isinstance(keys, dict):
        own = str(keys.get("askbox") or "").strip()
    if not own:
        try:
            with db.get_conn() as conn:
                row = conn.execute(
                    "SELECT ai_keys FROM users WHERE id = ?",
                    (int(user_id),),
                ).fetchone()
            if row and row["ai_keys"]:
                raw = json.loads(row["ai_keys"])
                if isinstance(raw, dict):
                    own = str(raw.get("askbox") or "").strip()
        except Exception:
            own = ""
    return own or askbox_client.default_key()


class AskboxAskBody(BaseModel):
    prompt: str
    system: str | None = None
    tier: str = "balanced"
    max_output_tokens: int | None = 2048
    json_schema: dict[str, Any] | None = None


class AskboxValidateKeyBody(BaseModel):
    askbox: str


# Per-user throttle for /api/ai/ask: in-memory sliding window, a handful of
# calls per minute so one user cannot drain the whole project's Askbox
# bucket. Not shared across processes — fine for this single-container app.
_ASKBOX_THROTTLE_MAX = 10
_ASKBOX_THROTTLE_WINDOW_SEC = 60.0
_askbox_calls_by_user: dict[int, list[float]] = {}


def _askbox_throttle_check(user_id: int) -> None:
    now = time.monotonic()
    calls = _askbox_calls_by_user.setdefault(user_id, [])
    cutoff = now - _ASKBOX_THROTTLE_WINDOW_SEC
    while calls and calls[0] < cutoff:
        calls.pop(0)
    if len(calls) >= _ASKBOX_THROTTLE_MAX:
        retry_after = max(1, int(_ASKBOX_THROTTLE_WINDOW_SEC - (now - calls[0])))
        raise HTTPException(
            status_code=429,
            detail="Demasiadas peticiones de IA; espera un poco.",
            headers={"Retry-After": str(retry_after)},
        )
    calls.append(now)


_MATRIX_THROTTLE_MAX = 2
_MATRIX_THROTTLE_WINDOW_SEC = 1.0
_matrix_calls_by_user: dict[int, list[float]] = {}


def _matrix_throttle_check(user_id: int) -> None:
    now = time.monotonic()
    calls = _matrix_calls_by_user.setdefault(user_id, [])
    cutoff = now - _MATRIX_THROTTLE_WINDOW_SEC
    while calls and calls[0] < cutoff:
        calls.pop(0)
    if len(calls) >= _MATRIX_THROTTLE_MAX:
        retry_after = max(1, int(_MATRIX_THROTTLE_WINDOW_SEC - (now - calls[0])))
        raise HTTPException(
            status_code=429,
            detail="Demasiadas peticiones a la matriz; espera un momento.",
            headers={"Retry-After": str(retry_after)},
        )
    calls.append(now)


@app.post("/api/ai/ask")
def api_ai_ask(body: AskboxAskBody, user=Depends(require_user)):
    """Server-side proxy to Askbox. The Askbox key never leaves this server."""
    prompt = (body.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="Falta prompt")

    _askbox_throttle_check(int(user["id"]))

    key = resolve_askbox_key(int(user["id"]))
    try:
        result = askbox_client.ask(
            prompt,
            system=body.system,
            tier=body.tier or "balanced",
            max_output_tokens=body.max_output_tokens,
            json_schema=body.json_schema,
            api_key=key,
        )
    except AskboxError as exc:
        # 413/422/429/401/403 are expected/user-facing; a 5xx or transport
        # failure from Askbox (e.g. an upstream Cloudflare HTML error page)
        # is turned into a 422 here too, since a raw 502 reads as "Snake OS
        # itself is broken" rather than "the AI call failed this time".
        status = exc.status if exc.status in (401, 403, 413, 422, 429) else 422
        headers = {"Retry-After": exc.retry_after} if exc.retry_after else None
        raise HTTPException(status_code=status, detail=exc.message, headers=headers) from exc

    return {
        "text": result.get("text") or "",
        "request_id": result.get("request_id"),
        "model_used": result.get("model_used"),
        "tier_used": result.get("tier_used"),
        "provider": result.get("provider"),
        "cache_hit": result.get("cache_hit"),
        "latency_ms": result.get("latency_ms"),
    }


@app.post("/api/ai/validate-key")
def api_ai_validate_key(body: AskboxValidateKeyBody, user=Depends(require_user)):
    """Validate a user-supplied Askbox key. Probes the given key, not the system one."""
    key = (body.askbox or "").strip()
    if not key:
        return {"valid": False}
    try:
        valid = askbox_client.validate_key(key)
    except AskboxError as exc:
        status = exc.status if exc.status in (401, 403, 413, 422, 429) else 422
        raise HTTPException(status_code=status, detail=exc.message) from exc
    return {"valid": valid}


@app.get("/api/desktop-prefs")
def get_desktop_prefs(user=Depends(require_user)):
    """Fondo y tema del perfil (sincronizados entre dispositivos)."""
    uid = int(user["id"])
    prefs = db.normalize_desktop_prefs(db.get_json_field(uid, "desktop_prefs", {}))
    custom_url = db.wallpaper_public_url(uid)
    if prefs["wallpaper"] == "custom" and not custom_url:
        prefs["wallpaper"] = "snake-vivid"
    return {
        "wallpaper": prefs["wallpaper"],
        "theme": prefs["theme"],
        "has_custom": bool(custom_url),
        "custom_url": custom_url,
    }


@app.put("/api/desktop-prefs")
def put_desktop_prefs(payload: dict[str, Any], user=Depends(require_user)):
    uid = int(user["id"])
    cur = db.normalize_desktop_prefs(db.get_json_field(uid, "desktop_prefs", {}))
    if isinstance(payload, dict):
        if "wallpaper" in payload:
            if payload.get("wallpaper") != cur["wallpaper"] and osx_extras.work_on(uid):
                raise HTTPException(status_code=423, detail="El fondo está bloqueado mientras el modo trabajo esté activo")
            cur["wallpaper"] = payload.get("wallpaper")
        if "theme" in payload:
            cur["theme"] = payload.get("theme")
    cur = db.normalize_desktop_prefs(cur)
    if cur["wallpaper"] == "custom" and not db.wallpaper_file_path(uid):
        raise HTTPException(status_code=400, detail="Sube primero un fondo personalizado")
    db.set_json_field(uid, "desktop_prefs", cur)
    custom_url = db.wallpaper_public_url(uid)
    return {
        "wallpaper": cur["wallpaper"],
        "theme": cur["theme"],
        "has_custom": bool(custom_url),
        "custom_url": custom_url,
    }


@app.get("/api/me/wallpaper")
def get_me_wallpaper(user=Depends(require_user)):
    path = db.wallpaper_file_path(int(user["id"]))
    if not path:
        raise HTTPException(status_code=404, detail="Sin fondo personalizado")
    from fastapi.responses import FileResponse

    media = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(
        path,
        media_type=media,
        headers={"Cache-Control": "private, max-age=60"},
    )


@app.post("/api/me/wallpaper")
async def post_me_wallpaper(
    file: UploadFile = File(...),
    user=Depends(require_user),
):
    if osx_extras.work_on(int(user["id"])):
        raise HTTPException(status_code=423, detail="El fondo está bloqueado mientras el modo trabajo esté activo")
    raw = await file.read()
    try:
        url = db.save_wallpaper_bytes(int(user["id"]), raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    prefs = db.normalize_desktop_prefs(db.get_json_field(int(user["id"]), "desktop_prefs", {}))
    prefs["wallpaper"] = "custom"
    db.set_json_field(int(user["id"]), "desktop_prefs", prefs)
    return {
        "wallpaper": "custom",
        "theme": prefs["theme"],
        "has_custom": True,
        "custom_url": url,
    }


@app.delete("/api/me/wallpaper")
def delete_me_wallpaper(user=Depends(require_user)):
    uid = int(user["id"])
    if osx_extras.work_on(uid):
        raise HTTPException(status_code=423, detail="El fondo está bloqueado mientras el modo trabajo esté activo")
    db.clear_wallpaper_file(uid)
    prefs = db.normalize_desktop_prefs(db.get_json_field(uid, "desktop_prefs", {}))
    if prefs["wallpaper"] == "custom":
        prefs["wallpaper"] = "snake-vivid"
    db.set_json_field(uid, "desktop_prefs", prefs)
    return {
        "wallpaper": prefs["wallpaper"],
        "theme": prefs["theme"],
        "has_custom": False,
        "custom_url": None,
    }


@app.get("/api/iconpos")
def get_iconpos(user=Depends(require_user)):
    return db.get_json_field(int(user["id"]), "iconpos", {})


@app.put("/api/iconpos")
def put_iconpos(payload: dict[str, Any], user=Depends(require_user)):
    db.set_json_field(int(user["id"]), "iconpos", payload)
    return payload


@app.get("/api/ai-chat")
def get_ai_chat(user=Depends(require_user)):
    return db.get_json_field(int(user["id"]), "ai_chat", [])


@app.put("/api/ai-chat")
def put_ai_chat(payload: list[Any], user=Depends(require_user)):
    db.set_json_field(int(user["id"]), "ai_chat", payload)
    return payload


@app.get("/api/store-apps")
def get_store_apps(user=Depends(require_user)):
    raw = db.get_json_field(int(user["id"]), "store_apps", [])
    return db.normalize_store_apps(raw)


@app.put("/api/store-apps")
def put_store_apps(payload: list[Any], user=Depends(require_user)):
    cleaned = db.normalize_store_apps(payload)
    _kp = osx_extras.kids_policy(int(user["id"]))
    if _kp is not None:
        before = {a.get("id") for a in db.normalize_store_apps(db.get_json_field(int(user["id"]), "store_apps", []))}
        added = [a.get("id") for a in cleaned if a.get("id") not in before]
        if added and not (_kp["store"] == "pin" and osx_extras.store_unlocked(int(user["id"]))):
            osx_extras.log_blocked(int(user["id"]), "tienda", ", ".join(str(x) for x in added)[:120])
            raise HTTPException(status_code=403, detail="Snake OS Kids: las descargas de la tienda necesitan el PIN del adulto")
    db.set_json_field(int(user["id"]), "store_apps", cleaned)
    return cleaned


@app.get("/api/highscore")
def get_highscore(user=Depends(require_user)):
    return {"value": db.get_highscore(int(user["id"]))}


@app.put("/api/highscore")
def put_highscore(body: HighscoreBody, user=Depends(require_user)):
    value = db.set_highscore(int(user["id"]), body.value)
    return {"value": value}


@app.post("/api/import-local")
def import_local(body: ImportBody, user=Depends(require_user)):
    uid = int(user["id"])
    db.import_user_data(
        uid,
        notes=_tomb_notes(uid, body.notes) if isinstance(body.notes, list) else body.notes,
        files=None,
        trash=None,
        iconpos=body.iconpos,
        ai_chat=body.ai_chat,
        highscore=body.highscore,
        cloud_sub=body.cloudSub,
    )
    try:
        if body.files is not None:
            db.sync_file_meta_list(uid, "files", _tomb_files(uid, "files", body.files))
        if body.trash is not None:
            db.sync_file_meta_list(uid, "trash", _tomb_files(uid, "trash", body.trash))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    refreshed = db.get_user_by_id(uid)
    return {
        "user": db.user_public(refreshed),
        "notes": db.get_json_field(uid, "notes", []),
        "files": db.list_file_meta(uid, "files"),
        "trash": db.list_file_meta(uid, "trash"),
        "iconpos": db.get_json_field(uid, "iconpos", {}),
        "ai_chat": db.get_json_field(uid, "ai_chat", []),
        "highscore": db.get_highscore(uid),
        "store_apps": db.normalize_store_apps(db.get_json_field(uid, "store_apps", [])),
    }



# ===== SERVER I8 (real host / runtime metrics) =====
_SERVER_I8_PREV: dict[str, Any] = {}


def _si8_proc_root() -> FsPath:
    host = FsPath("/host/proc")
    if (host / "stat").is_file() and (host / "meminfo").is_file():
        return host
    return FsPath("/proc")


def _si8_read_text(path: FsPath) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""


def _si8_cpu_times(proc: FsPath) -> tuple[float, float] | None:
    raw = _si8_read_text(proc / "stat")
    for line in raw.splitlines():
        if line.startswith("cpu "):
            parts = line.split()
            try:
                nums = [float(x) for x in parts[1:8]]
            except ValueError:
                return None
            total = sum(nums)
            idle = nums[3] + (nums[4] if len(nums) > 4 else 0.0)
            return total, idle
    return None


def _si8_meminfo(proc: FsPath) -> dict[str, int]:
    out: dict[str, int] = {}
    for line in _si8_read_text(proc / "meminfo").splitlines():
        if ":" not in line:
            continue
        key, rest = line.split(":", 1)
        bits = rest.strip().split()
        if not bits:
            continue
        try:
            out[key] = int(bits[0]) * 1024  # kB → bytes
        except ValueError:
            continue
    return out


def _si8_loadavg(proc: FsPath) -> list[float]:
    parts = _si8_read_text(proc / "loadavg").split()
    try:
        return [float(parts[0]), float(parts[1]), float(parts[2])]
    except (IndexError, ValueError):
        return [0.0, 0.0, 0.0]


def _si8_uptime_sec(proc: FsPath) -> float:
    parts = _si8_read_text(proc / "uptime").split()
    try:
        return float(parts[0])
    except (IndexError, ValueError):
        return 0.0


def _si8_net_totals(proc: FsPath) -> tuple[int, int]:
    rx = tx = 0
    for line in _si8_read_text(proc / "net" / "dev").splitlines()[2:]:
        if ":" not in line:
            continue
        name, rest = line.split(":", 1)
        iface = name.strip()
        if iface == "lo":
            continue
        cols = rest.split()
        if len(cols) < 9:
            continue
        try:
            rx += int(cols[0])
            tx += int(cols[8])
        except ValueError:
            continue
    return rx, tx


def _si8_process_count(proc: FsPath) -> int:
    n = 0
    try:
        for p in proc.iterdir():
            if p.name.isdigit():
                n += 1
    except Exception:
        pass
    return n


def _si8_collect() -> dict[str, Any]:
    proc = _si8_proc_root()
    using_host = str(proc).startswith("/host/")
    now = time.time()

    mem = _si8_meminfo(proc)
    mem_total = int(mem.get("MemTotal") or 0)
    mem_avail = int(mem.get("MemAvailable") or mem.get("MemFree") or 0)
    mem_used = max(0, mem_total - mem_avail)

    # Disk: prefer host rootfs mount, else container root
    disk_path = "/host/rootfs" if FsPath("/host/rootfs").is_dir() else "/"
    try:
        du = shutil.disk_usage(disk_path)
        disk = {
            "path": disk_path,
            "total": int(du.total),
            "used": int(du.used),
            "free": int(du.free),
            "percent": round((du.used / du.total) * 100.0, 1) if du.total else 0.0,
        }
    except Exception as exc:
        disk = {"path": disk_path, "error": str(exc)}

    # CPU % from delta of /proc/stat
    times = _si8_cpu_times(proc)
    cpu_percent = None
    prev = _SERVER_I8_PREV
    if times:
        total, idle = times
        pt, pi, pts = prev.get("cpu_total"), prev.get("cpu_idle"), prev.get("cpu_ts")
        if pt is not None and pi is not None and pts is not None:
            dt = total - float(pt)
            di = idle - float(pi)
            if dt > 0:
                cpu_percent = round(max(0.0, min(100.0, (1.0 - di / dt) * 100.0)), 1)
        prev["cpu_total"] = total
        prev["cpu_idle"] = idle
        prev["cpu_ts"] = now
        # If first sample, take a short second reading for a real value
        if cpu_percent is None:
            time.sleep(0.12)
            times2 = _si8_cpu_times(proc)
            if times2:
                t2, i2 = times2
                dt = t2 - total
                di = i2 - idle
                if dt > 0:
                    cpu_percent = round(max(0.0, min(100.0, (1.0 - di / dt) * 100.0)), 1)
                prev["cpu_total"] = t2
                prev["cpu_idle"] = i2
                prev["cpu_ts"] = time.time()

    rx, tx = _si8_net_totals(proc)
    net_rx_bps = net_tx_bps = 0.0
    if prev.get("net_ts") and prev.get("net_rx") is not None:
        dt = max(0.001, now - float(prev["net_ts"]))
        net_rx_bps = max(0.0, (rx - int(prev["net_rx"])) / dt)
        net_tx_bps = max(0.0, (tx - int(prev["net_tx"])) / dt)
    prev["net_rx"] = rx
    prev["net_tx"] = tx
    prev["net_ts"] = now

    hostname = _si8_read_text(FsPath("/host/hostname")).strip() if FsPath("/host/hostname").is_file() else ""
    if not hostname:
        try:
            hostname = socket.gethostname()
        except Exception:
            hostname = "unknown"

    kernel = _si8_read_text(proc / "version").split("\n")[0].strip()
    os_release = {}
    for candidate in (FsPath("/host/os-release"), FsPath("/etc/os-release")):
        if candidate.is_file():
            for line in _si8_read_text(candidate).splitlines():
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    os_release[k] = v.strip().strip('"')
            break

    load = _si8_loadavg(proc)
    uptime = _si8_uptime_sec(proc)
    nproc_online = 0
    try:
        nproc_online = sum(1 for line in _si8_read_text(proc / "stat").splitlines() if line.startswith("cpu") and line[3:4].isdigit())
    except Exception:
        pass

    return {
        "ok": True,
        "live": True,
        "simulated": False,
        "source": "host" if using_host else "container",
        "hostname": hostname,
        "ts": now,
        "uptime_sec": uptime,
        "loadavg": load,
        "cpu": {
            "percent": cpu_percent,
            "cores_online": nproc_online,
        },
        "memory": {
            "total": mem_total,
            "used": mem_used,
            "available": mem_avail,
            "percent": round((mem_used / mem_total) * 100.0, 1) if mem_total else 0.0,
        },
        "disk": disk,
        "network": {
            "rx_bytes": rx,
            "tx_bytes": tx,
            "rx_bps": round(net_rx_bps, 1),
            "tx_bps": round(net_tx_bps, 1),
        },
        "processes": _si8_process_count(proc),
        "kernel": kernel[:180],
        "os": {
            "name": os_release.get("PRETTY_NAME") or os_release.get("NAME") or "",
            "id": os_release.get("ID") or "",
        },
        "snake_os": {
            "service": "snake-os",
            "port_in_container": 8000,
        },
    }


@app.get("/api/server-i8")
def server_i8_status(user=Depends(require_user), _gate: None = Depends(require_os_gate)):
    """Live metrics from the machine hosting Snake OS (not simulated)."""
    try:
        return _si8_collect()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudieron leer métricas: {exc}") from exc


@app.get("/api/bootstrap")
def bootstrap(user=Depends(require_user), _gate: None = Depends(require_os_gate)):
    uid = int(user["id"])
    return {
        "user": db.user_public(user),
        "notes": db.get_json_field(uid, "notes", []),
        "files": db.get_json_field(uid, "files", []),
        "trash": db.get_json_field(uid, "trash", []),
        "iconpos": db.get_json_field(uid, "iconpos", {}),
        "ai_chat": db.get_json_field(uid, "ai_chat", []),
        "highscore": db.get_highscore(uid),
        "store_apps": db.normalize_store_apps(db.get_json_field(uid, "store_apps", [])),
    }


@app.get("/api/accounts")
def api_accounts(_admin: str = Depends(require_accounts_admin)):
    return db.list_users()


@app.post("/api/accounts/impersonate")
def api_accounts_impersonate(
    body: ImpersonateBody,
    response: Response,
    _admin: str = Depends(require_accounts_admin),
):
    email = body.email.strip().lower()
    user = db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    sid = start_session(int(user["id"]))
    set_session_cookie(response, sid)
    return db.user_public(user)




def _strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _resolve_ddg_url(href: str) -> str:
    href = html_lib.unescape(href or "").strip()
    if href.startswith("//"):
        href = "https:" + href
    try:
        parsed = urlparse(href)
        qs = parse_qs(parsed.query)
        if "uddg" in qs and qs["uddg"]:
            return unquote(qs["uddg"][0])
    except Exception:
        pass
    return href


def _duckduckgo_instant(query: str) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    try:
        url = (
            "https://api.duckduckgo.com/?q="
            + quote_plus(query)
            + "&format=json&no_html=1&skip_disambig=1"
        )
        req = UrlRequest(url, headers={"User-Agent": "SnakeOS/1.0"})
        with urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
        abstract = (data.get("AbstractText") or "").strip()
        if abstract:
            results.append(
                {
                    "title": (data.get("Heading") or query)[:160],
                    "snippet": abstract[:500],
                    "url": (data.get("AbstractURL") or "")[:500],
                }
            )
        for topic in data.get("RelatedTopics") or []:
            items = []
            if isinstance(topic, dict) and topic.get("Text"):
                items = [topic]
            elif isinstance(topic, dict) and isinstance(topic.get("Topics"), list):
                items = [t for t in topic["Topics"] if isinstance(t, dict)]
            for item in items:
                text = (item.get("Text") or "").strip()
                if not text:
                    continue
                results.append(
                    {
                        "title": text[:100],
                        "snippet": text[:500],
                        "url": (item.get("FirstURL") or "")[:500],
                    }
                )
                if len(results) >= 5:
                    break
            if len(results) >= 5:
                break
    except Exception:
        pass
    return results


def _duckduckgo_html(query: str, max_results: int = 5) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    try:
        url = "https://html.duckduckgo.com/html/?q=" + quote_plus(query)
        req = UrlRequest(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                )
            },
        )
        with urlopen(req, timeout=12) as resp:
            page = resp.read().decode("utf-8", errors="replace")
        titles = re.findall(
            r'class="result__a"[^>]*>(.*?)</a>', page, flags=re.I | re.S
        )
        hrefs = re.findall(
            r'class="result__a"[^>]*href="([^"]+)"', page, flags=re.I
        )
        snippets = re.findall(
            r'class="result__snippet"[^>]*>(.*?)</', page, flags=re.I | re.S
        )
        for i, title_raw in enumerate(titles[:max_results]):
            title = _strip_html(title_raw)[:160]
            href = _resolve_ddg_url(hrefs[i] if i < len(hrefs) else "")[:500]
            snip = _strip_html(snippets[i] if i < len(snippets) else "")[:400]
            if not title:
                continue
            low_url = href.lower()
            if "duckduckgo.com/y.js" in low_url or "ad_domain=" in low_url or "/aclick?" in low_url:
                continue
            results.append({"title": title, "snippet": snip, "url": href})
    except Exception:
        pass
    return results


def _wikipedia_search(query: str, max_results: int = 3) -> list[dict[str, str]]:
    """OpenSearch + REST summary on es/en Wikipedia (reliable, no key)."""
    results: list[dict[str, str]] = []
    seen: set[str] = set()
    for lang in ("es", "en"):
        try:
            api = (
                f"https://{lang}.wikipedia.org/w/api.php?action=query&list=search"
                f"&srsearch={quote_plus(query)}&srlimit=3&format=json"
            )
            req = UrlRequest(api, headers={"User-Agent": "SnakeOS/1.0 (web-search)"})
            with urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="replace"))
            hits = ((data.get("query") or {}).get("search") or [])
            for hit in hits:
                title = (hit.get("title") or "").strip()
                if not title or title in seen:
                    continue
                seen.add(title)
                extract = _strip_html(hit.get("snippet") or "")
                page_url = f"https://{lang}.wikipedia.org/wiki/{quote_plus(title.replace(' ', '_'))}"
                try:
                    sum_url = (
                        f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/"
                        + quote_plus(title.replace(" ", "_"))
                    )
                    req2 = UrlRequest(
                        sum_url, headers={"User-Agent": "SnakeOS/1.0 (web-search)"}
                    )
                    with urlopen(req2, timeout=8) as resp2:
                        summary = json.loads(
                            resp2.read().decode("utf-8", errors="replace")
                        )
                    if summary.get("extract"):
                        extract = str(summary["extract"])[:500]
                    if summary.get("content_urls", {}).get("desktop", {}).get("page"):
                        page_url = summary["content_urls"]["desktop"]["page"]
                except Exception:
                    pass
                if extract:
                    results.append(
                        {
                            "title": f"{title} (Wikipedia)",
                            "snippet": extract,
                            "url": page_url[:500],
                        }
                    )
                if len(results) >= max_results:
                    return results
        except Exception:
            continue
    return results


def _bing_html(query: str, max_results: int = 5) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    try:
        url = (
            "https://www.bing.com/search?q="
            + quote_plus(query)
            + "&mkt=es-ES&setlang=es&cc=ES"
        )
        req = UrlRequest(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                ),
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
                "Accept": "text/html",
            },
        )
        with urlopen(req, timeout=12) as resp:
            page = resp.read().decode("utf-8", errors="replace")
        blocks = re.findall(r'<li class="b_algo"[\s\S]*?</li>', page)
        for block in blocks:
            m = re.search(
                r'<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a>',
                block,
                flags=re.I,
            )
            if not m:
                continue
            title = _strip_html(m.group(2))[:160]
            cite = re.search(r"<cite[^>]*>([\s\S]*?)</cite>", block, flags=re.I)
            snip_m = re.search(r"<p[^>]*>([\s\S]*?)</p>", block, flags=re.I)
            cite_t = _strip_html(cite.group(1) if cite else "")
            # cite often: "https://example.com › path" or "example.com › path"
            url_guess = ""
            if cite_t:
                token = cite_t.split()[0].strip()
                if token.startswith("http"):
                    url_guess = token
                elif "." in token:
                    url_guess = "https://" + token
            snip = _strip_html(snip_m.group(1) if snip_m else "")[:400]
            if not title:
                continue
            results.append(
                {"title": title, "snippet": snip, "url": url_guess[:500]}
            )
            if len(results) >= max_results:
                break
    except Exception:
        pass
    return results


def _coingecko_price(query: str) -> list[dict[str, str]]:
    qlow = query.lower()
    coins = {
        "bitcoin": "bitcoin",
        "btc": "bitcoin",
        "ethereum": "ethereum",
        "eth": "ethereum",
        "solana": "solana",
        "dogecoin": "dogecoin",
        "doge": "dogecoin",
    }
    if not any(w in qlow for w in ("precio", "price", "cotiza", "cotización", "vale")):
        # still allow bare "bitcoin" style if coin name present with precio-ish context
        if not any(k in qlow for k in ("bitcoin", "btc", "ethereum", "eth")):
            return []
        if not any(w in qlow for w in ("precio", "price", "cuánto", "cuanto", "$", "€", "eur", "usd")):
            return []
    coin_id = None
    for key, cid in coins.items():
        if re.search(r"\b" + re.escape(key) + r"\b", qlow):
            coin_id = cid
            break
    if not coin_id:
        return []
    try:
        url = (
            "https://api.coingecko.com/api/v3/simple/price?ids="
            + coin_id
            + "&vs_currencies=eur,usd&include_24hr_change=true"
        )
        req = UrlRequest(url, headers={"User-Agent": "SnakeOS/1.0"})
        with urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
        row = data.get(coin_id) or {}
        if not row:
            return []
        eur = row.get("eur")
        usd = row.get("usd")
        ch = row.get("eur_24h_change")
        snip = f"Precio aproximado de {coin_id}: "
        parts = []
        if eur is not None:
            parts.append(f"{eur} EUR")
        if usd is not None:
            parts.append(f"{usd} USD")
        snip += ", ".join(parts) if parts else "no disponible"
        if ch is not None:
            snip += f" (cambio 24h EUR: {ch:.2f}%)"
        return [
            {
                "title": f"Precio {coin_id} (CoinGecko)",
                "snippet": snip,
                "url": f"https://www.coingecko.com/en/coins/{coin_id}",
            }
        ]
    except Exception:
        return []


def _wttr_weather(query: str) -> list[dict[str, str]]:
    """Extra weather line when the query looks like clima/tiempo/weather."""
    qlow = query.lower()
    if not any(
        w in qlow
        for w in ("clima", "tiempo", "weather", "temperatura", "forecast", "lluvia")
    ):
        return []
    # Heuristic city: last meaningful token(s)
    city = query
    for prefix in (
        "clima en ",
        "tiempo en ",
        "weather in ",
        "temperatura en ",
        "clima de ",
        "tiempo de ",
        "busca ",
        "buscar ",
    ):
        if qlow.startswith(prefix):
            city = query[len(prefix) :].strip()
            break
    else:
        m = re.search(
            r"(?:clima|tiempo|weather|temperatura)\s+(?:en\s+|de\s+|in\s+)?(.+)$",
            query,
            flags=re.I,
        )
        if m:
            city = m.group(1).strip()
    city = re.sub(r"[?.!,]+$", "", city).strip() or "Madrid"
    try:
        url = "https://wttr.in/" + quote_plus(city) + "?format=%l:+%c+%t+%h+%w+%p"
        req = UrlRequest(url, headers={"User-Agent": "curl/8.0"})
        with urlopen(req, timeout=8) as resp:
            text = resp.read().decode("utf-8", errors="replace").strip()
        if text and "Unknown location" not in text:
            return [
                {
                    "title": f"Clima actual ({city})",
                    "snippet": text,
                    "url": f"https://wttr.in/{quote_plus(city)}",
                }
            ]
    except Exception:
        pass
    return []


def web_search_results(query: str, max_results: int = 5) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    seen_urls: set[str] = set()

    def add_many(items: list[dict[str, str]]) -> None:
        for item in items:
            url = (item.get("url") or "").strip()
            key = url or (item.get("title") or "")
            if not key or key in seen_urls:
                continue
            seen_urls.add(key)
            results.append(
                {
                    "title": (item.get("title") or "")[:160],
                    "snippet": (item.get("snippet") or "")[:500],
                    "url": url[:500],
                }
            )
            if len(results) >= max_results:
                return

    # Especializadas -> Wikipedia (extracts buenos) -> DDG -> Bing si hace falta.
    add_many(_wttr_weather(query))
    add_many(_coingecko_price(query))
    if len(results) < max_results:
        add_many(_wikipedia_search(query, max_results=max_results))
    if len(results) < max_results:
        add_many(_duckduckgo_instant(query))
    if len(results) < max_results:
        add_many(_duckduckgo_html(query, max_results=max_results))
    if len(results) < 2:
        add_many(_bing_html(query, max_results=max_results))
    return results[:max_results]


@app.get("/api/translate")
def api_translate(
    q: str = Query("", max_length=2000),
    sl: str = Query("es", max_length=8),
    tl: str = Query("en", max_length=8),
    user=Depends(require_user),
):
    """Proxy a Google Translate (clients5 / gtx)."""
    _ = user
    query = (q or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Escribe texto para traducir")
    src = (sl or "es").strip().lower()[:8] or "es"
    dst = (tl or "en").strip().lower()[:8] or "en"
    if src == dst:
        return {"translated": query, "sl": src, "tl": dst, "q": query, "engine": "none"}

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "*/*",
    }

    def _fetch(url: str) -> Any:
        req = UrlRequest(url, headers=headers)
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))

    def _from_clients5(data: Any) -> str:
        # ["Hello world"] or [["Hello"],["world"]] variants
        if isinstance(data, list) and data:
            if isinstance(data[0], str):
                return "".join(data).strip() if all(isinstance(x, str) for x in data) else str(data[0]).strip()
            if isinstance(data[0], list):
                parts = []
                for chunk in data:
                    if isinstance(chunk, list) and chunk and isinstance(chunk[0], str):
                        parts.append(chunk[0])
                    elif isinstance(chunk, str):
                        parts.append(chunk)
                return "".join(parts).strip()
        return ""

    def _from_gtx(data: Any) -> str:
        parts = []
        if isinstance(data, list) and data and isinstance(data[0], list):
            for chunk in data[0]:
                if isinstance(chunk, list) and chunk and isinstance(chunk[0], str):
                    parts.append(chunk[0])
        return "".join(parts).strip()

    errors: list[str] = []
    # 1) Google clients5 (dict-chrome-ex) — más estable desde el servidor
    try:
        url = (
            "https://clients5.google.com/translate_a/t"
            f"?client=dict-chrome-ex&sl={quote_plus(src)}&tl={quote_plus(dst)}&q={quote_plus(query)}"
        )
        translated = _from_clients5(_fetch(url))
        if translated:
            return {"translated": translated, "sl": src, "tl": dst, "q": query, "engine": "google-clients5"}
        errors.append("clients5 empty")
    except Exception as e:
        errors.append(f"clients5 {type(e).__name__}")

    # 2) Google gtx fallback
    try:
        url = (
            "https://translate.googleapis.com/translate_a/single"
            f"?client=gtx&sl={quote_plus(src)}&tl={quote_plus(dst)}&dt=t&q={quote_plus(query)}"
        )
        data = _fetch(url)
        translated = _from_gtx(data)
        if translated:
            detected = src
            try:
                if isinstance(data, list) and len(data) > 2 and isinstance(data[2], str):
                    detected = data[2]
            except Exception:
                pass
            return {
                "translated": translated,
                "sl": detected or src,
                "tl": dst,
                "q": query,
                "engine": "google-gtx",
            }
        errors.append("gtx empty")
    except Exception as e:
        errors.append(f"gtx {type(e).__name__}")

    raise HTTPException(
        status_code=502,
        detail="Google Translate no disponible (" + "; ".join(errors) + ")",
    )



@app.get("/api/frame-check")
def api_frame_check(u: str = Query("", max_length=2000), user=Depends(require_user)):
    """Navegador: dice si una web se deja mostrar dentro de Snake OS (X-Frame-Options / CSP).
    No manda cookies ni datos del usuario; solo mira las cabeceras de la pagina publica."""
    _ = user
    raw = (u or "").strip()
    try:
        parsed = urlparse(raw)
    except Exception:
        return {"ok": False, "embeddable": False, "reason": "invalid"}
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https") or not host:
        return {"ok": False, "embeddable": False, "reason": "invalid"}
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        try:
            infos = socket.getaddrinfo(host, port)
        except OSError:
            time.sleep(0.3)
            infos = socket.getaddrinfo(host, port)
        for info in infos:
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return {"ok": False, "embeddable": False, "reason": "private"}
    except Exception:
        return {"ok": False, "embeddable": False, "reason": "dns"}
    try:
        req = UrlRequest(raw, method="GET", headers={"User-Agent": "Mozilla/5.0 (SnakeOS Navegador)", "Accept": "text/html"})
        with urlopen(req, timeout=6) as resp:
            xfo = (resp.headers.get("X-Frame-Options") or "").lower()
            csp = (resp.headers.get("Content-Security-Policy") or "").lower()
            final = resp.geturl()
    except Exception as e:
        code = getattr(e, "code", None)
        if code:
            hdrs = getattr(e, "headers", None)
            xfo = ((hdrs.get("X-Frame-Options") if hdrs else "") or "").lower()
            return {"ok": True, "embeddable": not ("deny" in xfo or "sameorigin" in xfo), "status": int(code)}
        return {"ok": False, "embeddable": False, "reason": "unreachable"}
    blocked = "deny" in xfo or "sameorigin" in xfo
    m = re.search(r"frame-ancestors([^;]*)", csp)
    if m and "*" not in m.group(1).split():
        blocked = True
    return {"ok": True, "embeddable": not blocked, "final": final}


@app.get("/api/gembed")
def api_gembed(
    u: str = Query("", max_length=2000),
    user=Depends(require_user),
):
    """Proxy HTML de Google para el Navegador: quita X-Frame-Options e inyecta el cursor Snake.
    Imágenes/CSS/JS se sirven en URL absoluta de Google (no pasan por el proxy)."""
    _ = user
    from urllib.parse import urljoin, urlparse, quote
    from fastapi.responses import HTMLResponse, Response, RedirectResponse

    raw = (u or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="URL vacía")
    if raw.startswith("//"):
        raw = "https:" + raw
    try:
        parsed = urlparse(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="URL inválida")
    host = (parsed.hostname or "").lower()
    allowed = (
        host == "google.com"
        or host.endswith(".google.com")
        or host == "google.es"
        or host.endswith(".google.es")
        or host.endswith(".gstatic.com")
        or host.endswith(".googleusercontent.com")
        or host.endswith(".ggpht.com")
    )
    if parsed.scheme not in ("http", "https") or not allowed:
        raise HTTPException(status_code=400, detail="Solo se puede embeber Google")

    # accounts.google.com en iframe/proxy → Google responde "400. That's an error"
    # Devolvemos un puente que pide al Navegador abrir el login en ventana top-level.
    if "accounts.google." in host or host.startswith("account.google."):
        from fastapi.responses import HTMLResponse as _HTML
        bridge = """<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Iniciar sesión</title>
<style>
 html,body{margin:0;height:100%;font-family:system-ui,sans-serif;background:#f8f9fa;color:#202124;
  display:flex;align-items:center;justify-content:center;}
 .box{max-width:360px;padding:24px;text-align:center;line-height:1.45}
 button{margin-top:12px;padding:10px 18px;border:0;border-radius:999px;background:#1a73e8;color:#fff;
  font-weight:600;font-size:0.95rem;cursor:pointer}
</style></head><body>
<div class="box">
  <p><strong>Google no permite iniciar sesión dentro de Snake OS</strong> (por eso salía el error 400).</p>
  <p>Se abrirá una ventana de Google para que entres con tu cuenta.</p>
  <button type="button" id="go">Abrir inicio de sesión</button>
</div>
<script>
(function(){
  function ask(){
    try { parent.postMessage({ type: "snk-google-need-login" }, location.origin); } catch (e) {}
  }
  ask();
  var b = document.getElementById("go");
  if (b) b.onclick = ask;
})();
</script>
</body></html>"""
        return _HTML(bridge, headers={"Cache-Control": "no-store"})

    path_l = (parsed.path or "").lower()
    looks_asset = bool(
        re.search(
            r"\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|woff2?|ttf|eot|map|avif|bmp)(\?|$)",
            path_l,
        )
        or "gstatic.com" in host
        or "googleusercontent.com" in host
        or "ggpht.com" in host
        or "/images/" in path_l
        or "encrypted-tbn" in host
    )

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": (
            "*/*"
            if looks_asset
            else "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        ),
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    }
    try:
        req = UrlRequest(raw, headers=headers)
        with urlopen(req, timeout=20) as resp:
            final_url = resp.geturl()
            ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            data = resp.read()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"No se pudo cargar Google ({type(e).__name__})")

    # Assets (imágenes, CSS, JS…): devolver bytes o redirigir al CDN original
    if looks_asset or (ctype and "html" not in ctype and "xml" not in ctype and ctype != ""):
        if ctype.startswith("image/") or ctype.startswith("font/") or ctype in (
            "text/css",
            "application/javascript",
            "text/javascript",
            "application/octet-stream",
        ):
            return Response(
                content=data,
                media_type=ctype or "application/octet-stream",
                headers={"Cache-Control": "public, max-age=3600"},
            )
        return RedirectResponse(url=final_url or raw, status_code=302)

    if not ctype:
        ctype = "text/html"

    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("latin-1", errors="replace")

    def is_google_host(h: str) -> bool:
        h = (h or "").lower()
        return (
            h == "google.com"
            or h.endswith(".google.com")
            or h == "google.es"
            or h.endswith(".google.es")
            or h.endswith(".gstatic.com")
            or h.endswith(".googleusercontent.com")
            or h.endswith(".ggpht.com")
        )

    def abs_url(url: str) -> str:
        url = (url or "").strip()
        if not url or url.startswith(("#", "javascript:", "data:", "mailto:", "tel:", "blob:")):
            return url
        return urljoin(final_url, url)

    def prox_nav(url: str) -> str:
        """Solo navegación HTML (enlaces / formularios) → proxy. Assets → URL absoluta CDN."""
        url = abs_url(url)
        if not url or url.startswith(("#", "javascript:", "data:", "mailto:", "tel:", "blob:")):
            return url
        try:
            p = urlparse(url)
            h = (p.hostname or "").lower()
            path = (p.path or "").lower()
        except Exception:
            return url
        if not is_google_host(h):
            return url
        # No proxificar imágenes ni estáticos: el navegador los carga del CDN
        if (
            h.endswith(".gstatic.com")
            or h.endswith(".googleusercontent.com")
            or h.endswith(".ggpht.com")
            or "encrypted-tbn" in h
            or re.search(
                r"\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|woff2?|ttf|eot|map|avif|bmp)(\?|$)",
                path,
            )
        ):
            return url
        return "/api/gembed?u=" + quote(url, safe="")

    def repl_nav(m):
        attr, quote_ch, val = m.group(1), m.group(2), m.group(3)
        return attr + "=" + quote_ch + prox_nav(val) + quote_ch

    def repl_asset(m):
        """src / srcset / data-src → absolutas (CDN), sin proxy."""
        attr, quote_ch, val = m.group(1), m.group(2), m.group(3)
        if attr.lower() == "srcset":
            parts = []
            for chunk in val.split(","):
                chunk = chunk.strip()
                if not chunk:
                    continue
                bits = chunk.split()
                if not bits:
                    continue
                bits[0] = abs_url(bits[0])
                parts.append(" ".join(bits))
            val2 = ", ".join(parts)
        else:
            val2 = abs_url(val)
        return attr + "=" + quote_ch + val2 + quote_ch

    # Enlaces y formularios → proxy
    text = re.sub(
        r'\b(href|action)\s*=\s*("|\')([^"\']+)\2',
        repl_nav,
        text,
        flags=re.I,
    )
    # Imágenes y scripts → URL absoluta de Google (se ven en el embed)
    text = re.sub(
        r'\b(src|data-src|data-original)\s*=\s*("|\')([^"\']+)\2',
        repl_asset,
        text,
        flags=re.I,
    )
    text = re.sub(
        r'\b(srcset)\s*=\s*("|\')([^"\']+)\2',
        repl_asset,
        text,
        flags=re.I,
    )

    # Quitar CSP del HTML (bloquea imágenes de gstatic al servirse desde Snake OS)
    text = re.sub(
        r'<meta[^>]+http-equiv\s*=\s*["\']?Content-Security-Policy["\']?[^>]*>',
        "",
        text,
        flags=re.I,
    )
    text = re.sub(
        r'<meta[^>]+http-equiv\s*=\s*["\']?Content-Security-Policy-Report-Only["\']?[^>]*>',
        "",
        text,
        flags=re.I,
    )

    cur_css = (
        "<style id='snk-gembed-cur'>"
        "html,body,*{cursor:url('/static/assets/snk-cur-arrow.svg?v=20261009') 3 2,auto!important;}"
        "a,a *,button,button *,[role=button],[role=link],summary{"
        "cursor:url('/static/assets/snk-cur-hand.svg?v=20261009') 13 1,pointer!important;}"
        "input,textarea,[contenteditable=true]{"
        "cursor:url('/static/assets/snk-cur-text.svg?v=20261009') 16 16,text!important;}"
        "</style>"
        "<base href='" + final_url.replace("'", "%27") + "'>"
        # Permitir imágenes/CDN de Google aunque el HTML traiga restricciones
        "<meta http-equiv='Content-Security-Policy' content=\""
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; "
        "img-src * data: blob:; media-src * data: blob:; "
        "font-src * data:; connect-src *; frame-src *; style-src * 'unsafe-inline'; "
        "script-src * 'unsafe-inline' 'unsafe-eval';"
        "\">"
    )
    if re.search(r"<head\b", text, re.I):
        text = re.sub(r"<head\b[^>]*>", lambda m: m.group(0) + cur_css, text, count=1, flags=re.I)
    else:
        text = cur_css + text

    resp = HTMLResponse(content=text, status_code=200)
    resp.headers["Cache-Control"] = "no-store"
    try:
        del resp.headers["x-frame-options"]
    except KeyError:
        pass
    try:
        del resp.headers["content-security-policy"]
    except KeyError:
        pass
    return resp


@app.get("/api/web-search")
def api_web_search(
    q: str = Query("", max_length=200),
    user=Depends(require_user),
):
    """Busqueda web server-side (DuckDuckGo + wttr para clima). Sin abrir pestañas."""
    query = (q or "").strip()
    if len(query) < 2:
        raise HTTPException(status_code=400, detail="Consulta demasiado corta")
    results = web_search_results(query, max_results=5)
    return {"query": query, "results": results}





_MAPS_SEARCH_CACHE: dict = {}


@app.get("/api/maps/tile/{z}/{x}/{y}.png")
def api_maps_tile(z: int, x: int, y: int):
    """Proxy OSM raster tiles so the map works even if the client blocks tile CDNs."""
    from fastapi.responses import Response
    import urllib.request
    z = int(z); x = int(x); y = int(y)
    if z < 0 or z > 19 or x < 0 or y < 0:
        raise HTTPException(status_code=400, detail="bad tile")
    max_i = (1 << z) - 1
    if x > max_i or y > max_i:
        raise HTTPException(status_code=400, detail="bad tile")
    # subdomain by x
    sub = "abc"[x % 3]
    url = f"https://{sub}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "SnakeOS-Maps/1.0 (http://127.0.0.1:8987; tiles proxy)",
            "Accept": "image/png,image/*;q=0.8,*/*;q=0.5",
            "Referer": "http://127.0.0.1:8987/",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = resp.read()
            ctype = resp.headers.get("Content-Type") or "image/png"
    except Exception:
        # Carto Voyager fallback
        sub2 = "abcd"[x % 4]
        url2 = f"https://{sub2}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
        req2 = urllib.request.Request(
            url2,
            headers={
                "User-Agent": "SnakeOS-Maps/1.0",
                "Accept": "image/png,image/*;q=0.8,*/*;q=0.5",
            },
        )
        try:
            with urllib.request.urlopen(req2, timeout=12) as resp2:
                data = resp2.read()
                ctype = resp2.headers.get("Content-Type") or "image/png"
        except Exception as e2:
            raise HTTPException(status_code=502, detail="tile upstream failed") from e2
    return Response(
        content=data,
        media_type=ctype,
        headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
        },
    )


@app.get("/maps-smoke")
def maps_smoke():
    """Minimal map harness (no login) to verify Leaflet + tiles."""
    from fastapi.responses import HTMLResponse
    html = """<!doctype html><html><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>maps smoke</title>
<style>
html,body{margin:0;height:100%;background:#0b1a12;color:#eafff0;font:14px system-ui}
#wrap{position:absolute;inset:12px;display:flex;flex-direction:column;border:1px solid #34d17a55;border-radius:12px;overflow:hidden}
#status{padding:8px 10px;background:#0006}
#body{flex:1;min-height:0;display:flex;flex-direction:column;padding:0}
</style></head><body>
<div id=wrap><div id=status>loading…</div><div id=body></div></div>
<script src="/static/snake-maps.js?v=202610101430"></script>
<script>
var st=document.getElementById('status');
try{
  window.renderMapsApp(document.getElementById('body'));
  setTimeout(function(){
    var f=document.getElementById('snkMapsFrame');
    var leaf=f&&f.classList.contains('leaflet-container');
    var imgs=f?f.querySelectorAll('img.leaflet-tile').length:0;
    st.textContent='frameH='+(f&&f.clientHeight)+' leaflet='+!!leaf+' tiles='+imgs+' · '+((document.getElementById('snkMapsStatus')||{}).textContent||'');
  }, 2800);
}catch(e){ st.textContent='ERR '+e; }
</script></body></html>"""
    return HTMLResponse(html)


@app.get("/api/maps/search")
def api_maps_search(
    q: str = Query("", max_length=200),
    user=Depends(require_user),
):
    """Geocoding rápido: Photon primero, Nominatim de respaldo (pocas peticiones + caché)."""
    _ = user
    query = (q or "").strip()
    if len(query) < 2:
        raise HTTPException(status_code=400, detail="Escribe al menos 2 caracteres")

    # caché corta en proceso (sugerencias al teclear)
    cache_key = query.lower()
    now = time.time()
    hit = _MAPS_SEARCH_CACHE.get(cache_key)
    if hit and now - hit[0] < 120:
        return {"query": query, "results": hit[1]}

    ua = {
        "User-Agent": "SnakeOS-Maps/1.0 (http://127.0.0.1:8987)",
        "Accept": "application/json",
    }

    def _norm_item(lat, lon, name, display, typ="", addresstype="") -> dict | None:
        try:
            la = float(lat)
            lo = float(lon)
        except Exception:
            return None
        if not (-90 <= la <= 90 and -180 <= lo <= 180):
            return None
        nm = str(name or display or "Lugar").strip() or "Lugar"
        return {
            "lat": str(la),
            "lon": str(lo),
            "name": nm,
            "display_name": str(display or nm),
            "type": str(typ or ""),
            "addresstype": str(addresstype or ""),
        }

    def _nominatim(qq: str) -> list[dict]:
        url = (
            "https://nominatim.openstreetmap.org/search?"
            + "format=jsonv2&addressdetails=1&limit=6&accept-language=es"
            + "&countrycodes=es&q="
            + quote_plus(qq)
        )
        req = UrlRequest(url, headers=ua)
        with urlopen(req, timeout=8) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            data = json.loads(raw) if raw else []
        if not isinstance(data, list):
            return []
        out: list[dict] = []
        for item in data[:6]:
            row = _norm_item(
                item.get("lat"),
                item.get("lon"),
                item.get("name"),
                item.get("display_name"),
                item.get("type"),
                item.get("addresstype"),
            )
            if row:
                out.append(row)
        return out

    def _photon(qq: str, lat: float | None = None, lon: float | None = None) -> list[dict]:
        url = "https://photon.komoot.io/api/?limit=8&lang=es&q=" + quote_plus(qq)
        if lat is not None and lon is not None:
            url += f"&lat={lat}&lon={lon}"
        req = UrlRequest(url, headers=ua)
        with urlopen(req, timeout=7) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            data = json.loads(raw) if raw else {}
        feats = data.get("features") if isinstance(data, dict) else []
        if not isinstance(feats, list):
            return []
        out: list[dict] = []
        for feat in feats[:8]:
            if not isinstance(feat, dict):
                continue
            geom = feat.get("geometry") or {}
            coords = geom.get("coordinates") if isinstance(geom, dict) else None
            props = feat.get("properties") if isinstance(feat.get("properties"), dict) else {}
            if not isinstance(coords, list) or len(coords) < 2:
                continue
            lon_v, lat_v = coords[0], coords[1]
            name = props.get("name") or props.get("street") or "Lugar"
            parts = [
                props.get("name"),
                props.get("street"),
                props.get("city") or props.get("town") or props.get("village"),
                props.get("state"),
                props.get("country"),
            ]
            display = ", ".join(str(x) for x in parts if x)
            country = str(props.get("country") or props.get("countrycode") or "").lower()
            row = _norm_item(lat_v, lon_v, name, display or name, props.get("osm_value"), props.get("type"))
            if not row:
                continue
            if country and country not in ("spain", "es", "españa", "espana") and "espa" not in country:
                row["_foreign"] = True
            out.append(row)
        out.sort(key=lambda r: 1 if r.pop("_foreign", False) else 0)
        return out

    low = query.lower()
    # Madrid bias for common local searches
    bias_lat, bias_lon = 40.4168, -3.7038
    candidates: list[str] = [query]
    if "madrid" not in low and any(
        k in low for k in ("vaguada", "comercial", "estación", "estacion", "aeropuerto", "retiro", "prado", "atocha")
    ):
        candidates.append(query + ", Madrid")
    elif "españa" not in low and "spain" not in low and "," not in query:
        candidates.append(query + ", España")

    seen: set[str] = set()
    out: list[dict] = []

    def _add(rows: list[dict]) -> None:
        for row in rows:
            key = f"{float(row['lat']):.5f}|{float(row['lon']):.5f}"
            if key in seen:
                continue
            seen.add(key)
            out.append(row)

    last_err: Exception | None = None
    # 1) Photon (rápido) con bias Madrid
    for cand in candidates[:2]:
        if len(out) >= 6:
            break
        try:
            _add(_photon(cand, bias_lat, bias_lon))
        except Exception as e:
            last_err = e

    # 2) Nominatim solo si Photon no bastó (1 query, no cascada)
    if len(out) < 3:
        try:
            _add(_nominatim(candidates[0]))
        except Exception as e:
            last_err = e

    if not out and last_err is not None:
        raise HTTPException(status_code=502, detail="No se pudo buscar el lugar") from last_err

    results = out[:6]
    _MAPS_SEARCH_CACHE[cache_key] = (now, results)
    # limita tamaño caché
    if len(_MAPS_SEARCH_CACHE) > 200:
        for k, _ in sorted(_MAPS_SEARCH_CACHE.items(), key=lambda kv: kv[1][0])[:50]:
            _MAPS_SEARCH_CACHE.pop(k, None)
    return {"query": query, "results": results}




_BUS_STOP_NEAR_CACHE: dict = {}


@app.get("/api/maps/route")
def api_maps_route(
    from_lat: float = Query(...),
    from_lon: float = Query(...),
    to_lat: float = Query(...),
    to_lon: float = Query(...),
    profile: str = Query("driving"),
    user=Depends(require_user),
):
    """Proxy OSRM (evita CORS/bloqueos y reintenta). profile: driving|foot."""
    _ = user
    prof = "foot" if str(profile).lower() in ("foot", "walking", "walk") else "driving"
    url = (
        f"https://router.project-osrm.org/route/v1/{prof}/"
        f"{from_lon},{from_lat};{to_lon},{to_lat}"
        "?overview=full&geometries=geojson&steps=true&annotations=false"
    )
    req = UrlRequest(
        url,
        headers={
            "User-Agent": "SnakeOS-Maps/1.0 (http://127.0.0.1:8987)",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=14) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        data = json.loads(raw) if raw else {}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"No se pudo calcular la ruta ({type(e).__name__})") from e
    if not isinstance(data, dict) or data.get("code") != "Ok" or not data.get("routes"):
        raise HTTPException(status_code=404, detail="No hay ruta hasta ese sitio")
    return data


@app.get("/api/maps/bus-plan")
def api_maps_bus_plan(
    from_lat: float = Query(...),
    from_lon: float = Query(...),
    to_lat: float = Query(...),
    to_lon: float = Query(...),
    user=Depends(require_user),
):
    """Paradas cercanas: Overpass (varios espejos) + Nominatim como respaldo."""
    _ = user
    from concurrent.futures import ThreadPoolExecutor
    import math
    import time as _time
    from urllib.parse import urlencode, quote
    from urllib.error import HTTPError, URLError

    # cache en proceso: evita martillar Overpass en reintentos del cliente
    OVERPASS_URLS = (
        "https://overpass.private.coffee/api/interpreter",
    )

    def _hav(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
        R = 6371000.0
        p1, p2 = math.radians(a_lat), math.radians(b_lat)
        dphi = math.radians(b_lat - a_lat)
        dlmb = math.radians(b_lon - a_lon)
        x = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
        return 2 * R * math.asin(min(1.0, math.sqrt(x)))

    def _nodes_from_overpass(els: list) -> list:
        out = []
        for el in els:
            if not isinstance(el, dict) or el.get("type") != "node":
                continue
            try:
                lat = float(el.get("lat"))
                lon = float(el.get("lon"))
            except Exception:
                continue
            tags = el.get("tags") or {}
            if not isinstance(tags, dict):
                tags = {}
            name = (
                tags.get("name")
                or tags.get("name:es")
                or tags.get("ref")
                or tags.get("local_ref")
                or "Parada de autobús"
            )
            out.append({"id": el.get("id"), "lat": lat, "lon": lon, "name": str(name)})
        return out

    def _nearest(points: list, lat: float, lon: float):
        best = None
        best_d = 1e18
        for pnt in points:
            d = _hav(lat, lon, pnt["lat"], pnt["lon"])
            if d < best_d:
                best_d = d
                best = pnt
        return best, best_d

    def _overpass(query: str, timeout_s: float = 6.0) -> list:
        body = urlencode({"data": query}).encode("utf-8")
        headers = {
            "User-Agent": "SnakeOS-Maps/1.0 (http://127.0.0.1:8987)",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        }
        last_err = None
        for url in OVERPASS_URLS:
            try:
                req = UrlRequest(url, data=body, headers=headers, method="POST")
                with urlopen(req, timeout=timeout_s) as resp:
                    raw = resp.read().decode("utf-8", errors="replace")
                data = json.loads(raw) if raw else {}
                els = data.get("elements") if isinstance(data, dict) else []
                if isinstance(els, list) and els:
                    return els
                # espejo vivo pero vacío → prueba siguiente
            except (HTTPError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as e:
                last_err = e
                continue
        if last_err:
            raise last_err
        return []

    def _nominatim_stops(lat: float, lon: float, radius_m: float = 1800.0) -> list:
        # ~1 deg lat ≈ 111km; lon escalado
        dlat = radius_m / 111000.0
        dlon = radius_m / (111000.0 * max(0.2, math.cos(math.radians(lat))))
        west, east = lon - dlon, lon + dlon
        south, north = lat - dlat, lat + dlat
        viewbox = f"{west:.6f},{north:.6f},{east:.6f},{south:.6f}"
        out = []
        for q in ("bus stop", "parada de autobús"):
            url = (
                "https://nominatim.openstreetmap.org/search?"
                + urlencode(
                    {
                        "format": "json",
                        "limit": "25",
                        "bounded": "1",
                        "viewbox": viewbox,
                        "q": q,
                    }
                )
            )
            req = UrlRequest(
                url,
                headers={
                    "User-Agent": "SnakeOS-Maps/1.0 (http://127.0.0.1:8987)",
                    "Accept": "application/json",
                },
            )
            with urlopen(req, timeout=8.0) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
            arr = json.loads(raw) if raw else []
            if not isinstance(arr, list):
                continue
            for a in arr:
                if not isinstance(a, dict):
                    continue
                try:
                    plat = float(a.get("lat"))
                    plon = float(a.get("lon"))
                except Exception:
                    continue
                name = str(a.get("display_name") or "Parada de autobús").split(",")[0].strip()
                oid = a.get("osm_id") or a.get("place_id")
                out.append({"id": oid, "lat": plat, "lon": plon, "name": name or "Parada de autobús"})
            if out:
                break
            _time.sleep(1.05)  # política Nominatim: 1 req/s
        # dedupe por coords redondeadas
        seen = set()
        uniq = []
        for p in out:
            key = (round(p["lat"], 5), round(p["lon"], 5))
            if key in seen:
                continue
            seen.add(key)
            uniq.append(p)
        return uniq

    def _nearby_query(lat: float, lon: float, radius: int) -> str:
        return f"""[out:json][timeout:6];
(
  node["highway"="bus_stop"](around:{radius},{lat},{lon});
  node["public_transport"="platform"]["bus"="yes"](around:{radius},{lat},{lon});
  node["public_transport"="stop_position"]["bus"="yes"](around:{radius},{lat},{lon});
  node["amenity"="bus_station"](around:{radius},{lat},{lon});
);
out body;"""

    def _fetch_nearest(lat: float, lon: float):
        cache_key = (round(lat, 3), round(lon, 3))
        now = _time.time()
        hit = _BUS_STOP_NEAR_CACHE.get(cache_key)
        if hit and now - hit[0] < 300:
            return hit[1]

        last_err = None
        # 1) Overpass (rápido si el espejo responde)
        try:
            pts = _nodes_from_overpass(_overpass(_nearby_query(lat, lon, 1600), 7.0))
            if pts:
                best = _nearest(pts, lat, lon)[0]
                _BUS_STOP_NEAR_CACHE[cache_key] = (now, best)
                return best
        except Exception as e:
            last_err = e

        # 2) Nominatim (estable cuando Overpass satura)
        try:
            pts = _nominatim_stops(lat, lon, 2000.0)
            if pts:
                best = _nearest(pts, lat, lon)[0]
                _BUS_STOP_NEAR_CACHE[cache_key] = (now, best)
                return best
        except Exception as e:
            last_err = e

        if last_err is not None:
            raise last_err
        return None

    board = None
    alight = None
    mode = "nearest_only"
    err_board = None
    err_alight = None

    # En paralelo Overpass; Nominatim dentro de cada hilo si hace falta
    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_board = pool.submit(_fetch_nearest, from_lat, from_lon)
        fut_alight = pool.submit(_fetch_nearest, to_lat, to_lon)
        try:
            board = fut_board.result(timeout=18)
        except Exception as e:
            err_board = e
            board = None
        try:
            alight = fut_alight.result(timeout=18)
        except Exception as e:
            err_alight = e
            alight = None

    if board is not None and alight is not None:
        try:
            bid = int(board["id"]) if board.get("id") is not None else None
            if bid is not None:
                q_alight = f"""[out:json][timeout:4];
node({bid})->.board;
rel(bn.board)["type"="route"]["route"="bus"]->.rels;
(
  node(r.rels)["highway"="bus_stop"](around:1200,{to_lat},{to_lon});
  node(r.rels)["public_transport"="platform"](around:1200,{to_lat},{to_lon});
  node(r.rels)["amenity"="bus_station"](around:1200,{to_lat},{to_lon});
);
out body;"""
                linked = _nodes_from_overpass(_overpass(q_alight, 3.5))
                if linked:
                    better, _ = _nearest(linked, to_lat, to_lon)
                    if better:
                        alight = better
                        mode = "shared_route"
        except Exception:
            pass

    if not board:
        if err_board is not None:
            raise HTTPException(
                status_code=503,
                detail="El mapa de autobuses no respondió a tiempo. Reintenta en unos segundos.",
            )
        raise HTTPException(status_code=404, detail="No hay paradas de autobús cerca de tu ubicación")
    if not alight:
        if err_alight is not None:
            raise HTTPException(
                status_code=503,
                detail="El mapa de autobuses no respondió a tiempo. Reintenta en unos segundos.",
            )
        raise HTTPException(status_code=404, detail="No hay paradas de autobús cerca del destino")

    def _pub(p: dict) -> dict:
        return {
            "id": p.get("id"),
            "lat": p["lat"],
            "lon": p["lon"],
            "name": p.get("name") or "Parada de autobús",
        }

    return {
        "mode": mode,
        "board": _pub(board),
        "alight": _pub(alight),
        "walk_to_board_m": round(_hav(from_lat, from_lon, board["lat"], board["lon"])),
        "walk_from_alight_m": round(_hav(alight["lat"], alight["lon"], to_lat, to_lon)),
    }





@app.get("/api/ai-image")
def api_ai_image(
    prompt: str = Query("", max_length=800),
    width: int = Query(768, ge=256, le=1280),
    height: int = Query(768, ge=256, le=1280),
    star: str = Query("", max_length=8),
    user=Depends(require_user),
):
    """Proxy de generación de imágenes vía Pollinations (por diseño).

    Askbox es el gateway de texto del resto de la IA en Snake OS y no ofrece API de imágenes;
    la generación de imágenes permanece aquí en Pollinations de forma intencionada.

    width/height/star = calidad Doganiero Star.
    Devuelve siempre JSON (nunca HTML). Fallos esperados → 422 (evita que Cloudflare reescriba un 502).
    """
    import base64
    import re as _re
    import time as _time

    _ = user
    raw = (prompt or "").strip()
    if len(raw) < 2:
        raise HTTPException(status_code=400, detail="Describe la imagen (mín. 2 caracteres)")

    star_id = (star or "").strip()
    w0 = max(256, min(1280, int(width or 768)))
    h0 = max(256, min(1280, int(height or 768)))
    w0 = max(256, w0 - (w0 % 64))
    h0 = max(256, h0 - (h0 % 64))

    if star_id == "1.1":
        max_prompt = 140
        size_ladder = [(min(w0, 512), min(h0, 512)), (512, 512)]
    elif star_id == "1.3":
        max_prompt = 360
        size_ladder = [(w0, h0), (min(w0, 768), min(h0, 768)), (512, 512)]
    else:
        max_prompt = 220
        size_ladder = [(w0, h0), (min(w0, 640), min(h0, 640)), (512, 512)]

    # dedupe sizes
    seen = set()
    sizes = []
    for wh in size_ladder:
        key = (int(wh[0]), int(wh[1]))
        if key not in seen:
            seen.add(key)
            sizes.append(key)

    cleaned = _re.sub(r"\s+", " ", raw)[:max_prompt]
    # Quitar boosts de estilo ingles si el servicio se queja; variantes de más rica a más simple
    no_boost = _re.sub(
        r",?\s*(ultra detailed|masterpiece|sharp focus|cinematic lighting|high resolution|"
        r"rich textures|detailed|good composition|vivid colors|clean lighting)(,|$)",
        "",
        cleaned,
        flags=_re.I,
    ).strip(" ,")
    words = cleaned.split()
    short = " ".join(words[:8])
    shorter = " ".join(words[:4])
    # Preferir sujeto simple en inglés si parece español muy largo (mejor tasa de exito)
    variants = []
    for v in (cleaned, no_boost, short, shorter):
        v = (v or "").strip()
        if v and v not in variants:
            variants.append(v)

    last_err = "sin respuesta"
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; SnakeOS/1.0; +http://127.0.0.1:8987)",
        "Accept": "image/jpeg,image/png,image/*,*/*",
        "Referer": "http://127.0.0.1:8987/",
    }

    for w, h in sizes:
        for attempt, p in enumerate(variants):
            seed = int(_time.time() * 1000) % 1000000 + attempt * 17 + w
            url = (
                "https://image.pollinations.ai/prompt/"
                + quote_plus(p)
                + f"?width={w}&height={h}&nologo=true&seed={seed}"
            )
            try:
                req = UrlRequest(url, headers=headers)
                with urlopen(req, timeout=50) as resp:
                    ctype = (resp.headers.get("Content-Type") or "image/jpeg").split(";")[0].strip()
                    data = resp.read()
                if not data or len(data) < 80:
                    last_err = "imagen vacía"
                    continue
                # Si el upstream devolvió HTML/JSON de error
                if ctype.startswith("text/") or ctype.startswith("application/json"):
                    last_err = data[:160].decode("utf-8", "ignore")
                    continue
                if not ctype.startswith("image/"):
                    # a veces llega JPEG sin content-type correcto: sniff
                    if data[:3] == b"\xff\xd8\xff":
                        ctype = "image/jpeg"
                    elif data[:8] == b"\x89PNG\r\n\x1a\n":
                        ctype = "image/png"
                    else:
                        last_err = data[:160].decode("utf-8", "ignore")
                        continue
                b64 = base64.b64encode(data).decode("ascii")
                return {
                    "ok": True,
                    "prompt": p,
                    "mime": ctype,
                    "width": w,
                    "height": h,
                    "star": star_id or None,
                    "dataUrl": f"data:{ctype};base64,{b64}",
                }
            except Exception as e:  # noqa: BLE001
                last_err = str(e)
                # 402/429: seguir con prompt/tamaño más simple
                continue

    # 422 (no 502): Cloudflare a veces sustituye 502 por HTML y el cliente falla al parsear JSON
    raise HTTPException(
        status_code=422,
        detail="No se pudo generar la imagen ahora (servicio ocupado o descripción difícil). "
        "Prueba Star 1.1 o una descripción más corta. ("
        + last_err[:100]
        + ")",
    )


# ===== BEGIN METAVERSE =====
import asyncio
import time as time_mod
from fastapi import WebSocket, WebSocketDisconnect

def _safe_int(v: Any, default: int) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


async def _ws_close_quiet(ws: Any, code: int = 1000) -> None:
    """Close without raising if the client already went away."""
    try:
        await ws.close(code=code)
    except Exception:
        pass


def _ws_is_open(ws: Any) -> bool:
    """True only while both sides of the socket are CONNECTED (after accept, before close)."""
    try:
        return (
            getattr(getattr(ws, "client_state", None), "name", "") == "CONNECTED"
            and getattr(getattr(ws, "application_state", None), "name", "") == "CONNECTED"
        )
    except Exception:
        return False


class MetaverseRoom:
    """In-memory presence for Doganiero Metaverse (2D, multi-world)."""

    VALID_WORLDS = ("plaza", "parque", "ciudad")

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        # email -> {"ws", "user", "x", "y", "ry", "world", "room"}
        self.clients: dict[str, dict[str, Any]] = {}
        self.bones: dict[str, list[dict[str, Any]]] = {}
        self._bone_seq = 0

    @classmethod
    def normalize_world(cls, world: str | None) -> str:
        w = (world or "plaza").strip().lower()
        return w if w in cls.VALID_WORLDS else "plaza"

    @staticmethod
    def room_world(room_id: str | None) -> str | None:
        rooms = {
            "sala-central": "plaza",
            "anfiteatro": "plaza",
            "quiosco": "parque",
            "pista": "parque",
            "auditorio": "ciudad",
            "galeria": "ciudad",
        }
        if not room_id:
            return None
        return rooms.get(str(room_id).strip().lower())

    def snapshot_players(self, world: str | None = None) -> list[dict[str, Any]]:
        out = []
        want = self.normalize_world(world) if world else None
        for email, c in self.clients.items():
            cw = c.get("world") or "plaza"
            if want is not None and cw != want:
                continue
            out.append(
                {
                    "email": email,
                    "name": c["user"]["name"],
                    "avatar": c["user"]["avatar"],
                    "pro": db.pro_flag(_MV_UID.get(email)),
                    "look": db.normalize_mv_look(c.get("look")),
                    "x": c.get("x", 400.0),
                    "y": c.get("y", 400.0),
                    "z": 0.0,
                    "ry": c.get("ry", 0.0),
                    "world": cw,
                    "room": c.get("room"),
                    "voice": bool(c.get("voice")),
                    **({"arm": {
                        k: float(c["arm"].get(k))
                        for k in ("x", "y", "z", "s", "tx", "ty", "tz")
                        if c["arm"].get(k) is not None
                    }} if isinstance(c.get("arm"), dict) else {}),
                }
            )
        return out

    async def connect(
        self,
        email: str,
        user: dict[str, Any],
        ws: WebSocket,
        world: str = "plaza",
    ) -> None:
        world = self.normalize_world(world)
        async with self._lock:
            old = self.clients.get(email)
            keep_x = keep_y = keep_ry = None
            keep_score = 0
            keep_room = None
            keep_world = world
            keep_voice = False
            if old:
                try:
                    keep_x = float(old.get("x"))
                    keep_y = float(old.get("y"))
                    keep_ry = float(old.get("ry") or 0)
                except (TypeError, ValueError):
                    keep_x = keep_y = keep_ry = None
                keep_score = int(old.get("score") or 0)
                keep_room = old.get("room")
                keep_world = self.normalize_world(old.get("world") or world)
                keep_voice = bool(old.get("voice"))
                if old.get("ws") is not ws and _ws_is_open(old.get("ws")):
                    try:
                        await old["ws"].send_text(
                            '{"type":"replaced","detail":"Nueva sesión en otra pestaña"}'
                        )
                    except Exception:
                        pass
                    try:
                        await old["ws"].close(code=4000)
                    except Exception:
                        pass
            self.clients[email] = {
                "ws": ws,
                "user": user,
                "x": keep_x if keep_x is not None else 400.0 + float((hash(email) % 7) - 3) * 12,
                "y": keep_y if keep_y is not None else 400.0 + float((hash(email[::-1]) % 7) - 3) * 12,
                "ry": keep_ry if keep_ry is not None else 0.0,
                "world": keep_world if keep_x is not None else world,
                "room": keep_room if keep_x is not None else None,
                "score": keep_score,
                "emote": None,
                "voice": keep_voice if keep_x is not None else False,
                "_had_live": keep_x is not None,
            }

    async def disconnect(self, email: str, ws: WebSocket) -> dict[str, Any] | None:
        async with self._lock:
            cur = self.clients.get(email)
            if cur and cur.get("ws") is ws:
                user = cur.get("user") if isinstance(cur.get("user"), dict) else {}
                info = {
                    "email": email,
                    "world": cur.get("world") or "plaza",
                    "room": cur.get("room"),
                    "voice": bool(cur.get("voice")),
                    "name": user.get("name") or email,
                }
                cur["voice"] = False
                del self.clients[email]
                return info
            return None

    async def set_world(
        self,
        email: str,
        world: str,
        x: float | None = None,
        y: float | None = None,
        ry: float | None = None,
    ) -> tuple[str | None, dict[str, Any] | None]:
        """Returns (old_world, player_snapshot) or (None, None)."""
        world = self.normalize_world(world)
        async with self._lock:
            cur = self.clients.get(email)
            if not cur:
                return None, None
            old = cur.get("world") or "plaza"
            cur["world"] = world
            cur["room"] = None
            if x is not None:
                cur["x"] = max(20.0, min(780.0, float(x)))
            if y is not None:
                cur["y"] = max(20.0, min(780.0, float(y)))
            if ry is not None:
                cur["ry"] = float(ry)
            snap = {
                "email": email,
                "name": cur["user"]["name"],
                "avatar": cur["user"]["avatar"],
                "look": db.normalize_mv_look(cur.get("look")),
                "x": cur["x"],
                "y": cur["y"],
                "z": 0.0,
                "ry": cur["ry"],
                "world": world,
                "room": None,
                "pro": db.pro_flag(_MV_UID.get(email)),
            }
            return old, snap

    async def set_room(self, email: str, room: str | None) -> dict[str, Any] | None:
        async with self._lock:
            cur = self.clients.get(email)
            if not cur:
                return None
            cur["room"] = (str(room).strip()[:64] if room else None)
            return {
                "email": email,
                "name": cur["user"]["name"],
                "avatar": cur["user"]["avatar"],
                "look": db.normalize_mv_look(cur.get("look")),
                "x": cur["x"],
                "y": cur["y"],
                "z": 0.0,
                "ry": cur["ry"],
                "world": cur.get("world") or "plaza",
                "room": cur["room"],
            }

    async def update_pose(
        self,
        email: str,
        x: float,
        y: float,
        z: float,
        ry: float,
        world: str | None = None,
        room: str | None = None,
        arm: Any = None,
    ) -> dict[str, Any] | None:
        _ = z
        async with self._lock:
            cur = self.clients.get(email)
            if not cur:
                return None
            # Ignorar world en move: solo set_world cambia de mundo (evita ghosts)
            _ = world
            cur["x"] = max(20.0, min(780.0, float(x)))
            cur["y"] = max(20.0, min(780.0, float(y)))
            cur["ry"] = float(ry)
            if isinstance(arm, dict):
                clean_arm = {}
                for ak in ("x", "y", "z"):
                    if arm.get(ak) is None:
                        continue
                    try:
                        av = float(arm.get(ak))
                    except (TypeError, ValueError):
                        continue
                    if av != av or abs(av) > 1e6:
                        continue
                    clean_arm[ak] = max(-6.0, min(6.0, av))
                if arm.get("s") is not None:
                    try:
                        sv = float(arm.get("s"))
                        if sv == sv and 0.2 <= sv <= 5.0:
                            clean_arm["s"] = sv
                    except (TypeError, ValueError):
                        pass
                for ak in ("tx", "ty", "tz"):
                    if arm.get(ak) is None:
                        continue
                    try:
                        av = float(arm.get(ak))
                    except (TypeError, ValueError):
                        continue
                    if av != av or abs(av) > 1e6:
                        continue
                    clean_arm[ak] = av
                if clean_arm:
                    prev_arm = cur.get("arm") if isinstance(cur.get("arm"), dict) else {}
                    merged_arm = dict(prev_arm)
                    merged_arm.update(clean_arm)
                    cur["arm"] = merged_arm
            if room is not None:
                cur["room"] = (str(room).strip()[:64] if room else None)
            pose_out = {
                "email": email,
                "name": cur["user"]["name"],
                "avatar": cur["user"]["avatar"],
                "look": db.normalize_mv_look(cur.get("look")),
                "x": cur["x"],
                "y": cur["y"],
                "z": 0.0,
                "ry": cur["ry"],
                "world": cur.get("world") or "plaza",
                "room": cur.get("room"),
            }
            if isinstance(cur.get("arm"), dict):
                pose_out["arm"] = {
                    "x": float(cur["arm"].get("x") or 0.0),
                    "y": float(cur["arm"].get("y") or 0.0),
                    "z": float(cur["arm"].get("z") or 0.0),
                }
            return pose_out


    def ensure_bones(self, world: str, n: int = 8) -> list[dict[str, Any]]:
        import random
        world = self.normalize_world(world)
        bones = self.bones.setdefault(world, [])
        while len(bones) < n:
            self._bone_seq += 1
            bones.append(
                {
                    "id": "b%d" % self._bone_seq,
                    "x": round(random.uniform(60, 740), 1),
                    "y": round(random.uniform(60, 740), 1),
                }
            )
        return bones

    async def collect_bone(self, email: str, bone_id: str) -> dict[str, Any] | None:
        import random
        async with self._lock:
            cur = self.clients.get(email)
            if not cur:
                return None
            world = cur.get("world") or "plaza"
            bones = self.bones.get(world) or []
            found = None
            for b in bones:
                if b["id"] == bone_id:
                    found = b
                    break
            if not found:
                return None
            if abs(float(cur["x"]) - float(found["x"])) > 100 or abs(
                float(cur["y"]) - float(found["y"])
            ) > 100:
                return None
            bones.remove(found)
            self._bone_seq += 1
            newb = {
                "id": "b%d" % self._bone_seq,
                "x": round(random.uniform(60, 740), 1),
                "y": round(random.uniform(60, 740), 1),
            }
            bones.append(newb)
            # Pickup no longer grows bone_score. Coins are added by the caller.
            score = int(cur.get("score") or 0)
            return {
                "world": world,
                "collected_id": bone_id,
                "by": email,
                "by_name": cur["user"]["name"],
                "score": score,
                "new_bone": newb,
                "bones": list(bones),
            }


    def _same_voice_space(self, a: dict[str, Any], b: dict[str, Any]) -> bool:
        return (a.get("world") or "plaza") == (b.get("world") or "plaza") and (
            a.get("room") or None
        ) == (b.get("room") or None)

    async def persist_client_progress(self, email: str) -> None:
        """Write current pose/world/score for email to SQLite."""
        async with self._lock:
            cur = self.clients.get(email)
            if not cur:
                return
            snap = {
                "world": cur.get("world") or "plaza",
                "room": cur.get("room"),
                "x": float(cur.get("x") or 400),
                "y": float(cur.get("y") or 400),
                "ry": float(cur.get("ry") or 0),
                "score": int(cur.get("score") or 0),
            }
        uid = db.get_user_id_by_email(email)
        if uid is None:
            return
        try:
            db.upsert_metaverse_progress(
                int(uid),
                world=str(snap["world"]),
                room=snap["room"],
                x=float(snap["x"]),
                y=float(snap["y"]),
                ry=float(snap["ry"]),
                bone_score=int(snap["score"]),
            )
        except Exception:
            pass

    async def broadcast(
        self,
        payload: dict[str, Any],
        *,
        skip: str | None = None,
        world: str | None = None,
    ) -> None:
        # AI bots only chat through metaverse_ai_bots (marked bot=True), which
        # has its own small Askbox budget. Anything else claiming a bot is dropped.
        if (
            payload.get("type") == "chat"
            and str(payload.get("from") or payload.get("from_email") or "").lower().startswith("ai-bot:")
            and payload.get("bot") is not True
        ):
            return
        data = json.dumps(payload, ensure_ascii=False)
        want = self.normalize_world(world) if world else None
        dead: list[tuple[str, Any]] = []
        async with self._lock:
            items = [(email, c.get("ws"), c.get("world") or "plaza") for email, c in self.clients.items()]
        for email, ws, cur_world in items:
            if ws is None or (skip and email == skip):
                continue
            if want is not None and cur_world != want:
                continue
            if not _ws_is_open(ws):
                dead.append((email, ws))
                continue
            try:
                await ws.send_text(data)
            except Exception:
                dead.append((email, ws))
        if dead:
            async with self._lock:
                for email, ws in dead:
                    cur = self.clients.get(email)
                    if cur and cur.get("ws") is ws:
                        self.clients.pop(email, None)

    async def update_profile(self, email: str, pub: dict[str, Any]) -> None:
        """Foto/emoji o nombre de perfil cambiados: actualizar presencia y avisar al mundo."""
        email = str(email or "").strip().lower()
        async with self._lock:
            cur = self.clients.get(email)
            if not cur:
                return
            u = dict(cur.get("user") or {})
            if pub.get("name"):
                u["name"] = pub["name"]
            if pub.get("avatar"):
                u["avatar"] = pub["avatar"]
            cur["user"] = u
            world = cur.get("world") or "plaza"
            payload = {
                "type": "profile",
                "email": email,
                "name": u.get("name"),
                "avatar": u.get("avatar"),
            }
        await self.broadcast(payload, world=world)

    async def send_to(self, email: str, payload: dict[str, Any]) -> bool:
        async with self._lock:
            c = self.clients.get(email)
        if not c or not _ws_is_open(c.get("ws")):
            return False
        try:
            await c["ws"].send_text(json.dumps(payload, ensure_ascii=False))
            return True
        except Exception:
            return False



metaverse_room = MetaverseRoom()

# Mando Pro: short-lived pair codes (desktop Metaverse → phone controller page)
_MANDO_PRO_PAIRS: dict[str, dict[str, Any]] = {}
_MANDO_PRO_BY_EMAIL: dict[str, str] = {}
_MANDO_PRO_EFFECTS = frozenset({
    "glow", "trail", "bighead", "tiny", "rainbow", "ghost",
    "hearts", "thunder", "spotlight", "pulse", "smoke", "crown",
})
_MANDO_PRO_LABELS = {
    "glow": "Aura",
    "trail": "Estela",
    "bighead": "Cabezón",
    "tiny": "Mini",
    "rainbow": "Arcoíris",
    "ghost": "Fantasma",
    "hearts": "Corazones",
    "thunder": "Rayo",
    "spotlight": "Foco",
    "pulse": "Pulso",
    "smoke": "Humo",
    "crown": "Corona",
}


def _mando_pro_purge(now: float | None = None) -> None:
    t = now if now is not None else time.time()
    dead = [c for c, row in _MANDO_PRO_PAIRS.items() if float(row.get("exp") or 0) < t]
    for c in dead:
        row = _MANDO_PRO_PAIRS.pop(c, None)
        if not row:
            continue
        em = str(row.get("email") or "")
        if em and _MANDO_PRO_BY_EMAIL.get(em) == c:
            _MANDO_PRO_BY_EMAIL.pop(em, None)


def _mando_pro_make_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(24):
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        if code not in _MANDO_PRO_PAIRS:
            return code
    return secrets.token_hex(3).upper()


def _discover_lan_ips() -> list[str]:
    """Prefer real host LAN IPs (Proxmox/Docker: read host rootfs proc, not container netns)."""
    found: list[str] = []

    # Fast path: env or data/lan-ip.txt written on the host (container netns cannot see 192.168.*)
    for raw in (
        os.environ.get("SNAKEOS_LAN_IP") or "",
        os.environ.get("LAN_IP") or "",
    ):
        for part in re.split(r"[\s,;]+", str(raw).strip()):
            if part:
                found.append(part.strip())
    try:
        for cand in (
            FsPath("/app/data/lan-ip.txt"),
            FsPath("data/lan-ip.txt"),
            FsPath("/host/rootfs/srv/juegos_david/snake-os/data/lan-ip.txt"),
        ):
            if not cand.is_file():
                continue
            try:
                txt = cand.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            for line in txt.splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                for part in re.split(r"[\s,;]+", line):
                    if part:
                        found.append(part.strip())
            break
    except Exception:
        pass
    # Normalize early seeds
    _seed = []
    for _ip in found:
        _ip = (_ip or "").strip()
        if _ip and _ip not in _seed and not _ip.startswith("127.") and not _ip.startswith("169.254."):
            _seed.append(_ip)
    found = _seed

    def _add(ip: str) -> None:
        ip = (ip or "").strip()
        if not ip or ip.startswith("127.") or ip in found:
            return
        if ip.startswith("169.254."):
            return
        found.append(ip)

    def _is_dockerish(ip: str) -> bool:
        if ip.startswith("172."):
            try:
                second = int(ip.split(".")[1])
            except Exception:
                return True
            return 16 <= second <= 31
        return False

    trie_paths = [
        FsPath("/host/rootfs/proc/net/fib_trie"),
        FsPath("/host/proc/net/fib_trie"),
        FsPath("/proc/net/fib_trie"),
    ]
    for trie in trie_paths:
        try:
            if not trie.is_file():
                continue
            try:
                text = _si8_read_text(trie)
            except Exception:
                text = trie.read_text(encoding="utf-8", errors="ignore")
            for m in re.finditer(
                r"\|--\s+(\d+\.\d+\.\d+\.\d+)\s*\n\s+/32 host LOCAL",
                text,
            ):
                _add(m.group(1))
            for m in re.finditer(r"(\d+\.\d+\.\d+\.\d+)\s*(?:\n\s*)+/32 host LOCAL", text):
                _add(m.group(1))
            if any(not _is_dockerish(ip) for ip in found):
                break
        except Exception:
            continue

    if not any(not _is_dockerish(ip) for ip in found):
        try:
            import subprocess

            out = subprocess.check_output(
                ["nsenter", "-t", "1", "-n", "hostname", "-I"],
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=2,
            )
            for part in (out or "").split():
                if re.fullmatch(r"\d+\.\d+\.\d+\.\d+", part):
                    _add(part)
        except Exception:
            pass

    try:
        import socket as _socket

        hostname = _socket.gethostname()
        for info in _socket.getaddrinfo(hostname, None, _socket.AF_INET):
            _add(info[4][0])
    except Exception:
        pass
    try:
        import socket as _socket

        s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            _add(s.getsockname()[0])
        finally:
            s.close()
    except Exception:
        pass

    def rank(ip: str) -> tuple:
        if ip.startswith("192.168."):
            return (0, ip)
        if ip.startswith("10."):
            return (1, ip)
        if _is_dockerish(ip):
            return (5, ip)
        if ip.startswith("172."):
            return (4, ip)
        return (3, ip)

    ordered = sorted(found, key=rank)
    preferred = [ip for ip in ordered if not _is_dockerish(ip)]
    return preferred or ordered



try:
    import metaverse_ai_bots as _metaverse_ai_bots
    _metaverse_ai_bots.attach(metaverse_room)

    async def _metaverse_bot_say(bot: dict, world: str, text: str) -> None:
        saved = db.save_metaverse_message(
            from_email=str(bot["email"]),
            from_name=str(bot["name"]),
            to_email=None,
            text=text,
            created_at=time_mod.time(),
            world=world,
        )
        try:
            await metaverse_room.broadcast({"type": "chat", **saved, "bot": True}, world=world)
        except Exception as exc:
            print(f"[metaverse-bots] broadcast failed: {exc!r}", flush=True)

    _metaverse_ai_bots.set_chat_sender(_metaverse_bot_say)
except Exception:
    _metaverse_ai_bots = None



def _mv_tag_pro(msgs: Any) -> Any:
    """Insignia PRO pública del autor de cada mensaje del Metaverse (solo el booleano, calculado en el servidor)."""
    cache: dict[str, bool] = {}
    for m in msgs or []:
        if not isinstance(m, dict):
            continue
        fe = str(m.get("from") or "").strip().lower()
        if fe not in cache:
            uid = _MV_UID.get(fe) if "_MV_UID" in globals() else None
            if uid is None and fe and "@" in fe:
                urow = db.get_user_by_email(fe)
                uid = urow["id"] if urow else None
            cache[fe] = db.pro_flag(uid)
        m["from_pro"] = cache[fe]
    return msgs


@app.get("/api/metaverse/messages")
def metaverse_messages(
    with_user: str | None = Query(None, alias="with"),
    peer_q: str | None = Query(None, alias="peer"),
    world: str | None = Query(None),
    user=Depends(require_user),
):
    peer = (with_user or peer_q or "").strip().lower() or None
    world_id = MetaverseRoom.normalize_world(world) if peer is None else None
    msgs = db.list_metaverse_messages(
        user_email=user["email"],
        peer_email=peer,
        world=world_id,
        limit=80,
    )
    _mv_tag_pro(msgs)
    return {"messages": msgs, "world": world_id}


class MetaverseBoardStep(BaseModel):
    dir: str = ""


@app.post("/api/metaverse/board-step")
async def metaverse_board_step(body: MetaverseBoardStep):
    """La Mega manda un paso. No usa la IA de los bots."""
    if _metaverse_ai_bots is None:
        return {"ok": False, "moved": 0}
    moved = await _metaverse_ai_bots.apply_board_step(str(body.dir or ""))
    return {"ok": True, "moved": moved}


class MetaverseBoardParty(BaseModel):
    on: bool = False


async def _notify_metaverse_party() -> int:
    text = "server i9: Hay fiesta en el metaverso. Dura 10 minutos."
    now = time.time()
    sent = 0
    try:
        users = db.list_users()
    except Exception:
        return 0
    for person in users:
        try:
            uid = int(person.get("id") or 0)
        except (TypeError, ValueError):
            continue
        email = str(person.get("email") or "")
        if uid <= 0 or email.startswith("ai-bot"):
            continue
        try:
            notif = db.create_notification(
                user_id=uid,
                kind="metaverse",
                title="server i9",
                body=text,
                data={"app": "metaverse", "from": "server i9", "image": "/static/assets/mega-fiesta.png"},
                created_at=now,
            )
            await chat_hub.send_to_user(uid, {
                "type": "notification",
                "notification": notif,
                "unread": db.count_unread_notifications(user_id=uid),
            })
            _queue_notif_push(uid, notif)
            sent += 1
        except Exception:
            continue
    print(f"[fiesta] avisos {sent}", flush=True)
    return sent


@app.post("/api/metaverse/board-party")
async def metaverse_board_party(body: MetaverseBoardParty):
    """La Mega abre o cierra la fiesta de 10 minutos. El paso sigue saliendo de la placa."""
    if _metaverse_ai_bots is None:
        return {"ok": False, "party": False}
    if body.on:
        started = _metaverse_ai_bots.begin_party(600.0)
        sent = await _notify_metaverse_party() if started else 0
        await _broadcast_metaverse_party(True)
        return {"ok": True, "party": True, "started": started, "avisos": sent}
    ended = _metaverse_ai_bots.end_party()
    await _broadcast_metaverse_party(False)
    return {"ok": True, "party": False, "ended": ended}


def _metaverse_party_on() -> bool:
    """Misma bandera que enciende la Mega. No hay otro reloj de fiesta."""
    if _metaverse_ai_bots is None:
        return False
    try:
        return bool(_metaverse_ai_bots.party_active())
    except Exception:
        return False


async def _broadcast_metaverse_party(on: bool) -> None:
    try:
        await metaverse_room.broadcast({"type": "party", "party": bool(on)})
    except Exception:
        pass


@app.get("/api/metaverse/party")
def metaverse_party_status():
    """El metaverso pregunta aquí si la fiesta sigue. Solo la bandera de la Mega."""
    return {"party": _metaverse_party_on()}


@app.get("/api/metaverse/party-cycle")
def metaverse_party_cycle(user=Depends(require_user)):
    """Contador 1 h → fiesta 10 min (misma fase que el servidor)."""
    _ = user
    if _metaverse_ai_bots is None:
        return {
            "phase": "hour",
            "secondsLeft": 3600,
            "party": _metaverse_party_on(),
            "hourSeconds": 3600,
            "partySeconds": 600,
        }
    info = _metaverse_ai_bots.party_cycle_info()
    info["party"] = _metaverse_party_on() or bool(info.get("party"))
    return info


@app.get("/api/metaverse/online")
def metaverse_online(
    world: str | None = Query(None),
    user=Depends(require_user),
):
    _ = user
    w = MetaverseRoom.normalize_world(world) if world else None
    return {"players": metaverse_room.snapshot_players(w), "world": w}


@app.get("/api/metaverse/board-people")
def metaverse_board_people():
    """Cuenta personas en el metaverso para la Mega. Sin nombres ni correos."""
    n = 0
    for email in list(metaverse_room.clients):
        if str(email).lower().startswith("ai-bot"):
            continue
        n += 1
    return {"count": n}




METAVERSE_ACTIVE_EVENT_STATUSES = frozenset()  # no active events


def metaverse_rooms_catalog() -> list[dict]:
    """Canonical rooms for Doganiero Metaverse (venues only; no event payloads)."""
    return [
        {
            "id": "sala-central",
            "name": "Sala Central",
            "world": "plaza",
            "emoji": "🎪",
        },
        {
            "id": "anfiteatro",
            "name": "Anfiteatro",
            "world": "plaza",
            "emoji": "🎭",
        },
        {
            "id": "quiosco",
            "name": "Quiosco",
            "world": "parque",
            "emoji": "🍵",
        },
        {
            "id": "pista",
            "name": "Pista al aire libre",
            "world": "parque",
            "emoji": "🎵",
        },
        {
            "id": "auditorio",
            "name": "Auditorio",
            "world": "ciudad",
            "emoji": "🎤",
        },
        {
            "id": "galeria",
            "name": "Galería",
            "world": "ciudad",
            "emoji": "🖼️",
        },
    ]


def active_metaverse_event_payloads() -> list[dict]:
    """No Metaverse events — keep helpers for sync-metaverse-events compatibility."""
    return []


@app.get("/api/metaverse/worlds")
def metaverse_worlds(user=Depends(require_user)):
    _ = user
    return {
        "worlds": [
            {"id": "plaza", "name": "Plaza", "emoji": "🏛️"},
            {"id": "parque", "name": "Parque", "emoji": "🌳"},
            {"id": "ciudad", "name": "Ciudad", "emoji": "🏙️"},
        ],
        "rooms": metaverse_rooms_catalog(),
    }




@app.get("/api/metaverse/progress")
def get_metaverse_progress_api(user=Depends(require_user)):
    return db.get_metaverse_progress(int(user["id"]))


@app.put("/api/metaverse/progress")
def put_metaverse_progress_api(body: MetaverseProgressBody, user=Depends(require_user)):
    payload = body.model_dump(exclude_unset=True)
    room_arg = ...
    if "room" in payload:
        room_arg = payload.get("room")
    return db.upsert_metaverse_progress(
        int(user["id"]),
        world=payload.get("world"),
        room=room_arg,
        x=payload.get("x"),
        y=payload.get("y"),
        ry=payload.get("ry"),
        bone_score=payload.get("boneScore"),
        prefs=payload.get("prefs"),
    )


@app.get("/api/metaverse/avatar")
def get_metaverse_avatar(user=Depends(require_user)):
    wallet = db.get_avatar_wallet(int(user["id"]))
    return {
        "coins": wallet["coins"],
        "look": wallet["look"],
        "catalog": db.AVATAR_PARTS,
        "starterCoins": db.STARTER_COINS,
    }


@app.post("/api/metaverse/avatar")
async def post_metaverse_avatar(body: MetaverseAvatarBody, user=Depends(require_user)):
    result = db.buy_avatar_look(
        int(user["id"]),
        {
            "skin": body.skin,
            "hair": body.hair,
            "shirt": body.shirt,
            "hat": body.hat,
        },
    )
    if not result.get("ok"):
        raise HTTPException(
            status_code=400,
            detail=result.get("detail") or "No tienes suficientes coins",
        )
    email = str(user["email"]).strip().lower()
    look = result["look"]
    world = None
    async with metaverse_room._lock:
        cur = metaverse_room.clients.get(email)
        if cur:
            cur["look"] = look
            world = cur.get("world") or "plaza"
    if world:
        await metaverse_room.broadcast(
            {
                "type": "look",
                "email": email,
                "name": user["name"],
                "look": look,
            },
            world=world,
        )
    return result



@app.on_event("startup")
def _refresh_lan_ip_file() -> None:
    """Best-effort: keep data/lan-ip.txt populated for Mando Pro panel."""
    try:
        path = FsPath("data/lan-ip.txt")
        path.parent.mkdir(parents=True, exist_ok=True)
        existing = ""
        if path.is_file():
            lines = (path.read_text(encoding="utf-8", errors="ignore") or "").strip().splitlines()
            existing = lines[0].strip() if lines else ""
        # Prefer an existing host-written 192.168.* over rediscovery inside the container.
        if existing.startswith("192.168."):
            return
        ips = _discover_lan_ips()
        if not ips:
            return
        primary = ips[0]
        if existing and existing == primary:
            return
        path.write_text(primary + "\n", encoding="utf-8")
    except Exception:
        pass


def _mando_pro_issue_for_user(user: dict[str, Any], request: Request | None = None) -> dict[str, Any]:
    """Create/refresh a Mando Pro pair code for an authenticated user."""
    _mando_pro_purge()
    email = str(user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Sin email")
    old = _MANDO_PRO_BY_EMAIL.get(email)
    if old and old in _MANDO_PRO_PAIRS:
        _MANDO_PRO_PAIRS.pop(old, None)
    code = _mando_pro_make_code()
    exp = time.time() + 3600 * 6
    _MANDO_PRO_PAIRS[code] = {
        "email": email,
        "name": user.get("name") or email.split("@")[0],
        "avatar": user.get("avatar") or "✨",
        "exp": exp,
        "created": time.time(),
    }
    _MANDO_PRO_BY_EMAIL[email] = code

    urls: list[str] = []
    if request is not None:
        host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
        proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "http").split(",")[0].strip()
        if host:
            urls.append(f"{proto}://{host}/mando-pro?code={code}")
    lan_ips = _discover_lan_ips()[:6]
    lan_port = int(os.environ.get("SNAKEOS_LAN_PORT") or "8987")
    for ip in lan_ips:
        u = f"http://{ip}:{lan_port}/mando-pro?code={code}"
        if u not in urls:
            urls.append(u)
    return {
        "code": code,
        "expiresIn": 3600 * 6,
        "urls": urls,
        "path": f"/mando-pro?code={code}",
        "lanIps": lan_ips,
        "lanPort": lan_port,
        "primaryIp": lan_ips[0] if lan_ips else None,
        "effects": sorted(_MANDO_PRO_EFFECTS),
    }

@app.get("/browser-google-done")
def browser_google_done():
    """Callback tras login de Google en el Navegador (ventana 2 → vuelve a Snake OS)."""
    return FileResponse("browser-google-done.html")


@app.get("/mando-pro")
def mando_pro_page():
    """Phone/tablet Mando Pro controller (no player movement — only extra FX)."""
    return FileResponse(
        "mando-pro.html",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Pragma": "no-cache",
        },
    )


@app.get("/pro")
def snake_os_pro_page():
    return FileResponse("snake-os-pro.html", media_type="text/html; charset=utf-8",
                        headers={"Cache-Control": "no-cache", "CDN-Cache-Control": "no-cache"})


@app.post("/api/metaverse/mando-pro/pair")
def mando_pro_pair(request: Request, user=Depends(require_user)):
    """Desktop Metaverse creates/refreshes a pair code + URLs for the phone page."""
    return _mando_pro_issue_for_user(user, request)


@app.get("/api/metaverse/mando-pro/pair")
def mando_pro_pair_get(user=Depends(require_user)):
    _mando_pro_purge()
    email = str(user.get("email") or "").strip().lower()
    code = _MANDO_PRO_BY_EMAIL.get(email)
    if not code or code not in _MANDO_PRO_PAIRS:
        return {"code": None, "active": False}
    row = _MANDO_PRO_PAIRS[code]
    return {
        "code": code,
        "active": True,
        "expiresIn": max(0, int(float(row.get("exp") or 0) - time.time())),
        "path": f"/mando-pro?code={code}",
    }


@app.websocket("/api/metaverse/mando-ws")
async def metaverse_mando_ws(websocket: WebSocket, code: str = ""):
    """Controller socket authenticated only by pair code (no OS login on the phone)."""
    await websocket.accept()
    if not await _i9_ws_enter(websocket):
        return
    _mando_pro_purge()
    raw = (code or websocket.query_params.get("code") or "").strip().upper()
    row = _MANDO_PRO_PAIRS.get(raw)
    if not row:
        try:
            await websocket.send_text(json.dumps({"type": "error", "detail": "Código inválido o caducado"}))
        except Exception:
            pass
        await _ws_close_quiet(websocket, 4401)
        _i9_untrack(websocket)
        return
    email = str(row.get("email") or "")
    name = str(row.get("name") or email)
    avatar = str(row.get("avatar") or "✨")
    try:
        await websocket.send_text(
            json.dumps(
                {
                    "type": "welcome",
                    "email": email,
                    "name": name,
                    "effects": sorted(_MANDO_PRO_EFFECTS),
                },
                ensure_ascii=False,
            )
        )
    except Exception:
        await websocket.close()
        return

    try:
        while True:
            raw_msg = await websocket.receive_text()
            try:
                msg = json.loads(raw_msg)
            except json.JSONDecodeError:
                continue
            if not isinstance(msg, dict):
                continue
            mtype = msg.get("type")
            if mtype == "ping":
                await websocket.send_text(json.dumps({"type": "pong", "t": msg.get("t")}))
                continue
            if mtype != "pro":
                continue
            effect = str(msg.get("effect") or "").strip().lower()[:32]
            if effect not in _MANDO_PRO_EFFECTS:
                await websocket.send_text(
                    json.dumps({"type": "error", "detail": "Efecto no permitido"})
                )
                continue
            # Player must be online in Metaverse
            cur_world = None
            async with metaverse_room._lock:
                cur = metaverse_room.clients.get(email)
                if cur:
                    cur_world = cur.get("world") or "plaza"
            if not cur_world:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "error",
                            "detail": "Abre el Metaverso en el ordenador primero",
                        }
                    )
                )
                continue
            payload = {
                "type": "mando_pro",
                "effect": effect,
                "email": email,
                "name": name,
                "avatar": avatar,
                "label": _MANDO_PRO_LABELS.get(effect, effect),
            }
            await metaverse_room.broadcast(payload, world=cur_world)
            await websocket.send_text(
                json.dumps({"type": "ack", "effect": effect, "label": payload["label"]})
            )
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            print(f"[mando-pro] error {email}: {exc!r}", flush=True)
        except Exception:
            pass
    finally:
        _i9_untrack(websocket)
        try:
            await websocket.close()
        except Exception:
            pass


# email → id de cuenta de los jugadores conectados (solo para la insignia PRO pública)
_MV_UID: dict[str, int] = {}


@app.websocket("/api/metaverse/ws")
async def metaverse_ws(websocket: WebSocket):
    await websocket.accept()
    if not await _i9_ws_enter(websocket):
        return
    sid = websocket.cookies.get(COOKIE_NAME)
    user_row = user_from_session(sid)
    if not user_row:
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "detail": "No autenticado"}, ensure_ascii=False)
            )
        except Exception:
            pass
        await _ws_close_quiet(websocket, 4401)
        _i9_untrack(websocket)
        return

    pub = db.user_public(user_row)
    email = str(pub["email"]).strip().lower()
    uid = int(user_row["id"])
    _kp = osx_extras.kids_policy(uid)
    if _kp is not None and _kp["online"] != "allow":
        osx_extras.log_blocked(uid, "online", "Metaverse")
        try:
            await websocket.send_text(json.dumps({"type": "error", "detail": "Snake OS Kids: el Metaverse es un mundo abierto y está bloqueado"}, ensure_ascii=False))
        except Exception:
            pass
        await _ws_close_quiet(websocket, 4403)
        _i9_untrack(websocket)
        return
    progress = db.get_metaverse_progress(uid)
    avatar_wallet = db.get_avatar_wallet(uid)
    q_world = websocket.query_params.get("world")
    if q_world:
        join_world = MetaverseRoom.normalize_world(q_world)
    else:
        join_world = MetaverseRoom.normalize_world(progress.get("world") or "plaza")
    _MV_UID[email] = uid
    await metaverse_room.connect(email, pub, websocket, world=join_world)

    # Restore pose / score / room from persisted progress (skip pose if reconnecting live)
    async with metaverse_room._lock:
        me_c = metaverse_room.clients.get(email)
        if me_c:
            had_live = bool(me_c.pop("_had_live", False))
            if not had_live:
                try:
                    me_c["x"] = max(20.0, min(780.0, float(progress.get("x", me_c["x"]))))
                    me_c["y"] = max(20.0, min(780.0, float(progress.get("y", me_c["y"]))))
                    me_c["ry"] = float(progress.get("ry", me_c.get("ry") or 0) or 0)
                except (TypeError, ValueError):
                    pass
                saved_room = progress.get("room")
                if saved_room and MetaverseRoom.room_world(str(saved_room)) == join_world:
                    me_c["room"] = str(saved_room)
                else:
                    me_c["room"] = None
            me_c["score"] = max(int(me_c.get("score") or 0), int(progress.get("boneScore") or 0))
            me_c["look"] = avatar_wallet["look"]

    history = db.list_metaverse_messages(
        user_email=email, peer_email=None, world=join_world, limit=50
    )
    me = metaverse_room.clients[email]
    bones = metaverse_room.ensure_bones(join_world)
    welcome = {
        "type": "welcome",
        "world": join_world,
        "you": {
            "email": email,
            "name": pub["name"],
            "avatar": pub["avatar"],
            "x": me["x"],
            "y": me["y"],
            "ry": me["ry"],
            "world": join_world,
            "room": me.get("room"),
            "score": me.get("score", 0),
            "coins": avatar_wallet["coins"],
            "look": avatar_wallet["look"],
        },
        "players": metaverse_room.snapshot_players(join_world),
        "history": _mv_tag_pro(history),
        "bones": bones,
        "progress": progress,
        "party": _metaverse_party_on(),
    }
    await websocket.send_text(json.dumps(welcome, ensure_ascii=False))
    try:
        await metaverse_room.broadcast(
            {
                "type": "join",
                "player": {
                    "email": email,
                    "name": pub["name"],
                    "avatar": pub["avatar"],
                    "x": me["x"],
                    "y": me["y"],
                    "z": 0.0,
                    "ry": me["ry"],
                    "world": join_world,
                    "room": me.get("room"),
                    "voice": bool(me.get("voice")),
                    "look": avatar_wallet["look"],
                    "pro": db.pro_flag(_MV_UID.get(email)),
                },
            },
            skip=email,
            world=join_world,
        )
    except Exception as join_exc:
        print(f"[metaverse-ws] join broadcast failed {email}: {join_exc!r}", flush=True)

    try:
        while True:
            # Otra pestaña nos sustituyó (connect cerró este socket) o el barrido lo cerró:
            # salir sin llamar a receive sobre un socket ya cerrado.
            if not _ws_is_open(websocket):
                break
            try:
                raw = await websocket.receive_text()
            except RuntimeError:
                # Starlette: 'WebSocket is not connected. Need to call "accept" first.'
                break
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(msg, dict):
                continue
            mtype = msg.get("type")
            # Keepalive first so heartbeats never wait behind SQLite writes.
            if mtype == "ping":
                await websocket.send_text(json.dumps({"type": "pong", "t": msg.get("t")}))
                continue
            if mtype == "pong":
                continue
            if mtype == "mando_pair":
                # Issue pair code over the already-authenticated Metaverse socket
                # (avoids HTTP 401 when the session cookie is missing on fetch).
                try:
                    pair = _mando_pro_issue_for_user(pub, None)
                    # Prefer the Host the browser used for this WS, if present
                    try:
                        whost = (websocket.headers.get("host") or "").split(",")[0].strip()
                        wproto = "https" if (websocket.url.scheme == "wss") else "http"
                        # Also honor forwarded proto/host from tunnel
                        whost = (websocket.headers.get("x-forwarded-host") or whost).split(",")[0].strip()
                        wproto = (websocket.headers.get("x-forwarded-proto") or wproto).split(",")[0].strip()
                        if whost:
                            page = f"{wproto}://{whost}/mando-pro?code={pair['code']}"
                            urls = list(pair.get("urls") or [])
                            if page not in urls:
                                urls.insert(0, page)
                            pair["urls"] = urls
                    except Exception:
                        pass
                    await websocket.send_text(
                        json.dumps({"type": "mando_pair_ok", **pair}, ensure_ascii=False)
                    )
                except Exception as pair_exc:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "mando_pair_err",
                                "detail": str(getattr(pair_exc, "detail", None) or pair_exc),
                            },
                            ensure_ascii=False,
                        )
                    )
                continue
            if mtype == "move":
                try:
                    pose = await metaverse_room.update_pose(
                        email,
                        float(msg.get("x", 400)),
                        float(msg.get("y", 400)),
                        float(msg.get("z", 0)),
                        float(msg.get("ry", 0)),
                        world=msg.get("world"),
                        room=msg.get("room") if "room" in msg else None,
                        arm=msg.get("arm") if isinstance(msg.get("arm"), dict) else None,
                    )
                except (TypeError, ValueError):
                    continue
                if pose:
                    await metaverse_room.broadcast(
                        {"type": "move", **pose},
                        skip=email,
                        world=pose.get("world"),
                    )
            elif mtype == "set_world":
                try:
                    nx = float(msg["x"]) if msg.get("x") is not None else None
                    ny = float(msg["y"]) if msg.get("y") is not None else None
                    nry = float(msg["ry"]) if msg.get("ry") is not None else None
                except (TypeError, ValueError):
                    continue
                old_world, snap = await metaverse_room.set_world(
                    email,
                    str(msg.get("world") or "plaza"),
                    x=nx,
                    y=ny,
                    ry=nry,
                )
                if not snap:
                    continue
                new_world = snap["world"]
                if old_world and old_world != new_world:
                    await metaverse_room.broadcast(
                        {"type": "leave", "email": email},
                        world=old_world,
                    )
                await metaverse_room.broadcast(
                    {"type": "join", "player": snap},
                    skip=email,
                    world=new_world,
                )
                hist = db.list_metaverse_messages(
                    user_email=email,
                    peer_email=None,
                    world=new_world,
                    limit=50,
                )
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "world_players",
                            "world": new_world,
                            "players": metaverse_room.snapshot_players(new_world),
                            "history": _mv_tag_pro(hist),
                            "bones": metaverse_room.ensure_bones(new_world),
                            "party": _metaverse_party_on(),
                        },
                        ensure_ascii=False,
                    )
                )
                await metaverse_room.persist_client_progress(email)
            elif mtype == "enter_room":
                room_id = msg.get("room")
                snap = await metaverse_room.set_room(
                    email, str(room_id) if room_id else None
                )
                if snap:
                    await metaverse_room.broadcast(
                        {"type": "move", **snap},
                        skip=email,
                        world=snap.get("world"),
                    )
                    await metaverse_room.persist_client_progress(email)
            elif mtype == "save_progress":
                try:
                    nx = float(msg["x"]) if msg.get("x") is not None else None
                    ny = float(msg["y"]) if msg.get("y") is not None else None
                    nry = float(msg["ry"]) if msg.get("ry") is not None else None
                except (TypeError, ValueError):
                    nx = ny = nry = None
                if any(v is not None for v in (nx, ny, nry)) or msg.get("world") or ("room" in msg):
                    cur_x, cur_y, cur_ry = 400.0, 400.0, 0.0
                    async with metaverse_room._lock:
                        cur = metaverse_room.clients.get(email)
                        if cur:
                            cur_x = float(cur.get("x") or 400)
                            cur_y = float(cur.get("y") or 400)
                            cur_ry = float(cur.get("ry") or 0)
                    await metaverse_room.update_pose(
                        email,
                        float(nx if nx is not None else cur_x),
                        float(ny if ny is not None else cur_y),
                        0.0,
                        float(nry if nry is not None else cur_ry),
                        world=msg.get("world"),
                        room=msg.get("room") if "room" in msg else None,
                    )
                if msg.get("score") is not None:
                    try:
                        sc = int(msg["score"])
                        async with metaverse_room._lock:
                            cur = metaverse_room.clients.get(email)
                            if cur:
                                cur["score"] = sc
                    except (TypeError, ValueError):
                        pass
                prefs = msg.get("prefs") if isinstance(msg.get("prefs"), dict) else None
                try:
                    await metaverse_room.persist_client_progress(email)
                    if prefs is not None:
                        db.upsert_metaverse_progress(
                            uid,
                            prefs=prefs,
                        )
                except Exception:
                    pass
            elif mtype == "chat":
                text = str(msg.get("text") or "").strip()
                if not text or len(text) > 500:
                    continue
                to_raw = msg.get("to")
                to_email = None
                if to_raw:
                    to_email = str(to_raw).strip().lower()
                    if to_email == email:
                        continue
                cur_world = "plaza"
                async with metaverse_room._lock:
                    cur = metaverse_room.clients.get(email)
                    if cur:
                        cur_world = cur.get("world") or "plaza"
                if msg.get("world"):
                    cur_world = MetaverseRoom.normalize_world(str(msg.get("world")))
                ts = time_mod.time()
                saved = db.save_metaverse_message(
                    from_email=email,
                    from_name=str(pub["name"]),
                    to_email=to_email,
                    text=text,
                    created_at=ts,
                    world=(None if to_email else cur_world),
                )
                payload = {"type": "chat", **saved, "from_pro": db.pro_flag(uid)}
                if to_email is None:
                    await metaverse_room.broadcast(payload, world=cur_world)
                    if _metaverse_ai_bots is not None:
                        # Bots may answer nearby players; runs apart so the socket never waits.
                        asyncio.create_task(
                            _metaverse_ai_bots.on_player_chat(cur_world, email, str(pub["name"]), text)
                        )
                else:
                    await metaverse_room.send_to(email, payload)
                    await metaverse_room.send_to(to_email, payload)
            elif mtype == "emote":
                emoji = str(msg.get("emoji") or "")[:8]
                if not emoji:
                    continue
                cur_world = "plaza"
                async with metaverse_room._lock:
                    cur = metaverse_room.clients.get(email)
                    if cur:
                        cur["emote"] = emoji
                        cur_world = cur.get("world") or "plaza"
                await metaverse_room.broadcast(
                    {
                        "type": "emote",
                        "email": email,
                        "name": pub["name"],
                        "emoji": emoji,
                    },
                    world=cur_world,
                )
            elif mtype == "collect":
                bone_id = str(msg.get("id") or "")
                if not bone_id:
                    continue
                result = await metaverse_room.collect_bone(email, bone_id)
                if result:
                    try:
                        result["coins"] = int(db.add_user_coins(uid, 1))
                    except Exception:
                        try:
                            result["coins"] = int(db.get_avatar_wallet(uid)["coins"])
                        except Exception:
                            pass
                    await metaverse_room.broadcast(
                        {"type": "bone_collected", **result},
                        world=result["world"],
                    )

            elif mtype == "fun":
                effect = str(msg.get("effect") or "")[:32]
                if not effect:
                    continue
                cur_world = "plaza"
                async with metaverse_room._lock:
                    cur = metaverse_room.clients.get(email)
                    if cur:
                        cur_world = cur.get("world") or "plaza"
                await metaverse_room.broadcast(
                    {
                        "type": "fun",
                        "effect": effect,
                        "email": email,
                        "name": pub["name"],
                        "avatar": pub.get("avatar") or "✨",
                        "payload": msg.get("payload") if isinstance(msg.get("payload"), dict) else {},
                    },
                    world=cur_world,
                )
            elif mtype == "highfive":
                peer = str(msg.get("to") or "").strip().lower()
                if not peer or peer == email:
                    continue
                cur_world = "plaza"
                ok = False
                async with metaverse_room._lock:
                    me_c = metaverse_room.clients.get(email)
                    pe_c = metaverse_room.clients.get(peer)
                    if me_c and pe_c:
                        cur_world = me_c.get("world") or "plaza"
                        if (me_c.get("world") or "plaza") == (pe_c.get("world") or "plaza"):
                            if abs(me_c["x"] - pe_c["x"]) <= 50 and abs(me_c["y"] - pe_c["y"]) <= 50:
                                ok = True
                if ok:
                    await metaverse_room.broadcast(
                        {
                            "type": "highfive",
                            "a": email,
                            "b": peer,
                            "a_name": pub["name"],
                        },
                        world=cur_world,
                    )

            elif mtype == "voice_state":
                if email.startswith("ai-bot:"):
                    continue
                on = bool(msg.get("on"))
                cur_world = "plaza"
                cur_room = None
                async with metaverse_room._lock:
                    cur = metaverse_room.clients.get(email)
                    if not cur:
                        continue
                    cur["voice"] = on
                    cur_world = cur.get("world") or "plaza"
                    cur_room = cur.get("room")
                await metaverse_room.broadcast(
                    {
                        "type": "voice_state",
                        "email": email,
                        "name": pub["name"],
                        "on": on,
                        "world": cur_world,
                        "room": cur_room,
                    },
                    world=cur_world,
                )
            elif mtype == "voice_signal":
                if email.startswith("ai-bot:"):
                    continue
                to = str(msg.get("to") or "").strip().lower()
                signal = msg.get("signal")
                if not to or to == email or not isinstance(signal, dict):
                    continue
                ok = False
                async with metaverse_room._lock:
                    me_c = metaverse_room.clients.get(email)
                    pe_c = metaverse_room.clients.get(to)
                    if me_c and pe_c and metaverse_room._same_voice_space(me_c, pe_c):
                        ok = True
                if ok:
                    await metaverse_room.send_to(
                        to,
                        {
                            "type": "voice_signal",
                            "from": email,
                            "from_name": pub["name"],
                            "signal": signal,
                        },
                    )
            elif mtype == "voice_pcm":
                if email.startswith("ai-bot:"):
                    continue
                pcm = msg.get("pcm")
                if not isinstance(pcm, str) or not pcm or len(pcm) > 12000:
                    continue
                targets: list[str] = []
                async with metaverse_room._lock:
                    me_c = metaverse_room.clients.get(email)
                    if not me_c or not me_c.get("voice"):
                        continue
                    for em, peer in metaverse_room.clients.items():
                        if em == email:
                            continue
                        # Mic off still receives the relay. voice flag means transmitting only.
                        if metaverse_room._same_voice_space(me_c, peer):
                            targets.append(em)
                payload = {
                    "type": "voice_pcm",
                    "from": email,
                    "rate": _safe_int(msg.get("rate"), 16000),
                    "pcm": pcm,
                }
                for em in targets:
                    await metaverse_room.send_to(em, payload)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            print(f"[metaverse-ws] error {email}: {exc!r}", flush=True)
        except Exception:
            pass
    finally:
        _i9_untrack(websocket)
        try:
            await metaverse_room.persist_client_progress(email)
        except Exception:
            pass
        left = await metaverse_room.disconnect(email, websocket)
        if left:
            if left.get("voice"):
                await metaverse_room.broadcast(
                    {
                        "type": "voice_state",
                        "email": email,
                        "name": left.get("name") or email,
                        "on": False,
                        "world": left.get("world"),
                        "room": left.get("room"),
                    },
                    world=left.get("world"),
                )
            await metaverse_room.broadcast(
                {"type": "leave", "email": email},
                world=left.get("world"),
            )


import snake_racing


@app.websocket("/api/snake-racing/ws")
async def snake_racing_ws(websocket: WebSocket):
    await websocket.accept()
    sid = websocket.cookies.get(COOKIE_NAME)
    user_row = user_from_session(sid)
    if not user_row:
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "detail": "Inicia sesión para jugar"}, ensure_ascii=False)
            )
        except Exception:
            pass
        await _ws_close_quiet(websocket, 4401)
        return
    pub = db.user_public(user_row)
    email = str(pub["email"]).strip().lower()
    name = str(pub.get("name") or email.split("@")[0])
    _kp = osx_extras.kids_policy(int(user_row["id"]))
    kid_friends = None
    if _kp is not None and _kp["online"] != "allow":
        kid_friends = set(_kp["friends"]) | {email}
        others = {p["email"] for p in snake_racing.racing_hub.players.values()}
        if _kp["online"] == "block" or not others <= kid_friends:
            osx_extras.log_blocked(int(user_row["id"]), "online", "Snake Racing online")
            try:
                await websocket.send_text(json.dumps({"type": "error", "detail": "Snake OS Kids: el juego online está bloqueado" if _kp["online"] == "block" else "Snake OS Kids: en la sala hay pilotos que no son amigos aprobados"}, ensure_ascii=False))
            except Exception:
                pass
            await _ws_close_quiet(websocket, 4403)
            return
    await snake_racing.racing_hub.connect(websocket, email, name, kid_friends=kid_friends, pro=db.pro_flag(user_row["id"]))
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(msg, dict):
                await snake_racing.racing_hub.handle(websocket, msg)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[snake-racing-ws] error {email}: {exc!r}", flush=True)
    finally:
        await snake_racing.racing_hub.disconnect(websocket)


class SnakeRacingCommentaryBody(BaseModel):
    kind: str = "ambient"
    facts: dict = Field(default_factory=dict)
    lang: str = "es"


_snake_racing_comm_last: dict[int, float] = {}


@app.get("/api/snake-racing/commentary")
def snake_racing_commentary_status(user=Depends(require_user)):
    return {"llm": bool(resolve_askbox_key(int(user["id"]))), "langs": ["es", "en"]}


@app.post("/api/snake-racing/commentary")
def snake_racing_commentary(body: SnakeRacingCommentaryBody, user=Depends(require_user)):
    """Comentario de ambiente / resumen final con LLM (Askbox). Si no hay clave o falla, ok=False y el cliente usa frases locales."""
    uid = int(user["id"])
    key = resolve_askbox_key(uid)
    if not key:
        return {"ok": False, "reason": "no_key"}
    kind = "summary" if body.kind == "summary" else "ambient"
    now = time.time()
    if kind == "ambient" and now - _snake_racing_comm_last.get(uid, 0) < 6:
        return {"ok": False, "reason": "throttled"}
    _snake_racing_comm_last[uid] = now
    facts = json.dumps(body.facts, ensure_ascii=False)[:1800]
    en = (body.lang or "es").strip().lower()[:2] == "en"
    if en and kind == "summary":
        prompt = "Summarise the race in 2-3 exciting sentences and give the player (You / \"Tú\") one concrete tip. Data: " + facts
        max_tok = 220
    elif en:
        prompt = "Give ONE short line (max 20 words) of ambient race commentary, mentioning the name and colour of some car. Current data: " + facts
        max_tok = 80
    elif kind == "summary":
        prompt = "Resume en 2-3 frases emocionantes la carrera y da un consejo concreto al jugador (Tú). Datos: " + facts
        max_tok = 220
    else:
        prompt = "Da UNA frase corta (max 20 palabras) de comentario de ambiente, mencionando nombre y color de algún coche. Datos actuales: " + facts
        max_tok = 80
    try:
        result = askbox_client.ask(
            prompt,
            system=("You are an energetic, concise English-speaking race commentator. Reply in natural English with only the text to be spoken, no quotes."
                    if en else
                    "Eres un comentarista de carreras español, enérgico y breve. Responde solo con el texto a locutar, sin comillas."),
            tier="fast", max_output_tokens=max_tok, api_key=key,
        )
    except AskboxError as exc:
        return {"ok": False, "reason": exc.code or "error"}
    except Exception:
        return {"ok": False, "reason": "error"}
    text = (result.get("text") or "").strip().strip(chr(34))[:400]
    return {"ok": bool(text), "text": text}


# ===== LOS SNAKES (simulador de vida) =====

class LosSnakesAIBody(BaseModel):
    kind: str = "thought"
    facts: dict = Field(default_factory=dict)


_los_snakes_ai_last: dict[int, float] = {}
_LOS_SNAKES_DIR = FsPath(os.path.dirname(os.path.abspath(__file__))) / "data" / "los-snakes"


@app.get("/api/los-snakes/ai")
def los_snakes_ai_status(user=Depends(require_user)):
    return {"llm": bool(resolve_askbox_key(int(user["id"])))}


@app.post("/api/los-snakes/ai")
def los_snakes_ai(body: LosSnakesAIBody, user=Depends(require_user)):
    """Pensamientos cortos y entradas de diario con LLM (Askbox). Sin clave o si falla: ok=False y el cliente usa frases locales."""
    uid = int(user["id"])
    key = resolve_askbox_key(uid)
    if not key:
        return {"ok": False, "reason": "no_key"}
    now = time.time()
    if now - _los_snakes_ai_last.get(uid, 0) < 2.5:
        return {"ok": False, "reason": "throttled"}
    _los_snakes_ai_last[uid] = now
    facts = json.dumps(body.facts, ensure_ascii=False)[:1500]
    if body.kind == "diary":
        prompt = "Escribe la entrada de diario de hoy (2-3 frases, primera persona, tono tierno y gracioso) de esta serpiente. Datos: " + facts
        max_tok = 200
    else:
        prompt = "Escribe UN pensamiento muy corto (máximo 12 palabras, primera persona) de esta serpiente según su personalidad y situación. Datos: " + facts
        max_tok = 60
    try:
        result = askbox_client.ask(
            prompt,
            system=("Eres el narrador de 'Los Snakes', un simulador de vida de serpientes que parodia a Los Sims. "
                    "Escribe en español de España, con humor amable y juegos de palabras de serpientes. Responde solo con el texto, sin comillas."),
            tier="fast", max_output_tokens=max_tok, api_key=key,
        )
    except AskboxError as exc:
        return {"ok": False, "reason": exc.code or "error"}
    except Exception:
        return {"ok": False, "reason": "error"}
    text = (result.get("text") or "").strip().strip(chr(34))[:500]
    return {"ok": bool(text), "text": text}


@app.get("/api/los-snakes/save")
def los_snakes_load(user=Depends(require_user)):
    path = _LOS_SNAKES_DIR / f"{int(user['id'])}.json"
    if not path.is_file():
        return {"ok": False}
    try:
        return {"ok": True, "save": json.loads(path.read_text("utf-8"))}
    except Exception:
        return {"ok": False}


@app.put("/api/los-snakes/save")
async def los_snakes_save(request: Request, user=Depends(require_user)):
    raw = await request.body()
    if len(raw) > 800_000:
        raise HTTPException(status_code=413, detail="Partida demasiado grande")
    try:
        data = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido")
    if not isinstance(data, dict) or "S" not in data or not isinstance(data.get("S"), dict):
        raise HTTPException(status_code=400, detail="Formato inválido")
    st = data["S"]
    # 2026.13: nunca se guarda como «casa» el estado de una visita (casa del amigo + una sola serpiente);
    # eso hacía que la familia volviera de la visita con un solo miembro.
    if st.get("visit") is True or st.get("hosts") or (isinstance(st.get("nid"), (int, float)) and st.get("nid") >= 9e11):
        raise HTTPException(status_code=409, detail="No se guarda el estado de una visita")
    _LOS_SNAKES_DIR.mkdir(parents=True, exist_ok=True)
    path = _LOS_SNAKES_DIR / f"{int(user['id'])}.json"
    # copia diaria de la partida anterior (se guardan 7) para poder recuperar una familia si algo falla
    try:
        if path.is_file():
            bak = _LOS_SNAKES_DIR / f"{int(user['id'])}.bak-{time.strftime('%Y%m%d')}.json"
            if not bak.exists():
                bak.write_bytes(path.read_bytes())
                olds = sorted(_LOS_SNAKES_DIR.glob(f"{int(user['id'])}.bak-*.json"))
                for o in olds[:-7]:
                    o.unlink(missing_ok=True)
    except Exception:
        pass
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
    tmp.replace(path)
    return {"ok": True}


# --- Los Snakes: visitas entre amigos (cuentas añadidas), buzón y visita en vivo ---
_LS_GIFTS = {"flores": 30, "raton": 40, "planta": 80, "lampara": 120, "arbol": 180, "sobre": 200, "piedra": 300, "radio": 300}
_LS_NOTES = [
    "¡Qué casa tan bonita! 🏡",
    "Gracias por dejarme pasar, me lo he pasado genial. 🐍",
    "¡Tu sofá es comodísimo! 🛋️",
    "Volveré pronto. ¡Sssaludos! 👋",
    "Te dejo un regalito. 🎁",
    "¡Feliz día! ☀️",
]
_ls_lock = threading.Lock()
_LS_HOST_BASE = 1_000_000_000_000
_LS_GUEST_BASE = 2_000_000_000_000


def _ls_social_path(uid: int) -> FsPath:
    return _LOS_SNAKES_DIR / f"{int(uid)}.social.json"


def _ls_social_load(uid: int) -> dict:
    data: dict = {}
    path = _ls_social_path(uid)
    if path.is_file():
        try:
            data = json.loads(path.read_text("utf-8")) or {}
        except Exception:
            data = {}
    if data.get("allow") not in ("friends", "off"):
        data["allow"] = "friends"
    if not isinstance(data.get("mail"), list):
        data["mail"] = []
    if not isinstance(data.get("seen"), dict):
        data["seen"] = {}
    return data


def _ls_social_store(uid: int, data: dict) -> None:
    _LOS_SNAKES_DIR.mkdir(parents=True, exist_ok=True)
    path = _ls_social_path(uid)
    tmp = path.with_suffix(".stmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
    tmp.replace(path)


def _ls_game(uid: int) -> dict | None:
    path = _LOS_SNAKES_DIR / f"{int(uid)}.json"
    if not path.is_file():
        return None
    try:
        sv = json.loads(path.read_text("utf-8"))
        st = sv.get("S") if isinstance(sv, dict) else None
        return st if isinstance(st, dict) and isinstance(st.get("snakes"), list) else None
    except Exception:
        return None


def _ls_kids(uid: int):
    """Política de Snake OS Kids (osx_extras) si existe en esta versión; si no, None."""
    try:
        import osx_extras as _ox  # rama feature/snakeos-oct17
        return _ox.kids_policy(int(uid))
    except Exception:
        return None


def _ls_kids_log(uid: int, detail: str) -> None:
    try:
        import osx_extras as _ox
        _ox.log_blocked(int(uid), "online", detail[:120])
    except Exception:
        pass


def _ls_email(row) -> str:
    try:
        return str(row["email"] or "").strip().lower()
    except Exception:
        return ""


def _ls_check_visit(me_id: int, host_id: int) -> tuple[bool, str]:
    """¿Puede me_id visitar (o escribir en el buzón de) host_id? Devuelve (ok, motivo)."""
    me_id, host_id = int(me_id), int(host_id)
    if me_id == host_id:
        return False, "No puedes visitarte a ti mismo."
    host = db.get_user_by_id(host_id)
    me_row = db.get_user_by_id(me_id)
    if not host or not me_row:
        return False, "Esa cuenta no existe."
    if not added_accounts.has(me_id, host_id):
        return False, "Solo puedes visitar a tus amigos (cuentas añadidas en Chat/Teléfono)."
    kp = _ls_kids(me_id)
    if kp is not None and kp.get("online") != "allow":
        if kp.get("online") == "block" or _ls_email(host) not in set(kp.get("friends") or []):
            _ls_kids_log(me_id, "Los Snakes: visita a " + _ls_email(host))
            return False, ("Snake OS Kids: las visitas online están bloqueadas." if kp.get("online") == "block"
                           else "Snake OS Kids: solo puedes visitar a amigos aprobados por un adulto.")
    hk = _ls_kids(host_id)
    if hk is not None and hk.get("online") != "allow":
        if hk.get("online") == "block" or _ls_email(me_row) not in set(hk.get("friends") or []):
            return False, "Ahora mismo no acepta visitas."
    if _ls_social_load(host_id).get("allow") == "off":
        return False, "Tiene las visitas desactivadas."
    if _ls_game(host_id) is None:
        return False, "Aún no ha empezado su partida de Los Snakes."
    return True, ""


def _ls_family(st: dict) -> dict:
    objs = [o for o in (st.get("objects") or []) if isinstance(o, dict) and o.get("t") not in ("huevo", "piel", "hallazgo")]
    members = []
    for sn in (st.get("snakes") or [])[:8]:
        if isinstance(sn, dict):
            members.append({"name": str(sn.get("name") or "")[:16], "age": str(sn.get("age") or "adulto")[:8],
                            "color": str(sn.get("color") or "#3498db")[:9], "pattern": str(sn.get("pattern") or "lisa")[:12]})
    try:
        day = int(float(st.get("time") or 0) // 1440) + 1
    except Exception:
        day = 1
    return {"name": str(st.get("name") or "")[:18], "members": members, "objects": len(objs), "day": day,
            "world": {"objects": [{k: o.get(k) for k in ("id", "t", "x", "y", "r", "col") if k in o} for o in objs][:120],
                      "floor": (st.get("floor") or [])[:400], "walls": (st.get("walls") or [])[:200],
                      "doors": (st.get("doors") or [])[:40], "wallc": st.get("wallc") if isinstance(st.get("wallc"), dict) else {}}}


def _ls_clean(v, depth: int = 0):
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, (int, float)):
        return v if math.isfinite(float(v)) else 0
    if isinstance(v, str):
        return v[:140]
    if depth >= 3:
        return None
    if isinstance(v, list):
        return [_ls_clean(x, depth + 1) for x in v[:12]]
    if isinstance(v, dict):
        return {str(k)[:12]: _ls_clean(x, depth + 1) for k, x in list(v.items())[:24]}
    return None


async def _ls_notify(to_id: int, title: str, body: str) -> None:
    try:
        notif = db.create_notification(user_id=int(to_id), kind="los_snakes", title=title[:200], body=body[:500],
                                       data={"app": "los-snakes"}, created_at=time.time())
        unread = db.count_unread_notifications(user_id=int(to_id))
        await chat_hub.send_to_user(int(to_id), {"type": "notification", "notification": notif, "unread": unread})
        _queue_notif_push(int(to_id), notif)
    except Exception as exc:
        print(f"[los-snakes] notify {to_id}: {exc!r}", flush=True)


def _ls_add_mail(host_id: int, item: dict) -> None:
    with _ls_lock:
        soc = _ls_social_load(host_id)
        soc["mail"] = (soc["mail"] + [item])[-40:]
        _ls_social_store(host_id, soc)


_LS_PLACES = ("parque", "tienda", "cafeteria", "gimnasio")


def _ls_can_meet(a: int, b: int) -> bool:
    """¿Pueden verse dos jugadores en un lugar público del barrio? Solo amigos mutuos y respetando Snake OS Kids."""
    a, b = int(a), int(b)
    if a == b or not added_accounts.has(a, b) or not added_accounts.has(b, a):
        return False
    for me, other in ((a, b), (b, a)):
        kp = _ls_kids(me)
        if kp is not None and kp.get("online") != "allow":
            if kp.get("online") == "block":
                return False
            row = db.get_user_by_id(other)
            if not row or _ls_email(row) not in set(kp.get("friends") or []):
                return False
    return True


class _LosSnakesHub:
    """Presencia y visitas en vivo: el invitado envía su serpiente, el anfitrión el estado de su casa."""

    def __init__(self) -> None:
        self.conns: dict[int, set] = {}
        self.info: dict[Any, dict] = {}
        self.rooms: dict[int, dict[int, Any]] = {}
        self.places: dict[str, dict[int, Any]] = {}

    def place_of(self, uid: int) -> str | None:
        for ws in self.conns.get(int(uid), ()):
            pl = (self.info.get(ws) or {}).get("place")
            if pl:
                return pl
        return None

    async def place_leave(self, ws) -> None:
        inf = self.info.get(ws)
        if not inf or not inf.get("place"):
            return
        pl, uid = inf["place"], inf["uid"]
        inf["place"] = None
        room = self.places.get(pl)
        if room and room.get(uid) is ws:
            room.pop(uid, None)
            if not room:
                self.places.pop(pl, None)
            for ouid, ows in list((room or {}).items()):
                if _ls_can_meet(uid, ouid):
                    await self.send(ows, {"t": "pleave", "from": uid})

    def online(self, uid: int) -> bool:
        return bool(self.conns.get(int(uid)))

    async def send(self, ws, msg: dict) -> None:
        try:
            await ws.send_text(json.dumps(msg, ensure_ascii=False))
        except Exception:
            pass

    async def to_user(self, uid: int, msg: dict) -> None:
        for ws in list(self.conns.get(int(uid), ())):
            await self.send(ws, msg)

    async def connect(self, ws, uid: int, name: str) -> None:
        self.conns.setdefault(uid, set()).add(ws)
        self.info[ws] = {"uid": uid, "name": name, "visiting": None, "snake": None, "rate": [time.time(), 0]}
        await self.send(ws, {"t": "hello", "you": uid})
        room = self.rooms.get(uid) or {}
        for guid, gws in list(room.items()):
            gi = self.info.get(gws) or {}
            await self.send(ws, {"t": "guest_join", "from": guid, "name": gi.get("name"), "pro": db.pro_flag(guid), "snake": gi.get("snake")})
            await self.send(gws, {"t": "host_on"})

    async def leave(self, ws) -> None:
        inf = self.info.get(ws)
        if not inf or not inf.get("visiting"):
            return
        host, uid = int(inf["visiting"]), inf["uid"]
        inf["visiting"] = None
        room = self.rooms.get(host)
        if room and room.get(uid) is ws:
            room.pop(uid, None)
            if not room:
                self.rooms.pop(host, None)
            await self.to_user(host, {"t": "guest_leave", "from": uid})

    async def disconnect(self, ws) -> None:
        inf = self.info.get(ws)
        if not inf:
            return
        await self.leave(ws)
        await self.place_leave(ws)
        self.info.pop(ws, None)
        uid = inf["uid"]
        bucket = self.conns.get(uid)
        if bucket:
            bucket.discard(ws)
            if not bucket:
                self.conns.pop(uid, None)
                for gws in list((self.rooms.get(uid) or {}).values()):
                    await self.send(gws, {"t": "host_off"})

    async def handle(self, ws, msg: dict) -> None:
        inf = self.info.get(ws)
        if not inf:
            return
        now = time.time()
        rate = inf["rate"]
        if now - rate[0] > 1.0:
            rate[0], rate[1] = now, 0
        rate[1] += 1
        if rate[1] > 25:
            return
        uid, kind = inf["uid"], msg.get("t")
        if kind == "visit":
            try:
                host = int(msg.get("host"))
            except Exception:
                return
            ok, reason = _ls_check_visit(uid, host)
            if not ok:
                await self.send(ws, {"t": "visit_err", "detail": reason})
                return
            await self.leave(ws)
            room = self.rooms.setdefault(host, {})
            old = room.get(uid)
            if old is not None and old is not ws and old in self.info:
                self.info[old]["visiting"] = None
            inf["visiting"], inf["snake"] = host, _ls_clean(msg.get("snake"))
            room[uid] = ws
            await self.send(ws, {"t": "visit_ok", "host": host, "live": self.online(host)})
            await self.to_user(host, {"t": "guest_join", "from": uid, "name": inf["name"], "pro": db.pro_flag(uid), "snake": inf["snake"]})
        elif kind == "leave":
            await self.leave(ws)
        elif kind == "place":
            pl = str(msg.get("id") or "")
            if pl not in _LS_PLACES:
                return
            await self.leave(ws)
            await self.place_leave(ws)
            room = self.places.setdefault(pl, {})
            old = room.get(uid)
            if old is not None and old is not ws and old in self.info:
                self.info[old]["place"] = None
            inf["place"], inf["snake"] = pl, _ls_clean(msg.get("snake"))
            room[uid] = ws
            n = 0
            for ouid, ows in list(room.items()):
                if ouid == uid or not _ls_can_meet(uid, ouid):
                    continue
                oi = self.info.get(ows) or {}
                n += 1
                await self.send(ws, {"t": "pjoin", "from": ouid, "name": oi.get("name"), "pro": db.pro_flag(ouid), "snake": oi.get("snake"), "p": oi.get("pos")})
                await self.send(ows, {"t": "pjoin", "from": uid, "name": inf["name"], "pro": db.pro_flag(uid), "snake": inf["snake"]})
            await self.send(ws, {"t": "place_ok", "id": pl, "friends": n})
        elif kind == "pleave":
            await self.place_leave(ws)
        elif kind == "g" and inf.get("place"):
            st = _ls_clean(msg.get("s"))
            inf["pos"] = st
            data = {"t": "g", "from": uid, "s": st, "place": 1}
            for ouid, ows in list((self.places.get(inf["place"]) or {}).items()):
                if ouid != uid and _ls_can_meet(uid, ouid):
                    await self.send(ows, data)
        elif kind == "g" and inf.get("visiting"):
            await self.to_user(int(inf["visiting"]), {"t": "g", "from": uid, "s": _ls_clean(msg.get("s"))})
        elif kind == "h":
            data = {"t": "h", "s": _ls_clean(msg.get("s"))}
            for gws in list((self.rooms.get(uid) or {}).values()):
                await self.send(gws, data)
        elif kind == "soc":
            out = {"t": "soc", "from": uid, "id": str(msg.get("id") or "")[:12], "ok": bool(msg.get("ok")),
                   "hs": _ls_clean(msg.get("hs")), "gs": _ls_clean(msg.get("gs")), "by": str(msg.get("by") or "")[:6]}
            if inf.get("place"):
                try:
                    to = int(msg.get("to"))
                except Exception:
                    return
                tws = (self.places.get(inf["place"]) or {}).get(to)
                if tws is not None and _ls_can_meet(uid, to):
                    out["by"] = "p"
                    await self.send(tws, out)
            elif inf.get("visiting"):
                await self.to_user(int(inf["visiting"]), out)
            else:
                try:
                    to = int(msg.get("to"))
                except Exception:
                    return
                gws = (self.rooms.get(uid) or {}).get(to)
                if gws is not None:
                    await self.send(gws, out)


_ls_hub = _LosSnakesHub()


@app.websocket("/api/los-snakes/ws")
async def los_snakes_ws(websocket: WebSocket):
    await websocket.accept()
    user_row = user_from_session(websocket.cookies.get(COOKIE_NAME))
    if not user_row:
        try:
            await websocket.send_text(json.dumps({"t": "error", "detail": "Inicia sesión"}, ensure_ascii=False))
        except Exception:
            pass
        await _ws_close_quiet(websocket, 4401)
        return
    pub = db.user_public(user_row)
    uid = int(user_row["id"])
    name = str(pub.get("name") or str(pub.get("email") or "").split("@")[0] or "Amigo")[:40]
    await _ls_hub.connect(websocket, uid, name)
    try:
        while True:
            raw = await websocket.receive_text()
            if len(raw) > 8000:
                continue
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(msg, dict):
                await _ls_hub.handle(websocket, msg)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[los-snakes-ws] error {uid}: {exc!r}", flush=True)
    finally:
        await _ls_hub.disconnect(websocket)


@app.get("/api/los-snakes/social")
def los_snakes_social(user=Depends(require_user)):
    uid = int(user["id"])
    soc = _ls_social_load(uid)
    kp = _ls_kids(uid)
    return {"allow": soc["allow"], "mail": soc["mail"], "kids": kp is not None, "notes": _LS_NOTES, "gifts": _LS_GIFTS}


@app.put("/api/los-snakes/social")
def los_snakes_social_set(payload: dict, user=Depends(require_user)):
    uid = int(user["id"])
    allow = payload.get("allow") if isinstance(payload, dict) else None
    if allow not in ("friends", "off"):
        raise HTTPException(status_code=400, detail="Valor no válido")
    with _ls_lock:
        soc = _ls_social_load(uid)
        soc["allow"] = allow
        _ls_social_store(uid, soc)
    return {"ok": True, "allow": allow}


def _ls_avatar(av) -> str:
    """Avatar de un amigo: la foto/GIF completa (/api/avatars/...) o un emoji corto. Nunca una URL recortada."""
    a = str(av or "🐶").strip()
    if db.is_photo_avatar(a):
        return a[:200]
    return a[:16] if "/" not in a else "🐍"


@app.get("/api/los-snakes/friends")
def los_snakes_friends(user=Depends(require_user)):
    uid = int(user["id"])
    out = []
    for row in added_accounts.list_for(uid):
        fid = int(row["id"])
        ok, reason = _ls_check_visit(uid, fid)
        st = _ls_game(fid)
        item = {"id": fid, "name": str(row.get("name") or "")[:40], "avatar": _ls_avatar(row.get("avatar")),
                "online": _ls_hub.online(fid), "can": ok, "reason": reason, "pro": db.pro_flag(fid)}
        if _ls_hub.online(fid) and _ls_can_meet(uid, fid):
            item["at"] = _ls_hub.place_of(fid)
        if ok and st is not None:
            item["family"] = _ls_family(st)
        out.append(item)
    kp = _ls_kids(uid)
    return {"friends": out, "kids": kp is not None}


class LosSnakesVisitBody(BaseModel):
    host: int
    snake: str = ""


@app.post("/api/los-snakes/visit")
async def los_snakes_visit(body: LosSnakesVisitBody, user=Depends(require_user)):
    """Casa del amigo en solo lectura (desde su partida en el servidor). Nunca se escribe en ella."""
    uid = int(user["id"])
    ok, reason = _ls_check_visit(uid, int(body.host))
    if not ok:
        raise HTTPException(status_code=403, detail=reason)
    st = _ls_game(int(body.host)) or {}
    host = db.get_user_by_id(int(body.host))
    fam = _ls_family(st)
    lo = _LS_GUEST_BASE + uid * 1_000_000
    snakes = []
    for sn in (st.get("snakes") or [])[:8]:
        if not isinstance(sn, dict):
            continue
        rel_me = {}
        for k, r in (sn.get("rel") or {}).items():
            try:
                kk = int(k)
            except Exception:
                continue
            if lo <= kk < lo + 1_000_000 and isinstance(r, dict):
                rel_me[str(kk - lo)] = {"fr": r.get("fr", 0), "ro": r.get("ro", 0)}
        snakes.append({
            "id": sn.get("id"), "name": str(sn.get("name") or "")[:16], "color": str(sn.get("color") or "#3498db")[:9],
            "pattern": str(sn.get("pattern") or "lisa")[:12], "age": str(sn.get("age") or "adulto")[:8],
            "traits": [str(t)[:12] for t in (sn.get("traits") or [])[:3]], "needs": _ls_clean(sn.get("needs") or {}),
            "mood": sn.get("mood", 60), "x": sn.get("x", 6.5), "y": sn.get("y", 7.5), "fx": sn.get("fx", 1),
            "away": bool(sn.get("away")), "partner": sn.get("partner"), "relMe": rel_me,
        })
    snake_name = " ".join(str(body.snake or "").split())[:16] or "su serpiente"
    who = str(user["name"] or "Un amigo")[:40]
    now = time.time()
    notify = False
    with _ls_lock:
        soc = _ls_social_load(int(body.host))
        last = float(soc["seen"].get(str(uid)) or 0)
        if now - last > 1800:
            soc["seen"][str(uid)] = now
            soc["mail"] = (soc["mail"] + [{"id": secrets.token_hex(6), "kind": "visit", "from": uid, "fromName": who,
                                           "snake": snake_name, "at": now}])[-40:]
            _ls_social_store(int(body.host), soc)
            notify = True
    if notify:
        await _ls_notify(int(body.host), "🐍 Los Snakes: ¡tienes visita!",
                         f"{who} ha venido a tu casa con {snake_name}." + ("" if _ls_hub.online(int(body.host)) else " Lo verás en tu buzón."))
        await _ls_hub.to_user(int(body.host), {"t": "mail"})
    return {"ok": True, "host": {"id": int(body.host), "name": str(host["name"] if host else "")[:40], "pro": db.pro_flag(body.host)},
            "family": fam["name"], "world": fam["world"], "snakes": snakes, "live": _ls_hub.online(int(body.host))}


class LosSnakesMailBody(BaseModel):
    host: int
    kind: str
    item: str = ""
    text: str = ""
    snake: str = ""


@app.post("/api/los-snakes/mail")
async def los_snakes_mail(body: LosSnakesMailBody, user=Depends(require_user)):
    """Regalo o nota en el buzón del amigo. El regalo lo paga el invitado en su propia partida."""
    uid = int(user["id"])
    ok, reason = _ls_check_visit(uid, int(body.host))
    if not ok:
        raise HTTPException(status_code=403, detail=reason)
    kind = body.kind
    text = " ".join(str(body.text or "").split())[:200]
    if kind == "gift":
        if body.item not in _LS_GIFTS:
            raise HTTPException(status_code=400, detail="Regalo no válido")
    elif kind == "note":
        if not text:
            raise HTTPException(status_code=400, detail="La nota está vacía")
        if _ls_kids(uid) is not None and text not in _LS_NOTES:
            _ls_kids_log(uid, "Los Snakes: nota libre")
            raise HTTPException(status_code=403, detail="Snake OS Kids: elige una de las notas preparadas.")
    else:
        raise HTTPException(status_code=400, detail="Tipo no válido")
    now = time.time()
    with _ls_lock:
        soc = _ls_social_load(int(body.host))
        recent = [m for m in soc["mail"] if m.get("from") == uid and m.get("kind") != "visit" and now - float(m.get("at") or 0) < 86400]
        if len(recent) >= 10:
            raise HTTPException(status_code=429, detail="Ya has dejado muchas cosas hoy en ese buzón.")
        who = str(user["name"] or "Un amigo")[:40]
        item = {"id": secrets.token_hex(6), "kind": kind, "from": uid, "fromName": who,
                "snake": " ".join(str(body.snake or "").split())[:16], "at": now}
        if kind == "gift":
            item["item"] = body.item
        else:
            item["text"] = text
        soc["mail"] = (soc["mail"] + [item])[-40:]
        _ls_social_store(int(body.host), soc)
    await _ls_notify(int(body.host), "📬 Los Snakes: algo en tu buzón",
                     f"{who} te ha dejado " + ("un regalo." if kind == "gift" else "una nota.") + " Ábrelo al volver a casa.")
    await _ls_hub.to_user(int(body.host), {"t": "mail"})
    return {"ok": True, "price": _LS_GIFTS.get(body.item, 0) if kind == "gift" else 0}


@app.post("/api/los-snakes/mail/claim")
def los_snakes_mail_claim(payload: dict, user=Depends(require_user)):
    uid = int(user["id"])
    ids = payload.get("ids") if isinstance(payload, dict) else None
    if not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="Faltan ids")
    want = {str(i) for i in ids[:60]}
    with _ls_lock:
        soc = _ls_social_load(uid)
        taken = [m for m in soc["mail"] if str(m.get("id")) in want]
        soc["mail"] = [m for m in soc["mail"] if str(m.get("id")) not in want]
        _ls_social_store(uid, soc)
    return {"ok": True, "items": taken}


# ===== DOGANIERO CHAT + NOTIFICATIONS =====

class ChatHub:
    """Realtime fan-out for Doganiero Chat messages and system notifications."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._clients: dict[int, set[WebSocket]] = {}

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.setdefault(int(user_id), set()).add(ws)

    async def disconnect(self, user_id: int, ws: WebSocket) -> None:
        async with self._lock:
            bucket = self._clients.get(int(user_id))
            if not bucket:
                return
            bucket.discard(ws)
            if not bucket:
                self._clients.pop(int(user_id), None)

    async def send_to_user(self, user_id: int, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload, ensure_ascii=False)
        async with self._lock:
            targets = list(self._clients.get(int(user_id), set()))
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_text(raw)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                bucket = self._clients.get(int(user_id))
                if bucket:
                    for ws in dead:
                        bucket.discard(ws)
                    if not bucket:
                        self._clients.pop(int(user_id), None)


chat_hub = ChatHub()


@app.get("/api/online/count")
async def online_count():
    """Personas con Snake OS abierto. Solo el numero, sin nombres."""
    return {"count": len(chat_hub._clients)}



_activity = []


def note_activity(kind, who):
    """Hecho reciente de Snake OS. Solo el tipo y el nombre, nunca el texto privado."""
    name = str(who or "").strip()[:24]
    label = str(kind or "hecho").strip()[:16]
    if not name:
        return
    _activity.append({"k": label, "w": name, "at": time.time()})
    del _activity[:-12]


@app.get("/api/online/names")
async def online_names():
    """Nombres de las cuentas Dogaemail con Snake OS abierto."""
    names = []
    for uid in list(chat_hub._clients.keys()):
        try:
            row = db.get_user_by_id(int(uid))
        except Exception:
            row = None
        if not row:
            continue
        name = str(row["name"] or "").strip()
        email = str(row["email"] or "").strip()
        if not name and "@" in email:
            name = email.split("@", 1)[0]
        if name:
            names.append(name)
    return {"names": names}


_room_climate = {"c": None, "h": None, "err": "", "at": 0.0}





_board = []
_board_seq = 0


class BoardSay(BaseModel):
    text: str = Field(..., min_length=1, max_length=180)
    sent: bool = False


class BoardAck(BaseModel):
    id: int


class BoardReply(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


def _board_keep(item):
    _board.append(item)
    del _board[:-80]


def _queue_board_line(text: str) -> None:
    global _board_seq
    clean = " ".join(str(text or "").split())
    if not clean:
        return
    _board_seq += 1
    _board_keep({
        "id": _board_seq,
        "who": "tu",
        "text": clean[:180],
        "sent": False,
        "at": time.time(),
    })


def _board_http_junk(text: str) -> bool:
    line = str(text or "").strip()
    if line.startswith(("GET ", "POST ", "PUT ", "HEAD ", "DELETE ", "HTTP/")):
        return True
    name = line.split(":", 1)[0].strip().lower()
    return name in {
        "host", "accept", "accept-encoding", "accept-language", "user-agent",
        "connection", "cache-control", "upgrade-insecure-requests",
        "sec-fetch-site", "sec-fetch-mode", "sec-fetch-user", "sec-fetch-dest",
        "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform",
    }


@app.post("/api/board/say")
def board_say(body: BoardSay):
    """Una linea escrita por una persona para la placa."""
    global _board_seq
    text = " ".join(str(body.text or "").split())
    if not text:
        raise HTTPException(status_code=400, detail="Linea vacia")
    if _board_http_junk(text):
        raise HTTPException(status_code=400, detail="Linea no valida")
    _board_seq += 1
    item = {
        "id": _board_seq,
        "who": "tu",
        "text": text[:180],
        "sent": bool(body.sent),
        "at": time.time(),
    }
    _board_keep(item)
    return {"ok": True, "id": _board_seq}


@app.get("/api/board/pending")
def board_pending():
    matrix_api.note_bridge_poll()
    return {"lines": [item for item in _board if item.get("who") == "tu" and not item.get("sent")]}


class BoardAsk(BaseModel):
    text: str = Field(..., min_length=1, max_length=160)


class BoardAskFinish(BaseModel):
    id: int
    reply: str = ""


class BoardAiCall(BaseModel):
    id: int
    name: str = Field(..., min_length=1, max_length=80)
    alt: str = ""


_board_asks: dict[int, dict[str, Any]] = {}


def _fold_contact(value: str) -> str:
    raw = unicodedata.normalize("NFKD", str(value or ""))
    raw = "".join(ch for ch in raw if not unicodedata.combining(ch))
    return " ".join(raw.casefold().split())


def _match_accepted(owner_id: int, query: str):
    wanted = _fold_contact(query)
    if len(wanted) < 2:
        return None
    exact = []
    loose = []
    wanted_tokens = [tok for tok in wanted.replace("@", " ").split() if tok]
    for row in added_accounts.list_for(int(owner_id)):
        name = _fold_contact(row.get("name"))
        email = _fold_contact(row.get("email"))
        local = email.split("@", 1)[0]
        if wanted in (name, email, local):
            exact.append(row)
            continue
        name_tokens = set(name.split())
        if wanted_tokens and all(tok in name_tokens or tok == local for tok in wanted_tokens):
            loose.append(row)
    if len(exact) == 1:
        return exact[0]
    if not exact and len(loose) == 1:
        return loose[0]
    return None


@app.post("/api/board/ask")
def board_ask(body: BoardAsk, user=Depends(require_user)):
    """Pregunta para la placa. La respuesta la escribe el puente del Mac."""
    global _board_seq
    question = " ".join(str(body.text or "").split())[:140]
    if not question:
        raise HTTPException(status_code=400, detail="Pregunta vacia")
    _board_seq += 1
    ask_id = _board_seq
    _board_asks[ask_id] = {"user_id": int(user["id"]), "status": "wait", "reply": ""}
    stale = [key for key in _board_asks if key < ask_id - 40]
    for key in stale:
        _board_asks.pop(key, None)
    _queue_board_line("~q %d %s" % (ask_id, question))
    return {"ok": True, "id": ask_id}


@app.get("/api/board/ask/result")
def board_ask_result(id: int = Query(..., ge=1), user=Depends(require_user)):
    row = _board_asks.get(int(id))
    if not row or int(row.get("user_id") or 0) != int(user["id"]):
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")
    return {"ok": True, "id": int(id), "status": row.get("status") or "wait", "reply": row.get("reply") or "", "call": row.get("call")}


@app.post("/api/board/ask/finish")
def board_ask_finish(body: BoardAskFinish):
    row = _board_asks.get(int(body.id))
    if not row or row.get("status") != "wait":
        return {"ok": False}
    row["status"] = "done"
    row["reply"] = " ".join(str(body.reply or "").split())[:500]
    return {"ok": True}


@app.post("/api/board/ai-call")
async def board_ai_call(body: BoardAiCall):
    """La placa pide llamar. Solo un contacto aceptado, por el telefono de siempre."""
    row = _board_asks.get(int(body.id))
    if not row or row.get("status") != "wait":
        return {"ok": False, "reply": "Esa pregunta ya no esta."}
    match = _match_accepted(int(row["user_id"]), body.name)
    if not match and str(body.alt or "").strip():
        match = _match_accepted(int(row["user_id"]), body.alt)
    if not match:
        reply = body.name.strip() + " no es un contacto."
        row["status"] = "done"
        row["reply"] = reply
        row["call"] = None
        return {"ok": False, "reply": reply}
    peer = {
        "id": int(match["id"]),
        "email": str(match.get("email") or ""),
        "name": str(match.get("name") or ""),
        "avatar": str(match.get("avatar") or "🐶"),
        "number": str(match.get("number") or ""),
    }
    who = str(peer["name"] or "").strip() or peer["email"] or body.name.strip()
    reply = "Llamando a " + who + "."
    row["status"] = "done"
    row["reply"] = reply
    row["call"] = peer
    try:
        await chat_hub.send_to_user(int(row["user_id"]), {"type": "board_place_call", "peer": peer})
    except Exception:
        pass
    return {"ok": True, "reply": reply, "call": peer}


@app.post("/api/board/ack")
def board_ack(body: BoardAck):
    for item in _board:
        if int(item.get("id") or 0) == int(body.id):
            item["sent"] = True
    return {"ok": True}


async def _forward_arduino_duration(text: str) -> None:
    parts = text.split()
    if len(parts) != 3 or parts[0] != "~d":
        return
    try:
        minutes = int(parts[1])
        seconds = int(parts[2])
    except ValueError:
        return
    if minutes < 0 or minutes > 999 or seconds < 0 or seconds > 59:
        return
    now = time_mod.time()
    chosen_id = None
    chosen_at = -1.0
    for key, row in _ended_peers.items():
        if row.get("forwarded"):
            continue
        at = float(row.get("at") or 0)
        if now - at > 45:
            continue
        if at >= chosen_at:
            chosen_at = at
            chosen_id = key
    if not chosen_id:
        return
    row = _ended_peers[chosen_id]
    row["forwarded"] = True
    payload = {
        "type": "call_duration",
        "callId": chosen_id,
        "minutes": minutes,
        "seconds": seconds,
    }
    await _send_call(int(row["caller_id"]), payload)
    await _send_call(int(row["callee_id"]), payload)


async def _send_local_call_duration(call_id: str, minutes: int, seconds: int) -> None:
    """Duración de la llamada calculada aquí, sin esperar a la Mega."""
    row = _ended_peers.get(call_id)
    if not row or row.get("forwarded"):
        return
    if minutes < 0 or minutes > 999 or seconds < 0 or seconds > 59:
        return
    row["forwarded"] = True
    payload = {
        "type": "call_duration",
        "callId": call_id,
        "minutes": minutes,
        "seconds": seconds,
    }
    await _send_call(int(row["caller_id"]), payload)
    await _send_call(int(row["callee_id"]), payload)


@app.post("/api/board/reply")
async def board_reply(body: BoardReply):
    """Una linea que la placa ha contestado."""
    global _board_seq
    text = str(body.text or "").replace("\r", " ").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Linea vacia")
    _board_seq += 1
    _board_keep({
        "id": _board_seq,
        "who": "mega",
        "text": text[:4000],
        "sent": True,
        "at": time.time(),
    })
    matrix_api.on_board_reply(text)
    if text.startswith("~d "):
        try:
            await _forward_arduino_duration(text)
        except Exception:
            pass
    elif text.startswith("~h "):
        parts = text.split()
        if len(parts) >= 2:
            try:
                meters = int(parts[1])
            except ValueError:
                meters = None
            if meters is not None and meters >= 0:
                with _where_lock:
                    if _where_job.get("status") == "measuring":
                        _where_job["meters"] = meters
                        _where_job["status"] = "done"
                        _where_job["at"] = time.time()
    return {"ok": True, "id": _board_seq}


def _board_hide_coder(text: str) -> bool:
    line = str(text or "")
    return (
        line.startswith("~p ")
        or line == "~p"
        or line.startswith("~w ")
        or line.startswith("~m ")
        or line == "~m"
        or line in ("~.", "~.0")
    )


@app.get("/api/board/chat")
def board_chat(after: int = 0):
    return {"lines": [item for item in _board if int(item["id"]) > int(after or 0) and not _board_http_junk(item.get("text") or "") and not _board_hide_coder(item.get("text") or "")]}


app.include_router(
    matrix_api.build_router(
        require_user,
        _queue_board_line,
        _board,
        _matrix_throttle_check,
        resolve_askbox_key,
    )
)


_keypad = []
_keypad_seq = 0
_KEYPAD_OK = set("0123456789ABCD") | {"backspace", "enter"}


class KeypadBody(BaseModel):
    k: str = Field(..., min_length=1, max_length=12)


@app.post("/api/keypad")
async def keypad_push(body: KeypadBody):
    """Una tecla del teclado de membrana. Solo caracteres del modulo."""
    global _keypad_seq
    key = str(body.k or "")
    if key not in _KEYPAD_OK:
        raise HTTPException(status_code=400, detail="Tecla no valida")
    _keypad_seq += 1
    _keypad.append({"id": _keypad_seq, "k": key, "at": time.time()})
    del _keypad[:-40]
    return {"ok": True, "id": _keypad_seq}


@app.get("/api/keypad")
def keypad_poll(after: int = 0):
    return {"keys": [item for item in _keypad if int(item["id"]) > int(after or 0)]}


@app.get("/api/activity")
async def activity_feed():
    """Resumen para la placa: quien esta dentro y los ultimos hechos, sin mensajes."""
    live = await online_names()
    return {"names": live.get("names") or [], "events": list(_activity)}


@app.get("/api/room/climate")
def room_climate():
    return _room_climate


@app.post("/api/room/climate")
async def set_room_climate(request: Request):
    """Ultima lectura del DHT11. Solo guarda lo que manda la placa."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Lectura no valida")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Lectura no valida")
    err = str(body.get("err") or "").strip()
    if err:
        _room_climate["c"] = None
        _room_climate["h"] = None
        _room_climate["err"] = err[:80]
        _room_climate["at"] = time.time()
        return _room_climate
    try:
        c = int(body.get("c"))
        h = int(body.get("h"))
    except Exception:
        raise HTTPException(status_code=400, detail="Lectura no valida")
    if not (0 <= c <= 50 and 0 <= h <= 100):
        raise HTTPException(status_code=400, detail="Fuera de rango")
    _room_climate["c"] = c
    _room_climate["h"] = h
    _room_climate["err"] = ""
    _room_climate["at"] = time.time()
    return _room_climate


_visitor_lock = threading.Lock()
_visitor_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _ip_obj(raw: str):
    text_ip = str(raw or "").strip().split("%", 1)[0]
    if not text_ip:
        return None
    try:
        return ipaddress.ip_address(text_ip)
    except ValueError:
        return None


def _is_home_lan(raw: str) -> bool:
    addr = _ip_obj(raw)
    if addr is None:
        return False
    if addr.is_loopback:
        return True
    if addr.version == 4:
        return addr in ipaddress.ip_network("192.168.0.0/16") or addr in ipaddress.ip_network("10.0.0.0/8")
    return bool(addr.is_private)


def _is_public_ip(raw: str) -> bool:
    addr = _ip_obj(raw)
    if addr is None:
        return False
    return not (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast)


def _visitor_ip(request: Request) -> str:
    peer = ""
    if request.client and request.client.host:
        peer = str(request.client.host).split("%", 1)[0].strip()
    if _is_home_lan(peer):
        return peer
    if _is_public_ip(peer):
        return peer
    for header in ("cf-connecting-ip", "x-real-ip"):
        hopped = str(request.headers.get(header) or "").split(",")[0].strip()
        if _is_public_ip(hopped):
            return hopped
    for part in str(request.headers.get("x-forwarded-for") or "").split(","):
        hopped = part.strip()
        if _is_public_ip(hopped):
            return hopped
    return peer


def _http_json(url: str, timeout: float = 2.5) -> dict[str, Any] | None:
    try:
        req = UrlRequest(url, headers={"User-Agent": "SnakeOS/1.0", "Accept": "application/json"})
        with urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8", "replace") or "{}")
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _geo_ip(ip: str) -> dict[str, Any] | None:
    quoted = quote_plus(ip)
    data = _http_json(
        "http://ip-api.com/json/" + quoted + "?fields=status,country,countryCode,lat,lon&lang=es"
    )
    if data and data.get("status") == "success" and data.get("countryCode"):
        return data
    who = _http_json("https://ipwho.is/" + quoted)
    if not who or who.get("success") is False or not who.get("country_code"):
        return None
    return {
        "country": who.get("country") or "",
        "countryCode": who.get("country_code") or "",
        "lat": who.get("latitude"),
        "lon": who.get("longitude"),
    }


def _country_temperature(lat: float, lon: float) -> float | None:
    url = (
        "https://api.open-meteo.com/v1/forecast?current=temperature_2m&latitude="
        + str(lat)
        + "&longitude="
        + str(lon)
    )
    data = _http_json(url)
    if not data:
        return None
    current = data.get("current") if isinstance(data.get("current"), dict) else None
    if not current or "temperature_2m" not in current:
        return None
    try:
        value = float(current["temperature_2m"])
    except (TypeError, ValueError):
        return None
    if value != value or value < -80.0 or value > 60.0:
        return None
    return value


def visitor_place(ip: str) -> dict[str, Any]:
    if _is_home_lan(ip) or not _is_public_ip(ip):
        return {"mode": "local"}
    now = time.time()
    with _visitor_lock:
        cached = _visitor_cache.get(ip)
        if cached and now - cached[0] < 600:
            return dict(cached[1])
    geo = _geo_ip(ip)
    if not geo:
        result = {"mode": "unavailable"}
    else:
        code = str(geo.get("countryCode") or "").strip().upper()
        if code == "ES":
            result = {"mode": "local"}
        else:
            country = str(geo.get("country") or "").strip()
            try:
                lat = float(geo.get("lat"))
                lon = float(geo.get("lon"))
            except (TypeError, ValueError):
                lat = lon = None
            temp = None
            if country and lat is not None and -90.0 <= lat <= 90.0 and lon is not None and -180.0 <= lon <= 180.0:
                temp = _country_temperature(lat, lon)
            if temp is None or not country:
                result = {"mode": "unavailable"}
            else:
                degrees = int(round(temp))
                result = {
                    "mode": "country",
                    "country": country,
                    "c": degrees,
                    "label": country + " · " + str(degrees) + " °C",
                }
    with _visitor_lock:
        _visitor_cache[ip] = (time.time(), dict(result))
        if len(_visitor_cache) > 200:
            oldest = sorted(_visitor_cache.items(), key=lambda item: item[1][0])[:50]
            for key, _row in oldest:
                _visitor_cache.pop(key, None)
    return result


@app.get("/api/visitor/climate")
def visitor_climate(request: Request):
    """Temperatura del país si la conexión no es de España. La LAN sigue con el DHT."""
    try:
        return visitor_place(_visitor_ip(request))
    except Exception:
        return {"mode": "unavailable"}


_board_vitals = {"uptime": None, "free": None, "used": None, "at": 0.0}


@app.get("/api/board/vitals")
def board_vitals():
    return _board_vitals


@app.post("/api/board/vitals")
async def set_board_vitals(request: Request):
    """Tiempo encendida y RAM que la Mega manda sola por el cable."""
    try:
        body = await request.json()
        uptime = int(body.get("uptime"))
        free = int(body.get("free"))
        used = int(body.get("used"))
    except Exception:
        raise HTTPException(status_code=400, detail="Lectura no valida")
    if uptime < 0 or uptime > 400000000 or not (0 <= free <= 8192) or not (0 <= used <= 8192):
        raise HTTPException(status_code=400, detail="Fuera de rango")
    _board_vitals["uptime"] = uptime
    _board_vitals["free"] = free
    _board_vitals["used"] = used
    _board_vitals["at"] = time.time()
    return _board_vitals


def _placa_fresh(at, limit):
    try:
        stamp = float(at or 0)
    except (TypeError, ValueError):
        return False
    if stamp <= 0:
        return False
    return (time.time() - stamp) <= limit


@app.get("/api/placa")
async def placa_activity():
    """Actividad actual de la Mega. Sin lineas de protocolo ni secretos."""
    now = time.time()
    err = str(_room_climate.get("err") or "").strip()[:80]
    climate_ok = (
        _placa_fresh(_room_climate.get("at"), 20)
        and not err
        and isinstance(_room_climate.get("c"), int)
        and isinstance(_room_climate.get("h"), int)
    )
    if climate_ok:
        climate = {"ok": True, "c": int(_room_climate["c"]), "h": int(_room_climate["h"])}
    elif err and _placa_fresh(_room_climate.get("at"), 20):
        climate = {"ok": False, "err": err}
    else:
        climate = {"ok": False}

    vitals_ok = (
        _placa_fresh(_board_vitals.get("at"), 15)
        and isinstance(_board_vitals.get("uptime"), int)
        and isinstance(_board_vitals.get("free"), int)
        and isinstance(_board_vitals.get("used"), int)
    )

    state = "none"
    seconds = None
    async with _calls_lock:
        active = [c for c in _calls.values() if c.get("status") == "active"]
        ringing = [c for c in _calls.values() if c.get("status") == "ringing"]
    if active:
        state = "counting"
        starts = []
        for c in active:
            try:
                starts.append(float(c.get("answered_at") or 0))
            except (TypeError, ValueError):
                continue
        starts = [n for n in starts if n > 0]
        if starts and vitals_ok:
            seconds = max(0, int(now - min(starts)))
    elif ringing:
        state = "ringing"

    with _coder_lock:
        programming = str(_coder_job.get("status") or "") == "programming"
    with _where_lock:
        wstatus = str(_where_job.get("status") or "idle")
        wmeters = _where_job.get("meters")
        try:
            wat = float(_where_job.get("at") or 0)
        except (TypeError, ValueError):
            wat = 0.0
    searching = wstatus == "measuring" or (
        wstatus == "done" and isinstance(wmeters, int) and (now - wat) < 3
    )
    meters = int(wmeters) if searching and isinstance(wmeters, int) else None

    if not vitals_ok:
        glyph = "unavailable"
    elif state == "counting":
        glyph = "phone"
    elif searching:
        glyph = "pushpin"
    elif programming:
        glyph = "prompt"
    else:
        glyph = "off"

    return {
        "climate": climate,
        "call": {"state": state, "seconds": seconds},
        "coder": {"programming": programming},
        "where": {"searching": searching, "meters": meters},
        "glyph": glyph,
        "uptime": int(_board_vitals["uptime"]) if vitals_ok else None,
        "sram": (
            {"used": int(_board_vitals["used"]), "free": int(_board_vitals["free"])}
            if vitals_ok else None
        ),
    }


_where_lock = threading.Lock()
_where_seq = 0
_where_job = {"id": 0, "user_id": 0, "meters": None, "status": "idle", "place": "", "lat": None, "lng": None, "from_lat": None, "from_lng": None, "at": 0.0}
_where_last = {"meters": None, "at": 0.0}


class ProfileLocation(BaseModel):
    lat: float
    lng: float


class WhereSearch(BaseModel):
    q: str = Field(..., min_length=2, max_length=120)
    lat: float | None = None
    lng: float | None = None


class WhereBoard(BaseModel):
    meters: int = Field(..., ge=0, le=20000000)


def _e6(n: float) -> int:
    return int(round(float(n) * 1000000.0))


def _where_geocode(query: str) -> tuple[float, float, str] | None:
    ua = {"User-Agent": "SnakeOS/1.0", "Accept": "application/json"}
    try:
        url = "https://photon.komoot.io/api/?limit=1&lang=es&q=" + quote_plus(query)
        req = UrlRequest(url, headers=ua)
        with urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8", "replace") or "{}")
        feats = data.get("features") if isinstance(data, dict) else None
        if isinstance(feats, list) and feats:
            feat = feats[0] if isinstance(feats[0], dict) else {}
            coords = (feat.get("geometry") or {}).get("coordinates") if isinstance(feat.get("geometry"), dict) else None
            if isinstance(coords, list) and len(coords) >= 2:
                lon = float(coords[0])
                lat = float(coords[1])
                props = feat.get("properties") if isinstance(feat.get("properties"), dict) else {}
                name = str(props.get("name") or props.get("city") or props.get("street") or query).strip() or query
                if -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0:
                    return (lat, lon, name[:120])
    except Exception:
        pass
    try:
        url = (
            "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=es&q="
            + quote_plus(query)
        )
        req = UrlRequest(url, headers=ua)
        with urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8", "replace") or "[]")
        if isinstance(data, list) and data and isinstance(data[0], dict):
            lat = float(data[0].get("lat"))
            lon = float(data[0].get("lon"))
            name = str(data[0].get("name") or data[0].get("display_name") or query).split(",")[0].strip() or query
            if -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0:
                return (lat, lon, name[:120])
    except Exception:
        pass
    return None


@app.get("/api/me/location")
def get_my_location(user=Depends(require_user)):
    loc = db.get_user_location(int(user["id"]))
    if not loc:
        return {"ok": True, "on": False}
    return {"ok": True, "on": True, "lat": loc[0], "lng": loc[1]}


@app.post("/api/me/location")
def save_my_location(body: ProfileLocation, user=Depends(require_user)):
    if not (-90.0 <= float(body.lat) <= 90.0 and -180.0 <= float(body.lng) <= 180.0):
        raise HTTPException(status_code=400, detail="Coordenadas no válidas")
    db.set_user_location(int(user["id"]), float(body.lat), float(body.lng))
    return {"ok": True}


# ===== Mapas: ver la ubicación de un contacto que la comparte =====
class LocShareToggle(BaseModel):
    on: bool


def _locshare_ensure(conn):
    conn.execute(
        "CREATE TABLE IF NOT EXISTS location_share ("
        "user_id INTEGER PRIMARY KEY, sharing INTEGER NOT NULL DEFAULT 0, "
        "lat REAL, lng REAL, at REAL)"
    )


def _locshare_get(uid: int):
    with db.get_conn() as conn:
        _locshare_ensure(conn)
        return conn.execute("SELECT * FROM location_share WHERE user_id = ?", (int(uid),)).fetchone()


@app.get("/api/me/location-share")
def get_location_share(user=Depends(require_user)):
    row = _locshare_get(int(user["id"]))
    # decided: ya eligió (o ya se le mostró el aviso). Si lo desactivó, no se vuelve a activar solo.
    return {"on": bool(row and row["sharing"]), "decided": row is not None}


@app.post("/api/me/location-share")
def set_location_share(body: LocShareToggle, user=Depends(require_user)):
    uid = int(user["id"])
    with db.get_conn() as conn:
        _locshare_ensure(conn)
        if body.on:
            conn.execute(
                "INSERT INTO location_share (user_id, sharing) VALUES (?, 1) "
                "ON CONFLICT(user_id) DO UPDATE SET sharing = 1",
                (uid,),
            )
        else:
            # Al desactivar se borra también la última posición guardada.
            conn.execute(
                "INSERT INTO location_share (user_id, sharing) VALUES (?, 0) "
                "ON CONFLICT(user_id) DO UPDATE SET sharing = 0, lat = NULL, lng = NULL, at = NULL",
                (uid,),
            )
    return {"on": bool(body.on)}


@app.post("/api/me/location-share/ping")
def ping_location_share(body: ProfileLocation, user=Depends(require_user)):
    lat, lng = float(body.lat), float(body.lng)
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        raise HTTPException(status_code=400, detail="Coordenadas no válidas")
    uid = int(user["id"])
    with db.get_conn() as conn:
        _locshare_ensure(conn)
        cur = conn.execute(
            "UPDATE location_share SET lat = ?, lng = ?, at = ? WHERE user_id = ? AND sharing = 1",
            (lat, lng, time.time(), uid),
        )
        ok = cur.rowcount > 0
    return {"ok": ok}


@app.get("/api/maps/contact-location")
def contact_location(email: str, user=Depends(require_user)):
    me = int(user["id"])
    target = db.get_user_by_email(str(email or "").strip().lower())
    if not target or int(target["id"]) == me:
        raise HTTPException(status_code=404, detail="No tienes ningún contacto con ese correo.")
    tid = int(target["id"])
    if not added_accounts.has(me, tid):
        raise HTTPException(status_code=404, detail="No tienes ningún contacto con ese correo.")
    row = _locshare_get(tid)
    if not row or not row["sharing"]:
        return {"ok": False, "reason": "off", "name": target["name"], "detail": "Este contacto no comparte su ubicación."}
    if row["lat"] is None or row["lng"] is None:
        return {"ok": False, "reason": "nofix", "name": target["name"], "detail": "Comparte su ubicación, pero aún no hay posición."}
    return {"ok": True, "name": target["name"], "lat": float(row["lat"]), "lng": float(row["lng"]), "at": float(row["at"] or 0)}


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    radius = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    h = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    h = min(1.0, max(0.0, h))
    meters = radius * (2 * math.atan2(math.sqrt(h), math.sqrt(1 - h)))
    if meters < 0:
        meters = 0
    return int(round(meters))


def _where_coords(lat, lng) -> tuple[float, float] | None:
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return None
    if lat_f != lat_f or lng_f != lng_f:
        return None
    if not (-90.0 <= lat_f <= 90.0 and -180.0 <= lng_f <= 180.0):
        return None
    return (lat_f, lng_f)


@app.post("/api/where/search")
def where_search(body: WhereSearch, user=Depends(require_user)):
    global _where_seq
    loc = db.get_user_location(int(user["id"]))
    # La ubicación ya activada (permiso concedido) llega aquí si el perfil aún no tiene coordenadas.
    # Si el perfil ya las tiene, se usan esas y no hace falta otro permiso.
    if not loc:
        fresh = _where_coords(body.lat, body.lng)
        if fresh:
            db.set_user_location(int(user["id"]), fresh[0], fresh[1])
            loc = fresh
    if not loc:
        return {"ok": False, "reason": "noloc", "detail": "Tu perfil no tiene ubicación."}
    found = _where_geocode(body.q.strip())
    if not found:
        return {"ok": False, "reason": "noplace", "detail": "No encuentro ese lugar."}
    lat2, lon2, name = found
    with _where_lock:
        _where_seq += 1
        job_id = _where_seq
        _where_job["id"] = job_id
        _where_job["user_id"] = int(user["id"])
        _where_job["meters"] = None
        _where_job["status"] = "measuring"
        _where_job["place"] = name
        _where_job["lat"] = lat2
        _where_job["lng"] = lon2
        _where_job["from_lat"] = loc[0]
        _where_job["from_lng"] = loc[1]
        _where_job["at"] = time.time()
    if placa_required():
        _queue_board_line("~g %d %d %d %d" % (_e6(loc[0]), _e6(loc[1]), _e6(lat2), _e6(lon2)))
    else:
        meters = _haversine_meters(float(loc[0]), float(loc[1]), float(lat2), float(lon2))
        with _where_lock:
            if int(_where_job.get("id") or 0) == job_id:
                _where_job["meters"] = meters
                _where_job["status"] = "done"
                _where_job["at"] = time.time()
    return {"ok": True, "id": job_id, "place": name, "lat": lat2, "lng": lon2, "fromLat": loc[0], "fromLng": loc[1]}


@app.get("/api/where/result")
def where_result(job: int = Query(..., ge=1), user=Depends(require_user)):
    if int(_where_job.get("id") or 0) != int(job) or int(_where_job.get("user_id") or 0) != int(user["id"]):
        raise HTTPException(status_code=404, detail="Búsqueda no encontrada")
    return {
        "ok": True,
        "id": int(job),
        "status": _where_job.get("status") or "idle",
        "meters": _where_job.get("meters"),
        "place": _where_job.get("place") or "",
        "lat": _where_job.get("lat"),
        "lng": _where_job.get("lng"),
        "fromLat": _where_job.get("from_lat"),
        "fromLng": _where_job.get("from_lng"),
    }


@app.post("/api/where/board")
def where_board(body: WhereBoard):
    meters = int(body.meters)
    with _where_lock:
        _where_last["meters"] = meters
        _where_last["at"] = time.time()
        if _where_job.get("status") == "measuring":
            _where_job["meters"] = meters
            _where_job["status"] = "done"
            _where_job["at"] = time.time()
    return {"ok": True}


@app.get("/api/where/last")
def where_last():
    return _where_last


_coder_lock = threading.Lock()
_coder_job = {"id": 0, "user_id": 0, "status": "idle", "html": "", "at": 0.0}


class CoderMake(BaseModel):
    text: str = Field(default="", max_length=400)


class CoderBoard(BaseModel):
    html: str = Field(default="", max_length=4000)


@app.post("/api/coder/make")
def coder_make(body: CoderMake, user=Depends(require_user)):
    raw = " ".join(str(body.text or "").split())
    raw = "".join(ch if 32 <= ord(ch) < 127 else " " for ch in raw)
    raw = " ".join(raw.split())[:100]
    if not raw:
        raise HTTPException(status_code=400, detail="Escribe un texto o HTML corto")
    with _coder_lock:
        _coder_job["id"] = int(_coder_job.get("id") or 0) + 1
        job_id = int(_coder_job["id"])
        _coder_job["user_id"] = int(user["id"])
        _coder_job["status"] = "programming"
        _coder_job["html"] = ""
        _coder_job["at"] = time.time()
    _queue_board_line("~p " + raw)
    return {"ok": True, "id": job_id}


@app.get("/api/coder/result")
def coder_result(job: int = Query(..., ge=1), user=Depends(require_user)):
    with _coder_lock:
        if int(_coder_job.get("id") or 0) != int(job) or int(_coder_job.get("user_id") or 0) != int(user["id"]):
            raise HTTPException(status_code=404, detail="Pagina no encontrada")
        return {
            "ok": True,
            "id": int(job),
            "status": _coder_job.get("status") or "idle",
            "html": _coder_job.get("html") or "",
        }


@app.post("/api/coder/board")
def coder_board(body: CoderBoard):
    html = str(body.html or "").replace("\r", "")[:4000]
    with _coder_lock:
        if _coder_job.get("status") == "programming":
            _coder_job["html"] = html
            _coder_job["status"] = "done"
            _coder_job["at"] = time.time()
    return {"ok": True}


_loc_lock = asyncio.Lock()
_loc_peer: dict[int, int] = {}
_loc_last: dict[int, float] = {}


def _loc_coords(lat: Any, lng: Any) -> tuple[float, float] | None:
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return None
    if lat_f != lat_f or lng_f != lng_f:
        return None
    if not (-90.0 <= lat_f <= 90.0 and -180.0 <= lng_f <= 180.0):
        return None
    return (lat_f, lng_f)


def _loc_payload(user_row: Any, on: bool, lat: float | None = None, lng: float | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": "loc_update",
        "from": str(user_row["email"] or "").strip().lower(),
        "name": str(user_row["name"] or ""),
        "avatar": str(user_row["avatar"] or ""),
        "on": bool(on),
    }
    if on and lat is not None and lng is not None:
        payload["lat"] = float(lat)
        payload["lng"] = float(lng)
    return payload


async def _handle_loc_share(uid: int, msg: dict[str, Any], user_row: Any) -> None:
    """Relay live location only to the named chat peer. Never broadcast."""
    to_email = str(msg.get("to") or "").strip().lower()
    if not to_email or "@" not in to_email or len(to_email) > 200:
        return
    try:
        peer = db.get_user_by_email(to_email)
    except Exception:
        return
    if not peer:
        return
    peer_id = int(peer["id"])
    if peer_id == int(uid):
        return
    if not bool(msg.get("on")):
        tell = False
        async with _loc_lock:
            if _loc_peer.get(int(uid)) == peer_id:
                _loc_peer.pop(int(uid), None)
                _loc_last.pop(int(uid), None)
                tell = True
        if tell:
            await chat_hub.send_to_user(peer_id, _loc_payload(user_row, False))
        return
    coords = _loc_coords(msg.get("lat"), msg.get("lng"))
    if not coords:
        return
    now = time_mod.time()
    prev: int | None = None
    async with _loc_lock:
        current = _loc_peer.get(int(uid))
        if current == peer_id and (now - _loc_last.get(int(uid), 0.0)) < 3.0:
            return
        if current and int(current) != peer_id:
            prev = int(current)
        _loc_peer[int(uid)] = peer_id
        _loc_last[int(uid)] = now
    if prev:
        try:
            await chat_hub.send_to_user(prev, _loc_payload(user_row, False))
        except Exception:
            pass
    await chat_hub.send_to_user(peer_id, _loc_payload(user_row, True, coords[0], coords[1]))


async def _loc_end_if_offline(uid: int, user_row: Any) -> None:
    async with chat_hub._lock:
        still = list(chat_hub._clients.get(int(uid), ()))
    if still:
        return
    async with _loc_lock:
        peer_id = _loc_peer.pop(int(uid), None)
        _loc_last.pop(int(uid), None)
    if peer_id:
        await chat_hub.send_to_user(int(peer_id), _loc_payload(user_row, False))



class ChatSendBody(BaseModel):
    to: str = Field(..., min_length=1, description="Recipient email")
    text: str = Field(default="", max_length=2000)
    image: str | None = Field(default=None, max_length=1_700_000)
    replyTo: int | None = Field(default=None)


class ChatReactBody(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=16)


@app.get("/api/chat/users")
def chat_users(user=Depends(require_user)):
    users = []
    for row in added_accounts.list_for(int(user["id"])):
        users.append({"id": row["id"], "email": row["email"], "name": row["name"], "avatar": row["avatar"], "pro": bool(row.get("pro"))})
    return {"users": users}


@app.get("/api/chat/threads")
def chat_threads(user=Depends(require_user)):
    uid = int(user["id"])
    added_ids = {int(row["id"]) for row in added_accounts.list_for(uid)}
    threads = [item for item in db.list_chat_threads(user_id=uid) if int(((item.get("peer") or {}).get("id") or 0)) in added_ids]
    return {"threads": threads}


@app.get("/api/chat/messages")
def chat_messages(
    with_user: str = Query(..., alias="with"),
    user=Depends(require_user),
):
    peer_email = (with_user or "").strip().lower()
    peer = db.get_user_by_email(peer_email)
    if not peer:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    uid = int(user["id"])
    peer_id = int(peer["id"])
    if peer_id == uid:
        raise HTTPException(status_code=400, detail="No puedes chatear contigo mismo")
    if not added_accounts.has(uid, peer_id):
        raise HTTPException(status_code=403, detail="Solo puedes chatear con cuentas que has añadido.")
    msgs = db.list_chat_messages(user_id=uid, peer_user_id=peer_id, limit=120)
    try:
        chat_extras.decorate(msgs)
    except Exception:
        pass
    now = time_mod.time()
    db.mark_chat_messages_read(user_id=uid, peer_user_id=peer_id, read_at=now)
    db.mark_chat_notifications_read_for_peer(user_id=uid, peer_email=peer_email)
    return {
        "messages": msgs,
        "peer": {
            "id": peer_id,
            "email": peer["email"],
            "name": peer["name"],
            "avatar": peer["avatar"],
            "pro": db.pro_flag(peer_id),
        },
    }


@app.post("/api/chat/messages")
async def chat_send(body: ChatSendBody, user=Depends(require_user)):
    to_email = body.to.strip().lower()
    text = (body.text or "").strip()
    image = (body.image or "").strip() or None
    if image:
        head = image[:80].lower()
        if not (
            head.startswith("data:image/jpeg")
            or head.startswith("data:image/jpg")
            or head.startswith("data:image/png")
            or head.startswith("data:image/webp")
        ) or ";base64," not in head:
            raise HTTPException(status_code=400, detail="Solo se pueden enviar imágenes")
        if len(image) > 1_700_000:
            raise HTTPException(status_code=400, detail="La foto es demasiado grande")
    if not text and not image:
        raise HTTPException(status_code=400, detail="Mensaje vacío")
    if not text:
        text = "📷 Foto"
    peer = db.get_user_by_email(to_email)
    if not peer:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    uid = int(user["id"])
    peer_id = int(peer["id"])
    if peer_id == uid:
        raise HTTPException(status_code=400, detail="No puedes enviarte mensajes a ti mismo")
    _kp = osx_extras.kids_policy(uid)
    if _kp is not None and (_kp["chat"] == "off" or to_email not in _kp["contacts"]):
        osx_extras.log_blocked(uid, "chat", to_email)
        raise HTTPException(status_code=403, detail="Snake OS Kids: solo puedes escribir a los contactos que ha aprobado un adulto" if _kp["chat"] != "off" else "Snake OS Kids: el chat está desactivado")
    if not added_accounts.has(uid, peer_id):
        raise HTTPException(status_code=403, detail="Solo puedes chatear con cuentas que has añadido.")
    # Mobile ghost-click / double submit: reuse identical row within 2s
    existing = db.find_recent_identical_chat_message(
        from_user_id=uid,
        to_user_id=peer_id,
        text=text,
        within_seconds=2.0,
        image=image,
    )
    if existing:
        return {"message": existing, "notificationId": None, "deduped": True}
    ts = time_mod.time()
    try:
        saved = db.save_chat_message(
            from_user_id=uid,
            to_user_id=peer_id,
            text=text,
            created_at=ts,
            image=image,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "notimage":
            raise HTTPException(status_code=400, detail="Solo se pueden enviar imágenes")
        if code == "toolarge":
            raise HTTPException(status_code=400, detail="La foto es demasiado grande")
        raise HTTPException(status_code=400, detail="Mensaje vacío")
    if body.replyTo:
        try:
            chat_extras.set_reply(int(saved["id"]), int(body.replyTo), uid)
        except Exception:
            pass
    try:
        chat_extras.decorate([saved])
    except Exception:
        pass
    if image and text == "📷 Foto":
        preview = "📷 Foto"
    else:
        preview = text if len(text) <= 120 else (text[:117] + "…")
    notif = db.create_notification(
        user_id=peer_id,
        kind="chat",
        title=(f"{user['avatar']} {user['name']}" if (user['avatar'] and not db._is_image_avatar_str(str(user['avatar']))) else str(user['name'])),
        body=preview,
        data={
            "app": "chat",
            "peerEmail": user["email"],
            "peerName": user["name"],
            "peerAvatar": user["avatar"],
            "peerId": uid,
            "messageId": saved["id"],
        },
        created_at=ts,
    )
    msg_payload = {"type": "chat_message", "message": saved}
    notif_payload = {
        "type": "notification",
        "notification": notif,
        "unread": db.count_unread_notifications(user_id=peer_id),
    }
    # No WS echo to sender: client already paints from POST response (avoids phone dupes)
    await chat_hub.send_to_user(peer_id, msg_payload)
    await chat_hub.send_to_user(peer_id, notif_payload)
    _queue_notif_push(peer_id, notif)
    note_activity("chat", user["name"])
    return {"message": saved, "notificationId": notif["id"]}


@app.post("/api/chat/messages/{message_id}/react")
async def chat_react(message_id: int, body: ChatReactBody, user=Depends(require_user)):
    try:
        res = chat_extras.toggle_reaction(int(user["id"]), int(message_id), body.emoji)
    except ValueError:
        raise HTTPException(status_code=400, detail="Reacción no válida")
    if not res:
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")
    await chat_hub.send_to_user(
        int(res["peerId"]),
        {"type": "chat_reaction", "messageId": res["messageId"], "reactions": res["reactions"]},
    )
    return {"messageId": res["messageId"], "reactions": res["reactions"]}


@app.post("/api/notifications/sync-metaverse-events")
def notifications_sync_metaverse_events(user=Depends(require_user)):
    """No-op: Metaverse events removed. Kept for client compatibility."""
    uid = int(user["id"])
    return {
        "created": 0,
        "notifications": [],
        "unread": db.count_unread_notifications(user_id=uid),
    }


@app.get("/api/notifications")
def notifications_list(
    unread: int | None = Query(None),
    user=Depends(require_user),
):
    uid = int(user["id"])
    items = db.list_notifications(
        user_id=uid,
        unread_only=bool(unread),
        limit=50,
    )
    return {
        "notifications": items,
        "unread": db.count_unread_notifications(user_id=uid),
    }


@app.get("/api/notifications/unread-count")
def notifications_unread_count(user=Depends(require_user)):
    return {"unread": db.count_unread_notifications(user_id=int(user["id"]))}


@app.post("/api/notifications/{notif_id}/read")
def notifications_mark_read(notif_id: int, user=Depends(require_user)):
    row = db.mark_notification_read(user_id=int(user["id"]), notif_id=int(notif_id))
    if not row:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    return {
        "notification": row,
        "unread": db.count_unread_notifications(user_id=int(user["id"])),
    }


@app.post("/api/notifications/read-all")
async def notifications_read_all(request: Request, user=Depends(require_user)):
    """Marcar leídas: delete notifications of the logged-in profile only."""
    session_email = str(user["email"] or "").strip().lower()
    uid = int(user["id"])
    if uid <= 0 or not session_email:
        raise HTTPException(status_code=401, detail="No autenticado")
    asked = ""
    ctype = (request.headers.get("content-type") or "").lower()
    if "application/json" in ctype:
        try:
            payload = await request.json()
        except Exception:
            payload = None
        if isinstance(payload, dict):
            asked = str(payload.get("email") or "").strip().lower()
    if asked and asked != session_email:
        raise HTTPException(
            status_code=403,
            detail="Solo puedes borrar las notificaciones de tu perfil",
        )
    n = db.delete_all_notifications(user_id=uid, email=session_email)
    return {
        "deleted": n,
        "marked": n,
        "unread": db.count_unread_notifications(user_id=uid),
        "email": session_email,
        "userId": uid,
    }


class PushSubscribeBody(BaseModel):
    endpoint: str = ""
    keys: dict[str, Any] | None = None


class PushUnsubscribeBody(BaseModel):
    endpoint: str = ""


def _push_keys_ok(endpoint: str, p256dh: str, auth: str) -> bool:
    endpoint_s = (endpoint or "").strip()
    if not endpoint_s.startswith("https://") or len(endpoint_s) > 2000:
        return False
    host = (urlparse(endpoint_s).hostname or "").lower()
    if not host or host in ("localhost", "127.0.0.1") or host.endswith(".local"):
        return False
    if not p256dh or not auth or len(p256dh) > 300 or len(auth) > 300:
        return False
    return True


def _vapid_material() -> dict[str, str]:
    # Claves VAPID: del entorno del servidor (SNAKEOS_VAPID_PUBLIC / SNAKEOS_VAPID_PRIVATE_B64). Nunca se imprimen.
    _pub = os.environ.get("SNAKEOS_VAPID_PUBLIC", "").strip()
    _priv64 = os.environ.get("SNAKEOS_VAPID_PRIVATE_B64", "").strip()
    if _pub and _priv64:
        import base64 as _b64
        try:
            return {"publicKey": _pub, "privateKey": _b64.b64decode(_priv64).decode("ascii")}
        except Exception:
            pass
    path = db.DATA_DIR / "vapid.json"
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("publicKey") and data.get("privateKey"):
                return {
                    "publicKey": str(data["publicKey"]),
                    "privateKey": str(data["privateKey"]),
                }
        except Exception:
            pass
    from py_vapid import Vapid
    from cryptography.hazmat.primitives import serialization
    import base64

    vapid = Vapid()
    vapid.generate_keys()
    raw = vapid.public_key.public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    pub = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    priv = vapid.private_pem().decode("ascii")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"publicKey": pub, "privateKey": priv}),
        encoding="utf-8",
    )
    try:
        os.chmod(path, 0o600)
    except Exception:
        pass
    return {"publicKey": pub, "privateKey": priv}


def _web_push_headers(payload: dict[str, Any]) -> dict[str, str]:
    """One high-priority push per call. Topic collapses undelivered retries."""
    action = str(payload.get("action") or "")
    headers = {"Urgency": "high" if action == "ring" else "normal"}
    tag = str(payload.get("tag") or "").strip()
    if tag:
        headers["Topic"] = hashlib.sha256(tag.encode("utf-8")).hexdigest()[:32]
    return headers


def _send_web_push_sync(user_id: int, payload: dict[str, Any]) -> None:
    """Best-effort Web Push to this profile's browsers. Never raises."""
    if int(user_id) in _PUSH_DND and payload.get("action") != "stop":
        return
    try:
        from pywebpush import webpush
    except Exception:
        return
    try:
        material = _vapid_material()
        subs = db.list_push_subscriptions(user_id=int(user_id))
    except Exception:
        return
    body = json.dumps(payload, ensure_ascii=False)
    for sub in subs:
        endpoint = str(sub.get("endpoint") or "")
        try:
            webpush(
                subscription_info={
                    "endpoint": endpoint,
                    "keys": {
                        "p256dh": str(sub.get("p256dh") or ""),
                        "auth": str(sub.get("auth") or ""),
                    },
                },
                data=body,
                vapid_private_key=material["privateKey"],
                vapid_claims={"sub": "mailto:snakeos@dogaemail.com"},
                ttl=60,
                timeout=8,
                headers=_web_push_headers(payload),
            )
        except Exception as exc:
            resp = getattr(exc, "response", None)
            status_code = getattr(resp, "status_code", None)
            if status_code in (404, 410) and endpoint:
                try:
                    db.delete_push_subscription_by_endpoint(endpoint=endpoint)
                except Exception:
                    pass


_PUSH_DND_PATH = db.DATA_DIR / "push_dnd.json"
try:
    _PUSH_DND: set[int] = set(int(x) for x in json.loads(_PUSH_DND_PATH.read_text(encoding="utf-8")))
except Exception:
    _PUSH_DND = set()


def _push_dnd_set(user_id: int, on: bool) -> None:
    (_PUSH_DND.add if on else _PUSH_DND.discard)(int(user_id))
    try:
        _PUSH_DND_PATH.write_text(json.dumps(sorted(_PUSH_DND)), encoding="utf-8")
    except Exception:
        pass


def _notif_push_payload(notif: dict[str, Any]) -> dict[str, Any]:
    data = notif.get("data") if isinstance(notif.get("data"), dict) else {}
    return {
        "kind": "notif",
        "title": str(notif.get("title") or "Snake OS!")[:120],
        "body": str(notif.get("body") or "")[:180],
        "tag": ("mv-" if data.get("app") == "metaverse" else "dc-") + str(data.get("messageId") or data.get("roomId") or data.get("eventId") or data.get("peerEmail") or notif.get("title") or "chat"),
        "url": "/",
        "app": str(data.get("app") or ""),
        "peerEmail": str(data.get("peerEmail") or ""),
        "icon": "/static/assets/phone-icon.png",
    }


def _queue_notif_push(user_id: int, notif: dict[str, Any]) -> None:
    try:
        asyncio.create_task(_schedule_web_push(int(user_id), _notif_push_payload(notif)))
    except Exception:
        pass


async def _schedule_web_push(user_id: int, payload: dict[str, Any]) -> None:
    try:
        await asyncio.to_thread(_send_web_push_sync, int(user_id), payload)
    except Exception:
        pass


def _call_push_payload(
    *,
    action: str,
    call_id: str,
    title: str = "",
    body: str = "",
    peer_email: str = "",
    call_kind: str = "",
    peer_name: str = "",
    media: str = "audio",
) -> dict[str, Any]:
    kind = call_kind or ("incoming" if action == "ring" else "")
    return {
        "action": action,
        "title": (title or "Llamada de voz")[:120],
        "body": (body or "")[:180],
        "tag": "call-" + str(call_id),
        "callId": str(call_id),
        "callKind": kind,
        "sound": "/static/ringtone.mp3?v=202610141730",
        "url": "/",
        "peerEmail": peer_email or "",
        "peerName": (peer_name or "")[:80],
        "media": "video" if media == "video" else "audio",
        "icon": "/static/assets/phone-icon.png",
        "requireInteraction": action == "ring",
        "renotify": False,
    }


@app.get("/api/push/vapid-public")
def push_vapid_public(user=Depends(require_user)):
    try:
        material = _vapid_material()
    except Exception:
        raise HTTPException(status_code=503, detail="Avisos push no disponibles")
    return {"publicKey": material["publicKey"]}


@app.post("/api/push/subscribe")
def push_subscribe(body: PushSubscribeBody, user=Depends(require_user)):
    keys = body.keys or {}
    p256 = str(keys.get("p256dh") or "")
    auth_key = str(keys.get("auth") or "")
    endpoint = (body.endpoint or "").strip()
    if not _push_keys_ok(endpoint, p256, auth_key):
        raise HTTPException(status_code=400, detail="Suscripción push no válida")
    try:
        db.upsert_push_subscription(
            user_id=int(user["id"]),
            endpoint=endpoint,
            p256dh=p256,
            auth=auth_key,
            created_at=time_mod.time(),
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Suscripción push no válida")
    return {"ok": True, "email": str(user["email"]).strip().lower()}


class PushDndBody(BaseModel):
    on: bool = False


@app.post("/api/push/dnd")
def push_dnd(body: PushDndBody, user=Depends(require_user)):
    _push_dnd_set(int(user["id"]), bool(body.on))
    return {"ok": True, "dnd": bool(body.on)}


@app.post("/api/push/unsubscribe")
def push_unsubscribe(body: PushUnsubscribeBody, user=Depends(require_user)):
    n = db.delete_push_subscription(user_id=int(user["id"]), endpoint=body.endpoint or "")
    return {"ok": True, "removed": n}


@app.post("/api/notifications/{notif_id}/open")
def notifications_open(notif_id: int, user=Depends(require_user)):
    uid = int(user["id"])
    row = db.get_notification(user_id=uid, notif_id=int(notif_id))
    if not row:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    db.mark_notification_read(user_id=uid, notif_id=int(notif_id))
    data = row.get("data") or {}
    peer_email = str(data.get("peerEmail") or "").strip().lower()
    if peer_email and row.get("kind") == "chat":
        peer = db.get_user_by_email(peer_email)
        if peer:
            db.mark_chat_messages_read(
                user_id=uid,
                peer_user_id=int(peer["id"]),
                read_at=time_mod.time(),
            )
            db.mark_chat_notifications_read_for_peer(user_id=uid, peer_email=peer_email)
    open_app = data.get("app")
    if not open_app:
        if row.get("kind") == "chat":
            open_app = "chat"
        elif row.get("kind") == "metaverse":
            open_app = "metaverse"
    room_id = str(data.get("roomId") or data.get("eventId") or "").strip() or None
    world_id = str(data.get("world") or "").strip() or None
    return {
        "notification": db.get_notification(user_id=uid, notif_id=int(notif_id)),
        "action": {
            "openApp": open_app,
            "peerEmail": peer_email or None,
            "roomId": room_id,
            "world": world_id,
            "eventId": str(data.get("eventId") or room_id or "").strip() or None,
            "liveId": str(data.get("liveId") or "").strip() or None,
        },
        "unread": db.count_unread_notifications(user_id=uid),
    }


class AddedAccountBody(BaseModel):
    query: str = ""


@app.get("/api/added-accounts")
def list_added_accounts(user=Depends(require_user)):
    return {"accounts": added_accounts.list_for(int(user["id"]))}


async def _push_account_request(to_id: int, title: str, body: str, data: dict) -> None:
    notif = db.create_notification(
        user_id=int(to_id),
        kind="account_request",
        title=(title or "")[:200],
        body=(body or "")[:500],
        data=data or {},
        created_at=time_mod.time(),
    )
    unread = db.count_unread_notifications(user_id=int(to_id))
    await chat_hub.send_to_user(int(to_id), {
        "type": "notification",
        "notification": notif,
        "unread": unread,
    })
    _queue_notif_push(int(to_id), notif)
    await chat_hub.send_to_user(int(to_id), {"type": "account_request"})


def _who_name(user) -> str:
    try:
        return str(user["name"] or "Alguien")
    except Exception:
        return "Alguien"


@app.get("/api/added-accounts/requests")
def list_account_requests(user=Depends(require_user)):
    return added_accounts.list_requests(int(user["id"]))


@app.post("/api/added-accounts")
async def post_added_account(body: AddedAccountBody, user=Depends(require_user)):
    try:
        result = added_accounts.add_query(int(user["id"]), body.query)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if result.get("status") == "pending" and result.get("created"):
        person = ((result.get("request") or {}).get("user") or {})
        pid = int(person.get("id") or 0)
        if pid:
            try:
                await _push_account_request(
                    pid,
                    "Solicitud de cuenta",
                    _who_name(user) + " quiere añadirte",
                    {"app": "account-request", "requestId": (result.get("request") or {}).get("id")},
                )
            except Exception:
                pass
    elif result.get("acceptedRequestId"):
        person = result.get("account") or {}
        pid = int(person.get("id") or 0)
        if pid:
            try:
                await _push_account_request(
                    pid,
                    "Solicitud aceptada",
                    _who_name(user) + " ha aceptado. Ya podéis chatear y llamaros.",
                    {"app": "account-request"},
                )
            except Exception:
                pass
    return result


@app.post("/api/added-accounts/requests/{request_id}/accept")
async def accept_account_request(request_id: int, user=Depends(require_user)):
    try:
        result = added_accounts.accept(int(user["id"]), int(request_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    from_id = int(result.get("fromId") or 0)
    if from_id:
        try:
            await chat_hub.send_to_user(int(user["id"]), {"type": "account_request"})
            await _push_account_request(
                from_id,
                "Solicitud aceptada",
                _who_name(user) + " ha aceptado. Ya podéis chatear y llamaros.",
                {"app": "account-request"},
            )
        except Exception:
            pass
    return {"status": "added", "account": result.get("account")}


@app.post("/api/added-accounts/requests/{request_id}/reject")
async def reject_account_request(request_id: int, user=Depends(require_user)):
    try:
        result = added_accounts.reject(int(user["id"]), int(request_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    from_id = int(result.get("fromId") or 0)
    if from_id:
        try:
            await chat_hub.send_to_user(int(user["id"]), {"type": "account_request"})
            await _push_account_request(
                from_id,
                "Solicitud rechazada",
                _who_name(user) + " ha rechazado la solicitud.",
                {"app": "account-request"},
            )
        except Exception:
            pass
    return {"status": "rejected"}


@app.delete("/api/added-accounts/requests/{request_id}")
async def cancel_account_request(request_id: int, user=Depends(require_user)):
    try:
        result = added_accounts.cancel(int(user["id"]), int(request_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    to_id = int(result.get("toId") or 0)
    if to_id:
        try:
            await chat_hub.send_to_user(int(user["id"]), {"type": "account_request"})
            await _push_account_request(
                to_id,
                "Solicitud cancelada",
                _who_name(user) + " ha cancelado la solicitud.",
                {"app": "account-request"},
            )
        except Exception:
            pass
    return {"status": "cancelled"}


@app.delete("/api/added-accounts/{contact_id}")
async def delete_added_account(contact_id: int, user=Depends(require_user)):
    try:
        result = added_accounts.remove(int(user["id"]), int(contact_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        await chat_hub.send_to_user(int(user["id"]), {"type": "account_request"})
        await _push_account_request(
            int(contact_id),
            "Cuenta quitada",
            _who_name(user) + " te ha quitado de Chat y Teléfono.",
            {"app": "account-request"},
        )
    except Exception:
        pass
    return result

# ===== DOGANIERO PHONE (números ficticios DOG-XXXXXX) =====
_PHONE_BAD_NUMBER = "Número no válido. Los números Doganiero son DOG- y 6 cifras (p. ej. DOG-123456)."


@app.get("/api/phone/me")
def phone_me(user=Depends(require_user)):
    return {"number": dog_phone.ensure_number(int(user["id"]))}


@app.get("/api/phone/contacts")
def phone_contacts(user=Depends(require_user)):
    contacts = []
    for row in added_accounts.list_for(int(user["id"])):
        if not row.get("number"):
            continue
        contacts.append({"id": row["id"], "name": row["name"], "avatar": row["avatar"], "number": row["number"], "pro": bool(row.get("pro"))})
    return {"contacts": contacts}


@app.get("/api/phone/lookup")
def phone_lookup(number: str = Query("", max_length=40), user=Depends(require_user)):
    norm = dog_phone.normalize(number)
    if not norm:
        raise HTTPException(status_code=400, detail=_PHONE_BAD_NUMBER)
    found = dog_phone.lookup(norm)
    if not found:
        raise HTTPException(status_code=404, detail=f"El número {norm} no existe en la red Doganiero.")
    if int(found["id"]) == int(user["id"]):
        found = dict(found, self=True)
        return found
    if not added_accounts.has(int(user["id"]), int(found["id"])):
        raise HTTPException(status_code=403, detail="Solo puedes llamar a números que has añadido.")
    return found


@app.get("/api/phone/recents")
def phone_recents(user=Depends(require_user)):
    return {"calls": dog_phone.recents(int(user["id"]))}
# ===== END DOGANIERO PHONE =====


# ===== DOGANIERO CHAT VOICE CALLS (1:1) =====
# WebRTC signaling + 16 kHz PCM relay. Only the two parties of a call receive media.

_CALL_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,48}$")
_calls_lock = asyncio.Lock()
_calls: dict[str, dict[str, Any]] = {}
_ended_peers: dict[str, dict[str, Any]] = {}


def _remember_ended(snap: dict[str, Any]) -> None:
    now = time_mod.time()
    stale = [key for key, row in _ended_peers.items() if now - float(row.get("at") or 0) > 60]
    for key in stale:
        _ended_peers.pop(key, None)
    _ended_peers[str(snap["id"])] = {
        "caller_id": int(snap["caller_id"]),
        "callee_id": int(snap["callee_id"]),
        "at": now,
        "forwarded": False,
    }


def _brief_user(row) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "email": str(row["email"]).strip().lower(),
        "name": row["name"] or "Usuario",
        "avatar": row["avatar"] or "🐶",
        "number": dog_phone.number_for(int(row["id"])),
        "pro": db.pro_flag(row["id"]),
    }


def _call_snap(c: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": c["id"],
        "caller_id": int(c["caller_id"]),
        "callee_id": int(c["callee_id"]),
        "caller_email": c["caller_email"],
        "callee_email": c["callee_email"],
        "status": c["status"],
        "media": "video" if c.get("media") == "video" else "audio",
        "answered_at": float(c["answered_at"]) if c.get("answered_at") else None,
    }


async def _find_live_call(user_id: int) -> dict[str, Any] | None:
    uid = int(user_id)
    async with _calls_lock:
        for c in _calls.values():
            if c["status"] not in ("ringing", "active"):
                continue
            if uid in (int(c["caller_id"]), int(c["callee_id"])):
                return _call_snap(c)
    return None


async def _take_call(call_id: str, *, allowed: set[str]) -> dict[str, Any] | None:
    async with _calls_lock:
        c = _calls.get(call_id)
        if not c or c["status"] not in allowed:
            return None
        snap = _call_snap(c)
        _calls.pop(call_id, None)
        return snap


async def _persist_call_notice(
    *,
    from_id: int,
    to_id: int,
    text: str,
    notif_title: str,
    notif_body: str,
    notif_for: int,
    peer_for_notif: dict[str, Any],
    call_id: str,
    call_kind: str,
    media: str = "audio",
) -> None:
    ts = time_mod.time()
    saved = db.save_chat_message(
        from_user_id=int(from_id),
        to_user_id=int(to_id),
        text=text,
        created_at=ts,
    )
    msg_payload = {"type": "chat_message", "message": saved}
    await chat_hub.send_to_user(int(from_id), msg_payload)
    await chat_hub.send_to_user(int(to_id), msg_payload)
    notif = db.create_notification(
        user_id=int(notif_for),
        kind="chat",
        title=notif_title[:200],
        body=notif_body[:500],
        data={
            "app": "chat",
            "peerEmail": peer_for_notif.get("email"),
            "peerName": peer_for_notif.get("name"),
            "peerAvatar": peer_for_notif.get("avatar"),
            "peerId": peer_for_notif.get("id"),
            "messageId": saved["id"],
            "callId": call_id,
            "callKind": call_kind,
            "peerNumber": peer_for_notif.get("number") or "",
            "media": "video" if media == "video" else "audio",
        },
        created_at=ts,
    )
    await chat_hub.send_to_user(
        int(notif_for),
        {
            "type": "notification",
            "notification": notif,
            "unread": db.count_unread_notifications(user_id=int(notif_for)),
        },
    )
    peer_email = str(peer_for_notif.get("email") or "")
    if call_kind == "incoming":
        asyncio.create_task(
            _schedule_web_push(
                int(notif_for),
                _call_push_payload(
                    action="ring",
                    call_id=call_id,
                    title=notif_title,
                    body=notif_body,
                    peer_email=peer_email,
                    call_kind="incoming",
                    peer_name=str(peer_for_notif.get("name") or ""),
                    media=media,
                ),
            )
        )
    elif call_kind == "missed":
        asyncio.create_task(
            _schedule_web_push(
                int(notif_for),
                _call_push_payload(
                    action="missed",
                    call_id=call_id,
                    title=notif_title,
                    body=notif_body,
                    peer_email=peer_email,
                    call_kind="missed",
                    peer_name=str(peer_for_notif.get("name") or ""),
                    media=media,
                ),
            )
        )


async def _send_call(user_id: int, payload: dict[str, Any]) -> None:
    await chat_hub.send_to_user(int(user_id), payload)


async def _ring_timeout(call_id: str) -> None:
    try:
        await asyncio.sleep(45)
    except asyncio.CancelledError:
        return
    snap = await _take_call(call_id, allowed={"ringing"})
    if not snap:
        return
    await _emit_missed(snap)


async def _emit_missed(snap: dict[str, Any]) -> None:
    try:
        dog_phone.log_call_status(snap["id"], "missed")
    except Exception:
        pass
    caller = db.get_user_by_id(int(snap["caller_id"]))
    callee = db.get_user_by_id(int(snap["callee_id"]))
    if not caller or not callee:
        return
    cb = _brief_user(caller)
    eb = _brief_user(callee)
    video = snap.get("media") == "video"
    text = f"📞 Videollamada perdida de {cb['name']}" if video else f"📞 Llamada perdida de {cb['name']}"
    try:
        await _persist_call_notice(
            from_id=cb["id"],
            to_id=eb["id"],
            text=text,
            notif_title=(f"Videollamada perdida de {cb['name']}" if video else f"Llamada perdida de {cb['name']}"),
            notif_body=(f"No contestaste la videollamada de {cb['name']}" if video else f"No contestaste la llamada de {cb['name']}"),
            notif_for=eb["id"],
            peer_for_notif=cb,
            call_id=snap["id"],
            call_kind="missed",
            media="video" if video else "audio",
        )
    except Exception:
        pass
    payload = {"type": "call_missed", "callId": snap["id"], "from": cb, "to": eb, "media": "video" if video else "audio"}
    await _send_call(cb["id"], payload)
    await _send_call(eb["id"], payload)


async def _emit_declined(snap: dict[str, Any]) -> None:
    try:
        dog_phone.log_call_status(snap["id"], "declined")
    except Exception:
        pass
    caller = db.get_user_by_id(int(snap["caller_id"]))
    callee = db.get_user_by_id(int(snap["callee_id"]))
    if not caller or not callee:
        return
    cb = _brief_user(caller)
    eb = _brief_user(callee)
    video = snap.get("media") == "video"
    text = f"📞 {eb['name']} rechazó la videollamada" if video else f"📞 {eb['name']} rechazó la llamada"
    try:
        await _persist_call_notice(
            from_id=eb["id"],
            to_id=cb["id"],
            text=text,
            notif_title=(f"{eb['name']} rechazó la videollamada" if video else f"{eb['name']} rechazó la llamada"),
            notif_body=("La videollamada fue rechazada." if video else "La llamada de voz fue rechazada."),
            notif_for=cb["id"],
            peer_for_notif=eb,
            call_id=snap["id"],
            call_kind="declined",
            media="video" if video else "audio",
        )
    except Exception:
        pass
    payload = {"type": "call_declined", "callId": snap["id"], "from": eb, "media": "video" if snap.get("media") == "video" else "audio"}
    await _send_call(cb["id"], payload)
    await _send_call(eb["id"], payload)
    asyncio.create_task(
        _schedule_web_push(
            int(eb["id"]),
            _call_push_payload(action="stop", call_id=snap["id"], call_kind="incoming"),
        )
    )


async def _emit_ended(snap: dict[str, Any], reason: str) -> None:
    _remember_ended(snap)
    try:
        dog_phone.log_call_status(snap["id"], "ended")
    except Exception:
        pass
    if snap.get("answered_at") or snap.get("status") == "active":
        if placa_required():
            _queue_board_line("~c?")
        else:
            answered = float(snap.get("answered_at") or time_mod.time())
            total = max(0, int(time_mod.time() - answered))
            await _send_local_call_duration(str(snap["id"]), total // 60, total % 60)
    payload = {"type": "call_ended", "callId": snap["id"], "reason": reason, "media": snap.get("media") or "audio"}
    await _send_call(int(snap["caller_id"]), payload)
    await _send_call(int(snap["callee_id"]), payload)
    stop = _call_push_payload(action="stop", call_id=snap["id"], call_kind="incoming")
    asyncio.create_task(_schedule_web_push(int(snap["callee_id"]), stop))
    asyncio.create_task(_schedule_web_push(int(snap["caller_id"]), stop))


async def _push_pending_calls(user_id: int, websocket: WebSocket) -> None:
    uid = int(user_id)
    pending: list[dict[str, Any]] = []
    async with _calls_lock:
        for c in _calls.values():
            if int(c["callee_id"]) == uid and c["status"] == "ringing":
                pending.append(_call_snap(c))
            elif int(c["caller_id"]) == uid and c["status"] in ("ringing", "active"):
                pending.append(_call_snap(c))
    for snap in pending:
        if int(snap["callee_id"]) == uid and snap["status"] == "ringing":
            caller = db.get_user_by_id(int(snap["caller_id"]))
            if not caller:
                continue
            await websocket.send_text(
                json.dumps(
                    {"type": "call_invite", "callId": snap["id"], "from": _brief_user(caller), "media": snap.get("media") or "audio"},
                    ensure_ascii=False,
                )
            )
        elif int(snap["caller_id"]) == uid:
            callee = db.get_user_by_id(int(snap["callee_id"]))
            if not callee:
                continue
            kind = "call_ringing" if snap["status"] == "ringing" else "call_answered"
            await websocket.send_text(
                json.dumps(
                    {"type": kind, "callId": snap["id"], "to": _brief_user(callee), "peer": _brief_user(callee), "media": snap.get("media") or "audio"},
                    ensure_ascii=False,
                )
            )


def _other_id(snap: dict[str, Any], uid: int) -> int | None:
    if uid == int(snap["caller_id"]):
        return int(snap["callee_id"])
    if uid == int(snap["callee_id"]):
        return int(snap["caller_id"])
    return None


async def _handle_chat_voice(uid: int, msg: dict[str, Any], websocket: WebSocket) -> None:
    mtype = str(msg.get("type") or "")
    if mtype == "call_invite":
        to_email = str(msg.get("to") or "").strip().lower()
        call_id = str(msg.get("callId") or "").strip()
        if not _CALL_ID_RE.match(call_id):
            await websocket.send_text(json.dumps({"type": "call_error", "detail": "Identificador de llamada no válido"}, ensure_ascii=False))
            return
        me = db.get_user_by_id(uid)
        peer = db.get_user_by_email(to_email) if to_email else None
        if not peer and not to_email and msg.get("toNumber") is not None:
            # Doganiero Phone: marcar por número DOG-XXXXXX
            norm_number = dog_phone.normalize(msg.get("toNumber"))
            if not norm_number:
                await websocket.send_text(json.dumps({"type": "call_error", "callId": call_id, "detail": _PHONE_BAD_NUMBER}, ensure_ascii=False))
                return
            found_number = dog_phone.lookup(norm_number)
            if not found_number:
                await websocket.send_text(json.dumps({"type": "call_error", "callId": call_id, "detail": f"El número {norm_number} no existe en la red Doganiero."}, ensure_ascii=False))
                return
            peer = db.get_user_by_id(int(found_number["id"]))
        if not me or not peer:
            await websocket.send_text(json.dumps({"type": "call_error", "callId": call_id, "detail": "Usuario no encontrado"}, ensure_ascii=False))
            return
        if int(peer["id"]) == uid:
            await websocket.send_text(json.dumps({"type": "call_error", "callId": call_id, "detail": "No puedes llamarte a ti mismo"}, ensure_ascii=False))
            return
        if not added_accounts.has(uid, int(peer["id"])):
            await websocket.send_text(json.dumps({"type": "call_error", "callId": call_id, "detail": "Solo puedes llamar a cuentas que has añadido."}, ensure_ascii=False))
            return
        if await _find_live_call(uid) or await _find_live_call(int(peer["id"])):
            await websocket.send_text(json.dumps({"type": "call_error", "callId": call_id, "detail": "Ocupado: ya hay una llamada en curso"}, ensure_ascii=False))
            return
        cb = _brief_user(me)
        eb = _brief_user(peer)
        async with _calls_lock:
            if call_id in _calls:
                await websocket.send_text(json.dumps({"type": "call_error", "callId": call_id, "detail": "Esa llamada ya existe"}, ensure_ascii=False))
                return
            media = "video" if str(msg.get("media") or "") == "video" else "audio"
            _calls[call_id] = {
                "id": call_id,
                "caller_id": uid,
                "callee_id": int(peer["id"]),
                "caller_email": cb["email"],
                "callee_email": eb["email"],
                "status": "ringing",
                "media": media,
            }
        video = media == "video"
        try:
            dog_phone.log_call_start(call_id, uid, int(peer["id"]), media)
        except Exception:
            pass
        via_i9 = str(msg.get("via") or "") == "i9" and not video
        if via_i9:
            who = str(cb.get("name") or "").strip()
            if not who or who == "Usuario":
                who = str(cb.get("email") or "").strip() or "Alguien"
            text = who + " ha solicitado llamarte a través de server i9."
            notice_title = text
            notice_body = text
        else:
            text = (
                f"📞 {cb['name']} te está haciendo una videollamada"
                if video else f"📞 {cb['name']} te está llamando"
            )
            notice_title = f"{cb['name']} te está haciendo una videollamada" if video else f"{cb['name']} te está llamando"
            notice_body = (f"Videollamada de {cb['name']}" if video else f"Llamada de voz de {cb['name']}") + (f" · {cb['number']}" if cb.get("number") else "")
        try:
            await _persist_call_notice(
                from_id=cb["id"],
                to_id=eb["id"],
                text=text,
                notif_title=notice_title,
                notif_body=notice_body,
                notif_for=eb["id"],
                peer_for_notif=cb,
                call_id=call_id,
                call_kind="incoming",
                media=media,
            )
        except Exception:
            pass
        invite = {"type": "call_invite", "callId": call_id, "from": cb, "media": media}
        await _send_call(eb["id"], invite)
        await websocket.send_text(json.dumps({"type": "call_ringing", "callId": call_id, "to": eb, "media": media}, ensure_ascii=False))
        asyncio.create_task(_ring_timeout(call_id))
        return

    call_id = str(msg.get("callId") or "").strip()
    if not _CALL_ID_RE.match(call_id):
        return
    if mtype == "call_duration":
        return
    async with _calls_lock:
        current = _calls.get(call_id)
        snap_live = _call_snap(current) if current else None

    if mtype == "call_answer":
        if not snap_live or int(snap_live["callee_id"]) != uid:
            await websocket.send_text(json.dumps({"type": "call_error", "callId": call_id, "detail": "La llamada ya no está disponible"}, ensure_ascii=False))
            return
        if snap_live["status"] not in ("ringing", "active"):
            await websocket.send_text(json.dumps({"type": "call_error", "callId": call_id, "detail": "La llamada ya no está disponible"}, ensure_ascii=False))
            return
        async with _calls_lock:
            c = _calls.get(call_id)
            if not c or c["status"] not in ("ringing", "active") or int(c["callee_id"]) != uid:
                return
            c["status"] = "active"
            if not c.get("answered_at"):
                c["answered_at"] = time_mod.time()
            snap_live = _call_snap(c)
            if placa_required():
                _queue_board_line("~c1")
        caller = db.get_user_by_id(int(snap_live["caller_id"]))
        callee = db.get_user_by_id(int(snap_live["callee_id"]))
        if not caller or not callee:
            return
        answered = {
            "type": "call_answered",
            "callId": call_id,
            "from": _brief_user(callee),
            "peer": _brief_user(caller),
        }
        # Caller learns the callee answered; callee gets the same so media can start.
        media = snap_live.get("media") or "audio"
        await _send_call(int(snap_live["caller_id"]), {"type": "call_answered", "callId": call_id, "from": _brief_user(callee), "peer": _brief_user(callee), "media": media})
        await _send_call(int(snap_live["callee_id"]), {"type": "call_answered", "callId": call_id, "from": _brief_user(caller), "peer": _brief_user(caller), "media": media})
        try:
            dog_phone.log_call_status(call_id, "answered")
        except Exception:
            pass
        asyncio.create_task(
            _schedule_web_push(
                int(snap_live["callee_id"]),
                _call_push_payload(action="stop", call_id=call_id, call_kind="incoming"),
            )
        )
        return

    if mtype == "call_decline":
        if not snap_live or int(snap_live["callee_id"]) != uid:
            return
        taken = await _take_call(call_id, allowed={"ringing"})
        if taken:
            await _emit_declined(taken)
        return

    if mtype == "call_hangup":
        if not snap_live or uid not in (int(snap_live["caller_id"]), int(snap_live["callee_id"])):
            return
        if snap_live["status"] == "ringing" and uid == int(snap_live["caller_id"]):
            taken = await _take_call(call_id, allowed={"ringing"})
            if taken:
                await _emit_missed(taken)
            return
        if snap_live["status"] == "ringing" and uid == int(snap_live["callee_id"]):
            taken = await _take_call(call_id, allowed={"ringing"})
            if taken:
                await _emit_declined(taken)
            return
        taken = await _take_call(call_id, allowed={"active"})
        if taken:
            # reason=error: WebRTC failed on the client. Socket drop stays "disconnect" below.
            end_reason = "disconnect" if str(msg.get("reason") or "") == "error" else "hangup"
            await _emit_ended(taken, end_reason)
        return

    if mtype in ("voice_signal", "voice_pcm", "video_frame"):
        if not snap_live or snap_live["status"] != "active":
            return
        if uid not in (int(snap_live["caller_id"]), int(snap_live["callee_id"])):
            return
        other = _other_id(snap_live, uid)
        if not other:
            return
        me = db.get_user_by_id(uid)
        email = str(me["email"]).strip().lower() if me else ""
        if mtype == "voice_signal":
            signal = msg.get("signal")
            if not isinstance(signal, dict):
                return
            raw = json.dumps(signal)
            if len(raw) > 20000:
                return
            await _send_call(other, {"type": "voice_signal", "callId": call_id, "from": email, "signal": signal})
            return
        if mtype == "video_frame":
            if snap_live.get("media") != "video":
                return
            jpeg = msg.get("jpeg")
            if not isinstance(jpeg, str) or len(jpeg) < 16 or len(jpeg) > 80000:
                return
            await _send_call(other, {"type": "video_frame", "callId": call_id, "from": email, "jpeg": jpeg})
            return
        pcm = msg.get("pcm")
        if not isinstance(pcm, str) or not pcm or len(pcm) > 12000:
            return
        await _send_call(
            other,
            {
                "type": "voice_pcm",
                "callId": call_id,
                "from": email,
                "rate": int(msg.get("rate") or 16000),
                "pcm": pcm,
            },
        )


async def _end_calls_for_disconnect(user_id: int) -> None:
    async with chat_hub._lock:
        still = list(chat_hub._clients.get(int(user_id), []))
    if still:
        return
    uid = int(user_id)
    async with _calls_lock:
        ids = [
            c["id"]
            for c in _calls.values()
            if c["status"] in ("ringing", "active") and uid in (int(c["caller_id"]), int(c["callee_id"]))
        ]
    for cid in ids:
        async with _calls_lock:
            c = _calls.get(cid)
            snap = _call_snap(c) if c else None
        if not snap:
            continue
        if snap["status"] == "ringing" and uid == int(snap["caller_id"]):
            taken = await _take_call(cid, allowed={"ringing"})
            if taken:
                await _emit_missed(taken)
        elif snap["status"] == "ringing" and uid == int(snap["callee_id"]):
            # Callee offline while ringing: keep the invite until timeout / caller hangup.
            continue
        elif snap["status"] == "active":
            taken = await _take_call(cid, allowed={"active"})
            if taken:
                await _emit_ended(taken, "disconnect")

# ===== END DOGANIERO CHAT VOICE CALLS =====

@app.websocket("/api/chat/ws")
async def chat_ws(websocket: WebSocket):
    await websocket.accept()
    if not await _i9_ws_enter(websocket):
        return
    sid = websocket.cookies.get(COOKIE_NAME)
    user_row = user_from_session(sid)
    if not user_row:
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "detail": "No autenticado"}, ensure_ascii=False)
            )
        except Exception:
            pass
        await _ws_close_quiet(websocket, 4401)
        _i9_untrack(websocket)
        return
    uid = int(user_row["id"])
    await chat_hub.connect(uid, websocket)
    try:
        await websocket.send_text(
            json.dumps(
                {
                    "type": "hello",
                    "unread": db.count_unread_notifications(user_id=uid),
                },
                ensure_ascii=False,
            )
        )
        await _push_pending_calls(uid, websocket)
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if not isinstance(msg, dict):
                continue
            mtype = msg.get("type")
            if mtype == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                continue
            if mtype == "loc_share":
                try:
                    await _handle_loc_share(uid, msg, user_row)
                except Exception:
                    pass
                continue
            if mtype in ("chat_typing", "chat_seen"):
                try:
                    to_email = str(msg.get("to") or "").strip().lower()[:200]
                    peer_row = db.get_user_by_email(to_email) if to_email else None
                    if peer_row and int(peer_row["id"]) != uid:
                        pid = int(peer_row["id"])
                        if mtype == "chat_seen":
                            if db.mark_chat_messages_read(user_id=uid, peer_user_id=pid, read_at=time_mod.time()):
                                db.mark_chat_notifications_read_for_peer(user_id=uid, peer_email=to_email)
                            await chat_hub.send_to_user(pid, {"type": "chat_read", "by": user_row["email"]})
                        else:
                            await chat_hub.send_to_user(pid, {"type": "chat_typing", "from": user_row["email"]})
                except Exception:
                    pass
                continue
            if mtype in ("call_invite", "call_answer", "call_decline", "call_hangup", "call_duration", "voice_signal", "voice_pcm", "video_frame"):
                try:
                    await _handle_chat_voice(uid, msg, websocket)
                except Exception as _voice_exc:
                    try:
                        print(f"[phone-call] {mtype} {type(_voice_exc).__name__}: {_voice_exc}", flush=True)
                    except Exception:
                        pass
                    try:
                        await websocket.send_text(json.dumps({"type": "call_error", "detail": "No se pudo completar la llamada"}, ensure_ascii=False))
                    except Exception:
                        pass
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _i9_untrack(websocket)
        await chat_hub.disconnect(uid, websocket)
        try:
            await _end_calls_for_disconnect(uid)
        except Exception:
            pass
        try:
            await _loc_end_if_offline(uid, user_row)
        except Exception:
            pass


# ===== END DOGANIERO CHAT =====


# ===== END METAVERSE =====





@app.get("/api/doganiero-tv")
def api_doganiero_tv(user=Depends(require_user)):
    """Per-profile Doganiero TV status. Huesitos come from bone_score, not coins."""
    return db.get_doganiero_tv(int(user["id"]))


@app.post("/api/doganiero-tv/subscribe")
def api_doganiero_tv_subscribe(user=Depends(require_user)):
    """Deduct 5 huesitos for 30 days. Rejects when huesitos < 5. Does not touch coins."""
    result = db.subscribe_doganiero_tv(int(user["id"]))
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail="Necesitas 5 huesitos")
    return result


@app.get("/accounts")
def accounts_page(_admin: str = Depends(require_accounts_admin)):
    return FileResponse("accounts.html")


@app.get("/placa")
def placa_page():
    return FileResponse(
        "placa.html",
        media_type="text/html; charset=utf-8",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


@app.get("/")
def index(request: Request):
    if _UPDATING_FLAG.exists() and _MAINT_HTML.exists():
        # Solo durante el breve despliegue y solo para cargas nuevas: pantalla 503.
        return FileResponse(str(_MAINT_HTML), status_code=503, media_type="text/html",
                            headers={"Cache-Control": "no-store", "Retry-After": "5"})
    # Siempre pedir login de cuenta otra vez: no reanudar perfil abierto.
    # También se limpia la cookie del gate OS (como antes).
    resp = Response(
        content=_render_index(),
        media_type="text/html; charset=utf-8",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Cloudflare-CDN-Cache-Control": "no-store",
            "Pragma": "no-cache",
            "X-Snake-Version": _os_version(),
        },
    )
    end_session(request.cookies.get(COOKIE_NAME))
    clear_session_cookie(resp)
    clear_os_gate_cookie(resp)
    return resp




@app.get("/static/prism.js")
def serve_prism_js():
    """Prism 3D programming language client."""
    return FileResponse(
        "prism.js",
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Cloudflare-CDN-Cache-Control": "no-store",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/static/doganiero-tv.js")
def serve_doganiero_tv_js():
    """Doganiero TV client. no-store so phones pick up the latest episode build."""
    return FileResponse(
        "doganiero-tv.js",
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Cloudflare-CDN-Cache-Control": "no-store",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/static/metaverse.js")
def serve_metaverse_js():
    """Serve 3D metaverse client (Three.js); no-store so CF/phone pick up latest metaverse client."""
    return FileResponse(
        "metaverse.js",
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Cloudflare-CDN-Cache-Control": "no-store",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )



@app.get("/static/doganiero-chat.js")
def serve_doganiero_chat_js():
    """Serve Doganiero Chat client; no-store so CF/phone do not keep stale dup-fix builds."""
    return FileResponse(
        "doganiero-chat.js",
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Cloudflare-CDN-Cache-Control": "no-store",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )



@app.get("/static/desktop-extras.js")
def serve_desktop_extras_js():
    """Serve desktop extras (theme/wallpaper/screenshot/launcher); no-store for CF/phone."""
    return FileResponse(
        "desktop-extras.js",
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Cloudflare-CDN-Cache-Control": "no-store",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/snake-os-sw.js")
def serve_snake_os_sw():
    """Service Worker at site root scope for native OS notifications."""
    return FileResponse(
        "snake-os-sw.js",
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Cloudflare-CDN-Cache-Control": "no-store",
            "Service-Worker-Allowed": "/",
            "Surrogate-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/manifest.webmanifest")
def serve_web_manifest():
    return FileResponse(
        "manifest.webmanifest",
        media_type="application/manifest+json",
        headers={
            "Cache-Control": "no-store, max-age=0",
            "CDN-Cache-Control": "no-store",
        },
    )




# ===== /static seguro: solo recursos públicos (lista blanca) =====
# Antes se servía toda la carpeta del proyecto (.env, main.py, data/snakeos.db...).
# Ahora solo ficheros de la raíz o de assets/ con extensiones de recursos web;
# cualquier otra cosa devuelve 404.
from starlette.exceptions import HTTPException as _StarletteHTTPException



import threading as _lite_threading

_lite_presence = {}
_lite_presence_lock = _lite_threading.Lock()


class LiteHere(BaseModel):
    ip: str = ""
    port: int = 2323


def _lite_lan(ip):
    parts = str(ip or "").split(".")
    if len(parts) != 4:
        return False
    try:
        nums = [int(part) for part in parts]
    except ValueError:
        return False
    if any(num < 0 or num > 255 for num in nums):
        return False
    if nums[0] == 10 or (nums[0] == 192 and nums[1] == 168):
        return True
    return nums[0] == 172 and 16 <= nums[1] <= 31


@app.post("/api/snake-os-lite/presence")
def snake_os_lite_here(body: LiteHere):
    ip = str(body.ip or "").strip()
    port = int(body.port or 2323)
    if not _lite_lan(ip) or port < 1 or port > 65535:
        raise HTTPException(status_code=400, detail="Ese ordenador no esta en la red.")
    with _lite_presence_lock:
        _lite_presence[ip] = {"ip": ip, "port": port, "ts": time.time()}
    return {"ok": True}


@app.get("/api/snake-os-lite/presence")
def snake_os_lite_boards():
    now = time.time()
    with _lite_presence_lock:
        fresh = []
        stale = []
        for ip, item in _lite_presence.items():
            if now - float(item.get("ts") or 0) < 15:
                fresh.append({"ip": item["ip"], "port": item["port"]})
            else:
                stale.append(ip)
        for ip in stale:
            _lite_presence.pop(ip, None)
    return {"boards": fresh}


def _server_i9_alive() -> bool:
    # Sin placa, el sistema no espera el aviso de la Mega.
    if not placa_required():
        return True
    # Misma presencia y los mismos 12 s. No acortar el plazo.
    now = time.time()
    alive = False
    with _lite_presence_lock:
        stale = []
        for ip, item in _lite_presence.items():
            age = now - float(item.get("ts") or 0)
            if 0 <= age < 12:
                alive = True
            else:
                stale.append(ip)
        for ip in stale:
            _lite_presence.pop(ip, None)
    return alive


@app.get("/api/server-i9/connected")
def server_i9_connected():
    # Solo presencia reciente. Un aviso viejo no cuenta como conectada.
    return {"connected": _server_i9_alive()}


_I9_OPEN_API = (
    "/api/server-i9/connected",
    "/api/snake-os-lite/presence",
)
_i9_sockets: set[WebSocket] = set()


def _i9_untrack(ws: WebSocket) -> None:
    _i9_sockets.discard(ws)


async def _i9_ws_enter(ws: WebSocket) -> bool:
    if not _server_i9_alive():
        try:
            await ws.close(code=4403)
        except Exception:
            pass
        return False
    _i9_sockets.add(ws)
    return True


async def _i9_socket_sweep() -> None:
    while True:
        await asyncio.sleep(3)
        down = not _server_i9_alive()
        for ws in list(_i9_sockets):
            state = getattr(ws, "client_state", None)
            state_name = getattr(state, "name", "")
            if not down and state_name == "CONNECTED":
                continue
            _i9_sockets.discard(ws)
            if down:
                try:
                    await ws.close(code=4403)
                except Exception:
                    pass


@app.middleware("http")
async def server_i9_api_gate(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and not any(path.startswith(open_path) for open_path in _I9_OPEN_API):
        if not _server_i9_alive():
            return JSONResponse(
                status_code=503,
                content={"connected": False, "detail": "server i9 no está conectada"},
            )
    return await call_next(request)


@app.on_event("startup")
async def _i9_ws_watch_startup() -> None:
    asyncio.create_task(_i9_socket_sweep())


_LITE_DIR = FsPath(__file__).resolve().parent


@app.get("/descargas/snake-os-lite")
def snake_os_lite_page():
    """Pagina de Snake OS Lite, solo para la Arduino Mega 2560."""
    return FileResponse(_LITE_DIR / "snake-os-lite.html", media_type="text/html; charset=utf-8")


@app.get("/descargas/snake-os-lite.hex")
def snake_os_lite_hex():
    """Firmware de Snake OS Lite. El nombre deja claro que es para la Mega 2560."""
    return FileResponse(
        _LITE_DIR / "snake-os-lite.hex",
        media_type="application/octet-stream",
        filename="snake-os-lite-mega2560.hex",
    )


@app.get("/descargas/snake-os-lite-cargar.sh")
def snake_os_lite_script():
    """Instalador que se detiene si la placa no es una Mega 2560."""
    return FileResponse(
        _LITE_DIR / "snake-os-lite-cargar.sh",
        media_type="text/x-shellscript; charset=utf-8",
        filename="snake-os-lite-cargar.sh",
    )


@app.get("/descargas/snake-os-lite-local.py")
def snake_os_lite_local():
    """Helper local para Ubuntu/Linux: escucha en 127.0.0.1:8792."""
    return FileResponse(
        _LITE_DIR / "snake-os-lite-local.py",
        media_type="text/x-python; charset=utf-8",
        filename="snake-os-lite-local.py",
    )


@app.get("/descargas/snake-os-matrix-cargar.sh")
def snake_os_matrix_cargar_script():
    """Flashea firmware ~m (Matriz LED + Snake) en Mega 2560 por USB."""
    return FileResponse(
        _LITE_DIR / "snake-os-matrix-cargar.sh",
        media_type="text/x-shellscript; charset=utf-8",
        filename="snake-os-matrix-cargar.sh",
    )


@app.get("/descargas/firmware/matrix-max7219.ino")
def snake_os_matrix_ino():
    """Sketch MAX7219 (~m + ~c1/~g) para compilar en el Mac con USB."""
    return FileResponse(
        _LITE_DIR / "firmware" / "matrix-max7219" / "matrix-max7219.ino",
        media_type="text/plain; charset=utf-8",
        filename="matrix-max7219.ino",
    )


import mimetypes as _snk_mimetypes
_snk_mimetypes.add_type("font/woff2", ".woff2")
_snk_mimetypes.add_type("font/woff", ".woff")


class _PublicStaticFiles(StaticFiles):
    ALLOWED_DIRS = {"", "assets", "assets/fonts"}
    ALLOWED_EXT = {
        "js", "mjs", "css", "png", "jpg", "jpeg", "gif", "webp", "svg", "ico",
        "mp3", "m4a", "ogg", "wav", "mp4", "webm", "woff", "woff2", "ttf", "webmanifest",
    }
    DENY_PREFIXES = ("requirements", "dockerfile", "docker-compose", ".env", "env")
    VM_FILES = {"libv86.js", "v86.wasm", "seabios.bin", "vgabios.bin", "linux-bzimage.bin"}

    @classmethod
    def is_public(cls, path: str) -> bool:
        p = (path or "").replace("\\", "/")
        parts = [x for x in p.split("/") if x not in ("", ".")]
        if not parts:
            return False
        for part in parts:
            if part == ".." or part.startswith(".") or part.startswith("_"):
                return False
        folder = "/".join(parts[:-1])
        name = parts[-1].lower()
        # Máquinas virtuales (2026.13): el emulador corre en el navegador; el servidor solo sirve estos archivos fijos
        if folder == "assets/vm":
            return name in cls.VM_FILES
        if folder not in cls.ALLOWED_DIRS:
            return False
        if name in ("doganiero-book.js", "doganiero-book-live.js"):
            return False
        if ".bak" in name or name.startswith(cls.DENY_PREFIXES):
            return False
        if "." not in name:
            return False
        return name.rsplit(".", 1)[1] in cls.ALLOWED_EXT

    async def get_response(self, path: str, scope):
        if not self.is_public(path):
            raise _StarletteHTTPException(status_code=404)
        resp = await super().get_response(path, scope)
        if getattr(resp, "status_code", 0) in (200, 304):
            # ?v= igual al token del archivo actual (lo pone _render_index) → caché larga e inmutable.
            # Sin ?v= o con un ?v= viejo → no-cache: el navegador y Cloudflare revalidan con ETag,
            # así un archivo publicado sin tocar su ?v= nunca se queda viejo (antes: 4 h de Cloudflare).
            try:
                qv = parse_qs((scope.get("query_string") or b"").decode("latin-1")).get("v", [""])[0]
            except Exception:
                qv = ""
            rel = (path or "").replace("\\", "/").lstrip("/")
            if qv and qv == _asset_token(rel):
                cc = "public, max-age=31536000, immutable"
            else:
                cc = "no-cache"
            resp.headers["Cache-Control"] = cc
            resp.headers["CDN-Cache-Control"] = cc
            # 2026.14: las apps de la Store corren en un iframe con sandbox (origen opaco «null»); sus archivos públicos
            # (fuentes, wasm, datos) necesitan CORS para que fetch/fuentes funcionen. Solo archivos estáticos públicos.
            if rel.startswith("assets/sra-") or rel.startswith("assets/fonts/"):
                resp.headers["Access-Control-Allow-Origin"] = "*"
                resp.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        return resp


# Doganiero Bots (2026-10-14)
app.include_router(bots_extras.build_router(require_user, bots_extras.own_key, web_search_results))
app.include_router(osx_extras.build_router(require_user))


# Snake OS VP Pro + inicio de sesión compartido con cuentas Dogaemail para páginas propias (2026-10-21)
import doga_auth
import pro_extras


def _doga_on_signup(user) -> None:
    # Lo mismo que hace /api/signup al crear una cuenta
    try:
        dog_phone.ensure_number(int(user["id"]))
    except Exception:
        pass
    note_activity("cuenta", user["name"])


hardening.IP_RESOLVER = _visitor_ip  # 2026.14b: misma IP de visitante en límites y bloqueos
app.include_router(doga_auth.build_router(_visitor_ip, BLOCKED_SIGNUP_DOMAINS, _doga_on_signup))
app.include_router(pro_extras.build_router(require_user, _visitor_ip, lambda request: doga_auth.site_user(request, "pro")))
import v2614_extras  # 2026.14: /api/calendar y /api/store/ratings (faltaban)
app.include_router(v2614_extras.build_router(require_user))


# --- Snake OS Kids: entrega del resumen semanal y códigos al Dogaemail del adulto (notificaciones de Snake OS) ---
_osx_loop_ref: dict[str, Any] = {"loop": None}


def _osx_notify(to_id: int, kind: str, title: str, body: str, data: dict[str, Any]) -> dict[str, Any]:
    notif = db.create_notification(user_id=int(to_id), kind=kind, title=title, body=body, data=data or {}, created_at=time_mod.time())

    async def _send() -> None:
        unread = db.count_unread_notifications(user_id=int(to_id))
        await chat_hub.send_to_user(int(to_id), {"type": "notification", "notification": notif, "unread": unread})
        _queue_notif_push(int(to_id), notif)

    loop = _osx_loop_ref.get("loop")
    if loop is not None:
        try:
            asyncio.run_coroutine_threadsafe(_send(), loop)
        except Exception:
            pass
    return notif


osx_extras.NOTIFY = _osx_notify


@app.on_event("startup")
async def _osx_kids_weekly_start() -> None:
    _osx_loop_ref["loop"] = asyncio.get_running_loop()

    async def _loop() -> None:
        while True:
            await asyncio.sleep(600)
            try:
                n = await asyncio.to_thread(osx_extras.send_weekly_due)
                if n:
                    print(f"[osx] resúmenes Kids enviados: {n}", flush=True)
            except Exception as exc:  # noqa: BLE001
                print("[osx] resumen semanal:", type(exc).__name__, flush=True)

    asyncio.create_task(_loop())

# Voz propia de Snake OS (Piper TTS local)
def _tts_user(request):
    try:
        return require_user(request)
    except Exception:
        return None


app.include_router(snake_tts.build_router(_tts_user))
snake_tts.warm()

app.mount("/static", _PublicStaticFiles(directory="."), name="static")
# ===== END /static seguro =====
