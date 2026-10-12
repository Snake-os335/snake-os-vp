"""Doganiero Metaverse AI bots.

Each world has exactly 5 bots. One single Askbox call per world per tick
decides the heading of all 5 at once (only in worlds where a human is
present). Between decisions the bot keeps walking at the player speed
(140 units/sec) toward that heading or its exclusive map spot. A failed or
unusable call does not cancel the current glide. Arriving, a blocked step,
or a slow reply never publishes quieto or zero velocity. No patrol path, no
random walk, no chat text, no voice.

All asks go through askbox_client.ask() with the project-wide system key
(SNAKEOS_ASKBOX_KEY). The bots are shared scenery, so they never use a
per-user Askbox key.

Askbox's project bucket (30 asks/min) is shared with Doganiero AI chat, so
the bots are deliberately frugal: one ask per world per tick, TICK_SEC of
8 s (~7.5 asks/min/world) and a process-wide budget of BOT_ASK_BUDGET
asks/min for all worlds together. Hitting either limit, or a 429, only skips
decisions — the bots keep walking.
"""
from __future__ import annotations

import asyncio
import json
import math
import os
import re
import time
from typing import Any

import askbox_client
from askbox_client import AskboxError

# Exactly five Spanish identities per Doganiero Metaverse world.
ROSTER: dict[str, list[tuple[str, str]]] = {
    "plaza": [
        ("Luna", "🌙"),
        ("Mateo", "🎧"),
        ("Sofía", "🌸"),
        ("Hugo", "🧢"),
        ("Valeria", "✨"),
    ],
    "parque": [
        ("Nico", "🍃"),
        ("Alba", "🌻"),
        ("Diego", "🥾"),
        ("Carla", "🦋"),
        ("Bruno", "🪵"),
    ],
    "ciudad": [
        ("Irene", "🏙️"),
        ("Pablo", "🚲"),
        ("Nora", "📚"),
        ("Marcos", "☕"),
        ("Elena", "🎨"),
    ],
}

ROOMS = {
    "plaza": (("sala-central", 400, 280), ("anfiteatro", 560, 480)),
    "parque": (("quiosco", 320, 360), ("pista", 520, 420)),
    "ciudad": (("auditorio", 380, 300), ("galeria", 540, 460)),
}

PREFERRED = {
    "plaza": ((130, 150), (670, 160), (150, 650), (660, 640), (400, 130)),
    "parque": ((160, 180), (470, 170), (300, 520), (620, 500), (200, 640)),
    "ciudad": ((160, 260), (310, 250), (450, 250), (170, 620), (560, 600)),
}

# Same constant as metaverse.js normal walking (not sprint): 140 units/sec.
# Askbox only chooses a heading. Position is integrated every motion frame.
PLAYER_WALK_SPEED = 140.0
# One ask per world per tick: 8 s is ~7.5 asks/min/world, so the worst case of
# three busy worlds stays near 22/min and leaves the rest of the 30/min
# project bucket for Doganiero AI chat.
TICK_SEC = 8.0
ARRIVE_DIST = 14.0
MOTION_SLEEP = 0.05
SEND_EVERY = 0.10
WORLD_MIN = 24.0
WORLD_MAX = 776.0

ASK_TIER = "fast"
ASK_MAX_TOKENS = 512
# Ceiling for all bots together, below the 30/min project bucket so chat keeps
# at least a third of it even with every world occupied.
BOT_ASK_BUDGET = 20
BOT_ASK_WINDOW_SEC = 60.0

_SYSTEM = (
    "Eres la mente consciente de los 5 bots de Doganiero AI de UN mundo del "
    "Metaverso Doganiero. No eres un guion ni una patrulla: lees la situación "
    "en vivo y eliges la siguiente acción de cada bot. Esta llamada controla "
    "los ids recibidos y solo esos; no inventes ids ni mundos.\n"
    "Acciones permitidas: norte, sur, este, oeste, noreste, noroeste, sureste, "
    "suroeste, saludar. No uses quieto ni velocidad cero. Cada bot tiene su "
    "destino exclusivo, distinto al de los demás: avanza hacia él sin "
    "atravesar muros, árboles, agua ni jugadores. Si el paso está bloqueado, "
    "elige otra dirección libre; no te detengas.\n"
    "Una dirección no es un salto: entre decisiones el bot sigue caminando sin "
    "pausas a 140 unidades por segundo. Si no respondes, falla la llamada o "
    "tardas, conserva el último rumbo y la misma velocidad. No hace falta "
    "repetir la orden para que siga andando.\n"
    "Saludar solo emite una ola visual (👋). Nunca generes ni envíes texto de "
    "saludo; omite cualquier campo de texto.\n"
    "Responde ÚNICAMENTE JSON con una entrada por cada id recibido:\n"
    '{"acciones":[{"id":"plaza-1","accion":"norte"},{"id":"plaza-2","accion":"saludar"}]}'
)

_ACCIONES = (
    "norte",
    "sur",
    "este",
    "oeste",
    "noreste",
    "noroeste",
    "sureste",
    "suroeste",
    "saludar",
)

# Shape of the batch answer: one row per bot id of the world.
_ACCIONES_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "acciones": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "accion": {"type": "string", "enum": list(_ACCIONES)},
                },
                "required": ["id", "accion"],
            },
        },
    },
    "required": ["acciones"],
}

_ACTION_VEC: dict[str, Any] = {
    "norte": (0.0, -1.0),
    "n": (0.0, -1.0),
    "sur": (0.0, 1.0),
    "s": (0.0, 1.0),
    "este": (1.0, 0.0),
    "e": (1.0, 0.0),
    "oeste": (-1.0, 0.0),
    "o": (-1.0, 0.0),
    "w": (-1.0, 0.0),
    "noreste": (1.0, -1.0),
    "ne": (1.0, -1.0),
    "noroeste": (-1.0, -1.0),
    "no": (-1.0, -1.0),
    "nw": (-1.0, -1.0),
    "sureste": (1.0, 1.0),
    "se": (1.0, 1.0),
    "suroeste": (-1.0, 1.0),
    "so": (-1.0, 1.0),
    "sw": (-1.0, 1.0),
    "quieto": (0.0, 0.0),
    "stay": (0.0, 0.0),
    "esperar": (0.0, 0.0),
    "saludar": "greet",
    "greet": "greet",
    "hola": "greet",
}

_room: Any = None
_bots: dict[str, dict[str, Any]] = {}
_wrapped = False
_scheduled = False
# Only one ask in flight for the whole process: the bots must never be the
# reason a chat ask waits.
_ask_lock = asyncio.Lock()
_timeout_log_at: dict[str, float] = {}
_key_warned = False
_last_model = ""
# Askbox rate limit alcanzado (HTTP 429) o clave inservible: pausa con backoff
# para no quemar el mismo bucket que usa Doganiero AI ni llenar los logs.
# Los bots siguen andando.
_quota_until = 0.0
_quota_pause = 0.0
_QUOTA_PAUSE_MIN = 30.0
_QUOTA_PAUSE_MAX = 900.0
# Marcas de tiempo de los asks de los bots (ventana deslizante de 1 min).
_ask_times: list[float] = []
_budget_log_at = 0.0


def _in_quota_pause() -> bool:
    return time.monotonic() < _quota_until


def _budget_take() -> bool:
    """Reserve one slot of the bots' own asks/min budget.

    Called from the event loop only (no lock needed). Returning False means
    this tick is skipped: the bots degrade and chat keeps its share.
    """
    global _budget_log_at
    now = time.monotonic()
    cutoff = now - BOT_ASK_WINDOW_SEC
    while _ask_times and _ask_times[0] < cutoff:
        _ask_times.pop(0)
    if len(_ask_times) >= BOT_ASK_BUDGET:
        if now - _budget_log_at > 60.0:
            _budget_log_at = now
            print(
                f"[ai-bots] presupuesto {BOT_ASK_BUDGET} asks/min agotado; "
                "se salta la decisión. Los bots siguen andando.",
                flush=True,
            )
        return False
    _ask_times.append(now)
    return True


def _features(world: str) -> dict[str, list[dict[str, float]]]:
    """Solids matching metaverse.js worldDecor (rects are corners, not centers)."""
    walls: list[dict[str, float]] = []
    trees: list[dict[str, float]] = []
    water: list[dict[str, float]] = []
    if world == "plaza":
        for x, y, w, h in ((520, 300, 70, 55), (220, 460, 80, 50), (450, 520, 55, 70)):
            walls.append({"x": x + w / 2, "y": y + h / 2, "hw": w / 2, "hh": h / 2})
        for i in range(12):
            ang = (i / 12) * math.tau
            trees.append({"x": 400 + math.cos(ang) * 220, "y": 400 + math.sin(ang) * 220, "r": 14})
    elif world == "parque":
        walls.append({"x": 280 + 50, "y": 250 + 20, "hw": 50, "hh": 20})
        for i in range(20):
            trees.append({
                "x": 80 + (i % 5) * 150 + (i % 2) * 20,
                "y": 90 + (i // 5) * 160,
                "r": 14,
            })
        water.append({"x": 600, "y": 200, "r": 40})
    else:
        for i in range(10):
            w, h = 60, 120 + (i % 3) * 30
            x = 80 + (i % 5) * 140
            y = 100 + (i // 5) * 280
            walls.append({"x": x + w / 2, "y": y + h / 2, "hw": w / 2, "hh": h / 2})
    return {"walls": walls, "trees": trees, "water": water}


def _blocked(world: str, x: float, y: float) -> bool:
    if x < WORLD_MIN or y < WORLD_MIN or x > WORLD_MAX or y > WORLD_MAX:
        return True
    feat = _features(world)
    for w in feat["walls"]:
        if abs(x - w["x"]) < w["hw"] + 12 and abs(y - w["y"]) < w["hh"] + 12:
            return True
    for t in feat["trees"]:
        if math.hypot(x - t["x"], y - t["y"]) < t["r"] + 8:
            return True
    for t in feat["water"]:
        if math.hypot(x - t["x"], y - t["y"]) < t["r"] + 8:
            return True
    return False


def _too_close(x: float, y: float, others: list[tuple[float, float]], dist: float = 26.0) -> bool:
    return any(math.hypot(x - ox, y - oy) < dist for ox, oy in others)


def _free_spawn(world: str, x: float, y: float, taken: list[tuple[float, float]]) -> tuple[float, float]:
    def ok(px: float, py: float) -> bool:
        return not _blocked(world, px, py) and not _too_close(px, py, taken, 70)

    if ok(x, y):
        return x, y
    for rad in range(24, 280, 18):
        for k in range(16):
            ang = (k / 16) * math.tau
            nx = max(WORLD_MIN, min(WORLD_MAX, x + math.cos(ang) * rad))
            ny = max(WORLD_MIN, min(WORLD_MAX, y + math.sin(ang) * rad))
            if ok(nx, ny):
                return nx, ny
    return max(WORLD_MIN, min(WORLD_MAX, x)), max(WORLD_MIN, min(WORLD_MAX, y))


def _init_bots(valid_worlds: tuple[str, ...]) -> None:
    global _bots
    if _bots:
        return
    bots: dict[str, dict[str, Any]] = {}
    for world in valid_worlds:
        roster = ROSTER.get(world)
        if not roster or len(roster) != 5:
            print(f"[ai-bots] roster inválido para {world}", flush=True)
            continue
        taken: list[tuple[float, float]] = []
        prefs = PREFERRED.get(world) or ()
        for i, (name, avatar) in enumerate(roster, start=1):
            px, py = prefs[i - 1] if i - 1 < len(prefs) else (120.0 + i * 40, 120.0)
            # Rotate the five distinct preferred spots so each bot has its own destination.
            tx, ty = prefs[i % len(prefs)] if prefs else (px, py)
            sx, sy = _free_spawn(world, float(px), float(py), taken)
            taken.append((sx, sy))
            bid = f"{world}-{i}"
            dx = float(tx) - float(sx)
            dy = float(ty) - float(sy)
            dist = math.hypot(dx, dy)
            if dist < 1.0:
                ux, uy = 1.0, 0.0
            else:
                ux, uy = dx / dist, dy / dist
            bots[bid] = {
                "id": bid,
                "email": f"ai-bot:{world}:{i}",
                "name": name,
                "avatar": avatar,
                "world": world,
                "x": sx,
                "y": sy,
                "ry": math.atan2(uy, ux),
                "target_x": float(tx),
                "target_y": float(ty),
                "vx": ux * PLAYER_WALK_SPEED,
                "vy": uy * PLAYER_WALK_SPEED,
                "hx": ux,
                "hy": uy,
                "mode": "to_target",
                "sent_at": 0.0,
                "dirty": False,
                "last": "",
            }
    _bots = bots
    counts = {w: sum(1 for b in bots.values() if b["world"] == w) for w in valid_worlds}
    print(f"[ai-bots] listos {counts}", flush=True)


def _public(bot: dict[str, Any]) -> dict[str, Any]:
    x, y, vx, vy = _hold_inside(
        float(bot["x"]),
        float(bot["y"]),
        float(bot.get("vx") or 0.0),
        float(bot.get("vy") or 0.0),
    )
    bot["x"], bot["y"], bot["vx"], bot["vy"] = x, y, vx, vy
    return {
        "email": bot["email"],
        "name": bot["name"],
        "avatar": bot["avatar"],
        "x": round(x, 2),
        "y": round(y, 2),
        "z": 0.0,
        "ry": float(bot.get("ry") or 0),
        "world": bot["world"],
        "room": None,
        "voice": False,
        "bot": True,
        "vx": round(vx, 2),
        "vy": round(vy, 2),
        "dance": party_active(),
    }


def public_bots(world: str | None) -> list[dict[str, Any]]:
    out = []
    for bot in _bots.values():
        if world is not None and bot["world"] != world:
            continue
        out.append(_public(bot))
    return out


def attach(room: Any) -> None:
    """Register bots and include them in presence snapshots."""
    global _room, _wrapped
    _room = room
    valid = tuple(getattr(room, "VALID_WORLDS", ("plaza", "parque", "ciudad")))
    _init_bots(valid)
    if _wrapped:
        return
    # Keep the unbound class method: calling the bound instance method with self again breaks WS welcome.
    orig = room.__class__.snapshot_players

    def snapshot_players(self, world: str | None = None):
        out = orig(self, world)
        want = self.normalize_world(world) if world else None
        emails = {p.get("email") for p in out}
        for snap in public_bots(want):
            if snap["email"] not in emails:
                out.append(snap)
        return out

    room.__class__.snapshot_players = snapshot_players
    _wrapped = True


def _retry_after_sec(exc: AskboxError) -> float:
    try:
        return max(0.0, float(str(exc.retry_after or "").strip()))
    except (TypeError, ValueError):
        return 0.0


def _enter_quota_pause(reason: str, wait: float = 0.0) -> None:
    """Back off with doubling, honouring Retry-After when Askbox sends one."""
    global _quota_until, _quota_pause
    _quota_pause = min(
        _QUOTA_PAUSE_MAX,
        max(_QUOTA_PAUSE_MIN, _quota_pause * 2.0, wait),
    )
    _quota_until = time.monotonic() + _quota_pause
    print(
        f"[ai-bots] {reason}; pausa {int(_quota_pause)} s. Los bots siguen andando.",
        flush=True,
    )


def _log_throttled(key: str, message: str, every: float = 120.0) -> None:
    now = time.time()
    if now - _timeout_log_at.get(key, 0.0) > every:
        _timeout_log_at[key] = now
        print(f"[ai-bots] {message}", flush=True)


def _askbox_ask_sync(user_text: str) -> str | None:
    """El rumbo de los bots lo manda la Mega. No llama a ninguna IA."""
    return None
    global _key_warned, _last_model, _quota_pause
    if _in_quota_pause():
        return None
    if not askbox_client.default_key():
        if not _key_warned:
            print("[ai-bots] sin clave Askbox; los bots siguen andando", flush=True)
            _key_warned = True
        return None
    try:
        result = askbox_client.ask(
            user_text,
            system=_SYSTEM,
            tier=ASK_TIER,
            max_output_tokens=ASK_MAX_TOKENS,
            json_schema=_ACCIONES_SCHEMA,
        )
    except AskboxError as exc:
        if exc.status == 429:
            # Shared bucket: chat matters more than a bot's next heading.
            _enter_quota_pause(
                f"Askbox 429 ({exc.message[:120]})", _retry_after_sec(exc)
            )
        elif exc.status in (401, 403):
            _enter_quota_pause(f"clave Askbox rechazada ({exc.status})", _QUOTA_PAUSE_MAX)
        else:
            _log_throttled(
                f"{exc.status}:{exc.code}",
                f"Askbox {exc.status} {exc.code} {exc.message[:120]}",
            )
        return None
    except Exception as exc:  # defensivo: un bot nunca debe tumbar el bucle
        _log_throttled(type(exc).__name__, f"ask {type(exc).__name__}: {exc}")
        return None
    _last_model = str(result.get("model_used") or "")
    text = str(result.get("text") or "").strip()
    if not text:
        return None
    _quota_pause = 0.0
    return text


def _parse_actions(text: str) -> dict[str, dict[str, Any]]:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    data: Any = None
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", cleaned, re.S)
        if not m:
            return {}
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return {}
    rows = []
    if isinstance(data, dict):
        rows = data.get("acciones") or data.get("bots") or []
    if not isinstance(rows, list):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        if isinstance(row, dict) and row.get("id"):
            out[str(row["id"])] = row
    return out


def _humans(world: str) -> list[dict[str, Any]]:
    if _room is None:
        return []
    found = []
    for email, client in list(_room.clients.items()):
        if str(email).startswith("ai-bot:"):
            continue
        if (_room.normalize_world(client.get("world") or "plaza") != world):
            continue
        user = client.get("user") if isinstance(client.get("user"), dict) else {}
        try:
            x = float(client.get("x") or 0)
            y = float(client.get("y") or 0)
        except (TypeError, ValueError):
            continue
        found.append({
            "nombre": str(user.get("name") or email),
            "x": round(x, 1),
            "y": round(y, 1),
        })
    return found


def _situation(world: str, world_bots: list[dict[str, Any]], humans: list[dict[str, Any]]) -> str:
    """Build one live prompt for the 5 bots of a world and their exclusive spots."""
    feat = _features(world)
    bots = []
    for other in world_bots:
        near_h = []
        for h in humans:
            dist = math.hypot(other["x"] - h["x"], other["y"] - h["y"])
            if dist < 220:
                near_h.append({"nombre": h["nombre"], "dist": round(dist, 1)})
        near_b = []
        for peer in _bots.values():
            if peer["id"] == other["id"] or peer["world"] != world:
                continue
            dist = math.hypot(other["x"] - peer["x"], other["y"] - peer["y"])
            if dist < 220:
                near_b.append({"nombre": peer["name"], "dist": round(dist, 1)})
        bots.append({
            "id": other["id"],
            "nombre": other["name"],
            "x": round(other["x"], 1),
            "y": round(other["y"], 1),
            "destino_exclusivo": {
                "x": round(float(other.get("target_x") or other["x"]), 1),
                "y": round(float(other.get("target_y") or other["y"]), 1),
            },
            "ultima": other.get("last") or "",
            "jugadores_cerca": near_h,
            "bots_cerca": near_b,
        })
    payload = {
        "mundo": world,
        "velocidad": PLAYER_WALK_SPEED,
        "limites": [WORLD_MIN, WORLD_MAX],
        "muros": [
            {"x": round(w["x"], 1), "y": round(w["y"], 1), "ancho": round(w["hw"] * 2, 1), "alto": round(w["hh"] * 2, 1)}
            for w in feat["walls"]
        ],
        "arboles": [{"x": round(t["x"], 1), "y": round(t["y"], 1)} for t in feat["trees"]],
        "agua": [{"x": round(t["x"], 1), "y": round(t["y"], 1), "r": t["r"]} for t in feat["water"]],
        "salas": [{"id": rid, "x": x, "y": y} for rid, x, y in ROOMS.get(world, ())],
        "jugadores": humans,
        "bots": bots,
    }
    ids = ", ".join(b["id"] for b in bots)
    return (
        "Situación en vivo de UN solo mundo. Decide el rumbo de los "
        f"{len(bots)} bots ({ids}) en esta única respuesta: una entrada por "
        "cada id. Acerca cada bot a su propio destino_exclusivo; no cambies un "
        "bot por otro. Los bots ya caminan solos a velocidad constante entre "
        "respuestas; elige el rumbo, no un único paso. No respondas quieto. "
        "No inventes ids.\n"
        + json.dumps(payload, ensure_ascii=False)
    )



def _others(world: str, bot_id: str) -> list[tuple[float, float]]:
    others: list[tuple[float, float]] = []
    for other in _bots.values():
        if other["world"] != world or other["id"] == bot_id:
            continue
        others.append((float(other["x"]), float(other["y"])))
    for human in _humans(world):
        others.append((float(human["x"]), float(human["y"])))
    return others


def _clamp_pos(x: float, y: float) -> tuple[float, float]:
    return (
        max(WORLD_MIN, min(WORLD_MAX, x)),
        max(WORLD_MIN, min(WORLD_MAX, y)),
    )


def _hold_inside(x: float, y: float, vx: float, vy: float) -> tuple[float, float, float, float]:
    """Map edges are WORLD_MIN..WORLD_MAX. Outside positions come back in. Outward speed stops."""
    nx, ny = _clamp_pos(x, y)
    if nx <= WORLD_MIN and vx < 0.0:
        vx = 0.0
    elif nx >= WORLD_MAX and vx > 0.0:
        vx = 0.0
    if ny <= WORLD_MIN and vy < 0.0:
        vy = 0.0
    elif ny >= WORLD_MAX and vy > 0.0:
        vy = 0.0
    return nx, ny, vx, vy


_party_until = 0.0


def party_active() -> bool:
    return time.time() < _party_until


def begin_party(seconds: float = 600.0) -> bool:
    """The Mega opens the party. Headings still come from the board, not from Askbox."""
    global _party_until
    if party_active():
        return False
    _party_until = time.time() + max(1.0, float(seconds))
    for bot in _bots.values():
        bot["dirty"] = True
        bot["force_send"] = True
    return True


def end_party() -> bool:
    global _party_until
    was = party_active() or _party_until > 0.0
    _party_until = 0.0
    if was:
        for bot in _bots.values():
            bot["dirty"] = True
            bot["force_send"] = True
    return was


def _free_cell(world: str, x: float, y: float, others: list[tuple[float, float]]) -> bool:
    x, y = _clamp_pos(x, y)
    if _blocked(world, x, y):
        return False
    if _too_close(x, y, others, 26.0):
        return False
    return True


def _publish_stop(bot: dict[str, Any]) -> None:
    """Do not publish quieto. Bots keep the last heading and speed."""
    return


def _face(bot: dict[str, Any], vx: float, vy: float) -> None:
    if abs(vx) + abs(vy) > 1.0:
        bot["ry"] = math.atan2(vy, vx)


def _step_bot(bot: dict[str, Any], dt: float) -> None:
    """Integrate one glide frame at player speed. Never waits on Askbox and never publishes vx=vy=0."""
    if dt <= 0:
        return
    world = str(bot["world"])
    x = float(bot["x"])
    y = float(bot["y"])
    x, y, vx_now, vy_now = _hold_inside(
        x, y, float(bot.get("vx") or 0.0), float(bot.get("vy") or 0.0)
    )
    if (
        abs(x - float(bot["x"])) > 0.01
        or abs(y - float(bot["y"])) > 0.01
        or abs(vx_now - float(bot.get("vx") or 0.0)) > 0.01
        or abs(vy_now - float(bot.get("vy") or 0.0)) > 0.01
    ):
        bot["x"], bot["y"] = x, y
        bot["vx"], bot["vy"] = vx_now, vy_now
        bot["dirty"] = True
        bot["force_send"] = True
    others = _others(world, str(bot["id"]))
    speed = PLAYER_WALK_SPEED
    mode = bot.get("mode") or "idle"
    dx = float(bot.get("target_x") or x) - x
    dy = float(bot.get("target_y") or y) - y
    dist = math.hypot(dx, dy)
    hx = float(bot.get("hx") or 0.0)
    hy = float(bot.get("hy") or 0.0)
    hmag = math.hypot(hx, hy)

    if mode == "heading" and hmag > 1e-6:
        ux, uy = hx / hmag, hy / hmag
    elif dist > ARRIVE_DIST:
        ux, uy = dx / dist, dy / dist
    elif hmag > 1e-6:
        # Already on the exclusive spot: keep the last heading instead of stopping.
        ux, uy = hx / hmag, hy / hmag
        mode = "heading"
    elif dist > 1.0:
        ux, uy = dx / dist, dy / dist
        mode = "heading"
    else:
        ux, uy = 1.0, 0.0
        mode = "heading"

    step = speed * dt
    candidates: list[tuple[float, float]] = [(ux, uy)]
    if abs(ux) >= 0.2:
        candidates.append((1.0 if ux > 0 else -1.0, 0.0))
    if abs(uy) >= 0.2:
        candidates.append((0.0, 1.0 if uy > 0 else -1.0))
    for deg in (40, -40, 80, -80, 120, -120, 160, -160, 180):
        rad = math.radians(deg)
        c, s = math.cos(rad), math.sin(rad)
        candidates.append((ux * c - uy * s, ux * s + uy * c))

    for cx, cy in candidates:
        mag = math.hypot(cx, cy) or 1.0
        cx, cy = cx / mag, cy / mag
        nx, ny, vx, vy = _hold_inside(x + cx * step, y + cy * step, cx * speed, cy * speed)
        if math.hypot(nx - x, ny - y) < step * 0.4:
            continue
        if not _free_cell(world, nx, ny, others):
            continue
        vel_changed = abs(vx - float(bot.get("vx") or 0.0)) > 1.0 or abs(vy - float(bot.get("vy") or 0.0)) > 1.0
        bot["x"] = nx
        bot["y"] = ny
        bot["vx"] = vx
        bot["vy"] = vy
        bot["hx"] = cx
        bot["hy"] = cy
        slid = abs(cx - ux) > 0.05 or abs(cy - uy) > 0.05
        if mode == "to_target" and dist > ARRIVE_DIST and not slid:
            bot["mode"] = "to_target"
            bot["hx"] = ux
            bot["hy"] = uy
        else:
            bot["mode"] = "heading"
        _face(bot, vx, vy)
        bot["dirty"] = True
        if vel_changed:
            bot["force_send"] = True
        return

    # Nowhere free this frame. Pull back inside the map and drop speed that points off it.
    x, y, vx, vy = _hold_inside(
        x, y, float(bot.get("vx") or 0.0), float(bot.get("vy") or 0.0)
    )
    if math.hypot(vx, vy) < 1.0:
        _hx, _hy, vx, vy = _hold_inside(x, y, ux * speed, uy * speed)
    held = (
        abs(x - float(bot["x"])) > 0.01
        or abs(y - float(bot["y"])) > 0.01
        or abs(vx - float(bot.get("vx") or 0.0)) > 0.01
        or abs(vy - float(bot.get("vy") or 0.0)) > 0.01
    )
    bot["x"], bot["y"] = x, y
    bot["vx"], bot["vy"] = vx, vy
    if held:
        bot["dirty"] = True
        bot["force_send"] = True
    bot["hx"] = ux
    bot["hy"] = uy
    if (bot.get("mode") or "idle") == "idle":
        bot["mode"] = "heading"


def _apply(world: str, actions: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Store the headings of the batch answer. Position is not jumped; the motion loop glides."""
    payloads: list[dict[str, Any]] = []
    bots = [b for b in _bots.values() if b["world"] == world]
    bots.sort(key=lambda b: b["id"])
    for bot in bots:
        row = actions.get(bot["id"])
        if not row:
            continue
        act = str(row.get("accion") or row.get("action") or "").strip().lower()
        spec = _ACTION_VEC.get(act)
        if spec is None:
            continue
        bot["last"] = act
        if spec == "greet":
            # Wave only. No chat text. Do not cancel the glide already in progress.
            payloads.append({
                "type": "emote",
                "email": bot["email"],
                "name": bot["name"],
                "emoji": "👋",
            })
            continue
        dx, dy = spec
        if dx == 0 and dy == 0:
            # quieto must not zero velocity between Askbox calls.
            if (bot.get("mode") or "idle") == "idle" or math.hypot(float(bot.get("vx") or 0.0), float(bot.get("vy") or 0.0)) < 1.0:
                bot["mode"] = "to_target"
            continue
        mag = math.hypot(dx, dy) or 1.0
        hx, hy = dx / mag, dy / mag
        tx = float(bot.get("target_x") or bot["x"])
        ty = float(bot.get("target_y") or bot["y"])
        to_x = tx - float(bot["x"])
        to_y = ty - float(bot["y"])
        dist = math.hypot(to_x, to_y)
        # Follow the exclusive spot when the chosen direction heads toward it.
        # A dodge (negative dot, or already there) keeps that compass heading.
        if dist > ARRIVE_DIST + 4.0 and (hx * to_x + hy * to_y) >= 0.0:
            bot["mode"] = "to_target"
            bot["hx"] = 0.0
            bot["hy"] = 0.0
        else:
            bot["mode"] = "heading"
            bot["hx"] = hx
            bot["hy"] = hy
        bot["force_send"] = True
    return payloads


def _match_rows(
    world_bots: list[dict[str, Any]], rows: dict[str, dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    """Keep only rows that name a real bot of this world.

    Tolerates a model answering with the bot's name or its bare index instead
    of the full id. Unknown ids are dropped, never reassigned at random.
    """
    alias: dict[str, str] = {}
    for bot in world_bots:
        bid = str(bot["id"])
        alias[bid.lower()] = bid
        alias[str(bot["name"]).lower()] = bid
        alias[bid.rsplit("-", 1)[-1]] = bid
    out: dict[str, dict[str, Any]] = {}
    for raw_id, row in rows.items():
        bid = alias.get(str(raw_id).strip().lower())
        if bid and bid not in out:
            out[bid] = row
    return out


async def _ask_world(
    world: str, world_bots: list[dict[str, Any]], humans: list[dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    """One Askbox ask for all 5 bots, off the asyncio event loop."""
    text = await asyncio.to_thread(_askbox_ask_sync, _situation(world, world_bots, humans))
    if not text:
        return {}
    return _match_rows(world_bots, _parse_actions(text))


async def tick_world(world: str) -> None:
    """One single Askbox ask decides all 5 bots. Movement does not wait on this."""
    if _room is None or not _bots:
        return
    humans = _humans(world)
    if not humans:
        return
    if _in_quota_pause():
        return
    bots = sorted((b for b in _bots.values() if b["world"] == world), key=lambda b: b["id"])
    if not bots or not _budget_take():
        return
    # The call runs in a worker thread; the websocket/event loop stays responsive.
    actions = await _ask_world(world, bots, humans)
    payloads = _apply(world, actions)
    summary = []
    for bot in bots:
        summary.append(f"{bot['name']}:{bot.get('last') or 'sigue'}:{bot.get('mode') or 'idle'}")
    print(
        f"[ai-bots] {world} 1 ask Askbox {len(actions)}/{len(bots)} modelo={_last_model or '-'} "
        + " ".join(summary),
        flush=True,
    )
    for payload in payloads:
        try:
            await _room.broadcast(payload, world=world)
        except Exception as exc:
            print(f"[ai-bots] broadcast {type(exc).__name__}", flush=True)


async def _motion_loop() -> None:
    """Glide every bot at player speed. Independent of the Askbox decision loop."""
    last = time.monotonic()
    while True:
        await asyncio.sleep(MOTION_SLEEP)
        now = time.monotonic()
        dt = min(0.12, max(0.0, now - last))
        last = now
        if _room is None or not _bots or dt <= 0:
            continue
        occupied: dict[str, bool] = {}
        batches: dict[str, list[dict[str, Any]]] = {}
        for bot in list(_bots.values()):
            world = str(bot["world"])
            if world not in occupied:
                occupied[world] = bool(_humans(world))
            if not occupied[world]:
                continue
            try:
                _step_bot(bot, dt)
            except Exception as exc:
                print(f"[ai-bots] move {bot.get('id')} {type(exc).__name__}: {exc}", flush=True)
                continue
            force = bool(bot.pop("force_send", False))
            stopped = bool(bot.pop("stopped", False))
            dirty = bool(bot.get("dirty"))
            due = (now - float(bot.get("sent_at") or 0.0)) >= SEND_EVERY
            if not (force or stopped or (dirty and due)):
                continue
            bot["dirty"] = False
            bot["sent_at"] = now
            batches.setdefault(world, []).append({"type": "move", **_public(bot)})
        for world, payloads in batches.items():
            for payload in payloads:
                try:
                    await _room.broadcast(payload, world=world)
                except Exception as exc:
                    print(f"[ai-bots] broadcast {type(exc).__name__}", flush=True)


async def _world_loop(world: str, stagger: float) -> None:
    await asyncio.sleep(stagger)
    while True:
        started = time.monotonic()
        try:
            if _humans(world):
                async with _ask_lock:
                    await tick_world(world)
        except Exception as exc:
            print(f"[ai-bots] {world} {type(exc).__name__}: {exc}", flush=True)
        elapsed = time.monotonic() - started
        # A slow ask must not shorten the gap into a burst of asks.
        await asyncio.sleep(max(TICK_SEC * 0.5, TICK_SEC - elapsed))



_BOARD_DIR = {
    "0": "norte", "n": "norte", "norte": "norte",
    "1": "este", "e": "este", "este": "este",
    "2": "sur", "s": "sur", "sur": "sur",
    "3": "oeste", "o": "oeste", "w": "oeste", "oeste": "oeste",
    "4": "noreste", "ne": "noreste", "noreste": "noreste",
    "5": "sureste", "se": "sureste", "sureste": "sureste",
    "6": "suroeste", "so": "suroeste", "sw": "suroeste", "suroeste": "suroeste",
    "7": "noroeste", "no": "noroeste", "nw": "noroeste", "noroeste": "noroeste",
}


async def apply_board_step(raw: str) -> int:
    """Aplica el paso que mando la Mega. Solo en mundos con alguien dentro."""
    act = _BOARD_DIR.get(str(raw or "").strip().lower())
    if not act or _room is None or not _bots:
        return 0
    moved = 0
    worlds = tuple(getattr(_room, "VALID_WORLDS", ())) or ("plaza", "parque", "ciudad")
    for world in worlds:
        if not _humans(world):
            continue
        bots = [b for b in _bots.values() if b["world"] == world]
        if not bots:
            continue
        actions = {str(b["id"]): {"accion": act} for b in bots}
        payloads = _apply(world, actions)
        moved += len(actions)
        for payload in payloads:
            try:
                await _room.broadcast(payload, world=world)
            except Exception:
                pass
    return moved

def _placa_on() -> bool:
    raw = (os.environ.get("SNAKEOS_PLACA") or "false").strip().lower()
    return raw in {"1", "true", "yes", "si", "sí"}


async def _host_party_loop() -> None:
    """La fiesta de 10 minutos sale del reloj de las 14:00, no de la Mega."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    origin = datetime(2026, 10, 12, 14, 0, tzinfo=ZoneInfo("Europe/Madrid"))
    hour_s = 3600
    party_s = 600
    cycle = hour_s + party_s
    while True:
        elapsed = int((datetime.now(origin.tzinfo) - origin).total_seconds())
        if elapsed >= 0:
            phase = elapsed % cycle
            if phase >= hour_s:
                left = party_s - (phase - hour_s)
                if not party_active():
                    begin_party(float(max(1, left)))
            elif party_active():
                end_party()
        await asyncio.sleep(1)


def schedule() -> None:
    global _scheduled
    if _scheduled or _room is None:
        return
    _scheduled = True
    worlds = tuple(getattr(_room, "VALID_WORLDS", ()))
    loop = asyncio.get_running_loop()
    loop.create_task(_motion_loop())
    if _placa_on():
        note = "el rumbo lo manda la placa"
    else:
        for index, world in enumerate(worlds):
            loop.create_task(_world_loop(world, index * 0.4))
        loop.create_task(_host_party_loop())
        note = "el rumbo y la fiesta salen del servidor"
    started = sum(1 for world in worlds if sum(1 for b in _bots.values() if b["world"] == world) == 5)
    print(
        f"[ai-bots] {started} mundos, andar continuo {PLAYER_WALK_SPEED:.0f} u/s; "
        + note,
        flush=True,
    )
