"""Stage 4 recommended surprise formula tests."""
import unittest

from brilliance_stage4 import (
    _is_low_rated_pawn_sacrifice,
    analyze_stage4_move,
    rating_relative_surprise,
)


class Stage4SurpriseFormulaTests(unittest.TestCase):
    def test_user_example_formula(self):
        """1 − (2/5 × 2/19 × 0.2 + 0.15×2), scaled ×10."""
        result = rating_relative_surprise(
            player_rating=1800,
            ev_score=2,
            rank_at_d8=3,
            good_moves_top5=2,
            legal_moves=20,
        )
        inner = (2 / 5) * (2 / 19) * 0.2 + 0.15 * 2
        self.assertAlmostEqual(result["inner_sum"], round(inner, 3), places=3)
        self.assertAlmostEqual(result["surprise_unit"], round(1.0 - inner, 3), places=3)
        self.assertAlmostEqual(result["surprise_score"], round((1.0 - inner) * 10.0, 2), places=2)

    def test_rank_one_zeroes_engine_term(self):
        result = rating_relative_surprise(
            player_rating=1800,
            ev_score=0,
            rank_at_d8=1,
            good_moves_top5=3,
            legal_moves=20,
        )
        self.assertEqual(result["engine_term"], 0.0)
        self.assertEqual(result["surprise_score"], 10.0)

    def test_more_good_moves_lowers_surprise(self):
        few_good = rating_relative_surprise(
            1800, 0, 3, good_moves_top5=1, legal_moves=20
        )["surprise_score"]
        many_good = rating_relative_surprise(
            1800, 0, 3, good_moves_top5=5, legal_moves=20
        )["surprise_score"]
        self.assertGreater(few_good, many_good)

    def test_outside_top_five_uses_legal_moves_as_rank(self):
        result = rating_relative_surprise(
            player_rating=1800,
            ev_score=0,
            rank_at_d8=99,
            good_moves_top5=1,
            legal_moves=20,
        )
        self.assertAlmostEqual(result["rank_ratio"], 1.0)

    def test_low_rated_pawn_sacrifice_blocked(self):
        self.assertTrue(
            _is_low_rated_pawn_sacrifice(
                {
                    "player_rating": 1800,
                    "sacrificed_piece_type": "pawn",
                }
            )
        )
        self.assertFalse(
            _is_low_rated_pawn_sacrifice(
                {
                    "player_rating": 2200,
                    "sacrificed_piece_type": "pawn",
                }
            )
        )

    def test_analyze_stage4_demotes_low_rated_pawn_brilliant(self):
        result = analyze_stage4_move(
            {
                "ply_index": 20,
                "san_move": "e5",
                "turn": "white",
                "player_rating": 1700,
                "sac_type": "real_sacrifice",
                "sacrificed_piece_type": "pawn",
                "moving_piece_type": "pawn",
                "sacrifice_mode": "direct",
                "ev_score": 4,
                "rank_at_depth8": 4,
                "good_moves_top5": 1,
                "legal_moves": 30,
                "non_obvious_score": 9,
                "defense_difficulty": 8,
                "multiplexing_score": 7,
                "deep_eval_mover_cp": 200,
                "deep_eval_sound_score": 8,
                "depth_eval_span_score": 7,
            }
        )
        self.assertTrue(result["blocked_low_rated_pawn_sacrifice"])
        self.assertFalse(result["is_brilliant"])
        self.assertNotEqual(result["classification"], "BRILLIANT")


if __name__ == "__main__":
    unittest.main()
