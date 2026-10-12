#!/usr/bin/env python3
"""Restore Twemoji colors for non-faces; keep only smileys/faces green (snake)."""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
from pathlib import Path

# Reuse convert + recolor helpers
ROOT = Path(os.environ.get("SNAKEOS_ROOT", "/srv/juegos_david/snake-os"))
ASSETS = ROOT / "assets"
DATA_JS = ROOT / "snake-emoji-data.js"
EMOJI_JS = ROOT / "snake-emoji.js"
TWEMOJI = Path(os.environ.get("TWEMOJI_SVG", "/tmp/twemoji-assets/assets/svg"))
HAND_BAK = Path("/tmp/snakemoji-handmade-bak")

sys.path.insert(0, "/tmp")
sys.path.insert(0, str(ROOT / "scripts"))

# Import convert from build script
import importlib.util

spec = importlib.util.spec_from_file_location(
    "build_snk", str(ROOT / "scripts" / "build_detailed_snakemojis.py")
)
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)

from recolor_yellow_to_green import recolor_svg  # type: ignore


def handmade_codes() -> set[str]:
    js = EMOJI_JS.read_text(encoding="utf-8")
    m = re.search(r"var DATA_FALLBACK = (\[.*?\]);\n", js, re.S)
    if not m:
        return set()
    return set(re.findall(r',"([0-9a-f][0-9a-f-]+)"\]', m.group(1)))


def catalog() -> list:
    text = DATA_JS.read_text(encoding="utf-8")
    m = re.search(r"window\.__SNK_EMOJI_DATA = (\[.*\]);", text, re.S)
    return json.loads(m.group(1))


def is_face(name: str, cat: str) -> bool:
    if cat == "caras":
        return True
    n = (name or "").lower()
    # smileys sometimes miscategorized
    keys = (
        "face", "cara", "grin", "smile", "laugh", "cry", "sad", "angry",
        "wink", "kiss", "tongue", "sleep", "sick", "cold", "hot", "think",
        "neutral", "expression", "astonished", "fear", "scream", "dizzy",
        "cowboy", "party", "nerd", "monocle", "robot face", "ghost",
        "alien monster", "clown", "goblin", "ogre", "imp", "devil",
        "skull", "poop", "hankey", "see-no-evil", "hear-no-evil", "speak-no-evil",
        "monkey face", "cat face", "dog face", "tiger face", "lion face",
        "cow face", "pig face", "frog", "hamster", "bear face", "panda",
    )
    # Only treat as face if category is caras OR name clearly a face emoji
    # User asked only caritas - stick to cat==caras primarily
    return cat == "caras"


def main() -> int:
    if not TWEMOJI.is_dir():
        print("missing twemoji", TWEMOJI)
        return 1
    hand = handmade_codes()
    data = catalog()
    print(f"catalog={len(data)} handmade={len(hand)}")

    # 1) restore handmade from backup
    restored = 0
    if HAND_BAK.is_dir():
        for code in hand:
            src = HAND_BAK / f"snk-emoji-{code}.svg"
            dst = ASSETS / f"snk-emoji-{code}.svg"
            if src.exists():
                shutil.copy2(src, dst)
                restored += 1
    print(f"handmade_restored={restored}")

    faces_green = 0
    others_tw = 0
    miss = 0
    for row in data:
        name, cat, code = row[1], row[2], row[3]
        out = ASSETS / f"snk-emoji-{code}.svg"
        if code in hand:
            # handmade already restored; if face, optionally ensure yellow→green on leftover yellow
            if is_face(name, cat) and out.exists():
                raw = out.read_text(encoding="utf-8", errors="ignore")
                neu, n = recolor_svg(raw)
                if n and neu != raw:
                    out.write_text(neu, encoding="utf-8")
                    faces_green += 1
            continue

        src, mirror = build.find_twemoji(code)
        if not src:
            miss += 1
            continue
        try:
            svg = build.convert(src, mirror_x=mirror)
        except Exception:
            miss += 1
            continue

        if is_face(name, cat):
            svg, n = recolor_svg(svg)
            faces_green += 1
        else:
            others_tw += 1
        out.write_text(svg, encoding="utf-8")

    print(f"faces_green={faces_green} others_restored_twemoji={others_tw} miss={miss}")
    # samples
    for code, label in [
        ("1f603", "face"),
        ("1f600", "face-hand"),
        ("1f31e", "sun"),
        ("2b50", "star"),
        ("1f34c", "banana"),
        ("1f525", "fire"),
    ]:
        p = ASSETS / f"snk-emoji-{code}.svg"
        if not p.exists():
            continue
        t = p.read_text().lower()
        print(
            label,
            code,
            "ffcc4d" in t or "ffdc5d" in t or "ffd43b" in t,
            "a6f0a0" in t or "2fae5f" in t or "34d17a" in t,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
