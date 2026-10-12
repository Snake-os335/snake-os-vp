"""Server-side client for the Askbox AI proxy.

Same urllib idiom as main.py / metaverse_ai_bots.py: no extra dependencies,
plain urllib.request with a short timeout and explicit HTTPError handling.

Askbox lives on the Docker host (outside this container) and exposes a
single POST /v1/ask endpoint that Snake OS calls with a Bearer token —
either the project-wide system key or a key the user supplied themselves.
"""
from __future__ import annotations

import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

DEFAULT_BASE_URL = "http://host.docker.internal:8066"
DEFAULT_KEY = ""

# Hard caps enforced here regardless of what the caller asks for.
MAX_OUTPUT_TOKENS_CAP = 8192
MAX_PROMPT_CHARS = 20000

VALID_TIERS = ("auto", "fast", "balanced", "strong")

_PROBE_TEMPLATE = "__snakeos_probe__"

_TIMEOUT_SEC = 90


class AskboxError(Exception):
    """Raised for any non-2xx Askbox response or transport failure.

    status: HTTP status code (0 for transport/network failures that never
            reached Askbox, e.g. DNS, connection refused, timeout).
    code:   Askbox's machine-readable error code, e.g. "prompt_not_found".
    message: human-readable message, safe to show to the end user.
    retry_after: value of the Retry-After header on 429s, if present.
    """

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        retry_after: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.retry_after = retry_after


def base_url() -> str:
    return (os.environ.get("SNAKEOS_ASKBOX_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")


def default_key() -> str:
    return (os.environ.get("SNAKEOS_ASKBOX_KEY") or DEFAULT_KEY).strip()


def _clamp_max_output_tokens(value: int | None) -> int:
    try:
        n = int(value) if value is not None else 2048
    except (TypeError, ValueError):
        n = 2048
    if n <= 0:
        n = 2048
    return min(n, MAX_OUTPUT_TOKENS_CAP)


def _truncate_prompt(prompt: str) -> str:
    """Keep the END of an over-long prompt (the most recent/relevant part)."""
    text = str(prompt or "")
    if len(text) <= MAX_PROMPT_CHARS:
        return text
    return text[-MAX_PROMPT_CHARS:]


def _post(path: str, payload: dict[str, Any], api_key: str) -> tuple[int, Any, dict[str, str]]:
    """POST JSON to Askbox. Returns (status, parsed_body, headers).

    Never raises for Askbox's own error responses (4xx/5xx with a JSON
    {"error": {...}} body) — those are returned as-is for the caller to
    interpret. Only transport failures (no HTTP response at all) raise
    AskboxError with status=0.
    """
    url = f"{base_url()}{path}"
    req = UrlRequest(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=_TIMEOUT_SEC) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            headers = {k: v for k, v in resp.headers.items()}
            try:
                return resp.status, json.loads(raw), headers
            except json.JSONDecodeError:
                return resp.status, raw, headers
    except HTTPError as exc:
        headers = {k: v for k, v in (exc.headers.items() if exc.headers else [])}
        raw = ""
        try:
            raw = exc.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"_raw": raw}
        return exc.code, body, headers
    except (URLError, TimeoutError, OSError) as exc:
        raise AskboxError(0, "unreachable", f"No se pudo contactar Askbox: {exc}") from exc


def _error_from_body(status: int, body: Any, headers: dict[str, str]) -> AskboxError:
    code = ""
    message = ""
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):
            code = str(err.get("code") or "")
            message = str(err.get("message") or "")
        elif isinstance(body.get("_raw"), str):
            message = body["_raw"][:300]
    if not message:
        message = f"Askbox respondió {status}"
    retry_after = headers.get("Retry-After") or headers.get("retry-after")
    return AskboxError(status, code or f"http_{status}", message, retry_after)


def ask(
    prompt: str,
    system: str | None = None,
    tier: str = "balanced",
    max_output_tokens: int | None = 2048,
    json_schema: dict[str, Any] | None = None,
    api_key: str | None = None,
    prompt_template: str | None = None,
    variables: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Call Askbox's POST /v1/ask and return the parsed JSON response.

    Raises AskboxError on any non-2xx response or transport failure.
    """
    key = (api_key or default_key()).strip()
    if not key:
        raise AskboxError(401, "missing_key", "Falta la clave de Askbox")

    tier_clean = (tier or "balanced").strip().lower()
    if tier_clean not in VALID_TIERS:
        tier_clean = "balanced"

    payload: dict[str, Any] = {
        "tier": tier_clean,
        "max_output_tokens": _clamp_max_output_tokens(max_output_tokens),
    }
    if prompt_template:
        payload["prompt_template"] = prompt_template
    else:
        payload["prompt"] = _truncate_prompt(prompt)
    if system:
        payload["system"] = str(system)
    if json_schema is not None:
        payload["json_schema"] = json_schema
    if variables is not None:
        payload["variables"] = variables

    status, body, headers = _post("/v1/ask", payload, key)
    if status < 200 or status >= 300:
        raise _error_from_body(status, body, headers)
    if not isinstance(body, dict):
        raise AskboxError(502, "bad_response", "Askbox devolvió una respuesta no válida")
    return body


def validate_key(api_key: str) -> bool:
    """Probe a key against Askbox without consuming a real prompt.

    Uses an intentionally non-existent prompt_template: Askbox checks auth
    before resolving the template, so a 404 prompt_not_found means the key
    itself is valid, while 401 means it is not.
    """
    key = (api_key or "").strip()
    if not key:
        return False
    status, body, _headers = _post("/v1/ask", {"prompt_template": _PROBE_TEMPLATE}, key)
    if status == 404:
        code = ""
        if isinstance(body, dict):
            err = body.get("error")
            if isinstance(err, dict):
                code = str(err.get("code") or "")
        # Any 404 on this probe means auth succeeded and only the template
        # lookup failed — treat as valid even if Askbox's code string drifts.
        return True
    if status == 401:
        return False
    # Anything else (403, 422, 429, 502, ...) is inconclusive: surface it so
    # the caller can show a real error instead of a wrong true/false.
    raise _error_from_body(status, body, _headers)
