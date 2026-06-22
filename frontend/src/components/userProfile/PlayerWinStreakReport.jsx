import React, { useEffect, useState } from 'react';
import { IoFlame } from 'react-icons/io5';
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
    return <div className="chess-profile-empty">Loading win streaks…</div>;
  }

  if (error) {
    return <div className="chess-profile-empty chess-win-streak-error">{error}</div>;
  }

  if (!data) {
    return <div className="chess-profile-empty">No win streak data available.</div>;
  }

  const yesterdayGames = data.yesterday?.gameCount ?? 0;
  const allGames = data.allTime?.gameCount ?? 0;

  return (
    <div className="chess-win-streak-report">
      <div className="chess-win-streak-grid">
        <StreakCard
          variant="yesterday"
          label={`Yesterday${data.yesterday?.label ? ` · ${data.yesterday.label}` : ''}`}
          value={yesterdayGames > 0 ? data.yesterday?.highestWinStreak ?? 0 : null}
          meta={`Highest win streak · ${yesterdayGames} game${yesterdayGames === 1 ? '' : 's'}`}
          emptyHint="No games played yesterday."
        />
        <StreakCard
          variant="allTime"
          label="All Games"
          value={allGames > 0 ? data.allTime?.highestWinStreak ?? 0 : null}
          meta={`Highest win streak · ${allGames} game${allGames === 1 ? '' : 's'}`}
          emptyHint="No synced games yet."
        />
      </div>
    </div>
  );
}

export default PlayerWinStreakReport;
