import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiChevronLeft, FiChevronRight, FiExternalLink, FiShuffle } from 'react-icons/fi';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ChroniclesPuzzleBoard from '../components/chronicles/ChroniclesPuzzleBoard';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
import {
  fetchBrilliantPuzzleFromDb,
  fetchBrilliantPuzzlesFromDb,
} from '../services/chessComDbService';
import './LibraryMoralPuzzles.css';

function formatScore(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(value).toFixed(2);
}

function ViewPuzzle() {
  const navigate = useNavigate();
  const location = useLocation();
  const { puzzleId } = useParams();
  const isBrilliantPath = location.pathname.includes('/puzzles/brilliant');
  const listPath = isBrilliantPath ? '/puzzles/brilliant' : '/puzzles/chesscom';
  const listLabel = isBrilliantPath ? 'Brilliant Move Puzzles' : 'Chess.com Puzzles';

  const breadcrumbBase = useMemo(
    () => [
      { label: 'Modules', to: '/modules' },
      { label: 'Puzzles', to: '/puzzles' },
      { label: listLabel, to: listPath },
    ],
    [listLabel, listPath]
  );

  const [puzzle, setPuzzle] = useState(null);
  const [puzzleList, setPuzzleList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [boardKey, setBoardKey] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadPuzzleList() {
      try {
        const data = await fetchBrilliantPuzzlesFromDb({ limit: 5000 });
        if (!cancelled) setPuzzleList(data.rows || []);
      } catch {
        if (!cancelled) setPuzzleList([]);
      }
    }
    loadPuzzleList();
    return () => {
      cancelled = true;
    };
  }, []);

  const puzzleNav = useMemo(() => {
    const currentIndex = puzzleList.findIndex((row) => String(row.id) === String(puzzleId));
    if (currentIndex < 0) {
      return { prevId: null, nextId: null, positionLabel: null, randomId: null };
    }
    const withFen = puzzleList.filter((p) => p.puzzleFen && String(p.id) !== String(puzzleId));
    const randomPick = withFen.length
      ? withFen[Math.floor(Math.random() * withFen.length)]
      : null;
    return {
      prevId: currentIndex > 0 ? puzzleList[currentIndex - 1].id : null,
      nextId: currentIndex < puzzleList.length - 1 ? puzzleList[currentIndex + 1].id : null,
      positionLabel: `${currentIndex + 1} / ${puzzleList.length}`,
      randomId: randomPick?.id ?? null,
    };
  }, [puzzleList, puzzleId]);

  const goToPuzzle = useCallback(
    (id) => {
      if (id != null) navigate(`${listPath}/${id}`);
    },
    [listPath, navigate]
  );

  useEffect(() => {
    let cancelled = false;
    setShowAnswer(false);

    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await fetchBrilliantPuzzleFromDb(puzzleId);
        if (cancelled) return;
        if (!data?.puzzleFen) throw new Error('Puzzle not found or missing FEN.');
        setPuzzle(data);
        setBoardKey((v) => v + 1);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load puzzle.');
          setPuzzle(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [puzzleId]);

  if (loading) {
    return (
      <div className="moral-puzzles-page">
        <PageBreadcrumb items={[...breadcrumbBase, { label: 'Puzzle' }]} />
        <p className="moral-puzzles-muted">Loading…</p>
      </div>
    );
  }

  if (error || !puzzle) {
    return (
      <div className="moral-puzzles-page">
        <PageBreadcrumb items={[...breadcrumbBase, { label: 'Puzzle' }]} />
        <p className="moral-puzzles-error">{error || 'Puzzle not found.'}</p>
      </div>
    );
  }

  const solutionLabel = [puzzle.solutionSan, puzzle.solutionUci].filter(Boolean).join(' · ') || '—';
  const subtitle = [
    puzzle.classification,
    puzzle.brillianceScore != null ? `Score ${formatScore(puzzle.brillianceScore)}` : null,
    puzzle.playedDate && puzzle.playedDate !== '—' ? puzzle.playedDate : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const sideToMove =
    String(puzzle.puzzleFen || '').split(/\s+/)[1] === 'b' ? 'Black' : 'White';

  return (
    <div className="moral-puzzles-page moral-puzzles-page--play moral-puzzles-page--triple">
      <div className="moral-puzzles-zone moral-puzzles-zone--story">
        <div className="moral-puzzles-left-inner">
          <PageBreadcrumb
            items={[...breadcrumbBase, { label: `Puzzle #${puzzle.id}` }]}
          />

          <h1 className="moral-play-title">Brilliant Puzzle #{puzzle.id}</h1>
          <p className="moral-play-sub">{subtitle || 'Play this position'}</p>

          <section className="moral-play-card">
            <p className="moral-play-card-label">Game</p>
            <p className="moral-play-card-body">{puzzle.playersLabel || '—'}</p>
            <p className="moral-puzzles-muted">
              {[puzzle.timeControl, puzzle.playedDate].filter(Boolean).join(' · ') || '—'}
            </p>
            {puzzle.gameUrl ? (
              <a
                className="moral-puzzles-game-link"
                href={puzzle.gameUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open on Chess.com <FiExternalLink aria-hidden />
              </a>
            ) : null}
          </section>

          <section className="moral-play-card">
            <p className="moral-play-card-label">Puzzle details</p>
            <p className="moral-play-card-body">
              ID {puzzle.id}
              {puzzle.classification ? (
                <span className="moral-play-moral-code">{puzzle.classification}</span>
              ) : null}
            </p>
            <p className="moral-play-card-body">
              {sideToMove} to move
              {puzzle.sacType ? (
                <span className="moral-play-moral-code">{puzzle.sacType}</span>
              ) : null}
            </p>
            {puzzle.brillianceScore != null ? (
              <p className="moral-play-card-body">
                Score {formatScore(puzzle.brillianceScore)}
              </p>
            ) : null}
            <p className="moral-puzzles-fen">{puzzle.puzzleFen}</p>
          </section>

          <section className="moral-play-card moral-play-card--solution">
            <p className="moral-play-card-label">Puzzle Solution</p>
            {!showAnswer ? (
              <button
                type="button"
                className="moral-play-solution-btn"
                onClick={() => setShowAnswer(true)}
              >
                Show Solution
              </button>
            ) : (
              <p className="moral-play-solution-text">{solutionLabel}</p>
            )}
          </section>

          <section className="moral-play-card">
            <p className="moral-play-card-label">Actions</p>
            <div className="moral-puzzles-add-row moral-play-add-row">
              <button
                type="button"
                className="moral-puzzles-btn"
                onClick={() => goToPuzzle(puzzleNav.prevId)}
                disabled={puzzleNav.prevId == null}
              >
                <FiChevronLeft aria-hidden /> Previous
              </button>
              <button
                type="button"
                className="moral-puzzles-btn"
                onClick={() => goToPuzzle(puzzleNav.nextId)}
                disabled={puzzleNav.nextId == null}
              >
                Next <FiChevronRight aria-hidden />
              </button>
              <button
                type="button"
                className="moral-puzzles-btn moral-puzzles-btn--primary"
                onClick={() => goToPuzzle(puzzleNav.randomId)}
                disabled={puzzleNav.randomId == null}
              >
                <FiShuffle aria-hidden /> Another random
              </button>
            </div>
            {puzzleNav.positionLabel ? (
              <p className="moral-puzzles-muted">{puzzleNav.positionLabel}</p>
            ) : null}
          </section>
        </div>
      </div>

      <div className="moral-puzzles-zone moral-puzzles-zone--board" aria-label="Board area">
        <ChroniclesPuzzleBoard
          initialFen={puzzle.puzzleFen}
          resetKey={boardKey}
          layout="moral-zone"
        />
      </div>
    </div>
  );
}

export default ViewPuzzle;
