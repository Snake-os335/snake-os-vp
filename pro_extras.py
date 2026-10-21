"""Snake OS VP Pro (oct 2026): suscripción gratuita con código de un solo uso.

- POST /api/pro/code (sesión de la página /pro con una cuenta Dogaemail, ver doga_auth.py): genera un código SNKPRO-XXXX-XXXX-XXXX con `secrets` y lo devuelve UNA vez.
  El código queda ligado a esa cuenta. El servidor solo guarda HMAC-SHA256(pimienta, código); el código en claro no se guarda en ningún sitio.
- POST /api/pro/redeem (con sesión): comprueba el código y activa Pro en ese perfil (solo la cuenta que lo pidió; un código por perfil;
  un código no se puede volver a usar).
- GET /api/pro/status y PUT /api/pro/prefs: estado y preferencias de las funciones Pro del perfil.
- DELETE /api/pro: el propio perfil puede dejar Pro (el código queda gastado).

Base propia (data/snake_pro.db): no toca snakeos.db. La pimienta sale de SNAKEOS_PRO_PEPPER o de
data/pro_pepper.key (32 bytes aleatorios, 0600, se crea la primera vez). Límites por IP y por perfil en memoria.
"""
from __future__ import annotations

import hashlib
import hmac
import urllib.parse
import json
import os
import re
import unicodedata
import secrets
import sqlite3
import threading
import time
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Request, Response

import db

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin 0/O ni 1/I para que se pueda copiar a mano
CODE_RE = re.compile(r"^SNKPRO-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$")
CODE_TTL = 30 * 24 * 3600           # un código sin canjear caduca a los 30 días
GEN_MAX, GEN_WIN = 5, 3600          # códigos por IP y hora
GEN_ACC_MAX, GEN_ACC_WIN = 5, 24 * 3600  # códigos por cuenta y día
GEN_GLOBAL_MAX = 300                # códigos por hora en total
TRY_MAX, TRY_WIN = 8, 15 * 60       # intentos de canje por IP y por perfil cada 15 min
PREFS_MAX = 48 * 1024

DB_FILE = db.DATA_DIR / "snake_pro.db"
PEPPER_FILE = db.DATA_DIR / "pro_pepper.key"
_lock = threading.RLock()
_hits: dict[str, list[float]] = {}
_pepper: bytes | None = None
_ready = False


class _Conn(sqlite3.Connection):
    """2026.14: «with _conn() as c» confirma (o deshace) Y cierra la conexión; antes solo confirmaba y cada
    petición dejaba una conexión abierta hasta que el recolector la cerrara."""

    def __exit__(self, *exc):
        try:
            return super().__exit__(*exc)
        finally:
            self.close()


def _conn() -> sqlite3.Connection:
    global _ready
    db.DATA_DIR.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_FILE, timeout=10, check_same_thread=False, factory=_Conn)
    c.row_factory = sqlite3.Row
    if not _ready:
        c.executescript(
            "CREATE TABLE IF NOT EXISTS pro_codes (hash TEXT PRIMARY KEY, created REAL NOT NULL,"
            " owner_uid INTEGER NOT NULL, redeemed_uid INTEGER, redeemed_at REAL);"
            "CREATE TABLE IF NOT EXISTS pro_users (uid INTEGER PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE,"
            " since REAL NOT NULL, prefs TEXT NOT NULL DEFAULT '{}');"
        )
        c.commit()
        _ready = True
    return c


def pepper() -> bytes:
    """2026.14: si data/pro_pepper.key falta o es corta (<32 bytes) se crea una nueva de forma atómica (tmp + os.replace)
    y se avisa en el registro; antes una clave corta daba FileExistsError y /api/pro/code y /redeem fallaban siempre (500).
    Una clave corta nunca pudo generar códigos, así que regenerarla no invalida ninguno. data/ es un volumen persistente."""
    global _pepper
    if _pepper:
        return _pepper
    with _lock:
        if _pepper:
            return _pepper
        env = (os.environ.get("SNAKEOS_PRO_PEPPER") or "").strip()
        if len(env) >= 16:
            _pepper = env.encode("utf-8")
            return _pepper
        if env:
            print("[pro] SNAKEOS_PRO_PEPPER tiene menos de 16 caracteres: se ignora y se usa data/pro_pepper.key", flush=True)
        try:
            raw = PEPPER_FILE.read_bytes()
            if len(raw) >= 32:
                _pepper = raw
                return _pepper
            print("[pro] data/pro_pepper.key es demasiado corta (%d bytes): se crea una nueva" % len(raw), flush=True)
        except FileNotFoundError:
            print("[pro] data/pro_pepper.key no existe: se crea", flush=True)
        db.DATA_DIR.mkdir(parents=True, exist_ok=True)
        raw = secrets.token_bytes(32)
        tmp = str(PEPPER_FILE) + ".tmp-%d" % os.getpid()
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(fd, raw)
            os.fsync(fd)
        finally:
            os.close(fd)
        os.replace(tmp, str(PEPPER_FILE))
        _pepper = raw
        return _pepper


def normalize(code: Any) -> str:
    # NFKC: letras/números de ancho completo y variantes tipográficas pasan a ASCII; luego fuera espacios,
    # saltos de línea, guiones de cualquier tipo y caracteres invisibles (solo se quedan A-Z y 0-9).
    raw = unicodedata.normalize("NFKC", str(code or ""))[:200]
    s = re.sub(r"[^A-Za-z0-9]", "", raw).upper()
    if s.startswith("SNKPRO"):
        s = s[6:]
    if len(s) != 12:
        return ""
    out = "SNKPRO-" + s[0:4] + "-" + s[4:8] + "-" + s[8:12]
    return out if CODE_RE.match(out) else ""


def mask_email(email: Any) -> str:
    e = str(email or "").strip()
    local, _, dom = e.partition("@")
    if not local or not dom:
        return "otra cuenta"
    return (local[:2] if len(local) > 2 else local[:1]) + "•••@" + dom


def _owner_hint(uid: int) -> str:
    try:
        row = db.get_user_by_id(int(uid))
        return mask_email(row["email"]) if row else "(cuenta eliminada)"
    except Exception:
        return "otra cuenta"


def code_hash(code: str) -> str:
    return hmac.new(pepper(), code.encode("ascii"), hashlib.sha256).hexdigest()


def new_code() -> str:
    body = "".join(secrets.choice(ALPHABET) for _ in range(12))
    return "SNKPRO-" + body[0:4] + "-" + body[4:8] + "-" + body[8:12]


def _limited(key: str, limit: int, window: float, count: bool = True) -> bool:
    now = time.time()
    with _lock:
        arr = [t for t in _hits.get(key, []) if now - t < window]
        if len(arr) >= limit:
            _hits[key] = arr
            return True
        if count:
            arr.append(now)
        _hits[key] = arr
        if len(_hits) > 5000:
            for k in list(_hits.keys())[:1000]:
                if not any(now - t < 3600 for t in _hits[k]):
                    _hits.pop(k, None)
        return False


def _ip_key(ip: str) -> str:
    # en memoria solo una huella de la IP
    return hashlib.sha256(("ip:" + (ip or "?")).encode()).hexdigest()[:24]


def status_for(uid: int) -> dict[str, Any]:
    with _conn() as c:
        row = c.execute("SELECT since, prefs FROM pro_users WHERE uid = ?", (uid,)).fetchone()
    if not row:
        return {"active": False}
    try:
        prefs = json.loads(row["prefs"] or "{}")
    except ValueError:
        prefs = {}
    return {"active": True, "since": float(row["since"]), "code": "••••-••••-••••", "prefs": prefs if isinstance(prefs, dict) else {}}


def is_pro(uid: int) -> bool:
    with _conn() as c:
        return c.execute("SELECT 1 FROM pro_users WHERE uid = ?", (uid,)).fetchone() is not None


# --- Insignia PRO pública: solo un booleano por cuenta (nunca códigos, huellas ni correos) ---
PUB_TTL = 10.0  # segundos; al activar o dejar Pro se invalida al momento
_pub: dict[str, Any] = {"t": 0.0, "ids": frozenset()}
BADGE_MAX_IDS = 100
BADGE_MAX, BADGE_WIN = 120, 60.0


def pro_ids() -> frozenset:
    now = time.time()
    if now - float(_pub["t"]) > PUB_TTL:
        try:
            with _conn() as c:
                ids = frozenset(int(r[0]) for r in c.execute("SELECT uid FROM pro_users").fetchall())
        except Exception:
            ids = _pub["ids"]
        _pub["ids"], _pub["t"] = ids, now
    return _pub["ids"]


def public_pro(uid: Any) -> bool:
    try:
        return int(uid) in pro_ids()
    except (TypeError, ValueError):
        return False


def invalidate_public() -> None:
    _pub["t"] = 0.0


db.PRO_FLAG = public_pro


def build_router(require_user: Callable[..., Any], visitor_ip: Callable[[Request], str], page_user: Callable[[Request], Any]) -> APIRouter:
    r = APIRouter()

    def nostore(resp: Response) -> None:
        resp.headers["Cache-Control"] = "no-store, max-age=0"
        resp.headers["Pragma"] = "no-cache"

    @r.post("/api/pro/code")
    def pro_code(request: Request, response: Response):
        nostore(response)
        owner = page_user(request)
        if not owner:
            raise HTTPException(status_code=401, detail="Inicia sesión con tu cuenta Dogaemail para pedir el código.", headers={"X-Snk-Err": "code_need_login"})
        oid = int(owner["id"])
        if is_pro(oid):
            raise HTTPException(status_code=409, detail="Tu cuenta ya tiene Snake OS VP Pro activado.", headers={"X-Snk-Err": "account_already_pro"})
        ipk = _ip_key(visitor_ip(request))
        if _limited("gen:u%d" % oid, GEN_ACC_MAX, GEN_ACC_WIN, count=False) or _limited("gen:" + ipk, GEN_MAX, GEN_WIN) or _limited("gen:*", GEN_GLOBAL_MAX, GEN_WIN):
            raise HTTPException(status_code=429, detail="Has pedido muchos códigos seguidos. Vuelve a intentarlo dentro de un rato.", headers={"X-Snk-Err": "too_many_codes"})
        now = time.time()
        with _lock, _conn() as c:
            c.execute("DELETE FROM pro_codes WHERE redeemed_uid IS NULL AND created < ?", (now - CODE_TTL,))
            for _ in range(5):
                code = new_code()
                try:
                    c.execute("INSERT INTO pro_codes (hash, created, owner_uid) VALUES (?, ?, ?)", (code_hash(code), now, oid))
                    break
                except sqlite3.IntegrityError:
                    continue
            else:
                raise HTTPException(status_code=500, detail="No se pudo generar el código", headers={"X-Snk-Err": "code_gen_failed"})
            c.commit()
        _limited("gen:u%d" % oid, GEN_ACC_MAX, GEN_ACC_WIN)
        return {"code": code, "show_seconds": 60, "expires_days": CODE_TTL // 86400}

    @r.get("/api/pro/mine")
    def pro_mine(request: Request, response: Response):
        """Para la página /pro: estado de la cuenta con sesión en esa página (sin códigos en claro)."""
        nostore(response)
        owner = page_user(request)
        if not owner:
            raise HTTPException(status_code=401, detail="No has iniciado sesión", headers={"X-Snk-Err": "not_signed_in"})
        oid = int(owner["id"])
        with _conn() as c:
            n = c.execute("SELECT COUNT(*) FROM pro_codes WHERE owner_uid = ? AND redeemed_uid IS NULL AND created >= ?", (oid, time.time() - CODE_TTL)).fetchone()[0]
        st = status_for(oid)
        return {"active": st["active"], "since": st.get("since"), "pending_codes": int(n)}

    @r.get("/api/pro/status")
    def pro_status(response: Response, user=Depends(require_user)):
        nostore(response)
        return status_for(int(user["id"]))

    @r.post("/api/pro/redeem")
    def pro_redeem(body: dict, request: Request, response: Response, user=Depends(require_user)):
        nostore(response)
        uid = int(user["id"])
        ipk = _ip_key(visitor_ip(request))
        if _limited("try:" + ipk, TRY_MAX, TRY_WIN, count=False) or _limited("try:u%d" % uid, TRY_MAX, TRY_WIN, count=False):
            raise HTTPException(status_code=429, detail="Demasiados intentos. Espera unos minutos y vuelve a probar.", headers={"X-Snk-Err": "too_many_tries"})
        if is_pro(uid):
            raise HTTPException(status_code=409, detail="Este perfil ya tiene Snake OS VP Pro activado.", headers={"X-Snk-Err": "profile_already_pro"})
        code = normalize((body or {}).get("code") if isinstance(body, dict) else "")
        if not code:
            _limited("try:" + ipk, TRY_MAX, TRY_WIN)
            _limited("try:u%d" % uid, TRY_MAX, TRY_WIN)
            raise HTTPException(status_code=400, detail="Código no válido. Revisa que tenga la forma SNKPRO-XXXX-XXXX-XXXX.", headers={"X-Snk-Err": "code_format"})
        h = code_hash(code)
        now = time.time()
        with _lock, _conn() as c:
            row = c.execute("SELECT created, owner_uid, redeemed_uid FROM pro_codes WHERE hash = ?", (h,)).fetchone()
            if not row or (row["redeemed_uid"] is None and float(row["created"]) < now - CODE_TTL):
                _limited("try:" + ipk, TRY_MAX, TRY_WIN)
                _limited("try:u%d" % uid, TRY_MAX, TRY_WIN)
                raise HTTPException(status_code=400, detail="Código no válido.", headers={"X-Snk-Err": "code_invalid"})
            if row["redeemed_uid"] is not None:
                _limited("try:" + ipk, TRY_MAX, TRY_WIN)
                _limited("try:u%d" % uid, TRY_MAX, TRY_WIN)
                raise HTTPException(status_code=409, detail="Este código ya se ha usado.", headers={"X-Snk-Err": "code_used"})
            if int(row["owner_uid"]) != uid:
                _limited("try:" + ipk, TRY_MAX, TRY_WIN)
                _limited("try:u%d" % uid, TRY_MAX, TRY_WIN)
                hint = _owner_hint(int(row["owner_uid"]))
                raise HTTPException(status_code=403, detail="Este código es de la cuenta Dogaemail " + hint + ". Entra en Snake OS VP con esa cuenta para activarlo.",
                                    headers={"X-Snk-Err": "code_other_account", "X-Snk-Err-Arg": urllib.parse.quote(hint)})
            cur = c.execute("UPDATE pro_codes SET redeemed_uid = ?, redeemed_at = ? WHERE hash = ? AND redeemed_uid IS NULL", (uid, now, h))
            if cur.rowcount != 1:
                raise HTTPException(status_code=409, detail="Este código ya se ha usado.", headers={"X-Snk-Err": "code_used"})
            try:
                c.execute("INSERT INTO pro_users (uid, code_hash, since, prefs) VALUES (?, ?, ?, '{}')", (uid, h, now))
            except sqlite3.IntegrityError:
                c.rollback()
                raise HTTPException(status_code=409, detail="Este perfil ya tiene Snake OS VP Pro activado.", headers={"X-Snk-Err": "profile_already_pro"})
            c.commit()
        invalidate_public()
        return status_for(uid)

    @r.put("/api/pro/prefs")
    def pro_prefs(body: dict, response: Response, user=Depends(require_user)):
        nostore(response)
        uid = int(user["id"])
        prefs = (body or {}).get("prefs") if isinstance(body, dict) else None
        if not isinstance(prefs, dict):
            raise HTTPException(status_code=400, detail="Preferencias no válidas", headers={"X-Snk-Err": "bad_prefs"})
        raw = json.dumps(prefs, ensure_ascii=False, separators=(",", ":"))
        if len(raw.encode("utf-8")) > PREFS_MAX:
            raise HTTPException(status_code=413, detail="Demasiados datos en las funciones Pro (máx. 48 KB)", headers={"X-Snk-Err": "prefs_big"})
        with _lock, _conn() as c:
            cur = c.execute("UPDATE pro_users SET prefs = ? WHERE uid = ?", (raw, uid))
            c.commit()
        if cur.rowcount != 1:
            raise HTTPException(status_code=403, detail="Este perfil no tiene Snake OS VP Pro", headers={"X-Snk-Err": "not_pro"})
        return {"ok": True}

    @r.delete("/api/pro")
    def pro_leave(response: Response, user=Depends(require_user)):
        nostore(response)
        uid = int(user["id"])
        with _lock, _conn() as c:
            c.execute("DELETE FROM pro_users WHERE uid = ?", (uid,))
            c.commit()
        invalidate_public()
        return {"active": False}

    @r.get("/api/pro/badges")
    def pro_badges(response: Response, ids: str = "", user=Depends(require_user)):
        """Consulta por lotes: {"pro": {"<id>": true|false}} para los ids pedidos (máx. 100). Solo el booleano público."""
        if _limited("badge:u%d" % int(user["id"]), BADGE_MAX, BADGE_WIN):
            raise HTTPException(status_code=429, detail="Demasiadas consultas. Espera un momento.", headers={"X-Snk-Err": "too_many_queries"})
        out: dict[str, bool] = {}
        for part in str(ids or "").split(",")[:BADGE_MAX_IDS]:
            part = part.strip()
            if part.isdigit() and len(part) <= 12:
                out[part] = public_pro(int(part))
        response.headers["Cache-Control"] = "private, max-age=15"
        return {"pro": out}

    return r
