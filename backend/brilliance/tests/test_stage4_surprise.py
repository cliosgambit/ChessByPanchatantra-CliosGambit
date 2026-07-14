"""Stage 4 recommended surprise formula tests."""
import unittest

from brilliance_stage4 import rating_relative_surprise


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


if __name__ == "__main__":
    unittest.main()
