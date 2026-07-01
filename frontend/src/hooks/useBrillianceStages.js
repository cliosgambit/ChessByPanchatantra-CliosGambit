import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchChessComGameBrillianceFromDb,
  runChessComGameBrilliance,
} from '../services/chessComDbService';

function applyStagePayload(data, setters) {
  setters.setStage0(data.stage0 || null);
  setters.setStage1(data.stage1 || null);
  setters.setStage2(data.stage2 || null);
  setters.setStage3(data.stage3 || null);
  setters.setStage4(data.stage4 || null);
}

export function useBrillianceStages(game, profileUsername) {
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
      if (!game?.uuid || !profileUsername) return;

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        if (!force) {
          const cached = await fetchChessComGameBrillianceFromDb(profileUsername, game.uuid);
          if (requestId !== requestIdRef.current) return;

          if (cached?.status === 'pending') {
            // fall through to run
          } else if (cached?.stage4?.status === 'completed') {
            applyStagePayload(cached, setters);
            return;
          } else if (cached?.stage4?.status === 'failed') {
            applyStagePayload(cached, setters);
            setError(cached.stage4?.error || 'Brilliance analysis failed');
            return;
          } else if (cached?.stage4?.status === 'running') {
            applyStagePayload(cached, setters);
            return;
          }
        }

        const data = await runChessComGameBrilliance(profileUsername, game.uuid, { force });
        if (requestId !== requestIdRef.current) return;

        applyStagePayload(data, setters);
        if (data.stage4?.status === 'failed') {
          setError(data.stage4?.error || 'Brilliance analysis failed');
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(err.message || String(err));
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [game?.uuid, profileUsername]
  );

  useEffect(() => {
    setStageFilter(null);
    setError(null);
    runAnalysis(false);
  }, [runAnalysis]);

  useEffect(() => {
    if (loading || !stage1?.moves?.length) return;
    setStageFilter((prev) => (prev === null ? 'stage1' : prev));
  }, [loading, stage1?.moves?.length]);

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
