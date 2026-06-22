import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box } from '@chakra-ui/react';
import LoadingPanel from '../components/common/LoadingPanel';
import ErrorPanel from '../components/common/ErrorPanel';
import EmptyState from '../components/common/EmptyState';
import AllGamesPagination from '../components/allGames/AllGamesPagination';
import PuzzlesList from '../components/puzzles/PuzzlesList';
import { fetchBrilliantPuzzlesFromDb } from '../services/chessComDbService';
import { useClientPagination } from '../utils/pagination';
import {
  buildFilterLabels,
  DAY_FILTER_OPTIONS,
  dayFilterButtonLabel,
  filterItemsByDay,
  filterLabelForKey,
  panelTitleForDayFilter,
  resolveDayFilter,
  VALID_DAY_FILTER_KEYS,
} from '../utils/allGamesFilters';
import '../components/userProfile/ChessComProfilePage.css';
import '../pages/AllGames.css';

const PUZZLES_PER_PAGE = 100;

function Puzzles() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFilter = resolveDayFilter(searchParams);
  const filterLabels = useMemo(() => buildFilterLabels(), []);
  const activeFilterRef = useRef(activeFilter);

  activeFilterRef.current = activeFilter;

  const [allPuzzles, setAllPuzzles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const filteredPuzzles = useMemo(
    () => filterItemsByDay(allPuzzles, activeFilter, 'savedAt'),
    [allPuzzles, activeFilter]
  );

  const pagination = useClientPagination(filteredPuzzles, PUZZLES_PER_PAGE);

  const dateLabel = useMemo(
    () => filterLabelForKey(activeFilter, filterLabels),
    [activeFilter, filterLabels]
  );

  const panelTitle = useMemo(
    () => panelTitleForDayFilter(activeFilter, filterLabels),
    [activeFilter, filterLabels]
  );

  const setActiveFilter = useCallback(
    (day) => {
      if (!VALID_DAY_FILTER_KEYS.has(day) || day === activeFilterRef.current) return;
      setSearchParams(day === 'all' ? {} : { day }, { replace: true });
    },
    [setSearchParams]
  );

  useEffect(() => {
    pagination.setPage(1);
  }, [activeFilter, pagination.setPage]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchBrilliantPuzzlesFromDb({ limit: 2000 });
        if (!cancelled) setAllPuzzles(data.rows || []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load puzzles.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box className="chess-profile-page">
      <div className="chess-profile-header-wrap">
        <div className="chess-profile-header-card" style={{ marginTop: '1rem', paddingBottom: '1rem' }}>
          <div className="chess-profile-name-row">
            <h1 className="chess-profile-username">Puzzles</h1>
          </div>
          <p className="chess-profile-display-name">
            Saved: {loading ? '…' : allPuzzles.length} puzzles • Showing: {dateLabel} • Filtered:{' '}
            {loading ? '…' : filteredPuzzles.length}
          </p>

          <div className="all-games-filters" role="tablist" aria-label="Puzzle day filters">
            {DAY_FILTER_OPTIONS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                role="tab"
                aria-selected={activeFilter === filter.key}
                className={`all-games-filter-btn${
                  activeFilter === filter.key ? ' all-games-filter-btn--active' : ''
                }`}
                onClick={() => setActiveFilter(filter.key)}
              >
                {dayFilterButtonLabel(filter, filterLabels)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="chess-profile-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <main className="chess-profile-main">
          <section className="chess-profile-panel chess-games-panel">
            <header className="chess-profile-panel-header">
              {panelTitle}
              <span>
                {loading ? '…' : `${filteredPuzzles.length} total`}
                {filteredPuzzles.length > PUZZLES_PER_PAGE
                  ? ` • Page ${pagination.page}/${pagination.totalPages}`
                  : ''}
              </span>
            </header>
            <div className="chess-profile-panel-body chess-games-panel-body">
              {loading ? (
                <LoadingPanel message="Loading puzzles..." />
              ) : error ? (
                <ErrorPanel title="Unable to load puzzles" message={error} />
              ) : filteredPuzzles.length === 0 ? (
                <EmptyState
                  title="No puzzles found for this filter."
                  subtitle={`${allPuzzles.length} puzzles saved. Approve a brilliant move and click Save to Puzzles on its view page.`}
                />
              ) : (
                <>
                  <PuzzlesList rows={pagination.paginatedItems} />
                  <AllGamesPagination
                    page={pagination.page}
                    totalPages={pagination.totalPages}
                    total={pagination.total}
                    pageSize={PUZZLES_PER_PAGE}
                    onPageChange={pagination.setPage}
                  />
                </>
              )}
            </div>
          </section>
        </main>
      </div>
    </Box>
  );
}

export default Puzzles;
