"""Doga Tag VR: el servidor sirve la carpeta del juego con el ?v= REAL de cada archivo.

Motivo: Cloudflare reescribe el Cache-Control de los estáticos a «max-age=14400»
(4 horas). Con una URL fija el navegador se queda con el game.js viejo aunque el
deploy sea nuevo. doga_gorilla.py reescribe la página y le pone a cada ./archivo el
token real (sha1 de ruta+mtime+tamaño); los archivos salen por /doga-gorilla/files/
con `immutable` solo cuando el ?v= es el token bueno, y con `no-cache` si no.

Ejecutar: python3 -m unittest tests.test_doga_tag_vr
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


def _stub_fastapi() -> bool:
    """Sin fastapi instalado se pone un apaño mínimo: aquí solo se prueban funciones puras.

    Devuelve True si hubo que poner el apaño (luego se quita de sys.modules para no
    estropear otras pruebas que sí importan fastapi de verdad).
    """
    try:
        import fastapi  # noqa: F401
        return False
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
            self.headers = {}

    class HTTPException(Exception):
        def __init__(self, status_code=500, detail=None):
            super().__init__(detail or status_code)
            self.status_code = status_code
            self.detail = detail

    fastapi.APIRouter = APIRouter
    fastapi.Request = Request
    fastapi.Response = Response
    fastapi.HTTPException = HTTPException
    responses = types.ModuleType("fastapi.responses")

    class HTMLResponse:
        def __init__(self, content="", media_type=None, headers=None):
            self.body = content
            self.media_type = media_type
            self.headers = headers or {}

    class FileResponse:
        def __init__(self, path, media_type=None, headers=None, **kwargs):
            self.path = str(path)
            self.media_type = media_type
            self.headers = headers or {}

    responses.HTMLResponse = HTMLResponse
    responses.FileResponse = FileResponse
    fastapi.responses = responses
    sys.modules["fastapi"] = fastapi
    sys.modules["fastapi.responses"] = responses
    return True


def _load_doga_gorilla():
    """Importa doga_gorilla con el apaño de fastapi solo mientras dura el import."""
    apaño = _stub_fastapi()
    try:
        import doga_gorilla as modulo
    finally:
        if apaño:
            sys.modules.pop("fastapi", None)
            sys.modules.pop("fastapi.responses", None)
    return modulo


dg = _load_doga_gorilla()

TOKEN_RE = r"[0-9a-f]{10}"

# lo que la página pide directamente (con ?v=): el motor, el three del importmap,
# el favicon y el logo. El icono y VRButton.js los carga game.js.
PAGE_REFS = ("game.js", "lib/three.module.js", "assets/favicon-64.png",
             "assets/doganiero-logo.png")


class TestPagina(unittest.TestCase):
    def setUp(self):
        self.html = dg._render_page()

    def test_pagina_se_sirve(self):
        self.assertTrue(self.html, "la página se lee de disco")
        self.assertEqual(self.html.count("</html>"), 1, "un solo cierre de documento")

    def test_no_quedan_rutas_relativas(self):
        self.assertNotIn('"./game.js"', self.html, "./game.js pasa por /doga-gorilla/files/")
        self.assertNotIn('"./lib/three.module.js"', self.html, "el importmap también se reescribe")
        self.assertNotIn('"./assets/favicon-64.png"', self.html, "el favicon también")

    def test_cada_archivo_lleva_su_token(self):
        # el icono (doganiero-icon.png) y VRButton.js los carga game.js, no la página
        for rel in PAGE_REFS:
            pat = re.compile(r'/doga-gorilla/files/%s\?v=(%s)' % (re.escape(rel), TOKEN_RE))
            m = pat.search(self.html)
            self.assertIsNotNone(m, rel + " lleva su ?v=<token>")
            self.assertEqual(m.group(1), dg._asset_token(rel),
                             "el ?v= es el token real del archivo")

    def test_el_icono_lo_carga_el_motor(self):
        juego = (Path(ROOT) / "doga-tag-vr" / "game.js").read_text(encoding="utf-8")
        self.assertIn("'./assets/doganiero-icon.png'", juego, "el motor carga el icono")
        self.assertTrue(dg._asset_token("assets/doganiero-icon.png"), "el icono existe")

    def test_importmap_apunta_al_three_del_juego(self):
        self.assertIn('"three":"/doga-gorilla/files/lib/three.module.js?v=', self.html,
                      "el importmap pide el three del propio juego, con token")

    def test_token_del_archivo(self):
        rel = "game.js"
        st = (Path(ROOT) / "doga-tag-vr" / rel).stat()
        esperado = hashlib.sha1(f"{rel}:{st.st_mtime_ns}:{st.st_size}".encode()).hexdigest()[:10]
        self.assertEqual(dg._asset_token(rel), esperado,
                         "el token es sha1(ruta+mtime+tamaño): cambia al cambiar el archivo")
        self.assertNotEqual(dg._asset_token("game.js"), dg._asset_token("lib/three.module.js"),
                            "cada archivo tiene su token")

    def test_firma_del_juego(self):
        sig = dg._assets_sig()
        self.assertRegex(sig, r"^[0-9a-f]{8}$")
        # la firma es el sha1 de los tokens de todos los archivos, VRButton.js incluido
        rels = list(dg._ENGINE) + list(dg._ASSETS)
        esperado = hashlib.sha1(":".join(dg._asset_token(f) for f in rels).encode()).hexdigest()[:8]
        self.assertEqual(sig, esperado, "la firma cubre todos los archivos del juego")
        self.assertIn("lib/VRButton.js", rels, "lib/VRButton.js cuenta en la firma")
        for rel in PAGE_REFS:
            self.assertIn(dg._asset_token(rel), self.html, "la página pide " + rel)

    def test_cache_en_memoria(self):
        self.assertEqual(dg._render_page(), dg._render_page(), "se cachea y no cambia")
        self.assertIsNotNone(dg._page_cache["key"])

    def test_pagina_sin_cache(self):
        resp = dg._page_response()
        self.assertIn("no-store", resp.headers["Cache-Control"],
                      "la página no se cachea: los cambios llegan siempre")
        self.assertEqual(resp.headers["Cloudflare-CDN-Cache-Control"], "no-store")


class TestRutasSeguras(unittest.TestCase):
    def test_rutas_buenas(self):
        for rel in ("game.js", "lib/three.module.js", "lib/VRButton.js",
                    "assets/favicon-64.png"):
            self.assertEqual(dg._safe_rel(rel), rel)

    def test_no_se_sale_de_la_carpeta(self):
        for rel in ("../main.py", "../../.env", "/etc/passwd", "lib/../../main.py",
                    ".env", "_privado.js", "game.py", "game.js.bak", "", "lib/"):
            self.assertEqual(dg._safe_rel(rel), "", "se rechaza: " + rel)

    def test_extensiones(self):
        self.assertEqual(dg._safe_rel("index.html"), "", "la página no se sirve como archivo")
        self.assertEqual(dg._safe_rel("assets/doganiero-logo.png"), "assets/doganiero-logo.png")

    def test_404_si_no_existe(self):
        with self.assertRaises(Exception):
            dg._file_response("no-existe.js")
        with self.assertRaises(Exception):
            dg._file_response("../main.py")


class TestCacheDeArchivos(unittest.TestCase):
    def test_inmutable_con_el_token_bueno(self):
        tok = dg._asset_token("game.js")
        resp = dg._file_response("game.js", tok)
        self.assertIn("immutable", resp.headers["Cache-Control"])
        self.assertTrue(resp.media_type.startswith("text/javascript"),
                        "el módulo ES va como javascript: " + str(resp.media_type))

    def test_no_cache_sin_token(self):
        resp = dg._file_response("game.js", "")
        self.assertEqual(resp.headers["Cache-Control"], "no-cache",
                         "sin ?v= el navegador revalida (nunca se queda viejo)")

    def test_png(self):
        resp = dg._file_response("assets/favicon-64.png", dg._asset_token("assets/favicon-64.png"))
        self.assertEqual(resp.media_type, "image/png")
        self.assertIn("immutable", resp.headers["Cache-Control"])


class TestEstado(unittest.TestCase):
    def test_estado_dice_la_version(self):
        self.assertRegex(dg.GAME_VERSION, r"^2026\.\d{2}$", "versión del juego con formato 2026.xx")
        self.assertEqual(dg.GAME_NAME, "Doga Tag VR")
        src = (Path(ROOT) / "doga_gorilla.py").read_text(encoding="utf-8")
        self.assertIn('"build": _assets_sig()', src, "el estado trae la firma del juego")
        self.assertIn('"fileTokens"', src, "el estado trae el token de cada archivo")
        self.assertIn('_REL_REF_RE', src, "la página se reescribe con el token")


if __name__ == "__main__":
    unittest.main()

