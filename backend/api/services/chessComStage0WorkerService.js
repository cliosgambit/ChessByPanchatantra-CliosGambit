const db = require('../config/database');
const {
  runStage0ForChessComGame,
} = require('./chessComBrillianceService');
const {
  localDayBounds,
  DEFAULT_YESTERDAY_TZ,
} = require('./chessComSyncService');

const IDLE_POLL_MS = 30 * 1000;
const BUSY_PAUSE_MS = 100;
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
    sacrificeCandidates: 0,
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
  AND EXISTS (
    SELECT 1 FROM chess_com_moves m WHERE m.chess_com_uuid = g.chess_com_uuid
  )
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

async function countStage0QueueStats() {
  const params = dayPriorityParams();
  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int AS total_with_moves,
       COUNT(*) FILTER (
         WHERE r.stage0_status = 'completed'
       )::int AS completed,
       COUNT(*) FILTER (
         WHERE r.stage0_status = 'running'
       )::int AS running,
       COUNT(*) FILTER (
         WHERE r.stage0_status = 'failed'
       )::int AS failed,
       COUNT(*) FILTER (
         WHERE r.chess_com_uuid IS NULL
            OR COALESCE(r.stage0_status, 'pending') NOT IN ('completed', 'running', 'failed')
       )::int AS pending,
       COUNT(*) FILTER (
         WHERE (g.played_at::timestamptz) >= $1::timestamptz
           AND (g.played_at::timestamptz) < $2::timestamptz
           AND (r.chess_com_uuid IS NULL
                OR COALESCE(r.stage0_status, 'pending') NOT IN ('completed', 'running', 'failed'))
       )::int AS pending_today,
       COUNT(*) FILTER (
         WHERE (g.played_at::timestamptz) >= $3::timestamptz
           AND (g.played_at::timestamptz) < $4::timestamptz
           AND (r.chess_com_uuid IS NULL
                OR COALESCE(r.stage0_status, 'pending') NOT IN ('completed', 'running', 'failed'))
       )::int AS pending_yesterday
     FROM chess_com_games g
     INNER JOIN Students s ON LOWER(TRIM(s.chess_com_id)) = g.chess_com_id
     LEFT JOIN chess_com_brilliance_runs r ON r.chess_com_uuid = g.chess_com_uuid
     WHERE ${JOINING_GAME_FILTER}`,
    params
  );
  const row = rows[0] || {};
  return {
    totalWithMoves: Number(row.total_with_moves) || 0,
    completed: Number(row.completed) || 0,
    running: Number(row.running) || 0,
    failed: Number(row.failed) || 0,
    pending: Number(row.pending) || 0,
    pendingToday: Number(row.pending_today) || 0,
    pendingYesterday: Number(row.pending_yesterday) || 0,
  };
}

async function reclaimStaleStage0Running() {
  const { rowCount } = await db.query(
    `UPDATE chess_com_brilliance_runs
     SET stage0_status = 'pending',
         pipeline_status = 'queued',
         updated_at = NOW()
     WHERE stage0_status = 'running'
       AND (updated_at::timestamptz) < NOW() - INTERVAL '12 minutes'`
  );
  if (rowCount > 0) {
    console.log(`[chess-com stage0-worker] reclaimed ${rowCount} stale running game(s)`);
  }
}

async function fetchNextStage0Game() {
  await reclaimStaleStage0Running();
  const params = dayPriorityParams();
  const { rows } = await db.query(
    `SELECT g.chess_com_uuid, g.chess_com_id, g.pgn, g.played_at, s.player_name,
            r.stage0_status
     FROM chess_com_games g
     INNER JOIN Students s ON LOWER(TRIM(s.chess_com_id)) = g.chess_com_id
     LEFT JOIN chess_com_brilliance_runs r ON r.chess_com_uuid = g.chess_com_uuid
     WHERE ${JOINING_GAME_FILTER}
       AND (
         r.chess_com_uuid IS NULL
         OR COALESCE(r.stage0_status, 'pending') NOT IN ('completed', 'running', 'failed')
       )
     ORDER BY ${PRIORITY_ORDER}
     LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function processOneGame(row) {
  state.currentChessComId = row.chess_com_id;
  state.currentGameUuid = row.chess_com_uuid;

  const result = await runStage0ForChessComGame({
    pgn: row.pgn,
    chessComUuid: row.chess_com_uuid,
    force: false,
  });

  const sacCount = Number(result.sacrificeCandidateCount ?? result.stage0?.sacrifice_candidate_count) || 0;
  state.lifetime.gamesProcessed += 1;
  if (!result.cached) {
    state.lifetime.gamesCompleted += 1;
    state.lifetime.sacrificeCandidates += sacCount;
  }

  state.lastGame = {
    chessComId: row.chess_com_id,
    chessComUuid: row.chess_com_uuid,
    playerName: row.player_name || null,
    cached: Boolean(result.cached),
    sacrificeCandidateCount: sacCount,
    completedAt: new Date().toISOString(),
  };
  return state.lastGame;
}

async function tickStage0Worker(reason = 'poll') {
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
      console.log(`[chess-com stage0-worker] tick (${reason})`);
      const next = await fetchNextStage0Game();
      if (!next) {
        state.lastIdleAt = new Date().toISOString();
        state.lastCompletedAt = state.lastIdleAt;
        console.log('[chess-com stage0-worker] idle — no pending games with moves');
        return { idle: true };
      }

      processed = true;
      console.log(
        `[chess-com stage0-worker] analyzing ${next.chess_com_id} ${next.chess_com_uuid}`
      );
      const result = await processOneGame(next);
      state.lastCompletedAt = new Date().toISOString();
      console.log(
        `[chess-com stage0-worker] done ${result.chessComId}: sacCandidates=${result.sacrificeCandidateCount}, cached=${result.cached}`
      );

      if (result.sacrificeCandidateCount > 0) {
        try {
          require('./chessComStage1WorkerService').wakeStage1Worker('after-stage0');
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
      console.error(`[chess-com stage0-worker] failed (${reason}):`, err.message);
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
    tickStage0Worker(reason).catch(() => {});
  }, delayMs);
  if (typeof workerTimer.unref === 'function') workerTimer.unref();
}

function wakeStage0Worker(_reason = 'wake') {
  // Background brilliance workers disabled — use manual Run S0–S4.
  return null;
}

function startStage0Worker(_opts = {}) {
  state.enabled = false;
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  console.log('[chess-com stage0-worker] disabled — brilliance stages are manual-only');
  return getStage0WorkerStatus();
}

function stopStage0Worker() {
  state.enabled = false;
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  console.log('[chess-com stage0-worker] stopped');
  return getStage0WorkerStatus();
}

function getStage0WorkerStatus() {
  return {
    id: 'chess-com-stage0',
    label: 'Brilliance Stage 0',
    description:
      'Runs stage 0 on every move after chess_com_moves are stored. Priority: today’s games, then yesterday, then older.',
    enabled: state.enabled,
    inProgress: Boolean(workerTask) || state.inProgress,
    lastStartedAt: state.lastStartedAt,
    lastCompletedAt: state.lastCompletedAt,
    lastIdleAt: state.lastIdleAt,
    lastError: state.lastError,
    currentChessComId: state.currentChessComId,
    currentGameUuid: state.currentGameUuid,
    currentStage: 0,
    runs: state.runs,
    lifetime: { ...state.lifetime },
    lastGame: state.lastGame,
    idlePollMs: IDLE_POLL_MS,
    timeZone: TZ,
  };
}

async function getStage0WorkerStatusWithStats() {
  const status = getStage0WorkerStatus();
  let queue = {
    totalWithMoves: 0,
    completed: 0,
    running: 0,
    failed: 0,
    pending: 0,
    pendingToday: 0,
    pendingYesterday: 0,
  };
  try {
    queue = await countStage0QueueStats();
  } catch (err) {
    console.warn('[chess-com stage0-worker] stats failed:', err.message);
    status.statsError = err.message;
  }
  return { ...status, queue };
}

module.exports = {
  startStage0Worker,
  stopStage0Worker,
  wakeStage0Worker,
  tickStage0Worker,
  getStage0WorkerStatus,
  getStage0WorkerStatusWithStats,
  countStage0QueueStats,
};
