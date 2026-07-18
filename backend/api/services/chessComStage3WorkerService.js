const { createStageWorker } = require('./chessComStageWorkerFactory');
const { runStage3ForChessComGame } = require('./chessComBrillianceService');

const worker = createStageWorker({
  stage: 3,
  id: 'chess-com-stage3',
  label: 'Brilliance Stage 3',
  description:
    'Deep Stockfish on moves that passed stage 2. Priority: today → yesterday → older.',
  statusColumn: 'stage3_status',
  prerequisiteSql: `
    r.stage2_status = 'completed'
    AND COALESCE(r.stage2_proceed_stage3_count, 0) > 0
  `,
  lifetimeKey: 'soundCount',
  busyPauseMs: 600,
  runGame: (row) =>
    runStage3ForChessComGame({
      pgn: row.pgn,
      chessComUuid: row.chess_com_uuid,
      force: false,
    }),
  passCount: (result) =>
    Number(result.soundCount ?? result.passCount ?? result.stage3?.sound_count) || 0,
  onPassed: (reason) => {
    try {
      require('./chessComStage4WorkerService').wakeStage4Worker(reason);
    } catch {
      /* non-fatal */
    }
  },
});

module.exports = {
  startStage3Worker: (opts) => worker.start(opts),
  stopStage3Worker: () => worker.stop(),
  wakeStage3Worker: (reason) => worker.wake(reason),
  tickStage3Worker: (reason) => worker.tick(reason),
  getStage3WorkerStatus: () => worker.getStatus(),
  getStage3WorkerStatusWithStats: () => worker.getStatusWithStats(),
  countStage3QueueStats: () => worker.countQueueStats(),
};
