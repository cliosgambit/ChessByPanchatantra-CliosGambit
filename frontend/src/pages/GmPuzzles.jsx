import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiShuffle, FiX } from 'react-icons/fi';
import FenHoverPreview from '../components/userProfile/FenHoverPreview';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
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

const USAGE_OPTIONS = [
  { value: 'all', label: 'Both' },
  { value: 'used', label: 'Used' },
  { value: 'unused', label: 'Unused' },
];

function GmPuzzles() {
  const navigate = useNavigate();
  const [puzzles, setPuzzles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [usageFilter, setUsageFilter] = useState('all');
  const [page, setPage] = useState(1);

  const hideTimer = useRef(null);
  const [previewMounted, setPreviewMounted] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [hoveredPuzzle, setHoveredPuzzle] = useState(null);
  const [previewPos, setPreviewPos] = useState({ top: 0, left: 0 });

  const showMorals = usageFilter !== 'unused';
  const usageCounts = useMemo(
    () => ({
      all: puzzles.length,
      used: puzzles.filter(
        (p) => Boolean(p.is_used) && (p.moral_code || p.moral_name || p.moral_id)
      ).length,
      unused: puzzles.filter((p) => !p.is_used).length,
    }),
    [puzzles]
  );

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
    let rows = puzzles;
    if (usageFilter === 'used') {
      rows = rows.filter((p) => Boolean(p.is_used) && (p.moral_code || p.moral_name || p.moral_id));
    } else if (usageFilter === 'unused') {
      rows = rows.filter((p) => !p.is_used);
    }

    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) => {
      const moralLabel = showMorals
        ? [p.moral_code, p.moral_name].filter(Boolean).join(' ')
        : '';
      const hay = [moralLabel, p.fen, String(p.id)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [puzzles, query, usageFilter, showMorals]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [query, usageFilter]);

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

  const updatePreviewPosition = useCallback((rowEl) => {
    if (!rowEl) return;
    const rowRect = rowEl.getBoundingClientRect();
    setPreviewPos({
      top: rowRect.top + rowRect.height / 2,
      left: rowRect.right + 14,
    });
  }, []);

  const handleRowHover = useCallback(
    (puzzle, rowEl) => {
      if (!puzzle?.fen) return;
      clearTimers();
      updatePreviewPosition(rowEl);
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
            { label: 'Modules', to: '/modules' },
            { label: 'Puzzles', to: '/puzzles' },
            { label: 'GM Puzzles' },
          ]}
        />
        <div className="puzzles-header-row">
          <div className="gm-puzzles-heading">
            <span className="gm-puzzles-eyebrow">Puzzle library</span>
            <h1>GM Puzzles</h1>
            <p className="puzzles-muted">
              {loading
                ? 'Loading…'
                : `${filtered.length} result${filtered.length === 1 ? '' : 's'} · page ${page} of ${totalPages}`}
            </p>
          </div>
          <div className="gm-puzzles-summary" aria-label="Puzzle totals">
            <div>
              <strong>{usageCounts.all}</strong>
              <span>Total</span>
            </div>
            <div>
              <strong>{usageCounts.used}</strong>
              <span>Used</span>
            </div>
            <div>
              <strong>{usageCounts.unused}</strong>
              <span>Unused</span>
            </div>
          </div>
        </div>
      </header>

      <section className="gm-puzzles-toolbar" aria-label="Puzzle controls">
        <div className="gm-puzzles-filter-block">
          <span className="gm-puzzles-control-label">Show puzzles</span>
          <div className="puzzles-usage-filter" role="group" aria-label="Usage filter">
            {USAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`puzzles-usage-filter-btn${
                  usageFilter === opt.value ? ' is-active' : ''
                }`}
                aria-pressed={usageFilter === opt.value}
                onClick={() => setUsageFilter(opt.value)}
              >
                <span>{opt.label}</span>
                <span className="puzzles-usage-filter-count">{usageCounts[opt.value]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="puzzles-header-actions">
          <label className="gm-puzzles-search">
            <FiSearch aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={showMorals ? 'Search by moral, FEN or ID' : 'Search by FEN or ID'}
              aria-label="Search GM puzzles"
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
              disabled={loading || !filtered.some((p) => p.fen)}
            >
              <FiShuffle aria-hidden /> View random puzzle
            </button>
        </div>
      </section>

      {error ? <p className="puzzles-error">{error}</p> : null}

      {!loading && !error && filtered.length === 0 ? (
        <div className="puzzles-empty">No puzzles match.</div>
      ) : null}

      {!loading && pageRows.length > 0 ? (
        <>
          <div className="puzzles-table-wrap gm-puzzles-table-wrap" onMouseLeave={scheduleHide}>
            <table className="puzzles-table">
              <thead>
                <tr>
                  <th className="gm-puzzles-number-column">#</th>
                  {showMorals ? <th>Moral</th> : null}
                  <th>FEN</th>
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
                    aria-label={`View puzzle ${p.id}`}
                  >
                    <td className="gm-puzzles-row-number">{(page - 1) * PAGE_SIZE + i + 1}</td>
                    {showMorals ? (
                      <td className="gm-puzzles-moral">
                        {p.moral_code || p.moral_name
                          ? [p.moral_code, p.moral_name].filter(Boolean).join(' — ')
                          : '—'}
                      </td>
                    ) : null}
                    <td className="puzzles-fen">{p.fen || '—'}</td>
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
