"""DoganieroBook — retransmisiones en directo (máx. 40 min).

WebRTC uno-a-muchos con señalización por WebSocket:
  - El emisor crea un RTCPeerConnection por espectador.
  - El servidor solo reenvía señales y, si WebRTC no conecta, hace de relé
    (fotogramas JPEG + audio PCM) para los espectadores que lo pidan.
  - El límite de 40 minutos se aplica en el servidor: un vigilante cierra el
    directo para todos al llegar a 40:00 y rechaza cualquier mensaje posterior.
Estado solo en memoria (no se guarda grabación).
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections import deque
from typing import Any, Callable

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect

LIVE_MAX_SEC = 40 * 60
BROADCASTER_GRACE_SEC = 30
MAX_TITLE = 100
MAX_SIGNAL_BYTES = 200_000
MAX_FRAME_B64 = 120_000
MAX_PCM_B64 = 40_000
CHAT_MAX_LEN = 200
CHAT_HISTORY = 50
CHAT_MIN_INTERVAL_SEC = 1.0
CHAT_ARCHIVE_MAX = 3000          # mensajes guardados por Direct™ para copiarlos al vídeo
CHAT_ARCHIVE_TTL_SEC = 6 * 3600  # el chat de un Direct™ terminado se guarda 6 h en memoria


class _Conn:
    __slots__ = ("cid", "ws", "uid", "name", "avatar", "lock", "watching", "relay")

    def __init__(self, ws: WebSocket, uid: int, name: str, avatar: str):
        self.cid = uuid.uuid4().hex[:16]
        self.ws = ws
        self.uid = uid
        self.name = name
        self.avatar = avatar
        self.lock = asyncio.Lock()
        self.watching: str | None = None
        self.relay = False


class _Live:
    def __init__(self, uid: int, title: str, meta: dict[str, Any], host: _Conn, source: str):
        self.id = uuid.uuid4().hex[:12]
        self.uid = uid
        self.title = title
        self.meta = meta
        self.host: _Conn | None = host
        self.host_lost_at: float | None = None
        self.source = source
        self.started_at = time.time()
        self.viewers: dict[str, _Conn] = {}
        self.peak = 0
        self.ended = False
        # Chat del directo: solo en memoria, últimos 50 mensajes, se borra al terminar.
        self.chat: deque[dict[str, Any]] = deque(maxlen=CHAT_HISTORY)
        self.chat_seq = 0
        self.joined_uids: set[int] = set()
        # «Me gusta» del Direct™ (solo en memoria mientras dura): ids de usuario
        self.likes: set[int] = set()
        # Todo el chat (no solo los últimos 50) para guardarlo con el vídeo del Direct™
        self.chat_all: list[dict[str, Any]] = []

    def elapsed(self) -> float:
        return max(0.0, time.time() - self.started_at)

    def public(self) -> dict[str, Any]:
        el = self.elapsed()
        return {
            "id": self.id,
            "userId": self.uid,
            "title": self.title,
            "handle": self.meta.get("handle"),
            "channelTitle": self.meta.get("channelTitle"),
            "name": self.meta.get("name"),
            "avatar": self.meta.get("avatar"),
            "photoUrl": self.meta.get("photoUrl"),
            "source": self.source,
            "startedAt": self.started_at,
            "elapsedSec": round(el, 1),
            "remainingSec": round(max(0.0, LIVE_MAX_SEC - el), 1),
            "maxSec": LIVE_MAX_SEC,
            "viewers": len(self.viewers),
            "hostOnline": self.host is not None,
            "likes": len(self.likes),
        }


class BookLiveHub:
    def __init__(self, user_from_session: Callable[[str | None], Any], cookie_name: str, db: Any):
        self.user_from_session = user_from_session
        self.cookie_name = cookie_name
        self.db = db
        self.conns: dict[str, _Conn] = {}
        self.lives: dict[str, _Live] = {}
        self._watchdog: asyncio.Task | None = None
        # Aviso de "directo nuevo" (lo conecta main.py). Solo se llama en un directo NUEVO,
        # nunca al reanudar/reconectar el mismo directo.
        self.on_live_start: Callable[..., Any] | None = None
        self._bg_tasks: set[asyncio.Task] = set()
        self.chat_min_interval = CHAT_MIN_INTERVAL_SEC
        self.chat_last: dict[int, float] = {}
        self.like_last: dict[int, float] = {}
        self.chat_archive: dict[str, dict[str, Any]] = {}

    async def chat_broadcast(self, lv: "_Live", message: dict[str, Any]) -> None:
        payload = {"type": "live_chat", "liveId": lv.id, "message": message}
        targets = list(lv.viewers.values()) + ([lv.host] if lv.host else [])
        await asyncio.gather(*(self.send(t, payload) for t in targets), return_exceptions=True)

    async def chat_system(self, lv: "_Live", text: str) -> None:
        lv.chat_seq += 1
        await self.chat_broadcast(lv, {"id": lv.chat_seq, "system": True, "text": text[:160], "ts": time.time()})

    def _fire_live_start(self, lv: "_Live", c: "_Conn") -> None:
        cb = self.on_live_start
        if cb is None:
            return

        async def _run() -> None:
            try:
                await cb(uid=lv.uid, name=c.name, avatar=c.avatar, title=lv.title,
                         live_id=lv.id, meta=dict(lv.meta))
            except Exception:
                pass

        try:
            task = asyncio.create_task(_run())
            self._bg_tasks.add(task)
            task.add_done_callback(self._bg_tasks.discard)
        except Exception:
            pass

    # ---------- helpers ----------
    async def send(self, c: _Conn | None, payload: dict[str, Any]) -> bool:
        if c is None:
            return False
        try:
            data = json.dumps(payload, ensure_ascii=False)
            async with c.lock:
                await asyncio.wait_for(c.ws.send_text(data), timeout=8)
            return True
        except Exception:
            return False

    def lives_payload(self) -> list[dict[str, Any]]:
        return [lv.public() for lv in sorted(self.lives.values(), key=lambda x: -x.started_at) if not lv.ended]

    async def broadcast_lives(self) -> None:
        payload = {"type": "lives", "lives": self.lives_payload(), "serverNow": time.time()}
        await asyncio.gather(*(self.send(c, payload) for c in list(self.conns.values())), return_exceptions=True)

    async def broadcast_all(self, payload: dict[str, Any]) -> None:
        """Aviso a todos los que tienen DoganieroBook abierto (p. ej. publicación eliminada)."""
        await asyncio.gather(*(self.send(c, payload) for c in list(self.conns.values())), return_exceptions=True)

    def take_chat_archive(self, live_id: str, uid: int) -> list[dict[str, Any]] | None:
        """Chat de un Direct™ terminado (solo para su anfitrión, una sola vez)."""
        key = str(live_id or "")
        a = self.chat_archive.get(key)
        if not a or int(a.get("uid") or 0) != int(uid):
            return None
        self.chat_archive.pop(key, None)
        return list(a.get("chat") or [])

    def live_of_host_uid(self, uid: int) -> _Live | None:
        for lv in self.lives.values():
            if lv.uid == uid and not lv.ended:
                return lv
        return None

    async def relay_count_to_host(self, lv: _Live) -> None:
        n = sum(1 for v in lv.viewers.values() if v.relay)
        await self.send(lv.host, {"type": "relay_count", "liveId": lv.id, "count": n})

    def ensure_watchdog(self) -> None:
        if self._watchdog is None or self._watchdog.done():
            self._watchdog = asyncio.create_task(self._watch())

    async def _watch(self) -> None:
        tick = 0
        while True:
            await asyncio.sleep(1.0)
            tick += 1
            now = time.time()
            for lv in list(self.lives.values()):
                if lv.ended:
                    continue
                if now - lv.started_at >= LIVE_MAX_SEC:
                    await self.end_live(lv, "limit")
                elif lv.host is None and lv.host_lost_at and now - lv.host_lost_at >= BROADCASTER_GRACE_SEC:
                    await self.end_live(lv, "disconnect")
            if tick % 15 == 0 and self.lives:
                await self.broadcast_lives()
            if not self.conns and not self.lives:
                self._watchdog = None
                return

    async def end_live(self, lv: _Live, reason: str) -> None:
        if lv.ended:
            return
        lv.ended = True
        dur = int(min(LIVE_MAX_SEC, lv.elapsed()))
        payload = {
            "type": "live_ended",
            "liveId": lv.id,
            "reason": reason,
            "durationSec": dur,
            "peakViewers": lv.peak,
            "title": lv.title,
        }
        targets = list(lv.viewers.values()) + ([lv.host] if lv.host else [])
        for v in lv.viewers.values():
            if v.watching == lv.id:
                v.watching = None
                v.relay = False
        lv.viewers.clear()
        try:
            now_a = time.time()
            for k in [k for k, v in self.chat_archive.items()
                      if now_a - float(v.get("ended_at") or 0) > CHAT_ARCHIVE_TTL_SEC]:
                self.chat_archive.pop(k, None)
            self.chat_archive[lv.id] = {"uid": lv.uid, "title": lv.title, "ended_at": now_a,
                                        "chat": list(lv.chat_all)}
        except Exception:
            pass
        lv.chat.clear()
        self.lives.pop(lv.id, None)
        await asyncio.gather(*(self.send(c, payload) for c in targets), return_exceptions=True)
        await self.broadcast_lives()

    async def leave_viewer(self, c: _Conn) -> None:
        lid = c.watching
        c.watching = None
        c.relay = False
        if not lid:
            return
        lv = self.lives.get(lid)
        if not lv:
            return
        if lv.viewers.pop(c.cid, None) is not None:
            await self.send(lv.host, {"type": "viewer_leave", "liveId": lv.id, "viewerId": c.cid, "viewers": len(lv.viewers)})
            await self.relay_count_to_host(lv)
            await self.broadcast_lives()

    def _meta_for(self, uid: int, name: str, avatar: str) -> dict[str, Any]:
        ch = None
        try:
            ch = self.db.book_get_channel_by_user(uid)
        except Exception:
            ch = None
        return {
            "handle": (ch or {}).get("handle"),
            "channelTitle": (ch or {}).get("title"),
            "photoUrl": (ch or {}).get("photoUrl"),
            "name": name,
            "avatar": avatar,
        }

    def has_channel(self, uid: int) -> bool:
        try:
            return bool(self.db.book_get_channel_by_user(int(uid)))
        except Exception:
            return False

    async def reject_no_channel(self, c: _Conn) -> None:
        await self.send(c, {"type": "live_error", "code": "no_channel",
                            "detail": "Para hacer un Direct™ necesitas tener un canal"})

    # ---------- message handling ----------
    async def handle(self, c: _Conn, msg: dict[str, Any]) -> None:
        t = msg.get("type")
        if t == "ping":
            await self.send(c, {"type": "pong", "t": msg.get("t"), "serverNow": time.time()})
            return

        if t == "live_start":
            # Solo quien tiene canal en DoganieroBook puede hacer un Direct™ (ver y chatear: todos)
            if not self.has_channel(c.uid):
                await self.reject_no_channel(c)
                return
            existing = self.live_of_host_uid(c.uid)
            if existing:
                if existing.host is None or existing.host is c:
                    existing.host = c
                    existing.host_lost_at = None
                    await self.send(c, {"type": "live_started", "live": existing.public(), "resumed": True,
                                        "viewerIds": list(existing.viewers.keys()), "chat": list(existing.chat)})
                    return
                await self.send(c, {"type": "live_error", "detail": "Ya tienes un Direct™ abierto en otro dispositivo"})
                return
            title = str(msg.get("title") or "").strip()[:MAX_TITLE] or f"Direct™ de {c.name}"
            source = "screen" if msg.get("source") == "screen" else "camera"
            lv = _Live(c.uid, title, self._meta_for(c.uid, c.name, c.avatar), c, source)
            self.lives[lv.id] = lv
            if c.watching:
                await self.leave_viewer(c)
            await self.send(c, {"type": "live_started", "live": lv.public(), "resumed": False, "viewerIds": []})
            await self.broadcast_lives()
            self._fire_live_start(lv, c)
            return

        if t == "live_resume":
            if not self.has_channel(c.uid):
                await self.reject_no_channel(c)
                return
            lv = self.lives.get(str(msg.get("liveId") or ""))
            if not lv or lv.ended or lv.uid != c.uid:
                await self.send(c, {"type": "live_ended", "liveId": msg.get("liveId"), "reason": "gone", "durationSec": 0})
                return
            if lv.host is not None and lv.host is not c:
                # La conexión anterior sigue viva (p. ej. reconexión rápida): la sustituimos.
                pass
            lv.host = c
            lv.host_lost_at = None
            await self.send(c, {"type": "live_started", "live": lv.public(), "resumed": True,
                                "viewerIds": list(lv.viewers.keys()), "chat": list(lv.chat),
                                "liked": c.uid in lv.likes})
            await self.relay_count_to_host(lv)
            await self.broadcast_lives()
            return

        if t == "live_end":
            lv = self.lives.get(str(msg.get("liveId") or "")) or self.live_of_host_uid(c.uid)
            if lv and lv.uid == c.uid:
                await self.end_live(lv, "host")
            return

        if t == "live_source":
            lv = self.lives.get(str(msg.get("liveId") or ""))
            if lv and lv.host is c:
                lv.source = "screen" if msg.get("source") == "screen" else "camera"
                await self.broadcast_lives()
            return

        if t == "live_join":
            lv = self.lives.get(str(msg.get("liveId") or ""))
            if not lv or lv.ended:
                await self.send(c, {"type": "live_ended", "liveId": msg.get("liveId"), "reason": "gone", "durationSec": 0})
                return
            if lv.host is c:
                return
            if c.watching and c.watching != lv.id:
                await self.leave_viewer(c)
            c.watching = lv.id
            c.relay = False
            lv.viewers[c.cid] = c
            lv.peak = max(lv.peak, len(lv.viewers))
            await self.send(c, {"type": "live_joined", "live": lv.public(), "viewerId": c.cid,
                                "chat": list(lv.chat), "liked": c.uid in lv.likes})
            await self.send(lv.host, {"type": "viewer_join", "liveId": lv.id, "viewerId": c.cid,
                                      "name": c.name, "viewers": len(lv.viewers)})
            await self.broadcast_lives()
            if c.uid != lv.uid and c.uid not in lv.joined_uids:
                lv.joined_uids.add(c.uid)
                await self.chat_system(lv, f"👋 {c.name} se ha unido")
            return

        if t == "live_chat":
            lid = str(msg.get("liveId") or "")
            lv = self.lives.get(lid)
            if not lv or lv.ended:
                await self.send(c, {"type": "live_chat_error", "liveId": lid, "detail": "El Direct™ ya no está disponible"})
                return
            if not (lv.host is c or c.cid in lv.viewers):
                await self.send(c, {"type": "live_chat_error", "liveId": lid, "detail": "Entra en el Direct™ para escribir"})
                return
            raw_text = msg.get("text")
            text = " ".join(str(raw_text if isinstance(raw_text, str) else "").split())
            if not text:
                await self.send(c, {"type": "live_chat_error", "liveId": lid, "detail": "Escribe un mensaje"})
                return
            if len(text) > CHAT_MAX_LEN:
                await self.send(c, {"type": "live_chat_error", "liveId": lid, "detail": f"Máximo {CHAT_MAX_LEN} caracteres"})
                return
            now = time.time()
            if now - self.chat_last.get(c.uid, 0.0) < self.chat_min_interval:
                await self.send(c, {"type": "live_chat_error", "liveId": lid, "detail": "Espera un segundo entre mensajes"})
                return
            self.chat_last[c.uid] = now
            av = str(c.avatar or "")
            photo = av if av.startswith("/api/avatars/") else None
            lv.chat_seq += 1
            item = {
                "id": lv.chat_seq,
                "userId": c.uid,
                "name": c.name[:60],
                "photo": photo,
                "emoji": None if photo else (av[:16] or "👤"),
                "text": text,
                "ts": now,
                "host": c.uid == lv.uid,
            }
            lv.chat.append(item)
            if len(lv.chat_all) < CHAT_ARCHIVE_MAX:
                lv.chat_all.append(item)
            await self.chat_broadcast(lv, item)
            return

        if t == "live_like":
            lv = self.lives.get(str(msg.get("liveId") or ""))
            if not lv or lv.ended:
                return
            if not (lv.host is c or c.cid in lv.viewers):
                return
            now = time.time()
            if now - self.like_last.get(c.uid, 0.0) < 0.3:
                await self.send(c, {"type": "live_likes", "liveId": lv.id, "count": len(lv.likes),
                                    "liked": c.uid in lv.likes})
                return
            self.like_last[c.uid] = now
            if bool(msg.get("on", True)):
                lv.likes.add(c.uid)
            else:
                lv.likes.discard(c.uid)
            n = len(lv.likes)
            await asyncio.gather(*(self.send(x, {"type": "live_likes", "liveId": lv.id, "count": n,
                                                 "liked": x.uid in lv.likes})
                                   for x in list(self.conns.values())), return_exceptions=True)
            return

        if t == "live_leave":
            await self.leave_viewer(c)
            return

        if t == "live_signal":
            lv = self.lives.get(str(msg.get("liveId") or ""))
            if not lv or lv.ended:
                return
            sig = msg.get("signal")
            try:
                if len(json.dumps(sig)) > MAX_SIGNAL_BYTES:
                    return
            except Exception:
                return
            if lv.host is c:
                v = lv.viewers.get(str(msg.get("to") or ""))
                if v:
                    await self.send(v, {"type": "live_signal", "liveId": lv.id, "from": "host", "signal": sig})
            elif c.cid in lv.viewers:
                await self.send(lv.host, {"type": "live_signal", "liveId": lv.id, "from": c.cid, "signal": sig})
            return

        if t == "live_relay":
            lv = self.lives.get(str(msg.get("liveId") or ""))
            if lv and c.cid in lv.viewers:
                c.relay = bool(msg.get("on", True))
                await self.relay_count_to_host(lv)
            return

        if t in ("live_frame", "live_pcm"):
            lv = self.lives.get(str(msg.get("liveId") or ""))
            if not lv or lv.ended or lv.host is not c:
                return
            if lv.elapsed() >= LIVE_MAX_SEC:
                await self.end_live(lv, "limit")
                return
            if t == "live_frame":
                data = msg.get("jpeg")
                if not isinstance(data, str) or len(data) > MAX_FRAME_B64:
                    return
                out = {"type": "live_frame", "liveId": lv.id, "jpeg": data}
            else:
                data = msg.get("pcm")
                if not isinstance(data, str) or len(data) > MAX_PCM_B64:
                    return
                out = {"type": "live_pcm", "liveId": lv.id, "pcm": data, "rate": int(msg.get("rate") or 16000)}
            # Relé sin bloquear al emisor: si un espectador va lento se descarta el paquete.
            for v in list(lv.viewers.values()):
                if v.relay and not v.lock.locked():
                    asyncio.create_task(self.send(v, out))
            return

    async def on_disconnect(self, c: _Conn) -> None:
        self.conns.pop(c.cid, None)
        try:
            await self.leave_viewer(c)
        except Exception:
            pass
        for lv in list(self.lives.values()):
            if lv.host is c:
                lv.host = None
                lv.host_lost_at = time.time()
                await self.broadcast_lives()

    async def websocket(self, websocket: WebSocket) -> None:
        await websocket.accept()
        user = self.user_from_session(websocket.cookies.get(self.cookie_name))
        if not user:
            try:
                await websocket.send_text(json.dumps({"type": "error", "detail": "No autenticado"}))
                await websocket.close(code=4401)
            except Exception:
                pass
            return
        uid = int(user["id"])
        c = _Conn(websocket, uid, str(user["name"] or user["email"] or "Perfil"), str(user["avatar"] or "👤"))
        self.conns[c.cid] = c
        self.ensure_watchdog()
        try:
            mine = self.live_of_host_uid(uid)
            await self.send(c, {
                "type": "hello",
                "connId": c.cid,
                "you": {"id": uid, "name": c.name, "avatar": c.avatar},
                "lives": self.lives_payload(),
                "myLiveId": mine.id if mine else None,
                "hasChannel": self.has_channel(uid),
                "maxSec": LIVE_MAX_SEC,
                "serverNow": time.time(),
            })
            while True:
                raw = await websocket.receive_text()
                if len(raw) > 400_000:
                    continue
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue
                if not isinstance(msg, dict):
                    continue
                try:
                    await self.handle(c, msg)
                except Exception:
                    pass
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            await self.on_disconnect(c)


def register(app: FastAPI, user_from_session: Callable[[str | None], Any], cookie_name: str, db: Any,
             on_live_start: Callable[..., Any] | None = None) -> BookLiveHub:
    hub = BookLiveHub(user_from_session, cookie_name, db)
    hub.on_live_start = on_live_start

    @app.websocket("/api/book/live/ws")
    async def book_live_ws(websocket: WebSocket):
        await hub.websocket(websocket)

    @app.get("/api/book/live")
    def book_live_list(request: Request):
        if not user_from_session(request.cookies.get(cookie_name)):
            raise HTTPException(status_code=401, detail="No autenticado")
        return {"lives": hub.lives_payload(), "maxSec": LIVE_MAX_SEC, "serverNow": time.time()}

    app.state.book_live_hub = hub
    return hub
