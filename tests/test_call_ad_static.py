"""La URL /static/call-video-ad.js tiene que resolverse con el montaje real de 2026.14.

Live: app.mount("/static", _PublicStaticFiles(directory="."), ...)
La lista blanca solo admite la raíz, assets/ y assets/fonts. Un fichero en
static/call-video-ad.js no se sirve: la carpeta static no está permitida.
"""

import hashlib
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ZIP_MAIN = Path(os.environ.get("SNAKE_202614_MAIN", "/tmp/snake-sources/sources/main.py"))
CLASS_START = "class _PublicStaticFiles(StaticFiles):"
CLASS_END = "\n\n\n# Doganiero Bots"


def _load_class():
    text = ZIP_MAIN.read_text(encoding="utf-8")
    start = text.index(CLASS_START)
    end = text.index(CLASS_END, start)
    from fastapi.staticfiles import StaticFiles
    from starlette.exceptions import HTTPException as StarletteHTTPException
    from urllib.parse import parse_qs

    ns = {
        "StaticFiles": StaticFiles,
        "_StarletteHTTPException": StarletteHTTPException,
        "_asset_token": lambda rel: "lab",
        "parse_qs": parse_qs,
    }
    exec(text[start:end], ns)
    return ns["_PublicStaticFiles"], hashlib.sha256(text[start:end].encode()).hexdigest()


class TestAllowlist(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not ZIP_MAIN.is_file():
            raise unittest.SkipTest("falta main.py 2026.14 en " + str(ZIP_MAIN))
        cls.Files, cls.digest = _load_class()

    def test_root_js_is_public_and_subdir_is_not(self):
        ok = self.Files.is_public
        self.assertTrue(ok("call-video-ad.js"))
        self.assertTrue(ok("doganiero-chat.js"))
        self.assertTrue(ok("assets/doganiero-search-logo.png"))
        self.assertFalse(ok("static/call-video-ad.js"))
        self.assertFalse(ok("main.py"))
        self.assertFalse(ok(".env"))
        self.assertFalse(ok("../main.py"))
        self.assertFalse(ok("data/snakeos.db"))
        self.assertFalse(ok("doganiero-book.js"))
        self.assertNotIn("static", self.Files.ALLOWED_DIRS)

    def test_http_serves_root_js_and_hides_secrets(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        tmp = Path(tempfile.mkdtemp(prefix="ad-static-"))
        self.addCleanup(shutil.rmtree, tmp, True)
        body = (ROOT / "call-video-ad.js").read_text(encoding="utf-8")
        (tmp / "call-video-ad.js").write_text(body, encoding="utf-8")
        (tmp / "static").mkdir()
        (tmp / "static" / "call-video-ad.js").write_text("no-debe-servirse", encoding="utf-8")
        (tmp / "main.py").write_text("secreto", encoding="utf-8")
        (tmp / ".env").write_text("CLAVE=1", encoding="utf-8")

        app = FastAPI()
        app.mount("/static", self.Files(directory=str(tmp)), name="static")
        client = TestClient(app)

        good = client.get("/static/call-video-ad.js")
        self.assertEqual(good.status_code, 200)
        self.assertIn("javascript", good.headers["content-type"])
        self.assertIn("DoganieroCallAd", good.text)
        self.assertEqual(client.get("/static/static/call-video-ad.js").status_code, 404)
        self.assertEqual(client.get("/static/main.py").status_code, 404)
        self.assertEqual(client.get("/static/.env").status_code, 404)
        self.assertNotIn("CLAVE", good.text)


if __name__ == "__main__":
    unittest.main()
