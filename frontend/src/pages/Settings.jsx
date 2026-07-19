import React, { useCallback, useEffect, useState } from 'react';
import {
  FiActivity,
  FiCheckCircle,
  FiClock,
  FiDatabase,
  FiRefreshCw,
  FiServer,
  FiZap,
} from 'react-icons/fi';
import { apiFetch } from '../utils/apiFetch';
import './Settings.css';

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return '—';
  const n = Number(ms);
  if (n < 1000) return `${n}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

function statusTone({ enabled, inProgress, lastError }) {
  if (!enabled) return 'off';
  if (lastError) return 'error';
  if (inProgress) return 'running';
  return 'idle';
}

function statusLabel(tone) {
  if (tone === 'running') return 'Running';
  if (tone === 'error') return 'Error';
  if (tone === 'off') return 'Off';
  return 'Idle';
}

function jobAccent(jobId) {
  if (jobId === 'chess-com-auto-sync') return 'sync';
  if (jobId === 'chess-com-moves-backfill') return 'moves';
  if (jobId === 'chess-com-stage0') return 'stage0';
  if (jobId === 'chess-com-stage1') return 'stage1';
  if (jobId === 'chess-com-stage2') return 'stage2';
  if (jobId === 'chess-com-stage3') return 'stage3';
  if (jobId === 'chess-com-stage4') return 'stage4';
  if (jobId === 'chess-com-brilliance') return 'brilliance';
  return 'moves';
}

function jobIcon(accent) {
  if (accent === 'sync') return <FiRefreshCw aria-hidden />;
  if (accent === 'stage0' || accent === 'brilliance' || accent === 'stage4') {
    return <FiZap aria-hidden />;
  }
  if (accent === 'stage1' || accent === 'stage2' || accent === 'stage3') {
    return <FiActivity aria-hidden />;
  }
  return <FiDatabase aria-hidden />;
}

function isStageJob(jobId) {
  return /^chess-com-stage[0-4]$/.test(String(jobId || ''));
}

function Settings() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const next = await apiFetch('/api/chess-com/background-jobs');
      setData(next);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load background jobs.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load({ quiet: true }), 5000);
    return () => clearInterval(id);
  }, [load]);

  const quick = data?.quickStats;
  const jobs = data?.jobs || [];
  const pending = Number(quick?.movesBackfill?.pending) || 0;
  const ready = Number(quick?.movesBackfill?.ready) || 0;
  const totalSinceJoin = Number(quick?.movesBackfill?.totalSinceJoin) || 0;
  const progressPct =
    totalSinceJoin > 0 ? Math.min(100, Math.round((ready / totalSinceJoin) * 100)) : 0;

  return (
    <div className="settings-page">
      <div className="settings-bg" aria-hidden />

      <header className="settings-header">
        <div className="settings-toolbar">
          <button
            type="button"
            className="settings-btn"
            onClick={() => load()}
            disabled={loading}
          >
            <FiRefreshCw
              aria-hidden
              className={loading ? 'settings-spin' : undefined}
            />
            Refresh
          </button>
        </div>

        <div className="settings-hero">
          <div className="settings-hero-copy">
            <span className="settings-kicker">
              <FiServer aria-hidden /> Operations
            </span>
            <h1>Workers</h1>
            <p>
              Chess.com auto-sync status. Open a game to review it — brilliance
              Stages 0→4 run on demand when you open the game.
            </p>
          </div>
          <div className="settings-hero-pulse">
            <span
              className={`settings-live-dot ${
                jobs.some((j) => j.inProgress) ? 'settings-live-dot--on' : ''
              }`}
            />
            <div>
              <strong>{jobs.some((j) => j.inProgress) ? 'Workers active' : 'Workers standing by'}</strong>
              <span>Updated {formatWhen(data?.updatedAt)}</span>
            </div>
          </div>
        </div>
      </header>

      {error ? <div className="settings-banner settings-banner--error">{error}</div> : null}

      <section className="settings-section">
        <div className="settings-section-head">
          <h2>Quick stats</h2>
          <span className="settings-chip">Auto-refresh 5s</span>
        </div>

        <div className="settings-stats">
          <article className="settings-stat settings-stat--teal">
            <div className="settings-stat-icon" aria-hidden>
              <FiActivity />
            </div>
            <span className="settings-stat-label">Auto sync</span>
            <strong className="settings-stat-value">
              {quick?.autoSync?.inProgress
                ? 'Syncing…'
                : quick?.autoSync?.enabled
                  ? 'On'
                  : 'Off'}
            </strong>
            <span className="settings-stat-meta">
              Last: {formatWhen(quick?.autoSync?.lastCompletedAt)}
            </span>
          </article>

          <article className="settings-stat settings-stat--amber">
            <div className="settings-stat-icon" aria-hidden>
              <FiDatabase />
            </div>
            <span className="settings-stat-label">Games upserted (last)</span>
            <strong className="settings-stat-value">
              {quick?.autoSync?.lastGamesUpserted ?? '—'}
            </strong>
            <span className="settings-stat-meta">
              {quick?.autoSync?.lastPlayers != null
                ? `${quick.autoSync.lastPlayers} player(s) · ${formatDuration(quick.autoSync.lastDurationMs)}`
                : 'No completed pass yet'}
            </span>
          </article>

          <article className="settings-stat settings-stat--rose">
            <div className="settings-stat-icon" aria-hidden>
              <FiClock />
            </div>
            <span className="settings-stat-label">Moves pending</span>
            <strong className="settings-stat-value">{pending || '—'}</strong>
            <span className="settings-stat-meta">
              Since joining date · {ready} ready
            </span>
          </article>

          <article className="settings-stat settings-stat--emerald">
            <div className="settings-stat-icon" aria-hidden>
              <FiCheckCircle />
            </div>
            <span className="settings-stat-label">Moves ready</span>
            <strong className="settings-stat-value">{ready || '—'}</strong>
            <span className="settings-stat-meta">
              {quick?.movesBackfill?.inProgress
                ? 'Parsing in background…'
                : quick?.movesBackfill?.enabled
                  ? 'Backfill worker on'
                  : 'Worker off'}
            </span>
          </article>
        </div>

        <div className="settings-progress-grid">
          <div className="settings-progress-card">
            <div className="settings-progress-head">
              <div>
                <h3>Move parse coverage</h3>
                <p>Games on/after joining date with move rows stored</p>
              </div>
              <strong>{totalSinceJoin ? `${progressPct}%` : '—'}</strong>
            </div>
            <div
              className="settings-progress-track"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${progressPct}%` }} />
            </div>
            <div className="settings-progress-legend">
              <span>
                <i className="settings-dot settings-dot--ready" /> {ready} ready
              </span>
              <span>
                <i className="settings-dot settings-dot--pending" /> {pending} pending
              </span>
              <span>{totalSinceJoin} total since join</span>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <h2>Background workers</h2>
        </div>

        {loading && !data ? (
          <p className="settings-muted settings-loading">Loading jobs…</p>
        ) : (
          <div className="settings-jobs">
            {jobs.map((job) => {
              const tone = statusTone(job);
              const accent = jobAccent(job.id);
              return (
                <article
                  key={job.id}
                  className={`settings-job settings-job--${accent} settings-job--${tone}`}
                >
                  <div className="settings-job-top">
                    <div className="settings-job-title">
                      <span className={`settings-job-badge settings-job-badge--${accent}`}>
                        {jobIcon(accent)}
                      </span>
                      <div>
                        <h3>{job.label}</h3>
                        <p>{job.description}</p>
                      </div>
                    </div>
                    <span className={`settings-pill settings-pill--${tone}`}>
                      <span className="settings-pill-dot" />
                      {statusLabel(tone)}
                    </span>
                  </div>

                  <dl className="settings-job-grid">
                    <div>
                      <dt>Enabled</dt>
                      <dd>{job.enabled ? 'Yes' : 'No'}</dd>
                    </div>
                    <div>
                      <dt>Runs</dt>
                      <dd>{job.runs ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Last started</dt>
                      <dd>{formatWhen(job.lastStartedAt)}</dd>
                    </div>
                    <div>
                      <dt>Last completed</dt>
                      <dd>{formatWhen(job.lastCompletedAt)}</dd>
                    </div>

                    {job.id === 'chess-com-auto-sync' ? (
                      <>
                        <div>
                          <dt>Interval</dt>
                          <dd>
                            {job.intervalMs
                              ? `${Math.round(job.intervalMs / 1000)}s`
                              : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt>Last archives</dt>
                          <dd>{job.lastResult?.archivesFetched ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>Last games +</dt>
                          <dd>{job.lastResult?.gamesUpserted ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>Last duration</dt>
                          <dd>{formatDuration(job.lastResult?.durationMs)}</dd>
                        </div>
                      </>
                    ) : isStageJob(job.id) ? (
                      <>
                        <div>
                          <dt>Pending</dt>
                          <dd>{job.queue?.pending ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>Pending today</dt>
                          <dd>{job.queue?.pendingToday ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>Pending yesterday</dt>
                          <dd>{job.queue?.pendingYesterday ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>Completed</dt>
                          <dd>{job.queue?.completed ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>Failed</dt>
                          <dd>{job.queue?.failed ?? 0}</dd>
                        </div>
                        <div>
                          <dt>Current player</dt>
                          <dd className="settings-mono">{job.currentChessComId || '—'}</dd>
                        </div>
                        <div>
                          <dt>Lifetime games</dt>
                          <dd>{job.lifetime?.gamesProcessed ?? 0}</dd>
                        </div>
                        <div>
                          <dt>Pass metric</dt>
                          <dd>
                            {job.lifetime?.sacrificeCandidates ??
                              job.lifetime?.proceedToStage2 ??
                              job.lifetime?.proceedToStage3 ??
                              job.lifetime?.soundCount ??
                              job.lifetime?.brilliantMoves ??
                              0}
                          </dd>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <dt>Queue pending</dt>
                          <dd>{job.queue?.movesPending ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>Queue ready</dt>
                          <dd>{job.queue?.movesReady ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>Total since join</dt>
                          <dd>{job.queue?.totalSinceJoin ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>Batch / concurrency</dt>
                          <dd>
                            {job.batchSize ?? '—'} / {job.concurrency ?? '—'}
                          </dd>
                        </div>
                        <div>
                          <dt>Lifetime games</dt>
                          <dd>{job.lifetime?.gamesProcessed ?? 0}</dd>
                        </div>
                        <div>
                          <dt>Lifetime moves +</dt>
                          <dd>{job.lifetime?.movesInserted ?? 0}</dd>
                        </div>
                        <div>
                          <dt>Last batch</dt>
                          <dd>
                            {job.lastBatch?.gamesProcessed ?? 0} games ·{' '}
                            {formatDuration(job.lastBatch?.durationMs)}
                          </dd>
                        </div>
                        <div>
                          <dt>Current player</dt>
                          <dd className="settings-mono">{job.currentChessComId || '—'}</dd>
                        </div>
                      </>
                    )}
                  </dl>

                  {job.lastError ? (
                    <p className="settings-job-error">Last error: {job.lastError}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default Settings;
