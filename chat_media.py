"""Doganiero Chat: vídeos de cualquier tamaño (backlog 2026-10).

- Subida por trozos (8 MB) para no chocar con límites de cuerpo de petición (Cloudflare ~100 MB).
- Se guardan en data/chat_videos/<id>.bin, fuera de la base de datos.
- Sin límite fijo de tamaño: solo se exige que el disco conserve CHAT_VIDEO_RESERVE libre.
- Solo emisor y receptor pueden verlos; se sirven con Range (saltar a cualquier minuto).
"""
from __future__ import annotations

import os
import re
import secrets
import shutil
import sqlite3
import time
from pathlib import Path
from typing import Any

import db

VIDEO_DIR = db.DATA_DIR / "chat_videos"
TMP_DIR = VIDEO_DIR / "tmp"
CHUNK_MAX = 8 * 1024 * 1024
CHAT_VIDEO_RESERVE = 20 * 1024 ** 3  # deja siempre 20 GB libres en el disco
STALE_UPLOAD_S = 24 * 3600
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
_EXT = {"video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/x-matroska": "mkv", "video/3gpp": "3gp", "video/ogg": "ogv"}


def _ensure(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS chat_video_uploads (
            id TEXT PRIMARY KEY,
            from_user_id INTEGER NOT NULL,
            to_user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            mime TEXT NOT NULL,
            size INTEGER NOT NULL,
            received INTEGER NOT NULL DEFAULT 0,
            created_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS chat_videos (
            message_id INTEGER PRIMARY KEY,
            file_id TEXT NOT NULL,
            name TEXT NOT NULL,
            mime TEXT NOT NULL,
            size INTEGER NOT NULL
        );
        """
    )


def init() -> None:
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    with db.get_conn() as conn:
        _ensure(conn)
    cleanup_stale()


def cleanup_stale() -> None:
    cutoff = time.time() - STALE_UPLOAD_S
    try:
        with db.get_conn() as conn:
            _ensure(conn)
            rows = conn.execute("SELECT id FROM chat_video_uploads WHERE created_at < ?", (cutoff,)).fetchall()
            for r in rows:
                try:
                    (TMP_DIR / f"{r['id']}.part").unlink(missing_ok=True)
                except OSError:
                    pass
            conn.execute("DELETE FROM chat_video_uploads WHERE created_at < ?", (cutoff,))
    except Exception:
        pass


def _clean_mime(mime: str, name: str) -> str:
    m = (mime or "").strip().lower()
    if m.startswith("video/") and len(m) < 60:
        return m
    ext = Path(name or "").suffix.lower().lstrip(".")
    for k, v in _EXT.items():
        if v == ext:
            return k
    raise ValueError("notvideo")


def free_bytes() -> int:
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    return int(shutil.disk_usage(VIDEO_DIR).free)


def start(from_id: int, to_id: int, name: str, mime: str, size: int) -> dict[str, Any]:
    name = (os.path.basename(str(name or "video")).strip() or "video")[:160]
    mime = _clean_mime(mime, name)
    size = int(size)
    if size <= 0:
        raise ValueError("empty")
    if free_bytes() - size < CHAT_VIDEO_RESERVE:
        raise ValueError("nospace")
    cleanup_stale()
    uid = secrets.token_urlsafe(18)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    (TMP_DIR / f"{uid}.part").write_bytes(b"")
    with db.get_conn() as conn:
        _ensure(conn)
        conn.execute(
            "INSERT INTO chat_video_uploads (id, from_user_id, to_user_id, name, mime, size, received, created_at) VALUES (?,?,?,?,?,?,0,?)",
            (uid, int(from_id), int(to_id), name, mime, size, time.time()),
        )
    return {"uploadId": uid, "chunk": CHUNK_MAX}


def _upload(conn: sqlite3.Connection, upload_id: str, user_id: int):
    if not _ID_RE.match(upload_id or ""):
        return None
    row = conn.execute("SELECT * FROM chat_video_uploads WHERE id = ?", (upload_id,)).fetchone()
    if not row or int(row["from_user_id"]) != int(user_id):
        return None
    return row


def put_chunk(upload_id: str, user_id: int, offset: int, data: bytes) -> int:
    if len(data) > CHUNK_MAX:
        raise ValueError("chunk")
    with db.get_conn() as conn:
        _ensure(conn)
        row = _upload(conn, upload_id, user_id)
        if not row:
            raise LookupError("upload")
        got = int(row["received"])
        if int(offset) != got:
            return got  # el cliente reanuda desde aquí
        if got + len(data) > int(row["size"]):
            raise ValueError("toolong")
        if free_bytes() - len(data) < CHAT_VIDEO_RESERVE // 2:
            raise ValueError("nospace")
        with open(TMP_DIR / f"{upload_id}.part", "ab") as fh:
            fh.write(data)
        got += len(data)
        conn.execute("UPDATE chat_video_uploads SET received = ? WHERE id = ?", (got, upload_id))
        return got


def take_finished(upload_id: str, user_id: int) -> dict[str, Any]:
    """Comprueba que la subida está completa y mueve el fichero a su sitio definitivo."""
    with db.get_conn() as conn:
        _ensure(conn)
        row = _upload(conn, upload_id, user_id)
        if not row:
            raise LookupError("upload")
        part = TMP_DIR / f"{upload_id}.part"
        if int(row["received"]) != int(row["size"]) or part.stat().st_size != int(row["size"]):
            raise ValueError("incomplete")
        part.replace(VIDEO_DIR / f"{upload_id}.bin")
        conn.execute("DELETE FROM chat_video_uploads WHERE id = ?", (upload_id,))
        return {"fileId": upload_id, "from": int(row["from_user_id"]), "to": int(row["to_user_id"]),
                "name": row["name"], "mime": row["mime"], "size": int(row["size"])}


def cancel(upload_id: str, user_id: int) -> None:
    with db.get_conn() as conn:
        _ensure(conn)
        row = _upload(conn, upload_id, user_id)
        if not row:
            return
        (TMP_DIR / f"{upload_id}.part").unlink(missing_ok=True)
        conn.execute("DELETE FROM chat_video_uploads WHERE id = ?", (upload_id,))


def link(message_id: int, info: dict[str, Any]) -> None:
    with db.get_conn() as conn:
        _ensure(conn)
        conn.execute(
            "INSERT OR REPLACE INTO chat_videos (message_id, file_id, name, mime, size) VALUES (?,?,?,?,?)",
            (int(message_id), info["fileId"], info["name"], info["mime"], int(info["size"])),
        )


def for_viewer(message_id: int, user_id: int) -> dict[str, Any] | None:
    with db.get_conn() as conn:
        _ensure(conn)
        row = conn.execute(
            """SELECT v.file_id, v.name, v.mime, v.size, m.from_user_id, m.to_user_id
               FROM chat_videos v JOIN chat_messages m ON m.id = v.message_id WHERE v.message_id = ?""",
            (int(message_id),),
        ).fetchone()
    if not row or int(user_id) not in (int(row["from_user_id"]), int(row["to_user_id"])):
        return None
    path = VIDEO_DIR / f"{row['file_id']}.bin"
    if not path.exists():
        return None
    return {"path": path, "name": row["name"], "mime": row["mime"], "size": int(row["size"])}


def decorate(messages: list[dict[str, Any]]) -> None:
    ids = [int(m["id"]) for m in messages if m and m.get("id") is not None]
    if not ids:
        return
    q = ",".join("?" for _ in ids)
    with db.get_conn() as conn:
        _ensure(conn)
        rows = conn.execute(f"SELECT message_id, name, mime, size FROM chat_videos WHERE message_id IN ({q})", ids).fetchall()
    vm = {int(r["message_id"]): r for r in rows}
    for m in messages:
        r = vm.get(int(m["id"]))
        if r:
            m["video"] = {"url": f"/api/chat/video/{int(m['id'])}", "name": r["name"], "mime": r["mime"], "size": int(r["size"])}
