import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import LoadingPanel from '../common/LoadingPanel';
import ErrorPanel from '../common/ErrorPanel';
import EmptyState from '../common/EmptyState';
import AllGamesPagination from '../allGames/AllGamesPagination';
import BrilliantMovesList from './BrilliantMovesList';
import {
  fetchBrilliantMovesFromDb,
  fetchBrilliancePipelineStatsFromDb,
} from '../../services/chessComDbService';
import {
  filterLabelForKey,
  panelTitleForDayFilter,
} from '../../utils/allGamesFilters';
import {
  BRILLIANT_FILTER_OPTIONS,
  REVIEW_FILTER_OPTIONS,
  filterBrilliantMoveRows,
  resolveBrilliantFilter,
  resolveReviewFilter,
} from '../../utils/brilliantMovesFilters';
import { useClientPagination } from '../../utils/pagination';
import '../../pages/BrilliantMoves.css';

const STATS_POLL_MS = 1500;
const MOVES_PER_PAGE = 50;

const EMPTY_PIPELINE_STATS = {
  gamesFetched: 0,
  analysisPending: 0,
  analysisRunning: 0,
  analysisCompleted: 0,
  analysisFailed: 0,
  brilliantMovesFound: 0,
  humanReviewedCount: 0,
  humanApprovedBrilliantCount: 0,
  stagesRunning: { stage0: 0, stage1: 0, stage2: 0, stage3: 0, stage4: 0 },
  syncInProgress: false,
};

/**
 * Brilliant moves list + review stats for a shared day filter.
 * Used inside the merged All Games / Brilliant Moves page.
 */
function BrilliantMovesPanel({ activeFilter, filterLabels, onStatsChange }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [allRows, setAllRows] = useState([]);
  const [pipelineStats, setPipelineStats] = useState(EMPTY_PIPELINE_STATS);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState(null);
  const reviewFilter = resolveReviewFilter(searchParams);
  const brilliantFilter = resolveBrilliantFilter(searchParams);
  const prevCompletedRef = useRef(0);
  const activeFilterRef = useRef(activeFilter);
  const onStatsChangeRef = useRef(onStatsChange);

  activeFilterRef.current = activeFilter;
  onStatsChangeRef.current = onStatsChange;

  const navFilters = useMemo(
    () => ({
      day: activeFilter,
      review: reviewFilter,
      brilliant: brilliantFilter,
    }),
    [activeFilter, reviewFilter, brilliantFilter]
  );

  const filteredRows = useMemo(
    () =>
      filterBrilliantMoveRows(allRows, {
        dayFilter: activeFilter,
        reviewFilter,
        brilliantFilter,
      }),
    [allRows, activeFilter, reviewFilter, brilliantFilter]
  );

  const dayFilteredRows = useMemo(
    () =>
      filterBrilliantMoveRows(allRows, {
        dayFilter: activeFilter,
        reviewFilter: 'all',
        brilliantFilter: 'all',
      }),
    [allRows, activeFilter]
  );

  const patchListFilters = useCallback(
    (patch) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([key, value]) => {
            if (value == null || value === '' || value === 'all') next.delete(key);
            else next.set(key, value);
          });
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const pagination = useClientPagination(filteredRows, MOVES_PER_PAGE);

  const dateLabel = useMemo(
    () => filterLabelForKey(activeFilter, filterLabels),
    [activeFilter, filterLabels]
  );

  const panelTitle = useMemo(
    () => panelTitleForDayFilter(activeFilter, filterLabels),
    [activeFilter, filterLabels]
  );

  useEffect(() => {
    pagination.setPage(1);
  }, [activeFilter, reviewFilter, brilliantFilter, pagination.setPage]);

  useEffect(() => {
    onStatsChangeRef.current?.({
      reviewed: pipelineStats.humanReviewedCount,
      brilliant:
        pipelineStats.humanApprovedBrilliantCount ?? pipelineStats.brilliantMovesFound,
      loading: statsLoading,
    });
  }, [
    pipelineStats.humanReviewedCount,
    pipelineStats.humanApprovedBrilliantCount,
    pipelineStats.brilliantMovesFound,
    statsLoading,
  ]);

  const reloadMoves = useCallback(async () => {
    try {
      const data = await fetchBrilliantMovesFromDb({ limit: 2000 });
      setAllRows(data.rows || []);
    } catch {
      // keep existing rows on refresh failure
    }
  }, []);

  const loadPipelineStats = useCallback(async (dayFilter) => {
    const stats = await fetchBrilliancePipelineStatsFromDb({ day: dayFilter });
    setPipelineStats({
      gamesFetched: stats.gamesFetched ?? 0,
      analysisPending: stats.analysisPending ?? 0,
      analysisRunning: stats.analysisRunning ?? 0,
      analysisCompleted: stats.analysisCompleted ?? 0,
      analysisFailed: stats.analysisFailed ?? 0,
      brilliantMovesFound: stats.brilliantMovesFound ?? 0,
      humanReviewedCount: stats.humanReviewedCount ?? 0,
      humanApprovedBrilliantCount: stats.humanApprovedBrilliantCount ?? 0,
      stagesRunning: stats.stagesRunning || EMPTY_PIPELINE_STATS.stagesRunning,
      syncInProgress: Boolean(stats.syncInProgress),
    });
    return stats;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchBrilliantMovesFromDb({ limit: 2000 });
        if (!cancelled) setAllRows(data.rows || []);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load brilliant moves.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let pollTimer = null;

    async function pollStats() {
      setStatsLoading((prev) => (prev && !cancelled ? prev : false));
      try {
        const stats = await loadPipelineStats(activeFilterRef.current);
        if (cancelled) return;

        if (stats.analysisCompleted > prevCompletedRef.current) {
          await reloadMoves();
        }
        prevCompletedRef.current = stats.analysisCompleted ?? 0;
      } catch {
        // ignore poll errors
      } finally {
        if (!cancelled) setStatsLoading(false);
      }

      if (!cancelled) {
        pollTimer = setTimeout(pollStats, STATS_POLL_MS);
      }
    }

    setStatsLoading(true);
    pollStats();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [activeFilter, loadPipelineStats, reloadMoves]);

  return (
    <section className="chess-profile-panel chess-games-panel">
      <header className="chess-profile-panel-header">
        <span>
          {loading
            ? '…'
            : `${filteredRows.length} moves${
                filteredRows.length > MOVES_PER_PAGE
                  ? ` • Page ${pagination.page}/${pagination.totalPages}`
                  : ''
              }`}
        </span>
        <span>{panelTitle}</span>
      </header>

      <div className="brilliant-moves-list-filters" aria-label="Move filters">
        <div
          className="brilliant-moves-list-filter-group"
          role="tablist"
          aria-label="Review status"
        >
          {REVIEW_FILTER_OPTIONS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              role="tab"
              aria-selected={reviewFilter === filter.key}
              className={`brilliant-moves-list-filter-btn${
                reviewFilter === filter.key ? ' is-active' : ''
              }`}
              onClick={() => patchListFilters({ review: filter.key })}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div
          className="brilliant-moves-list-filter-group"
          role="tablist"
          aria-label="Brilliant status"
        >
          {BRILLIANT_FILTER_OPTIONS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              role="tab"
              aria-selected={brilliantFilter === filter.key}
              className={`brilliant-moves-list-filter-btn${
                brilliantFilter === filter.key ? ' is-active' : ''
              }${filter.key === 'brilliant' ? ' brilliant-moves-list-filter-btn--brilliant' : ''}`}
              onClick={() => patchListFilters({ brilliant: filter.key })}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chess-profile-panel-body chess-games-panel-body">
        {loading ? (
          <LoadingPanel message="Loading Stage 4 moves…" />
        ) : error ? (
          <ErrorPanel title="Unable to load Stage 4 moves" message={error} />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title="No moves match these filters."
            subtitle={
              dayFilteredRows.length
                ? `${dayFilteredRows.length} Stage 4 moves on ${dateLabel}. Try another review or brilliant filter.`
                : `No Stage 4 moves for ${dateLabel}.`
            }
          />
        ) : (
          <>
            <BrilliantMovesList rows={pagination.paginatedItems} navFilters={navFilters} />
            <AllGamesPagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              pageSize={MOVES_PER_PAGE}
              onPageChange={pagination.setPage}
            />
          </>
        )}
      </div>
    </section>
  );
}

export default BrilliantMovesPanel;
