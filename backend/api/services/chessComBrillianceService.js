const { importOrGetGameForPgn } = require('../../brilliance/services/lichessPgnService');
const { runFullBrillianceForGame } = require('../../brilliance/services/brilliancePipelineService');
const {
  runStage0ForGame,
  getStage0Features,
  getStage0Status,
} = require('../../brilliance/services/brillianceStage0Service');
const {
  runStage1ForGame,
  getStage1Features,
  getStage1Status,
} = require('../../brilliance/services/brillianceStage1Service');
const {
  runStage2ForGame,
  getStage2Features,
  getStage2Status,
} = require('../../brilliance/services/brillianceStage2Service');
const {
  runStage3ForGame,
  getStage3Features,
  getStage3Status,
} = require('../../brilliance/services/brillianceStage3Service');
const {
  runStage4ForGame,
  getStage4Features,
  getStage4Status,
} = require('../../brilliance/services/brillianceStage4Service');
const pgDb = require('../config/database');
const brillianceSupabase = require('./brillianceSupabaseService');

function buildStageResponseFromSqlite(gameId, pipeline = null) {
  return {
    brillianceGameId: gameId,
    stage0: pipeline?.stage0 || getStage0Features(gameId),
    stage1: pipeline?.stage1 || getStage1Features(gameId),
    stage2: pipeline?.stage2 || getStage2Features(gameId),
    stage3: pipeline?.stage3 || getStage3Features(gameId),
    stage4: pipeline?.stage4 || getStage4Features(gameId),
  };
}

async function buildStageResponse(chessComUuid, sqliteGameId, pipeline = null) {
  if (pipeline) {
    await brillianceSupabase.syncBrillianceGameToSupabase(sqliteGameId, chessComUuid);
  }

  // Prefer compute DB — exact same objects the test page uses
  if (sqliteGameId) {
    try {
      const fromCompute = buildStageResponseFromSqlite(sqliteGameId, pipeline);
      if (fromCompute.stage0 || fromCompute.stage4 || pipeline) {
        return {
          ...fromCompute,
          chessComUuid,
          brillianceGameId: sqliteGameId,
          source: 'compute',
        };
      }
    } catch (err) {
      console.warn('[brilliance] compute DB read failed, falling back to app DB:', err.message);
    }
  }

  // Postgres holds run status + brilliant_moves only; stage 0–3 move detail is SQLite.
  const fromPg = await brillianceSupabase.getBrillianceStagesFromSupabase(chessComUuid);
  if (fromPg) {
    return {
      ...fromPg,
      brillianceGameId: sqliteGameId,
      source: 'app_db',
    };
  }

  return {
    ...buildStageResponseFromSqlite(sqliteGameId, pipeline),
    chessComUuid,
    source: 'sqlite',
  };
}

async function getBrillianceForChessComGame(chessComUuid) {
  if (!chessComUuid?.trim()) throw new Error('Game UUID is required');

  const existingRun = await brillianceSupabase.getBrillianceRun(chessComUuid);
  if (!existingRun) return { status: 'pending' };

  const cached = await buildStageResponse(chessComUuid, existingRun.sqlite_game_id);
  return { ...cached, cached: true };
}

async function syncBrillianceForChessComGame({ pgn, chessComUuid }) {
  if (!pgn?.trim()) throw new Error('PGN is required for brilliance sync');
  if (!chessComUuid?.trim()) throw new Error('Game UUID is required');

  const imported = importOrGetGameForPgn(pgn, {
    originalFilename: `chesscom_${chessComUuid}.pgn`,
    lichessGameId: chessComUuid,
  });
  const gameId = imported?.id;
  if (!gameId) throw new Error('Failed to resolve game for brilliance sync');

  await brillianceSupabase.syncBrillianceGameToSupabase(gameId, chessComUuid);
  return buildStageResponse(chessComUuid, gameId);
}

async function markStageRunning(chessComUuid, sqliteGameId, stage) {
  if (stage === 0) {
    await pgDb.query(
      `INSERT INTO chess_com_brilliance_runs (
         chess_com_uuid, sqlite_game_id,
         stage0_status, stage1_status, stage2_status, stage3_status, stage4_status,
         pipeline_status, current_stage, has_brilliant_moves, brilliant_move_count,
         synced_at, updated_at, created_at
       ) VALUES (
         $1, $2, 'running', 'pending', 'pending', 'pending', 'pending',
         'running', 0, 0, 0, NOW(), NOW(), NOW()
       )
       ON CONFLICT (chess_com_uuid) DO UPDATE SET
         sqlite_game_id = EXCLUDED.sqlite_game_id,
         stage0_status = 'running',
         stage0_error = NULL,
         pipeline_status = 'running',
         current_stage = 0,
         updated_at = NOW()`,
      [chessComUuid, sqliteGameId]
    );
    return;
  }

  const col = `stage${stage}_status`;
  const errCol = `stage${stage}_error`;
  await pgDb.query(
    `UPDATE chess_com_brilliance_runs
     SET sqlite_game_id = COALESCE($2, sqlite_game_id),
         ${col} = 'running',
         ${errCol} = NULL,
         pipeline_status = 'running',
         current_stage = $3,
         updated_at = NOW()
     WHERE chess_com_uuid = $1`,
    [chessComUuid, sqliteGameId, stage]
  );
}

async function markStageFailed(chessComUuid, stage, message) {
  const col = `stage${stage}_status`;
  const errCol = `stage${stage}_error`;
  try {
    await pgDb.query(
      `UPDATE chess_com_brilliance_runs
       SET ${col} = 'failed',
           ${errCol} = $2,
           pipeline_status = 'failed',
           current_stage = $3,
           updated_at = NOW()
       WHERE chess_com_uuid = $1`,
      [chessComUuid, message || 'Stage failed', stage]
    );
  } catch (err) {
    console.error(
      `[brilliance] markStageFailed stage${stage} ${chessComUuid}:`,
      err.message
    );
  }
}

async function resolveGameIdForStage({ pgn, chessComUuid }) {
  const existingRun = await brillianceSupabase.getBrillianceRun(chessComUuid);
  if (existingRun?.sqlite_game_id) return existingRun.sqlite_game_id;

  if (!pgn?.trim()) throw new Error('PGN is required to import game');
  const imported = importOrGetGameForPgn(pgn, {
    originalFilename: `chesscom_${chessComUuid}.pgn`,
    lichessGameId: chessComUuid,
  });
  if (!imported?.id) throw new Error('Failed to resolve game');
  return imported.id;
}

async function runStageNForChessComGame(stage, {
  pgn,
  chessComUuid,
  force = false,
  requirePrevStatus,
  requirePrevCountCol = null,
  runFn,
  getFeatures,
  getStatus,
  resultKey,
  passCountFrom,
}) {
  if (!chessComUuid?.trim()) throw new Error('Game UUID is required');

  const existingRun = await brillianceSupabase.getBrillianceRun(chessComUuid);
  const statusCol = `stage${stage}_status`;

  if (!force && existingRun?.[statusCol] === 'completed') {
    return {
      chessComUuid,
      brillianceGameId: existingRun.sqlite_game_id,
      cached: true,
      [resultKey]: existingRun.sqlite_game_id
        ? await getFeatures(existingRun.sqlite_game_id).catch(() => ({ status: 'completed' }))
        : { status: 'completed' },
      passCount: passCountFrom(existingRun, null),
    };
  }

  if (requirePrevStatus && existingRun?.[requirePrevStatus.col] !== 'completed') {
    throw new Error(`${requirePrevStatus.label} must be completed before stage ${stage}`);
  }
  if (
    requirePrevCountCol &&
    !(Number(existingRun?.[requirePrevCountCol]) > 0)
  ) {
    // Still allow run — pipeline may empty-complete downstream
  }

  const gameId = await resolveGameIdForStage({ pgn, chessComUuid });
  await markStageRunning(chessComUuid, gameId, stage);

  try {
    const stageResult = await runFn(gameId, { force });
    await brillianceSupabase.syncBrillianceGameToSupabase(gameId, chessComUuid);
    const status = getStatus ? getStatus(gameId) : null;
    return {
      chessComUuid,
      brillianceGameId: gameId,
      cached: false,
      [resultKey]: stageResult,
      passCount: passCountFrom(null, stageResult, status),
    };
  } catch (err) {
    await markStageFailed(chessComUuid, stage, err.message || String(err));
    throw err;
  }
}

/**
 * Stage 0 only — analyzes every move in the PGN (board features / sacrifice candidates).
 * Call after chess_com_moves are stored for sequencing; compute itself uses PGN.
 */
async function runStage0ForChessComGame({ pgn, chessComUuid, force = false }) {
  if (!pgn?.trim()) throw new Error('PGN is required for stage 0');
  if (!chessComUuid?.trim()) throw new Error('Game UUID is required');

  if (!force) {
    const existingRun = await brillianceSupabase.getBrillianceRun(chessComUuid);
    if (existingRun?.stage0_status === 'completed') {
      return {
        chessComUuid,
        brillianceGameId: existingRun.sqlite_game_id,
        cached: true,
        stage0: await getStage0Features(existingRun.sqlite_game_id).catch(() => ({
          status: 'completed',
          sacrifice_candidate_count: existingRun.stage0_sacrifice_count || 0,
        })),
      };
    }
  }

  const imported = importOrGetGameForPgn(pgn, {
    originalFilename: `chesscom_${chessComUuid}.pgn`,
    lichessGameId: chessComUuid,
  });
  const gameId = imported?.id;
  if (!gameId) throw new Error('Failed to import game for stage 0');

  await markStageRunning(chessComUuid, gameId, 0);
  try {
    const stage0 = await runStage0ForGame(gameId, { force });
    await brillianceSupabase.syncBrillianceGameToSupabase(gameId, chessComUuid);
    return {
      chessComUuid,
      brillianceGameId: gameId,
      cached: false,
      stage0,
      sacrificeCandidateCount:
        stage0?.sacrifice_candidate_count ??
        getStage0Status(gameId)?.sacrifice_candidate_count ??
        0,
    };
  } catch (err) {
    await markStageFailed(chessComUuid, 0, err.message || String(err));
    throw err;
  }
}

/**
 * Stage 1 only — for games that already completed stage 0 with sacrifice candidates.
 */
async function runStage1ForChessComGame({ pgn, chessComUuid, force = false }) {
  if (!chessComUuid?.trim()) throw new Error('Game UUID is required');

  if (!force) {
    const existingRun = await brillianceSupabase.getBrillianceRun(chessComUuid);
    if (existingRun?.stage1_status === 'completed') {
      return {
        chessComUuid,
        brillianceGameId: existingRun.sqlite_game_id,
        cached: true,
        stage1: existingRun.sqlite_game_id
          ? await getStage1Features(existingRun.sqlite_game_id).catch(() => ({
              status: 'completed',
            }))
          : { status: 'completed' },
      };
    }
    if (existingRun?.stage0_status !== 'completed') {
      throw new Error('Stage 0 must be completed before stage 1');
    }
    if (!(Number(existingRun.stage0_sacrifice_count) > 0)) {
      // Nothing to analyze — mark stage1 empty-complete via sync after a no-op run
    }
  }

  let gameId = null;
  const existingRun = await brillianceSupabase.getBrillianceRun(chessComUuid);
  if (existingRun?.sqlite_game_id) {
    gameId = existingRun.sqlite_game_id;
  }

  if (!gameId) {
    if (!pgn?.trim()) throw new Error('PGN is required to import game for stage 1');
    const imported = importOrGetGameForPgn(pgn, {
      originalFilename: `chesscom_${chessComUuid}.pgn`,
      lichessGameId: chessComUuid,
    });
    gameId = imported?.id;
  }

  if (!gameId) throw new Error('Failed to resolve game for stage 1');

  await markStageRunning(chessComUuid, gameId, 1);
  try {
    const stage1 = await runStage1ForGame(gameId, { force });
    await brillianceSupabase.syncBrillianceGameToSupabase(gameId, chessComUuid);
    return {
      chessComUuid,
      brillianceGameId: gameId,
      cached: false,
      stage1,
      proceedToStage2:
        stage1?.proceed_to_stage2_count ??
        getStage1Status(gameId)?.proceed_to_stage2_count ??
        0,
    };
  } catch (err) {
    await markStageFailed(chessComUuid, 1, err.message || String(err));
    throw err;
  }
}

async function runStage2ForChessComGame({ pgn, chessComUuid, force = false }) {
  const result = await runStageNForChessComGame(2, {
    pgn,
    chessComUuid,
    force,
    requirePrevStatus: { col: 'stage1_status', label: 'Stage 1' },
    requirePrevCountCol: 'stage1_proceed_stage2_count',
    runFn: runStage2ForGame,
    getFeatures: getStage2Features,
    getStatus: getStage2Status,
    resultKey: 'stage2',
    passCountFrom: (run, stageResult, status) =>
      Number(
        stageResult?.proceed_to_stage3_count ??
          status?.proceed_to_stage3_count ??
          run?.stage2_proceed_stage3_count
      ) || 0,
  });
  return {
    ...result,
    proceedToStage3: result.passCount,
  };
}

async function runStage3ForChessComGame({ pgn, chessComUuid, force = false }) {
  const result = await runStageNForChessComGame(3, {
    pgn,
    chessComUuid,
    force,
    requirePrevStatus: { col: 'stage2_status', label: 'Stage 2' },
    requirePrevCountCol: 'stage2_proceed_stage3_count',
    runFn: runStage3ForGame,
    getFeatures: getStage3Features,
    getStatus: getStage3Status,
    resultKey: 'stage3',
    passCountFrom: (run, stageResult, status) =>
      Number(
        stageResult?.sound_count ??
          status?.sound_count ??
          run?.stage3_sound_count ??
          stageResult?.analyzed_count ??
          status?.analyzed_count
      ) || 0,
  });
  return {
    ...result,
    soundCount: result.passCount,
  };
}

async function runStage4ForChessComGame({ pgn, chessComUuid, force = false }) {
  const result = await runStageNForChessComGame(4, {
    pgn,
    chessComUuid,
    force,
    requirePrevStatus: { col: 'stage3_status', label: 'Stage 3' },
    requirePrevCountCol: 'stage3_sound_count',
    runFn: runStage4ForGame,
    getFeatures: getStage4Features,
    getStatus: getStage4Status,
    resultKey: 'stage4',
    passCountFrom: (run, stageResult, status) =>
      Number(
        stageResult?.brilliant_count ??
          status?.brilliant_count ??
          run?.stage4_brilliant_count
      ) || 0,
  });
  return {
    ...result,
    brilliantCount: result.passCount,
  };
}

async function runBrillianceForChessComGame({ pgn, chessComUuid, force = false }) {
  if (!pgn?.trim()) throw new Error('PGN is required for brilliance analysis');
  if (!chessComUuid?.trim()) throw new Error('Game UUID is required');

  if (!force) {
    const existingRun = await brillianceSupabase.getBrillianceRun(chessComUuid);
    if (existingRun?.stage4_status === 'completed') {
      const cached = await buildStageResponse(chessComUuid, existingRun.sqlite_game_id);
      return { ...cached, cached: true };
    }
  }

  const imported = importOrGetGameForPgn(pgn, {
    originalFilename: `chesscom_${chessComUuid}.pgn`,
    lichessGameId: chessComUuid,
  });

  const gameId = imported?.id;
  if (!gameId) throw new Error('Failed to import game for brilliance analysis');

  // Mark run as started so live polls have a row immediately
  await pgDb.query(
    `INSERT INTO chess_com_brilliance_runs (
       chess_com_uuid, sqlite_game_id,
       stage0_status, stage1_status, stage2_status, stage3_status, stage4_status,
       pipeline_status, current_stage, has_brilliant_moves, brilliant_move_count,
       synced_at, updated_at, created_at
     ) VALUES (
       $1, $2, 'running', 'pending', 'pending', 'pending', 'pending',
       'running', 0, FALSE, 0,
       NOW(), NOW(), NOW()
     )
     ON CONFLICT (chess_com_uuid) DO UPDATE SET
       sqlite_game_id = EXCLUDED.sqlite_game_id,
       stage0_status = 'running',
       stage1_status = CASE WHEN $3 THEN 'pending' ELSE chess_com_brilliance_runs.stage1_status END,
       stage2_status = CASE WHEN $3 THEN 'pending' ELSE chess_com_brilliance_runs.stage2_status END,
       stage3_status = CASE WHEN $3 THEN 'pending' ELSE chess_com_brilliance_runs.stage3_status END,
       stage4_status = CASE WHEN $3 THEN 'pending' ELSE chess_com_brilliance_runs.stage4_status END,
       pipeline_status = 'running',
       current_stage = 0,
       updated_at = NOW()`,
    [chessComUuid, gameId, force ? 1 : 0]
  );

  // Sync to app DB after each stage so the Stage 0–4 table can poll live
  const pipeline = await runFullBrillianceForGame(gameId, {
    force,
    onStageComplete: async () => {
      await brillianceSupabase.syncBrillianceGameToSupabase(gameId, chessComUuid);
    },
  });

  return buildStageResponse(chessComUuid, gameId, pipeline);
}

function formatPlayedAt(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function mapStage4Row(row, gameMap) {
  const game = gameMap.get(row.chess_com_uuid);
  const white = game?.white_username || '—';
  const black = game?.black_username || '—';
  const moverUsername =
    row.turn === 'white' ? white : row.turn === 'black' ? black : null;
  const moverName =
    row.turn === 'white'
      ? game?.white_name || null
      : row.turn === 'black'
        ? game?.black_name || null
        : null;

  return {
    id: row.id,
    gameId: row.sqlite_game_id ?? null,
    uuid: row.chess_com_uuid || null,
    chessComId: game?.chess_com_id || null,
    playerName: game?.owner_name || moverName || null,
    playerUsername: game?.chess_com_id || moverUsername || null,
    moverName: moverName || moverUsername || null,
    moverUsername: moverUsername && moverUsername !== '—' ? moverUsername : null,
    whiteUsername: game?.white_username || null,
    blackUsername: game?.black_username || null,
    whiteName: game?.white_name || null,
    blackName: game?.black_name || null,
    whiteRating: game?.white_rating ?? null,
    blackRating: game?.black_rating ?? null,
    players: `${white} vs ${black}`,
    sanMove: row.san_move || '—',
    plyIndex: row.ply_index,
    turn: row.turn,
    sacType: row.sac_type || '—',
    classification: row.classification || '—',
    isBrilliant: Boolean(row.is_brilliant),
    brillianceScore: row.brilliance_score ?? null,
    playerRating: row.player_rating ?? null,
    stage4Status: row.stage4_status,
    stage4RunAt: row.stage4_run_at,
    playedAt: game?.played_at || null,
    playedDate: formatPlayedAt(game?.played_at),
    gameUrl: game?.game_url || null,
    timeControl: game?.time_control_label || '—',
    whiteAccuracy: game?.white_accuracy ?? null,
    blackAccuracy: game?.black_accuracy ?? null,
    playerAccuracy:
      row.turn === 'white'
        ? (game?.white_accuracy ?? null)
        : row.turn === 'black'
          ? (game?.black_accuracy ?? null)
          : null,
    fenBeforeMove: row.fen_before_move || null,
    fenAfterMove: row.fen_after_move || null,
    uciMove: row.uci_move || null,
  };
}

async function loadGameMapForUuids(uuids) {
  const gameMap = new Map();
  if (!uuids.length) return gameMap;

  const { rows } = await pgDb.query(
    `SELECT
       g.chess_com_uuid,
       g.chess_com_id,
       g.played_at,
       g.white_username,
       g.black_username,
       g.game_url,
       g.time_control_label,
       g.white_accuracy,
       g.black_accuracy,
       g.white_rating,
       g.black_rating,
       COALESCE(
         NULLIF(TRIM(owner_profile.name), ''),
         (
           SELECT p."Player_Name"
           FROM players p
           WHERE LOWER(p."Chess_com_ID") = LOWER(g.chess_com_id)
             AND LOWER(TRIM(p."Player_Name")) <> LOWER(p."Chess_com_ID")
           ORDER BY p."Chess_com_ID"
           LIMIT 1
         ),
         (
           SELECT p."Player_Name"
           FROM players p
           WHERE LOWER(p."Chess_com_ID") = LOWER(g.chess_com_id)
           ORDER BY p."Chess_com_ID"
           LIMIT 1
         )
       ) AS owner_name,
       COALESCE(
         NULLIF(TRIM(white_profile.name), ''),
         (
           SELECT p."Player_Name"
           FROM players p
           WHERE LOWER(p."Chess_com_ID") = LOWER(g.white_username)
             AND LOWER(TRIM(p."Player_Name")) <> LOWER(p."Chess_com_ID")
           ORDER BY p."Chess_com_ID"
           LIMIT 1
         ),
         (
           SELECT p."Player_Name"
           FROM players p
           WHERE LOWER(p."Chess_com_ID") = LOWER(g.white_username)
           ORDER BY p."Chess_com_ID"
           LIMIT 1
         ),
         g.white_username
       ) AS white_name,
       COALESCE(
         NULLIF(TRIM(black_profile.name), ''),
         (
           SELECT p."Player_Name"
           FROM players p
           WHERE LOWER(p."Chess_com_ID") = LOWER(g.black_username)
             AND LOWER(TRIM(p."Chess_com_ID")) <> LOWER(p."Chess_com_ID")
           ORDER BY p."Chess_com_ID"
           LIMIT 1
         ),
         (
           SELECT p."Player_Name"
           FROM players p
           WHERE LOWER(p."Chess_com_ID") = LOWER(g.black_username)
           ORDER BY p."Chess_com_ID"
           LIMIT 1
         ),
         g.black_username
       ) AS black_name
     FROM chess_com_games g
     LEFT JOIN chess_com_profiles owner_profile
       ON LOWER(owner_profile.chess_com_id) = LOWER(g.chess_com_id)
     LEFT JOIN chess_com_profiles white_profile
       ON LOWER(white_profile.chess_com_id) = LOWER(g.white_username)
     LEFT JOIN chess_com_profiles black_profile
       ON LOWER(black_profile.chess_com_id) = LOWER(g.black_username)
     WHERE g.chess_com_uuid = ANY($1)`,
    [uuids]
  );
  rows.forEach((row) => gameMap.set(row.chess_com_uuid, row));
  return gameMap;
}

async function loadVerificationMapForMoveIds(moveIds) {
  const map = new Map();
  if (!moveIds.length) return map;

  const { rows } = await pgDb.query(
    `SELECT stage4_move_id, verification_status, verified_at
     FROM brilliant_move_puzzles
     WHERE stage4_move_id = ANY($1::int[])`,
    [moveIds]
  );

  rows.forEach((row) => {
    map.set(Number(row.stage4_move_id), row);
  });
  return map;
}

async function listBrilliantMoves({ limit = 500 } = {}) {
  const stage4Rows = await brillianceSupabase.listStage4MovesFromSupabase({ limit });
  if (!stage4Rows.length) return { rows: [], total: 0 };

  const uuids = [...new Set(stage4Rows.map((r) => r.chess_com_uuid).filter(Boolean))];
  const moveIds = stage4Rows.map((row) => Number(row.id));
  const [gameMap, verificationMap] = await Promise.all([
    loadGameMapForUuids(uuids),
    loadVerificationMapForMoveIds(moveIds),
  ]);

  const mapped = stage4Rows.map((row) => {
    const base = mapStage4Row(row, gameMap);
    const verification = verificationMap.get(Number(row.id));
    const verificationStatus = verification?.verification_status || 'pending';

    return {
      ...base,
      verificationStatus,
      isReviewed: verificationStatus === 'approved' || verificationStatus === 'rejected',
      reviewedAt: verification?.verified_at ? new Date(verification.verified_at).toISOString() : null,
    };
  });

  return { rows: mapped, total: mapped.length };
}

async function getBrilliantMoveById(moveId) {
  const row = await brillianceSupabase.getStage4MoveFromSupabase(moveId);
  if (!row) return null;

  const gameMap = await loadGameMapForUuids(
    row.chess_com_uuid ? [row.chess_com_uuid] : []
  );

  return mapStage4Row(row, gameMap);
}

module.exports = {
  getBrillianceForChessComGame,
  runBrillianceForChessComGame,
  runStage0ForChessComGame,
  runStage1ForChessComGame,
  runStage2ForChessComGame,
  runStage3ForChessComGame,
  runStage4ForChessComGame,
  syncBrillianceForChessComGame,
  listBrilliantMoves,
  getBrilliantMoveById,
  buildStageResponse,
};
