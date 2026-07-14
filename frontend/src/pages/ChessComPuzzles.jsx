import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiExternalLink, FiEye, FiEyeOff, FiRefreshCw } from 'react-icons/fi';
import ChroniclesPuzzleBoard from '../components/chronicles/ChroniclesPuzzleBoard';
import { fetchChessComRandomPuzzle } from '../services/chessComDbService';
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

/** Strip PGN headers / result → solution move text. */
function solutionFromPgn(pgn) {
  if (!pgn) return '';
  return String(pgn)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\r/g, '')
    .replace(/\s*(?:\*|1-0|0-1|1\/2-1\/2)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fenOrientation(fen) {
  try {
    return String(fen || '').split(/\s+/)[1] === 'b' ? 'black' : 'white';
  } catch {
    return 'white';
  }
}

function ChessComPuzzles() {
  const navigate = useNavigate();
  const [puzzle, setPuzzle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moveHistory, setMoveHistory] = useState([]);
  const [boardResetKey, setBoardResetKey] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const loadPuzzle = useCallback(async () => {
    setLoading(true);
    setError('');
    setMoveHistory([]);
    setShowAnswer(false);
    try {
      const data = await fetchChessComRandomPuzzle();
      if (!data?.fen) throw new Error('Puzzle response missing FEN.');
      setPuzzle(data);
      setBoardResetKey((v) => v + 1);
    } catch (err) {
      setError(err.message || 'Failed to fetch Chess.com puzzle.');
      setPuzzle(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPuzzle();
  }, [loadPuzzle]);

  const historyLines = useMemo(() => formatMoveHistoryLines(moveHistory), [moveHistory]);
  const solution = useMemo(() => solutionFromPgn(puzzle?.pgn), [puzzle?.pgn]);
  const sideToMove = puzzle?.fen ? fenOrientation(puzzle.fen) : 'white';

  if (loading && !puzzle) {
    return (
      <div className="puzzles-page">
        <button type="button" className="puzzles-back" onClick={() => navigate('/puzzles')}>
          <FiArrowLeft aria-hidden /> Puzzles
        </button>
        <p className="puzzles-muted">Fetching random Chess.com puzzle…</p>
      </div>
    );
  }

  if (error && !puzzle) {
    return (
      <div className="puzzles-page">
        <button type="button" className="puzzles-back" onClick={() => navigate('/puzzles')}>
          <FiArrowLeft aria-hidden /> Puzzles
        </button>
        <p className="puzzles-error">{error}</p>
        <button
          type="button"
          className="puzzles-action-btn puzzles-action-btn--primary"
          onClick={loadPuzzle}
        >
          <FiRefreshCw aria-hidden /> Fetch new
        </button>
      </div>
    );
  }

  return (
    <div className="chronicles-puzzle-page">
      <header className="chronicles-puzzle-page-header">
        <button
          type="button"
          className="chronicles-back-btn"
          onClick={() => navigate('/puzzles')}
        >
          <FiArrowLeft aria-hidden />
          Back to Puzzles
        </button>
        <div className="gm-puzzle-view-title-row">
          <div>
            <h1 className="chronicles-puzzle-page-title">
              {puzzle?.title || 'Chess.com random puzzle'}
            </h1>
            <p className="chronicles-puzzle-page-subtitle">
              {sideToMove === 'black' ? 'Black' : 'White'} to move · from{' '}
              <a href="https://api.chess.com/pub/puzzle/random" target="_blank" rel="noreferrer">
                Chess.com API
              </a>
            </p>
          </div>
          <div className="puzzles-header-actions">
            <button
              type="button"
              className="puzzles-action-btn"
              onClick={() => setShowAnswer((v) => !v)}
              disabled={!solution}
            >
              {showAnswer ? <FiEyeOff aria-hidden /> : <FiEye aria-hidden />}
              {showAnswer ? 'Hide answer' : 'Show answer'}
            </button>
            <button
              type="button"
              className="puzzles-action-btn puzzles-action-btn--primary"
              onClick={loadPuzzle}
              disabled={loading}
            >
              <FiRefreshCw aria-hidden />
              {loading ? 'Fetching…' : 'Fetch new'}
            </button>
          </div>
        </div>
      </header>

      {error ? <p className="puzzles-error">{error}</p> : null}

      <div className="chronicles-puzzle-workspace">
        <aside className="chronicles-puzzle-meta">
          <h2 className="chronicles-puzzle-meta-title">Puzzle details</h2>
          <dl className="chronicles-puzzle-meta-list">
            <div>
              <dt>DB</dt>
              <dd>
                {puzzle?.id != null
                  ? `#${puzzle.id}${puzzle.created ? ' · newly saved' : ' · already stored'}`
                  : 'Not saved'}
                {puzzle?.is_used ? ' · used' : puzzle?.id != null ? ' · unused' : ''}
              </dd>
            </div>
            <div>
              <dt>Title</dt>
              <dd>{puzzle?.title || '—'}</dd>
            </div>
            <div>
              <dt>Side to move</dt>
              <dd>{sideToMove === 'black' ? 'Black' : 'White'}</dd>
            </div>
            {showAnswer && solution ? (
              <div>
                <dt>Solution</dt>
                <dd style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{solution}</dd>
              </div>
            ) : null}
            {puzzle?.url ? (
              <div>
                <dt>Source</dt>
                <dd>
                  <a href={puzzle.url} target="_blank" rel="noreferrer">
                    Open on Chess.com <FiExternalLink aria-hidden style={{ display: 'inline' }} />
                  </a>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>FEN</dt>
              <dd style={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                {puzzle?.fen}
              </dd>
            </div>
          </dl>
        </aside>

        <div className="chronicles-puzzle-center">
          {puzzle?.fen ? (
            <ChroniclesPuzzleBoard
              initialFen={puzzle.fen}
              onMoveHistoryChange={setMoveHistory}
              resetKey={boardResetKey}
            />
          ) : null}
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

export default ChessComPuzzles;
