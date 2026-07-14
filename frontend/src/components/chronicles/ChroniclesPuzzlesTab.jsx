import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDisclosure, useToast } from '@chakra-ui/react';
import { FiEye, FiPlus, FiSearch, FiShuffle } from 'react-icons/fi';
import LoadingPanel from '../common/LoadingPanel';
import ErrorPanel from '../common/ErrorPanel';
import EmptyState from '../common/EmptyState';
import ChroniclesAddPuzzleModal from './ChroniclesAddPuzzleModal';
import { fetchBrilliantPuzzlesFromDb } from '../../services/chessComDbService';
import {
  createPuzzle,
  fetchAllPuzzlesWithUsage,
  fetchAllRatedPuzzles,
} from '../../services/puzzleService';

const PUZZLE_SOURCES = [
  { key: 'chess', label: 'Chess puzzles' },
  { key: 'brilliant', label: 'Brilliant puzzles' },
  { key: 'rated3000', label: '3000 rated puzzles' },
];

const VALID_SOURCE_KEYS = new Set(PUZZLE_SOURCES.map((source) => source.key));

const USAGE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'used', label: 'Used' },
  { key: 'unused', label: 'Not used' },
];

function resolveSource(searchParams) {
  const source = (searchParams.get('source') || 'chess').toLowerCase();
  return VALID_SOURCE_KEYS.has(source) ? source : 'chess';
}

function pickRandomItem(items) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function truncateFen(fen, max = 42) {
  if (!fen) return '—';
  return fen.length > max ? `${fen.slice(0, max)}…` : fen;
}

function ChroniclesPuzzlesTab() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSource = useMemo(() => resolveSource(searchParams), [searchParams]);

  const [chessPuzzles, setChessPuzzles] = useState([]);
  const [brilliantPuzzles, setBrilliantPuzzles] = useState([]);
  const [ratedPuzzles, setRatedPuzzles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [usageFilter, setUsageFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const addModal = useDisclosure();

  const setActiveSource = useCallback(
    (source) => {
      if (!VALID_SOURCE_KEYS.has(source) || source === activeSource) return;
      const next = new URLSearchParams(searchParams);
      next.set('tab', 'puzzles');
      if (source === 'chess') {
        next.delete('source');
      } else {
        next.set('source', source);
      }
      setSearchParams(next, { replace: true });
    },
    [activeSource, searchParams, setSearchParams]
  );

  const loadPuzzles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [chessRows, brilliantData, ratedRows] = await Promise.all([
        fetchAllPuzzlesWithUsage(),
        fetchBrilliantPuzzlesFromDb({ limit: 5000 }).catch(() => ({ rows: [] })),
        fetchAllRatedPuzzles().catch(() => []),
      ]);
      setChessPuzzles(chessRows);
      setBrilliantPuzzles(
        (brilliantData.rows || []).map((row) => ({
          ...row,
          puzzleType: 'brilliant',
        }))
      );
      setRatedPuzzles(ratedRows);
    } catch (err) {
      setError(err.message || 'Failed to load puzzles.');
      setChessPuzzles([]);
      setBrilliantPuzzles([]);
      setRatedPuzzles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPuzzles();
  }, [loadPuzzles]);

  const sourcePuzzles = useMemo(() => {
    if (activeSource === 'brilliant') return brilliantPuzzles;
    if (activeSource === 'rated3000') return ratedPuzzles;
    return chessPuzzles;
  }, [activeSource, brilliantPuzzles, chessPuzzles, ratedPuzzles]);

  const filteredPuzzles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sourcePuzzles.filter((puzzle) => {
      if (activeSource === 'chess') {
        if (usageFilter === 'used' && !puzzle.isUsed) return false;
        if (usageFilter === 'unused' && puzzle.isUsed) return false;
      }

      if (!query) return true;

      const haystack =
        activeSource === 'brilliant'
          ? [
              puzzle.id,
              puzzle.chessComId,
              puzzle.playersLabel,
              puzzle.solutionSan,
              puzzle.previousMoveSan,
              puzzle.timeControl,
              puzzle.savedDate,
            ]
          : activeSource === 'rated3000'
            ? [puzzle.id, puzzle.principle_id, puzzle.principleLabel, puzzle.fen]
            : [
                puzzle.chess_puzzle_id,
                puzzle.principle_id,
                puzzle.principleLabel,
                puzzle.storyLabel,
                puzzle.moduleLabel,
                puzzle.chapterLabel,
                puzzle.answer,
                puzzle.usageStatus,
              ];

      return haystack.filter(Boolean).join(' ').toLowerCase().includes(query);
    });
  }, [sourcePuzzles, search, usageFilter, activeSource]);

  const viewableFiltered = useMemo(() => {
    return filteredPuzzles.filter((puzzle) => {
      if (puzzle.viewPath) return true;
      return Boolean(puzzle.fen_with_move || puzzle.fen || puzzle.puzzleFen);
    });
  }, [filteredPuzzles]);

  const handleViewPuzzle = useCallback(
    (puzzle) => {
      const hasBoard = puzzle.fen_with_move || puzzle.fen || puzzle.puzzleFen;

      if (activeSource === 'chess' && puzzle.chess_puzzle_id) {
        navigate(`/chronicles/puzzles/chess/${encodeURIComponent(puzzle.chess_puzzle_id)}`);
        return;
      }

      if (activeSource === 'brilliant' && puzzle.id != null) {
        navigate(`/puzzles/chesscom/${encodeURIComponent(puzzle.id)}`);
        return;
      }

      if (activeSource === 'rated3000' && puzzle.id != null) {
        navigate(`/chronicles/puzzles/rated/${encodeURIComponent(puzzle.id)}`);
        return;
      }

      if (puzzle.viewPath) {
        navigate(puzzle.viewPath);
        return;
      }

      if (!hasBoard) {
        toast({
          title: 'Puzzle has no board position',
          status: 'warning',
          duration: 2500,
        });
      }
    },
    [activeSource, navigate, toast]
  );

  const handleViewRandom = () => {
    const randomPuzzle = pickRandomItem(viewableFiltered);
    if (!randomPuzzle) {
      toast({
        title: 'No puzzles to view',
        description: 'Adjust filters or add a puzzle with a valid FEN.',
        status: 'info',
        duration: 3000,
      });
      return;
    }
    handleViewPuzzle(randomPuzzle);
  };

  const handleCreatePuzzle = async (payload) => {
    setSaving(true);
    try {
      const saved = await createPuzzle(payload);
      toast({
        title: 'Puzzle added',
        description: saved.chess_puzzle_id,
        status: 'success',
        duration: 2500,
      });
      addModal.onClose();
      await loadPuzzles();
    } catch (err) {
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const sourceLabel =
    PUZZLE_SOURCES.find((source) => source.key === activeSource)?.label || 'Chess puzzles';

  if (loading) {
    return <LoadingPanel message="Loading puzzles…" />;
  }

  if (error) {
    return <ErrorPanel title="Puzzles unavailable" message={error} onRetry={loadPuzzles} />;
  }

  return (
    <>
      <div className="chronicles-source-tabs" role="tablist" aria-label="Puzzle collections">
        {PUZZLE_SOURCES.map((source) => (
          <button
            key={source.key}
            type="button"
            role="tab"
            aria-selected={activeSource === source.key}
            className={`chronicles-source-tab${
              activeSource === source.key ? ' chronicles-source-tab--active' : ''
            }`}
            onClick={() => setActiveSource(source.key)}
          >
            {source.label}
            <span className="chronicles-source-tab-count">
              {source.key === 'chess'
                ? chessPuzzles.length
                : source.key === 'brilliant'
                  ? brilliantPuzzles.length
                  : ratedPuzzles.length}
            </span>
          </button>
        ))}
      </div>

      <div className="chronicles-toolbar">
        <label className="chronicles-search">
          <FiSearch aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${sourceLabel.toLowerCase()}…`}
            aria-label="Search puzzles"
          />
        </label>
        <div className="chronicles-toolbar-actions">
          <span className="chronicles-count">
            {filteredPuzzles.length} of {sourcePuzzles.length} puzzles
          </span>
          <button
            type="button"
            className="chronicles-secondary-btn"
            onClick={handleViewRandom}
            disabled={!viewableFiltered.length}
          >
            <FiShuffle aria-hidden />
            View random
          </button>
          {activeSource === 'chess' ? (
            <button type="button" className="chronicles-primary-btn" onClick={addModal.onOpen}>
              <FiPlus aria-hidden />
              Add Puzzle
            </button>
          ) : null}
        </div>
      </div>

      {activeSource === 'chess' ? (
        <div className="chronicles-filter-tabs" role="tablist" aria-label="Puzzle usage filters">
          {USAGE_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              role="tab"
              aria-selected={usageFilter === filter.key}
              className={`chronicles-filter-tab${
                usageFilter === filter.key ? ' chronicles-filter-tab--active' : ''
              }`}
              onClick={() => setUsageFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}

      {filteredPuzzles.length === 0 ? (
        <EmptyState
          title={
            search || (activeSource === 'chess' && usageFilter !== 'all')
              ? 'No puzzles match your filters'
              : `No ${sourceLabel.toLowerCase()} yet`
          }
          subtitle={
            search || (activeSource === 'chess' && usageFilter !== 'all')
              ? 'Try another search term or switch filters.'
              : activeSource === 'chess'
                ? 'Click Add Puzzle to create your first curriculum puzzle.'
                : activeSource === 'brilliant'
                  ? 'Save approved brilliant moves from the game view to populate this list.'
                  : 'Import or add 3000-rated puzzles linked to principles.'
          }
        />
      ) : activeSource === 'brilliant' ? (
        <div className="chronicles-table-wrap">
          <table className="chronicles-table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Game</th>
                <th scope="col">Solution</th>
                <th scope="col">Previous</th>
                <th scope="col">Saved</th>
                <th scope="col" className="chronicles-table-actions-col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPuzzles.map((puzzle) => (
                <tr key={puzzle.id} className="chronicles-table-row">
                  <td className="chronicles-table-id">{puzzle.id}</td>
                  <td className="chronicles-table-desc">
                    <span className="chronicles-table-primary">{puzzle.playersLabel || '—'}</span>
                    {puzzle.timeControl ? (
                      <span className="chronicles-table-subline">{puzzle.timeControl}</span>
                    ) : null}
                  </td>
                  <td>{puzzle.solutionSan || '—'}</td>
                  <td>{puzzle.previousMoveSan || '—'}</td>
                  <td>{puzzle.savedDate || '—'}</td>
                  <td className="chronicles-table-actions-col">
                    <button
                      type="button"
                      className="chronicles-table-link-btn"
                      onClick={() => handleViewPuzzle(puzzle)}
                      disabled={puzzle.id == null && !puzzle.puzzleFen}
                    >
                      <FiEye aria-hidden />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : activeSource === 'rated3000' ? (
        <div className="chronicles-table-wrap">
          <table className="chronicles-table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Principle</th>
                <th scope="col">FEN</th>
                <th scope="col" className="chronicles-table-actions-col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPuzzles.map((puzzle) => (
                <tr key={puzzle.id} className="chronicles-table-row">
                  <td className="chronicles-table-id">{puzzle.id}</td>
                  <td>{puzzle.principleLabel}</td>
                  <td className="chronicles-table-fen" title={puzzle.fen}>
                    {truncateFen(puzzle.fen)}
                  </td>
                  <td className="chronicles-table-actions-col">
                    <button
                      type="button"
                      className="chronicles-table-link-btn"
                      onClick={() => handleViewPuzzle(puzzle)}
                      disabled={!puzzle.fen}
                    >
                      <FiEye aria-hidden />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chronicles-table-wrap">
          <table className="chronicles-table">
            <thead>
              <tr>
                <th scope="col">Puzzle ID</th>
                <th scope="col">Solution</th>
                <th scope="col">Status</th>
                <th scope="col">Module</th>
                <th scope="col">Chapter</th>
                <th scope="col">Story</th>
                <th scope="col" className="chronicles-table-actions-col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPuzzles.map((puzzle) => {
                const used = puzzle.isUsed;
                const usageTitle =
                  puzzle.usageCount > 1
                    ? `${puzzle.usageCount} story mappings use this puzzle`
                    : undefined;

                return (
                  <tr key={puzzle.chess_puzzle_id} className="chronicles-table-row">
                    <td className="chronicles-table-id">{puzzle.chess_puzzle_id}</td>
                    <td className="chronicles-table-desc">{puzzle.answer || '—'}</td>
                    <td>
                      <span
                        className={`dashboard-status-pill dashboard-status-pill--${
                          used ? 'completed' : 'progress'
                        }`}
                      >
                        {used ? 'Used' : 'Not used'}
                      </span>
                    </td>
                    <td title={usageTitle}>{puzzle.moduleLabel}</td>
                    <td title={usageTitle}>{puzzle.chapterLabel}</td>
                    <td className="chronicles-table-desc" title={usageTitle}>
                      {puzzle.storyLabel}
                      {puzzle.usageCount > 1 ? ` (+${puzzle.usageCount - 1})` : ''}
                    </td>
                    <td className="chronicles-table-actions-col">
                      <button
                        type="button"
                        className="chronicles-table-link-btn"
                        onClick={() => handleViewPuzzle(puzzle)}
                        disabled={!puzzle.fen_with_move}
                      >
                        <FiEye aria-hidden />
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ChroniclesAddPuzzleModal
        isOpen={addModal.isOpen}
        onClose={addModal.onClose}
        onCreate={handleCreatePuzzle}
        saving={saving}
      />
    </>
  );
}

export default ChroniclesPuzzlesTab;
