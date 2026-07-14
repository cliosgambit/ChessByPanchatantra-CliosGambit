const SAC_TYPE_SHORT = {
  queen_sacrifice: 'Queen sac',
  exchange_sacrifice: 'Exch sac',
  real_sacrifice: 'Real sac',
  pseudo_sacrifice: 'Pseudo',
  positional_piece_placement: 'Positional',
  tactical_sacrifice: 'Tactical',
  unknown: 'Unknown',
};

function formatSacrificeTypeLabel(s1) {
  const sacClass = s1?.features?.sacrifice_class || s1;
  const sacrificed = sacClass.sacrificed_piece_type || s1?.sacrificed_piece_type;
  const moving = sacClass.moving_piece_type || s1?.moving_piece_type;
  const mode = sacClass.sacrifice_mode || s1?.sacrifice_mode;
  const sacType = s1?.sac_type || sacClass.sac_type;

  if (sacrificed && moving && sacrificed !== moving) {
    const piece = sacrificed.charAt(0).toUpperCase() + sacrificed.slice(1);
    if (mode === 'indirect') return `${piece} sac (indirect)`;
    if (mode === 'positional') return `${piece} sac (positional)`;
    return `${piece} sac`;
  }

  return SAC_TYPE_SHORT[sacType] || sacType || 'Unknown';
}

function capPiece(name) {
  if (!name) return '?';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const NET_SEE_REASON_LABEL = {
  landing_en_prise: 'mover lands en prise (tactically lost)',
};

function getEffectiveSee(s0) {
  const see = s0?.features?.see ?? {};
  const seeValue = s0?.see_value ?? see.see_value ?? 0;
  const netSeeApplied = Boolean(s0?.net_see_applied ?? see.net_see_applied);
  const netSeeValue = s0?.net_see_value ?? see.net_see_value ?? seeValue;
  const movingPieceType = s0?.moving_piece_type ?? see.moving_piece_type ?? null;
  const movingPieceValue = s0?.moving_piece_value ?? see.moving_piece_value ?? 0;
  const capturedPieceType = s0?.captured_piece_type ?? see.captured_piece_type ?? null;
  const capturedPieceSquare = s0?.captured_piece_square ?? see.captured_piece_square ?? null;
  const capturedValue = s0?.captured_value ?? see.captured_value ?? 0;
  const landingSquare = s0?.moving_piece_landing_square ?? see.moving_piece_landing_square ?? capturedPieceSquare;
  const landingPostMoveSee = s0?.landing_post_move_see ?? see.landing_post_move_see ?? 0;
  const landingEnPrise = Boolean(s0?.landing_en_prise ?? see.landing_en_prise);
  const netSeeReason = s0?.net_see_reason ?? see.net_see_reason ?? null;
  return {
    see,
    seeValue,
    netSeeApplied,
    netSeeValue,
    effectiveSee: netSeeApplied ? netSeeValue : seeValue,
    movingPieceType,
    movingPieceValue,
    capturedPieceType,
    capturedPieceSquare,
    capturedValue,
    landingSquare,
    landingPostMoveSee,
    landingEnPrise,
    netSeeReason,
  };
}

function buildNetSeeBreakdownRows(meta, seeValue, netSeeValue) {
  const {
    capturedPieceType,
    capturedPieceSquare,
    capturedValue,
    movingPieceType,
    movingPieceValue,
    landingSquare,
    landingPostMoveSee,
    landingEnPrise,
    netSeeReason,
  } = meta;

  const capLabel = `${capPiece(capturedPieceType)}@${capturedPieceSquare ?? landingSquare ?? '?'}`;
  const moverLabel = `${capPiece(movingPieceType)}@${landingSquare ?? '?'}`;

  return [
    {
      label: 'Net: captured',
      got: `${capLabel} (${capturedValue})`,
      need: 'immediate take',
      pass: null,
      na: true,
    },
    {
      label: 'Net: mover left',
      got: `${moverLabel} (${movingPieceValue})`,
      need: 'abandoned on square',
      pass: null,
      na: true,
    },
    {
      label: 'Net: raw SEE',
      got: seeValue,
      need: 'capture sequence',
      pass: null,
      na: true,
    },
    {
      label: 'Net: − mover',
      got: `−${movingPieceValue}`,
      need: 'subtracted',
      pass: null,
      na: true,
    },
    {
      label: 'Net: = result',
      got: `${netSeeValue} (= ${seeValue} − ${movingPieceValue})`,
      need: '< −100',
      pass: netSeeValue < -100,
      highlight: true,
    },
    {
      label: 'Net: landing SEE',
      got: landingEnPrise ? `${landingPostMoveSee} (en prise)` : landingPostMoveSee,
      need: landingEnPrise ? '> 0' : '—',
      pass: landingEnPrise ? landingPostMoveSee > 0 : null,
      na: !landingEnPrise,
    },
    {
      label: 'Net: trigger',
      got: NET_SEE_REASON_LABEL[netSeeReason] ?? netSeeReason ?? '—',
      need: 'landing en prise only',
      pass: null,
      na: true,
    },
  ];
}

export function buildStage0Rows(s0) {
  if (!s0) return [];

  const {
    see,
    seeValue,
    netSeeApplied,
    netSeeValue,
    movingPieceType,
  } = getEffectiveSee(s0);
  const isCapture = Boolean(s0.is_capture ?? see.is_capture);
  const positionalRisk = Boolean(s0.positional_risk ?? see.positional_risk);
  const indirectSac = Boolean(s0.indirect_sacrifice_candidate ?? see.indirect_sacrifice_candidate);
  const captureLandingSac = Boolean(see.capture_landing_sacrifice);
  const verifiedSacPieces = see.verified_sacrifice_pieces ?? [];
  const pieceAudit = see.sacrifice_piece_audit ?? [];
  const allSacCandidates = see.all_sacrifice_candidates ?? [];
  const hasVerified = verifiedSacPieces.length > 0;
  const defRem = hasVerified
    ? verifiedSacPieces.some((p) => (p.sacrifice_modes ?? []).includes('defender_removed'))
    : Boolean(s0.defender_removal_sacrifice ?? see.defender_removal_sacrifice);
  const newlyExposed = hasVerified
    ? verifiedSacPieces.some((p) => (p.sacrifice_modes ?? []).includes('newly_exposed'))
    : Boolean(
      s0.newly_exposed_sacrifice
      ?? see.newly_exposed_sacrifice
      ?? (see.pre_move_see <= 0 && see.post_move_see > 0 && see.newly_exposed_piece_value >= 300)
    );
  const hangingSac = hasVerified
    ? true
    : Boolean(
      s0.hanging_sacrifice
      ?? see.hanging_sacrifice
      ?? (indirectSac || captureLandingSac)
    );
  const primaryVerified = verifiedSacPieces[0];
  const sacAsset = primaryVerified?.piece_type
    ?? see.newly_exposed_piece_type
    ?? see.exposed_piece_type;
  const sacSquare = primaryVerified?.square
    ?? see.newly_exposed_piece_square
    ?? see.exposed_piece_square;
  const favorableTrade = Boolean(see.favorable_trade);
  const compType = see.compensation_piece_type;
  const compSquare = see.compensation_piece_square;
  const negativeSee = Boolean(s0.negative_see_sacrifice ?? see.negative_see_sacrifice);
  const suppression = s0.suppression_reason ?? see.suppression_reason ?? null;
  const earlyBlocked = Boolean(s0.early_game_blocked ?? see.early_game_blocked);

  const gateRows = [
    {
      label: 'SEE sacrifice',
      got: negativeSee
        ? (netSeeApplied && seeValue >= -100
          ? `${capPiece(movingPieceType)}@${see.moving_piece_landing_square ?? '?'} net ${netSeeValue}`
          : 'true')
        : 'false',
      need: 'capture & (raw or net SEE)<−100',
      pass: negativeSee,
    },
    {
      label: 'Positional risk',
      got: positionalRisk ? 'true' : 'false',
      need: 'non-capture path',
      pass: positionalRisk,
    },
    {
      label: 'Hanging exposure',
      got: hangingSac ? 'true' : 'false',
      need: 'indirect/defender path',
      pass: hangingSac,
    },
    {
      label: 'OR gate (raw)',
      got: negativeSee || positionalRisk || hangingSac ? 'true' : 'false',
      need: 'any path',
      pass: negativeSee || positionalRisk || hangingSac,
    },
  ];

  if (earlyBlocked) {
    gateRows.push({
      label: 'Early game block',
      got: s0.early_game_reason ?? see.early_game_reason ?? 'opening_theory_zone',
      need: 'none',
      pass: false,
    });
  }

  if (suppression) {
    gateRows.push({
      label: 'Suppressed',
      got: String(suppression).replace(/_/g, ' '),
      need: 'none',
      pass: false,
      highlight: true,
    });
  }

  return [
    ...gateRows,
    {
      label: 'SEE (raw)',
      got: isCapture ? seeValue : '—',
      need: netSeeApplied ? 'net used below' : '< −100',
      pass: isCapture ? (netSeeApplied ? null : seeValue < -100) : null,
      na: !isCapture,
    },
    ...(netSeeApplied
      ? buildNetSeeBreakdownRows(getEffectiveSee(s0), seeValue, netSeeValue)
      : []),
    ...(verifiedSacPieces.length > 0
      ? verifiedSacPieces.map((p) => ({
          label: `Verified: ${p.piece_type ?? '?'}@${p.square ?? '?'}`,
          got: (p.sacrifice_modes ?? []).join(', ') || '—',
          need: 'intentional path',
          pass: true,
          highlight: true,
        }))
      : []),
    ...(pieceAudit.length > 0
      ? pieceAudit.map((p) => ({
          label: `Audit: ${p.piece_type ?? '?'}@${p.square ?? '?'}`,
      got: p.verdict === 'verified_sacrifice'
        ? (p.sacrifice_modes ?? []).join(', ')
        : [
            p.reason?.replace(/_/g, ' '),
            p.pre_en_prise != null ? `pre EP:${p.pre_en_prise}` : null,
            p.post_en_prise != null ? `post EP:${p.post_en_prise}` : null,
            p.already_lost_before ? 'lost before' : null,
            p.already_lost_after && !p.already_lost_before ? 'lost after' : null,
          ].filter(Boolean).join(' · ') || 'not_sacrifice',
          need: p.verdict === 'verified_sacrifice' ? 'verified' : 'reject',
          pass: p.verdict === 'verified_sacrifice',
        }))
      : []),
    ...(allSacCandidates.length > 1
      ? [{
          label: 'Max sac asset',
          got: allSacCandidates
            .slice()
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
            .map((c) => `${c.piece_type ?? '?'}@${c.square ?? '?'} (${c.value ?? 0})`)
            .join(' · '),
          need: 'highest value',
          pass: null,
          na: true,
        }]
      : []),
    {
      label: 'Positional risk (detail)',
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
      got: indirectSac || captureLandingSac
        ? `${sacAsset ?? '?'}@${sacSquare ?? '?'}${captureLandingSac ? ' (landing)' : ''}`
        : 'false',
      need: 'profitable exposure',
      pass: indirectSac || captureLandingSac,
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
      label: 'Opponent fork',
      got: (() => {
        const forks = see.opponent_forks_before
          ?? s0.features?.see?.opponent_forks_before
          ?? s0.tactical_multiplexing?.opponent_fork_details_before
          ?? [];
        if (!forks.length) return 'false';
        const f = forks[0];
        return `${f.attacker_type ?? '?'}@${f.attacker_square ?? '?'} → ${(f.target_squares ?? []).join(',')}`;
      })(),
      need: '—',
      pass: null,
      na: true,
    },
    {
      label: 'Fork escape loss',
      got: (see.fork_escape_abandonment ?? s0.features?.see?.fork_escape_abandonment) ? 'true' : 'false',
      need: 'false',
      pass: !(see.fork_escape_abandonment ?? s0.features?.see?.fork_escape_abandonment),
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

  const { effectiveSee, seeValue, netSeeApplied } = getEffectiveSee(s0);
  const isCapture = Boolean(s0.is_capture ?? s1.features?.stage0?.is_capture);
  const isExchange = s1.sac_type === 'exchange_sacrifice';
  const dynamicScore = s1.features?.dynamic_score ?? null;
  const tacticalBypass = Boolean(s1.features?.tactical_bypass);
  const disqualifiers = s1.disqualifiers ?? [];

  const rows = [
    {
      label: 'Type',
      got: formatSacrificeTypeLabel(s1),
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
      label: netSeeApplied ? 'SEE (net, win cap)' : 'SEE (win cap)',
      got: effectiveSee,
      need: '< 150',
      pass: effectiveSee < 150,
    });
    rows.push({
      label: netSeeApplied ? 'SEE (net, equal trade)' : 'SEE (equal trade)',
      got: effectiveSee,
      need: isExchange ? 'exch OK' : '< −100',
      pass: isExchange || effectiveSee < -100,
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
  const pres = s2.features?.preservation_check ?? null;
  const forcedEngineBypassed = Boolean(
    s2.forced_engine_bypassed ?? s2.features?.forced_engine_bypassed
  );
  const isOnlyGoodMove = Boolean(
    s2.is_only_good_move ?? eng.is_only_good_move
    ?? ((s2.n_reasonable_moves ?? eng.n_reasonable_moves) != null
      && (s2.n_reasonable_moves ?? eng.n_reasonable_moves) <= 1)
  );

  const rows = [];

  if (pres?.skipped) {
    rows.push({
      label: 'Engine preserve',
      got: pres.reason ?? 'skipped',
      need: 'already lost before',
      pass: true,
      na: true,
    });
  } else if (earlyFail) {
    rows.push({
      label: 'Engine preserve',
      got: 'already lost before',
      need: 'save line exists',
      pass: false,
    });
    if (pres?.best_preservation_move) {
      rows.push({
        label: 'Best save try',
        got: pres.best_preservation_move,
        need: '—',
        pass: null,
        na: true,
      });
    }
    if (pres?.preservation_delta_cp != null) {
      rows.push({
        label: 'Save delta',
        got: pres.preservation_delta_cp,
        need: `≥ −${pres.preservation_threshold_cp ?? 'T'}`,
        pass: false,
      });
    }
  } else if (pres && !pres.skipped && pres.en_prise_before_move) {
    rows.push({
      label: 'Engine preserve',
      got: pres.already_lost_engine ? 'already lost before' : 'save exists',
      need: 'not doomed before',
      pass: !pres.already_lost_engine,
    });
    if (pres.best_preservation_move) {
      rows.push({
        label: 'Best save',
        got: `${pres.best_preservation_move}${pres.best_preservation_via === 'other_move' ? ' (defense)' : ''}`,
        need: '—',
        pass: null,
        na: true,
      });
    }
  }

  if (earlyFail) {
    // depth table only — no CPL rows
  } else {
    const preWhite = eng.pre_move_eval_white_cp;
    if (preWhite != null) {
      rows.push({
        label: 'Eval d12 pre',
        got: preWhite,
        need: '—',
        pass: null,
        na: true,
      });
    }
    if (s2.best_score_cp != null || eng.best_score_cp != null) {
      rows.push({
        label: 'Eval d12 best',
        got: s2.best_score_cp ?? eng.best_score_cp,
        need: '—',
        pass: null,
        na: true,
      });
    }
    if (s2.our_score_cp != null || eng.our_score_cp != null) {
      const rank = s2.our_rank_in_top5 ?? eng.our_rank_in_top5;
      rows.push({
        label: rank != null && rank < 99 ? 'Eval d12 ours' : 'Eval d10 ours',
        got: s2.our_score_cp ?? eng.our_score_cp,
        need: '—',
        pass: null,
        na: true,
      });
    }
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
        label: 'Only good move',
        got: isOnlyGoodMove ? 'true' : 'false',
        need: 'false',
        pass: !isOnlyGoodMove,
      },
      {
        label: 'Engine forced',
        got: s2.is_forced_engine
          ? (forcedEngineBypassed ? 'true · bypassed' : 'true')
          : 'false',
        need: 'false or bypass',
        pass: !s2.is_forced_engine || forcedEngineBypassed,
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
  const depthEvals = s3.depth_evals ?? eng.depth_evals ?? {};
  const depthEvalsMover = eng.depth_evals_mover ?? {};
  const deepMover = eng.deep_eval_mover_cp ?? null;
  const cplDeep = eng.cpl_deep ?? null;

  const depthCurveRows = [1, 5, 10, 15, 18].map((d) => {
    const key = String(d);
    const whiteCp = depthEvals[key] ?? depthEvals[d];
    const moverCp = depthEvalsMover[key] ?? depthEvalsMover[d];
    const got = whiteCp != null
      ? moverCp != null && Number(moverCp) !== Number(whiteCp)
        ? `${whiteCp} / ${moverCp} mv`
        : whiteCp
      : '—';
    return {
      label: `Eval d${d}`,
      got,
      need: '—',
      pass: null,
      na: true,
    };
  });

  return [
    ...depthCurveRows,
    {
      label: 'Deep eval',
      got: deepMover ?? s3.deep_eval_cp ?? '—',
      need: 'score in S4',
      pass: null,
      na: true,
    },
    {
      label: 'Sound score',
      got: eng.deep_eval_sound_score ?? s3.deep_eval_sound_score ?? '—',
      need: '×0.06 in S4',
      pass: null,
      na: true,
    },
    {
      label: 'CPL deep',
      got: cplDeep ?? '—',
      need: '≤ 50',
      pass: eng.is_near_best_deep ?? null,
    },
    {
      label: 'Sound (telemetry)',
      got: s3.is_sound ? 'true' : 'false',
      need: '≥ −30 cp',
      pass: null,
      na: true,
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
      label: 'd1−d18 span',
      got: eng.depth_eval_span_cp ?? s3.depth_eval_span_cp ?? '—',
      need: 'score in S4',
      pass: null,
      na: true,
    },
    {
      label: 'Span score',
      got: eng.depth_eval_span_score ?? s3.depth_eval_span_score ?? '—',
      need: '×0.04 in S4',
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

export function resolveStage4ScoreBreakdown(s0Move, s3Move, s4Move) {
  const stored = s4Move?.score_breakdown ?? s4Move?.features?.score_breakdown;
  if (stored) {
    const raw = stored.brilliance_score_raw ?? stored.brilliance_score;
    return {
      ...stored,
      brilliance_score_raw: raw,
      brilliance_score: raw,
    };
  }

  const nob = Number(
    s3Move?.non_obvious_score
    ?? s3Move?.features?.non_obvious_score
    ?? s3Move?.features?.engine?.non_obvious_score
    ?? 0
  );
  const surprise = Number(s4Move?.surprise_score ?? s4Move?.features?.surprise?.surprise_score ?? 0);
  const pb = Number(s4Move?.pb_score ?? s4Move?.features?.practical?.pb_score ?? 0);
  const defDiff = Number(
    s3Move?.defense_difficulty
    ?? s3Move?.features?.defense_difficulty
    ?? s3Move?.features?.engine?.defense_difficulty
    ?? 0
  );
  const tm = Number(
    s0Move?.multiplexing_score
    ?? s0Move?.tactical_multiplexing?.multiplexing_score
    ?? s0Move?.features?.tactical_multiplexing?.multiplexing_score
    ?? 0
  );
  const ev = Number(
    s0Move?.ev_score
    ?? s0Move?.expectation_violation?.ev_score
    ?? s0Move?.features?.expectation_violation?.ev_score
    ?? 0
  );
  const soundScore = Number(
    s3Move?.features?.engine?.deep_eval_sound_score
    ?? s3Move?.deep_eval_sound_score
    ?? 0
  );
  const spanScore = Number(
    s3Move?.features?.engine?.depth_eval_span_score
    ?? s3Move?.depth_eval_span_score
    ?? 0
  );

  const wNob = nob * 0.27;
  const wSurprise = surprise * 0.23;
  const wPb = pb * 0.18;
  const wDef = defDiff * 10 * 0.10;
  const wTm = tm * 0.08;
  const wEv = ev * 0.04;
  const wSound = soundScore * 0.06;
  const wSpan = spanScore * 0.04;
  const raw = Math.round((wNob + wSurprise + wPb + wDef + wTm + wEv + wSound + wSpan) * 100) / 100;
  const finalScore = s4Move?.brilliance_score_raw ?? s4Move?.brilliance_score ?? raw;

  return {
    components: {
      non_obvious_score: nob,
      surprise_score: surprise,
      pb_score: pb,
      defense_difficulty: defDiff,
      multiplexing_score: tm,
      ev_score: ev,
      deep_eval_sound_score: soundScore,
      depth_eval_span_score: spanScore,
    },
    weights: {
      non_obvious_score: 0.27,
      surprise_score: 0.23,
      pb_score: 0.18,
      defense_difficulty: 1.0,
      multiplexing_score: 0.08,
      ev_score: 0.04,
      deep_eval_sound_score: 0.06,
      depth_eval_span_score: 0.04,
    },
    weighted: {
      non_obvious_score: Math.round(wNob * 1000) / 1000,
      surprise_score: Math.round(wSurprise * 1000) / 1000,
      pb_score: Math.round(wPb * 1000) / 1000,
      defense_difficulty: Math.round(wDef * 1000) / 1000,
      multiplexing_score: Math.round(wTm * 1000) / 1000,
      ev_score: Math.round(wEv * 1000) / 1000,
      deep_eval_sound_score: Math.round(wSound * 1000) / 1000,
      depth_eval_span_score: Math.round(wSpan * 1000) / 1000,
    },
    quiet_bonus: 0,
    defensive_bonus: 0,
    brilliance_score_raw: s4Move?.brilliance_score_raw ?? raw,
    brilliance_score: finalScore,
  };
}

function stage4ComponentRow(label, componentKey, breakdown, weightLabel) {
  const got = breakdown.components?.[componentKey];
  const weighted = breakdown.weighted?.[componentKey];
  return {
    label,
    got: got ?? '—',
    need: weighted != null ? `${weightLabel} → ${weighted}` : weightLabel,
    pass: null,
    na: true,
  };
}

export function buildStage4Rows(s0Move, s3Move, s4Move) {
  if (!s3Move?.proceed_to_stage4 || !s4Move) return [];

  const breakdown = resolveStage4ScoreBreakdown(s0Move, s3Move, s4Move);
  const rows = [
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
    stage4ComponentRow('NOB score', 'non_obvious_score', breakdown, '×0.27'),
    stage4ComponentRow('Surprise', 'surprise_score', breakdown, '×0.23'),
  ];

  const surpriseDetail = s4Move?.features?.surprise ?? s4Move?.surprise ?? null;
  if (surpriseDetail) {
    const good = surpriseDetail.good_moves_top5;
    const legal = surpriseDetail.legal_moves;
    const rank = surpriseDetail.rank_at_depth8;
    if (good != null && legal != null) {
      rows.push({
        label: 'Surprise inputs',
        got: `good ${good}/5 · rank ${rank ?? '—'} · legal ${legal}`,
        need: '—',
        pass: null,
        na: true,
      });
    }
    if (surpriseDetail.product_term != null || surpriseDetail.ev_term != null) {
      const inner = surpriseDetail.inner_sum
        ?? ((surpriseDetail.engine_term ?? surpriseDetail.product_term ?? 0)
          + (surpriseDetail.ev_term ?? 0));
      rows.push({
        label: 'Surprise formula',
        got: `1 − (${inner}) → ×10 = ${surpriseDetail.surprise_score ?? '—'}`,
        need: '1 − (g/5×r×RF + 0.15×EV)',
        pass: null,
        na: true,
      });
    }
  }

  rows.push(
    stage4ComponentRow('PB score', 'pb_score', breakdown, '×0.18'),
    stage4ComponentRow('Defense diff', 'defense_difficulty', breakdown, '×1.0'),
    stage4ComponentRow('Sound score', 'deep_eval_sound_score', breakdown, '×0.06'),
    stage4ComponentRow('Span score', 'depth_eval_span_score', breakdown, '×0.04'),
    stage4ComponentRow('TM', 'multiplexing_score', breakdown, '×0.08'),
    stage4ComponentRow('EV', 'ev_score', breakdown, '×0.04'),
  );

  if (breakdown.quiet_bonus > 0) {
    rows.push({
      label: 'Quiet bonus',
      got: breakdown.quiet_bonus,
      need: '—',
      pass: null,
      na: true,
    });
  }
  if (breakdown.defensive_bonus > 0) {
    rows.push({
      label: 'Defensive bonus',
      got: breakdown.defensive_bonus,
      need: '—',
      pass: null,
      na: true,
    });
  }

  rows.push({
    label: 'Final score',
    got: breakdown.brilliance_score ?? s4Move.brilliance_score ?? '—',
    need: '≥ 6.5 brilliant',
    pass: s4Move.is_brilliant ?? (breakdown.brilliance_score != null && breakdown.brilliance_score >= 6.5),
    highlight: true,
  });

  if (s4Move.is_tal_zone != null) {
    rows.push({
      label: 'Tal zone',
      got: s4Move.is_tal_zone ? 'true' : 'false',
      need: '—',
      pass: null,
      na: true,
    });
  }

  return rows;
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
      'Deep eval', 'Sound score', 'CPL deep', 'Sound (telemetry)', 'NOB score', 'Rank d8', 'Rank d18', 'Rank jump',
      'Rising curve', 'Depth gain', 'd1−d18 span', 'Span score', 'Defense diff', '→ Stage 4',
    ],
  },
  {
    stage: 4,
    title: 'Stage 4',
    fill: 'FFFDE68A',
    checks: [
      'Class', 'Archetype', 'NOB score', 'Surprise', 'PB score', 'Defense diff', 'TM', 'EV',
      'Final score', 'Tal zone',
    ],
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
    4: buildStage4Rows(s0, s3, s4),
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
