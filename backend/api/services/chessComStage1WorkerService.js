const db = require('../config/database');
const {
  runStage1ForChessComGame,
} = require('./chessComBrillianceService');
const {
  localDayBounds,
  DEFAULT_YESTERDAY_TZ,
} = require('./chessComSyncService');

const IDLE_POLL_MS = 30 * 1000;
const BUSY_PAUSE_MS = 150;
const TZ = DEFAULT_YESTERDAY_TZ;

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
  currentChessComId: null,
  currentGameUuid: null,
  runs: 0,
  lifetime: {
    gamesProcessed: 0,
    gamesCompleted: 0,
    gamesFailed: 0,
    proceedToStage2: 0,
  },
  lastGame: null,
};

function dayPriorityParams() {
  const today = localDayBounds(TZ, 0);
  const yesterday = localDayBounds(TZ, 1);
  return [today.startIso, today.endIso, yesterday.startIso, yesterday.endIso];
}

const JOINING_GAME_FILTER = `
  s.chess_com_id IS NOT NULL
  AND TRIM(s.chess_com_id) <> ''
  AND s.joining_date IS NOT NULL
  AND TRIM(s.joining_date) <> ''
  AND g.played_at IS NOT NULL
  AND TRIM(g.played_at::text) <> ''
  AND (g.played_at::timestamptz) >= (TRIM(s.joining_date)::timestamptz)
  AND g.pgn IS NOT NULL
  AND TRIM(g.pgn) <> ''
`;

const PRIORITY_ORDER = `
  CASE
    WHEN (g.played_at::timestamptz) >= $1::timestamptz
     AND (g.played_at::timestamptz) < $2::timestamptz THEN 0
    WHEN (g.played_at::timestamptz) >= $3::timestamptz
     AND (g.played_at::timestamptz) < $4::timestamptz THEN 1
    ELSE 2
  END ASC,
  (g.played_at::timestamptz) DESC NULLS LAST
`;

async function countStage1QueueStats() {
  const params = dayPriorityParams();
  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int AS stage0_passed_with_candidates,
       COUNT(*) FILTER (
         WHERE r.stage1_status = 'completed'
       )::int AS completed,
       COUNT(*) FILTER (
         WHERE r.stage1_status = 'running'
       )::int AS running,
       COUNT(*) FILTER (
         WHERE r.stage1_status = 'failed'
       )::int AS failed,
       COUNT(*) FILTER (
         WHERE COALESCE(r.stage1_status, 'pending') NOT IN ('completed', 'running', 'failed')
       )::int AS pending,
       COUNT(*) FILTER (
         WHERE (g.played_at::timestamptz) >= $1::timestamptz
           AND (g.played_at::timestamptz) < $2::timestamptz
           AND COALESCE(r.stage1_status, 'pending') NOT IN ('completed', 'running', 'failed')
       )::int AS pending_today,
       COUNT(*) FILTER (
         WHERE (g.played_at::timestamptz) >= $3::timestamptz
           AND (g.played_at::timestamptz) < $4::timestamptz
           AND COALESCE(r.stage1_status, 'pending') NOT IN ('completed', 'running', 'failed')
       )::int AS pending_yesterday
     FROM chess_com_games g
     INNER JOIN Students s ON LOWER(TRIM(s.chess_com_id)) = g.chess_com_id
     INNER JOIN chess_com_brilliance_runs r ON r.chess_com_uuid = g.chess_com_uuid
     WHERE ${JOINING_GAME_FILTER}
       AND r.stage0_status = 'completed'
       AND COALESCE(r.stage0_sacrifice_count, 0) > 0`,
    params
  );
  const row = rows[0] || {};
  return {
    stage0PassedWithCandidates: Number(row.stage0_passed_with_candidates) || 0,
    completed: Number(row.completed) || 0,
    running: Number(row.running) || 0,
    failed: Number(row.failed) || 0,
    pending: Number(row.pending) || 0,
    pendingToday: Number(row.pending_today) || 0,
    pendingYesterday: Number(row.pending_yesterday) || 0,
  };
}

async function reclaimStaleStage1Running() {
  const { rowCount } = await db.query(
    `UPDATE chess_com_brilliance_runs
     SET stage1_status = 'pending',
         pipeline_status = 'queued',
         updated_at = NOW()
     WHERE stage1_status = 'running'
       AND (updated_at::timestamptz) < NOW() - INTERVAL '12 minutes'`
  );
  if (rowCount > 0) {
    console.log(`[chess-com stage1-worker] reclaimed ${rowCount} stale running game(s)`);
  }
}

async function fetchNextStage1Game() {
  await reclaimStaleStage1Running();
  const params = dayPriorityParams();
  const { rows } = await db.query(
    `SELECT g.chess_com_uuid, g.chess_com_id, g.pgn, g.played_at, s.player_name,
            r.sqlite_game_id, r.stage0_sacrifice_count, r.stage1_status
     FROM chess_com_games g
     INNER JOIN Students s ON LOWER(TRIM(s.chess_com_id)) = g.chess_com_id
     INNER JOIN chess_com_brilliance_runs r ON r.chess_com_uuid = g.chess_com_uuid
     WHERE ${JOINING_GAME_FILTER}
       AND r.stage0_status = 'completed'
       AND COALESCE(r.stage0_sacrifice_count, 0) > 0
       AND COALESCE(r.stage1_status, 'pending') NOT IN ('completed', 'running', 'failed')
     ORDER BY ${PRIORITY_ORDER}
     LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function processOneGame(row) {
  state.currentChessComId = row.chess_com_id;
  state.currentGameUuid = row.chess_com_uuid;

  const result = await runStage1ForChessComGame({
    pgn: row.pgn,
    chessComUuid: row.chess_com_uuid,
    force: false,
  });

  const proceed = Number(result.proceedToStage2 ?? result.stage1?.proceed_to_stage2_count) || 0;
  state.lifetime.gamesProcessed += 1;
  if (!result.cached) {
    state.lifetime.gamesCompleted += 1;
    state.lifetime.proceedToStage2 += proceed;
  }

  state.lastGame = {
    chessComId: row.chess_com_id,
    chessComUuid: row.chess_com_uuid,
    playerName: row.player_name || null,
    cached: Boolean(result.cached),
    proceedToStage2: proceed,
    completedAt: new Date().toISOString(),
  };
  return state.lastGame;
}

async function tickStage1Worker(reason = 'poll') {
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
    let processed = false;
    let failedThisTick = false;
    try {
      console.log(`[chess-com stage1-worker] tick (${reason})`);
      const next = await fetchNextStage1Game();
      if (!next) {
        state.lastIdleAt = new Date().toISOString();
        state.lastCompletedAt = state.lastIdleAt;
        console.log('[chess-com stage1-worker] idle — no stage0-passed candidates pending');
        return { idle: true };
      }

      processed = true;
      console.log(
        `[chess-com stage1-worker] analyzing ${next.chess_com_id} ${next.chess_com_uuid}`
      );
      const result = await processOneGame(next);
      state.lastCompletedAt = new Date().toISOString();
      console.log(
        `[chess-com stage1-worker] done ${result.chessComId}: proceedStage2=${result.proceedToStage2}, cached=${result.cached}`
      );
      if (result.proceedToStage2 > 0) {
        try {
          require('./chessComStage2WorkerService').wakeStage2Worker('after-stage1');
        } catch {
          /* non-fatal */
        }
      }
      return result;
    } catch (err) {
      failedThisTick = true;
      processed = true;
      state.lifetime.gamesFailed += 1;
      state.lastError = err.message;
      state.lastCompletedAt = new Date().toISOString();
      console.error(`[chess-com stage1-worker] failed (${reason}):`, err.message);
      return { failed: true, error: err.message };
    } finally {
      state.inProgress = false;
      state.currentChessComId = null;
      state.currentGameUuid = null;
      workerTask = null;
      if (!state.enabled) return;

      const continueSoon = wakeRequested || processed;
      wakeRequested = false;
      scheduleNextTick(
        continueSoon ? BUSY_PAUSE_MS : IDLE_POLL_MS,
        continueSoon ? (failedThisTick ? 'after-error' : 'continue') : 'idle-poll'
      );
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
    tickStage1Worker(reason).catch(() => {});
  }, delayMs);
  if (typeof workerTimer.unref === 'function') workerTimer.unref();
}

function wakeStage1Worker(_reason = 'wake') {
  // Background brilliance workers disabled — use manual Run S0–S4.
  return null;
}

function startStage1Worker(_opts = {}) {
  state.enabled = false;
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  console.log('[chess-com stage1-worker] disabled — brilliance stages are manual-only');
  return getStage1WorkerStatus();
}

function stopStage1Worker() {
  state.enabled = false;
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  console.log('[chess-com stage1-worker] stopped');
  return getStage1WorkerStatus();
}

function getStage1WorkerStatus() {
  return {
    id: 'chess-com-stage1',
    label: 'Brilliance Stage 1',
    description:
      'Runs stage 1 on moves/games that passed stage 0 (sacrifice candidates). Priority: today → yesterday → older.',
    enabled: state.enabled,
    inProgress: Boolean(workerTask) || state.inProgress,
    lastStartedAt: state.lastStartedAt,
    lastCompletedAt: state.lastCompletedAt,
    lastIdleAt: state.lastIdleAt,
    lastError: state.lastError,
    currentChessComId: state.currentChessComId,
    currentGameUuid: state.currentGameUuid,
    currentStage: 1,
    runs: state.runs,
    lifetime: { ...state.lifetime },
    lastGame: state.lastGame,
    idlePollMs: IDLE_POLL_MS,
    timeZone: TZ,
  };
}

async function getStage1WorkerStatusWithStats() {
  const status = getStage1WorkerStatus();
  let queue = {
    stage0PassedWithCandidates: 0,
    completed: 0,
    running: 0,
    failed: 0,
    pending: 0,
    pendingToday: 0,
    pendingYesterday: 0,
  };
  try {
    queue = await countStage1QueueStats();
  } catch (err) {
    console.warn('[chess-com stage1-worker] stats failed:', err.message);
    status.statsError = err.message;
  }
  return { ...status, queue };
}

module.exports = {
  startStage1Worker,
  stopStage1Worker,
  wakeStage1Worker,
  tickStage1Worker,
  getStage1WorkerStatus,
  getStage1WorkerStatusWithStats,
  countStage1QueueStats,
};
