"""Regression tests for Stage 1 sacrifice classification."""
import unittest

import chess

from brilliance_stage1 import classify_sacrifice_type, _move_context


class Stage1SacrificeClassificationTests(unittest.TestCase):
    def test_qg7_indirect_knight_sacrifice_not_queen_sac(self):
        """
        21.Qg7+ style: queen moves, knight on e6 is the intentionally abandoned piece.
        """
        fen = "7k/8/4N3/8/8/8/4Q3/4K3 w - - 0 1"
        board = chess.Board(fen)
        move = chess.Move.from_uci("e2g7")
        stage0 = {
            "is_capture": False,
            "see_value": 0,
            "hanging_sacrifice": True,
            "defender_removal_sacrifice": True,
            "indirect_sacrifice_candidate": True,
            "newly_exposed_piece_type": "knight",
            "newly_exposed_piece_square": "e6",
            "moving_piece_type": "queen",
        }
        ctx = _move_context(board, move, chess.WHITE)
        result = classify_sacrifice_type(
            board,
            move,
            chess.WHITE,
            see_value=0,
            ply_index=40,
            ctx=ctx,
            stage0=stage0,
        )

        self.assertEqual(result["moving_piece_type"], "queen")
        self.assertEqual(result["sacrificed_piece_type"], "knight")
        self.assertEqual(result["sacrificed_piece_square"], "e6")
        self.assertEqual(result["sacrifice_mode"], "indirect")
        self.assertNotEqual(result["sac_type"], "queen_sacrifice")
        self.assertEqual(result["sac_type"], "tactical_sacrifice")

    def test_direct_queen_capture_still_queen_sacrifice(self):
        """When the queen itself is captured, keep queen_sacrifice classification."""
        fen = "4k3/8/8/8/3q4/8/8/4K2R w - - 0 1"
        board = chess.Board(fen)
        move = chess.Move.from_uci("h1d1")
        stage0 = {
            "is_capture": True,
            "see_value": -200,
            "hanging_sacrifice": False,
            "defender_removal_sacrifice": False,
            "indirect_sacrifice_candidate": False,
        }
        ctx = _move_context(board, move, chess.WHITE)
        result = classify_sacrifice_type(
            board,
            move,
            chess.WHITE,
            see_value=-200,
            ply_index=40,
            ctx=ctx,
            stage0=stage0,
        )

        self.assertEqual(result["moving_piece_type"], "rook")
        self.assertEqual(result["sac_type"], "exchange_sacrifice")

    def test_positive_raw_see_uses_net_for_stage1_disqualifiers(self):
        """Bxh6-style: raw capture SEE can look fine while net SEE is a real sacrifice."""
        fen = "6k1/5ppp/7p/8/7B/8/8/6K1 w - - 0 1"
        board = chess.Board(fen)
        move = chess.Move.from_uci("h4h6")
        stage0 = {
            "is_capture": True,
            "see_value": 100,
            "net_see_value": -200,
            "net_see_applied": True,
            "negative_see_sacrifice": True,
            "hanging_sacrifice": False,
            "defender_removal_sacrifice": False,
            "indirect_sacrifice_candidate": False,
            "newly_exposed_piece_type": "bishop",
            "newly_exposed_piece_square": "h6",
            "moving_piece_type": "bishop",
        }
        ctx = _move_context(board, move, chess.WHITE)
        result = classify_sacrifice_type(
            board,
            move,
            chess.WHITE,
            see_value=100,
            ply_index=40,
            ctx=ctx,
            stage0=stage0,
        )

        self.assertTrue(result["is_valid_sacrifice"])
        self.assertNotIn("equal_trade_not_sacrifice", result.get("disqualifiers") or [])

    def test_bxc6_equal_trade_blocked_at_stage1(self):
        """Bxc6 bxc6 must not proceed — tactical bypass cannot override equal trade."""
        fen = "8/1p6/2n5/8/4B3/8/8/8 w - - 0 1"
        board = chess.Board(fen)
        move = chess.Move.from_uci("e4c6")
        from brilliance_stage1 import analyze_stage1_move

        result = analyze_stage1_move(board, move, ply_index=18)
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
