"""Distrito indicado por la persona durante una llamada activa.

No hay geocodificador, ni GPS, ni mapa. El texto lo escribe quien consiente.
No se guarda en disco, no se anota en el registro y no sale ninguna coordenada.
Un municipio escrito a mano no se convierte en un distrito detectado.
"""

from __future__ import annotations

import re
from typing import Any, Awaitable, Callable

_CALL_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,48}$")
_HAS_DIGIT = re.compile(r"\d")
_STREET = re.compile(
    r"\b(calle|avda|avenida|plaza|paseo|carretera|ctra|barrio|urbanizacion|urbanización|"
    r"portal|piso|puerta|km|numero|número)\b",
    re.IGNORECASE,
)
_ALLOWED = re.compile(r"^[A-Za-zÁÉÍÓÚÜÑáéíóúüñÀ-ÿ'’.\- ]{2,40}$")
_FORBIDDEN = frozenset({
    "lat", "lng", "lon", "latitude", "longitude", "accuracy", "alt", "altitude",
    "heading", "speed", "map", "url", "href", "coords", "coordinate", "coordinates",
    "geo", "geohash", "municipio", "detected", "ip",
})


def normalize_district(raw: Any) -> str | None:
    """Texto corto que la persona escribe. None si parece una dirección o una coordenada."""
    if not isinstance(raw, str):
        return None
    text = " ".join(raw.replace("\n", " ").replace("\t", " ").split())
    if len(text) < 2 or len(text) > 40:
        return None
    low = text.lower()
    if _HAS_DIGIT.search(text) or _STREET.search(text):
        return None
    if "http" in low or "@" in text or "/" in text or "\\" in text or "," in text:
        return None
    if not _ALLOWED.match(text):
        return None
    return text


def public_payload(call_id: str, *, shared: bool, reason: str, district: str | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {
        "type": "call_district",
        "callId": str(call_id),
        "shared": bool(shared),
        "reason": reason,
    }
    if shared and district:
        body["district"] = district
    leaked = _FORBIDDEN.intersection(body)
    if leaked:
        raise RuntimeError("payload de distrito con campo prohibido")
    return body


class CallDistricts:
    """Memoria de proceso. Se borra al colgar o al retirar el consentimiento."""

    def __init__(self) -> None:
        self._by_call: dict[str, dict[int, str]] = {}

    def stored(self, call_id: str) -> dict[int, str]:
        return dict(self._by_call.get(str(call_id), {}))

    def share(self, snap: dict[str, Any] | None, uid: int, consent: bool, raw: Any) -> dict[str, Any] | None:
        if not snap or snap.get("status") != "active":
            return None
        call_id = str(snap.get("id") or "")
        if not _CALL_ID_RE.match(call_id):
            return None
        try:
            caller = int(snap["caller_id"])
            callee = int(snap["callee_id"])
            uid_i = int(uid)
        except (KeyError, TypeError, ValueError):
            return None
        if uid_i not in (caller, callee):
            return None
        slot = self._by_call.setdefault(call_id, {})
        if not consent:
            slot.pop(uid_i, None)
            if not slot:
                self._by_call.pop(call_id, None)
            return public_payload(call_id, shared=False, reason="no_compartido")
        district = normalize_district(raw)
        if not district:
            slot.pop(uid_i, None)
            if not slot:
                self._by_call.pop(call_id, None)
            return public_payload(call_id, shared=False, reason="no_disponible")
        slot[uid_i] = district
        return public_payload(call_id, shared=True, reason="indicado", district=district)

    def withdraw(self, call_id: str) -> dict[str, Any] | None:
        call_id = str(call_id or "")
        if not _CALL_ID_RE.match(call_id):
            return None
        self._by_call.pop(call_id, None)
        return public_payload(call_id, shared=False, reason="retirado")


_BOARD = CallDistricts()


def other_id(snap: dict[str, Any], uid: int) -> int | None:
    caller = int(snap["caller_id"])
    callee = int(snap["callee_id"])
    uid_i = int(uid)
    if uid_i == caller:
        return callee
    if uid_i == callee:
        return caller
    return None


async def handle_ws(
    uid: int,
    msg: dict[str, Any],
    get_snap: Callable[[str], Awaitable[dict[str, Any] | None]],
    send_to_user: Callable[[int, dict[str, Any]], Awaitable[Any]],
    board: CallDistricts | None = None,
) -> None:
    """Reenvía solo el texto consentido a la otra persona de una llamada activa."""
    board = board or _BOARD
    if not isinstance(msg, dict):
        return
    call_id = str(msg.get("callId") or "").strip()
    if not _CALL_ID_RE.match(call_id):
        return
    snap = await get_snap(call_id)
    if not snap:
        return
    payload = board.share(snap, uid, bool(msg.get("consent")), msg.get("district"))
    if payload is None:
        return
    peer = other_id(snap, uid)
    if peer is None:
        return
    await send_to_user(peer, payload)


async def revoke(
    call_id: str,
    caller_id: int,
    callee_id: int,
    send_to_user: Callable[[int, dict[str, Any]], Awaitable[Any]],
    board: CallDistricts | None = None,
) -> None:
    board = board or _BOARD
    payload = board.withdraw(call_id)
    if not payload:
        return
    await send_to_user(int(caller_id), payload)
    await send_to_user(int(callee_id), payload)
