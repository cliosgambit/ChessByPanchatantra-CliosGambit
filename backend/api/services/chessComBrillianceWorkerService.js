/**
 * Legacy brilliance worker façade — disabled.
 * Brilliance Stages 0–4 run only via manual API / UI (Run S0–S4).
 */

function startBrillianceWorker(_opts) {
  console.log('[chess-com brilliance-worker] disabled — brilliance stages are manual-only');
  return getBrillianceWorkerStatus();
}

function stopBrillianceWorker() {
  return getBrillianceWorkerStatus();
}

function wakeBrillianceWorker(_reason) {
  return null;
}

function getBrillianceWorkerStatus() {
  return {
    id: 'chess-com-brilliance',
    label: 'Chess.com brilliance',
    description: 'Disabled. Run Stages 0–4 manually from All Games or the game page.',
    enabled: false,
    inProgress: false,
    lastError: null,
    runs: 0,
    workers: [],
  };
}

async function getBrillianceWorkerStatusWithStats() {
  return getBrillianceWorkerStatus();
}

module.exports = {
  startBrillianceWorker,
  stopBrillianceWorker,
  wakeBrillianceWorker,
  getBrillianceWorkerStatus,
  getBrillianceWorkerStatusWithStats,
};
