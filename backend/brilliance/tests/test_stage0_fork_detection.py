"""Stage 0 opponent-fork and fork-escape abandonment tests (no engine)."""
import unittest

import chess

from brilliance_stage0 import (
    analyze_sacrifice_exposure,
    find_opponent_forks,
    is_sacrifice_candidate,
)


class Stage0ForkDetectionTests(unittest.TestCase):
    def test_detects_knight_fork_on_two_rooks(self):
        fen = "6k1/8/8/8/8/6n1/8/5RKR w - - 0 20"
        board = chess.Board(fen)
        forks = find_opponent_forks(board, chess.WHITE)
        self.assertEqual(len(forks), 1)
        self.assertEqual(set(forks[0]["target_squares"]), {"f1", "h1"})
        self.assertEqual(forks[0]["attacker_square"], "g3")

    def test_rd1_escaping_fork_abandons_other_rook_not_sacrifice(self):
        fen = "6k1/8/8/8/8/6n1/8/5RKR w - - 0 20"
        board = chess.Board(fen)
        move = chess.Move.from_uci("f1d1")

        exposure = analyze_sacrifice_exposure(board, move, chess.WHITE)
        self.assertTrue(exposure.get("fork_escape_abandonment"))
        self.assertEqual(exposure.get("verified_sacrifice_pieces"), [])

        h1_audit = next(
            (a for a in exposure.get("sacrifice_piece_audit", []) if a["square"] == "h1"),
            None,
        )
        self.assertIsNotNone(h1_audit)
        self.assertEqual(h1_audit["reason"], "fork_escape_abandonment")

        sac = is_sacrifice_candidate(board, move, chess.WHITE, ply_index=37)
        self.assertFalse(sac["is_sacrifice_candidate"])
        self.assertFalse(sac["proceed_to_stage1"])
        self.assertFalse(sac.get("hanging_sacrifice"))


if __name__ == "__main__":
    unittest.main()
