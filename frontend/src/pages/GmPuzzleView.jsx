import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiShuffle } from 'react-icons/fi';
import ChroniclesPuzzleBoard from '../components/chronicles/ChroniclesPuzzleBoard';
import { fetchGmPuzzle, fetchGmPuzzles } from '../services/gmPuzzleService';
import './Puzzles.css';
import './ChroniclesChessPuzzlePage.css';

function formatMoveHistoryLines(moves) {
  const lines = [];
  for (let index = 0; index < moves.length; index += 2) {
    const moveNumber = Math.floor(index / 2) + 1;
    lines.push({
      moveNumber,
      white: moves[index] || '',
      black: moves[index + 1] || '',
    });
  }
  return lines;
}

function GmPuzzleView() {
  const { puzzleId } = useParams();
  const navigate = useNavigate();
  const [puzzle, setPuzzle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moveHistory, setMoveHistory] = useState([]);
  const [boardResetKey, setBoardResetKey] = useState(0);

  const loadPuzzle = useCallback(async () => {
    setLoading(true);
    setError('');
    setMoveHistory([]);
    try {
      const data = await fetchGmPuzzle(puzzleId);
      const next = data?.puzzle;
      if (!next?.fen) throw new Error('Puzzle not found or missing FEN.');
      setPuzzle(next);
      setBoardResetKey((v) => v + 1);
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

  const historyLines = useMemo(() => formatMoveHistoryLines(moveHistory), [moveHistory]);

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
      <div className="puzzles-page">
        <p className="puzzles-muted">Loading puzzle…</p>
      </div>
    );
  }

  if (error || !puzzle) {
    return (
      <div className="puzzles-page">
        <p className="puzzles-error">{error || 'Puzzle not found.'}</p>
        <button type="button" className="puzzles-back" onClick={() => navigate('/puzzles/gm')}>
          <FiArrowLeft aria-hidden /> Back to GM Puzzles
        </button>
      </div>
    );
  }

  const moralLabel = [puzzle.moral_code, puzzle.moral_name].filter(Boolean).join(' — ') || '—';

  return (
    <div className="chronicles-puzzle-page">
      <header className="chronicles-puzzle-page-header">
        <button
          type="button"
          className="chronicles-back-btn"
          onClick={() => navigate('/puzzles/gm')}
        >
          <FiArrowLeft aria-hidden />
          Back to GM Puzzles
        </button>
        <div className="gm-puzzle-view-title-row">
          <div>
            <h1 className="chronicles-puzzle-page-title">GM Puzzle #{puzzle.id}</h1>
            <p className="chronicles-puzzle-page-subtitle">{moralLabel}</p>
          </div>
          <button type="button" className="puzzles-action-btn puzzles-action-btn--primary" onClick={handleAnotherRandom}>
            <FiShuffle aria-hidden /> Another random
          </button>
        </div>
      </header>

      <div className="chronicles-puzzle-workspace">
        <aside className="chronicles-puzzle-meta">
          <h2 className="chronicles-puzzle-meta-title">Puzzle details</h2>
          <dl className="chronicles-puzzle-meta-list">
            <div>
              <dt>ID</dt>
              <dd>{puzzle.id}</dd>
            </div>
            <div>
              <dt>Moral</dt>
              <dd>{moralLabel}</dd>
            </div>
            <div>
              <dt>FEN</dt>
              <dd style={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                {puzzle.fen}
              </dd>
            </div>
          </dl>
        </aside>

        <div className="chronicles-puzzle-center">
          <ChroniclesPuzzleBoard
            initialFen={puzzle.fen}
            onMoveHistoryChange={setMoveHistory}
            resetKey={boardResetKey}
          />
        </div>

        <aside className="chronicles-puzzle-history">
          <h2 className="chronicles-puzzle-history-title">Move history</h2>
          <div className="chronicles-puzzle-history-scroll">
            {historyLines.length === 0 ? (
              <p className="chronicles-puzzle-history-empty">Play a move on the board to begin.</p>
            ) : (
              <table className="chronicles-puzzle-history-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>White</th>
                    <th>Black</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLines.map((line) => (
                    <tr key={line.moveNumber}>
                      <td>{line.moveNumber}</td>
                      <td>{line.white}</td>
                      <td>{line.black}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default GmPuzzleView;
