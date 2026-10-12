import os
import sys
import time
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TESTS = os.path.dirname(__file__)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
if TESTS not in sys.path:
    sys.path.insert(0, TESTS)

import matrix_api
import matrix_codec as mc
from fake_bridge import FakeBridge

try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    HAS_FASTAPI = True
except (ImportError, RuntimeError):
    HAS_FASTAPI = False
    FastAPI = None  # type: ignore
    TestClient = None  # type: ignore


class TestMatrixHooks(unittest.TestCase):
    def setUp(self):
        matrix_api._matrix_job.update(
            {
                "id": 0,
                "user_id": 0,
                "status": "idle",
                "kind": "",
                "lines": [],
                "expected_cmd": "",
                "error": "",
                "at": 0.0,
                "all_sent_at": 0.0,
            }
        )

    def test_on_board_reply_marks_done(self):
        with matrix_api._matrix_lock:
            matrix_api._matrix_job.update(
                {
                    "id": 5,
                    "user_id": 1,
                    "status": "sending",
                    "expected_cmd": "f",
                    "lines": ["~m f " + "00" * 8],
                    "at": time.time(),
                }
            )
        matrix_api.on_board_reply("~m ok f")
        self.assertEqual(matrix_api._matrix_job["status"], "done")

    def test_on_board_err(self):
        with matrix_api._matrix_lock:
            matrix_api._matrix_job["id"] = 2
            matrix_api._matrix_job["status"] = "sending"
        matrix_api.on_board_reply("~m err hex")
        self.assertEqual(matrix_api._matrix_job["status"], "error")
        self.assertEqual(matrix_api._matrix_job["error"], "hex")

    def test_purge_unsent_matrix(self):
        board = [
            {"id": 1, "who": "tu", "text": "~m f aa", "sent": False},
            {"id": 2, "who": "tu", "text": "keep-me", "sent": False},
            {"id": 3, "who": "tu", "text": "~m c", "sent": True},
        ]
        matrix_api._purge_unsent_matrix(board)
        texts = [b["text"] for b in board]
        self.assertIn("keep-me", texts)
        self.assertIn("~m c", texts)
        self.assertNotIn("~m f aa", texts)

    def test_public_status_ages(self):
        board: list = []
        matrix_api.note_bridge_poll()
        matrix_api.on_board_reply("~m hi 1 8x8")
        st = matrix_api._public_status(board)
        self.assertIsNotNone(st["bridge_age_s"])
        self.assertIsNotNone(st["device_age_s"])
        self.assertTrue(st["device_matrix"]["supports_custom"])
        self.assertEqual(st["device_matrix"]["size"], "8x8")
        self.assertEqual(st["channel"], "snake-os-lite")


@unittest.skipUnless(HAS_FASTAPI, "fastapi not installed")
class TestMatrixHttp(unittest.TestCase):
    def setUp(self):
        matrix_api._matrix_job.update(
            {
                "id": 0,
                "user_id": 0,
                "status": "idle",
                "kind": "",
                "lines": [],
                "expected_cmd": "",
                "error": "",
                "at": 0.0,
                "all_sent_at": 0.0,
            }
        )
        self.board: list = []
        self.queued: list[str] = []

        def queue_line(text: str) -> None:
            self.queued.append(text)
            self.board.append(
                {
                    "id": len(self.board) + 1,
                    "who": "tu",
                    "text": text,
                    "sent": False,
                    "at": time.time(),
                }
            )

        def require_user():
            return {"id": 42}

        router = matrix_api.build_router(
            require_user=require_user,
            queue_board_line=queue_line,
            board_items=self.board,
            throttle_check=lambda _u: None,
            resolve_key=lambda _u: "k",
        )
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)
        self.bridge = FakeBridge(self.board, on_reply=matrix_api.on_board_reply)

    def test_apply_frame_endpoint(self):
        r = self.client.post(
            "/api/matrix/apply",
            json={
                "kind": "frame",
                "frames": [{"rows": [255] * 8, "ms": 100}],
                "loop": False,
            },
        )
        self.assertEqual(r.status_code, 200)
        job = r.json()["id"]
        self.assertTrue(any(l.startswith("~m f ") for l in self.queued))
        self.bridge.ack_all_pending()
        matrix_api.on_board_reply("~m ok f")
        st = self.client.get(f"/api/matrix/status?job={job}")
        self.assertEqual(st.json()["status"], "done")

    def test_apply_accepts_bitmap_alias(self):
        r = self.client.post(
            "/api/matrix/apply",
            json={
                "kind": "bitmap",
                "frames": [{"rows": [0] * 8, "ms": 100}],
                "loop": False,
            },
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(any(l.startswith("~m f ") for l in self.queued))

    def test_apply_bitmap_multi_frame_is_animation(self):
        self.queued.clear()
        r = self.client.post(
            "/api/matrix/apply",
            json={
                "kind": "bitmap",
                "frames": [
                    {"rows": [0x80] + [0] * 7, "ms": 100},
                    {"rows": [0] * 7 + [0x80], "ms": 100},
                ],
                "loop": True,
            },
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(any(l.startswith("~m A ") for l in self.queued))

    def test_clear_endpoint(self):
        self.board.append(
            {"id": 1, "who": "tu", "text": mc.encode_clear_line(), "sent": False, "at": 0.0}
        )
        r = self.client.post("/api/matrix/clear", json={})
        self.assertEqual(r.status_code, 200)
        pending = [i for i in self.board if i["who"] == "tu" and not i["sent"]]
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]["text"], mc.encode_clear_line())


if __name__ == "__main__":
    unittest.main()
