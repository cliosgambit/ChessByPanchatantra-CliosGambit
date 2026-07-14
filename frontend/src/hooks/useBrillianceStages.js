import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchChessComGameBrillianceFromDb,
  runChessComGameBrilliance,
} from '../services/chessComDbService';

const LIVE_POLL_MS = 1200;

function applyStagePayload(data, setters) {
  if (!data || data.status === 'pending') return;
  setters.setStage0(data.stage0 || null);
  setters.setStage1(data.stage1 || null);
  setters.setStage2(data.stage2 || null);
  setters.setStage3(data.stage3 || null);
  setters.setStage4(data.stage4 || null);
}

function isPipelineComplete(data) {
  const status = data?.stage4?.status;
  return status === 'completed' || status === 'failed';
}

function isPipelineRunning(data) {
  if (!data || data.status === 'pending') return false;
  const statuses = [
    data.stage0?.status,
    data.stage1?.status,
    data.stage2?.status,
    data.stage3?.status,
    data.stage4?.status,
  ];
  return statuses.some((s) => s === 'running');
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
  const pollTimerRef = useRef(null);

  const setters = {
    setStage0,
    setStage1,
    setStage2,
    setStage3,
    setStage4,
  };

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollLiveStages = useCallback(
    (requestId) =>
      new Promise((resolve) => {
        const tick = async () => {
          if (requestId !== requestIdRef.current) {
            resolve(null);
            return;
          }
          try {
            const cached = await fetchChessComGameBrillianceFromDb(profileUsername, game.uuid);
            if (requestId !== requestIdRef.current) {
              resolve(null);
              return;
            }
            if (cached && cached.status !== 'pending') {
              applyStagePayload(cached, setters);
              if (isPipelineComplete(cached)) {
                resolve(cached);
                return;
              }
            }
          } catch {
            // keep polling while analysis request is in flight
          }
          pollTimerRef.current = setTimeout(tick, LIVE_POLL_MS);
        };
        tick();
      }),
    [game?.uuid, profileUsername]
  );

  const runAnalysis = useCallback(
    async (force = false) => {
      if (!game?.uuid || !profileUsername) return;

      const requestId = ++requestIdRef.current;
      clearPoll();
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
          } else if (isPipelineRunning(cached)) {
            applyStagePayload(cached, setters);
            // Continue polling + don't start a duplicate run — await existing via force:false run
            // which coalesces on the backend. Fall through to run which joins in-flight pipeline.
          } else if (cached?.stage0?.moves?.length && !isPipelineComplete(cached)) {
            applyStagePayload(cached, setters);
          }
        } else {
          // Clear stale cells so "Running…" shows while stages refresh
          setStage0(null);
          setStage1(null);
          setStage2(null);
          setStage3(null);
          setStage4(null);
        }

        const runPromise = runChessComGameBrilliance(profileUsername, game.uuid, { force });
        const pollPromise = pollLiveStages(requestId);

        const data = await runPromise;
        clearPoll();
        if (requestId !== requestIdRef.current) return;

        applyStagePayload(data, setters);
        if (data.stage4?.status === 'failed') {
          setError(data.stage4?.error || 'Brilliance analysis failed');
        }

        // Let poll settle if it hasn't already
        await Promise.race([pollPromise, Promise.resolve()]);
      } catch (err) {
        clearPoll();
        if (requestId !== requestIdRef.current) return;
        setError(err.message || String(err));
      } finally {
        clearPoll();
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [game?.uuid, profileUsername, clearPoll, pollLiveStages]
  );

  useEffect(() => {
    setStageFilter(null);
    setError(null);
    runAnalysis(false);
    return () => {
      requestIdRef.current += 1;
      clearPoll();
    };
  }, [runAnalysis, clearPoll]);

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
