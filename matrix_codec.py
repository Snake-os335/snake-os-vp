"""Codec for 8x8 LED matrix frames and ~m serial protocol lines.

Lines are queued like ~c1 (calls) and ~g (Where) via main._queue_board_line and the
Lite USB bridge (snake-os-lite-local.py). See matrix_api module doc for the full map.
"""
from __future__ import annotations

import re
from typing import Any

MAX_LINE_LEN = 180
MAX_TOKENS_PER_LINE = 8
ROWS = 8
COLS = 8
HEX_ROW_RE = re.compile(r"^[0-9a-fA-F]{2}$")
HEX_FRAME_RE = re.compile(r"^[0-9a-fA-F]{16}$")

CodecError = ValueError


def validate_row(value: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError) as exc:
        raise CodecError("range") from exc
    if n < 0 or n > 255:
        raise CodecError("range")
    return n


def rows_to_hex(rows: list[int]) -> str:
    if len(rows) != ROWS:
        raise CodecError("len")
    parts: list[str] = []
    for raw in rows:
        n = validate_row(raw)
        parts.append(f"{n:02x}")
    return "".join(parts)


def hex_to_rows(hex_frame: str) -> list[int]:
    clean = str(hex_frame or "").strip().lower()
    if not HEX_FRAME_RE.match(clean):
        raise CodecError("hex")
    return [int(clean[i : i + 2], 16) for i in range(0, 16, 2)]


def grid_lines_to_rows(grid: list[str]) -> list[int]:
    if len(grid) != ROWS:
        raise CodecError("len")
    out: list[int] = []
    for line in grid:
        s = str(line or "")
        if not re.match(r"^[.#]{8}$", s):
            raise CodecError("hex")
        row_val = 0
        for col, ch in enumerate(s):
            if ch == "#":
                row_val |= 1 << (7 - col)
        out.append(row_val)
    return out


def rows_to_grid_lines(rows: list[int]) -> list[str]:
    hex_frame = rows_to_hex(rows)
    out: list[str] = []
    for i in range(ROWS):
        n = int(hex_frame[i * 2 : i * 2 + 2], 16)
        chars = []
        for col in range(COLS):
            chars.append("#" if n & (1 << (7 - col)) else ".")
        out.append("".join(chars))
    return out


def clamp_ms(ms: int) -> int:
    try:
        n = int(ms)
    except (TypeError, ValueError) as exc:
        raise CodecError("range") from exc
    if n < 0:
        raise CodecError("range")
    if n > 2550:
        n = 2550
    return n


def ms_to_tenths_hex(ms: int) -> str:
    n = clamp_ms(ms)
    tenths = max(0, min(255, int(round(n / 10))))
    return f"{tenths:02x}"


def frame_token(rows: list[int], ms: int) -> str:
    return rows_to_hex(rows) + ms_to_tenths_hex(ms)


def validate_brightness(value: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError) as exc:
        raise CodecError("range") from exc
    if n < 0 or n > 15:
        raise CodecError("range")
    return n


def encode_brightness_line(brightness: int) -> str:
    b = validate_brightness(brightness)
    return f"~m b {b}"


def encode_clear_line() -> str:
    return "~m c"


def encode_fixed_frame_line(rows: list[int]) -> str:
    hx = rows_to_hex(rows)
    line = f"~m f {hx}"
    if len(line) > MAX_LINE_LEN:
        raise CodecError("len")
    return line


def encode_animation_lines(
    job: int,
    frames: list[dict[str, Any]],
    loop: bool,
) -> list[str]:
    if job < 1:
        raise CodecError("range")
    if not frames:
        raise CodecError("len")
    total = len(frames)
    tokens: list[str] = []
    for fr in frames:
        rows = fr.get("rows")
        if not isinstance(rows, list):
            raise CodecError("len")
        ms = fr.get("ms", 200)
        tokens.append(frame_token(rows, ms))
    loop_flag = 1 if loop else 0
    lines: list[str] = []
    idx0 = 0
    while idx0 < total:
        chunk = tokens[idx0 : idx0 + MAX_TOKENS_PER_LINE]
        body = ",".join(chunk)
        line = f"~m A {job} {idx0} {total} {loop_flag} {body}"
        if len(line) > MAX_LINE_LEN:
            raise CodecError("len")
        lines.append(line)
        idx0 += len(chunk)
    return lines


def encode_apply_lines(
    job: int,
    kind: str,
    frames: list[dict[str, Any]],
    loop: bool,
    brightness: int | None = None,
) -> list[str]:
    k = str(kind or "").strip().lower()
    if k not in ("frame", "animation"):
        raise CodecError("range")
    if not frames:
        raise CodecError("len")
    out: list[str] = []
    if brightness is not None:
        out.append(encode_brightness_line(brightness))
    if k == "frame":
        if len(frames) != 1:
            raise CodecError("len")
        out.append(encode_fixed_frame_line(frames[0]["rows"]))
    else:
        out.extend(encode_animation_lines(job, frames, loop))
    for line in out:
        if len(line) > MAX_LINE_LEN:
            raise CodecError("len")
    return out


def is_matrix_line(text: str) -> bool:
    t = str(text or "").strip()
    return t.startswith("~m ") or t == "~m"


def parse_ok_reply(text: str) -> dict[str, Any] | None:
    parts = str(text or "").strip().split()
    if len(parts) < 3 or parts[0] != "~m" or parts[1] != "ok":
        return None
    cmd = parts[2]
    if cmd == "f" or cmd == "c" or cmd == "b":
        return {"cmd": cmd}
    if cmd == "A" and len(parts) >= 5:
        try:
            job = int(parts[3])
            n = int(parts[4])
        except ValueError:
            return None
        return {"cmd": "A", "job": job, "n": n}
    return {"cmd": cmd}


def parse_err_reply(text: str) -> str | None:
    parts = str(text or "").strip().split()
    if len(parts) >= 3 and parts[0] == "~m" and parts[1] == "err":
        return parts[2]
    return None


def parse_hi_reply(text: str) -> dict[str, Any] | None:
    """Firmware capability banner, e.g. ``~m hi 1 8x8``."""
    parts = str(text or "").strip().split()
    if len(parts) < 4 or parts[0] != "~m" or parts[1] != "hi":
        return None
    try:
        version = int(parts[2])
    except ValueError:
        return None
    size = str(parts[3])
    if not re.match(r"^\d+x\d+$", size):
        return None
    return {"version": version, "size": size}
