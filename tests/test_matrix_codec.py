import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TESTS = os.path.dirname(__file__)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
if TESTS not in sys.path:
    sys.path.insert(0, TESTS)

import matrix_codec as mc
from fake_bridge import FakeBridge


class TestRowsHex(unittest.TestCase):
    def test_rows_to_hex_and_back(self):
        rows = [0x81, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x81]
        hx = mc.rows_to_hex(rows)
        self.assertEqual(len(hx), 16)
        self.assertEqual(mc.hex_to_rows(hx), rows)

    def test_bit7_is_left_column(self):
        rows = mc.grid_lines_to_rows(["#.......", "........"] * 4)
        self.assertEqual(rows[0], 0x80)
        self.assertEqual(rows[1], 0)

    def test_grid_roundtrip(self):
        grid = [
            "........",
            "..####..",
            ".#....#.",
            ".#....#.",
            ".#....#.",
            ".#....#.",
            "..####..",
            "........",
        ]
        rows = mc.grid_lines_to_rows(grid)
        self.assertEqual(mc.rows_to_grid_lines(rows), grid)


class TestProtocolLines(unittest.TestCase):
    def test_fixed_frame_line_length(self):
        line = mc.encode_fixed_frame_line([0] * 8)
        self.assertTrue(line.startswith("~m f "))
        self.assertLessEqual(len(line), mc.MAX_LINE_LEN)

    def test_32_frames_four_lines(self):
        frames = [{"rows": [i & 0xFF] * 8, "ms": 100} for i in range(32)]
        lines = mc.encode_animation_lines(job=7, frames=frames, loop=True)
        self.assertEqual(len(lines), 4)
        for line in lines:
            self.assertLessEqual(len(line), mc.MAX_LINE_LEN)
            self.assertTrue(line.startswith("~m A 7 "))
        self.assertTrue(lines[0].startswith("~m A 7 0 32 1 "))
        self.assertIn(" 24 32 1 ", lines[3])

    def test_idx0_resets_on_first_chunk(self):
        frames = [{"rows": [1] * 8, "ms": 50} for _ in range(9)]
        lines = mc.encode_animation_lines(job=1, frames=frames, loop=False)
        self.assertEqual(lines[0].split()[3], "0")
        self.assertEqual(lines[1].split()[3], "8")

    def test_apply_frame_kind(self):
        lines = mc.encode_apply_lines(
            3,
            "frame",
            [{"rows": [0xFF] * 8, "ms": 0}],
            loop=False,
            brightness=10,
        )
        self.assertEqual(lines[0], "~m b 10")
        self.assertTrue(lines[1].startswith("~m f "))


class TestHiReply(unittest.TestCase):
    def test_parse_hi(self):
        hi = mc.parse_hi_reply("~m hi 1 8x8")
        self.assertIsNotNone(hi)
        self.assertEqual(hi["version"], 1)
        self.assertEqual(hi["size"], "8x8")

    def test_parse_hi_rejects_garbage(self):
        self.assertIsNone(mc.parse_hi_reply("~m ok f"))


class TestRejections(unittest.TestCase):
    def test_bad_hex(self):
        with self.assertRaises(ValueError):
            mc.hex_to_rows("zzzzzzzzzzzzzzzz")

    def test_bad_row_count(self):
        with self.assertRaises(ValueError):
            mc.rows_to_hex([0, 1, 2])

    def test_bad_row_range(self):
        with self.assertRaises(ValueError):
            mc.rows_to_hex([256] + [0] * 7)

    def test_frame_kind_requires_one_frame(self):
        with self.assertRaises(ValueError):
            mc.encode_apply_lines(1, "frame", [], loop=False)


class TestFakeBridge(unittest.TestCase):
    def test_pending_ack_reply(self):
        board: list = []
        replies: list[str] = []

        def on_reply(text: str) -> None:
            replies.append(text)

        bridge = FakeBridge(board, on_reply=on_reply)
        board.append({"id": 1, "who": "tu", "text": "~m ?", "sent": False, "at": 0.0})
        self.assertEqual(len(bridge.pending()), 1)
        texts = bridge.drain_and_ack("~m hi 1 8x8")
        self.assertEqual(texts, ["~m ?"])
        self.assertEqual(replies, ["~m hi 1 8x8"])
        self.assertEqual(len(bridge.pending()), 0)


if __name__ == "__main__":
    unittest.main()
