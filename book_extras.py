"""DoganieroBook extras (2026-10-09): seguir canales.

Tabla nueva y aditiva (no toca book_channels ni book_posts):
- book_follows: qué perfil sigue a qué canal (por el dueño del canal).
"""
from __future__ import annotations

import sqlite3
import time
from typing import Any

import db


def _ensure(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS book_follows (
            follower_id INTEGER NOT NULL,
            channel_user_id INTEGER NOT NULL,
            created_at REAL NOT NULL,
            PRIMARY KEY (follower_id, channel_user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_book_follows_channel ON book_follows(channel_user_id);
        """
    )


def following_handles(user_id: int) -> list[str]:
    with db.get_conn() as conn:
        _ensure(conn)
        rows = conn.execute(
            """
            SELECT c.handle FROM book_follows f
            JOIN book_channels c ON c.user_id = f.channel_user_id
            WHERE f.follower_id = ?
            ORDER BY f.created_at DESC
            """,
            (int(user_id),),
        ).fetchall()
        return [str(r["handle"]) for r in rows]


def _channel_user_id(conn: sqlite3.Connection, handle: str) -> int | None:
    h = (handle or "").strip().lstrip("@").lower()
    if not h:
        return None
    row = conn.execute(
        "SELECT user_id FROM book_channels WHERE handle = ? COLLATE NOCASE", (h,)
    ).fetchone()
    return int(row["user_id"]) if row else None


def _info(conn: sqlite3.Connection, user_id: int, ch_uid: int) -> dict[str, Any]:
    followers = conn.execute(
        "SELECT COUNT(*) AS c FROM book_follows WHERE channel_user_id = ?", (ch_uid,)
    ).fetchone()["c"]
    following = conn.execute(
        "SELECT 1 FROM book_follows WHERE follower_id = ? AND channel_user_id = ?",
        (int(user_id), ch_uid),
    ).fetchone()
    views = conn.execute(
        "SELECT COALESCE(SUM(views), 0) AS v FROM book_posts WHERE user_id = ?", (ch_uid,)
    ).fetchone()["v"]
    likes = 0
    try:
        likes = conn.execute(
            "SELECT COUNT(*) AS c FROM book_likes l JOIN book_posts p ON p.id = l.post_id WHERE p.user_id = ?",
            (ch_uid,),
        ).fetchone()["c"]
    except sqlite3.Error:
        likes = 0
    return {
        "following": bool(following),
        "followers": int(followers or 0),
        "totalViews": int(views or 0),
        "totalLikes": int(likes or 0),
        "isMine": int(user_id) == int(ch_uid),
    }


def channel_info(user_id: int, handle: str) -> dict[str, Any] | None:
    with db.get_conn() as conn:
        _ensure(conn)
        ch_uid = _channel_user_id(conn, handle)
        if ch_uid is None:
            return None
        return _info(conn, user_id, ch_uid)


def set_follow(user_id: int, handle: str, follow: bool) -> dict[str, Any] | None:
    """None si el canal no existe; ValueError si intentas seguir tu propio canal."""
    with db.get_conn() as conn:
        _ensure(conn)
        ch_uid = _channel_user_id(conn, handle)
        if ch_uid is None:
            return None
        if int(ch_uid) == int(user_id):
            raise ValueError("No puedes seguir tu propio canal")
        if follow:
            conn.execute(
                "INSERT OR IGNORE INTO book_follows (follower_id, channel_user_id, created_at) VALUES (?, ?, ?)",
                (int(user_id), ch_uid, time.time()),
            )
        else:
            conn.execute(
                "DELETE FROM book_follows WHERE follower_id = ? AND channel_user_id = ?",
                (int(user_id), ch_uid),
            )
        conn.commit()
        return _info(conn, user_id, ch_uid)
