"""Snake Racing — salas multijugador en tiempo real (WebSocket)."""
from __future__ import annotations

import asyncio
import json
import math
import random
import time
from typing import Any

MAX_PLAYERS = 8
LAPS = 3.0
TICK_HZ = 12
TRACK_LEN = 1.0  # una vuelta = 1.0 unidades de progreso

COLORS = (
    "#34d17a",
    "#ff6b6b",
    "#4cc9f0",
    "#ffd23f",
    "#c77dff",
    "#ff8a3d",
    "#5dff9a",
    "#ff4d6d",
)


def _player_public(p: dict[str, Any]) -> dict[str, Any]:
    return {
        "email": p["email"],
        "name": p["name"],
        "color": p["color"],
        "progress": round(float(p.get("progress") or 0), 4),
        "lane": round(float(p.get("lane") or 0), 3),
        "speed": round(float(p.get("speed") or 0), 3),
        "finished": bool(p.get("finished")),
        "place": p.get("place"),
    }


class SnakeRacingHub:
    """Una sala global: quien juega se encuentra con el resto online."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._room: dict[str, Any] = self._fresh_room()
        self._sockets: dict[Any, dict[str, Any]] = {}
        self._tick_task: asyncio.Task | None = None

    def _fresh_room(self) -> dict[str, Any]:
        return {
            "status": "lobby",
            "countdown": 0,
            "countdown_until": 0.0,
            "started_at": 0.0,
            "results_until": 0.0,
            "players": {},
            "order": [],
            "winner": None,
        }

    def _race_public(self) -> dict[str, Any]:
        r = self._room
        players = [_player_public(r["players"][e]) for e in r["order"] if e in r["players"]]
        return {
            "status": r["status"],
            "countdown": int(r.get("countdown") or 0),
            "laps": LAPS,
            "players": players,
            "winner": r.get("winner"),
        }

    async def connect(
        self,
        ws: Any,
        email: str,
        name: str,
    ) -> None:
        email = email.strip().lower()
        async with self._lock:
            if len(self._room["order"]) >= MAX_PLAYERS and email not in self._room["players"]:
                await ws.send_text(
                    json.dumps(
                        {"type": "error", "detail": "La pista está llena. Intenta en un momento."},
                        ensure_ascii=False,
                    )
                )
                return
            if email not in self._room["players"]:
                idx = len(self._room["order"])
                self._room["order"].append(email)
                self._room["players"][email] = {
                    "email": email,
                    "name": name or email.split("@")[0],
                    "color": COLORS[idx % len(COLORS)],
                    "progress": 0.0,
                    "lane": random.uniform(-0.35, 0.35),
                    "speed": 0.0,
                    "steer": 0.0,
                    "accel": False,
                    "finished": False,
                    "place": None,
                }
            self._sockets[ws] = {"email": email, "name": name}
        await ws.send_text(
            json.dumps(
                {
                    "type": "welcome",
                    "you": email,
                    "race": self._race_public(),
                },
                ensure_ascii=False,
            )
        )
        await self._broadcast({"type": "join", "player": _player_public(self._room["players"][email])})
        self._ensure_tick()

    async def disconnect(self, ws: Any) -> None:
        async with self._lock:
            meta = self._sockets.pop(ws, None)
            if not meta:
                return
            email = meta["email"]
            self._room["players"].pop(email, None)
            if email in self._room["order"]:
                self._room["order"] = [e for e in self._room["order"] if e != email]
            if self._room["status"] == "racing" and len(self._room["order"]) < 2:
                self._room["status"] = "lobby"
                self._room["countdown"] = 0
        await self._broadcast({"type": "leave", "email": email})
        await self._broadcast_state()

    async def handle(self, ws: Any, msg: dict[str, Any]) -> None:
        mtype = msg.get("type")
        if mtype == "ping":
            await ws.send_text(json.dumps({"type": "pong", "t": msg.get("t")}))
            return
        meta = self._sockets.get(ws)
        if not meta:
            return
        email = meta["email"]
        if mtype == "input":
            async with self._lock:
                p = self._room["players"].get(email)
                if not p or p.get("finished"):
                    return
                steer = msg.get("steer")
                if steer not in (-1, 0, 1):
                    steer = 0
                p["steer"] = int(steer)
                p["accel"] = bool(msg.get("accel"))
            return
        if mtype == "start":
            await self._try_start_countdown()
            return

    async def _try_start_countdown(self) -> None:
        async with self._lock:
            if self._room["status"] not in ("lobby", "results"):
                return
            if len(self._room["order"]) < 1:
                return
            now = time.time()
            self._room["status"] = "countdown"
            self._room["countdown"] = 3
            self._room["countdown_until"] = now + 1.0
            for email in self._room["order"]:
                pl = self._room["players"].get(email)
                if not pl:
                    continue
                pl["progress"] = 0.0
                pl["lane"] = random.uniform(-0.35, 0.35)
                pl["speed"] = 0.0
                pl["steer"] = 0
                pl["accel"] = False
                pl["finished"] = False
                pl["place"] = None
            self._room["winner"] = None
            self._room["results_until"] = 0.0
        await self._broadcast_state()

    def _ensure_tick(self) -> None:
        if self._tick_task and not self._tick_task.done():
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._tick_task = loop.create_task(self._tick_loop())

    async def _tick_loop(self) -> None:
        dt = 1.0 / TICK_HZ
        try:
            while True:
                await asyncio.sleep(dt)
                if not self._sockets:
                    continue
                changed = await self._tick_once(dt)
                if changed:
                    await self._broadcast_state()
        except asyncio.CancelledError:
            return

    async def _tick_once(self, dt: float) -> bool:
        now = time.time()
        async with self._lock:
            st = self._room["status"]
            if st == "countdown":
                if now >= float(self._room.get("countdown_until") or 0):
                    cd = int(self._room.get("countdown") or 0)
                    if cd <= 1:
                        self._room["status"] = "racing"
                        self._room["started_at"] = now
                        self._room["countdown"] = 0
                        return True
                    self._room["countdown"] = cd - 1
                    self._room["countdown_until"] = now + 1.0
                return True
            if st == "results":
                if now >= float(self._room.get("results_until") or 0):
                    self._room = self._fresh_room()
                    # conservar jugadores conectados
                    for ws, meta in list(self._sockets.items()):
                        em = meta["email"]
                        self._room["order"].append(em)
                        self._room["players"][em] = {
                            "email": em,
                            "name": meta.get("name") or em.split("@")[0],
                            "color": COLORS[len(self._room["order"]) % len(COLORS)],
                            "progress": 0.0,
                            "lane": 0.0,
                            "speed": 0.0,
                            "steer": 0,
                            "accel": False,
                            "finished": False,
                            "place": None,
                        }
                return True
            if st != "racing":
                return False

            finished_count = 0
            place_next = sum(1 for e in self._room["order"] if self._room["players"].get(e, {}).get("place"))
            for email in self._room["order"]:
                p = self._room["players"].get(email)
                if not p or p.get("finished"):
                    if p and p.get("finished"):
                        finished_count += 1
                    continue
                lane = float(p.get("lane") or 0)
                lane += float(p.get("steer") or 0) * dt * 1.35
                lane = max(-1.0, min(1.0, lane))
                p["lane"] = lane
                speed = float(p.get("speed") or 0)
                if p.get("accel"):
                    speed += dt * 0.95
                else:
                    speed -= dt * 0.45
                speed = max(0.0, min(0.55, speed))
                curve_pen = abs(lane) * 0.08
                prog = float(p.get("progress") or 0) + speed * dt * (TRACK_LEN / LAPS) * (1.0 - curve_pen)
                p["speed"] = speed
                p["progress"] = prog
                if prog >= LAPS:
                    p["finished"] = True
                    place_next += 1
                    p["place"] = place_next
                    p["speed"] = 0.0
                    finished_count += 1

            active = len(self._room["order"])
            if active and finished_count >= active:
                self._room["status"] = "results"
                self._room["results_until"] = now + 8.0
                winner = None
                for email in self._room["order"]:
                    pl = self._room["players"].get(email)
                    if pl and pl.get("place") == 1:
                        winner = pl.get("name") or email
                        break
                self._room["winner"] = winner
                return True
            if now - float(self._room.get("started_at") or now) > 120.0:
                self._room["status"] = "results"
                self._room["results_until"] = now + 6.0
                self._room["winner"] = None
                return True
            return True
        return False

    async def _broadcast_state(self) -> None:
        payload = {"type": "state", "race": self._race_public(), "t": time.time()}
        await self._broadcast(payload)

    async def _broadcast(self, payload: dict[str, Any]) -> None:
        text = json.dumps(payload, ensure_ascii=False)
        dead: list[Any] = []
        for ws in list(self._sockets.keys()):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws)


racing_hub = SnakeRacingHub()
