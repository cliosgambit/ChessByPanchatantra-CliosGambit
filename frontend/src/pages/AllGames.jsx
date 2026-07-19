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
  resolveDayFilter,
  VALID_DAY_FILTER_KEYS,
} from '../utils/allGamesFilters';
import '../components/userProfile/ChessComProfilePage.css';
import './AllGames.css';

const POLL_MS = 4000;
const STATUS_POLL_MS = 3000;
const MAX_POLL_ATTEMPTS = 80;
const GAMES_PER_PAGE = 50;

function gameOwnerUsername(game) {
  return game?.chessComId || (game?.isWhite ? game?.white : game?.black) || null;
}

function isBrillianceComplete(game) {
  const run = game?.brillianceRun;
  return run?.stage4Status === 'completed' || run?.pipelineStatus === 'passed';
}

function gameLabel(game) {
  const white = game?.white || 'White';
  const black = game?.black || 'Black';
  return `${white} vs ${black}`;
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
  const filterLabels = useMemo(() => buildFilterLabels(), []);

  const [allGames, setAllGames] = useState([]);
  const [playersCount, setPlayersCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [brillianceBatch, setBrillianceBatch] = useState(null);

  const syncPollTimerRef = useRef(null);
  const statusPollTimerRef = useRef(null);
  const activeFilterRef = useRef(activeFilter);
  const brillianceCancelRef = useRef(false);
  const brillianceRunningRef = useRef(false);

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

  const stopBrillianceBatch = useCallback(() => {
    brillianceCancelRef.current = true;
    setBrillianceBatch((prev) =>
      prev?.running ? { ...prev, cancelling: true } : prev
    );
  }, []);

  const runAllBrilliance = useCallback(async () => {
    if (brillianceRunningRef.current) return;

    const queue = filteredGames.filter((game) => {
      const owner = gameOwnerUsername(game);
      return Boolean(owner && game?.uuid && !isBrillianceComplete(game));
    });

    if (queue.length === 0) {
      setError(null);
      setBrillianceBatch({
        running: false,
        index: 0,
        total: 0,
        currentLabel: null,
        done: 0,
        failed: 0,
        skipped: filteredGames.length,
        finished: true,
      });
      return;
    }

    brillianceRunningRef.current = true;
    brillianceCancelRef.current = false;
    setError(null);
    startStatusPolling();

    let done = 0;
    let failed = 0;

    const queueUuids = queue.map((g) => g.uuid);
    const failedUuids = new Set();
    const doneUuids = new Set();

    setBrillianceBatch({
      running: true,
      cancelling: false,
      index: 0,
      total: queue.length,
      currentUuid: null,
      currentLabel: null,
      queueUuids,
      doneUuids: [],
      failedUuids: [],
      done: 0,
      failed: 0,
      skipped: filteredGames.length - queue.length,
      finished: false,
    });

    try {
      for (let i = 0; i < queue.length; i += 1) {
        if (brillianceCancelRef.current) break;

        const game = queue[i];
        const owner = gameOwnerUsername(game);
        const label = gameLabel(game);

        setBrillianceBatch((prev) => ({
          ...prev,
          running: true,
          index: i + 1,
          total: queue.length,
          currentUuid: game.uuid,
          currentLabel: label,
          doneUuids: [...doneUuids],
          failedUuids: [...failedUuids],
          done,
          failed,
        }));

        try {
          // One game at a time: backend runs stages 0→4 sequentially.
          await runChessComGameBrilliance(owner, game.uuid, { force: false });
          done += 1;
          doneUuids.add(game.uuid);
        } catch (err) {
          failed += 1;
          failedUuids.add(game.uuid);
          console.error(
            `[all-games] brilliance failed for ${label}:`,
            err?.message || err
          );
        }

        try {
          await refreshBrillianceStatuses();
        } catch {
          /* keep going */
        }
      }
    } finally {
      brillianceRunningRef.current = false;
      const cancelled = brillianceCancelRef.current;
      setBrillianceBatch({
        running: false,
        cancelling: false,
        index: Math.min(done + failed, queue.length),
        total: queue.length,
        currentUuid: null,
        currentLabel: null,
        queueUuids,
        doneUuids: [...doneUuids],
        failedUuids: [...failedUuids],
        done,
        failed,
        skipped: filteredGames.length - queue.length,
        finished: true,
        cancelled,
      });
      try {
        const data = await refreshBrillianceStatuses();
        if ((data.games || []).some(gameNeedsStatusPoll)) startStatusPolling();
        else clearStatusPoll();
      } catch {
        /* ignore */
      }
    }
  }, [
    clearStatusPoll,
    filteredGames,
    refreshBrillianceStatuses,
    startStatusPolling,
  ]);

  // Keep the table on the page that contains the game currently analyzing.
  useEffect(() => {
    const uuid = brillianceBatch?.currentUuid;
    if (!uuid || !brillianceBatch?.running) return;
    const idx = filteredGames.findIndex((g) => g.uuid === uuid);
    if (idx < 0) return;
    const page = Math.floor(idx / GAMES_PER_PAGE) + 1;
    if (page !== pagination.page) pagination.setPage(page);
  }, [
    brillianceBatch?.currentUuid,
    brillianceBatch?.running,
    filteredGames,
    pagination.page,
    pagination.setPage,
  ]);

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
      brillianceCancelRef.current = true;
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
                  disabled={syncing || initialLoading || filteredGames.length === 0}
                  title="Run stages 0–4 on each filtered game, one game at a time"
                >
                  Run All Brilliance
                </button>
              )}
            </div>
          </div>
          <p className="chess-profile-display-name">
            Loaded: {initialLoading ? '…' : allGames.length} games • Showing: {dateLabel} • Filtered:{' '}
            {filteredGames.length} • Players tracked: {playersCount}
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
                    {Math.max(
                      0,
                      brillianceBatch.total - brillianceBatch.index
                    )}{' '}
                    waiting
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
        </main>
      </div>
    </Box>
  );
}

export default AllGames;
