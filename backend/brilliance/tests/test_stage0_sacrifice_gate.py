"""Stage 0 sacrifice gate tests."""
import unittest

import chess

from brilliance_stage0 import (
    analyze_sacrifice_exposure,
    is_sacrifice_candidate,
    see,
)


class Stage0SacrificeGateTests(unittest.TestCase):
    def test_bxh6_negative_see_not_suppressed_as_pawn_sac(self):
        """
        Bug #1: piece-for-pawn capture with SEE < -100 must flag sacrifice candidate.
        Old logic treated |SEE|<=200 in opening as pawn gambit for ANY capture.
        """
        fen = "6k1/5pp1/7p/8/7B/8/8/6K1 w - - 0 1"
        board = chess.Board(fen)
        move = chess.Move.from_uci("h4h6")
        result = is_sacrifice_candidate(board, move, chess.WHITE, ply_index=36)

        self.assertLess(result["see_value"], -100)
        self.assertTrue(result["negative_see_sacrifice"])
        self.assertTrue(result["is_sacrifice_candidate"])
        self.assertTrue(result["proceed_to_stage1"])
        self.assertIsNone(result.get("suppression_reason"))

    def test_bxh6_positive_see_uses_net_bishop_sacrifice(self):
        """
        Bug #2: immediate capture SEE can be +pawn while bishop is abandoned.
        Net SEE (raw - mover value) must still pass the gate.
        """
        fen = "6k1/5pp1/7p/8/7B/8/8/6K1 w - - 0 1"
        board = chess.Board(fen)
        move = chess.Move.from_uci("h4h6")

        # Simulate defended landing where raw SEE reads positive but bishop is sac'd
        raw_see = see(board, move)
        result = is_sacrifice_candidate(board, move, chess.WHITE, ply_index=36)

        if raw_see >= -100:
            self.assertTrue(result["net_see_applied"])
            self.assertLess(result["net_see_value"], -100)
        self.assertTrue(result["negative_see_sacrifice"])
        self.assertTrue(result["is_sacrifice_candidate"])

    def test_net_see_when_raw_capture_see_positive(self):
        """Piece-for-pawn: raw SEE +100 still nets to bishop loss when mover >= 300."""
        fen = "6k1/5ppp/7p/8/7B/8/8/6K1 w - - 0 1"
        board = chess.Board(fen)
        move = chess.Move.from_uci("h4h6")

        from brilliance_stage0 import _compute_net_capture_see

        net_info = _compute_net_capture_see(board, move, chess.WHITE, 100)
        self.assertTrue(net_info["net_see_applied"])
        self.assertLess(net_info["net_see_value"], -100)

        result = is_sacrifice_candidate(board, move, chess.WHITE, ply_index=36)
        self.assertTrue(result["negative_see_sacrifice"])
        self.assertTrue(result["is_sacrifice_candidate"])

    def test_net_see_breakdown_fields(self):
        """Net SEE exposes captured/mover pieces and landing metadata for UI."""
        fen = "6k1/5ppp/7p/8/7B/8/8/6K1 w - - 0 1"
        board = chess.Board(fen)
        move = chess.Move.from_uci("h4h6")
        result = is_sacrifice_candidate(board, move, chess.WHITE, ply_index=36)

        self.assertTrue(result["net_see_applied"])
        self.assertEqual(result["captured_piece_type"], "pawn")
        self.assertEqual(result["captured_piece_square"], "h6")
        self.assertEqual(result["moving_piece_type"], "bishop")
        self.assertGreaterEqual(result["moving_piece_value"], 300)
        self.assertEqual(result["moving_piece_landing_square"], "h6")
        self.assertEqual(result["net_see_reason"], "landing_en_prise")
        self.assertTrue(result["landing_en_prise"])
        self.assertEqual(
            result["net_see_value"],
            result["see_value"] - result["moving_piece_value"],
        )

    def test_safe_queen_capture_pawn_not_net_sacrifice(self):
        """Queen takes unprotected pawn with no landing threat is NOT a sacrifice."""
        fen = "4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1"
        board = chess.Board(fen)
        move = chess.Move.from_uci("d1d5")
        result = is_sacrifice_candidate(board, move, chess.WHITE, ply_index=20)

        self.assertFalse(result["net_see_applied"])
        self.assertFalse(result["negative_see_sacrifice"])
        self.assertFalse(result["is_sacrifice_candidate"])
        self.assertFalse(result["proceed_to_stage1"])
        self.assertGreater(result["see_value"], -100)

    def test_sacrifice_piece_audit_lists_all_major_pieces(self):
        """Every friendly piece >= 300cp gets an audit verdict."""
        fen = "4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1"
        board = chess.Board(fen)
        move = chess.Move.from_uci("d1d5")
        result = is_sacrifice_candidate(board, move, chess.WHITE, ply_index=20)
        audit = result.get("sacrifice_piece_audit") or []
        queen_audit = next((a for a in audit if a.get("piece_type") == "queen"), None)
        self.assertIsNotNone(queen_audit)
        self.assertEqual(queen_audit["verdict"], "not_sacrifice")
        self.assertEqual(queen_audit["reason"], "not_en_prise_after")
        self.assertEqual(result.get("verified_sacrifice_pieces"), [])

    def test_rxf5_bishop_becomes_lost_after_profitable_capture(self):
        """
        29.Rxf5: wins pawn (+100 SEE) but bishop on h6 becomes inevitably lost.
        """
        fen = "3br3/1r5k/p1p4B/4Pp2/P1qP4/6Q1/6P1/R4R1K w - - 0 29"
        board = chess.Board(fen)
        move = chess.Move.from_uci("f1f5")
        result = is_sacrifice_candidate(board, move, chess.WHITE, ply_index=56)

        self.assertGreater(result["see_value"], 0)
        self.assertFalse(result["negative_see_sacrifice"])
        verified = result.get("verified_sacrifice_pieces") or []
        bishop = next((p for p in verified if p.get("square") == "h6"), None)
        self.assertIsNotNone(bishop, msg="bishop h6 should verify as tactical abandonment")
        self.assertIn("tactical_abandonment", bishop.get("sacrifice_modes", []))
        self.assertTrue(result["hanging_sacrifice"])
        self.assertTrue(result["is_sacrifice_candidate"])

        audit = result.get("sacrifice_piece_audit") or []
        pawn_d4 = next((a for a in audit if a.get("square") == "d4"), None)
        self.assertIsNotNone(pawn_d4, msg="d4 pawn should appear in audit")
        self.assertEqual(pawn_d4["verdict"], "not_sacrifice")
        self.assertEqual(pawn_d4["reason"], "already_lost_before_move")

    def test_mover_landing_included_in_exposure(self):
        """Capture landing on to_sq must be scanned even when to_sq held enemy pawn."""
        fen = "6k1/5ppp/7p/8/7B/8/8/6K1 w - - 0 1"
        board = chess.Board(fen)
        move = chess.Move.from_uci("h4h6")
        exposure = analyze_sacrifice_exposure(board, move, chess.WHITE)

        self.assertEqual(exposure.get("newly_exposed_piece_type"), "bishop")
        self.assertGreaterEqual(exposure.get("newly_exposed_piece_value", 0), 300)


if __name__ == "__main__":
    unittest.main()
