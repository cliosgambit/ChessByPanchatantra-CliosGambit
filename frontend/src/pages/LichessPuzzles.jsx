import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiShuffle, FiUpload, FiX } from 'react-icons/fi';
import FenHoverPreview from '../components/userProfile/FenHoverPreview';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
import {
  fetchLichessPuzzles,
  uploadLichessPuzzlesFile,
} from '../services/lichessPuzzleService';
import { resolveLichessPuzzlePosition } from '../utils/lichessPuzzleFen';
import './Puzzles.css';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const PREVIEW_ANIMATION_MS = 280;
const PREVIEW_HIDE_DELAY_MS = 120;

const USAGE_OPTIONS = [
  { value: 'all', label: 'Both' },
  { value: 'used', label: 'Used' },
  { value: 'unused', label: 'Unused' },
];

function LichessPuzzles() {
  const navigate = useNavigate();
  const [puzzles, setPuzzles] = useState([]);
  const [total, setTotal] = useState(0);
  const [usageCounts, setUsageCounts] = useState({ all: 0, used: 0, unused: 0 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [usageFilter, setUsageFilter] = useState('all');
  const [page, setPage] = useState(1);

  const hideTimer = useRef(null);
  const [previewMounted, setPreviewMounted] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [hoveredPuzzle, setHoveredPuzzle] = useState(null);
  const [previewPos, setPreviewPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, usageFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchLichessPuzzles({
        q: debouncedQuery,
        unused: usageFilter === 'unused',
        used: usageFilter === 'used',
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setPuzzles(data.puzzles || []);
      setTotal(Number(data.total) || 0);
      if (data.usage) {
        setUsageCounts({
          all: Number(data.usage.all) || 0,
          used: Number(data.usage.used) || 0,
          unused: Number(data.usage.unused) || 0,
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to load Lichess puzzles.');
      setPuzzles([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, usageFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const openPuzzle = useCallback(
    (puzzle) => {
      if (puzzle?.id == null) return;
      navigate(`/puzzles/lichess/${puzzle.id}`);
    },
    [navigate]
  );

  const handleViewRandom = async () => {
    setError('');
    try {
      const data = await fetchLichessPuzzles({
        q: debouncedQuery,
        unused: usageFilter === 'unused',
        used: usageFilter === 'used',
        random: true,
      });
      const pick = (data.puzzles || []).find((p) => p.fen);
      if (!pick) {
        setError('No puzzles with a FEN to view.');
        return;
      }
      openPuzzle(pick);
    } catch (err) {
      setError(err.message || 'Failed to pick a random puzzle.');
    }
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
      left = Math.max(12, rect.right - boardSize);
    }
    top = Math.min(window.innerHeight - boardSize / 2 - 12, Math.max(boardSize / 2 + 12, top));
    setPreviewPos({ top, left });
  }, []);

  const handleRowHover = useCallback(
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

  const hoverResolved = useMemo(() => {
    if (!hoveredPuzzle?.fen) return null;
    return resolveLichessPuzzlePosition(hoveredPuzzle.fen, hoveredPuzzle.moves);
  }, [hoveredPuzzle]);

  const hoverPreview =
    previewMounted && hoverResolved?.displayFen
      ? createPortal(
          <div
            className={`gm-fen-hover-preview${previewVisible ? ' is-visible' : ''}`}
            style={{ top: previewPos.top, left: previewPos.left }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            role="presentation"
          >
            <FenHoverPreview
              fen={hoverResolved.displayFen}
              orientation={hoverResolved.orientation}
              lastMove={hoverResolved.lastMove}
              boardId="lichess-puzzle-hover-board"
              boardSize={168}
            />
          </div>,
          document.body
        )
      : null;

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    setMessage('');
    try {
      const data = await uploadLichessPuzzlesFile(file);
      setMessage(
        `Uploaded: ${data.inserted || 0} new, ${data.updated || 0} updated` +
          (data.skipped ? `, ${data.skipped} skipped` : '') +
          `. Total: ${data.total ?? '—'}`
      );
      await load();
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="puzzles-page puzzles-page--wide gm-puzzles-page">
      <header className="puzzles-header gm-puzzles-header">
        <PageBreadcrumb
          items={[
            { label: 'Modules', to: '/modules' },
            { label: 'Puzzles', to: '/puzzles' },
            { label: 'Lichess Puzzles' },
          ]}
        />
        <div className="puzzles-header-row">
          <div className="gm-puzzles-heading">
            <span className="gm-puzzles-eyebrow">Puzzle library</span>
            <h1>Lichess Puzzles</h1>
            <p className="puzzles-muted">
              {loading
                ? 'Loading…'
                : `${total.toLocaleString()} result${total === 1 ? '' : 's'} · page ${page} of ${totalPages}`}
            </p>
          </div>
          <div className="gm-puzzles-summary" aria-label="Puzzle totals">
            <div>
              <strong>{usageCounts.all.toLocaleString()}</strong>
              <span>Total</span>
            </div>
            <div>
              <strong>{usageCounts.used.toLocaleString()}</strong>
              <span>Used</span>
            </div>
            <div>
              <strong>{usageCounts.unused.toLocaleString()}</strong>
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
                <span className="puzzles-usage-filter-count">
                  {usageCounts[opt.value].toLocaleString()}
                </span>
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
              placeholder="Search FEN, themes, rating, ID…"
              aria-label="Search Lichess puzzles"
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
            disabled={loading || total === 0}
          >
            <FiShuffle aria-hidden /> View random puzzle
          </button>
          <label
            className={`puzzles-action-btn${uploading ? ' is-disabled' : ''}`}
            style={uploading ? { pointerEvents: 'none', opacity: 0.55 } : undefined}
          >
            <FiUpload aria-hidden />
            {uploading ? 'Uploading…' : 'Upload Excel'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              hidden
              disabled={uploading}
              onChange={handleUpload}
            />
          </label>
        </div>
      </section>

      {error ? <p className="puzzles-error">{error}</p> : null}
      {message ? <p className="puzzles-muted" style={{ marginBottom: '0.85rem' }}>{message}</p> : null}

      {!loading && !error && total === 0 ? (
        <div className="puzzles-empty">
          {usageCounts.all === 0
            ? 'No Lichess puzzles yet. Upload an Excel sheet with columns: FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags.'
            : 'No puzzles match.'}
        </div>
      ) : null}

      {!loading && puzzles.length > 0 ? (
        <>
          <div className="puzzles-table-wrap gm-puzzles-table-wrap" onMouseLeave={scheduleHide}>
            <table className="puzzles-table">
              <thead>
                <tr>
                  <th className="gm-puzzles-number-column">#</th>
                  <th className="lichess-id-column">ID</th>
                  <th>FEN</th>
                  <th className="lichess-rating-column">Rating</th>
                  <th>Themes</th>
                  <th className="lichess-plays-column">Plays</th>
                  <th className="lichess-status-column">Status</th>
                </tr>
              </thead>
              <tbody>
                {puzzles.map((p, i) => (
                  <tr
                    key={p.id}
                    className="gm-puzzles-row--clickable"
                    onClick={() => {
                      if (p.fen) openPuzzle(p);
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && p.fen) {
                        e.preventDefault();
                        openPuzzle(p);
                      }
                    }}
                    onMouseEnter={(e) => handleRowHover(p, e.currentTarget)}
                    onMouseLeave={scheduleHide}
                    role="link"
                    tabIndex={p.fen ? 0 : -1}
                    aria-label={`View Lichess puzzle ${p.id}`}
                  >
                    <td className="gm-puzzles-row-number">
                      {(page - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="lichess-id-cell">{p.id}</td>
                    <td className="puzzles-fen">{p.fen || '—'}</td>
                    <td className="lichess-rating-cell">{p.rating ?? '—'}</td>
                    <td className="lichess-themes-cell">{p.themes || '—'}</td>
                    <td className="lichess-plays-cell">{p.nb_plays ?? '—'}</td>
                    <td>
                      <span
                        className={`lichess-usage-badge${
                          p.is_used ? ' lichess-usage-badge--used' : ' lichess-usage-badge--unused'
                        }`}
                      >
                        {p.is_used ? 'Used' : 'Unused'}
                      </span>
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
                {Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
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

export default LichessPuzzles;
