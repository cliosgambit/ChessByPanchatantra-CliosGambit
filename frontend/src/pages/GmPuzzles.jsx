import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiEye, FiShuffle } from 'react-icons/fi';
import FenHoverPreview from '../components/userProfile/FenHoverPreview';
import { fetchGmPuzzles } from '../services/gmPuzzleService';
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

function GmPuzzles() {
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
        const data = await fetchGmPuzzles();
        if (!cancelled) setPuzzles(data.puzzles || []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load GM puzzles.');
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
      const moralLabel = [p.moral_code, p.moral_name].filter(Boolean).join(' ');
      const hay = [moralLabel, p.fen, String(p.id)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [puzzles, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const openPuzzle = useCallback(
    (puzzle) => {
      if (puzzle?.id == null) return;
      navigate(`/puzzles/gm/${puzzle.id}`);
    },
    [navigate]
  );

  const handleViewRandom = () => {
    const withFen = filtered.filter((p) => p.fen);
    const pick = pickRandom(withFen);
    if (!pick) {
      setError('No puzzles with a FEN to view.');
      return;
    }
    openPuzzle(pick);
  };

  const clearTimers = useCallback(() => {
    clearTimeout(hideTimer.current);
  }, []);

  const revealPreview = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPreviewVisible(true));
    });
  }, []);

  const updatePreviewPosition = useCallback((el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const boardSize = 168;
    const gap = 14;
    let left = rect.right + gap;
    let top = rect.top + rect.height / 2;
    if (left + boardSize + 24 > window.innerWidth) {
      left = Math.max(12, rect.left - boardSize - gap);
    }
    top = Math.min(window.innerHeight - boardSize / 2 - 12, Math.max(boardSize / 2 + 12, top));
    setPreviewPos({ top, left });
  }, []);

  const handleFenHover = useCallback(
    (puzzle, el) => {
      if (!puzzle?.fen) return;
      clearTimers();
      updatePreviewPosition(el);
      setHoveredPuzzle(puzzle);
      setPreviewMounted(true);
      revealPreview();
    },
    [clearTimers, updatePreviewPosition, revealPreview]
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

  const cancelHide = useCallback(() => {
    clearTimers();
    if (hoveredPuzzle) setPreviewVisible(true);
  }, [clearTimers, hoveredPuzzle]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const hoverPreview =
    previewMounted && hoveredPuzzle?.fen
      ? createPortal(
          <div
            className={`gm-fen-hover-preview${previewVisible ? ' is-visible' : ''}`}
            style={{ top: previewPos.top, left: previewPos.left }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            role="presentation"
          >
            <FenHoverPreview
              fen={hoveredPuzzle.fen}
              orientation={fenOrientation(hoveredPuzzle.fen)}
              boardId="gm-puzzle-hover-board"
              boardSize={168}
            />
          </div>,
          document.body
        )
      : null;

  return (
    <div className="puzzles-page puzzles-page--wide">
      <header className="puzzles-header">
        <button type="button" className="puzzles-back" onClick={() => navigate('/puzzles')}>
          <FiArrowLeft aria-hidden /> Puzzles
        </button>
        <div className="puzzles-header-row">
          <div>
            <h1>GM Puzzles</h1>
            <p className="puzzles-muted">
              {loading
                ? 'Loading…'
                : `${filtered.length} of ${puzzles.length} puzzles · page ${page}/${totalPages}`}
            </p>
          </div>
          <div className="puzzles-header-actions">
            <button
              type="button"
              className="puzzles-action-btn puzzles-action-btn--primary"
              onClick={handleViewRandom}
              disabled={loading || !filtered.some((p) => p.fen)}
            >
              <FiShuffle aria-hidden /> View random puzzle
            </button>
            <input
              className="puzzles-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search moral, FEN…"
            />
          </div>
        </div>
      </header>

      {error ? <p className="puzzles-error">{error}</p> : null}

      {!loading && !error && filtered.length === 0 ? (
        <div className="puzzles-empty">No puzzles match.</div>
      ) : null}

      {!loading && pageRows.length > 0 ? (
        <>
          <div className="puzzles-table-wrap" onMouseLeave={scheduleHide}>
            <table className="puzzles-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Moral</th>
                  <th>FEN</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p, i) => (
                  <tr key={p.id}>
                    <td>{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td>
                      {p.moral_code || p.moral_name
                        ? [p.moral_code, p.moral_name].filter(Boolean).join(' — ')
                        : '—'}
                    </td>
                    <td
                      className="puzzles-fen puzzles-fen--hoverable"
                      onMouseEnter={(e) => handleFenHover(p, e.currentTarget)}
                      onMouseLeave={scheduleHide}
                    >
                      {p.fen || '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="puzzles-action-btn"
                        onClick={() => openPuzzle(p)}
                        disabled={!p.fen}
                      >
                        <FiEye aria-hidden /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="puzzles-pagination">
              <span className="puzzles-muted">
                Showing {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="puzzles-pagination-btns">
                <button
                  type="button"
                  className="puzzles-action-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="puzzles-action-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {hoverPreview}
    </div>
  );
}

export default GmPuzzles;
