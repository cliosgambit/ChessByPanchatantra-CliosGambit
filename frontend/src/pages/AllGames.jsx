import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box } from '@chakra-ui/react';
import { FiSearch, FiX } from 'react-icons/fi';
import LoadingPanel from '../components/common/LoadingPanel';
import ErrorPanel from '../components/common/ErrorPanel';
import EmptyState from '../components/common/EmptyState';
import GameHistoryList from '../components/userProfile/GameHistoryList';
import AllGamesPagination from '../components/allGames/AllGamesPagination';
import BrilliantMovesPanel from '../components/brilliantMoves/BrilliantMovesPanel';
import {
  fetchAllGamesFromDb,
  syncAllGamesFromChessCom,
} from '../services/chessComDbService';
import {
  getBrillianceBatchState,
  isBrillianceBatchRunning,
  isBrillianceComplete,
  startBrillianceBatch,
  stopBrillianceBatch as requestStopBrillianceBatch,
  subscribeBrillianceBatch,
} from '../services/allGamesBrillianceBatch';
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
import './BrilliantMoves.css';

const VIEW_GAMES = 'games';
const VIEW_BRILLIANT = 'brilliant';
const VALID_VIEWS = new Set([VIEW_GAMES, VIEW_BRILLIANT]);

function resolveActiveView(searchParams) {
  const view = searchParams.get('view');
  return VALID_VIEWS.has(view) ? view : VIEW_GAMES;
}

const POLL_MS = 4000;
const STATUS_POLL_MS = 3000;
const MAX_POLL_ATTEMPTS = 80;
const GAMES_PER_PAGE = 50;

function gameOwnerUsername(game) {
  return game?.chessComId || (game?.isWhite ? game?.white : game?.black) || null;
}

function gameMatchesSearch(game, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    game?.white,
    game?.black,
    game?.chessComId,
    game?.timeClass,
    game?.timeControl,
    game?.resultNotation,
    game?.resultType,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

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

function currentRunningStage(run) {
  const statuses = stageStatuses(run);
  const runningIdx = statuses.findIndex((s) => s === 'running');
  if (runningIdx >= 0) return runningIdx;
  if (run?.pipelineStatus === 'running' && run?.currentStage != null) {
    return Number(run.currentStage);
  }
  return null;
}

function stage4MoveCount(game) {
  const run = game?.brillianceRun;
  if (!run) return 0;
  return Number(run.stage4AnalyzedCount) || 0;
}

/** Segment visual state for the Review stage bar. */
function stageBarSegmentState(statuses, n, { isCurrent, isQueued, pipelinePassed } = {}) {
  const status = statuses[n];
  if (status === 'failed') return 'fail';
  if (pipelinePassed) return n === 4 ? 'pass' : 'done';
  if (status === 'completed') return n === 4 ? 'pass' : 'done';

  const runningIdx = statuses.findIndex((s) => s === 'running');
  if (status === 'running' || (isCurrent && runningIdx === n)) return 'active';
  if (isCurrent && runningIdx < 0 && n === 0 && !statuses.some((s) => s === 'completed')) {
    return 'active';
  }
  if (isQueued) return 'queued';
  return 'idle';
}

/** Status chip for games that were already reviewed (analysis runs on game open). */
function getBrillianceStageDisplay(game, batchMeta = null) {
  const run = game?.brillianceRun;
  const statuses = stageStatuses(run);
  const isCurrent = Boolean(batchMeta?.isCurrent);
  const isQueued = Boolean(batchMeta?.isQueued);
  const batchFailed = Boolean(batchMeta?.batchFailed);

  if (isCurrent) {
    const stageN = currentRunningStage(run);
    return {
      label: stageN == null ? 'Running…' : `Running S${stageN}`,
      tone: 'running',
      title: 'This game is analyzing now (stages 0–4)',
      live: true,
    };
  }

  if (batchFailed) {
    return { label: 'Batch failed', tone: 'fail', title: 'Failed during Run All Brilliance' };
  }

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

  if (isQueued) {
    return {
      label: 'Queued',
      tone: 'queued',
      title: 'Waiting in Run All Brilliance queue',
      live: true,
    };
  }

  const runningIdx = statuses.findIndex((s) => s === 'running');
  if (runningIdx >= 0 || run?.pipelineStatus === 'running') {
    return {
      label: `Stage ${runningIdx >= 0 ? runningIdx : run?.currentStage ?? 0}`,
      tone: 'running',
      title: 'Analysis in progress',
      live: true,
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
      live: true,
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
  const activeView = resolveActiveView(searchParams);
  const isGamesView = activeView === VIEW_GAMES;
  const filterLabels = useMemo(() => buildFilterLabels(), []);

  const [allGames, setAllGames] = useState([]);
  const [playersCount, setPlayersCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [brillianceBatch, setBrillianceBatch] = useState(() => getBrillianceBatchState());
  const [brilliantStats, setBrilliantStats] = useState({
    reviewed: 0,
    brilliant: 0,
    loading: true,
  });

  const syncPollTimerRef = useRef(null);
  const statusPollTimerRef = useRef(null);
  const activeFilterRef = useRef(activeFilter);
  const activeViewRef = useRef(activeView);
  const refreshBrillianceStatusesRef = useRef(null);
  const mountedRef = useRef(true);

  activeFilterRef.current = activeFilter;
  activeViewRef.current = activeView;

  const dayFilteredGames = useMemo(
    () => filterGamesByDay(allGames, activeFilter),
    [allGames, activeFilter]
  );

  const filteredGames = useMemo(
    () => dayFilteredGames.filter((game) => gameMatchesSearch(game, searchQuery)),
    [dayFilteredGames, searchQuery]
  );

  const pagination = useClientPagination(filteredGames, GAMES_PER_PAGE);

  const dateLabel = useMemo(
    () => filterLabelForKey(activeFilter, filterLabels),
    [activeFilter, filterLabels]
  );

  const patchSearchParams = useCallback(
    (patch) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([key, value]) => {
            if (value == null || value === '') next.delete(key);
            else next.set(key, value);
          });
          // Defaults omitted from URL for cleaner links.
          if (next.get('day') === 'today') next.delete('day');
          if (next.get('view') === VIEW_GAMES) next.delete('view');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setActiveFilter = useCallback(
    (day) => {
      if (!VALID_DAY_KEYS.has(day) || day === activeFilterRef.current) return;
      patchSearchParams({ day });
    },
    [patchSearchParams]
  );

  const setActiveView = useCallback(
    (view) => {
      if (!VALID_VIEWS.has(view) || view === activeViewRef.current) return;
      patchSearchParams({ view });
    },
    [patchSearchParams]
  );

  useEffect(() => {
    pagination.setPage(1);
  }, [activeFilter, activeView, searchQuery, pagination.setPage]);

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
        const stillNeeded =
          isBrillianceBatchRunning() ||
          (data.games || []).some(gameNeedsStatusPoll);
        if (!stillNeeded) clearStatusPoll();
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

  refreshBrillianceStatusesRef.current = refreshBrillianceStatuses;

  const stopBrillianceBatch = useCallback(() => {
    requestStopBrillianceBatch();
  }, []);

  const runAllBrilliance = useCallback(() => {
    if (isBrillianceBatchRunning()) return;
    setError(null);
    startStatusPolling();

    // Fire-and-forget: module-level runner keeps going across pagination / route changes.
    // Use day filter only — search shouldn't shrink the Run All queue.
    void startBrillianceBatch(dayFilteredGames, {
      onAfterGame: async () => {
        if (!mountedRef.current || !refreshBrillianceStatusesRef.current) return;
        try {
          await refreshBrillianceStatusesRef.current();
        } catch {
          /* keep going */
        }
      },
    }).then(async () => {
      if (!mountedRef.current || !refreshBrillianceStatusesRef.current) return;
      try {
        const data = await refreshBrillianceStatusesRef.current();
        if ((data.games || []).some(gameNeedsStatusPoll)) startStatusPolling();
        else clearStatusPoll();
      } catch {
        /* ignore */
      }
    });
  }, [clearStatusPoll, dayFilteredGames, startStatusPolling]);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = subscribeBrillianceBatch((next) => {
      setBrillianceBatch(next);
      if (next?.running) startStatusPolling();
    });

    if (isBrillianceBatchRunning()) startStatusPolling();

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [startStatusPolling]);

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
        else if (
          isBrillianceBatchRunning() ||
          (quick.games || []).some(gameNeedsStatusPoll)
        ) {
          startStatusPolling();
        }

        const full = await fetchAllGames('all');
        if (cancelled) return;
        applyAllGamesPayload(full);
        if (full.syncInProgress) startPolling();
        else if (
          isBrillianceBatchRunning() ||
          (full.games || []).some(gameNeedsStatusPoll)
        ) {
          startStatusPolling();
        }
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
      // Do NOT cancel the brilliance batch — it keeps running in the background.
      clearPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const handleSelect = useCallback(
    (game) => {
      const owner = gameOwnerUsername(game);
      if (!owner) return;
      openChessComGame(navigate, owner, game);
    },
    [navigate]
  );

  const batchLookup = useMemo(() => {
    if (!brillianceBatch) return null;
    const queueSet = new Set(brillianceBatch.queueUuids || []);
    const doneSet = new Set(brillianceBatch.doneUuids || []);
    const failedSet = new Set(brillianceBatch.failedUuids || []);
    return {
      currentUuid: brillianceBatch.currentUuid || null,
      running: Boolean(brillianceBatch.running),
      queueSet,
      doneSet,
      failedSet,
    };
  }, [brillianceBatch]);

  const getBatchMeta = useCallback(
    (game) => {
      if (!batchLookup || !game?.uuid) return null;
      const { currentUuid, running, queueSet, doneSet, failedSet } = batchLookup;
      if (!queueSet.has(game.uuid) && !doneSet.has(game.uuid) && !failedSet.has(game.uuid)) {
        return null;
      }
      return {
        isCurrent: running && currentUuid === game.uuid,
        isQueued:
          running &&
          queueSet.has(game.uuid) &&
          currentUuid !== game.uuid &&
          !doneSet.has(game.uuid) &&
          !failedSet.has(game.uuid),
        batchFailed: failedSet.has(game.uuid),
        batchDone: doneSet.has(game.uuid),
      };
    },
    [batchLookup]
  );

  const renderAccuracyColumn = useCallback((game) => {
    const run = game?.brillianceRun;
    const s4Moves = stage4MoveCount(game);
    const brilliant = Number(run?.stage4BrilliantCount) || 0;
    const complete = isBrillianceComplete(game);

    if (!run && !complete) {
      return <span className="all-games-s4-count all-games-s4-count--empty">—</span>;
    }

    return (
      <span
        className={`all-games-s4-count${complete ? ' all-games-s4-count--done' : ''}`}
        title={
          brilliant > 0
            ? `${s4Moves} move${s4Moves === 1 ? '' : 's'} reached Stage 4 · ${brilliant} brilliant`
            : `${s4Moves} move${s4Moves === 1 ? '' : 's'} reached Stage 4`
        }
      >
        <span className="all-games-s4-count-num">{s4Moves}</span>
        {brilliant > 0 ? <span className="all-games-s4-count-brilliant">{brilliant}</span> : null}
      </span>
    );
  }, []);

  const renderBrillianceColumn = useCallback(
    (game) => {
      const batchMeta = getBatchMeta(game);
      const stage = getBrillianceStageDisplay(game, batchMeta);
      const run = game?.brillianceRun;
      const statuses = stageStatuses(run);
      const pipelinePassed =
        run?.stage4Status === 'completed' || run?.pipelineStatus === 'passed';

      return (
        <div
          className={`all-games-stages${
            batchMeta?.isCurrent ? ' all-games-stages--live' : ''
          }${pipelinePassed ? ' all-games-stages--passed' : ''}`}
          title={stage.title}
          aria-label={stage.label}
        >
          {[0, 1, 2, 3, 4].map((n) => {
            const seg = stageBarSegmentState(statuses, n, {
              isCurrent: Boolean(batchMeta?.isCurrent),
              isQueued: Boolean(batchMeta?.isQueued),
              pipelinePassed,
            });
            return (
              <i
                key={n}
                className={`all-games-stage all-games-stage--s${n} all-games-stage--${seg}`}
                title={`S${n}: ${statuses[n] || 'pending'}`}
              />
            );
          })}
        </div>
      );
    },
    [getBatchMeta]
  );

  const getRowClassName = useCallback(
    (game) => {
      const meta = getBatchMeta(game);
      if (meta?.isCurrent) return 'chess-game-row-wrap--brilliance-active';
      if (meta?.isQueued) return 'chess-game-row-wrap--brilliance-queued';
      if (meta?.batchFailed) return 'chess-game-row-wrap--brilliance-failed';
      if (meta?.batchDone) return 'chess-game-row-wrap--brilliance-done';
      return '';
    },
    [getBatchMeta]
  );

  const panelTitle = useMemo(() => {
    const match = DAY_FILTERS.find((filter) => filter.key === activeFilter) || DAY_FILTERS[3];
    return filterButtonLabel(match, filterLabels);
  }, [activeFilter, filterLabels]);

  return (
    <Box
      className={`chess-profile-page all-games-page${
        isGamesView ? '' : ' brilliant-moves-page'
      }`}
    >
      <div className="chess-profile-header-wrap">
        <div className="chess-profile-header-card">
          <div className="chess-profile-name-row">
            <h1 className="chess-profile-username">
              {isGamesView ? 'All Games' : 'Brilliant Moves'}
            </h1>
            {isGamesView ? (
              <div className="all-games-header-actions">
                <button
                  type="button"
                  className="chess-btn chess-btn-secondary"
                  onClick={runSync}
                  disabled={syncing || brillianceBatch?.running}
                >
                  {syncing ? 'Syncing…' : 'Sync from Chess.com'}
                </button>
                {brillianceBatch?.running ? (
                  <button
                    type="button"
                    className="chess-btn chess-btn-secondary"
                    onClick={stopBrillianceBatch}
                    disabled={brillianceBatch.cancelling}
                  >
                    {brillianceBatch.cancelling ? 'Stopping…' : 'Stop Brilliance'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="chess-btn chess-btn-primary"
                    onClick={runAllBrilliance}
                    disabled={syncing || initialLoading || dayFilteredGames.length === 0}
                    title="Run stages 0–4 on each filtered game, one game at a time"
                  >
                    Run All Brilliance
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <div className="all-games-control-box">
            <div className="all-games-control-box__top">
              <div
                className="all-games-view-toggle"
                role="tablist"
                aria-label="Games or brilliant moves"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isGamesView}
                  className={`all-games-view-btn${
                    isGamesView ? ' all-games-view-btn--active' : ''
                  }`}
                  onClick={() => setActiveView(VIEW_GAMES)}
                >
                  All Games
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isGamesView}
                  className={`all-games-view-btn${
                    !isGamesView ? ' all-games-view-btn--active' : ''
                  }`}
                  onClick={() => setActiveView(VIEW_BRILLIANT)}
                >
                  Brilliant Moves
                </button>
              </div>

              {!isGamesView ? (
                <div
                  className="all-games-control-metrics"
                  aria-label="Brilliant move review stats"
                >
                  <div className="all-games-control-metric">
                    <strong>
                      {brilliantStats.loading ? '…' : brilliantStats.reviewed}
                    </strong>
                    <span>Reviewed</span>
                  </div>
                  <div className="all-games-control-metric all-games-control-metric--brilliant">
                    <strong>
                      {brilliantStats.loading ? '…' : brilliantStats.brilliant}
                    </strong>
                    <span>Brilliant</span>
                  </div>
                </div>
              ) : null}
            </div>

            {isGamesView ? (
              <p className="chess-profile-display-name all-games-control-box__status">
                Loaded: {initialLoading ? '…' : allGames.length} games • Showing: {dateLabel} •
                Filtered: {filteredGames.length} • Players tracked: {playersCount}
                {syncing || refreshing ? ' • Refreshing from Chess.com…' : ''}
                {brillianceBatch?.running
                  ? ` • Brilliance ${brillianceBatch.index}/${brillianceBatch.total}${
                      brillianceBatch.currentLabel
                        ? ` · ${brillianceBatch.currentLabel}`
                        : ''
                    } (stages 0–4)`
                  : ''}
                {brillianceBatch?.finished && !brillianceBatch.running
                  ? ` • Brilliance done: ${brillianceBatch.done} ok${
                      brillianceBatch.failed ? `, ${brillianceBatch.failed} failed` : ''
                    }${
                      brillianceBatch.skipped
                        ? `, ${brillianceBatch.skipped} already reviewed`
                        : ''
                    }${brillianceBatch.cancelled ? ' (stopped)' : ''}`
                  : ''}
                {!brillianceBatch?.running ? ' • Click a game to open and review' : ''}
              </p>
            ) : null}

            <div className="all-games-toolbar">
              <div className="all-games-filters" role="tablist" aria-label="Day filters">
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

              {isGamesView ? (
                <label className="all-games-search-wrap">
                  <FiSearch className="all-games-search-icon" aria-hidden />
                  <input
                    type="search"
                    className="all-games-search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search player, time control…"
                    aria-label="Search games"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      className="all-games-search-clear"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                    >
                      <FiX aria-hidden />
                    </button>
                  ) : null}
                </label>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="chess-profile-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <main className="chess-profile-main">
          {isGamesView ? (
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
              {brillianceBatch?.running ? (
                <div className="all-games-live-bar" role="status" aria-live="polite">
                  <span className="all-games-live-bar-pulse" aria-hidden="true" />
                  <div className="all-games-live-bar-main">
                    <strong>
                      Analyzing {brillianceBatch.index}/{brillianceBatch.total}
                    </strong>
                    <span className="all-games-live-bar-game">
                      {brillianceBatch.currentLabel || '…'}
                    </span>
                  </div>
                  <div className="all-games-live-bar-stats">
                    <span>{brillianceBatch.done} done</span>
                    <span>{brillianceBatch.failed} failed</span>
                    <span>
                      {Math.max(0, brillianceBatch.total - brillianceBatch.index)} waiting
                    </span>
                  </div>
                </div>
              ) : null}
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
                      title={
                        searchQuery.trim()
                          ? 'No games match your search.'
                          : 'No games found for this filter.'
                      }
                      subtitle={
                        searchQuery.trim()
                          ? `${dayFilteredGames.length} games on ${dateLabel}. Try another player name.`
                          : allGames.length
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
                      renderAccuracy={renderAccuracyColumn}
                      getRowClassName={getRowClassName}
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
          ) : (
            <BrilliantMovesPanel
              activeFilter={activeFilter}
              filterLabels={filterLabels}
              onStatsChange={setBrilliantStats}
            />
          )}
        </main>
      </div>
    </Box>
  );
}

export default AllGames;
