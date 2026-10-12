#!/usr/bin/env python3
"""Recolor yellow/gold fills in snakemoji SVGs to Snake OS greens."""
from __future__ import annotations

import colorsys
import os
import re
import sys
from pathlib import Path

ROOT = Path(os.environ.get("SNAKEOS_ROOT", "/srv/juegos_david/snake-os"))
ASSETS = ROOT / "assets"

# Explicit Twemoji / common yellow → green
MAP = {
    "ffcc4d": "a6f0a0",
    "ffdc5d": "7ae089",
    "ffde57": "7ae089",
    "ffd83d": "5fd97a",
    "ffdb58": "7ae089",
    "ffdb5e": "7ae089",
    "ffd983": "9aeba8",
    "ffd43b": "5fd97a",
    "ffd03f": "5fd97a",
    "ffce31": "4fd06e",
    "ffce00": "3fc463",
    "ffe51e": "6adf7f",
    "ffe45c": "a6f0a0",
    "fff75f": "b8f5c0",
    "fff35f": "b8f5c0",
    "fff100": "8eeb9c",
    "ffe000": "6adf7f",
    "ffac33": "2fae5f",
    "ffad1f": "2fae5f",
    "ffb020": "34d17a",
    "f9ca55": "6fdc84",
    "fdcb58": "6fdc84",
    "fdd888": "9aeba8",
    "fdd54c": "6fdc84",
    "fcd116": "4fd06e",
    "fcab40": "2fae5f",
    "faae29": "2fae5f",
    "faaa35": "2fae5f",
    "f8c600": "3fc463",
    "f4900c": "1f9e57",
    "f18f26": "1f9e57",
    "f19020": "1f9e57",
    "ef9645": "2fae5f",
    "e6a800": "2fae5f",
    "e6a04a": "2fae5f",
    "e39c2f": "1f9e57",
    "cb9c2b": "1a7a42",
    "ce9e5d": "2f8f52",
    "ff9f1c": "2fae5f",
    "ff8a3d": "228b4a",
    "fa8c56": "228b4a",
}


def clamp(x: int) -> int:
    return max(0, min(255, x))


def hex6(r: int, g: int, b: int) -> str:
    return f"{clamp(r):02x}{clamp(g):02x}{clamp(b):02x}"


def parse_hex(h: str) -> tuple[int, int, int] | None:
    h = h.lower().lstrip("#")
    if len(h) == 3:
        h = h[0] * 2 + h[1] * 2 + h[2] * 2
    if len(h) == 8:
        h = h[:6]
    if len(h) != 6:
        return None
    try:
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        return None


def is_skin(r: int, g: int, b: int) -> bool:
    """Peach / brown skin tones — leave alone."""
    if r < 120:
        return False
    # classic peach
    if r >= 180 and 120 <= g <= 230 and 90 <= b <= 200 and b > g * 0.5 and abs(r - g) < 70:
        if b >= 90 and g - b < 80:
            return True
    # deeper skin browns (not gold)
    if 90 <= r <= 200 and 60 <= g <= 160 and 40 <= b <= 130 and r > g >= b and (r - b) < 100:
        if g < 180 and b > 40:
            return True
    return False


def is_yellow_gold(r: int, g: int, b: int) -> bool:
    if is_skin(r, g, b):
        return False
    mx, mn = max(r, g, b), min(r, g, b)
    if mx < 150:
        return False
    # HSV hue check
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    hue = h * 360
    # yellow / gold / amber
    if 35 <= hue <= 72 and s >= 0.28 and v >= 0.45:
        return True
    # RGB heuristic backup
    if r >= 170 and g >= 140 and b <= 170 and (r + g) / 2 > b + 50:
        return True
    return False


def yellow_to_green(r: int, g: int, b: int) -> str:
    """Map yellow luminance to Snake OS green ramp."""
    # perceived brightness
    lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    # target green hue ~138°
    nh = 138 / 360.0
    ns = min(0.92, max(0.35, s * 0.85 + 0.15))
    nv = min(0.96, max(0.28, v))
    # bias toward brand greens by luminance bands
    if lum > 0.85:
        return "c8f7b8"
    if lum > 0.72:
        return "a6f0a0"
    if lum > 0.58:
        return "7ae089"
    if lum > 0.45:
        return "34d17a"
    if lum > 0.32:
        return "2fae5f"
    rr, gg, bb = colorsys.hsv_to_rgb(nh, ns, nv * 0.85)
    return hex6(int(rr * 255), int(gg * 255), int(bb * 255))


def convert_hex_token(token: str) -> str:
    raw = token
    prefix = "#" if token.startswith("#") else ""
    h = token.lower().lstrip("#")
    short = False
    alpha = ""
    if len(h) == 3:
        short = True
        h = h[0] * 2 + h[1] * 2 + h[2] * 2
    elif len(h) == 8:
        alpha = h[6:8]
        h = h[:6]
    elif len(h) != 6:
        return raw
    key = h.lower()
    if key in MAP:
        out = MAP[key]
    else:
        rgb = parse_hex(key)
        if not rgb or not is_yellow_gold(*rgb):
            return raw
        out = yellow_to_green(*rgb)
    if short and len(set(out[0:2])) == 1 and len(set(out[2:4])) == 1 and len(set(out[4:6])) == 1:
        # keep 6 for consistency
        pass
    return prefix + out + alpha


HEX_RE = re.compile(r"#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})\b")


def recolor_svg(text: str) -> tuple[str, int]:
    n = 0

    def repl(m: re.Match) -> str:
        nonlocal n
        tok = m.group(0)
        neu = convert_hex_token(tok)
        if neu.lower() != tok.lower():
            n += 1
            return neu
        return tok

    return HEX_RE.sub(repl, text), n


def main() -> int:
    files = sorted(ASSETS.glob("snk-emoji-*.svg"))
    changed = 0
    touches = 0
    for p in files:
        raw = p.read_text(encoding="utf-8", errors="ignore")
        neu, n = recolor_svg(raw)
        if n and neu != raw:
            p.write_text(neu, encoding="utf-8")
            changed += 1
            touches += n
    print(f"files={len(files)} recolored={changed} replacements={touches}")
    # samples
    for code in ("1f31e", "2b50", "1f34c", "1f603", "1f40d", "1f600"):
        p = ASSETS / f"snk-emoji-{code}.svg"
        if not p.exists():
            continue
        cols = sorted(set(HEX_RE.findall(p.read_text())))
        print(code, ["#" + c for c in cols[:12]])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
