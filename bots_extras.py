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


# ---- Acciones del bot en el escritorio de Snake OS (lista blanca; las ejecuta el navegador del usuario) ----
DESKTOP_OPS = {
    "open_app": ("app",), "close_app": ("app",), "create_folder": ("name",), "create_note": ("text",),
    "create_file": ("name", "text"), "set_wallpaper": ("id",), "move_window": ("app", "x", "y", "w", "h"),
    "switch_desktop": ("n",), "delete_file": ("name",), "call_contact": ("name",),
}
DESTRUCTIVE_OPS = {"delete_file", "call_contact"}
BROWSE_OPS = {"search", "open", "click", "scroll", "read", "form"}


def _clean_desktop(steps: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for st in (steps if isinstance(steps, list) else [])[:10]:
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


def _decode(raw: bytes, ctype: str) -> str:
    m = re.search(r"charset=([\w-]+)", ctype) or re.search(rb"<meta[^>]+charset=[\"']?([\w-]+)", raw[:3000], re.I)
    cs = m.group(1) if m else "utf-8"
    if isinstance(cs, bytes):
        cs = cs.decode("ascii", "ignore")
    try:
        return raw.decode(cs, errors="replace")
    except LookupError:
        return raw.decode("utf-8", errors="replace")


def _proxy_doc(origin: str, tok: str, final: str, page: str) -> str:
    page = re.sub(r"<meta[^>]+http-equiv=[\"']?(content-security-policy|x-frame-options|refresh|set-cookie)[^>]*>", "", page, flags=re.I)
    page = re.sub(r"<base\b[^>]*>", "", page, flags=re.I)
    cfg = json.dumps({"p": origin + "/api/dbots/proxy", "t": tok, "u": final, "o": origin})
    inject = (f'<base href="{_html.escape(final, quote=True)}">'
              f'<script>window.__DBP={cfg};</script>'
              f'<script src="{origin}/static/dbots-proxy-helper.js?v=20261015"></script>')
    m = re.search(r"<head\b[^>]*>", page, re.I)
    if m:
        return page[:m.end()] + inject + page[m.end():]
    return "<!doctype html><html><head>" + inject + "</head><body>" + page + "</body></html>"


def _proxy_error(origin: str, msg: str, url: str) -> str:
    cfg = json.dumps({"p": origin + "/api/dbots/proxy", "t": "", "u": url, "o": origin, "error": msg})
    return ("<!doctype html><html><head><meta charset=utf-8><script>window.__DBP=" + cfg + ";</script>"
            f'<script src="{origin}/static/dbots-proxy-helper.js?v=20261015"></script></head>'
            "<body style=\"font-family:system-ui;padding:24px;color:#333;text-align:center\"><p style=\"font-size:40px\">🚧</p>"
            f"<p>No se pudo mostrar la página.</p><p style=\"color:#b3261e\">{_html.escape(msg)}</p></body></html>")


def _google_blocked(final: str, page: str) -> bool:
    low = page[:200000].lower()
    return ("consent.google" in final or "/sorry/" in final or "unusual traffic" in low or "tráfico inusual" in low
            or "recaptcha" in low or "<h3" not in low)


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
                tier="balanced", max_output_tokens=900, api_key=key,
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
        return HTMLResponse(html_text, status_code=status, headers={
            "Content-Security-Policy": PROXY_CSP, "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store",
        })

    @r.get("/api/dbots/proxy")
    def proxy_ep(request: Request, u: str = Query("", max_length=3000), t: str = Query("", max_length=200)):
        origin = _origin(request)
        uid = _proxy_uid(t)
        if uid is None:
            return _resp(_proxy_error(origin, "Enlace caducado; vuelve a abrir la página desde el bot.", u), 403)
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

    @r.post("/api/dbots/chat/{bot_id}")
    def chat_send(bot_id: str, body: ChatBody, user=Depends(require_user)):
        uid = int(user["id"])
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
        history = _chat_load(uid, bot_id)[-16:]
        _chat_append(uid, bot_id, "user", text, **({"attachments": atts} if atts else {}))
        pages: list[dict[str, Any]] = []
        page_ctx = ""
        for u in list(dict.fromkeys(URL_RE.findall(text)))[:2]:
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
        convo = "\n".join(("Usuario: " if m.get("role") == "user" else "Bot: ") + str(m.get("text") or "")[:1500] for m in history)
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
            "Y \"action\": \"desktop\" con \"steps\" para hacer cosas en el escritorio Snake OS del usuario, solo con estas operaciones: "
            "open_app{app}, close_app{app}, create_folder{name}, create_note{text}, create_file{name,text}, set_wallpaper{id}, "
            "move_window{app,x,y,w,h}, switch_desktop{n 1-4}, delete_file{name} (pide confirmación), call_contact{name: nombre o número DOG- de un contacto del usuario} (llama por el Teléfono; siempre pide confirmación; tú no hablas en la llamada). "
            "También \"action\": \"code\" con \"lang\": \"js\" o \"python\" y \"code\": el programa completo, cuando el usuario te pida programar algo: lo escribes y ejecutas en tu editor (aislado, sin red; usa console.log/print para mostrar la salida). "
            "Nunca cierres sesión, cambies contraseñas ni inicies sesión en webs. "
            f"Apps disponibles: {ctx_apps}. Fondos disponibles: {ctx_walls}."
        )
        prompt = (f"Conversación previa:\n{convo}\n\n" if convo else "") + f"Usuario: {text}\nResponde con el JSON."
        try:
            res = askbox_client.ask(prompt, system=system, tier="balanced", max_output_tokens=900, api_key=key)
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
                results = web_search(q, 5) or []
                ctx = "\n".join(f"[{i+1}] {x.get('title','')}: {x.get('snippet','')} ({x.get('url','')})" for i, x in enumerate(results[:5])) or "(sin resultados)"
                res2 = askbox_client.ask(
                    (f"Conversación previa:\n{convo}\n\n" if convo else "") + f"Usuario: {text}\n\nResultados de búsqueda para «{q}»:\n{ctx}\n\n"
                    "Contesta al usuario en español, natural y breve, citando fuentes como [n]. Solo texto, sin JSON.",
                    system=f"Eres «{bot.get('name')}», bot de Doganiero Bots. Tu función: {bot.get('role') or 'asistente general'}. Memoria:\n{mem}",
                    tier="balanced", max_output_tokens=900, api_key=key,
                )
                reply = (res2.get("text") or reply).strip()
                extra["search"] = q
                extra["sources"] = [x.get("url", "")[:300] for x in results[:5] if x.get("url")]
            elif action == "browse" and isinstance(d.get("steps"), list):
                trace = run_browse(d.get("steps"), web_search)
                extra["browse"] = trace
                if trace:
                    res2 = askbox_client.ask(
                        (f"Conversación previa:\n{convo}\n\n" if convo else "") + f"Usuario: {text}\n\nLo que has visto navegando:\n{_trace_context(trace)}\n\n"
                        "Contesta al usuario en español, natural y breve, citando las URL que usaste. Solo texto, sin JSON.",
                        system=f"Eres «{bot.get('name')}», bot de Doganiero Bots. Tu función: {bot.get('role') or 'asistente general'}. Memoria:\n{mem}",
                        tier="balanced", max_output_tokens=900, api_key=key,
                    )
                    reply = (res2.get("text") or reply).strip()
                    pg = [{"url": t["view"]["url"], "title": t["view"]["title"][:120], "domain": t["view"]["domain"]} for t in trace if t.get("view")]
                    if pg:
                        extra["pages"] = (extra.get("pages") or []) + pg[-3:]
            elif action == "desktop":
                steps = _clean_desktop(d.get("steps"))
                if steps:
                    extra["desktop"] = steps
                    if any(st.get("confirm") for st in steps):
                        reply = (reply or "Voy a hacerlo en tu escritorio.") + "\n\n⚠️ Hay acciones que necesitan tu permiso (borrar o llamar): confírmalo abajo antes de que las haga."
                else:
                    reply = (reply or "") + "\n\n(No puedo hacer esa acción en el escritorio por seguridad.)"
            elif action == "code" and str(d.get("code") or "").strip():
                lang = "py" if str(d.get("lang") or "").lower().startswith("py") else "js"
                extra["code"] = {"lang": lang, "code": str(d.get("code"))[:20000]}
                reply = reply or "Te lo programo en mi editor y lo ejecuto."
            elif action == "open" and URL_RE.match(str(d.get("url") or "").strip()):
                try:
                    pg = fetch_page(str(d.get("url")).strip())
                    res2 = askbox_client.ask(
                        (f"Conversación previa:\n{convo}\n\n" if convo else "") + f"Usuario: {text}\n\n" + _page_context(pg) +
                        "\nContesta al usuario en español, natural y breve, sobre esa página y cita su URL. Solo texto, sin JSON.",
                        system=f"Eres «{bot.get('name')}», bot de Doganiero Bots. Tu función: {bot.get('role') or 'asistente general'}. Memoria:\n{mem}",
                        tier="balanced", max_output_tokens=900, api_key=key,
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
            msg = _chat_append(uid, bot_id, "bot", "❌ AskBox respondió un error: " + exc.message[:200], error=True)
            return {"message": msg}
        msg = _chat_append(uid, bot_id, "bot", reply, **extra)
        return {"message": msg}

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
