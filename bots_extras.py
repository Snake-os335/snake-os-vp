"""Doganiero Bots (2026-10-14): bots por perfil con tareas en paralelo.

Tablas nuevas y aditivas: dbots_bots (un documento JSON por perfil) y
dbots_tasks (una fila por tarea). Las tareas corren en el servidor con un
pool de hilos; buscan en internet y razonan con AskBox usando SOLO la clave
propia del usuario que ha iniciado sesión. Las claves nunca se registran
ni se devuelven al navegador.
"""
from __future__ import annotations

import json
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

import askbox_client
import db
import osx_extras

CHAT_ASK_TIMEOUT = 45      # s por llamada a AskBox dentro del chat
# Latencia: el chat y el agente usan el tier rápido (mismo gpt-4o-mini en AskBox y, si OpenRouter falla,
# cae a un flash-lite en ~1 s en vez de la cascada lenta de modelos medianos).
import os as _os
CHAT_TIER = _os.environ.get("SNAKEOS_BOTS_CHAT_TIER", "fast")
AGENT_TIER = _os.environ.get("SNAKEOS_BOTS_AGENT_TIER", "fast")
CHAT_HISTORY_MSGS = 10    # mensajes previos que se envían a la IA
CHAT_HISTORY_CHARS = 700  # recorte por mensaje previo
CHAT_DEADLINE = 170        # s máximo por respuesta del chat (después se para con aviso)
_chat_jobs: dict[str, dict[str, Any]] = {}
_chat_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="dbots-chat")


class _ChatCancelled(Exception):
    pass
from askbox_client import AskboxError

MAX_BOTS = 12
MAX_QUEUED_PER_USER = 20      # en cola + trabajando
MAX_RUNNING_PER_USER = 3      # en paralelo por perfil
MAX_TASKS_PER_MIN = 8         # nuevas tareas por minuto y perfil
HISTORY_PER_USER = 200
THEMES = ("selva", "lava", "oceano", "lila", "oro", "noche", "coral", "menta")
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")

_pool = ThreadPoolExecutor(max_workers=6, thread_name_prefix="dbots")
_lock = threading.Lock()
_running: dict[int, int] = {}
_cancel: set[str] = set()
_rate: dict[int, list[float]] = {}


def _ensure(conn) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS dbots_bots (
            user_id INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS dbots_tasks (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            bot_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            input TEXT NOT NULL,
            status TEXT NOT NULL,
            result TEXT NOT NULL DEFAULT '',
            log TEXT NOT NULL DEFAULT '[]',
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS dbots_tasks_user ON dbots_tasks(user_id, created_at);
        """
    )


def _load_bots(uid: int) -> list[dict[str, Any]]:
    with db.get_conn() as conn:
        _ensure(conn)
        row = conn.execute("SELECT data FROM dbots_bots WHERE user_id=?", (uid,)).fetchone()
    if not row:
        return []
    try:
        data = json.loads(row[0])
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save_bots(uid: int, bots: list[dict[str, Any]]) -> None:
    with db.get_conn() as conn:
        _ensure(conn)
        conn.execute(
            "INSERT INTO dbots_bots(user_id,data,updated_at) VALUES(?,?,?) "
            "ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
            (uid, json.dumps(bots, ensure_ascii=False), time.time()),
        )
        conn.commit()


def _clean_bot(raw: dict[str, Any], old: dict[str, Any] | None = None) -> dict[str, Any]:
    b = dict(old or {})
    if "name" in raw or not old:
        name = str(raw.get("name") or "").strip()[:40]
        if not name:
            raise HTTPException(422, "El bot necesita un nombre")
        b["name"] = name
    if "role" in raw or not old:
        b["role"] = str(raw.get("role") or "").strip()[:600]
    if "theme" in raw or not old:
        t = str(raw.get("theme") or "selva")
        b["theme"] = t if t in THEMES else "selva"
    if "avatar" in raw or not old:
        b["avatar"] = str(raw.get("avatar") or "🤖")[:8]
    if "fig" in raw or not old:
        try:
            b["fig"] = max(0, min(11, int(raw.get("fig") or 0)))
        except (TypeError, ValueError):
            b["fig"] = 0
    if "color" in raw:
        c = str(raw.get("color") or "")
        if re.match(r"^#[0-9a-fA-F]{6}$", c):
            b["color"] = c.lower()
    if "memory" in raw:
        mem = raw.get("memory") or []
        if isinstance(mem, str):
            mem = [x for x in mem.splitlines()]
        b["memory"] = [str(x).strip()[:200] for x in mem if str(x).strip()][:30]
    return b


def _task_row(r) -> dict[str, Any]:
    try:
        log = json.loads(r[7])
    except Exception:
        log = []
    return {
        "id": r[0], "bot_id": r[2], "kind": r[3], "input": r[4], "status": r[5],
        "result": r[6], "log": log, "created_at": r[8], "updated_at": r[9],
    }


def _update_task(tid: str, **fields: Any) -> None:
    sets, vals = [], []
    for k, v in fields.items():
        sets.append(f"{k}=?")
        vals.append(json.dumps(v, ensure_ascii=False) if k == "log" else v)
    sets.append("updated_at=?")
    vals.append(time.time())
    vals.append(tid)
    with db.get_conn() as conn:
        _ensure(conn)
        conn.execute(f"UPDATE dbots_tasks SET {', '.join(sets)} WHERE id=?", vals)
        conn.commit()


def _rate_check(uid: int) -> None:
    now = time.monotonic()
    calls = [t for t in _rate.get(uid, []) if t > now - 60]
    if len(calls) >= MAX_TASKS_PER_MIN:
        raise HTTPException(429, "Demasiadas tareas seguidas; espera un minuto.")
    calls.append(now)
    _rate[uid] = calls


class BotsBody(BaseModel):
    name: str | None = None
    role: str | None = None
    theme: str | None = None
    avatar: str | None = None
    memory: list[str] | None = None
    fig: int | None = None
    color: str | None = None


class ChatBody(BaseModel):
    text: str = Field("", max_length=2000)
    attachments: list[str] = Field(default_factory=list, max_length=6)
    ctx: dict[str, Any] = Field(default_factory=dict)  # apps/fondos disponibles en el escritorio del usuario
    origin: str | None = None  # 'desktop' (escritorio principal) o 'lite' (Snake OS Lite del bot)


# ---- Acciones del bot en el escritorio de Snake OS (lista blanca; las ejecuta el navegador del usuario) ----
DESKTOP_OPS = {
    "open_app": ("app",), "close_app": ("app",), "create_folder": ("name",), "create_note": ("text",),
    "create_file": ("name", "text"), "set_wallpaper": ("id",), "move_window": ("app", "x", "y", "w", "h"),
    "switch_desktop": ("n",), "delete_file": ("name",), "call_contact": ("name",),
}
DESTRUCTIVE_OPS = {"delete_file", "call_contact"}
BROWSE_OPS = {"search", "open", "click", "scroll", "read", "form"}


# Regla de lugar (2026-10-16): el bot actúa en el escritorio de Snake OS del usuario SOLO si la
# petición termina con «/en mi escritorio» (o «/on my desktop»). Si no, usa su propio Snake OS Lite.
_DESK_SUFFIX_RE = re.compile(r"\s*/\s*(en\s+mi\s+escritorio|on\s+my\s+desktop)\s*[.!?]*\s*$", re.I)


def _split_desk_suffix(text) -> tuple[bool, str]:
    """(quiere_escritorio_usuario, texto_sin_el_sufijo)."""
    t = str(text or "")
    m = _DESK_SUFFIX_RE.search(t)
    if not m:
        return False, t
    return True, t[:m.start()].rstrip()


def _clean_desktop(steps: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for st in (steps if isinstance(steps, list) else []):
        if not isinstance(st, dict):
            continue
        op = str(st.get("op") or "")
        if op not in DESKTOP_OPS:
            continue
        clean: dict[str, Any] = {"op": op}
        for k in DESKTOP_OPS[op]:
            v = st.get(k)
            if k in ("x", "y", "w", "h", "n"):
                try:
                    clean[k] = max(0, min(4000, int(v))) if v is not None else None
                except (TypeError, ValueError):
                    clean[k] = None
            else:
                clean[k] = str(v or "")[:4000 if k == "text" else 120]
        if op in DESTRUCTIVE_OPS:
            clean["confirm"] = True
        out.append(clean)
    return out


# ---- Adjuntos del chat (por perfil y bot; solo los sirve al dueño vía API autenticada) ----
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_FILES_PER_USER = 300
_FILES_DIR = db.DATA_DIR / "dbots_files"
_SAFE_TYPES = {
    "image/png", "image/jpeg", "image/gif", "image/webp",
    "application/pdf", "text/plain", "text/markdown", "text/csv", "application/json",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword", "application/vnd.ms-excel", "application/zip",
}
_EXT_TYPES = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp",
    "pdf": "application/pdf", "txt": "text/plain", "md": "text/markdown", "csv": "text/csv", "json": "application/json",
    "log": "text/plain", "py": "text/plain", "js": "text/plain", "html": "text/plain", "css": "text/plain",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "doc": "application/msword", "xls": "application/vnd.ms-excel", "zip": "application/zip",
}
_TEXT_TYPES = {"text/plain", "text/markdown", "text/csv", "application/json"}


# ---- Lectura de páginas web (protección SSRF: solo http/https públicos, sin cookies ni credenciales) ----
import html as _html
import ipaddress
import socket
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, HTTPHandler, HTTPSHandler, Request as _UReq, build_opener

URL_RE = re.compile(r"https?://[^\s<>\"'«»]+", re.I)
MAX_PAGE_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 4
FETCH_TIMEOUT = 10
_fetch_rate: dict[int, list[float]] = {}


class UrlBlocked(Exception):
    pass


def _check_host(url: str) -> None:
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        raise UrlBlocked("Solo se pueden abrir enlaces http o https")
    if u.username or u.password:
        raise UrlBlocked("No se permiten enlaces con usuario o contraseña")
    host = u.hostname.strip(".").lower()
    if host == "localhost" or host.endswith((".local", ".internal", ".localhost", ".lan", ".home", ".arpa")):
        raise UrlBlocked("No se pueden abrir direcciones internas")
    try:
        port = u.port or (443 if u.scheme == "https" else 80)
    except ValueError:
        raise UrlBlocked("Puerto no válido")
    if port not in (80, 443, 8080, 8443):
        raise UrlBlocked("Puerto no permitido")
    infos = None
    for attempt in range(3):
        try:
            infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
            break
        except socket.gaierror as exc:
            if exc.errno != socket.EAI_AGAIN or attempt == 2:
                raise UrlBlocked("No existe esa dirección" if exc.errno != socket.EAI_AGAIN else "No se pudo resolver la dirección; prueba otra vez")
            time.sleep(0.6)
        except UnicodeError:
            raise UrlBlocked("No existe esa dirección")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if getattr(ip, "ipv4_mapped", None):
            ip = ip.ipv4_mapped
        if not ip.is_global or ip.is_multicast:
            raise UrlBlocked("No se pueden abrir direcciones privadas o internas")


class _SafeRedirect(HTTPRedirectHandler):
    max_redirections = MAX_REDIRECTS

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        newurl = urljoin(req.full_url, newurl)
        _check_host(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_opener = build_opener(HTTPHandler, HTTPSHandler, _SafeRedirect)
_opener.addheaders = []


def _strip_html(page: str, base: str):
    m = re.search(r"<title[^>]*>([\s\S]*?)</title>", page, re.I)
    title = _html.unescape(re.sub(r"\s+", " ", m.group(1))).strip()[:200] if m else ""
    links: list[dict[str, str]] = []
    for href, label in re.findall(r"<a\b[^>]*href=[\"']([^\"'#]+)[\"'][^>]*>([\s\S]*?)</a>", page[:600000], re.I)[:400]:
        full = urljoin(base, _html.unescape(href.strip()))
        if not full.startswith(("http://", "https://")):
            continue
        txt = _html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", label))).strip()[:80]
        if txt and all(l["url"] != full for l in links):
            links.append({"text": txt, "url": full[:400]})
        if len(links) >= 25:
            break
    body = re.sub(r"<(script|style|noscript|svg|iframe|template|head)\b[\s\S]*?</\1>", " ", page, flags=re.I)
    body = re.sub(r"<!--[\s\S]*?-->", " ", body)
    body = re.sub(r"<(br|p|div|li|h[1-6]|tr|section|article)\b[^>]*>", "\n", body, flags=re.I)
    body = _html.unescape(re.sub(r"<[^>]+>", " ", body))
    body = re.sub(r"[ \t\r\f\v]+", " ", body)
    body = re.sub(r"\n\s*\n+", "\n", body).strip()
    forms = []
    for fm in re.finditer(r"<form\b([^>]*)>([\s\S]*?)</form>", page[:600000], re.I):
        attrs, inner = fm.group(1), fm.group(2)
        if re.search(r"method=[\"']?post", attrs, re.I):
            continue
        am = re.search(r"action=[\"']([^\"']*)[\"']", attrs, re.I)
        im = re.search(r"<input\b[^>]*type=[\"']?(?:search|text)[\"']?[^>]*name=[\"']([^\"']+)[\"']|<input\b[^>]*name=[\"']([^\"']+)[\"'][^>]*type=[\"']?(?:search|text)", inner, re.I)
        if im:
            forms.append({"action": urljoin(base, _html.unescape(am.group(1)) if am else base)[:400], "field": (im.group(1) or im.group(2))[:60]})
        if len(forms) >= 3:
            break
    return title, body, links, forms


def fetch_page(url: str, max_chars: int = 7000) -> dict[str, Any]:
    url = url.strip().rstrip(".,;:!?)»]")
    _check_host(url)
    req = _UReq(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; DoganieroBots/1.0)",
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.7",
        "Accept-Encoding": "identity",
    })
    try:
        with _opener.open(req, timeout=FETCH_TIMEOUT) as resp:
            final = resp.geturl()
            _check_host(final)
            ctype = (resp.headers.get("Content-Type") or "").lower()
            raw = resp.read(MAX_PAGE_BYTES + 1)[:MAX_PAGE_BYTES]
    except UrlBlocked:
        raise
    except Exception as exc:  # noqa: BLE001
        code = getattr(exc, "code", None)
        raise UrlBlocked(f"La página respondió {code}" if code else "No se pudo abrir la página (tiempo agotado o sin conexión)")
    if ctype and not any(t in ctype for t in ("html", "text/", "xml", "json")):
        raise UrlBlocked("Ese enlace no es una página de texto (" + ctype.split(";")[0] + ")")
    m = re.search(r"charset=([\w-]+)", ctype)
    try:
        page = raw.decode(m.group(1) if m else "utf-8", errors="replace")
    except LookupError:
        page = raw.decode("utf-8", errors="replace")
    if "html" in ctype or "<html" in page[:2000].lower():
        title, text, links, forms = _strip_html(page, final)
    else:
        title, text, links, forms = "", page, [], []
    dom = (urlparse(final).hostname or "").removeprefix("www.")
    return {"url": final, "domain": dom, "title": title or dom, "text": text[:max_chars], "links": links, "forms": forms}


# ---- Proxy del navegador embebido del bot ----
# Sirve la página real dentro de un iframe aislado (CSP sandbox, sin allow-same-origin):
# sin cookies ni credenciales del usuario, sin Set-Cookie, sin X-Frame-Options/CSP de la web original.
import hashlib
import hmac
import os
import secrets
from urllib.parse import quote, urlencode

_PROXY_SECRET = secrets.token_bytes(32)
PROXY_TOKEN_TTL = 3 * 3600
PROXY_PER_MIN = 60
_proxy_rate: dict[int, list[float]] = {}
_proxy_cache: dict[str, tuple[float, str, str]] = {}
PROXY_CSP = "sandbox allow-scripts allow-forms; frame-ancestors 'self'"


def proxy_token(uid: int) -> str:
    exp = int(time.time()) + PROXY_TOKEN_TTL
    msg = f"{int(uid)}.{exp}"
    sig = hmac.new(_PROXY_SECRET, msg.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{msg}.{sig}"


def _proxy_uid(tok: str) -> int | None:
    try:
        uid, exp, sig = tok.split(".")
        good = hmac.new(_PROXY_SECRET, f"{uid}.{exp}".encode(), hashlib.sha256).hexdigest()[:32]
        if hmac.compare_digest(good, sig) and int(exp) > time.time():
            return int(uid)
    except Exception:
        pass
    return None


def _fetch_raw(url: str) -> tuple[str, str, bytes]:
    _check_host(url)
    req = _UReq(url, headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.7",
    })
    try:
        with _opener.open(req, timeout=FETCH_TIMEOUT) as resp:
            final = resp.geturl()
            _check_host(final)
            ctype = (resp.headers.get("Content-Type") or "").lower()
            raw = resp.read(MAX_PAGE_BYTES + 1)
    except UrlBlocked:
        raise
    except Exception as exc:  # noqa: BLE001
        code = getattr(exc, "code", None)
        raise UrlBlocked(f"La página respondió {code}" if code else "No se pudo abrir la página (tiempo agotado o sin conexión)")
    if len(raw) > MAX_PAGE_BYTES:
        raise UrlBlocked("La página pasa de 2 MB")
    return final, ctype, raw


def _normalize_charset(name: str) -> str:
    n = (name or "").strip().lower().replace('"', "").replace("'", "")
    aliases = {
        "utf8": "utf-8", "utf-8": "utf-8",
        "iso-8859-1": "latin-1", "iso8859-1": "latin-1", "latin1": "latin-1", "latin-1": "latin-1",
        "windows-1252": "cp1252", "cp1252": "cp1252", "ansi": "cp1252",
        "gb2312": "gbk", "gbk": "gbk", "big5": "big5",
        "shift_jis": "shift_jis", "shift-jis": "shift_jis", "sjis": "shift_jis",
        "euc-jp": "euc_jp", "euc-kr": "euc_kr",
        "us-ascii": "ascii", "ascii": "ascii",
    }
    return aliases.get(n, n or "utf-8")


def _score_text(s: str) -> float:
    if not s:
        return -1e9
    bad = s.count("\ufffd")
    moji = len(re.findall(r"Ã.|Â.|â€.", s[:80000]))
    good = len(re.findall(r"[A-Za-zÁÉÍÓÚáéíóúñÑüÜ]", s[:40000]))
    return good - bad * 50 - moji * 30


def _decode(raw: bytes, ctype: str) -> str:
    """Decodifica HTML a Unicode. Prioriza UTF-8; Content-Type/meta como pista; anti-mojibake."""
    if not raw:
        return ""
    if raw[:2] == b"\x1f\x8b":
        import gzip
        try:
            raw = gzip.decompress(raw)
        except Exception:
            pass
    elif raw[:2] in (b"\x78\x9c", b"\x78\x01", b"\x78\xda"):
        import zlib
        try:
            raw = zlib.decompress(raw)
        except Exception:
            pass

    declared: list[str] = []
    m = re.search(r"charset\s*=\s*([\w.\-]+)", ctype or "", re.I)
    if m:
        declared.append(_normalize_charset(m.group(1)))
    head = raw[:8192]
    for rx in (
        rb"<meta[^>]+charset=[\"']?([\w.\-]+)",
        rb"<meta[^>]+http-equiv=[\"']?content-type[\"'][^>]+content=[\"'][^\"']*charset=([\w.\-]+)",
    ):
        mm = re.search(rx, head, re.I)
        if mm:
            cs = mm.group(1)
            declared.append(_normalize_charset(cs.decode("ascii", "ignore") if isinstance(cs, bytes) else cs))

    if raw.startswith(b"\xef\xbb\xbf"):
        try:
            return raw.decode("utf-8-sig")
        except Exception:
            pass

    candidates: list[str] = []
    for c in ["utf-8"] + declared + ["cp1252", "latin-1"]:
        if c and c not in candidates:
            candidates.append(c)

    best_s, best_sc = None, -1e18
    for cs in candidates:
        try:
            s = raw.decode(cs, errors="strict" if cs == "utf-8" else "replace")
        except Exception:
            try:
                s = raw.decode(cs, errors="replace")
            except Exception:
                continue
        sc = _score_text(s) + (5 if cs == "utf-8" else 0)
        if sc > best_sc:
            best_sc, best_s = sc, s
    return best_s if best_s is not None else raw.decode("utf-8", errors="replace")



def _proxy_doc(origin: str, tok: str, final: str, page: str) -> str:
    page = re.sub(r"<meta[^>]+http-equiv=[\"']?(content-security-policy|x-frame-options|refresh|set-cookie)[^>]*>", "", page, flags=re.I)
    page = re.sub(r"<base\b[^>]*>", "", page, flags=re.I)
    page = re.sub(r"<meta[^>]+charset=[^>]*>", "", page, flags=re.I)
    page = re.sub(r"<meta[^>]+http-equiv=[\"']?content-type[\"'][^>]*>", "", page, flags=re.I)
    cfg = json.dumps({"p": origin + "/api/dbots/proxy", "t": tok, "u": final, "o": origin})
    inject = (
        '<meta charset="utf-8">'
        f'<base href="{_html.escape(final, quote=True)}">'
        f'<script>window.__DBP={cfg};</script>'
        f'<script src="{origin}/static/dbots-proxy-helper.js?v=20261015u"></script>'
    )
    hm = re.search(r"<head\b[^>]*>", page, re.I)
    if hm:
        return page[:hm.end()] + inject + page[hm.end():]
    return "<!doctype html><html><head>" + inject + "</head><body>" + page + "</body></html>"


def _proxy_error(origin: str, msg: str, url: str) -> str:
    cfg = json.dumps({"p": origin + "/api/dbots/proxy", "t": "", "u": url, "o": origin, "error": msg})
    return ("<!doctype html><html><head><meta charset=utf-8><script>window.__DBP=" + cfg + ";</script>"
            f'<script src="{origin}/static/dbots-proxy-helper.js?v=20261015u"></script></head>'
            "<body style=\"font-family:system-ui;padding:24px;color:#333;text-align:center\"><p style=\"font-size:40px\">🚧</p>"
            f"<p>No se pudo mostrar la página.</p><p style=\"color:#b3261e\">{_html.escape(msg)}</p></body></html>")


def _google_blocked(final: str, page: str) -> bool:
    low = page[:200000].lower()
    return ("consent.google" in final or "/sorry/" in final or "unusual traffic" in low or "tráfico inusual" in low
            or "recaptcha" in low or "<h3" not in low)


# ---- Buscador general del navegador del bot (DuckDuckGo HTML + Bing HTML; sin claves de pago) ----
import base64
from urllib.parse import parse_qs, unquote

_serp_cache: dict[tuple[str, int], tuple[float, list[dict[str, str]]]] = {}
_SERP_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def _txt(h: str) -> str:
    return _html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h or ""))).strip()


def _get(url: str, data: bytes | None = None) -> str:
    req = _UReq(url, data=data, headers={"User-Agent": _SERP_UA, "Accept-Language": "es-ES,es;q=0.9,en;q=0.6"})
    with _opener.open(req, timeout=FETCH_TIMEOUT) as resp:
        return resp.read(MAX_PAGE_BYTES).decode("utf-8", "replace")


def _ddg(q: str, page: int) -> list[dict[str, str]]:
    form = {"q": q, "kl": "es-es"}
    if page > 1:
        form.update({"s": str((page - 1) * 10), "dc": str((page - 1) * 10 + 1), "v": "l", "o": "json", "api": "d.js"})
    h = _get("https://html.duckduckgo.com/html/", urlencode(form).encode())
    out = []
    for blk in re.split(r'<div class="result results_links', h)[1:]:
        if "result--ad" in blk[:200]:
            continue
        m = re.search(r'class="result__a" href="([^"]+)"[^>]*>(.*?)</a>', blk, re.S)
        if not m:
            continue
        url = _html.unescape(m.group(1))
        if "duckduckgo.com/l/?" in url:
            url = unquote(parse_qs(urlparse(url).query).get("uddg", [""])[0])
        sn = re.search(r'class="result__snippet"[^>]*>(.*?)</a>', blk, re.S)
        out.append({"title": _txt(m.group(2)), "url": url, "snippet": _txt(sn.group(1)) if sn else "", "src": "ddg"})
    if not out:  # DuckDuckGo a veces responde con su comprobación anti-bots: probamos la versión lite
        form = {"q": q, "kl": "es-es"}
        if page > 1:
            form.update({"s": str((page - 1) * 10), "dc": str((page - 1) * 10 + 1)})
        h = _get("https://lite.duckduckgo.com/lite/", urlencode(form).encode())
        links = re.findall(r'<a[^>]+href="([^"]+)"[^>]*class=.result-link.[^>]*>(.*?)</a>', h, re.S)
        snips = re.findall(r"class=.result-snippet.[^>]*>(.*?)</td>", h, re.S)
        for i, (u, t) in enumerate(links):
            u = _html.unescape(u)
            if "duckduckgo.com/l/?" in u:
                u = unquote(parse_qs(urlparse(u).query).get("uddg", [""])[0])
            out.append({"title": _txt(t), "url": u, "snippet": _txt(snips[i]) if i < len(snips) else "", "src": "ddg"})
    return out


def _bing_url(u: str) -> str:
    if "bing.com/ck/a" in u:
        v = parse_qs(urlparse(_html.unescape(u)).query).get("u", [""])[0]
        if v.startswith("a1"):
            try:
                return base64.urlsafe_b64decode(v[2:] + "=" * (-len(v[2:]) % 4)).decode("utf-8", "replace")
            except Exception:
                return ""
    return _html.unescape(u)


_BING_MKTS = ["es-ES", "es-MX", "es-AR", "es-US", "es-CO", "es-CL", "en-US", "en-GB", "es-PE", "es-VE", "en-IE", "en-CA"]


def _bing(q: str, page: int) -> list[dict[str, str]]:
    # Bing sin cookies ignora la paginación: cada «página» pide otro mercado de Bing para sacar resultados distintos.
    mkt = _BING_MKTS[(page - 1) % len(_BING_MKTS)]
    h = _get("https://www.bing.com/search?" + urlencode({"q": q, "setlang": mkt.split("-")[0], "mkt": mkt, "cc": mkt.split("-")[1]}))
    out = []
    for blk in re.split(r'<li class="b_algo', h)[1:]:
        m = re.search(r'<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', blk, re.S)
        if not m:
            continue
        sn = re.search(r'<p[^>]*>(.*?)</p>', blk, re.S)
        out.append({"title": _txt(m.group(2)), "url": _bing_url(m.group(1)), "snippet": _txt(sn.group(1)) if sn else "", "src": "bing"})
    return out


def _item(it: dict[str, str]) -> dict[str, str]:
    u = it.get("url") or ""
    dom = urlparse(u).hostname or ""
    return {"title": (it.get("title") or "")[:160] or dom, "url": u[:600], "snippet": (it.get("snippet") or "")[:320], "domain": dom,
            "favicon": f"https://external-content.duckduckgo.com/ip3/{dom}.ico"}


def web_index(q: str, page: int = 1, fallback: Callable[[str, int], list[dict[str, str]]] | None = None) -> list[dict[str, str]]:
    q = q.strip()[:200]
    page = max(1, min(10, int(page or 1)))
    key = (q.lower(), page)
    hit = _serp_cache.get(key)
    if hit and hit[0] > time.time() - 300:
        return hit[1]
    lists = []
    jobs = [(_ddg, page), (_bing, page), (_bing, page + 6)]
    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = [ex.submit(fn, q, pg) for fn, pg in jobs]
        for f in futs:
            try:
                lists.append(f.result(timeout=FETCH_TIMEOUT + 2))
            except Exception:
                lists.append([])
    res, seen = [], set()
    def add(it: dict[str, str]) -> None:
        u = it.get("url") or ""
        if not re.match(r"https?://", u):
            return
        k = re.sub(r"^https?://(www\.)?", "", u).rstrip("/")
        if k in seen:
            return
        seen.add(k)
        res.append(_item(it))
    for i in range(max([len(x) for x in lists] + [0])):
        for lst in lists:
            if i < len(lst):
                add(lst[i])
    if fallback and page == 1 and len(res) < 6:
        for it in fallback(q, 8) or []:
            add(it)
    if res:
        _serp_cache[key] = (time.time(), res)
        if len(_serp_cache) > 200:
            for k in sorted(_serp_cache, key=lambda k: _serp_cache[k][0])[:50]:
                _serp_cache.pop(k, None)
    return res


def _serp_html(origin: str, tok: str, q: str, page: int, res: list[dict[str, str]]) -> str:
    e = lambda x: _html.escape(str(x or ""), quote=True)
    cfg = json.dumps({"p": origin + "/api/dbots/proxy", "t": tok, "u": ("dsearch:" + q if q else "dsearch:"), "o": origin, "serp": True})
    items = "".join(
        f'<div class="r"><div class="s"><img src="{e(r["favicon"])}" referrerpolicy="no-referrer" loading="lazy" alt="">'
        f'<div><div class="d">{e(r["domain"])}</div><div class="u">{e(r["url"])}</div></div></div>'
        f'<a href="{e(r["url"])}">{e(r["title"])}</a><p>{e(r["snippet"])}</p></div>' for r in res)
    sq = quote(q)
    nav = "".join(
        f'<a data-serp class="{"on" if n == page else ""}" href="{origin}/api/dbots/serp?q={sq}&p={n}&t={e(tok)}">{n}</a>' for n in range(1, 6))
    nxt = f'<a data-serp href="{origin}/api/dbots/serp?q={sq}&p={page + 1}&t={e(tok)}">Siguiente ›</a>' if res and page < 10 else ""
    return ("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
            f"<title>{e(q) + ' · ' if q else ''}Doganiero Search</title>"f'<link rel="icon" type="image/png" href="{origin}/static/assets/doganiero-search-logo.png?v=20261015g">'f"<script>window.__DBP={cfg};</script>"
            f'<script src="{origin}/static/dbots-proxy-helper.js?v=20261015u"></script><style>'
            "body{margin:0;font-family:arial,system-ui,sans-serif;color:#202124;background:#fff}"
            ".top{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #ebebeb;position:sticky;top:0;background:#fff;z-index:2}"
            ".lg{display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:1.15rem;letter-spacing:-.5px;color:#ff8a00;white-space:nowrap}.lg b{color:#ff8a00;font-weight:800}.lg img{width:36px;height:36px;border-radius:8px;object-fit:cover;flex:none;box-shadow:0 1px 4px rgba(0,0,0,.12)}.home .lg img{width:88px;height:88px;border-radius:18px}"
            "form{flex:1;max-width:640px;display:flex;gap:8px;align-items:center}input[name=q]{flex:1;min-width:0;box-sizing:border-box;border:1px solid #dfe1e5;border-radius:24px;padding:9px 16px;font-size:15px;box-shadow:0 1px 6px rgba(32,33,36,.18);outline:0}button.go,button[type=submit]{flex:none;cursor:pointer;pointer-events:auto;z-index:5;position:relative;border:0;border-radius:24px;padding:9px 18px;font-size:14px;font-weight:700;color:#fff;background:#ff8a00;box-shadow:0 1px 4px rgba(0,0,0,.15)}button.go:hover,button[type=submit]:hover{background:#e67a00}"
            ".st{color:#70757a;font-size:13px;padding:10px 16px 0}.w{padding:4px 16px 20px;max-width:680px}"
            ".r{margin:18px 0}.s{display:flex;gap:10px;align-items:center}.s img{width:18px;height:18px;border-radius:50%;background:#f1f3f4;padding:4px}"
            ".d{font-size:14px}.u{font-size:12px;color:#4d5156;max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
            ".r>a{display:inline-block;margin-top:4px;font-size:19px;color:#1a0dab;text-decoration:none;line-height:1.3}.r>a:hover{text-decoration:underline}.r p{margin:3px 0 0;font-size:14px;line-height:1.55;color:#4d5156}"
            ".pg{display:flex;gap:6px;flex-wrap:wrap;padding:8px 16px 30px}.pg a{padding:6px 11px;border-radius:8px;color:#1a0dab;text-decoration:none;font-size:14px}.pg a.on{background:#fff3e0;color:#e65100;font-weight:700}"
            ".home{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:70vh;gap:14px;padding:24px}"
            ".home .lg{font-size:2.4rem}.home form{width:min(560px,100%)}.hint{color:#70757a;font-size:13px}"
            "@media(max-width:520px){.top{flex-wrap:wrap}.r>a{font-size:17px}.home .lg{font-size:1.7rem}}</style></head><body>"
            + (f'<div class="home"><div class="lg"><img src="{origin}/static/assets/doganiero-search-logo.png?v=20261015g" alt=""><b>Doganiero Search</b></div><form data-serpform action="{origin}/api/dbots/serp" method="get"><input name="q" placeholder="Buscar en Doganiero Search…" autofocus autocomplete="off"><input type="hidden" name="t" value="{e(tok)}"><button type="submit" class="go" data-serpgo>Buscar</button></form><div class="hint">Resultados de muchos sitios · DuckDuckGo + Bing</div></div></body></html>'
               if not q else
               f'<div class="top"><div class="lg"><img src="{origin}/static/assets/doganiero-search-logo.png?v=20261015g" alt=""><b>Doganiero Search</b></div><form data-serpform action="{origin}/api/dbots/serp" method="get"><input name="q" value="{e(q)}" placeholder="Buscar en Doganiero Search…" autocomplete="off"><input type="hidden" name="t" value="{e(tok)}"><button type="submit" class="go" data-serpgo>Buscar</button></form></div>'
               f'<div class="st">Página {page} · {len(res)} resultados de {len({r["domain"] for r in res})} sitios</div>'
               f'<div class="w">{items or "<p>Sin resultados. Prueba con otras palabras.</p>"}</div><div class="pg">{nav}{nxt}</div></body></html>'))


def run_browse(steps: Any, web_search: Callable[[str, int], list[dict[str, str]]]) -> list[dict[str, Any]]:
    """Ejecuta un plan de navegación en el servidor (sin cookies) y devuelve la traza para mostrarla en el mini navegador."""
    trace: list[dict[str, Any]] = []
    cur: dict[str, Any] | None = None
    results: list[dict[str, str]] = []
    for st in (steps if isinstance(steps, list) else [])[:6]:
        if not isinstance(st, dict):
            continue
        op = str(st.get("op") or "")
        if op not in BROWSE_OPS:
            continue
        try:
            if op == "search":
                q = str(st.get("q") or "").strip()[:150]
                if not q:
                    continue
                results = web_search(q, 6) or []
                trace.append({"op": "search", "q": q, "results": [{"title": r.get("title", "")[:150], "url": r.get("url", "")[:400], "snippet": r.get("snippet", "")[:300]} for r in results[:6]]})
                cur = None
            elif op == "open":
                u = str(st.get("url") or "").strip()
                if not u and results:
                    try:
                        u = results[max(0, int(st.get("index") or 1) - 1)]["url"]
                    except (ValueError, IndexError, TypeError):
                        u = results[0]["url"]
                cur = fetch_page(u, max_chars=5000)
                trace.append({"op": "open", "url": cur["url"], "view": cur})
            elif op == "click":
                pool = (cur or {}).get("links") or [{"text": r.get("title", ""), "url": r.get("url", "")} for r in results]
                want = str(st.get("text") or "").strip().lower()
                hit = next((l for l in pool if want and want in l["text"].lower()), None) or (pool[0] if pool and not want else None)
                if not hit:
                    trace.append({"op": "click", "text": want, "error": "No encontré ese enlace"})
                    continue
                cur = fetch_page(hit["url"], max_chars=5000)
                trace.append({"op": "click", "text": hit["text"], "url": cur["url"], "view": cur})
            elif op == "form":
                q = str(st.get("q") or "").strip()[:150]
                fm = ((cur or {}).get("forms") or [None])[0]
                if not fm or not q:
                    trace.append({"op": "form", "q": q, "error": "No hay buscador en esta página"})
                    continue
                from urllib.parse import urlencode
                sep = "&" if "?" in fm["action"] else "?"
                cur = fetch_page(fm["action"] + sep + urlencode({fm["field"]: q}), max_chars=5000)
                trace.append({"op": "form", "q": q, "url": cur["url"], "view": cur})
            else:
                trace.append({"op": op})
        except UrlBlocked as exc:
            trace.append({"op": op, "url": str(st.get("url") or "")[:300], "error": str(exc)})
    return trace


def _trace_context(trace: list[dict[str, Any]]) -> str:
    parts = []
    for t in trace:
        if t.get("error"):
            parts.append(f"[{t['op']}] error: {t['error']}")
        elif t["op"] == "search":
            parts.append(f"[búsqueda «{t['q']}»]\n" + "\n".join(f"- {r['title']}: {r['snippet']} ({r['url']})" for r in t["results"]))
        elif t.get("view"):
            parts.append(_page_context(t["view"]))
    return "\n\n".join(parts)[:14000]


def _page_context(pg: dict[str, Any]) -> str:
    links = "\n".join(f"- {l['text']}: {l['url']}" for l in pg.get("links", [])[:15])
    return (f"[Página abierta: {pg['url']}]\nTítulo: {pg['title']}\nTexto (recortado):\n{pg['text']}\n"
            + (f"Enlaces de la página:\n{links}\n" if links else ""))


def _ensure_files(conn) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS dbots_files (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, bot_id TEXT NOT NULL, "
        "name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL, created_at REAL NOT NULL)"
    )


def _file_meta(uid: int, fid: str) -> dict[str, Any] | None:
    if not _ID_RE.match(fid or ""):
        return None
    with db.get_conn() as conn:
        _ensure_files(conn)
        r = conn.execute("SELECT id,bot_id,name,type,size FROM dbots_files WHERE id=? AND user_id=?", (fid, uid)).fetchone()
    return {"id": r[0], "bot_id": r[1], "name": r[2], "type": r[3], "size": r[4]} if r else None


def _file_path(uid: int, fid: str):
    return _FILES_DIR / str(int(uid)) / fid


def _attachment_context(uid: int, meta: dict[str, Any]) -> str:
    head = f"[Adjunto: {meta['name']} · {meta['type']} · {meta['size'] // 1024} KB]"
    path = _file_path(uid, meta["id"])
    try:
        if meta["type"] in _TEXT_TYPES:
            with open(path, "rb") as fh:
                txt = fh.read(12000).decode("utf-8", errors="replace")
            return head + "\nContenido (puede estar recortado):\n" + txt[:6000]
        if meta["type"] == "application/pdf":
            import subprocess
            out = subprocess.run(["pdftotext", "-l", "5", str(path), "-"], capture_output=True, timeout=15)
            if out.returncode == 0 and out.stdout.strip():
                return head + "\nTexto del PDF (recortado):\n" + out.stdout.decode("utf-8", errors="replace")[:6000]
    except Exception:
        pass
    if meta["type"].startswith("image/"):
        return head + "\n(Es una imagen. No puedes verla: AskBox no tiene visión; usa solo su nombre y tipo.)"
    return head + "\n(No se puede leer el contenido de este tipo de archivo; usa su nombre y tipo.)"


MAX_CHAT_MSGS = 200
MAX_CHAT_PER_MIN = 12
_agent_rate: dict[int, list[float]] = {}
_i18n_rate: dict[int, list[float]] = {}
import threading as _thr_i18n
_i18n_lock = _thr_i18n.Lock()
_chat_rate: dict[int, list[float]] = {}


def _ensure_chat(conn) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS dbots_chat (user_id INTEGER NOT NULL, bot_id TEXT NOT NULL, "
        "data TEXT NOT NULL, updated_at REAL NOT NULL, PRIMARY KEY(user_id, bot_id))"
    )


def _chat_load(uid: int, bot_id: str) -> list[dict[str, Any]]:
    with db.get_conn() as conn:
        _ensure_chat(conn)
        row = conn.execute("SELECT data FROM dbots_chat WHERE user_id=? AND bot_id=?", (uid, bot_id)).fetchone()
    try:
        d = json.loads(row[0]) if row else []
        return d if isinstance(d, list) else []
    except Exception:
        return []


_chat_lock = threading.Lock()


def _chat_append(uid: int, bot_id: str, role: str, text: str, **extra: Any) -> dict[str, Any]:
    msg = {"id": "m" + uuid.uuid4().hex[:10], "role": role, "text": str(text)[:8000], "at": time.time()}
    msg.update(extra)
    with _chat_lock:
        msgs = _chat_load(uid, bot_id)
        msgs.append(msg)
        msgs = msgs[-MAX_CHAT_MSGS:]
        with db.get_conn() as conn:
            _ensure_chat(conn)
            conn.execute(
                "INSERT INTO dbots_chat(user_id,bot_id,data,updated_at) VALUES(?,?,?,?) "
                "ON CONFLICT(user_id,bot_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
                (uid, bot_id, json.dumps(msgs, ensure_ascii=False), time.time()),
            )
            conn.commit()
    return msg


def _parse_json(text: str) -> dict[str, Any] | None:
    t = (text or "").strip()
    m = re.search(r"\{[\s\S]*\}", t)
    if not m:
        return None
    try:
        d = json.loads(m.group(0))
        return d if isinstance(d, dict) else None
    except Exception:
        return None


class TaskBody(BaseModel):
    bot_id: str = Field(..., max_length=40)
    kind: str = "tarea"  # tarea | buscar
    input: str = Field("", max_length=1000)


def own_key(uid: int) -> str:
    """Solo la clave PROPIA de AskBox del perfil (Ajustes → IA). Sin fallback al sistema."""
    try:
        keys = db.get_ai_keys(int(uid))
        if isinstance(keys, dict):
            k = str(keys.get("askbox") or "").strip()
            if k:
                return k
    except Exception:
        pass
    try:
        with db.get_conn() as conn:
            row = conn.execute("SELECT ai_keys FROM users WHERE id = ?", (int(uid),)).fetchone()
        if row and row["ai_keys"]:
            raw = json.loads(row["ai_keys"])
            if isinstance(raw, dict):
                return str(raw.get("askbox") or "").strip()
    except Exception:
        pass
    return ""


def build_router(
    require_user: Callable,
    own_askbox_key: Callable[[int], str],
    web_search: Callable[[str, int], list[dict[str, str]]],
) -> APIRouter:
    r = APIRouter()

    def _run(uid: int, tid: str, bot: dict[str, Any], kind: str, text: str) -> None:
        log: list[str] = []

        def say(line: str) -> None:
            log.append(time.strftime("%H:%M:%S") + " " + line[:400])
            _update_task(tid, log=log[-60:])

        try:
            if tid in _cancel:
                raise RuntimeError("CANCEL")
            _update_task(tid, status="trabajando")
            say("Empiezo: " + text[:120])
            key = own_askbox_key(uid)
            if not key:
                raise RuntimeError("NOKEY")
            role = bot.get("role") or "Asistente general"
            query = text
            if kind == "tarea":
                say("Pienso qué buscar con AskBox…")
                q = askbox_client.ask(
                    f"Función del bot: {role}\nTarea: {text}\n"
                    "Devuelve SOLO una consulta corta de búsqueda web (máx. 10 palabras) para resolver la tarea.",
                    tier="fast", max_output_tokens=60, api_key=key,
                )
                query = (q.get("text") or text).strip().strip('"').splitlines()[0][:150] or text
            if tid in _cancel:
                raise RuntimeError("CANCEL")
            say("Busco en internet: " + query)
            results = web_search(query, 5) or []
            say(f"{len(results)} resultados")
            if tid in _cancel:
                raise RuntimeError("CANCEL")
            ctx = "\n".join(
                f"[{i+1}] {x.get('title','')}: {x.get('snippet','')} ({x.get('url','')})"
                for i, x in enumerate(results[:5])
            ) or "(sin resultados)"
            say("Resumo con AskBox…")
            ans = askbox_client.ask(
                f"Tarea: {text}\n\nResultados de búsqueda:\n{ctx}\n\n"
                "Responde en español, claro y breve, citando las fuentes como [n].",
                system=f"Eres un bot de Doganiero Bots dentro de Snake OS. Tu función: {role}",
                tier=CHAT_TIER, max_output_tokens=900, api_key=key, timeout=CHAT_ASK_TIMEOUT,
            )
            out = (ans.get("text") or "").strip()
            if results:
                out += "\n\nFuentes:\n" + "\n".join(
                    f"[{i+1}] {x.get('url','')}" for i, x in enumerate(results[:5])
                )
            if tid in _cancel:
                raise RuntimeError("CANCEL")
            say("Hecho ✅")
            _update_task(tid, status="hecho", result=out[:8000])
            if bot.get("id"):
                _chat_append(uid, bot["id"], "bot", "✅ Terminé la tarea «" + text[:120] + "»:\n\n" + out[:6000], task=tid)
        except RuntimeError as exc:
            if str(exc) == "NOKEY":
                say("Falta tu clave de AskBox")
                _update_task(tid, status="error", result="No tienes clave de AskBox. Añádela en Ajustes → IA → Key de AskBox.")
                if bot.get("id"):
                    _chat_append(uid, bot["id"], "bot", "❌ No pude hacer «" + text[:120] + "»: falta tu clave de AskBox.", task=tid)
            else:
                say("Cancelada")
                _update_task(tid, status="cancelada")
        except AskboxError as exc:
            say("AskBox: " + exc.message[:200])
            _update_task(tid, status="error", result="AskBox respondió un error: " + exc.message[:300])
            if bot.get("id"):
                _chat_append(uid, bot["id"], "bot", "❌ La tarea «" + text[:120] + "» falló: " + exc.message[:200], task=tid)
        except Exception as exc:  # noqa: BLE001
            say("Error: " + type(exc).__name__)
            _update_task(tid, status="error", result="La tarea falló. Prueba otra vez.")
        finally:
            with _lock:
                _running[uid] = max(0, _running.get(uid, 1) - 1)
            _cancel.discard(tid)
            _kick(uid)

    def _kick(uid: int) -> None:
        """Arranca tareas en cola mientras haya hueco (máx. N en paralelo)."""
        while True:
            with _lock:
                if _running.get(uid, 0) >= MAX_RUNNING_PER_USER:
                    return
                with db.get_conn() as conn:
                    _ensure(conn)
                    row = conn.execute(
                        "SELECT id,bot_id,kind,input FROM dbots_tasks WHERE user_id=? AND status='en cola' "
                        "ORDER BY created_at LIMIT 1", (uid,)
                    ).fetchone()
                    if not row:
                        return
                    conn.execute("UPDATE dbots_tasks SET status='trabajando', updated_at=? WHERE id=?", (time.time(), row[0]))
                    conn.commit()
                _running[uid] = _running.get(uid, 0) + 1
            bot = next((b for b in _load_bots(uid) if b.get("id") == row[1]), {"role": ""})
            _pool.submit(_run, uid, row[0], bot, row[2], row[3])

    # Tareas que quedaron "trabajando" tras un reinicio → error.
    try:
        with db.get_conn() as conn:
            _ensure(conn)
            conn.execute("UPDATE dbots_tasks SET status='error', result='Se interrumpió por un reinicio del servidor.' "
                         "WHERE status IN ('trabajando','en cola')")
            conn.commit()
    except Exception:
        pass

    @r.get("/api/dbots/bots")
    def list_bots(user=Depends(require_user)):
        uid = int(user["id"])
        return {"bots": _load_bots(uid), "themes": list(THEMES), "hasKey": bool(own_askbox_key(uid))}

    @r.post("/api/dbots/bots")
    def create_bot(body: BotsBody, user=Depends(require_user)):
        uid = int(user["id"])
        bots = _load_bots(uid)
        if len(bots) >= MAX_BOTS:
            raise HTTPException(422, f"Máximo {MAX_BOTS} bots por perfil")
        b = _clean_bot(body.model_dump(exclude_none=True))
        b["id"] = "b" + uuid.uuid4().hex[:10]
        b["created_at"] = time.time()
        bots.append(b)
        _save_bots(uid, bots)
        return {"bot": b}

    @r.put("/api/dbots/bots/{bot_id}")
    def edit_bot(bot_id: str, body: BotsBody, user=Depends(require_user)):
        uid = int(user["id"])
        bots = _load_bots(uid)
        for i, b in enumerate(bots):
            if b.get("id") == bot_id:
                bots[i] = _clean_bot(body.model_dump(exclude_none=True), b)
                _save_bots(uid, bots)
                return {"bot": bots[i]}
        raise HTTPException(404, "Bot no encontrado")

    @r.delete("/api/dbots/bots/{bot_id}")
    def delete_bot(bot_id: str, user=Depends(require_user)):
        uid = int(user["id"])
        bots = [b for b in _load_bots(uid) if b.get("id") != bot_id]
        _save_bots(uid, bots)
        with db.get_conn() as conn:
            _ensure(conn)
            ids = [x[0] for x in conn.execute(
                "SELECT id FROM dbots_tasks WHERE user_id=? AND bot_id=? AND status IN ('en cola','trabajando')",
                (uid, bot_id)).fetchall()]
            conn.execute("UPDATE dbots_tasks SET status='cancelada' WHERE user_id=? AND bot_id=? AND status='en cola'", (uid, bot_id))
            conn.commit()
        _cancel.update(ids)
        with _chat_lock, db.get_conn() as conn:
            _ensure_chat(conn)
            conn.execute("DELETE FROM dbots_chat WHERE user_id=? AND bot_id=?", (uid, bot_id))
            conn.commit()
        try:
            _drop_files(uid, bot_id)
        except NameError:
            pass
        return {"ok": True}

    @r.get("/api/dbots/tasks")
    def list_tasks(user=Depends(require_user)):
        uid = int(user["id"])
        with db.get_conn() as conn:
            _ensure(conn)
            rows = conn.execute(
                "SELECT * FROM dbots_tasks WHERE user_id=? ORDER BY created_at DESC LIMIT 120", (uid,)
            ).fetchall()
        return {"tasks": [_task_row(x) for x in rows]}

    def _enqueue(uid: int, bot_id: str, kind: str, text: str) -> str:
        return add_task(TaskBody(bot_id=bot_id, kind=kind, input=text[:1000]), user={"id": uid})["id"]

    def _rl(uid: int) -> None:
        now = time.monotonic()
        calls = [t for t in _fetch_rate.get(uid, []) if t > now - 60]
        if len(calls) >= 30:
            raise HTTPException(429, "Demasiadas páginas seguidas; espera un minuto.")
        calls.append(now)
        _fetch_rate[uid] = calls

    _base_search = web_search

    def web_search(q: str, n: int = 5) -> list[dict[str, str]]:  # noqa: F811 - buscador general con resultados variados
        res = web_index(q, 1, _base_search)
        return res[:max(n, 1)] if res else (_base_search(q, n) or [])

    def _origin(request: Request) -> str:
        proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
        host = request.headers.get("host") or request.url.netloc
        return f"{proto}://{host}"

    @r.post("/api/dbots/proxy-token")
    def proxy_token_ep(user=Depends(require_user)):
        return {"t": proxy_token(int(user["id"])), "ttl": PROXY_TOKEN_TTL}

    def _proxy_rl(uid: int) -> bool:
        now = time.monotonic()
        calls = [x for x in _proxy_rate.get(uid, []) if x > now - 60]
        if len(calls) >= PROXY_PER_MIN:
            return False
        calls.append(now)
        _proxy_rate[uid] = calls
        return True

    def _resp(html_text: str, status: int = 200) -> HTMLResponse:
        return HTMLResponse(html_text, status_code=status, media_type="text/html; charset=utf-8", headers={
            "Content-Security-Policy": PROXY_CSP, "X-Content-Type-Options": "nosniff",
            "Content-Type": "text/html; charset=utf-8",
            "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store",
        })

    @r.get("/api/dbots/proxy")
    def proxy_ep(request: Request, u: str = Query("", max_length=3000), t: str = Query("", max_length=200)):
        origin = _origin(request)
        uid = _proxy_uid(t)
        if uid is None:
            # Navegador de Snake OS: cookie de sesión (mismo patrón que /api/dbots/serp)
            from auth import COOKIE_NAME, user_from_session
            user = user_from_session(request.cookies.get(COOKIE_NAME))
            if not user:
                return _resp(_proxy_error(origin, "Inicia sesión en Snake OS para abrir páginas.", u), 403)
            uid = int(user["id"])
            t = proxy_token(uid)
        if not _proxy_rl(uid):
            return _resp(_proxy_error(origin, "Demasiadas páginas seguidas; espera un minuto.", u), 429)
        try:
            hit = _proxy_cache.get(u)
            if hit and hit[0] > time.time() - 90:
                final, page = hit[1], hit[2]
            else:
                final, ctype, raw = _fetch_raw(u)
                if ctype and "html" not in ctype and "xml" not in ctype:
                    raise UrlBlocked("Este enlace no es una página web (" + ctype.split(";")[0] + ")")
                page = _decode(raw, ctype)
            return _resp(_proxy_doc(origin, t, final, page))
        except UrlBlocked as exc:
            return _resp(_proxy_error(origin, str(exc), u), 200)

    @r.get("/api/dbots/auth-return")
    def auth_return_ep():
        # Página de vuelta tras iniciar sesión desde el Navegador de Snake OS (se cierra sola). Sin datos del usuario.
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "snk-auth-return.html"), encoding="utf-8") as fh:
            return HTMLResponse(fh.read(), headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})

    @r.get("/api/dbots/serp")
    def serp_ep(request: Request, q: str = Query("", max_length=200), p: int = Query(1, ge=1, le=10), t: str = Query("", max_length=200)):
        # Token HMAC (iframe del bot sin cookies) o cookie de sesión (Navegador de Snake OS).
        from auth import COOKIE_NAME, user_from_session
        origin = _origin(request)
        uid = _proxy_uid(t)
        if uid is None:
            user = user_from_session(request.cookies.get(COOKIE_NAME))
            if not user:
                return _resp(_proxy_error(origin, "Inicia sesión en Snake OS para buscar.", ""), 403)
            uid = int(user["id"])
            t = proxy_token(uid)
        if not _proxy_rl(uid):
            return _resp(_proxy_error(origin, "Demasiadas búsquedas seguidas; espera un minuto.", ""), 429)
        q = q.strip()
        if not q:
            return _resp(_serp_html(origin, t, "", 1, []))
        return _resp(_serp_html(origin, t, q, p, web_index(q, p, _base_search)))

    @r.post("/api/dbots/gsearch")
    def gsearch_ep(body: dict, user=Depends(require_user)):
        uid = int(user["id"])
        _rl(uid)
        q = str((body or {}).get("q") or "").strip()[:150]
        if not q:
            raise HTTPException(422, "Escribe qué buscar")
        url = "https://www.google.com/search?" + urlencode({"q": q, "hl": "es", "gl": "es"})
        try:
            final, ctype, raw = _fetch_raw(url)
            page = _decode(raw, ctype)
            if not _google_blocked(final, page):
                _proxy_cache[url] = (time.time(), final, page)
                for k in [k for k, v in _proxy_cache.items() if v[0] < time.time() - 90][:50]:
                    _proxy_cache.pop(k, None)
                return {"ok": True, "url": url, "t": proxy_token(uid)}
        except UrlBlocked:
            pass
        res = web_search(q, 8) or []
        return {"ok": False, "q": q, "results": [{"title": x.get("title", "")[:150], "url": x.get("url", "")[:400], "snippet": x.get("snippet", "")[:300]} for x in res]}

    @r.post("/api/dbots/browse")
    def browse_endpoint(body: dict, user=Depends(require_user)):
        _rl(int(user["id"]))
        url = str((body or {}).get("url") or "").strip()[:2000]
        try:
            return fetch_page(url, max_chars=6000)
        except UrlBlocked as exc:
            raise HTTPException(422, str(exc))

    @r.post("/api/dbots/search")
    def search_endpoint(body: dict, user=Depends(require_user)):
        _rl(int(user["id"]))
        q = str((body or {}).get("q") or "").strip()[:150]
        if not q:
            raise HTTPException(422, "Escribe qué buscar")
        res = web_search(q, 8) or []
        return {"q": q, "results": [{"title": r.get("title", "")[:150], "url": r.get("url", "")[:400], "snippet": r.get("snippet", "")[:300]} for r in res]}

    @r.post("/api/dbots/fetch")
    def fetch_endpoint(body: dict, user=Depends(require_user)):
        uid = int(user["id"])
        now = time.monotonic()
        calls = [t for t in _fetch_rate.get(uid, []) if t > now - 60]
        if len(calls) >= 10:
            raise HTTPException(429, "Demasiadas páginas seguidas; espera un minuto.")
        calls.append(now)
        _fetch_rate[uid] = calls
        url = str((body or {}).get("url") or "").strip()[:2000]
        try:
            pg = fetch_page(url, max_chars=4000)
        except UrlBlocked as exc:
            raise HTTPException(422, str(exc))
        return pg

    @r.post("/api/dbots/upload/{bot_id}")
    def upload(bot_id: str, file: UploadFile = File(...), user=Depends(require_user)):
        uid = int(user["id"])
        if not any(b.get("id") == bot_id for b in _load_bots(uid)):
            raise HTTPException(404, "Bot no encontrado")
        name = re.sub(r"[\\/\x00-\x1f]", "_", (file.filename or "archivo").strip())[:120] or "archivo"
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        ctype = _EXT_TYPES.get(ext) or ""
        if not ctype or ctype not in _SAFE_TYPES:
            raise HTTPException(415, "Tipo de archivo no permitido. Usa imágenes, PDF, texto, Office o ZIP.")
        with db.get_conn() as conn:
            _ensure_files(conn)
            n = conn.execute("SELECT COUNT(*) FROM dbots_files WHERE user_id=?", (uid,)).fetchone()[0]
        if n >= MAX_FILES_PER_USER:
            raise HTTPException(429, "Has llegado al máximo de archivos; borra el chat de algún bot.")
        fid = "f" + uuid.uuid4().hex[:16]
        d = _FILES_DIR / str(uid)
        d.mkdir(parents=True, exist_ok=True)
        path = d / fid
        size = 0
        try:
            with open(path, "wb") as out:
                while True:
                    chunk = file.file.read(1024 * 256)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_FILE_BYTES:
                        raise HTTPException(413, "El archivo pasa de 20 MB")
                    out.write(chunk)
        except HTTPException:
            path.unlink(missing_ok=True)
            raise
        with db.get_conn() as conn:
            _ensure_files(conn)
            conn.execute("INSERT INTO dbots_files(id,user_id,bot_id,name,type,size,created_at) VALUES(?,?,?,?,?,?,?)",
                         (fid, uid, bot_id, name, ctype, size, time.time()))
            conn.commit()
        return {"file": {"id": fid, "bot_id": bot_id, "name": name, "type": ctype, "size": size}}

    @r.get("/api/dbots/file/{fid}")
    def get_file(fid: str, dl: int = 0, user=Depends(require_user)):
        uid = int(user["id"])
        m = _file_meta(uid, fid)
        path = _file_path(uid, fid)
        if not m or not path.exists():
            raise HTTPException(404, "Archivo no encontrado")
        inline = m["type"].startswith("image/") and not dl
        return FileResponse(path, media_type=m["type"], filename=m["name"],
                            content_disposition_type="inline" if inline else "attachment",
                            headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600"})

    def _drop_files(uid: int, bot_id: str) -> None:
        with db.get_conn() as conn:
            _ensure_files(conn)
            ids = [x[0] for x in conn.execute("SELECT id FROM dbots_files WHERE user_id=? AND bot_id=?", (uid, bot_id)).fetchall()]
            conn.execute("DELETE FROM dbots_files WHERE user_id=? AND bot_id=?", (uid, bot_id))
            conn.commit()
        for f in ids:
            try:
                _file_path(uid, f).unlink(missing_ok=True)
            except Exception:
                pass

    @r.get("/api/dbots/chat/{bot_id}")
    def chat_get(bot_id: str, user=Depends(require_user)):
        return {"messages": _chat_load(int(user["id"]), bot_id)}

    @r.delete("/api/dbots/chat/{bot_id}")
    def chat_clear(bot_id: str, user=Depends(require_user)):
        uid = int(user["id"])
        with _chat_lock, db.get_conn() as conn:
            _ensure_chat(conn)
            conn.execute("DELETE FROM dbots_chat WHERE user_id=? AND bot_id=?", (uid, bot_id))
            conn.commit()
        _drop_files(uid, bot_id)
        return {"ok": True}

    @r.post("/api/i18n/en")
    def i18n_en(body: dict, user=Depends(require_user)):
        """Traduce textos de la interfaz ES→EN con caché compartida (AskBox con la clave del usuario)."""
        import json as _j
        uid = int(user["id"])
        strs = [str(x)[:200] for x in ((body or {}).get("strings") or [])[:80] if isinstance(x, str) and x.strip()]
        cache_f = db.DATA_DIR / "i18n_en.json"
        with _i18n_lock:
            try:
                cache = _j.loads(cache_f.read_text("utf-8")) if cache_f.exists() else {}
            except Exception:
                cache = {}
        out = {k: cache[k] for k in strs if k in cache}
        todo = [k for k in strs if k not in cache][:60]
        if todo:
            key = own_askbox_key(uid)
            now = time.monotonic()
            calls = [t for t in _i18n_rate.get(uid, []) if t > now - 60]
            if key and len(calls) < 20:
                calls.append(now); _i18n_rate[uid] = calls
                system = ("Traduces textos de la interfaz de un sistema operativo web (Snake OS) del español al inglés. "
                          "Devuelve SOLO un objeto JSON {texto_original: traducción}. Mantén emojis, números, nombres propios "
                          "(NUNCA traduzcas marcas: Snake OS!, Snake OS, Snake OS Lite, Doganiero, Doganiero Search, Doganiero Bots, Book, Direct™, Snakemoji, Code Lab, AskBox, Dogalandia, nombres de bots) y la puntuación. Si ya está en inglés o no se traduce, devuélvelo igual.")
                try:
                    res = askbox_client.ask(_j.dumps(todo, ensure_ascii=False), system=system, tier="fast", max_output_tokens=2500, api_key=key)
                    d = _parse_json(res.get("text") or "") or {}
                except Exception:
                    d = {}
                new = {k: str(d[k])[:300] for k in todo if isinstance(d.get(k), str) and d[k].strip()}
                _brx = re.compile("Snake OS Lite|Snake OS|Doganiero Search|Doganiero Bots|Doganiero|Direct™|Snakemojis?|Code Lab|AskBox|Dogalandia|Book")
                new = {k: v for k, v in new.items() if all(b in v for b in _brx.findall(k))}
                if new:
                    out.update(new)
                    with _i18n_lock:
                        try:
                            cache = _j.loads(cache_f.read_text("utf-8")) if cache_f.exists() else {}
                        except Exception:
                            cache = {}
                        cache.update(new)
                        if len(cache) > 20000:
                            cache = dict(list(cache.items())[-20000:])
                        cache_f.write_text(_j.dumps(cache, ensure_ascii=False), "utf-8")
        return {"t": out}

    @r.post("/api/dbots/agent/{bot_id}")
    def agent_step(bot_id: str, body: dict, user=Depends(require_user)):
        """Un paso del agente: recibe un resumen compacto de la UI visible y devuelve la siguiente acción."""
        uid = int(user["id"])
        bot = next((b for b in _load_bots(uid) if b.get("id") == bot_id), None)
        if not bot:
            raise HTTPException(404, "Bot no encontrado")
        key = own_askbox_key(uid)
        if not key:
            raise HTTPException(422, "No tienes clave de AskBox. Añádela en Ajustes → IA → Key de AskBox.")
        now = time.monotonic()
        calls = [t for t in _agent_rate.get(uid, []) if t > now - 60]
        if len(calls) >= 40:
            raise HTTPException(429, "Demasiados pasos seguidos; espera un momento.")
        calls.append(now)
        _agent_rate[uid] = calls
        body = body if isinstance(body, dict) else {}
        goal = str(body.get("goal") or "").strip()[:500]
        surface = "user" if body.get("surface") == "user" else "mini"
        lines = []
        for it in (body.get("ui") or [])[:70]:
            if not isinstance(it, dict):
                continue
            def n(k):
                try:
                    return int(it.get(k) or 0)
                except (TypeError, ValueError):
                    return 0
            row = f"{str(it.get('id') or '')[:5]}|{str(it.get('role') or '')[:8]}|{str(it.get('label') or '')[:60]}|{str(it.get('win') or '')[:40]}|{n('x')},{n('y')},{n('w')},{n('h')}"
            if it.get("role") == "campo":
                row += "|valor=" + str(it.get("value") or "")[:60]
            lines.append(row)
        id_label = {}
        for it in (body.get("ui") or [])[:70]:
            if isinstance(it, dict):
                id_label[str(it.get("id") or "")[:5]] = str(it.get("label") or "")[:60]
        plan_in = [str(p)[:80] for p in (body.get("plan") or []) if isinstance(p, (str, int, float))][:8] if isinstance(body.get("plan"), list) else []
        # Memoria: últimos mensajes de la conversación con este bot (para «y ahora bórralo», «el de antes»…)
        mem = []
        try:
            for m in _chat_load(uid, bot_id)[-6:]:
                t = str(m.get("text") or "").strip().replace("\n", " ")
                if t:
                    mem.append(("Usuario: " if m.get("role") == "user" else "Tú: ") + t[:200])
        except Exception:
            mem = []
        hist = []
        for h in (body.get("history") or [])[-12:]:
            if isinstance(h, dict):
                hist.append(f"- {str(h.get('action') or '')[:8]} {str(h.get('id') or '')[:5]} «{str(h.get('label') or '')[:50]}» {str(h.get('text') or '')[:80]} → {str(h.get('result') or '')[:80]}")
        page = body.get("page") if isinstance(body.get("page"), dict) else {}
        page_s = " ".join(f"{k}={str(v)[:150]}" for k, v in page.items() if v) if page else ""
        where = ("tu propio mini OS (Snake OS Lite): barra inferior con 🐍 menú y las apps 🌐 Navegador, 🖥️ Terminal, 💻 Código, 📝 Notas, 📁 Archivos y 📅 Calendario; "
                 "la barra del Navegador acepta una URL o una búsqueda y se envía con la tecla Enter. "
                 "📅 Calendario guarda en el calendario REAL del usuario: escribe Título, Fecha en formato AAAA-MM-DD y Hora HH:MM (opcional) y pulsa «➕ Añadir al calendario» (el usuario confirma). "
                 "Cuando el estado 'calendario' diga ✅ Evento añadido, el objetivo está cumplido: done")
        if surface == "user":
            where = "el escritorio Snake OS del usuario: iconos de apps (doble uso: un clic abre la app), ventanas abiertas y barra de tareas"
        system = (
            f"Eres {bot.get('name') or 'un bot'}, un agente que maneja una interfaz con puntero y teclado. Estás en {where}. "
            f"Hoy es {__import__('datetime').datetime.now(__import__('zoneinfo').ZoneInfo('Europe/Madrid')).strftime('%A %Y-%m-%d %H:%M')} (hora de Madrid); calcula tú las fechas relativas (mañana, el viernes…). "
            "Cada vez ves la lista de elementos visibles (id|tipo|texto|ventana|x,y,ancho,alto|valor). Razona paso a paso y decide SOLO el siguiente paso. "
            "Responde SOLO con JSON: {\"thought\": razonamiento breve, \"say\": frase corta en español para el usuario, "
            "\"action\": \"click\"|\"type\"|\"key\"|\"scroll\"|\"wait\"|\"done\"|\"fail\", \"id\": id del elemento, "
            "\"text\": texto a escribir (si type), \"key\": \"Enter\" (si key)}. "
            "type ya hace clic en el campo y escribe; después usa key Enter sobre ese mismo campo si hay que enviarlo. Para abrir una app, haz clic en su icono o botón. "
            "Céntrate SOLO en el objetivo pedido: no explores, no abras apps ni webs que no hagan falta y no añadas tareas extra. "
            "Mira el historial: no repitas lo que ya funcionó. Antes de actuar comprueba si el objetivo YA está cumplido según lo visible (app abierta, texto escrito, página cargada…): si es así responde done con goal_met true. "
            "Cada paso del historial termina con su VERIFICACIÓN (la pantalla cambió / NO cambió, el campo contiene o NO el texto): úsala para saber si el paso funcionó; si no funcionó, prueba otra forma (otro elemento, doble comprobación, tecla Enter, abrir la app desde el menú 🐍). "
            "Si te dicen que estás atascado, cambia de estrategia; nunca repitas el mismo clic. No te rindas mientras haya otra forma razonable; fail solo si es imposible, explicando por qué. No hay prisa: no menciones el número de pasos. "
            "En el PRIMER paso añade \"plan\": lista corta (2-6) de subpasos concretos para cumplir el objetivo; después sigue ese plan. "
            "Añade siempre \"goal_met\": true|false. "
            "Nunca escribas contraseñas, claves, tokens ni datos privados; nunca inicies ni cierres sesión. Llamar, borrar, enviar, pagar o apagar requieren el permiso del usuario (el sistema lo pedirá)."
        )
        try:
            _step, _max = int(body.get("step") or 1), int(body.get("max") or 25)
        except (TypeError, ValueError):
            _step, _max = 1, 25
        stuck = str(body.get("stuck") or "")[:120]
        prompt = (f"Objetivo (no te desvíes): {goal}\nPaso {_step}.\n"
                  + ("Conversación reciente (contexto):\n" + "\n".join(mem) + "\n" if mem else "")
                  + ("Tu plan: " + " → ".join(plan_in) + "\n" if plan_in else "Primer paso: incluye \"plan\".\n")
                  + (f"⚠️ AVISO: {stuck}. Cambia de estrategia o termina.\n" if stuck else "")
                  + (f"Estado: {page_s}\n" if page_s else "")
                  + ("Pasos ya hechos:\n" + "\n".join(hist) + "\n" if hist else "Aún no has hecho nada.\n")
                  + "Elementos visibles ahora:\n" + ("\n".join(lines) or "(ninguno)") + "\nDevuelve el JSON del siguiente paso.")
        try:
            res = askbox_client.ask(prompt, system=system, tier=AGENT_TIER, max_output_tokens=350, api_key=key, timeout=30)
            d = _parse_json(res.get("text") or "") or {}
        except Exception:
            # Fallo puntual de AskBox: el cliente reintenta (como mucho dos veces) antes de rendirse.
            return {"action": "wait", "retry": True, "say": "AskBox tarda en responder; reintento…"}
        act = str(d.get("action") or "fail").lower()
        if act not in {"click", "type", "key", "scroll", "wait", "done", "fail"}:
            act = "fail"
        aid = str(d.get("id") or "")[:6]
        plan_out = [str(p)[:80] for p in d.get("plan") if isinstance(p, (str, int, float))][:8] if isinstance(d.get("plan"), list) and not plan_in else []
        return {"action": act, "id": aid, "label": id_label.get(aid, ""), "plan": plan_out, "text": str(d.get("text") or "")[:500],
                "key": str(d.get("key") or "Enter")[:12], "say": str(d.get("say") or d.get("thought") or "")[:200],
                "goal_met": bool(d.get("goal_met")) and act in {"done", "wait"}}

    def _chat_core(bot_id: str, body: ChatBody, user: dict, stage: Callable[[str], None] | None = None, cancelled: Callable[[], bool] | None = None):
        """Respuesta del bot en el chat. Se ejecuta en segundo plano (job) para no dejar Snake OS esperando."""
        stage = stage or (lambda _s: None)
        cancelled = cancelled or (lambda: False)

        def _chk() -> None:
            if cancelled():
                raise _ChatCancelled()

        uid = int(user["id"])
        _kp = osx_extras.kids_policy(uid)
        if _kp is not None and _kp.get("bots") == "off":
            osx_extras.log_blocked(uid, "bots", "Doganiero Bots desactivado")
            raise HTTPException(403, "Snake OS Kids: Doganiero Bots está desactivado por un adulto")
        bots = _load_bots(uid)
        bot = next((b for b in bots if b.get("id") == bot_id), None)
        if not bot:
            raise HTTPException(404, "Bot no encontrado")
        key = own_askbox_key(uid)
        if not key:
            raise HTTPException(422, "No tienes clave de AskBox. Añádela en Ajustes → IA → Key de AskBox.")
        now = time.monotonic()
        calls = [t for t in _chat_rate.get(uid, []) if t > now - 60]
        if len(calls) >= MAX_CHAT_PER_MIN:
            raise HTTPException(429, "Vas muy rápido; espera un momento antes de escribir otra vez.")
        calls.append(now)
        _chat_rate[uid] = calls
        text = (body.text or "").strip()
        atts = [m for m in (_file_meta(uid, f) for f in (body.attachments or [])[:6]) if m and m["bot_id"] == bot_id]
        if not text and not atts:
            raise HTTPException(422, "Escribe un mensaje o adjunta un archivo")
        history = _chat_load(uid, bot_id)[-CHAT_HISTORY_MSGS:]
        _chat_append(uid, bot_id, "user", text, **({"attachments": atts} if atts else {}))
        user_desk, text = _split_desk_suffix(text)  # la IA no ve el sufijo «/en mi escritorio»
        if not text and not atts:
            raise HTTPException(422, "Escribe qué quieres que haga antes de /en mi escritorio")
        pages: list[dict[str, Any]] = []
        page_ctx = ""
        stage("Leyendo tu mensaje…")
        for u in list(dict.fromkeys(URL_RE.findall(text)))[:2]:
            _chk()
            if _kp is not None and not osx_extras.host_allowed(_kp, u):
                osx_extras.log_blocked(uid, "web", u[:150])
                page_ctx += f"\n\n[No se pudo abrir {u}: web no permitida en Snake OS Kids]"
                continue
            stage("Abriendo " + u[:60] + "…")
            try:
                pg = fetch_page(u)
                pages.append({"url": pg["url"], "title": pg["title"][:120], "domain": pg["domain"]})
                page_ctx += "\n\n" + _page_context(pg)
            except UrlBlocked as exc:
                page_ctx += f"\n\n[No se pudo abrir {u}: {exc}]"
        if page_ctx:
            text = text + page_ctx + "\n(Contesta sobre esa página y cita su URL.)"
        if atts:
            text = (text or "Mira estos archivos.") + "\n\n" + "\n\n".join(_attachment_context(uid, m) for m in atts)
        convo = "\n".join(("Usuario: " if m.get("role") == "user" else "Bot: ") + str(m.get("text") or "")[:CHAT_HISTORY_CHARS] for m in history)
        mem = "\n".join("- " + x for x in (bot.get("memory") or [])) or "(vacía)"
        _ctx = body.ctx if isinstance(body.ctx, dict) else {}
        ctx_apps = ", ".join(f"{str(a.get('id'))[:30]}={str(a.get('title'))[:30]}" for a in (_ctx.get("apps") or [])[:60] if isinstance(a, dict)) or "(desconocidas)"
        ctx_walls = ", ".join(str(w)[:40] for w in (_ctx.get("wallpapers") or [])[:30]) or "(desconocidos)"
        system = (
            f"Eres «{bot.get('name')}», un bot de Doganiero Bots dentro de Snake OS. Tu función: {bot.get('role') or 'asistente general'}.\n"
            f"Tu memoria (notas que debes recordar):\n{mem}\n"
            f"Fecha de hoy: {time.strftime('%Y-%m-%d')}. Hablas en español, natural y breve.\n"
            "Responde SIEMPRE con un único objeto JSON: {\"reply\": texto para el usuario, "
            "\"action\": \"none\"|\"search\"|\"open\"|\"task\", \"query\": consulta web corta si action=search, \"url\": enlace exacto si action=open, "
            "\"task\": descripción si action=task, \"memory\": nota nueva para recordar o \"\"}. "
            "Usa search si necesitas información actual o de internet para contestar ahora. "
            "Usa open para leer una página concreta (por ejemplo un enlace de la conversación o de resultados anteriores). "
            "Si el mensaje ya incluye [Página abierta: ...], contesta directamente con action none citando la URL. "
            "Usa task para trabajos largos o que el usuario pide hacer en segundo plano (avisarás al terminar). "
            "Usa memory solo si el usuario te pide recordar algo o da un dato importante y duradero.\n"
            "Además puedes usar \"action\": \"browse\" con \"steps\": lista de pasos de navegador (máx. 6) entre "
            "{\"op\":\"search\",\"q\":...}, {\"op\":\"open\",\"url\":... o \"index\": n del resultado}, {\"op\":\"click\",\"text\": texto del enlace}, "
            "{\"op\":\"form\",\"q\": texto para el buscador de la página}, {\"op\":\"scroll\"}, {\"op\":\"read\"}. Úsalo cuando haya que navegar varias páginas.\n"
            "Para crear eventos o recordatorios del calendario usa también action ui con un goal que incluya título, fecha exacta AAAA-MM-DD y hora. "
            "Para CUALQUIER tarea de manejar apps (abrir, hacer clic, escribir, navegar, crear notas o archivos) usa \"action\": \"ui\" con \"goal\": objetivo claro y completo, y \"target\": \"mini\" (por defecto: tu propio mini OS) o \"user\" (solo si el usuario pide hacerlo en SU escritorio). NO escribas listas de pasos: después verás la pantalla y decidirás cada clic y cada tecla tú mismo. "
            "(Obsoleto, evítalo) \"action\": \"desktop\" con \"steps\" para hacer cosas con tu puntero. POR DEFECTO las haces DENTRO DE TU PROPIO mini OS (Snake OS Lite del bot: Navegador, Terminal, Código, Notas y Archivos); añade \"target\": \"user\" SOLO si el usuario pide expresamente hacerlo en SU escritorio (o para llamar por su Teléfono). Operaciones: "
            "open_app{app}, close_app{app}, create_folder{name}, create_note{text}, create_file{name,text}, set_wallpaper{id}, "
            "move_window{app,x,y,w,h}, switch_desktop{n 1-4}, delete_file{name} (pide confirmación), call_contact{name: nombre o número DOG- de un contacto del usuario} (llama por el Teléfono; siempre pide confirmación; tú no hablas en la llamada). "
            "También \"action\": \"code\" con \"lang\": \"js\" o \"python\" y \"code\": el programa completo, cuando el usuario te pida programar algo: lo escribes y ejecutas en tu editor (aislado, sin red; usa console.log/print para mostrar la salida). "
            "Nunca cierres sesión, cambies contraseñas ni inicies sesión en webs. "
            f"Apps disponibles: {ctx_apps}. Fondos disponibles: {ctx_walls}."
        )
        if _kp is not None:
            system += ("\nMODO INFANTIL (Snake OS Kids, tramo de edad " + str(_kp.get("age")) + "): hablas con un niño o niña. "
                       "Usa lenguaje sencillo, amable y apropiado para su edad. No hables de violencia, sexo, drogas, apuestas, terror ni otros temas para adultos; "
                       "si te lo piden, explica con cariño que eso es mejor preguntárselo a un adulto. No pidas ni guardes datos personales (dirección, teléfono, colegio, fotos). "
                       "No uses action desktop con target user ni call_contact.")
        prompt = (f"Conversación previa:\n{convo}\n\n" if convo else "") + f"Usuario: {text}\nResponde con el JSON."
        try:
            _chk()
            stage("Pensando la respuesta…")
            res = askbox_client.ask(prompt, system=system, tier=CHAT_TIER, max_output_tokens=900, api_key=key, timeout=CHAT_ASK_TIMEOUT)
            raw = res.get("text") or ""
            d = _parse_json(raw) or {"reply": raw, "action": "none"}
            reply = str(d.get("reply") or "").strip()
            action = str(d.get("action") or "none")
            extra: dict[str, Any] = {}
            if pages:
                extra["pages"] = pages
            note = str(d.get("memory") or "").strip()[:200]
            if note:
                bot.setdefault("memory", [])
                if note not in bot["memory"]:
                    bot["memory"] = (bot["memory"] + [note])[-30:]
                    _save_bots(uid, [bot if b.get("id") == bot_id else b for b in bots])
                    extra["memory"] = note
            if action == "search" and str(d.get("query") or "").strip():
                q = str(d.get("query")).strip()[:150]
                _chk()
                stage("Buscando en internet: " + q[:60] + "…")
                results = web_search(q, 5) or []
                if _kp is not None:
                    results = [x for x in results if osx_extras.host_allowed(_kp, x.get("url", ""))]
                _chk()
                stage("Leyendo los resultados…")
                ctx = "\n".join(f"[{i+1}] {x.get('title','')}: {x.get('snippet','')} ({x.get('url','')})" for i, x in enumerate(results[:5])) or "(sin resultados)"
                res2 = askbox_client.ask(
                    (f"Conversación previa:\n{convo}\n\n" if convo else "") + f"Usuario: {text}\n\nResultados de búsqueda para «{q}»:\n{ctx}\n\n"
                    "Contesta al usuario en español, natural y breve, citando fuentes como [n]. Solo texto, sin JSON.",
                    system=f"Eres «{bot.get('name')}», bot de Doganiero Bots. Tu función: {bot.get('role') or 'asistente general'}. Memoria:\n{mem}",
                    tier=CHAT_TIER, max_output_tokens=900, api_key=key, timeout=CHAT_ASK_TIMEOUT,
                )
                reply = (res2.get("text") or reply).strip()
                extra["search"] = q
                extra["sources"] = [x.get("url", "")[:300] for x in results[:5] if x.get("url")]
            elif action == "browse" and isinstance(d.get("steps"), list) and _kp is not None:
                reply = (reply + "\n\n" if reply else "") + "🧸 En Snake OS Kids no navego por webs; pregúntame y te lo explico."
            elif action == "browse" and isinstance(d.get("steps"), list):
                _chk()
                stage("Navegando por la web…")
                trace = run_browse(d.get("steps"), web_search)
                _chk()
                stage("Escribiendo la respuesta…")
                extra["browse"] = trace
                if trace:
                    res2 = askbox_client.ask(
                        (f"Conversación previa:\n{convo}\n\n" if convo else "") + f"Usuario: {text}\n\nLo que has visto navegando:\n{_trace_context(trace)}\n\n"
                        "Contesta al usuario en español, natural y breve, citando las URL que usaste. Solo texto, sin JSON.",
                        system=f"Eres «{bot.get('name')}», bot de Doganiero Bots. Tu función: {bot.get('role') or 'asistente general'}. Memoria:\n{mem}",
                        tier=CHAT_TIER, max_output_tokens=900, api_key=key, timeout=CHAT_ASK_TIMEOUT,
                    )
                    reply = (res2.get("text") or reply).strip()
                    pg = [{"url": t["view"]["url"], "title": t["view"]["title"][:120], "domain": t["view"]["domain"]} for t in trace if t.get("view")]
                    if pg:
                        extra["pages"] = (extra.get("pages") or []) + pg[-3:]
            elif action == "ui":
                goal = str(d.get("goal") or text or "").strip()[:500]
                if goal:
                    extra["ui"] = {"goal": goal, "target": "user" if (user_desk and _kp is None) else "mini"}
            elif action == "desktop":
                steps = _clean_desktop(d.get("steps"))
                if steps:
                    extra["desktop"] = steps
                    extra["target"] = "user" if (user_desk or any(st.get("op") == "call_contact" for st in steps)) else "mini"
                    if _kp is not None:
                        steps = [st for st in steps if st.get("op") not in ("call_contact", "delete_file")]
                        extra["desktop"] = steps
                        extra["target"] = "mini"
                    if any(st.get("confirm") for st in steps):
                        reply = (reply or "Voy a hacerlo en tu escritorio.") + "\n\n⚠️ Hay acciones que necesitan tu permiso (borrar o llamar): confírmalo abajo antes de que las haga."
                else:
                    reply = (reply or "") + "\n\n(No puedo hacer esa acción en el escritorio por seguridad.)"
            elif action == "code" and str(d.get("code") or "").strip():
                lang = "py" if str(d.get("lang") or "").lower().startswith("py") else "js"
                extra["code"] = {"lang": lang, "code": str(d.get("code"))[:20000]}
                reply = reply or "Te lo programo en mi editor y lo ejecuto."
            elif action == "open" and URL_RE.match(str(d.get("url") or "").strip()) and _kp is not None and not osx_extras.host_allowed(_kp, str(d.get("url"))):
                osx_extras.log_blocked(uid, "web", str(d.get("url"))[:150])
                reply = (reply + "\n\n" if reply else "") + "🧸 Esa web no está en la lista de webs permitidas."
            elif action == "open" and URL_RE.match(str(d.get("url") or "").strip()):
                _chk()
                stage("Abriendo la página…")
                try:
                    pg = fetch_page(str(d.get("url")).strip())
                    res2 = askbox_client.ask(
                        (f"Conversación previa:\n{convo}\n\n" if convo else "") + f"Usuario: {text}\n\n" + _page_context(pg) +
                        "\nContesta al usuario en español, natural y breve, sobre esa página y cita su URL. Solo texto, sin JSON.",
                        system=f"Eres «{bot.get('name')}», bot de Doganiero Bots. Tu función: {bot.get('role') or 'asistente general'}. Memoria:\n{mem}",
                        tier=CHAT_TIER, max_output_tokens=900, api_key=key, timeout=CHAT_ASK_TIMEOUT,
                    )
                    reply = (res2.get("text") or reply).strip()
                    extra["pages"] = (extra.get("pages") or []) + [{"url": pg["url"], "title": pg["title"][:120], "domain": pg["domain"]}]
                except UrlBlocked as exc:
                    reply = (reply + "\n\n" if reply else "") + "⚠️ No pude abrir esa página: " + str(exc)
            elif action == "task" and str(d.get("task") or "").strip():
                try:
                    tid = _enqueue(uid, bot_id, "tarea", str(d.get("task")).strip())
                    extra["task"] = tid
                    reply = (reply or "Vale, me pongo con ello.") + "\n\n⏳ Tarea en cola; te aviso aquí cuando termine."
                except HTTPException as exc:
                    reply = (reply + "\n\n" if reply else "") + "⚠️ No pude crear la tarea: " + str(exc.detail)
            if not reply:
                reply = "🤔 No sé qué decir. ¿Me lo explicas de otra forma?"
        except AskboxError as exc:
            if cancelled():
                raise _ChatCancelled() from exc
            msg = _chat_append(uid, bot_id, "bot", "❌ AskBox respondió un error: " + exc.message[:200], error=True)
            return {"message": msg}
        _chk()
        msg = _chat_append(uid, bot_id, "bot", reply, **extra)
        return {"message": msg}

    @r.post("/api/dbots/chat/{bot_id}")
    def chat_send(bot_id: str, body: ChatBody, user=Depends(require_user)):
        """Versión síncrona (compatibilidad). El escritorio usa /start + sondeo."""
        try:
            return _chat_core(bot_id, body, user)
        except _ChatCancelled:
            return {"message": None, "cancelled": True}

    def _jobs_gc() -> None:
        now = time.time()
        for jid, j in list(_chat_jobs.items()):
            if now - j["started"] > 900:
                _chat_jobs.pop(jid, None)

    def _job_run(jid: str, bot_id: str, body: ChatBody, user: dict) -> None:
        j = _chat_jobs.get(jid)
        if not j:
            return
        uid = int(user["id"])

        _t0 = [time.time(), ""]
        j["timings"] = []

        def stage(t: str) -> None:
            now = time.time()
            if _t0[1]:
                j["timings"].append([_t0[1][:40], int((now - _t0[0]) * 1000)])
            _t0[0], _t0[1] = now, t
            j["stage"] = t[:120]

        def cancelled() -> bool:
            if j["cancel"]:
                return True
            if time.time() - j["started"] > CHAT_DEADLINE:
                j["timeout"] = True
                return True
            return False

        try:
            out = _chat_core(bot_id, body, user, stage, cancelled)
            j["message"] = out.get("message")
            j["status"] = "done"
        except _ChatCancelled:
            if j.get("timeout"):
                j["status"] = "error"
                j["error"] = "La petición tardó demasiado y la he parado. Prueba a pedirlo por partes o como tarea en segundo plano."
                try:
                    j["message"] = _chat_append(uid, bot_id, "bot", "⌛ " + j["error"], error=True)
                except Exception:
                    pass
            else:
                j["status"] = "cancelled"
                try:
                    j["message"] = _chat_append(uid, bot_id, "bot", "⏹ Petición cancelada.")
                except Exception:
                    pass
        except HTTPException as exc:
            j["status"] = "error"
            j["error"] = str(exc.detail)
        except Exception as exc:  # noqa: BLE001
            j["status"] = "error"
            j["error"] = "Algo falló al responder (" + type(exc).__name__ + "). Prueba otra vez."
        j["stage"] = ""
        j["ended"] = time.time()
        try:
            if _t0[1]:
                j["timings"].append([_t0[1][:40], int((j["ended"] - _t0[0]) * 1000)])
            print("[dbots] chat job", jid, j["status"], int((j["ended"] - j["started"]) * 1000), "ms", j["timings"], flush=True)
        except Exception:
            pass

    @r.post("/api/dbots/chat/{bot_id}/start")
    def chat_start(bot_id: str, body: ChatBody, user=Depends(require_user)):
        """Arranca la respuesta en segundo plano y devuelve enseguida un id para sondear el progreso."""
        uid = int(user["id"])
        if not any(b.get("id") == bot_id for b in _load_bots(uid)):
            raise HTTPException(404, "Bot no encontrado")
        if not own_askbox_key(uid):
            raise HTTPException(422, "No tienes clave de AskBox. Añádela en Ajustes → IA → Key de AskBox.")
        _jobs_gc()
        if sum(1 for j in _chat_jobs.values() if j["uid"] == uid and j["status"] == "running") >= 3:
            raise HTTPException(429, "Ya tienes 3 respuestas en marcha; espera o cancela alguna.")
        jid = uuid.uuid4().hex[:16]
        _chat_jobs[jid] = {"uid": uid, "bot_id": bot_id, "status": "running", "stage": "En cola…", "started": time.time(),
                           "cancel": False, "message": None, "error": ""}
        _chat_pool.submit(_job_run, jid, bot_id, body, dict(user))
        return {"job": jid}

    @r.get("/api/dbots/chat-jobs/{jid}")
    def chat_job(jid: str, user=Depends(require_user)):
        j = _chat_jobs.get(jid)
        if not j or j["uid"] != int(user["id"]):
            raise HTTPException(404, "Petición no encontrada")
        return {"status": j["status"], "stage": j["stage"], "elapsed": round(time.time() - j["started"], 1),
                "message": j["message"], "error": j["error"]}

    @r.post("/api/dbots/chat-jobs/{jid}/cancel")
    def chat_job_cancel(jid: str, user=Depends(require_user)):
        j = _chat_jobs.get(jid)
        if not j or j["uid"] != int(user["id"]):
            raise HTTPException(404, "Petición no encontrada")
        j["cancel"] = True
        return {"ok": True}

    @r.post("/api/dbots/tasks")
    def add_task(body: TaskBody, user=Depends(require_user)):
        uid = int(user["id"])
        text = (body.input or "").strip()
        if not text:
            raise HTTPException(422, "Escribe qué tiene que hacer el bot")
        if not any(b.get("id") == body.bot_id for b in _load_bots(uid)):
            raise HTTPException(404, "Bot no encontrado")
        if not own_askbox_key(uid):
            raise HTTPException(422, "No tienes clave de AskBox. Añádela en Ajustes → IA → Key de AskBox.")
        with db.get_conn() as conn:
            _ensure(conn)
            active = conn.execute(
                "SELECT COUNT(*) FROM dbots_tasks WHERE user_id=? AND status IN ('en cola','trabajando')", (uid,)
            ).fetchone()[0]
        if active >= MAX_QUEUED_PER_USER:
            raise HTTPException(429, f"Ya tienes {MAX_QUEUED_PER_USER} tareas pendientes; espera a que acaben.")
        _rate_check(uid)
        tid = "t" + uuid.uuid4().hex[:12]
        now = time.time()
        kind = body.kind if body.kind in ("tarea", "buscar") else "tarea"
        with db.get_conn() as conn:
            _ensure(conn)
            conn.execute(
                "INSERT INTO dbots_tasks(id,user_id,bot_id,kind,input,status,result,log,created_at,updated_at) "
                "VALUES(?,?,?,?,?,'en cola','','[]',?,?)", (tid, uid, body.bot_id, kind, text[:1000], now, now))
            # Historial acotado
            conn.execute(
                "DELETE FROM dbots_tasks WHERE user_id=? AND id NOT IN (SELECT id FROM dbots_tasks WHERE user_id=? "
                "ORDER BY created_at DESC LIMIT ?)", (uid, uid, HISTORY_PER_USER))
            conn.commit()
        _kick(uid)
        return {"id": tid}

    @r.post("/api/dbots/tasks/{tid}/cancel")
    def cancel_task(tid: str, user=Depends(require_user)):
        uid = int(user["id"])
        with db.get_conn() as conn:
            _ensure(conn)
            row = conn.execute("SELECT status FROM dbots_tasks WHERE id=? AND user_id=?", (tid, uid)).fetchone()
            if not row:
                raise HTTPException(404, "Tarea no encontrada")
            if row[0] == "en cola":
                conn.execute("UPDATE dbots_tasks SET status='cancelada', updated_at=? WHERE id=?", (time.time(), tid))
                conn.commit()
        if row[0] == "trabajando":
            _cancel.add(tid)
        return {"ok": True}

    @r.delete("/api/dbots/tasks")
    def clear_history(bot_id: str = "", user=Depends(require_user)):
        uid = int(user["id"])
        with db.get_conn() as conn:
            _ensure(conn)
            if bot_id:
                conn.execute("DELETE FROM dbots_tasks WHERE user_id=? AND bot_id=? AND status NOT IN ('en cola','trabajando')", (uid, bot_id))
            else:
                conn.execute("DELETE FROM dbots_tasks WHERE user_id=? AND status NOT IN ('en cola','trabajando')", (uid,))
            conn.commit()
        return {"ok": True}

    return r
