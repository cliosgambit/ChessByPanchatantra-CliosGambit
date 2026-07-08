"""Stage 3 depth eval span — scored in Stage 4, not a hard gate."""
import unittest

from brilliance_stage3 import (
    apply_stage3_gate,
    deep_eval_sound_score,
    depth_eval_span_score,
    is_depth_eval_span_acceptable,
)


def _feats(*, span, rising=False, sound=True, near_best=True):
    mover_d18 = 100
    return {
        "depth_evals_mover": {"1": mover_d18 + span, "18": mover_d18},
        "depth_eval_span_cp": span,
        "is_rising_curve": rising,
        "is_sound": sound,
        "is_near_best_deep": near_best,
        "deep_eval_sound_score": deep_eval_sound_score(mover_d18 if sound else -80),
        "depth_eval_span_score": depth_eval_span_score(span, rising),
        "is_depth_eval_span_acceptable": is_depth_eval_span_acceptable(
            {"depth_evals_mover": {"1": mover_d18 + span, "18": mover_d18}, "is_rising_curve": rising}
        ),
    }


class Stage3DepthSpanGateTests(unittest.TestCase):
    def test_qe4_style_flat_curve_still_proceeds_to_stage4(self):
        """d1/d18 span 6cp — telemetry only; CPL gate is the only hard stop."""
        feats = _feats(span=6)
        gate = apply_stage3_gate(feats)
        self.assertTrue(gate["proceed_to_stage4"])
        self.assertNotIn("depth_eval_span_too_narrow", gate.get("unsound_reasons") or [])
        self.assertLess(feats["depth_eval_span_score"], 1.0)

    def test_unsound_deep_eval_does_not_block_stage4(self):
        feats = _feats(span=120, sound=False, near_best=True)
        gate = apply_stage3_gate(feats)
        self.assertTrue(gate["proceed_to_stage4"])
        self.assertNotIn("deep_eval_below_threshold", gate.get("unsound_reasons") or [])

    def test_cpl_deep_still_blocks(self):
        feats = _feats(span=120, near_best=False)
        gate = apply_stage3_gate(feats)
        self.assertFalse(gate["proceed_to_stage4"])
        self.assertIn("cpl_deep_too_high", gate["unsound_reasons"])

    def test_rising_curve_span_score_max(self):
        self.assertEqual(depth_eval_span_score(6, True), 10.0)

    def test_large_span_score_high(self):
        self.assertGreaterEqual(depth_eval_span_score(120, False), 10.0)


if __name__ == "__main__":
    unittest.main()
