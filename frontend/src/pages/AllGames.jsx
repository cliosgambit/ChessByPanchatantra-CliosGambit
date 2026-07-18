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
  resolveDayFilter,
  VALID_DAY_FILTER_KEYS,
} from '../utils/allGamesFilters';
import '../components/userProfile/ChessComProfilePage.css';
import './AllGames.css';

const POLL_MS = 4000;
const STATUS_POLL_MS = 2000;
const MAX_POLL_ATTEMPTS = 80;
const GAMES_PER_PAGE = 50;

const DAY_FILTERS = DAY_FILTER_OPTIONS;
const VALID_DAY_KEYS = VALID_DAY_FILTER_KEYS;

function resolveActiveFilter(searchParams) {
  return resolveDayFilter(searchParams);
}

function filterButtonLabel(filter, filterLabels) {
  return dayFilterButtonLabel(filter, filterLabels);
}

function stageStatuses(run) {
  if (!run) return [];
  return [
    run.stage0Status,
    run.stage1Status,
    run.stage2Status,
    run.stage3Status,
    run.stage4Status,
  ];
}

/** Status chip for games that were already reviewed (analysis runs on game open). */
function getBrillianceStageDisplay(game) {
  const run = game?.brillianceRun;
  const statuses = stageStatuses(run);

  if (run?.stage4Status === 'completed' || run?.pipelineStatus === 'passed') {
    return { label: 'Reviewed', tone: 'pass', title: 'Stage 0–4 complete — open to view' };
  }

  const failedIdx = statuses.findIndex((s) => s === 'failed');
  if (failedIdx >= 0 || run?.pipelineStatus === 'failed') {
    const n = failedIdx >= 0 ? failedIdx : run?.currentStage;
    return {
      label: n == null ? 'Failed' : `S${n} failed`,
      tone: 'fail',
      title: 'Open the game to re-run review',
    };
  }

  const runningIdx = statuses.findIndex((s) => s === 'running');
  if (runningIdx >= 0 || run?.pipelineStatus === 'running') {
    return {
      label: `Stage ${runningIdx >= 0 ? runningIdx : run?.currentStage ?? 0}`,
      tone: 'running',
      title: 'Analysis in progress',
    };
  }

  let lastCompleted = -1;
  for (let i = 0; i < statuses.length; i += 1) {
    if (statuses[i] === 'completed') lastCompleted = i;
    else break;
  }
  if (lastCompleted >= 0 && lastCompleted < 4) {
    return {
      label: `Stage ${lastCompleted + 1}`,
      tone: 'running',
      title: 'Partial review — open game to continue',
    };
  }

  return { label: 'Open to review', tone: 'idle', title: 'Click the game to open and analyze' };
}

function gameNeedsStatusPoll(game) {
  const run = game?.brillianceRun;
  if (!run) return false;
  if (run.pipelineStatus === 'running' || run.pipelineStatus === 'queued') return true;
  return stageStatuses(run).some((s) => s === 'running');
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

  const syncPollTimerRef = useRef(null);
  const statusPollTimerRef = useRef(null);
  const activeFilterRef = useRef(activeFilter);

  activeFilterRef.current = activeFilter;

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
      // Default URL (no ?day) means today — persist `all` explicitly so it doesn't snap back.
      setSearchParams(day === 'today' ? {} : { day }, { replace: true });
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

  const fetchAllGames = useCallback(async (day = 'all') => {
    return fetchAllGamesFromDb({ day, previewPgn: false });
  }, []);

  const clearSyncPoll = useCallback(() => {
    if (syncPollTimerRef.current) {
      clearInterval(syncPollTimerRef.current);
      syncPollTimerRef.current = null;
    }
  }, []);

  const clearStatusPoll = useCallback(() => {
    if (statusPollTimerRef.current) {
      clearInterval(statusPollTimerRef.current);
      statusPollTimerRef.current = null;
    }
  }, []);

  const clearPoll = useCallback(() => {
    clearSyncPoll();
    clearStatusPoll();
  }, [clearSyncPoll, clearStatusPoll]);

  const refreshBrillianceStatuses = useCallback(async () => {
    const data = await fetchAllGames('all');
    applyAllGamesPayload(data, { merge: true });
    return data;
  }, [applyAllGamesPayload, fetchAllGames]);

  const startStatusPolling = useCallback(() => {
    if (statusPollTimerRef.current) return;
    statusPollTimerRef.current = setInterval(async () => {
      try {
        const data = await refreshBrillianceStatuses();
        if (!(data.games || []).some(gameNeedsStatusPoll)) clearStatusPoll();
      } catch {
        /* retry next tick */
      }
    }, STATUS_POLL_MS);
  }, [clearStatusPoll, refreshBrillianceStatuses]);

  const startPolling = useCallback(() => {
    clearSyncPoll();
    let attempts = 0;

    syncPollTimerRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const data = await refreshBrillianceStatuses();
        setSyncing(Boolean(data.syncInProgress));

        if (!data.syncInProgress || attempts >= MAX_POLL_ATTEMPTS) {
          clearSyncPoll();
          setSyncing(false);
          setRefreshing(false);
          if ((data.games || []).some(gameNeedsStatusPoll)) startStatusPolling();
        }
      } catch {
        if (attempts >= MAX_POLL_ATTEMPTS) {
          clearSyncPoll();
          setSyncing(false);
          setRefreshing(false);
        }
      }
    }, POLL_MS);
  }, [clearSyncPoll, refreshBrillianceStatuses, startStatusPolling]);

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
        const quickDay = activeFilterRef.current === 'all' ? 'today' : activeFilterRef.current;
        const quick = await fetchAllGames(quickDay);
        if (cancelled) return;
        applyAllGamesPayload(quick);
        setInitialLoading(false);

        if (quick.syncInProgress) startPolling();
        else if ((quick.games || []).some(gameNeedsStatusPoll)) startStatusPolling();

        const full = await fetchAllGames('all');
        if (cancelled) return;
        applyAllGamesPayload(full);
        if (full.syncInProgress) startPolling();
        else if ((full.games || []).some(gameNeedsStatusPoll)) startStatusPolling();
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load games.');
          setInitialLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      clearPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const handleSelect = useCallback(
    (game) => {
      const owner = game?.chessComId || (game?.isWhite ? game?.white : game?.black);
      if (!owner) return;
      openChessComGame(navigate, owner, game);
    },
    [navigate]
  );

  const renderBrillianceColumn = useCallback((game) => {
    const stage = getBrillianceStageDisplay(game);
    return (
      <div className="chess-brilliance-run-cell">
        <span
          className={`chess-stage4-chip chess-stage4-chip--${stage.tone}`}
          title={stage.title}
        >
          {stage.label}
        </span>
      </div>
    );
  }, []);

  const panelTitle = useMemo(() => {
    const match = DAY_FILTERS.find((filter) => filter.key === activeFilter) || DAY_FILTERS[3];
    return filterButtonLabel(match, filterLabels);
  }, [activeFilter, filterLabels]);

  return (
    <Box className="chess-profile-page all-games-page">
      <div className="chess-profile-header-wrap">
        <div className="chess-profile-header-card">
          <div className="chess-profile-name-row">
            <h1 className="chess-profile-username">All Games</h1>
            <div className="all-games-header-actions">
              <button
                type="button"
                className="chess-btn chess-btn-secondary"
                onClick={runSync}
                disabled={syncing}
              >
                {syncing ? 'Syncing…' : 'Sync from Chess.com'}
              </button>
            </div>
          </div>
          <p className="chess-profile-display-name">
            Loaded: {initialLoading ? '…' : allGames.length} games • Showing: {dateLabel} • Filtered:{' '}
            {filteredGames.length} • Players tracked: {playersCount}
            {syncing || refreshing ? ' • Refreshing from Chess.com…' : ''}
            {' • Click a game to open and review'}
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
                <LoadingPanel message="Loading games…" />
              ) : error ? (
                <ErrorPanel title="Unable to load games" message={error} onRetry={runSync} />
              ) : filteredGames.length === 0 ? (
                syncing ? (
                  <LoadingPanel message="Syncing players from Chess.com…" />
                ) : (
                  <EmptyState
                    title="No games found for this filter."
                    subtitle={
                      allGames.length
                        ? `${allGames.length} games loaded. None match ${dateLabel}.`
                        : 'Click Sync from Chess.com to fetch recent games.'
                    }
                  />
                )
              ) : (
                <>
                  <GameHistoryList
                    games={pagination.paginatedItems}
                    onSelect={handleSelect}
                    showHeader
                    dateColumnLabel="Date & Time"
                    extraColumnLabel="Review"
                    extraColumn={renderBrillianceColumn}
                    prefetchPgn={false}
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
