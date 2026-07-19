const { Mutex } = require('async-mutex');
const pgDb = require('../config/database');
const { db: sqliteDb } = require('../../brilliance/db/database');
const { getStage0Features } = require('../../brilliance/services/brillianceStage0Service');
const { getStage1Features } = require('../../brilliance/services/brillianceStage1Service');
const { getStage2Features } = require('../../brilliance/services/brillianceStage2Service');
const { getStage3Features } = require('../../brilliance/services/brillianceStage3Service');
const { getStage4Features } = require('../../brilliance/services/brillianceStage4Service');

/** Serialize sync per game so workers + API cannot race. */
const syncMutexByUuid = new Map();

function withGameSyncLock(chessComUuid, fn) {
  const key = String(chessComUuid);
  let mutex = syncMutexByUuid.get(key);
  if (!mutex) {
    mutex = new Mutex();
    syncMutexByUuid.set(key, mutex);
  }
  return mutex.runExclusive(async () => {
    try {
      return await fn();
    } finally {
      if (!mutex.isLocked()) syncMutexByUuid.delete(key);
    }
  });
}

function resolveChessComUuid(sqliteGameId, explicitUuid) {
  if (explicitUuid) return explicitUuid;
  const row = sqliteDb
    .prepare('SELECT lichess_game_id FROM lichess_pgn_games WHERE id = ?')
    .get(sqliteGameId);
  return row?.lichess_game_id || null;
}

/**
 * Roll up stage0–stage4 into overall pipeline fields.
 * passed = stage4 completed (full pipeline finished, with or without brilliant moves).
 */
function derivePipelineMeta(stages) {
  const statuses = [0, 1, 2, 3, 4].map(
    (n) => stages[`stage${n}`]?.status || 'pending'
  );
  const brilliantCount = Number(stages.stage4?.brilliant_count) || 0;

  const failedIdx = statuses.findIndex((s) => s === 'failed');
  if (failedIdx >= 0) {
    return {
      pipelineStatus: 'failed',
      currentStage: failedIdx,
      hasBrilliantMoves: brilliantCount > 0,
      brilliantMoveCount: brilliantCount,
    };
  }

  if (statuses[4] === 'completed') {
    return {
      pipelineStatus: 'passed',
      currentStage: null,
      hasBrilliantMoves: brilliantCount > 0,
      brilliantMoveCount: brilliantCount,
    };
  }

  const runningIdx = statuses.findIndex((s) => s === 'running');
  if (runningIdx >= 0) {
    return {
      pipelineStatus: 'running',
      currentStage: runningIdx,
      hasBrilliantMoves: brilliantCount > 0,
      brilliantMoveCount: brilliantCount,
    };
  }

  const firstPending = statuses.findIndex((s) => s === 'pending');
  if (firstPending > 0) {
    return {
      pipelineStatus: 'queued',
      currentStage: firstPending,
      hasBrilliantMoves: brilliantCount > 0,
      brilliantMoveCount: brilliantCount,
    };
  }

  return {
    pipelineStatus: 'pending',
    currentStage: null,
    hasBrilliantMoves: false,
    brilliantMoveCount: 0,
  };
}

async function upsertBrillianceRun(chessComUuid, sqliteGameId, stages) {
  const s0 = stages.stage0 || {};
  const s1 = stages.stage1 || {};
  const s2 = stages.stage2 || {};
  const s3 = stages.stage3 || {};
  const s4 = stages.stage4 || {};
  const rollup = derivePipelineMeta({ stage0: s0, stage1: s1, stage2: s2, stage3: s3, stage4: s4 });

  await pgDb.query(
    `INSERT INTO chess_com_brilliance_runs (
       chess_com_uuid, sqlite_game_id, move_count,
       stage0_status, stage0_run_at, stage0_sacrifice_count, stage0_error,
       stage1_status, stage1_run_at, stage1_candidate_count, stage1_proceed_stage2_count, stage1_valid_count, stage1_error,
       stage2_status, stage2_run_at, stage2_analyzed_count, stage2_proceed_stage3_count, stage2_error,
       stage3_status, stage3_run_at, stage3_analyzed_count, stage3_sound_count, stage3_error,
       stage4_status, stage4_run_at, stage4_analyzed_count, stage4_brilliant_count, stage4_error,
       pipeline_status, current_stage, has_brilliant_moves, brilliant_move_count,
       synced_at, updated_at
     ) VALUES (
       $1, $2, $3,
       $4, $5, $6, $7,
       $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18,
       $19, $20, $21, $22, $23,
       $24, $25, $26, $27, $28,
       $29, $30, $31, $32,
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
       pipeline_status = EXCLUDED.pipeline_status,
       current_stage = EXCLUDED.current_stage,
       has_brilliant_moves = EXCLUDED.has_brilliant_moves,
       brilliant_move_count = EXCLUDED.brilliant_move_count,
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
      rollup.pipelineStatus,
      rollup.currentStage,
      rollup.hasBrilliantMoves,
      rollup.brilliantMoveCount,
    ]
  );
}

const BRILLIANT_MOVE_COLS = [
  'chess_com_uuid',
  'ply_index',
  'san_move',
  'turn',
  'sac_type',
  'player_rating',
  'surprise_score',
  'pb_score',
  'pb_category',
  'archetype',
  'brilliance_score',
  'brilliance_score_raw',
  'novelty_score',
  'classification',
  'is_brilliant',
];

function mapBrilliantMoveValues(uuid, m) {
  return [
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
    m.brilliance_score_raw ?? m.features?.brilliance_score_raw ?? null,
    m.novelty_score ?? m.features?.novelty_score ?? null,
    m.classification,
    Boolean(m.is_brilliant),
  ];
}

/**
 * Upsert final product rows into brilliant_moves (preserves ids for puzzle FKs).
 * Stages 0–3 are SQLite-only and are never written to Postgres.
 */
async function syncBrilliantMoves(chessComUuid, moves) {
  const seen = new Set();
  const uniqueRows = [];
  for (const row of moves || []) {
    const ply = row.ply_index;
    if (ply == null || seen.has(ply)) continue;
    seen.add(ply);
    uniqueRows.push(row);
  }

  if (!uniqueRows.length) {
    await pgDb.query('DELETE FROM brilliant_moves WHERE chess_com_uuid = $1', [chessComUuid]);
    return;
  }

  const colsPerRow = BRILLIANT_MOVE_COLS.length;
  const columnSql = BRILLIANT_MOVE_COLS.join(', ');
  const updateSql = BRILLIANT_MOVE_COLS.filter((c) => c !== 'chess_com_uuid' && c !== 'ply_index')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');

  const CHUNK = Math.max(1, Math.floor(200 / colsPerRow));
  for (let offset = 0; offset < uniqueRows.length; offset += CHUNK) {
    const chunk = uniqueRows.slice(offset, offset + CHUNK);
    const values = [];
    const placeholders = chunk.map((m, i) => {
      const rowVals = mapBrilliantMoveValues(chessComUuid, m);
      const base = i * colsPerRow;
      values.push(...rowVals);
      const marks = rowVals.map((_, j) => `$${base + j + 1}`).join(',');
      return `(${marks})`;
    });
    await pgDb.query(
      `INSERT INTO brilliant_moves (${columnSql})
       VALUES ${placeholders.join(',')}
       ON CONFLICT (chess_com_uuid, ply_index) DO UPDATE SET ${updateSql}`,
      values
    );
  }

  const plies = uniqueRows.map((m) => m.ply_index);
  const plyPlaceholders = plies.map((_, i) => `$${i + 2}`).join(', ');
  await pgDb.query(
    `DELETE FROM brilliant_moves
     WHERE chess_com_uuid = $1
       AND ply_index NOT IN (${plyPlaceholders})`,
    [chessComUuid, ...plies]
  );
}

/**
 * Sync pipeline status + final brilliant_moves only.
 * Stage 0–3 move rows stay in compute SQLite (lichess_pgn_stage0–3).
 */
async function syncBrillianceGameToSupabase(sqliteGameId, chessComUuid = null) {
  const uuid = resolveChessComUuid(sqliteGameId, chessComUuid);
  if (!uuid) {
    throw new Error(`Cannot sync brilliance: no chess_com_uuid for sqlite game ${sqliteGameId}`);
  }

  return withGameSyncLock(uuid, async () => {
    const stage0 = getStage0Features(sqliteGameId);
    const stage1 = getStage1Features(sqliteGameId);
    const stage2 = getStage2Features(sqliteGameId);
    const stage3 = getStage3Features(sqliteGameId);
    const stage4 = getStage4Features(sqliteGameId);

    await pgDb.withTransaction(async () => {
      await upsertBrillianceRun(uuid, sqliteGameId, { stage0, stage1, stage2, stage3, stage4 });
      await syncBrilliantMoves(uuid, stage4.moves || []);
    });

    return { chessComUuid: uuid, sqliteGameId };
  });
}

async function getBrillianceRun(chessComUuid) {
  const { rows } = await pgDb.query(
    `SELECT * FROM chess_com_brilliance_runs WHERE chess_com_uuid = $1`,
    [chessComUuid]
  );
  return rows[0] || null;
}

function mapBrilliantMoveRow(row) {
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

/**
 * Postgres fallback: run status for stages 0–3 (no move rows) + brilliant_moves for stage 4.
 * Full stage 0–3 move detail must come from compute SQLite.
 */
async function getBrillianceStagesFromSupabase(chessComUuid) {
  const run = await getBrillianceRun(chessComUuid);
  if (!run) return null;

  const { rows: brilliantRows } = await pgDb.query(
    `SELECT * FROM brilliant_moves WHERE chess_com_uuid = $1 ORDER BY ply_index`,
    [chessComUuid]
  );
  const stage4Moves = brilliantRows.map(mapBrilliantMoveRow);

  return {
    brillianceGameId: run.sqlite_game_id,
    chessComUuid,
    stage0: {
      ...runSummaryFromPg(run, 'stage0', {
        move_count: run.move_count,
        sacrifice_candidate_count: run.stage0_sacrifice_count,
        features_saved: 0,
      }),
      moves: [],
    },
    stage1: {
      ...runSummaryFromPg(run, 'stage1', {
        candidate_count: run.stage1_candidate_count,
        proceed_to_stage2_count: run.stage1_proceed_stage2_count,
        valid_sacrifice_count: run.stage1_valid_count ?? 0,
        features_saved: 0,
      }),
      moves: [],
    },
    stage2: {
      ...runSummaryFromPg(run, 'stage2', {
        analyzed_count: run.stage2_analyzed_count,
        proceed_to_stage3_count: run.stage2_proceed_stage3_count,
        features_saved: 0,
      }),
      moves: [],
    },
    stage3: {
      ...runSummaryFromPg(run, 'stage3', {
        analyzed_count: run.stage3_analyzed_count,
        sound_count: run.stage3_sound_count,
        features_saved: 0,
      }),
      moves: [],
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
       bm.id,
       bm.chess_com_uuid,
       bm.ply_index,
       bm.san_move,
       bm.turn,
       bm.sac_type,
       bm.classification,
       bm.is_brilliant,
       bm.brilliance_score,
       bm.player_rating,
       bm.created_at,
       r.stage4_status,
       r.stage4_run_at,
       r.sqlite_game_id,
       m.fen_before AS fen_before_move,
       m.fen_after AS fen_after_move,
       COALESCE(
         m.uci,
         CASE WHEN m.from_square IS NOT NULL AND m.to_square IS NOT NULL
           THEN m.from_square || m.to_square || COALESCE(m.promotion, '')
           ELSE NULL
         END
       ) AS uci_move
     FROM brilliant_moves bm
     JOIN chess_com_brilliance_runs r ON r.chess_com_uuid = bm.chess_com_uuid
     LEFT JOIN chess_com_moves m
       ON m.chess_com_uuid = bm.chess_com_uuid AND m.ply = bm.ply_index + 1
     WHERE r.stage4_status = 'completed'
     ORDER BY
       r.stage4_run_at DESC NULLS LAST,
       bm.is_brilliant DESC,
       bm.brilliance_score DESC NULLS LAST,
       bm.id DESC
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
       bm.*,
       r.stage4_status,
       r.stage4_run_at,
       m.fen_before AS fen_before_move,
       m.fen_after AS fen_after_move,
       COALESCE(
         m.uci,
         CASE WHEN m.from_square IS NOT NULL AND m.to_square IS NOT NULL
           THEN m.from_square || m.to_square || COALESCE(m.promotion, '')
           ELSE NULL
         END
       ) AS uci_move
     FROM brilliant_moves bm
     JOIN chess_com_brilliance_runs r ON r.chess_com_uuid = bm.chess_com_uuid
     LEFT JOIN chess_com_moves m
       ON m.chess_com_uuid = bm.chess_com_uuid AND m.ply = bm.ply_index + 1
     WHERE bm.id = $1 AND r.stage4_status = 'completed'
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function remapPuzzleStage4Ids(oldId, newId) {
  if (!oldId || !newId || oldId === newId) return;
  await pgDb.query(
    `UPDATE brilliant_move_puzzles
     SET stage4_move_id = $2, updated_at = NOW()
     WHERE stage4_move_id = $1`,
    [oldId, newId]
  );
}

async function hasBrilliantMovesSynced(chessComUuid) {
  const { rows } = await pgDb.query(
    `SELECT 1 AS ok FROM brilliant_moves WHERE chess_com_uuid = $1 LIMIT 1`,
    [chessComUuid]
  );
  return Boolean(rows[0]);
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
        (await hasBrilliantMovesSynced(game.lichess_game_id));

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
        `SELECT id, ply_index FROM brilliant_moves WHERE chess_com_uuid = $1`,
        [game.lichess_game_id]
      );

      for (const row of newRows) {
        const oldId = oldIdByPly.get(row.ply_index);
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
  derivePipelineMeta,
};
