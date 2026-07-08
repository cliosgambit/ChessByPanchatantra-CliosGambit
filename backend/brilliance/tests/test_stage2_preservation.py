"""Stage 2 piece-preservation check tests (no engine)."""
import unittest

import chess

from brilliance_stage2 import (
    piece_track_square_after_move,
    preservation_candidate_moves,
    should_skip_preservation_check,
)


class Stage2PreservationTests(unittest.TestCase):
    def test_piece_track_square_when_piece_moves(self):
        fen = "6k1/5pp1/8/8/6B1/8/8/6K1 w - - 0 1"
        board = chess.Board(fen)
        move = chess.Move.from_uci("g4h5")
        sq = chess.parse_square("g4")
        track = piece_track_square_after_move(board, move, sq, chess.WHITE, chess.BISHOP)
        self.assertEqual(track, chess.parse_square("h5"))

    def test_piece_track_square_when_other_piece_moves(self):
        fen = "6k1/5pp1/8/8/6B1/8/8/4K3 w - - 0 1"
        board = chess.Board(fen)
        move = chess.Move.from_uci("e1f1")
        sq = chess.parse_square("g4")
        track = piece_track_square_after_move(board, move, sq, chess.WHITE, chess.BISHOP)
        self.assertEqual(track, chess.parse_square("g4"))

    def test_preservation_candidates_include_defensive_moves(self):
        fen = "6k1/5pp1/8/8/6B1/8/8/4K3 w - - 0 1"
        board = chess.Board(fen)
        sq = chess.parse_square("g4")
        candidates = preservation_candidate_moves(board, sq, chess.WHITE, chess.BISHOP)
        ucis = {m.uci() for m, _ in candidates}
        self.assertIn("e1f1", ucis)
        self.assertTrue(any(m.from_square == sq for m, _ in candidates))

    def test_skip_when_not_already_lost_before(self):
        fen = "6k1/5pp1/8/8/6B1/8/8/6K1 w - - 0 1"
        board = chess.Board(fen)
        move = chess.Move.from_uci("g4h7")
        stage1 = {
            "stage0": {
                "became_lost": True,
                "verified_sacrifice_pieces": [
                    {"square": "h7", "sacrifice_modes": ["tactical_abandonment"]},
                ],
            },
        }
        skip, reason = should_skip_preservation_check(
            board, move, chess.WHITE, stage1
        )
        self.assertTrue(skip)
        self.assertEqual(reason, "not_already_lost_before_heuristic")

    def test_no_skip_when_already_lost_before_heuristic(self):
        fen = "3br3/1r5k/p1p4B/4Pp2/P1qP4/6Q1/6P1/R4R1K w - - 0 29"
        board = chess.Board(fen)
        sq = chess.parse_square("d4")
        from brilliance_stage0 import analyze_piece_vulnerability

        vuln = analyze_piece_vulnerability(board, sq, chess.WHITE)
        self.assertTrue(vuln["already_lost_before_move"])

        move = chess.Move.from_uci("d4d5")
        self.assertTrue(board.is_legal(move))
        skip, reason = should_skip_preservation_check(board, move, chess.WHITE, None)
        self.assertFalse(skip)
        self.assertIsNone(reason)


if __name__ == "__main__":
    unittest.main()
