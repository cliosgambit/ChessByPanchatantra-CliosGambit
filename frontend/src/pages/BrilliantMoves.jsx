import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box } from '@chakra-ui/react';
import LoadingPanel from '../components/common/LoadingPanel';
import ErrorPanel from '../components/common/ErrorPanel';
import EmptyState from '../components/common/EmptyState';
import BrilliantMovesList from '../components/brilliantMoves/BrilliantMovesList';
import { fetchBrilliantMovesFromDb } from '../services/chessComDbService';
import {
  buildFilterLabels,
  DAY_FILTER_OPTIONS,
  dayFilterButtonLabel,
  filterGamesByDay,
  filterLabelForKey,
  panelTitleForDayFilter,
  resolveDayFilter,
  VALID_DAY_FILTER_KEYS,
} from '../utils/allGamesFilters';
import '../components/userProfile/ChessComProfilePage.css';
import './AllGames.css';

function BrilliantMoves() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFilter = resolveDayFilter(searchParams);
  const filterLabels = useMemo(() => buildFilterLabels(), []);
  const activeFilterRef = useRef(activeFilter);

  activeFilterRef.current = activeFilter;

  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const filteredRows = useMemo(
    () => filterGamesByDay(allRows, activeFilter),
    [allRows, activeFilter]
  );

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

  return (
    <Box className="chess-profile-page">
      <div className="chess-profile-header-wrap">
        <div className="chess-profile-header-card" style={{ marginTop: '1rem', paddingBottom: '1rem' }}>
          <div className="chess-profile-name-row">
            <h1 className="chess-profile-username">Brilliant Moves</h1>
          </div>
          <p className="chess-profile-display-name">
            Loaded: {loading ? '…' : allRows.length} moves • Showing: {dateLabel} • Filtered:{' '}
            {loading ? '…' : filteredRows.length}
          </p>

          <div className="all-games-filters" role="tablist" aria-label="Brilliant move day filters">
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
              <span>{loading ? '…' : `${filteredRows.length} total`}</span>
            </header>
            <div className="chess-profile-panel-body chess-games-panel-body">
              {loading ? (
                <LoadingPanel message="Loading brilliant moves..." />
              ) : error ? (
                <ErrorPanel title="Unable to load brilliant moves" message={error} />
              ) : filteredRows.length === 0 ? (
                <EmptyState
                  title="No brilliant moves found for this filter."
                  subtitle={`${allRows.length} moves loaded. None match ${dateLabel}.`}
                />
              ) : (
                <BrilliantMovesList rows={filteredRows} />
              )}
            </div>
          </section>
        </main>
      </div>
    </Box>
  );
}

export default BrilliantMoves;
