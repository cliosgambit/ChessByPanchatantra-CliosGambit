const { importOrGetGameForPgn } = require('../../brilliance/services/lichessPgnService');
const { runFullBrillianceForGame } = require('../../brilliance/services/brilliancePipelineService');
const { getStage0Features } = require('../../brilliance/services/brillianceStage0Service');
const { getStage1Features } = require('../../brilliance/services/brillianceStage1Service');
const { getStage2Features } = require('../../brilliance/services/brillianceStage2Service');
const { getStage3Features } = require('../../brilliance/services/brillianceStage3Service');
const { getStage4Features } = require('../../brilliance/services/brillianceStage4Service');
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

  const fromPg = await brillianceSupabase.getBrillianceStagesFromSupabase(chessComUuid);
  if (fromPg) {
    return {
      ...fromPg,
      brillianceGameId: sqliteGameId,
      source: 'supabase',
    };
  }

  return {
    ...buildStageResponseFromSqlite(sqliteGameId, pipeline),
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

  const pipeline = await runFullBrillianceForGame(gameId, { force });
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
  listBrilliantMoves,
  getBrilliantMoveById,
  buildStageResponse,
};
