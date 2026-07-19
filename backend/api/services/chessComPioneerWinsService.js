const path = require('path');
const { spawn } = require('child_process');
const db = require('../config/database');
const syncService = require('./chessComSyncService');

const SCRIPT_PATH = path.join(
  __dirname,
  '..',
  '..',
  'brilliance',
  'identify_piece_sacrifice_wins.py'
);

const DEFAULT_MAX_MOVE = 10; // 10 full moves ≈ 20 ply
const BATCH_SIZE = 1; // one game at a time for live progress
const STOCKFISH_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'stockfish',
  'stockfish-windows-x86-64-avx2.exe'
);

class PioneerDetectCancelledError extends Error {
  constructor(message = 'Pioneer win detection cancelled.') {
    super(message);
    this.name = 'PioneerDetectCancelledError';
    this.code = 'PIONEER_DETECT_CANCELLED';
  }
}

function throwIfCancelled(shouldCancel) {
  if (typeof shouldCancel === 'function' && shouldCancel()) {
    throw new PioneerDetectCancelledError();
  }
}

function runPythonViaStdin(scriptPath, payload, { shouldCancel } = {}) {
  const inputJson = JSON.stringify(payload);

  const run = (cmd, cmdArgs) =>
    new Promise((resolve, reject) => {
      throwIfCancelled(shouldCancel);

      const child = spawn(cmd, cmdArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      let cancelPoll = null;

      const finish = (err, value) => {
        if (settled) return;
        settled = true;
        if (cancelPoll) clearInterval(cancelPoll);
        if (err) reject(err);
        else resolve(value);
      };

      const killChild = () => {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
      };

      cancelPoll = setInterval(() => {
        if (typeof shouldCancel === 'function' && shouldCancel()) {
          killChild();
          finish(new PioneerDetectCancelledError());
        }
      }, 250);

      const timer = setTimeout(() => {
        killChild();
        finish(new Error(`Timeout running ${path.basename(scriptPath)}`));
      }, 600000);

      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        finish(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (typeof shouldCancel === 'function' && shouldCancel()) {
          finish(new PioneerDetectCancelledError());
          return;
        }
        if (code !== 0) {
          finish(new Error(stderr.trim() || `Python exited with code ${code}`));
          return;
        }
        try {
          finish(null, JSON.parse(String(stdout || '').trim() || '{}'));
        } catch {
          finish(new Error(`Invalid JSON from ${path.basename(scriptPath)}`));
        }
      });

      child.stdin.write(inputJson);
      child.stdin.end();
    });

  const args = [scriptPath, '-'];
  if (process.platform === 'win32') {
    return run('py', ['-3', ...args])
      .catch((err) => {
        if (err instanceof PioneerDetectCancelledError) throw err;
        return run('python', args);
      })
      .catch((err) => {
        if (err instanceof PioneerDetectCancelledError) throw err;
        return run('python3', args);
      });
  }
  return run('python3', args)
    .catch((err) => {
      if (err instanceof PioneerDetectCancelledError) throw err;
      return run('python', args);
    })
    .catch((err) => {
      if (err instanceof PioneerDetectCancelledError) throw err;
      return run('py', ['-3', ...args]);
    });
}

async function fetchPgnsByUuids(uuids) {
  if (!uuids.length) return new Map();
  const { rows } = await db.query(
    `SELECT chess_com_uuid, chess_com_id, pgn
     FROM chess_com_games
     WHERE chess_com_uuid = ANY($1)`,
    [uuids]
  );
  const map = new Map();
  for (const row of rows) {
    if (row.pgn) map.set(row.chess_com_uuid, row.pgn);
  }
  return map;
}

function pieceLostLabel(pieceLost) {
  const name = String(pieceLost || 'piece').toLowerCase();
  if (!name || name === 'piece') return 'Piece';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function enrichGameWithPioneer(game, pioneer) {
  return {
    ...game,
    classification: 'pioneer_win',
    winnerColor: pioneer.winnerColor || pioneer.winner_color,
    pieceLost: pioneer.pieceLost || pioneer.piece_lost,
    pieceLostLabel: pieceLostLabel(pioneer.pieceLost || pioneer.piece_lost),
    lossMoveNumber: pioneer.lossMoveNumber ?? pioneer.loss_move_number,
    lossPly: pioneer.lossPly ?? pioneer.loss_ply,
    lossUci: pioneer.lossUci || pioneer.loss_uci,
    lossSan: pioneer.lossSan || pioneer.loss_san,
    materialDeltaCp: pioneer.materialDeltaCp ?? pioneer.material_delta_cp,
    netBalanceAfterLossCp: pioneer.netBalanceAfterLossCp ?? pioneer.net_balance_after_loss_cp,
    maxMoveNumber: pioneer.maxMoveNumber ?? pioneer.max_move_number,
    bestMoveSan: pioneer.bestMoveSan || pioneer.best_move_san || null,
    bestMoveUci: pioneer.bestMoveUci || pioneer.best_move_uci || null,
    bestMoveElo: pioneer.bestMoveElo ?? pioneer.best_move_elo ?? null,
    playedMoveElo: pioneer.playedMoveElo ?? pioneer.played_move_elo ?? null,
    eloDiff: pioneer.eloDiff ?? pioneer.elo_diff ?? null,
    cpl: pioneer.cpl ?? null,
    epBefore: pioneer.epBefore ?? pioneer.ep_before ?? null,
    epAfter: pioneer.epAfter ?? pioneer.ep_after ?? null,
    epDelta: pioneer.epDelta ?? pioneer.ep_delta ?? null,
    winPctBefore: pioneer.winPctBefore ?? pioneer.win_pct_before ?? null,
    winPctAfter: pioneer.winPctAfter ?? pioneer.win_pct_after ?? null,
    winPctDelta: pioneer.winPctDelta ?? pioneer.win_pct_delta ?? null,
    detectedAt: pioneer.detectedAt || pioneer.detected_at || null,
  };
}

async function detectBatch(batch, targetColor, maxMoveNumber, { shouldCancel } = {}) {
  if (!batch.length) return [];
  throwIfCancelled(shouldCancel);

  const result = await runPythonViaStdin(
    SCRIPT_PATH,
    {
      pgns: batch.map((item) => item.pgn),
      max_move_number: maxMoveNumber,
      target_color: targetColor,
      engine_path: STOCKFISH_PATH,
    },
    { shouldCancel }
  );

  throwIfCancelled(shouldCancel);

  if (result?.error) {
    throw new Error(result.error);
  }

  const matches = [];
  for (const match of result.pioneer_wins || []) {
    const item = batch[match.game_index];
    if (!item) continue;
    matches.push(
      enrichGameWithPioneer(item.game, {
        winnerColor: match.winner_color,
        pieceLost: match.piece_lost,
        lossMoveNumber: match.loss_move_number,
        lossPly: match.loss_ply,
        lossUci: match.loss_uci,
        lossSan: match.loss_san,
        materialDeltaCp: match.material_delta_cp,
        netBalanceAfterLossCp: match.net_balance_after_loss_cp,
        maxMoveNumber,
        bestMoveSan: match.best_move_san,
        bestMoveUci: match.best_move_uci,
        bestMoveElo: match.best_move_elo,
        playedMoveElo: match.played_move_elo,
        eloDiff: match.elo_diff,
        cpl: match.cpl,
        epBefore: match.ep_before,
        epAfter: match.ep_after,
        epDelta: match.ep_delta,
        winPctBefore: match.win_pct_before,
        winPctAfter: match.win_pct_after,
        winPctDelta: match.win_pct_delta,
      })
    );
  }
  return matches;
}

async function upsertPioneerWins(rows, maxMoveNumber) {
  if (!rows.length) return;

  for (const row of rows) {
    await db.query(
      `INSERT INTO chess_com_pioneer_wins (
         chess_com_uuid, chess_com_id, winner_color, piece_lost,
         loss_move_number, loss_ply, loss_uci, loss_san,
         material_delta_cp, net_balance_after_loss_cp, max_move_number,
         best_move_san, best_move_uci, best_move_elo, played_move_elo, elo_diff, cpl,
         ep_before, ep_after, ep_delta, win_pct_before, win_pct_after, win_pct_delta,
         detected_at, updated_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8,
         $9, $10, $11,
         $12, $13, $14, $15, $16, $17,
         $18, $19, $20, $21, $22, $23,
         NOW(), NOW()
       )
       ON CONFLICT (chess_com_uuid) DO UPDATE SET
         chess_com_id = EXCLUDED.chess_com_id,
         winner_color = EXCLUDED.winner_color,
         piece_lost = EXCLUDED.piece_lost,
         loss_move_number = EXCLUDED.loss_move_number,
         loss_ply = EXCLUDED.loss_ply,
         loss_uci = EXCLUDED.loss_uci,
         loss_san = EXCLUDED.loss_san,
         material_delta_cp = EXCLUDED.material_delta_cp,
         net_balance_after_loss_cp = EXCLUDED.net_balance_after_loss_cp,
         max_move_number = EXCLUDED.max_move_number,
         best_move_san = EXCLUDED.best_move_san,
         best_move_uci = EXCLUDED.best_move_uci,
         best_move_elo = EXCLUDED.best_move_elo,
         played_move_elo = EXCLUDED.played_move_elo,
         elo_diff = EXCLUDED.elo_diff,
         cpl = EXCLUDED.cpl,
         ep_before = EXCLUDED.ep_before,
         ep_after = EXCLUDED.ep_after,
         ep_delta = EXCLUDED.ep_delta,
         win_pct_before = EXCLUDED.win_pct_before,
         win_pct_after = EXCLUDED.win_pct_after,
         win_pct_delta = EXCLUDED.win_pct_delta,
         updated_at = NOW()`,
      [
        row.uuid,
        row.chessComId,
        row.winnerColor || null,
        row.pieceLost || null,
        row.lossMoveNumber ?? null,
        row.lossPly ?? null,
        row.lossUci || null,
        row.lossSan || null,
        row.materialDeltaCp ?? null,
        row.netBalanceAfterLossCp ?? null,
        maxMoveNumber,
        row.bestMoveSan || null,
        row.bestMoveUci || null,
        row.bestMoveElo ?? null,
        row.playedMoveElo ?? null,
        row.eloDiff ?? null,
        row.cpl ?? null,
        row.epBefore ?? null,
        row.epAfter ?? null,
        row.epDelta ?? null,
        row.winPctBefore ?? null,
        row.winPctAfter ?? null,
        row.winPctDelta ?? null,
      ]
    );
  }
}

async function clearPioneerWinsForUuids(uuids) {
  if (!uuids.length) return;
  await db.query(`DELETE FROM chess_com_pioneer_wins WHERE chess_com_uuid = ANY($1)`, [uuids]);
}

async function fetchPioneerRowsByUuids(uuids) {
  if (!uuids.length) return new Map();
  const { rows } = await db.query(
    `SELECT *
     FROM chess_com_pioneer_wins
     WHERE chess_com_uuid = ANY($1)`,
    [uuids]
  );
  return new Map(rows.map((row) => [row.chess_com_uuid, row]));
}

/**
 * Wins available to scan for pioneer detection (one-by-one client loop).
 */
async function listPioneerScanTargets({
  dayFilter = 'today',
  timeZone = syncService.DEFAULT_YESTERDAY_TZ,
} = {}) {
  const tracked = await syncService.getTrackedGamesByDay({
    dayFilter,
    timeZone,
    attachPreviewPgn: false,
  });

  const allGames = tracked.games || [];
  const winGames = allGames.filter((game) => game.resultType === 'win' && game.uuid);
  const pgnMap = await fetchPgnsByUuids(winGames.map((game) => game.uuid));

  const targets = [];
  for (const game of winGames) {
    if (!pgnMap.has(game.uuid)) continue;
    targets.push({
      uuid: game.uuid,
      chessComId: game.chessComId,
      white: game.white,
      black: game.black,
      isWhite: game.isWhite,
      playedAt: game.playedAt,
      date: game.date,
      timeClass: game.timeClass,
      timeControl: game.timeControl,
      opponent: game.opponent,
      resultType: game.resultType,
      label: `${game.chessComId || '?'} · ${game.white || '?'} vs ${game.black || '?'}`,
    });
  }

  return {
    dayFilter: tracked.dayFilter,
    date: tracked.date,
    filterLabels: tracked.filterLabels,
    timeZone: tracked.timeZone,
    playersCount: tracked.playersCount,
    totalGames: allGames.length,
    winGames: winGames.length,
    scannableWins: targets.length,
    skippedNoPgn: Math.max(0, winGames.length - targets.length),
    targets,
  };
}

/**
 * Analyze a single win for pioneer criteria. Upserts or clears that uuid.
 */
async function detectPioneerWinForGame({
  uuid,
  chessComId,
  maxMoveNumber = DEFAULT_MAX_MOVE,
  shouldCancel,
} = {}) {
  const safeMaxMove = Math.min(Math.max(Number(maxMoveNumber) || DEFAULT_MAX_MOVE, 1), 40);
  const id = String(chessComId || '').trim().toLowerCase();
  const gameUuid = String(uuid || '').trim();
  if (!id || !gameUuid) {
    throw new Error('uuid and chessComId are required.');
  }

  throwIfCancelled(shouldCancel);

  const game = await syncService.getGameByUuid(id, gameUuid);
  if (!game) {
    throw new Error('Game not found.');
  }
  if (game.resultType !== 'win') {
    return {
      identified: false,
      reason: 'not_a_win',
      uuid: gameUuid,
      chessComId: id,
      label: `${id} · ${game.white || '?'} vs ${game.black || '?'}`,
    };
  }

  const pgn = await syncService.getGamePgn(id, gameUuid);
  if (!pgn) {
    return {
      identified: false,
      reason: 'no_pgn',
      uuid: gameUuid,
      chessComId: id,
      label: `${id} · ${game.white || '?'} vs ${game.black || '?'}`,
    };
  }

  const targetColor = game.isWhite ? 'white' : 'black';
  const matches = await detectBatch([{ game, pgn }], targetColor, safeMaxMove, { shouldCancel });
  const match = matches[0] || null;

  if (match) {
    await upsertPioneerWins([match], safeMaxMove);
    return {
      identified: true,
      reason: 'pioneer_win',
      uuid: gameUuid,
      chessComId: id,
      label: `${id} · ${game.white || '?'} vs ${game.black || '?'}`,
      pieceLost: match.pieceLost,
      lossSan: match.lossSan,
      lossMoveNumber: match.lossMoveNumber,
      cpl: match.cpl,
      winPctDelta: match.winPctDelta,
      pioneerWin: match,
    };
  }

  await clearPioneerWinsForUuids([gameUuid]);
  return {
    identified: false,
    reason: 'no_match',
    uuid: gameUuid,
    chessComId: id,
    label: `${id} · ${game.white || '?'} vs ${game.black || '?'}`,
  };
}

/**
 * List stored pioneer wins for the day filter (no Python re-scan).
 */
async function listPioneerWins({
  dayFilter = 'today',
  timeZone = syncService.DEFAULT_YESTERDAY_TZ,
} = {}) {
  const tracked = await syncService.getTrackedGamesByDay({
    dayFilter,
    timeZone,
    attachPreviewPgn: false,
  });

  const games = tracked.games || [];
  const pioneerByUuid = await fetchPioneerRowsByUuids(games.map((game) => game.uuid).filter(Boolean));

  const pioneerWins = games
    .filter((game) => pioneerByUuid.has(game.uuid))
    .map((game) => enrichGameWithPioneer(game, pioneerByUuid.get(game.uuid)));

  pioneerWins.sort((a, b) => {
    const aTime = a.playedAt ? new Date(a.playedAt).getTime() : 0;
    const bTime = b.playedAt ? new Date(b.playedAt).getTime() : 0;
    return bTime - aTime;
  });

  return {
    dayFilter: tracked.dayFilter,
    date: tracked.date,
    filterLabels: tracked.filterLabels,
    timeZone: tracked.timeZone,
    playersCount: tracked.playersCount,
    totalGames: games.length,
    matchedGames: pioneerWins.length,
    pioneerWins,
    fromCache: true,
  };
}

/**
 * Detect Pioneer Wins among tracked players' games for a day filter.
 * Persists matches to chess_com_pioneer_wins.
 */
async function detectPioneerWins({
  dayFilter = 'today',
  timeZone = syncService.DEFAULT_YESTERDAY_TZ,
  maxMoveNumber = DEFAULT_MAX_MOVE,
  shouldCancel,
} = {}) {
  const safeMaxMove = Math.min(Math.max(Number(maxMoveNumber) || DEFAULT_MAX_MOVE, 1), 40);
  throwIfCancelled(shouldCancel);

  const tracked = await syncService.getTrackedGamesByDay({
    dayFilter,
    timeZone,
    attachPreviewPgn: false,
  });
  throwIfCancelled(shouldCancel);

  const allGames = tracked.games || [];
  const winGames = allGames.filter((game) => game.resultType === 'win' && game.uuid);

  const pgnMap = await fetchPgnsByUuids(winGames.map((game) => game.uuid));
  throwIfCancelled(shouldCancel);

  const whiteBatch = [];
  const blackBatch = [];

  for (const game of winGames) {
    const pgn = pgnMap.get(game.uuid);
    if (!pgn) continue;
    const item = { game, pgn };
    if (game.isWhite) whiteBatch.push(item);
    else blackBatch.push(item);
  }

  const pioneerWins = [];
  let cancelledMidRun = false;

  async function runColorBatches(batch, color) {
    for (let i = 0; i < batch.length; i += BATCH_SIZE) {
      throwIfCancelled(shouldCancel);
      const chunk = batch.slice(i, i + BATCH_SIZE);
      const matches = await detectBatch(chunk, color, safeMaxMove, { shouldCancel });
      pioneerWins.push(...matches);
    }
  }

  try {
    await runColorBatches(whiteBatch, 'white');
    throwIfCancelled(shouldCancel);
    await runColorBatches(blackBatch, 'black');
    throwIfCancelled(shouldCancel);
  } catch (err) {
    if (err instanceof PioneerDetectCancelledError || err?.code === 'PIONEER_DETECT_CANCELLED') {
      cancelledMidRun = true;
      // Keep any matches already found in this run.
      if (pioneerWins.length) {
        await upsertPioneerWins(pioneerWins, safeMaxMove);
      }
      throw err;
    }
    throw err;
  }

  const scannedUuids = winGames.map((game) => game.uuid);
  const matchedUuids = new Set(pioneerWins.map((row) => row.uuid));
  const staleUuids = scannedUuids.filter((uuid) => !matchedUuids.has(uuid));

  // Only clear non-matches when the full scan finishes (not on cancel).
  if (!cancelledMidRun) {
    await clearPioneerWinsForUuids(staleUuids);
  }
  await upsertPioneerWins(pioneerWins, safeMaxMove);

  pioneerWins.sort((a, b) => {
    const aTime = a.playedAt ? new Date(a.playedAt).getTime() : 0;
    const bTime = b.playedAt ? new Date(b.playedAt).getTime() : 0;
    return bTime - aTime;
  });

  return {
    dayFilter: tracked.dayFilter,
    date: tracked.date,
    filterLabels: tracked.filterLabels,
    timeZone: tracked.timeZone,
    playersCount: tracked.playersCount,
    totalGames: allGames.length,
    scannedWins: winGames.length,
    scannedWithPgn: whiteBatch.length + blackBatch.length,
    matchedGames: pioneerWins.length,
    maxMoveNumber: safeMaxMove,
    pioneerWins,
    persisted: true,
  };
}

/**
 * Fetch a single stored pioneer win by Chess.com game UUID.
 */
async function getPioneerWinByUuid(uuid) {
  const id = String(uuid || '').trim();
  if (!id) return null;

  const { rows } = await db.query(
    `SELECT *
     FROM chess_com_pioneer_wins
     WHERE chess_com_uuid = $1
     LIMIT 1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;

  return {
    uuid: row.chess_com_uuid,
    chessComId: row.chess_com_id,
    winnerColor: row.winner_color,
    pieceLost: row.piece_lost,
    pieceLostLabel: pieceLostLabel(row.piece_lost),
    lossMoveNumber: row.loss_move_number,
    lossPly: row.loss_ply,
    lossUci: row.loss_uci,
    lossSan: row.loss_san,
    materialDeltaCp: row.material_delta_cp,
    netBalanceAfterLossCp: row.net_balance_after_loss_cp,
    maxMoveNumber: row.max_move_number,
    bestMoveSan: row.best_move_san,
    bestMoveUci: row.best_move_uci,
    bestMoveElo: row.best_move_elo,
    playedMoveElo: row.played_move_elo,
    eloDiff: row.elo_diff,
    cpl: row.cpl,
    epBefore: row.ep_before,
    epAfter: row.ep_after,
    epDelta: row.ep_delta,
    winPctBefore: row.win_pct_before,
    winPctAfter: row.win_pct_after,
    winPctDelta: row.win_pct_delta,
    detectedAt: row.detected_at,
  };
}

module.exports = {
  detectPioneerWins,
  detectPioneerWinForGame,
  listPioneerScanTargets,
  listPioneerWins,
  getPioneerWinByUuid,
  PioneerDetectCancelledError,
  DEFAULT_MAX_MOVE,
};
