import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiExternalLink, FiShuffle } from 'react-icons/fi';
import ChroniclesPuzzleBoard from '../components/chronicles/ChroniclesPuzzleBoard';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
import { fetchLichessPuzzle, fetchLichessPuzzles } from '../services/lichessPuzzleService';
import { resolveLichessPuzzlePosition } from '../utils/lichessPuzzleFen';
import './LibraryMoralPuzzles.css';

const LICHESS_BREADCRUMB = [
  { label: 'Modules', to: '/modules' },
  { label: 'Puzzles', to: '/puzzles' },
  { label: 'Lichess Puzzles', to: '/puzzles/lichess' },
];

function LichessPuzzleView() {
  const { puzzleId } = useParams();
  const navigate = useNavigate();
  const [puzzle, setPuzzle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [boardKey, setBoardKey] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const loadPuzzle = useCallback(async () => {
    setLoading(true);
    setError('');
    setShowAnswer(false);
    try {
      const data = await fetchLichessPuzzle(puzzleId);
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

  const resolved = useMemo(
    () => (puzzle ? resolveLichessPuzzlePosition(puzzle.fen, puzzle.moves) : null),
    [puzzle]
  );

  const handleAnotherRandom = async () => {
    try {
      const data = await fetchLichessPuzzles({ random: true });
      const pick = (data.puzzles || []).find(
        (p) => p.fen && String(p.id) !== String(puzzleId)
      );
      if (!pick) {
        const retry = await fetchLichessPuzzles({ random: true });
        const next = (retry.puzzles || []).find((p) => p.fen);
        if (!next || String(next.id) === String(puzzleId)) {
          setError('No other puzzles available.');
          return;
        }
        navigate(`/puzzles/lichess/${next.id}`);
        return;
      }
      navigate(`/puzzles/lichess/${pick.id}`);
    } catch (err) {
      setError(err.message || 'Failed to pick a random puzzle.');
    }
  };

  if (loading) {
    return (
      <div className="moral-puzzles-page">
        <PageBreadcrumb items={[...LICHESS_BREADCRUMB, { label: 'Puzzle' }]} />
        <p className="moral-puzzles-muted">Loading…</p>
      </div>
    );
  }

  if (error || !puzzle || !resolved?.playFen) {
    return (
      <div className="moral-puzzles-page">
        <PageBreadcrumb items={[...LICHESS_BREADCRUMB, { label: 'Puzzle' }]} />
        <p className="moral-puzzles-error">{error || 'Puzzle not found.'}</p>
      </div>
    );
  }

  const answerLabel =
    resolved.solutionSans.length > 0
      ? resolved.solutionSans.join(' ')
      : resolved.solutionUcis.join(' ') || '—';
  const isUsed = Boolean(puzzle.is_used);
  const subtitle =
    [puzzle.rating != null ? `Rating ${puzzle.rating}` : null, puzzle.themes]
      .filter(Boolean)
      .join(' · ') || 'Play this position';

  return (
    <div className="moral-puzzles-page moral-puzzles-page--play moral-puzzles-page--triple">
      <div className="moral-puzzles-zone moral-puzzles-zone--story">
        <div className="moral-puzzles-left-inner">
          <PageBreadcrumb
            items={[...LICHESS_BREADCRUMB, { label: `Puzzle #${puzzle.id}` }]}
          />

          <h1 className="moral-play-title">Lichess Puzzle #{puzzle.id}</h1>
          <p className="moral-play-sub">{subtitle}</p>

          {error ? <p className="moral-puzzles-error">{error}</p> : null}

          <section className="moral-play-card">
            <p className="moral-play-card-label">Puzzle details</p>
            <p className="moral-play-card-body">
              ID {puzzle.id}
              <span className="moral-play-moral-code">{isUsed ? 'Used' : 'Unused'}</span>
            </p>
            {puzzle.rating != null ? (
              <p className="moral-play-card-body">
                Rating {puzzle.rating}
                {puzzle.nb_plays != null ? (
                  <span className="moral-play-moral-code">{puzzle.nb_plays} plays</span>
                ) : null}
              </p>
            ) : null}
            {puzzle.themes ? <p className="moral-puzzles-muted">{puzzle.themes}</p> : null}
            {puzzle.opening_tags ? (
              <p className="moral-puzzles-muted">Opening: {puzzle.opening_tags}</p>
            ) : null}
            <p className="moral-puzzles-fen">{resolved.playFen}</p>
            {puzzle.game_url ? (
              <a
                className="moral-puzzles-game-link"
                href={puzzle.game_url}
                target="_blank"
                rel="noreferrer"
              >
                Open on Lichess <FiExternalLink aria-hidden />
              </a>
            ) : null}
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
              <p className="moral-play-solution-text">{answerLabel}</p>
            )}
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
          initialFen={resolved.playFen}
          resetKey={boardKey}
          layout="moral-zone"
        />
      </div>
    </div>
  );
}

export default LichessPuzzleView;
