"""Distrito durante la llamada. No usa red, GPS ni cuentas reales."""

import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import call_district as cd


def snap(status="active"):
    return {
        "id": "cdemo1234",
        "status": status,
        "caller_id": 7,
        "callee_id": 8,
    }


class TestNormalize(unittest.TestCase):
    def test_accepts_a_short_name(self):
        self.assertEqual(cd.normalize_district("  Salamanca "), "Salamanca")

    def test_rejects_street_and_coordinates(self):
        self.assertIsNone(cd.normalize_district("Calle Mayor"))
        self.assertIsNone(cd.normalize_district("40.4168"))
        self.assertIsNone(cd.normalize_district("Centro 4"))
        self.assertIsNone(cd.normalize_district("https://maps.example/x"))

    def test_city_text_is_not_relabelled_as_detected(self):
        self.assertEqual(cd.normalize_district("Madrid"), "Madrid")
        payload = cd.public_payload("cdemo1234", shared=True, reason="indicado", district="Madrid")
        self.assertEqual(payload["reason"], "indicado")
        self.assertNotIn("municipio", payload)
        self.assertNotIn("detected", payload)
        self.assertNotIn("lat", payload)


class TestShare(unittest.TestCase):
    def test_only_active_call_and_only_the_typed_text(self):
        board = cd.CallDistricts()
        self.assertIsNone(board.share(snap("ringing"), 7, True, "Salamanca"))
        self.assertEqual(board.stored("cdemo1234"), {})
        payload = board.share(snap(), 7, True, "Salamanca")
        self.assertEqual(payload["district"], "Salamanca")
        self.assertEqual(set(payload), {"type", "callId", "shared", "reason", "district"})
        self.assertEqual(board.stored("cdemo1234"), {7: "Salamanca"})

    def test_no_consent_and_invalid_text_share_nothing(self):
        board = cd.CallDistricts()
        off = board.share(snap(), 8, False, "Salamanca")
        self.assertEqual(off["reason"], "no_compartido")
        self.assertNotIn("district", off)
        bad = board.share(snap(), 8, True, "Calle Mayor")
        self.assertEqual(bad["reason"], "no_disponible")
        self.assertNotIn("district", bad)
        self.assertEqual(board.stored("cdemo1234"), {})

    def test_stranger_and_withdraw(self):
        board = cd.CallDistricts()
        self.assertIsNone(board.share(snap(), 99, True, "Centro"))
        board.share(snap(), 7, True, "Centro")
        gone = board.withdraw("cdemo1234")
        self.assertEqual(gone["reason"], "retirado")
        self.assertNotIn("district", gone)
        self.assertEqual(board.stored("cdemo1234"), {})

    def test_incoming_coordinates_are_ignored(self):
        board = cd.CallDistricts()

        class Msg(dict):
            pass

        msg = Msg(callId="cdemo1234", consent=True, district="Retiro", lat=40.4, lng=-3.7)
        sent = []

        async def get_snap(call_id):
            return snap()

        async def send_to_user(uid, payload):
            sent.append((uid, payload))

        import asyncio
        asyncio.run(cd.handle_ws(7, msg, get_snap, send_to_user, board))
        self.assertEqual(sent[0][0], 8)
        self.assertNotIn("lat", sent[0][1])
        self.assertNotIn("lng", sent[0][1])
        self.assertEqual(sent[0][1]["district"], "Retiro")
        blob = str(board.stored("cdemo1234"))
        self.assertNotIn("40.4", blob)


if __name__ == "__main__":
    unittest.main()
