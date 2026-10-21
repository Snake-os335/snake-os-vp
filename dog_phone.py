"""Doganiero Phone: números ficticios DOG-XXXXXX por perfil y registro de llamadas.

- Formato único: «DOG-» + 6 cifras (p. ej. DOG-482913). No son números de teléfono reales.
- Cada número se guarda en dog_phone_numbers y nunca se borra: si se elimina una cuenta,
  su número queda retirado y no se vuelve a asignar.
- dog_phone_calls guarda el historial (Recientes) de las llamadas de voz/vídeo 1:1.
"""
from __future__ import annotations

import re
import secrets
import sqlite3
import time
from typing import Any

import db

PREFIX = "DOG-"
_DIGITS = 6
_NUM_RE = re.compile(r"^\s*(?:\+?\s*DOG)?[\s.\-]*((?:\d[\s.\-]*){6})\s*$", re.IGNORECASE)


def _ensure_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS dog_phone_numbers (
            number TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE,
            created_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS dog_phone_calls (
            call_id TEXT PRIMARY KEY,
            caller_id INTEGER NOT NULL,
            callee_id INTEGER NOT NULL,
            media TEXT NOT NULL DEFAULT 'audio',
            status TEXT NOT NULL DEFAULT 'ringing',
            started_at REAL NOT NULL,
            answered_at REAL,
            ended_at REAL
        );
        CREATE INDEX IF NOT EXISTS idx_dog_phone_calls_caller ON dog_phone_calls(caller_id, started_at);
        CREATE INDEX IF NOT EXISTS idx_dog_phone_calls_callee ON dog_phone_calls(callee_id, started_at);
        """
    )


def normalize(raw: Any) -> str | None:
    """Devuelve «DOG-123456» o None si no es un número Doganiero válido."""
    m = _NUM_RE.match(str(raw or ""))
    if not m:
        return None
    digits = re.sub(r"\D", "", m.group(1))
    if len(digits) != _DIGITS:
        return None
    return PREFIX + digits


def _assign(conn: sqlite3.Connection, user_id: int) -> str:
    row = conn.execute("SELECT number FROM dog_phone_numbers WHERE user_id = ?", (int(user_id),)).fetchone()
    if row:
        return str(row["number"])
    for _ in range(200):
        num = PREFIX + str(secrets.randbelow(900_000) + 100_000)
        try:
            conn.execute(
                "INSERT INTO dog_phone_numbers (number, user_id, created_at) VALUES (?, ?, ?)",
                (num, int(user_id), time.time()),
            )
            return num
        except sqlite3.IntegrityError:
            # Número ya usado (o retirado) o el usuario ya tiene uno: reintentar / releer
            row = conn.execute("SELECT number FROM dog_phone_numbers WHERE user_id = ?", (int(user_id),)).fetchone()
            if row:
                return str(row["number"])
    raise RuntimeError("No se pudo asignar un número Doganiero")


def init_and_assign_all() -> int:
    """Crea las tablas y asigna número a todos los perfiles que no tengan. Devuelve cuántos asignó."""
    n = 0
    with db.get_conn() as conn:
        _ensure_tables(conn)
        rows = conn.execute(
            "SELECT u.id FROM users u LEFT JOIN dog_phone_numbers p ON p.user_id = u.id "
            "WHERE p.number IS NULL ORDER BY u.id"
        ).fetchall()
        for r in rows:
            _assign(conn, int(r["id"]))
            n += 1
    return n


def ensure_number(user_id: int) -> str:
    with db.get_conn() as conn:
        _ensure_tables(conn)
        return _assign(conn, int(user_id))


def number_for(user_id: int) -> str:
    try:
        return ensure_number(int(user_id))
    except Exception:
        return ""


def _contact(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "name": row["name"] or "Usuario",
        "avatar": row["avatar"] or "🐶",
        "number": str(row["number"]),
        "pro": db.pro_flag(row["id"]),
    }


def lookup(number: str) -> dict[str, Any] | None:
    """Número normalizado → perfil (sin correo). None si no existe o la cuenta ya no existe."""
    with db.get_conn() as conn:
        _ensure_tables(conn)
        row = conn.execute(
            "SELECT u.id, u.name, u.avatar, p.number FROM dog_phone_numbers p "
            "JOIN users u ON u.id = p.user_id WHERE p.number = ?",
            (number,),
        ).fetchone()
    return _contact(row) if row else None


def contacts(exclude_user_id: int) -> list[dict[str, Any]]:
    init_and_assign_all()
    with db.get_conn() as conn:
        rows = conn.execute(
            "SELECT u.id, u.name, u.avatar, p.number FROM users u "
            "JOIN dog_phone_numbers p ON p.user_id = u.id "
            "WHERE u.id <> ? ORDER BY u.name COLLATE NOCASE ASC, u.id ASC",
            (int(exclude_user_id),),
        ).fetchall()
    return [_contact(r) for r in rows]


# ---------- Registro de llamadas (Recientes) ----------

def log_call_start(call_id: str, caller_id: int, callee_id: int, media: str) -> None:
    with db.get_conn() as conn:
        _ensure_tables(conn)
        conn.execute(
            "INSERT OR IGNORE INTO dog_phone_calls (call_id, caller_id, callee_id, media, status, started_at) "
            "VALUES (?, ?, ?, ?, 'ringing', ?)",
            (str(call_id), int(caller_id), int(callee_id), "video" if media == "video" else "audio", time.time()),
        )


def log_call_status(call_id: str, status: str) -> None:
    now = time.time()
    with db.get_conn() as conn:
        _ensure_tables(conn)
        if status == "answered":
            conn.execute(
                "UPDATE dog_phone_calls SET status = 'answered', answered_at = ? WHERE call_id = ?",
                (now, str(call_id)),
            )
        elif status in ("missed", "declined"):
            conn.execute(
                "UPDATE dog_phone_calls SET status = ?, ended_at = ? WHERE call_id = ? AND status = 'ringing'",
                (status, now, str(call_id)),
            )
        elif status == "ended":
            conn.execute(
                "UPDATE dog_phone_calls SET ended_at = ? WHERE call_id = ? AND ended_at IS NULL",
                (now, str(call_id)),
            )


def recents(user_id: int, limit: int = 40) -> list[dict[str, Any]]:
    uid = int(user_id)
    with db.get_conn() as conn:
        _ensure_tables(conn)
        rows = conn.execute(
            "SELECT c.*, u.id AS peer_id, u.name AS peer_name, u.avatar AS peer_avatar, p.number AS peer_number "
            "FROM dog_phone_calls c "
            "LEFT JOIN users u ON u.id = CASE WHEN c.caller_id = ? THEN c.callee_id ELSE c.caller_id END "
            "LEFT JOIN dog_phone_numbers p ON p.user_id = u.id "
            "WHERE c.caller_id = ? OR c.callee_id = ? "
            "ORDER BY c.started_at DESC LIMIT ?",
            (uid, uid, uid, max(1, min(int(limit), 100))),
        ).fetchall()
    now = time.time()
    out = []
    for r in rows:
        status = str(r["status"])
        # Llamada que se quedó «sonando» (p. ej. por un reinicio del servidor): sin respuesta
        if status == "ringing" and now - float(r["started_at"]) > 120:
            status = "missed"
        dur = 0
        if r["answered_at"] and r["ended_at"]:
            dur = max(0, int(float(r["ended_at"]) - float(r["answered_at"])))
        out.append({
            "callId": str(r["call_id"]),
            "direction": "out" if int(r["caller_id"]) == uid else "in",
            "status": status,
            "media": str(r["media"] or "audio"),
            "ts": float(r["started_at"]),
            "durationSec": dur,
            "peer": {
                "id": int(r["peer_id"]) if r["peer_id"] is not None else None,
                "name": r["peer_name"] or "Cuenta eliminada",
                "avatar": r["peer_avatar"] or "👤",
                "number": str(r["peer_number"] or ""),
                "pro": db.pro_flag(r["peer_id"]),
            },
        })
    return out
