import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingPanel from '../components/common/LoadingPanel';
import ErrorPanel from '../components/common/ErrorPanel';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
import ChroniclesPuzzleBoard from '../components/chronicles/ChroniclesPuzzleBoard';
import { fetchAllRatedPuzzles } from '../services/puzzleService';
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

function ChroniclesRatedPuzzlePage() {
  const { puzzleId } = useParams();
  const navigate = useNavigate();
  const [puzzle, setPuzzle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [moveHistory, setMoveHistory] = useState([]);
  const [boardResetKey, setBoardResetKey] = useState(0);

  const loadPuzzle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAllRatedPuzzles();
      const found = rows.find((row) => String(row.id) === String(puzzleId));
      if (!found) throw new Error('3000-rated puzzle not found.');
      setPuzzle(found);
      setBoardResetKey((value) => value + 1);
    } catch (err) {
      setError(err.message || 'Failed to load puzzle.');
    } finally {
      setLoading(false);
    }
  }, [puzzleId]);

  useEffect(() => {
    loadPuzzle();
  }, [loadPuzzle]);

  const historyLines = useMemo(() => formatMoveHistoryLines(moveHistory), [moveHistory]);

  if (loading) {
    return (
      <div className="chronicles-puzzle-page">
        <LoadingPanel message="Loading puzzle…" />
      </div>
    );
  }

  if (error || !puzzle) {
    return (
      <div className="chronicles-puzzle-page">
        <ErrorPanel title="Puzzle unavailable" message={error || 'Not found.'} onRetry={loadPuzzle} />
      </div>
    );
  }

  return (
    <div className="chronicles-puzzle-page">
      <header className="chronicles-puzzle-page-header">
        <PageBreadcrumb
          items={[
            { label: 'Modules', to: '/modules' },
            { label: 'Chronicles', to: '/chronicles?tab=puzzles&source=rated3000' },
            { label: '3000 rated puzzle' },
          ]}
        />
        <div>
          <h1 className="chronicles-puzzle-page-title">3000 rated puzzle</h1>
          <p className="chronicles-puzzle-page-subtitle">{puzzle.id}</p>
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
              <dt>Principle</dt>
              <dd>{puzzle.principleLabel}</dd>
            </div>
            <div>
              <dt>FEN</dt>
              <dd style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{puzzle.fen}</dd>
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
                      <td>{line.moveNumber}.</td>
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

export default ChroniclesRatedPuzzlePage;
