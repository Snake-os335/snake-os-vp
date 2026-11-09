"""Doga Gorilla: la página se sirve con el ?v= REAL de cada estático.

Motivo: Cloudflare reescribe el Cache-Control de los estáticos a «max-age=14400»
(4 horas). Mientras la página pedía `?v=2026.31`, el navegador se quedaba con el
motor viejo aunque el deploy fuese nuevo (los cambios «no llegaban al navegador»).
Igual que main.py con index.html, doga_gorilla.py reescribe doga-gorilla.html y le
pone a cada `/static/...` el token del archivo (sha1 de ruta+mtime+tamaño): si el
archivo cambia, cambia la URL y no hay copia vieja que valga.

Ejecutar: python3 -m unittest tests.test_doga_gorilla_cache
"""
import hashlib
import os
import re
import sys
import types
import unittest
from pathlib import Path

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


def _stub_fastapi() -> None:
    """Sin fastapi instalado, se pone un apaño mínimo: aquí solo se prueban funciones puras."""
    try:
        import fastapi  # noqa: F401
        return
    except ImportError:
        pass
    fastapi = types.ModuleType("fastapi")

    class APIRouter:
        def __init__(self, *a, **k):
            pass

        def get(self, *a, **k):
            def deco(fn):
                return fn
            return deco

    class Request:  # pragma: no cover - solo para las firmas
        pass

    class Response:
        def __init__(self, *a, **k):
            pass

    fastapi.APIRouter = APIRouter
    fastapi.Request = Request
    fastapi.Response = Response
    responses = types.ModuleType("fastapi.responses")

    class HTMLResponse:
        def __init__(self, content="", media_type=None, headers=None):
            self.body = content
            self.media_type = media_type
            self.headers = headers or {}

    responses.HTMLResponse = HTMLResponse
    fastapi.responses = responses
    sys.modules["fastapi"] = fastapi
    sys.modules["fastapi.responses"] = responses


_stub_fastapi()

import doga_gorilla as dg  # noqa: E402

TOKEN_RE = r"[0-9a-f]{10}"


class TestPageAssetTokens(unittest.TestCase):
    def setUp(self):
        self.html = dg._render_page()

    def test_page_se_sirve(self):
        self.assertTrue(self.html, "la página se lee del disco")
        self.assertEqual(self.html.count("</html>"), 1, "un solo cierre de documento")

    def test_scripts_llevan_el_token_real(self):
        for f in dg._ENGINE:
            pat = re.compile(r'src="/static/%s\?v=(%s)"' % (re.escape(f), TOKEN_RE))
            m = pat.search(self.html)
            self.assertIsNotNone(m, f + " lleva ?v=<token>")
            self.assertEqual(m.group(1), dg._asset_token(f),
                             "el ?v= es el token real del archivo")

    def test_no_quedan_tokens_a_mano(self):
        self.assertNotIn("?v=2026.31", self.html, "ya no hay ?v= escrito a mano")
        self.assertNotIn("?v=auto", self.html, "el marcador se sustituye al servir")

    def test_token_cambia_con_el_archivo(self):
        rel = "doga-gorilla.js"
        st = (Path(ROOT) / rel).stat()
        esperado = hashlib.sha1(f"{rel}:{st.st_mtime_ns}:{st.st_size}".encode()).hexdigest()[:10]
        self.assertEqual(dg._asset_token(rel), esperado,
                         "el token es sha1(ruta+mtime+tamaño): cambia al cambiar el archivo")
        self.assertNotEqual(dg._asset_token(rel), dg._asset_token("doga-gorilla-page.js"),
                            "cada archivo tiene su token")

    def test_firma_del_motor(self):
        sig = dg._assets_sig()
        self.assertRegex(sig, r"^[0-9a-f]{8}$")
        self.assertIn(dg._asset_token("doga-gorilla.js"), self.html)
        self.assertIn(dg._asset_token("doga-gorilla-page.js"), self.html)

    def test_cache_en_memoria(self):
        self.assertEqual(dg._render_page(), dg._render_page(), "se cachea y no cambia")
        self.assertIsNotNone(dg._page_cache["key"])

    def test_estado_del_juego_dice_el_look(self):
        src = (Path(ROOT) / "doga_gorilla.py").read_text(encoding="utf-8")
        self.assertIn('"look": "pixel"', src, "el estado dice que el look es pixelado")
        self.assertIn('"build": _assets_sig()', src, "el estado trae la firma del motor")
        self.assertIn("_STATIC_REF_RE", src, "la página se reescribe con el token")


if __name__ == "__main__":
    unittest.main()
