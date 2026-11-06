#!/usr/bin/env python3
"""Weekly Doganiero news blast into internal Dogaemail (doga_mail).

Uses the existing Snake OS VP SQLite mailbox — no external SMTP.
Default mode is dry-run. Cron should call with --send.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path

DB_PATH = Path("/home/david/juegos-david/usuarios_snake/snake-os-vp_snakeos-vp-data/snakeos.db")
TEMPLATE = Path(__file__).resolve().parent / "dogaemail_promo_template.txt"
SENDER_EMAIL = "novedades@dogaemail.com"
SENDER_NAME = "Doganiero"
SENDER_AVATAR = "🐶"
# Unusable marker — this account is only for system mail, not interactive login.
SENDER_HASH = "!promo-system-no-login!"


def load_template() -> tuple[str, str]:
    raw = TEMPLATE.read_text(encoding="utf-8")
    lines = raw.splitlines()
    subject = ""
    body_lines: list[str] = []
    started = False
    for line in lines:
        if not started and line.lower().startswith("asunto:"):
            subject = line.split(":", 1)[1].strip()
            started = True
            continue
        if started:
            body_lines.append(line)
    body = "\n".join(body_lines).strip() + "\n"
    if not subject or not body.strip():
        raise SystemExit(f"Plantilla inválida: {TEMPLATE}")
    return subject, body


def connect() -> sqlite3.Connection:
    if not DB_PATH.is_file():
        raise SystemExit(f"No existe la DB: {DB_PATH}")
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_sender(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT id FROM users WHERE lower(email)=lower(?) LIMIT 1",
        (SENDER_EMAIL,),
    ).fetchone()
    if row:
        return int(row["id"])
    cur = conn.execute(
        "INSERT INTO users (email, name, password_hash, avatar) VALUES (?,?,?,?)",
        (SENDER_EMAIL, SENDER_NAME, SENDER_HASH, SENDER_AVATAR),
    )
    conn.commit()
    return int(cur.lastrowid)


def recipients(conn: sqlite3.Connection, sender_id: int, only_email: str | None = None) -> list[sqlite3.Row]:
    if only_email:
        rows = conn.execute(
            "SELECT id, email, name FROM users WHERE lower(email)=lower(?) AND id<>?",
            (only_email, sender_id),
        ).fetchall()
        return list(rows)
    rows = conn.execute(
        """
        SELECT id, email, name FROM users
        WHERE lower(email) LIKE '%@dogaemail.com'
          AND email NOT LIKE '*%'
          AND id <> ?
          AND COALESCE(account_locked, 0) = 0
        ORDER BY id
        """,
        (sender_id,),
    ).fetchall()
    return list(rows)


def prefs_want_mail(conn: sqlite3.Connection, uid: int) -> bool:
    row = conn.execute("SELECT data FROM doga_prefs WHERE user_id=?", (uid,)).fetchone()
    if not row:
        return True
    try:
        data = json.loads(row["data"] or "{}")
    except Exception:
        return True
    return bool(data.get("notif_mail", True))


def notify(conn: sqlite3.Connection, user_id: int, subject: str, mail_id: int, now: float) -> None:
    # notifications table used by Snake OS / Dogaemail
    try:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(notifications)").fetchall()}
    except Exception:
        return
    if not cols:
        return
    title = "📧 Novedades Doganiero"
    body = subject
    data = json.dumps({"mail_id": mail_id})
    # Best-effort insert matching existing schema
    if {"user_id", "kind", "title", "body", "data", "created_at"} <= cols:
        conn.execute(
            "INSERT INTO notifications (user_id, kind, title, body, data, created_at) VALUES (?,?,?,?,?,?)",
            (user_id, "dogaemail", title, body, data, now),
        )
    elif {"user_id", "kind", "title", "body", "created_at"} <= cols:
        conn.execute(
            "INSERT INTO notifications (user_id, kind, title, body, created_at) VALUES (?,?,?,?,?)",
            (user_id, "dogaemail", title, body, now),
        )


def already_sent_today(conn: sqlite3.Connection, sender_id: int, to_id: int, subject: str, now: float) -> bool:
    day_ago = now - 20 * 3600  # avoid double-send same Monday window
    row = conn.execute(
        """
        SELECT id FROM doga_mail
        WHERE from_id=? AND to_id=? AND subject=? AND created_at>=?
        LIMIT 1
        """,
        (sender_id, to_id, subject, day_ago),
    ).fetchone()
    return row is not None


def deliver(conn: sqlite3.Connection, sender_id: int, to_id: int, subject: str, body: str, now: float) -> int:
    cur = conn.execute(
        "INSERT INTO doga_mail (from_id, to_id, subject, body, created_at) VALUES (?,?,?,?,?)",
        (sender_id, to_id, subject, body, now),
    )
    mid = int(cur.lastrowid)
    if prefs_want_mail(conn, to_id):
        try:
            notify(conn, to_id, subject, mid, now)
        except Exception as exc:
            print(f"aviso notificación uid={to_id}: {exc}", file=sys.stderr)
    return mid


def main() -> int:
    ap = argparse.ArgumentParser(description="Blast semanal Dogaemail (interno)")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Solo lista destinatarios (por defecto)")
    mode.add_argument("--test", action="store_true", help="Envía solo a david@dogaemail.com")
    mode.add_argument("--send", action="store_true", help="Envía a todas las cuentas @dogaemail.com")
    args = ap.parse_args()
    if not (args.test or args.send):
        args.dry_run = True

    subject, body = load_template()
    conn = connect()
    try:
        sender_id = ensure_sender(conn)
        only = "david@dogaemail.com" if args.test else None
        rcpts = recipients(conn, sender_id, only_email=only)
        print(f"from={SENDER_EMAIL} id={sender_id}")
        print(f"subject={subject!r}")
        print(f"recipients={len(rcpts)} mode={'test' if args.test else 'send' if args.send else 'dry-run'}")
        for r in rcpts:
            print(f"  - {r['id']}\t{r['email']}\t{r['name']}")

        if args.dry_run:
            print("dry-run: no se insertó ningún correo")
            return 0

        now = time.time()
        sent = 0
        skipped = 0
        for r in rcpts:
            uid = int(r["id"])
            if already_sent_today(conn, sender_id, uid, subject, now):
                print(f"skip (ya enviado hoy): {r['email']}")
                skipped += 1
                continue
            mid = deliver(conn, sender_id, uid, subject, body, now)
            print(f"sent mail_id={mid} -> {r['email']}")
            sent += 1
        conn.commit()
        print(f"done sent={sent} skipped={skipped}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
