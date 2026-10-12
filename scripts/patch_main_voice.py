#!/usr/bin/env python3
"""Patch main.py: WebRTC voice signaling + minigames for Doganiero Metaverse."""
from pathlib import Path
import re

MAIN = Path("/srv/juegos_david/snake-os/main.py")
text = MAIN.read_text(encoding="utf-8")

if 'mtype == "voice_state"' in text and 'mtype == "game"' in text:
    print("main.py already has voice+games")
else:
    # Add games dict + voice flag helpers after _bone_seq
    if "self.games:" not in text:
        text = text.replace(
            "        self.bones: dict[str, list[dict[str, Any]]] = {}\n"
            "        self._bone_seq = 0\n",
            "        self.bones: dict[str, list[dict[str, Any]]] = {}\n"
            "        self._bone_seq = 0\n"
            "        self.games: dict[str, dict[str, Any]] = {}\n"
            "        self._game_seq = 0\n",
            1,
        )

    # voice in client connect
    if '"voice": False,' not in text:
        text = text.replace(
            '                "score": 0,\n'
            '                "emote": None,\n'
            '            }',
            '                "score": 0,\n'
            '                "emote": None,\n'
            '                "voice": False,\n'
            '            }',
            1,
        )

    # include voice in snapshot_players
    old_snap = (
        '                    "world": cw,\n'
        '                    "room": c.get("room"),\n'
        '                }'
    )
    new_snap = (
        '                    "world": cw,\n'
        '                    "room": c.get("room"),\n'
        '                    "voice": bool(c.get("voice")),\n'
        '                }'
    )
    if '"voice": bool(c.get("voice"))' not in text:
        text = text.replace(old_snap, new_snap, 1)

    # Helper methods before broadcast
    helpers = r'''
    def _same_voice_space(self, a: dict[str, Any], b: dict[str, Any]) -> bool:
        return (a.get("world") or "plaza") == (b.get("world") or "plaza") and (
            a.get("room") or None
        ) == (b.get("room") or None)

    def _public_game(self, g: dict[str, Any]) -> dict[str, Any]:
        out = {
            "id": g["id"],
            "kind": g["kind"],
            "host": g["host"],
            "host_name": g.get("host_name"),
            "world": g["world"],
            "room": g.get("room"),
            "status": g["status"],
            "players": list(g.get("players") or []),
            "scores": dict(g.get("scores") or {}),
            "names": dict(g.get("names") or {}),
            "result": g.get("result"),
            "turn": g.get("turn"),
            "round": g.get("round", 0),
        }
        if g["kind"] == "memory":
            cards = g.get("cards") or []
            out["cards"] = [
                {"i": i, "v": (c if g.get("revealed", [False] * len(cards))[i] or g.get("matched", [False] * len(cards))[i] else None), "matched": bool(g.get("matched", [False] * len(cards))[i])}
                for i, c in enumerate(cards)
            ]
            out["flipped"] = list(g.get("flipped") or [])
        if g["kind"] == "aim":
            out["targets"] = list(g.get("targets") or [])
            out["ends_at"] = g.get("ends_at")
            out["duration"] = g.get("duration", 20)
        if g["kind"] == "rps":
            # never leak choices until reveal
            choices = g.get("choices") or {}
            if g["status"] == "reveal" or g["status"] == "done":
                out["choices"] = dict(choices)
            else:
                out["choices"] = {k: True for k in choices.keys()}
        return out

    async def create_game(
        self,
        email: str,
        name: str,
        kind: str,
        invite: str | None = None,
    ) -> dict[str, Any] | None:
        import random

        kind = (kind or "").strip().lower()
        if kind not in ("rps", "memory", "aim"):
            return None
        async with self._lock:
            cur = self.clients.get(email)
            if not cur:
                return None
            self._game_seq += 1
            gid = "g%d" % self._game_seq
            world = cur.get("world") or "plaza"
            room = cur.get("room")
            players = [email]
            names = {email: name}
            scores = {email: 0}
            if invite:
                inv = invite.strip().lower()
                peer = self.clients.get(inv)
                if peer and self._same_voice_space(cur, peer) and inv != email:
                    players.append(inv)
                    names[inv] = peer["user"]["name"]
                    scores[inv] = 0
            g: dict[str, Any] = {
                "id": gid,
                "kind": kind,
                "host": email,
                "host_name": name,
                "world": world,
                "room": room,
                "status": "waiting",
                "players": players,
                "scores": scores,
                "names": names,
                "result": None,
                "turn": players[0],
                "round": 0,
                "choices": {},
                "invite": invite.strip().lower() if invite else None,
            }
            if kind == "memory":
                vals = list("🐶🐱🐭🐹🐰🦊🐻🐼") * 2
                random.shuffle(vals)
                g["cards"] = vals
                g["revealed"] = [False] * 16
                g["matched"] = [False] * 16
                g["flipped"] = []
                g["lock_until"] = 0.0
                if len(players) >= 2:
                    g["status"] = "playing"
            elif kind == "aim":
                g["targets"] = []
                g["ends_at"] = None
                g["duration"] = 20
            elif kind == "rps":
                if len(players) >= 2:
                    g["status"] = "choosing"
            self.games[gid] = g
            return self._public_game(g)

    async def join_game(self, email: str, name: str, gid: str) -> dict[str, Any] | None:
        async with self._lock:
            cur = self.clients.get(email)
            g = self.games.get(gid)
            if not cur or not g:
                return None
            if (cur.get("world") or "plaza") != g["world"]:
                return None
            if (cur.get("room") or None) != (g.get("room") or None):
                return None
            if email in g["players"]:
                return self._public_game(g)
            if len(g["players"]) >= 4:
                return None
            if g["status"] not in ("waiting", "choosing", "playing") and g["kind"] != "aim":
                return None
            g["players"].append(email)
            g["names"][email] = name
            g["scores"][email] = int(g["scores"].get(email) or 0)
            if g["kind"] == "rps" and len(g["players"]) >= 2 and g["status"] == "waiting":
                g["status"] = "choosing"
                g["choices"] = {}
            if g["kind"] == "memory" and len(g["players"]) >= 2 and g["status"] == "waiting":
                g["status"] = "playing"
            if g["kind"] == "aim" and g["status"] == "waiting" and len(g["players"]) >= 1:
                pass
            return self._public_game(g)

    async def start_aim(self, email: str, gid: str) -> dict[str, Any] | None:
        import random

        async with self._lock:
            g = self.games.get(gid)
            if not g or g["kind"] != "aim":
                return None
            if email != g["host"] and email not in g["players"]:
                return None
            now = time_mod.time()
            g["status"] = "playing"
            g["round"] = int(g.get("round") or 0) + 1
            g["ends_at"] = now + float(g.get("duration") or 20)
            g["targets"] = [
                {
                    "id": "t%d" % i,
                    "x": round(random.uniform(40, 760), 1),
                    "y": round(random.uniform(40, 760), 1),
                    "r": round(random.uniform(18, 28), 1),
                }
                for i in range(8)
            ]
            for p in g["players"]:
                g["scores"][p] = 0
            return self._public_game(g)

    async def game_action(
        self, email: str, gid: str, action: str, payload: dict[str, Any]
    ) -> dict[str, Any] | None:
        import random

        async with self._lock:
            g = self.games.get(gid)
            if not g or email not in g["players"]:
                return None
            kind = g["kind"]
            action = (action or "").strip().lower()

            if action == "leave":
                if email in g["players"]:
                    g["players"] = [p for p in g["players"] if p != email]
                g["choices"].pop(email, None)
                if not g["players"] or email == g["host"]:
                    self.games.pop(gid, None)
                    return {"id": gid, "status": "closed", "kind": kind}
                if g.get("turn") == email:
                    g["turn"] = g["players"][0]
                return self._public_game(g)

            if kind == "rps" and action == "choose":
                choice = str(payload.get("choice") or "").lower()
                if choice not in ("rock", "paper", "scissors"):
                    return None
                if g["status"] not in ("choosing", "waiting"):
                    return None
                if g["status"] == "waiting":
                    g["status"] = "choosing"
                g["choices"][email] = choice
                # wait until at least 2 players have chosen (or all current players if 2+)
                need = [p for p in g["players"][:2]]
                if len(need) < 2:
                    return self._public_game(g)
                if all(p in g["choices"] for p in need):
                    a, b = need[0], need[1]
                    ca, cb = g["choices"][a], g["choices"][b]
                    beats = {"rock": "scissors", "scissors": "paper", "paper": "rock"}
                    if ca == cb:
                        winner = None
                        g["result"] = {"tie": True, "a": a, "b": b, "ca": ca, "cb": cb}
                    elif beats[ca] == cb:
                        winner = a
                        g["scores"][a] = int(g["scores"].get(a) or 0) + 1
                        g["result"] = {"winner": a, "a": a, "b": b, "ca": ca, "cb": cb}
                    else:
                        winner = b
                        g["scores"][b] = int(g["scores"].get(b) or 0) + 1
                        g["result"] = {"winner": b, "a": a, "b": b, "ca": ca, "cb": cb}
                    g["status"] = "reveal"
                    g["round"] = int(g.get("round") or 0) + 1
                return self._public_game(g)

            if kind == "rps" and action == "next":
                if g["status"] != "reveal":
                    return None
                g["choices"] = {}
                g["result"] = None
                g["status"] = "choosing" if len(g["players"]) >= 2 else "waiting"
                return self._public_game(g)

            if kind == "memory" and action == "flip":
                try:
                    idx = int(payload.get("index"))
                except (TypeError, ValueError):
                    return None
                if g["status"] != "playing":
                    return None
                if g.get("turn") != email:
                    return None
                now = time_mod.time()
                if now < float(g.get("lock_until") or 0):
                    return None
                cards = g["cards"]
                if idx < 0 or idx >= len(cards):
                    return None
                if g["matched"][idx] or g["revealed"][idx]:
                    return None
                flipped = list(g.get("flipped") or [])
                if idx in flipped:
                    return None
                if len(flipped) >= 2:
                    return None
                g["revealed"][idx] = True
                flipped.append(idx)
                g["flipped"] = flipped
                if len(flipped) == 2:
                    i, j = flipped
                    if cards[i] == cards[j]:
                        g["matched"][i] = True
                        g["matched"][j] = True
                        g["scores"][email] = int(g["scores"].get(email) or 0) + 1
                        g["flipped"] = []
                        if all(g["matched"]):
                            g["status"] = "done"
                            best = max(g["scores"].values()) if g["scores"] else 0
                            winners = [p for p, s in g["scores"].items() if s == best]
                            g["result"] = {"winners": winners, "scores": dict(g["scores"])}
                    else:
                        g["lock_until"] = now + 0.85
                        g["_pending_hide"] = [i, j]
                        # turn switches after hide — handled in resolve_memory_hide
                return self._public_game(g)

            if kind == "memory" and action == "resolve_hide":
                pending = g.pop("_pending_hide", None)
                if pending:
                    for i in pending:
                        if not g["matched"][i]:
                            g["revealed"][i] = False
                    g["flipped"] = []
                    # next turn
                    pls = g["players"]
                    if pls:
                        try:
                            ti = pls.index(g.get("turn"))
                        except ValueError:
                            ti = 0
                        g["turn"] = pls[(ti + 1) % len(pls)]
                g["lock_until"] = 0.0
                return self._public_game(g)

            if kind == "aim" and action == "hit":
                tid = str(payload.get("targetId") or payload.get("tid") or "")
                if g["status"] != "playing":
                    return None
                now = time_mod.time()
                if g.get("ends_at") and now > float(g["ends_at"]):
                    g["status"] = "done"
                    best = max(g["scores"].values()) if g["scores"] else 0
                    winners = [p for p, s in g["scores"].items() if s == best]
                    g["result"] = {"winners": winners, "scores": dict(g["scores"])}
                    g["targets"] = []
                    return self._public_game(g)
                targets = g.get("targets") or []
                found = None
                for t in targets:
                    if t["id"] == tid:
                        found = t
                        break
                if not found:
                    return None
                targets.remove(found)
                g["targets"] = targets
                g["scores"][email] = int(g["scores"].get(email) or 0) + 1
                # spawn replacement
                g["targets"].append(
                    {
                        "id": "t%d" % random.randint(1000, 99999),
                        "x": round(random.uniform(40, 760), 1),
                        "y": round(random.uniform(40, 760), 1),
                        "r": round(random.uniform(18, 28), 1),
                    }
                )
                return self._public_game(g)

            if kind == "aim" and action == "finish_check":
                now = time_mod.time()
                if g["status"] == "playing" and g.get("ends_at") and now > float(g["ends_at"]):
                    g["status"] = "done"
                    best = max(g["scores"].values()) if g["scores"] else 0
                    winners = [p for p, s in g["scores"].items() if s == best]
                    g["result"] = {"winners": winners, "scores": dict(g["scores"])}
                    g["targets"] = []
                return self._public_game(g)

            return None

    def list_games_for(self, world: str, room: str | None) -> list[dict[str, Any]]:
        out = []
        for g in self.games.values():
            if g.get("world") != world:
                continue
            if (g.get("room") or None) != (room or None):
                continue
            if g.get("status") == "closed":
                continue
            out.append(self._public_game(g))
        return out

'''

    if "def create_game(" not in text:
        # Insert helpers before "    async def broadcast("
        marker = "    async def broadcast(\n"
        if marker not in text:
            raise SystemExit("broadcast marker missing")
        text = text.replace(marker, helpers + "\n" + marker, 1)

    # WS handlers before ping
    handlers = r'''
            elif mtype == "voice_state":
                on = bool(msg.get("on"))
                cur_world = "plaza"
                cur_room = None
                async with metaverse_room._lock:
                    cur = metaverse_room.clients.get(email)
                    if not cur:
                        continue
                    cur["voice"] = on
                    cur_world = cur.get("world") or "plaza"
                    cur_room = cur.get("room")
                await metaverse_room.broadcast(
                    {
                        "type": "voice_state",
                        "email": email,
                        "name": pub["name"],
                        "on": on,
                        "world": cur_world,
                        "room": cur_room,
                    },
                    world=cur_world,
                )
            elif mtype == "voice_signal":
                to = str(msg.get("to") or "").strip().lower()
                signal = msg.get("signal")
                if not to or to == email or not isinstance(signal, dict):
                    continue
                ok = False
                async with metaverse_room._lock:
                    me_c = metaverse_room.clients.get(email)
                    pe_c = metaverse_room.clients.get(to)
                    if me_c and pe_c and metaverse_room._same_voice_space(me_c, pe_c):
                        ok = True
                if ok:
                    await metaverse_room.send_to(
                        to,
                        {
                            "type": "voice_signal",
                            "from": email,
                            "from_name": pub["name"],
                            "signal": signal,
                        },
                    )
            elif mtype == "game":
                action = str(msg.get("action") or "").strip().lower()
                kind = str(msg.get("kind") or "").strip().lower()
                gid = str(msg.get("id") or "").strip()
                cur_world = "plaza"
                cur_room = None
                async with metaverse_room._lock:
                    cur = metaverse_room.clients.get(email)
                    if cur:
                        cur_world = cur.get("world") or "plaza"
                        cur_room = cur.get("room")
                if action == "list":
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "game_list",
                                "games": metaverse_room.list_games_for(cur_world, cur_room),
                            },
                            ensure_ascii=False,
                        )
                    )
                elif action == "create":
                    invite = msg.get("invite")
                    gpub = await metaverse_room.create_game(
                        email, str(pub["name"]), kind, invite=str(invite) if invite else None
                    )
                    if gpub:
                        await metaverse_room.broadcast(
                            {"type": "game_update", "game": gpub},
                            world=gpub.get("world") or cur_world,
                        )
                elif action == "join" and gid:
                    gpub = await metaverse_room.join_game(email, str(pub["name"]), gid)
                    if gpub:
                        await metaverse_room.broadcast(
                            {"type": "game_update", "game": gpub},
                            world=gpub.get("world") or cur_world,
                        )
                elif action == "start" and gid:
                    gpub = await metaverse_room.start_aim(email, gid)
                    if gpub:
                        await metaverse_room.broadcast(
                            {"type": "game_update", "game": gpub},
                            world=gpub.get("world") or cur_world,
                        )
                elif action in ("choose", "next", "flip", "resolve_hide", "hit", "finish_check", "leave") and gid:
                    gpub = await metaverse_room.game_action(
                        email, gid, action, msg if isinstance(msg, dict) else {}
                    )
                    if gpub:
                        world = gpub.get("world") or cur_world
                        if gpub.get("status") == "closed":
                            await metaverse_room.broadcast(
                                {"type": "game_closed", "id": gpub["id"]},
                                world=world,
                            )
                        else:
                            await metaverse_room.broadcast(
                                {"type": "game_update", "game": gpub},
                                world=world,
                            )
'''

    if 'mtype == "voice_state"' not in text:
        ping_marker = '            elif mtype == "ping":\n'
        if ping_marker not in text:
            raise SystemExit("ping marker missing")
        text = text.replace(ping_marker, handlers + "\n" + ping_marker, 1)

    # On leave, clear voice (already removed from clients). Also close games hosted.
    # Enhance disconnect finally — optional; games cleaned when host leaves via leave action.
    # Deduplicate END METAVERSE
    while text.count("# ===== END METAVERSE =====") > 1:
        # keep one
        idx = text.rfind("# ===== END METAVERSE =====")
        # find previous
        idx2 = text.rfind("# ===== END METAVERSE =====", 0, idx)
        if idx2 < 0:
            break
        text = text[:idx] + text[idx + len("# ===== END METAVERSE ====="):]
        # remove extra blank lines carefully — just remove one duplicate line
        break
    # simpler dedupe
    text = re.sub(
        r"(# ===== END METAVERSE =====\n)# ===== END METAVERSE =====\n",
        r"\1",
        text,
        count=1,
    )

    MAIN.write_text(text, encoding="utf-8")
    print("main.py patched OK", len(text))

# syntax check
import ast
ast.parse(MAIN.read_text(encoding="utf-8"))
print("main.py syntax OK")
