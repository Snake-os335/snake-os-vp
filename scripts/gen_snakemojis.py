#!/usr/bin/env python3
"""Generate Snake OS snakemojis for every missing Unicode emoji.

Style matched to the hand-drawn 299 assets:
  - viewBox 0 0 72 72
  - outline #14532d, round caps/joins
  - soft vertical gradients, white specular highlights
  - bold flat cartoon shapes
Never overwrites existing snk-emoji-*.svg files.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(os.environ.get("SNAKEOS_ROOT", "/srv/juegos_david/snake-os"))
ASSETS = ROOT / "assets"
OUT_DATA_JS = ROOT / "snake-emoji-data.js"
EMOJI_JSON = Path(os.environ.get("EMOJI_JSON", "/tmp/emoji.json"))

STROKE = "#14532d"
INK = "#10220f"

# Category map (emoji.json group → snakemoji category key)
GROUP_CAT = {
    "Smileys & Emotion": "caras",
    "People & Body": "gestos",
    "Animals & Nature": "animales",
    "Food & Drink": "comida",
    "Travel & Places": "naturaleza",
    "Activities": "objetos",
    "Objects": "objetos",
    "Symbols": "símbolos",
    "Flags": "banderas",
    "Component": "símbolos",
}

# Spanish-ish short labels for common English tokens (fallback: english name)
ES = {
    "face": "cara", "grinning": "sonriente", "smiling": "sonrisa", "heart": "corazón",
    "hand": "mano", "flag": "bandera", "cat": "gato", "dog": "perro", "fire": "fuego",
    "star": "estrella", "sun": "sol", "moon": "luna", "tree": "árbol", "flower": "flor",
    "food": "comida", "drink": "bebida", "car": "coche", "house": "casa", "book": "libro",
}


def norm_code(codes: str) -> str:
    return codes.replace(" ", "-").lower()


def code_of_char(ch: str) -> str:
    ch = ch.replace("\ufe0f", "")
    return "-".join(f"{ord(c):x}" for c in ch)


def hfloat(seed: str, i: int = 0) -> float:
    dig = hashlib.md5(f"{seed}:{i}".encode()).hexdigest()
    return int(dig[:8], 16) / 0xFFFFFFFF


def hpick(seed: str, items: list, i: int = 0):
    return items[int(hfloat(seed, i) * len(items)) % len(items)]


def grad(gid: str, c0: str, c1: str) -> str:
    return (
        f'<linearGradient id="{gid}" x1="0" x2="0" y1="0" y2="1">'
        f'<stop offset="0" stop-color="{c0}"/>'
        f'<stop offset="1" stop-color="{c1}"/>'
        f"</linearGradient>"
    )


def highlight(cx=22, cy=20, rx=6, ry=3, rot=-35, op=0.45) -> str:
    return (
        f'<ellipse cx="{cx}" cy="{cy}" fill="#fff" opacity="{op}" '
        f'rx="{rx}" ry="{ry}" transform="rotate({rot} {cx} {cy})"/>'
    )


def wrap(inner: str, defs: str = "") -> str:
    d = f"<defs>{defs}</defs>" if defs else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">'
        f"{d}<g stroke-linecap=\"round\" stroke-linejoin=\"round\">{inner}</g></svg>"
    )


def face_svg(seed: str, name: str) -> str:
    # Skin / base: snake-green for "snake" vibe on smileys, warm yellow for others by hash
    n = name.lower()
    if any(k in n for k in ("devil", "imp", "angry", "rage", "pouting")):
        c0, c1 = "#ff8a7a", "#d94141"
    elif any(k in n for k in ("cold", "freezing", "snow")):
        c0, c1 = "#c9f0ff", "#6ab4e8"
    elif any(k in n for k in ("hot", "sweat", "fever")):
        c0, c1 = "#ffd0a8", "#f08a4b"
    elif any(k in n for k in ("sick", "nause", "green")):
        c0, c1 = "#c6f0a0", "#6aad3a"
    elif "cat" in n:
        c0, c1 = "#ffd59a", "#e09a3e"
    else:
        # alternate snake-green / classic yellow
        if hfloat(seed, 1) < 0.55:
            c0, c1 = "#a6f0a0", "#2fae5f"
        else:
            c0, c1 = "#ffe56a", "#f0b429"

    defs = grad("a", c0, c1)
    eyes = ""
    mouth = ""
    extras = ""

    # Eyes
    if any(k in n for k in ("heart", "love", "smiling face with heart")):
        eyes = (
            '<path fill="#ff5d73" stroke="#14532d" stroke-width="1.6" '
            'd="M24 30c0-4 4-6 6-3 2-3 6-1 6 3 0 4-6 8-6 8s-6-4-6-8zm12 0c0-4 4-6 6-3 2-3 6-1 6 3 0 4-6 8-6 8s-6-4-6-8z"/>'
        )
    elif "star" in n:
        eyes = (
            '<path fill="#ffd43b" stroke="#14532d" stroke-width="1.4" '
            'd="m27 26 2.2 4.4 4.8.4-3.7 3.2 1.1 4.7L27 36.2 22.6 38.7l1.1-4.7-3.7-3.2 4.8-.4zm18 0 2.2 4.4 4.8.4-3.7 3.2 1.1 4.7L45 36.2 40.6 38.7l1.1-4.7-3.7-3.2 4.8-.4z"/>'
        )
    elif any(k in n for k in ("closed", "sleep", "relieved", "peaceful")):
        eyes = (
            '<path fill="none" stroke="#14532d" stroke-width="3" d="M20 34q6-8 12 0m8 0q6-8 12 0"/>'
        )
    elif "wink" in n:
        eyes = (
            '<ellipse cx="27" cy="34" fill="#14532d" rx="3.2" ry="3.6"/>'
            '<path fill="none" stroke="#14532d" stroke-width="3" d="M40 34q6-7 12 0"/>'
            '<circle cx="28.1" cy="32.8" r="1.1" fill="#fff"/>'
        )
    elif any(k in n for k in ("angry", "rage", "pouting")):
        eyes = (
            '<path fill="none" stroke="#14532d" stroke-width="3" d="M18 28l12 6m24-6-12 6"/>'
            '<ellipse cx="27" cy="36" fill="#14532d" rx="3" ry="3.4"/>'
            '<ellipse cx="45" cy="36" fill="#14532d" rx="3" ry="3.4"/>'
        )
    else:
        eyes = (
            '<ellipse cx="27" cy="34" fill="#14532d" rx="3.2" ry="3.6"/>'
            '<ellipse cx="45" cy="34" fill="#14532d" rx="3.2" ry="3.6"/>'
            '<circle cx="28.1" cy="32.8" r="1.1" fill="#fff"/>'
            '<circle cx="46.1" cy="32.8" r="1.1" fill="#fff"/>'
        )

    # Mouth
    if any(k in n for k in ("joy", "laugh", "rofl", "tears of joy", "grin")):
        mouth = (
            '<path fill="#5a1220" stroke="#14532d" stroke-width="2.4" '
            'd="M22 42q14 2 28 0-1.5 16-14 16T22 42"/>'
            '<path fill="#fff" d="M24 43q12 1.2 24 0l-.8 3.6Q36 48 24.8 46.6Z"/>'
            '<path fill="#ff5d73" d="M31 56q5-5 10 0Z"/>'
        )
    elif any(k in n for k in ("smile", "blush", "happy", "grinning")):
        mouth = '<path fill="none" stroke="#14532d" stroke-width="3.2" d="M24 46q12 12 24 0"/>'
    elif any(k in n for k in ("sad", "frown", "cry", "disappointed", "worried")):
        mouth = '<path fill="none" stroke="#14532d" stroke-width="3.2" d="M24 54q12-12 24 0"/>'
        if "cry" in n or "tear" in n:
            extras += '<ellipse cx="22" cy="44" fill="#6ec8ff" stroke="#14532d" stroke-width="1.4" rx="2.4" ry="4"/>'
    elif any(k in n for k in ("open mouth", "astonished", "scream", "fearful", "surprised", "hushed")):
        mouth = '<ellipse cx="36" cy="50" fill="#5a1220" stroke="#14532d" stroke-width="2.4" rx="7" ry="8"/>'
    elif "tongue" in n:
        mouth = (
            '<path fill="none" stroke="#14532d" stroke-width="3" d="M24 44q12 10 24 0"/>'
            '<path fill="#ff5d73" stroke="#14532d" stroke-width="1.6" d="M30 48q6 10 12 0v-2H30z"/>'
        )
    elif "neutral" in n or "expressionless" in n:
        mouth = '<path stroke="#14532d" stroke-width="3.2" d="M26 50h20"/>'
    elif "zipper" in n:
        mouth = '<path stroke="#14532d" stroke-width="3" d="M24 50h24"/><path stroke="#889" stroke-width="2" d="M28 50v4m4-4v4m4-4v4m4-4v4m4-4v4"/>'
    else:
        # slight smile default
        mouth = '<path fill="none" stroke="#14532d" stroke-width="3" d="M26 48q10 8 20 0"/>'

    if "sunglasses" in n or "cool" in n:
        extras += (
            '<rect x="16" y="30" width="16" height="10" rx="3" fill="#10220f" stroke="#14532d" stroke-width="1.6"/>'
            '<rect x="40" y="30" width="16" height="10" rx="3" fill="#10220f" stroke="#14532d" stroke-width="1.6"/>'
            '<path stroke="#14532d" stroke-width="2.4" d="M32 35h8"/>'
        )
        eyes = ""
    if "mask" in n:
        extras += (
            '<path fill="#dfefff" stroke="#14532d" stroke-width="2" '
            'd="M18 44q18-6 36 0v8q-18 8-36 0z"/>'
        )
        mouth = ""
    if "halo" in n or "innocent" in n:
        extras += '<ellipse cx="36" cy="10" fill="none" stroke="#ffd43b" stroke-width="3" rx="16" ry="5"/>'
    if "sleeping" in n or n.endswith("zzz"):
        extras += '<text x="50" y="22" font-size="10" fill="#14532d" font-family="sans-serif">z</text>'

    body = (
        f'<ellipse cx="36" cy="38" fill="url(#a)" stroke="{STROKE}" stroke-width="2.8" rx="27" ry="25"/>'
        f"{highlight()}"
        f"{eyes}{mouth}{extras}"
    )
    return wrap(body, defs)


def heart_svg(seed: str, name: str) -> str:
    colors = {
        "red": ("#ff7a8a", "#e0314a"),
        "orange": ("#ffb06a", "#f08a24"),
        "yellow": ("#ffe56a", "#e6b800"),
        "green": ("#a6f0a0", "#2fae5f"),
        "blue": ("#8ec5ff", "#3b82f6"),
        "purple": ("#d3a6ff", "#8b5cf6"),
        "black": ("#4a5560", "#1a1f24"),
        "white": ("#ffffff", "#dce3ea"),
        "brown": ("#d2a679", "#8b5a2b"),
        "pink": ("#ffb3d1", "#f472b6"),
        "light blue": ("#b9e7ff", "#38bdf8"),
        "grey": ("#c5ccd3", "#6b7280"),
        "gray": ("#c5ccd3", "#6b7280"),
    }
    c0, c1 = "#ff7a8a", "#e0314a"
    nl = name.lower()
    for k, v in colors.items():
        if k in nl:
            c0, c1 = v
            break
    defs = grad("a", c0, c1)
    path = (
        f'<path fill="url(#a)" stroke="{STROKE}" stroke-width="2.6" '
        'd="M36 60S12 44 12 28c0-8 6-14 14-14 5 0 8 2 10 5 2-3 5-5 10-5 8 0 14 6 14 14 0 16-24 32-24 32z"/>'
    )
    if "broken" in nl:
        path += f'<path fill="none" stroke="{STROKE}" stroke-width="2.4" d="M36 22v34"/>'
    if "fire" in nl:
        path += (
            f'<path fill="#ff9f1a" stroke="{STROKE}" stroke-width="1.8" '
            'd="M30 18c2-6 6-8 8-12 6 6 8 12 4 18-2 3-6 4-8 2-4 4-8 2-10-2 2-2 4-4 6-6z"/>'
        )
    body = path + highlight(26, 28, 5, 2.4, -30, 0.5)
    return wrap(body, defs)


def hand_svg(seed: str, name: str) -> str:
    defs = grad("a", "#a6f0a0", "#2fae5f")
    nl = name.lower()
    if "thumb" in nl and "up" in nl:
        body = (
            f'<rect width="24" height="26" x="20" y="34" fill="{STROKE}" stroke="{STROKE}" stroke-width="5.2" rx="8"/>'
            f'<rect width="20" height="7.5" x="34" y="34" fill="{STROKE}" stroke="{STROKE}" stroke-width="5.2" rx="3.75"/>'
            f'<rect width="19" height="7.5" x="34" y="41" fill="{STROKE}" stroke="{STROKE}" stroke-width="5.2" rx="3.75"/>'
            f'<rect width="18" height="7.5" x="34" y="48" fill="{STROKE}" stroke="{STROKE}" stroke-width="5.2" rx="3.75"/>'
            f'<rect width="15" height="6.5" x="34" y="55" fill="{STROKE}" stroke="{STROKE}" stroke-width="5.2" rx="3.25"/>'
            f'<rect width="10" height="30" x="20" y="10" fill="{STROKE}" stroke="{STROKE}" stroke-width="5.2" rx="5" transform="rotate(-12 25 40)"/>'
            f'<rect width="24" height="26" x="20" y="34" fill="url(#a)" rx="8"/>'
            f'<rect width="20" height="7.5" x="34" y="34" fill="url(#a)" rx="3.75"/>'
            f'<rect width="19" height="7.5" x="34" y="41" fill="url(#a)" rx="3.75"/>'
            f'<rect width="18" height="7.5" x="34" y="48" fill="url(#a)" rx="3.75"/>'
            f'<rect width="15" height="6.5" x="34" y="55" fill="url(#a)" rx="3.25"/>'
            f'<rect width="10" height="30" x="20" y="10" fill="url(#a)" rx="5" transform="rotate(-12 25 40)"/>'
            + '<path fill="none" stroke="#fff" stroke-width="1.4" d="M28 46q3 3 6 0m2 0q3 3 6 0" opacity=".45"/>'
        )
    elif "thumb" in nl and "down" in nl:
        body = (
            f'<g transform="rotate(180 36 36)">'
            f'<rect width="24" height="26" x="20" y="34" fill="url(#a)" stroke="{STROKE}" stroke-width="2.6" rx="8"/>'
            f'<rect width="10" height="28" x="20" y="12" fill="url(#a)" stroke="{STROKE}" stroke-width="2.6" rx="5" transform="rotate(-12 25 40)"/>'
            f"</g>"
        )
    else:
        # open hand / generic
        body = (
            f'<ellipse cx="36" cy="44" rx="18" ry="16" fill="url(#a)" stroke="{STROKE}" stroke-width="2.6"/>'
            f'<rect x="18" y="14" width="8" height="28" rx="4" fill="url(#a)" stroke="{STROKE}" stroke-width="2.2"/>'
            f'<rect x="28" y="10" width="8" height="30" rx="4" fill="url(#a)" stroke="{STROKE}" stroke-width="2.2"/>'
            f'<rect x="38" y="10" width="8" height="30" rx="4" fill="url(#a)" stroke="{STROKE}" stroke-width="2.2"/>'
            f'<rect x="48" y="16" width="8" height="26" rx="4" fill="url(#a)" stroke="{STROKE}" stroke-width="2.2"/>'
            + highlight(28, 42, 5, 2.5, -20, 0.4)
        )
    return wrap(body, defs)


def animal_svg(seed: str, name: str) -> str:
    palette = [
        ("#a6f0a0", "#2fae5f"),
        ("#ffd59a", "#e09a3e"),
        ("#f5c6d0", "#e87a9a"),
        ("#c9e4ff", "#6aa8e8"),
        ("#e6c49a", "#a0662e"),
        ("#d9d9d9", "#7a7a7a"),
        ("#ffe56a", "#e0b000"),
    ]
    c0, c1 = hpick(seed, palette, 0)
    nl = name.lower()
    if "snake" in nl or "dragon" in nl:
        c0, c1 = "#a6f0a0", "#2fae5f"
    elif "bear" in nl or "monkey" in nl:
        c0, c1 = "#a0662e", "#6b3f16"
    elif "panda" in nl:
        c0, c1 = "#f5f5f5", "#d0d0d0"
    elif "frog" in nl:
        c0, c1 = "#a6f0a0", "#2fae5f"
    elif "pig" in nl:
        c0, c1 = "#ffb6c8", "#f4729a"
    elif "lion" in nl or "tiger" in nl:
        c0, c1 = "#ffd59a", "#e09a3e"
    defs = grad("a", c0, c1)
    ear_l = f'<circle cx="14" cy="20" r="9" fill="url(#a)" stroke="{STROKE}" stroke-width="2.4"/>'
    ear_r = f'<circle cx="58" cy="20" r="9" fill="url(#a)" stroke="{STROKE}" stroke-width="2.4"/>'
    if "cat" in nl or "tiger" in nl:
        ear_l = f'<path fill="url(#a)" stroke="{STROKE}" stroke-width="2.4" d="M8 28 20 8l12 16z"/>'
        ear_r = f'<path fill="url(#a)" stroke="{STROKE}" stroke-width="2.4" d="M64 28 52 8 40 24z"/>'
    body = (
        f"{ear_l}{ear_r}"
        f'<circle cx="36" cy="40" r="24" fill="url(#a)" stroke="{STROKE}" stroke-width="2.8"/>'
        f"{highlight(24, 28)}"
        f'<ellipse cx="27" cy="38" fill="{INK}" rx="3.4" ry="3.8"/>'
        f'<ellipse cx="45" cy="38" fill="{INK}" rx="3.4" ry="3.8"/>'
        f'<circle cx="28.2" cy="36.6" r="1.2" fill="#fff"/>'
        f'<circle cx="46.2" cy="36.6" r="1.2" fill="#fff"/>'
        f'<path fill="none" stroke="{STROKE}" stroke-width="2.4" d="M28 50q8 7 16 0"/>'
        f'<ellipse cx="36" cy="46" fill="#ffb3c4" opacity=".55" rx="4" ry="2.5"/>'
    )
    if "snake" in nl:
        body = (
            f'<path fill="url(#a)" stroke="{STROKE}" stroke-width="2.8" '
            'd="M14 48c0-14 10-22 22-22 8 0 12 4 14 8 4-6 12-6 16 2 4 8-2 18-12 20-12 2-24-2-30-8-4-4-10-2-10 0z"/>'
            f"{highlight(28, 36)}"
            f'<ellipse cx="40" cy="34" fill="{INK}" rx="2.6" ry="3"/>'
            f'<ellipse cx="50" cy="34" fill="{INK}" rx="2.6" ry="3"/>'
            f'<path fill="#ff5d73" d="M54 42c4 2 8 0 10-2-2 6-8 8-12 4z"/>'
        )
    return wrap(body, defs)


def food_svg(seed: str, name: str) -> str:
    palette = [
        ("#ff7a8a", "#e0314a"),
        ("#a6f0a0", "#2fae5f"),
        ("#ffe56a", "#e0b000"),
        ("#ffb06a", "#f08a24"),
        ("#d2a679", "#8b5a2b"),
        ("#c9e4ff", "#6aa8e8"),
    ]
    c0, c1 = hpick(seed, palette, 2)
    nl = name.lower()
    if any(k in nl for k in ("apple", "cherry", "strawberry", "watermelon", "tomato")):
        c0, c1 = "#ff7a8a", "#e0314a"
    elif any(k in nl for k in ("lemon", "banana", "cheese", "corn")):
        c0, c1 = "#ffe56a", "#e0b000"
    elif any(k in nl for k in ("grape", "eggplant")):
        c0, c1 = "#d3a6ff", "#8b5cf6"
    elif "green" in nl or "salad" in nl or "avocado" in nl:
        c0, c1 = "#a6f0a0", "#2fae5f"
    defs = grad("a", c0, c1)
    shape = int(hfloat(seed, 3) * 3)
    if shape == 0:
        body = (
            f'<circle cx="36" cy="40" r="22" fill="url(#a)" stroke="{STROKE}" stroke-width="2.8"/>'
            f'<path fill="#2fae5f" stroke="{STROKE}" stroke-width="1.8" d="M36 18c4-8 12-8 14-2-8 2-12 6-14 10-2-4-6-8-14-10 2-6 10-6 14 2z"/>'
            + highlight(26, 32)
        )
    elif shape == 1:
        body = (
            f'<rect x="14" y="22" width="44" height="36" rx="12" fill="url(#a)" stroke="{STROKE}" stroke-width="2.8"/>'
            + highlight(24, 32)
            + f'<path fill="none" stroke="{STROKE}" stroke-width="2" d="M22 40h28M22 48h20" opacity=".35"/>'
        )
    else:
        body = (
            f'<ellipse cx="36" cy="40" rx="24" ry="18" fill="url(#a)" stroke="{STROKE}" stroke-width="2.8"/>'
            + highlight(26, 34)
            + f'<circle cx="36" cy="40" r="6" fill="#fff" opacity=".35"/>'
        )
    return wrap(body, defs)


def nature_svg(seed: str, name: str) -> str:
    nl = name.lower()
    if "sun" in nl:
        rays = "".join(
            f'<ellipse cx="36" cy="10" fill="#ffd43b" stroke="{STROKE}" stroke-width="2" '
            f'rx="4" ry="9" transform="rotate({a} 36 36)"/>'
            for a in range(0, 360, 45)
        )
        return wrap(
            rays + f'<circle cx="36" cy="36" r="14" fill="#ffe56a" stroke="{STROKE}" stroke-width="2.6"/>' + highlight(30, 30, 4, 2, -30, 0.5)
        )
    if "moon" in nl:
        return wrap(
            f'<circle cx="36" cy="36" r="22" fill="#ffe56a" stroke="{STROKE}" stroke-width="2.6"/>'
            f'<circle cx="46" cy="30" r="16" fill="#0d2418"/>'
            + highlight(26, 28, 4, 2, -30, 0.35)
        )
    if "cloud" in nl or "rain" in nl:
        body = (
            f'<ellipse cx="28" cy="38" rx="16" ry="12" fill="#e8f4ff" stroke="{STROKE}" stroke-width="2.4"/>'
            f'<ellipse cx="44" cy="40" rx="14" ry="11" fill="#e8f4ff" stroke="{STROKE}" stroke-width="2.4"/>'
            f'<ellipse cx="36" cy="30" rx="12" ry="10" fill="#e8f4ff" stroke="{STROKE}" stroke-width="2.4"/>'
        )
        if "rain" in nl:
            body += f'<path stroke="#6aa8e8" stroke-width="3" d="M24 54v8m10-6v8m10-8v8"/>'
        return wrap(body)
    if "flower" in nl or "rosette" in nl or "blossom" in nl or "tulip" in nl or "rose" in nl or "sunflower" in nl:
        petal = "#ffb3d1" if "rose" in nl or "cherry" in nl else "#ffd43b"
        petals = "".join(
            f'<ellipse cx="36" cy="16" fill="{petal}" stroke="{STROKE}" stroke-width="2" '
            f'rx="7" ry="12" transform="rotate({a} 36 36)"/>'
            for a in range(0, 360, 45)
        )
        return wrap(petals + f'<circle cx="36" cy="36" r="10" fill="#7a4a1e" stroke="{STROKE}" stroke-width="2.4"/>')
    if "tree" in nl or "herb" in nl or "seedling" in nl or "cactus" in nl:
        defs = grad("a", "#a6f0a0", "#2fae5f")
        return wrap(
            f'<rect x="30" y="40" width="12" height="22" rx="3" fill="#8b5a2b" stroke="{STROKE}" stroke-width="2"/>'
            f'<circle cx="36" cy="30" r="18" fill="url(#a)" stroke="{STROKE}" stroke-width="2.6"/>'
            + highlight(28, 24),
            defs,
        )
    # default nature blob
    defs = grad("a", "#a6f0a0", "#2fae5f")
    return wrap(
        f'<circle cx="36" cy="36" r="24" fill="url(#a)" stroke="{STROKE}" stroke-width="2.8"/>' + highlight(),
        defs,
    )


def object_svg(seed: str, name: str) -> str:
    nl = name.lower()
    if "fire" in nl:
        return wrap(
            f'<path fill="#ff9f1a" stroke="{STROKE}" stroke-width="2.6" '
            'd="M36 62c14 0 22-10 22-22 0-10-6-16-10-22 2 8-2 12-6 12 2-10-4-18-12-24 0 10-6 14-8 20-6-4-10 0-12 6-4 8 2 30 26 30z"/>'
            f'<path fill="#ffe56a" d="M36 54c8 0 12-6 12-12 0-6-4-8-6-12 0 6-4 8-6 8 0-6-2-10-6-14 0 6-4 8-6 12-2 4 2 18 12 18z"/>'
        )
    if "star" in nl:
        return wrap(
            f'<path fill="#ffd43b" stroke="{STROKE}" stroke-width="2.8" '
            'd="m36 8 7.94 19.08 20.59 1.65-15.69 13.44 4.79 20.1L36 51.5 18.37 62.27l4.79-20.1L7.47 28.73l20.59-1.65z"/>'
            + highlight(30, 28, 5, 2.6, -30, 0.55)
        )
    if "rocket" in nl:
        defs = grad("a", "#a6f0a0", "#2fae5f")
        return wrap(
            f'<path fill="url(#a)" stroke="{STROKE}" stroke-width="2.6" d="M36 6c10 14 12 28 10 44l-10 8-10-8C24 34 26 20 36 6z"/>'
            f'<circle cx="36" cy="28" r="5" fill="#c9e4ff" stroke="{STROKE}" stroke-width="2"/>'
            f'<path fill="#ff9f1a" stroke="{STROKE}" stroke-width="1.8" d="M28 58 36 70l8-12-8 4z"/>',
            defs,
        )
    if any(k in nl for k in ("phone", "mobile")):
        return wrap(
            f'<rect x="20" y="8" width="32" height="56" rx="6" fill="#1a2e22" stroke="{STROKE}" stroke-width="2.6"/>'
            f'<rect x="24" y="14" width="24" height="40" rx="2" fill="#a6f0a0"/>'
            f'<circle cx="36" cy="60" r="2.5" fill="#a6f0a0"/>'
        )
    if "laptop" in nl or "computer" in nl:
        return wrap(
            f'<rect x="12" y="14" width="48" height="32" rx="4" fill="#1a2e22" stroke="{STROKE}" stroke-width="2.6"/>'
            f'<rect x="16" y="18" width="40" height="24" fill="#a6f0a0"/>'
            f'<path fill="#2fae5f" stroke="{STROKE}" stroke-width="2" d="M8 48h56l-4 8H12z"/>'
        )
    # generic rounded tile with icon mark
    c0, c1 = hpick(seed, [("#a6f0a0", "#2fae5f"), ("#ffd59a", "#e09a3e"), ("#c9e4ff", "#6aa8e8"), ("#ffb3d1", "#f472b6")], 4)
    defs = grad("a", c0, c1)
    mark = int(hfloat(seed, 5) * 4)
    extras = ""
    if mark == 0:
        extras = f'<circle cx="36" cy="36" r="10" fill="#fff" opacity=".35"/>'
    elif mark == 1:
        extras = f'<rect x="26" y="26" width="20" height="20" rx="4" fill="#fff" opacity=".35"/>'
    elif mark == 2:
        extras = f'<path fill="#fff" opacity=".4" d="m36 22 8 14H28z"/>'
    else:
        extras = f'<path stroke="#fff" stroke-width="3" opacity=".5" d="M24 36h24M36 24v24"/>'
    return wrap(
        f'<rect x="10" y="10" width="52" height="52" rx="14" fill="url(#a)" stroke="{STROKE}" stroke-width="2.8"/>'
        + highlight(22, 22, 7, 3.5, -30, 0.4)
        + extras,
        defs,
    )


def symbol_svg(seed: str, name: str) -> str:
    nl = name.lower()
    if "check" in nl or "heavy check" in nl:
        return wrap(
            f'<circle cx="36" cy="36" r="26" fill="#a6f0a0" stroke="{STROKE}" stroke-width="2.8"/>'
            f'<path fill="none" stroke="{STROKE}" stroke-width="5" d="M20 37l10 10 22-24"/>'
        )
    if "cross" in nl or "multiply" in nl or "x " in nl or nl.endswith(" x") or "cross mark" in nl:
        return wrap(
            f'<circle cx="36" cy="36" r="26" fill="#ff8a7a" stroke="{STROKE}" stroke-width="2.8"/>'
            f'<path stroke="{STROKE}" stroke-width="5" d="M24 24l24 24M48 24 24 48"/>'
        )
    if "question" in nl:
        return wrap(
            f'<circle cx="36" cy="36" r="26" fill="#ffe56a" stroke="{STROKE}" stroke-width="2.8"/>'
            f'<path fill="none" stroke="{STROKE}" stroke-width="4" d="M26 28c0-8 16-10 16 2 0 8-8 8-8 14"/>'
            f'<circle cx="36" cy="52" r="3" fill="{STROKE}"/>'
        )
    if "exclamation" in nl:
        return wrap(
            f'<circle cx="36" cy="36" r="26" fill="#ffb06a" stroke="{STROKE}" stroke-width="2.8"/>'
            f'<path stroke="{STROKE}" stroke-width="5" d="M36 18v24"/>'
            f'<circle cx="36" cy="52" r="3.2" fill="{STROKE}"/>'
        )
    if "warning" in nl:
        return wrap(
            f'<path fill="#ffe56a" stroke="{STROKE}" stroke-width="2.8" d="m36 10 26 48H10z"/>'
            f'<path stroke="{STROKE}" stroke-width="4" d="M36 28v16"/>'
            f'<circle cx="36" cy="52" r="2.8" fill="{STROKE}"/>'
        )
    # geometric badge
    c0, c1 = hpick(seed, [("#a6f0a0", "#2fae5f"), ("#ffe56a", "#e0b000"), ("#c9e4ff", "#6aa8e8")], 6)
    defs = grad("a", c0, c1)
    return wrap(
        f'<circle cx="36" cy="36" r="26" fill="url(#a)" stroke="{STROKE}" stroke-width="2.8"/>'
        + highlight(24, 24, 6, 3, -30, 0.4)
        + f'<text x="36" y="42" text-anchor="middle" font-size="22" font-family="ui-rounded,Segoe UI,sans-serif" fill="{STROKE}" font-weight="700">•</text>',
        defs,
    )


def flag_svg(seed: str, name: str, codes: str) -> str:
    # Parse regional indicators → 2-letter if possible
    parts = codes.lower().split("-")
    cols = ["#a6f0a0", "#2fae5f", "#ffe56a"]
    if len(parts) >= 2 and all(re.fullmatch(r"1f1[ef][0-9a-f]", p) for p in parts[:2]):
        # deterministic colors from letters
        a = int(parts[0][-2:], 16)
        b = int(parts[1][-2:], 16)
        palette = [
            "#e0314a", "#2fae5f", "#3b82f6", "#ffe56a", "#ffffff",
            "#111827", "#f08a24", "#8b5cf6", "#38bdf8", "#a0662e",
        ]
        cols = [palette[a % len(palette)], palette[b % len(palette)], palette[(a + b) % len(palette)]]
    nl = name.lower()
    if "rainbow" in nl:
        bands = ["#e0314a", "#f08a24", "#ffe56a", "#2fae5f", "#3b82f6", "#8b5cf6"]
        body = f'<rect x="8" y="14" width="56" height="44" rx="6" fill="#fff" stroke="{STROKE}" stroke-width="2.6"/>'
        for i, c in enumerate(bands):
            body += f'<rect x="10" y="{16 + i * 6.5:.1f}" width="52" height="6.5" fill="{c}"/>'
        return wrap(body)
    if "chequered" in nl or "checkered" in nl:
        body = f'<rect x="8" y="14" width="56" height="44" rx="6" fill="#fff" stroke="{STROKE}" stroke-width="2.6"/>'
        for y in range(4):
            for x in range(5):
                if (x + y) % 2 == 0:
                    body += f'<rect x="{10 + x * 10.4:.1f}" y="{16 + y * 10}" width="10.4" height="10" fill="#111"/>'
        return wrap(body)
    # triband
    body = (
        f'<rect x="8" y="14" width="56" height="44" rx="6" fill="{cols[1]}" stroke="{STROKE}" stroke-width="2.6"/>'
        f'<rect x="10" y="16" width="52" height="13" fill="{cols[0]}"/>'
        f'<rect x="10" y="42" width="52" height="14" fill="{cols[2]}"/>'
    )
    return wrap(body)


def people_svg(seed: str, name: str) -> str:
    # skin tones
    skins = {
        "1f3fb": ("#ffe0bd", "#e8c49a"),
        "1f3fc": ("#f0c2a0", "#d4a07a"),
        "1f3fd": ("#d1a074", "#b5471a"[:7] and "#b07a4a"),
        "1f3fe": ("#a0662e", "#7a4a1e"),
        "1f3ff": ("#6b3f16", "#4a2c0f"),
    }
    c0, c1 = "#a6f0a0", "#2fae5f"
    for tone, cols in skins.items():
        if tone in seed:
            c0, c1 = cols
            break
    else:
        if hfloat(seed, 8) < 0.5:
            c0, c1 = "#ffe0bd", "#e8c49a"
    defs = grad("a", c0, c1)
    body = (
        f'<circle cx="36" cy="22" r="12" fill="url(#a)" stroke="{STROKE}" stroke-width="2.4"/>'
        f'<path fill="url(#a)" stroke="{STROKE}" stroke-width="2.6" d="M16 62c2-18 10-26 20-26s18 8 20 26z"/>'
        + highlight(30, 18, 4, 2, -30, 0.4)
        + f'<ellipse cx="31" cy="22" fill="{INK}" rx="1.6" ry="1.8"/>'
        + f'<ellipse cx="41" cy="22" fill="{INK}" rx="1.6" ry="1.8"/>'
        + f'<path fill="none" stroke="{STROKE}" stroke-width="1.8" d="M31 28q5 4 10 0"/>'
    )
    return wrap(body, defs)


def make_svg(char: str, name: str, group: str, codes: str) -> str:
    seed = norm_code(codes)
    nl = name.lower()
    g = group or ""

    if "heart" in nl and "face" not in nl:
        return heart_svg(seed, name)
    if g.startswith("Smileys") or "face" in nl or "emoji" in nl and "face" in nl:
        return face_svg(seed, name)
    if g.startswith("Flags") or "flag" in nl:
        return flag_svg(seed, name, seed)
    if any(k in nl for k in ("thumb", "hand", "fist", "victory", "point", "clap", "wave", "ok hand", "raised")):
        return hand_svg(seed, name)
    if g.startswith("Animals") or any(k in nl for k in ("cat", "dog", "animal", "bird", "fish", "bug", "snake", "monkey", "bear", "lion")):
        # nature plants also in Animals & Nature
        if any(k in nl for k in ("tree", "flower", "plant", "leaf", "herb", "rose", "sunflower", "tulip", "seedling", "cactus")):
            return nature_svg(seed, name)
        return animal_svg(seed, name)
    if g.startswith("Food") or any(k in nl for k in ("food", "fruit", "drink", "cake", "pizza", "burger", "coffee", "tea", "bread")):
        return food_svg(seed, name)
    if g.startswith("Travel") or any(k in nl for k in ("sun", "moon", "cloud", "rain", "snow", "earth", "mountain", "beach")):
        return nature_svg(seed, name)
    if g.startswith("People"):
        return people_svg(seed, name)
    if g.startswith("Symbols"):
        return symbol_svg(seed, name)
    if g.startswith("Objects") or g.startswith("Activities"):
        return object_svg(seed, name)
    # fallback by keywords
    if any(k in nl for k in ("sun", "moon", "cloud", "tree", "flower")):
        return nature_svg(seed, name)
    if any(k in nl for k in ("star", "fire", "rocket", "phone", "book")):
        return object_svg(seed, name)
    return object_svg(seed, name)


def es_name(english: str) -> str:
    words = re.split(r"[\s-]+", english.lower())
    out = []
    for w in words:
        out.append(ES.get(w, w))
    s = " ".join(out).strip()
    return s[:48] if s else english[:48]


def cat_for(group: str, name: str) -> str:
    nl = name.lower()
    if "heart" in nl and "face" not in nl:
        return "corazones"
    if group in GROUP_CAT:
        # Animals & Nature split
        if group == "Animals & Nature":
            if any(k in nl for k in ("tree", "flower", "plant", "leaf", "herb", "rose", "sunflower", "tulip", "seedling", "cactus", "maple", "mushroom")):
                return "naturaleza"
            if any(k in nl for k in ("sun", "moon", "cloud", "rain", "snow", "earth", "globe", "water", "fire", "rainbow")):
                return "naturaleza"
            return "animales"
        if group == "Travel & Places":
            if any(k in nl for k in ("sun", "moon", "cloud", "rain", "snow", "earth", "mountain", "beach", "globe", "rainbow")):
                return "naturaleza"
            return "objetos"
        return GROUP_CAT[group]
    return "objetos"


def main() -> int:
    if not EMOJI_JSON.is_file():
        print("Missing emoji.json at", EMOJI_JSON, file=sys.stderr)
        return 1
    ASSETS.mkdir(parents=True, exist_ok=True)
    catalog = json.loads(EMOJI_JSON.read_text(encoding="utf-8"))
    existing = {p.name[len("snk-emoji-"):-4] for p in ASSETS.glob("snk-emoji-*.svg")}
    print(f"existing SVGs: {len(existing)}")

    rows = []  # [char, name, cat, code]
    seen_codes = set()
    generated = 0
    skipped = 0

    for e in catalog:
        codes = norm_code(e["codes"])
        if codes in seen_codes:
            continue
        seen_codes.add(codes)
        char = e["char"]
        name = e.get("name") or codes
        group = e.get("group") or ""
        cat = cat_for(group, name)
        rows.append([char, es_name(name), cat, codes])

        path = ASSETS / f"snk-emoji-{codes}.svg"
        if path.exists():
            skipped += 1
            continue
        svg = make_svg(char, name, group, codes)
        path.write_text(svg, encoding="utf-8")
        generated += 1
        if generated % 200 == 0:
            print(f"  generated {generated}…")

    # Write data module consumed by snake-emoji.js
    # Keep stable category order
    cat_order = ["caras", "corazones", "gestos", "animales", "comida", "naturaleza", "objetos", "símbolos", "banderas"]
    rows.sort(key=lambda r: (cat_order.index(r[2]) if r[2] in cat_order else 99, r[1], r[3]))

    OUT_DATA_JS.write_text(
        "/* auto-generated by gen_snakemojis.py — do not edit */\n"
        "window.__SNK_EMOJI_DATA = "
        + json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"done. generated={generated} skipped_existing={skipped} catalog={len(rows)}")
    print(f"wrote {OUT_DATA_JS}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
