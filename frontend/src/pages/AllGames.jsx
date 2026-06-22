import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box } from '@chakra-ui/react';
import LoadingPanel from '../components/common/LoadingPanel';
import ErrorPanel from '../components/common/ErrorPanel';
import EmptyState from '../components/common/EmptyState';
import GameHistoryList from '../components/userProfile/GameHistoryList';
import AllGamesPagination from '../components/allGames/AllGamesPagination';
import {
  fetchAllGamesFromDb,
  runChessComGameBrilliance,
  syncAllGamesFromChessCom,
} from '../services/chessComDbService';
import { openChessComGame } from '../utils/chessComGameNavigation';
import { useClientPagination } from '../utils/pagination';
import {
  buildFilterLabels,
  DAY_FILTER_OPTIONS,
  dayFilterButtonLabel,
  filterGamesByDay,
  filterLabelForKey,
  mergeAllGames,
  panelTitleForDayFilter,
  resolveDayFilter,
  VALID_DAY_FILTER_KEYS,
} from '../utils/allGamesFilters';
import '../components/userProfile/ChessComProfilePage.css';
import './AllGames.css';

const POLL_MS = 3000;
const MAX_POLL_ATTEMPTS = 80;
const ANALYSIS_CONCURRENCY = 2;
const MAX_AUTO_ANALYSIS_GAMES = 150;
const GAMES_PER_PAGE = 100;

const DAY_FILTERS = DAY_FILTER_OPTIONS;
const VALID_DAY_KEYS = VALID_DAY_FILTER_KEYS;

function resolveActiveFilter(searchParams) {
  return resolveDayFilter(searchParams);
}

function filterButtonLabel(filter, filterLabels) {
  return dayFilterButtonLabel(filter, filterLabels);
}

function gameOwner(game) {
  return game?.chessComId || (game?.isWhite ? game?.white : game?.black) || null;
}

function stage4Passed(result) {
  const analyzed = result?.stage4?.analyzed_count ?? result?.stage4?.moves?.length ?? 0;
  return analyzed > 0;
}

function AllGames() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFilter = resolveActiveFilter(searchParams);
  const filterLabels = useMemo(() => buildFilterLabels(), []);

  const [allGames, setAllGames] = useState([]);
  const [playersCount, setPlayersCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [stage4StatusByGame, setStage4StatusByGame] = useState({});
  const [analysisRunning, setAnalysisRunning] = useState(false);

  const analysisAbortRef = useRef(false);
  const autoSyncStarted = useRef(false);
  const pollTimerRef = useRef(null);
  const activeFilterRef = useRef(activeFilter);
  const stage4StatusRef = useRef({});

  activeFilterRef.current = activeFilter;
  stage4StatusRef.current = stage4StatusByGame;

  const filteredGames = useMemo(
    () => filterGamesByDay(allGames, activeFilter),
    [allGames, activeFilter]
  );

  const pagination = useClientPagination(filteredGames, GAMES_PER_PAGE);

  const dateLabel = useMemo(
    () => filterLabelForKey(activeFilter, filterLabels),
    [activeFilter, filterLabels]
  );

  const setActiveFilter = useCallback(
    (day) => {
      if (!VALID_DAY_KEYS.has(day) || day === activeFilterRef.current) return;
      setSearchParams(day === 'all' ? {} : { day }, { replace: true });
    },
    [setSearchParams]
  );

  useEffect(() => {
    pagination.setPage(1);
  }, [activeFilter, pagination.setPage]);

  const applyAllGamesPayload = useCallback((data, { merge = false } = {}) => {
    const incoming = data.games || [];
    setAllGames((prev) => (merge ? mergeAllGames(prev, incoming) : incoming));
    setPlayersCount(data.playersCount || 0);
    setSyncing(Boolean(data.syncInProgress));
    return incoming;
  }, []);

  const fetchAllGames = useCallback(async () => {
    return fetchAllGamesFromDb({ day: 'all', previewPgn: false });
  }, []);

  const analyzeGamesStageWise = useCallback(async (list) => {
    const pending = (list || []).filter((game) => {
      if (!game?.uuid) return false;
      const status = stage4StatusRef.current[game.uuid];
      return !status || status === 'idle';
    });

    if (!pending.length || (list || []).length > MAX_AUTO_ANALYSIS_GAMES) {
      if ((list || []).length > MAX_AUTO_ANALYSIS_GAMES) {
        setAnalysisRunning(false);
      }
      return;
    }

    analysisAbortRef.current = false;
    setAnalysisRunning(true);
    setStage4StatusByGame((prev) => {
      const next = { ...prev };
      pending.forEach((game) => {
        next[game.uuid] = 'running';
      });
      return next;
    });

    for (let offset = 0; offset < pending.length; offset += ANALYSIS_CONCURRENCY) {
      if (analysisAbortRef.current) break;
      const batch = pending.slice(offset, offset + ANALYSIS_CONCURRENCY);
      await Promise.all(
        batch.map(async (game) => {
          const uuid = game.uuid;
          const owner = gameOwner(game);
          if (!uuid || !owner) return;
          try {
            const result = await runChessComGameBrilliance(owner, uuid);
            if (analysisAbortRef.current) return;
            setStage4StatusByGame((prev) => ({
              ...prev,
              [uuid]: stage4Passed(result) ? 'pass' : 'fail',
            }));
          } catch {
            if (analysisAbortRef.current) return;
            setStage4StatusByGame((prev) => ({ ...prev, [uuid]: 'fail' }));
          }
        })
      );
    }

    if (!analysisAbortRef.current) setAnalysisRunning(false);
  }, []);

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    clearPoll();
    let attempts = 0;

    pollTimerRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const data = await fetchAllGames();
        setAllGames((prev) => mergeAllGames(prev, data.games || []));
        setPlayersCount(data.playersCount || 0);
        setSyncing(Boolean(data.syncInProgress));

        if (!data.syncInProgress || attempts >= MAX_POLL_ATTEMPTS) {
          clearPoll();
          setSyncing(false);
          setRefreshing(false);
        }
      } catch {
        if (attempts >= MAX_POLL_ATTEMPTS) {
          clearPoll();
          setSyncing(false);
          setRefreshing(false);
        }
      }
    }, POLL_MS);
  }, [clearPoll, fetchAllGames]);

  const runSync = useCallback(async () => {
    setSyncing(true);
    setRefreshing(true);
    setError(null);
    try {
      const data = await syncAllGamesFromChessCom();
      applyAllGamesPayload(data, { merge: true });
      startPolling();
    } catch (err) {
      setError(err.message || 'Failed to sync games from Chess.com.');
      setSyncing(false);
    }
  }, [applyAllGamesPayload, startPolling]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setInitialLoading(true);
      setError(null);
      try {
        const data = await fetchAllGames();
        if (cancelled) return;
        applyAllGamesPayload(data);

        if (data.syncInProgress) {
          startPolling();
          return;
        }

        if ((data.games || []).length === 0 && !autoSyncStarted.current) {
          autoSyncStarted.current = true;
          setSyncing(true);
          const syncData = await syncAllGamesFromChessCom();
          if (cancelled) return;
          applyAllGamesPayload(syncData, { merge: true });
          startPolling();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load games.');
        }
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      clearPoll();
      analysisAbortRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load cache once on mount
  }, []);

  useEffect(() => {
    analysisAbortRef.current = true;

    if (!filteredGames.length || filteredGames.length > MAX_AUTO_ANALYSIS_GAMES) {
      if (filteredGames.length > MAX_AUTO_ANALYSIS_GAMES) {
        setAnalysisRunning(false);
      }
      return undefined;
    }

    analyzeGamesStageWise(filteredGames);
    return () => {
      analysisAbortRef.current = true;
    };
  }, [filteredGames, analyzeGamesStageWise]);

  const handleSelect = useCallback(
    (game) => {
      const owner = game?.chessComId || (game?.isWhite ? game?.white : game?.black);
      if (!owner) return;
      openChessComGame(navigate, owner, game);
    },
    [navigate]
  );

  const panelTitle = useMemo(() => {
    const match = DAY_FILTERS.find((filter) => filter.key === activeFilter) || DAY_FILTERS[3];
    return filterButtonLabel(match, filterLabels);
  }, [activeFilter, filterLabels]);

  const showStage4Column =
    filteredGames.length > 0 && filteredGames.length <= MAX_AUTO_ANALYSIS_GAMES;

  return (
    <Box className="chess-profile-page">
      <div className="chess-profile-header-wrap">
        <div className="chess-profile-header-card" style={{ marginTop: '1rem', paddingBottom: '1rem' }}>
          <div className="chess-profile-name-row">
            <h1 className="chess-profile-username">All Games</h1>
            <button
              type="button"
              className="chess-btn chess-btn-secondary"
              onClick={runSync}
              disabled={syncing}
            >
              {syncing ? 'Syncing…' : 'Sync from Chess.com'}
            </button>
          </div>
          <p className="chess-profile-display-name">
            Loaded: {initialLoading ? '…' : allGames.length} games • Showing: {dateLabel} • Filtered:{' '}
            {filteredGames.length} • Players tracked: {playersCount}
            {syncing || refreshing ? ' • Refreshing from Chess.com…' : ''}
            {!syncing && !refreshing && analysisRunning ? ' • Running Stage 0-4 brilliance analysis…' : ''}
          </p>

          <div className="all-games-filters" role="tablist" aria-label="Game day filters">
            {DAY_FILTERS.map((filter) => (
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
                {filterButtonLabel(filter, filterLabels)}
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
                {filteredGames.length} total
                {filteredGames.length > GAMES_PER_PAGE
                  ? ` • Page ${pagination.page}/${pagination.totalPages}`
                  : ''}
              </span>
            </header>
            <div className="chess-profile-panel-body chess-games-panel-body">
              {initialLoading ? (
                <LoadingPanel message="Loading all games..." />
              ) : error ? (
                <ErrorPanel title="Unable to load games" message={error} onRetry={runSync} />
              ) : filteredGames.length === 0 ? (
                syncing ? (
                  <LoadingPanel message="Syncing all players from Chess.com…" />
                ) : (
                  <EmptyState
                    title="No games found for this filter."
                    subtitle={`${allGames.length} games loaded. None match ${dateLabel}. Click Sync from Chess.com to fetch recent games.`}
                  />
                )
              ) : (
                <>
                  <GameHistoryList
                    games={pagination.paginatedItems}
                    onSelect={handleSelect}
                    showHeader
                    dateColumnLabel="Date & Time"
                    extraColumnLabel={showStage4Column ? 'Stage 4' : null}
                    extraColumn={
                      showStage4Column
                        ? (game) => {
                            const status = stage4StatusByGame[game.uuid] || 'idle';
                            const label =
                              status === 'running'
                                ? 'Running'
                                : status === 'pass'
                                  ? 'Passed'
                                  : status === 'fail'
                                    ? 'Not Passed'
                                    : 'Pending';
                            return (
                              <span className={`chess-stage4-chip chess-stage4-chip--${status}`}>
                                {label}
                              </span>
                            );
                          }
                        : null
                    }
                  />
                  <AllGamesPagination
                    page={pagination.page}
                    totalPages={pagination.totalPages}
                    total={pagination.total}
                    pageSize={GAMES_PER_PAGE}
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

export default AllGames;
