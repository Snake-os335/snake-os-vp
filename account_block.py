"""Bloqueo temporal de una cuenta Dogaemail tras un reporte. No borra la cuenta."""
from __future__ import annotations

import hmac
import json
import os
import threading
import time
from datetime import datetime

from fastapi import HTTPException, Request

ROOT = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(ROOT, "data", "report_blocks.json")
DAYS = 3 * 24 * 3600
_lock = threading.Lock()


def _secret() -> str:
    if os.environ.get("BLOCK_SECRET"):
        return os.environ["BLOCK_SECRET"]
    for name in ("block.env", "entry.env", "secrets.env"):
        path = os.path.join(ROOT, name)
        if not os.path.isfile(path):
            continue
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line.startswith("BLOCK_SECRET="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def _load() -> dict:
    if not os.path.isfile(PATH):
        return {}
    try:
        data = json.loads(open(PATH, encoding="utf-8").read())
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _save(data: dict) -> None:
    os.makedirs(os.path.dirname(PATH), exist_ok=True)
    tmp = PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(data, handle)
    os.replace(tmp, PATH)


def until(email: str) -> int:
    email = (email or "").strip().lower()
    if "@" not in email:
        return 0
    with _lock:
        data = _load()
        exp = int(data.get(email) or 0)
        if exp <= time.time():
            if email in data:
                data.pop(email, None)
                _save(data)
            return 0
        return exp


def block(email: str) -> int:
    email = (email or "").strip().lower()
    exp = int(time.time()) + DAYS
    with _lock:
        data = _load()
        current = int(data.get(email) or 0)
        if current > exp:
            exp = current
        data[email] = exp
        _save(data)
    return exp


def message(exp: int) -> str:
    try:
        from zoneinfo import ZoneInfo
        when = datetime.fromtimestamp(exp, ZoneInfo("Europe/Madrid")).strftime("%d/%m/%Y a las %H:%M")
    except Exception:
        when = time.strftime("%d/%m/%Y a las %H:%M UTC", time.gmtime(exp))
    return "Tu cuenta está bloqueada hasta el " + when + ". Hasta entonces no puedes entrar en Doganiero."


def refuse(email: str) -> None:
    exp = until(email)
    if exp:
        raise HTTPException(status_code=403, detail=message(exp))


def guard(request: Request) -> None:
    secret = _secret()
    given = request.headers.get("x-block-key") or ""
    if not secret or not hmac.compare_digest(given, secret):
        raise HTTPException(status_code=404, detail="No encontrado")
