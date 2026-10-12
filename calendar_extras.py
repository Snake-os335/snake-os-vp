"""Calendario de Snake OS (2026-10-09): eventos por perfil guardados en el servidor.

Tabla nueva y aditiva: calendar_events (un documento JSON por perfil).
"""
from __future__ import annotations

import json
import re
import sqlite3
import time
from typing import Any

import db

_DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_HM_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
MAX_DAYS = 1500
MAX_PER_DAY = 50
MAX_TOTAL = 3000


def _ensure(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS calendar_events (
            user_id INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at REAL NOT NULL
        );
        """
    )


def sanitize(events: Any) -> dict[str, list[dict[str, str]]]:
    if not isinstance(events, dict):
        raise ValueError("Formato de eventos no válido")
    out: dict[str, list[dict[str, str]]] = {}
    total = 0
    for day in sorted(events.keys())[:MAX_DAYS]:
        if not isinstance(day, str) or not _DAY_RE.match(day):
            continue
        items = events.get(day)
        if not isinstance(items, list):
            continue
        clean: list[dict[str, str]] = []
        for it in items[:MAX_PER_DAY]:
            if not isinstance(it, dict):
                continue
            title = str(it.get("t") or "").strip()[:80]
            if not title:
                continue
            eid = str(it.get("id") or "")
            if not _ID_RE.match(eid):
                eid = "e" + str(int(time.time() * 1000) + total)
            hm = str(it.get("h") or "")
            if not _HM_RE.match(hm):
                hm = ""
            color = str(it.get("c") or "")
            if not _COLOR_RE.match(color):
                color = "#34d17a"
            clean.append({"id": eid, "t": title, "h": hm, "c": color})
            total += 1
            if total >= MAX_TOTAL:
                break
        if clean:
            out[day] = clean
        if total >= MAX_TOTAL:
            break
    return out


def get_events(user_id: int) -> dict[str, Any]:
    with db.get_conn() as conn:
        _ensure(conn)
        r = conn.execute(
            "SELECT data, updated_at FROM calendar_events WHERE user_id = ?", (int(user_id),)
        ).fetchone()
    if not r:
        return {"events": {}, "saved": False, "updatedAt": 0}
    try:
        data = json.loads(r["data"] or "{}")
    except (TypeError, ValueError):
        data = {}
    return {"events": data if isinstance(data, dict) else {}, "saved": True, "updatedAt": float(r["updated_at"] or 0)}


def put_events(user_id: int, events: Any) -> dict[str, Any]:
    clean = sanitize(events)
    now = time.time()
    with db.get_conn() as conn:
        _ensure(conn)
        conn.execute(
            "INSERT OR REPLACE INTO calendar_events (user_id, data, updated_at) VALUES (?, ?, ?)",
            (int(user_id), json.dumps(clean, ensure_ascii=False), now),
        )
        conn.commit()
    return {"ok": True, "events": clean, "updatedAt": now}
