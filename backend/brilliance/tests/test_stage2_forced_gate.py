"""Stage 2 engine-forced gate tests (no engine)."""
import unittest

from brilliance_stage2 import apply_stage2_gate, should_bypass_forced_engine


class Stage2ForcedGateTests(unittest.TestCase):
    def _features(self, **overrides):
        base = {
            "cpl_shallow": 0,
            "ep_delta_shallow": 0.0,
            "is_forced_engine": False,
            "is_best_or_near_best": False,
        }
        base.update(overrides)
        return base

    def test_passes_when_not_forced_and_sound(self):
        gate = apply_stage2_gate(self._features())
        self.assertTrue(gate["proceed_to_stage3"])
        self.assertIsNone(gate["gate_fail_reason"])

    def test_blocks_forced_engine_even_when_sound(self):
        gate = apply_stage2_gate(self._features(is_forced_engine=True))
        self.assertFalse(gate["proceed_to_stage3"])
        self.assertEqual(gate["gate_fail_reason"], "forced_engine")
        self.assertEqual(gate["classification_if_fail"], "forced_sacrifice")

    def test_bypasses_forced_when_best_or_near_best_and_choice_exists(self):
        gate = apply_stage2_gate(
            self._features(
                is_forced_engine=True,
                is_best_or_near_best=True,
                n_reasonable_moves=2,
                is_only_good_move=False,
            )
        )
        self.assertTrue(gate["proceed_to_stage3"])
        self.assertIsNone(gate["gate_fail_reason"])
        self.assertTrue(gate["forced_engine_bypassed"])

    def test_blocks_only_good_move_even_when_best(self):
        gate = apply_stage2_gate(
            self._features(
                is_forced_engine=True,
                is_best_or_near_best=True,
                n_reasonable_moves=1,
                is_only_good_move=True,
            )
        )
        self.assertFalse(gate["proceed_to_stage3"])
        self.assertEqual(gate["gate_fail_reason"], "forced_engine")
        self.assertEqual(gate["classification_if_fail"], "forced_sacrifice")
        self.assertFalse(gate["forced_engine_bypassed"])

    def test_blocks_only_good_move_even_with_tactical_bypass(self):
        gate = apply_stage2_gate(
            self._features(
                is_forced_engine=True,
                n_reasonable_moves=1,
                is_only_good_move=True,
            ),
            stage1={"tactical_bypass": True},
        )
        self.assertFalse(gate["proceed_to_stage3"])
        self.assertEqual(gate["gate_fail_reason"], "forced_engine")

    def test_bypasses_forced_when_stage1_tactical_bypass(self):
        gate = apply_stage2_gate(
            self._features(is_forced_engine=True),
            stage1={"tactical_bypass": True},
        )
        self.assertTrue(gate["proceed_to_stage3"])
        self.assertTrue(gate["forced_engine_bypassed"])

    def test_cpl_too_high_takes_priority_over_forced(self):
        gate = apply_stage2_gate(
            self._features(cpl_shallow=400, is_forced_engine=True)
        )
        self.assertEqual(gate["gate_fail_reason"], "cpl_too_high")
        self.assertEqual(gate["classification_if_fail"], "unsound_sacrifice")

    def test_should_bypass_requires_forced_flag(self):
        self.assertFalse(
            should_bypass_forced_engine(
                self._features(is_best_or_near_best=True),
                stage1={"tactical_bypass": True},
            )
        )


if __name__ == "__main__":
    unittest.main()
