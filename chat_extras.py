"""Doganiero Chat extras (2026-10-09): reacciones con emoji y respuestas (citas).

Tablas nuevas y aditivas; no se toca chat_messages:
- chat_reactions: una reacción por persona y mensaje (pulsar el mismo emoji la quita).
- chat_replies: a qué mensaje responde cada mensaje.
"""
from __future__ import annotations

import sqlite3
import time
from typing import Any

import db

ALLOWED_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👏"]


def _ensure(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS chat_reactions (
            message_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            emoji TEXT NOT NULL,
            created_at REAL NOT NULL,
            PRIMARY KEY (message_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_chat_reactions_msg ON chat_reactions(message_id);
        CREATE TABLE IF NOT EXISTS chat_hidden (
            owner_id INTEGER NOT NULL,
            email TEXT NOT NULL,
            created_at REAL NOT NULL,
            PRIMARY KEY (owner_id, email)
        );
        CREATE TABLE IF NOT EXISTS chat_replies (
            message_id INTEGER PRIMARY KEY,
            reply_to_id INTEGER NOT NULL
        );
        """
    )


def init() -> None:
    with db.get_conn() as conn:
        _ensure(conn)


def _message_pair(conn: sqlite3.Connection, mid: int) -> tuple[int, int] | None:
    row = conn.execute(
        "SELECT from_user_id, to_user_id FROM chat_messages WHERE id = ?", (int(mid),)
    ).fetchone()
    if not row:
        return None
    return int(row["from_user_id"]), int(row["to_user_id"])


def set_reply(message_id: int, reply_to_id: int, user_id: int) -> bool:
    """Guarda la cita solo si ambos mensajes son de la misma conversación."""
    with db.get_conn() as conn:
        _ensure(conn)
        a = _message_pair(conn, message_id)
        b = _message_pair(conn, reply_to_id)
        if not a or not b or int(user_id) not in a or set(a) != set(b):
            return False
        conn.execute(
            "INSERT OR REPLACE INTO chat_replies (message_id, reply_to_id) VALUES (?, ?)",
            (int(message_id), int(reply_to_id)),
        )
        return True


def toggle_reaction(user_id: int, message_id: int, emoji: str) -> dict[str, Any] | None:
    """Devuelve {"messageId", "reactions", "peerId"} o None si el mensaje no es de este usuario."""
    emoji = str(emoji or "").strip()
    if emoji not in ALLOWED_EMOJI:
        raise ValueError("emoji")
    uid = int(user_id)
    with db.get_conn() as conn:
        _ensure(conn)
        pair = _message_pair(conn, message_id)
        if not pair or uid not in pair:
            return None
        cur = conn.execute(
            "SELECT emoji FROM chat_reactions WHERE message_id = ? AND user_id = ?",
            (int(message_id), uid),
        ).fetchone()
        if cur and cur["emoji"] == emoji:
            conn.execute(
                "DELETE FROM chat_reactions WHERE message_id = ? AND user_id = ?",
                (int(message_id), uid),
            )
        else:
            conn.execute(
                "INSERT OR REPLACE INTO chat_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)",
                (int(message_id), uid, emoji, time.time()),
            )
        reactions = _reactions(conn, [int(message_id)]).get(int(message_id), [])
    peer = pair[1] if pair[0] == uid else pair[0]
    return {"messageId": int(message_id), "reactions": reactions, "peerId": peer}


def _reactions(conn: sqlite3.Connection, ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    out: dict[int, list[dict[str, Any]]] = {}
    if not ids:
        return out
    q = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"SELECT message_id, user_id, emoji FROM chat_reactions WHERE message_id IN ({q}) ORDER BY created_at",
        [int(i) for i in ids],
    ).fetchall()
    for r in rows:
        bucket = out.setdefault(int(r["message_id"]), [])
        found = None
        for item in bucket:
            if item["emoji"] == r["emoji"]:
                found = item
                break
        if not found:
            found = {"emoji": r["emoji"], "userIds": []}
            bucket.append(found)
        found["userIds"].append(int(r["user_id"]))
    return out


def decorate(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Añade «reactions» y «replyTo» (resumen del mensaje citado) a cada mensaje."""
    ids = [int(m["id"]) for m in messages if m and m.get("id") is not None]
    if not ids:
        return messages
    with db.get_conn() as conn:
        _ensure(conn)
        reacts = _reactions(conn, ids)
        q = ",".join("?" for _ in ids)
        reps = conn.execute(
            f"SELECT message_id, reply_to_id FROM chat_replies WHERE message_id IN ({q})", ids
        ).fetchall()
        rep_map = {int(r["message_id"]): int(r["reply_to_id"]) for r in reps}
        quoted: dict[int, dict[str, Any]] = {}
        qids = sorted(set(rep_map.values()))
        if qids:
            qq = ",".join("?" for _ in qids)
            for r in conn.execute(
                f"""SELECT m.id, m.text, m.image, u.name AS from_name, m.from_user_id
                    FROM chat_messages m JOIN users u ON u.id = m.from_user_id
                    WHERE m.id IN ({qq})""",
                qids,
            ).fetchall():
                text = str(r["text"] or "")
                if len(text) > 140:
                    text = text[:137] + "…"
                quoted[int(r["id"])] = {
                    "id": int(r["id"]),
                    "text": text,
                    "hasImage": bool(r["image"]),
                    "fromName": r["from_name"],
                    "fromUserId": int(r["from_user_id"]),
                }
    for m in messages:
        mid = int(m["id"])
        m["reactions"] = reacts.get(mid, [])
        rid = rep_map.get(mid)
        m["replyTo"] = quoted.get(rid) if rid else None
        if rid and not m["replyTo"]:
            m["replyTo"] = {"id": rid, "text": "Mensaje no disponible", "hasImage": False, "fromName": "", "fromUserId": 0}
    try:
        import chat_media  # vídeos del chat (2026-10)
        chat_media.decorate(messages)
    except Exception:
        pass
    return messages


# ── Contactos ocultos (2026-10): solo afecta a la lista de quien los oculta ──
HIDDEN_MAX = 500


def list_hidden(owner_id: int) -> list[str]:
    with db.get_conn() as conn:
        _ensure(conn)
        rows = conn.execute("SELECT email FROM chat_hidden WHERE owner_id = ? ORDER BY created_at", (int(owner_id),)).fetchall()
    return [str(r["email"]) for r in rows]


def set_hidden(owner_id: int, email: str, hidden: bool) -> list[str]:
    email = str(email or "").strip().lower()
    if not email or "@" not in email or len(email) > 200:
        raise ValueError("Correo no válido")
    with db.get_conn() as conn:
        _ensure(conn)
        if hidden:
            n = conn.execute("SELECT COUNT(*) FROM chat_hidden WHERE owner_id = ?", (int(owner_id),)).fetchone()[0]
            if int(n) >= HIDDEN_MAX:
                raise ValueError("Has ocultado demasiados contactos")
            conn.execute("INSERT OR IGNORE INTO chat_hidden (owner_id, email, created_at) VALUES (?,?,?)", (int(owner_id), email, time.time()))
        else:
            conn.execute("DELETE FROM chat_hidden WHERE owner_id = ? AND email = ?", (int(owner_id), email))
    return list_hidden(owner_id)
