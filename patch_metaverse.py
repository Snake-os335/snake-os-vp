#!/usr/bin/env python3
"""Patch snake-os Doganiero Metaverse: bones, emotes, highfive."""
from pathlib import Path
import re
import time

ROOT = Path("/srv/juegos_david/snake-os")
MAIN = ROOT / "main.py"
MV = ROOT / "metaverse.js"
INDEX = ROOT / "index.html"
BUST = time.strftime("%Y%m%d%H%M%S")

def patch_main():
    text = MAIN.read_text(encoding="utf-8")
    if "def ensure_bones" in text and 'elif mtype == "emote":' in text:
        print("main.py already patched")
        return

    if "self.bones" not in text:
        text = text.replace(
            '        self.clients: dict[str, dict[str, Any]] = {}\n',
            '        self.clients: dict[str, dict[str, Any]] = {}\n'
            '        self.bones: dict[str, list[dict[str, Any]]] = {}\n'
            '        self._bone_seq = 0\n',
            1,
        )

    if '"score": 0,' not in text:
        old = (
            '            self.clients[email] = {\n'
            '                "ws": ws,\n'
            '                "user": user,\n'
            '                "x": 400.0 + float((hash(email) % 7) - 3) * 12,\n'
            '                "y": 400.0 + float((hash(email[::-1]) % 7) - 3) * 12,\n'
            '                "ry": 0.0,\n'
            '                "world": world,\n'
            '                "room": None,\n'
            '            }'
        )
        new = (
            '            self.clients[email] = {\n'
            '                "ws": ws,\n'
            '                "user": user,\n'
            '                "x": 400.0 + float((hash(email) % 7) - 3) * 12,\n'
            '                "y": 400.0 + float((hash(email[::-1]) % 7) - 3) * 12,\n'
            '                "ry": 0.0,\n'
            '                "world": world,\n'
            '                "room": None,\n'
            '                "score": 0,\n'
            '                "emote": None,\n'
            '            }'
        )
        if old not in text:
            raise SystemExit("connect block not found")
        text = text.replace(old, new, 1)

    if "def ensure_bones" not in text:
        methods = r'''
    def ensure_bones(self, world: str, n: int = 8) -> list[dict[str, Any]]:
        import random
        world = self.normalize_world(world)
        bones = self.bones.setdefault(world, [])
        while len(bones) < n:
            self._bone_seq += 1
            bones.append(
                {
                    "id": "b%d" % self._bone_seq,
                    "x": round(random.uniform(60, 740), 1),
                    "y": round(random.uniform(60, 740), 1),
                }
            )
        return bones

    async def collect_bone(self, email: str, bone_id: str) -> dict[str, Any] | None:
        import random
        async with self._lock:
            cur = self.clients.get(email)
            if not cur:
                return None
            world = cur.get("world") or "plaza"
            bones = self.bones.get(world) or []
            found = None
            for b in bones:
                if b["id"] == bone_id:
                    found = b
                    break
            if not found:
                return None
            if abs(float(cur["x"]) - float(found["x"])) > 42 or abs(
                float(cur["y"]) - float(found["y"])
            ) > 42:
                return None
            bones.remove(found)
            self._bone_seq += 1
            newb = {
                "id": "b%d" % self._bone_seq,
                "x": round(random.uniform(60, 740), 1),
                "y": round(random.uniform(60, 740), 1),
            }
            bones.append(newb)
            score = int(cur.get("score") or 0) + 1
            cur["score"] = score
            return {
                "world": world,
                "collected_id": bone_id,
                "by": email,
                "by_name": cur["user"]["name"],
                "score": score,
                "new_bone": newb,
                "bones": list(bones),
            }

'''
        marker = "    async def broadcast(\n"
        if marker not in text:
            raise SystemExit("broadcast marker missing")
        text = text.replace(marker, methods + marker, 1)

    if '"bones":' not in text.split("welcome = {", 1)[1][:900]:
        old_w = (
            '    welcome = {\n'
            '        "type": "welcome",\n'
            '        "world": join_world,\n'
            '        "you": {\n'
            '            "email": email,\n'
            '            "name": pub["name"],\n'
            '            "avatar": pub["avatar"],\n'
            '            "x": me["x"],\n'
            '            "y": me["y"],\n'
            '            "ry": me["ry"],\n'
            '            "world": join_world,\n'
            '            "room": None,\n'
            '        },\n'
            '        "players": metaverse_room.snapshot_players(join_world),\n'
            '        "history": history,\n'
            '    }'
        )
        new_w = (
            '    bones = metaverse_room.ensure_bones(join_world)\n'
            '    welcome = {\n'
            '        "type": "welcome",\n'
            '        "world": join_world,\n'
            '        "you": {\n'
            '            "email": email,\n'
            '            "name": pub["name"],\n'
            '            "avatar": pub["avatar"],\n'
            '            "x": me["x"],\n'
            '            "y": me["y"],\n'
            '            "ry": me["ry"],\n'
            '            "world": join_world,\n'
            '            "room": None,\n'
            '            "score": me.get("score", 0),\n'
            '        },\n'
            '        "players": metaverse_room.snapshot_players(join_world),\n'
            '        "history": history,\n'
            '        "bones": bones,\n'
            '    }'
        )
        if old_w not in text:
            raise SystemExit("welcome block not found")
        text = text.replace(old_w, new_w, 1)

    if '"bones": metaverse_room.ensure_bones(new_world)' not in text:
        old_wp = (
            '                            "type": "world_players",\n'
            '                            "world": new_world,\n'
            '                            "players": metaverse_room.snapshot_players(new_world),\n'
            '                            "history": hist,\n'
        )
        new_wp = (
            '                            "type": "world_players",\n'
            '                            "world": new_world,\n'
            '                            "players": metaverse_room.snapshot_players(new_world),\n'
            '                            "history": hist,\n'
            '                            "bones": metaverse_room.ensure_bones(new_world),\n'
        )
        if old_wp not in text:
            raise SystemExit("world_players block not found")
        text = text.replace(old_wp, new_wp, 1)

    if 'elif mtype == "emote":' not in text:
        old_ping = (
            '            elif mtype == "ping":\n'
            '                await websocket.send_text(json.dumps({"type": "pong"}))'
        )
        new_handlers = r'''            elif mtype == "emote":
                emoji = str(msg.get("emoji") or "")[:8]
                if not emoji:
                    continue
                cur_world = "plaza"
                async with metaverse_room._lock:
                    cur = metaverse_room.clients.get(email)
                    if cur:
                        cur["emote"] = emoji
                        cur_world = cur.get("world") or "plaza"
                await metaverse_room.broadcast(
                    {
                        "type": "emote",
                        "email": email,
                        "name": pub["name"],
                        "emoji": emoji,
                    },
                    world=cur_world,
                )
            elif mtype == "collect":
                bone_id = str(msg.get("id") or "")
                if not bone_id:
                    continue
                result = await metaverse_room.collect_bone(email, bone_id)
                if result:
                    await metaverse_room.broadcast(
                        {"type": "bone_collected", **result},
                        world=result["world"],
                    )
            elif mtype == "highfive":
                peer = str(msg.get("to") or "").strip().lower()
                if not peer or peer == email:
                    continue
                cur_world = "plaza"
                ok = False
                async with metaverse_room._lock:
                    me_c = metaverse_room.clients.get(email)
                    pe_c = metaverse_room.clients.get(peer)
                    if me_c and pe_c:
                        cur_world = me_c.get("world") or "plaza"
                        if (me_c.get("world") or "plaza") == (pe_c.get("world") or "plaza"):
                            if abs(me_c["x"] - pe_c["x"]) <= 50 and abs(me_c["y"] - pe_c["y"]) <= 50:
                                ok = True
                if ok:
                    await metaverse_room.broadcast(
                        {
                            "type": "highfive",
                            "a": email,
                            "b": peer,
                            "a_name": pub["name"],
                        },
                        world=cur_world,
                    )
            elif mtype == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))'''
        if old_ping not in text:
            raise SystemExit("ping handler not found")
        text = text.replace(old_ping, new_handlers, 1)

    MAIN.write_text(text, encoding="utf-8")
    print("main.py patched")


def write_metaverse_js():
    # Read existing and surgically enhance rather than full rewrite if possible.
    # We'll write an enhanced complete client based on current structure.
    js = Path(__file__).with_name("metaverse_fun.js")
    if not js.exists():
        # content written separately
        raise SystemExit("metaverse_fun.js missing")
    content = js.read_text(encoding="utf-8")
    content = content.replace("__CACHE_BUST__", BUST)
    MV.write_text(content, encoding="utf-8")
    print("metaverse.js written", len(content))


def patch_index():
    text = INDEX.read_text(encoding="utf-8")
    text2 = re.sub(
        r'/static/metaverse\.js\?v=\d+',
        f'/static/metaverse.js?v={BUST}',
        text,
        count=1,
    )
    css_extra = """
  .mv-score{ margin-top:6px; display:inline-block; padding:4px 10px; border-radius:999px; background:rgba(255,180,40,0.35); font-size:0.78rem; font-weight:700; text-shadow:0 1px 3px #000; }
  .mv-emotes{ position:absolute; left:10px; bottom:10px; display:flex; gap:6px; z-index:3; pointer-events:auto; }
  .mv-emote-btn{ margin:0; width:40px; height:40px; padding:0; border-radius:12px; font-size:1.2rem; background:rgba(0,0,0,0.45); border:1px solid rgba(255,255,255,0.2); color:#fff; }
  .mv-dpad{ position:absolute; right:10px; bottom:10px; width:110px; height:110px; z-index:3; pointer-events:auto; display:none; }
  .mv-dpad-btn{ position:absolute; width:36px; height:36px; border-radius:10px; margin:0; padding:0; background:rgba(0,0,0,0.45); border:1px solid rgba(255,255,255,0.2); color:#fff; font-size:0.9rem; }
  .mv-dpad-btn.up{ left:37px; top:0; }
  .mv-dpad-btn.down{ left:37px; bottom:0; }
  .mv-dpad-btn.left{ left:0; top:37px; }
  .mv-dpad-btn.right{ right:0; top:37px; }
  @media (max-width:700px){ .mv-dpad{ display:block; } }
  .mv-toast{ position:absolute; left:50%; top:48%; transform:translate(-50%,-50%); font-size:1.4rem; font-weight:800; color:#fff; text-shadow:0 2px 8px #000; pointer-events:none; z-index:6; opacity:0; transition:opacity .2s; }
  .mv-toast.show{ opacity:1; }
"""
    if ".mv-score{" not in text2:
        text2 = text2.replace(
            "  .mv-world-bar{ pointer-events:none; }\n",
            "  .mv-world-bar{ pointer-events:none; }\n" + css_extra,
            1,
        )
    # also update cache bust comment if script tag uses different pattern
    if f"metaverse.js?v={BUST}" not in text2:
        text2 = text2.replace(
            'src="/static/metaverse.js',
            f'src="/static/metaverse.js?v={BUST}',
            1,
        ) if '?v=' not in text2.split('metaverse.js')[0][-20:] else text2
    INDEX.write_text(text2, encoding="utf-8")
    print("index.html patched bust", BUST)


if __name__ == "__main__":
    patch_main()
    write_metaverse_js()
    patch_index()
    print("DONE", BUST)
