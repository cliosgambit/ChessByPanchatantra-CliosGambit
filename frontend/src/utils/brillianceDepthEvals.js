/** Stockfish search depths used in the brilliance pipeline. */

export const STAGE2_ENGINE_DEPTHS = {
  preservation: 8,
  responseSearch: 10,
  shallowPrimary: 12,
};

export const STAGE3_DEPTH_CURVE = [1, 5, 10, 15, 18];

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

  if (pres && !pres.skipped) {
    rows.push({
      depth: STAGE2_ENGINE_DEPTHS.preservation,
      purpose: 'Piece preservation',
      eval: formatCpWhite(pres.current_eval_mover_cp),
      note: pres.already_lost_engine
        ? 'already lost before'
        : pres.best_preservation_eval_mover_cp != null
          ? `best save ${formatCpWhite(pres.best_preservation_eval_mover_cp)}${pres.best_preservation_via === 'other_move' ? ' · defense' : ''}`
          : 'no save line',
    });
  } else if (pres?.skipped) {
    rows.push({
      depth: STAGE2_ENGINE_DEPTHS.preservation,
      purpose: 'Piece preservation',
      eval: '—',
      note: `skipped · ${pres.reason ?? 'n/a'}`,
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

function formatCpl(cpl) {
  if (cpl == null || !Number.isFinite(Number(cpl))) return '—';
  const n = Number(cpl);
  if (n === 0) return '—';
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Stage 2 d12 MultiPV top-5 legal moves before our move, plus verdict vs alternatives.
 */
export function getStage2TopMoves(s2) {
  if (!s2) {
    return { title: 'Legal moves', subtitle: 'd12 multipv · pre-move', rows: [], verdict: null };
  }

  const eng = s2.features?.engine ?? s2.features ?? {};
  const top5 = eng.top5_moves ?? s2.top5_moves ?? [];
  const nLegal = eng.n_legal ?? s2.n_legal;
  const ourRank = s2.our_rank_in_top5 ?? eng.our_rank_in_top5;
  const nReasonable = s2.n_reasonable_moves ?? eng.n_reasonable_moves;
  const bestMove = s2.best_move ?? eng.best_move;

  if (!top5.length) {
    return {
      title: 'Legal moves',
      subtitle: 'd12 multipv · pre-move',
      rows: [],
      verdict: null,
      nLegal,
    };
  }

  const rows = top5.map((m) => {
    const tags = [];
    if (m.rank === 1) tags.push('best');
    if (m.is_played) tags.push('played');
    if (m.outside_top5) tags.push('outside top 5');
    if (!m.within_150cp && m.rank !== 1 && !m.outside_top5) tags.push('bad');

    return {
      rank: m.outside_top5 ? '—' : `#${m.rank}`,
      move: m.san,
      eval: formatCpWhite(m.score_mover_cp ?? m.score_cp),
      cpl: formatCpl(m.cpl_from_best),
      note: tags.join(' · ') || '—',
      isPlayed: Boolean(m.is_played),
      isBest: m.rank === 1,
      isBad: !m.within_150cp && m.rank !== 1,
    };
  });

  let verdict = null;
  const playedInTop = top5.find((m) => m.is_played && !m.outside_top5);
  const second = top5.find((m) => m.rank === 2);

  if (ourRank === 1 || (playedInTop && playedInTop.rank === 1)) {
    const gap = second?.cpl_from_best;
    if (nReasonable != null && nReasonable <= 1) {
      verdict = `${bestMove || playedInTop?.san} is the only good move — not a brilliant candidate.`;
    } else if (gap != null && gap > 150) {
      verdict = `${bestMove || playedInTop?.san} is clearly best — next alternative is ${gap} cp worse.`;
    } else if (nReasonable != null && nReasonable <= 2) {
      verdict = `Forced position — ${nReasonable} moves within 150 cp of best; choice still exists.`;
    } else if (gap != null && gap <= 50) {
      verdict = `${bestMove || playedInTop?.san} is best, but several near-equal alternatives exist.`;
    } else {
      verdict = `${bestMove || playedInTop?.san} is best among ${nLegal ?? 'all'} legal moves.`;
    }
  } else if (ourRank != null && ourRank < 99) {
    verdict = `Played move ranks #${ourRank}; best is ${bestMove || top5[0]?.san}.`;
  } else {
    verdict = `Played move is outside Stockfish top 5 at d12 (evaluated at d10).`;
  }

  const legalNote = nLegal != null ? `${nLegal} legal · top 5 at d12` : 'top 5 at d12';

  return {
    title: 'Legal moves',
    subtitle: legalNote,
    rows,
    verdict,
    nLegal,
  };
}

/**
 * Stage 3 deep curve d5→d18 plus rank searches at d8 and d18.
 */
export function getStage3DepthEvals(s3) {
  if (!s3) return { title: 'Stage 3 depths', subtitle: 'd1 · d5 · d10 · d15 · d18', rows: [] };

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
      note: d === 18
        ? `CPL deep gate · sound/span scored in Stage 4`
        : 'post-move position',
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
