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
       stage1_status, stage1_run_at, stage1_candidate_count, stage1_proceed_stage2_count, stage1_error,
       stage2_status, stage2_run_at, stage2_analyzed_count, stage2_proceed_stage3_count, stage2_error,
       stage3_status, stage3_run_at, stage3_analyzed_count, stage3_sound_count, stage3_error,
       stage4_status, stage4_run_at, stage4_analyzed_count, stage4_brilliant_count, stage4_error,
       synced_at, updated_at
     ) VALUES (
       $1, $2, $3,
       $4, $5, $6, $7,
       $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17,
       $18, $19, $20, $21, $22,
       $23, $24, $25, $26, $27,
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

async function syncStage0(chessComUuid, moves) {
  await replaceStageRows('chess_com_brilliance_stage0', chessComUuid, moves, async (uuid, m) => {
    const features = m.features || m;
    await pgDb.query(
      `INSERT INTO chess_com_brilliance_stage0 (
         chess_com_uuid, ply_index, san_move, turn, game_phase, see_value,
         is_capture, is_sacrifice_candidate, proceed_to_stage1,
         king_safety_delta, multiplexing_score, ev_score, harmony_score,
         novelty_score, early_game_blocked, features_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        uuid,
        m.ply_index,
        m.san_move,
        m.turn,
        m.game_phase,
        m.see_value,
        Boolean(m.is_capture),
        Boolean(m.is_sacrifice_candidate),
        Boolean(m.proceed_to_stage1),
        m.king_safety_delta,
        m.multiplexing_score,
        m.ev_score,
        m.harmony_score,
        features?.novelty_score ?? m.novelty_score ?? null,
        Boolean(features?.early_game_blocked ?? m.early_game_blocked),
        JSON.stringify(features),
      ]
    );
  });
}

async function syncStage1(chessComUuid, moves) {
  await replaceStageRows('chess_com_brilliance_stage1', chessComUuid, moves, async (uuid, m) => {
    const features = m.features || m;
    const disq = features?.sacrifice_class?.disqualifiers ?? features?.disqualifiers ?? [];
    await pgDb.query(
      `INSERT INTO chess_com_brilliance_stage1 (
         chess_com_uuid, ply_index, san_move, turn, sac_type,
         is_valid_sacrifice, is_forced, proceed_to_stage2, gate_fail_reason,
         material_loss_cp, features_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        uuid,
        m.ply_index,
        m.san_move,
        m.turn,
        m.sac_type,
        Boolean(m.is_valid_sacrifice),
        Boolean(m.is_forced),
        Boolean(m.proceed_to_stage2),
        m.gate_fail_reason,
        m.material_loss_cp,
        JSON.stringify({ ...features, disqualifiers: disq }),
      ]
    );
  });
}

async function syncStage2(chessComUuid, moves) {
  await replaceStageRows('chess_com_brilliance_stage2', chessComUuid, moves, async (uuid, m) => {
    const features = m.features || m;
    await pgDb.query(
      `INSERT INTO chess_com_brilliance_stage2 (
         chess_com_uuid, ply_index, san_move, turn,
         cpl_shallow, ep_delta_shallow, our_rank_in_top5, is_best_or_near_best,
         proceed_to_stage3, gate_fail_reason, features_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        uuid,
        m.ply_index,
        m.san_move,
        m.turn,
        m.cpl_shallow,
        m.ep_delta_shallow,
        m.our_rank_in_top5,
        Boolean(m.is_best_or_near_best),
        Boolean(m.proceed_to_stage3),
        m.gate_fail_reason,
        JSON.stringify(features),
      ]
    );
  });
}

async function syncStage3(chessComUuid, moves) {
  await replaceStageRows('chess_com_brilliance_stage3', chessComUuid, moves, async (uuid, m) => {
    const features = m.features || m;
    await pgDb.query(
      `INSERT INTO chess_com_brilliance_stage3 (
         chess_com_uuid, ply_index, san_move, turn, deep_eval_cp,
         is_sound, non_obvious_score, rank_at_depth8, rank_at_depth22, rank_jump,
         proceed_to_stage4, gate_fail_reason, features_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        uuid,
        m.ply_index,
        m.san_move,
        m.turn,
        m.deep_eval_cp,
        Boolean(m.is_sound),
        m.non_obvious_score,
        m.rank_at_depth8,
        m.rank_at_depth22,
        m.rank_jump,
        Boolean(m.proceed_to_stage4),
        m.gate_fail_reason,
        JSON.stringify(features),
      ]
    );
  });
}

async function syncStage4(chessComUuid, moves) {
  await replaceStageRows('chess_com_brilliance_stage4', chessComUuid, moves, async (uuid, m) => {
    const features = m.features || m;
    await pgDb.query(
      `INSERT INTO chess_com_brilliance_stage4 (
         chess_com_uuid, ply_index, san_move, turn, sac_type, player_rating,
         surprise_score, pb_score, pb_category, archetype,
         brilliance_score, brilliance_score_raw, novelty_score,
         classification, is_brilliant, features_json, sqlite_stage4_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        uuid,
        m.ply_index,
        m.san_move,
        m.turn,
        m.sac_type,
        m.player_rating,
        m.surprise_score,
        m.pb_score,
        m.pb_category,
        m.archetype,
        m.brilliance_score,
        features?.brilliance_score_raw ?? m.brilliance_score_raw ?? null,
        features?.novelty_score ?? m.novelty_score ?? null,
        m.classification,
        Boolean(m.is_brilliant),
        JSON.stringify(features),
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

  await pgDb.query('BEGIN');
  try {
    await upsertBrillianceRun(uuid, sqliteGameId, { stage0, stage1, stage2, stage3, stage4 });
    await syncStage0(uuid, stage0.moves || []);
    await syncStage1(uuid, stage1.moves || []);
    await syncStage2(uuid, stage2.moves || []);
    await syncStage3(uuid, stage3.moves || []);
    await syncStage4(uuid, stage4.moves || []);
    await pgDb.query('COMMIT');
  } catch (err) {
    await pgDb.query('ROLLBACK');
    throw err;
  }

  return { chessComUuid: uuid, sqliteGameId };
}

async function getBrillianceRun(chessComUuid) {
  const { rows } = await pgDb.query(
    `SELECT * FROM chess_com_brilliance_runs WHERE chess_com_uuid = $1`,
    [chessComUuid]
  );
  return rows[0] || null;
}

function mapPgStage0Row(row) {
  const features = row.features_json || {};
  return {
    id: Number(row.id),
    ply_index: row.ply_index,
    san_move: row.san_move,
    turn: row.turn,
    game_phase: row.game_phase,
    see_value: row.see_value,
    is_capture: row.is_capture,
    is_sacrifice_candidate: row.is_sacrifice_candidate,
    proceed_to_stage1: row.proceed_to_stage1,
    king_safety_delta: row.king_safety_delta,
    multiplexing_score: row.multiplexing_score,
    ev_score: row.ev_score,
    harmony_score: row.harmony_score,
    novelty_score: row.novelty_score,
    early_game_blocked: row.early_game_blocked,
    features,
  };
}

function mapPgStage1Row(row) {
  const features = row.features_json || {};
  return {
    id: Number(row.id),
    ply_index: row.ply_index,
    san_move: row.san_move,
    turn: row.turn,
    sac_type: row.sac_type,
    is_valid_sacrifice: row.is_valid_sacrifice,
    is_forced: row.is_forced,
    proceed_to_stage2: row.proceed_to_stage2,
    gate_fail_reason: row.gate_fail_reason,
    material_loss_cp: row.material_loss_cp,
    disqualifiers: features.disqualifiers || [],
    features,
  };
}

function mapPgStage2Row(row) {
  const features = row.features_json || {};
  return {
    id: Number(row.id),
    ply_index: row.ply_index,
    san_move: row.san_move,
    turn: row.turn,
    cpl_shallow: row.cpl_shallow,
    ep_delta_shallow: row.ep_delta_shallow,
    our_rank_in_top5: row.our_rank_in_top5,
    is_best_or_near_best: row.is_best_or_near_best,
    proceed_to_stage3: row.proceed_to_stage3,
    gate_fail_reason: row.gate_fail_reason,
    features,
  };
}

function mapPgStage3Row(row) {
  const features = row.features_json || {};
  return {
    id: Number(row.id),
    ply_index: row.ply_index,
    san_move: row.san_move,
    turn: row.turn,
    deep_eval_cp: row.deep_eval_cp,
    is_sound: row.is_sound,
    non_obvious_score: row.non_obvious_score,
    rank_at_depth8: row.rank_at_depth8,
    rank_at_depth22: row.rank_at_depth22,
    rank_jump: row.rank_jump,
    proceed_to_stage4: row.proceed_to_stage4,
    gate_fail_reason: row.gate_fail_reason,
    features,
  };
}

function mapPgStage4Row(row) {
  const features = row.features_json || {};
  return {
    id: Number(row.id),
    ply_index: row.ply_index,
    san_move: row.san_move,
    turn: row.turn,
    sac_type: row.sac_type,
    player_rating: row.player_rating,
    surprise_score: row.surprise_score,
    pb_score: row.pb_score,
    pb_category: row.pb_category,
    archetype: row.archetype,
    brilliance_score: row.brilliance_score,
    brilliance_score_raw: row.brilliance_score_raw,
    novelty_score: row.novelty_score,
    classification: row.classification,
    is_brilliant: row.is_brilliant,
    features,
  };
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

async function migrateAllSqliteBrillianceToSupabase() {
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
  let failed = 0;

  for (const game of uniqueGames) {
    try {
      const existingRun = await getBrillianceRun(game.lichess_game_id);
      if (existingRun?.sqlite_game_id === game.id && existingRun?.stage4_status === 'completed') {
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

  return { synced, failed, total: uniqueGames.length };
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
