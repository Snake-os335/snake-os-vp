"""Tests de regresión de los refuerzos (hardening.py y su uso en main.py).

Ejecutar:  python -m pytest tests/test_hardening.py   (o python -m unittest tests.test_hardening)
La parte de main.py usa una base de datos temporal; nunca toca data/ ni el servidor real.
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
    from fastapi import Body, FastAPI
    from fastapi.testclient import TestClient

    HAS_FASTAPI = True
except (ImportError, RuntimeError):
    HAS_FASTAPI = False

if HAS_FASTAPI:
    import hardening


def _mini_app():
    app = FastAPI()
    hardening.install(app)

    @app.post("/api/echo")
    def echo(data: dict = Body(default={})):
        return {"ok": True}

    @app.get("/api/boom")
    def boom():
        raise RuntimeError("boom")

    @app.get("/api/translate")
    def tr():
        return {"ok": True}

    @app.get("/page")
    def page():
        return {"ok": True}

    return app


@unittest.skipUnless(HAS_FASTAPI, "fastapi no instalado")
class TestOrigin(unittest.TestCase):
    def test_rules(self):
        ok = hardening.origin_allowed
        self.assertTrue(ok("", "x.com", "", ""))
        self.assertFalse(ok("null", "x.com", "", ""))
        self.assertFalse(ok("null", "x.com", "", "cross-site"))
        self.assertTrue(ok("null", "x.com", "", "same-origin"))
        self.assertTrue(ok("https://x.com", "x.com", "", ""))
        self.assertTrue(ok("http://localhost:8000", "localhost:8000", "", ""))
        self.assertTrue(ok("https://snake-os-vp.softportweb.com", "127.0.0.1:8000", "", ""))
        self.assertTrue(ok("https://x.com", "internal:8000", "x.com", ""))
        self.assertTrue(ok("https://evil.example", "x.com", "", "same-origin"))
        self.assertFalse(ok("https://evil.example", "x.com", "", "cross-site"))
        self.assertFalse(ok("https://evil.softportweb.com", "snake-os-vp.softportweb.com", "", "same-site"))
        self.assertFalse(ok("https://evil.example", "x.com", "", ""))


@unittest.skipUnless(HAS_FASTAPI, "fastapi no instalado")
class TestChunked(unittest.TestCase):
    def test_chunked_body_capped(self):
        os.environ["SNAKEOS_MAX_BODY_BYTES"] = "2048"
        try:
            c = TestClient(_mini_app(), raise_server_exceptions=False)
            def gen(n):
                yield b'{"a":"'
                for _ in range(n):
                    yield b"x" * 512
                yield b'"}'
            r = c.post("/api/echo", content=gen(2), headers={"Content-Type": "application/json"})
            self.assertEqual(r.status_code, 200, r.text)  # bajo el tope: pasa
            r = c.post("/api/echo", content=gen(20), headers={"Content-Type": "application/json"})
            self.assertNotEqual(r.status_code, 200)  # sobre el tope: se corta
            r = c.post("/api/echo", json={"a": 1})
            self.assertEqual(r.status_code, 200)
        finally:
            os.environ.pop("SNAKEOS_MAX_BODY_BYTES", None)


@unittest.skipUnless(HAS_FASTAPI, "fastapi no instalado")
class TestMiddleware(unittest.TestCase):
    def setUp(self):
        hardening.RATE.reset()
        os.environ.pop("SNAKEOS_ORIGIN_CHECK", None)
        os.environ.pop("SNAKEOS_MAX_BODY_BYTES", None)
        self.c = TestClient(_mini_app(), raise_server_exceptions=False)

    def test_same_site_post_ok(self):
        r = self.c.post("/api/echo", json={}, headers={"Origin": "http://testserver"})
        self.assertEqual(r.status_code, 200)
        r = self.c.post("/api/echo", json={})
        self.assertEqual(r.status_code, 200)

    def test_cross_site_post_blocked(self):
        r = self.c.post("/api/echo", json={}, headers={"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"})
        self.assertEqual(r.status_code, 403)
        self.assertIn("detail", r.json())

    def test_report_mode(self):
        os.environ["SNAKEOS_ORIGIN_CHECK"] = "report"
        try:
            r = self.c.post("/api/echo", json={}, headers={"Origin": "https://evil.example"})
            self.assertEqual(r.status_code, 200)
        finally:
            os.environ.pop("SNAKEOS_ORIGIN_CHECK", None)

    def test_cross_site_get_ok(self):
        r = self.c.get("/api/translate", headers={"Origin": "https://evil.example"})
        self.assertEqual(r.status_code, 200)

    def test_body_too_big(self):
        os.environ["SNAKEOS_MAX_BODY_BYTES"] = "2048"
        try:
            r = self.c.post("/api/echo", content=b"{" + b" " * 4000 + b"}", headers={"Content-Type": "application/json"})
            self.assertEqual(r.status_code, 413)
            r = self.c.post("/api/echo", json={"a": 1})
            self.assertEqual(r.status_code, 200)
        finally:
            os.environ.pop("SNAKEOS_MAX_BODY_BYTES", None)

    def test_unhandled_is_json_500(self):
        r = self.c.get("/api/boom")
        self.assertEqual(r.status_code, 500)
        self.assertIn("detail", r.json())

    def test_rate_limit(self):
        limit = hardening.rate_rule_for("/api/translate")
        self.assertGreaterEqual(limit, 100)
        h = {"CF-Connecting-IP": "203.0.113.7"}
        for _ in range(limit):
            self.assertEqual(self.c.get("/api/translate", headers=h).status_code, 200)
        r = self.c.get("/api/translate", headers=h)
        self.assertEqual(r.status_code, 429)
        self.assertTrue(r.headers.get("retry-after"))
        # otra IP no se ve afectada
        self.assertEqual(self.c.get("/api/translate", headers={"CF-Connecting-IP": "203.0.113.8"}).status_code, 200)

    def test_non_api_untouched(self):
        r = self.c.get("/page", headers={"Origin": "https://evil.example"})
        self.assertEqual(r.status_code, 200)


@unittest.skipUnless(HAS_FASTAPI, "fastapi no instalado")
class TestFailThrottle(unittest.TestCase):
    def test_blocks_after_failures_and_clears(self):
        t = hardening.FailThrottle(3, 60, "x")
        keys = ["em:a@b.c"]
        for _ in range(3):
            t.check(keys)
            t.fail(keys)
        with self.assertRaises(Exception) as cm:
            t.check(keys)
        self.assertEqual(getattr(cm.exception, "status_code", None), 429)
        t.clear(keys)
        t.check(keys)

    def test_client_ip(self):
        self.assertEqual(hardening.client_ip_from({"cf-connecting-ip": "203.0.113.5"}, "127.0.0.1"), "203.0.113.5")
        self.assertEqual(hardening.client_ip_from({"cf-connecting-ip": "basura"}, "10.0.0.2"), "10.0.0.2")
        self.assertEqual(hardening.client_ip_from({}, ""), "unknown")

    def test_clean_name(self):
        self.assertEqual(hardening.clean_name("  David "), "David")
        with self.assertRaises(Exception):
            hardening.clean_name("x" * (hardening.NAME_MAX + 1))


def _load_main(tmp):
    """Importa main.py con la base de datos en una carpeta temporal."""
    import db

    db.DATA_DIR = Path(tmp)
    db.DB_PATH = Path(tmp) / "snakeos.db"
    for name in ("AVATARS_DIR", "FILES_DIR", "WALLPAPERS_DIR", "BOOK_MEDIA_DIR"):
        if hasattr(db, name):
            setattr(db, name, Path(tmp) / getattr(db, name).name)
    os.environ.setdefault("SNAKEOS_PLACA", "false")
    import main  # noqa: E402

    db.init_db()
    return main


@unittest.skipUnless(HAS_FASTAPI, "fastapi no instalado")
class TestMainEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="snk-harden-")
        try:
            cls.main = _load_main(cls.tmp)
        except Exception as exc:  # dependencias opcionales (piper, numpy...) que falten
            raise unittest.SkipTest(f"main.py no se pudo importar aquí: {type(exc).__name__}: {exc}")
        cls.c = TestClient(cls.main.app, raise_server_exceptions=False)

    def setUp(self):
        hardening.LOGIN_IP_FAILS.reset()
        hardening.LOGIN_EMAIL_FAILS.reset()
        hardening.LOGIN_EMAIL_IP_FAILS.reset()
        hardening.GATE_IP_FAILS.reset()
        hardening.SIGNUP_IP.reset()
        hardening.PASSWORD_USER_FAILS.reset()

    def _signup(self, email, name="Prueba", avatar="🐍", ip="81.200.10.1"):
        return self.c.post("/api/signup", json={"email": email, "name": name, "password": "clave-segura", "avatar": avatar},
                           headers={"CF-Connecting-IP": ip})

    def test_signup_name_cap_and_avatar(self):
        r = self._signup("largo@dogaemail.com", name="x" * 200)
        self.assertEqual(r.status_code, 400)
        r = self._signup("avatar@dogaemail.com", avatar="<img src=x onerror=alert(1)>")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json().get("avatar"), "🐶")
        r = self._signup("emoji@dogaemail.com", avatar="🦊")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json().get("avatar"), "🦊")

    def test_login_lockout(self):
        self.assertEqual(self._signup("login@dogaemail.com", ip="81.200.10.2").status_code, 200)
        h = {"CF-Connecting-IP": "81.200.10.3"}
        ok = self.c.post("/api/login", json={"email": "login@dogaemail.com", "password": "clave-segura"}, headers=h)
        self.assertEqual(ok.status_code, 200)
        for _ in range(hardening.LOGIN_EMAIL_IP_FAILS.limit):
            r = self.c.post("/api/login", json={"email": "login@dogaemail.com", "password": "mal"}, headers=h)
            self.assertEqual(r.status_code, 401)
        r = self.c.post("/api/login", json={"email": "login@dogaemail.com", "password": "clave-segura"}, headers=h)
        self.assertEqual(r.status_code, 429)
        # 2026.14b: el bloqueo es por correo+IP: la misma cuenta desde otra IP sigue entrando
        r = self.c.post("/api/login", json={"email": "login@dogaemail.com", "password": "clave-segura"}, headers={"CF-Connecting-IP": "81.200.10.4"})
        self.assertEqual(r.status_code, 200, r.text)

    def test_login_lockout_not_whole_network(self):
        # 30 fallos de varias cuentas desde una misma IP (colegio/CGNAT) ya no bloquean a toda la red
        self.assertEqual(self._signup("red@dogaemail.com", ip="81.200.10.20").status_code, 200)
        h = {"CF-Connecting-IP": "81.200.10.21"}
        for i in range(30):
            r = self.c.post("/api/login", json={"email": "otro%d@dogaemail.com" % (i % 5), "password": "mal"}, headers=h)
            self.assertIn(r.status_code, (401, 429))
        r = self.c.post("/api/login", json={"email": "red@dogaemail.com", "password": "clave-segura"}, headers=h)
        self.assertEqual(r.status_code, 200, r.text)

    def test_site_session_is_not_os_session(self):
        self.assertEqual(self._signup("sitio@dogaemail.com", ip="81.200.10.30").status_code, 200)
        from auth import start_session, user_from_session
        uid = int(self.main.db.get_user_by_email("sitio@dogaemail.com")["id"])
        site = start_session(uid, kind="site")
        os_sid = start_session(uid)
        self.assertIsNone(user_from_session(site))
        self.assertIsNotNone(user_from_session(site, kind="site"))
        self.assertIsNotNone(user_from_session(os_sid))
        self.assertIsNone(user_from_session(os_sid, kind="site"))
        c2 = TestClient(self.main.app, raise_server_exceptions=False)
        c2.cookies.set("session_id", site)
        self.assertEqual(c2.get("/api/me").status_code, 401)
        c3 = TestClient(self.main.app, raise_server_exceptions=False)
        c3.cookies.set("session_id", os_sid)
        self.assertEqual(c3.get("/api/me").status_code, 200)

    def test_os_gate_non_ascii_and_lockout(self):
        h = {"CF-Connecting-IP": "81.200.10.9"}
        r = self.c.post("/api/os-gate", json={"password": "contraseña-ñ"}, headers=h)
        self.assertEqual(r.status_code, 403)  # antes: 500 (compare_digest con texto no ASCII)
        for _ in range(hardening.GATE_IP_FAILS.limit):
            self.c.post("/api/os-gate", json={"password": "mal"}, headers=h)
        r = self.c.post("/api/os-gate", json={"password": "mal"}, headers=h)
        self.assertEqual(r.status_code, 429)

    def test_cross_site_post_blocked_on_main(self):
        r = self.c.post("/api/login", json={"email": "a@b.c", "password": "x"},
                        headers={"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"})
        self.assertEqual(r.status_code, 403)


if __name__ == "__main__":
    unittest.main()
