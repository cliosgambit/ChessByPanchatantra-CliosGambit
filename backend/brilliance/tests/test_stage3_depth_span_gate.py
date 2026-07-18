"""Stage 3 depth eval span — scored in Stage 4, not a hard gate."""
import unittest

from brilliance_stage3 import (
    apply_stage3_gate,
    deep_eval_sound_score,
    depth_eval_span_score,
    is_depth_eval_span_acceptable,
)


def _feats(
    *,
    span,
    rising=False,
    sound=True,
    near_best=True,
    cpl_deep=None,
    rank_at_depth22=99,
    non_obvious_score=0,
    depth_gain=0,
    rank_jump=0,
):
    mover_d18 = 100
    if cpl_deep is None:
        cpl_deep = 0 if near_best else 200
    return {
        "depth_evals_mover": {"1": mover_d18 + span, "18": mover_d18},
        "depth_eval_span_cp": span,
        "is_rising_curve": rising,
        "is_sound": sound,
        "is_near_best_deep": near_best,
        "cpl_deep": cpl_deep,
        "rank_at_depth22": rank_at_depth22,
        "non_obvious_score": non_obvious_score,
        "depth_gain": depth_gain,
        "rank_jump": rank_jump,
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
        feats = _feats(span=120, near_best=False, cpl_deep=200, rank_at_depth22=3)
        gate = apply_stage3_gate(feats)
        self.assertFalse(gate["proceed_to_stage4"])
        self.assertIn("cpl_deep_too_high", gate["unsound_reasons"])

    def test_rank1_at_d18_overrides_cpl_gate(self):
        """Rae8-style: deep multipv #1 must not be blocked by CPL search mismatch."""
        feats = _feats(
            span=287,
            near_best=False,
            cpl_deep=138,
            rank_at_depth22=1,
            depth_gain=152,
            rank_jump=1,
        )
        gate = apply_stage3_gate(feats)
        self.assertTrue(gate["proceed_to_stage4"])
        self.assertEqual(gate.get("gate_override"), "rank1_at_d18")

    def test_rising_curve_overrides_cpl_gate(self):
        feats = _feats(
            span=200,
            rising=True,
            near_best=False,
            cpl_deep=120,
            rank_at_depth22=4,
        )
        gate = apply_stage3_gate(feats)
        self.assertTrue(gate["proceed_to_stage4"])
        self.assertEqual(gate.get("gate_override"), "rising_curve")

    def test_relaxed_cpl_with_depth_gain(self):
        feats = _feats(
            span=150,
            near_best=False,
            cpl_deep=138,
            rank_at_depth22=2,
            depth_gain=152,
            rank_jump=1,
        )
        gate = apply_stage3_gate(feats)
        self.assertTrue(gate["proceed_to_stage4"])
        self.assertEqual(gate.get("gate_override"), "relaxed_cpl_with_compensation")

    def test_rising_curve_span_score_max(self):
        self.assertEqual(depth_eval_span_score(6, True), 10.0)

    def test_large_span_score_high(self):
        self.assertGreaterEqual(depth_eval_span_score(120, False), 10.0)


if __name__ == "__main__":
    unittest.main()
