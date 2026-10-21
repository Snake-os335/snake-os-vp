# Cuentas anadidas solo despues de que la otra persona acepte.
from __future__ import annotations

import time
from typing import Any

import db
import dog_phone


def _ensure(conn) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS added_accounts ("
        "owner_id INTEGER NOT NULL, "
        "contact_id INTEGER NOT NULL, "
        "created_at REAL NOT NULL, "
        "PRIMARY KEY (owner_id, contact_id))"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS account_requests ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "from_id INTEGER NOT NULL, "
        "to_id INTEGER NOT NULL, "
        "status TEXT NOT NULL, "
        "created_at REAL NOT NULL, "
        "updated_at REAL NOT NULL, "
        "UNIQUE (from_id, to_id))"
    )


def _profile(row, number: str) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "email": str(row["email"] or ""),
        "name": str(row["name"] or "Usuario"),
        "avatar": str(row["avatar"] or "🐶"),
        "number": str(number or ""),
        "pro": db.pro_flag(row["id"]),
    }


def _person(conn, user_id: int):
    row = conn.execute(
        "SELECT u.id, u.email, u.name, u.avatar, p.number "
        "FROM users u LEFT JOIN dog_phone_numbers p ON p.user_id = u.id "
        "WHERE u.id = ?",
        (int(user_id),),
    ).fetchone()
    if not row:
        return None
    return _profile(row, row["number"])


def _request_view(req_id: int, person: dict[str, Any]) -> dict[str, Any]:
    return {"id": int(req_id), "user": person}


def _link_mutual(conn, a: int, b: int, now: float) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO added_accounts (owner_id, contact_id, created_at) VALUES (?, ?, ?)",
        (int(a), int(b), now),
    )
    conn.execute(
        "INSERT OR IGNORE INTO added_accounts (owner_id, contact_id, created_at) VALUES (?, ?, ?)",
        (int(b), int(a), now),
    )


def list_for(owner_id: int) -> list[dict[str, Any]]:
    uid = int(owner_id)
    try:
        dog_phone.ensure_number(uid)
    except Exception:
        pass
    with db.get_conn() as conn:
        _ensure(conn)
        rows = conn.execute(
            "SELECT u.id, u.email, u.name, u.avatar, p.number "
            "FROM added_accounts a "
            "JOIN users u ON u.id = a.contact_id "
            "LEFT JOIN dog_phone_numbers p ON p.user_id = u.id "
            "WHERE a.owner_id = ? "
            "ORDER BY u.name COLLATE NOCASE ASC, u.id ASC",
            (uid,),
        ).fetchall()
    return [_profile(r, r["number"]) for r in rows]


def has(owner_id: int, contact_id: int) -> bool:
    with db.get_conn() as conn:
        _ensure(conn)
        row = conn.execute(
            "SELECT 1 AS ok FROM added_accounts WHERE owner_id = ? AND contact_id = ?",
            (int(owner_id), int(contact_id)),
        ).fetchone()
    return row is not None


def _resolve_contact(owner_id: int, query: str):
    raw = (query or "").strip()
    if not raw:
        raise ValueError("Escribe un correo Dogaemail o un número DOG-")
    contact = None
    if "@" in raw:
        contact = db.get_user_by_email(raw)
    else:
        norm = dog_phone.normalize(raw)
        if not norm:
            raise ValueError("Usa un correo Dogaemail o un número DOG- y 6 cifras")
        found = dog_phone.lookup(norm)
        if found:
            contact = db.get_user_by_id(int(found["id"]))
    if not contact:
        raise LookupError("No hay ninguna cuenta con ese correo o número")
    if int(contact["id"]) == int(owner_id):
        raise ValueError("No puedes añadirte a ti mismo")
    return contact


def request_user(owner_id: int, contact_id: int) -> dict[str, Any]:
    owner_id = int(owner_id)
    contact_id = int(contact_id)
    if contact_id == owner_id:
        raise ValueError("No puedes añadirte a ti mismo")
    now = time.time()
    with db.get_conn() as conn:
        _ensure(conn)
        person = _person(conn, contact_id)
        if not person:
            raise LookupError("No hay ninguna cuenta con ese correo o número")
        already = conn.execute(
            "SELECT 1 AS ok FROM added_accounts WHERE owner_id = ? AND contact_id = ?",
            (owner_id, contact_id),
        ).fetchone()
        if already:
            return {"status": "added", "created": False, "account": person}
        reverse = conn.execute(
            "SELECT id, status FROM account_requests WHERE from_id = ? AND to_id = ?",
            (contact_id, owner_id),
        ).fetchone()
        if reverse and str(reverse["status"]) == "pending":
            _link_mutual(conn, owner_id, contact_id, now)
            conn.execute(
                "UPDATE account_requests SET status = ?, updated_at = ? WHERE id = ?",
                ("accepted", now, int(reverse["id"])),
            )
            conn.execute(
                "UPDATE account_requests SET status = ?, updated_at = ? WHERE from_id = ? AND to_id = ?",
                ("accepted", now, owner_id, contact_id),
            )
            return {
                "status": "added",
                "created": False,
                "account": person,
                "acceptedRequestId": int(reverse["id"]),
            }
        existing = conn.execute(
            "SELECT id, status FROM account_requests WHERE from_id = ? AND to_id = ?",
            (owner_id, contact_id),
        ).fetchone()
        created = False
        if existing and str(existing["status"]) == "pending":
            req_id = int(existing["id"])
        elif existing:
            conn.execute(
                "UPDATE account_requests SET status = ?, updated_at = ? WHERE id = ?",
                ("pending", now, int(existing["id"])),
            )
            req_id = int(existing["id"])
            created = True
        else:
            cur = conn.execute(
                "INSERT INTO account_requests (from_id, to_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (owner_id, contact_id, "pending", now, now),
            )
            req_id = int(cur.lastrowid)
            created = True
        return {
            "status": "pending",
            "created": created,
            "request": _request_view(req_id, person),
        }


def add_query(owner_id: int, query: str) -> dict[str, Any]:
    contact = _resolve_contact(owner_id, query)
    return request_user(int(owner_id), int(contact["id"]))


def list_requests(user_id: int) -> dict[str, Any]:
    uid = int(user_id)
    incoming_sql = (
        "SELECT r.id AS req_id, u.id, u.email, u.name, u.avatar, p.number "
        "FROM account_requests r "
        "JOIN users u ON u.id = r.from_id "
        "LEFT JOIN dog_phone_numbers p ON p.user_id = u.id "
        "WHERE r.to_id = ? AND r.status = ? "
        "ORDER BY r.created_at ASC, r.id ASC"
    )
    outgoing_sql = (
        "SELECT r.id AS req_id, u.id, u.email, u.name, u.avatar, p.number "
        "FROM account_requests r "
        "JOIN users u ON u.id = r.to_id "
        "LEFT JOIN dog_phone_numbers p ON p.user_id = u.id "
        "WHERE r.from_id = ? AND r.status = ? "
        "ORDER BY r.created_at ASC, r.id ASC"
    )
    with db.get_conn() as conn:
        _ensure(conn)
        inc = conn.execute(incoming_sql, (uid, "pending")).fetchall()
        out = conn.execute(outgoing_sql, (uid, "pending")).fetchall()
    def pack(rows):
        return [_request_view(int(row["req_id"]), _profile(row, row["number"])) for row in rows]
    return {"incoming": pack(inc), "outgoing": pack(out)}


def _load_request(conn, request_id: int):
    return conn.execute(
        "SELECT id, from_id, to_id, status FROM account_requests WHERE id = ?",
        (int(request_id),),
    ).fetchone()


def accept(user_id: int, request_id: int) -> dict[str, Any]:
    now = time.time()
    with db.get_conn() as conn:
        _ensure(conn)
        row = _load_request(conn, request_id)
        if not row:
            raise LookupError("Solicitud no encontrada")
        if int(row["to_id"]) != int(user_id):
            raise PermissionError("Solo quien recibe la solicitud puede aceptarla")
        if str(row["status"]) != "pending":
            raise LookupError("Esa solicitud ya no está pendiente")
        _link_mutual(conn, int(row["from_id"]), int(row["to_id"]), now)
        conn.execute(
            "UPDATE account_requests SET status = ?, updated_at = ? WHERE id = ? AND status = ?",
            ("accepted", now, int(request_id), "pending"),
        )
        person = _person(conn, int(row["from_id"]))
        return {
            "status": "added",
            "account": person,
            "fromId": int(row["from_id"]),
            "toId": int(row["to_id"]),
        }


def reject(user_id: int, request_id: int) -> dict[str, Any]:
    now = time.time()
    with db.get_conn() as conn:
        _ensure(conn)
        row = _load_request(conn, request_id)
        if not row:
            raise LookupError("Solicitud no encontrada")
        if int(row["to_id"]) != int(user_id):
            raise PermissionError("Solo quien recibe la solicitud puede rechazarla")
        if str(row["status"]) != "pending":
            raise LookupError("Esa solicitud ya no está pendiente")
        conn.execute(
            "UPDATE account_requests SET status = ?, updated_at = ? WHERE id = ?",
            ("rejected", now, int(request_id)),
        )
        return {"status": "rejected", "fromId": int(row["from_id"]), "toId": int(row["to_id"])}


def cancel(user_id: int, request_id: int) -> dict[str, Any]:
    now = time.time()
    with db.get_conn() as conn:
        _ensure(conn)
        row = _load_request(conn, request_id)
        if not row:
            raise LookupError("Solicitud no encontrada")
        if int(row["from_id"]) != int(user_id):
            raise PermissionError("Solo quien envió la solicitud puede cancelarla")
        if str(row["status"]) != "pending":
            raise LookupError("Esa solicitud ya no está pendiente")
        conn.execute(
            "UPDATE account_requests SET status = ?, updated_at = ? WHERE id = ?",
            ("cancelled", now, int(request_id)),
        )
        return {"status": "cancelled", "fromId": int(row["from_id"]), "toId": int(row["to_id"])}


def remove(owner_id: int, contact_id: int) -> dict[str, Any]:
    owner_id = int(owner_id)
    contact_id = int(contact_id)
    if contact_id == owner_id:
        raise ValueError("No puedes quitarte a ti mismo")
    with db.get_conn() as conn:
        _ensure(conn)
        person = _person(conn, contact_id)
        if not person:
            raise LookupError("Cuenta no encontrada")
        linked = conn.execute(
            "SELECT 1 AS ok FROM added_accounts "
            "WHERE (owner_id = ? AND contact_id = ?) OR (owner_id = ? AND contact_id = ?)",
            (owner_id, contact_id, contact_id, owner_id),
        ).fetchone()
        if not linked:
            raise LookupError("Esa cuenta no está añadida")
        conn.execute(
            "DELETE FROM added_accounts "
            "WHERE (owner_id = ? AND contact_id = ?) OR (owner_id = ? AND contact_id = ?)",
            (owner_id, contact_id, contact_id, owner_id),
        )
        conn.execute(
            "DELETE FROM account_requests "
            "WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)",
            (owner_id, contact_id, contact_id, owner_id),
        )
    return {"status": "removed", "contactId": contact_id}

