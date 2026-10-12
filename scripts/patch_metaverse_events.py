#!/usr/bin/env python3
"""Patch Snake OS: metaverse active-event notifications in notification center."""
from __future__ import annotations

from pathlib import Path

ROOT = Path("/srv/juegos_david/snake-os")
CACHE = "20261002142213mvevents"

DB_HELPER = r'''

def notification_exists_for_event(
    *,
    user_id: int,
    kind: str,
    event_id: str,
) -> bool:
    """True if user already has a notification for this kind+eventId (dedupe)."""
    eid = str(event_id or "").strip()
    if not eid:
        return False
    kind_s = (kind or "")[:40]
    with get_conn() as conn:
        init_chat_tables(conn)
        rows = conn.execute(
            """
            SELECT data FROM notifications
            WHERE user_id = ? AND kind = ?
            ORDER BY id DESC
            LIMIT 300
            """,
            (int(user_id), kind_s),
        ).fetchall()
    for r in rows:
        data = _parse_json(r["data"], {})
        existing = str(data.get("eventId") or data.get("roomId") or "").strip()
        if existing == eid:
            return True
    return False


def ensure_metaverse_event_notifications(
    *,
    user_id: int,
    events: list[dict[str, Any]],
    created_at: float,
) -> list[dict[str, Any]]:
    """Create in-app notifications for active Metaverse events; dedupe by eventId."""
    created: list[dict[str, Any]] = []
    uid = int(user_id)
    for ev in events or []:
        if not isinstance(ev, dict):
            continue
        event_id = str(ev.get("eventId") or ev.get("roomId") or "").strip()
        if not event_id:
            continue
        if notification_exists_for_event(
            user_id=uid, kind="metaverse", event_id=event_id
        ):
            continue
        emoji = str(ev.get("emoji") or "🌐").strip() or "🌐"
        title = str(ev.get("title") or "Evento activo").strip()
        room_name = str(ev.get("roomName") or ev.get("name") or "").strip()
        status = str(ev.get("status") or "").strip()
        time_label = str(ev.get("time") or "").strip()
        parts = [p for p in (room_name, status, time_label) if p]
        body = " · ".join(parts) if parts else str(ev.get("description") or "Evento en curso")
        notif = create_notification(
            user_id=uid,
            kind="metaverse",
            title=f"{emoji} {title}"[:200],
            body=body[:500],
            data={
                "app": "metaverse",
                "eventId": event_id,
                "roomId": event_id,
                "world": str(ev.get("world") or "").strip() or None,
                "status": status or None,
                "roomName": room_name or None,
            },
            created_at=float(created_at),
        )
        created.append(notif)
    return created

'''


def patch_db() -> None:
    path = ROOT / "db.py"
    text = path.read_text(encoding="utf-8")
    if "def ensure_metaverse_event_notifications(" in text:
        print("db.py already patched")
        return
    anchor = "def mark_chat_notifications_read_for_peer("
    idx = text.find(anchor)
    if idx < 0:
        raise SystemExit("anchor not found in db.py")
    # insert before next top-level def/class after this function
    i = idx + len(anchor)
    insert_at = None
    while True:
        next_def = text.find("\ndef ", i)
        next_cls = text.find("\nclass ", i)
        candidates = [c for c in (next_def, next_cls) if c >= 0]
        if not candidates:
            insert_at = len(text)
            break
        cand = min(candidates)
        # ensure it's top-level (newline + def at beginning of line after newline)
        # check indentation: previous char is newline and no spaces before def
        if text[cand + 1:cand + 5] == "def " or text[cand + 1:cand + 7] == "class ":
            insert_at = cand + 1
            break
        i = cand + 1
    path.write_text(text[:insert_at] + DB_HELPER + text[insert_at:], encoding="utf-8")
    print("db.py patched")


MAIN_HELPER = r'''
METAVERSE_ACTIVE_EVENT_STATUSES = frozenset({"En curso", "Abierto", "Abierta"})


def metaverse_rooms_catalog() -> list[dict]:
    """Canonical rooms + events for Doganiero Metaverse (shared by API + notifs)."""
    return [
        {
            "id": "sala-central",
            "name": "Sala Central",
            "world": "plaza",
            "emoji": "🎪",
            "event": {
                "title": "Bienvenida Doganiero",
                "description": "Punto de encuentro: presentaciones, highfives y tour exprés por la Plaza.",
                "time": "Hoy · 18:00–19:30",
                "status": "En curso",
            },
        },
        {
            "id": "anfiteatro",
            "name": "Anfiteatro",
            "world": "plaza",
            "emoji": "🎭",
            "event": {
                "title": "Noche de improvisación",
                "description": "Monólogos y sketches abiertos. Sube al escenario o anímate desde el público.",
                "time": "Sáb · 20:00",
                "status": "Próximamente",
            },
        },
        {
            "id": "quiosco",
            "name": "Quiosco",
            "world": "parque",
            "emoji": "🍵",
            "event": {
                "title": "Té y charla",
                "description": "Conversación relajada en el Quiosco del Parque. Trae tu historia favorita.",
                "time": "Vie · 17:00–18:00",
                "status": "Abierto",
            },
        },
        {
            "id": "pista",
            "name": "Pista al aire libre",
            "world": "parque",
            "emoji": "🎵",
            "event": {
                "title": "Sesión DJ al aire libre",
                "description": "Beats y baile en la pista del Parque. Pedidos de canciones en el chat.",
                "time": "Hoy · 21:00–23:00",
                "status": "En curso",
            },
        },
        {
            "id": "auditorio",
            "name": "Auditorio",
            "world": "ciudad",
            "emoji": "🎤",
            "event": {
                "title": "Charla Tech Doganiero",
                "description": "Demo de minijuegos, voz y novedades del metaverse. Preguntas al final.",
                "time": "Jue · 19:00",
                "status": "Próximamente",
            },
        },
        {
            "id": "galeria",
            "name": "Galería",
            "world": "ciudad",
            "emoji": "🖼️",
            "event": {
                "title": "Expo: Pixel Dogs",
                "description": "Exposición colaborativa de avatares y arte pixel. Vota tu favorito.",
                "time": "Todo el día",
                "status": "Abierta",
            },
        },
    ]


def active_metaverse_event_payloads() -> list[dict]:
    """Events whose status is active (En curso / Abierto / Abierta) for notification sync."""
    out: list[dict] = []
    for room in metaverse_rooms_catalog():
        ev = room.get("event") or {}
        status = str(ev.get("status") or "").strip()
        if status not in METAVERSE_ACTIVE_EVENT_STATUSES:
            continue
        out.append(
            {
                "eventId": room["id"],
                "roomId": room["id"],
                "roomName": room.get("name"),
                "world": room.get("world"),
                "emoji": room.get("emoji") or "🌐",
                "title": ev.get("title") or room.get("name"),
                "description": ev.get("description") or "",
                "time": ev.get("time") or "",
                "status": status,
            }
        )
    return out


'''


def patch_main() -> None:
    path = ROOT / "main.py"
    text = path.read_text(encoding="utf-8")
    if "def active_metaverse_event_payloads(" in text:
        print("main.py helpers already present")
    else:
        # Insert helpers just before @app.get("/api/metaverse/worlds")
        anchor = '@app.get("/api/metaverse/worlds")'
        idx = text.find(anchor)
        if idx < 0:
            raise SystemExit("metaverse/worlds not found")
        text = text[:idx] + MAIN_HELPER + text[idx:]

    # Replace worlds rooms list with metaverse_rooms_catalog()
    old_worlds = '''@app.get("/api/metaverse/worlds")
def metaverse_worlds(user=Depends(require_user)):
    _ = user
    return {
        "worlds": [
            {"id": "plaza", "name": "Plaza", "emoji": "🏛️"},
            {"id": "parque", "name": "Parque", "emoji": "🌳"},
            {"id": "ciudad", "name": "Ciudad", "emoji": "🏙️"},
        ],
        "rooms": [
            {
                "id": "sala-central",
                "name": "Sala Central",
                "world": "plaza",
                "emoji": "🎪",
                "event": {
                    "title": "Bienvenida Doganiero",
                    "description": "Punto de encuentro: presentaciones, highfives y tour exprés por la Plaza.",
                    "time": "Hoy · 18:00–19:30",
                    "status": "En curso",
                },
            },
            {
                "id": "anfiteatro",
                "name": "Anfiteatro",
                "world": "plaza",
                "emoji": "🎭",
                "event": {
                    "title": "Noche de improvisación",
                    "description": "Monólogos y sketches abiertos. Sube al escenario o anímate desde el público.",
                    "time": "Sáb · 20:00",
                    "status": "Próximamente",
                },
            },
            {
                "id": "quiosco",
                "name": "Quiosco",
                "world": "parque",
                "emoji": "🍵",
                "event": {
                    "title": "Té y charla",
                    "description": "Conversación relajada en el Quiosco del Parque. Trae tu historia favorita.",
                    "time": "Vie · 17:00–18:00",
                    "status": "Abierto",
                },
            },
            {
                "id": "pista",
                "name": "Pista al aire libre",
                "world": "parque",
                "emoji": "🎵",
                "event": {
                    "title": "Sesión DJ al aire libre",
                    "description": "Beats y baile en la pista del Parque. Pedidos de canciones en el chat.",
                    "time": "Hoy · 21:00–23:00",
                    "status": "En curso",
                },
            },
            {
                "id": "auditorio",
                "name": "Auditorio",
                "world": "ciudad",
                "emoji": "🎤",
                "event": {
                    "title": "Charla Tech Doganiero",
                    "description": "Demo de minijuegos, voz y novedades del metaverse. Preguntas al final.",
                    "time": "Jue · 19:00",
                    "status": "Próximamente",
                },
            },
            {
                "id": "galeria",
                "name": "Galería",
                "world": "ciudad",
                "emoji": "🖼️",
                "event": {
                    "title": "Expo: Pixel Dogs",
                    "description": "Exposición colaborativa de avatares y arte pixel. Vota tu favorito.",
                    "time": "Todo el día",
                    "status": "Abierta",
                },
            },
        ],
    }
'''
    new_worlds = '''@app.get("/api/metaverse/worlds")
def metaverse_worlds(user=Depends(require_user)):
    _ = user
    return {
        "worlds": [
            {"id": "plaza", "name": "Plaza", "emoji": "🏛️"},
            {"id": "parque", "name": "Parque", "emoji": "🌳"},
            {"id": "ciudad", "name": "Ciudad", "emoji": "🏙️"},
        ],
        "rooms": metaverse_rooms_catalog(),
    }
'''
    if old_worlds in text:
        text = text.replace(old_worlds, new_worlds, 1)
        print("main.py: worlds uses catalog")
    elif "rooms\": metaverse_rooms_catalog()" in text:
        print("main.py: worlds already uses catalog")
    else:
        print("WARNING: could not replace worlds body; check manually")

    # Patch notifications_list to sync active events
    old_list = '''@app.get("/api/notifications")
def notifications_list(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    user=Depends(require_user),
):
    items = db.list_notifications(
'''
    # Read actual signature from file
    if "ensure_metaverse_event_notifications" in text and "active_metaverse_event_payloads()" in text and "notifications_list" in text:
        # check if already syncing inside notifications_list
        list_idx = text.find("@app.get(\"/api/notifications\")")
        list_end = text.find("@app.get(\"/api/notifications/unread-count\")", list_idx)
        chunk = text[list_idx:list_end] if list_end > list_idx else ""
        if "ensure_metaverse_event_notifications" in chunk:
            print("main.py: notifications_list already syncs")
        else:
            # Insert sync after uid resolution
            needle = "def notifications_list("
            li = text.find(needle)
            # find first line with list_notifications call
            call = text.find("items = db.list_notifications(", li)
            if call < 0:
                raise SystemExit("list_notifications call not found")
            # find start of function body after ):
            body_start = text.find("):\n", li)
            if body_start < 0:
                raise SystemExit("notifications_list body not found")
            body_start += 3
            # What comes after ): — often indented with spaces
            sync_block = (
                "    uid = int(user[\"id\"])\n"
                "    db.ensure_metaverse_event_notifications(\n"
                "        user_id=uid,\n"
                "        events=active_metaverse_event_payloads(),\n"
                "        created_at=time_mod.time(),\n"
                "    )\n"
            )
            # If the next lines already get uid somehow, avoid duplicate
            text = text[:body_start] + sync_block + text[body_start:]
            # Fix list_notifications to use uid if it used int(user["id"])
            text2 = text
            # After our insert, replace user_id=int(user["id"]) in that function only once if present
            # Safer: leave as-is (int(user["id"]) still works)
            print("main.py: notifications_list sync inserted")
            text = text2
    else:
        needle = "def notifications_list("
        li = text.find(needle)
        body_start = text.find("):\n", li)
        body_start += 3
        sync_block = (
            "    uid = int(user[\"id\"])\n"
            "    db.ensure_metaverse_event_notifications(\n"
            "        user_id=uid,\n"
            "        events=active_metaverse_event_payloads(),\n"
            "        created_at=time_mod.time(),\n"
            "    )\n"
        )
        text = text[:body_start] + sync_block + text[body_start:]
        print("main.py: notifications_list sync inserted (else)")

    # Patch notifications_open action to include room/world
    old_action = '''    return {
        "notification": db.get_notification(user_id=uid, notif_id=int(notif_id)),
        "action": {
            "openApp": data.get("app") or ("chat" if row.get("kind") == "chat" else None),
            "peerEmail": peer_email or None,
        },
        "unread": db.count_unread_notifications(user_id=uid),
    }
'''
    new_action = '''    open_app = data.get("app")
    if not open_app:
        if row.get("kind") == "chat":
            open_app = "chat"
        elif row.get("kind") == "metaverse":
            open_app = "metaverse"
    room_id = str(data.get("roomId") or data.get("eventId") or "").strip() or None
    world_id = str(data.get("world") or "").strip() or None
    return {
        "notification": db.get_notification(user_id=uid, notif_id=int(notif_id)),
        "action": {
            "openApp": open_app,
            "peerEmail": peer_email or None,
            "roomId": room_id,
            "world": world_id,
            "eventId": str(data.get("eventId") or room_id or "").strip() or None,
        },
        "unread": db.count_unread_notifications(user_id=uid),
    }
'''
    if old_action in text:
        text = text.replace(old_action, new_action, 1)
        print("main.py: notifications_open action extended")
    elif '"roomId": room_id' in text:
        print("main.py: notifications_open already extended")
    else:
        print("WARNING: could not patch notifications_open")

    # Add dedicated sync endpoint before notifications list for explicit login sync (optional)
    if '@app.post("/api/notifications/sync-metaverse-events")' not in text:
        insert_before = '@app.get("/api/notifications")'
        bi = text.find(insert_before)
        if bi < 0:
            raise SystemExit("notifications get not found for sync endpoint")
        endpoint = '''@app.post("/api/notifications/sync-metaverse-events")
def notifications_sync_metaverse_events(user=Depends(require_user)):
    """Create notifications for active Metaverse events (deduped by event id)."""
    uid = int(user["id"])
    created = db.ensure_metaverse_event_notifications(
        user_id=uid,
        events=active_metaverse_event_payloads(),
        created_at=time_mod.time(),
    )
    return {
        "created": len(created),
        "notifications": created,
        "unread": db.count_unread_notifications(user_id=uid),
    }


'''
        text = text[:bi] + endpoint + text[bi:]
        print("main.py: sync endpoint added")
    else:
        print("main.py: sync endpoint exists")

    path.write_text(text, encoding="utf-8")
    print("main.py written")


def patch_doganiero_chat() -> None:
    path = ROOT / "doganiero-chat.js"
    text = path.read_text(encoding="utf-8")

    old_open = """      if (action.openApp === 'chat' && action.peerEmail) {
        openChatWithPeer(action.peerEmail);
      } else if (action.openApp && typeof global.openApp === 'function') {
        global.openApp(action.openApp);
      }"""
    new_open = """      if (action.openApp === 'chat' && action.peerEmail) {
        openChatWithPeer(action.peerEmail);
      } else if (action.openApp === 'metaverse') {
        var roomId = action.roomId || action.eventId || null;
        var worldId = action.world || null;
        if (typeof global.openMetaverseRoom === 'function') {
          global.openMetaverseRoom(roomId, worldId);
        } else if (typeof global.setMetaversePendingRoom === 'function') {
          global.setMetaversePendingRoom(roomId, worldId);
          if (typeof global.openApp === 'function') global.openApp('metaverse');
        } else if (typeof global.openApp === 'function') {
          global.openApp('metaverse');
        }
      } else if (action.openApp && typeof global.openApp === 'function') {
        global.openApp(action.openApp);
      }"""
    if old_open in text:
        text = text.replace(old_open, new_open, 1)
        print("doganiero-chat.js: openNotification metaverse")
    elif "openApp === 'metaverse'" in text:
        print("doganiero-chat.js: openNotification already has metaverse")
    else:
        print("WARNING: openNotification patch failed")

    # Also handle native SW click for metaverse
    old_sw = """      if (data.type !== 'snakeos-notif-click') return;
"""
    # Find the SW message handler body
    if "data.openApp === 'metaverse'" not in text:
        # Look for openChatWithPeer in SW handler
        sw_marker = "if (data.type !== 'snakeos-notif-click') return;"
        si = text.find(sw_marker)
        if si >= 0:
            # After this, there's usually peerEmail handling
            chunk_start = si
            chunk = text[chunk_start:chunk_start + 500]
            # Replace simple openApp call in SW path if present
            old_sw_body = """      if (data.type !== 'snakeos-notif-click') return;
      if (data.peerEmail) {
        openChatWithPeer(data.peerEmail);
      } else if (typeof global.openApp === 'function') {
        global.openApp(data.openApp || 'chat');
      }"""
            new_sw_body = """      if (data.type !== 'snakeos-notif-click') return;
      if (data.peerEmail) {
        openChatWithPeer(data.peerEmail);
      } else if (data.openApp === 'metaverse' || data.roomId) {
        if (typeof global.openMetaverseRoom === 'function') {
          global.openMetaverseRoom(data.roomId || data.eventId, data.world);
        } else if (typeof global.openApp === 'function') {
          global.openApp('metaverse');
        }
      } else if (typeof global.openApp === 'function') {
        global.openApp(data.openApp || 'chat');
      }"""
            if old_sw_body in text:
                text = text.replace(old_sw_body, new_sw_body, 1)
                print("doganiero-chat.js: SW click metaverse")
            else:
                print("doganiero-chat.js: SW handler differs; skipping")
                print(repr(chunk[:300]))

    # Sync metaverse events on start + periodic (alongside refresh)
    old_start = """  function startNotificationCenter() {
    wireServiceWorkerMessages();
    registerSnakeServiceWorker();
    // Si ya había permiso, no pedimos de nuevo; si no, el usuario lo activa con la campana
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      ensureNativeNotifPermission(false);
    }
    connectChatWs();
    refreshNotifications();
    if (notifState.pollTimer) clearInterval(notifState.pollTimer);
    notifState.pollTimer = setInterval(function () {
      if (currentUser()) refreshNotifications();
    }, 20000);
"""
    new_start = """  async function syncMetaverseEventNotifications() {
    if (!currentUser()) return;
    try {
      await apiFn()('/api/notifications/sync-metaverse-events', { method: 'POST' });
    } catch (e) {}
  }

  function startNotificationCenter() {
    wireServiceWorkerMessages();
    registerSnakeServiceWorker();
    // Si ya había permiso, no pedimos de nuevo; si no, el usuario lo activa con la campana
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      ensureNativeNotifPermission(false);
    }
    connectChatWs();
    syncMetaverseEventNotifications().then(function () { return refreshNotifications(); });
    if (notifState.pollTimer) clearInterval(notifState.pollTimer);
    notifState._mvSyncTick = 0;
    notifState.pollTimer = setInterval(function () {
      if (!currentUser()) return;
      notifState._mvSyncTick = (notifState._mvSyncTick || 0) + 1;
      // Every ~60s (3rd tick) re-sync active Metaverse events; always refresh list
      var p = Promise.resolve();
      if (notifState._mvSyncTick % 3 === 0) {
        p = syncMetaverseEventNotifications();
      }
      p.then(function () { refreshNotifications(); });
    }, 20000);
"""
    if "syncMetaverseEventNotifications" in text:
        print("doganiero-chat.js: sync already present")
    elif old_start in text:
        text = text.replace(old_start, new_start, 1)
        print("doganiero-chat.js: startNotificationCenter sync")
    else:
        print("WARNING: startNotificationCenter patch failed")

    # Also show OS notif for metaverse kind when background
    old_rt = """        if (n.kind === 'chat' || nd.app === 'chat') {
          showOsNotification(n.title || 'Doganiero Chat', n.body || '', nd);
        }"""
    new_rt = """        if (n.kind === 'chat' || nd.app === 'chat') {
          showOsNotification(n.title || 'Doganiero Chat', n.body || '', nd);
        } else if (n.kind === 'metaverse' || nd.app === 'metaverse') {
          showOsNotification(n.title || 'Doganiero Metaverse', n.body || '', {
            app: 'metaverse',
            roomId: nd.roomId || nd.eventId,
            eventId: nd.eventId || nd.roomId,
            world: nd.world,
            messageId: 'mv-' + String(nd.eventId || nd.roomId || n.id || '')
          });
        }"""
    if old_rt in text:
        text = text.replace(old_rt, new_rt, 1)
        print("doganiero-chat.js: OS notif for metaverse")
    elif "n.kind === 'metaverse'" in text:
        print("doganiero-chat.js: OS notif metaverse already")
    else:
        print("WARNING: realtime metaverse OS notif patch failed")

    # Fix showOsNotification tag/data for metaverse
    old_opts = """    var opts = {
      body: body || '',
      tag: 'dc-' + String(data.messageId || data.peerEmail || title || 'chat'),
      renotify: true,
      requireInteraction: false,
      data: {
        peerEmail: data.peerEmail || null,
        openApp: data.app || 'chat',
        messageId: data.messageId || null,
        url: '/'
      }
    };"""
    new_opts = """    var opts = {
      body: body || '',
      tag: (data.app === 'metaverse' ? 'mv-' : 'dc-') + String(data.messageId || data.roomId || data.eventId || data.peerEmail || title || 'chat'),
      renotify: true,
      requireInteraction: false,
      data: {
        peerEmail: data.peerEmail || null,
        openApp: data.app || 'chat',
        messageId: data.messageId || null,
        roomId: data.roomId || data.eventId || null,
        eventId: data.eventId || data.roomId || null,
        world: data.world || null,
        url: '/'
      }
    };"""
    if old_opts in text:
        text = text.replace(old_opts, new_opts, 1)
        print("doganiero-chat.js: showOsNotification data extended")
    else:
        print("doganiero-chat.js: showOsNotification opts already or mismatch")

    path.write_text(text, encoding="utf-8")
    print("doganiero-chat.js written")


def patch_metaverse() -> None:
    path = ROOT / "metaverse.js"
    text = path.read_text(encoding="utf-8")

    # Update cache-bust comment
    if text.startswith("/* cache-bust"):
        nl = text.find("\n")
        text = "/* cache-bust " + CACHE + " — active event notifications → open room */" + text[nl:]

    preamble = """
  var pendingMetaverseRoom = null;

  function setMetaversePendingRoom(roomId, world) {
    if (!roomId) {
      pendingMetaverseRoom = null;
      return;
    }
    pendingMetaverseRoom = {
      roomId: String(roomId),
      world: world ? String(world) : null
    };
  }

  function takeMetaversePendingRoom() {
    var p = pendingMetaverseRoom;
    pendingMetaverseRoom = null;
    return p;
  }

  function openMetaverseRoom(roomId, world) {
    if (roomId) setMetaversePendingRoom(roomId, world);
    if (roomId && typeof global.__mvEnterRoom === 'function') {
      try {
        global.__mvEnterRoom(String(roomId));
        return;
      } catch (e) {}
    }
    if (typeof global.openApp === 'function') global.openApp('metaverse');
  }

"""
    if "function openMetaverseRoom(" in text:
        print("metaverse.js: pending room already present")
    else:
        # Insert after EVENT_ROOMS / ROOM_EVENTS block — after `var EMOTES`
        anchor = "  var EMOTES = ['👋', '😂', '🦴', '❤️', '🎉', '🐕'];"
        if anchor not in text:
            raise SystemExit("EMOTES anchor not found")
        text = text.replace(anchor, anchor + "\n" + preamble, 1)
        print("metaverse.js: pending room helpers added")

    # After enterRoom/doEnterRoom defined, register __mvEnterRoom and try pending
    # Insert after `if (roomLeaveBtn) roomLeaveBtn.addEventListener('click', leaveRoom);`
    leave_anchor = "    if (roomLeaveBtn) roomLeaveBtn.addEventListener('click', leaveRoom);"
    pending_hook = """    if (roomLeaveBtn) roomLeaveBtn.addEventListener('click', leaveRoom);

    global.__mvEnterRoom = enterRoom;
    function tryPendingMetaverseRoom() {
      var pending = null;
      if (opts.room) {
        pending = { roomId: String(opts.room), world: opts.world || null };
      } else if (typeof takeMetaversePendingRoom === 'function') {
        pending = takeMetaversePendingRoom();
      } else if (pendingMetaverseRoom) {
        pending = takeMetaversePendingRoom();
      }
      if (pending && pending.roomId) {
        enterRoom(pending.roomId);
        return true;
      }
      return false;
    }
"""
    if "tryPendingMetaverseRoom" in text:
        print("metaverse.js: tryPending already")
    elif leave_anchor in text:
        text = text.replace(leave_anchor, pending_hook, 1)
        print("metaverse.js: tryPending + __mvEnterRoom")
    else:
        print("WARNING: leaveRoom anchor not found")

    # Call tryPending after welcome
    welcome_end = "          if (voiceOn) syncVoiceMesh();\n        } else if (msg.type === 'join') {"
    welcome_end_new = "          if (voiceOn) syncVoiceMesh();\n          tryPendingMetaverseRoom();\n        } else if (msg.type === 'join') {"
    if "tryPendingMetaverseRoom();" in text and text.count("tryPendingMetaverseRoom();") >= 1:
        # still add to welcome if missing there
        if welcome_end in text:
            text = text.replace(welcome_end, welcome_end_new, 1)
            print("metaverse.js: tryPending on welcome")
        else:
            print("metaverse.js: welcome already or mismatch")
    elif welcome_end in text:
        text = text.replace(welcome_end, welcome_end_new, 1)
        print("metaverse.js: tryPending on welcome")
    else:
        print("WARNING: welcome end not found")

    # Also try after progress load before/after connect — schedule after loadProgressThenConnect apply
    old_load = """    function loadProgressThenConnect() {
      fetch('/api/metaverse/progress', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (prog) {
          if (prog) applyProgress(prog, { applyPose: true, restoreMic: false, clearRoom: false });
          connectWs();
        })
        .catch(function () { connectWs(); });
    }"""
    new_load = """    function loadProgressThenConnect() {
      fetch('/api/metaverse/progress', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (prog) {
          // Pending room from notification wins over saved room pose
          var pendingEarly = pendingMetaverseRoom;
          if (pendingEarly && pendingEarly.roomId) {
            if (prog) applyProgress(prog, { applyPose: false, restoreMic: false, clearRoom: true });
            else { currentRoom = null; }
          } else if (prog) {
            applyProgress(prog, { applyPose: true, restoreMic: false, clearRoom: false });
          }
          connectWs();
          setTimeout(function () { tryPendingMetaverseRoom(); }, 400);
        })
        .catch(function () {
          connectWs();
          setTimeout(function () { tryPendingMetaverseRoom(); }, 400);
        });
    }"""
    if "pendingEarly" in text:
        print("metaverse.js: loadProgress pending already")
    elif old_load in text:
        text = text.replace(old_load, new_load, 1)
        print("metaverse.js: loadProgressThenConnect pending")
    else:
        print("WARNING: loadProgressThenConnect mismatch")

    # cleanup clear __mvEnterRoom
    old_cleanup = """    return function cleanup() {
      closed = true;
"""
    new_cleanup = """    return function cleanup() {
      closed = true;
      if (global.__mvEnterRoom === enterRoom) {
        try { global.__mvEnterRoom = null; } catch (eClr) {}
      }
"""
    if "global.__mvEnterRoom === enterRoom" in text:
        print("metaverse.js: cleanup already clears hook")
    elif old_cleanup in text:
        text = text.replace(old_cleanup, new_cleanup, 1)
        print("metaverse.js: cleanup clears __mvEnterRoom")
    else:
        print("WARNING: cleanup patch failed")

    # exports
    old_export = "  global.renderMetaverseApp = renderMetaverseApp;\n})(typeof window !== 'undefined' ? window : this);"
    new_export = """  global.renderMetaverseApp = renderMetaverseApp;
  global.setMetaversePendingRoom = setMetaversePendingRoom;
  global.takeMetaversePendingRoom = takeMetaversePendingRoom;
  global.openMetaverseRoom = openMetaverseRoom;
})(typeof window !== 'undefined' ? window : this);"""
    # file may end with `this` or `globalThis`
    import re
    m = re.search(
        r"  global\.renderMetaverseApp = renderMetaverseApp;\n\}\)\(typeof window !== 'undefined' \? window : (?:this|globalThis)\);",
        text,
    )
    if "global.openMetaverseRoom = openMetaverseRoom" in text:
        print("metaverse.js: exports already")
    elif m:
        text = text[: m.start()] + new_export + text[m.end() :]
        print("metaverse.js: exports added")
    else:
        print("WARNING: export patch failed")

    path.write_text(text, encoding="utf-8")
    print("metaverse.js written")


def patch_index() -> None:
    path = ROOT / "index.html"
    text = path.read_text(encoding="utf-8")
    text2 = text
    text2 = text2.replace(
        'src="/static/metaverse.js?v=20261002141748topdown"',
        f'src="/static/metaverse.js?v={CACHE}"',
    )
    text2 = text2.replace(
        'src="/static/doganiero-chat.js?v=20261002083600notif"',
        f'src="/static/doganiero-chat.js?v={CACHE}"',
    )
    # also catch any current metaverse/chat query
    import re
    text2 = re.sub(
        r'src="/static/metaverse\.js\?v=[^"]+"',
        f'src="/static/metaverse.js?v={CACHE}"',
        text2,
        count=1,
    )
    text2 = re.sub(
        r'src="/static/doganiero-chat\.js\?v=[^"]+"',
        f'src="/static/doganiero-chat.js?v={CACHE}"',
        text2,
        count=1,
    )
    if text2 != text:
        path.write_text(text2, encoding="utf-8")
        print(f"index.html cache-bust {CACHE}")
    else:
        print("index.html unchanged?")


def main() -> None:
    patch_db()
    patch_main()
    patch_doganiero_chat()
    patch_metaverse()
    patch_index()
    print("DONE")


if __name__ == "__main__":
    main()
