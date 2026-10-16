"""Snake OS · voz propia (Piper TTS, open source, local en el servidor).

POST /api/tts {"text": "...", "lang": "es"|"en"} -> audio/wav
- Voces en SNAKEOS_PIPER_DIR (por defecto /voices): es_ES-davefx-medium, en_US-lessac-medium.
- Límites: 600 caracteres por petición, 40 peticiones/min por usuario o IP, una síntesis a la vez.
- Sin secretos; si Piper o la voz faltan responde 503 y el cliente usa la voz del sistema.
"""
from __future__ import annotations

import io
import os
import re
import threading
import time
import wave
from collections import OrderedDict
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

VOICE_DIR = os.environ.get("SNAKEOS_PIPER_DIR", "/voices")
VOICES = {"es": "es_ES-davefx-medium", "en": "en_US-lessac-medium"}
MAX_CHARS = 600
PER_MIN = 40

_voices: dict[str, Any] = {}
_load_lock = threading.Lock()
_synth_lock = threading.Lock()
_rate: dict[str, list[float]] = {}
_rate_lock = threading.Lock()
_cache: "OrderedDict[tuple[str, str], bytes]" = OrderedDict()
_CACHE_MAX = 160


class TtsBody(BaseModel):
    text: str = Field("", max_length=4000)
    lang: str = Field("es", max_length=8)


def _voice(lang: str):
    v = _voices.get(lang)
    if v is not None:
        return v
    with _load_lock:
        v = _voices.get(lang)
        if v is None:
            from piper import PiperVoice  # import perezoso: el servidor arranca aunque falte Piper

            path = os.path.join(VOICE_DIR, VOICES[lang] + ".onnx")
            if not os.path.exists(path):
                raise FileNotFoundError(path)
            v = PiperVoice.load(path)
            _voices[lang] = v
    return v


def _clean(text: str) -> str:
    t = re.sub(r"<[^>]{0,200}>", " ", str(text or ""))
    t = re.sub(r"https?://\S+", "", t)
    t = re.sub(r"[*_`#>|~\[\]{}]", " ", t)
    return " ".join(t.split())[:MAX_CHARS]


def _synth(lang: str, text: str) -> bytes:
    key = (lang, text)
    hit = _cache.get(key)
    if hit is not None:
        _cache.move_to_end(key)
        return hit
    v = _voice(lang)
    buf = io.BytesIO()
    with _synth_lock:
        with wave.open(buf, "wb") as w:
            v.synthesize_wav(text, w)
    data = buf.getvalue()
    _cache[key] = data
    if len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)
    return data


def warm() -> None:
    """Carga las voces en segundo plano al arrancar (la primera carga tarda ~10 s)."""
    def run():
        for lang in VOICES:
            try:
                _voice(lang)
            except Exception as exc:  # sin Piper/voz: el cliente usará la voz del sistema
                print(f"[tts] voz {lang} no disponible: {type(exc).__name__}", flush=True)
                return
        print("[tts] voces listas: " + ", ".join(VOICES.values()), flush=True)
    threading.Thread(target=run, daemon=True).start()


def build_router(user_from_request) -> APIRouter:
    r = APIRouter()

    @r.get("/api/tts/status")
    def tts_status():
        return {"ready": all(l in _voices for l in VOICES), "voices": VOICES}

    @r.post("/api/tts")
    async def tts(body: TtsBody, request: Request):
        import asyncio

        text = _clean(body.text)
        if not text:
            raise HTTPException(422, "Texto vacío")
        lang = "en" if str(body.lang or "").lower().startswith("en") else "es"
        who = None
        try:
            u = user_from_request(request)
            who = "u:" + str(u["id"]) if u else None
        except Exception:
            who = None
        who = who or "ip:" + (request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "?"))
        now = time.monotonic()
        with _rate_lock:
            calls = [t for t in _rate.get(who, []) if t > now - 60]
            if len(calls) >= PER_MIN:
                raise HTTPException(429, "Demasiadas peticiones de voz; espera un momento.")
            calls.append(now)
            _rate[who] = calls
            if len(_rate) > 5000:
                _rate.clear()
        try:
            data = await asyncio.to_thread(_synth, lang, text)
        except Exception as exc:
            print(f"[tts] fallo {type(exc).__name__}: {str(exc)[:120]}", flush=True)
            raise HTTPException(503, "Voz de Snake OS no disponible")
        return Response(content=data, media_type="audio/wav", headers={"Cache-Control": "private, max-age=3600"})

    return r
