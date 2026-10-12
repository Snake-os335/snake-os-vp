from pathlib import Path
p = Path("/srv/juegos_david/snake-os/main.py")
t = p.read_text(encoding="utf-8")
old = '@app.post("/api/notifications/{notif_id}/open")\ndef notifications_open(notif_id: int, user=Depends(require_user)):\n    row = db.get_notification(user_id=uid, notif_id=int(notif_id))\n'
new = '@app.post("/api/notifications/{notif_id}/open")\ndef notifications_open(notif_id: int, user=Depends(require_user)):\n    uid = int(user["id"])\n    row = db.get_notification(user_id=uid, notif_id=int(notif_id))\n'
if old in t:
    t = t.replace(old, new, 1)
    print("fixed uid")
else:
    i = t.find("def notifications_open")
    print("snippet:", repr(t[i:i+220]))

if "METAVERSE_ACTIVE_EVENT_STATUSES" not in t:
    anchor = "def metaverse_rooms_catalog()"
    idx = t.find(anchor)
    if idx < 0:
        raise SystemExit("catalog not found")
    const = 'METAVERSE_ACTIVE_EVENT_STATUSES = frozenset({"En curso", "Abierto", "Abierta"})\n\n\n'
    t = t[:idx] + const + t[idx:]
    print("inserted ACTIVE statuses")
else:
    print("ACTIVE statuses present")

p.write_text(t, encoding="utf-8")
print("done")
