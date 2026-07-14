import { useCallback, useEffect, useRef, useState } from 'react';
import { runLichessBrilliance } from '../services/lichessPgnService';

function applyStagePayload(data, setters) {
  setters.setStage0(data.stage0 || null);
  setters.setStage1(data.stage1 || null);
  setters.setStage2(data.stage2 || null);
  setters.setStage3(data.stage3 || null);
  setters.setStage4(data.stage4 || null);
}

export function useLichessBrillianceStages(gameId) {
  const [stage0, setStage0] = useState(null);
  const [stage1, setStage1] = useState(null);
  const [stage2, setStage2] = useState(null);
  const [stage3, setStage3] = useState(null);
  const [stage4, setStage4] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stageFilter, setStageFilter] = useState(null);
  const requestIdRef = useRef(0);

  const setters = {
    setStage0,
    setStage1,
    setStage2,
    setStage3,
    setStage4,
  };

  const runAnalysis = useCallback(
    async (force = false) => {
      if (!gameId) return;

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const data = await runLichessBrilliance(gameId, { force });
        if (requestId !== requestIdRef.current) return;
        applyStagePayload(data, setters);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(err.message || String(err));
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [gameId]
  );

  useEffect(() => {
    setStage0(null);
    setStage1(null);
    setStage2(null);
    setStage3(null);
    setStage4(null);
    setStageFilter(null);
    setError(null);
    runAnalysis(false);
  }, [runAnalysis]);

  return {
    stage0,
    stage1,
    stage2,
    stage3,
    stage4,
    loading,
    error,
    stageFilter,
    setStageFilter,
    rerun: () => runAnalysis(true),
  };
}
