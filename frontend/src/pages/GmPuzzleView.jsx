import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiShuffle } from 'react-icons/fi';
import ChroniclesPuzzleBoard from '../components/chronicles/ChroniclesPuzzleBoard';
import { fetchGmPuzzle, fetchGmPuzzles } from '../services/gmPuzzleService';
import { fetchBestMoveSequence, uciSequenceToSans } from '../utils/stockfishClient';
import './LibraryMoralPuzzles.css';

const SOLUTION_ENGINE_DEPTH = 15;
const SOLUTION_MAX_PLIES = 14;

function GmPuzzleView() {
  const { puzzleId } = useParams();
  const navigate = useNavigate();
  const [puzzle, setPuzzle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [boardKey, setBoardKey] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [computedSolutionSans, setComputedSolutionSans] = useState([]);
  const [isFetchingSolution, setIsFetchingSolution] = useState(false);
  const [solutionError, setSolutionError] = useState('');
  const solutionFetchId = useRef(0);
  const solutionCacheRef = useRef(new Map());

  const loadPuzzle = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchGmPuzzle(puzzleId);
      const next = data?.puzzle;
      if (!next?.fen) throw new Error('Puzzle not found or missing FEN.');
      setPuzzle(next);
      setBoardKey((v) => v + 1);
    } catch (err) {
      setError(err.message || 'Failed to load puzzle.');
      setPuzzle(null);
    } finally {
      setLoading(false);
    }
  }, [puzzleId]);

  useEffect(() => {
    loadPuzzle();
  }, [loadPuzzle]);

  const puzzleFen = puzzle?.fen || '';
  const hasPuzzle = Boolean(puzzleFen);

  useEffect(() => {
    const fetchId = ++solutionFetchId.current;
    setShowSolution(false);

    if (!puzzle?.id || !puzzleFen) {
      setComputedSolutionSans([]);
      setSolutionError('');
      setIsFetchingSolution(false);
      return undefined;
    }

    const cacheKey = String(puzzle.id);
    const cached = solutionCacheRef.current.get(cacheKey);
    if (cached) {
      setComputedSolutionSans(cached.sans || []);
      setSolutionError(cached.error || '');
      setIsFetchingSolution(false);
      return undefined;
    }

    setSolutionError('');
    setComputedSolutionSans([]);
    setIsFetchingSolution(true);

    (async () => {
      try {
        const uciMoves = await fetchBestMoveSequence(puzzleFen, {
          depth: SOLUTION_ENGINE_DEPTH,
          ply: SOLUTION_MAX_PLIES,
        });
        if (fetchId !== solutionFetchId.current) return;
        if (!uciMoves.length) {
          throw new Error('Analysis returned no valid moves.');
        }
        const sans = uciSequenceToSans(puzzleFen, uciMoves);
        if (!sans.length) {
          throw new Error('Analysis returned no valid moves.');
        }
        solutionCacheRef.current.set(cacheKey, { sans, error: '' });
        setComputedSolutionSans(sans);
      } catch (err) {
        if (fetchId !== solutionFetchId.current) return;
        const message = err.message || 'Failed to fetch solution from Stockfish.';
        solutionCacheRef.current.set(cacheKey, { sans: [], error: message });
        setSolutionError(message);
      } finally {
        if (fetchId === solutionFetchId.current) {
          setIsFetchingSolution(false);
        }
      }
    })();

    return undefined;
  }, [puzzle?.id, puzzleFen]);

  const handleShowSolution = useCallback(() => {
    setShowSolution(true);
  }, []);

  const handleAnotherRandom = async () => {
    try {
      const data = await fetchGmPuzzles();
      const list = (data.puzzles || []).filter((p) => p.fen && String(p.id) !== String(puzzleId));
      if (!list.length) {
        setError('No other puzzles available.');
        return;
      }
      const pick = list[Math.floor(Math.random() * list.length)];
      navigate(`/puzzles/gm/${pick.id}`);
    } catch (err) {
      setError(err.message || 'Failed to pick a random puzzle.');
    }
  };

  if (loading) {
    return (
      <div className="moral-puzzles-page">
        <p className="moral-puzzles-muted">Loading…</p>
      </div>
    );
  }

  if (error || !puzzle) {
    return (
      <div className="moral-puzzles-page">
        <p className="moral-puzzles-error">{error || 'Puzzle not found.'}</p>
      </div>
    );
  }

  const isUsed = Boolean(puzzle.is_used);

  return (
    <div className="moral-puzzles-page moral-puzzles-page--play moral-puzzles-page--triple">
      <div className="moral-puzzles-zone moral-puzzles-zone--story">
        <div className="moral-puzzles-left-inner">

          <h1 className="moral-play-title">GM Puzzle #{puzzle.id}</h1>
          <p className="moral-play-sub">Grandmaster puzzle workspace</p>

          {error ? <p className="moral-puzzles-error">{error}</p> : null}

          <section className="moral-play-card moral-play-card--moral">
            <p className="moral-play-card-label">Moral</p>
            <p className="moral-play-card-body">
              {puzzle.moral_name || '—'}
              {puzzle.moral_code ? (
                <span className="moral-play-moral-code">{puzzle.moral_code}</span>
              ) : null}
            </p>
          </section>

          <section className="moral-play-card">
            <p className="moral-play-card-label">Puzzle details</p>
            <p className="moral-play-card-body">
              ID {puzzle.id}
              <span className="moral-play-moral-code">{isUsed ? 'Used' : 'Unused'}</span>
            </p>
            <p className="moral-puzzles-fen">{puzzle.fen}</p>
          </section>

          <section className="moral-play-card moral-play-card--solution">
            <p className="moral-play-card-label">Puzzle Solution</p>
            {!showSolution ? (
              <>
                {hasPuzzle &&
                (isFetchingSolution || computedSolutionSans.length > 0) ? (
                  <button
                    type="button"
                    className="moral-play-solution-btn"
                    disabled={isFetchingSolution || computedSolutionSans.length === 0}
                    onClick={handleShowSolution}
                  >
                    Show Solution
                  </button>
                ) : null}
                {!isFetchingSolution &&
                hasPuzzle &&
                computedSolutionSans.length === 0 &&
                solutionError ? (
                  <p className="moral-puzzles-muted">{solutionError}</p>
                ) : null}
                {!isFetchingSolution &&
                hasPuzzle &&
                computedSolutionSans.length === 0 &&
                !solutionError ? (
                  <p className="moral-puzzles-muted">No solution moves available for this puzzle.</p>
                ) : null}
              </>
            ) : null}
            {showSolution && computedSolutionSans.length > 0 ? (
              <p className="moral-play-solution-text">{computedSolutionSans.join(' ')}</p>
            ) : null}
            {showSolution && computedSolutionSans.length === 0 && solutionError ? (
              <p className="moral-puzzles-muted">{solutionError}</p>
            ) : null}
            {showSolution &&
            computedSolutionSans.length === 0 &&
            !solutionError &&
            hasPuzzle ? (
              <p className="moral-puzzles-muted">No solution moves available for this puzzle.</p>
            ) : null}
          </section>

          <section className="moral-play-card">
            <p className="moral-play-card-label">Actions</p>
            <div className="moral-puzzles-add-row moral-play-add-row">
              <button
                type="button"
                className="moral-puzzles-btn moral-puzzles-btn--primary"
                onClick={handleAnotherRandom}
              >
                <FiShuffle aria-hidden /> Another random
              </button>
            </div>
          </section>
        </div>
      </div>

      <div className="moral-puzzles-zone moral-puzzles-zone--board" aria-label="Board area">
        <ChroniclesPuzzleBoard
          initialFen={puzzle.fen}
          resetKey={boardKey}
          layout="moral-zone"
        />
      </div>
    </div>
  );
}

export default GmPuzzleView;
