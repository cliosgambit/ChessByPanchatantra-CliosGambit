const pgDb = require('../config/database');
const brillianceService = require('./chessComBrillianceService');
const syncService = require('./chessComSyncService');

function findBrilliantMoveIndex(moves, brilliantMove) {
  if (!moves?.length || !brilliantMove) return -1;

  if (Number.isInteger(brilliantMove.plyIndex) && brilliantMove.plyIndex >= 0) {
    const byChessComPly = moves.findIndex((m) => m.ply === brilliantMove.plyIndex + 1);
    if (byChessComPly >= 0) return byChessComPly;
    if (brilliantMove.plyIndex < moves.length) return brilliantMove.plyIndex;
  }

  if (!brilliantMove.sanMove) return -1;

  const targetColor = brilliantMove.turn === 'white' ? 'w' : 'b';
  return moves.findIndex((m) => m.san === brilliantMove.sanMove && m.color === targetColor);
}

function mapPuzzleRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    stage4MoveId: row.stage4_move_id,
    puzzleFen: row.puzzle_fen,
    solutionSan: row.solution_san,
    solutionUci: row.solution_uci,
    previousMoveSan: row.previous_move_san,
    previousMoveUci: row.previous_move_uci,
    previousMoveFrom: row.previous_move_from,
    previousMoveTo: row.previous_move_to,
    uuid: row.chess_com_uuid,
    chessComId: row.chess_com_id,
    gameUrl: row.game_url,
    whiteUsername: row.white_username,
    blackUsername: row.black_username,
    playersLabel: row.players_label,
    playedAt: row.played_at ? new Date(row.played_at).toISOString() : null,
    playedDate: row.played_at
      ? new Date(row.played_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '—',
    savedAt: row.saved_at ? new Date(row.saved_at).toISOString() : null,
    savedDate: row.saved_at
      ? new Date(row.saved_at).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      : null,
    timeControl: row.time_control,
    turn: row.turn,
    classification: row.classification,
    sacType: row.sac_type,
    brillianceScore: row.brilliance_score != null ? Number(row.brilliance_score) : null,
    whiteRating: row.white_rating != null ? Number(row.white_rating) : null,
    blackRating: row.black_rating != null ? Number(row.black_rating) : null,
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    verifiedBy: row.verified_by,
    isUsed: Boolean(Number(row.is_used)),
    moralId: row.moral_id != null ? Number(row.moral_id) : null,
    moralCode: row.moral_code || null,
    moralName: row.moral_name || null,
  };
}

async function getPreviousMoveContext(brilliantMove) {
  if (!brilliantMove?.chessComId || !brilliantMove?.uuid) {
    return { previousMove: null, puzzleFen: brilliantMove?.fenBeforeMove || null };
  }

  const moves = await syncService.getMovesForGame(brilliantMove.chessComId, brilliantMove.uuid);
  const brilliantIndex = findBrilliantMoveIndex(moves, brilliantMove);
  const puzzleFen =
    brilliantIndex >= 0
      ? moves[brilliantIndex]?.before || brilliantMove.fenBeforeMove
      : brilliantMove.fenBeforeMove;
  const previousMove = brilliantIndex > 0 ? moves[brilliantIndex - 1] : null;

  return { previousMove, puzzleFen, brilliantIndex };
}

async function getPuzzleByMoveId(moveId) {
  const id = Number(moveId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const { rows } = await pgDb.query(
    `SELECT p.*, g.white_rating, g.black_rating
     FROM brilliant_move_puzzles p
     LEFT JOIN chess_com_games g ON g.chess_com_uuid = p.chess_com_uuid
     WHERE p.stage4_move_id = $1
     LIMIT 1`,
    [id]
  );
  return mapPuzzleRow(rows[0]);
}

async function getPuzzleById(puzzleId) {
  const id = Number(puzzleId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const { rows } = await pgDb.query(
    `SELECT p.*, g.white_rating, g.black_rating
     FROM brilliant_move_puzzles p
     LEFT JOIN chess_com_games g ON g.chess_com_uuid = p.chess_com_uuid
     WHERE p.id = $1
       AND p.saved_at IS NOT NULL
     LIMIT 1`,
    [id]
  );
  return mapPuzzleRow(rows[0]);
}

async function listSavedPuzzles({ limit = 2000 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 2000, 1), 5000);
  const baseSql = `
     FROM brilliant_move_puzzles p
     LEFT JOIN chess_com_games g ON g.chess_com_uuid = p.chess_com_uuid
     WHERE p.saved_at IS NOT NULL
     ORDER BY p.saved_at DESC
     LIMIT $1`;

  try {
    const { rows } = await pgDb.query(
      `SELECT
         p.*,
         g.white_rating,
         g.black_rating,
         CASE
           WHEN EXISTS (
             SELECT 1
             FROM moral_puzzle_assignments a
             WHERE a.source = 'brilliant'
               AND a.puzzle_id = p.id
           ) THEN 1
           ELSE COALESCE(p.is_used, 0)
         END AS is_used,
         (
           SELECT a.moral_id
           FROM moral_puzzle_assignments a
           WHERE a.source = 'brilliant'
             AND a.puzzle_id = p.id
           ORDER BY a.display_order ASC, a.id ASC
           LIMIT 1
         ) AS moral_id,
         (
           SELECT m.moral_code
           FROM moral_puzzle_assignments a
           INNER JOIN Morals m ON m.id = a.moral_id
           WHERE a.source = 'brilliant'
             AND a.puzzle_id = p.id
           ORDER BY a.display_order ASC, a.id ASC
           LIMIT 1
         ) AS moral_code,
         (
           SELECT m.moral_name
           FROM moral_puzzle_assignments a
           INNER JOIN Morals m ON m.id = a.moral_id
           WHERE a.source = 'brilliant'
             AND a.puzzle_id = p.id
           ORDER BY a.display_order ASC, a.id ASC
           LIMIT 1
         ) AS moral_name
       ${baseSql}`,
      [safeLimit]
    );
    return { rows: rows.map(mapPuzzleRow), total: rows.length };
  } catch (err) {
    console.warn('[brilliant puzzles] enriched list failed, falling back:', err.message);
    const { rows } = await pgDb.query(
      `SELECT p.*, g.white_rating, g.black_rating
       ${baseSql}`,
      [safeLimit]
    );
    return { rows: rows.map(mapPuzzleRow), total: rows.length };
  }
}

async function verifyBrilliantMove(moveId, { status, verifiedBy = null } = {}) {
  const normalized = String(status || '').toLowerCase();
  if (!['approved', 'rejected'].includes(normalized)) {
    throw new Error('status must be approved or rejected');
  }

  const brilliantMove = await brillianceService.getBrilliantMoveById(moveId);
  if (!brilliantMove) throw new Error('Brilliant move not found');

  const { previousMove, puzzleFen } = await getPreviousMoveContext(brilliantMove);
  if (!puzzleFen) throw new Error('Puzzle position is not available for this move');

  const now = new Date().toISOString();
  const previousUci =
    previousMove?.from && previousMove?.to
      ? `${previousMove.from}${previousMove.to}${previousMove.promotion || ''}`
      : null;

  const { rows } = await pgDb.query(
    `INSERT INTO brilliant_move_puzzles (
       stage4_move_id,
       puzzle_fen,
       solution_san,
       solution_uci,
       previous_move_san,
       previous_move_uci,
       previous_move_from,
       previous_move_to,
       chess_com_uuid,
       chess_com_id,
       game_url,
       white_username,
       black_username,
       players_label,
       played_at,
       time_control,
       turn,
       classification,
       sac_type,
       brilliance_score,
       verification_status,
       verified_at,
       verified_by,
       saved_at,
       updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
       $21, $22, $23, NULL, NOW()
     )
     ON CONFLICT (stage4_move_id) DO UPDATE SET
       puzzle_fen = EXCLUDED.puzzle_fen,
       solution_san = EXCLUDED.solution_san,
       solution_uci = EXCLUDED.solution_uci,
       previous_move_san = EXCLUDED.previous_move_san,
       previous_move_uci = EXCLUDED.previous_move_uci,
       previous_move_from = EXCLUDED.previous_move_from,
       previous_move_to = EXCLUDED.previous_move_to,
       chess_com_uuid = EXCLUDED.chess_com_uuid,
       chess_com_id = EXCLUDED.chess_com_id,
       game_url = EXCLUDED.game_url,
       white_username = EXCLUDED.white_username,
       black_username = EXCLUDED.black_username,
       players_label = EXCLUDED.players_label,
       played_at = EXCLUDED.played_at,
       time_control = EXCLUDED.time_control,
       turn = EXCLUDED.turn,
       classification = EXCLUDED.classification,
       sac_type = EXCLUDED.sac_type,
       brilliance_score = EXCLUDED.brilliance_score,
       verification_status = EXCLUDED.verification_status,
       verified_at = EXCLUDED.verified_at,
       verified_by = EXCLUDED.verified_by,
       saved_at = CASE
         WHEN EXCLUDED.verification_status = 'approved' THEN brilliant_move_puzzles.saved_at
         ELSE NULL
       END,
       updated_at = NOW()
     RETURNING *`,
    [
      Number(moveId),
      puzzleFen,
      brilliantMove.sanMove,
      brilliantMove.uciMove,
      previousMove?.san || null,
      previousUci,
      previousMove?.from || null,
      previousMove?.to || null,
      brilliantMove.uuid,
      brilliantMove.chessComId,
      brilliantMove.gameUrl,
      brilliantMove.whiteUsername,
      brilliantMove.blackUsername,
      brilliantMove.players,
      brilliantMove.playedAt,
      brilliantMove.timeControl,
      brilliantMove.turn,
      brilliantMove.classification,
      brilliantMove.sacType,
      brilliantMove.brillianceScore,
      normalized,
      now,
      verifiedBy,
    ]
  );

  return mapPuzzleRow(rows[0]);
}

async function saveBrilliantPuzzle(moveId, { verifiedBy = null } = {}) {
  const existing = await getPuzzleByMoveId(moveId);
  if (!existing) {
    throw new Error('Review whether this is a brilliant move before saving as a puzzle');
  }

  if (existing.verificationStatus !== 'approved') {
    throw new Error('Only human-approved brilliant moves can be saved as puzzles');
  }

  if (existing.savedAt) {
    return existing;
  }

  const now = new Date().toISOString();
  const { rows } = await pgDb.query(
    `UPDATE brilliant_move_puzzles
     SET saved_at = $2,
         verified_by = COALESCE(verified_by, $3),
         updated_at = NOW()
     WHERE stage4_move_id = $1
     RETURNING *`,
    [Number(moveId), now, verifiedBy]
  );

  return mapPuzzleRow(rows[0]);
}

async function unsaveBrilliantPuzzle(moveId) {
  const existing = await getPuzzleByMoveId(moveId);
  if (!existing) throw new Error('Puzzle record not found');
  if (!existing.savedAt) return existing;

  const { rows } = await pgDb.query(
    `UPDATE brilliant_move_puzzles
     SET saved_at = NULL,
         updated_at = NOW()
     WHERE stage4_move_id = $1
     RETURNING *`,
    [Number(moveId)]
  );

  return mapPuzzleRow(rows[0]);
}

module.exports = {
  getPuzzleById,
  getPuzzleByMoveId,
  listSavedPuzzles,
  verifyBrilliantMove,
  saveBrilliantPuzzle,
  unsaveBrilliantPuzzle,
  getPreviousMoveContext,
};
