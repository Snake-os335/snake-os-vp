"""Snake OS 2026.14: rutas que faltaban en el servidor.

El Calendario (snake-apps-extras.js) y las valoraciones de la Doganiero Store (desktop-extras.js) llamaban a
/api/calendar y /api/store/ratings, pero esas rutas nunca se registraron en main.py (los módulos calendar_extras
y store_extras existían sin router) y respondían 404: los eventos solo quedaban en el navegador y las estrellas
no se guardaban. Este router las conecta, con sesión obligatoria y límites por perfil.
"""
from __future__ import annotations

import threading
import time
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Request

import calendar_extras
import store_extras

_lock = threading.Lock()
_hits: dict[str, list[float]] = {}
CAL_MAX_BODY = 512 * 1024


def _limited(key: str, limit: int, window: float) -> bool:
    now = time.time()
    with _lock:
        arr = [t for t in _hits.get(key, []) if now - t < window]
        if len(arr) >= limit:
            _hits[key] = arr
            return True
        arr.append(now)
        _hits[key] = arr
        if len(_hits) > 5000:
            for k in list(_hits.keys())[:1000]:
                if not any(now - t < 3600 for t in _hits[k]):
                    _hits.pop(k, None)
        return False


def build_router(require_user: Callable[..., Any]) -> APIRouter:
    r = APIRouter()

    @r.get("/api/calendar")
    def cal_get(user=Depends(require_user)):
        return calendar_extras.get_events(int(user["id"]))

    @r.put("/api/calendar")
    async def cal_put(request: Request, user=Depends(require_user)):
        uid = int(user["id"])
        if _limited("cal:%d" % uid, 60, 60.0):
            raise HTTPException(status_code=429, detail="Demasiados cambios seguidos. Espera un momento.")
        raw = await request.body()
        if len(raw) > CAL_MAX_BODY:
            raise HTTPException(status_code=413, detail="Demasiados eventos en el calendario")
        try:
            import json
            body = json.loads(raw.decode("utf-8") or "{}")
        except (ValueError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Datos no válidos")
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Datos no válidos")
        try:
            return calendar_extras.put_events(uid, body.get("events"))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @r.get("/api/store/ratings")
    def ratings(user=Depends(require_user)):
        return {"apps": store_extras.summary(int(user["id"]))}

    @r.post("/api/store/ratings/{app_id}")
    def rate(app_id: str, body: dict, user=Depends(require_user)):
        uid = int(user["id"])
        if _limited("rate:%d" % uid, 30, 60.0):
            raise HTTPException(status_code=429, detail="Demasiadas valoraciones seguidas. Espera un momento.")
        try:
            stars = int((body or {}).get("stars", 0)) if isinstance(body, dict) else 0
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Valoración no válida")
        try:
            return store_extras.rate(uid, str(app_id), stars)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    return r
