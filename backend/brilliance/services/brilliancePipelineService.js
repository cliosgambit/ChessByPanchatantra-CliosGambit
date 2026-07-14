const { runStage0ForGame, getStage0Features } = require('./brillianceStage0Service');
const { runStage1ForGame, getStage1Features } = require('./brillianceStage1Service');
const { runStage2ForGame, getStage2Features } = require('./brillianceStage2Service');
const { runStage3ForGame, getStage3Features } = require('./brillianceStage3Service');
const { runStage4ForGame, getStage4Features } = require('./brillianceStage4Service');
const {
  clearStageTablesFrom,
  resetStageGameCounters,
  markStageEmptyComplete,
} = require('./brilliancePipelineUtils');

/** gameId -> in-flight Promise (coalesce concurrent / double-mount requests) */
const runningPipelines = new Map();

async function executeFullBrillianceForGame(id, force, onStageComplete = null) {
  const notify = async (payload) => {
    if (typeof onStageComplete === 'function') {
      await onStageComplete(payload);
    }
  };

  if (force) {
    clearStageTablesFrom(id, 1);
    resetStageGameCounters(id, 1);
  }

  const stage0 = await runStage0ForGame(id, { force });
  await notify({
    stage: 0,
    stage0: { ...stage0, engine_used: false },
    stage1: getStage1Features(id),
    stage2: getStage2Features(id),
    stage3: getStage3Features(id),
    stage4: getStage4Features(id),
  });

  const stage1 = await runStage1ForGame(id, { force: true });
  await notify({
    stage: 1,
    stage0: { ...stage0, engine_used: false },
    stage1,
    stage2: getStage2Features(id),
    stage3: getStage3Features(id),
    stage4: getStage4Features(id),
  });

  const stage2 = await runStage2ForGame(id, { force: true });
  await notify({
    stage: 2,
    stage0: { ...stage0, engine_used: false },
    stage1,
    stage2,
    stage3: getStage3Features(id),
    stage4: getStage4Features(id),
  });

  const stage2Analyzed = stage2?.analyzed_count ?? stage2?.moves?.length ?? 0;
  if (stage2Analyzed === 0) {
    clearStageTablesFrom(id, 3);
    resetStageGameCounters(id, 3);
    markStageEmptyComplete(id, 3);
    markStageEmptyComplete(id, 4);
    const result = {
      stage0: { ...stage0, engine_used: false },
      stage1,
      stage2,
      stage3: getStage3Features(id),
      stage4: getStage4Features(id),
    };
    await notify({ stage: 4, ...result });
    return result;
  }

  const stage3 = await runStage3ForGame(id, { force: true });
  await notify({
    stage: 3,
    stage0: { ...stage0, engine_used: false },
    stage1,
    stage2,
    stage3,
    stage4: getStage4Features(id),
  });

  const stage3Rows = stage3?.analyzed_count ?? stage3?.moves?.length ?? 0;
  if (stage3Rows === 0) {
    clearStageTablesFrom(id, 4);
    resetStageGameCounters(id, 4);
    markStageEmptyComplete(id, 4);
    const result = {
      stage0: { ...stage0, engine_used: false },
      stage1,
      stage2,
      stage3,
      stage4: getStage4Features(id),
    };
    await notify({ stage: 4, ...result });
    return result;
  }

  const stage4 = await runStage4ForGame(id, { force: true });
  const result = {
    stage0: { ...stage0, engine_used: false },
    stage1,
    stage2,
    stage3,
    stage4,
  };
  await notify({ stage: 4, ...result });
  return result;
}

async function runFullBrillianceForGame(gameId, { force = false, onStageComplete = null } = {}) {
  const id = parseInt(gameId, 10);
  if (!Number.isFinite(id)) throw new Error('Invalid game id');

  const inFlight = runningPipelines.get(id);
  if (inFlight) {
    return inFlight;
  }

  const task = executeFullBrillianceForGame(id, force, onStageComplete).finally(() => {
    if (runningPipelines.get(id) === task) {
      runningPipelines.delete(id);
    }
  });

  runningPipelines.set(id, task);
  return task;
}

module.exports = { runFullBrillianceForGame };
