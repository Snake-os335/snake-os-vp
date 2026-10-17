"""Snake Racing — sala multijugador en tiempo real (WebSocket).

El servidor NO simula física: cada cliente simula su propio coche y envía su
estado (~25 Hz); el anfitrión simula además los coches IA que rellenan huecos.
El servidor gestiona la sala (lobby, listos, cuenta atrás, resultados) y
retransmite los estados agrupados a 20 Hz.
"""
from __future__ import annotations

import asyncio
import itertools
import json
import time
from typing import Any

MAX_PLAYERS = 6          # parrilla total (humanos + IA)
DEFAULT_LAPS = 3
COUNTDOWN_MS = 4000
TICK_HZ = 20             # retransmisión de estados
FINISH_GRACE_SEC = 45    # tras el primer humano en meta, tiempo máximo para el resto
COLORS = ("#ff3b30", "#0a84ff", "#ffd60a", "#30d158", "#bf5af2", "#ff9f0a")
AI_NAMES = ("Vega", "Kato", "Rossi", "Nadia", "Blitz", "Iris")

_ids = itertools.count(1)


class SnakeRacingHub:
    def __init__(self) -> None:
        self.players: dict[Any, dict[str, Any]] = {}   # ws -> player
        self.order: list[Any] = []                     # orden de llegada (host = primero)
        self.phase = "lobby"                           # lobby | countdown | race | results
        self.laps = DEFAULT_LAPS
        self.diff = 1
        self.grid: list[dict[str, Any]] = []
        self.states: dict[str, list] = {}
        self.ai_states: list = []
        self.finishes: dict[str, dict[str, Any]] = {}
        self.first_finish_at: float | None = None
        self.race_id = 0
        self._tick_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    # ---------- helpers ----------
    def _host_ws(self):
        return self.order[0] if self.order else None

    def _pub(self, p: dict[str, Any]) -> dict[str, Any]:
        return {"id": p["id"], "name": p["name"], "color": p["color"], "ready": p["ready"],
                "inRace": p.get("in_race", False)}

    def _lobby_payload(self) -> dict[str, Any]:
        host = self._host_ws()
        return {
            "type": "lobby",
            "phase": self.phase,
            "host": self.players[host]["id"] if host in self.players else None,
            "laps": self.laps,
            "diff": self.diff,
            "max": MAX_PLAYERS,
            "players": [self._pub(self.players[w]) for w in self.order if w in self.players],
        }

    def _free_color(self) -> str:
        used = {p["color"] for p in self.players.values()}
        for c in COLORS:
            if c not in used:
                return c
        return COLORS[len(self.players) % len(COLORS)]

    async def _send(self, ws: Any, payload: dict[str, Any]) -> None:
        try:
            await ws.send_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        except Exception:
            pass

    async def _broadcast(self, payload: dict[str, Any], exclude: Any = None) -> None:
        txt = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        for ws in list(self.players):
            if ws is exclude:
                continue
            try:
                await ws.send_text(txt)
            except Exception:
                pass

    # ---------- conexión ----------
    async def connect(self, ws: Any, email: str, name: str, kid_friends: set[str] | None = None) -> None:
        # Snake OS Kids (modo «solo amigos»): si entra alguien que no es amigo aprobado, el niño sale de la sala.
        for kws, kp in list(self.players.items()):
            kf = kp.get("kid_friends")
            if kf is not None and email not in kf:
                try:
                    await self._send(kws, {"type": "error", "detail": "Snake OS Kids: ha entrado un piloto que no es amigo aprobado"})
                    await kws.close(code=4403)
                except Exception:
                    pass
        if len(self.players) >= MAX_PLAYERS:
            await self._send(ws, {"type": "error", "detail": "Sala llena"})
            return
        same = sum(1 for p in self.players.values() if p["email"] == email)
        disp = (name or "Piloto")[:18] + (f" ({same + 1})" if same else "")
        p = {"id": f"p{next(_ids)}", "email": email, "name": disp, "color": self._free_color(),
             "ready": False, "in_race": False}
        if kid_friends is not None:
            p["kid_friends"] = set(kid_friends)
        self.players[ws] = p
        self.order.append(ws)
        await self._send(ws, {"type": "welcome", "you": p["id"], "color": p["color"], "name": disp})
        await self._broadcast({"type": "toast", "kind": "join", "name": disp, "color": p["color"]}, exclude=ws)
        await self._broadcast(self._lobby_payload())
        if self.phase in ("countdown", "race"):
            await self._send(ws, {"type": "info", "detail": "Carrera en curso: entrarás en la siguiente."})

    async def disconnect(self, ws: Any) -> None:
        p = self.players.pop(ws, None)
        if ws in self.order:
            self.order.remove(ws)
        if not p:
            return
        self.states.pop(p["id"], None)
        await self._broadcast({"type": "toast", "kind": "leave", "name": p["name"], "color": p["color"]})
        if self.phase in ("countdown", "race"):
            await self._broadcast({"type": "gone", "id": p["id"]})
            await self._check_race_end()
        if not self.players:
            self._reset_room()
        else:
            await self._broadcast(self._lobby_payload())
            await self._maybe_autostart()

    def _reset_room(self) -> None:
        self.phase = "lobby"
        self.grid = []
        self.states = {}
        self.ai_states = []
        self.finishes = {}
        self.first_finish_at = None

    # ---------- mensajes ----------
    async def handle(self, ws: Any, msg: dict[str, Any]) -> None:
        p = self.players.get(ws)
        if not p:
            return
        t = msg.get("type")
        if t == "state":
            if self.phase in ("countdown", "race") and p.get("in_race"):
                s = msg.get("s")
                if isinstance(s, list) and len(s) <= 12:
                    self.states[p["id"]] = s
                ai = msg.get("ai")
                if ws is self._host_ws() and isinstance(ai, list) and len(ai) <= MAX_PLAYERS:
                    self.ai_states = ai
        elif t == "ready":
            if self.phase == "lobby":
                p["ready"] = bool(msg.get("ready", True))
                await self._broadcast(self._lobby_payload())
                await self._maybe_autostart()
        elif t == "start":
            if self.phase == "lobby" and ws is self._host_ws():
                await self._start_countdown()
        elif t == "config":
            if self.phase == "lobby" and ws is self._host_ws():
                try:
                    self.laps = max(1, min(9, int(msg.get("laps", self.laps))))
                    self.diff = max(0, min(2, int(msg.get("diff", self.diff))))
                except (TypeError, ValueError):
                    pass
                await self._broadcast(self._lobby_payload())
        elif t == "finish":
            if self.phase == "race" and p.get("in_race") and p["id"] not in self.finishes:
                self.finishes[p["id"]] = {"id": p["id"], "t": float(msg.get("t") or 0),
                                          "best": msg.get("best")}
                if self.first_finish_at is None:
                    self.first_finish_at = time.monotonic()
                await self._broadcast({"type": "finished", "id": p["id"], "t": self.finishes[p["id"]]["t"]})
                await self._check_race_end()
        elif t == "ai_finish":
            if self.phase == "race" and ws is self._host_ws():
                aid = str(msg.get("id"))
                if aid.startswith("ai") and aid not in self.finishes:
                    self.finishes[aid] = {"id": aid, "t": float(msg.get("t") or 0), "best": msg.get("best")}
        elif t == "chat":
            txt = str(msg.get("text") or "")[:120].strip()
            if txt:
                await self._broadcast({"type": "toast", "kind": "chat", "name": p["name"], "color": p["color"], "text": txt})

    async def _maybe_autostart(self) -> None:
        if self.phase != "lobby" or not self.players:
            return
        if all(p["ready"] for p in self.players.values()) and len(self.players) >= 1:
            await self._start_countdown()

    async def _start_countdown(self) -> None:
        async with self._lock:
            if self.phase != "lobby":
                return
            self.race_id += 1
            humans = [self.players[w] for w in self.order if w in self.players]
            grid = []
            for p in humans:
                p["in_race"] = True
                grid.append({"id": p["id"], "name": p["name"], "color": p["color"], "ai": False})
            used = {g["color"] for g in grid}
            free = [c for c in COLORS if c not in used]
            for i in range(MAX_PLAYERS - len(grid)):
                grid.append({"id": f"ai{i}", "name": AI_NAMES[i], "color": free[i % len(free)] if free else COLORS[i], "ai": True})
            # humanos detrás (los IA salen delante para dar emoción)
            self.grid = [g for g in grid if g["ai"]] + [g for g in grid if not g["ai"]]
            self.states = {}
            self.ai_states = []
            self.finishes = {}
            self.first_finish_at = None
            self.phase = "countdown"
            host = self._host_ws()
            await self._broadcast({
                "type": "countdown", "raceId": self.race_id, "inMs": COUNTDOWN_MS, "laps": self.laps,
                "diff": self.diff, "grid": self.grid,
                "aiHost": self.players[host]["id"] if host in self.players else None,
            })
            await self._broadcast(self._lobby_payload())
        self._ensure_tick()
        rid = self.race_id

        async def go() -> None:
            await asyncio.sleep(COUNTDOWN_MS / 1000)
            if self.race_id == rid and self.phase == "countdown":
                self.phase = "race"
                await self._broadcast(self._lobby_payload())
        asyncio.create_task(go())

    async def _check_race_end(self) -> None:
        if self.phase != "race":
            return
        racers = [p for p in self.players.values() if p.get("in_race")]
        all_done = all(p["id"] in self.finishes for p in racers)
        timeout = self.first_finish_at is not None and time.monotonic() - self.first_finish_at > FINISH_GRACE_SEC
        if all_done or timeout or not racers:
            await self._end_race()

    async def _end_race(self) -> None:
        self.phase = "results"
        names = {g["id"]: g for g in self.grid}
        done = sorted(self.finishes.values(), key=lambda f: f["t"])
        rows = []
        for f in done:
            g = names.get(f["id"], {})
            rows.append({"id": f["id"], "name": g.get("name", "?"), "color": g.get("color", "#888"),
                         "t": f["t"], "best": f.get("best"), "ai": g.get("ai", False)})
        for g in self.grid:
            if g["id"] not in self.finishes:
                rows.append({"id": g["id"], "name": g["name"], "color": g["color"], "t": None, "best": None, "ai": g["ai"]})
        await self._broadcast({"type": "results", "raceId": self.race_id, "rows": rows})
        for p in self.players.values():
            p["ready"] = False
            p["in_race"] = False
        self.phase = "lobby"
        await self._broadcast(self._lobby_payload())

    # ---------- retransmisión ----------
    def _ensure_tick(self) -> None:
        if self._tick_task is None or self._tick_task.done():
            self._tick_task = asyncio.create_task(self._tick_loop())

    async def _tick_loop(self) -> None:
        while self.phase in ("countdown", "race") and self.players:
            await asyncio.sleep(1 / TICK_HZ)
            if self.states or self.ai_states:
                await self._broadcast({"type": "states", "t": int(time.time() * 1000),
                                       "p": self.states, "ai": self.ai_states})
            if self.phase == "race":
                await self._check_race_end()


racing_hub = SnakeRacingHub()
