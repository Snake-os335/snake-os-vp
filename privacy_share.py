"""Privacidad de directorio y compartidos explícitos.

/api/online/names y /api/activity solo devuelven contactos mutuos que no
ocultaron su directorio y que el lector no tiene escondidos en Chat.
Las notas y los eventos del calendario siguen siendo privados: un contacto
los lee solo con una fila en privacy_shares, y deja de verlos al revocar,
al borrar el ítem o al romper el contacto.

No hay last-seen en el esquema. No se calcula si un recordatorio está
vencido: calendar_events guarda día (YYYY-MM-DD) y hora local sin zona ni
repetición.
"""
from __future__ import annotations

import re
import sqlite3
import time
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import added_accounts
import calendar_extras
import chat_extras
import db

_ITEM_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
_DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_KINDS = ("note", "event")
_MAX_SHARES = 200


def ensure(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS privacy_flags (
            user_id INTEGER PRIMARY KEY,
            hide_directory INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS privacy_shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL,
            recipient_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            item_id TEXT NOT NULL,
            day TEXT NOT NULL DEFAULT '',
            created_at REAL NOT NULL,
            revoked_at REAL,
            UNIQUE (owner_id, recipient_id, kind, item_id, day)
        );
        CREATE INDEX IF NOT EXISTS idx_privacy_shares_recipient
            ON privacy_shares(recipient_id, revoked_at);
        CREATE INDEX IF NOT EXISTS idx_privacy_shares_owner
            ON privacy_shares(owner_id, revoked_at);
        """
    )
    try:
        chat_extras.init()
    except Exception:
        pass


def _conn():
    conn = db.get_conn()
    ensure(conn)
    return conn


def hide_directory(user_id: int) -> bool:
    with _conn() as conn:
        row = conn.execute(
            "SELECT hide_directory FROM privacy_flags WHERE user_id = ?",
            (int(user_id),),
        ).fetchone()
    return bool(row and int(row["hide_directory"] or 0))


def set_hide_directory(user_id: int, hide: bool) -> bool:
    flag = 1 if hide else 0
    with _conn() as conn:
        conn.execute(
            "INSERT INTO privacy_flags (user_id, hide_directory) VALUES (?, ?) "
            "ON CONFLICT(user_id) DO UPDATE SET hide_directory = excluded.hide_directory",
            (int(user_id), flag),
        )
    return bool(flag)


def _table(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (name,),
    ).fetchone()
    return row is not None


def directory_user_ids(viewer_id: int) -> set[int]:
    """Contactos mutuos que no ocultaron el directorio y que este lector no escondió en Chat."""
    viewer_id = int(viewer_id)
    try:
        added_accounts.list_for(viewer_id)
    except Exception:
        return set()
    with _conn() as conn:
        hidden_sql = ""
        params: list[Any] = [viewer_id, viewer_id]
        if _table(conn, "chat_hidden"):
            hidden_sql = (
                " AND NOT EXISTS ("
                "SELECT 1 FROM chat_hidden h "
                "WHERE h.owner_id = ? AND lower(h.email) = lower(u.email))"
            )
            params.append(viewer_id)
        rows = conn.execute(
            "SELECT u.id AS id FROM added_accounts a "
            "JOIN added_accounts b ON b.owner_id = a.contact_id AND b.contact_id = a.owner_id "
            "JOIN users u ON u.id = a.contact_id "
            "LEFT JOIN privacy_flags f ON f.user_id = u.id "
            "WHERE a.owner_id = ? AND u.id <> ? "
            "AND COALESCE(f.hide_directory, 0) = 0"
            + hidden_sql,
            tuple(params),
        ).fetchall()
    return {int(row["id"]) for row in rows}


def mutual(a: int, b: int) -> bool:
    a, b = int(a), int(b)
    if a == b or a <= 0 or b <= 0:
        return False
    return added_accounts.has(a, b) and added_accounts.has(b, a)


def _viewer_hid_email(viewer_id: int, email: str) -> bool:
    if not email:
        return False
    try:
        hidden = {str(x or "").strip().lower() for x in chat_extras.list_hidden(int(viewer_id))}
    except Exception:
        return False
    return str(email).strip().lower() in hidden


def _can_read_pair(viewer_id: int, owner_id: int) -> bool:
    if not mutual(viewer_id, owner_id):
        return False
    owner = db.get_user_by_id(int(owner_id))
    if not owner:
        return False
    if _viewer_hid_email(viewer_id, str(owner["email"] or "")):
        return False
    return True


def _clean_kind(kind: Any) -> str:
    text = str(kind or "").strip().lower()
    if text not in _KINDS:
        raise ValueError("Tipo no válido")
    return text


def _clean_item(item_id: Any) -> str:
    text = str(item_id or "").strip()
    if not _ITEM_RE.match(text):
        raise ValueError("Identificador no válido")
    return text


def _clean_day(kind: str, day: Any) -> str:
    text = str(day or "").strip()
    if kind == "note":
        return ""
    if not _DAY_RE.match(text):
        raise ValueError("Fecha no válida")
    return text


def _note_hit(owner_id: int, item_id: str) -> dict[str, Any] | None:
    raw = db.get_json_field(int(owner_id), "notes", [])
    if not isinstance(raw, list):
        return None
    for item in raw:
        if not isinstance(item, dict):
            continue
        if str(item.get("id") or "") != item_id:
            continue
        text = str(item.get("text") or "")
        if not text.strip():
            return None
        return {"text": text[:5000]}
    return None


def _event_hit(owner_id: int, day: str, item_id: str) -> dict[str, Any] | None:
    data = calendar_extras.get_events(int(owner_id)).get("events") or {}
    if not isinstance(data, dict):
        return None
    items = data.get(day)
    if not isinstance(items, list):
        return None
    for item in items:
        if not isinstance(item, dict):
            continue
        if str(item.get("id") or "") != item_id:
            continue
        title = str(item.get("t") or "").strip()
        if not title:
            return None
        clock = str(item.get("h") or "")
        if clock and not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", clock):
            clock = ""
        return {"title": title[:80], "time": clock}
    return None


def _owns(owner_id: int, kind: str, item_id: str, day: str) -> dict[str, Any] | None:
    if kind == "note":
        return _note_hit(owner_id, item_id)
    return _event_hit(owner_id, day, item_id)


def _brief(user_id: int) -> dict[str, str]:
    row = db.get_user_by_id(int(user_id))
    if not row:
        return {"name": "Contacto", "avatar": "🐶"}
    name = db.display_name(row)[:80]
    avatar = str(row["avatar"] or "🐶")[:300]
    return {"name": name, "avatar": avatar}


def share_with(owner_id: int, recipient_id: int, kind: str, item_id: str, day: str = "") -> dict[str, Any]:
    owner_id = int(owner_id)
    recipient_id = int(recipient_id)
    kind = _clean_kind(kind)
    item_id = _clean_item(item_id)
    day = _clean_day(kind, day)
    if recipient_id == owner_id or not mutual(owner_id, recipient_id):
        raise PermissionError("No se puede compartir con esa cuenta")
    if not _owns(owner_id, kind, item_id, day):
        raise LookupError("No se encontró esa nota o evento")
    now = time.time()
    with _conn() as conn:
        n = conn.execute(
            "SELECT COUNT(*) AS n FROM privacy_shares WHERE owner_id = ? AND revoked_at IS NULL",
            (owner_id,),
        ).fetchone()
        existing = conn.execute(
            "SELECT id, revoked_at FROM privacy_shares "
            "WHERE owner_id = ? AND recipient_id = ? AND kind = ? AND item_id = ? AND day = ?",
            (owner_id, recipient_id, kind, item_id, day),
        ).fetchone()
        if existing and existing["revoked_at"] is None:
            return {"ok": True, "shared": True}
        if not existing and n and int(n["n"] or 0) >= _MAX_SHARES:
            raise ValueError("Demasiados elementos compartidos")
        if existing:
            conn.execute(
                "UPDATE privacy_shares SET revoked_at = NULL, created_at = ? WHERE id = ?",
                (now, int(existing["id"])),
            )
        else:
            conn.execute(
                "INSERT INTO privacy_shares (owner_id, recipient_id, kind, item_id, day, created_at, revoked_at) "
                "VALUES (?, ?, ?, ?, ?, ?, NULL)",
                (owner_id, recipient_id, kind, item_id, day, now),
            )
    return {"ok": True, "shared": True}


def revoke(owner_id: int, recipient_id: int, kind: str, item_id: str, day: str = "") -> dict[str, Any]:
    owner_id = int(owner_id)
    recipient_id = int(recipient_id)
    kind = _clean_kind(kind)
    item_id = _clean_item(item_id)
    day = _clean_day(kind, day)
    now = time.time()
    with _conn() as conn:
        cur = conn.execute(
            "UPDATE privacy_shares SET revoked_at = ? "
            "WHERE owner_id = ? AND recipient_id = ? AND kind = ? AND item_id = ? AND day = ? "
            "AND revoked_at IS NULL",
            (now, owner_id, recipient_id, kind, item_id, day),
        )
        if cur.rowcount < 1:
            raise LookupError("No había ese permiso")
    return {"ok": True, "revoked": True}


def _active_rows_for_reader(viewer_id: int) -> list[sqlite3.Row]:
    with _conn() as conn:
        return list(
            conn.execute(
                "SELECT owner_id, recipient_id, kind, item_id, day, created_at "
                "FROM privacy_shares WHERE recipient_id = ? AND revoked_at IS NULL "
                "ORDER BY created_at DESC, id DESC",
                (int(viewer_id),),
            ).fetchall()
        )


def inbox(viewer_id: int) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, int]] = set()
    for row in _active_rows_for_reader(viewer_id):
        owner_id = int(row["owner_id"])
        kind = str(row["kind"] or "")
        item_id = str(row["item_id"] or "")
        day = str(row["day"] or "")
        key = (kind, item_id, day, owner_id)
        if key in seen:
            continue
        if not _can_read_pair(int(viewer_id), owner_id):
            continue
        hit = _owns(owner_id, kind, item_id, day)
        if not hit:
            continue
        seen.add(key)
        card: dict[str, Any] = {
            "kind": kind,
            "itemId": item_id,
            "day": day,
            "from": _brief(owner_id),
            "sharedAt": float(row["created_at"] or 0),
        }
        if kind == "note":
            card["text"] = hit["text"]
        else:
            card["title"] = hit["title"]
            card["time"] = hit["time"]
        items.append(card)
        if len(items) >= 100:
            break
    return {"items": items}


def outgoing(owner_id: int) -> dict[str, Any]:
    owner_id = int(owner_id)
    items: list[dict[str, Any]] = []
    with _conn() as conn:
        rows = conn.execute(
            "SELECT recipient_id, kind, item_id, day, created_at FROM privacy_shares "
            "WHERE owner_id = ? AND revoked_at IS NULL ORDER BY created_at DESC, id DESC",
            (owner_id,),
        ).fetchall()
    seen: set[tuple[str, str, str, int]] = set()
    for row in rows:
        rid = int(row["recipient_id"])
        kind = str(row["kind"] or "")
        item_id = str(row["item_id"] or "")
        day = str(row["day"] or "")
        key = (kind, item_id, day, rid)
        if key in seen:
            continue
        if not mutual(owner_id, rid):
            continue
        if not _owns(owner_id, kind, item_id, day):
            continue
        seen.add(key)
        items.append(
            {
                "kind": kind,
                "itemId": item_id,
                "day": day,
                "recipientId": rid,
                "recipientName": _brief(rid)["name"],
                "sharedAt": float(row["created_at"] or 0),
            }
        )
        if len(items) >= 100:
            break
    return {"items": items}


def retain_notes(owner_id: int, notes: Any) -> None:
    live: set[str] = set()
    if isinstance(notes, list):
        for item in notes:
            if isinstance(item, dict) and item.get("id") is not None:
                live.add(str(item.get("id"))[:80])
    with _conn() as conn:
        rows = conn.execute(
            "SELECT id, item_id FROM privacy_shares WHERE owner_id = ? AND kind = 'note'",
            (int(owner_id),),
        ).fetchall()
        gone = [int(r["id"]) for r in rows if str(r["item_id"] or "") not in live]
        if gone:
            conn.executemany("DELETE FROM privacy_shares WHERE id = ?", [(i,) for i in gone])


def retain_events(owner_id: int, events: Any) -> None:
    live: set[tuple[str, str]] = set()
    if isinstance(events, dict):
        for day, items in events.items():
            if not isinstance(day, str) or not isinstance(items, list):
                continue
            for item in items:
                if isinstance(item, dict) and item.get("id") is not None:
                    live.add((day, str(item.get("id"))))
    with _conn() as conn:
        rows = conn.execute(
            "SELECT id, day, item_id FROM privacy_shares WHERE owner_id = ? AND kind = 'event'",
            (int(owner_id),),
        ).fetchall()
        gone = [
            int(r["id"])
            for r in rows
            if (str(r["day"] or ""), str(r["item_id"] or "")) not in live
        ]
        if gone:
            conn.executemany("DELETE FROM privacy_shares WHERE id = ?", [(i,) for i in gone])


def drop_pair(a: int, b: int) -> None:
    a, b = int(a), int(b)
    with _conn() as conn:
        conn.execute(
            "DELETE FROM privacy_shares WHERE "
            "(owner_id = ? AND recipient_id = ?) OR (owner_id = ? AND recipient_id = ?)",
            (a, b, b, a),
        )


class PrivacyFlagBody(BaseModel):
    hideDirectory: bool


class ShareBody(BaseModel):
    kind: str = Field(min_length=1, max_length=16)
    itemId: str = Field(min_length=1, max_length=80)
    day: str = ""
    recipientId: int = Field(ge=1)


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=404, detail="No se puede compartir con esa cuenta")
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc) or "No encontrado")
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc) or "Datos no válidos")
    return HTTPException(status_code=400, detail="Datos no válidos")


def build_router(require_user: Callable[..., Any]) -> APIRouter:
    router = APIRouter()

    @router.get("/api/me/privacy")
    def get_privacy(user=Depends(require_user)):
        return {"hideDirectory": hide_directory(int(user["id"]))}

    @router.put("/api/me/privacy")
    def put_privacy(body: PrivacyFlagBody, user=Depends(require_user)):
        return {"hideDirectory": set_hide_directory(int(user["id"]), bool(body.hideDirectory))}

    @router.get("/api/shares")
    def get_shares(user=Depends(require_user)):
        return inbox(int(user["id"]))

    @router.get("/api/shares/outgoing")
    def get_outgoing(user=Depends(require_user)):
        return outgoing(int(user["id"]))

    @router.post("/api/shares")
    def post_share(body: ShareBody, user=Depends(require_user)):
        try:
            return share_with(int(user["id"]), int(body.recipientId), body.kind, body.itemId, body.day)
        except (PermissionError, LookupError, ValueError) as exc:
            raise _http(exc) from exc

    @router.post("/api/shares/revoke")
    def post_revoke(body: ShareBody, user=Depends(require_user)):
        try:
            return revoke(int(user["id"]), int(body.recipientId), body.kind, body.itemId, body.day)
        except (PermissionError, LookupError, ValueError) as exc:
            raise _http(exc) from exc

    return router


def purge_user(user_id: int) -> None:
    uid = int(user_id)
    with _conn() as conn:
        conn.execute(
            "DELETE FROM privacy_shares WHERE owner_id = ? OR recipient_id = ?",
            (uid, uid),
        )
        conn.execute("DELETE FROM privacy_flags WHERE user_id = ?", (uid,))
