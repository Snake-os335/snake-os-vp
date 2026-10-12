#!/usr/bin/env python3
"""Generate snake-style faces + snake-style hands for Snake OS snakemojis.

- caras: green snake head, slit pupils, expression from name
- hand gestures only (not people/professions): green snake hands
Keeps existing handmade assets unless --force-all.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(os.environ.get("SNAKEOS_ROOT", "/srv/juegos_david/snake-os"))
ASSETS = ROOT / "assets"
DATA_JS = ROOT / "snake-emoji-data.js"
EMOJI_JS = ROOT / "snake-emoji.js"
STROKE = "#14532d"
INK = "#10220f"
FORCE = "--force-all" in sys.argv

HAND_CODE_PREFIXES = (
    "261d", "270a", "270b", "270c", "270d",
    "1f44", "1f450", "1f64c", "1f64f", "1f90c", "1f90f",
    "1f91", "1f932", "1f9b5", "1f9b6", "1f9bb",
    "1faf", "1f4aa", "1f58e", "1f595", "1f596", "1f590",
)
HAND_NAME_KEYS = (
    "mano", "hand", "thumb", "fist", "clap", "wave", "point",
    "señalar", "victory", "ok ", "ok:", "fingers", "pray", "rezo",
    "muscle", "músculo", "handshake", "apretón", "palm", "pinch",
    "love-you", "call me", "writing", "nail", "selfie", "raised",
    "backhand", "index", "crossed", "vulcan", "middle finger",
    "heart hands", "manos de corazón", "palms up", "rightwards hand",
    "leftwards hand", "handshake", "fold",
)


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


def wrap(inner: str, defs: str = "") -> str:
    d = f"<defs>{defs}</defs>" if defs else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">'
        f"{d}<g stroke-linecap=\"round\" stroke-linejoin=\"round\">{inner}</g></svg>"
    )


def grad(gid: str = "a", c0: str = "#a6f0a0", c1: str = "#2fae5f") -> str:
    return (
        f'<linearGradient id="{gid}" x1="0" x2="0" y1="0" y2="1">'
        f'<stop offset="0" stop-color="{c0}"/>'
        f'<stop offset="1" stop-color="{c1}"/>'
        f"</linearGradient>"
    )


def highlight() -> str:
    return '<ellipse cx="22" cy="22" fill="#fff" opacity=".42" rx="7" ry="3.2" transform="rotate(-35 22 22)"/>'


def snake_pupils(lx=27, rx=45, cy=34) -> str:
    """Vertical slit pupils — reads as snake."""
    return (
        f'<ellipse cx="{lx}" cy="{cy}" fill="#ffe45c" stroke="{STROKE}" stroke-width="1.4" rx="5.2" ry="6.2"/>'
        f'<ellipse cx="{rx}" cy="{cy}" fill="#ffe45c" stroke="{STROKE}" stroke-width="1.4" rx="5.2" ry="6.2"/>'
        f'<ellipse cx="{lx}" cy="{cy}" fill="{INK}" rx="1.35" ry="4.2"/>'
        f'<ellipse cx="{rx}" cy="{cy}" fill="{INK}" rx="1.35" ry="4.2"/>'
        f'<ellipse cx="{lx + 1.2}" cy="{cy - 1.6}" fill="#fff" rx="0.9" ry="1.3"/>'
        f'<ellipse cx="{rx + 1.2}" cy="{cy - 1.6}" fill="#fff" rx="0.9" ry="1.3"/>'
    )


def tongue() -> str:
    return (
        f'<path fill="#e8344e" stroke="{STROKE}" stroke-width="1.2" '
        'd="M34 52c2 6 4 8 2 10 2-1 4-1 6 0-2-2 0-4 2-10h-4z"/>'
        f'<path fill="none" stroke="{STROKE}" stroke-width="1.4" d="M36 60l-2 3m4-3 2 3"/>'
    )


def is_hand_gesture(code: str, name: str, cat: str) -> bool:
    base = code.split("-")[0]
    if any(code.startswith(p) or base.startswith(p.rstrip("-")) for p in HAND_CODE_PREFIXES):
        # exclude non-hand 1f44a is punch OK; 1f445 tongue is face part - skip if tongue alone
        if base == "1f445":
            return False
        return True
    n = (name or "").lower()
    if any(k in n for k in HAND_NAME_KEYS):
        # avoid "handshake" people composites wrongly — still a hand gesture OK
        if any(k in n for k in ("person", "man ", "woman", "people", "family", "couple", "baby", "adult", "child", "older", "detective", "guard", "farmer", "cook", "student", "singer", "artist", "pilot", "astronaut", "firefighter", "judge", "health")):
            if "hand" not in n and "mano" not in n and "thumb" not in n and "point" not in n:
                return False
        return True
    return False


def face_svg(name: str, code: str) -> str:
    n = (name or "").lower()
    c0, c1 = "#a6f0a0", "#2fae5f"
    if any(k in n for k in ("devil", "imp", "enfadado", "furioso", "rage", "angry", "pouting")):
        c0, c1 = "#ff8a7a", "#c62828"
    elif any(k in n for k in ("cold", "frío", "freezing")):
        c0, c1 = "#b8f0ff", "#4fa8d8"
    elif any(k in n for k in ("hot", "calor", "sweat")):
        c0, c1 = "#ffd0a0", "#e07830"
    elif any(k in n for k in ("sick", "nause", "vomit", "mareado", "green")):
        c0, c1 = "#c6f0a0", "#5a9e30"
    elif any(k in n for k in ("clown", "payaso")):
        c0, c1 = "#ffe0e8", "#f48fb1"
    elif any(k in n for k in ("skull", "calavera")):
        c0, c1 = "#f0f0f0", "#c0c0c0"
    elif any(k in n for k in ("alien", "robot", "ghost", "fantasma")):
        c0, c1 = "#d0ffe0", "#2fae5f"

    defs = grad("a", c0, c1)
    # head + cheek scale marks (snake)
    head = (
        f'<ellipse cx="36" cy="38" fill="url(#a)" stroke="{STROKE}" stroke-width="2.8" rx="27" ry="25"/>'
        f'{highlight()}'
        f'<path fill="none" stroke="{STROKE}" stroke-width="1.2" opacity=".28" '
        'd="M18 40q6 4 12 0m12 0q6 4 12 0M20 48q5 3 10 0m12 0q5 3 10 0"/>'
    )

    eyes = snake_pupils()
    if any(k in n for k in ("heart", "enamorado", "love", "ojos de corazón")):
        eyes = (
            f'<path fill="#ff5d73" stroke="{STROKE}" stroke-width="1.5" '
            'd="M22 30c0-4 4-6 6-3 2-3 6-1 6 3 0 4-6 8-6 8s-6-4-6-8zm16 0c0-4 4-6 6-3 2-3 6-1 6 3 0 4-6 8-6 8s-6-4-6-8z"/>'
        )
    elif any(k in n for k in ("star", "estrella", "ojos de estrella")):
        eyes = (
            f'<path fill="#ffe45c" stroke="{STROKE}" stroke-width="1.3" '
            'd="m27 26 2.2 4.4 4.8.4-3.7 3.2 1.1 4.7L27 36.2 22.6 38.7l1.1-4.7-3.7-3.2 4.8-.4zm18 0 2.2 4.4 4.8.4-3.7 3.2 1.1 4.7L45 36.2 40.6 38.7l1.1-4.7-3.7-3.2 4.8-.4z"/>'
        )
    elif any(k in n for k in ("closed", "sleep", "relieved", "aliviado", "peaceful", "zzz", "durmiendo", "con sueño")):
        eyes = f'<path fill="none" stroke="{STROKE}" stroke-width="3" d="M20 34q6-8 12 0m8 0q6-8 12 0"/>'
    elif "wink" in n or "guiño" in n:
        eyes = (
            f'<ellipse cx="27" cy="34" fill="#ffe45c" stroke="{STROKE}" stroke-width="1.4" rx="5.2" ry="6.2"/>'
            f'<ellipse cx="27" cy="34" fill="{INK}" rx="1.35" ry="4.2"/>'
            f'<path fill="none" stroke="{STROKE}" stroke-width="3" d="M40 34q6-7 12 0"/>'
        )
    elif any(k in n for k in ("angry", "rage", "enfadado", "furioso", "pouting")):
        eyes = (
            f'<path fill="none" stroke="{STROKE}" stroke-width="3" d="M18 28l12 6m24-6-12 6"/>'
            + snake_pupils(cy=36)
        )
    elif any(k in n for k in ("roll", "blanco")):
        eyes = (
            f'<ellipse cx="27" cy="34" fill="#fff" stroke="{STROKE}" stroke-width="1.6" rx="5.5" ry="6.5"/>'
            f'<ellipse cx="45" cy="34" fill="#fff" stroke="{STROKE}" stroke-width="1.6" rx="5.5" ry="6.5"/>'
            f'<ellipse cx="27" cy="30" fill="{INK}" rx="1.5" ry="2.2"/>'
            f'<ellipse cx="45" cy="30" fill="{INK}" rx="1.5" ry="2.2"/>'
        )

    mouth = f'<path fill="none" stroke="{STROKE}" stroke-width="3" d="M26 48q10 8 20 0"/>'
    extras = ""
    if any(k in n for k in ("joy", "laugh", "rofl", "carcajada", "llorando de risa", "revolc")):
        mouth = (
            f'<path fill="#5a1220" stroke="{STROKE}" stroke-width="2.4" d="M22 42q14 2 28 0-1.5 16-14 16T22 42"/>'
            f'<path fill="#fff" d="M24 43q12 1.2 24 0l-.8 3.6Q36 48 24.8 46.6Z"/>'
            + tongue()
        )
    elif any(k in n for k in ("tongue", "lengua", "delicioso", "guiño con lengua", "loco")):
        mouth = (
            f'<path fill="none" stroke="{STROKE}" stroke-width="3" d="M24 44q12 10 24 0"/>'
            + tongue()
        )
    elif any(k in n for k in ("sad", "cry", "llor", "frown", "triste", "decepcionado", "worried", "preocup")):
        mouth = f'<path fill="none" stroke="{STROKE}" stroke-width="3.2" d="M24 54q12-12 24 0"/>'
        if any(k in n for k in ("cry", "llor", "tear")):
            extras += f'<ellipse cx="22" cy="44" fill="#6ec8ff" stroke="{STROKE}" stroke-width="1.4" rx="2.4" ry="4"/>'
    elif any(k in n for k in ("open", "astonished", "scream", "fear", "surpris", "asombr", "grito", "boca abierta")):
        mouth = f'<ellipse cx="36" cy="50" fill="#5a1220" stroke="{STROKE}" stroke-width="2.4" rx="7" ry="8"/>'
        extras += tongue()
    elif any(k in n for k in ("neutral", "expressionless", "inexpresivo")):
        mouth = f'<path stroke="{STROKE}" stroke-width="3.2" d="M26 50h20"/>'
    elif "zipper" in n or "cremallera" in n:
        mouth = f'<path stroke="{STROKE}" stroke-width="3" d="M24 50h24"/><path stroke="#889" stroke-width="2" d="M28 50v4m4-4v4m4-4v4m4-4v4m4-4v4"/>'
    elif any(k in n for k in ("smile", "sonri", "blush", "happy", "grin", "leve")):
        mouth = f'<path fill="none" stroke="{STROKE}" stroke-width="3.2" d="M24 46q12 12 24 0"/>'

    if any(k in n for k in ("sunglasses", "gafas de sol", "cool")):
        extras += (
            f'<rect x="16" y="30" width="16" height="10" rx="3" fill="{INK}" stroke="{STROKE}" stroke-width="1.6"/>'
            f'<rect x="40" y="30" width="16" height="10" rx="3" fill="{INK}" stroke="{STROKE}" stroke-width="1.6"/>'
            f'<path stroke="{STROKE}" stroke-width="2.4" d="M32 35h8"/>'
        )
        eyes = ""
    if "mask" in n or "mascarilla" in n:
        extras += f'<path fill="#dfefff" stroke="{STROKE}" stroke-width="2" d="M18 44q18-6 36 0v8q-18 8-36 0z"/>'
        mouth = ""
    if "halo" in n or "angel" in n or "angelito" in n:
        extras += '<ellipse cx="36" cy="10" fill="none" stroke="#ffd43b" stroke-width="3" rx="16" ry="5"/>'
    if any(k in n for k in ("sleep", "zzz", "durmiendo")):
        extras += f'<text x="50" y="20" font-size="11" fill="{STROKE}" font-family="sans-serif" font-weight="700">z</text>'
    if any(k in n for k in ("snake", "serpiente")) or code == "1f40d":
        extras += tongue()

    # small fangs for snake vibe on most faces
    if not any(k in n for k in ("skull", "calavera")) and "fang" not in extras:
        extras += f'<path fill="#fff" stroke="{STROKE}" stroke-width="1" d="M30 46l2 5 2-5zm8 0l2 5 2-5"/>'

    return wrap(head + eyes + mouth + extras, defs)


def hand_svg(name: str, code: str) -> str:
    n = (name or "").lower()
    defs = grad("a")
    # skin-tone variants: slightly darker/lighter green
    if "1f3fb" in code:
        defs = grad("a", "#c8f7b8", "#6fdc84")
    elif "1f3ff" in code:
        defs = grad("a", "#6fdc84", "#1a7a42")
    elif "1f3fe" in code:
        defs = grad("a", "#7ae089", "#1f9e57")
    elif "1f3fd" in code:
        defs = grad("a", "#8eeb9c", "#2fae5f")
    elif "1f3fc" in code:
        defs = grad("a", "#b8f5c0", "#34d17a")

    outline = STROKE

    def finger(x, y, w, h, rot=0):
        t = f' transform="rotate({rot} {x + w/2} {y + h/2})"' if rot else ""
        return (
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{w/2}" '
            f'fill="url(#a)" stroke="{outline}" stroke-width="2.2"{t}/>'
        )

    palm = f'<ellipse cx="36" cy="46" rx="16" ry="14" fill="url(#a)" stroke="{outline}" stroke-width="2.6"/>'
    # scale pattern on palm
    scales = (
        f'<path fill="none" stroke="{outline}" stroke-width="1.1" opacity=".3" '
        'd="M28 44q4 3 8 0m4 0q4 3 8 0M30 50q3 2 6 0m4 0q3 2 6 0"/>'
    )

    if "thumb" in n and ("up" in n or "me gusta" in n or "arriba" in n):
        body = (
            f'<rect width="24" height="26" x="20" y="34" fill="{outline}" stroke="{outline}" stroke-width="5.2" rx="8"/>'
            f'<rect width="20" height="7.5" x="34" y="34" fill="{outline}" stroke="{outline}" stroke-width="5.2" rx="3.75"/>'
            f'<rect width="19" height="7.5" x="34" y="41" fill="{outline}" stroke="{outline}" stroke-width="5.2" rx="3.75"/>'
            f'<rect width="18" height="7.5" x="34" y="48" fill="{outline}" stroke="{outline}" stroke-width="5.2" rx="3.75"/>'
            f'<rect width="15" height="6.5" x="34" y="55" fill="{outline}" stroke="{outline}" stroke-width="5.2" rx="3.25"/>'
            f'<rect width="10" height="30" x="20" y="10" fill="{outline}" stroke="{outline}" stroke-width="5.2" rx="5" transform="rotate(-12 25 40)"/>'
            f'<rect width="24" height="26" x="20" y="34" fill="url(#a)" rx="8"/>'
            f'<rect width="20" height="7.5" x="34" y="34" fill="url(#a)" rx="3.75"/>'
            f'<rect width="19" height="7.5" x="34" y="41" fill="url(#a)" rx="3.75"/>'
            f'<rect width="18" height="7.5" x="34" y="48" fill="url(#a)" rx="3.75"/>'
            f'<rect width="15" height="6.5" x="34" y="55" fill="url(#a)" rx="3.25"/>'
            f'<rect width="10" height="30" x="20" y="10" fill="url(#a)" rx="5" transform="rotate(-12 25 40)"/>'
            + '<path fill="none" stroke="#fff" stroke-width="1.4" opacity=".4" d="M28 46q3 3 6 0m2 0q3 3 6 0"/>'
        )
    elif "thumb" in n and ("down" in n or "no me gusta" in n):
        body = (
            f'<g transform="rotate(180 36 36)">'
            f'<rect width="24" height="26" x="20" y="34" fill="url(#a)" stroke="{outline}" stroke-width="2.6" rx="8"/>'
            f'<rect width="10" height="28" x="20" y="12" fill="url(#a)" stroke="{outline}" stroke-width="2.6" rx="5" transform="rotate(-12 25 40)"/>'
            f'<rect width="18" height="7" x="34" y="36" fill="url(#a)" stroke="{outline}" stroke-width="2" rx="3.5"/>'
            f'<rect width="17" height="7" x="34" y="44" fill="url(#a)" stroke="{outline}" stroke-width="2" rx="3.5"/>'
            f'<rect width="15" height="7" x="34" y="52" fill="url(#a)" stroke="{outline}" stroke-width="2" rx="3.5"/>'
            f"</g>"
        )
    elif any(k in n for k in ("clap", "aplauso")):
        body = (
            f'<g transform="rotate(-18 30 40)">{palm.replace("36", "30")}</g>'
            f'<g transform="rotate(18 42 40)">{palm.replace("36", "42")}</g>'
            + scales
        )
    elif any(k in n for k in ("pray", "por favor", "gracias", "folded")):
        body = (
            f'<ellipse cx="30" cy="40" rx="10" ry="22" fill="url(#a)" stroke="{outline}" stroke-width="2.4"/>'
            f'<ellipse cx="42" cy="40" rx="10" ry="22" fill="url(#a)" stroke="{outline}" stroke-width="2.4"/>'
            f'<path fill="none" stroke="#fff" stroke-width="1.3" opacity=".35" d="M30 28v24m12-24v24"/>'
        )
    elif any(k in n for k in ("muscle", "músculo", "flexed")):
        body = (
            f'<path fill="url(#a)" stroke="{outline}" stroke-width="2.6" '
            'd="M16 48c0-14 8-22 18-22 4 0 6 2 8 4 2-10 12-16 20-10 6 4 6 14 2 20-2 4-6 8-12 10H24c-4 0-8-0-8-2z"/>'
            f'<circle cx="48" cy="28" r="10" fill="url(#a)" stroke="{outline}" stroke-width="2.4"/>'
            + scales
        )
    elif any(k in n for k in ("point", "señalar", "index", "backhand")):
        rot = 0
        if "down" in n or "abajo" in n:
            rot = 180
        elif "left" in n or "izquierda" in n:
            rot = -90
        elif "right" in n or "derecha" in n:
            rot = 90
        body = (
            f'<g transform="rotate({rot} 36 36)">'
            f'{palm}{scales}'
            f'{finger(32, 8, 8, 28)}'
            f'{finger(20, 22, 7, 18, -12)}'
            f'{finger(42, 24, 7, 16, 10)}'
            f"</g>"
        )
    elif any(k in n for k in ("victory", "peace", "victoria")):
        body = (
            f'{palm}{scales}'
            f'{finger(26, 6, 8, 30, -18)}'
            f'{finger(38, 6, 8, 30, 18)}'
            f'{finger(22, 28, 7, 16, -8)}'
            f'{finger(44, 30, 7, 14, 10)}'
        )
    elif any(k in n for k in ("fist", "puño", "punch", "puñetazo")):
        body = (
            f'<rect x="16" y="28" width="40" height="28" rx="12" fill="url(#a)" stroke="{outline}" stroke-width="2.6"/>'
            f'{finger(18, 18, 8, 16)}{finger(28, 14, 8, 18)}{finger(38, 14, 8, 18)}{finger(48, 18, 8, 16)}'
            + scales
        )
    elif any(k in n for k in ("wave", "saludo", "waving")):
        body = (
            f'<g transform="rotate(-12 36 40)">'
            f'{palm}{scales}'
            f'{finger(18, 12, 7, 26, -8)}'
            f'{finger(27, 8, 7, 28)}'
            f'{finger(36, 8, 7, 28)}'
            f'{finger(45, 12, 7, 24, 8)}'
            f'{finger(14, 30, 8, 18, -40)}'
            f"</g>"
        )
    elif any(k in n for k in ("heart hands", "manos de corazón", "heart")):
        body = (
            f'<path fill="url(#a)" stroke="{outline}" stroke-width="2.6" '
            'd="M36 58S14 42 14 28c0-8 6-12 12-12 4 0 7 2 10 6 3-4 6-6 10-6 6 0 12 4 12 12 0 14-22 30-22 30z"/>'
            + highlight().replace("22", "26")
        )
    elif any(k in n for k in ("ok", "vale", "pinching")):
        body = (
            f'{palm}{scales}'
            f'<circle cx="28" cy="28" r="8" fill="none" stroke="{outline}" stroke-width="5"/>'
            f'<circle cx="28" cy="28" r="8" fill="none" stroke="url(#a)" stroke-width="3.2"/>'
            f'{finger(40, 16, 7, 22, 12)}{finger(48, 22, 7, 18, 18)}'
        )
    elif any(k in n for k in ("handshake", "apretón")):
        body = (
            f'<path fill="url(#a)" stroke="{outline}" stroke-width="2.4" d="M8 40c8-12 20-14 28-6l4 4c8-8 20-6 28 6l-10 8c-6-4-12-4-18 0l-4-3c-4 4-10 5-16 1z"/>'
            + scales
        )
    else:
        # open raised hand default
        body = (
            f'{palm}{scales}'
            f'{finger(18, 14, 8, 26)}'
            f'{finger(28, 10, 8, 28)}'
            f'{finger(38, 10, 8, 28)}'
            f'{finger(48, 16, 8, 24)}'
            f'{finger(12, 32, 9, 18, -35)}'
        )

    return wrap(body, defs)


def main() -> int:
    hand = handmade_codes()
    data = catalog()
    faces = 0
    hands = 0
    skipped = 0
    for row in data:
        name, cat, code = row[1], row[2], row[3]
        out = ASSETS / f"snk-emoji-{code}.svg"
        if code in hand and not FORCE:
            skipped += 1
            continue
        if cat == "caras":
            out.write_text(face_svg(name, code), encoding="utf-8")
            faces += 1
        elif is_hand_gesture(code, name, cat):
            out.write_text(hand_svg(name, code), encoding="utf-8")
            hands += 1
    print(f"faces={faces} hands={hands} handmade_skipped={skipped}")
    for code in ("1f603", "1f929", "1f44d", "1f44b", "1f44e", "1f64f", "1faf6"):
        p = ASSETS / f"snk-emoji-{code}.svg"
        t = p.read_text() if p.exists() else ""
        print(code, "len", len(t), "slit" , "ry=\"4.2\"" in t or "ry=\"4.2\"" in t, "green", "a6f0a0" in t)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
