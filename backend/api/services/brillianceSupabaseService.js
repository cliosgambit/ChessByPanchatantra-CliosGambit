const pgDb = require('../config/database');
const { db: sqliteDb } = require('../../brilliance/db/database');
const { getStage0Features } = require('../../brilliance/services/brillianceStage0Service');
const { getStage1Features } = require('../../brilliance/services/brillianceStage1Service');
const { getStage2Features } = require('../../brilliance/services/brillianceStage2Service');
const { getStage3Features } = require('../../brilliance/services/brillianceStage3Service');
const { getStage4Features } = require('../../brilliance/services/brillianceStage4Service');

function resolveChessComUuid(sqliteGameId, explicitUuid) {
  if (explicitUuid) return explicitUuid;
  const row = sqliteDb
    .prepare('SELECT lichess_game_id FROM lichess_pgn_games WHERE id = ?')
    .get(sqliteGameId);
  return row?.lichess_game_id || null;
}

async function upsertBrillianceRun(chessComUuid, sqliteGameId, stages) {
  const s0 = stages.stage0 || {};
  const s1 = stages.stage1 || {};
  const s2 = stages.stage2 || {};
  const s3 = stages.stage3 || {};
  const s4 = stages.stage4 || {};

  await pgDb.query(
    `INSERT INTO chess_com_brilliance_runs (
       chess_com_uuid, sqlite_game_id, move_count,
       stage0_status, stage0_run_at, stage0_sacrifice_count, stage0_error,
       stage1_status, stage1_run_at, stage1_candidate_count, stage1_proceed_stage2_count, stage1_valid_count, stage1_error,
       stage2_status, stage2_run_at, stage2_analyzed_count, stage2_proceed_stage3_count, stage2_error,
       stage3_status, stage3_run_at, stage3_analyzed_count, stage3_sound_count, stage3_error,
       stage4_status, stage4_run_at, stage4_analyzed_count, stage4_brilliant_count, stage4_error,
       synced_at, updated_at
     ) VALUES (
       $1, $2, $3,
       $4, $5, $6, $7,
       $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18,
       $19, $20, $21, $22, $23,
       $24, $25, $26, $27, $28,
       NOW(), NOW()
     )
     ON CONFLICT (chess_com_uuid) DO UPDATE SET
       sqlite_game_id = EXCLUDED.sqlite_game_id,
       move_count = EXCLUDED.move_count,
       stage0_status = EXCLUDED.stage0_status,
       stage0_run_at = EXCLUDED.stage0_run_at,
       stage0_sacrifice_count = EXCLUDED.stage0_sacrifice_count,
       stage0_error = EXCLUDED.stage0_error,
       stage1_status = EXCLUDED.stage1_status,
       stage1_run_at = EXCLUDED.stage1_run_at,
       stage1_candidate_count = EXCLUDED.stage1_candidate_count,
       stage1_proceed_stage2_count = EXCLUDED.stage1_proceed_stage2_count,
       stage1_valid_count = EXCLUDED.stage1_valid_count,
       stage1_error = EXCLUDED.stage1_error,
       stage2_status = EXCLUDED.stage2_status,
       stage2_run_at = EXCLUDED.stage2_run_at,
       stage2_analyzed_count = EXCLUDED.stage2_analyzed_count,
       stage2_proceed_stage3_count = EXCLUDED.stage2_proceed_stage3_count,
       stage2_error = EXCLUDED.stage2_error,
       stage3_status = EXCLUDED.stage3_status,
       stage3_run_at = EXCLUDED.stage3_run_at,
       stage3_analyzed_count = EXCLUDED.stage3_analyzed_count,
       stage3_sound_count = EXCLUDED.stage3_sound_count,
       stage3_error = EXCLUDED.stage3_error,
       stage4_status = EXCLUDED.stage4_status,
       stage4_run_at = EXCLUDED.stage4_run_at,
       stage4_analyzed_count = EXCLUDED.stage4_analyzed_count,
       stage4_brilliant_count = EXCLUDED.stage4_brilliant_count,
       stage4_error = EXCLUDED.stage4_error,
       synced_at = NOW(),
       updated_at = NOW()`,
    [
      chessComUuid,
      sqliteGameId,
      s0.move_count ?? 0,
      s0.status ?? 'pending',
      s0.run_at ?? null,
      s0.sacrifice_candidate_count ?? 0,
      s0.error ?? null,
      s1.status ?? 'pending',
      s1.run_at ?? null,
      s1.candidate_count ?? 0,
      s1.proceed_to_stage2_count ?? 0,
      s1.valid_sacrifice_count ?? s1.valid_count ?? 0,
      s1.error ?? null,
      s2.status ?? 'pending',
      s2.run_at ?? null,
      s2.analyzed_count ?? 0,
      s2.proceed_to_stage3_count ?? 0,
      s2.error ?? null,
      s3.status ?? 'pending',
      s3.run_at ?? null,
      s3.analyzed_count ?? 0,
      s3.sound_count ?? 0,
      s3.error ?? null,
      s4.status ?? 'pending',
      s4.run_at ?? null,
      s4.analyzed_count ?? 0,
      s4.brilliant_count ?? 0,
      s4.error ?? null,
    ]
  );
}

async function replaceStageRows(table, chessComUuid, rows, inserter) {
  const seen = new Set();
  const uniqueRows = [];
  for (const row of rows) {
    const ply = row.ply_index;
    if (ply == null || seen.has(ply)) continue;
    seen.add(ply);
    uniqueRows.push(row);
  }

  await pgDb.query(`DELETE FROM ${table} WHERE chess_com_uuid = $1`, [chessComUuid]);
  for (const row of uniqueRows) {
    await inserter(chessComUuid, row);
  }
}

/** Store the exact test-page parsed move object (plus a snapshot marker). */
function moveSnapshotJson(m) {
  return JSON.stringify({ _snapshot: 1, ...m });
}

async function syncStage0(chessComUuid, moves) {
  await replaceStageRows('chess_com_brilliance_stage0', chessComUuid, moves, async (uuid, m) => {
    await pgDb.query(
      `INSERT INTO chess_com_brilliance_stage0 (
         chess_com_uuid, ply_index, san_move, turn, game_phase, see_value,
         is_capture, is_sacrifice_candidate, was_piece_hanging, proceed_to_stage1,
         king_safety_delta, multiplexing_score, ev_score, harmony_score,
         control_delta, activity_delta, is_check, moving_piece_type,
         dest_attackers, dest_defenders,
         novelty_score, early_game_blocked, features_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
      [
        uuid,
        m.ply_index,
        m.san_move,
        m.turn,
        m.game_phase,
        m.see_value,
        Boolean(m.is_capture),
        Boolean(m.is_sacrifice_candidate),
        Boolean(m.was_piece_hanging),
        Boolean(m.proceed_to_stage1),
        m.king_safety_delta,
        m.multiplexing_score,
        m.ev_score,
        m.harmony_score,
        m.control_delta ?? null,
        m.activity_delta ?? null,
        Boolean(m.is_check),
        m.moving_piece_type ?? null,
        m.dest_attackers ?? null,
        m.dest_defenders ?? null,
        m.novelty_score ?? m.features?.novelty_score ?? null,
        Boolean(m.early_game_blocked ?? m.features?.early_game_blocked),
        moveSnapshotJson(m),
      ]
    );
  });
}

async function syncStage1(chessComUuid, moves) {
  await replaceStageRows('chess_com_brilliance_stage1', chessComUuid, moves, async (uuid, m) => {
    const disq =
      m.disqualifiers ??
      m.features?.sacrifice_class?.disqualifiers ??
      m.features?.disqualifiers ??
      [];
    await pgDb.query(
      `INSERT INTO chess_com_brilliance_stage1 (
         chess_com_uuid, ply_index, san_move, turn, sac_type,
         is_valid_sacrifice, is_pseudo, is_forced, proceed_to_stage2, gate_fail_reason,
         material_loss_cp, sacrifice_uncertainty, recapture_options, forced_reason, n_legal,
         disqualifiers_json, features_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        uuid,
        m.ply_index,
        m.san_move,
        m.turn,
        m.sac_type,
        Boolean(m.is_valid_sacrifice),
        Boolean(m.is_pseudo),
        Boolean(m.is_forced),
        Boolean(m.proceed_to_stage2),
        m.gate_fail_reason,
        m.material_loss_cp,
        m.sacrifice_uncertainty ?? null,
        m.recapture_options ?? null,
        m.forced_reason ?? null,
        m.n_legal ?? null,
        JSON.stringify(disq),
        moveSnapshotJson(m),
      ]
    );
  });
}

async function syncStage2(chessComUuid, moves) {
  await replaceStageRows('chess_com_brilliance_stage2', chessComUuid, moves, async (uuid, m) => {
    await pgDb.query(
      `INSERT INTO chess_com_brilliance_stage2 (
         chess_com_uuid, ply_index, san_move, turn, sac_type,
         best_move, best_score_cp, our_score_cp, our_rank_in_top5,
         cpl_shallow, ep_delta_shallow, is_forced_engine, n_reasonable_moves, response_width,
         is_best_or_near_best, proceed_to_stage3, gate_fail_reason, classification_if_fail,
         engine_depth, features_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        uuid,
        m.ply_index,
        m.san_move,
        m.turn,
        m.sac_type ?? null,
        m.best_move ?? null,
        m.best_score_cp ?? null,
        m.our_score_cp ?? null,
        m.our_rank_in_top5,
        m.cpl_shallow,
        m.ep_delta_shallow,
        Boolean(m.is_forced_engine),
        m.n_reasonable_moves ?? null,
        m.response_width ?? null,
        Boolean(m.is_best_or_near_best),
        Boolean(m.proceed_to_stage3),
        m.gate_fail_reason,
        m.classification_if_fail ?? null,
        m.engine_depth ?? 12,
        moveSnapshotJson(m),
      ]
    );
  });
}

async function syncStage3(chessComUuid, moves) {
  await replaceStageRows('chess_com_brilliance_stage3', chessComUuid, moves, async (uuid, m) => {
    await pgDb.query(
      `INSERT INTO chess_com_brilliance_stage3 (
         chess_com_uuid, ply_index, san_move, turn, sac_type, deep_eval_cp,
         depth_slope, depth_gain, depth_variance, early_eval_avg, late_eval_avg,
         is_rising_curve, is_sound, is_non_obvious,
         rank_at_depth8, rank_at_depth22, rank_jump,
         good_defenses, defense_difficulty, counterfactual_delta, non_obvious_score,
         classification_if_unsound, proceed_to_stage4, gate_fail_reason,
         engine_depth, depth_evals_json, eval_perspective, features_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
      [
        uuid,
        m.ply_index,
        m.san_move,
        m.turn,
        m.sac_type ?? null,
        m.deep_eval_cp,
        m.depth_slope ?? null,
        m.depth_gain ?? null,
        m.depth_variance ?? null,
        m.early_eval_avg ?? null,
        m.late_eval_avg ?? null,
        Boolean(m.is_rising_curve),
        Boolean(m.is_sound),
        Boolean(m.is_non_obvious),
        m.rank_at_depth8,
        m.rank_at_depth22,
        m.rank_jump,
        m.good_defenses ?? null,
        m.defense_difficulty ?? null,
        m.counterfactual_delta ?? null,
        m.non_obvious_score,
        m.classification_if_unsound ?? null,
        m.proceed_to_stage4 == null ? 1 : Boolean(m.proceed_to_stage4),
        m.gate_fail_reason,
        m.engine_depth ?? 25,
        m.depth_evals ? JSON.stringify(m.depth_evals) : m.depth_evals_json ?? null,
        m.eval_perspective || 'white',
        moveSnapshotJson(m),
      ]
    );
  });
}

async function syncStage4(chessComUuid, moves) {
  await replaceStageRows('chess_com_brilliance_stage4', chessComUuid, moves, async (uuid, m) => {
    await pgDb.query(
      `INSERT INTO chess_com_brilliance_stage4 (
         chess_com_uuid, ply_index, san_move, turn, sac_type, player_rating,
         surprise_score, info_surprise_bits, brilliant_for_rating,
         pb_score, pb_category, obj_quality, practical_value, is_tal_zone, archetype,
         brilliance_score, brilliance_score_raw, novelty_score,
         classification, is_brilliant, features_json, sqlite_stage4_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        uuid,
        m.ply_index,
        m.san_move,
        m.turn,
        m.sac_type,
        m.player_rating,
        m.surprise_score,
        m.info_surprise_bits ?? null,
        Boolean(m.brilliant_for_rating),
        m.pb_score,
        m.pb_category,
        m.obj_quality ?? null,
        m.practical_value ?? null,
        Boolean(m.is_tal_zone),
        m.archetype,
        m.brilliance_score,
        m.brilliance_score_raw ?? m.features?.brilliance_score_raw ?? null,
        m.novelty_score ?? m.features?.novelty_score ?? null,
        m.classification,
        Boolean(m.is_brilliant),
        moveSnapshotJson(m),
        m.id ?? null,
      ]
    );
  });
}

async function syncBrillianceGameToSupabase(sqliteGameId, chessComUuid = null) {
  const uuid = resolveChessComUuid(sqliteGameId, chessComUuid);
  if (!uuid) {
    throw new Error(`Cannot sync brilliance: no chess_com_uuid for sqlite game ${sqliteGameId}`);
  }

  const stage0 = getStage0Features(sqliteGameId);
  const stage1 = getStage1Features(sqliteGameId);
  const stage2 = getStage2Features(sqliteGameId);
  const stage3 = getStage3Features(sqliteGameId);
  const stage4 = getStage4Features(sqliteGameId);

  // Serialize on the shared SQLite connection (parallel All Games analysis used to nest BEGIN).
  await pgDb.withTransaction(async () => {
    await upsertBrillianceRun(uuid, sqliteGameId, { stage0, stage1, stage2, stage3, stage4 });
    await syncStage0(uuid, stage0.moves || []);
    await syncStage1(uuid, stage1.moves || []);
    await syncStage2(uuid, stage2.moves || []);
    await syncStage3(uuid, stage3.moves || []);
    await syncStage4(uuid, stage4.moves || []);
  });

  return { chessComUuid: uuid, sqliteGameId };
}

async function getBrillianceRun(chessComUuid) {
  const { rows } = await pgDb.query(
    `SELECT * FROM chess_com_brilliance_runs WHERE chess_com_uuid = $1`,
    [chessComUuid]
  );
  return rows[0] || null;
}

function parseJsonField(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Restore the exact test-page move object when features_json is a full snapshot.
 * Falls back to slim column mapping for older rows.
 */
function mapFromSnapshotOrColumns(row, legacyMapper) {
  const snap = parseJsonField(row.features_json);
  if (snap && snap._snapshot === 1) {
    const { _snapshot, ...move } = snap;
    return {
      ...move,
      id: Number(row.id),
      ply_index: row.ply_index ?? move.ply_index,
    };
  }
  return legacyMapper(row, snap);
}

function mapPgStage0Row(row) {
  return mapFromSnapshotOrColumns(row, (r, features) => ({
    id: Number(r.id),
    ply_index: r.ply_index,
    san_move: r.san_move,
    turn: r.turn,
    game_phase: r.game_phase,
    see_value: r.see_value,
    is_capture: r.is_capture,
    is_sacrifice_candidate: r.is_sacrifice_candidate,
    was_piece_hanging: r.was_piece_hanging,
    proceed_to_stage1: r.proceed_to_stage1,
    king_safety_delta: r.king_safety_delta,
    multiplexing_score: r.multiplexing_score,
    ev_score: r.ev_score,
    harmony_score: r.harmony_score,
    control_delta: r.control_delta,
    activity_delta: r.activity_delta,
    is_check: r.is_check,
    moving_piece_type: r.moving_piece_type,
    dest_attackers: r.dest_attackers,
    dest_defenders: r.dest_defenders,
    novelty_score: r.novelty_score,
    early_game_blocked: r.early_game_blocked,
    features,
  }));
}

function mapPgStage1Row(row) {
  return mapFromSnapshotOrColumns(row, (r, features) => {
    let disq = features.disqualifiers || [];
    if (r.disqualifiers_json) {
      const parsed = parseJsonField(r.disqualifiers_json);
      if (Array.isArray(parsed)) disq = parsed;
    }
    return {
      id: Number(r.id),
      ply_index: r.ply_index,
      san_move: r.san_move,
      turn: r.turn,
      sac_type: r.sac_type,
      is_valid_sacrifice: r.is_valid_sacrifice,
      is_pseudo: r.is_pseudo,
      is_forced: r.is_forced,
      proceed_to_stage2: r.proceed_to_stage2,
      gate_fail_reason: r.gate_fail_reason,
      material_loss_cp: r.material_loss_cp,
      sacrifice_uncertainty: r.sacrifice_uncertainty,
      recapture_options: r.recapture_options,
      forced_reason: r.forced_reason,
      n_legal: r.n_legal,
      disqualifiers: disq,
      features,
    };
  });
}

function mapPgStage2Row(row) {
  return mapFromSnapshotOrColumns(row, (r, features) => ({
    id: Number(r.id),
    ply_index: r.ply_index,
    san_move: r.san_move,
    turn: r.turn,
    sac_type: r.sac_type,
    best_move: r.best_move,
    best_score_cp: r.best_score_cp,
    our_score_cp: r.our_score_cp,
    cpl_shallow: r.cpl_shallow,
    ep_delta_shallow: r.ep_delta_shallow,
    our_rank_in_top5: r.our_rank_in_top5,
    is_forced_engine: r.is_forced_engine,
    n_reasonable_moves: r.n_reasonable_moves,
    response_width: r.response_width,
    is_best_or_near_best: r.is_best_or_near_best,
    proceed_to_stage3: r.proceed_to_stage3,
    gate_fail_reason: r.gate_fail_reason,
    classification_if_fail: r.classification_if_fail,
    engine_depth: r.engine_depth,
    features,
  }));
}

function mapPgStage3Row(row) {
  return mapFromSnapshotOrColumns(row, (r, features) => ({
    id: Number(r.id),
    ply_index: r.ply_index,
    san_move: r.san_move,
    turn: r.turn,
    sac_type: r.sac_type,
    deep_eval_cp: r.deep_eval_cp,
    depth_slope: r.depth_slope,
    depth_gain: r.depth_gain,
    depth_variance: r.depth_variance,
    early_eval_avg: r.early_eval_avg,
    late_eval_avg: r.late_eval_avg,
    is_rising_curve: r.is_rising_curve,
    is_sound: r.is_sound,
    is_non_obvious: r.is_non_obvious,
    non_obvious_score: r.non_obvious_score,
    rank_at_depth8: r.rank_at_depth8,
    rank_at_depth22: r.rank_at_depth22,
    rank_jump: r.rank_jump,
    good_defenses: r.good_defenses,
    defense_difficulty: r.defense_difficulty,
    counterfactual_delta: r.counterfactual_delta,
    classification_if_unsound: r.classification_if_unsound,
    proceed_to_stage4: r.proceed_to_stage4,
    gate_fail_reason: r.gate_fail_reason,
    engine_depth: r.engine_depth,
    depth_evals: parseJsonField(r.depth_evals_json),
    eval_perspective: r.eval_perspective || 'white',
    features,
  }));
}

function mapPgStage4Row(row) {
  return mapFromSnapshotOrColumns(row, (r, features) => ({
    id: Number(r.id),
    ply_index: r.ply_index,
    san_move: r.san_move,
    turn: r.turn,
    sac_type: r.sac_type,
    player_rating: r.player_rating,
    surprise_score: r.surprise_score,
    info_surprise_bits: r.info_surprise_bits,
    brilliant_for_rating: r.brilliant_for_rating,
    pb_score: r.pb_score,
    pb_category: r.pb_category,
    obj_quality: r.obj_quality,
    practical_value: r.practical_value,
    is_tal_zone: r.is_tal_zone,
    archetype: r.archetype,
    brilliance_score: r.brilliance_score,
    brilliance_score_raw: r.brilliance_score_raw,
    novelty_score: r.novelty_score,
    classification: r.classification,
    is_brilliant: r.is_brilliant,
    features,
  }));
}

function runSummaryFromPg(run, stageKey, extra = {}) {
  if (!run) return null;
  const usesEngine = stageKey === 'stage2' || stageKey === 'stage3';
  return {
    status: run[`${stageKey}_status`],
    run_at: run[`${stageKey}_run_at`],
    error: run[`${stageKey}_error`],
    engine_used: usesEngine,
    ...extra,
  };
}

async function getBrillianceStagesFromSupabase(chessComUuid) {
  const run = await getBrillianceRun(chessComUuid);
  if (!run) return null;

  const [s0, s1, s2, s3, s4] = await Promise.all([
    pgDb.query(
      `SELECT * FROM chess_com_brilliance_stage0 WHERE chess_com_uuid = $1 ORDER BY ply_index`,
      [chessComUuid]
    ),
    pgDb.query(
      `SELECT * FROM chess_com_brilliance_stage1 WHERE chess_com_uuid = $1 ORDER BY ply_index`,
      [chessComUuid]
    ),
    pgDb.query(
      `SELECT * FROM chess_com_brilliance_stage2 WHERE chess_com_uuid = $1 ORDER BY ply_index`,
      [chessComUuid]
    ),
    pgDb.query(
      `SELECT * FROM chess_com_brilliance_stage3 WHERE chess_com_uuid = $1 ORDER BY ply_index`,
      [chessComUuid]
    ),
    pgDb.query(
      `SELECT * FROM chess_com_brilliance_stage4 WHERE chess_com_uuid = $1 ORDER BY ply_index`,
      [chessComUuid]
    ),
  ]);

  const stage0Moves = s0.rows.map(mapPgStage0Row);
  const stage1Moves = s1.rows.map(mapPgStage1Row);
  const stage2Moves = s2.rows.map(mapPgStage2Row);
  const stage3Moves = s3.rows.map(mapPgStage3Row);
  const stage4Moves = s4.rows.map(mapPgStage4Row);

  return {
    brillianceGameId: run.sqlite_game_id,
    chessComUuid,
    stage0: {
      ...runSummaryFromPg(run, 'stage0', {
        move_count: run.move_count,
        sacrifice_candidate_count: run.stage0_sacrifice_count,
        features_saved: stage0Moves.length,
      }),
      moves: stage0Moves,
    },
    stage1: {
      ...runSummaryFromPg(run, 'stage1', {
        candidate_count: run.stage1_candidate_count,
        proceed_to_stage2_count: run.stage1_proceed_stage2_count,
        valid_sacrifice_count: run.stage1_valid_count ?? 0,
        features_saved: stage1Moves.length,
      }),
      moves: stage1Moves,
    },
    stage2: {
      ...runSummaryFromPg(run, 'stage2', {
        analyzed_count: run.stage2_analyzed_count,
        proceed_to_stage3_count: run.stage2_proceed_stage3_count,
        features_saved: stage2Moves.length,
      }),
      moves: stage2Moves,
    },
    stage3: {
      ...runSummaryFromPg(run, 'stage3', {
        analyzed_count: run.stage3_analyzed_count,
        sound_count: run.stage3_sound_count,
        features_saved: stage3Moves.length,
      }),
      moves: stage3Moves,
    },
    stage4: {
      ...runSummaryFromPg(run, 'stage4', {
        analyzed_count: run.stage4_analyzed_count,
        brilliant_count: run.stage4_brilliant_count,
        practical_brilliant_count: stage4Moves.filter((m) =>
          ['BRILLIANT', 'practical_brilliant'].includes(m.classification)
        ).length,
        features_saved: stage4Moves.length,
      }),
      moves: stage4Moves,
    },
  };
}

async function listStage4MovesFromSupabase({ limit = 500 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  const { rows } = await pgDb.query(
    `SELECT
       s4.id,
       s4.chess_com_uuid,
       s4.ply_index,
       s4.san_move,
       s4.turn,
       s4.sac_type,
       s4.classification,
       s4.is_brilliant,
       s4.brilliance_score,
       s4.player_rating,
       s4.created_at,
       r.stage4_status,
       r.stage4_run_at,
       r.sqlite_game_id,
       m.fen_before AS fen_before_move,
       m.fen_after AS fen_after_move,
       CASE WHEN m.from_square IS NOT NULL AND m.to_square IS NOT NULL
         THEN m.from_square || m.to_square || COALESCE(m.promotion, '')
         ELSE NULL
       END AS uci_move
     FROM chess_com_brilliance_stage4 s4
     JOIN chess_com_brilliance_runs r ON r.chess_com_uuid = s4.chess_com_uuid
     LEFT JOIN chess_com_moves m
       ON m.chess_com_uuid = s4.chess_com_uuid AND m.ply = s4.ply_index + 1
     WHERE r.stage4_status = 'completed'
     ORDER BY r.stage4_run_at DESC NULLS LAST, s4.brilliance_score DESC NULLS LAST, s4.id DESC
     LIMIT $1`,
    [safeLimit]
  );
  return rows;
}

async function getStage4MoveFromSupabase(moveId) {
  const id = Number(moveId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const { rows } = await pgDb.query(
    `SELECT
       s4.*,
       r.stage4_status,
       r.stage4_run_at,
       m.fen_before AS fen_before_move,
       m.fen_after AS fen_after_move,
       CASE WHEN m.from_square IS NOT NULL AND m.to_square IS NOT NULL
         THEN m.from_square || m.to_square || COALESCE(m.promotion, '')
         ELSE NULL
       END AS uci_move
     FROM chess_com_brilliance_stage4 s4
     JOIN chess_com_brilliance_runs r ON r.chess_com_uuid = s4.chess_com_uuid
     LEFT JOIN chess_com_moves m
       ON m.chess_com_uuid = s4.chess_com_uuid AND m.ply = s4.ply_index + 1
     WHERE s4.id = $1 AND r.stage4_status = 'completed'
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function remapPuzzleStage4Ids(oldSqliteId, newPgId) {
  if (!oldSqliteId || !newPgId || oldSqliteId === newPgId) return;
  await pgDb.query(
    `UPDATE brilliant_move_puzzles
     SET stage4_move_id = $2, updated_at = NOW()
     WHERE stage4_move_id = $1`,
    [oldSqliteId, newPgId]
  );
}

async function hasTestPageSnapshot(chessComUuid) {
  const { rows } = await pgDb.query(
    `SELECT features_json FROM chess_com_brilliance_stage0
     WHERE chess_com_uuid = $1 LIMIT 1`,
    [chessComUuid]
  );
  if (!rows[0]) return false;
  const snap = parseJsonField(rows[0].features_json);
  return snap?._snapshot === 1;
}

async function migrateAllSqliteBrillianceToSupabase({ forceRefresh = false } = {}) {
  const games = sqliteDb
    .prepare(
      `SELECT id, lichess_game_id, stage4_status
       FROM lichess_pgn_games
       WHERE lichess_game_id IS NOT NULL AND lichess_game_id != ''
         AND stage4_status = 'completed'
       ORDER BY id ASC`
    )
    .all();

  const latestByUuid = new Map();
  for (const game of games) {
    const prev = latestByUuid.get(game.lichess_game_id);
    if (!prev || game.id > prev.id) {
      latestByUuid.set(game.lichess_game_id, game);
    }
  }

  const uniqueGames = [...latestByUuid.values()];
  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const game of uniqueGames) {
    try {
      // Only mirror into app DB when the Chess.com game row exists (FK).
      const { rows: gameRows } = await pgDb.query(
        `SELECT 1 AS ok FROM chess_com_games WHERE chess_com_uuid = $1 LIMIT 1`,
        [game.lichess_game_id]
      );
      if (!gameRows[0]) {
        skipped += 1;
        continue;
      }

      const existingRun = await getBrillianceRun(game.lichess_game_id);
      const alreadyFresh =
        existingRun?.sqlite_game_id === game.id &&
        existingRun?.stage4_status === 'completed' &&
        (await hasTestPageSnapshot(game.lichess_game_id));

      if (alreadyFresh && !forceRefresh) {
        synced += 1;
        continue;
      }

      const oldStage4 = sqliteDb
        .prepare('SELECT id, ply_index FROM lichess_pgn_stage4 WHERE game_id = ?')
        .all(game.id);
      const oldIdByPly = new Map(oldStage4.map((r) => [r.ply_index, r.id]));

      await syncBrillianceGameToSupabase(game.id, game.lichess_game_id);

      const { rows: newRows } = await pgDb.query(
        `SELECT id, ply_index, sqlite_stage4_id
         FROM chess_com_brilliance_stage4
         WHERE chess_com_uuid = $1`,
        [game.lichess_game_id]
      );

      for (const row of newRows) {
        const oldId = oldIdByPly.get(row.ply_index) ?? row.sqlite_stage4_id;
        if (oldId && Number(oldId) !== Number(row.id)) {
          await remapPuzzleStage4Ids(Number(oldId), Number(row.id));
        }
      }

      synced += 1;
    } catch (err) {
      failed += 1;
      console.warn(`Brilliance migrate failed game ${game.id}:`, err.message);
    }
  }

  return { synced, skipped, failed, total: uniqueGames.length };
}

module.exports = {
  syncBrillianceGameToSupabase,
  getBrillianceRun,
  getBrillianceStagesFromSupabase,
  listStage4MovesFromSupabase,
  getStage4MoveFromSupabase,
  migrateAllSqliteBrillianceToSupabase,
  remapPuzzleStage4Ids,
};
