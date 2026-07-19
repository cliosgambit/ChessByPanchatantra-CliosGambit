import { runChessComGameBrilliance } from './chessComDbService';

/**
 * Module-level "Run All Brilliance" runner.
 * Survives All Games unmount / pagination / route changes so the queue
 * keeps processing until finished or the user explicitly stops it.
 */

let state = null;
let cancelRequested = false;
let running = false;
const listeners = new Set();

function emit(next) {
  state = next;
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch {
      /* ignore subscriber errors */
    }
  });
}

function gameOwnerUsername(game) {
  return game?.chessComId || (game?.isWhite ? game?.white : game?.black) || null;
}

function gameLabel(game) {
  const white = game?.white || 'White';
  const black = game?.black || 'Black';
  return `${white} vs ${black}`;
}

export function isBrillianceComplete(game) {
  const run = game?.brillianceRun;
  return run?.stage4Status === 'completed' || run?.pipelineStatus === 'passed';
}

export function getBrillianceBatchState() {
  return state;
}

export function isBrillianceBatchRunning() {
  return running;
}

export function subscribeBrillianceBatch(listener) {
  listeners.add(listener);
  if (state) listener(state);
  return () => listeners.delete(listener);
}

export function stopBrillianceBatch() {
  if (!running) return;
  cancelRequested = true;
  emit(state ? { ...state, cancelling: true } : state);
}

/**
 * @param {object[]} games — filtered games snapshot to queue
 * @param {{ onAfterGame?: () => Promise<void> }} [options]
 */
export async function startBrillianceBatch(games, { onAfterGame } = {}) {
  if (running) return state;

  const list = Array.isArray(games) ? games : [];
  const queue = list.filter((game) => {
    const owner = gameOwnerUsername(game);
    return Boolean(owner && game?.uuid && !isBrillianceComplete(game));
  });

  if (queue.length === 0) {
    const empty = {
      running: false,
      cancelling: false,
      index: 0,
      total: 0,
      currentUuid: null,
      currentLabel: null,
      queueUuids: [],
      doneUuids: [],
      failedUuids: [],
      done: 0,
      failed: 0,
      skipped: list.length,
      finished: true,
      cancelled: false,
    };
    emit(empty);
    return empty;
  }

  running = true;
  cancelRequested = false;

  let done = 0;
  let failed = 0;
  const queueUuids = queue.map((g) => g.uuid);
  const failedUuids = new Set();
  const doneUuids = new Set();

  emit({
    running: true,
    cancelling: false,
    index: 0,
    total: queue.length,
    currentUuid: null,
    currentLabel: null,
    queueUuids,
    doneUuids: [],
    failedUuids: [],
    done: 0,
    failed: 0,
    skipped: list.length - queue.length,
    finished: false,
    cancelled: false,
  });

  try {
    for (let i = 0; i < queue.length; i += 1) {
      if (cancelRequested) break;

      const game = queue[i];
      const owner = gameOwnerUsername(game);
      const label = gameLabel(game);

      emit({
        running: true,
        cancelling: false,
        index: i + 1,
        total: queue.length,
        currentUuid: game.uuid,
        currentLabel: label,
        queueUuids,
        doneUuids: [...doneUuids],
        failedUuids: [...failedUuids],
        done,
        failed,
        skipped: list.length - queue.length,
        finished: false,
        cancelled: false,
      });

      try {
        await runChessComGameBrilliance(owner, game.uuid, { force: false });
        done += 1;
        doneUuids.add(game.uuid);
      } catch (err) {
        failed += 1;
        failedUuids.add(game.uuid);
        console.error(
          `[all-games] brilliance failed for ${label}:`,
          err?.message || err
        );
      }

      if (typeof onAfterGame === 'function') {
        try {
          await onAfterGame();
        } catch {
          /* keep going */
        }
      }
    }
  } finally {
    running = false;
    const cancelled = cancelRequested;
    cancelRequested = false;
    const finished = {
      running: false,
      cancelling: false,
      index: Math.min(done + failed, queue.length),
      total: queue.length,
      currentUuid: null,
      currentLabel: null,
      queueUuids,
      doneUuids: [...doneUuids],
      failedUuids: [...failedUuids],
      done,
      failed,
      skipped: list.length - queue.length,
      finished: true,
      cancelled,
    };
    emit(finished);
  }

  return state;
}
