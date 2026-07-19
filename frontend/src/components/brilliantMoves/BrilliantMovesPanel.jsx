import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LoadingPanel from '../common/LoadingPanel';
import ErrorPanel from '../common/ErrorPanel';
import EmptyState from '../common/EmptyState';
import BrilliantMovesList from './BrilliantMovesList';
import {
  fetchBrilliantMovesFromDb,
  fetchBrilliancePipelineStatsFromDb,
} from '../../services/chessComDbService';
import {
  filterGamesByDay,
  filterLabelForKey,
  panelTitleForDayFilter,
} from '../../utils/allGamesFilters';
import '../../pages/BrilliantMoves.css';

const STATS_POLL_MS = 1500;

const EMPTY_PIPELINE_STATS = {
  gamesFetched: 0,
  analysisPending: 0,
  analysisRunning: 0,
  analysisCompleted: 0,
  analysisFailed: 0,
  brilliantMovesFound: 0,
  stagesRunning: { stage0: 0, stage1: 0, stage2: 0, stage3: 0, stage4: 0 },
  syncInProgress: false,
};

function formatStagesRunning(stagesRunning) {
  if (!stagesRunning) return '';
  const parts = [];
  if (stagesRunning.stage0) parts.push(`S0:${stagesRunning.stage0}`);
  if (stagesRunning.stage1) parts.push(`S1:${stagesRunning.stage1}`);
  if (stagesRunning.stage2) parts.push(`S2:${stagesRunning.stage2}`);
  if (stagesRunning.stage3) parts.push(`S3:${stagesRunning.stage3}`);
  if (stagesRunning.stage4) parts.push(`S4:${stagesRunning.stage4}`);
  return parts.join(' • ');
}

function liveStatusLabel(stats) {
  if (stats.syncInProgress) return 'Syncing games from Chess.com…';
  if (stats.analysisRunning > 0) {
    const stages = formatStagesRunning(stats.stagesRunning);
    return stages
      ? `Running brilliance analysis (${stages})`
      : `Running brilliance analysis (${stats.analysisRunning} game(s))`;
  }
  if (stats.analysisPending > 0) return `${stats.analysisPending} game(s) waiting for analysis`;
  return 'Live — pipeline idle';
}

/**
 * Brilliant moves list + pipeline stats for a shared day filter.
 * Used inside the merged All Games / Brilliant Moves page.
 */
function BrilliantMovesPanel({ activeFilter, filterLabels }) {
  const [allRows, setAllRows] = useState([]);
  const [pipelineStats, setPipelineStats] = useState(EMPTY_PIPELINE_STATS);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState(null);
  const prevCompletedRef = useRef(0);
  const activeFilterRef = useRef(activeFilter);

  activeFilterRef.current = activeFilter;

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

  const isLiveActive = pipelineStats.syncInProgress || pipelineStats.analysisRunning > 0;

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
    <>
      <div className="brilliant-moves-stats" aria-label="Brilliance pipeline status">
        <div className="brilliant-moves-stat">
          <span className="brilliant-moves-stat-value">
            {statsLoading ? '…' : pipelineStats.gamesFetched}
          </span>
          <span className="brilliant-moves-stat-label">Games fetched</span>
        </div>
        <div className="brilliant-moves-stat brilliant-moves-stat--pending">
          <span className="brilliant-moves-stat-value">
            {statsLoading ? '…' : pipelineStats.analysisPending}
          </span>
          <span className="brilliant-moves-stat-label">Pending analysis</span>
        </div>
        <div className="brilliant-moves-stat brilliant-moves-stat--running">
          <span className="brilliant-moves-stat-value">
            {statsLoading ? '…' : pipelineStats.analysisRunning}
          </span>
          <span className="brilliant-moves-stat-label">Running (S0–S4)</span>
        </div>
        <div className="brilliant-moves-stat brilliant-moves-stat--completed">
          <span className="brilliant-moves-stat-value">
            {statsLoading ? '…' : pipelineStats.analysisCompleted}
          </span>
          <span className="brilliant-moves-stat-label">Analysis done</span>
        </div>
        <div className="brilliant-moves-stat brilliant-moves-stat--failed">
          <span className="brilliant-moves-stat-value">
            {statsLoading ? '…' : pipelineStats.analysisFailed}
          </span>
          <span className="brilliant-moves-stat-label">Failed</span>
        </div>
        <div className="brilliant-moves-stat brilliant-moves-stat--brilliant">
          <span className="brilliant-moves-stat-value">
            {statsLoading ? '…' : pipelineStats.brilliantMovesFound}
          </span>
          <span className="brilliant-moves-stat-label">Brilliant moves</span>
        </div>
        <div
          className={`brilliant-moves-live${isLiveActive ? ' brilliant-moves-live--active' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span className="brilliant-moves-live-dot" aria-hidden="true" />
          <span className="brilliant-moves-live-label">
            {statsLoading ? 'Loading pipeline status…' : liveStatusLabel(pipelineStats)}
          </span>
        </div>
      </div>

      {!statsLoading && pipelineStats.analysisRunning > 0 ? (
        <p className="brilliant-moves-stats-note">
          Active stages: {formatStagesRunning(pipelineStats.stagesRunning) || 'in progress'}
        </p>
      ) : null}

      <section className="chess-profile-panel chess-games-panel">
        <header className="chess-profile-panel-header">
          {panelTitle}
          <span>
            {loading ? '…' : `${filteredRows.length} in list`}
            {!statsLoading
              ? ` • ${pipelineStats.analysisPending} pending • ${pipelineStats.analysisRunning} running • ${pipelineStats.analysisCompleted} done`
              : ''}
          </span>
        </header>
        <div className="chess-profile-panel-body chess-games-panel-body">
          {loading ? (
            <LoadingPanel message="Loading Stage 4 moves…" />
          ) : error ? (
            <ErrorPanel title="Unable to load Stage 4 moves" message={error} />
          ) : filteredRows.length === 0 ? (
            <EmptyState
              title="No Stage 4–passed moves for this filter."
              subtitle={
                statsLoading
                  ? 'Checking pipeline status…'
                  : `${pipelineStats.gamesFetched} games fetched for ${dateLabel}. ${pipelineStats.analysisPending} still pending Stage 0–4 analysis.`
              }
            />
          ) : (
            <BrilliantMovesList rows={filteredRows} />
          )}
        </div>
      </section>
    </>
  );
}

export default BrilliantMovesPanel;
