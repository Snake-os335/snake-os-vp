"""Password hashing and session cookie helpers."""
from __future__ import annotations

import time
from uuid import uuid4

from passlib.context import CryptContext

from db import create_session, delete_session, get_session, get_user_by_id

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

COOKIE_NAME = "session_id"
SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 days


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(password, password_hash)
    except Exception:
        return False


def new_session_id() -> str:
    return str(uuid4())


def start_session(user_id: int, kind: str = "os") -> str:
    """kind='os': sesión de Snake OS; kind='site': solo para páginas propias (/pro), no vale como sesión de Snake OS."""
    sid = new_session_id()
    create_session(sid, user_id, time.time(), kind)
    return sid


def end_session(session_id: str | None) -> None:
    if session_id:
        delete_session(session_id)


def session_kind(row) -> str:
    try:
        return "site" if row["kind"] == "site" else "os"
    except (IndexError, KeyError):
        return "os"


def user_from_session(session_id: str | None, kind: str = "os"):
    """Por defecto solo acepta sesiones de Snake OS: una sesión de página (/pro) no abre Snake OS ni su API."""
    if not session_id:
        return None
    row = get_session(session_id)
    if not row:
        return None
    if session_kind(row) != ("site" if kind == "site" else "os"):
        return None
    if time.time() - float(row["created_at"]) > SESSION_MAX_AGE:
        delete_session(session_id)
        return None
    return get_user_by_id(int(row["user_id"]))
