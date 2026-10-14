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

from fastapi import APIRouter, Depends, HTTPException
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


class ChatBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


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
        text = body.text.strip()
        history = _chat_load(uid, bot_id)[-16:]
        _chat_append(uid, bot_id, "user", text)
        convo = "\n".join(("Usuario: " if m.get("role") == "user" else "Bot: ") + str(m.get("text") or "")[:1500] for m in history)
        mem = "\n".join("- " + x for x in (bot.get("memory") or [])) or "(vacía)"
        system = (
            f"Eres «{bot.get('name')}», un bot de Doganiero Bots dentro de Snake OS. Tu función: {bot.get('role') or 'asistente general'}.\n"
            f"Tu memoria (notas que debes recordar):\n{mem}\n"
            f"Fecha de hoy: {time.strftime('%Y-%m-%d')}. Hablas en español, natural y breve.\n"
            "Responde SIEMPRE con un único objeto JSON: {\"reply\": texto para el usuario, "
            "\"action\": \"none\"|\"search\"|\"task\", \"query\": consulta web corta si action=search, "
            "\"task\": descripción si action=task, \"memory\": nota nueva para recordar o \"\"}. "
            "Usa search si necesitas información actual o de internet para contestar ahora. "
            "Usa task para trabajos largos o que el usuario pide hacer en segundo plano (avisarás al terminar). "
            "Usa memory solo si el usuario te pide recordar algo o da un dato importante y duradero."
        )
        prompt = (f"Conversación previa:\n{convo}\n\n" if convo else "") + f"Usuario: {text}\nResponde con el JSON."
        try:
            res = askbox_client.ask(prompt, system=system, tier="balanced", max_output_tokens=900, api_key=key)
            raw = res.get("text") or ""
            d = _parse_json(raw) or {"reply": raw, "action": "none"}
            reply = str(d.get("reply") or "").strip()
            action = str(d.get("action") or "none")
            extra: dict[str, Any] = {}
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
