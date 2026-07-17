import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiExternalLink, FiRefreshCw } from 'react-icons/fi';
import ChroniclesPuzzleBoard from '../components/chronicles/ChroniclesPuzzleBoard';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
import { fetchChessComRandomPuzzle } from '../services/chessComDbService';
import { solutionTextFromChessCom } from '../utils/chessComPgnUtils';
import './LibraryMoralPuzzles.css';

const CHESSCOM_BREADCRUMB = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Puzzles', to: '/puzzles' },
  { label: 'Chess.com Puzzles' },
];

const CHESSCOM_PUZZLE_CACHE_KEY = 'clio:chesscom-random-puzzle';
const FETCH_NEW_MAX_ATTEMPTS = 40;
const FETCH_NEW_RETRY_MS = 750;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fenOrientation(fen) {
  try {
    return String(fen || '').split(/\s+/)[1] === 'b' ? 'black' : 'white';
  } catch {
    return 'white';
  }
}

function sameFen(a, b) {
  const fenA = String(a?.fen || '').trim();
  const fenB = String(b?.fen || '').trim();
  return Boolean(fenA) && fenA === fenB;
}

function stripTransientPuzzleFields(puzzle) {
  if (!puzzle) return null;
  const { persistPromise, ...serializable } = puzzle;
  return serializable;
}

function readCachedPuzzle() {
  try {
    const raw = localStorage.getItem(CHESSCOM_PUZZLE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.fen ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedPuzzle(puzzle) {
  try {
    const serializable = stripTransientPuzzleFields(puzzle);
    if (serializable?.fen) {
      localStorage.setItem(CHESSCOM_PUZZLE_CACHE_KEY, JSON.stringify(serializable));
    }
  } catch {
    // Cache failures should never block the puzzle UI.
  }
}

function ChessComPuzzles() {
  const [puzzle, setPuzzle] = useState(() => readCachedPuzzle());
  const [loading, setLoading] = useState(() => !readCachedPuzzle());
  const [error, setError] = useState('');
  const [boardKey, setBoardKey] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const puzzleRef = useRef(puzzle);
  const fetchInFlightRef = useRef(false);

  puzzleRef.current = puzzle;

  const applyPuzzle = useCallback((data) => {
    setPuzzle(data);
    writeCachedPuzzle(data);
    setBoardKey((v) => v + 1);
    setShowAnswer(false);
    data?.persistPromise?.then((saved) => {
      if (!saved?.fen) return;
      setPuzzle((current) =>
        current && sameFen(current, saved)
          ? (() => {
              const merged = { ...current, ...saved, persistPromise: undefined };
              writeCachedPuzzle(merged);
              return merged;
            })()
          : current
      );
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchChessComRandomPuzzle();
        if (cancelled) return;
        if (!data?.fen) throw new Error('Puzzle response missing FEN.');
        applyPuzzle(data);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Failed to fetch Chess.com puzzle.');
        if (!puzzleRef.current) setPuzzle(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyPuzzle]);

  const fetchNewPuzzle = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    setLoading(true);
    setError('');
    const currentFen = String(puzzleRef.current?.fen || '').trim();
    try {
      for (let attempt = 0; attempt < FETCH_NEW_MAX_ATTEMPTS; attempt += 1) {
        const data = await fetchChessComRandomPuzzle();
        if (!data?.fen) throw new Error('Puzzle response missing FEN.');
        if (!currentFen || data.fen.trim() !== currentFen) {
          applyPuzzle(data);
          return;
        }
        await sleep(FETCH_NEW_RETRY_MS);
      }
      setError('Chess.com kept returning the same puzzle. Try again in a moment.');
    } catch (err) {
      setError(err.message || 'Failed to fetch Chess.com puzzle.');
      if (!puzzleRef.current) setPuzzle(null);
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  }, [applyPuzzle]);

  const solution = useMemo(
    () => solutionTextFromChessCom(puzzle?.solution || puzzle?.pgn),
    [puzzle?.solution, puzzle?.pgn]
  );
  const sideToMove = puzzle?.fen ? fenOrientation(puzzle.fen) : 'white';

  if (loading && !puzzle) {
    return (
      <div className="moral-puzzles-page">
        <PageBreadcrumb items={CHESSCOM_BREADCRUMB} />
        <p className="moral-puzzles-muted">Fetching random Chess.com puzzle…</p>
      </div>
    );
  }

  if (error && !puzzle) {
    return (
      <div className="moral-puzzles-page">
        <PageBreadcrumb items={CHESSCOM_BREADCRUMB} />
        <p className="moral-puzzles-error">{error}</p>
        <div className="moral-puzzles-add-row">
          <button
            type="button"
            className="moral-puzzles-btn moral-puzzles-btn--primary"
            onClick={fetchNewPuzzle}
          >
            <FiRefreshCw aria-hidden /> Fetch new
          </button>
        </div>
      </div>
    );
  }

  const dbLabel =
    puzzle?.id != null
      ? `#${puzzle.id}${puzzle.created ? ' · newly saved' : ' · already stored'}`
      : 'Not saved';
  const usageLabel =
    puzzle?.id != null ? (puzzle.is_used ? 'Used' : 'Unused') : null;

  return (
    <div className="moral-puzzles-page moral-puzzles-page--play moral-puzzles-page--triple">
      <div className="moral-puzzles-zone moral-puzzles-zone--story">
        <div className="moral-puzzles-left-inner">
          <PageBreadcrumb items={CHESSCOM_BREADCRUMB} />

          <h1 className="moral-play-title">{puzzle?.title || 'Chess.com Puzzle'}</h1>
          <p className="moral-play-sub">
            {sideToMove === 'black' ? 'Black' : 'White'} to move · Chess.com random puzzle
          </p>

          {error ? <p className="moral-puzzles-error">{error}</p> : null}

          <section className="moral-play-card">
            <p className="moral-play-card-label">Puzzle details</p>
            <p className="moral-play-card-body">
              {dbLabel}
              {usageLabel ? (
                <span className="moral-play-moral-code">{usageLabel}</span>
              ) : null}
            </p>
            <p className="moral-play-card-body">
              {sideToMove === 'black' ? 'Black' : 'White'} to move
            </p>
            <p className="moral-puzzles-fen">{puzzle?.fen}</p>
            {puzzle?.url ? (
              <a
                className="moral-puzzles-game-link"
                href={puzzle.url}
                target="_blank"
                rel="noreferrer"
              >
                Open on Chess.com <FiExternalLink aria-hidden />
              </a>
            ) : null}
          </section>

          <section className="moral-play-card moral-play-card--solution">
            <p className="moral-play-card-label">Puzzle Solution</p>
            {!showAnswer ? (
              <button
                type="button"
                className="moral-play-solution-btn"
                disabled={!solution}
                onClick={() => setShowAnswer(true)}
              >
                Show Solution
              </button>
            ) : solution ? (
              <p className="moral-play-solution-text">{solution}</p>
            ) : (
              <p className="moral-puzzles-muted">No solution available for this puzzle.</p>
            )}
          </section>

          <section className="moral-play-card">
            <p className="moral-play-card-label">Actions</p>
            <div className="moral-puzzles-add-row moral-play-add-row">
              <button
                type="button"
                className="moral-puzzles-btn moral-puzzles-btn--primary"
                onClick={fetchNewPuzzle}
                disabled={loading}
              >
                <FiRefreshCw aria-hidden />
                {loading ? 'Fetching…' : 'Fetch new'}
              </button>
            </div>
          </section>
        </div>
      </div>

      <div className="moral-puzzles-zone moral-puzzles-zone--board" aria-label="Board area">
        {puzzle?.fen ? (
          <ChroniclesPuzzleBoard
            initialFen={puzzle.fen}
            resetKey={boardKey}
            layout="moral-zone"
          />
        ) : null}
      </div>
    </div>
  );
}

export default ChessComPuzzles;
