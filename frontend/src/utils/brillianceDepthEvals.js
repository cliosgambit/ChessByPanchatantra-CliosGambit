/** Stockfish search depths used in the brilliance pipeline. */

export const STAGE2_ENGINE_DEPTHS = {
  preservation: 8,
  responseSearch: 10,
  shallowPrimary: 12,
};

export const STAGE3_DEPTH_CURVE = [5, 10, 15, 18];

export const STAGE3_RANK_DEPTHS = {
  shallow: 8,
  deep: 18,
};

export function formatCpWhite(cp) {
  if (cp == null || !Number.isFinite(Number(cp))) return '—';
  const n = Number(cp);
  if (Math.abs(n) >= 9000) {
    const mateIn = Math.max(1, 10000 - Math.abs(n));
    return n > 0 ? `+M${mateIn}` : `-M${mateIn}`;
  }
  const pawns = n / 100;
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

export function formatCpPair(whiteCp, moverCp) {
  const white = formatCpWhite(whiteCp);
  if (moverCp == null || !Number.isFinite(Number(moverCp))) return white;
  if (whiteCp != null && Number(whiteCp) === Number(moverCp)) return `${white} (white POV)`;
  return `${white} white · ${formatCpWhite(moverCp)} mover`;
}

/**
 * Stage 2 shallow engine searches (from brilliance_stage2.py).
 * d12 multipv + CPL, d10 fallback / responses, d8 preservation micro-check.
 */
export function getStage2DepthEvals(s2) {
  if (!s2) return { title: 'Stage 2 depths', subtitle: 'd8 · d10 · d12', rows: [] };

  const eng = s2.features?.engine ?? {};
  const pres = s2.features?.preservation_check;
  const rows = [];

  if (pres && !pres.skipped && pres.en_prise_before_move) {
    rows.push({
      depth: STAGE2_ENGINE_DEPTHS.preservation,
      purpose: 'Piece preservation',
      eval: formatCpWhite(pres.current_eval_mover_cp),
      note: pres.already_lost_engine
        ? 'already lost'
        : pres.best_preservation_eval_mover_cp != null
          ? `best save ${formatCpWhite(pres.best_preservation_eval_mover_cp)}`
          : 'no save line',
    });
  }

  if (s2.gate_fail_reason === 'piece_already_lost_engine_confirmed') {
    return {
      title: 'Stage 2 depths',
      subtitle: `d${STAGE2_ENGINE_DEPTHS.preservation} preservation only`,
      rows,
    };
  }

  const preWhite = eng.pre_move_eval_white_cp ?? eng.pre_move_eval_mover_cp;
  if (preWhite != null) {
    rows.push({
      depth: STAGE2_ENGINE_DEPTHS.shallowPrimary,
      purpose: 'Pre-move root',
      eval: formatCpWhite(preWhite),
      note: 'before our move · white POV',
    });
  }

  if (s2.best_score_cp != null || eng.best_score_cp != null) {
    rows.push({
      depth: STAGE2_ENGINE_DEPTHS.shallowPrimary,
      purpose: 'Best line (multipv)',
      eval: formatCpWhite(s2.best_score_cp ?? eng.best_score_cp),
      note: s2.best_move || eng.best_move || '—',
    });
  }

  if (s2.our_score_cp != null || eng.our_score_cp != null) {
    const rank = s2.our_rank_in_top5 ?? eng.our_rank_in_top5;
    const usedFallback = rank == null || rank >= 99;
    rows.push({
      depth: usedFallback ? STAGE2_ENGINE_DEPTHS.responseSearch : STAGE2_ENGINE_DEPTHS.shallowPrimary,
      purpose: usedFallback ? 'Our move (d10 fallback)' : 'Our move (multipv)',
      eval: formatCpWhite(s2.our_score_cp ?? eng.our_score_cp),
      note: usedFallback ? 'post-move · outside top 5 at d12' : `rank #${rank} at d12`,
    });
  }

  if (s2.response_width != null) {
    rows.push({
      depth: STAGE2_ENGINE_DEPTHS.responseSearch,
      purpose: 'Opponent replies',
      eval: '—',
      note: `${s2.response_width} plausible lines`,
    });
  }

  return {
    title: 'Stage 2 depths',
    subtitle: `d${STAGE2_ENGINE_DEPTHS.preservation} preserve · d${STAGE2_ENGINE_DEPTHS.responseSearch} fallback/responses · d${STAGE2_ENGINE_DEPTHS.shallowPrimary} multipv`,
    rows,
  };
}

/**
 * Stage 3 deep curve d5→d18 plus rank searches at d8 and d18.
 */
export function getStage3DepthEvals(s3) {
  if (!s3) return { title: 'Stage 3 depths', subtitle: 'd5 · d10 · d15 · d18', rows: [] };

  const eng = s3.features?.engine ?? {};
  const depthEvals = s3.depth_evals ?? eng.depth_evals ?? {};
  const depthEvalsMover = eng.depth_evals_mover ?? {};
  const rows = [];

  for (const d of STAGE3_DEPTH_CURVE) {
    const key = String(d);
    const whiteCp = depthEvals[key] ?? depthEvals[d];
    const moverCp = depthEvalsMover[key] ?? depthEvalsMover[d];
    rows.push({
      depth: d,
      purpose: d === 18 ? 'Depth curve (final)' : 'Depth curve',
      eval: formatCpPair(whiteCp, moverCp),
      note: d === 18 ? `CPL deep gate · sound ≥ −0.30 mover` : 'post-move position',
    });
  }

  if (s3.rank_at_depth8 != null) {
    rows.push({
      depth: STAGE3_RANK_DEPTHS.shallow,
      purpose: 'Move rank (multipv)',
      eval: '—',
      note: `#${s3.rank_at_depth8} at d8`,
    });
  }

  if (s3.rank_at_depth22 != null) {
    rows.push({
      depth: STAGE3_RANK_DEPTHS.deep,
      purpose: 'Move rank (multipv)',
      eval: '—',
      note: `#${s3.rank_at_depth22} at d18`,
    });
  }

  if (s3.good_defenses != null) {
    rows.push({
      depth: STAGE3_RANK_DEPTHS.deep,
      purpose: 'Defense analysis',
      eval: '—',
      note: `${s3.good_defenses} good defenses · diff ${s3.defense_difficulty ?? '—'}`,
    });
  }

  return {
    title: 'Stage 3 depths',
    subtitle: `curve d${STAGE3_DEPTH_CURVE.join('/d')} · ranks d${STAGE3_RANK_DEPTHS.shallow}/d${STAGE3_RANK_DEPTHS.deep}`,
    rows,
  };
}
