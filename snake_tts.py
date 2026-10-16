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


# Voz propia de Snake OS!: tono un poco más alto (~+1,2 semitonos), ritmo algo más ágil,
# leve coro y un poco de "sala" para un timbre reconocible, sin sonar robótico. Mismo
# tratamiento en ES y EN. Solo numpy (ya está en la imagen), sin ffmpeg ni sox.
_PITCH = 1.07


def _signature(wav_bytes: bytes, out: io.BytesIO) -> None:
    import numpy as np
    with wave.open(io.BytesIO(wav_bytes), "rb") as r:
        sr, n = r.getframerate(), r.getnframes()
        x = np.frombuffer(r.readframes(n), dtype=np.int16).astype(np.float32) / 32768.0
    # subir el tono: remuestreo (la duración extra ya se pidió a Piper con length_scale)
    t = np.arange(0, len(x) - 1, _PITCH)
    y = np.interp(t, np.arange(len(x)), x)
    i = np.arange(len(y))
    # coro muy suave: copia con retardo 9 ms ± 1,5 ms modulado a 0,6 Hz
    d = (0.009 + 0.0015 * np.sin(2 * np.pi * 0.6 * i / sr)) * sr
    y = y + 0.16 * np.interp(i - d, i, y, left=0.0)
    # brillo/presencia: realce suave de agudos (pre-énfasis mezclado)
    y = y + 0.22 * np.concatenate(([0.0], np.diff(y)))
    # pequeña sala: dos ecos cortos y bajos
    for ms, g in ((23, 0.10), (41, 0.06)):
        k = int(sr * ms / 1000)
        y[k:] += g * y[:-k]
    peak = float(np.max(np.abs(y))) or 1.0
    y = np.clip(y * (0.89 / peak), -1, 1)
    with wave.open(out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((y * 32767).astype(np.int16).tobytes())


def _synth(lang: str, text: str) -> bytes:
    key = (lang, text)
    hit = _cache.get(key)
    if hit is not None:
        _cache.move_to_end(key)
        return hit
    v = _voice(lang)
    buf = io.BytesIO()
    raw = io.BytesIO()
    with _synth_lock:
        with wave.open(raw, "wb") as w:
            try:
                from piper import SynthesisConfig
                v.synthesize_wav(text, w, syn_config=SynthesisConfig(
                    length_scale=_PITCH * 0.97, noise_scale=0.6, noise_w_scale=0.75))
            except Exception:
                v.synthesize_wav(text, w)
    try:
        _signature(raw.getvalue(), buf)
    except Exception:
        buf = raw
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
