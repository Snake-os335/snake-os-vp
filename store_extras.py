"""Doganiero Store extras (2026-10-09): valoraciones de 1 a 5 estrellas.

Tabla nueva y aditiva: store_ratings (una valoración por perfil y app).
"""
from __future__ import annotations

import re
import sqlite3
import time
from typing import Any

import db

_APP_ID_RE = re.compile(r"^[a-z0-9_-]{1,40}$")


def _ensure(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS store_ratings (
            user_id INTEGER NOT NULL,
            app_id TEXT NOT NULL,
            stars INTEGER NOT NULL,
            updated_at REAL NOT NULL,
            PRIMARY KEY (user_id, app_id)
        );
        CREATE INDEX IF NOT EXISTS idx_store_ratings_app ON store_ratings(app_id);
        """
    )


def valid_app_id(app_id: str) -> bool:
    return bool(_APP_ID_RE.match(str(app_id or "")))


def summary(user_id: int) -> dict[str, Any]:
    with db.get_conn() as conn:
        _ensure(conn)
        out: dict[str, Any] = {}
        for r in conn.execute(
            "SELECT app_id, AVG(stars) AS a, COUNT(*) AS c FROM store_ratings GROUP BY app_id"
        ).fetchall():
            out[str(r["app_id"])] = {"avg": round(float(r["a"] or 0), 2), "count": int(r["c"] or 0), "mine": 0}
        for r in conn.execute(
            "SELECT app_id, stars FROM store_ratings WHERE user_id = ?", (int(user_id),)
        ).fetchall():
            out.setdefault(str(r["app_id"]), {"avg": 0, "count": 0, "mine": 0})["mine"] = int(r["stars"])
        return out


def rate(user_id: int, app_id: str, stars: int) -> dict[str, Any]:
    if not valid_app_id(app_id):
        raise ValueError("App no válida")
    s = int(stars)
    if s < 0 or s > 5:
        raise ValueError("La valoración debe ser de 1 a 5 estrellas")
    with db.get_conn() as conn:
        _ensure(conn)
        if s == 0:
            conn.execute("DELETE FROM store_ratings WHERE user_id = ? AND app_id = ?", (int(user_id), app_id))
        else:
            conn.execute(
                "INSERT OR REPLACE INTO store_ratings (user_id, app_id, stars, updated_at) VALUES (?, ?, ?, ?)",
                (int(user_id), app_id, s, time.time()),
            )
        conn.commit()
        r = conn.execute(
            "SELECT AVG(stars) AS a, COUNT(*) AS c FROM store_ratings WHERE app_id = ?", (app_id,)
        ).fetchone()
        return {"appId": app_id, "avg": round(float(r["a"] or 0), 2), "count": int(r["c"] or 0), "mine": s}
