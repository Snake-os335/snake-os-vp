"""Doganiero Hub (oct 2026): lo compartido entre Dogaemail web, Doganiero Games, Snake OS y TV OS.

Todo vive en el servidor de cuentas (Snake OS VP, «server i8», data/snakeos.db). Las páginas externas
(Dogaemail «mail», Doganiero Games «games», TV OS «tv») llaman aquí con su cookie de sesión doga_s_<sitio>;
Snake OS llama con su propia sesión (site=os).

- Correo Dogaemail interno: solo entre cuentas Dogaemail y SOLO a contactos añadidos (antispam). Nunca sale
  a Gmail ni a ningún servidor de correo externo: se entrega en la bandeja Dogaemail de la otra cuenta.
- Tarjeta Doganiero Points™: toda cuenta tiene una (0 puntos al crearla). El saldo solo lo cambia el servidor.
- Juegos: los puntos se ganan con partidas que el servidor abre (token) y cierra; límites anti-trampas por
  duración real (reloj del servidor), puntuación plausible, tope por partida y tope diario.
- Doganiero+: cuesta 10 Points™ por 30 días (renovación automática opcional). Da 128 GB de nube frente a 20 GB.
- Cuota: suma de los archivos de la nube (data/user_files/<id>) y los vídeos enviados por chat.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import threading
import time
from typing import Any, Callable

from fastapi import APIRouter, HTTPException, Request

import added_accounts
import db
import doga_auth
from auth import hash_password, user_from_session, verify_password

GB = 1024 ** 3
QUOTA_FREE = 20 * GB
QUOTA_PLUS = 128 * GB
PLUS_COST = 10
PLUS_DAYS = 30
DAILY_POINTS_CAP = 15
STARTS_PER_HOUR = 60
RUN_TTL = 2 * 3600
MAIL_PER_HOUR = 40
HUB_SITES = {"mail", "games", "tv"}

# juego → (duración mínima s, puntuación máx. por segundo, puntuación por punto, tope por partida)
GAMES: dict[str, dict[str, Any]] = {
    "snake": {"name": "Snake", "min_s": 15, "rate": 1.5, "per_point": 3, "cap": 3},
    "superdoga": {"name": "Super Doga", "min_s": 20, "rate": 3.0, "per_point": 5, "cap": 3},
    "minesweeper": {"name": "Buscaminas", "levels": {"facil": (10, 1), "medio": (30, 2), "dificil": (60, 3)}},
}

_lock = threading.Lock()
_hits: dict[str, list[float]] = {}
_usage_cache: dict[int, tuple[float, int]] = {}


def _limited(key: str, limit: int, window: float) -> bool:
    now = time.time()
    with _lock:
        arr = [t for t in _hits.get(key, []) if now - t < window]
        if len(arr) >= limit:
            _hits[key] = arr
            return True
        arr.append(now)
        _hits[key] = arr
        return False


def _err(code: int, msg: str, tag: str):
    return HTTPException(status_code=code, detail=msg, headers={"X-Snk-Err": tag})


def init_tables(conn=None) -> None:
    own = conn is None
    conn = conn or db.get_conn()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS doga_mail (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_id INTEGER NOT NULL, to_id INTEGER NOT NULL,
                subject TEXT NOT NULL, body TEXT NOT NULL, created_at REAL NOT NULL,
                read_at REAL, star INTEGER NOT NULL DEFAULT 0,
                del_from INTEGER NOT NULL DEFAULT 0, del_to INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS ix_doga_mail_to ON doga_mail(to_id, created_at);
            CREATE INDEX IF NOT EXISTS ix_doga_mail_from ON doga_mail(from_id, created_at);
            CREATE TABLE IF NOT EXISTS doga_points (
                user_id INTEGER PRIMARY KEY, card_no TEXT NOT NULL UNIQUE,
                balance INTEGER NOT NULL DEFAULT 0, earned INTEGER NOT NULL DEFAULT 0, created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS doga_points_ledger (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
                delta INTEGER NOT NULL, reason TEXT NOT NULL, created_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_doga_ledger ON doga_points_ledger(user_id, created_at);
            CREATE TABLE IF NOT EXISTS doga_game_runs (
                token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, game TEXT NOT NULL, level TEXT,
                started_at REAL NOT NULL, finished_at REAL, score INTEGER, points INTEGER
            );
            CREATE INDEX IF NOT EXISTS ix_doga_runs ON doga_game_runs(user_id, started_at);
            CREATE TABLE IF NOT EXISTS doga_plus (
                user_id INTEGER PRIMARY KEY, active_until REAL NOT NULL, auto_renew INTEGER NOT NULL DEFAULT 1,
                since REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS doga_prefs (user_id INTEGER PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}');
            """
        )
    finally:
        if own:
            conn.commit()
            conn.close()


_inited = False


def _conn():
    global _inited
    c = db.get_conn()
    if not _inited:
        init_tables(c)
        _inited = True
    return c


# ---------------- Points™ ----------------
def ensure_card(uid: int) -> dict[str, Any]:
    with _conn() as c:
        row = c.execute("SELECT * FROM doga_points WHERE user_id=?", (uid,)).fetchone()
        if not row:
            for _ in range(5):
                no = "DP-" + "-".join(f"{secrets.randbelow(10000):04d}" for _ in range(3))
                try:
                    c.execute("INSERT INTO doga_points (user_id, card_no, balance, earned, created_at) VALUES (?,?,0,0,?)", (uid, no, time.time()))
                    break
                except Exception:
                    continue
            row = c.execute("SELECT * FROM doga_points WHERE user_id=?", (uid,)).fetchone()
    return {"card_no": row["card_no"], "balance": int(row["balance"]), "earned": int(row["earned"]), "since": row["created_at"]}


def _add_points(c, uid: int, delta: int, reason: str) -> None:
    c.execute("UPDATE doga_points SET balance = balance + ?, earned = earned + ? WHERE user_id=?", (delta, max(0, delta), uid))
    c.execute("INSERT INTO doga_points_ledger (user_id, delta, reason, created_at) VALUES (?,?,?,?)", (uid, delta, reason[:80], time.time()))


def _today_earned(c, uid: int) -> int:
    lt = time.localtime()
    start = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1))
    r = c.execute("SELECT COALESCE(SUM(delta),0) s FROM doga_points_ledger WHERE user_id=? AND delta>0 AND reason LIKE 'juego:%' AND created_at>=?", (uid, start)).fetchone()
    return int(r["s"] or 0)


def ledger(uid: int, limit: int = 30) -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute("SELECT delta, reason, created_at FROM doga_points_ledger WHERE user_id=? ORDER BY id DESC LIMIT ?", (uid, limit)).fetchall()
    return [dict(r) for r in rows]


# ---------------- Doganiero+ y cuota ----------------
def plus_state(uid: int) -> dict[str, Any]:
    ensure_card(uid)
    now = time.time()
    with _conn() as c:
        row = c.execute("SELECT * FROM doga_plus WHERE user_id=?", (uid,)).fetchone()
        # Renovación automática perezosa: si caducó, quiere renovar y tiene saldo, se cobra aquí
        if row and row["active_until"] <= now and row["auto_renew"]:
            bal = c.execute("SELECT balance FROM doga_points WHERE user_id=?", (uid,)).fetchone()["balance"]
            if bal >= PLUS_COST:
                _add_points(c, uid, -PLUS_COST, "doganiero+:renovación")
                c.execute("UPDATE doga_plus SET active_until=? WHERE user_id=?", (now + PLUS_DAYS * 86400, uid))
                row = c.execute("SELECT * FROM doga_plus WHERE user_id=?", (uid,)).fetchone()
    active = bool(row and row["active_until"] > now)
    return {"active": active, "until": row["active_until"] if row else None, "auto_renew": bool(row and row["auto_renew"]),
            "cost": PLUS_COST, "days": PLUS_DAYS}


def plus_active(uid: int) -> bool:
    try:
        return plus_state(uid)["active"]
    except Exception:
        return False


def quota_limit(uid: int) -> int:
    return QUOTA_PLUS if plus_active(uid) else QUOTA_FREE


def usage(uid: int, fresh: bool = False) -> int:
    now = time.time()
    hit = _usage_cache.get(uid)
    if hit and not fresh and now - hit[0] < 60:
        return hit[1]
    total = 0
    try:
        p = db.FILES_DIR / str(int(uid))
        if p.is_dir():
            for e in os.scandir(p):
                if e.is_file():
                    total += e.stat().st_size
    except Exception:
        pass
    try:
        with _conn() as c:
            r = c.execute("SELECT COALESCE(SUM(v.size),0) s FROM chat_videos v JOIN chat_messages m ON m.id=v.message_id WHERE m.from_user_id=?", (uid,)).fetchone()
            total += int(r["s"] or 0)
    except Exception:
        pass
    _usage_cache[uid] = (now, total)
    return total


def quota(uid: int) -> dict[str, Any]:
    lim = quota_limit(uid)
    used = usage(uid)
    return {"used": used, "limit": lim, "free_gb": QUOTA_FREE // GB, "plus_gb": QUOTA_PLUS // GB, "plus": lim == QUOTA_PLUS}


def check_quota(uid: int, extra_bytes: int) -> None:
    """Lanza 413 si al guardar extra_bytes la cuenta pasaría de su cuota (20 GB o 128 GB con Doganiero+)."""
    lim = quota_limit(uid)
    if usage(uid, fresh=True) + max(0, int(extra_bytes)) > lim:
        raise _err(413, f"Sin espacio: tu nube es de {lim // GB} GB. Doganiero+ la sube a {QUOTA_PLUS // GB} GB.", "quota_full")


# ---------------- Preferencias ----------------
PREF_DEFAULTS = {"notif_mail": True, "notif_games": True, "mail_signature": "", "theme": "auto", "show_card_in_os": True}


def prefs(uid: int) -> dict[str, Any]:
    with _conn() as c:
        r = c.execute("SELECT data FROM doga_prefs WHERE user_id=?", (uid,)).fetchone()
    out = dict(PREF_DEFAULTS)
    try:
        out.update({k: v for k, v in json.loads(r["data"]).items() if k in PREF_DEFAULTS} if r else {})
    except Exception:
        pass
    return out


def set_prefs(uid: int, patch: dict) -> dict[str, Any]:
    cur = prefs(uid)
    for k, v in (patch or {}).items():
        if k not in PREF_DEFAULTS:
            continue
        if isinstance(PREF_DEFAULTS[k], bool):
            cur[k] = bool(v)
        elif k == "theme":
            cur[k] = v if v in ("auto", "claro", "oscuro") else "auto"
        else:
            cur[k] = str(v or "")[:300]
    with _conn() as c:
        c.execute("INSERT INTO doga_prefs (user_id, data) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data", (uid, json.dumps(cur)))
    return cur


# ---------------- Correo Dogaemail ----------------
def address_of(user) -> str:
    return str(user["email"]).lower()


def _mail_view(r, me: int) -> dict[str, Any]:
    fu = db.get_user_by_id(int(r["from_id"]))
    tu = db.get_user_by_id(int(r["to_id"]))
    return {"id": r["id"], "subject": r["subject"], "body": r["body"], "at": r["created_at"], "read": bool(r["read_at"]) or r["from_id"] == me,
            "star": bool(r["star"]) and r["to_id"] == me, "mine": r["from_id"] == me,
            "from": {"id": r["from_id"], "name": fu["name"] if fu else "?", "email": address_of(fu) if fu else "", "avatar": fu["avatar"] if fu else "🐶"},
            "to": {"id": r["to_id"], "name": tu["name"] if tu else "?", "email": address_of(tu) if tu else ""}}


def resolve_recipient(me: int, to: str):
    to = str(to or "").strip().lower()
    if not to:
        raise _err(400, "Falta el destinatario", "mail_no_to")
    user = db.get_user_by_email(to)
    if not user and to.endswith("@dogaemail.softportweb.com"):
        # alias: nombre@dogaemail.softportweb.com → la cuenta cuyo correo empieza por ese nombre (si es única)
        local = to.split("@")[0]
        with _conn() as c:
            rows = c.execute("SELECT id FROM users WHERE lower(email) LIKE ? LIMIT 2", (local + "@%",)).fetchall()
        if len(rows) == 1:
            user = db.get_user_by_id(int(rows[0]["id"]))
    if not user:
        raise _err(404, "Esa dirección no es una cuenta Dogaemail", "mail_unknown")
    if int(user["id"]) == me:
        raise _err(400, "No puedes enviarte correo a ti mismo", "mail_self")
    if not added_accounts.has(me, int(user["id"])):
        raise _err(403, "Solo puedes escribir a tus contactos añadidos (antispam). Añádelo primero en Snake OS → Chat.", "mail_not_contact")
    return user


def send_mail(me_user, to: str, subject: str, body: str) -> dict[str, Any]:
    me = int(me_user["id"])
    subject = re.sub(r"[\r\n]+", " ", str(subject or "")).strip()[:200] or "(sin asunto)"
    body = str(body or "")[:20000]
    if not body.strip():
        raise _err(400, "El mensaje está vacío", "mail_empty")
    rcpt = resolve_recipient(me, to)
    if _limited(f"mail:{me}", MAIL_PER_HOUR, 3600):
        raise _err(429, "Has enviado muchos correos en poco tiempo. Espera un rato.", "mail_rate")
    now = time.time()
    with _conn() as c:
        cur = c.execute("INSERT INTO doga_mail (from_id, to_id, subject, body, created_at) VALUES (?,?,?,?,?)", (me, int(rcpt["id"]), subject, body, now))
        mid = cur.lastrowid
        row = c.execute("SELECT * FROM doga_mail WHERE id=?", (mid,)).fetchone()
    if prefs(int(rcpt["id"])).get("notif_mail", True):
        try:
            db.create_notification(user_id=int(rcpt["id"]), kind="dogaemail", title=f"📧 Correo de {me_user['name']}", body=subject,
                                   data={"mail_id": mid}, created_at=now)
        except Exception:
            pass
    return _mail_view(row, me)


def list_mail(me: int, box: str, q: str = "") -> list[dict[str, Any]]:
    where = {"inbox": "to_id=? AND del_to=0", "sent": "from_id=? AND del_from=0", "starred": "to_id=? AND del_to=0 AND star=1",
             "trash": "to_id=? AND del_to=1"}.get(box)
    if not where:
        raise _err(400, "Carpeta no válida", "mail_box")
    args: list[Any] = [me]
    if q:
        where += " AND (subject LIKE ? OR body LIKE ?)"
        args += [f"%{q[:80]}%"] * 2
    with _conn() as c:
        rows = c.execute(f"SELECT * FROM doga_mail WHERE {where} ORDER BY id DESC LIMIT 200", args).fetchall()
    return [_mail_view(r, me) for r in rows]


def unread(me: int) -> int:
    with _conn() as c:
        return int(c.execute("SELECT COUNT(*) n FROM doga_mail WHERE to_id=? AND del_to=0 AND read_at IS NULL", (me,)).fetchone()["n"])


def _own_mail(c, me: int, mid: int):
    r = c.execute("SELECT * FROM doga_mail WHERE id=? AND (to_id=? OR from_id=?)", (mid, me, me)).fetchone()
    if not r:
        raise _err(404, "Correo no encontrado", "mail_404")
    return r


# ---------------- Juegos (anti-trampas) ----------------
def game_start(uid: int, game: str, level: str = "") -> dict[str, Any]:
    g = GAMES.get(game)
    if not g:
        raise _err(400, "Juego no válido", "game_bad")
    if game == "minesweeper" and level not in g["levels"]:
        level = "facil"
    if _limited(f"gs:{uid}", STARTS_PER_HOUR, 3600):
        raise _err(429, "Demasiadas partidas seguidas. Descansa un poco.", "game_rate")
    tok = secrets.token_urlsafe(18)
    now = time.time()
    with _conn() as c:
        c.execute("DELETE FROM doga_game_runs WHERE user_id=? AND finished_at IS NULL AND started_at < ?", (uid, now - RUN_TTL))
        c.execute("INSERT INTO doga_game_runs (token, user_id, game, level, started_at) VALUES (?,?,?,?,?)", (tok, uid, game, level or None, now))
        left = max(0, DAILY_POINTS_CAP - _today_earned(c, uid))
    return {"token": tok, "game": game, "level": level or None, "today_left": left}


def game_finish(uid: int, token: str, score: Any, won: bool = False) -> dict[str, Any]:
    try:
        score = max(0, min(100000, int(score)))
    except Exception:
        score = 0
    now = time.time()
    with _conn() as c:
        run = c.execute("SELECT * FROM doga_game_runs WHERE token=? AND user_id=?", (str(token or "")[:64], uid)).fetchone()
        if not run:
            raise _err(404, "Partida no encontrada", "game_404")
        if run["finished_at"] is not None:
            raise _err(409, "Esa partida ya se cerró", "game_done")
        dur = now - float(run["started_at"])
        g = GAMES[run["game"]]
        reason, pts = "", 0
        if dur > RUN_TTL:
            reason = "La partida caducó"
        elif run["game"] == "minesweeper":
            min_s, val = g["levels"].get(run["level"] or "facil", (10, 1))
            if not won:
                reason = "Solo puntúa ganar"
            elif dur < min_s:
                reason = f"Demasiado rápido para ser real (mín. {min_s} s)"
            else:
                pts = val
        else:
            if dur < g["min_s"]:
                reason = f"Partida demasiado corta (mín. {g['min_s']} s)"
            elif score > dur * g["rate"] + 5:
                reason = "Puntuación imposible para ese tiempo"
            else:
                # Antes: 25 huesos o 10 manzanas para 1 Point™ → casi nadie ganaba nada. Ahora: cualquier partida
                # legal con algo de puntuación da al menos 1 Point™.
                pts = min(g["cap"], max(1 if score > 0 else 0, score // g["per_point"]))
        left = max(0, DAILY_POINTS_CAP - _today_earned(c, uid))
        if pts > left:
            pts = left
            if not reason:
                reason = "Tope diario alcanzado" if left == 0 else "Recortado al tope diario"
        suspicious = reason.startswith(("Partida demasiado corta", "Puntuación imposible", "Demasiado rápido"))
        c.execute("UPDATE doga_game_runs SET finished_at=?, score=?, points=? WHERE token=?", (now, 0 if suspicious else score, pts, run["token"]))
        if pts > 0:
            _add_points(c, uid, pts, f"juego:{g['name']}")
    card = ensure_card(uid)
    return {"points": pts, "balance": card["balance"], "note": reason, "seconds": int(dur), "today_left": max(0, left - pts)}


def leaderboard(game: str) -> list[dict[str, Any]]:
    if game not in GAMES:
        return []
    with _conn() as c:
        rows = c.execute("""SELECT r.user_id, MAX(r.score) s FROM doga_game_runs r WHERE r.game=? AND r.finished_at IS NOT NULL
                            AND r.points IS NOT NULL GROUP BY r.user_id ORDER BY s DESC LIMIT 10""", (game,)).fetchall()
    out = []
    for r in rows:
        u = db.get_user_by_id(int(r["user_id"]))
        if u:
            out.append({"name": u["name"], "avatar": u["avatar"], "score": int(r["s"] or 0)})
    return out


# ---------------- Vista de cuenta ----------------
SERVICES = [
    {"id": "snakeos", "name": "Snake OS VP", "icon": "🐍", "desc": "Tu escritorio en la nube"},
    {"id": "tv", "name": "Doganiero TV OS!", "icon": "📺", "desc": "Canal Doganiero y apps de TV"},
    {"id": "ai", "name": "Doganiero AI", "icon": "🤖", "desc": "El asistente de Snake OS (se gestiona en Snake OS → Ajustes → IA)"},
    {"id": "askbox", "name": "AskBox", "icon": "📦", "desc": "Preguntas y respuestas dentro de Snake OS"},
    {"id": "games", "name": "Doganiero Games", "icon": "🎮", "desc": "Gana Points™ jugando"},
    {"id": "plus", "name": "Doganiero+", "icon": "➕", "desc": "128 GB de nube por 10 Points™ al mes"},
]


def account(user) -> dict[str, Any]:
    uid = int(user["id"])
    pub = db.user_public(user)
    return {"user": pub, "address": address_of(user), "card": ensure_card(uid), "plus": plus_state(uid), "quota": quota(uid),
            "prefs": prefs(uid), "unread": unread(uid), "services": SERVICES, "pro": db.pro_flag(uid)}


def build_router(os_cookie: str, visitor_ip: Callable[[Request], str]) -> APIRouter:
    r = APIRouter()

    def who(request: Request, site: str):
        site = str(site or "os").lower()
        if site == "os":
            u = user_from_session(request.cookies.get(os_cookie))
        elif site in HUB_SITES:
            u = doga_auth.site_user(request, site)
        else:
            raise _err(400, "Página no válida", "bad_site")
        if not u:
            raise _err(401, "No has iniciado sesión", "not_signed_in")
        return u

    @r.get("/api/doga/account")
    def get_account(request: Request, site: str = "os"):
        return account(who(request, site))

    @r.patch("/api/doga/account")
    def patch_account(body: dict, request: Request, site: str = "os"):
        u = who(request, site)
        name = body.get("name")
        avatar = body.get("avatar")
        if name is not None:
            name = str(name).strip()
            if not (1 <= len(name) <= 40):
                raise _err(400, "El nombre debe tener entre 1 y 40 caracteres", "bad_name")
        if avatar is not None:
            avatar = str(avatar).strip()
            if not (1 <= len(avatar) <= 16) or avatar.startswith(("/", "http")):
                raise _err(400, "Elige un emoji como avatar", "bad_avatar")
        if name is not None or avatar is not None:
            u = db.update_user(int(u["id"]), name=name, avatar=avatar)
        if isinstance(body.get("prefs"), dict):
            set_prefs(int(u["id"]), body["prefs"])
        return account(u)

    @r.post("/api/doga/account/password")
    def change_password(body: dict, request: Request, site: str = "os"):
        u = who(request, site)
        if _limited("pw:" + str(u["id"]), 8, 900):
            raise _err(429, "Demasiados intentos", "too_many_tries")
        old, new = str(body.get("old") or ""), str(body.get("new") or "")
        if not verify_password(old, u["password_hash"]):
            raise _err(400, "La contraseña actual no es correcta", "bad_password")
        if len(new) < 8 or len(new) > 200:
            raise _err(400, "La nueva contraseña debe tener al menos 8 caracteres", "weak_password")
        db.update_user(int(u["id"]), password_hash=hash_password(new))
        return {"ok": True}

    @r.get("/api/doga/points")
    def get_points(request: Request, site: str = "os"):
        u = who(request, site)
        return {"card": ensure_card(int(u["id"])), "ledger": ledger(int(u["id"])), "plus": plus_state(int(u["id"])), "daily_cap": DAILY_POINTS_CAP}

    @r.post("/api/doga/plus/subscribe")
    def plus_subscribe(request: Request, site: str = "os"):
        u = who(request, site)
        uid = int(u["id"])
        st = plus_state(uid)
        if st["active"]:
            with _conn() as c:
                c.execute("UPDATE doga_plus SET auto_renew=1 WHERE user_id=?", (uid,))
            return {"plus": plus_state(uid), "card": ensure_card(uid), "charged": 0}
        now = time.time()
        with _conn() as c:
            bal = c.execute("SELECT balance FROM doga_points WHERE user_id=?", (uid,)).fetchone()["balance"]
            if bal < PLUS_COST:
                raise _err(402, f"Necesitas {PLUS_COST} Points™ (tienes {bal}). Gánalos en Doganiero Games.", "plus_points")
            _add_points(c, uid, -PLUS_COST, "doganiero+:alta")
            c.execute("INSERT INTO doga_plus (user_id, active_until, auto_renew, since) VALUES (?,?,1,?) ON CONFLICT(user_id) DO UPDATE SET active_until=excluded.active_until, auto_renew=1",
                      (uid, now + PLUS_DAYS * 86400, now))
        _usage_cache.pop(uid, None)
        return {"plus": plus_state(uid), "card": ensure_card(uid), "charged": PLUS_COST}

    @r.post("/api/doga/plus/cancel")
    def plus_cancel(request: Request, site: str = "os"):
        u = who(request, site)
        with _conn() as c:
            c.execute("UPDATE doga_plus SET auto_renew=0 WHERE user_id=?", (int(u["id"]),))
        return {"plus": plus_state(int(u["id"]))}

    @r.get("/api/doga/quota")
    def get_quota(request: Request, site: str = "os"):
        return quota(int(who(request, site)["id"]))

    # ---- correo ----
    @r.get("/api/doga/mail")
    def mail_list(request: Request, site: str = "mail", box: str = "inbox", q: str = ""):
        u = who(request, site)
        return {"items": list_mail(int(u["id"]), box, q), "unread": unread(int(u["id"]))}

    @r.get("/api/doga/mail/contacts")
    def mail_contacts(request: Request, site: str = "mail"):
        u = who(request, site)
        out = []
        for c in added_accounts.list_for(int(u["id"])):
            cu = db.get_user_by_id(int(c.get("id") or c.get("contact_id") or 0)) if (c.get("id") or c.get("contact_id")) else None
            if cu:
                out.append({"name": cu["name"], "email": address_of(cu), "avatar": cu["avatar"]})
        return {"items": out}

    @r.post("/api/doga/mail/send")
    def mail_send(body: dict, request: Request, site: str = "mail"):
        u = who(request, site)
        return send_mail(u, body.get("to"), body.get("subject"), body.get("body"))

    @r.post("/api/doga/mail/{mid}/{action}")
    def mail_action(mid: int, action: str, request: Request, site: str = "mail"):
        u = who(request, site)
        me = int(u["id"])
        with _conn() as c:
            m = _own_mail(c, me, mid)
            if action == "read" and m["to_id"] == me:
                c.execute("UPDATE doga_mail SET read_at=COALESCE(read_at, ?) WHERE id=?", (time.time(), mid))
            elif action == "unread" and m["to_id"] == me:
                c.execute("UPDATE doga_mail SET read_at=NULL WHERE id=?", (mid,))
            elif action in ("star", "unstar") and m["to_id"] == me:
                c.execute("UPDATE doga_mail SET star=? WHERE id=?", (1 if action == "star" else 0, mid))
            elif action == "trash":
                c.execute(f"UPDATE doga_mail SET {'del_to' if m['to_id'] == me else 'del_from'}=1 WHERE id=?", (mid,))
            elif action == "restore" and m["to_id"] == me:
                c.execute("UPDATE doga_mail SET del_to=0 WHERE id=?", (mid,))
            elif action == "delete":
                c.execute(f"UPDATE doga_mail SET {'del_to' if m['to_id'] == me else 'del_from'}=2 WHERE id=?", (mid,))
            else:
                raise _err(400, "Acción no válida", "mail_action")
            m = c.execute("SELECT * FROM doga_mail WHERE id=?", (mid,)).fetchone()
        return _mail_view(m, me)

    # ---- juegos ----
    @r.get("/api/doga/games")
    def games_info(request: Request, site: str = "games"):
        u = who(request, site)
        with _conn() as c:
            left = max(0, DAILY_POINTS_CAP - _today_earned(c, int(u["id"])))
        return {"card": ensure_card(int(u["id"])), "today_left": left, "daily_cap": DAILY_POINTS_CAP,
                "rules": {k: {kk: vv for kk, vv in v.items()} for k, v in GAMES.items()}}

    @r.post("/api/doga/games/start")
    def games_start(body: dict, request: Request, site: str = "games"):
        u = who(request, site)
        return game_start(int(u["id"]), str(body.get("game") or ""), str(body.get("level") or ""))

    @r.post("/api/doga/games/finish")
    def games_finish(body: dict, request: Request, site: str = "games"):
        u = who(request, site)
        return game_finish(int(u["id"]), str(body.get("token") or ""), body.get("score"), bool(body.get("won")))

    @r.get("/api/doga/games/leaderboard")
    def games_board(game: str, request: Request, site: str = "games"):
        who(request, site)
        return {"items": leaderboard(game)}

    return r
