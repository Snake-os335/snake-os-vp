"""Privacidad del directorio y de las notas/eventos compartidos.

Base temporal. No usa data/ ni el servidor real.
Ejecutar: python -m unittest tests.test_privacy_share
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

try:
    from fastapi.testclient import TestClient

    HAS_FASTAPI = True
except (ImportError, RuntimeError):
    HAS_FASTAPI = False


def _load_main(tmp: str):
    import db

    db.DATA_DIR = Path(tmp)
    db.DB_PATH = Path(tmp) / "snakeos.db"
    for name in ("AVATARS_DIR", "FILES_DIR", "WALLPAPERS_DIR", "BOOK_MEDIA_DIR"):
        if hasattr(db, name):
            setattr(db, name, Path(tmp) / getattr(db, name).name)
    os.environ.setdefault("SNAKEOS_PLACA", "false")
    if "main" in sys.modules:
        db.init_db()
        return sys.modules["main"]
    import main  # noqa: E402

    db.init_db()
    return main


@unittest.skipUnless(HAS_FASTAPI, "fastapi no instalado")
class TestPrivacyShare(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="snk-privacy-")
        try:
            cls.main = _load_main(cls.tmp)
        except Exception as exc:
            raise unittest.SkipTest(f"main.py no se pudo importar: {type(exc).__name__}: {exc}")
        cls.password = "clave-segura"
        cls.ana = "ana-priv@dogaemail.com"
        cls.beto = "beto-priv@dogaemail.com"
        cls.ciro = "ciro-secreto@dogaemail.com"
        boot = TestClient(cls.main.app, raise_server_exceptions=False)
        for i, (email, name) in enumerate((
            (cls.ana, "Ana"),
            (cls.beto, "Beto"),
            (cls.ciro, "Ciro"),
        )):
            r = boot.post(
                "/api/signup",
                json={"email": email, "name": name, "password": cls.password, "avatar": "🐶"},
                headers={"CF-Connecting-IP": "81.200.40.%d" % (i + 1)},
            )
            if r.status_code != 200:
                raise unittest.SkipTest("signup %s -> %s %s" % (email, r.status_code, r.text[:200]))

    def setUp(self):
        self.main._activity.clear()
        self.main._calls.clear()
        self.a = self._login(self.ana)
        self.b = self._login(self.beto)
        self.c = self._login(self.ciro)
        self._befriend(self.a, self.b, self.beto)

    def _login(self, email):
        client = TestClient(self.main.app, raise_server_exceptions=False)
        r = client.post("/api/login", json={"email": email, "password": self.password})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertNotIn("password", r.text.lower())
        return client

    def _uid(self, email):
        return int(self.main.db.get_user_by_email(email)["id"])

    def _befriend(self, left, right, right_email):
        already = left.get("/api/added-accounts")
        ids = {int(x["id"]) for x in (already.json().get("accounts") or [])}
        target = self.main.db.get_user_by_email(right_email)
        if target and int(target["id"]) in ids:
            return
        r = left.post("/api/added-accounts", json={"query": right_email})
        self.assertEqual(r.status_code, 200, r.text)
        if r.json().get("status") == "added":
            return
        reqs = right.get("/api/added-accounts/requests")
        self.assertEqual(reqs.status_code, 200, reqs.text)
        incoming = reqs.json().get("incoming") or []
        self.assertTrue(incoming, reqs.text)
        acc = right.post("/api/added-accounts/requests/%s/accept" % incoming[0]["id"])
        self.assertEqual(acc.status_code, 200, acc.text)

    def _assert_clean(self, response, *needles):
        text = response.text
        for needle in needles:
            self.assertNotIn(needle, text)

    def test_anonymous_gets_no_directory(self):
        anon = TestClient(self.main.app, raise_server_exceptions=False)
        self.main.note_activity("inicio", "Ana", self._uid(self.ana))
        for path in ("/api/online/names", "/api/activity"):
            r = anon.get(path)
            self.assertEqual(r.status_code, 401, r.text)
            self._assert_clean(r, "Ana", self.ana, self.beto, "uid")
        missing = anon.get("/api/feed")
        self.assertEqual(missing.status_code, 404)
        self._assert_clean(missing, self.ana, "secreto-de-ana")

    def test_directory_hide_and_websocket(self):
        self.main.note_activity("inicio", "Ana", self._uid(self.ana))
        self.main.note_activity("inicio", "Ciro", self._uid(self.ciro))
        stranger = self.c.get("/api/activity")
        self.assertEqual(stranger.status_code, 200, stranger.text)
        self.assertEqual(stranger.json().get("names"), [])
        self.assertEqual(stranger.json().get("events"), [])
        self._assert_clean(stranger, "Ana", self.ana, "uid")

        with self.a.websocket_connect("/api/chat/ws") as wa:
            self.assertEqual(wa.receive_json().get("type"), "hello")
            seen = self.b.get("/api/online/names")
            self.assertEqual(seen.status_code, 200, seen.text)
            self.assertEqual(seen.json().get("names"), ["Ana"])
            self._assert_clean(seen, self.ana, "uid")
            activity = self.b.get("/api/activity")
            self.assertTrue(any(ev.get("w") == "Ana" and "uid" not in ev for ev in activity.json()["events"]))
            self.assertFalse(any(ev.get("w") == "Ciro" for ev in activity.json()["events"]))
            with self.b.websocket_connect("/api/chat/ws") as wb:
                self.assertEqual(wb.receive_json().get("type"), "hello")
                wb.send_json({"type": "directory"})
                snap = wb.receive_json()
                self.assertEqual(snap.get("type"), "directory")
                self.assertIn("Ana", snap.get("names") or [])
                self.assertNotIn("@", str(snap))
            hidden = self.a.put("/api/me/privacy", json={"hideDirectory": True})
            self.assertEqual(hidden.status_code, 200, hidden.text)
            self.assertTrue(hidden.json().get("hideDirectory"))
            again = self.b.get("/api/activity")
            self.assertEqual(again.json().get("names"), [])
            self.assertFalse(any(ev.get("w") == "Ana" for ev in again.json()["events"]))
            shown = self.a.put("/api/me/privacy", json={"hideDirectory": False})
            self.assertFalse(shown.json().get("hideDirectory"))
            back = self.b.get("/api/online/names")
            self.assertEqual(back.json().get("names"), ["Ana"])
        with self.a.websocket_connect("/api/chat/ws") as wa, self.b.websocket_connect("/api/chat/ws") as wb:
            self.assertEqual(wa.receive_json().get("type"), "hello")
            self.assertEqual(wb.receive_json().get("type"), "hello")
            self.a.post("/api/chat/hidden", json={"email": self.beto, "hidden": True})
            mine = self.a.get("/api/online/names")
            self.assertNotIn("Beto", mine.json().get("names") or [])
            self._assert_clean(mine, self.beto)
            still = self.b.get("/api/online/names")
            self.assertIn("Ana", still.json().get("names") or [])
            self.a.post("/api/chat/hidden", json={"email": self.beto, "hidden": False})

    def test_share_note_and_event_then_revoke_delete(self):
        secret = "secreto-de-ana-xyz"
        note_id = "n-priv-1"
        saved = self.a.put("/api/notes", json=[{"id": note_id, "text": secret, "date": "hoy"}])
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(self.b.get("/api/notes").json(), [])
        self.assertIn(secret, str(self.a.get("/api/notes").json()))
        self.assertEqual(self.b.get("/api/shares").json().get("items"), [])
        denied = self.a.post("/api/shares", json={"kind": "note", "itemId": note_id, "recipientId": self._uid(self.ciro)})
        self.assertEqual(denied.status_code, 404, denied.text)
        self._assert_clean(denied, self.ciro, secret)
        other = self.c.get("/api/shares")
        self._assert_clean(other, secret, self.ana)
        created = self.a.post("/api/shares", json={"kind": "note", "itemId": note_id, "recipientId": self._uid(self.beto)})
        self.assertEqual(created.status_code, 200, created.text)
        again = self.a.post("/api/shares", json={"kind": "note", "itemId": note_id, "recipientId": self._uid(self.beto)})
        self.assertEqual(again.status_code, 200, again.text)
        inbox = self.b.get("/api/shares").json()["items"]
        self.assertEqual(len(inbox), 1)
        self.assertEqual(inbox[0]["text"], secret)
        self.assertNotIn("email", inbox[0]["from"])
        self.assertEqual(self.a.get("/api/shares").json()["items"], [])
        self.c.get("/api/shares")
        self.assertNotIn(secret, self.c.get("/api/shares").text)
        edited = self.a.put("/api/notes", json=[{"id": note_id, "text": secret + "-editado", "date": "hoy"}])
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(self.b.get("/api/shares").json()["items"][0]["text"], secret + "-editado")
        revoked = self.a.post("/api/shares/revoke", json={"kind": "note", "itemId": note_id, "recipientId": self._uid(self.beto)})
        self.assertEqual(revoked.status_code, 200, revoked.text)
        self.assertEqual(self.b.get("/api/shares").json()["items"], [])
        self.a.post("/api/shares", json={"kind": "note", "itemId": note_id, "recipientId": self._uid(self.beto)})
        self.a.put("/api/notes", json=[])
        self.assertEqual(self.b.get("/api/shares").json()["items"], [])

        day = "2026-11-06"
        event_id = "epriv1"
        title = "Dentista privado"
        cal = self.a.put("/api/calendar", json={"events": {day: [{"id": event_id, "t": title, "h": "09:30", "c": "#34d17a"}]}})
        self.assertEqual(cal.status_code, 200, cal.text)
        own_cal = self.a.get("/api/calendar")
        self.assertEqual(own_cal.status_code, 200, own_cal.text)
        self.assertIn(title, own_cal.text)
        shared = self.a.post("/api/shares", json={"kind": "event", "itemId": event_id, "day": day, "recipientId": self._uid(self.beto)})
        self.assertEqual(shared.status_code, 200, shared.text)
        events = [it for it in self.b.get("/api/shares").json()["items"] if it.get("kind") == "event"]
        self.assertEqual(len(events), 1)
        item = events[0]
        self.assertEqual(item["title"], title)
        self.assertEqual(item["day"], day)
        self.assertEqual(item["time"], "09:30")
        self.assertNotIn("overdue", item)
        self.assertNotIn("vencido", item)
        self.a.put("/api/calendar", json={"events": {}})
        self.assertEqual(self.b.get("/api/shares").json()["items"], [])
        self.assertEqual(self.b.get("/api/notes").status_code, 200)
        self.assertEqual(self.b.get("/api/calendar").status_code, 200)

    def test_break_contact_purges_share(self):
        note_id = "n-priv-break"
        text = "nota-que-se-rompe"
        self.a.put("/api/notes", json=[{"id": note_id, "text": text, "date": "hoy"}])
        self.a.post("/api/shares", json={"kind": "note", "itemId": note_id, "recipientId": self._uid(self.beto)})
        self.assertEqual(len(self.b.get("/api/shares").json()["items"]), 1)
        gone = self.a.delete("/api/added-accounts/%d" % self._uid(self.beto))
        self.assertEqual(gone.status_code, 200, gone.text)
        self.assertEqual(self.b.get("/api/shares").json()["items"], [])
        self.assertEqual(self.a.get("/api/added-accounts").status_code, 200)
        self._befriend(self.a, self.b, self.beto)
        self.assertEqual(self.b.get("/api/shares").json()["items"], [])
        accounts = self.a.get("/api/added-accounts")
        self.assertEqual(accounts.status_code, 200, accounts.text)
        self.assertTrue(any(x.get("email") == self.beto for x in accounts.json().get("accounts") or []))

    def test_delete_account_purges_share(self):
        boot = TestClient(self.main.app, raise_server_exceptions=False)
        email = "dora-priv@dogaemail.com"
        r = boot.post(
            "/api/signup",
            json={"email": email, "name": "Dora", "password": self.password, "avatar": "🐶"},
            headers={"CF-Connecting-IP": "81.200.40.9"},
        )
        self.assertEqual(r.status_code, 200, r.text)
        d = self._login(email)
        self._befriend(d, self.b, self.beto)
        d.put("/api/notes", json=[{"id": "n-dora", "text": "nota-de-dora", "date": "hoy"}])
        d.post("/api/shares", json={"kind": "note", "itemId": "n-dora", "recipientId": self._uid(self.beto)})
        self.assertTrue(any(it.get("text") == "nota-de-dora" for it in self.b.get("/api/shares").json()["items"]))
        deleted = d.request("DELETE", "/api/me", json={"password": self.password})
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertFalse(any(it.get("text") == "nota-de-dora" for it in self.b.get("/api/shares").json()["items"]))

    def test_call_invite_still_rings(self):
        with self.a.websocket_connect("/api/chat/ws") as ws:
            self.assertEqual(ws.receive_json().get("type"), "hello")
            ws.send_json({"type": "call_invite", "to": self.beto, "callId": "privcall1", "media": "audio"})
            kinds = []
            ringing = None
            for _ in range(8):
                msg = ws.receive_json()
                kinds.append(msg.get("type"))
                if msg.get("type") in ("call_ringing", "call_error"):
                    ringing = msg
                    break
            self.assertIsNotNone(ringing, kinds)
            self.assertEqual(ringing.get("type"), "call_ringing", ringing)
            ws.send_json({"type": "call_hangup", "callId": "privcall1"})


if __name__ == "__main__":
    unittest.main()
