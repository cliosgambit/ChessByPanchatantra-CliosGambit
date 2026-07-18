const db = require('../config/database');
const {
  localDayBounds,
  DEFAULT_YESTERDAY_TZ,
} = require('./chessComSyncService');

const TZ = DEFAULT_YESTERDAY_TZ;

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

function dayPriorityParams() {
  const today = localDayBounds(TZ, 0);
  const yesterday = localDayBounds(TZ, 1);
  return [today.startIso, today.endIso, yesterday.startIso, yesterday.endIso];
}

/**
 * @param {object} config
 * @param {number} config.stage - 1..4
 * @param {string} config.id
 * @param {string} config.label
 * @param {string} config.description
 * @param {string} config.prerequisiteSql - AND clauses for eligibility (uses alias r)
 * @param {string} config.statusColumn - e.g. stage2_status
 * @param {(row: object) => Promise<object>} config.runGame
 * @param {(result: object) => number} config.passCount - count that unlocks next stage
 * @param {() => void} [config.onPassed] - wake next worker
 * @param {number} [config.idlePollMs]
 * @param {number} [config.busyPauseMs]
 */
function createStageWorker(config) {
  const {
    stage,
    id,
    label,
    description,
    prerequisiteSql,
    statusColumn,
    runGame,
    passCount,
    onPassed = null,
    idlePollMs = 30 * 1000,
    busyPauseMs = 200,
    lifetimeKey = 'passCount',
    /** Minutes before a stuck `running` row is reset to pending (Stockfish stages need longer). */
    staleRunningMinutes = stage >= 3 ? 45 : stage === 2 ? 20 : 12,
  } = config;

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
      [lifetimeKey]: 0,
    },
    lastGame: null,
  };

  const logPrefix = `[chess-com stage${stage}-worker]`;

  async function countQueueStats() {
    const params = dayPriorityParams();
    const { rows } = await db.query(
      `SELECT
         COUNT(*)::int AS eligible,
         COUNT(*) FILTER (
           WHERE r.${statusColumn} = 'completed'
         )::int AS completed,
         COUNT(*) FILTER (
           WHERE r.${statusColumn} = 'running'
         )::int AS running,
         COUNT(*) FILTER (
           WHERE r.${statusColumn} = 'failed'
         )::int AS failed,
         COUNT(*) FILTER (
           WHERE COALESCE(r.${statusColumn}, 'pending') NOT IN ('completed', 'running', 'failed')
         )::int AS pending,
         COUNT(*) FILTER (
           WHERE (g.played_at::timestamptz) >= $1::timestamptz
             AND (g.played_at::timestamptz) < $2::timestamptz
             AND COALESCE(r.${statusColumn}, 'pending') NOT IN ('completed', 'running', 'failed')
         )::int AS pending_today,
         COUNT(*) FILTER (
           WHERE (g.played_at::timestamptz) >= $3::timestamptz
             AND (g.played_at::timestamptz) < $4::timestamptz
             AND COALESCE(r.${statusColumn}, 'pending') NOT IN ('completed', 'running', 'failed')
         )::int AS pending_yesterday
       FROM chess_com_games g
       INNER JOIN Students s ON LOWER(TRIM(s.chess_com_id)) = g.chess_com_id
       INNER JOIN chess_com_brilliance_runs r ON r.chess_com_uuid = g.chess_com_uuid
       WHERE ${JOINING_GAME_FILTER}
         AND ${prerequisiteSql}`,
      params
    );
    const row = rows[0] || {};
    return {
      eligible: Number(row.eligible) || 0,
      completed: Number(row.completed) || 0,
      running: Number(row.running) || 0,
      failed: Number(row.failed) || 0,
      pending: Number(row.pending) || 0,
      pendingToday: Number(row.pending_today) || 0,
      pendingYesterday: Number(row.pending_yesterday) || 0,
    };
  }

  async function reclaimStaleRunning() {
    // Crash / aborted TX can leave stage status stuck on 'running' forever.
    const minutes = Math.max(5, Number(staleRunningMinutes) || 12);
    const { rowCount } = await db.query(
      `UPDATE chess_com_brilliance_runs
       SET ${statusColumn} = 'pending',
           pipeline_status = 'queued',
           updated_at = NOW()
       WHERE ${statusColumn} = 'running'
         AND (updated_at::timestamptz) < NOW() - ($1 * INTERVAL '1 minute')`,
      [minutes]
    );
    if (rowCount > 0) {
      console.log(`${logPrefix} reclaimed ${rowCount} stale running game(s) (>${minutes}m)`);
    }
  }

  async function fetchNextGame() {
    await reclaimStaleRunning();
    const params = dayPriorityParams();
    const { rows } = await db.query(
      `SELECT g.chess_com_uuid, g.chess_com_id, g.pgn, g.played_at, s.player_name,
              r.sqlite_game_id, r.${statusColumn}
       FROM chess_com_games g
       INNER JOIN Students s ON LOWER(TRIM(s.chess_com_id)) = g.chess_com_id
       INNER JOIN chess_com_brilliance_runs r ON r.chess_com_uuid = g.chess_com_uuid
       WHERE ${JOINING_GAME_FILTER}
         AND ${prerequisiteSql}
         AND COALESCE(r.${statusColumn}, 'pending') NOT IN ('completed', 'running', 'failed')
       ORDER BY ${PRIORITY_ORDER}
       LIMIT 1`,
      params
    );
    return rows[0] || null;
  }

  async function processOneGame(row) {
    state.currentChessComId = row.chess_com_id;
    state.currentGameUuid = row.chess_com_uuid;

    const result = await runGame(row);
    const count = Number(passCount(result)) || 0;

    state.lifetime.gamesProcessed += 1;
    if (!result.cached) {
      state.lifetime.gamesCompleted += 1;
      state.lifetime[lifetimeKey] += count;
    }

    state.lastGame = {
      chessComId: row.chess_com_id,
      chessComUuid: row.chess_com_uuid,
      playerName: row.player_name || null,
      cached: Boolean(result.cached),
      passCount: count,
      completedAt: new Date().toISOString(),
    };
    return { ...state.lastGame, result };
  }

  function scheduleNextTick(delayMs, reason) {
    if (workerTimer) {
      clearTimeout(workerTimer);
      workerTimer = null;
    }
    if (!state.enabled) return;
    workerTimer = setTimeout(() => {
      workerTimer = null;
      tick(reason).catch(() => {});
    }, delayMs);
    if (typeof workerTimer.unref === 'function') workerTimer.unref();
  }

  async function tick(reason = 'poll') {
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
        console.log(`${logPrefix} tick (${reason})`);
        const next = await fetchNextGame();
        if (!next) {
          state.lastIdleAt = new Date().toISOString();
          state.lastCompletedAt = state.lastIdleAt;
          console.log(`${logPrefix} idle — no pending games`);
          return { idle: true };
        }

        processed = true;
        console.log(`${logPrefix} analyzing ${next.chess_com_id} ${next.chess_com_uuid}`);
        const { result, ...meta } = await processOneGame(next);
        state.lastCompletedAt = new Date().toISOString();
        console.log(
          `${logPrefix} done ${meta.chessComId}: passCount=${meta.passCount}, cached=${meta.cached}`
        );

        if (meta.passCount > 0 && typeof onPassed === 'function') {
          try {
            onPassed(`after-stage${stage}`);
          } catch {
            /* non-fatal */
          }
        }
        return meta;
      } catch (err) {
        failedThisTick = true;
        processed = true;
        state.lifetime.gamesFailed += 1;
        state.lastError = err.message;
        state.lastCompletedAt = new Date().toISOString();
        console.error(`${logPrefix} failed (${reason}):`, err.message);
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
          continueSoon ? busyPauseMs : idlePollMs,
          continueSoon ? (failedThisTick ? 'after-error' : 'continue') : 'idle-poll'
        );
      }
    })();

    return workerTask;
  }

  function wake(_reason = 'wake') {
    // Background brilliance workers disabled — use manual Run S0–S4.
    return null;
  }

  function start(_opts = {}) {
    state.enabled = false;
    if (workerTimer) {
      clearTimeout(workerTimer);
      workerTimer = null;
    }
    console.log(`${logPrefix} disabled — brilliance stages are manual-only`);
    return getStatus();
  }

  function stop() {
    state.enabled = false;
    if (workerTimer) {
      clearTimeout(workerTimer);
      workerTimer = null;
    }
    console.log(`${logPrefix} stopped`);
    return getStatus();
  }

  function getStatus() {
    return {
      id,
      label,
      description,
      enabled: state.enabled,
      inProgress: Boolean(workerTask) || state.inProgress,
      lastStartedAt: state.lastStartedAt,
      lastCompletedAt: state.lastCompletedAt,
      lastIdleAt: state.lastIdleAt,
      lastError: state.lastError,
      currentChessComId: state.currentChessComId,
      currentGameUuid: state.currentGameUuid,
      currentStage: stage,
      runs: state.runs,
      lifetime: { ...state.lifetime },
      lastGame: state.lastGame,
      idlePollMs,
      timeZone: TZ,
    };
  }

  async function getStatusWithStats() {
    const status = getStatus();
    let queue = {
      eligible: 0,
      completed: 0,
      running: 0,
      failed: 0,
      pending: 0,
      pendingToday: 0,
      pendingYesterday: 0,
    };
    try {
      queue = await countQueueStats();
    } catch (err) {
      console.warn(`${logPrefix} stats failed:`, err.message);
      status.statsError = err.message;
    }
    return { ...status, queue };
  }

  return {
    start,
    stop,
    wake,
    tick,
    getStatus,
    getStatusWithStats,
    countQueueStats,
  };
}

module.exports = {
  createStageWorker,
  dayPriorityParams,
  JOINING_GAME_FILTER,
  PRIORITY_ORDER,
  TZ,
};
