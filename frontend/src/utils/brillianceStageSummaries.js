const SAC_TYPE_SHORT = {
  queen_sacrifice: 'Queen sac',
  exchange_sacrifice: 'Exch sac',
  real_sacrifice: 'Real sac',
  pseudo_sacrifice: 'Pseudo',
  positional_piece_placement: 'Positional',
  tactical_sacrifice: 'Tactical',
  unknown: 'Unknown',
};

export function stage0Summary(move) {
  if (!move) return '—';
  const parts = [`SEE ${move.see_value ?? 0}`];
  if (move.is_sacrifice_candidate) parts.push('Sac');
  const indirect = move.indirect_sacrifice_candidate
    ?? move.features?.see?.indirect_sacrifice_candidate;
  if (indirect) {
    const sq = move.newly_exposed_piece_square
      ?? move.exposed_piece_square
      ?? move.features?.see?.newly_exposed_piece_square
      ?? move.features?.see?.exposed_piece_square;
    const pt = move.newly_exposed_piece_type
      ?? move.exposed_piece_type
      ?? move.features?.see?.newly_exposed_piece_type
      ?? move.features?.see?.exposed_piece_type;
    const defRem = move.defender_removal_sacrifice ?? move.features?.see?.defender_removal_sacrifice;
    parts.push(sq && pt ? `IndSac ${pt}@${sq}${defRem ? ' (def↓)' : ''}` : 'IndSac');
  }
  if (move.en_prise_before_move) parts.push('Prise');
  if (move.already_lost_before_move) parts.push('Lost');
  parts.push(`TM ${move.multiplexing_score ?? 0}`, `EV ${move.ev_score ?? 0}`);
  if (move.proceed_to_stage1) parts.push('→S1');
  if (move.features?.see?.favorable_trade) {
    const c = move.features.see.compensation_piece_type;
    const sq = move.features.see.compensation_piece_square;
    parts.push(sq && c ? `Trade ${c}@${sq}` : 'Trade');
  }
  if (move.proceed_to_engine) parts.push(move.engine_candidate_path || 'engine');
  return parts.join(' · ');
}

export function stage1Summary(move) {
  if (!move) return '—';
  const parts = [SAC_TYPE_SHORT[move.sac_type] || move.sac_type];
  parts.push(move.is_valid_sacrifice ? 'Valid' : 'Invalid');
  if (move.is_pseudo) parts.push('Pseudo');
  parts.push(`Mat ${move.material_loss_cp ?? 0}`);
  if (move.is_forced) parts.push('Forced');
  if (move.proceed_to_stage2) parts.push('→S2');
  else if (move.gate_fail_reason) parts.push(move.gate_fail_reason);
  else if (move.disqualifiers?.length) parts.push(move.disqualifiers[0]);
  return parts.join(' · ');
}

export function stage2Summary(move) {
  if (!move) return '—';
  const parts = [`CPL ${move.cpl_shallow ?? '—'}`];
  if (move.our_rank_in_top5 != null) parts.push(`Rank ${move.our_rank_in_top5}`);
  if (move.is_best_or_near_best) parts.push('Near-best');
  if (move.ep_delta_shallow != null) parts.push(`EPΔ ${move.ep_delta_shallow}`);
  if (move.proceed_to_stage3) parts.push('→S3');
  else if (move.gate_fail_reason) parts.push(move.gate_fail_reason);
  return parts.join(' · ');
}

export function stage3Summary(move) {
  if (!move) return '—';
  const parts = [];
  parts.push(move.is_sound ? 'Sound' : 'Unsound');
  if (move.non_obvious_score != null) parts.push(`NOB ${move.non_obvious_score}`);
  if (move.rank_jump != null) parts.push(`RankΔ ${move.rank_jump}`);
  if (move.is_rising_curve) parts.push('Rising');
  if (move.proceed_to_stage4) parts.push('→S4');
  else if (move.gate_fail_reason) parts.push(move.gate_fail_reason);
  return parts.join(' · ');
}

export function stage4Summary(move) {
  if (!move) return '—';
  const parts = [`Score ${move.brilliance_score ?? '—'}`];
  if (move.classification) parts.push(move.classification);
  if (move.archetype) parts.push(move.archetype.replace(/_/g, ' '));
  if (move.proceed_to_stage4) parts.push('→S4');
  return parts.join(' · ');
}

export function buildMoveListLabels(history) {
  return history.map((m, i) => {
    const moveNum = Math.floor(i / 2) + 1;
    const color = m.color || (i % 2 === 0 ? 'w' : 'b');
    if (color === 'w') return `${moveNum}. ${m.san}`;
    return `${moveNum}... ${m.san}`;
  });
}
