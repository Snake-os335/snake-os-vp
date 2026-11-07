"""Doganiero VR Link (2026.23) — buscar gafas VR y ver lo que ves dentro.

Dos páginas + un canal en tiempo real, todo en este mismo servidor:

  • Doganiero-vr-search.softportweb.com  (ordenador)  →  /vr-search
      - busca gafas VR por Bluetooth (Web Bluetooth del navegador),
      - pide la conexión a las gafas (solicitud a tu cuenta de Dogaemail),
      - recibe y muestra el vídeo de lo que ves en las gafas (WebRTC),
      - sigue el juego de realidad mixta (estado de la serpiente).

  • Doganiero-vr-send.softportweb.com    (gafas VR)   →  /vr-send
      - detecta las solicitudes que llegan desde el ordenador (cuenta Dogaemail
        o código de emparejamiento),
      - al aceptar, transmite lo que se ve (pantalla del visor o el propio juego),
      - lanza el juego de realidad mixta: escanear la habitación y cuidar a una
        serpiente con los mandos (vr-room-snake.js).

Los nombres de host se sirven en «/» cuando el túnel de Cloudflare publique esos
subdominios; mientras tanto todo funciona también en /vr-search y /vr-send.

WebSocket /api/vrlink/ws?role=pc|send[&code=XXXXXXXX]
  Cuenta: cookie de sesión de la página (doga_auth: sitios «vrsearch» / «vrsend»).
  Las gafas también pueden entrar con un código de 6 caracteres que muestra el
  ordenador (no hace falta escribir la contraseña con los mandos).

Mensajes (JSON; el servidor solo los enruta entre el ordenador y las gafas de
la MISMA cuenta):
  {type:'request'|'accept'|'reject'}                 solicitud de conexión
  {type:'offer'|'answer'|'ice'|'restart'|'hangup'}   señalización WebRTC
  {type:'bt_devices', devices:[…]}                   gafas vistas por Bluetooth
  {type:'game_cmd', action:'start'|'screenshot'|'stop'}  órdenes al juego
  {type:'game_state', state:{…}}                     estado de la serpiente
  {type:'status', text} / {type:'screenshot', dataUrl}
  {type:'ping'} → {type:'pong'}
El servidor añade {type:'welcome'} al entrar y {type:'peers'} con quién hay
conectado en cada lado.
"""
from __future__ import annotations

import asyncio
import json
import os
import secrets
import time
from pathlib import Path as FsPath
from typing import Any, Callable

from fastapi import APIRouter, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

VR_SITE_PC = "vrsearch"      # sitio doga_auth del ordenador (cookie doga_s_vrsearch)
VR_SITE_SEND = "vrsend"      # sitio doga_auth de las gafas    (cookie doga_s_vrsend)

PAIR_TTL_S = 6 * 3600        # el código del ordenador vale 6 h
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"   # sin 0/O/1/I/L
_MAX_MSG_BYTES = 4 * 1024 * 1024                     # SDP/ICE y capturas pequeñas

_HOST_SEARCH = "doganiero-vr-search."
_HOST_SEND = "doganiero-vr-send."

_APP_DIR = FsPath(__file__).resolve().parent

_NO_CACHE = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    "Pragma": "no-cache",
}


def _norm_email(value: Any) -> str:
    return str(value or "").strip().lower()


def _send_base_url() -> str:
    return (os.environ.get("SNAKEOS_VRSEND_URL") or "https://doganiero-vr-send.softportweb.com/").strip()


def _search_base_url() -> str:
    return (os.environ.get("SNAKEOS_VRSEARCH_URL") or "https://doganiero-vr-search.softportweb.com/").strip()


def ice_servers() -> list[dict[str, Any]]:
    """STUN público + TURN opcional por entorno (SNAKEOS_TURN_URL/USER/PASS).

    Sin TURN, las gafas y el ordenador tienen que verse directamente (misma red
    o NAT no simétrico). Con TURN configurado funciona desde cualquier red.
    """
    servers: list[dict[str, Any]] = [{"urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]}]
    turn = (os.environ.get("SNAKEOS_TURN_URL") or "").strip()
    if turn:
        item: dict[str, Any] = {"urls": [u.strip() for u in turn.split(",") if u.strip()]}
        user = (os.environ.get("SNAKEOS_TURN_USER") or "").strip()
        pwd = (os.environ.get("SNAKEOS_TURN_PASS") or "").strip()
        if user:
            item["username"] = user
        if pwd:
            item["credential"] = pwd
        servers.append(item)
    return servers


class VrLinkHub:
    """Presencia y enrutado en tiempo real entre el ordenador y las gafas.

    Una cuenta puede tener varias pestañas abiertas en cada lado (no se echan
    entre sí). Los mensajes de señalización se reenvían al OTRO lado de la misma
    cuenta; si un lado no está conectado se responde {type:'peer_offline'}.
    """

    def __init__(self) -> None:
        self.clients: dict[str, dict[str, list[WebSocket]]] = {}
        self.bt_devices: dict[str, list[dict[str, Any]]] = {}
        self.pairs: dict[str, dict[str, Any]] = {}
        self.pair_by_email: dict[str, str] = {}
        self._lock = asyncio.Lock()

    # ----- presencia -----
    def _socks(self, email: str) -> dict[str, list[WebSocket]]:
        return self.clients.setdefault(email, {"pc": [], "send": []})

    async def add(self, email: str, role: str, ws: WebSocket) -> None:
        email = _norm_email(email)
        async with self._lock:
            arr = self._socks(email)[role]
            if ws not in arr:
                arr.append(ws)

    async def remove(self, email: str, role: str, ws: WebSocket) -> None:
        email = _norm_email(email)
        async with self._lock:
            arr = self._socks(email).get(role) or []
            if ws in arr:
                arr.remove(ws)
            cur = self.clients.get(email) or {}
            if not cur.get("pc") and not cur.get("send"):
                self.clients.pop(email, None)

    def counts(self, email: str) -> dict[str, int]:
        c = self.clients.get(_norm_email(email)) or {}
        return {"pc": len(c.get("pc") or []), "send": len(c.get("send") or [])}

    async def send_role(self, email: str, role: str, payload: dict[str, Any]) -> int:
        raw = json.dumps(payload, ensure_ascii=False)
        sent = 0
        for ws in list((self.clients.get(_norm_email(email)) or {}).get(role) or []):
            try:
                await ws.send_text(raw)
                sent += 1
            except Exception:
                pass
        return sent

    async def peers(self, email: str) -> dict[str, Any]:
        c = self.counts(email)
        msg = {"type": "peers", "pc": c["pc"], "send": c["send"]}
        await self.send_role(email, "pc", msg)
        await self.send_role(email, "send", msg)
        return msg

    # ----- código de emparejamiento del ordenador -----
    def new_code(self, email: str, name: str = "", avatar: str = "") -> str:
        email = _norm_email(email)
        self._purge()
        code = self.pair_by_email.get(email)
        if not code or code not in self.pairs:
            code = self._random_code()
            self.pair_by_email[email] = code
        self.pairs[code] = {
            "email": email,
            "name": name,
            "avatar": avatar,
            "exp": time.time() + PAIR_TTL_S,
        }
        return code

    def _random_code(self) -> str:
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))
        while code in self.pairs:
            code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))
        return code

    def code_of(self, email: str) -> str | None:
        self._purge()
        code = self.pair_by_email.get(_norm_email(email))
        return code if code in self.pairs else None

    def resolve_code(self, code: str) -> dict[str, Any] | None:
        self._purge()
        row = self.pairs.get(str(code or "").strip().upper())
        return row if row else None

    def drop_code(self, email: str) -> None:
        code = self.pair_by_email.pop(_norm_email(email), None)
        if code:
            self.pairs.pop(code, None)

    def _purge(self) -> None:
        now = time.time()
        dead = [c for c, row in self.pairs.items() if float(row.get("exp") or 0) < now]
        for code in dead:
            row = self.pairs.pop(code, None) or {}
            email = _norm_email(row.get("email"))
            if email and self.pair_by_email.get(email) == code:
                self.pair_by_email.pop(email, None)

    # ----- gafas vistas por Bluetooth -----
    def set_devices(self, email: str, devices: list[dict[str, Any]]) -> None:
        clean: list[dict[str, Any]] = []
        for d in (devices or [])[:24]:
            if not isinstance(d, dict):
                continue
            clean.append({
                "id": str(d.get("id") or "")[:120],
                "name": str(d.get("name") or "")[:80],
                "battery": d.get("battery"),
                "model": str(d.get("model") or "")[:80],
                "seen": float(d.get("seen") or time.time()),
            })
        self.bt_devices[_norm_email(email)] = clean

    def devices_of(self, email: str) -> list[dict[str, Any]]:
        return list(self.bt_devices.get(_norm_email(email)) or [])


HUB = VrLinkHub()


def _secs(value: float) -> int:
    return max(0, int(value))


def build_router(site_user: Callable[[Request, str], Any]) -> APIRouter:
    """Rutas HTTP + WebSocket. ``site_user`` es doga_auth.site_user (cuenta por cookie)."""
    r = APIRouter()

    def _pc_user(request: Request):
        return site_user(request, VR_SITE_PC)

    def _send_user(request: Request):
        return site_user(request, VR_SITE_SEND)

    # ---------- páginas ----------
    @r.get("/vr-search")
    def vr_search_page():
        return FileResponse(_APP_DIR / "vr-search.html", media_type="text/html; charset=utf-8", headers=_NO_CACHE)

    @r.get("/vr-send")
    def vr_send_page():
        return FileResponse(_APP_DIR / "vr-send.html", media_type="text/html; charset=utf-8", headers=_NO_CACHE)

    # ---------- conexiones ICE (STUN/TURN) ----------
    @r.get("/api/vrlink/ice")
    def vrlink_ice():
        return {"iceServers": ice_servers()}

    # ---------- código de emparejamiento (lo crea el ordenador) ----------
    @r.post("/api/vrlink/pair")
    def vrlink_pair(request: Request):
        user = _pc_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="Inicia sesión con tu cuenta dogaemail")
        code = HUB.new_code(
            str(user.get("email") or ""),
            str(user.get("name") or ""),
            str(user.get("avatar") or ""),
        )
        return _pair_view(request, code, user)

    @r.get("/api/vrlink/pair")
    def vrlink_pair_get(request: Request):
        user = _pc_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="Inicia sesión con tu cuenta dogaemail")
        code = HUB.code_of(str(user.get("email") or ""))
        if not code:
            return {"code": None, "active": False}
        return _pair_view(request, code, user)

    def _pair_view(request: Request, code: str, user: dict[str, Any]) -> dict[str, Any]:
        row = HUB.resolve_code(code) or {}
        email = str(user.get("email") or "")
        base = _send_base_url().rstrip("/")
        origin = ""
        try:
            proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
            host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
            if host:
                origin = f"{proto}://{host}"
        except Exception:
            origin = ""
        urls: list[str] = []
        if base:
            urls.append(f"{base}/?code={code}")
        if origin:
            urls.append(f"{origin}/vr-send?code={code}")
        return {
            "code": code,
            "active": True,
            "expiresIn": _secs(float(row.get("exp") or 0) - time.time()),
            "email": email,
            "urls": urls,
            "searchUrl": _search_base_url().rstrip("/") + "/",
            "peers": HUB.counts(email),
            "devices": HUB.devices_of(email),
        }

    @r.get("/api/vrlink/state")
    def vrlink_state(request: Request):
        """Estado ligero para pintar la página antes/después del WebSocket."""
        user = _pc_user(request) or _send_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="No autenticado")
        email = str(user.get("email") or "")
        return {
            "email": email,
            "name": str(user.get("name") or ""),
            "avatar": str(user.get("avatar") or ""),
            "peers": HUB.counts(email),
            "code": HUB.code_of(email),
            "devices": HUB.devices_of(email),
            "iceServers": ice_servers(),
        }

    # ---------- canal en tiempo real ----------
    @r.websocket("/api/vrlink/ws")
    async def vrlink_ws(websocket: WebSocket):
        role = (websocket.query_params.get("role") or "").strip().lower()
        code = (websocket.query_params.get("code") or "").strip().upper()
        await websocket.accept()
        if role not in ("pc", "send"):
            await _close_quiet(websocket, 4400)
            return
        user = None
        email = ""
        if role == "pc":
            user = site_user(websocket, VR_SITE_PC)
            if user:
                email = str(user.get("email") or "")
        else:
            user = site_user(websocket, VR_SITE_SEND)
            if user:
                email = str(user.get("email") or "")
            elif code:
                row = HUB.resolve_code(code)
                if row:
                    email = str(row.get("email") or "")
                    user = {"email": email, "name": row.get("name") or "", "avatar": row.get("avatar") or ""}
        email = _norm_email(email)
        if not user or not email:
            await _send_json(websocket, {"type": "error", "detail": "No autenticado o código caducado"})
            await _close_quiet(websocket, 4401)
            return

        name = str(user.get("name") or email.split("@")[0])
        avatar = str(user.get("avatar") or "🐍")
        await HUB.add(email, role, websocket)
        try:
            await _send_json(websocket, {
                "type": "welcome",
                "role": role,
                "email": email,
                "name": name,
                "avatar": avatar,
                "iceServers": ice_servers(),
                "devices": HUB.devices_of(email),
                "peers": HUB.counts(email),
                "code": HUB.code_of(email),
            })
            await HUB.peers(email)
        except Exception:
            await HUB.remove(email, role, websocket)
            return

        other = "send" if role == "pc" else "pc"
        try:
            while True:
                raw = await websocket.receive_text()
                if len(raw) > _MAX_MSG_BYTES:
                    await _send_json(websocket, {"type": "error", "detail": "Mensaje demasiado grande"})
                    continue
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if not isinstance(msg, dict):
                    continue
                mtype = str(msg.get("type") or "")
                if mtype == "ping":
                    await _send_json(websocket, {"type": "pong", "t": msg.get("t")})
                    continue
                if mtype == "bt_devices":
                    devices = msg.get("devices")
                    HUB.set_devices(email, devices if isinstance(devices, list) else [])
                    await HUB.send_role(email, "send", {
                        "type": "bt_devices",
                        "devices": HUB.devices_of(email),
                        "from": name,
                    })
                    await _send_json(websocket, {"type": "bt_saved", "count": len(HUB.devices_of(email))})
                    continue
                if mtype == "request":
                    if not HUB.counts(email)["send"]:
                        await _send_json(websocket, {"type": "peer_offline", "for": "request"})
                        continue
                    rid = str(msg.get("id") or "")[:64] or secrets.token_hex(8)
                    await HUB.send_role(email, "send", {
                        "type": "request",
                        "id": rid,
                        "from": name,
                        "avatar": avatar,
                        "email": email,
                        "devices": HUB.devices_of(email),
                    })
                    await _send_json(websocket, {"type": "request_sent", "id": rid})
                    continue
                if mtype == "accept":
                    rid = str(msg.get("id") or "")[:64]
                    await HUB.send_role(email, "pc", {
                        "type": "accepted",
                        "id": rid,
                        "from": name,
                        "avatar": avatar,
                        "device": msg.get("device"),
                    })
                    continue
                if mtype == "reject":
                    rid = str(msg.get("id") or "")[:64]
                    await HUB.send_role(email, "pc", {"type": "rejected", "id": rid, "from": name})
                    continue
                if mtype in ("offer", "answer", "ice", "restart", "hangup", "game_cmd", "game_state", "status", "screenshot"):
                    if not HUB.counts(email)[other]:
                        if mtype in ("offer", "answer", "restart"):
                            await _send_json(websocket, {"type": "peer_offline", "for": mtype})
                        continue
                    await HUB.send_role(email, other, {
                        "type": mtype,
                        "id": msg.get("id"),
                        "sdp": msg.get("sdp"),
                        "candidate": msg.get("candidate"),
                        "action": msg.get("action"),
                        "state": msg.get("state"),
                        "text": msg.get("text"),
                        "dataUrl": msg.get("dataUrl"),
                        "source": msg.get("source"),
                    })
                    continue
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            await HUB.remove(email, role, websocket)
            try:
                await HUB.peers(email)
            except Exception:
                pass
            try:
                await websocket.close()
            except Exception:
                pass

    return r


async def _send_json(ws: WebSocket, payload: dict[str, Any]) -> None:
    try:
        await ws.send_text(json.dumps(payload, ensure_ascii=False))
    except Exception:
        pass


async def _close_quiet(ws: WebSocket, code: int) -> None:
    try:
        await ws.close(code=code)
    except Exception:
        pass


def install_hosts(app) -> None:
    """Sirve las páginas en «/» cuando el túnel publique los subdominios.

    doganiero-vr-search.softportweb.com/ → vr-search.html
    doganiero-vr-send.softportweb.com/   → vr-send.html
    El resto de rutas (/api/…, /static/…) siguen igual en esos hosts.
    """

    @app.middleware("http")
    async def vr_link_hosts(request: Request, call_next):
        if request.method in ("GET", "HEAD"):
            host = (request.headers.get("host") or "").split(":")[0].strip().lower()
            if host.startswith(_HOST_SEARCH) or host.startswith(_HOST_SEND):
                path = request.url.path
                if path in ("/", "/index.html"):
                    page = "vr-search.html" if host.startswith(_HOST_SEARCH) else "vr-send.html"
                    return FileResponse(_APP_DIR / page, media_type="text/html; charset=utf-8", headers=_NO_CACHE)
                if path == "/favicon.ico":
                    return Response(status_code=204)
        return await call_next(request)

    return None

