"""HTTP API for Matriz LED (~m protocol) — wired from main via build_router.

Uses the same board queue as phone calls and Where/Maps distance search:
  main._queue_board_line → _board → GET /api/board/pending → snake-os-lite-local.py → Mega.

Other apps on that queue (handled in Lite firmware, not ~m):
  ~c1 / ~c? — active call / request hang-up duration (main.py call_answer / _emit_ended;
              doganiero-chat.js dcBoardCallStart/Finish via POST /api/board/say)
  ~g lat lon lat2 lon2 — Where search (/api/where/search, snake-where.js)

Matriz LED sends ~m f|c|b|A|? lines on the same queue; replies via POST /api/board/reply.
Snake OS Lite stock firmware drives the matrix for ~c1 / ~g with fixed patterns only; custom
bitmaps need a Mega that understands ~m (merge matrix-max7219.ino into Lite, or optional
standalone flash — see firmware/README.md).
"""
from __future__ import annotations

import json
import re
import threading
import time
from typing import Any, Callable

import askbox_client
from askbox_client import AskboxError
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

import matrix_codec as mc

_matrix_lock = threading.Lock()
_matrix_job: dict[str, Any] = {
    "id": 0,
    "user_id": 0,
    "status": "idle",
    "kind": "",
    "lines": [],
    "expected_cmd": "",
    "error": "",
    "at": 0.0,
    "all_sent_at": 0.0,
}
_last_bridge_poll_at = 0.0
_last_device_reply_at = 0.0
_matrix_device: dict[str, Any] = {
    "supports_custom": False,
    "version": None,
    "size": "",
}
_last_probe_at = 0.0
PROBE_COOLDOWN_SEC = 8.0

SENT_NO_REPLY_SEC = 45.0
SENDING_STALL_SEC = 120.0

AI_PROMPT_MAX = 200
AI_GRID_LINE_RE = re.compile(r"^[.#]{8}$")

_MATRIX_AI_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "frames": {
            "type": "array",
            "minItems": 1,
            "maxItems": 64,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "grid": {
                        "type": "array",
                        "minItems": 8,
                        "maxItems": 8,
                        "items": {"type": "string", "pattern": "^[.#]{8}$"},
                    },
                    "ms": {"type": "integer", "minimum": 0, "maximum": 2550},
                },
                "required": ["grid", "ms"],
            },
        },
        "loop": {"type": "boolean"},
    },
    "required": ["frames"],
}

_MATRIX_AI_SYSTEM = (
    "Eres un generador de patrones para una matriz LED 8x8 en Snake OS. "
    "Responde SOLO JSON válido según el schema. "
    "Cada frame tiene grid: 8 strings de exactamente 8 caracteres (. apagado, # encendido); "
    "fila 0 es la superior. ms es duración en milisegundos (0-2550). "
    "Para animaciones usa varios frames; para iconos estáticos uno solo con ms ~400. "
    "No incluyas markdown ni texto fuera del JSON."
)


class MatrixFrame(BaseModel):
    rows: list[int] = Field(..., min_length=8, max_length=8)
    ms: int = Field(default=200, ge=0, le=2550)


class MatrixApplyBody(BaseModel):
    kind: str = Field(..., min_length=1, max_length=16)
    frames: list[MatrixFrame] = Field(..., min_length=1, max_length=64)
    loop: bool = False
    brightness: int | None = Field(default=None, ge=0, le=15)


class MatrixClearBody(BaseModel):
    pass


class MatrixAiBody(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=AI_PROMPT_MAX)
    mode: str = Field(default="auto", pattern="^(auto|frame|animation|text)$")


def _normalize_apply_kind(kind: str, frame_count: int) -> str:
    k = str(kind or "").strip().lower()
    if k in ("frame", "bitmap", "static"):
        if frame_count <= 1:
            return "frame"
        return "animation"
    if k in ("animation", "anim", "text"):
        return "animation"
    if frame_count <= 1:
        return "frame"
    return "animation"


def note_bridge_poll() -> None:
    global _last_bridge_poll_at
    _last_bridge_poll_at = time.time()


def on_board_reply(text: str) -> None:
    global _last_device_reply_at
    line = str(text or "").strip()
    if not line.startswith("~m"):
        return
    _last_device_reply_at = time.time()
    hi = mc.parse_hi_reply(line)
    if hi:
        with _matrix_lock:
            _matrix_device["supports_custom"] = True
            _matrix_device["version"] = hi.get("version")
            _matrix_device["size"] = hi.get("size") or ""
        return
    err = mc.parse_err_reply(line)
    if err:
        with _matrix_lock:
            if int(_matrix_job.get("id") or 0) > 0:
                _matrix_job["status"] = "error"
                _matrix_job["error"] = err
                _matrix_job["at"] = time.time()
        return
    ok = mc.parse_ok_reply(line)
    if not ok:
        return
    with _matrix_lock:
        job_id = int(_matrix_job.get("id") or 0)
        cmd = ok.get("cmd")
        if job_id <= 0 or not list(_matrix_job.get("lines") or []):
            if cmd == "c" and _matrix_job.get("expected_cmd") == "c":
                _matrix_job["status"] = "done"
                _matrix_job["error"] = ""
                _matrix_job["at"] = time.time()
            return
        if cmd == "A":
            if int(ok.get("job") or 0) != job_id:
                return
        elif _matrix_job.get("expected_cmd") and cmd != _matrix_job.get("expected_cmd"):
            if cmd not in ("c", "b"):
                return
        if cmd in ("f", "A", "c", "b"):
            _matrix_job["status"] = "done"
            _matrix_job["error"] = ""
            _matrix_job["at"] = time.time()


def _board_line_sent(board_items: list[dict[str, Any]], text: str) -> bool:
    target = " ".join(str(text or "").split())
    for item in board_items:
        if item.get("who") != "tu":
            continue
        itext = " ".join(str(item.get("text") or "").split())
        if itext == target:
            return bool(item.get("sent"))
    return False


def _purge_unsent_matrix(board_items: list[dict[str, Any]]) -> None:
    keep: list[dict[str, Any]] = []
    for item in board_items:
        text = str(item.get("text") or "")
        if mc.is_matrix_line(text) and not item.get("sent"):
            continue
        keep.append(item)
    board_items[:] = keep


def _refresh_job_send_state(board_items: list[dict[str, Any]]) -> None:
    lines = list(_matrix_job.get("lines") or [])
    if not lines:
        return
    sent_flags = [_board_line_sent(board_items, ln) for ln in lines]
    if all(sent_flags):
        if not float(_matrix_job.get("all_sent_at") or 0):
            _matrix_job["all_sent_at"] = time.time()
    else:
        _matrix_job["all_sent_at"] = 0.0
    st = str(_matrix_job.get("status") or "")
    if st in ("error", "done"):
        return
    if not any(sent_flags):
        _matrix_job["status"] = "queued"
    elif not all(sent_flags):
        _matrix_job["status"] = "sending"
    else:
        if _matrix_job["status"] not in ("done", "error"):
            _matrix_job["status"] = "sending"


def _public_status(board_items: list[dict[str, Any]]) -> dict[str, Any]:
    now = time.time()
    with _matrix_lock:
        job_id = int(_matrix_job.get("id") or 0)
        user_id = int(_matrix_job.get("user_id") or 0)
        _refresh_job_send_state(board_items)
        status = str(_matrix_job.get("status") or "idle")
        all_sent_at = float(_matrix_job.get("all_sent_at") or 0)
        if status == "sending" and all_sent_at:
            if now - all_sent_at > SENT_NO_REPLY_SEC:
                status = "sent_no_reply"
            elif now - float(_matrix_job.get("at") or now) > SENDING_STALL_SEC:
                status = "timeout"
        bridge_age = (now - _last_bridge_poll_at) if _last_bridge_poll_at else None
        device_age = (now - _last_device_reply_at) if _last_device_reply_at else None
        device_matrix = {
            "supports_custom": bool(_matrix_device.get("supports_custom")),
            "version": _matrix_device.get("version"),
            "size": _matrix_device.get("size") or "",
        }
        return {
            "ok": True,
            "id": job_id,
            "user_id": user_id,
            "status": status if job_id else "idle",
            "kind": _matrix_job.get("kind") or "",
            "error": _matrix_job.get("error") or "",
            "bridge_age_s": round(bridge_age, 2) if bridge_age is not None else None,
            "device_age_s": round(device_age, 2) if device_age is not None else None,
            "device_matrix": device_matrix,
            "channel": "snake-os-lite",
        }


def _validate_ai_frames(data: Any) -> tuple[list[dict[str, Any]], bool]:
    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="Respuesta IA no válida")
    frames_raw = data.get("frames")
    if not isinstance(frames_raw, list) or not frames_raw:
        raise HTTPException(status_code=422, detail="Sin frames en la respuesta IA")
    loop = bool(data.get("loop", False))
    out: list[dict[str, Any]] = []
    for fr in frames_raw:
        if not isinstance(fr, dict):
            raise HTTPException(status_code=422, detail="Frame IA inválido")
        grid = fr.get("grid")
        if not isinstance(grid, list) or len(grid) != 8:
            raise HTTPException(status_code=422, detail="Grid IA inválido")
        for row in grid:
            if not isinstance(row, str) or not AI_GRID_LINE_RE.match(row):
                raise HTTPException(status_code=422, detail="Grid IA inválido")
        try:
            rows = mc.grid_lines_to_rows(grid)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        try:
            ms = mc.clamp_ms(int(fr.get("ms", 200)))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="ms inválido") from exc
        out.append({"rows": rows, "ms": ms, "grid": grid})
    return out, loop


def _parse_ai_json(text: str) -> Any:
    raw = str(text or "").strip()
    if not raw:
        raise HTTPException(status_code=422, detail="Respuesta IA vacía")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start : end + 1])
            except json.JSONDecodeError:
                pass
        raise HTTPException(status_code=422, detail="JSON IA inválido")


def build_router(
    require_user: Callable[..., Any],
    queue_board_line: Callable[[str], None],
    board_items: list[dict[str, Any]],
    throttle_check: Callable[[int], None],
    resolve_key: Callable[[int], str],
) -> APIRouter:
    router = APIRouter()

    @router.post("/api/matrix/apply")
    def matrix_apply(body: MatrixApplyBody, user=Depends(require_user)):
        throttle_check(int(user["id"]))
        kind = _normalize_apply_kind(body.kind, len(body.frames))
        if kind == "frame" and len(body.frames) != 1:
            raise HTTPException(status_code=422, detail="frame requiere exactamente 1 frame")
        frames_payload = [{"rows": list(f.rows), "ms": int(f.ms)} for f in body.frames]
        with _matrix_lock:
            _matrix_job["id"] = int(_matrix_job.get("id") or 0) + 1
            job_id = int(_matrix_job["id"])
            _matrix_job["user_id"] = int(user["id"])
            _matrix_job["kind"] = kind
            _matrix_job["status"] = "queued"
            _matrix_job["error"] = ""
            _matrix_job["all_sent_at"] = 0.0
            _matrix_job["at"] = time.time()
            _matrix_job["expected_cmd"] = "f" if kind == "frame" else "A"
            try:
                lines = mc.encode_apply_lines(
                    job_id,
                    kind,
                    frames_payload,
                    body.loop,
                    body.brightness,
                )
            except ValueError as exc:
                code = str(exc)
                raise HTTPException(status_code=422, detail=f"codec:{code}") from exc
            _matrix_job["lines"] = lines
        for line in lines:
            queue_board_line(line)
        return {"ok": True, "id": job_id, "lines": len(lines)}

    @router.post("/api/matrix/clear")
    def matrix_clear(_body: MatrixClearBody, user=Depends(require_user)):
        _purge_unsent_matrix(board_items)
        queue_board_line(mc.encode_clear_line())
        with _matrix_lock:
            _matrix_job["status"] = "sending"
            _matrix_job["lines"] = [mc.encode_clear_line()]
            _matrix_job["expected_cmd"] = "c"
            _matrix_job["error"] = ""
            _matrix_job["at"] = time.time()
            _matrix_job["all_sent_at"] = 0.0
        return {"ok": True}

    @router.post("/api/matrix/probe")
    def matrix_probe(_user=Depends(require_user)):
        """Queue ``~m ?`` on the Lite board queue (same path as calls)."""
        global _last_probe_at
        now = time.time()
        if now - _last_probe_at >= PROBE_COOLDOWN_SEC:
            _last_probe_at = now
            queue_board_line("~m ?")
        return {"ok": True}

    @router.get("/api/matrix/status")
    def matrix_status(
        job: int | None = Query(default=None, ge=1),
        user=Depends(require_user),
    ):
        data = _public_status(board_items)
        if job is not None:
            if int(data.get("id") or 0) != int(job):
                raise HTTPException(status_code=404, detail="Job no encontrado")
            if int(_matrix_job.get("user_id") or 0) != int(user["id"]):
                raise HTTPException(status_code=404, detail="Job no encontrado")
        else:
            if int(_matrix_job.get("user_id") or 0) not in (0, int(user["id"])):
                data["status"] = "idle"
                data["id"] = 0
        return data

    @router.post("/api/matrix/ai")
    def matrix_ai(body: MatrixAiBody, user=Depends(require_user)):
        throttle_check(int(user["id"]))
        prompt = str(body.prompt or "").strip()
        if len(prompt) > AI_PROMPT_MAX:
            raise HTTPException(status_code=422, detail="Prompt demasiado largo")
        mode = body.mode.strip().lower()
        user_prompt = prompt
        if mode == "frame":
            user_prompt = f"Modo frame (1 frame estático): {prompt}"
        elif mode == "animation":
            user_prompt = f"Modo animación (2-16 frames): {prompt}"
        elif mode == "text":
            user_prompt = f"Modo texto scroll conceptual (1-8 frames simples): {prompt}"

        key = resolve_key(int(user["id"]))

        def _call_askbox() -> list[dict[str, Any]]:
            try:
                # No pasar json_schema a Askbox: su validador estricto rechaza JSON
                # envuelto en markdown de OpenRouter (fallback cuando Gemini va sin cuota).
                # matrix_api ya parsea/valida con _parse_ai_json + _validate_ai_frames.
                result = askbox_client.ask(
                    user_prompt,
                    system=_MATRIX_AI_SYSTEM,
                    tier="balanced",
                    max_output_tokens=2048,
                    api_key=key,
                )
            except AskboxError as exc:
                status = exc.status if exc.status in (401, 403, 413, 422, 429) else 422
                headers = {"Retry-After": exc.retry_after} if exc.retry_after else None
                raise HTTPException(status_code=status, detail=exc.message, headers=headers) from exc
            text = str(result.get("text") or "")
            parsed = _parse_ai_json(text)
            frames, loop = _validate_ai_frames(parsed)
            if mode == "frame" and len(frames) != 1:
                raise HTTPException(status_code=422, detail="Se esperaba 1 frame")
            if mode == "animation" and len(frames) < 2:
                raise HTTPException(status_code=422, detail="Se esperaban varios frames")
            return frames, loop

        try:
            frames, loop = _call_askbox()
        except HTTPException:
            try:
                frames, loop = _call_askbox()
            except HTTPException:
                raise
        preview_kind = "animation" if len(frames) > 1 or loop else "frame"
        return {
            "ok": True,
            "preview": {
                "kind": preview_kind,
                "loop": loop,
                "frames": frames,
            },
        }

    return router
