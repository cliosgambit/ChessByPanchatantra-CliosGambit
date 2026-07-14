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
const ANALYSIS_CONCURRENCY = 1;
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

function brillianceRunSucceeded(result) {
  const stage4 = result?.stage4;
  if (stage4?.status === 'failed' || stage4?.error) return false;
  if (stage4?.status === 'completed') return true;
  return [result?.stage0, result?.stage1, result?.stage2, result?.stage3, result?.stage4].every(
    (stage) => stage?.status === 'completed'
  );
}

function stage4StatusLabel(status) {
  if (status === 'running') return 'Running';
  if (status === 'pass') return 'Done';
  if (status === 'fail') return 'Failed';
  return 'Pending';
}

function brillianceUiStatusFromGame(game) {
  const stage4Status = game?.brillianceRun?.stage4Status;
  if (stage4Status === 'completed') return 'pass';
  if (stage4Status === 'failed') return 'fail';
  if (stage4Status === 'running') return 'running';
  return null;
}

function buildStage4StatusMap(games) {
  const next = {};
  for (const game of games || []) {
    if (!game?.uuid) continue;
    const status = brillianceUiStatusFromGame(game);
    if (status) next[game.uuid] = status;
  }
  return next;
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

  const pendingAnalysisCount = useMemo(
    () =>
      filteredGames.filter((game) => {
        if (!game?.uuid) return false;
        const status = stage4StatusByGame[game.uuid];
        return !status || status === 'idle' || status === 'pending';
      }).length,
    [filteredGames, stage4StatusByGame]
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

    const fromDb = buildStage4StatusMap(incoming);
    if (Object.keys(fromDb).length) {
      setStage4StatusByGame((prev) => {
        const next = merge ? { ...prev } : {};
        for (const [uuid, status] of Object.entries(fromDb)) {
          if (prev[uuid] !== 'running') next[uuid] = status;
        }
        return next;
      });
    }

    return incoming;
  }, []);

  const fetchAllGames = useCallback(async () => {
    return fetchAllGamesFromDb({ day: 'all', previewPgn: false });
  }, []);

  const runSingleBrilliance = useCallback(async (game, { force = false } = {}) => {
    const uuid = game?.uuid;
    const owner = gameOwner(game);
    if (!uuid || !owner) return;
    if (stage4StatusRef.current[uuid] === 'running') return;

    setStage4StatusByGame((prev) => ({ ...prev, [uuid]: 'running' }));
    try {
      const result = await runChessComGameBrilliance(owner, uuid, { force });
      setStage4StatusByGame((prev) => ({
        ...prev,
        [uuid]: brillianceRunSucceeded(result) ? 'pass' : 'fail',
      }));
    } catch {
      setStage4StatusByGame((prev) => ({ ...prev, [uuid]: 'fail' }));
    }
  }, []);

  const analyzeGamesStageWise = useCallback(async (list, { onlyPending = true } = {}) => {
    const targets = (list || []).filter((game) => {
      if (!game?.uuid) return false;
      if (!onlyPending) return true;
      const status = stage4StatusRef.current[game.uuid];
      return !status || status === 'idle' || status === 'pending';
    });

    if (!targets.length) return 0;

    analysisAbortRef.current = false;
    setAnalysisRunning(true);
    setStage4StatusByGame((prev) => {
      const next = { ...prev };
      targets.forEach((game) => {
        next[game.uuid] = 'running';
      });
      return next;
    });

    for (let offset = 0; offset < targets.length; offset += ANALYSIS_CONCURRENCY) {
      if (analysisAbortRef.current) break;
      const batch = targets.slice(offset, offset + ANALYSIS_CONCURRENCY);
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
              [uuid]: brillianceRunSucceeded(result) ? 'pass' : 'fail',
            }));
          } catch {
            if (analysisAbortRef.current) return;
            setStage4StatusByGame((prev) => ({ ...prev, [uuid]: 'fail' }));
          }
        })
      );
    }

    if (!analysisAbortRef.current) setAnalysisRunning(false);
    return targets.length;
  }, []);

  const runBrilliancePipeline = useCallback(async () => {
    if (analysisRunning || !filteredGames.length) return;
    setError(null);
    await analyzeGamesStageWise(filteredGames, { onlyPending: true });
  }, [analysisRunning, filteredGames, analyzeGamesStageWise]);

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

  useEffect(
    () => () => {
      analysisAbortRef.current = true;
    },
    [activeFilter]
  );

  const handleSelect = useCallback(
    (game) => {
      const owner = game?.chessComId || (game?.isWhite ? game?.white : game?.black);
      if (!owner) return;
      openChessComGame(navigate, owner, game);
    },
    [navigate]
  );

  const renderBrillianceColumn = useCallback(
    (game) => {
      const status = stage4StatusByGame[game.uuid] || 'idle';
      const isRunning = status === 'running';
      const isDone = status === 'pass';
      const isFailed = status === 'fail';
      const canRun = Boolean(game.uuid && gameOwner(game));

      return (
        <div className="chess-brilliance-run-cell">
          <span className={`chess-stage4-chip chess-stage4-chip--${status}`}>
            {stage4StatusLabel(status)}
          </span>
          <button
            type="button"
            className={`chess-brilliance-run-btn${isDone || isFailed ? ' chess-brilliance-run-btn--rerun' : ''}`}
            disabled={!canRun || isRunning || analysisRunning}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              runSingleBrilliance(game, { force: isDone || isFailed });
            }}
          >
            {isRunning ? 'Running…' : isDone || isFailed ? 'Re-run' : 'Run S0–S4'}
          </button>
        </div>
      );
    },
    [analysisRunning, runSingleBrilliance, stage4StatusByGame]
  );

  const panelTitle = useMemo(() => {
    const match = DAY_FILTERS.find((filter) => filter.key === activeFilter) || DAY_FILTERS[3];
    return filterButtonLabel(match, filterLabels);
  }, [activeFilter, filterLabels]);

  return (
    <Box className="chess-profile-page">
      <div className="chess-profile-header-wrap">
        <div className="chess-profile-header-card" style={{ marginTop: '1rem', paddingBottom: '1rem' }}>
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
              <button
                type="button"
                className="chess-btn chess-btn-primary"
                onClick={runBrilliancePipeline}
                disabled={analysisRunning || syncing || filteredGames.length === 0}
                title={`Run Stage 0–4 brilliance pipeline for ${filteredGames.length} game(s) in ${dateLabel}`}
              >
                {analysisRunning
                  ? 'Running pipeline…'
                  : `Run Brilliance (${pendingAnalysisCount} pending)`}
              </button>
            </div>
          </div>
          <p className="chess-profile-display-name">
            Loaded: {initialLoading ? '…' : allGames.length} games • Showing: {dateLabel} • Filtered:{' '}
            {filteredGames.length} • Players tracked: {playersCount}
            {syncing || refreshing ? ' • Refreshing from Chess.com…' : ''}
            {!syncing && !refreshing && analysisRunning
              ? ' • Running Stage 0–4 brilliance analysis…'
              : ''}
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
                {pendingAnalysisCount > 0 ? ` • ${pendingAnalysisCount} pending analysis` : ''}
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
                    extraColumnLabel="Brilliance"
                    extraColumn={renderBrillianceColumn}
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
