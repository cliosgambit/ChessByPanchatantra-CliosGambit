import React, { useEffect, useState } from 'react';
import { IoFlame } from 'react-icons/io5';
import { FiCheck, FiX } from 'react-icons/fi';
import { fetchChessComWinStreaksFromDb } from '../../services/chessComDbService';

const STREAK_VARIANTS = {
  yesterday: {
    cardClass: 'chess-win-streak-card--yesterday',
    fireClass: 'chess-win-streak-fire--yellow',
  },
  allTime: {
    cardClass: 'chess-win-streak-card--all-time',
    fireClass: 'chess-win-streak-fire--red',
  },
};

function StreakCard({ label, value, meta, emptyHint, variant = 'yesterday' }) {
  const showEmpty = value == null;
  const styles = STREAK_VARIANTS[variant] || STREAK_VARIANTS.yesterday;

  return (
    <div className={`chess-win-streak-card ${styles.cardClass}`}>
      <div className="chess-win-streak-card-head">
        <span className="chess-win-streak-label">{label}</span>
      </div>
      <div className={`chess-win-streak-value-row${showEmpty ? ' chess-win-streak-value-row--empty' : ''}`}>
        {!showEmpty && (
          <IoFlame className={`chess-win-streak-fire chess-win-streak-fire--value ${styles.fireClass}`} aria-hidden="true" />
        )}
        <span className={`chess-win-streak-value${showEmpty ? ' chess-win-streak-value--empty' : ''}`}>
          {showEmpty ? '—' : value}
        </span>
      </div>
      <div className="chess-win-streak-meta">{showEmpty ? emptyHint : meta}</div>
    </div>
  );
}

function MilestoneChips({ milestones = [], emptyLabel }) {
  if (!milestones.length) {
    return <div className="chess-streak-milestones-empty">{emptyLabel}</div>;
  }

  return (
    <div className="chess-streak-milestones" role="list" aria-label="Win streak milestones">
      {milestones.map((m) => (
        <span
          key={m.length}
          role="listitem"
          className={`chess-streak-milestone${m.achieved ? ' chess-streak-milestone--achieved' : ''}`}
          title={
            m.achieved
              ? `Achieved ${m.label}${m.times > 1 ? ` (${m.times}×)` : ''}`
              : `Not yet: ${m.label}`
          }
        >
          {m.achieved ? (
            <FiCheck className="chess-streak-milestone-icon" aria-hidden="true" />
          ) : (
            <FiX className="chess-streak-milestone-icon" aria-hidden="true" />
          )}
          <span className="chess-streak-milestone-label">{m.length} in a row</span>
          {m.achieved && m.times > 0 ? (
            <span className="chess-streak-milestone-times">{m.times}×</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function TimeClassTable({ rows = [] }) {
  if (!rows.length) {
    return <div className="chess-profile-empty">No games in this period.</div>;
  }

  return (
    <div className="chess-streak-class-table-wrap">
      <table className="chess-streak-class-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Games</th>
            <th>W / L / D</th>
            <th>Best streak</th>
            <th>Achieved</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const achieved = (row.milestones || [])
              .filter((m) => m.achieved)
              .map((m) => m.length);
            return (
              <tr key={row.timeClass}>
                <td className="chess-streak-class-name">{row.label || row.timeClass}</td>
                <td>{row.gameCount ?? 0}</td>
                <td>
                  {row.wins ?? 0} / {row.losses ?? 0} / {row.draws ?? 0}
                </td>
                <td className="chess-streak-class-best">
                  <IoFlame className="chess-win-streak-fire chess-win-streak-fire--yellow" aria-hidden="true" />
                  {row.highestWinStreak ?? 0}
                </td>
                <td className="chess-streak-class-achieved">
                  {achieved.length
                    ? (row.milestones || [])
                        .filter((m) => m.achieved)
                        .map((m) => `${m.length}${m.times > 1 ? `×${m.times}` : '✓'}`)
                        .join('  ')
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScopeSection({ title, scope, variant }) {
  const games = scope?.gameCount ?? 0;
  const hasGames = games > 0;

  return (
    <section className="chess-streak-scope">
      <div className="chess-streak-scope-head">
        <h4 className="chess-streak-scope-title">{title}</h4>
        {hasGames ? (
          <span className="chess-streak-scope-meta">
            {games} game{games === 1 ? '' : 's'} · {scope.wins ?? 0}W / {scope.losses ?? 0}L /{' '}
            {scope.draws ?? 0}D
          </span>
        ) : null}
      </div>

      <div className="chess-win-streak-grid chess-win-streak-grid--compact">
        <StreakCard
          variant={variant}
          label="Best win streak"
          value={hasGames ? scope?.highestWinStreak ?? 0 : null}
          meta={
            hasGames
              ? `Longest consecutive wins${scope?.currentWinStreak ? ` · current ${scope.currentWinStreak}` : ''}`
              : undefined
          }
          emptyHint="No games in this period."
        />
        <StreakCard
          variant={variant === 'yesterday' ? 'allTime' : 'yesterday'}
          label="Milestones hit"
          value={
            hasGames
              ? (scope?.milestones || []).filter((m) => m.achieved).length
              : null
          }
          meta={
            hasGames
              ? `${(scope?.milestones || []).filter((m) => m.achieved).length} of ${(scope?.milestones || []).length} streak targets`
              : undefined
          }
          emptyHint="Play games to unlock streak targets."
        />
      </div>

      <div className="chess-streak-block">
        <div className="chess-streak-block-label">Streak achievements</div>
        <MilestoneChips
          milestones={scope?.milestones || []}
          emptyLabel="No streak data yet."
        />
      </div>

      <div className="chess-streak-block">
        <div className="chess-streak-block-label">By time control</div>
        <TimeClassTable rows={scope?.byTimeClass || []} />
      </div>
    </section>
  );
}

function PlayerWinStreakReport({ username }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const safeUsername = decodeURIComponent(username || '').trim();
    if (!safeUsername) {
      setData(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchChessComWinStreaksFromDb(safeUsername)
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load win streaks.');
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [username]);

  if (loading) {
    return <div className="chess-profile-empty">Loading detailed streak report…</div>;
  }

  if (error) {
    return <div className="chess-profile-empty chess-win-streak-error">{error}</div>;
  }

  if (!data) {
    return <div className="chess-profile-empty">No win streak data available.</div>;
  }

  return (
    <div className="chess-win-streak-report">
      <ScopeSection
        title={`Yesterday${data.yesterday?.label ? ` · ${data.yesterday.label}` : ''}`}
        scope={data.yesterday}
        variant="yesterday"
      />
      <ScopeSection title="All-time" scope={data.allTime} variant="allTime" />
    </div>
  );
}

export default PlayerWinStreakReport;
