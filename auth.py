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


def start_session(user_id: int) -> str:
    sid = new_session_id()
    create_session(sid, user_id, time.time())
    return sid


def end_session(session_id: str | None) -> None:
    if session_id:
        delete_session(session_id)


def user_from_session(session_id: str | None):
    if not session_id:
        return None
    row = get_session(session_id)
    if not row:
        return None
    if time.time() - float(row["created_at"]) > SESSION_MAX_AGE:
        delete_session(session_id)
        return None
    return get_user_by_id(int(row["user_id"]))
