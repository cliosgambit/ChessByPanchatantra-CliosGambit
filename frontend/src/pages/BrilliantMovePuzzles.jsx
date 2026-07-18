import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiShuffle, FiX } from 'react-icons/fi';
import FenHoverPreview from '../components/userProfile/FenHoverPreview';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
import { fetchBrilliantPuzzlesFromDb } from '../services/chessComDbService';
import './Puzzles.css';

const PAGE_SIZE = 25;
const PREVIEW_ANIMATION_MS = 280;
const PREVIEW_HIDE_DELAY_MS = 120;

function fenOrientation(fen) {
  try {
    return String(fen || '').split(/\s+/)[1] === 'b' ? 'black' : 'white';
  } catch {
    return 'white';
  }
}

function pickRandom(items) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function BrilliantMovePuzzles() {
  const navigate = useNavigate();
  const [puzzles, setPuzzles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const hideTimer = useRef(null);
  const [previewMounted, setPreviewMounted] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [hoveredPuzzle, setHoveredPuzzle] = useState(null);
  const [previewPos, setPreviewPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchBrilliantPuzzlesFromDb({ limit: 5000 });
        if (!cancelled) setPuzzles(data.rows || []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load brilliant move puzzles.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return puzzles;
    return puzzles.filter((p) => {
      const hay = [
        p.id,
        p.stage4MoveId,
        p.solutionSan,
        p.playersLabel,
        p.chessComId,
        p.classification,
        p.sacType,
        p.puzzleFen,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [puzzles, query]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const openPuzzle = useCallback(
    (puzzle) => {
      if (puzzle?.id == null) return;
      navigate(`/puzzles/brilliant/${puzzle.id}`);
    },
    [navigate]
  );

  const handleViewRandom = () => {
    const pick = pickRandom(filtered.filter((p) => p.puzzleFen));
    if (pick) openPuzzle(pick);
  };

  const clearTimers = useCallback(() => {
    clearTimeout(hideTimer.current);
  }, []);

  const revealPreview = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPreviewVisible(true));
    });
  }, []);

  const handleRowHover = useCallback(
    (puzzle, rowEl) => {
      if (!puzzle?.puzzleFen) return;
      clearTimers();
      const rect = rowEl.getBoundingClientRect();
      setPreviewPos({
        top: rect.top + rect.height / 2,
        left: rect.right + 14,
      });
      setHoveredPuzzle(puzzle);
      setPreviewMounted(true);
      revealPreview();
    },
    [clearTimers, revealPreview]
  );

  const scheduleHide = useCallback(() => {
    clearTimers();
    hideTimer.current = setTimeout(() => {
      setPreviewVisible(false);
      hideTimer.current = setTimeout(() => {
        setPreviewMounted(false);
        setHoveredPuzzle(null);
      }, PREVIEW_ANIMATION_MS);
    }, PREVIEW_HIDE_DELAY_MS);
  }, [clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const hoverPreview =
    previewMounted && hoveredPuzzle?.puzzleFen
      ? createPortal(
          <div
            className={`gm-fen-hover-preview${previewVisible ? ' is-visible' : ''}`}
            style={{ top: previewPos.top, left: previewPos.left }}
            onMouseEnter={() => {
              clearTimers();
              setPreviewVisible(true);
            }}
            onMouseLeave={scheduleHide}
            role="presentation"
          >
            <FenHoverPreview
              fen={hoveredPuzzle.puzzleFen}
              uciMove={hoveredPuzzle.solutionUci}
              orientation={fenOrientation(hoveredPuzzle.puzzleFen)}
              boardId="brilliant-puzzle-hover-board"
            />
          </div>,
          document.body
        )
      : null;

  return (
    <div className="puzzles-page puzzles-page--wide gm-puzzles-page">
      <header className="puzzles-header gm-puzzles-header">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', to: '/dashboard' },
            { label: 'Puzzles', to: '/puzzles' },
            { label: 'Brilliant Move Puzzles' },
          ]}
        />
        <div className="puzzles-header-row">
          <div className="gm-puzzles-heading">
            <span className="gm-puzzles-eyebrow">Puzzle library</span>
            <h1>Brilliant Move Puzzles</h1>
            <p className="puzzles-muted">
              {loading
                ? 'Loading…'
                : `${filtered.length} saved puzzle${filtered.length === 1 ? '' : 's'} · page ${safePage} of ${totalPages}`}
            </p>
          </div>
          <div className="gm-puzzles-summary" aria-label="Puzzle totals">
            <div>
              <strong>{puzzles.length}</strong>
              <span>Saved</span>
            </div>
          </div>
        </div>
      </header>

      <section className="gm-puzzles-toolbar" aria-label="Puzzle controls">
        <div className="puzzles-header-actions" style={{ width: '100%' }}>
          <label className="gm-puzzles-search">
            <FiSearch aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by player, move, class, or ID"
              aria-label="Search brilliant move puzzles"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                <FiX aria-hidden />
              </button>
            ) : null}
          </label>
          <button
            type="button"
            className="puzzles-action-btn puzzles-action-btn--primary"
            onClick={handleViewRandom}
            disabled={loading || !filtered.some((p) => p.puzzleFen)}
          >
            <FiShuffle aria-hidden /> View random puzzle
          </button>
        </div>
      </section>

      {error ? <p className="puzzles-error">{error}</p> : null}

      {!loading && !error && filtered.length === 0 ? (
        <div className="puzzles-empty">
          No saved brilliant move puzzles yet. Approve and save a move from Brilliant Moves.
        </div>
      ) : null}

      {!loading && pageRows.length > 0 ? (
        <>
          <div className="puzzles-table-wrap gm-puzzles-table-wrap" onMouseLeave={scheduleHide}>
            <table className="puzzles-table">
              <thead>
                <tr>
                  <th className="gm-puzzles-number-column">#</th>
                  <th>Players</th>
                  <th>Move</th>
                  <th>Class</th>
                  <th>Score</th>
                  <th>Saved</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p, i) => (
                  <tr
                    key={p.id}
                    className="gm-puzzles-row--clickable"
                    onClick={() => openPuzzle(p)}
                    onMouseEnter={(e) => handleRowHover(p, e.currentTarget)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openPuzzle(p);
                      }
                    }}
                    role="link"
                    tabIndex={0}
                    aria-label={`View brilliant puzzle ${p.id}`}
                  >
                    <td className="gm-puzzles-number-column">
                      {(safePage - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td>{p.playersLabel || p.chessComId || '—'}</td>
                    <td>
                      <strong>{p.solutionSan || '—'}</strong>
                    </td>
                    <td>{p.classification || '—'}</td>
                    <td>
                      {p.brillianceScore != null ? p.brillianceScore.toFixed(2) : '—'}
                    </td>
                    <td>{p.savedDate || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="puzzles-pagination">
              <button
                type="button"
                className="puzzles-action-btn"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                className="puzzles-action-btn"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {hoverPreview}
    </div>
  );
}

export default BrilliantMovePuzzles;
