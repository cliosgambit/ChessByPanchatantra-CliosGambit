/**
 * Stage 0 gate logic — how a move proceeds to Stage 1.
 *
 * There is NO single overall Stage 0 score. Pass/fail is an OR gate plus suppressors.
 * TM, EV, Harmony, King Δ are telemetry only (used later in Stage 1 bypass).
 */

export function getStage0GatePaths(s0) {
  if (!s0) return null;

  const see = s0.features?.see ?? s0.see ?? {};
  const negativeSee = Boolean(
    s0.negative_see_sacrifice ?? see.negative_see_sacrifice
  );
  const positionalRisk = Boolean(s0.positional_risk ?? see.positional_risk);
  const hangingSac = Boolean(
    s0.hanging_sacrifice ?? see.hanging_sacrifice
  );
  const earlyBlocked = Boolean(s0.early_game_blocked ?? s0.features?.early_game_blocked);
  const suppression = s0.suppression_reason ?? s0.features?.suppression_reason ?? null;

  const rawOrGate = negativeSee || positionalRisk || hangingSac;
  const passes = Boolean(s0.is_sacrifice_candidate ?? s0.proceed_to_stage1);

  return {
    negativeSee,
    positionalRisk,
    hangingSac,
    rawOrGate,
    earlyBlocked,
    suppression,
    passes,
    earlyReason: s0.early_game_reason ?? s0.features?.early_game_reason ?? null,
    seeValue: s0.see_value ?? see.see_value ?? null,
    isCapture: Boolean(s0.is_capture ?? see.is_capture),
  };
}

export function buildStage0GateSummary(s0) {
  const g = getStage0GatePaths(s0);
  if (!g) return 'No Stage 0 data.';

  const paths = [];
  if (g.negativeSee) {
    const see = s0.features?.see ?? s0.see ?? {};
    const seeValue = s0.see_value ?? see.see_value ?? 0;
    const netSeeApplied = Boolean(s0.net_see_applied ?? see.net_see_applied);
    const netSeeValue = s0.net_see_value ?? see.net_see_value ?? seeValue;
    if (netSeeApplied && seeValue >= -100) {
      paths.push(`Net SEE loss (${netSeeValue}, raw capture ${seeValue})`);
    } else {
      paths.push('SEE loss (< −100 on capture)');
    }
  }
  if (g.positionalRisk) paths.push('Positional risk (non-capture, opp profitable reply)');
  if (g.hangingSac) paths.push('Hanging / indirect / defender-removal exposure');

  if (g.earlyBlocked) {
    return `Blocked: opening theory zone (ply < ${10}). Does not reach Stage 1.`;
  }

  if (!g.rawOrGate) {
    return 'No gate path active. Need at least one: SEE sacrifice, positional risk, or hanging exposure.';
  }

  if (g.suppression) {
    const forkNote = g.suppression === 'fork_escape_abandonment'
      ? 'Escaping a fork by abandoning the other target is not a sacrifice.'
      : g.suppression.replace(/_/g, ' ');
    return `Gate paths active (${paths.join(' · ')}) but SUPPRESSED: ${forkNote}. Sacrifice cand. = false.`;
  }

  if (g.passes) {
    return `Proceeds to Stage 1 via: ${paths.join(' · ') || 'gate'}.`;
  }

  return `Gate paths: ${paths.join(' · ') || '—'}. Sacrifice cand. = false (check suppression or data sync).`;
}

/** Telemetry metrics — not used for Stage 0 pass/fail. */
export function getStage0Telemetry(s0) {
  if (!s0) return null;
  return {
    tm: s0.multiplexing_score ?? 0,
    ev: s0.ev_score ?? 0,
    harmony: s0.harmony_score ?? 0,
    kingDelta: s0.king_safety_delta ?? 0,
    novelty: s0.features?.novelty_score ?? s0.novelty_score ?? null,
  };
}
