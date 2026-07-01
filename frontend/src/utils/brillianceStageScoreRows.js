const SAC_TYPE_SHORT = {
  queen_sacrifice: 'Queen sac',
  exchange_sacrifice: 'Exch sac',
  real_sacrifice: 'Real sac',
  pseudo_sacrifice: 'Pseudo',
  positional_piece_placement: 'Positional',
  tactical_sacrifice: 'Tactical',
  unknown: 'Unknown',
};

export function buildStage0Rows(s0) {
  if (!s0) return [];

  const see = s0.features?.see ?? {};
  const seeValue = s0.see_value ?? see.see_value ?? 0;
  const isCapture = Boolean(s0.is_capture ?? see.is_capture);
  const positionalRisk = Boolean(see.positional_risk);
  const indirectSac = Boolean(see.indirect_sacrifice_candidate);
  const hangingSac = Boolean(see.hanging_sacrifice);
  const defRem = Boolean(see.defender_removal_sacrifice);
  const newlyExposed = Boolean(
    see.newly_exposed_sacrifice
    ?? (see.pre_move_see <= 0 && see.post_move_see > 0 && see.newly_exposed_piece_value >= 300)
  );
  const sacAsset = see.newly_exposed_piece_type ?? see.exposed_piece_type;
  const sacSquare = see.newly_exposed_piece_square ?? see.exposed_piece_square;
  const favorableTrade = Boolean(see.favorable_trade);
  const compType = see.compensation_piece_type;
  const compSquare = see.compensation_piece_square;

  return [
    {
      label: 'SEE',
      got: isCapture ? seeValue : '—',
      need: '< −100',
      pass: isCapture ? seeValue < -100 : null,
      na: !isCapture,
    },
    {
      label: 'Positional risk',
      got: positionalRisk ? 'true' : 'false',
      need: 'true',
      pass: positionalRisk,
    },
    {
      label: 'Newly exposed',
      got: newlyExposed ? `${sacAsset ?? '?'}@${sacSquare ?? '?'}` : 'false',
      need: 'SEE flip + ≥300',
      pass: newlyExposed,
    },
    {
      label: 'Defender removed',
      got: defRem ? `${sacAsset ?? '?'}@${sacSquare ?? '?'}` : 'false',
      need: 'true',
      pass: defRem,
    },
    {
      label: 'Hanging sac',
      got: hangingSac
        ? `${sacAsset ?? '?'}@${sacSquare ?? '?'} (SEE ${see.pre_move_see ?? 0}→${see.post_move_see ?? 0}, def ${see.pre_move_defenders ?? 0}→${see.post_move_defenders ?? 0})`
        : 'false',
      need: 'profitable asset',
      pass: hangingSac,
    },
    {
      label: 'Indirect sac',
      got: indirectSac ? `${sacAsset ?? '?'}@${sacSquare ?? '?'}` : 'false',
      need: 'profitable exposure',
      pass: indirectSac,
    },
    {
      label: 'Became lost',
      got: see.became_lost ? 'true' : 'false',
      need: 'risk↑ or def↓',
      pass: see.became_lost,
    },
    {
      label: 'Risk worsened',
      got: see.risk_worsened ? 'true' : 'false',
      need: 'SEE↑',
      pass: see.risk_worsened,
    },
    {
      label: 'Defense weak',
      got: see.defense_weakened ? 'true' : 'false',
      need: 'def↓',
      pass: see.defense_weakened,
    },
    {
      label: 'Favorable trade',
      got: favorableTrade
        ? `${compType ?? '?'}@${compSquare ?? '?'} ≥ ${sacAsset ?? '?'}`
        : 'false',
      need: 'blocks sac',
      pass: favorableTrade ? null : false,
      na: favorableTrade,
    },
    {
      label: 'Sacrifice cand.',
      got: s0.is_sacrifice_candidate ? 'true' : 'false',
      need: 'true',
      pass: Boolean(s0.is_sacrifice_candidate),
    },
    {
      label: '→ Stage 1',
      got: s0.proceed_to_stage1 ? 'true' : 'false',
      need: 'true',
      pass: Boolean(s0.proceed_to_stage1),
      highlight: true,
    },
    {
      label: 'En prise',
      got: s0.en_prise_before_move ? 'true' : 'false',
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'Already lost',
      got: s0.already_lost_before_move ? 'true' : 'false',
      need: 'false',
      pass: !s0.already_lost_before_move,
    },
    {
      label: 'TM',
      got: s0.multiplexing_score ?? 0,
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'EV',
      got: s0.ev_score ?? 0,
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'Harmony',
      got: s0.harmony_score ?? 0,
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'King Δ',
      got: s0.king_safety_delta ?? 0,
      need: '—',
      pass: null,
      na: true,
    },
  ];
}

export function buildStage1Rows(s0, s1) {
  if (!s0?.proceed_to_stage1 || !s1) return [];

  const seeValue = s0.see_value ?? s1.features?.stage0?.see_value ?? 0;
  const isCapture = Boolean(s0.is_capture ?? s1.features?.stage0?.is_capture);
  const isExchange = s1.sac_type === 'exchange_sacrifice';
  const dynamicScore = s1.features?.dynamic_score ?? null;
  const tacticalBypass = Boolean(s1.features?.tactical_bypass);
  const disqualifiers = s1.disqualifiers ?? [];

  const rows = [
    {
      label: 'Type',
      got: SAC_TYPE_SHORT[s1.sac_type] || s1.sac_type,
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'Valid sacrifice',
      got: s1.is_valid_sacrifice ? 'true' : 'false',
      need: 'true',
      pass: Boolean(s1.is_valid_sacrifice),
    },
  ];

  if (isCapture) {
    rows.push({
      label: 'SEE (win cap)',
      got: seeValue,
      need: '< 150',
      pass: seeValue < 150,
    });
    rows.push({
      label: 'SEE (equal trade)',
      got: seeValue,
      need: isExchange ? 'exch OK' : '< −100',
      pass: isExchange || seeValue < -100,
    });
  }

  rows.push({
    label: 'Already lost DQ',
    got: disqualifiers.includes('piece_already_lost_before_move') ? 'true' : 'false',
    need: 'false',
    pass: !disqualifiers.includes('piece_already_lost_before_move'),
  });

  rows.push(
    {
      label: 'Forced',
      got: s1.is_forced ? 'true' : 'false',
      need: 'false',
      pass: !s1.is_forced,
    },
    {
      label: 'n_legal',
      got: s1.n_legal ?? '—',
      need: '> 1',
      pass: (s1.n_legal ?? 0) > 1,
    },
    {
      label: 'Mat loss',
      got: s1.material_loss_cp ?? 0,
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'Uncertainty',
      got: s1.sacrifice_uncertainty ?? 0,
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'Dynamic score',
      got: dynamicScore ?? '—',
      need: '≥ 6',
      pass: dynamicScore != null ? dynamicScore >= 6 : null,
    },
    {
      label: 'Tactical bypass',
      got: tacticalBypass ? 'true' : 'false',
      need: 'true*',
      pass: tacticalBypass,
    },
    {
      label: '→ Stage 2',
      got: s1.proceed_to_stage2 ? 'true' : 'false',
      need: 'true',
      pass: Boolean(s1.proceed_to_stage2),
      highlight: true,
    }
  );

  return rows;
}

export function buildStage2Rows(s1, s2) {
  if (!s1?.proceed_to_stage2 || !s2) return [];

  const eng = s2.features?.engine ?? s2.features ?? {};
  const epPre = eng.ep_pre_position ?? s2.features?.ep_pre_position ?? null;
  const cpl = s2.cpl_shallow ?? eng.cpl_shallow ?? null;
  const epDelta = s2.ep_delta_shallow ?? eng.ep_delta_shallow ?? null;
  const earlyFail = s2.gate_fail_reason === 'piece_already_lost_engine_confirmed';

  const rows = [];

  if (earlyFail) {
    rows.push({
      label: 'Engine preserve',
      got: 'lost',
      need: 'survive',
      pass: false,
    });
  } else {
    rows.push(
      {
        label: 'CPL',
        got: cpl ?? '—',
        need: '≤ 300',
        pass: cpl != null ? cpl <= 300 : null,
      },
      {
        label: 'EP pre',
        got: epPre ?? '—',
        need: '—',
        pass: null,
        na: true,
      },
      {
        label: 'EP delta',
        got: epDelta ?? '—',
        need: '≥ −0.15',
        pass: epDelta != null ? epDelta >= -0.15 : null,
      },
      {
        label: 'Engine forced',
        got: s2.is_forced_engine ? 'true' : 'false',
        need: '—',
        pass: null,
        na: true,
      },
      {
        label: 'Near best',
        got: s2.is_best_or_near_best ? 'true' : 'false',
        need: '—',
        pass: null,
        na: true,
      },
      {
        label: 'Rank',
        got: s2.our_rank_in_top5 ?? '—',
        need: '—',
        pass: null,
        na: true,
      },
      {
        label: 'Resp width',
        got: s2.response_width ?? '—',
        need: '—',
        pass: null,
        na: true,
      }
    );
  }

  rows.push({
    label: '→ Stage 3',
    got: s2.proceed_to_stage3 ? 'true' : 'false',
    need: 'true',
    pass: Boolean(s2.proceed_to_stage3),
    highlight: true,
  });

  return rows;
}

export function buildStage3Rows(s2, s1, s3) {
  if (!s1?.proceed_to_stage2 || !s2?.proceed_to_stage3 || !s3) return [];

  const eng = s3.features?.engine ?? {};
  const deepMover = eng.deep_eval_mover_cp ?? null;
  const cplDeep = eng.cpl_deep ?? null;

  return [
    {
      label: 'Deep eval',
      got: deepMover ?? s3.deep_eval_cp ?? '—',
      need: '≥ −30',
      pass: Boolean(s3.is_sound),
    },
    {
      label: 'CPL deep',
      got: cplDeep ?? '—',
      need: '≤ 50',
      pass: eng.is_near_best_deep ?? null,
    },
    {
      label: 'Sound',
      got: s3.is_sound ? 'true' : 'false',
      need: 'true',
      pass: Boolean(s3.is_sound),
    },
    {
      label: 'NOB score',
      got: s3.non_obvious_score ?? '—',
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'Rank d8',
      got: s3.rank_at_depth8 ?? '—',
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'Rank d18',
      got: s3.rank_at_depth22 ?? '—',
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'Rank jump',
      got: s3.rank_jump ?? '—',
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'Rising curve',
      got: s3.is_rising_curve ? 'true' : 'false',
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'Depth gain',
      got: s3.depth_gain ?? '—',
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'Defense diff',
      got: s3.defense_difficulty ?? '—',
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: '→ Stage 4',
      got: s3.proceed_to_stage4 ? 'true' : 'false',
      need: 'true',
      pass: Boolean(s3.proceed_to_stage4),
      highlight: true,
    },
  ];
}

export function buildStage4Rows(s3Move, s4Move) {
  if (!s3Move?.proceed_to_stage4 || !s4Move) return [];

  return [
    {
      label: 'Score',
      got: s4Move.brilliance_score ?? '—',
      need: '≥ 6.5 brilliant',
      pass: s4Move.is_brilliant ?? (s4Move.brilliance_score != null && s4Move.brilliance_score >= 6.5),
    },
    {
      label: 'Class',
      got: s4Move.classification ?? '—',
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'Archetype',
      got: (s4Move.archetype || 'masterstroke').replace(/_/g, ' '),
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'Surprise',
      got: s4Move.surprise_score ?? '—',
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'PB score',
      got: s4Move.pb_score ?? '—',
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'Tal zone',
      got: s4Move.is_tal_zone ? 'true' : 'false',
      need: '—',
      pass: null,
      na: true,
    },
  ];
}

/** Canonical check list per stage (union of all possible rows). */
export const DETAILED_STAGE_SCHEMA = [
  {
    stage: 0,
    title: 'Stage 0',
    fill: 'FFE0E7FF',
    checks: [
      'SEE', 'Positional risk', 'Newly exposed', 'Defender removed', 'Hanging sac', 'Indirect sac',
      'Became lost', 'Risk worsened', 'Defense weak', 'Favorable trade', 'Sacrifice cand.', '→ Stage 1',
      'En prise', 'Already lost', 'TM', 'EV', 'Harmony', 'King Δ',
    ],
  },
  {
    stage: 1,
    title: 'Stage 1',
    fill: 'FFDDD6FE',
    checks: [
      'Type', 'Valid sacrifice', 'SEE (win cap)', 'SEE (equal trade)', 'Already lost DQ', 'Forced',
      'n_legal', 'Mat loss', 'Uncertainty', 'Dynamic score', 'Tactical bypass', '→ Stage 2',
    ],
  },
  {
    stage: 2,
    title: 'Stage 2',
    fill: 'FFBFDBFE',
    checks: [
      'Engine preserve', 'CPL', 'EP pre', 'EP delta', 'Engine forced', 'Near best', 'Rank',
      'Resp width', '→ Stage 3',
    ],
  },
  {
    stage: 3,
    title: 'Stage 3',
    fill: 'FFBAE6FD',
    checks: [
      'Deep eval', 'CPL deep', 'Sound', 'NOB score', 'Rank d8', 'Rank d18', 'Rank jump',
      'Rising curve', 'Depth gain', 'Defense diff', '→ Stage 4',
    ],
  },
  {
    stage: 4,
    title: 'Stage 4',
    fill: 'FFFDE68A',
    checks: ['Score', 'Class', 'Archetype', 'Surprise', 'PB score', 'Tal zone'],
  },
];

export function getStageGateLabel(stageNum, s0, s1, s2, s3, s4) {
  switch (stageNum) {
    case 0:
      return s0?.proceed_to_stage1 ? '→ S1' : 'Stop';
    case 1:
      if (!s0?.proceed_to_stage1) return 'Skip';
      return s1?.proceed_to_stage2 ? '→ S2' : 'Stop';
    case 2:
      if (!s1?.proceed_to_stage2) return 'Skip';
      return s2?.proceed_to_stage3 ? '→ S3' : 'Stop';
    case 3:
      if (!s1?.proceed_to_stage2 || !s2?.proceed_to_stage3) return 'Skip';
      return s3?.proceed_to_stage4 ? '→ S4' : 'Stop';
    case 4:
      if (!s3?.proceed_to_stage4) return 'Skip';
      return s4?.classification || 'Done';
    default:
      return '—';
  }
}

export function buildAllStageRowsForMove(s0, s1, s2, s3, s4) {
  return {
    0: buildStage0Rows(s0),
    1: buildStage1Rows(s0, s1),
    2: buildStage2Rows(s1, s2),
    3: buildStage3Rows(s2, s1, s3),
    4: buildStage4Rows(s3, s4),
  };
}

export function rowsToLookup(rows) {
  const map = new Map();
  for (const row of rows) {
    map.set(row.label, row);
  }
  return map;
}

export function formatOkValue(row) {
  if (!row) return '—';
  if (row.na) return '—';
  if (row.pass == null) return '·';
  return row.pass ? 'true' : 'false';
}
