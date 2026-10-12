"""SQLite persistence for Snake OS users and sessions."""
from __future__ import annotations

import json
import secrets
import sqlite3
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent / "data"
DB_PATH = DATA_DIR / "snakeos.db"

EMPTY_LIST = "[]"
EMPTY_OBJ = "{}"


def get_conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                avatar TEXT NOT NULL DEFAULT '🐶',
                cloud_sub INTEGER NOT NULL DEFAULT 0,
                notes TEXT NOT NULL DEFAULT '[]',
                files TEXT NOT NULL DEFAULT '[]',
                trash TEXT NOT NULL DEFAULT '[]',
                iconpos TEXT NOT NULL DEFAULT '{}',
                ai_chat TEXT NOT NULL DEFAULT '[]',
                highscore INTEGER NOT NULL DEFAULT 0,
                store_apps TEXT NOT NULL DEFAULT '[]',
                tutorial_done INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at REAL NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        init_metaverse_tables(conn)
        init_chat_tables(conn)
        _ensure_user_store_apps_column(conn)
        _ensure_user_coins_look_columns(conn)
        _ensure_user_tutorial_column(conn)
        _ensure_user_setup_column(conn)
        _ensure_user_dtv_columns(conn)
        _ensure_user_desk_code_column(conn)
        _ensure_user_account_locked_column(conn)
        _ensure_user_desktop_prefs_column(conn)
        _ensure_user_ai_keys_column(conn)
        _ensure_user_location_columns(conn)
        init_book_tables(conn)




def _ensure_user_desktop_prefs_column(conn: sqlite3.Connection) -> None:
    cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "desktop_prefs" not in cols:
        conn.execute(
            "ALTER TABLE users ADD COLUMN desktop_prefs TEXT NOT NULL DEFAULT '{}'"
        )


def _ensure_user_ai_keys_column(conn: sqlite3.Connection) -> None:
    cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "ai_keys" not in cols:
        conn.execute(
            "ALTER TABLE users ADD COLUMN ai_keys TEXT NOT NULL DEFAULT '{}'"
        )


def _clean_ai_key(raw: Any, strict: bool) -> str:
    if raw is None:
        return ""
    if not isinstance(raw, str):
        if strict:
            raise ValueError("La clave tiene que ser texto")
        return ""
    text = raw.strip()
    if not text:
        return ""
    if len(text) > 300 or any(ch.isspace() for ch in text):
        if strict:
            raise ValueError("Clave no válida")
        return ""
    return text


def normalize_ai_keys(value: Any, strict: bool = False) -> dict[str, str]:
    data: Any = value
    if isinstance(value, str):
        data = _parse_json(value, {})
    if not isinstance(data, dict):
        data = {}
    return {
        "askbox": _clean_ai_key(data.get("askbox"), strict),
    }



def _ensure_user_location_columns(conn: sqlite3.Connection) -> None:
    cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "loc_lat" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN loc_lat REAL")
    if "loc_lng" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN loc_lng REAL")


def get_user_location(user_id: int) -> tuple[float, float] | None:
    with get_conn() as conn:
        _ensure_user_location_columns(conn)
        row = conn.execute(
            "SELECT loc_lat, loc_lng FROM users WHERE id = ?",
            (int(user_id),),
        ).fetchone()
    if not row or row["loc_lat"] is None or row["loc_lng"] is None:
        return None
    return (float(row["loc_lat"]), float(row["loc_lng"]))


def set_user_location(user_id: int, lat: float, lng: float) -> None:
    with get_conn() as conn:
        _ensure_user_location_columns(conn)
        conn.execute(
            "UPDATE users SET loc_lat = ?, loc_lng = ? WHERE id = ?",
            (float(lat), float(lng), int(user_id)),
        )

def get_ai_keys(user_id: int) -> dict[str, str]:
    with get_conn() as conn:
        _ensure_user_ai_keys_column(conn)
        row = conn.execute(
            "SELECT ai_keys FROM users WHERE id = ?",
            (int(user_id),),
        ).fetchone()
    if not row:
        return {"askbox": ""}
    return normalize_ai_keys(row["ai_keys"], strict=False)


def set_ai_keys(user_id: int, value: Any) -> dict[str, str]:
    clean = normalize_ai_keys(value, strict=True)
    with get_conn() as conn:
        _ensure_user_ai_keys_column(conn)
        conn.execute(
            "UPDATE users SET ai_keys = ? WHERE id = ?",
            (json.dumps(clean, ensure_ascii=False), int(user_id)),
        )
    return clean


def _ensure_user_store_apps_column(conn: sqlite3.Connection) -> None:
    """Existing databases were created before store installs were persisted."""
    cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "store_apps" not in cols:
        conn.execute(
            "ALTER TABLE users ADD COLUMN store_apps TEXT NOT NULL DEFAULT '[]'"
        )


# Avatar shop currency. Not bone_score (those are collected huesitos).
# STARTER_COINS is granted when the column is created (new rows and existing
# accounts that had no coins balance). Do not reset coins after that.
STARTER_COINS = 100

AVATAR_PARTS: dict[str, dict[str, int]] = {
    "skin": {
        "claro": 0,
        "melocoton": 15,
        "bronce": 15,
        "marron": 15,
        "oscuro": 20,
    },
    "hair": {
        "corto": 0,
        "castano": 20,
        "rubio": 25,
        "rosa": 40,
        "azul": 40,
        "rapado": 10,
    },
    "shirt": {
        "verde": 0,
        "rojo": 20,
        "azul": 20,
        "amarillo": 25,
        "morado": 30,
        "negro": 25,
    },
    "hat": {
        "none": 0,
        "gorra": 30,
        "sombrero": 45,
        "corona": 80,
    },
}

DEFAULT_MV_LOOK = {"skin": "claro", "hair": "corto", "shirt": "verde", "hat": "none"}


def _ensure_user_coins_look_columns(conn: sqlite3.Connection) -> None:
    cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "coins" not in cols:
        conn.execute(
            "ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 100"
        )
    if "mv_look" not in cols:
        conn.execute(
            "ALTER TABLE users ADD COLUMN mv_look TEXT NOT NULL DEFAULT '{}'"
        )


def normalize_mv_look(raw: Any) -> dict[str, str]:
    data: Any = raw
    if isinstance(raw, str):
        data = _parse_json(raw, {})
    if not isinstance(data, dict):
        data = {}
    out = dict(DEFAULT_MV_LOOK)
    for key, options in AVATAR_PARTS.items():
        val = data.get(key)
        if isinstance(val, str) and val in options:
            out[key] = val
    return out


def look_change_cost(old: dict[str, str], new: dict[str, str]) -> int:
    cost = 0
    for key, options in AVATAR_PARTS.items():
        if old.get(key) != new.get(key):
            cost += int(options[str(new[key])])
    return cost


def get_avatar_wallet(user_id: int) -> dict[str, Any]:
    with get_conn() as conn:
        _ensure_user_coins_look_columns(conn)
        row = conn.execute(
            "SELECT coins, mv_look FROM users WHERE id = ?",
            (int(user_id),),
        ).fetchone()
    if not row:
        return {"coins": 0, "look": dict(DEFAULT_MV_LOOK)}
    coins = row["coins"]
    return {
        "coins": int(coins if coins is not None else 0),
        "look": normalize_mv_look(row["mv_look"]),
    }


def buy_avatar_look(user_id: int, raw_look: Any) -> dict[str, Any]:
    """Subtract coins for changed outfit parts and save look on this user only."""
    uid = int(user_id)
    new_look = normalize_mv_look(raw_look)
    conn = get_conn()
    conn.isolation_level = None
    try:
        _ensure_user_coins_look_columns(conn)
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT coins, mv_look FROM users WHERE id = ?",
            (uid,),
        ).fetchone()
        if not row:
            conn.execute("ROLLBACK")
            return {
                "ok": False,
                "detail": "Usuario no encontrado",
                "coins": 0,
                "look": dict(DEFAULT_MV_LOOK),
                "spent": 0,
            }
        old = normalize_mv_look(row["mv_look"])
        coins = int(row["coins"] if row["coins"] is not None else 0)
        spent = look_change_cost(old, new_look)
        if spent > coins:
            conn.execute("ROLLBACK")
            return {
                "ok": False,
                "detail": "No tienes suficientes coins",
                "coins": coins,
                "look": old,
                "spent": 0,
            }
        coins -= spent
        conn.execute(
            "UPDATE users SET coins = ?, mv_look = ? WHERE id = ?",
            (coins, json.dumps(new_look, ensure_ascii=False), uid),
        )
        conn.execute("COMMIT")
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        raise
    finally:
        conn.close()
    return {"ok": True, "coins": coins, "look": new_look, "spent": spent}


def add_user_coins(user_id: int, amount: int = 1) -> int:
    """Add coins for this profile. Does not reset or rewrite other users."""
    amt = int(amount)
    uid = int(user_id)
    if amt == 0:
        return int(get_avatar_wallet(uid)["coins"])
    conn = get_conn()
    conn.isolation_level = None
    try:
        _ensure_user_coins_look_columns(conn)
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT coins FROM users WHERE id = ?", (uid,)).fetchone()
        if not row:
            conn.execute("ROLLBACK")
            return 0
        coins = int(row["coins"] if row["coins"] is not None else 0) + amt
        if coins < 0:
            coins = 0
        conn.execute("UPDATE users SET coins = ? WHERE id = ?", (coins, uid))
        conn.execute("COMMIT")
        return coins
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        raise
    finally:
        conn.close()


def _parse_json(raw: str | None, default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return default



def _ensure_user_tutorial_column(conn: sqlite3.Connection) -> None:
    """Existing accounts get tutorial_done=1 (never show). New signups insert 0."""
    cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "tutorial_done" not in cols:
        conn.execute(
            "ALTER TABLE users ADD COLUMN tutorial_done INTEGER NOT NULL DEFAULT 1"
        )


def tutorial_is_done(row: sqlite3.Row) -> bool:
    try:
        keys = set(row.keys())
    except Exception:
        return True
    if "tutorial_done" not in keys:
        return True
    val = row["tutorial_done"]
    if val is None:
        return True
    try:
        return int(val) != 0
    except (TypeError, ValueError):
        return True


def set_tutorial_done(user_id: int) -> sqlite3.Row | None:
    uid = int(user_id)
    with get_conn() as conn:
        _ensure_user_tutorial_column(conn)
        conn.execute("UPDATE users SET tutorial_done = 1 WHERE id = ?", (uid,))
        return conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()


def _ensure_user_setup_column(conn: sqlite3.Connection) -> None:
    """Existing accounts get setup_done=1. New signups insert 0."""
    cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "setup_done" not in cols:
        conn.execute(
            "ALTER TABLE users ADD COLUMN setup_done INTEGER NOT NULL DEFAULT 1"
        )


def setup_is_done(row: sqlite3.Row) -> bool:
    try:
        keys = set(row.keys())
    except Exception:
        return True
    if "setup_done" not in keys:
        return True
    val = row["setup_done"]
    if val is None:
        return True
    try:
        return int(val) != 0
    except (TypeError, ValueError):
        return True


def set_setup_done(user_id: int) -> sqlite3.Row | None:
    uid = int(user_id)
    with get_conn() as conn:
        _ensure_user_setup_column(conn)
        conn.execute("UPDATE users SET setup_done = 1 WHERE id = ?", (uid,))
        return conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()


DTV_PRICE = 5
DTV_PERIOD_SECONDS = 30 * 24 * 60 * 60


def _ensure_user_dtv_columns(conn: sqlite3.Connection) -> None:
    """Per-profile Doganiero TV. Does not touch coins or tutorial_done."""
    cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "dtv_until" not in cols:
        conn.execute(
            "ALTER TABLE users ADD COLUMN dtv_until INTEGER NOT NULL DEFAULT 0"
        )
    if "dtv_spent" not in cols:
        conn.execute(
            "ALTER TABLE users ADD COLUMN dtv_spent INTEGER NOT NULL DEFAULT 0"
        )


def _huesitos_parts(conn: sqlite3.Connection, user_id: int) -> tuple[int, int, int]:
    """Spendable huesitos = collected bone_score minus TV spent. Not users.coins."""
    uid = int(user_id)
    prog = conn.execute(
        "SELECT bone_score FROM metaverse_progress WHERE user_id = ?",
        (uid,),
    ).fetchone()
    bone = int(prog["bone_score"] or 0) if prog else 0
    row = conn.execute(
        "SELECT dtv_spent FROM users WHERE id = ?",
        (uid,),
    ).fetchone()
    spent = int(row["dtv_spent"] or 0) if row else 0
    if spent < 0:
        spent = 0
    balance = bone - spent
    if balance < 0:
        balance = 0
    return balance, bone, spent


def _dtv_payload(
    *,
    ok: bool,
    balance: int,
    bone: int,
    spent: int,
    until: int,
    now: int,
    error: str | None = None,
) -> dict[str, Any]:
    active = int(until) > int(now)
    days_left = 0
    if active:
        days_left = (int(until) - int(now) + 86399) // 86400
    out: dict[str, Any] = {
        "ok": ok,
        "huesitos": int(balance),
        "boneScore": int(bone),
        "spent": int(spent),
        "price": DTV_PRICE,
        "subscribed": active,
        "until": int(until),
        "daysLeft": int(days_left),
        "currency": "huesitos",
    }
    if error:
        out["error"] = error
    return out


def get_doganiero_tv(user_id: int) -> dict[str, Any]:
    import time as _time

    uid = int(user_id)
    now = int(_time.time())
    with get_conn() as conn:
        _ensure_user_dtv_columns(conn)
        init_metaverse_progress_table(conn)
        balance, bone, spent = _huesitos_parts(conn, uid)
        row = conn.execute(
            "SELECT dtv_until FROM users WHERE id = ?",
            (uid,),
        ).fetchone()
        until = int(row["dtv_until"] or 0) if row else 0
    return _dtv_payload(
        ok=True, balance=balance, bone=bone, spent=spent, until=until, now=now
    )


def subscribe_doganiero_tv(user_id: int) -> dict[str, Any]:
    """Charge 5 huesitos. Extends 30 days from the current expiry if still active.

    Updates only dtv_spent and dtv_until. Never writes users.coins.
    bone_score stays the collected-huesitos total. Metaverse saves only raise it,
    so the spent ledger keeps a payment from being refunded.
    """
    import time as _time

    uid = int(user_id)
    now = int(_time.time())
    with get_conn() as conn:
        _ensure_user_dtv_columns(conn)
        init_metaverse_progress_table(conn)
        balance, bone, spent = _huesitos_parts(conn, uid)
        row = conn.execute(
            "SELECT dtv_until FROM users WHERE id = ?",
            (uid,),
        ).fetchone()
        if not row:
            return _dtv_payload(
                ok=False, balance=0, bone=0, spent=0, until=0, now=now, error="missing"
            )
        until = int(row["dtv_until"] or 0)
        if balance < DTV_PRICE:
            return _dtv_payload(
                ok=False,
                balance=balance,
                bone=bone,
                spent=spent,
                until=until,
                now=now,
                error="huesitos",
            )
        new_spent = spent + DTV_PRICE
        base = until if until > now else now
        new_until = base + DTV_PERIOD_SECONDS
        conn.execute(
            "UPDATE users SET dtv_spent = ?, dtv_until = ? WHERE id = ?",
            (new_spent, new_until, uid),
        )
        balance = bone - new_spent
        if balance < 0:
            balance = 0
    return _dtv_payload(
        ok=True,
        balance=balance,
        bone=bone,
        spent=new_spent,
        until=new_until,
        now=now,
    )


def _ensure_user_account_locked_column(conn: sqlite3.Connection) -> None:
    cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "account_locked" not in cols:
        conn.execute(
            "ALTER TABLE users ADD COLUMN account_locked INTEGER NOT NULL DEFAULT 0"
        )


def account_is_locked(row: sqlite3.Row | None) -> bool:
    if row is None:
        return False
    try:
        keys = set(row.keys())
    except Exception:
        keys = set()
    if "account_locked" not in keys:
        return False
    try:
        return int(row["account_locked"] or 0) == 1
    except (TypeError, ValueError):
        return bool(row["account_locked"])


def set_account_locked(user_id: int, locked: bool) -> sqlite3.Row | None:
    uid = int(user_id)
    with get_conn() as conn:
        _ensure_user_account_locked_column(conn)
        conn.execute(
            "UPDATE users SET account_locked = ? WHERE id = ?",
            (1 if locked else 0, uid),
        )
        return conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()


def user_public(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "email": row["email"],
        "name": row["name"],
        "avatar": row["avatar"],
        "cloudSub": bool(row["cloud_sub"]),
        "tutorialDone": tutorial_is_done(row),
        "setupDone": setup_is_done(row),
        "accountLocked": account_is_locked(row),
    }


AVATARS_DIR = DATA_DIR / "avatars"
MAX_AVATAR_BYTES = 10_000_000  # imágenes y GIFs hasta 10 MB


def ensure_avatars_dir() -> Path:
    AVATARS_DIR.mkdir(parents=True, exist_ok=True)
    return AVATARS_DIR


def avatar_file_path(user_id: int) -> Path:
    return ensure_avatars_dir() / f"{int(user_id)}.jpg"


def avatar_public_url(user_id: int) -> str:
    path = avatar_file_path(user_id)
    try:
        ver = int(path.stat().st_mtime)
        return f"/api/avatars/{int(user_id)}?v={ver}"
    except OSError:
        return f"/api/avatars/{int(user_id)}"



def crop_animated_gif_bytes(
    data: bytes,
    sx: float,
    sy: float,
    sw: float,
    sh: float,
    out_size: int = 256,
) -> bytes:
    """Recorta todas las frames de un GIF y reescala (mantiene animación)."""
    import io
    try:
        from PIL import Image
    except ImportError as e:
        raise ValueError("El servidor no puede recortar GIFs ahora mismo") from e
    if not data:
        raise ValueError("Imagen vacía")
    src = Image.open(io.BytesIO(data))
    if str(getattr(src, "format", "") or "").upper() != "GIF":
        return data
    iw, ih = src.size
    if iw < 1 or ih < 1:
        raise ValueError("GIF inválido")
    left = int(round(sx))
    top = int(round(sy))
    right = int(round(sx + sw))
    bottom = int(round(sy + sh))
    left = max(0, min(iw - 1, left))
    top = max(0, min(ih - 1, top))
    right = max(left + 1, min(iw, right))
    bottom = max(top + 1, min(ih, bottom))
    box = (left, top, right, bottom)

    frames_rgba = []
    durations = []
    n_frames = int(getattr(src, "n_frames", 1) or 1)
    for i in range(n_frames):
        try:
            src.seek(i)
        except EOFError:
            break
        durations.append(int(src.info.get("duration", 100) or 100))
        rgba = src.convert("RGBA")
        cropped = rgba.crop(box).resize(
            (int(out_size), int(out_size)),
            Image.Resampling.LANCZOS,
        )
        frames_rgba.append(cropped)

    if not frames_rgba:
        raise ValueError("GIF sin frames")

    pal_frames = []
    for fr in frames_rgba:
        bg = Image.new("RGBA", fr.size, (11, 26, 18, 255))
        composed = Image.alpha_composite(bg, fr)
        pal_frames.append(
            composed.convert("RGB").convert("P", palette=Image.ADAPTIVE, colors=255)
        )

    buf = io.BytesIO()
    if len(pal_frames) == 1:
        pal_frames[0].save(buf, format="GIF", loop=0)
    else:
        pal_frames[0].save(
            buf,
            format="GIF",
            save_all=True,
            append_images=pal_frames[1:],
            duration=durations,
            loop=int(src.info.get("loop", 0) or 0),
            disposal=2,
            optimize=False,
        )
    out = buf.getvalue()
    if len(out) > MAX_AVATAR_BYTES:
        raise ValueError("El GIF recortado sigue siendo demasiado grande (máx. 10 MB)")
    return out


def save_avatar_jpeg(user_id: int, jpeg_bytes: bytes) -> str:
    """Guarda foto de perfil (JPEG/PNG/WebP/GIF). GIF conserva animación para todos."""
    if not jpeg_bytes or len(jpeg_bytes) < 32:
        raise ValueError("Imagen vacía")
    if len(jpeg_bytes) > MAX_AVATAR_BYTES:
        raise ValueError("La foto es demasiado grande (máx. 10 MB)")
    head = jpeg_bytes[:12]
    ok = (
        head.startswith(b"\xff\xd8\xff")
        or head.startswith(b"\x89PNG\r\n\x1a\n")
        or (len(head) >= 12 and head[0:4] == b"RIFF" and head[8:12] == b"WEBP")
        or head.startswith(b"GIF87a")
        or head.startswith(b"GIF89a")
    )
    if not ok:
        raise ValueError("Formato de imagen no válido (usa JPG, PNG, WebP o GIF)")
    path = avatar_file_path(user_id)
    path.write_bytes(jpeg_bytes)
    return avatar_public_url(user_id)


def clear_avatar_file(user_id: int) -> None:
    path = avatar_file_path(user_id)
    try:
        if path.exists():
            path.unlink()
    except OSError:
        pass


def is_photo_avatar(avatar: str | None) -> bool:
    a = str(avatar or "")
    return a.startswith("/api/avatars/")


# ---------- Doganiero Desk (código de escritorio tipo AnyDesk) ----------


def _ensure_user_desk_code_column(conn: sqlite3.Connection) -> None:
    cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "desk_code" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN desk_code TEXT")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_desk_code "
            "ON users(desk_code) WHERE desk_code IS NOT NULL"
        )


def normalize_desk_code(raw: Any) -> str:
    digits = "".join(ch for ch in str(raw or "") if ch.isdigit())
    return digits


def format_desk_code(code: str) -> str:
    c = normalize_desk_code(code)
    if len(c) != 9:
        return c
    return f"{c[0:3]} {c[3:6]} {c[6:9]}"


def _generate_unique_desk_code(conn: sqlite3.Connection) -> str:
    for _ in range(40):
        code = f"{secrets.randbelow(900_000_000) + 100_000_000}"
        row = conn.execute(
            "SELECT 1 FROM users WHERE desk_code = ?", (code,)
        ).fetchone()
        if not row:
            return code
    raise RuntimeError("No se pudo generar código de escritorio")


def ensure_user_desk_code(user_id: int) -> str:
    """Return the account desk code, creating one if missing."""
    uid = int(user_id)
    with get_conn() as conn:
        _ensure_user_desk_code_column(conn)
        row = conn.execute(
            "SELECT desk_code FROM users WHERE id = ?", (uid,)
        ).fetchone()
        if not row:
            raise ValueError("Usuario no encontrado")
        existing = normalize_desk_code(row["desk_code"])
        if len(existing) == 9:
            return existing
        code = _generate_unique_desk_code(conn)
        conn.execute("UPDATE users SET desk_code = ? WHERE id = ?", (code, uid))
        return code


def get_user_by_desk_code(raw_code: Any) -> sqlite3.Row | None:
    code = normalize_desk_code(raw_code)
    if len(code) != 9:
        return None
    with get_conn() as conn:
        _ensure_user_desk_code_column(conn)
        return conn.execute(
            "SELECT * FROM users WHERE desk_code = ?", (code,)
        ).fetchone()


def backfill_missing_desk_codes() -> int:
    """Assign codes to accounts that still lack one. Returns count updated."""
    updated = 0
    with get_conn() as conn:
        _ensure_user_desk_code_column(conn)
        rows = conn.execute(
            "SELECT id FROM users WHERE desk_code IS NULL OR TRIM(desk_code) = ''"
        ).fetchall()
        for row in rows:
            code = _generate_unique_desk_code(conn)
            conn.execute(
                "UPDATE users SET desk_code = ? WHERE id = ?",
                (code, int(row["id"])),
            )
            updated += 1
    return updated


def list_users() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, email, name, avatar, cloud_sub, highscore
            FROM users
            ORDER BY id ASC
            """
        ).fetchall()
    return [
        {
            "id": int(row["id"]),
            "email": row["email"],
            "name": row["name"],
            "avatar": row["avatar"],
            "cloudSub": bool(row["cloud_sub"]),
            "highscore": int(row["highscore"]),
        }
        for row in rows
    ]


_TOMBSTONE_COLUMNS = ("deleted", "deleted_at", "is_deleted")


def user_row_is_tombstone(row: sqlite3.Row | None) -> bool:
    """True only when the row is explicitly marked deleted. Live accounts are not."""
    if row is None:
        return False
    try:
        keys = set(row.keys())
    except Exception:
        return False
    for col in _TOMBSTONE_COLUMNS:
        if col not in keys:
            continue
        val = row[col]
        if val is None or val is False:
            continue
        if isinstance(val, (int, float)) and int(val) == 0:
            continue
        if isinstance(val, str) and val.strip().lower() in {"", "0", "false", "null", "none"}:
            continue
        return True
    return False


def get_user_by_email(email: str) -> sqlite3.Row | None:
    email_n = (email or "").strip().lower()
    if not email_n:
        return None
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
            (email_n,),
        ).fetchone()
    # A soft-deleted tombstone must not keep the address. Remove it and treat
    # the email as free. Live rows are returned unchanged.
    if row is not None and user_row_is_tombstone(row):
        delete_user(int(row["id"]))
        return None
    return row


def get_user_by_id(user_id: int) -> sqlite3.Row | None:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def create_user(email: str, name: str, password_hash: str, avatar: str) -> sqlite3.Row:
    email_n = (email or "").strip().lower()
    # Free the address if a previous delete only marked the row deleted.
    release_tombstone_email(email_n)
    with get_conn() as conn:
        _ensure_user_tutorial_column(conn)
        _ensure_user_setup_column(conn)
        _ensure_user_desk_code_column(conn)
        desk = _generate_unique_desk_code(conn)
        cur = conn.execute(
            """
            INSERT INTO users (email, name, password_hash, avatar, tutorial_done, setup_done, desk_code)
            VALUES (?, ?, ?, ?, 0, 0, ?)
            """,
            (email_n, name.strip(), password_hash, avatar, desk),
        )
        user_id = cur.lastrowid
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def update_user(
    user_id: int,
    *,
    name: str | None = None,
    avatar: str | None = None,
    password_hash: str | None = None,
    cloud_sub: bool | None = None,
) -> sqlite3.Row | None:
    fields: list[str] = []
    values: list[Any] = []
    if name is not None:
        fields.append("name = ?")
        values.append(name.strip())
    if avatar is not None:
        fields.append("avatar = ?")
        values.append(avatar)
    if password_hash is not None:
        fields.append("password_hash = ?")
        values.append(password_hash)
    if cloud_sub is not None:
        fields.append("cloud_sub = ?")
        values.append(1 if cloud_sub else 0)
    if not fields:
        return get_user_by_id(user_id)
    values.append(user_id)
    with get_conn() as conn:
        conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", values)
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


FILES_DIR = DATA_DIR / "user_files"
MAX_FILES_PER_USER = 10000
MAX_FILE_BYTES = 120 * 1024 * 1024  # ~120 MB por archivo (dataURL)


def user_files_dir(user_id: int) -> Path:
    p = FILES_DIR / str(int(user_id))
    p.mkdir(parents=True, exist_ok=True)
    return p


def _blob_path(user_id: int, file_id: int) -> Path:
    return user_files_dir(user_id) / f"{int(file_id)}.b64"


def _meta_entry(raw: dict, size=None):
    entry = {
        "id": raw.get("id"),
        "name": raw.get("name") or "archivo",
        "type": raw.get("type") or "application/octet-stream",
    }
    if size is None:
        size = raw.get("size")
    if size is not None:
        entry["size"] = int(size)
    return entry


def _extract_data_url(user_id: int, item: dict):
    fid = item.get("id")
    if fid is None:
        raise ValueError("file id required")
    data_url = item.get("dataUrl")
    if isinstance(data_url, str) and data_url:
        if len(data_url) > MAX_FILE_BYTES:
            raise ValueError("Archivo demasiado grande (máx %s bytes)" % MAX_FILE_BYTES)
        path = _blob_path(user_id, int(fid))
        path.write_text(data_url, encoding="utf-8")
        return _meta_entry(item, size=len(data_url))
    path = _blob_path(user_id, int(fid))
    size = item.get("size")
    if path.exists() and size is None:
        size = path.stat().st_size
    return _meta_entry(item, size=size)


def migrate_inline_file_list(user_id: int, field: str):
    if field not in {"files", "trash"}:
        raise ValueError(field)
    raw_list = get_json_field(user_id, field, [])
    if not isinstance(raw_list, list):
        raw_list = []
    changed = False
    meta = []
    for item in raw_list:
        if not isinstance(item, dict) or item.get("id") is None:
            continue
        if item.get("dataUrl"):
            meta.append(_extract_data_url(user_id, item))
            changed = True
        else:
            entry = _meta_entry(item)
            path = _blob_path(user_id, int(item["id"]))
            if path.exists() and "size" not in entry:
                entry["size"] = path.stat().st_size
            meta.append(entry)
            if set(item.keys()) - {"id", "name", "type", "size"}:
                changed = True
    if changed:
        with get_conn() as conn:
            conn.execute(
                "UPDATE users SET %s = ? WHERE id = ?" % field,
                (json.dumps(meta, ensure_ascii=False), user_id),
            )
    return meta


def list_file_meta(user_id: int, field: str = "files"):
    return migrate_inline_file_list(user_id, field)


def get_file_data_url(user_id: int, file_id: int):
    migrate_inline_file_list(user_id, "files")
    migrate_inline_file_list(user_id, "trash")
    path = _blob_path(user_id, file_id)
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def save_uploaded_file(user_id, *, file_id, name, type_, data_url, in_trash=False):
    if not isinstance(data_url, str) or not data_url.startswith("data:"):
        raise ValueError("dataUrl inválido")
    if len(data_url) > MAX_FILE_BYTES:
        raise ValueError("Archivo demasiado grande (máx %s bytes)" % MAX_FILE_BYTES)
    field = "trash" if in_trash else "files"
    other = "files" if in_trash else "trash"
    meta = list_file_meta(user_id, field)
    other_meta = list_file_meta(user_id, other)
    total = len(meta) + len(other_meta)
    existing_ids = {m.get("id") for m in meta}
    if file_id not in existing_ids and total >= MAX_FILES_PER_USER:
        raise ValueError("Límite de %s archivos alcanzado" % MAX_FILES_PER_USER)
    path = _blob_path(user_id, file_id)
    path.write_text(data_url, encoding="utf-8")
    entry = _meta_entry({"id": file_id, "name": name, "type": type_}, size=len(data_url))
    replaced = False
    for i, m in enumerate(meta):
        if m.get("id") == file_id:
            meta[i] = entry
            replaced = True
            break
    if not replaced:
        meta.append(entry)
    other_meta = [m for m in other_meta if m.get("id") != file_id]
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET %s = ? WHERE id = ?" % field,
            (json.dumps(meta, ensure_ascii=False), user_id),
        )
        conn.execute(
            "UPDATE users SET %s = ? WHERE id = ?" % other,
            (json.dumps(other_meta, ensure_ascii=False), user_id),
        )
    return entry


def sync_file_meta_list(user_id: int, field: str, items):
    if field not in {"files", "trash"}:
        raise ValueError(field)
    if not isinstance(items, list):
        raise ValueError("Se esperaba una lista")
    if len(items) > MAX_FILES_PER_USER:
        raise ValueError("Límite de %s archivos alcanzado" % MAX_FILES_PER_USER)
    meta = []
    keep_ids = set()
    for item in items:
        if not isinstance(item, dict) or item.get("id") is None:
            continue
        entry = _extract_data_url(user_id, item)
        fid = int(entry["id"])
        keep_ids.add(fid)
        meta.append(entry)
    other = "trash" if field == "files" else "files"
    other_meta = list_file_meta(user_id, other)
    other_ids = {int(m["id"]) for m in other_meta if m.get("id") is not None}
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET %s = ? WHERE id = ?" % field,
            (json.dumps(meta, ensure_ascii=False), user_id),
        )
    for path in user_files_dir(user_id).glob("*.b64"):
        try:
            fid = int(path.stem)
        except ValueError:
            continue
        if fid not in keep_ids and fid not in other_ids:
            try:
                path.unlink()
            except OSError:
                pass
    return meta


def delete_user_files(user_id: int) -> None:
    import shutil
    p = FILES_DIR / str(int(user_id))
    if p.exists():
        shutil.rmtree(p, ignore_errors=True)




WALLPAPERS_DIR = DATA_DIR / "wallpapers"
MAX_WALLPAPER_BYTES = 10_000_000
_WALLPAPER_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif")


def ensure_wallpapers_dir() -> Path:
    WALLPAPERS_DIR.mkdir(parents=True, exist_ok=True)
    return WALLPAPERS_DIR


def _wallpaper_sniff_ext(data: bytes) -> str:
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:2] == b"\xff\xd8":
        return ".jpg"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    raise ValueError("Formato de imagen no válido (PNG, JPG, WebP o GIF)")


def wallpaper_file_path(user_id: int) -> Path | None:
    base = ensure_wallpapers_dir()
    uid = int(user_id)
    for ext in _WALLPAPER_EXTS:
        p = base / f"{uid}{ext}"
        if p.is_file():
            return p
    return None


def wallpaper_public_url(user_id: int) -> str | None:
    path = wallpaper_file_path(user_id)
    if not path:
        return None
    try:
        ver = int(path.stat().st_mtime)
    except OSError:
        ver = 0
    return f"/api/me/wallpaper?v={ver}"


def clear_wallpaper_file(user_id: int) -> None:
    base = ensure_wallpapers_dir()
    uid = int(user_id)
    for ext in _WALLPAPER_EXTS:
        p = base / f"{uid}{ext}"
        if p.is_file():
            try:
                p.unlink()
            except OSError:
                pass


def save_wallpaper_bytes(user_id: int, data: bytes) -> str:
    if not data or len(data) < 32:
        raise ValueError("Imagen vacía")
    if len(data) > MAX_WALLPAPER_BYTES:
        raise ValueError("El fondo es demasiado grande (máx. 10 MB)")
    ext = _wallpaper_sniff_ext(data)
    clear_wallpaper_file(user_id)
    path = ensure_wallpapers_dir() / f"{int(user_id)}{ext}"
    path.write_bytes(data)
    url = wallpaper_public_url(user_id)
    if not url:
        raise ValueError("No se pudo guardar el fondo")
    return url


def normalize_desktop_prefs(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        value = {}
    allowed_wp = {
        "mint", "ocean", "sunset", "nebula",
        "snake-pixel", "snake-vivid", "custom",
    }
    wp = value.get("wallpaper")
    if not isinstance(wp, str) or wp not in allowed_wp:
        wp = "snake-vivid"
    theme = value.get("theme")
    if theme not in ("auto", "light", "dark"):
        theme = "auto"
    return {"wallpaper": wp, "theme": theme}


def get_json_field(user_id: int, field: str, default: Any) -> Any:
    allowed = {"notes", "files", "trash", "iconpos", "ai_chat", "store_apps", "desktop_prefs"}
    if field not in allowed:
        raise ValueError(f"Invalid field: {field}")
    with get_conn() as conn:
        row = conn.execute(f"SELECT {field} FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            return default
        return _parse_json(row[field], default)


def normalize_store_apps(value: Any) -> list[dict[str, Any]]:
    """Keep every downloaded app the client stored. Drop only malformed rows."""
    if not isinstance(value, list):
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            continue
        app_id = item.get("id")
        if not isinstance(app_id, str):
            continue
        app_id = app_id.strip()
        if not app_id or len(app_id) > 80 or app_id in seen:
            continue
        seen.add(app_id)
        clean: dict[str, Any] = {"id": app_id}
        for key in ("title", "icon", "cat", "desc", "kind"):
            raw = item.get(key)
            if isinstance(raw, str) and raw:
                clean[key] = raw[:500]
        for key in ("w", "h"):
            raw = item.get(key)
            if isinstance(raw, bool) or not isinstance(raw, (int, float)):
                continue
            num = int(raw)
            if 0 < num < 5000:
                clean[key] = num
        raw_at = item.get("installedAt")
        if isinstance(raw_at, bool) or not isinstance(raw_at, (int, float)):
            pass
        else:
            clean["installedAt"] = int(raw_at)
        out.append(clean)
        if len(out) >= 500:
            break
    return out


def set_json_field(user_id: int, field: str, value: Any) -> None:
    allowed = {"notes", "files", "trash", "iconpos", "ai_chat", "store_apps", "desktop_prefs"}
    if field not in allowed:
        raise ValueError(f"Invalid field: {field}")
    if field == "store_apps":
        value = normalize_store_apps(value)
    if field == "desktop_prefs":
        value = normalize_desktop_prefs(value)
    with get_conn() as conn:
        conn.execute(
            f"UPDATE users SET {field} = ? WHERE id = ?",
            (json.dumps(value, ensure_ascii=False), user_id),
        )


def get_highscore(user_id: int) -> int:
    with get_conn() as conn:
        row = conn.execute("SELECT highscore FROM users WHERE id = ?", (user_id,)).fetchone()
        return int(row["highscore"]) if row else 0


def set_highscore(user_id: int, value: int) -> int:
    value = max(0, int(value))
    with get_conn() as conn:
        conn.execute("UPDATE users SET highscore = ? WHERE id = ?", (value, user_id))
    return value


def import_user_data(
    user_id: int,
    *,
    notes: Any | None = None,
    files: Any | None = None,
    trash: Any | None = None,
    iconpos: Any | None = None,
    ai_chat: Any | None = None,
    highscore: int | None = None,
    cloud_sub: bool | None = None,
) -> None:
    with get_conn() as conn:
        if notes is not None:
            conn.execute(
                "UPDATE users SET notes = ? WHERE id = ?",
                (json.dumps(notes, ensure_ascii=False), user_id),
            )
        if files is not None:
            conn.execute(
                "UPDATE users SET files = ? WHERE id = ?",
                (json.dumps(files, ensure_ascii=False), user_id),
            )
        if trash is not None:
            conn.execute(
                "UPDATE users SET trash = ? WHERE id = ?",
                (json.dumps(trash, ensure_ascii=False), user_id),
            )
        if iconpos is not None:
            conn.execute(
                "UPDATE users SET iconpos = ? WHERE id = ?",
                (json.dumps(iconpos, ensure_ascii=False), user_id),
            )
        if ai_chat is not None:
            conn.execute(
                "UPDATE users SET ai_chat = ? WHERE id = ?",
                (json.dumps(ai_chat, ensure_ascii=False), user_id),
            )
        if highscore is not None:
            conn.execute(
                "UPDATE users SET highscore = ? WHERE id = ?",
                (max(0, int(highscore)), user_id),
            )
        if cloud_sub is not None:
            conn.execute(
                "UPDATE users SET cloud_sub = ? WHERE id = ?",
                (1 if cloud_sub else 0, user_id),
            )


def create_session(session_id: str, user_id: int, created_at: float) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)",
            (session_id, user_id, created_at),
        )


def get_session(session_id: str) -> sqlite3.Row | None:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()


def delete_session(session_id: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))


def delete_user_sessions(user_id: int) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (name,),
    ).fetchone()
    return row is not None


def _delete_if_table(conn: sqlite3.Connection, table: str, sql: str, params: tuple) -> None:
    """Run a delete in a savepoint so a missing/odd table cannot abort the user delete."""
    if not _table_exists(conn, table):
        return
    conn.execute("SAVEPOINT snake_del_child")
    try:
        conn.execute(sql, params)
        conn.execute("RELEASE snake_del_child")
    except sqlite3.Error:
        conn.execute("ROLLBACK TO snake_del_child")
        conn.execute("RELEASE snake_del_child")


def _unlink_quiet(path: Path) -> None:
    try:
        if path.is_file():
            path.unlink()
    except OSError:
        pass


def release_tombstone_email(email: str) -> bool:
    """Hard-delete a row that only exists as a deleted marker for this email.

    Live accounts are never removed here. Returns True if a tombstone was deleted.
    """
    email_n = (email or "").strip().lower()
    if not email_n or "@" not in email_n:
        return False
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
            (email_n,),
        ).fetchone()
    if not user_row_is_tombstone(row):
        return False
    return delete_user(int(row["id"]))


def purge_tombstone_users() -> int:
    """Remove every user row already marked deleted, so those emails can be reused."""
    with get_conn() as conn:
        cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(users)").fetchall()}
        flag = next((c for c in _TOMBSTONE_COLUMNS if c in cols), None)
        if not flag:
            return 0
        rows = conn.execute(f"SELECT id, {flag} AS flag FROM users").fetchall()
    removed = 0
    for row in rows:
        val = row["flag"]
        if val is None or val is False:
            continue
        if isinstance(val, (int, float)) and int(val) == 0:
            continue
        if isinstance(val, str) and val.strip().lower() in {"", "0", "false", "null", "none"}:
            continue
        if delete_user(int(row["id"])):
            removed += 1
    return removed


def purge_orphan_account_links() -> None:
    """Drop sessions and contact requests whose user row is already gone.

    Does not delete live users, and does not touch retired Doganiero phone numbers.
    """
    with get_conn() as conn:
        _delete_if_table(
            conn,
            "sessions",
            "DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users)",
            (),
        )
        _delete_if_table(
            conn,
            "account_requests",
            "DELETE FROM account_requests "
            "WHERE from_id NOT IN (SELECT id FROM users) OR to_id NOT IN (SELECT id FROM users)",
            (),
        )
        _delete_if_table(
            conn,
            "added_accounts",
            "DELETE FROM added_accounts "
            "WHERE owner_id NOT IN (SELECT id FROM users) OR contact_id NOT IN (SELECT id FROM users)",
            (),
        )
        _delete_if_table(
            conn,
            "calendar_events",
            "DELETE FROM calendar_events WHERE user_id NOT IN (SELECT id FROM users)",
            (),
        )
        _delete_if_table(
            conn,
            "book_follows",
            "DELETE FROM book_follows "
            "WHERE follower_id NOT IN (SELECT id FROM users) "
            "OR channel_user_id NOT IN (SELECT id FROM users)",
            (),
        )
        _delete_if_table(
            conn,
            "chat_reactions",
            "DELETE FROM chat_reactions WHERE user_id NOT IN (SELECT id FROM users)",
            (),
        )


def delete_user(user_id: int) -> bool:
    """Hard-delete one profile so its email can be registered again.

    Removes the user row (and the unique email index), sessions, saved location,
    and pending contact requests that involve this user. Does not keep a
    soft-deleted tombstone. Other people's accounts are left as they are.
    Retired Doganiero phone numbers stay reserved and are not reassigned.
    """
    uid = int(user_id)
    posts: list[tuple[int, str]] = []
    channel_exts: list[str] = []
    with get_conn() as conn:
        row = conn.execute("SELECT id, email FROM users WHERE id = ?", (uid,)).fetchone()
        if not row:
            return False
        email = str(row["email"] or "").strip().lower()
        if _table_exists(conn, "book_posts"):
            try:
                for post in conn.execute(
                    "SELECT id, ext FROM book_posts WHERE user_id = ?",
                    (uid,),
                ):
                    posts.append((int(post["id"]), str(post["ext"] or "")))
            except sqlite3.Error:
                posts = []
        if _table_exists(conn, "book_channels"):
            try:
                ch = conn.execute(
                    "SELECT photo_ext FROM book_channels WHERE user_id = ?",
                    (uid,),
                ).fetchone()
                if ch is not None:
                    channel_exts.append(str(ch["photo_ext"] or ""))
            except sqlite3.Error:
                channel_exts = []
        _delete_if_table(conn, "sessions", "DELETE FROM sessions WHERE user_id = ?", (uid,))
        _delete_if_table(
            conn,
            "account_requests",
            "DELETE FROM account_requests WHERE from_id = ? OR to_id = ?",
            (uid, uid),
        )
        _delete_if_table(
            conn,
            "added_accounts",
            "DELETE FROM added_accounts WHERE owner_id = ? OR contact_id = ?",
            (uid, uid),
        )
        _delete_if_table(
            conn,
            "calendar_events",
            "DELETE FROM calendar_events WHERE user_id = ?",
            (uid,),
        )
        _delete_if_table(
            conn,
            "book_follows",
            "DELETE FROM book_follows WHERE follower_id = ? OR channel_user_id = ?",
            (uid, uid),
        )
        _delete_if_table(
            conn,
            "chat_reactions",
            "DELETE FROM chat_reactions WHERE user_id = ?",
            (uid,),
        )
        _delete_if_table(
            conn,
            "dog_phone_calls",
            "DELETE FROM dog_phone_calls WHERE caller_id = ? OR callee_id = ?",
            (uid, uid),
        )
        # Location columns live on the user row. Deleting the row frees the
        # UNIQUE email index. No deleted flag is written.
        cur = conn.execute("DELETE FROM users WHERE id = ?", (uid,))
        ok = cur.rowcount > 0
        if ok and email:
            # If another tombstone still occupies this email, drop only that row.
            extras = conn.execute(
                "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
                (email,),
            ).fetchall()
            for extra in extras:
                if user_row_is_tombstone(extra):
                    conn.execute("DELETE FROM users WHERE id = ?", (int(extra["id"]),))
    if not ok:
        return False
    delete_user_files(uid)
    try:
        clear_wallpaper_file(uid)
    except Exception:
        pass
    try:
        clear_avatar_file(uid)
    except Exception:
        pass
    try:
        if AVATARS_DIR.is_dir():
            for path in AVATARS_DIR.glob(f"{uid}.*"):
                _unlink_quiet(path)
    except Exception:
        pass
    try:
        for post_id, ext in posts:
            _unlink_quiet(_book_media_path(post_id, ext))
        for ext in channel_exts:
            _unlink_quiet(_book_channel_photo_path(uid, ext))
        if BOOK_MEDIA_DIR.is_dir():
            for path in BOOK_MEDIA_DIR.glob(f"ch_{uid}.*"):
                _unlink_quiet(path)
    except Exception:
        pass
    try:
        purge_orphan_account_links()
    except Exception:
        pass
    return True


# ---------- Metaverse chat ----------

def init_metaverse_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS metaverse_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_email TEXT NOT NULL,
            from_name TEXT NOT NULL,
            to_email TEXT,
            text TEXT NOT NULL,
            created_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_metaverse_msg_created
            ON metaverse_messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_metaverse_msg_pair
            ON metaverse_messages(from_email, to_email);
        """
    )
    cols = {
        str(r[1])
        for r in conn.execute("PRAGMA table_info(metaverse_messages)").fetchall()
    }
    if "world" not in cols:
        conn.execute("ALTER TABLE metaverse_messages ADD COLUMN world TEXT")
        conn.execute(
            "UPDATE metaverse_messages SET world = 'plaza' "
            "WHERE to_email IS NULL AND (world IS NULL OR world = '')"
        )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_metaverse_msg_world "
        "ON metaverse_messages(world, created_at)"
    )
    init_metaverse_progress_table(conn)



def save_metaverse_message(
    *,
    from_email: str,
    from_name: str,
    to_email: str | None,
    text: str,
    created_at: float,
    world: str | None = None,
) -> dict[str, Any]:
    world_val = None if to_email else (world or "plaza")
    with get_conn() as conn:
        init_metaverse_tables(conn)
        cur = conn.execute(
            """
            INSERT INTO metaverse_messages
                (from_email, from_name, to_email, text, created_at, world)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                from_email.strip().lower(),
                from_name.strip(),
                (to_email.strip().lower() if to_email else None),
                text,
                float(created_at),
                world_val,
            ),
        )
        mid = int(cur.lastrowid)
    return {
        "id": mid,
        "from": from_email.strip().lower(),
        "fromName": from_name.strip(),
        "to": (to_email.strip().lower() if to_email else None),
        "text": text,
        "ts": float(created_at),
        "world": world_val,
    }


def list_metaverse_messages(
    *,
    user_email: str,
    peer_email: str | None = None,
    world: str | None = None,
    limit: int = 80,
) -> list[dict[str, Any]]:
    """Public room if peer_email is None (optionally filtered by world); otherwise DM."""
    limit = max(1, min(200, int(limit)))
    user_email = user_email.strip().lower()
    with get_conn() as conn:
        init_metaverse_tables(conn)
        if peer_email is None:
            world_id = (world or "plaza").strip().lower()
            rows = conn.execute(
                """
                SELECT id, from_email, from_name, to_email, text, created_at, world
                FROM metaverse_messages
                WHERE to_email IS NULL
                  AND (world = ? OR world IS NULL OR world = '')
                ORDER BY id DESC
                LIMIT ?
                """,
                (world_id, limit),
            ).fetchall()
        else:
            peer = peer_email.strip().lower()
            rows = conn.execute(
                """
                SELECT id, from_email, from_name, to_email, text, created_at, world
                FROM metaverse_messages
                WHERE
                    (from_email = ? AND to_email = ?)
                    OR (from_email = ? AND to_email = ?)
                ORDER BY id DESC
                LIMIT ?
                """,
                (user_email, peer, peer, user_email, limit),
            ).fetchall()
    out = [
        {
            "id": int(r["id"]),
            "from": r["from_email"],
            "fromName": r["from_name"],
            "to": r["to_email"],
            "text": r["text"],
            "ts": float(r["created_at"]),
            "world": r["world"] if "world" in r.keys() else None,
        }
        for r in rows
    ]
    out.reverse()
    return out


# ---------- Metaverse progress (per account) ----------

_DEFAULT_PREFS = "{}"


def init_metaverse_progress_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS metaverse_progress (
            user_id INTEGER PRIMARY KEY,
            world TEXT NOT NULL DEFAULT 'plaza',
            room TEXT,
            x REAL NOT NULL DEFAULT 400,
            y REAL NOT NULL DEFAULT 400,
            ry REAL NOT NULL DEFAULT 0,
            bone_score INTEGER NOT NULL DEFAULT 0,
            rps_wins INTEGER NOT NULL DEFAULT 0,
            rps_games INTEGER NOT NULL DEFAULT 0,
            memory_best INTEGER NOT NULL DEFAULT 0,
            memory_games INTEGER NOT NULL DEFAULT 0,
            aim_best INTEGER NOT NULL DEFAULT 0,
            aim_games INTEGER NOT NULL DEFAULT 0,
            games_played INTEGER NOT NULL DEFAULT 0,
            prefs_json TEXT NOT NULL DEFAULT '{}',
            updated_at REAL NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )


def _progress_row_to_dict(row: sqlite3.Row | None) -> dict[str, Any]:
    if not row:
        return {
            "world": "plaza",
            "room": None,
            "x": 400.0,
            "y": 400.0,
            "ry": 0.0,
            "boneScore": 0,
            "stats": {
                "rpsWins": 0,
                "rpsGames": 0,
                "memoryBest": 0,
                "memoryGames": 0,
                "aimBest": 0,
                "aimGames": 0,
                "gamesPlayed": 0,
            },
            "prefs": {},
            "updatedAt": 0.0,
        }
    try:
        prefs = json.loads(row["prefs_json"] or "{}")
        if not isinstance(prefs, dict):
            prefs = {}
    except Exception:
        prefs = {}
    return {
        "world": (row["world"] or "plaza").strip().lower() or "plaza",
        "room": row["room"],
        "x": float(row["x"]),
        "y": float(row["y"]),
        "ry": float(row["ry"]),
        "boneScore": int(row["bone_score"] or 0),
        "stats": {
            "rpsWins": int(row["rps_wins"] or 0),
            "rpsGames": int(row["rps_games"] or 0),
            "memoryBest": int(row["memory_best"] or 0),
            "memoryGames": int(row["memory_games"] or 0),
            "aimBest": int(row["aim_best"] or 0),
            "aimGames": int(row["aim_games"] or 0),
            "gamesPlayed": int(row["games_played"] or 0),
        },
        "prefs": prefs,
        "updatedAt": float(row["updated_at"] or 0),
    }


def get_metaverse_progress(user_id: int) -> dict[str, Any]:
    with get_conn() as conn:
        init_metaverse_progress_table(conn)
        row = conn.execute(
            "SELECT * FROM metaverse_progress WHERE user_id = ?",
            (int(user_id),),
        ).fetchone()
    return _progress_row_to_dict(row)


def upsert_metaverse_progress(
    user_id: int,
    *,
    world: str | None = None,
    room: Any = ...,
    x: float | None = None,
    y: float | None = None,
    ry: float | None = None,
    bone_score: int | None = None,
    prefs: dict[str, Any] | None = None,
    merge_prefs: bool = True,
    updated_at: float | None = None,
) -> dict[str, Any]:
    """Partial upsert of pose / world / score / prefs. room=... means omit; room=None clears."""
    import time as _time

    uid = int(user_id)
    now = float(updated_at if updated_at is not None else _time.time())
    with get_conn() as conn:
        init_metaverse_progress_table(conn)
        cur = conn.execute(
            "SELECT * FROM metaverse_progress WHERE user_id = ?", (uid,)
        ).fetchone()
        if cur is None:
            w = (world or "plaza").strip().lower() or "plaza"
            if w not in ("plaza", "parque", "ciudad"):
                w = "plaza"
            room_val = None if room is ... else (str(room).strip()[:64] if room else None)
            prefs_obj = prefs if isinstance(prefs, dict) else {}
            conn.execute(
                """
                INSERT INTO metaverse_progress (
                    user_id, world, room, x, y, ry, bone_score,
                    prefs_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    uid,
                    w,
                    room_val,
                    float(x if x is not None else 400.0),
                    float(y if y is not None else 400.0),
                    float(ry if ry is not None else 0.0),
                    max(0, int(bone_score if bone_score is not None else 0)),
                    json.dumps(prefs_obj, ensure_ascii=False),
                    now,
                ),
            )
        else:
            w = cur["world"] or "plaza"
            if world is not None:
                w = str(world).strip().lower() or "plaza"
                if w not in ("plaza", "parque", "ciudad"):
                    w = "plaza"
            if room is ...:
                room_val = cur["room"]
            elif room is None or room == "":
                room_val = None
            else:
                room_val = str(room).strip()[:64]
            xx = float(x if x is not None else cur["x"])
            yy = float(y if y is not None else cur["y"])
            rry = float(ry if ry is not None else cur["ry"])
            bs = int(cur["bone_score"] or 0)
            if bone_score is not None:
                bs = max(bs, max(0, int(bone_score)))
            try:
                old_prefs = json.loads(cur["prefs_json"] or "{}")
                if not isinstance(old_prefs, dict):
                    old_prefs = {}
            except Exception:
                old_prefs = {}
            if prefs is not None and isinstance(prefs, dict):
                if merge_prefs:
                    old_prefs.update(prefs)
                else:
                    old_prefs = prefs
            conn.execute(
                """
                UPDATE metaverse_progress SET
                    world = ?, room = ?, x = ?, y = ?, ry = ?,
                    bone_score = ?, prefs_json = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (
                    w,
                    room_val,
                    max(20.0, min(780.0, xx)),
                    max(20.0, min(780.0, yy)),
                    rry,
                    bs,
                    json.dumps(old_prefs, ensure_ascii=False),
                    now,
                    uid,
                ),
            )
        row = conn.execute(
            "SELECT * FROM metaverse_progress WHERE user_id = ?", (uid,)
        ).fetchone()
    return _progress_row_to_dict(row)


def record_metaverse_game_stat(
    user_id: int,
    kind: str,
    *,
    won: bool = False,
    score: int = 0,
) -> dict[str, Any]:
    """Bump minigame counters after a finished round/match."""
    import time as _time

    uid = int(user_id)
    kind = (kind or "").strip().lower()
    score = max(0, int(score or 0))
    now = _time.time()
    with get_conn() as conn:
        init_metaverse_progress_table(conn)
        cur = conn.execute(
            "SELECT * FROM metaverse_progress WHERE user_id = ?", (uid,)
        ).fetchone()
        if cur is None:
            conn.execute(
                """
                INSERT INTO metaverse_progress (user_id, updated_at)
                VALUES (?, ?)
                """,
                (uid, now),
            )
            cur = conn.execute(
                "SELECT * FROM metaverse_progress WHERE user_id = ?", (uid,)
            ).fetchone()
        rps_wins = int(cur["rps_wins"] or 0)
        rps_games = int(cur["rps_games"] or 0)
        memory_best = int(cur["memory_best"] or 0)
        memory_games = int(cur["memory_games"] or 0)
        aim_best = int(cur["aim_best"] or 0)
        aim_games = int(cur["aim_games"] or 0)
        games_played = int(cur["games_played"] or 0) + 1
        if kind == "rps":
            rps_games += 1
            if won:
                rps_wins += 1
        elif kind == "memory":
            memory_games += 1
            memory_best = max(memory_best, score)
        elif kind == "aim":
            aim_games += 1
            aim_best = max(aim_best, score)
        conn.execute(
            """
            UPDATE metaverse_progress SET
                rps_wins = ?, rps_games = ?,
                memory_best = ?, memory_games = ?,
                aim_best = ?, aim_games = ?,
                games_played = ?, updated_at = ?
            WHERE user_id = ?
            """,
            (
                rps_wins,
                rps_games,
                memory_best,
                memory_games,
                aim_best,
                aim_games,
                games_played,
                now,
                uid,
            ),
        )
        row = conn.execute(
            "SELECT * FROM metaverse_progress WHERE user_id = ?", (uid,)
        ).fetchone()
    return _progress_row_to_dict(row)


def get_user_id_by_email(email: str) -> int | None:
    row = get_user_by_email(email)
    return int(row["id"]) if row else None

# ---------- Doganiero Chat + Notifications ----------

def init_chat_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_user_id INTEGER NOT NULL,
            to_user_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            created_at REAL NOT NULL,
            read_at REAL,
            FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chat_msg_pair
            ON chat_messages(from_user_id, to_user_id, id);
        CREATE INDEX IF NOT EXISTS idx_chat_msg_to_unread
            ON chat_messages(to_user_id, read_at);

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            kind TEXT NOT NULL DEFAULT 'chat',
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            data TEXT NOT NULL DEFAULT '{}',
            read INTEGER NOT NULL DEFAULT 0,
            created_at REAL NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_notif_user_created
            ON notifications(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notif_user_unread
            ON notifications(user_id, read, created_at DESC);

        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            endpoint TEXT NOT NULL UNIQUE,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at REAL NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_push_user
            ON push_subscriptions(user_id);
        """
    )
    cols = {row[1] for row in conn.execute("PRAGMA table_info(chat_messages)").fetchall()}
    if "image" not in cols:
        conn.execute("ALTER TABLE chat_messages ADD COLUMN image TEXT")


def _user_brief_from_row(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if not row:
        return None
    return {
        "id": int(row["id"]),
        "email": row["email"],
        "name": row["name"],
        "avatar": row["avatar"],
    }


def list_chat_profiles(*, exclude_user_id: int | None = None) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, email, name, avatar
            FROM users
            ORDER BY name COLLATE NOCASE ASC, id ASC
            """
        ).fetchall()
    out = []
    for row in rows:
        uid = int(row["id"])
        if exclude_user_id is not None and uid == int(exclude_user_id):
            continue
        out.append(
            {
                "id": uid,
                "email": row["email"],
                "name": row["name"],
                "avatar": row["avatar"],
            }
        )
    return out


def _chat_image_value(row: sqlite3.Row) -> str | None:
    keys = row.keys() if hasattr(row, "keys") else []
    if "image" not in keys:
        return None
    raw = row["image"]
    if not raw:
        return None
    return str(raw)


def _normalize_chat_image(image: str | None) -> str | None:
    if image is None:
        return None
    image = str(image).strip()
    if not image:
        return None
    head = image[:80].lower()
    if not (
        head.startswith("data:image/jpeg")
        or head.startswith("data:image/jpg")
        or head.startswith("data:image/png")
        or head.startswith("data:image/webp")
    ):
        raise ValueError("notimage")
    if ";base64," not in head:
        raise ValueError("notimage")
    if len(image) > 1_700_000:
        raise ValueError("toolarge")
    return image


def _msg_dict(
    row: sqlite3.Row,
    *,
    from_brief: dict[str, Any] | None = None,
    to_brief: dict[str, Any] | None = None,
    include_image: bool = True,
) -> dict[str, Any]:
    out = {
        "id": int(row["id"]),
        "fromUserId": int(row["from_user_id"]),
        "toUserId": int(row["to_user_id"]),
        "text": row["text"],
        "ts": float(row["created_at"]),
        "readAt": float(row["read_at"]) if row["read_at"] is not None else None,
        "from": from_brief,
        "to": to_brief,
    }
    if include_image:
        img = _chat_image_value(row)
        if img:
            out["image"] = img
    return out


def save_chat_message(
    *,
    from_user_id: int,
    to_user_id: int,
    text: str,
    created_at: float,
    image: str | None = None,
) -> dict[str, Any]:
    image = _normalize_chat_image(image)
    text = (text or "").strip()
    if not text and image:
        text = "📷 Foto"
    if not text:
        raise ValueError("empty")
    if len(text) > 2000:
        text = text[:2000]
    with get_conn() as conn:
        init_chat_tables(conn)
        cur = conn.execute(
            """
            INSERT INTO chat_messages
                (from_user_id, to_user_id, text, created_at, read_at, image)
            VALUES (?, ?, ?, ?, NULL, ?)
            """,
            (int(from_user_id), int(to_user_id), text, float(created_at), image),
        )
        mid = int(cur.lastrowid)
        from_row = conn.execute(
            "SELECT id, email, name, avatar FROM users WHERE id = ?",
            (int(from_user_id),),
        ).fetchone()
        to_row = conn.execute(
            "SELECT id, email, name, avatar FROM users WHERE id = ?",
            (int(to_user_id),),
        ).fetchone()
        row = conn.execute(
            "SELECT * FROM chat_messages WHERE id = ?", (mid,)
        ).fetchone()
    return _msg_dict(
        row,
        from_brief=_user_brief_from_row(from_row),
        to_brief=_user_brief_from_row(to_row),
    )



def find_recent_identical_chat_message(
    *,
    from_user_id: int,
    to_user_id: int,
    text: str,
    within_seconds: float = 2.0,
    image: str | None = None,
) -> dict[str, Any] | None:
    """Return the newest matching row if an identical message was just saved (double-submit)."""
    import time as _time
    text = (text or "").strip()
    if image:
        image = _normalize_chat_image(image)
    if not text and image:
        text = "📷 Foto"
    if not text:
        return None
    image_key = image or ""
    within = max(0.2, float(within_seconds))
    with get_conn() as conn:
        init_chat_tables(conn)
        row = conn.execute(
            """
            SELECT * FROM chat_messages
            WHERE from_user_id = ? AND to_user_id = ? AND text = ?
              AND IFNULL(image, '') = ?
              AND created_at >= ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (
                int(from_user_id),
                int(to_user_id),
                text,
                image_key,
                float(_time.time()) - within,
            ),
        ).fetchone()
        if not row:
            return None
        from_row = conn.execute(
            "SELECT id, email, name, avatar FROM users WHERE id = ?",
            (int(from_user_id),),
        ).fetchone()
        to_row = conn.execute(
            "SELECT id, email, name, avatar FROM users WHERE id = ?",
            (int(to_user_id),),
        ).fetchone()
    return _msg_dict(
        row,
        from_brief=_user_brief_from_row(from_row),
        to_brief=_user_brief_from_row(to_row),
    )


def list_chat_messages(
    *,
    user_id: int,
    peer_user_id: int,
    limit: int = 100,
) -> list[dict[str, Any]]:
    limit = max(1, min(300, int(limit)))
    uid = int(user_id)
    peer = int(peer_user_id)
    with get_conn() as conn:
        init_chat_tables(conn)
        rows = conn.execute(
            """
            SELECT m.*,
                   fu.email AS from_email, fu.name AS from_name, fu.avatar AS from_avatar,
                   tu.email AS to_email, tu.name AS to_name, tu.avatar AS to_avatar
            FROM chat_messages m
            JOIN users fu ON fu.id = m.from_user_id
            JOIN users tu ON tu.id = m.to_user_id
            WHERE
                (m.from_user_id = ? AND m.to_user_id = ?)
                OR (m.from_user_id = ? AND m.to_user_id = ?)
            ORDER BY m.id DESC
            LIMIT ?
            """,
            (uid, peer, peer, uid, limit),
        ).fetchall()
    out = []
    for r in rows:
        out.append(
            {
                "id": int(r["id"]),
                "fromUserId": int(r["from_user_id"]),
                "toUserId": int(r["to_user_id"]),
                "text": r["text"],
                "image": (str(r["image"]) if ("image" in r.keys() and r["image"]) else None),
                "ts": float(r["created_at"]),
                "readAt": float(r["read_at"]) if r["read_at"] is not None else None,
                "from": {
                    "id": int(r["from_user_id"]),
                    "email": r["from_email"],
                    "name": r["from_name"],
                    "avatar": r["from_avatar"],
                },
                "to": {
                    "id": int(r["to_user_id"]),
                    "email": r["to_email"],
                    "name": r["to_name"],
                    "avatar": r["to_avatar"],
                },
            }
        )
    out.reverse()
    return out


def mark_chat_messages_read(*, user_id: int, peer_user_id: int, read_at: float) -> int:
    """Mark messages sent TO user_id FROM peer as read. Returns count updated."""
    with get_conn() as conn:
        init_chat_tables(conn)
        cur = conn.execute(
            """
            UPDATE chat_messages
            SET read_at = ?
            WHERE to_user_id = ? AND from_user_id = ? AND read_at IS NULL
            """,
            (float(read_at), int(user_id), int(peer_user_id)),
        )
        return int(cur.rowcount or 0)


def list_chat_threads(*, user_id: int) -> list[dict[str, Any]]:
    uid = int(user_id)
    with get_conn() as conn:
        init_chat_tables(conn)
        rows = conn.execute(
            """
            SELECT
              peer_id,
              MAX(id) AS last_id
            FROM (
              SELECT
                CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END AS peer_id,
                id
              FROM chat_messages
              WHERE from_user_id = ? OR to_user_id = ?
            )
            GROUP BY peer_id
            ORDER BY last_id DESC
            """,
            (uid, uid, uid),
        ).fetchall()
        threads: list[dict[str, Any]] = []
        for r in rows:
            peer_id = int(r["peer_id"])
            last = conn.execute(
                "SELECT * FROM chat_messages WHERE id = ?",
                (int(r["last_id"]),),
            ).fetchone()
            peer = conn.execute(
                "SELECT id, email, name, avatar FROM users WHERE id = ?",
                (peer_id,),
            ).fetchone()
            if not peer or not last:
                continue
            unread = conn.execute(
                """
                SELECT COUNT(*) AS c FROM chat_messages
                WHERE to_user_id = ? AND from_user_id = ? AND read_at IS NULL
                """,
                (uid, peer_id),
            ).fetchone()
            from_u = conn.execute(
                "SELECT id, email, name, avatar FROM users WHERE id = ?",
                (int(last["from_user_id"]),),
            ).fetchone()
            to_u = conn.execute(
                "SELECT id, email, name, avatar FROM users WHERE id = ?",
                (int(last["to_user_id"]),),
            ).fetchone()
            threads.append(
                {
                    "peer": _user_brief_from_row(peer),
                    "lastMessage": _msg_dict(
                        last,
                        from_brief=_user_brief_from_row(from_u),
                        to_brief=_user_brief_from_row(to_u),
                        include_image=False,
                    ),
                    "unread": int(unread["c"] if unread else 0),
                }
            )
    return threads


def create_notification(
    *,
    user_id: int,
    kind: str,
    title: str,
    body: str,
    data: dict[str, Any] | None,
    created_at: float,
) -> dict[str, Any]:
    payload = json.dumps(data or {}, ensure_ascii=False)
    with get_conn() as conn:
        init_chat_tables(conn)
        cur = conn.execute(
            """
            INSERT INTO notifications
                (user_id, kind, title, body, data, read, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?)
            """,
            (
                int(user_id),
                (kind or "chat")[:40],
                (title or "")[:200],
                (body or "")[:500],
                payload,
                float(created_at),
            ),
        )
        nid = int(cur.lastrowid)
        row = conn.execute(
            "SELECT * FROM notifications WHERE id = ?", (nid,)
        ).fetchone()
    return _notification_dict(row)


def _notification_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "userId": int(row["user_id"]),
        "kind": row["kind"],
        "title": row["title"],
        "body": row["body"],
        "data": _parse_json(row["data"], {}),
        "read": bool(row["read"]),
        "ts": float(row["created_at"]),
    }


def list_notifications(
    *,
    user_id: int,
    unread_only: bool = False,
    limit: int = 50,
) -> list[dict[str, Any]]:
    limit = max(1, min(100, int(limit)))
    with get_conn() as conn:
        init_chat_tables(conn)
        if unread_only:
            rows = conn.execute(
                """
                SELECT * FROM notifications
                WHERE user_id = ? AND read = 0
                ORDER BY id DESC
                LIMIT ?
                """,
                (int(user_id), limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM notifications
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (int(user_id), limit),
            ).fetchall()
    return [_notification_dict(r) for r in rows]


def count_unread_notifications(*, user_id: int) -> int:
    with get_conn() as conn:
        init_chat_tables(conn)
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0",
            (int(user_id),),
        ).fetchone()
    return int(row["c"] if row else 0)


def get_notification(*, user_id: int, notif_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        init_chat_tables(conn)
        row = conn.execute(
            "SELECT * FROM notifications WHERE id = ? AND user_id = ?",
            (int(notif_id), int(user_id)),
        ).fetchone()
    return _notification_dict(row) if row else None


def mark_notification_read(*, user_id: int, notif_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        init_chat_tables(conn)
        cur = conn.execute(
            """
            UPDATE notifications SET read = 1
            WHERE id = ? AND user_id = ?
            """,
            (int(notif_id), int(user_id)),
        )
        if not cur.rowcount:
            return None
        row = conn.execute(
            "SELECT * FROM notifications WHERE id = ?", (int(notif_id),)
        ).fetchone()
    return _notification_dict(row) if row else None


def mark_all_notifications_read(*, user_id: int) -> int:
    with get_conn() as conn:
        init_chat_tables(conn)
        cur = conn.execute(
            "UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0",
            (int(user_id),),
        )
        return int(cur.rowcount or 0)



def delete_all_notifications(*, user_id: int, email: str | None = None) -> int:
    """Delete notifications for one profile only.

    The session user id is required. When email is provided it must belong to
    that same account; a mismatch deletes nothing. This never wipes other profiles.
    """
    uid = int(user_id)
    if uid <= 0:
        return 0
    email_n = (email or "").strip().lower()
    with get_conn() as conn:
        init_chat_tables(conn)
        if email_n:
            owner = conn.execute(
                "SELECT id, email FROM users WHERE id = ? AND lower(email) = ?",
                (uid, email_n),
            ).fetchone()
        else:
            owner = conn.execute(
                "SELECT id, email FROM users WHERE id = ?",
                (uid,),
            ).fetchone()
        if not owner:
            return 0
        cur = conn.execute(
            "DELETE FROM notifications WHERE user_id = ?",
            (int(owner["id"]),),
        )
        return int(cur.rowcount or 0)


def upsert_push_subscription(
    *,
    user_id: int,
    endpoint: str,
    p256dh: str,
    auth: str,
    created_at: float,
) -> None:
    """Bind this browser endpoint to the current profile only.

    The same device endpoint is removed from every other account first, so a
    phone that switches profiles rings for the logged-in one.
    """
    endpoint_s = (endpoint or "").strip()
    if not endpoint_s.startswith("https://") or len(endpoint_s) > 2000:
        raise ValueError("endpoint")
    p256 = (p256dh or "").strip()
    auth_s = (auth or "").strip()
    if not p256 or not auth_s or len(p256) > 300 or len(auth_s) > 300:
        raise ValueError("keys")
    uid = int(user_id)
    with get_conn() as conn:
        init_chat_tables(conn)
        owner = conn.execute("SELECT id FROM users WHERE id = ?", (uid,)).fetchone()
        if not owner:
            raise ValueError("user")
        conn.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint_s,))
        conn.execute(
            """
            INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (uid, endpoint_s, p256, auth_s, float(created_at)),
        )


def list_push_subscriptions(*, user_id: int) -> list[dict[str, Any]]:
    with get_conn() as conn:
        init_chat_tables(conn)
        rows = conn.execute(
            """
            SELECT endpoint, p256dh, auth
            FROM push_subscriptions
            WHERE user_id = ?
            """,
            (int(user_id),),
        ).fetchall()
    return [
        {"endpoint": r["endpoint"], "p256dh": r["p256dh"], "auth": r["auth"]}
        for r in rows
    ]


def delete_push_subscription(*, user_id: int, endpoint: str) -> int:
    endpoint_s = (endpoint or "").strip()
    if not endpoint_s:
        return 0
    with get_conn() as conn:
        init_chat_tables(conn)
        cur = conn.execute(
            "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
            (int(user_id), endpoint_s),
        )
        return int(cur.rowcount or 0)


def delete_push_subscription_by_endpoint(*, endpoint: str) -> None:
    endpoint_s = (endpoint or "").strip()
    if not endpoint_s:
        return
    with get_conn() as conn:
        init_chat_tables(conn)
        conn.execute(
            "DELETE FROM push_subscriptions WHERE endpoint = ?",
            (endpoint_s,),
        )


def mark_chat_notifications_read_for_peer(
    *,
    user_id: int,
    peer_email: str,
) -> int:
    """Mark chat notifications from a peer as read (by data.peerEmail)."""
    peer = (peer_email or "").strip().lower()
    if not peer:
        return 0
    with get_conn() as conn:
        init_chat_tables(conn)
        rows = conn.execute(
            """
            SELECT id, data FROM notifications
            WHERE user_id = ? AND kind = 'chat' AND read = 0
            """,
            (int(user_id),),
        ).fetchall()
        ids = []
        for r in rows:
            data = _parse_json(r["data"], {})
            if str(data.get("peerEmail") or "").strip().lower() == peer:
                ids.append(int(r["id"]))
        if not ids:
            return 0
        conn.executemany(
            "UPDATE notifications SET read = 1 WHERE id = ?",
            [(i,) for i in ids],
        )
        return len(ids)


def notification_exists_for_event(
    *,
    user_id: int,
    kind: str,
    event_id: str,
) -> bool:
    """True if user already has a notification for this kind+eventId (dedupe)."""
    eid = str(event_id or "").strip()
    if not eid:
        return False
    kind_s = (kind or "")[:40]
    with get_conn() as conn:
        init_chat_tables(conn)
        rows = conn.execute(
            """
            SELECT data FROM notifications
            WHERE user_id = ? AND kind = ?
            ORDER BY id DESC
            LIMIT 300
            """,
            (int(user_id), kind_s),
        ).fetchall()
    for r in rows:
        data = _parse_json(r["data"], {})
        existing = str(data.get("eventId") or data.get("roomId") or "").strip()
        if existing == eid:
            return True
    return False


def ensure_metaverse_event_notifications(
    *,
    user_id: int,
    events: list[dict[str, Any]],
    created_at: float,
) -> list[dict[str, Any]]:
    """Create in-app notifications for active Metaverse events; dedupe by eventId."""
    created: list[dict[str, Any]] = []
    uid = int(user_id)
    for ev in events or []:
        if not isinstance(ev, dict):
            continue
        event_id = str(ev.get("eventId") or ev.get("roomId") or "").strip()
        if not event_id:
            continue
        if notification_exists_for_event(
            user_id=uid, kind="metaverse", event_id=event_id
        ):
            continue
        emoji = str(ev.get("emoji") or "🌐").strip() or "🌐"
        title = str(ev.get("title") or "Evento activo").strip()
        room_name = str(ev.get("roomName") or ev.get("name") or "").strip()
        status = str(ev.get("status") or "").strip()
        time_label = str(ev.get("time") or "").strip()
        parts = [p for p in (room_name, status, time_label) if p]
        body = " · ".join(parts) if parts else str(ev.get("description") or "Evento en curso")
        notif = create_notification(
            user_id=uid,
            kind="metaverse",
            title=f"{emoji} {title}"[:200],
            body=body[:500],
            data={
                "app": "metaverse",
                "eventId": event_id,
                "roomId": event_id,
                "world": str(ev.get("world") or "").strip() or None,
                "status": status or None,
                "roomName": room_name or None,
            },
            created_at=float(created_at),
        )
        created.append(notif)
    return created



# ===== DoganieroBook =====
BOOK_MEDIA_DIR = DATA_DIR / "book_media"
BOOK_MAX_IMAGE_BYTES = 40 * 1024 * 1024  # 40 MB decoded (fotos)
BOOK_MAX_VIDEO_BYTES = 100 * 1024 * 1024  # 100 MB decoded (~30 min comprimido; CF free)
BOOK_MAX_VIDEO_DURATION_SEC = 30 * 60  # 30 minutos
BOOK_MAX_BYTES = BOOK_MAX_VIDEO_BYTES  # compat
BOOK_VIEW_COOLDOWN = 6 * 3600  # same user + post: 1 visita / 6h
BOOK_HANDLE_RE = __import__("re").compile(r"^[a-z0-9_]{3,24}$")


def init_book_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS book_channels (
            user_id INTEGER PRIMARY KEY,
            handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
            title TEXT NOT NULL,
            bio TEXT NOT NULL DEFAULT '',
            created_at REAL NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS book_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            mime TEXT NOT NULL,
            ext TEXT NOT NULL DEFAULT '',
            views INTEGER NOT NULL DEFAULT 0,
            created_at REAL NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_book_posts_user ON book_posts(user_id);
        CREATE INDEX IF NOT EXISTS idx_book_posts_created ON book_posts(created_at DESC);
        CREATE TABLE IF NOT EXISTS book_views (
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            last_at REAL NOT NULL,
            PRIMARY KEY (post_id, user_id),
            FOREIGN KEY (post_id) REFERENCES book_posts(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS book_inbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            kind TEXT NOT NULL DEFAULT 'system',
            created_at REAL NOT NULL,
            read_at REAL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_book_inbox_user ON book_inbox(user_id, created_at DESC);
        """
    )
    cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(book_channels)").fetchall()}
    if "photo_mime" not in cols:
        conn.execute("ALTER TABLE book_channels ADD COLUMN photo_mime TEXT NOT NULL DEFAULT ''")
    if "photo_ext" not in cols:
        conn.execute("ALTER TABLE book_channels ADD COLUMN photo_ext TEXT NOT NULL DEFAULT ''")
    if "updated_at" not in cols:
        conn.execute("ALTER TABLE book_channels ADD COLUMN updated_at REAL NOT NULL DEFAULT 0")
        conn.execute("UPDATE book_channels SET updated_at = created_at WHERE updated_at = 0 OR updated_at IS NULL")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS book_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            body TEXT NOT NULL,
            created_at REAL NOT NULL,
            FOREIGN KEY (post_id) REFERENCES book_posts(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_book_comments_post ON book_comments(post_id, created_at ASC);
        CREATE TABLE IF NOT EXISTS book_likes (
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at REAL NOT NULL,
            PRIMARY KEY (post_id, user_id),
            FOREIGN KEY (post_id) REFERENCES book_posts(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """
    )


def _book_media_path(post_id: int, ext: str = "") -> Path:
    BOOK_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    safe_ext = "".join(ch for ch in (ext or "") if ch.isalnum())[:8]
    name = f"{int(post_id)}.{safe_ext}" if safe_ext else str(int(post_id))
    return BOOK_MEDIA_DIR / name


def _book_user_brief(row: sqlite3.Row | None) -> dict[str, Any]:
    if not row:
        return {"id": None, "email": "", "name": "Usuario", "avatar": "👤"}
    return {
        "id": int(row["id"]),
        "email": str(row["email"] or ""),
        "name": str(row["name"] or "Usuario"),
        "avatar": str(row["avatar"] or "👤"),
    }


def _book_channel_photo_path(user_id: int, ext: str = "") -> Path:
    BOOK_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    safe_ext = "".join(ch for ch in (ext or "") if ch.isalnum())[:8]
    name = f"ch_{int(user_id)}.{safe_ext}" if safe_ext else f"ch_{int(user_id)}"
    return BOOK_MEDIA_DIR / name


def _book_channel_dict(row: sqlite3.Row, owner: sqlite3.Row | None = None, post_count: int = 0) -> dict[str, Any]:
    handle = str(row["handle"])
    photo_mime = ""
    try:
        photo_mime = str(row["photo_mime"] or "")
    except (KeyError, IndexError):
        photo_mime = ""
    has_photo = bool(photo_mime)
    try:
        updated = float(row["updated_at"] or 0) or float(row["created_at"])
    except (KeyError, IndexError, TypeError, ValueError):
        updated = float(row["created_at"])
    return {
        "userId": int(row["user_id"]),
        "handle": handle,
        "title": str(row["title"]),
        "bio": str(row["bio"] or ""),
        "createdAt": float(row["created_at"]),
        "updatedAt": updated,
        "postCount": int(post_count),
        "hasPhoto": has_photo,
        "photoUrl": (f"/api/book/channel-photo/{handle}?t={int(updated)}" if has_photo else None),
        "owner": _book_user_brief(owner),
    }


def _book_post_dict(
    row: sqlite3.Row,
    owner: sqlite3.Row | None = None,
    handle: str | None = None,
    *,
    comment_count: int = 0,
    channel_title: str | None = None,
    channel_bio: str | None = None,
    channel_photo: bool = False,
    channel_updated: float | None = None,
) -> dict[str, Any]:
    pid = int(row["id"])
    h = handle or ""
    upd = float(channel_updated or 0) or float(row["created_at"])
    return {
        "id": pid,
        "userId": int(row["user_id"]),
        "handle": h,
        "kind": str(row["kind"]),
        "title": str(row["title"]),
        "description": str(row["description"] or ""),
        "mime": str(row["mime"] or ""),
        "views": int(row["views"] or 0),
        "commentCount": int(comment_count),
        "createdAt": float(row["created_at"]),
        "mediaUrl": f"/api/book/media/{pid}",
        "channelTitle": channel_title or "",
        "channelBio": channel_bio or "",
        "channelPhotoUrl": (f"/api/book/channel-photo/{h}?t={int(upd)}" if channel_photo and h else None),
        "owner": _book_user_brief(owner),
    }


def book_get_channel_by_user(user_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        init_book_tables(conn)
        row = conn.execute(
            "SELECT * FROM book_channels WHERE user_id = ?", (int(user_id),)
        ).fetchone()
        if not row:
            return None
        owner = conn.execute("SELECT id, email, name, avatar FROM users WHERE id = ?", (int(user_id),)).fetchone()
        count = conn.execute(
            "SELECT COUNT(*) AS c FROM book_posts WHERE user_id = ?", (int(user_id),)
        ).fetchone()["c"]
        return _book_channel_dict(row, owner, int(count))


def book_get_channel_by_handle(handle: str) -> dict[str, Any] | None:
    h = (handle or "").strip().lstrip("@").lower()
    if not h:
        return None
    with get_conn() as conn:
        init_book_tables(conn)
        row = conn.execute(
            "SELECT * FROM book_channels WHERE handle = ? COLLATE NOCASE", (h,)
        ).fetchone()
        if not row:
            return None
        owner = conn.execute(
            "SELECT id, email, name, avatar FROM users WHERE id = ?", (int(row["user_id"]),)
        ).fetchone()
        count = conn.execute(
            "SELECT COUNT(*) AS c FROM book_posts WHERE user_id = ?", (int(row["user_id"]),)
        ).fetchone()["c"]
        return _book_channel_dict(row, owner, int(count))


def book_upsert_channel(
    user_id: int,
    *,
    handle: str,
    title: str,
    bio: str = "",
    photo_data_url: str | None = None,
) -> dict[str, Any]:
    import base64
    import time as _time

    h = (handle or "").strip().lstrip("@").lower()
    t = (title or "").strip()
    b = (bio or "").strip()[:280]
    if not BOOK_HANDLE_RE.match(h):
        raise ValueError("El handle debe tener 3–24 caracteres: a-z, 0-9 o _")
    if len(t) < 2 or len(t) > 60:
        raise ValueError("El nombre del canal debe tener entre 2 y 60 caracteres")
    uid = int(user_id)
    now = _time.time()
    photo_mime = ""
    photo_ext = ""
    photo_bytes = None
    if photo_data_url:
        if not isinstance(photo_data_url, str) or not photo_data_url.startswith("data:"):
            raise ValueError("Foto de canal inválida")
        try:
            header, b64 = photo_data_url.split(",", 1)
        except ValueError as e:
            raise ValueError("Foto de canal inválida") from e
        mime_h = "image/jpeg"
        if ";" in header:
            mime_h = header[5:].split(";")[0] or mime_h
        mime_h = (mime_h or "").strip().lower()
        if not mime_h.startswith("image/"):
            raise ValueError("La foto del canal debe ser una imagen")
        try:
            photo_bytes = base64.b64decode(b64, validate=False)
        except Exception as e:
            raise ValueError("No se pudo leer la foto") from e
        if not photo_bytes:
            raise ValueError("Foto vacía")
        if len(photo_bytes) > 8 * 1024 * 1024:
            raise ValueError("Foto demasiado grande (máx 8 MB)")
        photo_mime = mime_h
        photo_ext = {
            "image/jpeg": "jpg",
            "image/jpg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
        }.get(mime_h, "jpg")

    with get_conn() as conn:
        init_book_tables(conn)
        taken = conn.execute(
            "SELECT user_id FROM book_channels WHERE handle = ? COLLATE NOCASE", (h,)
        ).fetchone()
        if taken and int(taken["user_id"]) != uid:
            raise ValueError("Ese handle ya está en uso")
        existing = conn.execute(
            "SELECT user_id, photo_ext FROM book_channels WHERE user_id = ?", (uid,)
        ).fetchone()
        if existing:
            if photo_bytes is not None:
                conn.execute(
                    "UPDATE book_channels SET handle = ?, title = ?, bio = ?, photo_mime = ?, photo_ext = ?, updated_at = ? WHERE user_id = ?",
                    (h, t, b, photo_mime, photo_ext, now, uid),
                )
            else:
                conn.execute(
                    "UPDATE book_channels SET handle = ?, title = ?, bio = ?, updated_at = ? WHERE user_id = ?",
                    (h, t, b, now, uid),
                )
        else:
            conn.execute(
                "INSERT INTO book_channels (user_id, handle, title, bio, created_at, updated_at, photo_mime, photo_ext) VALUES (?,?,?,?,?,?,?,?)",
                (uid, h, t, b, now, now, photo_mime, photo_ext),
            )
            # welcome after create
            conn.execute(
                """
                INSERT INTO book_inbox (user_id, title, body, kind, created_at, read_at)
                VALUES (?,?,?,?,?,NULL)
                """,
                (
                    uid,
                    "¡Canal creado!",
                    f"Tu canal @{h} ya está listo. Sube fotos o vídeos desde Publicar.",
                    "system",
                    now,
                ),
            )
    if photo_bytes is not None:
        path = _book_channel_photo_path(uid, photo_ext)
        path.write_bytes(photo_bytes)
    ch = book_get_channel_by_user(uid)
    if not ch:
        raise ValueError("No se pudo guardar el canal")
    return ch


def book_channel_photo_file(handle: str) -> tuple[Path, str] | None:
    h = (handle or "").strip().lstrip("@").lower()
    if not h:
        return None
    with get_conn() as conn:
        init_book_tables(conn)
        row = conn.execute(
            "SELECT user_id, photo_mime, photo_ext FROM book_channels WHERE handle = ? COLLATE NOCASE",
            (h,),
        ).fetchone()
        if not row or not str(row["photo_mime"] or ""):
            return None
        path = _book_channel_photo_path(int(row["user_id"]), str(row["photo_ext"] or ""))
        if not path.exists():
            return None
        return path, str(row["photo_mime"] or "image/jpeg")


def book_list_channels(limit: int = 50) -> list[dict[str, Any]]:
    lim = max(1, min(100, int(limit)))
    with get_conn() as conn:
        init_book_tables(conn)
        rows = conn.execute(
            """
            SELECT c.*, u.id AS uid, u.email, u.name, u.avatar,
                   (SELECT COUNT(*) FROM book_posts p WHERE p.user_id = c.user_id) AS post_count
            FROM book_channels c
            JOIN users u ON u.id = c.user_id
            ORDER BY c.created_at DESC
            LIMIT ?
            """,
            (lim,),
        ).fetchall()
        out = []
        for r in rows:
            owner = {
                "id": int(r["uid"]),
                "email": str(r["email"] or ""),
                "name": str(r["name"] or ""),
                "avatar": str(r["avatar"] or "👤"),
            }
            # reuse helper with a fake row-like for channel fields
            out.append(_book_channel_dict(r, None, int(r["post_count"] or 0)))
            out[-1]["owner"] = owner
        return out


def _book_comment_count(conn: sqlite3.Connection, post_id: int) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM book_comments WHERE post_id = ?", (int(post_id),)
    ).fetchone()
    return int(row["c"] or 0) if row else 0


def _enrich_post_from_join(r: sqlite3.Row) -> dict[str, Any]:
    owner = {
        "id": int(r["uid"]),
        "email": str(r["email"] or ""),
        "name": str(r["name"] or ""),
        "avatar": str(r["avatar"] or "👤"),
    }
    try:
        updated = float(r["ch_updated"] or 0)
    except (KeyError, IndexError, TypeError, ValueError):
        updated = 0.0
    try:
        photo_mime = str(r["ch_photo_mime"] or "")
    except (KeyError, IndexError):
        photo_mime = ""
    d = _book_post_dict(
        r,
        None,
        str(r["handle"]),
        comment_count=int(r["comment_count"] or 0) if "comment_count" in r.keys() else 0,
        channel_title=str(r["ch_title"] or "") if "ch_title" in r.keys() else "",
        channel_bio=str(r["ch_bio"] or "") if "ch_bio" in r.keys() else "",
        channel_photo=bool(photo_mime),
        channel_updated=updated,
    )
    d["owner"] = owner
    return d


def book_list_feed(limit: int = 40) -> list[dict[str, Any]]:
    lim = max(1, min(100, int(limit)))
    with get_conn() as conn:
        init_book_tables(conn)
        rows = conn.execute(
            """
            SELECT p.*, c.handle, c.title AS ch_title, c.bio AS ch_bio,
                   c.photo_mime AS ch_photo_mime, c.updated_at AS ch_updated,
                   u.id AS uid, u.email, u.name, u.avatar,
                   (SELECT COUNT(*) FROM book_comments bc WHERE bc.post_id = p.id) AS comment_count
            FROM book_posts p
            JOIN book_channels c ON c.user_id = p.user_id
            JOIN users u ON u.id = p.user_id
            ORDER BY p.created_at DESC
            LIMIT ?
            """,
            (lim,),
        ).fetchall()
        return [_enrich_post_from_join(r) for r in rows]


def book_list_posts_for_handle(handle: str, limit: int = 50) -> list[dict[str, Any]]:
    ch = book_get_channel_by_handle(handle)
    if not ch:
        return []
    lim = max(1, min(100, int(limit)))
    with get_conn() as conn:
        init_book_tables(conn)
        rows = conn.execute(
            """
            SELECT p.*, c.handle, c.title AS ch_title, c.bio AS ch_bio,
                   c.photo_mime AS ch_photo_mime, c.updated_at AS ch_updated,
                   u.id AS uid, u.email, u.name, u.avatar,
                   (SELECT COUNT(*) FROM book_comments bc WHERE bc.post_id = p.id) AS comment_count
            FROM book_posts p
            JOIN book_channels c ON c.user_id = p.user_id
            JOIN users u ON u.id = p.user_id
            WHERE p.user_id = ?
            ORDER BY p.created_at DESC
            LIMIT ?
            """,
            (int(ch["userId"]), lim),
        ).fetchall()
        return [_enrich_post_from_join(r) for r in rows]


def book_get_post(post_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        init_book_tables(conn)
        r = conn.execute(
            """
            SELECT p.*, c.handle, c.title AS ch_title, c.bio AS ch_bio,
                   c.photo_mime AS ch_photo_mime, c.updated_at AS ch_updated,
                   u.id AS uid, u.email, u.name, u.avatar,
                   (SELECT COUNT(*) FROM book_comments bc WHERE bc.post_id = p.id) AS comment_count
            FROM book_posts p
            JOIN book_channels c ON c.user_id = p.user_id
            JOIN users u ON u.id = p.user_id
            WHERE p.id = ?
            """,
            (int(post_id),),
        ).fetchone()
        if not r:
            return None
        return _enrich_post_from_join(r)


def book_create_post(
    user_id: int,
    *,
    kind: str,
    title: str,
    description: str,
    mime: str,
    data_url: str,
    duration_sec: float | None = None,
) -> dict[str, Any]:
    import base64

    if not isinstance(data_url, str) or not data_url.startswith("data:"):
        raise ValueError("Archivo inválido")
    try:
        header, b64 = data_url.split(",", 1)
    except ValueError as e:
        raise ValueError("dataUrl inválido") from e
    mime_h = mime or "application/octet-stream"
    if ";" in header:
        mime_h = header[5:].split(";")[0] or mime_h
    try:
        raw = base64.b64decode(b64, validate=False)
    except Exception as e:
        raise ValueError("No se pudo leer el archivo") from e
    return book_create_post_bytes(
        user_id,
        kind=kind,
        title=title,
        description=description,
        mime=mime_h,
        raw=raw,
        duration_sec=duration_sec,
    )


def book_create_post_bytes(
    user_id: int,
    *,
    kind: str,
    title: str,
    description: str,
    mime: str,
    raw: bytes,
    duration_sec: float | None = None,
) -> dict[str, Any]:
    import time as _time

    uid = int(user_id)
    k = (kind or "").strip().lower()
    if k not in ("image", "video"):
        raise ValueError("El contenido debe ser imagen o vídeo")
    t = (title or "").strip()
    if len(t) < 1 or len(t) > 100:
        raise ValueError("Título entre 1 y 100 caracteres")
    desc = (description or "").strip()[:500]
    mime_h = (mime or "application/octet-stream").strip().lower()
    if k == "image" and not mime_h.startswith("image/"):
        raise ValueError("El archivo no es una imagen")
    if k == "video" and not mime_h.startswith("video/"):
        raise ValueError("El archivo no es un vídeo")
    if not raw:
        raise ValueError("Archivo vacío")
    max_bytes = BOOK_MAX_VIDEO_BYTES if k == "video" else BOOK_MAX_IMAGE_BYTES
    if len(raw) > max_bytes:
        mb = max_bytes // (1024 * 1024)
        raise ValueError(f"Archivo demasiado grande (máx {mb} MB)")
    if k == "video" and duration_sec is not None:
        try:
            dur = float(duration_sec)
        except (TypeError, ValueError) as e:
            raise ValueError("Duración de vídeo inválida") from e
        if dur > BOOK_MAX_VIDEO_DURATION_SEC + 1:
            raise ValueError("El vídeo no puede durar más de 30 minutos")
        if dur <= 0:
            raise ValueError("Duración de vídeo inválida")
    ext = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "video/mp4": "mp4",
        "video/webm": "webm",
        "video/quicktime": "mov",
        "video/x-matroska": "mkv",
        "video/x-msvideo": "avi",
    }.get(mime_h, "bin")
    ch = book_get_channel_by_user(uid)
    if not ch:
        raise ValueError("Crea tu canal antes de publicar")
    now = _time.time()
    with get_conn() as conn:
        init_book_tables(conn)
        cur = conn.execute(
            """
            INSERT INTO book_posts (user_id, kind, title, description, mime, ext, views, created_at)
            VALUES (?,?,?,?,?,?,0,?)
            """,
            (uid, k, t, desc, mime_h, ext, now),
        )
        pid = int(cur.lastrowid)
    path = _book_media_path(pid, ext)
    path.write_bytes(raw)
    post = book_get_post(pid)
    if not post:
        raise ValueError("No se pudo crear la publicación")
    return post


def book_delete_post(user_id: int, post_id: int) -> bool:
    uid = int(user_id)
    pid = int(post_id)
    with get_conn() as conn:
        init_book_tables(conn)
        row = conn.execute(
            "SELECT id, user_id, ext FROM book_posts WHERE id = ?", (pid,)
        ).fetchone()
        if not row:
            return False
        if int(row["user_id"]) != uid:
            raise PermissionError("Solo el dueño puede borrar")
        ext = str(row["ext"] or "")
        conn.execute("DELETE FROM book_comments WHERE post_id = ?", (pid,))
        conn.execute("DELETE FROM book_views WHERE post_id = ?", (pid,))
        conn.execute("DELETE FROM book_posts WHERE id = ?", (pid,))
    try:
        p = _book_media_path(pid, ext)
        if p.exists():
            p.unlink()
    except OSError:
        pass
    return True


def book_like_info(post_ids: list[Any], user_id: int) -> dict[int, dict[str, Any]]:
    """Me gusta de varias publicaciones: {post_id: {likeCount, liked}} (liked = del usuario dado)."""
    ids: list[int] = []
    for x in post_ids or []:
        try:
            ids.append(int(x))
        except (TypeError, ValueError):
            continue
    out: dict[int, dict[str, Any]] = {pid: {"likeCount": 0, "liked": False} for pid in ids}
    if not ids:
        return out
    with get_conn() as conn:
        init_book_tables(conn)
        qs = ",".join("?" * len(ids))
        rows = conn.execute(
            f"SELECT post_id, COUNT(*) AS c, MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine "
            f"FROM book_likes WHERE post_id IN ({qs}) GROUP BY post_id",
            (int(user_id), *ids),
        ).fetchall()
        for r in rows:
            out[int(r["post_id"])] = {"likeCount": int(r["c"] or 0), "liked": bool(r["mine"])}
    return out


def book_set_like(post_id: int, user_id: int, on: bool) -> dict[str, Any]:
    """Da o quita «Me gusta» (uno por usuario y publicación)."""
    import time as _time
    pid = int(post_id)
    uid = int(user_id)
    with get_conn() as conn:
        init_book_tables(conn)
        if not conn.execute("SELECT 1 FROM book_posts WHERE id = ?", (pid,)).fetchone():
            raise ValueError("Publicación no encontrada")
        if on:
            conn.execute(
                "INSERT OR IGNORE INTO book_likes (post_id, user_id, created_at) VALUES (?, ?, ?)",
                (pid, uid, _time.time()),
            )
        else:
            conn.execute("DELETE FROM book_likes WHERE post_id = ? AND user_id = ?", (pid, uid))
        c = conn.execute("SELECT COUNT(*) AS c FROM book_likes WHERE post_id = ?", (pid,)).fetchone()
        mine = conn.execute(
            "SELECT 1 FROM book_likes WHERE post_id = ? AND user_id = ?", (pid, uid)
        ).fetchone()
    return {"ok": True, "postId": pid, "likeCount": int(c["c"] or 0) if c else 0, "liked": bool(mine)}


def book_import_live_comments(post_id: int, items: list[dict[str, Any]]) -> int:
    """Guarda el chat de un Direct™ como comentarios del vídeo (con su autor y su hora)."""
    import time as _time
    pid = int(post_id)
    n = 0
    with get_conn() as conn:
        init_book_tables(conn)
        if not conn.execute("SELECT 1 FROM book_posts WHERE id = ?", (pid,)).fetchone():
            raise ValueError("Publicación no encontrada")
        for it in items or []:
            if not isinstance(it, dict) or it.get("system"):
                continue
            try:
                uid = int(it.get("userId") or 0)
                text = str(it.get("text") or "").strip()[:500]
                ts = float(it.get("ts") or 0) or _time.time()
            except (TypeError, ValueError):
                continue
            if uid <= 0 or not text:
                continue
            if not conn.execute("SELECT 1 FROM users WHERE id = ?", (uid,)).fetchone():
                continue
            conn.execute(
                "INSERT INTO book_comments (post_id, user_id, body, created_at) VALUES (?,?,?,?)",
                (pid, uid, text, ts),
            )
            n += 1
    return n


def book_media_file(post_id: int) -> tuple[Path, str] | None:
    with get_conn() as conn:
        init_book_tables(conn)
        row = conn.execute(
            "SELECT id, mime, ext FROM book_posts WHERE id = ?", (int(post_id),)
        ).fetchone()
        if not row:
            return None
        path = _book_media_path(int(row["id"]), str(row["ext"] or ""))
        if not path.exists():
            return None
        return path, str(row["mime"] or "application/octet-stream")


def book_record_view(post_id: int, viewer_user_id: int) -> dict[str, Any]:
    """Cuenta una visita real. Mismo usuario + post: como máximo 1 cada 6 horas."""
    import time as _time

    pid = int(post_id)
    vid = int(viewer_user_id)
    now = _time.time()
    with get_conn() as conn:
        init_book_tables(conn)
        post = conn.execute(
            "SELECT id, views FROM book_posts WHERE id = ?", (pid,)
        ).fetchone()
        if not post:
            raise ValueError("Publicación no encontrada")
        prev = conn.execute(
            "SELECT last_at FROM book_views WHERE post_id = ? AND user_id = ?",
            (pid, vid),
        ).fetchone()
        counted = False
        if not prev or (now - float(prev["last_at"])) >= BOOK_VIEW_COOLDOWN:
            conn.execute(
                """
                INSERT INTO book_views (post_id, user_id, last_at) VALUES (?,?,?)
                ON CONFLICT(post_id, user_id) DO UPDATE SET last_at = excluded.last_at
                """,
                (pid, vid, now),
            )
            conn.execute(
                "UPDATE book_posts SET views = views + 1 WHERE id = ?", (pid,)
            )
            counted = True
        row = conn.execute(
            "SELECT views FROM book_posts WHERE id = ?", (pid,)
        ).fetchone()
        return {"id": pid, "views": int(row["views"] or 0), "counted": counted}



def book_ensure_inbox(user_id: int) -> None:
    """Semilla mensajes de bienvenida / recordatorio de canal."""
    import time as _time

    uid = int(user_id)
    now = _time.time()
    with get_conn() as conn:
        init_book_tables(conn)
        n = conn.execute(
            "SELECT COUNT(*) AS c FROM book_inbox WHERE user_id = ?", (uid,)
        ).fetchone()["c"]
        if int(n) == 0:
            conn.execute(
                """
                INSERT INTO book_inbox (user_id, title, body, kind, created_at, read_at)
                VALUES (?,?,?,?,?,NULL)
                """,
                (
                    uid,
                    "Bienvenido a DoganieroBook",
                    "Aquí verás avisos de tu cuenta. Crea tu canal en «Mi canal» para publicar fotos y vídeos.",
                    "system",
                    now,
                ),
            )
        ch = conn.execute(
            "SELECT handle FROM book_channels WHERE user_id = ?", (uid,)
        ).fetchone()
        if not ch:
            # keep one unread reminder if none unread about channel
            exists = conn.execute(
                """
                SELECT id FROM book_inbox
                WHERE user_id = ? AND kind = 'need_channel' AND read_at IS NULL
                LIMIT 1
                """,
                (uid,),
            ).fetchone()
            if not exists:
                conn.execute(
                    """
                    INSERT INTO book_inbox (user_id, title, body, kind, created_at, read_at)
                    VALUES (?,?,?,?,?,NULL)
                    """,
                    (
                        uid,
                        "Crea tu canal",
                        "Sin canal no puedes publicar fotos ni vídeos. Ve a «Mi canal» y créalo ahora (puedes subir una foto de canal).",
                        "need_channel",
                        now,
                    ),
                )


def book_inbox_list(user_id: int, limit: int = 40) -> list[dict[str, Any]]:
    book_ensure_inbox(user_id)
    lim = max(1, min(100, int(limit)))
    with get_conn() as conn:
        init_book_tables(conn)
        rows = conn.execute(
            """
            SELECT id, title, body, kind, created_at, read_at
            FROM book_inbox
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (int(user_id), lim),
        ).fetchall()
        return [
            {
                "id": int(r["id"]),
                "title": str(r["title"]),
                "body": str(r["body"] or ""),
                "kind": str(r["kind"] or "system"),
                "createdAt": float(r["created_at"]),
                "read": r["read_at"] is not None,
            }
            for r in rows
        ]


def book_inbox_mark_read(user_id: int, message_ids: list[int] | None = None) -> dict[str, Any]:
    import time as _time

    uid = int(user_id)
    now = _time.time()
    with get_conn() as conn:
        init_book_tables(conn)
        if message_ids:
            for mid in message_ids:
                conn.execute(
                    """
                    UPDATE book_inbox SET read_at = ?
                    WHERE user_id = ? AND id = ? AND read_at IS NULL
                    """,
                    (now, uid, int(mid)),
                )
        else:
            conn.execute(
                """
                UPDATE book_inbox SET read_at = ?
                WHERE user_id = ? AND read_at IS NULL
                """,
                (now, uid),
            )
        unread = conn.execute(
            "SELECT COUNT(*) AS c FROM book_inbox WHERE user_id = ? AND read_at IS NULL",
            (uid,),
        ).fetchone()["c"]
    return {"ok": True, "unread": int(unread)}



def book_list_comments(post_id: int, limit: int = 100) -> list[dict[str, Any]]:
    lim = max(1, min(200, int(limit)))
    with get_conn() as conn:
        init_book_tables(conn)
        rows = conn.execute(
            """
            SELECT c.id, c.post_id, c.user_id, c.body, c.created_at,
                   u.email, u.name, u.avatar,
                   ch.handle AS handle
            FROM book_comments c
            JOIN users u ON u.id = c.user_id
            LEFT JOIN book_channels ch ON ch.user_id = c.user_id
            WHERE c.post_id = ?
            ORDER BY c.created_at ASC
            LIMIT ?
            """,
            (int(post_id), lim),
        ).fetchall()
        return [
            {
                "id": int(r["id"]),
                "postId": int(r["post_id"]),
                "userId": int(r["user_id"]),
                "body": str(r["body"]),
                "createdAt": float(r["created_at"]),
                "handle": str(r["handle"] or ""),
                "author": {
                    "id": int(r["user_id"]),
                    "email": str(r["email"] or ""),
                    "name": str(r["name"] or ""),
                    "avatar": str(r["avatar"] or "👤"),
                },
            }
            for r in rows
        ]


def book_add_comment(post_id: int, user_id: int, body: str) -> dict[str, Any]:
    import time as _time

    text = (body or "").strip()
    if len(text) < 1:
        raise ValueError("Escribe un comentario")
    if len(text) > 500:
        raise ValueError("Máximo 500 caracteres")
    pid = int(post_id)
    uid = int(user_id)
    now = _time.time()
    with get_conn() as conn:
        init_book_tables(conn)
        post = conn.execute(
            "SELECT id, user_id, title FROM book_posts WHERE id = ?", (pid,)
        ).fetchone()
        if not post:
            raise ValueError("Publicación no encontrada")
        cur = conn.execute(
            "INSERT INTO book_comments (post_id, user_id, body, created_at) VALUES (?,?,?,?)",
            (pid, uid, text, now),
        )
        cid = int(cur.lastrowid)
        # aviso al dueño del post (si no es el mismo)
        owner_id = int(post["user_id"])
        if owner_id != uid:
            author = conn.execute(
                "SELECT name FROM users WHERE id = ?", (uid,)
            ).fetchone()
            aname = str(author["name"] if author else "Alguien")
            ch = conn.execute(
                "SELECT handle FROM book_channels WHERE user_id = ?", (uid,)
            ).fetchone()
            who = ("@" + str(ch["handle"])) if ch else aname
            conn.execute(
                """
                INSERT INTO book_inbox (user_id, title, body, kind, created_at, read_at)
                VALUES (?,?,?,?,?,NULL)
                """,
                (
                    owner_id,
                    "Nuevo comentario",
                    f"{who} comentó en «{post['title']}»: {text[:120]}",
                    "comment",
                    now,
                ),
            )
    comments = book_list_comments(pid, 200)
    for c in comments:
        if c["id"] == cid:
            c["commentCount"] = len(comments)
            return c
    return {"id": cid, "postId": pid, "body": text, "createdAt": now, "commentCount": len(comments)}


def book_delete_comment(comment_id: int, user_id: int) -> bool:
    with get_conn() as conn:
        init_book_tables(conn)
        row = conn.execute(
            """
            SELECT c.id, c.user_id AS author_id, p.user_id AS owner_id
            FROM book_comments c
            JOIN book_posts p ON p.id = c.post_id
            WHERE c.id = ?
            """,
            (int(comment_id),),
        ).fetchone()
        if not row:
            return False
        uid = int(user_id)
        if uid != int(row["author_id"]) and uid != int(row["owner_id"]):
            raise PermissionError("No puedes borrar este comentario")
        conn.execute("DELETE FROM book_comments WHERE id = ?", (int(comment_id),))
        return True
