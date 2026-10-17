"""Snake OS extras (oct 2026): brillo, salvapantallas, modo trabajo y Snake OS Kids (control parental).

Todo se guarda por perfil dentro de users.desktop_prefs["osx"] (JSON que ya existía), así que no hay
migración de base de datos. El PIN del adulto se guarda con PBKDF2-SHA256 + sal (nunca en claro) y tiene
límite de intentos con bloqueo temporal creciente.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Callable
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request

import db

TZ = ZoneInfo("Europe/Madrid")
_lock = threading.RLock()
_tokens: dict[str, tuple[int, float, str]] = {}  # token -> (uid, caduca, ámbito)
_store_unlock: dict[int, float] = {}  # uid -> caduca (tienda desbloqueada con PIN)
TOKEN_TTL = 5 * 60        # sesión parental (ajustes Kids) tras introducir el PIN
OTHER_TTL = 2 * 60        # permisos puntuales (tienda, cámara, más tiempo): no abren los ajustes
CODE_TTL = 15 * 60        # código de verificación del correo del adulto
NOTIFY: Callable[..., Any] | None = None  # lo pone main.py: entrega en las notificaciones del Dogaemail
PIN_ITER = 200_000
MAX_FAILS = 5

APP_IDS_RE = re.compile(r"^[a-z0-9][a-z0-9_.:-]{0,59}$")
EMAIL_RE = re.compile(r"^[^@\s]{1,80}@[^@\s]{1,120}$")
HOST_RE = re.compile(r"^[a-z0-9.-]{3,120}$")
SAVERS = ("window", "clock", "bubbles", "family", "gradient")
TIMEOUTS = (0, 1, 2, 5, 10, 15, 30)
AGES = ("<7", "7-12", "13-16")
DEFAULT_WORK_APPS = ["notes", "calendario", "code", "terminal", "explorer", "desk", "browser", "cloud"]
DEFAULT_KIDS_APPS = ["snake", "notes", "calc", "games", "los-snakes", "snake-racing", "explorer", "maps", "capturas", "calendario"]
DEFAULT_SITES = ["wikipedia.org", "vikidia.org", "youtube-nocookie.com", "rae.es"]


def today() -> str:
    return datetime.now(TZ).strftime("%Y-%m-%d")


def _int(v: Any, lo: int, hi: int, dflt: int) -> int:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return dflt
    return max(lo, min(hi, n))


def _hhmm(v: Any, dflt: str) -> str:
    s = str(v or "")
    return s if re.match(r"^([01]\d|2[0-3]):[0-5]\d$", s) else dflt


def _ids(v: Any, limit: int = 80) -> list[str]:
    out: list[str] = []
    for x in v if isinstance(v, list) else []:
        s = str(x or "").strip().lower()
        if APP_IDS_RE.match(s) and s not in out:
            out.append(s)
    return out[:limit]


def _emails(v: Any) -> list[str]:
    out: list[str] = []
    for x in v if isinstance(v, list) else []:
        s = str(x or "").strip().lower()
        if EMAIL_RE.match(s) and s not in out:
            out.append(s)
    return out[:100]


def _hosts(v: Any) -> list[str]:
    out: list[str] = []
    for x in v if isinstance(v, list) else []:
        s = str(x or "").strip().lower()
        s = re.sub(r"^[a-z]+://", "", s).split("/")[0].split(":")[0]
        if s.startswith("www."):
            s = s[4:]
        if HOST_RE.match(s) and "." in s and s not in out:
            out.append(s)
    return out[:100]


def _links(v: Any) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for x in v if isinstance(v, list) else []:
        if not isinstance(x, dict):
            continue
        url = str(x.get("url") or "").strip()[:500]
        if not re.match(r"^https?://[^\s]+$", url):
            continue
        name = str(x.get("name") or "").strip()[:40] or re.sub(r"^https?://(www\.)?", "", url).split("/")[0]
        icon = str(x.get("icon") or "🔗").strip()[:8]
        out.append({"name": name, "url": url, "icon": icon})
    return out[:24]


def normalize(raw: Any) -> dict[str, Any]:
    """Valida y completa el bloque osx (incluye campos privados: hash del PIN, usos, intentos)."""
    r = raw if isinstance(raw, dict) else {}
    ss = r.get("screensaver") if isinstance(r.get("screensaver"), dict) else {}
    wk = r.get("work") if isinstance(r.get("work"), dict) else {}
    k = r.get("kids") if isinstance(r.get("kids"), dict) else {}
    lim = k.get("limits") if isinstance(k.get("limits"), dict) else {}
    bed = lim.get("bedtime") if isinstance(lim.get("bedtime"), dict) else {}
    files = k.get("files") if isinstance(k.get("files"), dict) else {}
    pin = k.get("pin") if isinstance(k.get("pin"), dict) else None
    per_app = {}
    for a, m in (lim.get("per_app") or {}).items() if isinstance(lim.get("per_app"), dict) else []:
        a = str(a).lower()
        if APP_IDS_RE.match(a):
            n = _int(m, 0, 720, 0)
            if n:
                per_app[a] = n
    usage: dict[str, dict[str, int]] = {}
    if isinstance(k.get("usage"), dict):
        for day in sorted(k["usage"].keys())[-21:]:
            if re.match(r"^\d{4}-\d{2}-\d{2}$", str(day)) and isinstance(k["usage"][day], dict):
                usage[day] = {str(a)[:60]: _int(s, 0, 86400, 0) for a, s in list(k["usage"][day].items())[:80]}
    blocked = [b for b in (k.get("blocked") or []) if isinstance(b, dict)][-300:] if isinstance(k.get("blocked"), list) else []
    extra = k.get("extra") if isinstance(k.get("extra"), dict) else {}
    out = {
        "brightness": _int(r.get("brightness"), 20, 100, 100),
        "screensaver": {
            "id": ss.get("id") if ss.get("id") in SAVERS else "window",
            "timeout": _int(ss.get("timeout"), 0, 30, 5) if _int(ss.get("timeout"), 0, 30, 5) in TIMEOUTS else 5,
        },
        "work": {
            "on": bool(wk.get("on")),
            "apps": _ids(wk.get("apps"), 24) if isinstance(wk.get("apps"), list) else list(DEFAULT_WORK_APPS),
            "links": _links(wk.get("links")),
        },
        "kids": {
            "asked": bool(k.get("asked")),
            "on": bool(k.get("on")) and bool(pin),
            "age": k.get("age") if k.get("age") in AGES else "7-12",
            "apps": _ids(k.get("apps")) if isinstance(k.get("apps"), list) else list(DEFAULT_KIDS_APPS),
            "limits": {
                "daily_min": _int(lim.get("daily_min"), 0, 720, 120),
                "per_app": per_app,
                "bedtime": {"on": bool(bed.get("on")), "from": _hhmm(bed.get("from"), "21:30"), "to": _hhmm(bed.get("to"), "08:00")},
            },
            "chat": k.get("chat") if k.get("chat") in ("off", "contacts") else "contacts",
            "contacts": _emails(k.get("contacts")),
            "bots": k.get("bots") if k.get("bots") in ("off", "filter") else "filter",
            "sites": _hosts(k.get("sites")) if isinstance(k.get("sites"), list) else list(DEFAULT_SITES),
            "online": k.get("online") if k.get("online") in ("block", "friends", "allow") else "block",
            "friends": _emails(k.get("friends")),
            "store": k.get("store") if k.get("store") in ("block", "pin") else "block",
            "files": {"no_delete": files.get("no_delete", True) is not False, "no_upload": files.get("no_upload", True) is not False},
            "media": k.get("media") if k.get("media") in ("block", "ask") else "ask",
            "extra": {"date": str(extra.get("date") or "")[:10], "min": _int(extra.get("min"), 0, 600, 0)},
            "usage": usage,
            "blocked": blocked,
            "pin": pin if pin and all(isinstance(pin.get(x), str) for x in ("hash", "salt")) else None,
            "fails": _int(k.get("fails"), 0, 1000, 0),
            "lock_until": float(k.get("lock_until") or 0) if isinstance(k.get("lock_until"), (int, float)) else 0.0,
            "locks": _int(k.get("locks"), 0, 100, 0),
            "report": _report(k.get("report")),
        },
    }
    return out


def _report(v: Any) -> dict[str, Any]:
    r = v if isinstance(v, dict) else {}
    to = str(r.get("to") or "").strip().lower()
    ok = bool(EMAIL_RE.match(to))
    return {
        "to": to if ok else "",
        "to_uid": _int(r.get("to_uid"), 0, 10**12, 0) if ok else 0,
        "verified": bool(r.get("verified")) and ok,
        "weekly": r.get("weekly", True) is not False,
        "last_week": str(r.get("last_week") or "")[:10],
        "last_sent": float(r.get("last_sent") or 0) if isinstance(r.get("last_sent"), (int, float)) else 0.0,
        "code_hash": str(r.get("code_hash") or "")[:128],
        "code_exp": float(r.get("code_exp") or 0) if isinstance(r.get("code_exp"), (int, float)) else 0.0,
        "code_tries": _int(r.get("code_tries"), 0, 100, 0),
        "code_sent": float(r.get("code_sent") or 0) if isinstance(r.get("code_sent"), (int, float)) else 0.0,
    }


def public(o: dict[str, Any]) -> dict[str, Any]:
    """Lo que ve el cliente: sin hash del PIN ni contadores internos."""
    k = dict(o["kids"])
    k["has_pin"] = bool(k.pop("pin", None))
    k.pop("fails", None)
    k["locked_for"] = max(0, int(k.pop("lock_until", 0) - time.time()))
    k.pop("locks", None)
    k.pop("blocked", None)
    k["usage_today"] = k.get("usage", {}).get(today(), {})
    k.pop("usage", None)
    rp = dict(k.get("report") or {})
    k["report"] = {"to": rp.get("to", ""), "verified": bool(rp.get("verified")), "weekly": bool(rp.get("weekly", True)),
                   "last_sent": rp.get("last_sent", 0), "pending": bool(rp.get("code_hash")) and rp.get("code_exp", 0) > time.time()}
    return {"brightness": o["brightness"], "screensaver": o["screensaver"], "work": o["work"], "kids": k}


def load(uid: int) -> dict[str, Any]:
    prefs = db.get_json_field(uid, "desktop_prefs", {})
    return normalize(prefs.get("osx") if isinstance(prefs, dict) else {})


def save(uid: int, o: dict[str, Any]) -> None:
    with _lock:
        prefs = db.get_json_field(uid, "desktop_prefs", {})
        if not isinstance(prefs, dict):
            prefs = {}
        prefs["osx"] = normalize(o)
        db.set_json_field(uid, "desktop_prefs", prefs)


def kids_policy(uid: int) -> dict[str, Any] | None:
    """Política Kids activa del perfil, o None si el perfil no está en modo Kids."""
    try:
        o = load(int(uid))
    except Exception:
        return None
    return o["kids"] if o["kids"]["on"] else None


def work_on(uid: int) -> bool:
    try:
        return bool(load(int(uid))["work"]["on"])
    except Exception:
        return False


def log_blocked(uid: int, what: str, detail: str = "") -> None:
    try:
        with _lock:
            o = load(uid)
            if not o["kids"]["on"]:
                return
            o["kids"]["blocked"] = (o["kids"]["blocked"] + [{"at": int(time.time()), "what": str(what)[:30], "detail": str(detail)[:160]}])[-300:]
            save(uid, o)
    except Exception:
        pass


def store_unlocked(uid: int) -> bool:
    return _store_unlock.get(int(uid), 0) > time.time()


def host_allowed(policy: dict[str, Any], url: str) -> bool:
    host = re.sub(r"^[a-z]+://", "", str(url or "").lower()).split("/")[0].split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    return any(host == s or host.endswith("." + s) for s in policy.get("sites") or [])


def _hash_pin(pin: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), PIN_ITER).hex()


def _check_pin_format(pin: Any) -> str:
    s = str(pin or "").strip()
    if not re.match(r"^\d{4,8}$", s):
        raise HTTPException(400, "El PIN tiene que tener entre 4 y 8 números")
    return s


def _new_token(uid: int, scope: str = "parent") -> str:
    now = time.time()
    for t, rec in list(_tokens.items()):
        if rec[1] < now:
            _tokens.pop(t, None)
    tok = secrets.token_urlsafe(24)
    _tokens[tok] = (uid, now + (TOKEN_TTL if scope == "parent" else OTHER_TTL), scope)
    return tok


def parent_ok(uid: int, request: Request | None) -> bool:
    """Para otros módulos: sesión parental válida (cabecera X-Osx-Parent) del perfil."""
    return _token_ok(int(uid), request)


def drop_tokens(uid: int) -> None:
    for t, rec in list(_tokens.items()):
        if rec[0] == uid:
            _tokens.pop(t, None)


def _token_ok(uid: int, request: Request | None, body: dict[str, Any] | None = None, scopes: tuple[str, ...] = ("parent",)) -> bool:
    """Sesión parental válida: token emitido por el servidor tras un PIN correcto, del mismo perfil, sin caducar y del ámbito pedido."""
    toks = []
    if request is not None:
        toks.append(request.headers.get("x-osx-parent") or "")
    if isinstance(body, dict):
        toks.append(str(body.get("token") or ""))
    now = time.time()
    for tok in toks:
        rec = _tokens.get(tok) if tok else None
        if rec and rec[0] == uid and rec[1] > now and rec[2] in scopes:
            return True
    return False


def _verify_pin(uid: int, o: dict[str, Any], pin: Any) -> None:
    """Comprueba el PIN contra el hash con límite de intentos; lanza HTTPException si no vale. Guarda contadores."""
    k = o["kids"]
    if not k["pin"]:
        raise HTTPException(400, "Este perfil no tiene PIN de adulto")
    now = time.time()
    if k["lock_until"] > now:
        raise HTTPException(429, f"Demasiados intentos. Espera {int(k['lock_until'] - now) // 60 + 1} min.")
    pin = str(pin or "").strip()
    ok = bool(re.match(r"^\d{4,8}$", pin)) and hmac.compare_digest(_hash_pin(pin, k["pin"]["salt"]), k["pin"]["hash"])
    if not ok:
        k["fails"] += 1
        left = MAX_FAILS - k["fails"]
        if left <= 0:
            k["locks"] += 1
            mins = min(60, 5 * (2 ** (k["locks"] - 1)))
            k["lock_until"] = now + mins * 60
            k["fails"] = 0
            save(uid, o)
            log_blocked(uid, "pin", f"PIN incorrecto {MAX_FAILS} veces: bloqueado {mins} min")
            raise HTTPException(429, f"PIN incorrecto. Bloqueado durante {mins} min.")
        save(uid, o)
        raise HTTPException(403, f"PIN incorrecto. Te quedan {left} intentos.")
    k["fails"] = 0
    k["locks"] = 0
    save(uid, o)


def build_router(require_user: Callable) -> APIRouter:
    r = APIRouter()

    @r.get("/api/osx/prefs")
    def get_prefs(user=Depends(require_user)):
        return public(load(int(user["id"])))

    @r.put("/api/osx/prefs")
    def put_prefs(payload: dict[str, Any], request: Request, user=Depends(require_user)):
        uid = int(user["id"])
        with _lock:
            o = load(uid)
            kids_on = o["kids"]["on"]
            if "brightness" in payload:
                o["brightness"] = payload.get("brightness")
            if isinstance(payload.get("screensaver"), dict):
                o["screensaver"].update({k: v for k, v in payload["screensaver"].items() if k in ("id", "timeout")})
            if isinstance(payload.get("work"), dict):
                if kids_on:
                    raise HTTPException(403, "El modo trabajo no está disponible en Snake OS Kids")
                o["work"].update({k: v for k, v in payload["work"].items() if k in ("on", "apps", "links")})
            if isinstance(payload.get("kids"), dict):
                changes = {k: v for k, v in payload["kids"].items() if k in (
                    "age", "apps", "limits", "chat", "contacts", "bots", "sites", "online", "friends", "store", "files", "media")}
                if changes:
                    if not o["kids"]["pin"] or not _token_ok(uid, request, payload):
                        raise HTTPException(403, "Hace falta el PIN del adulto")
                    o["kids"].update(changes)
            save(uid, o)
            return public(load(uid))

    @r.post("/api/osx/kids/decline")
    def kids_decline(user=Depends(require_user)):
        uid = int(user["id"])
        with _lock:
            o = load(uid)
            o["kids"]["asked"] = True
            save(uid, o)
        return public(load(uid))

    @r.post("/api/osx/kids/setup")
    def kids_setup(payload: dict[str, Any], request: Request, user=Depends(require_user)):
        """Activa Kids con la configuración del adulto y crea (o cambia) el PIN."""
        uid = int(user["id"])
        with _lock:
            o = load(uid)
            if o["kids"]["pin"] and not _token_ok(uid, request, payload):
                raise HTTPException(403, "Hace falta el PIN del adulto")
            pin = payload.get("pin")
            if pin is not None or not o["kids"]["pin"]:
                pin = _check_pin_format(pin)
                if str(payload.get("pin2") or "").strip() != pin:
                    raise HTTPException(400, "Los dos PIN no coinciden")
                salt = secrets.token_hex(16)
                o["kids"]["pin"] = {"salt": salt, "hash": _hash_pin(pin, salt), "iter": str(PIN_ITER)}
                o["kids"]["fails"] = 0
                o["kids"]["lock_until"] = 0
            cfg = payload.get("config") if isinstance(payload.get("config"), dict) else {}
            o["kids"].update({k: v for k, v in cfg.items() if k in (
                "age", "apps", "limits", "chat", "contacts", "bots", "sites", "online", "friends", "store", "files", "media")})
            o["kids"]["on"] = bool(payload.get("on", True))
            o["kids"]["asked"] = True
            if o["kids"]["on"]:
                o["work"]["on"] = False
            save(uid, o)
        return {"prefs": public(load(uid)), "token": _new_token(uid), "ttl": TOKEN_TTL}

    @r.post("/api/osx/kids/verify")
    def kids_verify(payload: dict[str, Any], user=Depends(require_user)):
        uid = int(user["id"])
        with _lock:
            o = load(uid)
            _verify_pin(uid, o, payload.get("pin"))
        purpose = str(payload.get("purpose") or "")
        scope = purpose if purpose in ("store", "perm", "extend") else "parent"
        if scope == "store":
            _store_unlock[uid] = time.time() + 10 * 60
        return {"token": _new_token(uid, scope), "ttl": TOKEN_TTL if scope == "parent" else OTHER_TTL, "scope": scope}

    @r.post("/api/osx/kids/disable")
    def kids_disable(payload: dict[str, Any], request: Request, user=Depends(require_user)):
        # Desactivar pide SIEMPRE el PIN (con límite de intentos). No depende de la sesión parental en memoria,
        # que se pierde al reiniciar el servidor y dejaba el botón respondiendo 403 sin ventana de PIN.
        uid = int(user["id"])
        if not str(payload.get("pin") or "").strip():
            raise HTTPException(403, "Hace falta el PIN del adulto")
        with _lock:
            o = load(uid)
            if not o["kids"]["on"]:
                return public(o)
            try:
                _verify_pin(uid, o, payload.get("pin"))
            except HTTPException as exc:
                print(f"[osx] desactivar Kids rechazado uid={uid}: {exc.status_code} {exc.detail}", flush=True)
                raise
            o = load(uid)
            o["kids"]["on"] = False
            if payload.get("forget_pin"):
                o["kids"]["pin"] = None
            save(uid, o)
        return public(load(uid))

    @r.post("/api/osx/kids/enable")
    def kids_enable(payload: dict[str, Any], request: Request, user=Depends(require_user)):
        uid = int(user["id"])
        with _lock:
            o = load(uid)
            if not o["kids"]["pin"]:
                raise HTTPException(400, "Configura primero Snake OS Kids y su PIN")
            if not _token_ok(uid, request, payload):
                raise HTTPException(403, "Hace falta el PIN del adulto")
            o["kids"]["on"] = True
            o["work"]["on"] = False
            save(uid, o)
        return public(load(uid))

    @r.post("/api/osx/kids/extend")
    def kids_extend(payload: dict[str, Any], request: Request, user=Depends(require_user)):
        uid = int(user["id"])
        if not _token_ok(uid, request, payload, ("parent", "extend")):
            raise HTTPException(403, "Hace falta el PIN del adulto")
        mins = _int(payload.get("minutes"), 5, 240, 15)
        with _lock:
            o = load(uid)
            ex = o["kids"]["extra"]
            if ex.get("date") != today():
                ex = {"date": today(), "min": 0}
            ex["min"] = min(600, ex["min"] + mins)
            o["kids"]["extra"] = ex
            save(uid, o)
        return public(load(uid))

    @r.post("/api/osx/kids/usage")
    def kids_usage(payload: dict[str, Any], user=Depends(require_user)):
        uid = int(user["id"])
        apps = payload.get("apps") if isinstance(payload.get("apps"), dict) else {}
        with _lock:
            o = load(uid)
            if not o["kids"]["on"]:
                return {"ok": False}
            day = today()
            u = o["kids"]["usage"].setdefault(day, {})
            for a, s in list(apps.items())[:40]:
                a = str(a).lower()[:60]
                if APP_IDS_RE.match(a):
                    u[a] = u.get(a, 0) + _int(s, 0, 600, 0)
            save(uid, o)
            return {"ok": True, "usage_today": load(uid)["kids"]["usage"].get(day, {})}

    @r.post("/api/osx/kids/blocked")
    def kids_blocked(payload: dict[str, Any], user=Depends(require_user)):
        log_blocked(int(user["id"]), str(payload.get("what") or "otro"), str(payload.get("detail") or ""))
        return {"ok": True}

    @r.get("/api/osx/kids/report")
    def kids_report(request: Request, user=Depends(require_user)):
        uid = int(user["id"])
        if not _token_ok(uid, request):
            raise HTTPException(403, "Hace falta el PIN del adulto")
        return report_data(load(uid)["kids"])

    @r.post("/api/osx/kids/lock")
    def kids_lock(user=Depends(require_user)):
        """Cierra la sesión parental (botón Bloquear o al cerrar Ajustes)."""
        drop_tokens(int(user["id"]))
        return {"ok": True}

    @r.get("/api/osx/kids/report-targets")
    def report_targets(request: Request, user=Depends(require_user)):
        uid = int(user["id"])
        if not _token_ok(uid, request):
            raise HTTPException(403, "Hace falta el PIN del adulto")
        return {
            "dogaemail": NOTIFY is not None,
            "gmail": False,
            "gmail_reason": "Snake OS no tiene servidor de correo ni integración con Gmail, así que no puede enviar a direcciones de Gmail.",
            "profile_email": str(user["email"] or ""),
        }

    @r.post("/api/osx/kids/report-to")
    def report_to(payload: dict[str, Any], request: Request, user=Depends(require_user)):
        """Asigna la cuenta Dogaemail del adulto y le envía un código de verificación a sus notificaciones."""
        uid = int(user["id"])
        if not _token_ok(uid, request, payload):
            raise HTTPException(403, "Hace falta el PIN del adulto")
        email = str(payload.get("email") or "").strip().lower()
        if not EMAIL_RE.match(email):
            raise HTTPException(400, "Escribe un correo válido")
        dom = email.rsplit("@", 1)[1]
        if dom in ("gmail.com", "googlemail.com"):
            raise HTTPException(400, "Snake OS no puede enviar a Gmail. Usa la cuenta Dogaemail del adulto.")
        target = db.get_user_by_email(email)
        if not target:
            raise HTTPException(404, "No hay ninguna cuenta Dogaemail de Snake OS con ese correo")
        if NOTIFY is None:
            raise HTTPException(503, "El envío a Dogaemail no está disponible ahora")
        with _lock:
            o = load(uid)
            rp = o["kids"]["report"]
            if time.time() - rp["code_sent"] < 45:
                raise HTTPException(429, "Espera un momento antes de pedir otro código")
            code = f"{secrets.randbelow(1000000):06d}"
            salt = secrets.token_hex(8)
            rp.update({"to": email, "to_uid": int(target["id"]), "verified": False, "code_tries": 0,
                       "code_hash": salt + ":" + hashlib.sha256((salt + code).encode()).hexdigest(),
                       "code_exp": time.time() + CODE_TTL, "code_sent": time.time()})
            save(uid, o)
        who = str(user["name"] or user["email"])
        NOTIFY(int(target["id"]), "kids_code", "🔐 Código de Snake OS Kids",
               f"Tu código es {code}. Escríbelo en el control parental de {who} para recibir allí el resumen semanal de Snake OS Kids. Caduca en 15 min.",
               {"app": "ajustes", "kind": "kids_code"})
        return {"ok": True, "to": email, "prefs": public(load(uid))}

    @r.post("/api/osx/kids/report-verify")
    def report_verify(payload: dict[str, Any], request: Request, user=Depends(require_user)):
        uid = int(user["id"])
        if not _token_ok(uid, request, payload):
            raise HTTPException(403, "Hace falta el PIN del adulto")
        code = str(payload.get("code") or "").strip()
        with _lock:
            o = load(uid)
            rp = o["kids"]["report"]
            if not rp["code_hash"] or rp["code_exp"] < time.time():
                raise HTTPException(400, "El código ha caducado. Pide otro.")
            if rp["code_tries"] >= 5:
                rp["code_hash"] = ""
                save(uid, o)
                raise HTTPException(429, "Demasiados intentos. Pide otro código.")
            salt, h = (rp["code_hash"].split(":", 1) + [""])[:2]
            if not (re.match(r"^\d{6}$", code) and hmac.compare_digest(hashlib.sha256((salt + code).encode()).hexdigest(), h)):
                rp["code_tries"] += 1
                save(uid, o)
                raise HTTPException(403, f"Código incorrecto. Te quedan {5 - rp['code_tries']} intentos.")
            rp.update({"verified": True, "code_hash": "", "code_exp": 0, "code_tries": 0})
            save(uid, o)
        return public(load(uid))

    @r.post("/api/osx/kids/report-settings")
    def report_settings(payload: dict[str, Any], request: Request, user=Depends(require_user)):
        uid = int(user["id"])
        if not _token_ok(uid, request, payload):
            raise HTTPException(403, "Hace falta el PIN del adulto")
        with _lock:
            o = load(uid)
            rp = o["kids"]["report"]
            if payload.get("remove"):
                o["kids"]["report"] = _report({})
            elif "weekly" in payload:
                rp["weekly"] = bool(payload.get("weekly"))
            save(uid, o)
        return public(load(uid))

    @r.post("/api/osx/kids/report-test")
    def report_test(payload: dict[str, Any], request: Request, user=Depends(require_user)):
        uid = int(user["id"])
        if not _token_ok(uid, request, payload):
            raise HTTPException(403, "Hace falta el PIN del adulto")
        if not send_report(uid, test=True):
            raise HTTPException(400, "Primero asigna y verifica el correo Dogaemail del adulto")
        return {"ok": True}

    return r


def _fmt_min(sec: int) -> str:
    m = int(round(sec / 60))
    return f"{m // 60} h {m % 60:02d} min" if m >= 60 else f"{m} min"


def report_data(k: dict[str, Any]) -> dict[str, Any]:
    if True:
        now = datetime.now(TZ)
        days = [(now - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(6, -1, -1)]
        per_day = [{"day": d, "seconds": sum(k["usage"].get(d, {}).values())} for d in days]
        per_app: dict[str, int] = {}
        for d in days:
            for a, s in k["usage"].get(d, {}).items():
                per_app[a] = per_app.get(a, 0) + s
        since = (now - timedelta(days=7)).timestamp()
        blocked = [b for b in k["blocked"] if b.get("at", 0) >= since]
        by_type: dict[str, int] = {}
        for b in blocked:
            by_type[b["what"]] = by_type.get(b["what"], 0) + 1
        return {
            "days": per_day,
            "apps": sorted(({"app": a, "seconds": s} for a, s in per_app.items()), key=lambda x: -x["seconds"]),
            "total_seconds": sum(x["seconds"] for x in per_day),
            "blocked_total": len(blocked),
            "blocked_by_type": by_type,
            "blocked_recent": blocked[-30:][::-1],
        }


def send_report(uid: int, test: bool = False) -> bool:
    """Envía el resumen semanal a las notificaciones de la cuenta Dogaemail verificada del adulto."""
    if NOTIFY is None:
        return False
    o = load(uid)
    rp = o["kids"]["report"]
    if not (rp["verified"] and rp["to_uid"]):
        return False
    target = db.get_user_by_id(int(rp["to_uid"]))
    if not target or str(target["email"] or "").strip().lower() != rp["to"]:
        return False
    me = db.get_user_by_id(int(uid))
    who = str((me["name"] if me else "") or (me["email"] if me else "") or "el perfil Kids")
    d = report_data(o["kids"])
    top = ", ".join(f"{a['app']} {_fmt_min(a['seconds'])}" for a in [x for x in d["apps"] if x["seconds"] >= 60][:4]) or "sin uso"
    bt = ", ".join(f"{w} {n}" for w, n in sorted(d["blocked_by_type"].items(), key=lambda x: -x[1])[:4])
    body = (f"{'(Prueba) ' if test else ''}Últimos 7 días de {who}: {_fmt_min(d['total_seconds'])} en total. "
            f"Más usadas: {top}. Intentos bloqueados: {d['blocked_total']}" + (f" ({bt})" if bt else "") + ".")
    NOTIFY(int(rp["to_uid"]), "kids_report", f"📊 Resumen semanal de Snake OS Kids · {who}"[:200], body[:500],
           {"app": "ajustes", "kind": "kids_report", "profile": str(me["email"] if me else ""), "report": {
               "total_seconds": d["total_seconds"], "days": d["days"], "apps": d["apps"][:12],
               "blocked_total": d["blocked_total"], "blocked_by_type": d["blocked_by_type"]}})
    if not test:
        with _lock:
            o = load(uid)
            o["kids"]["report"]["last_week"] = datetime.now(TZ).strftime("%G-W%V")
            o["kids"]["report"]["last_sent"] = time.time()
            save(uid, o)
    return True


def send_weekly_due() -> int:
    """Llamado cada 10 min desde main.py: los domingos desde las 19:00 (Madrid) envía el resumen pendiente de la semana."""
    now = datetime.now(TZ)
    if now.weekday() != 6 or now.hour < 19:
        return 0
    week = now.strftime("%G-W%V")
    sent = 0
    with db.get_conn() as conn:
        rows = conn.execute("SELECT id FROM users WHERE desktop_prefs LIKE '%to_uid%'").fetchall()
    for row in rows:
        uid = int(row[0])
        try:
            o = load(uid)
            rp = o["kids"]["report"]
            if o["kids"]["pin"] and rp["verified"] and rp["weekly"] and rp["last_week"] != week:
                if send_report(uid):
                    sent += 1
        except Exception:
            continue
    return sent
