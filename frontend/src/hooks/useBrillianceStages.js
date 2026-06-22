import { useCallback, useEffect, useRef, useState } from 'react';

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

  const runAnalysis = useCallback(
    async (force = false) => {
      if (!game?.uuid || !game?.pgn || !profileUsername) return;

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/chess-com/${encodeURIComponent(profileUsername)}/games/${encodeURIComponent(game.uuid)}/brilliance/run`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force }),
          }
        );
        const data = await res.json();
        if (requestId !== requestIdRef.current) return;
        if (!res.ok) throw new Error(data.error || 'Brilliance analysis failed');

        setStage0(data.stage0 || null);
        setStage1(data.stage1 || null);
        setStage2(data.stage2 || null);
        setStage3(data.stage3 || null);
        setStage4(data.stage4 || null);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(err.message || String(err));
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [game?.uuid, game?.pgn, profileUsername]
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
