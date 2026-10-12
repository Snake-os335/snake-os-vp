"""Simulated serial bridge: pending → ack → device reply."""
from __future__ import annotations

import time
from typing import Any, Callable


class FakeBridge:
    """Minimal in-memory stand-in for /api/board/pending, ack, and reply."""

    def __init__(
        self,
        board_items: list[dict[str, Any]],
        on_reply: Callable[[str], None] | None = None,
    ) -> None:
        self.board = board_items
        self.on_reply = on_reply

    def pending(self) -> list[dict[str, Any]]:
        return [
            item
            for item in self.board
            if item.get("who") == "tu" and not item.get("sent")
        ]

    def ack(self, line_id: int) -> None:
        for item in self.board:
            if int(item.get("id") or 0) == int(line_id):
                item["sent"] = True
                item["acked_at"] = time.time()

    def ack_all_pending(self) -> int:
        n = 0
        for item in self.pending():
            self.ack(int(item["id"]))
            n += 1
        return n

    def device_reply(self, text: str) -> None:
        clean = str(text or "").strip()
        if not clean:
            return
        seq = max((int(i.get("id") or 0) for i in self.board), default=0) + 1
        self.board.append(
            {
                "id": seq,
                "who": "mega",
                "text": clean[:4000],
                "sent": True,
                "at": time.time(),
            }
        )
        if self.on_reply:
            self.on_reply(clean)

    def drain_and_ack(self, reply: str | None = None) -> list[str]:
        """Ack every pending line; optionally emit one device reply."""
        texts = [str(i.get("text") or "") for i in self.pending()]
        self.ack_all_pending()
        if reply:
            self.device_reply(reply)
        return texts
