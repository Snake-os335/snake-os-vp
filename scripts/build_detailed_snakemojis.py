#!/usr/bin/env python3
"""Rebuild non-handmade snakemojis from Twemoji, framed for Snake OS.

Keeps the 299 hand-drawn assets untouched.
- viewBox 0 0 72 72
- black outlines remapped to Snake OS #14532d
- round caps/joins
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(os.environ.get("SNAKEOS_ROOT", "/srv/juegos_david/snake-os"))
ASSETS = ROOT / "assets"
DATA_JS = ROOT / "snake-emoji-data.js"
EMOJI_JS = ROOT / "snake-emoji.js"
TWEMOJI = Path(os.environ.get("TWEMOJI_SVG", "/tmp/twemoji-assets/assets/svg"))
STROKE = "#14532d"

ET.register_namespace("", "http://www.w3.org/2000/svg")
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")


def handmade_codes() -> set[str]:
    js = EMOJI_JS.read_text(encoding="utf-8")
    m = re.search(r"var DATA_FALLBACK = (\[.*?\]);\n", js, re.S)
    if not m:
        raise SystemExit("DATA_FALLBACK not found")
    return set(re.findall(r',"([0-9a-f][0-9a-f-]+)"\]', m.group(1)))


def catalog() -> list:
    text = DATA_JS.read_text(encoding="utf-8")
    m = re.search(r"window\.__SNK_EMOJI_DATA = (\[.*\]);", text, re.S)
    if not m:
        raise SystemExit("catalog not found")
    return json.loads(m.group(1))


def twemoji_candidates(code: str) -> list[str]:
    """Generate Twemoji filename stems for a unified emoji code."""
    parts = [x for x in code.lower().split("-") if x]
    SKIN = {"1f3fb", "1f3fc", "1f3fd", "1f3fe", "1f3ff"}
    # Codepoints that Twemoji usually keeps with VS16 (fe0f)
    NEED_FE = {
        "2764", "2640", "2642", "2695", "2696", "2708", "2763", "26a7",
        "27a1", "2194", "2195", "1f32b", "26f9", "1f575", "1f3cc", "1f3cb",
        "1f3c3", "1f46f", "1f6b6", "23f0", "23f3", "25aa", "25ab", "25b6",
        "25c0", "25fb", "25fc", "25fd", "25fe", "2600", "2601", "2602",
        "2603", "2604", "2611", "2614", "2615", "2618", "261d", "2620",
        "2622", "2623", "2626", "262a", "262e", "262f", "2638", "2639",
        "263a", "2648", "2649", "264a", "264b", "264c", "264d", "264e",
        "264f", "2650", "2651", "2652", "2653", "265f", "2660", "2663",
        "2665", "2666", "2668", "267b", "267e", "267f", "2692", "2693",
        "2694", "2697", "2699", "269b", "269c", "26a0", "26a1", "26a7",
        "26aa", "26ab", "26b0", "26b1", "26bd", "26be", "26c4", "26c5",
        "26c8", "26cf", "26d1", "26d3", "26d4", "26e9", "26ea", "26f0",
        "26f1", "26f2", "26f3", "26f4", "26f5", "26f7", "26f8", "26f9",
        "26fa", "26fd", "2702", "2708", "2709", "270c", "270d", "270f",
        "2712", "2714", "2716", "271d", "2721", "2733", "2734", "2744",
        "2747", "2753", "2757", "2763", "2764", "27a1", "2934", "2935",
        "2b05", "2b06", "2b07", "2b1b", "2b1c", "2b50", "2b55", "3030",
        "303d", "3297", "3299", "1f170", "1f171", "1f17e", "1f17f", "1f202",
        "1f237", "1f321", "1f324", "1f325", "1f326", "1f327", "1f328",
        "1f329", "1f32a", "1f32b", "1f32c", "1f336", "1f37d", "1f396",
        "1f397", "1f399", "1f39a", "1f39b", "1f39e", "1f39f", "1f3cb",
        "1f3cc", "1f3cd", "1f3ce", "1f3d4", "1f3d5", "1f3d6", "1f3d7",
        "1f3d8", "1f3d9", "1f3da", "1f3db", "1f3dc", "1f3dd", "1f3de",
        "1f3df", "1f3f3", "1f3f5", "1f3f7", "1f43f", "1f441", "1f4fd",
        "1f549", "1f54a", "1f56f", "1f570", "1f573", "1f574", "1f575",
        "1f576", "1f577", "1f578", "1f579", "1f587", "1f58a", "1f58b",
        "1f58c", "1f58d", "1f590", "1f5a5", "1f5a8", "1f5b1", "1f5b2",
        "1f5bc", "1f5c2", "1f5c3", "1f5c4", "1f5d1", "1f5d2", "1f5d3",
        "1f5dc", "1f5dd", "1f5de", "1f5e1", "1f5e3", "1f5e8", "1f5ef",
        "1f5f3", "1f5fa", "1f6cb", "1f6cd", "1f6ce", "1f6cf", "1f6e0",
        "1f6e1", "1f6e2", "1f6e3", "1f6e4", "1f6e5", "1f6e9", "1f6f0",
        "1f6f3",
    }

    def norm_cp(p: str) -> str:
        if re.fullmatch(r"0+[0-9a-f]+", p):
            return p.lstrip("0") or "0"
        return p

    def inject_fe(seq):
        """Insert fe0f after NEED_FE codes when missing (esp. before zwj / end)."""
        out = []
        for i, p in enumerate(seq):
            if p == "fe0f":
                continue
            out.append(p)
            nxt = None
            j = i + 1
            while j < len(seq):
                if seq[j] != "fe0f":
                    nxt = seq[j]
                    break
                j += 1
            if p in NEED_FE:
                # keep fe0f after these
                out.append("fe0f")
        return out

    def strip_fe(seq):
        return [p for p in seq if p != "fe0f"]

    cands = []
    seen = set()

    def add(seq):
        key = "-".join(seq)
        if key and key not in seen:
            seen.add(key)
            cands.append(key)

    raw = parts
    stripped = strip_fe(raw)
    normalized = [norm_cp(p) for p in stripped]
    for seq in (raw, stripped, normalized, inject_fe(stripped), inject_fe(normalized)):
        add(seq)
        # also trailing-only fe for gender/heart if inject missed somehow
        if seq and seq[-1] in {"2640", "2642", "2764", "2695", "2696", "26a7", "1f32b", "27a1", "2194", "2195"}:
            add(seq + ["fe0f"])
    return cands



    cands.append("-".join(fe_before_zwj(no_fe)))

    out, seen = [], set()
    for c in cands:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def find_twemoji(code: str):
    """Return (path, mirror_x) where mirror_x flips for missing facing-right glyphs."""
    for c in twemoji_candidates(code):
        p = TWEMOJI / f"{c}.svg"
        if p.exists():
            return p, False
    # Unicode 15.1+ facing-right sequences: reuse left-facing art mirrored
    parts = [x for x in code.lower().split("-") if x and x != "fe0f"]
    if len(parts) >= 2 and parts[-1] == "27a1":
        base = "-".join(parts[:-2]) if len(parts) >= 2 and parts[-2] == "200d" else "-".join(parts[:-1])
        # parts like ... 200d 27a1
        if parts[-2] == "200d":
            base_code = "-".join(parts[:-2])
        else:
            base_code = "-".join(parts[:-1])
        for c in twemoji_candidates(base_code):
            p = TWEMOJI / f"{c}.svg"
            if p.exists():
                return p, True
    return None, False


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def snake_stroke_color(c: str) -> str | None:
    if not c:
        return None
    cl = c.strip().lower()
    if cl in ("none", "transparent"):
        return None
    dark = {
        "#000",
        "#000000",
        "black",
        "#231f20",
        "#3c3c3c",
        "#2b2b2b",
        "#141414",
        "#212121",
        "#333",
        "#333333",
        "#444",
        "#444444",
        "#555",
        "#555555",
    }
    if cl in dark:
        return STROKE
    # near-black hex
    if cl.startswith("#") and len(cl) == 7:
        try:
            r, g, b = int(cl[1:3], 16), int(cl[3:5], 16), int(cl[5:7], 16)
            if r < 70 and g < 70 and b < 70:
                return STROKE
        except ValueError:
            pass
    return None


def restyle_tree(root: ET.Element) -> None:
    for el in root.iter():
        tag = local_name(el.tag)
        if tag in (
            "svg",
            "defs",
            "clipPath",
            "mask",
            "linearGradient",
            "radialGradient",
            "stop",
            "style",
            "title",
            "desc",
            "metadata",
        ):
            continue
        for attr in ("stroke", "fill"):
            mapped = snake_stroke_color(el.get(attr, ""))
            if mapped and attr == "stroke":
                el.set("stroke", mapped)
            # do not remap fills that are black silhouettes (sunglasses etc.) — only strokes
        if el.get("stroke") and el.get("stroke") != "none":
            el.set("stroke-linecap", "round")
            el.set("stroke-linejoin", "round")


def convert(src: Path, mirror_x: bool = False) -> str:
    raw = src.read_text(encoding="utf-8")
    raw = re.sub(r"<!DOCTYPE[^>]*>", "", raw, flags=re.I)
    root = ET.fromstring(raw)

    vb = root.get("viewBox") or "0 0 36 36"
    nums = [float(x) for x in vb.replace(",", " ").split()]
    if len(nums) != 4:
        nums = [0.0, 0.0, 36.0, 36.0]
    x, y, w, h = nums
    scale = min(72.0 / w, 72.0 / h) if w and h else 2.0
    # slight inset so strokes don't clip
    pad = 1.5
    scale *= (72 - pad * 2) / 72
    tx = (72 - w * scale) / 2 - x * scale
    ty = (72 - h * scale) / 2 - y * scale

    restyle_tree(root)
    children = list(root)
    flip = " translate(72 0) scale(-1 1)" if mirror_x else ""
    chunks = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">',
        f'<g stroke-linecap="round" stroke-linejoin="round" transform="{flip} translate({tx:.3f} {ty:.3f}) scale({scale:.5f})">'.replace('transform=" ', 'transform="'),
    ]
    # clean double space in transform if no flip
    chunks[1] = chunks[1].replace('transform=" translate', 'transform="translate')
    for child in children:
        chunks.append(ET.tostring(child, encoding="unicode"))
    chunks.append("</g></svg>")
    return re.sub(r">\s+<", "><", "".join(chunks))


def fallback_svg(code: str, name: str, cat: str) -> str:
    h = sum(ord(c) for c in code)
    palettes = [
        ("#a6f0a0", "#2fae5f"),
        ("#ffe56a", "#f0b429"),
        ("#ffb06a", "#f08a24"),
        ("#ff7a8a", "#e0314a"),
        ("#8ec5ff", "#3b82f6"),
        ("#d3a6ff", "#8b5cf6"),
        ("#f5c6d0", "#e87a9a"),
        ("#e6c49a", "#a0662e"),
    ]
    c0, c1 = palettes[h % len(palettes)]
    gid = "g" + re.sub(r"[^a-z0-9]", "", code)[:14]
    nl = (name or "").lower()
    if cat == "caras" or "face" in nl:
        eyes = (
            f'<ellipse cx="27" cy="34" fill="{STROKE}" rx="3.4" ry="3.8"/>'
            f'<ellipse cx="45" cy="34" fill="{STROKE}" rx="3.4" ry="3.8"/>'
            '<circle cx="28.2" cy="32.7" r="1.15" fill="#fff"/>'
            '<circle cx="46.2" cy="32.7" r="1.15" fill="#fff"/>'
        )
        mouth = '<path fill="none" stroke="#14532d" stroke-width="3.2" d="M24 46q12 12 24 0"/>'
        if any(k in nl for k in ("sad", "cry", "frown", "worried")):
            mouth = '<path fill="none" stroke="#14532d" stroke-width="3.2" d="M24 54q12-12 24 0"/>'
        if any(k in nl for k in ("joy", "laugh", "rofl")):
            mouth = (
                '<path fill="#5a1220" stroke="#14532d" stroke-width="2.4" '
                'd="M22 42q14 2 28 0-1.5 16-14 16T22 42"/>'
                '<path fill="#ff5d73" d="M31 56q5-5 10 0Z"/>'
            )
        inner = (
            f'<ellipse cx="36" cy="38" fill="url(#{gid})" stroke="{STROKE}" stroke-width="2.8" rx="27" ry="25"/>'
            f'<ellipse cx="22" cy="20" fill="#fff" opacity=".45" rx="6" ry="3" transform="rotate(-35 22 20)"/>'
            f"{eyes}{mouth}"
        )
    elif cat in ("corazones",) or "heart" in nl or "corazón" in nl:
        inner = (
            f'<path fill="url(#{gid})" stroke="{STROKE}" stroke-width="2.6" '
            'd="M36 60S12 44 12 28c0-8 6-14 14-14 5 0 8 2 10 5 2-3 5-5 10-5 8 0 14 6 14 14 0 16-24 32-24 32z"/>'
            f'<ellipse cx="26" cy="28" fill="#fff" opacity=".5" rx="5" ry="2.4" transform="rotate(-30 26 28)"/>'
        )
    elif cat == "banderas" or "flag" in nl or "bandera" in nl:
        inner = (
            f'<rect x="8" y="14" width="56" height="44" rx="6" fill="url(#{gid})" stroke="{STROKE}" stroke-width="2.6"/>'
            f'<rect x="10" y="16" width="52" height="13" fill="#a6f0a0"/>'
            f'<rect x="10" y="42" width="52" height="14" fill="#14532d" opacity=".85"/>'
            f'<path fill="none" stroke="{STROKE}" stroke-width="2.2" d="M12 14v48"/>'
        )
    else:
        label = (name or code)[:2].upper()
        inner = (
            f'<rect x="8" y="8" width="56" height="56" rx="14" fill="url(#{gid})" stroke="{STROKE}" stroke-width="2.8"/>'
            f'<ellipse cx="24" cy="22" fill="#fff" opacity=".4" rx="8" ry="4" transform="rotate(-30 24 22)"/>'
            f'<circle cx="36" cy="38" r="16" fill="#fff" opacity=".18" stroke="{STROKE}" stroke-width="1.8"/>'
            f'<text x="36" y="43" text-anchor="middle" font-size="14" '
            f'font-family="ui-rounded,system-ui,sans-serif" font-weight="700" fill="{STROKE}">{label}</text>'
        )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">'
        f'<defs><linearGradient id="{gid}" x1="0" x2="0" y1="0" y2="1">'
        f'<stop offset="0" stop-color="{c0}"/><stop offset="1" stop-color="{c1}"/>'
        f"</linearGradient></defs>"
        f'<g stroke-linecap="round" stroke-linejoin="round">{inner}</g></svg>'
    )


def backup_handmade(hand: set[str]) -> int:
    bak = Path("/tmp/snakemoji-handmade-bak")
    bak.mkdir(exist_ok=True)
    n = 0
    for code in hand:
        src = ASSETS / f"snk-emoji-{code}.svg"
        if src.exists():
            (bak / src.name).write_bytes(src.read_bytes())
            n += 1
    print(f"backed_handmade={n} -> {bak}")
    return n


def main() -> int:
    if not TWEMOJI.is_dir():
        print("Twemoji SVG dir missing:", TWEMOJI, file=sys.stderr)
        return 1
    hand = handmade_codes()
    data = catalog()
    tw_count = sum(1 for _ in TWEMOJI.glob("*.svg"))
    print(f"handmade={len(hand)} catalog={len(data)} twemoji_files={tw_count}")
    backup_handmade(hand)

    ok = skip = miss = 0
    missing_codes = []
    for row in data:
        name, cat, code = row[1], row[2], row[3]
        out = ASSETS / f"snk-emoji-{code}.svg"
        if code in hand:
            skip += 1
            continue
        src, mirror = find_twemoji(code)
        if src:
            try:
                out.write_text(convert(src, mirror_x=mirror), encoding="utf-8")
                ok += 1
            except Exception as e:
                out.write_text(fallback_svg(code, name, cat), encoding="utf-8")
                miss += 1
                missing_codes.append(f"{code}\tconvert-fail\t{e}")
        else:
            out.write_text(fallback_svg(code, name, cat), encoding="utf-8")
            miss += 1
            missing_codes.append(f"{code}\tno-twemoji\t{name}")

    Path("/tmp/snakemoji_miss.txt").write_text("\n".join(missing_codes) + "\n", encoding="utf-8")
    print(f"converted={ok} handmade_kept={skip} fallback={miss}")
    snake = ASSETS / "snk-emoji-1f40d.svg"
    grin = ASSETS / "snk-emoji-1f600.svg"
    print("snake_bytes", snake.stat().st_size if snake.exists() else 0)
    print("grin_bytes", grin.stat().st_size if grin.exists() else 0, "handmade", "1f600" in hand)
    # show a converted sample size
    for code in ("1f4a9", "1f525", "1f30d", "1f3f3-fe0f"):
        p = ASSETS / f"snk-emoji-{code}.svg"
        print(code, "exists", p.exists(), "bytes", p.stat().st_size if p.exists() else 0, "hand", code in hand)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
