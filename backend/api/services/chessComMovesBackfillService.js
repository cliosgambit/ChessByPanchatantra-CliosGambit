const db = require('../config/database');
const { ensureMovesForGame } = require('./chessComSyncService');

const BATCH_SIZE = 12;
const IDLE_POLL_MS = 30 * 1000;
const BUSY_PAUSE_MS = 50;

let workerTimer = null;
let workerTask = null;
let wakeRequested = false;

const state = {
  enabled: false,
  inProgress: false,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastIdleAt: null,
  lastError: null,
  lastBatchAt: null,
  currentChessComId: null,
  currentGameUuid: null,
  runs: 0,
  lifetime: {
    gamesProcessed: 0,
    movesInserted: 0,
    gamesFailed: 0,
  },
  lastBatch: {
    gamesProcessed: 0,
    movesInserted: 0,
    gamesFailed: 0,
    durationMs: 0,
  },
};

async function countMoveBackfillStats() {
  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int AS total_since_join,
       COUNT(*) FILTER (
         WHERE EXISTS (
           SELECT 1 FROM chess_com_moves m WHERE m.chess_com_uuid = g.chess_com_uuid
         )
       )::int AS moves_ready,
       COUNT(*) FILTER (
         WHERE g.pgn IS NOT NULL
           AND TRIM(g.pgn) <> ''
           AND NOT EXISTS (
             SELECT 1 FROM chess_com_moves m WHERE m.chess_com_uuid = g.chess_com_uuid
           )
       )::int AS moves_pending
     FROM chess_com_games g
     INNER JOIN Students s
       ON LOWER(TRIM(s.chess_com_id)) = g.chess_com_id
     WHERE s.chess_com_id IS NOT NULL
       AND TRIM(s.chess_com_id) <> ''
       AND s.joining_date IS NOT NULL
       AND TRIM(s.joining_date) <> ''
       AND g.played_at IS NOT NULL
       AND TRIM(g.played_at::text) <> ''
       AND (g.played_at::timestamptz) >= (TRIM(s.joining_date)::timestamptz)`
  );

  const row = rows[0] || {};
  return {
    totalSinceJoin: Number(row.total_since_join) || 0,
    movesReady: Number(row.moves_ready) || 0,
    movesPending: Number(row.moves_pending) || 0,
  };
}

async function fetchPendingGamesBatch(limit = BATCH_SIZE) {
  const { rows } = await db.query(
    `SELECT g.chess_com_uuid, g.chess_com_id, g.pgn, g.move_count, g.played_at,
            s.joining_date, s.player_name
     FROM chess_com_games g
     INNER JOIN Students s
       ON LOWER(TRIM(s.chess_com_id)) = g.chess_com_id
     WHERE s.chess_com_id IS NOT NULL
       AND TRIM(s.chess_com_id) <> ''
       AND s.joining_date IS NOT NULL
       AND TRIM(s.joining_date) <> ''
       AND g.played_at IS NOT NULL
       AND TRIM(g.played_at::text) <> ''
       AND (g.played_at::timestamptz) >= (TRIM(s.joining_date)::timestamptz)
       AND g.pgn IS NOT NULL
       AND TRIM(g.pgn) <> ''
       AND NOT EXISTS (
         SELECT 1 FROM chess_com_moves m WHERE m.chess_com_uuid = g.chess_com_uuid
       )
     ORDER BY (g.played_at::timestamptz) DESC NULLS LAST
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function processOneGame(row) {
  state.currentChessComId = row.chess_com_id;
  state.currentGameUuid = row.chess_com_uuid;
  const inserted = await ensureMovesForGame(
    row.chess_com_uuid,
    row.chess_com_id,
    row.pgn,
    row.move_count || 0
  );
  return inserted;
}

async function runMovesBackfillBatch() {
  const startedAt = Date.now();
  const batch = await fetchPendingGamesBatch(BATCH_SIZE);

  let gamesProcessed = 0;
  let movesInserted = 0;
  let gamesFailed = 0;

  for (const row of batch) {
    try {
      const inserted = await processOneGame(row);
      gamesProcessed += 1;
      movesInserted += Number(inserted) || 0;
      state.lifetime.gamesProcessed += 1;
      state.lifetime.movesInserted += Number(inserted) || 0;
    } catch (err) {
      gamesFailed += 1;
      state.lifetime.gamesFailed += 1;
      state.lastError = `${row.chess_com_id}/${row.chess_com_uuid}: ${err.message}`;
      console.warn(
        `[chess-com moves-backfill] failed ${row.chess_com_id} ${row.chess_com_uuid}:`,
        err.message
      );
    }
  }

  state.currentChessComId = null;
  state.currentGameUuid = null;
  state.lastBatchAt = new Date().toISOString();
  state.lastBatch = {
    gamesProcessed,
    movesInserted,
    gamesFailed,
    durationMs: Date.now() - startedAt,
  };

  return {
    ...state.lastBatch,
    batchSize: batch.length,
    hasMore: batch.length >= BATCH_SIZE,
  };
}

async function tickMovesBackfill(reason = 'poll') {
  if (workerTask) {
    wakeRequested = true;
    return workerTask;
  }

  state.inProgress = true;
  state.lastStartedAt = new Date().toISOString();
  state.lastError = null;
  state.runs += 1;
  wakeRequested = false;

  workerTask = (async () => {
    try {
      console.log(`[chess-com moves-backfill] tick (${reason})`);
      const result = await runMovesBackfillBatch();

      if (result.batchSize === 0) {
        state.lastIdleAt = new Date().toISOString();
        state.lastCompletedAt = state.lastIdleAt;
        console.log('[chess-com moves-backfill] idle — no pending games since joining date');
        return { idle: true, ...result };
      }

      state.lastCompletedAt = new Date().toISOString();
      console.log(
        `[chess-com moves-backfill] batch: games=${result.gamesProcessed}, moves+=${result.movesInserted}, failed=${result.gamesFailed}, ${result.durationMs}ms`
      );
      return result;
    } catch (err) {
      state.lastError = err.message;
      state.lastCompletedAt = new Date().toISOString();
      console.error(`[chess-com moves-backfill] failed (${reason}):`, err.message);
      return { failed: true, error: err.message };
    } finally {
      state.inProgress = false;
      workerTask = null;

      if (!state.enabled) return;

      const shouldContinue = wakeRequested || (state.lastBatch?.gamesProcessed > 0);
      wakeRequested = false;
      scheduleNextTick(shouldContinue ? BUSY_PAUSE_MS : IDLE_POLL_MS, shouldContinue ? 'continue' : 'idle-poll');
    }
  })();

  return workerTask;
}

function scheduleNextTick(delayMs, reason) {
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  if (!state.enabled) return;

  workerTimer = setTimeout(() => {
    workerTimer = null;
    tickMovesBackfill(reason).catch(() => {});
  }, delayMs);

  if (typeof workerTimer.unref === 'function') {
    workerTimer.unref();
  }
}

function wakeMovesBackfill(_reason = 'wake') {
  // Moves-backfill worker disabled — game review parses PGN on open.
  return null;
}

function startMovesBackfillWorker(_opts = {}) {
  state.enabled = false;
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  console.log('[chess-com moves-backfill] disabled — no background workers');
  return getMovesBackfillStatus();
}

function stopMovesBackfillWorker() {
  state.enabled = false;
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  console.log('[chess-com moves-backfill] worker stopped');
  return getMovesBackfillStatus();
}

function getMovesBackfillStatus() {
  return {
    id: 'chess-com-moves-backfill',
    label: 'Chess.com move parsing',
    description:
      'Parses PGNs into chess_com_moves for games played on/after each student joining date.',
    enabled: state.enabled,
    inProgress: Boolean(workerTask) || state.inProgress,
    lastStartedAt: state.lastStartedAt,
    lastCompletedAt: state.lastCompletedAt,
    lastIdleAt: state.lastIdleAt,
    lastBatchAt: state.lastBatchAt,
    lastError: state.lastError,
    currentChessComId: state.currentChessComId,
    currentGameUuid: state.currentGameUuid,
    runs: state.runs,
    lifetime: { ...state.lifetime },
    lastBatch: { ...state.lastBatch },
    batchSize: BATCH_SIZE,
    idlePollMs: IDLE_POLL_MS,
  };
}

async function getMovesBackfillStatusWithStats() {
  const status = getMovesBackfillStatus();
  let queue = {
    totalSinceJoin: 0,
    movesReady: 0,
    movesPending: 0,
  };
  try {
    queue = await countMoveBackfillStats();
  } catch (err) {
    console.warn('[chess-com moves-backfill] stats query failed:', err.message);
    status.statsError = err.message;
  }
  return { ...status, queue };
}

function jobPayload(status) {
  return {
    id: status.id,
    label: status.label,
    description: status.description,
    enabled: status.enabled,
    inProgress: status.inProgress,
    lastStartedAt: status.lastStartedAt,
    lastCompletedAt: status.lastCompletedAt,
    lastIdleAt: status.lastIdleAt,
    lastError: status.lastError,
    runs: status.runs,
    currentChessComId: status.currentChessComId,
    currentGameUuid: status.currentGameUuid,
    currentStage: status.currentStage,
    lifetime: status.lifetime,
    lastGame: status.lastGame,
    lastBatch: status.lastBatch,
    queue: status.queue,
    intervalMs: status.intervalMs,
    lastResult: status.lastResult,
    timeZone: status.timeZone,
  };
}

function stageQuick(stats) {
  return {
    enabled: stats.enabled,
    inProgress: stats.inProgress,
    lastCompletedAt: stats.lastCompletedAt,
    runs: stats.runs,
    pending: stats.queue?.pending ?? 0,
    pendingToday: stats.queue?.pendingToday ?? 0,
    pendingYesterday: stats.queue?.pendingYesterday ?? 0,
    completed: stats.queue?.completed ?? 0,
    failed: stats.queue?.failed ?? 0,
    lastError: stats.lastError,
  };
}

async function getBackgroundJobsStatus() {
  const syncService = require('./chessComSyncService');
  const autoSync = syncService.getAutoSyncStatus();
  const movesBackfill = await getMovesBackfillStatusWithStats();
  const disabledStage = {
    enabled: false,
    inProgress: false,
    lastCompletedAt: null,
    runs: 0,
    pending: 0,
    pendingToday: 0,
    pendingYesterday: 0,
    completed: 0,
    failed: 0,
    lastError: null,
  };

  return {
    updatedAt: new Date().toISOString(),
    jobs: [
      {
        id: 'chess-com-auto-sync',
        label: 'Chess.com auto sync',
        description:
          'Keeps student profiles/stats fresh and pulls new archive months in the background.',
        enabled: autoSync.enabled,
        inProgress: autoSync.inProgress,
        intervalMs: autoSync.intervalMs,
        lastStartedAt: autoSync.lastStartedAt,
        lastCompletedAt: autoSync.lastCompletedAt,
        lastError: autoSync.lastError,
        runs: autoSync.runs,
        lastResult: autoSync.lastResult,
      },
    ],
    quickStats: {
      autoSync: {
        enabled: autoSync.enabled,
        inProgress: autoSync.inProgress,
        lastCompletedAt: autoSync.lastCompletedAt,
        runs: autoSync.runs,
        lastPlayers: autoSync.lastResult?.players ?? null,
        lastGamesUpserted: autoSync.lastResult?.gamesUpserted ?? null,
        lastArchivesFetched: autoSync.lastResult?.archivesFetched ?? null,
        lastDurationMs: autoSync.lastResult?.durationMs ?? null,
        lastError: autoSync.lastError,
      },
      movesBackfill: {
        enabled: false,
        inProgress: false,
        lastCompletedAt: movesBackfill.lastCompletedAt,
        runs: 0,
        pending: movesBackfill.queue?.movesPending ?? 0,
        ready: movesBackfill.queue?.movesReady ?? 0,
        totalSinceJoin: movesBackfill.queue?.totalSinceJoin ?? 0,
        lifetimeMovesInserted: 0,
        lifetimeGamesProcessed: 0,
        lastError: null,
      },
      stage0: disabledStage,
      stage1: disabledStage,
      stage2: disabledStage,
      stage3: disabledStage,
      stage4: disabledStage,
    },
  };
}

module.exports = {
  startMovesBackfillWorker,
  stopMovesBackfillWorker,
  wakeMovesBackfill,
  tickMovesBackfill,
  getMovesBackfillStatus,
  getMovesBackfillStatusWithStats,
  getBackgroundJobsStatus,
  countMoveBackfillStats,
};
