import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  buildGameTimeline,
  countLegalMovesAtPly,
  enrichHistoryWithUci,
} from '../utils/gameTimelineUtils';
import {
  classifyPlayedMoveAtNavIndex,
  getPlayedMoveEvalDisplay,
} from '../utils/playedMoveClassification';

const API_BASE = '';

export function useGameAnalysis(history, moveHistory, navIndex, options = {}) {
  const multipv = options.multipv || 3;
  const enabled = options.enabled !== false;

  const enrichedHistory = useMemo(
    () => enrichHistoryWithUci(history),
    [history]
  );

  const timeline = useMemo(
    () => buildGameTimeline(enrichedHistory, moveHistory),
    [enrichedHistory, moveHistory]
  );

  const [analysis, setAnalysis] = useState([]);
  const [analysisQueue, setAnalysisQueue] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const analyzedIndicesRef = useRef(new Set());
  const lastKnownEvalRef = useRef({ percent: 50, display: { text: '0.00', side: 'w' } });

  useEffect(() => {
    setAnalysis([]);
    setAnalysisQueue([]);
    analyzedIndicesRef.current.clear();
    lastKnownEvalRef.current = { percent: 50, display: { text: '0.00', side: 'w' } };
  }, [history, moveHistory]);

  const analyzePosition = useCallback(
    async (idx) => {
      const currentA = analysis[idx];
      if (currentA && (currentA.error || currentA.score)) return;
      if (analyzedIndicesRef.current.has(idx)) return;
      analyzedIndicesRef.current.add(idx);

      const entry = timeline[idx];
      if (!entry?.fen) return;

      const chess = new Chess(entry.fen);
      if (chess.isGameOver()) {
        let score;
        if (chess.isCheckmate()) {
          score = { type: 'mate', value: 0 };
        } else {
          score = { type: 'cp', value: 0 };
        }
        setAnalysis((prev) => {
          const next = [...prev];
          next[idx] = { score, depth: 0, lines: [] };
          return next;
        });
        return;
      }

      try {
        const currentFen = entry.fen;
        const previousFen = idx > 0 ? timeline[idx - 1]?.fen : currentFen;

        const analyzeRes = await fetch(`${API_BASE}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            previous_fen: previousFen,
            current_fen: currentFen,
            multipv,
          }),
        });

        if (!analyzeRes.ok) {
          throw new Error(`Analyze request failed: ${analyzeRes.status}`);
        }

        const aData = await analyzeRes.json();
        setAnalysis((prev) => {
          const next = [...prev];
          next[idx] = aData;
          return next;
        });
      } catch (e) {
        setAnalysis((prev) => {
          const next = [...prev];
          next[idx] = { error: String(e?.message || e), depth: 0, lines: [] };
          return next;
        });
      }
    },
    [analysis, timeline, multipv]
  );

  useEffect(() => {
    if (!enabled) return;

    const missing = timeline
      .map((_, idx) => idx)
      .filter((idx) => {
        const a = analysis[idx];
        const isComplete = analyzedIndicesRef.current.has(idx) || (a && (a.error || a.score));
        return !isComplete && !analysisQueue.includes(idx);
      });

    if (missing.length > 0) {
      setAnalysisQueue((q) => {
        const newItems = missing.filter((idx) => !q.includes(idx));
        if (newItems.length === 0) return q;
        return [...q, ...newItems].sort((a, b) => {
          if (a === navIndex) return -1;
          if (b === navIndex) return 1;
          return a - b;
        });
      });
    }
  }, [navIndex, timeline, analysis, analysisQueue, enabled]);

  useEffect(() => {
    if (!enabled || isAnalyzing || analysisQueue.length === 0) return;

    const processNext = async () => {
      const idx = analysisQueue[0];
      if (!timeline[idx]) {
        setAnalysisQueue((q) => q.slice(1));
        return;
      }

      setIsAnalyzing(true);
      try {
        await analyzePosition(idx);
      } finally {
        setAnalysisQueue((q) => q.slice(1));
        setIsAnalyzing(false);
      }
    };

    processNext();
  }, [isAnalyzing, analysisQueue, timeline, analyzePosition, enabled]);

  const currentTurn = timeline[navIndex]?.turn || 'w';

  const { percent: evalPercent, display: displayScore } = useMemo(() => {
    const cur = analysis[navIndex];
    if (!cur || !cur.score) {
      return lastKnownEvalRef.current;
    }

    const s = cur.score;
    const turnOfAnalysis = timeline[navIndex]?.turn || 'w';

    let v;
    if (s.type === 'cp') {
      v = s.value / 100;
      if (turnOfAnalysis === 'b') v = -v;
    } else {
      v = s.value;
      if (turnOfAnalysis === 'b') v = -v;
    }

    let percent;
    const whiteWinProb = cur?.winProbability?.white;
    if (typeof whiteWinProb === 'number' && Number.isFinite(whiteWinProb)) {
      percent = Math.max(0, Math.min(100, whiteWinProb));
    } else if (s.type === 'mate') {
      if (v > 0) percent = 100;
      else if (v < 0) percent = 0;
      else percent = turnOfAnalysis === 'w' ? 0 : 100;
    } else {
      if (v >= 8) percent = 100;
      else if (v >= 4) percent = 90 + ((v - 4) / 4) * 10;
      else if (v >= 0) percent = 50 + (v / 4) * 40;
      else if (v >= -4) percent = 10 + ((v + 4) / 4) * 40;
      else if (v >= -8) percent = 0 + ((v + 8) / 4) * 10;
      else percent = 0;
    }

    const side = v >= 0 ? 'w' : 'b';
    const displayScoreValue = s.type === 'mate' ? `M${Math.abs(v)}` : (v >= 0 ? '+' : '') + v.toFixed(2);
    const result = { percent, display: { text: displayScoreValue, side } };
    lastKnownEvalRef.current = result;
    return result;
  }, [analysis, navIndex, timeline]);

  const moveClassifications = useMemo(() => {
    if (!enrichedHistory.length) return [];
    return enrichedHistory.map((_, hi) =>
      classifyPlayedMoveAtNavIndex(analysis, timeline, enrichedHistory, hi + 1)
    );
  }, [analysis, enrichedHistory, timeline]);

  const playedMoveEval = useMemo(
    () => getPlayedMoveEvalDisplay(analysis, enrichedHistory, timeline, navIndex),
    [analysis, enrichedHistory, timeline, navIndex]
  );

  const legalMovesCount = useMemo(
    () => countLegalMovesAtPly(timeline, navIndex),
    [navIndex, timeline]
  );

  const analysisProgress = useMemo(() => {
    if (timeline.length === 0) return 100;
    const analyzedCount = timeline.filter((_, idx) => {
      const a = analysis[idx];
      return a && (a.error || a.score);
    }).length;
    return Math.round((analyzedCount / timeline.length) * 100);
  }, [timeline, analysis]);

  const currentMove = navIndex > 0 ? enrichedHistory[navIndex - 1] : null;

  return {
    analysis,
    timeline,
    enrichedHistory,
    evalPercent,
    displayScore,
    currentTurn,
    moveClassifications,
    playedMoveEval,
    legalMovesCount,
    analysisProgress,
    isAnalyzing,
    currentMove,
  };
}
