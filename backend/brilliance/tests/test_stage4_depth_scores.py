"""Stage 4 uses deep eval sound + depth span scores from Stage 3."""
import unittest

from brilliance_stage4 import analyze_stage4_move, compute_brilliance_classification


class Stage4DepthScoreTests(unittest.TestCase):
    def test_flat_span_lowers_final_score(self):
        low_span = compute_brilliance_classification(
            2.0, 8.0, 2.0, 0.25, 1, 7,
            deep_eval_sound_score=10.0,
            depth_eval_span_score=0.6,
        )[0]
        high_span = compute_brilliance_classification(
            2.0, 8.0, 2.0, 0.25, 1, 7,
            deep_eval_sound_score=10.0,
            depth_eval_span_score=10.0,
        )[0]
        self.assertGreater(high_span, low_span)

    def test_unsound_deep_eval_lowers_score(self):
        sound = compute_brilliance_classification(
            2.0, 8.0, 2.0, 0.25, 1, 7,
            deep_eval_sound_score=10.0,
            depth_eval_span_score=5.0,
        )[0]
        unsound = compute_brilliance_classification(
            2.0, 8.0, 2.0, 0.25, 1, 7,
            deep_eval_sound_score=3.0,
            depth_eval_span_score=5.0,
        )[0]
        self.assertGreater(sound, unsound)

    def test_brilliant_requires_sound_score_not_binary_flag(self):
        _, _, class_ok, _ = compute_brilliance_classification(
            8.0, 9.0, 8.0, 0.8, 10, 8,
            deep_eval_sound_score=8.0,
            depth_eval_span_score=10.0,
        )
        _, _, class_fail, _ = compute_brilliance_classification(
            8.0, 9.0, 8.0, 0.8, 10, 8,
            deep_eval_sound_score=5.0,
            depth_eval_span_score=10.0,
        )
        self.assertEqual(class_ok, "BRILLIANT")
        self.assertNotEqual(class_fail, "BRILLIANT")

    def test_analyze_move_includes_span_and_sound_in_breakdown(self):
        result = analyze_stage4_move({
            "ply_index": 50,
            "san_move": "Qe4",
            "turn": "white",
            "player_rating": 1800,
            "ev_score": 7,
            "multiplexing_score": 1,
            "rank_at_depth8": 3,
            "non_obvious_score": 0.2,
            "defense_difficulty": 0.25,
            "deep_eval_mover_cp": 167,
            "deep_eval_sound_score": 9.2,
            "depth_eval_span_score": 0.6,
            "depth_eval_span_cp": 6,
            "is_rising_curve": False,
            "game_phase": "middlegame",
        })
        breakdown = result["score_breakdown"]
        self.assertIn("deep_eval_sound_score", breakdown["components"])
        self.assertIn("depth_eval_span_score", breakdown["components"])
        self.assertGreater(breakdown["weighted"]["deep_eval_sound_score"], 0)


if __name__ == "__main__":
    unittest.main()
