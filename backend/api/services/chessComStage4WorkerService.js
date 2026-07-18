const { createStageWorker } = require('./chessComStageWorkerFactory');
const { runStage4ForChessComGame } = require('./chessComBrillianceService');

const worker = createStageWorker({
  stage: 4,
  id: 'chess-com-stage4',
  label: 'Brilliance Stage 4',
  description:
    'Final brilliant-move classification for moves that passed stage 3. Priority: today → yesterday → older.',
  statusColumn: 'stage4_status',
  prerequisiteSql: `
    r.stage3_status = 'completed'
    AND COALESCE(r.stage3_sound_count, r.stage3_analyzed_count, 0) > 0
  `,
  lifetimeKey: 'brilliantMoves',
  busyPauseMs: 500,
  runGame: (row) =>
    runStage4ForChessComGame({
      pgn: row.pgn,
      chessComUuid: row.chess_com_uuid,
      force: false,
    }),
  passCount: (result) =>
    Number(result.brilliantCount ?? result.passCount ?? result.stage4?.brilliant_count) || 0,
});

module.exports = {
  startStage4Worker: (opts) => worker.start(opts),
  stopStage4Worker: () => worker.stop(),
  wakeStage4Worker: (reason) => worker.wake(reason),
  tickStage4Worker: (reason) => worker.tick(reason),
  getStage4WorkerStatus: () => worker.getStatus(),
  getStage4WorkerStatusWithStats: () => worker.getStatusWithStats(),
  countStage4QueueStats: () => worker.countQueueStats(),
};
