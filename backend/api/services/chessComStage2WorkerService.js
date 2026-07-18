const { createStageWorker } = require('./chessComStageWorkerFactory');
const { runStage2ForChessComGame } = require('./chessComBrillianceService');

const worker = createStageWorker({
  stage: 2,
  id: 'chess-com-stage2',
  label: 'Brilliance Stage 2',
  description:
    'Shallow Stockfish on moves that passed stage 1. Priority: today → yesterday → older.',
  statusColumn: 'stage2_status',
  prerequisiteSql: `
    r.stage1_status = 'completed'
    AND COALESCE(r.stage1_proceed_stage2_count, 0) > 0
  `,
  lifetimeKey: 'proceedToStage3',
  busyPauseMs: 400,
  runGame: (row) =>
    runStage2ForChessComGame({
      pgn: row.pgn,
      chessComUuid: row.chess_com_uuid,
      force: false,
    }),
  passCount: (result) =>
    Number(result.proceedToStage3 ?? result.passCount ?? result.stage2?.proceed_to_stage3_count) ||
    0,
  onPassed: (reason) => {
    try {
      require('./chessComStage3WorkerService').wakeStage3Worker(reason);
    } catch {
      /* non-fatal */
    }
  },
});

module.exports = {
  startStage2Worker: (opts) => worker.start(opts),
  stopStage2Worker: () => worker.stop(),
  wakeStage2Worker: (reason) => worker.wake(reason),
  tickStage2Worker: (reason) => worker.tick(reason),
  getStage2WorkerStatus: () => worker.getStatus(),
  getStage2WorkerStatusWithStats: () => worker.getStatusWithStats(),
  countStage2QueueStats: () => worker.countQueueStats(),
};
